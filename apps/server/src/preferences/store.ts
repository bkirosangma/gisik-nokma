import {
  EMPTY_PREFERENCES,
  preferencesDocSchema,
  type PreferencesDoc,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';

/**
 * One person's view preferences in one workspace, or the empty document.
 *
 * ## "Never set" and "set to empty" are ONE answer, deliberately
 *
 * A missing row answers `EMPTY_PREFERENCES` and the return type has no `null`
 * arm and no `unset` discriminator, so no caller can tell the two apart. That is
 * a decision, and it is the OPPOSITE of the one `projections/workspace-settings.ts`
 * made one task earlier: there, "never claimed" and "claimed 7" are different
 * answers with different provenance, because a threshold is somebody's claim and
 * the product must be able to say whose. Here there is nobody to attribute
 * anything to and no behaviour that differs — an empty document and an absent
 * one render the same list — so a distinction between them would be one no
 * screen could show and no user could act on.
 *
 * ## The stored document is re-validated on the way OUT
 *
 * Only `putPreferences` writes this table and it stores nothing that failed
 * `preferencesDocSchema`, so this parse can fail only after a schema TIGHTENING
 * — the day a future version of the document refuses something an older client
 * legitimately saved. It still parses, and it still throws, because the
 * alternatives are worse: answering `EMPTY_PREFERENCES` would silently discard
 * somebody's saved filters, and answering the raw row would hand a client a
 * shape its types say is impossible. A throw becomes the app's fixed
 * `INTERNAL_ERROR_BODY` (5xx, no internals), which is loud, honest, and
 * recoverable — a PUT replaces the unreadable document.
 *
 * **RECORDED, NOT FIXED:** that day there is no migration path, and the affected
 * user's preferences read as a 500 until they save again. The owner is whoever
 * next changes `preferencesDocSchema`; `preferences.test.ts` 7.132 executes the
 * behaviour so the cost is visible rather than discovered.
 */
export async function getPreferences(
  db: Queryable,
  userId: string,
  workspaceId: string,
): Promise<PreferencesDoc> {
  const { rows } = await db.query<{ doc: unknown }>(
    'SELECT doc FROM user_preferences WHERE user_id = $1 AND workspace_id = $2',
    [userId, workspaceId],
  );
  const row = rows[0];
  if (row === undefined) return EMPTY_PREFERENCES;
  return preferencesDocSchema.parse(row.doc);
}

/**
 * Replaces one person's document in one workspace, whole.
 *
 * FULL REPLACE and not a merge — pinned by the plan, and right for a reason
 * worth stating: a merge cannot express a DELETION. If a PUT merged, a person
 * could add a saved filter but never remove one, and un-hiding a column would be
 * impossible to say. The document is small and owned end-to-end by one person,
 * so sending all of it is cheap and unambiguous.
 *
 * Last-writer-wins between that person's own devices is therefore the whole
 * concurrency story: there is exactly ONE writer per key, because the key's
 * `user_id` comes from the session and no parameter can name another. That is
 * the same argument `proj_workspace_settings` makes for its blind upsert, and
 * here it is even narrower — one person rather than one workspace's event
 * stream.
 *
 * `doc` is passed as `JSON.stringify(doc)` rather than the object: node-postgres
 * would serialise it anyway, and being explicit is what makes the parameter's
 * type obvious at the call site. The value has already passed
 * `preferencesDocSchema`, whose NUL refusal is what keeps this INSERT from
 * raising SQLSTATE 22P05 — jsonb cannot carry U+0000 in a key or a value
 * (measured), so the door refuses it as a 400 and this statement never sees one.
 */
export async function putPreferences(
  db: Queryable,
  userId: string,
  workspaceId: string,
  doc: PreferencesDoc,
): Promise<void> {
  await db.query(
    `INSERT INTO user_preferences (user_id, workspace_id, doc, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (user_id, workspace_id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
    [userId, workspaceId, JSON.stringify(doc)],
  );
}
