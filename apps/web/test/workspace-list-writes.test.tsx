import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import { ARCHIVE_LABEL, DELETE_TRIGGER_LABEL, moreActionsFor, typeNameLabel, type WorkspaceRef } from '@gisik-nokma/app-core';
import WorkspacesPage from '../app/workspaces/page.js';
import InvitePage from '../app/invite/[token]/page.js';
import { Providers } from '../src/providers.js';
import { clearMyWorkspacesCache } from '../src/use-my-workspaces.js';
import { clearWorkspaceNameCache, useWorkspaceLookup } from '../src/use-workspace-name.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Smoothness T4 FIX 1, F1 (case 25.049). The nav, Last project and the project name read the person's
 * workspaces through ONE shared read that a settled answer keeps for 30 s and a `projects-version` bump
 * re-asks (`use-my-workspaces.ts`). Before T4 every mount asked again, so a workspace that JOINED the person's
 * list (founded, an invitation accepted) was in the next page's nav. These cases drive the REAL page
 * components and their real success handlers: the shared read is warm, the door's write commits, and the page
 * the person lands on must name the new workspace. Each case holds its control in the same `it()`: with no
 * write, a remount inside 30 s asks nothing.
 *
 * `WorkspacesPage` makes its own list read as well, so the settled ANSWER is asserted (`waitFor`), never a
 * call count, and never the first frame: the first render after a bump still paints the old rows by design.
 */
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ token: 'tok_e2e' }),
  usePathname: () => '/workspaces',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: '01J9USER000000000000000000', name: 'Kiro' } }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

const ws = (over: Partial<WorkspaceRef> & { id: string; name: string }): WorkspaceRef => ({
  prefix: 'CC',
  role: 'owner',
  archived: false,
  memberCount: 3,
  nameRestrictedProjectCount: 0,
  projects: [],
  ...over,
});
const OLD = ws({ id: 'ws_old', name: 'Old Shop' });
const OTHER = ws({ id: 'ws_other', name: 'Other Shop' });
const NEW = ws({ id: 'ws_new', name: 'New Shop' });

/** What the nav asks for on the page the person lands on: the name, and the dropdown's other workspaces. */
function Probe({ id }: { id: string }) {
  const { name, others } = useWorkspaceLookup(id);
  return (
    <>
      <output data-testid="name">{name ?? 'null'}</output>
      <output data-testid="others">{others.map((row) => row.name).join('|')}</output>
    </>
  );
}

beforeEach(() => {
  push.mockClear();
  clearMyWorkspacesCache();
  clearWorkspaceNameCache();
});
afterEach(cleanup);

const name = () => screen.getByTestId('name').textContent;
const others = () => screen.getByTestId('others').textContent;

