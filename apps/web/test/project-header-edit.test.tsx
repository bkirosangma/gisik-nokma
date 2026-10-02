import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupRow, IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { clearWorkspaceProjectsCache } from '../src/use-workspace-projects.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * MCP CRUD plan Task 2, case 13.1611: the project page's header offers the
 * same Edit as the workspace home's card, to the same people, and shows the new
 * name after a save. The mount is `project-page-chrome.test.tsx`'s. Case 22.184 (prefixes and groups plan
 * Task 10) is the same form's prefix and group fields from the header.
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

const SHOPS: GroupRow = { id: 'g1', parentId: null, level: 1, name: 'Shops', rank: 'a', projectCount: 0, childCount: 0 };

function mount(role: string, answer?: (event: SubmittedEvent) => IngestResult, groupReads: GroupRow[][] = [[SHOPS]]) {
  let ingests = 0;
  let groupAsks = 0;
  const sent: SubmittedEvent[][] = [];
  const services = stubServices({
    getMyWorkspaces: async () => [workspaceAs(role, ingests === 0 ? 'Errand tracking' : 'Errands')],
    getGroups: async () => groupReads[Math.min(groupAsks++, groupReads.length - 1)]!,
  });
  services.dataSource.ingest = async (events) => {
    sent.push(events);
    ingests += 1;
    return events.map(
      answer ??
        ((event): IngestResult => ({ status: 'committed', eventId: event.id, seq: 1, serverTime: '2026-10-01T10:00:00.000Z' })),
    );
  };
  render(
    <Providers services={services}>
      <ProjectPage />
    </Providers>,
  );
  return { sent, groupAsks: () => groupAsks };
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

describe('22.184 the header Edit offers the prefix and the group', () => {
  it('22.184 the form carries Prefix and Group prefilled; a prefix change confirms with the workspace prefix and sends {prefix}', async () => {
    const { sent } = mount('admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Errand tracking' }));
    const form = within(screen.getByRole('form', { name: 'Edit project' }));
    expect(form.getByLabelText('Prefix')).toHaveValue('ET');
    expect(await form.findByLabelText('Level 1 group')).toHaveValue('');

    await userEvent.clear(form.getByLabelText('Prefix'));
    await userEvent.type(form.getByLabelText('Prefix'), 'eg');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText('Tickets will be renumbered GHEG-… Old GHET- keys still work.')).toBeInTheDocument();
    expect(sent).toHaveLength(0);
    await userEvent.click(dialog.getByRole('button', { name: 'Change prefix' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toHaveLength(1);
    expect(sent[0]![0]).toMatchObject({ type: 'project.updated', entity: { kind: 'project', id: PROJECT }, payload: { prefix: 'EG' } });
  });

  it('22.184 a group pick sends {groupId} with no dialog; a refused prefix is explained under the field', async () => {
    const { sent } = mount('owner');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Errand tracking' }));
    const form = within(screen.getByRole('form', { name: 'Edit project' }));
    await userEvent.type(await form.findByLabelText('Level 1 group'), 'Shops{Enter}');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sent[0]![0]).toMatchObject({ type: 'project.updated', payload: { groupId: 'g1' } });
    expect(sent[0]![0]!.payload).toEqual({ groupId: 'g1' }); // and ONLY that: the unchanged prefix does not ride along
  });

  it('22.184 the header shows the door reason under Prefix and stays open', async () => {
    const reason = 'EG is taken by Errand tracking in this workspace.';
    mount('owner', (event) => ({ status: 'refused', eventId: event.id, rule: 'project.prefix-taken', reason }) as IngestResult);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Errand tracking' }));
    const form = within(screen.getByRole('form', { name: 'Edit project' }));
    await userEvent.clear(form.getByLabelText('Prefix'));
    await userEvent.type(form.getByLabelText('Prefix'), 'EG');
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Change prefix' }));
    expect(await form.findByText(reason, { exact: true })).toBeInTheDocument();
    expect(form.getByLabelText('Prefix')).toHaveAccessibleDescription(reason);
    expect(screen.getByRole('form', { name: 'Edit project' })).toBeInTheDocument();
  });
});

describe('22.188 the header re-reads the groups when someone made the group first', () => {
  const taken = 'There is already a group called Wholesale here.';
  const wholesale: GroupRow = { ...SHOPS, id: 'g9', name: 'Wholesale', rank: 'b' };

  it('22.188 group.name-taken re-reads, adopts the existing group, stays open; the next Save sends only {groupId}', async () => {
    const { sent, groupAsks } = mount(
      'owner',
      (event) =>
        event.type === 'group.created'
          ? ({ status: 'refused', eventId: event.id, rule: 'group.name-taken', reason: taken } as IngestResult)
          : (event.payload as { groupId?: string }).groupId !== 'g9'
            ? ({ status: 'refused', eventId: event.id, rule: 'group.unknown', reason: 'That group does not exist.' } as IngestResult)
            : { status: 'committed', eventId: event.id, seq: 1, serverTime: '2026-10-02T10:00:00.000Z' },
      [[SHOPS], [SHOPS, wholesale]],
    );
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Errand tracking' }));
    const form = within(screen.getByRole('form', { name: 'Edit project' }));
    await userEvent.type(await form.findByLabelText('Level 1 group'), 'Wholesale{Enter}');
    const asksBefore = groupAsks();
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.map((event) => event.type)).toEqual(['group.created', 'project.updated']);

    expect(await form.findByText(taken, { exact: true })).toBeInTheDocument();
    expect(await form.findByText('Using the existing Wholesale.')).toBeInTheDocument();
    expect(groupAsks()).toBeGreaterThan(asksBefore); // it asked again
    expect(form.getByLabelText('Level 1 group')).toHaveValue('Wholesale');
    expect(screen.getByRole('form', { name: 'Edit project' })).toBeInTheDocument(); // stays open
    expect(sent).toHaveLength(1); // nothing resubmitted by itself

    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toHaveLength(1);
    expect(sent[1]![0]).toMatchObject({ type: 'project.updated', payload: { groupId: 'g9' } });
  });

  it('22.188 control: a project.prefix-taken refusal does not re-read the groups', async () => {
    const { groupAsks } = mount('owner', (event) => ({ status: 'refused', eventId: event.id, rule: 'project.prefix-taken', reason: 'EG is taken.' }) as IngestResult);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit Errand tracking' }));
    const form = within(screen.getByRole('form', { name: 'Edit project' }));
    await form.findByLabelText('Level 1 group');
    await userEvent.clear(form.getByLabelText('Prefix'));
    await userEvent.type(form.getByLabelText('Prefix'), 'EG');
    const asksBefore = groupAsks();
    await userEvent.click(form.getByRole('button', { name: 'Save' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Change prefix' }));
    await form.findByText('EG is taken.');
    expect(groupAsks()).toBe(asksBefore);
  });
});
