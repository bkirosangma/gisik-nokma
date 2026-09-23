'use client';

import { Avatar, Button, NoteBadge } from '@gisik-nokma/ui';
import type { NoteDetail } from '@gisik-nokma/domain';
import type { RosterMember, WorkspaceRef } from '@gisik-nokma/app-core';
import { ticketSheetPath } from '../ticket-location.js';
import { ScopeEditor } from './scope-editor.js';

/**
 * Who wrote it, when it changed, who may see it, what it is pinned to, and how
 * long it takes to read (spec §9.2's byline).
 *
 * ## Why this is presentational
 *
 * Every value here is already the document's: the author's name is a lookup the
 * document does anyway (it needs the roster for the scope picker), the reading
 * time is computed from the editor's own DOM, and the badges' detach handler is
 * a write. A byline that fetched or wrote anything of its own would be a second
 * place a note's state could be read from, and the two would disagree the moment
 * one of them was stale. It takes props and draws them.
 *
 * ## The ticket badge's `href`, and why it is the canonical sheet path
 *
 * **CORRECTED (notes series, Plan 6 of 7, spec §10 Task 3).** This docblock
 * used to read: *"`attachedTickets` carries `{ ticketId, key, title }` and NO
 * project id, so the board's own path … cannot be built from it"* — true when
 * written, and closed by adding `projectId` to `NoteSummary.attachedTickets`
 * additively across the server read, both client mappers and the replica
 * (`read/notes.ts`, `online/mappers.ts`, `replica-data-source.ts`). The badge
 * now uses `ticketSheetPath`, the shell's one spelling of a ticket sheet's URL
 * (`ticket-location.ts`) — the SAME door the board's own cards push, rather
 * than the id-only My Work door, which stays correct but is a second spelling
 * of one URL and a page hop `ticketSheetPath` skips.
 *
 * ## The href stays canonical; the CLICK does not (owner request, 2026-09-24)
 *
 * `onOpenTicket` opens the ticket's sheet IN PLACE on the Notes page, the same
 * `?ticket=` shape My Work's own sheet mount uses — `NoteDocument` builds it
 * from `note.attachedTickets`, falling back to the same `TicketLocator` a
 * parent chip inside the mounted sheet would need. `href` is left exactly as
 * it was: `NoteBadge`'s own `onOpen` intercept only swallows a plain,
 * unmodified left click, so a modifier click or a middle click still follows
 * the real link — open-in-new-tab keeps working.
 */
export function NoteByline({
  note,
  workspace,
  members,
  authorName,
  editedLabel,
  canEdit,
  onScopeChanged,
  onDetach,
  onOpenTicket,
  onBadgeRef,
  readingLabel,
  onCopyMarkdown,
  onOpenHistory,
}: {
  note: NoteDetail;
  workspace: WorkspaceRef;
  members: RosterMember[];
  authorName: string;
  editedLabel: string;
  canEdit: boolean;
  onScopeChanged: () => void;
  onDetach: (ticketId: string) => void;
  onOpenTicket: (ticketId: string) => void;
  /**
   * Registers each badge's own DOM node by ticket id, so `NoteDocument` can
   * return focus to the EXACT badge that opened a ticket once its sheet
   * closes. `NoteBadge` renders its own `<a>` with no ref of its own — this
   * wraps it rather than growing the shared kit component's API for the one
   * caller that needs an imperative handle.
   */
  onBadgeRef?: (ticketId: string, element: HTMLSpanElement | null) => void;
  readingLabel: string;
  onCopyMarkdown: () => void;
  onOpenHistory: () => void;
}) {
  return (
    <div className="gn-notes__byline">
      <Avatar name={authorName} tint={note.authorId} size="small" />
      <span className="gn-notes__author">{authorName}</span>
      <span className="gn-notes__edited">{editedLabel}</span>

      <ScopeEditor note={note} members={members} canEdit={canEdit} onChanged={onScopeChanged} />

      {note.attachedTickets.length > 0 ? (
        <span className="gn-notes__badges">
          {note.attachedTickets.map((ticket) => (
            <span key={ticket.ticketId} ref={(element) => onBadgeRef?.(ticket.ticketId, element)}>
              <NoteBadge
                title={ticket.title}
                scopeMode={note.scope.mode}
                href={ticketSheetPath({ workspaceId: workspace.id, projectId: ticket.projectId }, ticket.ticketId)}
                onOpen={() => onOpenTicket(ticket.ticketId)}
                // Absent for a reader, which is what removes the × — the kit's own
                // rule (18.197), so there is one place that decides it.
                {...(canEdit ? { onDetach: () => onDetach(ticket.ticketId) } : {})}
              />
            </span>
          ))}
        </span>
      ) : null}

      <span className="gn-notes__reading-time" data-testid="note-reading-time">
        {readingLabel}
      </span>

      <span className="gn-notes__byline-actions">
        <Button onClick={onCopyMarkdown}>Copy as Markdown</Button>
        {/* Open to every viewer, not just an editor: spec §9.6 makes History
            "view only" for a reader — RESTORE is what `canEdit` gates, inside
            the panel itself, not the door to it. */}
        <Button variant="ghost" onClick={onOpenHistory}>
          History
        </Button>
      </span>
    </div>
  );
}
