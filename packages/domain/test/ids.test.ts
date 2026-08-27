import { describe, expect, it } from 'vitest';
import { ULID_REGEX, isUlid, newUlid } from '../src/ids.js';

describe('ULID helpers', () => {
  it('newUlid generates 26-char Crockford base32 ids that pass their own regex', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(newUlid()).toMatch(ULID_REGEX);
    }
  });

  it('isUlid accepts a valid literal', () => {
    expect(isUlid('01J60000000000000000000WKA')).toBe(true);
  });

  it('isUlid refuses wrong length, lowercase, and the excluded letters I L O U', () => {
    expect(isUlid('01J60000000000000000000WK')).toBe(false); // 25 chars
    expect(isUlid('01j60000000000000000000wka')).toBe(false); // lowercase
    expect(isUlid('01J6000000000000000000ILOU')).toBe(false); // excluded alphabet
    expect(isUlid('81J60000000000000000000WKA')).toBe(false); // first char > 7 overflows 48-bit time
  });
});
