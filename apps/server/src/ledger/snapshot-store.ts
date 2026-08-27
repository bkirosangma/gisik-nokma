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
