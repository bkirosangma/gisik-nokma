import type { EffectiveRole } from '../permissions/effective-role.js';

/**
 * Owner or admin — the one question every "may they be told about the guests"
 * decision turns on.
 *
 * Lived as a private function in `routes/builder-reads.ts` until Task 16 needed
 * the same answer for `GET /v1/me/workspaces`'s member COUNT. Moved rather than
 * copied: the count and the roster must agree exactly, and the cheapest way for
 * them to stop agreeing is for one of them to re-derive this.
 *
 * It is deliberately not a read BYPASS and must never become one. `canSee`
 * grants an admin no visibility they were not given (`visibility/can-see.ts`),
 * and `hasProjectAdminRights` says the same in its own docblock. This answers
 * one narrow question about the workspace's people directory.
 */
export function isWorkspaceAdmin(eff: EffectiveRole): boolean {
  return eff.workspaceRole === 'owner' || eff.workspaceRole === 'admin';
}

/**
 * The clause that decides which workspace-scope membership rows a caller may be
 * told about: all of them for an admin, the non-guests for everyone else.
 *
 * Shared TEXT with one bound parameter rather than two similar queries, and
 * shared between `readMembers` (`routes/builder-reads.ts`) and
 * `visibleMemberCount` (`read/workspace-counts.ts`) rather than written twice.
 *
 * ## Why a count needs the same clause as a directory
 *
 * A guest is withheld from a non-admin's roster because "a guest is a person
 * invited to one shared ticket, not a member of the workspace's roster"
 * (executor ruling 2026-09-02, at the roster route). A member handed
 * `COUNT(*) = 4` beside a three-name directory has been told the withheld
 * person exists, which is most of what the withholding was for. The number and
 * the list are one disclosure and get one rule.
 *
 * **The `$1`/`$2` positions are part of the contract**: `$1` is the workspace
 * id, `$2` the caller's admin-ness. Both call sites bind them in that order and
 * a test drives the count against `readMembers(...).length` for every viewer
 * class, so a transposition cannot pass quietly.
 */
export const ROSTER_VISIBLE_CLAUSE = `($2::boolean OR m.role <> 'guest')`;
