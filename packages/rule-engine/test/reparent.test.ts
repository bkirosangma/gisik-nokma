import { describe, expect, it } from 'vitest';
import type { EventEnvelope, TicketState, TicketTypeDef } from '@gisik-nokma/domain';
import { makeEnvelope } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../src/memory-context.js';
import { checkTicketReparented } from '../src/checks/hierarchy.js';
import { evaluateEvent } from '../src/evaluate.js';
import type { EngineContext } from '../src/engine.js';
import {
  EPIC,
  OTHER_WS,
  PROJECT,
  PROJECT_B,
  STORY,
  SUBTASK,
  TASK,
  WF,
  WS,
  created,
  createdIn,
  typeDefined,
} from '../src/checks/test-support.js';

const A = '01J9GTKA000000000000000000';
const B = '01J9GTKB000000000000000000';
const C = '01J9GTKC000000000000000000';
const D = '01J9GTKD000000000000000000';
const OTHER = '01J9GPAR000000000000000000';
const GHOST = '01J9GGHT000000000000000000';

function reparent(ticketId: string, newParentId: string | null): EventEnvelope {
  return makeEnvelope({
    type: 'ticket.reparented',
    entity: { kind: 'ticket', id: ticketId },
    workspaceId: WS,
    payload: { newParentId },
  });
}

/** A → B → C, three deep, ranks strictly increasing: epic(1), story(2), task(3). */
const chainCtx = () =>
  buildMemoryContext(
    [WF],
    [
      typeDefined(EPIC),
      typeDefined(STORY),
      typeDefined(TASK),
      typeDefined(SUBTASK),
      created(A, 'epic', null),
      created(B, 'story', A),
      created(C, 'task', B),
    ],
  );

/**
 * A hand-built `TicketState`, for the two contradictions no sequence of events
 * can produce — the reducer refuses to create a ticket whose type is undefined,
 * so a context is the only thing that can hold one. Same device, and the same
 * reason for it, as `hierarchy.test.ts`'s `orphanParent`.
 */
