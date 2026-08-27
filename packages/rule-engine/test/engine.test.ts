import { describe, expect, it, vi } from 'vitest';
import { newUlid, type EventEnvelope, type WorkflowDefinedPayload } from '@gisik-nokma/domain';
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

function spyContext(): { ctx: EngineContext; calls: () => number } {
  const getEntityState = vi.fn(async () => null);
  const getChildrenStates = vi.fn(async () => []);
  const getWorkflowDef = vi.fn(async () => null);
  return {
    ctx: { getEntityState, getChildrenStates, getWorkflowDef },
    calls: () =>
      getEntityState.mock.calls.length +
      getChildrenStates.mock.calls.length +
      getWorkflowDef.mock.calls.length,
  };
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
