import { describe, expect, it, vi } from 'vitest';
import {
  newUlid,
  type EntityState,
  type EventEnvelope,
  type TicketState,
  type WorkflowDef,
  type WorkflowDefinedPayload,
} from '@gisik-nokma/domain';
import { evaluateEvent } from '../src/evaluate.js';
import { REFUSAL_RULES } from '../src/refusal-rules.js';
import { evaluateTransitionRules } from '../src/rules/index.js';
import type { EngineContext, Refusal, Verdict } from '../src/engine.js';
import type { TransitionRuleInput } from '../src/rules/types.js';

function envelope(overrides: Partial<EventEnvelope> = {}): EventEnvelope {
  const workspaceId = newUlid();
  return {
    id: newUlid(),
    workspaceId,
    entity: { kind: 'workspace', id: workspaceId },
    type: 'workspace.created',
    version: 1,
    payload: { name: 'Convenience Corner' },
    actorId: newUlid(),
    origin: 'server',
    clientTime: '2026-08-20T09:00:00.000Z',
    serverTime: '2026-08-20T09:00:01.000Z',
    seq: 1,
    ...overrides,
  };
}

/** A workflow.defined envelope whose entity id matches its payload id, as every legitimate one does. */
function defined(payload: Omit<WorkflowDefinedPayload, 'id'> & { id?: string }): EventEnvelope {
  const id = payload.id ?? newUlid();
  return envelope({
    type: 'workflow.defined',
    entity: { kind: 'workflow', id },
    payload: { ...payload, id },
  });
}

type SpyCounts = {
  entityState: number;
  childrenStates: number;
  workflowDef: number;
  ticketTypeDef: number;
};

/**
 * `entity`/`children` default to Plan 1's original stubs (no ticket, no
 * children) so every pre-existing call site is unaffected; the parent-terminal
 * tests below are the only callers that pass them.
 */
function spyContext(
  latest: WorkflowDef | null = null,
  opts: { entity?: EntityState | null; children?: TicketState[] } = {},
): {
  ctx: EngineContext;
  calls: () => number;
  counts: () => SpyCounts;
} {
  const getEntityState = vi.fn(async () => opts.entity ?? null);
  const getChildrenStates = vi.fn(async () => opts.children ?? []);
  const getWorkflowDef = vi.fn(async () => latest);
  // Counted from Plan 3 Task 5, which is the first caller: `checkTicketCreated`
  // reads a ticket type's rank and name. Leaving it out was correct while
  // nothing called it — and would stop being correct silently, because every
  // "N context calls" assertion in this file would go on passing while no
  // longer being total. A spy that is not summed is a spy that has been
  // switched off.
  const getTicketTypeDef = vi.fn(async () => null);
  const counts = (): SpyCounts => ({
    entityState: getEntityState.mock.calls.length,
    childrenStates: getChildrenStates.mock.calls.length,
    workflowDef: getWorkflowDef.mock.calls.length,
    ticketTypeDef: getTicketTypeDef.mock.calls.length,
  });
  return {
    ctx: { getEntityState, getChildrenStates, getWorkflowDef, getTicketTypeDef },
    calls: () => {
      const seen = counts();
      return seen.entityState + seen.childrenStates + seen.workflowDef + seen.ticketTypeDef;
    },
    counts,
  };
}

/** A published v1 with two states a v2 can drop at once — the stranding tests plant this. */
const basicV1: WorkflowDef = {
  id: 'wf_basic',
  version: 1,
  name: 'Basic',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'review', name: 'In review', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: 'todo', to: 'doing', rules: [] },
    { from: 'doing', to: 'review', rules: [] },
    { from: 'review', to: 'done', rules: [] },
    { from: 'done', to: 'todo', rules: [] },
  ],
};

/** The v2 that drops `doing` and `review`; `stateMapping` is the caller's business. */
function basicV2(stateMapping?: Record<string, string>): EventEnvelope {
  return defined({
    id: 'wf_basic',
    version: 2,
    name: 'Basic',
    initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: [{ from: 'todo', to: 'done', rules: [] }],
    ...(stateMapping === undefined ? {} : { stateMapping }),
  });
}

/**
 * `basicV1`'s `review -> done` edge, but carrying a require-comment rule.
 * Used only to prove the evaluation order between the parent-terminal
 * invariant (Task 7) and authored transition rules (Task 8): a fixture
 * suite that plants exactly one child and one candidate per case cannot
 * distinguish "the invariant ran first" from "the rule happened to agree" —
 * the same reason the stranding refusal's join and the invariant's own gate
 * needed a unit test rather than a fixture.
 */
const guardedV1: WorkflowDef = {
  id: 'wf_guarded',
  version: 1,
  name: 'Guarded',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'review', name: 'In review', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: 'todo', to: 'review', rules: [] },
    { from: 'review', to: 'done', rules: [{ kind: 'require-comment' }] },
  ],
};

/**
 * Two rules on one edge: require-comment then require-evidence (both real,
 * as of Task 9). The bare candidate below violates both, so this proves
 * first-refusal-wins directly — the returned refusal must be rule 1's
 * (require-comment), never rule 2's (require-evidence), because a correct
 * loop stops at the first refusal instead of evaluating every rule and
 * picking one. The second test below reuses this same pair the other way:
 * rule 1 accepts, so only a loop that keeps going after an accept can ever
 * reach — and genuinely refuse on — rule 2.
 */
