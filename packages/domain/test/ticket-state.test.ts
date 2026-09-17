import { describe, expect, it } from 'vitest';
import type { EventEnvelope } from '../src/envelope.js';
import type { TicketState } from '../src/entity-state.js';
import { makeEnvelope } from '../src/testing.js';
import {
  applyTicketEvent,
  foldTicketToWorkflowVersion,
  TICKET_EVENT_TYPES,
  type TicketStateDeps,
} from '../src/ticket-state.js';
import type { TicketTypeDef } from '../src/ticket-types.js';
import { domainRegistry } from '../src/vocabulary.js';
import type { PublishedWorkflowDef, WorkflowDef } from '../src/workflow.js';
import { stateCategoryOf } from '../src/workflow-helpers.js';

const PROJECT = '01J9GPRJ000000000000000000';
const TICKET = '01J9GTKA000000000000000000';
const PARENT = '01J9GPAR000000000000000000';
/** makeEnvelope's default — the workspace every envelope below is filed under. */
const WORKSPACE = '01J9GWS0000000000000000000';
/** makeEnvelope's default actor, asserted wherever a test does not override it. */
const DEFAULT_ACTOR = '01J9GACT000000000000000000';

const WF: WorkflowDef = {
  id: 'wf-basic',
  version: 1,
  name: 'Basic',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'todo', rules: [] },
    { from: '*', to: 'doing', rules: [] },
    { from: '*', to: 'done', rules: [] },
  ],
};

/** A second, unrelated workflow — the destination of a rebind. */
const WF_SUPPORT: WorkflowDef = {
  id: 'wf-support',
  version: 4,
  name: 'Support',
  initialStateId: 'new',
  states: [
    { id: 'new', name: 'New', category: 'open' },
    { id: 'waiting', name: 'Waiting on customer', category: 'active' },
    { id: 'closed', name: 'Closed', category: 'terminal' },
  ],
  transitions: [{ from: '*', to: 'closed', rules: [] }],
};

const TASK_TYPE: TicketTypeDef = {
  id: 'task',
  name: 'Task',
  icon: 'check',
  rank: 3,
  workflowId: 'wf-basic',
  fields: [],
};

/** A type bound to a workflow nobody ever published. */
const ORPHAN_TYPE: TicketTypeDef = { ...TASK_TYPE, id: 'orphan', workflowId: 'wf-ghost' };

const WORKFLOWS: WorkflowDef[] = [WF, WF_SUPPORT];
const TYPES: TicketTypeDef[] = [TASK_TYPE, ORPHAN_TYPE];

/** The deps contract as ruled: `getWorkflow` is a pure by-id lookup over everything published. */
const deps: TicketStateDeps = {
  getTicketType: (id) => TYPES.find((type) => type.id === id),
  getWorkflow: (id) => WORKFLOWS.find((wf) => wf.id === id),
};

/**
 * Asserting a thrown message character-for-character, and failing when nothing
 * throws at all. `toThrow('…')` matches a SUBSTRING, which would let a truncated
 * or reworded message certify itself.
 */
function messageOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected the call to throw, and it returned instead');
}

function createdState(): TicketState {
  return applyTicketEvent(
    undefined,
    makeEnvelope({
      type: 'ticket.created',
      entity: { kind: 'ticket', id: TICKET },
      payload: { typeId: 'task', projectId: PROJECT, parentId: PARENT, title: 'File the GST return' },
      actorId: 'user-kiro',
      clientTime: '2026-08-20T09:00:00.000Z',
      serverTime: '2026-08-20T09:00:00.100Z',
    }),
    deps,
  );
}

/**
 * The four building blocks 13.565/13.566 fold together, modelled on
 * `createdState()` above: each builds one envelope rather than a folded
 * state, so a test can chain several through `fold` without redoing the
 * `applyTicketEvent` plumbing itself.
 */
function createdWith(payloadExtra: Record<string, unknown>): EventEnvelope {
  return makeEnvelope({
    type: 'ticket.created',
    entity: { kind: 'ticket', id: TICKET },
    payload: {
      typeId: 'task',
      projectId: PROJECT,
      parentId: PARENT,
      title: 'File the GST return',
      ...payloadExtra,
    },
  });
}

function transitioned(to: string): EventEnvelope {
  return makeEnvelope({
    type: 'ticket.transitioned',
    entity: { kind: 'ticket', id: TICKET },
    payload: { to },
  });
}

