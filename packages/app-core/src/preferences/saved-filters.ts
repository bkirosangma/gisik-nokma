import { newUlid, preferencesDocSchema, savedFilterSchema } from '@gisik-nokma/domain';
import type { FilterSpec, SavedFilter } from '@gisik-nokma/domain';
import type { PreferencesGateway } from './preferences-gateway.js';

/**
 * Saved filters: named `FilterSpec`s, stored in the preferences document.
 *
 * ## The field is `filterSpec`, and nothing here restates what a saved filter is
 *
 * Ruling P26 (coordination doc, 2026-09-02): Plan 9's `spec` spelling is
 * SUPERSEDED before it is written, because `preferencesDocSchema` is
 * `.strict()` and a strict schema REFUSES a third spelling rather than renaming
 * it. Measured, not recalled — `savedFilterSchema.safeParse({id, name, spec})`
 * answers `success: false`, and `test/preferences/saved-filters.test.ts` runs
 * that refusal beside the `filterSpec` control.
 *
 * So this module declares NO `SavedFilter` type, no `savedFilterSchema` and no
 * max-50 constant of its own: all four already ship in
 * `packages/domain/src/preferences.ts` and are imported. A second declaration
 * here would be a fourth spelling of one field.
 *
 * The `FilterSpec` is therefore the DOMAIN's (singular `assigneeId`,
 * `stateCategory`, plus `blocked` and `due`), not `view-types.ts`'s plural
 * one. That is forced rather than preferred: `apps/server/test/integration/
 * client-contract.test.ts:1022` measures `filterSpec: { assigneeIds: [...] }`
 * → `400 invalid_preferences`, with the one-letter singular control returning
 * 200 in the same run. A store built on the plural type under this key could
 * not round-trip through the shipped door.
 *
 * **Consequence, RECORDED and not bridged:** `matchesFilter`,
 * `buildCalendarModel` and `buildTimelineModel` all consume `view-types.ts`'s
 * `FilterSpec`, so `onApply` hands out a spec those functions do not take.
 * Reconciling the two vocabularies is the seam `mappers.ts` already names an
 * owner for — *"Plan 6 — the client FilterSpec type (view-types.ts), not a
 * route"* — and closing it is that owner's, not this task's.
 *
 * ## Reading is TOLERANT; writing is STRICT. They are different questions.
 *
 * `loadSavedFilters` drops a malformed entry and renders the rest: a corrupt
 * preference must not take the view down, and the entries it cannot read are
 * ones it also cannot draw.
 *
 * `saveFilter` and `deleteSavedFilter` REFUSE a document they cannot fully
 * parse. This is the opposite policy on purpose, and the reason is the shape
 * of the write: a PUT replaces the WHOLE row, so writing a salvaged version of
 * a document we only half understood would silently delete the `listColumns`
 * and `grouping` we dropped on the way in. A refusal loses nothing; a tolerant
 * write loses the half nobody was looking at.
 *
 * The cost is declared rather than hidden: a stored document that is invalid
 * as a whole — say, 51 filters, which the server's own door cannot produce but
 * a corrupt replica could — is READABLE and not WRITABLE, so it cannot be
 * repaired through this module. Recorded; the owner is Plan 10, whose replica
 * is the only writer that could put such a document there.
 */

/** Refusals this module raises, as a value a caller can branch on. */
export type SavedFilterRefusalReason =
  /** The stored document does not parse as a `PreferencesDoc`. */
  | 'unreadable-document'
  /** The filter being saved is not one `savedFilterSchema` admits. */
  | 'invalid-filter'
  /** The document already holds `MAX_SAVED_FILTERS`. */
  | 'too-many';

export class SavedFilterRefused extends Error {
  readonly reason: SavedFilterRefusalReason;

  constructor(reason: SavedFilterRefusalReason, message: string) {
    super(message);
    this.name = 'SavedFilterRefused';
    this.reason = reason;
  }
}

/**
 * The cap the SERVER enforces, restated here as the number this module checks
 * BEFORE writing rather than as a second policy.
 *
 * It is 50 because `preferencesDocSchema` says
 * `z.array(savedFilterSchema).max(50)`, and the test that pins this constant
 * does not compare it to the literal 50 — it hands `preferencesDocSchema` an
 * array of `MAX_SAVED_FILTERS` filters and one of `MAX_SAVED_FILTERS + 1` and
 * asserts the door's answers. Change the schema and this constant reddens.
 */
export const MAX_SAVED_FILTERS = 50;

/**
 * Every entry of `value` that IS a saved filter, in order; the rest dropped.
 *
 * Tolerant per ENTRY, strict WITHIN one: `savedFilterSchema.safeParse` is the
 * whole test, so an entry is kept only if the shipped door would store it.
 * That is what makes the three refusals below real rather than incidental —
 * the plan's `spec` spelling, the client's plural `assigneeIds` under
 * `filterSpec`, and an extra key under `.strict()` are all dropped by the same
 * schema the server refuses them with.
 *
 * A non-array — `undefined`, a string, an object — yields `[]`. There is no
 * throw on this path at all.
 */
