import type { Pool, PoolClient } from 'pg';
import {
  newSubmittedEvent,
  type IngestResult,
  type SubmittedEvent,
  type TicketState,
} from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import {
  createOutbox,
  createReplica,
  createSyncEngine,
  type Outbox,
  type Replica,
  type SyncEngine,
  type SyncItem,
  type SyncTransport,
} from '@gisik-nokma/sync-client';
// The node adapter lives on the testing subpath so app builds never resolve
// better-sqlite3; the harness runs under vitest, where the subpath is at home.
import { createBetterSqliteStorage } from '@gisik-nokma/sync-client/testing';
// `createReplicaDataSource` and its two companion types live in app-core, NOT
// in sync-client, where the plan text placed them: ruling P30 put the replica
// `DataSource` beside the online one so the two stay interchangeable, and
// app-core → sync-client is the only dependency edge that exists between the
// two packages.
import {
  createReplicaDataSource,
  OfflineAcceptError,
  type LocalIngestResult,
  type ReplicaDataSource,
} from '@gisik-nokma/app-core';
import { createIngestService, type IngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { getTicketStateFromDb } from '../../src/projections/tickets.js';
import { createSyncService, type SyncEventResult, type SyncService } from '../../src/sync/sync-service.js';
import {
  BOOTSTRAP_BACKFILL_TYPES,
  type BootstrapResponse,
  type BootstrapTicket,
} from '../../src/sync/sync-routes.js';
import { readStreamSeq } from '../../src/sync/stream-seq.js';
import { reconcileHeldIds, reconcileHeldNoteIds } from '../../src/sync/reconcile-route.js';
import { ticketBootstrapFor } from '../../src/sync/sync-routes.js';
import { runSnapshotPass } from '../../src/sync/snapshot-writer.js';
import { visibleEventsFor } from '../../src/visibility/visible-events-for.js';
import { canSee } from '../../src/visibility/can-see.js';
import { canReadNoteById } from '../../src/visibility/can-read-note.js';
import { listVisibleTickets } from '../../src/visibility/visible-tickets.js';
import { readEntityEvents, rowToEnvelope, type EventRow } from '../../src/ledger/event-store.js';
import { readLatestSnapshot } from '../../src/ledger/snapshot-store.js';
import { listNotes } from '../../src/read/notes.js';
import { purgedRefsAmong } from '../../src/purge/purged-lookup.js';
import { readDeletedItems } from '../../src/read/deleted-items.js';
// ALIASED: this file declares its OWN `LedgerRow` (a narrower, harness-facing
// row shape at `:141`), and the two collided when the bootstrap's `notes` section
// needed the route's column list. The alias keeps both names honest.
import { toEventView, type LedgerRow as EventViewRow } from '../../src/routes/tickets.js';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedMember, seedProject } from '../helpers/seed.js';

/**
 * The dual-client harness (Plan 10 Task 14): two `@gisik-nokma/sync-client`
 * replicas on in-memory SQLite, driven against the REAL ingest service, the
 * REAL sync service and REAL Postgres. Task 15 scripts the six divergence
 * scenarios on top of it; `rig.test.ts` is the rig proving itself first.
 *
 * ## What is real and what is not
 *
 * Real: every door a claim passes through. A client's offline claim reaches the
 * server through `createSyncService(...).processBatch` — the very object
 * `POST /v1/sync` delegates to — and so through the GATED `ingestClientBatch`.
 * Sync-down is `visibleEventsFor` piped into `replica.applyServerItem`, the
 * same primitive the WebSocket hub wraps (`stream/hub.ts`), advanced by the
 * same per-envelope `workspaceSeq` cursor rule the hub uses. Bootstrap is the
 * route's own assembly (`sync-routes.ts`) re-run here without HTTP, including
 * its `BOOTSTRAP_BACKFILL_TYPES` — imported, never restated, because a
 * hand-copied backfill list is a bootstrap the server never sends and a rig
 * that proves the replica against a fiction.
 *
 * Not real: the network. No socket opens and no HTTP request is made; the
 * harness stands in for the transport and nothing else, which is what makes
 * every scenario deterministic without timers.
 *
 * ## Why the transport GATES instead of throwing
 *
 * The plan text gives each client an "inert" transport whose `sync` throws, on
 * the theory that `goOnline()` drives the outbox by hand and the engine never
 * sends. That is wrong against the shipped code and wrong in a way no test on
 * the plan's own path would show: `ReplicaDataSource.ingest` fires
 * `engine.flush()` opportunistically after every enqueue
 * (`replica-data-source.ts`), and `flush` answers a transport throw with
 * `outbox.recordFailure`, which bumps `attempts` and pushes `next_attempt_at`
 * out by `backoffMs`. The very next `nextBatch()` then finds nothing due — so
 * the plan's `goOnline` would flush an empty batch and the claim would sit in
 * the outbox looking queued, forever. A harness built that way reports "the
 * claim never arrived" for every scenario and blames the product.
 *
 * So the transport here does not throw while the client is offline; it WAITS.
 * `sync` parks on a gate that `goOnline()` opens, and the engine's own flush
 * loop — the alignment check, the third-door stall, the ordered
 * `applyResult` — runs unmodified through it. A device with no network whose
 * request is held until the network appears is a truthful enough model of
 * offline for a scripted harness, and it keeps `ds.ingest` — the product's
 * door — usable by scenarios without a trap underneath it.
 *
 * ## Determinism
 *
 * Every id the seed uses is a fixed literal ULID, exported so scenarios can
 * name them. Nothing here is generated at random: two runs of a scenario
 * against this rig must produce the same ledger, or a divergence assertion
 * has nothing stable to be exact about.
 */

