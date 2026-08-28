import { describe, expect, it } from 'vitest';
import type { Rule, WorkflowDef } from '../src/workflow.js';
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
    // Both edges into "Approved" carry require-different-user, so each covers
    // the other and rule-bypassable stays quiet — only the watched-state
    // geometry is wrong here, and only that code says so.
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
    // Two different things are wrong with this def and it now says both: the
    // watch is vacuous from the start (rdu-bypassable), AND the unguarded
    // "In review" → "Approved" edge voids the guard outright (rule-bypassable).
    expect(adviseWorkflowDef(d)).toEqual([
      {
        code: 'rdu-bypassable',
        message:
          'A require-different-user rule on the transition from any state to "Approved" watches the move to "In review", but this move can be reached without ever entering "In review"; on that path one person can make it alone.',
      },
      {
        code: 'rule-bypassable',
        message:
          'A require-different-user rule on the transition from any state to "Approved" guards this move, but "Approved" can also be entered from "In review" with no require-different-user rule; on that path the guard does not apply.',
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
    expect(codes(d)).toEqual(['rdu-bypassable', 'rule-bypassable']);
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
      {
        code: 'rule-bypassable',
        message:
          'A require-different-user rule on the transition from "Hold" to "Approved" guards this move, but "Approved" can also be entered from "In review" with no require-different-user rule; on that path the guard does not apply.',
      },
    ]);
  });
});

/**
 * `rule-bypassable` — the generalisation the owner ruled on 2026-08-28
 * (coordination doc §8, option 1): the reasoning that earned four-eyes a
 * warning applies verbatim to the other four kinds, and the from-any edge is
 * the archetype rather than a special case.
 *
 * The shape below is the `wf_rules` "Guarded" definition the rule-vocabulary
 * fixtures are written against: an exact guarded edge into "Done" beside an
 * unguarded `any state` → "Done". It publishes clean and, until this code,
 * warned about nothing.
 */
