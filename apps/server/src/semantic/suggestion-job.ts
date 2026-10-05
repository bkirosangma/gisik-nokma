import type { Pool } from 'pg';
import { newUlid } from '@gisik-nokma/domain';
import { LIVE_TICKET_WHERE } from '../read/visible-where.js';
import { SUGGESTION_K, SUGGESTION_MAX_SIZE, SUGGESTION_MIN_SIZE, SUGGESTION_SEED, SUGGESTION_TAU } from './constants.js';
import { noteAudienceKey, ticketAudienceKey } from './partition.js';
import { suggestAll, type PipelineItem } from './pipeline.js';
import { itemKey, parseItemKey } from './signature.js';
import { meanUnit } from './vectors.js';

/** pgvector's text form `[1,2,3]` → a Float32Array. */
function parseVector(text: string): Float32Array {
  return Float32Array.from(text.slice(1, -1).split(',').map(Number));
}

/**
 * Spec D §4.1, for one workspace. Reads the item vectors the embed worker wrote (the mean of an item's chunks; a
 * ticket's comments fold into the ticket), partitions by audience, runs the pure pipeline, and REPLACES the
 * workspace's `sem_suggestions` rows in one transaction, upserting by signature so a surviving suggestion keeps its id.
 *
 * - **The audience map covers every LIVE ticket, embedded or not.** An `inherit` note's partition is the keys of its
 *   live attached tickets (`partition.ts`), and a ticket the worker has not reached yet is still one of them; a map
 *   built from the embedded tickets alone would file the note under the wrong audience (27.487).
 * - **Fail-closed on a ticket with no `proj_visibility` row:** it has no audience key, so it is no item, rather than
 *   being filed under a guessed one.
 * - **Live only:** a trashed ticket, a ticket in a deleted project and a deleted note are no items, so their rows
 *   leave the cache on the next run. D4 is not decided here: every read re-checks it per reader (`routes/suggestions.ts`).
 */
export async function runSuggestionJob(
  pool: Pool,
  workspaceId: string,
  options: { now?: Date } = {},
): Promise<{ suggestions: number; items: number; ms: number }> {
  const started = performance.now();
  const audiences = await pool.query<{ id: string; resolved_mode: 'workspace' | 'project' | 'explicit'; project_id: string; resolved_user_ids: string[] }>(
    `SELECT t.ticket_id AS id, v.resolved_mode, v.project_id, v.resolved_user_ids
       FROM proj_tickets t JOIN proj_visibility v ON v.ticket_id = t.ticket_id
      WHERE t.workspace_id = $1 AND ${LIVE_TICKET_WHERE}`,
    [workspaceId],
  );
  const ticketKey = new Map(
    audiences.rows.map((row) => [row.id, ticketAudienceKey({ resolvedMode: row.resolved_mode, projectId: row.project_id, resolvedUserIds: row.resolved_user_ids })]),
  );
  const tickets = await pool.query<{ id: string; v: string; text: string }>(
    `SELECT c.ticket_id AS id, avg(c.embedding)::text AS v, string_agg(c.chunk_text, ' ' ORDER BY c.item_kind DESC, c.chunk_index) AS text
       FROM search_item_chunks c
      WHERE c.workspace_id = $1 AND c.chunk_text <> ''
      GROUP BY c.ticket_id`,
    [workspaceId],
  );
  const notes = await pool.query<{
    id: string;
    v: string;
    text: string;
    scope_mode: string;
    author_id: string;
    home_project_id: string;
    scope_user_ids: string[];
    attached: string[];
  }>(
    `SELECT n.note_id AS id, avg(c.embedding)::text AS v, string_agg(c.chunk_text, ' ' ORDER BY c.chunk_index) AS text,
            n.scope_mode, n.author_id, n.home_project_id, n.scope_user_ids,
            coalesce((SELECT array_agg(a.ticket_id) FROM proj_note_attachments a WHERE a.note_id = n.note_id), '{}') AS attached
       FROM search_note_chunks c JOIN proj_notes n ON n.note_id = c.note_id
      WHERE c.workspace_id = $1 AND n.deleted = FALSE
      GROUP BY n.note_id`,
    [workspaceId],
  );
  const items: PipelineItem[] = [
    ...tickets.rows.flatMap((row) => {
      const partition = ticketKey.get(row.id); // undefined: not live, or no audience row
      return partition === undefined ? [] : [{ key: itemKey('ticket', row.id), partition, vector: meanUnit([parseVector(row.v)]), text: row.text }];
    }),
    ...notes.rows.map((row) => ({
      key: itemKey('note', row.id),
      partition: noteAudienceKey({
        scopeMode: row.scope_mode as Parameters<typeof noteAudienceKey>[0]['scopeMode'],
        authorId: row.author_id,
        homeProjectId: row.home_project_id,
        scopeUserIds: row.scope_user_ids,
        inheritedKeys: row.attached.flatMap((ticketId) => {
          const key = ticketKey.get(ticketId);
          return key === undefined ? [] : [key];
        }),
      }),
      vector: meanUnit([parseVector(row.v)]),
      text: row.text,
    })),
  ];
  const tags = await pool.query<{ item_kind: 'ticket' | 'note'; item_id: string; concept_id: string }>(
    `SELECT i.item_kind, i.item_id, i.concept_id FROM proj_concept_items i JOIN proj_concepts c ON c.concept_id = i.concept_id
      WHERE i.workspace_id = $1 AND c.deleted = FALSE`,
    [workspaceId],
  );
  const conceptsByItem = new Map<string, string[]>();
  for (const row of tags.rows) {
    const key = itemKey(row.item_kind, row.item_id);
    conceptsByItem.set(key, [...(conceptsByItem.get(key) ?? []), row.concept_id]);
  }
  const rejected = (
    await pool.query<{ item_hashes: string[] }>('SELECT item_hashes FROM proj_concept_rejections WHERE workspace_id = $1', [workspaceId])
  ).rows.map((row) => ({ itemHashes: row.item_hashes }));

  const suggestions = suggestAll(items, {
    k: SUGGESTION_K,
    tau: SUGGESTION_TAU,
    seed: SUGGESTION_SEED,
    minSize: SUGGESTION_MIN_SIZE,
    maxSize: SUGGESTION_MAX_SIZE,
    conceptsOf: (key) => conceptsByItem.get(key) ?? [],
    rejected,
  });

  const now = options.now ?? new Date();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM sem_suggestions WHERE workspace_id = $1 AND NOT (signature = ANY ($2::text[]))', [
      workspaceId,
      suggestions.map((s) => s.signature),
    ]);
    for (const s of suggestions) {
      const refs = s.itemKeys.map(parseItemKey);
      await client.query(
        `INSERT INTO sem_suggestions (id, workspace_id, signature, partition_key, item_kind, item_id, item_hashes, terms, label, score, computed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (workspace_id, signature) DO UPDATE SET terms = EXCLUDED.terms, label = EXCLUDED.label, score = EXCLUDED.score,
           computed_at = EXCLUDED.computed_at`,
        [newUlid(), workspaceId, s.signature, s.partition, refs.map((r) => r.kind), refs.map((r) => r.id), s.itemHashes, s.terms, s.label, s.score, now],
      );
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
  return { suggestions: suggestions.length, items: items.length, ms: performance.now() - started };
}