const twoRulesV1: WorkflowDef = {
  id: 'wf_two_rules',
  version: 1,
  name: 'TwoRules',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [{ from: 'todo', to: 'done', rules: [{ kind: 'require-comment' }, { kind: 'require-evidence' }] }],
};

/**
 * A single-edge workflow carrying only require-field, for the
 * whitespace-only-value unit test the fixture suite cannot express: Task 9's
 * six fixtures only ever leave `due_date` unset or set it to a genuine date
 * string, never to a value that exists but is blank.
 */
const fieldGuardedV1: WorkflowDef = {
  id: 'wf_field_guarded',
  version: 1,
  name: 'FieldGuarded',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [{ from: 'todo', to: 'done', rules: [{ kind: 'require-field', field: 'due_date' }] }],
};

/**
 * A single-edge workflow carrying only require-evidence, for the
 * whitespace-only `evidenceAttachmentId` unit test the fixture suite cannot
 * express: Task 9's six fixtures only ever omit the id or set it to a
 * genuine one, never to a value that exists but is blank.
 */
const evidenceGuardedV1: WorkflowDef = {
  id: 'wf_evidence_guarded',
  version: 1,
  name: 'EvidenceGuarded',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [{ from: 'todo', to: 'done', rules: [{ kind: 'require-evidence' }] }],
};

/** A TicketState against `basicV1`, filled in enough for the transition path; every field a test doesn't care about gets a harmless default. */
function ticket(overrides: Pick<TicketState, 'id' | 'stateId' | 'stateCategory'> & Partial<TicketState>): TicketState {
  return {
    kind: 'ticket',
    workspaceId: 'ws_1',
    projectId: 'prj_1',
    typeId: 'task',
    parentId: null,
    workflowId: 'wf_basic',
    workflowVersion: 1,
    assigneeId: null,
    collaboratorIds: [],
    fields: {},
    transitions: [],
    ...overrides,
  };
}

/**
 * A ticket.transitioned envelope moving `entityId` (default `t1`) to `to`,
 * with an optional payload extension (e.g. a comment) for rules that read
 * more than `to`.
 */
function transitioned(to: string, entityId = 't1', payloadExtra: Record<string, unknown> = {}): EventEnvelope {
  return envelope({
    type: 'ticket.transitioned',
    entity: { kind: 'ticket', id: entityId },
    payload: { to, ...payloadExtra },
  });
}

/**
 * Plan 1's pass-through is gone, and with it the two tests that pinned "accepts
 * EVERY parsed event" and "consults nothing, always". Both would still pass
 * green against the real dispatcher — a workspace.created falls to the default
 * arm — which is exactly why they had to be rewritten rather than left: green
 * for a reason that no longer holds is how a retired claim survives. What
 * genuinely survives is narrower and stated as such below: an event type the
 * dispatcher does not handle passes through, and consults nothing on the way.
 */
describe('evaluateEvent — the dispatcher', () => {
  /**
   * 3.6 — the pass-through engine passes an unhandled event type through untouched. That it CONSULTS NOTHING — a pass-through must not fake judgement it does not have — is the test below.
   */
  it('passes an unhandled event type through untouched', async () => {
    const { ctx } = spyContext();
    await expect(evaluateEvent(envelope(), ctx)).resolves.toEqual({ refused: false });
  });

  it('consults nothing for an unhandled type — a pass-through must not fake judgement it does not have', async () => {
    const { ctx, calls } = spyContext();
    await evaluateEvent(envelope(), ctx);
    expect(calls()).toBe(0);
  });

  /**
   * The `ticket.created` arm, and the same claim in its other half: the
   * dispatcher routes it, and the spy ledger above is TOTAL. `getTicketTypeDef`
   * answers null here, so the check refuses `ticket.unknown-type` — the point
   * is not the verdict but the two lookups it took to reach it. Drop
   * `ticketTypeDef` from `counts()` and this assertion fails; that is the whole
   * reason it is written as a whole-object comparison rather than a sum.
   */
  it('routes ticket.created to the hierarchy check, and the call ledger counts the type lookup', async () => {
    const { ctx, counts } = spyContext();
    const env = envelope({
      type: 'ticket.created',
      entity: { kind: 'ticket', id: '01J9GNEW000000000000000000' },
      payload: {
        typeId: 'task',
        projectId: '01J9GPRJ000000000000000000',
        parentId: null,
        title: 'Reconcile the till',
      },
    });
    await expect(evaluateEvent(env, ctx)).resolves.toEqual({
      refused: true,
      rule: 'ticket.unknown-type',
      reason: "This ticket's type is not defined in this workspace.",
    });
    // One `getEntityState` for "does this ticket already exist", one
    // `getTicketTypeDef` for the type. No workflow, no children: neither
    // question is reachable once the type is unknown.
    expect(counts()).toEqual({ entityState: 1, childrenStates: 0, workflowDef: 0, ticketTypeDef: 1 });
  });

  it('routes workflow.defined to its rule module rather than passing it through', async () => {
    const { ctx, calls } = spyContext();
    const verdict = await evaluateEvent(
      defined({
        version: 1,
        name: 'Basic',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: [{ from: 'todo', to: 'done', rules: [] }],
      }),
      ctx,
    );
    // Accepted — but only after asking who the latest published version is.
    // The default arm would have accepted too, and consulted nobody.
    expect(verdict).toEqual({ refused: false });
    expect(calls()).toBe(1);
  });

  it('refuses a workflow.defined the pass-through would have waved through', async () => {
    const { ctx } = spyContext();
    const verdict = await evaluateEvent(
      defined({
        version: 1,
        name: 'Endless',
        initialStateId: 'todo',
        states: [{ id: 'todo', name: 'To do', category: 'open' }],
        transitions: [],
      }),
      ctx,
    );
    expect(verdict).toMatchObject({ refused: true, rule: REFUSAL_RULES.workflowStructure });
  });
});

