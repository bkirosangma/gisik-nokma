/**
 * Knowledge Graph spec C §2.2 (KG-C T6): `GET /v1/graph/neighbours` (`src/routes/graph.ts`) over the ring read
 * (`src/read/graph-neighbours.ts`), cases 27.290–27.307 (`test-cases/27-knowledge-graph.md`, under `<!-- KG-C T6 -->`).
 *
 * ## The REAL tables (planner ruling, 2026-10-04)
 *
 * `proj_ticket_links` and `proj_references` are the tables A's and B's MIGRATIONS create; nothing in this file creates
 * them (`beforeAll` asserts they exist before the world is seeded, and `./real-tables.test.ts`, 27.028, keeps the old
 * shim gone). Links and references are written STRAIGHT into them, because the projections that write them are A's and
 * B's tested concern and these cases are about the read. Each INSERT's column list is copied from its migration, cited
 * at the helper.
 *
 * ## Names
 *
 * Every read-world role signs in by PHONE, and the names read never labels a synthetic phone address
 * (`routes/builder-reads.ts`, `labelled`, FD3). Without a real name and address no person would ever be drawn and every
 * `addedBy` would be null, so `beforeAll` gives the owner and the member both, and the cases compare against the labels
 * `readActorNames` reads back, never a typed string.
 *
 * ## Fixtures
 *
 * Every request passes `groups: NO_PROJECTS` unless it names its groups: with the default groups the `projects` group's
 * `in` edges join every ticket of the project at hop 2. The seeded world's tickets gain links from several cases, so they
 * get `toContain` assertions only; an exact ring is always a fresh centre's.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { GRAPH_GROUPS, graphRef, membershipId, newUlid, type GraphGroup, type GraphRingResponse, type LedgerEvent } from '@gisik-nokma/domain';
import { UNAUTHENTICATED_BODY } from '../../src/auth/require-session.js';
import { readGraphRing, type GraphRingRequest } from '../../src/read/graph-neighbours.js';
import { READ_NOT_FOUND_BODY } from '../../src/read/membership.js';
import { readActorNames } from '../../src/routes/builder-reads.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

let db: TestDatabase;
let read: ReadWorld;
/** userId → the label the names read gives them (filled in `beforeAll`). */
let names: Map<string, string>;
const DISPLAY_NAMES = { owner: 'Kiro Sangma', member: 'Mira Marak' } as const;

beforeAll(async () => {
  db = await createTestDatabase();
  // The planner ruling: A's and B's MIGRATIONS made these, not a test file (the shim is gone, 27.028).
  const { rows } = await db.pool.query<{ ok: boolean }>(
    `SELECT to_regclass('public.proj_ticket_links') IS NOT NULL AND to_regclass('public.proj_references') IS NOT NULL AS ok`,
  );
  expect(rows[0]?.ok).toBe(true);
  read = await buildReadTestApp(db);
  for (const role of ['owner', 'member'] as const) {
    await db.pool.query('UPDATE "user" SET name = $1, email = $2 WHERE id = $3', [DISPLAY_NAMES[role], `${role}@kg-t6.test`, read.userIds[role]]);
  }
  names = new Map((await readActorNames(db.pool, ws())).map((row) => [row.userId, row.displayName]));
  // The haystack holds its subjects: both people are labelled, so a missing person below is the read's doing.
  expect(names.get(read.world.owner)).toBe(DISPLAY_NAMES.owner);
  expect(names.get(read.world.member)).toBe(DISPLAY_NAMES.member);
}, 600_000);
afterAll(async () => {
  await read.app.close();
  await db.drop();
});

const NO_PROJECTS = GRAPH_GROUPS.filter((g) => g !== 'projects' && g !== 'concepts').join(',');
const ws = () => read.world.workspaceId;
const w = () => read.world;
const T = (id: string) => graphRef('ticket', id);

type Query = Record<string, string | undefined>;
type RingAnswer = { status: number; body: GraphRingResponse & { error?: string } };

