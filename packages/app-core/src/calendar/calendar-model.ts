import type { TicketState } from '@gisik-nokma/domain';
import { monthGridWeeks, type WeekDays } from '../claims/dates.js';
import {
  CALENDAR_ALL_HIDDEN_COPY,
  CALENDAR_EMPTY_MONTH_COPY,
  barProvenance,
  claimTooltip,
  customClaimLabel,
  dueClaimLabel,
  startClaimLabel,
  type UserNameFn,
} from '../claims/claim-labels.js';
import {
  customDateClaimsOf,
  dateClaimOf,
  titleOf,
  type CustomDateClaimView,
  type DateClaimView,
  type TicketDatesInput,
} from '../claims/ticket-dates.js';
import { epicAncestorOf, isBuiltinEpicType, type IsEpicType } from '../hierarchy/epic-ancestor.js';
import { matchesFilter } from '../filter/matches-filter.js';
import type { FilterSpec } from '../view-types.js';

export type CalendarMonth = { year: number; month: number };

/**
 * A marker is one claim on one day, and the union is discriminated on WHICH
 * claim so the type carries the distinction instead of a convention.
 *
 * The built-in arm spells `fieldId`/`fieldName` as `null` rather than omitting
 * them, so a caller can read either without narrowing; narrowing on
 * `marker === 'custom'` then yields a non-null field name AND the precise
 * `CustomDateClaimView`. What is NOT reachable is the shape that would let a
 * guess render as a fact: there is no marker with `marker: 'custom'` and no
 * field name to say what the day means, and no built-in marker carrying a
 * custom claim's provenance.
 */
export type CalendarMarker =
  | {
      kind: 'marker';
      ticketId: string;
      /** The ticket's key (`CCSO-4`) when it has one — the chip's text is `<key> <title>` (23.140). */
      key: string | null;
      title: string;
      date: string;
      marker: 'due' | 'start';
      fieldId: null;
      fieldName: null;
      claim: DateClaimView;
      label: string;
      tooltip: string;
    }
  | {
      kind: 'marker';
      ticketId: string;
      key: string | null;
      title: string;
      date: string;
      /** A claimed custom `date`-kind field (owner sign-off 2026-08-20). */
      marker: 'custom';
      fieldId: string;
      fieldName: string;
      claim: CustomDateClaimView;
      label: string;
      tooltip: string;
    };

export type CalendarBar = {
  kind: 'bar';
  ticketId: string;
  title: string;
  start: string;
  end: string;
  startClaim: DateClaimView;
  dueClaim: DateClaimView;
  pending: boolean;
  provenance: string;
};

export type CalendarItem = CalendarMarker | CalendarBar;

export type CalendarWeek = { days: WeekDays; items: CalendarItem[] };

/** One legend row: a custom date field that actually placed a claim in this grid. */
export type CalendarCustomFieldTally = { fieldId: string; fieldName: string; count: number };

export type CalendarModel = {
  month: CalendarMonth;
  weeks: CalendarWeek[];
  hasItems: boolean;
  /**
   * Why the grid is empty, or null when it is not. **TWO sentences as of
   * 2026-09-20** (it was three): nothing was claimed on this grid, or
   * everything claimed on it belongs to a field the viewer switched off. The
   * remaining sentence names the OTHER narrowings that can empty a month, so it
   * stays true whichever combination is live — that is what replaced the third
   * arm rather than merely deleting it.
   *
   * The third arm was NOT in the plan and not in the first draft of this file:
   * `visible` is narrowed before any item is built, so a month emptied by a
   * filter reached the honest-empty sentence and told a viewer that a month
   * full of their own claimed dates had none. The owner's ruling of 2026-09-20
   * deleted the sentence written for it; the ARM is gone, the truth condition is
   * not. Whichever sentence is chosen, it must be true of THIS grid — see the
   * precedence note at the bottom of `buildCalendarModel`.
   */
  emptyCopy: string | null;
  /**
   * The legend's source, tallied over claims that land inside this month's
   * grid and computed BEFORE `hiddenCustomFieldIds` is applied — hiding a
   * field must not erase the switch that unhides it. A field nobody claimed
   * is absent entirely: the legend describes the grid, not the schema.
   */
  customDateFields: CalendarCustomFieldTally[];
};