/* ------------------------------------------------------------------ *
 * Fixed identities. Every one is a ULID because the doors insist on it:
 * `submittedEventSchema` parses `workspaceId` and `actorId` as `ulidString`,
 * `entitySchema` refuses a non-ULID entity id for every kind but
 * `membership`, and `membershipGrantedPayload.userId` is parsed by the
 * projection `seedMember` writes through. The plan text's `'usr_a'` /
 * `'ws_harness'` / `'wf_h'` / `'task'` fail at four different parses.
 * ------------------------------------------------------------------ */

export const HARNESS_WORKSPACE_ID = '01J9HWSA000000000000000000';
export const HARNESS_PROJECT_ID = '01J9HPRJ000000000000000000';
export const USER_A = '01J9HPERS0NA00000000000000';
export const USER_B = '01J9HPERS0NB00000000000000';
/**
 * The workspace OWNER, and the reason a third identity exists at all.
 *
 * `USER_A` and `USER_B` are both `'member'`, and `ADMIN_ONLY_TYPES`
 * (`apps/server/src/permissions/check-permission.ts`) refuses
 * `workflow.defined`, `ticket-type.defined`, `project.created` and
 * `ticket.workflow_rebound` from every non-admin at the gated door. Task 15's
 * S3 republishes a workflow while a client is offline, and S4 revokes a
 * membership; neither is expressible by a member. Without this identity a
 * scenario author reaches for `ingestBatch` — the ungated internal door — and
 * silently stops testing the product.
 *
 * It is an OWNER rather than an admin only because `seedMember` takes the role
 * literally and owner is the strictly larger capability; nothing here depends
 * on the difference.
 */
export const USER_ADMIN = '01J9HPERS0NADM000000000000';
export const HARNESS_WORKFLOW_ID = '01J9HWFH000000000000000000';
/** The payload `id` AND the entity id, as `sync-route.test.ts`'s fixture does. */
export const TASK_TYPE_ID = '01J9HTASK00000000000000000';
export const HARNESS_SUB_TASK_TYPE_ID = '01J9HSBTASK000000000000000';

export type LedgerRow = { id: string; type: string; seq: number; actorId: string };

export type HarnessClient = {
  userId: string;
  replica: Replica;
  outbox: Outbox;
  /**
   * Exposed so a scenario can read `lastApplyFailure()` / `status()` — never to
   * `start()` it, and never to `settled()` it.
   *
   * **`settled()` DEADLOCKS here** (measured): it ends with
   * `if (flushing !== null) await flushing`, and while this client is offline
   * `flushing` is parked on the gate that only `goOnline()` opens. A scenario
   * author reaching for the engine's documented wait primitive hangs to the
   * 30 s test timeout with no message. Use `goOnline()` / `syncDown()`, which
   * are the harness's own settle points.
   */
  engine: SyncEngine;
  ds: ReplicaDataSource;
  /**
   * Every ticket id this client's transport was ASKED for through
   * `bootstrapTicket`, in order, appended at ENTRY — before the `canSee` gate
   * can reject it.
   *
   * Entry and not success, because entry is the product's cost model:
   * `sync-engine.ts`'s `drainPendingPulls` counts a 404 as an attempt that
   * leaves the id pending and retries it on the next catch-up, so a ledger
   * written after the return would report zero requests for a device making one
   * per catch-up forever. Case 12.276 asserts on this array; recording the
   * successes only would have hidden exactly the shape it measures.
   */
  pulls: string[];
  /** `pulls` for notes (Plan 2 of 6): every note id this client's transport was ASKED for, at entry. */
  notePulls: string[];
  /** Flush the outbox through the REAL sync service (the engine's own loop), then catch up. */
  goOnline(): Promise<void>;
  /**
   * Catch up only: `visibleEventsFor` → `applyServerItem`, cursor advanced as
   * the hub advances it, pending pulls drained as the engine drains them.
   *
   * Returns every item DELIVERED, envelopes and instructions alike, in arrival
   * order. A caller that ignores it loses nothing; a caller that needs to prove
   * an INSTRUCTION reached this replica has no other door — instructions carry
   * no `workspaceSeq`, leave no row of their own when the client already holds
   * what they name, and are therefore invisible to every `replica` accessor.
   * Case 12.276's "this cost zero pulls" would be vacuous without it: a server
   * that yielded no notice at all would also cost zero pulls.
   */
  syncDown(): Promise<SyncItem[]>;
  /**
   * `ds.ingest` sugar: the local pre-check, then the queue. Nothing is sent
   * while the client is offline. Returns the per-claim answer rather than
   * throwing it — `ReplicaDataSource.ingest` THROWS `OfflineAcceptError` for an
   * accepted claim (its docblock says why: no arm of `IngestResult` is honest
   * about "queued"), and a scenario wants the `{status: 'pending'}` word in
   * hand, not a catch block around every submit.
   */
  submit(event: SubmittedEvent): Promise<LocalIngestResult>;
};

