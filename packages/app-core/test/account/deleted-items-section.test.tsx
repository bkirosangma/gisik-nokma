import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { formatIstInstant, type DeletedItem, type IngestResult, type SubmittedEvent } from '@gisik-nokma/domain';
import { DeletedItemsSection } from '../../src/account/deleted-items-section.js';
import { DeletedItemsFromCache } from '../../src/deleted-items-from-cache.js';
import { ReplicaGapError } from '../../src/replica/replica-data-source.js';
import {
  DELETED_ITEMS_EMPTY,
  DELETED_ITEMS_OFFLINE,
  PURGE_UNDER_WAY,
  UNMARK_BEFORE_RESTORE,
  deletedItemsAsOf,
  deletedItemsFailed,
  markItemName,
  restoreItemName,
  unmarkItemName,
} from '../../src/trash/copy.js';
import { createFakeDataSource, type IngestScript } from '../helpers/fake-data-source.js';

/** Trash series Plan 4, Task 9. Cases 19.251–19.256 (`test-cases/19-trash.md` §19.27). */

const NOW = new Date('2026-10-01T06:00:00.000Z');
const ME = 'user_kiro';

function row(over: Partial<DeletedItem>): DeletedItem {
  return {
    kind: 'ticket',
    id: 'tkt1',
    workspaceId: 'ws1',
    workspaceName: 'Convenience Corner',
    projectId: 'prj1',
    projectName: 'Shop operations',
    label: 'CCSO-3 Renew the lease',
    deletedBy: ME,
    deletedByName: 'Kiro',
    deletedAt: '2026-09-28T10:00:00.000Z',
    purgeMarkedAt: null,
    purgeDueAt: null,
    containedCount: 0,
    ...over,
  };
}
const WORKSPACE_ROW = row({
  kind: 'workspace', id: 'ws9', workspaceId: 'ws9', workspaceName: 'Old Shop', projectId: null, projectName: null,
  label: 'Old Shop', deletedAt: '2026-09-30T10:00:00.000Z', containedCount: 42,
});
const PROJECT_ROW = row({
  kind: 'project', id: 'prj2', projectId: 'prj2', projectName: 'Signage', label: 'Signage',
  deletedBy: 'user_ana', deletedByName: 'Anselma Marak', deletedAt: '2026-09-29T10:00:00.000Z', containedCount: 1,
});
const TICKET_ROW = row({ deletedBy: 'user_gone', deletedByName: null });
const MARKED_NOTE = row({
  kind: 'note', id: 'note1', label: 'Compressor log', projectId: null, projectName: null,
  deletedAt: '2026-09-27T10:00:00.000Z', purgeMarkedAt: '2026-09-28T11:00:00.000Z', purgeDueAt: '2026-10-13T11:00:00.000Z',
});

function mount(
  reads: Array<DeletedItem[] | Error>,
  opts: { script?: IngestScript; now?: () => Date } = {},
) {
  let call = 0;
  const source = createFakeDataSource(
    {
      getDeletedItems: async () => {
        const answer = reads[Math.min(call, reads.length - 1)]!;
        call += 1;
        if (answer instanceof Error) throw answer;
        return answer;
      },
    },
    opts.script,
  );
  render(<DeletedItemsSection dataSource={source} currentUserId={ME} now={opts.now ?? (() => NOW)} />);
  return { source, reads: () => call };
}
const types = (batch: SubmittedEvent[] | undefined) => (batch ?? []).map((event) => event.type);
const rowOf = (id: string) => screen.getByTestId(`deleted-item-${id}`);

