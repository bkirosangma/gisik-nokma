import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { StyleToggle } from '../src/style-toggle.js';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset['style'];
});

describe('StyleToggle — neo is the default, not the absence of a choice', () => {
  /**
   * 13.344 — one control per style with an aria-label, `data-style` set on the
   * theme element, and `aria-selected` tracking the active style. Mutation:
   * drop the group's `aria-label` → RED.
   */
  it('renders one tab per style, group-labelled, sets data-style, and tracks the active one via aria-selected', async () => {
    const user = userEvent.setup();
    render(<StyleToggle />);
    const list = screen.getByRole('tablist', { name: 'Style' });
    const tabs = within(list).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(['HIG', 'Minimal', 'Neu']);
    const [higTab, minimalTab, neoTab] = [tabs[0]!, tabs[1]!, tabs[2]!];
    expect(neoTab).toHaveAttribute('aria-selected', 'true');
    expect(higTab).toHaveAttribute('aria-selected', 'false');
    expect(minimalTab).toHaveAttribute('aria-selected', 'false');

    await user.click(higTab);
    expect(document.documentElement.dataset['style']).toBe('hig');
    expect(higTab).toHaveAttribute('aria-selected', 'true');
    expect(neoTab).toHaveAttribute('aria-selected', 'false');
  });

  /**
   * 13.345 — with nothing stored, the applied `data-style` is `neo`. Mutation:
   * default the component's initial state to `hig` → RED.
   */
  it('defaults to neo when nothing is stored', () => {
    render(<StyleToggle />);
    expect(screen.getByRole('tab', { name: 'Neu' })).toHaveAttribute('aria-selected', 'true');
  });

  /**
   * 13.346 — the stored style survives a reload, asserted the same way
   * `ThemeToggle`'s persistence is: a stored value restores on mount rather
   * than the component starting from its own default and drifting from what
   * `layout.tsx`'s pre-paint script already applied. Mutation: stop writing
   * `localStorage` in `apply` → RED (the second render never sees the choice).
   */
  it('a stored choice is restored on mount', async () => {
    localStorage.setItem('gn-style', 'minimal');
    render(<StyleToggle />);
    expect(await screen.findByRole('tab', { name: 'Minimal' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Neu' })).toHaveAttribute('aria-selected', 'false');
  });

  it('persists an explicit choice for the next mount to restore', async () => {
    const user = userEvent.setup();
    render(<StyleToggle />);
    await user.click(screen.getByRole('tab', { name: 'Minimal' }));
    expect(localStorage.getItem('gn-style')).toBe('minimal');
  });
});
