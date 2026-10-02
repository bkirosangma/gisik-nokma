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