/**
 * The malformed-payload detail names its SUBJECT, and these two checks are the
 * only ones where nothing else says so.
 *
 * Every check that parses a payload used to build its detail from
 * `issue.message` alone, dropping the zod path — and a zod message is a
 * sentence fragment. The five checks Plan 3 owns each pin the corrected string
 * in their own suite; these two are Plan 2's, and their only coverage is two
 * fixtures asserting `reasonStartsWith` a prefix that stops at "malformed:".
 * A fixture prefix cannot see the detail, so without these the shared
 * `malformedPayloadDetail` could lose the path clause here and stay green.
 *
 * The transitioned case carries a NESTED path on purpose: `comment.text` is the
 * only assertion in the repo that pins `path.join('.')` rather than a
 * single-segment path, so a join changed to a comma or a space dies here.
 */
describe('a malformed payload names the field it is about', () => {
  it('ticket.transitioned: a nested path is joined with dots', async () => {
    const { ctx } = spyContext();
    const env = envelope({
      type: 'ticket.transitioned',
      entity: { kind: 'ticket', id: newUlid() },
      payload: { to: 'done', comment: { text: 5 } },
    });
    await expect(evaluateEvent(env, ctx)).resolves.toEqual({
      refused: true,
      rule: 'malformed-payload',
      reason:
        "This ticket.transitioned event's payload is malformed: at comment.text: Expected string, received number",
    });
  });

  it('workflow.defined: the version that cannot be zero says which field it is', async () => {
    const { ctx } = spyContext();
    const id = newUlid();
    const env = envelope({
      type: 'workflow.defined',
      entity: { kind: 'workflow', id },
      payload: {
        id,
        version: 0,
        name: 'Basic',
        initialStateId: 'todo',
        states: [{ id: 'todo', name: 'To do', category: 'open' }],
        transitions: [],
      },
    });
    await expect(evaluateEvent(env, ctx)).resolves.toEqual({
      refused: true,
      rule: 'malformed-payload',
      reason:
        "This workflow.defined event's payload is malformed: at version: Number must be greater than or equal to 1",
    });
  });

  /**
   * The other half of the path clause: it is OMITTED when there is no path.
   * A payload that is not an object at all fails at the root, where
   * `issue.path` is `[]` — rendering the clause anyway would produce
   * "malformed: at : Expected object", which is worse than the subject-less
   * fragment the clause exists to replace. Neither shipped fixture reaches
   * this: both send objects, and both assert only the prefix that stops at
   * "malformed:".
   */
  it('workflow.defined: a payload that is not an object at all names no field, because there is none', async () => {
    const { ctx } = spyContext();
    const env = envelope({
      type: 'workflow.defined',
      entity: { kind: 'workflow', id: newUlid() },
      payload: 'not a definition',
    });
    await expect(evaluateEvent(env, ctx)).resolves.toEqual({
      refused: true,
      rule: 'malformed-payload',
      reason: "This workflow.defined event's payload is malformed: Expected object, received string",
    });
  });

  /**
   * The SEPARATOR, pinned for the same reason and by the same argument as the
   * structural refusal's below: every other assertion in this suite fires
   * exactly one issue, and a one-element join is identical for any separator
   * (`['x'].join('; ') === ['x'].join('')`), so `'; '` would otherwise be
   * unfalsifiable in brand-new code. `ticketCreatedPayload` is the one payload
   * here that fires two independent issues from one candidate — an empty
   * `typeId` and a `projectId` that is not a ULID — in the order zod reports
   * them, which is the schema's own key order. Change the join and this dies;
   * delete this and the join is unpinned again.
   *
   * It also proves the path clause is per-issue rather than appended once: both
   * fields are named, each beside its own message.
   */
  it('ticket.created: two issues are joined with a semicolon, each carrying its own path', async () => {
    const { ctx } = spyContext();
    const env = envelope({
      type: 'ticket.created',
      entity: { kind: 'ticket', id: newUlid() },
      payload: { typeId: '', projectId: 'not-a-ulid', parentId: null, title: 'Two things wrong' },
    });
    await expect(evaluateEvent(env, ctx)).resolves.toEqual({
      refused: true,
      rule: 'malformed-payload',
      reason:
        "This ticket.created event's payload is malformed: at typeId: String must contain at least 1 character(s); at projectId: must be a ULID",
    });
  });
});

/**
 * The structural refusal joins EVERY issue into one reason, separated by a
 * single space. No fixture can pin that separator: every planted definition in
 * the fixture suite is built to fire exactly one issue, and a one-element join
 * is identical for any separator (`['x'].join(' ') === ['x'].join('')`). So the
 * separator is pinned here, on a definition that fires exactly two issues, in
 * the order validateWorkflowDef fixes. Change the join and this dies; delete
 * this and the join is unpinned again.
 */
