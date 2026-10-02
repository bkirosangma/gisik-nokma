import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { DEFAULT_BAR, readBottomBar, rememberBottomBar, type BarDestination } from '@gisik-nokma/app-core';
import { BottomBar } from '../src/bottom-bar.js';
import { Providers } from '../src/providers.js';
import { AppNav } from '../src/app-nav.js';
import { clearLastProjectCache, readProjectTab, rememberProject, rememberProjectTab } from '../src/use-last-project.js';
import { clearLastWorkspaceCache } from '../src/use-last-workspace.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { clearWorkspaceProjectsCache } from '../src/use-workspace-projects.js';
import { PHONE_QUERY } from '../src/use-is-phone.js';
import { TABLET_BAR_QUERY } from '../src/use-tablet-bar.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * The web app on phones, Plan Task 3 — the component half of the customizable bottom bar
 * (cases 21.023–21.027, 21.031, 21.032). The store is `packages/app-core/test/preferences/bottom-bar.test.ts`
 * (21.020–21.022); the CSS is `packages/ui/test/phone-bottom-bar-css.test.ts` (21.028, 21.029, 21.031).
 */

let currentPath = '/workspaces';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => currentPath,
  useSearchParams: () => new URLSearchParams(),
}));
let mockSessionUser: { id: string; name: string; email?: string } | null = { id: 'u1', name: 'Kiro', email: 'kiro@example.com' };
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: mockSessionUser === null ? null : { user: mockSessionUser } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

const U = 'u1';
const WS = 'w1';

/** jsdom has no router: swallow the navigation Next's `<Link>` would otherwise ask jsdom to perform. */
function swallowNavigation(): () => void {
  const stop = (event: Event): void => event.preventDefault();
  document.addEventListener('click', stop);
  return () => document.removeEventListener('click', stop);
}
let unswallow: () => void = () => undefined;

/** jsdom has no `matchMedia`; `AppNav` renders the bar only when the viewport query matches (it answers every query alike). */
function stubPhoneViewport(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (media: string) => ({ matches, media, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
}

function bar(props: Partial<{ workspaceId: string | undefined; projectId: string | undefined; pathname: string }> = {}) {
  return (
    <Providers services={stubServices({ getMyWorkspaces: async () => [] }, { notifications: { unreadCount: async () => 0 } })}>
      <BottomBar
        workspaceId={'workspaceId' in props ? props.workspaceId : WS}
        projectId={props.projectId}
        userId={U}
        pathname={props.pathname ?? `/w/${WS}`}
      />
    </Providers>
  );
}
function phoneNav(): HTMLElement {
  return screen.getByRole('navigation', { name: 'Phone' });
}
/** The bar's own controls, in DOM order: links and the More button. */
function controls(): HTMLElement[] {
  return [...phoneNav().querySelectorAll<HTMLElement>('a, button')];
}
function items(): string[] {
  return controls().map((el) => el.getAttribute('aria-label') ?? el.textContent ?? '');
}

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  clearLastWorkspaceCache();
  clearWorkspaceNameCache();
  clearLastProjectCache();
  clearWorkspaceProjectsCache();
  mockSessionUser = { id: U, name: 'Kiro', email: 'kiro@example.com' };
  currentPath = '/workspaces';
  unswallow = swallowNavigation();
});
afterEach(() => {
  unswallow();
  Reflect.deleteProperty(window, 'matchMedia');
  Reflect.deleteProperty(window, 'visualViewport');
});

