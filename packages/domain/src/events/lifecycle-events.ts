import { z } from 'zod';
import { ISO_DATETIME_REGEX, isRealCalendarDatetime, ulidString } from '../envelope.js';

/**
 * The lifecycle vocabulary (trash series, Plan 1; spec
 * `docs/superpowers/specs/2026-09-23-trash-and-purge-design.md` §4).
 *
 * Every payload is EMPTY and `.strict()` for the reason the project archive
 * pair gives (`membership.ts`, "The payloads are EMPTY"): the item is
 * `env.entity.id`, so a payload has nothing left to name, and `.strict()` turns
 * a payload naming somebody else's item into a refusal. For `purge.marked` it
 * does one more job: the purge date is DERIVED from the mark's `server_time`
 * (`purgeDueAt`), so a client that tries to supply its own `dueAt` is refused
 * here rather than believed.
 *
 * Undelete is spelled `*.undeleted` for projects and workspaces because
 * `project.restored` / `workspace.restored` already mean UN-ARCHIVE; the ticket
 * and note pairs keep their existing `*.restored` (spec §4).
 */
export const workspaceArchivedPayload = z.object({}).strict();
export const workspaceRestoredPayload = z.object({}).strict();
export const workspaceDeletedPayload = z.object({}).strict();
export const workspaceUndeletedPayload = z.object({}).strict();
export const projectDeletedPayload = z.object({}).strict();
export const projectUndeletedPayload = z.object({}).strict();
export const purgeMarkedPayload = z.object({}).strict();
export const purgeUnmarkedPayload = z.object({}).strict();

/**
 * The tombstone (spec §5.3): the ONLY trace a purge leaves in the ledger, filed
 * against the purged item's own entity by `SYSTEM_ACTOR_PURGE`. Content-free by
 * construction — `.strict()` refuses a title, a name, a body. `markedBy`/
 * `markedAt` are copied from the item's lifecycle row (`purge_marked_by`,
 * `purge_marked_at`) inside the purge transaction, never computed.
 */
export const purgeCompletedPayload = z
  .object({
    kind: z.enum(['workspace', 'project', 'ticket', 'note']),
    markedBy: ulidString,
    markedAt: z
      .string()
      .regex(ISO_DATETIME_REGEX, 'must be ISO 8601 with at most millisecond precision')
      .refine(isRealCalendarDatetime, 'must be a real calendar datetime'),
  })
  .strict();
