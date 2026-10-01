import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { allTools } from '@gisik-nokma/mcp-server';
import { newUlid, type LedgerEvent, type SearchResponse, type SubmittedEvent } from '@gisik-nokma/domain';
import { hostedSession } from '../../src/mcp/in-process-fetch.js';
import { workspaceIdentityFromLedger } from '../../src/workspaces/workspace-name.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildOAuthApp, hostedToken } from '../helpers/oauth.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Prefixes and groups plan Task 4 — a ticket is found by its KEY, current or former (FD1).
 * Cases 22.061–22.066 (22.060 is the domain parser's, `packages/domain/test/prefix.test.ts`).
 *
 * Nothing turned a key back into a ticket before this: search indexed title, description and
 * comments only. A key-shaped query now resolves through the workspace's current AND former
 * prefixes × each project's current and former prefixes, and the ticket it names is put FIRST,
 * through the SAME visibility predicate the lexical branch uses (never a second rule).
 *
 * One database, one read world, one workspace: each case founds a project of its own (a prefix
 * nothing else holds) so no case changes what another measures. The cases run in file order and
 * 22.063 changes the workspace prefix last of the route cases, so every later key is composed
 * from the CURRENT workspace prefix (`keyOf`), never a literal.
 */

let db: TestDatabase;
let read: ReadWorld;

beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
}, 120_000);

afterAll(async () => {
  await read.app.close();
  await db.drop();
});

const owner = (): string => read.world.owner;
const WS = (): string => read.world.workspaceId;

type Founded = { projectId: string; tickets: string[] };

/** A project (ENTERED prefix) with `titles.length` tickets, numbered 1..n in this order. */
async function foundProject(prefix: string, titles: readonly string[]): Promise<Founded> {
  const projectId = newUlid();
  const ws = { workspaceId: WS(), actorId: owner() };
  const tickets = titles.map(() => newUlid());
  const events: LedgerEvent[] = [
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.created', payload: { name: `Keys ${prefix}`, prefix } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.member_added', payload: { userId: owner(), projectAdmin: true } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.member_added', payload: { userId: read.world.member, projectAdmin: false } }),
    ...titles.map((title, index) =>
      makeCommitted({
        ...ws,
        entity: { kind: 'ticket', id: tickets[index] as string },
        type: 'ticket.created',
        payload: { typeId: 'task', projectId, parentId: null, title },
      }),
    ),
  ];
  await applyCommitted(db.pool, events);
  return { projectId, tickets };
}

async function setProjectPrefix(projectId: string, prefix: string): Promise<void> {
  await applyCommitted(db.pool, [
    makeCommitted({ workspaceId: WS(), actorId: owner(), entity: { kind: 'project', id: projectId }, type: 'project.updated', payload: { prefix } }),
  ]);
}

async function setWorkspacePrefix(prefix: string): Promise<void> {
  await applyCommitted(db.pool, [
    makeCommitted({ workspaceId: WS(), actorId: owner(), entity: { kind: 'workspace', id: WS() }, type: 'workspace.prefix_changed', payload: { prefix } }),
  ]);
}

/** The workspace prefix RIGHT NOW. */
async function wsPrefix(): Promise<string> {
  const identity = await workspaceIdentityFromLedger(db.pool, WS());
  if (identity.prefix === null) throw new Error('the read world has no workspace prefix');
  return identity.prefix;
}

async function search(role: ReadRole, q: string, workspaceId: string = WS()) {
  return read.app.inject({
    method: 'GET',
    url: `/v1/search?workspaceId=${encodeURIComponent(workspaceId)}&q=${encodeURIComponent(q)}`,
    headers: read.authOf(role),
  });
}

async function hits(role: ReadRole, q: string, workspaceId: string = WS()): Promise<SearchResponse['hits']> {
  const response = await search(role, q, workspaceId);
  expect(response.statusCode, response.body).toBe(200);
  return (response.json() as SearchResponse).hits;
}

