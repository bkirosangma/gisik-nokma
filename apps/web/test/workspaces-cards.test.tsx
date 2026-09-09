import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import WorkspacesPage from '../app/workspaces/page.js';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * 3.153/3.154 — the two `data-testid` hooks Plan 11 T13's E2E needs to
 * address one specific workspace or project card among structurally
 * identical siblings (house style `mapping-row-${state.id}` /
 * `state-node-${data.stateId}`): the id goes on the entity's own container,
 * disambiguation only — every interaction here still goes through the
 * accessible `name`/role, never the testid itself.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: '01J9USER000000000000000000', name: 'Kiro' } },
      isPending: false,
    }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

const WORKSPACES: WorkspaceRef[] = [
  {
    id: 'ws1',
    name: 'Convenience Corner',
    role: 'owner',
    projects: [
      { id: 'p1', name: 'Shop operations' },
      { id: 'p2', name: 'Deliveries' },
    ],
  },
  {
    id: 'ws2',
    name: 'Second Workspace',
    role: 'member',
    projects: [{ id: 'p3', name: 'Only project' }],
  },
];

function mount() {
  render(
    <Providers services={stubServices({ getMyWorkspaces: async () => WORKSPACES }, {})}>
      <WorkspacesPage />
    </Providers>,
  );
}

describe('Workspaces page — entity-keyed data-testid hooks (Plan 11 T13)', () => {
  it('3.153 keys each workspace card by its own workspaceId, distinguishing two siblings', async () => {
    mount();
    const ws1 = await screen.findByTestId('workspace-card-ws1');
    const ws2 = screen.getByTestId('workspace-card-ws2');
    expect(ws1).not.toBe(ws2);
    expect(within(ws1).getByRole('heading', { name: 'Convenience Corner' })).toBeInTheDocument();
    expect(within(ws2).getByRole('heading', { name: 'Second Workspace' })).toBeInTheDocument();
  });

  it('3.154 keys each project card by its own projectId, scoped inside its own workspace card', async () => {
    mount();
    const ws1 = await screen.findByTestId('workspace-card-ws1');
    const p1 = within(ws1).getByTestId('project-card-p1');
    const p2 = within(ws1).getByTestId('project-card-p2');
    expect(p1).not.toBe(p2);
    expect(within(p1).getByRole('link', { name: 'Shop operations' })).toHaveAttribute(
      'href',
      '/w/ws1/p/p1',
    );
    expect(within(p2).getByRole('link', { name: 'Deliveries' })).toHaveAttribute('href', '/w/ws1/p/p2');
    // The other workspace's project never leaks into this one's scope.
    expect(within(ws1).queryByTestId('project-card-p3')).toBeNull();
  });

  /**
   * 13.357 — the role label, the one owner-approved invented row on this
   * screen: real backing data (`GET /v1/me/workspaces` has disclosed `role`
   * since it first answered), only the DISPLAY was missing. Two different
   * roles on two cards, scoped by card, so a mutation that renders the wrong
   * workspace's role — or the same role on both — reddens this rather than a
   * looser "the word owner appears somewhere" check.
   */
  it("13.357 each card shows its OWN caller role, not the other card's", async () => {
    mount();
    const ws1 = await screen.findByTestId('workspace-card-ws1');
    const ws2 = screen.getByTestId('workspace-card-ws2');
    expect(within(ws1).getByText('owner')).toBeInTheDocument();
    expect(within(ws1).queryByText('member')).toBeNull();
    expect(within(ws2).getByText('member')).toBeInTheDocument();
    expect(within(ws2).queryByText('owner')).toBeNull();
  });
});
