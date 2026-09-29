import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { purgeItem } from '../../src/purge/purge-item.js';
import { startEmbedWorker } from '../../src/search/embed-worker.js';
import { applyCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { doc, dueAt, ev, noteCreated, projectCreated, recordingStore, seedWorkspace, text } from './world.js';

/**
 * Whole-branch review finding (Important): the embed worker embeds OUTSIDE any
 * transaction and writes afterwards, so a purge that lands in between must not
 * be undone by the worker's INSERT. Case 19.160 (`test-cases/19-trash.md`
 * §19.15).
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
}, 60_000);

afterAll(async () => {
  await db.drop();
});

describe('19.160 a purge that lands while the embed worker is mid-call is not undone', () => {
  it('writes no chunk for the erased note, and sweeps a chunk row whose note is gone', async () => {
    const base = await seedWorkspace(db.pool);
    const [P, N, NL] = [newUlid(), newUlid(), newUlid()];
    await applyCommitted(db.pool, [
      projectCreated(base, P, 'Race', 'RC'),
      noteCreated(base, N, { title: 'Doomed', homeProjectId: '', scope: { mode: 'workspace' }, body: doc(text('doomed words')) }),
      noteCreated(base, NL, { title: 'Live', homeProjectId: '', scope: { mode: 'workspace' }, body: doc(text('live words')) }),
    ]);
    let raced = false;
    const worker = startEmbedWorker(db.pool, {
      intervalMs: 3_600_000,
      model: 'test-model@1',
      embedTexts: async (texts) => {
        if (!raced && texts.some((piece) => piece.includes('doomed'))) {
          raced = true;
          // The purge lands while the worker holds the note's vectors in memory.
          await applyCommitted(db.pool, [ev(base, 'note', N, 'note.deleted', {}), ev(base, 'note', N, 'purge.marked', {})]);
          await purgeItem(db.pool, { kind: 'note', id: N }, {
            projections: buildProjectionRegistry(),
            store: recordingStore(),
            now: await dueAt(db.pool, 'note', N),
          });
        }
        return texts.map(() => new Float32Array(512).fill(0.5));
      },
    });
    try {
      // ONE pass, not a drain: the next pass's orphan sweep would hide a chunk
      // the racing write left behind.
      await worker.runOnce();
    } finally {
      worker.stop();
    }
    expect(raced).toBe(true);
    const chunksOf = async (id: string) =>
      (await db.pool.query('SELECT 1 FROM search_note_chunks WHERE note_id = $1', [id])).rowCount;
    expect(await chunksOf(N)).toBe(0);
    expect(await chunksOf(NL)).toBe(1); // CONTROL — the live note is embedded

    // An orphaned chunk row (its note is gone) is removed by the next pass.
    await db.pool.query(
      `INSERT INTO search_note_chunks (note_id, chunk_index, workspace_id, heading_path, chunk_text, model, source_seq, embedding)
       VALUES ($1, 0, $2, '', 'orphan', 'test-model@1', 1, $3)`,
      [N, base.WS, `[${new Array(512).fill(0.5).join(',')}]`],
    );
    const sweeper = startEmbedWorker(db.pool, { intervalMs: 3_600_000, model: 'test-model@1', embedTexts: async (t) => t.map(() => new Float32Array(512)) });
    try {
      await sweeper.runOnce();
    } finally {
      sweeper.stop();
    }
    expect(await chunksOf(N)).toBe(0);
  }, 60_000);
});
