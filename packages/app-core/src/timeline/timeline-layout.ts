import { packLane, packScale, type PackItem } from '@gisik-nokma/viewport';

/** The row pitch and bar height of the time views (spec TG-13: a 28 px bar in a 40 px pitch, 12 px of gap). */
export const ROW_PITCH = 40;
export const BAR_HEIGHT = 28;
/** A lane's heading row (the mockup's 34 px). */
export const LANE_HEADING = 34;
/** Portrait (PK-7): a lane's column is `rows x COLUMN_WIDTH` wide; time runs down. */
export const COLUMN_WIDTH = 112;
/** TG-11: the paper pin adds this much to a key's label footprint. */
export const PIN_PX = 14;

export type LayoutItem = {
  id: string;
  key: string | null;
  /** Day numbers (see `timeline-days.ts`), inclusive. */
  startDay: number;
  endDay: number;
  /** The ticket has a note or an attachment (TG-11): the pin is part of the label footprint. */
  pinned?: boolean;
};
export type LayoutLane = { laneId: string; items: readonly LayoutItem[] };
export type PlacedBar = { id: string; row: number; startDay: number; endDay: number };
export type PlacedLane = {
  laneId: string;
  /** Landscape: the lane's top in px. Portrait: its left. */
  offset: number;
  /** Landscape: the lane's height in px (heading + rows). Portrait: its width (rows x 112). */
  extent: number;
  /** The rows the lane occupies; at least 1, an empty lane included (planner ruling 2026-10-04). */
  rows: number;
  /** Sorted by start day, then id: stable for the virtualised slice. */
  bars: PlacedBar[];
};
export type TimelineLayout = {
  lanes: PlacedLane[];
  /** The packing scale the rows were computed at (a power of two, 4 to 64). Rows change only when this does. */
  scale: number;
  /** Total px along the cross axis (landscape: height under the axis; portrait: width). */
  extent: number;
};
export type Orientation = 'landscape' | 'portrait';

/** The width in px of a key's label along the time axis. Injected: the view caches a canvas measurement. */
export type KeyMeasure = (key: string | null) => number;

/**
 * Packs every lane (PK-1 to PK-6) and stacks them: one lane per epic, each packed on its own, at the BUCKETED scale
 * `packScale(ppd)` so rows never change mid-gesture. A pure function of its inputs: the same lanes at the same bucket give
 * the same rows on every device.
 */
export function layoutLanes(
  lanes: readonly LayoutLane[],
  options: { ppd: number; measure: KeyMeasure; orientation?: Orientation },
): TimelineLayout {
  const scale = packScale(options.ppd);
  const portrait = options.orientation === 'portrait';
  let cursor = 0;
  const placed: PlacedLane[] = [];
  for (const lane of lanes) {
    const byId = new Map(lane.items.map((item) => [item.id, item]));
    const packItems: PackItem[] = lane.items.map((item) => ({
      id: item.id,
      key: item.key,
      segments: [{ start: item.startDay, end: item.endDay }],
    }));
    const result = packLane(packItems, {
      ppd: scale,
      labelPx: (item) => {
        const source = byId.get(item.id);
        return options.measure(item.key) + (source?.pinned === true ? PIN_PX : 0);
      },
    });
    const bars = lane.items
      .map((item): PlacedBar => ({ id: item.id, row: result.rowOf.get(item.id) ?? 0, startDay: item.startDay, endDay: item.endDay }))
      .sort((a, b) => a.startDay - b.startDay || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    // A lane never has fewer than one row, an empty lane included: `rows` and `extent` agree (planner ruling 2026-10-04).
    const rows = Math.max(1, result.rows);
    const extent = portrait ? rows * COLUMN_WIDTH : LANE_HEADING + rows * ROW_PITCH;
    placed.push({ laneId: lane.laneId, offset: cursor, extent, rows, bars });
    cursor += extent;
  }
  return { lanes: placed, scale, extent: cursor };
}

/** The bars of a lane that touch [range.start, range.end] (inclusive): what the view mounts. */
export function barsInRange(lane: PlacedLane, range: { start: number; end: number }): PlacedBar[] {
  return lane.bars.filter((bar) => bar.endDay >= range.start && bar.startDay <= range.end);
}
