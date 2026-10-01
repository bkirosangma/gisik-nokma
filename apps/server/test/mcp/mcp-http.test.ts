import { Writable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import type { SecurityOptions } from '../../src/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';
import { seedMember } from '../helpers/seed.js';
import { buildOAuthApp, hostedToken, PUBLIC_URL } from '../helpers/oauth.js';

/**
 * Hosted MCP plan, Task 7. Cases 14.260–14.269. Nothing is stubbed: the real
 * `buildApp`, the real OAuth token exchange, the real tools running over
 * the API's own routes.
 */
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

const rpc = (method: string, params: unknown = {}, id = 1) => ({ jsonrpc: '2.0', id, method, params });
const INIT = rpc('initialize', {
  protocolVersion: '2025-06-18',
  capabilities: {},
  clientInfo: { name: 'test', version: '0' },
});
const H = (token?: string, extra: Record<string, string> = {}) => ({
  'content-type': 'application/json',
  accept: 'application/json, text/event-stream',
  'mcp-protocol-version': '2025-06-18',
  ...(token ? { authorization: `Bearer ${token}` } : {}),
  ...extra,
});
const post = (app: FastifyInstance, token: string | undefined, payload: unknown, extra: Record<string, string> = {}) =>
  app.inject({ method: 'POST', url: '/mcp', headers: H(token, extra), payload: payload as object });

/** `tools/call`, unwrapped: the isError flag and the text the assistant would read. */
async function call(app: FastifyInstance, token: string, name: string, args: Record<string, unknown> = {}) {
  const res = await post(app, token, rpc('tools/call', { name, arguments: args }, 7));
  expect(res.statusCode).toBe(200);
  const result = res.json().result as { isError?: boolean; content: { type: string; text: string }[] };
  return { isError: result.isError === true, text: result.content[0]?.text ?? '' };
}

/** A founded workspace with one project, owned by `owner`. */
async function found(app: FastifyInstance, owner: { token: string; userId: string }) {
  const headers = { authorization: `Bearer ${owner.token}` };
  const made = await app.inject({ method: 'POST', url: '/v1/workspaces', headers, payload: { name: 'Hosted Corner' } });
  expect(made.statusCode).toBe(201);
  const workspaceId = (made.json() as { workspaceId: string }).workspaceId;
  const projectId = newUlid();
  const project: SubmittedEvent = {
    id: newUlid(),
    version: 1,
    origin: 'web',
    clientTime: new Date().toISOString(),
    workspaceId,
    entity: { kind: 'project', id: projectId },
    type: 'project.created',
    payload: { name: 'Shop floor' },
    actorId: owner.userId,
  };
  const res = await app.inject({ method: 'POST', url: '/v1/events', headers, payload: { events: [project] } });
  expect((res.json() as { results: Array<{ status: string }> }).results[0]?.status).toBe('committed');
  return { workspaceId, projectId };
}

async function deviceFlowToken(app: FastifyInstance, sessionToken: string): Promise<string> {
  const minted = (await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} })).json() as {
    deviceCode: string;
    userCode: string;
  };
  await app.inject({
    method: 'POST',
    url: '/v1/mcp/device/approve',
    headers: { authorization: `Bearer ${sessionToken}` },
    payload: { userCode: minted.userCode },
  });
  const issued = (
    await app.inject({ method: 'POST', url: '/v1/mcp/device/token', payload: { deviceCode: minted.deviceCode } })
  ).json() as { token: string };
  return issued.token;
}

const CHALLENGE = `Bearer resource_metadata="${PUBLIC_URL}/.well-known/oauth-protected-resource/mcp"`;

