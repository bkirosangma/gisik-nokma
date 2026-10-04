import type { Pool, PoolClient } from 'pg';
import {
  domainRegistry,
  newUlid,
  parseEvent,
  ENTITY_WORKSPACE_MISMATCH_RULE,
  type EventTypeRegistry,
  type IngestErrorCode,
  type IngestResult,
  type LedgerEvent,
  type SubmittedEvent,
  type TicketLink,
  type TicketLinkKind,
} from '@gisik-nokma/domain';
import type { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createEngineContext } from '../engine-context.js';
import type { ServerGate } from '../gates/server-gate.js';
import {
  insertEvent,
  isInvalidUnicodeEscape,
  isUniqueViolation,
  lockEntity,
  lockWorkspace,
  nextSeq,
  nextWorkspaceSeq,
} from '../ledger/event-store.js';
import { checkPermission, type SubmissionGate } from '../permissions/check-permission.js';
import { checkContestCoherence } from '../sync/contest-coherence.js';
import { refreshSnapshotsForWorkflowPublish } from '../sync/snapshot-refresh.js';
import { bootstrapWorkspace } from '../workspaces/bootstrap-workspace.js';
import { readEntityHead } from '../projections/entity-heads.js';
import { checkPurged } from '../purge/check-purged.js';
import { purgedIdsAmong } from '../purge/purged-lookup.js';
import { canSee } from '../visibility/can-see.js';
import type { ProjectionRegistry } from '../projections/registry.js';

export type IngestDeps = {
  pool: Pool;
  evaluate: typeof evaluateEvent;
  projections: ProjectionRegistry;
  registry?: EventTypeRegistry; // defaults to domainRegistry
  now?: () => Date;             // injectable clock for tests
  /**
   * Server-side refusals that need server-owned state the pure rule engine
   * cannot see — the `attachments` table (Plan 7 Task 11). Optional and
   * defaulting to `[]`, so the seam is invisible to every caller that does not
   * use it: Plan 1's ingest suite, the permission suites and the route suites
   * all construct this service without gates and are unchanged by their
   * existence.
   *
   * Construction-time and unconditional — see `../gates/server-gate.ts` for
   * why gates, unlike the permission gate, do not distinguish the doors.
   */
  gates?: ServerGate[];
};

export type CommittedEventListener = (event: LedgerEvent) => void;

/** Why an atomic set is refused before it starts (it files one workspace's events and never founds a workspace). */
export const ATOMIC_SINGLE_WORKSPACE_RULE = 'atomic.single-workspace';
export const ATOMIC_NO_FOUNDING_RULE = 'atomic.no-founding';

/**
 * The rule id of a publish refused because one of its draft's incoming links could not be re-filed on its
 * source (drafts spec R44, Q17). It is the ingest layer's own: the engine never emits it, because it wraps the
 * engine's (or the gate's) verdict on the NESTED `ticket.link_added` in the story of the publish.
 */
export const DRAFT_LINK_REFILE_REFUSED_RULE = 'draft.link-refile-refused';

/**
 * What an atomic set answers. There are no partial results: either every event committed (`results[i]` answers
 * `rawEvents[i]`, all `committed`) or NOTHING did, and `index` and `result` name the FIRST event that stopped it
 * (a refusal or an invalid answer, never a `committed` one, so a caller has no arm it cannot reach).
 * An unexpected infrastructure error rejects the call instead, as on the single path.
 */
export type AtomicOutcome =
  | { status: 'committed'; results: IngestResult[] }
  | { status: 'rolled-back'; index: number; result: Exclude<IngestResult, { status: 'committed' }> };

