import { describe, expect, it } from 'vitest';
import {
  applyTicketEvent,
  BUILTIN_TICKET_TYPE_SEEDS,
  builtinTicketTypeDefs,
  DECISION_TYPE_ID,
  DEEPEST_RANK,
  domainRegistry,
  makeEnvelope,
  newUlid,
  parseEvent,
  releaseOutcome,
  TICKET_EVENT_TYPES,
  ticketDecidedPayload,
  ticketTypeDefSchema,
  type TicketState,
  type TicketStateDeps,
} from '../src/index.js';

const SOURCE = newUlid();
const OTHER = newUlid();
const PROJECT = '01J9GPRJ000000000000000000';
const A = '01J9GACT000000000000000001';
const B = '01J9GACT000000000000000002';
const T1 = '2026-10-03T09:00:00.000Z';
const T2 = '2026-10-03T09:05:00.000Z';
const T3 = '2026-10-03T09:10:00.000Z';
const T4 = '2026-10-03T09:15:00.000Z';

// The same one-workflow world `ticket-link-events.test.ts` folds in; a decision never reads it, `ticket.created` does.
const deps: TicketStateDeps = {
  getTicketType: (id) =>
    id === 'task' ? { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-basic', fields: [] } : undefined,
  getWorkflow: (id) =>
    id === 'wf-basic'
      ? {
          id: 'wf-basic',
          version: 1,
          name: 'Basic',
          initialStateId: 'todo',
          states: [{ id: 'todo', name: 'To do', category: 'open' }],
          transitions: [{ from: '*', to: 'todo', rules: [] }],
        }
      : undefined,
};

function bornState(): TicketState {
  return applyTicketEvent(
    undefined,
    makeEnvelope({
      type: 'ticket.created',
      entity: { kind: 'ticket', id: SOURCE },
      payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: 'File the GST return' },
    }),
    deps,
  );
}

const decided = (
  outcome: string | null,
  o: { from?: string | null; actorId?: string; serverTime?: string; closeStarted?: string[] } = {},
) =>
  makeEnvelope({
    type: 'ticket.decided',
    entity: { kind: 'ticket', id: SOURCE },
    payload: {
      outcome,
      ...(o.from === undefined ? {} : { from: o.from }),
      ...(o.closeStarted === undefined ? {} : { closeStarted: o.closeStarted }),
    },
    ...(o.actorId === undefined ? {} : { actorId: o.actorId }),
    ...(o.serverTime === undefined ? {} : { serverTime: o.serverTime }),
  });

describe('29.134 the Decision seed', () => {
  it('29.134 a fifth built-in at rank 3 beside Task, DEEPEST_RANK unmoved, every materialised def parses', () => {
    expect(DECISION_TYPE_ID).toBe('decision');
    expect(BUILTIN_TICKET_TYPE_SEEDS.find((s) => s.id === DECISION_TYPE_ID)).toEqual({
      id: 'decision',
      name: 'Decision',
      icon: 'diamond',
      rank: 3,
    });
    expect(BUILTIN_TICKET_TYPE_SEEDS.map((s) => s.id)).toEqual(['epic', 'story', 'task', 'sub-task', 'decision']);
    expect(DEEPEST_RANK).toBe(4); // control: the floor is still the sub-task's
    const defs = builtinTicketTypeDefs('wf-default');
    expect(defs).toHaveLength(5);
    for (const def of defs) {
      expect(ticketTypeDefSchema.parse(def)).toEqual(def);
      expect(def.workflowId).toBe('wf-default');
      expect(def.fields).toEqual([]);
    }
  });
});

describe('29.135 ticket.decided payload and registration', () => {
  it('29.135 outcome REQUIRED and nullable; from and closeStarted optional; blank, 61 characters, extra members and non-ULID ids refused', () => {
    const ok = (p: unknown) => ticketDecidedPayload.safeParse(p).success;
    expect(ok({ outcome: 'Yes' })).toBe(true);
    expect(ok({ outcome: null })).toBe(true);
    expect(ok({ outcome: 'No', from: 'Yes' })).toBe(true);
    expect(ok({ outcome: 'No', from: null })).toBe(true);
    expect(ok({ outcome: 'Yes', closeStarted: [OTHER] })).toBe(true);
    expect(ok({})).toBe(false); // absent is not a clear
    expect(ok({ outcome: '   ' })).toBe(false);
    expect(ok({ outcome: 'x'.repeat(61) })).toBe(false);
    expect(ok({ outcome: 'x'.repeat(60) })).toBe(true); // control: the boundary
    expect(ok({ outcome: 'Yes', note: 'x' })).toBe(false);
    expect(ok({ outcome: 'Yes', closeStarted: ['GN-146'] })).toBe(false);
    expect(ok({ outcome: 'Yes', closeStarted: Array.from({ length: 51 }, () => newUlid()) })).toBe(false);
    expect(ok({ outcome: 'Yes', closeStarted: Array.from({ length: 50 }, () => newUlid()) })).toBe(true);
  });
  it('29.135 registered once at v1 against ticket only, folded (in TICKET_EVENT_TYPES), refused against a note', () => {
    expect(domainRegistry.get('ticket.decided', 1)?.entityKind).toBe('ticket');
    expect((TICKET_EVENT_TYPES as readonly string[]).includes('ticket.decided')).toBe(true);
    const keys = domainRegistry.registrations().map((r) => `${r.type}@${r.version}`);
    expect(keys.filter((k) => k === 'ticket.decided@1')).toHaveLength(1);
    const { serverTime: _s, seq: _q, ...onNote } = decided('Yes');
    expect(parseEvent({ ...onNote, entity: { kind: 'note', id: SOURCE } }).ok).toBe(false); // control
    expect(parseEvent(onNote).ok).toBe(true);
  });
});

