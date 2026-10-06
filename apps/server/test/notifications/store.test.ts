import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { NOTIFICATION_KINDS, type Notification } from '@gisik-nokma/domain';
import {
  insertNotification,
  listNotifications,
  markNotificationRead,
  unreadNotificationCount,
} from '../../src/notifications/store.js';
import { getNotificationPreferences } from '../../src/notification-preferences/store.js';
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

/** A raw row of any kind, past the store, so the database's own CHECK is what answers (29.391). */
const INSERT_RAW = `INSERT INTO notifications (id, user_id, workspace_id, kind, dedupe_key, payload, read, created_at)
  VALUES ($1, $2, 'w', $3, $1, '{}'::jsonb, false, now())`;
const PREFS_RAW = 'INSERT INTO user_notification_preferences (user_id, muted_kinds, updated_at) VALUES ($1, $2, now())';
const MIGRATION = new URL('../../migrations/1792100400000_notification-kinds-flow.sql', import.meta.url);

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

/** A `mention` row with a payload that actually satisfies its kind's schema. */
function mentionSample(overrides: Partial<Notification> = {}): Notification {
  return sample({
    kind: 'mention',
    dedupeKey: `mention:t1:${nextId()}`,
    payload: {
      ticketId: 't1',
      ticketTitle: 'Renew the DLT registration',
      mentionedBy: 'user_anselma',
      eventId: nextId(),
      source: 'comment',
      excerpt: 'cc @user_kiro',
      clientTime: '2026-08-19T10:00:00.000Z',
      serverTime: '2026-08-19T10:00:01.000Z',
    },
    ...overrides,
  });
}

