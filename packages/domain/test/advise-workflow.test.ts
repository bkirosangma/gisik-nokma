import { describe, expect, it } from 'vitest';
import type { WorkflowDef } from '../src/workflow.js';
import { adviseWorkflowDef } from '../src/advise-workflow.js';
import { validateWorkflowDef } from '../src/validate-workflow.js';

/** Draft → Review → Approved, four-eyes on the approval. The canonical shape. */
function reviewDef(partial: Partial<WorkflowDef> = {}): WorkflowDef {
  return {
    id: 'wf_review',
    version: 1,
    name: 'Review',
    initialStateId: 'draft',
    states: [
      { id: 'draft', name: 'Draft', category: 'open' },
      { id: 'review', name: 'In review', category: 'active' },
      { id: 'approved', name: 'Approved', category: 'terminal' },
    ],
    transitions: [
      { from: 'draft', to: 'review', rules: [] },
      { from: 'review', to: 'draft', rules: [] },
      { from: 'review', to: 'approved', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'review' } }] },
    ],
    ...partial,
  };
}

function codes(d: WorkflowDef): string[] {
  return adviseWorkflowDef(d).map((advisory) => advisory.code);
}

describe('adviseWorkflowDef', () => {
  it('is silent on canonical four-eyes: the approval is only reachable through review', () => {
    expect(adviseWorkflowDef(reviewDef())).toEqual([]);
  });

  it('warns when a fast-track edge reaches the guarded move without entering the watched state', () => {
    const d = reviewDef({
      transitions: [
        { from: 'draft', to: 'review', rules: [] },
        { from: 'review', to: 'draft', rules: [] },
        { from: 'review', to: 'approved', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'review' } }] },
        { from: 'draft', to: 'approved', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'review' } }] },
      ],
    });
    expect(validateWorkflowDef(d)).toEqual([]);
    expect(adviseWorkflowDef(d)).toEqual([
      {
        code: 'rdu-bypassable',
        message:
          'A require-different-user rule on the transition from "Draft" to "Approved" watches the move to "In review", but this move can be reached without ever entering "In review"; on that path one person can make it alone.',
      },
    ]);
  });

  it('always warns on a from-any transition — a wildcard move is performable from the very start', () => {
    const d = reviewDef({
      transitions: [
        { from: 'draft', to: 'review', rules: [] },
        { from: 'review', to: 'draft', rules: [] },
        { from: 'review', to: 'approved', rules: [] },
        { from: '*', to: 'approved', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'review' } }] },
      ],
    });
    expect(adviseWorkflowDef(d)).toEqual([
      {
        code: 'rdu-bypassable',
        message:
          'A require-different-user rule on the transition from any state to "Approved" watches the move to "In review", but this move can be reached without ever entering "In review"; on that path one person can make it alone.',
      },
    ]);
  });

  it('warns when the guarded transition is itself an entry into the watched state and its from is still reachable', () => {
    const d = reviewDef({
      transitions: [
        { from: 'draft', to: 'review', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'review' } }] },
        { from: 'review', to: 'approved', rules: [] },
        { from: 'approved', to: 'review', rules: [] },
      ],
    });
    expect(codes(d)).toEqual(['rdu-bypassable']);
  });

  it('says nothing when rdu-unknown-state or rdu-unenterable-state already spoke', () => {
    const unknown = reviewDef({
      transitions: [
        { from: 'draft', to: 'review', rules: [] },
        { from: 'review', to: 'draft', rules: [] },
        { from: 'review', to: 'approved', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'ghost' } }] },
      ],
    });
    expect(codes(unknown)).toEqual([]);

    // Nothing loops back to draft, so validateWorkflowDef already reported
    // rdu-unenterable-state for this rule; the advisory must stay quiet.
    const unenterable = reviewDef({
      transitions: [
        { from: 'draft', to: 'review', rules: [] },
        { from: 'review', to: 'approved', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'draft' } }] },
      ],
    });
    expect(validateWorkflowDef(unenterable).map((issue) => issue.code)).toEqual(['rdu-unenterable-state']);
    expect(codes(unenterable)).toEqual([]);
  });
});

