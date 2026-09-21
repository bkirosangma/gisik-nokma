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
import { ULID_REGEX } from '../src/ids.js';
import { SYSTEM_ACTOR_AUTO_CLOSE, SYSTEM_ACTOR_NAMES } from '../src/system-actors.js';
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

function deletedEvent(): EventEnvelope {
  return makeEnvelope({
    type: 'ticket.deleted',
    entity: { kind: 'ticket', id: TICKET },
    payload: {},
  });
}

function restoredEvent(): EventEnvelope {
  return makeEnvelope({
    type: 'ticket.restored',
    entity: { kind: 'ticket', id: TICKET },
    payload: {},
  });
}

/** `rank` is typed `unknown` so the refusal cases can hand it a value the key space forbids. */
function rankedEvent(rank: unknown): EventEnvelope {
  return makeEnvelope({
    type: 'ticket.ranked',
    entity: { kind: 'ticket', id: TICKET },
    payload: { rank },
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
  it('creation enters the workflow initial state and records the title and the P2 priority as attributed claims', () => {
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
      // Beside `closed` because it is the same kind of fact: creation writes
      // the null rather than leaving the key absent (Task 3's decision — see
      // the creation branch in `ticket-state.ts`). `toEqual` is exact, so this
      // line is what holds the decision in place.
      rank: null,
      // The third of the same family (13.722): creation writes the null rather
      // than omitting the key, for the reason the two above give — `toEqual` is
      // exact, which is what makes this list the place the presence decision
      // lives rather than a value a `?? null` reader would paper over.
      reopenedAt: null,
      // The fourth of the same family. Creation writes the null rather than
      // omitting the key, and `toEqual` is exact — so this line is where the
      // presence decision for `deleted` lives, exactly as the three above are
      // for `closed`/`rank`/`reopenedAt`. A reducer that dropped the key would
      // still satisfy every `(state.deleted ?? null) === null` predicate in
      // `apps/server` while differing in SHAPE from `rowToTicketState`, which
      // the dual-client rig compares whole.
      deleted: null,
      fields: {
        title: {
          value: 'File the GST return',
          actorId: 'user-kiro',
          clientTime: '2026-08-20T09:00:00.000Z',
          serverTime: '2026-08-20T09:00:00.100Z',
        },
        priority: {
          value: 'P2',
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
    // FIFTEEN of the EIGHTEEN registered against entityKind 'ticket' (backlog/closed
    // spec, 2026-09-17: 'ticket.closed' and 'ticket.reopened' joined the list —
    // both move `closed`, so both belong here even though neither moves stateId;
    // spec §8.1, 2026-09-18: 'ticket.ranked' joined it for the same reason — it
    // moves `rank`, which is head state, and moves nothing else; 2026-09-20:
    // 'ticket.deleted' and 'ticket.restored' joined it for that same reason —
    // `deleted` is head state and moves nothing else either).
    //
    // **Both numbers move together and neither is decorative.** The registered
    // count is what `parseEvent` admits; this list is what a REPLAY reader
    // iterates. A pair added to the registry but not to this list would parse at
    // the door and then be skipped by every fold that iterates it — the two would
    // disagree with no error anywhere, which is why the count is asserted at all.
    expect(TICKET_EVENT_TYPES).toHaveLength(15);
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

describe('3.965 ticket.created writes the priority claim — every ticket has one from birth', () => {
  it('no priority on the event (a v1 event) → P2, attributed to the CREATOR and the creation clocks', () => {
    const state = createdState();
    expect(state.fields.priority).toEqual({
      value: 'P2',
      actorId: 'user-kiro',
      clientTime: '2026-08-20T09:00:00.000Z',
      serverTime: '2026-08-20T09:00:00.100Z',
    });
  });
  it('an explicit priority on the event is the claim, same attribution', () => {
    const state = fold([createdWith({ priority: 'P1' })]);
    expect(state.fields.priority?.value).toBe('P1');
    expect(state.fields.priority?.actorId).toBe(createdWith({}).actorId);
  });
  it('CONTROL — the title claim is unchanged by the new member, so the two are written side by side', () => {
    const state = fold([createdWith({ priority: 'P3' })]);
    expect(Object.keys(state.fields).sort()).toEqual(['priority', 'title']);
  });
  it('3.966 a later field_set on priority replaces the birth claim and keeps the new actor', () => {
    const state = applyTicketEvent(
      createdState(),
      makeEnvelope({
        type: 'ticket.field_set',
        entity: { kind: 'ticket', id: TICKET },
        payload: { fieldId: 'priority', value: 'P1' },
        actorId: 'user-anselma',
        clientTime: '2026-08-21T08:00:00.000Z',
        serverTime: '2026-08-21T08:00:00.900Z',
      }),
      deps,
    );
    expect(state.fields.priority).toEqual({
      value: 'P1',
      actorId: 'user-anselma',
      clientTime: '2026-08-21T08:00:00.000Z',
      serverTime: '2026-08-21T08:00:00.900Z',
    });
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

/**
 * The soft delete — `ticket.deleted` / `ticket.restored`. Deliberately the same
 * four arms 13.566 pins for the closed/reopened pair, because this pair IS that
 * pair piece for piece: a flag on head state, written from the ENVELOPE, and an
 * undo that clears it. A reviewer comparing the two blocks should find them
 * structurally identical.
 *
 * **The `at`/`actorId` provenance is the whole feature.** The FAQ's promise is
 * that a delete retains history because other events cite the ticket, so what
 * has to survive is not merely "this ticket is gone" but WHO removed it and
 * WHEN. A `deleted: true` boolean would lose both, and the mutation that kills
 * the first `it` below is exactly that: replace the object with `true` and the
 * `toEqual({ actorId, at })` reddens while the `!== null` checks in every other
 * suite stay green.
 *
 * **`restored` folds BACK to `null`, not to a third value.** That is what makes
 * "never deleted" and "deleted then restored" the same state as far as every
 * reader is concerned — the property `deleted?: {…} | null` was chosen for, and
 * the one an `{ restoredAt }` variant would break: a reader testing
 * `state.deleted === null` would then be false for a ticket that is visibly
 * live everywhere.
 */
describe('ticket.deleted / ticket.restored fold the flag their closed pair folds', () => {
  it('creation writes `deleted: null`, so the fold and the column read agree in SHAPE', () => {
    // Not `deleted ?? null`. The dual-client rig compares whole `TicketState`s
    // with `toEqual`, so creation having the KEY is the claim — the same
    // tightening 13.696 records for `rank`, and for the same reason:
    // `rowToTicketState` always produces a `deleted` key, so a reducer that
    // omitted it on creation would differ from the server by shape alone.
    expect(fold([createdWith({ start: 'focus' })]).deleted).toBeNull();
  });

  it('deleted records the actor and the server time; restored clears it; stateId never moves', () => {
    const deleteEnv = deletedEvent();
    const deleted = fold([createdWith({ start: 'focus' }), transitioned('doing'), deleteEnv]);
    expect(deleted.deleted).toEqual({ actorId: DEFAULT_ACTOR, at: deleteEnv.serverTime });
    // The state the ticket was deleted IN is untouched. This is the claim the
    // undo rests on: `restored` puts the ticket back where the person left it,
    // so a fold that moved `stateId` on delete would make the undo restore a
    // ticket into a state nobody chose.
    expect(deleted.stateId).toBe('doing');
    expect(deleted.stateCategory).toBe('active');

    const restored = fold([createdWith({ start: 'focus' }), transitioned('doing'), deleteEnv, restoredEvent()]);
    expect(restored.deleted).toBeNull();
    expect(restored.stateId).toBe('doing');
  });

  it('an actor set on the envelope is the one recorded, not the default', () => {
    // The positive control for the line above: `toEqual({ actorId:
    // DEFAULT_ACTOR, … })` passes trivially if the reducer hardcoded the
    // fixture's own default actor. This one overrides it, so a reducer reading
    // any constant reddens here and only here.
    const deleteEnv = makeEnvelope({
      type: 'ticket.deleted',
      entity: { kind: 'ticket', id: TICKET },
      payload: {},
      actorId: '01J9GOTHER00000000000000A',
      serverTime: '2026-09-20T06:30:00.000Z',
    });
    expect(fold([createdWith({ start: 'focus' }), deleteEnv]).deleted).toEqual({
      actorId: '01J9GOTHER00000000000000A',
      at: '2026-09-20T06:30:00.000Z',
    });
  });

  it('a second delete OVERWRITES the first — which is why the engine refuses one', () => {
    // Pinned here as a fact about the REDUCER, not as a defect: the fold is
    // written from the envelope (the line above), so replaying two deletes
    // yields the second actor's claim. The reducer cannot refuse — it is a pure
    // fold with no notion of "already" — so `checkTicketDeleted`'s
    // `already-deleted` guard (`packages/rule-engine/src/checks/deletion.ts`)
    // is the only thing standing between this and an append-only ledger whose
    // recorded deleter can be rewritten. A reader who finds this test
    // surprising should read that guard before changing it.
    const second = makeEnvelope({
      type: 'ticket.deleted',
      entity: { kind: 'ticket', id: TICKET },
      payload: {},
      actorId: '01J9GSECOND0000000000000A',
      serverTime: '2026-09-20T07:00:00.000Z',
    });
    const state = fold([createdWith({ start: 'focus' }), deletedEvent(), second]);
    expect(state.deleted).toEqual({ actorId: '01J9GSECOND0000000000000A', at: '2026-09-20T07:00:00.000Z' });
  });

  it('TICKET_EVENT_TYPES names both, so every replay reader that iterates it sees them', () => {
    expect(TICKET_EVENT_TYPES).toContain('ticket.deleted');
    expect(TICKET_EVENT_TYPES).toContain('ticket.restored');
  });

  it('the two are registered on the ticket entity at version 1', () => {
    expect(domainRegistry.get('ticket.deleted', 1)?.entityKind).toBe('ticket');
    expect(domainRegistry.get('ticket.restored', 1)?.entityKind).toBe('ticket');
  });
});

/**
 * 13.696 — the rank key folds onto the ticket, and ONLY the key (spec §8.1).
 * Rank is a shared manual order within one project: the Backlog tab sorts by it
 * and a reorder is exactly one `ticket.ranked`, so the fold must move `rank` and
 * nothing else — a fold that also touched `stateId` would make a reorder look
 * like a status change to every reader of the transition log.
 */
describe('13.696 ticket.ranked sets rank; ticket.created starts it null', () => {
  it('a created ticket is unranked, with the field present and null', () => {
    // **Tightened by Task 3 (2026-09-18), and the tightening is the point.**
    // Task 1 asserted `rank ?? null` here on purpose: creation did not write the
    // field, because `rowToTicketState` builds a `TicketState` from COLUMNS and
    // there was no `rank` column yet, and a `toBeNull` then would have pinned
    // the very PRESENCE that broke the reducer/read-model boundary. Task 3 adds
    // the column and settles the question the other way — creation now writes
    // `rank: null` (see the creation branch in `ticket-state.ts`) — so
    // `toBeNull` is now exactly the claim that must hold, and `?? null` would
    // pass on a regression that dropped the key again.
    //
    // What measures the agreement rather than the field: the dual-client rig
    // compares whole `TicketState`s with `toEqual` (`apps/server/test/
    // dual-client/scenarios.test.ts:203`, `rig.test.ts:92`/`:315`), so the
    // reducer's output and the server's column read have to be equal in SHAPE,
    // not merely in the value a `?? null` reader would see.
    expect(fold([createdWith({ start: 'backlog' })]).rank).toBeNull();
  });
  it('ticket.ranked { rank } sets it and touches nothing else', () => {
    const before = fold([createdWith({ start: 'backlog' })]);
    const after = applyTicketEvent(before, rankedEvent('n'), deps);
    expect(after.rank).toBe('n');
    // The whole rest of the state is byte-identical: strip the one field under
    // test from both sides and the two must be indistinguishable.
    expect({ ...after, rank: undefined }).toEqual({ ...before, rank: undefined });
  });
  it('a malformed rank (a space) throws at parse — the reducer never applies it', () => {
    const before = fold([createdWith({ start: 'backlog' })]);
    // The assertion names the CAUSE rather than "something threw". As first
    // written this test PASSED with `rank.js` still missing, because an unknown
    // event type throws too — a different failure wearing the same colour, and
    // one that would have stayed green if `ticket.ranked` had been registered
    // with a permissive schema.
    const message = messageOf(() => applyTicketEvent(before, rankedEvent('a b'), deps));
    expect(message).toContain('must be a rank key over 0-9a-z');
    expect(message).not.toContain('not a ticket event');
  });
  it('a TRAILING-ZERO key is refused at the door, because it has no room below it', () => {
    // Not a style rule. `rankBetween('a', 'a0')` has no answer to give — nothing
    // in `[0-9a-z]` sorts under `'0'` — and the plan's own algorithm does not
    // fail on it, it appends `'0'` forever (measured before this door existed:
    // `NONTERMINATING at i=20001` with a step cap). Every producer is safe by
    // construction (`rankBetween` only ever appends a digit >= 1), so this door
    // is the single place a hand-written key could get in. `isRankKey` is the
    // predicate that defines the space, and the door uses it rather than the
    // looser `RANK_KEY_REGEX`, which admits `'a0'`.
    const before = fold([createdWith({ start: 'backlog' })]);
    const message = messageOf(() => applyTicketEvent(before, rankedEvent('a0'), deps));
    expect(message).toContain("must not end in '0'");
    // The positive control, through the same call: a legal key is accepted, so
    // the refusal above is about the trailing zero and not about the door
    // refusing `ticket.ranked` outright. Without it, a schema that rejected
    // every rank would pass the line above.
    expect(applyTicketEvent(before, rankedEvent('a1'), deps).rank).toBe('a1');
  });
  it('TICKET_EVENT_TYPES names it, so every replay reader that iterates it sees them', () => {
    expect(TICKET_EVENT_TYPES).toContain('ticket.ranked');
  });
});

/**
 * 13.722 — `reopenedAt`: armed by an explicit reopen, disarmed by ANY
 * transition (spec §8.2, second wave 2026-09-18).
 *
 * The field is a SWEEP INPUT, not a display fact. `ticket.reopened` already
 * clears `closed`; what it could not say before this is *when* the reopen
 * happened, and that timestamp is the whole reason the auto-close sweep needs
 * it: a ticket sitting terminal for 30 days looks identical whether nobody has
 * touched it or somebody reopened it yesterday, and closing it again an hour
 * after a person deliberately reopened it is the behaviour §8.2's "reopen wins"
 * clause exists to forbid.
 *
 * **Why ANY transition clears it, including one back into the same terminal
 * state.** The clock the sweep measures is "how long has this ticket been
 * sitting in the state it is in". A transition is a person acting on the
 * ticket, which restarts that clock — so the reopened-ness is no longer the
 * most recent thing that happened to it, and letting the flag survive would
 * exempt the ticket from auto-close forever after one reopen. "Even back into
 * the same terminal state" is not an edge case to tolerate; it is the re-arm
 * path §8.2 names explicitly, and it is the reason this is cleared on the
 * transition rather than derived from the transition log at sweep time.
 */
describe('13.722 ticket.reopened arms reopenedAt; any transition clears it', () => {
  it('a created ticket is not reopened, with the field present and null', () => {
    // `toBeNull` rather than `?? null`, on 13.696's ruling: `reopenedAt` is
    // OPTIONAL on the domain type only because hundreds of test literals
    // predate it. Every producer sets it — this branch is the first — and a
    // `?? null` here would pass on a regression that dropped the key, which is
    // the shape the dual-client rig's whole-`TicketState` `toEqual` compares.
    expect(fold([createdWith({ start: 'focus' })]).reopenedAt).toBeNull();
  });

  it('an explicit reopen records the envelope server time, and moves nothing else', () => {
    const before = fold([createdWith({ start: 'focus' }), transitioned('doing')]);
    const reopenEnv = reopenedEvent();
    const after = applyTicketEvent(before, reopenEnv, deps);
    expect(after.reopenedAt).toBe(reopenEnv.serverTime);
    // The whole rest of the state is byte-identical: strip the one field under
    // test from both sides and the two must be indistinguishable. This is what
    // distinguishes "the fold set one field" from "the fold rewrote the state
    // and the field happens to be right".
    expect({ ...after, reopenedAt: undefined }).toEqual({ ...before, reopenedAt: undefined });
  });

  it('a following transition clears it, including back into the SAME terminal state', () => {
    const armed = fold([
      createdWith({ start: 'focus' }),
      transitioned('doing'),
      transitioned('done'),
      closedEvent(),
      reopenedEvent(),
    ]);
    // The positive control, in the same measurement: after the reopen and
    // before any transition the field IS set. Without this line the assertion
    // below is satisfied by a reducer that never sets the field at all.
    expect(armed.reopenedAt).toBe(reopenedEvent().serverTime);
    expect(armed.stateId).toBe('done');

    const rearmed = applyTicketEvent(armed, transitioned('done'), deps);
    expect(rearmed.reopenedAt).toBeNull();
    // Back into the state it was already in: the transition is real (its entry
    // lands in the log) even though `stateId` does not move, which is exactly
    // the case a "clear it only when the state changes" implementation gets
    // wrong.
    expect(rearmed.stateId).toBe('done');
    expect(rearmed.transitions.length).toBe(armed.transitions.length + 1);
  });

  it('a SECOND reopen overwrites the stamp: the field is the LAST reopen, not the first', () => {
    // **Pinned because nothing held the word to it.** `entity-state.ts`, the
    // migration's COMMENT and this task's own prose all say *last* explicitly
    // reopened, and a survivor proved that was unenforced: mutating the reopen
    // arm to `state.reopenedAt ?? env.serverTime` — a first-write-wins stamp —
    // left every other case in this file green. Nothing else here could catch
    // it, because the sweep's predicate is only "is it NULL", so first and last
    // are indistinguishable to every other case.
    //
    // **The path below is the ONLY one that discriminates, and it is
    // reachable.** `?? ` differs from a plain stamp only when a
    // `ticket.reopened` arrives while `reopenedAt` is ALREADY set. A transition
    // clears the flag, so a reopen after any transition cannot tell the two
    // apart — the first cut of this case walked that path and did not kill the
    // mutant. What DOES tell them apart needs a second reopen with no
    // transition in between, and the doors permit exactly that: `ticket.reopened`
    // clears `closed` and leaves the ticket in its terminal state (§1.2), and
    // `checkTicketClosed` refuses only on `already-closed` + `close-requires-
    // terminal` — so closing again straight after a reopen is ACCEPTED, which
    // makes the second reopen ACCEPTED. Neither `ticket.closed` nor
    // `ticket.reopened` touches `reopenedAt`, so at the second reopen the field
    // still holds the FIRST instant, and that is the state the mutant reads.
    const firstReopen = makeEnvelope({
      type: 'ticket.reopened',
      entity: { kind: 'ticket', id: TICKET },
      payload: {},
      serverTime: '2026-08-20T09:00:00.100Z',
    });
    const secondReopen = makeEnvelope({
      type: 'ticket.reopened',
      entity: { kind: 'ticket', id: TICKET },
      payload: {},
      serverTime: '2026-08-27T09:00:00.100Z',
    });
    const once = fold([
      createdWith({ start: 'focus' }),
      transitioned('doing'),
      transitioned('done'),
      closedEvent(),
      firstReopen,
    ]);
    expect(once.reopenedAt).toBe(firstReopen.serverTime);
    const twice = fold([
      createdWith({ start: 'focus' }),
      transitioned('doing'),
      transitioned('done'),
      closedEvent(),
      firstReopen,
      closedEvent(),
      secondReopen,
    ]);
    // The discriminating pair: `toBe(second)` alone is not enough (a stamp
    // carrying both reopens' worth of state would pass it), so the FIRST being
    // gone is asserted beside it. Together they fail a first-write-wins `??`.
    expect(twice.reopenedAt).toBe(secondReopen.serverTime);
    expect(twice.reopenedAt).not.toBe(firstReopen.serverTime);
  });

  it('SYSTEM_ACTOR_AUTO_CLOSE is a ULID, so the ingest door can accept it as an actor', () => {
    // Load-bearing rather than tidy: the sweep files its `ticket.closed` under
    // this id, and `submittedEventSchema` requires `actorId` to be a ULID
    // (`ids.ts`). A constant that failed this would refuse EVERY auto-close at
    // the door — a sweep that reports `refused: N` forever and closes nothing.
    expect(ULID_REGEX.test(SYSTEM_ACTOR_AUTO_CLOSE)).toBe(true);
    // The negative control, through the same predicate: a 26-character string
    // one character outside the alphabet is refused, so the line above is not
    // passing on a regex that matches everything.
    expect(ULID_REGEX.test('00000000000000000000SYS0AI')).toBe(false);
    expect(SYSTEM_ACTOR_NAMES.get(SYSTEM_ACTOR_AUTO_CLOSE)).toBe('Auto-close');
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
