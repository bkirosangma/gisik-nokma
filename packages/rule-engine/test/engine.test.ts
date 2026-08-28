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
import type { EngineContext, Refusal, Verdict } from '../src/engine.js';

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

type SpyCounts = { entityState: number; childrenStates: number; workflowDef: number };

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
  const counts = (): SpyCounts => ({
    entityState: getEntityState.mock.calls.length,
    childrenStates: getChildrenStates.mock.calls.length,
    workflowDef: getWorkflowDef.mock.calls.length,
  });
  return {
    ctx: { getEntityState, getChildrenStates, getWorkflowDef },
    calls: () => {
      const seen = counts();
      return seen.entityState + seen.childrenStates + seen.workflowDef;
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
  it('passes an unhandled event type through untouched', async () => {
    const { ctx } = spyContext();
    await expect(evaluateEvent(envelope(), ctx)).resolves.toEqual({ refused: false });
  });

  it('consults nothing for an unhandled type — a pass-through must not fake judgement it does not have', async () => {
    const { ctx, calls } = spyContext();
    await evaluateEvent(envelope(), ctx);
    expect(calls()).toBe(0);
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
    expect(counts()).toEqual({ entityState: 0, childrenStates: 0, workflowDef: 1 });
  });

  it('accepts a v2 that maps both dropped states without asking whether either is occupied', async () => {
    const { ctx, counts } = spyContext(basicV1);
    const verdict = await evaluateEvent(basicV2({ doing: 'todo', review: 'todo' }), ctx);
    expect(verdict).toEqual({ refused: false });
    expect(counts()).toEqual({ entityState: 0, childrenStates: 0, workflowDef: 1 });
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
 * order and stops at the first refusal. The fixture suite's single-rule
 * fixtures cannot witness "stops," only "refuses" — a rule engine that ran
 * every rule and returned the last refusal would pass them identically. This
 * pins the stop with two real rules (both implemented as of Task 9):
 * require-comment then require-evidence on the same edge.
 *
 * The refusing case alone only pins "stops at a refusal" — it cannot
 * distinguish a genuine early-return from an unconditional `return result`
 * that happens to return rule 1's verdict on its way past rule 2 (rule 1
 * refuses either way here, so an unconditional-return mutant produces the
 * identical observable result). The second case below closes that gap: rule
 * 1 ACCEPTS a real comment, so only a loop that keeps going after an accept
 * can ever reach rule 2 — and rule 2 must then genuinely refuse (no
 * evidenceAttachmentId is given), which an unconditional-return mutant
 * cannot produce (it would stop at rule 1's accept instead). Together the
 * two cases pin both directions of "first refusal wins" — stop on refuse,
 * continue on accept.
 */
describe('evaluateTransitionRules — first refusal wins (Task 8)', () => {
  it('stops at the first refusing rule and never reaches a later one', async () => {
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
