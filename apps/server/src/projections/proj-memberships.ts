import {
  membershipGrantedPayload,
  membershipRevokedPayload,
  projectMemberAddedPayload,
  projectMemberRemovedPayload,
} from '@gisik-nokma/domain';
import type { Projection } from './registry.js';

/**
 * Projects the membership and project-roster vocabulary (Plan 4 Task 3) into
 * `proj_memberships`: one row per membership identity — a user's workspace-scope
 * role, plus a row for every project they are on.
 *
 * ## Two event streams write this table, and they may not reach across
 *
 * `membership.granted` / `membership.revoked` are filed against the MEMBERSHIP
 * entity (`{kind:'membership', id: membershipId(workspaceId, userId)}`).
 * `project.member_added` / `project.member_removed` are filed against the
 * PROJECT entity — they are the project's roster history (vocabulary.ts).
 *
 * That is two different entities, so the registry contract's second clause
 * binds hard here: "Table contents must be a pure function of the ledger's rows
 * — never of cross-entity arrival interleaving. Replay delivers canonical order
 * (entity_kind, entity_id, seq): per-entity causality only." `readLedger`
 * orders by `(entity_kind, entity_id, seq)` and `'membership' < 'project'`, so
 * on a rebuild EVERY membership event of a workspace is applied before ANY
 * roster event of it, whatever order they actually arrived in.
 *
 * The consequence is concrete. Plan 4 Task 4's plan text has
 * `membership.revoked` delete "every row for that user, project rows included".
 * Take the arrival sequence grant(u) -> member_added(u, P) -> revoked(u):
 *
 *   live    grant writes the workspace row, member_added writes the project
 *           row, revoked deletes both        -> {}
 *   replay  grant then revoked (membership entity first) leave nothing, then
 *           member_added writes the project row -> { project row }
 *
 * A set difference, which is exactly what `verify-projections`' EXCEPT diff
 * reports as drift — and a `rebuildProjection` run would "repair" the live
 * table into the wrong one. So the cross-entity delete is not implemented.
 *
 * What IS implemented is disjoint key ownership, which is commutative by
 * construction: the key `(ws, u, 'workspace', '')` is written only by the
 * membership entity stream `ws:u`, and the key `(ws, u, 'project', P)` only by
 * the project entity stream `P`. Every key has exactly one totally-ordered
 * writer, so no interleaving of the two streams can change the final row set.
 *
 * ## Where the safety property went instead
 *
 * The plan text's reason for the cross-entity delete is real and is NOT
 * abandoned: "leaving someone on a project after they have been put out of the
 * workspace is a silent-access failure — they would still resolve a project
 * association while belonging to nothing." That guarantee now lives in
 * `resolveEffectiveRole` (`../permissions/effective-role.ts`), which yields no
 * projects at all for a user with no workspace membership. It is a stronger
 * placement, not a weaker one: it holds for the revoked-then-replayed row above,
 * which the table-level delete could not cover.
 *
 * The cost is that a bare `SELECT ... FROM proj_memberships WHERE scope_kind =
 * 'project'` can return a row for someone no longer in the workspace. Read this
 * table through `resolveEffectiveRole`; the table comment says so too.
 *
 * ## Determinism
 *
 * Payloads are parsed with the domain's own schemas rather than cast, so a
 * shape this projection cannot honestly write throws at the projection instead
 * of silently storing `undefined` (workflowsProjection's precedent). Nothing
 * here reads a clock or a random source: `granted_at` is the event's stored
 * `serverTime` and `workspace_seq` its stored stream position.
 */
const UPSERT = `
  INSERT INTO proj_memberships
    (workspace_id, user_id, scope_kind, project_id, role, project_admin, granted_by, granted_at, workspace_seq)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  ON CONFLICT (workspace_id, user_id, scope_kind, project_id) DO UPDATE SET
    role = excluded.role,
    project_admin = excluded.project_admin,
    granted_by = excluded.granted_by,
    granted_at = excluded.granted_at,
    workspace_seq = excluded.workspace_seq`;

export const membershipsProjection: Projection = {
  name: 'proj_memberships',
  tables: ['proj_memberships'],

  async apply(event, tx) {
    switch (event.type) {
      case 'membership.granted': {
        // Membership is workspace-scoped (owner decision 2026-08-27): this
        // writes the workspace row and only that. Project rows come from
        // project.member_added, and from nowhere else.
        const payload = membershipGrantedPayload.parse(event.payload);
        await tx.query(UPSERT, [
          event.workspaceId,
          payload.userId,
          'workspace',
          '',
          payload.role,
          false,
          event.actorId,
          event.serverTime,
          event.workspaceSeq,
        ]);
        return;
      }
      case 'membership.revoked': {
        // The workspace row alone — see the docblock. The project rows this
        // used to delete belong to the project entity's stream, and deleting
        // them from here makes the table depend on cross-entity interleaving.
        // resolveEffectiveRole is what stops an orphaned project row conferring
        // anything.
        const payload = membershipRevokedPayload.parse(event.payload);
        await tx.query(
          `DELETE FROM proj_memberships
           WHERE workspace_id = $1 AND user_id = $2 AND scope_kind = 'workspace'`,
          [event.workspaceId, payload.userId],
        );
        return;
      }
      case 'project.member_added': {
        // role is 'member' for every project row, always. Project association
        // is not a role grant — the role a person holds in the workspace is the
        // workspace row's, and their rights over THIS project ride on
        // project_admin.
        const payload = projectMemberAddedPayload.parse(event.payload);
        await tx.query(UPSERT, [
          event.workspaceId,
          payload.userId,
          'project',
          event.entity.id,
          'member',
          payload.projectAdmin,
          event.actorId,
          event.serverTime,
          event.workspaceSeq,
        ]);
        return;
      }
      case 'project.member_removed': {
        const payload = projectMemberRemovedPayload.parse(event.payload);
        await tx.query(
          `DELETE FROM proj_memberships
           WHERE workspace_id = $1 AND user_id = $2 AND scope_kind = 'project' AND project_id = $3`,
          [event.workspaceId, payload.userId, event.entity.id],
        );
        return;
      }
      default:
        // Not a membership event — a projection ignores what it does not read.
        return;
    }
  },

  async reset(tx) {
    await tx.query('TRUNCATE proj_memberships');
  },
};
