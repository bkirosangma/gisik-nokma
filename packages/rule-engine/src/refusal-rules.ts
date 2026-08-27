/**
 * The canonical refusal rule names. Refusal.rule is a plain string in the
 * frozen interface; these constants keep every producer and consumer spelling
 * them identically. The five vocabulary entries deliberately equal the Rule
 * kind that fired.
 */
export const REFUSAL_RULES = {
  malformedPayload: 'malformed-payload',
  unknownTicket: 'unknown-ticket',
  unknownWorkflow: 'unknown-workflow',
  unknownState: 'unknown-state',
  illegalTransition: 'illegal-transition',
  strandedState: 'stranded-state',
  parentTerminal: 'parent-terminal-with-open-children',
  workflowStructure: 'workflow-structure',
  workflowVersion: 'workflow-version',
  workflowStateMapping: 'workflow-state-mapping',
  restrictTo: 'restrict-to',
  requireComment: 'require-comment',
  requireEvidence: 'require-evidence',
  requireField: 'require-field',
  requireDifferentUser: 'require-different-user',
} as const;
