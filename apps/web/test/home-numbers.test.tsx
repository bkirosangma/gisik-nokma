import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HomeResponse } from '@gisik-nokma/domain';
import { HOME_NUMBERS, dueSoonLabel } from '../src/home/home-copy.js';
import { HomeNumbers, type HomeNumbersProps } from '../src/home/home-numbers.js';
import { useHomeHighlight } from '../src/home/use-home-highlight.js';
import { ruleFor } from './helpers/css-rule-scan.js';

/**
 * 27.634–27.640 (Knowledge Graph spec E §2.2–§2.3): Home's six numbers, rendered directly. The AMEND p11 legs (H3–H8,
 * the planner's Q1 ruling) sit inside the case they strengthen and are named in a comment.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(HERE, '../app/globals.css'), 'utf8');

const HOME: HomeResponse = {
  workspaceId: 'ws_1',
  generatedAt: '2026-10-05T04:30:00.000Z',
  dueSoonDays: 3,
  counts: { tickets: 12, open: 9, pastDue: 3, dueSoon: 2, members: 5, notes: 4 },
  ids: { tickets: ['t_all'], open: ['t_open'], pastDue: ['t_pd'], dueSoon: ['t_ds'], members: ['u_1'], notes: ['n_1'] },
};
const NAMES = ['12 Tickets', '9 Open', '3 Past due', '2 Due in 3 days', '5 Members', '4 Notes'];

function props(over: Partial<HomeNumbersProps> = {}): HomeNumbersProps {
  return { home: HOME, failed: false, onRetry: () => undefined, pressed: null, onToggle: () => undefined, ...over };
}
const tiles = (container: HTMLElement): HTMLElement[] => [...container.querySelectorAll<HTMLElement>('button.gn-home__number')];
const pressedStates = (container: HTMLElement): Array<string | null> => tiles(container).map((b) => b.getAttribute('aria-pressed'));

afterEach(() => cleanup());

describe('27.634 the six numbers, in the spec order, with their labels', () => {
  it('27.634 six buttons in order by accessible name; dueSoonLabel reads today / 1 day / N days; control: dueSoonDays 0 re-labels the fourth', () => {
    const { rerender } = render(<HomeNumbers {...props()} />);
    // ONE ordered list: the buttons in DOM order are exactly the six named ones, in this order.
    expect(screen.getAllByRole('button')).toEqual(NAMES.map((name) => screen.getByRole('button', { name })));
    // The text too, not only the computed name: jsdom's name computation separates the two spans by itself.
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(NAMES);
    expect(dueSoonLabel(0)).toBe('Due today');
    expect(dueSoonLabel(1)).toBe('Due in 1 day');
    expect(dueSoonLabel(7)).toBe('Due in 7 days');

    // Control: the label follows the response's window, never a constant.
    rerender(<HomeNumbers {...props({ home: { ...HOME, dueSoonDays: 0 } })} />);
    expect(screen.getAllByRole('button')[3]).toBe(screen.getByRole('button', { name: '2 Due today' }));

    // H3 (p11): T3 writes the nouns; T4's highlight note is their only reader.
    expect(HOME_NUMBERS.map((n) => [n.key, n.noun(0, 3), n.noun(1, 3), n.noun(2, 3)])).toEqual([
      ['tickets', 'tickets', 'ticket', 'tickets'],
      ['open', 'open tickets', 'open ticket', 'open tickets'],
      ['pastDue', 'past due', 'past due', 'past due'],
      ['dueSoon', 'due in 3 days', 'due in 3 days', 'due in 3 days'],
      ['members', 'members', 'member', 'members'],
      ['notes', 'notes', 'note', 'notes'],
    ]);
    expect(HOME_NUMBERS.find((n) => n.key === 'dueSoon')!.noun(2, 0)).toBe('due today'); // follows the window, not a constant
  });
});

describe('27.635 Past due carries the warning edge above 0', () => {
  it('27.635 only Past due warns, at 3 and at 1, and not at 0; control: no other tile warns at its non-zero value or at 0', () => {
    const { container, rerender } = render(<HomeNumbers {...props()} />);
    expect([...container.querySelectorAll('.gn-home__number--warn')]).toEqual([screen.getByRole('button', { name: '3 Past due' })]);
    // Every other count at 0: still exactly Past due.
    const zeros = { tickets: 0, open: 0, pastDue: 3, dueSoon: 0, members: 0, notes: 0 };
    rerender(<HomeNumbers {...props({ home: { ...HOME, counts: zeros } })} />);
    expect([...container.querySelectorAll('.gn-home__number--warn')]).toEqual([screen.getByRole('button', { name: '3 Past due' })]);
    rerender(<HomeNumbers {...props({ home: { ...HOME, counts: { ...HOME.counts, pastDue: 0 } } })} />);
    expect(container.querySelectorAll('.gn-home__number--warn')).toHaveLength(0);

    // H7 (p11): spec E §2.2 "Past due uses the warning style when it is above 0": 1 is above 0.
    rerender(<HomeNumbers {...props({ home: { ...HOME, counts: { ...HOME.counts, pastDue: 1 } } })} />);
    expect([...container.querySelectorAll('.gn-home__number--warn')]).toEqual([screen.getByRole('button', { name: '1 Past due' })]);
  });
});

describe('27.636 a zero is disabled, a withheld Members reads Restricted', () => {
  it('27.636 0 Notes and Restricted Members are disabled; control: 12 Tickets is enabled in the same render', () => {
    render(<HomeNumbers {...props({ home: { ...HOME, counts: { ...HOME.counts, notes: 0, members: null } } })} />);
    expect(screen.getByRole('button', { name: '0 Notes' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Restricted Members' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '12 Tickets' })).toBeEnabled();
  });
});

describe('27.637 loading: six placeholders in the tiles’ own box', () => {
  it('27.637 home null and not failed renders six .gn-home__number placeholders and no buttons in a busy region; one min-height serves both; control: the loaded tiles carry the class', () => {
    const { container, rerender } = render(<HomeNumbers {...props({ home: null })} />);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    const region = screen.getByText('Loading the numbers').closest('[aria-busy="true"]');
    expect(region).not.toBeNull();
    expect(region!.querySelectorAll('.gn-home__number')).toHaveLength(6);
    const rule = ruleFor(CSS, /^\s*\.gn-home__number\s*\{/);
    expect(rule).toBeDefined();
    expect(rule).toContain('min-height: 4.75rem');

    // Control: the loaded state uses the same class, so the swap keeps the box.
    rerender(<HomeNumbers {...props()} />);
    expect(tiles(container)).toHaveLength(6);
    expect(screen.getAllByRole('button')).toEqual(tiles(container));
  });
});

describe('27.638 a failed load: dashes, the sentence and Retry', () => {
  it('27.638 failed renders – in all six (disabled), the sentence and Retry (one call per click); the Due label keeps the last known window or reads Due soon; control: not failed has no Retry', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    const { container, rerender } = render(<HomeNumbers {...props({ home: null, failed: true, onRetry, dueSoonDays: 3 })} />);
    expect([...container.querySelectorAll('.gn-home__number-value')].map((el) => el.textContent)).toEqual(['–', '–', '–', '–', '–', '–']);
    expect(tiles(container)).toHaveLength(6);
    for (const tile of tiles(container)) expect(tile).toBeDisabled();
    // H8 (p11): exact copy. getByText matches the whole normalised text, so '' or a reworded sentence fails.
    expect(screen.getByText("Couldn't load the numbers.")).toBeInTheDocument();
    const retry = screen.getByRole('button', { name: 'Retry' });
    await user.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);
    // Q2, last known: the fourth label keeps the window the last answer carried.
    const labels = (): Array<string | null> => [...container.querySelectorAll('.gn-home__number-label')].map((el) => el.textContent);
    expect(labels()[3]).toBe('Due in 3 days');
    // Q2, none known: "Due soon", and never "Due today".
    rerender(<HomeNumbers {...props({ home: null, failed: true, onRetry })} />);
    expect(labels()[3]).toBe('Due soon');
    expect(labels()).not.toContain('Due today');

    // Control: not failed → no Retry and no sentence.
    rerender(<HomeNumbers {...props({ onRetry })} />);
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    expect(screen.queryByText("Couldn't load the numbers.")).not.toBeInTheDocument();
  });
});

/** The hook driven the way `HomeBody` drives it, plus a child that handles Escape first and a sibling that does not. */
function Harness({ home }: { home: HomeResponse | null }) {
  const highlight = useHomeHighlight(home);
  return (
    <div>
      <HomeNumbers home={home} failed={home === null} onRetry={() => undefined} pressed={highlight.pressed} onToggle={highlight.toggle} />
      <div data-testid="guard" onKeyDown={(event) => event.preventDefault()} />
      <div data-testid="sibling" />
    </div>
  );
}

