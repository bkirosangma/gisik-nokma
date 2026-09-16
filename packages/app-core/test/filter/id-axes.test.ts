import { describe, expect, it } from 'vitest';
import type { FilterSpec } from '../../src/view-types.js';
import {
  claimText,
  excludedBy,
  excludedByAny,
  narrowsTo,
  narrowsToAny,
} from '../../src/filter/id-axes.js';

/**
 * 13.538 — the two base rules every filter predicate reads (exclude-mode
 * spec §2), declared once so `matchesFilter`, `matchesBoardCard` and
 * `matchesListRow` cannot drift on "does an absent list narrow?".
 */
describe('13.538 id-axes — the base rules, declared once', () => {
  it('narrowsTo: an absent or empty list narrows nothing; otherwise the value must be listed', () => {
    expect(narrowsTo(undefined, 'a')).toBe(true);
    expect(narrowsTo([], 'a')).toBe(true);
    expect(narrowsTo(['a', 'b'], 'a')).toBe(true);
    expect(narrowsTo(['a', 'b'], 'c')).toBe(false);
  });

  it('narrowsTo: a null value never matches a set list, and always passes an absent one', () => {
    expect(narrowsTo(['a'], null)).toBe(false);
    expect(narrowsTo(undefined, null)).toBe(true);
  });

  it('excludedBy: an absent or empty list excludes nothing; a listed value is out', () => {
    expect(excludedBy(undefined, 'a')).toBe(false);
    expect(excludedBy([], 'a')).toBe(false);
    expect(excludedBy(['a', 'b'], 'a')).toBe(true);
    expect(excludedBy(['a', 'b'], 'c')).toBe(false);
  });

  it('excludedBy: a null value is never excluded — unassigned work survives an assignee exclusion', () => {
    expect(excludedBy(['a'], null)).toBe(false);
  });

  it('the any-of forms, for an axis whose ticket-side value is itself a list (collaborators)', () => {
    expect(narrowsToAny(undefined, ['x'])).toBe(true);
    expect(narrowsToAny(['a'], ['x', 'a'])).toBe(true);
    expect(narrowsToAny(['a'], ['x'])).toBe(false);
    expect(narrowsToAny(['a'], [])).toBe(false);
    expect(excludedByAny(undefined, ['a'])).toBe(false);
    expect(excludedByAny(['a'], ['x', 'a'])).toBe(true);
    expect(excludedByAny(['a'], ['x'])).toBe(false);
    expect(excludedByAny(['a'], [])).toBe(false);
  });

  it('claimText renders a string, a finite number and a boolean as Postgres ->> would, and nothing else', () => {
    expect(claimText('4200')).toBe('4200');
    expect(claimText(2.5)).toBe('2.5');
    expect(claimText(true)).toBe('true');
    expect(claimText(null)).toBeNull();
    expect(claimText({ date: '2026-09-20' })).toBeNull();
    expect(claimText(Number.NaN)).toBeNull();
  });

  it('FilterSpec carries an exclude half of the same six id axes (a compile-time fact)', () => {
    const spec: FilterSpec = {
      assigneeIds: ['u1'],
      exclude: { assigneeIds: ['u2'], typeIds: ['bug'], stateCategories: ['terminal'] },
    };
    expect(spec.exclude?.assigneeIds).toEqual(['u2']);
    // @ts-expect-error `text` is not an id axis and has no exclude form (spec §1).
    const wrong: FilterSpec = { exclude: { text: 'x' } };
    expect(wrong).toBeDefined();
  });
});
