import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { istDayOf, newUlid, SYSTEM_ACTOR_FLOW } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { computeScope } from '../../src/timeline/compute.js';
import { loadWorkspace } from '../../src/timeline/load.js';
import { readTimelineChunk } from '../../src/timeline/read-chunk.js';
import { readTimelineIndex } from '../../src/timeline/read-index.js';
import { readTimelineTray } from '../../src/timeline/read-tray.js';
import { MAX_PROJECTS, MAX_WORKSPACES, parseTimelineScope, readableWorkspaces, scopeKey, type TimelineScope } from '../../src/timeline/scope.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedDraft, seedTimelineWorld, type TimelineWorld } from './helpers/world.js';

/**
 * 29.296: the scope gate and what the load lets a viewer see, against a REAL database (`helpers/world.ts`). Every absence
 * asserted here reads the same scope as a viewer who is allowed to see the thing, in the same `it`.
 */

const NOW = new Date('2026-10-03T06:00:00.000Z');
let db: TestDatabase;
let w: TimelineWorld;
beforeAll(async () => {
  db = await createTestDatabase();
  w = await seedTimelineWorld(db.pool);
}, 120_000);
afterAll(async () => {
  await db.drop();
});

const scopeOf = (ws: string[], mine = false, projectIds: string[] = []): TimelineScope => ({ workspaceIds: [...ws].sort(), projectIds, mine });
async function core(viewer: string, ws: string[], mine = false, projectIds: string[] = []) {
  const scope = scopeOf(ws, mine, projectIds);
  return computeScope(db.pool, await readableWorkspaces(db.pool, viewer, scope), viewer, scope, NOW);
}
const ids = (c: Awaited<ReturnType<typeof core>>) => new Set(c.entries.map((e) => e.id));
const text = (v: unknown): string => JSON.stringify(v, (_k, x) => (x instanceof Map ? [...x] : x));
const ulids = (n: number): string[] => Array.from({ length: n }, () => newUlid());

