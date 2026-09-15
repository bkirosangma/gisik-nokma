import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
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

// A MUTABLE pathname, not a static one (Round 19b) — `AppNav` reads
// `usePathname()` to decide which item is current and, for Settings, whether
// the route is anywhere under this workspace's settings. Different cases in
// this file need different routes, so each sets `currentPath` before
// rendering rather than every case sharing one static mock.
let currentPath = '/workspaces';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => currentPath,
  useSearchParams: () => new URLSearchParams(),
}));

// MUTABLE too, same reason as `currentPath`: the signed-out mount case below
// needs `useCurrentUser`/`useSessionStatus` to answer "nobody", and every
// other case in this file needs the seeded Kiro session it always answered
// before this became a variable.
let mockSessionUser: { id: string; name: string } | null = { id: 'u_kiro', name: 'Kiro' };
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: mockSessionUser === null ? null : { user: mockSessionUser } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { AppNav } from '../src/app-nav.js';
import HelpPage from '../app/help/page.js';
import AccountPage from '../app/account/page.js';

/**
 * `AppNav` reads `getMyWorkspaces` for its own workspace-name item whenever a
 * `workspaceId` is passed — the ONE shared read `app-nav.tsx`'s own docblock
 * argues for over threading a `workspaceName` prop through twelve pages. A
 * case that wants the name to APPEAR stubs it; a case testing the
 * always-items-only shape (no `workspaceId`) never triggers the read at all
 * and needs no stub.
 */
function workspacesOf(refs: WorkspaceRef[]) {
  return stubServices(
    { getMyWorkspaces: async () => refs },
    { notifications: { unreadCount: async () => 0 } },
  );
}

function workspace(over: Partial<WorkspaceRef> & { id: string }): WorkspaceRef {
  return {
    name: 'Convenience Corner',
    role: 'owner',
    memberCount: 3,
    nameRestrictedProjectCount: 0,
    projects: [],
    ...over,
  };
}

const NO_NAV_SERVICES = stubServices({}, { notifications: { unreadCount: async () => 0 } });

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
    currentPath = '/inbox';
    render(
      <Providers services={NO_NAV_SERVICES}>
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
  it('11.171 carries Workspaces always and My Work only inside a workspace', async () => {
    currentPath = '/workspaces';
    const { rerender } = render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
    expect(screen.getByRole('link', { name: 'Workspaces' })).toHaveAttribute('href', '/workspaces');
    // Absent, not empty: no workspace is in scope, so there is nowhere for it to go.
    expect(screen.queryByRole('link', { name: 'My Work' })).not.toBeInTheDocument();

    currentPath = '/w/ws_1/my-work';
    rerender(
      <Providers services={workspacesOf([workspace({ id: 'ws_1' })])}>
        <AppNav workspaceId="ws_1" />
      </Providers>,
    );
    expect(await screen.findByRole('link', { name: 'My Work' })).toHaveAttribute(
      'href',
      '/w/ws_1/my-work',
    );
    // And the inbox is unconditional on the workspace, which is the decision
    // `app-nav.tsx`'s own comment records.
    expect(screen.getByRole('link', { name: /Inbox/ })).toHaveAttribute('href', '/inbox');
  });

  /**
   * 11.185 — the nav's link set is CLOSED, at each of the THREE shapes it can
   * now take (Round 19b split this one shape into three).
   *
   * 11.171 asserts that certain links are present; presence assertions cannot
   * notice an EXTRA one, and that distinction is load-bearing here exactly as
   * it was when this case was first written — a legitimate nav entry landing
   * with no case updated to expect it is precisely the gap this tripwire
   * exists to close. Every arm below asserts the exact ordered set. Adding a
   * link reddens the arm it landed in by name, and the fix is a line here plus
   * this file's own case-id line in `test-cases/11-calendar-notifications.md`.
   */
  describe('11.185 the link set is closed at each of the three nav shapes', () => {
    it('WITHOUT a workspace: only the four ALWAYS items, no My Work/Board/Settings', () => {
      currentPath = '/workspaces';
      render(
        <Providers services={NO_NAV_SERVICES}>
          <AppNav />
        </Providers>,
      );
      const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
      // Round 21: `/settings` LEFT this arm — the owner moved Settings back
      // behind a workspace — and Inbox moved to just before Help. Both are
      // ordered assertions, so the move is witnessed here as well as by 13.414.
      expect(hrefs).toEqual(['/workspaces', '/inbox', '/help', '/account']);
    });

    it('WITH a workspace, no project: the served name, My Work and Members join, Board does not', async () => {
      currentPath = '/w/ws_1/my-work';
      render(
        <Providers services={workspacesOf([workspace({ id: 'ws_1', name: 'Convenience Corner' })])}>
          <AppNav workspaceId="ws_1" />
        </Providers>,
      );
      await screen.findByRole('link', { name: 'Convenience Corner' });
      const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
      expect(hrefs).toEqual([
        '/workspaces',
        '/w/ws_1',
        '/w/ws_1/my-work',
        '/w/ws_1/members',
        '/settings?workspaceId=ws_1',
        '/inbox',
        '/help',
        '/account',
      ]);
    });

    /**
     * The Board mutation witness (case 13.391's own words): mutating the
     * filter that reads `projectId !== undefined` to drop that condition —
     * so Board renders for any workspace, project or not — reddens THIS arm
     * alone, because it is the only one of the three whose expected set has
     * no Board entry at all while a workspace and no project are both true.
     */
    it('WITH a workspace AND a project: Board joins too, pointed at that project', async () => {
      currentPath = '/w/ws_1/p/p_1';
      render(
        <Providers services={workspacesOf([workspace({ id: 'ws_1', name: 'Convenience Corner' })])}>
          <AppNav workspaceId="ws_1" projectId="p_1" />
        </Providers>,
      );
      await screen.findByRole('link', { name: 'Convenience Corner' });
      const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
      expect(hrefs).toEqual([
        '/workspaces',
        '/w/ws_1',
        '/w/ws_1/p/p_1',
        '/w/ws_1/my-work',
        '/w/ws_1/members',
        '/settings?workspaceId=ws_1',
        '/inbox',
        '/help',
        '/account',
      ]);
    });
  });
});

