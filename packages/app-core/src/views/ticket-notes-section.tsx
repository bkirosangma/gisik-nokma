import { useState } from 'react';
import { NoteBadge, Toast } from '@gisik-nokma/ui';
import type { DataSource } from '../data-source.js';
import type { MakeSubmitted } from '../submit.js';
import { useLiveQuery } from './use-live-query.js';

export type TicketNotesSectionProps = {
  dataSource: DataSource;
  workspaceId: string;
  ticketId: string;
  /** Unused by this section directly; threaded through for `AttachNotePicker`. */
  projectId: string;
  currentUserId: string;
  canEdit: boolean;
  make: MakeSubmitted;
  onNavigate?: (href: string) => void;
  onRefusal: (refusal: { rule: string; reason: string }) => void;
};

/**
 * "Notes · N" between the ticket sheet's Subtasks and Comments (spec §10.1),
 * each attached note a `NoteBadge` this viewer may read, with an × that
 * detaches and a Toast Undo — the sheet's first mounted `Toast` (Global
 * Constraint, this plan).
 */
export function TicketNotesSection({
  dataSource,
  workspaceId,
  ticketId,
  canEdit,
  make,
  onRefusal,
}: TicketNotesSectionProps) {
  const notes = useLiveQuery(dataSource, workspaceId, `${ticketId}:notes`, () =>
    dataSource.query.getNotesForTicket(workspaceId, ticketId),
  );
  const [toast, setToast] = useState<{ noteId: string; title: string } | null>(null);

  async function detach(noteId: string, title: string): Promise<void> {
    const event = make({
      workspaceId,
      entity: { kind: 'note', id: noteId },
      type: 'note.detached',
      payload: { ticketId },
    });
    const results = await dataSource.ingest([event]);
    const result = results[0];
    if (result === undefined) {
      onRefusal({ rule: 'transport', reason: 'The server did not answer this change.' });
      return;
    }
    if (result.status === 'committed') {
      notes.reload();
      setToast({ noteId, title });
      return;
    }
    if (result.status === 'refused') onRefusal({ rule: result.rule, reason: result.reason });
    else onRefusal({ rule: result.code, reason: result.message });
  }

  async function undoDetach(noteId: string): Promise<void> {
    const event = make({
      workspaceId,
      entity: { kind: 'note', id: noteId },
      type: 'note.attached',
      payload: { ticketId },
    });
    await dataSource.ingest([event]);
    notes.reload();
  }

  const failed = notes.error !== null;
  const rows = notes.data ?? [];
  const heading = failed || notes.data === null ? 'Notes' : `Notes · ${rows.length}`;

  return (
    <section className="gn-ticket-sheet__notes" data-testid="ticket-notes">
      <h3 className="gn-ticket-sheet__caption">{heading}</h3>
      {failed ? (
        <p className="gn-ticket-sheet__notes-error" role="alert" data-testid="ticket-notes-unavailable">
          {`This ticket's notes could not be read — ${notes.error}. That is a failure of this read, not a statement about the ticket: it may answer on a retry.`}
        </p>
      ) : (
        <ul className="gn-ticket-sheet__note-badges">
          {rows.map((note) => (
            <li key={note.noteId}>
              <NoteBadge
                title={note.title}
                scopeMode={note.scope.mode}
                href={`/notes/${note.noteId}`}
                onDetach={canEdit ? () => void detach(note.noteId, note.title) : undefined}
              />
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <button
          type="button"
          className="gn-ticket-sheet__attach"
          data-testid="attach-note"
          aria-haspopup="dialog"
        >
          Attach note
        </button>
      ) : null}
      <Toast
        open={toast !== null}
        message={toast === null ? '' : `Detached "${toast.title}"`}
        undo={toast === null ? null : { onUndo: () => void undoDetach(toast.noteId) }}
        onDismiss={() => setToast(null)}
      />
    </section>
  );
}