describe('29.136 the current outcome', () => {
  it('29.136 absent until chosen, then the latest choice; a clear removes the key; from and closeStarted are not folded', () => {
    const born = bornState();
    expect('outcome' in born).toBe(false);
    expect('passes' in born).toBe(false); // control: absent, never null or []
    const yes = applyTicketEvent(born, decided('Yes'), deps);
    expect(yes.outcome).toBe('Yes');
    const no = applyTicketEvent(yes, decided('No', { from: 'Yes' }), deps);
    expect(no.outcome).toBe('No');
    // `from` is not folded under ANY name: the fold adds exactly these two keys to the born state
    expect(Object.keys(no).filter((k) => !(k in born)).sort()).toEqual(['outcome', 'passes']);
    const cleared = applyTicketEvent(no, decided(null, { from: 'No' }), deps);
    expect('outcome' in cleared).toBe(false);
    expect(cleared.passes).toHaveLength(1); // the record stays
    const asked = applyTicketEvent(born, decided('Yes', { closeStarted: [OTHER] }), deps);
    expect(JSON.stringify(asked)).not.toContain(OTHER);
  });
});

describe('29.356 / 29.357 passes', () => {
  it('29.356 a first choice opens pass 1; a differing choice and a clear are revisions of it; a choice after a clear fills it in', () => {
    const s1 = applyTicketEvent(bornState(), decided('Yes', { actorId: A, serverTime: T1 }), deps);
    expect(s1.passes).toEqual([{ pass: 1, outcome: 'Yes', by: A, at: T1, revisions: [] }]);
    const s2 = applyTicketEvent(s1, decided('No', { from: 'Yes', actorId: B, serverTime: T2 }), deps);
    expect(s2.passes).toEqual([{ pass: 1, outcome: 'No', by: A, at: T1, revisions: [{ from: 'Yes', to: 'No', by: B, at: T2 }] }]);
    const s3 = applyTicketEvent(s2, decided(null, { from: 'No', actorId: A, serverTime: T3 }), deps);
    expect(s3.passes?.[0]?.outcome).toBeNull();
    expect(s3.passes?.[0]?.revisions.at(-1)).toEqual({ from: 'No', to: null, by: A, at: T3 });
    const s4 = applyTicketEvent(s3, decided('Yes', { from: null, actorId: B, serverTime: T4 }), deps);
    expect(s4.passes).toHaveLength(1); // filled in, not a second pass
    expect(s4.passes?.[0]).toMatchObject({ pass: 1, outcome: 'Yes', by: A, at: T1 });
    expect(s4.passes?.[0]?.revisions).toHaveLength(3);
    expect(s4.passes?.[0]?.revisions.at(-1)).toEqual({ from: null, to: 'Yes', by: B, at: T4 });
    expect(s1.passes?.[0]?.revisions).toEqual([]); // control: earlier values are never mutated
    expect('passes' in applyTicketEvent(bornState(), decided(null), deps)).toBe(false); // a clear with no pass records nothing
  });
  it('29.357 after releaseOutcome the next choice opens pass 2 and pass 1 is unchanged', () => {
    const born = bornState();
    const s1 = applyTicketEvent(born, decided('Needs rework', { actorId: A, serverTime: T1 }), deps);
    const released = releaseOutcome(s1);
    expect('outcome' in released).toBe(false);
    expect(released.passes).toEqual(s1.passes);
    const s2 = applyTicketEvent(released, decided('Yes', { actorId: B, serverTime: T2 }), deps);
    expect(s2.outcome).toBe('Yes');
    expect(s2.passes).toEqual([s1.passes?.[0], { pass: 2, outcome: 'Yes', by: B, at: T2, revisions: [] }]);
    expect(releaseOutcome(born)).toBe(born); // control: nothing to release returns the same object
  });
});