export type IngestService = {
  /**
   * Processes a batch in order; result[i] answers rawEvents[i]. Each event
   * commits or fails independently — one bad event never rolls back its
   * neighbours.
   *
   * One path breaks the index alignment, and the promise above would be a lie
   * without saying so: an UNEXPECTED infrastructure error (a dead connection, a
   * projection that throws) rejects the whole call, so no results array reaches
   * the caller at all — including the answers already decided for events that
   * COMMITTED. Those neighbours stay committed; the client retries the batch
   * and they answer `duplicate-event-id`, which is a safe ack precisely because
   * the id was client-generated. Envelope errors and rule refusals are NOT this
   * path — they ride inside results as ordinary per-event answers.
   *
   * This is the INTERNAL, trusted door. It applies no permission gate, so the
   * server's own appends — Task 5's workspace bootstrap, Task 14's invite
   * acceptance — may legitimately carry envelope-origin `'server'`. **An HTTP
   * route must never call this; it calls `ingestClientBatch`.**
   *
   * Ungated is NOT the same as inert. A committed `workspace.created` fires the
   * founding sequence through THIS door too, whichever door the founding itself
   * arrived at — that is what lets Plan 11's seed CLIs found a usable workspace
   * by emitting one event, and it is why this method is not a raw append. See
   * `ingestAll`.
   */
  ingestBatch(rawEvents: unknown[]): Promise<IngestResult[]>;
  /**
   * The CLIENT door: identical to `ingestBatch` except that every event is put
   * through `checkPermission` first, so a client cannot forge the envelope's
   * `origin` field — the provenance enum, not the browser `Origin` header — and
   * wear the server's own provenance.
   *
   * Two entry points rather than a flag because the distinguishing fact is
   * which door an event arrived through, not what it says about itself.
   * `POST /v1/events` calls this; **Plan 10's `POST /v1/sync` must call it too**,
   * or offline-originated events bypass the gate entirely.
   *
   * `sessionUserId` is the session the door authenticated — Task 5's widening.
   * It is REQUIRED, not optional, which is the compile-time half of the
   * identity check: a route that has not resolved a session cannot call this at
   * all, so "forgot the preHandler" is a type error rather than a gate that
   * silently judged every claim against `undefined`.
   */
  ingestClientBatch(rawEvents: unknown[], sessionUserId: string): Promise<IngestResult[]>;
  /**
   * Commits an ORDERED set in ONE transaction under one workspace lock (drafts spec R47): every event is judged
   * by the same gates as on the single path, against the state the earlier events of the set left; the first
   * refusal or error rolls the whole set back; the committed listeners fire only after the single COMMIT, in the
   * order given. All events must name one workspace and none may be `workspace.created`. At least one event.
   *
   * This is the INTERNAL, ungated door, like `ingestBatch`; **an HTTP route calls `ingestClientAtomic`.**
   */
  ingestAtomic(rawEvents: unknown[]): Promise<AtomicOutcome>;
  /** The CLIENT door of `ingestAtomic`: every event passes `checkPermission` first, against `sessionUserId`. */
  ingestClientAtomic(rawEvents: unknown[], sessionUserId: string): Promise<AtomicOutcome>;
  /** Broadcast hook: fires AFTER an event's transaction commits, never for
   * refused or invalid events. Returns an unsubscribe function. Plan 5 wires
   * WebSocket fan-out onto this. */
  onEventCommitted(listener: CommittedEventListener): () => void;
};

/**
 * What an HTTP route is allowed to do with ingest: submit through the GATED
 * client door, and subscribe to commits. Deliberately NOT the whole
 * `IngestService`.
 *
 * This exists because the naming asymmetry is adverse: the DANGEROUS door has
 * the shorter, more obvious name. `ingestBatch` is what a route author reaches
 * for by reflex, and reaching for it silently ungates every event that route
 * accepts — for `POST /v1/sync` (Plan 10), every offline-originated event in the
 * product. Prose across three plans and a wave boundary is not a defence a
 * compiler can check, so the internal door is simply not in scope for a route:
 * `ingest.ingestBatch(...)` inside a route handler is now a COMPILE error, not a
 * documented mistake.
 *
 * `ingestBatch` stays exported on `IngestService` for the internal callers that
 * legitimately use it — the workspace bootstrap (Task 5), invite acceptance
 * (Task 14), Plan 11's seed CLIs, and tests.
 *
 * `ingestClientAtomic` joined it with the draft set publish (drafts T5b); `ingestAtomic` stays off for the reason
 * `ingestBatch` is.
 */
export type ClientIngest = Pick<IngestService, 'ingestClientBatch' | 'ingestClientAtomic' | 'onEventCommitted'>;

/**
 * What the client door carries into `commitInTx` (through `commitOne` or `atomic`): the gate, and the session it
 * judges against.
 *
 * ONE nullable rather than two, deliberately. Two covarying parameters —
 * `gate: SubmissionGate | null` beside `sessionUserId: string | null` — would
 * make "a gate with no session" and "a session with no gate" both expressible,
 * and the first of those is a gate comparing every `actorId` against
 * `undefined`: a check that refuses nothing while looking like the identity
 * check. `null` here means the internal door, and it means it exactly once.
 */