describe('29.296 scope gate and visibility', () => {
  it('29.296 an unreadable workspace is dropped; none readable is []; control: its own member reads it', async () => {
    const scope = scopeOf([w.A.workspaceId, w.B.workspaceId, w.C.workspaceId]);
    const r = await readableWorkspaces(db.pool, w.ama, scope);
    expect(r.map((x) => x.workspaceId).sort()).toEqual([w.A.workspaceId, w.B.workspaceId].sort());
    expect(await readableWorkspaces(db.pool, w.ama, scopeOf([w.C.workspaceId]))).toEqual([]);
    expect(await readableWorkspaces(db.pool, w.cy, scopeOf([w.C.workspaceId]))).toHaveLength(1);
    expect(parseTimelineScope({ ws: '' })).toBeNull();
    expect(parseTimelineScope({})).toBeNull(); // no ws at all
    expect(parseTimelineScope({ ws: `${w.A.workspaceId}`, mine: 'maybe' })).toBeNull();
    expect(parseTimelineScope({ ws: `${w.A.workspaceId}`, mine: '1' })).toEqual({ workspaceIds: [w.A.workspaceId], projectIds: [], mine: true }); // control: the same scope with a valid mine parses
    expect(parseTimelineScope({ ws: `${w.A.workspaceId}`, mine: '0' })).toEqual({ workspaceIds: [w.A.workspaceId], projectIds: [], mine: false });
    expect(parseTimelineScope({ ws: `${w.A.workspaceId}` })).toEqual({ workspaceIds: [w.A.workspaceId], projectIds: [], mine: false }); // an omitted mine is Everyone (planner ruling 2026-10-04)
  });

  it('29.296 the lists are canonical and bounded: deduplicated, sorted, at most 20 workspaces and 200 projects; a malformed id or a repeated param is a 400', () => {
    expect(MAX_WORKSPACES).toBe(20);
    expect(MAX_PROJECTS).toBe(200);
    const [a, b] = [w.A.workspaceId, w.B.workspaceId].sort() as [string, string];
    expect(parseTimelineScope({ ws: `${b},${a},${b}`, proj: `${w.A.p2},${w.A.p1},${w.A.p2}` })).toEqual({
      workspaceIds: [a, b],
      projectIds: [w.A.p1, w.A.p2].sort(),
      mine: false,
    });
    const ws20 = ulids(20);
    expect(parseTimelineScope({ ws: ws20.join(',') })?.workspaceIds).toHaveLength(20); // control: at the bound
    expect(parseTimelineScope({ ws: [...ws20, newUlid()].join(',') })).toBeNull();
    expect(parseTimelineScope({ ws: [...ws20, ws20[0]].join(',') })?.workspaceIds).toHaveLength(20); // a duplicate is not a 21st
    const p200 = ulids(200);
    expect(parseTimelineScope({ ws: a, proj: p200.join(',') })?.projectIds).toHaveLength(200); // control: at the bound
    expect(parseTimelineScope({ ws: a, proj: [...p200, newUlid()].join(',') })).toBeNull();
    expect(parseTimelineScope({ ws: `${a},not-a-ulid` })).toBeNull();
    expect(parseTimelineScope({ ws: a, proj: 'nope' })).toBeNull();
    expect(parseTimelineScope({ ws: [a, b] })).toBeNull(); // `?ws=a&ws=b` arrives as an array
    expect(parseTimelineScope({ ws: a, proj: '' })).toEqual({ workspaceIds: [a], projectIds: [], mine: false }); // an empty proj is every project
    // the cache key of a canonical scope: two spellings of one scope are one key; Me and the projects are part of it
    const one = parseTimelineScope({ ws: `${b},${a}`, proj: `${w.A.p2},${w.A.p1}`, mine: '1' }) as TimelineScope;
    expect(scopeKey(one)).toBe(`${a},${b}|${[w.A.p1, w.A.p2].sort().join(',')}|1`);
    expect(scopeKey(parseTimelineScope({ ws: `${a},${b}`, proj: `${w.A.p1},${w.A.p2}`, mine: '1' }) as TimelineScope)).toBe(scopeKey(one));
    expect(scopeKey({ ...one, mine: false })).toBe(`${a},${b}|${[w.A.p1, w.A.p2].sort().join(',')}|0`);
  });

  it('29.296 Me = assigned OR collaborating; Everyone adds the rest', async () => {
    const me = ids(await core(w.ama, [w.A.workspaceId], true));
    expect(me.has(w.t.mine)).toBe(true);
    expect(me.has(w.t.collab)).toBe(true); // collaborator only: the Review Focus line
    expect(me.has(w.t.other)).toBe(false); // assigned to bo, ama not on it
    const everyone = ids(await core(w.ama, [w.A.workspaceId], false));
    expect(everyone.has(w.t.other)).toBe(true); // control
  });

  it("29.296 a project narrowing: the project's tickets are items, another project's are not, and a flow with no member in scope is not served", async () => {
    const p1 = await core(w.ama, [w.A.workspaceId], false, [w.A.p1]);
    expect(ids(p1).has(w.t.dated)).toBe(true);
    expect(ids(p1).has(w.t.fStart)).toBe(false); // the diamond is project 2's
    expect(p1.flows.some((f) => f.nodes.some((n) => n.id === w.t.fStart))).toBe(false);
    const p2 = await core(w.ama, [w.A.workspaceId], false, [w.A.p2]);
    expect(ids(p2).has(w.t.fStart)).toBe(true); // control: its own project lists it
    expect(ids(p2).has(w.t.dated)).toBe(false);
  });

  it('29.296 a hidden ticket is a hole: bo sees two flows-of-one, ama sees one flow of three', async () => {
    const bo = await core(w.bo, [w.A.workspaceId]);
    expect(text(bo)).not.toContain(w.t.hidden);
    expect(bo.entries.find((e) => e.id === w.t.step1)?.flowId).toBeNull();
    expect(bo.entries.find((e) => e.id === w.t.step2)?.flowId ?? null).toBeNull();
    const ama = await core(w.ama, [w.A.workspaceId]);
    const f = ama.flows.find((x) => x.nodes.some((n) => n.id === w.t.hidden));
    expect(f?.nodes.map((n) => n.id).sort()).toEqual([w.t.step1, w.t.hidden, w.t.step2].sort()); // control: the owner sees it whole
    // the load itself keeps no edge to the hole: the assembler would drop one anyway, so only this leg sees a leak in load.ts
    const loadAs = async (who: string) =>
      loadWorkspace(db.pool, await resolveEffectiveRole(db.pool, who, w.A.workspaceId), who, w.A.workspaceId, scopeOf([w.A.workspaceId]));
    expect(text((await loadAs(w.bo)).edges)).not.toContain(w.t.hidden);
    expect((await loadAs(w.ama)).edges.some((e) => e.to === w.t.hidden)).toBe(true); // control: the owner's load has it
  });

  it('29.296 the diamond chains: Yes and No both start the day after the decision ends', async () => {
    const a = await core(w.ama, [w.A.workspaceId]);
    const seg = (id: string) => a.entries.find((e) => e.id === id)?.segments[0];
    expect(seg(w.t.fStart)).toMatchObject({ start: '2026-10-05', end: '2026-10-07' });
    expect(seg(w.t.fDec)).toMatchObject({ start: '2026-10-08', end: '2026-10-08' });
    expect(seg(w.t.fYes)?.start).toBe('2026-10-09');
    expect(seg(w.t.fNo)?.start).toBe('2026-10-09');
  });

  it("29.296 a draft is its author's alone: ama's core carries her draft with no key, bo's never names it; her deleted draft is gone", async () => {
    // (planner ruling 2026-10-04): mandatory (spec CR-2 :663 "private to its author, with no key").
    const draftId = await seedDraft(db.pool, { id: w.t.draft, authorId: w.ama, workspaceId: w.A.workspaceId, projectId: w.A.p1, title: 'Draft step', explicitStart: '2026-10-06', estimate: 1 });
    const goneId = await seedDraft(db.pool, { authorId: w.ama, workspaceId: w.A.workspaceId, projectId: w.A.p1, title: 'Deleted draft', explicitStart: '2026-10-06', estimate: 1 });
    await applyCommitted(db.pool, [makeCommitted({ workspaceId: w.A.workspaceId, actorId: w.ama, entity: { kind: 'ticket', id: goneId }, type: 'ticket.deleted', payload: {} })]);
    const ama = await core(w.ama, [w.A.workspaceId], false);
    expect(ama.entries.find((e) => e.id === draftId)).toMatchObject({ draft: true, key: null });
    expect(ama.entries.find((e) => e.id === w.t.dated)?.key).not.toBeNull(); // control: a published ticket keeps its key
    expect(text(ama)).not.toContain(goneId); // `listMyDrafts` still lists it; the row fetch drops it (control: draftId, same shape, is there)
    const bo = await core(w.bo, [w.A.workspaceId], false);
    expect(text(bo)).not.toContain(draftId);
    expect(bo.entries.some((e) => e.id === w.t.dated)).toBe(true); // control: bo's core is loaded, so the absence is the draft's privacy

    // a draft is narrowed like any ticket: Me = assigned OR collaborating, and the project list
    const assigned = await seedDraft(db.pool, { authorId: w.ama, workspaceId: w.A.workspaceId, projectId: w.A.p1, title: 'My draft, assigned', explicitStart: '2026-10-06', estimate: 1, assigneeId: w.ama });
    const collab = await seedDraft(db.pool, { authorId: w.ama, workspaceId: w.A.workspaceId, projectId: w.A.p1, title: 'My draft, collaborating', explicitStart: '2026-10-06', estimate: 1, assigneeId: w.bo });
    await applyCommitted(db.pool, [makeCommitted({ workspaceId: w.A.workspaceId, actorId: w.ama, entity: { kind: 'ticket', id: collab }, type: 'ticket.collaborator_added', payload: { userId: w.ama } })]);
    const me = ids(await core(w.ama, [w.A.workspaceId], true));
    expect(me.has(assigned)).toBe(true);
    expect(me.has(collab)).toBe(true);
    expect(me.has(draftId)).toBe(false); // nobody's: out of Me
    expect(ids(await core(w.ama, [w.A.workspaceId], false, [w.A.p2])).has(draftId)).toBe(false); // project 1's draft under project 2
    expect(ids(await core(w.ama, [w.A.workspaceId], false, [w.A.p1])).has(draftId)).toBe(true); // control
  });

  it('29.296 a ticket whose workflow version the load cannot fold is a loud error, not a silent hole; control: restored, the read answers', async () => {
    const [{ workflow_version: was }] = (await db.pool.query<{ workflow_version: number }>('SELECT workflow_version FROM proj_tickets WHERE ticket_id = $1', [w.t.other])).rows as [{ workflow_version: number }];
    await db.pool.query('UPDATE proj_tickets SET workflow_version = 99 WHERE ticket_id = $1', [w.t.other]);
    let failure: unknown = null;
    try {
      await core(w.ama, [w.A.workspaceId]);
    } catch (e) {
      failure = e;
    } finally {
      await db.pool.query('UPDATE proj_tickets SET workflow_version = $2 WHERE ticket_id = $1', [w.t.other, was]);
    }
    expect((failure as Error | null)?.message).toBe(
      `loadWorkspace: no workflow definition ${w.A.wf}@99 for ticket ${w.t.other}; the projection and the ledger disagree`,
    );
    expect(ids(await core(w.ama, [w.A.workspaceId])).has(w.t.other)).toBe(true);
  });
});

