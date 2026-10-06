import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, planFlow, type LedgerEvent } from '@gisik-nokma/domain';
import { readFlowView } from '../../src/flow/flow-view.js';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { cardKeysFor } from '../../src/read/ticket-cards.js';
import { assembleScope, componentsOf } from '../../src/timeline/assemble.js';
import { computeScope } from '../../src/timeline/compute.js';
import { loadPins, loadWorkspace } from '../../src/timeline/load.js';
import { readTimelineChunk } from '../../src/timeline/read-chunk.js';
import { readTimelineIndex } from '../../src/timeline/read-index.js';
import { readHomeSummary } from '../../src/timeline/read-summary.js';
import { readableWorkspaces, type ReadableWorkspace, type TimelineScope } from '../../src/timeline/scope.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { insertUser, seedWorkspace, type TWorkspace } from './helpers/world.js';

/**
 * 29.290–29.293's bars (spec §13): index p95 ≤ 400 ms, chunk page ≤ 150 ms, Part 3's flow read on a 300-ticket flow ≤ 120 ms,
 * Home's summary ≤ 200 ms, each for the owner AND a member, Me and Everyone. Gated like `routes/home-perf.test.ts` (27.600):
 * `TIMELINE_PERF=1` or it prints what it would measure and skips. `TIMELINE_PERF_TICKETS` (default 10,000, split over three
 * workspaces; prod counts not supplied, so the floor) and `TIMELINE_PERF_RUNS` (default 100 timed calls after 10 warm-ups).
 *
 * The world: three workspaces, each owned by `ama` with `bo` a member, so both read all three. Per group of 12 tickets: a flow
 * `s -> a -> D (Decision) -> b 'Yes' | c 'No' -> m -> e` with a loop `D -> a 'Needs rework'`, members alternating project 1 / 2,
 * and five singletons (dated, due-only, dated and due, undated, estimate-only). Every 4th flow's head is ama's, every 4th + 2
 * is bo's; a third of the heads carry a work period; every 10th flow's `a` is ama's alone (a hole for bo); every 10th head
 * has a note. Workspace 1 also holds ONE flow of exactly 300 tickets: a root fanning out to 13 chains of 23 (depth 23, under
 * FLOW_MAX_RINGS = 30) with a Decision every 10th link.
 */
const ENABLED = process.env['TIMELINE_PERF'] === '1';
const TICKETS = Number(process.env['TIMELINE_PERF_TICKETS'] ?? 10_000);
const RUNS = Number(process.env['TIMELINE_PERF_RUNS'] ?? 100);
const NOW = new Date('2026-10-03T06:00:00.000Z');
const DAY0 = Date.UTC(2026, 5, 1);
const day = (n: number): string => new Date(DAY0 + n * 86_400_000).toISOString().slice(0, 10);
const MACHINE = `${process.platform}/${process.arch}`;

let db: TestDatabase;
let ama: string;
let bo: string;
let spaces: TWorkspace[] = [];
let bigRoot = '';

function percentile(sorted: number[], fraction: number): number {
  const at = Math.min(sorted.length - 1, Math.ceil(fraction * sorted.length) - 1);
  return sorted[Math.max(0, at)] as number;
}

/** 10 warm-up calls, `RUNS` timed ones, the p95. */
async function p95Of(call: (i: number) => Promise<unknown>): Promise<number> {
  for (let i = 0; i < 10; i += 1) await call(i);
  const times: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const t0 = performance.now();
    await call(i);
    times.push(performance.now() - t0);
  }
  return percentile(times.sort((a, b) => a - b), 0.95);
}

