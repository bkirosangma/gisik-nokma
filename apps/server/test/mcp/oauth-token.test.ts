import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';
import { buildOAuthApp, consent as consentFor, type Consent, pkcePair } from '../helpers/oauth.js';
import type { SecurityOptions } from '../../src/app.js';

let db: TestDatabase;
beforeAll(async () => { db = await createTestDatabase(); });
afterAll(async () => { await db.drop(); });

const CB = 'https://chatgpt.com/connector_platform_oauth_redirect';
const CB2 = 'https://chatgpt.com/other_redirect';

const consent = (app: FastifyInstance, userId: string, opts: { clientId?: string; redirectUris?: string[] } = {}) =>
  consentFor(app, db.pool, userId, opts);
const form = (o: Record<string, string>) => ({ headers: { 'content-type': 'application/x-www-form-urlencoded' }, payload: new URLSearchParams(o).toString() });
const exchange = (app: FastifyInstance, c: Consent, over: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: '/oauth/token', ...form({ grant_type: 'authorization_code', code: c.code, code_verifier: c.verifier, client_id: c.clientId, redirect_uri: CB, ...over }) });
const refresh = (app: FastifyInstance, refreshToken: string, clientId = 'x') =>
  app.inject({ method: 'POST', url: '/oauth/token', ...form({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId }) });
const me = (app: FastifyInstance, accessToken: string) =>
  app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: { authorization: `Bearer ${accessToken}` } });
async function person(phone: string) {
  const { app, otp } = buildOAuthApp(db);
  return { app, ...(await signInWithPhone(app, otp, phone)) };
}

