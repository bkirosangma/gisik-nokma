import type { TicketState } from '@gisik-nokma/domain';
import {
  TIMELINE_SIDE_LIST_COPY,
  TIMELINE_SIDE_LIST_UNDRAWABLE_COPY,
  barProvenance,
  contradictionCopy,
  customClaimLabel,
  dueClaimLabel,
  formatClaimDate,
  startClaimLabel,
  unplaceableDayCopy,
  type UserNameFn,
} from '../claims/claim-labels.js';
import { DAY_MS, addDays, dateMs, isCalendarDay, mondayOnOrBefore } from '../claims/dates.js';
import {
  customDateClaimsOf,
  dateClaimOf,
  titleOf,
  type CustomDateClaimView,
  type DateClaimView,
  type TicketDatesInput,
} from '../claims/ticket-dates.js';
import { matchesFilter } from '../filter/matches-filter.js';
import { epicAncestorOf, isBuiltinEpicType, type IsEpicType } from '../hierarchy/epic-ancestor.js';
import type { FilterSpec } from '../view-types.js';

export type TimelineWeekCol = { start: string; label: string };
export type TimelineBarSpan = {
  fromWeek: number;
  toWeek: number;
  clippedStart: boolean;
  clippedEnd: boolean;
};

/** A claimed custom date field with its attributed rendering. Never geometry. */
export type TimelineCustomClaim = { claim: CustomDateClaimView; label: string };

/**
 * Why a ticket is beside the timeline rather than on it.
 *
 * `unplaceable-day` is NOT in the plan's four and is not a taste call: the
 * other four are each a statement the model would otherwise make falsely about
 * a ticket whose claimed day is not a day. Calling it `due-only` would deny a
 * start claim the ticket carries; calling it `start-after-due` would assert an
 * ordering between a real day and one that does not exist. See
 * `unplaceableDayCopy`.
 */
export type TimelineSideReason =
  | 'no-dates'
  | 'start-only'
  | 'due-only'
  | 'start-after-due'
  | 'unplaceable-day';

export type TimelineRow = {
  ticketId: string;
  title: string;
  bar: TimelineBarSpan;
  startClaim: DateClaimView;
  dueClaim: DateClaimView;
  pending: boolean;
  provenance: string;
  customClaims: TimelineCustomClaim[];
};

export type TimelineSideEntry = {
  ticketId: string;
  title: string;
  reason: TimelineSideReason;
  startClaim: DateClaimView | null;
  dueClaim: DateClaimView | null;
  note: string;
  customClaims: TimelineCustomClaim[];
};

export type TimelineGroup = { epicId: string | null; epicTitle: string; rows: TimelineRow[] };

export type TimelineModel = {
  weeks: TimelineWeekCol[];
  groups: TimelineGroup[];
  sideList: TimelineSideEntry[];
  sideListCopy: string;
};

export type TimelineModelOptions = {
  /**
   * An IST DAY, never an instant and never a clock read. The shell passes the
   * day the domain's `istDayOf` returns for the current instant — exactly as
   * `CalendarView` gets `today` — and Earlier/Later walk it in day-space from
   * there. (The literal expression is deliberately NOT spelled here: the
   * clock-free scanner is anchored on the keyword, not on its context, so
   * prose quoting the constructor registers as a use. That is the scanner
   * being right, and it caught this docblock.) Every column is therefore the
   * same IST day the calendar would put a claim in; a window that opened
   * anywhere else would file the same claim in a different week from the
   * calendar's cell — one product, two answers.
   */
  anchor: string;
  weeksCount?: number;
  userName: UserNameFn;
  filter?: FilterSpec;
  laneEpicId?: string | null;
  /**
   * What counts as an epic, for the lane filter, the grouping AND the
   * undated-epic skip. Defaults to the built-in type id; a shell that has
   * resolved the workspace's type roster should pass its own rank-1 test.
   *
   * The plan hardcoded `typeId === 'epic'` at the skip while routing grouping
   * through `epicAncestorOf`'s injectable predicate. A workspace whose rank-1
   * type is "Initiative" would then have its undated initiative land in the
   * side list as MISSING WORK while the same model grouped under it — the
   * product disagreeing with itself inside one function.
   */
  isEpicType?: IsEpicType;
};

export const NO_DATES_NOTE = 'no claimed dates';

/**
 * The same side-list slot for a ticket that DOES carry custom date claims
 * but no start/needed-by pair. Saying "no claimed dates" there would be
 * false — the note narrows to exactly what is missing.
 */