function closedEvent(): EventEnvelope {
  return makeEnvelope({
    type: 'ticket.closed',
    entity: { kind: 'ticket', id: TICKET },
    payload: {},
  });
}

function reopenedEvent(): EventEnvelope {
  return makeEnvelope({
    type: 'ticket.reopened',
    entity: { kind: 'ticket', id: TICKET },
    payload: {},
  });
}

/** Replays a list of envelopes through `applyTicketEvent` with this file's `deps`, oldest first. */
function fold(events: EventEnvelope[]): TicketState {
  let state: TicketState | undefined;
  for (const env of events) {
    state = applyTicketEvent(state, env, deps);
  }
  return state as TicketState;
}

describe('applyTicketEvent', () => {
  it('creation enters the workflow initial state and records the title as an attributed claim', () => {
    expect(createdState()).toEqual({
      kind: 'ticket',
      id: TICKET,
      workspaceId: WORKSPACE,
      projectId: PROJECT,
      typeId: 'task',
      parentId: PARENT,
      workflowId: 'wf-basic',
      workflowVersion: 1,
      stateId: 'todo',
      stateCategory: 'open',
      assigneeId: null,
      collaboratorIds: [],
      transitions: [],
      closed: null,
      fields: {
        title: {
          value: 'File the GST return',
          actorId: 'user-kiro',
          clientTime: '2026-08-20T09:00:00.000Z',
          serverTime: '2026-08-20T09:00:00.100Z',
        },
      },
    });
  });

  it('creation throws when the type names a workflow nothing published', () => {
    expect(
      messageOf(() =>
        applyTicketEvent(
          undefined,
          makeEnvelope({
            type: 'ticket.created',
            entity: { kind: 'ticket', id: TICKET },
            payload: { typeId: 'orphan', projectId: PROJECT, parentId: null, title: 'x' },
          }),
          deps,
        ),
      ),
    ).toBe(
      'applyTicketEvent: workflow "wf-ghost" is not defined — the engine must refuse ticket.created before it reaches a projection',
    );
  });

  it('transition moves state, re-derives the category, and logs the mover under the vocabulary the move is written in', () => {
    const state = applyTicketEvent(
      createdState(),
      makeEnvelope({
        type: 'ticket.transitioned',
        entity: { kind: 'ticket', id: TICKET },
        payload: { to: 'done' },
        actorId: 'user-anselma',
        seq: 7,
      }),
      deps,
    );
    expect(state.stateId).toBe('done');
    expect(state.stateCategory).toBe('terminal');
    // The entry names the actor who MOVED it (not the creator), the envelope's
    // own seq (not a default), and both halves of the vocabulary its toStateId
    // is written in. Every one of the five is read by require-different-user.
    expect(state.transitions).toEqual([
      {
        toStateId: 'done',
        actorId: 'user-anselma',
        seq: 7,
        workflowId: 'wf-basic',
        workflowVersion: 1,
      },
    ]);
  });

  it('a transition applied under a newer version stamps THAT version, on the ticket and on the entry', () => {
    // The ticket was created under v1 and has not been refolded. The event is
    // applied against the definition in force when it happened, which is v2 —
    // where 'doing' is terminal rather than active. Both the ticket's version
    // and the entry's are the version the destination id was resolved against,
    // never the one the ticket sat at before this fold; an entry stamped with
    // the pre-fold version would send require-different-user walking the id
    // forward from a vocabulary it was not written in.
    const v2: WorkflowDef = {
      ...WF,
      version: 2,
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'doing', name: 'Doing', category: 'terminal' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
    };
    const created = createdState();
    expect(created.workflowVersion).toBe(1);
    const state = applyTicketEvent(
      created,
      makeEnvelope({
        type: 'ticket.transitioned',
        entity: { kind: 'ticket', id: TICKET },
        payload: { to: 'doing' },
        seq: 5,
      }),
      { getTicketType: deps.getTicketType, getWorkflow: (id) => (id === 'wf-basic' ? v2 : undefined) },
    );
    expect(state.workflowVersion).toBe(2);
    expect(state.stateCategory).toBe('terminal');
    expect(state.transitions).toEqual([
      {
        toStateId: 'doing',
        actorId: DEFAULT_ACTOR,
        seq: 5,
        workflowId: 'wf-basic',
        workflowVersion: 2,
      },
    ]);
  });

  it('field_set preserves provenance per field — who claimed it, and both times', () => {
    const state = applyTicketEvent(
      createdState(),
      makeEnvelope({
        type: 'ticket.field_set',
        entity: { kind: 'ticket', id: TICKET },
        payload: { fieldId: 'dueDate', value: { date: '2026-08-30', note: 'GST' } },
        actorId: 'user-anselma',
        clientTime: '2026-08-21T08:00:00.000Z',
        serverTime: '2026-08-21T08:00:00.900Z',
      }),
      deps,
    );
    expect(state.fields.dueDate).toEqual({
      value: { date: '2026-08-30', note: 'GST' },
      actorId: 'user-anselma',
      clientTime: '2026-08-21T08:00:00.000Z',
      serverTime: '2026-08-21T08:00:00.900Z',
    });
    expect(state.fields.title).toEqual({
      value: 'File the GST return',
      actorId: 'user-kiro',
      clientTime: '2026-08-20T09:00:00.000Z',
      serverTime: '2026-08-20T09:00:00.100Z',
    });
  });

  /**
   * 5.50 — The field_set fold's null-clearing path (now claim(p.value, env), the removed p.value ?? null coalesce being an identity for null) is exercised and stays green, storing the explicit null clearing claim with its provenance.
   */
  it('clearing a field with null keeps the provenance of the clearing claim', () => {
    let state = createdState();
    state = applyTicketEvent(
      state,
      makeEnvelope({
        type: 'ticket.field_set',
        entity: { kind: 'ticket', id: TICKET },
        payload: { fieldId: 'dueDate', value: { date: '2026-08-30' } },
      }),
      deps,
    );
    state = applyTicketEvent(
      state,
      makeEnvelope({
        type: 'ticket.field_set',
        entity: { kind: 'ticket', id: TICKET },
        payload: { fieldId: 'dueDate', value: null },
        actorId: 'user-anselma',
      }),
      deps,
    );
    expect(state.fields.dueDate).toEqual({
      value: null,
      actorId: 'user-anselma',
      clientTime: '2026-08-20T09:00:00.000Z',
      serverTime: '2026-08-20T09:00:00.100Z',
    });
  });

  it('assignment and unassignment', () => {
    let state = createdState();
    state = applyTicketEvent(
      state,
      makeEnvelope({
        type: 'ticket.assigned',
        entity: { kind: 'ticket', id: TICKET },
        payload: { assigneeId: 'user-anselma' },
      }),
      deps,
    );
    expect(state.assigneeId).toBe('user-anselma');
    state = applyTicketEvent(
      state,
      makeEnvelope({
        type: 'ticket.assigned',
        entity: { kind: 'ticket', id: TICKET },
        payload: { assigneeId: null },
      }),
      deps,
    );
    expect(state.assigneeId).toBeNull();
  });

  /**
   * 5.6 — Adding the same collaborator twice deduplicates (and returns the identical object, no spurious write), and removing a userId that is not a collaborator is a no-op.
   */
  it('collaborators deduplicate on add and no-op on removing a non-member', () => {
    const add = () =>
      makeEnvelope({
        type: 'ticket.collaborator_added',
        entity: { kind: 'ticket', id: TICKET },
        payload: { userId: 'user-anselma' },
      });
    const first = applyTicketEvent(createdState(), add(), deps);
    const second = applyTicketEvent(first, add(), deps);
    expect(second.collaboratorIds).toEqual(['user-anselma']);
    // A duplicate add returns the SAME object: nothing changed, so nothing is
    // rewritten, and a projection diffing by identity sees no write.
    expect(second).toBe(first);
    const removed = applyTicketEvent(
      second,
      makeEnvelope({
        type: 'ticket.collaborator_removed',
        entity: { kind: 'ticket', id: TICKET },
        payload: { userId: 'user-nobody' },
      }),
      deps,
    );
    expect(removed.collaboratorIds).toEqual(['user-anselma']);
  });

  it('reparent moves the pointer; comments and attachments leave head state untouched', () => {
    const reparented = applyTicketEvent(
      createdState(),
      makeEnvelope({
        type: 'ticket.reparented',
        entity: { kind: 'ticket', id: TICKET },
        payload: { newParentId: null },
      }),
      deps,
    );
    expect(reparented.parentId).toBeNull();
    const commented = applyTicketEvent(
      reparented,
      makeEnvelope({
        type: 'comment.added',
        entity: { kind: 'ticket', id: TICKET },
        payload: { body: { type: 'doc', content: [] } },
      }),
      deps,
    );
    expect(commented).toBe(reparented);
    const attached = applyTicketEvent(
      commented,
      makeEnvelope({
        type: 'attachment.added',
        entity: { kind: 'ticket', id: TICKET },
        payload: {
          kind: 'drive-reference',
          attachmentId: '01J9GATT000000000000000000',
          driveFileId: 'drive-1',
          name: 'gst.pdf',
          mimeType: 'application/pdf',
          webViewLink: 'https://drive.example/gst',
          capturedAt: '2026-08-21T08:00:00.000Z',
        },
      }),
      deps,
    );
    expect(attached).toBe(reparented);
  });

  it('a rebind moves the pinned workflow, its version, the state and the category — and appends no log entry', () => {
    const moved = applyTicketEvent(
      createdState(),
      makeEnvelope({
        type: 'ticket.transitioned',
        entity: { kind: 'ticket', id: TICKET },
        payload: { to: 'doing' },
        seq: 2,
      }),
      deps,
    );
    const rebound = applyTicketEvent(
      moved,
      makeEnvelope({
        type: 'ticket.workflow_rebound',
        entity: { kind: 'ticket', id: TICKET },
        payload: { toWorkflowId: 'wf-support', toStateId: 'waiting' },
      }),
      deps,
    );
    expect(rebound).toMatchObject({
      workflowId: 'wf-support',
      workflowVersion: 4,
      stateId: 'waiting',
      stateCategory: 'active',
    });
    // The entry left behind keeps the workflow it was recorded under, so
    // four-eyes filters it out rather than walking it through a chain it was
    // never written in.
    expect(rebound.transitions).toEqual([
      {
        toStateId: 'doing',
        actorId: DEFAULT_ACTOR,
        seq: 2,
        workflowId: 'wf-basic',
        workflowVersion: 1,
      },
    ]);
  });

  it('the rebind asks its deps for the workflow the PAYLOAD names, not the one the ticket is on', () => {
    // A loader that serves only "the ticket's own workflow" — the pre-selecting
    // shape ruling P1 forbids. If the reducer asked for state.workflowId this
    // would resolve wf-basic and refuse with a different sentence entirely; the
    // message proves which id was asked for.
    const ticketsOwnWorkflowOnly: TicketStateDeps = {
      getTicketType: deps.getTicketType,
      getWorkflow: (id) => (id === 'wf-basic' ? WF : undefined),
    };
    expect(
      messageOf(() =>
        applyTicketEvent(
          createdState(),
          makeEnvelope({
            type: 'ticket.workflow_rebound',
            entity: { kind: 'ticket', id: TICKET },
            payload: { toWorkflowId: 'wf-support', toStateId: 'waiting' },
          }),
          ticketsOwnWorkflowOnly,
        ),
      ),
    ).toBe(
      'applyTicketEvent: workflow "wf-support" is not defined — the engine must refuse ticket.workflow_rebound before it reaches a projection',
    );
  });

  it('a rebind onto a state the target workflow does not have throws rather than inventing a status', () => {
    expect(
      messageOf(() =>
        applyTicketEvent(
          createdState(),
          makeEnvelope({
            type: 'ticket.workflow_rebound',
            entity: { kind: 'ticket', id: TICKET },
            payload: { toWorkflowId: 'wf-support', toStateId: 'doing' },
          }),
          deps,
        ),
      ),
    ).toBe('applyTicketEvent: workflow "wf-support" has no state "doing"');
  });

  it('throws loudly on replay-integrity breaks the engine is contracted to refuse', () => {
    expect(
      messageOf(() =>
        applyTicketEvent(
          undefined,
          makeEnvelope({
            type: 'ticket.assigned',
            entity: { kind: 'ticket', id: TICKET },
            payload: { assigneeId: null },
          }),
          deps,
        ),
      ),
    ).toBe(
      `applyTicketEvent: ticket.assigned for ticket ${TICKET} that was never created`,
    );
    expect(
      messageOf(() =>
        applyTicketEvent(
          undefined,
          makeEnvelope({
            type: 'ticket.created',
            entity: { kind: 'ticket', id: TICKET },
            payload: { typeId: 'ghost', projectId: PROJECT, parentId: null, title: 'x' },
          }),
          deps,
        ),
      ),
    ).toBe(
      'applyTicketEvent: unknown ticket type "ghost" — the engine must refuse ticket.created before it reaches a projection',
    );
  });

  it('an event outside the ticket vocabulary throws rather than being folded into silence', () => {
    expect(
      messageOf(() =>
        applyTicketEvent(
          createdState(),
          makeEnvelope({
            type: 'workflow.defined',
            entity: { kind: 'ticket', id: TICKET },
            payload: {},
          }),
          deps,
        ),
      ),
    ).toBe('applyTicketEvent: not a ticket event: workflow.defined');
  });
});

