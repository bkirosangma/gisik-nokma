'use client';

import { Avatar, Button, NoteBadge } from '@gisik-nokma/ui';
import type { NoteDetail } from '@gisik-nokma/domain';
import type { RosterMember, WorkspaceRef } from '@gisik-nokma/app-core';
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
 * ## The ticket badge's `href`, and why it is My Work
 *
 * `attachedTickets` carries `{ ticketId, key, title }` and NO project id, so the
 * board's own path (`/w/<ws>/p/<project>?ticket=<id>`, the shape
 * `project-page-head`'s neighbours use) cannot be built from it. `/w/<ws>/my-work`
 * is a real door that opens a ticket given only its id — it looks the project up
 * from its own rows and, on a miss, asks the server (`ticketLocation`) rather
 * than guessing one. The alternative that LOOKS tidier, filing the link under the
 * NOTE's home project, is the wrong-project answer the moment a note is pinned to
 * a ticket in another project.
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
            <NoteBadge
              key={ticket.ticketId}
              title={ticket.title}
              scopeMode={note.scope.mode}
              href={`/w/${workspace.id}/my-work?ticket=${ticket.ticketId}`}
              // Absent for a reader, which is what removes the × — the kit's own
              // rule (18.197), so there is one place that decides it.
              {...(canEdit ? { onDetach: () => onDetach(ticket.ticketId) } : {})}
            />
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
