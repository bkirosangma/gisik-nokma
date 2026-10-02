import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectRef, WorkspaceRef } from '@gisik-nokma/app-core';
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
// The push is a SHARED spy rather than a fresh `vi.fn()` per call (E2-45): the
// sign-out failure arm's whole claim is that nothing is pushed, and an
// assertion against a spy nobody holds cannot be made.
const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  useParams: () => ({}),
  usePathname: () => currentPath,
  useSearchParams: () => new URLSearchParams(),
}));

// MUTABLE too, same reason as `currentPath`: the signed-out mount case below
// needs `useCurrentUser`/`useSessionStatus` to answer "nobody", and every
// other case in this file needs the seeded Kiro session it always answered
// before this became a variable.
// `email` joined in Round 24: the account menu's header names the signed-in
// person, and `useCurrentUser` now carries the address for it.
let mockSessionUser: { id: string; name: string; email?: string } | null = {
  id: 'u_kiro',
  name: 'Kiro',
  email: 'kiro@example.com',
};
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: mockSessionUser === null ? null : { user: mockSessionUser } }),
    signOut: () => signOutImpl(),
  },
}));

/**
 * What the sign-out call answers, per case (E2-45).
 *
 * Mutable for the same reason `currentPath` and `mockSessionUser` above are:
 * the failure arm is the subject, and it cannot be reached through a mock that
 * only ever answers success. Two shapes are reachable and they are DIFFERENT —
 * `better-fetch` REJECTS on a dropped connection or an offline browser, and
 * RESOLVES `{ data: null, error }` on a non-2xx answer, so an arm that handles
 * only one of them is a real half-fix.
 */
let signOutImpl: () => Promise<{ data: object | null; error: { status: number; statusText: string } | null }> =
  async () => ({ data: {}, error: null });

import { AppNav } from '../src/app-nav.js';
import { clearLastWorkspaceCache } from '../src/use-last-workspace.js';
import { clearLastProjectCache } from '../src/use-last-project.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { clearWorkspaceProjectsCache } from '../src/use-workspace-projects.js';
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
    prefix: 'CC',
    role: 'owner',
    archived: false,
    memberCount: 3,
    nameRestrictedProjectCount: 0,
    projects: [],
    ...over,
  };
}

/**
 * A served `ProjectRef`, for the one arm below whose workspace has projects.
 *
 * Every OTHER arm's workspace has `projects: []` and therefore rendered no
 * project item at all before this round — which is why none of them needed
 * changing when it landed, and why the arm that has them carries the whole of
 * this round's coverage in this file.
 */
function project(over: Partial<ProjectRef> & { id: string }): ProjectRef {
  return { name: `Project ${over.id}`, prefix: 'PJ', archived: false, ticketCount: 0, blockedCount: 0, ...over };
}

const NO_NAV_SERVICES = stubServices({}, { notifications: { unreadCount: async () => 0 } });

/** Round 24: the inbox indicator's two states need a settable unread count. */
function navServicesWithUnread(count: number) {
  return stubServices({}, { notifications: { unreadCount: async () => count } });
}

/**
 * ROUND 25 — `localStorage` is SHARED ACROSS EVERY TEST IN THIS FILE, and the
 * nav now writes to it.
 *
 * jsdom keeps one storage for the whole module, so a case that renders
 * `<AppNav workspaceId="ws_1" />` leaves `gn-last-workspace` behind for every
 * case after it — and those cases would then render workspace-scoped links they
 * never set up, passing or failing on state their own body cannot see. That is
 * order-dependence, which shows up as a suite that goes red when one test is
 * renamed.
 *
 * Cleared before each case, so every one starts with no remembered workspace
 * and any case that wants one says so.
 */
