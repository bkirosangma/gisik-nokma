'use client';

import { memo, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Button, useWait } from '@gisik-nokma/ui';
import type { NoteScopeMode, NoteSummary } from '@gisik-nokma/domain';
import { makeSubmittedFactory } from '@gisik-nokma/app-core';
import { useLiveQuery } from '@gisik-nokma/app-core';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { useAppServices, useCurrentUser } from '../providers.js';
import { useNotesSearch } from '../use-notes-search.js';
import { prefetchEditor } from '../editor-slot.js';
import { NoteRow } from './note-row.js';
import { NoteRowSkeleton } from './note-skeletons.js';
import { SCOPE_LABELS } from './note-scope-options.js';

/**
 * ONE workspace's branch of the notes tree (spec §9.2).
 *
 * ## Why one component per workspace rather than one call with every id
 *
 * This is the shape the page's hooks force, and it is worth stating because it
 * looks like an accident. A note list is a LIVE query — `useLiveQuery` opens one
 * subscription per key — and hooks cannot be called in a loop, so "one
 * workspace" is the largest unit that can be a component. The page renders one
 * of these per workspace and each owns its own two reads.
 *
 * ## The groups are the WORKSPACE's shape, not the notes' shape
 *
 * Every project the workspace serves gets a heading whether or not it holds a
 * note, because the tree answers "where do notes live here" and a project that
 * vanished until someone wrote in it would be a tree that redraws itself under
 * the reader. The one exception is while a FILTER is applied (below).
 *
 * ## An unknown home still draws, keyed by the id
 *
 * `homeProjectId` is a name, and a name can outlive the thing it named: a
 * project deleted between a note's creation and this read leaves a note whose
 * home is not in `workspace.projects`. The two silent options are both wrong —
 * dropping the note hides a document its author can still open, and filing it
 * under the workspace heading claims a home it does not have — so the note gets
 * a group of its own, HEADED BY THE RAW ID (18.186's control). The id is ugly
 * and it is TRUE, which is the trade this repo takes every time a name is
 * missing.
 *
 * ## The Deleted group's gate is the read's own rule, applied again
 *
 * `getDeletedNotes` already narrows to the viewer's own notes for a plain
 * member (case 18.101, spec §5.3). This applies the same rule to the rows it
 * received rather than trusting the read: a group that rendered whatever it was
 * handed would show someone else's deleted note the day any client over-serves,
 * and the fix for that must not be "the other side will be careful" (18.189).
 */

/** Newest first, by the server's own `updatedAt`. */
function byUpdatedDesc(a: NoteSummary, b: NoteSummary): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

/**
 * `NoteSearchHit.snippet` carries the server's `**match**` markers
 * (`apps/server/src/read/headline.ts`'s `HEADLINE_OPTIONS`, the same
 * convention the ticket search snippet uses) — this turns each one into a
 * `<mark>`, leaving everything else as plain text.
 */
function renderSnippet(snippet: string): ReactNode {
  return snippet.split(/(\*\*[^*]+\*\*)/g).map((part, index) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <mark key={index}>{part.slice(2, -2)}</mark>
    ) : (
      <span key={index}>{part}</span>
    ),
  );
}

/**
 * Memoised (smoothness T9, 25.157): the page re-renders for reasons that are not this section's (the headings a keystroke
 * reports, the drawer toggle, the Create dialog), and every one of them used to rebuild every workspace's tree and re-run
 * its `useNotesSearch`. The props are primitives and the `workspace` row, which the shared workspaces read keeps stable.
 */
