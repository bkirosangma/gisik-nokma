import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { membershipId, newUlid } from '@gisik-nokma/domain';
import type { Queryable } from '../../src/db/queryable.js';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { readAsOf } from '../../src/timeline/as-of.js';
import { coreKey, forgetCores, TIMELINE_CORE_MEMO_MAX, TIMELINE_CORE_TTL_MS } from '../../src/timeline/memo.js';
import { readTimelineChunk } from '../../src/timeline/read-chunk.js';
import { readTimelineIndex } from '../../src/timeline/read-index.js';
import { readTimelineTray } from '../../src/timeline/read-tray.js';
import { readableWorkspaces, type ReadableWorkspace, type TimelineScope } from '../../src/timeline/scope.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { insertUser, seedTimelineWorld, type TimelineWorld } from './helpers/world.js';

/**
 * 29.299, the owner's (b) ruling (AMEND-wtg4-t1-reads-perf.md): a chunk or tray after its index slices the core the index
 * kept, per VIEWER, for `TIMELINE_CORE_TTL_MS`, at most `TIMELINE_CORE_MEMO_MAX` cores. A compute is counted by its scope
 * statement (`AS in_scope`, one per workspace per compute), through a recording pool; every scope here is ONE workspace.
 *
 * World (`seedTimelineWorld`): in A, `hidden` (chained after `step1`) is ama's alone; bo is A's member and sees `dated`
 * (nobody's; `other` would not do for the write leg: bo is its assignee, who always sees it). Filed here: `undated`, so the
 * tray has a row; `bea`, a second member of A with bo's role and project flags; and `onlyBo`, dated, which ama and bo may see
 * and bea may not (so for bo and bea the viewer is the ONLY input of the key that differs).
 */
const NOW = new Date('2026-10-03T06:00:00.000Z');
const WINDOW = { from: '2026-10-01', to: '2026-10-31' };
let db: TestDatabase;
let w: TimelineWorld;
const undated = newUlid();
const bea = newUlid();
const onlyBo = newUlid();
beforeAll(async () => {
  db = await createTestDatabase();
  w = await seedTimelineWorld(db.pool);
  await insertUser(db.pool, bea, 'Bea');
  const wa = { workspaceId: w.A.workspaceId, actorId: w.ama };
  await applyCommitted(db.pool, [
    makeCommitted({ ...wa, entity: { kind: 'membership', id: membershipId(w.A.workspaceId, bea) }, type: 'membership.granted', payload: { userId: bea, role: 'member' } }),
    ...[w.A.p1, w.A.p2].map((p) => makeCommitted({ ...wa, entity: { kind: 'project', id: p }, type: 'project.member_added', payload: { userId: bea, projectAdmin: false } })),
    makeCommitted({ ...wa, entity: { kind: 'ticket', id: onlyBo }, type: 'ticket.created', payload: { typeId: 'task', projectId: w.A.p1, parentId: null, title: 'Only bo', startDate: { date: '2026-10-08' }, estimate: 1 } }),
    makeCommitted({ ...wa, entity: { kind: 'ticket', id: onlyBo }, type: 'visibility.set', payload: { ticketId: onlyBo, mode: 'explicit', userIds: [w.ama, w.bo] } }),
    makeCommitted({ workspaceId: w.A.workspaceId, actorId: w.ama, entity: { kind: 'ticket', id: undated }, type: 'ticket.created', payload: { typeId: 'task', projectId: w.A.p1, parentId: null, title: 'Undated' } }),
  ]);
}, 120_000);
afterAll(async () => {
  await db.drop();
});
beforeEach(() => forgetCores());

/** A pool that counts the scope statements it runs: one per workspace each time a core is computed. */
function counting(): { pool: Queryable; computes: () => number } {
  let n = 0;
  const pool = new Proxy(db.pool, {
    get(target, prop, receiver) {
      if (prop !== 'query') return Reflect.get(target, prop, receiver);
      return (text: string, values?: unknown[]) => {
        if (typeof text === 'string' && text.includes('AS in_scope')) n += 1;
        return (target.query as (t: string, v?: unknown[]) => Promise<unknown>)(text, values);
      };
    },
  }) as unknown as Queryable;
  return { pool, computes: () => n };
}
const scopeOf = (o: { mine?: boolean; projectIds?: string[] } = {}): TimelineScope => ({ workspaceIds: [w.A.workspaceId], projectIds: o.projectIds ?? [], mine: o.mine ?? false });
const at = (ms: number): Date => new Date(NOW.getTime() + ms);
async function reads(pool: Queryable, viewer: string, scope: TimelineScope = scopeOf(), now: Date = NOW) {
  const readable = await readableWorkspaces(db.pool, viewer, scope);
  return {
    index: () => readTimelineIndex(pool, readable, viewer, scope, now),
    chunk: () => readTimelineChunk(pool, readable, viewer, scope, now, WINDOW),
    tray: () => readTimelineTray(pool, readable, viewer, scope, now),
  };
}

