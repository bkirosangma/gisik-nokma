'use client';

import { useEffect, useState } from 'react';
import type { DataSource, WorkspaceRef } from '@gisik-nokma/app-core';
import { clearLastNote, readLastNote } from './last-note.js';

export type RememberedNote = { noteId: string; workspaceId: string };

/**
 * The note this device last had open, VERIFIED to still be readable (smoothness G-3 addendum, 25.351–25.353).
 *
 * `/notes` spans every workspace and the key is per workspace, so the rule is: walk `workspaces` in the order the
 * page lists them and take the first one whose key names a note that still answers. A note that answers `null`
 * (gone, or no longer shared) or that is deleted is dropped SILENTLY and its key cleared — a deleted note still
 * answers, with a flag and a Restore banner, and landing a reader there on entry would be the opposite of "pick up
 * where I was". A read that THROWS clears nothing: a flaky network must not erase a good memory.
 *
 * Storage is read in an effect, never during render, so the server and the first client render agree. `null` is
 * "nothing to resume", which is also the answer while the check is in flight.
 */
export function useRememberedNote({
  enabled,
  userId,
  workspaces,
  dataSource,
}: {
  enabled: boolean;
  userId: string;
  workspaces: WorkspaceRef[] | null;
  dataSource: DataSource;
}): RememberedNote | null {
  const [found, setFound] = useState<RememberedNote | null>(null);

  useEffect(() => {
    if (!enabled || workspaces === null || userId === '') {
      setFound(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      for (const workspace of workspaces) {
        const noteId = readLastNote(userId, workspace.id);
        if (noteId === null) continue;
        let note;
        try {
          note = await dataSource.query.getNote(workspace.id, noteId);
        } catch {
          continue;
        }
        if (cancelled) return;
        if (note === null || note.deleted === true) {
          clearLastNote(userId, workspace.id);
          continue;
        }
        setFound({ noteId, workspaceId: workspace.id });
        return;
      }
      if (!cancelled) setFound(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, userId, workspaces, dataSource]);

  return found;
}
