import {
  projectArchivedPayload,
  projectCreatedPayload,
  projectRestoredPayload,
  projectUpdatedPayload,
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
 * **This position is 4, and it was an INSERT rather than an append.** This
 * paragraph used to read *"`proj_ticket_types` does not exist yet, so this
 * one's §8 position today is immediately after `proj_workflows`"* — true for
 * the 21 minutes between `dd7bfcfd` (18:51:28 IST, 2026-09-01) and `6cb631d0`
 * (19:12:54 IST, the commit that registered `proj_ticket_types`) and false ever
 * since, because
 * `proj_ticket_types` landed at position 3 and pushed this one down. `./index.ts`
 * carries the corrected account in its own comment on that registration
 * (*"It INSERTS above proj_projects, which had been immediately after
 * proj_workflows only because this position was empty"*); `test/projection-order.test.ts`
 * is the assertion, and it and `./index.ts` move in the same commit as any
 * position change.
 *
 * ## Determinism
 *
 * `ON CONFLICT DO NOTHING` makes a re-delivered `project.created` inert, and it
 * is first-writer-wins under BOTH orders that matter: live arrival, and the
 * canonical `(entity_kind, entity_id, seq)` replay a rebuild uses. FOUR event
 * types are read now (Task 16 added the archive pair, MCP CRUD Task 1 the update) and all are filed
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
 * ## `project.updated` is last-writer-wins on `name` and `description` alone
 *
 * MCP CRUD plan Task 1 (owner ruling M1, 2026-10-01) added the rename this
 * docblock used to promise. It folds onto the row `project.created` made, keyed
 * on `(project_id, workspace_id)`, and touches only the columns its payload
 * names: an absent `name`/`description` leaves the column alone and
 * `description: null` clears it. **A rename never moves a ticket key, entered
 * or derived.** The payload's `prefix` is not applied by this branch yet (prefix
 * history is the prefixes and groups plan Task 2), and `founding_name`, the name an UN-entered prefix is
 * derived from, is written by `project.created` and never by this branch. Until
 * 2026-10-01 the reader derived from `name`, so a rename re-keyed every ticket
 * of a project with no entered prefix (and could shift a neighbour's); the
 * reader now derives from `founding_name` (`read/visible-projects.ts`).
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
    if (event.type === 'project.updated') {
      const payload = projectUpdatedPayload.parse(event.payload);
      // COALESCE keeps an absent `name` as it was; `description` uses a separate
      // flag because `null` is a real value (clear) and must not COALESCE away.
      await tx.query(
        `UPDATE proj_projects
            SET name = COALESCE($3, name),
                description = CASE WHEN $4::boolean THEN $5 ELSE description END,
                group_id = CASE WHEN $6::boolean THEN $7 ELSE group_id END
          WHERE project_id = $1 AND workspace_id = $2`,
        [
          event.entity.id,
          event.workspaceId,
          payload.name ?? null,
          payload.description !== undefined,
          payload.description ?? null,
          // `groupId` follows `description`'s rule: `null` is a real value (UNGROUP)
          // and must not COALESCE away, so presence is its own flag. Task 6.
          payload.groupId !== undefined,
          payload.groupId ?? null,
        ],
      );
      return;
    }
    if (event.type !== 'project.created') {
      return;
    }
    const payload = projectCreatedPayload.parse(event.payload);
    await tx.query(
      `INSERT INTO proj_projects (project_id, workspace_id, name, founding_name, description, prefix, created_by, created_at)
       VALUES ($1, $2, $3, $3, $4, $5, $6, $7)
       ON CONFLICT (project_id) DO NOTHING`,
      [
        event.entity.id,
        event.workspaceId,
        // `$3` is BOTH `name` and `founding_name`: at founding they are the
        // same claim. Only `name` moves afterwards (`project.updated`); the
        // reader derives an un-entered prefix from `founding_name`, so a rename
        // never moves a key.
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
        // ⚠ MEASURED LIMITATION, and it is why this line is a DECISION rather
        // than a style. Writing `?? derivePrefix(payload.name)` here instead
        // **reddens nothing at all** — not the reads, not the door, and not
        // `tools/verify-projections`. The verifier diffs live against a rebuilt
        // shadow, and the derivation is a PURE FUNCTION, so both sides compute
        // the same value and `EXCEPT` has nothing to report: **that tool
        // constrains a column to be REPRODUCIBLE, never to be ATTRIBUTED.** So
        // the rule "the column holds only what an event said" is held by THIS
        // comment and by review, not by a gate — which is exactly the kind of
        // claim a successor should be told rather than left to infer from a
        // green suite. (See `test-cases/13-owner-requests-and-backlog.md`,
        // mutation M4.)
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
