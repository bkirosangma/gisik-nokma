import type { Queryable } from '../db/queryable.js';
import { resolveEffectiveRole, type EffectiveRole } from '../permissions/effective-role.js';
import { canSee } from './can-see.js';

/**
 * What a person may do with a ticket id (drafts spec §4.2, group D). The three answers are the three
 * things a door can say: `visible` (an ordinary reader, `canSee`), `own-draft` (the author of a draft they
 * can still create in), `none` (the unknown-ticket answer, for everyone else).
 */
export type TicketAccess = 'visible' | 'own-draft' | 'none';

/**
 * R18: an author reaches their draft only while they could still CREATE in its project, which is the test
 * `checkVisibilityPermission` makes for `ticket.created` (`ctx.eff.projects.has(projectId)`) plus a role that
 * may create at all. A guest, a revoked member, or a project the author is no longer on: closed, not erased.
 */
export function holdsDraftRights(eff: EffectiveRole, projectId: string): boolean {
  const role = eff.workspaceRole;
  return (role === 'owner' || role === 'admin' || role === 'member') && eff.projects.has(projectId);
}

type DraftHead = {
  workspace_id: string;
  project_id: string;
  draft_author_id: string | null;
  draft_discarded: boolean | null;
};

/**
 * True when this ticket is a draft that `userId` authored, that is not flagged discarded, and that its author
 * may still open (R18). The workspace is the TICKET's own, never the caller's (`canSee`'s rule): a role held in
 * workspace A answers nothing about a draft in workspace B.
 */
export async function isOpenableDraft(db: Queryable, userId: string, ticketId: string): Promise<boolean> {
  const { rows } = await db.query<DraftHead>(
    'SELECT workspace_id, project_id, draft_author_id, draft_discarded FROM proj_tickets WHERE ticket_id = $1',
    [ticketId],
  );
  const head = rows[0];
  if (head === undefined || head.draft_author_id !== userId || head.draft_discarded === true) return false;
  return holdsDraftRights(await resolveEffectiveRole(db, userId, head.workspace_id), head.project_id);
}

/**
 * `canSee` FIRST, so a published ticket costs exactly what it cost before; only a not-visible answer pays the
 * one extra read (the economy `canSee` itself uses for the assignee arm). `canSee` is false for every draft,
 * so `visible` is never returned for one while the flag is set.
 */
export async function ticketAccess(db: Queryable, userId: string, ticketId: string): Promise<TicketAccess> {
  if (await canSee(db, userId, ticketId)) return 'visible';
  return (await isOpenableDraft(db, userId, ticketId)) ? 'own-draft' : 'none';
}

/** The door predicate: `canSee || isOpenableDraft`. Every door of group D calls this or `ticketAccess`. */
export async function canOpen(db: Queryable, userId: string, ticketId: string): Promise<boolean> {
  return (await ticketAccess(db, userId, ticketId)) !== 'none';
}