describe('27.639 one lit number at a time; Escape and a reload to 0 clear it', () => {
  it('27.639 click lights, another switches, the same clears, Escape clears unless already handled; a reload to 0 or to null clears, a reload above 0 does not', async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(<Harness home={HOME} />);
    const pastDue = (): HTMLElement => screen.getByRole('button', { name: /Past due$/ });
    const open = (): HTMLElement => screen.getByRole('button', { name: /Open$/ });
    const members = (): HTMLElement => screen.getByRole('button', { name: /Members$/ });
    const ALL_OFF = ['false', 'false', 'false', 'false', 'false', 'false'];

    // H4a (p11): nothing lit → the hook leaves Escape alone (menus and the graph's own onEscape still get it).
    const idle = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true });
    act(() => {
      screen.getByTestId('sibling').dispatchEvent(idle);
    });
    expect(idle.defaultPrevented).toBe(false);

    // 1. Past due alone.
    await user.click(pastDue());
    expect(pressedStates(container)).toEqual(['false', 'false', 'true', 'false', 'false', 'false']);

    // H4b (p11): Enter neither clears nor is consumed.
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true, bubbles: true });
    act(() => {
      screen.getByTestId('sibling').dispatchEvent(enter);
    });
    expect(screen.getByRole('button', { name: '3 Past due' })).toHaveAttribute('aria-pressed', 'true');
    expect(enter.defaultPrevented).toBe(false);

    // 2. Open switches.
    await user.click(open());
    expect(pressedStates(container)).toEqual(['false', 'true', 'false', 'false', 'false', 'false']);
    // 3. Open again clears.
    await user.click(open());
    expect(pressedStates(container)).toEqual(ALL_OFF);

    // 4. Escape clears.
    await user.click(pastDue());
    expect(pastDue()).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(pastDue(), { key: 'Escape' });
    expect(pressedStates(container)).toEqual(ALL_OFF);

    // 5. Guard: an Escape something nearer the focus already handled leaves the highlight lit.
    await user.click(pastDue());
    expect(pastDue()).toHaveAttribute('aria-pressed', 'true');
    const handled = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true });
    act(() => {
      screen.getByTestId('guard').dispatchEvent(handled);
    });
    expect(pastDue()).toHaveAttribute('aria-pressed', 'true');

    // 6. Guard control: the same Escape on a sibling with no listener clears, and the hook consumed it.
    const plain = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true });
    act(() => {
      screen.getByTestId('sibling').dispatchEvent(plain);
    });
    expect(pressedStates(container)).toEqual(ALL_OFF);
    expect(plain.defaultPrevented).toBe(true);

    // 7. Reload: the lit number drops to 0 → cleared.
    await user.click(pastDue());
    expect(pastDue()).toHaveAttribute('aria-pressed', 'true');
    rerender(<Harness home={{ ...HOME, counts: { ...HOME.counts, pastDue: 0 } }} />);
    expect(pressedStates(container)).toEqual(ALL_OFF);
    // Control, H6 (p11): a count that changes but stays above 0 — at 1, the just-outside value — stays lit.
    rerender(<Harness home={HOME} />);
    await user.click(open());
    expect(open()).toHaveAttribute('aria-pressed', 'true');
    rerender(<Harness home={{ ...HOME, counts: { ...HOME.counts, open: 1 } }} />);
    expect(open()).toHaveAttribute('aria-pressed', 'true');

    // Q1 (planner ruling 14:44): a lit Members that reloads as null (access withdrawn) clears.
    rerender(<Harness home={HOME} />);
    await user.click(members());
    expect(members()).toHaveAttribute('aria-pressed', 'true');
    rerender(<Harness home={{ ...HOME, counts: { ...HOME.counts, members: null } }} />);
    expect(pressedStates(container)).toEqual(ALL_OFF);
    // Control: a lit Members that reloads as 3 stays lit.
    rerender(<Harness home={HOME} />);
    await user.click(members());
    rerender(<Harness home={{ ...HOME, counts: { ...HOME.counts, members: 3 } }} />);
    expect(members()).toHaveAttribute('aria-pressed', 'true');

    // H5 (p11) + Q1: a lit number whose data is withdrawn (home null, failed) clears; the tile row still renders.
    rerender(<Harness home={HOME} />);
    await user.click(pastDue());
    expect(pastDue()).toHaveAttribute('aria-pressed', 'true');
    expect(() => rerender(<Harness home={null} />)).not.toThrow();
    expect(screen.getAllByRole('button', { name: /Past due$/ })).toHaveLength(1);
    expect(pressedStates(container)).toEqual(ALL_OFF);
  });
});