async function getRing(role: ReadRole | null, query: string): Promise<RingAnswer> {
  const res = await read.app.inject({ method: 'GET', url: `/v1/graph/neighbours?${query}`, headers: role === null ? {} : read.authOf(role) });
  return { status: res.statusCode, body: res.json() };
}
/** One ring over the wire; a key whose value is `undefined` is left out of the query. */
function ring(role: ReadRole | null, q: Query): Promise<RingAnswer> {
  return getRing(role, new URLSearchParams(Object.entries(q).filter((entry): entry is [string, string] => entry[1] !== undefined)).toString());
}
const refsOf = (r: GraphRingResponse) => r.items.map((item) => item.ref);
const edgeIdsOf = (r: GraphRingResponse) => r.edges.map((edge) => edge.id);
const itemOf = (r: GraphRingResponse, ref: string) => r.items.find((item) => item.ref === ref);
const edgeOf = (r: GraphRingResponse, id: string) => r.edges.find((edge) => edge.id === id);
const empty = (hop: number): GraphRingResponse => ({ hop, items: [], edges: [], frontier: [], truncated: false, cursor: null });

async function ticket(title: string, opts: { parentId?: string | null; explicit?: string[]; projectId?: string } = {}): Promise<string> {
  const id = newUlid();
  const base = { workspaceId: ws(), actorId: w().owner };
  const events: LedgerEvent[] = [
    makeCommitted({ ...base, entity: { kind: 'ticket', id }, type: 'ticket.created', payload: { typeId: 'task', projectId: opts.projectId ?? w().projectId, parentId: opts.parentId ?? null, title } }),
  ];
  if (opts.explicit) events.push(makeCommitted({ ...base, entity: { kind: 'ticket', id }, type: 'visibility.set', payload: { ticketId: id, mode: 'explicit', userIds: opts.explicit } }));
  await applyCommitted(db.pool, events);
  return id;
}
async function ticketEvent(id: string, type: 'ticket.assigned' | 'ticket.deleted' | 'ticket.restored', payload: object, workspaceId = ws()): Promise<void> {
  await applyCommitted(db.pool, [makeCommitted({ workspaceId, actorId: w().owner, entity: { kind: 'ticket', id }, type, payload })]);
}
async function note(title: string, opts: { homeProjectId?: string; mode?: 'workspace' | 'private'; attachTicketId?: string } = {}): Promise<string> {
  const id = newUlid();
  const payload = { title, homeProjectId: opts.homeProjectId ?? w().projectId, scope: { mode: opts.mode ?? 'workspace' }, ...(opts.attachTicketId === undefined ? {} : { attachTicketId: opts.attachTicketId }) };
  await applyCommitted(db.pool, [makeCommitted({ workspaceId: ws(), actorId: w().owner, entity: { kind: 'note', id }, type: 'note.created', payload })]);
  return id;
}
async function link(kind: 'blocks' | 'relates' | 'duplicates', source: string, target: string, by = w().owner, origin = 'web', workspaceId = ws()): Promise<void> {
  // columns: A's migration, apps/server/migrations/1791700000000_proj-ticket-links.sql:7-16
  await db.pool.query(
    `INSERT INTO proj_ticket_links (workspace_id, source_id, target_id, kind, created_by, created_at, origin, seq) VALUES ($1, $2, $3, $4, $5, '2026-10-01T05:00:00Z', $6, 1)`,
    [workspaceId, source, target, kind, by, origin],
  );
}
type ReferenceRow = {
  sourceKind: 'ticket' | 'comment' | 'note'; sourceId: string; parentKind: 'ticket' | 'note'; parentId: string;
  targetKind: 'ticket' | 'note' | 'person'; targetId: string; ordinal?: number; snippet?: string; by?: string;
};
async function reference(r: ReferenceRow): Promise<void> {
  // columns: B's migration, apps/server/migrations/1791500000000_proj-references.sql:15-29
  await db.pool.query(
    `INSERT INTO proj_references (workspace_id, source_kind, source_id, source_parent_kind, source_parent_id, target_kind, target_id, ordinal, snippet, updated_by, updated_at, seq)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '2026-10-01T06:00:00Z', 1)`,
    [ws(), r.sourceKind, r.sourceId, r.parentKind, r.parentId, r.targetKind, r.targetId, r.ordinal ?? 0, r.snippet ?? 'see [[it]]', r.by ?? w().owner],
  );
}

