import type { TicketState } from '@gisik-nokma/domain';
import {
  TIMELINE_EMPTY_COPY,
  TIMELINE_SIDE_LIST_COPY,
  TIMELINE_SIDE_LIST_NO_DATES_COPY,
  TIMELINE_SIDE_LIST_UNDRAWABLE_COPY,
  barProvenance,
  contradictionCopy,
  customClaimLabel,
  dueClaimLabel,
  startClaimLabel,
  unplaceableDayCopy,
  type UserNameFn,
} from '../claims/claim-labels.js';
import { isCalendarDay } from '../claims/dates.js';
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
import { dayNumberOf } from './timeline-days.js';

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

/**
 * One bar. `startDay` and `endDay` are DAY NUMBERS (days since 1970-01-01, see `timeline-days.ts`), INCLUSIVE at both
 * ends, and never clipped: the axis is continuous (TV-1), so a period is drawn where it was claimed and the viewport
 * decides what is in view. `key` is the ticket key for the label on the bar (TV-5), `null` when the ledger holds no prefix.
 */
export type TimelineRow = {
  ticketId: string;
  title: string;
  key: string | null;
  startDay: number;
  endDay: number;
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

/**
 * Where one ticket landed, or why it landed nowhere.
 *
 * The two silent arms are the point of this union. A ticket that produces
 * neither a row nor a side entry has been removed for a REASON, and the two
 * reasons are different facts a viewer needs told apart — which is exactly
 * what the model could not say before, because it said nothing at all.
 */
type TimelinePlacement =
  | { kind: 'row'; epicId: string | null; row: TimelineRow }
  | { kind: 'side'; entry: TimelineSideEntry }
  /** An undated epic: a lane, not missing work. */
  | { kind: 'lane-heading' };

export type TimelineModel = {
  /**
   * `today` as a day number, or `null` when no `today` was passed or it is not a real day. The line is the view's;
   * the model only says which day (it reads no clock: `today` is an input).
   */
  todayDay: number | null;
  /** The earliest `startDay` and latest `endDay` over every drawn bar, or `null` when nothing is drawn. */
  firstDay: number | null;
  lastDay: number | null;
  groups: TimelineGroup[];
  sideList: TimelineSideEntry[];
  sideListCopy: string;
  /**
   * Why the timeline is empty, or null when it is not: `TIMELINE_EMPTY_COPY`, whose one sentence names the set of
   * narrowings that can keep a claim off the chart (the page narrows `tickets` upstream, so the model cannot tell a
   * filter that matched nobody from a workspace nobody dated, and does not pretend to).
   *
   * **The second arm is gone (continuous axis, 2026-10-03, TV-9).** There used to be a sentence for work that was
   * fully dated and sat outside the eight weeks; on one continuous axis every dated bar is drawn and reachable by
   * panning, so "outside the window" is no longer a state of the data. What replaces it is the VIEW's "Nothing in
   * view" pill with its jump controls, which needs the viewport and so cannot be a model answer. The `narrowedAway`
   * guard that picked between the two sentences went with the arm it chose between.
   */
  emptyCopy: string | null;
};

export type TimelineModelOptions = {
  /** An IST day, injected — never read from a device. Absent: no today line. */
  today?: string;
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
  /**
   * AN EPIC'S OWN CLAIMS ARE NOT DRAWN HERE — the owner's ruling of
   * 2026-09-20, whose full statement and whose counting rationale live on
   * `calendar-model.ts`'s `hideEpicRows`. Read that one; the two options are
   * ONE rule with two spellings only because the two models are separate files,
   * and a second full argument here would be a second thing to keep true.
   *
   * ⚠ WHAT THE TIMELINE ADDS, AND IT IS THE WHOLE REASON THIS OPTION IS NOT
   * JUST A FILTER OF ITS INPUTS. A lane here IS the epic — `groupTitle` reads
   * `byId`, `byId` is built from the COMPLETE input set one line above `visible`
   * *"before narrowing: an ancestor removed by a filter still names the lane its
   * child belongs to"*, and `rowsWithEpic` reaches a lane through each child's
   * `epicAncestorOf`. So removing the epic's own placement removes the epic's
   * bar and nothing else: a lane that still holds a dated child keeps its
   * heading, titled with the epic's name, which is exactly the shape the owner
   * ruled for the Backlog's section headers — **visible as a NAME, absent as a
   * ticket.** Reaching the same outcome by dropping epics from `inputs` instead
   * would empty `byId`, move every child into `NO_EPIC_TITLE`, and delete the
   * heading — the drawn absence this ruling's own addendum forbids.
   */
  hideEpicRows?: boolean;
};

export const NO_DATES_NOTE = 'no claimed dates';

/**
 * The same side-list slot for a ticket that DOES carry custom date claims
 * but no start/needed-by pair. Saying "no claimed dates" there would be
 * false — the note narrows to exactly what is missing.
 */
export const NO_DAY_CLAIMS_NOTE = 'no claimed start or needed-by';

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
 * NO CLOCK IS READ HERE. `today` arrives as an IST day from the shell;
 * `test/calendar/clock-free.test.ts` runs this model under four zones and
 * scans `src/timeline` for the getters that would break it.
 */
export function buildTimelineModel(
  inputs: TicketDatesInput[],
  opts: TimelineModelOptions,
): TimelineModel {
  const isEpicType = opts.isEpicType ?? isBuiltinEpicType;

  // Built from ALL inputs, before narrowing: an ancestor removed by a filter
  // still names the lane its child belongs to, and resolving against the
  // narrowed set would move filtered children into "No epic".
  const byId = new Map<string, TicketState>(inputs.map((input) => [input.state.id, input.state]));
  const visible = inputs.filter((input) => {
    if (opts.filter !== undefined && !matchesFilter(input.state, opts.filter)) return false;
    // The same ruling as the calendar's, and the same reasoning for putting it
    // HERE rather than over `inputs`: `byId` above is already built, so this
    // removes the epic's own bar from the grid and leaves its children's lanes
    // named. See this option's docblock.
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

  function groupTitle(epicId: string | null): string {
    if (epicId === null) return NO_EPIC_TITLE;
    const state = byId.get(epicId);
    const title = state === undefined ? '' : titleOf(state);
    // An UNTITLED epic is not an epic-less lane. `titleOf(...) || 'No epic'`
    // would put a ticket that has an epic under a heading saying it has none,
    // and would render two distinct lanes identically.
    return title !== '' ? title : epicId;
  }

  /** Claims in, placement out: the ONE construction every ticket goes through. */
  function classify(input: TicketDatesInput): TimelinePlacement {
    const start = dateClaimOf(input, 'startDate');
    const due = dateClaimOf(input, 'dueDate');
    const title = titleOf(input.state);
    const ticketId = input.state.id;
    /**
     * An undated epic is a lane, not missing work — and the guard fires ONLY
     * when the epic has nothing to say. Both halves of the condition are
     * deliberate, and both are now pinned (11.62):
     *
     * - A HALF-dated epic goes to the side list like any other half-dated
     *   ticket, and still heads its lane. Widening this to `||` would suppress
     *   a claim on the grounds of the ticket's TYPE — someone claimed a start
     *   for that epic, and the whole file's rule is that a claim is shown as
     *   claimed.
     * - A FULLY dated epic gets a bar, in its own lane (`epicAncestorOf`
     *   returns self for an epic). Dropping the date condition would delete a
     *   period someone claimed because of what the ticket IS.
     *
     * This is the only statement in the function that removes a ticket from
     * BOTH outputs, so it is kept as narrow as its justification.
     */
    if (isEpicType(input.state.typeId) && start === null && due === null) {
      return { kind: 'lane-heading' };
    }

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
     * and would reach `dayNumberOf`, where `dateMs` throws — blanking the
     * timeline for every other ticket in the workspace.
     */
    const unplaceable = [start, due]
      .filter((claim): claim is DateClaimView => claim !== null)
      .map((claim) => claim.date)
      .filter((day) => !isCalendarDay(day));
    if (unplaceable.length > 0) {
      return {
        kind: 'side',
        entry: {
          ticketId,
          title,
          reason: 'unplaceable-day',
          startClaim: start,
          dueClaim: due,
          note: unplaceableDayCopy(unplaceable),
          customClaims,
        },
      };
    }

    if (start !== null && due !== null && start.date <= due.date) {
      return {
        kind: 'row',
        epicId: epicAncestorOf(byId, ticketId, isEpicType),
        row: {
          ticketId,
          title,
          key: input.key ?? null,
          startDay: dayNumberOf(start.date),
          endDay: dayNumberOf(due.date),
          startClaim: start,
          dueClaim: due,
          pending: start.pending || due.pending,
          provenance: barProvenance(start, due, opts.userName),
          customClaims,
        },
      };
    }

    if (start !== null && due !== null) {
      return {
        kind: 'side',
        entry: {
          ticketId,
          title,
          reason: 'start-after-due',
          startClaim: start,
          dueClaim: due,
          note: contradictionCopy(start, due),
          customClaims,
        },
      };
    }
    if (due !== null) {
      return {
        kind: 'side',
        entry: {
          ticketId,
          title,
          reason: 'due-only',
          startClaim: null,
          dueClaim: due,
          note: dueClaimLabel(due, opts.userName),
          customClaims,
        },
      };
    }
    if (start !== null) {
      return {
        kind: 'side',
        entry: {
          ticketId,
          title,
          reason: 'start-only',
          startClaim: start,
          dueClaim: null,
          note: startClaimLabel(start, opts.userName),
          customClaims,
        },
      };
    }
    return {
      kind: 'side',
      entry: {
        ticketId,
        title,
        reason: 'no-dates',
        startClaim: null,
        dueClaim: null,
        // "no claimed dates" would be false of a ticket carrying a "Filed on".
        note: customClaims.length > 0 ? NO_DAY_CLAIMS_NOTE : NO_DATES_NOTE,
        customClaims,
      },
    };
  }

  const rowsWithEpic: Array<{ epicId: string | null; row: TimelineRow }> = [];
  const sideList: TimelineSideEntry[] = [];
  for (const input of visible) {
    const placement = classify(input);
    if (placement.kind === 'row') rowsWithEpic.push({ epicId: placement.epicId, row: placement.row });
    else if (placement.kind === 'side') sideList.push(placement.entry);
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
   * `TIMELINE_SIDE_LIST_COPY` says a ticket needs "a start and a due date" to
   * be placed — a leaving condition that a
   * `start-after-due` entry already satisfies while sitting in the list, and
   * that an `unplaceable-day` entry can satisfy too. So the exhaustive
   * sentence is reached only when every entry really is here for a missing
   * claim, exactly as `emptyCopy` reaches `CALENDAR_ALL_HIDDEN_COPY` only when
   * nothing the MODEL narrowed was removed from this grid. ⚠ **"The model
   * narrowed" is load-bearing and narrower than "the legend is the only cause":
   * the calendar's gate cannot see the page's upstream pruning, so that
   * sentence is reachable while false today.** See `calendar-model.ts`'s
   * precedence note; do not restate the condition here as exclusivity.
   */
  // THREE sentences, each true of every entry under it (UX fixes T8, 23.143): "no dates yet" is false of a ticket
  // that has one date, and the leaving-condition sentence is false of a start-after-due entry.
  const sideListCopy = !sideList.every((entry) => MISSING_CLAIM_REASONS.has(entry.reason))
    ? TIMELINE_SIDE_LIST_UNDRAWABLE_COPY
    : sideList.length > 0 && sideList.every((entry) => entry.reason === 'no-dates')
      ? TIMELINE_SIDE_LIST_NO_DATES_COPY
      : TIMELINE_SIDE_LIST_COPY;

  const hasContent = groups.length > 0 || sideList.length > 0;
  const emptyCopy = hasContent ? null : TIMELINE_EMPTY_COPY;

  // `today` is a day the shell vetted (`istDayOf`); a malformed or foreign string must not reach `dateMs`, which throws.
  const todayDay = opts.today !== undefined && isCalendarDay(opts.today) ? dayNumberOf(opts.today) : null;

  let firstDay: number | null = null;
  let lastDay: number | null = null;
  for (const group of groups) {
    for (const row of group.rows) {
      firstDay = firstDay === null ? row.startDay : Math.min(firstDay, row.startDay);
      lastDay = lastDay === null ? row.endDay : Math.max(lastDay, row.endDay);
    }
  }
  return { todayDay, firstDay, lastDay, groups, sideList, sideListCopy, emptyCopy };
}
