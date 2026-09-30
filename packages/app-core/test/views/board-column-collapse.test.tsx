import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import type { BoardCard, BoardColumn, BoardGroup, BoardView } from '../../src/view-types.js';
import { Board, type BoardMoveCapability } from '../../src/views/board.js';
import { COLUMN_COLLAPSE_KEY, columnCollapseKey } from '../../src/preferences/column-collapse.js';
import { WORKFLOW_COLLAPSE_KEY } from '../../src/preferences/workflow-collapse.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { WS, boardCardSeed, WF_ERRAND } from '../helpers/seed.js';

/**
 * Styling refresh Plan A Task 5B — cases 20.112–20.118 (§20.11). EVERY board
 * column collapses to a labelled strip (owner rulings 2026-09-29, "all columns
 * are collapsible"; plan D27, resolved): no category gate anywhere. Mounted the
 * way `board-workflow-collapse.test.tsx` mounts, with a `currentUserId` and a
 * project id, so the choice is remembered.
 *
 * jsdom draws nothing: this file proves the markup, the memory, the focus move
 * and the drop wiring. The strip's size, its vertical name and how a row of
 * strips looks belong to the browser check (Task 8).
 */
const USER = 'user_kiro';
const PROJECT = 'prj_00000000000000000000000001';

/** `WF_ERRAND`, with `doing → done` rules-free so a drop on Done is a direct move. */
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

let scrollIntoView: ReturnType<typeof vi.fn>;
beforeEach(() => {
  window.localStorage.clear();
  scrollIntoView = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView;
});

const card = (ticketId: string): BoardCard => boardCardSeed({ ticketId, title: `Ticket ${ticketId}` });

function columns(cards: { todo?: BoardCard[]; doing?: BoardCard[]; done?: BoardCard[] } = {}): BoardColumn[] {
  return [
    { stateId: 'todo', name: 'To do', category: 'open', blocked: false, creatable: true, cards: cards.todo ?? [] },
    { stateId: 'doing', name: 'Doing', category: 'active', blocked: false, creatable: true, cards: cards.doing ?? [card('tk_doing')] },
    {
      stateId: 'done',
      name: 'Done',
      category: 'terminal',
      blocked: false,
      creatable: false,
      cards: cards.done ?? [card('tk_d1'), card('tk_d2')],
    },
  ];
}

function errand(cols: BoardColumn[] = columns()): BoardGroup {
  return { workflowId: 'wf-errand', workflowVersion: 1, workflowName: 'Errand', columns: cols };
}

/** A second workflow whose open state shares the id `todo` — the 20.117 mutation arm. */
function other(): BoardGroup {
  return {
    workflowId: 'wf-other',
    workflowVersion: 1,
    workflowName: 'Other',
    columns: [
      { stateId: 'todo', name: 'To do', category: 'open', blocked: false, creatable: true, cards: [card('tk_o1')] },
      { stateId: 'done', name: 'Done', category: 'terminal', blocked: false, creatable: false, cards: [card('tk_o2')] },
    ],
  };
}

const boardOf = (...groups: BoardGroup[]): BoardView => ({ projectId: PROJECT, groups });

function setup(board: BoardView, options: { userId?: string | undefined; withUser?: boolean } = {}) {
  const source = createFakeDataSource({ getWorkflowDef: async () => WF });
  const onMoved = vi.fn();
  const moves: BoardMoveCapability = { dataSource: source, workspaceId: WS, currentUserId: USER, onMoved };
  const userId = options.withUser === false ? undefined : (options.userId ?? USER);
  const ui = (view: BoardView) => (
    <Board board={view} onOpenTicket={() => {}} onCreateTicket={() => {}} moves={moves} currentUserId={userId} />
  );
  const result = render(ui(board));
  return { ...result, source, onMoved, rerenderBoard: (view: BoardView) => result.rerender(ui(view)) };
}

async function settled(): Promise<void> {
  await waitFor(() => expect(screen.getAllByRole('button', { name: /Move to/ }).length).toBeGreaterThan(0));
}

/** One workflow group's section, found through its own heading. */
function groupOf(name: string): HTMLElement {
  const heading = screen.getByRole('heading', { level: 2, name });
  const section = heading.closest('.gn-board__group');
  if (!(section instanceof HTMLElement)) throw new Error(`no group section for ${name}`);
  return section;
}

const columnIn = (groupName: string, stateId: string): HTMLElement => {
  const found = groupOf(groupName).querySelector(`[data-testid="board-column-${stateId}"]`);
  if (!(found instanceof HTMLElement)) throw new Error(`no column ${stateId} in ${groupName}`);
  return found;
};

