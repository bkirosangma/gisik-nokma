import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  EMPTY_PREFERENCES,
  preferencesDocSchema,
  savedFilterSchema,
  type PreferencesDoc,
} from '../src/preferences.js';

/**
 * Plan 5 Task 13 — the FIRST write surface in this plan, and its whole payload
 * is actor-supplied.
 *
 * A file of its own rather than a describe block inside `filter-spec.test.ts`
 * (which is what the plan text says): every other module in this package has a
 * test file of its own, and the reason the plan gives — "the schemas travel
 * together" — is about the source modules, which do travel together (this schema
 * imports `filterSpecSchema` and `groupingSchema` and is proved to consume them
 * below).
 *
 * ## The two things a preferences schema has that no read schema has
 *
 * 1. **`listColumns` and `grouping` are OBJECTS INDEXED BY AN ACTOR-SUPPLIED
 *    STRING.** That is the `__proto__` hazard in its exact shape, and here it
 *    does not merely pollute — MEASURED on zod 3.25.76, a permissive
 *    `z.record(z.string(), …)` parses `{"__proto__": […]}` to `{}` and reports
 *    SUCCESS. A document the door said 200 to would come back missing a key,
 *    silently. So the key schema is `ulidString`, and `refuses the three
 *    dangerous keys` below runs the permissive record BESIDE the shipped one so
 *    the silent drop is executed rather than described.
 * 2. **Every string in it is written into a `jsonb` column.** MEASURED against
 *    this product's Postgres 16: `SELECT $1::jsonb` raises SQLSTATE 22P05
 *    ("unsupported Unicode escape sequence") for U+0000 in a key OR a value,
 *    while BEL and LF round-trip. That is the same rule `filter-spec.ts` states
 *    for `text` — "what the store can hold" — so the same guard is IMPORTED and
 *    applied to the two slots `filterSpecSchema` does not already cover, and the
 *    test asserts both directions.
 */

/** A real project id — `newUlid()`'s shape, which is what these records are keyed by. */
const PRJ = '01J60000000000000000000PRJ';
const PRJ2 = '01J60000000000000000000PR2';
const NUL = String.fromCharCode(0);

const FULL_DOC = {
  savedFilters: [
    { id: 'sf1', name: 'My active', filterSpec: { stateCategory: 'active' as const } },
    { id: 'sf2', name: 'Blocked', filterSpec: { blocked: true } },
  ],
  listColumns: { [PRJ]: ['status', 'assignee', 'dueDate'], [PRJ2]: ['status'] },
  grouping: { [PRJ]: 'epic' as const, [PRJ2]: 'flat' as const },
};

