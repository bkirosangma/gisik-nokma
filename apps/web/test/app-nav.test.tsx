import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * THE NAV'S MOUNTS, WITNESSED — because one deleted line orphaned a whole feature.
 *
 * Task 14's review deleted BOTH the import and the `<InboxNavLink />` element
 * from `src/app-nav.tsx` and measured 125/125 green with typecheck clean. The
 * component was rendered DIRECTLY only by its own test file; the two files that
 * render it transitively through `AppNav` assert nothing about it, and
 * `InboxNavLink`'s bare `catch {}` swallows the un-stubbed gateway's rejection,
 * so the link's absence was invisible. `href="/inbox"` appears exactly ONCE in
 * the whole product (`src/inbox-nav-link.tsx`), and Playwright is not in the
 * gate — so that one line is every route to the inbox, and nothing watched it.
 *
 * This is Task 7's finding in its reachable-page-with-no-door form: there, a
 * route registration deleted from `buildApp` left 937 tests green while every
 * handler stayed covered. The lesson both share is that a suite covering
 * everything the wiring connects can be blind to the wiring.
 *
 * So this file exists to watch the MOUNT rather than the component, and it lives
 * beside `app-nav.tsx` rather than inside `inbox-nav-link.test.tsx`: a witness
 * kept in the mounted component's own test file disappears the day that file
 * does, which is the same single-point-of-failure shape it was written against.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u_kiro', name: 'Kiro' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { AppNav } from '../src/app-nav.js';

describe('AppNav — the mounts, not the components', () => {
  /**
   * 11.170 — the door to `/inbox`, asserted where it is HUNG.
   *
   * `unreadCount` is stubbed rather than left to reject, deliberately: this case
   * must not lean on the very `catch {}` that hid the defect. A link that only
   * appears when a network read happens to succeed would be a second bug, and
   * with the stub in place a red here can only mean the element is gone.
   *
   * The href is asserted as well as the name, because a rename of that one
   * string is the same orphaning by another route: the nav would still say
   * "Inbox" and point at nothing.
   */
  it('11.170 hangs the Inbox link — the only door to /inbox anywhere in the product', () => {
    render(
      <Providers services={stubServices({}, { notifications: { unreadCount: async () => 0 } })}>
        <AppNav />
      </Providers>,
    );

    const inbox = screen.getByRole('link', { name: /Inbox/ });
    expect(inbox).toHaveAttribute('href', '/inbox');
  });

  /**
   * 11.171 — the two links Task 14 did NOT add, guarded by the same case.
   *
   * `AppNav` carries three destinations and the review's mutation proved the
   * suite noticed none of them going missing. Asserting all three by their
   * rendered names and hrefs — and asserting `My Work` is withheld when there is
   * no workspace in scope, which is the one conditional in this file — makes the
   * whole nav a measured surface rather than only the line this round added.
   */
  it('11.171 carries Workspaces always and My Work only inside a workspace', () => {
    const services = stubServices({}, { notifications: { unreadCount: async () => 0 } });
    const { rerender } = render(
      <Providers services={services}>
        <AppNav />
      </Providers>,
    );
    expect(screen.getByRole('link', { name: 'Workspaces' })).toHaveAttribute('href', '/workspaces');
    // Absent, not empty: no workspace is in scope, so there is nowhere for it to go.
    expect(screen.queryByRole('link', { name: 'My Work' })).not.toBeInTheDocument();

    rerender(
      <Providers services={services}>
        <AppNav workspaceId="ws_1" />
      </Providers>,
    );
    expect(screen.getByRole('link', { name: 'My Work' })).toHaveAttribute(
      'href',
      '/w/ws_1/my-work',
    );
    // And the inbox is unconditional on the workspace, which is the decision
    // `app-nav.tsx`'s own comment records.
    expect(screen.getByRole('link', { name: /Inbox/ })).toHaveAttribute('href', '/inbox');
  });
});
