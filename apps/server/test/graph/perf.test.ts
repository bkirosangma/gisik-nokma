/**
 * Knowledge Graph spec C, ring read (`read/graph-neighbours.ts`): 27.208-27.209 smoke on every run, 27.210 the p95 per ring
 * (`KG_PERF=1`). The link and reference tables come from `./shim.ts` until plan A's and plan B's migrations are on the branch.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { graphRef, membershipId, newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { readGraphRing } from '../../src/read/graph-neighbours.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { ensureLinkAndReferenceTables } from './shim.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  await ensureLinkAndReferenceTables(db.pool);
}, 600_000);
afterAll(async () => {
  await db.drop();
});


const insertUser = (id: string, name: string) =>
  db.pool.query(`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ($1, $2, $3, true, now(), now())`, [id, name, `${id}@kg.test`]);

type Ids = { ws: string; owner: string; member: string; project: string; workflowId: string; typeId: string };

/** The workspace, its memberships, one project, a workflow and a ticket type. Fresh ids per call: the fixed `wf-errands` ids of read-scenario collide on a second seed. */
function worldEvents(ids: Ids, extraProjects: string[] = []): LedgerEvent[] {
  const { ws, owner, member, project, workflowId, typeId } = ids;
  const base = { workspaceId: ws, actorId: owner };
  return [
    makeCommitted({ ...base, entity: { kind: 'workspace', id: ws }, type: 'workspace.created', payload: { name: 'Graph Corp' } }),
    makeCommitted({ ...base, entity: { kind: 'membership', id: membershipId(ws, owner) }, type: 'membership.granted', payload: { userId: owner, role: 'owner' } }),
    makeCommitted({ ...base, entity: { kind: 'membership', id: membershipId(ws, member) }, type: 'membership.granted', payload: { userId: member, role: 'member' } }),
    ...[project, ...extraProjects].flatMap((id, i) => [
      makeCommitted({ ...base, entity: { kind: 'project', id }, type: 'project.created', payload: { name: `Project ${String(i)}` } }),
      makeCommitted({ ...base, entity: { kind: 'project', id }, type: 'project.member_added', payload: { userId: owner, projectAdmin: true } }),
      makeCommitted({ ...base, entity: { kind: 'project', id }, type: 'project.member_added', payload: { userId: member, projectAdmin: false } }),
    ]),
    makeCommitted({
      ...base, entity: { kind: 'workflow', id: workflowId }, type: 'workflow.defined',
      payload: {
        id: workflowId, version: 1, name: 'Flow', initialStateId: 'todo',
        states: [{ id: 'todo', name: 'To do', category: 'open' }, { id: 'done', name: 'Done', category: 'terminal' }],
        transitions: [{ from: '*', to: 'todo', rules: [] }, { from: '*', to: 'done', rules: [] }],
      },
    }),
    makeCommitted({ ...base, entity: { kind: 'ticket-type', id: typeId }, type: 'ticket-type.defined', payload: { id: typeId, name: 'Task', icon: 'check', rank: 1, workflowId, fields: [] } }),
  ];
}

const freshIds = (): Ids => ({ ws: newUlid(), owner: newUlid(), member: newUlid(), project: newUlid(), workflowId: newUlid(), typeId: newUlid() });

/** A NEW world each call, so cases never share state. */
async function seedSmall(database: TestDatabase) {
  const ids = freshIds();
  await insertUser(ids.owner, 'Olive Owner');
  await insertUser(ids.member, 'Mira Member');
  const [parent, child, grandchild, hidden] = [newUlid(), newUlid(), newUlid(), newUlid()] as [string, string, string, string];
  const base = { workspaceId: ids.ws, actorId: ids.owner };
  const create = (id: string, parentId: string | null, title: string) =>
    makeCommitted({ ...base, entity: { kind: 'ticket', id }, type: 'ticket.created', payload: { typeId: ids.typeId, projectId: ids.project, parentId, title } });
  await applyCommitted(database.pool, [
    ...worldEvents(ids),
    create(parent, null, 'Parent'),
    create(child, parent, 'Child'),
    create(grandchild, child, 'Grandchild'),
    create(hidden, null, 'Hidden from the member'),
    makeCommitted({ ...base, entity: { kind: 'ticket', id: hidden }, type: 'visibility.set', payload: { ticketId: hidden, mode: 'explicit', userIds: [ids.owner] } }),
  ]);
  return { ws: ids.ws, owner: ids.owner, member: ids.member, parent, child, grandchild, hidden };
}

