import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { allTools, createGisikClient, type Session } from '@gisik-nokma/mcp-server';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import { inProcessFetch } from '../../src/mcp/in-process-fetch.js';
import type { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { buildOAuthApp, hostedToken } from '../helpers/oauth.js';
import { TEST_WEB_ORIGIN } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithEmail } from '../helpers/session.js';

/**
 * MCP CRUD plan Task 8, against the REAL server. Cases 14.332, 14.334, 14.335 (the unit cases 14.328–14.331
 * and 14.333 are in `packages/mcp-server/test/read-tools.test.ts`).
 *
 * Every caller is a real person (real magic-link sign-in, so their email is a real one the roster would
 * show) with a real HOSTED token, calling through `POST /mcp` — the door an assistant uses. Guests and
 * members join through a real invitation, as in `routes/actor-names.test.ts`.
 */
let db: TestDatabase;
let app: FastifyInstance;
let magic: LogMagicLinkSender;

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildOAuthApp(db);
  app = built.app;
  magic = built.magic;
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await db.drop();
});

type Person = { userId: string; email: string; session: string; mcp: string };
let n = 0;
async function person(name: string): Promise<Person> {
  n += 1;
  const email = `t8-${n}-${newUlid().toLowerCase()}@example.test`;
  const u = await signInWithEmail(app, magic, email);
  await db.pool.query('UPDATE "user" SET "name" = $1 WHERE "id" = $2', [name, u.userId]);
  return { userId: u.userId, email, session: u.token, mcp: await hostedToken(app, db.pool, u.userId) };
}

const bearer = (token: string) => ({ authorization: `Bearer ${token}` });
const OUTER = { ip: '198.51.100.8', xff: undefined };

const rpc = (method: string, params: unknown, id = 1) => ({ jsonrpc: '2.0', id, method, params });
/** `tools/call` through the hosted door, unwrapped to what the assistant reads. */
async function hosted(who: Person, name: string, args: Record<string, unknown>) {
  const res = await app.inject({
    method: 'POST',
    url: '/mcp',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      'mcp-protocol-version': '2025-06-18',
      ...bearer(who.mcp),
    },
    payload: rpc('tools/call', { name, arguments: args }),
  });
  expect(res.statusCode).toBe(200);
  const result = res.json().result as { isError?: boolean; content: Array<{ text: string }> };
  const text = result.content[0]?.text ?? '';
  return { isError: result.isError === true, text, json: result.isError === true ? null : (JSON.parse(text) as unknown) };
}

/** The stdio door's shape: a Session over a device-flow (LOCAL) token, same tools, no `/mcp`. */
async function stdioLike(who: Person): Promise<Session> {
  const minted = (await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} })).json() as { deviceCode: string; userCode: string };
  const approved = await app.inject({ method: 'POST', url: '/v1/mcp/device/approve', headers: bearer(who.session), payload: { userCode: minted.userCode } });
  expect(approved.statusCode).toBe(200);
  const issued = (await app.inject({ method: 'POST', url: '/v1/mcp/device/token', payload: { deviceCode: minted.deviceCode } })).json() as { token: string };
  const client = createGisikClient('http://in-process', inProcessFetch(app, OUTER));
  return {
    userId: () => who.userId,
    get: (path) => client.get(path, issued.token),
    post: (path, body) => client.post(path, body, issued.token),
    postEvents: (events) => client.post('/v1/events', { events }, issued.token),
  };
}

