import { projectCreatedPayload } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { Projection } from './registry.js';

/**
 * Which projects were actually founded (Plan 4 Task 9 Step 3b; owner decision
 * 2026-08-26, coordination doc).
 *
 * ## Why a whole table for one boolean
 *
 * `project.created` was a registered event type that nothing projected
 * anywhere, so nothing in the series could answer "does this project exist".
 * The check that LOOKED like it covered the gap is the project-membership check
 * on `ticket.created`: nobody is a member of a project that does not exist. But
 * `ctx.eff.projects` is built from `project.member_added`, and that event
 * accepts any ULID as a project scope without validating it either — so the
 * coincidence fails on exactly the path the hole is reachable through (grant
 * yourself membership on a typo'd id, then create the ticket), and on the paths
 * where the coincidence held, the person was told something false.
 *
 * ## Registration position
 *
 * §8 pins `proj_entity_heads, proj_workflows, proj_ticket_types, proj_projects,
 * proj_tickets, proj_rollups, proj_memberships, proj_visibility, proj_contested`.
 * `proj_ticket_types` does not exist yet, so this one's §8 position today is
 * immediately after `proj_workflows` — an INSERT, not an append. See
 * `./index.ts` and `test/projection-order.test.ts`, both of which must move in
 * the same commit.
 *
 * ## Determinism
 *
 * `ON CONFLICT DO NOTHING` makes a re-delivered `project.created` inert, and it
 * is first-writer-wins under BOTH orders that matter: live arrival, and the
 * canonical `(entity_kind, entity_id, seq)` replay a rebuild uses. Only one
 * event type is read and it is filed against the project entity, so this
 * table's contents are a pure function of the project streams alone — there is
 * no cross-entity write here to interleave.
 *
 * `created_at` is the event's own `serverTime`, never a clock read at apply
 * time: a projection that read a clock would rebuild differently every run.
 *
 * ## No `project.renamed` handler, because no such event is registered
 *
 * `name` is therefore whatever the founding claim said, permanently. When a
 * rename event is added it lands here, and the row becomes last-writer-wins on
 * that column alone.
 */
export const projProjects: Projection = {
  name: 'proj_projects',
  tables: ['proj_projects'],

  async apply(event, tx) {
    if (event.type !== 'project.created') {
      return;
    }
    const payload = projectCreatedPayload.parse(event.payload);
    await tx.query(
      `INSERT INTO proj_projects (project_id, workspace_id, name, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (project_id) DO NOTHING`,
      [event.entity.id, event.workspaceId, payload.name, event.actorId, event.serverTime],
    );
  },

  async reset(tx) {
    await tx.query('DELETE FROM proj_projects');
  },
};

/**
 * Was this project founded IN THIS WORKSPACE?
 *
 * The workspace clause is the whole difference between a question and an
 * oracle. A project id is a ULID and ULIDs are guessable-adjacent — they carry
 * a timestamp prefix — so an unscoped `SELECT 1 FROM proj_projects WHERE
 * project_id = $1` would let anyone holding one workspace confirm the existence
 * of a project in another. Scoped, a real id asked under the wrong workspace is
 * simply not found, which is the same answer as a fabricated one.
 */
export async function projectExists(
  db: Queryable,
  workspaceId: string,
  projectId: string,
): Promise<boolean> {
  const { rows } = await db.query(
    'SELECT 1 FROM proj_projects WHERE project_id = $1 AND workspace_id = $2',
    [projectId, workspaceId],
  );
  return rows.length > 0;
}
