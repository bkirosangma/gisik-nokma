import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DECISION_TYPE_ID,
  newUlid,
  planSettle,
  SYSTEM_ACTOR_FLOW,
  type IngestResult,
  type LedgerEvent,
  type SettlePlan,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import { buildApp } from '../../src/app.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import type { Queryable } from '../../src/db/queryable.js';
import { createFlowPromoter, FLOW_SERVER_CAP } from '../../src/flow/promote.js';
import { readFlow } from '../../src/flow/read-flow.js';
import { createFlowSettler, pendingSettle, settleDecision } from '../../src/flow/settle.js';
import { runFlowSweep, SETTLE_SCAN_LIMIT, type FlowSweepDeps } from '../../src/flow/sweep.js';
import type { AtomicOutcome, CommittedEventListener, IngestService } from '../../src/ingest/ingest-service.js';
import { resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import {
  addTicket, ASSIGNEE, decide, fanIn, lead, ledger, loopWorld, PERSON, PROJECT, realIngest, seedFlowWorld, seedSecondWorkspace, stateOf, step, stepMany, WS, WS2,
} from './flow-world.js';

// The sweep's settle half calls `settleDecision` through this module's export: a spy that calls through records what the
// SELECT offered (29.369), skipped candidates included. The listener calls the module's own binding, never the spy.
vi.mock('../../src/flow/settle.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/flow/settle.js')>();
  return { ...original, settleDecision: vi.fn(original.settleDecision) };
});

/**
 * wtg2 T16 (spec PS-9, contract decision 5): the settler. A committed `ticket.decided`, or a Decision's own finishing
 * transition, runs T15's `planSettle` on the Decision's flow and files the plan as ONE `ingestAtomic` batch under the
 * Flow actor; the flow sweep's settle half repairs a settle the listener lost.
 *
 * ## Counting batches, not states
 *
 * The world after one cascade and after two can look alike (the engine refuses the second, or the second plans
 * nothing), so every "exactly one cascade" claim counts the calls into `ingestAtomic` (the `atomic` spy) and the
 * `reopened-by-flow` rows in the ledger, never only the end states.
 *
 * ## The clock
 *
 * `step` files through `makeCommitted`, whose `serverTime` is the FIXTURE clock (2026-08-20 09:00 plus a minute per
 * event, `helpers/apply.ts`), so a sweep's `now` is anchored on the decided event's own `serverTime` (`after`): a
 * wall-clock `now` would put every Decision 47 days back, outside the 14-day lookback, and a "too young" leg would read
 * 0 for the wrong reason.
 *
 * ## The world
 *
 * `flow-world.ts`, one database per case; setup goes in through `applyCommitted`, so nothing settles unless a case
 * hands an event to the code under test. `loopWorld`: `s(done) -> a(done) -> d(Decision, done)`, `d -[Redo]-> a` a
 * back edge, `d -[Ship]-> z`. `settleDecision` is a call-through spy (the `vi.mock` above), so a sweep's candidates are
 * read off its calls.
 */

let db: TestDatabase;
let logs: string[];
let drains: Array<() => Promise<void>>;
beforeEach(async () => {
  vi.mocked(settleDecision).mockClear();
  resetEntitySeqs();
  db = await createTestDatabase();
  await seedFlowWorld(db.pool);
  logs = [];
  drains = [];
});
afterEach(async () => {
  for (const drain of drains) await drain();
  await db.drop();
});

const DAY = 86_400_000;
const causeOf = (e: { payload: Record<string, unknown> }) => e.payload.cause as { kind?: string } | undefined;
const causeKind = (e: { payload: Record<string, unknown> }) => causeOf(e)?.kind;
/** A clock `ms` after the event's own server time (see "The clock"). */
const after = (e: LedgerEvent, ms: number) => () => new Date(Date.parse(e.serverTime) + ms);
/** A pool that counts its statements. */
const counted = (n: { v: number }): Queryable =>
  ({ query: (...a: Parameters<typeof db.pool.query>) => { n.v += 1; return db.pool.query(...a); } }) as unknown as Queryable;
const blockedOn = (ticketId: string): SettlePlan => ({ steps: [], blocked: { ticketId, reason: 'parent-finished' }, started: [], touchesOthers: false });
const committedDoor = () => vi.fn(async (_events: SubmittedEvent[]): Promise<AtomicOutcome> => ({ status: 'committed', results: [] }));
/** A finished Decision `d` with `d -[Ship]-> z` and `d -[Drop]-> y`, both in the Backlog unless `yStarted` puts y in Doing. */
async function twoBranch(o: { yStarted?: boolean } = {}) {
  const d = await addTicket(db.pool, { typeId: DECISION_TYPE_ID, start: 'focus', moves: ['doing', 'done'] });
  const z = await addTicket(db.pool);
  const y = await addTicket(db.pool, o.yStarted === true ? { start: 'focus', moves: ['doing'] } : {});
  await lead(db.pool, d, z, 'Ship');
  await lead(db.pool, d, y, 'Drop');
  return { d, z, y };
}

/**
 * The real door with the settler and T13's promoter on its commit feed, as `app.ts` wires them. `slowMs` delays every
 * batch before it reaches the door, so a second run that does not wait for the first plans from the same world.
 * `drain` waits for everything the feed started (the listeners are fire-and-forget).
 */
