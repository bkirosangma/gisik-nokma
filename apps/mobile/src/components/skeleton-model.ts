import { colorOf, type ThemeName } from '@gisik-nokma/ui/tokens';

/**
 * The skeleton's fill: the `surfacePlaceholder` role (spec S-R1) — the track primitive in hig/minimal, a flat step off `surface` in neo and
 * never the neo well. The phones have no style axis (hig), so the two-argument `colorOf` is the call. Decoration only, so no contrast pair.
 * Kept out of the `.tsx` so a node test can read it (`vitest.config.ts`).
 */
export function skeletonFill(theme: ThemeName): string {
  return colorOf(theme, 'surfacePlaceholder');
}

/** One pulse, the same 1600 ms the web uses (spec §4.2); reduced motion turns it off. */
export const SKELETON_PULSE_MS = 1600;
export const SKELETON_PULSE_LOW = 0.6;

/** A text line's height in dp: one body line, so a skeleton row is the height of the row it stands in (S1). */
export const SKELETON_LINE_HEIGHT = 18;
export const SKELETON_RADIUS = 6;

/**
 * A text-line PART is shorter than the line it stands in for, with vertical margins that sum back to the line (12 + 3 + 3 = 18), so a row is
 * still the height of the row (S1) and stacked rows have air between them instead of reading as one slab. The web gets this for free from a
 * `1em` part in a taller line box. These are part dimensions, not a frame style, so S-R1's "name no container style" is untouched.
 */
export const SKELETON_BAR_HEIGHT = 12;
export const SKELETON_BAR_MARGIN = 3;
/** The gap above a block part (the ticket's body) so it does not touch the line above it. */
export const SKELETON_BLOCK_GAP = 8;

/**
 * The box of one part. With no height it is a text-line part (bar + margins = the line); with a height it is a solid block of exactly that
 * height and no margin, so the editor's band stays `EDITOR_MIN_HEIGHT` tall (25.217).
 */
export function skeletonBarMetrics(height?: number): { height: number; marginVertical: number } {
  return height === undefined
    ? { height: SKELETON_BAR_HEIGHT, marginVertical: SKELETON_BAR_MARGIN }
    : { height, marginVertical: 0 };
}

/**
 * The ground under the editor's loading overlay: the app's `surface`, the one the help screen paints. The WebView paints itself `#ffffff`
 * (`react-native-webview`'s `styles.webView`) and the overlay covers it, so the dark phone does not flash white while the page loads.
 */
export function skeletonGround(theme: ThemeName): string {
  return colorOf(theme, 'surface');
}
