import { useRef, useState } from 'react';
import type { NoteSummary } from '@gisik-nokma/domain';
import { NoteBadge, Popover, Toast } from '@gisik-nokma/ui';
import type { DataSource } from '../data-source.js';
import type { MakeSubmitted } from '../submit.js';
import { AttachNotePicker } from './attach-note-picker.js';
import type { LiveQueryResult } from './use-live-query.js';

export type TicketNotesSectionProps = {
  dataSource: DataSource;
  workspaceId: string;
  ticketId: string;
  /** The ticket's own project — the New-note row's home (Task 2). */
  projectId: string;
  currentUserId: string;
  canEdit: boolean;
  make: MakeSubmitted;
  onNavigate?: (href: string) => void;
  onRefusal: (refusal: { rule: string; reason: string }) => void;
  /**
   * The `<ticketId>:notes` live query, LIFTED to `TicketSheet` (Plan 7 Task 5,
   * spec §14.3) — this component no longer calls `useLiveQuery` itself. The
   * sheet's own `submitComment` reads the SAME instance for `alreadyAttached`
   * and calls `reload()` after an implied attachment commits, so a comment
   * that tags a note and this section's badge list never answer from two
   * queries that could disagree for a moment.
   */
  notes: LiveQueryResult<NoteSummary[]>;
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
  projectId,
  canEdit,
  make,
  onNavigate,
  onRefusal,
  notes,
}: TicketNotesSectionProps) {
  const [toast, setToast] = useState<{ noteId: string; title: string } | null>(null);
  const attachTriggerRef = useRef<HTMLButtonElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

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
  const heading = failed || notes.data === null ? 'Notes' : `Notes (${rows.length})`;

  return (
    <section className="gn-ticket-sheet__notes" data-testid="ticket-notes">
      <h3 className="gn-ticket-sheet__caption">{heading}</h3>
      {failed ? (
        <p className="gn-ticket-sheet__notes-error" role="alert" data-testid="ticket-notes-unavailable">
          {`This ticket's notes could not be read: ${notes.error}. That is a failure of this read, not a statement about the ticket: it may answer on a retry.`}
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
          ref={attachTriggerRef}
          type="button"
          className="gn-button gn-button--ghost gn-ticket-sheet__attach"
          data-testid="attach-note"
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          onClick={() => setPickerOpen((open) => !open)}
        >
          Attach note
        </button>
      ) : null}
      <Popover
        triggerRef={attachTriggerRef}
        open={pickerOpen && canEdit}
        onClose={() => setPickerOpen(false)}
        aria-label="Attach a note"
      >
        <AttachNotePicker
          dataSource={dataSource}
          workspaceId={workspaceId}
          ticketId={ticketId}
          projectId={projectId}
          attachedIds={rows.map((note) => note.noteId)}
          make={make}
          onAttached={() => {
            setPickerOpen(false);
            notes.reload();
          }}
          onCreated={(noteId) => {
            setPickerOpen(false);
            notes.reload();
            onNavigate?.(`/notes/${noteId}`);
          }}
          onRefusal={onRefusal}
        />
      </Popover>
      <Toast
        open={toast !== null}
        message={toast === null ? '' : `Detached "${toast.title}"`}
        undo={toast === null ? null : { onUndo: () => void undoDetach(toast.noteId) }}
        onDismiss={() => setToast(null)}
      />
    </section>
  );
}
