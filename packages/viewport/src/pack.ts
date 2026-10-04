/**
 * Row packing (spec PK-1 to PK-6). Within one lane an item is a SET of day intervals (its segments); items are sorted by
 * (first segment start, key, id) and each goes into the FIRST row where none of its segments shares a day with a segment
 * already there. Adjacent days do not overlap, so "the next can stand side by side".
 *
 * PURE and deterministic: the result is a function of the items and `ppd` only. No clock, no DOM; the text measurement
 * that gives a key label its width is INJECTED (`labelPx`).
 *
 * Days are integers (see `calendar-days.ts`); a segment is inclusive at both ends.
 */
export type Seg = { start: number; end: number };

export type PackItem = {
  id: string;
  /** The ticket key, or null (a draft, or an offline replica row). Keyed items sort before unkeyed ones that start the same day. */
  key: string | null;
  /** At least one segment. */
  segments: readonly Seg[];
};

export type PackOptions = {
  /** The PACKING scale in px per day: `packScale(ppd)`, a power of two, so a footprint is never smaller than its label needs inside the bucket. */
  ppd: number;
  /**
   * The width in px the label of `item`'s segment `segmentIndex` needs along the time axis (a cached text measurement).
   * Absent: labels take no room beyond the bar.
   */
  labelPx?: (item: PackItem, segmentIndex: number) => number;
};

export type PackStrategy = 'segments' | 'hull';
export type PackResult = { rows: number; rowOf: ReadonlyMap<string, number>; strategy: PackStrategy };

/** A key split once into alternating text and number parts, so a sort compares parts rather than re-splitting strings. */
export type KeyParts = ReadonlyArray<string | number>;

export function keyPartsOf(key: string): KeyParts {
  return key.split(/(\d+)/).map((part, i) => (i % 2 === 1 ? Number(part) : part));
}

function comparePartLists(pa: KeyParts, pb: KeyParts): number {
  for (let i = 0; i < Math.min(pa.length, pb.length); i += 1) {
    const x = pa[i] as string | number;
    const y = pb[i] as string | number;
    if (x === y) continue;
    return x < y ? -1 : 1;
  }
  return pa.length - pb.length;
}

/** Natural order: `GN-9` before `GN-10`. Digits compare as numbers, everything else as text. */
export function naturalKeyCompare(a: string, b: string): number {
  return comparePartLists(keyPartsOf(a), keyPartsOf(b));
}

/** PK-4: a bar shorter than its label shows the key just outside its end, so the label is part of the footprint. */
export function footprintOf(seg: Seg, labelPx: number, ppd: number): Seg {
  const labelDays = Math.ceil(labelPx / ppd);
  return { start: seg.start, end: Math.max(seg.end, seg.start + labelDays - 1) };
}

/** Sorted by start, overlapping segments merged (one item's own footprints may overlap each other). */
function normalise(segs: readonly Seg[]): Seg[] {
  const sorted = [...segs].sort((a, b) => a.start - b.start || a.end - b.end);
  const out: Seg[] = [];
  for (const s of sorted) {
    const last = out[out.length - 1];
    if (last !== undefined && s.start <= last.end) last.end = Math.max(last.end, s.end);
    else out.push({ start: s.start, end: s.end });
  }
  return out;
}

function footprints(item: PackItem, opts: PackOptions): Seg[] {
  if (item.segments.length === 0) throw new RangeError(`pack: item ${item.id} has no segments`);
  const label = opts.labelPx;
  if (item.segments.length === 1) return [footprintOf(item.segments[0] as Seg, label === undefined ? 0 : label(item, 0), opts.ppd)];
  return normalise(item.segments.map((s, i) => footprintOf(s, label === undefined ? 0 : label(item, i), opts.ppd)));
}

type Sortable = { item: PackItem; first: number; parts: KeyParts | null };

/**
 * Items sorted by (first start, key, id). Items are bucketed by start day first and only each bucket is sorted by key,
 * so the comparator runs on ties alone, which is most of the saving at 10,000 items.
 */
function orderByStart<T extends Sortable>(items: readonly T[]): T[] {
  const buckets = new Map<number, T[]>();
  for (const p of items) {
    const held = buckets.get(p.first);
    if (held === undefined) buckets.set(p.first, [p]);
    else held.push(p);
  }
  const out: T[] = [];
  for (const day of [...buckets.keys()].sort((a, b) => a - b)) {
    const group = buckets.get(day) as T[];
    if (group.length > 1) group.sort(compareItems);
    for (const p of group) out.push(p);
  }
  return out;
}