describe('29.296 the trash is not loaded: a deleted ticket and a deleted project\'s ticket are in no body', () => {
  it('29.296 a deleted published ticket (a flow member) and a ticket of a deleted project leave index, chunk and tray; control: before, both are there', async () => {
    const A = w.A.workspaceId;
    const [Z, X, Y, U, p9] = [newUlid(), newUlid(), newUlid(), newUlid(), newUlid()];
    const ev = (entity: { kind: 'ticket' | 'project'; id: string }, type: string, payload: Record<string, unknown>) =>
      makeCommitted({ workspaceId: A, actorId: w.ama, entity, type, payload });
    await applyCommitted(db.pool, [
      ev({ kind: 'ticket', id: Z }, 'ticket.created', { typeId: 'task', projectId: w.A.p1, parentId: null, title: 'Before the bin', startDate: { date: '2026-10-15' }, estimate: 1 }),
      ev({ kind: 'ticket', id: X }, 'ticket.created', { typeId: 'task', projectId: w.A.p1, parentId: null, title: 'Binned', estimate: 1 }),
      ev({ kind: 'ticket', id: Z }, 'ticket.link_added', { kind: 'leads_to', targetId: X }),
      ev({ kind: 'project', id: p9 }, 'project.created', { name: 'Binned project' }),
      ev({ kind: 'project', id: p9 }, 'project.member_added', { userId: w.ama, projectAdmin: true }),
      ev({ kind: 'ticket', id: Y }, 'ticket.created', { typeId: 'task', projectId: p9, parentId: null, title: 'In the binned project', startDate: { date: '2026-10-15' }, estimate: 1 }),
      ev({ kind: 'ticket', id: U }, 'ticket.created', { typeId: 'task', projectId: p9, parentId: null, title: 'Undated in the binned project' }),
    ]);
    const bodies = async () => {
      const scope = scopeOf([A]);
      const readable = await readableWorkspaces(db.pool, w.ama, scope);
      return JSON.stringify([
        await readTimelineIndex(db.pool, readable, w.ama, scope, NOW),
        await readTimelineChunk(db.pool, readable, w.ama, scope, NOW, { from: '2026-08-01', to: '2026-12-31' }),
        await readTimelineTray(db.pool, readable, w.ama, scope, NOW),
      ]);
    };
    const before = await bodies();
    for (const id of [X, Y, U]) expect(before).toContain(id); // control: live, all three are drawn or trayed
    await applyCommitted(db.pool, [ev({ kind: 'ticket', id: X }, 'ticket.deleted', {}), ev({ kind: 'project', id: p9 }, 'project.deleted', {})]);
    const after = await bodies();
    for (const id of [X, Y, U]) expect(after).not.toContain(id);
    expect(after).toContain(Z); // control: its live predecessor is still read
  });
});

