import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TicketState } from '@gisik-nokma/domain';
import {
  CALENDAR_ALL_HIDDEN_COPY,
  CALENDAR_EMPTY_MONTH_COPY,
  CALENDAR_NARROWED_MONTH_COPY,
} from '../../src/claims/claim-labels.js';
import type { TicketDatesInput } from '../../src/claims/ticket-dates.js';
import type { FilterSpec } from '../../src/view-types.js';
import { CalendarView, MAX_VISIBLE_PER_WEEK } from '../../src/calendar/calendar-view.js';

/**
 * 11.61–11.72 — `CalendarView`, the month grid over Task 8's landed model.
 *
 * The fixture is the one from `calendar-model.test.ts`, copied rather than
 * re-invented, and specifically NOT the plan's: the plan's builder omits
 * `kind: 'ticket'` and `workflowVersion` and hides the omission behind an
 * `as TicketState`, which would let this suite compile against a ticket the
 * reducer never produces.
 */

const names: Record<string, string> = { user_kiro: 'Kiro', user_anselma: 'Anselma' };
const userName = (id: string): string => names[id] ?? id;

function claimField(value: unknown, actorId = 'user_kiro') {
  return { value, actorId, clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' };
}

let counter = 0;

function ticket(
  overrides: Partial<TicketState> = {},
  pendingFieldIds: string[] = [],
  customDateFields: readonly { id: string; name: string }[] = [],
): TicketDatesInput {
  counter += 1;
  const base: TicketState = {
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
    fields: { title: claimField(`Ticket ${counter}`) },
    transitions: [],
  };
  return {
    state: { ...base, ...overrides, fields: { ...base.fields, ...overrides.fields } },
    pendingFieldIds,
    customDateFields,
  };
}

/** A Sunday in the Aug-2026 grid's fourth row (2026-08-17 … 2026-08-23). */
const TODAY = '2026-08-23';

function renderCalendar(
  tickets: TicketDatesInput[],
  extra: { onOpenTicket?: (ticketId: string) => void; today?: string; filter?: FilterSpec } = {},
) {
  const onOpenTicket = extra.onOpenTicket ?? vi.fn();
  render(
    <CalendarView
      tickets={tickets}
      today={extra.today ?? TODAY}
      userName={userName}
      onOpenTicket={onOpenTicket}
      {...(extra.filter === undefined ? {} : { filter: extra.filter })}
    />,
  );
  return onOpenTicket;
}

describe('11.61 a marker is a claim, attributed, and it opens its ticket', () => {
  it('renders the attributed label and calls onOpenTicket with the ticket id', () => {
    const input = ticket({
      fields: { title: claimField('DLT'), dueDate: claimField({ date: '2026-08-30' }) },
    });
    const onOpenTicket = renderCalendar([input]);
    const marker = screen.getByRole('button', { name: "needed by 30 Aug — Kiro's claim" });
    fireEvent.click(marker);
    expect(onOpenTicket).toHaveBeenCalledWith(input.state.id);
  });

  it("carries the claim's note in the title attribute, quoted, never paraphrased", () => {
    renderCalendar([
      ticket({
        fields: {
          title: claimField('DLT'),
          dueDate: claimField({ date: '2026-08-30', note: 'after the bank account opens' }, 'user_anselma'),
        },
      }),
    ]);
    expect(screen.getByRole('button', { name: /needed by 30 Aug/ })).toHaveAttribute(
      'title',
      'needed by 30 Aug — Anselma\'s claim · "after the bank account opens"',
    );
  });
});

describe('11.62 a bar is drawn only from a claimed pair, and it spans the days it was claimed for', () => {
  it('spans Monday to Sunday and hangs the pair provenance on the hover', () => {
    renderCalendar([
      ticket({
        fields: {
          title: claimField('Span'),
          startDate: claimField({ date: '2026-08-24' }),
          dueDate: claimField({ date: '2026-08-30' }),
        },
      }),
    ]);
    const bar = screen.getByRole('button', { name: 'Span' });
    expect(bar).toHaveAttribute(
      'title',
      "starts 24 Aug — Kiro's claim · needed by 30 Aug — Kiro's claim",
    );
    // The week 2026-08-24 … 2026-08-30 is exactly the fifth grid row, so the
    // bar covers all seven columns: grid lines 1 through 8.
    expect(bar.closest('li')).toHaveStyle({ gridColumn: '1 / 8' });
  });

  it('clips to the week it is being drawn in rather than overflowing the row', () => {
    renderCalendar([
      ticket({
        fields: {
          title: claimField('Long'),
          startDate: claimField({ date: '2026-08-19' }),
          dueDate: claimField({ date: '2026-08-26' }),
        },
      }),
    ]);
    const [first, second] = screen.getAllByRole('button', { name: 'Long' });
    // 2026-08-19 is the Wednesday of row four (17th–23rd): columns 3 → 8.
    expect(first?.closest('li')).toHaveStyle({ gridColumn: '3 / 8' });
    // 2026-08-26 is the Wednesday of row five (24th–30th): columns 1 → 4.
    expect(second?.closest('li')).toHaveStyle({ gridColumn: '1 / 4' });
  });
});

describe('11.63 the three empty months are three different sentences, rendered verbatim', () => {
  it('nothing claimed: the honesty note, and no item buttons at all', () => {
    renderCalendar([ticket(), ticket()]);
    expect(screen.getByRole('note')).toHaveTextContent(CALENDAR_EMPTY_MONTH_COPY);
    expect(screen.queryAllByRole('button', { name: /claim/ })).toHaveLength(0);
  });

  it('everything hidden by the legend: the sentence that says the switch is one click away', () => {
    const fields = [{ id: 'filed-on', name: 'Filed on' }];
    renderCalendar([
      ticket({ fields: { title: claimField('One'), 'filed-on': claimField('2026-08-11') } }, [], fields),
    ]);
    expect(screen.queryByRole('note')).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Filed on (1)' }));
    expect(screen.getByRole('note')).toHaveTextContent(CALENDAR_ALL_HIDDEN_COPY);
  });

  it('everything behind a filter: the sentence that names the narrowings, not the legend', () => {
    renderCalendar(
      [ticket({ fields: { title: claimField('Filtered'), dueDate: claimField({ date: '2026-08-28' }) } })],
      { filter: { stateIds: ['done'] } },
    );
    expect(screen.getByRole('note')).toHaveTextContent(CALENDAR_NARROWED_MONTH_COPY);
  });
});

describe('11.64 today is a prop — the ring never asks the device what day it is', () => {
  it('rings the day it was handed, and only that day', () => {
    renderCalendar([ticket()]);
    const ringed = document.querySelectorAll('[aria-current="date"]');
    expect(ringed).toHaveLength(1);
    expect(ringed[0]).toHaveAttribute('data-day', TODAY);
    expect(ringed[0]).toHaveAttribute('data-today', 'true');
  });

  it('a different `today` rings a different cell — nothing here is read from a clock', () => {
    renderCalendar([ticket()], { today: '2026-08-10' });
    expect(document.querySelector('[aria-current="date"]')).toHaveAttribute('data-day', '2026-08-10');
    expect(screen.getByRole('heading', { name: 'August 2026' })).toBeInTheDocument();
  });
});

describe('11.65 per-week overflow folds, and folding is reversible', () => {
  it('shows four, folds the rest behind +n more, and unfolds and refolds', () => {
    const inputs = [1, 2, 3, 4, 5].map((n) =>
      ticket({ fields: { title: claimField(`Item ${n}`), dueDate: claimField({ date: '2026-08-28' }) } }),
    );
    renderCalendar(inputs);
    expect(MAX_VISIBLE_PER_WEEK).toBe(4);
    expect(screen.getAllByRole('button', { name: /needed by 28 Aug/ })).toHaveLength(4);
    fireEvent.click(screen.getByRole('button', { name: '+1 more' }));
    expect(screen.getAllByRole('button', { name: /needed by 28 Aug/ })).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'show fewer' }));
    expect(screen.getAllByRole('button', { name: /needed by 28 Aug/ })).toHaveLength(4);
  });

  /**
   * WHAT THE FOLD DROPS FIRST, and it needs its own case because the previous
   * one cannot see it: five markers on one day fold the fifth marker, which
   * tells you nothing about a row that mixes kinds. The model sorts bars ahead
   * of markers, so four bars fill the row and every marker in it folds. The
   * `+n more` control is what makes that recoverable — and the point of
   * asserting it is that the view TAKES the model's order rather than
   * re-ranking to keep one of each kind on screen.
   */
  it("the fold takes the model's order as given — four bars fold the week's markers", () => {
    const inputs = [
      ...[1, 2, 3, 4].map((n) =>
        ticket({
          fields: {
            title: claimField(`Bar ${n}`),
            startDate: claimField({ date: '2026-08-24' }),
            dueDate: claimField({ date: '2026-08-28' }),
          },
        }),
      ),
      ticket({ fields: { title: claimField('Marker'), dueDate: claimField({ date: '2026-08-26' }) } }),
    ];
    renderCalendar(inputs);
    expect(screen.getAllByRole('button', { name: /^Bar \d$/ })).toHaveLength(4);
    expect(screen.queryAllByRole('button', { name: /needed by 26 Aug/ })).toHaveLength(0);
    // Folded, not dropped: the control is present and it reveals what it hid.
    fireEvent.click(screen.getByRole('button', { name: '+1 more' }));
    expect(screen.getAllByRole('button', { name: /needed by 26 Aug/ })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /^Bar \d$/ })).toHaveLength(4);
  });

  it('a week within the fold shows no control at all', () => {
    renderCalendar([
      ticket({ fields: { title: claimField('Alone'), dueDate: claimField({ date: '2026-08-28' }) } }),
    ]);
    expect(screen.queryByRole('button', { name: /more$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'show fewer' })).toBeNull();
  });
});

