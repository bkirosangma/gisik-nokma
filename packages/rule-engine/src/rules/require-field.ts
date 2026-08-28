import type { Rule } from '@gisik-nokma/domain';
import { REFUSAL_RULES } from '../refusal-rules.js';
import type { RuleEvaluator } from './types.js';

export const evaluateRequireField: RuleEvaluator<Extract<Rule, { kind: 'require-field' }>> = async (
  rule,
  input,
) => {
  const value = input.ticket.fields[rule.field]?.value;
  const isSet =
    value !== undefined && value !== null && !(typeof value === 'string' && value.trim().length === 0);
  if (isSet) return { refused: false };
  return {
    refused: true,
    rule: REFUSAL_RULES.requireField,
    reason: `This move needs the field "${rule.field}" to be set first, and it is not.`,
  };
};
