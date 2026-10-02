import {
  groupCreatedPayload,
  groupDeletedPayload,
  groupRenamedPayload,
  groupReorderedPayload,
} from '@gisik-nokma/domain';
import type { Projection } from './registry.js';

/**
 * The project-group tree (prefixes and groups plan Task 6, spec R3/R4/R7).
 *
 * One row per LIVE group, a pure function of the four `group.*` events: created
 * INSERTs, renamed and reordered UPDATE one column, deleted DELETEs the row.
 * `group_id` on `proj_projects` is written by `proj-projects.ts` from
 * `project.updated {groupId}`, not here — that event is filed against the
 * project's stream.
 *
 * Every payload is PARSED rather than trusted, as in `proj-projects.ts`:
 * projections replay from the ledger, where the door is not in the way.
 *
 * **The tree rules are the door's, not this file's.** `checkGroupRules` refuses a
 * wrong level, a missing parent, a taken sibling name and a delete while in use
 * BEFORE an event commits, so a replay of a committed ledger never meets those
 * states. The unique index `proj_groups_sibling_name` is the backstop the other
 * way round: a projection that applied two sibling-equal names would throw and
 * roll the whole ingest transaction back rather than store a tree the door
 * would have refused.
 *
 * `created_at` is the event's own `serverTime`, never a clock read at apply time.
 */
export const projGroups: Projection = {
  name: 'proj_groups',
  tables: ['proj_groups'],

  async apply(event, tx) {
    switch (event.type) {
      case 'group.created': {
        const payload = groupCreatedPayload.parse(event.payload);
        await tx.query(
          `INSERT INTO proj_groups (group_id, workspace_id, parent_id, level, name, rank, created_by, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (group_id) DO NOTHING`,
          [
            event.entity.id,
            event.workspaceId,
            payload.parentId,
            payload.level,
            payload.name,
            payload.rank,
            event.actorId,
            event.serverTime,
          ],
        );
        return;
      }
      case 'group.renamed': {
        const payload = groupRenamedPayload.parse(event.payload);
        await tx.query(
          'UPDATE proj_groups SET name = $3 WHERE group_id = $1 AND workspace_id = $2',
          [event.entity.id, event.workspaceId, payload.name],
        );
        return;
      }
      case 'group.reordered': {
        const payload = groupReorderedPayload.parse(event.payload);
        await tx.query(
          'UPDATE proj_groups SET rank = $3 WHERE group_id = $1 AND workspace_id = $2',
          [event.entity.id, event.workspaceId, payload.rank],
        );
        return;
      }
      case 'group.deleted': {
        groupDeletedPayload.parse(event.payload);
        await tx.query('DELETE FROM proj_groups WHERE group_id = $1 AND workspace_id = $2', [
          event.entity.id,
          event.workspaceId,
        ]);
        return;
      }
      default:
        return;
    }
  },

  async reset(tx) {
    await tx.query('DELETE FROM proj_groups');
  },
};
