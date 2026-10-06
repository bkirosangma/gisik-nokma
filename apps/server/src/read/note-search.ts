import { foldSearchText, type NoteScopeMode } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { embedQuery } from '../search/embedding.js';
import { FTS_CONFIG } from './fts.js';
import { HEADLINE_OPTIONS } from './headline.js';
import { attachedTicketsByNote, NOTE_HOME_SQL } from './notes.js';
import { SqlParams } from './sql-params.js';
import { visibleNotesWhere } from './visible-where.js';

/**
 * The three note search queries (spec §7.4–§7.6, Plan 3 of 6).
 *
 * ## Every statement carries the predicate, and none of them delegates it
 *
 * This file has the same rule `read/notes.ts` has, and it is the reason the
 * index (`proj_note_search`) is complete while every read is filtered: the
 * index holds everything, so the ONLY thing between a caller and a note they may
 * not read is the `visibleNotesWhere` fragment in each statement. A version of
 * this that fetched and then filtered in TypeScript would be one `if` away from
 * leaking, and the `if` would be written by whoever next needed an unfiltered
 * variant.
 *
 * The fragment is CONSUMED, never re-expressed: `visible-where.ts` is Plan 4's
 * decision table, and 18.021 already asserts that it agrees with `canReadNote`.
 *
 * ## Three functions, one per question the UI asks
 *
 * `lexicalNoteSearch` runs per keystroke (prefix, `ts_rank_cd` order).
 * `correctWords` runs only when that returns zero rows, and the search runs
 * ONCE more with the alternatives — a second misspelling is not chased, because
 * a query that has already been rewritten once returning nothing is an answer.
 * `meaningNoteSearch` runs after the typing pause and is a nearest-chunk scan.
 */

/** Spec §7.4's default. */
const SEARCH_LIMIT = 50;

/** Spec §7.6's first-20. Also KG-D T2's ticket meaning search (`item-search.ts`). */
export const MEANING_LIMIT = 20;

/** Spec §7.6's snippet length for a meaning hit. */
const MEANING_SNIPPET_CHARS = 160;

/** Spec §7.5's similarity floor. */
const CORRECTION_SIMILARITY = 0.3;

/** Spec §7.5's alternatives per word. */
const CORRECTION_ALTERNATIVES = 3;

export type NoteSearchHitRow = {
  noteId: string;
  /** The RAW title — what a person reads. The FOLDED one is only ever matched. */
  title: string;
  snippet: string;
  homeProjectId: string;
  scopeMode: NoteScopeMode;
  authorId: string;
  updatedAt: string;
  attachedTicketKeys: string[];
};

export type NoteSearchOptions = {
  authorId?: string;
  scopeMode?: NoteScopeMode;
  limit?: number;
  /** Injected by tests; the real query embedder by default. */
  embed?: (text: string) => Promise<Float32Array>;
};

/**
 * The words of a folded query, ready to be spelled into a `tsquery` literal.
 *
 * ## Why the filter and the escaping are here rather than in SQL
 *
 * `to_tsquery` takes a QUERY STRING, not a parameter — its argument position is
 * a grammar, and no bind parameter can be put in it. So the query text reaches
 * SQL as text, and this function is the only thing standing between a person's
 * keystrokes and that grammar. Two jobs:
 *
 * - **Drop words that are not words.** The fold lowercases and unifies the raka
 *   mark but does not remove punctuation, so `!!!` survives it and would become
 *   the lexeme `'!!!'` in the query — a term that can never match, turning a
 *   search for `wobble !!!` into a conjunction with something false. A word with
 *   no letter or digit in it is dropped instead.
 * - **Escape what is left.** A `'` or a `\` inside a tsquery literal has to be
 *   doubled/escaped or the grammar refuses the whole query with a syntax error,
 *   which a person would see as search being broken for some queries and not
 *   others.
 */
function tsqueryWords(q: string): string[] {
  return foldSearchText(q)
    .split(' ')
    .filter((word) => /[\p{L}\p{N}]/u.test(word))
    .map((word) => `'${word.replace(/\\/g, '\\\\').replace(/'/g, "''")}'`);
}

