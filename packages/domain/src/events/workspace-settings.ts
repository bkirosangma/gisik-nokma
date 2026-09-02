import { z } from 'zod';

export const DEFAULT_STALE_DAYS = 7;
export const DEFAULT_DUE_SOON_DAYS = 7;

/**
 * workspace.settings_set v1 — the attention strip's two knobs, claimed as an
 * attributed event like everything else (a threshold is a claim about what
 * deserves attention). Partial update: only the keys present change.
 */
export const workspaceSettingsSetPayloadSchema = z
  .object({
    staleDays: z.number().int().min(1).max(365).optional(),
    dueSoonDays: z.number().int().min(0).max(365).optional(),
  })
  .strict()
  .refine((payload) => payload.staleDays !== undefined || payload.dueSoonDays !== undefined, {
    message: 'a settings claim must set at least one setting',
  });
export type WorkspaceSettingsSetPayload = z.infer<typeof workspaceSettingsSetPayloadSchema>;

/** What the server answers after applying defaults; provenance null = never claimed. */
export type WorkspaceSettings = {
  staleDays: number;
  dueSoonDays: number;
  provenance: { actorId: string; clientTime: string; serverTime: string } | null;
};