function rig(o: { slowMs?: number } = {}) {
  const ingest = realIngest(db.pool);
  const atomic = vi.fn(async (events: SubmittedEvent[]): Promise<AtomicOutcome> => {
    if (o.slowMs !== undefined) await new Promise((resolve) => setTimeout(resolve, o.slowMs));
    return ingest.ingestAtomic(events);
  });
  const settler = createFlowSettler({ pool: db.pool, ingest: { ingestAtomic: atomic }, log: (m) => logs.push(m) });
  const promoter = createFlowPromoter({ pool: db.pool, ingest: { ingestBatch: (e) => ingest.ingestBatch(e) }, log: (m) => logs.push(m) });
  const pending: Promise<unknown>[] = [];
  ingest.onEventCommitted((e) => {
    pending.push(settler.onCommitted(e), promoter.onCommitted(e));
  });
  const drain = async () => {
    while (pending.length > 0) await Promise.all(pending.splice(0));
  };
  drains.push(drain);
  return { ingest, atomic, settler, promoter, drain };
}

describe('29.368 the settle listener', () => {
  it('29.368 (a) one atomic batch as the flow actor, every move carrying the whole cause; a flow-actor, non-ticket or other-type event never settles', async () => {
    const { a, d } = await loopWorld(db.pool);
    const r = rig();
    // chosen by ASSIGNEE, not the PERSON who created and finished d, so decidedBy is told apart from both
    const decided = await step(db.pool, d, 'ticket.decided', { outcome: 'Redo' }, ASSIGNEE);
    // each leg on a world that WOULD settle (the last call below shows it does)
    await r.settler.onCommitted({ ...decided, actorId: SYSTEM_ACTOR_FLOW });
    await r.settler.onCommitted({ ...decided, entity: { kind: 'workflow', id: d } });
    await r.settler.onCommitted({ ...decided, type: 'ticket.field_set' });
    expect(r.atomic).not.toHaveBeenCalled();
    await r.settler.onCommitted(decided);
    await r.drain();
    expect(r.atomic).toHaveBeenCalledTimes(1);
    const sent = r.atomic.mock.calls[0]![0];
    // T15's loop plan on this shape (29.365): the finished target to its initial state, the rest of the body (the
    // Decision) to Backlog, parents first then flow order; neither is closed, so no ticket.reopened
    expect(sent.map((e) => [e.entity.id, e.type, (e.payload as { to?: string }).to])).toEqual([
      [a, 'ticket.transitioned', 'todo'],
      [d, 'ticket.transitioned', 'backlog'],
    ]);
    for (const e of sent) {
      expect({ actorId: e.actorId, origin: e.origin, cause: (e.payload as { cause?: unknown }).cause }).toEqual({
        actorId: SYSTEM_ACTOR_FLOW,
        origin: 'server',
        cause: { kind: 'reopened-by-flow', decisionTicketId: d, outcome: 'Redo', pass: 1, decidedBy: ASSIGNEE, decisionEventId: decided.id },
      });
    }
    // and it committed, through the real engine and projections
    expect([await stateOf(db.pool, a), await stateOf(db.pool, d)]).toEqual(['todo', 'backlog']);
    expect(logs).toEqual([]);
  });

  it('29.368 (a) a non-Decision transition costs the listener one row read and no flow walk; a throwing read is logged, not thrown', async () => {
    const { d, finishing } = await loopWorld(db.pool);
    const task = await addTicket(db.pool, { start: 'focus', moves: ['doing'] });
    const taskDone = await step(db.pool, task, 'ticket.transitioned', { to: 'done' });
    const atomic = vi.fn(async (): Promise<AtomicOutcome> => ({ status: 'committed', results: [] }));
    const n = { v: 0 };
    const settler = createFlowSettler({ pool: counted(n), ingest: { ingestAtomic: atomic }, log: (m) => logs.push(m) });
    await settler.onCommitted(taskDone);
    expect([n.v, atomic.mock.calls.length]).toEqual([1, 0]);
    // an event on a ticket with no row: the same one read, and nothing to say
    n.v = 0;
    await settler.onCommitted({ ...taskDone, entity: { kind: 'ticket', id: newUlid() } });
    expect([n.v, atomic.mock.calls.length, logs]).toEqual([1, 0, []]);
    // control: the Decision's own finishing transition reads its flow (far more than one statement) and settles
    await decide(db.pool, d, 'Redo');
    n.v = 0;
    await settler.onCommitted(finishing!);
    expect(n.v).toBeGreaterThan(2);
    expect(atomic).toHaveBeenCalledTimes(1);
    // a read that throws resolves, and says so
    const broken = createFlowSettler({
      pool: { query: async () => { throw new Error('db down'); } } as never,
      ingest: { ingestAtomic: atomic },
      log: (m) => logs.push(m),
    });
    await expect(broken.onCommitted(finishing!)).resolves.toBeUndefined();
    expect(logs).toEqual(['flow settle listener failed']);
  });

  it('29.368 (a) a Decision in a second workspace is settled in ITS workspace, the event\'s', async () => {
    await seedSecondWorkspace(db.pool);
    const { a, d } = await loopWorld(db.pool, { workspaceId: WS2 });
    const r = rig();
    await r.settler.onCommitted(await decide(db.pool, d, 'Redo', {}, WS2));
    await r.drain();
    expect(r.atomic).toHaveBeenCalledTimes(1);
    expect(r.atomic.mock.calls[0]![0].map((e) => [e.workspaceId, e.entity.id])).toEqual([[WS2, a], [WS2, d]]);
    expect([await stateOf(db.pool, a), await stateOf(db.pool, d)]).toEqual(['todo', 'backlog']);
    expect(logs).toEqual([]);
  });

  it('29.368 (b) pass 2: the loop target goes straight to To do, the Decision is promoted again when it finishes, without a sweep, and the next choice is pass 2', async () => {
    const { a, d } = await loopWorld(db.pool);
    const r = rig();
    await r.settler.onCommitted(await step(db.pool, d, 'ticket.decided', { outcome: 'Redo' }, ASSIGNEE));
    await r.drain();
    // precondition and control: the cascade, not a promotion, moved a (PS-4.2: straight to To do, no led-to follows)
    expect(await stateOf(db.pool, a)).toBe('todo');
    expect((await ledger(db.pool, a, 'ticket.transitioned')).map(causeKind).at(-1)).toBe('reopened-by-flow');
    expect(await stateOf(db.pool, d)).toBe('backlog');
    await step(db.pool, a, 'ticket.transitioned', { to: 'doing' }, PERSON);
    const fin = await step(db.pool, a, 'ticket.transitioned', { to: 'done' }, PERSON);
    await r.promoter.onCommitted(fin);
    await r.drain();
    expect(await stateOf(db.pool, d)).toBe('todo');
    expect(causeOf((await ledger(db.pool, d, 'ticket.transitioned')).at(-1)!)).toMatchObject({ kind: 'led-to', sourceTicketId: a });
    // the second pass: d finishes and the same label is chosen again, by PERSON this time
    await step(db.pool, d, 'ticket.transitioned', { to: 'doing' }, PERSON);
    await step(db.pool, d, 'ticket.transitioned', { to: 'done' }, PERSON);
    const again = await decide(db.pool, d, 'Redo');
    await r.settler.onCommitted(again);
    await r.drain();
    expect(r.atomic).toHaveBeenCalledTimes(2);
    expect(r.atomic.mock.calls[1]![0].map((e) => (e.payload as { cause?: unknown }).cause)).toEqual([
      { kind: 'reopened-by-flow', decisionTicketId: d, outcome: 'Redo', pass: 2, decidedBy: PERSON, decisionEventId: again.id },
      { kind: 'reopened-by-flow', decisionTicketId: d, outcome: 'Redo', pass: 2, decidedBy: PERSON, decisionEventId: again.id },
    ]);
    expect([await stateOf(db.pool, a), await stateOf(db.pool, d)]).toEqual(['todo', 'backlog']);
  });

  it('29.368 (c) the decided event and the finishing transition together file ONE cascade (one chain per Decision)', async () => {
    const { a, d, finishing } = await loopWorld(db.pool);
    // every batch waits 150 ms at the door: a run that does not wait its turn plans from the world before the first lands
    const r = rig({ slowMs: 150 });
    const decided = await step(db.pool, d, 'ticket.decided', { outcome: 'Redo' }, ASSIGNEE);
    await Promise.all([r.settler.onCommitted(decided), r.settler.onCommitted(finishing!)]);
    await r.drain();
    expect(r.atomic).toHaveBeenCalledTimes(1);
    expect((await ledger(db.pool, a, 'ticket.transitioned')).filter((e) => causeKind(e) === 'reopened-by-flow')).toHaveLength(1);
    expect((await ledger(db.pool, d, 'ticket.transitioned')).filter((e) => causeKind(e) === 'reopened-by-flow')).toHaveLength(1);
    expect(logs).toEqual([]);
  });

  it('29.368 (c) the chain outlives the run before it: a third run issued while the second is filing still waits its turn', async () => {
    const { a, d } = await loopWorld(db.pool);
    await decide(db.pool, d, 'Redo');
    const ingest = realIngest(db.pool);
    const atomic = vi.fn(async (events: SubmittedEvent[]): Promise<AtomicOutcome> => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return ingest.ingestAtomic(events);
    });
    const deps = { pool: db.pool, ingest: { ingestAtomic: atomic }, log: (m: string) => logs.push(m) };
    // the first run ends at once (blocked); the second plans after it and files slowly
    const first = settleDecision({ ...deps, plan: () => blockedOn(a) }, WS, d);
    const second = settleDecision(deps, WS, d);
    expect(await first).toBe('blocked');
    await new Promise((resolve) => setTimeout(resolve, 0)); // the first run's tail has settled and tidied up after itself
    const third = settleDecision(deps, WS, d);
    // the second's loop moved d to Backlog: the third, planned after it, finds no settled Decision (a racing third would file again)
    expect([await second, await third]).toEqual(['applied', 'skipped']);
    expect(atomic).toHaveBeenCalledTimes(1);
    expect(logs).toEqual([`flow settle blocked for ${d}: parent-finished (${a})`]);
  });

  it('29.368 (c) a choice stored on an unfinished Decision waits, and its finishing transition alone settles it', async () => {
    const { a, d } = await loopWorld(db.pool, { finished: false });
    const r = rig();
    const decided = await decide(db.pool, d, 'Redo');
    await r.settler.onCommitted(decided);
    expect(r.atomic).not.toHaveBeenCalled();
    // skipped, not planned: a plan for a Decision in Doing would be empty too, so the answer is what tells them apart
    expect(await r.settler.settleDecision(WS, d)).toBe('skipped');
    expect(await stateOf(db.pool, d)).toBe('doing');
    const finishing = await step(db.pool, d, 'ticket.transitioned', { to: 'done' });
    await r.settler.onCommitted(finishing);
    await r.drain();
    expect(r.atomic).toHaveBeenCalledTimes(1);
    // the cause names the CHOICE (its event and its chooser), not the finishing transition
    expect(r.atomic.mock.calls[0]![0].map((e) => (e.payload as { cause?: { decisionEventId?: string } }).cause?.decisionEventId)).toEqual([decided.id, decided.id]);
    expect([await stateOf(db.pool, a), await stateOf(db.pool, d)]).toEqual(['todo', 'backlog']);
  });

  it('29.368 (d) a repeat moves nothing (skipped), a reset Decision finished again plans nothing (empty); control: a one-branch Decision files nothing', async () => {
    const { a, d } = await loopWorld(db.pool);
    const r = rig();
    await r.settler.onCommitted(await decide(db.pool, d, 'Redo'));
    await r.drain();
    expect(r.atomic).toHaveBeenCalledTimes(1);
    const counts = async () => [
      (await ledger(db.pool, a, 'ticket.transitioned')).length,
      (await ledger(db.pool, d, 'ticket.transitioned')).length,
      (await ledger(db.pool, a, 'ticket.reopened')).length,
    ];
    const before = await counts();
    // the loop moved d to Backlog, so it is no longer a settled Decision (spec :880, a settle that arrives twice moves nothing)
    expect(await r.settler.settleDecision(WS, d)).toBe('skipped');
    expect(await counts()).toEqual(before);
    // finished again with no new choice: its released outcome still names the cause, and the plan is empty
    await step(db.pool, d, 'ticket.transitioned', { to: 'doing' });
    await step(db.pool, d, 'ticket.transitioned', { to: 'done' });
    expect(await settleDecision({ pool: db.pool, ingest: { ingestAtomic: r.atomic } }, WS, d)).toBe('empty');
    expect(r.atomic).toHaveBeenCalledTimes(1);
    // control: a Decision whose ONLY branch is the chosen non-loop one
    const d1 = await addTicket(db.pool, { typeId: DECISION_TYPE_ID, start: 'focus', moves: ['doing', 'done'] });
    const z1 = await addTicket(db.pool);
    await lead(db.pool, d1, z1, 'Ship');
    await decide(db.pool, d1, 'Ship');
    expect(await r.settler.settleDecision(WS, d1)).toBe('empty');
    expect(r.atomic).toHaveBeenCalledTimes(1);
  });

  it('29.368 (d) a cleared choice returns its Not-taken tickets, the cause naming the label that was cleared', async () => {
    const d = await addTicket(db.pool, { typeId: DECISION_TYPE_ID, start: 'focus', moves: ['doing', 'done'] });
    const z = await addTicket(db.pool, { start: 'focus' });
    const y = await addTicket(db.pool);
    await lead(db.pool, d, z, 'Ship');
    await lead(db.pool, d, y, 'Drop');
    const r = rig();
    const chose = await decide(db.pool, d, 'Ship');
    await r.settler.onCommitted(chose);
    await r.drain();
    expect((await ledger(db.pool, y, 'ticket.closed')).map(causeKind)).toEqual(['branch-not-taken']);
    const cleared = await decide(db.pool, d, null);
    await r.settler.onCommitted(cleared);
    await r.drain();
    expect(r.atomic).toHaveBeenCalledTimes(2);
    expect(r.atomic.mock.calls[1]![0].map((e) => [e.entity.id, e.type, (e.payload as { cause?: unknown }).cause])).toEqual([
      [y, 'ticket.reopened', { kind: 'reopened-by-flow', decisionTicketId: d, outcome: 'Ship', pass: 1, decidedBy: PERSON, decisionEventId: cleared.id }],
      [y, 'ticket.transitioned', { kind: 'reopened-by-flow', decisionTicketId: d, outcome: 'Ship', pass: 1, decidedBy: PERSON, decisionEventId: cleared.id }],
    ]);
    expect(await stateOf(db.pool, y)).toBe('backlog');
  });

  it('29.368 (d) a Decision with no choice, a trashed Decision and a non-Decision are skipped without a word', async () => {
    const atomic = committedDoor();
    const deps = { pool: db.pool, ingest: { ingestAtomic: atomic }, log: (m: string) => logs.push(m) };
    const undecided = await addTicket(db.pool, { typeId: DECISION_TYPE_ID, start: 'focus', moves: ['doing', 'done'] });
    await lead(db.pool, undecided, await addTicket(db.pool), 'Ship');
    expect(await settleDecision(deps, WS, undecided)).toBe('skipped');
    const { d } = await loopWorld(db.pool);
    await decide(db.pool, d, 'Redo');
    expect(await pendingSettle(db.pool, {}, WS, d)).toBe(true); // control: live, it has steps waiting
    await step(db.pool, d, 'ticket.deleted', {});
    expect(await settleDecision(deps, WS, d)).toBe('skipped');
    expect(await pendingSettle(db.pool, {}, WS, d)).toBe(false);
    const task = await addTicket(db.pool, { start: 'focus', moves: ['doing', 'done'] });
    expect(await settleDecision(deps, WS, task)).toBe('skipped');
    expect(atomic).not.toHaveBeenCalled();
    expect(logs).toEqual([]);
  });

  it('29.368 (d) the LATEST choice\'s close list closes a started ticket on the branch left, its event the cause; control: a started ticket not named waits', async () => {
    const waits = await twoBranch({ yStarted: true });
    await decide(db.pool, waits.d, 'Ship');
    const r = rig();
    expect(await settleDecision({ pool: db.pool, ingest: { ingestAtomic: r.atomic } }, WS, waits.d)).toBe('empty');
    expect(await stateOf(db.pool, waits.y)).toBe('doing');
    const { d, y } = await twoBranch({ yStarted: true });
    await decide(db.pool, d, 'Drop');
    const latest = await decide(db.pool, d, 'Ship', { closeStarted: [y] });
    expect(await settleDecision({ pool: db.pool, ingest: { ingestAtomic: r.atomic } }, WS, d)).toBe('applied');
    expect(r.atomic).toHaveBeenCalledTimes(1);
    expect((await ledger(db.pool, y, 'ticket.closed')).map((e) => e.payload.cause)).toEqual([
      { kind: 'branch-not-taken', decisionTicketId: d, outcome: 'Ship', pass: 1, decidedBy: PERSON, decisionEventId: latest.id },
    ]);
    expect(logs).toEqual([]);
  });

  it('29.368 (d) a revised choice is settled under its NEW label: the old side closes, the new side reopens', async () => {
    const { d, z, y } = await twoBranch();
    const r = rig();
    await r.settler.onCommitted(await decide(db.pool, d, 'Ship'));
    await r.drain();
    expect((await ledger(db.pool, y, 'ticket.closed')).map(causeKind)).toEqual(['branch-not-taken']); // precondition
    const revised = await decide(db.pool, d, 'Drop');
    await r.settler.onCommitted(revised);
    await r.drain();
    expect(r.atomic).toHaveBeenCalledTimes(2);
    const batch = r.atomic.mock.calls[1]![0];
    expect(batch.map((e) => [e.entity.id, e.type]).sort()).toEqual([[y, 'ticket.reopened'], [y, 'ticket.transitioned'], [z, 'ticket.closed'], [z, 'ticket.transitioned']].sort());
    for (const e of batch) {
      expect((e.payload as { cause?: unknown }).cause).toMatchObject({ decisionTicketId: d, outcome: 'Drop', pass: 1, decisionEventId: revised.id });
    }
    expect(logs).toEqual([]);
  });

  it('29.368 (d) a flow cut short by the cap is skipped, never half-settled; the server cap (2000) holds the flow the read cap (300) would cut', async () => {
    const { s, a, d } = await loopWorld(db.pool);
    await decide(db.pool, d, 'Redo');
    await fanIn(db.pool, s, 301);
    const read = (cap: number) => readFlow(db.pool, { workspaceId: WS, seedId: d, viewerId: null, cap });
    expect([(await read(FLOW_SERVER_CAP)).nodes.length, (await read(FLOW_SERVER_CAP)).truncated, (await read(300)).truncated]).toEqual([305, false, true]); // precondition
    const r = rig();
    expect(await settleDecision({ pool: db.pool, ingest: { ingestAtomic: r.atomic }, flowCap: 300, log: (m) => logs.push(m) }, WS, d)).toBe('skipped');
    expect(r.atomic).not.toHaveBeenCalled();
    expect(await stateOf(db.pool, a)).toBe('done');
    expect(await settleDecision({ pool: db.pool, ingest: { ingestAtomic: r.atomic }, log: (m) => logs.push(m) }, WS, d)).toBe('applied');
    expect([await stateOf(db.pool, a), await stateOf(db.pool, d)]).toEqual(['todo', 'backlog']);
    expect(logs).toEqual([]);
  });

  it('29.368 (e) buildApp subscribes the settler only when serverAtomic is given, and unsubscribes it on close; the server passes it', async () => {
    const { a, d } = await loopWorld(db.pool);
    const decided = await decide(db.pool, d, 'Redo');
    const sent: SubmittedEvent[][] = [];
    // the internal atomic door, recording without applying
    const serverAtomic = async (events: SubmittedEvent[]): Promise<AtomicOutcome> => {
      sent.push(events);
      return { status: 'committed', results: [] };
    };
    const assemble = (withAtomic: boolean) => {
      const listeners: CommittedEventListener[] = [];
      const ingest: IngestService = {
        ingestBatch: async () => [],
        ingestClientBatch: async () => [],
        ingestAtomic: async () => ({ status: 'committed', results: [] }),
        ingestClientAtomic: async () => ({ status: 'committed', results: [] }),
        onEventCommitted: (listener) => {
          listeners.push(listener);
          return () => {
            const at = listeners.indexOf(listener);
            if (at >= 0) listeners.splice(at, 1);
          };
        },
      };
      const app = buildApp({
        db: { query: async () => [{ ok: 1 }] },
        pool: db.pool,
        ingest,
        auth: createAuth({
          pool: db.pool,
          otpSender: new LogOtpSender(() => {}),
          magicLinkSender: new LogMagicLinkSender(() => {}),
          baseUrl: 'http://localhost:3000',
          secret: 'test-secret-not-used-anywhere-real',
          webOrigin: 'http://localhost:3001',
        }),
        serverAppend: async (events: SubmittedEvent[]): Promise<IngestResult[]> => events.map((e) => ({ status: 'committed', eventId: e.id, seq: 1, serverTime: decided.serverTime })),
        ...(withAtomic ? { serverAtomic } : {}),
        webOrigin: 'http://localhost:3001',
        store: createObjectStoreFromEnv({}),
      });
      return { app, listeners };
    };
    const without = assemble(false);
    const withAtomic = assemble(true);
    expect(withAtomic.listeners).toHaveLength(without.listeners.length + 1);
    for (const l of [...without.listeners, ...withAtomic.listeners]) l(decided);
    await vi.waitFor(() => expect(sent.map((batch) => batch.map((e) => e.entity.id))).toEqual([[a, d]]), { timeout: 5000 });
    await without.app.close();
    await withAtomic.app.close();
    expect(withAtomic.listeners).toEqual([]);
    for (const l of [...withAtomic.listeners]) l(decided);
    expect(sent).toHaveLength(1);
    // the composition root hands the real door over (a source pin: nothing boots src/index.ts under test)
    expect(readFileSync(new URL('../../src/index.ts', import.meta.url), 'utf8')).toContain('serverAtomic: (events) => ingest.ingestAtomic(events),');
  });
});

