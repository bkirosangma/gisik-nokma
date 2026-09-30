import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { deleteExpiredSessions } from '../../src/ops/expired-sessions.js';
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
