import { z } from 'zod';

export const DEFAULT_STALE_DAYS = 7;
export const DEFAULT_DUE_SOON_DAYS = 7;

/**
 * Auto-close is OFF until somebody turns it on (second wave, spec §8). Unlike
 * the two thresholds above, this default is `null` rather than a number — the
 * feature's *absence* is the shipped behaviour, and the sweep reads this to
 * decide whether a workspace is in scope at all. `null` is a legal CLAIM as
 * well as the default (see the schema below), so the reading "nobody chose" and
 * the reading "somebody chose off" are the same value in the reader's answer;
 * the `provenance` beside it is what tells those apart, exactly as it does for
 * the two thresholds.
 */
export const DEFAULT_AUTO_CLOSE_AFTER_DAYS: number | null = null;

/**
 * workspace.settings_set v1 — the attention strip's two knobs and the auto-close
 * window, claimed as an attributed event like everything else (a threshold is a
 * claim about what deserves attention). Partial update: only the keys present
 * change.
 *
 * ## `null` and `undefined` are different, and that is load-bearing
 *
 * `autoCloseAfterDays` is `.nullable().optional()` — and unlike the two above it,
 * the `null` case is a REAL claim rather than a corner of the range:
 *
 * - `undefined` = "this claim does not mention auto-close" → leave it alone.
 * - `null` = "turn auto-close OFF" → write the off state.
 *
 * Every other knob has no such pair, which is why the projection can write them
 * with `COALESCE` and cannot do the same here: `COALESCE(EXCLUDED.x, existing.x)`
 * cannot tell "set to null" from "not set", so a claim that turns auto-close off
 * would be silently ignored. The projection therefore writes this column with a
 * `CASE` guarded by a presence boolean
 * (`apps/server/src/projections/workspace-settings.ts`). **Zod is what makes the
 * two distinguishable at all** — `.optional()` alone would erase the difference
 * at parse time, and the projection would have nothing to test.
 *
 * `0` is refused rather than accepted as a second spelling of "off": the range is
 * `1..365` and `null` is the only off, so there is exactly one way to say each
 * thing. A `0` that meant off would make the CASE's `$n` bind `0` and the row
 * hold a number that the sweep has to special-case.
 */
export const workspaceSettingsSetPayloadSchema = z
  .object({
    staleDays: z.number().int().min(1).max(365).optional(),
    dueSoonDays: z.number().int().min(0).max(365).optional(),
    autoCloseAfterDays: z.number().int().min(1).max(365).nullable().optional(),
  })
  .strict()
  .refine(
    (payload) =>
      payload.staleDays !== undefined ||
      payload.dueSoonDays !== undefined ||
      payload.autoCloseAfterDays !== undefined,
    {
      message: 'a settings claim must set at least one setting',
    },
  );
export type WorkspaceSettingsSetPayload = z.infer<typeof workspaceSettingsSetPayloadSchema>;

/** What the server answers after applying defaults; provenance null = never claimed. */
export type WorkspaceSettings = {
  staleDays: number;
  dueSoonDays: number;
  /** Days after which the sweep closes a terminal ticket; `null` = auto-close off. */
  autoCloseAfterDays: number | null;
  provenance: { actorId: string; clientTime: string; serverTime: string } | null;
};
