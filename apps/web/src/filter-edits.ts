import type { FilterSpec, IdAxes } from '@gisik-nokma/app-core';

/**
 * THE ONE PLACE the EXCLUDE half of an id axis is written (exclude-mode spec
 * §4) — its collapse rule lives here. `filter-cycle.ts`'s cycler writes BOTH
 * halves through this function; of `board-search-scope.ts`'s chip removals,
 * only the EXCLUDE-half ones do (`clearExclude`, inside `buildFilterChips`)
 * — the include-half chip removals use `clear({ axis: undefined })` directly,
 * and `clearFilterAxes` assigns `undefined` to each axis directly too. Both
 * reach the same end state a call here would: an include axis has no
 * `exclude`-shaped wrapper object that could accumulate stray keys, so there
 * is no second collapse rule for this one to drift from. The collapse rule
 * itself: an empty list collapses to `undefined` (the collapse convention
 * `page.tsx`'s former `toggledArray` set — deleted 2026-09-17; this function
 * is its successor — a fully deselected axis is indistinguishable from one
 * never touched), and an `exclude` object left with no defined axis
 * collapses to `undefined` for the same reason, so `{}` and
 * `{ typeIds: undefined }` never linger as false-positive "something is set"
 * shapes for a chip builder or a clear-all test to trip on.
 */
export function withIdAxis<K extends keyof IdAxes>(
  filter: FilterSpec,
  half: 'include' | 'exclude',
  axis: K,
  values: IdAxes[K] | undefined,
): FilterSpec {
  const value = values === undefined || values.length === 0 ? undefined : values;
  if (half === 'include') return { ...filter, [axis]: value };
  const exclude: IdAxes = { ...(filter.exclude ?? {}), [axis]: value };
  const anyDefined = (Object.keys(exclude) as (keyof IdAxes)[]).some((key) => exclude[key] !== undefined);
  return { ...filter, exclude: anyDefined ? exclude : undefined };
}
