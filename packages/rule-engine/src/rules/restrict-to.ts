import { membershipId, type Rule } from '@gisik-nokma/domain';
import { REFUSAL_RULES } from '../refusal-rules.js';
import type { RuleEvaluator } from './types.js';

/**
 * Criteria are OR-combined: satisfying any one is enough. The refusal names
 * everyone who would have been allowed. A rule that names nobody cannot be
 * published (empty-restrict-to), but a planted or legacy definition still
 * gets an honest refusal rather than a crash or a silent pass.
 */
export const evaluateRestrictTo: RuleEvaluator<Extract<Rule, { kind: 'restrict-to' }>> = async (
  rule,
  input,
) => {
  const { env, ctx, ticket } = input;
  const allowed: string[] = [];

  if (rule.assignee === true) {
    allowed.push("the ticket's assignee");
    if (ticket.assigneeId !== null && ticket.assigneeId === env.actorId) return { refused: false };
  }

  if (rule.roles !== undefined && rule.roles.length > 0) {
    allowed.push(`anyone with the role ${rule.roles.join(' or ')}`);
    const membership = await ctx.getEntityState('membership', membershipId(env.workspaceId, env.actorId));
    if (membership !== null && membership.kind === 'membership' && rule.roles.includes(membership.role)) {
      return { refused: false };
    }
  }

  if (rule.userIds !== undefined && rule.userIds.length > 0) {
    allowed.push(`the named people ${rule.userIds.join(', ')}`);
    if (rule.userIds.includes(env.actorId)) return { refused: false };
  }

  if (allowed.length === 0) {
    return {
      refused: true,
      rule: REFUSAL_RULES.restrictTo,
      reason: 'This move is guarded by a restrict-to rule that names nobody, so nobody may make it.',
    };
  }

  return {
    refused: true,
    rule: REFUSAL_RULES.restrictTo,
    reason: `Only ${allowed.join(', or ')} may make this move, and ${env.actorId} is not among them.`,
  };
};
