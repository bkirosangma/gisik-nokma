import type { Pool } from 'pg';
import {
  domainRegistry,
  parseEvent,
  ENTITY_WORKSPACE_MISMATCH_RULE,
  type EventTypeRegistry,
  type IngestErrorCode,
  type IngestResult,
  type LedgerEvent,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import type { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createEngineContext } from '../engine-context.js';
import type { ServerGate } from '../gates/server-gate.js';
import {
  insertEvent,
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
 */
export type ClientIngest = Pick<IngestService, 'ingestClientBatch' | 'onEventCommitted'>;

/**
 * What the client door carries into `commitOne`: the gate, and the session it
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

  async function commitOne(submitted: SubmittedEvent, door: ClientDoor | null): Promise<CommitOutcome> {
    const client = await deps.pool.connect();
    let rollbackFailure: Error | undefined;
    try {
      await client.query('BEGIN');
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
        await client.query('ROLLBACK');
        return {
          result: {
            status: 'refused',
            eventId: envelope.id,
            rule: ENTITY_WORKSPACE_MISMATCH_RULE,
            reason: `This ${envelope.entity.kind} belongs to workspace ${head.workspaceId}; this event files it under workspace ${envelope.workspaceId}. An entity cannot move between workspaces.`,
          },
          committed: null,
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
        await client.query('ROLLBACK');
        return {
          result: { status: 'refused', eventId: envelope.id, rule: refusal.rule, reason: refusal.reason },
          committed: null,
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
        await client.query('ROLLBACK');
        return {
          result: {
            status: 'refused',
            eventId: envelope.id,
            rule: incoherent.rule,
            reason: incoherent.reason,
          },
          committed: null,
        };
      }

      const verdict = await deps.evaluate(envelope, createEngineContext(client));
      if (verdict.refused) {
        await client.query('ROLLBACK');
        return {
          result: { status: 'refused', eventId: envelope.id, rule: verdict.rule, reason: verdict.reason },
          committed: null,
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
      // connection per event, so a gate refusal in the middle of a batch leaves
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
          await client.query('ROLLBACK');
          return {
            result: {
              status: 'refused',
              eventId: envelope.id,
              rule: gateRefusal.rule,
              reason: gateRefusal.reason,
            },
            committed: null,
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
      for (const projection of deps.projections.all()) {
        await projection.apply(envelope, client);
      }
      await client.query('COMMIT');
      notifyCommitted(envelope);
      return { result: { status: 'committed', eventId: envelope.id, seq, serverTime }, committed: envelope };
    } catch (error) {
      // A ROLLBACK on a dead connection throws, and an unguarded one would
      // replace the root-cause error with its own AND skip the duplicate check
      // below — turning a truthful duplicate-event-id answer into an opaque
      // rejection of the whole batch. The duplicate answer stays truthful even
      // here: a unique violation proves a prior transaction committed that id.
      await client.query('ROLLBACK').catch((failure: unknown) => {
        rollbackFailure = failure instanceof Error ? failure : new Error(String(failure));
      });
      if (isUniqueViolation(error, 'events_pkey')) {
        return {
          result: {
            status: 'invalid',
            eventId: submitted.id,
            code: 'duplicate-event-id',
            message: `an event with id ${submitted.id} is already in the ledger`,
          },
          committed: null,
        };
      }
      throw error;
    } finally {
      // Releasing with the error destroys the connection instead of returning
      // it to the pool: a client whose ROLLBACK failed is still inside an
      // aborted transaction, and the next borrower would inherit it.
      client.release(rollbackFailure);
    }
  }

  /**
   * Both entry points are this loop; they differ only in the gate they carry.
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

  return {
    async ingestBatch(rawEvents) {
      return ingestAll(rawEvents, null);
    },
    async ingestClientBatch(rawEvents, sessionUserId) {
      return ingestAll(rawEvents, { gate: checkPermission, sessionUserId });
    },
    onEventCommitted(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
