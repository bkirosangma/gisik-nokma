import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allTools } from '@gisik-nokma/mcp-server';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import type { SecurityOptions } from '../../src/app.js';
import { hostedSession, inProcessFetch } from '../../src/mcp/in-process-fetch.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Hosted MCP plan, Task 6. Cases 14.251–14.253.
 *
 * The hosted `/mcp` route runs the package's nine tools over an in-process
 * `fetch` that calls the API's OWN routes with `app.inject`. Nothing here is
 * stubbed: the real `buildApp`, the real auth, the real ledger.
 */

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

const OUTER = { ip: '198.51.100.7', xff: undefined };

describe('14.251 a fetch becomes an inject and a real Response', () => {
  it('14.251 status, JSON body and headers come back as a Response; a 404 is a 404, not a throw', async () => {
    const { app, otp } = buildTestApp(db);
    const user = await signInWithPhone(app, otp, '+911100002251');
    const f = inProcessFetch(app, OUTER);

    const ok = await f('http://in-process/v1/me/workspaces', {
      headers: { authorization: `Bearer ${user.token}` },
    });
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ workspaces: [] });
    expect(ok.headers.get('content-type')).toContain('application/json');

    // CONTROL, same `it`: a route that does not exist comes back as a 404
    // Response carrying the server's own body — not an exception, and not 200.
    const missing = await f('http://in-process/v1/nope', {});
    expect(missing.status).toBe(404);
    const unauth = await f('http://in-process/v1/me/workspaces', {});
    expect(unauth.status).toBe(401);
    await app.close();
  });
});

describe('14.252 the in-process request carries the OUTER caller network identity (FD7)', () => {
  const limits = (trustProxy: boolean): SecurityOptions => ({
    webOrigin: null,
    trustProxy,
    rateLimit: { authMax: 100, eventsMax: 1, inviteMax: 100, mcpMax: 100, signInMax: 100, windowSec: 60 },
  });
  const post = (f: typeof fetch) =>
    f('http://in-process/v1/events', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer none' },
      body: JSON.stringify({ events: [] }),
    });

  it('14.252 two outer callers land in two buckets; the same outer caller shares one', async () => {
    const { app } = buildTestApp(db, { security: limits(false) });
    await app.ready();
    const a = inProcessFetch(app, { ip: '198.51.100.1', xff: undefined });
    const b = inProcessFetch(app, { ip: '198.51.100.2', xff: undefined });
    expect((await post(a)).status).not.toBe(429);
    // CONTROL, same `it`: a DIFFERENT outer caller has a bucket of its own …
    expect((await post(b)).status).not.toBe(429);
    // … and the SAME outer caller has spent theirs.
    expect((await post(a)).status).toBe(429);
    await app.close();
  });

  it('14.252 under trustProxy the outer x-forwarded-for is what keys the bucket', async () => {
    const { app } = buildTestApp(db, { security: limits(true) });
    await app.ready();
    const a = inProcessFetch(app, { ip: '10.0.0.1', xff: '203.0.113.1' });
    const b = inProcessFetch(app, { ip: '10.0.0.1', xff: '203.0.113.2' });
    expect((await post(a)).status).not.toBe(429);
    expect((await post(b)).status).not.toBe(429); // CONTROL: same socket, other xff
    expect((await post(a)).status).toBe(429);
    await app.close();
  });
});

describe('14.253 a tool run through hostedSession is the caller, origin mcp', () => {
  it('14.253 create_ticket writes origin mcp and actor = the token owner; a read equals the REST body', async () => {
    const { app, otp } = buildTestApp(db);
    await app.ready();
    const user = await signInWithPhone(app, otp, '+911100002253');
    const headers = { authorization: `Bearer ${user.token}` };

    const founded = await app.inject({ method: 'POST', url: '/v1/workspaces', headers, payload: { name: 'Hosted Corner' } });
    expect(founded.statusCode).toBe(201);
    const workspaceId = (founded.json() as { workspaceId: string }).workspaceId;
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
      actorId: user.userId,
    };
    const made = await app.inject({ method: 'POST', url: '/v1/events', headers, payload: { events: [project] } });
    expect((made.json() as { results: Array<{ status: string }> }).results[0]?.status).toBe('committed');

    const session = hostedSession(app, OUTER, user.token, user.userId);
    await session.ready(); // what `registerTools` does before every handler
    const tools = allTools(session);
    const tool = (name: string) => {
      const t = tools.find((x) => x.name === name);
      if (t === undefined) throw new Error(`no tool ${name}`);
      return t;
    };

    // `submitOne` returns the single committed result (a refusal or invalid
    // result THROWS), not the `{ results }` envelope.
    const created = await tool('create_ticket').handler({
      workspaceId,
      projectId,
      typeId: 'task',
      title: 'Count the crates',
    });
    expect(created).toMatchObject({ status: 'committed' });

    const { rows } = await db.pool.query<{ origin: string; actor_id: string }>(
      `SELECT origin, actor_id FROM events WHERE workspace_id = $1 AND type = 'ticket.created'`,
      [workspaceId],
    );
    expect(rows).toEqual([{ origin: 'mcp', actor_id: user.userId }]);

    // CONTROL, same `it`: a read tool returns exactly what the REST route returns.
    const rest = await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers });
    expect(await tool('list_workspaces').handler({})).toEqual(rest.json());
    await app.close();
  });
});

describe('14.301 the hosted session post goes through the in-process transport with the caller bearer', () => {
  it('14.301 post founds a workspace as the token owner; a post without the bearer would be a 401; get is unchanged', async () => {
    const { app, otp } = buildTestApp(db);
    await app.ready();
    const user = await signInWithPhone(app, otp, '+911100002301');
    const session = hostedSession(app, OUTER, user.token, user.userId);
    await session.ready();

    const founded = (await session.post('/v1/workspaces', { name: 'Posted Corner' })) as { workspaceId: string };
    expect(typeof founded.workspaceId).toBe('string');
    // The bearer is the proof: the founding door answers 201 only for an authenticated caller,
    // and the founder is the token's owner.
    const { rows } = await db.pool.query<{ actor_id: string }>(
      `SELECT actor_id FROM events WHERE workspace_id = $1 AND type = 'workspace.created'`,
      [founded.workspaceId],
    );
    expect(rows).toEqual([{ actor_id: user.userId }]);

    // CONTROL, same `it`: the unauthenticated route is a 401 (what a post without the bearer would draw) …
    const bare = await inProcessFetch(app, OUTER)('http://in-process/v1/workspaces', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'No bearer' }),
    });
    expect(bare.status).toBe(401);
    // … and `get` through the same session is unchanged.
    const listed = (await session.get('/v1/me/workspaces')) as { workspaces: Array<{ workspaceId: string }> };
    expect(listed.workspaces.map((w) => w.workspaceId)).toContain(founded.workspaceId);
    await app.close();
  });
});
