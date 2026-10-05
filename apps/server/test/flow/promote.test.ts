import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DECISION_TYPE_ID,
  makeEnvelope,
  newUlid,
  SYSTEM_ACTOR_FLOW,
  type EventEnvelope,
  type IngestResult,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import { buildApp } from '../../src/app.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { createFlowPromoter, FLOW_SERVER_CAP, promoteTargets, retargetsOf, triggeredByOf, type FlowPromoteDeps } from '../../src/flow/promote.js';
import { readFlow } from '../../src/flow/read-flow.js';
import type { CommittedEventListener, IngestService } from '../../src/ingest/ingest-service.js';
import { resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp } from '../helpers/read-app.js';
import {
  addTicket,
  ASSIGNEE,
  decide,
  KICKOFF_TASK,
  lead,
  ledger,
  PERSON,
  PROJECT,
  realIngest,
  seedFlowWorld,
  SHIPPED_TASK,
  stateOf,
  step,
  stepMany,
  TASK,
  unlink,
  WS,
} from './flow-world.js';

/**
 * wtg2 T13 (spec AP-1 to AP-5): the promoter. A committed event re-evaluates the Backlog tickets it can make due, and
 * `promoteTargets` files ONE `ticket.transitioned` per due target, to its workflow's first state, as the reserved Flow
 * actor with a `led-to` cause, through the real ingest (the real engine and projections).
 *
 * ## The world
 *
 * `flow-world.ts`, one database per case (the ledger cannot be truncated, and every report count below is a fact about
 * a world this case built). Setup goes in through `applyCommitted`, so no promoter has seen it: a case decides exactly
 * which event the code under test is handed, and a precondition read shows the target still in the Backlog first.
 *
 * ## Controls
 *
 * A trigger that did nothing and a promoter that does nothing look the same, so every "nothing happened" sits beside
 * a leg in the same `it` where the same shape DOES promote.
 */

const NOW = '2026-10-06T03:00:00.000Z';
let db: TestDatabase;
let logs: string[];
beforeEach(async () => {
  resetEntitySeqs();
  db = await createTestDatabase();
  await seedFlowWorld(db.pool);
  logs = [];
});
afterEach(async () => {
  await db.drop();
});

const deps = (over: Partial<FlowPromoteDeps> = {}): FlowPromoteDeps => ({
  pool: db.pool,
  ingest: realIngest(db.pool),
  log: (m) => logs.push(m),
  ...over,
});
const promoter = (over: Partial<FlowPromoteDeps> = {}) => createFlowPromoter(deps(over));
const finishing = async (s: string, actorId = PERSON) => step(db.pool, s, 'ticket.transitioned', { to: 'done' }, actorId);
/** A finished source and a source still in Doing. */
const finished = () => addTicket(db.pool, { start: 'focus', moves: ['doing', 'done'] });
const working = () => addTicket(db.pool, { start: 'focus', moves: ['doing'] });
const wait = async (t: string) => step(db.pool, t, 'ticket.field_set', { fieldId: 'waitForAll', value: true });
/** `n` fresh Backlog tickets in ascending id (`newUlid` is not ordered within a millisecond), one after another. */
async function sortedBacklog(n: 2, typeId?: string): Promise<[string, string]>;
async function sortedBacklog(n: 3, typeId?: string): Promise<[string, string, string]>;
async function sortedBacklog(n: number, typeId = TASK): Promise<string[]> {
  const out: string[] = [];
  for (let i = 0; i < n; i += 1) out.push(await addTicket(db.pool, { typeId }));
  return out.sort();
}
const refusingAll = {
  ingestBatch: async (events: SubmittedEvent[]): Promise<IngestResult[]> =>
    events.map((e) => ({ status: 'refused', eventId: e.id, rule: 'illegal-transition', reason: 'no' })),
};

