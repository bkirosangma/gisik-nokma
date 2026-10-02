import { render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import type { BoardCard, BoardGroup, BoardView } from '../../src/view-types.js';
import { Board, type BoardMoveCapability } from '../../src/views/board.js';
import { PHONE_BOARD_QUERY } from '../../src/views/use-phone-board.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { WS, boardCardSeed, WF_ERRAND } from '../helpers/seed.js';

/**
 * Mobile plan Task 5 — "Move to…" on desktop cards, cases 21.060–21.062 (§21.5; the stylesheet halves are in
 * `packages/ui/test/board-phone-css.test.ts`). The button is Task 4's `.gn-board-card__move-to`, now drawn at every
 * width; these suites run with no `matchMedia` at all (jsdom), which is the desktop board.
 */
const USER = 'user_kiro';

beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn() as unknown as typeof Element.prototype.scrollIntoView;
});
afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
  vi.restoreAllMocks();
});

const card = (ticketId: string): BoardCard => boardCardSeed({ ticketId, title: `Ticket ${ticketId}` });

function group(cards: Record<string, string[]>): BoardGroup {
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
const boardOf = (cards: Record<string, string[]>): BoardView => ({ projectId: 'prj_1', groups: [group(cards)] });

async function mount(view: BoardView, workflow: WorkflowDef = WF_ERRAND) {
  const source = createFakeDataSource({ getWorkflowDef: async () => workflow });
  const onMoved = vi.fn();
  const moves: BoardMoveCapability = { dataSource: source, workspaceId: WS, currentUserId: USER, onMoved };
  render(<Board board={view} onOpenTicket={() => {}} moves={moves} currentUserId={USER} />);
  await waitFor(() => expect(screen.getAllByRole('button', { name: /Move to/ }).length).toBeGreaterThan(0));
  return { source, onMoved };
}

const slotOf = (ticketId: string) => screen.getByTestId(`ticket-card-${ticketId}`);
const moveTo = (ticketId: string) => within(slotOf(ticketId)).getByRole('button', { name: 'Move to another state' });
const footerButtons = (ticketId: string) =>
  [...(slotOf(ticketId).querySelector('.gn-board-card__moves')?.querySelectorAll('button') ?? [])].map(
    (button) => button.getAttribute('aria-label') ?? '',
  );

async function listed(user: ReturnType<typeof userEvent.setup>, trigger: HTMLElement): Promise<string[]> {
  await user.click(trigger);
  const dialog = await screen.findByRole('dialog', { name: 'Move ticket' });
  await user.click(within(dialog).getByRole('button', { name: /Move to/ }));
  return within(await screen.findByRole('listbox'))
    .getAllByRole('option')
    .map((option) => (option.textContent ?? '').split(' — ')[0] ?? '');
}

describe('21.060 above 40rem each card footer carries a "Move to…" after the ‹ › arrows', () => {
  it('21.060 the footer is previous, next, Move to another state — the Move button last of the three', async () => {
    await mount(boardOf({ doing: ['tk_b'] }));
    expect(footerButtons('tk_b')).toEqual([
      'Move to To do',
      'Move to next state — Waiting on counterparty or Done',
      'Move to another state',
    ]);
    // CONTROL — the arrows keep their behaviour: › still asks which of its two, with only those two on offer.
    const user = userEvent.setup();
    const forward = await listed(user, within(slotOf('tk_b')).getByRole('button', { name: /^Move to next state/ }));
    expect(forward).toEqual(['Waiting on counterparty', 'Done']);
  });
});

describe('21.061 Move to… opens the same dialog over every board destination', () => {
  it('21.061 from Doing it lists To do, Waiting and Done — both directions, never Backlog', async () => {
    const user = userEvent.setup();
    await mount(boardOf({ doing: ['tk_b'] }));
    expect(await listed(user, moveTo('tk_b'))).toEqual(['To do', 'Waiting on counterparty', 'Done']);
  });

  it('21.061 CONTROL — a terminal card keeps its Close button, after Move, and Close still closes', async () => {
    const user = userEvent.setup();
    const { source } = await mount(boardOf({ done: ['tk_d'] }));
    expect(footerButtons('tk_d')).toEqual([
      'Move to previous state — Doing or To do',
      'Move to next state — unavailable',
      'Move to another state',
      'Close Ticket tk_d',
    ]);
    await user.click(within(slotOf('tk_d')).getByRole('button', { name: 'Close Ticket tk_d' }));
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    expect(source.ingested[0]?.map((event) => event.type)).toEqual(['ticket.closed']);
  });
});

describe('21.062 one accessible name at every width; the visible word differs by CSS', () => {
  const stubViewport = (phone: boolean): void => {
    window.matchMedia = ((query: string) => ({
      matches: query === PHONE_BOARD_QUERY ? phone : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })) as unknown as typeof window.matchMedia;
  };

  it('21.062 the name is "Move to another state" on a phone and above; both words are in the markup, hidden from assistive tech', async () => {
    stubViewport(false);
    await mount(boardOf({ doing: ['tk_b'] }));
    const wide = moveTo('tk_b');
    expect(wide).toHaveAccessibleName('Move to another state');
    const phoneWord = wide.querySelector('.gn-board-card__move-label--phone');
    const wideWord = wide.querySelector('.gn-board-card__move-label--wide');
    expect(phoneWord?.textContent).toBe('Move');
    expect(wideWord?.textContent).toBe('Move to…');
    // CONTROL — neither word is announced on top of the name.
    expect(phoneWord).toHaveAttribute('aria-hidden', 'true');
    expect(wideWord).toHaveAttribute('aria-hidden', 'true');
  });

  it('21.062 the same name on a phone', async () => {
    stubViewport(true);
    await mount(boardOf({ todo: ['tk_a'], doing: ['tk_b'] }));
    // UX T7 (23.120): only the picked column is in the page on a phone, so pick Doing first.
    await userEvent.setup().click(screen.getByRole('tab', { name: /^Doing/ }));
    expect(moveTo('tk_b')).toHaveAccessibleName('Move to another state');
  });
});
