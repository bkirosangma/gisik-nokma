import {
  projectDeletedPayload,
  projectUndeletedPayload,
  purgeMarkedPayload,
  purgeUnmarkedPayload,
  workspaceArchivedPayload,
  workspaceDeletedPayload,
  workspaceRestoredPayload,
  workspaceUndeletedPayload,
} from '@gisik-nokma/domain';
import type { Projection } from './registry.js';

const PURGE_TABLE = {
  workspace: ['proj_workspaces', 'workspace_id'],
  project: ['proj_projects', 'project_id'],
  ticket: ['proj_tickets', 'ticket_id'],
  note: ['proj_notes', 'note_id'],
} as const;

/**
 * The lifecycle fold (trash series, Plan 1). Registered AFTER `notesProjection`
 * so every row a mark can name already exists. Writes `server_time`, never
 * `now()`: a rebuild must reproduce the live row (19.015).
 *
 * `tables` lists only `proj_workspaces` — the one table this projection
 * exclusively owns and the only one it must reset. The lifecycle columns it
 * also writes on `proj_projects`, `proj_tickets` and `proj_notes` are covered
 * by verify-projections through THOSE tables' own owning projections
 * (`projProjects.tables`, `ticketsProjection.tables`, `notesProjection.tables`):
 * the verifier's shadow rebuild replays every registered projection into the
 * SAME shadow schema before diffing, so this projection's writes onto those
 * tables land in the shadow copy those other projections' `tables` entries
 * already diff (19.015's hand-write controls are the witness).
 */
export const lifecycleProjection: Projection = {
  name: 'proj_lifecycle',
  tables: ['proj_workspaces'],
  async apply(event, tx) {
    const at = event.serverTime;
    switch (event.type) {
      case 'workspace.archived':
      case 'workspace.restored':
        (event.type === 'workspace.archived' ? workspaceArchivedPayload : workspaceRestoredPayload).parse(
          event.payload,
        );
        await tx.query(
          `INSERT INTO proj_workspaces (workspace_id, archived) VALUES ($1, $2)
           ON CONFLICT (workspace_id) DO UPDATE SET archived = EXCLUDED.archived`,
          [event.entity.id, event.type === 'workspace.archived'],
        );
        return;
      case 'workspace.deleted':
      case 'workspace.undeleted': {
        (event.type === 'workspace.deleted' ? workspaceDeletedPayload : workspaceUndeletedPayload).parse(
          event.payload,
        );
        const del = event.type === 'workspace.deleted';
        await tx.query(
          `INSERT INTO proj_workspaces (workspace_id, deleted_at, deleted_by) VALUES ($1, $2, $3)
           ON CONFLICT (workspace_id) DO UPDATE SET deleted_at = EXCLUDED.deleted_at, deleted_by = EXCLUDED.deleted_by`,
          [event.entity.id, del ? at : null, del ? event.actorId : null],
        );
        return;
      }
      case 'project.deleted':
      case 'project.undeleted': {
        (event.type === 'project.deleted' ? projectDeletedPayload : projectUndeletedPayload).parse(event.payload);
        const del = event.type === 'project.deleted';
        await tx.query(
          `UPDATE proj_projects SET deleted_at = $3, deleted_by = $4 WHERE project_id = $1 AND workspace_id = $2`,
          [event.entity.id, event.workspaceId, del ? at : null, del ? event.actorId : null],
        );
        return;
      }
      case 'purge.marked':
      case 'purge.unmarked': {
        (event.type === 'purge.marked' ? purgeMarkedPayload : purgeUnmarkedPayload).parse(event.payload);
        const kind = event.entity.kind as keyof typeof PURGE_TABLE;
        const [table, key] = PURGE_TABLE[kind];
        const mark = event.type === 'purge.marked';
        if (kind === 'workspace') {
          await tx.query(
            `INSERT INTO proj_workspaces (workspace_id, purge_marked_at, purge_marked_by) VALUES ($1, $2, $3)
             ON CONFLICT (workspace_id) DO UPDATE SET purge_marked_at = EXCLUDED.purge_marked_at, purge_marked_by = EXCLUDED.purge_marked_by`,
            [event.entity.id, mark ? at : null, mark ? event.actorId : null],
          );
        } else {
          await tx.query(`UPDATE ${table} SET purge_marked_at = $2, purge_marked_by = $3 WHERE ${key} = $1`, [
            event.entity.id,
            mark ? at : null,
            mark ? event.actorId : null,
          ]);
        }
        return;
      }
      default:
        return;
    }
  },
  async reset(tx) {
    await tx.query('TRUNCATE proj_workspaces');
  },
};