describe('29.214 the committed finish files one led-to move', () => {
  it('29.214 ONE ticket.transitioned to the initial state, as the flow, origin server, cause led-to naming the source and its finisher', async () => {
    const s = await working();
    const t = await addTicket(db.pool, { assigneeId: ASSIGNEE });
    const k = await addTicket(db.pool, { typeId: KICKOFF_TASK });
    // An unrelated pending edge: x is finished and leads to u, and nothing x did is handed to the promoter here.
    const x = await finished();
    const u = await addTicket(db.pool);
    await lead(db.pool, x, u);
    // and s BLOCKS u: only a leads_to link out of the finished source re-targets
    await step(db.pool, s, 'ticket.link_added', { kind: 'blocks', targetId: u });
    const linkT = await lead(db.pool, s, t);
    const linkK = await lead(db.pool, s, k);
    const p = promoter({ now: () => new Date(NOW) });
    // control first: both link events re-target their target, so both are evaluated, and an open source promotes nothing
    await p.onCommitted(linkT);
    await p.onCommitted(linkK);
    expect([await stateOf(db.pool, t), await stateOf(db.pool, k)]).toEqual(['backlog', 'backlog']);
    expect(await ledger(db.pool, t, 'ticket.transitioned')).toEqual([]);
    // finished by a DIFFERENT person than the one who created and started it
    const finish = await finishing(s, ASSIGNEE);
    // the re-target: s's live Backlog leads_to targets, in id order; not u, which s only blocks
    expect(await retargetsOf(db.pool, finish)).toEqual([t, k].sort());
    await p.onCommitted(finish);
    expect(await stateOf(db.pool, t)).toBe('todo');
    expect(await stateOf(db.pool, k)).toBe('kickoff');
    expect(await ledger(db.pool, t, 'ticket.transitioned')).toEqual([
      { actor_id: SYSTEM_ACTOR_FLOW, origin: 'server', payload: { to: 'todo', cause: { kind: 'led-to', sourceTicketId: s, triggeredBy: ASSIGNEE } } },
    ]);
    const { rows } = await db.pool.query<{ client_time: Date }>(
      "SELECT client_time FROM events WHERE entity_id = $1 AND type = 'ticket.transitioned'", [t]);
    expect(rows.map((r) => r.client_time.toISOString())).toEqual([NOW]); // the claimed time is deps.now
    // only the finished source's targets were re-read: u's satisfied edge from x is not this event's business
    expect(await stateOf(db.pool, u)).toBe('backlog');
    // the same event, asked again, names nothing: t and k have left the Backlog
    expect(await retargetsOf(db.pool, finish)).toEqual([]);
  });

  it('29.214 a labelled edge carries its label on the cause', async () => {
    const d = await addTicket(db.pool, { typeId: DECISION_TYPE_ID, start: 'focus', moves: ['doing', 'done'] });
    const y = await addTicket(db.pool);
    await lead(db.pool, d, y, 'Yes');
    await promoter().onCommitted(await decide(db.pool, d, 'Yes'));
    expect((await ledger(db.pool, y, 'ticket.transitioned')).map((r) => r.payload)).toEqual([
      { to: 'todo', cause: { kind: 'led-to', sourceTicketId: d, label: 'Yes', triggeredBy: PERSON } },
    ]);
  });

  it('29.214 triggeredBy: the latest transition\'s person; a flow-filed one names its cause\'s person; none, the flow', async () => {
    const plain = await addTicket(db.pool); // never transitioned
    expect(await triggeredByOf(db.pool, plain)).toBe(SYSTEM_ACTOR_FLOW);
    const s = await working(); // PERSON's moves
    await finishing(s, ASSIGNEE);
    await step(db.pool, s, 'ticket.field_set', { fieldId: 'title', value: 'renamed' }, PERSON); // a later NON-transition
    expect(await triggeredByOf(db.pool, s)).toBe(ASSIGNEE);
    const led = await addTicket(db.pool);
    await step(db.pool, led, 'ticket.transitioned', { to: 'todo', cause: { kind: 'led-to', sourceTicketId: s, triggeredBy: ASSIGNEE } }, SYSTEM_ACTOR_FLOW);
    expect(await triggeredByOf(db.pool, led)).toBe(ASSIGNEE);
    const reset = await addTicket(db.pool, { start: 'focus' });
    const decidedBy = '01J9GDCB000000000000000000';
    await step(db.pool, reset, 'ticket.transitioned', {
      to: 'backlog', cause: { kind: 'reopened-by-flow', decisionTicketId: newUlid(), outcome: 'Loop', pass: 2, decidedBy, decisionEventId: newUlid() },
    }, SYSTEM_ACTOR_FLOW);
    expect(await triggeredByOf(db.pool, reset)).toBe(decidedBy);
    const bare = await addTicket(db.pool, { start: 'focus' });
    await step(db.pool, bare, 'ticket.transitioned', { to: 'doing' }, SYSTEM_ACTOR_FLOW); // the flow actor with no flow cause
    expect(await triggeredByOf(db.pool, bare)).toBe(SYSTEM_ACTOR_FLOW);
  });
});

