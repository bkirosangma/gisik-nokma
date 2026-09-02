-- Up Migration

-- Projection: the attention strip's two thresholds per workspace, and who
-- claimed them (Plan 5 Task 4). Rebuildable from `workspace.settings_set` and
-- nothing else; never authored.
--
-- One row per workspace, and the row exists only once somebody has CLAIMED a
-- threshold. The defaults (`DEFAULT_STALE_DAYS`, `DEFAULT_DUE_SOON_DAYS` in
-- packages/domain) are deliberately NOT written here as row defaults: a default
-- is not a claim, so there would be nobody to attribute it to, and
-- `set_by`/`set_client_time`/`set_server_time` are NOT NULL precisely because a
-- row in this table means "a person said so". `getWorkspaceSettings` supplies
-- the defaults at read time and answers `provenance: null` when no row exists.
--
-- Both threshold columns are NULLable for the same reason and a different one:
-- the payload is a PARTIAL update, so a claim may set one knob and say nothing
-- about the other. NULL here means "never claimed", which the reader turns back
-- into the default — a stored default would be indistinguishable from a
-- deliberate claim of 7.
--
-- `workspace.settings_set` is filed against the WORKSPACE entity
-- (packages/domain/src/vocabulary.ts), and this table's key IS that workspace,
-- so every key has exactly one totally-ordered writer — its own entity's
-- stream. That is what makes blind last-writer-wins safe under canonical replay
-- order (entity_kind, entity_id, seq) as well as under live arrival order.
--
-- Both provenance clocks are timestamptz — absolute instants (owner decision
-- 2026-08-20, "time is Asia/Kolkata"), matching `events.client_time` /
-- `events.server_time` and `proj_contested.contested_at`. `set_client_time` was
-- drafted as text back when the ledger's own `client_time` was text; that
-- storage is gone, and a lone text clock here would be the last place a
-- comparison needed a cast.
--
-- Every column type has an equality operator (text, integer, timestamptz),
-- which tools/verify-projections.ts requires: it diffs the shadow rebuild
-- against live with EXCEPT. `json` would not have qualified; nothing here needs
-- it.

CREATE TABLE proj_workspace_settings (
  workspace_id    text PRIMARY KEY,
  stale_days      integer,
  due_soon_days   integer,
  set_by          text NOT NULL,
  set_client_time timestamptz NOT NULL,
  set_server_time timestamptz NOT NULL
);

COMMENT ON TABLE proj_workspace_settings IS 'Projection: the attention thresholds each workspace has CLAIMED, with the last claim''s provenance. Rebuildable from workspace.settings_set; never authored. A missing row means nobody has claimed anything, not that the defaults were chosen.';

COMMENT ON COLUMN proj_workspace_settings.stale_days IS 'NULL means never claimed — the reader answers DEFAULT_STALE_DAYS. Storing the default instead would make "nobody said" indistinguishable from "somebody said 7".';
COMMENT ON COLUMN proj_workspace_settings.due_soon_days IS 'NULL means never claimed — the reader answers DEFAULT_DUE_SOON_DAYS. 0 is a legal claim (the schema allows min 0), so the reader must coalesce on NULL and not on falsiness.';
COMMENT ON COLUMN proj_workspace_settings.set_by IS 'The actor of the LAST settings claim, whichever knob it touched. Provenance follows the row, not the key: the strip attributes the settings to whoever last changed them.';
COMMENT ON COLUMN proj_workspace_settings.set_client_time IS 'The last claim''s client_time — the moment the claim was MADE, as the submitting device stated it. A stored field of the event, not a clock read at apply time, so a rebuild derives the same value.';
COMMENT ON COLUMN proj_workspace_settings.set_server_time IS 'The last claim''s server_time — the moment it was RECEIVED. Kept beside the claimed instant rather than replacing it: the two are independent facts.';

-- Down Migration

DROP TABLE proj_workspace_settings;
