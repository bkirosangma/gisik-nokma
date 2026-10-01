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

/**
 * The reference calendar's honesty note, generalised (its design doc: "an
 * undated item is absent, not estimated") — AND THE NARROWING NAMED IN IT.
 *
 * ## Why this sentence carries the narrowing instead of naming one cause
 *
 * It is the FALLBACK arm (`calendar-model.ts`'s last selector), so it is the
 * sentence a month gets whenever nothing else claimed it: genuinely no claims,
 * or claims kept off the grid by something the model cannot see. The model
 * cannot see it because the narrowing happens UPSTREAM — `apps/web`'s
 * `datesNarrowing` (`page.tsx:706-713`) feeds `dateInputs` (`:1135-1146`)
 * already filtered, so `visible === inputs` holds in every app, `excluded` is
 * `[]`, and the model is structurally unable to tell "filtered away" from
 * "never claimed".
 *
 * **Why "wire the filter down to the model" is not the repair, corrected
 * 2026-09-20 by a reviewer who falsified the first draft of this note.** The
 * first draft said the page's closed-hidden rule "cannot be expressed as a
 * `FilterSpec`". That is FALSE: `closed?: boolean` is one of `FilterSpec`'s own
 * axes (`view-types.ts:238-243`) and `matchesFilter` evaluates it
 * (`filter/matches-filter.ts:89`) — the page already expresses that rule as a
 * spec, `{ ...listFilterSpec, closed: effectiveClosed }`. The reason wiring
 * fails is different and survives: **the view is handed ALREADY-NARROWED rows**,
 * so passing the filter alongside them simply re-filters a filtered set and
 * excludes nothing. Passing the UNFILTERED rows instead would make the model
 * re-implement the page's row selection (`matchesListRow` over `ListRow`s,
 * project scope included) — a second statement of one rule, free to drift from
 * the first. That is this file's recurring objection, and it is the real one.
 *
 * It cannot be told either, and that was measured rather than assumed: a
 * page-LEVEL flag ("a filter is on") cannot answer the only question that
 * matters — whether THIS month was emptied by it — so such a flag would license
 * a sentence that is false whenever the filter is simply irrelevant to the
 * month.
 *
 * So the sentence does what this file's other narrow-copy does: it names the
 * SET. Naming the filter, closed jobs and the legend as the things that can
 * hold a claim off the grid is true whether one of them is set or none is —
 * which is what makes it safe to reach WITHOUT knowing which one fired. The
 * same reasoning is why `CALENDAR_ALL_HIDDEN_COPY` is gated on the legend
 * rather than left to claim exhaustivity freely, **though that gate has a blind
 * spot this file records in full below: it cannot see the page's upstream
 * pruning, so the exhaustive sentence is reachable while false today.**
 *
 * ## Provenance
 *
 * It carried the third sentence's job until 2026-09-20, when the owner ruled
 * *"the message should name the filter"* against a dispatch that had measured
 * this arm reaching a viewer who had just filtered — the sentence said "no
 * claimed dates fall in this month" about a month full of them. The dead
 * per-cause sentence is deleted in that same change (owner ruling: *"delete the
 * copy"*), so this arm is now the one that has to be honest about all of them.
 */
export const CALENDAR_EMPTY_MONTH_COPY =
  'No claimed dates are drawn in this month. Undated work is absent, not estimated — the calendar draws only what someone claimed. If a claim is here and not drawn, a narrowing kept it off this grid without dropping it: your filter, closed jobs being hidden, a field you switched off in the legend, or an epic, which is drawn in the List and not here.';

/**
 * The SECOND empty month, and it is a different fact.
 *
 * NOT IN THE PLAN TEXT, and added because the plan's model would have told
 * this lie: with every claimed date belonging to a legend-hidden field, the
 * grid is empty and the fallback above tells the viewer nothing was claimed —
 * while their own claims sit one switch away. "Nobody claimed anything" and
 * "you switched these off" are indistinguishable on screen under one sentence,
 * which is the exact failure this plan is named for. The legend tally is
 * already computed before hiding so the switch survives; this is the same
 * guarantee said in words for the case where the switch is all that is left on
 * screen.
 *
 * IT CLAIMS EXHAUSTIVITY ("every claimed date"), so the model may only reach
 * for it when the legend is the ONLY thing standing between the viewer and
 * this month's claims. A month narrowed by a filter the MODEL saw does NOT get
 * this sentence: it reaches `CALENDAR_EMPTY_MONTH_COPY` above, which names the
 * set of narrowings rather than picking one. **That gate is `narrowedOutOfGrid`
 * in the model, and it outlived the sentence that used to carry the both-case**
 * — see `calendar-model.ts`'s precedence note, and case 11.50, which witnesses
 * the gate against a mutation that would have removed it.
 *
 * ⚠ **THE GATE'S BLIND SPOT IS LIVE, NOT THEORETICAL — this sentence is
 * reachable while FALSE today, and the first draft of this note understated it
 * as a future risk.** `narrowedOutOfGrid` can only see what the MODEL narrowed.
 * Rows pruned UPSTREAM by the page (its filter, and the closed-hidden-by-default
 * rule) never arrive, so they cannot trip the gate — while `hiddenInGrid` is
 * measured over what did arrive. Hide a legend field holding an in-grid claim,
 * in a month that ALSO holds closed or filtered-away claims, and this exhaustive
 * sentence renders over a month it is not true of: the other claims belong to no
 * hidden field, and the one switch it offers does not bring them back.
 *
 * ⚠ **AND THE SAME GUARD HAS A SECOND BLIND SPOT, measured the same day:** its
 * bounds are the six-week GRID, while this sentence says "in this month" — so a
 * claim on 2 Sep (a trailing cell of the August grid) can put this sentence over
 * an August holding no August claim. Both blind spots, the two candidate
 * repairs, and the owner are named in full at `calendar-model.ts`'s precedence
 * note; **this docblock points at it rather than restating it**, because two
 * statements of one condition are free to drift.
 */
