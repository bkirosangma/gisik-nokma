import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DECISION_TYPE_ID, newUlid, SYSTEM_ACTOR_FLOW, type IngestResult, type SubmittedEvent } from '@gisik-nokma/domain';
import { createFlowPromoter, promoteTargets, type FlowIngest } from '../../src/flow/promote.js';
import { flowSweepIntervalMs, runFlowSweep, type FlowSweepDeps } from '../../src/flow/sweep.js';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import {
  addTicket,
  ASSIGNEE,
  decide,
  lead,
  ledger,
  PERSON,
  PROJECT,
  realIngest,
  seedFlowWorld,
  SHIPPED_TASK,
  stateOf,
  step,
  WS,
} from './flow-world.js';

/**
 * wtg2 T14 (spec AP-5, contract decision 5): the reconciling sweep. It repairs the two losses the server's listener
 * cannot prevent (an event the backup daemon's own ingest committed, and a fire-and-forget promotion that died with
 * its process) by selecting a SUPERSET of the promotable tickets in SQL and handing each workspace's list to T13's
 * `promoteTargets`, the one promotion path.
 *
 * ## The candidate list
 *
 * Every extra row the SELECT returns is declined by the exact rule, so the REPORT cannot tell a narrower or wider
 * SELECT apart. The calls into the real `promoteTargets` can: the module is mocked with a spy that calls through
 * (`vi.mock` is hoisted), and `candidates()` is what each sweep offered, per workspace. `createFlowPromoter` calls
 * its own module's binding, so a listener's promotion never shows up in that list.
 *
 * ## The world
 *
 * `flow-world.ts`, one database per case, as `promote.test.ts`. A second workspace (`seedWs2`) has its own workflow
 * and type ids: entity ids are global, so `seedFlowWorld`'s cannot be reused there.
 */

vi.mock('../../src/flow/promote.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../src/flow/promote.js')>();
  return { ...real, promoteTargets: vi.fn(real.promoteTargets) };
});

const NOW = '2026-10-06T05:00:00.000Z';
const WS2 = '01J9GWS2000000000000000000';
let db: TestDatabase;
let logs: string[];
beforeEach(async () => {
  resetEntitySeqs();
  db = await createTestDatabase();
  await seedFlowWorld(db.pool);
  logs = [];
  vi.mocked(promoteTargets).mockClear();
});
afterEach(async () => {
  await db.drop();
});

const sweep = (over: Partial<FlowSweepDeps> = {}) =>
  runFlowSweep({ pool: db.pool, ingest: realIngest(db.pool), log: (m) => logs.push(m), ...over });
const finishedSource = () => addTicket(db.pool, { start: 'focus', moves: ['doing', 'done'] });
const openSource = () => addTicket(db.pool, { start: 'focus', moves: ['doing'] });
/** What the sweeps since the last `mockClear()` offered `promoteTargets`: one `[workspace, sorted ids]` per call, by workspace. */
const candidates = () =>
  vi.mocked(promoteTargets).mock.calls
    .map(([, workspaceId, ids]): [string, string[]] => [workspaceId, [...ids].sort()])
    .sort(([a], [b]) => a.localeCompare(b));

/** A second workspace: To do, Doing, Done on its own workflow and type ids. */
async function seedWs2(): Promise<void> {
  await applyCommitted(db.pool, [
    makeCommitted({ workspaceId: WS2, actorId: PERSON, entity: { kind: 'workflow', id: 'wf-ws2' }, type: 'workflow.defined',
      payload: { id: 'wf-ws2', version: 1, name: 'wf-ws2', initialStateId: 'todo',
        states: [{ id: 'todo', name: 'To do', category: 'open' }, { id: 'doing', name: 'Doing', category: 'active' }, { id: 'done', name: 'Done', category: 'terminal' }],
        transitions: [{ from: 'todo', to: 'doing', rules: [] }, { from: 'doing', to: 'done', rules: [] }] } }),
    makeCommitted({ workspaceId: WS2, actorId: PERSON, entity: { kind: 'ticket-type', id: 'ws2-task' }, type: 'ticket-type.defined',
      payload: { id: 'ws2-task', name: 'ws2-task', icon: 'check', rank: 3, workflowId: 'wf-ws2', fields: [] } }),
  ]);
}
async function ws2Ticket(start: 'backlog' | 'focus' = 'backlog', moves: string[] = []): Promise<string> {
  const id = newUlid();
  await step(db.pool, id, 'ticket.created', { typeId: 'ws2-task', projectId: PROJECT, parentId: null, title: `W ${id.slice(-4)}`, start }, PERSON, WS2);
  for (const to of moves) await step(db.pool, id, 'ticket.transitioned', { to }, PERSON, WS2);
  return id;
}
const ws2Lead = (source: string, target: string) => step(db.pool, source, 'ticket.link_added', { kind: 'leads_to', targetId: target }, PERSON, WS2);