describe('POST /mcp — the door', () => {
  it('14.260 no bearer → 401 pointing at the metadata (and the same on an expired token)', async () => {
    const { app, otp } = buildOAuthApp(db);
    const none = await post(app, undefined, INIT);
    expect(none.statusCode).toBe(401);
    expect(none.headers['www-authenticate']).toBe(CHALLENGE);

    // CONTROL, same `it`: a token that WAS good and has expired is answered the same way.
    const user = await signInWithPhone(app, otp, '+911100002260');
    const token = await hostedToken(app, db.pool, user.userId);
    expect((await post(app, token, INIT)).statusCode).toBe(200);
    await db.pool.query(`UPDATE mcp_tokens SET expires_at = now() - interval '1 minute' WHERE user_id = $1`, [user.userId]);
    const expired = await post(app, token, INIT);
    expect(expired.statusCode).toBe(401);
    expect(expired.headers['www-authenticate']).toBe(CHALLENGE);
    await app.close();
  });

  it('14.261 a local (device-flow) token is refused; a hosted token is accepted', async () => {
    const { app, otp } = buildOAuthApp(db);
    const user = await signInWithPhone(app, otp, '+911100002261');
    const local = await deviceFlowToken(app, user.token);
    // It is a real token — the REST API takes it — and /mcp still refuses it.
    const rest = await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: { authorization: `Bearer ${local}` } });
    expect(rest.statusCode).toBe(200);
    const refused = await post(app, local, INIT);
    expect(refused.statusCode).toBe(401);
    expect(refused.headers['www-authenticate']).toBe(CHALLENGE);
    // CONTROL, same `it`: the hosted token of the same person is accepted.
    expect((await post(app, await hostedToken(app, db.pool, user.userId), INIT)).statusCode).toBe(200);
    await app.close();
  });

  it('14.265 a foreign Origin is refused before auth; absent and allowed origins reach auth', async () => {
    const { app, otp } = buildOAuthApp(db);
    const user = await signInWithPhone(app, otp, '+911100002270');
    const token = await hostedToken(app, db.pool, user.userId);
    expect((await post(app, undefined, INIT, { origin: 'https://evil.example' })).statusCode).toBe(403);
    // Refused BEFORE auth: even a VALID token does not get past a foreign Origin.
    expect((await post(app, token, INIT, { origin: 'https://evil.example' })).statusCode).toBe(403);
    for (const origin of [undefined, 'https://claude.ai', 'https://chatgpt.com']) {
      // CONTROL — these reach the auth check (401), so 403 was the Origin check speaking.
      const res = await post(app, undefined, INIT, origin ? { origin } : {});
      expect(res.statusCode, String(origin)).toBe(401);
    }
    await app.close();
  });

  it('14.267 GET and DELETE are 405 Allow: POST; POST answers', async () => {
    const { app, otp } = buildOAuthApp(db);
    for (const method of ['GET', 'DELETE'] as const) {
      const res = await app.inject({ method, url: '/mcp' });
      expect(res.statusCode).toBe(405);
      expect(res.headers.allow).toBe('POST');
    }
    const user = await signInWithPhone(app, otp, '+911100002267');
    const token = await hostedToken(app, db.pool, user.userId);
    expect((await post(app, token, INIT)).statusCode).toBe(200); // CONTROL
    await app.close();
  });
});

