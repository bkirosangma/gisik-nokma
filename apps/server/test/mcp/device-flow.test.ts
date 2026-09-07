import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildTestApp, TEST_WEB_ORIGIN } from '../helpers/app.js';
import { signInWithPhone } from '../helpers/session.js';
import { HTTP_ORIGIN_PROTECTED_ROUTES } from '../../src/http/http-origin.js';
import { DEVICE_CODE_TTL_SEC, POLL_INTERVAL_SEC } from '../../src/mcp/token-store.js';

/**
 * Plan: MCP server, Task 3. Cases 14.20–14.27.
 */
let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

describe('POST /v1/mcp/device/code', () => {
  it('14.20 mints a grant, and never returns the device code in a form it stored', async () => {
    const { app } = buildTestApp(db);
    const res = await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} });
    expect(res.statusCode).toBe(200);
    const body = res.json() as {
      deviceCode: string; userCode: string; verificationUri: string;
      expiresInSec: number; pollIntervalSec: number;
    };
    expect(body.deviceCode).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(body.userCode).toMatch(/^[BCDFGHJKLMNPQRSTVWXZ23456789]{4}-[BCDFGHJKLMNPQRSTVWXZ23456789]{4}$/);
    expect(body.verificationUri).toBe(`${TEST_WEB_ORIGIN}/mcp/authorize`);
    expect(body.expiresInSec).toBe(DEVICE_CODE_TTL_SEC);
    expect(body.pollIntervalSec).toBe(POLL_INTERVAL_SEC);
  });

  /**
   * `toBe(200)`, NOT the plan's `not.toBe(401)`.
   *
   * Measured while this file was still red, before the route existed: the
   * original assertion PASSED against a completely absent route, because an
   * unregistered path answers 404 and 404 is not 401. It was the one green tick
   * in a file of eight failures — and the plan's own Step 4 says a file
   * reporting any pass at that point "is testing something other than what it
   * names". It was right; it just did not notice the test it had written.
   *
   * A negative assertion about a status code cannot distinguish "reachable and
   * unauthenticated" from "not there at all", which is the entire claim. The
   * positive one can, and still says the same thing: no session was presented,
   * and the door answered.
   */
  it('14.21 needs no session — that is the point of a device flow', async () => {
    const { app } = buildTestApp(db);
    const res = await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /v1/mcp/device/approve', () => {
  it('14.22 refuses an unauthenticated approval with the product-wide body', async () => {
    const { app } = buildTestApp(db);
    const minted = (await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} })).json() as { userCode: string };
    const res = await app.inject({
      method: 'POST', url: '/v1/mcp/device/approve', payload: { userCode: minted.userCode },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthenticated' });
  });

  it('14.23 approves as the signed-in person, and the exchange issues THAT person a token', async () => {
    const { app, otp } = buildTestApp(db);
    const user = await signInWithPhone(app, otp, '+911100000001');
    const minted = (await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} })).json() as { deviceCode: string; userCode: string };

    const approve = await app.inject({
      method: 'POST', url: '/v1/mcp/device/approve',
      headers: { authorization: `Bearer ${user.token}` },
      payload: { userCode: minted.userCode },
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.json()).toEqual({ approved: true });

    const exchange = await app.inject({
      method: 'POST', url: '/v1/mcp/device/token', payload: { deviceCode: minted.deviceCode },
    });
    expect(exchange.statusCode).toBe(200);
    const issued = exchange.json() as { status: string; token: string; userId: string };
    expect(issued.status).toBe('issued');
    // The userId is here BECAUSE the MCP client cannot build a valid envelope
    // without it: `actorId` must equal the session user or the permission gate
    // refuses every write. No read route on this surface carries it.
    expect(issued.userId).toBe(user.userId);
    expect(typeof issued.token).toBe('string');
  });

  it('14.24 an unknown user code is refused, and says only that', async () => {
    const { app, otp } = buildTestApp(db);
    const user = await signInWithPhone(app, otp, '+911100000002');
    const res = await app.inject({
      method: 'POST', url: '/v1/mcp/device/approve',
      headers: { authorization: `Bearer ${user.token}` },
      payload: { userCode: 'ZZZZ-ZZZZ' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'unknown_code' });
  });
});

describe('POST /v1/mcp/device/token', () => {
  it('14.25 answers pending until somebody approves', async () => {
    const { app } = buildTestApp(db);
    const minted = (await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} })).json() as { deviceCode: string };
    const res = await app.inject({ method: 'POST', url: '/v1/mcp/device/token', payload: { deviceCode: minted.deviceCode } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'pending' });
  });

  it('14.26 a device code is single-use — the second exchange gets nothing', async () => {
    const { app, otp } = buildTestApp(db);
    const user = await signInWithPhone(app, otp, '+911100000003');
    const minted = (await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} })).json() as { deviceCode: string; userCode: string };
    await app.inject({
      method: 'POST', url: '/v1/mcp/device/approve',
      headers: { authorization: `Bearer ${user.token}` },
      payload: { userCode: minted.userCode },
    });
    const first = await app.inject({ method: 'POST', url: '/v1/mcp/device/token', payload: { deviceCode: minted.deviceCode } });
    expect((first.json() as { status: string }).status).toBe('issued');
    const second = await app.inject({ method: 'POST', url: '/v1/mcp/device/token', payload: { deviceCode: minted.deviceCode } });
    expect(second.statusCode).toBe(404);
    expect(second.json()).toEqual({ error: 'unknown_code' });
  });
});

describe('the approval route is CSRF-protected, because it mints a credential', () => {
  it('14.27 /v1/mcp/device/approve is in HTTP_ORIGIN_PROTECTED_ROUTES', () => {
    // A cookie-authenticated POST that mints a credential is exactly the
    // category that set exists for — `/v1/workspaces/:workspaceId/invites` is
    // in it for the same reason. Without this, an attacker's page can approve
    // THEIR OWN device code using the victim's ambient session and walk away
    // with a token for the victim's account. `SameSite=Lax` does not help:
    // pm.artsourced.in and pm-api.artsourced.in are same-site siblings.
    expect(HTTP_ORIGIN_PROTECTED_ROUTES.has('/v1/mcp/device/approve')).toBe(true);
  });

  it('14.27b a cookie-carrying approval with a forged Origin is refused', async () => {
    const { app, otp } = buildTestApp(db, {
      security: { webOrigin: TEST_WEB_ORIGIN, rateLimit: null, trustProxy: false },
    });
    const user = await signInWithPhone(app, otp, '+911100000004');
    const minted = (await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} })).json() as { userCode: string };

    const forged = await app.inject({
      method: 'POST',
      url: '/v1/mcp/device/approve',
      headers: {
        cookie: 'better-auth.session_token=whatever',
        origin: 'https://attacker.example',
      },
      payload: { userCode: minted.userCode },
    });
    expect(forged.statusCode).toBe(403);
    expect(forged.json()).toEqual({ error: 'forbidden_origin' });

    // The control that proves the refusal is about the ORIGIN and not about
    // the route simply being broken: the SAME approval, bearer-authenticated
    // (no cookie, nothing ambient to forge), succeeds. Without this second
    // half, a route that 403'd everything would pass the first half.
    const honest = await app.inject({
      method: 'POST',
      url: '/v1/mcp/device/approve',
      headers: { authorization: `Bearer ${user.token}` },
      payload: { userCode: minted.userCode },
    });
    expect(honest.statusCode).toBe(200);
  });
});
