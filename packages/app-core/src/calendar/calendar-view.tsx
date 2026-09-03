import { useMemo, useState } from 'react';
import { IST_DAY_REGEX } from '@gisik-nokma/domain';
import type { WeekDays } from '../claims/dates.js';
import type { UserNameFn } from '../claims/claim-labels.js';
import type { TicketDatesInput } from '../claims/ticket-dates.js';
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
 * the shell's call in full, and the scanner reddened on
 * `calendar/calendar-view.tsx:29` for the bare no-argument `Date` constructor
 * inside the quotation — which is the behaviour its own controls pin down. It
 * reads source text, not intent, so the ban is described in this file rather
 * than spelled.
 */

export type CalendarViewProps = {
  tickets: TicketDatesInput[];
  /** The IST day, injected by the shell. See the clock note above. */
  today: string;
  userName: UserNameFn;
  onOpenTicket: (ticketId: string) => void;
  filter?: FilterSpec;
  laneEpicId?: string | null;
  initialMonth?: CalendarMonth;
};

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
        hiddenCustomFieldIds,
      }),
    [props.tickets, props.userName, props.filter, props.laneEpicId, month, hiddenCustomFieldIds],
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
        <button type="button" className="gn-calendar__nav" onClick={() => moveTo(monthOf(props.today))}>
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
        The model chose the sentence and it is rendered VERBATIM. Three arms —
        nothing claimed, everything hidden by the legend, everything behind a
        filter or a lane — because they are three different facts, and one
        sentence over all three would tell a viewer their own claimed month
        holds no claims. There is deliberately no bare "nothing here" branch.
      */}
      {model.emptyCopy !== null && (
        <p role="note" className="gn-calendar__empty">
          {model.emptyCopy}
        </p>
      )}

      {/* Rendered only when it has a row: an empty legend is chrome, and chrome
          that says nothing is noise. */}
      {model.customDateFields.length > 0 && (
        <fieldset className="gn-calendar__legend" aria-label="Claimed date fields">
          {model.customDateFields.map((field) => (
            <label key={field.fieldId} className="gn-calendar__legend-row">
              <input
                type="checkbox"
                checked={!hiddenFields.has(field.fieldId)}
                onChange={() => toggleField(field.fieldId)}
              />
              {/* The field's own name, never a paraphrase, and the count — so a
                  switched-off field still says how much it is hiding, which is
                  what makes hiding visibly reversible. */}
              {field.fieldName} ({field.count})
            </label>
          ))}
        </fieldset>
      )}

      {model.weeks.map((week, weekIndex) => {
        const expanded = expandedWeeks.has(weekIndex);
        const visibleItems = expanded ? week.items : week.items.slice(0, MAX_VISIBLE_PER_WEEK);
        const folded = week.items.length - visibleItems.length;
        return (
          <section key={week.days[0]} className="gn-calendar__week" data-week={week.days[0]}>
            <div className="gn-calendar__days">
              {week.days.map((day) => {
                const isToday = day === props.today;
                const outside = day.slice(0, 7) !== currentMonthKey;
                return (
                  <div
                    key={day}
                    className={[
                      'gn-calendar__day',
                      isToday ? 'gn-calendar__day--today' : '',
                      outside ? 'gn-calendar__day--outside' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    data-day={day}
                    data-today={isToday ? 'true' : undefined}
                    data-outside={outside ? 'true' : undefined}
                    aria-current={isToday ? 'date' : undefined}
                  >
                    {Number(day.slice(8))}
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
                return (
                  <li key={key} className="gn-calendar__slot" style={{ gridColumn }}>
                    <button
                      type="button"
                      className={itemClassName(item, unplaceable)}
                      title={item.kind === 'bar' ? item.provenance : item.tooltip}
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
  );
}