describe('27.290–27.292 the door: session, query, the one 404', () => {
  it('27.290 ring 1 of the epic holds its child and the parent edge; control: the same request with no session is 401', async () => {
    const q = { center: T(w().epicId), hops: '1', ws: ws(), groups: NO_PROJECTS };
    const res = await ring('member', q);
    expect(res.status).toBe(200);
    expect(refsOf(res.body)).toContain(T(w().taskInEpicId));
    expect(edgeIdsOf(res.body)).toContain(`parent|${T(w().epicId)}|${T(w().taskInEpicId)}`);
    const anonymous = await ring(null, q);
    expect(anonymous.status).toBe(401);
    expect(anonymous.body).toEqual(UNAUTHENTICATED_BODY);
  });

  it('27.291 each parameter refuses its own bad value with 400 invalid_query; controls: cursor=0, a 7-digit cursor and 20 workspaces are accepted', async () => {
    const q: Query = { center: T(w().epicId), hops: '1', ws: ws(), groups: NO_PROJECTS };
    const twentyOthers = Array.from({ length: 20 }, () => newUlid());
    const bad: Array<[string, Query]> = [
      ['center=widget:1', { center: 'widget:1' }],
      ['center=ticket:', { center: 'ticket:' }],
      ['center missing', { center: undefined }],
      ['hops=0', { hops: '0' }],
      ['hops=9', { hops: '9' }],
      ['hops=1.5', { hops: '1.5' }],
      ['hops=10', { hops: '10' }],
      ['ws missing', { ws: undefined }],
      ['ws empty', { ws: '' }],
      ['ws = 21 ids', { ws: [ws(), ...twentyOthers].join(',') }],
      ['groups=blocks,colours', { groups: 'blocks,colours' }],
      ['cursor=-1', { cursor: '-1' }],
      ['cursor of 8 digits', { cursor: '10000000' }],
    ];
    for (const [label, change] of bad) {
      const res = await ring('member', { ...q, ...change });
      expect({ label, status: res.status, body: res.body }).toEqual({ label, status: 400, body: { error: 'invalid_query' } });
    }
    // A REPEATED key reaches the handler as an array (Fastify's query parser): refused, never a 500 from `.split`.
    // `ws`, `proj` and `groups` need the route's type guard; `center`, `hops` and `cursor` are refused by their own checks too.
    const plain = new URLSearchParams(q as Record<string, string>).toString();
    const twice = [
      ['ws twice', `ws=${ws()}`], ['proj twice', `proj=${w().projectId}&proj=${w().projectId}`], ['groups twice', 'groups=blocks'],
      ['center twice', `center=${T(w().epicId)}`], ['hops twice', 'hops=1'], ['cursor twice', 'cursor=0&cursor=0'],
    ] as const;
    for (const [label, extra] of twice) {
      const res = await getRing('member', `${plain}&${extra}`);
      expect({ label, status: res.status, body: res.body }).toEqual({ label, status: 400, body: { error: 'invalid_query' } });
    }

    // Controls, one input changed each: the just-inside values are accepted.
    expect((await ring('member', { ...q, cursor: '0' })).status).toBe(200);
    const far = await ring('member', { ...q, cursor: '9999999' });
    expect(far).toEqual({ status: 200, body: empty(1) });
    // 20 workspaces parse; 19 of them are not the member's, so the answer is the workspace check's 404, not the parser's 400.
    const twenty = await ring('member', { ...q, ws: [ws(), ...twentyOthers.slice(1)].join(',') });
    expect(twenty).toEqual({ status: 404, body: READ_NOT_FOUND_BODY });
  });

  it('27.292 a workspace the member is not in, a hidden centre and an unknown centre are the SAME 404; control: the owner reads the hidden centre', async () => {
    const q = { center: T(w().sharedTaskId), hops: '1', ws: ws(), groups: NO_PROJECTS };
    expect((await ring('member', q)).status).toBe(200);
    const notMine = await ring('member', { ...q, ws: read.neighbour.workspaceId });
    const hidden = await ring('member', { ...q, center: T(w().hiddenTaskId) });
    const unknown = await ring('member', { ...q, center: T(newUlid()) });
    for (const res of [notMine, hidden, unknown]) {
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'not_found' });
    }
    expect(hidden.body).toEqual(notMine.body);
    expect(unknown.body).toEqual(notMine.body);
    expect(notMine.body).toEqual(READ_NOT_FOUND_BODY);
    expect((await ring('owner', { ...q, center: T(w().hiddenTaskId) })).status).toBe(200);
  });
});