describe('29.215 every AP-4 trigger re-evaluates the right target', () => {
  it('29.215 transition, decided, closed, reopened, deleted and restored on a source; a leads_to link added or removed; waitForAll; restored on a target; a published draft', async () => {
    const A = finished;
    const rows: Array<[string, () => Promise<{ event: EventEnvelope; target: string }>, boolean]> = [
      ['transitioned on a source', async () => { const s = await working(); const t = await addTicket(db.pool); await lead(db.pool, s, t); return { event: await finishing(s), target: t }; }, true],
      ['decided on a terminal Decision', async () => { const d = await addTicket(db.pool, { typeId: DECISION_TYPE_ID, start: 'focus', moves: ['doing', 'done'] }); const t = await addTicket(db.pool); await lead(db.pool, d, t, 'Yes'); return { event: await decide(db.pool, d, 'Yes'), target: t }; }, true],
      ['closed on a finished source', async () => { const s = await A(); const t = await addTicket(db.pool); await lead(db.pool, s, t); return { event: await step(db.pool, s, 'ticket.closed', {}), target: t }; }, true],
      ['reopened on a source', async () => { const s = await A(); const t = await addTicket(db.pool); await lead(db.pool, s, t); await step(db.pool, s, 'ticket.closed', {}); return { event: await step(db.pool, s, 'ticket.reopened', {}), target: t }; }, true],
      ['deleted on a source holding a waitForAll target', async () => { const [a, b, t] = [await A(), await working(), await addTicket(db.pool)]; await wait(t); await lead(db.pool, a, t); await lead(db.pool, b, t); return { event: await step(db.pool, b, 'ticket.deleted', {}), target: t }; }, true],
      ['restored on a source', async () => { const s = await A(); const t = await addTicket(db.pool); await lead(db.pool, s, t); await step(db.pool, s, 'ticket.deleted', {}); return { event: await step(db.pool, s, 'ticket.restored', {}), target: t }; }, true],
      ['leads_to link added', async () => { const s = await A(); const t = await addTicket(db.pool); return { event: await lead(db.pool, s, t), target: t }; }, true],
      ['leads_to link removed', async () => { const [a, b, t] = [await A(), await working(), await addTicket(db.pool)]; await wait(t); await lead(db.pool, a, t); await lead(db.pool, b, t); return { event: await unlink(db.pool, b, t), target: t }; }, true],
      ['waitForAll cleared on the target', async () => { const [a, b, t] = [await A(), await working(), await addTicket(db.pool)]; await wait(t); await lead(db.pool, a, t); await lead(db.pool, b, t); return { event: await step(db.pool, t, 'ticket.field_set', { fieldId: 'waitForAll', value: null }), target: t }; }, true],
      ['restored on the target', async () => { const s = await A(); const t = await addTicket(db.pool); await lead(db.pool, s, t); await step(db.pool, t, 'ticket.deleted', {}); return { event: await step(db.pool, t, 'ticket.restored', {}), target: t }; }, true],
      ['published draft (hand-built Drafts event, R55)', async () => { const s = await A(); const t = await addTicket(db.pool); await lead(db.pool, s, t); return { event: makeEnvelope({ type: 'ticket.published', workspaceId: WS, entity: { kind: 'ticket', id: t }, payload: { projectId: PROJECT } }), target: t }; }, true],
      ['CONTROL a blocks link', async () => { const s = await A(); const t = await addTicket(db.pool); const o = await addTicket(db.pool); await lead(db.pool, s, t); return { event: await step(db.pool, o, 'ticket.link_added', { kind: 'blocks', targetId: t }), target: t }; }, false],
      ['CONTROL a draft-side (from) link', async () => { const s = await A(); const t = await addTicket(db.pool); await lead(db.pool, s, t); return { event: makeEnvelope({ type: 'ticket.link_added', workspaceId: WS, entity: { kind: 'ticket', id: t }, payload: { kind: 'leads_to', targetId: t, from: s } }), target: t }; }, false],
      ['CONTROL an assignment', async () => { const s = await A(); const t = await addTicket(db.pool); await lead(db.pool, s, t); return { event: await step(db.pool, t, 'ticket.assigned', { assigneeId: ASSIGNEE }), target: t }; }, false],
      ['CONTROL a title edit', async () => { const s = await A(); const t = await addTicket(db.pool); await lead(db.pool, s, t); return { event: await step(db.pool, t, 'ticket.field_set', { fieldId: 'title', value: 'x' }), target: t }; }, false],
      // The source's own non-trigger event: its outgoing edges are re-read only for a source-side type.
      ['CONTROL a title edit on the source', async () => { const s = await A(); const t = await addTicket(db.pool); await lead(db.pool, s, t); return { event: await step(db.pool, s, 'ticket.field_set', { fieldId: 'title', value: 'x' }), target: t }; }, false],
    ];
    for (const [name, build, promotes] of rows) {
      const { event, target } = await build();
      expect([name, await stateOf(db.pool, target)]).toEqual([name, 'backlog']); // precondition: nothing ran onCommitted yet
      await promoter().onCommitted(event);
      expect([name, await stateOf(db.pool, target)]).toEqual([name, promotes ? 'todo' : 'backlog']);
    }
  });

  it('29.215 a draft target is never promoted (R39); its publish re-evaluates it', async () => {
    const s = await working();
    const t = await addTicket(db.pool, { draft: true });
    // the draft-side form a published source's link into a draft takes (drafts R42): filed on the draft's stream, keyed by its source
    const link = await step(db.pool, t, 'ticket.link_added', { kind: 'leads_to', targetId: t, from: s });
    await promoter().onCommitted(link);
    const finish = await finishing(s); // the source finishes while t is still a draft
    expect(await retargetsOf(db.pool, finish)).toEqual([]); // the draft's link row (source s) is there; the draft is not live
    await promoter().onCommitted(finish);
    expect(await stateOf(db.pool, t)).toBe('backlog');
    const published = await step(db.pool, t, 'ticket.published', { projectId: PROJECT });
    expect(await retargetsOf(db.pool, finish)).toEqual([t]); // control: the same finish names t once it is published
    await promoter().onCommitted(published);
    expect(await stateOf(db.pool, t)).toBe('todo');
  });

  it('29.215 a target-side trigger re-reads its own ticket, never the tickets IT leads to', async () => {
    const t = await addTicket(db.pool);
    const u = await addTicket(db.pool);
    await lead(db.pool, t, u); // t leads to u, a live Backlog ticket: t's own Backlog triggers must not name u
    const on = (type: string, payload: Record<string, unknown>) =>
      makeEnvelope({ type, workspaceId: WS, entity: { kind: 'ticket', id: t }, payload }); // hand-built, never applied
    expect(await retargetsOf(db.pool, on('ticket.field_set', { fieldId: 'waitForAll', value: true }))).toEqual([t]);
    expect(await retargetsOf(db.pool, on('ticket.published', { projectId: PROJECT }))).toEqual([t]);
    expect(await retargetsOf(db.pool, on('ticket.restored', {}))).toEqual([t, u].sort()); // restored is both: its own and its outgoing
    expect(await retargetsOf(db.pool, on('ticket.closed', {}))).toEqual([u]); // control: a source-side event re-reads what t leads to
  });
});

