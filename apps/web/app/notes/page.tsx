import { Suspense } from 'react';
import { NotesPage } from '../../src/notes/notes-page.js';
import { NotesPageShell } from '../../src/skeletons/page-shells.js';

/**
 * `/notes` — the tree with no note open (spec §9.1).
 *
 * The `Suspense` boundary is `useSearchParams()`'s (task/notes-badge-sheet,
 * 2026-09-24) — `NoteDocument`, mounted by this tree once a note is open,
 * now reads the `?ticket=` param the ticket sheet lives behind. Without the
 * boundary `next build` fails this route rather than warning, exactly as
 * `app/my-work/page.tsx`'s own mount records (and the old per-workspace
 * route's redirect, `app/w/[workspaceId]/my-work/page.tsx`, records again).
 */
export default function NotesRoute() {
  return (
    <Suspense fallback={<NotesPageShell />}>
      <NotesPage />
    </Suspense>
  );
}
