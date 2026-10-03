import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { embedTexts } from '../search/embedding.js';
import { precisionAt5, selectTau, sweepTau } from '../semantic/calibration.js';
import { SUGGESTION_K, SUGGESTION_MAX_SIZE, SUGGESTION_MIN_SIZE, SUGGESTION_SEED, SUGGESTION_TAU } from '../semantic/constants.js';
import { suggestForPartition } from '../semantic/pipeline.js';

type Labelled = { items: Array<{ id: string; kind: string; label: string; text: string }> };

/**
 * `size` synthetic item texts: three fixture texts per item, so 216 000 distinct mixes exist and 10 000 items
 * are not duplicates. `perf.test.ts` (27.413) builds its corpus with this same function.
 */
export function syntheticTexts(fixtureTexts: readonly string[], size: number): string[] {
  return Array.from({ length: size }, (_unused, i) => [i % 60, (i * 7) % 60, (i * 13) % 60].map((j) => fixtureTexts[j] ?? '').join(' '));
}

/** Spec D §4.1 "Measured first": τ, the job's run time per size, the embedding rate. Prints; never asserts. */
export async function measureSemantic(fixturePath: string, sizes: readonly number[]): Promise<void> {
  const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as Labelled;
  const started = performance.now();
  const vectors = await embedTexts(fixture.items.map((entry) => entry.text));
  console.log(`embed: ${String(fixture.items.length)} texts in ${(performance.now() - started).toFixed(0)} ms`);
  const labels = new Map(fixture.items.map((entry) => [`${entry.kind}:${entry.id}`, entry.label]));
  const items = fixture.items.map((entry, index) => ({ key: `${entry.kind}:${entry.id}`, partition: 'w', vector: vectors[index] as Float32Array, text: entry.text }));
  const base = { k: SUGGESTION_K, seed: SUGGESTION_SEED, minSize: SUGGESTION_MIN_SIZE, maxSize: SUGGESTION_MAX_SIZE };
  console.log(`precision@5 = ${precisionAt5(vectors, fixture.items.map((entry) => entry.label)).toFixed(3)}`);
  const rows = sweepTau(items, (key) => labels.get(key) ?? '?', base);
  console.table(rows);
  console.log(`selectTau = ${String(selectTau(rows))} (constants.ts has ${String(SUGGESTION_TAU)})`);
  for (const size of sizes) {
    const texts = syntheticTexts(fixture.items.map((entry) => entry.text), size);
    const embedStarted = performance.now();
    const synthetic = await embedTexts(texts);
    const embedMs = performance.now() - embedStarted;
    const pipelineStarted = performance.now();
    const out = suggestForPartition(synthetic.map((vector, i) => ({ key: `ticket:S${String(i)}`, partition: 'w', vector, text: texts[i] ?? '' })), { ...base, tau: SUGGESTION_TAU });
    console.log(`size=${String(size)} embed=${embedMs.toFixed(0)} ms (${(size / (embedMs / 1000)).toFixed(0)} texts/s) pipeline=${(performance.now() - pipelineStarted).toFixed(0)} ms suggestions=${String(out.length)}`);
  }
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) { // seed-search-corpus.ts:259's idiom
  const fixture = process.argv[2] ?? 'test/fixtures/semantic-labelled.json';
  await measureSemantic(fixture, [500, 2_000, 10_000]);
}