describe('29.216 a person\'s Send to backlog sticks', () => {
  it('29.216 a person\'s Send to backlog on a promoted target sticks; the next real change and a flow-caused move into Backlog promote it again', async () => {
    const s = await working();
    const t = await addTicket(db.pool);
    await lead(db.pool, s, t);
    await promoter().onCommitted(await finishing(s));
    expect(await stateOf(db.pool, t)).toBe('todo'); // precondition: promoted
    const back = await step(db.pool, t, 'ticket.transitioned', { to: 'backlog' }, PERSON);
    await promoter().onCommitted(back);
    expect(await stateOf(db.pool, t)).toBe('backlog');
    // control: the next real change (the source finishing again) promotes it again
    await step(db.pool, s, 'ticket.transitioned', { to: 'doing' });
    await promoter().onCommitted(await finishing(s));
    expect(await stateOf(db.pool, t)).toBe('todo');
    // a flow-caused move into Backlog (a loop reset, PS-5.3) IS evaluated for the moved ticket itself
    const reset = await step(db.pool, t, 'ticket.transitioned', {
      to: 'backlog', cause: { kind: 'reopened-by-flow', decisionTicketId: newUlid(), outcome: 'Loop', pass: 2, decidedBy: PERSON, decisionEventId: newUlid() },
    }, SYSTEM_ACTOR_FLOW);
    expect(await stateOf(db.pool, t)).toBe('backlog'); // precondition
    await promoter().onCommitted(reset);
    expect(await stateOf(db.pool, t)).toBe('todo');
  });

  it('29.216 the self-trigger needs BOTH the flow actor and a flow cause', async () => {
    const s = await finished();
    const t = await addTicket(db.pool);
    await lead(db.pool, s, t);
    const cause = { kind: 'reopened-by-flow', decisionTicketId: newUlid(), outcome: 'Loop', pass: 2, decidedBy: PERSON, decisionEventId: newUlid() };
    const into = (actorId: string, payload: Record<string, unknown>) =>
      makeEnvelope({ type: 'ticket.transitioned', workspaceId: WS, actorId, entity: { kind: 'ticket', id: t }, payload });
    // hand-built (never applied): t already sits in the Backlog behind a satisfied edge, so a wrong trigger promotes it
    await promoter().onCommitted(into(PERSON, { to: 'backlog', cause })); // a person's (forged) flow cause
    await promoter().onCommitted(into(SYSTEM_ACTOR_FLOW, { to: 'backlog' })); // the flow actor with no cause
    expect(await stateOf(db.pool, t)).toBe('backlog');
    await promoter().onCommitted(into(SYSTEM_ACTOR_FLOW, { to: 'backlog', cause })); // control: both
    expect(await stateOf(db.pool, t)).toBe('todo');
  });
});

