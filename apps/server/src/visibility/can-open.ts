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

/**
 * True when what `ticketId` names is withheld from `userId`: a draft they may NOT open (another person's, the
 * author's own after they lost the right to create in its project (R18), or one flagged discarded and not yet
 * erased), OR an ERASED draft (no `proj_tickets` row; see `isErasedDraft`). False for a published ticket, a
 * soft-deleted one included, and for a published ticket the trash purge erased: its attaches are delivered as before.
 * The erased-draft arm is the owner's no-trace ruling (planner ruling 2026-10-04, T9-Q1; narrowed to drafts, planner
 * ruling 2026-10-04, follow-up). One question, asked by the note-event filter and by the ticket's notes list, so
 * they cannot drift.
 */
export async function isClosedOrErasedDraft(db: Queryable, userId: string, ticketId: string): Promise<boolean> {
  const { rows } = await db.query<{ draft_author_id: string | null }>(
    'SELECT draft_author_id FROM proj_tickets WHERE ticket_id = $1',
    [ticketId],
  );
  const head = rows[0];
  if (head === undefined) return isErasedDraft(db, ticketId);
  if (head.draft_author_id === null) return false;
  return !(await isOpenableDraft(db, userId, ticketId));
}

/**
 * An erased draft's remains (planner ruling 2026-10-04, follow-up). `discardDraft` erases through `purgeItem` and so
 * through `purge_ledger`, which keeps a ticket's `ticket.created` redacted to `{projectId, purged, draft: true}` when
 * it was born a draft and keeps any `ticket.published` redacted (`migrations/1791600000000_drafts.sql:54-60`). A
 * draft-born creation with no publish is a draft that never left its author. A trash-purged ticket fails one of the
 * two tests: born published (no `draft` on the creation), or born a draft and published (a publish row).
 */
async function isErasedDraft(db: Queryable, ticketId: string): Promise<boolean> {
  const { rows } = await db.query<{ erased: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM events
                     WHERE entity_kind = 'ticket' AND entity_id = $1 AND type = 'ticket.created' AND payload ->> 'draft' = 'true')
        AND NOT EXISTS (SELECT 1 FROM events
                         WHERE entity_kind = 'ticket' AND entity_id = $1 AND type = 'ticket.published') AS erased`,
    [ticketId],
  );
  return rows[0]?.erased === true;
}

/**
 * Does `viewerId` receive this note event? Everything is delivered except a `note.attached` / `note.detached` that
 * names a draft the viewer cannot open, or an erased draft (drafts spec R66, Q16; planner ruling 2026-10-04, follow-up):
 * that claim lives on the NOTE's stream, which other readers of the note are on, so it cannot be hidden by where it
 * is filed the way every other draft claim is. After the publish the same event passes, and the `reach-granted`
 * notice makes a device that had moved past it pull the note; after a discard's erasure it never passes.
 * `note.created` is not filtered: a note cannot be born naming a draft (the create gate stays closed, 28.191).
 */
export async function noteEventVisibleTo(
  db: Queryable,
  viewerId: string,
  event: { type: string; payload: unknown },
): Promise<boolean> {
  if (event.type !== 'note.attached' && event.type !== 'note.detached') return true;
  const ticketId = (event.payload as { ticketId?: unknown } | null)?.ticketId;
  if (typeof ticketId !== 'string') return true;
  return !(await isClosedOrErasedDraft(db, viewerId, ticketId));
}
