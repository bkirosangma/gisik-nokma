import { describe, expect, it } from 'vitest';
import { EMPTY_NOTIFICATION_PREFERENCES, notificationPreferencesSchema } from '../src/notification-preferences.js';

/** 11.197 — the schema's shape and its `.strict()` refusal, in full below. */
describe('notificationPreferencesSchema', () => {
  it('accepts an empty muted list — the default, everything on', () => {
    expect(notificationPreferencesSchema.parse({ mutedKinds: [] })).toEqual({ mutedKinds: [] });
    expect(EMPTY_NOTIFICATION_PREFERENCES).toEqual({ mutedKinds: [] });
    // Object.freeze is shallow: the document AND its array are both frozen,
    // so a caller cannot push into the shared instance and corrupt every
    // future "this person has muted nothing" answer.
    expect(Object.isFrozen(EMPTY_NOTIFICATION_PREFERENCES)).toBe(true);
    expect(Object.isFrozen(EMPTY_NOTIFICATION_PREFERENCES.mutedKinds)).toBe(true);
  });

  it('accepts any subset of real kinds', () => {
    const doc = { mutedKinds: ['mention', 'stale-ticket'] };
    expect(notificationPreferencesSchema.parse(doc)).toEqual(doc);
  });

  it('refuses an unknown kind', () => {
    expect(notificationPreferencesSchema.safeParse({ mutedKinds: ['not-a-real-kind'] }).success).toBe(false);
  });

  it('refuses an unknown top-level key (.strict())', () => {
    expect(notificationPreferencesSchema.safeParse({ mutedKinds: [], extra: true }).success).toBe(false);
  });
});