/** Spec §7.4: every word ANDed, the LAST one a prefix. */
function directQuery(words: string[]): string {
  const last = words[words.length - 1] ?? '';
  return [...words.slice(0, -1), `${last}:*`].join(' & ');
}

/**
 * Spec §7.5's rewrite: each word becomes `(w | alt1 | alt2 | alt3)`, the LAST
 * one still a prefix.
 *
 * **The original word stays IN the disjunction**, exactly as the spec writes it.
 * That is not decoration: it is what lets a query whose words are mostly right
 * still match, and it is why a word with no alternatives at all needs no special
 * case — the disjunction is then just the word. The prefix goes on EVERY
 * alternative of the last position rather than on the parenthesised group,
 * because `( 'a' | 'b' ):*` is a tsquery SYNTAX ERROR (measured) while
 * `( 'a':* | 'b':* )` parses and matches.
 */
function correctedQuery(words: string[], alternatives: string[][]): string {
  return words
    .map((word, index) => {
      const isLast = index === words.length - 1;
      const pieces = [word, ...(alternatives[index] ?? [])].map((piece) => (isLast ? `${piece}:*` : piece));
      return pieces.length === 1 ? pieces[0]! : `(${pieces.join(' | ')})`;
    })
    .join(' & ');
}

async function hitsFor(
  db: Queryable,
  eff: EffectiveRole,
  userId: string,
  workspaceId: string,
  tsquery: string,
  options: NoteSearchOptions,
): Promise<NoteSearchHitRow[]> {
  const params = new SqlParams();
  const workspace = params.add(workspaceId);
  const query = params.add(tsquery);
  const visible = visibleNotesWhere(eff, userId, params);
  const filters = [
    options.authorId === undefined ? null : `n.author_id = ${params.add(options.authorId)}`,
    options.scopeMode === undefined ? null : `n.scope_mode = ${params.add(options.scopeMode)}`,
  ].filter((clause): clause is string => clause !== null);
  const limit = params.add(options.limit ?? SEARCH_LIMIT);

  const { rows } = await db.query<{
    note_id: string;
    title: string;
    home_project_id: string;
    scope_mode: NoteScopeMode;
    author_id: string;
    updated_at: Date;
    snippet: string;
  }>(
    `SELECT s.note_id, n.title AS title, ${NOTE_HOME_SQL} AS home_project_id, n.scope_mode, n.author_id, n.updated_at,
            ts_headline(${quoteConfig()}, s.body_text, to_tsquery(${quoteConfig()}, ${query}),
                        ${params.add(HEADLINE_OPTIONS)}) AS snippet,
            ts_rank_cd(s.tsv, to_tsquery(${quoteConfig()}, ${query})) AS rank
       FROM proj_note_search s
       JOIN proj_notes n ON n.note_id = s.note_id
      WHERE s.workspace_id = ${workspace} AND n.deleted = FALSE
        AND s.tsv @@ to_tsquery(${quoteConfig()}, ${query})
        AND ${visible}
        ${filters.map((clause) => `AND ${clause}`).join('\n        ')}
      ORDER BY rank DESC, n.updated_at DESC
      LIMIT ${limit}`,
    params.toArray(),
  );

  const attached = await attachedTicketsByNote(
    db,
    eff,
    userId,
    workspaceId,
    rows.map((row) => row.note_id),
  );
  return rows.map((row) => ({
    noteId: row.note_id,
    title: row.title,
    snippet: row.snippet,
    homeProjectId: row.home_project_id,
    scopeMode: row.scope_mode,
    authorId: row.author_id,
    updatedAt: row.updated_at.toISOString(),
    attachedTicketKeys: (attached.get(row.note_id) ?? []).map((ticket) => ticket.key),
  }));
}

