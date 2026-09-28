import { describe, expect, it } from 'vitest';
import {
  isPurgedRef,
  PURGE_RULE,
  PURGED_LOOKUP_MAX_IDS,
  PURGED_OUTBOX_NOTICE,
} from '../src/purge.js';

/**
 * Trash series Plan 3, Task 1 — the purge vocabulary a DEVICE speaks. The
 * server's re-export of `PURGE_RULE` is pinned beside the route (19.164's
 * second arm, `apps/server/test/purge/lookup-route.test.ts`).
 */
describe('19.164 the device purge vocabulary', () => {
  it('19.164 pins the notice, the rule id and the lookup cap; isPurgedRef admits the four lifecycle kinds', () => {
    expect(PURGED_OUTBOX_NOTICE).toBe(
      'A change to an item that was permanently deleted could not be saved, and was removed.',
    );
    expect(PURGE_RULE).toBe('purge.erased');
    expect(PURGED_LOOKUP_MAX_IDS).toBe(500);
    for (const kind of ['workspace', 'project', 'ticket', 'note']) {
      expect(isPurgedRef({ kind, id: '01J9GTKA000000000000000000' }), kind).toBe(true);
    }
    // CONTROL
    expect(isPurgedRef({ kind: 'workflow', id: '01J9GTKA000000000000000000' })).toBe(false);
    expect(isPurgedRef({ kind: 'ticket', id: '' })).toBe(false);
    expect(isPurgedRef({ kind: 'ticket' })).toBe(false);
    expect(isPurgedRef(null)).toBe(false);
  });
});
