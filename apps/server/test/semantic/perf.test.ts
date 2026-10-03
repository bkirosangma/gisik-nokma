import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import os from 'node:os';
import { hiddenItems, type ItemRef } from '../../src/read/item-visibility.js';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { embedTexts } from '../../src/search/embedding.js';
import { SUGGESTION_K, SUGGESTION_MAX_SIZE, SUGGESTION_MIN_SIZE, SUGGESTION_SEED, SUGGESTION_TAU } from '../../src/semantic/constants.js';
import { suggestForPartition, type PipelineItem } from '../../src/semantic/pipeline.js';
import { syntheticTexts } from '../../src/tools/measure-semantic.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyAll, seedMember, seedProject, seedTicket, setVisibilityEnv } from '../helpers/seed.js';

/**
 * Spec D §4.1 "Measured first" (Task 1, 27.413–27.414): the pipeline's run time on a 10 000-item partition,
 * and D4's cost on a 500-item concept. Gated like `test/search/perf.test.ts`: the corpus takes minutes to
 * embed and seed, so a default run prints a skip and `SEMANTIC_PERF=1` measures.
 *
 * Timeouts are far above the bars, so a vitest timeout is never what a stop-and-report number is.
 */
const ENABLED = process.env['SEMANTIC_PERF'] === '1';
const MACHINE = `${os.cpus()[0]?.model ?? 'cpu'} x${String(os.cpus().length)}, ${String(Math.round(os.totalmem() / 2 ** 30))} GB, node ${process.version}`;
const BASE = { k: SUGGESTION_K, seed: SUGGESTION_SEED, minSize: SUGGESTION_MIN_SIZE, maxSize: SUGGESTION_MAX_SIZE, tau: SUGGESTION_TAU };

let db: TestDatabase | undefined;
beforeAll(async () => {
  if (ENABLED) db = await createTestDatabase();
}, 600_000);
afterAll(async () => {
  await db?.drop();
});

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  const at = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, at)] as number;
}

describe('27.413–27.414 run time and D4 cost', () => {
  if (!ENABLED) {
    console.log(
      'semantic-perf: SKIPPED — set SEMANTIC_PERF=1 to embed 10 000 synthetic items and seed 500 tickets, and measure ' +
        'the pipeline (≤ 60 s at 10 000) and hiddenItems (p95 ≤ 150 ms at 500).',
    );
    it.skip('measures the pipeline and hiddenItems (set SEMANTIC_PERF=1)', () => undefined);
    return;
  }

  it('27.413 the pipeline takes ≤ 60 s on a 10 000-item partition; control: 500 items take less than 10 000', async () => {
    const fixture = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/semantic-labelled.json', import.meta.url)), 'utf8')) as {
      items: Array<{ text: string }>;
    };
    const run = async (size: number): Promise<{ ms: number; suggestions: number }> => {
      const texts = syntheticTexts(fixture.items.map((entry) => entry.text), size);
      const vectors = await embedTexts(texts); // outside the timer: the bar is "vectors already loaded"
      const items: PipelineItem[] = vectors.map((vector, i) => ({ key: `ticket:S${String(i)}`, partition: 'w', vector, text: texts[i] ?? '' }));
      const started = performance.now();
      const out = suggestForPartition(items, BASE);
      return { ms: performance.now() - started, suggestions: out.length };
    };
    const small = await run(500);
    const mid = await run(2_000);
    const big = await run(10_000);
    console.log(
      `semantic-perf [${MACHINE}]: pipeline 500=${small.ms.toFixed(0)} ms, 2000=${mid.ms.toFixed(0)} ms, 10000=${big.ms.toFixed(0)} ms (bar 60 000 ms); suggestions ${String(small.suggestions)}/${String(mid.suggestions)}/${String(big.suggestions)}`,
    );
    expect(big.ms).toBeLessThanOrEqual(60_000);
    expect(small.ms).toBeLessThan(big.ms); // control: a timer that measured nothing would fail this
  }, 3_600_000);

  it('27.414 hiddenItems over 500 items has p95 ≤ 150 ms; control: it found exactly the 10 hidden', async () => {
    const pool = (db as TestDatabase).pool;
    const WS = newUlid();
    const P = newUlid();
    const owner = newUlid();
    const member = newUlid();
    await seedProject(pool, WS, P);
    await seedMember(pool, WS, owner, 'owner', [{ projectId: P, projectAdmin: true }]);
    await seedMember(pool, WS, member, 'member', [{ projectId: P }]);
    const ids = Array.from({ length: 500 }, () => newUlid());
    for (const [i, id] of ids.entries()) {
      await seedTicket(pool, { workspaceId: WS, ticketId: id, projectId: P, title: `Perf ${String(i)}` });
      if (i % 50 === 0) await applyAll(pool, [setVisibilityEnv(WS, id, 'explicit', [owner])]);
    }
    const items: ItemRef[] = ids.map((id) => ({ kind: 'ticket', id }));
    const eff = await resolveEffectiveRole(pool, member, WS);
    const samples: number[] = [];
    let hidden = 0;
    for (let run = 0; run < 100; run += 1) {
      const started = performance.now();
      hidden = (await hiddenItems(pool, eff, member, WS, items)).length;
      samples.push(performance.now() - started);
    }
    samples.sort((a, b) => a - b);
    const p95 = percentile(samples, 0.95);
    console.log(`semantic-perf [${MACHINE}]: hiddenItems 500 items, 100 runs: p50=${percentile(samples, 0.5).toFixed(1)} ms p95=${p95.toFixed(1)} ms max=${(samples[samples.length - 1] as number).toFixed(1)} ms (bar 150 ms), hidden=${String(hidden)}`);
    expect(hidden).toBe(10); // control: the query did the work
    expect(p95).toBeLessThanOrEqual(150);
  }, 3_600_000);
});