describe('19.251–19.256 Account → Deleted items', () => {
  it('19.251 kind, label, where, who and when, and what is inside — in the served order', async () => {
    mount([[WORKSPACE_ROW, PROJECT_ROW, TICKET_ROW]]);
    const items = await screen.findAllByRole('listitem');
    expect(items.map((item) => item.getAttribute('data-testid'))).toEqual([
      'deleted-item-ws9', 'deleted-item-prj2', 'deleted-item-tkt1',
    ]);

    const ws = rowOf('ws9');
    expect(ws.querySelector('svg[data-kind="workspace"]')).toHaveAttribute('aria-hidden', 'true');
    expect(within(ws).getByText('Old Shop')).toBeInTheDocument();
    expect(within(ws).getByText('Workspace')).toBeInTheDocument();
    expect(within(ws).getByText('Deleted by you, 30 Sep')).toBeInTheDocument();
    expect(within(ws).getByText('and 42 items inside')).toBeInTheDocument();

    const project = rowOf('prj2');
    expect(within(project).getByText('Project, Convenience Corner')).toBeInTheDocument();
    expect(within(project).getByText('Deleted by Anselma Marak, 29 Sep')).toBeInTheDocument();
    expect(within(project).getByText('and 1 item inside')).toBeInTheDocument();

    const ticket = rowOf('tkt1');
    expect(within(ticket).getByText('Ticket, Convenience Corner › Shop operations')).toBeInTheDocument();
    expect(within(ticket).getByText('Deleted by someone, 28 Sep')).toBeInTheDocument();
    // CONTROL — nothing inside a ticket.
    expect(within(ticket).queryByText(/inside$/)).toBeNull();
  });

  it('19.252 empty, offline and failed are three different sentences', async () => {
    mount([[]]);
    expect(await screen.findByText(DELETED_ITEMS_EMPTY)).toBeInTheDocument();
    cleanup();

    mount([new ReplicaGapError('getDeletedItems', [])]);
    expect(await screen.findByText(DELETED_ITEMS_OFFLINE)).toBeInTheDocument();
    expect(screen.queryByText(DELETED_ITEMS_EMPTY)).toBeNull();
    cleanup();

    mount([new Error('503 Service Unavailable')]);
    expect(await screen.findByRole('alert')).toHaveTextContent(deletedItemsFailed('503 Service Unavailable'));
    expect(screen.queryByText(DELETED_ITEMS_EMPTY)).toBeNull();
  });

  it('19.253 Restore undeletes by kind, Mark marks by kind, each re-reads; CONTROL: no Unmark on an unmarked row', async () => {
    const first = mount([[PROJECT_ROW], []]);
    const project = await screen.findByTestId('deleted-item-prj2');
    expect(within(project).queryByRole('button', { name: unmarkItemName('Signage') })).toBeNull();
    await userEvent.click(within(project).getByRole('button', { name: restoreItemName('Signage') }));
    await waitFor(() => expect(first.source.ingested).toHaveLength(1));
    expect(types(first.source.ingested[0])).toEqual(['project.undeleted']);
    expect(first.source.ingested[0]![0]).toMatchObject({ workspaceId: 'ws1', entity: { kind: 'project', id: 'prj2' } });
    expect(await screen.findByText(DELETED_ITEMS_EMPTY)).toBeInTheDocument();
    cleanup();

    const second = mount([[TICKET_ROW]]);
    await userEvent.click(await screen.findByRole('button', { name: markItemName(TICKET_ROW.label) }));
    await waitFor(() => expect(second.source.ingested).toHaveLength(1));
    expect(types(second.source.ingested[0])).toEqual(['purge.marked']);
    expect(second.source.ingested[0]![0]).toMatchObject({ entity: { kind: 'ticket', id: 'tkt1' } });
    await waitFor(() => expect(second.reads()).toBe(2));
  });

  it('19.254 a marked row: its date, Unmark, and a disabled Restore with its reason; CONTROL: no Mark', async () => {
    const { source } = mount([[MARKED_NOTE]]);
    const note = await screen.findByTestId('deleted-item-note1');
    expect(within(note).getByText('Permanently deleted on 13 Oct')).toBeInTheDocument();
    expect(within(note).getByRole('button', { name: restoreItemName('Compressor log') })).toBeDisabled();
    expect(within(note).getByText(UNMARK_BEFORE_RESTORE)).toBeInTheDocument();
    expect(within(note).queryByRole('button', { name: markItemName('Compressor log') })).toBeNull();
    await userEvent.click(within(note).getByRole('button', { name: unmarkItemName('Compressor log') }));
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    expect(types(source.ingested[0])).toEqual(['purge.unmarked']);
    expect(source.ingested[0]![0]).toMatchObject({ entity: { kind: 'note', id: 'note1' } });
  });

  it('19.255 overdue: the date stays, Unmark goes; CONTROL: a millisecond earlier Unmark is there', async () => {
    const due = new Date(MARKED_NOTE.purgeDueAt!);
    mount([[MARKED_NOTE]], { now: () => due });
    const note = await screen.findByTestId('deleted-item-note1');
    expect(within(note).getByText('Permanently deleted on 13 Oct')).toBeInTheDocument();
    expect(within(note).queryByRole('button', { name: unmarkItemName('Compressor log') })).toBeNull();
    expect(within(note).getByRole('button', { name: restoreItemName('Compressor log') })).toBeDisabled();
    expect(within(note).getByText(PURGE_UNDER_WAY)).toBeInTheDocument();
    cleanup();

    mount([[MARKED_NOTE]], { now: () => new Date(due.getTime() - 1) });
    const earlier = await screen.findByTestId('deleted-item-note1');
    expect(within(earlier).getByRole('button', { name: unmarkItemName('Compressor log') })).toBeInTheDocument();
  });

  it('19.256 a double press posts one batch; a refusal lands in that row', async () => {
    const reason = 'This ticket is already marked for permanent deletion.';
    let answer: () => void = () => undefined;
    const { source } = mount([[TICKET_ROW]], {
      script: (events) =>
        new Promise<IngestResult[]>((resolve) => {
          answer = () =>
            resolve(events.map((event) => ({ status: 'refused' as const, eventId: event.id, rule: 'lifecycle.state', reason })));
        }),
    });
    const mark = await screen.findByRole('button', { name: markItemName(TICKET_ROW.label) });
    fireEvent.click(mark);
    fireEvent.click(mark);
    expect(source.ingested).toHaveLength(1);
    // CONTROL — pending means disabled.
    expect(mark).toBeDisabled();
    await act(async () => answer());
    expect(await within(rowOf('tkt1')).findByRole('alert')).toHaveTextContent(reason);
  });

  it('19.256 a press while the re-read after a committed act is still in flight posts nothing', async () => {
    let releaseRead: () => void = () => undefined;
    let reads = 0;
    const source = createFakeDataSource({
      getDeletedItems: async () => {
        reads += 1;
        if (reads > 1) await new Promise<void>((resolve) => { releaseRead = resolve; });
        return [TICKET_ROW];
      },
    });
    render(<DeletedItemsSection dataSource={source} currentUserId={ME} now={() => NOW} />);
    const mark = await screen.findByRole('button', { name: markItemName(TICKET_ROW.label) });
    fireEvent.click(mark);
    await waitFor(() => expect(source.ingested).toHaveLength(1));
    await waitFor(() => expect(reads).toBe(2));
    // The ingest has answered; the row is still drawn from the old read.
    fireEvent.click(screen.getByRole('button', { name: markItemName(TICKET_ROW.label) }));
    expect(source.ingested).toHaveLength(1);
    await act(async () => releaseRead());
  });
});

