import { createHash } from 'node:crypto';

/**
 * The SHA-256 of the bytes this product actually stored. Evidence must be
 * verifiable, not merely present (spec §2): with the hash recorded, a
 * require-evidence claim points at a file whose identity can be re-proved,
 * and a substituted file stops matching.
 */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