describe('adviseWorkflowDef — a lower-guard edge voids a guard (4.44, 4.45)', () => {
  function guardedDef(exactRules: Rule[], wildcardRules: Rule[] = []): WorkflowDef {
    return {
      id: 'wf_rules',
      version: 1,
      name: 'Guarded',
      initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'doing', name: 'Doing', category: 'active' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [
        { from: 'todo', to: 'doing', rules: [] },
        { from: 'doing', to: 'done', rules: exactRules },
        { from: '*', to: 'done', rules: wildcardRules },
      ],
    };
  }

  /** 4.44 — every kind in the closed vocabulary, character for character. */
  const everyKind: Array<[string, Rule]> = [
    ['restrict-to', { kind: 'restrict-to', userIds: ['user_b'] }],
    ['require-comment', { kind: 'require-comment' }],
    ['require-evidence', { kind: 'require-evidence' }],
    ['require-field', { kind: 'require-field', field: 'impact' }],
    ['require-different-user', { kind: 'require-different-user', thanActorOf: { to: 'doing' } }],
  ];

  for (const [kind, rule] of everyKind) {
    it(`4.44 warns that an unguarded from-any edge voids a ${kind} guard`, () => {
      const d = guardedDef([rule]);
      // The def publishes: this tier never contributes to the refusal array.
      expect(validateWorkflowDef(d)).toEqual([]);
      expect(adviseWorkflowDef(d)).toEqual([
        {
          code: 'rule-bypassable',
          message: `A ${kind} rule on the transition from "Doing" to "Done" guards this move, but "Done" can also be entered from any state with no ${kind} rule; on that path the guard does not apply.`,
        },
      ]);
    });
  }

  it('4.44 a plain fast-track edge voids a guard exactly as a wildcard does — nothing here is special about "*"', () => {
    const d: WorkflowDef = {
      ...guardedDef([{ kind: 'require-comment' }]),
      transitions: [
        { from: 'todo', to: 'doing', rules: [] },
        { from: 'doing', to: 'done', rules: [{ kind: 'require-comment' }] },
        { from: 'todo', to: 'done', rules: [] },
      ],
    };
    expect(validateWorkflowDef(d)).toEqual([]);
    expect(adviseWorkflowDef(d)).toEqual([
      {
        code: 'rule-bypassable',
        message:
          'A require-comment rule on the transition from "Doing" to "Done" guards this move, but "Done" can also be entered from "To do" with no require-comment rule; on that path the guard does not apply.',
      },
    ]);
  });

  /**
   * 4.45 — the silencing codicil, both directions. "we should be able to have
   * the anywhere arrow carry its own guard" (owner, 2026-08-28): a from-any
   * edge carrying a rule of the same kind COVERS the exact edge's guard, and
   * the advisory falls silent. Cover is same-kind-present, so the parameters
   * deliberately disagree here — an assignee-only restriction beside a
   * named-people one — and it still covers.
   */
  it('4.45 an uncovered from-any edge warns; a covering one does not', () => {
    const uncovered = guardedDef([{ kind: 'restrict-to', userIds: ['user_b'] }]);
    expect(codes(uncovered)).toEqual(['rule-bypassable']);

    const covered = guardedDef([{ kind: 'restrict-to', userIds: ['user_b'] }], [{ kind: 'restrict-to', assignee: true }]);
    expect(validateWorkflowDef(covered)).toEqual([]);
    expect(adviseWorkflowDef(covered)).toEqual([]);
  });

  it('4.45 cover is per kind, and it cuts both ways: two edges guarded by different kinds each void the other', () => {
    const d = guardedDef([{ kind: 'restrict-to', userIds: ['user_b'] }], [{ kind: 'require-comment' }]);
    expect(validateWorkflowDef(d)).toEqual([]);
    expect(adviseWorkflowDef(d)).toEqual([
      {
        code: 'rule-bypassable',
        message:
          'A restrict-to rule on the transition from "Doing" to "Done" guards this move, but "Done" can also be entered from any state with no restrict-to rule; on that path the guard does not apply.',
      },
      {
        code: 'rule-bypassable',
        message:
          'A require-comment rule on the transition from any state to "Done" guards this move, but "Done" can also be entered from "Doing" with no require-comment rule; on that path the guard does not apply.',
      },
    ]);
  });

  it('4.47 two rules of one kind on an edge are one guard to sidestep, so one advisory', () => {
    const d = guardedDef([
      { kind: 'restrict-to', userIds: ['user_b'] },
      { kind: 'restrict-to', roles: ['admin'] },
    ]);
    expect(validateWorkflowDef(d)).toEqual([]);
    expect(codes(d)).toEqual(['rule-bypassable']);
  });

  it('4.47 a self-loop is not a way in, so it cannot be the path that voids a guard', () => {
    const d: WorkflowDef = {
      id: 'wf_loop',
      version: 1,
      name: 'Loop',
      initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [
        { from: 'todo', to: 'done', rules: [{ kind: 'require-evidence' }] },
        { from: 'done', to: 'done', rules: [] },
      ],
    };
    expect(validateWorkflowDef(d)).toEqual([]);
    expect(adviseWorkflowDef(d)).toEqual([]);
  });

  it('4.47 a transition whose target is not a declared state is skipped rather than described', () => {
    // The coordination doc's rider: `to: '*'` publishes clean and is inert —
    // the engine refuses unknown-state before any edge is selected. Two such
    // edges would otherwise produce "any state can also be entered from …",
    // a sentence about a move nobody can make.
    const d: WorkflowDef = {
      id: 'wf_dangling',
      version: 1,
      name: 'Dangling',
      initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'doing', name: 'Doing', category: 'active' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [
        { from: 'todo', to: 'doing', rules: [] },
        { from: 'doing', to: 'done', rules: [] },
        { from: 'todo', to: '*', rules: [{ kind: 'require-comment' }] },
        { from: 'doing', to: '*', rules: [] },
      ],
    };
    expect(validateWorkflowDef(d)).toEqual([]);
    expect(adviseWorkflowDef(d)).toEqual([]);
  });

  /**
   * 4.48 — no cross-tier suppression, and the reason it differs from the two
   * rdu suppressions. Those exist because one broken watch target would
   * otherwise be described twice; here the error and the warning describe
   * different objects — the guard's membership list, and the graph around it.
   * Suppressing would also mean re-implementing validateWorkflowDef's parameter
   * checks in this file, and two copies of one check are two rounding errors.
   */
  it('4.48 an error about a guard does not silence the warning about the path around it', () => {
    const d = guardedDef([{ kind: 'restrict-to' }]);
    expect(validateWorkflowDef(d).map((issue) => issue.code)).toEqual(['empty-restrict-to']);
    expect(adviseWorkflowDef(d)).toEqual([
      {
        code: 'rule-bypassable',
        message:
          'A restrict-to rule on the transition from "Doing" to "Done" guards this move, but "Done" can also be entered from any state with no restrict-to rule; on that path the guard does not apply.',
      },
    ]);
  });
});