/** A person's transition through the real internal door (the engine and projections run; no gate). */
const submit = (ingest: FlowIngest, ticketId: string, to: string) =>
  ingest.ingestBatch([{ id: newUlid(), workspaceId: WS, entity: { kind: 'ticket', id: ticketId }, type: 'ticket.transitioned', version: 1,
    payload: { to }, actorId: PERSON, origin: 'web', clientTime: new Date().toISOString() }]);

const stubIngest = (result: (e: SubmittedEvent) => IngestResult): FlowIngest => ({ ingestBatch: async (events) => events.map(result) });

describe('29.222 the sweep promotes what is due', () => {
  it('29.222 every live Backlog target whose leads_to is met, in every workspace; the SELECT offers no active-source, blocks-only or trashed-source target', async () => {
    const s = await finishedSource();
    const o = await openSource();
    const t1 = await addTicket(db.pool);
    const t2 = await addTicket(db.pool);
    await lead(db.pool, s, t1);
    await lead(db.pool, o, t2);
    // a finished source that only BLOCKS a Backlog ticket, and a finished source that was then trashed
    const b = await addTicket(db.pool);
    await step(db.pool, s, 'ticket.link_added', { kind: 'blocks', targetId: b });
    const gone = await finishedSource();
    const g = await addTicket(db.pool);
    await lead(db.pool, gone, g);
    await step(db.pool, gone, 'ticket.deleted', {});
    // a second workspace with its own due target: the report sums both
    await seedWs2();
    const s2 = await ws2Ticket('focus', ['doing', 'done']);
    const u = await ws2Ticket();
    await ws2Lead(s2, u);

    expect(await sweep({ now: () => new Date(NOW) })).toEqual({ promoted: 2, settled: 0, refused: 0 });
    expect([await stateOf(db.pool, t1), await stateOf(db.pool, u)]).toEqual(['todo', 'todo']);
    // control: the active source's target, the blocked one and the trashed source's target stay
    expect([await stateOf(db.pool, t2), await stateOf(db.pool, b), await stateOf(db.pool, g)]).toEqual(['backlog', 'backlog', 'backlog']);
    // the read count: none of the three was even offered to the rule
    expect(candidates()).toEqual([[WS, [t1]], [WS2, [u]]]);
    // the promotion is claimed at deps.now
    const { rows } = await db.pool.query<{ client_time: Date }>(
      "SELECT client_time FROM events WHERE entity_id = $1 AND type = 'ticket.transitioned'", [t1]);
    expect(rows.map((r) => r.client_time.toISOString())).toEqual([NOW]);
  });
});

describe('29.223 the sweep makes a promotion the listener missed', () => {
  it('29.223 a finish committed through an ingest nobody listens to is promoted by the next sweep; control: with the listener attached it promotes at once and the sweep has nothing to do', async () => {
    // World A: the listener is attached, as in the server process.
    const ingest = realIngest(db.pool);
    const off = ingest.onEventCommitted((e) => void createFlowPromoter({ pool: db.pool, ingest, log: () => {} }).onCommitted(e));
    const s = await openSource();
    const t = await addTicket(db.pool);
    await lead(db.pool, s, t);
    expect((await submit(ingest, s, 'done')).map((r) => r.status)).toEqual(['committed']);
    await vi.waitFor(async () => expect(await stateOf(db.pool, t)).toBe('todo'), { timeout: 5000 });
    expect(await sweep()).toEqual({ promoted: 0, settled: 0, refused: 0 });
    expect(candidates()).toEqual([]);

    // World B: what the backup daemon's ingest is, a fresh one no listener was ever attached to.
    off();
    vi.mocked(promoteTargets).mockClear();
    const bare = realIngest(db.pool);
    const s2 = await openSource();
    const t2 = await addTicket(db.pool);
    await lead(db.pool, s2, t2);
    expect((await submit(bare, s2, 'done')).map((r) => r.status)).toEqual(['committed']);
    expect(await stateOf(db.pool, t2)).toBe('backlog'); // nothing is listening, so this read races nothing
    expect(await sweep()).toEqual({ promoted: 1, settled: 0, refused: 0 });
    expect(await stateOf(db.pool, t2)).toBe('todo');
    expect(candidates()).toEqual([[WS, [t2]]]);
  });
});

