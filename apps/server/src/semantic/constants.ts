/**
 * Spec D §4.1. `SUGGESTION_TAU` is MEASURED (Task 1, 27.410): the τ in `TAU_GRID` that covers the most
 * fixture items while purity ≥ 0.7 and at least 4 suggestions are kept, ties to the higher τ.
 *
 * Measured 2026-10-03 (LOCAL, slot-run, real potion-base-32M model, 27.408-27.410): similar() top-5 precision
 * 0.847; selectTau = 0.35 (0.30 and 0.35 both cover 59, the higher τ wins).
 *
 *   τ     suggestions  covered  purity
 *   0.30  6            59       0.949
 *   0.35  6            59       0.966
 *   0.40  6            58       0.966
 *   0.45  4            34       0.971
 *   0.50  5            40       0.925
 *   0.55  4            27       0.926
 *   0.60  2            10       1.000
 *   0.65  1             4       1.000
 *   0.70+ 0             0       —
 */
export const SUGGESTION_K = 10;
export const SUGGESTION_TAU = 0.35;
export const SUGGESTION_SEED = 20261003;
export const SUGGESTION_MIN_SIZE = 3;
export const SUGGESTION_MAX_SIZE = 12;
export const SUGGESTION_TERMS = 3;
