import type { Pool, PoolClient } from 'pg';
import type { EntityKind } from '@gisik-nokma/domain';

/**
 * Snapshots bound per-entity replay: state as of seq, so a replay starts from
 * the latest snapshot instead of event 1. Plan 1 ships the primitive only —
 * nothing writes snapshots yet (see Open questions).
 */
export type Snapshot = {
  entityKind: EntityKind;
  entityId: string;
  seq: number;
  state: Record<string, unknown>;
};

export async function writeSnapshot(client: PoolClient, snapshot: Snapshot): Promise<void> {
  await client.query(
    'INSERT INTO snapshots (entity_kind, entity_id, seq, state) VALUES ($1, $2, $3, $4)',
    [snapshot.entityKind, snapshot.entityId, snapshot.seq, JSON.stringify(snapshot.state)],
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
export async function overwriteSnapshot(client: PoolClient, snapshot: Snapshot): Promise<void> {
  await client.query(
    `INSERT INTO snapshots (entity_kind, entity_id, seq, state) VALUES ($1, $2, $3, $4)
     ON CONFLICT (entity_kind, entity_id, seq) DO UPDATE SET state = excluded.state`,
    [snapshot.entityKind, snapshot.entityId, snapshot.seq, JSON.stringify(snapshot.state)],
  );
}

export async function readLatestSnapshot(
  client: PoolClient | Pool,
  kind: EntityKind,
  id: string,
): Promise<Snapshot | null> {
  const result = await client.query<{ seq: number; state: Record<string, unknown> }>(
    `SELECT seq, state FROM snapshots
     WHERE entity_kind = $1 AND entity_id = $2
     ORDER BY seq DESC LIMIT 1`,
    [kind, id],
  );
  const row = result.rows[0];
  if (row === undefined) {
    return null;
  }
  return { entityKind: kind, entityId: id, seq: row.seq, state: row.state };
}
