import type { Pool, PoolClient } from 'pg';
import {
  foldTicketEvent,
  TICKET_EVENT_TYPES,
  TICKET_FOLD_VERSION,
  type TicketState,
  type TicketStateDeps,
} from '@gisik-nokma/domain';
import { readEntityEvents } from '../ledger/event-store.js';
import { overwriteSnapshot, readLatestSnapshot, writeSnapshot, type SnapshotProvenance } from '../ledger/snapshot-store.js';
import { buildLedgerDeps, memoizedDepsAsOfEvent, type DepsAsOfEvent } from './ledger-deps.js';

const DEFAULT_MIN_EVENTS = 20;

/**
 * The BOOT RESTATE flag (wtg2 fold-version bootstrap, planner ruling D, 2026-10-05). `complete` turns true once the
 * first pass this process's `startSnapshotWriter` started has SETTLED, cleanly or not: T9's boot pass, which restates
 * every snapshot written by an older fold. Until then `bootstrapTicket` refuses a row with `fold_version <
 * TICKET_FOLD_VERSION` (`SnapshotRestatePending`, answered 503, which the client's pull drain keeps owed and retries).
 *
 * `dueAt` is set with it (wtg2 fold-version overlap, planner ruling E, its instant re-pinned on the lane's question):
 * the DATABASE clock read immediately before that pass's due query, or `null` when the pass failed before reading it.
 * After the pass a stale row is not always a restate that failed. During a rolling deploy the OLD instance's writer
 * keeps running and writes rows stamped with the old fold (the column default), and one created after `dueAt` was
 * never in the pass's due set. So a stale row whose `created_at` is later than `dueAt` is still refused, and the next
 * interval pass restates it. One created at or before `dueAt` was due and its restate failed: it is served as stored
 * and named on `warn`, which the writer points at its own log. The clock is the database's because `created_at` is.
 *
 * In-process and per instance: each server process runs its own boot pass, and `deploy/do/app.yaml` runs one server
 * instance.
 */
export const bootRestate: { complete: boolean; dueAt: Date | null; warn: (msg: string) => void } = {
  complete: false,
  dueAt: null,
  warn: (): undefined => undefined,
};

/**
 * The result of one resume-and-replay: where the ticket's stream head is, what
 * the reducer folds it to, and where the snapshot it resumed from sat.
 *
 * `previousSeq` is returned rather than kept private because the two callers
 * want DIFFERENT things from it. The background pass skips when the head has
 * not moved (a second pass at `minEvents: 0` would otherwise collide on the
 * snapshots primary key). The publish door must NOT skip: a publish moves no
 * ticket event, so `seq === previousSeq` is its ordinary case and re-stating
 * the head state under the new vocabulary is the whole job.
 *
 * `restated` (wtg2 T9): the latest snapshot was written by an older fold (`foldVersion` below `TICKET_FOLD_VERSION`),
 * so this head is a FULL fold and `previousSeq` is 0. The write may land on the seq the stale row already holds, so
 * the background pass writes a restated head with `overwriteSnapshot`.
 */
export type FoldedTicketHead = {
  seq: number;
  state: TicketState;
  previousSeq: number;
  provenance: SnapshotProvenance | null;
  restated: boolean;
};

