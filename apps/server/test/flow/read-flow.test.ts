import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { FLOW_DEFAULT_CAP, FLOW_MAX_RINGS, readFlow, walkFlow } from '../../src/flow/read-flow.js';
import { listMyDrafts } from '../../src/read/drafts.js';
import { flowWire, type FlowReadWire } from '../../src/routes/flow.js';
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
    const fromTe = await readFlow(db.pool, { workspaceId: WS, seedId: TE, viewerId: MEMBER });
    // HI -> TE (with its label) and SH -> TE (blocks) are stored, but the first comes from the hole: no edge, no count
    expect([nodeIds(fromTe), fromTe.edges, fromTe.reached]).toEqual([[TE], [], 1]);
    // a hidden ticket as the seed is the empty read (the route turns it into a 404)
    expect(await readFlow(db.pool, { workspaceId: WS, seedId: HI, viewerId: MEMBER })).toEqual({ nodes: [], edges: [], truncated: false, reached: 0 });
    // a signed-in person who is not in the workspace reads nothing
    expect((await readFlow(db.pool, { workspaceId: WS, seedId: SH, viewerId: rw.userIds.stranger })).nodes).toEqual([]);
    // A ticket of ANOTHER workspace, asked for through the path of the asker's own workspace, is the empty read. An
    // owner's visibility test is `draft_author_id IS NULL` alone, so the ring statement's workspace clause is the only
    // guard: without it the seed is admitted and counted (reached 1) and only the row fetch drops it.
    const nb = rw.neighbour;
    expect(await readFlow(db.pool, { workspaceId: nb.workspaceId, seedId: SH, viewerId: rw.userIds.neighbour })).toEqual({ nodes: [], edges: [], truncated: false, reached: 0 });
    // CONTROL: the same person reads their own workspace's ticket
    expect(nodeIds(await readFlow(db.pool, { workspaceId: nb.workspaceId, seedId: nb.ticketId, viewerId: rw.userIds.neighbour }))).toEqual([nb.ticketId]);
  });

  it('29.187 through the route: a hidden seed answers the same 404 as a missing one, and the wire carries no trace of the hole', async () => {
    const hidden = await get('member', HI);
    const missing = await get('member', newUlid());
    expect(hidden.statusCode).toBe(404);
    expect(hidden.json()).toEqual(missing.json());
    expect(hidden.json()).toEqual({ error: 'not_found' }); // the one NOT_FOUND_BODY, not merely two equal bodies
    const member = await get('member', SH);
    expect(member.statusCode).toBe(200);
    const body = member.json() as FlowReadWire;
    expect(body.tickets.map((t) => t.id)).toEqual([SH]);
    expect(body.links).toEqual([]);
    expect(JSON.stringify(body)).not.toContain('Salary review'); // the hidden ticket's title
    // CONTROL: the owner opens the same hidden ticket as a seed
    expect((await get('owner', HI)).statusCode).toBe(200);
    // a seed in another workspace, named through the path of the asker's own workspace, is the same 404
    const foreign = await rw.app.inject({ method: 'GET', url: `/v1/workspaces/${rw.neighbour.workspaceId}/tickets/${SH}/flow`, headers: rw.authOf('neighbour') });
    expect([foreign.statusCode, foreign.json()]).toEqual([404, { error: 'not_found' }]);
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

  it('29.188 a deleted draft is a hole for its author too: listMyDrafts still lists it, so the own-draft arm keeps its own liveness clause', async () => {
    const PX = newUlid();
    const DX = newUlid();
    const DY = newUlid();
    const toDraft = (draft: string) =>
      makeCommitted({ workspaceId: WS, actorId: MEMBER, entity: { kind: 'ticket', id: draft }, type: 'ticket.link_added', payload: { kind: 'leads_to', targetId: draft, from: PX } });
    await applyCommitted(db.pool, [
      created(PX, 'Published X'),
      created(DX, 'Deleted draft', { draft: true, start: 'backlog' }, MEMBER),
      created(DY, 'Kept draft', { draft: true, start: 'backlog' }, MEMBER),
      toDraft(DX),
      toDraft(DY),
      makeCommitted({ workspaceId: WS, actorId: MEMBER, entity: { kind: 'ticket', id: DX }, type: 'ticket.deleted', payload: {} }),
    ]);
    // The precondition that makes the clause load-bearing: the helper filters discards, not deletions, so it still
    // hands the deleted draft to the read.
    expect((await listMyDrafts(db.pool, MEMBER, WS)).map((d) => d.ticketId)).toEqual(expect.arrayContaining([DX, DY]));
    const author = await readFlow(db.pool, { workspaceId: WS, seedId: PX, viewerId: MEMBER });
    // CONTROL in the same read: DY, the live draft beside it, is in
    expect([nodeIds(author), edgeKeys(author), author.reached]).toEqual([[DY, PX].sort(), [`${PX}>${DY}:null`], 2]);
    expect((await readFlow(db.pool, { workspaceId: WS, seedId: DX, viewerId: MEMBER })).nodes).toEqual([]);
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
    // FL-2's two bounds, pinned as literals: a leg that reads them from the module moves with a mutated constant.
    expect([FLOW_DEFAULT_CAP, FLOW_MAX_RINGS]).toEqual([300, 30]);
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
    // The cap counts tickets, not rings: cap 2 on the 33-chain's head keeps the seed and ring 1, and the walk stops
    // after ring 2, the first ring whose count passes 2, counting it (a `cap + 1` in the stop test reads 4).
    const two = await readFlow(db.pool, { workspaceId: WS, seedId: chain[0] as string, viewerId: OWNER, cap: 2 });
    expect([two.nodes.map((n) => n.id), two.edges.length, two.truncated, two.reached]).toEqual([[chain[0], chain[1]], 1, true, 3]);
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
    // cap 0 is read as 1: a caller cannot turn a readable seed into the empty read (which the route answers with 404)
    const zero = await readFlow(db.pool, { workspaceId: WS, seedId: hub, viewerId: OWNER, cap: 0 });
    expect([zero.nodes.map((n) => n.id), zero.edges, zero.truncated, zero.reached]).toEqual([[hub], [], true, 6]);
    // CONTROL: room for all six
    const roomy = await readFlow(db.pool, { workspaceId: WS, seedId: hub, viewerId: OWNER, cap: 6 });
    expect([roomy.nodes.length, roomy.truncated, roomy.reached, roomy.edges.length]).toEqual([6, false, 6, 5]);
    // A row gone between the ring statement and the row fetch (a purge in between) is left out with no edge to it,
    // and the read does not throw. The proxy hides leaves[1] from the row fetch only; `roomy` above is the control.
    const between = new Proxy(db.pool, {
      get(target, prop, receiver) {
        if (prop !== 'query') return Reflect.get(target, prop, receiver);
        return async (text: string, values?: unknown[]) => {
          const result = await target.query(text, values);
          if (!text.startsWith('SELECT t.* FROM proj_tickets')) return result;
          return { ...result, rows: result.rows.filter((row: { ticket_id: string }) => row.ticket_id !== leaves[1]) };
        };
      },
    }) as Pool;
    const gone = await readFlow(between, { workspaceId: WS, seedId: hub, viewerId: OWNER, cap: 6 });
    expect([nodeIds(gone), gone.edges.length, gone.truncated, gone.reached]).toEqual([[hub, ...leaves.filter((id) => id !== leaves[1])].sort(), 4, false, 6]);
  });

  it('29.189 the default cap is 300: a 301-ticket star reads its first 300 in ring order, truncated, reached 301, and so does the route', async () => {
    const hub = newUlid();
    const spokes = Array.from({ length: 300 }, () => newUlid()).sort();
    await applyCommitted(db.pool, [created(hub, 'Big hub'), ...spokes.map((id, i) => created(id, `Spoke ${i}`)), ...spokes.map((id) => link(hub, id))]);
    const read = await readFlow(db.pool, { workspaceId: WS, seedId: hub, viewerId: OWNER });
    expect([read.nodes.length, read.nodes.at(-1)?.id, read.truncated, read.reached, read.edges.length]).toEqual([300, spokes[298], true, 301, 299]);
    // CONTROL: room for one more reads the whole star, so it was the default that cut it
    const room = await readFlow(db.pool, { workspaceId: WS, seedId: hub, viewerId: OWNER, cap: 301 });
    expect([room.nodes.length, room.truncated, room.reached]).toEqual([301, false, 301]);
    // the route reads with the default, and its wire carries the same cut, truncated and reached
    const wire = (await get('owner', hub)).json() as FlowReadWire;
    expect([wire.tickets.length, wire.links.length, wire.truncated, wire.reached]).toEqual([300, 299, true, 301]);
  });

  it('29.189 the wire: titles, keys, state names, the node, leads_to with its label and blocks drawn between members; a draft has no key', async () => {
    const owner = await get('owner', SH);
    expect(owner.statusCode).toBe(200);
    const body = owner.json() as FlowReadWire;
    expect(body.rootId).toBe(SH);
    expect(body.tickets.map((t) => t.id).sort()).toEqual([HI, SH, TE].sort());
    const shared = body.tickets.find((t) => t.id === SH);
    expect(shared).toMatchObject({ title: 'Renew the trade licence', stateName: 'Waiting on counterparty', projectId: PROJECT, assigneeId: null });
    // TE is the member's assigned task: the assignee rides the wire (SH above is the unassigned control)
    expect(body.tickets.find((t) => t.id === TE)).toMatchObject({ title: 'File the GST return', projectId: PROJECT, assigneeId: MEMBER });
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

  it('29.189 a row the projection cannot name is never drawn: a missing definition, an undeclared state or a missing title throws, naming the ticket', async () => {
    const [x1, x2, x3, x4] = [newUlid(), newUlid(), newUlid(), newUlid()];
    await applyCommitted(db.pool, [x1, x2, x3, x4].map((id, i) => created(id, `Lone ${i}`)));
    const { workflow_id: wf, workflow_version: v } = (
      await db.pool.query<{ workflow_id: string; workflow_version: number }>('SELECT workflow_id, workflow_version FROM proj_tickets WHERE ticket_id = $1', [x1])
    ).rows[0] as { workflow_id: string; workflow_version: number };
    // CONTROL: each one reads and wires before its row is broken
    for (const id of [x1, x2, x3, x4]) expect((await get('owner', id)).statusCode).toBe(200);
    await db.pool.query('UPDATE proj_tickets SET workflow_version = workflow_version + 100 WHERE ticket_id = $1', [x1]);
    await expect(readFlow(db.pool, { workspaceId: WS, seedId: x1, viewerId: OWNER })).rejects.toThrow(
      `walkFlow: no workflow definition ${wf}@${v + 100} for ticket ${x1}; the projection and the ledger disagree`,
    );
    await db.pool.query("UPDATE proj_tickets SET state_id = 'nowhere' WHERE ticket_id = $1", [x2]);
    await expect(readFlow(db.pool, { workspaceId: WS, seedId: x2, viewerId: OWNER })).rejects.toThrow(
      `walkFlow: ticket ${x2} is in state nowhere, which ${wf}@${v} does not declare`,
    );
    // no title claim at all (x3), and a title claim whose value is not a string (x4): the walk does not read the
    // title, so it still returns the node; the wire refuses to print one
    await db.pool.query("UPDATE proj_tickets SET fields = fields - 'title' WHERE ticket_id = $1", [x3]);
    await db.pool.query("UPDATE proj_tickets SET fields = jsonb_set(fields, '{title,value}', '7') WHERE ticket_id = $1", [x4]);
    for (const id of [x3, x4]) {
      const walk = await walkFlow(db.pool, { workspaceId: WS, seedId: id, viewerId: OWNER });
      expect(walk.read.nodes.map((n) => n.id)).toEqual([id]);
      await expect(flowWire(db.pool, WS, id, walk)).rejects.toThrow(
        `flow read: ticket ${id} has no string title claim; ticket.created writes one, so proj_tickets and the ledger disagree`,
      );
    }
    // the wire's own two guards: a node whose state, or state name, the walk did not hand over
    const whole = await walkFlow(db.pool, { workspaceId: WS, seedId: SH, viewerId: OWNER });
    expect((await flowWire(db.pool, WS, SH, whole)).tickets).toHaveLength(3); // CONTROL: the intact walk wires
    const noName = { ...whole, stateNames: new Map([...whole.stateNames].filter(([id]) => id !== TE)) };
    await expect(flowWire(db.pool, WS, SH, noName)).rejects.toThrow(`flow read: no state name for node ${TE}`);
    const noState = { ...whole, states: new Map([...whole.states].filter(([id]) => id !== TE)) };
    await expect(flowWire(db.pool, WS, SH, noState)).rejects.toThrow(`flow read: no state for node ${TE}`);
  });
});