describe('19.198–19.199 the saved copy, offline', () => {
  const READ_AT = '2026-09-30T04:30:00.000Z';

  it('19.198 draws the saved rows read-only under the as-of line', async () => {
    mount([new DeletedItemsFromCache([TICKET_ROW, MARKED_NOTE], READ_AT)]);
    expect(await screen.findByText(deletedItemsAsOf(formatIstInstant(READ_AT)))).toBeInTheDocument();
    expect(rowOf('tkt1')).toBeInTheDocument();
    expect(rowOf('note1')).toBeInTheDocument();
    expect(within(screen.getByRole('list')).queryAllByRole('button')).toEqual([]);
    expect(screen.queryByText(UNMARK_BEFORE_RESTORE)).toBeNull();
    expect(screen.queryByText(DELETED_ITEMS_OFFLINE)).toBeNull();
    cleanup();
    // CONTROL
    mount([new ReplicaGapError('getDeletedItems', [])]);
    expect(await screen.findByText(DELETED_ITEMS_OFFLINE)).toBeInTheDocument();
    expect(screen.queryByText(DELETED_ITEMS_EMPTY)).toBeNull();
  });

  it('19.199 pins the copy; an empty saved list is "Nothing deleted." as of then', async () => {
    expect(deletedItemsAsOf('30 Sep 2026, 10:00')).toBe(
      'Deleted items as of 30 Sep 2026, 10:00, saved on this device. Restoring and marking need a connection.',
    );
    mount([new DeletedItemsFromCache([], READ_AT)]);
    expect(await screen.findByText(DELETED_ITEMS_EMPTY)).toBeInTheDocument();
    expect(screen.getByText(deletedItemsAsOf(formatIstInstant(READ_AT)))).toBeInTheDocument();
    expect(screen.queryByText(DELETED_ITEMS_OFFLINE)).toBeNull();
    cleanup();
    // CONTROL
    mount([[]]);
    expect(await screen.findByText(DELETED_ITEMS_EMPTY)).toBeInTheDocument();
    expect(screen.queryByText(/saved on this device/)).toBeNull();
  });
});