describe('27.293–27.295 visibility and scope', () => {
  it('27.293 visible A → hidden H → visible B: H is absent, no edge names it, and B is NOT reached through it; control: the owner walks through H', async () => {
    const A = await ticket('A');
    const H = await ticket('H', { explicit: [w().owner] });
    const B = await ticket('B');
    const V = await ticket('V');
    await link('relates', A, H);
    await link('relates', H, B);
    await link('relates', A, V);
    const q = { center: T(A), ws: ws(), groups: NO_PROJECTS };

    const one = await ring('member', { ...q, hops: '1' });
    expect(one.status).toBe(200);
    // V is the member-side control: the member's walk works, so what is missing below is about H.
    expect(refsOf(one.body)).toEqual([T(V)]);
    expect(JSON.stringify(one.body)).not.toContain(H);
    expect(await ring('member', { ...q, hops: '2' })).toEqual({ status: 200, body: empty(2) });

    const ownerOne = await ring('owner', { ...q, hops: '1' });
    expect([...refsOf(ownerOne.body)].sort()).toEqual([T(H), T(V)].sort());
    expect(refsOf((await ring('owner', { ...q, hops: '2' })).body)).toEqual([T(B)]);
  });

  it('27.294 a link from a visible ticket to a hidden one: no edge names the hidden end; control: the owner gets that edge', async () => {
    const V2 = await ticket('V2');
    await link('blocks', w().sharedTaskId, w().hiddenTaskId);
    await link('relates', w().sharedTaskId, V2);
    const q = { center: T(w().sharedTaskId), hops: '1', ws: ws(), groups: NO_PROJECTS };

    const member = await ring('member', q);
    expect(member.status).toBe(200);
    expect(refsOf(member.body)).toContain(T(V2));
    expect(JSON.stringify(member.body)).not.toContain(w().hiddenTaskId);
    const owner = await ring('owner', q);
    expect(edgeIdsOf(owner.body)).toContain(`blocks|${T(w().sharedTaskId)}|${T(w().hiddenTaskId)}`);
  });

  it('27.295 an out-of-scope item is fog (`out: true`), not in `frontier`, and never walked past; control: with no project scope it is in scope and walked', async () => {
    const sibling = read.sibling.ticketId;
    const S2 = await ticket('S2', { projectId: read.sibling.projectId });
    await link('relates', w().sharedTaskId, sibling);
    await link('relates', sibling, S2);
    const q = { center: T(w().sharedTaskId), ws: ws(), groups: NO_PROJECTS };

    const scoped = await ring('member', { ...q, hops: '1', proj: w().projectId });
    expect(itemOf(scoped.body, T(sibling))?.out).toBe(true);
    expect(scoped.body.frontier).not.toContain(T(sibling));
    expect(refsOf((await ring('member', { ...q, hops: '2', proj: w().projectId })).body)).not.toContain(T(S2));

    const unscoped = await ring('member', { ...q, hops: '1' });
    expect(itemOf(unscoped.body, T(sibling))?.out).toBe(false);
    expect(unscoped.body.frontier).toContain(T(sibling));
    expect(refsOf((await ring('member', { ...q, hops: '2' })).body)).toContain(T(S2));
  });
});