describe('TICKET_EVENT_TYPES', () => {
  it('lists exactly the registered types whose entity kind is a ticket', () => {
    for (const type of TICKET_EVENT_TYPES) {
      expect(domainRegistry.get(type, 1)?.entityKind).toBe('ticket');
    }
    // ticket-type.defined is registered against 'ticket-type' and folds into no
    // ticket: a type's workflow binding changes what NEW tickets get, never
    // where an existing one sits.
    expect((TICKET_EVENT_TYPES as readonly string[]).includes('ticket-type.defined')).toBe(false);
    // TWELVE of the FIFTEEN registered against entityKind 'ticket' (backlog/closed
    // spec, 2026-09-17: 'ticket.closed' and 'ticket.reopened' joined the list —
    // both move `closed`, so both belong here even though neither moves stateId).
    expect(TICKET_EVENT_TYPES).toHaveLength(12);
  });
});

/** 13.565 — born in the backlog, unless the client says focus; absence means focus (spec §1.3). */
describe('13.565 ticket.created lands in backlog when start says so', () => {
  it('start: "backlog" → the universal state, category open, closed null', () => {
    const state = fold([createdWith({ start: 'backlog' })]);
    expect(state.stateId).toBe('backlog');
    expect(state.stateCategory).toBe('open');
    expect(state.closed).toBeNull();
    expect(state.transitions).toEqual([]);
  });
  it('start: "focus" → the workflow\'s initial state, as before', () => {
    expect(fold([createdWith({ start: 'focus' })]).stateId).toBe('todo');
  });
  it('no start at all (a v1 event) → focus — the additive-field rule', () => {
    expect(fold([createdWith({})]).stateId).toBe('todo');
  });
});

