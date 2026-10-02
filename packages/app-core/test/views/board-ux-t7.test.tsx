import { cleanup, render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BoardGroup, BoardView } from '../../src/view-types.js';
import { formatCardProvenance, formatStateProvenance } from '../../src/provenance.js';
import { Board } from '../../src/views/board.js';
import { PHONE_BOARD_QUERY } from '../../src/views/use-phone-board.js';
import { boardCardSeed, claim } from '../helpers/seed.js';

/**
 * UX fixes Task 7 (audit BRD-01, BRD-03), cases 23.120, 23.121, 23.123. The stylesheet halves (23.122, and the rail
 * height of 23.120) live in `packages/ui/test/ux-t7-board-css.test.ts`; the dialog footer (23.124) and the sheet's
 * order (23.125) have their own files. jsdom has no layout, so a phone is a stubbed `matchMedia` and what a person
 * sees at 375px is the controller's browser pass, not these.
 */
function viewport(phone: boolean): void {
  window.matchMedia = ((query: string) => ({
    matches: query === PHONE_BOARD_QUERY ? phone : false,
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
  Element.prototype.scrollIntoView = (() => {}) as unknown as typeof Element.prototype.scrollIntoView;
});
afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'matchMedia');
});

function group(cards: Record<string, string[]> = { todo: ['tk_a', 'tk_b'], doing: ['tk_c'], waiting: [], done: [] }): BoardGroup {
  const col = (stateId: string, name: string, category: 'open' | 'active' | 'terminal') => ({
    stateId,
    name,
    category,
    blocked: false,
    creatable: category !== 'terminal',
    cards: (cards[stateId] ?? []).map((ticketId) => boardCardSeed({ ticketId, title: `Ticket ${ticketId}` })),
  });
  return {
    workflowId: 'wf-errand',
    workflowVersion: 1,
    workflowName: 'Errand',
    columns: [col('todo', 'To do', 'open'), col('doing', 'Doing', 'active'), col('waiting', 'Waiting', 'active'), col('done', 'Done', 'terminal')],
  };
}
const boardOf = (g: BoardGroup = group()): BoardView => ({ projectId: 'prj_1', groups: [g] });
const section = (stateId: string): HTMLElement => screen.getByTestId(`board-column-${stateId}`);
const SHOWN = (stateId: string): boolean => !section(stateId).hasAttribute('inert') && !section(stateId).hasAttribute('hidden');

describe('23.120 (BRD-01) on a phone only the active column is in the page', () => {
  it('23.120 the columns the picker did not choose are `inert` and `hidden`; the chosen one is neither', async () => {
    viewport(true);
    const user = userEvent.setup();
    render(<Board board={boardOf()} onOpenTicket={() => {}} />);
    expect(['todo', 'doing', 'waiting', 'done'].map(SHOWN)).toEqual([true, false, false, false]);
    for (const hiddenId of ['doing', 'waiting', 'done']) {
      expect(section(hiddenId)).toHaveAttribute('inert');
      expect(section(hiddenId)).toHaveAttribute('hidden');
    }
    await user.click(screen.getByRole('tab', { name: /^Doing/ }));
    expect(['todo', 'doing', 'waiting', 'done'].map(SHOWN)).toEqual([false, true, false, false]);
  });

  it('23.120 CONTROL — on a desktop board no column is inert or hidden, and there is no picker', () => {
    viewport(false);
    render(<Board board={boardOf()} onOpenTicket={() => {}} />);
    expect(['todo', 'doing', 'waiting', 'done'].map(SHOWN)).toEqual([true, true, true, true]);
    expect(screen.queryByRole('tablist', { name: 'Column' })).toBeNull();
  });
});

