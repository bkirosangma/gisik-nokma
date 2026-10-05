import { useEffect, useSyncExternalStore } from 'react';
import type { DataSource } from '../data-source.js';
import type { DraftRow } from '../view-types.js';
import { useLiveQuery, type LiveQueryResult } from './use-live-query.js';

/**
 * The drafts being saved, per workspace (drafts plan, Task 8, decision 5). The dialog adds a row before the server
 * answers; a refusal removes it; `useMyDrafts` drops it the moment the real list contains its id, so a row cannot
 * outlive its answer. One store for the three readers (the Drafts page, the nav count, the dialog).
 */
const rows = new Map<string, DraftRow[]>();
const listeners = new Set<() => void>();
const NONE: readonly DraftRow[] = [];

function publish(workspaceId: string, next: DraftRow[]): void {
  if (next.length === 0) rows.delete(workspaceId);
  else rows.set(workspaceId, next);
  for (const listener of [...listeners]) listener();
}

/** Put a row being saved at the head of its workspace's list (a repeat of the same id replaces it). */
export function addPendingDraft(workspaceId: string, row: DraftRow): void {
  publish(workspaceId, [row, ...(rows.get(workspaceId) ?? []).filter((r) => r.ticketId !== row.ticketId)]);
}

export function removePendingDraft(workspaceId: string, ticketId: string): void {
  const current = rows.get(workspaceId);
  if (current === undefined || !current.some((r) => r.ticketId === ticketId)) return;
  publish(workspaceId, current.filter((r) => r.ticketId !== ticketId));
}

/** A stable reference until the workspace's rows change (a `useSyncExternalStore` snapshot). */
export function pendingDraftsOf(workspaceId: string): readonly DraftRow[] {
  return rows.get(workspaceId) ?? NONE;
}

/** Tests only: empty every workspace's rows. */
export function resetPendingDrafts(): void {
  rows.clear();
  for (const listener of [...listeners]) listener();
}

const subscribe = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** The server's list with the rows still being saved in front. `null` while the server has not answered. */
export function mergeDrafts(server: readonly DraftRow[] | null, pending: readonly DraftRow[]): DraftRow[] | null {
  if (server === null) return null;
  const known = new Set(server.map((d) => d.ticketId));
  return [...pending.filter((d) => !known.has(d.ticketId)), ...server];
}

/** The viewer's own drafts in this workspace, live, with the rows being saved in front (decision 5). */
export function useMyDrafts(source: DataSource, workspaceId: string): LiveQueryResult<DraftRow[]> {
  const live = useLiveQuery(source, workspaceId, `${workspaceId}:drafts`, () => source.query.getMyDrafts(workspaceId), {
    cacheKey: `drafts:${workspaceId}`,
  });
  const pending = useSyncExternalStore(subscribe, () => pendingDraftsOf(workspaceId), () => NONE);
  useEffect(() => {
    if (live.data === null) return;
    for (const draft of live.data) removePendingDraft(workspaceId, draft.ticketId);
  }, [live.data, workspaceId]);
  return { ...live, data: mergeDrafts(live.data, pending) };
}
