import { useEffect, useState } from 'react';
import { useAppServices, useSessionStatus } from './providers.js';

/**
 * Is the signed-in viewer an owner or admin of this workspace — who may DELETE anyone's comment (MCP-everything T5; never
 * edit one). Read off `getMyWorkspaces`, the same read the workspace name and the note page's `canEdit` use, so there is one
 * source for "what is this viewer here". `false` until the read answers and on any failure: the comment thread then offers
 * Delete to the writer only, which is still correct — the server's permission gate decides what commits.
 *
 * It STAYS on its own direct `getMyWorkspaces` read and is deliberately NOT moved onto `useMyWorkspaces` (planner ruling,
 * 2026-10-03 00:03, smoothness T4 FIX 1): it derives a PERMISSION, and the same-tick in-flight dedupe
 * (`withInflightDedupe`) already folds it into the shared hooks' call. Do not "finish the migration" here.
 */
export function useCanModerateComments(workspaceId: string | undefined): boolean {
  const { dataSource } = useAppServices();
  const session = useSessionStatus();
  const signedIn = session.kind === 'signed-in';
  const [moderator, setModerator] = useState(false);

  useEffect(() => {
    if (workspaceId === undefined || !signedIn) {
      setModerator(false);
      return;
    }
    let cancelled = false;
    dataSource.query.getMyWorkspaces().then(
      (rows) => {
        if (cancelled) return;
        const role = rows.find((row) => row.id === workspaceId)?.role;
        setModerator(role === 'owner' || role === 'admin');
      },
      () => {
        if (!cancelled) setModerator(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [dataSource, workspaceId, signedIn]);

  return moderator;
}
