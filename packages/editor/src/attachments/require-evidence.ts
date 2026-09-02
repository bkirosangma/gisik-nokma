import type { WorkflowDef } from '@gisik-nokma/domain';

/**
 * Does `fromStateId` → `toStateId` carry a `require-evidence` rule?
 *
 * WILDCARD SEMANTICS, MATCHED NOT INFERRED. This is a client-side mirror of
 * `packages/rule-engine/src/transition.ts`'s own resolution (the lines that
 * pick which `Transition` governs an attempted move, immediately above its
 * call into `evaluateTransitionRules`):
 *
 * ```
 * const transition =
 *   latest.transitions.find((t) => t.from === resolved.stateId && t.to === payload.to) ??
 *   latest.transitions.find((t) => t.from === '*' && t.to === payload.to);
 * ```
 *
 * Two facts follow directly from reading that code, not from guessing at the
 * schema comment ("`'*'` for from any state"):
 *
 *  1. EXACT WINS OVER WILDCARD. When both a `{ from: fromStateId, to }` and a
 *     `{ from: '*', to }` transition exist for the same target, the engine
 *     resolves to the EXACT one and never looks at the wildcard's rules at
 *     all — not even to union them in. A `{ from: '*', to: 'abandoned',
 *     rules: [] }` beside `{ from: 'doing', to: 'abandoned', rules:
 *     [{ kind: 'require-evidence' }] }` still requires evidence from
 *     'doing', because the exact edge is the one the engine picks.
 *  2. EXACTLY ONE TRANSITION APPLIES, NEVER A UNION OF SEVERAL. The engine
 *     picks ONE `Transition` and evaluates only ITS `rules` array
 *     (`evaluateTransitionRules(transition.rules, ...)`,
 *     `packages/rule-engine/src/rules/index.ts`). There is no "wildcard
 *     rules always apply in addition" behaviour anywhere in the engine —
 *     the coordination doc's F5 finding (a wildcard-edge guard bypass) is
 *     the standing reminder of what assuming otherwise costs.
 *
 * This function reproduces exactly that resolution — `exact ?? wildcard`,
 * nothing unioned — so the picker's "does this move need evidence?" answer
 * can never diverge from what the server will actually enforce. An unmatched
 * `(from, to)` pair (no transition at all — the move itself is illegal)
 * answers `false`: illegal moves are the transition-legality gate's business,
 * not this one's, and offering no evidence prompt for a move that cannot
 * happen anyway is the correct silence, not a false negative.
 */
export function transitionRequiresEvidence(def: WorkflowDef, fromStateId: string, toStateId: string): boolean {
  const exact = def.transitions.find((t) => t.from === fromStateId && t.to === toStateId);
  const transition = exact ?? def.transitions.find((t) => t.from === '*' && t.to === toStateId);
  if (transition === undefined) return false;
  return transition.rules.some((rule) => rule.kind === 'require-evidence');
}
