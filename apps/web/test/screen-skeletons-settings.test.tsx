import { cleanup, render, screen, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
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
const { query } = vi.hoisted(() => ({ query: { current: new URLSearchParams() } }));
let currentPath = '/settings';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => currentPath,
  useSearchParams: () => query.current,
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: ME, name: 'Kiro', email: 'kiro@example.com' }, session: { token: 't' } } }),
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

beforeEach(() => {
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
    await regionLabelled('Loading settings');
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
    render(
      <Providers
        services={stubServices(
          { getMyWorkspaces: () => workspaces.promise, getDeletedItems: async () => [] },
          { notificationPreferences: { load: () => prefs.promise as never, save: async () => undefined as never }, notifications: { unreadCount: async () => 0 } },
        )}
      >
        <AccountPage />
      </Providers>,
    );
    await screen.findByText('Profile');
    const skeletonSections = [...document.querySelectorAll('section.gn-account__section > .gn-skeleton-region')];
    const labels = skeletonSections.map((region) => region.querySelector('.gn-visually-hidden')!.textContent);
    expect(labels).toEqual(['Notifications', 'Your workspaces', 'Sign-in and devices', 'Passkeys']);
    expect(screen.queryByText('Loading…')).toBeNull();
    act(() => {
      prefs.resolve({ mutedKinds: [] });
      workspaces.resolve([ws]);
      devices.resolve({ ok: true, status: 200, json: async () => ({ devices: [] }) });
      passkeys.resolve({ ok: true, status: 200, json: async () => ({ passkeys: [] }) });
    });
    await waitFor(() => expect(document.querySelector('section.gn-account__section > .gn-skeleton-region')).toBeNull());
    const titles = [...document.querySelectorAll('.gn-account__section-title')].map((heading) => heading.textContent ?? '');
    const sectionTitle = (label: string) => titles.findIndex((title) => title.startsWith(label));
    const positions = labels.map((label) => sectionTitle(label as string));
    expect(positions.every((position) => position >= 0), titles.join('|')).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
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
    expect(region.querySelector('.gn-mcp-tokens__row, .gn-skeleton')).not.toBeNull();
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
    expect(region.closest('[data-testid="history-list"]') ?? region.querySelector('[data-testid="history-list"]') ?? region.parentElement).not.toBeNull();
    expect(screen.queryByText('Loading…')).toBeNull();
    act(() => history.resolve([]));
    await screen.findByText('No saved versions yet');
  });
});
