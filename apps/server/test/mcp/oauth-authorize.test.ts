import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';
import { buildOAuthApp, pkcePair } from '../helpers/oauth.js';
import { TEST_WEB_ORIGIN } from '../helpers/app.js';

let db: TestDatabase;
beforeAll(async () => { db = await createTestDatabase(); });
afterAll(async () => { await db.drop(); });

const CB = 'https://claude.ai/api/mcp/auth_callback';

async function client(app: FastifyInstance, uris = [CB]) {
  return (await app.inject({ method: 'POST', url: '/oauth/register', payload: { client_name: 'Claude', redirect_uris: uris } })).json().client_id as string;
}
function authorizeUrl(q: Record<string, string | undefined>) {
  const base: Record<string, string | undefined> = { response_type: 'code', code_challenge_method: 'S256', scope: 'gisik:act', ...q };
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) if (v !== undefined) params.set(k, v);
  return `/oauth/authorize?${params}`;
}
/** Runs a valid authorize and returns the pending request id. */
async function begin(app: FastifyInstance, over: { uris?: string[]; redirect?: string; state?: string } = {}) {
  const id = await client(app, over.uris);
  const { challenge, verifier } = pkcePair();
  const res = await app.inject({ method: 'GET', url: authorizeUrl({ client_id: id, redirect_uri: over.redirect ?? CB, code_challenge: challenge, state: over.state }) });
  expect(res.statusCode).toBe(302);
  const requestId = new URL(res.headers.location as string).searchParams.get('request')!;
  return { clientId: id, requestId, challenge, verifier };
}
const decide = (app: FastifyInstance, requestId: string, bearer: string, allow: boolean) =>
  app.inject({ method: 'POST', url: `/v1/mcp/oauth/requests/${requestId}/decision`, headers: { authorization: `Bearer ${bearer}` }, payload: { allow } });
const pendingCount = async (where = '') => (await db.pool.query(`SELECT count(*)::int n FROM oauth_pending_authorizations ${where}`)).rows[0].n as number;

