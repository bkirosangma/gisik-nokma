import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { UnreadBadge } from '../../src/inbox/unread-badge.js';

/**
 * 11.88 — `UnreadBadge`, asserted in BOTH directions at every boundary it has.
 *
 * Three conditionals live in eleven lines of component, and each one has a
 * mutation that every "it shows the right number" test in the world survives:
 *
 * - the visibility guard, where `count <= 0` and `count === 0` agree on every
 *   count a healthy server sends — so the pin is a NEGATIVE count;
 * - the cap, where `> 99` and `>= 99` differ on exactly one value — so 99 and
 *   100 are both asserted;
 * - the plural, where a singular fixture and a plural fixture are the only
 *   pair that can tell `notification` from `notifications`.
 *
 * Absence is asserted with `queryByText` against the DOCUMENT rather than by
 * reading a returned element, because the component returns `null` and a test
 * that only inspects what it returned cannot see an always-render mutation.
 *
 * ## `getByLabelText` IS NOT AN ACCESSIBLE-NAME ASSERTION, and every case
 * below except the last group was written as if it were
 *
 * `getByLabelText` matches the `aria-label` ATTRIBUTE. It does not compute an
 * accessible name, so it returns the same element whether the label is exposed
 * to assistive technology or silently discarded — and on the role-less `<span>`
 * this component used to render, ARIA prohibits naming (`generic`), so it was
 * the second case. Every one of those queries stayed green through the fix,
 * which is what makes them non-witnesses rather than failing tests. The role
 * queries in the final group are the ones that can see the difference: they go
 * through the accessible-name computation, and deleting `role="img"` from the
 * component reddens them.
 *
 * WHAT THIS CANNOT PROVE, stated so nobody reads more into it: jsdom is not a
 * screen reader. These cases witness that the component now carries a role
 * that makes the label nameable. They do NOT demonstrate that the previous
 * markup went unannounced in any particular AT — no mutation of this component
 * could show that, and the finding was reasoned from the ARIA spec rather than
 * measured.
 */
describe('11.88 the badge is silent when there is nothing to say', () => {
  it('renders NOTHING at zero', () => {
    const { container } = render(<UnreadBadge count={0} />);
    expect(container.querySelector('.gn-inbox__badge')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('renders at one — the other direction of the same guard', () => {
    render(<UnreadBadge count={1} />);
    expect(screen.getByLabelText('1 unread notification')).toHaveTextContent('1');
  });

  it('renders nothing for a negative count: not a smaller number, a broken input', () => {
    // The one case that separates `count <= 0` from `count === 0`. Without it
    // the guard's spelling is a coin flip nothing measures, and a `-1` from a
    // misbehaving adapter would be drawn faithfully into the chrome.
    const { container } = render(<UnreadBadge count={-1} />);
    expect(container.querySelector('.gn-inbox__badge')).toBeNull();
  });
});

describe('11.88 the cap is a boundary, and both sides of it are witnessed', () => {
  it('99 shows as 99 — the last uncapped count', () => {
    render(<UnreadBadge count={99} />);
    expect(screen.getByLabelText('99 unread notifications')).toHaveTextContent('99');
    expect(screen.queryByText('99+')).toBeNull();
    expect(document.querySelector('[data-capped]')).toBeNull();
  });

  it('100 shows as 99+, and the accessible name still carries the TRUE total', () => {
    render(<UnreadBadge count={137} />);
    const badge = screen.getByLabelText('137 unread notifications');
    // The glyph caps because the exact number stops being information; the
    // label does not, because a screen-reader user would otherwise learn
    // strictly less than a sighted one, who at least sees a wide badge.
    expect(badge).toHaveTextContent('99+');
    expect(badge).toHaveAttribute('data-capped', 'true');
    // And 100 is the first capped value, so the boundary is pinned from both
    // sides rather than from one comfortably distant number.
    render(<UnreadBadge count={100} />);
    expect(screen.getByLabelText('100 unread notifications')).toHaveTextContent('99+');
  });
});

describe('11.88 the accessible name agrees with itself about how many', () => {
  it('is singular at one and plural at two', () => {
    const { unmount } = render(<UnreadBadge count={1} />);
    expect(screen.getByText('1')).toHaveAttribute('aria-label', '1 unread notification');
    unmount();
    render(<UnreadBadge count={2} />);
    expect(screen.getByText('2')).toHaveAttribute('aria-label', '2 unread notifications');
  });
});

describe('11.88 the accessible NAME exists, not merely an attribute nobody must expose', () => {
  it('the badge is reachable BY ROLE AND NAME — the query that goes through name computation', () => {
    render(<UnreadBadge count={137} />);
    // `getByRole(..., { name })` computes the accessible name; `getByLabelText`
    // reads the attribute. That is the whole difference this case exists for,
    // and it is why the three cases above stayed green while the defect stood.
    const badge = screen.getByRole('img', { name: '137 unread notifications' });
    // The two halves of the design, on ONE element: the name carries the true
    // total, the visible glyph carries the cap.
    expect(badge).toHaveTextContent('99+');
    expect(badge).toHaveClass('gn-inbox__badge');
  });

  it('and the CAP never reaches the name, at the boundary and below it', () => {
    // Below the cap the two agree, which is the case that would still pass if
    // the name were somehow derived from the content — so the capped case
    // above is the one that discriminates, and both are kept.
    const { unmount } = render(<UnreadBadge count={1} />);
    expect(screen.getByRole('img', { name: '1 unread notification' })).toHaveTextContent('1');
    unmount();
    render(<UnreadBadge count={100} />);
    const capped = screen.getByRole('img', { name: '100 unread notifications' });
    expect(capped).toHaveTextContent('99+');
    // Stated as its own assertion so a regression names itself: the cap is a
    // layout decision and must never become what a screen reader is told.
    expect(screen.queryByRole('img', { name: /99\+/ })).toBeNull();
  });

  it('a hidden badge is not a NAMED hidden badge — the role does not resurrect the zero case', () => {
    // `role="img"` is on the returned element, and the component returns
    // `null` at zero. Without this, a mutation that dropped the `count <= 0`
    // guard would be caught only by the class-based cases above, and the role
    // queries would be the two cases that quietly disagreed with them.
    render(<UnreadBadge count={0} />);
    expect(screen.queryByRole('img')).toBeNull();
  });
});
