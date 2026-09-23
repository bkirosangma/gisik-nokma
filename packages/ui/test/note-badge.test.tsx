import { render, screen } from '@testing-library/react';
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