/** Every group: what the perf case reads. */
const all = new Set(['blocks', 'relates', 'dup', 'structure', 'attached', 'projects', 'ref', 'people'] as const);

/** The smoke case isolates the parent edge; with `projects` on, a ticket's project is a legitimate ring-1 item (plan text drift: its `all` includes it). */
const structureOnly = new Set(['structure'] as const);

describe('27.208–27.209 the ring read, smoke', () => {
  it('27.208 ring 1 of a parent holds its child and the parent edge; control: ring 2 holds the grandchild and not the child', async () => {
    const world = await seedSmall(db);
    const r1 = await readGraphRing(db.pool, world.member, { center: { kind: 'ticket', id: world.parent }, hops: 1, workspaceIds: [world.ws], projectIds: [], groups: structureOnly, offset: 0 });
    expect(r1?.items.map((i) => i.ref)).toEqual([graphRef('ticket', world.child)]);
    expect(r1?.edges.map((e) => e.kind)).toEqual(['parent']);
    const r2 = await readGraphRing(db.pool, world.member, { center: { kind: 'ticket', id: world.parent }, hops: 2, workspaceIds: [world.ws], projectIds: [], groups: structureOnly, offset: 0 });
    expect(r2?.items.map((i) => i.ref)).toEqual([graphRef('ticket', world.grandchild)]);
  });

  it('27.209 a centre the viewer cannot see answers null (the route turns it into 404); control: the owner reads it', async () => {
    const world = await seedSmall(db);
    const req = { center: { kind: 'ticket' as const, id: world.hidden }, hops: 1, workspaceIds: [world.ws], projectIds: [], groups: all, offset: 0 };
    expect(await readGraphRing(db.pool, world.member, req)).toBeNull();
    expect(await readGraphRing(db.pool, world.owner, req)).not.toBeNull();
  });
});

const ENABLED = process.env['KG_PERF'] === '1';
function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1))] as number;
}

describe('27.210 p95 per ring at 500 items (spec §2.2, §7)', () => {
  if (!ENABLED) {
    console.log('kg-perf: SKIPPED — set KG_PERF=1 to seed the corpus and measure p95 per ring (target ≤ 150 ms at 500 items).');
    it.skip('seeds and measures (set KG_PERF=1)', () => undefined);
    return;
  }
  it('27.210 / 27.305 p95 ≤ 150 ms for every ring of the hub ticket, as a MEMBER (the predicates do work; an owner compiles to TRUE)', async () => {
    const corpus = await seedGraphCorpus(db, { tickets: 10_000, notes: 2_500, people: 12, links: 3_000, references: 6_000 });
    for (const hops of [1, 2, 3]) {
      const req = { center: { kind: 'ticket' as const, id: corpus.hub }, hops, workspaceIds: [corpus.ws], projectIds: [], groups: all, offset: 0 };
      const first = await readGraphRing(db.pool, corpus.member, req); // warm
      const timings: number[] = [];
      for (let i = 0; i < 100; i += 1) {
        const started = process.hrtime.bigint();
        await readGraphRing(db.pool, corpus.member, req);
        timings.push(Number(process.hrtime.bigint() - started) / 1e6);
      }
      timings.sort((a, b) => a - b);
      const p95 = percentile(timings, 0.95);
      console.log(`kg-perf (LOCAL) on ${process.platform}/${process.arch}: ring ${hops}: ${first?.items.length} items, ${first?.edges.length} edges, p95 ${p95.toFixed(1)} ms (target 150)`);
      expect(p95, `spec §7, ring ${hops}`).toBeLessThanOrEqual(150);
    }
    // the shape the bar is about: some ring holds at least 500 items
    const r2 = await readGraphRing(db.pool, corpus.member, { center: { kind: 'ticket', id: corpus.hub }, hops: 2, workspaceIds: [corpus.ws], projectIds: [], groups: all, offset: 0 });
    expect(r2!.items.length).toBeGreaterThanOrEqual(500);
  }, 3_600_000);
});

