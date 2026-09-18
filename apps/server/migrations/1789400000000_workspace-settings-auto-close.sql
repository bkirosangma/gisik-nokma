-- Up Migration

-- Backlog/closed second wave, spec §8 (2026-09-18): the third
-- `workspace.settings_set` knob, `autoCloseAfterDays`, projected from the claim
-- payload. NULL means the workspace has NOT turned auto-close on — which is the
-- default for every existing row, since no claim could have named this field
-- before this migration.
--
-- NULL is a MEANING here, not an absence: the schema accepts `null` as an
-- explicit "off" claim (`z.number().int().min(1).max(365).nullable().optional()`,
-- `packages/domain/src/events/workspace-settings.ts`). That is the whole reason
-- the projection writes a CASE rather than a COALESCE — see the comment on
-- `apps/server/src/projections/workspace-settings.ts`, which is where the
-- distinction is load-bearing.
ALTER TABLE proj_workspace_settings
  ADD COLUMN auto_close_after_days integer NULL;

COMMENT ON COLUMN proj_workspace_settings.auto_close_after_days IS 'Days a ticket may sit in a terminal state before the auto-close sweep closes it (second wave, spec §8), or NULL when auto-close is off for this workspace. NULL is a CLAIM ("off") as well as the pre-configuration default, which is why the projection distinguishes "the claim named this field" from "it did not" with a CASE instead of COALESCE.';

-- Down Migration

ALTER TABLE proj_workspace_settings
  DROP COLUMN auto_close_after_days;
