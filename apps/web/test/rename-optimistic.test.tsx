import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { clearWorkspaceProjectsCache } from '../src/use-workspace-projects.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Renames show at once and roll back honestly (smoothness T7, spec S5; audit SM-03; owner D2b) — case 25.099.
 * The workspace home's heading takes the typed name on Save and gives it back with the refusal; the project
 * page's heading keeps the new name through the gap between the commit and the re-read.
 */

const WORKSPACE = '01J9WORKSPACE0000000000000';
const PROJECT = '01J9PROJECT000000000000000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ workspaceId: '01J9WORKSPACE0000000000000', projectId: '01J9PROJECT000000000000000' }),
  usePathname: () => '/w/01J9WORKSPACE0000000000000',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: '01J9USER000000000000000000', name: 'Kiro' } }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import WorkspaceHomePage from '../app/w/[workspaceId]/page.js';
import ProjectPage from '../app/w/[workspaceId]/p/[projectId]/page.js';

beforeEach(() => {
  cleanup();
  clearWorkspaceNameCache();
  clearWorkspaceProjectsCache();
});
afterEach(cleanup);

/** The directory ALWAYS answers the old names: a slow projection, so only an optimistic name can show the new one. */
const world = (): WorkspaceRef => ({
  id: WORKSPACE,
  name: 'Convenience Corner',
  prefix: 'CC',
  role: 'admin',
  archived: false,
  memberCount: 5,
  nameRestrictedProjectCount: 0,
  projects: [{ id: PROJECT, name: 'Errand tracking', prefix: 'ET', description: 'Runs', archived: false, ticketCount: 4, blockedCount: 0 }],
});

function mount(page: 'workspace' | 'project') {
  const services = stubServices({ getMyWorkspaces: async () => [world()], getGroups: async () => [] });
  const writes: Array<{ events: SubmittedEvent[]; resolve: (results: IngestResult[]) => void }> = [];
  services.dataSource.ingest = (events) =>
    new Promise<IngestResult[]>((resolve) => {
      writes.push({ events, resolve });
    });
  render(<Providers services={services}>{page === 'workspace' ? <WorkspaceHomePage /> : <ProjectPage />}</Providers>);
  return { writes };
}

const committed = (events: SubmittedEvent[]): IngestResult[] => events.map((event) => ({ status: 'committed', eventId: event.id, seq: 1, serverTime: '2026-10-02T10:00:00.000Z' }));
const refused = (events: SubmittedEvent[], reason: string): IngestResult[] => events.map((event) => ({ status: 'refused', eventId: event.id, rule: 'rename-refused', reason }));

const heading = () => screen.getByRole('heading', { level: 1 });

async function renameWorkspaceTo(name: string) {
  await userEvent.click(await waitFor(() => within(heading()).getByRole('button', { name: /^Rename / })));
  const input = screen.getByLabelText('New workspace name');
  await userEvent.clear(input);
  await userEvent.type(input, name);
  await userEvent.click(screen.getByRole('button', { name: 'Save name' }));
}

describe('25.099 the workspace home rename', () => {
  it('25.099 Save shows the new name in the heading at once, the field closes, and a commit keeps the name while the re-read still says the old one', async () => {
    const { writes } = mount('workspace');
    await renameWorkspaceTo('Corner HQ');
    // The write is OPEN and the page already says the new name.
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(within(heading()).getByText('Corner HQ')).toBeInTheDocument();
    expect(screen.queryByLabelText('New workspace name')).toBeNull();
    writes[0]!.resolve(committed(writes[0]!.events));
    await new Promise((resolve) => setTimeout(resolve, 80));
    // The directory still answers 'Convenience Corner' (stale): the old name never comes back.
    expect(within(heading()).getByText('Corner HQ')).toBeInTheDocument();
    expect(within(heading()).queryByText('Convenience Corner')).toBeNull();
  });

  it('25.099 a refused rename gives the old name back, reopens the field with what was typed, and prints the reason', async () => {
    const { writes } = mount('workspace');
    await renameWorkspaceTo('Corner HQ');
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(within(heading()).getByText('Corner HQ')).toBeInTheDocument();
    writes[0]!.resolve(refused(writes[0]!.events, 'Only an owner may rename this workspace.'));
    expect(await screen.findByText(/Only an owner may rename this workspace\./)).toBeInTheDocument();
    // The field is back with the person's words; the heading is not drawn while it is open, so the old name is in the trigger's label.
    expect(await screen.findByLabelText('New workspace name')).toHaveValue('Corner HQ');
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(within(heading()).getByText('Convenience Corner')).toBeInTheDocument();
    expect(within(heading()).queryByText('Corner HQ')).toBeNull();
  });

  it('25.099 control: saving the name it already has holds no optimistic name — the field closes only when the write is answered', async () => {
    const { writes } = mount('workspace');
    await renameWorkspaceTo('Convenience Corner');
    await waitFor(() => expect(writes).toHaveLength(1));
    expect(screen.getByLabelText('New workspace name')).toBeInTheDocument();
    writes[0]!.resolve(committed(writes[0]!.events));
    expect(await waitFor(() => within(heading()).getByText('Convenience Corner'))).toBeInTheDocument();
  });
});

describe('25.099 the project page rename', () => {
  async function renameProjectTo(name: string) {
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Errand tracking' }));
    const form = within(screen.getByRole('form', { name: 'Edit project' }));
    await userEvent.clear(form.getByLabelText('Name'));
    await userEvent.type(form.getByLabelText('Name'), name);
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
  }

  it('25.099 a committed rename shows the new heading the moment the form leaves, with no flash of the old name while the re-read is stale', async () => {
    const { writes } = mount('project');
    await renameProjectTo('Errands');
    await waitFor(() => expect(writes).toHaveLength(1));
    writes[0]!.resolve(committed(writes[0]!.events));
    expect(await screen.findByRole('heading', { name: 'Errands', level: 1 })).toBeInTheDocument();
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(screen.getByRole('heading', { level: 1, name: 'Errands' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Errand tracking', level: 1 })).toBeNull();
  });

  it('25.099 a refused project rename leaves the old heading and the form open with the typed name', async () => {
    const { writes } = mount('project');
    await renameProjectTo('Errands');
    await waitFor(() => expect(writes).toHaveLength(1));
    writes[0]!.resolve(refused(writes[0]!.events, 'Names must be unique in a workspace.'));
    expect(await screen.findByText(/Names must be unique in a workspace\./)).toBeInTheDocument();
    expect(within(screen.getByRole('form', { name: 'Edit project' })).getByLabelText('Name')).toHaveValue('Errands');
    await userEvent.click(within(screen.getByRole('form', { name: 'Edit project' })).getByRole('button', { name: 'Cancel' }));
    expect(await screen.findByRole('heading', { name: 'Errand tracking', level: 1 })).toBeInTheDocument();
  });
});
