import { useId, useMemo, useState } from 'react';
import { IST_DAY_REGEX } from '@gisik-nokma/domain';
import type { WeekDays } from '../claims/dates.js';
import type { UserNameFn } from '../claims/claim-labels.js';
import { formatDate } from '../provenance.js';
import type { TicketDatesInput } from '../claims/ticket-dates.js';
import type { IsEpicType } from '../hierarchy/epic-ancestor.js';
import type { FilterSpec } from '../view-types.js';
import { buildCalendarModel, type CalendarItem, type CalendarMonth } from './calendar-model.js';

/**
 * The month grid, over Task 8's landed model. Everything this component owns
 * is ARRANGEMENT: which month is on screen, which weeks are unfolded, which
 * custom date fields are switched off. Nothing here decides what a claim is,
 * what it says, or whether a month is empty — those are the model's answers
 * and they are rendered verbatim.
 *
 * ## No colour literal, and no `tokens.color.*` either
 *
 * The plan writes `tokens.color.ink`, `tokens.space.md` and eleven more names
 * in this file; `@gisik-nokma/ui` exports no `tokens` object. It exports a
 * ROLE system, and the way a shipped component in this repo reaches it is a
 * BEM class whose colours resolve to `var(--gn-…)` in `packages/ui/src/ui.css`
 * (see `.gn-state-node`, `.gn-board`, `.gn-attention`). So: classes here, CSS
 * there, and the only inline style in this file is `grid-column`, which is a
 * COMPUTED position and cannot be a class.
 *
 * ## NO CLOCK IS READ HERE
 *
 * `today` is a prop. The mounting shell reads the device's INSTANT — a fact
 * the device owns — and hands it to the domain's `istDayOf`, which is the one
 * place in the product that turns an instant into a day (owner decision: a day
 * starts at IST midnight). Never `toLocaleDateString()`, never an ISO string
 * sliced to ten characters: the first rings a collaborator's own timezone and
 * the second rings yesterday for five and a half hours every night. Because
 * `today` and the model's cells are both IST day strings the ring is a plain
 * `===`, and `test/calendar/clock-free.test.ts` scans this file's source to
 * keep it that way.
 *
 * That scan is not decoration here: the first draft of this docblock QUOTED
 * the shell's call in full, and the scanner reddened on this file for the bare
 * no-argument `Date` constructor inside the quotation — which is the behaviour
 * its own controls pin down. It reads source text, not intent, so the ban is
 * described in this file rather than spelled. (No line number is cited: it
 * would be a fact about a file state that no longer exists, and it would rot on
 * the next edit above it.)
 */

export type CalendarViewProps = {
  tickets: TicketDatesInput[];
  /** The IST day, injected by the shell. See the clock note above. */
  today: string;
  userName: UserNameFn;
  onOpenTicket: (ticketId: string) => void;
  filter?: FilterSpec;
  laneEpicId?: string | null;
  /**
   * WHAT THIS WORKSPACE CALLS AN EPIC — forwarded UNCHANGED, never defaulted here.
   *
   * `buildCalendarModel` states the default (`isBuiltinEpicType`, the built-in
   * `epic` id) and `epic-ancestor.ts` states why that default is narrower than
   * the server's rule: the server groups by RANK 1, so a workspace whose rank-1
   * type is "Initiative" has epics an id-matching client calls "No epic". A
   * `?? isBuiltinEpicType` in this file would be a second statement of the same
   * default, free to drift from the model's.
   *
   * Both this view and `TimelineView` gained the prop in the same change, and
   * that is the point rather than tidiness: the model beneath each has accepted
   * `isEpicType` since Tasks 8 and 10, and neither view forwarded it — so a
   * shell could not narrow either lane. Fixing ONE would be worse than fixing
   * neither: the calendar and the timeline would answer differently about the
   * same ticket's epic on two tabs of one page.
   */
  isEpicType?: IsEpicType;
  /**
   * THE OWNER'S RULING (2026-09-20): an epic draws a row in the List and
   * nowhere else, so this view does not draw the epic's own claimed dates.
   * Forwarded UNCHANGED, never defaulted here — `buildCalendarModel`'s
   * `hideEpicRows` states what the flag means, why it is opt-in, and why the
   * calendar has no lane-heading half of the question to answer.
   */
  hideEpicRows?: boolean;
  initialMonth?: CalendarMonth;
};