function ticketLike(id: string, over: Partial<TicketState> = {}): TicketState {
  return {
    kind: 'ticket',
    id,
    workspaceId: WS,
    projectId: PROJECT,
    typeId: 'task',
    parentId: null,
    workflowId: 'wf-basic',
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

/**
 * Every expectation below asserts the LITERAL rule id and the LITERAL,
 * fully-interpolated reason — never `REFUSALS['…']` or a call to one of the
 * builders. A test that asserts the constant it is testing certifies a typo in
 * that constant as correct copy, and this plan's deliverable IS the copy.
 */
describe('checkTicketReparented', () => {
  it('accepts pulling a grandchild up to its grandparent', async () => {
    expect(await checkTicketReparented(reparent(C, A), chainCtx())).toEqual({ refused: false });
  });

  it('accepts moving a ticket above the deepest rank to project root', async () => {
    expect(await checkTicketReparented(reparent(C, null), chainCtx())).toEqual({ refused: false });
  });

  it('planted defect: a ticket as its own parent', async () => {
    expect(await checkTicketReparented(reparent(A, A), chainCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.cycle',
      reason:
        'This move would put the ticket inside one of its own sub-items, making a loop. A ticket cannot contain itself.',
    });
  });

  /**
   * The reason the cycle walk is not dead code. Under strict rank ordering a
   * loop looks unreachable — every parent outranks its child, so no chain bends
   * back. But `ticket-type.defined` is last-definition-wins, so the ranks can
   * move UNDER a ticket that already exists: after the re-definition below,
   * `phase` (3) under `step` (2) satisfies the rank rule outright, and this
   * reparent closes a loop that nothing but the walk refuses.
   */
  it('planted defect: reparenting under a descendant after a rank re-definition made it rank-legal', async () => {
    const phase: TicketTypeDef = { id: 'phase', name: 'Phase', icon: 'flag', rank: 1, workflowId: 'wf-basic', fields: [] };
    const step: TicketTypeDef = { id: 'step', name: 'Step', icon: 'check', rank: 2, workflowId: 'wf-basic', fields: [] };
    const ctx = buildMemoryContext(
      [WF],
      [
        typeDefined(phase),
        typeDefined(step),
        created(A, 'phase', null),
        created(B, 'step', A),
        typeDefined({ ...phase, rank: 3 }), // ranks moved under us — rank alone now allows A under B
      ],
    );
    // The rank rule really is satisfied: 3 > 2, so nothing but the walk is left.
    expect(await checkTicketReparented(reparent(A, B), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.cycle',
      reason:
        'This move would put the ticket inside one of its own sub-items, making a loop. A ticket cannot contain itself.',
    });
  });

  it('planted defect: reparenting into another project', async () => {
    const ctx = buildMemoryContext(
      [WF],
      [typeDefined(STORY), typeDefined(TASK), created(OTHER, 'story', null, PROJECT_B), created(C, 'task', null)],
    );
    expect(await checkTicketReparented(reparent(C, OTHER), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.cross-project',
      reason: 'The parent is in a different project. Pick a parent from the same project.',
    });
  });

  /**
   * The rank rule, staged so that rank is the ONLY thing wrong. The brief's own
   * version of this case moved B under C — but C is B's own child in the chain
   * above, so it staged a loop and the check correctly named the loop. A rank
   * violation needs a parent that is not a descendant: D is B's SIBLING under
   * the same epic.
   */
  it('planted defect: a story moved under a sibling task — rank violated with no loop in sight', async () => {
    const ctx = buildMemoryContext(
      [WF],
      [
        typeDefined(EPIC),
        typeDefined(STORY),
        typeDefined(TASK),
        created(A, 'epic', null),
        created(B, 'story', A),
        created(D, 'task', A),
      ],
    );
    expect(await checkTicketReparented(reparent(B, D), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.rank',
      reason: '"Story" cannot go under "Task": a ticket\'s parent must be a bigger kind of work.',
    });
  });

  it('planted defect: a sub-task cast loose to project root', async () => {
    const ctx = buildMemoryContext(
      [WF],
      [typeDefined(TASK), typeDefined(SUBTASK), created(A, 'task', null), created(B, 'sub-task', A)],
    );
    expect(await checkTicketReparented(reparent(B, null), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.deepest-rank-parent-required',
      reason:
        '"Sub-task" is the smallest kind of work, so it always belongs to a parent ticket. Pick the ticket this one is part of.',
    });
  });

  it('planted defect: reparenting a ticket that does not exist / onto a parent that does not exist', async () => {
    expect(await checkTicketReparented(reparent(GHOST, A), chainCtx())).toEqual({
      refused: true,
      rule: 'ticket.unknown',
      reason: 'This ticket does not exist in this workspace.',
    });
    expect(await checkTicketReparented(reparent(C, GHOST), chainCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.unknown-parent',
      reason: 'The chosen parent ticket does not exist in this workspace.',
    });
  });

  /**
   * Tenancy, and it bites HARDER here than on creation. `getTicketState` looks a
   * ticket up by id with no workspace predicate, over a projection keyed
   * `(entity_kind, entity_id)` — global, not per-tenant — so a parent belonging
   * to somebody else's workspace resolves rather than coming back null. A create
   * that resolved a foreign parent merely failed to make a new ticket; this
   * grafts an EXISTING ticket into another workspace's hierarchy. Controller
   * ruling P12.
   */
  it('planted defect: a parent in another workspace does not exist as far as this one is concerned', async () => {
    const ctx = buildMemoryContext(
      [WF],
      [
        typeDefined(STORY),
        typeDefined(TASK),
        createdIn(OTHER_WS, OTHER, 'story', PROJECT),
        created(C, 'task', null),
      ],
    );
    expect(await checkTicketReparented(reparent(C, OTHER), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.unknown-parent',
      reason: 'The chosen parent ticket does not exist in this workspace.',
    });
  });

  /**
   * The parent's type, and the parent is the subject. It is NOT
   * `ticket.unknown-type` — the sentence Task 6's brief specified and the one
   * ruling P11 overruled in `checkTicketCreated`: by the time this can fire, the
   * MOVED ticket's own type has resolved, so "This ticket's type is not defined
   * in this workspace." sends the actor to define a type that is already
   * defined.
   */
  it('refuses when the PARENT exists but its type does not — the guard the reducer cannot stage', async () => {
    const ctx: EngineContext = {
      getEntityState: async (kind, id) => {
        if (kind !== 'ticket') return null;
        if (id === C) return ticketLike(C);
        if (id === OTHER) return ticketLike(OTHER, { typeId: 'retired-type' });
        return null;
      },
      getChildrenStates: async () => [],
      getWorkflowDef: async () => WF,
      // The moved ticket's own type resolves; the parent's does not.
      getTicketTypeDef: async (_scope, typeId) => (typeId === 'task' ? TASK : null),
    };
    expect(await checkTicketReparented(reparent(C, OTHER), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.parent-type-unknown',
      reason:
        "The parent ticket's type is not defined in this workspace, so there is no way to tell whether this ticket belongs under it. Pick a different parent.",
    });
  });

  /**
   * The other side of P11's line, and the reason P11 is not "never say
   * `ticket.unknown-type` in a hierarchy check": when it is the MOVED ticket's
   * own type that is undefined, that sentence is exactly true, and the actor's
   * remedy is exactly the one it names. The reducer cannot stage this either —
   * it refuses to create a ticket of an undefined type at all.
   */
  it("refuses ticket.unknown-type when it is the MOVED ticket's own type that is missing", async () => {
    const ctx: EngineContext = {
      getEntityState: async (kind, id) =>
        kind === 'ticket' && (id === C || id === A) ? ticketLike(id, { typeId: 'retired-type' }) : null,
      getChildrenStates: async () => [],
      getWorkflowDef: async () => WF,
      getTicketTypeDef: async () => null,
    };
    const unknownType = {
      refused: true,
      rule: 'ticket.unknown-type',
      reason: "This ticket's type is not defined in this workspace.",
    };
    // Both the root move and the parented move ask the same question first.
    expect(await checkTicketReparented(reparent(C, null), ctx)).toEqual(unknownType);
    expect(await checkTicketReparented(reparent(C, A), ctx)).toEqual(unknownType);
  });

  /**
   * The two-layer guard (pre-flight A19, the precedent `transition.ts:11-28`
   * set). Ingest's door has already checked the kind and parsed the payload —
   * but the fixture suite and Plan 10's offline replica enter at `evaluateEvent`
   * and never pass through it.
   */
  it('planted defect: a ticket.reparented that does not point at a ticket', async () => {
    const env = makeEnvelope({
      type: 'ticket.reparented',
      entity: { kind: 'project', id: PROJECT },
      workspaceId: WS,
      payload: { newParentId: null },
    });
    expect(await checkTicketReparented(env, chainCtx())).toEqual({
      refused: true,
      rule: 'malformed-payload',
      reason: 'This ticket.reparented event does not point at a ticket; it points at a project.',
    });
  });

  it('planted defect: a malformed payload REFUSES rather than throwing out of the engine', async () => {
    const env = makeEnvelope({
      type: 'ticket.reparented',
      entity: { kind: 'ticket', id: C },
      workspaceId: WS,
      payload: { newParentId: 'not-a-ulid' },
    });
    expect(await checkTicketReparented(env, chainCtx())).toEqual({
      refused: true,
      rule: 'malformed-payload',
      reason: "This ticket.reparented event's payload is malformed: at newParentId: must be a ULID",
    });
  });

  /**
   * The hop ceiling, and it THROWS rather than refusing — deliberately, and the
   * distinction is the same one `safeParse` above rests on. A malformed payload
   * is the actor's claim and is refusable in the actor's language; a parent
   * chain that never ends is the STORE's state, a loop already standing in the
   * tree that this very check is what prevents. There is no true sentence to
   * tell the actor, and `hierarchy.cycle` would name a loop that is not the one
   * they proposed.
   *
   * Staged with two tickets that are each other's parent and neither of which is
   * the ticket being moved, so the walk never terminates on its own.
   */
  it('throws rather than looping forever when the ancestor chain is already cyclic', async () => {
    const ctx: EngineContext = {
      getEntityState: async (kind, id) => {
        if (kind !== 'ticket') return null;
        if (id === C) return ticketLike(C);
        if (id === A) return ticketLike(A, { parentId: B });
        if (id === B) return ticketLike(B, { parentId: A });
        return null;
      },
      getChildrenStates: async () => [],
      getWorkflowDef: async () => WF,
      getTicketTypeDef: async () => TASK,
    };
    await expect(checkTicketReparented(reparent(C, A), ctx)).rejects.toThrow(
      `checkTicketReparented: ancestor chain of ${A} exceeds 1000 — ledger integrity is broken`,
    );
  });
});

describe('checkTicketReparented under a terminal parent (owner decision 2026-08-20)', () => {
  /**
   * The destination field is `to`, NOT `toStateId` (`workflow.ts:137-145`,
   * pre-flight A10 + addendum 1). Spelled `toStateId` the reducer throws at
   * SETUP and these tests never reach the assertions they exist to make.
   */
  const donePriors = [
    typeDefined(STORY),
    typeDefined(TASK),
    makeEnvelope({
      type: 'ticket.created',
      entity: { kind: 'ticket', id: A },
      workspaceId: WS,
      payload: { typeId: 'story', projectId: PROJECT, parentId: null, title: 'Quarterly filings' },
    }),
    makeEnvelope({
      type: 'ticket.transitioned',
      entity: { kind: 'ticket', id: A },
      workspaceId: WS,
      payload: { to: 'done' },
    }),
    created(C, 'task', null),
  ];

  it('planted defect: moving live work under a finished parent — the remedy named is the reopen', async () => {
    const ctx = buildMemoryContext([WF], donePriors);
    expect(await checkTicketReparented(reparent(C, A), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.parent-terminal',
      reason:
        '"Quarterly filings" is finished (Done). Moving live work under it reopens it — choose a state to reopen it to, then move this ticket.',
    });
  });

  it('accepts a terminal child moving under a terminal parent — nothing contradicts, nothing reopens', async () => {
    const ctx = buildMemoryContext(
      [WF],
      [
        ...donePriors,
        makeEnvelope({
          type: 'ticket.transitioned',
          entity: { kind: 'ticket', id: C },
          workspaceId: WS,
          payload: { to: 'done' },
        }),
      ],
    );
    expect(await checkTicketReparented(reparent(C, A), ctx)).toEqual({ refused: false });
  });
});

/**
 * The check ORDER, which `checkTicketReparented`'s docstring pins and which
 * every test above leaves free: each case above stages exactly ONE available
 * refusal, so a check that answered them in any order at all would pass the
 * whole suite. Order is a property of its own, and a property nothing can
 * falsify is a property that is not being tested.
 *
 * Every case here stages TWO simultaneous defects and asserts which one names
 * the event.
 */
describe('checkTicketReparented — which refusal names the event when two are available', () => {
  it("the ticket's own absence outranks the parent's: there is nothing to move", async () => {
    expect(await checkTicketReparented(reparent(GHOST, OTHER), chainCtx())).toEqual({
      refused: true,
      rule: 'ticket.unknown',
      reason: 'This ticket does not exist in this workspace.',
    });
  });

  it('a loop is named as a LOOP even when the rank is also violated', async () => {
    // A (epic, rank 1) proposed under its own grandchild C (task, rank 3): the
    // rank rule is violated too, and naming it would send the actor to pick a
    // bigger parent — inside the sub-tree that is the actual problem.
    expect(await checkTicketReparented(reparent(A, C), chainCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.cycle',
      reason:
        'This move would put the ticket inside one of its own sub-items, making a loop. A ticket cannot contain itself.',
    });
  });

  it('a loop is named as a LOOP even when the parent is in another project', async () => {
    const ctx = buildMemoryContext(
      [WF],
      [typeDefined(EPIC), typeDefined(STORY), created(A, 'epic', null), created(B, 'story', A, PROJECT_B)],
    );
    expect(await checkTicketReparented(reparent(A, B), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.cycle',
      reason:
        'This move would put the ticket inside one of its own sub-items, making a loop. A ticket cannot contain itself.',
    });
  });

  it('a foreign WORKSPACE outranks a foreign project: the more specific answer would be false, and would leak', async () => {
    const ctx = buildMemoryContext(
      [WF],
      [
        typeDefined(STORY),
        typeDefined(TASK),
        createdIn(OTHER_WS, OTHER, 'story', PROJECT_B),
        created(C, 'task', null),
      ],
    );
    expect(await checkTicketReparented(reparent(C, OTHER), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.unknown-parent',
      reason: 'The chosen parent ticket does not exist in this workspace.',
    });
  });

  /**
   * The chain-position pin `checkTicketCreated` was missing until now (pre-flight
   * addendum 9a): a mutation hoisting the parent-type guard above the
   * cross-project check passed the entire suite, because nothing staged both at
   * once. Hand-built, because the reducer cannot make a ticket whose type is
   * undefined.
   */
  it('a cross-project parent outranks an unreadable parent TYPE', async () => {
    const ctx: EngineContext = {
      getEntityState: async (kind, id) => {
        if (kind !== 'ticket') return null;
        if (id === C) return ticketLike(C);
        if (id === OTHER) return ticketLike(OTHER, { typeId: 'retired-type', projectId: PROJECT_B });
        return null;
      },
      getChildrenStates: async () => [],
      getWorkflowDef: async () => WF,
      getTicketTypeDef: async (_scope, typeId) => (typeId === 'task' ? TASK : null),
    };
    expect(await checkTicketReparented(reparent(C, OTHER), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.cross-project',
      reason: 'The parent is in a different project. Pick a parent from the same project.',
    });
  });

  it('a cross-project parent outranks a rank violation: the wrong parent is not a rank problem', async () => {
    const ctx = buildMemoryContext(
      [WF],
      [typeDefined(EPIC), typeDefined(STORY), created(OTHER, 'story', null, PROJECT_B), created(C, 'epic', null)],
    );
    expect(await checkTicketReparented(reparent(C, OTHER), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.cross-project',
      reason: 'The parent is in a different project. Pick a parent from the same project.',
    });
  });

  it('a rank violation outranks a finished parent: the remediable contradiction comes last', async () => {
    const ctx = buildMemoryContext(
      [WF],
      [
        typeDefined(EPIC),
        typeDefined(STORY),
        created(OTHER, 'story', null),
        makeEnvelope({
          type: 'ticket.transitioned',
          entity: { kind: 'ticket', id: OTHER },
          workspaceId: WS,
          payload: { to: 'done' },
        }),
        created(C, 'epic', null),
      ],
    );
    expect(await checkTicketReparented(reparent(C, OTHER), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.rank',
      reason: '"Epic" cannot go under "Story": a ticket\'s parent must be a bigger kind of work.',
    });
  });
});

/**
 * The dispatch, which every test above bypasses by calling the check directly.
 * Without this, deleting `case 'ticket.reparented'` from `evaluate.ts` passes
 * the entire suite — the check would be perfect and unreachable, and the engine
 * would accept every reparent through the pass-through default.
 */
describe('evaluateEvent dispatches ticket.reparented', () => {
  it('routes the event to checkTicketReparented rather than passing it through', async () => {
    expect(await evaluateEvent(reparent(A, A), chainCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.cycle',
      reason:
        'This move would put the ticket inside one of its own sub-items, making a loop. A ticket cannot contain itself.',
    });
  });
});