/**
 * 13.391 — the nav is CONTEXTUAL, transcribing the prototype's RULE (a link
 * renders only when its target exists) rather than only its picture.
 */
describe('13.391 the nav is contextual', () => {
  it('shows the scope note ONLY without a workspace, and never once one is served', async () => {
    currentPath = '/workspaces';
    const { rerender } = render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
    expect(
      screen.getByText('No workspace selected — pick one to reach its board, members and settings.'),
    ).toBeInTheDocument();

    currentPath = '/w/ws_1/my-work';
    rerender(
      <Providers services={workspacesOf([workspace({ id: 'ws_1' })])}>
        <AppNav workspaceId="ws_1" />
      </Providers>,
    );
    await screen.findByRole('link', { name: 'Convenience Corner' });
    expect(
      screen.queryByText(/No workspace selected/),
    ).not.toBeInTheDocument();
  });

  /**
   * The workspace-name item OMITS rather than lies while the read is pending
   * or fails — `useWorkspaceName`'s own docblock states the rule; this is its
   * witness. `getMyWorkspaces` unstubbed rejects BY NAME
   * (`stub-services.ts`), which is what a page that forgot to stub it
   * measures against every day this suite runs.
   */
  it('omits the workspace-name item, not the id, while the name has not arrived', () => {
    currentPath = '/w/ws_1/my-work';
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav workspaceId="ws_1" />
      </Providers>,
    );
    expect(screen.queryByRole('link', { name: 'ws_1' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '' })).not.toBeInTheDocument();
    // The other workspace-scoped items are NOT held hostage to the name read —
    // they need only the id, which is already in hand.
    expect(screen.getByRole('link', { name: 'My Work' })).toBeInTheDocument();
  });

  /**
   * Settings is WORKSPACE-SCOPED again (Round 21, owner: "move back the nav bar
   * settings to only be visible once a workspace is opened"), reversing Round
   * 19c's move to the always tier.
   *
   * **The visibility rule reverted; the TARGET did not**, and this case pins
   * both halves because the obvious way to "move it back" is to restore the
   * pre-19c href along with the condition — which would re-open a closed defect.
   * `/w/<id>/settings/ticket-types` is the sidebar-less list page whose own Edit
   * button opened the editor as a third route; `/settings?workspaceId=<id>` is
   * the shell built to replace it. So the assertion below is deliberately not
   * just "absent without a workspace": it names the href that must survive.
   *
   * `aria-current` still needs no "any sub-route" widening — the nav's Settings
   * is one literal route and `usePathname()` ignores the query string, so it
   * reads `page` on `/settings` whichever workspace is attached.
   */
  it('Settings renders only with a workspace, keeps its query-param target, and is current on /settings', async () => {
    currentPath = '/w/ws_1/my-work';
    const { rerender } = render(
      <Providers services={workspacesOf([workspace({ id: 'ws_1' })])}>
        <AppNav workspaceId="ws_1" />
      </Providers>,
    );
    const settings = await screen.findByRole('link', { name: 'Settings' });
    expect(settings).toHaveAttribute('href', '/settings?workspaceId=ws_1');
    expect(settings).not.toHaveAttribute('aria-current');
    // The href the revert must NOT restore — see the docblock.
    expect(settings).not.toHaveAttribute('href', '/w/ws_1/settings/ticket-types');

    currentPath = '/settings';
    rerender(
      <Providers services={workspacesOf([workspace({ id: 'ws_1' })])}>
        <AppNav workspaceId="ws_1" />
      </Providers>,
    );
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');

    // And the rule itself: no workspace in the route, no Settings link at all.
    currentPath = '/workspaces';
    rerender(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
  });

  /**
   * 13.414 — Inbox sits JUST BEFORE Help (Round 21, owner ruling), where
   * nothing else in the suite pins nav ORDER.
   *
   * Asserted as the order of the whole rendered link list rather than as
   * "Inbox exists" plus "Help exists", because both of those already passed
   * before the move and would keep passing after any future one. The comparison
   * is over `compareDocumentPosition`, so it reads the DOM's own order and not
   * the order the query happened to return.
   *
   * The signed-out shape is used deliberately: `NO_NAV_SERVICES` with no
   * workspace renders the four always items, which is the arrangement the
   * owner's instruction is about — Inbox leaving the workspace-scoped view
   * links for the tail of the bar.
   */
  it('13.414 renders Inbox immediately before Help', () => {
    currentPath = '/workspaces';
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
    const inbox = screen.getByRole('link', { name: /Inbox/ });
    const help = screen.getByRole('link', { name: 'Help' });
    // `DOCUMENT_POSITION_FOLLOWING` (4) — Help comes after Inbox in the DOM.
    expect(inbox.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // IMMEDIATELY before: nothing renders between them. Compared over the nav's
    // own link list so a future insertion here fails rather than passing on the
    // looser "somewhere after" check above.
    const names = screen.getAllByRole('link').map((node) => node.textContent ?? '');
    const inboxAt = names.findIndex((text) => /Inbox/.test(text));
    expect(names[inboxAt + 1]).toBe('Help');
  });
});

/**
 * 13.392 — every nav target is a LITERAL real route: checked against the app
 * directory itself, not only against what the component happens to render,
 * so a test that built its expectations from the same builder as a bug would
 * agree with it cannot pass here.
 */
describe('13.392 every nav target resolves to a real page.tsx', () => {
  const ROUTES: Array<[string, string]> = [
    ['/workspaces', 'app/workspaces/page.tsx'],
    ['/w/ws_1', 'app/w/[workspaceId]/page.tsx'],
    ['/w/ws_1/p/p_1', 'app/w/[workspaceId]/p/[projectId]/page.tsx'],
    ['/w/ws_1/my-work', 'app/w/[workspaceId]/my-work/page.tsx'],
    ['/inbox', 'app/inbox/page.tsx'],
    ['/w/ws_1/members', 'app/w/[workspaceId]/members/page.tsx'],
    ['/settings?workspaceId=ws_1', 'app/settings/page.tsx'],
    ['/help', 'app/help/page.tsx'],
    ['/account', 'app/account/page.tsx'],
  ];

  it('every href a full nav renders has a page.tsx at the matching file path', async () => {
    currentPath = '/w/ws_1/p/p_1';
    render(
      <Providers services={workspacesOf([workspace({ id: 'ws_1', name: 'Convenience Corner' })])}>
        <AppNav workspaceId="ws_1" projectId="p_1" />
      </Providers>,
    );
    await screen.findByRole('link', { name: 'Convenience Corner' });
    const hrefs = new Set(screen.getAllByRole('link').map((a) => a.getAttribute('href')));

    // `test/setup.ts` runs vitest rooted at `apps/web` (`vitest.config.ts`'s
    // `include: ['test/**/*.test.{ts,tsx}']`), so `process.cwd()` there IS
    // `apps/web` — the same root every route below is relative to.
    const webRoot = process.cwd();
    for (const [href, file] of ROUTES) {
      expect(hrefs.has(href), `nav does not render ${href} in this fixture`).toBe(true);
      expect(existsSync(join(webRoot, file)), `${file} does not exist for ${href}`).toBe(true);
    }
    // Every href the nav actually rendered is accounted for above — a route
    // this table forgot would leave the set non-empty after subtracting it.
    for (const href of hrefs) {
      expect(
        ROUTES.some(([r]) => r === href),
        `${href} rendered by the nav but not in this case's route table`,
      ).toBe(true);
    }
  });
});

/**
 * 13.393 — the current item carries `aria-current`, and it is the ONLY one
 * that does; the sign-out control's accessible name does not fall even though
 * its VISIBLE label shrank.
 */
describe('13.393 exactly one nav item is current, and sign-out keeps its full name', () => {
  it('marks the current item aria-current="page" and no sibling carries it', async () => {
    currentPath = '/w/ws_1/my-work';
    render(
      <Providers services={workspacesOf([workspace({ id: 'ws_1', name: 'Convenience Corner' })])}>
        <AppNav workspaceId="ws_1" />
      </Providers>,
    );
    await screen.findByRole('link', { name: 'Convenience Corner' });
    const myWork = screen.getByRole('link', { name: 'My Work' });
    expect(myWork).toHaveAttribute('aria-current', 'page');
    const others = screen.getAllByRole('link').filter((a) => a !== myWork);
    for (const other of others) {
      expect(other, other.textContent ?? '').not.toHaveAttribute('aria-current', 'page');
    }
  });

  /**
   * The visible label shrinks to "Sign out" (the reference's monogram +
   * short label); the accessible name keeps "Sign out {name}", the sentence
   * this button always carried, via `aria-label`. A regression here is
   * exactly what the accessible-name floor this shell ratchets exists to
   * catch, and this is that floor's unit-level witness.
   */
  it('renders the monogram and "Sign out" visibly, and "Sign out Kiro" as the accessible name', () => {
    currentPath = '/workspaces';
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
    const button = screen.getByRole('button', { name: 'Sign out Kiro' });
    expect(button).toHaveTextContent('Sign out');
    // The name did NOT stay in the visible text — only in the accessible one.
    expect(button.textContent).not.toMatch(/Kiro/);
    expect(screen.getByLabelText('Kiro', { selector: '.gn-avatar' })).toBeInTheDocument();
  });
});

/**
 * THE SAME MOUNT GAP THIS FILE'S OWN HEADER WARNS ABOUT, FOUND AGAIN.
 *
 * `/help` and `/account` never rendered `<AppNav />` at all — not a deleted
 * line this time, one never added. Both pages had their own tests (none, in
 * fact — see below) and nothing that renders `AppNav` transitively asserts
 * anything about the two files that don't render it, so the absence was
 * invisible the same way the deleted `InboxNavLink` import was. Case IDs are
 * NOT allocated here: `test-cases/13-deployment-dogfooding.md`'s own header
 * requires block allocation from the controller ("next free BLOCK... ON
 * REQUEST ONLY"), which this session has no channel to; a block should be
 * requested and these renamed to real ids before merge.
 */
describe('pending-13.4xx AppNav is mounted on every page that must always show it', () => {
  it('/help mounts AppNav — signed in, and needs no workspace to show it', async () => {
    currentPath = '/help';
    mockSessionUser = { id: 'u_kiro', name: 'Kiro' };
    render(
      <Providers services={NO_NAV_SERVICES}>
        <HelpPage />
      </Providers>,
    );
    expect(await screen.findByRole('link', { name: 'Help' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Workspaces' })).toBeInTheDocument();
  });

  /**
   * `/help`'s own docblock says it needs "no session" — so `AppNav` had
   * better not quietly decide otherwise. Features.md's accessible-name-ratchet
   * bullet says "`AppNav` never renders signed-out", which reads as a claim
   * about the component itself rather than about which routes happened to
   * mount it; before this fix that was also the only routes-mounted-it fact
   * available to tell the two apart. This is the direct check: a signed-out
   * session, asserted against the component, not inferred from routes.
   */
  it('AppNav renders its always-items with NO session at all, not only without a workspace', () => {
    currentPath = '/help';
    mockSessionUser = null;
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
    expect(screen.getByRole('link', { name: 'Workspaces' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Account' })).toBeInTheDocument();
    // The one item that SHOULD disappear signed out — proving this case would
    // notice the opposite defect (everything rendering regardless of session).
    expect(screen.queryByRole('button', { name: /Sign out/ })).not.toBeInTheDocument();
    mockSessionUser = { id: 'u_kiro', name: 'Kiro' };
  });

  /**
   * `/account` mounts `AppNav` — the same mount-gap witness this file's
   * header describes, applied to this route. **As of the account/help
   * screens plan's Task 2, `/account` is a CLIENT component itself**
   * (`'use client'`), not a server component wrapping a client child as it
   * was before that task — the shape that used to make this case worth
   * calling out on its own is gone, but the witness still earns its keep:
   * nothing else in this file renders `AccountPage` directly, so this stays
   * the only guard here against `AppNav` going missing from this route.
   * `account-page.test.tsx` (added by the same task) covers `AccountPage`'s
   * own content, not this mount.
   */
  it('/account mounts AppNav', async () => {
    currentPath = '/account';
    mockSessionUser = { id: 'u_kiro', name: 'Kiro' };
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AccountPage />
      </Providers>,
    );
    expect(await screen.findByRole('link', { name: 'Account' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Workspaces' })).toBeInTheDocument();
  });
});
