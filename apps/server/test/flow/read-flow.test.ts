import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { readFlow } from '../../src/flow/read-flow.js';
import type { FlowReadWire } from '../../src/routes/flow.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

/**
 * The flow read (wtg Part 2, FL-1 and FL-2) against a REAL database and the REAL route.
 *
 * ## The world
 *
 * `buildReadTestApp` is `routes/notes.test.ts`'s world: a workspace, a project, and four signed-in people, with
 * three tickets this file needs by their roles: `sharedTaskId` (audience: owner and member), `hiddenTaskId`
 * (audience: the owner only) and `taskInEpicId` (project-wide, so the member reads it). They are linked
 * SH -> HI -> TE, so the member can read both ends of a chain whose middle only the owner can read.
 *
 * Events go in through `applyCommitted` (ledger plus every projection, no engine and no listener): this file is
 * about what the read returns for links that exist, not about whether the engine would have accepted them.
 *
 * ## Every absence carries its control in the same `it`
 *
 * A hole, a missing draft and an excluded ticket are all answers a broken read gives for free, so each case that
 * asserts one also reads the same flow as a person who is allowed to see it.
 */

let db: TestDatabase;
let rw: ReadWorld;
let WS: string;
let PROJECT: string;
let OWNER: string;
let MEMBER: string;
let SH: string;
let HI: string;
let TE: string;
/** A ticket joined to SH by `blocks` only, and one that is deleted but still linked from TE. */
const BL = newUlid();
const TR = newUlid();
/** FA and FB are published; FD is the member's draft. FA -> FD (the draft is the TARGET) and FD -> FB (the draft is the SOURCE). */
const FA = newUlid();
const FB = newUlid();
const FD = newUlid();

const created = (id: string, title: string, over: Record<string, unknown> = {}, actorId = OWNER) =>
  makeCommitted({
    workspaceId: WS,
    actorId,
    entity: { kind: 'ticket', id },
    type: 'ticket.created',
    payload: { typeId: 'task', projectId: PROJECT, parentId: null, title, ...over },
  });
/** A link filed on the SOURCE's own stream, as typed-links T2 stores it. */
const link = (source: string, target: string, kind: 'leads_to' | 'blocks' = 'leads_to', actorId = OWNER, label?: string) =>
  makeCommitted({
    workspaceId: WS,
    actorId,
    entity: { kind: 'ticket', id: source },
    type: 'ticket.link_added',
    payload: { kind, targetId: target, ...(label === undefined ? {} : { label }) },
  });

beforeAll(async () => {
  db = await createTestDatabase();
  rw = await buildReadTestApp(db);
  WS = rw.world.workspaceId;
  PROJECT = rw.world.projectId;
  OWNER = rw.userIds.owner;
  MEMBER = rw.userIds.member;
  SH = rw.world.sharedTaskId;
  HI = rw.world.hiddenTaskId;
  TE = rw.world.taskInEpicId;
  await applyCommitted(db.pool, [
    created(BL, 'Blocks only neighbour'),
    created(TR, 'Soon deleted'),
    link(SH, HI),
    link(HI, TE, 'leads_to', OWNER, 'Yes'),
    link(TE, TR),
    link(SH, TE, 'blocks'),
    link(SH, BL, 'blocks'),
    makeCommitted({ workspaceId: WS, actorId: OWNER, entity: { kind: 'ticket', id: TR }, type: 'ticket.deleted', payload: {} }),
    created(FA, 'Published A'),
    created(FB, 'Published B'),
    // `ticketCreatedPayload` refuses `draft: true` without `start: 'backlog'` ("a draft is born in the backlog",
    // `packages/domain/src/events/ticket-events.ts:170-176`); `test/helpers/draft-world.ts:63` seeds the same shape.
    created(FD, 'My draft', { draft: true, start: 'backlog' }, MEMBER),
    link(FD, FB, 'leads_to', MEMBER),
    // Drafts R42: a link whose TARGET is the draft is filed on the DRAFT's stream with `from` naming the source.
    makeCommitted({
      workspaceId: WS,
      actorId: MEMBER,
      entity: { kind: 'ticket', id: FD },
      type: 'ticket.link_added',
      payload: { kind: 'leads_to', targetId: FD, from: FA },
    }),
  ]);
});

