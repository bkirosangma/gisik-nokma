import type { Rule } from '@gisik-nokma/domain';
import { evaluateRequireComment } from './require-comment.js';
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
      throw new Error('rule kind "restrict-to" is not implemented yet');
    case 'require-evidence':
      throw new Error('rule kind "require-evidence" is not implemented yet');
    case 'require-field':
      throw new Error('rule kind "require-field" is not implemented yet');
    case 'require-different-user':
      throw new Error('rule kind "require-different-user" is not implemented yet');
  }
}
