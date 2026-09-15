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
});