const ids = (list: SearchResponse['hits']): string[] => list.map((hit) => hit.card.ticketId);

describe('22.061 searching a ticket key returns that ticket first', () => {
  it('22.061 — "<ws>ZQ-2" puts the ticket first, ahead of a ticket that merely MENTIONS the key, once only; control: a key nothing holds finds nothing', async () => {
    const ws = await wsPrefix();
    const key2 = `${ws}ZQ-2`;
    // #1 is the lexical bait: its TITLE carries the key text, and it is created first (lower id), so
    // a route that ranked it ahead of the key's own ticket — or that had no key lookup at all — fails.
    const founded = await foundProject('ZQ', [`Mentions ${key2} in passing`, 'Second crate', `Third crate, filed as ${ws}ZQ-3`]);
    const [bait, target, selfNamed] = founded.tickets as [string, string, string];

    const found = await hits('member', key2);
    expect(found[0]?.card.ticketId).toBe(target);
    expect(found[0]?.card.key).toBe(key2);
    expect(ids(found)).toEqual([target, bait]); // the bait stays a hit, AFTER the key's ticket

    // A ticket that matches BOTH ways (its title carries its own key) appears ONCE.
    expect(ids(await hits('member', `${ws}ZQ-3`))).toEqual([selfNamed]);

    // CONTROL, same `it`: a key-shaped query nothing holds is not an error and finds nothing.
    expect(await hits('member', `${ws}ZQ-99`)).toEqual([]);
    expect(await hits('member', `${ws}ZY-1`)).toEqual([]);
  });
});

describe('22.062 a FORMER project prefix still finds the ticket, and the card shows the current key', () => {
  it('22.062 — after SO → SH the old key finds it and its card reads the new key; control: before the move the card read the old key', async () => {
    const ws = await wsPrefix();
    const { projectId, tickets } = await foundProject('ZR', ['Count the crates']);
    const ticket = tickets[0] as string;

    const before = await hits('member', `${ws}ZR-1`);
    expect(ids(before)).toEqual([ticket]);
    expect(before[0]?.card.key).toBe(`${ws}ZR-1`); // CONTROL: the card read the old key

    await setProjectPrefix(projectId, 'ZS');

    const viaOld = await hits('member', `${ws}ZR-1`);
    expect(ids(viaOld)).toEqual([ticket]);
    expect(viaOld[0]?.card.key).toBe(`${ws}ZS-1`);
    expect(ids(await hits('member', `${ws}ZS-1`))).toEqual([ticket]); // and the new one
    expect(await hits('member', `${ws}ZT-1`)).toEqual([]); // a prefix it never held
  });
});

describe('22.063 a FORMER workspace prefix still finds the ticket', () => {
  it('22.063 — after CC → another prefix, both the old and the new workspace letters find it, with a current OR a former project prefix; control: letters it never held find nothing', async () => {
    const oldWs = await wsPrefix();
    const { projectId, tickets } = await foundProject('ZV', ['Weigh the stock']);
    const ticket = tickets[0] as string;
    await setProjectPrefix(projectId, 'ZW'); // ZV is now a former project prefix too
    const newWs = oldWs === 'QX' ? 'QY' : 'QX';
    await setWorkspacePrefix(newWs);

    for (const key of [`${oldWs}ZV-1`, `${oldWs}ZW-1`, `${newWs}ZV-1`, `${newWs}ZW-1`]) {
      const found = await hits('member', key);
      expect(ids(found), key).toEqual([ticket]);
      expect(found[0]?.card.key, key).toBe(`${newWs}ZW-1`); // always the CURRENT key
    }
    // CONTROL, same `it`: a workspace prefix it never held, and a project prefix it never held.
    expect(await hits('member', `QZZV-1`)).toEqual([]);
    expect(await hits('member', `${newWs}ZX-1`)).toEqual([]);
  });
});

