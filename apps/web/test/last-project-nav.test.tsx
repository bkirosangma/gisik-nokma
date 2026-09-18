import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectRef, WorkspaceRef } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * The nav's "last open project" item, with its project dropdown.
 *
 * ## Why this file exists separately from `app-nav.test.tsx`
 *
 * `app-nav.test.tsx` is the nav's MOUNT witness, and its docblock records why:
 * Task 14's review deleted an import AND its element from `src/app-nav.tsx` and
 * measured 125/125 green, because the component was rendered only by its own
 * test file. The lesson is that a suite can cover everything the wiring
 * connects and be blind to the wiring.
 *
 * So the split here is deliberate, and BOTH halves are required:
 * this file drives the component's own behaviour directly (hover, focus,
 * Escape, the archived edge), and `app-nav.test.tsx` carries the separate case
 * that `AppNav` actually renders it — without which none of the below would
 * notice the item being unhooked.
 *
 * ## `next/link` is never clicked anywhere else in this suite
 *
 * Measured, not assumed: no test in `apps/web/test/` clicks an anchor that is a
 * `next/link`, and none mocks it. The Click cases below are therefore also the
 * first evidence that a `next/link` click is drivable under this harness — the
 * navigation itself is `next/navigation`'s mocked `push`, and what these cases
 * assert is the MEMORY the click writes, which is the half `react-router`'s
 * internals cannot fake.
 */

let mockSessionUser: { id: string; name: string; email?: string } | null = {
  id: 'u_kiro',
  name: 'Kiro',
  email: 'kiro@example.com',
};
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: mockSessionUser === null ? null : { user: mockSessionUser } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/inbox',
  useSearchParams: () => new URLSearchParams(),
}));

import { LastProjectNav } from '../src/last-project-nav.js';
import {
  LAST_PROJECT_KEY,
  PROJECT_TABS_KEY,
  clearLastProjectCache,
} from '../src/use-last-project.js';
import { clearWorkspaceProjectsCache } from '../src/use-workspace-projects.js';

