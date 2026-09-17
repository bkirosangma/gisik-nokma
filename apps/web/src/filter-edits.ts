import type { FilterSpec, IdAxes } from '@gisik-nokma/app-core';

/**
 * THE ONE PLACE either half of one id axis is written (exclude-mode spec §4).
 * `board-search-scope.ts`'s chip removals and `filter-cycle.ts`'s cycler both
 * go through here, so the collapse rule lives once: an empty list collapses
 * to `undefined` (the collapse convention `page.tsx`'s former `toggledArray`
 * set — deleted 2026-09-17; this function is its successor — a fully
 * deselected axis is indistinguishable from one never touched), and an
 * `exclude` object left with no defined axis collapses to `undefined` for the
 * same reason, so `{}` and `{ typeIds: undefined }` never linger as
 * false-positive "something is set" shapes for a chip builder or a clear-all
 * test to trip on.
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
