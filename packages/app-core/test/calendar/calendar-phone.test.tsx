import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TicketState } from '@gisik-nokma/domain';
import type { TicketDatesInput } from '../../src/claims/ticket-dates.js';
import { CalendarView, PHONE_MAX_MARKS } from '../../src/calendar/calendar-view.js';
import { PHONE_BOARD_QUERY } from '../../src/views/use-phone-board.js';

/**
 * UX fixes follow-up F-4 (neo-refresh, owner 2026-10-02, audit PV-05 + N1) — cases 23.260–23.264 and 23.269: the calendar on a
 * PHONE draws its items as MARKS (a dot for a single day, a thin line across a span, never text) and lists the
 * selected day's items in a full-width AGENDA under the grid.
 *
 * jsdom lays nothing out, so the phone is a stubbed `matchMedia` answering the one query the view reads
 * (`PHONE_BOARD_QUERY`, the same `(max-width: 40rem)` the stylesheet's arm spells — 21.040 polices the spelling).
 * The stylesheet half is `apps/web/test/project-views-ux.test.ts` (23.266, 23.267); the frame is 23.268.
 */
const names: Record<string, string> = { user_kiro: 'Kiro' };
const userName = (id: string): string => names[id] ?? id;

function claimField(value: unknown) {
  return { value, actorId: 'user_kiro', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' };
}

let counter = 0;
function ticket(title: string, key: string | null, fields: TicketState['fields']): TicketDatesInput {
  counter += 1;
  const state: TicketState = {
    kind: 'ticket',
    id: `t${counter}`,
    workspaceId: 'ws_1',
    projectId: 'p1',
    typeId: 'task',
    parentId: null,
    workflowId: 'wf_basic',
    workflowVersion: 1,
    stateId: 'doing',
    stateCategory: 'active',
    assigneeId: null,
    collaboratorIds: [],
    fields: { title: claimField(title), ...fields },
    transitions: [],
  };
  return { state, pendingFieldIds: [], customDateFields: [], key };
}
const due = (title: string, key: string | null, day: string) => ticket(title, key, { dueDate: claimField({ date: day }) });
const span = (title: string, key: string | null, start: string, end: string) =>
  ticket(title, key, { startDate: claimField({ date: start }), dueDate: claimField({ date: end }) });

function viewport(phone: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: query === PHONE_BOARD_QUERY ? phone : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

/** A Sunday in the Aug-2026 grid's fourth row (2026-08-17 … 2026-08-23). */
const TODAY = '2026-08-23';

function renderCalendar(tickets: TicketDatesInput[], extra: { today?: string; onOpenTicket?: (id: string) => void } = {}) {
  const onOpenTicket = extra.onOpenTicket ?? vi.fn();
  render(<CalendarView tickets={tickets} today={extra.today ?? TODAY} userName={userName} onOpenTicket={onOpenTicket} />);
  return onOpenTicket;
}

const cell = (day: string): HTMLElement => document.querySelector(`[data-day="${day}"]`) as HTMLElement;
const dayButton = (day: string): HTMLElement => within(cell(day)).getByRole('button');
const agenda = (): HTMLElement => document.querySelector('.gn-calendar__agenda') as HTMLElement;

beforeEach(() => viewport(true));
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('23.260 on a phone an item is a mark, not text: a dot for one day, a thin line across a span', () => {
  it('23.260 a marker is a dot in its day cell and a bar is a textless line; no chip is drawn; the desktop control still draws chips', () => {
    renderCalendar([due('Marker', 'CCSO-1', '2026-08-20'), span('Spanner', 'CCSO-2', '2026-08-19', '2026-08-26')]);
    // The dot sits INSIDE the day it names…
    expect(cell('2026-08-20').querySelectorAll('.gn-calendar__dot')).toHaveLength(1);
    expect(cell('2026-08-21').querySelectorAll('.gn-calendar__dot')).toHaveLength(0);
    // …a bar is lines, one per week row it crosses, and neither mark carries any text.
    const lines = document.querySelectorAll('.gn-calendar__line');
    expect(lines).toHaveLength(2);
    for (const mark of [...lines, ...document.querySelectorAll('.gn-calendar__dot')]) {
      expect(mark.textContent).toBe('');
      expect(mark.getAttribute('aria-hidden') ?? mark.closest('[aria-hidden="true"]')?.getAttribute('aria-hidden')).toBe('true');
    }
    expect(document.querySelectorAll('.gn-calendar__item')).toHaveLength(0);

    // CONTROL — the same data on a desktop viewport: chips, and no dot, no line, no agenda.
    cleanup();
    viewport(false);
    renderCalendar([due('Marker', 'CCSO-1', '2026-08-20'), span('Spanner', 'CCSO-2', '2026-08-19', '2026-08-26')]);
    expect(document.querySelectorAll('.gn-calendar__item').length).toBeGreaterThan(0);
    expect(document.querySelectorAll('.gn-calendar__dot, .gn-calendar__line, .gn-calendar__agenda')).toHaveLength(0);
  });

  it('23.260 a line covers its clipped columns: Wed to Sun in the first row, Mon to Wed in the second', () => {
    renderCalendar([span('Spanner', 'CCSO-2', '2026-08-19', '2026-08-26')]);
    const [first, second] = [...document.querySelectorAll<HTMLElement>('.gn-calendar__line')];
    expect(first?.closest('li')).toHaveStyle({ gridColumn: '3 / 8' });
    expect(second?.closest('li')).toHaveStyle({ gridColumn: '1 / 4' });
  });
});

describe('23.261 the day agenda lists EVERY item active on the selected day, and a span on every day it covers', () => {
  const SPANNER = span('Which GST scheme is the firm on', 'CCSO-4', '2026-08-28', '2026-09-01');

  it('23.261 tapping a day lists its markers and spans in full: key, title, and for a span its range and "day k of n"', () => {
    renderCalendar([SPANNER, due('Pay the filing fee', 'CCSO-7', '2026-08-30')], { today: '2026-08-20' });
    fireEvent.click(dayButton('2026-08-30'));
    const rows = within(agenda()).getAllByRole('button');
    expect(rows).toHaveLength(2);
    const text = rows.map((r) => r.textContent ?? '').join('\n');
    expect(text).toContain('CCSO-4');
    expect(text).toContain('Which GST scheme is the firm on');
    expect(text).toContain('28 Aug → 1 Sep (day 3 of 5)');
    expect(text).toContain('CCSO-7 Pay the filing fee');
    expect(text).toContain("needed by 30 Aug, Kiro's claim");

    // The span is listed under EVERY covered day, with its own position, and under none outside it. The span
    // crosses a week boundary (28 Aug is Fri, 1 Sep is Tue): both halves of the grid answer.
    const position = (day: string): string | null => {
      fireEvent.click(dayButton(day));
      const row = within(agenda()).queryByRole('button', { name: /CCSO-4/ });
      return row === null ? null : (row.textContent ?? '').match(/\(day \d of 5\)/)?.[0] ?? '';
    };
    expect(['2026-08-27', '2026-08-28', '2026-08-29', '2026-08-30', '2026-08-31', '2026-09-01', '2026-09-02'].map(position)).toEqual([
      null,
      '(day 1 of 5)',
      '(day 2 of 5)',
      '(day 3 of 5)',
      '(day 4 of 5)',
      '(day 5 of 5)',
      null,
    ]);
  });

  it('23.261 each agenda row opens its ticket, the same as a chip does today', () => {
    const input = due('Pay the filing fee', 'CCSO-7', '2026-08-30');
    const onOpenTicket = renderCalendar([input], { today: '2026-08-30' });
    fireEvent.click(within(agenda()).getByRole('button', { name: /CCSO-7 Pay the filing fee/ }));
    expect(onOpenTicket).toHaveBeenCalledWith(input.state.id);
  });

  it('23.261 an empty day says so; an unkeyed ticket reads as its title alone', () => {
    renderCalendar([due('Offline one', null, '2026-08-30')], { today: '2026-08-23' });
    expect(agenda()).toHaveTextContent('No dates claimed for 23 Aug');
    fireEvent.click(dayButton('2026-08-30'));
    const row = within(agenda()).getByRole('button');
    expect(row.textContent).toContain('Offline one');
    expect(row.textContent).not.toContain('null');
  });
});

describe('23.262 the selected day: today by default, the 1st when today is not in the month; aria-pressed; a 44px button', () => {
  it('23.262 defaults to today, moves with a tap, and resets on Today and on a month change', () => {
    renderCalendar([due('A', 'CCSO-1', '2026-08-23')]);
    expect(dayButton('2026-08-23')).toHaveAttribute('aria-pressed', 'true');
    expect(dayButton('2026-08-22')).toHaveAttribute('aria-pressed', 'false');
    // The gridcell keeps `aria-current="date"` for TODAY (11.64) — selection is a different fact.
    expect(cell('2026-08-23')).toHaveAttribute('aria-current', 'date');
    expect(agenda()).toHaveTextContent('CCSO-1');

    fireEvent.click(dayButton('2026-08-22'));
    expect(dayButton('2026-08-22')).toHaveAttribute('aria-pressed', 'true');
    expect(dayButton('2026-08-23')).toHaveAttribute('aria-pressed', 'false');
    expect(cell('2026-08-22')).not.toHaveAttribute('aria-current');
    expect(agenda()).not.toHaveTextContent('CCSO-1');

    // Next month: today is not in it, so the 1st is selected.
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(dayButton('2026-09-01')).toHaveAttribute('aria-pressed', 'true');
    expect(document.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
    // Today returns to the month AND to today.
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(dayButton('2026-08-23')).toHaveAttribute('aria-pressed', 'true');
  });

  it('23.262 the day button names the full date and its item count', () => {
    renderCalendar([due('A', 'CCSO-1', '2026-08-20'), due('B', 'CCSO-2', '2026-08-20')]);
    expect(dayButton('2026-08-20')).toHaveAccessibleName('20 Aug 2026, 2 items');
    expect(dayButton('2026-08-21')).toHaveAccessibleName('21 Aug 2026');
  });
});

describe('23.263 more than three marks fold to "+n", in the model\'s order, and the agenda still lists every one', () => {
  it('23.263 a day with five markers draws three dots and "+2"; a row with four spans draws three lines and "+1"', () => {
    expect(PHONE_MAX_MARKS).toBe(3);
    const five = ['A', 'B', 'C', 'D', 'E'].map((t, i) => due(`Marker ${t}`, `CCSO-${i + 1}`, '2026-08-20'));
    renderCalendar(five);
    expect(cell('2026-08-20').querySelectorAll('.gn-calendar__dot')).toHaveLength(3);
    expect(cell('2026-08-20').querySelector('.gn-calendar__more')).toHaveTextContent('+2');
    // A day at exactly the cap folds nothing (the boundary: three dots, no "+0").
    cleanup();
    renderCalendar(five.slice(0, 3));
    expect(cell('2026-08-20').querySelectorAll('.gn-calendar__dot')).toHaveLength(3);
    expect(cell('2026-08-20').querySelector('.gn-calendar__more')).toBeNull();

    // The agenda is where nothing folds.
    cleanup();
    renderCalendar(five, { today: '2026-08-20' });
    expect(within(agenda()).getAllByRole('button')).toHaveLength(5);

    // Lines: four spans in one row — three lines and a "+1" in the row, the first three in the MODEL's order
    // (11.65: the fold takes the order as given and never re-ranks), and the agenda lists all four.
    cleanup();
    const spans = ['A', 'B', 'C', 'D'].map((t, i) => span(`Span ${t}`, `CCSO-${i + 1}`, '2026-08-18', '2026-08-21'));
    renderCalendar(spans, { today: '2026-08-19' });
    const week = document.querySelector('[data-week="2026-08-17"]') as HTMLElement;
    expect(week.querySelectorAll('.gn-calendar__line')).toHaveLength(3);
    expect(week.querySelector('.gn-calendar__more')).toHaveTextContent('+1');
    const drawn = [...week.querySelectorAll('.gn-calendar__line')].map((l) => l.getAttribute('data-ticket'));
    expect(drawn).toEqual(spans.slice(0, 3).map((s) => s.state.id));
    expect(within(agenda()).getAllByRole('button')).toHaveLength(4);
  });
});

describe('23.264 a claim on an impossible day has no day: it shows in the agenda under the week\'s first day, verbatim', () => {
  it('23.264 the dot and the agenda row sit on that week\'s Monday and carry the claimed text; no other day lists it', () => {
    renderCalendar([due('Impossible', 'CCSO-9', '2026-02-30')], { today: '2026-02-15' });
    // 2026-02-30 sorts into the row 23 Feb – 1 Mar; its first day is Monday 23 Feb.
    const monday = cell('2026-02-23');
    expect(monday.querySelectorAll('.gn-calendar__dot[data-unplaceable="true"]')).toHaveLength(1);
    expect(cell('2026-02-24').querySelectorAll('.gn-calendar__dot')).toHaveLength(0);
    fireEvent.click(dayButton('2026-02-23'));
    const row = within(agenda()).getByRole('button', { name: /CCSO-9 Impossible/ });
    expect(row).toHaveAttribute('data-unplaceable', 'true');
    expect(row.textContent).toContain('2026-02-30');
    // CONTROL — the next day lists nothing, so the claim is not smeared across the week.
    fireEvent.click(dayButton('2026-02-24'));
    expect(within(agenda()).queryAllByRole('button')).toHaveLength(0);
    expect(document.querySelector('[data-day="2026-02-30"]')).toBeNull();
  });
});

describe('23.269 a bar carries its ticket key, so the agenda can name it', () => {
  it('23.269 the calendar model\'s bar holds `key` (the marker has since 23.140), null for an unkeyed ticket', async () => {
    const { buildCalendarModel } = await import('../../src/calendar/calendar-model.js');
    const build = (input: TicketDatesInput) =>
      buildCalendarModel([input], { year: 2026, month: 8, userName }).weeks.flatMap((w) => w.items).filter((i) => i.kind === 'bar');
    expect(build(span('K', 'CCSO-2', '2026-08-19', '2026-08-26')).map((b) => (b.kind === 'bar' ? b.key : 'x'))).toEqual(['CCSO-2', 'CCSO-2']);
    expect(build(span('K', null, '2026-08-19', '2026-08-26')).map((b) => (b.kind === 'bar' ? b.key : 'x'))).toEqual([null, null]);
  });
});
