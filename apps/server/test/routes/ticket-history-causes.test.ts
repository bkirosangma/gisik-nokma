import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { keysForAncestors } from '../../src/read/ancestry.js';
import { annotateFlowCauses } from '../../src/read/history-causes.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

let db: TestDatabase;
let read: ReadWorld;
beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
}, 120_000);
afterAll(async () => {
  await read.app.close();
  await db.drop();
});

type Served = { id: string; payload: { cause?: Record<string, unknown> }; causeTicket?: { key: string | null } | null };

describe('29.373 History annotates a flow cause per viewer', () => {
  it('29.373 a page with no flow cause asks the database nothing more; one flow cause costs one lookup', async () => {
    const calls: unknown[] = [];
    const fake = { query: async (...args: unknown[]) => (calls.push(args), { rows: [] }) } as unknown as Parameters<typeof annotateFlowCauses>[0];
    const sees = async (): Promise<boolean> => true;
    type Events = Parameters<typeof annotateFlowCauses>[2];
    const plain = [{ id: 'a', payload: {} }, { id: 'b', payload: { cause: { kind: 'reopened-for-child', childTicketId: newUlid() } } }] as unknown as Events;
    await annotateFlowCauses(fake, sees, plain);
    expect(calls).toEqual([]);
    expect(plain[0]).not.toHaveProperty('causeTicket');
    // CONTROL: the same fake is reached when the page holds a flow cause (unknown ticket: withheld)
    const caused = [{ id: 'c', payload: { cause: { kind: 'led-to', sourceTicketId: newUlid(), triggeredBy: newUlid() } } }] as unknown as Events;
    await annotateFlowCauses(fake, sees, caused);
    expect(calls).toHaveLength(1);
    expect(caused[0]?.causeTicket).toBeNull();
  });

  it('29.373 a visible ticket is keyed with the cause whole; a hidden one is null and its ids and people are nulled, the keys kept', async () => {
    const { workspaceId: WS, taskInEpicId: S, sharedTaskId: SH, hiddenTaskId: H } = read.world;
    // Two deciders: the visible close goes out WHOLE (its `decidedBy` is in the member's body by design), so the
    // hidden reopen's decider must be a different id for the `not.toContain(DECIDER)` leg to pass on correct code.
    const TRIG = newUlid();
    const HIDDEN_TRIG = newUlid();
    const DECIDER = newUlid();
    const SEEN_DECIDER = newUlid();
    const DEC_EVENT = newUlid();
    const file = (type: string, payload: unknown) => makeCommitted({ workspaceId: WS, actorId: read.world.owner, entity: { kind: 'ticket', id: S }, type, payload });
    const ledVisible = file('ticket.transitioned', { to: 'doing', cause: { kind: 'led-to', sourceTicketId: SH, triggeredBy: TRIG } });
    const ledHidden = file('ticket.transitioned', { to: 'todo', cause: { kind: 'led-to', sourceTicketId: H, label: 'Yes', triggeredBy: HIDDEN_TRIG } });
    const reopenHidden = file('ticket.reopened', { cause: { kind: 'reopened-by-flow', decisionTicketId: H, outcome: 'No', pass: 1, decidedBy: DECIDER, decisionEventId: DEC_EVENT } });
    const closedVisible = file('ticket.closed', { cause: { kind: 'branch-not-taken', decisionTicketId: SH, outcome: 'Yes', pass: 1, decidedBy: SEEN_DECIDER, decisionEventId: DEC_EVENT } });
    const plain = file('ticket.transitioned', { to: 'doing' });
    await applyCommitted(db.pool, [ledVisible, ledHidden, reopenHidden, closedVisible, plain]);

    const history = async (role: ReadRole): Promise<{ body: string; byId: Map<string, Served> }> => {
      const response = await read.app.inject({ method: 'GET', url: `/v1/tickets/${S}/history`, headers: read.authOf(role) });
      expect(response.statusCode).toBe(200);
      return { body: response.body, byId: new Map((response.json() as { events: Served[] }).events.map((x) => [x.id, x])) };
    };
    const keys = await keysForAncestors(db.pool, WS, [{ ticketId: SH, projectId: read.world.projectId }, { ticketId: H, projectId: read.world.projectId }]);
    expect(keys.get(SH)).toMatch(/-\d+$/);

    const member = await history('member');
    expect(member.byId.get(ledVisible.id)?.causeTicket).toEqual({ key: keys.get(SH) });
    expect(member.byId.get(ledVisible.id)?.payload.cause).toEqual({ kind: 'led-to', sourceTicketId: SH, triggeredBy: TRIG });
    expect(member.byId.get(closedVisible.id)?.causeTicket).toEqual({ key: keys.get(SH) });
    expect(member.byId.get(closedVisible.id)?.payload.cause).toEqual({
      kind: 'branch-not-taken', decisionTicketId: SH, outcome: 'Yes', pass: 1, decidedBy: SEEN_DECIDER, decisionEventId: DEC_EVENT,
    }); // visible: whole
    expect(member.byId.get(ledHidden.id)?.causeTicket).toBeNull();
    // AMEND 2: the withheld ids are NULLED with their keys present, never dropped
    expect(member.byId.get(ledHidden.id)?.payload.cause).toEqual({ kind: 'led-to', sourceTicketId: null, label: 'Yes', triggeredBy: null });
    // planner 02:37 (3): only the keys the kind HAS are nulled; a led-to cause gains no decision keys
    expect(Object.keys(member.byId.get(ledHidden.id)?.payload.cause ?? {}).sort()).toEqual(['kind', 'label', 'sourceTicketId', 'triggeredBy']);
    expect(member.byId.get(ledHidden.id)?.payload.cause).not.toHaveProperty('decisionTicketId');
    expect(member.byId.get(ledHidden.id)?.payload.cause).not.toHaveProperty('decidedBy');
    expect(member.byId.get(reopenHidden.id)?.causeTicket).toBeNull();
    expect(member.byId.get(reopenHidden.id)?.payload.cause).toEqual({
      kind: 'reopened-by-flow', decisionTicketId: null, outcome: 'No', pass: 1, decidedBy: null, decisionEventId: DEC_EVENT,
    });
    expect(Object.keys(member.byId.get(reopenHidden.id)?.payload.cause ?? {}).sort()).toEqual(['decidedBy', 'decisionEventId', 'decisionTicketId', 'kind', 'outcome', 'pass']);
    for (const secret of [H, DECIDER, HIDDEN_TRIG]) expect(member.body, `member body leaks ${secret}`).not.toContain(secret);
    // control: an event with no flow cause carries no annotation and an untouched payload
    expect(member.byId.get(plain.id)).not.toHaveProperty('causeTicket');
    expect(member.byId.get(plain.id)?.payload).toEqual({ to: 'doing' });
    // control: the owner sees the hidden ticket, so nothing is withheld from them
    const owner = await history('owner');
    expect(owner.byId.get(ledHidden.id)?.causeTicket).toEqual({ key: keys.get(H) });
    expect(owner.byId.get(ledHidden.id)?.payload.cause).toEqual({ kind: 'led-to', sourceTicketId: H, label: 'Yes', triggeredBy: HIDDEN_TRIG });
    expect(owner.byId.get(reopenHidden.id)?.payload.cause).toMatchObject({ decisionTicketId: H, decidedBy: DECIDER });
    expect(owner.body).toContain(H);
  });
});
