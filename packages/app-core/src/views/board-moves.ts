import type { WorkflowDef } from '@gisik-nokma/domain';
import { transitionOptions } from './transition-dialog.js';

/**
 * The gate every ticket move — arrow (Task 13) or drag-and-drop (Task 14) —
 * must pass through before anything is submitted. Pure, no UI: this module
 * decides WHAT to do about a proposed move, never draws the decision.
 *
 * **A state move is not "set column = X".** This product is event-sourced
 * and workflow-driven: a ticket may only move along an edge its workflow
 * DECLARES, and each edge may carry rules demanding a comment, an evidence
 * attachment, or field values. The consequence for Task 13's arrows: they
 * follow DECLARED EDGES, not column order — the next arrow offers the next
 * *declared* target, which may not be the adjacent column.
 *
 * This is why `moveOutcome` is built entirely over `transitionOptions`
 * (`transition-dialog.ts:41-61`) rather than reading `def.states`/
 * `def.transitions` directly: `transitionOptions` is already the one place
 * that predicts the engine's own resolution — exact edge before wildcard,
 * `find(exact) ?? find('*')` (`rule-engine/src/transition.ts:91-93`) — and a
 * second derivation of "what moves are legal" is exactly the kind of fork
 * this codebase's docblocks argue against (see `transitionOptions`'s own
 * ruling P27). `moveOutcome` asks that one function, once, and reads its
 * answer.
 */
export type MoveOutcome =
  | { kind: 'refused'; available: string[] }
  | { kind: 'direct'; toStateId: string }
  | { kind: 'needs-dialog'; toStateId: string };

/**
 * `toStateId` not among `transitionOptions(def, fromStateId)` (including a
 * no-op move back onto `fromStateId` itself, which `transitionOptions`
 * already excludes) → `refused`, carrying every OTHER move that state
 * really offers, so the caller can name them rather than just saying no.
 *
 * A declared edge with `rules.length === 0` → `direct`: submit it as-is.
 * Any rules at all → `needs-dialog`.
 *
 * **`rules.length === 0` is the plain reading, not the complement of
 * "demands input."** Two rule kinds — `restrict-to` and
 * `require-different-user` — are SERVER-DECIDED: `TransitionDialog` renders
 * only an advisory notice for them (`transition-dialog.tsx:241-248`) and
 * they contribute nothing to its own `blocked` computation
 * (`transition-dialog.tsx:160-164`). An edge carrying only one of those
 * still routes here to `needs-dialog` and opens a dialog that prompts for
 * zero fields. That is deliberate: this three-outcome signature has no
 * fourth case to give that combination its own name, and erring toward the
 * dialog's "the server decides" notice is safer than a `direct` submit the
 * server may then refuse with no explanation anywhere on screen.
 *
 * **A second gap, left for the caller on purpose.** `require-field` only
 * truly needs a dialog when the ticket does not already hold that field's
 * value — `TransitionDialog` itself skips the input for a field already
 * claimed (`transition-dialog.tsx:201-213`). `moveOutcome` never receives
 * `ticketFields`, so it cannot make that refinement; it answers
 * `needs-dialog` for any `require-field` rule, correct but conservative.
 * Task 13/14 callers that want the sharper answer must add that check
 * themselves, against the ticket they actually have.
 */
export function moveOutcome(def: WorkflowDef, fromStateId: string, toStateId: string): MoveOutcome {
  const options = transitionOptions(def, fromStateId);
  const selected = options.find((option) => option.toStateId === toStateId);
  if (selected === undefined) {
    return { kind: 'refused', available: options.map((option) => option.toStateId) };
  }
  return selected.rules.length === 0
    ? { kind: 'direct', toStateId }
    : { kind: 'needs-dialog', toStateId };
}