describe('27.296–27.297 order and page', () => {
  it('27.296 ring 1 is in group order (blocks, structure, references, people) and newest first within a group; control: groups=structure is the child alone', async () => {
    const C = await ticket('Ordered centre');
    const child = await ticket('Child', { parentId: C });
    const blocked = await ticket('Blocked');
    await link('blocks', C, blocked);
    const referrer = await note('Notes on the centre');
    await reference({ sourceKind: 'note', sourceId: referrer, parentKind: 'note', parentId: referrer, targetKind: 'ticket', targetId: C });
    await ticketEvent(C, 'ticket.assigned', { assigneeId: w().member });
    const q = { center: T(C), hops: '1', ws: ws() };

    // `expand` emits the child FIRST (structure is read before the links), so this order is the sort's work.
    const ordered = await ring('member', { ...q, groups: NO_PROJECTS });
    expect(refsOf(ordered.body)).toEqual([T(blocked), T(child), graphRef('note', referrer), graphRef('person', w().member)]);
    expect(refsOf((await ring('member', { ...q, groups: 'structure' })).body)).toEqual([T(child)]);

    // Newest first: by ID (`newUlid()` is not monotonic within a millisecond, `packages/domain/src/ids.ts`), the link
    // to the OLDER id inserted first, so the answer is the reverse of the insertion order.
    const C2 = await ticket('Newest-first centre');
    const [older, newer] = [await ticket('T1'), await ticket('T2')].sort() as [string, string];
    await link('relates', C2, older);
    await link('relates', C2, newer);
    expect(refsOf((await ring('member', { center: T(C2), hops: '1', ws: ws(), groups: NO_PROJECTS })).body)).toEqual([T(newer), T(older)]);
  });

  it('27.297 the page cut follows the ring order: pages of 2 concatenate to the whole ring; the route maps `cursor` to the offset; control: a ring of exactly 2 is not truncated', async () => {
    const P = await ticket('Five relates');
    for (let k = 0; k < 5; k += 1) await link('relates', P, await ticket(`Neighbour ${String(k)}`));
    const request = (center: string, offset: number, pageSize?: number): GraphRingRequest => ({
      center: { kind: 'ticket', id: center }, hops: 1, workspaceIds: [ws()], projectIds: [], groups: new Set<GraphGroup>(['relates']), offset, ...(pageSize === undefined ? {} : { pageSize }),
    });
    const whole = await readGraphRing(db.pool, w().owner, request(P, 0));
    expect(whole?.items).toHaveLength(5);
    expect(whole?.truncated).toBe(false);

    const one = await readGraphRing(db.pool, w().owner, request(P, 0, 2));
    const two = await readGraphRing(db.pool, w().owner, request(P, 2, 2));
    const three = await readGraphRing(db.pool, w().owner, request(P, 4, 2));
    expect([one?.items.length, one?.truncated, one?.cursor]).toEqual([2, true, '2']);
    expect([two?.items.length, two?.truncated, two?.cursor]).toEqual([2, true, '4']);
    expect([three?.items.length, three?.truncated, three?.cursor]).toEqual([1, false, null]);
    expect([one, two, three].flatMap((page) => refsOf(page!))).toEqual(refsOf(whole!));

    // The route: `cursor=1` is the same ring without its first item, and `cursor=0` is no cursor at all.
    const q = { center: T(P), hops: '1', ws: ws(), groups: 'relates' };
    const all = await ring('owner', q);
    expect(refsOf(all.body)).toEqual(refsOf(whole!));
    expect(refsOf((await ring('owner', { ...q, cursor: '1' })).body)).toEqual(refsOf(whole!).slice(1));
    expect((await ring('owner', { ...q, cursor: '0' })).body).toEqual(all.body);

    const P2 = await ticket('Exactly two');
    for (let k = 0; k < 2; k += 1) await link('relates', P2, await ticket(`Pair ${String(k)}`));
    const exact = await readGraphRing(db.pool, w().owner, request(P2, 0, 2));
    expect([exact?.items.length, exact?.truncated, exact?.cursor]).toEqual([2, false, null]);
  });
});

