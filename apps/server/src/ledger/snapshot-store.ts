import type { Pool, PoolClient } from 'pg';
import { TICKET_FOLD_VERSION, type EntityKind } from '@gisik-nokma/domain';

/**
 * Snapshots bound per-entity replay: state as of seq, so a replay starts from
 * the latest snapshot instead of event 1. Plan 1 ships the primitive only —
 * nothing writes snapshots yet (see Open questions).
 */
/**
 * The claims a snapshot cannot otherwise carry, RECOVERED rather than invented.
 *
 * `TicketState` carries every FIELD claim's provenance inside itself —
 * `fields['dueDate']` is a `FieldClaim` with its own actor and both clocks, which
 * is why due dates survive a snapshot-bounded bootstrap untouched. The STATE
 * claim and the ASSIGNMENT claim are not in the state: `transitions[]` carries
 * `actorId` and `seq` and **no clock at all**. So those two, and only those two,
 * are what a snapshot has to carry separately — measured by enumerating every
 * `provenanceOf(...)` call the replica door makes, with `dueDate` as the control
 * that explains the mechanism rather than merely differing.
 *
 * `null` for `assigned` is a fact (nobody is assigned), not an absence.
 */
export type SnapshotProvenance = {
  state: { actorId: string; clientTime: string; serverTime: string };
  assigned: { actorId: string; clientTime: string; serverTime: string } | null;
};

export type Snapshot = {
  entityKind: EntityKind;
  entityId: string;
  seq: number;
  state: Record<string, unknown>;
  /**
   * `null` means a row written before ruling P36 added the column. It is shown
   * as UNKNOWN and never as unattributed: the read door keeps refusing such a
   * ticket until the next pass rewrites the row, which is the same answer it
   * gave before this column existed rather than a new and quieter one.
   */
  provenance: SnapshotProvenance | null;
  /**
   * The `TICKET_FOLD_VERSION` of the fold that wrote the row (wtg2 T9). 1 is every row written before work periods
   * existed: its `state` has no `periods` and no `rounds`, so the snapshot pass restates it from the ticket's full
   * history (`foldTicketHead`) instead of resuming from it. Never passed by a writer: both writes stamp the current
   * version, because a row is always written by the current fold. The database also sets 1 on a ticket row whose UPDATE
   * left `write_token` unchanged (an old instance's write during a rolling deploy; `writeSnapshot` below).
   */
  foldVersion: number;
  /**
   * `snapshots.created_at`: when the row was first inserted, on the DATABASE clock (the insert's own,
   * `clock_timestamp()`, not its transaction's start). An `overwriteSnapshot` landing on the row's seq leaves it as it
   * was; a demoted UPDATE (an old instance's, `writeSnapshot` below) re-stamps it with that write's clock. Read by
   * `bootstrapTicket` (wtg2 fold-version overlap, planner ruling E): a stale row created after `bootRestate.dueAt` (the
   * database clock the boot restate pass read before its due query) was written by an old instance during a rolling
   * deploy, not left behind by a restate that failed. Never passed by a writer: the column's default stamps it.
   */
  createdAt: Date;
};

/** What a writer hands over: a snapshot without its fold version, which the write stamps (`TICKET_FOLD_VERSION`), or its creation time. */
export type SnapshotInput = Omit<Snapshot, 'foldVersion' | 'createdAt'>;

/**
 * Both writes set a fresh `write_token` (wtg2 fold-version writer token, planner ruling F,
 * `migrations/1792100300000_snapshots-write-token.sql`). A rolling deploy runs the OLD instance's `overwriteSnapshot`
 * beside this code, and its DO UPDATE sets no `fold_version`: on a row this code restated it would write old-shape state
 * under the current fold. The trigger `snapshots_demote_tokenless_update` tells the two apart by the token: an UPDATE of
 * a ticket row that leaves it as it was is demoted (`fold_version` 1 and `created_at` that write's clock), so the
 * bootstrap refuses the row and the next pass restates it. A new UPDATE path that forgets the token is demoted too,
 * which costs one restate and never serves a stale row. The INSERT carries one so every row a writer leaves has its own.
 */