/** 13.566 — the flag folds and unfolds; the state is untouched (spec §1.2). */
describe('13.566 ticket.closed / ticket.reopened', () => {
  it('closed records the actor and the server time; reopened clears it; stateId never moves', () => {
    const closeEnv = closedEvent();
    const closed = fold([createdWith({ start: 'focus' }), transitioned('doing'), transitioned('done'), closeEnv]);
    expect(closed.closed).toEqual({ actorId: DEFAULT_ACTOR, at: closeEnv.serverTime });
    expect(closed.stateId).toBe('done');
    const reopened = fold([
      createdWith({ start: 'focus' }),
      transitioned('doing'),
      transitioned('done'),
      closeEnv,
      reopenedEvent(),
    ]);
    expect(reopened.closed).toBeNull();
    expect(reopened.stateId).toBe('done');
  });
  it('TICKET_EVENT_TYPES names both, so every replay reader that iterates it sees them', () => {
    expect(TICKET_EVENT_TYPES).toContain('ticket.closed');
    expect(TICKET_EVENT_TYPES).toContain('ticket.reopened');
  });
});

describe('stateCategoryOf', () => {
  it('maps a state id to its category, undefined when absent', () => {
    expect(stateCategoryOf(WF, 'doing')).toBe('active');
    expect(stateCategoryOf(WF, 'ghost')).toBeUndefined();
  });
});