describe('27.298–27.301 people, references, provenance, attachments', () => {
  it('27.298 the assignee is drawn with their display name; a guest is told only the people on their own tickets; control: the owner sees both mentioned people', async () => {
    const q = { center: T(w().taskInEpicId), hops: '1', ws: ws(), groups: NO_PROJECTS };
    const member = await ring('member', q);
    const person = graphRef('person', w().member);
    expect(itemOf(member.body, person)?.label).toBe(names.get(w().member));
    expect(edgeIdsOf(member.body)).toContain(`assignee|${person}|${T(w().taskInEpicId)}`);

    // Two mentions in the guest ticket's description: the OWNER is an actor on it (the guest may be told the name,
    // `routes/builder-reads.ts` readActorNamesForGuest); the MEMBER is on no ticket the guest can see.
    const guestTicket = w().guestTaskId;
    await reference({ sourceKind: 'ticket', sourceId: guestTicket, parentKind: 'ticket', parentId: guestTicket, targetKind: 'person', targetId: w().owner, ordinal: 0 });
    await reference({ sourceKind: 'ticket', sourceId: guestTicket, parentKind: 'ticket', parentId: guestTicket, targetKind: 'person', targetId: w().member, ordinal: 1 });
    const g = { center: T(guestTicket), hops: '1', ws: ws(), groups: 'people' };
    const guest = await ring('guest', g);
    expect(guest.status).toBe(200);
    expect(itemOf(guest.body, graphRef('person', w().owner))?.label).toBe(names.get(w().owner));
    expect(refsOf(guest.body)).not.toContain(graphRef('person', w().member));
    expect(JSON.stringify(guest.body)).not.toContain(w().member);

    const owner = await ring('owner', g);
    expect([...refsOf(owner.body)].sort()).toEqual([graphRef('person', w().owner), graphRef('person', w().member)].sort());
  });

  it("27.299 a comment's reference is an edge from the comment's PARENT, with its snippet and the author's name; control: a reference from a hidden ticket's comment shows the member nothing", async () => {
    await reference({ sourceKind: 'comment', sourceId: newUlid(), parentKind: 'ticket', parentId: w().sharedTaskId, targetKind: 'ticket', targetId: w().taskInEpicId, snippet: 'see [[GN-2]]', by: w().member });
    await reference({ sourceKind: 'comment', sourceId: newUlid(), parentKind: 'ticket', parentId: w().hiddenTaskId, targetKind: 'ticket', targetId: w().taskInEpicId, snippet: 'see [[GN-2]] privately' });
    const q = { center: T(w().taskInEpicId), hops: '1', ws: ws(), groups: NO_PROJECTS };

    const member = await ring('member', q);
    expect(refsOf(member.body)).toContain(T(w().sharedTaskId));
    const edge = edgeOf(member.body, `ref|${T(w().sharedTaskId)}|${T(w().taskInEpicId)}`);
    expect(edge?.snippet).toBe('see [[GN-2]]');
    expect(edge?.addedBy).toBe(names.get(w().member));
    expect(JSON.stringify(member.body)).not.toContain(w().hiddenTaskId);
    // The hidden row is live: the owner gets its edge.
    expect(edgeIdsOf((await ring('owner', q)).body)).toContain(`ref|${T(w().hiddenTaskId)}|${T(w().taskInEpicId)}`);
  });

  it("27.300 a typed link's edge carries who added it (a name), when, and its origin; control: a web link says 'web'", async () => {
    const [a, b, c, d] = [await ticket('a'), await ticket('b'), await ticket('c'), await ticket('d')];
    await link('relates', a, b, w().member, 'mcp');
    await link('relates', c, d, w().owner, 'web');
    const viaClaude = edgeOf((await ring('member', { center: T(a), hops: '1', ws: ws(), groups: NO_PROJECTS })).body, `relates|${T(a)}|${T(b)}`);
    expect(viaClaude).toMatchObject({ addedBy: names.get(w().member), addedAt: '2026-10-01T05:00:00.000Z', origin: 'mcp' });
    const viaWeb = edgeOf((await ring('member', { center: T(c), hops: '1', ws: ws(), groups: NO_PROJECTS })).body, `relates|${T(c)}|${T(d)}`);
    expect(viaWeb).toMatchObject({ addedBy: names.get(w().owner), origin: 'web' });
  });

  it('27.301 an attached note is an `attached` edge dated by the attachment (no actor); a private note is absent; control: the owner sees both', async () => {
    const shared = w().sharedTaskId;
    const open = await note('Licence checklist', { attachTicketId: shared });
    const mine = await note('Private licence notes', { mode: 'private', attachTicketId: shared });
    const { rows } = await db.pool.query<{ attached_at: Date }>('SELECT attached_at FROM proj_note_attachments WHERE note_id = $1 AND ticket_id = $2', [open, shared]);
    expect(rows).toHaveLength(1);
    const q = { center: T(shared), hops: '1', ws: ws(), groups: NO_PROJECTS };

    const member = await ring('member', q);
    expect(refsOf(member.body)).toContain(graphRef('note', open));
    expect(edgeOf(member.body, `attached|${graphRef('note', open)}|${T(shared)}`)).toMatchObject({ addedAt: rows[0]!.attached_at.toISOString(), addedBy: null });
    expect(JSON.stringify(member.body)).not.toContain(mine);
    const owner = await ring('owner', q);
    expect(refsOf(owner.body)).toEqual(expect.arrayContaining([graphRef('note', open), graphRef('note', mine)]));
  });
});

