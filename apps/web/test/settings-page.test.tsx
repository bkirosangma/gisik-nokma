import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceMember } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * The ticket-type editor is inlined on `/settings` (owner feedback,
 * 2026-09-09: "the ticket type edit is opening in a separate route. it
 * should open directly in the same route, same as the prototype").
 *
 * Two things a looser check would miss:
 *
 * - "the editor appears" is true on a separate route too — the assertion
 *   that actually discriminates is the PUSHED URL's pathname staying at
 *   `/settings`, and the rendered sidebar (`nav[aria-label="Settings
 *   sections"]`) staying mounted alongside the form.
 * - `typeId` is a THIRD query param layered under `tab=ticket-types`
 *   (`app/settings/page.tsx`'s own docblock on `typeEditHref`), read only
 *   inside that tab's branch so the Workflows/MCP tokens sidebar links can
 *   never resurrect a stale editor. The last case here pins that directly:
 *   a `typeId` left over in the query is inert on any other tab.
 */

const push = vi.fn();
const WORKSPACE = '01J9WORKSPACE0000000000000';
const ME = '01J9USER000000000000000000';

const { query } = vi.hoisted(() => ({ query: { current: new URLSearchParams() } }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/settings',
  useSearchParams: () => query.current,
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: ME, name: 'Anselma Marak' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import SettingsPage from '../app/settings/page.js';

function rosterWhereIAm(role: WorkspaceMember['role']): WorkspaceMember[] {
  return [{ userId: ME, displayName: 'Anselma Marak', role }];
}

const TYPES = [{ id: 'defect', name: 'Defect', icon: 'flag', rank: 2, workflowId: 'wf-1', fields: [] }];
const WORKFLOWS = [
  { id: 'wf-1', version: 1, name: 'Delivery v4', initialStateId: 's1', states: [], transitions: [] },
];

function setQuery(pairs: Record<string, string>): void {
  query.current = new URLSearchParams(pairs);
}

afterEach(() => {
  push.mockClear();
  query.current = new URLSearchParams();
});

describe('the ticket-type editor is inlined on /settings, not a separate route', () => {
  it('clicking Edit on a ticket type pushes a URL that stays on /settings and carries typeId', async () => {
    setQuery({ workspaceId: WORKSPACE, tab: 'ticket-types' });
    render(
      <Providers
        services={stubServices(
          {},
          {
            authoring: {
              listMembers: async () => rosterWhereIAm('admin'),
              listTicketTypes: async () => TYPES,
              listWorkflows: async () => WORKFLOWS,
            },
          },
        )}
      >
        <SettingsPage />
      </Providers>,
    );

    const editButton = await screen.findByRole('button', { name: 'Edit Defect' });
    await userEvent.click(editButton);

    expect(push).toHaveBeenCalledTimes(1);
    const pushed = new URL(String(push.mock.calls[0]?.[0]), 'https://example.test');
    // The assertion that DISCRIMINATES: "an editor appeared somewhere" would
    // pass just as well against the old separate-route push. Staying on this
    // pathname is the actual fix.
    expect(pushed.pathname).toBe('/settings');
    expect(pushed.searchParams.get('tab')).toBe('ticket-types');
    expect(pushed.searchParams.get('typeId')).toBe('defect');
  });

  it('clicking New ticket type pushes typeId=new on the same route', async () => {
    setQuery({ workspaceId: WORKSPACE, tab: 'ticket-types' });
    render(
      <Providers
        services={stubServices(
          {},
          {
            authoring: {
              listMembers: async () => rosterWhereIAm('admin'),
              listTicketTypes: async () => TYPES,
              listWorkflows: async () => WORKFLOWS,
            },
          },
        )}
      >
        <SettingsPage />
      </Providers>,
    );

    const newButton = await screen.findByRole('button', { name: 'New ticket type' });
    await userEvent.click(newButton);

    const pushed = new URL(String(push.mock.calls[0]?.[0]), 'https://example.test');
    expect(pushed.pathname).toBe('/settings');
    expect(pushed.searchParams.get('typeId')).toBe('new');
  });

  it('a typeId in the query renders the editor WITH the settings sidebar still present', async () => {
    setQuery({ workspaceId: WORKSPACE, tab: 'ticket-types', typeId: 'defect' });
    render(
      <Providers
        services={stubServices(
          {},
          {
            authoring: {
              listMembers: async () => rosterWhereIAm('admin'),
              listTicketTypes: async () => TYPES,
              listWorkflows: async () => WORKFLOWS,
            },
          },
        )}
      >
        <SettingsPage />
      </Providers>,
    );

    expect(await screen.findByRole('textbox', { name: 'Type name' })).toBeInTheDocument();
    // "Still inside the shell" is the claim under test — the form alone is
    // not proof of that; a separate route renders the same form. Scoped to
    // the sidebar itself: the pane's OWN "Ticket types" breadcrumb carries
    // the same accessible name, so an unscoped query is ambiguous.
    const sidebar = screen.getByRole('navigation', { name: 'Settings sections' });
    expect(within(sidebar).getByRole('link', { name: 'Ticket types' })).toBeInTheDocument();
    expect(within(sidebar).getByRole('link', { name: 'Workflows' })).toBeInTheDocument();
  });

  it('typeId=new opens a blank editor inline, same shape as an existing type', async () => {
    setQuery({ workspaceId: WORKSPACE, tab: 'ticket-types', typeId: 'new' });
    render(
      <Providers
        services={stubServices(
          {},
          {
            authoring: {
              listMembers: async () => rosterWhereIAm('admin'),
              listTicketTypes: async () => [],
              listWorkflows: async () => [],
            },
          },
        )}
      >
        <SettingsPage />
      </Providers>,
    );

    expect(await screen.findByRole('heading', { name: 'New ticket type', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Settings sections' })).toBeInTheDocument();
  });

  it('a MEMBER hitting typeId=new inline still gets the read-only sentence, not a blank form', async () => {
    setQuery({ workspaceId: WORKSPACE, tab: 'ticket-types', typeId: 'new' });
    render(
      <Providers
        services={stubServices(
          {},
          {
            authoring: {
              listMembers: async () => rosterWhereIAm('member'),
              listTicketTypes: async () => [],
              listWorkflows: async () => [],
            },
          },
        )}
      >
        <SettingsPage />
      </Providers>,
    );

    expect(
      await screen.findByRole('link', { name: 'Back to the ticket types' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Type name' })).not.toBeInTheDocument();
  });

  it('a leftover typeId is inert on any OTHER tab — the sidebar links never carry it forward', async () => {
    setQuery({ workspaceId: WORKSPACE, tab: 'workflows', typeId: 'defect' });
    render(
      <Providers
        services={stubServices(
          {},
          {
            authoring: {
              listMembers: async () => rosterWhereIAm('admin'),
              listWorkflows: async () => WORKFLOWS,
            },
          },
        )}
      >
        <SettingsPage />
      </Providers>,
    );

    expect(await screen.findByRole('heading', { name: 'Workflows', level: 2 })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Type name' })).not.toBeInTheDocument();
  });
});

/**
 * IMPORTANT 3 (Task 7 fix round 1) — same gap as the workspace-home case:
 * the CSS-scan tests for `.gn-workspace-list__role--pinned` only prove the
 * RULE exists, never that THIS page's workspace-name subtitle carries it.
 * `getMyWorkspaces` is left un-stubbed by every other case in this file
 * (`useWorkspaceName` then fails silently and the subtitle never renders at
 * all), so this is the one case in the file that has to stub it.
 */
describe('the workspace-name subtitle keeps its pinned size (ROUTED 3)', () => {
  it('carries both the base role class and the pinned-size modifier', async () => {
    setQuery({ workspaceId: WORKSPACE, tab: 'ticket-types' });
    render(
      <Providers
        services={stubServices(
          {
            getMyWorkspaces: async () => [
              {
                id: WORKSPACE,
                name: 'Garo Hills Logistics',
                role: 'admin',
                memberCount: 1,
                nameRestrictedProjectCount: 0,
                projects: [],
              },
            ],
          },
          {
            authoring: {
              listMembers: async () => rosterWhereIAm('admin'),
              listTicketTypes: async () => TYPES,
              listWorkflows: async () => WORKFLOWS,
            },
          },
        )}
      >
        <SettingsPage />
      </Providers>,
    );

    // `{ selector: '.gn-workspace-list__role' }` disambiguates from `AppNav`'s
    // OWN workspace-name nav link — it reads the same `useWorkspaceName` hook
    // and renders the identical text as an `<a>`, so a bare `getByText` here
    // matches two elements once the fixture actually resolves a name.
    const subtitle = await screen.findByText('Garo Hills Logistics', {
      selector: '.gn-workspace-list__role',
    });
    expect(subtitle).toHaveClass('gn-workspace-list__role', 'gn-workspace-list__role--pinned');
  });
});
