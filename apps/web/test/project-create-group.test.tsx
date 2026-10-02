import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { GroupRow, IngestResult, SubmittedEvent } from '@gisik-nokma/domain';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import WorkspaceHomePage from '../app/w/[workspaceId]/page.js';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Prefixes and groups P-T13, cases 22.240 and 22.241 (`test-cases/22-prefixes-and-groups.md`, "P-T13
 * follow-ups"): the Create project dialog's group picker (22.246 / 22.247: a refused group never founds a duplicate
 * project). The mount mirrors `workspace-home-project-edit.test.tsx`
 * (22.187 is the Edit form's twin of 22.241): `groupReads` is advanced by each READ of the groups.
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

const workspace: WorkspaceRef = {
  id: WORKSPACE,
  name: 'Convenience Corner',
  prefix: 'CC',
  role: 'admin',
  archived: false,
  memberCount: 5,
  nameRestrictedProjectCount: 0,
  projects: [{ id: 'p1', name: 'Shop operations', prefix: 'SO', archived: false, ticketCount: 9, blockedCount: 0 }],
};

const group = (id: string, name: string): GroupRow => ({
  id,
  parentId: null,
  level: 1,
  name,
  rank: id,
  projectCount: 0,
  childCount: 0,
});
const GROUPS = [group('g1', 'Shops')];

function commit(event: SubmittedEvent): IngestResult {
  return { status: 'committed', eventId: event.id, seq: 1, serverTime: '2026-10-02T10:00:00.000Z' };
}
const refuse = (event: SubmittedEvent, rule: string, reason: string): IngestResult => ({
  status: 'refused',
  eventId: event.id,
  rule,
  reason,
}) as IngestResult;

function mount(answer: (event: SubmittedEvent) => IngestResult = commit, groupReads: GroupRow[][] = [GROUPS]) {
  let groupAsks = 0;
  const harness = mountWith(answer, () => groupReads[Math.min(groupAsks++, groupReads.length - 1)]!);
  return { ...harness, groupAsks: () => groupAsks };
}

function mountWith(answer: (event: SubmittedEvent) => IngestResult, readGroups: () => GroupRow[]) {
  const sent: SubmittedEvent[][] = [];
  const services = stubServices({
    getMyWorkspaces: async () => [workspace],
    getGroups: async () => readGroups(),
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

/**
 * A server that remembers, as the real one does: `ingestAll` (`apps/server/src/ingest/ingest-service.ts:432-446`)
 * commits or refuses each event ON ITS OWN, in order, and goes on after a refusal — a batch is not atomic, and
 * what committed in call 1 is still there in call 2. It answers what the door answers: a `group.created` whose
 * name is taken is `group.name-taken`; a `project.updated {groupId}` for a group nobody made is `group.unknown`;
 * a `project.created` for an id already committed is refused. `override` lets a test refuse one event type.
 */
function serverModel(taken: GroupRow[] = [], override: (event: SubmittedEvent) => IngestResult | null = () => null) {
  const ids = new Set<string>(GROUPS.map((row) => row.id));
  const rows: GroupRow[] = [...GROUPS, ...taken];
  taken.forEach((row) => ids.add(row.id));
  const committed: SubmittedEvent[] = [];
  const answer = (event: SubmittedEvent): IngestResult => {
    const refused = override(event);
    if (refused !== null) return refused;
    const payload = event.payload as { name?: string; groupId?: string; parentId?: string | null; level?: number; rank?: string };
    if (event.type === 'group.created') {
      if (rows.some((row) => row.parentId === (payload.parentId ?? null) && row.name.toLowerCase() === payload.name!.toLowerCase())) {
        return refuse(event, 'group.name-taken', `There is already a group called ${payload.name} here.`);
      }
      ids.add(event.entity.id);
      rows.push({ id: event.entity.id, parentId: payload.parentId ?? null, level: payload.level as GroupRow['level'], name: payload.name!, rank: payload.rank!, projectCount: 0, childCount: 0 });
    } else if (event.type === 'project.created') {
      if (ids.has(event.entity.id)) return refuse(event, 'event.duplicate', 'That project already exists.');
      ids.add(event.entity.id);
    } else if (event.entity.kind === 'project' && !ids.has(event.entity.id)) {
      return refuse(event, 'project.unknown', 'That project does not exist.'); // its founding was refused
    } else if (event.type === 'project.updated' && payload.groupId !== undefined && !ids.has(payload.groupId)) {
      return refuse(event, 'group.unknown', 'That group does not exist.');
    }
    committed.push(event);
    return commit(event);
  };
  return { answer, groups: () => [...rows], committed: (type: string) => committed.filter((event) => event.type === type) };
}

async function openDialog(name: string) {
  await userEvent.click(await screen.findByRole('button', { name: 'Create project' }));
  const dialog = await screen.findByRole('dialog', { name: 'Create project' });
  await userEvent.type(within(dialog).getByPlaceholderText('e.g. Phase 2 rollout'), name);
  return dialog;
}

const types = (batch: SubmittedEvent[]) => batch.map((event) => event.type);

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('22.240 the Create project dialog files the project under the chosen group', () => {
  it('22.240 an existing group sends [project.created, project.member_added, project.updated {groupId}] in ONE call', async () => {
    const { sent } = mount();
    const dialog = await openDialog('Cold chain');
    await userEvent.type(await within(dialog).findByLabelText('Level 1 group'), 'Shops{Enter}');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(sent).toHaveLength(1));

    // `project.created` has no `groupId` (its payload is name/description/prefix), so the group rides as an update.
    expect(types(sent[0]!)).toEqual(['project.created', 'project.member_added', 'project.updated']);
    const [created, , updated] = sent[0]!;
    expect(created!.payload).not.toHaveProperty('groupId');
    expect(updated!.payload).toEqual({ groupId: 'g1' });
    expect(updated!.entity).toEqual(created!.entity);
  });

  it('22.240 control: no group chosen sends no groupId and no project.updated', async () => {
    const { sent } = mount();
    const dialog = await openDialog('Cold chain');
    await within(dialog).findByLabelText('Level 1 group'); // the picker is there; the person leaves it alone
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(sent).toHaveLength(1));

    expect(types(sent[0]!)).toEqual(['project.created', 'project.member_added']);
    expect(JSON.stringify(sent[0])).not.toContain('groupId');
  });
});

describe('22.241 an inline-created group in the Create project dialog', () => {
  it('22.241 files group.created in its OWN call first, then the project events under the new id', async () => {
    const { sent } = mount();
    const dialog = await openDialog('Cold chain');
    await userEvent.type(await within(dialog).findByLabelText('Level 1 group'), 'Wholesale{Enter}');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(sent).toHaveLength(2));

    expect(types(sent[0]!)).toEqual(['group.created']);
    expect(types(sent[1]!)).toEqual(['project.created', 'project.member_added', 'project.updated']);
    const [made] = sent[0]!;
    expect(made!.payload).toMatchObject({ parentId: null, level: 1, name: 'Wholesale' });
    expect(sent[1]![2]!.payload).toEqual({ groupId: made!.entity.id });
  });

  it('22.241 group.name-taken founds NO project, re-reads the groups, adopts the existing group and stays open; the next Create sends only the existing id', async () => {
    const taken = 'There is already a group called Wholesale here.';
    const wholesale = group('g9', 'Wholesale');
    const model = serverModel([wholesale]);
    const { sent, groupAsks } = mount(model.answer, [GROUPS, [...GROUPS, wholesale]]);
    const dialog = await openDialog('Cold chain');
    await userEvent.type(await within(dialog).findByLabelText('Level 1 group'), 'Wholesale{Enter}');
    const asksBefore = groupAsks();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(sent).toHaveLength(1));

    expect(await within(dialog).findByText(taken, { exact: true })).toBeInTheDocument(); // the reason, under the picker
    expect(await within(dialog).findByText('Using the existing Wholesale.')).toBeInTheDocument();
    expect(groupAsks()).toBeGreaterThan(asksBefore); // it asked again
    expect(within(dialog).getByLabelText('Level 1 group')).toHaveValue('Wholesale');
    expect(within(dialog).queryByText('New')).toBeNull(); // no longer pending: it is the existing group
    expect(screen.getByRole('dialog', { name: 'Create project' })).toBeInTheDocument(); // stays open
    expect(sent).toHaveLength(1); // no automatic resubmit
    expect(types(sent[0]!)).toEqual(['group.created']); // the refusal came before any project event
    expect(model.committed('project.created')).toHaveLength(0);
    expect(screen.queryAllByRole('alert')).toHaveLength(1); // announced once: under the picker, not again on the page

    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(sent).toHaveLength(2));
    expect(sent[1]!.some((event) => event.type === 'group.created')).toBe(false);
    expect(sent[1]!.find((event) => event.type === 'project.updated')!.payload).toEqual({ groupId: 'g9' });
  });

  it('22.241 control: a refusal that is not about a field does not re-read the groups and shows once, on the dialog', async () => {
    const { sent, groupAsks } = mount((event) => refuse(event, 'permission.role', 'Only an admin can do that.'));
    const dialog = await openDialog('Cold chain');
    await userEvent.type(await within(dialog).findByLabelText('Level 1 group'), 'Wholesale{Enter}');
    const asksBefore = groupAsks();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(sent).toHaveLength(1));
    await within(dialog).findByText(/Only an admin can do that\./);
    expect(groupAsks()).toBe(asksBefore);
  });
});