describe('POST /mcp — the tools', () => {
  it('14.262 initialize then tools/list: every tool, JSON, no session id', async () => {
    const { app, otp } = buildOAuthApp(db);
    const user = await signInWithPhone(app, otp, '+911100002262');
    const token = await hostedToken(app, db.pool, user.userId);
    const init = await post(app, token, INIT);
    expect(init.statusCode).toBe(200);
    expect(init.headers['content-type']).toContain('application/json');
    expect(init.headers['mcp-session-id']).toBeUndefined();
    const list = await post(app, token, rpc('tools/list', {}, 2));
    expect(list.headers['mcp-session-id']).toBeUndefined();
    const tools = list.json().result.tools as { name: string; description: string }[];
    expect(tools.map((t) => t.name)).toEqual([
      'list_projects',
      'search_tickets',
      'list_tickets',
      'get_ticket',
      'list_members',
      'create_ticket',
      'transition_ticket',
      'add_comment',
      'assign_ticket',
      'list_workspaces',
      'get_workspace',
      'create_workspace',
      'rename_workspace',
      'archive_workspace',
      'restore_workspace',
      'delete_workspace',
      'undelete_workspace',
    ]);
    expect(tools.every((t) => t.description.length > 0)).toBe(true); // CONTROL: described, not bare names
    await app.close();
  });

  it('14.263 list_workspaces is the caller\'s live workspaces — the REST body when none is archived — per caller', async () => {
    const { app, otp } = buildOAuthApp(db);
    const a = await signInWithPhone(app, otp, '+911100002263');
    const b = await signInWithPhone(app, otp, '+911100002264');
    await found(app, a);
    const tokenA = await hostedToken(app, db.pool, a.userId);
    const tokenB = await hostedToken(app, db.pool, b.userId);
    const rest = await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: { authorization: `Bearer ${a.token}` } });
    const viaMcp = await call(app, tokenA, 'list_workspaces');
    expect(viaMcp.isError).toBe(false);
    expect(JSON.parse(viaMcp.text)).toEqual(rest.json());
    expect((rest.json() as { workspaces: unknown[] }).workspaces).toHaveLength(1);
    // CONTROL, same `it`: a second person sees their own (none), not the first person's.
    expect(JSON.parse((await call(app, tokenB, 'list_workspaces')).text)).toEqual({ workspaces: [] });
    await app.close();
  });

  it('14.264 create_ticket writes origin mcp as the token owner; a refusal comes back verbatim', async () => {
    const { app, otp } = buildOAuthApp(db);
    const user = await signInWithPhone(app, otp, '+911100002265');
    const { workspaceId, projectId } = await found(app, user);
    const token = await hostedToken(app, db.pool, user.userId);

    const created = await call(app, token, 'create_ticket', { workspaceId, projectId, typeId: 'task', title: 'Count the crates' });
    expect(created.isError).toBe(false);
    const { rows } = await db.pool.query<{ origin: string; actor_id: string; entity_id: string }>(
      `SELECT origin, actor_id, entity_id FROM events WHERE workspace_id = $1 AND type = 'ticket.created'`,
      [workspaceId],
    );
    expect(rows).toEqual([{ origin: 'mcp', actor_id: user.userId, entity_id: expect.any(String) }]);

    // CONTROL, same `it`: a rule-engine refusal reaches the assistant as isError with the
    // server's own reason. The reason is read from the REST answer to the same move.
    const ticketId = rows[0]!.entity_id;
    const move: SubmittedEvent = {
      id: newUlid(), version: 1, origin: 'web', clientTime: new Date().toISOString(), workspaceId,
      entity: { kind: 'ticket', id: ticketId }, type: 'ticket.transitioned', payload: { to: 'no-such-state' }, actorId: user.userId,
    };
    const direct = await app.inject({ method: 'POST', url: '/v1/events', headers: { authorization: `Bearer ${user.token}` }, payload: { events: [move] } });
    const verdict = (direct.json() as { results: Array<{ status: string; reason?: string }> }).results[0]!;
    expect(verdict.status).not.toBe('committed');
    expect(typeof verdict.reason).toBe('string');
    const refused = await call(app, token, 'transition_ticket', { workspaceId, ticketId, to: 'no-such-state' });
    expect(refused.isError).toBe(true);
    expect(refused.text).toContain(verdict.reason as string);
    await app.close();
  });

  it('14.266 a member removed from every workspace gets nothing through a live connection', async () => {
    const { app, otp } = buildOAuthApp(db);
    const owner = await signInWithPhone(app, otp, '+911100002266');
    const member = await signInWithPhone(app, otp, '+911100002268');
    const { workspaceId, projectId } = await found(app, owner);
    await seedMember(db.pool, workspaceId, member.userId, 'member', [{ projectId }]);
    const token = await hostedToken(app, db.pool, member.userId);

    // CONTROL: before removal the same calls return data.
    const before = JSON.parse((await call(app, token, 'list_workspaces')).text) as { workspaces: unknown[] };
    expect(before.workspaces).toHaveLength(1);
    const okWrite = await call(app, token, 'create_ticket', { workspaceId, projectId, typeId: 'task', title: 'Before removal' });
    expect(okWrite.isError).toBe(false);

    const removed = await app.inject({
      method: 'POST',
      url: `/v1/workspaces/${workspaceId}/members/${member.userId}/remove`,
      headers: { authorization: `Bearer ${owner.token}` },
    });
    expect(removed.statusCode).toBe(200);

    expect(JSON.parse((await call(app, token, 'list_workspaces')).text)).toEqual({ workspaces: [] });
    const write = await call(app, token, 'create_ticket', { workspaceId, projectId, typeId: 'task', title: 'After removal' });
    expect(write.isError).toBe(true);
    const { rows } = await db.pool.query(
      `SELECT 1 FROM events WHERE workspace_id = $1 AND type = 'ticket.created' AND payload->>'title' = 'After removal'`,
      [workspaceId],
    );
    expect(rows).toHaveLength(0);
    await app.close();
  });
});

