import { ULID_REGEX } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { requireMember } from '../read/membership.js';

/** A Home / Timeline scope (HM-1, HM-2): workspaces, projects (none = every project) and Me | Everyone. */
export type TimelineScope = { workspaceIds: string[]; projectIds: string[]; mine: boolean };
export type ReadableWorkspace = { workspaceId: string; eff: EffectiveRole };

/** The most workspaces and projects one scope may name; a longer list is a 400. */
export const MAX_WORKSPACES = 20;
export const MAX_PROJECTS = 200;

/** A comma list of ULIDs, deduplicated and sorted; `[]` when absent or empty; `null` (a 400) when malformed or too long. */
function idList(raw: unknown, max: number): string[] | null {
  if (raw === undefined || raw === '') return [];
  if (typeof raw !== 'string') return null;
  const ids = [...new Set(raw.split(','))].sort();
  return ids.length > max || ids.some((x) => !ULID_REGEX.test(x)) ? null : ids;
}

/**
 * `?ws=a,b&proj=c&mine=1`. `null` is a 400. An omitted `mine` is Everyone (planner ruling 2026-10-04). The lists are
 * canonical (sorted, deduplicated) so `scopeKey` can key a cache.
 */
export function parseTimelineScope(query: Record<string, unknown>): TimelineScope | null {
  const ws = idList(query['ws'], MAX_WORKSPACES);
  const proj = idList(query['proj'], MAX_PROJECTS);
  const mine = query['mine'];
  if (ws === null || ws.length === 0 || proj === null) return null;
  if (mine !== undefined && mine !== '1' && mine !== '0') return null;
  return { workspaceIds: ws, projectIds: proj, mine: mine === '1' };
}

export const scopeKey = (s: TimelineScope): string => `${s.workspaceIds.join(',')}|${s.projectIds.join(',')}|${s.mine ? 1 : 0}`;

/**
 * D-W4-3: a workspace the viewer cannot read is DROPPED, silently; the caller answers 404 only when nothing readable is left. A workspace that does
 * not exist takes the same path as a forbidden one (`requireMember` returns null for both), so the drop leaks nothing.
 */
export async function readableWorkspaces(db: Queryable, userId: string, scope: TimelineScope): Promise<ReadableWorkspace[]> {
  const out: ReadableWorkspace[] = [];
  for (const workspaceId of scope.workspaceIds) {
    const eff = await requireMember(db, userId, workspaceId);
    if (eff !== null) out.push({ workspaceId, eff });
  }
  return out;
}