describe('22.246 / 22.247 a refused submit never leaves a duplicate project or a duplicate group', () => {
  it('22.246 a group refused group.name-taken, then a retry: exactly ONE project.created commits, filed under the existing group', async () => {
    const wholesale = group('g9', 'Wholesale'); // someone made it first
    const model = serverModel([wholesale]);
    const { sent } = mount(model.answer, [GROUPS, [...GROUPS, wholesale]]);
    const dialog = await openDialog('Cold chain');
    await userEvent.type(await within(dialog).findByLabelText('Level 1 group'), 'Wholesale{Enter}');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));
    await within(dialog).findByText('Using the existing Wholesale.');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create project' })).toBeNull()); // committed: closed

    // Across ALL calls, one project; the control (same `it`) is that it is filed under the group.
    expect(sent.flat().filter((event) => event.type === 'project.created')).toHaveLength(1);
    expect(model.committed('project.created')).toHaveLength(1);
    expect(model.committed('project.updated').map((event) => event.payload)).toEqual([{ groupId: 'g9' }]);
  });

  it('22.247 a group that commits while the project is refused: the retry sends no group.created and the project files under that group', async () => {
    let refusedOnce = false;
    const model = serverModel([], (event) => {
      if (event.type !== 'project.created' || refusedOnce) return null;
      refusedOnce = true;
      return refuse(event, 'project.prefix-taken', 'That prefix is taken.');
    });
    // Re-reads answer what the server holds NOW, so the group call 1 committed is drawn on the second read.
    const { sent } = mountWith(model.answer, model.groups);
    const dialog = await openDialog('Cold chain');
    await userEvent.type(await within(dialog).findByLabelText('Level 1 group'), 'Wholesale{Enter}');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));
    await within(dialog).findByText(/project\.prefix-taken: That prefix is taken\./);
    expect(model.committed('group.created')).toHaveLength(1); // the group committed; the project did not

    // The picker holds it as an EXISTING group, not a pending one.
    expect(within(dialog).getByLabelText('Level 1 group')).toHaveValue('Wholesale');
    expect(within(dialog).queryByText('New')).toBeNull();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Create project' })).toBeNull());

    const madeId = model.committed('group.created')[0]!.entity.id;
    expect(sent.flat().filter((event) => event.type === 'group.created')).toHaveLength(1); // no second group.created
    expect(model.groups().filter((row) => row.name === 'Wholesale')).toHaveLength(1); // no orphan, no duplicate group
    expect(model.committed('project.created')).toHaveLength(1);
    expect(model.committed('project.updated').map((event) => event.payload)).toEqual([{ groupId: madeId }]);
  });
});
