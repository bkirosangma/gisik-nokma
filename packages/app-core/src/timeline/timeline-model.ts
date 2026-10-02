import type { TicketState } from '@gisik-nokma/domain';
import {
  TIMELINE_EMPTY_COPY,
  TIMELINE_OUT_OF_WINDOW_COPY,
  TIMELINE_SIDE_LIST_COPY,
  TIMELINE_SIDE_LIST_NO_DATES_COPY,
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

/**
 * The days a bar covers, as 0-based indexes into the window's days (`weeks.length * 7` of them, the first being the
 * first column's Monday), INCLUSIVE at both ends and clipped to the window (UX fixes T8, 23.142, audit PV-10).
 * `bar` keeps the WEEK columns the grid places the bar in; this is the day inside them, so a bar that ends on a
 * Wednesday is drawn ending on that Wednesday and not on the Sunday that closes its week.
 */
export type TimelineBarDays = { from: number; to: number };

export type TimelineRow = {
  ticketId: string;
  title: string;
  bar: TimelineBarSpan;
  days: TimelineBarDays;
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
  | { kind: 'lane-heading' }
  /** Fully dated, coherent, placeable — and scheduled elsewhere in time. */
  | { kind: 'out-of-window' };

export type TimelineModel = {
  weeks: TimelineWeekCol[];
  /**
   * `today` as a 0-based day index into the window, or `null` when no `today` was passed or it is outside the
   * window. The line is the view's; the model only says which day (it reads no clock — `today` is an input).
   */
  todayDay: number | null;
  groups: TimelineGroup[];
  sideList: TimelineSideEntry[];
  sideListCopy: string;
  /**
   * Why the timeline is empty, or null when it is not. **TWO sentences as of
   * 2026-09-20** (it was three) — the same construction
   * `CalendarModel.emptyCopy` was given, for the same reason, and trimmed by
   * the same owner ruling.
   *
   * ⚠ **THE MEASUREMENT THIS FIELD WAS BUILT ON HAS PARTLY REVERTED, AND THE
   * REVERSION IS RECORDED RATHER THAN QUIETLY RESCOPED.** Measured before this
   * field existed, anchor `2026-08-23`: `model([])`, a filter matching nobody,
   * an unmatched `laneEpicId`, and work that is fully dated but wholly outside
   * the window all serialised to the SAME bytes — four emptinesses, one screen.
   * The three sentences made that three distinct models; deleting the narrowing
   * one (`TIMELINE_NARROWED_COPY`, owner ruling 2026-09-20, *"delete the copy"*)
   * takes it back to TWO. **A filter that matched nobody and a workless
   * workspace are one model again** — the collapse this field was added to end.
   *
   * What replaces the lost distinction is that the surviving sentence NAMES the
   * filter, so the reader is still pointed at the control that would bring the
   * work back; and the `narrowedAway` guard that survives is what still keeps
   * the window sentence from carrying the both-case. Both are witnessed, the
   * collapse included as an asserted count, at `timeline-model.test.ts` 11.61.
   *
   * The window miss is the case Task 11 CANNOT reconstruct: its props carry
   * `tickets`, `filter` and `laneEpicId` and nothing about the window, so a
   * component asked to work it out would have to restate the day arithmetic —
   * a second statement of where the window is, free to disagree with this
   * one's. See the precedence note at the bottom of `buildTimelineModel`.
   */
  emptyCopy: string | null;
};

export type TimelineModelOptions = {
  /** An IST day, injected like `anchor` — never read from a device. Absent: no today line. */
  today?: string;
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

  function weekIndexOf(isoDay: string): number {
    return Math.floor((dateMs(isoDay) - dateMs(windowStart)) / (7 * DAY_MS));
  }

  /** The 0-based day of the window an IST day falls on (the claimed day is a real day by the time it is asked). */
  function dayIndexOf(isoDay: string): number {
    return Math.round((dateMs(isoDay) - dateMs(windowStart)) / DAY_MS);
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

  /**
   * Claims in, placement out — the ONE construction, deliberately called twice.
   *
   * The second call is over the tickets a filter or a lane removed, and it
   * exists so `emptyCopy` can tell "nobody claimed a period here" apart from
   * "your filter removed all of them". That question has to be answered by
   * running the SAME classification: a cheaper "did it have both dates"
   * shortcut would answer a different question from the one the rows answer,
   * and the two would drift. `calendar-model.ts`' `collectItems` carries the
   * same note for the same reason.
   */
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
     * and would reach `weekIndexOf`, where `dateMs` throws — blanking the
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
      // Side-list membership is about missing claims; the WINDOW is about
      // where a span is drawn. A fully-dated ticket outside it appears
      // nowhere on the grid — navigation reaches it, it is scheduled, just
      // not here. Said in `emptyCopy` when there is nothing else to show.
      if (due.date < windowStart || start.date > windowEnd) return { kind: 'out-of-window' };
      const clippedStart = start.date < windowStart;
      const clippedEnd = due.date > windowEnd;
      return {
        kind: 'row',
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
          days: {
            from: clippedStart ? 0 : dayIndexOf(start.date),
            to: clippedEnd ? weeksCount * 7 - 1 : dayIndexOf(due.date),
          },
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
  /** Visible work that is dated, coherent, placeable — and simply elsewhere. */
  let outOfWindow = false;
  for (const input of visible) {
    const placement = classify(input);
    if (placement.kind === 'row') rowsWithEpic.push({ epicId: placement.epicId, row: placement.row });
    else if (placement.kind === 'side') sideList.push(placement.entry);
    else if (placement.kind === 'out-of-window') outOfWindow = true;
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

  /**
   * Would the work a narrowing removed have appeared HERE?
   *
   * Measured by running the same `classify` over the removed inputs, and it
   * counts only a `row` or a `side` — a filtered-out ticket that would ALSO
   * have missed the window has not been kept off screen by the filter, and
   * blaming the filter for it would be its own small lie. That is the
   * mirror-image discipline `calendar-model.ts` keeps with `narrowedOutOfGrid`.
   *
   * Reference identity, not ids: two inputs may legitimately carry the same
   * ticket id (the ordering fixtures do), and an id-keyed exclusion would drop
   * the wrong one. `visible` is `inputs.filter(...)`, so the survivors ARE the
   * input objects.
   *
   * Computed only when the screen is empty AND something was actually narrowed
   * away — otherwise this is a second full classification nobody reads.
   *
   * SAFE TO RUN OVER UNFILTERED INPUT because the placeability guard travels
   * INSIDE `classify`: an unplaceable day is answered before any branch
   * reaches `weekIndexOf`, where `dateMs` throws. Hoisting that guard out of
   * `classify` — into the `visible` loop, say — would leave this second call
   * running arithmetic on days that are not days, and one such claim anywhere
   * in the workspace would blank the whole timeline. That is the defect the
   * guard was added for; it is unreachable here only because of where it sits.
   */
  const survived = new Set<TicketDatesInput>(visible);
  const excluded =
    hasContent || visible.length === inputs.length
      ? []
      : inputs.filter((input) => !survived.has(input));
  const narrowedAway = excluded
    .map((input) => classify(input))
    .some((placement) => placement.kind === 'row' || placement.kind === 'side');

  /**
   * PRECEDENCE, and like the calendar's it is a truth condition, not a taste.
   *
   * `narrowedAway` still comes FIRST, and it now guards the arm it steers to
   * rather than one of its own. It was written for the sentence that said so —
   * a filter that removed work which would have shown here, while what survived
   * is merely out of window, is a screen a wider filter would fill, and saying
   * only "it's outside these weeks" would send the viewer to the wrong control.
   * ⚠ **That sentence was deleted on 2026-09-20** (owner ruling: *"delete the
   * copy"* — it named "the LANE", a word no screen in this product shows, and
   * no app could render it). Deleting the CONSTANT did not require deleting the
   * GUARD: `!narrowedAway` is what keeps `TIMELINE_OUT_OF_WINDOW_COPY` — which
   * is deliberately NOT exhaustive, and which is exactly why it is safe to
   * reach with a filter still live — from carrying the both-case. Its own
   * disjunction is now `TIMELINE_EMPTY_COPY`'s third sentence.
   *
   * `TIMELINE_OUT_OF_WINDOW_COPY` is therefore reached only when no narrowing
   * removed work that would have shown here: a filter can remove work that
   * would ALSO have missed the window, leaving `narrowedAway` false and this
   * arm reached with two narrowings in play, which is the case its
   * non-exhaustive wording is written for.
   *
   * `TIMELINE_EMPTY_COPY` is reached otherwise — every loaded ticket is an
   * undated epic (a lane, not missing work) or there are none, OR a narrowing
   * removed work that would have shown here. So "no claimed dates are here to
   * draw" holds of the CHART, and it does NOT say "no work is here": an undated
   * epic IS work, and it is still a lane. Its third sentence names the set of
   * narrowings, because this arm can no longer be told apart from a filter
   * emptying the chart — the page narrows `tickets` upstream, so `visible ===
   * inputs` in every app.
   */
  const emptyCopy = hasContent
    ? null
    : outOfWindow && !narrowedAway
      ? TIMELINE_OUT_OF_WINDOW_COPY
      : TIMELINE_EMPTY_COPY;

  // `today` is a day the shell vetted (`istDayOf`); a malformed or foreign string must not reach `dateMs`, which throws.
  const todayDay =
    opts.today !== undefined && isCalendarDay(opts.today) && opts.today >= windowStart && opts.today <= windowEnd
      ? dayIndexOf(opts.today)
      : null;
  return { weeks, todayDay, groups, sideList, sideListCopy, emptyCopy };
}