function scaleEvents(w: TWorkspace, count: number): LedgerEvent[] {
  const ev: LedgerEvent[] = [];
  const as = (actorId: string, id: string, type: string, payload: Record<string, unknown>, kind: 'ticket' | 'note' = 'ticket') =>
    makeCommitted({ workspaceId: w.workspaceId, actorId, entity: { kind, id }, type, payload });
  const created = (id: string, i: number, title: string, extra: Record<string, unknown> = {}, typeId = 'task') =>
    ev.push(as(ama, id, 'ticket.created', { typeId, projectId: i % 2 === 0 ? w.p1 : w.p2, parentId: null, title, ...extra }));
  const link = (from: string, to: string, label?: string) =>
    ev.push(as(ama, from, 'ticket.link_added', { kind: 'leads_to', targetId: to, ...(label === undefined ? {} : { label }) }));
  for (let k = 0; k * 12 < count; k += 1) {
    const [s, a, d, b, c, m, e] = Array.from({ length: 7 }, (): string => newUlid()) as [string, string, string, string, string, string, string];
    created(s, 0, `Head ${k}`, { startDate: { date: day(k % 240) }, estimate: 2 });
    created(a, 1, `A ${k}`, { estimate: 1 });
    created(d, 2, `Decide ${k}`, { estimate: 1 }, 'decision');
    created(b, 3, `Yes ${k}`, { estimate: 2 });
    created(c, 4, `No ${k}`, { estimate: 1 });
    created(m, 5, `Merge ${k}`, { estimate: 1 });
    created(e, 6, `End ${k}`, { estimate: 2 });
    link(s, a);
    link(a, d);
    link(d, b, 'Yes');
    link(d, c, 'No');
    link(b, m);
    link(c, m);
    link(m, e);
    link(d, a, 'Needs rework');
    if (k % 4 === 0) ev.push(as(ama, s, 'ticket.assigned', { assigneeId: ama }));
    if (k % 4 === 2) ev.push(as(ama, s, 'ticket.assigned', { assigneeId: bo }));
    if (k % 3 === 0) ev.push(as(ama, s, 'ticket.transitioned', { to: 'doing' }), as(ama, s, 'ticket.transitioned', { to: 'done' }));
    if (k % 10 === 5) ev.push(as(ama, a, 'visibility.set', { ticketId: a, mode: 'explicit', userIds: [ama] }));
    if (k % 10 === 0) ev.push(as(ama, newUlid(), 'note.created', { title: `Note ${k}`, homeProjectId: w.p1, scope: { mode: 'workspace' }, attachTicketId: s }, 'note'));
    const x = Array.from({ length: 5 }, () => newUlid());
    created(x[0] as string, 7, `Single ${k}`, { startDate: { date: day((k * 7) % 300) }, estimate: 3 });
    created(x[1] as string, 8, `Due ${k}`, { dueDate: { date: day((k * 5) % 300) } });
    created(x[2] as string, 9, `Span ${k}`, { startDate: { date: day((k * 3) % 290) }, dueDate: { date: day(((k * 3) % 290) + 4) } });
    created(x[3] as string, 10, `Undated ${k}`);
    created(x[4] as string, 11, `Estimate ${k}`, { estimate: 2 });
    if (k % 3 === 0) ev.push(as(ama, x[0] as string, 'ticket.assigned', { assigneeId: bo }));
  }
  return ev;
}

/** One flow of exactly 300: the root, then 13 chains of 23 hanging from it; every 10th chain link leaves a Decision, labelled. */
function bigFlowEvents(w: TWorkspace): { root: string; events: LedgerEvent[] } {
  const ev: LedgerEvent[] = [];
  const as = (id: string, type: string, payload: Record<string, unknown>) =>
    makeCommitted({ workspaceId: w.workspaceId, actorId: ama, entity: { kind: 'ticket', id }, type, payload });
  const root = newUlid();
  ev.push(as(root, 'ticket.created', { typeId: 'task', projectId: w.p1, parentId: null, title: 'Big root', startDate: { date: day(10) }, estimate: 1 }));
  for (let j = 0; j < 13; j += 1) {
    let prev = root;
    for (let i = 1; i <= 23; i += 1) {
      const id = newUlid();
      const decision = i % 10 === 0;
      ev.push(as(id, 'ticket.created', { typeId: decision ? 'decision' : 'task', projectId: i % 2 === 0 ? w.p1 : w.p2, parentId: null, title: `Big ${j}.${i}`, estimate: 1 }));
      const fromDecision = (i - 1) % 10 === 0 && i > 1;
      ev.push(as(prev, 'ticket.link_added', { kind: 'leads_to', targetId: id, ...(fromDecision ? { label: 'Go' } : {}) }));
      prev = id;
    }
  }
  return { root, events: ev };
}

