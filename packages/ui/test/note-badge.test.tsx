import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fireEvent, render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { NOTE_BADGE_TITLE_MAX, NoteBadge, truncateNoteTitle } from '../src/components/note-badge.js';

/**
 * Case 18.197 — `NoteBadge` (notes series Plan 5, spec §10.2).
 *
 * **The one thing this component can get wrong that a screenshot cannot show.**
 * The spec draws the × as a SIBLING of the link, and the reason is the HTML
 * parser rather than taste: interactive content inside an `<a>` is not
 * something a browser will draw, so a badge that nested the button would render,
 * would look right, and would navigate when the user meant to detach. So the
 * assertion below is about ANCESTRY — `button.closest('a')` — and not about
 * whether a button exists.
 */
const TITLE = 'Renew the trade licence';
const HREF = '/notes/01J9NOTECOLDROOM000000000000';

describe('18.197 the note badge', () => {
  it('links the title, and keeps the × OUTSIDE the link', async () => {
    const user = userEvent.setup();
    const onDetach = vi.fn();
    render(<NoteBadge title={TITLE} scopeMode="private" href={HREF} onDetach={onDetach} />);

    const link = screen.getByRole('link', { name: TITLE });
    expect(link).toHaveAttribute('href', HREF);
    expect(link).toHaveAttribute('title', TITLE);

    const detach = screen.getByRole('button', { name: `Detach ${TITLE}` });
    // MUTATION TARGET: a × placed inside the link fails here. The message says
    // which way it is wrong rather than only that an element was not null.
    expect(detach.closest('a'), 'the detach control is nested inside the link').toBeNull();
    expect(link.contains(detach)).toBe(false);
    // ...and they share a parent, which is what "sibling" means here.
    expect(detach.parentElement).toBe(link.parentElement);

    await user.click(detach);
    expect(onDetach).toHaveBeenCalledTimes(1);
  });

  it('renders no × at all when the caller supplies no onDetach', () => {
    render(<NoteBadge title={TITLE} scopeMode="workspace" href={HREF} />);
    expect(screen.getByRole('link', { name: TITLE })).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('truncates the visible title at 40 characters and keeps the whole one in title=', () => {
    const long = 'Compressor stopped in the cold room and nobody noticed for three whole days';
    expect(long.length).toBeGreaterThan(NOTE_BADGE_TITLE_MAX);
    render(<NoteBadge title={long} scopeMode="project" href={HREF} />);

    const link = screen.getByRole('link');
    expect(link.textContent).toBe(truncateNoteTitle(long));
    expect(link.textContent!.length).toBe(NOTE_BADGE_TITLE_MAX);
    expect(link.textContent!.endsWith('…')).toBe(true);
    // The FULL title is still there for a pointer, so nothing is actually lost.
    expect(link).toHaveAttribute('title', long);
  });
});

/**
 * Case 18.322 — the `onOpen` intercept (task/notes-badge-sheet, owner
 * request 2026-09-24).
 *
 * `fireEvent.click` returns whichever boolean `element.dispatchEvent`
 * itself returns — `false` once something has called `preventDefault()` on
 * a cancelable event, `true` otherwise — so it is the one instrument in
 * jsdom that tells "the handler ran AND stopped the navigation" from "the
 * handler ran but left the link alone". A modifier click that also called
 * `preventDefault()` would defeat open-in-new-tab even though `onOpen`
 * itself was never invoked, so both halves are asserted, in every case.
 */
describe('18.322 the badge’s onOpen intercept', () => {
  it('a plain left click prevents the href navigation and calls onOpen exactly once', () => {
    const onOpen = vi.fn();
    render(<NoteBadge title={TITLE} scopeMode="private" href={HREF} onOpen={onOpen} />);
    const link = screen.getByRole('link', { name: TITLE });

    // MUTATION TARGET: a handler that forgets `event.preventDefault()` leaves
    // this `true` — the link would open AND call `onOpen`, a double-open.
    const notPrevented = fireEvent.click(link, { button: 0 });
    expect(notPrevented, 'a plain click must prevent the link’s own navigation').toBe(false);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('a modifier click or a middle click is left alone: onOpen is not called and the link still navigates', () => {
    const onOpen = vi.fn();
    render(<NoteBadge title={TITLE} scopeMode="private" href={HREF} onOpen={onOpen} />);
    const link = screen.getByRole('link', { name: TITLE });

    const modifiedClicks = [
      { ctrlKey: true },
      { metaKey: true },
      { shiftKey: true },
      { altKey: true },
      // A middle click: `button: 1`, no modifier keys.
      { button: 1 },
    ];
    for (const eventInit of modifiedClicks) {
      // MUTATION TARGET: intercepting every click regardless of modifiers
      // fails here — `notPrevented` would read `false` for a click this
      // list says must be left alone.
      const notPrevented = fireEvent.click(link, eventInit);
      expect(notPrevented, `${JSON.stringify(eventInit)} must not be intercepted`).toBe(true);
    }
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('CONTROL — with no onOpen supplied, the link is untouched: nothing is prevented', () => {
    render(<NoteBadge title={TITLE} scopeMode="private" href={HREF} />);
    const link = screen.getByRole('link', { name: TITLE });
    expect(fireEvent.click(link, { button: 0 })).toBe(true);
  });

  it('Enter on the focused badge opens it too, the same as a plain click', async () => {
    const onOpen = vi.fn();
    const user = userEvent.setup();
    render(<NoteBadge title={TITLE} scopeMode="private" href={HREF} onOpen={onOpen} />);
    screen.getByRole('link', { name: TITLE }).focus();
    await user.keyboard('{Enter}');
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});

/**
 * Case 18.329 — no underline on hover; a visible focus ring instead
 * (task/notes-badge-sheet, owner request 2026-09-24: the title now opens the
 * sheet in place rather than navigating).
 *
 * Read straight from `ui.css` with the same first-match `rule()` scan
 * `packages/ui/test/components.test.tsx` uses for the identical reason: this
 * is a CSS fact, not a jsdom-computed style (jsdom does not implement
 * `:hover`/`:focus-visible` matching against a stylesheet at all).
 */
const UI_CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../src/ui.css'), 'utf8');
const GLOBALS_CSS = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../../apps/web/app/globals.css'),
  'utf8',
);
function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = UI_CSS.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`no rule for ${selector}`);
  const body = match[1];
  if (body === undefined) throw new Error(`no rule body captured for ${selector}`);
  return body;
}

describe('18.329 the title’s hover no longer underlines, and keeps a visible focus ring', () => {
  it('the hover rule sets text-decoration: none', () => {
    // MUTATION TARGET: reverting to `underline` fails here.
    expect(rule('.gn-note-badge__title:hover')).toMatch(/text-decoration:\s*none\s*;/);
  });

  it('the badge’s own chip gets a hover affordance that works over every scope tint', () => {
    // A `filter`, not a hard-coded background — the whole reason is in
    // `ui.css`’s own comment beside this rule: a fixed token would be a
    // no-op on `--inherit` and would repaint the × in its own hover colour.
    expect(rule('.gn-note-badge:hover')).toMatch(/filter:\s*brightness\(/);
  });

  it('the title gets a real focus-visible outline, matching the × button’s own', () => {
    const body = rule('.gn-note-badge__title:focus-visible');
    expect(body).toMatch(/outline:\s*2px solid var\(--gn-focus-ring\)/);
    expect(body).toMatch(/outline-offset:\s*1px/);
  });

  it('globals.css defines no rule for this component — ui.css is the whole story (globals.css loads AFTER ui.css, so a rule there would win at equal specificity)', () => {
    expect(GLOBALS_CSS).not.toMatch(/\.gn-note-badge[_:]/);
  });
});
