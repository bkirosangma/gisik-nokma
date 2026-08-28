import type { Rule } from '@gisik-nokma/domain';
import { REFUSAL_RULES } from '../refusal-rules.js';
import type { RuleEvaluator } from './types.js';

export const evaluateRequireEvidence: RuleEvaluator<Extract<Rule, { kind: 'require-evidence' }>> = async (
  _rule,
  input,
) => {
  const attachmentId = input.payload.evidenceAttachmentId ?? '';
  if (attachmentId.trim().length > 0) return { refused: false };
  return {
    refused: true,
    rule: REFUSAL_RULES.requireEvidence,
    reason: 'This move must carry an attachment as evidence, and none was provided.',
  };
};
