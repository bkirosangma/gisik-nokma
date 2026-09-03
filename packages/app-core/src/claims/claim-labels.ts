import { IST_DAY_REGEX } from '@gisik-nokma/domain';
import { formatDate } from '../provenance.js';
import type { CustomDateClaimView } from './ticket-dates.js';

/**
 * The claimed day, short: '30 Aug'.
 *
 * The month name is NOT a table in this file. It comes from `formatDate`,
 * which is this package's one route into the domain's single instant renderer
 * (`formatIstInstant`) — the module that exists precisely so "the server, the
 * web client, the desktop client and the offline mobile replica cannot print
 * the same recorded moment three different ways". A second `MONTH_SHORT` array
 * here would be a third spelling of the months, free to drift from the two
 * that already agree.
 *
 * It also inherits that renderer's honesty arm, which a local table does not
 * have: a string that is not a real calendar day comes back VERBATIM rather
 * than as a plausible label. `2026-02-30` matches the day regex and is not a
 * day; `Number('13') - 1` indexes past a twelve-element table and prints
 * "undefined". Rendering either as a month name would be this plan's own
 * invented date, in the one function every label goes through.
 */
export function formatClaimDate(isoDay: string): string {
  if (!IST_DAY_REGEX.test(isoDay)) return isoDay;
  // '30 Aug 2026' for a real day; the input verbatim for one the renderer refuses.
  const [day, month, ...rest] = formatDate(isoDay).split(' ');
  if (day === undefined || month === undefined || rest.length !== 1) return isoDay;
  return `${day} ${month}`;
}

export type AttributedDate = { date: string; actorId: string; note?: string };
export type UserNameFn = (userId: string) => string;

/** Spec §7's exact shape: "needed by 30 Aug — Kiro's claim". */
export function dueClaimLabel(claim: AttributedDate, userName: UserNameFn): string {
  return `needed by ${formatClaimDate(claim.date)} — ${userName(claim.actorId)}'s claim`;
}

export function startClaimLabel(claim: AttributedDate, userName: UserNameFn): string {
  return `starts ${formatClaimDate(claim.date)} — ${userName(claim.actorId)}'s claim`;
}

/**
 * A custom date claim, labelled with the FIELD'S OWN NAME (owner sign-off
 * 2026-08-20). "Filed on: 30 Aug — Kiro's claim". The name is user-authored
 * and arbitrary, so it is placed verbatim ahead of a colon rather than
 * inflected into a sentence: we cannot know whether "Inspection date" wants
 * "on", "by" or nothing, and guessing grammar around someone's own words is
 * the same failure as guessing their dates. The colon carries the relation;
 * the name carries the meaning.
 */
export function customClaimLabel(claim: CustomDateClaimView, userName: UserNameFn): string {
  return `${claim.fieldName}: ${formatClaimDate(claim.date)} — ${userName(claim.actorId)}'s claim`;
}

/** The note travels quoted, never paraphrased. */
export function claimTooltip(label: string, claim: AttributedDate): string {
  return claim.note === undefined ? label : `${label} · "${claim.note}"`;
}

export function barProvenance(start: AttributedDate, due: AttributedDate, userName: UserNameFn): string {
  return `${startClaimLabel(start, userName)} · ${dueClaimLabel(due, userName)}`;
}

export function contradictionCopy(start: AttributedDate, due: AttributedDate): string {
  return `start ${formatClaimDate(start.date)} is after needed-by ${formatClaimDate(due.date)} — both claims shown, no bar drawn`;
}

/** The reference calendar's honesty note, generalised (its design doc: "an undated item is absent, not estimated"). */
export const CALENDAR_EMPTY_MONTH_COPY =
  'No claimed dates fall in this month. Undated work is absent, not estimated — the calendar draws only what someone claimed.';

/**
 * The OTHER empty month, and it is a different fact.
 *
 * NOT IN THE PLAN TEXT, and added because the plan's model would have told
 * this lie: with every claimed date belonging to a legend-hidden field, the
 * grid is empty and the copy above says "no claimed dates fall in this month"
 * — to a viewer whose own claims are sitting one switch away. "Nobody claimed
 * anything" and "you switched these off" are indistinguishable on screen under
 * one sentence, which is the exact failure this plan is named for. The legend
 * tally is already computed before hiding so the switch survives; this is the
 * same guarantee said in words for the case where the switch is all that is
 * left on screen.
 */
export const CALENDAR_ALL_HIDDEN_COPY =
  'Every claimed date in this month belongs to a field you have hidden. Nothing was dropped — switch a field back on in the legend to see its claims again.';

export const TIMELINE_SIDE_LIST_COPY =
  'No bar is invented: work appears here until it carries both a claimed start and a claimed needed-by.';
