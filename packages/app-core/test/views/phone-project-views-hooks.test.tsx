import { cleanup, fireEvent, render, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TicketState } from '@gisik-nokma/domain';
import { CalendarView } from '../../src/calendar/calendar-view.js';
import { TimelineView } from '../../src/timeline/timeline-view.js';
import { DEFAULT_VIEW_PREFS, type ListRow } from '../../src/view-types.js';
import { TicketList } from '../../src/views/ticket-list.js';
import type { GroupLabels } from '../../src/views/list-model.js';
import { listRowSeed } from '../helpers/seed.js';

/**
 * The web app on phones, Plan Task 8 — the CLASS HOOKS the phone rules for List / Backlog (21.111), Calendar
 * (21.112) and Timeline (29.107, which was 21.113 until the continuous Timeline) key on. `apps/web/test/phone-project-views.test.ts` pins the CSS; this pins
 * that the components CARRY the classes that CSS paints, in the structure its selectors assume (a `td` under a
 * `tr` under a `tbody` under a `.gn-list__table`; a week row holding the days and the items).
 */
afterEach(cleanup);

const LABELS: GroupLabels = { epicTitle: (id) => id, typeName: (id) => id };
const ROW: ListRow = listRowSeed({
  ticketId: 't1',
  title: 'File the GST return',
  dueDate: { date: '2026-08-30', claim: { actorName: 'Kiro', actorId: 'me', clientTime: '2026-08-18T07:59:00.000Z', serverTime: '2026-08-18T08:00:00.000Z' } as never },
});

describe('21.111 the List table carries the classes its stacked-row rules key on', () => {
  it('21.111 wrap > table.gn-list__table > thead + tbody > tr.gn-list__table-row > a title cell and data cells (and a select cell when selecting)', () => {
    const { container } = render(
      <TicketList
        rows={[ROW]}
        currentUserId="me"
        prefs={DEFAULT_VIEW_PREFS}
        prefsEditable={false}
        onPrefsChange={vi.fn()}
        labels={LABELS}
        onOpenTicket={vi.fn()}
        selection={{ selected: new Set(), onToggle: vi.fn() }}
        controls={<span className="gn-list__bulk" data-testid="bulk" />}
      />,
    );
    const table = container.querySelector('.gn-list__table-wrap table.gn-list__table');
    expect(table).not.toBeNull();
    expect(table?.querySelector(':scope > thead')).not.toBeNull();
    const row = table?.querySelector(':scope > tbody > tr.gn-list__table-row');
    expect(row).not.toBeNull();
    // The title cell is the stacked row's first line; the data cells (key, state, …) are its meta.
    expect(row?.querySelectorAll(':scope > td.gn-list__table-cell--title')).toHaveLength(1);
    expect(row?.querySelectorAll(':scope > td.gn-list__table-cell--data').length).toBeGreaterThanOrEqual(2);
    // The bulk-select checkbox lives in the row's own `td.gn-list__select`, which the row's `:has()` padding reads.
    expect(row?.querySelector(':scope > td.gn-list__select input[type="checkbox"]')).not.toBeNull();
    // The controls slot is `.gn-list__controls-end` and holds what the caller passes (the bulk-close bar).
    expect(container.querySelector('.gn-list__controls > .gn-list__controls-end > .gn-list__bulk')).not.toBeNull();

    // CONTROL — without a selection there is no select cell, so the `:has(.gn-list__select)` padding does not apply.
    cleanup();
    const plain = render(
      <TicketList rows={[ROW]} currentUserId="me" prefs={DEFAULT_VIEW_PREFS} prefsEditable={false} onPrefsChange={vi.fn()} labels={LABELS} onOpenTicket={vi.fn()} />,
    );
    expect(plain.container.querySelector('.gn-list__select')).toBeNull();
    expect(plain.container.querySelector('tr.gn-list__table-row')).not.toBeNull();
  });
});

describe('21.112 the Calendar carries the classes its scroller rules key on', () => {
  it('21.112 .gn-calendar > header.gn-calendar__header and .gn-calendar__grid > a weekday head + week rows holding .gn-calendar__days and .gn-calendar__items', () => {
    const { container } = render(<CalendarView tickets={[]} today="2026-08-23" userName={(id) => id} onOpenTicket={vi.fn()} />);
    const root = container.querySelector('.gn-calendar');
    expect(root).not.toBeNull();
    expect(root?.querySelector(':scope > header.gn-calendar__header')).not.toBeNull();
    const grid = root?.querySelector(':scope > .gn-calendar__grid');
    expect(grid).not.toBeNull();
    // The scroller's direct children are the weekday head and the week rows — the elements the 22rem floor is on.
    expect(grid?.querySelectorAll(':scope > .gn-calendar__weekday-head')).toHaveLength(1);
    const weeks = grid?.querySelectorAll(':scope > .gn-calendar__week') ?? [];
    expect(weeks.length).toBeGreaterThanOrEqual(4);
    for (const week of weeks) {
      expect(week.querySelectorAll(':scope > .gn-calendar__days > .gn-calendar__day')).toHaveLength(7);
    }
    // CONTROL — each week row holds its items track beside the days (same 7 columns), so the 3rem floor reaches both.
    expect(weeks[0]?.querySelector(':scope > .gn-calendar__items')).not.toBeNull();
  });
});