describe('22.064 case and stray spaces do not matter (review focus 2)', () => {
  it('22.064 — "ccso-12"-shaped lower case and padded text still find the ticket; control: the upper-case key finds it too', async () => {
    const ws = await wsPrefix();
    const { tickets } = await foundProject('ZL', ['First', 'Second']);
    const second = tickets[1] as string;
    const key = `${ws}ZL-2`;

    expect(ids(await hits('member', key))).toEqual([second]); // CONTROL
    expect(ids(await hits('member', key.toLowerCase()))).toEqual([second]);
    expect(ids(await hits('member', `  ${key.toLowerCase()}  `))).toEqual([second]);
    expect(ids(await hits('member', ` ${key.slice(0, 2)}${key.slice(2).toLowerCase()} `))).toEqual([second]); // mixed case
  });
});

describe('22.065 a key finds only what the caller may see', () => {
  it('22.065 — an owner-only ticket, a project-mode ticket seen by a guest, another workspace, and a non-member: nothing; control: the visible one is found', async () => {
    const ws = await wsPrefix();
    const { tickets } = await foundProject('ZH', ['Everyone sees this', 'Owner only']);
    const [open, secret] = tickets as [string, string];
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS(),
        actorId: owner(),
        entity: { kind: 'ticket', id: secret },
        type: 'visibility.set',
        payload: { ticketId: secret, mode: 'explicit', userIds: [owner()] },
      }),
    ]);

    // CONTROL, same `it`: the owner finds both; the member finds the open one.
    expect(ids(await hits('owner', `${ws}ZH-1`))).toEqual([open]);
    expect(ids(await hits('owner', `${ws}ZH-2`))).toEqual([secret]);
    expect(ids(await hits('member', `${ws}ZH-1`))).toEqual([open]);

    // A ticket the caller may not see is not a hit by key either: the member and the outsider for
    // the explicit-mode one, the guest for the project-mode one (a guest reaches work only by list).
    expect(await hits('member', `${ws}ZH-2`)).toEqual([]);
    expect(await hits('outsider', `${ws}ZH-2`)).toEqual([]);
    expect(await hits('guest', `${ws}ZH-1`)).toEqual([]);
    expect(await hits('guest', `${ws}ZH-2`)).toEqual([]);

    // Another tenancy: the neighbour's own key finds their ticket in THEIR workspace, and the same key in
    // this workspace finds nothing (it names no project here).
    const own = await hits('neighbour', 'Neighbour tenancy marker', read.neighbour.workspaceId);
    const neighbourKey = own[0]?.card.key;
    expect(neighbourKey).toMatch(/^[A-Z]+-1$/);
    expect(ids(await hits('neighbour', neighbourKey as string, read.neighbour.workspaceId))).toEqual([read.neighbour.ticketId]);
    expect(await hits('owner', neighbourKey as string)).toEqual([]);

    // A caller outside the workspace is the route's 404 and no ticket reaches them.
    const stranger = await search('stranger', `${ws}ZH-1`);
    expect(stranger.statusCode).toBe(404);
    expect(stranger.body).not.toContain(open);
    expect((await search('neighbour', `${ws}ZH-1`)).statusCode).toBe(404);
  });
});

