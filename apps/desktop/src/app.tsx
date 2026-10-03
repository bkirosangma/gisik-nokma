import { useEffect, useMemo, useState } from 'react';
import {
  createHttpTransport,
  createOutbox,
  createReplica,
  createSyncEngine,
  type SyncStatus,
} from '@gisik-nokma/sync-client';
import {
  HelpBrowser,
  SyncNotices,
  createReplicaDataSource,
  type ReplicaDataSource,
  type SyncNoticeView,
} from '@gisik-nokma/app-core';
import { createTauriSqlStorage } from './storage/tauri-sql-storage.js';
import { initReplica } from './init-replica.js';
import { SIGNED_OUT_HINT } from './copy.js';
import { OpeningSkeleton, TicketList } from './ticket-list.js';

// Dev configuration; Plan 11 owns real endpoints. Session/workspace selection
// follows Plan 6's session handling once it lands (Open questions) — until
// then the token and workspace arrive via localStorage set on the sign-in page.
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000';

// DEVIATION, and its stated reason EXPIRED — corrected 2026-09-21 (E2-25)
// rather than deleted, so the next reader finds the correction where the old
// justification was. This read: "SyncStatusBar and ContestBanner do not exist
// in @gisik-nokma/app-core yet (Plan 6 has not landed them) — the sync status
// is rendered here as plain inline markup instead of a component that does not
// exist."
//
// Both components exist and are exported from the barrel
// (`sync/sync-status-bar.tsx:68`, `contests/contest-banner.tsx:25`,
// `index.ts:313` and `:310`), so desktop is not blocked from mounting them. It
// still renders the sync status as inline markup, and that is now a real
// deviation with a cost worth naming: **the wording here is a hand-copy of
// app-core's, and nothing connects the two, so a wording change on either side
// will not be caught.** Measured at the time of this correction: the five
// offline/degraded components (`UnreadBadge`, `ClockSkewBadge`,
// `SavedFiltersMenu`, `SyncStatusBar`, `ContestBanner`) have ZERO production
// renders across `apps/` and `packages/` — only test files render them. Whether
// to mount them or delete them is a product decision and is NOT taken here.
export function App() {
  const [ds, setDs] = useState<ReplicaDataSource | null>(null);
  const [status, setStatus] = useState<SyncStatus>('offline');
  const [queued, setQueued] = useState(0);
  const [failed, setFailed] = useState(0);
  const [notices, setNotices] = useState<SyncNoticeView[]>([]);
  /**
   * The help view is state on the shell rather than a route, because this app
   * has no router — and it is deliberately readable in BOTH branches below,
   * including the signed-out one. The FAQ's answer to "why can't I sign in" is
   * worth least behind a sign-in, and the desktop app's signed-out branch is
   * exactly where somebody stuck at that question ends up.
   */
  const [showHelp, setShowHelp] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const workspaceId = useMemo(() => localStorage.getItem('gisik.workspaceId') ?? '', []);
  const token = useMemo(() => localStorage.getItem('gisik.token') ?? '', []);

  useEffect(() => {
    if (workspaceId === '' || token === '') return;
    let disposed = false;
    let stop: (() => void) | undefined;
    void (async () => {
      // DEVIATION beyond the plan text: createReplicaDataSource's real
      // ReplicaDataSourceDeps shape is { workspaceId, replica, outbox, engine,
      // storage } — the plan's snippet omitted workspaceId and storage, which
      // does not compile against packages/app-core/src/replica/replica-data-source.ts.
      const result = await initReplica(
        { apiBase: API_BASE, token, workspaceId },
        {
          createStorage: createTauriSqlStorage,
          createReplicaFn: createReplica,
          createOutboxFn: createOutbox,
          createHttpTransportFn: createHttpTransport,
          createSyncEngineFn: createSyncEngine,
          createReplicaDataSourceFn: createReplicaDataSource,
        },
      );
      if (disposed) return;
      if (!result.ok) {
        setInitError(result.error);
        return;
      }
      const { dataSource, engine } = result;
      setInitError(null);
      setDs(dataSource);
      const offStatus = engine.onStatus(setStatus);
      const refreshCounts = (): void => {
        void dataSource.query.syncStatus(workspaceId).then((s) => {
          setQueued(s.queued);
          setFailed(s.failed);
        });
        void dataSource.query.syncNotices(workspaceId).then(setNotices);
      };
      const offChange = dataSource.subscribe(workspaceId, 0, refreshCounts);
      // Online/offline transitions: the OS's word starts/stops the engine;
      // the engine's status is what the UI trusts.
      const goOnline = (): void => void engine.start(workspaceId);
      const goOffline = (): void => engine.stop();
      window.addEventListener('online', goOnline);
      window.addEventListener('offline', goOffline);
      if (navigator.onLine) void engine.start(workspaceId);
      refreshCounts();
      stop = () => {
        offStatus();
        offChange();
        window.removeEventListener('online', goOnline);
        window.removeEventListener('offline', goOffline);
        engine.stop();
      };
    })();
    return () => {
      disposed = true;
      stop?.();
    };
  }, [workspaceId, token]);

  const helpToggle = (
    <button type="button" className="gn-help__toggle" onClick={() => setShowHelp((v) => !v)}>
      {showHelp ? 'Back' : 'Manual & FAQ'}
    </button>
  );

  if (workspaceId === '' || token === '') {
    return (
      <div className="app-shell">
        <p className="app-signin-hint">{SIGNED_OUT_HINT}</p>
        {helpToggle}
        {showHelp ? <HelpBrowser /> : null}
      </div>
    );
  }
  if (showHelp) {
    return (
      <div className="app-shell">
        {helpToggle}
        <HelpBrowser />
      </div>
    );
  }
  return (
    <div className="app-shell">
      <div className="app-shell__sync-status" role="status">
        <span>sync: {status}</span>
        <span>queued: {queued}</span>
        <span>failed: {failed}</span>
      </div>
      <SyncNotices
        notices={notices}
        onDismiss={(id) => {
          if (ds === null) return;
          void ds.query
            .dismissSyncNotice(id)
            .then(() => ds.query.syncNotices(workspaceId))
            .then(setNotices);
        }}
      />
      {helpToggle}
      {/* Plan 6's Board/List/ticket views mount here with ds as their DataSource.
          Until they land, the shell renders the sync status strip and a minimal
          ticket list driven by ds.query.listTicketSummaries — enough to see
          pending badges live.

          When they do mount: the Calendar and Timeline take `today`/`anchor` as
          `istDayOf(new Date().toISOString())` — the device supplies the instant,
          which it owns, and the domain decides the day, which it owns — and any
          timestamp this shell prints goes through `formatIstInstant`, with
          `IST_CLOCK_NOTE` naming the clock. Never `toLocaleDateString()`, and
          never the zone name written inline — it comes from IST_TIME_ZONE. A
          desktop replica that answered "which day is this?" from the OS would
          put the same claim in a different cell from the server, and nothing
          would report the disagreement. */}
      {initError !== null ? (
        <p role="alert">{initError}</p>
      ) : ds === null ? (
        <OpeningSkeleton />
      ) : (
        <TicketList ds={ds} workspaceId={workspaceId} />
      )}
    </div>
  );
}
