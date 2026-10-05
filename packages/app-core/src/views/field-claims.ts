import type { FieldClaim } from '@gisik-nokma/domain';

/**
 * Whether `field` already carries a value on the ticket, per its current
 * claims — the one predicate a `require-field` rule's "does this still need
 * asking" question hinges on.
 *
 * Shared between `TransitionDialog` (skip the input, and drop the field from
 * `missingFields`, for a field already claimed) and `moveOutcome`'s gate
 * (Task 12, Ruling 25 — an edge whose only unmet requirement turns out to
 * already be met answers `direct`, not `needs-dialog`). Extracted rather
 * than written twice: `transitionOptions` above already argues against a
 * second derivation of "what moves are legal"; a second, independently
 * maintained copy of "is this field already satisfied" would be the exact
 * same fork on the exact same predicate, and the dialog and the gate that
 * opens it must never disagree about it.
 *
 * **Mirrors the rule-engine's own `evaluateRequireField`
 * (`packages/rule-engine/src/rules/require-field.ts`) semantics — TRIMMED,
 * whitespace-only counts as unset (Ruling 26).** That engine behavior is
 * deliberate and tested: Task 9's own controller ruling,
 * `packages/rule-engine/test/engine.test.ts`, describe block "require-field
 * and require-evidence refuse a blank value, not only an absent one", case
 * "refuses require-field when the field is set to a whitespace-only string".
 * Ruling 26 exists because that fact was checked ONLY here in a docblock
 * before it, not in the code: `moveOutcome` could answer `direct` for a
 * ticket whose field value was `''`/`'   '`, the server would then refuse
 * it for real, and `direct` has no refusal-display path on Tasks 13/14
 * (arrows, drag-and-drop) — a click that fails with nothing visible. Before
 * Ruling 25 this was contained (every `require-field` edge opened
 * `TransitionDialog`, which has `serverRefusal` wired); Ruling 25 removed
 * that containment, which is what made the pre-existing blank/whitespace gap
 * urgent rather than academic.
 *
 * **Deliberately NOT done by importing the engine's own check.**
 * `packages/rule-engine/src/index.ts:34-41` withholds `refuse()`/`ACCEPT` —
 * "a consumer outside this package has no business minting a `Refusal`" —
 * and re-deriving that vocabulary here would be the same door reopened from
 * the client side. This predicate mirrors the ENGINE'S SEMANTICS (the exact
 * `isSet` expression `evaluateRequireField` computes), not its machinery,
 * and stays what it always was: this reads the VIEW's own
 * `ticketFields: Record<string, FieldClaim>` (the shape `TicketSheet`/
 * `TransitionDialog` already carry), an advisory client-side read exactly
 * like `transitionOptions`'s own relationship to the engine — predicting
 * the server, never replacing it.
 *
 * **The agreement is PINNED, not just asserted in prose**:
 * `test/views/field-claims.test.ts` runs this predicate and the real,
 * exported `evaluateTransitionRules` side by side over the same value
 * shapes (a genuine round trip against the authority, per the same
 * reasoning `rule-engine/src/index.ts`'s own docblock gives for why a
 * self-comparison doesn't catch a reword) — so a future change to either
 * side's semantics that breaks the agreement reddens that test.
 */
export function fieldAlreadyClaimed(ticketFields: Record<string, FieldClaim>, field: string): boolean {
  const value = ticketFields[field]?.value;
  return value !== undefined && value !== null && !(typeof value === 'string' && value.trim().length === 0);
}
