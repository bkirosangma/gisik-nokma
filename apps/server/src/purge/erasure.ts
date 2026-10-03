import type { PoolClient } from 'pg';
import type { LifecycleKind } from '@gisik-nokma/domain';
import { rowToEnvelope, type EventRow } from '../ledger/event-store.js';
import type { ProjectionRegistry } from '../projections/registry.js';
import { workspaceScopedTables } from './table-rules.js';

/**
 * The non-ledger half of a purge (trash series Plan 2, D1). `purge_ledger`
 * has already removed or redacted the set's `events`/`snapshots` rows in this
 * same transaction; everything here deletes by the erasure set, per the rules
 * in `./table-rules.ts`.
 */

export type PurgeTarget = { kind: LifecycleKind; id: string };

export type ErasureSet = {
  target: PurgeTarget;
  workspaceId: string;
  entities: ReadonlyArray<{ kind: string; id: string }>;
  ticketIds: string[];
  noteIds: string[];
  projectIds: string[];
};

export function toErasureSet(
  target: PurgeTarget,
  workspaceId: string,
  rows: ReadonlyArray<{ erased_kind: string; erased_id: string }>,
): ErasureSet {
  const entities = rows.map((row) => ({ kind: row.erased_kind, id: row.erased_id }));
  const of = (kind: string): string[] => entities.filter((entity) => entity.kind === kind).map((entity) => entity.id);
  return { target, workspaceId, entities, ticketIds: of('ticket'), noteIds: of('note'), projectIds: of('project') };
}

function kindsAndIds(set: ErasureSet): [string[], string[]] {
  return [set.entities.map((entity) => entity.kind), set.entities.map((entity) => entity.id)];
}

/** The attachment object keys the set owns — read BEFORE the rows are deleted. */
export async function objectKeysOf(db: PoolClient, set: ErasureSet): Promise<string[]> {
  const { rows } =
    set.target.kind === 'workspace'
      ? await db.query<{ object_key: string }>(
          'SELECT object_key FROM attachments WHERE workspace_id = $1 ORDER BY object_key',
          [set.workspaceId],
        )
      : await db.query<{ object_key: string }>(
          `SELECT object_key FROM attachments
            WHERE ticket_id = ANY($1::text[]) OR note_id = ANY($2::text[])
            ORDER BY object_key`,
          [set.ticketIds, set.noteIds],
        );
  return rows.map((row) => row.object_key);
}

/**
 * Deletes the set's rows from every non-ledger table (rules `erase` and
 * `rederive` in `PURGE_TABLE_RULES`). Survivor re-derivation is Task 7's
 * `rederiveSurvivors`; entity heads of the rows that REMAIN are re-derived by
 * `replayRemaining` below.
 */