export async function writeSnapshot(client: PoolClient, snapshot: SnapshotInput): Promise<void> {
  await client.query(
    'INSERT INTO snapshots (entity_kind, entity_id, seq, state, provenance, fold_version, write_token) VALUES ($1, $2, $3, $4, $5, $6, gen_random_uuid())',
    [
      snapshot.entityKind,
      snapshot.entityId,
      snapshot.seq,
      JSON.stringify(snapshot.state),
      snapshot.provenance === null ? null : JSON.stringify(snapshot.provenance),
      TICKET_FOLD_VERSION,
    ],
  );
}

/**
 * The PUBLISH door's write, and the one difference from `writeSnapshot` above
 * is the whole reason it exists: it may land on a seq that already has a row.
 *
 * A workflow publish does not add an event to any ticket's stream, so a ticket
 * whose head is already snapshotted has its head state RE-STATED at the same
 * seq — the same events, folded onto the new vocabulary. `writeSnapshot`'s bare
 * INSERT dies on `snapshots_pkey` there, and it is right to: for the background
 * pass a collision means two passes overlapped and one of them is redundant
 * (`snapshot-writer.ts`, "not re-entrant"), which is a fault worth surfacing.
 * Here a collision is the ORDINARY case and the update is the point.
 *
 * Kept as a second named function rather than an `ON CONFLICT` added to
 * `writeSnapshot`, because that would silence the pass's collision too — the
 * one `test/sync/snapshot-writer.test.ts` case 12.89 exists to observe.
 */
export async function overwriteSnapshot(client: PoolClient, snapshot: SnapshotInput): Promise<void> {
  await client.query(
    `INSERT INTO snapshots (entity_kind, entity_id, seq, state, provenance, fold_version, write_token)
       VALUES ($1, $2, $3, $4, $5, $6, gen_random_uuid())
     ON CONFLICT (entity_kind, entity_id, seq)
       DO UPDATE SET state = excluded.state, provenance = excluded.provenance, fold_version = excluded.fold_version,
         write_token = excluded.write_token`,
    [
      snapshot.entityKind,
      snapshot.entityId,
      snapshot.seq,
      JSON.stringify(snapshot.state),
      // `excluded.provenance` above means a re-state OVERWRITES this column, so
      // a writer that passed `null` here on the invalidation pass would erase a
      // good block. `writeSnapshotsForWorkspace` carries the previous row's
      // block forward for exactly that reason — see its capture logic.
      snapshot.provenance === null ? null : JSON.stringify(snapshot.provenance),
      // A restate (wtg2 T9) lands on the seq a version-1 row already holds; the DO UPDATE above re-stamps it, so the
      // restated ticket is not due again.
      TICKET_FOLD_VERSION,
    ],
  );
}

export async function readLatestSnapshot(
  client: PoolClient | Pool,
  kind: EntityKind,
  id: string,
): Promise<Snapshot | null> {
  const result = await client.query<{
    seq: number;
    state: Record<string, unknown>;
    provenance: SnapshotProvenance | null;
    fold_version: number;
    created_at: Date;
  }>(
    `SELECT seq, state, provenance, fold_version, created_at FROM snapshots
     WHERE entity_kind = $1 AND entity_id = $2
     ORDER BY seq DESC LIMIT 1`,
    [kind, id],
  );
  const row = result.rows[0];
  if (row === undefined) {
    return null;
  }
  // `provenance` is read BACK, not merely written: the snapshot writer folds
  // from this row and reads only the tail past its seq, so on a re-state with an
  // empty tail — the invalidation pass's ordinary case — there is no state claim
  // to capture and the block has to be carried forward from here. A read that
  // dropped this column would make every workflow publish quietly erase it.
  return {
    entityKind: kind,
    entityId: id,
    seq: row.seq,
    state: row.state,
    provenance: row.provenance ?? null,
    foldVersion: row.fold_version,
    createdAt: row.created_at,
  };
}
