import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import type { BoardCard, BoardColumn, BoardView } from '../../src/view-types.js';
import { Board, type BoardMoveCapability } from '../../src/views/board.js';
import { COLUMN_COLLAPSE_KEY, columnCollapseKey } from '../../src/preferences/column-collapse.js';
import { SPRING_DELAY_MS } from '../../src/views/board-motion.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { WS, boardCardSeed, WF_ERRAND } from '../helpers/seed.js';

/**
 * Optimistic board moves (owner, 2026-10-01), point 4 — spring-loaded collapsed columns. Cases 20.139–20.143:
 * 20.139 a drag held over a collapsed legal column opens it after SPRING_DELAY_MS, writing nothing to the
 * collapse memory; 20.140 leaving (before or after the delay) puts it back; 20.141 a drop keeps it open AND
 * records that; 20.142 an illegal column never springs; 20.143 Esc / dragend re-collapses. The timers are
 * fake (only `setTimeout`, so `waitFor` keeps its own clock); jsdom draws nothing, so "open" is the markup.
 */
const USER = 'user_kiro';
const PROJECT = 'prj_00000000000000000000000001';

/** `WF_ERRAND` with `doing → done` rules-free, so a drop on Done is legal for Doing's card; there is no edge `todo → done`, so it is refused for To do's. */
const WF: WorkflowDef = {
  ...WF_ERRAND,
  transitions: [
    { from: '*', to: 'todo', rules: [] },
    { from: 'todo', to: 'doing', rules: [] },
    { from: 'doing', to: 'waiting', rules: [] },
    { from: 'waiting', to: 'doing', rules: [] },
    { from: 'doing', to: 'done', rules: [] },
    { from: 'done', to: 'doing', rules: [] },
  ],
};

const card = (ticketId: string): BoardCard => boardCardSeed({ ticketId, title: `Ticket ${ticketId}` });
const column = (stateId: string, name: string, category: BoardColumn['category'], cards: BoardCard[]): BoardColumn => ({
  stateId,
  name,
  category,
  blocked: false,
  creatable: category !== 'terminal',
  cards,
});
const board = (): BoardView => ({
  projectId: PROJECT,
  groups: [
    {
      workflowId: 'wf-errand',
      workflowVersion: 1,
      workflowName: 'Errand',
      columns: [
        column('todo', 'To do', 'open', [card('tk_todo')]),
        column('doing', 'Doing', 'active', [card('tk_doing')]),
        column('waiting', 'Waiting on counterparty', 'active', []),
        column('done', 'Done', 'terminal', [card('tk_d1')]),
      ],
    },
  ],
});