/**
 * How many of a week's items are drawn before the row folds.
 *
 * The fold takes the MODEL'S ORDER AS GIVEN and truncates it — it does not
 * re-rank, and it must not, because the model's order is the one the whole
 * suite pins (bars first, then by day, then ticket id, then which claim). One
 * consequence is worth stating rather than leaving to be discovered: bars sort
 * ahead of markers, so a week carrying four or more bars folds every marker in
 * that row. That is a FOLD, not a drop — `+n more` appears whenever anything is
 * folded and reveals exactly what it hid — and it is witnessed at
 * `calendar-view.test.tsx` 11.65, "the fold takes the model's order as given".
 * A view that re-sorted to keep one of each kind on screen would be a second
 * opinion about item order living one layer above the one the model states.
 */
export const MAX_VISIBLE_PER_WEEK = 4;

/**
 * The heading's month names, and they are NOT the drift `claim-labels.ts`
 * forbids. That file refuses a second `MONTH_SHORT` table because every
 * claimed DATE must print the way the domain's one instant renderer prints it
 * — three clients, one spelling of "30 Aug". These are the full names of a
 * grid HEADING, which names no claim and renders no date; the short-name route
 * stays the only way a claim reaches the screen.
 */
const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/**
 * The weekday head's labels — board prototype port Task 10 (2026-09-16), spec
 * Calendar `:477-504`, "Weekday head" row. `week.days` runs Monday through
 * Sunday (`calendar-model.js`'s own week construction, pinned by
 * `calendar-view.test.tsx` 11.71's "labels each row by its own Monday" and by
 * every `gridColumn` assertion in this suite — column 5 is Friday, column 2 is
 * Tuesday), so this label row is Monday-first too: labelling column 1 "Sun"
 * would put every weekday name one column off from the numbers underneath it.
 */
const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

/**
 * P20: the full name behind each abbreviated weekday-head label, for the
 * `columnheader`'s `aria-label` — a three-letter abbreviation read aloud by a
 * screen reader is easy to mishear ("Tue" as "Toe"), and the full word costs
 * nothing the visible header still shows the short form.
 */
const WEEKDAY_FULL_NAMES: Record<(typeof WEEKDAY_LABELS)[number], string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
};

function monthLabel(month: CalendarMonth): string {
  const name = MONTH_NAMES[month.month - 1];
  // Refused rather than coerced, the way `monthGridWeeks` refuses its bounds:
  // an out-of-range month would otherwise head a real grid with `undefined`.
  if (name === undefined) throw new RangeError(`not a calendar month: ${month.year}-${month.month}`);
  return `${name} ${month.year}`;
}

/**
 * The month a day belongs to. The shape check is the domain's single
 * `IST_DAY_REGEX` — no local copy, and no silent `NaN` month heading a grid.
 */
function monthOf(isoDay: string): CalendarMonth {
  if (!IST_DAY_REGEX.test(isoDay)) throw new RangeError(`not a YYYY-MM-DD day: ${isoDay}`);
  return { year: Number(isoDay.slice(0, 4)), month: Number(isoDay.slice(5, 7)) };
}

function previousMonth(month: CalendarMonth): CalendarMonth {
  return month.month === 1
    ? { year: month.year - 1, month: 12 }
    : { year: month.year, month: month.month - 1 };
}

function nextMonth(month: CalendarMonth): CalendarMonth {
  return month.month === 12
    ? { year: month.year + 1, month: 1 }
    : { year: month.year, month: month.month + 1 };
}

function monthKey(month: CalendarMonth): string {
  return `${String(month.year).padStart(4, '0')}-${String(month.month).padStart(2, '0')}`;
}

/**
 * The `grid-column` this item occupies in this week — or `null` when the day
 * it claims is not one of the week's seven.
 *
 * THAT SECOND CASE IS REACHABLE, and the plan's `days.indexOf(date) + 1` got
 * it wrong silently. `IST_DAY_REGEX` is a shape check, so `2026-02-30` is a
 * storable claim; the model places it by string comparison, which puts it in
 * the row running 23 Feb – 1 Mar, where `indexOf` answers `-1` and the plan's
 * arithmetic produced `grid-column: 0 / 1` — a value CSS discards, dropping
 * the claim onto whatever cell the auto-placer reached next. A day nobody
 * claimed, shown as one they did.
 *
 * The honest answer is the week, because the week is all the comparison
 * established: `null` here becomes a row-wide span the caller marks
 * `data-unplaceable`, and the label already carries the impossible day
 * verbatim (`formatClaimDate` refuses to name a month for it).
 */
