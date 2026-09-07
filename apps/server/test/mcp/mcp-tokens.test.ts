import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildTestApp, TEST_WEB_ORIGIN } from '../helpers/app.js';
import { signInWithPhone } from '../helpers/session.js';
import { HTTP_ORIGIN_PROTECTED_ROUTES } from '../../src/http/http-origin.js';

/**
 * Plan: MCP server, Task 12. Cases 14.90–14.95.
 *
 * Every token here is minted through the REAL device flow — mint, approve,
 * exchange — rather than inserted. A row this file wrote itself would prove the
 * list can read rows this file wrote; it would not prove the screen shows the
 * credential the CLI is actually holding.
 */
let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

/** The whole device flow, for a person who has just signed in. */
async function mintMcpToken(
  app: FastifyInstance,
  otp: Parameters<typeof signInWithPhone>[1],
  phone: string,
): Promise<{ session: string; userId: string; mcpToken: string }> {
  const user = await signInWithPhone(app, otp, phone);
  const minted = (
    await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} })
  ).json() as { deviceCode: string; userCode: string };
  const approved = await app.inject({
    method: 'POST',
    url: '/v1/mcp/device/approve',
    headers: { authorization: `Bearer ${user.token}` },
    payload: { userCode: minted.userCode },
  });
  expect(approved.statusCode).toBe(200);
  const issued = (
    await app.inject({
      method: 'POST',
      url: '/v1/mcp/device/token',
      payload: { deviceCode: minted.deviceCode },
    })
  ).json() as { status: string; token: string };
  expect(issued.status).toBe('issued');
  return { session: user.token, userId: user.userId, mcpToken: issued.token };
}

const list = (app: FastifyInstance, session: string) =>
  app.inject({ method: 'GET', url: '/v1/me/mcp-tokens', headers: { authorization: `Bearer ${session}` } });

