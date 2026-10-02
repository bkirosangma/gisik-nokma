import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FilterSpec } from '../../src/view-types.js';
import { clearLiveQueryCache } from '../../src/views/live-query-cache.js';
import { useBoard } from '../../src/views/board.js';
import { useTicketList } from '../../src/views/ticket-list.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { PROJECT, WS, listRowSeed } from '../helpers/seed.js';

/**
 * Smoothness T6 (spec S4, D1; audit SM-01): the project page's two big reads are cached under their own keys, and the List keeps
 * its rows on screen while a filter change is answered. Cases 25.079–25.081.
 */
const NEVER = () => new Promise<never>(() => {});
const board = (project = PROJECT) => ({ projectId: project, groups: [] });
const rows = (...titles: string[]) => titles.map((title, i) => listRowSeed({ ticketId: `t_${i}_${title}`, title }));

beforeEach(() => clearLiveQueryCache());
afterEach(cleanup);

describe('25.079 useBoard serves its last answer for the project at once (S4), and only for that project', () => {
  it('a remount renders the cached board on the first frame while the fresh read is open; another project and another workspace see nothing', async () => {
    const first = renderHook(() => useBoard(createFakeDataSource({ getBoard: async () => board() }), WS, PROJECT));
    await waitFor(() => expect(first.result.current.data).toEqual(board()));
    first.unmount();
    const again = renderHook(() => useBoard(createFakeDataSource({ getBoard: NEVER }), WS, PROJECT));
    expect(again.result.current.data).toEqual(board()); // the first frame
    expect(again.result.current.settled).toBe(false); // and still revalidating behind it
    // Controls, same it(): a different project, and a different workspace, are different questions.
    const other = renderHook(() => useBoard(createFakeDataSource({ getBoard: NEVER }), WS, 'p_other'));
    expect(other.result.current.data).toBeNull();
    const elsewhere = renderHook(() => useBoard(createFakeDataSource({ getBoard: NEVER }), 'ws_other', PROJECT));
    expect(elsewhere.result.current.data).toBeNull();
  });
});

describe('25.080 useTicketList serves its last answer for the project AND the filter at once', () => {
  it('a remount renders the cached rows on the first frame; the same project under another filter does not borrow them', async () => {
    const source = (getTickets: () => Promise<{ projectId: string; rows: ReturnType<typeof rows> }>) => createFakeDataSource({ getTickets });
    const first = renderHook(() => useTicketList(source(async () => ({ projectId: PROJECT, rows: rows('a', 'b') })), WS, PROJECT, 'me'));
    await waitFor(() => expect(first.result.current.rows).toHaveLength(2));
    first.unmount();
    const again = renderHook(() => useTicketList(source(NEVER), WS, PROJECT, 'me'));
    expect(again.result.current.rows).toHaveLength(2);
    const narrowed = renderHook(() => useTicketList(source(NEVER), WS, PROJECT, 'me', { stateCategories: ['active'] }));
    expect(narrowed.result.current.rows).toBeNull(); // a different question: no cached answer, and no previous rows to carry either
  });
});

describe('25.081 a filter change keeps the previous rows on screen — within the same project, and never across projects or a refusal', () => {
  function harness(getTickets: (projectId: string, filter: FilterSpec) => Promise<{ projectId: string; rows: ReturnType<typeof rows> }>) {
    const source = createFakeDataSource({ getTickets });
    return renderHook(
      ({ project, filter }: { project: string; filter: FilterSpec }) => useTicketList(source, WS, project, 'me', filter),
      { initialProps: { project: PROJECT, filter: {} as FilterSpec } },
    );
  }

  it('the rows survive a rekey of the same project', async () => {
    const view = harness(async (project, filter) =>
      Object.keys(filter).length === 0 ? { projectId: project, rows: rows('a', 'b') } : NEVER(),
    );
    await waitFor(() => expect(view.result.current.rows).toHaveLength(2));
    view.rerender({ project: PROJECT, filter: { stateCategories: ['active'] } });
    expect(view.result.current.rows).toHaveLength(2); // the filter toggle did not blank the list
    expect(view.result.current.rowsHaveAnswered).toBe(true);
  });

  it("another project's rows are never served under this project (control for the carry)", async () => {
    const view = harness(async (project) => (project === PROJECT ? { projectId: project, rows: rows('a', 'b') } : NEVER()));
    await waitFor(() => expect(view.result.current.rows).toHaveLength(2));
    view.rerender({ project: 'p_other', filter: {} });
    expect(view.result.current.rows).toBeNull();
  });

  it('a refused read withdraws the carried rows beside its error', async () => {
    const view = harness(async (project, filter) =>
      Object.keys(filter).length === 0 ? { projectId: project, rows: rows('a') } : Promise.reject(new Error('the walk was refused')),
    );
    await waitFor(() => expect(view.result.current.rows).toHaveLength(1));
    view.rerender({ project: PROJECT, filter: { stateCategories: ['active'] } });
    await waitFor(() => expect(view.result.current.error).toBe('the walk was refused'));
    expect(view.result.current.rows).toBeNull();
  });
});