beforeEach(() => {
  window.localStorage.clear();
  // ROUND 26: the jitter fix keeps its answers in MODULE scope, which one test
  // file shares for its whole run — the same order-dependence `localStorage`
  // has, one layer up. Both are cleared so every case starts cold.
  clearLastWorkspaceCache();
  clearWorkspaceNameCache();
  // The last-open-project item (2026-09-18): `AppNav` now mounts
  // `LastProjectNav`, so this
  // file shares the remembered-project hook's module cache and the served
  // project LIST's, exactly as it already shared the two above — and for the
  // same reason, one paragraph up in this file's own beforeEach comment.
  clearLastProjectCache();
  clearWorkspaceProjectsCache();
  mockSessionUser = { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' };
  // E2-45: the sign-out answer and the push spy are per-case state too — a case
  // that made sign-out fail must not leave the next one failing.
  signOutImpl = async () => ({ data: {}, error: null });
  routerPush.mockClear();
});

/** A workspace already remembered for the seeded user, as Round 25 stores it. */
function rememberWorkspace(workspaceId: string, userId = 'u_kiro'): void {
  window.localStorage.setItem('gn-last-workspace', JSON.stringify({ userId, workspaceId }));
}

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
   * rendered names and hrefs — and asserting `My work` is withheld when there is
   * no workspace in scope, which is the one conditional in this file — makes the
   * whole nav a measured surface rather than only the line this round added.
   */
  it('11.171 carries Workspaces always and My work only inside a workspace', async () => {
    currentPath = '/workspaces';
    const { rerender } = render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
    expect(screen.getByRole('link', { name: 'Workspaces' })).toHaveAttribute('href', '/workspaces');
    // Absent, not empty: no workspace is in scope, so there is nowhere for it to go.
    expect(screen.queryByRole('link', { name: 'My work' })).not.toBeInTheDocument();

    currentPath = '/w/ws_1/my-work';
    rerender(
      <Providers services={workspacesOf([workspace({ id: 'ws_1' })])}>
        <AppNav workspaceId="ws_1" />
      </Providers>,
    );
    expect(await screen.findByRole('link', { name: 'My work' })).toHaveAttribute(
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
    it('WITHOUT a workspace: only the four ALWAYS items, no My work/Board/Settings', () => {
      currentPath = '/workspaces';
      render(
        <Providers services={NO_NAV_SERVICES}>
          <AppNav />
        </Providers>,
      );
      const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
      // Round 21: `/settings` LEFT this arm — the owner moved Settings back
      // behind a workspace.
      //
      // ROUND 24: `/help` and `/account` left it too, into `AccountMenu`. They
      // are absent from this list even when the menu is OPEN, and that is not an
      // oversight: an `<a role="menuitem">` has the menuitem role, not `link`,
      // so `getAllByRole('link')` cannot see them by design. Their reachability
      // is asserted where it now lives — the account-menu block below.
      expect(hrefs).toEqual(['/workspaces', '/notes', '/inbox']);
    });

    it('WITH a workspace, no project: the served name, My work and Members join, Board does not', async () => {
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
        // `/help` and `/account` moved into `AccountMenu` (Round 24) and are
        // menuitems, not links — see the first arm's comment.
        // `/notes` joined in Plan 5 of the notes series, immediately LEFT of
        // `/inbox` in the nav's corner (spec §9.1) — this case reddened by name
        // when it landed, which is the tripwire working.
        '/notes',
        '/inbox',
      ]);
    });

    /**
     * **This arm survives the removal of Board (Round 23) and its job changed**
     * — it used to prove a project in the route ADDS the Board item; it now
     * proves a project in the route adds NOTHING.
     *
     * Keeping it is not ceremony. The nav still reads `usePathname()`, so a
     * board route is a distinct input to this component, and "no project-scoped
     * item sneaks back in" is exactly the regression the Board removal makes
     * possible. The expected array is deliberately identical to the arm above:
     * the two shapes have collapsed into one, and a future change that
     * re-introduces a project-conditional link reddens this arm while leaving
     * that one green, which is what names the fault.
     *
     * `projectId` is no longer passed because the prop no longer exists — Board
     * was its only consumer. The project is expressed by `currentPath` alone,
     * which is all the component ever reads it from now.
     */
    it('WITH a workspace that HAS projects: the project item joins, right of the workspace name', async () => {
      currentPath = '/inbox';
      render(
        <Providers
          services={workspacesOf([
            workspace({
              id: 'ws_1',
              name: 'Convenience Corner',
              projects: [
                project({ id: 'p_beta', name: 'Beta' }),
                project({ id: 'p_gamma', name: 'Gamma' }),
              ],
            }),
          ])}
        >
          <AppNav workspaceId="ws_1" />
        </Providers>,
      );
      await screen.findByRole('link', { name: 'Convenience Corner' });
      const hrefs = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
      // THE POSITION IS THE ASSERTION as much as the membership is: the owner
      // asked for the item "right to the workspace name", and an ordered array
      // is the only form of this case that can tell that from anywhere else in
      // the bar. `/w/ws_1` is the workspace-name link; `/w/ws_1/p/p_beta` is
      // the remembered-or-first project, and nothing sits between them.
      expect(hrefs).toEqual([
        '/workspaces',
        '/w/ws_1',
        '/w/ws_1/p/p_beta',
        '/w/ws_1/my-work',
        '/w/ws_1/members',
        '/settings?workspaceId=ws_1',
        // `/notes` joined in Plan 5 of the notes series, immediately LEFT of
        // `/inbox` (spec §9.1).
        '/notes',
        '/inbox',
      ]);
    });

    it('WITH a workspace AND a project in the route: the set is UNCHANGED, no Board', async () => {
      currentPath = '/w/ws_1/p/p_1';
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
        // `/help` and `/account` moved into `AccountMenu` (Round 24) and are
        // menuitems, not links — see the first arm's comment.
        // `/notes` joined in Plan 5 of the notes series, immediately LEFT of
        // `/inbox` in the nav's corner (spec §9.1) — this case reddened by name
        // when it landed, which is the tripwire working.
        '/notes',
        '/inbox',
      ]);
      // Named, so the failure says what came back rather than only that an
      // array grew: nothing points at the board this route is showing.
      expect(hrefs).not.toContain('/w/ws_1/p/p_1');
      expect(screen.queryByRole('link', { name: 'Board' })).toBeNull();
    });
  });
});

/**
 * 18.182 — the Notes link, and the FIRST prefix match in this bar.
 *
 * **Every other item in this nav is measured by EXACT equality** (`current()` at
 * `app-nav.tsx:230`), and that is correct for them: `/w/<id>` is not "inside"
 * `/w/<id>/members`. A note is different in kind — `/notes/<id>` draws the SAME
 * view, with a note open, that `/notes` draws with the tree alone — so the link
 * must light on both or it is dark on the page the reader is actually on. It is
 * stated here as an assertion rather than left to the code because the first
 * prefix match in a bar of exact matches is exactly the line a later tidy-up
 * "simplifies" back.
 *
 * The placement (`compareDocumentPosition`, then `nextElementSibling`) is the
 * owner's: immediately LEFT of the inbox icon.
 */