/**
 * Resume from a ticket's latest snapshot and fold its tail — THE one
 * incremental-fold loop on the server, shared by the background pass below and
 * by the publish door (`snapshot-refresh.ts`).
 *
 * It is extracted rather than copied because the two paths must agree about
 * four separate things, and each one is a defect if they drift: `seq` advances
 * over EVERY event on the stream while only `TICKET_EVENT_TYPES` are folded
 * (see "seq counts events, not folds" below); the resume is from the previous
 * snapshot's STATE, not from event 1; a ticket entity carrying only unfoldable
 * events yields `null` rather than a snapshot of nothing; and the tail read's
 * `afterSeq` bind is the previous snapshot's seq, which is the only observable
 * difference between bounded replay and a full one (case 12.87).
 *
 * `deps` is the caller's choice and it is the one thing the two doors differ
 * on: the pass hands the workspace's NEWEST definitions, the publish door hands
 * the definitions in force strictly below the publish. See
 * `ledger-deps.ts`'s `belowWorkspaceSeq` for why that difference exists.
 *
 * **The exception: a STALE snapshot (wtg2 T9).** A row whose `foldVersion` is
 * below `TICKET_FOLD_VERSION` was written before a retroactive member (work
 * periods) joined the state, so resuming from it would make every later fold
 * wrong. It is as good as none for folding: the fold starts from event 1 (the
 * tail read's `afterSeq` is 0), the provenance block is recomputed from the
 * whole history, and each event is folded with the definitions in force AT it
 * (`depsAsOfEvent`), never the caller's `deps`: a whole history can span a
 * state-dropping publish that the caller's definitions cannot fold (planner
 * ruling 2026-10-04, Q9). `asOf` is that resolver, memoized per definition
 * change; the background pass shares one across the pass, any other caller
 * gets a fresh one per call. Everything above about resuming holds for a
 * current-version snapshot only.
 */
export async function foldTicketHead(
  client: PoolClient,
  ticketId: string,
  deps: TicketStateDeps,
  asOf: DepsAsOfEvent = memoizedDepsAsOfEvent(),
): Promise<FoldedTicketHead | null> {
  const stored = await readLatestSnapshot(client, 'ticket', ticketId);
  // A snapshot written by an older fold is as good as none for FOLDING (wtg2 T9): see the docblock's exception.
  const stale = stored !== null && stored.foldVersion < TICKET_FOLD_VERSION;
  const previous = stale ? null : stored;
  // The bounded-replay claim, made structurally: the fold RESUMES from the
  // previous snapshot's state and reads only the tail past its seq. Folding
  // from event 1 would produce the same bytes and cost the whole history,
  // which is the cost this table exists to remove — so it is unobservable
  // in the result and pinned by the tail read's bind value instead
  // (case 12.87).
  let state = previous?.state as TicketState | undefined;
  const previousSeq = previous?.seq ?? 0;
  let seq = previousSeq;

  // CARRIED FORWARD from the previous row, then overwritten by anything the
  // tail actually claims. The carry is the load-bearing half and it is easy to
  // miss: this fold reads only the tail PAST `previousSeq`, and the
  // invalidation pass's ordinary case is `seq === previousSeq` — a re-state
  // with an EMPTY tail, re-folding head state onto a new vocabulary. Capturing
  // only from folded events would write `null` over a good block on every
  // workflow publish, and the read door would start refusing tickets it had
  // just been fixed for. Carrying forward is copying the SAME recorded instant
  // one more hop, which is what ruling P36 means by "copied, never computed".
  let stateClaim = previous?.provenance?.state ?? null;
  let assignedClaim = previous?.provenance?.assigned ?? null;

  const tail = await readEntityEvents(client, 'ticket', ticketId, seq);
  for (const env of tail) {
    seq = env.seq;
    if ((TICKET_EVENT_TYPES as readonly string[]).includes(env.type)) {
      // `foldTicketEvent`, not `applyTicketEvent`: a purged ticket's redacted
      // creation, and its redacted publish (drafts T2), produce no state
      // (spec §5.4), and the `state === undefined`
      // return below already means "nothing to snapshot".
      state = foldTicketEvent(state, env, stale ? await asOf(client, env) : deps);
    }
    // READ off the event row, never computed and never a neighbour's: these are
    // the two claims `TicketState` cannot carry. Every FIELD claim already
    // travels inside the state as a `FieldClaim` with its own clocks — which is
    // why a due date survives a snapshot-bounded bootstrap untouched and needs
    // nothing here. `transitions[]` carries `actorId` and `seq` and no clock at
    // all, so the state claim does; and the assignment claim is on no part of
    // the state.
    if (env.type === 'ticket.created' || env.type === 'ticket.transitioned' || env.type === 'ticket.published') {
      stateClaim = { actorId: env.actorId, clientTime: env.clientTime, serverTime: env.serverTime };
    }
    if (env.type === 'ticket.assigned') {
      assignedClaim = { actorId: env.actorId, clientTime: env.clientTime, serverTime: env.serverTime };
    }
  }
  // A ticket entity carrying only non-ticket events — a contest filed
  // before its `ticket.created` arrived. Nothing to snapshot yet; the next
  // pass picks it up once the creation lands.
  if (state === undefined) return null;
  // `assigned: null` is a FACT — nobody is assigned — and is not the same as
  // "we lost the claim". A ticket whose assignment was cleared keeps no stale
  // attribution, and one that was never assigned never had any; both read the
  // state rather than the event history, so the two agree by construction.
  const provenance: SnapshotProvenance | null =
    stateClaim === null
      ? null
      : { state: stateClaim, assigned: state.assigneeId === null ? null : assignedClaim };
  return { seq, state, previousSeq, provenance, restated: stale };
}

