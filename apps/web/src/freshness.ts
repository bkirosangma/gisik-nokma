'use client';
import { useEffect } from 'react';
import { scheduleReload, staleWorkspaces } from '@gisik-nokma/app-core';

/** A cached answer older than this is read again when the person comes back to the page. */
export const STALE_AFTER_MS = 30_000;

/**
 * Spec D13 (audit SM-15): a tab left in the background keeps showing what it last read, and
 * the stream only reaches a tab that was connected. When the page is shown again, focused, or the
 * browser comes back online, every workspace with a cached answer older than `STALE_AFTER_MS` gets
 * one reload wave (`scheduleReload`, the same wave a stream frame starts), so the stale answer is
 * painted for a moment and replaced. Mounted once, in `Providers`.
 */
export function useFreshness(): void {
  useEffect(() => {
    const wake = () => {
      if (document.visibilityState === 'hidden') return;
      for (const workspaceId of staleWorkspaces(STALE_AFTER_MS)) scheduleReload(workspaceId, 0);
    };
    window.addEventListener('focus', wake);
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', wake);
    return () => {
      window.removeEventListener('focus', wake);
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('online', wake);
    };
  }, []);
}
