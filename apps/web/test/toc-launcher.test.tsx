import { createRef } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReadingMeta } from '@gisik-nokma/editor';
import { TocLauncher } from '../src/notes/toc-launcher.js';

/**
 * 13.1479–13.1484 — the floating table-of-contents button (owner request
 * 2026-09-23: "a small floating icon at the left bottom of the screen which
 * can open the table of contents any time"), standalone — built and tested
 * ahead of its wiring into `notes-page.tsx`'s `.gn-notes__toc` `<aside>`
 * (Unit 4/5's own cases), which collides with `task/notes-7-inline-references`
 * and is on hold. Nothing here depends on that wiring: the component takes
 * the same `headings`/`scrollContainerRef` pair `ReadingTOC` itself takes.
 *
 * Escape-closes-and-returns-focus and outside-click-closes-without follow
 * `account-menu.tsx`'s own established `close(returnFocus: boolean)` pattern
 * rather than inventing a second one.
 */
const TWO: ReadingMeta['headings'] = [
  { id: 'one', level: 1, text: 'One' },
  { id: 'two', level: 2, text: 'Two' },
];
const THREE: ReadingMeta['headings'] = [
  ...TWO,
  { id: 'three', level: 3, text: 'Three' },
];

function mount(headings: ReadingMeta['headings']) {
  const ref = createRef<HTMLDivElement>();
  return render(
    <div>
      <div ref={ref}>
        {headings.map((h) => (
          <h2 id={h.id} key={h.id}>
            {h.text}
          </h2>
        ))}
      </div>
      <TocLauncher headings={headings} scrollContainerRef={ref} />
    </div>,
  );
}

afterEach(cleanup);

describe('TocLauncher', () => {
  /** MUTATION TARGET: gate on `headings.length >= 2` instead of `MIN_HEADINGS`. */
  it('13.1479 renders no button under MIN_HEADINGS (control: 2 headings)', () => {
    mount(TWO);
    expect(screen.queryByRole('button', { name: 'On this page' })).not.toBeInTheDocument();
  });

  it('13.1480 renders the button at MIN_HEADINGS (3 headings)', () => {
    mount(THREE);
    const button = screen.getByRole('button', { name: 'On this page' });
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveAttribute('aria-controls');
  });

  it('13.1481 opening the button shows the TOC entries', async () => {
    mount(THREE);
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: 'On this page' });
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const nav = screen.getByRole('navigation', { name: 'On this page' });
    const links = within(nav).getAllByRole('link');
    expect(links.map((link) => link.textContent)).toEqual(['One', 'Two', 'Three']);
  });

  /**
   * The control BEFORE the mutation-tested arm: focus must actually be
   * inside the panel before Escape can prove it came back out. Without this,
   * a broken focus-return reads identically to focus never having left the
   * button in the first place. MUTATION TARGET: drop `close`'s focus-return.
   */
  it('13.1482 Escape closes the panel and returns focus to the button', async () => {
    mount(THREE);
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: 'On this page' });
    await user.click(button);
    const firstLink = within(screen.getByRole('navigation', { name: 'On this page' })).getAllByRole('link')[0]!;
    firstLink.focus();
    expect(firstLink).toHaveFocus(); // CONTROL: focus is actually inside the panel.

    await user.keyboard('{Escape}');
    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(button).toHaveFocus();
  });

  it('13.1483 choosing a heading closes the panel (ReadingTOC keeps its own scroll behaviour)', async () => {
    mount(THREE);
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: 'On this page' });
    await user.click(button);
    const link = within(screen.getByRole('navigation', { name: 'On this page' })).getByRole('link', { name: 'One' });
    await user.click(link);
    expect(button).toHaveAttribute('aria-expanded', 'false');
  });

  it('13.1484 a pointerdown outside the launcher closes the panel without stealing focus', async () => {
    mount(THREE);
    const user = userEvent.setup();
    const button = screen.getByRole('button', { name: 'On this page' });
    await user.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');

    const outside = document.createElement('input');
    document.body.appendChild(outside);
    outside.focus();
    await user.click(outside);

    expect(button).toHaveAttribute('aria-expanded', 'false');
    expect(outside).toHaveFocus(); // Focus stayed where the user clicked.
    outside.remove();
  });

  /**
   * 18.181's landmark contract, restated for the standalone component: it
   * must render an `aria-label="On this page"` navigation (through
   * `ReadingTOC`) once open, matching what the eventual `.gn-notes__toc`
   * wiring depends on.
   */
  it('renders no navigation landmark at all while closed', () => {
    mount(THREE);
    expect(screen.queryByRole('navigation', { name: 'On this page' })).not.toBeInTheDocument();
  });
});