describe('29.217 a hidden source counts', () => {
  it('29.217 a source the viewer cannot see still counts; a viewer-scoped read of the same flow does not contain it', async () => {
    const rdb = await createTestDatabase();
    const rw = await buildReadTestApp(rdb);
    try {
      const ws = rw.world.workspaceId;
      const owner = rw.userIds.owner;
      const member = rw.userIds.member;
      const s = rw.world.hiddenTaskId; // the owner's alone
      const t = rw.world.sharedTaskId; // the owner's and the member's
      await step(rdb.pool, s, 'ticket.transitioned', { to: 'doing' }, owner, ws);
      await step(rdb.pool, s, 'ticket.transitioned', { to: 'done' }, owner, ws);
      await step(rdb.pool, t, 'ticket.transitioned', { to: 'backlog' }, owner, ws);
      await step(rdb.pool, s, 'ticket.link_added', { kind: 'leads_to', targetId: t }, owner, ws);
      expect(await stateOf(rdb.pool, t)).toBe('backlog'); // precondition
      // control: the member reads t and not s; the system read has both
      const asMember = await readFlow(rdb.pool, { workspaceId: ws, seedId: t, viewerId: member, cap: 300 });
      expect(asMember.nodes.map((n) => n.id)).toEqual([t]);
      const asSystem = await readFlow(rdb.pool, { workspaceId: ws, seedId: t, viewerId: null, cap: 300 });
      expect(asSystem.nodes.map((n) => n.id)).toEqual([t, s]);
      // the trigger is the MEMBER's (AP-4: waitForAll set on the target)
      const on = await step(rdb.pool, t, 'ticket.field_set', { fieldId: 'waitForAll', value: true }, member, ws);
      await createFlowPromoter({ pool: rdb.pool, ingest: realIngest(rdb.pool), log: (m) => logs.push(m) }).onCommitted(on);
      expect(await stateOf(rdb.pool, t)).toBe('todo');
      expect((await ledger(rdb.pool, t, 'ticket.transitioned')).at(-1)?.payload).toEqual({
        to: 'todo', cause: { kind: 'led-to', sourceTicketId: s, triggeredBy: owner },
      });
    } finally {
      await rw.app.close();
      await rdb.drop();
    }
  });
});