describe('29.369 the sweep settle half', () => {
  const sweepWith = (over: Partial<FlowSweepDeps> & { ingest?: IngestService } = {}) => {
    const ingest = over.ingest ?? realIngest(db.pool);
    return runFlowSweep({ pool: db.pool, ingest, atomic: { ingestAtomic: (e) => ingest.ingestAtomic(e) }, log: (m) => logs.push(m), ...over });
  };

  it('29.369 (a) a settle the listener lost is applied by the sweep, at deps.now, idempotently; without the atomic door it settles nothing', async () => {
    const { a, d } = await loopWorld(db.pool);
    const decided = await decide(db.pool, d, 'Redo');
    // precondition: the ledger holds the fixture stamp every `now` below is anchored on
    const { rows } = await db.pool.query<{ server_time: Date }>('SELECT server_time FROM events WHERE id = $1', [decided.id]);
    expect(rows[0]!.server_time.toISOString()).toBe(decided.serverTime);
    const now = after(decided, 120_000);
    const ingest = realIngest(db.pool);
    // T14's daemon shape (no atomic door): the settle half is off
    expect(await runFlowSweep({ pool: db.pool, ingest, now })).toEqual({ promoted: 0, settled: 0, refused: 0 });
    expect(await stateOf(db.pool, d)).toBe('done');
    // no `now`: the wall clock, which puts this fixture Decision weeks back, outside the lookback
    expect(await sweepWith({ ingest })).toEqual({ promoted: 0, settled: 0, refused: 0 });
    expect(vi.mocked(settleDecision)).not.toHaveBeenCalled();
    // PS-4.2: a goes straight to To do, so the promote half finds nothing (d waits behind a, z behind the released d)
    expect(await sweepWith({ ingest, now })).toEqual({ promoted: 0, settled: 1, refused: 0 });
    expect([await stateOf(db.pool, a), await stateOf(db.pool, d)]).toEqual(['todo', 'backlog']);
    const { rows: stamped } = await db.pool.query<{ client_time: Date }>(
      "SELECT client_time FROM events WHERE entity_id = ANY($1::text[]) AND payload->'cause'->>'kind' = 'reopened-by-flow' ORDER BY seq", [[a, d]]);
    expect(stamped.map((r) => r.client_time.toISOString())).toEqual([now().toISOString(), now().toISOString()]);
    expect(await sweepWith({ ingest, now })).toEqual({ promoted: 0, settled: 0, refused: 0 });
    expect(logs).toEqual([]);
  });

  it('29.369 (b) only a Decision older than the 60 s grace window and younger than the 14-day lookback is settled', async () => {
    const young = await loopWorld(db.pool);
    const decided = await decide(db.pool, young.d, 'Redo');
    expect((await sweepWith({ now: after(decided, 30_000) })).settled).toBe(0);
    expect((await sweepWith({ now: after(decided, 60_000) })).settled).toBe(0); // exactly at the window: still young
    expect(await stateOf(db.pool, young.d)).toBe('done');
    expect((await sweepWith({ now: after(decided, 61_000) })).settled).toBe(1); // so the zeros above are the window
    const old = await loopWorld(db.pool);
    const decidedOld = await decide(db.pool, old.d, 'Redo');
    expect((await sweepWith({ now: after(decidedOld, 20 * DAY) })).settled).toBe(0);
    expect((await sweepWith({ now: after(decidedOld, 14 * DAY) })).settled).toBe(0); // exactly at the lookback: out
    expect(await stateOf(db.pool, old.d)).toBe('done');
    expect((await sweepWith({ now: after(decidedOld, 3 * DAY) })).settled).toBe(1);
    expect(await stateOf(db.pool, old.d)).toBe('backlog');
  });

  it('29.369 (b) a finishing transition after the choice restarts the grace window: the latest choice OR move counts', async () => {
    const { d } = await loopWorld(db.pool, { finished: false });
    await decide(db.pool, d, 'Redo');
    const finishing = await step(db.pool, d, 'ticket.transitioned', { to: 'done' });
    expect((await sweepWith({ now: after(finishing, 30_000) })).settled).toBe(0);
    expect(await stateOf(db.pool, d)).toBe('done');
    expect((await sweepWith({ now: after(finishing, 61_000) })).settled).toBe(1);
  });

  it('29.369 (b) the scan offers live, finished Decisions holding an outcome or still owning a Not-taken close, newest first; never one in Doing, trashed or undecided, and another event type does not restart the window', async () => {
    const lost = await loopWorld(db.pool);
    await decide(db.pool, lost.d, 'Redo');
    const doing = await addTicket(db.pool, { typeId: DECISION_TYPE_ID, start: 'focus', moves: ['doing'] });
    await lead(db.pool, doing, await addTicket(db.pool), 'Ship');
    await decide(db.pool, doing, 'Ship');
    const trashed = await loopWorld(db.pool);
    await decide(db.pool, trashed.d, 'Redo');
    await step(db.pool, trashed.d, 'ticket.deleted', {});
    // cleared after its Ship was settled: no outcome, but y still holds the Not-taken close naming it
    const cleared = await twoBranch();
    await decide(db.pool, cleared.d, 'Ship');
    expect(await settleDecision({ pool: db.pool, ingest: realIngest(db.pool) }, WS, cleared.d)).toBe('applied');
    expect((await ledger(db.pool, cleared.y, 'ticket.closed')).map(causeKind)).toEqual(['branch-not-taken']); // precondition
    await decide(db.pool, cleared.d, null);
    const undecided = await addTicket(db.pool, { typeId: DECISION_TYPE_ID, start: 'focus', moves: ['doing', 'done'] });
    await lead(db.pool, undecided, await addTicket(db.pool), 'Ship');
    const edited = await addTicket(db.pool, { typeId: DECISION_TYPE_ID, start: 'focus', moves: ['doing', 'done'] });
    await lead(db.pool, edited, await addTicket(db.pool), 'Ship');
    await decide(db.pool, edited, 'Ship');
    const edit = await step(db.pool, edited, 'ticket.field_set', { fieldId: 'note', value: 'edited' });
    vi.mocked(settleDecision).mockClear();
    // the choice is 90 s old, the field edit 30 s
    await sweepWith({ now: after(edit, 30_000) });
    expect(vi.mocked(settleDecision).mock.calls.map(([, ws, id]) => [ws, id])).toEqual([[WS, edited], [WS, cleared.d], [WS, lost.d]]);
  });

  it('29.369 (b) control: a Decision the listener settled is planned again by the sweep and files nothing (settled 0); pendingSettle is false', async () => {
    const d = await addTicket(db.pool, { typeId: DECISION_TYPE_ID, start: 'focus', moves: ['doing', 'done'] });
    const z = await addTicket(db.pool, { start: 'focus' });
    const y = await addTicket(db.pool);
    await lead(db.pool, d, z, 'Ship');
    await lead(db.pool, d, y, 'Drop');
    const r = rig();
    const decided = await decide(db.pool, d, 'Ship');
    await r.settler.onCommitted(decided);
    await r.drain();
    expect(await stateOf(db.pool, y)).toBe('done'); // the listener closed the Drop side
    const plan = vi.fn(planSettle);
    const atomic = vi.fn(async (): Promise<AtomicOutcome> => ({ status: 'committed', results: [] }));
    const report = await runFlowSweep({ pool: db.pool, ingest: realIngest(db.pool), atomic: { ingestAtomic: atomic }, plan, now: after(decided, 120_000), log: (m) => logs.push(m) });
    expect(report).toEqual({ promoted: 0, settled: 0, refused: 0 });
    // the SELECT did offer d (d stays finished with its outcome): it was planned, the plan was empty, nothing was filed
    expect(plan.mock.calls.map(([input]) => input.decisionId)).toEqual([d]);
    expect(atomic).not.toHaveBeenCalled();
    expect(await pendingSettle(db.pool, {}, WS, d)).toBe(false);
  });

  it('29.369 (c) a blocked plan is counted refused and logged with its raw code, pendingSettle is true while steps wait, and it is applied once unblocked', async () => {
    const { a, d } = await loopWorld(db.pool);
    const decided = await decide(db.pool, d, 'Redo');
    const now = after(decided, 120_000);
    let blocked = true;
    const plan = (input: Parameters<typeof planSettle>[0]): SettlePlan => (blocked ? blockedOn(a) : planSettle(input));
    expect(await pendingSettle(db.pool, {}, WS, d)).toBe(true); // the real plan has steps waiting
    expect(await sweepWith({ plan, now })).toEqual({ promoted: 0, settled: 0, refused: 1 });
    expect(logs).toEqual([`flow settle blocked for ${d}: parent-finished (${a})`]);
    expect(await pendingSettle(db.pool, { plan }, WS, d)).toBe(true);
    expect(await stateOf(db.pool, d)).toBe('done');
    blocked = false;
    expect(await sweepWith({ plan, now })).toEqual({ promoted: 0, settled: 1, refused: 0 });
    expect(await pendingSettle(db.pool, { plan }, WS, d)).toBe(false);
    expect([await stateOf(db.pool, a), await stateOf(db.pool, d)]).toEqual(['todo', 'backlog']);
  });

  it('29.369 (c) a refused batch and a throwing door are counted refused and logged; a default log is console.error', async () => {
    const { d } = await loopWorld(db.pool);
    const decided = await decide(db.pool, d, 'Redo');
    const now = after(decided, 120_000);
    const refusal = { status: 'refused' as const, eventId: decided.id, rule: 'some.rule', reason: 'Because.' };
    const refusing = { ingestAtomic: async (): Promise<AtomicOutcome> => ({ status: 'rolled-back', index: 1, result: refusal }) };
    expect(await sweepWith({ atomic: refusing, now })).toEqual({ promoted: 0, settled: 0, refused: 1 });
    expect(logs).toEqual([`flow settle refused for ${d}: event 1 ${JSON.stringify(refusal)}`]);
    const throwing = { ingestAtomic: async (): Promise<AtomicOutcome> => { throw new Error('door down'); } };
    expect(await sweepWith({ atomic: throwing, now })).toEqual({ promoted: 0, settled: 0, refused: 1 });
    expect(logs.at(-1)).toBe(`flow settle failed for ${d}`);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      expect(await settleDecision({ pool: db.pool, ingest: refusing, plan: () => blockedOn(d) }, WS, d)).toBe('blocked');
      expect(spy.mock.calls.map(([m]) => m)).toEqual([`flow settle blocked for ${d}: parent-finished (${d})`]);
    } finally {
      spy.mockRestore();
    }
    expect(await stateOf(db.pool, d)).toBe('done');
  });

  it('29.369 (d) the scan takes the newest Decisions first, up to its limit (500)', async () => {
    expect(SETTLE_SCAN_LIMIT).toBe(500);
    const older = await loopWorld(db.pool);
    const decidedOlder = await decide(db.pool, older.d, 'Redo');
    const newer = await loopWorld(db.pool);
    const decidedNewer = await decide(db.pool, newer.d, 'Redo');
    expect(Date.parse(decidedNewer.serverTime)).toBeGreaterThan(Date.parse(decidedOlder.serverTime)); // precondition
    const now = after(decidedNewer, 120_000);
    expect((await sweepWith({ now, settleScanLimit: 1 })).settled).toBe(1);
    expect([await stateOf(db.pool, newer.d), await stateOf(db.pool, older.d)]).toEqual(['backlog', 'done']);
    expect((await sweepWith({ now, settleScanLimit: 1 })).settled).toBe(1);
    expect(await stateOf(db.pool, older.d)).toBe('backlog');
  });

  it('29.369 (d) with no limit given, the scan takes exactly 500 of 501 Decisions, the oldest left for the next run', async () => {
    const filed = await stepMany(db.pool, Array.from({ length: 501 }, () => newUlid()).flatMap((id) => [
      { ticketId: id, type: 'ticket.created', payload: { typeId: DECISION_TYPE_ID, projectId: PROJECT, parentId: null, title: `D ${id.slice(-4)}`, start: 'focus' } },
      { ticketId: id, type: 'ticket.transitioned', payload: { to: 'doing' } },
      { ticketId: id, type: 'ticket.transitioned', payload: { to: 'done' } },
      { ticketId: id, type: 'ticket.decided', payload: { outcome: 'Go' } },
    ]));
    const spy = vi.mocked(settleDecision);
    const through = spy.getMockImplementation()!;
    spy.mockImplementation(async () => 'empty');
    try {
      expect(await sweepWith({ now: after(filed.at(-1)!, 61_000) })).toEqual({ promoted: 0, settled: 0, refused: 0 });
      expect(spy).toHaveBeenCalledTimes(500);
      expect(spy.mock.calls.map(([, , id]) => id)).not.toContain(filed[0]!.entity.id);
    } finally {
      spy.mockImplementation(through);
    }
  });

  it('29.369 (d) each Decision is settled in its own workspace, the row\'s', async () => {
    await seedSecondWorkspace(db.pool);
    const one = await loopWorld(db.pool);
    await decide(db.pool, one.d, 'Redo');
    const two = await loopWorld(db.pool, { workspaceId: WS2 });
    const decidedTwo = await decide(db.pool, two.d, 'Redo', {}, WS2);
    expect(await sweepWith({ now: after(decidedTwo, 120_000) })).toEqual({ promoted: 0, settled: 2, refused: 0 });
    const { rows } = await db.pool.query<{ workspace_id: string; entity_id: string }>(
      "SELECT workspace_id, entity_id FROM events WHERE payload->'cause'->>'kind' = 'reopened-by-flow'");
    expect(rows.map((r) => [r.workspace_id, r.entity_id]).sort()).toEqual([[WS, one.a], [WS, one.d], [WS2, two.a], [WS2, two.d]].sort());
    expect(logs).toEqual([]);
  });

  it('29.369 (d) the daemon hands its atomic door to the sweep (a source pin: the spawned daemon has no lost Decision inside the lookback)', () => {
    const daemon = readFileSync(new URL('../../src/ops/backup-daemon-main.ts', import.meta.url), 'utf8');
    expect(daemon).toContain('runFlowSweep({ pool, ingest, atomic: { ingestAtomic: (events) => ingest.ingestAtomic(events) } })');
  });
});