type ClientDoor = { gate: SubmissionGate; sessionUserId: string };

/**
 * What `commitOne` answers: the per-event result the caller gets, and — only
 * when it committed — the envelope as it went into the ledger.
 *
 * The envelope is handed back rather than re-read because `workspaceSeq` is the
 * only honest way to ask "did this event FOUND the workspace, or merely land in
 * one". The per-entity `seq` on `IngestResult` cannot answer it: a second
 * `workspace.created` filed against a fresh entity id also carries seq 1.
 */
type CommitOutcome = { result: IngestResult; committed: LedgerEvent | null };

/**
 * What `commitInTx` answers. It never touches the transaction's boundaries: `refused` means "the caller must
 * roll back", `committed` means "the event and its projections are written inside the caller's transaction and
 * are durable only when the caller commits it". The envelope is handed back for the same reason `CommitOutcome`
 * hands it back. `followers` are the events the event itself caused inside the same transaction (the re-filed
 * links of a publish, drafts T6); the caller notifies them after the envelope, in order, after its `COMMIT`.
 */
type InTxOutcome =
  | { kind: 'refused'; result: Extract<IngestResult, { status: 'refused' }> }
  | { kind: 'committed'; envelope: LedgerEvent; result: IngestResult; followers: LedgerEvent[] };

/** One link another ticket filed toward a DRAFT from the draft's side (drafts spec R42): its kind and its source. */
type IncomingLink = { kind: TicketLinkKind; sourceId: string };

/**
 * The links other tickets filed toward this DRAFT (drafts spec R42): the `from` entries of its head row, minus
 * sources that were erased (nothing is left to file for them; the purge removed the rows, drafts T6 decision 10).
 * Read before the `ticket.published` fold, which drops these entries from the very row this reads.
 */
async function incomingDraftLinks(client: PoolClient, draftId: string): Promise<IncomingLink[]> {
  const { rows } = await client.query<{ links: TicketLink[] }>('SELECT links FROM proj_tickets WHERE ticket_id = $1', [draftId]);
  const held = (rows[0]?.links ?? []).filter((l): l is TicketLink & { from: string } => l.from !== undefined);
  const erased = await purgedIdsAmong(client, 'ticket', held.map((l) => l.from));
  return held.filter((l) => !erased.has(l.from)).map((l) => ({ kind: l.kind, sourceId: l.from }));
}

/**
 * The plain link the publish files on the source's stream (R44): the publisher as actor, the publish's own
 * origin (`'server'` would be refused by the client door's envelope-origin rule, drafts T6 decision 7).
 */
function refileEvent(publish: LedgerEvent, link: IncomingLink): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId: publish.workspaceId,
    entity: { kind: 'ticket', id: link.sourceId },
    type: 'ticket.link_added',
    version: 1,
    payload: { kind: link.kind, targetId: publish.entity.id },
    actorId: publish.actorId,
    origin: publish.origin,
    clientTime: publish.clientTime,
  };
}

/** The phrase a publish's refusal names a source with when the publisher cannot see it (drafts T6 decision 12). */
const UNSEEN_SOURCE = 'a ticket you can no longer see';

/**
 * The publish's refusal when a nested re-file was refused. The source is named by its title when the internal
 * door ran or the publisher can still see it, and by a fixed phrase otherwise: the cause is the nested verdict's
 * own reason, and a hidden source must not leak through its title. The nested verdict is always a refusal
 * (`InTxOutcome`): a server-built payload from stored entries never fails the parse, and a thrown error aborts
 * the whole transaction rather than coming back here.
 */
async function refileRefusal(
  client: PoolClient,
  publish: LedgerEvent,
  link: IncomingLink,
  refused: Extract<IngestResult, { status: 'refused' }>,
  door: ClientDoor | null,
): Promise<Extract<IngestResult, { status: 'refused' }>> {
  const visible = door === null || (await canSee(client, door.sessionUserId, link.sourceId));
  const { rows } = await client.query<{ title: string | null }>(
    `SELECT fields -> 'title' ->> 'value' AS title FROM proj_tickets WHERE ticket_id = $1`,
    [link.sourceId],
  );
  const title = rows[0]?.title;
  const name = visible && title ? `"${title}"` : UNSEEN_SOURCE;
  return {
    status: 'refused',
    eventId: publish.id,
    rule: DRAFT_LINK_REFILE_REFUSED_RULE,
    reason: `The link from ${name} to this draft could not be filed there: ${refused.reason}`,
  };
}

