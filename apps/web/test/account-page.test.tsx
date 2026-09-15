import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceRef } from '@gisik-nokma/app-core';

vi.mock('next/navigation', () => ({
  usePathname: () => '/account',
  useRouter: () => ({ push: vi.fn() }),
}));
/**
 * `vi.hoisted`, not a bare `const` — `vi.mock` is hoisted above every
 * statement in this file, so a factory closing over a module-level binding
 * declared below it throws `ReferenceError: Cannot access 'updateUser' before
 * initialization` at import time (documented precedent: `test/sign-in.test.tsx`'s
 * own docblock on this exact mistake). `listSessions`/`revokeSession` (Task 7)
 * join the SAME `vi.hoisted` call rather than a second one — there is exactly
 * one `vi.mock('../src/auth-client.js', ...)` call in this file, extended
 * here, not duplicated — and are referenced directly as the mock's members
 * below, no wrapper closure needed.
 */
const { updateUser, listSessions, revokeSession } = vi.hoisted(() => ({
  updateUser: vi.fn(),
  listSessions: vi.fn(),
  revokeSession: vi.fn(),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    signOut: vi.fn(),
    useSession: () => ({
      data: {
        user: { id: 'u1', name: 'Anjali Kharkongor', email: 'anjali@example.com' },
        // Task 7: the current session's own token, read by the page as
        // `session.data?.session.token` to build `createSessionsClient`.
        // Added to the ONE existing `useSession` mock rather than a second
        // one — every describe block in this file shares this return value,
        // and none of the pre-Task-7 assertions read `.session`, so this is
        // additive.
        session: { token: 'current-token' },
      },
    }),
    updateUser,
    listSessions,
    revokeSession,
  },
}));

import AccountPage from '../app/account/page.js';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

function mount() {
  render(
    <Providers services={stubServices({ getMyWorkspaces: async () => [] }, {})}>
      <AccountPage />
    </Providers>,
  );
}

describe('AccountPage — the global settings shell', () => {
  it('renders AppNav and a page title', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: 'Account' })).toBeInTheDocument();
  });

  it('renders the Appearance section with both the Style and Theme controls', async () => {
    mount();
    expect(await screen.findByRole('button', { name: /Style/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Theme:/ })).toBeInTheDocument();
  });
});

