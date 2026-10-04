import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid, ticketKey, type LedgerEvent, type TicketLinkKind } from '@gisik-nokma/domain';
import { ticketNumbers } from '../../src/read/ticket-numbers.js';
import { NOT_FOUND_BODY } from '../../src/routes/tickets.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

/**
 * Typed links, the server reads (typed-links plan Task 4; spec A §2.4): the
 * links route, the detail read's `ticketState.links` and History's labels,
 * through the REAL routes against a REAL database.
 *
 * ## The world
 *
 * `buildReadTestApp`'s scenario (`read-scenario.ts`): the member sees S
 * (`taskInEpicId`, project mode) and SH (`sharedTaskId`, explicit owner +
 * member), not H (`hiddenTaskId`, explicit owner only); the guest sees G
 * (`guestTaskId`, explicit owner + guest), not H. Four links are seeded:
 * S blocks SH, H relates S, S duplicates H, and G blocks H. The fourth gives
 * 27.052 a ticket whose ONLY link is hidden from its viewer.
 *
 * ## Order is load-bearing
 *
 * The `it`s run in file order 27.050 → 27.054. 27.051 trashes SH and restores
 * it before it ends; 27.054 runs LAST because it removes S blocks SH.
 *
 * ## Keys
 *
 * The world has no entered prefixes, so a key is the derived
 * `ticketKey('CC', 'RE', n)` (13.1278's arm), with `n` from `ticketNumbers`.
 */

let db: TestDatabase;
let world: ReadWorld;
let app: FastifyInstance;
let WS: string;
let S: string;
let SH: string;
let H: string;
let G: string;
let owner: string;
let member: string;

type LinksBody = { links: Array<{ kind: string; direction: string; ticket: { id: string; projectId: string; key: string | null; title: string; stateCategory: string } }> };
type HistoryBody = { events: Array<{ type: string; actorId: string; payload: Record<string, unknown>; linkTarget?: { key: string | null } | null }> };

const link = (source: string, kind: TicketLinkKind, targetId: string): LedgerEvent =>
  makeCommitted({ workspaceId: WS, actorId: owner, entity: { kind: 'ticket', id: source }, type: 'ticket.link_added', payload: { kind, targetId } });

beforeAll(async () => {
  db = await createTestDatabase();
  world = await buildReadTestApp(db);
  app = world.app;
  WS = world.world.workspaceId;
  S = world.world.taskInEpicId;
  SH = world.world.sharedTaskId;
  H = world.world.hiddenTaskId;
  G = world.world.guestTaskId;
  owner = world.userIds.owner;
  member = world.userIds.member;
  await applyCommitted(db.pool, [link(S, 'blocks', SH), link(H, 'relates', S), link(S, 'duplicates', H), link(G, 'blocks', H)]);
});

afterAll(async () => {
  await db.drop();
});

