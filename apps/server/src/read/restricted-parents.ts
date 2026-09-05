import { resolveEffectiveRole, type EffectiveRole } from '../permissions/effective-role.js';
import { canSeeResolved } from '../visibility/can-see.js';
import type { Queryable } from '../db/queryable.js';

/**
 * Of the parents these cards name, which ones this viewer MAY NOT SEE — returned
 * as the set of CHILD ids, because that is what a row is about.
 *
 * ## This applies an existing rule; it does not author one
 *
 * The decision is `canSeeResolved`'s (`apps/server/src/visibility/can-see.ts:94`)
 * — Plan 4's one visibility function, spec §6's table — asked about the PARENT's
 * own resolved row, exactly as `rollupFor` asks it about each CHILD's
 * (`apps/server/src/visibility/rollup.ts:267`). No SQL here re-states who may see
 * what, and no branch below adds a condition to the table.
 *
 * What it discloses is strictly LESS than what the single ticket read already
 * discloses to the same viewer about the same rows. `GET /v1/workspaces/:ws/tickets/:id`
 * answers `parent: { kind: 'restricted', id }` — existence AND the parent's id —
 * for a visible child under an unreachable parent
 * (`apps/server/src/routes/tickets.ts:304`, spec §6's one deliberate existence
 * leak, and `ParentRef` in `packages/app-core/src/view-types.ts:110` encodes
 * exactly that shape). This answers the same question with the id removed. And
 * the fact is already OBTAINABLE without this function: a client holding a list
 * page can call that route once per row — every row it holds is a ticket it may
 * see, which is the precondition the leak is bounded by — and read the same
 * boolean off the `parent.kind` it gets back. Serving it here saves N round
 * trips; it does not widen the audience of anything.
 *
 * `parentId` itself is already on every `TicketCard` and is argued there
 * (`packages/domain/src/read-models.ts`, `parentId: null` note): a viewer who
 * cannot see the parent still gets its id. So this boolean does not even add the
 * existence claim to this body — the body already carries the id.
 *
 * ## The role is resolved per PARENT'S workspace, never taken from the caller
 *
 * The list route holds an `EffectiveRole` for the project's workspace, and
 * reusing it here would be a second, quieter visibility decision. A parent may
 * sit in another project (case 6.57 — nothing refuses a cross-project parent)
 * and, in a projection state `rollupFor` already handles for children (case
 * 6.84), in another workspace. `canSeeResolved` answers with the role held in
 * the TICKET's workspace, which is the same reason `canSee` takes no
 * `workspaceId` parameter; so the role is resolved from the parent's own row,
 * cached per workspace exactly as `rollupFor` caches it.
 *
 * ## A `parent_id` naming no row is NOT restricted
 *
 * It answers `false`, joining "no parent" and "a parent you may see". That is
 * the ruling `routes/tickets.ts` already made at the same fork: `proj_visibility`
 * resolves such a ticket as a ROOT (case 6.9), so the projection has decided it
 * has no parent, and reporting a restricted one would assert the existence of a
 * ticket the system has no evidence for — an INVENTED existence leak, the exact
 * inverse of the disclosed one.
 */
export async function restrictedParentsFor(
  db: Queryable,
  viewerId: string,
  cards: readonly { ticket_id: string; parent_id: string | null }[],
): Promise<Set<string>> {
  const restricted = new Set<string>();
  const parentIds = [...new Set(cards.flatMap((c) => (c.parent_id === null ? [] : [c.parent_id])))];
  if (parentIds.length === 0) {
    return restricted;
  }

  // The parents' RESOLVED audience — `resolved_*` and never `own_*`, because a
  // ticket that authored nothing inherits and `own_mode` would read `'inherit'`,
  // which is not an audience at all (`can-see.ts`'s note on
  // `getResolvedVisibility`). No workspace clause: the row's own `workspace_id`
  // is what the role is resolved in, and a clause naming the CHILD's workspace
  // would silently answer `false` for a cross-workspace parent — reporting
  // "restricted" for a ticket this viewer may in fact be able to see.
  const { rows } = await db.query<{
    ticket_id: string;
    workspace_id: string;
    project_id: string;
    resolved_mode: 'workspace' | 'project' | 'explicit';
    resolved_user_ids: string[];
  }>(
    `SELECT ticket_id, workspace_id, project_id, resolved_mode, resolved_user_ids
       FROM proj_visibility
      WHERE ticket_id = ANY ($1::text[])`,
    [parentIds],
  );

  const roleByWorkspace = new Map<string, EffectiveRole>();
  const visibleParents = new Set<string>();
  const knownParents = new Set<string>();
  for (const parent of rows) {
    knownParents.add(parent.ticket_id);
    let eff = roleByWorkspace.get(parent.workspace_id);
    if (eff === undefined) {
      eff = await resolveEffectiveRole(db, viewerId, parent.workspace_id);
      roleByWorkspace.set(parent.workspace_id, eff);
    }
    if (
      canSeeResolved(eff, viewerId, {
        workspaceId: parent.workspace_id,
        projectId: parent.project_id,
        resolvedMode: parent.resolved_mode,
        resolvedUserIds: parent.resolved_user_ids,
      })
    ) {
      visibleParents.add(parent.ticket_id);
    }
  }

  for (const card of cards) {
    if (card.parent_id === null) continue;
    // Known AND invisible. An unknown parent falls through to `false` — see the
    // "naming no row" note above.
    if (knownParents.has(card.parent_id) && !visibleParents.has(card.parent_id)) {
      restricted.add(card.ticket_id);
    }
  }
  return restricted;
}
