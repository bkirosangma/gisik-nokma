import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { TestDatabase } from '../helpers/db.js';

/**
 * The embedding backend (spec §7.6, cases 18.126–18.129, Plan 3 of 6).
 *
 * ## Why 18.126 breaks `fetch` instead of asserting a flag
 *
 * Until task/notes-3-runtime-fix, "never touches the network" was asserted by
 * reading `@huggingface/transformers`'s `env.allowRemoteModels` — a flag on a
 * module `embedding.ts` no longer imports (that import is exactly the bug the
 * fix closes; see `embedding.ts`'s own docblock). The PROPERTY under test did
 * not change — this module still never fetches — only the instrument did:
 * `globalThis.fetch` is replaced with a function that THROWS before the first
 * `embedTexts` call below, and the assertion is that embedding still succeeds.
 * That is a behavioural check rather than a flag on a since-removed
 * dependency, and it is a STRONGER one: it fails if ANY code path in the
 * module ever reaches for the network, not only the one flag this used to
 * read. `test/search/tokenizer-equivalence.test.ts` (18.165) covers the
 * tokenizer swap itself — this case is only about network access.
 *
 * ## Why 18.127 is the only case that can catch a WRONG model
 *
 * Unit length, determinism, dimension and even "the numbers change when the
 * input changes" are all satisfied by a table of zeroes plus noise. The one
 * property that distinguishes an embedding from a hash is that MEANING moves
 * the vector: a broken fridge and a stopped compressor are nearer to each other
 * than a broken fridge and a tax return. The measured values on this machine
 * are in the assertion's messages, so a future failure says which pair drifted
 * rather than only that something did.
 */

const embedding = await import('../../src/search/embedding.js');
const { CURRENT_MODEL, EMBEDDING_DIM, embedTexts, embedQuery, queryCacheSize } = embedding;
const { measureEmbeddingRss, searchPreflight } = await import('../../src/tools/search-preflight.js');
const { createTestDatabase } = await import('../helpers/db.js');

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

function cosine(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let index = 0; index < a.length; index += 1) sum += (a[index] ?? 0) * (b[index] ?? 0);
  return sum;
}

function norm(vector: Float32Array): number {
  return Math.sqrt(cosine(vector, vector));
}