describe('21.023 the bar renders the slots in order with More last', () => {
  it('21.023 four slots in order then More; the current one is aria-current AND carries an indicator element; More stays last when the bar is full', async () => {
    render(bar({ pathname: `/w/${WS}/my-work` }));
    await waitFor(() => expect(items()).toEqual(['Board', 'My work', 'Notes', 'Inbox', 'More']));
    const nav = phoneNav();
    const current = within(nav).getByRole('link', { name: 'My work' });
    expect(current.getAttribute('aria-current')).toBe('page');
    // Not colour alone: the current slot owns an indicator element, the others do not.
    expect(current.querySelector('.gn-bottom-bar__indicator')).not.toBeNull();
    for (const other of ['Board', 'Notes', 'Inbox']) {
      expect(within(nav).getByRole('link', { name: other }).getAttribute('aria-current')).toBeNull();
    }
    // Every item states a name an assistive reader can speak.
    for (const el of controls()) {
      expect((el.getAttribute('aria-label') ?? el.textContent ?? '').trim()).not.toBe('');
    }

    // CONTROL — More is present, and last, even with four different slots chosen.
    cleanup();
    rememberBottomBar(U, ['list', 'calendar', 'timeline', 'backlog']);
    render(bar());
    await waitFor(() => expect(items()).toEqual(['List', 'Calendar', 'Timeline', 'Backlog', 'More']));
    expect(controls().at(-1)?.textContent).toContain('More');
  });

  it('21.023 a tab slot is current on its project route only for the tab that project is on', async () => {
    rememberBottomBar(U, ['board', 'list', 'notes', 'inbox']);
    rememberProjectTab('p1', 'list', U);
    render(bar({ projectId: 'p1', pathname: `/w/${WS}/p/p1` }));
    await waitFor(() => expect(within(phoneNav()).getByRole('link', { name: 'List' }).getAttribute('aria-current')).toBe('page'));
    expect(within(phoneNav()).getByRole('link', { name: 'Board' }).getAttribute('aria-current')).toBeNull();
    // CONTROL — and when the page switches tab, the bar follows without a navigation.
    act(() => rememberProjectTab('p1', 'board', U));
    await waitFor(() => expect(within(phoneNav()).getByRole('link', { name: 'Board' }).getAttribute('aria-current')).toBe('page'));
    expect(within(phoneNav()).getByRole('link', { name: 'List' }).getAttribute('aria-current')).toBeNull();
  });
});

describe('21.024 project-view slots remember the tab, then go to the last project', () => {
  it('21.024 Board and List write the tab for the last project and link to it; with no remembered project they go to the workspace; My work goes to its route and writes nothing', async () => {
    rememberProject(WS, 'p1', U);
    rememberBottomBar(U, ['board', 'list', 'my-work', 'notes']);
    const user = userEvent.setup();
    render(bar());
    const board = await waitFor(() => {
      const link = within(phoneNav()).getByRole('link', { name: 'Board' });
      expect(link.getAttribute('href')).toBe(`/w/${WS}/p/p1`);
      return link;
    });
    expect(readProjectTab('p1', U)).toBeNull();
    await user.click(board);
    expect(readProjectTab('p1', U)).toBe('board');
    const list = within(phoneNav()).getByRole('link', { name: 'List' });
    expect(list.getAttribute('href')).toBe(`/w/${WS}/p/p1`);
    await user.click(list);
    expect(readProjectTab('p1', U)).toBe('list');

    // CONTROL — My work is a plain route and clicking it leaves the project's tab alone.
    const myWork = within(phoneNav()).getByRole('link', { name: 'My work' });
    expect(myWork.getAttribute('href')).toBe(`/w/${WS}/my-work`);
    await user.click(myWork);
    expect(readProjectTab('p1', U)).toBe('list');
  });

  it('21.024 with no remembered project Board goes to the workspace home (its project grid)', async () => {
    render(bar());
    await waitFor(() => expect(within(phoneNav()).getByRole('link', { name: 'Board' }).getAttribute('href')).toBe(`/w/${WS}`));
    expect(readProjectTab('p1', U)).toBeNull();
  });
});

