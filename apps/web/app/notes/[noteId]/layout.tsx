import type { ReactNode } from 'react';
import { documentTitleFor } from '../../../src/page-title.js';

/**
 * THE SECOND LAYOUT, AND IT IS NOT A DUPLICATE (18.185).
 *
 * The P12 sweep (`apps/web/test/document-title.test.tsx:118-124`) resolves a
 * page's title mechanism by looking in the PAGE'S OWN directory for a sibling
 * `layout.tsx`. `app/notes/[noteId]/page.tsx` lives in `notes/[noteId]`, not in
 * `notes`, so the layout beside this one — `app/notes/layout.tsx`, whose
 * metadata does apply to this segment at runtime — is INVISIBLE to that check.
 * Without this file the sweep reddens with `routes with no title mechanism:
 * notes/[noteId]/page.tsx`, which is the check working rather than a false
 * alarm: the two files would drift apart the day someone edited one.
 *
 * The topic is the same `Notes`, on purpose. The note's own title is a READ and
 * lands long after the head is built, so the honest build-time topic for
 * `/notes/<id>` is the view's name — the same choice `/w/<id>` makes with
 * `Workspace`.
 */
export const metadata = { title: documentTitleFor('Notes') };

export default function NoteLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return children;
}
