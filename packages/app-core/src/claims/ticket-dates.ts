import { IST_DAY_REGEX, type TicketState } from '@gisik-nokma/domain';
import type { TicketPin } from '../view-types.js';

/** A date claim as a view renders it: the FieldClaim flattened, plus the in-transit flag. */
export type DateClaimView = {
  date: string;
  note?: string;
  actorId: string;
  clientTime: string;
  serverTime: string;
  pending: boolean;
};

/** A custom `date`-kind field, reduced to what a view needs: which, and called what. */
export type CustomDateField = { id: string; name: string };

/** A claimed custom date. No `note`: Plan 3's kind check accepts a bare 'YYYY-MM-DD' string. */
export type CustomDateClaimView = {
  fieldId: string;
  fieldName: string;
  date: string;
  actorId: string;
  clientTime: string;
  serverTime: string;
  pending: boolean;
};

/**
 * What the views take from the DataSource: head state, which fields'
 * latest claims are still in transit (outbox-applied, not yet accepted),
 * and the ticket type's custom `date`-kind fields as {id, name} — plus the
 * optional facts a shell may carry beside them: the key, the Not-taken mark
 * and the paper pin's counts (each absent when the shell does not know it).
 * The mounting shell maps the DataSource's read result into this shape — one
 * site to adjust, and the one place that resolves a `TicketTypeDef` into
 * `customDateFields`. Optional: a shell that has not wired the type roster yet
 * renders the two built-ins only — narrower than the truth, never wrong about
 * it. app-core never fetches type definitions itself; a view-model that
 * reached for data would stop being pure.
 */
export type TicketDatesInput = {
  state: TicketState;
  pendingFieldIds: readonly string[];
  customDateFields?: readonly CustomDateField[];
  /**
   * The ticket's key (`CCSO-4`), or `null`/absent when the ledger holds no prefix (an offline ticket). The calendar
   * names a marker by it (UX fixes T8, 23.140): a marker that said only "needed by 28 Sep" never said WHICH ticket.
   */
  key?: string | null;
  /**
   * wtg2 T17: closed "Not taken" by the flow, as the server already answered it through `notTakenOf` (`ListRow.notTaken`);
   * ABSENT otherwise. A web shell's `state` carries no `closed` (a `ListRow`'s has no cause), so `resolutionOf(state)` cannot
   * see the close there: the shell carries this flag instead, and the Timeline's mark reads it beside `resolutionOf`. Optional
   * so no legacy literal changes.
   */
  notTaken?: true;
  /** The paper pin's counts (TG-11, TV-10): the Timeline draws a pin on the bar when either count is above zero. Absent = unknown. */
  pin?: TicketPin;
};

/**
 * The day shape has ONE origin: IST_DAY_REGEX in @gisik-nokma/domain's
 * ist-day.ts. An earlier draft re-declared it here as a local literal, because
 * app-core does not depend on zod and the built-in's schema does. That reason
 * is gone: ist-day.ts is dependency-free — no zod, no date library, no
 * timezone database — so importing it costs nothing and removes the last place
 * two statements of "what a day claim is" could drift apart.
 */

/** The claim, or null. There is NO other source of dates — absence is absence. */
export function dateClaimOf(
  input: TicketDatesInput,
  fieldId: 'startDate' | 'dueDate',
): DateClaimView | null {
  const claim = input.state.fields[fieldId];
  if (claim === undefined || claim.value === null || claim.value === undefined) return null;
  const value: unknown = claim.value;
  if (typeof value !== 'object' || Array.isArray(value)) return null;
  const { date, note } = value as { date?: unknown; note?: unknown };
  if (typeof date !== 'string' || !IST_DAY_REGEX.test(date)) return null;
  return {
    date,
    ...(typeof note === 'string' ? { note } : {}),
    actorId: claim.actorId,
    clientTime: claim.clientTime,
    serverTime: claim.serverTime,
    pending: input.pendingFieldIds.includes(fieldId),
  };
}

/**
 * Every CLAIMED custom date field, in the type's declared field order.
 * Unclaimed is absent — there is no branch that emits an entry for a field
 * nobody filled in, and none that guesses a value from a neighbouring one.
 * A malformed stored value is skipped rather than coerced: rendering a
 * half-parsed day would be inventing one.
 *
 * The `typeof claim.value === 'string'` test is also what makes a built-in id
 * unable to render twice. A `dueDate` claim is a `{date, note?}` OBJECT and a
 * custom date claim is a bare string, so the two readers accept disjoint
 * shapes: even a shell that passed `{id: 'dueDate', name: 'Due'}` in
 * `customDateFields` — which `ticketTypeDefSchema` already refuses upstream,
 * "field id shadows a built-in field" — cannot get one claim onto the grid
 * twice. Proven by test rather than asserted here.
 */
export function customDateClaimsOf(input: TicketDatesInput): CustomDateClaimView[] {
  const claims: CustomDateClaimView[] = [];
  for (const field of input.customDateFields ?? []) {
    const claim = input.state.fields[field.id];
    if (claim === undefined || claim.value === null || claim.value === undefined) continue;
    if (typeof claim.value !== 'string' || !IST_DAY_REGEX.test(claim.value)) continue;
    claims.push({
      fieldId: field.id,
      fieldName: field.name,
      date: claim.value,
      actorId: claim.actorId,
      clientTime: claim.clientTime,
      serverTime: claim.serverTime,
      pending: input.pendingFieldIds.includes(field.id),
    });
  }
  return claims;
}

export function titleOf(state: TicketState): string {
  const value = state.fields['title']?.value;
  return typeof value === 'string' ? value : '';
}
