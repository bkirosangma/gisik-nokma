import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { lexicalNoteSearch, meaningNoteSearch } from '../../src/read/note-search.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';

/**
 * The Garo evaluation (spec §7.10, case 18.160, Plan 3 of 6).
 *
 * ## `🧪` until the owner supplies the pairs, and the skip SAYS SO
 *
 * The fixture ships as `{ "pairs": [] }`. Two things follow, and both are the
 * point of the case rather than an inconvenience:
 *
 * 1. It must SKIP rather than pass. A green suite over an empty fixture would be
 *    a claim that Garo search had been evaluated, which is exactly the kind of
 *    check that cannot fail.
 * 2. The skip PRINTS its reason. `check-no-silent-skips.mjs` fails a file that
 *    contributes zero passing-or-failing tests, so a silent skip would redden the
 *    suite for the wrong reason — and a bare `it.skip` with no message would tell
 *    the next reader nothing about why the number is missing.
 *
 * ## What it measures when the pairs exist
 *
 * `recall@5` for each mode, against a corpus of the expected notes. It is
 * deliberately the SAME 30–50 pairs for both: the question is not which mode is
 * better in general but which one a Garo speaker should be told to expect, and a
 * different corpus per mode would answer a different question. Spec §7.10 names
 * the consequence of the comparison: if meaning does no better than spelling,
 * the help text says search in Garo matches spelling rather than meaning.
 */
const FIXTURE_PATH = fileURLToPath(new URL('../fixtures/garo-eval.json', import.meta.url));

type GaroEval = { pairs: Array<{ query: string; expectedNoteTitle: string }> };

const fixture: GaroEval = JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as GaroEval;

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

describe('18.160 — the Garo evaluation', () => {
  if (fixture.pairs.length === 0) {
    // Printed with `console.log` rather than left to the `skipIf` machinery:
    // a run that reports "1 skipped" without saying why is how a fixture stays
    // empty for a year.
    console.log(
      'garo-eval: SKIPPED — apps/server/test/fixtures/garo-eval.json has no pairs. ' +
        'Spec §7.10 asks the owner for 30–50 {query, expectedNoteTitle} pairs; case 18.160 is 🧪 until they arrive.',
    );
    it.skip('measures recall@5 for both modes (awaiting the owner’s pairs)', () => undefined);
    return;
  }

  it('measures recall@5 for both modes', async () => {
    // The world: a workspace, a project, and one note per expected title. The
    // notes are created through the same projection and index the product uses,
    // so this measures the search and not a fixture.
    const workspaceId = newUlid();
    const projectId = newUlid();
    const actorId = newUlid();
    const stamp = { workspaceId, actorId };
    const events: LedgerEvent[] = [
      makeCommitted({ ...stamp, entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.created', payload: { name: 'Garo eval' } }),
      makeCommitted({ ...stamp, entity: { kind: 'project', id: projectId }, type: 'project.created', payload: { name: 'Eval' } }),
    ];
    const noteIds = new Map<string, string>();
    for (const pair of fixture.pairs) {
      if (noteIds.has(pair.expectedNoteTitle)) continue;
      const noteId = newUlid();
      noteIds.set(pair.expectedNoteTitle, noteId);
      events.push(
        makeCommitted({
          ...stamp,
          entity: { kind: 'note', id: noteId },
          type: 'note.created',
          payload: { title: pair.expectedNoteTitle, homeProjectId: projectId, scope: { mode: 'workspace' } },
        }),
      );
    }
    await applyCommitted(db.pool, events);

    const eff = await resolveEffectiveRole(db.pool, actorId, workspaceId);
    expect(eff.workspaceRole).toBe('owner');

    const TOP = 5;
    async function recallFor(mode: 'lexical' | 'meaning'): Promise<number> {
      let found = 0;
      for (const pair of fixture.pairs) {
        const hits =
          mode === 'lexical'
            ? (await lexicalNoteSearch(db.pool, eff, actorId, workspaceId, pair.query, {})).hits
            : await meaningNoteSearch(db.pool, eff, actorId, workspaceId, pair.query, {});
        const expected = noteIds.get(pair.expectedNoteTitle);
        if (hits.slice(0, TOP).some((hit) => hit.noteId === expected)) found += 1;
      }
      return found / fixture.pairs.length;
    }

    const lexical = await recallFor('lexical');
    const meaning = await recallFor('meaning');
    console.log(
      `garo-eval: ${String(fixture.pairs.length)} pairs — lexical recall@${String(TOP)} ${lexical.toFixed(3)}, ` +
        `meaning recall@${String(TOP)} ${meaning.toFixed(3)}. ` +
        (meaning <= lexical
          ? 'Meaning does NOT beat spelling, so the help text must say search in Garo matches spelling (spec §7.10).'
          : 'Meaning beats spelling.'),
    );

    // The ASSERTION is that the measurement ran and produced a number in range.
    // It deliberately does NOT assert a floor: the floor is the owner's to set
    // once the pairs exist, and inventing one here would turn a measurement into
    // a target nobody chose.
    expect(lexical).toBeGreaterThanOrEqual(0);
    expect(meaning).toBeGreaterThanOrEqual(0);
  });
});