describe('18.126–18.129 the embedding backend', () => {
  /**
   * 18.126 — unit length, the pinned dimension, determinism, and no network.
   *
   * Mutation: skip normalisation.
   */
  it('18.126 — embedTexts returns unit-length vectors of EMBEDDING_DIM, deterministically, offline', async () => {
    expect(CURRENT_MODEL).toBe('minishlab/potion-base-32M@static');
    expect(EMBEDDING_DIM).toBe(512);

    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error('18.126: embedding must never call fetch');
    }) as typeof fetch;
    let first: Float32Array | undefined;
    try {
      [first] = await embedTexts(['the compressor stopped in the cold room']);
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(first, 'embedding succeeded with fetch throwing — nothing on this path reaches the network').toBeInstanceOf(
      Float32Array,
    );
    expect(first?.length).toBe(EMBEDDING_DIM);
    expect(norm(first as Float32Array), 'unit length').toBeCloseTo(1, 5);

    const [again] = await embedTexts(['the compressor stopped in the cold room']);
    expect(Array.from(again as Float32Array), 'deterministic across calls').toEqual(Array.from(first as Float32Array));

    // Control: a DIFFERENT text is a different vector. Without this, "returns a
    // vector" would be satisfied by a constant.
    const [other] = await embedTexts(['quarterly tax filing']);
    expect(cosine(first as Float32Array, other as Float32Array)).toBeLessThan(0.99);

    // Order and count: the batching must not reorder or drop.
    const batch = await embedTexts(Array.from({ length: 20 }, (_, index) => `text number ${String(index)}`));
    expect(batch).toHaveLength(20);
    expect(Array.from(batch[7] as Float32Array)).toEqual(
      Array.from((await embedTexts([`text number ${String(7)}`]))[0] as Float32Array),
    );
  });

  /**
   * 18.127 — meaning moves the vector, and the mutation is the one that makes
   * every other assertion in this file still pass: return zero vectors.
   *
   * Mutation: return zeros.
   */
  it('18.127 — semantically close texts are closer than unrelated ones', async () => {
    const [fridge, compressor, tax] = await embedTexts([
      'fridge broken',
      'compressor stopped in the cold room',
      'quarterly tax filing',
    ]);
    const near = cosine(fridge as Float32Array, compressor as Float32Array);
    const far = cosine(fridge as Float32Array, tax as Float32Array);
    expect(near, `cos(fridge broken, compressor stopped in the cold room) = ${near.toFixed(4)}`).toBeGreaterThan(far);
    expect(near - far, 'the margin is not a rounding artefact').toBeGreaterThan(0.1);
  });

  /**
   * 18.128 — the query cache.
   *
   * Identity is the proof, and it is a STRONGER one than a call counter here:
   * the same `Float32Array` object can only come back if the cache stored it.
   * A recomputation — however it were counted — would return a different
   * instance. The control is the other direction: a DIFFERENT query is a
   * different object, so "always returns the first cached vector" fails too.
   *
   * Mutation: disable the cache.
   */
  it('18.128 — embedQuery caches: the same string returns the very same vector object', async () => {
    const before = queryCacheSize();
    const first = await embedQuery('cached query about the freezer');
    const second = await embedQuery('cached query about the freezer');

    expect(second, 'the cached vector is returned, not recomputed').toBe(first);
    expect(first.length).toBe(EMBEDDING_DIM);
    expect(queryCacheSize()).toBe(before + 1);

    const different = await embedQuery('cached query about the roof');
    expect(different).not.toBe(first);
    expect(queryCacheSize()).toBe(before + 2);
  });

  /**
   * 18.129 — the pre-flight's RSS measurement: it EXISTS, it is CONSISTENT, and the delta is inside the 400 MB
   * budget. The numbers it produced on this machine are in the failure message.
   *
   * What this case is meant to prove is exactly those three things. It is NOT meant to prove that resident
   * memory only grows, and an earlier version asserted that (`afterMb >= beforeMb`): the gate of `314c6207`
   * failed on it with "expected 317 to be greater than or equal to 318.4" and the same sha passed a re-gate.
   * RSS is not monotonic — under memory pressure macOS compresses or pages out resident memory, so a process
   * can measure LOWER after a warm-up than before it. `measureEmbeddingRss` does not clamp: it reports
   * `round(after - before)`, negative included, and that is the honest number, so the product is unchanged and
   * the test asserts what is actually true: both readings are positive, `deltaMb` is the rounded difference of
   * the two readings, and it is under 400. (A negative delta passes the budget; the second `it` pins that the
   * measurement reports one rather than clamping or throwing.)
   *
   * The warm-up is the real `embedQuery`, and it runs against a string no other case used, so the cache cannot
   * make the delta look like zero.
   *
   * Mutations: report `afterMb` as 0 (red: positivity and consistency); report a delta of 500 (red: the budget
   * and consistency).
   */
  it('18.129 — the pre-flight reports RSS before and after a warm-up embedding', async () => {
    const report = await searchPreflight(db.pool, {
      measureEmbedding: () => embedQuery('warm-up for the pre-flight rss measurement'),
    });

    const measurement = report.embedding;
    expect(measurement, 'the pre-flight carries an embedding section when asked').toBeDefined();
    expect(measurement && 'error' in measurement, 'the warm-up succeeded').toBe(false);

    const { beforeMb, afterMb, deltaMb } = measurement as { beforeMb: number; afterMb: number; deltaMb: number };
    const said = `RSS went ${String(beforeMb)} MB → ${String(afterMb)} MB (Δ ${String(deltaMb)} MB)`;
    expect(beforeMb, said).toBeGreaterThan(0);
    expect(afterMb, said).toBeGreaterThan(0);
    // The delta is the difference of the two readings (each is rounded to 0.1 MB, the difference to 0.1 again).
    expect(Math.abs(deltaMb - (afterMb - beforeMb)), said).toBeLessThanOrEqual(0.11);
    expect(deltaMb, said).toBeLessThan(400);
  });

  it('18.129 — a warm-up that LOWERS RSS is reported as a negative delta, not clamped and not thrown', async () => {
    // Deterministic stand-in for macOS compressing resident memory during the warm-up: 318.4 MiB, then 317.0 MiB.
    const readings = [318.4, 317.0].map((mb) => ({ rss: mb * 1024 * 1024 }));
    const spy = vi.spyOn(process, 'memoryUsage').mockImplementation((() => readings.shift() ?? { rss: 0 }) as never);
    try {
      expect(await measureEmbeddingRss(async () => undefined)).toEqual({ beforeMb: 318.4, afterMb: 317, deltaMb: -1.4 });
    } finally {
      spy.mockRestore();
    }
    // CONTROL, same `it`: with the spy gone the real reading is a positive number again.
    expect(await measureEmbeddingRss(async () => undefined)).toMatchObject({ beforeMb: expect.any(Number) });
  });
});
