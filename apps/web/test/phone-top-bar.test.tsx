import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectRef, WorkspaceRef } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * The web app on phones, Plan Task 2 — the component half of cases 21.010–21.011 and 21.015.
 * (The CSS half, 21.012/21.013, is `packages/ui/test/phone-top-bar-css.test.ts`: the rule-reading
 * helpers it needs live in the ui package's test folder, beside every other styling case.)
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
import { clearLastProjectCache } from '../src/use-last-project.js';
import { clearLastWorkspaceCache } from '../src/use-last-workspace.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { clearWorkspaceProjectsCache } from '../src/use-workspace-projects.js';

function workspace(over: Partial<WorkspaceRef> & { id: string }): WorkspaceRef {
  return { name: 'Convenience Corner', prefix: 'CC', role: 'owner', archived: false, memberCount: 3, nameRestrictedProjectCount: 0, projects: [], ...over };
}
function project(over: Partial<ProjectRef> & { id: string }): ProjectRef {
  return { name: `Project ${over.id}`, prefix: 'PJ', archived: false, ticketCount: 0, blockedCount: 0, ...over };
}
function servicesOf(rows: WorkspaceRef[]) {
  return stubServices({ getMyWorkspaces: async () => rows }, { notifications: { unreadCount: async () => 0 } });
}

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  clearLastWorkspaceCache();
  clearWorkspaceNameCache();
  clearLastProjectCache();
  clearWorkspaceProjectsCache();
  mockSessionUser = { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' };
  currentPath = '/workspaces';
  currentParams = {};
});

describe('21.010 the switcher with no workspace chosen', () => {
  it('21.010 reads "Choose a workspace" and its sheet lists the person\'s workspaces; the scope note is still in the DOM; archived workspaces are not listed', async () => {
    const user = userEvent.setup();
    render(
      <Providers services={servicesOf([workspace({ id: 'w1' }), workspace({ id: 'w2', name: 'Old shop', archived: true })])}>
        <AppNav />
      </Providers>,
    );
    const button = await screen.findByRole('button', { name: 'Choose a workspace' });
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    await user.click(button);
    const sheet = await screen.findByRole('dialog', { name: 'Choose a workspace' });
    const link = await within(sheet).findByRole('link', { name: 'Convenience Corner' });
    expect(link.getAttribute('href')).toBe('/w/w1');
    expect(within(sheet).queryByRole('link', { name: 'Old shop' })).toBeNull();
    expect(within(sheet).getByRole('link', { name: 'All workspaces' }).getAttribute('href')).toBe('/workspaces');
    // CONTROL — 13.391's subject still renders for the desktop bar (CSS hides it at ≤40rem), and the
    // switcher does not carry the sentence.
    expect(screen.getByText(/No workspace selected. Pick one/)).toBeTruthy();
    expect(button.textContent).not.toMatch(/No workspace selected/);
  });
});

describe('21.011 the switcher inside a project', () => {
  it('21.011 reads "<project>, <workspace>"; its sheet marks the current project aria-current and omits an archived one', async () => {
    const user = userEvent.setup();
    currentPath = '/w/w1/p/p1';
    currentParams = { workspaceId: 'w1', projectId: 'p1' };
    render(
      <Providers
        services={servicesOf([
          workspace({ id: 'w1', projects: [project({ id: 'p1', name: 'Shop operations' }), project({ id: 'p2', name: 'Stockroom' }), project({ id: 'p3', name: 'Old', archived: true })] }),
        ])}
      >
        <AppNav workspaceId="w1" />
      </Providers>,
    );
    const button = await screen.findByRole('button', { name: 'Shop operations, Convenience Corner' });
    await user.click(button);
    const sheet = await screen.findByRole('dialog', { name: 'Shop operations, Convenience Corner' });
    const current = within(sheet).getByRole('link', { name: 'Shop operations' });
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(current.getAttribute('href')).toBe('/w/w1/p/p1');
    // CONTROL — another live project is listed and is NOT marked current; an archived one is not listed.
    const other = within(sheet).getByRole('link', { name: 'Stockroom' });
    expect(other.getAttribute('aria-current')).toBeNull();
    expect(within(sheet).queryByRole('link', { name: 'Old' })).toBeNull();
  });
});

describe('21.015 signed out', () => {
  it('21.015 no switcher and no phone-hidden link group: Help and Sign in stay reachable at every width', async () => {
    mockSessionUser = null;
    currentPath = '/help';
    const { container } = render(
      <Providers services={servicesOf([])}>
        <AppNav />
      </Providers>,
    );
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeTruthy();
    expect(container.querySelector('.gn-phone-switcher')).toBeNull();
    expect(container.querySelector('.gn-nav__links--member')).toBeNull();
    expect(container.querySelector('.gn-nav__links')).not.toBeNull();

    // CONTROL — the same bar, signed in, DOES carry the switcher and the hideable member group, so the
    // absences above are the session's doing and not a selector that matches nothing.
    cleanup();
    mockSessionUser = { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' };
    const signedIn = render(
      <Providers services={servicesOf([])}>
        <AppNav />
      </Providers>,
    );
    await waitFor(() => expect(signedIn.container.querySelector('.gn-phone-switcher')).not.toBeNull());
    expect(signedIn.container.querySelector('.gn-nav__links--member')).not.toBeNull();
  });
});