describe('29.218 a terminal initial state', () => {
  it('29.218 a workflow whose initial state is terminal is skipped and logged; a default-workflow target in the same call promotes', async () => {
    const s = await finished();
    const shipped = await addTicket(db.pool, { typeId: SHIPPED_TASK });
    const t = await addTicket(db.pool);
    await lead(db.pool, s, shipped);
    await lead(db.pool, s, t);
    expect(await promoteTargets(deps(), WS, [shipped, t])).toEqual({ promoted: 1, refused: 0, skipped: 1 });
    expect(await stateOf(db.pool, shipped)).toBe('backlog');
    expect(await stateOf(db.pool, t)).toBe('todo');
    expect(logs).toEqual([`flow promotion skipped for ticket ${shipped}: the initial state shipped of its workflow is terminal`]);
    expect(logs.filter((l) => /initial state .* terminal/.test(l))).toHaveLength(1);
    // the second element: two such targets in one flow are BOTH skipped
    const s2 = await finished();
    const [sh1, sh2] = await sortedBacklog(2, SHIPPED_TASK);
    await lead(db.pool, s2, sh1);
    await lead(db.pool, s2, sh2);
    expect(await promoteTargets(deps(), WS, [sh2, sh1])).toEqual({ promoted: 0, refused: 0, skipped: 2 });
    expect([await stateOf(db.pool, sh1), await stateOf(db.pool, sh2)]).toEqual(['backlog', 'backlog']);
    expect(logs.slice(1)).toEqual([sh1, sh2].map((id) => `flow promotion skipped for ticket ${id}: the initial state shipped of its workflow is terminal`));
  });
});

describe('29.219 refused, idempotent', () => {
  it('29.219 a refused or invalid submission is counted and logged, never thrown; a second run files nothing', async () => {
    const s = await finished();
    const t = await addTicket(db.pool);
    await lead(db.pool, s, t);
    expect(await promoteTargets(deps({ ingest: refusingAll }), WS, [t])).toEqual({ promoted: 0, refused: 1, skipped: 0 });
    expect(logs).toEqual([`flow promotion refused for ticket ${t}: illegal-transition: no`]);
    logs.length = 0;
    const invalid = {
      ingestBatch: async (events: SubmittedEvent[]): Promise<IngestResult[]> =>
        events.map((e) => ({ status: 'invalid', eventId: e.id, code: 'x' as never, message: 'y' })),
    };
    expect(await promoteTargets(deps({ ingest: invalid }), WS, [t])).toEqual({ promoted: 0, refused: 1, skipped: 0 });
    expect(logs).toEqual([`flow promotion produced an INVALID envelope for ticket ${t}: x: y`]);
    expect(await stateOf(db.pool, t)).toBe('backlog');
    // a real promotion twice: the second finds nothing in the Backlog
    expect(await promoteTargets(deps(), WS, [t])).toEqual({ promoted: 1, refused: 0, skipped: 0 });
    expect(await promoteTargets(deps(), WS, [t])).toEqual({ promoted: 0, refused: 0, skipped: 0 });
    expect((await ledger(db.pool, t, 'ticket.transitioned')).filter((r) => (r.payload['cause'] as { kind?: string } | undefined)?.kind === 'led-to')).toHaveLength(1);
    // the listener never rejects on a refusal either
    await expect(promoter({ ingest: refusingAll }).onCommitted(await lead(db.pool, s, await addTicket(db.pool)))).resolves.toBeUndefined();
  });

  it('29.219 one batch per flow; each result is counted against its own event', async () => {
    const s = await finished();
    const [a, b] = await sortedBacklog(2);
    await lead(db.pool, s, a);
    await lead(db.pool, s, b);
    const batches: string[][] = [];
    // records without applying, commits the first and refuses the second
    const mixed = {
      ingestBatch: async (events: SubmittedEvent[]): Promise<IngestResult[]> => {
        batches.push(events.map((e) => e.entity.id));
        return events.map((e, i): IngestResult => (i === 0
          ? { status: 'committed', eventId: e.id, seq: 1, serverTime: NOW }
          : { status: 'refused', eventId: e.id, rule: 'illegal-transition', reason: 'no' }));
      },
    };
    expect(await promoteTargets(deps({ ingest: mixed }), WS, [b, a])).toEqual({ promoted: 1, refused: 1, skipped: 0 });
    expect(batches).toEqual([[a, b]]); // b's flow is a's flow: read and filed once, in id order
    expect(logs).toEqual([`flow promotion refused for ticket ${b}: illegal-transition: no`]);
  });
});

