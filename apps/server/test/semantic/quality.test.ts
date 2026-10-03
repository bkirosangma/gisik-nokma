import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { embedTexts } from '../../src/search/embedding.js';
import { precisionAt5, purityOf, selectTau, sweepTau } from '../../src/semantic/calibration.js';
import { SUGGESTION_K, SUGGESTION_MAX_SIZE, SUGGESTION_MIN_SIZE, SUGGESTION_SEED, SUGGESTION_TAU } from '../../src/semantic/constants.js';
import { suggestForPartition, type PipelineItem } from '../../src/semantic/pipeline.js';

/**
 * Spec D §4.1 "Measured first" and §7 case 6, on the REAL model (not `fakeVector`): a fake embedder is
 * evidence about the loop, never about what a vector means (`embed-worker.test.ts:18-23`).
 */
type Labelled = { items: Array<{ id: string; kind: 'ticket' | 'note'; label: string; text: string }> };
const FIXTURE = JSON.parse(readFileSync(fileURLToPath(new URL('../fixtures/semantic-labelled.json', import.meta.url)), 'utf8')) as Labelled;
const BASE = { k: SUGGESTION_K, seed: SUGGESTION_SEED, minSize: SUGGESTION_MIN_SIZE, maxSize: SUGGESTION_MAX_SIZE };

async function fixtureItems(): Promise<{ items: PipelineItem[]; labelOf: (key: string) => string }> {
  const vectors = await embedTexts(FIXTURE.items.map((entry) => entry.text));
  const labels = new Map(FIXTURE.items.map((entry) => [`${entry.kind}:${entry.id}`, entry.label]));
  const items = FIXTURE.items.map((entry, index) => ({ key: `${entry.kind}:${entry.id}`, partition: 'w', vector: vectors[index] as Float32Array, text: entry.text }));
  return { items, labelOf: (key) => labels.get(key) ?? '?' };
}

describe('27.408–27.410 the quality bars (spec D §4.1)', () => {
  it('27.408 similar() top-5 precision ≥ 0.6 on the labelled 60; control: shuffled labels fall far below it', async () => {
    expect(FIXTURE.items).toHaveLength(60);
    const vectors = await embedTexts(FIXTURE.items.map((entry) => entry.text));
    const labels = FIXTURE.items.map((entry) => entry.label);
    const precision = precisionAt5(vectors, labels);
    console.log(`semantic-quality: precision@5 = ${precision.toFixed(3)} (bar 0.6)`);
    expect(precision).toBeGreaterThanOrEqual(0.6);
    const shuffled = labels.map((_label, index) => labels[(index * 7 + 3) % labels.length] as string);
    expect(precisionAt5(vectors, shuffled)).toBeLessThan(0.4); // control
  }, 120_000);

  it('27.409 suggestion purity ≥ 0.7 at SUGGESTION_TAU with ≥ 4 suggestions; control: τ = 0.80 keeps none', async () => {
    const { items, labelOf } = await fixtureItems();
    const suggestions = suggestForPartition(items, { ...BASE, tau: SUGGESTION_TAU });
    const { purity, covered } = purityOf(suggestions, labelOf);
    console.log(`semantic-quality: τ=${String(SUGGESTION_TAU)} suggestions=${String(suggestions.length)} covered=${String(covered)} purity=${purity.toFixed(3)}`);
    expect(suggestions.length).toBeGreaterThanOrEqual(4);
    expect(purity).toBeGreaterThanOrEqual(0.7);
    expect(suggestForPartition(items, { ...BASE, tau: 0.8 })).toHaveLength(0); // control
  }, 120_000);

  it('27.410 SUGGESTION_TAU is the measured choice, not a guess; control: a bar no τ meets selects null', async () => {
    const { items, labelOf } = await fixtureItems();
    const rows = sweepTau(items, labelOf, BASE);
    console.table(rows);
    expect(selectTau(rows)).toBe(SUGGESTION_TAU);
    expect(selectTau(rows, { purity: 1.01, minSuggestions: 4 })).toBeNull(); // control
  }, 120_000);
});
