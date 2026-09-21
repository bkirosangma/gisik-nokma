import type { ZodError } from 'zod';

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
  /**
   * The same invariant from the child's side (E3-19, 2026-09-21): a child
   * LEAVING a terminal state for a non-terminal one while its parent is
   * terminal. Its own id rather than `hierarchy.parent-terminal`, which the
   * client reads as "offer the reopen" on child-PLACING claims only
   * (`packages/app-core/src/flows/guarded-child-event.ts`).
   */
  childOpenUnderTerminalParent: 'child-open-under-terminal-parent',
  workflowStructure: 'workflow-structure',
  workflowVersion: 'workflow-version',
  workflowStateMapping: 'workflow-state-mapping',
  restrictTo: 'restrict-to',
  requireComment: 'require-comment',
  requireEvidence: 'require-evidence',
  requireField: 'require-field',
  requireDifferentUser: 'require-different-user',
  closeRequiresTerminal: 'close-requires-terminal',
  alreadyClosed: 'already-closed',
  notClosed: 'not-closed',
  closedTicket: 'closed-ticket',
  alreadyDeleted: 'already-deleted',
  notDeleted: 'not-deleted',
  rankRequiresBacklog: 'rank-requires-backlog',
  lastOwner: 'last-owner',
  grantOwnerRequiresOwner: 'grant-owner-requires-owner',
  removeOwnerRequiresOwner: 'remove-owner-requires-owner',
} as const;

/**
 * The subject of a malformed-payload refusal.
 *
 * Every check that parses a payload built its detail as
 * `issues.map((issue) => issue.message).join('; ')`, which DROPS the zod path —
 * and a zod message is a sentence fragment with no subject. So
 * `ticketCreatedPayload`, which has two ULID fields, refused a bad `parentId`
 * with "must be a ULID" and left the actor to guess which one; a rebound whose
 * `toStateId` was empty refused with "String must contain at least 1
 * character(s)", where `toWorkflowId` is the field a reader guesses first. The
 * task's own presence refine made it unmissable rather than new: "is required —
 * a field claim with no value would record a clearing nobody made" is a whole
 * sentence about nothing.
 *
 * `parse-event.ts:90-94` already renders the same issue correctly, as
 * `at ${issue.path.join('.')}`, and that is the construction mirrored here so
 * the door and the engine say the path the same way. Two differences are
 * deliberate: every issue is rendered, not only the first (the checks always
 * joined them, and narrowing that would be a behaviour change nobody asked
 * for), and the clause is omitted entirely when `path` is empty — a payload
 * that is `null` or a string produces `path: []`, and "at : Expected object"
 * would be worse than the fragment it replaced.
 *
 * The path goes INSIDE the detail, after the callers' `malformed: `, so every
 * byte up to and including that colon is unchanged — two shipped fixtures pin
 * exactly that prefix with `reasonStartsWith`.
 *
 * It lives here rather than beside any one check because all seven call sites
 * already import this module for `REFUSAL_RULES.malformedPayload`: one
 * construction, no new import edge, and the next check that parses a payload
 * reaches for the helper instead of copying the fragment.
 */
export function malformedPayloadDetail(error: ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length > 0 ? `at ${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join('; ');
}
