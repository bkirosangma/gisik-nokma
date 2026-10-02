import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NoteSummary } from '@gisik-nokma/domain';
import { makeSubmittedFactory } from '../../src/submit.js';
import type { IngestScript } from '../helpers/fake-data-source.js';
import { createFakeDataSource } from '../helpers/fake-data-source.js';
import { PROJECT, TICKET, WS } from '../helpers/seed.js';
import { TicketNotesSection, type TicketNotesSectionProps } from '../../src/views/ticket-notes-section.js';
import { TicketSheet } from '../../src/views/ticket-sheet.js';
import { useLiveQuery } from '../../src/views/use-live-query.js';
import type { TicketRead } from '../../src/view-types.js';
import { ticketStateSeed } from '../helpers/seed.js';

/**
 * Cases 18.241–18.246 — the ticket's Notes section (notes series, Plan 6 of 7,
 * spec §10.1–10.2). Case ids live in `test-cases/18-notes.md` §18.12.
 *
 * ⚠ **THE `<ticketId>:notes` QUERY MOVED, Plan 7 Task 5 (spec §14.3).**
 * `TicketNotesSection` no longer calls `useLiveQuery` itself — `TicketSheet`
 * lifted it, so `submitComment` can read the same `data` for
 * `alreadyAttached` and `reload()` it after an implied attachment. Two
 * consequences for the cases below: 18.241 (the query's KEY) and 18.246 (the
 * live-stream refetch) are now facts about the SHEET, not the section, and
 * mount `<TicketSheet>`; 18.242–18.245 (badges, detach, undo, refusal) are
 * still facts about the section's own rendering and event-building, and mount
 * it through `Harness`, a component that owns `useLiveQuery` exactly the way
 * `TicketSheet` now does and hands the section its `notes` prop — keeping
 * every one of those four cases' own bodies unchanged.
 */

/** Mirrors `TicketSheet`'s own lift — see the file docblock above. */
function Harness(props: Omit<TicketNotesSectionProps, 'notes'>) {
  const notes = useLiveQuery(props.dataSource, props.workspaceId, `${props.ticketId}:notes`, () =>
    props.dataSource.query.getNotesForTicket(props.workspaceId, props.ticketId),
  );
  return <TicketNotesSection {...props} notes={notes} />;
}

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

afterEach(() => {
  cleanup();
});

describe('TicketNotesSection', () => {
  /**
   * 18.241 — MOVED onto the production path (Plan 7 Task 5): the
   * `<ticketId>:notes` key is now `TicketSheet`'s own, not the section's, so
   * this mounts the sheet rather than the section alone.
   */
  it('18.241 the sheet\'s own <ticketId>:notes key carries the ticket id, and the heading counts the notes', async () => {
    const getNotesForTicket = vi.fn(async () => []);
    const source = createFakeDataSource({ getTicket: async () => MINIMAL_READ, getNotesForTicket });
    const { rerender } = render(
      <TicketSheet dataSource={source} workspaceId={WS} ticketId={TICKET} currentUserId="user_kiro" onClose={vi.fn()} />,
    );
    await screen.findByText('Notes (0)');
    expect(getNotesForTicket).toHaveBeenCalledTimes(1);
    expect(getNotesForTicket).toHaveBeenLastCalledWith(WS, TICKET);
    expect(screen.queryAllByRole('link')).toHaveLength(0);

    // The key must carry the ticket id: switching tickets on the SAME mounted
    // sheet (no unmount) must re-fetch for the new ticket. A key that dropped
    // the ticket id would leave `useLiveQuery`'s refetch effect unchanged
    // across this rerender, and `getNotesForTicket` would never be called a
    // second time.
    const OTHER_TICKET = 'ticket_other_0000000000000';
    rerender(
      <TicketSheet dataSource={source} workspaceId={WS} ticketId={OTHER_TICKET} currentUserId="user_kiro" onClose={vi.fn()} />,
    );
    await waitFor(() => expect(getNotesForTicket).toHaveBeenCalledTimes(2));
    expect(getNotesForTicket).toHaveBeenLastCalledWith(WS, OTHER_TICKET);
  });

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
      <Harness
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
    await screen.findByText('Notes (2)');
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
      <Harness
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
    await screen.findByText('Notes (2)');
    expect(screen.getByRole('link', { name: 'Compressor log' })).toBeInTheDocument();
    expect(screen.queryAllByRole('button', { name: /^Detach / })).toHaveLength(0);
    expect(screen.queryByTestId('attach-note')).not.toBeInTheDocument();
  });

  it('18.243 clicking × writes exactly one note.detached { ticketId } against the note, reloads, and shows a toast with Undo', async () => {
    const user = userEvent.setup();
    const getNotesForTicket = vi.fn(async () => TWO_NOTES);
    const source = createFakeDataSource({ getNotesForTicket });
    render(
      <Harness
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
    await screen.findByText('Notes (2)');
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
      <Harness
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
    await screen.findByText('Notes (2)');
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
      <Harness
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
    await screen.findByText('Notes (2)');
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
      const source = createFakeDataSource({ getTicket: async () => MINIMAL_READ, getNotesForTicket });
      render(
        <TicketSheet dataSource={source} workspaceId={WS} ticketId={TICKET} currentUserId="user_kiro" onClose={vi.fn()} />,
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

  /**
   * 9.323 — Unit 2 styling (owner screenshot, 2026-09-23: "add note button
   * does not have a style"): the trigger draws the house ghost-button
   * treatment, the same pair `.gn-button`/`.gn-button--ghost` "Add subtask"
   * (`ticket-sheet.tsx`'s own `<Button>`) already carries — added onto the
   * native `<button>` rather than swapping in the `<Button>` component
   * itself, because `Button` is a plain function component (no
   * `forwardRef`) and this trigger's ref is load-bearing: `Popover` anchors
   * its position from it.
   */
  it('9.323 the Attach-note trigger carries gn-button/gn-button--ghost, matching Add subtask', async () => {
    const source = createFakeDataSource({ getNotesForTicket: async () => [] });
    render(
      <Harness
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
    const trigger = await screen.findByTestId('attach-note');
    expect(trigger).toHaveClass('gn-button');
    expect(trigger).toHaveClass('gn-button--ghost');
    expect(trigger).toHaveClass('gn-ticket-sheet__attach');
  });
});