describe('29.224 the sweep is idempotent', () => {
  it('29.224 a second sweep files nothing and offers nothing; control: the first filed exactly one led-to transition', async () => {
    const s = await finishedSource();
    const t = await addTicket(db.pool);
    await lead(db.pool, s, t);
    expect(await sweep()).toEqual({ promoted: 1, settled: 0, refused: 0 });
    expect(await ledger(db.pool, t, 'ticket.transitioned')).toHaveLength(1);
    expect(candidates()).toEqual([[WS, [t]]]);
    vi.mocked(promoteTargets).mockClear();
    expect(await sweep()).toEqual({ promoted: 0, settled: 0, refused: 0 });
    expect(await ledger(db.pool, t, 'ticket.transitioned')).toHaveLength(1);
    // without this leg the case cannot fail on this task's code: promotionsFor also skips a non-Backlog target
    expect(candidates()).toEqual([]);
  });
});

describe('29.225 triggeredBy through the sweep', () => {
  it('29.225 the actor of the source\'s latest transition, and the flow actor when the source has none', async () => {
    const s = await addTicket(db.pool, { start: 'focus', moves: ['doing'] });
    await step(db.pool, s, 'ticket.transitioned', { to: 'done' }, ASSIGNEE); // not the creator, PERSON
    const t = await addTicket(db.pool);
    await lead(db.pool, s, t);
    // a republish that re-categorises a state leaves a terminal ticket with no transition event (auto-close/sweep.ts:198-206)
    const s2 = await addTicket(db.pool, { start: 'focus' });
    await db.pool.query("UPDATE proj_tickets SET state_id = 'done', state_category = 'terminal' WHERE ticket_id = $1", [s2]);
    const t2 = await addTicket(db.pool);
    await lead(db.pool, s2, t2);
    expect(await sweep()).toEqual({ promoted: 2, settled: 0, refused: 0 });
    expect((await ledger(db.pool, t, 'ticket.transitioned')).map((r) => [r.actor_id, r.payload])).toEqual([
      [SYSTEM_ACTOR_FLOW, { to: 'todo', cause: { kind: 'led-to', sourceTicketId: s, triggeredBy: ASSIGNEE } }],
    ]);
    expect((await ledger(db.pool, t2, 'ticket.transitioned')).map((r) => r.payload)).toEqual([
      { to: 'todo', cause: { kind: 'led-to', sourceTicketId: s2, triggeredBy: SYSTEM_ACTOR_FLOW } },
    ]);
  });
});

