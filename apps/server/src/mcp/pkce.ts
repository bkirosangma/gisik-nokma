import { createHash, timingSafeEqual } from 'node:crypto';

/**
 * RFC 7636 S256: `challenge == base64url(sha256(verifier))`. The verifier must be
 * 43–128 unreserved characters (§4.1), and the comparison is constant-time so a
 * caller cannot learn the challenge a byte at a time. `plain` is never
 * supported — there is no code path here that compares the two directly.
 */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const derived = Buffer.from(createHash('sha256').update(verifier).digest('base64url'));
  const expected = Buffer.from(challenge);
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}
