/**
 * What to load, and what to keep (spec §4, PR-1 to PR-5). PURE: it takes the view, the smoothed velocity and what is
 * loaded or in flight, and answers which chunks to start, which to cancel, which to widen to when idle and which to
 * evict. The HOOK that owns timers, `fetch` and `requestIdleCallback` lives elsewhere; this file never reads a clock.
 *
 * Terms: `V` = the viewport width in days. A CHUNK is 28 days aligned to a Monday (the existing view's old paging unit).
 * Days are integers (`calendar-days.ts`); a day range is inclusive at both ends.
 */
export const CHUNK_DAYS = 28;
/** Day 4 (1970-01-05) is a Monday, so every chunk start is a Monday. */
export const CHUNK_ORIGIN_DAY = 4;
export const MAX_IN_FLIGHT = 2;
export const IDLE_MS = 200;
export const MAX_CHUNKS = 40;
export const MAX_DETAIL_ENTRIES = 10_000;
/** Below this smoothed speed (days per second) the view counts as still. */
export const MOVING_DAYS_PER_S = 1;
/** PR-2: look ahead this many seconds of travel, at least one viewport. */
export const LOOK_AHEAD_S = 1.5;

export type DayRange = { start: number; end: number };
export type Priority = 'high' | 'low';

export const chunkOf = (day: number): number => Math.floor((day - CHUNK_ORIGIN_DAY) / CHUNK_DAYS);
export const chunkStart = (chunk: number): number => CHUNK_ORIGIN_DAY + chunk * CHUNK_DAYS;
export const chunkEnd = (chunk: number): number => chunkStart(chunk) + CHUNK_DAYS - 1;

/** Every chunk index that intersects [start, end]. */
export function chunksCovering(range: DayRange): number[] {
  const out: number[] = [];
  for (let c = chunkOf(range.start); c <= chunkOf(range.end); c += 1) out.push(c);
  return out;
}

const widthOf = (view: DayRange): number => view.end - view.start + 1;

/**
 * PR-1 and PR-2. Still: V either side. Moving: ahead of the travel by `max(V, |v| * 1.5 s)` and at least 0.5 V behind.
 * `side` is the direction of travel (-1 earlier, 0 still, 1 later).
 */
export function wantedRange(view: DayRange, velocityDaysPerS: number): { range: DayRange; side: -1 | 0 | 1 } {
  const V = widthOf(view);
  if (Math.abs(velocityDaysPerS) < MOVING_DAYS_PER_S) return { range: { start: view.start - V, end: view.end + V }, side: 0 };
  const ahead = Math.ceil(Math.max(V, Math.abs(velocityDaysPerS) * LOOK_AHEAD_S));
  const behind = Math.ceil(V / 2);
  return velocityDaysPerS > 0
    ? { range: { start: view.start - behind, end: view.end + ahead }, side: 1 }
    : { range: { start: view.start - ahead, end: view.end + behind }, side: -1 };
}

export type PlanInput = {
  view: DayRange;
  /** Smoothed velocity, days per second (positive = toward later days). */
  velocity: number;
  loaded: ReadonlySet<number>;
  inFlight: ReadonlyMap<number, Priority>;
  /** The chunks that can hold anything: from the index's extent. Chunks outside are never fetched. */
  bounds: { first: number; last: number };
  /** True when the direction of travel flipped since the last plan: low-priority fetches are cancelled (PR-2). */
  reversed: boolean;
};
export type FetchPlan = { start: Array<{ chunk: number; priority: Priority }>; cancel: number[] };

/** PR-1, PR-2: which chunks to start (at most two in flight in all) and which in-flight low-priority fetches to cancel. */
export function planFetches(input: PlanInput): FetchPlan {
  const { range, side } = wantedRange(input.view, input.velocity);
  const wanted = chunksCovering(range).filter((c) => c >= input.bounds.first && c <= input.bounds.last);
  const wantedSet = new Set(wanted);
  const visible = new Set(chunksCovering(input.view));
  const edge = side === 1 ? input.view.end : side === -1 ? input.view.start : (input.view.start + input.view.end) / 2;
  const candidates = wanted
    .filter((c) => !input.loaded.has(c) && !input.inFlight.has(c))
    .map((chunk) => {
      const behind = side !== 0 && !visible.has(chunk) && (side === 1 ? chunkEnd(chunk) < input.view.start : chunkStart(chunk) > input.view.end);
      const priority: Priority = behind ? 'low' : 'high';
      const centre = (chunkStart(chunk) + chunkEnd(chunk)) / 2;
      return { chunk, priority, distance: visible.has(chunk) ? -1 : Math.abs(centre - edge) };
    })
    .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'high' ? -1 : 1) || a.distance - b.distance || a.chunk - b.chunk);

  const cancel: number[] = [];
  for (const [chunk, priority] of [...input.inFlight].sort((a, b) => a[0] - b[0])) {
    if (priority === 'low' && (input.reversed || !wantedSet.has(chunk))) cancel.push(chunk);
  }
  const keep = (): number => input.inFlight.size - cancel.length;
  const highWaiting = candidates.filter((c) => c.priority === 'high').length;
  for (const [chunk, priority] of [...input.inFlight].sort((a, b) => a[0] - b[0])) {
    if (MAX_IN_FLIGHT - keep() >= highWaiting) break;
    if (priority === 'low' && !cancel.includes(chunk)) cancel.push(chunk);
  }
  const slots = Math.max(0, MAX_IN_FLIGHT - keep());
  return { start: candidates.slice(0, slots).map(({ chunk, priority }) => ({ chunk, priority })), cancel };
}