describe('29.220 the server cap', () => {
  it('29.220 a flow larger than the server cap is skipped and logged, not half-evaluated', async () => {
    const [lo, hi] = await sortedBacklog(2);
    for (const to of ['todo', 'doing', 'done']) await step(db.pool, lo, 'ticket.transitioned', { to });
    for (const to of ['todo', 'doing']) await step(db.pool, hi, 'ticket.transitioned', { to });
    const t = await addTicket(db.pool);
    await wait(t);
    await lead(db.pool, lo, t);
    await lead(db.pool, hi, t);
    // the read keeps the seed, then ring 1 in ascending id: nodes [t, lo], hi cut, truncated
    expect(await promoteTargets(deps({ flowCap: 2 }), WS, [t])).toEqual({ promoted: 0, refused: 0, skipped: 1 });
    expect(await stateOf(db.pool, t)).toBe('backlog');
    expect(logs).toEqual([`flow promotion skipped: the flow around ticket ${t} is truncated at 2 tickets`]);
    // controls at the default cap: the whole read sees hi holding it; then hi finishes and it promotes
    expect(await promoteTargets(deps(), WS, [t])).toEqual({ promoted: 0, refused: 0, skipped: 0 });
    expect(await stateOf(db.pool, t)).toBe('backlog');
    await step(db.pool, hi, 'ticket.transitioned', { to: 'done' });
    expect(await promoteTargets(deps(), WS, [t])).toEqual({ promoted: 1, refused: 0, skipped: 0 });
    expect(await stateOf(db.pool, t)).toBe('todo');
  });

  it('29.220 the other flows of the same call are still evaluated, whatever the first one did', async () => {
    // three targets in ascending id: x and y share a flow (one source), z has its own
    const [x, y, z] = await sortedBacklog(3);
    const s1 = await finished();
    const s2 = await finished();
    await lead(db.pool, s1, x);
    await lead(db.pool, s1, y);
    await lead(db.pool, s2, z);
    expect(await promoteTargets(deps(), WS, [x, y, z])).toEqual({ promoted: 3, refused: 0, skipped: 0 });
    // a flow with nothing due, then one with a promotion
    const [p, q] = await sortedBacklog(2);
    await lead(db.pool, await working(), p);
    await lead(db.pool, await finished(), q);
    expect(await promoteTargets(deps(), WS, [p, q])).toEqual({ promoted: 1, refused: 0, skipped: 0 });
    expect([await stateOf(db.pool, p), await stateOf(db.pool, q)]).toEqual(['backlog', 'todo']);
    // a truncated flow, then a small one
    const [c, r] = await sortedBacklog(2);
    for (const src of [await finished(), await finished()]) await lead(db.pool, src, c);
    await lead(db.pool, await finished(), r);
    expect(await promoteTargets(deps({ flowCap: 2 }), WS, [c, r])).toEqual({ promoted: 1, refused: 0, skipped: 1 });
    expect([await stateOf(db.pool, c), await stateOf(db.pool, r)]).toEqual(['backlog', 'todo']);
  });

  it('29.220 the server reads past the UI cap: FLOW_SERVER_CAP is 2000, and a 302-ticket flow promotes at the default', async () => {
    expect(FLOW_SERVER_CAP).toBe(2000);
    const t = await addTicket(db.pool);
    const sources = Array.from({ length: 301 }, () => newUlid());
    await stepMany(db.pool, sources.flatMap((id) => [
      { ticketId: id, type: 'ticket.created', payload: { typeId: TASK, projectId: PROJECT, parentId: null, title: 'S', start: 'focus' } },
      { ticketId: id, type: 'ticket.transitioned', payload: { to: 'done' } }, // no engine here: one move, no Doing period needed
      { ticketId: id, type: 'ticket.link_added', payload: { kind: 'leads_to', targetId: t } },
    ]));
    // control: at the UI's cap (300, FL-2) the same flow is truncated
    expect(await promoteTargets(deps({ flowCap: 300 }), WS, [t])).toEqual({ promoted: 0, refused: 0, skipped: 1 });
    expect(await promoteTargets(deps(), WS, [t])).toEqual({ promoted: 1, refused: 0, skipped: 0 });
    expect(await stateOf(db.pool, t)).toBe('todo');
  });
});