// Refresh-on-publish: the fold a new workflow version applies to tickets already
// sitting in its states (design decision 10).
const WF2_RECATEGORISED: WorkflowDef = {
  ...WF,
  version: 2,
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'terminal' }, // was 'active' in v1
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
};

// `stateMapping` lives on PublishedWorkflowDef, never on WorkflowDef — the
// shipped alias, so no cast is needed anywhere here.
const WF2_DROPS_DOING: PublishedWorkflowDef = {
  ...WF,
  version: 2,
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'todo', rules: [] },
    { from: '*', to: 'done', rules: [] },
  ],
  stateMapping: { doing: 'todo' },
};

// A three-version chain, which is where the walk stops being a straight line:
// v2 renames doing→review, v3 folds review→todo.
const WF2_RENAMES_DOING: PublishedWorkflowDef = {
  ...WF,
  version: 2,
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'review', name: 'In review', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  stateMapping: { doing: 'review' },
};

const WF3_DROPS_REVIEW: PublishedWorkflowDef = {
  ...WF,
  version: 3,
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  stateMapping: { review: 'todo' },
};

function inDoing(): TicketState {
  return applyTicketEvent(
    createdState(),
    makeEnvelope({
      type: 'ticket.transitioned',
      entity: { kind: 'ticket', id: TICKET },
      payload: { to: 'doing' },
      seq: 3,
    }),
    deps,
  );
}