/**
 * 4.46 — the two codes are orthogonal, which is why `rdu-bypassable` was kept
 * rather than subsumed. Each fires where the other is silent, and both fire
 * together on a def whose four-eyes rule is wrong in both ways at once.
 */
describe('rdu-bypassable and rule-bypassable answer different questions (4.46)', () => {
  it('4.46 rdu-bypassable fires alone where there is no second edge into the target at all', () => {
    const d = reviewDef({
      transitions: [
        { from: 'draft', to: 'review', rules: [] },
        { from: 'review', to: 'draft', rules: [] },
        { from: 'review', to: 'approved', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'review' } }] },
        { from: 'draft', to: 'approved', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'review' } }] },
      ],
    });
    expect(codes(d)).toEqual(['rdu-bypassable']);
  });

  it('4.46 rule-bypassable fires alone where the watched state cannot be avoided', () => {
    const d = reviewDef({
      transitions: [
        { from: 'draft', to: 'review', rules: [] },
        { from: 'review', to: 'approved', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'review' } }] },
        { from: 'draft', to: 'approved', rules: [] },
      ],
    });
    // "Approved" is reachable from "Draft" without entering "In review", but
    // the guarded edge starts AT "In review", so the watch is not vacuous —
    // only the unguarded shortcut is a problem, and only one code says so.
    expect(codes(d)).toEqual(['rule-bypassable']);
  });

  it('4.46 both fire on one rule when the geometry is wrong in both ways', () => {
    const d = reviewDef({
      transitions: [
        { from: 'draft', to: 'review', rules: [{ kind: 'require-different-user', thanActorOf: { to: 'review' } }] },
        { from: 'review', to: 'approved', rules: [] },
        { from: 'approved', to: 'review', rules: [] },
      ],
    });
    expect(codes(d)).toEqual(['rdu-bypassable', 'rule-bypassable']);
  });
});

/**
 * Owner decision, 2026-08-26 (plan open question 10): `rdu-unenterable-state` is
 * a refusal, `rdu-bypassable` is advisory-only. The engine joins EVERY message
 * validateWorkflowDef returns into one `workflow-structure` refusal, so an
 * advisory that leaked into that array would stop being a warning without anyone
 * editing a word of it. These two tiers must never overlap. Extended
 * 2026-08-28 with `rule-bypassable`: a generalised advisory is exactly the kind
 * of code a later hand would be tempted to "promote" into the refusal array.
 */
describe('the refusal tier and the advisory tier stay disjoint', () => {
  const guardedRulesDef = (
    wildcardRules: Rule[],
    exactRules: Rule[] = [{ kind: 'restrict-to', userIds: ['user_b'] }],
  ): WorkflowDef => ({
    id: 'wf_rules',
    version: 1,
    name: 'Guarded',
    initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'doing', name: 'Doing', category: 'active' },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: [
      { from: 'todo', to: 'doing', rules: [] },
      { from: 'doing', to: 'done', rules: exactRules },
      { from: '*', to: 'done', rules: wildcardRules },
    ],
  });

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
    guardedRulesDef([]),
    guardedRulesDef([{ kind: 'restrict-to', assignee: true }]),
    guardedRulesDef([{ kind: 'require-comment' }]),
    // A restrict-to naming nobody is an ERROR (empty-restrict-to), and the
    // advisory tier speaks about this def anyway. Deliberate: unlike the two
    // rdu suppressions above — where one broken watch would otherwise yield
    // two sentences about the same parameter — these two describe different
    // objects. One says the guard names nobody; the other says the guard can
    // be walked around. Fixing either leaves the other true.
    guardedRulesDef([], [{ kind: 'restrict-to' }]),
  ];

  it('no advisory code is ever an issue code, over every shape the two tiers are specified on', () => {
    for (const d of corpus) {
      const issueCodes = validateWorkflowDef(d).map((issue) => issue.code);
      const advisoryCodes = adviseWorkflowDef(d).map((advisory) => advisory.code);
      expect(issueCodes).not.toContain('rdu-bypassable');
      expect(issueCodes).not.toContain('rule-bypassable');
      expect(issueCodes.filter((code) => advisoryCodes.includes(code))).toEqual([]);
    }
  });

  it('the corpus is not vacuous: it contains defs that make each tier speak', () => {
    expect(corpus.some((d) => validateWorkflowDef(d).length > 0)).toBe(true);
    expect(corpus.some((d) => codes(d).includes('rdu-bypassable'))).toBe(true);
    expect(corpus.some((d) => codes(d).includes('rule-bypassable'))).toBe(true);
  });
});
