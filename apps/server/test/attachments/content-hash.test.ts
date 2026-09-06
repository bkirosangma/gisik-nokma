import { describe, expect, it } from 'vitest';
import { sha256Hex } from '../../src/attachments/content-hash.js';

/** Pinned vectors from FIPS 180-4 — the wiring is ours, the arithmetic is not. */
const EMPTY = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
const ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';

describe('sha256Hex', () => {
  /**
   * 9.177 — `sha256Hex` matches the published SHA-256 test vectors.
   */
  it('matches the published vectors', () => {
    expect(sha256Hex(new Uint8Array(0))).toBe(EMPTY);
    expect(sha256Hex(new TextEncoder().encode('abc'))).toBe(ABC);
  });

  /**
   * 9.178 — its output is lowercase hex, 64 characters.
   */
  it('is lowercase hex, 64 characters', () => {
    expect(sha256Hex(new TextEncoder().encode('gisik'))).toMatch(/^[0-9a-f]{64}$/);
  });

  /**
   * 9.179 — planted defect: one flipped byte produces a different hash — the hash is of content, not merely of length.
   */
  it('planted defect: one flipped byte is a different hash — the hash is of content, not of length', () => {
    const a = Uint8Array.from([1, 2, 3, 4]);
    const b = Uint8Array.from([1, 2, 3, 5]);
    expect(sha256Hex(a)).not.toBe(sha256Hex(b));
    expect(sha256Hex(a)).toHaveLength(sha256Hex(b).length);
  });
});