/**
 * `FTS_CONFIG` as SQL text. It is a text-search configuration name, which is an
 * IDENTIFIER position and not a value position, so it cannot be bound — see
 * `fts.ts`, which argues this at length and notes that no actor input reaches
 * it. Interpolated here for the same reason it is interpolated there, and the
 * two spellings are the same constant.
 */
function quoteConfig(): string {
  return `'${FTS_CONFIG}'`;
}

/**
 * Spec §7.4. Returns the hits and, only when they are empty, the correction.
 *
 * The correction is reported rather than applied silently: `corrected` is what
 * lets the UI say "showing results for …", and a search that quietly answers a
 * different question than the one asked is a thing people cannot debug.
 */
export async function lexicalNoteSearch(
  db: Queryable,
  eff: EffectiveRole,
  userId: string,
  workspaceId: string,
  q: string,
  options: NoteSearchOptions = {},
): Promise<{ hits: NoteSearchHitRow[]; corrected?: string[] }> {
  const words = tsqueryWords(q);
  if (words.length === 0) return { hits: [] };

  const direct = await hitsFor(db, eff, userId, workspaceId, directQuery(words), options);
  if (direct.length > 0) return { hits: direct };

  const alternatives = await correctWords(db, workspaceId, words);
  if (alternatives === null) return { hits: [] };

  // ONE rerun. A query that has already been rewritten once and still finds
  // nothing is an answer, not a reason to try again.
  const rerun = await hitsFor(db, eff, userId, workspaceId, correctedQuery(words, alternatives), options);
  if (rerun.length === 0) return { hits: [] };
  return { hits: rerun, corrected: alternatives.flat().map((word) => unquote(word)) };
}

/**
 * Spec §7.5, for each word: the vocabulary's nearest alternatives.
 *
 * Returns `null` when NO word has an alternative, which is how the caller tells
 * "the correction found nothing better" from "the correction was not worth
 * running" — and it is what stops a query whose words are all already correct
 * from being rerun against itself.
 *
 * ## The threshold is pinned in the statement, not in a session setting
 *
 * Spec §7.5 says `SET LOCAL pg_trgm.similarity_threshold = 0.3` "in the same
 * transaction". A session setting is not available here: this runs on a POOL,
 * where `SET LOCAL` outside a transaction is a no-op and a plain `SET` would
 * leak into whichever request next borrows that connection. So the threshold is
 * spelled as `similarity(lexeme, $w) >= 0.3` — the same test the `%` operator
 * performs — and `lexeme % $w` is kept ALONGSIDE it, because that is the form
 * the trigram index can serve: the conjunction means the same thing under the
 * default GUC and still means 0.3 if an operator ever changes it.
 */
/** A tsquery literal back to the word it spells: the inverse of `tsqueryWords`. */
function unquote(literal: string): string {
  return literal.replace(/^'|'$/g, '').replace(/''/g, "'").replace(/\\\\/g, '\\');
}

export async function correctWords(
  db: Queryable,
  workspaceId: string,
  words: readonly string[],
): Promise<string[][] | null> {
  const corrections: string[][] = [];
  let any = false;
  for (const word of words) {
    const bare = unquote(word);
    const params = new SqlParams();
    const workspace = params.add(workspaceId);
    const term = params.add(bare);
    const { rows } = await db.query<{ lexeme: string }>(
      `SELECT lexeme FROM proj_note_lexemes
        WHERE workspace_id = ${workspace}
          AND lexeme % ${term}
          AND similarity(lexeme, ${term}) >= ${CORRECTION_SIMILARITY}
        ORDER BY similarity(lexeme, ${term}) DESC
        LIMIT ${CORRECTION_ALTERNATIVES}`,
      params.toArray(),
    );
    const lexemes = rows.map((row) => `'${row.lexeme.replace(/'/g, "''")}'`);
    corrections.push(lexemes);
    if (lexemes.length > 0) any = true;
  }
  return any ? corrections : null;
}

