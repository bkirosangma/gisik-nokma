import type { Pool, PoolClient } from 'pg';
import {
  applyTicketEvent,
  TICKET_EVENT_TYPES,
  type TicketState,
  type TicketStateDeps,
} from '@gisik-nokma/domain';
import { readEntityEvents } from '../ledger/event-store.js';
import { readLatestSnapshot, writeSnapshot } from '../ledger/snapshot-store.js';
import { buildLedgerDeps } from './ledger-deps.js';

const DEFAULT_MIN_EVENTS = 20;

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
 */
export type FoldedTicketHead = { seq: number; state: TicketState; previousSeq: number };

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
 */
export async function foldTicketHead(
  client: PoolClient,
  ticketId: string,
  deps: TicketStateDeps,
): Promise<FoldedTicketHead | null> {
  const previous = await readLatestSnapshot(client, 'ticket', ticketId);
  // The bounded-replay claim, made structurally: the fold RESUMES from the
  // previous snapshot's state and reads only the tail past its seq. Folding
  // from event 1 would produce the same bytes and cost the whole history,
  // which is the cost this table exists to remove — so it is unobservable
  // in the result and pinned by the tail read's bind value instead
  // (case 12.87).
  let state = previous?.state as TicketState | undefined;
  const previousSeq = previous?.seq ?? 0;
  let seq = previousSeq;
  const tail = await readEntityEvents(client, 'ticket', ticketId, seq);
  for (const env of tail) {
    seq = env.seq;
    if ((TICKET_EVENT_TYPES as readonly string[]).includes(env.type)) {
      state = applyTicketEvent(state, env, deps);
    }
  }
  // A ticket entity carrying only non-ticket events — a contest filed
  // before its `ticket.created` arrived. Nothing to snapshot yet; the next
  // pass picks it up once the creation lands.
  if (state === undefined) return null;
  return { seq, state, previousSeq };
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
 *   of the publish door.** `buildLedgerDeps` with no bound answers at the
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
 *   interval wrapper logs and swallows it whichever population it came from.
 * - **The whole due set is folded in one call, serially.** Bounded by the
 *   number of tickets that crossed the threshold since the last pass, not by
 *   ledger size, but nothing here yields between entities.
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
  opts: { minEvents?: number } = {},
): Promise<{ written: Array<{ entityId: string; seq: number }> }> {
  const minEvents = opts.minEvents ?? DEFAULT_MIN_EVENTS;
  const { rows } = await pool.query<Record<string, unknown>>(
    `SELECT e.workspace_id, e.entity_id
       FROM events e
       LEFT JOIN (
         SELECT entity_id, MAX(seq) AS snap_seq
           FROM snapshots WHERE entity_kind = 'ticket' GROUP BY entity_id
       ) s ON s.entity_id = e.entity_id
      WHERE e.entity_kind = 'ticket'
      GROUP BY e.workspace_id, e.entity_id, s.snap_seq
     HAVING MAX(e.seq) - COALESCE(s.snap_seq, 0) >= $1
      ORDER BY e.entity_id`,
    [minEvents],
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

  for (const item of due) {
    let deps = depsByWorkspace.get(item.workspaceId);
    if (deps === undefined) {
      deps = await buildLedgerDeps(pool, item.workspaceId);
      depsByWorkspace.set(item.workspaceId, deps);
    }
    const client = await pool.connect();
    try {
      const head = await foldTicketHead(client, item.entityId, deps);
      if (head === null) continue;
      // Reachable only through the programmatic door: `minEvents: 0` makes
      // every entity due on every pass, so a second pass would recompute a
      // snapshot at a seq that already has a row and collide on the snapshots
      // primary key. `SNAPSHOT_MIN_EVENTS` is `.positive()` in the config
      // schema, so no environment can produce a 0. Case 12.89 walks it.
      if (head.seq <= head.previousSeq) continue;
      await writeSnapshot(client, {
        entityKind: 'ticket',
        entityId: item.entityId,
        seq: head.seq,
        // Round-tripped through JSON so what is stored is byte-for-byte what a
        // client reads back, rather than whatever the in-memory object happened
        // to serialise to.
        state: JSON.parse(JSON.stringify(head.state)) as Record<string, unknown>,
      });
      written.push({ entityId: item.entityId, seq: head.seq });
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
 * is one interval late. The timer is `unref`'d so it never holds the process
 * open on its own.
 *
 * The returned stop function is the whole shutdown story this module owns —
 * `apps/server/src/index.ts` has no SIGTERM handler and no `pool.close()`, so
 * there is no existing shutdown path to hang it beside. It is registered on
 * Fastify's `onClose` hook there instead; see the comment at that call site.
 */
export function startSnapshotWriter(
  pool: Pool,
  opts: { intervalMs: number; minEvents: number; log?: (msg: string) => void },
): () => void {
  const log = opts.log ?? ((): undefined => undefined);
  const timer = setInterval(() => {
    void runSnapshotPass(pool, { minEvents: opts.minEvents }).catch((err: unknown) => {
      log(`snapshot pass failed: ${String(err)}`);
    });
  }, opts.intervalMs);
  timer.unref();
  return () => {
    clearInterval(timer);
  };
}
