/**
 * Spec D §4.1. `SUGGESTION_TAU` is MEASURED (Task 1, 27.410): the τ in `TAU_GRID` that covers the most
 * fixture items while purity ≥ 0.7 and at least 4 suggestions are kept, ties to the higher τ.
 * Planning probe 2026-10-03 (LOCAL): 0.35 → 6 suggestions, 59/60 covered, purity 0.966.
 * Replace the number with what Step 7 prints if it differs, and paste Step 7's table here.
 */
export const SUGGESTION_K = 10;
export const SUGGESTION_TAU = 0.35;
export const SUGGESTION_SEED = 20261003;
export const SUGGESTION_MIN_SIZE = 3;
export const SUGGESTION_MAX_SIZE = 12;
export const SUGGESTION_TERMS = 3;
