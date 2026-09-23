import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { lexicalNoteSearch, meaningNoteSearch } from '../../src/read/note-search.js';
import { startEmbedWorker } from '../../src/search/embed-worker.js';
import { seedSearchCorpus } from '../../src/tools/seed-search-corpus.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';

/**
 * Spec §7.9's targets (case 18.162, Plan 3 of 6).
 *
 * ## `NOTES_PERF=1` or it does not run, and that is the whole of its CI story
 *
 * Seeding ten thousand notes and embedding them takes minutes and a gigabyte;
 * a suite that did it on every run would be a suite people disable. So the case
 * is gated, and when it is skipped it PRINTS what it would have measured — a
 * silent skip would leave the targets unstated for as long as the gate is off.
 *
 * ## Why the corpus is seeded through the LEDGER even here
 *
 * `seedSearchCorpus` submits events, so every projection runs and the embedding
 * worker's own staleness query finds real work. A corpus written straight into
 * `proj_note_search` would measure a database the product cannot produce, and
 * the meaning target is about CHUNKS — which only the worker writes.
 *
 * ## What is measured, exactly
 *
 * p95 over 100 queries per mode, server-side, on this machine, with the machine
 * named in the output. `p95` rather than a mean because a search that is usually
 * fast and sometimes two seconds is a search that feels broken; the tail is the
 * thing a person notices.
 */
const ENABLED = process.env['NOTES_PERF'] === '1';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
}, 600_000);
afterAll(async () => {
  await db.drop();
});

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const at = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, at)] as number;
}

describe('18.161–18.162 the corpus and the targets', () => {
  if (!ENABLED) {
    console.log(
      'notes-perf: SKIPPED — set NOTES_PERF=1 to seed 10 000 notes and measure spec §7.9’s targets ' +
        '(p95 lexical ≤ 50 ms, meaning ≤ 150 ms, worker ≥ 20 chunks/s).',
    );
    it.skip('seeds the corpus and measures p95 (set NOTES_PERF=1)', () => undefined);
    return;
  }

  it('18.161 — the corpus seeds, and the worker embeds it', async () => {
    // An owner, because the client door requires one — the same door
    // `seedSearchCorpus`'s own docblock explains it submits through.
    const ownerId = newUlid();
    const bootstrap: LedgerEvent[] = [];
    const ingest = createIngestService({
      pool: db.pool,
      evaluate: evaluateEvent,
      projections: buildProjectionRegistry(),
    });

    const seeded = await seedSearchCorpus(
      { ingest, ownerUserId: ownerId, now: () => new Date() },
      { workspaces: 3, notes: 10_000 },
    );
    void bootstrap;
    console.log(
      `notes-perf: seeded ${String(seeded.notes)} notes / ${String(seeded.workspaces)} workspaces / ` +
        `${String(seeded.words)} words in ${String(seeded.elapsedMs)} ms`,
    );

    const worker = startEmbedWorker(db.pool, { intervalMs: 60_000 });
    const started = Date.now();
    let processed = 0;
    // The worker's batch is 20 notes, so this loops until it reports nothing
    // left. The cap is a safety net, not a target: a corpus that never finishes
    // must end the case rather than hang it.
    for (let pass = 0; pass < 1000; pass += 1) {
      const done = await worker.runOnce();
      processed += done;
      if (done === 0) break;
    }
    const elapsedMs = Date.now() - started;
    worker.stop();

    const { rows } = await db.pool.query<{ chunks: string }>('SELECT count(*)::text AS chunks FROM search_note_chunks');
    const chunks = Number(rows[0]?.chunks ?? 0);
    const perSecond = elapsedMs === 0 ? Infinity : (chunks / elapsedMs) * 1000;
    console.log(
      `notes-perf: worker embedded ${String(processed)} notes worth of work, ${String(chunks)} chunk rows in ` +
        `${String(elapsedMs)} ms → ${perSecond.toFixed(1)} chunks/s`,
    );

    expect(chunks, 'the corpus produced chunks').toBeGreaterThan(0);
    expect(perSecond, 'spec §7.9: the worker reaches 20 chunks/s on this machine').toBeGreaterThanOrEqual(20);
  }, 3_600_000);

  it('18.162 — p95 lexical ≤ 50 ms and meaning ≤ 150 ms server-side', async () => {
    const { rows: wsRows } = await db.pool.query<{ workspace_id: string }>(
      'SELECT DISTINCT workspace_id FROM proj_notes LIMIT 1',
    );
    const workspaceId = wsRows[0]?.workspace_id ?? '';
    const { rows: authorRows } = await db.pool.query<{ author_id: string }>(
      'SELECT author_id FROM proj_notes WHERE workspace_id = $1 LIMIT 1',
      [workspaceId],
    );
    const authorId = authorRows[0]?.author_id ?? '';
    const eff = await resolveEffectiveRole(db.pool, authorId, workspaceId);

    // The words the corpus is built from, so every query matches something and
    // the measurement is of a search that does work rather than of an empty one.
    const terms = ['compressor', 'freezer', 'inventory', 'hazard', 'monsoon', 'generator', 'warranty', 'calibration'];

    async function timings(run: (query: string) => Promise<unknown>): Promise<number[]> {
      const measured: number[] = [];
      for (let index = 0; index < 100; index += 1) {
        const query = terms[index % terms.length] as string;
        const started = process.hrtime.bigint();
        await run(query);
        measured.push(Number(process.hrtime.bigint() - started) / 1e6);
      }
      return measured.sort((left, right) => left - right);
    }

    const lexical = await timings((query) => lexicalNoteSearch(db.pool, eff, authorId, workspaceId, query, {}));
    // Warmed first: the first meaning call loads the model, and measuring that
    // would be measuring a lazy load rather than a query.
    await meaningNoteSearch(db.pool, eff, authorId, workspaceId, 'warm-up', {});
    const meaning = await timings((query) => meaningNoteSearch(db.pool, eff, authorId, workspaceId, query, {}));

    const lexicalP95 = percentile(lexical, 0.95);
    const meaningP95 = percentile(meaning, 0.95);
    console.log(
      `notes-perf on ${process.platform}/${process.arch}: p95 lexical ${lexicalP95.toFixed(1)} ms ` +
        `(target 50), p95 meaning ${meaningP95.toFixed(1)} ms (target 150).`,
    );

    expect(lexicalP95, 'spec §7.9').toBeLessThanOrEqual(50);
    expect(meaningP95, 'spec §7.9 — if this fails, add the HNSW index and record both numbers').toBeLessThanOrEqual(150);
  }, 3_600_000);
});