function compareItems(a: Sortable, b: Sortable): number {
  if (a.first !== b.first) return a.first - b.first;
  if (a.parts !== null && b.parts !== null) {
    const c = comparePartLists(a.parts, b.parts);
    if (c !== 0) return c;
  } else if (a.parts !== null) {
    return -1;
  } else if (b.parts !== null) {
    return 1;
  }
  return a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0;
}

/** Index of the first interval in a sorted, non-overlapping row whose end is >= `day`. */
function firstEndingAtOrAfter(row: readonly Seg[], day: number): number {
  let lo = 0;
  let hi = row.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((row[mid] as Seg).end < day) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function rowHolds(row: readonly Seg[], segs: readonly Seg[]): boolean {
  for (const s of segs) {
    const i = firstEndingAtOrAfter(row, s.start);
    const hit = row[i];
    if (hit !== undefined && hit.start <= s.end) return false;
  }
  return true;
}

/** Pack with one named strategy. `hull` treats each item as one interval from its first start to its last end. */
export function packLaneBy(items: readonly PackItem[], opts: PackOptions, strategy: PackStrategy): PackResult {
  const prepared = items.map((item) => {
    const segs = footprints(item, opts);
    const used = strategy === 'hull' ? [{ start: (segs[0] as Seg).start, end: (segs[segs.length - 1] as Seg).end }] : segs;
    return { item, segs: used, first: (segs[0] as Seg).start, parts: item.key === null ? null : keyPartsOf(item.key) };
  });
  const ordered = orderByStart(prepared);
  const rows: Seg[][] = [];
  /** The last day any segment in the row reaches: an item starting after it fits without a search (the common case). */
  const rowEnd: number[] = [];
  const rowOf = new Map<string, number>();
  for (const p of ordered) {
    const firstStart = (p.segs[0] as Seg).start;
    let r = 0;
    while (r < rows.length && !((rowEnd[r] as number) < firstStart && p.segs.length === 1) && !rowHolds(rows[r] as Seg[], p.segs)) r += 1;
    if (r === rows.length) {
      rows.push([]);
      rowEnd.push(Number.NEGATIVE_INFINITY);
    }
    const row = rows[r] as Seg[];
    // The segments are this call's own objects (`footprints` makes them), so the row keeps them without a copy.
    for (const s of p.segs) {
      if (s.start > (rowEnd[r] as number)) row.push(s);
      else row.splice(firstEndingAtOrAfter(row, s.start), 0, s);
      rowEnd[r] = Math.max(rowEnd[r] as number, s.end);
    }
    rowOf.set(p.item.id, r);
  }
  return { rows: rows.length, rowOf, strategy };
}

/**
 * PK-2: the packing a lane uses. Greedy by start with first fit is optimal for ONE interval per item, so the row
 * count equals the largest number of footprints overlapping on any day. With several segments per item it is a
 * heuristic; the same items are also packed by their hulls and the hull packing would be taken only with FEWER rows
 * (a tie keeps the segment-set packing, which leaves the gaps usable). The hull comparison is kept as PK-2's guard;
 * segment packing is never worse (planner, 2026-10-04): in the shared first-start order, every row an item cannot
 * enter holds an earlier-starting item whose hull covers the new item's first day.
 */
export function packLane(items: readonly PackItem[], opts: PackOptions): PackResult {
  const bySegments = packLaneBy(items, opts, 'segments');
  if (!items.some((item) => footprints(item, opts).length > 1)) return bySegments;
  const byHull = packLaneBy(items, opts, 'hull');
  return byHull.rows < bySegments.rows ? byHull : bySegments;
}

/** The largest number of footprints (single-interval items) that overlap on one day: the optimum `packLane` must reach. */
export function maxOverlap(items: readonly PackItem[], opts: PackOptions): number {
  const events: Array<[number, number]> = [];
  for (const item of items) {
    for (const s of footprints(item, opts)) {
      events.push([s.start, 1]);
      events.push([s.end + 1, -1]);
    }
  }
  events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let open = 0;
  let max = 0;
  for (const [, delta] of events) {
    open += delta;
    max = Math.max(max, open);
  }
  return max;
}