export const CALENDAR_ALL_HIDDEN_COPY =
  'Every claimed date in this month belongs to a field you have hidden. Nothing was dropped — switch a field back on in the legend to see its claims again.';

/**
 * The side-list sentence when EVERY entry is a ticket with no start and no due date at all (UX fixes T8, 23.143,
 * audit PV-11). Plain words to the person looking at the page — the builder's "No bar is invented" was a design
 * principle addressed to a developer. It is said ONLY while it is true: a ticket with one date is not "without
 * dates", so a list holding one gets the sentence below instead.
 */
export const TIMELINE_SIDE_LIST_NO_DATES_COPY = 'These tickets have no dates yet.';

/**
 * The side-list sentence when the list holds ONLY work with a MISSING claim, at least one of which has a date.
 *
 * It states a LEAVING condition — add both and the ticket is drawn — so it is true exactly of entries that will
 * leave the moment the missing claim arrives: `no-dates`, `start-only`, `due-only`. It is FALSE over the other
 * two: a `start-after-due` entry already carries both and is still here, and so is one whose claimed day is not a
 * day on the calendar. That is why the model chooses between this sentence and the one below rather than
 * printing this one unconditionally as the plan's Task 10 does.
 */
export const TIMELINE_SIDE_LIST_COPY = 'Add a start and a due date to place a ticket on the timeline.';

/**
 * The side-list heading for a list that holds ANY entry the plain heading is
 * false of — the same shape as the empty-month copy above, honest per row and
 * false in the summary unless the summary is chosen.
 *
 * It names the whole set of reasons rather than picking one, which is what
 * lets it carry a mixed list truthfully.
 */
export const TIMELINE_SIDE_LIST_UNDRAWABLE_COPY =
  'These tickets cannot be drawn as a bar yet: a start or due date is missing, a start comes after its due date, or a date is not a day on the calendar.';

/**
 * The FIRST empty timeline: nothing here has a date claim at all.
 *
 * The timeline had NO empty copy of any kind, while its sibling calendar —
 * same package, written for exactly this failure — had three sentences. Four
 * different emptinesses serialised to identical bytes: nothing loaded, a
 * filter that matched nobody, a lane nobody belongs to, and work that is fully
 * dated and merely elsewhere in time.
 *
 * Reached when nothing is on screen, nothing visible is scheduled outside the
 * window, and nothing a narrowing removed would have shown here — i.e. every
 * loaded ticket is an undated epic (a lane, not missing work) or there are
 * none — OR when a narrowing did remove work that would have shown here, which
 * is why the third sentence below names it. The second sentence carries the
 * SAME PROMISE as the calendar's, word for word — "undated work is absent, not
 * estimated". ⚠ **"verbatim" was the wrong word and is corrected 2026-09-20:**
 * the rest of the sentence names this surface's own noun ("the periods someone
 * claimed", not "what someone claimed"), so the two are symmetric in the
 * promise and NOT in the text. They were never verbatim, and the paragraphs
 * below say why they must not be — a copy clause naming a control this surface
 * lacks is the defect this branch was dispatched to remove.
 *
 * The narrowing clause is here for the same reason as its calendar twin's:
 * the model cannot see the filter (the page narrows `tickets` upstream before
 * the view is handed them), so this arm names the SET of things that can hold
 * a claim off the chart rather than asserting that nobody claimed one.
 *
 * ⚠ **IT NAMES TWO CAUSES, NOT THREE, AND THAT IS DELIBERATE.** The calendar's
 * sentence also names "a field you switched off in the legend" — the timeline
 * has NO legend. `TimelineViewProps` carries no hidden-field prop,
 * `buildTimelineModel` has no `hiddenCustomFieldIds` option, and the product's
 * only legend state is `CalendarView`'s own. Naming it here would be the SAME
 * defect the owner deleted the lane sentence for one screen over: a word no
 * surface can offer the reader. **A first draft of this change copied the
 * calendar's clause across "for symmetry", and symmetry is what the copy is
 * allowed to have — not what it may claim.** The two views are symmetric in the
 * promise ("undated work is absent, not estimated") and NOT in the set of
 * controls, because the controls are not the same. Guarded now by
 * `timeline-view.test.tsx`'s "names only controls the TIMELINE has".
 */
export const TIMELINE_EMPTY_COPY =
  'No claimed dates are here to draw. Undated work is absent, not estimated — the timeline draws only the periods someone claimed. If a claim is here and not drawn, a narrowing kept it off these weeks without dropping it: your filter, closed jobs being hidden, or an epic, which is drawn in the List and not here.';

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
 * `IST_DAY_REGEX` is a SHAPE check, and until E6-19 (2026-09-21) the write
 * path (`dueDateValueSchema`, and Plan 3's bare-string custom date) validated
 * nothing beyond it — so `2026-02-30` was a storable claim that `dateMs`
 * refuses to place, and one committed before that fix still is. (`0099-01-01`
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
