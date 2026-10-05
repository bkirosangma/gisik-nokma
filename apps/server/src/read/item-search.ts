import type { FilterSpec, SearchHit, SimilarHit } from '@gisik-nokma/domain';
import { foldSearchText } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { embedQuery } from '../search/embedding.js';
import { BLOCKED_STATES_CTE, compileFilterSpec } from './compile-filter.js';
import { MEANING_CANDIDATES, MEANING_LIMIT, snippetOf } from './note-search.js';
import { SqlParams } from './sql-params.js';
import { assembleTicketCards, PROJ_TICKET_COLUMNS, type ProjTicketRow } from './ticket-cards.js';
import { LIVE_TICKET_WHERE, visibleNotesWhere, visibleTicketsWhere } from './visible-where.js';

/**
 * Spec D §2 + §5.1: meaning search over tickets, from `search_item_chunks`. The nearest chunk PER TICKET
 * (`DISTINCT ON`, then sorted in code: `meaningNoteSearch`'s two-step, and its bounds and snippet, imported).
 * Visibility at QUERY time through the same WHERE as lexical tickets (`routes/search.ts`); a comment
 * follows its ticket because its row carries `ticket_id`. Deleted comments are excluded by the join, never
 * by trusting the worker to have caught up.
 *
 * `matchedIn`: a ticket's chunk 0 is its title (`'title'`), its other chunks its description
 * (`'description'`), and a comment's chunk `'comment'` — the lexical route's three words, so a client
 * reads one vocabulary in both modes.
 */
export async function meaningTicketHits(
  db: Queryable,
  eff: EffectiveRole,
  viewerId: string,
  workspaceId: string,
  q: string,
  spec: FilterSpec,
  options: { embed?: (text: string) => Promise<Float32Array> } = {},
): Promise<SearchHit[]> {
  const folded = foldSearchText(q);
  if (folded === '') return [];
  const vector = await (options.embed ?? embedQuery)(folded);
  const params = new SqlParams();
  const query = params.add(`[${Array.from(vector).join(',')}]`);
  const where = [
    `c.workspace_id = ${params.add(workspaceId)}`,
    `c.chunk_text <> ''`,
    visibleTicketsWhere(eff, viewerId, params),
    LIVE_TICKET_WHERE,
    `(c.item_kind = 'ticket' OR EXISTS (SELECT 1 FROM proj_ticket_comments k WHERE k.comment_id = c.item_id AND k.deleted_at IS NULL))`,
  ];
  const compiled = compileFilterSpec(spec, params);
  where.push(...compiled.clauses);
  const cte = compiled.needsBlockedCte ? `WITH ${BLOCKED_STATES_CTE} ` : '';
  const { rows } = await db.query<ProjTicketRow & { chunk_text: string; item_kind: 'ticket' | 'comment'; chunk_index: number; distance: number }>(
    `${cte}SELECT DISTINCT ON (t.ticket_id) ${PROJ_TICKET_COLUMNS},
            c.chunk_text, c.item_kind, c.chunk_index, (c.embedding <=> ${query}::vector) AS distance
       FROM search_item_chunks c
       JOIN proj_tickets t ON t.ticket_id = c.ticket_id
       JOIN proj_visibility v ON v.ticket_id = t.ticket_id
      WHERE ${where.join(' AND ')}
      ORDER BY t.ticket_id, distance
      LIMIT ${params.add(MEANING_CANDIDATES)}`,
    params.toArray(),
  );
  const ordered = [...rows].sort((a, b) => Number(a.distance) - Number(b.distance)).slice(0, MEANING_LIMIT);
  const cards = await assembleTicketCards(db, viewerId, ordered);
  const cardById = new Map(cards.map((card) => [card.ticketId, card]));
  return ordered.map((row) => {
    const card = cardById.get(row.ticket_id);
    if (card === undefined) throw new Error(`meaningTicketHits: no card assembled for ticket ${row.ticket_id}`);
    const matchedIn: SearchHit['matchedIn'] = row.item_kind === 'comment' ? 'comment' : row.chunk_index === 0 ? 'title' : 'description';
    return { card, snippet: snippetOf(row.chunk_text), matchedIn };
  });
}

/** Spec D §5.1's `similar k ≤ 20`. The route refuses a `k` outside 1–20; `similarItems` clamps to it as well. */
export const SIMILAR_MAX_K = 20;

/**
 * Spec D §5.1 `similar`: the nearest visible items by meaning. An item's vector is the mean of its chunk vectors
 * (§4.1 step 1); a ticket's includes its comments'. pgvector's `avg(vector)` is the mean, and `<=>` normalises,
 * so the mean need not be re-normalised. The SOURCE's visibility is the route's question (404), not this one's,
 * so `[]` (no chunks yet) and a 404 (not yours to see) stay different answers.
 */
export async function similarItems(
  db: Queryable,
  eff: EffectiveRole,
  viewerId: string,
  workspaceId: string,
  item: { kind: 'ticket' | 'note'; id: string },
  k: number,
): Promise<SimilarHit[]> {
  const sourceSql =
    item.kind === 'ticket'
      ? `SELECT avg(c.embedding)::text AS v FROM search_item_chunks c WHERE c.ticket_id = $1 AND c.workspace_id = $2 AND c.chunk_text <> ''`
      : `SELECT avg(c.embedding)::text AS v FROM search_note_chunks c WHERE c.note_id = $1 AND c.workspace_id = $2`;
  const source = await db.query<{ v: string | null }>(sourceSql, [item.id, workspaceId]);
  const vector = source.rows[0]?.v ?? null;
  if (vector === null) return [];
  const params = new SqlParams();
  const ws = params.add(workspaceId);
  const src = params.add(vector);
  const ticketVisible = visibleTicketsWhere(eff, viewerId, params);
  const noteVisible = visibleNotesWhere(eff, viewerId, params);
  const kindParam = params.add(item.kind);
  const idParam = params.add(item.id);
  const { rows } = await db.query<SimilarHit>(
    `WITH items AS (
       SELECT 'ticket'::text AS kind, t.ticket_id AS id, coalesce(t.fields->'title'->>'value', '') AS title, avg(c.embedding) AS v
         FROM search_item_chunks c
         JOIN proj_tickets t ON t.ticket_id = c.ticket_id
         JOIN proj_visibility v ON v.ticket_id = t.ticket_id
        WHERE c.workspace_id = ${ws} AND c.chunk_text <> '' AND ${LIVE_TICKET_WHERE} AND ${ticketVisible}
          AND (c.item_kind = 'ticket' OR EXISTS (SELECT 1 FROM proj_ticket_comments k WHERE k.comment_id = c.item_id AND k.deleted_at IS NULL))
        GROUP BY t.ticket_id, t.fields
       UNION ALL
       SELECT 'note'::text, n.note_id, n.title, avg(c.embedding)
         FROM search_note_chunks c JOIN proj_notes n ON n.note_id = c.note_id
        WHERE c.workspace_id = ${ws} AND n.deleted = FALSE AND ${noteVisible}
        GROUP BY n.note_id, n.title
     )
     SELECT kind, id, title, 1 - (v <=> ${src}::vector) AS score
       FROM items
      WHERE NOT (kind = ${kindParam} AND id = ${idParam})
      ORDER BY v <=> ${src}::vector, kind, id
      LIMIT ${params.add(Math.min(Math.max(k, 1), SIMILAR_MAX_K))}`,
    params.toArray(),
  );
  return rows.map((row) => ({ ...row, score: Number(row.score) }));
}