describe('21.025 Edit bottom bar', () => {
  async function openEdit(user: ReturnType<typeof userEvent.setup>): Promise<HTMLElement> {
    await user.click(within(phoneNav()).getByRole('button', { name: 'More' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'More' })).getByRole('button', { name: 'Edit bottom bar' }));
    return screen.findByRole('dialog', { name: 'Edit bottom bar' });
  }

  it('21.025 − removes, + adds and is disabled at four, ↑/↓ reorder, Reset restores the default; each change persists; More is not a removable slot', async () => {
    const user = userEvent.setup();
    render(bar());
    await waitFor(() => expect(items()).toHaveLength(5));
    const edit = await openEdit(user);

    await user.click(within(edit).getByRole('button', { name: 'Remove Board' }));
    expect(readBottomBar(U)).toEqual(['my-work', 'notes', 'inbox']);
    await user.click(within(edit).getByRole('button', { name: 'Add Calendar' }));
    expect(readBottomBar(U)).toEqual(['my-work', 'notes', 'inbox', 'calendar']);
    // Full: every "+" is disabled, and clicking one cannot make a fifth.
    const addList = within(edit).getByRole('button', { name: 'Add List' });
    expect((addList as HTMLButtonElement).disabled).toBe(true);
    await user.click(addList);
    expect(readBottomBar(U)).toHaveLength(4);

    await user.click(within(edit).getByRole('button', { name: 'Move Calendar up' }));
    expect(readBottomBar(U)).toEqual(['my-work', 'notes', 'calendar', 'inbox']);
    await user.click(within(edit).getByRole('button', { name: 'Move My work down' }));
    expect(readBottomBar(U)).toEqual(['notes', 'my-work', 'calendar', 'inbox']);
    // The ends cannot move past themselves.
    expect((within(edit).getByRole('button', { name: 'Move Notes up' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(edit).getByRole('button', { name: 'Move Inbox down' }) as HTMLButtonElement).disabled).toBe(true);

    await user.click(within(edit).getByRole('button', { name: 'Reset to default' }));
    expect(readBottomBar(U)).toEqual([...DEFAULT_BAR]);

    // CONTROL — More is never a row of the editor, in either list.
    expect(within(edit).queryByRole('button', { name: /(Remove|Add|Move) More/ })).toBeNull();
    // …and the live bar followed the edits.
    await waitFor(() => expect(items()).toEqual(['Board', 'My work', 'Notes', 'Inbox', 'More']));
  });

  it('21.025 the last slot can be removed (an empty bar is just More) and every nine destinations are offered between the two lists', async () => {
    const user = userEvent.setup();
    rememberBottomBar(U, ['notes']);
    render(bar());
    const edit = await openEdit(user);
    await user.click(within(edit).getByRole('button', { name: 'Remove Notes' }));
    expect(readBottomBar(U)).toEqual([]);
    await waitFor(() => expect(items()).toEqual(['More']));
    // 21.034 — and a fresh mount reads the saved EMPTY bar as a choice: only More, not the default four.
    cleanup();
    render(bar());
    await waitFor(() => expect(items()).toEqual(['More']));
    await user.click(within(phoneNav()).getByRole('button', { name: 'More' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'More' })).getByRole('button', { name: 'Edit bottom bar' }));
    const reopened = await screen.findByRole('dialog', { name: 'Edit bottom bar' });
    const offered = within(reopened).getAllByRole('button', { name: /^Add / });
    expect(offered).toHaveLength(9);
  });
});

describe('21.026 More lists what the bar does not carry', () => {
  it('21.026 exactly the unslotted destinations, then Settings, Account, Help and "Edit bottom bar"; a slotted one is not repeated', async () => {
    const user = userEvent.setup();
    render(bar());
    await user.click(within(phoneNav()).getByRole('button', { name: 'More' }));
    const more = await screen.findByRole('dialog', { name: 'More' });
    const links = within(more).getAllByRole('link').map((a) => a.textContent);
    expect(links).toEqual(['List', 'Calendar', 'Timeline', 'Backlog', 'Members', 'Settings', 'Account', 'Help']);
    expect(within(more).getByRole('link', { name: 'Settings' }).getAttribute('href')).toBe(`/settings?workspaceId=${WS}`);
    expect(within(more).getByRole('link', { name: 'Account' }).getAttribute('href')).toBe('/account');
    expect(within(more).getByRole('button', { name: 'Edit bottom bar' })).toBeTruthy();
    // CONTROL — nothing the bar already carries is repeated.
    for (const slotted of ['Board', 'My work', 'Notes', 'Inbox']) {
      expect(within(more).queryByRole('link', { name: slotted })).toBeNull();
    }
  });
});

