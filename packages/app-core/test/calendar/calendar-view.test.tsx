import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TicketState } from '@gisik-nokma/domain';
import {
  CALENDAR_ALL_HIDDEN_COPY,
  CALENDAR_EMPTY_MONTH_COPY,
} from '../../src/claims/claim-labels.js';
import type { TicketDatesInput } from '../../src/claims/ticket-dates.js';
import type { IsEpicType } from '../../src/hierarchy/epic-ancestor.js';
import type { FilterSpec } from '../../src/view-types.js';
import type { CalendarMonth } from '../../src/calendar/calendar-model.js';
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
  extra: {
    onOpenTicket?: (ticketId: string) => void;
    today?: string;
    filter?: FilterSpec;
    laneEpicId?: string | null;
    isEpicType?: IsEpicType;
    initialMonth?: CalendarMonth;
  } = {},
) {
  const onOpenTicket = extra.onOpenTicket ?? vi.fn();
  render(
    <CalendarView
      tickets={tickets}
      today={extra.today ?? TODAY}
      userName={userName}
      onOpenTicket={onOpenTicket}
      {...(extra.filter === undefined ? {} : { filter: extra.filter })}
      {...(extra.laneEpicId === undefined ? {} : { laneEpicId: extra.laneEpicId })}
      {...(extra.isEpicType === undefined ? {} : { isEpicType: extra.isEpicType })}
      {...(extra.initialMonth === undefined ? {} : { initialMonth: extra.initialMonth })}
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

  /**
   * A BAR IS A BUTTON TOO, and until this case nothing said so: the two cases
   * above read a bar's `title` and its `gridColumn` and never press it, while
   * every click in this file lands on a marker. Half of "every item opens its
   * ticket" was therefore unwitnessed — a dead `onClick` on the bar branch left
   * the whole suite green. Both segments are pressed, because a bar clipped
   * across two rows is one claim drawn twice and either half must open the
   * same ticket — not the ticket whose row it happens to be sharing.
   */
  it('every segment of a clipped bar opens the bar\'s own ticket', () => {
    const input = ticket({
      fields: {
        title: claimField('Long'),
        startDate: claimField({ date: '2026-08-19' }),
        dueDate: claimField({ date: '2026-08-26' }),
      },
    });
    const onOpenTicket = renderCalendar([input]);
    const segments = screen.getAllByRole('button', { name: 'Long' });
    expect(segments).toHaveLength(2);
    for (const segment of segments) fireEvent.click(segment);
    expect(onOpenTicket).toHaveBeenCalledTimes(2);
    expect(onOpenTicket).toHaveBeenNthCalledWith(1, input.state.id);
    expect(onOpenTicket).toHaveBeenNthCalledWith(2, input.state.id);
  });
});

describe('11.63 the empty months are the model sentences, rendered verbatim', () => {
  /* ⚠ RETITLED 2026-09-20. It read "the three empty months are three different
     sentences". The third sentence was deleted on the owner's ruling and the
     filtered month now reaches the first one, so the title would have described
     a product that no longer exists. The middle arm is the one that still
     discriminates, and it is unchanged. */
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
    expect(screen.getByRole('note')).toHaveTextContent(CALENDAR_EMPTY_MONTH_COPY);
  });
});