export async function eraseRows(db: PoolClient, set: ErasureSet): Promise<void> {
  if (set.target.kind === 'workspace') {
    await eraseWorkspace(db, set.workspaceId);
    return;
  }
  const [kinds, ids] = kindsAndIds(set);
  await db.query(
    `DELETE FROM proj_entity_heads h
      USING unnest($1::text[], $2::text[]) AS s(kind, id)
      WHERE h.entity_kind = s.kind AND h.entity_id = s.id`,
    [kinds, ids],
  );
  const T = set.ticketIds;
  const N = set.noteIds;
  const P = set.projectIds;
  const statements: ReadonlyArray<readonly [string, unknown[]]> = [
    ['DELETE FROM proj_tickets WHERE ticket_id = ANY($1::text[])', [T]],
    ['DELETE FROM proj_visibility WHERE ticket_id = ANY($1::text[])', [T]],
    ['DELETE FROM proj_rollups WHERE parent_ticket_id = ANY($1::text[])', [T]],
    ['DELETE FROM proj_search WHERE ticket_id = ANY($1::text[])', [T]],
    ['DELETE FROM proj_ticket_comments WHERE ticket_id = ANY($1::text[])', [T]],
    ['DELETE FROM proj_contested WHERE ticket_id = ANY($1::text[])', [T]],
    [`DELETE FROM notifications WHERE payload->>'ticketId' = ANY($1::text[])`, [T]],
    ['DELETE FROM attachments WHERE ticket_id = ANY($1::text[]) OR note_id = ANY($2::text[])', [T, N]],
    ['DELETE FROM proj_note_attachments WHERE ticket_id = ANY($1::text[]) OR note_id = ANY($2::text[])', [T, N]],
    ['DELETE FROM proj_notes WHERE note_id = ANY($1::text[])', [N]],
    ['DELETE FROM proj_note_comments WHERE note_id = ANY($1::text[])', [N]],
    ['DELETE FROM proj_note_search WHERE note_id = ANY($1::text[])', [N]],
    ['DELETE FROM search_note_chunks WHERE note_id = ANY($1::text[])', [N]],
    [
      `DELETE FROM proj_references
        WHERE (source_parent_kind = 'ticket' AND source_parent_id = ANY($1::text[]))
           OR (source_parent_kind = 'note' AND source_parent_id = ANY($2::text[]))
           OR (target_kind = 'ticket' AND target_id = ANY($1::text[]))
           OR (target_kind = 'note' AND target_id = ANY($2::text[]))`,
      [T, N],
    ],
    ['DELETE FROM proj_memberships WHERE project_id = ANY($1::text[])', [P]],
    ['DELETE FROM proj_project_prefixes WHERE project_id = ANY($1::text[])', [P]],
    ['DELETE FROM proj_projects WHERE project_id = ANY($1::text[])', [P]],
  ];
  for (const [sql, params] of statements) {
    await db.query(sql, params);
  }
  // A project's keys in each member's preferences (`listColumns`, `grouping`
  // are keyed by project id — `packages/domain/src/preferences.ts:111-117`).
  // `savedFilters` cannot name a project or a ticket, so it is left alone.
  for (const projectId of P) {
    await db.query(
      `UPDATE user_preferences
          SET doc = doc #- ARRAY['listColumns', $2::text] #- ARRAY['grouping', $2::text]
        WHERE workspace_id = $1 AND (doc->'listColumns' ? $2 OR doc->'grouping' ? $2)`,
      [set.workspaceId, projectId],
    );
  }
}

/**
 * A workspace purge: every row of every workspace-scoped table (derived from
 * `PURGE_TABLE_RULES`, so a new table with a rule is covered without an edit),
 * and the tokens of its invites — deleted FIRST, because `proj_invites` is how
 * they are found. Rows of any other workspace are never touched, even for a
 * user who belongs to both (Review Focus 3).
 */
async function eraseWorkspace(db: PoolClient, workspaceId: string): Promise<void> {
  await db.query(
    'DELETE FROM invite_tokens WHERE invite_id IN (SELECT invite_id FROM proj_invites WHERE workspace_id = $1)',
    [workspaceId],
  );
  for (const table of workspaceScopedTables()) {
    await db.query(`DELETE FROM ${table} WHERE workspace_id = $1`, [workspaceId]);
  }
}

/** Every erased id, content-free (D2). `ON CONFLICT DO NOTHING`: a project purge may re-meet a ticket purged earlier (D11). */
export async function recordPurged(db: PoolClient, set: ErasureSet, purgedAt: string): Promise<void> {
  const [kinds, ids] = kindsAndIds(set);
  await db.query(
    `INSERT INTO purged_entities (entity_kind, entity_id, workspace_id, purged_at)
     SELECT s.kind, s.id, $3, $4 FROM unnest($1::text[], $2::text[]) AS s(kind, id)
     ON CONFLICT (entity_kind, entity_id) DO NOTHING`,
    [kinds, ids, set.workspaceId, purgedAt],
  );
}

/**
 * The set's rows that REMAIN in the ledger — a ticket purge's redacted
 * creations and, since drafts T2, its redacted publishes — replayed through
 * every projection, in canonical replay order. A rebuild derives a
 * `proj_entity_heads` row from each; every other projection skips a redacted
 * creation (Task 3) and a redacted publish (drafts T2:
 * `isRedactedTicketPublished`). Live must equal rebuild.
 */
export async function replayRemaining(
  db: PoolClient,
  set: ErasureSet,
  projections: ProjectionRegistry,
): Promise<void> {
  const [kinds, ids] = kindsAndIds(set);
  const { rows } = await db.query<EventRow>(
    `SELECT e.* FROM events e
       JOIN unnest($1::text[], $2::text[]) AS s(kind, id) ON e.entity_kind = s.kind AND e.entity_id = s.id
      ORDER BY e.entity_kind, e.entity_id, e.seq`,
    [kinds, ids],
  );
  for (const row of rows) {
    const event = rowToEnvelope(row);
    for (const projection of projections.all()) {
      await projection.apply(event, db);
    }
  }
}
