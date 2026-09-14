import { render, screen, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
   * Final-review fix wave (Finding I3): pins the wrapper element itself, not
   * just the control's behavior. `apps/web/test/setup.ts` has no suite-wide
   * console guard, so React's `validateDOMNesting` warning for a `<p>`
   * wrapping `Select`'s internally-rendered `<div>` (`HiddenSelect`'s
   * `hidden-select-container`) was previously silent here — every test still
   * went green with the defect live. Spied and asserted locally to this file
   * only; a suite-wide gate is out of scope and would surface unrelated
   * pre-existing warnings elsewhere. Placed FIRST in this describe block on
   * purpose: React dedupes this warning per parent/child tag pair at module
   * scope, so it fires only on the first render of the offending shape in
   * the file — a later position could go green even with the bug back.
   * Mutation: wrap the returned `<div>` in `<p>` again → RED (witnessed).
   */
  it('never emits a DOM-nesting warning for the migrated control', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      render(<StyleToggle />);
      const messages = consoleError.mock.calls.map((call) => call.join(' ')).join('\n');
      expect(messages).not.toMatch(/cannot be a descendant/);
    } finally {
      consoleError.mockRestore();
    }
  });

  /**
   * Final-review fix wave (Finding I3): pins the Task 1 review finding's fix
   * structurally, not just behaviorally — an enclosing `<label>` around the
   * `<span>`/`<Select>` pair mis-associates with `Select`'s internal hidden
   * native `<select>` rather than the visible trigger, breaking
   * click-on-label-text with no other test failure to show it (see the plan's
   * Architecture section and Task 2's Amendment 1). Scoped to `selector:
   * 'span'`: `getByText('Style')` unscoped matches two elements — this
   * component's own visible `<span>Style</span>` AND the text node inside
   * `HiddenSelect`'s own internal (visually-hidden) `<label>Style<select>…`,
   * which is also literally "Style" (confirmed empirically — the unscoped
   * query throws "Found multiple elements"). Only the visible span is the one
   * this assertion is actually about. Mutation: wrap the
   * `<span>Style</span>`/`<Select>` pair in `<label>` again → RED (witnessed).
   */
  it('the migrated control has no enclosing <label>', () => {
    render(<StyleToggle />);
    expect(screen.getByText('Style', { selector: 'span' }).closest('label')).toBeNull();
  });

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