beforeEach(() => {
  window.localStorage.clear();
  clearLastProjectCache();
  clearWorkspaceProjectsCache();
  mockSessionUser = { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' };
});

/**
 * The harness stands in for `next/link`'s own `preventDefault`, and this is
 * measured rather than assumed.
 *
 * In the running app, `next/link`'s click handler calls `preventDefault()` and
 * pushes the route, so the browser never performs a full-page navigation. This
 * suite has no App Router context — `next/navigation` is mocked, which is what
 * the other nav cases have always done — so nothing intercepts the click, jsdom
 * attempts the navigation it cannot perform, and every click case prints
 * `Error: Not implemented: navigation (except hash changes)` on stderr.
 *
 * A green run with that on stderr is not pristine, and this suite treats
 * pristine output as part of the signal. The listener is the smallest honest
 * substitute: it cancels the BROWSER's default action only. React's own
 * `onClick` still runs, so the memory writes these cases assert are untouched —
 * and they are the reason the case exists, since the route push itself is
 * mocked and proves nothing.
 */
beforeAll(() => {
  document.addEventListener(
    'click',
    (event) => {
      if ((event.target as Element | null)?.closest('a') !== null) event.preventDefault();
    },
    { capture: true },
  );
});

function project(over: Partial<ProjectRef> & { id: string }): ProjectRef {
  return { name: `Project ${over.id}`, archived: false, ticketCount: 0, blockedCount: 0, ...over };
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

function servicesFor(refs: WorkspaceRef[]) {
  return stubServices({ getMyWorkspaces: async () => refs });
}

/** The served workspace shared by most cases: one archived row, then two live ones. */
const WS_1 = workspace({
  id: 'ws_1',
  name: 'Convenience Corner',
  projects: [
    project({ id: 'p_arch', name: 'Archived One', archived: true }),
    project({ id: 'p_beta', name: 'Beta' }),
    project({ id: 'p_gamma', name: 'Gamma' }),
  ],
});

/** A project already remembered for the seeded user, as the hook stores it. */
function rememberProject(projectId: string, workspaceId = 'ws_1', userId = 'u_kiro'): void {
  window.localStorage.setItem(
    LAST_PROJECT_KEY,
    JSON.stringify({ userId, workspaceId, projectId }),
  );
}

function renderNav(services: ReturnType<typeof stubServices>, workspaceId = 'ws_1') {
  return render(
    <Providers services={services}>
      <LastProjectNav workspaceId={workspaceId} userId="u_kiro" />
    </Providers>,
  );
}

/** The item's own link — the one whose href is a project route. */
function itemLink(): HTMLAnchorElement {
  return screen.getByRole('link', { name: /Beta|Gamma|Archived One/ }) as HTMLAnchorElement;
}

describe('LastProjectNav — the remembered project item', () => {
  /**
   * 13.865 — it NAMES the remembered project and links to its page.
   *
   * The name comes from the same served read `/workspaces` renders, so the item
   * can never print an id or a name the viewer has not been given. Asserted on
   * the href as well as the name: a rename of that string is the same
   * orphaning by another route — the nav would still say "Gamma" and point at
   * nothing.
   */
  it('13.865 names the remembered project and links to its page', async () => {
    rememberProject('p_gamma');
    renderNav(servicesFor([WS_1]));

    const link = await screen.findByRole('link', { name: 'Gamma' });
    expect(link).toHaveAttribute('href', '/w/ws_1/p/p_gamma');
  });

  /**
   * 13.866 — with nothing remembered it falls back to the FIRST NON-ARCHIVED
   * project in served order.
   *
   * The fixture's first row IS archived, and it is deliberately first: taking
   * `projects[0]` would name `Archived One` and pass a case that only checked
   * "some project". Order is not re-derived here either — it is
   * `workspace.projects` order, which is what `/workspaces` renders, and
   * `p_beta` follows the archived row in exactly that order.
   */
  it('13.866 falls back to the first non-archived project in served order', async () => {
    renderNav(servicesFor([WS_1]));

    const link = await screen.findByRole('link', { name: 'Beta' });
    expect(link).toHaveAttribute('href', '/w/ws_1/p/p_beta');
    expect(screen.queryByRole('link', { name: 'Archived One' })).toBeNull();
  });

  /**
   * 13.867 — NO REACHABLE PROJECT RENDERS NOTHING.
   *
   * This is the rule Rounds 22 and 23 established when the Board item was
   * removed for offering a link that could not resolve (owner: "the board on
   * the nav bar doesn't work. lets remove it"). Two shapes reach it, and both
   * are here: a workspace the read does not contain at all, and one that
   * contains only archived projects — the second being the case a
   * "does it have projects" check would wrongly pass.
   *
   * Asserted as an empty body rather than as a missing name, because the claim
   * is that NOTHING is rendered — a fallback to some other project would
   * satisfy a narrower assertion.
   */
  it('13.867 renders nothing when there is no reachable project', async () => {
    const gone = renderNav(servicesFor([workspace({ id: 'ws_other' })]));
    await waitFor(() => expect(gone.container).toBeEmptyDOMElement());

    gone.unmount();
    const allArchived = renderNav(
      servicesFor([
        workspace({ id: 'ws_1', projects: [project({ id: 'p_x', name: 'X', archived: true })] }),
      ]),
    );
    await waitFor(() => expect(allArchived.container).toBeEmptyDOMElement());
  });

  /**
   * 13.868 — THE FALLBACK'S EDGE: the remembered project is ARCHIVED.
   *
   * Archiving the project you were last in must not leave the nav naming it —
   * `archived` is served precisely so a client can tell, and `/workspaces`
   * already filters on it. So the remembered id is dropped and the fallback
   * applies, which is the same answer as having remembered nothing.
   *
   * This is the case the controller asked to be WITNESSED rather than reasoned,
   * and the distinction it pins is real: a nav that resolved the remembered id
   * against ALL served projects (archived included) would name `Archived One`
   * here and be wrong, while passing 13.865 unchanged.
   */
  it('13.868 falls back when the remembered project has been archived', async () => {
    rememberProject('p_arch');
    renderNav(servicesFor([WS_1]));

    const link = await screen.findByRole('link', { name: 'Beta' });
    expect(link).toHaveAttribute('href', '/w/ws_1/p/p_beta');
    expect(screen.queryByRole('link', { name: 'Archived One' })).toBeNull();
  });

  /**
   * 13.869 — and when the remembered project is not in the served list at all.
   *
   * You were removed from it, or it was deleted. The same hazard as 13.426 one
   * level up: a remembered id is a guess about the past, and the served read is
   * what turns it into a fact. `p_deleted` is absent, not archived, so this is
   * the other door into the fallback.
   */
  it('13.869 falls back when the remembered project is no longer served', async () => {
    rememberProject('p_deleted');
    renderNav(servicesFor([WS_1]));

    expect(await screen.findByRole('link', { name: 'Beta' })).toBeInTheDocument();
  });
});

describe('LastProjectNav — the dropdown', () => {
  /**
   * 13.870 — it opens on HOVER, and lists the non-archived projects in served
   * order.
   *
   * Hover specifically, not focus: `userEvent.hover` moves a pointer and
   * NOTHING else, so an implementation that only opened on focus would leave
   * this case red. The archived row's absence is the filter, and the order is
   * the served order with it removed — `Beta` then `Gamma`.
   */
  it('13.870 opens on hover and lists the non-archived projects in served order', async () => {
    rememberProject('p_gamma');
    renderNav(servicesFor([WS_1]));
    await screen.findByRole('link', { name: 'Gamma' });

    expect(screen.queryByRole('menu')).toBeNull();

    await userEvent.hover(itemLink());

    const menu = await screen.findByRole('menu');
    expect(menu).toHaveAccessibleName('Projects');
    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual(['Beta', 'Gamma']);
    expect(screen.queryByRole('menuitem', { name: 'Archived One' })).toBeNull();
  });

  /**
   * 13.871 — it opens on FOCUS, and Escape closes it.
   *
   * `userEvent.tab()` is the real keyboard path: a keyboard user reaches this
   * item by tabbing, never by hovering, so an implementation that opened only
   * on pointer events would be unusable without a mouse and would leave this
   * case red.
   *
   * Escape is asserted on the MENU's disappearance and not on focus, because
   * this component deliberately does NOT pull focus into the menu on open —
   * see its docblock: opening on focus means focus must stay where the person
   * put it, so tabbing through the nav does not swallow you.
   */
  it('13.871 opens on focus and closes on Escape', async () => {
    rememberProject('p_gamma');
    renderNav(servicesFor([WS_1]));
    await screen.findByRole('link', { name: 'Gamma' });

    await userEvent.tab();

    expect(await screen.findByRole('menu')).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });

  /**
   * 13.872 — CLICK writes the memory, for the item and for a dropdown row.
   *
   * Two halves, and the second is the one with a real branch: picking `Beta`
   * from the open menu must remember `Beta`, not the project the item was
   * showing when the menu opened. Both are asserted on local storage, because
   * the navigation they also trigger is `next/navigation`'s mocked `push` and
   * would make either half pass without the memory being written.
   *
   * The tab seed is asserted too: `Beta` had no remembered tab, so the click
   * seeds the default, which is what makes "opens at the remembered tab" true
   * for a project that has never been opened.
   */
  it('13.872 remembers the project it opens, and seeds its tab', async () => {
    rememberProject('p_gamma');
    renderNav(servicesFor([WS_1]));
    await screen.findByRole('link', { name: 'Gamma' });

    // THE KEY IS REMOVED FIRST, and this line is the difference between a case
    // and a decoration. `rememberProject('p_gamma')` above writes exactly the
    // bytes asserted below, so without this the assertion was satisfied by the
    // FIXTURE — deleting the trigger's `onClick` left it green, which a
    // reviewer caught (M4). With the record gone, only the click's own write
    // can produce it.
    window.localStorage.removeItem(LAST_PROJECT_KEY);

    await userEvent.click(itemLink());

    expect(JSON.parse(window.localStorage.getItem(LAST_PROJECT_KEY) as string)).toEqual({
      userId: 'u_kiro',
      workspaceId: 'ws_1',
      projectId: 'p_gamma',
    });
    expect(JSON.parse(window.localStorage.getItem(PROJECT_TABS_KEY) as string)).toEqual({
      userId: 'u_kiro',
      tabs: { p_gamma: 'board' },
    });
  });

  /**
   * 13.873 — and the SECOND half of that click: a row from the open menu sends
   * you to a DIFFERENT project and remembers THAT one.
   *
   * Separated from 13.872 because a single-armed case cannot tell the two
   * apart: with only the item's own click asserted, an implementation that
   * ignored the row clicked and re-remembered the shown project would pass.
   */
  it('13.873 remembers the project chosen from the dropdown, not the one shown', async () => {
    rememberProject('p_gamma');
    renderNav(servicesFor([WS_1]));
    await screen.findByRole('link', { name: 'Gamma' });

    await userEvent.hover(itemLink());
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Beta' }));

    expect(JSON.parse(window.localStorage.getItem(LAST_PROJECT_KEY) as string)).toEqual({
      userId: 'u_kiro',
      workspaceId: 'ws_1',
      projectId: 'p_beta',
    });
  });
});
