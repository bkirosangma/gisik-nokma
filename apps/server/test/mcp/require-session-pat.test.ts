import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildTestApp } from '../helpers/app.js';
import { signInWithPhone } from '../helpers/session.js';
import { hashCredential } from '../../src/mcp/token-store.js';

/**
 * Plan: MCP server, Task 4. Cases 14.30–14.33.
 */
let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

async function tokenFor(app: Awaited<ReturnType<typeof buildTestApp>>['app'], bearer: string): Promise<string> {
  const minted = (await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} })).json() as { deviceCode: string; userCode: string };
  await app.inject({
    method: 'POST', url: '/v1/mcp/device/approve',
    headers: { authorization: `Bearer ${bearer}` },
    payload: { userCode: minted.userCode },
  });
  const issued = (await app.inject({ method: 'POST', url: '/v1/mcp/device/token', payload: { deviceCode: minted.deviceCode } })).json() as { token: string };
  return issued.token;
}

describe('a personal access token authenticates a product route', () => {
  it('14.30 an MCP token reaches GET /v1/me/workspaces as its owner', async () => {
    const { app, otp } = buildTestApp(db);
    const user = await signInWithPhone(app, otp, '+911100000010');
    const pat = await tokenFor(app, user.token);

    const res = await app.inject({
      method: 'GET', url: '/v1/me/workspaces',
      headers: { authorization: `Bearer ${pat}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ workspaces: [] });
  });

  it('14.31 a better-auth SESSION token still works, unchanged', async () => {
    // The regression this guards is the whole risk of the change: resolving
    // the PAT FIRST, or instead of, better-auth would silently break every
    // mobile and desktop client and every test in this repository, all of
    // which are bearer-authenticated.
    const { app, otp } = buildTestApp(db);
    const user = await signInWithPhone(app, otp, '+911100000011');
    const res = await app.inject({
      method: 'GET', url: '/v1/me/workspaces',
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(res.statusCode).toBe(200);
  });

  it('14.32 a forged token gets the product-wide contentless 401', async () => {
    const { app } = buildTestApp(db);
    const res = await app.inject({
      method: 'GET', url: '/v1/me/workspaces',
      headers: { authorization: 'Bearer not-a-token-at-all' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthenticated' });
  });

  it('14.33 a revoked token is refused, and is indistinguishable from a forged one', async () => {
    const { app, otp } = buildTestApp(db);
    const user = await signInWithPhone(app, otp, '+911100000012');
    const pat = await tokenFor(app, user.token);
    await db.pool.query('DELETE FROM mcp_tokens');

    const res = await app.inject({
      method: 'GET', url: '/v1/me/workspaces',
      headers: { authorization: `Bearer ${pat}` },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthenticated' });
  });

  /**
   * 14.35 — **the order is falsifiable after all.**
   *
   * Task 4's Step 5 concluded that a test discriminating the resolution order
   * "would need a value that is valid as both credentials at once, which cannot
   * be constructed", and settled for holding the order by docblock and review.
   * It IS constructible: insert an `mcp_tokens` row whose `token_hash` is the
   * sha256 of a LIVE better-auth session token, pointed at a DIFFERENT user.
   * That single string is now simultaneously a valid session token for `owner`
   * and a valid personal access token for `impostor`, and which identity the
   * request resolves to is precisely the order under test.
   *
   * The observation channel is the device-approval route, because it is the one
   * place `currentUserId` becomes visible in a response: approve with the
   * ambiguous credential, exchange, and read whose token was issued.
   *
   *   better-auth first (correct) -> resolves `owner`  -> issued.userId === owner
   *   PAT first      (the defect) -> resolves impostor -> issued.userId === impostor
   *
   * Verified by construction: with the lookup moved above `getSession`, the
   * other twelve cases in this file and its sibling ALL still passed, and this
   * one failed. It is the only thing in the repository that holds the order.
   */
  it('14.35 a credential valid as BOTH resolves as better-auth, not as the PAT', async () => {
    const { app, otp } = buildTestApp(db);
    const owner = await signInWithPhone(app, otp, '+911100000014');
    const impostor = await signInWithPhone(app, otp, '+911100000015');
    expect(owner.userId).not.toBe(impostor.userId);

    // The ambiguous credential: `owner`'s live session token, ALSO planted as a
    // personal access token belonging to `impostor`.
    await db.pool.query(
      'INSERT INTO mcp_tokens (token_hash, user_id, created_at, last_used) VALUES ($1, $2, now(), NULL)',
      [hashCredential(owner.token), impostor.userId],
    );

    const minted = (await app.inject({
      method: 'POST', url: '/v1/mcp/device/code', payload: {},
    })).json() as { deviceCode: string; userCode: string };

    const approve = await app.inject({
      method: 'POST', url: '/v1/mcp/device/approve',
      headers: { authorization: `Bearer ${owner.token}` },
      payload: { userCode: minted.userCode },
    });
    expect(approve.statusCode).toBe(200);

    const issued = (await app.inject({
      method: 'POST', url: '/v1/mcp/device/token', payload: { deviceCode: minted.deviceCode },
    })).json() as { status: string; userId: string };

    expect(issued.status).toBe('issued');
    expect(issued.userId).toBe(owner.userId);
    expect(issued.userId).not.toBe(impostor.userId);
  });
});
