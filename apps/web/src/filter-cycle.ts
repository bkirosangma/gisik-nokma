import type { FilterSpec, IdAxes } from '@gisik-nokma/app-core';
import { withIdAxis } from './filter-edits.js';

/** off → include → exclude → off — the owner's own cycle (exclude-mode spec §4). */
export type ChoiceMode = 'off' | 'include' | 'exclude';

/** The element type of one id axis's list — `string`, or `StateCategory` for `stateCategories`. */
export type IdAxisValue<K extends keyof IdAxes> = NonNullable<IdAxes[K]>[number];

function listOf<K extends keyof IdAxes>(half: IdAxes | undefined, axis: K): readonly IdAxisValue<K>[] {
  return (half?.[axis] ?? []) as readonly IdAxisValue<K>[];
}

/** Which half, if either, holds this value on this axis. Include wins if a caller ever left it in both. */
export function choiceMode<K extends keyof IdAxes>(filter: FilterSpec, axis: K, value: IdAxisValue<K>): ChoiceMode {
  if (listOf(filter, axis).includes(value)) return 'include';
  if (listOf(filter.exclude, axis).includes(value)) return 'exclude';
  return 'off';
}

export function nextMode(mode: ChoiceMode): ChoiceMode {
  if (mode === 'off') return 'include';
  if (mode === 'include') return 'exclude';
  return 'off';
}

/**
 * One click on one value: removed from BOTH halves first, then added to the
 * half the next mode names (or neither, for `off`). Two `withIdAxis` writes
 * so the collapse rule is never restated here. Removing from both halves —
 * rather than only from the half the current mode reports — is what makes
 * "never in both" true even for a shape this cycler did not produce.
 */
export function withCycledId<K extends keyof IdAxes>(filter: FilterSpec, axis: K, value: IdAxisValue<K>): FilterSpec {
  const next = nextMode(choiceMode(filter, axis, value));
  const without = (list: readonly IdAxisValue<K>[]) => list.filter((item) => item !== value) as IdAxes[K];
  let result = withIdAxis(filter, 'include', axis, without(listOf(filter, axis)));
  result = withIdAxis(result, 'exclude', axis, without(listOf(filter.exclude, axis)));
  if (next === 'include') {
    result = withIdAxis(result, 'include', axis, [...listOf(result, axis), value] as IdAxes[K]);
  } else if (next === 'exclude') {
    result = withIdAxis(result, 'exclude', axis, [...listOf(result.exclude, axis), value] as IdAxes[K]);
  }
  return result;
}
