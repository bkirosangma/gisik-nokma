import { cleanup, render, screen, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DELETED_ITEMS_EMPTY, type WorkspaceRef } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { clearMyWorkspacesCache } from '../src/use-my-workspaces.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Smoothness T8 — Settings, Account, the MCP tokens card and the note history sheet (audit SM-09; cases 25.127, 25.128,
 * 25.131). Same shape as `screen-skeletons.test.tsx`: a held read, the screen's own container, a named busy region and no
 * sentence. The account page's sections are the interesting one: each section's skeleton is the REAL section element in its
 * final position, so the cards never reorder as the reads land (25.128).
 */
const WS = '01J9WORKSPACE0000000000000';
const ME = '01J9USER000000000000000000';
const { query, sessionState } = vi.hoisted(() => ({
  query: { current: new URLSearchParams() },
  // better-auth's useSession shape: `data` is null both while pending and when signed out; only `isPending` tells them apart.
  sessionState: { current: { data: null as unknown, isPending: false } },
}));
let currentPath = '/settings';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => currentPath,
  useSearchParams: () => query.current,
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => sessionState.current,
    signOut: async () => ({ data: {}, error: null }),
    updateUser: vi.fn(),
    passkey: { addPasskey: vi.fn(), deletePasskey: vi.fn() },
  },
}));

import SettingsPage from '../app/settings/page.js';
import AccountPage from '../app/account/page.js';
import McpTokensPage from '../app/mcp/tokens/page.js';
import { HistoryPanel } from '../src/notes/history-panel.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
const regionLabelled = async (label: string): Promise<HTMLElement> => {
  const region = (await screen.findByText(label)).parentElement!;
  expect(region).toHaveClass('gn-skeleton-region');
  expect(region).toHaveAttribute('aria-busy', 'true');
  return region;
};
const ws: WorkspaceRef = { id: WS, name: 'Convenience Corner', prefix: 'CC', role: 'owner', archived: false, memberCount: 1, nameRestrictedProjectCount: 0, projects: [] };