describe('AccountPage — Profile', () => {
  it('shows the current name and email, and saves an edited name', async () => {
    updateUser.mockResolvedValue({ data: {}, error: null });
    const user = userEvent.setup();
    mount();
    const nameInput = await screen.findByLabelText('Name');
    expect(nameInput).toHaveValue('Anjali Kharkongor');
    expect(screen.getByText('anjali@example.com')).toBeInTheDocument();
    await user.clear(nameInput);
    await user.type(nameInput, 'Anjali K.');
    await user.click(screen.getByRole('button', { name: 'Save name' }));
    expect(updateUser).toHaveBeenCalledWith({ name: 'Anjali K.' });
  });

  it('shows a refusal verbatim if the save fails', async () => {
    updateUser.mockResolvedValue({ data: null, error: { message: 'Name cannot be empty' } });
    const user = userEvent.setup();
    mount();
    await user.click(await screen.findByRole('button', { name: 'Save name' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Name cannot be empty');
  });
});

function workspace(over: Partial<WorkspaceRef> = {}): WorkspaceRef {
  return {
    id: 'w1', name: 'Meghalaya Rollout', role: 'admin',
    memberCount: 4, nameRestrictedProjectCount: 0, projects: [],
    ...over,
  };
}

describe('AccountPage — Notifications', () => {
  it('11.208 loads real preferences through useAppServices and renders a muted kind unchecked — the page→gateway→section wiring', async () => {
    render(
      <Providers
        services={stubServices(
          { getMyWorkspaces: async () => [] },
          { notificationPreferences: { load: async () => ({ mutedKinds: ['mention'] }) } },
        )}
      >
        <AccountPage />
      </Providers>,
    );
    // The un-stubbed default (every other case in this file) rejects by
    // name and the page falls back to the all-on `{ mutedKinds: [] }`, which
    // never proves this seam actually carries a REAL answer through — only a
    // load that resolves to something OTHER than the fallback default can.
    expect(await screen.findByLabelText(/mentioned/i)).not.toBeChecked();
    expect(screen.getByLabelText(/assigned/i)).toBeChecked();
  });

  it('11.209 toggling an unmuted row flips it and saves the expected next mutedKinds', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(
      <Providers
        services={stubServices(
          { getMyWorkspaces: async () => [] },
          { notificationPreferences: { load: async () => ({ mutedKinds: [] }), save } },
        )}
      >
        <AccountPage />
      </Providers>,
    );
    const mentionRow = await screen.findByLabelText(/mentioned/i);
    expect(mentionRow).toBeChecked();
    await user.click(mentionRow);
    // The optimistic `setPrefs(next)` in `toggleKind` — this is the ONLY state
    // update on the success path (nothing re-reads after a successful save),
    // so the flip standing here is what that call did, not a coincidence of
    // `save`'s own mock also resolving to something matching.
    expect(mentionRow).not.toBeChecked();
    expect(save).toHaveBeenCalledWith({ mutedKinds: ['mention'] });
  });

  it('11.210 a refused save reverts the optimistic flip once the reload settles, rather than leaving an invented mute standing', async () => {
    let loadCalls = 0;
    const load = vi.fn(async () => {
      loadCalls += 1;
      // The SAME true value both times: the save never landed, so a correct
      // revert reads back exactly what was there before the click.
      return { mutedKinds: [] };
    });
    const user = userEvent.setup();
    render(
      <Providers
        services={stubServices(
          { getMyWorkspaces: async () => [] },
          {
            notificationPreferences: {
              load,
              save: async () => {
                throw new Error('save refused');
              },
            },
          },
        )}
      >
        <AccountPage />
      </Providers>,
    );
    const mentionRow = await screen.findByLabelText(/mentioned/i);
    expect(loadCalls).toBe(1);
    await user.click(mentionRow);
    // `toggleKind`'s `.catch()` re-reads the true stored state — the same
    // mechanism `/inbox`'s own `markRead` catch uses (case 11.147) — so a
    // second `load()` call is the mechanism firing, not merely a coincidence
    // of the DOM settling back on its own.
    await waitFor(() => expect(loadCalls).toBe(2));
    // Drawn from the reloaded answer: the optimistic mute did not stick.
    await waitFor(() => expect(screen.getByLabelText(/mentioned/i)).toBeChecked());
  });
});

describe('AccountPage — Your workspaces', () => {
  it('lists each workspace with its real role and project count', async () => {
    render(
      <Providers services={stubServices({
        getMyWorkspaces: async () => [
          workspace({ id: 'w1', name: 'Meghalaya Rollout', role: 'admin', projects: [{ id: 'p1', name: 'Delivery', archived: false, ticketCount: 3, blockedCount: 0 }] }),
          workspace({ id: 'w2', name: 'Field Support', role: 'member', projects: [] }),
        ],
      }, {})}>
        <AccountPage />
      </Providers>,
    );
    expect(await screen.findByText('Meghalaya Rollout')).toBeInTheDocument();
    expect(screen.getByText('admin')).toBeInTheDocument();
    expect(screen.getByText('1 project')).toBeInTheDocument();
    expect(screen.getByText('Field Support')).toBeInTheDocument();
    expect(screen.getByText('member')).toBeInTheDocument();
    expect(screen.getByText('0 projects')).toBeInTheDocument();
  });
});

describe('AccountPage — Sessions', () => {
  it('lists sessions and lets you revoke a non-current one', async () => {
    // `createdAt`/`updatedAt` as real `Date` instances, not string literals —
    // matching what the real `authClient.listSessions()` actually resolves
    // (its fetch client revives ISO date strings back into `Date` on the way
    // in; see `apps/web/src/account/account-clients.ts`'s docblock). A string
    // literal here would let the adapter's `.toISOString()` conversion go
    // completely unexercised while still typechecking and still passing.
    //
    // The `userAgent` below is a REAL, full Chrome-on-Mac string, not the
    // hand-abbreviated `'Mozilla/5.0 Chrome Mac'` this fixture originally
    // carried — that abbreviation put the browser token BEFORE the OS token,
    // which is backwards from every real UA string, and is exactly what let
    // `deviceLabelOf`'s original ordered-regex bug ship undetected (see
    // `account-clients.ts`'s docblock and `test/account-clients.test.ts`,
    // which drives that function directly against 9 real UA strings).
    listSessions.mockResolvedValue({
      data: [
        {
          token: 'current-token',
          createdAt: new Date('2026-09-01T00:00:00Z'),
          updatedAt: new Date('2026-09-14T00:00:00Z'),
          userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
        { token: 'other-token', createdAt: new Date('2026-09-05T00:00:00Z'), updatedAt: new Date('2026-09-10T00:00:00Z'), userAgent: null },
      ],
      error: null,
    });
    revokeSession.mockResolvedValue({ error: null });
    const user = userEvent.setup();
    mount();
    expect(await screen.findByText('Chrome on Mac')).toBeInTheDocument();
    expect(screen.getByText('Unknown device')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(revokeSession).toHaveBeenCalledWith({ token: 'other-token' });
  });

  it('renders "Last active" through the FULL pipeline — mocked Date, adapter\'s toISOString, then formatDateTime', async () => {
    // Round 1 fixed the adapter's Date→string conversion; round 2 added a
    // formatDateTime assertion, but only by feeding SessionsSection a
    // hand-written string directly (packages/app-core/test/account/
    // sessions-section.test.tsx), which never runs through this adapter's
    // own `.toISOString()` call. Neither round on its own would catch a
    // mutation IN THE ADAPTER — `.toISOString()` swapped for `String(value)`
    // or `.toDateString()` — because nothing downstream of the mocked `Date`
    // here read what the adapter actually produced. This case does: a real
    // `Date` goes in, and the exact `formatDateTime` string comes out the
    // other end of the real, un-mocked `account-clients.ts` and
    // `SessionsSection`. Expected string confirmed by running
    // `formatDateTime('2026-09-10T00:00:00.000Z')` directly, not computed by
    // hand (same value `sessions-section.test.tsx`'s own case pins, for the
    // same source instant, converted through `.toISOString()` first here).
    listSessions.mockResolvedValue({
      data: [
        {
          token: 'other-token',
          createdAt: new Date('2026-09-05T00:00:00Z'),
          updatedAt: new Date('2026-09-10T00:00:00Z'),
          userAgent: null,
        },
      ],
      error: null,
    });
    mount();
    expect(await screen.findByText('Last active 10 Sep 2026, 05:30 IST')).toBeInTheDocument();
    expect(screen.queryByText(/2026-09-10/)).not.toBeInTheDocument();
  });
});
