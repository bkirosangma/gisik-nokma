import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { TEST_WEB_ORIGIN } from '../helpers/app.js';
import { signInWithPhone } from '../helpers/session.js';
import { buildOAuthApp, hostedToken, pkcePair, PUBLIC_URL } from '../helpers/oauth.js';

/**
 * Hosted MCP plan, Task 10. Cases 14.290–14.293: the whole door driven the way a
 * client drives it, with nothing stubbed and the consent decided through the real
 * decision route. Run LOCALLY (CI does not run on a dev PR).
 */
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

const CB = 'https://claude.ai/api/mcp/auth_callback';
const rpc = (method: string, params: unknown = {}, id = 1) => ({ jsonrpc: '2.0', id, method, params });
const INIT = rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'e2e', version: '0' } });
const mcp = (app: FastifyInstance, token: string, payload: unknown) =>
  app.inject({
    method: 'POST',
    url: '/mcp',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
      authorization: `Bearer ${token}`,
    },
    payload: payload as object,
  });
const form = (o: Record<string, string>) => ({
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  payload: new URLSearchParams(o).toString(),
});
const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

/** Register a client and hit /oauth/authorize; returns the pending request id from the 302. */
async function authorize(app: FastifyInstance, state: string, challenge: string) {
  const reg = await app.inject({ method: 'POST', url: '/oauth/register', payload: { client_name: 'Claude', redirect_uris: [CB] } });
  expect(reg.statusCode).toBe(201);
  const clientId = reg.json().client_id as string;
  const qs = new URLSearchParams({
    response_type: 'code', client_id: clientId, redirect_uri: CB, code_challenge: challenge,
    code_challenge_method: 'S256', scope: 'gisik:act', state,
  });
  const res = await app.inject({ method: 'GET', url: `/oauth/authorize?${qs.toString()}` });
  expect(res.statusCode).toBe(302);
  const location = String(res.headers.location);
  expect(location.startsWith(`${TEST_WEB_ORIGIN}/mcp/connect?request=`)).toBe(true);
  return { clientId, requestId: new URL(location).searchParams.get('request') as string };
}

type Run = { workspaceId: string; code: string; state: string; access1: string; refresh1: string; access2: string; refresh2: string; user: { token: string; userId: string } };

/** The whole journey. Returns every credential it saw, so a caller can look for them elsewhere. */
async function journey(app: FastifyInstance, otp: Parameters<typeof signInWithPhone>[1], phone: string): Promise<Run> {
  // Metadata discovery, as the client does it.
  const pr = (await app.inject({ method: 'GET', url: '/.well-known/oauth-protected-resource/mcp' })).json();
  expect(pr.authorization_servers).toEqual([PUBLIC_URL]);
  const asm = (await app.inject({ method: 'GET', url: '/.well-known/oauth-authorization-server' })).json();
  expect(asm.token_endpoint).toBe(`${PUBLIC_URL}/oauth/token`);

  const user = await signInWithPhone(app, otp, phone);
  const founded = await app.inject({ method: 'POST', url: '/v1/workspaces', headers: bearer(user.token), payload: { name: 'Round Trip' } });
  const workspaceId = (founded.json() as { workspaceId: string }).workspaceId;
  const projectId = newUlid();
  const project: SubmittedEvent = {
    id: newUlid(), version: 1, origin: 'web', clientTime: new Date().toISOString(), workspaceId,
    entity: { kind: 'project', id: projectId }, type: 'project.created', payload: { name: 'Counter' }, actorId: user.userId,
  };
  await app.inject({ method: 'POST', url: '/v1/events', headers: bearer(user.token), payload: { events: [project] } });

  const { verifier, challenge } = pkcePair();
  const state = `st-${newUlid()}`;
  const { clientId, requestId } = await authorize(app, state, challenge);
  const decided = await app.inject({
    method: 'POST', url: `/v1/mcp/oauth/requests/${requestId}/decision`, headers: bearer(user.token), payload: { allow: true },
  });
  expect(decided.statusCode).toBe(200);
  const back = new URL((decided.json() as { redirectTo: string }).redirectTo);
  expect(`${back.origin}${back.pathname}`).toBe(CB);
  expect(back.searchParams.get('state')).toBe(state);
  const code = back.searchParams.get('code') as string;

  const tok = await app.inject({
    method: 'POST', url: '/oauth/token',
    ...form({ grant_type: 'authorization_code', code, code_verifier: verifier, client_id: clientId, redirect_uri: CB }),
  });
  expect(tok.statusCode).toBe(200);
  const first = tok.json() as { access_token: string; refresh_token: string };

  expect((await mcp(app, first.access_token, INIT)).statusCode).toBe(200);
  const list = await mcp(app, first.access_token, rpc('tools/list', {}, 2));
  // EXACT and order-insensitive: the set of names, so a tool silently added or dropped goes red here as well as
  // in `mcp-http.test.ts` (14.262, which also pins the order). A count would say less; `arrayContaining`
  // would let a dropped tool through.
  expect((list.json().result.tools as Array<{ name: string }>).map((t) => t.name).sort()).toEqual(
    [
      'list_workspaces', 'get_workspace', 'create_workspace', 'rename_workspace', 'archive_workspace',
      'restore_workspace', 'delete_workspace', 'undelete_workspace',
      'list_projects', 'get_project', 'create_project', 'update_project', 'archive_project',
      'restore_project', 'delete_project', 'undelete_project',
      'search_tickets', 'list_tickets', 'get_ticket', 'list_members',
      'create_ticket', 'transition_ticket', 'add_comment', 'assign_ticket',
    ].sort(),
  );
  const call = async (name: string, args: Record<string, unknown>, token = first.access_token) => {
    const r = (await mcp(app, token, rpc('tools/call', { name, arguments: args }, 3))).json().result as { isError?: boolean; content: { text: string }[] };
    return { isError: r.isError === true, text: r.content[0]?.text ?? '' };
  };
  const ws = await call('list_workspaces', {});
  expect(ws.isError).toBe(false);
  expect((JSON.parse(ws.text) as { workspaces: { workspaceId: string }[] }).workspaces.map((w) => w.workspaceId)).toEqual([workspaceId]);
  expect((await call('create_ticket', { workspaceId, projectId, typeId: 'task', title: 'Round trip' })).isError).toBe(false);

  const refreshed = await app.inject({
    method: 'POST', url: '/oauth/token',
    ...form({ grant_type: 'refresh_token', refresh_token: first.refresh_token, client_id: clientId }),
  });
  expect(refreshed.statusCode).toBe(200);
  const second = refreshed.json() as { access_token: string; refresh_token: string };
  // The old access token lives out its hour; the new one works too.
  expect((await mcp(app, first.access_token, INIT)).statusCode).toBe(200);
  expect((await mcp(app, second.access_token, INIT)).statusCode).toBe(200);
  return { workspaceId, code, state, access1: first.access_token, refresh1: first.refresh_token, access2: second.access_token, refresh2: second.refresh_token, user };
}