beforeAll(async () => {
  db = await createTestDatabase();
  if (!ENABLED) return;
  ama = newUlid();
  bo = newUlid();
  await insertUser(db.pool, ama, 'Ama');
  await insertUser(db.pool, bo, 'Bo');
  spaces = [await seedWorkspace(db.pool, ama, [bo]), await seedWorkspace(db.pool, ama, [bo]), await seedWorkspace(db.pool, ama, [bo])];
  const big = bigFlowEvents(spaces[0] as TWorkspace);
  bigRoot = big.root;
  const per = Math.floor(TICKETS / 3);
  const events = [...big.events, ...scaleEvents(spaces[0] as TWorkspace, per - 300), ...scaleEvents(spaces[1] as TWorkspace, per), ...scaleEvents(spaces[2] as TWorkspace, per)];
  const t0 = Date.now();
  await applyCommitted(db.pool, events);
  console.log(`timeline-perf: seeded ${events.length} events (${TICKETS} tickets target) in ${Date.now() - t0} ms`);
}, 3_600_000);
afterAll(async () => {
  await db.drop();
});

const scopeOf = (mine: boolean): TimelineScope => ({ workspaceIds: spaces.map((s) => s.workspaceId).sort(), projectIds: [], mine });
const viewers = () => [
  ['owner', ama],
  ['member', bo],
] as const;
const combos = () => viewers().flatMap(([role, id]) => [false, true].map((mine) => ({ role, id, mine, scope: scopeOf(mine) })));
async function readableFor(id: string, scope: TimelineScope): Promise<ReadableWorkspace[]> {
  const r = await readableWorkspaces(db.pool, id, scope);
  expect(r).toHaveLength(3); // both viewers read every workspace, or the bar measures less than it names
  return r;
}

