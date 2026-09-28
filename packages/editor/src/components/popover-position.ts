/**
 * Where a floating panel goes relative to the thing it describes — the
 * knowledge-base app's placement rule, shared by its link editor and its
 * wiki-link hover card and lifted here as one pure function so it is testable
 * without a layout engine (jsdom has none; the reference's own tests mark
 * positioning 🚫 for exactly that reason).
 *
 * Below the anchor by default; ABOVE when it would run off the bottom of the
 * viewport; then pinned inside the viewport on both axes. `margin` is the gap
 * to the viewport edge, `gap` the gap to the anchor.
 */
export type PlaceInput = {
  /** The anchor's box, viewport coordinates. */
  anchor: { top: number; bottom: number; left: number };
  /** The panel's own size. */
  size: { width: number; height: number };
  viewport: { width: number; height: number };
  margin?: number;
  gap?: number;
};

export function placePopover({ anchor, size, viewport, margin = 8, gap = 6 }: PlaceInput): { top: number; left: number } {
  let top = anchor.bottom + gap;
  if (top + size.height > viewport.height - margin) top = anchor.top - size.height - gap;
  if (top < margin) top = margin;

  let left = anchor.left;
  if (left + size.width > viewport.width - margin) left = viewport.width - size.width - margin;
  if (left < margin) left = margin;

  return { top, left };
}
