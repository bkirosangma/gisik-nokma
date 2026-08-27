import type { Pool, PoolClient } from 'pg';
import type { EntityKind, EventEnvelope, Origin } from '@gisik-nokma/domain';

/**
 * Serialises all seq assignment for one entity within the current transaction.
 * Key: 64-bit hash of 'kind:id'. Released automatically at COMMIT/ROLLBACK.
 */
export async function lockEntity(client: PoolClient, kind: EntityKind, id: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${kind}:${id}`]);
}

/** Next per-entity sequence number; only meaningful after lockEntity in the same transaction. */
export async function nextSeq(client: PoolClient, kind: EntityKind, id: string): Promise<number> {
  const result = await client.query<{ head: number }>(
    'SELECT coalesce(max(seq), 0)::bigint AS head FROM events WHERE entity_kind = $1 AND entity_id = $2',
    [kind, id],
  );
  return (result.rows[0]?.head ?? 0) + 1;
}

/**
 * Serialises all workspace_seq assignment for one workspace within the current
 * transaction (coordination §18). Key: 64-bit hash of 'workspace-seq:<id>' —
 * a namespace deliberately disjoint from lockEntity's 'workspace:<id>', so the
 * stream lock and the workspace-entity lock never collide.
 *
 * Lock order is always workspace first, then entity — one global order across
 * the whole server, so two ingests can never deadlock by taking the pair in
 * opposite orders.
 */
export async function lockWorkspace(client: PoolClient, workspaceId: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `workspace-seq:${workspaceId}`,
  ]);
}

/** Next workspace stream cursor; only meaningful after lockWorkspace in the same transaction. */
export async function nextWorkspaceSeq(client: PoolClient, workspaceId: string): Promise<number> {
  const result = await client.query<{ head: number }>(
    'SELECT coalesce(max(workspace_seq), 0)::bigint AS head FROM events WHERE workspace_id = $1',
    [workspaceId],
  );
  return (result.rows[0]?.head ?? 0) + 1;
}

/**
 * What the ledger stores: the contract-frozen domain envelope plus the
 * server-assigned workspace stream cursor. `EventEnvelope` itself does not
 * gain the field — clients never author it and treat it as opaque.
 */
export type LedgerEvent = EventEnvelope & { workspaceSeq: number };

export async function insertEvent(client: PoolClient, event: LedgerEvent): Promise<void> {
  await client.query(
    `INSERT INTO events
       (id, workspace_id, entity_kind, entity_id, type, version, payload, actor_id, origin, client_time, server_time, seq, workspace_seq)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
    [
      event.id,
      event.workspaceId,
      event.entity.kind,
      event.entity.id,
      event.type,
      event.version,
      JSON.stringify(event.payload),
      event.actorId,
      event.origin,
      event.clientTime,
      event.serverTime,
      event.seq,
      event.workspaceSeq,
    ],
  );
}

/**
 * snake_case row shape of the events table as pg returns it. Both time columns
 * are timestamptz, so both arrive as Date — absolute instants, whatever offset
 * the submitter stated.
 */
export type EventRow = {
  id: string;
  workspace_id: string;
  entity_kind: EntityKind;
  entity_id: string;
  type: string;
  version: number;
  payload: unknown;
  actor_id: string;
  origin: Origin;
  client_time: Date;
  server_time: Date;
  seq: number;
  workspace_seq: number;
};

/**
 * Row → domain envelope. Both clocks re-emit as ISO 8601 'Z' at millisecond
 * precision: the instant is exactly what was submitted; the offset label the
 * device attached is not preserved, because it was a label on this instant and
 * never a separate fact (owner decision: time is Asia/Kolkata). The claimed
 * instant and the received instant stay two independent fields — that is the
 * distinction the spec cares about, and it is untouched.
 */
export function rowToEnvelope(row: EventRow): LedgerEvent {
  return {
    id: row.id,
    workspaceId: row.workspace_id,
    entity: { kind: row.entity_kind, id: row.entity_id },
    type: row.type,
    version: row.version,
    payload: row.payload,
    actorId: row.actor_id,
    origin: row.origin,
    clientTime: row.client_time.toISOString(),
    serverTime: row.server_time.toISOString(),
    seq: row.seq,
    workspaceSeq: row.workspace_seq,
  };
}

/**
 * Per-entity history in seq order; afterSeq supports per-entity catch-up.
 * A WORKSPACE stream resumes by workspace_seq instead — per-entity seq cannot
 * order a workspace (coordination §18); Plan 4's visibleEventsFor owns that read.
 */
export async function readEntityEvents(
  client: PoolClient | Pool,
  kind: EntityKind,
  id: string,
  afterSeq = 0,
): Promise<LedgerEvent[]> {
  const result = await client.query<EventRow>(
    'SELECT * FROM events WHERE entity_kind = $1 AND entity_id = $2 AND seq > $3 ORDER BY seq',
    [kind, id, afterSeq],
  );
  return result.rows.map(rowToEnvelope);
}

/**
 * CANONICAL REPLAY ORDER: (entity_kind, entity_id, seq) — a total order over
 * the ledger (the triple is unique). Replay guarantees per-entity causality
 * only; a projection's table contents must be a pure function of the ledger's
 * rows, never of cross-entity arrival interleaving. workspace_seq changes
 * nothing here: it orders live streams, never replay.
 * In-memory load is fine at Plan-1 scale; the plan that first ships a
 * large-ledger deployment swaps this for a cursor without changing callers.
 */
export async function readLedger(client: PoolClient | Pool): Promise<LedgerEvent[]> {
  const result = await client.query<EventRow>(
    'SELECT * FROM events ORDER BY entity_kind, entity_id, seq',
  );
  return result.rows.map(rowToEnvelope);
}

export function isUniqueViolation(error: unknown, constraint: string): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const candidate = error as { code?: unknown; constraint?: unknown };
  return candidate.code === '23505' && candidate.constraint === constraint;
}
