/**
 * Knowledge Graph spec D §5.1 (KG-D Task 6): `GET /v1/graph/path` and `GET /v1/graph/trace` (`src/routes/graph-query.ts`
 * over `src/read/graph-path.ts` and `src/read/graph-trace.ts`). Cases 27.508–27.510 (`test-cases/27-knowledge-graph.md`
 * §27.D, under `<!-- D T6 -->`).
 *
 * ## Seeded through EVENTS
 *
 * Links are `ticket.link_added` on the source's stream (as `perf.test.ts` files its link), parents are
 * `ticket.created`'s `parentId`, and a text link is a description's ticket chip (`ticket.field_set`, the shape
 * `read/linked-from.test.ts` uses), so plan A's and plan B's projections write `proj_ticket_links` and `proj_references`
 * here: no row is inserted by hand.
 *
 * ## The world
 *
 * `seedNotesFixture` around seven people who signed in over the wire, each with a real name and address (the names read
 * never labels a phone address, `routes/builder-reads.ts`, and a mention resolves to a person only by that label). The
 * owner reads every ticket; `memberIn` is on P and reads every ticket of P except an explicit one (T3, `[owner]`).
 * - T1 blocks T2 blocks T3 blocks T4; T1 relates T5 relates T6 relates T4. The ids are minted so the sort is observable
 *   (planner ruling 2026-10-04, Q4): `[T2, T5, T6, T3]` is one sorted ULID quadruple, so the sorted answer puts
 *   `[T1, T2, T3, T4]` first while the walk back from T4 over sorted parents (T6 before T3) finds `[T1, T5, T6, T4]`
 *   first. CX tags T1 and T4, so a path through a concept is two hops.
 * - X relates M1..M4 relates Y (M sorted, linked M4 first): four shortest paths, three answered.
 * - T7 ⇄ T8 (a `blocks` cycle); D1 duplicates D2 and blocks D3; U1 blocks U2 and U3, both block U4 (U2 < U3, linked
 *   U3 first); G ← S ← SS (parents); TA's description holds a chip to TB and a mention of `memberIn`; the note NA's body
 *   chips the ticket TC, and TD's description links the note NB (a `wikiLink`).
 * - H1 and H2 are explicit `[owner]`: A1 → H1 ← B1 (both links INTO the hidden item) and A2 ← H2 → B2 (both OUT of it), so
 *   each end of the both-ends-resolved check is the only one that stops its walk.
 * - PA and PB are both assigned to `admin` (no other item names them) and otherwise joined only by PA relates Q1 relates
 *   Q2 relates PB, so a walk through `people` is two hops where the default's is three.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { edgeSentence, newUlid, type GraphPathResponse, type GraphRingResponse, type GraphTraceResponse, type LedgerEvent } from '@gisik-nokma/domain';
import type { Queryable } from '../../src/db/queryable.js';
import { shortestPaths } from '../../src/read/graph-path.js';
import { buildTestApp } from '../helpers/app.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { NOTES_USERS, seedNotesFixture, type NotesFixture, type NotesUser } from '../helpers/notes-fixture.js';
import { signInWithPhone } from '../helpers/session.js';

let db: TestDatabase;
let app: FastifyInstance;
let world: NotesFixture;
const tokens = {} as Record<NotesUser, string>;
const ids = {} as Record<NotesUser, string>;
/** Fresh ids in ascending order, as a tuple (`sort` returns `this`): the order legs rely on the minting. */
const ascending = <T extends string[]>(...ids: T): T => ids.sort();
const [T2, T5, T6, T3] = ascending(newUlid(), newUlid(), newUlid(), newUlid());
const [T1, T4, T7, T8, CX] = [newUlid(), newUlid(), newUlid(), newUlid(), newUlid()];
const [M1, M2, M3, M4] = ascending(newUlid(), newUlid(), newUlid(), newUlid());
const [X, Y] = [newUlid(), newUlid()];
const [D1, D2, D3] = [newUlid(), newUlid(), newUlid()];
const [U2, U3] = ascending(newUlid(), newUlid());
const [U1, U4] = [newUlid(), newUlid()];
const [G, S, SS, TA, TB] = [newUlid(), newUlid(), newUlid(), newUlid(), newUlid()];
const [NA, NB, TC, TD] = [newUlid(), newUlid(), newUlid(), newUlid()];
const [A1, H1, B1, A2, H2, B2] = [newUlid(), newUlid(), newUlid(), newUlid(), newUlid(), newUlid()];
const [PA, PB, Q1, Q2] = [newUlid(), newUlid(), newUlid(), newUlid()];
const n = (id: string) => `note:${id}`;
const t = (id: string) => `ticket:${id}`;