describe('21.027 workspace-scoped slots follow the nav’s "does not offer a link that cannot resolve" rule', () => {
  function services(rows: WorkspaceRef[]) {
    return stubServices({ getMyWorkspaces: async () => rows }, { notifications: { unreadCount: async () => 0 } });
  }
  const row = (id: string): WorkspaceRef => ({
    id,
    name: 'Convenience Corner',
    prefix: 'CC',
    role: 'owner',
    archived: false,
    memberCount: 3,
    nameRestrictedProjectCount: 0,
    projects: [],
  });

  it('21.027 a remembered workspace that does not resolve gets Notes + Inbox + More only (no padding); once it resolves the scoped slots render', async () => {
    stubPhoneViewport(true);
    window.localStorage.setItem('gn-last-workspace', JSON.stringify({ userId: U, workspaceId: 'ws_gone' }));
    render(
      <Providers services={services([row('w1')])}>
        <AppNav />
      </Providers>,
    );
    await waitFor(() => expect(items()).toEqual(['Notes', 'Inbox', 'More']));
    // Give the (settled) name lookup every chance to wrongly promote the stale id.
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(items()).toEqual(['Notes', 'Inbox', 'More']);

    // CONTROL — the same remembered id, once the directory names it, brings the scoped slots in.
    cleanup();
    clearLastWorkspaceCache();
    clearWorkspaceNameCache();
    window.localStorage.setItem('gn-last-workspace', JSON.stringify({ userId: U, workspaceId: 'w1' }));
    render(
      <Providers services={services([row('w1')])}>
        <AppNav />
      </Providers>,
    );
    await waitFor(() => expect(items()).toEqual(['Board', 'My work', 'Notes', 'Inbox', 'More']));
  });

  it('21.027 signed out the bar is not rendered at all', async () => {
    stubPhoneViewport(true);
    mockSessionUser = null;
    render(
      <Providers services={services([])}>
        <AppNav />
      </Providers>,
    );
    await screen.findByRole('link', { name: 'Sign in' });
    expect(screen.queryByRole('navigation', { name: 'Phone' })).toBeNull();
  });
});

describe('21.031 the bar steps aside while the on-screen keyboard is open', () => {
  function stubViewport(height: number, innerHeight: number) {
    const listeners = new Set<() => void>();
    const vv = {
      height,
      addEventListener: (_type: string, fn: () => void) => listeners.add(fn),
      removeEventListener: (_type: string, fn: () => void) => listeners.delete(fn),
    };
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
    Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: innerHeight });
    return { vv, fire: () => listeners.forEach((fn) => fn()) };
  }

  it('21.031 visualViewport.height < 0.75 × innerHeight sets data-keyboard="open"; a full-height viewport leaves it off; no visualViewport leaves it off', async () => {
    const { vv, fire } = stubViewport(800, 800);
    render(bar());
    await waitFor(() => expect(items()).toHaveLength(5));
    expect(phoneNav().getAttribute('data-keyboard')).toBeNull();
    act(() => {
      vv.height = 300;
      fire();
    });
    await waitFor(() => expect(phoneNav().getAttribute('data-keyboard')).toBe('open'));
    // CONTROL — and it closes again when the keyboard goes away.
    act(() => {
      vv.height = 800;
      fire();
    });
    await waitFor(() => expect(phoneNav().getAttribute('data-keyboard')).toBeNull());

    // CONTROL — an older browser with no `visualViewport` never reports the keyboard.
    cleanup();
    Reflect.deleteProperty(window, 'visualViewport');
    render(bar());
    await waitFor(() => expect(items()).toHaveLength(5));
    expect(phoneNav().getAttribute('data-keyboard')).toBeNull();
  });

  it('21.032 where the keyboard RESIZES the layout (innerHeight shrinks with it) a focused field still reads as keyboard-open against the height it had before', async () => {
    const { vv, fire } = stubViewport(800, 800);
    render(
      <>
        {bar()}
        <input aria-label="Title" />
      </>,
    );
    await waitFor(() => expect(items()).toHaveLength(5));
    expect(phoneNav().getAttribute('data-keyboard')).toBeNull();
    screen.getByLabelText('Title').focus();
    act(() => {
      // `interactiveWidget: 'resizes-content'`: both heights drop together, so the ratio alone says 1.
      vv.height = 480;
      Object.defineProperty(window, 'innerHeight', { configurable: true, writable: true, value: 480 });
      fire();
    });
    await waitFor(() => expect(phoneNav().getAttribute('data-keyboard')).toBe('open'));
    // CONTROL — the same shrink with NO field focused (a split-screen resize, say) is not a keyboard.
    act(() => {
      (document.activeElement as HTMLElement).blur();
      fire();
    });
    await waitFor(() => expect(phoneNav().getAttribute('data-keyboard')).toBeNull());
  });
});

