import type { Rule } from '@gisik-nokma/domain';
import { REFUSAL_RULES } from '../refusal-rules.js';
import type { RuleEvaluator } from './types.js';

export const evaluateRequireComment: RuleEvaluator<Extract<Rule, { kind: 'require-comment' }>> = async (
  _rule,
  input,
) => {
  const text = input.payload.comment?.text ?? '';
  if (text.trim().length > 0) return { refused: false };
  return {
    refused: true,
    rule: REFUSAL_RULES.requireComment,
    reason: 'This move must carry a comment explaining it, and none was provided.',
  };
};