describe('the hosted door, end to end', () => {
  it('14.290 discovery → register → authorize → consent → token → tools → refresh → revoke → 401', async () => {
    const { app, otp } = buildOAuthApp(db);
    const run = await journey(app, otp, '+911100002290');

    const revoked = await app.inject({ method: 'POST', url: '/oauth/revoke', ...form({ token: run.refresh2 }) });
    expect(revoked.statusCode).toBe(200);
    for (const token of [run.access1, run.access2]) {
      const res = await mcp(app, token, INIT);
      expect(res.statusCode).toBe(401);
      expect(res.headers['www-authenticate']).toBe(`Bearer resource_metadata="${PUBLIC_URL}/.well-known/oauth-protected-resource/mcp"`);
    }
    // CONTROL, same `it`: revoking a CONNECTION does not sign the person out of the web app.
    const web = await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: bearer(run.user.token) });
    expect(web.statusCode).toBe(200);
    expect((web.json() as { workspaces: unknown[] }).workspaces).toHaveLength(1);
    await app.close();
  });

  it('14.291 the request log over the whole run holds no code, token or state', async () => {
    const lines: string[] = [];
    const stream = new Writable({ write(chunk, _e, cb) { lines.push(String(chunk)); cb(); } });
    const { app, otp } = buildOAuthApp(db, { logStream: stream });
    await app.ready();
    const run = await journey(app, otp, '+911100002291');
    await app.close();

    const log = lines.join('');
    // CONTROL, same `it`: the log is not simply empty — it names the routes that were called,
    // including the ones whose query strings carried the secrets.
    expect(log).toContain('/oauth/authorize');
    expect(log).toContain('/oauth/token');
    expect(log).toContain('/mcp');
    for (const [name, secret] of Object.entries({
      code: run.code, state: run.state, access1: run.access1, refresh1: run.refresh1, access2: run.access2, refresh2: run.refresh2,
    })) {
      expect(log.includes(secret), `the log leaked ${name}`).toBe(false);
    }
  });

  it('14.292 the device flow still works end to end beside the hosted door', async () => {
    const { app, otp } = buildOAuthApp(db);
    const user = await signInWithPhone(app, otp, '+911100002292');
    const minted = (await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} })).json() as { deviceCode: string; userCode: string };
    const approved = await app.inject({ method: 'POST', url: '/v1/mcp/device/approve', headers: bearer(user.token), payload: { userCode: minted.userCode } });
    expect(approved.statusCode).toBe(200);
    const issued = await app.inject({ method: 'POST', url: '/v1/mcp/device/token', payload: { deviceCode: minted.deviceCode } });
    expect(issued.statusCode).toBe(200);
    const token = (issued.json() as { token: string }).token;
    const me = await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: bearer(token) });
    expect(me.statusCode).toBe(200);
    // CONTROL, same `it`: the hosted door beside it still works for the same person.
    expect((await mcp(app, await hostedToken(app, db.pool, user.userId), INIT)).statusCode).toBe(200);
    await app.close();
  });

  it('14.293 a hosted token cannot approve or deny a device code, or decide a consent', async () => {
    const { app, otp } = buildOAuthApp(db);
    const user = await signInWithPhone(app, otp, '+911100002293');
    const hosted = await hostedToken(app, db.pool, user.userId);
    const newCode = async () =>
      ((await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} })).json() as { userCode: string }).userCode;
    const newRequest = async () => (await authorize(app, 'st-293', pkcePair().challenge)).requestId;

    const codeA = await newCode();
    const codeD = await newCode();
    const requestId = await newRequest();
    const as = (token: string) => ({ headers: bearer(token) });
    expect((await app.inject({ method: 'POST', url: '/v1/mcp/device/approve', ...as(hosted), payload: { userCode: codeA } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: '/v1/mcp/device/deny', ...as(hosted), payload: { userCode: codeD } })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/v1/mcp/oauth/requests/${requestId}/decision`, ...as(hosted), payload: { allow: true } })).statusCode).toBe(403);

    // CONTROL, same `it`: a web session can do all three, on the very same codes and request.
    expect((await app.inject({ method: 'POST', url: '/v1/mcp/device/approve', ...as(user.token), payload: { userCode: codeA } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: '/v1/mcp/device/deny', ...as(user.token), payload: { userCode: codeD } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'POST', url: `/v1/mcp/oauth/requests/${requestId}/decision`, ...as(user.token), payload: { allow: true } })).statusCode).toBe(200);
    await app.close();
  });
});