describe('POST /mcp — the log and the bucket', () => {
  it('14.268 one log line per tool call — tool, outcome, duration, user — and no token or content', async () => {
    const lines: string[] = [];
    const stream = new Writable({
      write(chunk, _enc, cb) {
        lines.push(String(chunk));
        cb();
      },
    });
    const { app, otp } = buildOAuthApp(db, { logStream: stream });
    await app.ready();
    const user = await signInWithPhone(app, otp, '+911100002269');
    const { workspaceId, projectId } = await found(app, user);
    const token = await hostedToken(app, db.pool, user.userId);
    lines.length = 0;

    const title = 'Secret crate title 7731';
    expect((await call(app, token, 'create_ticket', { workspaceId, projectId, typeId: 'task', title })).isError).toBe(false);
    // CONTROL, same `it`: a failing call is logged too, as outcome 'error'.
    expect((await call(app, token, 'transition_ticket', { workspaceId, ticketId: 'nope', to: 'nowhere' })).isError).toBe(true);

    const parsed = lines.flatMap((l) => l.split('\n')).filter((l) => l.trim() !== '').map((l) => JSON.parse(l) as Record<string, unknown>);
    const toolLines = parsed.filter((l) => l['msg'] === 'mcp tool call');
    expect(toolLines).toHaveLength(2);
    expect(toolLines.map((l) => [l['tool'], l['outcome']])).toEqual([['create_ticket', 'ok'], ['transition_ticket', 'error']]);
    for (const l of toolLines) {
      expect(typeof l['durationMs']).toBe('number');
      expect(l['userId']).toBe(user.userId);
    }
    const everything = JSON.stringify(parsed);
    expect(everything).not.toContain(token);
    expect(everything).not.toContain(title);
    expect(everything).not.toContain('nowhere');
    await app.close();
  });

  const limits = (): SecurityOptions => ({
    webOrigin: null,
    trustProxy: true,
    rateLimit: { authMax: 100, eventsMax: 100, inviteMax: 100, mcpMax: 1, signInMax: 100, windowSec: 60 },
  });
  it('14.269 /mcp is charged to the MCP bucket per caller; another caller is unaffected', async () => {
    const { app } = buildOAuthApp(db, { security: limits() });
    await app.ready();
    const as = (xff: string) => post(app, undefined, INIT, { 'x-forwarded-for': xff });
    expect((await as('203.0.113.10')).statusCode).toBe(401);
    expect((await as('203.0.113.10')).statusCode).toBe(429);
    expect((await as('203.0.113.11')).statusCode).toBe(401); // CONTROL: their own bucket
    await app.close();
  });
});