describe('21.037 / 21.038 AppNav renders the bar ONLY at phone width, and instead of the corner links', () => {
  function services() {
    return stubServices({ getMyWorkspaces: async () => [] }, { notifications: { unreadCount: async () => 0 } });
  }
  const names = (name: string): HTMLElement[] => screen.queryAllByRole('link', { name });

  it('21.037 no phone viewport → no nav[aria-label="Phone"] in the DOM; a phone viewport → the bar is there', async () => {
    stubPhoneViewport(false);
    render(
      <Providers services={services()}>
        <AppNav />
      </Providers>,
    );
    await screen.findByRole('link', { name: 'Notes' });
    expect(document.querySelector('nav[aria-label="Phone"]')).toBeNull();

    // CONTROL — the same bar, same session, at a phone viewport does render it.
    cleanup();
    stubPhoneViewport(true);
    render(
      <Providers services={services()}>
        <AppNav />
      </Providers>,
    );
    await waitFor(() => expect(document.querySelector('nav[aria-label="Phone"]')).not.toBeNull());
  });

  it('21.038 the corner carries Notes and Inbox above the phone width; at phone width the bar carries them, once each', async () => {
    stubPhoneViewport(false);
    render(
      <Providers services={services()}>
        <AppNav />
      </Providers>,
    );
    await screen.findByRole('link', { name: 'Notes' });
    expect(names('Notes')).toHaveLength(1);
    expect(names('Inbox')).toHaveLength(1);
    expect(names('Notes')[0]?.closest('.gn-nav__corner')).not.toBeNull();
    expect(names('Inbox')[0]?.closest('.gn-nav__corner')).not.toBeNull();

    // At phone width: exactly one of each, and it is the bar's — not the corner's plus the bar's (a second unread poller).
    cleanup();
    stubPhoneViewport(true);
    render(
      <Providers services={services()}>
        <AppNav />
      </Providers>,
    );
    await waitFor(() => expect(document.querySelector('nav[aria-label="Phone"]')).not.toBeNull());
    expect(names('Notes')).toHaveLength(1);
    expect(names('Inbox')).toHaveLength(1);
    expect(names('Notes')[0]?.closest('nav[aria-label="Phone"]')).not.toBeNull();
    expect(names('Inbox')[0]?.closest('nav[aria-label="Phone"]')).not.toBeNull();
    expect(document.querySelector('.gn-nav__corner a[href="/notes"], .gn-nav__corner a[href="/inbox"]')).toBeNull();
  });
});

describe('21.033 the script and the stylesheet name the same phone width', () => {
  // AMENDED 2026-10-02 (UX fixes Task 4, owner ruling U3, case 23.051): the bar's rules moved from the 40rem arm to the 64rem tablet
  // arm and `AppNav` now gates the bar on `TABLET_BAR_QUERY`, so `PHONE_QUERY` no longer governs the bar. What it still pins, and
  // what this case now asserts, is that the PHONE top bar's rules (the switcher in place of the link row) sit under it.
  it('21.033 PHONE_QUERY is the stylesheet\'s own 40rem arm, and the phone top bar\'s rules sit under it (the bar\'s moved to 64rem: 23.051)', () => {
    const css = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8');
    expect(css).toContain(`@media ${PHONE_QUERY} {`);
    // CONTROL — the switcher's own box rule is drawn under THAT arm (the nearest at-rule above it), not merely under some 40rem arm.
    const rule = css.indexOf('  .gn-phone-switcher {');
    expect(rule).toBeGreaterThan(0);
    expect(css.slice(css.lastIndexOf('@media', rule)).startsWith(`@media ${PHONE_QUERY} {`)).toBe(true);
    // CONTROL — and the bar's own box rule is NOT under it any more: its nearest at-rule is the 64rem arm (`TABLET_BAR_QUERY`).
    const bar = css.indexOf('  .gn-bottom-bar {');
    expect(bar).toBeGreaterThan(0);
    expect(css.slice(css.lastIndexOf('@media', bar)).startsWith(`@media ${TABLET_BAR_QUERY} {`)).toBe(true);
  });
});

// Keep the destinations type exercised so a renamed id fails typecheck here, not only in the store.
const _all: readonly BarDestination[] = ['board', 'my-work', 'notes', 'inbox', 'list', 'calendar', 'timeline', 'backlog', 'members'];
void _all;
void fireEvent;