const SIGNED_IN = { data: { user: { id: ME, name: 'Kiro', email: 'kiro@example.com' }, session: { token: 't' } }, isPending: false };
beforeEach(() => {
  sessionState.current = SIGNED_IN;
  cleanup();
  clearMyWorkspacesCache();
  window.localStorage.clear();
  query.current = new URLSearchParams();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('25.127 Settings', () => {
  const members = async () => [{ userId: ME, displayName: 'Kiro', role: 'admin' as const }];

  it('25.127 the workspace tab and the groups tab draw a block where the form/tree will be (no sentence); the role check draws one too, until the members answer', async () => {
    query.current = new URLSearchParams({ workspaceId: WS, tab: 'workspace' });
    const settings = deferred<never>();
    render(
      <Providers services={stubServices({ getWorkspaceSettings: () => settings.promise }, { authoring: { listMembers: members } })}>
        <SettingsPage />
      </Providers>,
    );
    const form = await regionLabelled('Loading settings');
    expect(form, 'the form block is not the settings form\'s own class').toHaveClass('gn-workspace-settings');
    expect(screen.queryByText('Loading settings…')).toBeNull();
    cleanup();
    query.current = new URLSearchParams({ workspaceId: WS, tab: 'groups' });
    render(
      <Providers services={stubServices({ getGroups: () => new Promise<never[]>(() => undefined) }, { authoring: { listMembers: members } })}>
        <SettingsPage />
      </Providers>,
    );
    await regionLabelled('Loading groups');
    expect(screen.queryByText('Loading groups…')).toBeNull();
    cleanup();
    const roles = deferred<never[]>();
    render(
      <Providers services={stubServices({}, { authoring: { listMembers: () => roles.promise } })}>
        <SettingsPage />
      </Providers>,
    );
    const region = await regionLabelled('Checking what you may change in this workspace');
    expect(region.parentElement).not.toBeNull();
    expect(screen.queryByText('Checking what you may change in this workspace…')).toBeNull();
  });

  it('25.135 a refused settings read shows the refusal and no region (the wait is not the failure)', async () => {
    query.current = new URLSearchParams({ workspaceId: WS, tab: 'workspace' });
    render(
      <Providers services={stubServices({ getWorkspaceSettings: () => Promise.reject(new Error('no settings')) }, { authoring: { listMembers: members } })}>
        <SettingsPage />
      </Providers>,
    );
    await screen.findByText(/no settings/);
    expect(document.querySelector('.gn-skeleton-region')).toBeNull();
  });
});

describe('25.128 Account', () => {
  it('25.128 every section\'s skeleton is its own `section.gn-account__section`, in the FINAL order from the first frame: the skeleton labels equal the rendered titles once every read has landed', async () => {
    currentPath = '/account';
    const devices = deferred<{ ok: boolean; status: number; json: () => Promise<unknown> }>();
    const passkeys = deferred<{ ok: boolean; status: number; json: () => Promise<unknown> }>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/v1/me/devices') return devices.promise;
        if (url === '/v1/me/passkeys') return passkeys.promise;
        return { ok: false, status: 500, json: async () => ({}) };
      }),
    );
    const prefs = deferred<{ mutedKinds: string[] }>();
    const workspaces = deferred<WorkspaceRef[]>();
    const deleted = deferred<never[]>();
    render(
      <Providers
        services={stubServices(
          { getMyWorkspaces: () => workspaces.promise, getDeletedItems: () => deleted.promise },
          { notificationPreferences: { load: () => prefs.promise as never, save: async () => undefined as never }, notifications: { unreadCount: async () => 0 } },
        )}
      >
        <AccountPage />
      </Providers>,
    );
    await screen.findByText('Profile');
    const skeletonSections = [...document.querySelectorAll('section.gn-account__section > .gn-skeleton-region')];
    const labels = skeletonSections.map((region) => region.querySelector('.gn-visually-hidden')!.textContent);
    // Deleted items keeps its own heading, so its region is named for the list it reads, not for the section.
    expect(labels).toEqual(['Notifications', 'Your workspaces', 'Loading deleted items', 'Sign-in and devices', 'Passkeys']);
    expect(screen.queryByText('Loading…')).toBeNull();
    act(() => {
      deleted.resolve([]);
      prefs.resolve({ mutedKinds: [] });
      workspaces.resolve([ws]);
      devices.resolve({ ok: true, status: 200, json: async () => ({ devices: [] }) });
      passkeys.resolve({ ok: true, status: 200, json: async () => ({ passkeys: [] }) });
    });
    await waitFor(() => expect(document.querySelector('section.gn-account__section > .gn-skeleton-region')).toBeNull());
    const titles = [...document.querySelectorAll('.gn-account__section-title')].map((heading) => heading.textContent ?? '');
    const sectionTitle = (label: string) => titles.findIndex((title) => title.startsWith(label));
    const positions = labels.map((label) => sectionTitle(label === 'Loading deleted items' ? 'Deleted items' : (label as string)));
    expect(positions.every((position) => position >= 0), titles.join('|')).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
  });

  const accountFetch = (passkeysRead: () => Promise<unknown>, passkeysCalls: string[] = []) =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/v1/me/passkeys') {
          passkeysCalls.push(url);
          return passkeysRead();
        }
        if (url === '/v1/me/devices') return { ok: true, status: 200, json: async () => ({ devices: [] }) };
        return { ok: false, status: 500, json: async () => ({}) };
      }),
    );
  const emptyPasskeys = async () => ({ ok: true, status: 200, json: async () => ({ passkeys: [] }) });
  const skeletonLabels = () =>
    [...document.querySelectorAll('section.gn-account__section > .gn-skeleton-region')].map((region) => region.querySelector('.gn-visually-hidden')!.textContent);

  it('25.137 the Deleted items section draws a named busy region inside its own section while its list is read, no sentence; an answered-empty list says its empty sentence and no region', async () => {
    currentPath = '/account';
    accountFetch(emptyPasskeys);
    const deleted = deferred<never[]>();
    render(
      <Providers services={stubServices({ getDeletedItems: () => deleted.promise }, { notifications: { unreadCount: async () => 0 } })}>
        <AccountPage />
      </Providers>,
    );
    const region = await regionLabelled('Loading deleted items');
    const section = region.closest('section.gn-deleted-items') as HTMLElement | null;
    expect(section).not.toBeNull();
    expect(section!.querySelector('.gn-account__section-title')!.textContent).toBe('Deleted items');
    expect(section!.textContent).not.toMatch(/Loading…/);
    // control: an answered-empty list says its empty sentence and leaves no region behind
    act(() => deleted.resolve([]));
    await screen.findByText(DELETED_ITEMS_EMPTY);
    expect(section!.querySelector('.gn-skeleton-region')).toBeNull();
    expect(screen.queryByText('Loading deleted items')).toBeNull();
  });

  it('25.128 a SIGNED-OUT visitor never gets a Passkeys skeleton (no read is ever made), even after the other reads land', async () => {
    currentPath = '/account';
    const passkeysCalls: string[] = [];
    accountFetch(emptyPasskeys, passkeysCalls);
    sessionState.current = { data: null, isPending: false };
    const prefs = deferred<{ mutedKinds: string[] }>();
    render(
      <Providers
        services={stubServices(
          { getMyWorkspaces: async () => [ws] },
          { notificationPreferences: { load: () => prefs.promise as never, save: async () => undefined as never }, notifications: { unreadCount: async () => 0 } },
        )}
      >
        <AccountPage />
      </Providers>,
    );
    await waitFor(() => expect(skeletonLabels()).toContain('Notifications'));
    expect(skeletonLabels()).not.toContain('Passkeys');
    act(() => prefs.resolve({ mutedKinds: [] }));
    await waitFor(() => expect(skeletonLabels()).toEqual([]));
    expect(screen.queryByText('Loading deleted items')).toBeNull();
    expect(passkeysCalls).toEqual([]);
  });

  it('25.128 while the SESSION is still pending the Passkeys skeleton is already there in the FIRST frame, right after Sign-in and devices; the user landing keeps the one skeleton in its slot', async () => {
    currentPath = '/account';
    const passkeysCalls: string[] = [];
    accountFetch(() => new Promise(() => undefined), passkeysCalls);
    sessionState.current = { data: null, isPending: true };
    const services = stubServices(
      { getMyWorkspaces: () => new Promise<never[]>(() => undefined) },
      { notificationPreferences: { load: () => new Promise(() => undefined) as never, save: async () => undefined as never }, notifications: { unreadCount: async () => 0 } },
    );
    const view = render(
      <Providers services={services}>
        <AccountPage />
      </Providers>,
    );
    // the first frame: the session has not answered, no read has landed
    expect(skeletonLabels().filter((label) => label === 'Passkeys')).toHaveLength(1);
    const sections = [...document.querySelectorAll('section.gn-account__section')];
    const passkeysSection = sections.find((section) => section.querySelector('.gn-skeleton-region .gn-visually-hidden')?.textContent === 'Passkeys')!;
    expect(passkeysSection.previousElementSibling!.querySelector('.gn-visually-hidden')!.textContent).toBe('Sign-in and devices');
    expect(passkeysCalls).toEqual([]);
    // control: the user lands; the read starts and the skeleton is still the one in that slot
    sessionState.current = SIGNED_IN;
    view.rerender(
      <Providers services={services}>
        <AccountPage />
      </Providers>,
    );
    await waitFor(() => expect(passkeysCalls).toEqual(['/v1/me/passkeys']));
    expect(skeletonLabels().filter((label) => label === 'Passkeys')).toHaveLength(1);
  });
});

