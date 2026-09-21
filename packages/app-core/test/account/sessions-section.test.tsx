import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { SessionsSection } from '../../src/account/sessions-section.js';

/**
 * Account/help-screens plan, Task 7. `SessionsSection` is framework-free
 * (no `authClient`, no HTTP) — these cases drive it directly, the same way
 * `NotificationsSection`'s own suite does for its section. The wiring from
 * `authClient.listSessions`/`revokeSession` through to this component is
 * proven at the page level in `apps/web/test/account-page.test.tsx`.
 */
const SESSIONS = [
  { token: 't1', createdAt: '2026-09-01T00:00:00Z', updatedAt: '2026-09-14T00:00:00Z', deviceLabel: 'Chrome on Mac', isCurrent: true },
  { token: 't2', createdAt: '2026-09-05T00:00:00Z', updatedAt: '2026-09-10T00:00:00Z', deviceLabel: 'Unknown device', isCurrent: false },
];

describe('SessionsSection', () => {
  it('lists every session with its device label', () => {
    render(<SessionsSection sessions={SESSIONS} onRevoke={vi.fn()} />);
    expect(screen.getByText('Chrome on Mac')).toBeInTheDocument();
    expect(screen.getByText('Unknown device')).toBeInTheDocument();
  });

  it('the current session has no revoke control; others do', () => {
    render(<SessionsSection sessions={SESSIONS} onRevoke={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /sign out/i })).toHaveLength(1);
  });

  /**
   * Added with the Account styling port. Before it, an empty list rendered a
   * heading with NOTHING under it — measured in a real browser on `/account`,
   * where the section was a bare card.
   *
   * The assertion pins the HEDGED wording, not just the presence of some text:
   * `/account`'s own effect collapses a FAILED read to `[]`, so this component
   * cannot distinguish "no devices" from "the read did not answer". A message
   * asserting the former ("You have no other devices") would be a claim about
   * the account that an empty array does not establish, and that distinction
   * is the whole reason this case exists rather than a looser
   * `toBeInTheDocument` on any paragraph.
   */
  it('renders a hedged empty state rather than a bare heading when no sessions are listed', () => {
    render(<SessionsSection sessions={[]} onRevoke={vi.fn()} />);
    expect(screen.getByText('No signed-in devices to show.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /sign out/i })).toBeNull();
  });

  /**
   * The footnote is prototype copy kept because it is TRUE of this product —
   * history is append-only, so revoking a session cannot retract what it
   * recorded. Pinned because a future tidy-up that drops it would quietly
   * remove the one sentence telling a person that signing a device out is
   * not destructive.
   */
  it('states that signing a device out does not remove what it recorded', () => {
    render(<SessionsSection sessions={SESSIONS} onRevoke={vi.fn()} />);
    expect(screen.getByText(/does not remove what it recorded/)).toBeInTheDocument();
  });

  it("clicking Sign out calls onRevoke with that session's token", async () => {
    const onRevoke = vi.fn();
    const user = userEvent.setup();
    render(<SessionsSection sessions={SESSIONS} onRevoke={onRevoke} />);
    await user.click(screen.getByRole('button', { name: /sign out/i }));
    expect(onRevoke).toHaveBeenCalledWith('t2');
  });

  it('"Last active" goes through formatDateTime, never the raw ISO string', () => {
    // Pins the clock rule Features.md states for every other date on this
    // shell (formatIstInstant, never an ISO slice): '2026-09-10T00:00:00Z' is
    // NOT what should reach the screen, and this is the one place that raw
    // value would otherwise leak through unnoticed — no other case in this
    // file reads the "Last active" text at all. Expected string confirmed by
    // running `formatDateTime('2026-09-10T00:00:00Z')` directly rather than
    // computed by hand.
    render(<SessionsSection sessions={SESSIONS} onRevoke={vi.fn()} />);
    expect(screen.getByText('Last active 10 Sep 2026, 05:30 IST')).toBeInTheDocument();
    expect(screen.queryByText(/2026-09-10T00:00:00Z/)).not.toBeInTheDocument();
  });

  /**
   * RULING E2-24(b) — a "Sign out" refusal used to be read and discarded
   * entirely by the page (`await sessionsClient.revoke(token);`, the result
   * never inspected): the list simply failed to shrink, with nothing on
   * screen to say a refusal even happened. The component's own half of the
   * fix is this `error` prop, the same one-prop shape `PasskeysSection`'s
   * add/remove refusal already carries.
   */
  it('a revoke refusal renders verbatim in a role="alert"', () => {
    render(<SessionsSection sessions={SESSIONS} onRevoke={vi.fn()} error="Session not found" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Session not found');
  });

  it('renders no alert at all when there is no refusal', () => {
    // The negative half — matching PasskeysSection's own precedent — without
    // which the case above is satisfied by a component that renders a
    // `role="alert"` unconditionally and merely happens to be empty.
    render(<SessionsSection sessions={SESSIONS} onRevoke={vi.fn()} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
