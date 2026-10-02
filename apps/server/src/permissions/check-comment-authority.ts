import { commentDeletedPayload, commentEditedPayload, type EventEnvelope } from '@gisik-nokma/domain';
import type { Refusal } from '@gisik-nokma/rule-engine';
import type { VisibilityContext } from './check-permission.js';

export const COMMENT_PERMISSION_RULE = 'permission.comment';
export const COMMENT_UNKNOWN_REASON = 'That comment is not on this ticket or note.';
export const COMMENT_ALREADY_DELETED_REASON = 'This comment has been deleted.';
export const COMMENT_EDIT_AUTHOR_REASON = 'Only the person who wrote a comment can edit it.';
export const COMMENT_DELETE_AUTHORITY_REASON =
  'Only the person who wrote a comment, or a workspace owner or admin, can delete it.';
export const COMMENT_NOTE_DELETED_REASON = 'This note is deleted; restore it first.';

const refuse = (reason: string): Refusal => ({ refused: true, rule: COMMENT_PERMISSION_RULE, reason });

/**
 * Who may edit or delete a comment (MCP-everything spec §6, M-E9). Runs LAST in `checkPermission`, after
 * the parent's own audience questions (`checkVisibilityPermission` for a ticket, `checkNotePermission` for a
 * note), so a person who cannot see the parent is told THAT and never learns whether a comment id exists.
 *
 * The comment is looked up by id AND parent: an id from another ticket or note is the same answer as an id
 * that names nothing (case 26.046). A deleted TICKET is the rule engine's live gate (`deleted-ticket`); a
 * deleted NOTE has no engine gate for comment events (the notes projection never folds them), so it is here.
 */
export async function checkCommentAuthority(env: EventEnvelope, ctx: VisibilityContext): Promise<Refusal | null> {
  if (env.type !== 'comment.edited' && env.type !== 'comment.deleted') return null;
  if (env.entity.kind !== 'ticket' && env.entity.kind !== 'note') return refuse(COMMENT_UNKNOWN_REASON);
  const { commentId } = (env.type === 'comment.edited' ? commentEditedPayload : commentDeletedPayload).parse(env.payload);
  // Two literal statements over the parent kind, as the projection does: no caller-adjacent bytes in SQL text.
  const { rows } = await ctx.db.query<{ author_id: string; deleted_at: Date | null }>(
    env.entity.kind === 'note'
      ? 'SELECT author_id, deleted_at FROM proj_note_comments WHERE comment_id = $1 AND note_id = $2'
      : 'SELECT author_id, deleted_at FROM proj_ticket_comments WHERE comment_id = $1 AND ticket_id = $2',
    [commentId, env.entity.id],
  );
  const row = rows[0];
  if (row === undefined) return refuse(COMMENT_UNKNOWN_REASON);
  if (env.entity.kind === 'note') {
    const note = await ctx.db.query<{ deleted: boolean }>('SELECT deleted FROM proj_notes WHERE note_id = $1', [env.entity.id]);
    if (note.rows[0]?.deleted === true) return refuse(COMMENT_NOTE_DELETED_REASON);
  }
  if (row.deleted_at !== null) return refuse(COMMENT_ALREADY_DELETED_REASON);
  const isAuthor = row.author_id === ctx.sessionUserId;
  if (env.type === 'comment.edited') return isAuthor ? null : refuse(COMMENT_EDIT_AUTHOR_REASON);
  const role = ctx.eff.workspaceRole;
  return isAuthor || role === 'owner' || role === 'admin' ? null : refuse(COMMENT_DELETE_AUTHORITY_REASON);
}
