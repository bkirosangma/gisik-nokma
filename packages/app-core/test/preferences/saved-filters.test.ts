import { EMPTY_PREFERENCES, preferencesDocSchema } from '@gisik-nokma/domain';
import type { FilterSpec, SavedFilter } from '@gisik-nokma/domain';
import { describe, expect, it } from 'vitest';
import {
  MAX_SAVED_FILTERS,
  SavedFilterRefused,
  deleteSavedFilter,
  loadSavedFilters,
  parseSavedFilters,
  saveFilter,
} from '../../src/preferences/saved-filters.js';
import {
  FailingPreferencesGateway,
  FakePreferencesGateway,
  PROJECT_ID,
  documentWith,
} from './fake-gateway.js';

const NUL = '\u0000';

const MINE: SavedFilter = { id: 'f1', name: 'Mine', filterSpec: { assigneeId: 'user_kiro' } };
const BLOCKED: SavedFilter = { id: 'f2', name: 'Blocked anywhere', filterSpec: { blocked: true } };

function filterAt(index: number): SavedFilter {
  return { id: `f${index}`, name: `Filter ${index}`, filterSpec: {} };
}

/* ------------------------------------------------------------------ *
 * parseSavedFilters — the tolerant half.
 * ------------------------------------------------------------------ */

describe('11.96 parseSavedFilters is tolerant per ENTRY and strict WITHIN one', () => {
  it('answers [] for every non-array, and the control in the same run is not []', () => {
    for (const value of [undefined, null, 'junk', 42, {}, { savedFilters: [MINE] }]) {
      expect(parseSavedFilters(value), JSON.stringify(value ?? null)).toEqual([]);
    }
    // POSITIVE CONTROL. Without it "returns [] for everything" passes.
    expect(parseSavedFilters([MINE])).toEqual([MINE]);
  });

  it('drops the malformed entries, keeps the rest, and keeps their ORDER', () => {
    expect(
      parseSavedFilters([
        MINE,
        { id: 42, name: 'Bad id', filterSpec: {} },
        { name: 'No id', filterSpec: {} },
        { id: 'f', name: 'No spec' },
        null,
        'not an object',
        BLOCKED,
      ]),
    ).toEqual([MINE, BLOCKED]);
  });

  it('never throws, for any of the shapes that would throw a hand-written walk', () => {
    // A corrupt preference must not take the view down. The three below reach
    // property access, iteration and prototype lookup respectively.
    expect(() => parseSavedFilters([Object.create(null)])).not.toThrow();
    expect(() => parseSavedFilters([{ id: 'f', name: 'n', filterSpec: null }])).not.toThrow();
    expect(() => parseSavedFilters([[[[]]]])).not.toThrow();
  });

  /**
   * RULING P26, executed rather than cited. All three spellings in ONE call, so
   * the two drops are measured beside the keep and not against a different run.
   */
  it("11.97 keeps `filterSpec`, drops the plan's `spec` AND the client's plural `assigneeIds`", () => {
    const kept = parseSavedFilters([
      { id: 'plan', name: "Plan 9's spelling", spec: { assigneeId: 'u1' } },
      { id: 'client', name: "app-core's plural", filterSpec: { assigneeIds: ['u1'] } },
      { id: 'shipped', name: 'the shipped spelling', filterSpec: { assigneeId: 'u1' } },
    ]);
    expect(kept.map((filter) => filter.id)).toEqual(['shipped']);
    expect(kept[0]?.filterSpec).toEqual({ assigneeId: 'u1' });
  });

  it('11.98 drops an entry carrying an unknown key, because the door is `.strict()`', () => {
    expect(
      parseSavedFilters([
        { id: 'extra', name: 'Has a colour', filterSpec: {}, colour: 'red' },
        { id: 'clean', name: 'Has none', filterSpec: {} },
      ]).map((filter) => filter.id),
    ).toEqual(['clean']);
  });
});

/* ------------------------------------------------------------------ *
 * The cap is the SCHEMA's, not a number this module invented.
 * ------------------------------------------------------------------ */