const ev = (ws: string, actorId: string, entity: SubmittedEvent['entity'], type: string, payload: unknown): SubmittedEvent => ({
  id: newUlid(), workspaceId: ws, entity, type, version: 1, payload, actorId, origin: 'web', clientTime: new Date().toISOString(),
});
async function submit(who: Person, events: SubmittedEvent[]): Promise<void> {
  const res = await app.inject({ method: 'POST', url: '/v1/events', headers: bearer(who.session), payload: { events } });
  const results = (res.json() as { results: Array<{ status: string }> }).results;
  expect(results.map((r) => r.status), res.body).toEqual(events.map(() => 'committed'));
}
async function found(owner: Person): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/v1/workspaces', headers: bearer(owner.session), payload: { name: 'Task Eight' } });
  expect(res.statusCode, res.body).toBe(201);
  return (res.json() as { workspaceId: string }).workspaceId;
}
async function join(owner: Person, ws: string, who: Person, role: 'member' | 'guest'): Promise<void> {
  const minted = await app.inject({
    method: 'POST', url: `/v1/workspaces/${ws}/invites`, headers: bearer(owner.session), payload: { address: who.email, channel: 'email', role },
  });
  expect(minted.statusCode, minted.body).toBe(201);
  const token = (minted.json() as { url: string }).url.slice(`${TEST_WEB_ORIGIN}/invite/`.length);
  const accepted = await app.inject({ method: 'POST', url: `/v1/invites/${token}/accept`, headers: bearer(who.session) });
  expect(accepted.statusCode, accepted.body).toBe(200);
}
async function project(owner: Person, ws: string, name: string): Promise<string> {
  const id = newUlid();
  await submit(owner, [ev(ws, owner.userId, { kind: 'project', id }, 'project.created', { name })]);
  return id;
}
async function ticket(by: Person, ws: string, projectId: string, title: string, assignee: Person | null, audience?: string[]): Promise<string> {
  const id = newUlid();
  await submit(by, [
    ev(ws, by.userId, { kind: 'ticket', id }, 'ticket.created', {
      typeId: 'task', projectId, parentId: null, title, ...(assignee === null ? {} : { assigneeId: assignee.userId }),
    }),
    ...(audience === undefined ? [] : [ev(ws, by.userId, { kind: 'ticket', id }, 'visibility.set', { ticketId: id, mode: 'explicit', userIds: audience })]),
  ]);
  return id;
}

type Members = { workspaceId: string; members: Array<{ userId: string; name: string; email?: string; role?: string; removed?: true }> };
type ListBody = { projectId: string | null; groups: Array<{ cards: Array<{ ticketId: string }> }> };
const cardIds = (body: unknown): string[] => (body as ListBody).groups.flatMap((g) => g.cards.map((c) => c.ticketId)).sort();

describe('14.334 list_members through the hosted door: a member gets the roster, a guest never does', () => {
  it('14.334 member: names, roles, real emails; guest: only the people on their own tickets, no role, no email', async () => {
    const owner = await person('Owner Marak');
    const ws = await found(owner);
    const prj = await project(owner, ws, 'Stock');
    const creator = await person('Cara Creator');
    const assignee = await person('Asha Assignee');
    const bystander = await person('Bo Bystander');
    const guest = await person('Gita Guest');
    for (const who of [creator, assignee, bystander]) await join(owner, ws, who, 'member');
    await join(owner, ws, guest, 'guest');
    await ticket(creator, ws, prj, 'Count the till', assignee, [creator.userId, assignee.userId, guest.userId]);

    // The guest: `/members` is a 404 for them, so the tool falls back to the scoped names.
    const asGuest = await hosted(guest, 'list_members', { workspaceId: ws });
    expect(asGuest.isError, asGuest.text).toBe(false);
    const guestRows = (asGuest.json as Members).members;
    expect(guestRows.map((m) => m.userId).sort()).toEqual([creator.userId, assignee.userId].sort());
    for (const row of guestRows) expect(Object.keys(row).sort()).toEqual(['name', 'userId']); // no role, no email, nothing else
    // Nobody else's id or address is anywhere in the answer: not the owner, not the bystander.
    for (const hidden of [owner, bystander]) {
      expect(asGuest.text).not.toContain(hidden.userId);
      expect(asGuest.text).not.toContain(hidden.email);
    }

    // CONTROL, same `it`: a member of the same workspace gets the roster — roles, and the real emails.
    const asMember = await hosted(bystander, 'list_members', { workspaceId: ws });
    expect(asMember.isError, asMember.text).toBe(false);
    const roster = (asMember.json as Members).members;
    expect(roster.find((m) => m.userId === owner.userId)).toMatchObject({ name: 'Owner Marak', role: 'owner', email: owner.email });
    expect(roster.find((m) => m.userId === bystander.userId)).toMatchObject({ role: 'member' });
    expect(roster.length).toBeGreaterThanOrEqual(4);

    // …and a stranger is told plainly, not handed a raw 404.
    const stranger = await person('Sam Stranger');
    const refused = await hosted(stranger, 'list_members', { workspaceId: ws });
    expect(refused.isError).toBe(true);
    expect(refused.text).toBe('workspace not found or not visible to you');
  });
});