describe('the structural refusal names every issue at once', () => {
  it('joins two issues with a single space, in validateWorkflowDef order', async () => {
    const { ctx } = spyContext();
    const verdict = await evaluateEvent(
      defined({
        version: 1,
        name: 'Twice wrong',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'todo', name: 'To do again', category: 'open' },
          { id: 'doing', name: 'Doing', category: 'active' },
        ],
        transitions: [
          { from: 'todo', to: 'doing', rules: [] },
          { from: 'doing', to: 'todo', rules: [] },
        ],
      }),
      ctx,
    );
    expect(verdict).toEqual({
      refused: true,
      rule: 'workflow-structure',
      reason:
        'This workflow definition cannot be published: Two states share the id "todo"; state ids must be unique. This workflow has no terminal state, so no ticket could ever finish.',
    });
  });
});

/**
 * The stranding refusal has its OWN join — the dropped ids, comma-separated —
 * and it is unpinnable by fixture for the same reason the structural one was:
 * no fixture in the suite drops more than a single state, and a one-element
 * join reads identically for every separator. So it is pinned here, on the
 * only case that can tell `', '` from `''`: a v2 that drops two states at once.
 *
 * These two tests carry a second duty, and it is the load-bearing one. Open
 * question 6's owner decision is that occupancy is NEVER an engine input —
 * publish legality may not depend on who is standing where, because a
 * visibility-scoped client replica computes a different answer than the server
 * and one shared fixture suite could no longer bind both. The stranding branch
 * is exactly where an occupancy check would be tempted ("only refuse if
 * someone is actually in the dropped state"), so the ban is pinned where the
 * temptation lives: on both the refusing and the accepting path, the engine
 * asks for the latest definition and NOTHING else. `getEntityState` and
 * `getChildrenStates` staying at zero is the decision made falsifiable.
 */
describe('the stranding refusal, and what it refuses to ask', () => {
  it('lists two dropped states comma-separated, and consults no occupancy to do it', async () => {
    const { ctx, counts } = spyContext(basicV1);
    const verdict = await evaluateEvent(basicV2(), ctx);
    expect(verdict).toEqual({
      refused: true,
      rule: REFUSAL_RULES.workflowStateMapping,
      reason:
        'Version 2 drops state(s) "doing", "review" that version 1 has; publishing cannot see which tickets sit in which state, so every dropped state needs a stateMapping entry.',
    });
    expect(counts()).toEqual({ entityState: 0, childrenStates: 0, workflowDef: 1, ticketTypeDef: 0 });
  });

  it('accepts a v2 that maps both dropped states without asking whether either is occupied', async () => {
    const { ctx, counts } = spyContext(basicV1);
    const verdict = await evaluateEvent(basicV2({ doing: 'todo', review: 'todo' }), ctx);
    expect(verdict).toEqual({ refused: false });
    expect(counts()).toEqual({ entityState: 0, childrenStates: 0, workflowDef: 1, ticketTypeDef: 0 });
  });
});

/**
 * A published v1 with TWO terminal states, so a v2 that drops one still
 * satisfies `validateWorkflowDef`'s "no terminal state" gate on the survivor
 * — needed so 13.610 below reaches the stateMapping category check at all
 * rather than refusing `workflow-structure` first. Every transition is
 * `from: '*'`, exactly like `basicV1`/`WF`/`wf-proto` above: it satisfies
 * both the reachability walk and the terminal-inbound check in one shape.
 */
const twoTerminalV1: WorkflowDef = {
  id: 'wf_two_terminal',
  version: 1,
  name: 'Two terminal',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
    { id: 'archived', name: 'Archived', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'todo', rules: [] },
    { from: '*', to: 'doing', rules: [] },
    { from: '*', to: 'done', rules: [] },
    { from: '*', to: 'archived', rules: [] },
  ],
};

/** The v2 that drops `done` — TERMINAL — and keeps `archived`, the other terminal. */
function twoTerminalV2(stateMapping?: Record<string, string>): EventEnvelope {
  return defined({
    id: 'wf_two_terminal',
    version: 2,
    name: 'Two terminal',
    initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'doing', name: 'Doing', category: 'active' },
      { id: 'archived', name: 'Archived', category: 'terminal' },
    ],
    transitions: [
      { from: '*', to: 'todo', rules: [] },
      { from: '*', to: 'doing', rules: [] },
      { from: '*', to: 'archived', rules: [] },
    ],
    ...(stateMapping === undefined ? {} : { stateMapping }),
  });
}

/**
 * 13.610 — Ruling 53(iii), Finding 5 (final whole-branch review, 2026-09-17):
 * `foldTicketToWorkflowVersion` spreads `...state`, so a closed ticket's
 * `closed` claim rides along a republish fold unconditionally while
 * `stateId` moves to wherever `stateMapping` sends it — and until this fix
 * `workflowStateMapping`'s own validation never asked whether a dropped
 * TERMINAL state's replacement was itself terminal. A ticket closed in
 * `done` could be folded onto `doing` (active) by a publish alone, no
 * `ticket.closed`/`ticket.reopened` event anywhere in its history —
 * `close-requires-terminal`'s invariant breached through the one door that
 * is not an event at all.
 */
describe('a dropped TERMINAL state may only be remapped to another terminal state (Ruling 53(iii))', () => {
  it('13.610 refuses "done" (terminal, dropped) mapped to "doing" (active, survives), naming both states', async () => {
    const { ctx } = spyContext(twoTerminalV1);
    const verdict = await evaluateEvent(twoTerminalV2({ done: 'doing' }), ctx);
    expect(verdict).toEqual({
      refused: true,
      rule: REFUSAL_RULES.workflowStateMapping,
      reason:
        'The stateMapping sends terminal state "done" to "doing", which is not terminal; closed tickets must stay in a terminal state, so a dropped terminal state may only map to another terminal state.',
    });
  });

  it('accepts "done" mapped to "archived" — terminal to terminal', async () => {
    const { ctx } = spyContext(twoTerminalV1);
    const verdict = await evaluateEvent(twoTerminalV2({ done: 'archived' }), ctx);
    expect(verdict).toEqual({ refused: false });
  });
});

