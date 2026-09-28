import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import { DELETE_TRIGGER_LABEL, deleteItemName, deletedNotice, type WorkspaceRef } from '@gisik-nokma/app-core';
import WorkspaceHomePage from '../app/w/[workspaceId]/page.js';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Trash series Plan 4, Task 7. Cases 19.241–19.243 (`test-cases/19-trash.md`
 * §19.25). The mount mirrors `workspace-home.test.tsx`'s own: a list of reads,
 * advanced by each ingest, and an ingest that commits.
 */

const WORKSPACE = '01J9WORKSPACE0000000000000';
const KIRO = '01J9USER000000000000000000';

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

function workspaceAs(role: string, over: Partial<WorkspaceRef> = {}): WorkspaceRef {
  return {
    id: WORKSPACE,
    name: 'Convenience Corner',
    prefix: 'CC',
    role,
    archived: false,
    memberCount: 5,
    nameRestrictedProjectCount: 0,
    projects: [
      { id: 'p1', name: 'Shop operations', prefix: 'SO', archived: false, ticketCount: 9, blockedCount: 0 },
      { id: 'p3', name: 'Old signage', prefix: 'OS', archived: true, ticketCount: 7, blockedCount: 0 },
    ],
    ...over,
  };
}

function mount(reads: WorkspaceRef[][]) {
  let ingests = 0;
  const sent: SubmittedEvent[][] = [];
  const services = stubServices({
    getMyWorkspaces: async () => reads[Math.min(ingests, reads.length - 1)]!,
  });
  services.dataSource.ingest = async (events) => {
    sent.push(events);
    ingests += 1;
    return events.map(
      (event): IngestResult => ({ status: 'committed', eventId: event.id, seq: 1, serverTime: '2026-09-29T10:00:00.000Z' }),
    );
  };
  render(
    <Providers services={services}>
      <WorkspaceHomePage />
    </Providers>,
  );
  return { sent };
}

const row = (projectId: string) => screen.getByTestId(`project-row-${projectId}`);

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('19.241–19.243 project Delete… on the workspace home', () => {
  it('19.241 an admin sees Delete… beside Archive; CONTROL: a member sees neither', async () => {
    mount([[workspaceAs('admin')]]);
    const card = await screen.findByTestId('project-row-p1');
    expect(within(card).getByRole('button', { name: 'Archive Shop operations' })).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: deleteItemName('Shop operations') })).toHaveTextContent(DELETE_TRIGGER_LABEL);
    cleanup();

    mount([[workspaceAs('member')]]);
    const memberCard = await screen.findByTestId('project-row-p1');
    expect(within(memberCard).queryByRole('button', { name: deleteItemName('Shop operations') })).toBeNull();
    expect(within(memberCard).queryByRole('button', { name: 'Archive Shop operations' })).toBeNull();
  });

  it('19.242 confirming posts ONE batch against the project, re-reads, and says where it went; CONTROL: Cancel posts nothing', async () => {
    const { sent } = mount([
      [workspaceAs('admin')],
      [workspaceAs('admin', { projects: [workspaceAs('admin').projects[1]!] })],
    ]);
    await userEvent.click(await screen.findByRole('button', { name: deleteItemName('Shop operations') }));
    let dialog = await screen.findByRole('alertdialog', { name: 'Delete project “Shop operations”?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(sent).toHaveLength(0);
    expect(row('p1')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: deleteItemName('Shop operations') }));
    dialog = await screen.findByRole('alertdialog', { name: 'Delete project “Shop operations”?' });
    await userEvent.click(within(dialog).getByRole('checkbox', { name: 'Delete permanently' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Delete permanently' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.map((event) => event.type)).toEqual(['project.deleted', 'purge.marked']);
    expect(sent[0]!.every((event) => event.entity.kind === 'project' && event.entity.id === 'p1')).toBe(true);
    expect(sent[0]!.every((event) => event.workspaceId === WORKSPACE)).toBe(true);
    await waitFor(() => expect(screen.queryByTestId('project-row-p1')).toBeNull());
    expect(screen.getByTestId('trash-notice')).toHaveTextContent(deletedNotice('project', 'Shop operations', true));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('19.243 an archived card offers Delete… too; CONTROL: its archive control still reads Restore', async () => {
    mount([[workspaceAs('owner')]]);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Show archived projects in Convenience Corner' }),
    );
    const archived = row('p3');
    expect(within(archived).getByRole('button', { name: deleteItemName('Old signage') })).toBeInTheDocument();
    expect(within(archived).getByRole('button', { name: 'Restore Old signage' })).toBeInTheDocument();
  });
});
