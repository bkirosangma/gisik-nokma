import type { Rule, WorkflowDef } from '@gisik-nokma/domain';

export type SummaryContext = {
  stateName(stateId: string): string;
  memberName(userId: string): string;
  fieldName(fieldId: string): string;
};

export function summaryContextFor(
  def: WorkflowDef,
  options: {
    memberNames?: ReadonlyMap<string, string>;
    fields?: readonly { id: string; name: string }[];
  } = {},
): SummaryContext {
  const stateNames = new Map(def.states.map((state) => [state.id, state.name]));
  const fieldNames = new Map((options.fields ?? []).map((field) => [field.id, field.name]));
  return {
    stateName: (stateId) => stateNames.get(stateId) ?? stateId,
    memberName: (userId) => options.memberNames?.get(userId) ?? userId,
    fieldName: (fieldId) => fieldNames.get(fieldId) ?? fieldId,
  };
}

/** Plain-language rule summaries — rendered on edges and in the transition inspector. */
export function summarizeRule(rule: Rule, ctx: SummaryContext): string {
  switch (rule.kind) {
    case 'restrict-to': {
      const parts: string[] = [];
      if (rule.assignee === true) parts.push('the assignee');
      if (rule.roles !== undefined && rule.roles.length > 0) {
        parts.push(`anyone with the role ${rule.roles.join(' or ')}`);
      }
      if (rule.userIds !== undefined && rule.userIds.length > 0) {
        parts.push(rule.userIds.map((userId) => ctx.memberName(userId)).join(', '));
      }
      if (parts.length === 0) return 'Restricted to nobody. Nobody may make this move.';
      return `Only ${parts.join(', or ')} may make this move.`;
    }
    case 'require-comment':
      return 'Must carry a comment explaining it.';
    case 'require-evidence':
      return 'Must carry an attachment as evidence.';
    case 'require-field':
      return `Needs "${ctx.fieldName(rule.field)}" set first.`;
    case 'require-different-user':
      return `Needs a second person: someone other than whoever moved this to "${ctx.stateName(rule.thanActorOf.to)}".`;
  }
}

export function summarizeRules(rules: Rule[], ctx: SummaryContext): string[] {
  return rules.map((rule) => summarizeRule(rule, ctx));
}

/** The one-line count a transition row carries while collapsed: what it asks of the mover, in number. */
export function ruleCountLabel(count: number): string {
  if (count === 0) return 'No conditions';
  return count === 1 ? '1 condition' : `${count} conditions`;
}