/**
 * `twoTerminalV1`'s own states, but `done` KEEPS its id — never dropped, so
 * 53(iii)'s `stateMapping` loop never runs over it at all. `archived` stays
 * terminal, so `validateWorkflowDef`'s "no terminal state" gate does not
 * fire either — the same reason `twoTerminalV1` carries two terminals in
 * the first place.
 */
function twoTerminalV2CategoryDemoted(): EventEnvelope {
  return defined({
    id: 'wf_two_terminal',
    version: 2,
    name: 'Two terminal',
    initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'doing', name: 'Doing', category: 'active' },
      { id: 'done', name: 'Done', category: 'active' },
      { id: 'archived', name: 'Archived', category: 'terminal' },
    ],
    transitions: [
      { from: '*', to: 'todo', rules: [] },
      { from: '*', to: 'doing', rules: [] },
      { from: '*', to: 'done', rules: [] },
      { from: '*', to: 'archived', rules: [] },
    ],
  });
}

/** The positive control: every state kept, every category unchanged. */
function twoTerminalV2Unchanged(): EventEnvelope {
  return defined({
    id: 'wf_two_terminal',
    version: 2,
    name: 'Two terminal',
    initialStateId: 'todo',
    states: twoTerminalV1.states,
    transitions: twoTerminalV1.transitions,
  });
}

/**
 * 13.611 — Ruling 56(a), N1 (opus re-review, final fix wave round 2,
 * 2026-09-17): closed ⇒ terminal's FOURTH door. 53(iii) gates a dropped
 * terminal state remapped to a non-terminal survivor; this gates a state
 * that is not dropped at all — kept, same id, but demoted out of terminal.
 * `foldTicketToWorkflowVersion` recomputes a ticket's category from THIS
 * version's definition unconditionally, so a closed ticket sitting in
 * `done` would ride the fold with `closed` intact while `state_category`
 * silently follows the demotion — the identical breach, reached without a
 * `stateMapping` entry ever being owed.
 */
describe('a SURVIVING state (never dropped) may not be demoted out of terminal on republish (Ruling 56(a), N1)', () => {
  it('13.611 refuses "done" kept but demoted terminal -> active, no mapping owed', async () => {
    const { ctx } = spyContext(twoTerminalV1);
    const verdict = await evaluateEvent(twoTerminalV2CategoryDemoted(), ctx);
    expect(verdict).toEqual({
      refused: true,
      rule: REFUSAL_RULES.workflowStateMapping,
      reason:
        'Version 2 changes state "done" from terminal to active; closed tickets must stay in a terminal state, so a terminal state may not be demoted while it keeps its id — drop it and map it, or reopen the tickets in it first.',
    });
  });

  it('accepts "done" kept and still terminal — every category unchanged', async () => {
    const { ctx } = spyContext(twoTerminalV1);
    const verdict = await evaluateEvent(twoTerminalV2Unchanged(), ctx);
    expect(verdict).toEqual({ refused: false });
  });
});

/**
 * The rule names are cross-plan API: later plans, the HTTP layer and the
 * offline replica all match on these exact strings. Renaming one is a breaking
 * change and should read as one here.
 */
describe('REFUSAL_RULES', () => {
  it('spells every canonical rule name', () => {
    expect(REFUSAL_RULES).toEqual({
      malformedPayload: 'malformed-payload',
      unknownTicket: 'unknown-ticket',
      unknownWorkflow: 'unknown-workflow',
      unknownState: 'unknown-state',
      illegalTransition: 'illegal-transition',
      strandedState: 'stranded-state',
      parentTerminal: 'parent-terminal-with-open-children',
      workflowStructure: 'workflow-structure',
      workflowVersion: 'workflow-version',
      workflowStateMapping: 'workflow-state-mapping',
      restrictTo: 'restrict-to',
      requireComment: 'require-comment',
      requireEvidence: 'require-evidence',
      requireField: 'require-field',
      requireDifferentUser: 'require-different-user',
      closeRequiresTerminal: 'close-requires-terminal',
      alreadyClosed: 'already-closed',
      notClosed: 'not-closed',
      closedTicket: 'closed-ticket',
      rankRequiresBacklog: 'rank-requires-backlog',
    });
  });

  it('a refusal names its rule and gives a plain-language reason', () => {
    const refusal: Refusal = {
      refused: true,
      rule: REFUSAL_RULES.requireComment,
      reason: 'This transition requires a comment (rule require-comment).',
    };
    const verdict: Verdict = refusal;
    if (verdict.refused) {
      expect(verdict.rule).toBe('require-comment');
      expect(verdict.reason).toContain('require-comment');
    } else {
      expect.unreachable('verdict must be a refusal');
    }
  });
});

/**
 * The parent-terminal invariant (transition.ts, Task 7) has two edges the
 * fixture suite cannot pin, for the same reason the stranding refusal's join
 * and its occupancy ban needed a unit test rather than a fixture: every
 * fixture in the suite plants exactly one child and only ever targets the
 * terminal state, so a fixture can't tell "the gate is load-bearing" from
 * "it happens not to matter here," and can't reach the reason string's
 * plural branch. Both are pinned here, following that precedent.
 */
