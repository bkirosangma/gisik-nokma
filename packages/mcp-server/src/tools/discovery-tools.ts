import { ATTENTION_SHOW_VALUES, type AttentionShow } from '@gisik-nokma/domain';
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
 *
 * My-work-global T5: `my_work` and `get_attention` are GLOBAL when `workspaceId` is absent — one
 * `/v1/me/workspaces` read, archived workspaces skipped, then one read per workspace, a workspace answering
 * 404 left out — and `get_attention` takes `show` (default created + assigned), like the `/my-work` page.
 */
const id = z.string().min(1);
const enc = encodeURIComponent;
/** The notification inbox pages by the last row's ID (`notifications/store.ts`), not by the offset `pageArgs` carries. */
const notificationArgs = { unreadOnly: z.boolean().optional(), cursor: id.optional(), limit: z.number().int().min(1).max(100).optional() };
const markShape = { ids: z.array(id).min(1).max(100).optional(), all: z.literal(true).optional() };
const answerSchema = z.enum(['accept', 'decline']);
const showSchema = z.array(z.enum(ATTENTION_SHOW_VALUES as [AttentionShow, ...AttentionShow[]])).min(1);
const workArgs = { workspaceId: id.optional() };
const attentionArgs = { workspaceId: id.optional(), show: showSchema.optional() };
/** The `/my-work` page's default "Show" (spec D2): only tickets the caller created or is assigned. */
const DEFAULT_SHOW: readonly AttentionShow[] = ['created', 'assigned'];

/** One `/v1/me/workspaces` row, the fields the fan-out reads. `adminProjectIds` is absent on an older server. */
type MyWorkspace = { workspaceId: string; name: string | null; role: string; archived: boolean; adminProjectIds?: string[] };

/**
 * The part of `show` ONE workspace may be asked for, in canonical order and once each: `ws-admin` only where
 * the caller owns or runs THAT workspace, `project-admin` only where they run a project in it — the attention
 * route refuses either elsewhere (400 `invalid_query`). The same rule as `showForWorkspace` (my-work-global T3,
 * app-core), inlined because this package does not depend on app-core. Empty = the workspace is not asked.
 */
function showForWorkspace(workspace: MyWorkspace, show: readonly AttentionShow[]): AttentionShow[] {
  return ATTENTION_SHOW_VALUES.filter(
    (value) =>
      show.includes(value) &&
      (value === 'created' ||
        value === 'assigned' ||
        (value === 'ws-admin' && (workspace.role === 'owner' || workspace.role === 'admin')) ||
        (value === 'project-admin' && (workspace.adminProjectIds ?? []).length > 0)),
  );
}

/** The `?show=` value: the enum members need no encoding, and a literal comma is what the route splits on. */
const showQuery = (show: readonly AttentionShow[]): string => ATTENTION_SHOW_VALUES.filter((value) => show.includes(value)).join(',');

/**
 * Reads every live workspace of the caller, in `/v1/me/workspaces` order. `read` answering `undefined` skips
 * that workspace; a 404 (the workspace went away, or out of sight, since the list) drops it alone; any other
 * failure fails the whole call rather than return a partial answer that looks complete.
 */
async function eachLiveWorkspace<T>(
  session: Session,
  read: (workspace: MyWorkspace) => Promise<T> | undefined,
): Promise<Array<{ workspace: MyWorkspace; body: T }>> {
  const { workspaces } = (await session.get('/v1/me/workspaces')) as { workspaces: MyWorkspace[] };
  const answers = await Promise.all(
    workspaces
      .filter((workspace) => !workspace.archived)
      .map(async (workspace): Promise<{ workspace: MyWorkspace; body: T } | null> => {
        const pending = read(workspace);
        if (pending === undefined) return null;
        try {
          return { workspace, body: await pending };
        } catch (error) {
          if (error instanceof HttpError && error.status === 404) return null;
          throw error;
        }
      }),
  );
  return answers.filter((answer): answer is { workspace: MyWorkspace; body: T } => answer !== null);
}

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
      description:
        'What is on your plate: the tickets assigned to you or that you collaborate on, across all your workspaces, grouped the way the My Work screen groups them; pass workspaceId to limit it to one workspace.',
      inputSchema: workArgs,
      handler: async (args) => {
        const { workspaceId } = z.object(workArgs).parse(args);
        const work = (ws: string) => `/v1/me/work?${new URLSearchParams({ workspaceId: ws }).toString()}`;
        if (workspaceId !== undefined) return readOrNotFound(session, work(workspaceId), 'workspace');
        const read = await eachLiveWorkspace(session, (workspace) => session.get(work(workspace.workspaceId)) as Promise<Record<string, unknown>>);
        return { workspaces: read.map(({ workspace, body }) => ({ ...body, workspaceId: workspace.workspaceId, name: workspace.name })) };
      },
    },
    {
      name: 'get_attention',
      description:
        "What needs your attention: overdue, due soon, stale and blocked work. By default only tickets you created or that are assigned to you, across all your workspaces; pass show to include 'ws-admin' or 'project-admin' tickets, and workspaceId to limit it to one workspace.",
      inputSchema: attentionArgs,
      handler: async (args) => {
        const a = z.object(attentionArgs).parse(args);
        const show = a.show ?? DEFAULT_SHOW;
        const attention = (ws: string, part: readonly AttentionShow[]) => `/v1/workspaces/${enc(ws)}/attention?show=${showQuery(part)}`;
        // One named workspace is asked for the whole selection: a role it lacks is the route's 400, said plainly.
        if (a.workspaceId !== undefined) return readOrNotFound(session, attention(a.workspaceId, show), 'workspace');
        const read = await eachLiveWorkspace(session, (workspace) => {
          const part = showForWorkspace(workspace, show);
          return part.length === 0 ? undefined : (session.get(attention(workspace.workspaceId, part)) as Promise<{ items: unknown[] }>);
        });
        return { workspaces: read.map(({ workspace, body }) => ({ workspaceId: workspace.workspaceId, name: workspace.name, items: body.items })) };
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
