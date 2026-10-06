import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { backfillNoteVocabularies } from '../../src/projections/backfill-note-vocabularies.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Case 18.531 (task/kg-vocab-rederive-all): the one-shot vocabulary re-derive, measured before shipping, at the
 * planner's size (5 workspaces x 1 000 notes). Each workspace's re-derive is one transaction under its workspace lock,
 * so `maxEntityMs` is how long ingest for that workspace waits at worst during the boot.
 *
 * VOCAB_PERF=1 [VOCAB_PERF_WORKSPACES=<w>] [VOCAB_PERF_NOTES=<n>]
 * The rows are written straight into `proj_note_search` (bulk INSERT): the pass reads only that table and
 * `proj_note_lexemes`. Each note has a 6-word title, a 300-word body and, for every other note, one ticket line, drawn
 * from 5 000 words per workspace, so the text is denser than a typical note and the number errs high.
 */
const ENABLED = process.env['VOCAB_PERF'] === '1';
const WORKSPACES = Number(process.env['VOCAB_PERF_WORKSPACES'] ?? '5');
const NOTES = Number(process.env['VOCAB_PERF_NOTES'] ?? '1000');
const WORDS = 5_000;

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
}, 600_000);
afterAll(async () => {
  await db.drop();
});

/** A deterministic word list: `w` + base-36 index, padded so every word passes the three-letter rule. */
const wordOf = (index: number) => `w${index.toString(36).padStart(3, '0')}`;
let state = 7;
const pick = () => {
  state = (state * 48271) % 2147483647;
  return wordOf(state % WORDS);
};
const words = (count: number) => Array.from({ length: count }, pick).join(' ');

describe('18.531 the vocabulary re-derive at the planner\'s size', () => {
  if (!ENABLED) {
    console.log('vocab-perf: SKIPPED — set VOCAB_PERF=1 to measure the one-shot vocabulary re-derive (5 workspaces x 1 000 notes).');
    it.skip('measures the vocabulary re-derive (set VOCAB_PERF=1)', () => undefined);
    return;
  }
  it('18.531 re-derives every workspace\'s vocabulary, drops the residue, and reports the run and its longest workspace', async () => {
    const workspaces = Array.from({ length: WORKSPACES }, () => newUlid());
    /** Per workspace, the words its rows hold (the three-letter rule of spec §7.3): what the vocabulary must become. */
    const expected = new Map<string, number>();
    for (const workspaceId of workspaces) {
      const ids: string[] = [];
      const titles: string[] = [];
      const bodies: string[] = [];
      const tickets: string[] = [];
      for (let index = 0; index < NOTES; index++) {
        ids.push(newUlid());
        titles.push(words(6));
        bodies.push(words(300));
        tickets.push(index % 2 === 0 ? `ws-${index} ${words(5)}\n` : '');
      }
      const held = new Set(
        [...titles, ...bodies, ...tickets].flatMap((text) => text.split(/[^\p{L}\p{N}]+/u)).filter((word) => word.length >= 3),
      );
      expect(held.has('licence')).toBe(false);
      expected.set(workspaceId, held.size);
      await db.pool.query(
        `INSERT INTO proj_note_search (note_id, workspace_id, home_project_id, title, body_text, ticket_text)
         SELECT unnest($1::text[]), $2, '', unnest($3::text[]), unnest($4::text[]), unnest($5::text[])`,
        [ids, workspaceId, titles, bodies, tickets],
      );
      // The vocabulary as the index left it, plus a residue word no row holds.
      await db.pool.query(
        `INSERT INTO proj_note_lexemes (workspace_id, lexeme)
         SELECT $1, unnest($2::text[]) ON CONFLICT DO NOTHING`,
        [workspaceId, [...Array.from({ length: WORDS }, (_, index) => wordOf(index)), 'licence']],
      );
    }
    const before = await db.pool.query<{ count: string }>('SELECT count(*) FROM proj_note_lexemes');

    const result = await backfillNoteVocabularies(db.pool);
    const after = await db.pool.query<{ count: string }>('SELECT count(*) FROM proj_note_lexemes');
    const residue = await db.pool.query("SELECT 1 FROM proj_note_lexemes WHERE lexeme = 'licence'");
    console.log(
      `vocab-perf: ${WORKSPACES} workspaces x ${NOTES} notes: run ${result.ms.toFixed(0)} ms, longest workspace ${result.maxEntityMs.toFixed(0)} ms; lexemes ${before.rows[0]?.count} -> ${after.rows[0]?.count}`,
    );
    expect(result).toMatchObject({ ran: true, entities: WORKSPACES });
    expect(residue.rowCount).toBe(0);
    // Every word a row holds is in its workspace's vocabulary, and no other: one insert per workspace loses none.
    const counts = await db.pool.query<{ workspace_id: string; count: string }>('SELECT workspace_id, count(*) FROM proj_note_lexemes GROUP BY workspace_id');
    expect(new Map(counts.rows.map((row) => [row.workspace_id, Number(row.count)]))).toEqual(expected);
  }, 600_000);
});
