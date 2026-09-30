import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';
import { buildOAuthApp, pkcePair, PUBLIC_URL } from '../helpers/oauth.js';
import { buildTestApp, TEST_WEB_ORIGIN } from '../helpers/app.js';
import { mintCode } from '../../src/mcp/oauth-store.js';
import { hashCredential } from '../../src/mcp/token-store.js';

let db: TestDatabase;
beforeAll(async () => { db = await createTestDatabase(); });
afterAll(async () => { await db.drop(); });

const CB = 'https://claude.ai/api/mcp/auth_callback';
const form = (o: Record<string, string>) => ({ headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams(o).toString() });

type Person = { app: FastifyInstance; token: string; userId: string };
async function person(phone: string, overrides = {}): Promise<Person> {
  const { app, otp } = buildOAuthApp(db, overrides);
  return { app, ...(await signInWithPhone(app, otp, phone)) };
}
/** A hosted connection for `userId`, made through the real token endpoint. */
async function connect(app: FastifyInstance, userId: string, name = 'Claude') {
  const clientId = (await app.inject({ method: 'POST', url: '/oauth/register', payload: { client_name: name, redirect_uris: [CB] } })).json().client_id as string;
  const { verifier, challenge } = pkcePair();
  const code = await mintCode(db.pool, { clientId, userId, redirectUri: CB, codeChallenge: challenge }, new Date());
  const t = (await app.inject({ method: 'POST', url: '/oauth/token', ...form({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: CB }) })).json();
  const refreshToken = t.refresh_token as string;
  const connectionId = (await db.pool.query<{ connection_id: string }>(`SELECT connection_id FROM oauth_refresh_tokens WHERE token_hash = $1`, [hashCredential(refreshToken)])).rows[0]!.connection_id;
  return { connectionId, clientId, accessToken: t.access_token as string, refreshToken };
}
const list = (p: Person) => p.app.inject({ method: 'GET', url: '/v1/me/mcp-connections', headers: { authorization: `Bearer ${p.token}` } });
const remove = (p: Person, id: string) => p.app.inject({ method: 'DELETE', url: `/v1/me/mcp-connections/${id}`, headers: { authorization: `Bearer ${p.token}` } });
const asToken = (app: FastifyInstance, t: string) => app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: { authorization: `Bearer ${t}` } });
const refresh = (app: FastifyInstance, r: string, clientId: string) =>
  app.inject({ method: 'POST', url: '/oauth/token', ...form({ grant_type: 'refresh_token', refresh_token: r, client_id: clientId }) });