export type Harness = {
  pool: Pool;
  /** The seeded scenario workspace — `HARNESS_WORKSPACE_ID`. */
  workspaceId: string;
  projectId: string;
  /**
   * The online-user stand-in: `POST /v1/events` semantics WITHOUT the HTTP.
   *
   * Takes the session user because the real door does. This calls
   * `ingestClientBatch(events, userId)` — the GATED door — and NOT `ingestBatch`,
   * which the plan text used here. `ingestBatch` passes `door = null`, so
   * `checkPermission` never runs; its own docblock says an HTTP route must
   * never call it. An online stand-in that skipped the gate would be unlike
   * every real online user, and Task 15 could assert a permission outcome the
   * product does not have. `rig.test.ts` pins this with a forged
   * envelope-origin, which the internal door would have committed.
   */
  ingestInteractive(userId: string, events: SubmittedEvent[]): Promise<IngestResult[]>;
  /** A fresh replica for that user, bootstrapped from the server's current cut. */
  client(userId: string): Promise<HarnessClient>;
  /** The server's ledger for one entity, in per-entity `seq` order. */
  ledger(entityId: string): Promise<LedgerRow[]>;
  /** `proj_contested` rows, in the order they were filed. */
  contests(): Promise<Array<Record<string, unknown>>>;
  /**
   * The REAL sync door, for a batch a scenario wants to send itself — S6 lands
   * the same batch twice through it. Same object `POST /v1/sync` delegates to.
   */
  sync(userId: string, events: SubmittedEvent[]): Promise<SyncEventResult[]>;
  /**
   * The SERVER's read model (Plan 3's `proj_tickets`), so a scenario can prove
   * server ≡ replica and not only replica ≡ replica.
   */
  projTicket(ticketId: string): Promise<TicketState | null>;
  snapshotPass(): Promise<void>;
  drop(): Promise<void>;
};

/**
 * One ticket's bootstrap payload, exactly as `sync-routes.ts`'s private
 * `bootstrapTicket` builds it. Restated rather than imported only because the
 * route does not export it; the filter's two halves — the tail past the
 * snapshot, plus every backfill type regardless of position — and the backfill
 * list itself are the route's own.
 */
async function bootstrapTicket(client: PoolClient, ticketId: string): Promise<BootstrapTicket> {
  const snapshot = await readLatestSnapshot(client, 'ticket', ticketId);
  const all = await readEntityEvents(client, 'ticket', ticketId);
  const snapSeq = snapshot?.seq ?? 0;
  const backfill: readonly string[] = BOOTSTRAP_BACKFILL_TYPES;
  return {
    ticketId,
    snapshot:
      snapshot === null
        ? null
        : // The same cast the route and the snapshot writer make, for the same
          // reason: no `ticketStateSchema` exists to parse the jsonb against.
          { seq: snapshot.seq, state: snapshot.state as unknown as TicketState },
    events: all.filter((e) => e.seq > snapSeq || backfill.includes(e.type)),
  };
}

/**
 * `GET /v1/sync/bootstrap` without the HTTP: the route's assembly, in the
 * route's order, inside the route's `REPEATABLE READ` cut. The cursor is read
 * FIRST so a subscription at `streamSeq` can only re-deliver, never skip —
 * the property case 12.118 pins on the route, kept here so the rig's clients
 * start from the cut a real client would.
 *
 * Two places the plan text's version disagrees with the route, and the route
 * wins both: definitions are ordered by `workspace_seq` (case 12.117 — the
 * plan's `(entity_kind, entity_id, seq)` can hand the replica the LOSER of two
 * definitions of one key), and `me.projectIds` is `[...eff.projects.keys()]`
 * (the plan's `[...eff.projects]` spreads a `Map` into `[key, value]` tuples).
 */