describe('the parent-terminal invariant, and what the fixture suite cannot pin', () => {
  it('does not consult children, and does not refuse, when the target state is not terminal', async () => {
    const parent = ticket({ id: 't1', stateId: 'todo', stateCategory: 'open' });
    const openChild = ticket({ id: 't2', parentId: 't1', stateId: 'todo', stateCategory: 'open' });
    const { ctx, counts } = spyContext(basicV1, { entity: parent, children: [openChild] });
    // 'todo' -> 'doing' is a legal edge to a non-terminal ('active') state. An
    // open child sits in ctx ready to over-refuse if the category gate were
    // ever dropped — the gate's own job is to mean this never even looks.
    const verdict = await evaluateEvent(transitioned('doing'), ctx);
    expect(verdict).toEqual({ refused: false });
    expect(counts().childrenStates).toBe(0);
  });

  it('names both open children and renders the plural "are" once openCount is more than one', async () => {
    const parent = ticket({ id: 't1', stateId: 'review', stateCategory: 'active' });
    const childA = ticket({ id: 't2', parentId: 't1', stateId: 'todo', stateCategory: 'open' });
    const childB = ticket({ id: 't3', parentId: 't1', stateId: 'doing', stateCategory: 'active' });
    const { ctx } = spyContext(basicV1, { entity: parent, children: [childA, childB] });
    // 'review' -> 'done' is a legal edge to the terminal state; two children,
    // neither terminal, drive openCount to 2 and the reason's plural branch.
    const verdict = await evaluateEvent(transitioned('done'), ctx);
    expect(verdict).toEqual({
      refused: true,
      rule: REFUSAL_RULES.parentTerminal,
      reason: 'This ticket cannot enter "Done" while 2 of its child tickets are still open.',
    });
  });
});

/**
 * Task 7 carry-forward, pinned once Task 8 gives authored rules something to
 * disagree with the invariant about. No fixture in the suite can witness
 * this: every fixture that reaches a rule targets an edge with no open
 * children, and every fixture that has an open child targets an edge with no
 * rules. Only a case with BOTH can tell "invariant first" from "rules first"
 * apart, and that case is a unit test by design (Task 8 amendment 2).
 */
describe('the invariant runs before authored rules (Task 8 amendment 2)', () => {
  it('refuses parent-terminal-with-open-children even when the edge also carries a require-comment rule with no comment', async () => {
    const parent = ticket({ id: 't1', stateId: 'review', stateCategory: 'active', workflowId: 'wf_guarded' });
    const openChild = ticket({
      id: 't2',
      parentId: 't1',
      stateId: 'todo',
      stateCategory: 'open',
      workflowId: 'wf_guarded',
    });
    const { ctx } = spyContext(guardedV1, { entity: parent, children: [openChild] });
    // 'review' -> 'done' carries a require-comment rule, and no comment is
    // given. Were rules to run first (or the invariant to run after them),
    // this would refuse as require-comment instead.
    const verdict = await evaluateEvent(transitioned('done'), ctx);
    expect(verdict).toEqual({
      refused: true,
      rule: REFUSAL_RULES.parentTerminal,
      reason: 'This ticket cannot enter "Done" while 1 of its child tickets is still open.',
    });
  });
});

/**
 * `evaluateTransitionRules` (Task 8) runs a transition's rules in definition
 * order and returns the first refusal. The fixture suite's single-rule
 * fixtures cannot witness this at all — a rule engine that ran every rule and
 * returned the last refusal would pass them identically. This pins it with
 * two real rules (both implemented as of Task 9): require-comment then
 * require-evidence on the same edge.
 *
 * Neither case below can tell a genuine short-circuiting loop (never touches
 * rule 2 once rule 1 has refused) apart from an eager evaluate-all variant
 * (awaits every rule regardless, then picks the first one that refused):
 * both produce the identical verdict on both cases here, because neither
 * require-comment nor require-evidence reads `ctx`. What these two cases DO
 * pin: the returned refusal is rule 1's, not rule 2's, when rule 1 refuses
 * (first case); and rule 2 is genuinely reached and its own refusal
 * surfaces when rule 1 instead accepts (second case) — ruling out an
 * unconditional "return rule 1's verdict regardless" mutant, which the
 * second case alone would fail (it would resolve to rule 1's accept and
 * never reach rule 2). Task 10 closes the eager-vs-lazy gap those two leave
 * open, in the next describe block: `restrict-to` reads `ctx` for its
 * membership lookup, so counting `ctx` calls after a rule-1 refusal can tell
 * "stopped" from "evaluated anyway."
 */
describe('evaluateTransitionRules — first refusal wins (Task 8)', () => {
  it("refuses with the first authored rule's refusal, not a later one", async () => {
    const parent = ticket({ id: 't1', stateId: 'todo', stateCategory: 'open', workflowId: 'wf_two_rules' });
    const { ctx } = spyContext(twoRulesV1, { entity: parent });
    await expect(evaluateEvent(transitioned('done'), ctx)).resolves.toEqual({
      refused: true,
      rule: REFUSAL_RULES.requireComment,
      reason: 'This move must carry a comment explaining it, and none was provided.',
    });
  });

  it('continues past an accepting rule to the next one — a real comment reaches the now-implemented require-evidence', async () => {
    const parent = ticket({ id: 't1', stateId: 'todo', stateCategory: 'open', workflowId: 'wf_two_rules' });
    const { ctx } = spyContext(twoRulesV1, { entity: parent });
    // require-comment (rule 1) accepts a real comment, so a correct loop must
    // move on to rule 2. require-evidence is implemented (Task 9) and this
    // candidate carries no `evidenceAttachmentId`, so rule 2 genuinely
    // refuses. That require-evidence refusal — rather than rule 1's
    // require-comment refusal, and rather than acceptance — is this test's
    // only signal that evaluation did not stop after rule 1's accept: an
    // unconditional "return the first verdict" mutant would instead resolve
    // to rule 1's `{ refused: false }`-shaped accept-or-refuse, never reach
    // rule 2, and fail this assertion.
    await expect(
      evaluateEvent(transitioned('done', 't1', { comment: { text: 'Shipped and verified.' } }), ctx),
    ).resolves.toEqual({
      refused: true,
      rule: REFUSAL_RULES.requireEvidence,
      reason: 'This move must carry an attachment as evidence, and none was provided.',
    });
  });
});

