import { useEffect, useState } from 'react';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { useAppServices, useSessionStatus } from './providers.js';

/**
 * The viewer's OTHER workspaces — the rows of the nav's workspace-name dropdown (U-T14, cases 23.254–23.257).
 *
 * The same single `getMyWorkspaces` read `useWorkspaceName` makes, never a second endpoint, narrowed to what the list
 * may show: **live workspaces only** (an archived one is not somewhere `/workspaces` lists among the open ones — the
 * rule Last project's dropdown follows for projects), **and not the one the bar is already about** (the name beside it
 * is that workspace; the list is where ELSE to go). Served order is kept, neither sorted nor re-derived.
 *
 * `[]` is what the caller renders no dropdown for, so a pending or refused read and a viewer with a single workspace
 * give the same answer: the name stays a plain link. A failed read is OMISSION, never a guess.
 *
 * Not cached across mounts, unlike the name: the only cost of a cold start is the dropdown appearing a tick after the
 * name, whereas a cached list could offer a workspace the viewer has since left.
 */
export function useOtherWorkspaces(currentWorkspaceId: string | undefined): readonly WorkspaceRef[] {
  const { dataSource } = useAppServices();
  const session = useSessionStatus();
  const signedIn = session.kind === 'signed-in';
  const [rows, setRows] = useState<readonly WorkspaceRef[]>([]);

  useEffect(() => {
    if (!signedIn) {
      setRows([]);
      return;
    }
    let cancelled = false;
    dataSource.query.getMyWorkspaces().then(
      (all) => {
        if (!cancelled) setRows(all.filter((row) => !row.archived && row.id !== currentWorkspaceId));
      },
      () => {
        if (!cancelled) setRows([]);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [dataSource, signedIn, currentWorkspaceId]);

  return rows;
}