describe('29.299 the chunk and the tray slice the core their index kept (owner ruling (b))', () => {
  it('29.299 a chunk and a tray after their index compute nothing; control: a second index computes again (the index never reads the memo)', async () => {
    const c = counting();
    const r = await reads(c.pool, w.ama);
    await r.index();
    expect(c.computes()).toBe(1);
    expect((await r.chunk()).items.length).toBeGreaterThan(0);
    expect((await r.tray()).items.map((t) => t.id)).toContain(undated);
    expect(c.computes()).toBe(1); // sliced, not recomputed
    await r.index();
    expect(c.computes()).toBe(2);
  });

  it('29.299 the TTL is 30 s on the read’s own clock: just inside it a chunk is sliced, at it the chunk computes again; control: the recomputed core is kept', async () => {
    expect(TIMELINE_CORE_TTL_MS).toBe(30_000);
    const c = counting();
    await (await reads(c.pool, w.ama)).index();
    await (await reads(c.pool, w.ama, scopeOf(), at(29_999))).chunk();
    expect(c.computes()).toBe(1);
    await (await reads(c.pool, w.ama, scopeOf(), at(30_000))).chunk();
    expect(c.computes()).toBe(2);
    await (await reads(c.pool, w.ama, scopeOf(), at(30_000))).tray();
    expect(c.computes()).toBe(2);
  });

  it('29.299 the memo is per VIEWER: within the TTL, same scope and asOf, the blind viewer never gets the seeing viewer’s hidden ticket; control: the same viewer hits', async () => {
    const c = counting();
    const ama = await reads(c.pool, w.ama);
    expect(JSON.stringify((await ama.index()).items)).toContain(w.t.hidden);
    expect(JSON.stringify(await ama.chunk())).toContain(w.t.hidden); // control: the seeing viewer's own core, sliced
    expect(c.computes()).toBe(1);
    const bo = await reads(c.pool, w.bo);
    const chunk = await bo.chunk();
    const tray = await bo.tray();
    expect(chunk.items.some((d) => d.id === w.t.step1)).toBe(true); // the subject's neighbours are there: the absence below is sight
    expect(JSON.stringify(chunk)).not.toContain(w.t.hidden);
    expect(JSON.stringify(tray)).not.toContain(w.t.hidden);
    expect(c.computes()).toBe(2); // bo's own core
  });

  it("29.299 the VIEWER alone separates two cores: bea has bo's role and project flags and may not see onlyBo; within the TTL she never gets bo's core; control: with the viewer left out their keys are one key", async () => {
    const scope = scopeOf();
    const [rBo, rBea] = [await readableWorkspaces(db.pool, w.bo, scope), await readableWorkspaces(db.pool, bea, scope)];
    const asOf = await readAsOf(db.pool, rBo);
    expect(coreKey('-', scope, rBea, asOf, NOW)).toBe(coreKey('-', scope, rBo, asOf, NOW)); // control: nothing but the viewer differs
    const c = counting();
    expect(JSON.stringify((await (await reads(c.pool, w.bo)).index()).items)).toContain(onlyBo); // bo may see it, and his core is kept
    const r = await reads(c.pool, bea);
    const chunk = await r.chunk();
    const tray = await r.tray();
    expect(chunk.items.some((d) => d.id === w.t.dated)).toBe(true); // bea's chunk is not empty: the absence below is sight
    expect(JSON.stringify(chunk)).not.toContain(onlyBo);
    expect(JSON.stringify(tray)).not.toContain(onlyBo);
    expect(c.computes()).toBe(2); // bea's own core
  });

  it('29.299 a write moves asOf, so the next chunk computes again and sees it: a privacy change never waits for the TTL; control: before it, a hit', async () => {
    const c = counting();
    const bo = await reads(c.pool, w.bo);
    await bo.index();
    expect((await bo.chunk()).items.some((d) => d.id === w.t.dated)).toBe(true);
    expect(c.computes()).toBe(1);
    await applyCommitted(db.pool, [
      makeCommitted({ workspaceId: w.A.workspaceId, actorId: w.ama, entity: { kind: 'ticket', id: w.t.dated }, type: 'visibility.set', payload: { ticketId: w.t.dated, mode: 'explicit', userIds: [w.ama] } }),
    ]);
    const after = await bo.chunk();
    expect(c.computes()).toBe(2);
    expect(JSON.stringify(after)).not.toContain(w.t.dated);
  });

  it('29.299 across IST midnight within the TTL the chunk computes again (the day is in the key); control: the same day, a hit', async () => {
    const c = counting();
    const before = new Date('2026-10-03T18:29:50.000Z'); // 23:59:50 IST
    const after = new Date('2026-10-03T18:30:05.000Z'); // 00:00:05 IST, 15 s later
    await (await reads(c.pool, w.ama, scopeOf(), before)).index();
    await (await reads(c.pool, w.ama, scopeOf(), new Date('2026-10-03T18:29:59.000Z'))).chunk();
    expect(c.computes()).toBe(1);
    await (await reads(c.pool, w.ama, scopeOf(), after)).chunk();
    expect(c.computes()).toBe(2);
  });

  it('29.299 the memo holds 8 cores: with 8 kept every one is sliced; a 9th evicts the OLDEST kept, and only it (a core kept again is the newest)', async () => {
    expect(TIMELINE_CORE_MEMO_MAX).toBe(8);
    const c = counting();
    const keys = [w.ama, w.bo].flatMap((viewer) =>
      [false, true].flatMap((mine) => [[], [w.A.p1], [w.A.p2], [w.A.p1, w.A.p2].sort()].map((projectIds) => ({ viewer, scope: scopeOf({ mine, projectIds }) }))),
    );
    const view = (k: (typeof keys)[number]) => reads(c.pool, k.viewer, k.scope);
    for (const k of keys.slice(0, 8)) await (await view(k)).index();
    expect(c.computes()).toBe(8);
    for (const k of keys.slice(0, 8)) await (await view(k)).chunk();
    expect(c.computes()).toBe(8); // all 8 kept
    await (await view(keys[0] as (typeof keys)[number])).index(); // kept again: now the newest
    await (await view(keys[8] as (typeof keys)[number])).index();
    expect(c.computes()).toBe(10);
    await (await view(keys[2] as (typeof keys)[number])).chunk();
    await (await view(keys[0] as (typeof keys)[number])).chunk();
    expect(c.computes()).toBe(10); // the third-oldest and the re-kept one are still kept
    await (await view(keys[1] as (typeof keys)[number])).chunk();
    expect(c.computes()).toBe(11); // the oldest kept (keys[1], once keys[0] moved up) was evicted
    // kept again while the memo is full and it is NOT the oldest: it moves up and evicts nothing (kept now: 3-7, 0, 8, 1)
    await (await view(keys[5] as (typeof keys)[number])).index();
    await (await view(keys[3] as (typeof keys)[number])).chunk();
    expect(c.computes()).toBe(12); // the oldest kept (keys[3]) survived it
  });

  it('29.299 a compute that fails is not kept: the next read computes again; control: a kept core is reused', async () => {
    const c = counting();
    const failing = new Proxy(db.pool, {
      get(target, prop, receiver) {
        if (prop !== 'query') return Reflect.get(target, prop, receiver);
        return (text: string, values?: unknown[]) =>
          typeof text === 'string' && text.includes('AS in_scope')
            ? Promise.reject(new Error('scope statement failed'))
            : (target.query as (t: string, v?: unknown[]) => Promise<unknown>)(text, values);
      },
    }) as unknown as Queryable;
    await expect((await reads(failing, w.ama)).chunk()).rejects.toThrow('scope statement failed');
    const r = await reads(c.pool, w.ama);
    expect((await r.chunk()).items.length).toBeGreaterThan(0);
    expect(c.computes()).toBe(1);
    await r.tray();
    expect(c.computes()).toBe(1);
  });

  /** A pool whose scope statement hangs until `fail()` rejects it; `started` settles once that statement is issued (its core is kept by then). */
  function gated(): { pool: Queryable; fail: () => void; started: Promise<void> } {
    let fail = (): void => undefined;
    let start = (): void => undefined;
    const started = new Promise<void>((resolve) => {
      start = resolve;
    });
    const gate = new Promise<never>((_resolve, reject) => {
      fail = () => reject(new Error('scope statement failed late'));
    });
    gate.catch(() => undefined);
    const pool = new Proxy(db.pool, {
      get(target, prop, receiver) {
        if (prop !== 'query') return Reflect.get(target, prop, receiver);
        return (text: string, values?: unknown[]) => {
          if (typeof text !== 'string' || !text.includes('AS in_scope')) return (target.query as (t: string, v?: unknown[]) => Promise<unknown>)(text, values);
          start();
          return gate;
        };
      },
    }) as unknown as Queryable;
    return { pool, fail: () => fail(), started };
  }

  it('29.299 a compute that fails LATE never drops the newer core kept for its key; control: that core is then sliced', async () => {
    const c = counting();
    const slow = gated();
    const lost = (await reads(slow.pool, w.ama)).chunk();
    await slow.started; // kept, still computing
    await (await reads(c.pool, w.ama)).index(); // the same key, kept again, done
    slow.fail();
    await expect(lost).rejects.toThrow('scope statement failed late');
    await (await reads(c.pool, w.ama)).chunk();
    expect(c.computes()).toBe(1); // the index's core survived the late failure
  });

  it('29.299 a compute that fails after its key was evicted fails quietly (no stray rejection); control: the key computes again', async () => {
    const c = counting();
    const slow = gated();
    const lost = (await reads(slow.pool, w.ama)).chunk();
    await slow.started;
    for (const projectIds of [[w.A.p1], [w.A.p2], [w.A.p1, w.A.p2].sort()]) for (const mine of [false, true]) await (await reads(c.pool, w.bo, scopeOf({ mine, projectIds }))).index();
    for (const mine of [false, true]) await (await reads(c.pool, w.bo, scopeOf({ mine }))).index(); // 8 newer cores: the slow one's key is out
    slow.fail();
    await expect(lost).rejects.toThrow('scope statement failed late');
    await new Promise((resolve) => setTimeout(resolve, 20)); // let a throwing catch handler surface as an unhandled rejection
    await (await reads(c.pool, w.ama)).chunk();
    expect(c.computes()).toBe(9);
  });

  it('29.299 the key separates viewer, scope, day, asOf and role; control: the same inputs are one key', async () => {
    const eff = await resolveEffectiveRole(db.pool, w.ama, w.A.workspaceId);
    const readable: ReadableWorkspace[] = [{ workspaceId: w.A.workspaceId, eff }];
    expect(eff.workspaceRole).toBe('owner');
    expect([...eff.projects.values()].some((p) => p.projectAdmin)).toBe(true); // so the two role variants below each change ONE thing
    const asOf = { [w.A.workspaceId]: 41 };
    const base = coreKey(w.ama, scopeOf(), readable, asOf, NOW);
    expect(coreKey(w.ama, scopeOf(), readable, { ...asOf }, at(1000))).toBe(base); // control
    const variants = [
      coreKey(w.bo, scopeOf(), readable, asOf, NOW),
      coreKey(w.ama, scopeOf({ mine: true }), readable, asOf, NOW),
      coreKey(w.ama, scopeOf(), readable, asOf, new Date('2026-10-04T06:00:00.000Z')),
      coreKey(w.ama, scopeOf(), readable, { [w.A.workspaceId]: 42 }, NOW),
      coreKey(w.ama, scopeOf(), [{ workspaceId: w.A.workspaceId, eff: { ...eff, workspaceRole: 'member' } }], asOf, NOW), // the role alone
      coreKey(w.ama, scopeOf(), [{ workspaceId: w.A.workspaceId, eff: { ...eff, projects: new Map([...eff.projects].map(([id]) => [id, { projectAdmin: false }])) } }], asOf, NOW), // project admin alone
    ];
    for (const v of variants) expect(v).not.toBe(base);
    expect(new Set(variants).size).toBe(variants.length);
  });
});
