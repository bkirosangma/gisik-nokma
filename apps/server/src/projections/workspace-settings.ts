import type { PoolClient } from 'pg';
import {
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
    await tx.query(
      `INSERT INTO proj_workspace_settings
         (workspace_id, stale_days, due_soon_days, set_by, set_client_time, set_server_time)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (workspace_id) DO UPDATE SET
         stale_days = COALESCE(EXCLUDED.stale_days, proj_workspace_settings.stale_days),
         due_soon_days = COALESCE(EXCLUDED.due_soon_days, proj_workspace_settings.due_soon_days),
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
    `SELECT stale_days, due_soon_days, set_by, set_client_time, set_server_time
       FROM proj_workspace_settings WHERE workspace_id = $1`,
    [workspaceId],
  );
  const row = rows[0] as
    | {
        stale_days: number | null;
        due_soon_days: number | null;
        set_by: string;
        set_client_time: Date;
        set_server_time: Date;
      }
    | undefined;
  if (row === undefined) {
    return {
      staleDays: DEFAULT_STALE_DAYS,
      dueSoonDays: DEFAULT_DUE_SOON_DAYS,
      provenance: null,
    };
  }
  return {
    staleDays: row.stale_days ?? DEFAULT_STALE_DAYS,
    dueSoonDays: row.due_soon_days ?? DEFAULT_DUE_SOON_DAYS,
    provenance: {
      actorId: row.set_by,
      // Both clocks are timestamptz, so both arrive as Date and both leave as
      // ISO 8601 Z — the same normalisation Plan 1's `rowToEnvelope` applies.
      clientTime: row.set_client_time.toISOString(),
      serverTime: row.set_server_time.toISOString(),
    },
  };
}
