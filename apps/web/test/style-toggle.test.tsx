import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { StyleToggle } from '../src/style-toggle.js';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset['style'];
});

describe('StyleToggle — neo is the default, not the absence of a choice', () => {
  /**
   * 13.344 (retitled: a `<select>`, not `SegmentedControl`, since the owner
   * moved this control off `AppNav` onto `/account`) — one labelled dropdown
   * with all three styles as options, and `data-style` set on the theme
   * element when a choice is made. Mutation: drop the field's label → RED.
   */
  it('renders one labelled dropdown with all three styles, and sets data-style on change', async () => {
    const user = userEvent.setup();
    render(<StyleToggle />);
    const select = screen.getByRole('combobox', { name: 'Style' });
    const options = screen.getAllByRole('option').map((option) => option.textContent);
    expect(options).toEqual(['HIG', 'Minimal', 'Neu']);
    expect(select).toHaveValue('neo');

    await user.selectOptions(select, 'HIG');
    expect(document.documentElement.dataset['style']).toBe('hig');
    expect(select).toHaveValue('hig');
  });

  /**
   * 13.345 — with nothing stored, the applied `data-style` is `neo`. Mutation:
   * default the component's initial state to `hig` → RED.
   */
  it('defaults to neo when nothing is stored', () => {
    render(<StyleToggle />);
    expect(screen.getByRole('combobox', { name: 'Style' })).toHaveValue('neo');
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
    expect(await screen.findByRole('combobox', { name: 'Style' })).toHaveValue('minimal');
  });

  it('persists an explicit choice for the next mount to restore', async () => {
    const user = userEvent.setup();
    render(<StyleToggle />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Style' }), 'Minimal');
    expect(localStorage.getItem('gn-style')).toBe('minimal');
  });
});