function tev(ticketId: string, type: string, payload: Record<string, unknown>): LedgerEvent {
  return makeCommitted({ workspaceId: world.WS, actorId: world.ids.owner, entity: { kind: 'ticket', id: ticketId }, type, payload });
}
const created = (id: string, title: string, parentId: string | null = null) =>
  tev(id, 'ticket.created', { typeId: 'task', projectId: world.P, parentId, title });
const link = (kind: 'blocks' | 'relates' | 'duplicates', source: string, target: string) => tev(source, 'ticket.link_added', { kind, targetId: target });
const doc = (...inline: unknown[]) => ({ type: 'doc', content: [{ type: 'paragraph', content: inline }] });

async function get(who: NotesUser | null, url: string): Promise<{ status: number; body: string }> {
  const res = await app.inject({ method: 'GET', url, headers: who === null ? {} : { authorization: `Bearer ${tokens[who]}` } });
  return { status: res.statusCode, body: res.body };
}
const pathUrl = (q: Record<string, string>) => `/v1/graph/path?${new URLSearchParams(q).toString()}`;
const traceUrl = (q: Record<string, string>) => `/v1/graph/trace?${new URLSearchParams(q).toString()}`;
async function path(who: NotesUser, q: Record<string, string>): Promise<GraphPathResponse> {
  const { status, body } = await get(who, pathUrl(q));
  expect(status, body).toBe(200);
  return JSON.parse(body) as GraphPathResponse;
}
async function trace(who: NotesUser, q: Record<string, string>): Promise<GraphTraceResponse> {
  const { status, body } = await get(who, traceUrl(q));
  expect(status, body).toBe(200);
  return JSON.parse(body) as GraphTraceResponse;
}
const labelsOf = (r: { items: Array<{ ref: string; label: string }> }) => new Map(r.items.map((item) => [item.ref, item.label]));
const chainOf = (r: GraphTraceResponse) => r.chain.map((entry) => [entry.ref, entry.depth, entry.via]);
const NOT_FOUND = { status: 404, body: '{"error":"not_found"}' };
const INVALID = { status: 400, body: '{"error":"invalid_query"}' };

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  await app.ready();
  for (const [index, who] of NOTES_USERS.entries()) {
    const user = await signInWithPhone(app, built.otp, `+911100051${String(500 + index)}`);
    ids[who] = user.userId;
    tokens[who] = user.token;
    await db.pool.query('UPDATE "user" SET name = $1, email = $2 WHERE id = $3', [`Person ${who}`, `${who}@kg-d-t6-path.test`, user.userId]);
  }
  world = await seedNotesFixture(db.pool, ids);
  const tickets: Array<[string, string, string?]> = [
    [T1, 'Order the stock'], [T2, 'Price the stock'], [T3, 'Sign the contract'], [T4, 'Open the shop'], [T5, 'Find a supplier'], [T6, 'Meet the supplier'],
    [T7, 'Cycle one'], [T8, 'Cycle two'], [X, 'Plan the fit-out'], [Y, 'Fit out the shop'], [M4, 'Shelving'], [M3, 'Lighting'], [M2, 'Flooring'], [M1, 'Counter'],
    [D1, 'Duplicate report'], [D2, 'Original report'], [D3, 'Blocked by the duplicate'], [U1, 'Survey'], [U3, 'Quote B'], [U2, 'Quote A'], [U4, 'Choose a quote'],
    [G, 'Launch'], [S, 'Launch week', G], [SS, 'Launch day', S], [TA, 'Write the brief'], [TB, 'Read the brief'], [TC, 'Book the hall'], [TD, 'Print the menu'],
    [A1, 'Inbound one'], [H1, 'Hidden sink'], [B1, 'Inbound two'], [A2, 'Outbound one'], [H2, 'Hidden source'], [B2, 'Outbound two'],
    [PA, 'Paint the sign'], [PB, 'Hang the sign'], [Q1, 'Buy the bracket'], [Q2, 'Drill the wall'],
  ];
  await applyCommitted(db.pool, [
    ...tickets.map(([id, title, parentId]) => created(id, title, parentId ?? null)),
    ...[T3, H1, H2].map((id) => tev(id, 'visibility.set', { ticketId: id, mode: 'explicit', userIds: [world.ids.owner] })),
    link('blocks', A1, H1), link('blocks', B1, H1), link('blocks', H2, A2), link('blocks', H2, B2),
    link('blocks', T1, T2), link('blocks', T2, T3), link('blocks', T3, T4),
    link('relates', T1, T5), link('relates', T5, T6), link('relates', T6, T4),
    // M4 first, so the walk's unsorted predecessors of Y are M4, M3, M2, M1.
    ...[M4, M3, M2, M1].flatMap((m) => [link('relates', X, m), link('relates', m, Y)]),
    link('blocks', T7, T8), link('blocks', T8, T7),
    link('relates', PA, Q1), link('relates', Q1, Q2), link('relates', Q2, PB),
    ...[PA, PB].map((id) => tev(id, 'ticket.assigned', { assigneeId: world.ids.admin })),
    link('duplicates', D1, D2), link('blocks', D1, D3),
    // U3 first at both depths, so an unsorted layer would credit U3.
    link('blocks', U1, U3), link('blocks', U1, U2), link('blocks', U3, U4), link('blocks', U2, U4),
    tev(TA, 'ticket.field_set', { fieldId: 'description', value: doc(
      { type: 'text', text: 'see ' }, { type: 'ticketRef', attrs: { ticketId: TB, projectId: world.P, key: 'X-1', title: 'Read the brief' } },
      { type: 'text', text: ' with ' }, { type: 'mention', attrs: { userId: world.ids.memberIn } },
    ) }),
    makeCommitted({ workspaceId: world.WS, actorId: world.ids.owner, entity: { kind: 'note', id: NA }, type: 'note.created', payload: {
      title: 'Venue notes', homeProjectId: world.P, scope: { mode: 'workspace' },
      body: doc({ type: 'text', text: 'hall: ' }, { type: 'ticketRef', attrs: { ticketId: TC, projectId: world.P, key: 'X-2', title: 'Book the hall' } }),
    } }),
    makeCommitted({ workspaceId: world.WS, actorId: world.ids.owner, entity: { kind: 'note', id: NB }, type: 'note.created', payload: { title: 'Menu', homeProjectId: world.P, scope: { mode: 'workspace' } } }),
    tev(TD, 'ticket.field_set', { fieldId: 'description', value: doc({ type: 'text', text: 'from ' }, { type: 'wikiLink', attrs: { noteId: NB, title: 'Menu' } }) }),
    makeCommitted({ workspaceId: world.WS, actorId: world.ids.owner, entity: { kind: 'concept', id: CX }, type: 'concept.created', payload: { name: 'Opening' } }),
    makeCommitted({ workspaceId: world.WS, actorId: world.ids.owner, entity: { kind: 'concept', id: CX }, type: 'concept.item_tagged', payload: { itemKind: 'ticket', itemId: T1 } }),
    makeCommitted({ workspaceId: world.WS, actorId: world.ids.owner, entity: { kind: 'concept', id: CX }, type: 'concept.item_tagged', payload: { itemKind: 'ticket', itemId: T4 } }),
  ]);
  // The minting the order legs rely on.
  expect(T2 < T5 && T5 < T6 && T6 < T3).toBe(true);
}, 120_000);
afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('27.508 graph/path: up to three shortest paths, only through what the reader sees', () => {
  it('27.508 the owner gets both 3-hop paths in sorted order; memberIn only the one around the hidden T3; control: one sentence per edge, over the answer’s own keyed labels', async () => {
    const owner = await path('owner', { from: t(T1), to: t(T4), maxHops: '6' });
    expect(owner.from).toBe(t(T1));
    expect(owner.to).toBe(t(T4));
    expect(owner.paths.map((p) => p.refs)).toEqual([[t(T1), t(T2), t(T3), t(T4)], [t(T1), t(T5), t(T6), t(T4)]]);
    expect(owner.items.map((item) => [item.ref, item.hop, item.out]).sort()).toEqual(
      [[t(T1), 0, false], [t(T2), 1, false], [t(T3), 2, false], [t(T4), 3, false], [t(T5), 1, false], [t(T6), 2, false]].sort(),
    );
    const labels = labelsOf(owner);
    expect(labels.get(t(T1))).toMatch(/^[A-Z]+-\d+$/); // a card key, not the title
    for (const p of owner.paths) {
      expect(p.sentences).toHaveLength(p.edges.length);
      expect(p.edges.map((edge) => edge.id)).toHaveLength(3);
      p.edges.forEach((edge, index) => expect(p.sentences[index]).toBe(edgeSentence(edge, (ref) => labels.get(ref) ?? '')));
      expect(p.sentences[0]).toContain(labels.get(t(T1))!);
    }
    expect(owner.paths[0]!.sentences[0]).toBe(`${labels.get(t(T1))!} blocks ${labels.get(t(T2))!}`);
    expect(owner.paths[0]!.edges[0]).toMatchObject({ id: `blocks|${t(T1)}|${t(T2)}`, kind: 'blocks', addedBy: 'Person owner', origin: 'web', suggested: false });

    const member = await path('memberIn', { from: t(T1), to: t(T4), maxHops: '6' });
    expect(member.paths.map((p) => p.refs)).toEqual([[t(T1), t(T5), t(T6), t(T4)]]);
    expect(member.items.map((item) => item.ref)).not.toContain(t(T3));
    // `maxHops` defaults to 6: the same pair answers the same two paths without it.
    expect((await path('owner', { from: t(T1), to: t(T4) })).paths.map((p) => p.refs)).toEqual(owner.paths.map((p) => p.refs));
  });

  it('27.508 maxHops is a hop limit (1 finds none, 3 finds both) and 1..6 only; a hidden or unknown end is the one 404; a bad query is 400', async () => {
    const one = await path('owner', { from: t(T1), to: t(T4), maxHops: '1' });
    expect(one).toEqual({ from: t(T1), to: t(T4), paths: [], items: [] });
    expect((await path('owner', { from: t(T1), to: t(T4), maxHops: '3' })).paths).toHaveLength(2);
    expect((await path('owner', { from: t(T1), to: t(T4), maxHops: '2' })).paths).toEqual([]);
    expect(await get('owner', pathUrl({ from: t(T1), to: t(T4), maxHops: '7' }))).toEqual(INVALID);
    for (const maxHops of ['0', '06', '-1', '1.5', 'six']) expect(await get('owner', pathUrl({ from: t(T1), to: t(T4), maxHops })), maxHops).toEqual(INVALID);
    expect(await get('owner', pathUrl({ from: 'widget:1', to: t(T4) }))).toEqual(INVALID);
    expect(await get('owner', pathUrl({ from: t(T1) }))).toEqual(INVALID);
    expect(await get('owner', pathUrl({ from: t(T1), to: t(T4), groups: 'blocks,bogus' }))).toEqual(INVALID);
    // A repeated key reaches the parser as an array; `groups` would reach `.split` (a 500) without the refusal.
    expect(await get('owner', `${pathUrl({ from: t(T1), to: t(T4) })}&groups=blocks&groups=relates`)).toEqual(INVALID);
    expect(await get('owner', `${pathUrl({ from: t(T1), to: t(T4) })}&from=${t(T2)}`)).toEqual(INVALID);
    expect(await get('memberIn', pathUrl({ from: t(T1), to: t(T3) }))).toEqual(NOT_FOUND);
    expect(await get('memberIn', pathUrl({ from: t(T3), to: t(T1) }))).toEqual(NOT_FOUND);
    expect(await get('memberIn', pathUrl({ from: t(T1), to: t(newUlid()) }))).toEqual(NOT_FOUND);
    expect((await get(null, pathUrl({ from: t(T1), to: t(T4) }))).status).toBe(401);
    // Control: the same reader's path to a ticket they see is answered.
    expect((await path('memberIn', { from: t(T1), to: t(T2) })).paths.map((p) => p.refs)).toEqual([[t(T1), t(T2)]]);
    // A hidden item ends a branch whichever way its links point (A1 → H1 ← B1, A2 ← H2 → B2); control: the owner's path runs through it.
    for (const [a, h, b] of [[A1, H1, B1], [A2, H2, B2]] as const) {
      expect((await path('memberIn', { from: t(a), to: t(b) })).paths, h).toEqual([]);
      expect((await path('owner', { from: t(a), to: t(b) })).paths.map((p) => p.refs), h).toEqual([[t(a), t(h), t(b)]]);
    }
    // From an item to itself: one path of no edges.
    expect(await path('owner', { from: t(T1), to: t(T1) })).toMatchObject({ paths: [{ refs: [t(T1)], edges: [], sentences: [] }] });
  });

  it('27.508 the default groups leave out projects, concepts and people (each a two-hop shortcut), `groups` narrows the walk, and four tied paths answer the three lowest', async () => {
    expect((await path('owner', { from: t(T1), to: t(T4), groups: 'projects' })).paths.map((p) => p.refs)).toEqual([[t(T1), `project:${world.P}`, t(T4)]]);
    expect((await path('owner', { from: t(T1), to: t(T4), groups: 'concepts' })).paths.map((p) => p.refs)).toEqual([[t(T1), `concept:${CX}`, t(T4)]]);
    expect((await path('owner', { from: t(T1), to: t(T4), groups: 'blocks' })).paths.map((p) => p.refs)).toEqual([[t(T1), t(T2), t(T3), t(T4)]]);
    expect((await path('owner', { from: t(T1), to: t(T4), groups: 'relates' })).paths.map((p) => p.refs)).toEqual([[t(T1), t(T5), t(T6), t(T4)]]);
    // One assignee is a hub too ("PA is assigned to admin, admin is the assignee of PB"): the default walks the three
    // relates hops; control: naming `people` beside `relates` answers the two hops through the person.
    expect((await path('owner', { from: t(PA), to: t(PB) })).paths.map((p) => p.refs)).toEqual([[t(PA), t(Q1), t(Q2), t(PB)]]);
    expect((await path('owner', { from: t(PA), to: t(PB), groups: 'people,relates' })).paths.map((p) => p.refs)).toEqual([[t(PA), `person:${world.ids.admin}`, t(PB)]]);

    const tied = await path('owner', { from: t(X), to: t(Y) });
    expect(tied.paths.map((p) => p.refs)).toEqual([[t(X), t(M1), t(Y)], [t(X), t(M2), t(Y)], [t(X), t(M3), t(Y)]]);
  });

  it('27.508 the walk stops at the layer that reaches `to`: one link read for a one-hop pair, though maxHops allows six', async () => {
    let linkReads = 0;
    const counting = new Proxy(db.pool, {
      get(target, prop, receiver) {
        if (prop !== 'query') return Reflect.get(target, prop, receiver) as unknown;
        return (text: unknown, params?: unknown[]) => {
          if (String(text).includes('FROM proj_ticket_links')) linkReads += 1;
          return target.query(text as string, params);
        };
      },
    }) as Queryable;
    const found = await shortestPaths(counting, world.ids.owner, { from: t(T1), to: t(T2), maxHops: 6, groups: new Set(['blocks']) });
    expect(found?.paths.map((p) => p.refs)).toEqual([[t(T1), t(T2)]]);
    expect(linkReads).toBe(1);
    // Control: a three-hop pair reads one layer per hop, so the counter counts layers.
    linkReads = 0;
    await shortestPaths(counting, world.ids.owner, { from: t(T1), to: t(T4), maxHops: 6, groups: new Set(['blocks']) });
    expect(linkReads).toBe(3);
  });
});

