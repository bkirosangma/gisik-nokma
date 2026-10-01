import { cleanup, render } from '@testing-library/react';
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
 * (21.112) and Timeline (21.113) key on. `apps/web/test/phone-project-views.test.ts` pins the CSS; this pins
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

describe('21.113 the Timeline carries the classes its scroller rules key on', () => {
  it('21.113 .gn-timeline > header + .gn-timeline__weeks and, under a group, .gn-timeline__row grid rows', () => {
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
      fields: {
        title: { value: 'A dated ticket', actorId: 'user_kiro', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' },
        startDate: { value: { date: '2026-08-24' }, actorId: 'user_kiro', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' },
        dueDate: { value: { date: '2026-08-28' }, actorId: 'user_kiro', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' },
      },
      transitions: [],
    };
    const { container } = render(
      <TimelineView
        tickets={[{ state: ticket, pendingFieldIds: [], customDateFields: [] }]}
        today="2026-08-23"
        userName={(id) => id}
        onOpenTicket={vi.fn()}
      />,
    );
    const root = container.querySelector('.gn-timeline');
    expect(root).not.toBeNull();
    // The scroller's direct children: the toolbar (made sticky), the week band, the groups.
    expect(root?.querySelector(':scope > header.gn-timeline__header')).not.toBeNull();
    expect(root?.querySelectorAll(':scope > .gn-timeline__weeks')).toHaveLength(1);
    // The row is a grid row under a group — the element the 40rem floor is on.
    expect(root?.querySelector(':scope > .gn-timeline__group > .gn-timeline__row')).not.toBeNull();
    // CONTROL — the week band and the row share one column template through the component's own CSS variable.
    expect((root as HTMLElement).style.getPropertyValue('--timeline-week-columns')).toMatch(/^repeat\(\d+, minmax\(0, 1fr\)\)$/);
  });
});
