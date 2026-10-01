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

/** jsdom has no `matchMedia`; `AppNav` renders the bar only when the viewport query matches. */
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
    const offered = within(edit).getAllByRole('button', { name: /^Add / });
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

describe('21.033 the script and the stylesheet name the same phone width', () => {
  it('21.033 PHONE_QUERY is the stylesheet\'s own 40rem arm, and the bottom bar\'s rules sit under it', () => {
    const css = readFileSync(resolve(__dirname, '../app/globals.css'), 'utf8');
    expect(css).toContain(`@media ${PHONE_QUERY} {`);
    // CONTROL — the bar's own box rule is drawn under THAT arm (the nearest at-rule above it), not merely under some 40rem arm.
    const rule = css.indexOf('  .gn-bottom-bar {');
    expect(rule).toBeGreaterThan(0);
    expect(css.slice(css.lastIndexOf('@media', rule)).startsWith(`@media ${PHONE_QUERY} {`)).toBe(true);
  });
});

// Keep the destinations type exercised so a renamed id fails typecheck here, not only in the store.
const _all: readonly BarDestination[] = ['board', 'my-work', 'notes', 'inbox', 'list', 'calendar', 'timeline', 'backlog', 'members'];
void _all;
void fireEvent;
