import type { GraphGroup } from '@gisik-nokma/domain';
import type { GraphStore } from './model.js';
import { walk, type Walk } from './walk.js';

export const CLEAR_CAP = 500;
export const FOG_BUDGET = 2000;

export type ZoneOptions = {
  center: string;
  on: ReadonlySet<GraphGroup>;
  /** Clear hops; `Infinity` = Everything. */
  reach: number;
  inScope: (ref: string) => boolean;
  semantic: boolean;
  gone?: ReadonlySet<string>;
  cap?: number;
};
export type Zones = { reach: number; walk: Walk; clear: string[]; clearSet: Set<string>; fog: string[]; fogSet: Set<string>; capped: boolean; beyond: number; clearHop: number; outN: number };

/** What is clear, what is fog (past the hops, or outside the scope), what is further out. Port of `zones()` (`knowledge-graph-sigma.html:898-912`). */
export function zones(store: GraphStore, opts: ZoneOptions): Zones {
  const cap = opts.cap ?? CLEAR_CAP;
  const on = opts.semantic ? opts.on : new Set([...opts.on].filter((g) => g !== 'concepts'));
  const res = walk(store, opts.center, on, opts.reach === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : opts.reach + 1, opts.inScope, opts.gone);
  let clear = res.order.filter((id) => !res.out.has(id) && (res.dist.get(id) ?? 0) <= opts.reach);
  if (!opts.semantic) clear = clear.filter((id) => !id.startsWith('concept:'));
  let capped = false;
  if (clear.length > cap) {
    clear = clear.slice(0, cap);
    capped = true;
  }
  const clearSet = new Set(clear);
  const lastD = res.dist.get(clear[clear.length - 1]!) ?? 0;
  const clearHop = capped ? lastD : opts.reach === Number.POSITIVE_INFINITY ? Math.max(...clear.map((id) => res.dist.get(id) ?? 0)) : opts.reach;
  const fogLimit = clearHop + 1;
  const fogAll = res.order.filter((id) => {
    if (clearSet.has(id)) return false;
    const from = res.parent.get(id)?.from;
    if (from === undefined || !clearSet.has(from)) return false;
    return res.out.has(id) || (res.dist.get(id) ?? 0) <= fogLimit;
  });
  const fog = fogAll.slice(0, FOG_BUDGET);
  const fogSet = new Set(fog);
  const beyond = capped ? res.order.filter((id) => !clearSet.has(id) && !fogSet.has(id)).length : 0;
  const outN = fog.filter((id) => res.out.has(id)).length;
  return { reach: opts.reach, walk: res, clear, clearSet, fog, fogSet, capped, beyond, clearHop, outN };
}
