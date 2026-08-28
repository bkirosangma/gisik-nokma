import { describe, expect, it } from 'vitest';
import type { TicketState, TicketTypeDef } from '@gisik-nokma/domain';
import { makeEnvelope } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../src/memory-context.js';
import { checkTicketCreated } from '../src/checks/hierarchy.js';
import type { EngineContext } from '../src/engine.js';
import {
  EPIC,
  PROJECT,
  PROJECT_B,
  STORY,
  SUBTASK,
  TASK,
  WF,
  created,
  typeDefined,
} from '../src/checks/test-support.js';

const PARENT = '01J9GPAR000000000000000000';
const NEW = '01J9GNEW000000000000000000';
const GHOST = '01J9GGHT000000000000000000';

const baseCtx = () =>
  buildMemoryContext(
    [WF],
    [
      typeDefined(EPIC),
      typeDefined(STORY),
      typeDefined(TASK),
      typeDefined(SUBTASK),
      created(PARENT, 'story', null),
    ],
  );

/**
 * Every expectation below asserts the LITERAL rule id and the LITERAL,
 * fully-interpolated reason — never `REFUSALS['…']` or a call to one of the
 * builders. A test that asserts the constant it is testing certifies a typo in
 * that constant as correct copy, and this plan's deliverable IS the copy.
 */
