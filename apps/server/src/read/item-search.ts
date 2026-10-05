import type { FilterSpec, SearchHit } from '@gisik-nokma/domain';
import { foldSearchText } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { embedQuery } from '../search/embedding.js';
import { BLOCKED_STATES_CTE, compileFilterSpec } from './compile-filter.js';
import { MEANING_CANDIDATES, MEANING_LIMIT, snippetOf } from './note-search.js';
import { SqlParams } from './sql-params.js';
import { assembleTicketCards, PROJ_TICKET_COLUMNS, type ProjTicketRow } from './ticket-cards.js';
import { LIVE_TICKET_WHERE, visibleTicketsWhere } from './visible-where.js';

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
