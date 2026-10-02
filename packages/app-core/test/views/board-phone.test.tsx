import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
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
 * jsdom has no layout, so the phone is a stubbed `matchMedia` and the rail's geometry is planted by hand;
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
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
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
  [...within(columnOf(stateId)).getByRole('list').children]
    .map((child) => child.getAttribute('data-testid') ?? '')
    .filter((id) => id.startsWith('ticket-card-'))
    .map((id) => id.slice('ticket-card-'.length));
const picker = () => screen.getByRole('tablist', { name: 'Column' });
const tabNames = () => within(picker()).getAllByRole('tab').map((tab) => tab.textContent);
const selectedTab = () => within(picker()).getAllByRole('tab').filter((tab) => tab.getAttribute('aria-selected') === 'true').map((tab) => tab.textContent);
const moveButtonIn = (ticketId: string) => within(slotOf(ticketId)).getByRole('button', { name: 'Move to another state' });

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
    expect(within(columnOf('waiting')).getByRole('list')).toBeInTheDocument();
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

describe('21.042 picking a column scrolls the RAIL to it and marks it selected', () => {
  it('21.042 scrollIntoView runs on that column (inside the rail) with inline: start, and the option is selected; the window does not move', async () => {
    const user = userEvent.setup();
    await mount(boardOf(errandGroup()));
    expect(selectedTab()).toEqual(['To do 1']); // CONTROL — it starts on the first column

    await user.click(within(picker()).getByRole('tab', { name: 'Doing 1' }));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ inline: 'start', block: 'nearest', behavior: 'smooth' });
    expect(scrollIntoView.mock.contexts[0]).toBe(columnOf('doing'));
    expect(columnOf('doing').closest('.gn-board__rail')).not.toBeNull();
    expect(selectedTab()).toEqual(['Doing 1']);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(window.scrollY).toBe(0);
  });

  it('21.042 reduced motion asks for behavior: auto', async () => {
    viewport({ phone: true, reducedMotion: true });
    const user = userEvent.setup();
    await mount(boardOf(errandGroup()));
    await user.click(within(picker()).getByRole('tab', { name: 'Done 0' }));
    expect(scrollIntoView).toHaveBeenCalledWith({ inline: 'start', block: 'nearest', behavior: 'auto' });
  });
});

