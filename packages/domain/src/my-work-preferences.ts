import { z } from 'zod';

/**
 * One person's choices on the global My work page (my-work-global plan,
 * Task 2): which arms of "Needs your attention" to show, and whether both
 * sections are grouped by workspace and project or listed flat.
 *
 * User-level, never per-workspace: the page itself spans every workspace the
 * person belongs to, so — the same reasoning `notification-preferences.ts`
 * gives for the Inbox — there is no one workspace to pin the choice to, and
 * `PreferencesDoc` (keyed `(user_id, workspace_id)`, swept per revoked
 * membership) is the wrong home for it.
 *
 * `show` values are spelled exactly as the attention route's `show` param
 * (plan Global Constraints): `created`, `assigned`, `ws-admin`,
 * `project-admin`. At least one is required — an empty filter would be a
 * page that can never show anything. The route de-duplicates before storing,
 * so `.max(4)` bounds the RAW body (five entries with a repeat are refused).
 */
export const myWorkPreferencesSchema = z
  .object({
    show: z.array(z.enum(['created', 'assigned', 'ws-admin', 'project-admin'])).min(1).max(4),
    grouping: z.enum(['workspace-project', 'flat']),
  })
  .strict();
export type MyWorkPreferences = z.infer<typeof myWorkPreferencesSchema>;

/**
 * What a person who has never saved a choice reads: created by me and
 * assigned to me, grouped by workspace and project (spec D1/D2).
 *
 * Frozen, `show` included, for the reason `EMPTY_NOTIFICATION_PREFERENCES`
 * states: the store hands this one instance to every caller with no row, so a
 * caller that pushed into `show` would edit every later default at once.
 */
function defaultMyWorkPreferences(): MyWorkPreferences {
  const doc: MyWorkPreferences = { show: ['created', 'assigned'], grouping: 'workspace-project' };
  Object.freeze(doc.show);
  return Object.freeze(doc);
}

export const DEFAULT_MY_WORK_PREFERENCES: MyWorkPreferences = defaultMyWorkPreferences();