describe('25.131 the small lists (MCP tokens, note history)', () => {
  it('25.131 the MCP tokens card holds rows in its own list classes while the list is read, and its "Checking your session…" is a block', async () => {
    currentPath = '/mcp/tokens';
    const read = deferred<{ ok: boolean; status: number; json: () => Promise<unknown> }>();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url === '/v1/me/mcp-tokens' ? read.promise : { ok: true, status: 200, json: async () => ({ connections: [], url: null }) })),
    );
    render(
      <Providers services={stubServices({}, { notifications: { unreadCount: async () => 0 } })}>
        <McpTokensPage />
      </Providers>,
    );
    const region = await regionLabelled('Loading your connected assistants');
    expect(region.querySelectorAll('ul.gn-mcp-tokens__list > li.gn-mcp-tokens__row').length, 'the region does not hold the card\'s own list and rows').toBeGreaterThanOrEqual(1);
    expect(screen.queryByTestId('mcp-tokens-loading')).toBeNull();
    act(() => read.resolve({ ok: true, status: 200, json: async () => ({ tokens: [] }) }));
    await waitFor(() => expect(screen.queryByText('Loading your connected assistants')).toBeNull());
  });

  it('25.131 the note history sheet draws rows in its own list while the versions are read', async () => {
    currentPath = '/notes';
    const history = deferred<never[]>();
    render(
      <Providers services={stubServices({ getNoteHistory: () => history.promise } as never)}>
        <HistoryPanel open workspaceId={WS} noteId="01J9NOTE" canEdit nameOf={(id: string) => id} onRestore={() => undefined} onClose={() => undefined} />
      </Providers>,
    );
    const region = await regionLabelled('Loading history');
    expect(region.tagName, 'the history region is not a list item').toBe('LI');
    expect(region.parentElement).toBe(screen.getByTestId('history-list'));
    expect(screen.queryByText('Loading…')).toBeNull();
    act(() => history.resolve([]));
    await screen.findByText('No saved versions yet');
  });
});