describe('29.296 a hidden Decision is never named (PTR privacy rule)', () => {
  // D is a Decision only ama sees. T (undated) is reached by D's labelled outcome; N was closed by the flow as D's branch not taken.
  // bo sees T and N, never D: no response he gets may carry D's id, though N's resolution and T's reachedBy point at it.
  const D = newUlid();
  const T = newUlid();
  const N = newUlid();
  /** S -> Q: Q is ama's, S is nobody's, so under her Me S is a flow member out of scope (it rides `flows`). */
  const S = newUlid();
  const Q = newUlid();
  const WINDOW = { from: '2026-08-01', to: '2026-12-31' };
  const reads = async (viewer: string, mine = false) => {
    const scope = scopeOf([w.A.workspaceId], mine);
    const readable = await readableWorkspaces(db.pool, viewer, scope);
    return {
      index: await readTimelineIndex(db.pool, readable, viewer, scope, NOW),
      chunk: await readTimelineChunk(db.pool, readable, viewer, scope, NOW, WINDOW),
      tray: await readTimelineTray(db.pool, readable, viewer, scope, NOW),
    };
  };

  beforeAll(async () => {
    const A = w.A.workspaceId;
    const ev = (id: string, type: string, payload: Record<string, unknown>, actorId = w.ama) =>
      makeCommitted({ workspaceId: A, actorId, entity: { kind: 'ticket', id }, type, payload });
    const notTaken = { kind: 'branch-not-taken', decisionTicketId: D, outcome: 'Stop', pass: 1, decidedBy: w.ama, decisionEventId: newUlid() };
    await applyCommitted(db.pool, [
      ev(D, 'ticket.created', { typeId: 'decision', projectId: w.A.p2, parentId: null, title: 'Secret call', startDate: { date: '2026-10-14' }, estimate: 1, assigneeId: w.ama }),
      ev(D, 'visibility.set', { ticketId: D, mode: 'explicit', userIds: [w.ama] }),
      ev(T, 'ticket.created', { typeId: 'task', projectId: w.A.p2, parentId: null, title: 'Go ahead' }),
      ev(N, 'ticket.created', { typeId: 'task', projectId: w.A.p2, parentId: null, title: 'Stopped', assigneeId: w.bo }),
      ev(D, 'ticket.link_added', { kind: 'leads_to', targetId: T, label: 'Go' }),
      ev(D, 'ticket.link_added', { kind: 'leads_to', targetId: N, label: 'Stop' }),
      ev(N, 'ticket.link_added', { kind: 'blocks', targetId: T }),
      ev(S, 'ticket.created', { typeId: 'task', projectId: w.A.p1, parentId: null, title: 'Source', startDate: { date: '2026-10-20' }, estimate: 1 }),
      ev(Q, 'ticket.created', { typeId: 'task', projectId: w.A.p1, parentId: null, title: 'Mine after', estimate: 1, assigneeId: w.ama }),
      ev(S, 'ticket.link_added', { kind: 'leads_to', targetId: Q }),
      // the settle's "Not taken": the state moves to Done and the close flag carries the cause (`ticketClosedPayload`, wtg2 T8)
      // as the settle moves it (`settle.ts`): the transition carries the cause too, so it opens no period (PS-8) and N never started
      ev(N, 'ticket.transitioned', { to: 'done', cause: notTaken }, SYSTEM_ACTOR_FLOW),
      ev(N, 'ticket.closed', { cause: notTaken }, SYSTEM_ACTOR_FLOW),
    ]);
  });

  it('29.296 a blind viewer: no index, chunk or tray body carries the Decision id or its outcome (planner ruling 2026-10-06 05:46); the resolution keeps its kind and pass; control: the seeing viewer gets both', async () => {
    const bo = await reads(w.bo);
    // the subjects are there, so an absent id is the blanking, not a missing row
    expect(bo.index.items.find((e) => e.id === N)?.resolution).toStrictEqual({ kind: 'not-taken', decisionTicketId: null, pass: 1 });
    expect(bo.chunk.items.some((d) => d.id === N)).toBe(true);
    // N never started: its one segment is the stub on its close day (D-W4-11), read from the row the load folds
    const { rows: [closedRow] } = await db.pool.query<{ closed_at: Date }>('SELECT closed_at FROM proj_tickets WHERE ticket_id = $1', [N]);
    const closeDay = istDayOf((closedRow as { closed_at: Date }).closed_at.toISOString());
    expect(bo.index.items.find((e) => e.id === N)?.segments).toEqual([{ start: closeDay, end: closeDay, pass: 1, type: 'stub' }]);
    expect(bo.tray.items.find((r) => r.id === T)).toMatchObject({ reachedBy: null });
    expect(JSON.stringify(bo.index)).not.toContain(D);
    expect(JSON.stringify(bo.chunk)).not.toContain(D);
    expect(JSON.stringify(bo.tray)).not.toContain(D);
    for (const body of [bo.index, bo.chunk, bo.tray]) expect(JSON.stringify(body)).not.toContain('"Stop"'); // D's outcome, its branch name
    // Me: N is bo's, the scope narrows, and the answer is still blind
    const boMe = await reads(w.bo, true);
    expect(boMe.index.items.find((e) => e.id === N)?.resolution).toStrictEqual({ kind: 'not-taken', decisionTicketId: null, pass: 1 });
    expect(JSON.stringify(boMe)).not.toContain(D);
    expect(JSON.stringify(boMe)).not.toContain('"Stop"');

    const ama = await reads(w.ama);
    expect(ama.index.items.find((e) => e.id === N)?.resolution).toEqual({ kind: 'not-taken', decisionTicketId: D, outcome: 'Stop', pass: 1 });
    expect(JSON.stringify(ama.index)).toContain('"Stop"'); // control: the haystack holds its subject
    const flow = ama.index.flows.find((f) => f.nodes.some((n) => n.id === N));
    expect(flow?.nodes.find((n) => n.id === N)?.notTaken).toMatchObject({ decisionTicketId: D });
    expect(flow?.edges).toContainEqual({ from: N, to: T, kind: 'blocks', label: null }); // a blocks link between two members rides the flow
    expect(ama.chunk.items.some((d) => d.id === D)).toBe(true);
    expect(ama.tray.items.find((r) => r.id === T)?.reachedBy).toMatchObject({ decisionTicketId: D, outcome: 'Go' });
    // ama under Me: D is hers, N is bo's and out of her scope, yet N rides D's flow with the id she may see
    const amaMe = await reads(w.ama, true);
    expect(amaMe.index.flows.find((f) => f.nodes.some((n) => n.id === N))?.nodes.find((n) => n.id === N)?.notTaken).toMatchObject({ decisionTicketId: D });
    // the load admits an out-of-scope SOURCE as well as a target: S is nobody's, Q is hers
    expect(amaMe.index.flows.find((f) => f.nodes.some((n) => n.id === Q))?.nodes.map((n) => n.id).sort()).toEqual([S, Q].sort());
    expect(amaMe.index.items.some((e) => e.id === S)).toBe(false);
  });

  it('29.296 out of scope, the load admits a ticket only as a FLOW member: two tickets joined by a blocks link alone stay unloaded; control: in scope both load, and the diamond loads out of scope through its leads_to links', async () => {
    const [X1, X2] = [newUlid(), newUlid()];
    const A = w.A.workspaceId;
    const mk = (id: string, type: string, payload: Record<string, unknown>) => makeCommitted({ workspaceId: A, actorId: w.ama, entity: { kind: 'ticket', id }, type, payload });
    await applyCommitted(db.pool, [
      mk(X1, 'ticket.created', { typeId: 'task', projectId: w.A.p1, parentId: null, title: 'Blocker' }),
      mk(X2, 'ticket.created', { typeId: 'task', projectId: w.A.p1, parentId: null, title: 'Blocked' }),
      mk(X1, 'ticket.link_added', { kind: 'blocks', targetId: X2 }),
    ]);
    const eff = await resolveEffectiveRole(db.pool, w.ama, A);
    const loadIn = async (projectIds: string[]) => new Map((await loadWorkspace(db.pool, eff, w.ama, A, scopeOf([A], false, projectIds))).tickets.map((t) => [t.id, t.inScope]));
    const p2 = await loadIn([w.A.p2]);
    expect(p2.has(X1) || p2.has(X2)).toBe(false);
    const p1 = await loadIn([w.A.p1]);
    expect([p1.get(X1), p1.get(X2)]).toEqual([true, true]); // control: in scope, both load
    expect(p1.get(w.t.fStart)).toBe(false); // control: out of scope, a flow member loads (inScope false)
  });
});
