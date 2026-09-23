'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { AppNav } from '../app-nav.js';
import { ShellRefusal } from '../shell-refusal.js';
import { useAppServices, useCurrentUser, useSessionStatus } from '../providers.js';
import { WorkspaceNotesSection } from './workspace-notes-section.js';

/**
 * The `/notes` page (notes series Plan 5, spec §9.1–9.2).
 *
 * ## Why this page FANS OUT over workspaces when the inbox does not
 *
 * The inbox reads one paged list for the person; notes are per-workspace
 * throughout the data layer — every read takes a `workspaceId` — because a note
 * lives in exactly one workspace and its reader predicate is that workspace's
 * membership. So the tree's first question is "which workspaces does this person
 * belong to", and the answer is `getMyWorkspaces()`.
 *
 * The read happens ONCE, in this component, and the answer is handed down. A
 * second read anywhere would be a second definition of "the workspaces you are
 * in" (case 18.183 asserts the once).
 *
 * ## The three read states, and why they are three
 *
 * `workspaces === null` with no refusal is LOADING — a read in flight. `refusal`
 * is a read that would not answer. `[]` is a read that answered "none". The
 * failure this page must not make is the one `shell-refusal.tsx` exists for:
 * drawing the empty copy for a read that never landed, which tells a person they
 * have no notes when what actually happened is that nobody was asked. 18.184
 * asserts all three arms side by side for exactly that reason.
 *
 * ## The session gate
 *
 * `getMyWorkspaces()` is a session read, so it is not issued until the session
 * has landed. `useSessionStatus` names the three states rather than collapsing
 * them, because "we have not asked yet" and "the answer is nobody" are different
 * sentences on screen and the invite page's own docblock records what collapsing
 * them costs.
 */

/** The document region's copy with no note open (spec §9.7). */
export const NO_NOTE_COPY = 'Pick a note, or create one.';
/** The tree's copy when the person belongs to no workspace at all. */
export const EMPTY_NOTES_COPY = 'No notes yet';

export function NotesPage({ noteId }: { noteId?: string }) {
  const { dataSource } = useAppServices();
  const user = useCurrentUser();
  const session = useSessionStatus();
  const pathname = usePathname();
  const signedIn = session.kind === 'signed-in' && user !== null;

  const [workspaces, setWorkspaces] = useState<WorkspaceRef[] | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let cancelled = false;
    dataSource.query.getMyWorkspaces().then(
      (rows) => {
        if (cancelled) return;
        // A later success clears an earlier refusal, so a retry that works does
        // not leave the panel standing — the same device the workspaces page
        // records for its own pair.
        setRefusal(null);
        setWorkspaces(rows);
      },
      (cause: unknown) => {
        if (cancelled) return;
        setRefusal(cause instanceof Error ? cause.message : String(cause));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [dataSource, signedIn]);

  return (
    <main id="gn-main" className="gn-shell">
      <AppNav />
      <div className="gn-notes" data-testid="notes-page">
        <div className="gn-notes__header">
          <h1 className="gn-page-title">Notes</h1>
          {/* Task 8 mounts `NotesSearchHeader` here. It is absent rather than
              an empty box: a search input that cannot search is a control that
              does nothing, which this repo refuses to draw. */}
        </div>
        <div className="gn-notes__body">
          <nav aria-label="Notes" className="gn-notes__tree">
            {!signedIn ? (
              <p className="gn-notes__session" role="status">
                {session.kind === 'loading' ? (
                  'Checking your session…'
                ) : (
                  <>
                    <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`}>Sign in</Link>{' '}
                    to see your notes — you land back here.
                  </>
                )}
              </p>
            ) : refusal !== null ? (
              <ShellRefusal what="Your notes" message={refusal} />
            ) : workspaces === null ? (
              <p className="gn-notes__loading" role="status">
                Loading…
              </p>
            ) : workspaces.length === 0 ? (
              <p className="gn-notes__empty" role="status">
                {EMPTY_NOTES_COPY}
              </p>
            ) : (
              workspaces.map((workspace) => (
                <WorkspaceNotesSection key={workspace.id} workspace={workspace} />
              ))
            )}
          </nav>
          <section className="gn-notes__document" data-testid="note-document-region">
            {noteId === undefined ? (
              <p className="gn-notes__hint">{NO_NOTE_COPY}</p>
            ) : (
              /* Task 4 replaces this with `NoteDocument`, which finds the
                 note's workspace and draws its title, byline, editor, history
                 and comments. Until then the id IS the honest answer: a note
                 was asked for, and nothing here knows what one is yet. */
              <p className="gn-notes__hint" data-testid="note-document-placeholder">
                {noteId}
              </p>
            )}
          </section>
          <aside className="gn-notes__toc" aria-label="On this page" />
        </div>
      </div>
    </main>
  );
}