const collapseButton = (column: HTMLElement, name: string) => within(column).getByRole('button', { name: `Collapse ${name}` });
const stripButton = (column: HTMLElement) => within(column).getByRole('button', { name: /^Expand / });

function fakeDataTransfer(): DataTransfer {
  const store = new Map<string, string>();
  return {
    setData: (format: string, data: string) => {
      store.set(format, data);
    },
    getData: (format: string) => store.get(format) ?? '',
    effectAllowed: 'uninitialized',
  } as unknown as DataTransfer;
}

const storedChoices = (): unknown => JSON.parse(window.localStorage.getItem(COLUMN_COLLAPSE_KEY) ?? 'null');

describe('20.112 every column carries the collapse control', () => {
  it('20.112 one 44px ghost Collapse button per column, controlling its own card list, after Close all', async () => {
    const { container } = setup(boardOf(errand()));
    await settled();

    const buttons = screen.getAllByRole('button', { name: /^Collapse / });
    // CONTROL — the count of controls IS the count of columns, whatever their category.
    expect(buttons).toHaveLength(container.querySelectorAll('.gn-board__column').length);
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      expect(button.getAttribute('aria-expanded')).toBe('true');
      const list = document.getElementById(button.getAttribute('aria-controls') ?? '');
      expect(list?.tagName, `${button.getAttribute('aria-label')} controls no list`).toBe('UL');
      expect(button.closest('section')?.contains(list)).toBe(true);
      expect(button.className).toContain('gn-board__column-collapse');
    }
    // In a terminal column that shows Close all, the toggle is its next sibling.
    const closeAll = screen.getByText('Close all (2)');
    expect(closeAll.nextElementSibling).toBe(collapseButton(columnIn('Errand', 'done'), 'Done'));
  });
});

describe('20.113 a collapsed column is one labelled strip', () => {
  it('20.113 only Expand <name>, <n> tickets remains; focus follows; expanding restores', async () => {
    const user = userEvent.setup();
    setup(boardOf(errand()));
    await settled();
    const done = columnIn('Errand', 'done');

    await user.click(collapseButton(done, 'Done'));

    const same = columnIn('Errand', 'done');
    expect(same).toBe(done); // the SAME section, not a replacement
    expect(same.getAttribute('role')).toBe('region');
    expect(same.getAttribute('aria-label')).toBe('Done');
    expect(same.classList.contains('gn-board__column--collapsed')).toBe(true);
    const buttons = within(same).getAllByRole('button');
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Expand Done, 2 tickets']);
    expect(buttons[0]!.getAttribute('aria-expanded')).toBe('false');
    expect(buttons[0]!.hasAttribute('aria-controls')).toBe(false);
    expect(within(same).getByText('Done')).toBeInTheDocument(); // the name is visible…
    expect(same.querySelector('.gn-board__count')?.textContent).toBe('2'); // …with the count
    expect(same.querySelector('ul')).toBeNull();
    expect(screen.queryByText('Close all (2)')).toBeNull();
    expect(document.activeElement).toBe(buttons[0]);

    await user.click(buttons[0]!);
    expect(within(columnIn('Errand', 'done')).getByRole('button', { name: 'Collapse Done' })).toBe(document.activeElement);
    expect(screen.getByText('Close all (2)')).toBeInTheDocument();
    expect(columnIn('Errand', 'done').querySelector('ul')).not.toBeNull();
  });

  it('20.113 CONTROL: an empty column is named Expand Done, 0 tickets, and one card reads 1 ticket', async () => {
    const user = userEvent.setup();
    setup(boardOf(errand(columns({ done: [], doing: [card('tk_doing')] }))));
    await settled();
    await user.click(collapseButton(columnIn('Errand', 'done'), 'Done'));
    expect(stripButton(columnIn('Errand', 'done')).getAttribute('aria-label')).toBe('Expand Done, 0 tickets');
    await user.click(collapseButton(columnIn('Errand', 'doing'), 'Doing'));
    expect(stripButton(columnIn('Errand', 'doing')).getAttribute('aria-label')).toBe('Expand Doing, 1 ticket');
  });
});

