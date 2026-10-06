import type { RollupToViewer } from '../view-types.js';

/**
 * "5 of 8 done, 2 restricted" ("4 of 8 done, 1 not taken, 2 restricted" when the
 * flow closed a child Not taken, wtg2 T17: closed, never done, and named so the
 * parts still add up) — counts are over ALL direct children
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
  const parts = [`${rollup.terminalChildren} of ${rollup.totalChildren} done`];
  if ((rollup.notTakenChildren ?? 0) > 0) parts.push(`${rollup.notTakenChildren} not taken`);
  if (rollup.restrictedCount > 0) parts.push(`${rollup.restrictedCount} restricted`);
  return parts.join(', ');
}