describe('21.043 scrolling the rail moves the selected option to the column nearest its left edge', () => {
  /** Plant the rail's geometry: column i's left edge sits at i·COLUMN_WIDTH − scrollLeft. */
  function plant(rail: HTMLElement): (scrollLeft: number) => void {
    let current = 0;
    Object.defineProperty(rail, 'scrollLeft', { configurable: true, get: () => current });
    rail.getBoundingClientRect = () => ({ left: 0, right: COLUMN_WIDTH, top: 0, bottom: 600, width: COLUMN_WIDTH, height: 600, x: 0, y: 0, toJSON: () => ({}) });
    [...rail.children].forEach((child, index) => {
      (child as HTMLElement).getBoundingClientRect = () => ({
        left: index * COLUMN_WIDTH - current,
        right: (index + 1) * COLUMN_WIDTH - current,
        top: 0,
        bottom: 600,
        width: COLUMN_WIDTH,
        height: 600,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
    });
    return (scrollLeft) => {
      current = scrollLeft;
      fireEvent.scroll(rail);
    };
  }

  it('21.043 a scroll to the third column selects it; a sub-pixel nudge off the second does not change the selection', async () => {
    const user = userEvent.setup();
    await mount(boardOf(errandGroup()));
    const rail = columnOf('todo').closest<HTMLElement>('.gn-board__rail');
    if (rail === null) throw new Error('no rail');
    const scrollTo = plant(rail);

    await user.click(within(picker()).getByRole('tab', { name: 'Doing 1' }));
    scrollTo(COLUMN_WIDTH + 0.4);
    await new Promise((resolve) => setTimeout(resolve, 60)); // let the frame-throttled read run
    expect(selectedTab()).toEqual(['Doing 1']); // CONTROL — a sub-pixel move is still nearest the same column

    scrollTo(2 * COLUMN_WIDTH);
    await waitFor(() => expect(selectedTab()).toEqual(['Waiting on counterparty 0']));
  });

  /** The calls to `requestAnimationFrame` made while `fire` runs (react-aria and others also use it, so count the delta). */
  function frameCallsDuring(spy: MockInstance<typeof window.requestAnimationFrame>, fire: () => void): number {
    const before = spy.mock.calls.length;
    fire();
    return spy.mock.calls.length - before;
  }

  it('21.043 the scroll listener is throttled to ONE frame read: a burst in one tick asks for one frame; once it has run, the next scroll asks again', async () => {
    await mount(boardOf(errandGroup()));
    const rail = columnOf('todo').closest<HTMLElement>('.gn-board__rail');
    if (rail === null) throw new Error('no rail');
    plant(rail);
    const frames = vi.spyOn(window, 'requestAnimationFrame');

    expect(frameCallsDuring(frames, () => { for (let i = 0; i < 5; i += 1) fireEvent.scroll(rail); })).toBe(1);
    await new Promise((resolve) => setTimeout(resolve, 60)); // the queued frame runs and clears the latch
    // CONTROL — the throttle is not a one-shot: a later scroll queues a frame again, once more for a burst.
    expect(frameCallsDuring(frames, () => { for (let i = 0; i < 3; i += 1) fireEvent.scroll(rail); })).toBe(1);
  });

  /**
   * The `scroll` listeners added to a board rail (whichever rail), spied on the prototype, one entry PER listener and
   * in DOM order (so the order does not depend on which effect ran first). Every rail carries the 23.092 edge-cue
   * listener (`useScrollEdges`, passive, asks for no frame); the phone's selection listener is the SECOND one on an
   * EXPANDED phone rail. So a desktop rail has one, an expanded phone rail two, a collapsed rail one.
   */
  function railScrollListeners(spy: ReturnType<typeof vi.spyOn>): HTMLElement[] {
    return spy.mock.calls
      .map((call, index) => ({ type: call[0], context: spy.mock.contexts[index] }))
      .filter(({ type, context }) => type === 'scroll' && context instanceof HTMLElement && context.classList.contains('gn-board__rail'))
      .map(({ context }) => context as HTMLElement)
      .sort((a, b) => (a === b ? 0 : a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  }

  it('21.043 above the phone breakpoint the rail gets only the edge-cue listener and a scroll asks for no frame; on a phone the same rail also gets the selection listener', async () => {
    const listening = vi.spyOn(EventTarget.prototype, 'addEventListener');
    viewport({ phone: false });
    await mount(boardOf(errandGroup()));
    const desktopRail = columnOf('todo').closest<HTMLElement>('.gn-board__rail');
    if (desktopRail === null) throw new Error('no rail');
    const frames = vi.spyOn(window, 'requestAnimationFrame');
    // ONE listener: the 23.092 edge cue. The selection listener is not added at desktop width.
    expect(railScrollListeners(listening)).toEqual([desktopRail]);
    expect(frameCallsDuring(frames, () => fireEvent.scroll(desktopRail))).toBe(0);
    cleanup();
    listening.mockClear();

    viewport({ phone: true });
    await mount(boardOf(errandGroup()));
    const phoneRail = columnOf('todo').closest<HTMLElement>('.gn-board__rail');
    expect(railScrollListeners(listening)).toEqual([phoneRail, phoneRail]); // CONTROL — same board, phone width: the edge cue plus the selection listener
  });

  it('21.043 a COLLAPSED group\'s rail gets only the edge-cue listener; the expanded phone group\'s rail also gets the selection listener', async () => {
    const listening = vi.spyOn(EventTarget.prototype, 'addEventListener');
    // A second, empty workflow rests collapsed (`Board`'s default for an empty group when there is more than one).
    const other: BoardGroup = {
      workflowId: 'wf-other',
      workflowVersion: 1,
      workflowName: 'Other',
      columns: [{ stateId: 'x-open', name: 'Open', category: 'open', blocked: false, creatable: true, cards: [] }],
    };
    await mount(boardOf(errandGroup(), other));
    const rails = [...document.querySelectorAll<HTMLElement>('.gn-board__rail')];
    expect(rails).toHaveLength(2);
    const [expandedRail, collapsedRail] = rails;
    expect(expandedRail).not.toHaveAttribute('hidden');
    expect(collapsedRail).toHaveAttribute('hidden');

    // Expanded twice (edge cue + selection), collapsed once (edge cue).
    expect(railScrollListeners(listening)).toEqual([expandedRail, expandedRail, collapsedRail]);
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
  });
});

describe('21.045 the Move button opens the same dialog over EVERY board destination', () => {
  it('21.045 Move on a Doing card offers To do, Waiting and Done (both directions); › still offers only the forward two', async () => {
    const user = userEvent.setup();
    await mount(boardOf(errandGroup()));

    const all = await offered(user, moveButtonIn('tk_b'), 'tk_b');
    expect(all.map((name) => name.split(' — ')[0])).toEqual(['To do', 'Waiting on counterparty', 'Done']);
    cleanup();
    await mount(boardOf(errandGroup()));

    // CONTROL — the arrows are unchanged: › is the forward list only.
    const forward = await offered(user, within(slotOf('tk_b')).getByRole('button', { name: /^Move to next state/ }), 'tk_b');
    expect(forward.map((name) => name.split(' — ')[0])).toEqual(['Waiting on counterparty', 'Done']);
  });
});

describe('21.046 a branching workflow lists BOTH branches; a single target is listed once and preselected', () => {
  it('21.046 Doing → Waiting | Done are both in the list; a To do card is offered Doing alone, already chosen', async () => {
    const user = userEvent.setup();
    await mount(boardOf(errandGroup()));

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
    const forward = await offered(user, within(slotOf('tk_b')).getByRole('button', { name: /^Move to next state/ }), 'tk_b');
    expect(forward).toEqual(['Waiting on counterparty', 'Done']);
  });

  it('21.047 CONTROL — over the same gated workflow the arrows\' picker still shows bare names', async () => {
    const user = userEvent.setup();
    await mount(boardOf(errandGroup()), GATED);
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
    const stuck = moveButtonIn('tk_w');
    expect(stuck).toBeDisabled();
    expect(stuck).toHaveAccessibleDescription("This ticket can't move from here.");

    // CONTROL — an enabled Move carries no such description.
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

    await user.click(moveButtonIn('tk_b'));
    const dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
    await user.click(within(dialog).getByRole('button', { name: /Move to/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'Waiting on counterparty' }));
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));

    // The card changed column when the move was laid, so the dialog is the one inside its new slot: ask afresh.
    await waitFor(() => expect(screen.getByText(/Refused by the server — some-rule: Not allowed right now\./)).toBeInTheDocument());
    await user.click(within(await screen.findByRole('dialog', { name: 'Move ticket' })).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(idsIn('doing')).toEqual(['tk_b']));
    expect(idsIn('waiting')).toEqual([]);
  });
});