/** PR-3: when nothing has moved for 200 ms, the next chunk outward, alternating sides, until a cap. Null when done. */
export function planWiden(input: {
  loaded: ReadonlySet<number>;
  bounds: { first: number; last: number };
  lastSide: -1 | 0 | 1;
  entryCount: number;
}): { chunk: number; side: -1 | 1 } | null {
  if (input.loaded.size === 0 || input.loaded.size >= MAX_CHUNKS || input.entryCount >= MAX_DETAIL_ENTRIES) return null;
  const lo = Math.min(...input.loaded);
  const hi = Math.max(...input.loaded);
  const first: -1 | 1 = input.lastSide === 1 ? -1 : 1;
  for (const side of [first, first === 1 ? -1 : 1] as const) {
    const chunk = side === 1 ? hi + 1 : lo - 1;
    if (chunk >= input.bounds.first && chunk <= input.bounds.last && !input.loaded.has(chunk)) return { chunk, side };
  }
  return null;
}

/**
 * PR-3: past a cap, evict the chunk farthest from the viewport centre first, and never one that intersects
 * [visible - V, visible + V]. Returns the chunks to drop, in order.
 */
export function chunksToEvict(
  loaded: ReadonlySet<number>,
  view: DayRange,
  entriesIn: (chunk: number) => number,
): number[] {
  const V = widthOf(view);
  const protectedChunks = new Set(chunksCovering({ start: view.start - V, end: view.end + V }));
  const centre = (view.start + view.end) / 2;
  const order = [...loaded]
    .filter((c) => !protectedChunks.has(c))
    .sort((a, b) => Math.abs((chunkStart(b) + chunkEnd(b)) / 2 - centre) - Math.abs((chunkStart(a) + chunkEnd(a)) / 2 - centre) || b - a);
  let count = loaded.size;
  let entries = 0;
  for (const c of loaded) entries += entriesIn(c);
  const out: number[] = [];
  for (const chunk of order) {
    if (count <= MAX_CHUNKS && entries <= MAX_DETAIL_ENTRIES) break;
    out.push(chunk);
    count -= 1;
    entries -= entriesIn(chunk);
  }
  return out;
}

/** PR-4: the next coarser preset below `ppd` (Week from Day, Month from Week), or null at the coarsest. */
export function nextCoarserPpd(ppd: number): number | null {
  for (const p of [56, 24, 8]) if (p < ppd - 0.05) return p;
  return null;
}

/** PR-4: the day range the same viewport centre shows at another scale (`widthPx` is the viewport's width in px). */
export function rangeAtPpd(view: DayRange, ppd: number, newPpd: number): DayRange {
  const widthPx = widthOf(view) * ppd;
  const half = widthPx / newPpd / 2;
  const centre = (view.start + view.end) / 2;
  return { start: Math.floor(centre - half), end: Math.ceil(centre + half) };
}

/** PR-4: the packing scales next door to `scale` (a power of two between 4 and 64), nearest first. */
export function neighbourScales(scale: number): number[] {
  return [scale * 2, scale / 2].filter((s) => s >= 4 && s <= 64);
}

/** PR-5: the days whose bars are mounted before they scroll in: [visible - V, visible + V]. */
export function mountRange(view: DayRange): DayRange {
  const V = widthOf(view);
  return { start: view.start - V, end: view.end + V };
}

/**
 * VP-7 and TV-3: the pan limits in days. The earliest drawn day minus one viewport to the latest plus one, and never
 * narrower than today +/- `minHalfDays` (nothing drawn: today +/- 8 weeks, the existing view: at least +/- 56 days).
 */
export function panLimits(
  drawn: DayRange | null,
  today: number,
  viewportDays: number,
  minHalfDays = 56,
): DayRange {
  const base: DayRange = { start: today - minHalfDays, end: today + minHalfDays };
  if (drawn === null) return base;
  return {
    start: Math.min(base.start, Math.floor(drawn.start - viewportDays)),
    end: Math.max(base.end, Math.ceil(drawn.end + viewportDays)),
  };
}