describe('token endpoint and revocation', () => {
  it('14.240 code + verifier → tokens that authenticate as the person', async () => {
    const u = await person('+911100002240');
    const c = await consent(u.app, u.userId);
    const res = await exchange(u.app, c);
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const t = res.json();
    expect(t).toMatchObject({ token_type: 'Bearer', expires_in: 3600, scope: 'gisik:act' });
    expect(t).not.toHaveProperty('id_token'); // CONTROL
    expect((await me(u.app, t.access_token)).statusCode).toBe(200);
  });

  it('14.241 a wrong verifier is invalid_grant and burns the code', async () => {
    const u = await person('+911100002241');
    const c = await consent(u.app, u.userId);
    const wrong = await exchange(u.app, c, { code_verifier: pkcePair().verifier });
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json().error).toBe('invalid_grant');
    expect((await exchange(u.app, c)).statusCode).toBe(400); // the right verifier, too late
    const fresh = await consent(u.app, u.userId, { clientId: c.clientId }); // CONTROL
    expect((await exchange(u.app, fresh)).statusCode).toBe(200);
  });

  it('14.242 the code is bound to its client and its redirect', async () => {
    const u = await person('+911100002242');
    const c = await consent(u.app, u.userId, { redirectUris: [CB, CB2] });
    const other = (await u.app.inject({ method: 'POST', url: '/oauth/register', payload: { client_name: 'Other', redirect_uris: [CB] } })).json().client_id as string;
    const wrongClient = await exchange(u.app, c, { client_id: other });
    expect(wrongClient.json().error).toBe('invalid_grant');
    const c2 = await consent(u.app, u.userId, { clientId: c.clientId });
    const wrongRedirect = await exchange(u.app, c2, { redirect_uri: CB2 });
    expect(wrongRedirect.statusCode).toBe(400);
    expect(wrongRedirect.json().error).toBe('invalid_grant');
    const c3 = await consent(u.app, u.userId, { clientId: c.clientId }); // CONTROL
    expect((await exchange(u.app, c3)).statusCode).toBe(200);
  });

  it('14.243 a code is single-use', async () => {
    const u = await person('+911100002243');
    const c = await consent(u.app, u.userId);
    expect((await exchange(u.app, c)).statusCode).toBe(200); // CONTROL
    const again = await exchange(u.app, c);
    expect(again.statusCode).toBe(400);
    expect(again.json().error).toBe('invalid_grant');
  });

  it('14.244 refresh returns a NEW pair and the old refresh token is dead', async () => {
    const u = await person('+911100002244');
    const c = await consent(u.app, u.userId);
    const t1 = (await exchange(u.app, c)).json();
    const r = await refresh(u.app, t1.refresh_token, c.clientId);
    expect(r.statusCode).toBe(200);
    const t2 = r.json();
    expect(t2.refresh_token).not.toBe(t1.refresh_token);
    expect(t2.access_token).not.toBe(t1.access_token);
    expect((await me(u.app, t2.access_token)).statusCode).toBe(200); // CONTROL
    const old = await refresh(u.app, t1.refresh_token, c.clientId);
    expect(old.statusCode).toBe(400);
    expect(old.json().error).toBe('invalid_grant');
  });

  it('14.245 a used refresh token revokes the whole connection, and only that one', async () => {
    const u = await person('+911100002245');
    const a = await consent(u.app, u.userId);
    const b = await consent(u.app, u.userId);
    const a1 = (await exchange(u.app, a)).json();
    const b1 = (await exchange(u.app, b)).json();
    const a2 = (await refresh(u.app, a1.refresh_token, a.clientId)).json();
    expect((await refresh(u.app, a1.refresh_token, a.clientId)).statusCode).toBe(400); // reuse
    expect((await me(u.app, a2.access_token)).statusCode).toBe(401);
    expect((await refresh(u.app, a2.refresh_token, a.clientId)).statusCode).toBe(400);
    expect((await me(u.app, b1.access_token)).statusCode).toBe(200); // CONTROL — the other connection
  });

  it('14.246 concurrent refreshes: one wins, the connection is revoked by the loser', async () => {
    const u = await person('+911100002246');
    const c = await consent(u.app, u.userId);
    const t = (await exchange(u.app, c)).json();
    const one = await refresh(u.app, t.refresh_token, c.clientId); // CONTROL — a single refresh succeeds
    expect(one.statusCode).toBe(200);
    const c2 = await consent(u.app, u.userId);
    const t2 = (await exchange(u.app, c2)).json();
    const [a, b] = await Promise.all([refresh(u.app, t2.refresh_token, c2.clientId), refresh(u.app, t2.refresh_token, c2.clientId)]);
    expect([a.statusCode, b.statusCode].sort()).toEqual([200, 400]);
    const winner = (a.statusCode === 200 ? a : b).json();
    expect((await me(u.app, winner.access_token)).statusCode).toBe(401); // the loser's reuse revoked the family
  });

  it('14.256 /oauth/token and /oauth/revoke are charged to the MCP rate-limit bucket', async () => {
    const security: SecurityOptions = {
      webOrigin: null,
      trustProxy: true,
      rateLimit: { authMax: 100, eventsMax: 100, inviteMax: 100, mcpMax: 2, signInMax: 100, windowSec: 60 },
    };
    const { app } = buildOAuthApp(db, { security });
    const call = (url: string, xff: string) =>
      app.inject({ method: 'POST', url, headers: { 'x-forwarded-for': xff, ...form({ grant_type: 'refresh_token', refresh_token: 'nope', token: 'nope' }).headers }, payload: form({ grant_type: 'refresh_token', refresh_token: 'nope', token: 'nope' }).payload });
    for (const [url, ip, ok] of [['/oauth/token', '198.51.100.11', 400], ['/oauth/revoke', '198.51.100.12', 200]] as const) {
      expect((await call(url, ip)).statusCode, url).toBe(ok);
      expect((await call(url, ip)).statusCode, url).toBe(ok);
      expect((await call(url, ip)).statusCode, url).toBe(429);
      expect((await call(url, `${ip}0`)).statusCode, url).toBe(ok); // CONTROL — another client key is not limited
    }
  });

  it('14.257 a refresh whose new pair cannot be issued leaves the old refresh token usable (the transaction rolls back)', async () => {
    const u = await person('+911100002257');
    const c = await consent(u.app, u.userId);
    const t = (await exchange(u.app, c)).json();
    // The failure is deterministic: a trigger that rejects the NEW refresh-token row
    // for this connection, installed after the exchange that created the first pair.
    const mine = (await db.pool.query<{ connection_id: string }>(
      `SELECT connection_id FROM mcp_tokens WHERE user_id = $1 AND connection_id IS NOT NULL`, [u.userId])).rows[0]!.connection_id;
    await db.pool.query(`CREATE FUNCTION fail_refresh_issue() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.connection_id = '${mine}' THEN RAISE EXCEPTION 'injected issuance failure'; END IF; RETURN NEW; END $$`);
    await db.pool.query(`CREATE TRIGGER fail_refresh_issue BEFORE INSERT ON oauth_refresh_tokens FOR EACH ROW EXECUTE FUNCTION fail_refresh_issue()`);
    try {
      const failed = await refresh(u.app, t.refresh_token, c.clientId);
      expect(failed.statusCode).toBe(500);
      const row = await db.pool.query(`SELECT used_at FROM oauth_refresh_tokens WHERE connection_id = $1`, [mine]);
      expect(row.rows).toHaveLength(1);
      expect(row.rows[0].used_at).toBeNull(); // the burn was rolled back
    } finally {
      await db.pool.query(`DROP TRIGGER fail_refresh_issue ON oauth_refresh_tokens`);
      await db.pool.query(`DROP FUNCTION fail_refresh_issue()`);
    }
    const retry = await refresh(u.app, t.refresh_token, c.clientId); // CONTROL — with the fault gone the SAME token still works
    expect(retry.statusCode).toBe(200);
    expect((await me(u.app, retry.json().access_token)).statusCode).toBe(200);
  });

  it('14.247 a minted code survives an app restart', async () => {
    const u = await person('+911100002247');
    const first = await consent(u.app, u.userId);
    expect((await exchange(u.app, first)).statusCode).toBe(200); // CONTROL — the same exchange on the first app
    const c = await consent(u.app, u.userId);
    const restarted = buildOAuthApp(db).app; // a second process on the same database
    const res = await exchange(restarted, c);
    expect(res.statusCode).toBe(200);
    expect((await me(restarted, res.json().access_token)).statusCode).toBe(200);
  });

  it('14.248 revoke by access or refresh token deletes the connection; unknown is still 200', async () => {
    const u = await person('+911100002248');
    const revoke = (token: string) => u.app.inject({ method: 'POST', url: '/oauth/revoke', ...form({ token }) });
    const keep = (await exchange(u.app, await consent(u.app, u.userId))).json();
    const viaAccess = await consent(u.app, u.userId);
    const t = (await exchange(u.app, viaAccess)).json();
    expect((await revoke(t.access_token)).statusCode).toBe(200);
    expect((await me(u.app, t.access_token)).statusCode).toBe(401);
    expect((await refresh(u.app, t.refresh_token, viaAccess.clientId)).statusCode).toBe(400);
    const viaRefresh = await consent(u.app, u.userId);
    const t2 = (await exchange(u.app, viaRefresh)).json();
    expect((await revoke(t2.refresh_token)).statusCode).toBe(200);
    expect((await me(u.app, t2.access_token)).statusCode).toBe(401);
    expect((await revoke('not-a-token')).statusCode).toBe(200);
    expect((await me(u.app, keep.access_token)).statusCode).toBe(200); // CONTROL — a different connection
  });

  it('14.249 form and JSON both work; an unknown grant_type is unsupported_grant_type', async () => {
    const u = await person('+911100002249');
    const c1 = await consent(u.app, u.userId);
    expect((await exchange(u.app, c1)).statusCode).toBe(200);
    const c2 = await consent(u.app, u.userId);
    const asJson = await u.app.inject({ method: 'POST', url: '/oauth/token', payload: { grant_type: 'authorization_code', code: c2.code, code_verifier: c2.verifier, client_id: c2.clientId, redirect_uri: CB } });
    expect(asJson.statusCode).toBe(200);
    const odd = await u.app.inject({ method: 'POST', url: '/oauth/token', payload: { grant_type: 'password' } });
    expect(odd.statusCode).toBe(400);
    expect(odd.json().error).toBe('unsupported_grant_type');
  });
});
