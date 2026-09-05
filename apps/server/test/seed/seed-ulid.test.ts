import { ULID_REGEX } from '@gisik-nokma/domain';
import { describe, expect, it } from 'vitest';
import { seedUlid } from '../../src/seed/seed-ulid.js';

describe('seedUlid', () => {
  it('is a valid ULID', () => {
    expect(seedUlid('ticket', 'cc#ops:duns')).toMatch(ULID_REGEX);
  });

  it('is deterministic — the idempotence mechanism', () => {
    expect(seedUlid('event', 'cc#ops:duns#created')).toBe(seedUlid('event', 'cc#ops:duns#created'));
  });

  it('differs across keys and across namespaces', () => {
    expect(seedUlid('event', 'a')).not.toBe(seedUlid('event', 'b'));
    expect(seedUlid('event', 'a')).not.toBe(seedUlid('ticket', 'a'));
  });

  it('planted defect: a namespace/key join ambiguity cannot collide', () => {
    // 'ab' + 'c' must not equal 'a' + 'bc' — the separator is load-bearing.
    expect(seedUlid('ab', 'c')).not.toBe(seedUlid('a', 'bc'));
  });
});
