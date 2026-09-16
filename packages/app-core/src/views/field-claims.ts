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
 * ledger's `ticket.fields`, the server's authority, and additionally treats
 * an empty/whitespace string as unset. This reads the VIEW's own
 * `ticketFields: Record<string, FieldClaim>` (the shape `TicketSheet`/
 * `TransitionDialog` already carry), an advisory client-side read exactly
 * like `transitionOptions`'s own relationship to the engine: predicting the
 * server, never replacing it.
 */
export function fieldAlreadyClaimed(ticketFields: Record<string, FieldClaim>, field: string): boolean {
  return ticketFields[field]?.value != null;
}