describe('27.509 graph/trace kind=blocks: breadth-first, stopping at a hidden item and at a repeat', () => {
  it('27.509 the owner’s chain from T1 is T2, T3, T4 with sentences; memberIn stops before the hidden T3; the cycle ends at the repeat; maxDepth limits and is 1..10', async () => {
    const owner = await trace('owner', { from: t(T1), kind: 'blocks', direction: 'out', maxDepth: '10' });
    expect(owner).toMatchObject({ from: t(T1), kind: 'blocks', direction: 'out' });
    expect(chainOf(owner)).toEqual([[t(T2), 1, t(T1)], [t(T3), 2, t(T2)], [t(T4), 3, t(T3)]]);
    const labels = labelsOf(owner);
    expect(labels.get(t(T1))).toMatch(/^[A-Z]+-\d+$/);
    expect(owner.sentences).toEqual([
      `${labels.get(t(T1))!} blocks ${labels.get(t(T2))!}`, `${labels.get(t(T2))!} blocks ${labels.get(t(T3))!}`, `${labels.get(t(T3))!} blocks ${labels.get(t(T4))!}`,
    ]);
    expect(owner.items.map((item) => [item.ref, item.hop, item.out]).sort()).toEqual([[t(T1), 0, false], [t(T2), 1, false], [t(T3), 2, false], [t(T4), 3, false]].sort());

    expect(chainOf(await trace('memberIn', { from: t(T1), kind: 'blocks', direction: 'out' }))).toEqual([[t(T2), 1, t(T1)]]);
    expect(chainOf(await trace('owner', { from: t(T7), kind: 'blocks', direction: 'out' }))).toEqual([[t(T8), 1, t(T7)]]);
    expect(chainOf(await trace('owner', { from: t(T1), kind: 'blocks', direction: 'out', maxDepth: '2' }))).toEqual([[t(T2), 1, t(T1)], [t(T3), 2, t(T2)]]);

    const back = await trace('owner', { from: t(T4), kind: 'blocks', direction: 'in' });
    expect(chainOf(back)).toEqual([[t(T3), 1, t(T4)], [t(T2), 2, t(T3)], [t(T1), 3, t(T2)]]);
    expect(back.sentences[0]).toBe(`${labelsOf(back).get(t(T3))!} blocks ${labelsOf(back).get(t(T4))!}`);

    expect(await get('owner', traceUrl({ from: t(T1), kind: 'blocks', direction: 'out', maxDepth: '11' }))).toEqual(INVALID);
    for (const q of [{ maxDepth: '0' }, { kind: 'relates' }, { direction: 'up' }, { kind: '' }] as Array<Record<string, string>>) {
      expect(await get('owner', traceUrl({ from: t(T1), kind: 'blocks', direction: 'out', ...q })), JSON.stringify(q)).toEqual(INVALID);
    }
    expect(await get('owner', traceUrl({ from: t(T1), kind: 'blocks' }))).toEqual(INVALID);
    // A bad or missing `from` is 400, like the path's (reviewer A, mutant R1: the trace parser's `from === null` clause dropped).
    expect(await get('owner', traceUrl({ from: 'widget:1', kind: 'blocks', direction: 'out' }))).toEqual(INVALID);
    expect(await get('owner', traceUrl({ kind: 'blocks', direction: 'out' }))).toEqual(INVALID);
    expect(await get('owner', `${traceUrl({ from: t(T1), kind: 'blocks', direction: 'out' })}&kind=parent`)).toEqual(INVALID);
    expect(await get('memberIn', traceUrl({ from: t(T3), kind: 'blocks', direction: 'out' }))).toEqual(NOT_FOUND);
    expect((await get(null, traceUrl({ from: t(T1), kind: 'blocks', direction: 'out' }))).status).toBe(401);
  });

  it('27.509 a layer is sorted, so a node two items reach is credited to the lower one; a kind follows its own links only', async () => {
    expect(chainOf(await trace('owner', { from: t(U1), kind: 'blocks', direction: 'out' }))).toEqual([[t(U2), 1, t(U1)], [t(U3), 1, t(U1)], [t(U4), 2, t(U2)]]);
    // Walked back, the rows of one target come in the order they were written (U3's first), so only the sort puts U2 first.
    expect(chainOf(await trace('owner', { from: t(U4), kind: 'blocks', direction: 'in' }))).toEqual([[t(U2), 1, t(U4)], [t(U3), 1, t(U4)], [t(U1), 2, t(U2)]]);
    expect(chainOf(await trace('owner', { from: t(D1), kind: 'blocks', direction: 'out' }))).toEqual([[t(D3), 1, t(D1)]]);
    const dup = await trace('owner', { from: t(D1), kind: 'duplicates', direction: 'out' });
    expect(chainOf(dup)).toEqual([[t(D2), 1, t(D1)]]);
    expect(dup.sentences).toEqual([`${labelsOf(dup).get(t(D1))!} duplicates ${labelsOf(dup).get(t(D2))!}`]);
  });
});

