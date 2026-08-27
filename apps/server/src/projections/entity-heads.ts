import type { Pool, PoolClient } from 'pg';
import type { EntityHead, EntityKind } from '@gisik-nokma/domain';
import type { Projection } from './registry.js';

/**
 * Reference projection: the newest committed event (the head) per entity.
 * One row per entity; every column derives from ledger rows alone.
 * The head_seq guard makes apply idempotent and replay-safe: a stale or
 * duplicate apply can never move a head backwards.
 */
export const entityHeadsProjection: Projection = {
  name: 'proj_entity_heads',
  tables: ['proj_entity_heads'],

  async apply(event, tx) {
    await tx.query(
      `INSERT INTO proj_entity_heads
         (entity_kind, entity_id, workspace_id, head_seq, head_event_id, head_event_type, head_server_time)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (entity_kind, entity_id) DO UPDATE SET
         workspace_id = excluded.workspace_id,
         head_seq = excluded.head_seq,
         head_event_id = excluded.head_event_id,
         head_event_type = excluded.head_event_type,
         head_server_time = excluded.head_server_time
       WHERE excluded.head_seq > proj_entity_heads.head_seq`,
      [
        event.entity.kind,
        event.entity.id,
        event.workspaceId,
        event.seq,
        event.id,
        event.type,
        event.serverTime,
      ],
    );
  },

  async reset(tx) {
    await tx.query('TRUNCATE proj_entity_heads');
  },
};

export async function readEntityHead(
  client: PoolClient | Pool,
  kind: EntityKind,
  id: string,
): Promise<EntityHead | null> {
  const result = await client.query<{ head_seq: number; head_event_id: string; head_event_type: string }>(
    'SELECT head_seq, head_event_id, head_event_type FROM proj_entity_heads WHERE entity_kind = $1 AND entity_id = $2',
    [kind, id],
  );
  const row = result.rows[0];
  if (row === undefined) {
    return null;
  }
  return {
    kind,
    id,
    headSeq: row.head_seq,
    headEventId: row.head_event_id,
    headEventType: row.head_event_type,
  };
}