async function bootstrapFor(pool: Pool, userId: string, workspaceId: string): Promise<BootstrapResponse> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
    const eff = await resolveEffectiveRole(client, userId, workspaceId);
    if (eff.workspaceRole === null) {
      await client.query('ROLLBACK');
      throw new Error(`harness: ${userId} is not a member of ${workspaceId} — seed them before calling client()`);
    }
    const workspaceRole = eff.workspaceRole;
    const streamSeq = await readStreamSeq(client, workspaceId);
    const { rows: defRows } = await client.query<EventRow>(
      `SELECT * FROM events
        WHERE workspace_id = $1 AND entity_kind IN ('workflow', 'ticket-type')
        ORDER BY workspace_seq`,
      [workspaceId],
    );
    const definitions = defRows.map(rowToEnvelope);
    const tickets: BootstrapTicket[] = [];
    for (const row of await listVisibleTickets(client, userId, workspaceId)) {
      tickets.push(await bootstrapTicket(client, row['ticket_id'] as string));
    }
    // THE NOTES, and their absence here was MEASURED rather than assumed
    // (Plan 2 Task 8): without this section a harness client bootstraps ABOVE
    // every note's events — its cursor is the current cut — and the stream then
    // delivers none of them, because `workspace_seq > cursor` excludes them. So
    // the first two-device note scenario found a client holding NOTHING after a
    // clean sync, which is what a real fresh device would have held too.
    //
    // The route's own rule, restated here only because this function IS the
    // route's restatement (`sync-routes.ts`'s handler is the other builder):
    // every readable note plus the deleted ones this caller may see.
    const readableNotes = await listNotes(client, eff, userId, workspaceId);
    const deletedNotes = await listNotes(client, eff, userId, workspaceId, { deleted: true });
    const noteIds = [...readableNotes, ...deletedNotes].map((n) => n.noteId);
    const notes =
      noteIds.length === 0
        ? { events: [] }
        : {
            events: (
              await client.query<EventViewRow>(
                `SELECT id, workspace_id, entity_kind, entity_id, type, version, payload,
                        actor_id, origin, client_time, server_time, seq, workspace_seq
                   FROM events
                   WHERE entity_kind = 'note' AND entity_id = ANY($1::text[])
                   ORDER BY workspace_seq`,
                [noteIds],
              )
            ).rows.map(toEventView),
          };
    await client.query('COMMIT');
    return {
      workspaceId,
      me: { userId, workspaceRole, projectIds: [...eff.projects.keys()] },
      streamSeq,
      definitions,
      tickets,
      notes,
    };
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // The original error is the one worth throwing.
    }
    throw err;
  } finally {
    client.release();
  }
}