describe('25.049 a write that changes the person\'s workspace list reaches the next page\'s nav', () => {
  function mountWith(server: { rows: WorkspaceRef[] }, gateways: Parameters<typeof stubServices>[1], page: 'workspaces' | 'invite') {
    const read = vi.fn(async () => server.rows);
    const services = stubServices({ getMyWorkspaces: read }, { notifications: { unreadCount: async () => 0 }, ...gateways });
    const tree = (probe: string) => (
      <Providers services={services}>
        {page === 'workspaces' ? <WorkspacesPage /> : <InvitePage />}
        <Probe key={probe} id={probe} />
      </Providers>
    );
    const view = render(tree('ws_old'));
    return { view, tree, services, read };
  }

  /** The control, in the same `it()`: the read is warm and nothing was written, so a remount asks nothing. */
  async function expectWarmRemountAsksNothing(
    view: ReturnType<typeof render>,
    tree: (probe: string) => React.ReactElement,
    read: ReturnType<typeof vi.fn>,
  ) {
    await waitFor(() => expect(name()).toBe('Old Shop'));
    await new Promise((resolve) => setTimeout(resolve, 50)); // let the page's own read settle
    const before = read.mock.calls.length;
    view.rerender(tree('ws_other'));
    view.rerender(tree('ws_old'));
    await waitFor(() => expect(name()).toBe('Old Shop'));
    expect(read.mock.calls.length).toBe(before);
  }

  it('25.049 founding: the workspace just founded is named on the page the founder lands on', async () => {
    const server = { rows: [OLD] };
    const { view, tree, read } = mountWith(
      server,
      {
        founding: {
          foundWorkspace: async () => {
            server.rows = [OLD, NEW];
            return { workspaceId: 'ws_new' };
          },
        },
      },
      'workspaces',
    );
    const user = userEvent.setup();
    await expectWarmRemountAsksNothing(view, tree, read);

    await user.click(await screen.findByRole('button', { name: 'Create workspace' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create workspace' });
    await user.type(within(dialog).getByLabelText(/name/i), 'New Shop');
    await user.click(within(dialog).getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/w/ws_new'));

    view.rerender(tree('ws_new')); // the page the push lands on
    await waitFor(() => expect(name()).toBe('New Shop'));
  });

  it('25.049 accepting an invitation on /workspaces: the joined workspace is named on the page the person lands on', async () => {
    const server = { rows: [OLD] };
    const { view, tree, read } = mountWith(
      server,
      {
        myInvitations: {
          list: async () => [
            { inviteId: 'inv1', workspaceId: 'ws_new', workspaceName: 'New Shop', role: 'member', invitedByName: 'Pat', invitedAt: '2026-10-01T06:00:00.000Z', expiresAt: '2099-01-01T00:00:00.000Z' },
          ],
          accept: async () => {
            server.rows = [OLD, NEW];
            return { workspaceId: 'ws_new' };
          },
        },
      },
      'workspaces',
    );
    const user = userEvent.setup();
    await expectWarmRemountAsksNothing(view, tree, read);

    await user.click(await screen.findByRole('button', { name: 'Accept the invitation to New Shop' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/w/ws_new/my-work'));

    view.rerender(tree('ws_new'));
    await waitFor(() => expect(name()).toBe('New Shop'));
  });

  it('25.049 accepting an invitation by its link: the joined workspace is named on the page the person lands on', async () => {
    const server = { rows: [OLD] };
    const { view, tree, read } = mountWith(
      server,
      {
        invites: {
          getInvite: async () => ({ workspaceId: 'ws_new', workspaceName: 'New Shop', role: 'member', expiresAt: null }),
          acceptInvite: async () => {
            server.rows = [OLD, NEW];
            return { workspaceId: 'ws_new' };
          },
        },
      },
      'invite',
    );
    const user = userEvent.setup();
    await expectWarmRemountAsksNothing(view, tree, read);

    await user.click(await screen.findByRole('button', { name: 'Join New Shop' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/w/ws_new/my-work'));

    view.rerender(tree('ws_new'));
    await waitFor(() => expect(name()).toBe('New Shop'));
  });

  it('25.049 archiving a workspace: once the write commits, the nav dropdown no longer lists it; a write that is not committed leaves it', async () => {
    const server = { rows: [OLD, OTHER] };
    const { view, tree, services, read } = mountWith(server, {}, 'workspaces');
    let outcome: IngestResult['status'] = 'refused';
    services.dataSource.ingest = async (events: SubmittedEvent[]) =>
      events.map((event): IngestResult => {
        if (outcome === 'committed') server.rows = [OLD, { ...OTHER, archived: true }];
        return outcome === 'committed'
          ? { status: 'committed', eventId: event.id, seq: 1, serverTime: '2026-10-02T10:00:00.000Z' }
          : { status: 'refused', eventId: event.id, rule: 'role', reason: 'not allowed' };
      });
    const user = userEvent.setup();
    await expectWarmRemountAsksNothing(view, tree, read);
    expect(others()).toBe('Other Shop');

    const archive = async () => {
      await user.click(await screen.findByRole('button', { name: moreActionsFor('Other Shop') }));
      await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: ARCHIVE_LABEL }));
    };
    await archive(); // control: refused, the list the nav holds is unchanged
    await screen.findByRole('alert');
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(others()).toBe('Other Shop');

    outcome = 'committed';
    await archive();
    await waitFor(() => expect(others()).toBe(''));
  });

  it('25.049 deleting a workspace: once the delete commits, the nav dropdown no longer lists it', async () => {
    const server = { rows: [OLD, OTHER] };
    const { view, tree, services, read } = mountWith(server, {}, 'workspaces');
    services.dataSource.ingest = async (events: SubmittedEvent[]) =>
      events.map((event): IngestResult => {
        server.rows = [OLD];
        return { status: 'committed', eventId: event.id, seq: 1, serverTime: '2026-10-02T10:00:00.000Z' };
      });
    const user = userEvent.setup();
    await expectWarmRemountAsksNothing(view, tree, read);
    expect(others()).toBe('Other Shop');

    await user.click(await screen.findByRole('button', { name: moreActionsFor('Other Shop') }));
    await user.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: DELETE_TRIGGER_LABEL }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete workspace “Other Shop”?' });
    await user.type(within(dialog).getByLabelText(typeNameLabel('Other Shop')), 'Other Shop');
    await user.click(within(dialog).getByRole('button', { name: 'Delete workspace' }));
    await waitFor(() => expect(others()).toBe(''));
  });
});
