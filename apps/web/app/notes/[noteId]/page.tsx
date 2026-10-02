'use client';

import { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { NotesPage } from '../../../src/notes/notes-page.js';

/**
 * `/notes/<id>` — the SAME page with a note open (spec §9.1).
 *
 * One component mounted by two routes rather than two components: the tree, the
 * header and the TOC are identical, and only the document region differs. Two
 * files would be two spellings of the layout that drift apart, which is the same
 * argument `NotesNavLink`'s prefix match makes for its own link — `/notes` and
 * `/notes/<id>` are one view.
 *
 * The `Suspense` boundary is `useSearchParams()`'s (task/notes-badge-sheet,
 * 2026-09-24): this route always has a note open, so `NoteDocument`'s own
 * read of `?ticket=` — the param the ticket sheet lives behind — always
 * runs. See `app/notes/page.tsx`'s matching boundary for the same reason.
 */
export default function NoteRoute() {
  const { noteId } = useParams<{ noteId: string }>();
  return (
    <Suspense fallback={<main className="gn-shell gn-shell--wide gn-notes-page" />}>
      <NotesPage noteId={noteId} />
    </Suspense>
  );
}
