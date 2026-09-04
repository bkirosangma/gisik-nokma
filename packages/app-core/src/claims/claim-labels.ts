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
 * The SECOND empty month, and it is a different fact.
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
 *
 * IT CLAIMS EXHAUSTIVITY ("every claimed date"), so the model may only reach
 * for it when the legend is the ONLY thing standing between the viewer and
 * this month's claims. A month narrowed by a filter or a lane as well is the
 * third sentence's business, not this one's.
 */
export const CALENDAR_ALL_HIDDEN_COPY =
  'Every claimed date in this month belongs to a field you have hidden. Nothing was dropped — switch a field back on in the legend to see its claims again.';

/**
 * The THIRD empty month, and the review that asked for it said why: the copy
 * above was added because "no claimed dates fall in this month" lies to a
 * viewer who hid the field one switch ago — and a month emptied by a FILTER or
 * by a LANE told that same lie, at two other doors, about a month full of
 * claimed dates. Three different facts, three different sentences.
 *
 * The wording is a DISJUNCTION on purpose. Narrowings stack: a filter can
 * remove some of a month's claims while the legend hides the rest, and in that
 * case both "every claimed date is behind the filter" and "every claimed date
 * belongs to a hidden field" are false. Naming the set of narrowings the
 * viewer set, rather than picking one, is the sentence that stays true whether
 * one of them is on or all three are.
 */
export const CALENDAR_NARROWED_MONTH_COPY =
  'Dates are claimed in this month — every one of them is behind a narrowing you set: the filter, the lane, or the legend. Nothing was dropped — widen the filter or switch a field back on to see them again.';

/**
 * The side-list heading when the list holds ONLY work with a MISSING claim.
 *
 * The sentence states a LEAVING condition — "until it carries both" — so it is
 * true exactly of entries that will leave the moment the missing claim
 * arrives: `no-dates`, `start-only`, `due-only`. It is FALSE over the other
 * two: a `start-after-due` entry already carries both and is still here, and
 * so is one whose claimed day is not a day on the calendar. That is why the
 * model chooses between this heading and the one below rather than printing
 * this one unconditionally as the plan's Task 10 does.
 */
export const TIMELINE_SIDE_LIST_COPY =
  'No bar is invented: work appears here until it carries both a claimed start and a claimed needed-by.';

/**
 * The side-list heading for a list that holds ANY entry the plain heading is
 * false of — the same shape as the empty-month copy above, honest per row and
 * false in the summary unless the summary is chosen.
 *
 * It names the whole set of reasons rather than picking one, which is what
 * lets it carry a mixed list truthfully.
 */
export const TIMELINE_SIDE_LIST_UNDRAWABLE_COPY =
  'No bar is invented: work appears here whenever its claims cannot draw a period — a missing start or needed-by, a start after its needed-by, or a claimed day that is not on the calendar.';

/**
 * The FIRST empty timeline: nothing here has a date claim at all.
 *
 * The timeline had NO empty copy of any kind, while its sibling calendar —
 * same package, written for exactly this failure — had three sentences. Four
 * different emptinesses serialised to identical bytes: nothing loaded, a
 * filter that matched nobody, a lane nobody belongs to, and work that is fully
 * dated and merely elsewhere in time.
 *
 * Reached when nothing is on screen, nothing a narrowing removed would have
 * shown here, and nothing visible is scheduled outside the window — i.e. every
 * loaded ticket is an undated epic (a lane, not missing work) or there are
 * none. The second sentence is the calendar's, verbatim, because it is the
 * same promise about the same product.
 */
export const TIMELINE_EMPTY_COPY =
  'No claimed dates are here to draw. Undated work is absent, not estimated — the timeline draws only the periods someone claimed.';

/**
 * The SECOND empty timeline: a narrowing the viewer set emptied it.
 *
 * A DISJUNCTION on purpose, and the reason is the one Task 8's fix had to
 * discover: NARROWINGS STACK. A filter can remove some of the work while the
 * window leaves the rest behind, and then "the filter removed everything" and
 * "everything is outside these weeks" are each false. Naming the set the
 * viewer set stays true whether one narrowing is live or all of them are.
 */
export const TIMELINE_NARROWED_COPY =
  'Work is claimed here — every piece of it is behind a narrowing you set: the filter, the lane, or the weeks in view. Nothing was dropped — widen the filter or move the window to see it again.';

/**
 * The THIRD empty timeline, and the ONE case the component cannot reconstruct
 * from its own props: the work is fully dated, coherent, placeable, and simply
 * scheduled elsewhere in time.
 *
 * Task 11's props carry `tickets`, `filter` and `laneEpicId` but nothing about
 * the window, so a component asked to work this out would have to redo the day
 * arithmetic — a second statement of where the window is, free to disagree
 * with the model's.
 *
 * DELIBERATELY NOT EXHAUSTIVE ("dated work here sits outside", not "every
 * piece of dated work"). A filter can remove work that would ALSO have missed
 * the window, which leaves this arm reachable with a second narrowing live —
 * and an exhaustive sentence there would be the `CALENDAR_ALL_HIDDEN_COPY`
 * failure in timeline clothes. The quantifier is what would be false; the fact
 * stated is true either way.
 */
export const TIMELINE_OUT_OF_WINDOW_COPY =
  'Dated work here sits outside the weeks in view. Nothing was dropped — move the window Earlier or Later to reach it.';

/**
 * A claimed day that no calendar has, named rather than silently dropped.
 *
 * `IST_DAY_REGEX` is a SHAPE check, and the write path (`dueDateValueSchema`,
 * and Plan 3's bare-string custom date) validates nothing beyond it — so
 * `2026-02-30` is a storable claim that `dateMs` refuses to place. (`0099-01-01`
 * used to be named here as a second one; it is NOT — `dateMs` places it. See
 * the `dateMs` docblock, which carried the same error and now records the
 * measurement.) The timeline is the first surface that converts a claim to a NUMBER
 * (the calendar compares day strings and never needs to), so it is the first
 * place that refusal reaches a viewer.
 *
 * The day is printed through `formatClaimDate`, which hands an unrenderable
 * day straight back verbatim — the claim as claimed, never a plausible
 * neighbour. This is `provenance.ts`'s ruling applied one surface along: a
 * blank screen is a worse answer than naming the bad day, and letting `dateMs`
 * throw here would blank the whole timeline for everyone else's tickets too.
 *
 * DEDUPED. A ticket whose start and needed-by carry the SAME bad day is one
 * bad day claimed twice, not two: "2026-02-30 and 2026-02-30 are not days on
 * the calendar" invents a second problem and gets the verb wrong about the
 * first. The two-bad-days fixture could not see this, because it uses two
 * different days.
 *
 * Deduped on the RENDERED string rather than the raw day, so the count that
 * chooses between "is not a day" and "are not days" is the count of things
 * actually printed. For the days that reach here the two are the same set —
 * `formatClaimDate` hands an unrenderable day straight back — so this is a
 * discipline rather than an observed difference, and it is the one that stays
 * right if the renderer ever collapses two inputs.
 */
export function unplaceableDayCopy(days: readonly string[]): string {
  const distinct = [...new Set(days.map((day) => formatClaimDate(day)))];
  const named = distinct.join(' and ');
  const verb = distinct.length > 1 ? 'are not days' : 'is not a day';
  return `${named} ${verb} on the calendar — the claim is shown as recorded, and no bar is drawn`;
}
