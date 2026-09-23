import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NoteSummary } from '@gisik-nokma/domain';
import { makeSubmittedFactory } from '../../src/submit.js';
import type { IngestScript } from '../helpers/fake-data-source.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { PROJECT, TICKET, WS } from '../helpers/seed.js';
import { TicketNotesSection } from '../../src/views/ticket-notes-section.js';
import { TicketSheet } from '../../src/views/ticket-sheet.js';
import type { TicketRead } from '../../src/view-types.js';
import { ticketStateSeed } from '../helpers/seed.js';

/**
 * Cases 18.241–18.246 — the ticket's Notes section (notes series, Plan 6 of 7,
 * spec §10.1–10.2). Case ids live in `test-cases/18-notes.md` §18.12.
 */

function note(overrides: Partial<NoteSummary> = {}): NoteSummary {
  return {
    noteId: 'note_1',
    workspaceId: WS,
    homeProjectId: PROJECT,
    authorId: 'user_kiro',
    title: 'Compressor log',
    scope: { mode: 'workspace' },
    attachedTickets: [],
    deleted: false,
    createdAt: '2026-08-18T08:00:00.000Z',
    updatedAt: '2026-08-18T08:00:00.000Z',
    ...overrides,
  };
}

const TWO_NOTES: NoteSummary[] = [
  note({ noteId: 'note_1', title: 'Compressor log', scope: { mode: 'workspace' } }),
  note({ noteId: 'note_2', title: 'Fridge maintenance', scope: { mode: 'private' } }),
];

function makeFactory() {
  return makeSubmittedFactory({ actorId: 'user_kiro', origin: 'web' });
}

afterEach(() => {
  cleanup();
});