describe('29.226 the SELECT is a superset and the rule decides', () => {
  it('29.226 waitForAll, a Decision\'s other label, trashed and draft targets, a terminal-initial workflow; control: each promotes when the rule is met', async () => {
    // (a) waitForAll with one open source: selected, declined; promoted once the other source finishes
    const a = await finishedSource();
    const b = await openSource();
    const t = await addTicket(db.pool);
    await step(db.pool, t, 'ticket.field_set', { fieldId: 'waitForAll', value: true });
    await lead(db.pool, a, t);
    await lead(db.pool, b, t);
    expect(await sweep()).toEqual({ promoted: 0, settled: 0, refused: 0 });
    expect(candidates()).toEqual([[WS, [t]]]);
    await step(db.pool, b, 'ticket.transitioned', { to: 'done' });
    vi.mocked(promoteTargets).mockClear();
    expect(await sweep()).toEqual({ promoted: 1, settled: 0, refused: 0 });
    expect(await stateOf(db.pool, t)).toBe('todo');

    // (b) a Decision decided Yes: both labels are selected, only Yes promotes
    const d = await addTicket(db.pool, { typeId: DECISION_TYPE_ID, start: 'focus', moves: ['doing', 'done'] });
    await decide(db.pool, d, 'Yes');
    const y = await addTicket(db.pool);
    const n = await addTicket(db.pool);
    await lead(db.pool, d, y, 'Yes');
    await lead(db.pool, d, n, 'No');
    vi.mocked(promoteTargets).mockClear();
    expect(await sweep()).toEqual({ promoted: 1, settled: 0, refused: 0 });
    expect([await stateOf(db.pool, y), await stateOf(db.pool, n)]).toEqual(['todo', 'backlog']);
    expect(candidates()).toEqual([[WS, [n, y].sort()]]);

    // (c) a trashed and a draft target are never selected (LIVE_TICKET_WHERE); the control target beside them promotes
    const s = await finishedSource();
    const tt = await addTicket(db.pool);
    const td = await addTicket(db.pool);
    const tc = await addTicket(db.pool);
    for (const target of [tt, td, tc]) await lead(db.pool, s, target);
    await step(db.pool, tt, 'ticket.deleted', {});
    await db.pool.query('UPDATE proj_tickets SET draft_author_id = $1 WHERE ticket_id = $2', [PERSON, td]);
    vi.mocked(promoteTargets).mockClear();
    expect(await sweep()).toEqual({ promoted: 1, settled: 0, refused: 0 });
    expect([await stateOf(db.pool, tc), await stateOf(db.pool, tt), await stateOf(db.pool, td)]).toEqual(['todo', 'backlog', 'backlog']);
    expect(candidates()).toEqual([[WS, [n, tc].sort()]]); // n: the other label is still offered, and still declined

    // (d) a workflow whose initial state is terminal: skipped and logged, not refused
    const x = await finishedSource();
    const sh = await addTicket(db.pool, { typeId: SHIPPED_TASK });
    await lead(db.pool, x, sh);
    vi.mocked(promoteTargets).mockClear();
    expect(await sweep()).toEqual({ promoted: 0, settled: 0, refused: 0 });
    expect(await stateOf(db.pool, sh)).toBe('backlog');
    expect(candidates()).toEqual([[WS, [n, sh].sort()]]);
    expect(logs.filter((m) => /initial state .* terminal/.test(m))).toEqual([
      `flow promotion skipped for ticket ${sh}: the initial state shipped of its workflow is terminal`,
    ]);
  });
});

describe('29.227 refusals are counted', () => {
  it('29.227 a refused and an invalid submission both count in refused, summed across workspaces, and are logged; control: the real door promotes', async () => {
    // WS2's rows are written FIRST: a SELECT without its ORDER BY would hand WS2 over first, and the log order below would turn
    await seedWs2();
    const s2 = await ws2Ticket('focus', ['doing', 'done']);
    const u = await ws2Ticket();
    await ws2Lead(s2, u);
    const s = await finishedSource();
    const t = await addTicket(db.pool);
    await lead(db.pool, s, t);

    const refusing = stubIngest((e) => ({ status: 'refused', eventId: e.id, rule: 'illegal-transition', reason: 'no' }));
    expect(await sweep({ ingest: refusing })).toEqual({ promoted: 0, settled: 0, refused: 2 });
    expect(logs).toEqual([
      `flow promotion refused for ticket ${t}: illegal-transition: no`,
      `flow promotion refused for ticket ${u}: illegal-transition: no`,
    ]);
    logs.length = 0;
    const invalid = stubIngest((e) => ({ status: 'invalid', eventId: e.id, code: 'invalid-byte', message: 'y' }));
    expect(await sweep({ ingest: invalid })).toEqual({ promoted: 0, settled: 0, refused: 2 });
    expect(logs).toEqual([
      `flow promotion produced an INVALID envelope for ticket ${t}: invalid-byte: y`,
      `flow promotion produced an INVALID envelope for ticket ${u}: invalid-byte: y`,
    ]);
    expect([await stateOf(db.pool, t), await stateOf(db.pool, u)]).toEqual(['backlog', 'backlog']);
    // CONTROL: the real door commits both
    expect(await sweep()).toEqual({ promoted: 2, settled: 0, refused: 0 });
    expect([await stateOf(db.pool, t), await stateOf(db.pool, u)]).toEqual(['todo', 'todo']);
  });
});

describe('29.228 the interval the daemon reads', () => {
  it('29.228 FLOW_SWEEP_INTERVAL_MS defaults to 300000 when unset, empty or whitespace, and passes anything else through to the scheduler\'s check', () => {
    expect(flowSweepIntervalMs(undefined)).toBe(300000);
    expect(flowSweepIntervalMs('')).toBe(300000);
    expect(flowSweepIntervalMs('  ')).toBe(300000);
    // control: a set value is honoured, and a bad one is NOT clamped here (requirePositiveIntervalMs refuses it by name)
    expect(flowSweepIntervalMs('300')).toBe(300);
    expect(flowSweepIntervalMs('0')).toBe(0);
    expect(flowSweepIntervalMs('abc')).toBeNaN();
  });
});