describe('GET /v1/me/mcp-tokens', () => {
  it('14.90 lists the caller’s tokens and never the credential itself', async () => {
    const { app, otp } = buildTestApp(db);
    const a = await mintMcpToken(app, otp, '+911100009001');

    const res = await list(app, a.session);
    expect(res.statusCode).toBe(200);
    const body = res.json() as { tokens: { id: string; createdAt: string }[] };
    expect(body.tokens).toHaveLength(1);
    const row = body.tokens[0];
    if (row === undefined) throw new Error('no row');

    // The id is sha256(token) in hex: unique, stable, URL-safe as a path
    // segment, and useless to anyone who does not already hold the preimage.
    expect(row.id).toMatch(/^[0-9a-f]{64}$/);
    // The whole assertion of this case. `mcp_tokens` stores only the hash, so a
    // row that carried the token would mean the storage claim is false.
    expect(JSON.stringify(body)).not.toContain(a.mcpToken);
    expect(Number.isNaN(Date.parse(row.createdAt))).toBe(false);
  });

  it('14.91 lists only the caller’s own — two people, two tokens, no overlap', async () => {
    const { app, otp } = buildTestApp(db);
    const a = await mintMcpToken(app, otp, '+911100009002');
    const b = await mintMcpToken(app, otp, '+911100009003');
    expect(a.userId).not.toBe(b.userId);

    const mine = ((await list(app, a.session)).json() as { tokens: { id: string }[] }).tokens;
    const theirs = ((await list(app, b.session)).json() as { tokens: { id: string }[] }).tokens;
    const mineIds = mine.map((t) => t.id);
    const theirIds = theirs.map((t) => t.id);

    expect(mineIds).toHaveLength(1);
    expect(theirIds).toHaveLength(1);
    // Disjoint in BOTH directions. One direction alone passes for a list that
    // returns everything to one caller and nothing to the other.
    expect(mineIds.some((id) => theirIds.includes(id))).toBe(false);
  });

  it('14.92 needs a session', async () => {
    const { app } = buildTestApp(db);
    const res = await app.inject({ method: 'GET', url: '/v1/me/mcp-tokens' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthenticated' });
  });
});

describe('DELETE /v1/me/mcp-tokens/:id', () => {
  it('14.93 revoking ENDS ACCESS at the next request, and empties the row from the list', async () => {
    const { app, otp } = buildTestApp(db);
    const a = await mintMcpToken(app, otp, '+911100009004');
    const id = ((await list(app, a.session)).json() as { tokens: { id: string }[] }).tokens[0]?.id;
    if (id === undefined) throw new Error('no id');

    // The control FIRST: the token works before the revoke. Without it, a
    // route that had never authenticated anything would pass the half below.
    const before = await app.inject({
      method: 'GET',
      url: '/v1/me/workspaces',
      headers: { authorization: `Bearer ${a.mcpToken}` },
    });
    expect(before.statusCode).toBe(200);

    const revoked = await app.inject({
      method: 'DELETE',
      url: `/v1/me/mcp-tokens/${id}`,
      headers: { authorization: `Bearer ${a.session}` },
    });
    expect(revoked.statusCode).toBe(204);

    // Access is what is being revoked, so access is what this asserts. A test
    // that only checked the list had gone empty would pass on a route that
    // deleted a row some other code path still honoured.
    const after = await app.inject({
      method: 'GET',
      url: '/v1/me/workspaces',
      headers: { authorization: `Bearer ${a.mcpToken}` },
    });
    expect(after.statusCode).toBe(401);

    expect(((await list(app, a.session)).json() as { tokens: unknown[] }).tokens).toEqual([]);
  });

  it('14.94 answers the SAME 404 for a token that is not yours and one that never existed', async () => {
    const { app, otp } = buildTestApp(db);
    const a = await mintMcpToken(app, otp, '+911100009005');
    const b = await mintMcpToken(app, otp, '+911100009006');
    const bId = ((await list(app, b.session)).json() as { tokens: { id: string }[] }).tokens[0]?.id;
    if (bId === undefined) throw new Error('no id');

    // Somebody else's REAL token id...
    const notMine = await app.inject({
      method: 'DELETE',
      url: `/v1/me/mcp-tokens/${bId}`,
      headers: { authorization: `Bearer ${a.session}` },
    });
    // ...and an id that names nothing at all.
    const nowhere = await app.inject({
      method: 'DELETE',
      url: `/v1/me/mcp-tokens/${'0'.repeat(64)}`,
      headers: { authorization: `Bearer ${a.session}` },
    });

    expect(notMine.statusCode).toBe(404);
    expect(nowhere.statusCode).toBe(404);
    // Byte-identical, not merely both-404: any difference between these two —
    // a different body, a different header — is an oracle for which token
    // hashes exist, which is the whole reason they are the same answer.
    expect(notMine.json()).toEqual({ error: 'not_found' });
    expect(notMine.body).toBe(nowhere.body);

    // And the refusal was a refusal, not a silent success: B's token survives.
    expect(((await list(app, b.session)).json() as { tokens: unknown[] }).tokens).toHaveLength(1);
  });

  it('14.95 is CSRF-protected — a cookie-carrying forged-Origin revoke is refused', async () => {
    const { app, otp } = buildTestApp(db, {
      security: { webOrigin: TEST_WEB_ORIGIN, rateLimit: null, trustProxy: false },
    });
    const a = await mintMcpToken(app, otp, '+911100009007');
    const id = ((await list(app, a.session)).json() as { tokens: { id: string }[] }).tokens[0]?.id;
    if (id === undefined) throw new Error('no id');

    expect(HTTP_ORIGIN_PROTECTED_ROUTES.has('/v1/me/mcp-tokens/:id')).toBe(true);

    const forged = await app.inject({
      method: 'DELETE',
      url: `/v1/me/mcp-tokens/${id}`,
      headers: { cookie: 'better-auth.session_token=whatever', origin: 'https://attacker.example' },
    });
    expect(forged.statusCode).toBe(403);
    expect(forged.json()).toEqual({ error: 'forbidden_origin' });

    // The control that proves the refusal is about the ORIGIN and not about the
    // route being broken: the same revoke, bearer-authenticated with nothing
    // ambient to forge, succeeds. Without it a route that 403'd everything
    // would pass the half above.
    const honest = await app.inject({
      method: 'DELETE',
      url: `/v1/me/mcp-tokens/${id}`,
      headers: { authorization: `Bearer ${a.session}` },
    });
    expect(honest.statusCode).toBe(204);
  });
});