function weekSpan(item: CalendarItem, days: WeekDays): string | null {
  if (item.kind === 'bar') {
    // Clipped to the row: a bar entering from the previous week starts at the
    // first column, one leaving into the next ends at the last.
    const start = item.start <= days[0] ? 0 : days.indexOf(item.start);
    const end = item.end >= days[6] ? 6 : days.indexOf(item.end);
    return start === -1 || end === -1 ? null : `${start + 1} / ${end + 2}`;
  }
  const index = days.indexOf(item.date);
  return index === -1 ? null : `${index + 1} / ${index + 2}`;
}

function itemClassName(item: CalendarItem, unplaceable: boolean): string {
  const pending = item.kind === 'bar' ? item.pending : item.claim.pending;
  return [
    'gn-calendar__item',
    item.kind === 'bar' ? 'gn-calendar__item--bar' : 'gn-calendar__item--marker',
    item.kind === 'marker' && item.marker === 'custom' ? 'gn-calendar__item--custom' : '',
    pending ? 'gn-calendar__item--pending' : '',
    unplaceable ? 'gn-calendar__item--unplaceable' : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function CalendarView(props: CalendarViewProps) {
  const idPrefix = useId();
  const [month, setMonth] = useState<CalendarMonth>(props.initialMonth ?? monthOf(props.today));
  const [expandedWeeks, setExpandedWeeks] = useState<ReadonlySet<number>>(new Set());
  /**
   * The legend's switches: pure view state, exactly like `expandedWeeks`.
   * Nothing is stored and nothing is fetched — a decision that lasts one
   * glance is not a preference, and a server-side field filter would turn
   * arrangement into a query.
   */
  const [hiddenFields, setHiddenFields] = useState<ReadonlySet<string>>(new Set());

  const hiddenCustomFieldIds = useMemo(() => [...hiddenFields], [hiddenFields]);

  const model = useMemo(
    () =>
      buildCalendarModel(props.tickets, {
        ...month,
        userName: props.userName,
        ...(props.filter === undefined ? {} : { filter: props.filter }),
        ...(props.laneEpicId === undefined ? {} : { laneEpicId: props.laneEpicId }),
        ...(props.isEpicType === undefined ? {} : { isEpicType: props.isEpicType }),
        ...(props.hideEpicRows === undefined ? {} : { hideEpicRows: props.hideEpicRows }),
        hiddenCustomFieldIds,
      }),
    [
      props.tickets,
      props.userName,
      props.filter,
      props.laneEpicId,
      props.isEpicType,
      props.hideEpicRows,
      month,
      hiddenCustomFieldIds,
    ],
  );

  const currentMonthKey = monthKey(month);

  function moveTo(next: CalendarMonth): void {
    setMonth(next);
    // The fold is per grid: a row unfolded in August says nothing about the
    // row that lands in the same position in September.
    setExpandedWeeks(new Set());
  }

  function toggleWeek(index: number): void {
    setExpandedWeeks((current) => {
      const next = new Set(current);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleField(fieldId: string): void {
    setHiddenFields((current) => {
      const next = new Set(current);
      if (next.has(fieldId)) next.delete(fieldId);
      else next.add(fieldId);
      return next;
    });
  }

  return (
    <div className="gn-calendar">
      <header className="gn-calendar__header">
        <button
          type="button"
          className="gn-calendar__nav"
          aria-label="Previous month"
          onClick={() => moveTo(previousMonth(month))}
        >
          ‹
        </button>
        {/* Own class, not `.gn-calendar__nav`: the spec's Calendar table gives
            "Today" a different ground (transparent, not `ctlBg`) from the
            arrow buttons beside it — board prototype port Task 10. */}
        <button type="button" className="gn-calendar__today" onClick={() => moveTo(monthOf(props.today))}>
          Today
        </button>
        <button
          type="button"
          className="gn-calendar__nav"
          aria-label="Next month"
          onClick={() => moveTo(nextMonth(month))}
        >
          ›
        </button>
        <h2 className="gn-calendar__month">{monthLabel(month)}</h2>
      </header>

      {/*
        The model chose the sentence and it is rendered VERBATIM. **TWO arms
        since 2026-09-20** — nothing claimed (and that sentence NAMES the
        narrowings that can also empty a month, since the model cannot tell
        them apart), and everything hidden by the legend — because they are
        different facts, and one sentence over both would tell a viewer their
        own claimed month holds no claims. The third arm went with its sentence
        on the owner's ruling; the model's precedence note says what survived
        and what the guard cannot see.
      */}
      {model.emptyCopy !== null && (
        <p role="note" className="gn-calendar__empty">
          {model.emptyCopy}
        </p>
      )}

      {/*
        Rendered only when it has a row: an empty legend is chrome, and chrome
        that says nothing is noise. Ruling R4 (2026-09-16) merges the
        prototype's legend-CARD visual treatment onto this SAME conditional —
        `Due date`/`In transit` are not a reason to show the legend on their
        own, because they carry no information a hidden field's row doesn't
        already carry better (a live count). The guard therefore stays keyed
        on `model.customDateFields.length`, unchanged from before R4: a month
        with no custom claims still renders no legend at all, verified
        unmodified by `calendar-view.test.tsx` 11.69's third case.
      */}
      {model.customDateFields.length > 0 && (
        <fieldset className="gn-calendar__legend" aria-label="Claimed date fields">
          {model.customDateFields.map((field) => (
            <label key={field.fieldId} className="gn-calendar__legend-row">
              <input
                type="checkbox"
                checked={!hiddenFields.has(field.fieldId)}
                onChange={() => toggleField(field.fieldId)}
              />
              {/* Decorative: the swatch carries the colour, the checkbox
                  carries the control and the text carries the meaning — the
                  same three-way split the grid's own marker glyph uses. */}
              <span
                className="gn-calendar__legend-swatch gn-calendar__legend-swatch--custom"
                aria-hidden="true"
              />
              {/* The field's own name, never a paraphrase, and the count — so a
                  switched-off field still says how much it is hiding, which is
                  what makes hiding visibly reversible. */}
              {field.fieldName} ({field.count})
            </label>
          ))}
          {/*
            R4's own addition: `Due date` and `In transit` join as READ-ONLY
            rows — swatch plus label, deliberately NOT an `<input>` (not even
            a disabled one). Both built-ins already have exactly one legend
            entry apiece across the whole grid (there is no per-field count to
            show and nothing a click could switch off), so a checkbox here
            would offer a control that does nothing — the exact "control that
            lies" shape the rest of this port refuses elsewhere. A `<span>`,
            not a `<label>`, for the same reason: `<label>` with no control
            inside it names nothing.
          */}
          <span className="gn-calendar__legend-row">
            <span
              className="gn-calendar__legend-swatch gn-calendar__legend-swatch--accent"
              aria-hidden="true"
            />
            Due date
          </span>
          <span className="gn-calendar__legend-row">
            <span
              className="gn-calendar__legend-swatch gn-calendar__legend-swatch--pending"
              aria-hidden="true"
            />
            In transit
          </span>
        </fieldset>
      )}

      {/*
        Board prototype port Task 10 (2026-09-16), spec Calendar `:477-504`,
        "Grid" row — `trayBg + trayShadow; radius cardR; padding 1px; 7 cols;
        gap 1px; min-height:420px`. This wrapper carries the tray ground, the
        card radius and the outer floor height; the "7 cols; gap 1px" tracks
        themselves live one level down, on `.gn-calendar__weekday-head` and
        each week's own `.gn-calendar__days` — see that rule's own comment in
        `ui.css` for why. `min-height` is a FLOOR on this whole container, not
        a per-row distribution: this product renders a week's events in a
        separate list below its day numbers rather than inside each day cell
        (the architecture the fold/`gridColumn` contract in this file already
        depends on), so there is no single 42-cell grid to stretch evenly —
        a month with few events shows blank tray below its last week rather
        than six evenly taller rows. DECLARED DIVERGENCE from the prototype's
        own single-grid vocabulary, the same shape `.gn-list__section-title`
        and `.gn-timeline__weeks` already declare for the identical reason.
      */}
      {/*
        P20: the APG calendar-grid pattern's four roles, added as attributes
        to the structure already here — `grid` on this wrapper, `row` on the
        weekday head and on each week, `columnheader`/`gridcell` on the
        labels and the day cells. No markup was reshaped for this: the grid
        already groups grid → weekday-head → week → days → day, exactly the
        shape the pattern asks for.
      */}
      <div className="gn-calendar__grid" role="grid" aria-label="Calendar">
        <div className="gn-calendar__weekday-head" role="row">
          {WEEKDAY_LABELS.map((label) => (
            <span key={label} className="gn-calendar__weekday" role="columnheader" aria-label={WEEKDAY_FULL_NAMES[label]}>
              {label}
            </span>
          ))}
        </div>

        {model.weeks.map((week, weekIndex) => {
          const expanded = expandedWeeks.has(weekIndex);
          const visibleItems = expanded ? week.items : week.items.slice(0, MAX_VISIBLE_PER_WEEK);
          const folded = week.items.length - visibleItems.length;
          return (
            <section
              key={week.days[0]}
              className="gn-calendar__week"
              data-week={week.days[0]}
              role="row"
            >
              <div className="gn-calendar__days">
                {week.days.map((day) => {
                  const isToday = day === props.today;
                  const outside = day.slice(0, 7) !== currentMonthKey;
                  return (
                    <div
                      key={day}
                      // No `--today` modifier class here: the ring it used to
                      // draw moved onto `.gn-calendar__day-number--today`
                      // below, and a class with no rule left to style it is
                      // the exact "reads as doing something, renders nothing"
                      // shape this file's own legend rows were just written
                      // to avoid — `data-today`/`aria-current` already carry
                      // the cell-level signal for both CSS and tests.
                      className={['gn-calendar__day', outside ? 'gn-calendar__day--outside' : '']
                        .filter(Boolean)
                        .join(' ')}
                      role="gridcell"
                      data-day={day}
                      data-today={isToday ? 'true' : undefined}
                      data-outside={outside ? 'true' : undefined}
                      aria-current={isToday ? 'date' : undefined}
                      // E4-28: the day's full date, for the assistive-tech
                      // reader landing on a cell whose only rendered text is
                      // a bare number ("31", "1", "2") with no month or year.
                      aria-label={formatDate(day)}
                    >
                      {/* The spec's "Today ring" — a 24px accent circle around
                          the NUMBER, not an outline around the whole cell (the
                          treatment this replaced). The ring/attribute contract
                          tests key on stays on the outer div: `aria-current`,
                          `data-today`, `data-day` (11.64) — moving those onto
                          this span would be a gratuitous break for no gain. */}
                      <span
                        className={[
                          'gn-calendar__day-number',
                          isToday ? 'gn-calendar__day-number--today' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {Number(day.slice(8))}
                      </span>
                    </div>
                  );
                })}
              </div>

              <ul className="gn-calendar__items">
                {visibleItems.map((item, itemIndex) => {
                  const span = weekSpan(item, week.days);
                  const unplaceable = span === null;
                  // `null` becomes the whole row: "this week", which is all the
                  // string comparison that placed it here established. Never a
                  // column — that would name a day nobody claimed.
                  const gridColumn = span ?? '1 / 8';
                  // Two inputs may legitimately carry the same ticket id, so the
                  // key is positional rather than id-derived.
                  const key = `${itemIndex}:${item.kind}:${item.ticketId}`;
                  const pending = item.kind === 'bar' ? item.pending : item.claim.pending;
                  // E4-28: a bar's rendered text is the ticket title alone —
                  // unlike a marker's `item.label` (see the docblock below),
                  // it names no date at all, and the date lives only in the
                  // `title` attribute, which is not reliably read by
                  // assistive tech (it requires hover, which touch/mobile AT
                  // has no equivalent for). Linked as a DESCRIPTION, not
                  // folded into the accessible NAME `calendar-view.test.tsx`
                  // pins to the ticket title alone — the same ARIA shape
                  // `WorkspaceLinks` already uses and documents
                  // (`apps/web/app/w/[workspaceId]/page.tsx`).
                  const detailId = `${idPrefix}-detail-${week.days[0]}-${itemIndex}`;
                  return (
                    <li key={key} className="gn-calendar__slot" style={{ gridColumn }}>
                      <button
                        type="button"
                        className={itemClassName(item, unplaceable)}
                        title={item.kind === 'bar' ? item.provenance : item.tooltip}
                        {...(item.kind === 'bar' ? { 'aria-describedby': detailId } : {})}
                        data-pending={pending ? 'true' : undefined}
                        data-unplaceable={unplaceable ? 'true' : undefined}
                        {...(item.kind === 'marker' && item.marker === 'custom'
                          ? { 'data-field-id': item.fieldId }
                          : {})}
                        onClick={() => props.onOpenTicket(item.ticketId)}
                      >
                        {item.kind === 'bar' ? (
                          item.title
                        ) : (
                          <>
                            {/* Decorative: the glyph carries the colour, the label
                                carries the meaning, so the accessible name is the
                                claim and nothing else. */}
                            <span className="gn-calendar__glyph" aria-hidden="true">
                              ◆
                            </span>
                            {item.label}
                          </>
                        )}
                      </button>
                      {item.kind === 'bar' && (
                        <span id={detailId} className="gn-visually-hidden">
                          {item.provenance}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>

              {folded > 0 && (
                <button type="button" className="gn-calendar__fold" onClick={() => toggleWeek(weekIndex)}>
                  +{folded} more
                </button>
              )}
              {expanded && week.items.length > MAX_VISIBLE_PER_WEEK && (
                <button type="button" className="gn-calendar__fold" onClick={() => toggleWeek(weekIndex)}>
                  show fewer
                </button>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
