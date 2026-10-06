import type { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { membershipId, newUlid, TIMELINE_CHUNK_DAYS, TIMELINE_FLOW_CAP, TIMELINE_INDEX_CAP, TIMELINE_PAGE_SIZE } from '@gisik-nokma/domain';
import type { Queryable } from '../../src/db/queryable.js';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { readHome } from '../../src/routes/home.js';
import { readStreamSeq } from '../../src/sync/stream-seq.js';
import { DEFAULT_LIMITS } from '../../src/timeline/assemble.js';
import { readTimelineChunk } from '../../src/timeline/read-chunk.js';
import { readTimelineIndex } from '../../src/timeline/read-index.js';
import { readHomeSummary } from '../../src/timeline/read-summary.js';
import { readTimelineTray } from '../../src/timeline/read-tray.js';
import { readableWorkspaces, type TimelineScope } from '../../src/timeline/scope.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { insertUser, seedTimelineWorld, type TimelineWorld } from './helpers/world.js';

/**
 * 29.293's cap leg lowers `HOME_ID_CAP` for the calls inside it, so the six id lists are longer than the cap without
 * seeding 2,001 tickets; every other leg reads the real one (`homeCap.value` is undefined outside that leg).
 */
const homeCap = vi.hoisted(() => ({ value: undefined as number | undefined }));
vi.mock('@gisik-nokma/domain', async (importOriginal) => {
  const real = await importOriginal<typeof import('@gisik-nokma/domain')>();
  return {
    ...real,
    get HOME_ID_CAP() {
      return homeCap.value ?? real.HOME_ID_CAP;
    },
  };
});

/**
 * 29.299 (the index, chunk and tray slice one core) and 29.293 (Home's numbers over a scope, and `asOf`) on
 * `seedTimelineWorld`, plus, filed here: three undated tickets in A (the tray has pages), a workspace-level note
 * (`home_project_id = ''`) and a note homed in A.p2, `gus`, a GUEST in C who owns a fifth workspace D, and in B two tickets
 * whose ids are minted BEFORE the world's (an undated one and a dated one: across workspaces the merged order is not the
 * concatenation) and three due dates that interleave A's across the workspaces (B 10-05, B 09-10, A 09-20), and a
 * workspace-level note in B that ama sees as B's member (so a sum over the workspaces is not A's alone).
 */
/**
 * B's two early ids carry a time prefix below every id minted in this run, so they are the earliest by construction. Minted
 * with `newUlid()` they shared a millisecond with `due.*` and the rest, and their order was the random part (the 1882524a
 * flake: `due.bSoon` sorted first).
 */
const early = (): string => `00${newUlid().slice(2)}`;
const earlyUndated = early();
const earlyDated = early();

const NOW = new Date('2026-10-03T06:00:00.000Z');
let db: TestDatabase;
let w: TimelineWorld;
const undated: string[] = [newUlid(), newUlid(), newUlid()];
const notes = { ws: newUlid(), p2: newUlid(), b: newUlid() };
const due = { bSoon: newUlid(), bPast: newUlid(), aPast: newUlid() };
const gus = newUlid();
const D = newUlid();

beforeAll(async () => {
  db = await createTestDatabase();
  w = await seedTimelineWorld(db.pool);
  await insertUser(db.pool, gus, 'Gus');
  const A = w.A.workspaceId;
  await applyCommitted(db.pool, [
    ...undated.map((id, i) =>
      makeCommitted({ workspaceId: A, actorId: w.ama, entity: { kind: 'ticket', id }, type: 'ticket.created', payload: { typeId: 'task', projectId: w.A.p1, parentId: null, title: `Undated ${i}` } }),
    ),
    makeCommitted({ workspaceId: A, actorId: w.ama, entity: { kind: 'note', id: notes.ws }, type: 'note.created', payload: { title: 'Workspace-level', homeProjectId: '', scope: { mode: 'workspace' } } }),
    makeCommitted({ workspaceId: A, actorId: w.ama, entity: { kind: 'note', id: notes.p2 }, type: 'note.created', payload: { title: 'Website note', homeProjectId: w.A.p2, scope: { mode: 'workspace' } } }),
    makeCommitted({ workspaceId: w.B.workspaceId, actorId: w.bo, entity: { kind: 'note', id: notes.b }, type: 'note.created', payload: { title: 'B note', homeProjectId: '', scope: { mode: 'workspace' } } }),
    makeCommitted({ workspaceId: w.C.workspaceId, actorId: w.cy, entity: { kind: 'membership', id: membershipId(w.C.workspaceId, gus) }, type: 'membership.granted', payload: { userId: gus, role: 'guest' } }),
    makeCommitted({ workspaceId: D, actorId: gus, entity: { kind: 'workspace', id: D }, type: 'workspace.created', payload: { name: 'D' } }),
    makeCommitted({ workspaceId: D, actorId: gus, entity: { kind: 'membership', id: membershipId(D, gus) }, type: 'membership.granted', payload: { userId: gus, role: 'owner' } }),
    ...(
      [
        [w.B, earlyUndated, 'Early, undated', {}],
        [w.B, earlyDated, 'Early, dated', { startDate: { date: '2026-10-06' }, estimate: 1 }],
        [w.B, due.bSoon, 'B due soon', { dueDate: { date: '2026-10-05' } }],
        [w.B, due.bPast, 'B past due', { dueDate: { date: '2026-09-10' } }],
        [w.A, due.aPast, 'A past due', { dueDate: { date: '2026-09-20' } }],
      ] as const
    ).map(([ws, id, title, extra]) =>
      makeCommitted({ workspaceId: ws.workspaceId, actorId: w.bo, entity: { kind: 'ticket', id }, type: 'ticket.created', payload: { typeId: 'task', projectId: ws.p1, parentId: null, title, ...extra } }),
    ),
  ]);
}, 120_000);
afterAll(async () => {
  await db.drop();
});

const scopeOf = (ws: string[], o: { mine?: boolean; projectIds?: string[] } = {}): TimelineScope => ({
  workspaceIds: [...ws].sort(),
  projectIds: o.projectIds ?? [],
  mine: o.mine ?? false,
});
const readable = (viewer: string, scope: TimelineScope, pool: Queryable = db.pool) => readableWorkspaces(pool, viewer, scope);
const index = async (viewer: string, scope: TimelineScope, pool: Queryable = db.pool) => readTimelineIndex(pool, await readable(viewer, scope), viewer, scope, NOW);
const summary = async (viewer: string, scope: TimelineScope, pool: Queryable = db.pool) => readHomeSummary(pool, await readable(viewer, scope), viewer, scope, NOW);
const chunk = async (viewer: string, scope: TimelineScope, window: { from: string; to: string }, cursor?: string, pageSize?: number) =>
  readTimelineChunk(db.pool, await readable(viewer, scope), viewer, scope, NOW, window, cursor, pageSize);
const tray = async (viewer: string, scope: TimelineScope, cursor?: string, pageSize?: number) =>
  readTimelineTray(db.pool, await readable(viewer, scope), viewer, scope, NOW, cursor, pageSize);
const home = async (viewer: string, workspaceId: string) => readHome(db.pool, await resolveEffectiveRole(db.pool, viewer, workspaceId), viewer, workspaceId, NOW);
const head = (workspaceId: string) => readStreamSeq(db.pool, workspaceId);

/** Every page of a keyset read, in order; fails on a page that does not move the cursor forward. */
async function allPages<T extends { id: string }>(read: (cursor?: string) => Promise<{ items: T[]; nextCursor: string | null }>): Promise<T[][]> {
  const pages: T[][] = [];
  let cursor: string | undefined;
  for (let n = 0; n < 50; n += 1) {
    const page = await read(cursor);
    pages.push(page.items);
    if (page.nextCursor === null) return pages;
    expect(page.nextCursor).toBe(page.items[page.items.length - 1]?.id);
    cursor = page.nextCursor;
  }
  throw new Error('allPages: more than 50 pages');
}

describe('29.299 the index, chunk and tray slice one core', () => {
  it('29.299 the constants are the spec literals', () => {
    expect([TIMELINE_INDEX_CAP, TIMELINE_FLOW_CAP, TIMELINE_CHUNK_DAYS, TIMELINE_PAGE_SIZE]).toEqual([10_000, 300, 28, 200]);
    expect(DEFAULT_LIMITS).toEqual({ index: 10_000, flow: 300 });
  });

  it('29.299 the index answers the whole shape; the tray count equals the tray read across pages, with reasons', async () => {
    const scope = scopeOf([w.A.workspaceId]);
    const idx = await index(w.ama, scope);
    expect(Object.keys(idx).sort()).toEqual(['asOf', 'flows', 'items', 'today', 'tray', 'truncated']);
    expect(idx.today).toBe('2026-10-03');
    expect(idx.truncated).toBeNull();
    const pages = await allPages((cursor) => tray(w.ama, scope, cursor, 2));
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.slice(0, -1).every((p) => p.length === 2)).toBe(true);
    const rows = pages.flat();
    expect(rows.map((r) => r.id)).toEqual([...rows.map((r) => r.id)].sort()); // id order, every row once
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length);
    expect(idx.tray.count).toBe(rows.length);
    expect(rows.map((r) => r.id)).toEqual((await tray(w.ama, scope)).items.map((r) => r.id)); // the pages' union is the unpaged read
    expect(rows.filter((r) => undated.includes(r.id)).map((r) => r.reason)).toEqual(['no-dates', 'no-dates', 'no-dates']);
    expect(idx.today).toBe('2026-10-03');
    // today is the IST day: 19:00Z is already the 4th in India
    expect((await readTimelineIndex(db.pool, await readable(w.ama, scope), w.ama, scope, new Date('2026-10-03T19:00:00.000Z'))).today).toBe('2026-10-04');
    // the last page boundary: a page size of exactly the total has no next page; one less has one
    expect((await tray(w.ama, scope, undefined, rows.length)).nextCursor).toBeNull();
    expect((await tray(w.ama, scope, undefined, rows.length - 1)).nextCursor).toBe(rows[rows.length - 2]?.id);
  });

  it("29.299 across workspaces the tray and the chunk page in ONE id order: B's earlier id is neither skipped nor out of place", async () => {
    const scope = scopeOf([w.A.workspaceId, w.B.workspaceId]);
    const rows = (await allPages((cursor) => tray(w.ama, scope, cursor, 2))).flat().map((r) => r.id);
    expect(rows.filter((id) => id === earlyUndated)).toHaveLength(1);
    expect(rows).toEqual([...rows].sort());
    expect(rows).toHaveLength((await index(w.ama, scope)).tray.count);
    const items = (await chunk(w.ama, scope, { from: '2026-10-05', to: '2026-10-11' })).items.map((d) => d.id);
    expect(items[0]).toBe(earlyDated);
    expect(items).toEqual([...items].sort());
  });

  it('29.299 a chunk is the details of the entries overlapping its window, in id order, paged by keyset; control: a window with no overlap is []', async () => {
    const scope = scopeOf([w.A.workspaceId]);
    const win = { from: '2026-10-05', to: '2026-10-11' };
    const all = (await chunk(w.ama, scope, win)).items;
    const allIds = all.map((d) => d.id);
    for (const id of [w.t.dated, w.t.mine, w.t.fStart]) expect(allIds).toContain(id);
    expect(allIds).not.toContain(w.t.bTask); // workspace B is in scope only when listed
    expect(allIds).not.toContain(w.t.step1); // 10-12: after the window
    expect(allIds).toEqual([...allIds].sort());
    expect(all.find((d) => d.id === w.t.dated)).toMatchObject({ title: 'Dated', stateName: 'To do', dueDate: '2026-10-07', basis: 'explicit' });
    const pages = await allPages((cursor) => chunk(w.ama, scope, win, cursor, 2));
    expect(pages[0]).toHaveLength(2);
    expect(pages.length).toBe(Math.ceil(all.length / 2));
    expect(pages.flat().map((d) => d.id)).toEqual(allIds); // page 2 starts after page 1; the union is the unpaged read
    expect((await chunk(w.ama, scope, win, undefined, all.length)).nextCursor).toBeNull();
    expect((await chunk(w.ama, scope, win, undefined, all.length - 1)).nextCursor).toBe(allIds[allIds.length - 2]);
    expect(await chunk(w.ama, scope, { from: '2026-12-01', to: '2026-12-28' })).toEqual({ items: [], nextCursor: null });
    expect((await chunk(w.ama, scopeOf([w.A.workspaceId, w.B.workspaceId]), win)).items.map((d) => d.id)).toContain(w.t.bTask); // control: listed, B is read
  });

  it("29.299 the overlap is inclusive at both edges of the window (dated is planned 2026-10-05 to 2026-10-07)", async () => {
    const scope = scopeOf([w.A.workspaceId]);
    const has = async (from: string, to: string) => (await chunk(w.ama, scope, { from, to })).items.some((d) => d.id === w.t.dated);
    expect(await has('2026-09-28', '2026-10-05')).toBe(true); // to = its start
    expect(await has('2026-09-28', '2026-10-04')).toBe(false);
    expect(await has('2026-10-07', '2026-10-20')).toBe(true); // from = its end
    expect(await has('2026-10-08', '2026-10-20')).toBe(false);
  });

  it('29.299 / 29.293 asOf is each readable workspace head, read before the load; an event in B raises only B, by one', async () => {
    const scope = scopeOf([w.A.workspaceId, w.B.workspaceId, w.C.workspaceId]);
    const [a0, b0] = [await head(w.A.workspaceId), await head(w.B.workspaceId)];
    expect(a0).toBeGreaterThan(0);
    const want0 = { [w.A.workspaceId]: a0, [w.B.workspaceId]: b0 }; // no key for C: ama cannot read it
    expect((await index(w.ama, scope)).asOf).toEqual(want0);
    expect((await summary(w.ama, scope)).asOf).toEqual(want0);
    await applyCommitted(db.pool, [
      makeCommitted({ workspaceId: w.B.workspaceId, actorId: w.bo, entity: { kind: 'ticket', id: w.t.bTask }, type: 'ticket.field_set', payload: { fieldId: 'title', value: 'B task, renamed' } }),
    ]);
    const want1 = { [w.A.workspaceId]: a0, [w.B.workspaceId]: b0 + 1 };
    expect((await index(w.ama, scope)).asOf).toEqual(want1);
    expect((await summary(w.ama, scope)).asOf).toEqual(want1);

    // the ORDER (D-W4-23): the stream head is read before any ticket row
    for (const read of [index, summary]) {
      const log: string[] = [];
      const recording = new Proxy(db.pool, {
        get(target, prop, receiver) {
          if (prop !== 'query') return Reflect.get(target, prop, receiver);
          return (text: unknown, values?: unknown[]) => {
            log.push(typeof text === 'string' ? text : String((text as { text?: string }).text));
            return (target.query as (t: unknown, v?: unknown[]) => unknown)(text, values);
          };
        },
      }) as Pool;
      await read(w.ama, scopeOf([w.A.workspaceId, w.B.workspaceId]), recording);
      const seq = log.findIndex((q) => q.includes('max(workspace_seq)'));
      const tickets = log.findIndex((q) => q.includes('proj_tickets'));
      expect(seq).toBeGreaterThanOrEqual(0); // both found, so the comparison cannot pass on a missing query
      expect(tickets).toBeGreaterThanOrEqual(0);
      expect(seq).toBeLessThan(tickets);
    }
  });
});