const linksOf = async (role: ReadRole, id = S) =>
  (await app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${id}/links`, headers: world.authOf(role) })).json() as LinksBody;
const triples = (body: LinksBody) => body.links.map((l) => [l.kind, l.direction, l.ticket.id]);
const historyOf = async (role: ReadRole, id = S) =>
  ((await app.inject({ method: 'GET', url: `/v1/tickets/${id}/history`, headers: world.authOf(role) })).json() as HistoryBody).events;
const keyOf = async (id: string) => ticketKey('CC', 'RE', (await ticketNumbers(db.pool, WS, [id])).get(id)!);

describe('typed links, the server reads (27.050–27.054)', () => {
  it('27.050 both directions, hidden ends dropped with no trace; a hidden ticket is a 404; control: owner sees all', async () => {
    const member = await linksOf('member');
    expect(triples(member)).toEqual([['blocks', 'out', SH]]);
    expect(JSON.stringify(member)).not.toContain(H);
    expect(Object.keys(member)).toEqual(['links']);
    // The other end's shape: exact key, title, category (SH sits in `waiting`, category active: read-scenario.ts).
    expect(member.links[0]!.ticket).toEqual({ id: SH, projectId: world.world.projectId, key: await keyOf(SH), title: 'Renew the trade licence', stateCategory: 'active' });
    const owner = await linksOf('owner');
    expect(triples(owner).sort()).toEqual([['blocks', 'out', SH], ['duplicates', 'out', H], ['relates', 'in', H]].sort());

    // N1 (AMEND p11): the route's own guard (the wire contract). The member cannot see H; NEVER was never minted.
    const NEVER = newUlid();
    const asMember = (id: string) => app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${id}/links`, headers: world.authOf('member') });
    const hiddenRes = await asMember(H);
    const neverRes = await asMember(NEVER);
    expect(hiddenRes.statusCode).toBe(404);
    expect(hiddenRes.json()).toEqual(NOT_FOUND_BODY);
    expect(hiddenRes.body).toBe(neverRes.body); // byte-identical: no existence oracle
    expect((await asMember(S)).statusCode).toBe(200); // control: a ticket the member sees
  });

  it('27.051 a trashed other end drops the row; restore brings it back; control: present before', async () => {
    expect(triples(await linksOf('owner'))).toContainEqual(['blocks', 'out', SH]);
    await applyCommitted(db.pool, [makeCommitted({ workspaceId: WS, actorId: owner, entity: { kind: 'ticket', id: SH }, type: 'ticket.deleted', payload: {} })]);
    const during = triples(await linksOf('owner'));
    expect(during).not.toContainEqual(['blocks', 'out', SH]);
    expect(during).toContainEqual(['duplicates', 'out', H]); // only the trashed end's row goes
    await applyCommitted(db.pool, [makeCommitted({ workspaceId: WS, actorId: owner, entity: { kind: 'ticket', id: SH }, type: 'ticket.restored', payload: {} })]);
    expect(triples(await linksOf('owner'))).toContainEqual(['blocks', 'out', SH]);
  });

  it('27.052 ticketState.links holds only visible targets, no key when none remain; control: the owner holds both', async () => {
    const stateOf = async (role: ReadRole, id: string) =>
      (await app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${id}`, headers: world.authOf(role) })).json().ticketState as Record<string, unknown>;
    expect((await stateOf('member', S))['links']).toEqual([{ kind: 'blocks', targetId: SH }]);
    expect((await stateOf('owner', S))['links']).toEqual([{ kind: 'blocks', targetId: SH }, { kind: 'duplicates', targetId: H }]);
    const guestG = await stateOf('guest', G);
    expect(guestG['id']).toBe(G); // precondition: the guest read the ticket
    expect('links' in guestG).toBe(false); // its one link targets H: no key, not `[]`
    expect((await stateOf('owner', G))['links']).toEqual([{ kind: 'blocks', targetId: H }]); // control: the link is stored
  });

  it('27.053 History labels link events, a hidden target withheld; control: a non-link event is untouched, and the owner gets the key', async () => {
    const member = await historyOf('member');
    const linkOf = (events: HistoryBody['events'], kind: string) => events.find((e) => e.type === 'ticket.link_added' && e.payload['kind'] === kind)!;
    expect(linkOf(member, 'blocks').linkTarget).toEqual({ key: await keyOf(SH) });
    expect(linkOf(member, 'blocks').payload).toEqual({ kind: 'blocks', targetId: SH });
    expect(linkOf(member, 'duplicates').linkTarget).toBeNull();
    expect(linkOf(member, 'duplicates').payload).toEqual({ kind: 'duplicates', targetId: null });
    expect(JSON.stringify(member)).not.toContain(H); // H is a real ULID in the stored payload: the withholding is the route's
    expect('linkTarget' in member.find((e) => e.type === 'ticket.created')!).toBe(false);
    const ownerDup = linkOf(await historyOf('owner'), 'duplicates');
    expect(ownerDup.linkTarget).toEqual({ key: await keyOf(H) });
    expect(ownerDup.payload).toEqual({ kind: 'duplicates', targetId: H });

    // N2 (AMEND p11): one distinct target. The just-inside leg for `linkTargets.length > 0`.
    const linkAdds = (events: HistoryBody['events']) => events.filter((e) => e.type === 'ticket.link_added');
    const ownerG = linkAdds(await historyOf('owner', G));
    expect(ownerG).toHaveLength(1); // precondition: one link event, one distinct target
    expect(ownerG[0]!.linkTarget).toEqual({ key: await keyOf(H) });
    const guestG = linkAdds(await historyOf('guest', G));
    expect(guestG).toHaveLength(1);
    expect(guestG[0]!.linkTarget).toBeNull();
    expect(guestG[0]!.payload).toEqual({ kind: 'blocks', targetId: null });
  });

  it("27.054 a removal from the TARGET's side is a link_removed on the SOURCE's history, by the remover; control: the target's history holds none", async () => {
    expect(triples(await linksOf('member', SH))).toEqual([['blocks', 'in', S]]); // precondition: SH's sheet shows the incoming link
    await applyCommitted(db.pool, [makeCommitted({ workspaceId: WS, actorId: member, entity: { kind: 'ticket', id: S }, type: 'ticket.link_removed', payload: { kind: 'blocks', targetId: SH } })]);
    expect(triples(await linksOf('member', SH))).toEqual([]);
    const removed = (await historyOf('member')).filter((e) => e.type === 'ticket.link_removed');
    expect(removed.map((e) => [e.actorId, e.linkTarget])).toEqual([[member, { key: await keyOf(SH) }]]);
    const shHistory = await historyOf('member', SH);
    expect(shHistory.length).toBeGreaterThan(0); // precondition: the filter below runs over SH's real history
    expect(shHistory.filter((e) => e.type.startsWith('ticket.link_'))).toEqual([]);
  });
});
