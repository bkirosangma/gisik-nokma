import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid, ticketKey, type LedgerEvent, type TicketLinkKind } from '@gisik-nokma/domain';
import { describeEvent } from '@gisik-nokma/app-core';
import { mapHistory } from '@gisik-nokma/app-core/online';
import { linkWorld } from '../helpers/draft-link-world.js';
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

/**
 * 29.126 (wtg2 T2): the `leads_to` label on the server's doors. Runs after 27.054 (file order), on the same world:
 * S leads to SH ("Yes", both visible to the member) and S leads to H ("Maybe", H hidden from the member).
 */
describe('29.126 the leads_to label on the server reads', () => {
  const lead = (source: string, targetId: string, label: string): LedgerEvent =>
    makeCommitted({ workspaceId: WS, actorId: owner, entity: { kind: 'ticket', id: source }, type: 'ticket.link_added', payload: { kind: 'leads_to', targetId, label } });

  it('29.126 GET …/links carries the label both ways and no key when none; History and /events keep it on a withheld copy whose hidden end is the TARGET, with no target id or key', async () => {
    await applyCommitted(db.pool, [lead(S, SH, 'Yes'), lead(S, H, 'Maybe')]);
    const sh = { id: SH, projectId: world.world.projectId, key: await keyOf(SH) };
    const memberS = (await linksOf('member')).links;
    expect(memberS.filter((l) => l.kind === 'leads_to')).toEqual([
      { kind: 'leads_to', direction: 'out', ticket: { ...sh, title: expect.any(String), stateCategory: expect.any(String) }, label: 'Yes' },
    ]); // the hidden H's row is not listed
    expect((await linksOf('member', SH)).links.filter((l) => l.kind === 'leads_to').map((l) => [l.direction, l.ticket.id, (l as { label?: string }).label])).toEqual([['in', S, 'Yes']]);
    // control: the owner's label-free rows carry no `label` key at all; both leads_to rows carry theirs
    const ownerS = (await linksOf('owner')).links;
    expect(ownerS.filter((l) => l.kind !== 'leads_to').length).toBeGreaterThan(0); // precondition
    for (const l of ownerS) expect('label' in l, l.kind).toBe(l.kind === 'leads_to');
    expect(ownerS.filter((l) => l.kind === 'leads_to').map((l) => [l.ticket.id, (l as { label?: string }).label])).toEqual([[SH, 'Yes'], [H, 'Maybe']]);

    // History (planner ruling 13:01, spec LK-6): a withheld copy whose hidden end is the TARGET keeps the label, and no
    // target id or key. A hidden SOURCE's label is dropped (planner ruling 2026-10-05 00:13): `draft-link-reads.test.ts`, 29.126.
    const hKey = await keyOf(H);
    const toH = (events: HistoryBody['events']) => events.find((e) => e.type === 'ticket.link_added' && e.payload['kind'] === 'leads_to' && e.payload['label'] === 'Maybe')!;
    const memberEvent = toH(await historyOf('member'));
    expect(memberEvent, "the member's withheld copy still carries the label 'Maybe'").toBeDefined();
    expect(JSON.stringify(memberEvent.payload)).toBe('{"kind":"leads_to","targetId":null,"label":"Maybe"}');
    expect(memberEvent.linkTarget).toBeNull();
    expect(JSON.stringify(memberEvent)).not.toContain(H);
    expect(JSON.stringify(memberEvent)).not.toContain(hKey);
    const historyRes = await app.inject({ method: 'GET', url: `/v1/tickets/${S}/history`, headers: world.authOf('member') });
    const lines = mapHistory(historyRes.json()).filter((e) => e.type === 'ticket.link_added' && (e.payload as Record<string, unknown>)['kind'] === 'leads_to');
    expect(lines.map((e) => describeEvent(e))).toEqual([`Linked: leads to ${sh.key} (Yes)`, "Linked: leads to a ticket you can't see (Maybe)"]);
    // control: the owner sees the target, label and all
    expect(toH(await historyOf('owner')).payload).toEqual({ kind: 'leads_to', targetId: H, label: 'Maybe' });

    // The /events door serves the same withheld copy.
    const eventsRes = await app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${S}/events`, headers: world.authOf('member') });
    expect(eventsRes.statusCode).toBe(200);
    const served = JSON.stringify(eventsRes.json());
    expect(served).toContain('{"kind":"leads_to","targetId":null,"label":"Maybe"}');
    expect(served).not.toContain(H);
  });

  it("29.126 a stranger never sees a leads_to edge to someone else's draft; the author does", async () => {
    const w = linkWorld(world, db);
    const strangers: ReadRole[] = ['owner', 'admin'];
    const named = (body: unknown, id: string) => JSON.stringify(body).includes(id);
    // S2 published, the member's draft D, a from-form "S2 leads to D" ("Yes") on D's stream.
    const [s2, d] = [newUlid(), newUlid()];
    await w.published(s2);
    const before = new Map<ReadRole, { links: number; history: number }>();
    for (const role of strangers) before.set(role, { links: (await linksOf(role, s2)).links.length, history: (await historyOf(role, s2)).length });
    await w.draft(d);
    expect(await w.fromLink(d, s2, 'leads_to', 'member', 'Yes')).toMatchObject({ status: 'committed' });
    for (const role of strangers) {
      const links = (await linksOf(role, s2)).links;
      expect(named(links, d), role).toBe(false);
      expect(links.length, role).toBe(before.get(role)!.links);
      expect(named((await w.stateOf(role, s2)).ticketState.links ?? [], d), role).toBe(false);
      const history = await historyOf(role, s2);
      expect(named(history, d) || JSON.stringify(history).includes('Yes'), role).toBe(false);
      expect(history.length, role).toBe(before.get(role)!.history);
    }
    // CONTROL in the same it(): the author, on the draft's own sheet, sees the edge with its label.
    const authorD = ((await w.links('member', d)).json() as LinksBody).links;
    expect(authorD.map((l) => [l.kind, l.direction, l.ticket.id, (l as { label?: string }).label])).toEqual([['leads_to', 'in', s2, 'Yes']]);
    // Publish D: the re-file (R44) carries the label onto S2's stream.
    expect(await w.send('member', 'ticket.published', d, { projectId: w.PROJECT() })).toMatchObject({ status: 'committed' });
    expect((await linksOf('owner', s2)).links.map((l) => [l.kind, l.direction, l.ticket.id, (l as { label?: string }).label])).toEqual([['leads_to', 'out', d, 'Yes']]);

    // A Decision's branch to a draft (planner ruling 2026-10-04, Q3): the re-file must carry the label, or the
    // engine refuses it link.label-required and the publish with it.
    // The sends above went through the HTTP door, so `makeCommitted`'s own counter is behind: take the next seq from the
    // ledger (`builder-reads.test.ts`'s pattern). wtg2 T5 seeds the real Decision type; the rules read only its id.
    const { rows: [last] } = await db.pool.query<{ seq: number }>('SELECT max(workspace_seq)::int AS seq FROM events WHERE workspace_id = $1', [WS]);
    await applyCommitted(db.pool, [makeCommitted({
      workspaceId: WS, actorId: owner, entity: { kind: 'ticket-type', id: 'decision' }, type: 'ticket-type.defined', workspaceSeq: last!.seq + 1,
      payload: { id: 'decision', name: 'Decision', icon: 'flag', rank: 3, workflowId: world.world.workflowId, fields: [] },
    })]);
    const [p, d2, d3, y] = [newUlid(), newUlid(), newUlid(), newUlid()];
    expect(await w.send('owner', 'ticket.created', p, { typeId: 'decision', projectId: w.PROJECT(), parentId: null, title: 'Go ahead?' })).toMatchObject({ status: 'committed' });
    await w.draft(d2);
    expect(await w.fromLink(d2, p, 'leads_to', 'member', 'Yes')).toMatchObject({ status: 'committed' });
    expect(await w.send('member', 'ticket.published', d2, { projectId: w.PROJECT() })).toMatchObject({ status: 'committed' });
    const pBranches = async () => (await linksOf('owner', p)).links.map((l) => [l.direction, l.ticket.id, (l as { label?: string }).label]);
    expect(await pBranches()).toEqual([['out', d2, 'Yes']]);
    // A duplicate made while private (D-7): D3's "No" is private, so a plain P -> Y "No" is accepted; D3's publish is refused.
    await w.draft(d3);
    expect(await w.fromLink(d3, p, 'leads_to', 'member', 'No')).toMatchObject({ status: 'committed' });
    await w.published(y);
    expect(await w.send('owner', 'ticket.link_added', p, { kind: 'leads_to', targetId: y, label: 'No' })).toMatchObject({ status: 'committed' });
    expect(await w.send('member', 'ticket.published', d3, { projectId: w.PROJECT() })).toEqual({
      status: 'refused', eventId: expect.any(String), rule: 'draft.link-refile-refused',
      reason: 'The link from "Go ahead?" to this draft could not be filed there: This Decision already has a branch labelled "No".',
    });
    expect(await w.stillDrafts([d3])).toBe(1);
    expect(await pBranches()).toEqual([['out', d2, 'Yes'], ['out', y, 'No']]); // control: P's branches are unchanged
  });
});