export async function createHarness(): Promise<Harness> {
  const db: TestDatabase = await createTestDatabase();
  const pool = db.pool;
  const workspaceId = HARNESS_WORKSPACE_ID;
  const projectId = HARNESS_PROJECT_ID;

  const ingest: IngestService = createIngestService({
    pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
  });
  // The two doors, wired exactly as `index.ts` wires them for the real server:
  // the client's offline claim through the gated `ClientIngest` narrowing, the
  // server's own `claim.contested` append through the internal door handed over
  // as a NAMED capability. `createSyncService` refuses the full `IngestService`
  // by type, which is what makes the plan text's `{ pool, ingest }` not compile.
  const syncService: SyncService = createSyncService({
    pool,
    ingest,
    serverAppend: (events) => ingest.ingestBatch(events),
  });

  async function client(userId: string): Promise<HarnessClient> {
    const storage = createBetterSqliteStorage();
    const replica = await createReplica({ storage });
    const outbox = createOutbox({ storage, replica });

    // The offline/online gate — see the module docblock. `sync` parks here
    // while the client is offline and runs the REAL service the moment
    // `goOnline()` opens the gate; it never throws, because a throw is what
    // backs the outbox off and hides the claim from the next flush.
    let online = false;
    let waiters: Array<() => void> = [];
    /** See `HarnessClient.pulls`. Appended at the transport's entry, never after. */
    const pulls: string[] = [];
    const whenOnline = (): Promise<void> =>
      online
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            waiters.push(resolve);
          });

    /**
     * Every NOTE id this client's transport was asked for, in order, appended
     * at ENTRY — `pulls`'s exact rule and for its exact reason. A scenario
     * proving "this widening cost one pull and not two" has no other door:
     * the pull leaves no envelope behind and moves no cursor.
     */
    const notePulls: string[] = [];

    const transport: SyncTransport = {
      bootstrap: (ws) => bootstrapFor(pool, userId, ws),
      async sync(events) {
        await whenOnline();
        return syncService.processBatch(userId, events);
      },
      /**
       * Closure 5's reconcile door — **the route's own function, called, not
       * restated.** `reconcileHeldIds` is the body of `POST /v1/sync/reconcile`
       * (`src/sync/reconcile-route.ts`), and this transport and that route are
       * its only two callers.
       *
       * It used to be a copy of the loop, and #139's review named that as the
       * branch's weakest claim. The copy was correct; the hazard was that it
       * could stop being correct silently, leaving this harness proving
       * replicas against a rule the server no longer has. Closure 5b deleted
       * the copy rather than annotating it.
       *
       * What this call does NOT reach is the route's HTTP shell — the bearer
       * session, the 403 membership gate, the body schema and its
       * `MAX_BATCH_SIZE` bound. Those are covered by
       * `test/sync/reconcile-route.test.ts` (12.284-12.286, and 12.304's
       * guest side), and reaching them
       * from here would mean the harness's three seeded users had to be real
       * better-auth users with ids better-auth chose. Stated so nobody reads
       * "calls the real route" as more than it is.
       */
      /**
       * Closure 5b(d)'s pull door — the ROUTE's own assembly function, called.
       *
       * `ticketBootstrapFor` is the body of `GET /v1/sync/bootstrap/ticket`;
       * this transport and that route are its only two callers. What this does
       * NOT reach is the route's HTTP shell — the bearer session, the 403
       * membership gate, the query schema — covered by
       * `test/sync/ticket-bootstrap-route.test.ts`.
       *
       * **The `canSee` is asked here on purpose.** It lives in the route rather
       * than in the shared function, because a 404 is a reply and this harness
       * has none to send — but a rig that simply skipped it would be a door
       * with a weaker gate than the product's, and every scenario asserting who
       * can pull what would be asserting it against a server that does not
       * exist. This rig has paid that price once already, on `ingestBatch`
       * versus `ingestClientBatch`.
       *
       * The rejection, not a null: the route answers 404 identically for
       * "may not see" and "never existed", so a transport that could tell them
       * apart would hand the engine the oracle the whole shape refuses.
       */
      async bootstrapTicket(ws, ticketId) {
        // BEFORE the gate, deliberately — a refused pull is a pull made. See
        // `HarnessClient.pulls`.
        pulls.push(ticketId);
        const client = await pool.connect();
        try {
          if (!(await canSee(client, userId, ticketId))) {
            throw new Error(`bootstrapTicket failed: 404 (${ticketId})`);
          }
          return await ticketBootstrapFor(client, ws, ticketId, userId);
        } finally {
          client.release();
        }
      },
      async reconcile(ws, heldIds, heldNoteIds) {
        // Both arms call the ROUTE's own functions, the same discipline the
        // ticket arm's docblock states above: a restated rule is what lets a
        // harness prove replicas against a server that no longer exists.
        return {
          workspaceId: ws,
          restricted: await reconcileHeldIds(pool, userId, heldIds),
          restrictedNotes: await reconcileHeldNoteIds(pool, userId, heldNoteIds ?? []),
        };
      },
      /**
       * The note pull (notes series, Plan 2 of 6) — the READ route's rule,
       * asked here for the reason `bootstrapTicket` asks its own.
       *
       * `canReadNoteById` lives in the ROUTE rather than in a shared assembly
       * function, and this harness has no 404 to send, so it asks the predicate
       * itself. Skipping it would give this door a weaker gate than the
       * product's, and every scenario asserting who can pull what would be
       * asserting it against a server that does not exist.
       *
       * ENVELOPES, not rows: the real HTTP transport converts the route's
       * `LedgerEventView` at its own edge (`net/http-transport.ts`), and the
       * engine folds envelopes. `readEntityEvents` is the same reader the
       * per-ticket bootstrap uses, so both pulls hand the engine one shape.
       */
      async bootstrapNote(_ws, noteId) {
        // BEFORE the gate, for `bootstrapTicket`'s reason: a refused pull is a
        // pull made, and a ledger written after the return would hide the
        // retry-forever shape.
        notePulls.push(noteId);
        if (!(await canReadNoteById(pool, userId, noteId))) {
          throw new Error(`bootstrapNote failed: 404 (${noteId})`);
        }
        return { events: await readEntityEvents(pool, 'note', noteId) };
      },
      // Trash Plan 3: the ROUTE's own function, the discipline the ticket and
      // note pulls state above — a restated rule would let a harness prove
      // replicas against a server that does not exist.
      purgedLookup: (ids) => purgedRefsAmong(pool, ids),
      deletedItems: async () => ({ items: await readDeletedItems(pool, userId) }),
      // Only `engine.start()` opens a stream, and the harness never calls it:
      // sync-down is `syncDown()` below, on the same primitive the socket
      // wraps. A no-op handle here would let a scenario `start()` the engine
      // and believe a subscription existed.
      openStream: () => {
        throw new Error('harness clients have no socket: use syncDown() / goOnline()');
      },
    };
    const engine = createSyncEngine({ replica, outbox, transport });
    const ds = createReplicaDataSource({ workspaceId, replica, outbox, engine, storage });
    await replica.loadBootstrap(await bootstrapFor(pool, userId, workspaceId));

    /**
     * `sync-engine.ts`'s `drainPendingPulls`, MIRRORED — and the mirror is
     * forced rather than chosen, which is why the alternative is named here.
     *
     * A `reach-granted` notice makes the replica RECORD ids it lacks
     * (`applyInstruction`'s arm calls `addPendingPulls` and stops); fetching
     * them is the ENGINE's job, and the engine's own drain is unreachable from
     * here twice over. It is a closure, not a method on `SyncEngine`, and it
     * opens with `if (stopped || stalled || streamEnded) return` — `stopped` is
     * cleared only by `start()`, which these clients never call because
     * `transport.openStream` throws on purpose. So `b.engine`'s drain would
     * return immediately having pulled nothing. **Do not "simplify" this into a
     * call to the engine.**
     *
     * What is mirrored, from `drainPendingPulls` and `applyOne`:
     *
     * - the id order (`listPendingPulls`), one pull at a time, sequential;
     * - `loadTicketBootstrap` then `clearPendingPull`, in that order, so a
     *   throw between them leaves the id owed rather than lost;
     * - the SILENT swallow, id left pending. The engine's docblock argues it at
     *   length: a throw would reach `stall()`, whose latch only `start()`
     *   clears, and a five-second wobble would brick the device. A scenario
     *   that needs the silence named asserts `listPendingPulls` is empty —
     *   which is what turns a swallowed pull into a message instead of a
     *   puzzling equality diff two assertions later.
     *
     * What is NOT mirrored, and neither is load-bearing here: `PULL_TIMEOUT_MS`
     * (nothing crosses a network in this harness, so no pull can fail to
     * settle) and the `stopped`/`stalled`/`streamEnded` re-checks between ids
     * (there is no stream to end).
     */
    async function drainPendingPulls(): Promise<void> {
      // DESTRUCTURED, and the shape is the whole point: ruling P37.2 changed
      // `listPendingPulls` from `string[]` to `{ id, headSeq }[]` and this
      // mirrored drain kept iterating it as ids. The object then travelled as a
      // ticket id into `bootstrapTicket` AND into `clearPendingPull`, whose
      // filter compares `t.id !== ticketId` — an object never equals a string,
      // so nothing was ever cleared and the second drain below re-pulled every
      // id. That is what 12.275/12.276/12.316 caught: not a wrong id, a
      // DUPLICATE one. `typecheck` catches it too (two TS2345 at this line and
      // the next); nothing had run it since P37.2, which is the real lesson.
      // The rig's own docblock says this mirror is FORCED rather than chosen —
      // and a forced mirror is a thing that drifts.
      for (const { id: ticketId } of await replica.listPendingPulls(workspaceId)) {
        try {
          await replica.loadTicketBootstrap(await transport.bootstrapTicket(workspaceId, ticketId));
          await replica.clearPendingPull(workspaceId, ticketId);
        } catch {
          // Deliberately silent, and deliberately WITHOUT clearing the id —
          // see the docblock. The next `syncDown()` tries again.
        }
      }
      // And the NOTE half, over its own durable set and its own door — the
      // same two loops the engine's `drainPendingPulls` runs, for the same
      // reason the ticket loop above is mirrored rather than called.
      for (const { id: noteId } of await replica.listPendingPulls(workspaceId, 'note')) {
        try {
          const payload = await transport.bootstrapNote(workspaceId, noteId);
          await replica.loadNoteEvents(payload.events);
          await replica.clearPendingPull(workspaceId, noteId, 'note');
        } catch {
          // Silent, id left owed — the ticket arm's rule, unchanged.
        }
      }
    }

    async function syncDown(): Promise<SyncItem[]> {
      // The hub's rule, not the plan text's: the cursor is the highest
      // `workspaceSeq` of an ENVELOPE actually delivered, instructions do not
      // move it, and a workspace-wide `scope-revoked` ends the drain without
      // moving it (`stream/hub.ts`'s `drain`). The plan's `readStreamSeq`
      // after the drain would set the cursor past a commit that landed between
      // the two reads — a skip, which is the one thing a cursor must never do.
      let cursor = await replica.getCursor(workspaceId);
      const delivered: SyncItem[] = [];
      for await (const item of visibleEventsFor(pool, userId, workspaceId, cursor)) {
        delivered.push(item);
        await replica.applyServerItem(item);
        if ('kind' in item) {
          // `applyOne`'s own site, at `applyOne`'s own moment: INSIDE the loop,
          // straight after the item applied and therefore AHEAD of the trigger
          // envelope queued behind it. That ordering is the whole reason
          // `visible-events-for.ts` yields the notice BEFORE its trigger — a
          // folded `ticket.reparented` arriving for a ticket this device has
          // not pulled replays a transition with no `ticket.created` and stalls
          // the engine terminally. A rig that drained after the loop would look
          // identical on every `visibility.set` scenario and be wrong on the
          // one that matters.
          if (item.kind === 'reach-granted') await drainPendingPulls();
          if (item.kind === 'scope-revoked' && item.projectId === undefined) return delivered;
          continue;
        }
        if (item.workspaceSeq > cursor) cursor = item.workspaceSeq;
      }
      // `onCaughtUp`'s site, in `onCaughtUp`'s order: leftovers from a pull that
      // failed earlier are retried while this drain still holds the floor, and
      // only THEN does the cursor move. Safe for it to fail again — the pending
      // set is durable, so the cursor advancing past a trigger whose ids are
      // still owed loses nothing.
      await drainPendingPulls();
      await replica.setCursor(workspaceId, cursor);
      return delivered;
    }

    /**
     * ## THE ORDER HERE IS THE INVERSE OF THE PRODUCT'S, and Task 15 must know
     *
     * This flushes and THEN catches up. The engine does the opposite:
     * `onCaughtUp` is what triggers its flush, so in the product a client is
     * current before its own queued claims are folded through the flush door.
     *
     * Measured benign for the S1 and S2 shapes — the reducer throws only on an
     * unknown type/workflow/state or an uncreated ticket, which an
     * assign/field/transition gap cannot produce, so folding one's own claim
     * over a gapped local history converges to the same final state. **It was
     * NOT measured for S5**, and a scenario that asserts the INTERMEDIATE state
     * (what a replica holds between the flush and the catch-up) is asserting
     * something the product never shows. Call `syncDown()` first where that
     * matters.
     */
    async function goOnline(): Promise<void> {
      online = true;
      for (const wake of waiters.splice(0)) wake();
      try {
        // Either the flush `ds.ingest` already started (parked on the gate) or
        // a fresh one; `flush` hands back the in-flight promise either way.
        await engine.flush();
      } finally {
        // The gate closes again, so a claim submitted after this call queues
        // rather than racing the next assertion.
        online = false;
        waiters = [];
      }
      // A committed claim this replica could not fold is the engine's
      // terminal stall, and `flush` records it rather than rejecting. Surfaced
      // here so a scenario fails on the fold, not two assertions later on a
      // ticket that "never arrived".
      const failure = engine.lastApplyFailure();
      if (failure !== null) {
        throw new Error(`harness: replica for ${userId} could not fold a committed claim: ${failure.message}`);
      }
      // THE OTHER SILENT EXIT, and it is not the same one.
      //
      // `flush` answers a `transport.sync` THROW with `outbox.recordFailure`
      // and returns normally: the row keeps status 'queued', its
      // `next_attempt_at` moves out by the backoff, `lastApplyFailure()` stays
      // null, and `failedItems` stays EMPTY (measured — `recordFailure` does
      // not mark 'failed', deliberately, or every retryable claim would strand
      // forever). So `goOnline()` used to resolve looking successful with the
      // claim never sent, and a scenario asserting one contest would see zero
      // and blame the product. The real reason sat in `outbox.last_error`,
      // which nothing read.
      //
      // In THIS harness there is no network and no server to be briefly
      // unavailable: `transport.sync` calls `syncService.processBatch`
      // in-process. A claim still queued after a flush is therefore never
      // transient — it is a real failure, and the backoff that would excuse it
      // in the product excuses nothing here.
      const stillQueued = await outbox.queuedCount(workspaceId);
      if (stillQueued > 0) {
        const rows = await storage.all(
          'SELECT event_id, attempts, status, last_error FROM outbox WHERE workspace_id = ? ORDER BY position',
          [workspaceId],
        );
        const detail = rows
          .map((r) => `${String(r['event_id'])} (attempts=${String(r['attempts'])}, status=${String(r['status'])}): ${String(r['last_error'] ?? 'no error recorded')}`)
          .join('; ');
        throw new Error(
          `harness: goOnline() for ${userId} left ${String(stillQueued)} claim(s) queued after the flush — ` +
            `the sync door refused to accept them and the engine backed off instead of failing. ${detail}`,
        );
      }
      await syncDown();
    }

    async function submit(event: SubmittedEvent): Promise<LocalIngestResult> {
      try {
        const [result] = await ds.ingest([event]);
        if (result === undefined) throw new Error('harness: ds.ingest answered nothing for one event');
        return result;
      } catch (err) {
        if (err instanceof OfflineAcceptError) {
          const [result] = err.results;
          if (result === undefined) throw new Error('harness: OfflineAcceptError carried no result');
          return result;
        }
        throw err;
      }
    }

    return { userId, replica, outbox, engine, ds, pulls, notePulls, goOnline, syncDown, submit };
  }

  const harness: Harness = {
    pool,
    workspaceId,
    projectId,
    ingestInteractive: (userId, events) => ingest.ingestClientBatch(events, userId),
    client,

    async ledger(entityId) {
      const { rows } = await pool.query<{ id: string; type: string; seq: number; actor_id: string }>(
        'SELECT id, type, seq, actor_id FROM events WHERE entity_id = $1 ORDER BY seq',
        [entityId],
      );
      return rows.map((r) => ({ id: r.id, type: r.type, seq: Number(r.seq), actorId: r.actor_id }));
    },

    async contests() {
      const { rows } = await pool.query<Record<string, unknown>>(
        'SELECT * FROM proj_contested ORDER BY contested_at, contested_event_id',
      );
      return rows;
    },

    /**
     * Hand a batch straight to the REAL sync service — the same object
     * `POST /v1/sync` delegates to, and the same call `goOnline`'s transport
     * makes.
     *
     * It exists for Task 15's S6, which lands one outbox batch TWICE and
     * requires identical results, an unchanged ledger and exactly one contest.
     * No other accessor can express that: `engine.flush()` drains only what is
     * queued, and after the first flush the rows are gone. The plan's S6 built
     * its own `createSyncService({pool, ingest})`, which does not compile —
     * `SyncServiceDeps` requires `serverAppend` — and would in any case have
     * been a SECOND service instance, so a duplicate-suppression bug living in
     * per-instance state would have been invisible to it. This is the one the
     * route uses.
     */
    sync: (userId, events) => syncService.processBatch(userId, events),

    projTicket: (ticketId) => getTicketStateFromDb(pool, workspaceId, ticketId),
    /**
     * ## A PRODUCT DEFECT SURFACES THROUGH THIS, and it is not the rig's
     *
     * After a snapshot pass, a client created FRESH cannot read the snapshotted
     * ticket through `ds.query.getTicket`: it throws `ReplicaGapError` for
     * `stateProvenance`, because `replica-data-source.ts` requires a
     * `ticket.created` or `ticket.transitioned` in the local `events` table and
     * a snapshot-bounded bootstrap ships neither below the line.
     * `replica.getTicket` answers fine — only the DataSource door refuses.
     *
     * **The snapshot-bounded bootstrap and the DataSource's provenance rule
     * contradict each other.** Recorded, not fixed: it is a product question,
     * not a harness one, and fixing it here would hide it. Owner: unassigned.
     * A scenario that snapshots before creating a client will meet it as what
     * looks like a rig failure.
     */

    async snapshotPass() {
      await runSnapshotPass(pool, { minEvents: 1 });
    },

    drop: () => db.drop(),
  };

  // Shared scenario ground. Definitions arrive through the INTERNAL ingest
  // door — `ingestBatch`, no gate — which is correct HERE and only here: this
  // is the server seeding its own workspace, the same door `index.ts`'s
  // `serverAppend` is, and the envelopes carry envelope-origin `'server'`,
  // which the client door refuses by design. Do not "fix" this into
  // `ingestClientBatch`, and do not "fix" `ingestInteractive` above into this.
  //
  // The project is FOUNDED before anyone is attached to it: `checkProjectExists`
  // refuses any claim naming a project `proj_projects` has no row for. Both
  // users are ordinary members ON the project, because a ticket that authors no
  // visibility of its own resolves to `'project'` mode
  // (`proj-visibility.ts`'s `ROOT_DEFAULT_MODE`) and a member off the project
  // cannot see it — the plan text's unattached members would never receive
  // each other's tickets at all.
  await seedProject(pool, workspaceId, projectId);
  await seedMember(pool, workspaceId, USER_A, 'member', [{ projectId }]);
  await seedMember(pool, workspaceId, USER_B, 'member', [{ projectId }]);
  // The owner (see USER_ADMIN): Task 15's S3/S4 need a workspace-admin claim to
  // exist at the GATED door rather than smuggling one through the internal one.
  await seedMember(pool, workspaceId, USER_ADMIN, 'owner', [{ projectId, projectAdmin: true }]);

  const define = (entity: SubmittedEvent['entity'], type: string, payload: unknown): SubmittedEvent =>
    newSubmittedEvent({ workspaceId, entity, type, payload, actorId: USER_A, origin: 'server' });
  const seeded = await ingest.ingestBatch([
    define({ kind: 'workflow', id: HARNESS_WORKFLOW_ID }, 'workflow.defined', {
      id: HARNESS_WORKFLOW_ID,
      version: 1,
      name: 'Harness',
      initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'review', name: 'Review', category: 'active' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [
        // Leaving ANY state for todo is assignee-only: this is what makes S5's
        // reopen contestable when the assignment changed under the offline
        // client. Creation is not a transition — `ticket.created` is judged by
        // `checkTicketCreated`, never against this edge — so an unassigned
        // ticket still starts here.
        { from: '*', to: 'todo', rules: [{ kind: 'restrict-to', assignee: true }] },
        { from: '*', to: 'review', rules: [] },
        { from: 'review', to: 'done', rules: [{ kind: 'restrict-to', assignee: true }] },
        { from: 'todo', to: 'done', rules: [{ kind: 'restrict-to', assignee: true }] },
      ],
    }),
    define({ kind: 'ticket-type', id: TASK_TYPE_ID }, 'ticket-type.defined', {
      id: TASK_TYPE_ID,
      name: 'Task',
      icon: 'check',
      rank: 3,
      workflowId: HARNESS_WORKFLOW_ID,
      fields: [],
    }),
    define({ kind: 'ticket-type', id: HARNESS_SUB_TASK_TYPE_ID }, 'ticket-type.defined', {
      id: HARNESS_SUB_TASK_TYPE_ID,
      name: 'Sub-task',
      icon: 'dot',
      rank: 4,
      workflowId: HARNESS_WORKFLOW_ID,
      fields: [],
    }),
  ]);
  for (const r of seeded) {
    if (r.status !== 'committed') throw new Error(`harness seed failed: ${JSON.stringify(r)}`);
  }
  return harness;
}
