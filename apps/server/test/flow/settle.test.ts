import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DECISION_TYPE_ID,
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
import { createFlowPromoter } from '../../src/flow/promote.js';
import { createFlowSettler, pendingSettle, settleDecision } from '../../src/flow/settle.js';
import { runFlowSweep, SETTLE_SCAN_LIMIT, type FlowSweepDeps } from '../../src/flow/sweep.js';
import type { AtomicOutcome, CommittedEventListener, IngestService } from '../../src/ingest/ingest-service.js';
import { resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { addTicket, ASSIGNEE, decide, lead, ledger, loopWorld, PERSON, realIngest, seedFlowWorld, stateOf, step, WS } from './flow-world.js';

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
 * back edge, `d -[Ship]-> z`.
 */

let db: TestDatabase;
let logs: string[];
let drains: Array<() => Promise<void>>;
beforeEach(async () => {
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

  it('29.368 (c) a choice stored on an unfinished Decision waits, and its finishing transition alone settles it', async () => {
    const { a, d } = await loopWorld(db.pool, { finished: false });
    const r = rig();
    const decided = await decide(db.pool, d, 'Redo');
    await r.settler.onCommitted(decided);
    expect(r.atomic).not.toHaveBeenCalled();
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

  it('29.369 (d) the daemon hands its atomic door to the sweep (a source pin: the spawned daemon has no lost Decision inside the lookback)', () => {
    const daemon = readFileSync(new URL('../../src/ops/backup-daemon-main.ts', import.meta.url), 'utf8');
    expect(daemon).toContain('runFlowSweep({ pool, ingest, atomic: { ingestAtomic: (events) => ingest.ingestAtomic(events) } })');
  });
});
