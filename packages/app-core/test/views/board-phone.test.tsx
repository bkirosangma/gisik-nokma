import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestResult, WorkflowDef } from '@gisik-nokma/domain';
import type { BoardCard, BoardGroup, BoardView } from '../../src/view-types.js';
import { Board, type BoardMoveCapability } from '../../src/views/board.js';
import { PHONE_BOARD_QUERY } from '../../src/views/use-phone-board.js';
import { COLUMN_COLLAPSE_KEY, columnCollapseKey, rememberColumnCollapse } from '../../src/preferences/column-collapse.js';
import { createFakeDataSource, type IngestScript } from '../helpers/fake-data-source.js';
import { WS, boardCardSeed, WF_ERRAND } from '../helpers/seed.js';

/**
 * Mobile plan Task 4 — the board on a phone, cases 21.040–21.049 (§21.4; 21.044 lives in
 * `board-arrows.test.ts`, 21.040's and 21.050's stylesheet halves in `packages/ui/test/board-phone-css.test.ts`).
 *
 * jsdom has no layout, so the phone is a stubbed `matchMedia`;
 * what the screen looks like at 375px is the controller's browser pass (🧪), not these.
 */
const USER = 'user_kiro';
const PROJECT = 'prj_00000000000000000000000001';
const COLUMN_WIDTH = 400;

let scrollIntoView: ReturnType<typeof vi.fn>;
let scrollTo: ReturnType<typeof vi.fn>;