/**
 * Task 10 controller obligation: the two tests above cannot distinguish a
 * genuine short-circuiting loop from an eager evaluate-all-then-pick-first
 * variant, because neither require-comment nor require-evidence ever reads
 * `ctx` — an eager variant is observationally identical to a lazy one when
 * no rule has a side channel to witness being asked. `restrict-to` does: its
 * role branch calls `ctx.getEntityState('membership', ...)`. Pairing it as
 * rule 2 behind a refusing require-comment makes the eager/lazy difference
 * observable — an eager (e.g. `Promise.all` then find-first-refusal) mutant
 * would still return rule 1's refusal (same verdict as today), but it would
 * also have called `ctx.getEntityState` for rule 2's membership lookup on
 * the way there. Calling `evaluateTransitionRules` directly (rather than
 * through `evaluateEvent`) keeps the count clean of the dispatcher's own
 * ticket lookup, so `entityState` counts only what the rules themselves ask.
 */
describe('evaluateTransitionRules is lazy: a later ctx-reading rule is never consulted after an earlier refusal', () => {
  it("refuses with require-comment's verdict without ever consulting restrict-to's membership lookup", async () => {
    const parent = ticket({ id: 't1', stateId: 'todo', stateCategory: 'open', workflowId: 'wf_two_rules' });
    const { ctx, counts } = spyContext(twoRulesV1, { entity: parent });
    const input: TransitionRuleInput = {
      env: transitioned('done'),
      ctx,
      ticket: parent,
      def: twoRulesV1,
      toState: twoRulesV1.states.find((state) => state.id === 'done')!,
      fromStateId: 'todo',
      payload: { to: 'done' },
    };
    const verdict = await evaluateTransitionRules(
      [{ kind: 'require-comment' }, { kind: 'restrict-to', roles: ['admin'] }],
      input,
    );
    expect(verdict).toEqual({
      refused: true,
      rule: REFUSAL_RULES.requireComment,
      reason: 'This move must carry a comment explaining it, and none was provided.',
    });
    // require-comment refused without touching ctx at all; restrict-to's
    // role branch is the only thing in this pairing that would call
    // getEntityState. Zero calls is the lazy loop's signature — an eager
    // evaluate-all variant would show at least one.
    expect(counts().entityState).toBe(0);
  });
});

/**
 * restrict-to's role branch narrows the membership lookup's result with
 * `membership.kind === 'membership'` before trusting `.role`. No well-typed
 * fixture can make that check matter: every EntityState variant besides
 * MembershipState (TicketState, OtherEntityState) has no `role` field at
 * all, so an absent kind check would read `undefined` either way and the
 * observable verdict would be identical — the mutation is unfalsifiable
 * through the type system alone. It matters for exactly the seam
 * `apps/server/src/engine-context.ts`'s `getEntityState` names in its own
 * ruled comment (adaptation map S9). That implementation used to end in
 * `as unknown as EntityState | null`; Plan 3's keystone removed the cast and
 * made the body answer null for the kinds it cannot serve, so the shipped
 * server no longer produces a wrongly-kinded value. The check stays, because
 * the class of bug does: Plan 3 Task 12 has since given `'ticket'` a real body
 * there and Plan 4 still owes `'membership'` one, so the seam is half filled and
 * a kind that answers for real is exactly where a wrongly-kinded value would
 * come from; Plan 10's replica writes a second implementation of the same
 * interface. This plants that scenario directly —
 * a value with `kind: 'ticket'` that happens to carry a `role` field
 * matching the rule's allowed list — the only way to make the check
 * observable, and the only way that mirrors why it exists.
 */
describe("restrict-to's membership kind-check, and what no well-typed fixture can pin", () => {
  it('refuses honestly when the value at a membership id is not actually a membership, even if it coincidentally carries a matching role field', async () => {
    const parent = ticket({ id: 't1', stateId: 'todo', stateCategory: 'open', workflowId: 'wf_two_rules' });
    // Only reachable via an unsafe cast in a real ctx implementation, never
    // through the harness or through well-typed test data: `kind: 'ticket'`
    // paired with a `role` property that coincidentally matches the rule.
    const wronglyKinded = { kind: 'ticket', role: 'admin' } as unknown as EntityState;
    const { ctx } = spyContext(null, { entity: wronglyKinded });
    const env = envelope({
      type: 'ticket.transitioned',
      entity: { kind: 'ticket', id: 't1' },
      payload: { to: 'done' },
      actorId: 'user_a',
    });
    const input: TransitionRuleInput = {
      env,
      ctx,
      ticket: parent,
      def: twoRulesV1,
      toState: twoRulesV1.states.find((state) => state.id === 'done')!,
      fromStateId: 'todo',
      payload: { to: 'done' },
    };
    const verdict = await evaluateTransitionRules([{ kind: 'restrict-to', roles: ['admin'] }], input);
    // A buggy narrowing (or none at all) would read the coincidental `role:
    // 'admin'` field and wrongly accept. The kind check must reject it and
    // fall through to the honest refusal.
    expect(verdict).toEqual({
      refused: true,
      rule: REFUSAL_RULES.restrictTo,
      reason: 'Only anyone with the role admin may make this move, and user_a is not among them.',
    });
  });
});

