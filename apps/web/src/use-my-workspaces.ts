'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DataSource, DataSourceQuery } from '@gisik-nokma/app-core';
import { useAppServices, useSessionStatus } from './providers.js';
import { useProjectsVersion } from './projects-version.js';

type Rows = Awaited<ReturnType<DataSourceQuery['getMyWorkspaces']>>;
type Snapshot = { userId: string | null; rows: Rows | null; error: string | null };

/** A settled read older than this is read again at the next mount, its rows painted meanwhile. */
export const MY_WORKSPACES_STALE_MS = 30_000;

type Entry = {
  userId: string;
  dataSource: DataSource;
  /** `projects-version.ts` at the moment the read began: a project write since means this answer is old. */
  version: number;
  startedAt: number;
  settled: boolean;
  rows: Rows | null;
  error: string | null;
  listeners: Set<(snapshot: Snapshot) => void>;
};

let shared: Entry | null = null;

/** Tests share one module, so they share this. Also what every sign-out door clears, through `clear-read-caches.ts` (FD5; case 25.028). */
export function clearMyWorkspacesCache(): void {
  shared = null;
}

/** Tests only: what the shared read holds right now, without mounting a hook (a mount resolves the session, which is itself a door). */
export function peekMyWorkspacesCache(): { userId: string; rows: Rows | null } | null {
  return shared === null ? null : { userId: shared.userId, rows: shared.rows };
}

function snapshotOf(entry: Entry): Snapshot {
  return { userId: entry.userId, rows: entry.rows, error: entry.error };
}

function start(userId: string, dataSource: DataSource, version: number, previous: Entry | null): Entry {
  const entry: Entry = {
    userId,
    dataSource,
    version,
    startedAt: Date.now(),
    settled: false,
    // Stale-while-revalidate: the SAME person's earlier rows stay on screen until the new read lands.
    // Another person's never carry over (case 25.044).
    rows: previous !== null && previous.userId === userId ? previous.rows : null,
    error: null,
    listeners: previous !== null && previous.userId === userId ? previous.listeners : new Set(),
  };
  shared = entry;
  const notify = () => entry.listeners.forEach((listener) => listener(snapshotOf(entry)));
  void dataSource.query.getMyWorkspaces().then(
    (rows) => {
      if (shared !== entry) return;
      entry.rows = rows;
      entry.error = null;
      entry.settled = true;
      notify();
    },
    (cause: unknown) => {
      if (shared !== entry) return;
      entry.rows = null;
      entry.error = cause instanceof Error ? cause.message : String(cause);
      entry.settled = true;
      notify();
      // A refusal is not a fact about the person's workspaces, so it is not kept: the next mount asks again.
      shared = null;
    },
  );
  return entry;
}

/**
 * One shared `getMyWorkspaces` read per signed-in person (audit SM-05; spec §3.2), where each reader used to send
 * its own. Three hooks read the rows through this: the nav's workspace name and dropdown (`useWorkspaceLookup`), Last
 * project and the phone switcher's project list (`useWorkspaceProjects`), and the project / My Work name
 * (`useProjectName`). Module-scoped, so a remount (every page remounts `AppNav`) paints from memory.
 *
 * Not every reader is on it, and that is not an oversight. `useCanModerateComments` keeps its own direct read on
 * purpose: it derives a PERMISSION from the role, and the same-tick in-flight dedupe (`withInflightDedupe`) already
 * folds it into this call. `ProjectTitle` (its role/description read), the phone switcher's own list and `/notes`
 * still call `getMyWorkspaces` directly until smoothness T6, T8 and T9 move them here; so a page can send more than
 * one.
 *
 * Keyed by the signed-in user's id AND the data source (FD5): another person on the same device never
 * sees these rows, and a signed-out render drops them. Re-read when a write bumps `projects-version.ts` (a
 * project's rename or archive, and a workspace joining or leaving the person's list: what the three hooks did one by
 * one before they shared), and at the next mount once the answer is older than `MY_WORKSPACES_STALE_MS`. `enabled` false (no
 * workspace or project in scope) joins nothing and sends nothing.
 */
export function useMyWorkspaces(enabled = true): { rows: Rows | null; error: string | null; reload: () => void } {
  const { dataSource } = useAppServices();
  const session = useSessionStatus();
  const userId = session.kind === 'signed-in' ? session.user.id : null;
  const version = useProjectsVersion();
  const [tick, setTick] = useState(0);
  const forced = useRef(false);
  const [snapshot, setSnapshot] = useState<Snapshot>(() =>
    userId !== null && shared !== null && shared.userId === userId && shared.dataSource === dataSource
      ? snapshotOf(shared)
      : { userId, rows: null, error: null },
  );

  useEffect(() => {
    if (userId === null) {
      shared = null;
      setSnapshot({ userId: null, rows: null, error: null });
      return undefined;
    }
    // A caller with nothing to look up (no workspace in scope) fires nothing, as each hook did on its own (13.863).
    if (!enabled) return undefined;
    const usable =
      shared !== null &&
      shared.userId === userId &&
      shared.dataSource === dataSource &&
      shared.version === version &&
      !(shared.settled && Date.now() - shared.startedAt > MY_WORKSPACES_STALE_MS);
    let entry: Entry;
    if (usable && !forced.current && shared !== null) {
      entry = shared;
    } else {
      forced.current = false;
      entry = start(userId, dataSource, version, shared);
    }
    const listener = (next: Snapshot) => setSnapshot(next);
    entry.listeners.add(listener);
    setSnapshot(snapshotOf(entry));
    return () => {
      entry.listeners.delete(listener);
    };
  }, [userId, dataSource, version, tick, enabled]);

  const reload = useCallback(() => {
    forced.current = true;
    setTick((n) => n + 1);
  }, []);

  // A render for a different person than the snapshot was taken for answers nothing, whatever the state holds.
  const current = enabled && snapshot.userId === userId ? snapshot : { rows: null, error: null };
  return { rows: current.rows, error: current.error, reload };
}
