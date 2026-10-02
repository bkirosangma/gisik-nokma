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

/** A promise this test resolves by hand, so the PRE-ANSWER window is a state and not a race. */
function deferred<T>() {
  let settle!: (value: T) => void;
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

beforeEach(() => {
  session = { data: { user: { id: 'u_kiro', name: 'Kiro' } } };
});
afterEach(() => {
  vi.useRealTimers();
});

describe('useInboxUnread: the badge does not poll a hidden tab (audit SM-15)', () => {
  afterEach(() => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  });

  it('25.046 the badge does not poll while the document is hidden, and polls again when it is shown', async () => {
    vi.useFakeTimers();
    const unreadCount = vi.fn(async () => 2);
    render(
      <Providers services={stubServices({}, { notifications: { unreadCount } })}>
        <InboxNavLink />
      </Providers>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(unreadCount).toHaveBeenCalledTimes(1);
    // The control, in the same it(): a VISIBLE tab polls on the interval.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_MS);
    });
    expect(unreadCount).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_MS * 2);
    });
    expect(unreadCount).toHaveBeenCalledTimes(2);
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
      await Promise.resolve();
    });
    expect(unreadCount).toHaveBeenCalledTimes(3);
  });
});

describe('InboxNavLink — the badge that keeps its last honest value', () => {
  it('11.152 reads the unread total once on mount and renders it with its real accessible name', async () => {
    render(
      <Providers services={stubServices({}, { notifications: { unreadCount: async () => 3 } })}>
        <InboxNavLink />
      </Providers>,
    );
    // ROUND 24: the count moved from `UnreadBadge`'s visible text into the
    // LINK's accessible name, and the visible signal became a dot (owner
    // ruling). What this case is about — that the total is read once on mount
    // and surfaced with a real accessible name — is unchanged; only the element
    // carrying it moved. `UnreadBadge` itself still renders the number on
    // `/inbox`, and its own tests still cover that.
    expect(
      await screen.findByRole('link', { name: 'Inbox, 3 unread notifications' }),
    ).toBeInTheDocument();
    expect(document.querySelector('.gn-nav__inbox-dot')).not.toBeNull();
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
    await waitFor(() => expect(screen.getByRole('link', { name: 'Inbox' })).toBeInTheDocument());
    expect(calls).toBe(0);
    // And no indicator is drawn: an absence claims nothing, while a `0` would
    // be a count. Round 24 — the name is a bare "Inbox" and there is no dot.
    expect(document.querySelector('.gn-nav__inbox-dot')).toBeNull();
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
    expect(
      await screen.findByRole('link', { name: 'Inbox, 2 unread notifications' }),
    ).toBeInTheDocument();
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
    expect(
      await screen.findByRole('link', { name: 'Inbox, 4 unread notifications' }),
    ).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(REFRESH_MS);
    });
    await waitFor(() => expect(calls).toBe(2));
    // Still 4. A reset to 0 would have dropped the dot and renamed the link to
    // a bare "Inbox", telling the reader there is nothing waiting — on the
    // strength of a request that failed.
    expect(screen.getByRole('link', { name: 'Inbox, 4 unread notifications' })).toBeInTheDocument();
    expect(document.querySelector('.gn-nav__inbox-dot')).not.toBeNull();
  });

  /**
   * 11.169 — the transition neither 11.153 nor 11.154 exercises.
   *
   * 11.153 mounts a viewer who is ALREADY signed out and 11.154 walks loading →
   * signed-in. Neither walks signed-in → signed-out, which is the direction a
   * cookie expiring in place takes: the Sign out button navigates away, so the
   * nav unmounts and nothing is left behind, but an expiring session leaves this
   * component mounted with a count on screen. This component's docblock promises
   * the badge "keeps its last honest value"; a count belonging to a session that
   * has ended is not that viewer's count, and leaving it would make the sentence
   * a claim a reader believes and stops checking behind.
   */
  it('11.169 clears the badge when the session ends in place, rather than showing the last one’s count', async () => {
    const services = stubServices({}, { notifications: { unreadCount: async () => 3 } });
    const { rerender } = render(
      <Providers services={services}>
        <InboxNavLink />
      </Providers>,
    );
    expect(
      await screen.findByRole('link', { name: 'Inbox, 3 unread notifications' }),
    ).toBeInTheDocument();

    session = { isPending: false };
    rerender(
      <Providers services={services}>
        <InboxNavLink />
      </Providers>,
    );
    // ROUND 24: the count is cleared from the link's NAME and the dot goes with
    // it. Asserting both matters — the dot alone disappearing while the name
    // still read "3 unread" would leave the previous session's count being
    // announced to whoever is looking now, which is the exact defect this case
    // exists for.
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Inbox' })).toBeInTheDocument(),
    );
    expect(document.querySelector('.gn-nav__inbox-dot')).toBeNull();
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
  /**
   * 11.174 — "before the first answer there is no badge", which the docblock
   * promises and nothing pinned.
   *
   * `useState(0)` -> `useState(7)` survived the whole file. 11.153's absence
   * assertion is masked, because the `!signedIn` arm clears the count to 0
   * before anything is drawn; 11.152 reaches for `findByRole`, which waits past
   * the pre-answer window and sees only the settled value. So the one window the
   * promise is ABOUT — signed in, request in flight, nothing answered yet — was
   * the one window no case stood in.
   *
   * The deferred read holds it open, and the pattern is borrowed from
   * `inbox-page.test.tsx` 11.144, which pins the same shape of window one file
   * over. The count is settled to 7 on purpose: it is the mutant's own value, so
   * this case cannot pass by accidentally agreeing with it afterwards.
   *
   * The link is asserted PRESENT in the same breath as the badge is asserted
   * absent — otherwise "no `img`" would be satisfied just as well by a component
   * that rendered nothing at all.
   */
  it('11.174 draws no badge before the first answer — an absence claims nothing, a 0 would not', async () => {
    const first = deferred<number>();
    render(
      <Providers
        services={stubServices({}, { notifications: { unreadCount: async () => first.promise } })}
      >
        <InboxNavLink />
      </Providers>,
    );

    // The door is up...
    expect(await screen.findByRole('link', { name: 'Inbox' })).toBeInTheDocument();
    // ...and it carries no number, because no number has been read yet. Round
    // 24: that shows as a bare name and no dot, rather than an absent badge.
    expect(document.querySelector('.gn-nav__inbox-dot')).toBeNull();

    first.settle(7);
    expect(
      await screen.findByRole('link', { name: 'Inbox, 7 unread notifications' }),
    ).toBeInTheDocument();
    expect(document.querySelector('.gn-nav__inbox-dot')).not.toBeNull();
  });
});
