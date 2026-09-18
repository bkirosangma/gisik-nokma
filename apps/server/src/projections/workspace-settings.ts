import type { PoolClient } from 'pg';
import {
  DEFAULT_AUTO_CLOSE_AFTER_DAYS,
  DEFAULT_DUE_SOON_DAYS,
  DEFAULT_STALE_DAYS,
  workspaceSettingsSetPayloadSchema,
  type LedgerEvent,
  type WorkspaceSettings,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { Projection } from './registry.js';

/**
 * The attention strip's two thresholds, per workspace, with the last claim's
 * provenance kept.
 *
 * ## Determinism
 *
 * Every column derives from the event alone: the two knobs from its payload,
 * the actor from `event.actorId`, and both clocks from the envelope's STORED
 * `clientTime` / `serverTime` — never a clock read here, which the registry
 * contract forbids and which would make every rebuild disagree with live.
 *
 * ## Why blind last-writer-wins is safe here
 *
 * *A projection handler may only write keys its own entity totally orders*
 * (coordination doc, 2026-08-31). This table's key is the workspace id, and
 * `workspace.settings_set` is registered with `entityKind: 'workspace'`
 * (packages/domain/src/vocabulary.ts) and filed against that same workspace, so
 * the key and the writing entity are the SAME entity. There is exactly one
 * totally-ordered writer per key, `readLedger`'s canonical
 * (entity_kind, entity_id, seq) order is that writer's own claim order, and
 * per-entity causality — the only causality replay guarantees — is enough.
 * No position guard is needed, and adding one would be guarding against an
 * interleaving that cannot occur.
 *
 * ## The COALESCE is the partial-update semantics, not defensiveness
 *
 * The payload sets either knob or both (`workspaceSettingsSetPayloadSchema`
 * refuses the empty claim). A claim that names only `staleDays` must leave
 * `dueSoonDays` exactly as the previous claim left it, so the absent key binds
 * as NULL and `COALESCE(EXCLUDED.x, existing.x)` keeps the prior value.
 * `EXCLUDED.x` alone would turn every partial update into a silent reset of the
 * other knob back to its default.
 *
 * Provenance, by contrast, is replaced WHOLE on every claim: it describes who
 * last changed the settings, which is a fact about the row rather than about
 * either key.
 *
 * ## `auto_close_after_days` is a CASE, NOT a COALESCE, and that is the point
 *
 * Second wave, Task 6 (spec §8). The two thresholds above can use `COALESCE`
 * because their schema has no `null` case, so an absent key and a NULL bind are
 * the same thing. `autoCloseAfterDays` is `.nullable().optional()` and the two
 * states it can be in are DIFFERENT claims:
 *
 * - `undefined` — "this claim does not mention auto-close" → leave the column.
 * - `null`      — "turn auto-close OFF"               → write NULL.
 *
 * `COALESCE(EXCLUDED.auto_close_after_days, existing.auto_close_after_days)`
 * CANNOT TELL THOSE APART. The explicit `null` binds as NULL, the COALESCE falls
 * through to the stored value, and a claim that turns auto-close off is
 * **silently ignored** — accepted by the door, committed to the ledger, its
 * provenance even updated, and with no effect on the setting. That is the exact
 * failure this column's shape exists to prevent, and it is why the write is:
 *
 *     auto_close_after_days = CASE WHEN $7 THEN $8 ELSE <existing> END
 *
 * where `$7` is `payload.autoCloseAfterDays !== undefined` — a PRESENCE boolean,
 * computed from the parsed payload, which is the only place the
 * present-versus-null distinction still exists by the time SQL sees it. Zod
 * preserves it (`.optional()` would otherwise erase it at parse time); this
 * parameter is what carries it the rest of the way.
 *
 * The regression proof lives in `test/projections/workspace-settings.test.ts`
 * (case 13.714): swapping this CASE for a COALESCE must redden the
 * clear-to-null case and nothing else. If that case passes under a COALESCE it
 * is not testing what it claims.
 *
 * On INSERT there is no prior value to preserve, so the column takes
 * `payload.autoCloseAfterDays ?? null` directly — and NULL on a fresh row is the
 * correct default (`DEFAULT_AUTO_CLOSE_AFTER_DAYS`), so a first claim that does
 * not mention auto-close leaves the workspace off, exactly as if no row existed.
 *
 * ## Unqualified table names
 *
 * `proj_workspace_settings`, never `public.proj_workspace_settings`:
 * tools/verify-projections.ts fences its rebuild inside a shadow schema with
 * `search_path` ALONE, so a schema-qualified name escapes the fence and writes
 * LIVE during a verify.
 */
export const workspaceSettingsProjection: Projection = {
  name: 'proj_workspace_settings',
  tables: ['proj_workspace_settings'],

  async apply(event: LedgerEvent, tx: PoolClient): Promise<void> {
    if (event.type !== 'workspace.settings_set') {
      return;
    }
    const payload = workspaceSettingsSetPayloadSchema.parse(event.payload);
    // PRESENT, not non-null: this boolean is the whole present-versus-null
    // distinction, and it is computed from the parsed payload because `null` and
    // `undefined` are still different values there. Bound as `$7` below and used
    // as the CASE guard — see the docblock.
    const autoClosePresent = payload.autoCloseAfterDays !== undefined;
    await tx.query(
      `INSERT INTO proj_workspace_settings
         (workspace_id, stale_days, due_soon_days, set_by, set_client_time, set_server_time,
          auto_close_after_days)
       VALUES ($1, $2, $3, $4, $5, $6, $8)
       ON CONFLICT (workspace_id) DO UPDATE SET
         stale_days = COALESCE(EXCLUDED.stale_days, proj_workspace_settings.stale_days),
         due_soon_days = COALESCE(EXCLUDED.due_soon_days, proj_workspace_settings.due_soon_days),
         auto_close_after_days = CASE WHEN $7 THEN $8 ELSE proj_workspace_settings.auto_close_after_days END,
         set_by = EXCLUDED.set_by,
         set_client_time = EXCLUDED.set_client_time,
         set_server_time = EXCLUDED.set_server_time`,
      [
        event.workspaceId,
        payload.staleDays ?? null,
        payload.dueSoonDays ?? null,
        event.actorId,
        // The envelope's ISO-8601 `Z` strings go straight into the timestamptz
        // columns, exactly as `insertEvent` writes the ledger's own two clocks
        // and as `proj_contested` writes `contested_at`. The plan text converted
        // to `Date` first, reasoning that a string would be an implicit
        // text→timestamptz cast; a bind parameter is not a cast, both forms
        // store the same instant, and shipped shape wins over plan text
        // (coordination §10). `test/helpers/ledger.ts` already ruled the same
        // way for the ledger.
        event.clientTime,
        event.serverTime,
        // $7 = PRESENT (`null` counts as present); $8 = the value, which is
        // NULL for both "off" and "not mentioned" — the CASE is what tells them
        // apart, and `$7` is what it consults. On INSERT there is nothing to
        // preserve, so `$8` alone is right and a fresh row with no mention of
        // auto-close stores NULL, which IS the default.
        autoClosePresent,
        payload.autoCloseAfterDays ?? null,
      ],
    );
  },

  async reset(tx: PoolClient): Promise<void> {
    await tx.query('DELETE FROM proj_workspace_settings');
  },
};

/**
 * What the server answers for a workspace's thresholds: the claims that were
 * made, and the defaults for the ones that were not.
 *
 * The defaults live HERE rather than in the table because a default is not a
 * claim — there is nobody to attribute it to. `provenance: null` is the honest
 * answer for a workspace nobody has configured, and it is what lets a client
 * say "using the default" instead of naming a person who never chose it.
 *
 * `?? DEFAULT` and never `|| DEFAULT`: `dueSoonDays: 0` is a legal claim (the
 * schema's `min(0)`), and a falsiness check would answer 7 to somebody who
 * explicitly said "nothing is due soon until it is due".
 */
export async function getWorkspaceSettings(
  db: Queryable,
  workspaceId: string,
): Promise<WorkspaceSettings> {
  const { rows } = await db.query(
    `SELECT stale_days, due_soon_days, auto_close_after_days, set_by, set_client_time, set_server_time
       FROM proj_workspace_settings WHERE workspace_id = $1`,
    [workspaceId],
  );
  const row = rows[0] as
    | {
        stale_days: number | null;
        due_soon_days: number | null;
        auto_close_after_days: number | null;
        set_by: string;
        set_client_time: Date;
        set_server_time: Date;
      }
    | undefined;
  if (row === undefined) {
    return {
      staleDays: DEFAULT_STALE_DAYS,
      dueSoonDays: DEFAULT_DUE_SOON_DAYS,
      autoCloseAfterDays: DEFAULT_AUTO_CLOSE_AFTER_DAYS,
      provenance: null,
    };
  }
  return {
    staleDays: row.stale_days ?? DEFAULT_STALE_DAYS,
    dueSoonDays: row.due_soon_days ?? DEFAULT_DUE_SOON_DAYS,
    // `?? DEFAULT` for the same reason as the two above, and here it is worth
    // naming because the default IS null: `row.auto_close_after_days` is NULL
    // both for "explicitly off" and for "never mentioned", and BOTH read as
    // `null` — which is correct, because the reader's answer is "auto-close is
    // off", and `provenance` is what distinguishes whether anyone chose it. There
    // is deliberately no `?? 0` or sentinel: off is null on the wire and in the
    // domain type, and inventing a second spelling here would put the sweep and
    // the settings form on different vocabularies.
    autoCloseAfterDays: row.auto_close_after_days ?? DEFAULT_AUTO_CLOSE_AFTER_DAYS,
    provenance: {
      actorId: row.set_by,
      // Both clocks are timestamptz, so both arrive as Date and both leave as
      // ISO 8601 Z — the same normalisation Plan 1's `rowToEnvelope` applies.
      clientTime: row.set_client_time.toISOString(),
      serverTime: row.set_server_time.toISOString(),
    },
  };
}
