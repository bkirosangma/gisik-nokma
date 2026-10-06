import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TimelineView } from '@gisik-nokma/app-core';
import type { ListRow } from '@gisik-nokma/app-core';
import { toTicketDatesInput } from '../src/ticket-dates-input.js';

/**
 * 29.440 (wtg2 plan-settle FIX 1) — the web Timeline learns Not taken from the SERVER's row.
 *
 * `page.tsx` is `TimelineView`'s only product mount, and it feeds the view through `toTicketDatesInput`. That adapter builds a
 * `TicketState` with no `closed` key (a `ListRow`'s `closed` carries no cause), so `resolutionOf(state)` is null for every web
 * row and the view's state path can never see a Not-taken close. The server already answered the question once, through
 * `notTakenOf`, as `ListRow.notTaken`; the adapter carries that flag and the view reads it. The app-core 29.440 leg hand-builds
 * a `TicketState` with `closed.cause`, a path the web shell never takes, so this leg goes through the REAL adapter.
 */

const names: Record<string, string> = { user_kiro: 'Kiro' };
const userName = (id: string): string => names[id] ?? id;
const scope = { workspaceId: 'ws_1', projectId: 'p_1' };

function claim(value: unknown, actorId = 'user_kiro') {
  return { value, actorId, clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' };
}

/** A `ListRow` exactly as `view-types.ts` declares it (the `project-calendar-timeline.test.tsx` builder): a finished row. */
function row(overrides: Partial<ListRow>): ListRow {
  const base: ListRow = {
    ticketId: 't_1',
    title: 'Restock the cold shelf',
    key: 'CCSO-7',
    typeId: 'task',
    typeRank: 3,
    parentId: null,
    epicId: null,
    stateId: 'done',
    stateName: 'Done',
    stateCategory: 'terminal',
    stateProvenance: { actorId: 'user_kiro', actorName: 'Kiro', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' },
    assignee: null,
    assignedProvenance: null,
    dueDate: null,
    priority: {
      value: 'P2',
      claim: { actorId: 'user_kiro', actorName: 'Kiro', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' },
    },
    fields: { title: claim('Restock the cold shelf') },
    rollup: null,
    hasRestrictedParent: false,
    pending: false,
    closed: { actorId: 'user_kiro', at: '2026-08-28T10:00:00.000Z' },
    rank: null,
  };
  return { ...base, ...overrides };
}

const dated = (ticketId: string, title: string, key: string, over: Partial<ListRow> = {}): ListRow =>
  row({
    ticketId,
    title,
    key,
    fields: { title: claim(title), startDate: claim({ date: '2026-08-24' }), dueDate: claim({ date: '2026-08-28' }) },
    ...over,
  });

describe('29.440 the web Timeline reads the server row\'s Not taken through toTicketDatesInput (wtg2 plan-settle FIX 1)', () => {
  it('29.440 a terminal ListRow marked notTaken reads "⊘ Not taken" through the real adapter; its finished sibling, and the same row unmarked, read "✓ Done"', () => {
    const finished = dated('t_done', 'Finished', 'CCSO-1');
    // the SECOND terminal row decides: the first is a plain finish
    const skipped = dated('t_skip', 'Skipped', 'CCSO-2', { notTaken: true });
    const inputs = (rows: readonly ListRow[]) => rows.map((r) => toTicketDatesInput(r, scope, []));
    // the adapter carries the server's flag, and leaves it ABSENT on a row without one (as `ListRow.notTaken` is)
    expect(toTicketDatesInput(skipped, scope, []).notTaken).toBe(true);
    expect('notTaken' in toTicketDatesInput(finished, scope, [])).toBe(false);

    const view = render(<TimelineView tickets={inputs([finished, skipped])} today="2026-08-23" userName={userName} onOpenTicket={vi.fn()} />);
    const button = (title: string) => screen.getByRole('button', { name: title });
    const mark = (title: string) => button(title).querySelector('.gn-timeline__mark')?.textContent ?? null;
    const description = (title: string) => document.getElementById(button(title).getAttribute('aria-describedby') as string)?.textContent;
    const said = "starts 24 Aug, Kiro's claim; needed by 28 Aug, Kiro's claim";
    expect(mark('Finished')).toBe('✓');
    expect(button('Finished')).toHaveAttribute('data-state', 'done');
    expect(button('Finished')).toHaveAttribute('title', `CCSO-1; Done; ${said}`);
    expect(mark('Skipped')).toBe('⊘');
    expect(button('Skipped')).toHaveAttribute('data-state', 'not-taken');
    expect(button('Skipped')).toHaveAttribute('title', `CCSO-2; Not taken; ${said}`);
    expect(description('Skipped')).toBe(`CCSO-2; Not taken; ${said}`);

    // control: the SAME row without the server's flag reads Done, so the flag (and nothing else on the row) is what decides
    const { notTaken: _flag, ...unmarked } = skipped;
    view.rerender(<TimelineView tickets={inputs([finished, unmarked])} today="2026-08-23" userName={userName} onOpenTicket={vi.fn()} />);
    expect(mark('Skipped')).toBe('✓');
    expect(button('Skipped')).toHaveAttribute('data-state', 'done');
    expect(button('Skipped')).toHaveAttribute('title', `CCSO-2; Done; ${said}`);
  });
});
