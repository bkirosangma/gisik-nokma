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
 * `filter.closed` in `ChoiceMode`'s own three terms (backlog/closed spec
 * §5.5, Ruling 45): `undefined → 'off'` (All), `true → 'include'` (Closed
 * only), `false → 'exclude'` (Not closed/hidden). Closed is a single boolean,
 * not an `IdAxes` member — `FilterSpec.closed`'s own docblock says so, and it
 * has no `exclude`-half key to read the way `choiceMode` reads one of two
 * lists for an id axis — so this is a small, direct reader rather than a
 * generic-over-`IdAxes` call into `choiceMode`.
 *
 * Task 11's own brief named this `closedMode(filter): 'all' | 'only' |
 * 'hidden'` alongside `nextClosedMode`/`withClosedMode`; Ruling 44/45
 * replaces that three-word vocabulary with `ChoiceMode` itself, so the one
 * cycling control every other value in the Filters sheet already uses
 * (`TriStateChoice`, `choiceMode`/`nextMode`/`withCycledId`) reads Closed
 * exactly like it reads any other axis, rather than inventing a second
 * three-state spelling for `TriStateChoice` to translate.
 */
export function closedMode(filter: FilterSpec): ChoiceMode {
  if (filter.closed === true) return 'include';
  if (filter.closed === false) return 'exclude';
  return 'off';
}

/**
 * One click on the Closed control — cycles through `nextMode` UNCHANGED (the
 * same off → include → exclude → off every other control in this file
 * drives), writing `filter.closed` directly rather than through
 * `withIdAxis`'s per-axis list machinery, which has nothing to add or remove
 * an item from here.
 *
 * `off` DELETES the key (Ruling 44) rather than writing `closed: undefined`
 * the way `withIdAxis`'s own collapse rule does for an emptied id-axis list.
 * The two read identically through `toEqual` (which treats an `undefined`
 * property as absent) and through `closedMode` (`undefined` either way), so
 * nothing UP THE CHAIN can tell them apart — but Ruling 44 asked for the key
 * itself gone, not merely emptied, and `delete` is what makes that literally
 * true rather than merely equivalent under one particular comparison.
 */
export function withCycledClosed(filter: FilterSpec): FilterSpec {
  const next = nextMode(closedMode(filter));
  if (next === 'off') {
    const result = { ...filter };
    delete result.closed;
    return result;
  }
  return { ...filter, closed: next === 'include' };
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
