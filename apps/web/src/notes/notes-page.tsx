'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Button, Toast } from '@gisik-nokma/ui';
import type { ReadingMeta } from '@gisik-nokma/editor';
import type { RosterMember, WorkspaceRef } from '@gisik-nokma/app-core';
import type { NoteScopeMode } from '@gisik-nokma/domain';
import { AppNav } from '../app-nav.js';
import { ShellRefusal } from '../shell-refusal.js';
import { useAppServices, useCurrentUser, useSessionStatus } from '../providers.js';
import { CreateNoteDialog } from './create-note-dialog.js';
import { NoteDocument } from './note-document.js';
import { NotesSearchHeader } from './notes-search-header.js';
import { TocLauncher } from './toc-launcher.js';
import { carryTreeScroll } from './tree-scroll.js';
import { WorkspaceNotesSection } from './workspace-notes-section.js';

/**
 * A ONE-SHOT flash, read by the NEXT mount of this page and cleared
 * immediately — the module-level cache `use-last-project.ts` uses for the
 * same reason, applied to a toast instead of a remembered id.
 *
 * `/notes` and `/notes/[noteId]` are TWO route files (`app/notes/page.tsx`,
 * `app/notes/[noteId]/page.tsx`), each mounting `NotesPage` fresh — so
 * `router.replace('/notes')` from a note whose access was just lost does not
 * merely re-render this component, it REMOUNTS it, and any state set right
 * before the navigation is gone before the toast could ever paint. A module
 * variable survives the remount; component state does not.
 */