describe('14.335 list_tickets by workspace through the hosted door: "me", plural keys, scope', () => {
  it('14.335 workspaceId + assigneeId "me" spans projects; assigneeIds takes a list; the project scope narrows; both scopes at once is refused', async () => {
    const owner = await person('Owner Marak');
    const ws = await found(owner);
    const other = await person('Ravi Member');
    await join(owner, ws, other, 'member');
    const p1 = await project(owner, ws, 'Front shop');
    const p2 = await project(owner, ws, 'Back office');
    const mine1 = await ticket(owner, ws, p1, 'Mine, shop', owner);
    const mine2 = await ticket(owner, ws, p2, 'Mine, office', owner);
    const theirs = await ticket(owner, ws, p1, 'Ravi’s', other);
    await ticket(owner, ws, p2, 'Nobody’s', null);

    const me = await hosted(owner, 'list_tickets', { workspaceId: ws, filter: { assigneeId: 'me' } });
    expect(me.isError, me.text).toBe(false);
    expect((me.json as ListBody).projectId).toBeNull(); // the workspace scope's answer
    expect(cardIds(me.json)).toEqual([mine1, mine2].sort());

    const either = await hosted(owner, 'list_tickets', { workspaceId: ws, filter: { assigneeIds: ['me', other.userId] } });
    expect(cardIds(either.json)).toEqual([mine1, mine2, theirs].sort());

    // CONTROL, same `it`: the SAME filter through the project scope narrows to that one project.
    const scoped = await hosted(owner, 'list_tickets', { projectId: p1, filter: { assigneeId: 'me' } });
    expect(cardIds(scoped.json)).toEqual([mine1]);

    // Both scopes (and a singular+plural pair) are refused before anything is read.
    const both = await hosted(owner, 'list_tickets', { workspaceId: ws, projectId: p1 });
    expect(both.isError).toBe(true);
    expect(both.text).toMatch(/takes one scope, not both/);
    const pair = await hosted(owner, 'list_tickets', { workspaceId: ws, filter: { assigneeId: 'a', assigneeIds: ['b'] } });
    expect(pair.isError).toBe(true);
    expect(pair.text).toContain('a field takes a single value OR a list, not both');
  });
});

describe('14.332 the same three tools give the same answers through the hosted door and the stdio door', () => {
  it('14.332 list_members and both list_tickets scopes: `/mcp` with a hosted token equals allTools over a device-flow token', async () => {
    const owner = await person('Owner Marak');
    const ws = await found(owner);
    const p1 = await project(owner, ws, 'Front shop');
    const p2 = await project(owner, ws, 'Back office');
    await ticket(owner, ws, p1, 'First', owner);
    await ticket(owner, ws, p2, 'Second', owner);
    await ticket(owner, ws, p2, 'Third', null);

    const stdio = allTools(await stdioLike(owner));
    const viaStdio = (name: string, args: Record<string, unknown>) => {
      const t = stdio.find((x) => x.name === name);
      if (t === undefined) throw new Error(`no tool ${name}`);
      return t.handler(args);
    };
    const calls: Array<[string, Record<string, unknown>]> = [
      ['list_members', { workspaceId: ws }],
      ['list_tickets', { projectId: p2, groupBy: 'flat' }],
      ['list_tickets', { workspaceId: ws, groupBy: 'flat', filter: { assigneeId: 'me' } }],
    ];
    for (const [name, args] of calls) {
      const door = await hosted(owner, name, args);
      expect(door.isError, door.text).toBe(false);
      // JSON round trip on the stdio side so both are compared as the assistant would read them.
      expect(door.json).toEqual(JSON.parse(JSON.stringify(await viaStdio(name, args))));
    }
    // CONTROL, same `it`: the comparison can fail — the filtered and unfiltered workspace lists differ.
    const all = await hosted(owner, 'list_tickets', { workspaceId: ws, groupBy: 'flat' });
    const mine = await hosted(owner, 'list_tickets', { workspaceId: ws, groupBy: 'flat', filter: { assigneeId: 'me' } });
    expect(cardIds(all.json)).toHaveLength(3);
    expect(cardIds(mine.json)).toHaveLength(2);
  });
});
