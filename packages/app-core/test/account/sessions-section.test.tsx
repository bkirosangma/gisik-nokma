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
});
