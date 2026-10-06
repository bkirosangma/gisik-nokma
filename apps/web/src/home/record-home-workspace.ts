import { useEffect } from 'react';
import { rememberLastWorkspace, type LastWorkspace } from '../use-last-workspace.js';
import type { HomeWorkspace } from './resolve-home-workspace.js';

/**
 * The workspace Home FELL BACK to, else `null` (release walk should-fix #1): Home is `ready` on a workspace that is not
 * the remembered one, because nothing was remembered or the remembered id is not among the viewer's live workspaces
 * (`resolveHomeWorkspace`). A remembered live workspace is never a fallback, and `loading` / `none` have none.
 */
export function homeFallbackWorkspaceId(remembered: LastWorkspace, resolved: HomeWorkspace): string | null {
  if (resolved.status !== 'ready') return null;
  if (remembered.status === 'remembered' && remembered.workspaceId === resolved.workspace.id) return null;
  return resolved.workspace.id;
}

/**
 * Spec E: Home shows "the current one (the switcher's)". On a first visit nothing is current, so Home shows the first
 * live workspace, and without this the nav in the same frame said "No workspace selected". The fallback is recorded
 * through the switcher's own setter (`rememberLastWorkspace`, which the route write uses), so the nav names it at once.
 * Once per resolution: the effect is keyed on the fallback's id, never on the resolved object a render rebuilds.
 */
export function useRecordHomeWorkspace(userId: string | null, remembered: LastWorkspace, resolved: HomeWorkspace): void {
  const fallbackId = homeFallbackWorkspaceId(remembered, resolved);
  useEffect(() => {
    if (userId !== null && fallbackId !== null) rememberLastWorkspace(userId, fallbackId);
  }, [userId, fallbackId]);
}