let pendingLostAccessToast = false;

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
  const router = useRouter();
  const signedIn = session.kind === 'signed-in' && user !== null;
  const [createOpen, setCreateOpen] = useState(false);

  const [workspaces, setWorkspaces] = useState<WorkspaceRef[] | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  /**
   * ONE filter for every section (18.190). It lives on the page rather than in
   * each section because "narrow the tree" is one act by one person, and two
   * inputs could be left disagreeing — which reads as a tree that half-answered.
   */
  const [titleFilter, setTitleFilter] = useState('');

  /**
   * Search (Task 8, spec §7.8): ONE query and ONE pair of filters, for the
   * same reason `titleFilter` above is one value — held HERE and handed to
   * every `WorkspaceNotesSection`, which runs its OWN `useNotesSearch`
   * against it (one workspace, one subscription; see that hook's own
   * docblock for why it cannot be shared across workspaces). `''` is "no
   * filter" for `searchQuery`/`authorId`/`scopeMode` alike — see
   * `notes-search-header.tsx`'s docblock for why the filters use `''` rather
   * than `null`.
   */
  const [searchQuery, setSearchQuery] = useState('');
  const [authorId, setAuthorId] = useState('');
  const [scopeMode, setScopeMode] = useState('');

  /**
   * Read ONCE, in the lazy initializer, and cleared in the SAME call —
   * `pendingLostAccessToast` is a one-shot flag, and reading it twice (once
   * here, once in an effect) would risk a second mount seeing it still `true`
   * from React's Strict Mode double-invoke of initializers in development.
   */
  const [lostAccessToast, setLostAccessToast] = useState(() => {
    const flash = pendingLostAccessToast;
    pendingLostAccessToast = false;
    return flash;
  });
  const handleLostAccess = useCallback(() => {
    pendingLostAccessToast = true;
    router.replace('/notes');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Task 9's TOC (spec §8.2): `NoteDocument` owns the editor's DOM (the
   * headings live inside it) and this page owns the `<aside>` column — so the
   * ref `ReadingTOC` needs to scroll/observe is CREATED here and handed down,
   * and the headings it needs are reported back up through a callback. See
   * `NoteDocument`'s own docblock for why the ref is not exposed some other
   * way.
   */
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  /**
   * The document column scrolls on its own above 60rem (`.gn-notes__document`,
   * case 18.481), and Next resets the WINDOW's scroll on a navigation, not an
   * element's. In production a note change REMOUNTS this page (see `tree-scroll.ts`),
   * so the new column starts at the top for free; this effect covers the page
   * being reused across a param change (a re-render with a new `noteId`). A link that
   * carries a hash (`#heading`, `#comment-…`) is left alone — the scroll that owns it
   * runs after the content lands. Case 18.485.
   */
  const documentRegionRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (window.location.hash === '') {
      const region = documentRegionRef.current;
      if (region !== null) region.scrollTop = 0;
    }
  }, [noteId]);
  /**
   * Put the tree back where it was after the remount a note change is (18.488; why the tree is
   * not lifted into a layout, and how the offset is carried, is `tree-scroll.ts`'s).
   */
  const treeRef = useRef<HTMLElement | null>(null);
  useEffect(() => (treeRef.current === null ? undefined : carryTreeScroll(treeRef.current)), []);
  const [headings, setHeadings] = useState<ReadingMeta['headings']>([]);

  /**
   * The drawer toggle (Task 9, `<details>`-style, below 60rem — CSS gates the actual visibility; see globals.css).
   * It lives in `.gn-notes__bar` beside "Create note", outside the drawer it opens.
   * With NO note open the list IS the page, so it starts expanded (UX fixes T9, 23.161, audit NP-02): a phone
   * landing on `/notes` used to show filters for a list it hid, and an instruction to "create one" pointing at
   * nothing. With a note open the document is the page and the list starts closed. Above 60rem the attribute
   * is inert (the tree is always drawn).
   */
  const [treeOpen, setTreeOpen] = useState(noteId === undefined);

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

  /**
   * The Author filter's options: every member reachable from ANY workspace
   * this person belongs to, deduplicated by id. A per-workspace roster would
   * make the filter answer a different question in each `WorkspaceNotesSection`
   * than the one box asking it looks like it is asking.
   */
  const [members, setMembers] = useState<RosterMember[]>([]);
  useEffect(() => {
    if (workspaces === null) return;
    let cancelled = false;
    Promise.all(
      workspaces.map((workspace) => dataSource.query.getMembers(workspace.id).catch(() => [] as RosterMember[])),
    ).then((lists) => {
      if (cancelled) return;
      const byId = new Map<string, RosterMember>();
      for (const list of lists) for (const member of list) byId.set(member.id, member);
      setMembers([...byId.values()]);
    });
    return () => {
      cancelled = true;
    };
  }, [dataSource, workspaces]);

  return (
    <main id="gn-main" className="gn-shell gn-shell--wide gn-notes-page">
      <AppNav />
      <div className="gn-notes" data-testid="notes-page">
        <div className="gn-notes__header">
          <h1 className="gn-page-title">Notes</h1>
          {/* Same gate as the tree head's filter below: a search box with nothing to
              search — no workspace, no member roster to filter by — is a
              control that does nothing, which this repo refuses to draw. */}
          {signedIn && refusal === null && workspaces !== null && workspaces.length > 0 ? (
            <NotesSearchHeader
              value={searchQuery}
              onChange={setSearchQuery}
              authorId={authorId}
              onAuthor={setAuthorId}
              scopeMode={scopeMode}
              onScope={setScopeMode}
              members={members}
            />
          ) : null}
        </div>
        {/* The BAR — the drawer toggle and the Create button, OUTSIDE both the drawer and the grid (UX fixes
            T9, 23.161, audit NP-02). The Create button used to sit inside `<nav id="gn-notes-tree">`, which
            globals.css hides while the drawer is closed, so a phone with a note open had no create control at all.
            Here it is painted at every width and is the page's ONE "Create note". Above 60rem the toggle is
            `display: none` and the bar is a row of its own over the unchanged two-column grid.
            The bar is drawn once the workspaces READ has ANSWERED, which is what makes the empty-list arm in the
            tree carry the Create button too (spec §9.7's "No notes yet" AND the button; 18.184). It is absent
            while loading and after a refusal: a Create over a spinner or a refusal panel is a control whose effect
            nobody can see. */}
        <div className="gn-notes__bar">
          {/* Below 60rem (globals.css): a `<details>`-style drawer. Always in the DOM — CSS alone decides whether
              it is painted, `aria-expanded` is the observable a test (or a screen reader) can see regardless of
              viewport, and `aria-controls` names the tree it opens. A ghost `Button` (UX fixes T9, 23.160, audit
              NP-01): the bare `<button>` it was drew the browser's grey slab, the one square object on a neo
              screen. `.gn-button` brings the fill, pill radius, font and the 44px floor;
              `.gn-notes__tree-toggle` still decides WHEN it is drawn. */}
          <Button
            className="gn-notes__tree-toggle"
            aria-expanded={treeOpen}
            aria-controls="gn-notes-tree"
            onClick={() => setTreeOpen((open) => !open)}
          >
            Notes
          </Button>
          {signedIn && refusal === null && workspaces !== null ? (
            <Button onClick={() => setCreateOpen(true)}>Create note</Button>
          ) : null}
        </div>
        <div className="gn-notes__body">
          <nav
            ref={treeRef}
            aria-label="Notes"
            id="gn-notes-tree"
            className="gn-notes__tree gn-notes__tree--drawer"
            data-open={treeOpen ? 'true' : 'false'}
          >
            {/* The tree head — the title filter (the Create button is in the bar above, outside the drawer).
                The FILTER is drawn only once there are rows for it to narrow — filtering an empty tree can only
                ever produce the same empty tree. */}
            {signedIn && refusal === null && workspaces !== null && workspaces.length > 0 ? (
              <div className="gn-notes__tree-head">
                <input
                  type="text"
                  className="gn-notes__filter"
                  aria-label="Filter by title"
                  placeholder="Filter by title"
                  value={titleFilter}
                  onChange={(changeEvent) => setTitleFilter(changeEvent.target.value)}
                />
              </div>
            ) : null}
            {!signedIn ? (
              <p className="gn-notes__session" role="status">
                {session.kind === 'loading' ? (
                  'Checking your session…'
                ) : (
                  <>
                    <Link href={`/sign-in?next=${encodeURIComponent(pathname)}`}>Sign in</Link>{' '}
                    to see your notes. You land back here.
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
                <WorkspaceNotesSection
                  key={workspace.id}
                  workspace={workspace}
                  openNoteId={noteId}
                  titleFilter={titleFilter}
                  searchQuery={searchQuery}
                  authorId={authorId === '' ? undefined : authorId}
                  scopeMode={scopeMode === '' ? undefined : (scopeMode as NoteScopeMode)}
                />
              ))
            )}
          </nav>
          <section className="gn-notes__document" data-testid="note-document-region" ref={documentRegionRef}>
            {noteId === undefined ? (
              <p className="gn-notes__hint">{NO_NOTE_COPY}</p>
            ) : workspaces === null && refusal === null ? (
              // R7b (case 18.462): the workspaces read is still in flight, so
              // the document has nothing to search. Mounting it with `[]` made
              // its search find nothing and draw "That note is no longer
              // shared with you." until the read landed. `[]` is a legitimate
              // ANSWER (no workspaces) and stays the document's to word; only
              // "not asked yet" is held here.
              <p className="gn-notes__hint" role="status">
                Loading…
              </p>
            ) : (
              <NoteDocument
                noteId={noteId}
                workspaces={workspaces ?? []}
                editorRootRef={editorRootRef}
                onHeadingsChange={setHeadings}
                onLostAccess={handleLostAccess}
              />
            )}
          </section>
          {/* `aria-label` stays on THIS wrapper, not on `ReadingTOC`'s own
              inner `<nav>` — case 18.181 (Task 1) already asserts this
              `complementary` landmark exists with no note open, when
              `TocLauncher` renders nothing at all (fewer than MIN_HEADINGS
              is its own gate, and an unopened note has none). Yes, once the
              panel DOES render, `ReadingTOC`'s inner `<nav aria-label="On
              this page">` nests inside a `complementary` region of the same
              name — redundant, not broken; the alternative breaks the region
              that has to exist before any heading does.

              REPURPOSED (owner request 2026-09-23) from a right-hand column,
              visible only above 64rem, to a fixed floating launcher visible
              at every width — see this class's own docblock in globals.css.
              `TocLauncher` wraps `ReadingTOC` rather than replacing it. */}
          <aside className="gn-notes__toc" aria-label="On this page">
            <TocLauncher headings={headings} scrollContainerRef={editorRootRef} />
          </aside>
        </div>
      </div>
      {/* Spec §9.7: a note that stops being readable while open. Mounted at
          the page's foot, like the inbox's own Undo toast, so it survives
          whatever the document region is showing underneath it — though here
          the flag that opens it is set BEFORE the navigation that remounts
          this whole page (see `pendingLostAccessToast`'s own docblock), not
          by a state change on an already-mounted instance. */}
      <Toast
        open={lostAccessToast}
        message="That note is no longer shared with you"
        onDismiss={() => setLostAccessToast(false)}
      />
      {/* The dialog is mounted OUTSIDE `.gn-notes` — `Dialog` portals to the
          body anyway, and keeping it out of the grid means the tree's layout
          cannot be affected by a panel that is not in it. */}
      <CreateNoteDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        workspaces={workspaces ?? []}
        defaultHome={{ workspaceId: workspaces?.[0]?.id ?? '', projectId: '' }}
        onCreated={(noteId) => {
          setCreateOpen(false);
          router.push(`/notes/${noteId}`);
        }}
      />
    </main>
  );
}
