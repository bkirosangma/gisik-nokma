'use client';

import { useEffect, useRef } from 'react';
import { TicketEditorSlot, type EditorSubmission } from '@gisik-nokma/editor';
import {
  CommentsThread,
  makeSubmittedFactory,
  mentionCandidatesOf,
  useLiveQuery,
  usePurgedPredicate,
  type TicketComment,
} from '@gisik-nokma/app-core';
import { useAppServices, useCurrentUser } from '../providers.js';
import { buildWorkspaceQueryTickets, ticketRefHrefIn } from '../ticket-ref-callbacks.js';

/**
 * The comment thread under a note's editor — the same kit component the
 * ticket sheet uses (spec §9.2, D19), not a second copy.
 *
 * ## `TicketComment.files: []`, mapped here rather than widened in the kit
 *
 * `NoteComment` (`packages/domain`) carries no `files` field at all — no note
 * has ever named an attachment through a comment, only through the note's own
 * body — while `CommentsThread`'s `TicketComment` declares it required. The
 * brief offered two ways to close that gap: widen the kit's field to
 * `files?: TicketCommentFile[]` (touching a component the ticket sheet also
 * depends on, and every `comment.files.length`/`comment.files.map` read
 * inside it), or map `{ ...row, files: [] }` at THIS call site. Chose the
 * mapping: it is a one-line, one-file change, it cannot affect the ticket
 * sheet's own tests, and "no files" is a true and complete answer for a note
 * comment today rather than a placeholder standing in for a real absence.
 *
 * ## `canComment` is every reader, not `canEdit`
 *
 * Spec §9.6: *"Readers may attach the note to tickets … and comment."*
 * `NoteDocument` passes `true` unconditionally — this component takes the
 * decision as a prop rather than re-deriving it from a role, because it has
 * no note or workspace-role data to derive it FROM, and inventing a second
 * copy of that logic here is exactly the drift `canEdit`'s own docblock in
 * `note-document.tsx` warns against.
 */
export function NoteComments({
  workspaceId,
  noteId,
  nameOf,
  canComment,
  notes = [],
  members = [],
}: {
  workspaceId: string;
  noteId: string;
  nameOf: (authorId: string) => string;
  canComment: boolean;
  /**
   * The workspace's notes, for the composer's `:note`/`[[` picker (spec
   * §14, D26) — a final-review finding (2026-09-23): `queryTickets` reached
   * this composer, but nothing ever supplied `queryNotes`, so a real note's
   * OWN comment box could not insert a note reference at all. The caller
   * (`note-document.tsx`) already loads this list for its own editor's
   * `queryNotes` (`treeNotes`) — passed straight through here rather than a
   * second fetch. Optional, defaulting to `[]`, so a caller with no list yet
   * (or a test) still renders a composer whose picker simply finds nothing.
   */
  notes?: ReadonlyArray<{ noteId: string; title: string }>;
  /**
   * The workspace roster, for the composer's `@` picker (`mentionCandidatesOf`,
   * the source the ticket sheet's composer uses). `note-document.tsx` already
   * holds it for the byline and passes it straight through, like `notes` above.
   * Optional and empty by default, so a caller with no roster yet still renders
   * a composer whose picker simply finds nobody.
   */
  members?: ReadonlyArray<{ id: string; name: string; email?: string }>;
}) {
  const { dataSource } = useAppServices();
  const user = useCurrentUser();

  const comments = useLiveQuery(dataSource, workspaceId, `note-comments:${noteId}`, async () => {
    const rows = await dataSource.query.getNoteComments(workspaceId, noteId);
    return rows.map((row): TicketComment => ({ ...row, files: [] }));
  });
  const purged = usePurgedPredicate(
    dataSource.query,
    (comments.data ?? []).map((row) => row.body),
  );

  // A notification about a comment opens `/notes/<id>#comment-<commentId>`. The
  // browser's own hash scroll has nothing to land on — the thread is fetched
  // AFTER the page paints — so once the comments are here, bring the named one
  // into view. Once per hash: a later reload (after posting, say) must not pull
  // the reader back up to it.
  const scrolledHash = useRef<string | null>(null);
  useEffect(() => {
    if (comments.data == null) return;
    const hash = window.location.hash;
    if (!hash.startsWith('#comment-') || scrolledHash.current === hash) return;
    const target = document.getElementById(hash.slice(1));
    if (target === null) return;
    scrolledHash.current = hash;
    target.scrollIntoView?.({ block: 'center' });
  }, [comments.data]);

  const submitComment = async (submission: EditorSubmission): Promise<boolean> => {
    if (user === null) return false;
    const make = makeSubmittedFactory({ actorId: user.id, origin: 'web' });
    const event = make({
      workspaceId,
      entity: { kind: 'note', id: noteId },
      type: submission.type,
      payload: submission.payload,
    });
    const results = await dataSource.ingest([event]);
    if (results[0]?.status === 'committed') {
      comments.reload();
      return true;
    }
    return false;
  };

  return (
    <CommentsThread
      comments={comments.data}
      commentsUnavailable={comments.error ?? undefined}
      nameOf={nameOf}
      ticketHref={ticketRefHrefIn(workspaceId)}
      isPurged={purged.isPurged}
      composer={
        canComment ? (
          <TicketEditorSlot
            mode="comment"
            doc={null}
            readOnly={false}
            workspaceId={workspaceId}
            ticketId=""
            noteId={noteId}
            placeholder="Add a comment"
            submit={submitComment}
            footerNote="Posting records an event citing you."
            queryUsers={async (query: string) => mentionCandidatesOf(members, query)}
            queryTickets={buildWorkspaceQueryTickets(dataSource, workspaceId)}
            resolveTicketHref={ticketRefHrefIn(workspaceId)}
            queryNotes={async (query: string) => {
              const needle = query.trim().toLowerCase();
              const hits: Array<{ noteId: string; title: string }> = [];
              for (const candidate of notes) {
                if (needle !== '' && !candidate.title.toLowerCase().includes(needle)) continue;
                hits.push({ noteId: candidate.noteId, title: candidate.title });
                if (hits.length === 8) break;
              }
              return hits;
            }}
          />
        ) : undefined
      }
    />
  );
}