describe('29.290–29.293 the Timeline reads meet their bars at the floor size', () => {
  if (!ENABLED) {
    console.log(
      `timeline-perf: SKIPPED — set TIMELINE_PERF=1 to seed ${TICKETS} tickets over three workspaces and measure p95: index ≤ 400 ms, chunk page ≤ 150 ms, flow (300) ≤ 120 ms, summary ≤ 200 ms.`,
    );
    it.skip('seeds and measures (set TIMELINE_PERF=1)', () => undefined);
    return;
  }

  it('29.290 readTimelineIndex p95 ≤ 400 ms for the owner and a member, Me and Everyone', async () => {
    const out: number[] = [];
    for (const c of combos()) {
      const readable = await readableFor(c.id, c.scope);
      const once = await readTimelineIndex(db.pool, readable, c.id, c.scope, NOW);
      const intervals = once.items.reduce((n, e) => n + e.segments.length, 0);
      const p95 = await p95Of(() => readTimelineIndex(db.pool, readable, c.id, c.scope, NOW));
      console.log(`timeline-perf: readTimelineIndex p95 ${p95.toFixed(1)} ms (${intervals} intervals, ${once.items.length} items, ${once.flows.length} flows, 3 workspaces, ${c.role}, ${c.mine ? 'mine' : 'everyone'}), machine ${MACHINE}`);
      out.push(p95);
    }
    for (const p95 of out) expect.soft(p95, 'spec §13: index p95 ≤ 400 ms').toBeLessThanOrEqual(400);
  }, 3_600_000);

  it('29.291 readTimelineChunk p95 ≤ 150 ms per 200-item page, six 28-day windows across the range', async () => {
    const windows = [0, 56, 112, 168, 224, 280].map((s) => ({ from: day(s), to: day(s + 27) }));
    const out: number[] = [];
    for (const c of combos()) {
      const readable = await readableFor(c.id, c.scope);
      const sizes = await Promise.all(windows.map(async (win) => (await readTimelineChunk(db.pool, readable, c.id, c.scope, NOW, win)).items.length));
      const p95 = await p95Of((i) => readTimelineChunk(db.pool, readable, c.id, c.scope, NOW, windows[i % 6] as { from: string; to: string }));
      console.log(`timeline-perf: readTimelineChunk p95 ${p95.toFixed(1)} ms (page sizes ${sizes.join('/')}, 3 workspaces, ${c.role}, ${c.mine ? 'mine' : 'everyone'}), machine ${MACHINE}`);
      out.push(p95);
    }
    for (const p95 of out) expect.soft(p95, 'spec §13: chunk page p95 ≤ 150 ms').toBeLessThanOrEqual(150);
  }, 3_600_000);

  it("29.292 Part 3's readFlowView on a 300-ticket flow p95 ≤ 120 ms", async () => {
    const workspaceId = (spaces[0] as TWorkspace).workspaceId;
    const out: number[] = [];
    for (const [role, viewerId] of viewers()) {
      const eff = await resolveEffectiveRole(db.pool, viewerId, workspaceId);
      const once = await readFlowView(db.pool, { workspaceId, seedId: bigRoot, viewerId, eff });
      expect(once.reached).toBe(300);
      expect(once.truncated).toBe(false);
      expect(once.nodes).toHaveLength(300);
      const p95 = await p95Of(() => readFlowView(db.pool, { workspaceId, seedId: bigRoot, viewerId, eff }));
      console.log(`timeline-perf: readFlowView p95 ${p95.toFixed(1)} ms (300 tickets, ${role}), machine ${MACHINE}`);
      out.push(p95);
    }
    for (const p95 of out) expect.soft(p95, 'spec §13: flow p95 ≤ 120 ms').toBeLessThanOrEqual(120);
  }, 3_600_000);

  it('29.290–29.291 (report only, no bar) where one core goes: each stage of computeScope timed alone, and the scope statement under EXPLAIN (ANALYZE, BUFFERS)', async () => {
    const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;
    for (const c of combos()) {
      const readable = await readableFor(c.id, c.scope);
      const stage: Record<'scopeSql' | 'otherSql' | 'load' | 'keys' | 'pins' | 'assemble' | 'planOnly' | 'core', number[]> = {
        scopeSql: [], otherSql: [], load: [], keys: [], pins: [], assemble: [], planOnly: [], core: [],
      };
      let explain: string[] = [];
      for (let round = 0; round < 12; round += 1) {
        const sums = { scopeSql: 0, otherSql: 0, load: 0, keys: 0, pins: 0, assemble: 0, planOnly: 0 };
        for (const { workspaceId, eff } of readable) {
          const log: { text: string; values: unknown[]; ms: number }[] = [];
          const recording = new Proxy(db.pool, {
            get(target, prop, receiver) {
              if (prop !== 'query') return Reflect.get(target, prop, receiver);
              return async (text: string, values: unknown[] = []) => {
                const t = performance.now();
                const r = await (target.query as (t: string, v: unknown[]) => Promise<unknown>)(text, values);
                log.push({ text, values, ms: performance.now() - t });
                return r;
              };
            },
          }) as typeof db.pool;
          let t0 = performance.now();
          const loaded = await loadWorkspace(recording, eff, c.id, workspaceId, c.scope);
          sums.load += performance.now() - t0;
          const scopeStatement = log.find((q) => q.text.includes('AS in_scope')) as { text: string; values: unknown[]; ms: number };
          sums.scopeSql += scopeStatement.ms;
          sums.otherSql += log.reduce((n, q) => n + q.ms, 0) - scopeStatement.ms;
          t0 = performance.now();
          const keys = await cardKeysFor(db.pool, loaded.rows);
          sums.keys += performance.now() - t0;
          t0 = performance.now();
          const pins = await loadPins(db.pool, eff, c.id, loaded.tickets.filter((t) => t.inScope).map((t) => t.id));
          sums.pins += performance.now() - t0;
          t0 = performance.now();
          assembleScope({ tickets: loaded.tickets, edges: loaded.edges, keys, pins, today: '2026-10-03' });
          sums.assemble += performance.now() - t0;
          // planFlow alone over the same components (what assembleScope plans, without the segments and the rows)
          const byId = new Map(loaded.tickets.map((t) => [t.id, t.node]));
          t0 = performance.now();
          for (const members of componentsOf([...byId.keys()], loaded.edges).values()) {
            const set = new Set(members);
            planFlow({
              nodes: members.map((m) => byId.get(m) as never),
              edges: loaded.edges.filter((e) => e.kind === 'leads_to' && set.has(e.from) && set.has(e.to)).map((e) => ({ sourceId: e.from, targetId: e.to, label: e.label })),
            });
          }
          sums.planOnly += performance.now() - t0;
          if (round === 0 && workspaceId === readable[0]?.workspaceId) {
            const plan = await db.pool.query<{ 'QUERY PLAN': string }>(`EXPLAIN (ANALYZE, BUFFERS) ${scopeStatement.text}`, scopeStatement.values);
            explain = plan.rows.map((r) => r['QUERY PLAN']);
          }
        }
        for (const k of Object.keys(sums) as (keyof typeof sums)[]) stage[k].push(sums[k]);
        const t0 = performance.now();
        await computeScope(db.pool, readable, c.id, c.scope, NOW);
        stage.core.push(performance.now() - t0);
      }
      const line = (Object.keys(stage) as (keyof typeof stage)[]).map((k) => `${k} ${median(stage[k]).toFixed(1)}`).join(', ');
      console.log(`timeline-perf-profile: ${c.role} ${c.mine ? 'mine' : 'everyone'} medians over 12 rounds, ms, summed over the 3 workspaces (computeScope runs them in parallel): ${line}`);
      expect(explain.length).toBeGreaterThan(0);
      if (c.role === 'member' && !c.mine) for (const l of explain) console.log(`timeline-perf-explain: ${l}`);
    }
  }, 3_600_000);
  it("29.292 (report only, no bar) where Part 3's flow read goes: its SQL statements and the rest, owner and member", async () => {
    const workspaceId = (spaces[0] as TWorkspace).workspaceId;
    const median = (xs: number[]): number => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] as number;
    for (const [role, viewerId] of viewers()) {
      const eff = await resolveEffectiveRole(db.pool, viewerId, workspaceId);
      const total: number[] = [];
      const sql: number[] = [];
      let statements = 0;
      for (let round = 0; round < 20; round += 1) {
        const log: number[] = [];
        const recording = new Proxy(db.pool, {
          get(target, prop, receiver) {
            if (prop !== 'query') return Reflect.get(target, prop, receiver);
            return async (text: string, values: unknown[] = []) => {
              const t = performance.now();
              const r = await (target.query as (t: string, v: unknown[]) => Promise<unknown>)(text, values);
              log.push(performance.now() - t);
              return r;
            };
          },
        }) as typeof db.pool;
        const t0 = performance.now();
        await readFlowView(recording, { workspaceId, seedId: bigRoot, viewerId, eff });
        total.push(performance.now() - t0);
        sql.push(log.reduce((n, x) => n + x, 0));
        statements = log.length;
      }
      console.log(`timeline-perf-profile: readFlowView ${role} medians over 20: total ${median(total).toFixed(1)} ms, SQL ${median(sql).toFixed(1)} ms in ${statements} statements, the rest ${(median(total) - median(sql)).toFixed(1)} ms`);
      expect(statements).toBeGreaterThan(0);
    }
  }, 3_600_000);

  it('29.293 readHomeSummary p95 ≤ 200 ms over three workspaces', async () => {
    const out: number[] = [];
    for (const c of combos()) {
      const readable = await readableFor(c.id, c.scope);
      const once = await readHomeSummary(db.pool, readable, c.id, c.scope, NOW);
      const p95 = await p95Of(() => readHomeSummary(db.pool, readable, c.id, c.scope, NOW));
      console.log(`timeline-perf: readHomeSummary p95 ${p95.toFixed(1)} ms (${once.counts.tickets} tickets, 3 workspaces, ${c.role}, ${c.mine ? 'mine' : 'everyone'}), machine ${MACHINE}`);
      out.push(p95);
    }
    for (const p95 of out) expect.soft(p95, 'spec §13: summary p95 ≤ 200 ms').toBeLessThanOrEqual(200);
  }, 3_600_000);
});
