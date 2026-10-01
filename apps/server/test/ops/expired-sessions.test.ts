import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { deleteExpiredSessions, runExpiredSessionSweep, sessionSweepIntervalMs } from '../../src/ops/expired-sessions.js';
import { requirePositiveIntervalMs } from '../../src/ops/schedule.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
}, 60_000);
afterAll(async () => {
  await db.drop();
});

it('6.321 deletes every session with expiresAt <= now and returns the count; control: one expiring a second AFTER now survives', async () => {
  const now = new Date('2026-10-01T00:00:00Z');
  await db.pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ('u1','U','u1@x.test',true,now(),now())`,
  );
  const ins = (id: string, exp: string) =>
    db.pool.query(
      `INSERT INTO session (id, "expiresAt", token, "createdAt", "updatedAt", "userId") VALUES ($1,$2,$1,now(),now(),'u1')`,
      [id, exp],
    );
  await ins('old', '2026-09-30T23:59:59Z');
  await ins('edge', '2026-10-01T00:00:00Z');
  await ins('live', '2026-10-01T00:00:01Z');
  expect(await deleteExpiredSessions(db.pool, now)).toBe(2);
  const left = await db.pool.query(`SELECT id FROM session ORDER BY id`);
  expect(left.rows.map((r) => r.id)).toEqual(['live']);
  // A second sweep finds nothing: the count is what was deleted, not what was scanned.
  expect(await deleteExpiredSessions(db.pool, now)).toBe(0);
});

it('6.323 .env.example documents SESSION_SWEEP_INTERVAL_MS with the daily default; control: the sibling PURGE_SWEEP_INTERVAL_MS line is read the same way', () => {
  const example = readFileSync(new URL('../../../../.env.example', import.meta.url), 'utf8');
  const valueOf = (name: string) => new RegExp(`^${name}=(.*)$`, 'm').exec(example)?.[1];
  expect(valueOf('PURGE_SWEEP_INTERVAL_MS')).toBe('3600000');
  expect(valueOf('SESSION_SWEEP_INTERVAL_MS')).toBe('86400000');
});

it('6.344 the scheduled job body deletes an expired session, keeps a live one and logs the count; control: a second run logs 0', async () => {
  const now = new Date('2026-10-01T00:00:00Z');
  await db.pool.query(
    `INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ('u2','U','u2@x.test',true,now(),now())`,
  );
  const ins = (id: string, exp: string) =>
    db.pool.query(
      `INSERT INTO session (id, "expiresAt", token, "createdAt", "updatedAt", "userId") VALUES ($1,$2,$1,now(),now(),'u2')`,
      [id, exp],
    );
  await ins('job-old', '2026-09-30T00:00:00Z');
  await ins('job-live', '2026-10-01T00:00:05Z');
  const logged: Array<{ msg: string; deleted: number }> = [];
  expect(await runExpiredSessionSweep(db.pool, now, (e) => logged.push(e))).toBe(1);
  expect(logged).toEqual([{ msg: 'expired-session sweep complete', deleted: 1 }]);
  const ids = (await db.pool.query(`SELECT id FROM session WHERE "userId" = 'u2' ORDER BY id`)).rows.map((r) => r.id);
  expect(ids).toEqual(['job-live']);
  expect(await runExpiredSessionSweep(db.pool, now, (e) => logged.push(e))).toBe(0);
  expect(logged[1]).toEqual({ msg: 'expired-session sweep complete', deleted: 0 });
});

it('6.345 SESSION_SWEEP_INTERVAL_MS defaults to one day when unset, empty or blank, is honoured when set, and a bad value is refused by name; control: a set value is not replaced by the default', () => {
  expect(sessionSweepIntervalMs({})).toBe(86_400_000);
  expect(sessionSweepIntervalMs({ SESSION_SWEEP_INTERVAL_MS: undefined })).toBe(86_400_000);
  expect(sessionSweepIntervalMs({ SESSION_SWEEP_INTERVAL_MS: '' })).toBe(86_400_000);
  expect(sessionSweepIntervalMs({ SESSION_SWEEP_INTERVAL_MS: '  ' })).toBe(86_400_000);
  expect(sessionSweepIntervalMs({ SESSION_SWEEP_INTERVAL_MS: '3600000' })).toBe(3_600_000);
  for (const bad of ['0', 'abc', '-5', '1.5']) {
    expect(() => requirePositiveIntervalMs(sessionSweepIntervalMs({ SESSION_SWEEP_INTERVAL_MS: bad }), 'SESSION_SWEEP_INTERVAL_MS')).toThrow(/SESSION_SWEEP_INTERVAL_MS/);
  }
  expect(requirePositiveIntervalMs(sessionSweepIntervalMs({}), 'SESSION_SWEEP_INTERVAL_MS')).toBe(86_400_000);
});
