import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyPkceS256 } from '../../src/mcp/pkce.js';
import { pkcePair } from '../helpers/oauth.js';

describe('verifyPkceS256 (14.241)', () => {
  it('14.241 accepts the derived challenge and refuses a different verifier or a malformed one', () => {
    const { verifier, challenge } = pkcePair();
    expect(verifyPkceS256(verifier, challenge)).toBe(true); // CONTROL
    expect(verifyPkceS256(pkcePair().verifier, challenge)).toBe(false);
    expect(verifyPkceS256('short', challenge)).toBe(false);
    expect(verifyPkceS256(verifier, challenge.slice(1))).toBe(false);
    expect(verifyPkceS256(challenge, challenge)).toBe(false); // plain-style: the challenge presented as the verifier
  });

  it('14.255 a verifier outside 43–128 unreserved characters is refused even when its OWN challenge is presented', () => {
    const own = (v: string) => createHash('sha256').update(v).digest('base64url');
    const ok43 = 'a'.repeat(43);
    const ok128 = 'b'.repeat(128);
    expect(verifyPkceS256(ok43, own(ok43))).toBe(true); // CONTROL — the bounds themselves are allowed
    expect(verifyPkceS256(ok128, own(ok128))).toBe(true);
    const short = 'a'.repeat(42);
    const long = 'a'.repeat(129);
    expect(verifyPkceS256(short, own(short))).toBe(false);
    expect(verifyPkceS256(long, own(long))).toBe(false);
    const reserved = `${'a'.repeat(42)}!`; // 43 chars, one outside the unreserved set
    expect(verifyPkceS256(reserved, own(reserved))).toBe(false);
  });
});