describe('11.66 a claim still in transit says so', () => {
  it('marks the marker in transit and leaves a settled one unmarked', () => {
    renderCalendar([
      ticket({ fields: { title: claimField('Pending'), dueDate: claimField({ date: '2026-08-28' }) } }, ['dueDate']),
      ticket({ fields: { title: claimField('Settled'), dueDate: claimField({ date: '2026-08-27' }) } }),
    ]);
    expect(screen.getByRole('button', { name: /needed by 28 Aug/ })).toHaveAttribute('data-pending', 'true');
    expect(screen.getByRole('button', { name: /needed by 27 Aug/ })).not.toHaveAttribute('data-pending');
  });

  it('a bar whose either claim is in transit is marked in transit', () => {
    renderCalendar([
      ticket(
        {
          fields: {
            title: claimField('Half in transit'),
            startDate: claimField({ date: '2026-08-24' }),
            dueDate: claimField({ date: '2026-08-30' }),
          },
        },
        ['dueDate'],
      ),
    ]);
    expect(screen.getByRole('button', { name: 'Half in transit' })).toHaveAttribute('data-pending', 'true');
  });
});

describe('11.67 month navigation moves, and Today returns to the day that was handed in', () => {
  it('steps forward and back and returns', () => {
    renderCalendar([ticket()]);
    expect(screen.getByRole('heading', { name: 'August 2026' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByRole('heading', { name: 'August 2026' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('heading', { name: 'July 2026' })).toBeInTheDocument();
  });

  it('crosses the year boundary in both directions', () => {
    renderCalendar([ticket()], { today: '2026-12-15' });
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('heading', { name: 'January 2027' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getByRole('heading', { name: 'November 2026' })).toBeInTheDocument();
  });

  it('leaving the month with a week unfolded folds it again — the fold is per grid', () => {
    const inputs = [1, 2, 3, 4, 5].map((n) =>
      ticket({ fields: { title: claimField(`Item ${n}`), dueDate: claimField({ date: '2026-08-28' }) } }),
    );
    renderCalendar(inputs);
    fireEvent.click(screen.getByRole('button', { name: '+1 more' }));
    expect(screen.getAllByRole('button', { name: /needed by 28 Aug/ })).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(screen.getAllByRole('button', { name: /needed by 28 Aug/ })).toHaveLength(4);
  });
});

describe('11.68 a custom date claim renders under its own field name', () => {
  it('labels it with the field name, tags it with the field id, and opens its ticket', () => {
    const input = ticket(
      { fields: { title: claimField('GST return'), 'filed-on': claimField('2026-08-30') } },
      [],
      [{ id: 'filed-on', name: 'Filed on' }],
    );
    const onOpenTicket = renderCalendar([input]);
    const marker = screen.getByRole('button', { name: "Filed on: 30 Aug — Kiro's claim" });
    expect(marker).toHaveAttribute('data-field-id', 'filed-on');
    fireEvent.click(marker);
    expect(onOpenTicket).toHaveBeenCalledWith(input.state.id);
  });

  it('a built-in marker carries no field id — the tag says custom, and only custom', () => {
    renderCalendar([
      ticket({ fields: { title: claimField('Plain'), dueDate: claimField({ date: '2026-08-28' }) } }),
    ]);
    expect(screen.getByRole('button', { name: /needed by 28 Aug/ })).not.toHaveAttribute('data-field-id');
  });
});

describe('11.69 the legend is the readability affordance, and hiding is visibly reversible', () => {
  it('lists each claimed field by its own name and count, and switches it off and back on', () => {
    const fields = [{ id: 'filed-on', name: 'Filed on' }];
    renderCalendar([
      ticket({ fields: { title: claimField('One'), 'filed-on': claimField('2026-08-11') } }, [], fields),
      ticket({ fields: { title: claimField('Two'), 'filed-on': claimField('2026-08-18') } }, [], fields),
    ]);
    const legend = screen.getByRole('group', { name: 'Claimed date fields' });
    const toggle = within(legend).getByRole('checkbox', { name: 'Filed on (2)' });
    expect(toggle).toBeChecked();
    expect(screen.getAllByRole('button', { name: /Filed on:/ })).toHaveLength(2);

    fireEvent.click(toggle);
    expect(screen.queryAllByRole('button', { name: /Filed on:/ })).toHaveLength(0);
    // The switch survives its own use, and it still says how much it hides.
    expect(within(legend).getByRole('checkbox', { name: 'Filed on (2)' })).not.toBeChecked();

    fireEvent.click(toggle);
    expect(screen.getAllByRole('button', { name: /Filed on:/ })).toHaveLength(2);
  });

  it('hiding one field leaves the others on screen', () => {
    const fields = [
      { id: 'filed-on', name: 'Filed on' },
      { id: 'inspected-on', name: 'Inspected on' },
    ];
    renderCalendar([
      ticket(
        {
          fields: {
            title: claimField('Both'),
            'filed-on': claimField('2026-08-11'),
            'inspected-on': claimField('2026-08-12'),
          },
        },
        [],
        fields,
      ),
    ]);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Filed on (1)' }));
    expect(screen.queryAllByRole('button', { name: /Filed on:/ })).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: /Inspected on:/ })).toHaveLength(1);
  });

  it('a month with no custom date claims renders no legend — empty chrome is noise', () => {
    renderCalendar([
      ticket({ fields: { title: claimField('Plain'), dueDate: claimField({ date: '2026-08-28' }) } }),
    ]);
    expect(screen.queryByRole('group', { name: 'Claimed date fields' })).toBeNull();
  });
});

describe('11.70 a day that is not a day is never placed on a day that is', () => {
  /**
   * `IST_DAY_REGEX` is a SHAPE check, so `2026-02-30` is a storable claim, and
   * the model places it in the grid row it sorts into (23 Feb – 1 Mar) by
   * string comparison alone. It is not one of that row's seven days, so there
   * is no column it belongs in — and the plan's `days.indexOf(...) + 1`
   * silently produced `grid-column: 0 / 1` for it, a column CSS ignores,
   * dropping the claim onto whichever cell the auto-placer reached next.
   */
  it('renders the impossible day verbatim, spanning the week rather than pointing at a day', () => {
    renderCalendar(
      [ticket({ fields: { title: claimField('Impossible'), dueDate: claimField({ date: '2026-02-30' }) } })],
      { today: '2026-02-15' },
    );
    const marker = screen.getByRole('button', { name: /2026-02-30/ });
    expect(marker).toHaveAttribute('data-unplaceable', 'true');
    expect(marker.closest('li')).toHaveStyle({ gridColumn: '1 / 8' });
    // And no cell in the grid pretends to BE that day.
    expect(document.querySelector('[data-day="2026-02-30"]')).toBeNull();
  });
});

describe('11.71 the grid says which days belong to the month it is headed by', () => {
  it('marks the padding days from the neighbouring months as outside', () => {
    renderCalendar([ticket()]);
    const july31 = document.querySelector('[data-day="2026-07-31"]');
    const august1 = document.querySelector('[data-day="2026-08-01"]');
    expect(july31).toHaveAttribute('data-outside', 'true');
    expect(august1).not.toHaveAttribute('data-outside');
    // Six rows of seven, and every one of them present.
    expect(document.querySelectorAll('[data-day]')).toHaveLength(42);
  });

  /**
   * `data-week` is rendered for the shells that mount this component, and an
   * attribute no test names is the one the next task builds on and breaks. It
   * is asserted to be the row's FIRST day, which is what makes it a stable
   * handle: the row's Monday, not its position in the grid.
   */
  it('labels each row by its own Monday', () => {
    renderCalendar([ticket()]);
    const rows = [...document.querySelectorAll('[data-week]')].map((row) =>
      row.getAttribute('data-week'),
    );
    expect(rows).toEqual([
      '2026-07-27',
      '2026-08-03',
      '2026-08-10',
      '2026-08-17',
      '2026-08-24',
      '2026-08-31',
    ]);
  });
});
