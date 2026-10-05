import type { FieldClaim, WorkflowDef } from '@gisik-nokma/domain';
import { fieldAlreadyClaimed } from './field-claims.js';
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
 * `find(exact) ?? find('*')` (`rule-engine/src/transition.ts:95-97`) — and a
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
 * A declared edge whose rules are all already MET, given `ticketFields` →
 * `direct`: submit it as-is. Any rule still unmet → `needs-dialog`.
 *
 * **`require-field` is checked against `ticketFields`, the same way
 * `TransitionDialog` checks it (Ruling 25).** `fieldAlreadyClaimed`
 * (`field-claims.ts`) is the ONE shared predicate both this gate and the
 * dialog read — `TransitionDialog` was refactored onto it in the same
 * change that added `ticketFields` here, so the two provably never derive
 * "is this field already satisfied" two different ways. An edge whose only
 * rule is `require-field` on a field the ticket already carries a value for
 * is `direct` — opening a dialog with nothing left to fill in would be the
 * exact fork this module exists to avoid, arriving from the other side (the
 * gate disagreeing with the dialog it opens, rather than with the engine).
 *
 * **`require-comment` and `require-evidence` are always unmet here.**
 * Neither has an "already satisfied" reading before a submission exists — a
 * transition's comment or evidence attachment is supplied AT the moment of
 * submitting, never held in advance on the ticket — so any edge carrying
 * either always answers `needs-dialog`, regardless of `ticketFields`.
 *
 * **`restrict-to` and `require-different-user` always answer `needs-dialog`
 * too — a DELIBERATE decision (Ruling 25), not an oversight.** Both are
 * SERVER-DECIDED: this client cannot evaluate a roles/membership check or an
 * "actor must differ" check, so it can never certify either satisfied.
 * Routing such an edge to `direct` would mean submitting blind, and the
 * server's refusal then needs a display path — Tasks 13/14 (arrows,
 * drag-and-drop) were never scoped to carry `serverRefusal` the way
 * `TicketSheet`/`TransitionDialog` do. `TransitionDialog` itself renders
 * only an advisory notice for these two kinds (`transition-dialog.tsx:
 * 241-248`) and they contribute nothing to ITS OWN `blocked` computation, so
 * the dialog `needs-dialog` opens here shows that notice and a Move button
 * with nothing else to fill in. Mildly redundant, never wrong — considered
 * and rejected routing these to `direct` for exactly the reason above.
 */
export function moveOutcome(
  def: WorkflowDef,
  fromStateId: string,
  toStateId: string,
  ticketFields: Record<string, FieldClaim>,
): MoveOutcome {
  const options = transitionOptions(def, fromStateId);
  const selected = options.find((option) => option.toStateId === toStateId);
  if (selected === undefined) {
    return { kind: 'refused', available: options.map((option) => option.toStateId) };
  }
  const unmet = selected.rules.filter((rule) =>
    rule.kind === 'require-field' ? !fieldAlreadyClaimed(ticketFields, rule.field) : true,
  );
  return unmet.length === 0
    ? { kind: 'direct', toStateId }
    : { kind: 'needs-dialog', toStateId };
}