describe('TicketNotesSection', () => {
  it('18.241 the section reads getNotesForTicket under a key that carries the ticket id, and the heading counts the notes', async () => {
    const getNotesForTicket = vi.fn(async () => []);
    const source = createFakeDataSource({ getNotesForTicket });
    const { rerender } = render(
      <TicketNotesSection
        dataSource={source}
        workspaceId={WS}
        ticketId={TICKET}
        projectId={PROJECT}
        currentUserId="user_kiro"
        canEdit
        make={makeFactory()}
        onRefusal={vi.fn()}
      />,
    );
    await screen.findByText('Notes · 0');
    expect(getNotesForTicket).toHaveBeenCalledTimes(1);
    expect(getNotesForTicket).toHaveBeenLastCalledWith(WS, TICKET);
    expect(screen.queryAllByRole('link')).toHaveLength(0);

    // The key must carry the ticket id: switching tickets on the SAME mounted
    // component (no unmount) must re-fetch for the new ticket. A key that
    // dropped the ticket id would leave `useLiveQuery`'s refetch effect
    // unchanged across this rerender, and `getNotesForTicket` would never be
    // called a second time.
    const OTHER_TICKET = 'ticket_other_0000000000000';
    rerender(
      <TicketNotesSection
        dataSource={source}
        workspaceId={WS}
        ticketId={OTHER_TICKET}
        projectId={PROJECT}
        currentUserId="user_kiro"
        canEdit
        make={makeFactory()}
        onRefusal={vi.fn()}
      />,
    );
    await waitFor(() => expect(getNotesForTicket).toHaveBeenCalledTimes(2));
    expect(getNotesForTicket).toHaveBeenLastCalledWith(WS, OTHER_TICKET);
  });

  const MINIMAL_READ: TicketRead = {
    ticket: ticketStateSeed(),
    title: 'File the GST return',
    stateProvenance: { actorId: 'user_anselma', actorName: 'Anselma Marak', clientTime: '2026-08-19T09:58:12.000Z', serverTime: '2026-08-19T10:00:00.000Z' },
    assignedProvenance: null,
    visibility: null,
    parent: null,
    rollup: null,
    key: null,
    epic: null,
  };

  it('18.241a the section sits between Subtasks and Comments in the Details tab', async () => {
    const getNotesForTicket = vi.fn(async () => []);
    const source = createFakeDataSource({ getTicket: async () => MINIMAL_READ, getNotesForTicket });
    const { container } = render(
      <TicketSheet dataSource={source} workspaceId={WS} ticketId={TICKET} currentUserId="user_kiro" onClose={vi.fn()} />,
    );
    await screen.findByTestId('ticket-notes');
    expect(
      container.querySelector('.gn-ticket-sheet__subtasks + .gn-ticket-sheet__notes + .gn-comments'),
    ).not.toBeNull();
  });

  it('18.242 one badge per note, linking to /notes/<id>, tinted by scope.mode, with the × only when canEdit', async () => {
    const source = createFakeDataSource({ getNotesForTicket: async () => TWO_NOTES });
    const { unmount } = render(
      <TicketNotesSection
        dataSource={source}
        workspaceId={WS}
        ticketId={TICKET}
        projectId={PROJECT}
        currentUserId="user_kiro"
        canEdit
        make={makeFactory()}
        onRefusal={vi.fn()}
      />,
    );
    await screen.findByText('Notes · 2');
    const link1 = screen.getByRole('link', { name: 'Compressor log' });
    expect(link1).toHaveAttribute('href', '/notes/note_1');
    expect(link1.closest('.gn-note-badge')).toHaveClass('gn-note-badge--workspace');
    const link2 = screen.getByRole('link', { name: 'Fridge maintenance' });
    expect(link2).toHaveAttribute('href', '/notes/note_2');
    expect(link2.closest('.gn-note-badge')).toHaveClass('gn-note-badge--private');
    expect(screen.getAllByRole('button', { name: /^Detach / })).toHaveLength(2);
    expect(screen.getByTestId('attach-note')).toBeInTheDocument();
    unmount();

    // Control: a reader gets the same links and no ×, and no Attach button.
    const readerSource = createFakeDataSource({ getNotesForTicket: async () => TWO_NOTES });
    render(
      <TicketNotesSection
        dataSource={readerSource}
        workspaceId={WS}
        ticketId={TICKET}
        projectId={PROJECT}
        currentUserId="user_kiro"
        canEdit={false}
        make={makeFactory()}
        onRefusal={vi.fn()}
      />,
    );
    await screen.findByText('Notes · 2');
    expect(screen.getByRole('link', { name: 'Compressor log' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /^Detach / })).toHaveLength(0);
    expect(screen.queryByTestId('attach-note')).not.toBeInTheDocument();
  });

  it('18.243 clicking × writes exactly one note.detached { ticketId } against the note, reloads, and shows a toast with Undo', async () => {
    const user = userEvent.setup();
    const getNotesForTicket = vi.fn(async () => TWO_NOTES);
    const source = createFakeDataSource({ getNotesForTicket });
    render(
      <TicketNotesSection
        dataSource={source}
        workspaceId={WS}
        ticketId={TICKET}
        projectId={PROJECT}
        currentUserId="user_kiro"
        canEdit
        make={makeFactory()}
        onRefusal={vi.fn()}
      />,
    );
    await screen.findByText('Notes · 2');
    expect(getNotesForTicket).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Detach Compressor log' }));
    await waitFor(() => expect(getNotesForTicket).toHaveBeenCalledTimes(2));
    expect(source.ingested).toHaveLength(1);
    expect(source.ingested[0]).toHaveLength(1);
    const event = source.ingested[0]![0]!;
    expect(event.type).toBe('note.detached');
    expect(event.entity).toEqual({ kind: 'note', id: 'note_1' });
    expect(event.payload).toEqual({ ticketId: TICKET });
    const toast = await screen.findByRole('status');
    expect(toast).toHaveTextContent('Detached "Compressor log"');
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
  });

  it('18.244 Undo writes note.attached { ticketId } and reloads; dismiss writes nothing (control)', async () => {
    const user = userEvent.setup();
    const getNotesForTicket = vi.fn(async () => TWO_NOTES);
    const source = createFakeDataSource({ getNotesForTicket });
    render(
      <TicketNotesSection
        dataSource={source}
        workspaceId={WS}
        ticketId={TICKET}
        projectId={PROJECT}
        currentUserId="user_kiro"
        canEdit
        make={makeFactory()}
        onRefusal={vi.fn()}
      />,
    );
    await screen.findByText('Notes · 2');
    await user.click(screen.getByRole('button', { name: 'Detach Compressor log' }));
    await screen.findByRole('status');
    expect(source.ingested).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(source.ingested).toHaveLength(2));
    const undoEvent = source.ingested[1]![0]!;
    expect(undoEvent.type).toBe('note.attached');
    expect(undoEvent.entity).toEqual({ kind: 'note', id: 'note_1' });
    expect(undoEvent.payload).toEqual({ ticketId: TICKET });
    await waitFor(() => expect(getNotesForTicket).toHaveBeenCalledTimes(3));

    // Control: dismissing a toast (the second note's detach) writes nothing.
    await user.click(screen.getByRole('button', { name: 'Detach Fridge maintenance' }));
    await screen.findByRole('status');
    const countBeforeDismiss = source.ingested.length;
    await user.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(source.ingested).toHaveLength(countBeforeDismiss);
  });

  it('18.245 a refused detach surfaces through onRefusal with the server\'s reason and shows no toast', async () => {
    const user = userEvent.setup();
    const getNotesForTicket = vi.fn(async () => TWO_NOTES);
    const ingestScript: IngestScript = (events) =>
      events.map((event) => ({
        status: 'refused' as const,
        eventId: event.id,
        rule: 'note.attachment.locked',
        reason: 'This note is locked.',
      }));
    const source = createFakeDataSource({ getNotesForTicket }, ingestScript);
    const onRefusal = vi.fn();
    render(
      <TicketNotesSection
        dataSource={source}
        workspaceId={WS}
        ticketId={TICKET}
        projectId={PROJECT}
        currentUserId="user_kiro"
        canEdit
        make={makeFactory()}
        onRefusal={onRefusal}
      />,
    );
    await screen.findByText('Notes · 2');
    await user.click(screen.getByRole('button', { name: 'Detach Compressor log' }));
    await waitFor(() =>
      expect(onRefusal).toHaveBeenCalledWith({ rule: 'note.attachment.locked', reason: 'This note is locked.' }),
    );
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('18.246 a live update (an event frame for the workspace) re-reads the section without a reload call', async () => {
    vi.useFakeTimers();
    try {
      const getNotesForTicket = vi.fn(async () => TWO_NOTES);
      const source = createFakeDataSource({ getNotesForTicket });
      render(
        <TicketNotesSection
          dataSource={source}
          workspaceId={WS}
          ticketId={TICKET}
          projectId={PROJECT}
          currentUserId="user_kiro"
          canEdit
          make={makeFactory()}
          onRefusal={vi.fn()}
        />,
      );
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(getNotesForTicket).toHaveBeenCalledTimes(1);
      act(() => {
        source.pushStreamItem({
          type: 'event',
          envelope: {
            id: '01J9GEVT000000000000000099',
            workspaceId: WS,
            entity: { kind: 'note', id: 'note_1' },
            type: 'note.detached',
            version: 1,
            payload: { ticketId: TICKET },
            actorId: 'user_anselma',
            origin: 'web',
            clientTime: '2026-08-20T08:59:00.000Z',
            serverTime: '2026-08-20T09:00:00.000Z',
            seq: 4,
            workspaceSeq: 9,
          },
        });
      });
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(getNotesForTicket).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
