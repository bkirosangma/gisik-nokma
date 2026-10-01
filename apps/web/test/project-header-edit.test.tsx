import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { clearWorkspaceProjectsCache } from '../src/use-workspace-projects.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * MCP CRUD plan Task 2, case 13.1611: the project page's header offers the
 * same Edit as the workspace home's card, to the same people, and shows the new
 * name after a save. The mount is `project-page-chrome.test.tsx`'s.
 */

const WORKSPACE = '01J9WORKSPACE0000000000000';
const PROJECT = '01J9PROJECT000000000000000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ workspaceId: '01J9WORKSPACE0000000000000', projectId: '01J9PROJECT000000000000000' }),
  usePathname: () => '/w/01J9WORKSPACE0000000000000/p/01J9PROJECT000000000000000',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: '01J9USER000000000000000000', name: 'Kiro' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import ProjectPage from '../app/w/[workspaceId]/p/[projectId]/page.js';

function workspaceAs(role: string, projectName = 'Errand tracking'): WorkspaceRef {
  return {
    id: WORKSPACE,
    name: 'Garo Hills Logistics',
    prefix: 'GH',
    role,
    archived: false,
    memberCount: 3,
    nameRestrictedProjectCount: 0,
    projects: [
      { id: PROJECT, name: projectName, prefix: 'ET', description: 'Runs', archived: false, ticketCount: 4, blockedCount: 0 },
    ],
  };
}

function mount(role: string) {
  let ingests = 0;
  const sent: SubmittedEvent[][] = [];
  const services = stubServices({
    getMyWorkspaces: async () => [workspaceAs(role, ingests === 0 ? 'Errand tracking' : 'Errands')],
  });
  services.dataSource.ingest = async (events) => {
    sent.push(events);
    ingests += 1;
    return events.map(
      (event): IngestResult => ({ status: 'committed', eventId: event.id, seq: 1, serverTime: '2026-10-01T10:00:00.000Z' }),
    );
  };
  render(
    <Providers services={services}>
      <ProjectPage />
    </Providers>,
  );
  return { sent };
}

beforeEach(() => {
  cleanup();
  clearWorkspaceNameCache();
  clearWorkspaceProjectsCache();
});

describe('13.1611 the project page header Edit', () => {
  it('13.1611 an owner/admin edits from the header and the title shows the new name; a member sees the title without Edit', async () => {
    for (const role of ['owner', 'admin']) {
      cleanup();
      const { sent } = mount(role);
      expect(await screen.findByRole('heading', { name: 'Errand tracking', level: 1 })).toBeInTheDocument();
      await userEvent.click(await screen.findByRole('button', { name: 'Edit Errand tracking' }));
      const form = within(screen.getByRole('form', { name: 'Edit project' }));
      expect(form.getByLabelText('Name')).toHaveValue('Errand tracking');
      expect(form.getByLabelText('Description (optional)')).toHaveValue('Runs');
      await userEvent.clear(form.getByLabelText('Name'));
      await userEvent.type(form.getByLabelText('Name'), 'Errands');
      await userEvent.click(form.getByRole('button', { name: 'Save' }));
      await waitFor(() => expect(sent).toHaveLength(1));
      expect(sent[0]![0]).toMatchObject({
        type: 'project.updated',
        workspaceId: WORKSPACE,
        entity: { kind: 'project', id: PROJECT },
        payload: { name: 'Errands' },
      });
      expect(await screen.findByRole('heading', { name: 'Errands', level: 1 })).toBeInTheDocument();
      expect(screen.queryByRole('form', { name: 'Edit project' })).toBeNull();
    }

    cleanup();
    mount('member'); // control: the title is there and Edit is not
    expect(await screen.findByRole('heading', { name: 'Errand tracking', level: 1 })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Edit / })).toBeNull();
  });

  it('13.1611 Escape closes the header form and sends nothing', async () => {
    const { sent } = mount('owner');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Errand tracking' }));
    await userEvent.type(screen.getByLabelText('Name'), ' draft{Escape}'); // a pending change, so a submitting Escape would have something to send
    expect(screen.queryByRole('form', { name: 'Edit project' })).toBeNull();
    expect(sent).toHaveLength(0);
    expect(screen.getByRole('button', { name: 'Edit Errand tracking' })).toBeInTheDocument();
  });
});