describe('27.302–27.304 projects, workspaces, deleted items', () => {
  it('27.302 the projects group: ticket → project → workspace and the project\'s items; a workspace-level note is in no project\'s ring; control: a project-homed note is, and the workspace\'s ring holds the project', async () => {
    const workspaceLevel = await note('Workspace handbook', { homeProjectId: '' });
    const projectHomed = await note('Registrations runbook');
    const q = { center: T(w().taskInEpicId), ws: ws(), groups: 'projects' };
    const project = graphRef('project', w().projectId);

    const one = await ring('member', { ...q, hops: '1' });
    expect(refsOf(one.body)).toEqual([project]);
    expect(edgeIdsOf(one.body)).toEqual([`in|${project}|${T(w().taskInEpicId)}`]);
    const two = refsOf((await ring('member', { ...q, hops: '2' })).body);
    expect(two).toEqual(expect.arrayContaining([graphRef('workspace', ws()), T(w().epicId), T(w().sharedTaskId), graphRef('note', projectHomed)]));
    expect(two).not.toContain(T(w().hiddenTaskId));
    expect(two).not.toContain(graphRef('note', workspaceLevel));

    const ofProject = refsOf((await ring('member', { center: project, hops: '1', ws: ws(), groups: 'projects' })).body);
    expect(ofProject).toContain(graphRef('note', projectHomed));
    expect(ofProject).not.toContain(graphRef('note', workspaceLevel));
    const ofWorkspace = refsOf((await ring('member', { center: graphRef('workspace', ws()), hops: '1', ws: ws(), groups: 'projects' })).body);
    expect(ofWorkspace).toContain(project);
    expect(ofWorkspace).not.toContain(graphRef('note', workspaceLevel));
  });

  it('27.303 a person assigned in two workspaces joins them: in scope with both chosen, fog with one, and the person is never fog; control: a workspace the member is not in is 404', async () => {
    // A second workspace of the member's, seeded here: `seedNeighbourWorkspace` makes its caller the OWNER and its fixed
    // `nb-` ids would collide on a second seed. Workflow and type ids carry a ULID for the same reason.
    const w2 = newUlid();
    const p2 = newUlid();
    const flow = `kg6-flow-${newUlid()}`;
    const type = `kg6-task-${newUlid()}`;
    const y = newUlid();
    const base = { workspaceId: w2, actorId: w().owner };
    await applyCommitted(db.pool, [
      makeCommitted({ ...base, entity: { kind: 'workspace', id: w2 }, type: 'workspace.created', payload: { name: 'Second shop' } }),
      makeCommitted({ ...base, entity: { kind: 'membership', id: membershipId(w2, w().owner) }, type: 'membership.granted', payload: { userId: w().owner, role: 'owner' } }),
      makeCommitted({ ...base, entity: { kind: 'membership', id: membershipId(w2, w().member) }, type: 'membership.granted', payload: { userId: w().member, role: 'member' } }),
      makeCommitted({ ...base, entity: { kind: 'project', id: p2 }, type: 'project.created', payload: { name: 'Second shop errands' } }),
      makeCommitted({ ...base, entity: { kind: 'project', id: p2 }, type: 'project.member_added', payload: { userId: w().member, projectAdmin: false } }),
      makeCommitted({
        ...base, entity: { kind: 'workflow', id: flow }, type: 'workflow.defined',
        payload: { id: flow, version: 1, name: 'Second flow', initialStateId: 'todo', states: [{ id: 'todo', name: 'To do', category: 'open' }], transitions: [{ from: '*', to: 'todo', rules: [] }] },
      }),
      makeCommitted({ ...base, entity: { kind: 'ticket-type', id: type }, type: 'ticket-type.defined', payload: { id: type, name: 'Task', icon: 'check', rank: 3, workflowId: flow, fields: [] } }),
      makeCommitted({ ...base, entity: { kind: 'ticket', id: y }, type: 'ticket.created', payload: { typeId: type, projectId: p2, parentId: null, title: 'Over in the second shop' } }),
    ]);
    await ticketEvent(y, 'ticket.assigned', { assigneeId: w().member }, w2);
    const x = await ticket('Here in the first shop');
    await ticketEvent(x, 'ticket.assigned', { assigneeId: w().member });
    const q = { center: T(x), groups: 'people' };
    const person = graphRef('person', w().member);

    const both = await ring('member', { ...q, hops: '2', ws: `${ws()},${w2}` });
    expect(itemOf(both.body, T(y))?.out).toBe(false);
    const one = await ring('member', { ...q, hops: '2', ws: ws() });
    expect(itemOf(one.body, T(y))?.out).toBe(true);
    expect(itemOf((await ring('member', { ...q, hops: '1', ws: ws() })).body, person)?.out).toBe(false);

    expect(await ring('member', { ...q, hops: '1', ws: `${ws()},${read.neighbour.workspaceId}` })).toEqual({ status: 404, body: READ_NOT_FOUND_BODY });
  });

  it('27.304 a deleted ticket linked to the centre is absent; control: once restored it is back', async () => {
    const K = await ticket('Centre with a deleted link');
    const D = await ticket('Deleted one');
    await link('relates', K, D);
    await ticketEvent(D, 'ticket.deleted', {});
    const q = { center: T(K), hops: '1', ws: ws(), groups: NO_PROJECTS };
    expect(await ring('member', q)).toEqual({ status: 200, body: empty(1) });
    await ticketEvent(D, 'ticket.restored', {});
    expect(refsOf((await ring('member', q)).body)).toEqual([T(D)]);
  });
});