describe('authorize and the consent API', () => {
  it('14.220 a valid request goes to the web consent page and stores a ten-minute pending row', async () => {
    const { app } = buildOAuthApp(db);
    const id = await client(app);
    const { challenge } = pkcePair();
    const res = await app.inject({ method: 'GET', url: authorizeUrl({ client_id: id, redirect_uri: CB, code_challenge: challenge, state: 'st1' }) });
    expect(res.statusCode).toBe(302);
    const loc = new URL(res.headers.location as string);
    expect(`${loc.origin}${loc.pathname}`).toBe(`${TEST_WEB_ORIGIN}/mcp/connect`);
    const requestId = loc.searchParams.get('request')!;
    expect(requestId).toMatch(/^req_/);
    const row = await db.pool.query(`SELECT redirect_uri, state, code_challenge, expires_at - created_at AS ttl FROM oauth_pending_authorizations WHERE request_id = $1`, [requestId]);
    expect(row.rows[0]).toMatchObject({ redirect_uri: CB, state: 'st1', code_challenge: challenge });
    expect(row.rows[0].ttl).toMatchObject({ minutes: 10 }); // CONTROL
  });

  it('14.221 PKCE is required: plain and a missing challenge go back to the client, and nothing is stored', async () => {
    const { app } = buildOAuthApp(db);
    const id = await client(app);
    const before = await pendingCount();
    const { challenge } = pkcePair();
    for (const over of [{ code_challenge_method: 'plain', code_challenge: challenge }, { code_challenge: undefined }, { code_challenge: 'short' }]) {
      const res = await app.inject({ method: 'GET', url: authorizeUrl({ client_id: id, redirect_uri: CB, state: 'zz', ...over }) });
      expect(res.statusCode, JSON.stringify(over)).toBe(302);
      const to = new URL(res.headers.location as string);
      expect(`${to.origin}${to.pathname}`).toBe(CB);
      expect(to.searchParams.get('error')).toBe('invalid_request');
      expect(to.searchParams.get('state')).toBe('zz');
    }
    expect(await pendingCount()).toBe(before);
    const ok = await app.inject({ method: 'GET', url: authorizeUrl({ client_id: id, redirect_uri: CB, code_challenge: challenge }) });
    expect(ok.statusCode).toBe(302); // CONTROL
    expect(new URL(ok.headers.location as string).origin).toBe(TEST_WEB_ORIGIN);
    expect(await pendingCount()).toBe(before + 1);
  });

  it('14.222 the redirect must equal a registered one exactly; a near-miss is a JSON 400 with no redirect', async () => {
    const { app } = buildOAuthApp(db);
    const id = await client(app);
    const { challenge } = pkcePair();
    for (const near of [`${CB}/`, CB.replace('auth_callback', 'Auth_Callback'), `${CB}?extra=1`, CB.replace('https://claude.ai', 'https://CLAUDE.ai')]) {
      const res = await app.inject({ method: 'GET', url: authorizeUrl({ client_id: id, redirect_uri: near, code_challenge: challenge }) });
      expect(res.statusCode, near).toBe(400);
      expect(res.headers.location, near).toBeUndefined();
      expect(res.json().error).toBe('invalid_redirect_uri');
    }
    const missing = await app.inject({ method: 'GET', url: authorizeUrl({ client_id: id, code_challenge: challenge }) });
    expect(missing.statusCode).toBe(400);
    const ok = await app.inject({ method: 'GET', url: authorizeUrl({ client_id: id, redirect_uri: CB, code_challenge: challenge }) });
    expect(ok.statusCode).toBe(302); // CONTROL
  });

  it('14.223 an unknown client is a JSON 400, never a redirect', async () => {
    const { app } = buildOAuthApp(db);
    const { challenge } = pkcePair();
    const res = await app.inject({ method: 'GET', url: authorizeUrl({ client_id: 'cli_nope', redirect_uri: CB, code_challenge: challenge }) });
    expect(res.statusCode).toBe(400);
    expect(res.headers.location).toBeUndefined();
    expect(res.json().error).toBe('invalid_client');
    const none = await app.inject({ method: 'GET', url: authorizeUrl({ redirect_uri: CB, code_challenge: challenge }) });
    expect(none.statusCode).toBe(400);
    const id = await client(app); // CONTROL
    const ok = await app.inject({ method: 'GET', url: authorizeUrl({ client_id: id, redirect_uri: CB, code_challenge: challenge }) });
    expect(ok.statusCode).toBe(302);
  });

  it('14.224 the request page data names the app and the redirect host; 401 signed out; 404 once expired', async () => {
    const { app, otp } = buildOAuthApp(db);
    const u = await signInWithPhone(app, otp, '+911100002224');
    const { requestId } = await begin(app);
    const get = (id: string, bearer?: string) => app.inject({ method: 'GET', url: `/v1/mcp/oauth/requests/${id}`, headers: bearer ? { authorization: `Bearer ${bearer}` } : {} });
    expect((await get(requestId)).statusCode).toBe(401);
    const live = await get(requestId, u.token);
    expect(live.statusCode).toBe(200); // CONTROL
    expect(live.json()).toEqual({ requestId, clientName: 'Claude', redirectHost: 'claude.ai' });
    // Still in the table, only past its expiry — the row must be ignored, not deleted-and-gone.
    await db.pool.query(`UPDATE oauth_pending_authorizations SET expires_at = now() - interval '1 minute' WHERE request_id = $1`, [requestId]);
    expect(await pendingCount(`WHERE request_id = '${requestId}'`)).toBe(1);
    const gone = await get(requestId, u.token);
    expect(gone.statusCode).toBe(404);
    expect(gone.json().error).toBe('unknown_request');
    expect((await get('req_nope', u.token)).statusCode).toBe(404);
  });

  it('14.225 allow mints a code for the signed-in person; deny mints nothing; both carry state', async () => {
    const { app, otp } = buildOAuthApp(db);
    const u = await signInWithPhone(app, otp, '+911100002225');
    const a = await begin(app, { uris: [`${CB}?x=1`], redirect: `${CB}?x=1`, state: 's9' });
    const allowed = await decide(app, a.requestId, u.token, true);
    expect(allowed.statusCode).toBe(200);
    const to = new URL(allowed.json().redirectTo);
    expect(to.searchParams.get('x')).toBe('1'); // CONTROL — an existing query is kept
    expect(to.searchParams.get('state')).toBe('s9');
    expect(to.searchParams.get('code')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect((await db.pool.query(`SELECT count(*)::int n FROM oauth_codes WHERE user_id = $1 AND client_id = $2 AND redirect_uri = $3`, [u.userId, a.clientId, `${CB}?x=1`])).rows[0].n).toBe(1);

    const d = await begin(app, { state: 'nope' });
    const denied = await decide(app, d.requestId, u.token, false);
    expect(denied.statusCode).toBe(200);
    const back = new URL(denied.json().redirectTo);
    expect(`${back.origin}${back.pathname}`).toBe(CB);
    expect(back.searchParams.get('error')).toBe('access_denied');
    expect(back.searchParams.get('state')).toBe('nope');
    expect(back.searchParams.get('code')).toBeNull();
    expect((await db.pool.query(`SELECT count(*)::int n FROM oauth_codes WHERE client_id = $1`, [d.clientId])).rows[0].n).toBe(0);
  });

  it('14.226 a request is answered once; the second decision is 409 and mints no second code', async () => {
    const { app, otp } = buildOAuthApp(db);
    const u = await signInWithPhone(app, otp, '+911100002226');
    const r = await begin(app);
    expect((await decide(app, r.requestId, u.token, true)).statusCode).toBe(200); // CONTROL
    for (const allow of [false, true]) {
      const again = await decide(app, r.requestId, u.token, allow);
      expect(again.statusCode).toBe(409);
      expect(again.json().error).toBe('already_answered');
    }
    expect((await db.pool.query(`SELECT count(*)::int n FROM oauth_codes WHERE client_id = $1`, [r.clientId])).rows[0].n).toBe(1);
    expect((await decide(app, 'req_nope', u.token, true)).statusCode).toBe(409);
    const bad = await begin(app);
    const notBool = await app.inject({ method: 'POST', url: `/v1/mcp/oauth/requests/${bad.requestId}/decision`, headers: { authorization: `Bearer ${u.token}` }, payload: { allow: 'yes' } });
    expect(notBool.statusCode).toBe(400);
    expect(await pendingCount(`WHERE request_id = '${bad.requestId}'`)).toBe(1); // a malformed answer does not burn the request
  });

  it('14.227 the decision refuses a cookie POST from a foreign Origin', async () => {
    const { app } = buildOAuthApp(db, { security: { webOrigin: TEST_WEB_ORIGIN, rateLimit: null } });
    const r = await begin(app);
    const cookie = { cookie: 'better-auth.session_token=whatever' };
    const post = (origin: string) => app.inject({
      method: 'POST', url: `/v1/mcp/oauth/requests/${r.requestId}/decision`, headers: { ...cookie, origin }, payload: { allow: true },
    });
    const forged = await post('https://evil.example');
    expect(forged.statusCode).toBe(403);
    expect(forged.json().error).toBe('forbidden_origin');
    const ok = await post(TEST_WEB_ORIGIN); // CONTROL — passes the hook; the junk cookie is then a plain 401
    expect(ok.statusCode).toBe(401);
    expect(await pendingCount(`WHERE request_id = '${r.requestId}'`)).toBe(1);
  });

  it('14.228 an MCP token cannot decide a consent', async () => {
    const { app, otp } = buildOAuthApp(db);
    const u = await signInWithPhone(app, otp, '+911100002228');
    const minted = (await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} })).json() as { deviceCode: string; userCode: string };
    await app.inject({ method: 'POST', url: '/v1/mcp/device/approve', headers: { authorization: `Bearer ${u.token}` }, payload: { userCode: minted.userCode } });
    const pat = ((await app.inject({ method: 'POST', url: '/v1/mcp/device/token', payload: { deviceCode: minted.deviceCode } })).json() as { token: string }).token;
    const r = await begin(app);
    const refused = await decide(app, r.requestId, pat, true);
    expect(refused.statusCode).toBe(403);
    expect(refused.json().error).toBe('mcp_token_may_not_decide');
    expect((await db.pool.query(`SELECT count(*)::int n FROM oauth_codes WHERE client_id = $1`, [r.clientId])).rows[0].n).toBe(0);
    expect((await decide(app, r.requestId, u.token, true)).statusCode).toBe(200); // CONTROL — a session can, and the request was still there
  });

  it('14.229 an unsupported response_type or scope goes back to the client; an absent scope is accepted', async () => {
    const { app } = buildOAuthApp(db);
    const id = await client(app);
    const { challenge } = pkcePair();
    const errorOf = async (over: Record<string, string | undefined>) => {
      const res = await app.inject({ method: 'GET', url: authorizeUrl({ client_id: id, redirect_uri: CB, code_challenge: challenge, state: 'q', ...over }) });
      expect(res.statusCode).toBe(302);
      return new URL(res.headers.location as string).searchParams.get('error');
    };
    expect(await errorOf({ response_type: 'token' })).toBe('unsupported_response_type');
    expect(await errorOf({ scope: 'admin' })).toBe('invalid_scope');
    expect(await errorOf({ scope: 'gisik:act admin' })).toBe('invalid_scope');
    expect(await errorOf({ scope: undefined })).toBeNull(); // CONTROL — defaulted to gisik:act, on to the consent page
  });

  it('14.247 a pending consent and its code survive an app restart', async () => {
    const first = buildOAuthApp(db);
    const u = await signInWithPhone(first.app, first.otp, '+911100002230');
    const r = await begin(first.app);
    const restarted = buildOAuthApp(db).app; // a second process on the same database
    const decision = await decide(restarted, r.requestId, u.token, true);
    expect(decision.statusCode).toBe(200);
    const code = new URL(decision.json().redirectTo).searchParams.get('code')!;
    const exchange = (app: FastifyInstance, clientId: string, c: string, verifier: string) => app.inject({
      method: 'POST', url: '/oauth/token', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: new URLSearchParams({ grant_type: 'authorization_code', code: c, code_verifier: verifier, client_id: clientId, redirect_uri: CB }).toString(),
    });
    const third = buildOAuthApp(db).app;
    expect((await exchange(third, r.clientId, code, r.verifier)).statusCode).toBe(200);
    // CONTROL — the same round trip on one app, no restart in between.
    const r2 = await begin(first.app);
    const d2 = await decide(first.app, r2.requestId, u.token, true);
    const c2 = new URL(d2.json().redirectTo).searchParams.get('code')!;
    expect((await exchange(first.app, r2.clientId, c2, r2.verifier)).statusCode).toBe(200);
  });
});
