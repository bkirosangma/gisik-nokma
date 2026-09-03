import type { PreferencesDoc } from '@gisik-nokma/domain';

/**
 * The preferences document's data contract — an INTERFACE and nothing else,
 * the shape `inbox/gateway.ts` already established for notifications. Plan 6's
 * web shell implements it over `GET/PUT /v1/me/preferences?workspaceId=`;
 * Plan 10's replica implements it over local storage.
 *
 * ## A WHOLE DOCUMENT, not a key — because that is what the server serves
 *
 * Plan 9's draft of this file wrote `get(key: string): Promise<unknown>` /
 * `set(key: string, value: unknown)`, and Task 13's text assumes
 * `PUT /v1/me/preferences/:key`. **That route does not exist.**
 * `apps/server/src/routes/preferences.ts` serves ONE pair of doors over the
 * whole document, and `preferencesDocSchema` is `.strict()` with all three of
 * `savedFilters`, `listColumns` and `grouping` REQUIRED — so a per-key `set`
 * cannot be implemented over it without either inventing a route or PUTting a
 * document with two keys missing, which the door refuses (`400
 * invalid_preferences`) and which, if it did not, would delete the columns and
 * the grouping the user chose.
 *
 * The consequence is stated here rather than discovered later: every write on
 * this interface is a READ-MODIFY-WRITE of the whole document, and two clients
 * arranging different halves of it at once resolve LAST-WRITE-WINS. That is
 * the behaviour the shipped route already has — a PUT replaces the row — and
 * this interface inherits it rather than papering over it. `saved-filters.ts`
 * does the read-modify-write in one place so no caller writes a document it
 * did not first read.
 *
 * ## `load` answers `unknown`; `save` takes a `PreferencesDoc`
 *
 * The asymmetry is deliberate. What comes back from the world — an HTTP body,
 * a local-storage string — is `unknown` in fact, whatever a type annotation
 * claims, and typing it `Promise<PreferencesDoc>` would put the validation
 * decision inside each implementation, where the shell and the replica are
 * free to disagree about what a corrupt document means. So the parse lives
 * once, in `saved-filters.ts`, against the domain's own
 * `preferencesDocSchema`. What goes OUT is a document this package built and
 * validated, so it is typed.
 *
 * ## Why this is not `DataSource.query.getPreferences`
 *
 * `views/use-preferences.ts` already reads and writes preferences, through
 * `DataSource`, in the CLIENT's `UserPreferences` vocabulary — and that path
 * cannot carry a saved filter faithfully, which is measured rather than
 * asserted:
 *
 *   - `online/mappers.ts` is under `src/online/`, and `test/no-http-in-views.test.ts`
 *     (case 3.35/3.47) makes importing anything from there a FAILING TEST for
 *     every module outside it — dynamic and bare side-effect spellings
 *     included. So this module structurally cannot reach the translators.
 *   - The translation is LOSSY IN BOTH DIRECTIONS for exactly this payload.
 *     `test/online/mappers.test.ts:599` measures that a stored filter carrying
 *     `blocked: true` — a term `filterSpecSchema` has and the client's
 *     `FilterSpec` has no key for — makes `mapPreferences` throw
 *     `ServingGapError` for the WHOLE document: one such filter and the
 *     person's columns and grouping fail to load too. Going the other way,
 *     `toServerFilterSpec` throws `UnexpressibleFilterError` for a two-assignee
 *     filter, because the server has one `assigneeId` slot.
 *
 * RECORDED, NOT FIXED, and not owned here: the owner is Plan 6, named already
 * by `FILTER_BLOCKED_ABSENCE` in `mappers.ts` — *"Plan 6 — the client
 * FilterSpec type (view-types.ts), not a route"*. This task consumes the
 * DOMAIN's `FilterSpec` and stores under the DOMAIN's `filterSpec` key
 * (ruling P26), so nothing it writes needs that translation.
 */
export interface PreferencesGateway {
  /** The stored document, unvalidated. Parsed by `saved-filters.ts`. */
  load(): Promise<unknown>;
  /** Replaces the whole document. Last-write-wins, as the route does. */
  save(document: PreferencesDoc): Promise<void>;
}
