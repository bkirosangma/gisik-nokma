import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { StyleToggle } from '../src/style-toggle.js';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset['style'];
});

async function pickStyle(user: ReturnType<typeof userEvent.setup>, label: string) {
  await user.click(screen.getByRole('button', { name: /Style/ }));
  const listbox = await screen.findByRole('listbox');
  await user.click(within(listbox).getByRole('option', { name: label }));
}

describe('StyleToggle — neo is the default, not the absence of a choice', () => {
  /**
   * 13.344 (retitled again: the shared `Select` component, not a plain
   * `<select>`, since Phase 2 Wave A migrated this control onto it — the
   * `<select>` itself was already a retitle from `SegmentedControl` when the
   * owner moved this off `AppNav` onto `/account`) — one labelled control
   * with all three styles as options, and `data-style` set on the theme
   * element when a choice is made. Mutation: drop the field's label → RED.
   */
  it('renders one labelled control with all three styles, and sets data-style on change', async () => {
    const user = userEvent.setup();
    render(<StyleToggle />);
    const trigger = screen.getByRole('button', { name: /Style/ });
    expect(trigger).toHaveTextContent('Neu');

    await user.click(trigger);
    const listbox = await screen.findByRole('listbox');
    const options = within(listbox).getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['HIG', 'Minimal', 'Neu']);

    await user.click(within(listbox).getByRole('option', { name: 'HIG' }));
    expect(document.documentElement.dataset['style']).toBe('hig');
    expect(screen.getByRole('button', { name: /Style/ })).toHaveTextContent('HIG');
  });

  /**
   * 13.345 — with nothing stored, the applied `data-style` is `neo`. Mutation:
   * default the component's initial state to `hig` → RED.
   */
  it('defaults to neo when nothing is stored', () => {
    render(<StyleToggle />);
    expect(screen.getByRole('button', { name: /Style/ })).toHaveTextContent('Neu');
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
    expect(await screen.findByRole('button', { name: /Style/ })).toHaveTextContent('Minimal');
  });

  it('persists an explicit choice for the next mount to restore', async () => {
    const user = userEvent.setup();
    render(<StyleToggle />);
    await pickStyle(user, 'Minimal');
    expect(localStorage.getItem('gn-style')).toBe('minimal');
  });
});
