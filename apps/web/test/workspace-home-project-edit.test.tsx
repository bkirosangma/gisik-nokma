import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupRow, IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import WorkspaceHomePage, { updateSeeds } from '../app/w/[workspaceId]/page.js';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * MCP CRUD plan Task 2, cases 13.1607–13.1610 (`test-cases/13-neomorphism-and-workspace-screens.md`
 * §13.20), and prefixes and groups plan Task 10, cases 22.180–22.183, 22.186 and 22.187
 * (`test-cases/22-prefixes-and-groups.md` §22.10). The mount mirrors `workspace-home-delete.test.tsx`: a
 * list of reads advanced by each ingest, and an ingest whose answer the case chooses; `groupReads` is
 * the same for `getGroups`, advanced by each READ of it.
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

const group = (id: string, name: string, parentId: string | null = null): GroupRow => ({
  id,
  parentId,
  level: parentId === null ? 1 : 2,
  name,
  rank: id,
  projectCount: 0,
  childCount: 0,
});
const GROUPS = [group('g1', 'Shops'), group('g2', 'Retail', 'g1')];

function mount(
  reads: WorkspaceRef[][],
  answer: (event: SubmittedEvent) => IngestResult = commit,
  groupReads: GroupRow[][] = [GROUPS],
) {
  let ingests = 0;
  let groupAsks = 0;
  const sent: SubmittedEvent[][] = [];
  const services = stubServices({
    getMyWorkspaces: async () => reads[Math.min(ingests, reads.length - 1)]!,
    getGroups: async () => groupReads[Math.min(groupAsks++, groupReads.length - 1)]!,
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
  return { sent, groupAsks: () => groupAsks };
}

function commit(event: SubmittedEvent): IngestResult {
  return { status: 'committed', eventId: event.id, seq: 1, serverTime: '2026-10-01T10:00:00.000Z' };
}

const card = async (projectId: string) => within(await screen.findByTestId(`project-row-${projectId}`));

/** Edit is the first item of the card's overflow menu (WS-03, 22.147): open the menu and press it. */
async function openEdit(c: ReturnType<typeof within>, projectName: string): Promise<void> {
  await userEvent.click(c.getByRole('button', { name: `More actions for ${projectName}` }));
  await userEvent.click(c.getByRole('menuitem', { name: 'Edit' }));
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const NO_GROUP = { groupId: null, pendingNames: [] };
const newIds = () => {
  let n = 0;
  return () => `new${++n}`;
};

describe('13.1607 updateSeeds', () => {
  const ws = 'W';
  const p = 'P';
  it('13.1607 sends only the changed keys; an emptied description clears; no change sends nothing', () => {
    const was = (name: string, description: string | null) => ({ name, description, prefix: 'SO', groupId: null });
    const now = (name: string, description: string) => ({ name, description, prefix: 'SO', group: NO_GROUP });
    const up = (before: ReturnType<typeof was>, after: ReturnType<typeof now>) => updateSeeds(ws, p, before, after, [], newIds());
    expect(up(was('A', 'd'), now('B', 'd'))[0]?.payload).toEqual({ name: 'B' });
    expect(up(was('A', 'd'), now('A', ''))[0]?.payload).toEqual({ description: null });
    expect(up(was('A', null), now('A', ''))).toEqual([]);
    // control: both changed → both keys, against the project entity
    expect(up(was('A', null), now('B', 'x'))[0]).toMatchObject({
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
      await userEvent.click(c.getByRole('button', { name: 'More actions for Shop operations' }));
      expect(c.getByRole('menuitem', { name: 'Edit' })).toBeInTheDocument();
      expect(c.getByRole('menuitem', { name: 'Archive' })).toBeInTheDocument(); // control: Archive's own gate
      cleanup();
    }
    mount([[workspaceAs('member')]]);
    const c = await card('p1');
    expect(c.queryByRole('button', { name: /More actions/ })).toBeNull();
    expect(c.queryByRole('menuitem', { name: 'Edit' })).toBeNull();
    expect(c.queryByRole('button', { name: 'Edit Shop operations' })).toBeNull();
  });
});

describe('13.1609 the inline edit form', () => {
  it('13.1609 opens prefilled; Save sends one project.updated; Cancel and Escape send nothing', async () => {
    const { sent } = mount([
      [workspaceAs('admin')],
      [workspaceAs('admin', { projects: [{ ...workspaceAs('admin').projects[0]!, name: 'Shop floor' }, workspaceAs('admin').projects[1]!] })],
    ]);
    const c = await card('p1');

    await openEdit(c, 'Shop operations');
    expect(c.getByLabelText('Name')).toHaveValue('Shop operations');
    expect(c.getByLabelText('Description (optional)')).toHaveValue('Daily shop work');

    // a PENDING change, so that a Cancel/Escape that submitted would have something to send
    await userEvent.type(c.getByLabelText('Name'), ' draft');
    await userEvent.click(c.getByRole('button', { name: 'Cancel' }));
    expect(c.queryByLabelText('Name')).toBeNull();
    // the card's menu trigger is back and is where focus returns
    expect(c.getByRole('button', { name: 'More actions for Shop operations' })).toHaveFocus();
    expect(sent).toHaveLength(0);

    await openEdit(c, 'Shop operations');
    expect(c.getByLabelText('Name')).toHaveValue('Shop operations'); // the discarded draft did not stick
    await userEvent.type(c.getByLabelText('Name'), ' draft{Escape}');
    expect(c.queryByLabelText('Name')).toBeNull();
    expect(sent).toHaveLength(0);

    await openEdit(c, 'Shop operations');
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
    expect(await screen.findByRole('button', { name: 'More actions for Shop floor' })).toBeInTheDocument();
  });

  it('13.1609 a refused save keeps the form open and says why; Save with nothing changed sends nothing', async () => {
    const { sent } = mount([[workspaceAs('admin')]], (event) => ({
      status: 'refused',
      eventId: event.id,
      rule: 'permission.role',
      reason: 'Only a workspace owner or admin can do this. Your role is member.',
    }) as IngestResult);
    const c = await card('p1');
    await openEdit(c, 'Shop operations');
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
    await openEdit(c, 'Shop operations');
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

describe('22.180 a prefix change asks first', () => {
  it('22.180 Save shows the confirmation with the exact text; Keep sends nothing; Change prefix sends project.updated {prefix}', async () => {
    const { sent } = mount([[workspaceAs('admin')]]);
    const c = await card('p1');
    await openEdit(c, 'Shop operations');
    expect(c.getByLabelText('Prefix')).toHaveValue('SO');
    await userEvent.clear(c.getByLabelText('Prefix'));
    await userEvent.type(c.getByLabelText('Prefix'), 'sh');
    expect(c.getByLabelText('Prefix')).toHaveValue('SH'); // upper-cased as typed

    await userEvent.click(c.getByRole('button', { name: 'Save' }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText('Tickets will be renumbered CCSH-… Old CCSO- keys still work.')).toBeInTheDocument();
    expect(sent).toHaveLength(0); // asked, not sent

    await userEvent.click(dialog.getByRole('button', { name: 'Keep CCSO' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sent).toHaveLength(0);
    expect(c.getByLabelText('Prefix')).toHaveValue('SH'); // the form is still open on the typed value

    await userEvent.click(c.getByRole('button', { name: 'Save' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Change prefix' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]).toHaveLength(1);
    expect(sent[0]![0]).toMatchObject({
      type: 'project.updated',
      entity: { kind: 'project', id: 'p1' },
      payload: { prefix: 'SH' }, // and only the prefix: the name and description did not change
    });
  });
});

describe('22.181 a refused prefix is explained under the field', () => {
  it('22.181 project.prefix-reserved shows the server reason verbatim under Prefix and the form stays open', async () => {
    const reason = 'SH is kept for the former prefix of Shop floor.';
    const { sent } = mount([[workspaceAs('admin')]], (event) => ({
      status: 'refused',
      eventId: event.id,
      rule: 'project.prefix-reserved',
      reason,
    }) as IngestResult);
    const c = await card('p1');
    await openEdit(c, 'Shop operations');
    await userEvent.clear(c.getByLabelText('Prefix'));
    await userEvent.type(c.getByLabelText('Prefix'), 'SH');
    await userEvent.click(c.getByRole('button', { name: 'Save' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Change prefix' }));

    const shown = await c.findByText(reason, { exact: true }); // verbatim: no `rule:` in front of it
    expect(c.getByLabelText('Prefix')).toHaveAccessibleDescription(reason);
    expect(shown.closest('form')).not.toBeNull();
    expect(c.getByLabelText('Prefix')).toHaveValue('SH'); // the form stays open on the typed value
    expect(sent).toHaveLength(1);
    expect(screen.queryByText(/project\.prefix-reserved/)).toBeNull(); // the form claimed it: not ALSO a page-level `rule: reason` line
  });
});

describe('22.182 a group-only change needs no prefix confirmation', () => {
  it('22.182 picking Shops sends project.updated {groupId} and no dialog opens', async () => {
    const { sent } = mount([[workspaceAs('admin')]]);
    const c = await card('p1');
    await openEdit(c, 'Shop operations');
    await userEvent.type(await c.findByLabelText('Level 1 group'), 'Shops{Enter}');
    await userEvent.click(c.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sent[0]).toHaveLength(1);
    expect(sent[0]![0]).toMatchObject({ type: 'project.updated', payload: { groupId: 'g1' } });
    expect(sent[0]![0]!.payload).not.toHaveProperty('prefix'); // control: the prefix was not claimed
  });
});

describe('22.183 an inline-created group goes first', () => {
  it('22.183 updateSeeds puts group.created ahead of ONE project.updated {groupId:<new id>}, prefix upper-cased', () => {
    const seeds = updateSeeds(
      'W',
      'P',
      { name: 'A', description: null, prefix: 'SO', groupId: null },
      { name: 'A', description: '', prefix: 'sh', group: { groupId: 'g1', pendingNames: ['Wholesale'] } },
      GROUPS,
      newIds(),
    );
    expect(seeds.map((seed) => seed.type)).toEqual(['group.created', 'project.updated']);
    expect(seeds[0]).toMatchObject({ entity: { kind: 'group', id: 'new1' }, payload: { parentId: 'g1', name: 'Wholesale' } });
    expect(seeds[1]!.payload).toEqual({ prefix: 'SH', groupId: 'new1' });
  });

  it('22.183 the form sends [group.created, project.updated] in ONE ingest call', async () => {
    const { sent } = mount([[workspaceAs('admin')]]);
    const c = await card('p1');
    await openEdit(c, 'Shop operations');
    await userEvent.type(await c.findByLabelText('Level 1 group'), 'Wholesale{Enter}');
    expect(c.getByText('New')).toBeInTheDocument();
    await userEvent.click(c.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    expect(sent[0]!.map((event) => event.type)).toEqual(['group.created', 'project.updated']);
    expect(sent[0]![1]!.payload).toEqual({ groupId: sent[0]![0]!.entity.id });
  });
});

describe('22.186 an unchanged form sends nothing', () => {
  it('22.186 retyping the same prefix and leaving the group alone closes with no dialog and no ingest', async () => {
    const { sent } = mount([[workspaceAs('admin')]]);
    const c = await card('p1');
    await openEdit(c, 'Shop operations');
    await userEvent.clear(c.getByLabelText('Prefix'));
    await userEvent.type(c.getByLabelText('Prefix'), 'so'); // the same prefix, typed lower-case
    await userEvent.click(c.getByRole('button', { name: 'Save' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sent).toHaveLength(0);
    expect(c.queryByLabelText('Prefix')).toBeNull(); // the form closed

    // control: the same gesture with a changed prefix does reach the dialog
    await openEdit(c, 'Shop operations');
    await userEvent.type(c.getByLabelText('Prefix'), 'X');
    await userEvent.click(c.getByRole('button', { name: 'Save' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });
});

describe('22.187 someone created the group first', () => {
  it('22.187 group.name-taken re-reads the groups, adopts the existing group, stays open; the next Save sends only {groupId}', async () => {
    const taken = 'There is already a group called Wholesale here.';
    const wholesale = group('g9', 'Wholesale');
    const { sent, groupAsks } = mount(
      [[workspaceAs('admin')]],
      (event) =>
        event.type === 'group.created'
          ? ({ status: 'refused', eventId: event.id, rule: 'group.name-taken', reason: taken } as IngestResult)
          : event.type === 'project.updated' && (event.payload as { groupId?: string }).groupId !== 'g9'
            ? ({ status: 'refused', eventId: event.id, rule: 'group.unknown', reason: 'That group does not exist.' } as IngestResult) // the refused batch's second event names a group that was never made
            : commit(event),
      [GROUPS, [...GROUPS, wholesale]],
    );
    const c = await card('p1');
    await openEdit(c, 'Shop operations');
    await userEvent.type(await c.findByLabelText('Level 1 group'), 'Wholesale{Enter}');
    const asksBefore = groupAsks();
    await userEvent.click(c.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(1));

    expect(await c.findByText(taken, { exact: true })).toBeInTheDocument(); // the reason, under the picker
    expect(await c.findByText('Using the existing Wholesale.')).toBeInTheDocument();
    expect(groupAsks()).toBeGreaterThan(asksBefore); // it asked again
    expect(c.getByLabelText('Level 1 group')).toHaveValue('Wholesale');
    expect(c.queryByText('New')).toBeNull(); // no longer pending: it is the existing group
    expect(c.getByRole('form', { name: 'Edit project' })).toBeInTheDocument(); // stays open, no success close
    expect(sent).toHaveLength(1); // no automatic resubmit: the person sees the adoption first

    await userEvent.click(c.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]).toHaveLength(1);
    expect(sent[1]![0]).toMatchObject({ type: 'project.updated', payload: { groupId: 'g9' } }); // the existing id, not the refused new one
    expect(sent[1]!.some((event) => event.type === 'group.created')).toBe(false);
  });

  it('22.187 control: a different refusal does not re-read the groups', async () => {
    const { sent, groupAsks } = mount([[workspaceAs('admin')]], (event) => ({
      status: 'refused',
      eventId: event.id,
      rule: 'project.prefix-reserved',
      reason: 'SH is reserved.',
    }) as IngestResult);
    const c = await card('p1');
    await openEdit(c, 'Shop operations');
    await userEvent.type(await c.findByLabelText('Level 1 group'), 'Shops{Enter}');
    await userEvent.clear(c.getByLabelText('Prefix'));
    await userEvent.type(c.getByLabelText('Prefix'), 'SH');
    const asksBefore = groupAsks();
    await userEvent.click(c.getByRole('button', { name: 'Save' }));
    await userEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Change prefix' }));
    await c.findByText('SH is reserved.');
    expect(sent).toHaveLength(1);
    expect(groupAsks()).toBe(asksBefore);
  });
});

describe('22.189 the confirmation opens on the safe answer', () => {
  it('22.189 Save on a changed prefix focuses "Keep CCSO"; Enter keeps (sends nothing, closes the dialog, form still open)', async () => {
    const { sent } = mount([[workspaceAs('admin')]]);
    const c = await card('p1');
    await openEdit(c, 'Shop operations');
    await userEvent.clear(c.getByLabelText('Prefix'));
    await userEvent.type(c.getByLabelText('Prefix'), 'SH');
    await userEvent.click(c.getByRole('button', { name: 'Save' }));
    const keep = within(await screen.findByRole('dialog')).getByRole('button', { name: 'Keep CCSO' });
    await waitFor(() => expect(keep).toHaveFocus());
    await userEvent.keyboard('{Enter}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(sent).toHaveLength(0);
    expect(c.getByLabelText('Prefix')).toHaveValue('SH'); // the form is still open on the typed value
  });
});

describe('22.190 the project form never sends an invalid prefix', () => {
  it('22.190 an emptied or non-letter prefix shows the hint, disables Save, and Enter opens no dialog and sends nothing', async () => {
    const { sent } = mount([[workspaceAs('admin')]]);
    const c = await card('p1');
    await openEdit(c, 'Shop operations');
    const prefix = c.getByLabelText('Prefix');
    for (const bad of ['', 'S1']) {
      await userEvent.clear(prefix);
      if (bad !== '') await userEvent.type(prefix, bad);
      const hint = c.getByText('A prefix is 1 to 3 letters.');
      expect(prefix).toHaveAttribute('aria-invalid', 'true');
      expect(prefix).toHaveAccessibleDescription('A prefix is 1 to 3 letters.');
      expect(hint).toBeInTheDocument();
      expect(c.getByRole('button', { name: 'Save' })).toBeDisabled();
      await userEvent.type(prefix, '{Enter}'); // Enter submits the form natively, past the disabled button
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(sent).toHaveLength(0);
    }
    // control: a valid prefix enables Save and Enter reaches the dialog
    await userEvent.clear(prefix);
    await userEvent.type(prefix, 'SH');
    expect(c.queryByText('A prefix is 1 to 3 letters.')).toBeNull();
    expect(c.getByRole('button', { name: 'Save' })).toBeEnabled();
    await userEvent.type(prefix, '{Enter}');
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });
});