describe('foldTicketToWorkflowVersion', () => {
  const noIntermediates = () => null;

  it('re-categorises a surviving state and stamps the new version', () => {
    expect(foldTicketToWorkflowVersion(inDoing(), WF2_RECATEGORISED, noIntermediates)).toMatchObject(
      { stateId: 'doing', stateCategory: 'terminal', workflowVersion: 2 },
    );
  });

  it('walks a dropped state through the stateMapping instead of throwing', () => {
    expect(foldTicketToWorkflowVersion(inDoing(), WF2_DROPS_DOING, noIntermediates)).toMatchObject({
      stateId: 'todo',
      stateCategory: 'open',
      workflowVersion: 2,
    });
  });

  it('walks a three-version chain through the intermediate it is handed', () => {
    const folded = foldTicketToWorkflowVersion(inDoing(), WF3_DROPS_REVIEW, (version) =>
      version === 2 ? WF2_RENAMES_DOING : null,
    );
    // doing --(v2)--> review --(v3)--> todo. Neither hop is visible in the
    // target definition alone, which is the whole reason the intermediate is
    // consulted rather than guessed at.
    expect(folded).toMatchObject({ stateId: 'todo', stateCategory: 'open', workflowVersion: 3 });
  });

  it('leaves the transition log alone — each entry keeps the vocabulary its toStateId is written in', () => {
    const before = inDoing();
    const folded = foldTicketToWorkflowVersion(before, WF2_DROPS_DOING, noIntermediates);
    // The head state moved to 'todo'; the log still says the actor moved to
    // 'doing' under wf-basic version 1, because that is what happened. RDU walks
    // log entries forward itself (Plan 2 Task 11); rewriting them here would
    // destroy the very evidence four-eyes compares against.
    expect(folded.transitions).toEqual([
      {
        toStateId: 'doing',
        actorId: DEFAULT_ACTOR,
        seq: 3,
        workflowId: 'wf-basic',
        workflowVersion: 1,
      },
    ]);
    expect(folded.transitions).toEqual(before.transitions);
  });

  /**
   * 5.30 — The fold is a no-op (returns the identical object) for a ticket already at or past the target workflow version, and a version chain with an unmapped dropped state throws rather than guessing a state.
   */
  it('is a no-op for a ticket already at or past the target version — the guard that makes replay order-insensitive', () => {
    const already: TicketState = { ...inDoing(), workflowVersion: 2, stateCategory: 'terminal' };
    expect(foldTicketToWorkflowVersion(already, WF, noIntermediates)).toBe(already);
    expect(foldTicketToWorkflowVersion(already, WF2_RECATEGORISED, noIntermediates)).toBe(already);
  });

  it('planted defect: a chain that cannot be walked throws rather than guessing a state', () => {
    const stranding: PublishedWorkflowDef = { ...WF2_DROPS_DOING, stateMapping: {} };
    expect(messageOf(() => foldTicketToWorkflowVersion(inDoing(), stranding, noIntermediates))).toBe(
      `foldTicketToWorkflowVersion: ticket ${TICKET} cannot be folded forward to workflow "wf-basic" version 2 — state "doing" is dropped with no stateMapping entry`,
    );
  });

  it('a hole in the version chain reports as a hole, not as an unmapped drop', () => {
    // Two different faults: a gap in the ledger, versus a publish that should
    // have been refused. `foldStateIdForward` folds both into one `ok: false`,
    // so the pre-check exists to tell whoever reads the error which one it is.
    expect(
      messageOf(() => foldTicketToWorkflowVersion(inDoing(), WF3_DROPS_REVIEW, noIntermediates)),
    ).toBe(
      `foldTicketToWorkflowVersion: workflow "wf-basic" version 2 is missing — the version chain has a hole and ticket ${TICKET} cannot be walked forward`,
    );
  });
});