describe('22.066 the hosted MCP search_tickets finds a ticket by its current or former key', () => {
  it('22.066 — search_tickets { query: "<key>" } returns the ticket, also by the key it held before a project prefix change; control: a key nothing holds returns no hits', async () => {
    const { app, otp } = buildOAuthApp(db);
    await app.ready();
    const user = await signInWithPhone(app, otp, '+911100002266');
    const session = hostedSession(app, { ip: '198.51.100.66', xff: undefined }, await hostedToken(app, db.pool, user.userId), user.userId);
    await session.ready();
    const tools = allTools(session);
    const run = (name: string, args: Record<string, unknown>) => {
      const t = tools.find((x) => x.name === name);
      if (t === undefined) throw new Error(`no tool ${name}`);
      return t.handler(args);
    };

    const { workspaceId } = (await run('create_workspace', { name: 'Hosted Keys' })) as { workspaceId: string };
    const { projectId } = (await run('create_project', { workspaceId, name: 'Repairs', prefix: 'RP' })) as { projectId: string };
    await run('create_ticket', { workspaceId, projectId, typeId: 'task', title: 'Count the crates' });
    const searchKey = async (query: string) => (await run('search_tickets', { workspaceId, query })) as SearchResponse;

    const found = await searchKey('HKRP-1');
    expect(found.hits).toHaveLength(1);
    expect(found.hits[0]?.card.title).toBe('Count the crates');
    expect(found.hits[0]?.card.key).toBe('HKRP-1');
    const ticketId = found.hits[0]?.card.ticketId;

    // The former key, after the project's prefix moves (an owner's `project.updated`, through the real door).
    const move: SubmittedEvent = {
      id: newUlid(),
      version: 1,
      origin: 'web',
      clientTime: new Date().toISOString(),
      workspaceId,
      entity: { kind: 'project', id: projectId },
      type: 'project.updated',
      payload: { prefix: 'RQ' },
      actorId: user.userId,
    };
    const moved = await app.inject({ method: 'POST', url: '/v1/events', headers: { authorization: `Bearer ${user.token}` }, payload: { events: [move] } });
    expect((moved.json() as { results: Array<{ status: string }> }).results[0]?.status).toBe('committed');

    const viaOld = await searchKey('HKRP-1');
    expect(viaOld.hits.map((h) => h.card.ticketId)).toEqual([ticketId]);
    expect(viaOld.hits[0]?.card.key).toBe('HKRQ-1');

    // CONTROL, same `it`: a key nothing holds is an empty answer, not an error.
    expect((await searchKey('HKRZ-1')).hits).toEqual([]);
    await app.close();
  });
});

/** A project with NO entered prefix: its prefix is DERIVED from the name, so a collision moves it to `SO2`-style. */
async function foundDerivedProject(name: string, title: string): Promise<Founded> {
  const projectId = newUlid();
  const ticket = newUlid();
  const ws = { workspaceId: WS(), actorId: owner() };
  await applyCommitted(db.pool, [
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.created', payload: { name } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.member_added', payload: { userId: owner(), projectAdmin: true } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.member_added', payload: { userId: read.world.member, projectAdmin: false } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: ticket }, type: 'ticket.created', payload: { typeId: 'task', projectId, parentId: null, title } }),
  ]);
  return { projectId, tickets: [ticket] };
}

describe('22.068 a key whose project prefix took a collision digit is found', () => {
  it('22.068 — two projects deriving the same prefix hold ZO and ZO2: "<ws>ZO2-1" finds the second project\'s ticket; control: "<ws>ZO-1" finds the first\'s', async () => {
    const ws = await wsPrefix();
    // Project ids ascend in creation order, which is what decides who keeps the bare derivation.
    const first = await foundDerivedProject('Zulu Orchard', 'Plant the zulu trees');
    const second = await foundDerivedProject('Zebra Outpost', 'Stock the zebra hut');
    expect(first.projectId < second.projectId).toBe(true);

    const second1 = await hits('member', `${ws}ZO2-1`);
    expect(ids(second1)).toEqual([second.tickets[0]]);
    expect(second1[0]?.card.key).toBe(`${ws}ZO2-1`); // the key the product SHOWS is the key that searches
    // CONTROL, same `it`: the bare derivation still finds the first project's ticket, and not the second's.
    expect(ids(await hits('member', `${ws}ZO-1`))).toEqual([first.tickets[0]]);
    expect(await hits('member', `${ws}ZO3-1`)).toEqual([]); // a digit nothing took finds nothing
  });
});
