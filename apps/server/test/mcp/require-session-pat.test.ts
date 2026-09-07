import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildTestApp } from '../helpers/app.js';
import { signInWithPhone } from '../helpers/session.js';

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
});