beforeEach(() => {
  window.localStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => vi.useRealTimers());

async function mount() {
  const user = userEvent.setup();
  const onMoved = vi.fn();
  const source = createFakeDataSource({ getWorkflowDef: async () => WF });
  const moves: BoardMoveCapability = { dataSource: source, workspaceId: WS, currentUserId: USER, onMoved };
  render(<Board board={board()} onOpenTicket={() => {}} onCreateTicket={() => {}} moves={moves} currentUserId={USER} />);
  await waitFor(() => expect(screen.getAllByRole('button', { name: /Move to/ }).length).toBeGreaterThan(0));
  // Collapse Done (and, for the illegal case, To do is left open): the memory now holds `false` for Done.
  await user.click(within(columnOf('done')).getByRole('button', { name: 'Collapse Done' }));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  return { source, onMoved };
}

const columnOf = (stateId: string) => screen.getByTestId(`board-column-${stateId}`);
const isCollapsed = (stateId: string) => columnOf(stateId).classList.contains('gn-board__column--collapsed');
const stored = (): unknown => JSON.parse(window.localStorage.getItem(COLUMN_COLLAPSE_KEY) ?? 'null');
const DONE_KEY = columnCollapseKey('wf-errand', 'done');

function dragData(): DataTransfer {
  const store = new Map<string, string>();
  const types: string[] = [];
  return {
    setData: (format: string, data: string) => {
      store.set(format, data);
      if (!types.includes(format)) types.push(format);
    },
    getData: (format: string) => store.get(format) ?? '',
    effectAllowed: 'uninitialized',
    dropEffect: 'move',
    types,
  } as unknown as DataTransfer;
}

/** Pick the card up (from the column the test names) and hold the pointer over `stateId`'s column. */
function dragOnto(ticketId: string, stateId: string): DataTransfer {
  const dataTransfer = dragData();
  fireEvent.dragStart(screen.getByTestId(`ticket-card-${ticketId}`), { dataTransfer });
  fireEvent.dragEnter(columnOf(stateId), { dataTransfer });
  return dataTransfer;
}
const wait = (ms: number) => act(async () => void vi.advanceTimersByTime(ms));

describe('20.139 a drag held over a collapsed legal column opens it after the delay — and writes nothing', () => {
  it('20.139 still a strip just before SPRING_DELAY_MS, open at it; the collapse memory is untouched', async () => {
    await mount();
    expect(SPRING_DELAY_MS).toBe(600);
    const before = stored();
    expect(before).not.toBeNull(); // CONTROL — the memory really holds Done's choice, so "untouched" can be told apart
    dragOnto('tk_doing', 'done');
    await wait(SPRING_DELAY_MS - 1);
    expect(isCollapsed('done')).toBe(true);
    await wait(1);
    expect(isCollapsed('done')).toBe(false);
    expect(columnOf('done').querySelector('ul')).not.toBeNull();
    expect(stored()).toEqual(before);
  });
});

describe('20.140 leaving puts it back; leaving early cancels the wait', () => {
  it('20.140 a leave before the delay never opens it (CONTROL: the same hold, uninterrupted, does)', async () => {
    await mount();
    const dataTransfer = dragOnto('tk_doing', 'done');
    await wait(SPRING_DELAY_MS - 100);
    fireEvent.dragLeave(columnOf('done'), { dataTransfer, relatedTarget: columnOf('doing') });
    await wait(SPRING_DELAY_MS * 2);
    expect(isCollapsed('done')).toBe(true);

    fireEvent.dragEnter(columnOf('done'), { dataTransfer });
    await wait(SPRING_DELAY_MS);
    expect(isCollapsed('done')).toBe(false); // CONTROL
  });

  it('20.140 leaving a sprung column collapses it again and leaves the memory as it was', async () => {
    await mount();
    const before = stored();
    const dataTransfer = dragOnto('tk_doing', 'done');
    await wait(SPRING_DELAY_MS);
    expect(isCollapsed('done')).toBe(false);
    // The pointer goes to a column OUTSIDE it: a real leave, whatever the enter/leave count holds.
    fireEvent.dragLeave(columnOf('done'), { dataTransfer, relatedTarget: columnOf('doing') });
    expect(isCollapsed('done')).toBe(true);
    expect(stored()).toEqual(before);
  });
});

describe('20.141 a drop on a sprung column keeps it open and remembers that', () => {
  it('20.141 the card moves, Done stays expanded, and the memory now says expanded', async () => {
    const { source, onMoved } = await mount();
    const dataTransfer = dragOnto('tk_doing', 'done');
    await wait(SPRING_DELAY_MS);
    fireEvent.drop(columnOf('done'), { dataTransfer });
    await act(async () => {
      vi.useRealTimers();
    });
    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
    expect(source.ingested[0]![0]!.payload).toEqual({ to: 'done' });
    expect(isCollapsed('done')).toBe(false);
    const projects = (stored() as { projects: Record<string, Record<string, boolean>> }).projects;
    expect(projects[PROJECT]![DONE_KEY]).toBe(true);
  });

  it('20.141 CONTROL: a drop on the strip BEFORE it sprang moves the card but leaves the column collapsed', async () => {
    const { onMoved } = await mount();
    const dataTransfer = dragOnto('tk_doing', 'done');
    await wait(SPRING_DELAY_MS - 100);
    fireEvent.drop(columnOf('done'), { dataTransfer });
    vi.useRealTimers();
    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
    expect(isCollapsed('done')).toBe(true);
    const projects = (stored() as { projects: Record<string, Record<string, boolean>> }).projects;
    expect(projects[PROJECT]![DONE_KEY]).toBe(false);
  });
});

describe('20.142 an illegal column never springs', () => {
  it('20.142 Done is refused for a To do card: held as long as you like, it stays a strip (CONTROL: legal for Doing’s card)', async () => {
    await mount();
    dragOnto('tk_todo', 'done');
    await wait(SPRING_DELAY_MS * 3);
    expect(isCollapsed('done')).toBe(true);
    expect(columnOf('done').classList.contains('gn-board__column--drop-refused')).toBe(true);
    fireEvent.dragEnd(screen.getByTestId('ticket-card-tk_todo'));

    dragOnto('tk_doing', 'done');
    await wait(SPRING_DELAY_MS);
    expect(isCollapsed('done')).toBe(false); // CONTROL
  });
});

describe('20.143 Esc / dragend puts a sprung column back', () => {
  it('20.143 a drag that ends without a drop collapses it again', async () => {
    await mount();
    const dataTransfer = dragOnto('tk_doing', 'done');
    await wait(SPRING_DELAY_MS);
    expect(isCollapsed('done')).toBe(false); // CONTROL — it was open
    fireEvent.dragEnd(screen.getByTestId('ticket-card-tk_doing'), { dataTransfer });
    expect(isCollapsed('done')).toBe(true);
  });

  it('20.143 a dragend that reaches only the document (the source card is gone) does too', async () => {
    await mount();
    dragOnto('tk_doing', 'done');
    await wait(SPRING_DELAY_MS);
    expect(isCollapsed('done')).toBe(false);
    act(() => void document.dispatchEvent(new Event('dragend', { bubbles: true })));
    expect(isCollapsed('done')).toBe(true);
  });
});