export type CalendarModelOptions = CalendarMonth & {
  userName: UserNameFn;
  filter?: FilterSpec;
  laneEpicId?: string | null;
  /**
   * What counts as an epic for the lane filter. Defaults to the built-in type
   * id; a shell that has resolved the workspace's type roster should pass its
   * own rank-1 test so the lane agrees with the server's list read. See
   * `hierarchy/epic-ancestor.ts`.
   */
  isEpicType?: IsEpicType;
  /**
   * AN EPIC IS NOT A ROW IN THIS VIEW (owner, 2026-09-20): *"epics should never
   * show up in the board, timeline and calendar views. they can only be in the
   * list views"*, extended the same day to the Backlog — *"only in the list
   * view"* — so the List is the one surface that draws an epic as a row.
   *
   * **Why this is an OPTION and not the model's behaviour.** The model's
   * question is "what did someone claim, and where does it land"; the ruling is
   * a fact about WHICH SURFACE is drawing. `TimelineView` needs the epic's own
   * claims gone while the LANE it names stays, and the List needs the epic row
   * drawn — so the answer is not a property of the claims. A model that dropped
   * epics unconditionally would answer the List's question with this view's
   * rule, and there is no door back.
   *
   * **It removes the epic's ROW and never the epic's NAME.** This option joins
   * the `filter`/`laneEpicId` narrowing at `visible` below, which is *before*
   * `collectItems` — so an epic's bar, its markers and its custom-date claims
   * are all absent — and *after* `byId` is built from the complete input set,
   * which is what keeps an ancestor this narrowing removed still naming the
   * lane its child belongs to. The timeline states that ordering as a rule,
   * over the `byId` it builds at `timeline-model.ts:242-243` — *"Built from ALL
   * inputs, before narrowing: an ancestor removed by a filter still names the
   * lane its child belongs to"* — and this option is bound by it. ⚠ The line
   * numbers moved when this option's own docblock landed above them; the
   * QUOTED SENTENCE is the part that does not rot, so it is the part to measure
   * against if the numbers have drifted again.
   *
   * **It counts as a NARROWING rather than as a silent drop**, deliberately:
   * an epic is a real ticket whose claims really are in this month, so a grid
   * emptied only by this rule must NOT reach `CALENDAR_ALL_HIDDEN_COPY`'s
   * exhaustivity claim. Joining `visible` puts the removed epic into `excluded`,
   * where `narrowedOutOfGrid` sees it and gates that sentence off — the
   * conservative direction, and the one this guard already takes for a filter.
   * ⚠ The residual is real and is NOT fixed here: `CALENDAR_EMPTY_MONTH_COPY`
   * names a SET of causes and this rule is not one of them, so a month holding
   * one epic's claim and nothing else now reads "No claimed dates are drawn in
   * this month" over a month that holds one. Naming it would be new user-facing
   * copy, which is the owner's to write; recorded, with the owner named, rather
   * than invented here. See case 13.1045.
   */
  hideEpicRows?: boolean;
  /** View state from the legend switches. Arrangement, never data. */
  hiddenCustomFieldIds?: readonly string[];
};

function markerRank(item: CalendarItem): string {
  if (item.kind === 'bar') return '';
  return item.marker === 'custom' ? `custom:${item.fieldId}` : item.marker;
}

function itemOrder(a: CalendarItem, b: CalendarItem): number {
  if (a.kind !== b.kind) return a.kind === 'bar' ? -1 : 1; // bars first
  const aDate = a.kind === 'bar' ? a.start : a.date;
  const bDate = b.kind === 'bar' ? b.start : b.date;
  if (aDate !== bDate) return aDate < bDate ? -1 : 1;
  if (a.ticketId !== b.ticketId) return a.ticketId < b.ticketId ? -1 : 1;
  // two claims, same ticket, same day: order by which claim, so the grid is stable
  const aRank = markerRank(a);
  const bRank = markerRank(b);
  return aRank < bRank ? -1 : aRank > bRank ? 1 : 0;
}

function touchesWeek(item: CalendarItem, first: string, last: string): boolean {
  return item.kind === 'bar'
    ? item.start <= last && item.end >= first
    : item.date >= first && item.date <= last;
}

