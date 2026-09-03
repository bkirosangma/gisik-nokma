import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * The session is a per-case value, because this component's whole gate is
 * `useSessionStatus`'s three states and a fixed mock would pin only one of them.
 */
let session: { data?: { user: { id: string; name: string } }; isPending?: boolean } = {};
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => session,
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { InboxNavLink, REFRESH_MS } from '../src/inbox-nav-link.js';

beforeEach(() => {
  session = { data: { user: { id: 'u_kiro', name: 'Kiro' } } };
});
afterEach(() => {
  vi.useRealTimers();
});

describe('InboxNavLink — the badge that keeps its last honest value', () => {
  it('11.152 reads the unread total once on mount and renders it with its real accessible name', async () => {
    render(
      <Providers services={stubServices({}, { notifications: { unreadCount: async () => 3 } })}>
        <InboxNavLink />
      </Providers>,
    );
    expect(await screen.findByRole('img', { name: '3 unread notifications' })).toHaveTextContent(
      '3',
    );
  });

  it('11.153 does NOT poll for a signed-out viewer — a request that can only 401, forever', async () => {
    session = { isPending: false };
    let calls = 0;
    render(
      <Providers
        services={stubServices(
          {},
          {
            notifications: {
              unreadCount: async () => {
                calls += 1;
                return 5;
              },
            },
          },
        )}
      >
        <InboxNavLink />
      </Providers>,
    );
    await waitFor(() => expect(screen.getByRole('link', { name: /Inbox/ })).toBeInTheDocument());
    expect(calls).toBe(0);
    // And no badge is drawn: an absence claims nothing, while a `0` would be a count.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('11.154 does not read while the session is still in flight, and reads as soon as it lands', async () => {
    session = { isPending: true };
    let calls = 0;
    const services = stubServices(
      {},
      {
        notifications: {
          unreadCount: async () => {
            calls += 1;
            return 2;
          },
        },
      },
    );
    const { rerender } = render(
      <Providers services={services}>
        <InboxNavLink />
      </Providers>,
    );
    expect(calls).toBe(0);

    session = { data: { user: { id: 'u_kiro', name: 'Kiro' } } };
    rerender(
      <Providers services={services}>
        <InboxNavLink />
      </Providers>,
    );
    await waitFor(() => expect(calls).toBe(1));
  });

  it('11.155 refreshes on the plan’s one-minute cadence', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    render(
      <Providers
        services={stubServices(
          {},
          {
            notifications: {
              unreadCount: async () => {
                calls += 1;
                return calls;
              },
            },
          },
        )}
      >
        <InboxNavLink />
      </Providers>,
    );
    await waitFor(() => expect(calls).toBe(1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_MS);
    });
    await waitFor(() => expect(calls).toBe(2));
    expect(await screen.findByRole('img', { name: '2 unread notifications' })).toBeInTheDocument();
  });

  it('11.156 keeps the last count when a refresh fails, rather than resetting to none', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    render(
      <Providers
        services={stubServices(
          {},
          {
            notifications: {
              unreadCount: async () => {
                calls += 1;
                if (calls === 1) return 4;
                throw new Error('offline');
              },
            },
          },
        )}
      >
        <InboxNavLink />
      </Providers>,
    );
    expect(await screen.findByRole('img', { name: '4 unread notifications' })).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_MS);
    });
    await waitFor(() => expect(calls).toBe(2));
    // Still 4. A reset to 0 would have hidden the badge and told the reader
    // there is nothing waiting, on the strength of a request that failed.
    expect(screen.getByRole('img', { name: '4 unread notifications' })).toBeInTheDocument();
  });

  it('11.157 stops the timer on unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let calls = 0;
    const { unmount } = render(
      <Providers
        services={stubServices(
          {},
          {
            notifications: {
              unreadCount: async () => {
                calls += 1;
                return 1;
              },
            },
          },
        )}
      >
        <InboxNavLink />
      </Providers>,
    );
    await waitFor(() => expect(calls).toBe(1));
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_MS * 3);
    });
    expect(calls).toBe(1);
  });
});
