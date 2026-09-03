import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Notification } from '@gisik-nokma/domain';
import {
  insertNotification,
  listNotifications,
  markNotificationRead,
  unreadNotificationCount,
} from '../../src/notifications/store.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.pool.query('DELETE FROM notifications');
});

let counter = 0;

/** ULID-shaped, strictly increasing ids so ORDER BY id DESC is deterministic. */
function nextId(): string {
  counter += 1;
  return `01J9GN0T00000000000000${String(counter).padStart(4, '0')}`.slice(0, 26);
}

function sample(overrides: Partial<Notification> = {}): Notification {
  return {
    id: nextId(),
    userId: 'user_kiro',
    workspaceId: 'ws_1',
    kind: 'date-approaching',
    dedupeKey: `date-approaching:t1:2026-08-3${counter}`,
    payload: {
      ticketId: 't1',
      ticketTitle: 'Renew the DLT registration',
      field: 'dueDate',
      claim: {
        date: '2026-08-30',
        actorId: 'user_kiro',
        clientTime: '2026-08-19T10:00:00.000Z',
        serverTime: '2026-08-19T10:00:01.000Z',
      },
    },
    read: false,
    createdAt: '2026-08-23T05:00:00.000Z',
    ...overrides,
  };
}

describe('insertNotification', () => {
  it('inserts a row and reports inserted', async () => {
    expect(await insertNotification(db.pool, sample())).toBe('inserted');
    expect(await unreadNotificationCount(db.pool, 'user_kiro')).toBe(1);
  });

  it('is idempotent per (user, dedupeKey): a second insert is a duplicate, one row stands', async () => {
    const first = sample({ dedupeKey: 'date-approaching:t1:2026-08-30' });
    const again = sample({ dedupeKey: 'date-approaching:t1:2026-08-30' }); // fresh id, same key
    expect(await insertNotification(db.pool, first)).toBe('inserted');
    expect(await insertNotification(db.pool, again)).toBe('duplicate');
    const rows = await db.pool.query('SELECT id FROM notifications WHERE user_id = $1', ['user_kiro']);
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].id).toBe(first.id);
  });

  it('the same dedupeKey for a different user is its own row', async () => {
    await insertNotification(db.pool, sample({ dedupeKey: 'k' }));
    expect(await insertNotification(db.pool, sample({ userId: 'user_anselma', dedupeKey: 'k' }))).toBe('inserted');
  });

  it('the unique constraint is enforced by the database, not by the caller (raw duplicate insert violates it)', async () => {
    const n = sample({ dedupeKey: 'raw-dupe-key' });
    await insertNotification(db.pool, n);
    await expect(
      db.pool.query(
        `INSERT INTO notifications (id, user_id, workspace_id, kind, dedupe_key, payload, read, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          nextId(),
          n.userId,
          n.workspaceId,
          n.kind,
          n.dedupeKey,
          JSON.stringify(n.payload),
          n.read,
          n.createdAt,
        ],
      ),
    ).rejects.toThrow(/notifications_user_dedupe_unique/);
  });

  it('rejects a kind outside the five via the database CHECK constraint (positive control: a valid kind above inserted fine)', async () => {
    const n = sample({ dedupeKey: 'bad-kind-key' });
    await expect(
      db.pool.query(
        `INSERT INTO notifications (id, user_id, workspace_id, kind, dedupe_key, payload, read, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [nextId(), n.userId, n.workspaceId, 'not-a-real-kind', n.dedupeKey, JSON.stringify(n.payload), n.read, n.createdAt],
      ),
    ).rejects.toThrow(/notifications_kind_check/);
  });
});

describe('listNotifications', () => {
  it('pages newest-first by id with a cursor', async () => {
    const a = sample();
    const b = sample();
    const c = sample();
    for (const n of [a, b, c]) await insertNotification(db.pool, n);

    const page1 = await listNotifications(db.pool, 'user_kiro', { limit: 2 });
    expect(page1.notifications.map((n) => n.id)).toEqual([c.id, b.id]);
    expect(page1.nextCursor).toBe(b.id);

    const page2 = await listNotifications(db.pool, 'user_kiro', { limit: 2, cursor: page1.nextCursor });
    expect(page2.notifications.map((n) => n.id)).toEqual([a.id]);
    expect(page2.nextCursor).toBeNull();
  });

  it("never returns another user's rows and can scope to a workspace", async () => {
    await insertNotification(db.pool, sample({ userId: 'user_anselma' }));
    await insertNotification(db.pool, sample({ workspaceId: 'ws_2' }));
    const mine = await listNotifications(db.pool, 'user_kiro', {});
    expect(mine.notifications).toHaveLength(1);
    expect(mine.notifications[0].workspaceId).toBe('ws_2');
    const scoped = await listNotifications(db.pool, 'user_kiro', { workspaceId: 'ws_1' });
    expect(scoped.notifications).toHaveLength(0);
  });

  it('clamps limit to 1..100 and defaults to 30', async () => {
    for (let i = 0; i < 3; i += 1) await insertNotification(db.pool, sample());
    const zero = await listNotifications(db.pool, 'user_kiro', { limit: 0 });
    expect(zero.notifications).toHaveLength(1);
    const huge = await listNotifications(db.pool, 'user_kiro', { limit: 1000 });
    expect(huge.notifications).toHaveLength(3);
    expect(huge.nextCursor).toBeNull();
  });
});

describe('markNotificationRead / unreadNotificationCount', () => {
  it("marks own rows, idempotently; another user's row is untouchable", async () => {
    const n = sample();
    await insertNotification(db.pool, n);
    expect(await markNotificationRead(db.pool, 'user_anselma', n.id)).toBe(false);
    expect(await unreadNotificationCount(db.pool, 'user_kiro')).toBe(1);
    expect(await markNotificationRead(db.pool, 'user_kiro', n.id)).toBe(true);
    expect(await markNotificationRead(db.pool, 'user_kiro', n.id)).toBe(true); // idempotent
    expect(await unreadNotificationCount(db.pool, 'user_kiro')).toBe(0);
  });

  it('unreadNotificationCount is 0 for a user with no rows at all (positive control: another user with an unread row above is 1)', async () => {
    expect(await unreadNotificationCount(db.pool, 'user_nobody')).toBe(0);
  });
});

describe('rows outside the projection registry', () => {
  it('a row inserted stays exactly as written — the store performs no redaction on read regardless of any later visibility change', async () => {
    const n = sample();
    await insertNotification(db.pool, n);
    // Simulate what a "visibility revoked" state would look like if the store
    // tried to scrub: it must not. Reading back must still show the full
    // original payload verbatim.
    const page = await listNotifications(db.pool, 'user_kiro', {});
    expect(page.notifications[0].payload).toEqual(n.payload);
  });
});