/** An `assignment` row with a payload that actually satisfies its kind's schema. */
function assignmentSample(overrides: Partial<Notification> = {}): Notification {
  return sample({
    kind: 'assignment',
    dedupeKey: `assignment:t1:${nextId()}`,
    payload: {
      ticketId: 't1',
      ticketTitle: 'Renew the DLT registration',
      assignedBy: 'user_anselma',
      eventId: nextId(),
      clientTime: '2026-08-19T10:00:00.000Z',
      serverTime: '2026-08-19T10:00:01.000Z',
    },
    ...overrides,
  });
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

  it('rejects a kind outside the vocabulary via the database CHECK constraint (positive control: a valid kind above inserted fine)', async () => {
    const n = sample({ dedupeKey: 'bad-kind-key' });
    await expect(
      db.pool.query(
        `INSERT INTO notifications (id, user_id, workspace_id, kind, dedupe_key, payload, read, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [nextId(), n.userId, n.workspaceId, 'not-a-real-kind', n.dedupeKey, JSON.stringify(n.payload), n.read, n.createdAt],
      ),
    ).rejects.toThrow(/notifications_kind_check/);
  });

  it('29.391 the database stores both flow kinds and still refuses an unknown one', async () => {
    for (const kind of ['flow-ready', 'flow-reopened']) {
      await expect(db.pool.query(INSERT_RAW, [`n-${kind}`, 'u', kind])).resolves.toBeDefined();
    }
    expect((await db.pool.query('SELECT kind FROM notifications ORDER BY kind')).rows).toEqual([{ kind: 'flow-ready' }, { kind: 'flow-reopened' }]);
    await expect(db.pool.query(INSERT_RAW, ['n-x', 'u', 'flow-bogus'])).rejects.toThrow(/notifications_kind_check/); // control
  });

  /**
   * The Down, run for real but inside ONE client's transaction that is rolled back, so the shared database keeps the
   * Up. It must delete the flow rows and strip the flow mutes BEFORE it restores the five-kind checks (a check is
   * validated against the rows already there), and the restored checks must refuse a flow kind and take every older one.
   */
  it('29.391 the Down removes the flow rows and mutes, then restores the five-kind checks', async () => {
    const down = readFileSync(fileURLToPath(MIGRATION), 'utf8').split('-- Down Migration')[1]!;
    const older = NOTIFICATION_KINDS.filter((kind) => !kind.startsWith('flow-'));
    expect(older).toEqual(['assignment', 'mention', 'contested-claim', 'date-approaching', 'stale-ticket']);
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(INSERT_RAW, ['n-d1', 'u-down', 'flow-ready']);
      await client.query(INSERT_RAW, ['n-d2', 'u-down', 'flow-reopened']);
      await client.query(INSERT_RAW, ['n-d3', 'u-down', 'mention']);
      await client.query(PREFS_RAW, ['u-down-a', ['flow-ready', 'mention', 'flow-reopened']]);
      await client.query(PREFS_RAW, ['u-down-b', ['assignment']]);
      await client.query(down);
      expect((await client.query("SELECT id, kind FROM notifications WHERE user_id = 'u-down' ORDER BY id")).rows).toEqual([{ id: 'n-d3', kind: 'mention' }]);
      expect((await client.query("SELECT user_id, muted_kinds FROM user_notification_preferences WHERE user_id LIKE 'u-down-%' ORDER BY user_id")).rows)
        .toEqual([{ user_id: 'u-down-a', muted_kinds: ['mention'] }, { user_id: 'u-down-b', muted_kinds: ['assignment'] }]);
      const refused = async (sql: string, params: unknown[]): Promise<string | null> => {
        await client.query('SAVEPOINT probe');
        try {
          await client.query(sql, params);
          return null;
        } catch (error) {
          return (error as Error).message;
        } finally {
          await client.query('ROLLBACK TO SAVEPOINT probe');
        }
      };
      for (const kind of ['flow-ready', 'flow-reopened']) {
        expect(await refused(INSERT_RAW, [`n-after-${kind}`, 'u-after', kind])).toMatch(/notifications_kind_check/);
        expect(await refused(PREFS_RAW, [`u-after-${kind}`, [kind]])).toMatch(/user_notification_preferences_muted_kinds_check/);
      }
      for (const kind of older) {
        expect([kind, await refused(INSERT_RAW, [`n-after-${kind}`, 'u-after', kind])]).toEqual([kind, null]);
        expect([kind, await refused(PREFS_RAW, [`u-after-${kind}`, [kind]])]).toEqual([kind, null]);
      }
    } finally {
      await client.query('ROLLBACK');
      client.release();
    }
    // control: the rollback restored the Up, so a flow row is stored again
    await expect(db.pool.query(INSERT_RAW, ['n-up', 'u', 'flow-ready'])).resolves.toBeDefined();
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
    const [mineFirst] = mine.notifications;
    if (!mineFirst) throw new Error('expected a notification');
    expect(mineFirst.workspaceId).toBe('ws_2');
    const scoped = await listNotifications(db.pool, 'user_kiro', { workspaceId: 'ws_1' });
    expect(scoped.notifications).toHaveLength(0);
  });

  it('rowToNotification maps every column faithfully, not just id/workspaceId/payload', async () => {
    const n = sample({ read: false });
    await insertNotification(db.pool, n);
    // Flip `read` through the real write path so the assertion below actually
    // exercises the column, not just the value it was inserted with.
    await markNotificationRead(db.pool, n.userId, n.id);
    const page = await listNotifications(db.pool, n.userId, {});
    const [row] = page.notifications;
    if (!row) throw new Error('expected a notification');
    expect(row.userId).toBe(n.userId);
    expect(row.createdAt).toBe(n.createdAt);
    expect(row.read).toBe(true);
    expect(row.dedupeKey).toBe(n.dedupeKey);
  });

  it('emits no cursor when there are exactly `limit` rows (no phantom empty next page)', async () => {
    const a = sample();
    const b = sample();
    await insertNotification(db.pool, a);
    await insertNotification(db.pool, b);
    const page = await listNotifications(db.pool, 'user_kiro', { limit: 2 });
    expect(page.notifications.map((n) => n.id)).toEqual([b.id, a.id]);
    expect(page.nextCursor).toBeNull();
  });

  it('clamps limit to a minimum of 1', async () => {
    await insertNotification(db.pool, sample());
    await insertNotification(db.pool, sample());
    const page = await listNotifications(db.pool, 'user_kiro', { limit: 0 });
    expect(page.notifications).toHaveLength(1);
  });

  it('clamps limit to a maximum of 100', async () => {
    for (let i = 0; i < 101; i += 1) await insertNotification(db.pool, sample());
    const page = await listNotifications(db.pool, 'user_kiro', { limit: 1000 });
    expect(page.notifications).toHaveLength(100);
    expect(page.nextCursor).not.toBeNull();
  });

  it('defaults limit to 30 when none is given', async () => {
    for (let i = 0; i < 31; i += 1) await insertNotification(db.pool, sample());
    const page = await listNotifications(db.pool, 'user_kiro', {});
    expect(page.notifications).toHaveLength(30);
    expect(page.nextCursor).not.toBeNull();
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

  it('unreadNotificationCount is scoped per user, not table-wide, when multiple users have unread rows', async () => {
    await insertNotification(db.pool, sample({ userId: 'user_kiro' }));
    await insertNotification(db.pool, sample({ userId: 'user_anselma' }));
    await insertNotification(db.pool, sample({ userId: 'user_anselma' }));
    expect(await unreadNotificationCount(db.pool, 'user_kiro')).toBe(1);
    expect(await unreadNotificationCount(db.pool, 'user_anselma')).toBe(2);
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
    const [row] = page.notifications;
    if (!row) throw new Error('expected a notification');
    expect(row.payload).toEqual(n.payload);
  });

  // NOTE on redaction-by-visibility: this store has no `canSee`/visibility
  // dependency to inject, so there is no state we can flip here to prove a
  // *future* redacting join would be caught. The test above pins that the row
  // returned today carries the payload unchanged; if a later task adds a
  // visibility filter that drops or scrubs the row, several existing
  // assertions in this file that check row count and field values (the
  // isolation test, the field-mapping test, and this one) would fail --
  // but that is incidental coverage, not a targeted regression test, and we
  // are not claiming otherwise. A real test for that ruling needs a fixture
  // that can represent "visibility revoked", which does not exist at this
  // layer -- it belongs in whichever future task adds the join.
});

/**
 * 11.200 — the read-side filter's three behaviours, in full below.
 *
 * `mutedKinds` (account/help-screens plan, Task 5) — muting hides a kind from
 * what is READ, it never stops the row from being WRITTEN: `insertNotification`
 * above gains no third argument, only the two read paths do. Every exclusion
 * case below is paired with the SAME fixture read unmuted, so a query that
 * silently returned nothing at all could not pass by coincidence — the
 * `notifications` table's own `mutedKinds: []` default case restated as a
 * positive control rather than assumed from `insertNotification`'s tests above.
 */
describe('unreadNotificationCount / listNotifications — muted kinds', () => {
  it('unreadNotificationCount excludes a muted kind', async () => {
    await insertNotification(db.pool, mentionSample());
    await insertNotification(db.pool, assignmentSample());
    // Positive control: unmuted, both rows count.
    expect(await unreadNotificationCount(db.pool, 'user_kiro', [])).toBe(2);
    expect(await unreadNotificationCount(db.pool, 'user_kiro', ['mention'])).toBe(1);
  });

  it('listNotifications excludes a muted kind entirely — not just marks it read', async () => {
    await insertNotification(db.pool, mentionSample());
    // Positive control in the SAME fixture: unmuted, the row is there.
    const unmuted = await listNotifications(db.pool, 'user_kiro', { mutedKinds: [] });
    expect(unmuted.notifications).toHaveLength(1);
    const muted = await listNotifications(db.pool, 'user_kiro', { mutedKinds: ['mention'] });
    expect(muted.notifications).toHaveLength(0);
  });

  // 18.411 — a NOTE mention is the `mention` kind, so muting mentions hides it too.
  it('18.411 a note mention is hidden by the mention mute, in the list and in the unread count', async () => {
    await insertNotification(
      db.pool,
      mentionSample({
        payload: {
          noteId: 'n1',
          noteTitle: 'Weekly notes',
          mentionedBy: 'user_anselma',
          eventId: nextId(),
          source: 'note',
          excerpt: 'cc @user_kiro',
          clientTime: '2026-09-29T05:00:00.000Z',
          serverTime: '2026-09-29T05:00:01.000Z',
        },
      }),
    );
    // Positive control, same it(): unmuted, the row is listed and counted.
    expect((await listNotifications(db.pool, 'user_kiro', { mutedKinds: [] })).notifications).toHaveLength(1);
    expect(await unreadNotificationCount(db.pool, 'user_kiro', [])).toBe(1);
    expect((await listNotifications(db.pool, 'user_kiro', { mutedKinds: ['mention'] })).notifications).toHaveLength(0);
    expect(await unreadNotificationCount(db.pool, 'user_kiro', ['mention'])).toBe(0);
  });

  it('listNotifications excludes a muted kind while leaving an unmuted kind\'s row visible', async () => {
    await insertNotification(db.pool, mentionSample());
    await insertNotification(db.pool, assignmentSample());
    const page = await listNotifications(db.pool, 'user_kiro', { mutedKinds: ['mention'] });
    expect(page.notifications).toHaveLength(1);
    expect(page.notifications[0]?.kind).toBe('assignment');
  });

  it('an empty muted list changes nothing — the default', async () => {
    await insertNotification(db.pool, mentionSample());
    expect(await unreadNotificationCount(db.pool, 'user_kiro', [])).toBe(1);
    // And omitting the argument entirely answers the same default.
    expect(await unreadNotificationCount(db.pool, 'user_kiro')).toBe(1);
    const page = await listNotifications(db.pool, 'user_kiro', {});
    expect(page.notifications).toHaveLength(1);
  });

  it('29.397 muting a flow kind hides its rows from the list and the unread count; control: muting mention leaves the flow row; a person with no preferences row receives both', async () => {
    const flowReady = sample({
      kind: 'flow-ready',
      dedupeKey: `flow-ready:${nextId()}`,
      payload: {
        ticketId: 't1', ticketTitle: 'Write the copy', becauseTicketId: 't0', becauseTitle: 'Draft the brief', label: null,
        eventId: nextId(), clientTime: '2026-10-03T10:00:00.000Z', serverTime: '2026-10-03T10:00:01.000Z',
      },
    });
    const flowReopened = sample({
      kind: 'flow-reopened',
      dedupeKey: `flow-reopened:${nextId()}`,
      payload: {
        ticketId: 't2', ticketTitle: 'Review the copy', decisionTicketId: 'd1', decisionTitle: 'Ship or redo', outcome: 'Redo',
        pass: 2, toBacklog: false, eventId: nextId(), clientTime: '2026-10-03T10:00:00.000Z', serverTime: '2026-10-03T10:00:01.000Z',
      },
    });
    const mention = mentionSample();
    for (const n of [flowReady, flowReopened, mention]) await insertNotification(db.pool, n);
    const kinds = async (mutedKinds: string[]) =>
      (await listNotifications(db.pool, 'user_kiro', { mutedKinds: mutedKinds as Notification['kind'][] })).notifications.map((n) => n.kind).sort();
    const unread = (mutedKinds: string[]) => unreadNotificationCount(db.pool, 'user_kiro', mutedKinds as Notification['kind'][]);
    expect(await kinds(['flow-ready'])).toEqual(['flow-reopened', 'mention']);
    expect(await unread(['flow-ready'])).toBe(2);
    expect(await kinds(['flow-reopened'])).toEqual(['flow-ready', 'mention']);
    expect(await unread(['flow-ready', 'flow-reopened'])).toBe(1);
    expect(await kinds(['mention'])).toEqual(['flow-ready', 'flow-reopened']); // control
    // No preferences row: the empty mute list, so both flow rows are delivered and counted.
    const prefs = await getNotificationPreferences(db.pool, 'user_kiro');
    expect(prefs).toEqual({ mutedKinds: [] });
    expect(await kinds(prefs.mutedKinds)).toEqual(['flow-ready', 'flow-reopened', 'mention']);
    expect(await unread(prefs.mutedKinds)).toBe(3);
  });
});
