import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectRef, WorkspaceRef } from '@gisik-nokma/app-core';
import { parseRules, ruleExactly, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { readGlobalsCss } from '../../../packages/ui/test/helpers/style-patterns.js';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * U-T14 — the nav's hover dropdowns (cases 23.250–23.257; owner 2026-10-02).
 *
 * Owner, verbatim: *"the last project dropdown. shows the list on hover, but when trying to move down to the list it
 * disappears as soon as it leaves the button area, unless the project is already opened and the nav button is clicked
 * first."* and *"make the dropdown list fixed height and scrollable"* and *"have the same dropdown for workspace
 * selection as well"*.
 *
 * **What jsdom can and cannot prove here.** It has no layout, so the GAP CROSSING (23.250, 23.255) and the HEIGHT CAP
 * (23.253, 23.256) are pinned twice: the CSS declarations that produce them are asserted from `globals.css` below, and
 * the real thing was measured in Chrome on a lane port with a stepped pointer (the numbers are in the case lines of
 * `test-cases/23-ux-fixes.md`). What jsdom CAN prove — the timing, the cancel, the focus guard, which rows exist — is
 * driven through real `userEvent` pointer events, never dispatched synthetically.
 */

let currentPath = '/workspaces';
const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  useParams: () => ({}),
  usePathname: () => currentPath,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { AppNav } from '../src/app-nav.js';
import { NAV_MENU_CLOSE_DELAY_MS } from '../src/nav-hover-menu.js';
import { clearLastWorkspaceCache } from '../src/use-last-workspace.js';
import { clearLastProjectCache, LAST_PROJECT_KEY } from '../src/use-last-project.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { clearWorkspaceProjectsCache } from '../src/use-workspace-projects.js';
import { clearMyWorkspacesCache } from '../src/use-my-workspaces.js';

const css = readGlobalsCss();

beforeAll(() => {
  // The harness stands in for `next/link`'s own `preventDefault` (see `last-project-nav.test.tsx`).
  document.addEventListener(
    'click',
    (event) => {
      if ((event.target as Element | null)?.closest('a') !== null) event.preventDefault();
    },
    { capture: true },
  );
});

beforeEach(() => {
  window.localStorage.clear();
  clearLastWorkspaceCache();
  clearLastProjectCache();
  clearWorkspaceNameCache();
  clearWorkspaceProjectsCache();
  clearMyWorkspacesCache();
  currentPath = '/w/ws_1';
});
afterEach(cleanup);

/**
 * `getMyWorkspaces` reads one bar mount sends. ONE, since smoothness T4 (case 25.041). It was three: the workspace name
 * (`useWorkspaceLookup`), Last project's list (`useWorkspaceProjects` in `LastProjectNav`) and the phone switcher's
 * (`useWorkspaceProjects` in `PhoneSwitcher`, mounted but hidden above 40rem). All three now read the rows through
 * `useMyWorkspaces`, which makes the request once per person per page. The workspace dropdown still adds NONE.
 */
const BAR_MOUNT_READS = 1;
const sleep = (ms: number) => new Promise<void>((settle) => setTimeout(settle, ms));

function project(over: Partial<ProjectRef> & { id: string }): ProjectRef {
  return { name: `Project ${over.id}`, prefix: 'PJ', archived: false, ticketCount: 0, blockedCount: 0, ...over };
}

function workspace(over: Partial<WorkspaceRef> & { id: string }): WorkspaceRef {
  return {
    name: `Workspace ${over.id}`,
    prefix: 'WS',
    role: 'owner',
    archived: false,
    memberCount: 3,
    nameRestrictedProjectCount: 0,
    projects: [],
    ...over,
  };
}

function servicesFor(refs: WorkspaceRef[] | (() => Promise<WorkspaceRef[]>)) {
  return stubServices(
    { getMyWorkspaces: typeof refs === 'function' ? refs : async () => refs },
    { notifications: { unreadCount: async () => 0 } },
  );
}

function renderBar(services: ReturnType<typeof stubServices>) {
  return render(
    <Providers services={services}>
      <AppNav workspaceId="ws_1" />
    </Providers>,
  );
}

/** ws_1 holds two live projects; `p_two` is remembered so the Last project item names it. */
const WS_1 = workspace({
  id: 'ws_1',
  name: 'Convenience Corner',
  projects: [project({ id: 'p_one', name: 'One' }), project({ id: 'p_two', name: 'Two' })],
});

function rememberTwo(): void {
  window.localStorage.setItem(
    LAST_PROJECT_KEY,
    JSON.stringify({ userId: 'u_kiro', workspaceId: 'ws_1', projectId: 'p_two' }),
  );
}

const projectTrigger = () => screen.findByRole('link', { name: 'Two, projects menu' });
const workspaceTrigger = () => screen.findByRole('link', { name: 'Convenience Corner' });

/** The bar with a project menu of `count` live projects, the last one remembered. */
function manyProjects(count: number): WorkspaceRef {
  const projects = Array.from({ length: count }, (_, i) => project({ id: `p_${i + 1}`, name: `Project ${i + 1}` }));
  return workspace({ id: 'ws_1', name: 'Convenience Corner', projects });
}

describe('23.250 the list is reachable: the gap is part of the item (owner bug 2026-10-02)', () => {
  it('23.250 the 0.5rem strip is the list’s own padding, so the pointer never leaves; the account menu is untouched', async () => {
    rememberTwo();
    const { container } = renderBar(servicesFor([WS_1]));
    const trigger = await projectTrigger();
    await userEvent.hover(trigger);
    const menu = await screen.findByRole('menu', { name: 'Projects' });

    // The list is a DESCENDANT of the same wrapper that listens for the pointer, and its first row is inside it.
    const wrapper = container.querySelector('.gn-nav__project') as HTMLElement;
    expect(wrapper.contains(menu)).toBe(true);
    expect(menu).toHaveClass('gn-nav__menu--hover');
    expect(within(menu).getAllByRole('menuitem')[0]?.closest('.gn-nav__menu-panel')).not.toBeNull();

    // The bridge: anchored at the item's bottom edge (no uncovered strip), the 0.5rem moved INTO the box as transparent
    // padding, and the visible card is the inner panel (so the card sits where it did).
    const hover = ruleExactly(css, '.gn-nav__menu--hover');
    expect(valueOf(hover, 'top')).toBe('100%');
    expect(valueOf(hover, 'padding')).toBe('0.5rem 0 0');
    expect(valueOf(hover, 'background')).toBe('transparent');
    expect(valueOf(hover, 'box-shadow')).toBe('none');
    const panel = ruleExactly(css, '.gn-nav__menu-panel');
    expect(valueOf(panel, 'background')).toBe('var(--gn-surface-raised)');
    // N7 (2026-10-02, 24.083): a floating panel reads `near-lg` (hig/minimal: = `lift-near`).
    expect(valueOf(panel, 'box-shadow')).toBe('var(--gn-shadow-near-lg)');

    // CONTROL (same `it`): the account menu keeps the shared rule — same offset, same card — and is still click-only.
    cleanup();
    const bar = renderBar(servicesFor([WS_1]));
    const account = await screen.findByRole('button', { name: /Account menu/ });
    const plain = ruleExactly(css, '.gn-nav__menu');
    expect(valueOf(plain, 'top')).toBe('calc(100% + 0.5rem)');
    expect(valueOf(plain, 'padding')).toBe('0.375rem');
    expect(valueOf(plain, 'max-height')).toBeNull();
    await userEvent.hover(account);
    await sleep(50);
    expect(screen.queryByRole('menu', { name: 'Account' })).toBeNull();
    await userEvent.click(account);
    const accountMenu = await screen.findByRole('menu', { name: 'Account' });
    expect(accountMenu).not.toHaveClass('gn-nav__menu--hover');
    bar.unmount();
  });
});

describe('23.251 / 23.252 the close delay', () => {
  it('23.251 the pointer leaving (away) closes it after the delay, inside 300 ms, not before', async () => {
    rememberTwo();
    renderBar(servicesFor([WS_1]));
    const trigger = await projectTrigger();
    await userEvent.hover(trigger);
    await screen.findByRole('menu', { name: 'Projects' });

    const left = performance.now();
    await userEvent.unhover(trigger);
    // Not at once: the delay is what forgives a diagonal path.
    expect(screen.queryByRole('menu', { name: 'Projects' })).not.toBeNull();
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Projects' })).toBeNull(), { timeout: 400 });
    expect(performance.now() - left).toBeLessThan(300);
    expect(NAV_MENU_CLOSE_DELAY_MS).toBeGreaterThanOrEqual(150);
    expect(NAV_MENU_CLOSE_DELAY_MS).toBeLessThanOrEqual(250);
  });

  it('23.252 leave and re-enter inside the delay: it never closes (aria-expanded stays true)', async () => {
    rememberTwo();
    renderBar(servicesFor([WS_1]));
    const trigger = await projectTrigger();
    await userEvent.hover(trigger);
    await screen.findByRole('menu', { name: 'Projects' });

    // Record EVERY change of aria-expanded, so a close-then-reopen flicker is visible even though the end state is open.
    const seen: string[] = [];
    const observer = new MutationObserver(() => seen.push(trigger.getAttribute('aria-expanded') ?? ''));
    observer.observe(trigger, { attributes: true, attributeFilter: ['aria-expanded'] });

    await userEvent.unhover(trigger);
    await sleep(NAV_MENU_CLOSE_DELAY_MS / 2);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('menu', { name: 'Projects' })).not.toBeNull();
    await userEvent.hover(trigger);
    // Past the original deadline: the cancelled timer must not fire.
    await sleep(NAV_MENU_CLOSE_DELAY_MS * 2);
    observer.disconnect();

    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('menu', { name: 'Projects' })).not.toBeNull();
    expect(seen).toEqual([]);
  });

  it('23.252 a pointer leaving never closes a list a keyboard user is inside (the timer re-checks focus)', async () => {
    rememberTwo();
    renderBar(servicesFor([WS_1]));
    const trigger = await projectTrigger();
    await userEvent.hover(trigger);
    await act(async () => trigger.focus());
    await userEvent.unhover(trigger);
    await sleep(NAV_MENU_CLOSE_DELAY_MS * 2);
    expect(screen.queryByRole('menu', { name: 'Projects' })).not.toBeNull();
  });

  it('23.252 the pointer leaving with the focus OUTSIDE, then focus arriving inside the delay: the list the reader just focused stays open (the timer re-checks focus)', async () => {
    rememberTwo();
    renderBar(servicesFor([WS_1]));
    const trigger = await projectTrigger();
    await userEvent.hover(trigger);
    const menu = await screen.findByRole('menu', { name: 'Projects' });
    const row = within(menu).getAllByRole('menuitem')[0] as HTMLElement;
    // The pointer leaves with focus nowhere near the item, so the leave guard lets the timer start …
    expect(document.body).toHaveFocus();
    await userEvent.unhover(trigger);
    // … and before it fires, focus arrives on a ROW (a Tab from the trigger, or a script). A row has no focus handler of
    // its own, so only the timer's re-check keeps the list the reader just focused open.
    await act(async () => row.focus());
    await sleep(NAV_MENU_CLOSE_DELAY_MS * 2);
    expect(row).toHaveFocus();
    expect(screen.queryByRole('menu', { name: 'Projects' })).not.toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // CONTROL (same `it`): focus onto the TRIGGER inside the delay also keeps it open — there `onFocus` cancels the timer
    // outright (so this half cannot judge the re-check; the row half above does).
    await act(async () => (document.activeElement as HTMLElement).blur());
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Projects' })).toBeNull());
    await userEvent.hover(trigger);
    await screen.findByRole('menu', { name: 'Projects' });
    await userEvent.unhover(trigger);
    await act(async () => trigger.focus());
    await sleep(NAV_MENU_CLOSE_DELAY_MS * 2);
    expect(screen.queryByRole('menu', { name: 'Projects' })).not.toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });

  it('23.252 unmount with a close pending raises no error', async () => {
    rememberTwo();
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const { unmount } = renderBar(servicesFor([WS_1]));
    const trigger = await projectTrigger();
    await userEvent.hover(trigger);
    await screen.findByRole('menu', { name: 'Projects' });
    await userEvent.unhover(trigger);
    unmount();
    await sleep(NAV_MENU_CLOSE_DELAY_MS * 2);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe('23.253 the list is a fixed height and scrolls', () => {
  it('23.253 the cap is 8 rows or the window, the panel scrolls inside, and scrolling never closes it; a short list is its own height', async () => {
    window.localStorage.setItem(
      LAST_PROJECT_KEY,
      JSON.stringify({ userId: 'u_kiro', workspaceId: 'ws_1', projectId: 'p_20' }),
    );
    renderBar(servicesFor([manyProjects(20)]));
    const trigger = await screen.findByRole('link', { name: 'Project 20, projects menu' });
    await userEvent.hover(trigger);
    const menu = await screen.findByRole('menu', { name: 'Projects' });
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(20);

    // The cap: 8 rows of 2.75rem plus the panel's 0.375rem padding twice (22.75rem) plus the 0.5rem bridge = 23.25rem,
    // and never taller than the window less the bar and 1rem.
    const hover = ruleExactly(css, '.gn-nav__menu--hover');
    expect(valueOf(hover, 'max-height')).toBe('min(23.25rem, calc(100dvh - var(--app-nav-offset, 0px) - 1rem))');
    expect(23.25 - 0.5 - 2 * 0.375).toBe(8 * 2.75);
    const panel = ruleExactly(css, '.gn-nav__menu-panel');
    expect(valueOf(panel, 'overflow-y')).toBe('auto');
    expect(valueOf(panel, 'overscroll-behavior')).toBe('contain');
    expect(valueOf(panel, 'min-height')).toBe('0');
    expect(valueOf(panel, 'flex')).toBe('1 1 auto');
    // Rows must not be squeezed to fit the cap: they overflow and scroll instead.
    expect(valueOf(ruleExactly(css, '.gn-nav__menu-panel > *'), 'flex')).toBe('none');
    // CONTROL: the account menu has no cap and no scroller of its own.
    expect(valueOf(ruleExactly(css, '.gn-nav__menu'), 'overflow-y')).toBeNull();

    // Scrolling inside it — wheel, scroll, scrollbar — is inside the wrapper and never closes it, even past the delay.
    const scroller = menu.querySelector('.gn-nav__menu-panel') as HTMLElement;
    fireEvent.wheel(scroller, { deltaY: 400 });
    fireEvent.scroll(scroller);
    await sleep(NAV_MENU_CLOSE_DELAY_MS * 2);
    expect(screen.queryByRole('menu', { name: 'Projects' })).not.toBeNull();
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    // Keyboard: Arrow keys walk the rows (focus() scrolls a row into view inside the scroller), wrapping at the end.
    await act(async () => trigger.focus());
    const rows = within(menu).getAllByRole('menuitem');
    await userEvent.keyboard('{ArrowDown}');
    expect(rows[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowUp}');
    expect(rows[19]).toHaveFocus();

    // CONTROL: three projects render three rows and the same rules — the panel is only as tall as its rows.
    cleanup();
    window.localStorage.clear();
    clearWorkspaceProjectsCache();
    clearLastProjectCache();
    window.localStorage.setItem(
      LAST_PROJECT_KEY,
      JSON.stringify({ userId: 'u_kiro', workspaceId: 'ws_1', projectId: 'p_3' }),
    );
    renderBar(servicesFor([manyProjects(3)]));
    await userEvent.hover(await screen.findByRole('link', { name: 'Project 3, projects menu' }));
    const short = await screen.findByRole('menu', { name: 'Projects' });
    expect(within(short).getAllByRole('menuitem')).toHaveLength(3);
    // No `height`, `min-height` or padding rows anywhere in the rules: the height is `max-height` only.
    expect(valueOf(hover, 'height')).toBeNull();
    expect(valueOf(hover, 'min-height')).toBeNull();
    expect(valueOf(panel, 'height')).toBeNull();
  });
});

describe('23.254–23.257 the workspace name opens the same dropdown', () => {
  const LIVE_3 = [
    workspace({ id: 'ws_1', name: 'Convenience Corner' }),
    workspace({ id: 'ws_2', name: 'Second Shop' }),
    workspace({ id: 'ws_3', name: 'Third Shop' }),
    workspace({ id: 'ws_old', name: 'Mothballed', archived: true }),
  ];

  it('23.254 hover opens a list of the OTHER live workspaces, and each row goes to its home; a click on the name still goes home', async () => {
    renderBar(servicesFor(LIVE_3));
    const name = await workspaceTrigger();
    expect(name).toHaveAttribute('href', '/w/ws_1');
    await waitFor(() => expect(name).toHaveAttribute('aria-haspopup', 'menu'));
    expect(screen.queryByRole('menu', { name: 'Workspaces' })).toBeNull();

    await userEvent.hover(name);
    const menu = await screen.findByRole('menu', { name: 'Workspaces' });
    const rows = within(menu).getAllByRole('menuitem');
    // The current workspace is the name beside it, so it is absent; the archived one is not somewhere to go.
    expect(rows.map((row) => row.textContent)).toEqual(['Second Shop', 'Third Shop']);
    expect(rows.map((row) => row.getAttribute('href'))).toEqual(['/w/ws_2', '/w/ws_3']);
    expect(menu).toHaveClass('gn-nav__menu--hover');
    expect(menu.closest('.gn-nav__workspace-group')).not.toBeNull();

    // The separate Workspaces link is untouched.
    expect(screen.getByRole('link', { name: 'Workspaces' })).toHaveAttribute('href', '/workspaces');
    // The Last project item is a SIBLING, not inside the workspace group.
    expect(name.closest('.gn-nav__workspace-group')?.querySelector('.gn-nav__project')).toBeNull();
  });

  it('23.254 ONE getMyWorkspaces read per bar feeds both the name and the dropdown rows; a refused read gives neither', async () => {
    let calls = 0;
    renderBar(
      servicesFor(async () => {
        calls += 1;
        return LIVE_3;
      }),
    );
    const name = await workspaceTrigger();
    await waitFor(() => expect(name).toHaveAttribute('aria-haspopup', 'menu'));
    await userEvent.hover(name);
    const menu = await screen.findByRole('menu', { name: 'Workspaces' });
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(2);
    // The dropdown's rows came from the shared read: a second request for them would make this 2.
    expect(calls).toBe(BAR_MOUNT_READS);

    // CONTROL (same `it`): a refused read gives no name and no list.
    cleanup();
    clearWorkspaceNameCache();
    renderBar(
      servicesFor(async () => {
        throw new Error('refused');
      }),
    );
    await sleep(50);
    expect(screen.queryByRole('link', { name: 'Convenience Corner' })).toBeNull();
    expect(screen.queryByRole('menu', { name: 'Workspaces' })).toBeNull();
  });

  it('23.254 the row of the page you are on is marked aria-current', async () => {
    currentPath = '/w/ws_2';
    renderBar(servicesFor(LIVE_3));
    await userEvent.hover(await workspaceTrigger());
    const menu = await screen.findByRole('menu', { name: 'Workspaces' });
    expect(within(menu).getByRole('menuitem', { name: 'Second Shop' })).toHaveAttribute('aria-current', 'page');
    expect(within(menu).getByRole('menuitem', { name: 'Third Shop' })).not.toHaveAttribute('aria-current');
  });

  it('23.255 the same bridge and the same delay: the list is inside the wrapper, and leaving closes it after the delay, re-entering keeps it', async () => {
    renderBar(servicesFor(LIVE_3));
    const name = await workspaceTrigger();
    await waitFor(() => expect(name).toHaveAttribute('aria-haspopup', 'menu'));
    await userEvent.hover(name);
    const menu = await screen.findByRole('menu', { name: 'Workspaces' });
    // One wrapper listens for the pointer and contains BOTH, so crossing from the name into the list stays inside it.
    expect(menu.parentElement).toBe(name.parentElement);

    await userEvent.unhover(name);
    await sleep(NAV_MENU_CLOSE_DELAY_MS / 2);
    expect(screen.queryByRole('menu', { name: 'Workspaces' })).not.toBeNull();
    await userEvent.hover(name);
    await sleep(NAV_MENU_CLOSE_DELAY_MS * 2);
    expect(screen.queryByRole('menu', { name: 'Workspaces' })).not.toBeNull();

    await userEvent.unhover(name);
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Workspaces' })).toBeNull(), { timeout: 400 });
  });

  it('23.256 with 20 workspaces the list is the capped scroller; with ONE there is no dropdown and no aria-haspopup', async () => {
    const twenty = [
      workspace({ id: 'ws_1', name: 'Convenience Corner' }),
      ...Array.from({ length: 20 }, (_, i) => workspace({ id: `ws_x${i + 1}`, name: `Shop ${i + 1}` })),
    ];
    renderBar(servicesFor(twenty));
    const name = await workspaceTrigger();
    await waitFor(() => expect(name).toHaveAttribute('aria-haspopup', 'menu'));
    await userEvent.hover(name);
    const menu = await screen.findByRole('menu', { name: 'Workspaces' });
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(20);
    // The very rules 23.253 pins on the project list, on the very same classes.
    expect(menu).toHaveClass('gn-nav__menu--hover');
    expect(menu.querySelector('.gn-nav__menu-panel')).not.toBeNull();
    expect(valueOf(ruleExactly(css, '.gn-nav__menu--hover'), 'max-height')).toContain('23.25rem');
    expect(valueOf(ruleExactly(css, '.gn-nav__menu-panel'), 'overflow-y')).toBe('auto');

    // CONTROL (same `it`): one workspace — and, separately, only archived others — is the plain link it always was.
    for (const only of [[twenty[0] as WorkspaceRef], [twenty[0] as WorkspaceRef, workspace({ id: 'ws_old', archived: true })]]) {
      cleanup();
      clearWorkspaceNameCache();
      renderBar(servicesFor(only));
      const plain = await workspaceTrigger();
      await sleep(30);
      expect(plain).not.toHaveAttribute('aria-haspopup');
      expect(plain).not.toHaveAttribute('aria-expanded');
      await userEvent.hover(plain);
      await sleep(30);
      expect(screen.queryByRole('menu', { name: 'Workspaces' })).toBeNull();
      expect(plain).toHaveAttribute('href', '/w/ws_1');
    }
  });

  it('23.256 a refused read of the workspaces is omission: no name, no list, nothing guessed', async () => {
    renderBar(
      servicesFor(async () => {
        throw new Error('refused');
      }),
    );
    await sleep(50);
    expect(screen.queryByRole('link', { name: 'Convenience Corner' })).toBeNull();
    expect(screen.queryByRole('menu', { name: 'Workspaces' })).toBeNull();
    expect(document.querySelector('.gn-nav__workspace-group')).toBeNull();
  });

  it('23.257 keyboard: focus opens it, arrows move between rows, Escape closes it and keeps focus on the name', async () => {
    renderBar(servicesFor(LIVE_3));
    const name = await workspaceTrigger();
    await waitFor(() => expect(name).toHaveAttribute('aria-haspopup', 'menu'));

    await act(async () => name.focus());
    const menu = await screen.findByRole('menu', { name: 'Workspaces' });
    // Focus stays on the name: tabbing through the nav must not swallow you.
    expect(name).toHaveFocus();
    const rows = within(menu).getAllByRole('menuitem');
    await userEvent.keyboard('{ArrowDown}');
    expect(rows[0]).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(rows[1]).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}');
    expect(rows[0]).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Workspaces' })).toBeNull());
    expect(name).toHaveFocus();
    // Escape's own focus call must not reopen it.
    await sleep(NAV_MENU_CLOSE_DELAY_MS);
    expect(screen.queryByRole('menu', { name: 'Workspaces' })).toBeNull();
    expect(name).toHaveAttribute('aria-expanded', 'false');

    // And leaving by Tab (focus out of the group) closes it.
    await act(async () => name.blur());
    await act(async () => name.focus());
    await screen.findByRole('menu', { name: 'Workspaces' });
    await act(async () => (document.activeElement as HTMLElement).blur());
    await waitFor(() => expect(screen.queryByRole('menu', { name: 'Workspaces' })).toBeNull());
  });
});

describe('U-T14 the two menus are ONE component', () => {
  it('23.254 both wrappers render through nav-hover-menu.tsx, so a fix to one is a fix to both', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const read = (file: string) => readFileSync(resolve(__dirname, '../src', file), 'utf8');
    expect(read('app-nav.tsx')).toContain('<NavHoverMenu');
    expect(read('last-project-nav.tsx')).toContain('<NavHoverMenu');
    // Neither re-implements the pointer, focus or Escape handling.
    for (const file of ['app-nav.tsx', 'last-project-nav.tsx']) {
      const source = read(file);
      expect(source, file).not.toMatch(/onMouseLeave|onMouseEnter|suppressNextFocusOpen/);
    }
    expect(parseRules(css).some((rule) => rule.selectors.includes('.gn-nav__menu--hover'))).toBe(true);
  });
});