describe('29.221 the app wiring', () => {
  it('29.221 buildApp subscribes the promoter on the commit feed, fire-and-forget, and unsubscribes it on close', async () => {
    const s = await working();
    const t = await addTicket(db.pool);
    await lead(db.pool, s, t);
    const finishingEvent = await finishing(s);
    const listeners: CommittedEventListener[] = [];
    const recordingIngest: IngestService = {
      ingestBatch: async () => [],
      ingestClientBatch: async () => [],
      ingestAtomic: async () => ({ status: 'committed', results: [] }),
      ingestClientAtomic: async () => ({ status: 'committed', results: [] }),
      // the returned function REMOVES the listener (fanout.test.ts 'boot wiring': a no-op unsubscribe cannot tell a hook from none)
      onEventCommitted: (listener) => {
        listeners.push(listener);
        return () => {
          const at = listeners.indexOf(listener);
          if (at >= 0) listeners.splice(at, 1);
        };
      },
    };
    const sent: SubmittedEvent[] = [];
    // the internal door, recording without applying: t stays in the Backlog, so a live promoter WOULD file again
    const serverAppend = async (events: SubmittedEvent[]): Promise<IngestResult[]> => {
      sent.push(...events);
      return events.map((e) => ({ status: 'committed', eventId: e.id, seq: 1, serverTime: NOW }));
    };
    const app = buildApp({
      db: { query: async () => [{ ok: 1 }] },
      pool: db.pool,
      ingest: recordingIngest,
      auth: createAuth({
        pool: db.pool,
        otpSender: new LogOtpSender(() => {}),
        magicLinkSender: new LogMagicLinkSender(() => {}),
        baseUrl: 'http://localhost:3000',
        secret: 'test-secret-not-used-anywhere-real',
        webOrigin: 'http://localhost:3001',
      }),
      serverAppend,
      webOrigin: 'http://localhost:3001',
      store: createObjectStoreFromEnv({}),
    });
    for (const l of [...listeners]) l(finishingEvent);
    await vi.waitFor(() => expect(sent.map((e) => e.type)).toEqual(['ticket.transitioned']), { timeout: 5000 });
    expect(sent[0]).toMatchObject({ actorId: SYSTEM_ACTOR_FLOW, origin: 'server', entity: { kind: 'ticket', id: t } });
    // after close nothing is subscribed: the hub and the fan-out let go too, so a promoter never unsubscribed is still here
    await app.close();
    expect(listeners).toEqual([]);
    for (const l of [...listeners]) l(finishingEvent);
    expect(sent).toHaveLength(1);
  });

  it('29.221 a throwing read is logged and does not reject', async () => {
    const s = await working();
    const finishingEvent = await finishing(s);
    const broken = createFlowPromoter({
      pool: { query: async () => { throw new Error('db down'); } } as never,
      ingest: refusingAll,
      log: (m) => logs.push(m),
    });
    await expect(broken.onCommitted(finishingEvent)).resolves.toBeUndefined();
    expect(logs).toEqual([`flow promotion failed for event ${finishingEvent.id}`]);
  });
});