afterAll(async () => {
  await db.drop();
});

const nodeIds = (read: { nodes: Array<{ id: string }> }): string[] => read.nodes.map((n) => n.id).sort();
const edgeKeys = (read: { edges: Array<{ sourceId: string; targetId: string; label: string | null }> }): string[] =>
  read.edges.map((e) => `${e.sourceId}>${e.targetId}:${e.label}`).sort();
const get = (role: ReadRole, ticketId: string) =>
  rw.app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${ticketId}/flow`, headers: rw.authOf(role) });

describe('29.187 a hidden ticket is a hole', () => {
  it('29.187 the read drops it: no stub, no count, and the walk does not pass through it', async () => {
    const member = await readFlow(db.pool, { workspaceId: WS, seedId: SH, viewerId: MEMBER });
    expect(nodeIds(member)).toEqual([SH]);
    expect(member.edges).toEqual([]);
    expect(member.reached).toBe(1); // the hidden ticket is not counted
    expect(member.truncated).toBe(false);
    expect(Object.keys(member).sort()).toEqual(['edges', 'nodes', 'reached', 'truncated']); // no `hidden: 1`, no placeholder
    expect(JSON.stringify(member)).not.toContain(HI);

    // CONTROL: the owner can read HI, so the same flow is the whole chain, with the label
    const owner = await readFlow(db.pool, { workspaceId: WS, seedId: SH, viewerId: OWNER });
    expect(nodeIds(owner)).toEqual([HI, SH, TE].sort());
    expect(edgeKeys(owner)).toEqual([`${HI}>${TE}:Yes`, `${SH}>${HI}:null`].sort());
    expect(owner.reached).toBe(3);

    // TE is readable by the member but sits behind the hole: seeded from TE the member reaches TE alone
    expect(nodeIds(await readFlow(db.pool, { workspaceId: WS, seedId: TE, viewerId: MEMBER }))).toEqual([TE]);
    // a hidden ticket as the seed is the empty read (the route turns it into a 404)
    expect(await readFlow(db.pool, { workspaceId: WS, seedId: HI, viewerId: MEMBER })).toEqual({ nodes: [], edges: [], truncated: false, reached: 0 });
    // a signed-in person who is not in the workspace reads nothing
    expect((await readFlow(db.pool, { workspaceId: WS, seedId: SH, viewerId: rw.userIds.stranger })).nodes).toEqual([]);
  });

  it('29.187 through the route: a hidden seed answers the same 404 as a missing one, and the wire carries no trace of the hole', async () => {
    const hidden = await get('member', HI);
    const missing = await get('member', newUlid());
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json()).toEqual(missing.json());
    const member = await get('member', SH);
    expect(member.statusCode).toBe(200);
    const body = member.json() as FlowReadWire;
    expect(body.tickets.map((t) => t.id)).toEqual([SH]);
    expect(body.links).toEqual([]);
    expect(JSON.stringify(body)).not.toContain('Salary review'); // the hidden ticket's title
    // CONTROL: the owner opens the same hidden ticket as a seed
    expect((await get('owner', HI)).statusCode).toBe(200);
  });
});

describe('29.188 drafts, deleted tickets, links that do not extend a flow, and the system read', () => {
  it('29.188 the viewer\'s own draft joins the flow in both directions; nobody else\'s does, and the system read never sees one', async () => {
    const author = await readFlow(db.pool, { workspaceId: WS, seedId: FA, viewerId: MEMBER });
    expect(nodeIds(author)).toEqual([FA, FB, FD].sort());
    expect(author.nodes.filter((n) => n.draft).map((n) => n.id)).toEqual([FD]);
    expect(edgeKeys(author)).toEqual([`${FA}>${FD}:null`, `${FD}>${FB}:null`].sort()); // draft as target AND as source
    expect(nodeIds(await readFlow(db.pool, { workspaceId: WS, seedId: FD, viewerId: MEMBER }))).toEqual([FA, FB, FD].sort());

    // CONTROL's other half: the workspace owner, whose reach is otherwise everything, sees a hole
    const owner = await readFlow(db.pool, { workspaceId: WS, seedId: FA, viewerId: OWNER });
    expect(nodeIds(owner)).toEqual([FA]);
    expect(owner.edges).toEqual([]);
    expect(owner.reached).toBe(1); // ruling B: no edge to someone else's draft and no count of it (T2's 29.126 is the links-read twin)
    expect((await readFlow(db.pool, { workspaceId: WS, seedId: FD, viewerId: OWNER })).nodes).toEqual([]);
    // ...and another workspace member who reads FA (`outsider`: off the roster, but rule A lets them read project-mode work)
    const other = await readFlow(db.pool, { workspaceId: WS, seedId: FA, viewerId: rw.userIds.outsider });
    expect([nodeIds(other), other.edges, other.reached]).toEqual([[FA], [], 1]);
    // the system read (viewerId null: the promoter, the settler, the sweep) ignores visibility but never reads a draft
    expect(nodeIds(await readFlow(db.pool, { workspaceId: WS, seedId: FA, viewerId: null }))).toEqual([FA]);
  });

  it('29.188 a deleted ticket and a blocks-only neighbour are not in the flow although their links exist; viewerId null ignores visibility', async () => {
    const stored = await db.pool.query<{ source_id: string; target_id: string; kind: string }>(
      'SELECT source_id, target_id, kind FROM proj_ticket_links WHERE source_id = ANY ($1::text[])',
      [[TE, SH]],
    );
    const rows = stored.rows.map((r) => `${r.source_id}>${r.target_id}:${r.kind}`);
    expect(rows).toEqual(expect.arrayContaining([`${TE}>${TR}:leads_to`, `${SH}>${BL}:blocks`]));

    const owner = await readFlow(db.pool, { workspaceId: WS, seedId: SH, viewerId: OWNER });
    expect(nodeIds(owner)).toEqual([HI, SH, TE].sort()); // neither TR (deleted) nor BL (blocks)
    // viewerId null: the hidden ticket IS read (the rule engine for promotion does not ask who is looking)
    const system = await readFlow(db.pool, { workspaceId: WS, seedId: SH, viewerId: null });
    expect(nodeIds(system)).toEqual([HI, SH, TE].sort());
    expect(system.nodes.every((n) => n.trashed === false && n.draft === false)).toBe(true);
  });
});

describe('29.189 the cap, truncated, reached, the ring limit, and the wire', () => {
  async function seedChain(length: number): Promise<string[]> {
    const ids = Array.from({ length }, () => newUlid());
    await applyCommitted(db.pool, [
      ...ids.map((id, i) => created(id, `Chain ${i}`)),
      ...ids.slice(1).map((id, i) => link(ids[i] as string, id)),
    ]);
    return ids;
  }

  it('29.189 at most 30 rings out from the seed; a 31st that is not empty sets truncated', async () => {
    const chain = await seedChain(33);
    const head = await readFlow(db.pool, { workspaceId: WS, seedId: chain[0] as string, viewerId: OWNER });
    expect(head.nodes).toHaveLength(31); // the seed and rings 1 to 30
    expect(head.nodes.at(-1)?.id).toBe(chain[30]);
    expect([head.truncated, head.reached]).toEqual([true, 31]);
    // CONTROL: seeded in the middle the same chain is 16 rings each way, so all 33 are read and nothing is cut
    const middle = await readFlow(db.pool, { workspaceId: WS, seedId: chain[16] as string, viewerId: OWNER });
    expect([middle.nodes.length, middle.truncated, middle.reached, middle.edges.length]).toEqual([33, false, 33, 32]);
    // The boundary (Review Focus 5): a flow of EXACTLY 31 read from its head fills ring 30, and its 31st ring is
    // queried and EMPTY, so it is not truncated. The middle read above never reaches ring 30, so without this leg
    // `truncated = true` at the ring limit (ignoring what the 31st ring returned) stays green.
    const exact = await seedChain(31);
    const whole = await readFlow(db.pool, { workspaceId: WS, seedId: exact[0] as string, viewerId: OWNER });
    expect([whole.nodes.length, whole.nodes.at(-1)?.id, whole.truncated, whole.reached]).toEqual([31, exact[30], false, 31]);
  });

  it('29.189 past the cap the first `cap` tickets in ring order are returned, reached counts the ring, and no edge reaches a cut ticket', async () => {
    const hub = newUlid();
    const leaves = Array.from({ length: 5 }, () => newUlid()).sort();
    // Created and linked in DESCENDING id order, so heap order and link order are the reverse of the expected order:
    // without the ring statement's `ORDER BY t.ticket_id` the cut keeps leaves[4] and leaves[3], and the order leg reds.
    const descending = [...leaves].reverse();
    await applyCommitted(db.pool, [created(hub, 'Hub'), ...descending.map((id) => created(id, `Leaf ${leaves.indexOf(id)}`)), ...descending.map((id) => link(hub, id))]);
    const capped = await readFlow(db.pool, { workspaceId: WS, seedId: hub, viewerId: OWNER, cap: 3 });
    expect(capped.nodes.map((n) => n.id)).toEqual([hub, leaves[0], leaves[1]]); // seed first, then ascending id inside the ring
    expect([capped.truncated, capped.reached]).toEqual([true, 6]);
    expect(edgeKeys(capped)).toEqual([`${hub}>${leaves[0]}:null`, `${hub}>${leaves[1]}:null`].sort());
    // The cap landing exactly on a ring boundary with more beyond: cap 1 holds the seed, the walk still asks ring 1,
    // so `reached` counts it and `truncated` is true (a `>=` in `order.length > cap` stops at the seed: 1 and false).
    const seedOnly = await readFlow(db.pool, { workspaceId: WS, seedId: hub, viewerId: OWNER, cap: 1 });
    expect([seedOnly.nodes.map((n) => n.id), seedOnly.edges, seedOnly.truncated, seedOnly.reached]).toEqual([[hub], [], true, 6]);
    // CONTROL: room for all six
    const roomy = await readFlow(db.pool, { workspaceId: WS, seedId: hub, viewerId: OWNER, cap: 6 });
    expect([roomy.nodes.length, roomy.truncated, roomy.reached, roomy.edges.length]).toEqual([6, false, 6, 5]);
  });

  it('29.189 the wire: titles, keys, state names, the node, leads_to with its label and blocks drawn between members; a draft has no key', async () => {
    const owner = await get('owner', SH);
    expect(owner.statusCode).toBe(200);
    const body = owner.json() as FlowReadWire;
    expect(body.rootId).toBe(SH);
    expect(body.tickets.map((t) => t.id).sort()).toEqual([HI, SH, TE].sort());
    const shared = body.tickets.find((t) => t.id === SH);
    expect(shared).toMatchObject({ title: 'Renew the trade licence', stateName: 'Waiting on counterparty' });
    expect(shared?.node).toMatchObject({ id: SH, stateId: 'waiting', category: 'active', draft: false });
    const links = body.links.map((l) => `${l.kind}:${l.sourceId}>${l.targetId}:${l.label}`).sort();
    expect(links).toEqual([`blocks:${SH}>${TE}:null`, `leads_to:${HI}>${TE}:Yes`, `leads_to:${SH}>${HI}:null`].sort());
    expect([body.truncated, body.reached]).toEqual([false, 3]);
    // Keys: every ticket here is published, so each wire key is non-null and is the key the single-ticket route
    // (`GET /v1/workspaces/:ws/tickets/:id`, an independent reader) prints for it; three different tickets, three keys.
    for (const id of [SH, HI, TE]) {
      const viaTicket = (await rw.app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${id}`, headers: rw.authOf('owner') })).json().key;
      expect(viaTicket).toMatch(/^[A-Z0-9]+-\d+$/);
      expect(body.tickets.find((t) => t.id === id)?.key).toBe(viaTicket);
    }

    const author = (await get('member', FA)).json() as FlowReadWire;
    const draft = author.tickets.find((t) => t.id === FD);
    expect(draft?.key).toBeNull();
    expect(draft?.node.draft).toBe(true);
    expect(author.tickets.find((t) => t.id === FA)?.node.draft).toBe(false); // CONTROL: a published ticket is not flagged
  });
});
