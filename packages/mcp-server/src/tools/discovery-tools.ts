import { z } from 'zod';
import { HttpError } from '../http-client.js';
import type { Session } from '../session.js';
import type { ToolDefinition } from './read-tools.js';
import { pageArgs, pageField, readOrNotFound } from './reads.js';
import { postJson } from './submit.js';

/**
 * MCP-everything T10: finding one's way around (ticket types, workflows, my work, attention) and the
 * caller's own inbox (notifications, invitations). Every route here is one the app already uses and every
 * 404 is the product's one sentence — a stranger cannot tell a missing workspace from one they may not see.
 */
const id = z.string().min(1);
const enc = encodeURIComponent;
/** The notification inbox pages by the last row's ID (`notifications/store.ts`), not by the offset `pageArgs` carries. */
const notificationArgs = { unreadOnly: z.boolean().optional(), cursor: id.optional(), limit: z.number().int().min(1).max(100).optional() };
const markShape = { ids: z.array(id).min(1).max(100).optional(), all: z.literal(true).optional() };
const answerSchema = z.enum(['accept', 'decline']);

/** Unread notifications are paged in 100s and at most ten pages are marked in one call. */
const MARK_ALL_PAGES = 10;

export function discoveryTools(session: Session): ToolDefinition[] {
  return [
    {
      name: 'list_ticket_types',
      description: 'The ticket types of a workspace (id, name, icon, the workflow each uses, custom fields). Use a type id with create_ticket.',
      inputSchema: { workspaceId: id, ...pageArgs },
      handler: async (args) => {
        const a = z.object({ workspaceId: id, ...pageArgs }).parse(args);
        const body = (await readOrNotFound(session, `/v1/workspaces/${enc(a.workspaceId)}/ticket-types`, 'workspace')) as Record<string, unknown>;
        return pageField(body, 'ticketTypes', a.cursor, a.limit);
      },
    },
    {
      name: 'list_workflows',
      description: "A workspace's workflows; with workflowId, that workflow's states and the moves allowed between them (use a state id with transition_ticket).",
      inputSchema: { workspaceId: id, workflowId: id.optional(), ...pageArgs },
      handler: async (args) => {
        const a = z.object({ workspaceId: id, workflowId: id.optional(), ...pageArgs }).parse(args);
        if (a.workflowId !== undefined) return readOrNotFound(session, `/v1/workspaces/${enc(a.workspaceId)}/workflows/${enc(a.workflowId)}`, 'workflow');
        const body = (await readOrNotFound(session, `/v1/workspaces/${enc(a.workspaceId)}/workflows`, 'workspace')) as Record<string, unknown>;
        return pageField(body, 'workflows', a.cursor, a.limit);
      },
    },
    {
      name: 'my_work',
      description: 'What is on your plate in one workspace: the tickets assigned to you or that you collaborate on, grouped the way the My Work screen groups them.',
      inputSchema: { workspaceId: id },
      handler: async (args) => {
        const { workspaceId } = z.object({ workspaceId: id }).parse(args);
        return readOrNotFound(session, `/v1/me/work?${new URLSearchParams({ workspaceId }).toString()}`, 'workspace');
      },
    },
    {
      name: 'get_attention',
      description: 'What needs attention in a workspace: overdue, due soon, stale and blocked work, as the attention strip shows it.',
      inputSchema: { workspaceId: id },
      handler: async (args) => {
        const { workspaceId } = z.object({ workspaceId: id }).parse(args);
        return readOrNotFound(session, `/v1/workspaces/${enc(workspaceId)}/attention`, 'workspace');
      },
    },
    {
      name: 'list_notifications',
      description: 'Your notifications, newest first (mentions, assignments, conflicts). unreadOnly for just the unread; page with cursor (the answer carries nextCursor); limit 1–100.',
      inputSchema: notificationArgs,
      handler: async (args) => {
        const a = z.object(notificationArgs).parse(args);
        const q = new URLSearchParams();
        if (a.unreadOnly === true) q.set('unread', 'true');
        if (a.limit !== undefined) q.set('limit', String(a.limit));
        if (a.cursor !== undefined) q.set('cursor', a.cursor);
        const qs = q.toString();
        return session.get(`/v1/me/notifications${qs === '' ? '' : `?${qs}`}`);
      },
    },
    {
      name: 'mark_notifications_read',
      description: 'Mark notifications read: the given ids (1–100), or all: true for every unread one.',
      inputSchema: markShape,
      handler: async (args) => {
        const a = z.object(markShape).parse(args);
        if ((a.ids === undefined) === (a.all === undefined)) throw new Error('mark_notifications_read takes ids or all: true, not both and not neither');
        if (a.ids !== undefined) return postJson(session, '/v1/me/notifications/read', { ids: a.ids, read: true });
        let changed = 0;
        let cursor: string | null = null;
        for (let page = 0; page < MARK_ALL_PAGES; page++) {
          const q = new URLSearchParams({ unread: 'true', limit: '100' });
          if (cursor !== null) q.set('cursor', cursor);
          const list = (await session.get(`/v1/me/notifications?${q.toString()}`)) as { notifications: Array<{ id: string }>; nextCursor: string | null };
          if (list.notifications.length === 0) break;
          const done = (await postJson(session, '/v1/me/notifications/read', { ids: list.notifications.map((n) => n.id), read: true })) as { changed: number | unknown[] };
          // The route answers the ids that actually flipped (`markNotificationsRead` returns `string[]`).
          changed += Array.isArray(done.changed) ? done.changed.length : Number(done.changed);
          cursor = list.nextCursor;
          if (cursor === null) break;
        }
        return { changed };
      },
    },
    {
      name: 'list_my_invitations',
      description: 'Invitations waiting for you to accept or decline, across workspaces.',
      inputSchema: { ...pageArgs },
      handler: async (args) => {
        const a = z.object(pageArgs).parse(args);
        return pageField((await session.get('/v1/me/invitations')) as Record<string, unknown>, 'invitations', a.cursor, a.limit);
      },
    },
    {
      name: 'respond_to_invitation',
      description: 'Accept or decline one of your invitations (inviteId from list_my_invitations). Accepting adds you to the workspace with the invited role.',
      inputSchema: { inviteId: id, answer: answerSchema },
      handler: async (args) => {
        const a = z.object({ inviteId: id, answer: answerSchema }).parse(args);
        let out: unknown;
        try {
          out = await postJson(session, `/v1/me/invitations/${enc(a.inviteId)}/${a.answer}`, {});
        } catch (error) {
          // `INVITATION_NOT_YOURS_BODY` is a 404 (`my-invitations.ts`): one sentence for "no such invitation" and "not yours".
          if (error instanceof HttpError && error.status === 404) throw new Error('invitation not found or not yours');
          throw error;
        }
        return a.answer === 'decline' ? { declined: true } : out;
      },
    },
  ];
}
