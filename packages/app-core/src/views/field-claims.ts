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
 * Not the rule-engine's own `evaluateRequireField`
 * (`packages/rule-engine/src/rules/require-field.ts`) — that reads the
 * ledger's `ticket.fields`, the server's authority. This reads the VIEW's
 * own `ticketFields: Record<string, FieldClaim>` (the shape `TicketSheet`/
 * `TransitionDialog` already carry), an advisory client-side read exactly
 * like `transitionOptions`'s own relationship to the engine: predicting the
 * server, never replacing it — with one KNOWN, UNRESOLVED divergence from
 * what it predicts, flagged rather than silently fixed (Ruling 25's own
 * follow-up, not yet ruled on).
 *
 * **A blank/whitespace-only value disagrees with the server.**
 * `evaluateRequireField` trims and treats a whitespace-only string as unset
 * — deliberate, tested, Task 9's own controller ruling
 * (`packages/rule-engine/test/engine.test.ts`, "require-field and
 * require-evidence refuse a blank value, not only an absent one"). This
 * predicate does not trim: `value: ''` or `value: '   '` reads as claimed
 * here (`!= null` is true), so `fieldAlreadyClaimed` and the server can
 * disagree on exactly that shape of ticket. Before Ruling 25 the
 * consequence was contained — any `require-field` edge always opened
 * `TransitionDialog`, which has `serverRefusal` wired, so a blank field that
 * slipped through still surfaced the server's refusal on screen. Since
 * Ruling 25, `moveOutcome` can answer `direct` for exactly this ticket
 * shape, and `direct` has no refusal-display path on Tasks 13/14 (arrows,
 * drag-and-drop) — the submit would fail against the real server with
 * NOTHING visible to the person who clicked. Not fixed here: trimming would
 * also change `TransitionDialog`'s own rendering (a blank field would start
 * showing its input and blocking Move), which is outside what Ruling 25
 * asked for and is the coordinator's call, not a silent one.
 */
export function fieldAlreadyClaimed(ticketFields: Record<string, FieldClaim>, field: string): boolean {
  return ticketFields[field]?.value != null;
}
