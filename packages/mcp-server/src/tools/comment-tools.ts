import { z } from 'zod';
import type { Session } from '../session.js';
import { bodyAsMarkdown, markdownBody, MARKDOWN_SYNTAX_HELP, parentOf } from './markdown-io.js';
import type { ToolDefinition } from './read-tools.js';
import { page, pageArgs, readOrNotFound } from './reads.js';
import { envelopeFor, submitOne } from './submit.js';

const id = z.string().min(1);
const parentShape = { workspaceId: id, ticketId: id.optional(), noteId: id.optional() };
type Row = { commentId: string; authorId: string; body: unknown; recordedAt: string; editedAt?: string | null; deletedAt?: string | null; files?: unknown[] };

export function commentTools(session: Session): ToolDefinition[] {
  return [
    {
      name: 'list_comments',
      description:
        'The comments on one ticket (ticketId) or one note (noteId), oldest first. Each body comes back as Markdown, ' +
        'with `lossy` naming anything Markdown cannot show, `editedAt` when it was edited, and `deleted: true` (no text) ' +
        'for a deleted comment. Pages with cursor/limit (default 50, max 200). Use the commentId with edit_comment or delete_comment.',
      inputSchema: { ...parentShape, ...pageArgs },
      handler: async (args) => {
        const a = z.object({ ...parentShape, ...pageArgs }).parse(args);
        const parent = parentOf(a, 'list_comments');
        const path =
          parent.kind === 'ticket'
            ? `/v1/workspaces/${encodeURIComponent(a.workspaceId)}/tickets/${encodeURIComponent(parent.id)}/comments`
            : `/v1/notes/${encodeURIComponent(parent.id)}/comments`;
        const { comments } = (await readOrNotFound(session, path, parent.kind)) as { comments: Row[] };
        const { items, nextCursor } = page(comments, a.cursor, a.limit);
        return {
          nextCursor,
          comments: items.map((c) => {
            const deleted = c.deletedAt != null;
            const md = deleted ? { markdown: null, lossy: [] as string[] } : bodyAsMarkdown(c.body);
            return { commentId: c.commentId, authorId: c.authorId, recordedAt: c.recordedAt, editedAt: c.editedAt ?? null, deleted, ...md, files: c.files ?? [] };
          }),
        };
      },
    },
    {
      name: 'edit_comment',
      description:
        `Replace the text of a comment you wrote, on a ticket (ticketId) or a note (noteId). Only the person who wrote a comment can edit it; mentions you ADD notify those people. ${MARKDOWN_SYNTAX_HELP}`,
      inputSchema: { ...parentShape, commentId: id, markdown: z.string().min(1) },
      handler: async (args) => {
        const a = z.object({ ...parentShape, commentId: id, markdown: z.string().min(1) }).parse(args);
        const parent = parentOf(a, 'edit_comment');
        const body = await markdownBody(session, a.workspaceId, a.markdown);
        return submitOne(session, envelopeFor(session, a.workspaceId, parent, 'comment.edited', { commentId: a.commentId, body }));
      },
    },
    {
      name: 'delete_comment',
      description:
        'Delete a comment on a ticket (ticketId) or a note (noteId). The person who wrote it, or a workspace owner or admin, can. ' +
        'Its text disappears for everyone and "Comment deleted" stays in the thread with who wrote it and when.',
      inputSchema: { ...parentShape, commentId: id },
      handler: async (args) => {
        const a = z.object({ ...parentShape, commentId: id }).parse(args);
        const parent = parentOf(a, 'delete_comment');
        return submitOne(session, envelopeFor(session, a.workspaceId, parent, 'comment.deleted', { commentId: a.commentId }));
      },
    },
  ];
}