/**
 * The walk itself, pinned. Every case above decides bypassability either at the
 * initial state (which is in the seed set before the loop runs a single pass) or
 * by the `from === '*'` short-circuit — so a walk that never grows, and a walk
 * that refuses to traverse from-any edges, both survive them. This one does not
 * let them: 'Hold' is reachable only by traversing a '*' edge, and the guarded
 * move starts at 'Hold'.
 */
describe('adviseWorkflowDef — the bypass walk actually walks', () => {
  function holdDef(): WorkflowDef {
    return reviewDef({
      states: [
        { id: 'draft', name: 'Draft', category: 'open' },
        { id: 'hold', name: 'Hold', category: 'active' },
        { id: 'review', name: 'In review', category: 'active' },
        { id: 'approved', name: 'Approved', category: 'terminal' },
      ],
      transitions: [
        { from: 'draft', to: 'review', rules: [] },
        { from: '*', to: 'hold', rules: [] },
        {
          from: 'hold',
          to: 'approved',
          rules: [{ kind: 'require-different-user', thanActorOf: { to: 'review' } }],
        },
        { from: 'review', to: 'approved', rules: [] },
      ],
    });
  }

  it('warns when the bypass path is only found by walking on through a from-any edge', () => {
    const d = holdDef();
    expect(validateWorkflowDef(d)).toEqual([]);
    expect(adviseWorkflowDef(d)).toEqual([
      {
        code: 'rdu-bypassable',
        message:
          'A require-different-user rule on the transition from "Hold" to "Approved" watches the move to "In review", but this move can be reached without ever entering "In review"; on that path one person can make it alone.',
      },
    ]);
  });
});

/**
 * Owner decision, 2026-08-26 (plan open question 10): `rdu-unenterable-state` is
 * a refusal, `rdu-bypassable` is advisory-only. The engine joins EVERY message
 * validateWorkflowDef returns into one `workflow-structure` refusal, so an
 * advisory that leaked into that array would stop being a warning without anyone
 * editing a word of it. These two tiers must never overlap.
 */
describe('the refusal tier and the advisory tier stay disjoint', () => {
  const corpus: WorkflowDef[] = [
    reviewDef(),
    reviewDef({
      transitions: [
        { from: 'draft', to: 'review', rules: [] },
        { from: 'review', to: 'draft', rules: [] },
        { from: 'review', to: 'approved', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'review' } }] },
        { from: 'draft', to: 'approved', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'review' } }] },
      ],
    }),
    reviewDef({
      transitions: [
        { from: 'draft', to: 'review', rules: [] },
        { from: 'review', to: 'draft', rules: [] },
        { from: 'review', to: 'approved', rules: [] },
        { from: '*', to: 'approved', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'review' } }] },
      ],
    }),
    reviewDef({
      transitions: [
        { from: 'draft', to: 'review', rules: [] },
        { from: 'review', to: 'approved', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'draft' } }] },
      ],
    }),
    reviewDef({
      transitions: [
        { from: 'draft', to: 'review', rules: [] },
        { from: 'review', to: 'draft', rules: [] },
        { from: 'review', to: 'approved', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'ghost' } }] },
      ],
    }),
  ];

  it('no advisory code is ever an issue code, over every shape the two tiers are specified on', () => {
    for (const d of corpus) {
      const issueCodes = validateWorkflowDef(d).map((issue) => issue.code);
      const advisoryCodes = adviseWorkflowDef(d).map((advisory) => advisory.code);
      expect(issueCodes).not.toContain('rdu-bypassable');
      expect(issueCodes.filter((code) => advisoryCodes.includes(code))).toEqual([]);
    }
  });

  it('the corpus is not vacuous: it contains defs that make each tier speak', () => {
    expect(corpus.some((d) => validateWorkflowDef(d).length > 0)).toBe(true);
    expect(corpus.some((d) => adviseWorkflowDef(d).length > 0)).toBe(true);
  });
});
