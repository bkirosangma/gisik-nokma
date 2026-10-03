'use client';

import { useEffect, useState } from 'react';
import { TicketEditorSlot } from '../editor-slot.js';
import { Button, Sheet, Skeleton, SkeletonRegion } from '@gisik-nokma/ui';
import type { NoteVersion } from '@gisik-nokma/domain';
import { useAppServices } from '../providers.js';

/**
 * Every saved version of a note, and a read-only look at any one of them
 * (spec §9.5, D15).
 *
 * ## Self-contained on purpose
 *
 * `HistoryPanel` owns its own list-vs-version state and fetches both
 * `getNoteHistory` and `getNoteVersion` itself, through `useAppServices()` —
 * the same door `NoteDocument` uses, not a second one. The only thing it
 * hands back up is `onRestore(body)`: it does not write `note.body_set`
 * itself, because the write's `entity`/`workspaceId`/actor come from the
 * SAME `write` helper `NoteDocument` already uses for renaming and
 * detaching, and a second copy of that plumbing here would be a second place
 * for the two to drift.
 *
 * ## `getNoteVersion` answers the BODY, not a `NoteDetail`
 *
 * Both `online-data-source.ts` and `replica-data-source.ts` resolve it to
 * `payload.body ?? null` directly (`mapNoteVersionBody`, and the replica's
 * own docblock says so explicitly) — `Promise<unknown | null>`, per
 * `data-source.ts`'s own declaration. So `doc={version}` below, not
 * `doc={version.body}`.
 *
 * ## The server serves history OLDEST first
 *
 * `listNoteHistory`'s query is `ORDER BY seq` with no `DESC` — ascending, the
 * ledger's own order. 18.210 wants newest first, so the reversal happens
 * here, once, rather than trusting every future reader of `getNoteHistory` to
 * remember it.
 */
export function HistoryPanel({
  open,
  onClose,
  workspaceId,
  noteId,
  canEdit,
  nameOf,
  onRestore,
}: {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  noteId: string;
  /** Spec §9.6: a reader's History is view only — Restore is what this gates, not the door to the panel. */
  canEdit: boolean;
  nameOf: (authorId: string) => string;
  onRestore: (body: unknown) => void;
}) {
  const { dataSource } = useAppServices();
  const [versions, setVersions] = useState<NoteVersion[] | null>(null);
  const [viewing, setViewing] = useState<NoteVersion | null>(null);
  /**
   * `'loading'` is a real state, not a placeholder for `null` — `getNoteVersion`
   * can legitimately answer `null` (a `note.created` born empty carries no
   * body), and collapsing "not fetched yet" into that same value is what makes
   * the bug below possible: `TicketEditor`'s `useEditor` reads its `content`
   * option exactly once, with an EMPTY deps array (`packages/editor` case
   * 9.72), so mounting `TicketEditorSlot` before the fetch resolves — even
   * with `doc={null}` — freezes it on an EMPTY document forever, and the
   * later `setViewedBody` is silently ignored. MEASURED here, the same class
   * `use-note-autosave.ts`'s docblock records for `NoteDocument` itself: the
   * slot is `{viewedBody.status === 'loaded' ? <TicketEditorSlot .../> : …}`
   * below, precisely so it never mounts until the body is already in hand.
   */
  const [viewedBody, setViewedBody] = useState<{ status: 'loading' } | { status: 'loaded'; doc: unknown }>({
    status: 'loading',
  });

  useEffect(() => {
    if (!open) return;
    setVersions(null);
    setViewing(null);
    let cancelled = false;
    dataSource.query.getNoteHistory(workspaceId, noteId).then(
      (rows) => {
        if (cancelled) return;
        // Newest first — see the docblock: the server's own order is oldest first.
        setVersions([...rows].sort((a, b) => b.seq - a.seq));
      },
      () => {
        if (!cancelled) setVersions([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [open, dataSource, workspaceId, noteId]);

  useEffect(() => {
    if (viewing === null) return;
    setViewedBody({ status: 'loading' });
    let cancelled = false;
    dataSource.query.getNoteVersion(workspaceId, noteId, viewing.eventId).then(
      (found) => {
        if (!cancelled) setViewedBody({ status: 'loaded', doc: found });
      },
      () => {
        if (!cancelled) setViewedBody({ status: 'loaded', doc: null });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [viewing, dataSource, workspaceId, noteId]);

  if (!open) return null;

  return (
    <Sheet open={open} title="History" onClose={onClose}>
      {viewing === null ? (
        <ul className="gn-notes__history-list" data-testid="history-list">
          {versions === null ? (
            <SkeletonRegion as="li" label="Loading history">
              <Skeleton shape="block" height="2.25rem" rows={4} />
            </SkeletonRegion>
          ) : versions.length === 0 ? (
            <li className="gn-notes__hint">No saved versions yet</li>
          ) : (
            versions.map((version) => (
              <li key={version.eventId}>
                <button
                  type="button"
                  className="gn-notes__history-row"
                  data-testid={`history-row-${version.eventId}`}
                  onClick={() => setViewing(version)}
                >
                  {relativeLabel(version.recordedAt)} by {nameOf(version.authorId)}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : (
        <div className="gn-notes__history-version">
          <p role="status" className="gn-notes__history-banner">
            Viewing version from {relativeLabel(viewing.recordedAt)}
          </p>
          {viewedBody.status === 'loading' ? (
            <SkeletonRegion label="Loading this version">
              <Skeleton shape="block" height="12rem" />
            </SkeletonRegion>
          ) : (
            <div className="gn-notes__editor">
              <TicketEditorSlot
                mode="note"
                doc={viewedBody.doc}
                readOnly
                workspaceId={workspaceId}
                ticketId=""
                noteId={noteId}
                submitSlot="none"
              />
            </div>
          )}
          <div className="gn-notes__history-actions">
            {canEdit ? (
              <Button
                disabled={viewedBody.status === 'loading'}
                onClick={() => {
                  if (viewedBody.status !== 'loaded') return;
                  onRestore(viewedBody.doc);
                  setViewing(null);
                }}
              >
                Restore
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setViewing(null)}>
              Back
            </Button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

/**
 * "N min ago" and its coarse siblings — `note-document.tsx`'s `editedLabel`
 * without the "edited " prefix, which a history row does not want (the row
 * already carries a name, and "edited 3 min ago · Kiro" reads like the row
 * repeats itself).
 */
function relativeLabel(iso: string, now: number = Date.now()): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  const minutes = Math.floor((now - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  return `${days} d ago`;
}
