import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { getNotificationPreferences, putNotificationPreferences } from '../../src/notification-preferences/store.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.pool.query('DELETE FROM user_notification_preferences');
});

// 11.198 — the store's default/round-trip/upsert-replace behaviour, in full below.
describe('user_notification_preferences store', () => {
  it('answers the empty default for a user with no row', async () => {
    const prefs = await getNotificationPreferences(db.pool, 'u-never-seen');
    expect(prefs).toEqual({ mutedKinds: [] });
  });

  it('round-trips a written preference', async () => {
    await putNotificationPreferences(db.pool, 'u1', { mutedKinds: ['mention', 'stale-ticket'] });
    expect(await getNotificationPreferences(db.pool, 'u1')).toEqual({ mutedKinds: ['mention', 'stale-ticket'] });
  });

  it('a second write replaces the first (upsert), not merges', async () => {
    await putNotificationPreferences(db.pool, 'u1', { mutedKinds: ['mention'] });
    await putNotificationPreferences(db.pool, 'u1', { mutedKinds: [] });
    expect(await getNotificationPreferences(db.pool, 'u1')).toEqual({ mutedKinds: [] });
  });

  it('one user writing never touches another user\'s row', async () => {
    await putNotificationPreferences(db.pool, 'u1', { mutedKinds: ['mention'] });
    await putNotificationPreferences(db.pool, 'u2', { mutedKinds: [] });
    expect(await getNotificationPreferences(db.pool, 'u1')).toEqual({ mutedKinds: ['mention'] });
    expect(await getNotificationPreferences(db.pool, 'u2')).toEqual({ mutedKinds: [] });
  });

  it('the database CHECK refuses a kind outside the five (positive control: a valid kind above inserted fine)', async () => {
    await expect(
      db.pool.query(
        `INSERT INTO user_notification_preferences (user_id, muted_kinds, updated_at)
         VALUES ($1, $2, now())`,
        ['u-bad', ['not-a-real-kind']],
      ),
    ).rejects.toThrow(/user_notification_preferences_muted_kinds_check/);
  });
});