/**
 * Task 11 controller obligation, carried forward from Task 10: restrict-to
 * renders three lists, and only two of them are falsifiable through the
 * fixture suite. `allowed.join(', or ')` is pinned by
 * rule-restrict-to-refuses-when-no-criterion-matches.json (two criteria) and
 * `userIds.join(', ')` by rule-restrict-to-refuses-unlisted-user.json (two
 * ids) — but every fixture that names a role names exactly ONE, and a
 * one-element join renders identically under any separator whatsoever. The
 * `' or '` in `rule.roles.join(' or ')` was therefore unpinned: swapping it
 * for `', '`, `' and '`, or `''` left all ten Task 10 fixtures green. Two
 * roles is the smallest input that can tell them apart, and the wording
 * matters — "admin or owner" tells a reader either role suffices, which is
 * exactly restrict-to's OR semantics; "admin and owner" would describe a
 * conjunction the rule does not implement. A unit test rather than an
 * eleventh fixture, per the standing count-neutral ruling (fixture count
 * stays 59, gate stays 59): this pins a rendering, not a new behaviour.
 */
describe("restrict-to's role list joins with ' or ', which no single-role fixture can witness", () => {
  it('names both allowed roles in one OR-phrase when the rule carries two', async () => {
    const parent = ticket({ id: 't1', stateId: 'todo', stateCategory: 'open', workflowId: 'wf_two_rules' });
    // No membership at all: the role branch cannot short-circuit into an
    // acceptance, so the rendered `allowed` phrase reaches the refusal.
    const { ctx } = spyContext(null, { entity: null });
    const env = envelope({
      type: 'ticket.transitioned',
      entity: { kind: 'ticket', id: 't1' },
      payload: { to: 'done' },
      actorId: 'user_a',
    });
    const input: TransitionRuleInput = {
      env,
      ctx,
      ticket: parent,
      def: twoRulesV1,
      toState: twoRulesV1.states.find((state) => state.id === 'done')!,
      fromStateId: 'todo',
      payload: { to: 'done' },
    };
    const verdict = await evaluateTransitionRules([{ kind: 'restrict-to', roles: ['admin', 'owner'] }], input);
    // Character-for-character: the separator between the two roles is the
    // whole point, and the surrounding sentence is asserted with it so a
    // rewording cannot slip past under cover of the separator check.
    expect(verdict).toEqual({
      refused: true,
      rule: REFUSAL_RULES.restrictTo,
      reason: 'Only anyone with the role admin or owner may make this move, and user_a is not among them.',
    });
  });
});

/**
 * Task 9's require-field and require-evidence each have a blank-value branch
 * no fixture witnesses (task-9-report.md, Falsifiability): the six Task 9
 * fixtures only ever leave a value unset or set it to a genuine one, never
 * to a value that exists but is all whitespace. Both rules treat a
 * whitespace-only value as equivalent to absent — "set" means "set to
 * something," not merely "present" — and that distinction is pinned here
 * rather than by a seventh/eighth fixture (controller ruling: count-neutral
 * unit tests, fixture count stays 43, gate stays 59).
 */
describe('require-field and require-evidence refuse a blank value, not only an absent one', () => {
  it('refuses require-field when the field is set to a whitespace-only string', async () => {
    const parent = ticket({
      id: 't1',
      stateId: 'todo',
      stateCategory: 'open',
      workflowId: 'wf_field_guarded',
      fields: {
        due_date: {
          value: '   ',
          actorId: 'user_a',
          clientTime: '2026-08-20T09:00:00.000Z',
          serverTime: '2026-08-20T09:00:01.000Z',
        },
      },
    });
    const { ctx } = spyContext(fieldGuardedV1, { entity: parent });
    // The field claim exists — a bug that only checked `value !== undefined`
    // would call this "set" and accept. Only the trim-and-check the rule
    // actually does refuses here.
    await expect(evaluateEvent(transitioned('done'), ctx)).resolves.toEqual({
      refused: true,
      rule: REFUSAL_RULES.requireField,
      reason: 'This move needs the field "due_date" to be set first, and it is not.',
    });
  });

  it('refuses require-evidence when evidenceAttachmentId is a whitespace-only string', async () => {
    const parent = ticket({ id: 't1', stateId: 'todo', stateCategory: 'open', workflowId: 'wf_evidence_guarded' });
    const { ctx } = spyContext(evidenceGuardedV1, { entity: parent });
    // The id is present on the payload — a bug that only checked
    // `attachmentId.length > 0` would call this "an attachment" and accept.
    // Only the trim the rule actually does refuses here.
    await expect(
      evaluateEvent(transitioned('done', 't1', { evidenceAttachmentId: '   ' }), ctx),
    ).resolves.toEqual({
      refused: true,
      rule: REFUSAL_RULES.requireEvidence,
      reason: 'This move must carry an attachment as evidence, and none was provided.',
    });
  });
});
