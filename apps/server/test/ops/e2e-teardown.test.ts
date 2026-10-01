import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { E2E_EMAIL_PATTERN, teardownSql } from '../../../web/e2e-stack/helpers/teardown.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Case 6.338 - the e2e-stack teardown SQL, executed here against a real Postgres. It is the SAME string
 * `apps/web/e2e-stack/global-teardown.ts` pipes into `psql` on the dev stack (the module is dependency-free for exactly this
 * reason), so the test proves the statement, not a copy of it. The `docker compose exec` channel is pinned in
 * `apps/web/test/e2e-teardown.test.ts`.
 */
let db: TestDatabase;
const STARTED = '2026-10-01T06:00:00.000Z';

const user = (id: string, email: string) =>
  db.pool.query(`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1, $1, $2, true, now(), now())`, [id, email]);
const session = (id: string, userId: string, createdAt: string) =>
  db.pool.query(
    `INSERT INTO session (id, "expiresAt", token, "createdAt", "updatedAt", "userId") VALUES ($1, now() + interval '1 day', $1, $2, $2, $3)`,
    [id, createdAt, userId],
  );
const passkey = (id: string, userId: string, createdAt: string) =>
  db.pool.query(
    `INSERT INTO passkey (id, name, "publicKey", "userId", "credentialID", counter, "deviceType", "backedUp", "createdAt")
     VALUES ($1, $1, 'k', $2, $1, 0, 'singleDevice', false, $3)`,
    [id, userId, createdAt],
  );
const ids = async (table: 'session' | 'passkey') => (await db.pool.query(`SELECT id FROM ${table} ORDER BY id`)).rows.map((r) => r.id as string);

beforeAll(async () => {
  db = await createTestDatabase();
  await user('e2e', 'kiro@e2e.gisik-nokma.local');
  await user('human', 'kiro@example.test');
  await session('e2e-before', 'e2e', '2026-10-01T05:59:59.000Z');
  await session('e2e-after', 'e2e', '2026-10-01T06:00:01.000Z');
  await session('e2e-at-bound', 'e2e', STARTED);
  await session('human-after', 'human', '2026-10-01T06:00:01.000Z');
  await passkey('pk-e2e-before', 'e2e', '2026-10-01T05:59:59.000Z');
  await passkey('pk-e2e-after', 'e2e', '2026-10-01T06:00:01.000Z');
  await passkey('pk-human-after', 'human', '2026-10-01T06:00:01.000Z');
}, 60_000);
afterAll(async () => db.drop());

describe('e2e-stack teardown SQL', () => {
  it('6.338 deletes the e2e accounts\' sessions and passkeys created at or after the run start, and nothing else; control: the same accounts\' earlier rows and a non-e2e account\'s rows survive', async () => {
    expect(E2E_EMAIL_PATTERN).toBe('%@e2e.gisik-nokma.local');
    await db.pool.query(teardownSql(STARTED));
    // before the bound and the human's own row survive (a bound-less DELETE removes e2e-before; an email-less one removes human-after)
    expect(await ids('session')).toEqual(['e2e-before', 'human-after']);
    expect(await ids('passkey')).toEqual(['pk-e2e-before', 'pk-human-after']);
  });

  it('6.338 refuses a start time that is not an ISO instant, so nothing is ever interpolated from the environment unchecked; control: the shape toISOString produces is accepted', () => {
    expect(() => teardownSql("2026-10-01'; DROP TABLE session; --")).toThrow(/ISO instant/);
    expect(() => teardownSql('')).toThrow(/ISO instant/);
    expect(() => teardownSql(new Date().toISOString())).not.toThrow();
  });
});
