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
  createReplicaDataSource,
  type ReplicaDataSource,
  type TicketSummary,
} from '@gisik-nokma/app-core';
import { createTauriSqlStorage } from './storage/tauri-sql-storage.js';
import { initReplica } from './init-replica.js';

// Dev configuration; Plan 11 owns real endpoints. Session/workspace selection
// follows Plan 6's session handling once it lands (Open questions) — until
// then the token and workspace arrive via localStorage set on the sign-in page.
const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:3000';

// DEVIATION beyond the plan text: SyncStatusBar and ContestBanner do not exist
// in @gisik-nokma/app-core yet (Plan 6 has not landed them) — the sync status
// is rendered here as plain inline markup instead of a component that does
// not exist.
export function App() {
  const [ds, setDs] = useState<ReplicaDataSource | null>(null);
  const [status, setStatus] = useState<SyncStatus>('offline');
  const [queued, setQueued] = useState(0);
  const [failed, setFailed] = useState(0);
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
        <p className="app-signin-hint">Sign in on the web app, then paste your token in Settings (interim flow — see plan Open questions).</p>
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
        <p>Opening local replica…</p>
      ) : (
        <TicketList ds={ds} workspaceId={workspaceId} />
      )}
    </div>
  );
}

function TicketList(props: { ds: ReplicaDataSource; workspaceId: string }) {
  const [tickets, setTickets] = useState<TicketSummary[]>([]);
  useEffect(() => {
    // DEVIATION beyond the plan text: ds.query.listTickets does not exist on
    // ReplicaDataSource's query surface — the real method is
    // listTicketSummaries(workspaceId), which already returns {ticketId,
    // title, stateId, pending, openContests} among other fields.
    const refresh = (): void => void props.ds.query.listTicketSummaries(props.workspaceId).then(setTickets);
    refresh();
    return props.ds.subscribe(props.workspaceId, 0, refresh);
  }, [props.ds, props.workspaceId]);
  return (
    <ul className="ticket-list">
      {tickets.map((t) => (
        <li className="ticket-list__row" key={t.ticketId}>
          <span className="ticket-list__title">{t.title}</span>
          <span className="ticket-list__state">{t.stateId}</span>
          {t.pending ? <span className="ticket-list__badge ticket-list__badge--pending">claim in transit</span> : null}
          {t.openContests > 0 ? <span className="ticket-list__badge ticket-list__badge--contested">{t.openContests} contested</span> : null}
        </li>
      ))}
    </ul>
  );
}