describe('checkTicketCreated', () => {
  it('accepts a task under a story, and a task at project root', async () => {
    expect(await checkTicketCreated(created(NEW, 'task', PARENT), baseCtx())).toEqual({ refused: false });
    expect(await checkTicketCreated(created(NEW, 'task', null), baseCtx())).toEqual({ refused: false });
  });

  it('planted defect: an epic under a story — rank must exceed the parent rank', async () => {
    expect(await checkTicketCreated(created(NEW, 'epic', PARENT), baseCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.rank',
      reason: '"Epic" cannot go under "Story": a ticket\'s parent must be a bigger kind of work.',
    });
  });

  it('planted defect: equal rank cannot nest either', async () => {
    const ctx = buildMemoryContext([WF], [typeDefined(STORY), created(PARENT, 'story', null)]);
    expect(await checkTicketCreated(created(NEW, 'story', PARENT), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.rank',
      reason: '"Story" cannot go under "Story": a ticket\'s parent must be a bigger kind of work.',
    });
  });

  it('planted defect: a sub-task without a parent — the deepest rank always belongs to something', async () => {
    expect(await checkTicketCreated(created(NEW, 'sub-task', null), baseCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.deepest-rank-parent-required',
      reason:
        '"Sub-task" is the smallest kind of work, so it always belongs to a parent ticket. Pick the ticket this one is part of.',
    });
  });

  it('planted defect: a parent from another project', async () => {
    const ctx = buildMemoryContext(
      [WF],
      [typeDefined(STORY), typeDefined(TASK), created(PARENT, 'story', null, PROJECT_B)],
    );
    expect(await checkTicketCreated(created(NEW, 'task', PARENT, PROJECT), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.cross-project',
      reason: 'The parent is in a different project. Pick a parent from the same project.',
    });
  });

  it('planted defect: a parent that does not exist', async () => {
    expect(await checkTicketCreated(created(NEW, 'task', GHOST), baseCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.unknown-parent',
      reason: 'The chosen parent ticket does not exist in this workspace.',
    });
  });

  it('planted defect: a type nobody defined', async () => {
    expect(await checkTicketCreated(created(NEW, 'ghost-type', PARENT), baseCtx())).toEqual({
      refused: true,
      rule: 'ticket.unknown-type',
      reason: "This ticket's type is not defined in this workspace.",
    });
  });

  it('planted defect: a type whose workflow is not defined — the ledger accepts only what it can replay', async () => {
    const ctx = buildMemoryContext([], [typeDefined(TASK)]); // no workflow seeded
    expect(await checkTicketCreated(created(NEW, 'task', null), ctx)).toEqual({
      refused: true,
      rule: 'ticket.workflow-undefined',
      reason: "This ticket type's workflow has not been defined yet, so the ticket would have no status.",
    });
  });

  it('planted defect: creating live work under a finished parent — the remedy named is the reopen', async () => {
    const ctx = buildMemoryContext(
      [WF],
      [
        typeDefined(STORY),
        typeDefined(TASK),
        makeEnvelope({
          type: 'ticket.created',
          entity: { kind: 'ticket', id: PARENT },
          payload: { typeId: 'story', projectId: PROJECT, parentId: null, title: 'Quarterly filings' },
        }),
        // The destination field is `to`, NOT `toStateId` (`workflow.ts:137-145`,
        // pre-flight A10 + addendum 1). The transition LOG ENTRY this produces
        // separately and correctly spells `toStateId`; both spellings are real.
        // Spelled `toStateId` here the reducer throws at SETUP and this test
        // never reaches the assertion it exists to make.
        makeEnvelope({
          type: 'ticket.transitioned',
          entity: { kind: 'ticket', id: PARENT },
          payload: { to: 'done' },
        }),
      ],
    );
    expect(await checkTicketCreated(created(NEW, 'task', PARENT), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.parent-terminal',
      reason:
        '"Quarterly filings" is finished (Done). Adding live work reopens it — choose a state to reopen it to, then add this ticket.',
    });
  });

  // Workspace-invented types at and below sub-task's depth. Local to this pair
  // on purpose: the shared builders describe the built-in ladder.
  const CHECKLIST: TicketTypeDef = {
    id: 'checklist-item', name: 'Checklist item', icon: 'list', rank: 4, workflowId: 'wf-basic', fields: [],
  };
  const MICRO_STEP: TicketTypeDef = {
    id: 'micro-step', name: 'Micro step', icon: 'list', rank: 7, workflowId: 'wf-basic', fields: [],
  };
  const checklistCtx = () =>
    buildMemoryContext(
      [WF],
      [typeDefined(STORY), typeDefined(CHECKLIST), typeDefined(MICRO_STEP), created(PARENT, 'story', null)],
    );

  it('planted defect: a CUSTOM type at the deepest rank, cast at project root — the rule follows the rank, not the id', async () => {
    expect(await checkTicketCreated(created(NEW, 'checklist-item', null), checklistCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.deepest-rank-parent-required',
      reason:
        '"Checklist item" is the smallest kind of work, so it always belongs to a parent ticket. Pick the ticket this one is part of.',
    });

    // …and nothing slips underneath the floor: rank 7 is smaller work than a
    // sub-task, so exempting it would invert the rule's own justification.
    // This assertion is the standing guard for the `>=` in Step 7e.
    expect(await checkTicketCreated(created(NEW, 'micro-step', null), checklistCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.deepest-rank-parent-required',
      reason:
        '"Micro step" is the smallest kind of work, so it always belongs to a parent ticket. Pick the ticket this one is part of.',
    });
  });

  it('accepts the same custom deepest-rank type once it names a parent', async () => {
    expect(await checkTicketCreated(created(NEW, 'checklist-item', PARENT), checklistCtx())).toEqual({
      refused: false,
    });
  });

  /**
   * The two-layer guard (pre-flight A19, the precedent `transition.ts:11-28`
   * set). On the server, ingest's door has already checked the entity kind and
   * parsed the payload against the registered schema before the engine runs —
   * but the fixture suite and Plan 10's offline replica enter at
   * `evaluateEvent` and never pass through that door, so the check keeps its
   * own copy of both questions, and answers them in the same words the
   * transition check uses.
   */
  it('planted defect: a ticket.created that does not point at a ticket', async () => {
    const env = makeEnvelope({
      type: 'ticket.created',
      entity: { kind: 'project', id: PROJECT },
      payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: 'Not a ticket' },
    });
    expect(await checkTicketCreated(env, baseCtx())).toEqual({
      refused: true,
      rule: 'malformed-payload',
      reason: 'This ticket.created event does not point at a ticket; it points at a project.',
    });
  });

  it('planted defect: a malformed payload REFUSES rather than throwing out of the engine', async () => {
    const env = makeEnvelope({
      type: 'ticket.created',
      entity: { kind: 'ticket', id: NEW },
      payload: { typeId: 'task', projectId: PROJECT, parentId: 'not-a-ulid', title: 'Bad parent id' },
    });
    expect(await checkTicketCreated(env, baseCtx())).toEqual({
      refused: true,
      rule: 'malformed-payload',
      reason: "This ticket.created event's payload is malformed: must be a ULID",
    });
  });

  /**
   * Routed here by Task 3's review, and NOT in this task's brief. The reducer
   * handles `ticket.created` unconditionally (`ticket-state.ts:95` — it returns
   * a fresh state without ever consulting the `state` it was handed), which is
   * what the brief that wrote it asked for. So a SECOND accepted
   * `ticket.created` for a ticket that exists does not error and does not merge:
   * it silently resets the fold, wiping the ticket's status, its collaborators,
   * its field claims and its whole transition log — the evidence four-eyes
   * reads. Nothing shipped refused it. This check does.
   */
  it('planted defect: creating a ticket that already exists — a second create silently resets the fold', async () => {
    expect(await checkTicketCreated(created(PARENT, 'story', null), baseCtx())).toEqual({
      refused: true,
      rule: 'ticket.already-exists',
      reason:
        'This ticket already exists. Creating it again would erase everything recorded on it — open the existing ticket instead.',
    });
  });

  it('says the ticket already exists before it says anything about the type — the identity question comes first', async () => {
    // Both refusals are available: the ticket exists AND the type does not.
    // The order is the claim under test, so a check that merely refused
    // something would still fail here.
    expect(await checkTicketCreated(created(PARENT, 'ghost-type', null), baseCtx())).toEqual({
      refused: true,
      rule: 'ticket.already-exists',
      reason:
        'This ticket already exists. Creating it again would erase everything recorded on it — open the existing ticket instead.',
    });
  });

  /**
   * The one branch `buildMemoryContext` cannot stage: a parent that exists
   * whose TYPE does not. The reducer refuses to create a ticket of an undefined
   * type at all, so no sequence of events reaches this state — but a context is
   * an interface, not that reducer, and the server's answers come from two
   * different projections that can disagree. Rather than delete the guard (the
   * alternative this lane allows) it is pinned against a hand-built context,
   * which is the only thing that can hold the contradiction.
   */
  it('refuses when the PARENT exists but its type does not — the guard the reducer cannot stage', async () => {
    const orphanParent: TicketState = {
      kind: 'ticket',
      id: PARENT,
      workspaceId: '01J9GWS0000000000000000000',
      projectId: PROJECT,
      typeId: 'retired-type',
      parentId: null,
      workflowId: 'wf-basic',
      workflowVersion: 1,
      stateId: 'todo',
      stateCategory: 'open',
      assigneeId: null,
      collaboratorIds: [],
      fields: {},
      transitions: [],
    };
    const ctx: EngineContext = {
      getEntityState: async (kind, id) => (kind === 'ticket' && id === PARENT ? orphanParent : null),
      getChildrenStates: async () => [],
      getWorkflowDef: async () => WF,
      // The candidate's own type resolves; the parent's does not.
      getTicketTypeDef: async (typeId) => (typeId === 'task' ? TASK : null),
    };
    expect(await checkTicketCreated(created(NEW, 'task', PARENT), ctx)).toEqual({
      refused: true,
      rule: 'ticket.unknown-type',
      reason: "This ticket's type is not defined in this workspace.",
    });
  });
});