/**
 * Claims in, items out — the ONE construction, deliberately called twice.
 *
 * The second call is over the tickets a filter or a lane removed. It no longer
 * feeds a sentence of its own — that sentence was deleted on 2026-09-20 — but
 * it is NOT dead: it still gates `CALENDAR_ALL_HIDDEN_COPY`, which may not
 * claim "EVERY claimed date" while a filter is removing some of them, so a
 * month emptied by the legend AND a filter must not be told the legend did all
 * of it. That question must be answered by building the SAME items against the
 * SAME grid predicate: a cheaper `date.slice(0, 7) === monthKey` shortcut would
 * answer it about the calendar month while the grid renders six days of July
 * and six of September — which is the very off-by-a-week this file's edge tests
 * exist to catch, and which MUTATION-WITNESSED fails case 11.50's padding-cell
 * arm and nothing else.
 */
function collectItems(
  inputs: readonly TicketDatesInput[],
  userName: UserNameFn,
): { items: CalendarItem[]; customItems: CalendarMarker[] } {
  const items: CalendarItem[] = [];
  const customItems: CalendarMarker[] = [];
  for (const input of inputs) {
    const start = dateClaimOf(input, 'startDate');
    const due = dateClaimOf(input, 'dueDate');
    const title = titleOf(input.state);
    const ticketId = input.state.id;
    const key = input.key ?? null;

    // Custom date claims are independent of the start/due story — they are
    // collected first and unconditionally, so no `continue` below can drop
    // them, and no pairing logic can reach them.
    for (const claim of customDateClaimsOf(input)) {
      const label = customClaimLabel(claim, userName);
      customItems.push({
        kind: 'marker',
        ticketId,
        key,
        title,
        date: claim.date,
        marker: 'custom',
        fieldId: claim.fieldId,
        fieldName: claim.fieldName,
        claim,
        label,
        // A custom date claim carries no note (Plan 3 takes a bare
        // 'YYYY-MM-DD'), so the tooltip is the label — nothing to quote.
        tooltip: label,
      });
    }

    if (start !== null && due !== null && start.date <= due.date) {
      items.push({
        kind: 'bar',
        ticketId,
        title,
        start: start.date,
        end: due.date,
        startClaim: start,
        dueClaim: due,
        pending: start.pending || due.pending,
        provenance: barProvenance(start, due, userName),
      });
      continue;
    }
    if (due !== null) {
      const label = dueClaimLabel(due, userName);
      items.push({
        kind: 'marker',
        ticketId,
        key,
        title,
        date: due.date,
        marker: 'due',
        fieldId: null,
        fieldName: null,
        claim: due,
        label,
        tooltip: claimTooltip(label, due),
      });
    }
    if (start !== null) {
      const label = startClaimLabel(start, userName);
      items.push({
        kind: 'marker',
        ticketId,
        key,
        title,
        date: start.date,
        marker: 'start',
        fieldId: null,
        fieldName: null,
        claim: start,
        label,
        tooltip: claimTooltip(label, start),
      });
    }
    // No claims → nothing. The undated ticket is absent, not estimated.
  }
  return { items, customItems };
}

/**
 * Pure: tickets in, month grid out. Every item traces to a claim — there is
 * no branch that fabricates a date (invariant 4). Contradictory claims
 * (start after due) render as two attributed markers, never as a bar:
 * negative geometry would be invented geometry.
 *
 * NO CLOCK IS READ HERE. `year`/`month` arrive as inputs and `today` is not
 * this function's business at all; the one instant→day conversion in the
 * product is the domain's `istDayOf`, called by the mounting shell. That is
 * what makes this function's answer the same in Tura and in Toronto —
 * `test/calendar/clock-free.test.ts` runs it under three zones and reads the
 * source for the getters that would break it.
 *
 * Custom `date`-kind fields (owner sign-off 2026-08-20) join as markers on
 * the same terms, labelled with their own field names. THEY NEVER FORM
 * BARS: a bar requires the `startDate` + `dueDate` pair and nothing else,
 * because a span between two unrelated claims is a duration nobody claimed.
 * There is deliberately no code path below that pairs a custom date with
 * anything.
 */
