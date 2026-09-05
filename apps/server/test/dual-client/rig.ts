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
import { createSyncService, type SyncService } from '../../src/sync/sync-service.js';
import {
  BOOTSTRAP_BACKFILL_TYPES,
  type BootstrapResponse,
  type BootstrapTicket,
} from '../../src/sync/sync-routes.js';
import { readStreamSeq } from '../../src/sync/stream-seq.js';
import { runSnapshotPass } from '../../src/sync/snapshot-writer.js';
import { visibleEventsFor } from '../../src/visibility/visible-events-for.js';
import { listVisibleTickets } from '../../src/visibility/visible-tickets.js';
import { readEntityEvents, rowToEnvelope, type EventRow } from '../../src/ledger/event-store.js';
import { readLatestSnapshot } from '../../src/ledger/snapshot-store.js';
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
export const HARNESS_WORKFLOW_ID = '01J9HWFH000000000000000000';
/** The payload `id` AND the entity id, as `sync-route.test.ts`'s fixture does. */
export const TASK_TYPE_ID = '01J9HTASK00000000000000000';
export const HARNESS_SUB_TASK_TYPE_ID = '01J9HSBTASK000000000000000';

export type LedgerRow = { id: string; type: string; seq: number; actorId: string };

export type HarnessClient = {
  userId: string;
  replica: Replica;
  outbox: Outbox;
  /** Exposed so a scenario can read `lastApplyFailure()` / `status()` — never to `start()` it. */
  engine: SyncEngine;
  ds: ReplicaDataSource;
  /** Flush the outbox through the REAL sync service (the engine's own loop), then catch up. */
  goOnline(): Promise<void>;
  /** Catch up only: `visibleEventsFor` → `applyServerItem`, cursor advanced as the hub advances it. */
  syncDown(): Promise<void>;
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
    await client.query('COMMIT');
    return {
      workspaceId,
      me: { userId, workspaceRole, projectIds: [...eff.projects.keys()] },
      streamSeq,
      definitions,
      tickets,
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
    const whenOnline = (): Promise<void> =>
      online
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            waiters.push(resolve);
          });

    const transport: SyncTransport = {
      bootstrap: (ws) => bootstrapFor(pool, userId, ws),
      async sync(events) {
        await whenOnline();
        return syncService.processBatch(userId, events);
      },
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

    async function syncDown(): Promise<void> {
      // The hub's rule, not the plan text's: the cursor is the highest
      // `workspaceSeq` of an ENVELOPE actually delivered, instructions do not
      // move it, and a workspace-wide `scope-revoked` ends the drain without
      // moving it (`stream/hub.ts`'s `drain`). The plan's `readStreamSeq`
      // after the drain would set the cursor past a commit that landed between
      // the two reads — a skip, which is the one thing a cursor must never do.
      let cursor = await replica.getCursor(workspaceId);
      for await (const item of visibleEventsFor(pool, userId, workspaceId, cursor)) {
        await replica.applyServerItem(item);
        if ('kind' in item) {
          if (item.kind === 'scope-revoked' && item.projectId === undefined) return;
          continue;
        }
        if (item.workspaceSeq > cursor) cursor = item.workspaceSeq;
      }
      await replica.setCursor(workspaceId, cursor);
    }

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

    return { userId, replica, outbox, engine, ds, goOnline, syncDown, submit };
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

    projTicket: (ticketId) => getTicketStateFromDb(pool, workspaceId, ticketId),

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
