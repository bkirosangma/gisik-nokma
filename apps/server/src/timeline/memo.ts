import { istDayOf } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { ScopeCore } from './assemble.js';
import { computeScope } from './compute.js';
import { scopeKey, type ReadableWorkspace, type TimelineScope } from './scope.js';

/**
 * The owner's (b) ruling (AMEND-wtg4-t1-reads-perf.md, 10-06), reversing D-W4-16 for the chunk and the tray only: a chunk or
 * tray read slices the core its index just computed instead of computing it again. The index never reads this memo (it
 * always computes, and keeps the result); a chunk or tray reads a kept core younger than `TIMELINE_CORE_TTL_MS`, else
 * computes and keeps one. Per process: another instance simply misses.
 *
 * The key (`coreKey`) is everything the core depends on: the VIEWER (a core holds what this viewer may see: hidden tickets
 * are holes, a hidden Decision's id is blanked), the canonical scope, each readable workspace's stream head (`asOf`, read
 * before the load) and the viewer's role there, and the IST day (an open period ends today). Every write is a ledger
 * event, and the projections commit in the event's own transaction (`ingest-service.ts` `commitInTx`), so any write that
 * changes a plan input moves a head and the next read misses; the TTL bounds only what no event stamps.
 */
export const TIMELINE_CORE_TTL_MS = 30_000;
/** The most cores kept per process (a 10,000-ticket core is several MB; the server runs on 1 GB): the oldest goes first. */
export const TIMELINE_CORE_MEMO_MAX = 8;

type Slot = { at: number; core: Promise<ScopeCore> };
const slots = new Map<string, Slot>();

export function coreKey(viewerId: string, scope: TimelineScope, readable: readonly ReadableWorkspace[], asOf: Readonly<Record<string, number>>, now: Date): string {
  return JSON.stringify([
    viewerId,
    scopeKey(scope),
    istDayOf(now.toISOString()),
    readable.map(({ workspaceId, eff }) => [
      workspaceId,
      asOf[workspaceId] ?? null,
      eff.workspaceRole,
      [...eff.projects].map(([projectId, p]) => [projectId, p.projectAdmin]).sort(),
    ]),
  ]);
}

/** Keep `core` under `key`, computed at `at` (ms); the oldest kept core goes first when the memo is full. A core that fails is not kept. */
function keep(key: string, at: number, core: Promise<ScopeCore>): Promise<ScopeCore> {
  slots.delete(key);
  while (slots.size >= TIMELINE_CORE_MEMO_MAX) slots.delete(slots.keys().next().value as string);
  slots.set(key, { at, core });
  core.catch(() => {
    if (slots.get(key)?.core === core) slots.delete(key);
  });
  return core;
}

/** The index's core: always computed, then kept for the chunk and tray reads that follow it. The core is shared: never mutate it. */
export function freshCore(
  db: Queryable,
  readable: readonly ReadableWorkspace[],
  viewerId: string,
  scope: TimelineScope,
  now: Date,
  asOf: Readonly<Record<string, number>>,
): Promise<ScopeCore> {
  return keep(coreKey(viewerId, scope, readable, asOf, now), now.getTime(), computeScope(db, readable, viewerId, scope, now));
}

/** A chunk's or tray's core: the kept one for the same key when it is younger than the TTL (on the read's own clock, `now`), else a fresh one, kept. */
export function sharedCore(
  db: Queryable,
  readable: readonly ReadableWorkspace[],
  viewerId: string,
  scope: TimelineScope,
  now: Date,
  asOf: Readonly<Record<string, number>>,
): Promise<ScopeCore> {
  const key = coreKey(viewerId, scope, readable, asOf, now);
  const hit = slots.get(key);
  if (hit !== undefined && now.getTime() - hit.at < TIMELINE_CORE_TTL_MS) return hit.core;
  return keep(key, now.getTime(), computeScope(db, readable, viewerId, scope, now));
}

/** Tests only: start from an empty memo. */
export function forgetCores(): void {
  slots.clear();
}