export const WorkspaceNotesSection = memo(function WorkspaceNotesSection({
  workspace,
  openNoteId,
  titleFilter = '',
  searchQuery = '',
  authorId,
  scopeMode,
  onSettled,
}: {
  workspace: WorkspaceRef;
  openNoteId?: string;
  titleFilter?: string;
  /** Task 8, spec §7.8. `''` (the default) means the tree's groups render — search is per-workspace, one `useNotesSearch` each, all driven from `NotesPage`'s single box. */
  searchQuery?: string;
  authorId?: string;
  scopeMode?: NoteScopeMode;
  /** Whether both of this workspace's reads have answered (smoothness-2 G1, 25.247): the page shows the lists together, when every workspace has. */
  onSettled?: (workspaceId: string, settled: boolean) => void;
}) {
  const { dataSource } = useAppServices();
  const user = useCurrentUser();

  // `cacheKey`: a note change remounts this page (`tree-scroll.ts`), and the tree is painted from the last answer while the
  // read runs again, so the list does not blank and refill under the reader (smoothness T9, 25.152).
  const notes = useLiveQuery(dataSource, workspace.id, 'notes', () => dataSource.query.getNotes(workspace.id), {
    cacheKey: 'notes',
  });
  const deleted = useLiveQuery(dataSource, workspace.id, 'deleted-notes', () => dataSource.query.getDeletedNotes(workspace.id), {
    cacheKey: 'deleted-notes',
  });

  // `hasAnswered` as well as `data`: it is a guard against a future KEY change. `hasAnswered` is lifetime, not per key, and a key
  // change nulls `data` until the new key's read answers (`useLiveQuery`'s key effect), so with it the page would not put its skeleton
  // back over a list that was already drawn. Today it never decides anything: both keys are constants ('notes', 'deleted-notes'),
  // `reload()` never blanks `data`, and a refusal that withdraws a cached answer sets `error` in the same update. A refusal is an
  // answer (the page draws the empty groups, as it always did). A layout effect, so the
  // cached lists the page remounts with (25.152) are reported before the first paint and are never hidden behind a skeleton.
  const settled =
    (notes.data !== null || notes.hasAnswered || notes.error !== null) && (deleted.data !== null || deleted.hasAnswered || deleted.error !== null);
  useLayoutEffect(() => {
    onSettled?.(workspace.id, settled);
    return () => onSettled?.(workspace.id, false);
  }, [onSettled, workspace.id, settled]);

  /**
   * `useNotesSearch` owns its OWN `query`/`setQuery`, uncontrolled — it is
   * Plan 3's hook, built for a single search box, and this page hands it the
   * SAME text on every keystroke rather than widening its contract. The
   * effect is the sync: `NotesPage`'s `searchQuery` is the source of truth,
   * and this is the one place per workspace that copies it in.
   */
  const search = useNotesSearch(dataSource.query, workspace.id, { authorId, scopeMode });
  useEffect(() => {
    search.setQuery(searchQuery);
    // `search.setQuery` is stable (a `useState` setter); listing it would
    // re-run this on every render of the search hook itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  const [restoreFailure, setRestoreFailure] = useState<string | null>(null);

  const needle = titleFilter.trim().toLowerCase();
  const filtering = needle !== '';
  const mayRestoreOthers = workspace.role === 'owner' || workspace.role === 'admin';
  const userId = user?.id;

  // The tree's shape, rebuilt only when what it is built from changes (not on every keystroke's re-render of the page above).
  const { homeRows, groups, rowsByHome, deletedRows } = useMemo(() => {
    const matches = (note: NoteSummary): boolean => !filtering || note.title.toLowerCase().includes(needle);
    const rows = (notes.data ?? []).filter(matches);
    const byHome = new Map<string, NoteSummary[]>();
    for (const note of [...rows].sort(byUpdatedDesc)) {
      const bucket = byHome.get(note.homeProjectId);
      if (bucket === undefined) byHome.set(note.homeProjectId, [note]);
      else bucket.push(note);
    }
    const knownIds = new Set(workspace.projects.map((project) => project.id));
    const unknownHomeIds = [...new Set(rows.map((note) => note.homeProjectId).filter((home) => home !== '' && !knownIds.has(home)))].sort();
    return {
      homeRows: byHome.get('') ?? [],
      groups: [
        ...workspace.projects.map((project) => ({ id: project.id, name: project.name })),
        ...unknownHomeIds.map((id) => ({ id, name: id })),
      ],
      rowsByHome: byHome,
      deletedRows: (deleted.data ?? [])
        .filter(matches)
        .filter((note) => mayRestoreOthers || note.authorId === userId)
        .sort(byUpdatedDesc),
    };
  }, [notes.data, deleted.data, needle, filtering, workspace.projects, mayRestoreOthers, userId]);
  const rowsFor = (homeId: string): NoteSummary[] => rowsByHome.get(homeId) ?? [];

  // A search that has not answered yet is a wait, not "No notes match" (25.158). Held for the standard wait so a search that
  // answers in a blink never flashes a skeleton, and never drawn over results that already came back.
  const waiting = useWait(search.searching && search.results.length === 0);

  async function restore(noteId: string): Promise<void> {
    if (user === null) return;
    const make = makeSubmittedFactory({ actorId: user.id, origin: 'web' });
    const event = make({
      workspaceId: workspace.id,
      entity: { kind: 'note', id: noteId },
      type: 'note.restored',
      payload: {},
    });
    const results = await dataSource.ingest([event]);
    const result = results[0];
    if (result === undefined) {
      setRestoreFailure('The server did not answer this change.');
      return;
    }
    if (result.status === 'committed') {
      setRestoreFailure(null);
      deleted.reload();
      notes.reload();
      return;
    }
    // A refusal keeps the row where it is and SAYS SO. Silently leaving a row
    // that did not move is the failure this branch exists to avoid: the person
    // pressed Restore, the note is still in Deleted, and nothing explained it.
    setRestoreFailure(result.status === 'refused' ? result.reason : result.message);
  }

  // While filtering, a heading with nothing under it is hidden: it would claim
  // the workspace holds matches under this word when it does not. Unfiltered,
  // every heading draws (18.190's control).
  const showGroup = (homeId: string): boolean => !filtering || rowsFor(homeId).length > 0;

  return (
    <section className="gn-notes__section" data-testid={`notes-container-${workspace.id}`}>
      <h2 className="gn-notes__section-title">{workspace.name}</h2>

      {searchQuery !== '' ? (
        <div className="gn-notes__search-results" data-testid={`notes-results-${workspace.id}`}>
          {search.corrected !== null ? (
            <p className="gn-notes__corrected">{`Showing results for ${search.corrected.join(' ')}`}</p>
          ) : null}
          {search.results.length === 0 ? (
            search.searching ? (
              waiting ? <NoteRowSkeleton label="Searching notes" rows={2} /> : null
            ) : (
              <p className="gn-notes__no-results">No notes match</p>
            )
          ) : (
            <ol className="gn-notes__results">
              {search.results.map((hit) => (
                <li
                  key={hit.noteId}
                  className="gn-notes__result"
                  data-testid={`notes-result-${hit.noteId}`}
                  data-source={hit.source}
                >
                  <Link
                    href={`/notes/${hit.noteId}`}
                    className="gn-notes__result-title"
                    onPointerEnter={prefetchEditor}
                    onFocus={prefetchEditor}
                    onClick={prefetchEditor}
                  >
                    {hit.title}
                  </Link>
                  <p className="gn-notes__snippet">{renderSnippet(hit.snippet)}</p>
                  <span className="gn-notes__scope">{SCOPE_LABELS[hit.scopeMode]}</span>
                  {hit.attachedTicketKeys.length > 0 ? (
                    <span className="gn-notes__keys">
                      {hit.attachedTicketKeys.map((key) => (
                        <span key={key} className="gn-notes__key">
                          {key}
                        </span>
                      ))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      ) : (
        <>
          {homeRows.length > 0 ? (
            <ul className="gn-notes__rows" data-testid={`notes-home-${workspace.id}`}>
              {homeRows.map((note) => (
                <NoteRow key={note.noteId} note={note} open={note.noteId === openNoteId} />
              ))}
            </ul>
          ) : null}

          {groups.filter((group) => showGroup(group.id)).map((group) => (
            <section
              key={group.id}
              className="gn-notes__group"
              data-testid={`notes-container-${group.id}`}
            >
              <h3 className="gn-notes__group-title">{group.name}</h3>
              <ul className="gn-notes__rows">
                {rowsFor(group.id).map((note) => (
                  <NoteRow key={note.noteId} note={note} open={note.noteId === openNoteId} />
                ))}
              </ul>
            </section>
          ))}

          {deletedRows.length > 0 ? (
            <section className="gn-notes__group gn-notes__deleted" data-testid="notes-deleted">
              <h3 className="gn-notes__group-title">Deleted</h3>
              <ul className="gn-notes__rows">
                {deletedRows.map((note) => (
                  <li key={note.noteId} className="gn-notes__row-item">
                    <span className="gn-notes__row-title">{note.title}</span>
                    <Button aria-label={`Restore ${note.title}`} onClick={() => void restore(note.noteId)}>
                      Restore
                    </Button>
                  </li>
                ))}
              </ul>
              {restoreFailure !== null ? (
                <p className="gn-notes__restore-failure" role="status">
                  {restoreFailure}
                </p>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </section>
  );
});