describe('27.510 graph/trace kind=parent and kind=ref', () => {
  it('27.510 parent out walks up and in walks down, each read as "has subtask"; ref follows a description’s chip and never a mention', async () => {
    const up = await trace('owner', { from: t(SS), kind: 'parent', direction: 'out' });
    expect(chainOf(up)).toEqual([[t(S), 1, t(SS)], [t(G), 2, t(S)]]);
    const ul = labelsOf(up);
    expect(up.sentences).toEqual([`${ul.get(t(S))!} has subtask ${ul.get(t(SS))!}`, `${ul.get(t(G))!} has subtask ${ul.get(t(S))!}`]);
    const down = await trace('owner', { from: t(G), kind: 'parent', direction: 'in' });
    expect(chainOf(down)).toEqual([[t(S), 1, t(G)], [t(SS), 2, t(S)]]);
    const dl = labelsOf(down);
    expect(down.sentences).toEqual([`${dl.get(t(G))!} has subtask ${dl.get(t(S))!}`, `${dl.get(t(S))!} has subtask ${dl.get(t(SS))!}`]);

    const out = await trace('owner', { from: t(TA), kind: 'ref', direction: 'out' });
    expect(chainOf(out)).toEqual([[t(TB), 1, t(TA)]]);
    expect(out.sentences).toEqual([`${labelsOf(out).get(t(TA))!} links to ${labelsOf(out).get(t(TB))!}`]);
    expect(out.chain.map((entry) => entry.ref)).not.toContain(`person:${world.ids.memberIn}`);
    // Control: the same mention reaches the person in a `people` ring, so the skip above is the trace's filter.
    const res = await get('owner', `/v1/graph/neighbours?${new URLSearchParams({ center: t(TA), hops: '1', ws: world.WS, groups: 'people' }).toString()}`);
    expect((JSON.parse(res.body) as GraphRingResponse).items.map((item) => item.ref)).toContain(`person:${world.ids.memberIn}`);

    const into = await trace('owner', { from: t(TB), kind: 'ref', direction: 'in' });
    expect(chainOf(into)).toEqual([[t(TA), 1, t(TB)]]);
    expect(into.sentences).toEqual([`${labelsOf(into).get(t(TA))!} links to ${labelsOf(into).get(t(TB))!}`]);

    // Notes on both ends: a note's body linking a ticket, and a ticket's description linking a note, each way.
    expect(chainOf(await trace('owner', { from: n(NA), kind: 'ref', direction: 'out' }))).toEqual([[t(TC), 1, n(NA)]]);
    expect(chainOf(await trace('owner', { from: t(TC), kind: 'ref', direction: 'in' }))).toEqual([[n(NA), 1, t(TC)]]);
    const toNote = await trace('owner', { from: t(TD), kind: 'ref', direction: 'out' });
    expect(chainOf(toNote)).toEqual([[n(NB), 1, t(TD)]]);
    expect(toNote.sentences).toEqual([`${labelsOf(toNote).get(t(TD))!} links to Menu`]);
    expect(chainOf(await trace('owner', { from: n(NB), kind: 'ref', direction: 'in' }))).toEqual([[t(TD), 1, n(NB)]]);
  });
});