/** A phone viewport (and, optionally, a reduced-motion preference): `matchMedia` answers per query. */
function viewport(options: { phone: boolean; reducedMotion?: boolean }): void {
  window.matchMedia = ((query: string) => ({
    matches: query === PHONE_BOARD_QUERY ? options.phone : query.includes('prefers-reduced-motion') ? options.reducedMotion === true : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  window.localStorage.clear();
  scrollIntoView = vi.fn();
  scrollTo = vi.fn();
  Element.prototype.scrollIntoView = scrollIntoView as unknown as typeof Element.prototype.scrollIntoView;
  window.scrollTo = scrollTo as unknown as typeof window.scrollTo;
  viewport({ phone: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(window, 'matchMedia');
  vi.restoreAllMocks();
});

const card = (ticketId: string): BoardCard => boardCardSeed({ ticketId, title: `Ticket ${ticketId}` });

function errandGroup(cards: Record<string, string[]> = { todo: ['tk_a'], doing: ['tk_b'], waiting: [], done: [] }): BoardGroup {
  const col = (stateId: string, name: string, category: 'open' | 'active' | 'terminal', blocked = false) => ({
    stateId,
    name,
    category,
    blocked,
    creatable: category !== 'terminal',
    cards: (cards[stateId] ?? []).map(card),
  });
  return {
    workflowId: 'wf-errand',
    workflowVersion: 1,
    workflowName: 'Errand',
    columns: [
      col('todo', 'To do', 'open'),
      col('doing', 'Doing', 'active'),
      col('waiting', 'Waiting on counterparty', 'active', true),
      col('done', 'Done', 'terminal'),
    ],
  };
}
const boardOf = (...groups: BoardGroup[]): BoardView => ({ projectId: PROJECT, groups });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const committed = (events: { id: string }[]): IngestResult[] =>
  events.map((event) => ({ status: 'committed' as const, eventId: event.id, seq: 1, serverTime: '2026-10-01T09:00:00.000Z' }));
const refused = (events: { id: string }[]): IngestResult[] =>
  events.map((event) => ({ status: 'refused' as const, eventId: event.id, rule: 'some-rule', reason: 'Not allowed right now.' }));

async function mount(view: BoardView, workflow: WorkflowDef = WF_ERRAND, ingest?: IngestScript) {
  const source = createFakeDataSource({ getWorkflowDef: async () => workflow }, ingest);
  const onMoved = vi.fn();
  const moves: BoardMoveCapability = { dataSource: source, workspaceId: WS, currentUserId: USER, onMoved };
  const utils = render(<Board board={view} onOpenTicket={() => {}} moves={moves} currentUserId={USER} />);
  await waitFor(() => expect(screen.getAllByRole('button', { name: /Move to/ }).length).toBeGreaterThan(0));
  return { source, onMoved, ...utils };
}

const columnOf = (stateId: string) => screen.getByTestId(`board-column-${stateId}`);
const slotOf = (ticketId: string) => screen.getByTestId(`ticket-card-${ticketId}`);
const idsIn = (stateId: string) =>
  [...within(columnOf(stateId)).getByRole('list', { hidden: true }).children]
    .map((child) => child.getAttribute('data-testid') ?? '')
    .filter((id) => id.startsWith('ticket-card-'))
    .map((id) => id.slice('ticket-card-'.length));
const picker = () => screen.getByRole('tablist', { name: 'Column' });
const tabNames = () => within(picker()).getAllByRole('tab').map((tab) => tab.textContent);
const selectedTab = () => within(picker()).getAllByRole('tab').filter((tab) => tab.getAttribute('aria-selected') === 'true').map((tab) => tab.textContent);
/** UX T7 (23.120): only the picked column is in the page on a phone, so a card in another column is reached by picking it first. */
async function showColumn(name: RegExp): Promise<void> {
  await userEvent.setup().click(within(picker()).getByRole('tab', { name }));
}
/** `hidden: true` — a card that has just moved lands in a column the phone does not show (23.120), and its controls are still the subject. */
const moveButtonIn = (ticketId: string) => within(slotOf(ticketId)).getByRole('button', { name: 'Move to another state', hidden: true });

/** Open the Move dialog's destination list and return the option names. */
async function offered(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement, slotId: string): Promise<string[]> {
  await user.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
  expect(slotOf(slotId)).toContainElement(dialog);
  await user.click(within(dialog).getByRole('button', { name: /Move to/ }));
  const listbox = await screen.findByRole('listbox');
  return within(listbox)
    .getAllByRole('option')
    .map((option) => option.textContent ?? '');
}

describe('21.040 at phone width every column is expanded, and the collapse memory is left alone', () => {
  const collapseWaiting = () =>
    rememberColumnCollapse(USER, PROJECT, { [columnCollapseKey('wf-errand', 'waiting')]: false });

  it('21.040 a column remembered as collapsed renders its cards and no strip on a phone; the stored choice is byte-identical', async () => {
    collapseWaiting();
    const before = window.localStorage.getItem(COLUMN_COLLAPSE_KEY);
    expect(before).not.toBeNull();
    await mount(boardOf(errandGroup({ todo: ['tk_a'], doing: ['tk_b'], waiting: ['tk_w'], done: [] })));

    expect(screen.queryByRole('button', { name: /^Expand / })).toBeNull();
    expect(within(columnOf('waiting')).getByRole('list', { hidden: true })).toBeInTheDocument();
    expect(idsIn('waiting')).toEqual(['tk_w']);
    expect(window.localStorage.getItem(COLUMN_COLLAPSE_KEY)).toBe(before);
  });

  it('21.040 CONTROL — above the phone breakpoint the very same memory still collapses the column to a strip', async () => {
    viewport({ phone: false });
    collapseWaiting();
    await mount(boardOf(errandGroup({ todo: ['tk_a'], doing: ['tk_b'], waiting: ['tk_w'], done: [] })));

    expect(within(columnOf('waiting')).getByRole('button', { name: /^Expand Waiting on counterparty/ })).toBeInTheDocument();
    expect(screen.queryByTestId('ticket-card-tk_w')).toBeNull();
    expect(screen.queryByRole('tablist', { name: 'Column' })).toBeNull();
  });

  it('21.040 the JS phone query and the stylesheet arm are the SAME width', () => {
    const css = readFileSync(join(__dirname, '../../../ui/src/ui.css'), 'utf8');
    expect(PHONE_BOARD_QUERY).toBe('(max-width: 40rem)');
    expect(css).toContain(`@media ${PHONE_BOARD_QUERY}`);
  });
});

describe('21.041 the picker lists every column, collapsed ones included, as "<name> <count>"', () => {
  it('21.041 four columns, one of them remembered as collapsed, are four options with their counts', async () => {
    rememberColumnCollapse(USER, PROJECT, { [columnCollapseKey('wf-errand', 'waiting')]: false });
    await mount(boardOf(errandGroup({ todo: ['tk_a', 'tk_c'], doing: ['tk_b'], waiting: [], done: [] })));

    expect(tabNames()).toEqual(['To do 2', 'Doing 1', 'Waiting on counterparty 0', 'Done 0']);
  });

  it('21.041 CONTROL — a group with ONE column still renders the picker, with one option', async () => {
    const single: BoardGroup = { ...errandGroup(), columns: errandGroup().columns.slice(0, 1) };
    await mount(boardOf(single));
    expect(tabNames()).toEqual(['To do 1']);
  });
});

describe('21.042 picking a column shows it and marks it selected (UX T7: no scrolling — the other columns leave the page)', () => {
  it('21.042 picking Doing marks its option selected and shows that column alone; the window does not move and nothing scrolls', async () => {
    const user = userEvent.setup();
    await mount(boardOf(errandGroup()));
    expect(selectedTab()).toEqual(['To do 1']); // CONTROL — it starts on the first column
    expect(columnOf('doing')).toHaveAttribute('hidden');

    await user.click(within(picker()).getByRole('tab', { name: 'Doing 1' }));

    expect(selectedTab()).toEqual(['Doing 1']);
    expect(columnOf('doing')).not.toHaveAttribute('hidden');
    expect(columnOf('todo')).toHaveAttribute('hidden');
    expect(columnOf('doing').closest('.gn-board__rail')).not.toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(scrollTo).not.toHaveBeenCalled();
    expect(window.scrollY).toBe(0);
  });

  it('21.042 reduced motion changes nothing: there is no scroll to make smooth or instant', async () => {
    viewport({ phone: true, reducedMotion: true });
    const user = userEvent.setup();
    await mount(boardOf(errandGroup()));
    await user.click(within(picker()).getByRole('tab', { name: 'Done 0' }));
    expect(selectedTab()).toEqual(['Done 0']);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});

describe('21.043 the selection is the picker\'s own state, and a scroll of the rail never moves it (UX T7 retired the scroll listener)', () => {
  it('21.043 a scroll event on the rail leaves the selected option where the picker put it', async () => {
    const user = userEvent.setup();
    await mount(boardOf(errandGroup()));
    const rail = columnOf('todo').closest<HTMLElement>('.gn-board__rail');
    if (rail === null) throw new Error('no rail');
    await user.click(within(picker()).getByRole('tab', { name: 'Doing 1' }));
    Object.defineProperty(rail, 'scrollLeft', { configurable: true, value: 2 * COLUMN_WIDTH });
    fireEvent.scroll(rail);
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(selectedTab()).toEqual(['Doing 1']);
  });

  it('21.043 a selected column that no longer exists reads as the FIRST column, not as nothing', async () => {
    const user = userEvent.setup();
    const { source, onMoved, rerender } = await mount(boardOf(errandGroup()));
    await user.click(within(picker()).getByRole('tab', { name: 'Waiting on counterparty 0' }));
    expect(selectedTab()).toEqual(['Waiting on counterparty 0']); // CONTROL — the pick took

    const withoutWaiting = errandGroup();
    withoutWaiting.columns = withoutWaiting.columns.filter((column) => column.stateId !== 'waiting');
    const moves: BoardMoveCapability = { dataSource: source, workspaceId: WS, currentUserId: USER, onMoved };
    rerender(<Board board={boardOf(withoutWaiting)} onOpenTicket={() => {}} moves={moves} currentUserId={USER} />);

    expect(tabNames()).toEqual(['To do 1', 'Doing 1', 'Done 0']);
    expect(selectedTab()).toEqual(['To do 1']);
    expect(columnOf('todo')).not.toHaveAttribute('hidden');
  });
});

describe('21.045 the Move button opens the same dialog over EVERY board destination', () => {
  it('21.045 Move on a Doing card offers To do, Waiting and Done (both directions); › still offers only the forward two', async () => {
    const user = userEvent.setup();
    await mount(boardOf(errandGroup()));
    await showColumn(/^Doing/);

    const all = await offered(user, moveButtonIn('tk_b'), 'tk_b');
    expect(all.map((name) => name.split(' — ')[0])).toEqual(['To do', 'Waiting on counterparty', 'Done']);
    cleanup();
    await mount(boardOf(errandGroup()));
    await showColumn(/^Doing/);

    // CONTROL — the arrows are unchanged: › is the forward list only.
    const forward = await offered(user, within(slotOf('tk_b')).getByRole('button', { name: /^Move to next state/ }), 'tk_b');
    expect(forward.map((name) => name.split(' — ')[0])).toEqual(['Waiting on counterparty', 'Done']);
  });
});

describe('21.046 a branching workflow lists BOTH branches; a single target is listed once and preselected', () => {
  it('21.046 Doing → Waiting | Done are both in the list; a To do card is offered Doing alone, already chosen', async () => {
    const user = userEvent.setup();
    await mount(boardOf(errandGroup()));
    await showColumn(/^Doing/);

    const doing = await offered(user, moveButtonIn('tk_b'), 'tk_b');
    expect(doing.map((name) => name.split(' — ')[0])).toEqual(expect.arrayContaining(['Waiting on counterparty', 'Done']));
    cleanup();
    await mount(boardOf(errandGroup()));

    // CONTROL — `todo` has one exit; the dialog opens already aimed at it (no "Choose a state").
    await user.click(moveButtonIn('tk_a'));
    const dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
    expect(within(dialog).getByRole('button', { name: /Move to/ })).toHaveTextContent('Doing');
    expect(within(dialog).queryByText('Choose a state')).toBeNull();
  });
});

describe('21.047 a gated destination says so in the Move list', () => {
  it('21.047 Done (comment required) is marked "needs a comment"; Waiting (rules-free) carries no mark', async () => {
    const user = userEvent.setup();
    await mount(boardOf(errandGroup()));
    await showColumn(/^Doing/);
    const names = await offered(user, moveButtonIn('tk_b'), 'tk_b');

    expect(names).toContain('Done — needs a comment');
    expect(names).toContain('Waiting on counterparty'); // CONTROL — an ungated option is its bare name
    expect(names).toContain('To do');
  });

  /** From `doing`: a field-gated way back, an evidence-gated way sideways, and a two-rule way out. */
  const GATED: WorkflowDef = {
    ...WF_ERRAND,
    transitions: [
      { from: 'doing', to: 'todo', rules: [{ kind: 'require-field', field: 'estimate' }] },
      { from: 'doing', to: 'waiting', rules: [{ kind: 'require-evidence' }] },
      { from: 'doing', to: 'done', rules: [{ kind: 'require-comment' }, { kind: 'require-evidence' }] },
    ],
  };

  it('21.047 require-evidence reads "needs evidence", require-field reads "needs <field>", and two rules are joined', async () => {
    const user = userEvent.setup();
    await mount(boardOf(errandGroup()), GATED);
    await showColumn(/^Doing/);
    const names = await offered(user, moveButtonIn('tk_b'), 'tk_b');

    expect(names).toEqual([
      'To do — needs estimate',
      'Waiting on counterparty — needs evidence',
      'Done — needs a comment, needs evidence',
    ]);
  });

  it('21.047 CONTROL — the arrows\' own picker keeps its plain option names (no mark)', async () => {
    const user = userEvent.setup();
    await mount(boardOf(errandGroup()));
    await showColumn(/^Doing/);
    const forward = await offered(user, within(slotOf('tk_b')).getByRole('button', { name: /^Move to next state/ }), 'tk_b');
    expect(forward).toEqual(['Waiting on counterparty', 'Done']);
  });

  it('21.047 CONTROL — over the same gated workflow the arrows\' picker still shows bare names', async () => {
    const user = userEvent.setup();
    await mount(boardOf(errandGroup()), GATED);
    await showColumn(/^Doing/);
    const forward = await offered(user, within(slotOf('tk_b')).getByRole('button', { name: /^Move to next state/ }), 'tk_b');
    expect(forward).toEqual(['Waiting on counterparty', 'Done']);
  });
});

describe('21.048 with no legal destination the Move button is disabled and says why', () => {
  /** `waiting` has no declared exit and no wildcard reaches it: only Send to Backlog remains, and the board never offers that. */
  const STUCK: WorkflowDef = {
    ...WF_ERRAND,
    transitions: [
      { from: 'todo', to: 'doing', rules: [] },
      { from: 'doing', to: 'waiting', rules: [] },
    ],
  };

  it('21.048 a Waiting card\'s Move is disabled, described by the refusal copy', async () => {
    await mount(boardOf(errandGroup({ todo: ['tk_a'], doing: ['tk_b'], waiting: ['tk_w'], done: [] })), STUCK);
    await showColumn(/^Waiting/);
    const stuck = moveButtonIn('tk_w');
    expect(stuck).toBeDisabled();
    expect(stuck).toHaveAccessibleDescription("This ticket can't move from here.");

    // CONTROL — an enabled Move carries no such description.
    await showColumn(/^Doing/);
    const live = moveButtonIn('tk_b');
    expect(live).toBeEnabled();
    expect(live).toHaveAccessibleDescription('');
  });
});

describe('21.049 a Move submits through the same optimistic path as the arrows', () => {
  it('21.049 confirming lands the card in the target at once, while the write is still open', async () => {
    const user = userEvent.setup();
    const write = deferred<IngestResult[]>();
    const { source } = await mount(boardOf(errandGroup()), WF_ERRAND, () => write.promise);
    await showColumn(/^Doing/);

    await user.click(moveButtonIn('tk_b'));
    const dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
    await user.click(within(dialog).getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Waiting on counterparty' }));
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));

    await waitFor(() => expect(source.ingested).toHaveLength(1));
    expect(idsIn('waiting')).toEqual(['tk_b']);
    expect(idsIn('doing')).toEqual([]);
    expect(slotOf('tk_b')).toHaveAttribute('data-move-phase', 'writing');
    await act(async () => write.resolve(committed([{ id: 'x' }])));
  });

  it('21.049 while a DIRECT move\'s write is open the card\'s Move is disabled; it is enabled again once the write settles', async () => {
    const user = userEvent.setup();
    const write = deferred<IngestResult[]>();
    await mount(boardOf(errandGroup()), WF_ERRAND, () => write.promise);
    expect(moveButtonIn('tk_a')).toBeEnabled(); // CONTROL — before the move

    // To do has ONE rules-free exit, so › writes straight away (no dialog): the `submitting` latch is held for the write.
    await user.click(within(slotOf('tk_a')).getByRole('button', { name: 'Move to Doing' }));
    await waitFor(() => expect(slotOf('tk_a')).toHaveAttribute('data-move-phase', 'writing'));
    expect(moveButtonIn('tk_a')).toBeDisabled();

    await act(async () => write.resolve(committed([{ id: 'x' }])));
    await waitFor(() => expect(moveButtonIn('tk_a')).toBeEnabled()); // CONTROL — settled
  });

  it('21.049 CONTROL — a server refusal keeps the dialog open with the refusal text, and cancelling sends the card back to Doing', async () => {
    const user = userEvent.setup();
    await mount(boardOf(errandGroup()), WF_ERRAND, (events) => refused(events));
    await showColumn(/^Doing/);

    await user.click(moveButtonIn('tk_b'));
    const dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
    await user.click(within(dialog).getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Waiting on counterparty' }));
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));

    // The card changed column when the move was laid, so the dialog is the one inside its new slot: ask afresh.
    // AMENDED 2026-10-02 (23.126): the phone shows the column that holds the open dialog, so it is found as a person finds it.
    await waitFor(() => expect(screen.getByText(/Refused by the server — some-rule: Not allowed right now\./)).toBeInTheDocument());
    await user.click(within(await screen.findByRole('dialog', { name: 'Move ticket' })).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(idsIn('doing')).toEqual(['tk_b']));
    expect(idsIn('waiting')).toEqual([]);
  });
});

describe('23.126 (U-T7 fix 1) a phone Move never leaves its dialog or notice in a column the person cannot see', () => {
  /** Choose a destination in the open Move dialog and press Move. */
  async function moveVia(user: ReturnType<typeof userEvent.setup>, destination: string, comment?: string) {
    const dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
    await user.click(within(dialog).getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: new RegExp(`^${destination}`) }));
    if (comment !== undefined) await user.type(within(dialog).getByLabelText(/Comment/), comment);
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));
  }

  it('23.126 a write that fails (ingest rejects): the dialog is shown in the column the card went to, says so, and Cancel returns the person to Doing', async () => {
    const user = userEvent.setup();
    const write = deferred<IngestResult[]>();
    await mount(boardOf(errandGroup()), WF_ERRAND, () => write.promise);
    await showColumn(/^Doing/);
    expect(selectedTab()).toEqual(['Doing 1']); // CONTROL — the person starts on Doing
    await user.click(moveButtonIn('tk_b'));
    await moveVia(user, 'Waiting');

    // The card is laid in Waiting while the write is open, and the phone shows Waiting: the dialog is in the page.
    await waitFor(() => expect(idsIn('waiting')).toEqual(['tk_b']));
    expect(columnOf('waiting')).not.toHaveAttribute('hidden');
    expect(selectedTab()).toEqual(['Waiting on counterparty 1']);
    expect(await screen.findByRole('dialog', { name: 'Move ticket' })).toBeVisible();
    // CONTROL — 23.120 still holds for every other column.
    for (const hiddenId of ['todo', 'doing', 'done']) {
      expect(columnOf(hiddenId)).toHaveAttribute('hidden');
      expect(columnOf(hiddenId)).toHaveAttribute('inert');
    }

    await act(async () => write.reject(new Error('network down')));
    const dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
    expect(within(dialog).getByRole('alert')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(idsIn('doing')).toEqual(['tk_b']));
    expect(columnOf('doing')).not.toHaveAttribute('hidden');
    expect(columnOf('waiting')).toHaveAttribute('hidden');
    expect(selectedTab()).toEqual(['Doing 1']);
  });

  it('23.126 CONTROL — a Move that succeeds leaves the dialog gone and the person back on the column they were in', async () => {
    const user = userEvent.setup();
    await mount(boardOf(errandGroup()), WF_ERRAND, (events) => committed(events));
    await showColumn(/^Doing/);
    await user.click(moveButtonIn('tk_b'));
    await moveVia(user, 'Waiting');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Move ticket' })).toBeNull());
    expect(idsIn('waiting')).toEqual(['tk_b']);
    expect(selectedTab()).toEqual(['Doing 0']);
    expect(columnOf('doing')).not.toHaveAttribute('hidden');
  });
});

