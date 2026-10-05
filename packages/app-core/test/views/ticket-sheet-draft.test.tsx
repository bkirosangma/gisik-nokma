import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SubmittedEvent } from '@gisik-nokma/domain';
import { OfflineAcceptError } from '../../src/replica/replica-data-source.js';
import type { DraftRow, TicketRead } from '../../src/view-types.js';
import { DRAFT_VISIBILITY_DISCLOSURE } from '../../src/views/drafts-copy.js';
import type { EditorSlotComponent } from '../../src/views/editor-slot.js';
import { TicketSheet } from '../../src/views/ticket-sheet.js';
import { OWNER_ALWAYS_SEES_COPY, READ_ONLY_COPY } from '../../src/views/visibility-editor.js';
import { createFakeDataSource, type FakeDataSource } from '../helpers/fake-data-source.js';
import { TICKET, WF_ERRAND, WS, claim, ticketStateSeed } from '../helpers/seed.js';

/**
 * Cases 28.170-28.175 and 28.195 (drafts T8): the sheet of a draft. The read builder is `ticket-sheet.test.tsx`'s
 * `ticketRead`, cut down; `renderSheet` returns the spies and a stream frame the sheet's reads reload on.
 */
afterEach(cleanup);

const committed = { status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-03T09:00:00.000Z' } as const;

function ticketRead(overrides: Partial<TicketRead> = {}): TicketRead {
  return {
    ticket: ticketStateSeed(),
    title: 'Pave the lane',
    stateProvenance: claim(),
    assignedProvenance: null,
    parent: null,
    rollup: null,
    key: 'RP-1',
    epic: null,
    visibility: { ownMode: 'inherit', resolvedMode: 'project' },
    ...overrides,
  };
}
const draftRead = (extra: Partial<TicketRead> = {}): TicketRead => ({
  ...ticketRead({ key: null, ticket: ticketStateSeed({ stateId: 'backlog', stateCategory: 'open' }) }),
  draft: true,
  ...extra,
});

/** A composer slot that draws its placeholder, so the comment box is findable by it. */
const editorSlot: EditorSlotComponent = (props) => <textarea aria-label={props.mode} placeholder={props.placeholder} readOnly />;

function source(overrides: Parameters<typeof createFakeDataSource>[0], ingest?: Parameters<typeof createFakeDataSource>[1]): FakeDataSource {
  return createFakeDataSource(
    {
      getWorkflowDef: async () => WF_ERRAND,
      getMembers: async () => [{ id: 'user_kiro', name: 'Kiro', role: 'owner' }],
      getTicketTypes: async () => [{ id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-errand', fields: [] }],
      ...overrides,
    },
    ingest,
  );
}

function renderSheet(dataSource: FakeDataSource, extra: Partial<Parameters<typeof TicketSheet>[0]> = {}) {
  const onClose = vi.fn();
  const onDraftChanged = vi.fn();
  render(
    <TicketSheet dataSource={dataSource} workspaceId={WS} ticketId={TICKET} currentUserId="user_kiro" onClose={onClose}
      onDraftChanged={onDraftChanged} editorSlot={editorSlot} workspaceName="Roads Co" projectName="Roads" {...extra} />,
  );
  let seq = 100;
  const anyFrame = () => {
    seq += 1;
    return {
      type: 'event' as const,
      envelope: {
        id: `01J9GEVT0000000000000000${String(seq)}`, workspaceId: WS, entity: { kind: 'ticket' as const, id: TICKET },
        type: 'ticket.field_set', version: 1, payload: { field: 'title', value: 'Pave the lane' }, actorId: 'user_kiro',
        origin: 'web' as const, clientTime: '2026-10-03T09:00:00.000Z', serverTime: '2026-10-03T09:00:00.000Z', seq, workspaceSeq: seq,
      },
    };
  };
  return { onClose, onDraftChanged, anyFrame };
}

describe('28.170 the pill', () => {
  it('28.170 a draft shows the pill in the key place; a keyed ticket shows the key and no pill; a publish swaps them', async () => {
    let current: TicketRead = draftRead();
    const ds = source({ getTicket: async () => current }, (events) => {
      current = ticketRead({ key: 'RP-7' });
      return events.map(() => committed);
    });
    renderSheet(ds);
    const crumb = await screen.findByTestId('sheet-crumb-ticket');
    expect(within(crumb).getByText('Draft')).toHaveClass('gn-draft-pill');
    expect(crumb).not.toHaveTextContent('Pave the lane');
    await userEvent.setup().click(screen.getByRole('button', { name: 'Publish' }));
    await waitFor(() => expect(screen.getByTestId('sheet-crumb-ticket')).toHaveTextContent('RP-7'));
    expect(within(screen.getByTestId('sheet-crumb-ticket')).queryByText('Draft')).toBeNull();
  });
});

describe('28.171 the banner', () => {
  it('28.171 text, a primary Publish and a Discard', async () => {
    renderSheet(source({ getTicket: async () => draftRead() }));
    const text = await screen.findByText('Only you can see this draft.');
    const banner = text.closest('.gn-draft-banner') as HTMLElement;
    expect(banner).not.toBeNull();
    expect(within(banner).getByRole('button', { name: 'Publish' })).toHaveClass('gn-button--primary');
    expect(within(banner).getByRole('button', { name: 'Discard' })).toBeInTheDocument();
  });
  it('28.171 control: a published ticket has no banner', async () => {
    renderSheet(source({ getTicket: async () => ticketRead() }));
    await screen.findByTestId('sheet-crumb-ticket');
    expect(screen.queryByText('Only you can see this draft.')).toBeNull();
    expect(document.querySelector('.gn-draft-banner')).toBeNull();
  });
});

describe('28.172 tabs and comments', () => {
  it('28.172 a draft has Details and Attachments and offers no comment composer', async () => {
    renderSheet(source({ getTicket: async () => draftRead() }));
    const tabs = await screen.findByRole('tablist', { name: 'Ticket sections' });
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Details', 'Attachments']);
    expect(screen.queryByPlaceholderText('Add a comment, or type @ to mention someone')).toBeNull();
  });
  it('28.172 a sheet that had History open returns to Details when the read says draft', async () => {
    let current: TicketRead = ticketRead();
    const ds = source({ getTicket: async () => current });
    const handle = renderSheet(ds);
    await userEvent.setup().click(await screen.findByRole('tab', { name: 'History' }));
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
    current = draftRead();
    await act(async () => { ds.pushStreamItem(handle.anyFrame()); });
    await waitFor(() => expect(screen.queryByRole('tab', { name: 'History' })).toBeNull(), { timeout: 4_000 });
    expect(screen.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
  });
  it('28.172 control: the published ticket has all three tabs and its comment composer', async () => {
    renderSheet(source({ getTicket: async () => ticketRead() }));
    const tabs = await screen.findByRole('tablist', { name: 'Ticket sections' });
    expect(within(tabs).getAllByRole('tab').map((t) => t.textContent)).toEqual(['Details', 'History', 'Attachments']);
    expect(await screen.findByPlaceholderText('Add a comment, or type @ to mention someone')).toBeInTheDocument();
  });
});

describe('28.173 disabled, not removed', () => {
  it('28.173 Move, the phone Move and Delete are disabled with the reason; their rows stay', async () => {
    renderSheet(source({ getTicket: async () => draftRead() }));
    await screen.findByTestId('sheet-crumb-ticket');
    for (const control of [
      screen.getByRole('button', { name: 'Move…' }),
      screen.getByRole('button', { name: 'Move this ticket' }),
      screen.getByRole('button', { name: 'Delete' }),
    ]) {
      expect(control).toBeDisabled();
      expect(control).toHaveAccessibleDescription('Available after you publish');
    }
    expect(screen.getByTestId('field-state')).toBeInTheDocument();
    // Two visible copies, exactly: the state row (with the id) and the footer. The header `Move this ticket` points
    // at the state row's copy and adds none; the visibility block carries none (it is replaced on a draft, 28.195).
    expect(screen.getAllByText('Available after you publish')).toHaveLength(2);
  });
  it('28.173 control: on a published ticket each is enabled and no reason is drawn', async () => {
    renderSheet(source({ getTicket: async () => ticketRead() }));
    await screen.findByTestId('sheet-crumb-ticket');
    expect(screen.getByRole('button', { name: 'Move…' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Move this ticket' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeEnabled();
    expect(screen.getByTestId('visibility-editor').querySelector('.gn-visibility__trigger')).toBeEnabled();
    expect(screen.queryByText('Available after you publish')).toBeNull();
  });
});

/** Case 28.195 (planner ruling 2026-10-04, T8-Q1; reworked, planner ruling 2026-10-04, follow-up). */
describe('28.195 the R17 disclosure on a draft', () => {
  it('28.195 a draft shows the disclosure and no visibility editor; control: a published ticket shows the editor and both lines', async () => {
    // `canSetVisibility: false` on BOTH renders, so the read-only arm is live in the control and the only difference
    // between the two is `draft`.
    renderSheet(source({ getTicket: async () => ticketRead() }), { canSetVisibility: false });
    await screen.findByTestId('sheet-crumb-ticket');
    const editor = screen.getByTestId('visibility-editor');
    expect(editor.querySelector('.gn-visibility__trigger')).not.toBeNull();
    expect(within(editor).getByText(OWNER_ALWAYS_SEES_COPY)).toBeInTheDocument();
    expect(within(editor).getByText(READ_ONLY_COPY)).toBeInTheDocument();
    expect(screen.queryByText(DRAFT_VISIBILITY_DISCLOSURE)).toBeNull();
    cleanup();
    renderSheet(source({ getTicket: async () => draftRead() }), { canSetVisibility: false });
    await screen.findByTestId('sheet-crumb-ticket');
    expect(screen.getAllByText(DRAFT_VISIBILITY_DISCLOSURE)).toHaveLength(1);
    expect(screen.queryByTestId('visibility-editor')).toBeNull();
    expect(document.querySelector('.gn-visibility__trigger')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Who can see this' })).toBeNull();
    expect(screen.queryByText(OWNER_ALWAYS_SEES_COPY)).toBeNull();
    expect(screen.queryByText(READ_ONLY_COPY)).toBeNull();
  });
});

describe('28.174 Publish from the sheet', () => {
  it('28.174 no confirmation; the events of 28.160; a reload; onDraftChanged', async () => {
    let current: TicketRead = draftRead();
    const ds = source(
      {
        getTicket: async () => current,
        getTickets: async (projectId) => ({ projectId, rows: [{ ticketId: 'a', stateId: 'backlog', rank: 'a0' }, { ticketId: 'u', stateId: 'backlog', rank: null }] }) as never,
      },
      (events) => {
        current = ticketRead({ key: 'RP-7' });
        return events.map(() => committed);
      },
    );
    const { onDraftChanged } = renderSheet(ds);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Publish' }));
    // The sheet IS a `role="dialog"` (`packages/ui/src/components/sheet.tsx`); a confirmation would be a second one.
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    // The unranked Backlog row `u` is backfilled, so the events prove the sheet read ITS source's Backlog.
    await waitFor(() => expect(ds.ingested).toHaveLength(1));
    expect(ds.ingested[0]!.map((e: SubmittedEvent) => [e.type, e.entity.id])).toEqual([
      ['ticket.published', TICKET], ['ticket.ranked', 'u'], ['ticket.ranked', TICKET],
    ]);
    await waitFor(() => expect(onDraftChanged).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByTestId('sheet-crumb-ticket')).toHaveTextContent('RP-7'));
  });
  it('28.174 a refusal is shown verbatim and the pill stays; an unanswered publish says the plan sentence', async () => {
    renderSheet(source({ getTicket: async () => draftRead() }, (events) => events.map((e) => ({ status: 'refused' as const, eventId: e.id, rule: 'draft.parent-unpublished', reason: 'Publish the parent first' }))));
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Publish' }));
    expect(await screen.findByText(/Publish the parent first/)).toBeInTheDocument();
    expect(within(screen.getByTestId('sheet-crumb-ticket')).getByText('Draft')).toBeInTheDocument();
    cleanup();
    const { onDraftChanged } = renderSheet(source({ getTicket: async () => draftRead() }, () => { throw new Error('socket'); }));
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Publish' }));
    expect((await screen.findByText('Could not publish this draft. Check your connection and try again.'))).toHaveAttribute('role', 'alert');
    expect(onDraftChanged).not.toHaveBeenCalled();
  });
  it('28.174 a publish queued offline keeps the pill and says Waiting to sync (decision 4)', async () => {
    const { onDraftChanged } = renderSheet(source({ getTicket: async () => draftRead() }, () => { throw new OfflineAcceptError([{ status: 'pending', eventId: 'e1' }]); }));
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Publish' }));
    const banner = (await screen.findByText('Only you can see this draft.')).closest('.gn-draft-banner') as HTMLElement;
    expect(await within(banner).findByText('Waiting to sync')).toBeInTheDocument();
    expect(within(screen.getByTestId('sheet-crumb-ticket')).getByText('Draft')).toBeInTheDocument();
    expect(onDraftChanged).toHaveBeenCalledTimes(1); // the hosts re-read: the replica now lists the draft `pending`
  });
});

describe('28.175 Discard from the sheet', () => {
  // `other` is an unrelated draft whose count must not be summed.
  const row = (ticketId: string, parentId: string | null, attachmentCount: number): DraftRow => ({
    ticketId, projectId: 'p', projectName: 'Roads', typeId: 'task', title: ticketId, parentId, updatedAt: '2026-10-03T08:00:00.000Z', attachmentCount, pending: false,
  });
  const rows = [row(TICKET, null, 2), row('k', TICKET, 1), row('other', null, 5)];
  it("28.175 reads the list once, shows this draft's counts, confirms with one event, closes and calls onDraftChanged", async () => {
    const getMyDrafts = vi.fn(async () => rows);
    const ds = source({ getTicket: async () => draftRead(), getMyDrafts }, (events) => events.map(() => committed));
    const { onClose, onDraftChanged } = renderSheet(ds);
    const user = userEvent.setup();
    await screen.findByTestId('sheet-crumb-ticket');
    expect(getMyDrafts).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Discard' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Discard draft' });
    expect(getMyDrafts).toHaveBeenCalledTimes(1);
    expect(within(dialog).getByText('Pave the lane')).toBeInTheDocument();
    expect(within(dialog).getByText('1 sub-draft will be erased too')).toBeInTheDocument();
    expect(within(dialog).getByText('3 attachments uploaded to this draft will be permanently deleted')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Discard draft' }));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(ds.ingested.map((batch) => batch.map((e) => [e.type, e.entity.id, e.payload]))).toEqual([[['ticket.discarded', TICKET, {}]]]);
    expect(onDraftChanged).toHaveBeenCalledTimes(1);
  });
  it('28.175 a failed list read opens no dialog and says why', async () => {
    renderSheet(source({ getTicket: async () => draftRead(), getMyDrafts: async () => { throw new Error('down'); } }));
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Discard' }));
    expect(await screen.findByText("Could not read this draft's sub-drafts. Try again.")).toHaveAttribute('role', 'alert');
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
