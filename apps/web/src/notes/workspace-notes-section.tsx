'use client';

import { useState } from 'react';
import { Button } from '@gisik-nokma/ui';
import type { NoteSummary } from '@gisik-nokma/domain';
import { makeSubmittedFactory } from '@gisik-nokma/app-core';
import { useLiveQuery } from '@gisik-nokma/app-core';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { useAppServices, useCurrentUser } from '../providers.js';
import { NoteRow } from './note-row.js';

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

export function WorkspaceNotesSection({
  workspace,
  openNoteId,
  titleFilter = '',
}: {
  workspace: WorkspaceRef;
  openNoteId?: string;
  titleFilter?: string;
}) {
  const { dataSource } = useAppServices();
  const user = useCurrentUser();

  const notes = useLiveQuery(dataSource, workspace.id, 'notes', () =>
    dataSource.query.getNotes(workspace.id),
  );
  const deleted = useLiveQuery(dataSource, workspace.id, 'deleted-notes', () =>
    dataSource.query.getDeletedNotes(workspace.id),
  );

  const [restoreFailure, setRestoreFailure] = useState<string | null>(null);

  const needle = titleFilter.trim().toLowerCase();
  const filtering = needle !== '';
  const matches = (note: NoteSummary): boolean =>
    !filtering || note.title.toLowerCase().includes(needle);

  const rows = (notes.data ?? []).filter(matches);

  const homeRows = rows.filter((note) => note.homeProjectId === '').sort(byUpdatedDesc);

  const knownIds = new Set(workspace.projects.map((project) => project.id));
  const unknownHomeIds = [
    ...new Set(
      rows
        .map((note) => note.homeProjectId)
        .filter((home) => home !== '' && !knownIds.has(home)),
    ),
  ].sort();
  const groups = [
    ...workspace.projects.map((project) => ({ id: project.id, name: project.name })),
    ...unknownHomeIds.map((id) => ({ id, name: id })),
  ];
  const rowsFor = (homeId: string): NoteSummary[] =>
    rows.filter((note) => note.homeProjectId === homeId).sort(byUpdatedDesc);

  const mayRestoreOthers = workspace.role === 'owner' || workspace.role === 'admin';
  const deletedRows = (deleted.data ?? [])
    .filter(matches)
    .filter((note) => mayRestoreOthers || note.authorId === user?.id)
    .sort(byUpdatedDesc);

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
    </section>
  );
}
