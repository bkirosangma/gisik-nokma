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
   * Why the grid is empty, or null when it is not. TWO different sentences,
   * because they are two different facts: nothing was claimed, or everything
   * claimed here belongs to a field the viewer switched off.
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
    if (
      opts.laneEpicId !== undefined &&
      opts.laneEpicId !== null &&
      epicAncestorOf(byId, input.state.id, isEpicType) !== opts.laneEpicId
    ) {
      return false;
    }
    return true;
  });

  const items: CalendarItem[] = [];
  const customItems: CalendarMarker[] = [];
  for (const input of visible) {
    const start = dateClaimOf(input, 'startDate');
    const due = dateClaimOf(input, 'dueDate');
    const title = titleOf(input.state);
    const ticketId = input.state.id;

    // Custom date claims are independent of the start/due story — they are
    // collected first and unconditionally, so no `continue` below can drop
    // them, and no pairing logic can reach them.
    for (const claim of customDateClaimsOf(input)) {
      const label = customClaimLabel(claim, opts.userName);
      customItems.push({
        kind: 'marker',
        ticketId,
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
        provenance: barProvenance(start, due, opts.userName),
      });
      continue;
    }
    if (due !== null) {
      const label = dueClaimLabel(due, opts.userName);
      items.push({
        kind: 'marker',
        ticketId,
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
      const label = startClaimLabel(start, opts.userName);
      items.push({
        kind: 'marker',
        ticketId,
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
   * empty ONLY because the viewer hid the fields whose claims fall in it,
   * saying "no claimed dates fall in this month" would tell them their own
   * claims do not exist. Measured against the same grid bounds the tally
   * uses, so the sentence and the switches describe the same set.
   */
  const hiddenInGrid = customItems.some(
    (item) =>
      item.marker === 'custom' &&
      hidden.has(item.fieldId) &&
      item.date >= gridFirst &&
      item.date <= gridLast,
  );
  return {
    month: { year: opts.year, month: opts.month },
    weeks,
    hasItems,
    emptyCopy: hasItems ? null : hiddenInGrid ? CALENDAR_ALL_HIDDEN_COPY : CALENDAR_EMPTY_MONTH_COPY,
    customDateFields,
  };
}