describe('18.182 the Notes link sits before Inbox and lights for a note', () => {
  function renderNav() {
    return render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
  }

  it('marks Notes current on /notes AND on /notes/<id>, but not on /inbox', () => {
    currentPath = '/notes';
    renderNav();
    const onNotes = screen.getByRole('link', { name: 'Notes' });
    expect(onNotes).toHaveAttribute('href', '/notes');
    expect(onNotes).toHaveAttribute('aria-current', 'page');

    // The note's own URL. MUTATION TARGET: `pathname === '/notes'` alone — the
    // exact-equality form every sibling item uses — leaves this arm without a
    // current item, and this is the only case in this file that walks it.
    cleanup();
    currentPath = '/notes/01J9NOTE00000000000000000';
    renderNav();
    expect(screen.getByRole('link', { name: 'Notes' })).toHaveAttribute('aria-current', 'page');

    cleanup();
    currentPath = '/inbox';
    renderNav();
    const onInbox = screen.getByRole('link', { name: 'Notes' });
    expect(onInbox).toHaveAttribute('href', '/notes');
    // CONTROL: the prefix is `/notes`, not `''`. Without this arm a link that
    // lit on every route would pass everything above.
    expect(onInbox).not.toHaveAttribute('aria-current', 'page');

    // IMMEDIATELY LEFT of the inbox. `DOCUMENT_POSITION_FOLLOWING` (4) is the
    // DOM's own order; `nextElementSibling` is the "immediately" half.
    const inbox = screen.getByRole('link', { name: /Inbox/ });
    expect(
      onInbox.compareDocumentPosition(inbox) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(onInbox.nextElementSibling).toBe(inbox);
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
    // ROUND 25: `findByText`, not `getByText`. The note now requires a POSITIVE
    // "storage read, nothing remembered", which lands in an effect — so it is
    // absent on the first synchronous paint by design. Gating it on the
    // synchronous state would flash "No workspace selected" at every viewer who
    // HAS a remembered workspace, on every global page they open.
    expect(
      await screen.findByText(
        'No workspace selected. Pick one to reach its board, members and settings.',
      ),
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
    expect(screen.getByRole('link', { name: 'My work' })).toBeInTheDocument();
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

    // And the rule itself — RESTATED FOR ROUND 25. It used to read "no
    // workspace in the ROUTE, no Settings link at all", which is exactly what
    // the owner's remembered-workspace instruction revokes: leaving a workspace
    // page for `/inbox` must no longer strip the scoped links. The rule is now
    // "no workspace REACHABLE — none in the route and none remembered — no
    // Settings link", which is the same principle over the wider input.
    //
    // A fresh mount, not a rerender: the point is a viewer with nothing
    // remembered, and the component above has already resolved a name into
    // state that a rerender would carry forward.
    cleanup();
    window.localStorage.clear();
    currentPath = '/workspaces';
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
  });

  /**
   * 13.424 — the same bar, with a workspace REMEMBERED rather than routed.
   *
   * This is the owner's actual instruction (Round 25) and the direct
   * counterpart to the assertion above: the scoped links survive the move to a
   * global page. Without this case, that assertion's "no Settings" could be
   * satisfied by a nav that had simply stopped remembering anything.
   */
  it('13.424 keeps the workspace-scoped links on a global page when one is remembered', async () => {
    rememberWorkspace('ws_1');
    currentPath = '/inbox';
    render(
      <Providers services={workspacesOf([workspace({ id: 'ws_1', name: 'Convenience Corner' })])}>
        <AppNav />
      </Providers>,
    );

    // The name resolving is what licenses the rest — see `showWorkspaceItems`.
    expect(await screen.findByRole('link', { name: 'Convenience Corner' })).toHaveAttribute(
      'href',
      '/w/ws_1',
    );
    expect(screen.getByRole('link', { name: 'My work' })).toHaveAttribute(
      'href',
      '/w/ws_1/my-work',
    );
    expect(screen.getByRole('link', { name: 'Members' })).toHaveAttribute(
      'href',
      '/w/ws_1/members',
    );
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute(
      'href',
      '/settings?workspaceId=ws_1',
    );
    // Not current: you are on `/inbox`, not in the workspace.
    expect(screen.getByRole('link', { name: 'My work' })).not.toHaveAttribute('aria-current');
    // And the note must not claim otherwise.
    expect(screen.queryByText(/No workspace selected/)).not.toBeInTheDocument();
  });

  /**
   * 13.425 — a workspace remembered for SOMEONE ELSE is not honoured.
   *
   * `localStorage` outlives a session. Sign out, hand the laptop over, and an
   * unkeyed memory would render the previous person's workspace NAME in the
   * next person's chrome — the defect 11.169 exists for, one surface over.
   *
   * The assertion is on the NAME, not merely on the links: the name is the part
   * that leaks information about a workspace this viewer may not know exists.
   */
  it('13.425 ignores a workspace remembered for a different user', async () => {
    rememberWorkspace('ws_1', 'u_someone_else');
    currentPath = '/inbox';
    render(
      <Providers services={workspacesOf([workspace({ id: 'ws_1', name: 'Convenience Corner' })])}>
        <AppNav />
      </Providers>,
    );

    // The note is the positive signal that storage was read and held nothing
    // FOR THIS PERSON — without it this case would also pass while the read was
    // merely slow.
    expect(await screen.findByText(/No workspace selected/)).toBeInTheDocument();
    expect(screen.queryByText('Convenience Corner')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'My work' })).toBeNull();
  });

  /**
   * 13.426 — a remembered workspace that no longer resolves offers no links.
   *
   * You were removed from it, or it was deleted. `app-nav.tsx` has held since
   * Round 22/23 that the nav does not offer a link that cannot resolve — the
   * reason the Board item was deleted — and a remembered id is that same hazard
   * arriving from storage instead of from a route.
   *
   * `workspacesOf([])` is the fixture: the read SUCCEEDS and simply does not
   * contain ws_gone, which is what being removed looks like. A rejecting stub
   * would prove something weaker, since a refusal also yields a null name.
   */
  it('13.426 offers no scoped links for a remembered workspace it cannot resolve', async () => {
    rememberWorkspace('ws_gone');
    currentPath = '/inbox';
    render(
      <Providers services={workspacesOf([])}>
        <AppNav />
      </Providers>,
    );

    // The inbox link is the settled-render witness: it proves the bar painted,
    // so "no My work" below is a decision and not a snapshot taken too early.
    expect(await screen.findByRole('link', { name: 'Inbox' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'My work' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull();
  });

  /**
   * 13.428 — THE JITTER. Owner: "the nav bar item jitters on changing pages.
   * the workspace scoped items briefly disappears and reappears."
   *
   * **The mount is the bug, so the test has to mount twice.** `AppNav` is
   * rendered by each PAGE rather than by the root layout, so a client-side
   * navigation unmounts and remounts it; every previous case in this file
   * mounts once and therefore could not see this. The second mount below IS
   * the navigation, and the assertion is deliberately SYNCHRONOUS — the whole
   * complaint is about the first frame, and any `findBy*` here would wait
   * exactly long enough to hide the defect it is meant to catch.
   */
  it('13.428 paints the workspace links on the first frame after a navigation', async () => {
    // First page: a workspace route, which is what warms what the next page needs.
    currentPath = '/w/ws_1/my-work';
    render(
      <Providers services={workspacesOf([workspace({ id: 'ws_1', name: 'Convenience Corner' })])}>
        <AppNav workspaceId="ws_1" />
      </Providers>,
    );
    await screen.findByRole('link', { name: 'Convenience Corner' });

    // NAVIGATE: unmount, then mount the next page's own AppNav.
    cleanup();
    currentPath = '/inbox';
    render(
      <Providers services={workspacesOf([workspace({ id: 'ws_1', name: 'Convenience Corner' })])}>
        <AppNav />
      </Providers>,
    );

    // No `await`. These must be present in the first committed render.
    expect(screen.getByRole('link', { name: 'Convenience Corner' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'My work' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Members' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    // And the note never flashes in their place.
    expect(screen.queryByText(/No workspace selected/)).not.toBeInTheDocument();
  });

  /**
   * 13.429 — the jitter fix must not resurrect a workspace you have lost.
   *
   * The cache that removes the flicker is read by `useState` on every remount,
   * so an entry left behind after the product learns the workspace is gone
   * would put the name back on screen one navigation later — the fix
   * re-introducing the defect 13.426 forbids, displaced in time.
   */
  it('13.429 does not re-show a workspace that has since become unreachable', async () => {
    currentPath = '/w/ws_1/my-work';
    render(
      <Providers services={workspacesOf([workspace({ id: 'ws_1', name: 'Convenience Corner' })])}>
        <AppNav workspaceId="ws_1" />
      </Providers>,
    );
    await screen.findByRole('link', { name: 'Convenience Corner' });

    // Removed from it: the read now SUCCEEDS and no longer contains ws_1.
    cleanup();
    currentPath = '/inbox';
    render(
      <Providers services={workspacesOf([])}>
        <AppNav />
      </Providers>,
    );
    await waitFor(() =>
      expect(screen.queryByRole('link', { name: 'Convenience Corner' })).toBeNull(),
    );

    // One more navigation — a fresh mount, not a rerender, because that is what
    // a page change is. The stale cache entry, if kept, reappears right here.
    cleanup();
    render(
      <Providers services={workspacesOf([])}>
        <AppNav />
      </Providers>,
    );
    expect(screen.queryByRole('link', { name: 'Convenience Corner' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'My work' })).toBeNull();
  });

  /**
   * 13.427 — opening a workspace is what remembers it.
   *
   * The write is asserted through the STORAGE KEY rather than through a later
   * render, because a later render would also pass if the value were held only
   * in React state — which would not survive the page navigation this whole
   * feature exists for.
   */
  it('13.427 records the workspace in local storage when one is opened', async () => {
    currentPath = '/w/ws_1/my-work';
    render(
      <Providers services={workspacesOf([workspace({ id: 'ws_1', name: 'Convenience Corner' })])}>
        <AppNav workspaceId="ws_1" />
      </Providers>,
    );
    await screen.findByRole('link', { name: 'Convenience Corner' });

    expect(JSON.parse(window.localStorage.getItem('gn-last-workspace') ?? 'null')).toEqual({
      userId: 'u_kiro',
      workspaceId: 'ws_1',
    });
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
  /**
   * **13.414 IS SUPERSEDED BY ROUND 24 AND ITS SUBJECT IS GONE.** Help is no
   * longer a link in this bar — it is an item in `AccountMenu` — so "Inbox
   * immediately before Help" is not a false assertion, it is an unaskable one.
   *
   * It is replaced rather than deleted, and by a case that pins what the
   * owner's Round 24 instruction actually said: the inbox sits immediately
   * LEFT OF THE AVATAR. That is the same KIND of claim (adjacency in the bar's
   * tail), re-aimed at the arrangement that now exists, so the ordering
   * tripwire Round 21 bought is not lost in the move.
   */
  it('13.416 renders the inbox icon immediately left of the account menu trigger', () => {
    currentPath = '/workspaces';
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
    const inbox = screen.getByRole('link', { name: 'Inbox' });
    const trigger = screen.getByRole('button', { name: 'Account menu for Kiro' });
    // `DOCUMENT_POSITION_FOLLOWING` (4) — the trigger comes after the inbox.
    expect(inbox.compareDocumentPosition(trigger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // IMMEDIATELY: they are siblings in the corner with nothing between them.
    expect(inbox.nextElementSibling).toBe(trigger.parentElement);
  });
});

/**
 * Round 24 — the account menu. The owner's instruction: "make it into a round
 * profile pic like thing, that opens up a context menu on click. signout option
 * will be moved to the bottom of that menu. along with the help and account
 * item from the nav bar."
 */
describe('Round 24 the account menu', () => {
  /**
   * 13.417 — the two destinations that left the bar are still reachable.
   *
   * This is the case that makes 11.185's shortened link list safe to assert.
   * That list got shorter by two entries, and a shorter expected array is
   * exactly what a test would also show if the links had been DELETED rather
   * than moved. Without this case the suite would agree with that bug.
   */
  it('13.417 holds Help and Account, reachable once the menu is open', async () => {
    currentPath = '/workspaces';
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
    // Closed to start: a menu that is open on load is not a menu.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'Account menu for Kiro' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(trigger);

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('menuitem', { name: 'Help' })).toHaveAttribute('href', '/help');
    expect(screen.getByRole('menuitem', { name: 'Account' })).toHaveAttribute('href', '/account');
  });

  /**
   * 13.418 — sign out is LAST, and keeps the accessible name it always had.
   *
   * Two claims in one case because they fail together: the owner asked for it
   * at the bottom, and the shell ratchets an accessible-name floor on the
   * string `Sign out {name}` — which `apps/web/e2e-stack/
   * passkey-registration.spec.ts` also addresses the control by. The control
   * moved into a menu; the name did not move with it unless asserted.
   */
  it('13.418 puts Sign out last in the menu, still named "Sign out Kiro"', async () => {
    currentPath = '/workspaces';
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Account menu for Kiro' }));

    const items = screen.getAllByRole('menuitem');
    const signOut = screen.getByRole('menuitem', { name: 'Sign out Kiro' });
    expect(items[items.length - 1]).toBe(signOut);
    // Visible text is the short label; the person's name lives in the
    // accessible name only, exactly as the old nav button had it.
    expect(signOut).toHaveTextContent('Sign out');
    expect(signOut.textContent).not.toMatch(/Kiro/);
  });

  /**
   * 13.419 — the menu names WHO is signed in.
   *
   * The control this replaced was `Sign out {name}`: its accessible name
   * carried the signed-in identity on every page. A monogram avatar carries
   * none — two people with the same initial render identically — so without
   * this header the restyle would have quietly deleted that information.
   */
  it('13.419 heads the menu with the signed-in name and email', async () => {
    currentPath = '/workspaces';
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Account menu for Kiro' }));

    const menu = screen.getByRole('menu');
    expect(menu).toHaveTextContent('Kiro');
    expect(menu).toHaveTextContent('kiro@example.com');
  });

  /**
   * 13.1059 — exec1 P22 — **the menu carries a NAME, and it reaches the DOM.**
   *
   * `role="menu"` requires an accessible name, and this one had none: a screen
   * reader announced "menu" with nothing about whose. A third menu in the same
   * product — `last-project-nav.tsx`'s `aria-label="Projects"` — already showed
   * the pattern this one was missing.
   *
   * The declaration is swept in `menu-accessible-name.test.tsx`; THIS is the arm
   * that reads the name off the rendered element, so a label declared but never
   * reaching the DOM reddens here. Queried by role AND name on purpose: the
   * fixture has no second menu, so `getByRole('menu')` alone would stay green
   * against an unnamed menu.
   */
  it('13.1053 the top bar is a named "Main" landmark, reached by role and name', async () => {
    currentPath = '/workspaces';
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );

    // POSITIVE CONTROL: the bar rendered a navigation landmark at all, so a
    // green below cannot mean "there was no landmark to name".
    expect(screen.getByRole('navigation')).toBeInTheDocument();

    // THE WITNESS — `Unable to find an accessible element with the role
    // "navigation" and name "Main"` before the fix. This bar co-renders with a
    // second, already-labelled `<nav>` on several routes, which is exactly why
    // the name is the only thing telling a reader which one they are in.
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });

  it('13.1059 the account menu is named "Account", reached by role and name', async () => {
    currentPath = '/workspaces';
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
    // POSITIVE CONTROL: the trigger opened a menu at all.
    await userEvent.click(screen.getByRole('button', { name: 'Account menu for Kiro' }));
    expect(screen.getByRole('menu')).toBeInTheDocument();

    // THE WITNESS — `Unable to find an accessible element with the role "menu"
    // and name "Account"` before the fix.
    expect(screen.getByRole('menu', { name: 'Account' })).toBeInTheDocument();
  });

  /**
   * 13.420 — Escape closes AND returns focus to the trigger.
   *
   * The focus half is the load-bearing one. Closing without it strands focus at
   * the document root, so a keyboard user who opens the menu and changes their
   * mind has to tab from the top of the page to get back to where they were.
   * A test that only asserted the menu had gone would pass on that bug.
   */
  it('13.420 closes on Escape and returns focus to the trigger', async () => {
    currentPath = '/workspaces';
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
    const trigger = screen.getByRole('button', { name: 'Account menu for Kiro' });
    await userEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeInTheDocument();
    // Focus is INSIDE the menu first — without this line the assertion below
    // is vacuous, because focus would never have left the trigger and
    // "returns focus to the trigger" would hold with the return deleted. That
    // is not hypothetical: the first implementation shipped exactly that, and
    // this case passed against it until focus-on-open was added.
    expect(trigger).not.toHaveFocus();

    await userEvent.keyboard('{Escape}');

    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  /**
   * 13.423 — opening moves focus into the menu, and the arrows walk it.
   *
   * The focus-on-open half is also 13.420's precondition, asserted here in its
   * own right so a change that removed it fails by name rather than by quietly
   * making that case vacuous again.
   */
  it('13.423 focuses the first item on open and walks the items with the arrows', async () => {
    currentPath = '/workspaces';
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Account menu for Kiro' }));

    expect(screen.getByRole('menuitem', { name: 'Help' })).toHaveFocus();

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Account' })).toHaveFocus();

    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Help' })).toHaveFocus();

    // Wraps backwards off the first item to the last, which is Sign out.
    await userEvent.keyboard('{ArrowUp}');
    expect(screen.getByRole('menuitem', { name: 'Sign out Kiro' })).toHaveFocus();
  });

  /**
   * RULING E5-37 — `name: user.name ?? user.id` never caught an EMPTY
   * string (`??` only catches `null`/`undefined`), and better-auth's
   * magic-link population creates every email sign-up with `name: ''`. The
   * shell then had no idea who was signed in: an empty accessible name on
   * this trigger, an empty menu header, a "?" monogram. Every one of those
   * surfaces reads `useCurrentUser`'s `name`, so fixing that one hook fixes
   * all of them — this case is the trigger and the menu header together,
   * the two the finding's own transcript quoted verbatim ("Account menu
   * for ", an empty header line).
   */
  it('E5-37 an email sign-up (name === "") falls back to the email, not a blank name', async () => {
    currentPath = '/workspaces';
    mockSessionUser = { id: 'u_no_name', name: '', email: 'anjali@example.com' };
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
    const trigger = await screen.findByRole('button', { name: 'Account menu for anjali@example.com' });
    await userEvent.click(trigger);
    expect(screen.getByRole('menu')).toHaveTextContent('anjali@example.com');
  });

  it('E5-37 a person with neither name nor email is not announced with a blank suffix', async () => {
    // A shape the type admits ({ id, name, email? }) even if the product's
    // own better-auth config would not produce it today. This case first
    // expected `Account menu for u_bare` — the id as the floor of the chain.
    // Landed E4-33 (13.1054, the shell's one reading in `display-label.ts`)
    // rules the other way for THIS control: a person with no label gets
    // `Account menu` with the suffix OMITTED, because `Account menu for ` is
    // the defect and an opaque id read aloud is not a name. The id fallback
    // E5-37 wrote survives in `useSessionStatus`, whose consumers print a
    // name with no label helper. The property this case keeps is the one
    // both rulings share: never a blank suffix, never an empty name.
    currentPath = '/workspaces';
    mockSessionUser = { id: 'u_bare', name: '', email: '' };
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
    const trigger = await screen.findByRole('button', { name: 'Account menu' });
    expect(trigger).toBeInTheDocument();
    expect(trigger.getAttribute('aria-label')).not.toMatch(/for\s*$/);
  });

  /**
   * 17.141–17.143 — E2-45 (round-2 ruling, IMPORTANT) — a sign-out that FAILED
   * must not read as one that succeeded.
   *
   * The shipped control was `close(false)` first, then one `.then` with no
   * rejection arm: offline, a dropped connection, or a proxy's 5xx closed the
   * menu, pushed nothing, said nothing, and left the session live. The manual
   * (`docs/manual.md:112-114`) sells this exact control as the thing that
   * protects a person on somebody else's laptop — *"That matters if you have
   * signed in on somebody else's laptop"* — so a silent failure here is the one
   * outcome that sentence promises cannot happen.
   *
   * Three cases, because one is not enough to pin the shape: the rejection arm,
   * the resolved-`{error}` arm (a different path through the same transport —
   * `better-fetch` rejects only when `fetch` itself throws), and the success arm
   * that says the menu still closes and navigates. Without the third, "leave the
   * menu open and never navigate" would pass both failure cases.
   */
  it('17.141 E2-45 keeps the menu open and says the session is still signed in when the server refuses', async () => {
    currentPath = '/workspaces';
    signOutImpl = async () => ({ data: null, error: { status: 503, statusText: 'Service Unavailable' } });
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Account menu for Kiro' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out Kiro' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('still signed in');
    // The menu closing WAS the confirmation; it must not close on a refusal.
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('17.142 E2-45 treats a dropped connection as a failure, never as a sign-out', async () => {
    currentPath = '/workspaces';
    // The shape `await fetch()` produces when the request never reached a
    // server: the promise REJECTS, so only a second callback can see it.
    signOutImpl = async () => {
      throw new Error('Failed to fetch');
    };
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Account menu for Kiro' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out Kiro' }));

    const alert = await screen.findByRole('alert');
    // A different sentence from the refused arm: "the server refused" is a claim
    // about a server that was never reached.
    expect(alert).toHaveTextContent('could not reach the server');
    expect(alert).toHaveTextContent('still signed in');
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(routerPush).not.toHaveBeenCalled();
  });

  it('17.143 E2-45 a sign-out that succeeded closes the menu and goes to sign-in — the control', async () => {
    currentPath = '/workspaces';
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Account menu for Kiro' }));
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out Kiro' }));

    // The positive control for the two above: the menu DOES close and the push
    // DOES happen when the answer is success.
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/sign-in'));
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

/**
 * Round 24 — the inbox indicator. Owner: "make inbox an icon. with an indicator
 * (green dot?) if there is an unread event."
 */
describe('Round 24 the inbox indicator', () => {
  /**
   * 13.421 — the count did not vanish, it moved into the accessible name.
   *
   * The owner chose the dot for the VISIBLE signal and the count for the
   * accessible one. Asserting only "a dot appears" would pass on an
   * implementation that dropped the number entirely, which is the change this
   * case exists to forbid — and which would also leave unread state signalled
   * by colour alone (WCAG 1.4.1).
   */
  it('13.421 names the unread count, and shows a dot, only when there is one', async () => {
    currentPath = '/workspaces';
    const { rerender } = render(
      <Providers services={navServicesWithUnread(0)}>
        <AppNav />
      </Providers>,
    );
    // At zero: a bare name and NO dot. An absence, which claims nothing.
    expect(await screen.findByRole('link', { name: 'Inbox' })).toBeInTheDocument();
    expect(document.querySelector('.gn-nav__inbox-dot')).toBeNull();

    rerender(
      <Providers services={navServicesWithUnread(3)}>
        <AppNav />
      </Providers>,
    );

    expect(await screen.findByRole('link', { name: 'Inbox, 3 unread notifications' })).toBeInTheDocument();
    expect(document.querySelector('.gn-nav__inbox-dot')).not.toBeNull();
  });

  /** 13.422 — singular at one, because "1 unread notifications" is a defect people notice. */
  it('13.422 says "1 unread notification" in the singular', async () => {
    currentPath = '/workspaces';
    render(
      <Providers services={navServicesWithUnread(1)}>
        <AppNav />
      </Providers>,
    );
    expect(await screen.findByRole('link', { name: 'Inbox, 1 unread notification' })).toBeInTheDocument();
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
    // `/w/ws_1/p/p_1` left this table in Round 23 with the Board item. This
    // case checks the routes the nav RENDERS; the board route still exists and
    // is still reached from the workspace home's project cards, it is simply
    // not a nav target any more. The loop below subtracts rendered hrefs from
    // this table, so a stale row here would fail as "nav does not render it"
    // rather than sitting unnoticed.
    ['/w/ws_1/my-work', 'app/w/[workspaceId]/my-work/page.tsx'],
    ['/notes', 'app/notes/page.tsx'],
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
        <AppNav workspaceId="ws_1" />
      </Providers>,
    );
    await screen.findByRole('link', { name: 'Convenience Corner' });
    // ROUND 24: `/help` and `/account` are inside `AccountMenu` now, and an
    // `<a role="menuitem">` is NOT matched by `getAllByRole('link')`. The menu
    // is opened and both roles are gathered, rather than dropping those two
    // rows from the table — this case's whole job is that EVERY target the nav
    // offers resolves to a real page, and a target that moved one level down is
    // still a target the nav offers.
    await userEvent.click(screen.getByRole('button', { name: 'Account menu for Kiro' }));
    const hrefs = new Set(
      [...screen.getAllByRole('link'), ...screen.getAllByRole('menuitem')]
        .map((a) => a.getAttribute('href'))
        .filter((href): href is string => href !== null),
    );

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
    const myWork = screen.getByRole('link', { name: 'My work' });
    expect(myWork).toHaveAttribute('aria-current', 'page');
    const others = screen.getAllByRole('link').filter((a) => a !== myWork);
    for (const other of others) {
      expect(other, other.textContent ?? '').not.toHaveAttribute('aria-current', 'page');
    }
  });

  /**
   * **ROUND 24 MOVED THIS CONTROL INTO THE MENU.** The bar no longer holds a
   * sign-out button at all — it holds a monogram trigger — so what this case
   * can still assert from the bar is that the monogram renders and that the
   * sign-out control is NOT sitting in the nav beside it.
   *
   * The accessible-name floor this case was the unit-level witness for did not
   * lapse; it moved with the control, to 13.418, which asserts the same
   * `Sign out {name}` string on the menu item. The two halves are deliberately
   * in different cases: this one fails if the button leaks back into the bar,
   * that one fails if the name is lost in the move.
   */
  it('renders the monogram trigger, and no sign-out button in the bar itself', () => {
    currentPath = '/workspaces';
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
    expect(screen.getByRole('button', { name: 'Account menu for Kiro' })).toBeInTheDocument();
    expect(screen.getByLabelText('Kiro', { selector: '.gn-avatar' })).toBeInTheDocument();
    // Closed menu: the sign-out control is not rendered anywhere yet.
    expect(screen.queryByRole('button', { name: 'Sign out Kiro' })).not.toBeInTheDocument();
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
    mockSessionUser = { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' };
    render(
      <Providers services={NO_NAV_SERVICES}>
        <HelpPage />
      </Providers>,
    );
    // ROUND 24: signed in, Help is a MENU item, so the mount is witnessed by
    // the two controls the bar itself always renders. `aria-current` on Help
    // did not lapse — it moved into the menu and is asserted below, once the
    // menu is opened.
    expect(await screen.findByRole('link', { name: 'Workspaces' })).toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: 'Account menu for Kiro' });
    await userEvent.click(trigger);
    expect(screen.getByRole('menuitem', { name: 'Help' })).toHaveAttribute('aria-current', 'page');
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
    expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('aria-current', 'page');
    // ⚠ THE SHAPE CHANGED ON 2026-09-21 (E5-31) and this case changed WITH it
    // rather than being relaxed: `Workspaces` and `Account` are no longer in
    // the signed-out bar at all. They were dead controls — both bounce to
    // `/sign-in`, and Account's bounce repaints the page E5-13 describes — and
    // what replaced them is the door in. See the E5-31 case below for the
    // assertions that now own this arm.
    expect(screen.queryByRole('link', { name: 'Workspaces' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Account' })).not.toBeInTheDocument();
    // The one item that SHOULD disappear signed out — proving this case would
    // notice the opposite defect (everything rendering regardless of session).
    expect(screen.queryByRole('button', { name: /Sign out/ })).not.toBeInTheDocument();
    mockSessionUser = { id: 'u_kiro', name: 'Kiro' };
  });

  /**
   * E5-31 (round-2 ruling, IMPORTANT) — the signed-out bar offers the door IN,
   * and withholds what a visitor cannot use.
   *
   * Signed out on `/help` — the route `app-nav.tsx` itself calls *"the route
   * most likely to be wanted by someone who cannot get in"* — the bar painted
   * `Workspaces`, `Help`, `Account`, an unlabelled inbox icon and the scope
   * note *"No workspace selected. Pick one to reach its board, members and
   * settings."*, and **no Sign in**. Pressing Workspaces signed out landed on
   * `/sign-in` by a 401 bounce with no `next=`, so the destination was thrown
   * away; Account repainted the page E5-13's second reproduction describes; the
   * scope note told the person to pick something the bar was not offering. The
   * legal pages' bar already had the right arm (`legal-nav.tsx:96-99`).
   */
  it('13.1159 E5-31 signed out, the bar offers Sign in (with next) and withholds the dead controls', () => {
    currentPath = '/help';
    mockSessionUser = null;
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );

    // The door IN, remembering where they were headed.
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/sign-in?next=%2Fhelp',
    );
    expect(screen.getByRole('link', { name: 'Help' })).toHaveAttribute('href', '/help');
    // Every control the finding names as dead for this visitor:
    expect(screen.queryByRole('link', { name: 'Workspaces' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Account' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Inbox/ })).not.toBeInTheDocument();
    expect(screen.queryByText(/No workspace selected/)).not.toBeInTheDocument();
    // The control that keeps this from passing on a bar that renders nothing
    // at all signed out.
    expect(screen.getByRole('link', { name: 'Help' })).toBeInTheDocument();

    // The positive control for the same claim, in the same case: signed IN, all
    // four of those come back.
    mockSessionUser = { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' };
    cleanup();
    currentPath = '/workspaces';
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
    expect(screen.getByRole('link', { name: 'Workspaces' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Inbox/ })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Sign in' })).not.toBeInTheDocument();
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
    mockSessionUser = { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' };
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AccountPage />
      </Providers>,
    );
    // ROUND 24: same shape as `/help`'s witness above — Account is a menu item
    // for a signed-in viewer, so the mount is proven by the bar's own controls
    // and `aria-current` is checked inside the opened menu.
    expect(await screen.findByRole('link', { name: 'Workspaces' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Account menu for Kiro' }));
    expect(screen.getByRole('menuitem', { name: 'Account' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

/**
 * Case `13.1138` — E4-11 — AMENDED 2026-10-02 (UX fixes Task 4, owner ruling U3, case 23.042): THE DISCLOSURE'S TOGGLE IS
 * GONE. This block witnessed the `Menu` button's wiring (`aria-expanded`, `aria-controls`, `data-open`), and the button was
 * retired: from 64rem down the bottom bar is the navigation, so there is nothing for a toggle to open. What the block
 * existed to protect stays, and is what remains asserted: **the links are never conditionally rendered.** A painted-away
 * link is a visual state, not a missing one, so the scoped routes stay in the document at every width — `.gn-nav__more` is
 * `display: none` at ≤64rem by the stylesheet, not omitted by the component. (jsdom evaluates no media query, so the
 * wrapper's hiding is `nav-phone-disclosure.test.ts`'s; the bar's own rendering is `tablet-band.test.tsx`'s, 23.050.)
 */
describe('E4-11 — the workspace links are in the document with no Menu toggle in front of them', () => {
  beforeEach(() => {
    currentPath = '/w/ws_1/my-work';
    mockSessionUser = { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' };
  });

  it('13.1138 the scoped links are in the document, and there is no Menu button, no aria-controls target and no data-open state', () => {
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav workspaceId="ws_1" />
      </Providers>,
    );
    for (const name of ['My work', 'Members', 'Settings']) {
      expect(screen.getByRole('link', { name }), `${name} left the document`).toBeInTheDocument();
    }
    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument();
    expect(document.getElementById('gn-nav-more')).toBeNull();
    // CONTROL — the wrapper the links sit in is still there, and carries no open/closed state.
    const wrapper = document.querySelector('.gn-nav__more');
    expect(wrapper).not.toBeNull();
    expect(wrapper).not.toHaveAttribute('data-open');
  });

  it('signed out there is no Menu button either, and the bar still mounts', () => {
    currentPath = '/help';
    mockSessionUser = null;
    render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
    expect(screen.queryByRole('button', { name: 'Menu' })).not.toBeInTheDocument();
    // The bar is still the bar: the always-items render, so this is the absence being real
    // rather than the component failing to mount. Signed out, the always-item is the bar's own `Sign in` (E5-31, B11).
    expect(document.querySelector('nav.gn-nav a.gn-nav__signin')).toHaveTextContent('Sign in');
  });
});

/**
 * 13.1474–13.1476 — the nav's own brand group (owner request 2026-09-23: "put
 * it on the nav bar of the far left as well. not clickable."; widened
 * 2026-09-24 to a tile + wordmark, `NavBrand`, shared with `LegalNav` — see
 * 13.1491–13.1494 in `nav-brand.test.tsx`). `BrandMark` (13.1471), not a
 * second copy of the glyph — a non-interactive `<span aria-hidden="true">`
 * TILE inside `.gn-nav__brand`, the FIRST child of `.gn-nav__inner`, before
 * the links, rendered whether or not a session exists. `.gn-nav__brand`
 * itself is no longer `aria-hidden` — only the tile is — since the wordmark
 * beside it is plain visible text now, not a second copy of a hidden glyph.
 */
describe('the nav brand group', () => {
  function renderNav() {
    return render(
      <Providers services={NO_NAV_SERVICES}>
        <AppNav />
      </Providers>,
    );
  }

  it('13.1474 renders first inside .gn-nav__inner, in both session states', () => {
    currentPath = '/workspaces';
    const { container } = renderNav();
    const inner = container.querySelector('.gn-nav__inner');
    const brand = inner?.firstElementChild ?? null;
    expect(brand?.className).toBe('gn-nav__brand');
    expect(brand?.querySelector('.gn-nav__brand-tile svg')).not.toBeNull();
    expect(brand?.querySelector('.gn-nav__wordmark')?.textContent).toBe('Gisik Nokma');
    // BEFORE `.gn-nav__links` — immediately, not merely somewhere in the bar.
    expect(brand?.nextElementSibling?.className).toContain('gn-nav__links');

    cleanup();
    currentPath = '/help';
    mockSessionUser = null;
    const { container: signedOutContainer } = renderNav();
    const signedOutBrand = signedOutContainer.querySelector('.gn-nav__brand');
    expect(signedOutBrand).not.toBeNull();
    expect(signedOutBrand?.querySelector('.gn-nav__brand-tile svg')).not.toBeNull();
    expect(signedOutBrand?.querySelector('.gn-nav__wordmark')?.textContent).toBe('Gisik Nokma');
    mockSessionUser = { id: 'u_kiro', name: 'Kiro' };
  });

  /**
   * NOT a link, NOT a button, no tabindex — DOM checks rather than role
   * queries. The TILE alone carries `aria-hidden="true"` (the wordmark beside
   * it is plain visible text, widened 2026-09-24 — see `nav-brand.test.tsx`),
   * so `within(brand).queryByRole('link')` is no longer blind here the way it
   * was when the whole group was hidden; the DOM checks below are kept
   * anyway, since they prove the same thing without depending on which piece
   * is or is not in the accessibility tree. MUTATION TARGET: wrap the tile in
   * `<Link href="/workspaces">`.
   */
  it('13.1475 is not focusable and is not a link or a button', () => {
    currentPath = '/workspaces';
    const { container } = renderNav();
    const brand = container.querySelector('.gn-nav__brand');
    expect(brand).not.toBeNull();
    expect(brand?.closest('a, button, [tabindex]')).toBeNull();
    expect(brand?.querySelector('a, button, [tabindex]')).toBeNull();
    expect(brand?.hasAttribute('tabindex')).toBe(false);
  });

  /**
   * The accessible-name ratchet (Features.md:33) counts exactly four
   * attributes product-wide — `aria-label`, `role`, `aria-selected`,
   * `aria-describedby` — one way per route, so a rise nothing else catches
   * ships silently. This group — tile AND wordmark, swept over the whole
   * subtree — must introduce NONE of them. MUTATION TARGET: add `aria-label`
   * to the tile.
   */
  it("13.1476 introduces none of the accessible-name ratchet's four counted attributes", () => {
    currentPath = '/workspaces';
    const { container } = renderNav();
    const brand = container.querySelector('.gn-nav__brand');
    expect(brand).not.toBeNull();
    for (const el of [brand!, ...Array.from(brand!.querySelectorAll('*'))]) {
      for (const attr of ['aria-label', 'role', 'aria-selected', 'aria-describedby']) {
        expect(el.hasAttribute(attr), `${el.tagName} carries ${attr}`).toBe(false);
      }
    }
  });
});

/**
 * 23.044 — "where am I" is a segment-bounded PREFIX match for Settings, My work and Members (audit SYS-20, NP-26, WS-08);
 * this block pins Settings, `bottom-bar.test.tsx` pins My work and Members against the bar's own light.
 * The workspace link stays exact (`/w/<id>` is not "inside" `/w/<id>/members`, case 13.393).
 */
describe('23.044 Settings lights on every route under it', () => {
  function renderAt(path: string) {
    currentPath = path;
    return render(
      <Providers services={workspacesOf([workspace({ id: 'ws_1' })])}>
        <AppNav workspaceId="ws_1" />
      </Providers>,
    );
  }

  it('23.044 /w/<id>/settings/workflows/<id> and /settings/* light Settings and nothing else', async () => {
    renderAt('/w/ws_1/settings/workflows/wf_1');
    const settings = await screen.findByRole('link', { name: 'Settings' });
    expect(settings).toHaveAttribute('aria-current', 'page');
    for (const other of screen.getAllByRole('link').filter((a) => a !== settings)) {
      expect(other, other.textContent ?? '').not.toHaveAttribute('aria-current', 'page');
    }
    cleanup();
    renderAt('/settings/anything');
    expect(await screen.findByRole('link', { name: 'Settings' })).toHaveAttribute('aria-current', 'page');

    // CONTROL (same `it`): `/settings` still lights Settings; a sibling route, a lookalike segment and a
    // different workspace's settings do not; the workspace link stays exact on `/w/ws_1/members`.
    for (const [path, lit] of [
      ['/settings', true],
      ['/w/ws_1/my-work', false],
      ['/settingsx', false],
      ['/w/ws_1/settingsx', false],
      ['/w/ws_other/settings/workflows/wf_1', false],
    ] as const) {
      cleanup();
      renderAt(path);
      const link = await screen.findByRole('link', { name: 'Settings' });
      if (lit) expect(link, path).toHaveAttribute('aria-current', 'page');
      else expect(link, path).not.toHaveAttribute('aria-current');
    }
    cleanup();
    renderAt('/w/ws_1/members');
    await screen.findByRole('link', { name: 'Settings' });
    expect(screen.getByRole('link', { name: 'Convenience Corner' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Members' })).toHaveAttribute('aria-current', 'page');
  });
});