/**
 * Spec §7.6's nearest-chunk query.
 *
 * ## `DISTINCT ON`, then an outer query that sorts and cuts
 *
 * The inner query takes the nearest chunk PER NOTE; the outer one sorts those by
 * distance and keeps the first 20. Two queries because the two orderings are
 * different questions: `DISTINCT ON (note_id)` needs `note_id` first in its
 * ORDER BY, and the answer needs distance first. The cut belongs to the outer
 * query only: a `LIMIT` on the inner one cuts in `note_id` order, a ULID, so once
 * a workspace held more chunked notes than the bound the newest were never
 * candidates however near they were (18.496 — spec §7.6's `LIMIT 200` did that).
 * `note_id` after distance makes equal distances come back in one order (18.497).
 * KG-D T2's ticket meaning search (`meaningTicketHits`, `item-search.ts`) has the
 * same shape.
 *
 * Deleted notes are excluded by the JOIN to `proj_notes` rather than by trusting
 * the worker to have removed their chunks: the worker does remove them (18.139),
 * but a read that depended on a background loop having caught up would answer
 * differently at different moments.
 */
export async function meaningNoteSearch(
  db: Queryable,
  eff: EffectiveRole,
  userId: string,
  workspaceId: string,
  q: string,
  options: NoteSearchOptions = {},
): Promise<NoteSearchHitRow[]> {
  const folded = foldSearchText(q);
  if (folded === '') return [];
  const embed = options.embed ?? embedQuery;
  const vector = await embed(folded);

  const params = new SqlParams();
  const workspace = params.add(workspaceId);
  const query = params.add(`[${Array.from(vector).join(',')}]`);
  const visible = visibleNotesWhere(eff, userId, params);
  const filters = [
    options.authorId === undefined ? null : `n.author_id = ${params.add(options.authorId)}`,
    options.scopeMode === undefined ? null : `n.scope_mode = ${params.add(options.scopeMode)}`,
  ].filter((clause): clause is string => clause !== null);

  const { rows } = await db.query<{
    note_id: string;
    title: string;
    home_project_id: string;
    scope_mode: NoteScopeMode;
    author_id: string;
    updated_at: Date;
    chunk_text: string;
    distance: number;
  }>(
    `SELECT * FROM (
       SELECT DISTINCT ON (c.note_id)
              c.note_id, n.title, ${NOTE_HOME_SQL} AS home_project_id, n.scope_mode, n.author_id, n.updated_at,
              c.chunk_text, (c.embedding <=> ${query}::vector) AS distance
         FROM search_note_chunks c
         JOIN proj_notes n ON n.note_id = c.note_id
        WHERE c.workspace_id = ${workspace} AND n.deleted = FALSE
          AND ${visible}
          ${filters.map((clause) => `AND ${clause}`).join('\n          ')}
        ORDER BY c.note_id, distance
     ) d
     ORDER BY d.distance, d.note_id
     LIMIT ${params.add(MEANING_LIMIT)}`,
    params.toArray(),
  );

  const attached = await attachedTicketsByNote(
    db,
    eff,
    userId,
    workspaceId,
    rows.map((row) => row.note_id),
  );
  return rows.map((row) => ({
    noteId: row.note_id,
    title: row.title,
    snippet: snippetOf(row.chunk_text),
    homeProjectId: row.home_project_id,
    scopeMode: row.scope_mode,
    authorId: row.author_id,
    updatedAt: row.updated_at.toISOString(),
    attachedTicketKeys: (attached.get(row.note_id) ?? []).map((ticket) => ticket.key),
  }));
}

/**
 * The chunk's text with its heading line removed, cut to 160 characters.
 *
 * The heading is already in `heading_path` and is shown as the hit's location,
 * so repeating it inside the snippet would spend the first line of a 160-char
 * window saying where the reader already is. Exported for KG-D T2's ticket
 * meaning search (`item-search.ts`), so a meaning snippet is cut one way.
 */
export function snippetOf(chunkText: string): string {
  const newline = chunkText.indexOf('\n');
  const body = newline === -1 ? chunkText : chunkText.slice(newline + 1);
  return body.slice(0, MEANING_SNIPPET_CHARS);
}
