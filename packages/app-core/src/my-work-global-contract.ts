/**
 * The two contracts the global My work page consumes from its sibling tasks, held here
 * ONLY until they land on `release/my-work-global` (my-work-global T3).
 *
 * - `AttentionShow` is T1's (`packages/domain/src/read-models.ts`, beside
 *   `ATTENTION_SHOW_VALUES`): the opt-in `show` filter on `GET /v1/workspaces/:ws/attention`.
 * - `MyWorkPreferences` is T2's (`packages/domain/src/my-work-preferences.ts`): the
 *   user-level document behind `/v1/me/my-work-preferences`.
 *
 * Both are the plan's pinned shapes, structurally identical, so swapping this file for the
 * domain imports at the tipmerge changes no call site's meaning. It is deleted in that
 * merge; nothing outside app-core may import it.
 */
export type AttentionShow = 'created' | 'assigned' | 'ws-admin' | 'project-admin';

export type MyWorkPreferences = {
  show: AttentionShow[];
  grouping: 'workspace-project' | 'flat';
};
