import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildTestApp } from '../helpers/app.js';
import { buildOAuthApp, PUBLIC_URL } from '../helpers/oauth.js';
import { registerClient } from '../../src/mcp/oauth-store.js';
import type { SecurityOptions } from '../../src/app.js';

let db: TestDatabase;
beforeAll(async () => { db = await createTestDatabase(); });
afterAll(async () => { await db.drop(); });

const reg = (app: FastifyInstance, body: unknown, xff = '203.0.113.9') =>
  app.inject({ method: 'POST', url: '/oauth/register', headers: { 'x-forwarded-for': xff }, payload: body as object });

describe('hosted MCP metadata and registration', () => {
  it('14.210 the hosted door is off without MCP_PUBLIC_URL', async () => {
    const off = buildTestApp(db).app;
    for (const url of ['/.well-known/oauth-authorization-server', '/.well-known/oauth-protected-resource']) {
      expect((await off.inject({ method: 'GET', url })).statusCode, url).toBe(404);
    }
    expect((await off.inject({ method: 'POST', url: '/mcp', payload: {} })).statusCode).toBe(404);
    const on = buildOAuthApp(db).app; // CONTROL
    expect((await on.inject({ method: 'GET', url: '/.well-known/oauth-authorization-server' })).statusCode).toBe(200);
  });

  it('14.211 authorization-server metadata', async () => {
    const { app } = buildOAuthApp(db);
    const doc = (await app.inject({ method: 'GET', url: '/.well-known/oauth-authorization-server' })).json();
    expect(doc).toMatchObject({
      issuer: PUBLIC_URL,
      authorization_endpoint: `${PUBLIC_URL}/oauth/authorize`,
      token_endpoint: `${PUBLIC_URL}/oauth/token`,
      registration_endpoint: `${PUBLIC_URL}/oauth/register`,
      revocation_endpoint: `${PUBLIC_URL}/oauth/revoke`,
      code_challenge_methods_supported: ['S256'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      token_endpoint_auth_methods_supported: ['none'],
      response_types_supported: ['code'],
      scopes_supported: ['gisik:act'],
    });
    expect(JSON.stringify(doc)).not.toContain('plain');
  });

  it('14.212 protected-resource metadata at both paths', async () => {
    const { app } = buildOAuthApp(db);
    const a = (await app.inject({ method: 'GET', url: '/.well-known/oauth-protected-resource' })).json();
    const b = (await app.inject({ method: 'GET', url: '/.well-known/oauth-protected-resource/mcp' })).json();
    expect(a).toEqual({ resource: `${PUBLIC_URL}/mcp`, authorization_servers: [PUBLIC_URL], scopes_supported: ['gisik:act'], bearer_methods_supported: ['header'] });
    expect(b).toEqual(a);
  });

  it('14.213 a public client registers with no secret', async () => {
    const { app } = buildOAuthApp(db);
    const res = await reg(app, { client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.client_id).toMatch(/^mcpc_/);
    expect(body.token_endpoint_auth_method).toBe('none');
    expect(body).not.toHaveProperty('client_secret');
    const row = await db.pool.query(`SELECT client_name, redirect_uris FROM oauth_clients WHERE client_id = $1`, [body.client_id]);
    expect(row.rows[0]).toEqual({ client_name: 'Claude', redirect_uris: ['https://claude.ai/api/mcp/auth_callback'] });
  });

  it('14.214 https or loopback redirects only', async () => {
    const { app } = buildOAuthApp(db);
    const bad = await reg(app, { client_name: 'x', redirect_uris: ['http://evil.example/cb'] });
    expect(bad.statusCode).toBe(400);
    expect(bad.json()).toEqual({ error: 'invalid_redirect_uri' });
    for (const ok of ['http://127.0.0.1:33418/callback', 'http://localhost:6274/cb']) { // CONTROL
      expect((await reg(app, { client_name: 'x', redirect_uris: [ok] })).statusCode, ok).toBe(201);
    }
  });

  it('14.215 fragments, userinfo and empty lists refused; queries allowed', async () => {
    const { app } = buildOAuthApp(db);
    for (const uris of [['https://a.example/cb#x'], ['https://u:p@a.example/cb'], []]) {
      expect((await reg(app, { client_name: 'x', redirect_uris: uris })).statusCode, JSON.stringify(uris)).toBe(400);
    }
    expect((await reg(app, { client_name: 'x', redirect_uris: ['https://chatgpt.com/cb?x=1'] })).statusCode).toBe(201);
  });

  it('14.216 registration is charged to the MCP rate-limit bucket', async () => {
    const security: SecurityOptions = {
      webOrigin: null,
      trustProxy: true,
      rateLimit: { authMax: 100, eventsMax: 100, inviteMax: 100, mcpMax: 2, signInMax: 100, windowSec: 60 },
    };
    const { app } = buildOAuthApp(db, { security });
    const body = { client_name: 'x', redirect_uris: ['https://claude.ai/cb'] };
    expect((await reg(app, body, '198.51.100.1')).statusCode).toBe(201);
    expect((await reg(app, body, '198.51.100.1')).statusCode).toBe(201);
    expect((await reg(app, body, '198.51.100.1')).statusCode).toBe(429);
    expect((await reg(app, body, '198.51.100.2')).statusCode).toBe(201); // CONTROL — another client key
  });

  it('14.217 client_name is trimmed to 60; a missing name stores the redirect host', async () => {
    const { app } = buildOAuthApp(db);
    const stored = async (res: Awaited<ReturnType<typeof reg>>) =>
      (await db.pool.query<{ client_name: string }>(`SELECT client_name FROM oauth_clients WHERE client_id = $1`, [res.json().client_id])).rows[0]?.client_name;
    const long = await reg(app, { client_name: 'n'.repeat(500), redirect_uris: ['https://claude.ai/cb'] });
    expect(await stored(long)).toBe('n'.repeat(60));
    expect(long.json().client_name).toBe('n'.repeat(60));
    const none = await reg(app, { redirect_uris: ['https://chatgpt.com/cb'] });
    expect(await stored(none)).toBe('chatgpt.com');
    const twenty = await reg(app, { client_name: 'twenty chars name 20', redirect_uris: ['https://claude.ai/cb'] }); // CONTROL
    expect(await stored(twenty)).toBe('twenty chars name 20');
  });

  it('14.218 registering sweeps stale clients', async () => {
    const { app } = buildOAuthApp(db);
    const old = await registerClient(db.pool, { clientName: 'stale', redirectUris: ['https://x.example/cb'] }, new Date(Date.now() - 31 * 86_400_000));
    const res = await reg(app, { client_name: 'fresh', redirect_uris: ['https://claude.ai/cb'] });
    const ids = (await db.pool.query<{ client_id: string }>(`SELECT client_id FROM oauth_clients`)).rows.map((r) => r.client_id);
    expect(ids).toContain(res.json().client_id); // CONTROL
    expect(ids).not.toContain(old.clientId);
  });

  it('14.219 the hosted routes are their own routes, not better-auth’s catch-all', async () => {
    const { app } = buildOAuthApp(db);
    for (const [method, url] of [['GET', '/.well-known/oauth-authorization-server'], ['GET', '/.well-known/oauth-protected-resource'], ['POST', '/oauth/register']] as const) {
      expect(app.hasRoute({ method, url }), url).toBe(true);
    }
    // The token and revoke routes live in an encapsulated scope (their own form
    // parser), which `hasRoute` on the root cannot see — so ask them directly.
    expect((await app.inject({ method: 'POST', url: '/oauth/token', payload: { grant_type: 'password' } })).statusCode).toBe(400);
    expect((await app.inject({ method: 'POST', url: '/oauth/revoke', payload: {} })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/auth/oauth/register' })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: '/api/auth/get-session' })).statusCode).not.toBe(404); // CONTROL
  });
});

