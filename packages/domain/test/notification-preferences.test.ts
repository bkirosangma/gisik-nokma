import { describe, expect, it } from 'vitest';
import { EMPTY_NOTIFICATION_PREFERENCES, notificationPreferencesSchema } from '../src/notification-preferences.js';

/** 11.197 — the schema's shape and its `.strict()` refusal, in full below. */
describe('notificationPreferencesSchema', () => {
  it('accepts an empty muted list — the default, everything on', () => {
    expect(notificationPreferencesSchema.parse({ mutedKinds: [] })).toEqual({ mutedKinds: [] });
    expect(EMPTY_NOTIFICATION_PREFERENCES).toEqual({ mutedKinds: [] });
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
