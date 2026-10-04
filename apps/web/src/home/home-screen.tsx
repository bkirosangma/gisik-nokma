'use client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { Button } from '@gisik-nokma/ui';
import { AppNav } from '../app-nav.js';
import { ExpiredSessionNotice, useSignInOnExpiredSession } from '../expired-session.js';
import { useAppServices, useSessionStatus } from '../providers.js';
import { readLastWorkspace, type LastWorkspace } from '../use-last-workspace.js';
import { resolveHomeWorkspace } from './resolve-home-workspace.js';

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

  const reload = useCallback(() => {
    setFailure(null);
    dataSource.query.getMyWorkspaces().then(setWorkspaces, (cause: unknown) => {
      setFailure(cause instanceof Error ? cause.message : String(cause));
    });
  }, [dataSource]);
  useEffect(() => reload(), [reload]);

  const expired = useSignInOnExpiredSession([failure]);
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
        {/* KG-E T3: numbers */}
        {/* KG-E T4: graph */}
      </div>
    </main>
  );
}