export function parseSavedFilters(value: unknown): SavedFilter[] {
  if (!Array.isArray(value)) return [];
  const filters: SavedFilter[] = [];
  for (const entry of value) {
    const parsed = savedFilterSchema.safeParse(entry);
    if (parsed.success) filters.push(parsed.data);
  }
  return filters;
}

/** The `savedFilters` member of an unknown value, without asserting anything else about it. */
function savedFiltersMember(document: unknown): unknown {
  if (typeof document !== 'object' || document === null) return undefined;
  return (document as Record<string, unknown>)['savedFilters'];
}

/**
 * The viewer's saved filters. Never throws for a shape reason — see the
 * tolerance note above. A gateway whose `load` REJECTS still rejects here:
 * a transport failure is not a corrupt document and must not read as "you have
 * no saved filters".
 */
export async function loadSavedFilters(gateway: PreferencesGateway): Promise<SavedFilter[]> {
  return parseSavedFilters(savedFiltersMember(await gateway.load()));
}

/** Reads the stored document, or refuses. The strict half of the policy above. */
async function readDocument(gateway: PreferencesGateway) {
  const parsed = preferencesDocSchema.safeParse(await gateway.load());
  if (!parsed.success) {
    throw new SavedFilterRefused(
      'unreadable-document',
      `the stored preferences document does not parse, and a write would replace it whole: ${parsed.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ')}`,
    );
  }
  return parsed.data;
}

/**
 * Append one named filter and write the whole document back.
 *
 * ## `existing` is NOT a parameter, and that is the read-modify-write
 *
 * The plan's signature is `saveFilter(prefs, existing, name, spec)` — the
 * caller supplies the list to append to. Against a whole-document PUT that is
 * a way to write a document nobody read: the caller's `existing` is whatever
 * it last saw, and the other two keys are not in its hands at all. This reads
 * the document at the moment it writes, so the body it sends is the body it
 * loaded with `savedFilters` replaced and `listColumns`/`grouping` carried
 * across untouched. Two clients still resolve last-write-wins — that is the
 * route's behaviour and is not fixable from this side.
 *
 * The id is minted here with `newUlid()`. `preferences.ts` notes that the id
 * is deliberately not REQUIRED to be a ULID — the document is the client's to
 * arrange — which is a statement about the schema, not a prohibition; a fresh
 * ULID is a client handle that needs no coordination.
 *
 * Uniqueness of ids among the document's filters is NOT checked, here or by
 * the schema. Measured: `preferencesDocSchema.safeParse` ACCEPTS a document
 * carrying two entries with the same id. `preferences.ts:22` names the owner —
 * *"the owner is Plan 6, which renders the list"*. A guard here against a
 * COLLIDING MINTED ULID would be a check that cannot fail, so there is none;
 * what the duplicate really costs is stated on `deleteSavedFilter`.
 *
 * Refusal order is validity, then the cap: a filter that is not a filter is
 * refused as one whatever the document's length.
 */
export async function saveFilter(
  gateway: PreferencesGateway,
  name: string,
  filterSpec: FilterSpec,
): Promise<SavedFilter[]> {
  const document = await readDocument(gateway);
  const candidate = savedFilterSchema.safeParse({ id: newUlid(), name, filterSpec });
  if (!candidate.success) {
    throw new SavedFilterRefused(
      'invalid-filter',
      `this is not a filter the preferences door would store: ${candidate.error.issues
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; ')}`,
    );
  }
  if (document.savedFilters.length >= MAX_SAVED_FILTERS) {
    throw new SavedFilterRefused(
      'too-many',
      `a preferences document holds at most ${MAX_SAVED_FILTERS} saved filters and this one already holds ${document.savedFilters.length}`,
    );
  }
  const savedFilters = [...document.savedFilters, candidate.data];
  await gateway.save({ ...document, savedFilters });
  return savedFilters;
}

/**
 * Remove the filter with this id and write the whole document back.
 *
 * REMOVES EVERY MATCH, not the first. The schema admits duplicate ids (see
 * `saveFilter`), so "the filter with this id" may be two rows; deleting one of
 * them would leave the list looking unchanged to the person who clicked, and
 * a second click would be needed for a row they already deleted. Stated here
 * because it is a choice, not an accident of `filter`.
 *
 * An id that matches nothing writes NOTHING. A PUT that replaces the document
 * with itself is a real last-write-wins race entered for no reason — it can
 * overwrite another client's concurrent change while deleting nothing — so the
 * no-op stays a no-op, and the test asserts `save` was not called.
 */
export async function deleteSavedFilter(
  gateway: PreferencesGateway,
  id: string,
): Promise<SavedFilter[]> {
  const document = await readDocument(gateway);
  const savedFilters = document.savedFilters.filter((filter) => filter.id !== id);
  if (savedFilters.length === document.savedFilters.length) return document.savedFilters;
  await gateway.save({ ...document, savedFilters });
  return savedFilters;
}