export const NO_DAY_CLAIMS_NOTE = 'no claimed start or needed-by';

const DEFAULT_WEEKS = 8;
const NO_EPIC_TITLE = 'No epic';

/**
 * The reasons the plain heading is true of: a ticket that is here because a
 * claim is MISSING leaves the moment both arrive. The other two do not.
 */
const MISSING_CLAIM_REASONS: ReadonlySet<TimelineSideReason> = new Set<TimelineSideReason>([
  'no-dates',
  'start-only',
  'due-only',
]);

/**
 * Gantt-lite over claims. THE rule: a bar requires BOTH a claimed start and
 * a claimed due. A single claim is a side-list entry with the claim named;
 * no claim is a side-list entry saying so; start-after-due is displayed as
 * the contradiction it is — geometry is never invented to resolve it.
 * No dependencies, no critical path: out of spec.
 *
 * NO CLOCK IS READ HERE. `anchor` arrives as an IST day from the shell;
 * `test/calendar/clock-free.test.ts` runs this model under four zones and
 * scans `src/timeline` for the getters that would break it.
 */
export function buildTimelineModel(
  inputs: TicketDatesInput[],
  opts: TimelineModelOptions,
): TimelineModel {
  const weeksCount = opts.weeksCount ?? DEFAULT_WEEKS;
  if (!Number.isInteger(weeksCount) || weeksCount < 1) {
    // Loud, like `monthGridWeeks`' month check: a zero-column timeline has no
    // window, so every fully-dated ticket would silently vanish from a view
    // that still rendered its side list — an emptiness nothing on screen
    // explains.
    throw new RangeError(`a timeline needs at least one week column: ${weeksCount}`);
  }
  const isEpicType = opts.isEpicType ?? isBuiltinEpicType;
  const windowStart = mondayOnOrBefore(opts.anchor);
  const weeks: TimelineWeekCol[] = [];
  for (let index = 0; index < weeksCount; index += 1) {
    const start = addDays(windowStart, index * 7);
    weeks.push({ start, label: `W ${formatClaimDate(start)}` });
  }
  const lastWeek = weeks[weeks.length - 1];
  if (lastWeek === undefined) throw new RangeError(`no week columns for anchor ${opts.anchor}`);
  /** INCLUSIVE: the Sunday of the last column, not the Monday after it. */
  const windowEnd = addDays(lastWeek.start, 6);

  // Built from ALL inputs, before narrowing: an ancestor removed by a filter
  // still names the lane its child belongs to, and resolving against the
  // narrowed set would move filtered children into "No epic".
  const byId = new Map<string, TicketState>(inputs.map((input) => [input.state.id, input.state]));
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

  function weekIndexOf(isoDay: string): number {
    return Math.floor((dateMs(isoDay) - dateMs(windowStart)) / (7 * DAY_MS));
  }

  function groupTitle(epicId: string | null): string {
    if (epicId === null) return NO_EPIC_TITLE;
    const state = byId.get(epicId);
    const title = state === undefined ? '' : titleOf(state);
    // An UNTITLED epic is not an epic-less lane. `titleOf(...) || 'No epic'`
    // would put a ticket that has an epic under a heading saying it has none,
    // and would render two distinct lanes identically.
    return title !== '' ? title : epicId;
  }

  const rowsWithEpic: Array<{ epicId: string | null; row: TimelineRow }> = [];
  const sideList: TimelineSideEntry[] = [];

  for (const input of visible) {
    const start = dateClaimOf(input, 'startDate');
    const due = dateClaimOf(input, 'dueDate');
    const title = titleOf(input.state);
    const ticketId = input.state.id;
    // An undated epic is a lane, not missing work.
    if (isEpicType(input.state.typeId) && start === null && due === null) continue;

    // Custom date claims are carried, never consulted: nothing below branches
    // on them except the side-list WORDING. They cannot make a bar, move a
    // bar, or move a ticket between the rows and the side list.
    const customClaims: TimelineCustomClaim[] = customDateClaimsOf(input).map((claim) => ({
      claim,
      label: customClaimLabel(claim, opts.userName),
    }));

    /**
     * Geometry needs days that exist. Asked BEFORE any comparison or
     * arithmetic, because `2026-02-30` compares perfectly well as a string
     * and would reach `weekIndexOf`, where `dateMs` throws — blanking the
     * timeline for every other ticket in the workspace.
     */
    const unplaceable = [start, due]
      .filter((claim): claim is DateClaimView => claim !== null)
      .map((claim) => claim.date)
      .filter((day) => !isCalendarDay(day));
    if (unplaceable.length > 0) {
      sideList.push({
        ticketId,
        title,
        reason: 'unplaceable-day',
        startClaim: start,
        dueClaim: due,
        note: unplaceableDayCopy(unplaceable),
        customClaims,
      });
      continue;
    }

    if (start !== null && due !== null && start.date <= due.date) {
      // Side-list membership is about missing claims; the WINDOW is about
      // where a span is drawn. A fully-dated ticket outside it appears
      // nowhere — navigation reaches it, it is scheduled, just not here.
      if (due.date < windowStart || start.date > windowEnd) continue;
      const clippedStart = start.date < windowStart;
      const clippedEnd = due.date > windowEnd;
      rowsWithEpic.push({
        epicId: epicAncestorOf(byId, ticketId, isEpicType),
        row: {
          ticketId,
          title,
          bar: {
            fromWeek: clippedStart ? 0 : weekIndexOf(start.date),
            toWeek: clippedEnd ? weeksCount - 1 : weekIndexOf(due.date),
            clippedStart,
            clippedEnd,
          },
          startClaim: start,
          dueClaim: due,
          pending: start.pending || due.pending,
          provenance: barProvenance(start, due, opts.userName),
          customClaims,
        },
      });
      continue;
    }

    if (start !== null && due !== null) {
      sideList.push({
        ticketId,
        title,
        reason: 'start-after-due',
        startClaim: start,
        dueClaim: due,
        note: contradictionCopy(start, due),
        customClaims,
      });
    } else if (due !== null) {
      sideList.push({
        ticketId,
        title,
        reason: 'due-only',
        startClaim: null,
        dueClaim: due,
        note: dueClaimLabel(due, opts.userName),
        customClaims,
      });
    } else if (start !== null) {
      sideList.push({
        ticketId,
        title,
        reason: 'start-only',
        startClaim: start,
        dueClaim: null,
        note: startClaimLabel(start, opts.userName),
        customClaims,
      });
    } else {
      sideList.push({
        ticketId,
        title,
        reason: 'no-dates',
        startClaim: null,
        dueClaim: null,
        // "no claimed dates" would be false of a ticket carrying a "Filed on".
        note: customClaims.length > 0 ? NO_DAY_CLAIMS_NOTE : NO_DATES_NOTE,
        customClaims,
      });
    }
  }

  const groupsById = new Map<string | null, TimelineGroup>();
  for (const { epicId, row } of rowsWithEpic) {
    const existing = groupsById.get(epicId);
    if (existing !== undefined) existing.rows.push(row);
    else groupsById.set(epicId, { epicId, epicTitle: groupTitle(epicId), rows: [row] });
  }
  for (const group of groupsById.values()) {
    group.rows.sort((a, b) =>
      a.startClaim.date < b.startClaim.date
        ? -1
        : a.startClaim.date > b.startClaim.date
          ? 1
          : a.ticketId < b.ticketId
            ? -1
            : a.ticketId > b.ticketId
              ? 1
              : 0,
    );
  }
  const groups = [...groupsById.values()].sort((a, b) => {
    if (a.epicId === null) return 1;
    if (b.epicId === null) return -1;
    if (a.epicTitle !== b.epicTitle) return a.epicTitle < b.epicTitle ? -1 : 1;
    // Two epics may share a title; ordering by id keeps the answer the same
    // twice rather than leaving it to input order.
    return a.epicId < b.epicId ? -1 : a.epicId > b.epicId ? 1 : 0;
  });

  /**
   * The heading must be true of every entry UNDER it.
   *
   * `TIMELINE_SIDE_LIST_COPY` says work stays here "until it carries both a
   * claimed start and a claimed needed-by" — a leaving condition that a
   * `start-after-due` entry already satisfies while sitting in the list, and
   * that an `unplaceable-day` entry can satisfy too. So the exhaustive
   * sentence is reached only when every entry really is here for a missing
   * claim, exactly as `emptyCopy` reaches `CALENDAR_ALL_HIDDEN_COPY` only
   * when the legend is the only narrowing in play.
   */
  const sideListCopy = sideList.every((entry) => MISSING_CLAIM_REASONS.has(entry.reason))
    ? TIMELINE_SIDE_LIST_COPY
    : TIMELINE_SIDE_LIST_UNDRAWABLE_COPY;

  return { weeks, groups, sideList, sideListCopy };
}
