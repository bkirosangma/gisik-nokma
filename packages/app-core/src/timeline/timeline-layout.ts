import { MIN_BAR_PX, ROW_GAP_PX, packLane, packScale, type PackItem } from '@gisik-nokma/viewport';

/** The row pitch and bar height of the time views (spec TG-13: a 28 px bar in a 40 px pitch, 12 px of gap). */
export const ROW_PITCH = 40;
export const BAR_HEIGHT = 28;
/** A lane's heading row (the mockup's 34 px). */
export const LANE_HEADING = 34;
/** Portrait (PK-7): a lane's column is `rows x COLUMN_WIDTH` wide; time runs down. */
export const COLUMN_WIDTH = 112;
/**
 * Portrait (ERRATA E9, owner 2026-10-04): a bar is 100 px wide inside its 112 px column, inset half the gap on each side, so a
 * `ROW_GAP_PX` (12 px) gutter runs between columns, the transposed twin of landscape's 28 px bar in its 40 px row, and an edge's
 * channel can run between bars (`routeEdge`, TG-5). ui.css draws the same numbers (`--row` x 112 px + 6 px, 100 px wide); 29.109
 * pins its copies against these. Part 4's painter imports them.
 */
export const PORTRAIT_BAR_WIDTH = COLUMN_WIDTH - ROW_GAP_PX;
export const PORTRAIT_BAR_INSET = (COLUMN_WIDTH - PORTRAIT_BAR_WIDTH) / 2;
/** Portrait: the day labels ride a sticky gutter this wide at the left of the surface (`--tl-gutter` in ui.css, 29.109). */
export const PORTRAIT_GUTTER_PX = 80;
/** TG-11: the paper pin adds this much to a key's label footprint along a landscape bar (`barLabelPx`). */
export const PIN_PX = 14;
/**
 * Portrait (PK-7): a key is a line of text down a column, so its footprint along the time axis is a line height, not a width.
 * The view's portrait key measure answers it for a key, and `barLabelPx` gives a pinned keyless bar the same one line.
 */
export const PORTRAIT_KEY_FOOTPRINT_PX = 16;

export type LayoutItem = {
  id: string;
  key: string | null;
  /** Day numbers (see `timeline-days.ts`), inclusive. */
  startDay: number;
  endDay: number;
  /** The ticket has a note or an attachment (TG-11): the pin is part of the label footprint (`barLabelPx`). */
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
 * PK-4 and TG-11: the room a bar's label takes along the time axis, in px. The ONE answer: the packer reserves it
 * (`layoutLanes`) and the view decides an outside label with it (`keyOutside(drawnPx, barLabelPx(…))`, timeline-view.tsx), so
 * the pin the view draws after an outside key is the pin the packer made room for (the E10/E11 one-definition rule; 29.116).
 *
 * - Unpinned: the key alone (`measure`, 0 for no key).
 * - Landscape, pinned: the key, then `PIN_PX` for the pin after it (ui.css draws the 12 px icon 2 px after the key, and reserves
 *   the bar's own 6 px padding and `PIN_PX` more on the right of a bar that holds it). A keyless pinned label is the pin inside a bar's two side
 *   paddings (`MIN_BAR_PX`), so a keyless bar too short for its pin puts the pin outside, as a keyed one does.
 * - Portrait, pinned: the pin sits on the key's line across the 100 px column (ui.css), so it costs nothing along time beyond
 *   that one line (`PORTRAIT_KEY_FOOTPRINT_PX`).
 */
export function barLabelPx(measure: KeyMeasure, key: string | null, pinned: boolean, orientation: Orientation = 'landscape'): number {
  const keyPx = measure(key);
  if (!pinned) return keyPx;
  if (orientation === 'portrait') return Math.max(keyPx, PORTRAIT_KEY_FOOTPRINT_PX);
  return Math.max(keyPx, MIN_BAR_PX) + PIN_PX;
}

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
      labelPx: (item) => barLabelPx(options.measure, item.key, byId.get(item.id)?.pinned === true, options.orientation),
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
