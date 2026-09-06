import { ULID_REGEX } from '@gisik-nokma/domain';
import { describe, expect, it } from 'vitest';
import { seedUlid } from '../../src/seed/seed-ulid.js';

describe('seedUlid', () => {
  /**
   * 13.41 — seedUlid is a valid, ULID_REGEX-matching id.
   */
  it('is a valid ULID', () => {
    expect(seedUlid('ticket', 'cc#ops:duns')).toMatch(ULID_REGEX);
  });

  /**
   * 13.42 — seedUlid is deterministic — the idempotence mechanism.
   */
  it('is deterministic — the idempotence mechanism', () => {
    expect(seedUlid('event', 'cc#ops:duns#created')).toBe(seedUlid('event', 'cc#ops:duns#created'));
  });

  /**
   * 13.43 — seedUlid differs across keys and across namespaces.
   */
  it('differs across keys and across namespaces', () => {
    expect(seedUlid('event', 'a')).not.toBe(seedUlid('event', 'b'));
    expect(seedUlid('event', 'a')).not.toBe(seedUlid('ticket', 'a'));
  });

  /**
   * 13.44 — planted defect: a namespace/key join ambiguity cannot collide
   * ('ab'+'c' vs 'a'+'bc').
   */
  it('planted defect: a namespace/key join ambiguity cannot collide', () => {
    // 'ab' + 'c' must not equal 'a' + 'bc' — the separator is load-bearing.
    expect(seedUlid('ab', 'c')).not.toBe(seedUlid('a', 'bc'));
  });
});
