import type { EnvelopeSeed } from '../submit.js';

/** A comment's parent: the ticket or note it was written on. A comment event is filed against the PARENT. */
export type CommentParent = { kind: 'ticket' | 'note'; id: string };

/** `comment.edited` (MCP-everything spec §6): `commentId` is the `comment.added` event's id. */
export function commentEditedSeed(workspaceId: string, parent: CommentParent, commentId: string, body: unknown): EnvelopeSeed {
  return { workspaceId, entity: parent, type: 'comment.edited', payload: { commentId, body } };
}

/** `comment.deleted`: the body is dropped from every view; the ledger keeps the event until purge. */
export function commentDeletedSeed(workspaceId: string, parent: CommentParent, commentId: string): EnvelopeSeed {
  return { workspaceId, entity: parent, type: 'comment.deleted', payload: { commentId } };
}
