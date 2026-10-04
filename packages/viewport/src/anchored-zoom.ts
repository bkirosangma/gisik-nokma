/**
 * Zoom about an anchor (spec VP-6). The time axis is measured in DAYS (a day is an integer or a fraction of one);
 * `ppd` is pixels per day; `offsetDay` is the day at the viewport's left (portrait: top) edge.
 *
 * The anchor invariant: the day under the anchor keeps its screen position on every frame, within 0.5 px.
 * Here it holds exactly, because the new offset is solved from the anchor day.
 */
export const MIN_PPD = 4;
export const MAX_PPD = 96;
/** Day, Week and Month presets (VP-6): px per day. */
export const ZOOM_PRESETS = { day: 56, week: 24, month: 8 } as const;
export type ZoomPreset = keyof typeof ZOOM_PRESETS;

export type View = { offsetDay: number; ppd: number };

/** `ppd` inside [MIN_PPD, maxPpd]. `maxPpd` is lowered when the extent would exceed the browser's scroll size (ScrollAdapter). */
export function clampPpd(ppd: number, maxPpd = MAX_PPD): number {
  return Math.min(Math.max(MIN_PPD, maxPpd), Math.max(MIN_PPD, ppd));
}

/** The day under `anchorPx` (px from the viewport's leading edge). */
export function dayAt(view: View, anchorPx: number): number {
  return view.offsetDay + anchorPx / view.ppd;
}

/** The view after zooming to `newPpd` with the day under `anchorPx` held still. */
export function zoomAbout(view: View, newPpd: number, anchorPx: number): View {
  const anchorDay = dayAt(view, anchorPx);
  return { ppd: newPpd, offsetDay: anchorDay - anchorPx / newPpd };
}

/** Which preset `ppd` is, or null while a free zoom sits between presets (none is marked then, VP-10). */
export function presetOf(ppd: number, tolerance = 0.05): ZoomPreset | null {
  for (const [name, value] of Object.entries(ZOOM_PRESETS) as [ZoomPreset, number][]) {
    if (Math.abs(ppd - value) <= tolerance) return name;
  }
  return null;
}

/** The packing scale (PK-4): the lower bound of `ppd`'s power-of-two bucket, 4 to 64. Rows re-pack only when this changes. */
export function packScale(ppd: number): number {
  return Math.min(64, Math.max(4, 2 ** Math.floor(Math.log2(ppd))));
}