describe('23.121 keyboard on the phone board: Tab never reaches a hidden column', () => {
  it('23.121 Tab from the picker lands in the shown column\'s first card, and ten more Tabs never touch a hidden column', async () => {
    viewport(true);
    const user = userEvent.setup();
    render(<Board board={boardOf()} onOpenTicket={() => {}} />);
    const picker = screen.getByRole('tablist', { name: 'Column' });
    within(picker).getByRole('tab', { selected: true }).focus();
    await user.tab();
    expect(section('todo').contains(document.activeElement)).toBe(true);
    const reached = new Set<string>();
    for (let step = 0; step < 10; step += 1) {
      await user.tab();
      const at = document.activeElement;
      expect(at?.closest('[inert], [hidden]') ?? null, `step ${step} reached ${at?.outerHTML.slice(0, 80)}`).toBeNull();
      const column = at?.closest('[data-state-id]')?.getAttribute('data-state-id');
      if (column !== null && column !== undefined) reached.add(column);
    }
    // Only the shown column's controls were ever focused: the other three columns hold cards too.
    expect([...reached]).toEqual(['todo']);
  });

  it('23.121 choosing another column moves focus into it: its first card, or the column itself when it is empty', async () => {
    viewport(true);
    const user = userEvent.setup();
    render(<Board board={boardOf()} onOpenTicket={() => {}} />);
    await user.click(screen.getByRole('tab', { name: /^Doing/ }));
    expect(section('doing').contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.tagName).not.toBe('SECTION');
    await user.click(screen.getByRole('tab', { name: /^Waiting/ }));
    expect(document.activeElement).toBe(section('waiting'));
  });

  it('23.121 CONTROL — an arrow key inside the picker changes the column but leaves focus on the picker', async () => {
    viewport(true);
    const user = userEvent.setup();
    render(<Board board={boardOf()} onOpenTicket={() => {}} />);
    within(screen.getByRole('tablist', { name: 'Column' })).getByRole('tab', { selected: true }).focus();
    await user.keyboard('{ArrowRight}');
    expect(SHOWN('doing')).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /^Doing/ }));
  });
});

describe('23.123 (BRD-03) the card says what happened, in words', () => {
  it('23.123 a card reads "Moved to To do by Anselma Marak on 19 Aug", and "who · when" is gone', () => {
    viewport(false);
    render(<Board board={boardOf()} onOpenTicket={() => {}} today="2026-10-02" />);
    expect(screen.queryByText('who · when')).toBeNull();
    expect(screen.getAllByText('Moved to To do by Anselma Marak on 19 Aug').length).toBeGreaterThan(0);
  });

  it('23.123 pressing the line shows the year as well', async () => {
    viewport(false);
    const user = userEvent.setup();
    render(<Board board={boardOf(group({ doing: ['tk_c'] }))} onOpenTicket={() => {}} today="2026-10-02" />);
    const line = screen.getByRole('button', { name: 'Moved to Doing by Anselma Marak on 19 Aug' });
    expect(line).toHaveAttribute('aria-expanded', 'false');
    await user.click(line);
    expect(screen.getByRole('button', { name: 'Moved to Doing by Anselma Marak on 19 Aug 2026' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('23.123 a claim from another year keeps its year even folded, and with no `today` the year is always kept', () => {
    expect(formatCardProvenance('Doing', claim(), '2027-01-05')).toBe('Moved to Doing by Anselma Marak on 19 Aug 2026');
    expect(formatCardProvenance('Doing', claim())).toBe('Moved to Doing by Anselma Marak on 19 Aug 2026');
    expect(formatCardProvenance('Doing', claim(), '2026-10-02')).toBe('Moved to Doing by Anselma Marak on 19 Aug');
  });

  it('23.123 CONTROL — the sheet\'s wording is untouched: formatStateProvenance still says "marked … by … on <day> <year>"', () => {
    expect(formatStateProvenance('Doing', claim())).toBe('marked Doing by Anselma Marak on 19 Aug 2026');
  });
});

describe('23.128 (U-T7 fix 1) a click that landed in the picker but chose nothing does not arm the next arrow key', () => {
  it('23.128 click the picker\'s own track (no option), then press ArrowRight on the focused option: the selection moves and focus stays on the picker', async () => {
    viewport(true);
    const user = userEvent.setup();
    render(<Board board={boardOf()} onOpenTicket={() => {}} />);
    await user.click(screen.getByRole('tablist', { name: 'Column' })); // a click in the picker, on no option: no `onChange`
    screen.getByRole('tab', { name: /^To do/ }).focus();
    await user.keyboard('{ArrowRight}');
    expect(SHOWN('doing')).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole('tab', { name: /^Doing/ }));
  });

  it('23.128 CONTROL — a click ON an option (the selected one included) still moves focus into the column', async () => {
    viewport(true);
    const user = userEvent.setup();
    render(<Board board={boardOf()} onOpenTicket={() => {}} />);
    await user.click(screen.getByRole('tab', { name: /^Doing/ }));
    expect(section('doing').contains(document.activeElement)).toBe(true);
  });
});