export function buildCalendarModel(
  inputs: TicketDatesInput[],
  opts: CalendarModelOptions,
): CalendarModel {
  const byId = new Map<string, TicketState>(inputs.map((input) => [input.state.id, input.state]));
  const isEpicType = opts.isEpicType ?? isBuiltinEpicType;
  const visible = inputs.filter((input) => {
    if (opts.filter !== undefined && !matchesFilter(input.state, opts.filter)) return false;
    // The owner's ruling, read through THIS view's epic test — never a name or
    // an id match, so a workspace that renamed or replaced its rank-1 type
    // still has epics (`epic-ancestor.ts` is the whole argument). `opts.hideEpicRows`
    // is opt-in: absent means epics draw here, which is what every case written
    // before 2026-09-20 asserts.
    if (opts.hideEpicRows === true && isEpicType(input.state.typeId)) return false;
    if (
      opts.laneEpicId !== undefined &&
      opts.laneEpicId !== null &&
      epicAncestorOf(byId, input.state.id, isEpicType) !== opts.laneEpicId
    ) {
      return false;
    }
    return true;
  });

  const { items, customItems } = collectItems(visible, opts.userName);

  const gridWeeks = monthGridWeeks(opts.year, opts.month);
  const firstWeek = gridWeeks[0];
  const lastWeek = gridWeeks[gridWeeks.length - 1];
  if (firstWeek === undefined || lastWeek === undefined) {
    throw new RangeError(`no grid rows for ${opts.year}-${opts.month}`);
  }
  const gridFirst = firstWeek[0];
  const gridLast = lastWeek[6];

  // The legend describes what this grid actually shows, so its bounds are
  // the grid's — not the calendar month's. A switch always corresponds to
  // something on screen, and everything on screen has a switch.
  const tally = new Map<string, CalendarCustomFieldTally>();
  for (const item of customItems) {
    if (item.marker !== 'custom') continue;
    if (item.date < gridFirst || item.date > gridLast) continue;
    const existing = tally.get(item.fieldId);
    if (existing !== undefined) existing.count += 1;
    else tally.set(item.fieldId, { fieldId: item.fieldId, fieldName: item.fieldName, count: 1 });
  }
  const customDateFields = [...tally.values()].sort((a, b) =>
    a.fieldName < b.fieldName ? -1 : a.fieldName > b.fieldName ? 1 : 0,
  );

  const hidden = new Set(opts.hiddenCustomFieldIds ?? []);
  const kept = customItems.filter((item) => item.marker !== 'custom' || !hidden.has(item.fieldId));
  const shown: CalendarItem[] = [...items, ...kept];

  const weeks: CalendarWeek[] = gridWeeks.map((days) => ({
    days,
    items: shown.filter((item) => touchesWeek(item, days[0], days[6])).sort(itemOrder),
  }));

  const hasItems = weeks.some((week) => week.items.length > 0);
  /**
   * The distinction the plan's model would have collapsed: if the grid is
   * empty ONLY because the viewer hid the fields whose claims fall in it, the
   * fallback's "nothing is drawn here" would tell a viewer their own claims do
   * not exist. Measured against the same grid bounds the tally uses, so the
   * sentence and the switches describe the same set.
   *
   * ⚠ "ONLY" is doing load-bearing work and is NOT enforced across the page's
   * upstream pruning — see the precedence note at the bottom of this function.
   */
  const hiddenInGrid = customItems.some(
    (item) =>
      item.marker === 'custom' &&
      hidden.has(item.fieldId) &&
      item.date >= gridFirst &&
      item.date <= gridLast,
  );
  /**
   * The SAME lie at the other two doors, and it is the shipped behaviour this
   * arm was added to end: `visible` is narrowed by `opts.filter` and
   * `opts.laneEpicId` BEFORE any item is built, so a month whose every claim
   * belongs to filtered-out work reached "No claimed dates fall in this
   * month" — about a month full of claimed dates.
   *
   * Reference identity, not ids: two inputs may legitimately carry the same
   * ticket id (the ordering fixtures do), and an id-keyed exclusion would
   * then drop the wrong one. `visible` is `inputs.filter(...)`, so the
   * surviving objects ARE the input objects.
   *
   * Computed only when the grid is empty and something was actually narrowed
   * away — otherwise this is a second full build for an answer nobody reads.
   */
  const survived = new Set<TicketDatesInput>(visible);
  const excluded =
    hasItems || visible.length === inputs.length
      ? []
      : inputs.filter((input) => !survived.has(input));
  const narrowedAway = collectItems(excluded, opts.userName);
  const narrowedOutOfGrid = [...narrowedAway.items, ...narrowedAway.customItems].some((item) =>
    touchesWeek(item, gridFirst, gridLast),
  );

  /**
   * PRECEDENCE, and it is a truth condition rather than a preference.
   *
   * `CALENDAR_ALL_HIDDEN_COPY` says "EVERY claimed date in this month belongs
   * to a field you have hidden". With a filter ALSO removing August claims
   * that no hidden field owns, that sentence is false — so the exhaustive
   * sentence may only be reached when the legend is the only narrowing that
   * emptied the grid. `CALENDAR_EMPTY_MONTH_COPY` names the set of narrowings
   * instead of picking one, which is what lets it carry the both-case
   * truthfully. Witnessed at `calendar-model.test.ts` 11.50.
   *
   * ⚠ **THE THIRD SENTENCE WAS DELETED HERE ON 2026-09-20 AND THIS GUARD WAS
   * NOT.** `CALENDAR_NARROWED_MONTH_COPY` named "the filter, the LANE, or the
   * legend"; no app could render it (no production call site passes `filter` or
   * `laneEpicId` — see the render site's own note in `apps/web`'s project page),
   * "lane" is a word no screen in this product shows, and the owner ruled
   * *"delete the copy"*. Deleting the CONSTANT does not require deleting the
   * DOOR: `narrowedOutOfGrid` is what stops the exhaustive sentence overclaiming
   * when a filter joins the legend, and that is the failure this block exists to
   * forbid. So the door stays, its arm now falls through to the sentence that
   * names the set, and the ruling is honoured without spending the guard.
   *
   * The alternative — reaching `CALENDAR_ALL_HIDDEN_COPY` whenever
   * `hiddenInGrid`, guard deleted — is what "delete the sentence, keep nothing"
   * would have produced, and it would be indistinguishable TODAY: no app passes
   * a filter, so `narrowedOutOfGrid` is false everywhere `hiddenInGrid` is
   * measured. `narrowedAway`/`excluded` above therefore still have a reader.
   *
   * ⚠ **BUT THIS GUARD IS INERT IN EVERY SHIPPED APP, AND THAT IS A LIVE
   * OVERCLAIM RATHER THAN A FUTURE ONE — recorded by a reviewer 2026-09-20,
   * measured, and NOT fixed here.** The guard can only see what the MODEL
   * narrowed. The page's own `datesNarrowing` prunes rows UPSTREAM (a filter,
   * and the closed-hidden-by-default rule), so those claims never reach
   * `inputs`, never enter `excluded`, and never make `narrowedOutOfGrid` true —
   * while `hiddenInGrid` is computed over what did arrive. A viewer who hides a
   * legend field holding an in-grid claim, in a month that ALSO holds claims on
   * closed or filtered-away jobs, therefore reaches "EVERY claimed date in this
   * month belongs to a field you have hidden" — false on both clauses, and the
   * one switch it offers does not bring the missing claims back.
   *
   * ⚠ **A SECOND BLIND SPOT IN THE SAME GUARD, measured by a reviewer the same
   * day.** The gate's bounds are the six-week GRID (`gridFirst`/`gridLast`),
   * while the sentence it gates says "in this month". A claim on 2 Sep is a
   * trailing cell of the AUGUST grid, so hiding its field renders "Every
   * claimed date in this month belongs to a field you have hidden" over an
   * August that holds no August claim at all. **The codebase knows the unit is
   * the grid** — case 11.49's own name says "claimed nothing IN THIS GRID", and
   * `hiddenInGrid`'s docblock says the sentence and the switches describe the
   * same set — **but the copy the reader sees says month.** Pre-existing, like
   * the first blind spot, and recorded here because this note would otherwise
   * read as a complete account of the guard.
   *
   * **Owner of both: the owner, by way of whoever next owns the calendar's
   * empty states.** Two candidate repairs, and they are different questions —
   * naming them separately so the next reader does not have to guess which one
   * a sentence refers to:
   * **(a) The page tells the view that it pruned something before the model saw
   * it.** Note carefully: a page-level flag is too coarse for the FALLBACK
   * sentence — "a filter is on" cannot say whether THIS month was emptied, the
   * objection `CALENDAR_EMPTY_MONTH_COPY`'s note works through — but it may be
   * exactly right for THIS sentence, whose claim is about the whole grid rather
   * than about one cause. **(b) This sentence stops claiming exhaustivity.**
   * Fixing either in passing would pre-empt a ruling of the same shape as the
   * two this branch exists to implement.
   */
  return {
    month: { year: opts.year, month: opts.month },
    weeks,
    hasItems,
    emptyCopy: hasItems
      ? null
      : hiddenInGrid && !narrowedOutOfGrid
        ? CALENDAR_ALL_HIDDEN_COPY
        : CALENDAR_EMPTY_MONTH_COPY,
    customDateFields,
  };
}