describe('20.114 a collapsed column is still a drop target', () => {
  it('20.114 dropping on the strip moves the ticket, the count follows, the column stays collapsed', async () => {
    const user = userEvent.setup();
    const { source, onMoved, rerenderBoard } = setup(boardOf(errand()));
    await settled();
    await user.click(collapseButton(columnIn('Errand', 'done'), 'Done'));

    // CONTROL first: the same drop on an EXPANDED column makes the same move.
    const controlTransfer = fakeDataTransfer();
    fireEvent.dragStart(screen.getByTestId('ticket-card-tk_doing'), { dataTransfer: controlTransfer });
    fireEvent.drop(columnIn('Errand', 'todo'), { dataTransfer: controlTransfer });
    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
    expect(source.ingested[0]![0]!.payload).toEqual({ to: 'todo' });

    const dataTransfer = fakeDataTransfer();
    fireEvent.dragStart(screen.getByTestId('ticket-card-tk_doing'), { dataTransfer });
    fireEvent.drop(columnIn('Errand', 'done'), { dataTransfer });
    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(2));
    expect(source.ingested[1]![0]!.payload).toEqual({ to: 'done' });

    // The reload: the card now lives in Done, and the strip still shows collapsed.
    rerenderBoard(boardOf(errand(columns({ doing: [], done: [card('tk_d1'), card('tk_d2'), card('tk_doing')] }))));
    const strip = stripButton(columnIn('Errand', 'done'));
    expect(strip.getAttribute('aria-label')).toBe('Expand Done, 3 tickets');
    expect(strip.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('20.115 the choice is remembered per user and project', () => {
  it('20.115 survives a remount for the same user; another user, and no session, see it expanded', async () => {
    const user = userEvent.setup();
    const first = setup(boardOf(errand()));
    await settled();
    await user.click(collapseButton(columnIn('Errand', 'done'), 'Done'));
    expect(storedChoices()).toEqual({ userId: USER, projects: { [PROJECT]: { [columnCollapseKey('wf-errand', 'done')]: false } } });
    first.unmount();

    const again = setup(boardOf(errand()));
    expect(stripButton(columnIn('Errand', 'done')).getAttribute('aria-expanded')).toBe('false');
    // CONTROL — expanding again records `true`; it does not delete the key.
    await user.click(stripButton(columnIn('Errand', 'done')));
    expect(storedChoices()).toEqual({ userId: USER, projects: { [PROJECT]: { [columnCollapseKey('wf-errand', 'done')]: true } } });
    await user.click(collapseButton(columnIn('Errand', 'done'), 'Done'));
    again.unmount();

    const stranger = setup(boardOf(errand()), { userId: 'usr_grace' });
    expect(within(columnIn('Errand', 'done')).queryByRole('button', { name: 'Collapse Done' })).not.toBeNull();
    stranger.unmount();

    window.localStorage.clear();
    setup(boardOf(errand()), { withUser: false });
    await user.click(collapseButton(columnIn('Errand', 'done'), 'Done'));
    expect(stripButton(columnIn('Errand', 'done'))).toBeInTheDocument(); // it changed for this session…
    expect(window.localStorage.getItem(COLUMN_COLLAPSE_KEY)).toBeNull(); // …and wrote nothing
  });
});

describe('20.117 a non-terminal column collapses exactly as Done does', () => {
  it('20.117 an open (empty, creatable) and an active column each leave one Expand button; drops still land; own key', async () => {
    const user = userEvent.setup();
    const { onMoved, source } = setup(boardOf(errand()));
    await settled();
    const todo = columnIn('Errand', 'todo');
    expect(within(todo).getByRole('button', { name: 'Add a ticket' })).toBeInTheDocument();

    await user.click(collapseButton(todo, 'To do'));
    expect(within(columnIn('Errand', 'todo')).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Expand To do, 0 tickets',
    ]);
    expect(within(columnIn('Errand', 'todo')).queryByRole('button', { name: 'Add a ticket' })).toBeNull();

    await user.click(collapseButton(columnIn('Errand', 'doing'), 'Doing'));
    expect(within(columnIn('Errand', 'doing')).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Expand Doing, 1 ticket',
    ]);
    expect(within(columnIn('Errand', 'doing')).queryByText('Ticket tk_doing')).toBeNull();

    // CONTROL — Done, untouched, still carries its own control.
    expect(within(columnIn('Errand', 'done')).getByRole('button', { name: 'Collapse Done' })).toBeInTheDocument();
    expect(storedChoices()).toEqual({
      userId: USER,
      projects: {
        [PROJECT]: { [columnCollapseKey('wf-errand', 'todo')]: false, [columnCollapseKey('wf-errand', 'doing')]: false },
      },
    });

    const dataTransfer = fakeDataTransfer();
    fireEvent.dragStart(screen.getByTestId('ticket-card-tk_d1'), { dataTransfer });
    fireEvent.drop(columnIn('Errand', 'todo'), { dataTransfer });
    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
    expect(source.ingested[0]![0]!.payload).toEqual({ to: 'todo' });
  });

  it('20.117 the memory is per workflow: a second workflow sharing the state id is untouched', async () => {
    const user = userEvent.setup();
    setup(boardOf(errand(), other()));
    await settled();
    await user.click(collapseButton(columnIn('Errand', 'todo'), 'To do'));
    expect(columnIn('Errand', 'todo').classList.contains('gn-board__column--collapsed')).toBe(true);
    expect(columnIn('Other', 'todo').classList.contains('gn-board__column--collapsed')).toBe(false);
    expect(within(columnIn('Other', 'todo')).getByRole('button', { name: 'Collapse To do' })).toBeInTheDocument();
  });
});

describe('20.118 every column collapsed still leaves a usable board', () => {
  it('20.118 a row of strips in tab order, the group heading and rail intact, expanding one restores that one', async () => {
    const user = userEvent.setup();
    setup(boardOf(errand()));
    await settled();
    for (const [stateId, name] of [['todo', 'To do'], ['doing', 'Doing'], ['done', 'Done']] as const) {
      await user.click(collapseButton(columnIn('Errand', stateId), name));
    }

    const group = groupOf('Errand');
    const rail = group.querySelector('.gn-board__rail') as HTMLElement;
    const sections = [...rail.querySelectorAll('section')];
    expect(sections).toHaveLength(3);
    for (const section of sections) expect(section.classList.contains('gn-board__column--collapsed')).toBe(true);
    expect(rail.hasAttribute('hidden')).toBe(false);
    const heading = screen.getByRole('heading', { level: 2, name: 'Errand' });
    expect(heading.querySelector('button')).not.toBeNull();

    // Tab order: the group toggle, then the strips left to right.
    heading.querySelector('button')!.focus();
    const visited: string[] = [];
    for (let step = 0; step < 3; step += 1) {
      await user.tab();
      visited.push(document.activeElement?.getAttribute('aria-label') ?? '(none)');
    }
    expect(visited).toEqual(['Expand To do, 0 tickets', 'Expand Doing, 1 ticket', 'Expand Done, 2 tickets']);

    // Expanding one strip restores that column alone.
    await user.click(stripButton(columnIn('Errand', 'doing')));
    expect(columnIn('Errand', 'doing').classList.contains('gn-board__column--collapsed')).toBe(false);
    expect(columnIn('Errand', 'todo').classList.contains('gn-board__column--collapsed')).toBe(true);
    expect(columnIn('Errand', 'done').classList.contains('gn-board__column--collapsed')).toBe(true);
  });

  it('20.118 a card dragged from an expanded column drops on a collapsed strip beside it', async () => {
    const user = userEvent.setup();
    const { onMoved, source } = setup(boardOf(errand()));
    await settled();
    // A card cannot be dragged FROM a collapsed column (none are rendered), so the source stays open.
    await user.click(collapseButton(columnIn('Errand', 'todo'), 'To do'));
    await user.click(collapseButton(columnIn('Errand', 'doing'), 'Doing'));
    const dataTransfer = fakeDataTransfer();
    fireEvent.dragStart(screen.getByTestId('ticket-card-tk_d1'), { dataTransfer });
    fireEvent.drop(columnIn('Errand', 'doing'), { dataTransfer }); // the middle strip
    await waitFor(() => expect(onMoved).toHaveBeenCalledTimes(1));
    expect(source.ingested[0]![0]!.payload).toEqual({ to: 'doing' });
  });

  it('20.118 CONTROL: collapsing the workflow group hides the strips; expanding it shows them, still collapsed', async () => {
    const user = userEvent.setup();
    setup(boardOf(errand()));
    await settled();
    for (const [stateId, name] of [['todo', 'To do'], ['doing', 'Doing'], ['done', 'Done']] as const) {
      await user.click(collapseButton(columnIn('Errand', stateId), name));
    }
    const rail = groupOf('Errand').querySelector('.gn-board__rail') as HTMLElement;
    const toggle = screen.getByRole('heading', { level: 2, name: 'Errand' }).querySelector('button')!;
    await user.click(toggle);
    expect(rail.hasAttribute('hidden')).toBe(true);
    await user.click(toggle);
    expect(rail.hasAttribute('hidden')).toBe(false);
    for (const section of rail.querySelectorAll('section')) {
      expect(section.classList.contains('gn-board__column--collapsed')).toBe(true);
    }
    // Two independent memories: the group key was written apart from the column key.
    expect(window.localStorage.getItem(WORKFLOW_COLLAPSE_KEY)).not.toBeNull();
    expect(window.localStorage.getItem(COLUMN_COLLAPSE_KEY)).not.toBeNull();
  });
});