describe('11.99 MAX_SAVED_FILTERS is the bound the shipped door enforces', () => {
  it('the schema accepts exactly MAX_SAVED_FILTERS and refuses one more', () => {
    const atCap = Array.from({ length: MAX_SAVED_FILTERS }, (_, index) => filterAt(index));
    expect(preferencesDocSchema.safeParse(documentWith(atCap)).success).toBe(true);
    expect(
      preferencesDocSchema.safeParse(documentWith([...atCap, filterAt(MAX_SAVED_FILTERS)])).success,
    ).toBe(false);
  });
});

/* ------------------------------------------------------------------ *
 * loadSavedFilters — reading through the gateway.
 * ------------------------------------------------------------------ */

describe('11.100 loadSavedFilters reads the document and salvages what it can', () => {
  it('a document that is corrupt AS A WHOLE still renders the filters that are not', async () => {
    // `listColumns` is keyed by project ULID, so `not-a-ulid` makes the whole
    // document unparseable — asserted here, so the salvage below is measured
    // against a document that really is broken rather than a valid one.
    const corrupt = {
      savedFilters: [MINE, { id: 42, name: 'Bad', filterSpec: {} }],
      listColumns: { 'not-a-ulid': ['status'] },
      grouping: {},
    };
    expect(preferencesDocSchema.safeParse(corrupt).success).toBe(false);
    expect(await loadSavedFilters(new FakePreferencesGateway(corrupt))).toEqual([MINE]);
  });

  it('a document that is not an object at all reads as no saved filters', async () => {
    expect(await loadSavedFilters(new FakePreferencesGateway(null))).toEqual([]);
    expect(await loadSavedFilters(new FakePreferencesGateway('{}'))).toEqual([]);
    // Control, same shape of call: a real document is not read as empty.
    expect(await loadSavedFilters(new FakePreferencesGateway(documentWith([MINE])))).toEqual([
      MINE,
    ]);
  });

  it('11.101 a gateway that REJECTS rejects here — a dead transport is not an empty list', async () => {
    await expect(loadSavedFilters(new FailingPreferencesGateway())).rejects.toThrow(
      'preferences unreachable',
    );
  });
});

/* ------------------------------------------------------------------ *
 * saveFilter — the read-modify-write, and its four refusals.
 * ------------------------------------------------------------------ */

