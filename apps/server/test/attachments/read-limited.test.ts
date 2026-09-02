import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { readAtMost } from '../../src/attachments/read-limited.js';

/**
 * Plan 7 Task 9 — the size limit, and the proof that it is a limit.
 *
 * ## The property is WHEN, not WHETHER
 *
 * "Oversize is refused" is easy and nearly worthless: a route that buffered a
 * 5 GiB body into memory and then measured it would pass that assertion right
 * up to the moment it exhausted the heap. The claim worth pinning is that the
 * refusal happens DURING the stream, so the bytes beyond the limit are never
 * pulled at all.
 *
 * That claim is only observable from the PRODUCER side, which is why the
 * source below counts what it was asked to make. The 8 MiB / 4 KiB pairing is
 * a thousandfold gap: a check moved after the loop produces all 8 MiB and this
 * file goes red with a number that says exactly what happened.
 *
 * ## The readahead allowance, and why it is not slack
 *
 * `Readable.from` runs in object mode with a 16-object high-water mark, so the
 * generator legitimately runs ahead of the consumer by up to 16 chunks — 1 MiB
 * here — before back-pressure stops it. The bound below is 2 MiB, which admits
 * that readahead and nothing else: it is a quarter of the source, so the
 * post-loop mutation cannot slip under it, and it is 500x the limit, so no
 * plausible tightening of the reader can slip over it.
 */

/** A source that remembers how many bytes it was actually asked to produce. */
function countingSource(
  totalBytes: number,
  chunkSize: number,
): { stream: Readable; state: { produced: number } } {
  const state = { produced: 0 };
  async function* generate(): AsyncGenerator<Buffer> {
    while (state.produced < totalBytes) {
      const size = Math.min(chunkSize, totalBytes - state.produced);
      state.produced += size;
      yield Buffer.alloc(size, 0x41);
    }
  }
  return { stream: Readable.from(generate()), state };
}

const MIB = 1024 * 1024;

describe('readAtMost', () => {
  it('returns the whole body when it fits', async () => {
    const { stream, state } = countingSource(3000, 512);
    const result = await readAtMost(stream, 4096);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bytes).toHaveLength(3000);
      expect(result.bytes.every((byte) => byte === 0x41)).toBe(true);
    }
    // The whole source was consumed — the reader does not silently truncate.
    expect(state.produced).toBe(3000);
  });

  it('accepts a body of exactly maxBytes — the limit is inclusive', async () => {
    const { stream } = countingSource(4096, 1024);
    const result = await readAtMost(stream, 4096);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.bytes).toHaveLength(4096);
  });

  it('refuses one byte over the limit', async () => {
    const { stream } = countingSource(4097, 4097);
    const result = await readAtMost(stream, 4096);
    expect(result.ok).toBe(false);
  });

  it('planted defect: the refusal happens DURING the stream, not after buffering it', async () => {
    const total = 8 * MIB;
    const { stream, state } = countingSource(total, 64 * 1024);

    const result = await readAtMost(stream, 4096);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('larger than');

    // The heart of it: the source was never asked for the rest of the body.
    // Moving the size comparison below the `for await` loop makes this number
    // 8388608 and this line the one that reddens.
    expect(state.produced).toBeLessThan(2 * MIB);
    expect(state.produced).toBeLessThan(total);

    // And the source really was torn down, not merely abandoned mid-read.
    expect(stream.destroyed).toBe(true);
  });

  it('states the limit in the refusal, in the units a person uses', async () => {
    const { stream } = countingSource(200, 200);
    const result = await readAtMost(stream, 25 * MIB);
    expect(result.ok).toBe(true);

    const { stream: big } = countingSource(30 * MIB, 64 * 1024);
    const refused = await readAtMost(big, 25 * MIB);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toBe('This file is larger than the 25 MB limit.');
  });

  it('a sub-mebibyte ceiling changes units rather than reporting "0 MB"', async () => {
    // `maxBytes / 1048576` floors to zero for every ceiling a test uses, and
    // the refusal is shipped copy. Asserted on the whole sentence, because
    // `toContain('larger than')` — what this file asserted first — passes
    // happily on "larger than the 0 MB limit".
    const { stream } = countingSource(8192, 4096);
    const refused = await readAtMost(stream, 4096);
    expect(refused.ok).toBe(false);
    if (!refused.ok) expect(refused.reason).toBe('This file is larger than the 4 KB limit.');
  });
});
