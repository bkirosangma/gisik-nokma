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
});