describe("29.293 Home's numbers over a scope", () => {
  const pick = (s: { counts: unknown; ids: unknown }) => ({ counts: s.counts, ids: s.ids });

  it('29.293 one readable workspace, unnarrowed, is readHome exactly; several sum tickets and count each person once; an unreadable one is dropped', async () => {
    const [hA, hB] = [await home(w.ama, w.A.workspaceId), await home(w.ama, w.B.workspaceId)];
    const one = await summary(w.ama, scopeOf([w.A.workspaceId]));
    expect(pick(one)).toEqual(pick(hA));
    expect(one.dueSoonDays).toEqual({ [w.A.workspaceId]: hA.dueSoonDays });
    expect(one.workspaceIds).toEqual([w.A.workspaceId]);
    expect(one.generatedAt).toBe(NOW.toISOString());

    const two = await summary(w.ama, scopeOf([w.A.workspaceId, w.B.workspaceId]));
    expect(two.counts.tickets).toBe(hA.counts.tickets + hB.counts.tickets);
    expect(two.counts.notes).toBe(hA.counts.notes + hB.counts.notes);
    expect(hB.counts.notes).toBeGreaterThan(0); // control: B holds a note ama sees, so the sum is not A's alone
    expect(two.ids.notes).toEqual(expect.arrayContaining([notes.ws, notes.b])); // each workspace's notes, not the first one's
    expect(two.dueSoonDays).toEqual({ [w.A.workspaceId]: hA.dueSoonDays, [w.B.workspaceId]: hB.dueSoonDays });
    expect(two.counts.members).toBe(2); // ama and bo are in both: distinct people, not 4
    expect((hA.counts.members ?? 0) + (hB.counts.members ?? 0)).toBe(4); // control: the per-workspace sum differs
    expect([...two.ids.members].sort()).toEqual([w.ama, w.bo].sort());
    expect(two.ids.tickets).toEqual([...two.ids.tickets].sort().reverse()); // newest first across workspaces
    expect(two.ids.open).toEqual([...two.ids.open].sort().reverse()); // open: newest first across workspaces too
    expect(two.ids.open).not.toEqual([...hA.ids.open, ...hB.ids.open]); // control: A's then B's is another order
    expect(two.ids.dueSoon).toEqual([due.bSoon, w.t.dated]); // by day across workspaces (B's 10-05 before A's 10-07)
    expect(two.ids.pastDue).toEqual([due.bPast, due.aPast]); // 09-10 (B) before 09-20 (A)

    expect(await summary(w.ama, scopeOf([w.A.workspaceId, w.B.workspaceId, w.C.workspaceId]))).toEqual(two); // C is not ama's: dropped, no key anywhere
  });

  it('29.293 Me narrows tickets, not members or notes; a project narrowing keeps a workspace-level note and drops one homed elsewhere', async () => {
    const ws = [w.A.workspaceId, w.B.workspaceId];
    const everyone = await summary(w.ama, scopeOf(ws));
    const me = await summary(w.ama, scopeOf(ws, { mine: true }));
    expect(me.counts.tickets).toBeLessThan(everyone.counts.tickets);
    expect(me.ids.tickets).toContain(w.t.collab); // Me is assigned OR collaborating, here too
    expect(me.ids.tickets).toContain(w.t.mine); // assigned to ama, no collaboration: the assignee half
    expect(me.ids.tickets).not.toContain(w.t.other);
    expect(me.counts.members).toBe(everyone.counts.members);
    expect(me.counts.notes).toBe(everyone.counts.notes);

    expect(everyone.ids.notes).toEqual(expect.arrayContaining([notes.ws, notes.p2])); // control: unnarrowed, both count
    const p1 = await summary(w.ama, scopeOf([w.A.workspaceId], { projectIds: [w.A.p1] }));
    expect(p1.ids.notes).toContain(notes.ws); // home_project_id = '': no project, so no project narrowing drops it
    expect(p1.ids.notes).not.toContain(notes.p2);
    expect(p1.ids.tickets).toContain(w.t.dated);
    expect(p1.ids.tickets).not.toContain(w.t.fStart); // A.p2
  });

  it('29.293 each id list is the first HOME_ID_CAP ids of the MERGED order and the counts are taken before the cap; readHome caps the same six (the cap lowered)', async () => {
    const ws = [w.A.workspaceId, w.B.workspaceId];
    const keys = ['tickets', 'open', 'pastDue', 'dueSoon', 'members', 'notes'] as const;
    const full = await summary(w.ama, scopeOf(ws));
    const fullHome = await home(w.ama, w.A.workspaceId);
    let capped: typeof full;
    let cappedHome: typeof fullHome;
    try {
      homeCap.value = 1;
      capped = await summary(w.ama, scopeOf(ws));
      homeCap.value = 0;
      cappedHome = await home(w.ama, w.A.workspaceId);
    } finally {
      homeCap.value = undefined;
    }
    for (const k of keys) {
      expect(full.ids[k].length, k).toBeGreaterThan(1); // control: every merged list is longer than the lowered cap
      expect(capped.ids[k], k).toEqual(full.ids[k].slice(0, 1));
      expect(fullHome.ids[k].length, k).toBeGreaterThan(0); // control: none of A's own lists is empty
      expect(cappedHome.ids[k], k).toEqual([]);
    }
    expect(capped.counts).toEqual(full.counts);
    expect(cappedHome.counts).toEqual(fullHome.counts);
  });

  it('29.293 members is null only when every readable workspace withholds its roster (a guest everywhere); control: one roster is enough', async () => {
    const guestOnly = await summary(gus, scopeOf([w.C.workspaceId]));
    expect(guestOnly.counts.members).toBeNull();
    expect(guestOnly.ids.members).toEqual([]);
    const mixed = await summary(gus, scopeOf([w.C.workspaceId, D]));
    expect(mixed.counts.members).toBe(1); // D's roster: gus
    expect(mixed.ids.members).toEqual([gus]);
  });
});