/** The `@media (max-width: 40rem)` blocks, each walked by brace DEPTH to its own closing brace. */
function mediaBlocks(css: string, query: string): string[] {
  const blocks: string[] = [];
  let from = 0;
  for (;;) {
    const at = css.indexOf(query, from);
    if (at === -1) return blocks;
    const open = css.indexOf('{', at);
    let depth = 0;
    let end = open;
    for (let i = open; i < css.length; i += 1) {
      if (css[i] === '{') depth += 1;
      else if (css[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    blocks.push(css.slice(open + 1, end));
    from = end + 1;
  }
}

describe('27.640 the phone grid: one row of six, 3×2 below 40rem', () => {
  it('27.640 .gn-home__numbers declares six columns; the one 40rem block naming it declares three; control: the six-column rule is not inside that block', () => {
    const top = ruleFor(CSS, /^\.gn-home__numbers\s*\{/);
    expect(top).toBeDefined();
    expect(top).toContain('grid-template-columns: repeat(6, minmax(0, 1fr))');
    const blocks = mediaBlocks(CSS, '@media (max-width: 40rem)').filter((block) => block.includes('.gn-home__numbers'));
    expect(blocks).toHaveLength(1);
    const block = blocks[0]!;
    expect(block.length).toBeGreaterThan(0);
    expect(block).toContain('repeat(3, minmax(0, 1fr))');
    expect(block).not.toContain('repeat(6');
  });
});
