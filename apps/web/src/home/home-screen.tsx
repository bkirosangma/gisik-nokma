'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLiveQuery, type DataSource, type WorkspaceRef } from '@gisik-nokma/app-core';
import { Button } from '@gisik-nokma/ui';
import { AppNav } from '../app-nav.js';
import { ExpiredSessionNotice, useSignInOnExpiredSession } from '../expired-session.js';
import { useAppServices, useSessionStatus } from '../providers.js';
import { readLastWorkspace, type LastWorkspace } from '../use-last-workspace.js';
import { HomeNumbers } from './home-numbers.js';
import { resolveHomeWorkspace } from './resolve-home-workspace.js';
import { useHomeHighlight } from './use-home-highlight.js';

/** Home (Knowledge Graph spec E): `/`. T2 is the frame; T3 adds the numbers and T4 the graph inside `.gn-home`. */
export function HomeScreen() {
  const { dataSource } = useAppServices();
  const session = useSessionStatus();
  const userId = session.kind === 'signed-in' ? session.user.id : null;
  // Read SYNCHRONOUSLY for the user who is signed in NOW — never `useLastWorkspace`'s state, which answers `none`
  // before the session lands and lags one render behind it (27.628). `AppNav` keeps its own hook.
  const remembered = useMemo<LastWorkspace>(
    () => (userId === null ? { status: 'unknown' } : readLastWorkspace(userId)),
    [userId],
  );
  const [workspaces, setWorkspaces] = useState<WorkspaceRef[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // The numbers' read error, lifted from `HomeBody` so a 401 there ends the session like one here (T3).
  const [homeError, setHomeError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setFailure(null);
    dataSource.query.getMyWorkspaces().then(setWorkspaces, (cause: unknown) => {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    });
  }, [dataSource]);
  useEffect(() => reload(), [reload]);

  const expired = useSignInOnExpiredSession([failure, homeError]);
  const error = expired ? null : failure;
  const resolved = resolveHomeWorkspace(remembered, workspaces);

  return (
    <main id="gn-main" className="gn-shell">
      <AppNav />
      <div className="gn-home">
        <h1 className="gn-page-title">{resolved.status === 'ready' ? resolved.workspace.name : 'Home'}</h1>
        {expired ? <ExpiredSessionNotice /> : null}
        {error !== null ? (
          <div className="gn-home__refusal">
            <p>Couldn&apos;t load your workspaces.</p>
            <Button onClick={reload}>Retry</Button>
          </div>
        ) : null}
        {error === null && resolved.status === 'none' ? (
          <section className="gn-home__empty">
            <p>You are not in a workspace yet.</p>
            <Link className="gn-button gn-button--primary" href="/workspaces">Create or join a workspace</Link>
          </section>
        ) : null}
        {resolved.status === 'ready' ? (
          <HomeBody key={resolved.workspace.id} workspaceId={resolved.workspace.id} expired={expired} onError={setHomeError} />
        ) : null}
        {/* KG-E T4: graph */}
      </div>
    </main>
  );
}

function useHome(source: DataSource, workspaceId: string) {
  return useLiveQuery(source, workspaceId, `home:${workspaceId}`, () => source.query.getHome(workspaceId), {
    cacheKey: `home:${workspaceId}`,
  });
}

/**
 * The numbers for one workspace (T3). Keyed by the workspace at its call site, so a lit number and the last known
 * window never leak from one workspace to the next. Its read error goes UP (`onError`): `HomeScreen` owns the
 * expired-session check, and passes back `expired` so a 401 shows the notice and not "Couldn't load the numbers."
 */
function HomeBody({
  workspaceId,
  expired,
  onError,
}: {
  workspaceId: string;
  expired: boolean;
  onError: (error: string | null) => void;
}) {
  const { dataSource } = useAppServices();
  const result = useHome(dataSource, workspaceId);
  const highlight = useHomeHighlight(result.data);
  // The last answer's window, so a failed reload keeps its label (planner ruling 2026-10-04 Q2).
  const [lastDueSoonDays, setLastDueSoonDays] = useState<number | undefined>(undefined);
  useEffect(() => {
    if (result.data !== null) setLastDueSoonDays(result.data.dueSoonDays);
  }, [result.data]);
  useEffect(() => {
    onError(result.error);
  }, [onError, result.error]);
  useEffect(() => () => onError(null), [onError]);
  return (
    <HomeNumbers
      home={result.data}
      failed={!expired && result.error !== null && result.data === null}
      onRetry={result.reload}
      pressed={highlight.pressed}
      onToggle={highlight.toggle}
      dueSoonDays={lastDueSoonDays}
    />
  );
}