describe('connected assistants — hosted connections', () => {
  it('14.270 lists the caller\'s live connections only; an idle-expired one is absent', async () => {
    const a = await person('+911100002270');
    const b = await person('+911100002271');
    const mine = await connect(a.app, a.userId, 'Claude');
    const idle = await connect(a.app, a.userId, 'Stale app');
    await connect(b.app, b.userId, 'Someone else');
    const first = (await list(a)).json().connections as Array<{ id: string; clientName: string; redirectHost: string; createdAt: string; lastUsedAt: string | null }>;
    expect(first.map((c) => c.clientName).sort()).toEqual(['Claude', 'Stale app']); // and never 'Someone else'
    expect(first.find((c) => c.id === mine.connectionId)).toMatchObject({ clientName: 'Claude', redirectHost: 'claude.ai', lastUsedAt: null });
    expect(first.find((c) => c.id === mine.connectionId)!.createdAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    await db.pool.query(`UPDATE oauth_connections SET idle_expires_at = now() - interval '1 day' WHERE id = $1`, [idle.connectionId]);
    expect((await db.pool.query(`SELECT count(*)::int n FROM oauth_connections WHERE id = $1`, [idle.connectionId])).rows[0].n).toBe(1); // still in the table
    expect(((await list(a)).json().connections as Array<{ clientName: string }>).map((c) => c.clientName)).toEqual(['Claude']);
    // CONTROL — local tokens list under their own door, hosted access tokens never do.
    const minted = (await a.app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} })).json() as { deviceCode: string; userCode: string };
    await a.app.inject({ method: 'POST', url: '/v1/mcp/device/approve', headers: { authorization: `Bearer ${a.token}` }, payload: { userCode: minted.userCode } });
    await a.app.inject({ method: 'POST', url: '/v1/mcp/device/token', payload: { deviceCode: minted.deviceCode } });
    const tokens = (await a.app.inject({ method: 'GET', url: '/v1/me/mcp-tokens', headers: { authorization: `Bearer ${a.token}` } })).json().tokens as unknown[];
    expect(tokens).toHaveLength(1);
    expect((await list(await person('+911100002272'))).json().connections).toEqual([]);
  });

  it('14.271 Disconnect kills the access and refresh tokens; another person\'s id is a 404 that changes nothing', async () => {
    const a = await person('+911100002273');
    const b = await person('+911100002274');
    const mine = await connect(a.app, a.userId);
    const theirs = await connect(b.app, b.userId, 'Theirs');
    expect((await asToken(a.app, mine.accessToken)).statusCode).toBe(200); // CONTROL — live before
    const foreign = await remove(a, theirs.connectionId); // a tries to disconnect b's assistant
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json().error).toBe('not_found');
    expect((await asToken(b.app, theirs.accessToken)).statusCode).toBe(200);
    expect((await refresh(b.app, theirs.refreshToken, theirs.clientId)).statusCode).toBe(200);
    expect((await remove(a, 'conn_nope')).statusCode).toBe(404);
    const done = await remove(a, mine.connectionId);
    expect(done.statusCode).toBe(204);
    expect((await asToken(a.app, mine.accessToken)).statusCode).toBe(401);
    const dead = await refresh(a.app, mine.refreshToken, mine.clientId);
    expect(dead.statusCode).toBe(400);
    expect(dead.json().error).toBe('invalid_grant');
    expect(((await list(a)).json().connections as unknown[])).toEqual([]);
  });

  it('14.272 the DELETE refuses a cookie request from a foreign Origin', async () => {
    const a = await person('+911100002275', { security: { webOrigin: TEST_WEB_ORIGIN, rateLimit: null } });
    const mine = await connect(a.app, a.userId);
    const cookie = { cookie: 'better-auth.session_token=whatever' };
    const del = (origin: string) => a.app.inject({ method: 'DELETE', url: `/v1/me/mcp-connections/${mine.connectionId}`, headers: { ...cookie, origin } });
    const forged = await del('https://evil.example');
    expect(forged.statusCode).toBe(403);
    expect(forged.json().error).toBe('forbidden_origin');
    expect((await del(TEST_WEB_ORIGIN)).statusCode).toBe(401); // CONTROL — passes the hook; the junk cookie is then a plain 401
    expect((await db.pool.query(`SELECT count(*)::int n FROM oauth_connections WHERE id = $1`, [mine.connectionId])).rows[0].n).toBe(1);
  });

  it('14.273 the public URL is the MCP address when the door is on and null when off, for anyone', async () => {
    const on = buildOAuthApp(db).app;
    const off = buildTestApp(db).app;
    const get = (app: FastifyInstance) => app.inject({ method: 'GET', url: '/v1/mcp/public-url' }); // no credentials at all
    const yes = await get(on);
    expect(yes.statusCode).toBe(200);
    expect(yes.json()).toEqual({ url: `${PUBLIC_URL}/mcp` });
    const no = await get(off);
    expect(no.statusCode).toBe(200);
    expect(no.json()).toEqual({ url: null });
    const a = await person('+911100002276'); // CONTROL — signed in gets the same answer
    const signed = await a.app.inject({ method: 'GET', url: '/v1/mcp/public-url', headers: { authorization: `Bearer ${a.token}` } });
    expect(signed.json()).toEqual(yes.json());
  });
});