describe('preferencesDocSchema', () => {
  it('accepts a full document and the empty default, unchanged', () => {
    expect(preferencesDocSchema.parse(FULL_DOC)).toEqual(FULL_DOC);
    expect(preferencesDocSchema.parse(EMPTY_PREFERENCES)).toEqual(EMPTY_PREFERENCES);

    // The default IS empty in all three slots — not "a document with defaults
    // filled in". Spelled out, because `getPreferences` answers this object for
    // a user who has never saved anything and nothing downstream can tell the
    // two apart.
    expect(EMPTY_PREFERENCES).toEqual({ savedFilters: [], listColumns: {}, grouping: {} });
  });

  it('refuses malformed filter specs inside saved filters — the FilterSpec schema is consumed, not restated', () => {
    expect(() =>
      preferencesDocSchema.parse({
        savedFilters: [{ id: 'sf1', name: 'Bad', filterSpec: { velocity: 9 } }],
        listColumns: {},
        grouping: {},
      }),
    ).toThrow();

    // Positive control in the same case: the SAME document with a filterSpec
    // `filterSpecSchema` admits parses. Without it the refusal above could be
    // any of a dozen other things about the document.
    expect(
      preferencesDocSchema.parse({
        savedFilters: [{ id: 'sf1', name: 'Bad', filterSpec: { stateCategory: 'active' } }],
        listColumns: {},
        grouping: {},
      }).savedFilters[0]?.filterSpec,
    ).toEqual({ stateCategory: 'active' });

    // And the consumption is proved rather than assumed: a filter spec's own
    // `.strict()` and its own NUL refusal both reach through this schema.
    expect(() =>
      savedFilterSchema.parse({ id: 'a', name: 'b', filterSpec: { asigneeId: 'x' } }),
    ).toThrow();
    expect(() =>
      savedFilterSchema.parse({ id: 'a', name: 'b', filterSpec: { text: `q${NUL}` } }),
    ).toThrow();
  });

  it('refuses unknown groupings and unknown top-level keys', () => {
    expect(() =>
      preferencesDocSchema.parse({ savedFilters: [], listColumns: {}, grouping: { [PRJ]: 'workflow' } }),
    ).toThrow();
    expect(() =>
      preferencesDocSchema.parse({ savedFilters: [], listColumns: {}, grouping: {}, theme: 'dark' }),
    ).toThrow();

    // A missing slot is refused too: the three keys are the document, and a PUT
    // is a FULL REPLACE, so "absent" would mean "erase" if it were admitted.
    for (const missing of ['savedFilters', 'listColumns', 'grouping']) {
      const partial: Record<string, unknown> = { ...EMPTY_PREFERENCES };
      delete partial[missing];
      expect(() => preferencesDocSchema.parse(partial)).toThrow();
    }

    // Positive control for all five refusals above: the six legal groupings all
    // parse in this position, so what was refused is `workflow` and not the
    // record.
    for (const grouping of ['epic', 'status', 'assignee', 'type', 'priority', 'flat']) {
      expect(
        preferencesDocSchema.parse({ savedFilters: [], listColumns: {}, grouping: { [PRJ]: grouping } })
          .grouping[PRJ],
      ).toBe(grouping);
    }
  });

  it('refuses the three dangerous keys — and the permissive record beside it shows what that prevents', () => {
    // The hazard, executed. `JSON.parse` gives `__proto__` as an OWN key; a
    // record whose keys are unconstrained then assigns it onto a plain object,
    // which goes through `Object.prototype`'s accessor and creates no own key at
    // all. The parse SUCCEEDS and the key is gone.
    const permissive = z.record(z.string(), z.array(z.string()));
    const dropped = permissive.safeParse(JSON.parse(`{"__proto__": ["status"]}`));
    expect(dropped.success).toBe(true);
    expect(dropped.success && Object.getOwnPropertyNames(dropped.data)).toEqual([]);

    // The shipped schema refuses the same document instead, and refuses the two
    // keys that DO survive as own properties beside it — `toString` and
    // `constructor` are inherited names an indexer would later resolve to a
    // function.
    for (const rogue of ['__proto__', 'toString', 'constructor', 'prototype', 'prj_01', '']) {
      const doc = JSON.parse(
        `{"savedFilters": [], "listColumns": {${JSON.stringify(rogue)}: ["status"]}, "grouping": {}}`,
      ) as unknown;
      expect(preferencesDocSchema.safeParse(doc).success).toBe(false);
      const asGrouping = JSON.parse(
        `{"savedFilters": [], "listColumns": {}, "grouping": {${JSON.stringify(rogue)}: "flat"}}`,
      ) as unknown;
      expect(preferencesDocSchema.safeParse(asGrouping).success).toBe(false);
    }

    // Positive control for those twelve refusals: a REAL project id in the same
    // position parses and survives as an own key, so the key schema is a bound
    // and not a record that refuses everything.
    const good = preferencesDocSchema.parse(
      JSON.parse(`{"savedFilters": [], "listColumns": {"${PRJ}": ["status"]}, "grouping": {"${PRJ}": "flat"}}`),
    );
    expect(Object.getOwnPropertyNames(good.listColumns)).toEqual([PRJ]);
    expect(good.grouping[PRJ]).toBe('flat');

    // Nothing was polluted on the way through either — the refusals are the
    // reason, and this is the proof that the reason held.
    expect(({} as Record<string, unknown>)['status']).toBeUndefined();
    expect(Object.getPrototypeOf(good.listColumns)).toBe(Object.prototype);
  });

  it('refuses U+0000 in the two slots the FilterSpec does not cover — jsonb cannot hold it', () => {
    // MEASURED: `SELECT $1::jsonb` raises 22P05 for a NUL in a key or a value,
    // so a document carrying one is not a bad preference, it is a 500 reached
    // through a value that parsed the whole way.
    expect(() =>
      preferencesDocSchema.parse({
        savedFilters: [{ id: `sf${NUL}`, name: 'ok', filterSpec: {} }],
        listColumns: {},
        grouping: {},
      }),
    ).toThrow();
    expect(() =>
      preferencesDocSchema.parse({
        savedFilters: [{ id: 'sf1', name: `My${NUL}filter`, filterSpec: {} }],
        listColumns: {},
        grouping: {},
      }),
    ).toThrow();
    expect(() =>
      preferencesDocSchema.parse({
        savedFilters: [],
        listColumns: { [PRJ]: [`status${NUL}`] },
        grouping: {},
      }),
    ).toThrow();

    // The rule is "what the store can hold", not a taste for tidy input: BEL and
    // a newline round-trip through jsonb (measured), so they are ADMITTED here,
    // unchanged. This is the positive control for the three refusals and the
    // statement of the bound in one.
    const odd = `a${String.fromCharCode(7)}b\nc`;
    const parsed = preferencesDocSchema.parse({
      savedFilters: [{ id: 'sf1', name: odd, filterSpec: {} }],
      listColumns: { [PRJ]: [odd] },
      grouping: {},
    });
    expect(parsed.savedFilters[0]?.name).toBe(odd);
    expect(parsed.listColumns[PRJ]).toEqual([odd]);
  });

  it('bounds every actor-supplied collection at its stated size, and admits the boundary itself', () => {
    const filterAt = (n: number) => ({ id: `sf${n}`, name: `Filter ${n}`, filterSpec: {} });
    const fifty = Array.from({ length: 50 }, (_unused, index) => filterAt(index));
    expect(preferencesDocSchema.parse({ ...EMPTY_PREFERENCES, savedFilters: fifty }).savedFilters).toHaveLength(50);
    expect(() =>
      preferencesDocSchema.parse({ ...EMPTY_PREFERENCES, savedFilters: [...fifty, filterAt(50)] }),
    ).toThrow();

    const thirty = Array.from({ length: 30 }, (_unused, index) => `col${index}`);
    expect(
      preferencesDocSchema.parse({ ...EMPTY_PREFERENCES, listColumns: { [PRJ]: thirty } }).listColumns[PRJ],
    ).toHaveLength(30);
    expect(() =>
      preferencesDocSchema.parse({ ...EMPTY_PREFERENCES, listColumns: { [PRJ]: [...thirty, 'col30'] } }),
    ).toThrow();

    // The string bounds, each at its own boundary and one past it.
    expect(savedFilterSchema.parse({ id: 'a'.repeat(64), name: 'n', filterSpec: {} }).id).toHaveLength(64);
    expect(() => savedFilterSchema.parse({ id: 'a'.repeat(65), name: 'n', filterSpec: {} })).toThrow();
    expect(savedFilterSchema.parse({ id: 'a', name: 'n'.repeat(120), filterSpec: {} }).name).toHaveLength(120);
    expect(() => savedFilterSchema.parse({ id: 'a', name: 'n'.repeat(121), filterSpec: {} })).toThrow();
    expect(() => savedFilterSchema.parse({ id: '', name: 'n', filterSpec: {} })).toThrow();
    expect(() => savedFilterSchema.parse({ id: 'a', name: '', filterSpec: {} })).toThrow();
    expect(
      preferencesDocSchema.parse({ ...EMPTY_PREFERENCES, listColumns: { [PRJ]: ['c'.repeat(64)] } }).listColumns[PRJ],
    ).toEqual(['c'.repeat(64)]);
    expect(() =>
      preferencesDocSchema.parse({ ...EMPTY_PREFERENCES, listColumns: { [PRJ]: ['c'.repeat(65)] } }),
    ).toThrow();
    expect(() =>
      preferencesDocSchema.parse({ ...EMPTY_PREFERENCES, listColumns: { [PRJ]: [''] } }),
    ).toThrow();
  });

  it('is the type Plans 6 and 10 were promised — the three slots, and no `null` arm for "never set"', () => {
    // A compile-time statement made executable: the document has exactly these
    // three keys, and `EMPTY_PREFERENCES` is assignable to the same type a PUT
    // carries. There is deliberately no `unset` arm — see `preferences.ts`.
    const doc: PreferencesDoc = EMPTY_PREFERENCES;
    expect(Object.keys(doc).sort()).toEqual(['grouping', 'listColumns', 'savedFilters']);
  });
});
