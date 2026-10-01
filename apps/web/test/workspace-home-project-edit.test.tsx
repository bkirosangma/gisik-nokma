import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import WorkspaceHomePage, { updateSeeds } from '../app/w/[workspaceId]/page.js';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * MCP CRUD plan Task 2, cases 13.1607–13.1610 (`test-cases/13-neomorphism-and-workspace-screens.md`
 * §13.20). The mount mirrors `workspace-home-delete.test.tsx`: a list of reads
 * advanced by each ingest, and an ingest whose answer the case chooses.
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
      {
        id: 'p1',
        name: 'Shop operations',
        prefix: 'SO',
        description: 'Daily shop work',
        archived: false,
        ticketCount: 9,
        blockedCount: 0,
      },
      { id: 'p2', name: 'Delivery', prefix: 'DL', archived: false, ticketCount: 2, blockedCount: 0 },
    ],
    ...over,
  };
}

function mount(reads: WorkspaceRef[][], answer: (event: SubmittedEvent) => IngestResult = commit) {
  let ingests = 0;
  const sent: SubmittedEvent[][] = [];
  const services = stubServices({
    getMyWorkspaces: async () => reads[Math.min(ingests, reads.length - 1)]!,
  });
  services.dataSource.ingest = async (events) => {
    sent.push(events);
    ingests += 1;
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
  return { status: 'committed', eventId: event.id, seq: 1, serverTime: '2026-10-01T10:00:00.000Z' };
}

const card = async (projectId: string) => within(await screen.findByTestId(`project-row-${projectId}`));

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('13.1607 updateSeeds', () => {
  const ws = 'W';
  const p = 'P';
  it('13.1607 sends only the changed keys; an emptied description clears; no change sends nothing', () => {
    expect(updateSeeds(ws, p, { name: 'A', description: 'd' }, { name: 'B', description: 'd' })[0]?.payload).toEqual({ name: 'B' });
    expect(updateSeeds(ws, p, { name: 'A', description: 'd' }, { name: 'A', description: '' })[0]?.payload).toEqual({ description: null });
    expect(updateSeeds(ws, p, { name: 'A', description: null }, { name: 'A', description: '' })).toEqual([]);
    // control: both changed → both keys, against the project entity
    expect(updateSeeds(ws, p, { name: 'A', description: null }, { name: 'B', description: 'x' })[0]).toMatchObject({
      workspaceId: ws,
      type: 'project.updated',
      entity: { kind: 'project', id: p },
      payload: { name: 'B', description: 'x' },
    });
  });
});

describe('13.1608 the card offers Edit to whoever may archive', () => {
  it('13.1608 owner and admin see Edit beside Archive; a member sees neither', async () => {
    for (const role of ['owner', 'admin']) {
      mount([[workspaceAs(role)]]);
      const c = await card('p1');
      expect(c.getByRole('button', { name: 'Edit Shop operations' })).toBeInTheDocument();
      expect(c.getByRole('button', { name: 'Archive Shop operations' })).toBeInTheDocument(); // control: Archive's own gate
      cleanup();
    }
    mount([[workspaceAs('member')]]);
    const c = await card('p1');
    expect(c.queryByRole('button', { name: 'Edit Shop operations' })).toBeNull();
    expect(c.queryByRole('button', { name: 'Archive Shop operations' })).toBeNull();
  });
});

describe('13.1609 the inline edit form', () => {
  it('13.1609 opens prefilled; Save sends one project.updated; Cancel and Escape send nothing', async () => {
    const { sent } = mount([
      [workspaceAs('admin')],
      [workspaceAs('admin', { projects: [{ ...workspaceAs('admin').projects[0]!, name: 'Shop floor' }, workspaceAs('admin').projects[1]!] })],
    ]);
    const c = await card('p1');

    await userEvent.click(c.getByRole('button', { name: 'Edit Shop operations' }));
    expect(c.getByLabelText('Name')).toHaveValue('Shop operations');
    expect(c.getByLabelText('Description (optional)')).toHaveValue('Daily shop work');

    // a PENDING change, so that a Cancel/Escape that submitted would have something to send
    await userEvent.type(c.getByLabelText('Name'), ' draft');
    await userEvent.click(c.getByRole('button', { name: 'Cancel' }));
    expect(c.queryByLabelText('Name')).toBeNull();
    expect(c.getByRole('button', { name: 'Edit Shop operations' })).toBeInTheDocument();
    expect(sent).toHaveLength(0);

    await userEvent.click(c.getByRole('button', { name: 'Edit Shop operations' }));
    expect(c.getByLabelText('Name')).toHaveValue('Shop operations'); // the discarded draft did not stick
    await userEvent.type(c.getByLabelText('Name'), ' draft{Escape}');
    expect(c.queryByLabelText('Name')).toBeNull();
    expect(sent).toHaveLength(0);

    await userEvent.click(c.getByRole('button', { name: 'Edit Shop operations' }));
    await userEvent.clear(c.getByLabelText('Name'));
    await userEvent.type(c.getByLabelText('Name'), 'Shop floor');
    await userEvent.click(c.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toHaveLength(1);
    expect(sent[0]![0]).toMatchObject({
      type: 'project.updated',
      workspaceId: WORKSPACE,
      entity: { kind: 'project', id: 'p1' },
      payload: { name: 'Shop floor' },
    });
    // the outcome is OBSERVED by the re-read: the form closes and the card shows the served name
    await waitFor(() => expect(screen.queryByLabelText('Name')).toBeNull());
    expect(await screen.findByRole('button', { name: 'Edit Shop floor' })).toBeInTheDocument();
  });

  it('13.1609 a refused save keeps the form open and says why; Save with nothing changed sends nothing', async () => {
    const { sent } = mount([[workspaceAs('admin')]], (event) => ({
      status: 'refused',
      eventId: event.id,
      rule: 'permission.role',
      reason: 'Only a workspace owner or admin can do this. Your role is member.',
    }) as IngestResult);
    const c = await card('p1');
    await userEvent.click(c.getByRole('button', { name: 'Edit Shop operations' }));
    await userEvent.type(c.getByLabelText('Name'), '!');
    await userEvent.click(c.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('permission.role: Only a workspace owner or admin can do this.');
    expect(c.getByLabelText('Name')).toHaveValue('Shop operations!'); // the form stays open with the typed value
    expect(sent).toHaveLength(1);

    await userEvent.type(c.getByLabelText('Name'), '{Backspace}');
    await userEvent.click(c.getByRole('button', { name: 'Save' }));
    expect(sent).toHaveLength(1); // nothing changed → nothing sent
    expect(c.queryByLabelText('Name')).toBeNull(); // and the form closes
  });
});

describe('13.1610 a blank name is not sent', () => {
  it('13.1610 the form says why and sends nothing; a one-character name is sent', async () => {
    const { sent } = mount([[workspaceAs('owner')]]);
    const c = await card('p1');
    await userEvent.click(c.getByRole('button', { name: 'Edit Shop operations' }));
    await userEvent.clear(c.getByLabelText('Name'));
    expect(c.getByText('A project needs a name.')).toBeInTheDocument();
    expect(c.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
    await userEvent.type(c.getByLabelText('Name'), '   {Enter}'); // Enter submits a form natively
    expect(sent).toHaveLength(0);

    await userEvent.clear(c.getByLabelText('Name'));
    await userEvent.type(c.getByLabelText('Name'), 'S');
    expect(c.queryByText('A project needs a name.')).toBeNull();
    await userEvent.click(c.getByRole('button', { name: 'Save' })); // control
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]![0]!.payload).toEqual({ name: 'S' });
  });
});