describe('11.64 today is a prop — the ring never asks the device what day it is', () => {
  it('rings the day it was handed, and only that day', () => {
    renderCalendar([ticket()]);
    const ringed = document.querySelectorAll('[aria-current="date"]');
    expect(ringed).toHaveLength(1);
    expect(ringed[0]).toHaveAttribute('data-day', TODAY);
    expect(ringed[0]).toHaveAttribute('data-today', 'true');
    // COUNTED, not merely read off the ringed cell. `data-today` is named in
    // the produced interface as part of the ring contract, so a shell may key
    // on it — and an attribute stamped onto every cell would still satisfy a
    // `toHaveAttribute` on the one cell we already know is today's.
    expect(document.querySelectorAll('[data-today]')).toHaveLength(1);
  });

  it('a different `today` rings a different cell — nothing here is read from a clock', () => {
    renderCalendar([ticket()], { today: '2026-08-10' });
    expect(document.querySelector('[aria-current="date"]')).toHaveAttribute('data-day', '2026-08-10');
    expect(document.querySelectorAll('[data-today]')).toHaveLength(1);
    expect(screen.getByRole('heading', { name: 'August 2026' })).toBeInTheDocument();
  });

  /**
   * THE RING'S ABSENCE, and neither case above can see it. Both assert a ring
   * is PRESENT somewhere inside August, and the Aug-2026 grid holds
   * day-of-month 23 and day-of-month 10 exactly once each — so a ring computed
   * from the day-of-month alone (`day.slice(8) === today.slice(8)`) passes
   * both while ringing 2026-09-23 in a September grid. Over-firing is only
   * visible from a month that contains no candidate at all.
   *
   * The two `data-day` probes are not decoration: without them the zero counts
   * below would also pass on a grid that failed to render, and on a September
   * grid that happened to contain 2026-08-23. The September grid runs
   * 31 Aug – 11 Oct, so `today` is genuinely outside it and the honest answer
   * is no ring anywhere.
   */
  it('rings nothing at all in a month that does not hold the day it was handed', () => {
    renderCalendar([ticket()]);
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(screen.getByRole('heading', { name: 'September 2026' })).toBeInTheDocument();
    expect(document.querySelector('[data-day="2026-09-23"]')).not.toBeNull();
    expect(document.querySelector(`[data-day="${TODAY}"]`)).toBeNull();
    expect(document.querySelectorAll('[aria-current="date"]')).toHaveLength(0);
    expect(document.querySelectorAll('[data-today]')).toHaveLength(0);
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

/**
 * 11.211 — Ruling R4 (2026-09-16), the legend merge: the prototype's
 * legend-CARD visual treatment, the product's own WORKING per-field toggle.
 * `Due date` and `In transit` join as read-only rows; every existing
 * checkbox, field name and count stays exactly as 11.69 already proves.
 *
 * This case exists because a legend that quietly became decorative would be
 * a silent loss of function — restyling a control is not supposed to be able
 * to turn it into a picture of a control. The checkbox-COUNT assertion below
 * is the anti-vacuous control: it reddens if a real toggle were dropped
 * (fewer checkboxes than custom fields) AND if a read-only row shipped as a
 * checkbox, even a disabled one (more checkboxes than custom fields) —
 * either shape a "reduced to a static swatch" regression could take. 11.69's
 * own first case already proves the ONE real checkbox present there still
 * toggles; this case is the one that would catch either miscount.
 */
describe('11.211 the R4 legend merge — the prototype\'s card, the product\'s working toggle', () => {
  it('the legend has exactly one checkbox per custom field, and Due date/In transit are not among them', () => {
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
    const legend = screen.getByRole('group', { name: 'Claimed date fields' });
    expect(within(legend).getAllByRole('checkbox')).toHaveLength(fields.length);
    expect(within(legend).getByText('Due date')).toBeInTheDocument();
    expect(within(legend).getByText('In transit')).toBeInTheDocument();
    expect(within(legend).queryByRole('checkbox', { name: /Due date/ })).toBeNull();
    expect(within(legend).queryByRole('checkbox', { name: /In transit/ })).toBeNull();
  });

  /**
   * The read-only rows are not a reason to show the legend on their own —
   * they carry no information a hidden field's row doesn't already carry
   * better (a live count) — so the SAME guard 11.69's own third case proves
   * (`model.customDateFields.length > 0`) must cover them too. Without this
   * case, making the legend unconditional purely to show two static rows
   * would pass every other test in this file.
   */
  it('Due date and In transit render only when the legend itself does — never on their own', () => {
    renderCalendar([
      ticket({ fields: { title: claimField('Plain'), dueDate: claimField({ date: '2026-08-28' }) } }),
    ]);
    expect(screen.queryByRole('group', { name: 'Claimed date fields' })).toBeNull();
    expect(screen.queryByText('Due date')).toBeNull();
    expect(screen.queryByText('In transit')).toBeNull();
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
    // Exactly one, because the mark means THIS claim's day and not "an item".
    expect(document.querySelectorAll('[data-unplaceable]')).toHaveLength(1);
    // And no cell in the grid pretends to BE that day.
    expect(document.querySelector('[data-day="2026-02-30"]')).toBeNull();
  });

  /**
   * The other direction, and it is the one that was missing: every fixture in
   * this file claims a real day, so nothing said what a PLACEABLE claim looks
   * like. `data-unplaceable` stamped onto every item button would have gone on
   * reading "true" wherever it was asked for. The marker is asserted present
   * first — a zero count over a grid with no items would pass under that
   * mutant too.
   */
  it('a claim on a real day carries no unplaceable mark', () => {
    renderCalendar([
      ticket({ fields: { title: claimField('Placeable'), dueDate: claimField({ date: '2026-08-28' }) } }),
    ]);
    const marker = screen.getByRole('button', { name: /needed by 28 Aug/ });
    expect(marker.closest('li')).toHaveStyle({ gridColumn: '5 / 6' });
    expect(document.querySelectorAll('[data-unplaceable]')).toHaveLength(0);
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

  /**
   * A CLAIM ON A PADDING DAY, which every other case in this file is blind to:
   * every date fixture here is `2026-08-xx` (the one exception, 11.70's
   * impossible `2026-02-30`, shares the headed month's `slice(0, 7)` too), so
   * a view that quietly dropped anything outside the headed month kept the
   * whole suite green. That is the same blind spot the MODEL shipped with, one
   * layer up — and the grid draws twelve neighbouring-month days it would be
   * lying about.
   *
   * The row matters as much as the column: a padding claim belongs to the row
   * whose seven days contain it, not to the first row of the headed month.
   */
  it('draws a claim that falls on a padding day, in that day\'s own row and column', () => {
    renderCalendar([
      ticket({ fields: { title: claimField('July'), dueDate: claimField({ date: '2026-07-31' }) } }),
      ticket({ fields: { title: claimField('September'), dueDate: claimField({ date: '2026-09-01' }) } }),
    ]);
    // 2026-07-31 is the Friday of the leading row (27 Jul – 2 Aug).
    const july = screen.getByRole('button', { name: "needed by 31 Jul — Kiro's claim" });
    expect(july.closest('li')).toHaveStyle({ gridColumn: '5 / 6' });
    expect(july.closest('[data-week]')).toHaveAttribute('data-week', '2026-07-27');
    // 2026-09-01 is the Tuesday of the trailing row (31 Aug – 6 Sep).
    const september = screen.getByRole('button', { name: "needed by 1 Sep — Kiro's claim" });
    expect(september.closest('li')).toHaveStyle({ gridColumn: '2 / 3' });
    expect(september.closest('[data-week]')).toHaveAttribute('data-week', '2026-08-31');
    // Neither is the honesty note's business: the month is not empty.
    expect(screen.queryByRole('note')).toBeNull();
  });
});

/**
 * 11.72 THE MOUNT CONTRACT — the two props no test supplied.
 *
 * `initialMonth` and `laneEpicId` are pass-throughs, and both could be deleted
 * from `CalendarView` with all twenty-five preceding cases green: no test ever
 * handed either one in. They are not spare parts. Plan 6's shell mounts this
 * grid inside a lane, and Plan 10's opens it on a month the route names — a
 * silently dropped forward is invisible until one of those shells mounts and
 * shows the wrong work on the wrong month.
 */
describe('11.72 what the mounting shell hands in is what the grid uses', () => {
  it('opens on `initialMonth`, and Today still returns to the day it was handed', () => {
    renderCalendar([ticket()], { initialMonth: { year: 2027, month: 3 } });
    expect(screen.getByRole('heading', { name: 'March 2027' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Today' }));
    expect(screen.getByRole('heading', { name: 'August 2026' })).toBeInTheDocument();
  });

  /**
   * The lane is asserted by ABSENCE as much as presence: the in-lane claim
   * rendering proves the grid works, and only the out-of-lane claim NOT
   * rendering proves `laneEpicId` reached the model at all.
   */
  it("a lane narrows the grid to the epic's own work, and says nothing about the rest", () => {
    const epic = ticket({ id: 'epic1', typeId: 'epic', fields: { title: claimField('The epic') } });
    const inLane = ticket({
      parentId: 'epic1',
      fields: { title: claimField('In lane'), dueDate: claimField({ date: '2026-08-28' }) },
    });
    const outOfLane = ticket({
      fields: { title: claimField('Out of lane'), dueDate: claimField({ date: '2026-08-27' }) },
    });
    renderCalendar([epic, inLane, outOfLane], { laneEpicId: 'epic1' });
    expect(screen.getAllByRole('button', { name: /needed by 28 Aug/ })).toHaveLength(1);
    expect(screen.queryAllByRole('button', { name: /needed by 27 Aug/ })).toHaveLength(0);
  });

  /**
   * 11.158 — the THIRD pass-through no test supplied, and the one with a live
   * consequence rather than a latent one.
   *
   * `buildCalendarModel` has accepted `isEpicType` since Task 8 and this
   * component did not forward it, so every lane the grid drew used the built-in
   * `epic` id — while `apps/server/src/routes/list.ts` groups by RANK 1. A
   * workspace whose rank-1 type is "Initiative" therefore had epics the server
   * groups by and this grid called "No epic": the product disagreeing with
   * itself in public, which is the exact failure `epic-ancestor.ts` made the
   * predicate injectable to prevent.
   *
   * The fixture below is the lane case above with `epic` renamed to
   * `initiative`, and it is the ONLY shape that can witness the forward: with
   * the prop the in-lane claim renders, and without it `epicAncestorOf` walks
   * the child to a parent it does not recognise as an epic, answers null, and
   * the lane filter removes the very ticket the lane is about. `TimelineView`
   * gained the same prop in the same change — see 11.159 — because a calendar
   * and a timeline answering differently about one ticket's epic, on two tabs of
   * one page, is worse than both being narrow together.
   */
  it("11.158 a workspace's OWN rank-1 type heads the lane, not just the built-in 'epic'", () => {
    const initiative = ticket({
      id: 'init1',
      typeId: 'initiative',
      fields: { title: claimField('The initiative') },
    });
    const inLane = ticket({
      parentId: 'init1',
      fields: { title: claimField('In lane'), dueDate: claimField({ date: '2026-08-28' }) },
    });
    const outOfLane = ticket({
      fields: { title: claimField('Out of lane'), dueDate: claimField({ date: '2026-08-27' }) },
    });
    renderCalendar([initiative, inLane, outOfLane], {
      laneEpicId: 'init1',
      isEpicType: (typeId) => typeId === 'initiative',
    });
    // Present AND absent, as the lane case above: the first half proves the grid
    // drew the lane, and only the second proves it was narrowed to it.
    expect(screen.getAllByRole('button', { name: /needed by 28 Aug/ })).toHaveLength(1);
    expect(screen.queryAllByRole('button', { name: /needed by 27 Aug/ })).toHaveLength(0);
  });
});

/**
 * E4-28 (batch B15, case block `11.216`-`11.217`) — the grid's date
 * relationships stop living by position alone. `docs/lanes/review-ui-exec4.md:446`:
 * day cells carry only `data-day`/`data-today`/`data-outside`/`aria-current`
 * (no `aria-label`, no `<time>`), and a bar's rendered text is its ticket
 * title alone — the date span lives only in the `title` attribute, which is
 * not reliably read by assistive tech (it requires hover, which touch/mobile
 * AT has no equivalent for). A marker's own accessible name already carries
 * its date (`item.label`, e.g. "needed by 30 Aug — Kiro's claim" —
 * `itemClassName`'s sibling docblock: "the accessible name is the claim and
 * nothing else"), so this fix does not touch markers.
 */
describe('11.216 every day cell names its own full date', () => {
  it('carries the full date as an aria-label, not just a bare day-of-month number', () => {
    renderCalendar([]);
    // `[data-day]` rather than a text query: August AND the outside-July row
    // both draw a cell whose bare number is "31" (below), so a query keyed
    // on the rendered digit alone is ambiguous by construction here.
    const cell = document.querySelector('[data-day="2026-08-23"]');
    expect(cell).toHaveAttribute('aria-label', '23 Aug 2026');
  });

  it('names an outside-month cell by ITS OWN month, not the grid header’s', () => {
    renderCalendar([]);
    // 2026-08-23 is a Sunday; the grid's first row runs into July. `31` is
    // the last day of July, rendered as an outside cell — and August also
    // has a 31st, which is why this is queried by `data-day`, not by text.
    const cell = document.querySelector('[data-day="2026-07-31"]');
    expect(cell).toHaveAttribute('data-outside', 'true');
    expect(cell).toHaveAttribute('aria-label', '31 Jul 2026');
  });
});

describe("11.217 a bar's date span is a linked DESCRIPTION, not folded into its accessible name", () => {
  it('keeps the accessible NAME exactly the ticket title, and links the dates as aria-describedby', () => {
    renderCalendar([
      ticket({
        fields: {
          title: claimField('Span'),
          startDate: claimField({ date: '2026-08-24' }),
          dueDate: claimField({ date: '2026-08-30' }),
        },
      }),
    ]);
    // Unchanged from the pre-existing "spans Monday to Sunday" case above:
    // proves this fix did not fold the date into the name a caller already
    // depends on to find the control.
    const bar = screen.getByRole('button', { name: 'Span' });
    const describedById = bar.getAttribute('aria-describedby');
    expect(describedById).not.toBeNull();
    const description = document.getElementById(describedById!);
    expect(description).not.toBeNull();
    expect(description).toHaveTextContent("starts 24 Aug — Kiro's claim · needed by 30 Aug — Kiro's claim");
    // Not a second, competing statement of the same text: the attribute the
    // hover-only title carried is unchanged, and the description is the SAME
    // string linked a second, AT-reachable way — not a duplicate invention.
    expect(bar).toHaveAttribute('title', description!.textContent);
  });

  it('links no description onto a marker, whose own label already names the date', () => {
    renderCalendar([
      ticket({
        fields: { title: claimField('DLT'), dueDate: claimField({ date: '2026-08-30' }) },
      }),
    ]);
    const marker = screen.getByRole('button', { name: "needed by 30 Aug — Kiro's claim" });
    expect(marker).not.toHaveAttribute('aria-describedby');
  });
});
