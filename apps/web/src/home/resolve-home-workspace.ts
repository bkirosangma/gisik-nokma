import type { WorkspaceRef } from '@gisik-nokma/app-core';
import type { LastWorkspace } from '../use-last-workspace.js';

export type HomeWorkspace = { status: 'loading' } | { status: 'none' } | { status: 'ready'; workspace: WorkspaceRef };

/**
 * Which workspace Home shows (spec E assumption "the current one (the switcher's)"; decision D-E4): the remembered
 * one when it is among the viewer's LIVE workspaces, else the first live one, else none. Never a remembered id
 * the directory does not contain — Home must not ask the server for a workspace the viewer cannot reach.
 * The caller passes `{ status: 'unknown' }` until the session is SIGNED IN (27.628's ordering case).
 */
export function resolveHomeWorkspace(remembered: LastWorkspace, workspaces: readonly WorkspaceRef[] | null): HomeWorkspace {
  if (workspaces === null || remembered.status === 'unknown') return { status: 'loading' };
  const live = workspaces.filter((workspace) => !workspace.archived);
  if (remembered.status === 'remembered') {
    const hit = live.find((workspace) => workspace.id === remembered.workspaceId);
    if (hit !== undefined) return { status: 'ready', workspace: hit };
  }
  const first = live[0];
  return first === undefined ? { status: 'none' } : { status: 'ready', workspace: first };
}