describe('29.107 the Timeline carries the classes its scroller and its portrait rules key on', () => {
  const claim = (value: unknown) => ({ value, actorId: 'user_kiro', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' });
  const ticket: TicketState = {
    kind: 'ticket',
    id: 't1',
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
    fields: { title: claim('A dated ticket'), startDate: claim({ date: '2026-08-24' }), dueDate: claim({ date: '2026-08-28' }) },
    transitions: [],
  };
  const renderIt = () =>
    render(
      <TimelineView
        tickets={[{ state: ticket, pendingFieldIds: [], customDateFields: [] }]}
        today="2026-08-23"
        userName={(id) => id}
        onOpenTicket={vi.fn()}
      />,
    );

  it('29.107 .gn-timeline > toolbar + stage > canvas > surface > axis, and under a lane the .gn-timeline__row wrappers (21.113, retitled: the week band and the column template are gone)', () => {
    const root = renderIt().container.querySelector('.gn-timeline');
    expect(root).not.toBeNull();
    // The panel's direct children: the toolbar, the stage that holds the scroller, nothing else but the optional note and side list.
    expect(root?.querySelector(':scope > header.gn-timeline__toolbar')).not.toBeNull();
    expect(root?.querySelectorAll(':scope > .gn-timeline__stage')).toHaveLength(1);
    // The scroller, its one surface, the sticky axis, and a lane holding the row wrappers the bars hang from.
    expect(root?.querySelector(':scope > .gn-timeline__stage > .gn-timeline__canvas > .gn-timeline__surface > .gn-timeline__axis')).not.toBeNull();
    expect(root?.querySelector('.gn-timeline__surface > .gn-timeline__lane > .gn-timeline__row > .gn-timeline__bar')).not.toBeNull();
    // CONTROL: the week band and its column template do not exist any more.
    expect(root?.querySelector('.gn-timeline__weeks')).toBeNull();
    expect((root as HTMLElement).style.getPropertyValue('--timeline-week-columns')).toBe('');
  });

  it('29.110 the panel names its orientation: narrower than 40rem (640 px) is portrait, 640 and wider and an unmeasured panel (jsdom, a hidden tab) are landscape', () => {
    const orientationAt = (width: number): string | null => {
      const spy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
      try {
        return renderIt().container.querySelector('.gn-timeline')?.getAttribute('data-orientation') ?? null;
      } finally {
        spy.mockRestore();
        cleanup();
      }
    };
    expect(orientationAt(390)).toBe('portrait');
    expect(orientationAt(639)).toBe('portrait');
    expect(orientationAt(1)).toBe('portrait'); // the narrowest measured panel: only 0 (no layout yet) reads as landscape
    // CONTROLS, same it: the edge, a desktop width and no layout at all are landscape.
    expect(orientationAt(640)).toBe('landscape');
    expect(orientationAt(1280)).toBe('landscape');
    expect(orientationAt(0)).toBe('landscape');
  });

  it('29.110 in portrait a key is a line down a 100 px column, so a bar a line tall or more carries its key INSIDE (the portrait packer reserved a line, not the key\'s width); control: the same bar in landscape, shorter than its key, puts the key outside', () => {
    // Two days at the Week preset: 48 px along time. The key's measured width (jsdom's estimate, 7 characters + the bar's padding)
    // is wider than 48 px, so landscape puts it outside the bar; in portrait the bar is 100 px wide and 46 px tall, room for a line.
    const short: TicketState = { ...ticket, fields: { title: claim('A short one'), startDate: claim({ date: '2026-08-23' }), dueDate: claim({ date: '2026-08-24' }) } };
    const keysAt = (width: number) => {
      const spy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
      try {
        const { container } = render(
          <TimelineView tickets={[{ key: 'GN-1234', state: short, pendingFieldIds: [], customDateFields: [] }]} today="2026-08-23" userName={(id) => id} onOpenTicket={vi.fn()} />,
        );
        const bar = container.querySelector('.gn-timeline__bar');
        return {
          orientation: container.querySelector('.gn-timeline')?.getAttribute('data-orientation'),
          inside: bar?.querySelector('.gn-timeline__key')?.textContent ?? null,
          outside: container.querySelector('.gn-timeline__key--outside')?.textContent ?? null,
        };
      } finally {
        spy.mockRestore();
        cleanup();
      }
    };
    expect(keysAt(390)).toEqual({ orientation: 'portrait', inside: 'GN-1234', outside: null });
    // CONTROL, same it: landscape keeps T9's decision on the bar's drawn LENGTH, so this short bar's key is outside it.
    expect(keysAt(1280)).toEqual({ orientation: 'landscape', inside: null, outside: 'GN-1234' });
    // The PACKER reserves the same line: a second short bar starting the day after the first one ends shares its column in portrait,
    // where the first one's key takes no room along time; in landscape the first one's key, drawn after its end, pushes it a row down.
    const next: TicketState = { ...ticket, id: 't2', fields: { title: claim('The next one'), startDate: claim({ date: '2026-08-25' }), dueDate: claim({ date: '2026-08-26' }) } };
    const rowsAt = (width: number) => {
      // A height too, so the portrait scroller (time runs down) has days in view and mounts both bars.
      const spy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
      const tall = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700);
      try {
        const { container } = render(
          <TimelineView
            tickets={[{ key: 'GN-1234', state: short, pendingFieldIds: [], customDateFields: [] }, { key: 'GN-1235', state: next, pendingFieldIds: [], customDateFields: [] }]}
            today="2026-08-23"
            userName={(id) => id}
            onOpenTicket={vi.fn()}
          />,
        );
        return [...container.querySelectorAll<HTMLElement>('.gn-timeline__row')].map((row) => [row.dataset['ticketId'], row.style.getPropertyValue('--row')]);
      } finally {
        tall.mockRestore();
        spy.mockRestore();
        cleanup();
      }
    };
    expect(rowsAt(390)).toEqual([['t1', '0'], ['t2', '0']]);
    expect(rowsAt(1280)).toEqual([['t1', '0'], ['t2', '1']]);
  });

  it('29.110 in portrait a bar with no key (an offline ticket, no prefix yet) reserves no line, so the next bar shares its column; control: the same bars with keys', async () => {
    // At Month (8 px a day) a one-day bar is drawn 12 px tall (MIN_BAR_PX), shorter than a 16 px key line, so a KEYED bar's key
    // sits after its end and the packer reserves it (to day 23 + 3); the second bar, two days on, takes the next column. A keyless
    // bar has no line to reserve: its footprint is its own two drawn days, and the second bar shares its column.
    const day = (id: string, date: string): TicketState => ({ ...ticket, id, fields: { title: claim(id), startDate: claim({ date }), dueDate: claim({ date }) } });
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('reduce'),
      media: query,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
    }));
    const rowsAtMonth = async (keys: readonly [string | null, string | null]) => {
      const spy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);
      const tall = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(700);
      try {
        const { container } = render(
          <TimelineView
            tickets={[
              { key: keys[0], state: day('t1', '2026-08-23'), pendingFieldIds: [], customDateFields: [] },
              { key: keys[1], state: day('t2', '2026-08-25'), pendingFieldIds: [], customDateFields: [] },
            ]}
            today="2026-08-23"
            userName={(id) => id}
            onOpenTicket={vi.fn()}
          />,
        );
        // Reduced motion makes the zoom instant: the frame lands once Month is marked.
        const zoom = within(container).getByRole('radiogroup', { name: 'Timeline zoom' });
        fireEvent.click(within(zoom).getByRole('radio', { name: 'Month' }));
        await waitFor(() => expect(within(zoom).getByRole('radio', { name: 'Month' })).toHaveAttribute('aria-checked', 'true'));
        return {
          orientation: container.querySelector('.gn-timeline')?.getAttribute('data-orientation'),
          rows: [...container.querySelectorAll<HTMLElement>('.gn-timeline__row')].map((row) => [row.dataset['ticketId'], row.style.getPropertyValue('--row')]),
        };
      } finally {
        tall.mockRestore();
        spy.mockRestore();
        cleanup();
      }
    };
    try {
      // CONTROL first: keyed, the first bar's key line pushes the second bar a column over (the leg CAN fail).
      expect(await rowsAtMonth(['GN-1', 'GN-2'])).toEqual({ orientation: 'portrait', rows: [['t1', '0'], ['t2', '1']] });
      expect(await rowsAtMonth([null, null])).toEqual({ orientation: 'portrait', rows: [['t1', '0'], ['t2', '0']] });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
