import { describe, expect, it } from 'vitest';
import { DECISION_TYPE_ID, flowNodeOf, newUlid, simpleKanbanWorkflowDef, type FieldClaim, type TicketState } from '../../src/index.js';

const wf = simpleKanbanWorkflowDef(newUlid());

const claim = (value: unknown): FieldClaim => ({
  value,
  actorId: newUlid(),
  clientTime: '2026-10-01T09:00:00.000Z',
  serverTime: '2026-10-01T09:00:01.000Z',
});

/** A bare To do task: nothing claimed, nothing folded. The control for every derived member. */
function ticket(over: Partial<TicketState> = {}): TicketState {
  return {
    kind: 'ticket',
    id: newUlid(),
    workspaceId: newUlid(),
    projectId: newUlid(),
    typeId: 'task',
    parentId: null,
    workflowId: wf.id,
    workflowVersion: 1,
    stateId: 'todo',
    stateCategory: 'open',
    assigneeId: null,
    collaboratorIds: [],
    fields: {},
    transitions: [],
    ...over,
  };
}

describe('29.185 flowNodeOf', () => {
  it('29.185 a bare ticket gives a quiet node; every claim and fold the planner reads comes through its helper', () => {
    const bare = ticket();
    expect(flowNodeOf(bare, wf)).toEqual({
      id: bare.id, typeId: 'task', stateId: 'todo', category: 'open', closed: false, trashed: false, draft: false,
      parentId: null, isDecision: false, outcome: null, passes: [], notTaken: null, waitForAll: false, started: false,
      rounds: 1, periods: [], explicitStart: null, explicitDue: null, estimate: null, reworkEstimate: null,
      initialStateId: 'todo', firstTerminalStateId: 'done',
    });

    const decider = newUlid();
    const richId = newUlid();
    // The cause must parse (`flowCauseSchema` takes ULIDs, T8): with 'dec-1' / 'ev-1' `isFlowCause` fails and
    // `resolutionOf` reads null, so the notTaken expectation below would be red against a correct flowNodeOf.
    const decisionTicketId = newUlid();
    const decisionEventId = newUlid();
    const passes = [{ pass: 1, outcome: 'Yes', by: decider, at: '2026-10-02T10:00:00.000Z', revisions: [] }];
    const rich = flowNodeOf(
      ticket({
        id: richId,
        typeId: DECISION_TYPE_ID,
        parentId: 'parent-1',
        stateId: 'doing',
        stateCategory: 'active',
        fields: {
          startDate: claim({ date: '2026-10-05' }),
          dueDate: claim({ date: '2026-10-09', note: 'client call' }),
          estimate: claim(3),
          reworkEstimate: claim(2),
          waitForAll: claim(true),
        },
        outcome: 'Yes',
        passes,
        periods: [{ start: '2026-10-02T09:00:00.000Z', end: null, pass: 2 }],
        rounds: 2,
        closed: {
          actorId: decider,
          at: '2026-10-03T09:00:00.000Z',
          cause: { kind: 'branch-not-taken', decisionTicketId, outcome: 'No', pass: 1, decidedBy: decider, decisionEventId },
        },
        deleted: { actorId: decider, at: '2026-10-03T10:00:00.000Z' },
      }),
      wf,
      { draft: true },
    );
    expect(rich).toMatchObject({
      id: richId, typeId: DECISION_TYPE_ID,
      isDecision: true, parentId: 'parent-1', stateId: 'doing', category: 'active', closed: true, trashed: true, draft: true,
      outcome: 'Yes', started: true, rounds: 2, explicitStart: '2026-10-05', explicitDue: '2026-10-09',
      estimate: 3, reworkEstimate: 2, waitForAll: true,
    });
    // exact, not a subset match: the resolution is the four-member reading, never the raw cause (which also has decidedBy, decisionEventId)
    expect(rich.notTaken).toEqual({ kind: 'not-taken', decisionTicketId, outcome: 'No', pass: 1 });
    expect(rich.passes).toEqual(passes);
    expect(rich.periods).toEqual([{ start: '2026-10-02T09:00:00.000Z', end: null, pass: 2 }]);

    // "started" is the LAST period open, not "has a period": a finished period reads false
    expect(flowNodeOf(ticket({ periods: [{ start: '2026-10-02T09:00:00.000Z', end: '2026-10-02T17:00:00.000Z', pass: 1 }] }), wf).started).toBe(false);
    // the reducer writes `closed: null` and `deleted: null` (not absent) at creation and on reopen/restore: both read false
    expect(flowNodeOf(ticket({ closed: null, deleted: null }), wf)).toMatchObject({ closed: false, trashed: false });

    // the workflow facts are read, not assumed: an initial state that is not the first listed, and two terminal states
    // (the FIRST declared is the one Not taken files into, planner ruling 8); no terminal state at all reads null
    const custom = { ...wf, initialStateId: 'doing', states: [...wf.states, { id: 'cancelled', name: 'Cancelled', category: 'terminal' as const }] };
    expect(flowNodeOf(ticket(), custom)).toMatchObject({ initialStateId: 'doing', firstTerminalStateId: 'done' });
    const noTerminal = { ...wf, states: wf.states.filter((s) => s.category !== 'terminal') };
    expect(flowNodeOf(ticket(), noTerminal).firstTerminalStateId).toBeNull();

    // an explicit flag beats the state's own soft-delete flag in both directions
    expect(flowNodeOf(ticket({ deleted: { actorId: decider, at: '2026-10-03T10:00:00.000Z' } }), wf, { trashed: false }).trashed).toBe(false);
    expect(flowNodeOf(ticket(), wf, { trashed: true }).trashed).toBe(true);
  });

  it('29.185 a claim of the wrong shape is no claim: a cleared or malformed value reads as null, not as a guess', () => {
    const node = flowNodeOf(
      ticket({
        fields: {
          startDate: claim(null),
          dueDate: claim({ date: 'next week' }),
          estimate: claim(0),
          reworkEstimate: claim(366),
          waitForAll: claim(null),
        },
      }),
      wf,
    );
    expect([node.explicitStart, node.explicitDue, node.estimate, node.reworkEstimate, node.waitForAll]).toEqual([null, null, null, null, false]);
    expect(flowNodeOf(ticket({ fields: { estimate: claim(1.5) } }), wf).estimate).toBeNull();
    // a day that is not a string is no day, even when its text would match (an array stringifies to its member)
    expect(flowNodeOf(ticket({ fields: { startDate: claim({ date: ['2026-10-05'] }) } }), wf).explicitStart).toBeNull();
    expect(flowNodeOf(ticket({ fields: { estimate: claim(365) } }), wf).estimate).toBe(365); // CONTROL: the edge of the range is accepted
  });
});