/**
 * Only what the loop reads. The query's `MAX(e.seq)` decides WHETHER an entity
 * is due; the seq the snapshot is stored at is derived from the tail read
 * instead, because between the two reads an event may have landed. Carrying the
 * query's head seq here would invite the next reader to store it, which would
 * put a snapshot at a seq whose event was never folded into it.
 */
type Due = { workspaceId: string; entityId: string };

/**
 * Writes a snapshot for every ticket whose head has run `minEvents` past its
 * latest snapshot. Plan 1 shipped the `snapshots` table with no writer and left
 * the policy here; the replica bootstrap (Task 6) is its first real reader.
 *
 * `state` is the DOMAIN REDUCER's fold at `seq` — `applyTicketEvent`, with deps
 * from `buildLedgerDeps`, never `proj_tickets`. That equivalence is the whole
 * point: a snapshot must be exactly the state a client computes from the same
 * events.
 *
 * "Snapshot + tail ≡ full replay on every replica" is the property that follows
 * — but only jointly with the SERVING side, and it was false until the fix
 * round that added this paragraph. This writer skips every type outside
 * `TICKET_EVENT_TYPES` while still advancing `seq` past it (see "seq counts
 * events, not folds" below), so such an event is in neither the snapshot nor,
 * by default, the tail. It reaches the replica only because
 * `BOOTSTRAP_BACKFILL_TYPES` names it, and that list has to cover EVERY
 * unfolded `entityKind: 'ticket'` type or the equivalence breaks for any ticket
 * whose stream carries the missing one below its snapshot seq. `visibility.set`
 * was missing from it, so the claim was false for exactly those tickets, and
 * silently — an identical event one seq higher was delivered in full.
 * `sync-routes.ts` carries the membership rule and the arithmetic.
 *
 * It also holds only for a row of the CURRENT fold. A row from an older fold is
 * refused until the boot pass settles (`bootRestate`), and after it too when the
 * row was created after the pass read its due set (an old instance's write during
 * a rolling deploy). A row whose restate failed is served as stored after the
 * pass, its periods missing, with a warning naming the ticket (wtg2 fold-version
 * bootstrap and overlap, `bootstrapTicket`).
 *
 * `proj_tickets` happens to be maintained by the same reducer today, which is
 * precisely why reading it would be an invisible mistake — it would agree until
 * it didn't.
 *
 * ## `seq` counts events, not folds
 *
 * The snapshot's `seq` advances over EVERY event on the ticket's stream,
 * including ones the reducer does not fold. `claim.contested` and
 * `claim.contested_resolved` are filed against `kind: 'ticket'` and are
 * deliberately absent from `TICKET_EVENT_TYPES`, so they move the cursor
 * without moving the state. A writer that advanced `seq` only on folded events
 * would write a snapshot whose seq sat behind events it had already passed, and
 * a replica resuming from it would be re-delivered them on every bootstrap.
 *
 * ## What this pass does NOT do, enumerated
 *
 * - **No locking.** It reads the head, folds and inserts without
 *   `lockEntity`; a concurrent ingest can append while the fold is in flight.
 *   That is safe rather than sloppy only because of the shape of the write: the
 *   row is keyed `(entity_kind, entity_id, seq)` and the fold is a pure
 *   function of events at or below that seq, so a late arrival changes nothing
 *   already computed — it becomes the next pass's work. It does mean the pass
 *   can write a snapshot that is stale the moment it lands, which is the
 *   ordinary condition of a snapshot.
 * - **Tickets only.** `entity_kind = 'ticket'` is hard-coded because
 *   `applyTicketEvent` is the only reducer in the domain package. No other kind
 *   is snapshotted and none is skipped silently — there is nothing else to fold.
 * - **No visibility, permission or tenancy gate.** It runs over every workspace
 *   in the database. It is a background maintenance pass with no caller
 *   identity; the route that SERVES a snapshot owes the gate.
 * - **No deletion of superseded snapshots.** The table grows one row per
 *   snapshot per entity forever. Retention is nobody's task yet — recorded, not
 *   fixed. Note this is NOT how a stale snapshot is invalidated: `readLatestSnapshot`
 *   is `ORDER BY seq DESC LIMIT 1`, so a higher-seq row supersedes for every
 *   reader and a DELETE would buy nothing but a longer replay. See
 *   `snapshot-refresh.ts`.
 * - **`deps` here resolve the NEWEST definitions, and that is safe only because
 *   of the publish door.** (A STALE snapshot is the exception: its restate
 *   folds the whole history with the definitions in force at each event,
 *   `memoizedDepsAsOfEvent`, planner ruling A of 2026-10-05 on Q9; see `foldTicketHead`.) `buildLedgerDeps` with no bound answers at the
 *   latest workflow version, so folding a tail that spans a state-dropping
 *   publish throws `applyTicketEvent: workflow "…" has no state "…"` — measured,
 *   not feared. What removes the span is `snapshot-refresh.ts`: every publish
 *   that raises a version re-snapshots each affected ticket AT ITS HEAD, so the
 *   next tail this pass reads starts above that publish. The two are one
 *   mechanism in two halves; weakening either re-opens the throw. A ticket the
 *   refresh SKIPS (it enumerates those) is one this pass can still throw on —
 *   but the converse fails, and the EQUALITY this sentence used to assert was
 *   false. `snapshot-refresh.ts` names a second population in the same
 *   enumeration: a ticket it never SEES. Its candidates come from
 *   `proj_tickets`, while this pass's own due query reads `events` and
 *   `snapshots` and never consults that table, so a workspace whose projections
 *   were reset but not rebuilt refreshes nothing, enumerates nothing, and
 *   arrives here with its tail unrepaired. A third difference is not about throwing at all: a
 *   candidate whose fold returns `null` lands in neither `rewritten` nor
 *   `skipped`, so that outcome does not partition its own candidates either.
 *   `skipped` is a LOWER BOUND on what can still throw here, never the set. The
 *   interval wrapper logs it by ticket and goes on to the next due ticket
 *   (`onTicketError`, wtg2 fold-version bootstrap), whichever population it came
 *   from; a call without that hook still ends at the throw.
 * - **The whole due set is folded in one call, serially.** Bounded by the
 *   number of tickets that crossed the threshold since the last pass, not by
 *   ledger size, but nothing here yields between entities. The exception is
 *   the first pass after a `TICKET_FOLD_VERSION` bump (wtg2 T9): every
 *   snapshotted ticket is stale then, so that pass restates ALL of them, each
 *   from its full history with a definition load per event.
 * - **`startSnapshotWriter` is not re-entrant.** `setInterval` fires the next
 *   pass whether or not the previous one returned, so a pass slower than
 *   `intervalMs` overlaps itself: both reads see the same previous snapshot,
 *   both fold to the same seq, and the second `writeSnapshot` dies on the
 *   snapshots primary key. That failure is caught and logged by the wrapper and
 *   the ledger is untouched, so the stated contract still holds — but the
 *   overlap is real and this list would be a lie without it. A running flag
 *   would close it; it is not added here because nothing yet establishes what a
 *   realistic pass costs, and a guard sized by guesswork is a second thing to
 *   be wrong about.
 * - **`previous.state` is cast, not parsed.** It comes back from a `jsonb`
 *   column as `unknown` and is asserted to be a `TicketState`. There is no
 *   `ticketStateSchema` in the domain package to validate it against — swept,
 *   against `ticketTypeDefSchema` as the control, which resolves — so the cast
 *   is the only option available and not a shortcut past one. The consequence:
 *   a snapshot row corrupted out of band is folded onto rather than refused,
 *   and surfaces as a reducer throw or a wrong state further downstream.
 */