describe('23.127 (U-T7 fix 1) a gated move\'s comment step and its refusal are visible and operable on a phone', () => {
  it('23.127 Done needs a comment: typed in the dialog, the card is laid in Done and that column is shown while the write is open; a refusal then reads in the dialog, and Cancel brings the person back to Doing', async () => {
    const user = userEvent.setup();
    const write = deferred<IngestResult[]>();
    await mount(boardOf(errandGroup()), WF_ERRAND, () => write.promise);
    await showColumn(/^Doing/);
    await user.click(moveButtonIn('tk_b'));
    const dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
    await user.click(within(dialog).getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: /^Done/ }));
    expect(within(dialog).getByRole('button', { name: 'Move' })).toBeDisabled(); // CONTROL — no comment, no Move
    await user.type(within(dialog).getByLabelText(/Comment/), 'all paid');
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));

    await waitFor(() => expect(idsIn('done')).toEqual(['tk_b']));
    expect(columnOf('done')).not.toHaveAttribute('hidden');
    expect(columnOf('doing')).toHaveAttribute('hidden');
    const open = await screen.findByRole('dialog', { name: 'Move ticket' });
    expect(open).toBeVisible();
    expect(within(open).getByRole('button', { name: 'Cancel' })).toBeVisible();

    await act(async () => write.resolve([{ status: 'refused', eventId: 'x', rule: 'some-rule', reason: 'Not allowed right now.' }]));
    await waitFor(() => expect(screen.getByText(/Refused by the server — some-rule: Not allowed right now\./)).toBeVisible());
    await user.click(within(await screen.findByRole('dialog', { name: 'Move ticket' })).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(idsIn('doing')).toEqual(['tk_b']));
    expect(columnOf('doing')).not.toHaveAttribute('hidden');
    expect(selectedTab()).toEqual(['Doing 1']);
  });
});