describe('23.044 the bar lights a destination on the same segment-bounded prefix rule as the top nav', () => {
  it('23.044 My work is current on a route under it, not on a lookalike; the project-tab slot rule is unchanged', async () => {
    render(bar({ pathname: `/w/${WS}/my-work/anything` }));
    await waitFor(() => expect(items()).toContain('My work'));
    expect(within(phoneNav()).getByRole('link', { name: 'My work' }).getAttribute('aria-current')).toBe('page');

    // CONTROL (same `it`): a lookalike segment is not current (`/w/<id>` lighting nothing in the bar is asserted in the next block).
    cleanup();
    render(bar({ pathname: `/w/${WS}/my-workshop` }));
    await waitFor(() => expect(items()).toContain('My work'));
    expect(within(phoneNav()).getByRole('link', { name: 'My work' }).getAttribute('aria-current')).toBeNull();
  });
});

describe('23.044 the top nav and the bar light My work and Members the same way', () => {
  function services() {
    return stubServices(
      {
        getMyWorkspaces: async () => [
          { id: WS, name: 'Convenience Corner', prefix: 'CC', role: 'owner', archived: false, memberCount: 3, nameRestrictedProjectCount: 0, projects: [] } satisfies WorkspaceRef,
        ],
      },
      { notifications: { unreadCount: async () => 0 } },
    );
  }
  /** `AppNav` on a phone viewport mounts the top nav's links AND the bar, both from the one pathname. */
  async function renderBoth(path: string): Promise<void> {
    currentPath = path;
    stubPhoneViewport(true);
    render(
      <Providers services={services()}>
        <AppNav workspaceId={WS} />
      </Providers>,
    );
    await waitFor(() => expect(items()).toContain('My work'));
  }
  const lit = (el: HTMLElement): boolean => el.getAttribute('aria-current') === 'page';
  const topLink = (name: string): HTMLElement =>
    screen.getAllByRole('link', { name }).find((a) => !phoneNav().contains(a)) as HTMLElement;

  it('23.044 /w/<id>/my-work/x lights My work in BOTH, /w/<id>/members/x lights Members in the top nav; a lookalike lights neither; /w/<id> lights nothing in the bar', async () => {
    await renderBoth(`/w/${WS}/my-work/x`);
    expect(lit(topLink('My Work'))).toBe(true);
    expect(lit(within(phoneNav()).getByRole('link', { name: 'My work' }))).toBe(true);
    expect(lit(topLink('Members'))).toBe(false);

    cleanup();
    await renderBoth(`/w/${WS}/members/x`);
    expect(lit(topLink('Members'))).toBe(true);
    expect(lit(topLink('My Work'))).toBe(false);

    // CONTROL (same `it`): a lookalike segment lights neither surface …
    cleanup();
    await renderBoth(`/w/${WS}/my-workshop`);
    expect(lit(topLink('My Work'))).toBe(false);
    expect(lit(within(phoneNav()).getByRole('link', { name: 'My work' }))).toBe(false);
    cleanup();
    await renderBoth(`/w/${WS}/membersx`);
    expect(lit(topLink('Members'))).toBe(false);

    // … and on the workspace page itself the bar lights NOTHING (the top nav lights the workspace link, exact: 13.393).
    cleanup();
    await renderBoth(`/w/${WS}`);
    for (const link of within(phoneNav()).getAllByRole('link')) {
      expect(lit(link), link.getAttribute('aria-label') ?? link.textContent ?? '').toBe(false);
    }
    expect(lit(topLink('Convenience Corner'))).toBe(true);
  });

  it('23.044 the bar lights Notes on /notes and under it, not on a lookalike (the bar half of 18.182)', async () => {
    render(bar({ pathname: '/notes/n_1' }));
    await waitFor(() => expect(items()).toContain('Notes'));
    expect(lit(within(phoneNav()).getByRole('link', { name: 'Notes' }))).toBe(true);
    cleanup();
    render(bar({ pathname: '/notesx' }));
    await waitFor(() => expect(items()).toContain('Notes'));
    expect(lit(within(phoneNav()).getByRole('link', { name: 'Notes' }))).toBe(false);
  });
});

