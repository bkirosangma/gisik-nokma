import {
  projectArchivedPayload,
  projectCreatedPayload,
  projectRestoredPayload,
} from '@gisik-nokma/domain';
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
 * canonical `(entity_kind, entity_id, seq)` replay a rebuild uses. THREE event
 * types are read now (Task 16 added the archive pair) and all three are filed
 * against the project entity, so this table's contents are still a pure
 * function of the project streams alone — there is no cross-entity write here
 * to interleave, and a project's own stream is totally ordered, so the
 * last-writer-wins UPDATE below folds identically live and on replay.
 *
 * `created_at` is the event's own `serverTime`, never a clock read at apply
 * time: a projection that read a clock would rebuild differently every run.
 *
 * ## Archive and restore fold onto the row `project.created` made
 *
 * The plan for a rename, written into this docblock before either existed, is
 * exactly the shape used here: "the row becomes last-writer-wins on that column
 * alone." An UPDATE keyed on `(project_id, workspace_id)` is a NO-OP when no row
 * exists — it writes nothing and throws nothing — and that silence is safe only
 * because both events are on the same totally-ordered stream as the
 * `project.created` that made the row, so replay cannot deliver them first. It
 * is not left to that argument: `checkProjectExists` refuses an archive naming a
 * project nobody founded at the door (`../permissions/check-permission.ts`), and
 * `test/projections/proj-projects.test.ts` drives the pair through a live apply
 * AND a rebuild and diffs the two.
 *
 * The `workspace_id` predicate is on the UPDATE as well as the INSERT. It cannot
 * matter today — `project_id` is the primary key and an entity id belongs to one
 * workspace — but a projection is the last place to leave a tenancy clause off
 * on the grounds that another invariant currently covers it.
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
    if (event.type === 'project.archived' || event.type === 'project.restored') {
      // Parsed rather than trusted, though both schemas are empty: `.strict()`
      // is what refuses a payload naming somebody else's project, and a handler
      // that skipped the parse would make that refusal reachable only from the
      // door. Projections are replayed from the ledger, where the door is not.
      (event.type === 'project.archived' ? projectArchivedPayload : projectRestoredPayload).parse(
        event.payload,
      );
      await tx.query(
        `UPDATE proj_projects SET archived = $3
          WHERE project_id = $1 AND workspace_id = $2`,
        [event.entity.id, event.workspaceId, event.type === 'project.archived'],
      );
      return;
    }
    if (event.type !== 'project.created') {
      return;
    }
    const payload = projectCreatedPayload.parse(event.payload);
    await tx.query(
      `INSERT INTO proj_projects (project_id, workspace_id, name, description, prefix, created_by, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (project_id) DO NOTHING`,
      [
        event.entity.id,
        event.workspaceId,
        payload.name,
        // `?? null`, and NULL is the right value rather than a convenience: an
        // event that never carried a description describes nothing, which is
        // the absence this column stores. `?? ''` would write the CLAIM "no
        // description" for every project founded before this field existed.
        payload.description ?? null,
        // Same `?? null`, and here it is load-bearing in a second way: this
        // branch is taken by EVERY project in the ledger today, so a `??` that
        // derived a prefix instead would put a claim in the column that no
        // event made — and, because the derivation is not what the ledger says,
        // the shadow rebuild in `tools/verify-projections.ts` would be the only
        // thing that noticed. The derivation belongs to the READER
        // (`packages/domain/src/prefix.ts`), which is where it can be applied to
        // a NULL without pretending the column said it.
        payload.prefix ?? null,
        event.actorId,
        event.serverTime,
      ],
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
