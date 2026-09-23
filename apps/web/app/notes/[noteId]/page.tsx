'use client';

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
 */
export default function NoteRoute() {
  const { noteId } = useParams<{ noteId: string }>();
  return <NotesPage noteId={noteId} />;
}
