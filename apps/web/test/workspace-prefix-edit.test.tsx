import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import WorkspaceHomePage from '../app/w/[workspaceId]/page.js';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Prefixes and groups plan Task 10, case 22.185 (`test-cases/22-prefixes-and-groups.md` §22.10): the
 * workspace header's "Edit prefix", offered to owners and admins only, confirms before re-keying and sends
 * `workspace.prefix_changed`. The mount mirrors `workspace-home-project-edit.test.tsx`.
 */

const WORKSPACE = '01J9WORKSPACE0000000000000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ workspaceId: '01J9WORKSPACE0000000000000' }),
  usePathname: () => '/w/01J9WORKSPACE0000000000000',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: '01J9USER000000000000000000', name: 'Kiro' } }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

function workspaceAs(role: string): WorkspaceRef {
  return {
    id: WORKSPACE,
    name: 'Convenience Corner',
    prefix: 'CC',
    role,
    archived: false,
    memberCount: 5,
    nameRestrictedProjectCount: 0,
    projects: [{ id: 'p1', name: 'Shop operations', prefix: 'SO', archived: false, ticketCount: 9, blockedCount: 0 }],
  };
}

function mount(role: string, answer: (event: SubmittedEvent) => IngestResult = commit) {
  const sent: SubmittedEvent[][] = [];
  const services = stubServices({
    getMyWorkspaces: async () => [workspaceAs(role)],
    getGroups: async () => [],
  });
  services.dataSource.ingest = async (events) => {
    sent.push(events);
    return events.map(answer);
  };
  render(
    <Providers services={services}>
      <WorkspaceHomePage />
    </Providers>,
  );
  return { sent };
}

function commit(event: SubmittedEvent): IngestResult {
  return { status: 'committed', eventId: event.id, seq: 1, serverTime: '2026-10-02T10:00:00.000Z' };
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('22.185 the workspace header Edit prefix', () => {
  it('22.185 owners and admins see it beside the rename; a member and a guest do not', async () => {
    for (const role of ['owner', 'admin']) {
      mount(role);
      expect(await screen.findByRole('button', { name: 'Edit prefix' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Rename Convenience Corner' })).toBeInTheDocument(); // control: it sits beside the rename
      cleanup();
    }
    for (const role of ['member', 'guest']) {
      mount(role);
      expect(await screen.findByRole('heading', { name: 'Convenience Corner', level: 1 })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit prefix' })).toBeNull();
      cleanup();
    }
  });

  it('22.185 a changed prefix confirms with the workspace text; Keep sends nothing; Change prefix sends workspace.prefix_changed', async () => {
    const { sent } = mount('admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit prefix' }));
    const input = screen.getByLabelText('Workspace prefix');
    expect(input).toHaveValue('CC');
    await userEvent.clear(input);
    await userEvent.type(input, 'cx');
    expect(input).toHaveValue('CX'); // upper-cased as typed
    await userEvent.click(screen.getByRole('button', { name: 'Save prefix' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText('Tickets will be renumbered CX-… Old CC- keys still work.')).toBeInTheDocument();
    expect(sent).toHaveLength(0);

    await userEvent.click(dialog.getByRole('button', { name: 'Keep CC' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sent).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Save prefix' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Change prefix' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toHaveLength(1);
    expect(sent[0]![0]).toMatchObject({
      type: 'workspace.prefix_changed',
      workspaceId: WORKSPACE,
      entity: { kind: 'workspace', id: WORKSPACE },
      payload: { prefix: 'CX' },
    });
    await waitFor(() => expect(screen.queryByLabelText('Workspace prefix')).toBeNull()); // the form closed
  });

  it('22.185 an unchanged prefix sends nothing and a refusal is shown under the field', async () => {
    const reason = 'Only a workspace owner or admin can do this. Your role is member.';
    const { sent } = mount('admin', (event) => ({ status: 'refused', eventId: event.id, rule: 'permission.role', reason }) as IngestResult);
    await userEvent.click(await screen.findByRole('button', { name: 'Edit prefix' }));
    await userEvent.click(screen.getByRole('button', { name: 'Save prefix' })); // nothing typed
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sent).toHaveLength(0);
    expect(screen.queryByLabelText('Workspace prefix')).toBeNull();

    // control: a changed prefix reaches the door, which refuses; the form stays open with the reason
    await userEvent.click(screen.getByRole('button', { name: 'Edit prefix' }));
    await userEvent.type(screen.getByLabelText('Workspace prefix'), 'X');
    await userEvent.click(screen.getByRole('button', { name: 'Save prefix' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Change prefix' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(reason);
    expect(screen.getByLabelText('Workspace prefix')).toHaveValue('CCX');
  });
});

describe('22.189 the workspace confirmation also opens on Keep', () => {
  it('22.189 control: Save on CX focuses "Keep CC"', async () => {
    mount('admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit prefix' }));
    await userEvent.clear(screen.getByLabelText('Workspace prefix'));
    await userEvent.type(screen.getByLabelText('Workspace prefix'), 'CX');
    await userEvent.click(screen.getByRole('button', { name: 'Save prefix' }));
    const keep = within(await screen.findByRole('dialog')).getByRole('button', { name: 'Keep CC' });
    await waitFor(() => expect(keep).toHaveFocus());
  });
});

describe('22.191 the workspace prefix form never sends an invalid prefix', () => {
  it('22.191 an emptied or 4-letter prefix shows the hint, disables Save prefix, and Enter opens no dialog and sends nothing', async () => {
    const { sent } = mount('admin');
    await userEvent.click(await screen.findByRole('button', { name: 'Edit prefix' }));
    const input = screen.getByLabelText('Workspace prefix');
    for (const bad of ['', 'ABCD']) {
      await userEvent.clear(input);
      if (bad !== '') await userEvent.type(input, bad);
      expect(screen.getByText('A prefix is 1 to 3 letters.')).toBeInTheDocument();
      expect(input).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByRole('button', { name: 'Save prefix' })).toBeDisabled();
      await userEvent.type(input, '{Enter}'); // past the disabled button
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(sent).toHaveLength(0);
    }
    // control: CX reaches the dialog
    await userEvent.clear(input);
    await userEvent.type(input, 'CX');
    expect(screen.queryByText('A prefix is 1 to 3 letters.')).toBeNull();
    await userEvent.type(input, '{Enter}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });
});