export function createIngestService(deps: IngestDeps): IngestService {
  const registry = deps.registry ?? domainRegistry;
  const now = deps.now ?? (() => new Date());
  const gates = deps.gates ?? [];
  const listeners = new Set<CommittedEventListener>();

  function notifyCommitted(event: LedgerEvent): void {
    for (const listener of listeners) {
      try {
        listener(event);
      } catch {
        // A broken listener must never break ingest or starve other
        // listeners; Plan 5 adds logging when the broadcast layer arrives.
      }
    }
  }

  /**
   * Judge and append ONE event inside a transaction the CALLER owns (drafts spec R47). This is everything
   * `commitOne` did, minus `BEGIN`, `COMMIT`, `ROLLBACK` and the listener call, so that `commitOne` (one event, one
   * transaction) and `atomic` (a set, one transaction) share one body and cannot drift. Every read goes through
   * `client`, never `deps.pool` (purge check, the door gate, the engine context, the server gates, the
   * projections), which is what lets a later event of a set see an earlier one's uncommitted writes under READ
   * COMMITTED.
   *
   * A `ticket.published` also re-files its draft's incoming links by calling itself (drafts T6); the nested events
   * are returned as `followers`.
   */
  async function commitInTx(client: PoolClient, submitted: SubmittedEvent, door: ClientDoor | null): Promise<InTxOutcome> {
    // Lock order is always workspace first, then entity — one global order
    // across the whole server, so two ingests can never deadlock by taking
    // the pair in opposite orders.
    await lockWorkspace(client, submitted.workspaceId);
    await lockEntity(client, submitted.entity.kind, submitted.entity.id);
    const workspaceSeq = await nextWorkspaceSeq(client, submitted.workspaceId);
    const seq = await nextSeq(client, submitted.entity.kind, submitted.entity.id);
    const serverTime = now().toISOString();
    const envelope: LedgerEvent = { ...submitted, serverTime, seq, workspaceSeq };

    // An entity belongs to one workspace. Nothing before this point says so:
    // the envelope carries workspaceId per event, so a second event on the
    // same entity naming a different workspace parses cleanly and commits,
    // and the head row's workspace_id — the tenant boundary every scoped read
    // trusts — flips with it. The ledger is append-only, so a mis-filed event
    // can never be taken back, only superseded (coordination doc §11).
    //
    // Placed after lockWorkspace + lockEntity and before deps.evaluate: the
    // entity lock is what makes the read race-safe under READ COMMITTED (any
    // concurrent ingest for this entity has already committed or is still
    // waiting), and refusing before the engine keeps the rules judging only
    // events that are honestly about this entity.
    //
    // This is a SERVER-SIDE refusal, deliberately not an engine rule, and it
    // is not in the shared fixture suite. Client replicas are workspace-
    // scoped: a replica holds one workspace's events and cannot see that an
    // entity id is already bound elsewhere, so an engine check would make
    // client and server disagree by construction — the same argument that
    // settled the state-mapping occupancy question. Plan 10's offline replica
    // therefore mirrors this KNOWINGLY, as a server-only door, rather than
    // finding it in the fixtures.
    const head = await readEntityHead(client, envelope.entity.kind, envelope.entity.id);
    if (head !== null && head.workspaceId !== envelope.workspaceId) {
      return {
        kind: 'refused',
        result: {
          status: 'refused',
          eventId: envelope.id,
          rule: ENTITY_WORKSPACE_MISMATCH_RULE,
          reason: `This ${envelope.entity.kind} belongs to workspace ${head.workspaceId}; this event files it under workspace ${envelope.workspaceId}. An entity cannot move between workspaces.`,
        },
      };
    }

    // Trash series Plan 2 (spec §5.7, server half; deviation D10). BOTH
    // doors, like `checkContestCoherence` below. The internal door needs it:
    // an offline claim refused on a ticket comes back as a server-appended
    // `claim.contested` on that ticket through `serverAppend`
    // (`sync/sync-service.ts`), and against a PURGED ticket that append would
    // write the purged entity back into the ledger with the claim embedded.
    // Before the permission gate: a purged workspace has no members left, and
    // "you are not a member" would name the wrong fault. Also refuses
    // `purge.completed` from anyone — the purge appends it directly.
    const purgedRefusal = await checkPurged(client, envelope);
    if (purgedRefusal !== null) {
      return {
        kind: 'refused',
        result: { status: 'refused', eventId: envelope.id, rule: purgedRefusal.rule, reason: purgedRefusal.reason },
      };
    }

    // The permission gate, and `gate` is null for every internal append.
    //
    // Position is a recorded ruling, not a preference (coordination doc, "A
    // forgeable `origin`…" and "The gate's placement was contradicted by a
    // brief"): the gate lives INSIDE the ingest path — here, after the
    // entity↔workspace guard and before the engine — rather than at the HTTP
    // route. Decision 15 is what makes that load-bearing: Plan 10's
    // `POST /v1/sync` wraps this same ingest, so a permission refusal on the
    // sync path can become a `claim.contested` with no extra wiring. A gate
    // that lived in the route would be bypassed by sync entirely.
    //
    // It runs before deps.evaluate because permissions are the system's
    // rules, not a workflow's: a permission refusal should never reach the
    // rule engine. It runs after the entity↔workspace guard, so an event that
    // is not honestly about its entity is told that first — the refusal that
    // names the actual fault.
    //
    // Per-call rather than baked into the service, because the distinguishing
    // fact is which door the event arrived through. See
    // ../permissions/check-permission.ts for which doors this closes and,
    // more importantly, which it does not.
    const refusal =
      door === null
        ? null
        : // `client`, NOT `deps.pool`. The role lookup runs inside THIS
          // transaction, which already holds the workspace and entity locks,
          // so it reads the world this event is about to be judged against.
          // Handing it the pool instead would compile and pass every test
          // while opening a window in which a concurrently-committed
          // `membership.revoked` is invisible to the gate judging the revoked
          // person's next claim.
          await door.gate(envelope, { db: client, sessionUserId: door.sessionUserId });
    if (refusal !== null) {
      return {
        kind: 'refused',
        result: { status: 'refused', eventId: envelope.id, rule: refusal.rule, reason: refusal.reason },
      };
    }

    // The §11 envelope-coherence closer (Plan 10 Task 4). A `claim.contested`
    // embeds the refused claim WHOLE, and until this line nothing compared the
    // embedded claim against the envelope carrying it: a contest filed on a
    // real ticket in its real workspace could embed a fabricated claim naming
    // any other ticket in any other workspace, and every layer accepted it.
    // See ../sync/contest-coherence.ts for exactly what is bound and what is
    // deliberately not.
    //
    // UNCONDITIONAL — it runs on BOTH doors, and that is the difference
    // between this check and the envelope-origin gate above. The gate must
    // distinguish doors because the server's own appends are legitimately
    // server-origin; there is no legitimate append, from any door, of a
    // contest whose embedded claim is about a different ticket. So it is not
    // carried in `door` and it is not `IngestDeps.gates` either (decision 15's
    // gates are construction-time and unconditional, which is right here, but
    // Plan 7 owns that field's contract and this predates it).
    //
    // Placed AFTER the permission gate and before `deps.evaluate`: a client
    // that has forged its provenance is told that first — the refusal that
    // names the fault it can actually fix — and this sits beside
    // `contest.server-only`, the engine rule it complements. server-only says
    // who may file a contest; this says what a filing must be about.
    const incoherent = checkContestCoherence(envelope);
    if (incoherent !== null) {
      return {
        kind: 'refused',
        result: {
          status: 'refused',
          eventId: envelope.id,
          rule: incoherent.rule,
          reason: incoherent.reason,
        },
      };
    }

    const verdict = await deps.evaluate(envelope, createEngineContext(client));
    if (verdict.refused) {
      return {
        kind: 'refused',
        result: { status: 'refused', eventId: envelope.id, rule: verdict.rule, reason: verdict.reason },
      };
    }

    // The server gates (Plan 7 Task 11). They run HERE — after the engine has
    // accepted and before anything is appended — and the position is the
    // whole point of the seam.
    //
    // Inside the transaction, reading through `client` and never
    // `deps.pool`. A gate handed the pool would compile, pass every
    // single-event test, and judge a world one connection away from the one
    // this event is about to join. `test/gates/gate-seam.test.ts` pins the
    // handle by writing a marker row from inside a gate and proving the
    // ROLLBACK took it back — a write through the pool would autocommit and
    // survive.
    //
    // A refusal here is the SAME path as an engine refusal: ROLLBACK, no
    // append, no projection, no listener, the standard refused shape. It
    // rolls back THIS event's transaction and no other — `commitOne` takes a
    // connection per event (`atomic` takes one for the whole set, and a gate
    // refusal there rolls the set back), so a gate refusal in the middle of a batch leaves
    // its committed neighbours committed and lets the events after it be
    // judged on their own. That is deliberate and is pinned in
    // `test/gates/gate-seam.test.ts`; the alternative — one gate refusal
    // discarding a whole sync push — would make an offline client's
    // legitimate work vanish because one of its documents named a stale
    // attachment.
    for (const gate of gates) {
      if (gate.eventType !== submitted.type) continue;
      const gateRefusal = await gate.check(submitted, client);
      if (gateRefusal !== null) {
        return {
          kind: 'refused',
          result: {
            status: 'refused',
            eventId: envelope.id,
            rule: gateRefusal.rule,
            reason: gateRefusal.reason,
          },
        };
      }
    }

    await insertEvent(client, envelope);
    // REFRESH ON PUBLISH, SNAPSHOT DOOR — before the projections, and both
    // halves of that are load-bearing.
    //
    // Not a projection: `snapshots` is not a `proj_` table, so
    // `verify-projections.ts` makes no shadow copy of it and an unqualified
    // write from inside a projection escapes `search_path` to write LIVE
    // during a verify. Not after the loop either: `proj_tickets`'s own
    // refresh-on-publish sets exactly the rows this selects to the new
    // version, so running second would match nothing and be a silent no-op.
    // `snapshot-refresh.ts` carries the argument in full.
    //
    // The outcome is discarded here and that is the one thing this call site
    // gives up: a ticket whose fold could not be walked forward keeps its
    // stale snapshot and says so only in the returned value, and ingest has
    // no logger to put it in.
    await refreshSnapshotsForWorkflowPublish(client, envelope);
    // Drafts R44. Read BEFORE the fold: `ticket.published` drops the draft-side entries from the row.
    const incoming = envelope.type === 'ticket.published' ? await incomingDraftLinks(client, envelope.entity.id) : [];
    for (const projection of deps.projections.all()) {
      await projection.apply(envelope, client);
    }
    // The publish's second half, in the SAME transaction (R44): each incoming link is filed on its source's stream
    // through `commitInTx` itself, so it passes the purge check, the publisher's door gate (rule 6 against the
    // source again), the engine and the server gates. The draft is already published here, so a plain link naming
    // it is accepted. A refusal refuses the publish; the caller rolls everything back.
    const followers: LedgerEvent[] = [];
    for (const link of incoming) {
      const refiled = await commitInTx(client, refileEvent(envelope, link), door);
      if (refiled.kind === 'refused') {
        return { kind: 'refused', result: await refileRefusal(client, envelope, link, refiled.result, door) };
      }
      followers.push(refiled.envelope, ...refiled.followers);
    }
    return { kind: 'committed', envelope, followers, result: { status: 'committed', eventId: envelope.id, seq, serverTime } };
  }

  /**
   * The two failures that are provable only once a transaction runs, so they cannot be refused at parse time:
   * moved out of `commitOne`'s catch so the single path and the atomic path answer them in the same words.
   * `null` means "not one of these": the caller rethrows. The duplicate answer stays truthful even after a failed
   * ROLLBACK: a unique violation proves a prior transaction committed that id.
   */
  function answerThrown(error: unknown, submitted: SubmittedEvent): Extract<IngestResult, { status: 'invalid' }> | null {
    if (isUniqueViolation(error, 'events_pkey')) {
      return {
        status: 'invalid',
        eventId: submitted.id,
        code: 'duplicate-event-id',
        message: `an event with id ${submitted.id} is already in the ledger`,
      };
    }
    // E6-18 — the SAME shape as the duplicate-id arm above and for the same
    // reason: this is a failure provable only once the transaction runs, not
    // at parse time, so it is caught here rather than refused earlier by a
    // schema. Narrow by design (SQLSTATE 22P05 only, nothing wider) — see
    // `isInvalidUnicodeEscape`'s own docblock.
    if (isInvalidUnicodeEscape(error)) {
      return {
        status: 'invalid',
        eventId: submitted.id,
        code: 'invalid-byte',
        message: `event ${submitted.id}'s payload contains a byte (U+0000) Postgres cannot store`,
      };
    }
    return null;
  }

  async function commitOne(submitted: SubmittedEvent, door: ClientDoor | null): Promise<CommitOutcome> {
    const client = await deps.pool.connect();
    let rollbackFailure: Error | undefined;
    try {
      await client.query('BEGIN');
      const outcome = await commitInTx(client, submitted, door);
      if (outcome.kind === 'refused') {
        await client.query('ROLLBACK');
        return { result: outcome.result, committed: null };
      }
      await client.query('COMMIT');
      notifyCommitted(outcome.envelope);
      for (const follower of outcome.followers) notifyCommitted(follower);
      return { result: outcome.result, committed: outcome.envelope };
    } catch (error) {
      // A ROLLBACK on a dead connection throws, and an unguarded one would
      // replace the root-cause error with its own AND skip the duplicate check
      // below — turning a truthful duplicate-event-id answer into an opaque
      // rejection of the whole batch. The duplicate answer stays truthful even
      // here: a unique violation proves a prior transaction committed that id.
      await client.query('ROLLBACK').catch((failure: unknown) => {
        rollbackFailure = failure instanceof Error ? failure : new Error(String(failure));
      });
      const answer = answerThrown(error, submitted);
      if (answer !== null) return { result: answer, committed: null };
      throw error;
    } finally {
      // Releasing with the error destroys the connection instead of returning
      // it to the pool: a client whose ROLLBACK failed is still inside an
      // aborted transaction, and the next borrower would inherit it.
      client.release(rollbackFailure);
    }
  }

  /**
   * `ingestBatch` and `ingestClientBatch` are this loop; they differ only in the gate they carry. (The atomic pair,
   * `ingestAtomic` and `ingestClientAtomic`, is `atomic` below: one transaction for the whole set.)
   * Parsing stays ahead of the gate so a submission that is not a well-formed
   * claim at all is answered as `invalid` rather than as a permission refusal —
   * and so a refused event always has a real ULID `eventId` to report.
   */
  async function ingestAll(rawEvents: unknown[], door: ClientDoor | null): Promise<IngestResult[]> {
    const results: IngestResult[] = [];
    for (const raw of rawEvents) {
      const parsed = parseEvent(raw, registry);
      if (!parsed.ok) {
        results.push({
          status: 'invalid',
          eventId: parsed.eventId,
          code: parsed.code,
          message: parsed.message,
        });
        continue;
      }
      const { result, committed } = await commitOne(parsed.event, door);
      results.push(result);

      // The founding sequence (Task 5). Three things about this placement are
      // load-bearing and an editor must not rearrange them:
      //
      // 1. It fires ON ACCEPT, NEVER ON DUPLICATE, and only for the event that
      //    actually FOUNDED the workspace. Both of Plan 11's seed CLIs re-run
      //    by re-submitting the same deterministic `workspace.created` id and
      //    counting `duplicate-event-id` as "already present"; hooked to
      //    anything looser than a commit, every re-run would append a second
      //    workflow and four more type definitions.
      //
      //    `workspaceSeq === 1` is the founding test, and the per-entity `seq`
      //    is NOT: a second `workspace.created` filed against a FRESH entity id
      //    under an existing workspace also carries seq 1, and bootstrapping it
      //    grants its submitter `owner`. The client door refuses that event
      //    outright (`PermissionContext.workspaceExists`); this condition is
      //    what stops the INTERNAL door — which has no gate by design, and
      //    which Plan 11's seeds and Task 13 both use — from doing the same
      //    thing without one.
      // 2. It lives in the SHARED ingest path, not in a route. `POST
      //    /v1/workspaces` (Task 13) and Plan 11's seed CLIs both found
      //    workspaces and have exactly one founding sequence between them
      //    because both come through here. Moving it to the route layer
      //    silently breaks the seeds.
      // 3. It appends through the INTERNAL door — `null`, no gate. The
      //    sequence is server-origin, and `checkRolePermission` refuses
      //    server-origin at the client door by design. Passing `door` here
      //    instead of `null` would refuse every workspace's own bootstrap and
      //    leave the workspace unusable, which is the failure the decision
      //    exists to prevent.
      //
      // Its results are deliberately NOT pushed onto `results`: the array is
      // index-aligned with `rawEvents`, and the server's own appends are not
      // answers to anything the client submitted. `bootstrapWorkspace` throws
      // rather than returning a value nobody reads.
      if (committed !== null && committed.type === 'workspace.created' && committed.workspaceSeq === 1) {
        await bootstrapWorkspace(committed, (events) => ingestAll(events, null));
      }
    }
    return results;
  }

  function atomicShapeRefusal(event: SubmittedEvent, workspaceId: string): { rule: string; reason: string } | null {
    if (event.workspaceId !== workspaceId) {
      return {
        rule: ATOMIC_SINGLE_WORKSPACE_RULE,
        reason: 'An atomic set files every event under one workspace; this event names a different one.',
      };
    }
    if (event.type === 'workspace.created') {
      return { rule: ATOMIC_NO_FOUNDING_RULE, reason: 'A workspace is founded on its own, not inside an atomic set.' };
    }
    return null;
  }

  /**
   * One BEGIN, the workspace lock once, `commitInTx` per event in the given order, one COMMIT, then the listeners
   * in order. Parsing and the shape checks come first and touch no connection, so a malformed set costs nothing.
   * Placement of the listener loop AFTER the COMMIT is the whole point of moving `notifyCommitted` out of
   * `commitInTx`: a set that rolled back is invisible to the fan-out, the stream and the snapshot writer.
   *
   * The workspace lock is taken here before the loop, and `commitInTx` takes it again per event:
   * `pg_advisory_xact_lock` is re-entrant inside one session, so the second call is free, and the lock order
   * (workspace, then each entity in the order given) stays the server's one global order.
   */
  async function atomic(rawEvents: unknown[], door: ClientDoor | null): Promise<AtomicOutcome> {
    const events: SubmittedEvent[] = [];
    for (const [index, raw] of rawEvents.entries()) {
      const parsed = parseEvent(raw, registry);
      if (!parsed.ok) {
        return {
          status: 'rolled-back',
          index,
          result: { status: 'invalid', eventId: parsed.eventId, code: parsed.code, message: parsed.message },
        };
      }
      events.push(parsed.event);
    }
    const first = events[0];
    if (first === undefined) throw new Error('ingestAtomic needs at least one event');
    for (const [index, event] of events.entries()) {
      const fault = atomicShapeRefusal(event, first.workspaceId);
      if (fault !== null) {
        return { status: 'rolled-back', index, result: { status: 'refused', eventId: event.id, ...fault } };
      }
    }

    const client = await deps.pool.connect();
    let rollbackFailure: Error | undefined;
    let at = 0;
    try {
      await client.query('BEGIN');
      await lockWorkspace(client, first.workspaceId);
      const envelopes: LedgerEvent[] = [];
      const results: IngestResult[] = [];
      for (const [index, event] of events.entries()) {
        at = index;
        const outcome = await commitInTx(client, event, door);
        if (outcome.kind === 'refused') {
          await client.query('ROLLBACK');
          return { status: 'rolled-back', index, result: outcome.result };
        }
        envelopes.push(outcome.envelope, ...outcome.followers);
        results.push(outcome.result);
      }
      await client.query('COMMIT');
      for (const envelope of envelopes) notifyCommitted(envelope);
      return { status: 'committed', results };
    } catch (error) {
      // The guarded ROLLBACK and the destroying release, for the reasons `commitOne` gives beside its own.
      await client.query('ROLLBACK').catch((failure: unknown) => {
        rollbackFailure = failure instanceof Error ? failure : new Error(String(failure));
      });
      const answer = answerThrown(error, events[at] ?? first);
      if (answer !== null) return { status: 'rolled-back', index: at, result: answer };
      throw error;
    } finally {
      client.release(rollbackFailure);
    }
  }

  return {
    async ingestBatch(rawEvents) {
      return ingestAll(rawEvents, null);
    },
    async ingestClientBatch(rawEvents, sessionUserId) {
      return ingestAll(rawEvents, { gate: checkPermission, sessionUserId });
    },
    async ingestAtomic(rawEvents) {
      return atomic(rawEvents, null);
    },
    async ingestClientAtomic(rawEvents, sessionUserId) {
      return atomic(rawEvents, { gate: checkPermission, sessionUserId });
    },
    onEventCommitted(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
