import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLayoutEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { rememberBottomBar } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Smoothness T8 — the phone shell is right in the FIRST client frame (audit SM-08; cases 25.141–25.146), and the phone
 * switcher joins the shared workspaces read (planner ruling 2026-10-03, case 25.120).
 *
 * Why a probe and not only the DOM after `render()`: RTL's `render` wraps the mount in `act`, which FLUSHES effects, so a
 * hook that answers `false` first and `true` in an effect looks identical to one that answers `true` at once. The probes
 * below record what each RENDER saw, and `Spy` reads the DOM in a layout effect (the first commit, before any passive
 * effect). Neither is a hydration test: `render` is a client render, and the server snapshot is asserted separately.
 */

let currentPath = '/workspaces';
let currentParams: Record<string, string> = {};
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => currentParams,
  usePathname: () => currentPath,
  useSearchParams: () => new URLSearchParams(),
}));
let mockSessionUser: { id: string; name: string; email?: string } | null = { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' };
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: mockSessionUser === null ? null : { user: mockSessionUser } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { AppNav } from '../src/app-nav.js';
import * as inboxLink from '../src/inbox-nav-link.js';

const { InboxNavLink, REFRESH_MS } = inboxLink;
import { clearLastProjectCache } from '../src/use-last-project.js';
import { clearLastWorkspaceCache } from '../src/use-last-workspace.js';
import { clearMyWorkspacesCache, MY_WORKSPACES_STALE_MS } from '../src/use-my-workspaces.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { clearWorkspaceProjectsCache } from '../src/use-workspace-projects.js';
import { PHONE_QUERY, useIsPhone } from '../src/use-is-phone.js';
import { TABLET_BAR_QUERY, useTabletBar } from '../src/use-tablet-bar.js';

const ws: WorkspaceRef = { id: 'w1', name: 'Convenience Corner', prefix: 'CC', role: 'owner', archived: false, memberCount: 3, nameRestrictedProjectCount: 0, projects: [] };
const servicesOf = (rows: WorkspaceRef[], extra: { unreadCount?: () => Promise<number> } = {}) =>
  stubServices({ getMyWorkspaces: async () => rows }, { notifications: { unreadCount: extra.unreadCount ?? (async () => 0) } });

/** jsdom has no `matchMedia`: answer the two viewport queries independently. */
function stubViewport(answers: { tablet: boolean; phone: boolean }): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (media: string) => ({
      matches: media === TABLET_BAR_QUERY ? answers.tablet : media === PHONE_QUERY ? answers.phone : false,
      media,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

/** Reads the DOM in the FIRST commit's layout phase: before any passive effect has had a chance to change it. */
function Spy({ into }: { into: { bar: boolean; cornerInbox: boolean; labels: string[] }[] }) {
  useLayoutEffect(() => {
    into.push({
      bar: document.querySelector('.gn-bottom-bar') !== null,
      cornerInbox: document.querySelector('.gn-nav__corner a[href="/inbox"]') !== null,
      labels: [...document.querySelectorAll('.gn-bottom-bar__label')].map((label) => label.textContent ?? ''),
    });
  }, []);
  return null;
}

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  clearLastWorkspaceCache();
  clearWorkspaceNameCache();
  clearLastProjectCache();
  clearWorkspaceProjectsCache();
  clearMyWorkspacesCache();
  (inboxLink as { resetInboxUnreadStore?: () => void }).resetInboxUnreadStore?.();
  mockSessionUser = { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' };
  currentPath = '/workspaces';
  currentParams = {};
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('25.141 the tablet bar is known in the first client render', () => {
  it('25.141 useTabletBar answers the viewport on its FIRST render, and the corner links are absent in that first commit at ≤64rem and present above it (control: the wide arm)', () => {
    const seen: boolean[] = [];
    function Probe() {
      seen.push(useTabletBar());
      return null;
    }
    stubViewport({ tablet: true, phone: false });
    render(<Probe />);
    expect(seen[0], 'the first render saw the stale default').toBe(true);
    cleanup();

    const first: { bar: boolean; cornerInbox: boolean; labels: string[] }[] = [];
    render(
      <Providers services={servicesOf([ws])}>
        <AppNav workspaceId={ws.id} />
        <Spy into={first} />
      </Providers>,
    );
    expect(first[0]).toMatchObject({ bar: true, cornerInbox: false });
    cleanup();

    stubViewport({ tablet: false, phone: false });
    const wide: { bar: boolean; cornerInbox: boolean; labels: string[] }[] = [];
    render(
      <Providers services={servicesOf([ws])}>
        <AppNav workspaceId={ws.id} />
        <Spy into={wide} />
      </Providers>,
    );
    expect(wide[0]).toMatchObject({ bar: false, cornerInbox: true });
  });

  it('25.141 with no matchMedia (the server, an old webview) both hooks answer false and never throw', () => {
    const seen: boolean[] = [];
    function Probe() {
      seen.push(useTabletBar(), useIsPhone());
      return null;
    }
    expect(typeof window.matchMedia).not.toBe('function');
    render(<Probe />);
    expect(seen).toEqual([false, false]);
  });
});

describe('25.144 the phone flag is known in the first client render', () => {
  it('25.144 useIsPhone answers the viewport on its FIRST render (control: a wide viewport answers false first and last)', () => {
    const seen: boolean[] = [];
    function Probe() {
      seen.push(useIsPhone());
      return null;
    }
    stubViewport({ tablet: true, phone: true });
    render(<Probe />);
    expect(seen[0]).toBe(true);
    cleanup();
    seen.length = 0;
    stubViewport({ tablet: true, phone: false });
    render(<Probe />);
    expect([seen[0], seen[seen.length - 1]]).toEqual([false, false]);
  });
});

describe('25.142 a customised bottom bar paints its remembered slots at once', () => {
  it('25.142 the FIRST commit already lists the remembered order (Notes first), not the default followed by a swap', () => {
    rememberBottomBar('u_kiro', ['notes', 'inbox', 'my-work', 'members']);
    stubViewport({ tablet: true, phone: true });
    const first: { bar: boolean; cornerInbox: boolean; labels: string[] }[] = [];
    render(
      <Providers services={servicesOf([ws])}>
        <AppNav workspaceId={ws.id} />
        <Spy into={first} />
      </Providers>,
    );
    expect(first[0]?.labels[0]).toBe('Notes');
    // CONTROL: a person with nothing remembered gets the default, whose first slot is not Notes.
    cleanup();
    window.localStorage.clear();
    const other: { bar: boolean; cornerInbox: boolean; labels: string[] }[] = [];
    render(
      <Providers services={servicesOf([ws])}>
        <AppNav workspaceId={ws.id} />
        <Spy into={other} />
      </Providers>,
    );
    expect(other[0]?.labels[0]).not.toBe('Notes');
    expect(other[0]?.labels.length).toBeGreaterThan(1);
  });
});

describe('25.143 two unread badges are one poll', () => {
  it('25.143 two InboxNavLinks on one page ask unreadCount ONCE; after the last unmounts the store is stopped, so a later mount asks again (control)', async () => {
    const unreadCount = vi.fn(async () => 3);
    const view = render(
      <Providers services={servicesOf([ws], { unreadCount })}>
        <InboxNavLink active={false} />
        <InboxNavLink active={false} />
      </Providers>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(unreadCount).toHaveBeenCalledTimes(1);
    // Both badges show the one answer.
    expect(screen.getAllByRole('link', { name: 'Inbox, 3 unread notifications' })).toHaveLength(2);
    view.unmount();
    render(
      <Providers services={servicesOf([ws], { unreadCount })}>
        <InboxNavLink active={false} />
      </Providers>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(unreadCount).toHaveBeenCalledTimes(2);
  });

  it('25.145 the store polls on the interval while anyone listens, stops with the last listener, and a sign-out zeroes every badge', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
    const unreadCount = vi.fn(async () => 2);
    const services = servicesOf([ws], { unreadCount });
    const view = render(
      <Providers services={services}>
        <InboxNavLink active={false} />
        <InboxNavLink active={false} />
      </Providers>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(unreadCount).toHaveBeenCalledTimes(1);
    await act(async () => {
      vi.advanceTimersByTime(REFRESH_MS);
      await Promise.resolve();
    });
    expect(unreadCount, 'two badges, one tick: one more call').toHaveBeenCalledTimes(2);
    // The session ends in place: every badge drops to the bare name (11.169, for the shared store).
    mockSessionUser = null;
    view.rerender(
      <Providers services={services}>
        <InboxNavLink active={false} />
        <InboxNavLink active={false} />
      </Providers>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getAllByRole('link', { name: 'Inbox' })).toHaveLength(2);
    view.unmount();
    await act(async () => {
      vi.advanceTimersByTime(REFRESH_MS * 3);
      await Promise.resolve();
    });
    expect(unreadCount, 'a stopped store asks nothing').toHaveBeenCalledTimes(2);
  });
});

describe('25.120 the phone switcher joins the shared workspaces read', () => {
  const projectPath = () => {
    currentPath = '/w/w1';
    currentParams = { workspaceId: 'w1' };
  };

  it('25.120 opening the switcher after a remount within 30 s makes no extra getMyWorkspaces call; after 30 s a remount DOES (control, same it)', async () => {
    projectPath();
    stubViewport({ tablet: true, phone: true });
    const getMyWorkspaces = vi.fn(async () => [ws]);
    const make = () => stubServices({ getMyWorkspaces }, { notifications: { unreadCount: async () => 0 } });
    const services = make();
    const user = userEvent.setup();

    const open = async () => {
      const button = await screen.findByRole('button', { name: 'Convenience Corner' });
      await user.click(button);
      const sheet = await screen.findByRole('dialog');
      await within(sheet).findByRole('link', { name: 'All workspaces' });
      await within(sheet).findAllByRole('link', { name: 'Convenience Corner' });
      return sheet;
    };

    render(
      <Providers services={services}>
        <AppNav workspaceId="w1" />
      </Providers>,
    );
    await open();
    const baseline = getMyWorkspaces.mock.calls.length;
    cleanup();

    render(
      <Providers services={services}>
        <AppNav workspaceId="w1" />
      </Providers>,
    );
    await open();
    expect(getMyWorkspaces.mock.calls.length, 'the remount re-read the list').toBe(baseline);
    cleanup();

    const realNow = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(realNow + MY_WORKSPACES_STALE_MS + 1_000);
    render(
      <Providers services={services}>
        <AppNav workspaceId="w1" />
      </Providers>,
    );
    await open();
    await waitFor(() => expect(getMyWorkspaces.mock.calls.length).toBeGreaterThan(baseline));
  });
});

describe('25.129 the phone switcher sheet draws its own list while the read is open', () => {
  it('25.129 three rows in the switcher\'s own list and link classes under a named busy region (no sentence); a refused read shows the failure sentence and no region (control)', async () => {
    stubViewport({ tablet: true, phone: true });
    let settle!: (rows: WorkspaceRef[]) => void;
    const pending = new Promise<WorkspaceRef[]>((resolve) => {
      settle = resolve;
    });
    const user = userEvent.setup();
    render(
      <Providers services={stubServices({ getMyWorkspaces: () => pending }, { notifications: { unreadCount: async () => 0 } })}>
        <AppNav />
      </Providers>,
    );
    await user.click(await screen.findByRole('button', { name: 'Choose a workspace' }));
    const sheet = await screen.findByRole('dialog');
    const label = await within(sheet).findByText('Loading your workspaces');
    const region = label.parentElement!;
    expect(region).toHaveClass('gn-skeleton-region');
    expect(region).toHaveAttribute('aria-busy', 'true');
    expect(region.querySelectorAll('ul.gn-phone-switcher__list > li .gn-phone-switcher__link')).toHaveLength(3);
    expect(within(sheet).queryByText('Loading your workspaces…')).toBeNull();
    act(() => settle([ws]));
    await within(sheet).findByRole('link', { name: 'Convenience Corner' });
    expect(sheet.querySelector('.gn-skeleton-region')).toBeNull();
    cleanup();
    clearMyWorkspacesCache();
    render(
      <Providers services={stubServices({ getMyWorkspaces: () => Promise.reject(new Error('down')) }, { notifications: { unreadCount: async () => 0 } })}>
        <AppNav />
      </Providers>,
    );
    await user.click(await screen.findByRole('button', { name: 'Choose a workspace' }));
    const failed = await screen.findByRole('dialog');
    await within(failed).findByText('Your workspaces could not be loaded.');
    expect(failed.querySelector('.gn-skeleton-region')).toBeNull();
  });
});