type CorpusSize = { tickets: number; notes: number; people: number; links: number; references: number };

/**
 * A deterministic corpus (fixed-seed LCG) seeded through the ledger, so every projection runs, plus plain INSERTs into the shimmed
 * link and reference tables. The hub is ticket 0: 24 extra subtasks on top of the tree's 8, 8 attached notes, 6 typed links and
 * 4 references, and each of those neighbours gets 16 more neighbours, so ring 2 holds more than the 500 items the bar is about.
 */
async function seedGraphCorpus(database: TestDatabase, size: CorpusSize) {
  const ids = freshIds();
  const projects = [ids.project, newUlid(), newUlid(), newUlid()];
  let state = 20_261_003;
  const rand = (below: number) => {
    state = ((Math.imul(state, 1_103_515_245) + 12_345) >>> 0) & 0x7fffffff;
    return state % below;
  };
  await insertUser(ids.owner, 'Olive Owner');
  await insertUser(ids.member, 'Mira Member');
  const people: string[] = [];
  for (let k = 0; k < size.people; k += 1) {
    const id = newUlid();
    people.push(id);
    await insertUser(id, `Person ${String(k + 1)}`);
  }
  const base = { workspaceId: ids.ws, actorId: ids.owner };
  const tickets = Array.from({ length: size.tickets }, () => newUlid());
  const hub = tickets[0] as string;
  const create = (id: string, parentId: string | null, projectId: string, title: string) =>
    makeCommitted({ ...base, entity: { kind: 'ticket', id }, type: 'ticket.created', payload: { typeId: ids.typeId, projectId, parentId, title } });

  let batch: LedgerEvent[] = [
    ...worldEvents(ids, projects.slice(1)),
    ...people.map((userId) => makeCommitted({ ...base, entity: { kind: 'membership', id: membershipId(ids.ws, userId) }, type: 'membership.granted', payload: { userId, role: 'member' } })),
  ];
  const flush = async () => {
    await applyCommitted(database.pool, batch);
    batch = [];
  };
  for (let i = 0; i < tickets.length; i += 1) {
    const id = tickets[i] as string;
    batch.push(create(id, i < 40 ? null : (tickets[Math.floor((i - 40) / 8)] as string), projects[i % 4] as string, `Ticket ${String(i)}`));
    if (i % 10 === 3) batch.push(makeCommitted({ ...base, entity: { kind: 'ticket', id }, type: 'visibility.set', payload: { ticketId: id, mode: 'explicit', userIds: [ids.owner] } }));
    batch.push(makeCommitted({ ...base, entity: { kind: 'ticket', id }, type: 'ticket.assigned', payload: { assigneeId: people[i % people.length] as string } }));
    if (batch.length >= 1500) await flush();
  }
  const hubChildren: string[] = [];
  for (let k = 0; k < 24; k += 1) {
    const id = newUlid();
    hubChildren.push(id);
    batch.push(create(id, hub, projects[k % 4] as string, `Hub subtask ${String(k)}`));
  }
  const notes = Array.from({ length: size.notes }, () => newUlid());
  notes.forEach((id, j) => {
    batch.push(
      makeCommitted({
        ...base, entity: { kind: 'note', id }, type: 'note.created',
        payload: { title: `Note ${String(j)}`, homeProjectId: projects[j % 4] as string, scope: { mode: 'workspace' }, attachTicketId: j < 8 ? hub : (tickets[(j * 7) % size.tickets] as string) },
      }),
    );
  });
  await flush();

  type LinkRow = [source: string, target: string, kind: string];
  type RefRow = { sourceKind: 'ticket' | 'note'; source: string; targetKind: 'ticket' | 'note' | 'person'; target: string };
  const links: LinkRow[] = [];
  const refs: RefRow[] = [];
  const kinds = ['blocks', 'relates', 'duplicates'];
  const randomTicket = () => tickets[rand(size.tickets)] as string;
  for (let j = 0; j < size.links; j += 1) links.push([randomTicket(), randomTicket(), kinds[j % 3] as string]);
  for (let j = 0; j < size.references; j += 1) {
    const fromNote = j % 3 === 0;
    const person = j % 4 === 0;
    refs.push({
      sourceKind: fromNote ? 'note' : 'ticket',
      source: fromNote ? (notes[rand(size.notes)] as string) : randomTicket(),
      targetKind: person ? 'person' : fromNote || j % 2 === 0 ? 'ticket' : 'note',
      target: person ? (people[rand(size.people)] as string) : j % 2 === 0 || fromNote ? randomTicket() : (notes[rand(size.notes)] as string),
    });
  }
  // The hub's guaranteed shape.
  const linkedFromHub = Array.from({ length: 6 }, (_, k) => tickets[1000 + k] as string);
  const referencedByHub = Array.from({ length: 4 }, (_, k) => tickets[2000 + k] as string);
  linkedFromHub.forEach((target, k) => links.push([hub, target, kinds[k % 3] as string]));
  referencedByHub.forEach((target) => refs.push({ sourceKind: 'ticket', source: hub, targetKind: 'ticket', target }));
  const treeChildren = tickets.slice(40, 48);
  for (const neighbour of [...hubChildren, ...treeChildren, ...linkedFromHub, ...referencedByHub]) for (let k = 0; k < 16; k += 1) links.push([neighbour, randomTicket(), 'relates']);
  for (const note of notes.slice(0, 8)) for (let k = 0; k < 16; k += 1) refs.push({ sourceKind: 'note', source: note, targetKind: 'ticket', target: randomTicket() });

  await database.pool.query(
    `INSERT INTO proj_ticket_links (workspace_id, source_id, target_id, kind, created_by, created_at, origin, seq)
     SELECT $1, s, t, k, $5, now(), 'web', row_number() OVER () FROM unnest($2::text[], $3::text[], $4::text[]) AS x(s, t, k)
      WHERE s <> t ON CONFLICT DO NOTHING`,
    [ids.ws, links.map((l) => l[0]), links.map((l) => l[1]), links.map((l) => l[2]), ids.owner],
  );
  const ordinals = new Map<string, number>();
  const ordinal = (r: RefRow) => {
    const key = `${r.sourceKind}:${r.source}`;
    const next = ordinals.get(key) ?? 0;
    ordinals.set(key, next + 1);
    return next;
  };
  const rows = refs.map((r) => ({ ...r, ordinal: ordinal(r) }));
  await database.pool.query(
    `INSERT INTO proj_references (workspace_id, source_kind, source_id, source_parent_kind, source_parent_id, target_kind, target_id, ordinal, snippet, updated_by, updated_at, seq)
     SELECT $1, sk, s, sk, s, tk, t, o, 'see [[x]] here', $7, now(), row_number() OVER ()
       FROM unnest($2::text[], $3::text[], $4::text[], $5::text[], $6::int[]) AS x(sk, s, tk, t, o)`,
    [ids.ws, rows.map((r) => r.sourceKind), rows.map((r) => r.source), rows.map((r) => r.targetKind), rows.map((r) => r.target), rows.map((r) => r.ordinal), ids.owner],
  );
  return { ws: ids.ws, owner: ids.owner, member: ids.member, hub };
}
