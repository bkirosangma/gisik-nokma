import { z } from 'zod';
import { ulidString } from './envelope.js';
import { groupingSchema, noNul, savedFilterSpecSchema } from './filter-spec.js';

/**
 * One saved filter: a NAMED query, not a claim about anything.
 *
 * `filterSpec` is `filterSpecSchema` itself minus its plural list keys
 * (`savedFilterSpecSchema` — consumed, never restated) — so a saved filter
 * can express what a live filter can on the web client's single-valued wire,
 * and the day the filter language grows a term the saved ones grow it too. It follows that a
 * saved filter is NOT checked against reality: it may name a state id, an
 * assignee or a custom field that no longer exists, and that is correct. A
 * filter is a question; a question about nothing is answered with nothing, and
 * validating it against today's world would make yesterday's saved view a
 * refusal rather than an empty list.
 *
 * `id` is the CLIENT's handle for its own filter, and it is deliberately not a
 * ULID: this document is the client's to arrange. Uniqueness among the ids in
 * one document is NOT enforced — the server never indexes by this id (the
 * filters are an array, and stay one), so a duplicate is a client-side
 * confusion rather than a server-side ambiguity. Recorded rather than fixed; the
 * owner is Plan 6, which renders the list.
 */
export const savedFilterSchema = z
  .object({
    id: noNul(z.string().min(1).max(64)),
    name: noNul(z.string().min(1).max(120)),
    filterSpec: savedFilterSpecSchema,
  })
  .strict();
export type SavedFilter = z.infer<typeof savedFilterSchema>;

/**
 * The key of `listColumns` and `grouping`: a PROJECT ID, and therefore a ULID.
 *
 * `ulidString` is imported rather than `z.string()` for a reason that is not
 * tidiness, and it was MEASURED on zod 3.25.76 before it was chosen:
 *
 *   `z.record(z.string(), …).parse(JSON.parse('{"__proto__": ["status"]}'))`
 *   SUCCEEDS and answers `{}`.
 *
 * `JSON.parse` gives `__proto__` as an own key; zod's record then assigns each
 * key onto a fresh plain object, and that assignment goes through
 * `Object.prototype`'s `__proto__` accessor, which creates no own property at
 * all. So a permissive key schema does not merely admit a dangerous key — it
 * ACCEPTS a document and silently returns a different one, and a full-replace
 * PUT would then store, and answer, something the caller never sent. With
 * `ulidString` the same document is refused at the door, `invalid_preferences`,
 * with nothing stored: `preferences.test.ts` runs the permissive record beside
 * this one so the drop is executed rather than described.
 *
 * The narrowing is also the honest statement of the key space. Amendment 14
 * declares these records "keyed by project id"; every project id in this product
 * is a bare ULID (`ids.ts`: `membership` is the one entity kind whose id is
 * not), so the shape is knowable and there is no reason for the door to accept a
 * key no project could ever have.
 *
 * **This TIGHTENS a cross-plan contract** — the plan text writes
 * `Record<string, …>` and Plan 6's fixtures key by `prj_1` — so it is recorded
 * for the coordination document rather than made silently. Plan 6's fakes never
 * reach this schema (they are client-side test doubles); a real client PUTs real
 * project ids and is unaffected.
 */
const projectIdKey = ulidString;

/**
 * Per-user, per-workspace view preferences (coordination amendment 14).
 *
 * ## Rows, not ledger events — and why that is not an exception being smuggled
 *
 * Everything else this product stores is an attributed claim about the work.
 * Preferences are not about the work: they ARRANGE it. Which columns a person
 * shows, how they group a list, what they named a query — none of it says
 * anything about a ticket that could later be true or false, so there is nothing
 * to attribute and nothing a replica needs to replay. Recording them as claims
 * would put non-facts in the ledger, and every reader of the ledger would then
 * have to know which of its entries were history and which were furniture. So
 * they are server-owned rows, keyed by `(user_id, workspace_id)`, and
 * `preferences.test.ts` asserts that a PUT appends ZERO events — the stated
 * exception, made falsifiable, rather than a silent one.
 *
 * ## "Never set" collapses into "empty", deliberately, and the type says so
 *
 * `getPreferences` answers `EMPTY_PREFERENCES` for a user who has never saved
 * anything, and there is NO `null` arm and no `unset` discriminator: a caller
 * cannot tell "never saved" from "saved an empty document". That is a decision,
 * and it is the opposite of the one `proj_workspace_settings` made one task
 * earlier — there, never-claimed and claimed-7 are different answers with
 * different provenance, because a threshold is somebody's CLAIM and the product
 * must be able to say who made it. Here there is nobody to attribute anything
 * to and no behaviour that differs: an empty document and an absent one render
 * the same list, so a distinction between them would be a distinction no screen
 * could show and no user could act on.
 *
 * ## `.strict()`, and every collection bounded
 *
 * An unknown top-level key is refused rather than dropped, for the same reason
 * `filterSpecSchema` refuses one: a `theme` the server silently discarded would
 * be a preference the user set, saw accepted, and lost. The bounds (50 filters,
 * 30 columns, 64/120-character strings) are refusals at the door and nothing
 * here rewrites a value.
 *
 * There is deliberately NO cap on the NUMBER of project keys. The bound that
 * exists is Fastify's 1 MiB body limit, which is measured in
 * `preferences.test.ts` (a 1.1 MiB document is refused before any handler runs);
 * inventing a key cap here would be a policy nobody ratified, and a guard whose
 * reason is a guess is a guard nobody can check. What that leaves is recorded
 * rather than hidden: per-user-per-workspace storage is bounded by that limit
 * and by nothing else.
 */
export const preferencesDocSchema = z
  .object({
    savedFilters: z.array(savedFilterSchema).max(50),
    listColumns: z.record(projectIdKey, z.array(noNul(z.string().min(1).max(64))).max(30)),
    grouping: z.record(projectIdKey, groupingSchema),
  })
  .strict();
export type PreferencesDoc = z.infer<typeof preferencesDocSchema>;

/**
 * What a user who has never saved anything reads.
 *
 * A frozen module-level constant rather than a factory: nothing mutates a
 * preferences document in place — a PUT replaces it whole — so one shared
 * instance cannot be a shared-mutable-state bug, and `Object.freeze` is what
 * keeps that from being a promise. It is also the value `getPreferences` returns
 * for a missing row, so a test comparing against it compares against the thing
 * the server actually answers.
 */
function emptyPreferences(): PreferencesDoc {
  const doc: PreferencesDoc = { savedFilters: [], listColumns: {}, grouping: {} };
  // Each container frozen as well as the document: `Object.freeze` is shallow,
  // and a caller that pushed into `EMPTY_PREFERENCES.savedFilters` would be
  // editing every future "this person has saved nothing" answer at once. Done
  // through a function with a typed local rather than a cast on a frozen
  // literal, because `Object.freeze([])` is `readonly never[]`, which is NOT
  // assignable to `SavedFilter[]` — the cast that hides that is exactly the
  // unsoundness this constant should not need.
  Object.freeze(doc.savedFilters);
  Object.freeze(doc.listColumns);
  Object.freeze(doc.grouping);
  return Object.freeze(doc);
}

export const EMPTY_PREFERENCES: PreferencesDoc = emptyPreferences();
