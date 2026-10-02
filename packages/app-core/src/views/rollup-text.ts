import type { RollupToViewer } from '../view-types.js';

/**
 * "5 of 8 done · 2 restricted" — counts are over ALL direct children
 * (server-computed with no visibility filtering); the children this viewer
 * cannot see are named in the restricted count, never pretended absent
 * (spec §6: "true counts, restriction named, nothing pretended absent").
 *
 * The deceptive alternatives this function exists to refuse are both
 * arithmetic: shrinking the denominator to what the viewer can see
 * ("5 of 6 done"), or keeping the denominator and dropping the note, which
 * leaves three children unaccounted for with nothing saying why. Either one
 * turns a restriction into a vanish — invariant 5 — so the total and the
 * restriction are rendered together or the render is a lie.
 */
export function formatRollup(rollup: RollupToViewer): string {
  const base = `${rollup.terminalChildren} of ${rollup.totalChildren} done`;
  return rollup.restrictedCount > 0 ? `${base}, ${rollup.restrictedCount} restricted` : base;
}
