import type { Rule } from '@gisik-nokma/domain';
import { evaluateRequireComment } from './require-comment.js';
import { evaluateRequireEvidence } from './require-evidence.js';
import { evaluateRequireField } from './require-field.js';
import { evaluateRestrictTo } from './restrict-to.js';
import type { Accept, Refusal } from '../engine.js';
import type { TransitionRuleInput } from './types.js';

/**
 * Run a transition's rules in definition order; the first refusal wins.
 * The switch is exhaustive over the closed vocabulary — a sixth kind without
 * an evaluator is a compile error, not a silently unenforced rule.
 */
export async function evaluateTransitionRules(
  rules: Rule[],
  input: TransitionRuleInput,
): Promise<Accept | Refusal> {
  for (const rule of rules) {
    const result = await evaluateOneRule(rule, input);
    if (result.refused) return result;
  }
  return { refused: false };
}

async function evaluateOneRule(rule: Rule, input: TransitionRuleInput): Promise<Accept | Refusal> {
  // No `default:` arm — adding one would make every branch return, which
  // retires the compile-time exhaustiveness check this switch exists for
  // (a sixth Rule kind would then fall through to `default` instead of
  // failing to compile).
  switch (rule.kind) {
    case 'require-comment':
      return evaluateRequireComment(rule, input);
    case 'restrict-to':
      return evaluateRestrictTo(rule, input);
    case 'require-evidence':
      return evaluateRequireEvidence(rule, input);
    case 'require-field':
      return evaluateRequireField(rule, input);
    case 'require-different-user':
      throw new Error('rule kind "require-different-user" is not implemented yet');
  }
}