describe('11.102 saveFilter writes the document it read, with only savedFilters changed', () => {
  it('the other two keys survive — a per-key write would erase them and nothing else would see it', async () => {
    const loaded = documentWith([MINE]);
    const gateway = new FakePreferencesGateway(loaded);
    const next = await saveFilter(gateway, 'Overdue', { due: { before: '2026-09-30' } });

    expect(gateway.saves).toHaveLength(1);
    const written = gateway.saves[0];
    expect(written?.listColumns).toEqual({ [PROJECT_ID]: ['status', 'assignee'] });
    expect(written?.grouping).toEqual({ [PROJECT_ID]: 'epic' });
    // Stated as ONE shape rather than three assertions: the body sent is the
    // body loaded with `savedFilters` replaced, and nothing else moved.
    expect(written).toEqual({ ...loaded, savedFilters: next });
  });

  it('appends rather than replaces, mints an id, and returns the new list', async () => {
    const gateway = new FakePreferencesGateway(documentWith([MINE]));
    const next = await saveFilter(gateway, 'Overdue', { due: { before: '2026-09-30' } });

    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(MINE);
    expect(next[1]?.name).toBe('Overdue');
    expect(next[1]?.filterSpec).toEqual({ due: { before: '2026-09-30' } });
    expect(next[1]?.id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    // The document the door would take, byte for byte.
    expect(preferencesDocSchema.safeParse(gateway.stored).success).toBe(true);
  });

  it('two saves get two different ids', async () => {
    const gateway = new FakePreferencesGateway(documentWith([]));
    await saveFilter(gateway, 'One', {});
    const next = await saveFilter(gateway, 'Two', {});
    expect(next[0]?.id).not.toBe(next[1]?.id);
  });

  it('11.103 EMPTY_PREFERENCES is not mutated — the never-saved answer is shared and frozen', async () => {
    // `preferences.ts` freezes the document AND each container precisely so a
    // caller that pushed into it would edit every future "this person has saved
    // nothing" answer. The spread is what keeps that from being reachable.
    expect(Object.isFrozen(EMPTY_PREFERENCES.savedFilters)).toBe(true);
    const gateway = new FakePreferencesGateway(EMPTY_PREFERENCES);
    await saveFilter(gateway, 'First', {});
    expect(EMPTY_PREFERENCES.savedFilters).toEqual([]);
    expect(gateway.saves[0]).not.toBe(EMPTY_PREFERENCES);
  });
});

describe('11.104 saveFilter refuses rather than writing something it did not fully read', () => {
  it('an unparseable document is refused and NOTHING is written', async () => {
    const gateway = new FakePreferencesGateway({ savedFilters: [], listColumns: {} });
    await expect(saveFilter(gateway, 'Mine', {})).rejects.toThrow(SavedFilterRefused);
    await expect(saveFilter(gateway, 'Mine', {})).rejects.toMatchObject({
      reason: 'unreadable-document',
    });
    expect(gateway.saves).toEqual([]);

    // CONTROL, one key apart, same run: the document that does parse is written.
    const good = new FakePreferencesGateway({ savedFilters: [], listColumns: {}, grouping: {} });
    await saveFilter(good, 'Mine', {});
    expect(good.saves).toHaveLength(1);
  });

  it('a blank name is refused; a one-character name is not', async () => {
    const gateway = new FakePreferencesGateway(documentWith([]));
    await expect(saveFilter(gateway, '', {})).rejects.toMatchObject({ reason: 'invalid-filter' });
    expect(gateway.saves).toEqual([]);
    await saveFilter(gateway, 'x', {});
    expect(gateway.saves).toHaveLength(1);
  });

  it('a 120-character name is stored and a 121-character one is refused', async () => {
    const gateway = new FakePreferencesGateway(documentWith([]));
    await saveFilter(gateway, 'x'.repeat(120), {});
    expect(gateway.saves).toHaveLength(1);
    await expect(saveFilter(gateway, 'x'.repeat(121), {})).rejects.toMatchObject({
      reason: 'invalid-filter',
    });
    expect(gateway.saves).toHaveLength(1);
  });

  it('11.105 a NUL in the name is refused — Postgres jsonb cannot carry the byte', async () => {
    const gateway = new FakePreferencesGateway(documentWith([]));
    await expect(saveFilter(gateway, `My${NUL}filter`, {})).rejects.toMatchObject({
      reason: 'invalid-filter',
    });
    expect(gateway.saves).toEqual([]);
    // Control: every other awkward byte this name could carry round-trips.
    await saveFilter(gateway, 'My\tfilter — “quoted”, 加班', {});
    expect(gateway.saves).toHaveLength(1);
  });

  it("11.106 the client's PLURAL spelling is refused at the write door too (ruling P26)", async () => {
    // The type forbids it, so this is the runtime half: a caller reaching the
    // function through untyped JavaScript gets the same 400 the server gives,
    // raised before anything is written rather than after a round trip.
    const gateway = new FakePreferencesGateway(documentWith([]));
    await expect(
      saveFilter(gateway, 'Mine', { assigneeIds: ['u1'] } as unknown as FilterSpec),
    ).rejects.toMatchObject({ reason: 'invalid-filter' });
    expect(gateway.saves).toEqual([]);
    // Control, one letter apart, same run.
    await saveFilter(gateway, 'Mine', { assigneeId: 'u1' });
    expect(gateway.saves).toHaveLength(1);
  });

  it('11.107 the 51st filter is refused and the 50th is not', async () => {
    const atCap = Array.from({ length: MAX_SAVED_FILTERS }, (_, index) => filterAt(index));
    const full = new FakePreferencesGateway(documentWith(atCap));
    await expect(saveFilter(full, 'One too many', {})).rejects.toMatchObject({
      reason: 'too-many',
    });
    expect(full.saves).toEqual([]);

    // CONTROL: one fewer, same run. The refusal is the CAP and not "saving is broken".
    const nearlyFull = new FakePreferencesGateway(documentWith(atCap.slice(0, -1)));
    const next = await saveFilter(nearlyFull, 'The last one', {});
    expect(next).toHaveLength(MAX_SAVED_FILTERS);
    expect(nearlyFull.saves).toHaveLength(1);
  });

  it('at the cap WITH a bad name, the refusal is the name — validity is checked first', async () => {
    // The order is a decision `saved-filters.ts` states; this pins it so a
    // reordering shows up as a changed reason rather than as nothing at all.
    const atCap = Array.from({ length: MAX_SAVED_FILTERS }, (_, index) => filterAt(index));
    const gateway = new FakePreferencesGateway(documentWith(atCap));
    await expect(saveFilter(gateway, '', {})).rejects.toMatchObject({ reason: 'invalid-filter' });
  });
});

/* ------------------------------------------------------------------ *
 * deleteSavedFilter.
 * ------------------------------------------------------------------ */

describe('11.108 deleteSavedFilter', () => {
  it('removes the named filter and carries the other two keys across', async () => {
    const loaded = documentWith([MINE, BLOCKED]);
    const gateway = new FakePreferencesGateway(loaded);
    const next = await deleteSavedFilter(gateway, MINE.id);
    expect(next).toEqual([BLOCKED]);
    expect(gateway.saves[0]).toEqual({ ...loaded, savedFilters: [BLOCKED] });
  });

  it('11.109 an id that matches nothing writes NOTHING', async () => {
    const gateway = new FakePreferencesGateway(documentWith([MINE]));
    expect(await deleteSavedFilter(gateway, 'no-such-filter')).toEqual([MINE]);
    expect(gateway.saves).toEqual([]);
    // CONTROL, same gateway, same run: an id that DOES match writes once.
    expect(await deleteSavedFilter(gateway, MINE.id)).toEqual([]);
    expect(gateway.saves).toHaveLength(1);
  });

  it('11.110 duplicate ids are ACCEPTED by the schema, and delete removes every match', async () => {
    // RECORDED, NOT FIXED. `preferences.ts:22` says uniqueness among ids "is
    // NOT enforced … Recorded rather than fixed; the owner is Plan 6, which
    // renders the list". Measured here so the claim is a fact rather than a
    // docblock: the document below PARSES.
    const twin = { ...MINE, name: 'Mine, again' };
    const document = documentWith([MINE, twin, BLOCKED]);
    expect(preferencesDocSchema.safeParse(document).success).toBe(true);

    const gateway = new FakePreferencesGateway(document);
    expect(await deleteSavedFilter(gateway, MINE.id)).toEqual([BLOCKED]);
  });

  it('an unparseable document is refused and NOTHING is written', async () => {
    const gateway = new FakePreferencesGateway({ savedFilters: [MINE] });
    await expect(deleteSavedFilter(gateway, MINE.id)).rejects.toMatchObject({
      reason: 'unreadable-document',
    });
    expect(gateway.saves).toEqual([]);
  });
});

/* ------------------------------------------------------------------ *
 * The plan's headline case.
 * ------------------------------------------------------------------ */

describe('11.111 save → load → delete, through one gateway', () => {
  it('round-trips, and the document is one the shipped door would take at every step', async () => {
    const gateway = new FakePreferencesGateway(EMPTY_PREFERENCES);

    const afterSave = await saveFilter(gateway, 'My open work', { stateCategory: 'active' });
    expect(afterSave).toHaveLength(1);
    expect(afterSave[0]?.name).toBe('My open work');
    expect(preferencesDocSchema.safeParse(gateway.stored).success).toBe(true);

    const loaded = await loadSavedFilters(gateway);
    expect(loaded).toEqual(afterSave);

    const id = loaded[0]?.id ?? '';
    const afterDelete = await deleteSavedFilter(gateway, id);
    expect(afterDelete).toEqual([]);
    expect(await loadSavedFilters(gateway)).toEqual([]);
    expect(preferencesDocSchema.safeParse(gateway.stored).success).toBe(true);
  });
});