describe('27.306–27.307 groups and hops', () => {
  it('27.306 groups=blocks is the blocks target alone, no parent edge; controls: groups=structure is the child, and no `groups` is the default set (projects included)', async () => {
    const G = await ticket('Grouped centre');
    const child = await ticket('Grouped child', { parentId: G });
    const blocked = await ticket('Grouped blocked');
    await link('blocks', G, blocked);
    const q = { center: T(G), hops: '1', ws: ws() };

    const blocks = await ring('member', { ...q, groups: 'blocks' });
    expect(refsOf(blocks.body)).toEqual([T(blocked)]);
    expect(edgeIdsOf(blocks.body)).toEqual([`blocks|${T(G)}|${T(blocked)}`]);
    const structure = await ring('member', { ...q, groups: 'structure' });
    expect(refsOf(structure.body)).toEqual([T(child)]);
    expect(edgeIdsOf(structure.body)).toEqual([`parent|${T(G)}|${T(child)}`]);
    const defaults = await ring('member', q);
    expect([...refsOf(defaults.body)].sort()).toEqual([T(blocked), T(child), graphRef('project', w().projectId)].sort());
  });

  it('27.307 past the last ring the answer is empty, up to hops=8; control: hops=2 is exactly the chain\'s end', async () => {
    const C = await ticket('Chain C');
    const D = await ticket('Chain D');
    const E = await ticket('Chain E');
    await link('relates', C, D);
    await link('relates', D, E);
    const q = { center: T(C), ws: ws(), groups: NO_PROJECTS };
    expect(await ring('member', { ...q, hops: '8' })).toEqual({ status: 200, body: empty(8) });
    expect(await ring('member', { ...q, hops: '3' })).toEqual({ status: 200, body: empty(3) });
    expect(refsOf((await ring('member', { ...q, hops: '2' })).body)).toEqual([T(E)]);
  });
});
