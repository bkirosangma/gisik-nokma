import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { ThemeToggle } from '../src/theme-toggle.js';

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset['theme'];
});

/**
 * REWRITTEN for the segmented control the owner's Appearance reference asks
 * for (2026-09-15). The control changed shape — a cycle button became three
 * visible segments — so the three cases below are new, but they assert the
 * SAME properties the cycle-button cases did, deliberately: an explicit
 * choice stamps `data-theme` and persists, `system` REMOVES both rather than
 * writing itself down, and a stored choice is restored on mount. What was
 * lost with the old shape is only the cycle ORDER, which no longer exists to
 * be wrong.
 */
const tablist = () => screen.getByRole('tablist', { name: 'Theme' });
const segment = (name: string) => within(tablist()).getByRole('tab', { name });

describe('ThemeToggle — explicit choice wins, system is the default', () => {
  /**
   * 3.83, restated for the new shape: picking a theme stamps `data-theme` and
   * persists it, and picking `system` clears BOTH rather than storing the
   * word "system" — so the default stays an absence of preference instead of
   * becoming a preference. Mutation: make the `system` arm write
   * `localStorage` like the others → RED on the last two assertions.
   */
  it('an explicit pick stamps and persists; System clears both', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(segment('Light'));
    expect(document.documentElement.dataset['theme']).toBe('light');
    expect(localStorage.getItem('gn-theme')).toBe('light');

    await user.click(segment('Dark'));
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem('gn-theme')).toBe('dark');

    await user.click(segment('System'));
    expect(document.documentElement.dataset['theme']).toBeUndefined();
    expect(localStorage.getItem('gn-theme')).toBeNull();
  });

  /**
   * The pre-paint script in `app/layout.tsx` stamps the attribute; this
   * component has to agree with it, or the control shows a different state
   * than the page is actually painted in. Mutation: drop the `useEffect` that
   * reads `localStorage` → RED (System stays selected over a stored dark).
   */
  it('a stored choice is restored on mount, so the control agrees with the paint', async () => {
    localStorage.setItem('gn-theme', 'dark');
    render(<ThemeToggle />);
    expect(await screen.findByRole('tab', { name: 'Dark', selected: true })).toBeInTheDocument();
    expect(segment('System')).toHaveAttribute('aria-selected', 'false');
  });

  /**
   * THE CAPABILITY THE REFERENCE IMAGE WOULD HAVE REMOVED, pinned so it
   * cannot be dropped quietly. The reference shows `Light | Dark` only;
   * `system` is kept as a third segment because it is the only route back to
   * the device's own preference once a choice has been made, and it is also
   * the default state the control must be able to display. Mutation: delete
   * the `system` option → RED here.
   */
  it('offers System as well as Light and Dark, and starts there by default', () => {
    render(<ThemeToggle />);
    const names = within(tablist())
      .getAllByRole('tab')
      .map((tab) => tab.textContent);
    expect(names).toEqual(['System', 'Light', 'Dark']);
    expect(segment('System')).toHaveAttribute('aria-selected', 'true');
  });
});