export async function runSnapshotPass(
  pool: Pool,
  opts: {
    minEvents?: number;
    /**
     * When given, a ticket whose fold or write throws is reported here and the pass goes on to the next due ticket;
     * without it the throw ends the pass, as before (wtg2 fold-version bootstrap: `startSnapshotWriter` passes it, so one
     * unfoldable ticket cannot leave every stale ticket after it unrestated once `bootRestate` is complete).
     */
    onTicketError?: (ticketId: string, err: unknown) => void;
    /**
     * When given, the pass reads the DATABASE clock immediately before its due query and hands it here (wtg2
     * fold-version overlap): a row created after that instant is one this pass did not see. The boot pass passes it
     * (`bootRestate.dueAt`).
     */
    onDueAt?: (at: Date) => void;
  } = {},
): Promise<{ written: Array<{ entityId: string; seq: number }> }> {
  const minEvents = opts.minEvents ?? DEFAULT_MIN_EVENTS;
  if (opts.onDueAt !== undefined) opts.onDueAt((await pool.query<{ t: Date }>('SELECT now() AS t')).rows[0]!.t);
  // Due: the head ran `minEvents` past the LATEST snapshot, or that latest row was written by an older fold (wtg2 T9).
  // `DISTINCT ON` picks the latest row per ticket, and that is load-bearing: superseded rows are never deleted (below),
  // so a `fold_version < $2` over every row would keep a restated ticket due on every pass after its restate.
  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT e.workspace_id, e.entity_id
       FROM events e
       LEFT JOIN (
         SELECT DISTINCT ON (entity_id) entity_id, seq AS snap_seq, fold_version
           FROM snapshots WHERE entity_kind = 'ticket' ORDER BY entity_id, seq DESC
       ) s ON s.entity_id = e.entity_id
      WHERE e.entity_kind = 'ticket'
      GROUP BY e.workspace_id, e.entity_id, s.snap_seq, s.fold_version
     HAVING MAX(e.seq) - COALESCE(s.snap_seq, 0) >= $1 OR s.fold_version < $2
      ORDER BY e.entity_id`,
    [minEvents, TICKET_FOLD_VERSION],
  );
  const due: Due[] = rows.map((row) => ({
    workspaceId: row['workspace_id'] as string,
    entityId: row['entity_id'] as string,
  }));

  const written: Array<{ entityId: string; seq: number }> = [];
  // One deps load per workspace per pass, not per ticket: the definitions are
  // the same for every ticket in a workspace and the fold is pure, so caching
  // them cannot change an answer.
  const depsByWorkspace = new Map<string, Awaited<ReturnType<typeof buildLedgerDeps>>>();
  // The restate path's as-of definitions (wtg2 T9), memoized for the whole pass: one load per definition change.
  const asOf = memoizedDepsAsOfEvent();

  for (const item of due) {
    let deps = depsByWorkspace.get(item.workspaceId);
    if (deps === undefined) {
      deps = await buildLedgerDeps(pool, item.workspaceId);
      depsByWorkspace.set(item.workspaceId, deps);
    }
    const client = await pool.connect();
    try {
      const head = await foldTicketHead(client, item.entityId, deps, asOf);
      if (head === null) continue;
      // Reachable only through the programmatic door: `minEvents: 0` makes
      // every entity due on every pass, so a second pass would recompute a
      // snapshot at a seq that already has a row and collide on the snapshots
      // primary key. `SNAPSHOT_MIN_EVENTS` is `.positive()` in the config
      // schema, so no environment can produce a 0. Case 12.89 walks it.
      if (head.seq <= head.previousSeq) continue;
      // A restate may land on the seq its stale row already holds (no event since), so it overwrites; the plain
      // INSERT's primary-key collision stays reserved for overlapping passes (case 12.89).
      const write = head.restated ? overwriteSnapshot : writeSnapshot;
      await write(client, {
        entityKind: 'ticket',
        entityId: item.entityId,
        seq: head.seq,
        // Round-tripped through JSON so what is stored is byte-for-byte what a
        // client reads back, rather than whatever the in-memory object happened
        // to serialise to.
        state: JSON.parse(JSON.stringify(head.state)) as Record<string, unknown>,
        provenance: head.provenance,
      });
      written.push({ entityId: item.entityId, seq: head.seq });
    } catch (err) {
      if (opts.onTicketError === undefined) throw err;
      opts.onTicketError(item.entityId, err);
    } finally {
      client.release();
    }
  }
  return { written };
}

/**
 * Interval wrapper for the server entrypoint. A failing pass is logged and
 * swallowed: the ledger is untouched either way, and a background maintenance
 * task that can take the process down is a worse failure than a snapshot that
 * is one interval late. A ticket that throws is logged by id and the pass goes
 * on (`onTicketError`). The timer is `unref`'d so it never holds the process
 * open on its own.
 *
 * The FIRST pass it starts is the boot pass (wtg2 fold-version bootstrap): when
 * that pass settles, however it ended, it sets `bootRestate.complete` and
 * `bootRestate.dueAt` (the database clock it read before its due query), and from
 * then on a stale row created at or before `dueAt` is served as stored and
 * reported on `log`; one created after it is still refused (wtg2 fold-version
 * overlap).
 *
 * The returned stop function is the whole shutdown story this module owns —
 * `apps/server/src/index.ts` has no SIGTERM handler and no `pool.close()`, so
 * there is no existing shutdown path to hang it beside. It is registered on
 * Fastify's `onClose` hook there instead; see the comment at that call site.
 */
export function startSnapshotWriter(
  pool: Pool,
  opts: { intervalMs: number; minEvents: number; log?: (msg: string) => void; immediate?: boolean },
): () => void {
  const log = opts.log ?? ((): undefined => undefined);
  // A stale row served after the boot pass is reported on this same log (`bootRestate.warn`).
  bootRestate.warn = log;
  let first = true;
  const pass = (): void => {
    // The FIRST pass started is the boot pass, and only it sets the flag: an overlapping later pass (this wrapper is not
    // re-entrant) settling first must not declare the boot restate done.
    const boot = first;
    first = false;
    let dueAt: Date | null = null;
    void runSnapshotPass(pool, {
      minEvents: opts.minEvents,
      onTicketError: (ticketId, err) => {
        log(`snapshot pass: ticket ${ticketId} failed: ${String(err)}`);
      },
      ...(boot
        ? {
            onDueAt: (at: Date) => {
              dueAt = at;
            },
          }
        : {}),
    })
      .catch((err: unknown) => {
        log(`snapshot pass failed: ${String(err)}`);
      })
      .finally(() => {
        // Together: a reader never sees the pass complete with an earlier pass's `dueAt`, and a pass that failed before
        // its clock read publishes `null` (every stale row then served as stored, ruling D).
        if (boot) {
          bootRestate.dueAt = dueAt;
          bootRestate.complete = true;
        }
      });
  };
  // `immediate` (wtg2 T9): one pass now, before the first tick, so a deploy that bumps `TICKET_FOLD_VERSION` restates
  // the stale snapshots within seconds rather than one interval later.
  if (opts.immediate === true) pass();
  const timer = setInterval(pass, opts.intervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
