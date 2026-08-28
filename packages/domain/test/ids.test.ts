import { describe, expect, it } from 'vitest';
import { MEMBERSHIP_ID_REGEX, ULID_REGEX, isUlid, newUlid } from '../src/ids.js';
import { membershipId } from '../src/entity-state.js';

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

describe('MEMBERSHIP_ID_REGEX', () => {
  it('admits exactly what membershipId() writes', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(membershipId(newUlid(), newUlid())).toMatch(MEMBERSHIP_ID_REGEX);
    }
  });

  it('planted defect: refuses a bare ULID, a lone colon, three parts, and a non-ULID half', () => {
    expect(MEMBERSHIP_ID_REGEX.test('01J60000000000000000000WKA')).toBe(false);
    expect(MEMBERSHIP_ID_REGEX.test('01J60000000000000000000WKA:')).toBe(false);
    expect(MEMBERSHIP_ID_REGEX.test(':01J6000000000000000000ACTR')).toBe(false);
    expect(MEMBERSHIP_ID_REGEX.test('01J60000000000000000000WKA:01J6000000000000000000ACTR:01J60000000000000000000WKA')).toBe(
      false,
    );
    expect(MEMBERSHIP_ID_REGEX.test('01J60000000000000000000WKA:usr_founder')).toBe(false);
    // The excluded alphabet, on the right-hand half — this is the assertion that
    // notices if the pattern is ever re-spelled by hand instead of composed.
    expect(MEMBERSHIP_ID_REGEX.test('01J60000000000000000000WKA:01J6000000000000000000ILOU')).toBe(false);
  });

  it('is composed from ULID_REGEX rather than re-spelled — one origin for what a ULID is', () => {
    const body = ULID_REGEX.source.replace(/^\^/, '').replace(/\$$/, '');
    expect(MEMBERSHIP_ID_REGEX.source).toBe(`^${body}:${body}$`);
  });
});
