import { z } from 'zod';
import { NOTIFICATION_KINDS, notificationPreferencesSchema, type NotificationKind } from '@gisik-nokma/domain';
import { HttpError } from '../http-client.js';
import type { Session } from '../session.js';
import type { ToolDefinition } from './read-tools.js';
import { pageArgs, pageField, readOrNotFound } from './reads.js';
import { postJson, putJson } from './submit.js';

/**
 * MCP-everything T10: finding one's way around (ticket types, workflows, my work, attention) and the
 * caller's own inbox (notifications, invitations); MCP sweep 2 T6 adds the caller's notification
 * preferences and saved filters. Every route here is one the app already uses and every
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

/**
 * The app's own words for each kind (`packages/app-core/src/account/notifications-section.tsx:4-10`), copied. The record is
 * typed on `NotificationKind`, so a kind added to the domain is a type error here, and 14.632 reds if a description loses one.
 */
const KIND_WORDS: Record<NotificationKind, string> = {
  assignment: 'A ticket is assigned to you',
  mention: 'You are mentioned in a comment, description or note',
  'contested-claim': 'A claim of yours is contested',
  'date-approaching': 'A date you are watching is approaching',
  'stale-ticket': 'A ticket has sat unmoved for a while',
};
const KINDS_IN_WORDS = NOTIFICATION_KINDS.map((kind) => `${kind} (${KIND_WORDS[kind]})`).join('; ');
const kindSchema = z.enum(NOTIFICATION_KINDS);
const muteShape = { mute: z.array(kindSchema).optional(), unmute: z.array(kindSchema).optional() };
const PREFS_PATH = '/v1/me/notification-preferences';
/** What `GET /v1/me/preferences` carries that this tool reads. `filterSpec` is passed through as stored: validating it again here would turn yesterday's saved view into an error. */
const savedFiltersView = z.object({
  savedFilters: z.array(z.object({ id: z.string(), name: z.string(), filterSpec: z.record(z.string(), z.unknown()) })),
}).passthrough();

/** The caller's muted kinds, strictly parsed: a malformed answer must never read as "nothing muted", because `set` would then write it back. */
async function readMuted(session: Session): Promise<NotificationKind[]> {
  const parsed = notificationPreferencesSchema.safeParse(await session.get(PREFS_PATH));
  if (!parsed.success) throw new Error('your notification preferences could not be read, so nothing was changed');
  return parsed.data.mutedKinds;
}

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
      name: 'get_notification_preferences',
      description:
        'Which kinds of notification you have muted. The setting is yours alone and covers every workspace. A muted kind is hidden from your inbox and its unread ' +
        `count (list_notifications omits it) but is still recorded, so unmuting brings it back. The kinds: ${KINDS_IN_WORDS}.`,
      inputSchema: {},
      handler: async () => {
        const mutedKinds = await readMuted(session);
        return { mutedKinds, kinds: NOTIFICATION_KINDS.map((kind) => ({ kind, muted: mutedKinds.includes(kind) })) };
      },
    },
    {
      name: 'set_notification_preferences',
      description:
        'Mute or unmute kinds of notification, changing only the kinds you name; every other kind stays as it is. mute: [...] hides those kinds from your inbox, ' +
        `unmute: [...] shows them again. Give at least one kind, and no kind in both lists. The kinds: ${KINDS_IN_WORDS}.`,
      inputSchema: muteShape,
      handler: async (args) => {
        const a = z.object(muteShape).parse(args);
        const mute = a.mute ?? [];
        const unmute = a.unmute ?? [];
        if (mute.length === 0 && unmute.length === 0) throw new Error('set_notification_preferences needs mute, unmute or both, with at least one kind');
        const both = mute.find((kind) => unmute.includes(kind));
        if (both !== undefined) throw new Error(`${both} is in both mute and unmute; choose one`);
        const current = await readMuted(session);
        const next = [...current];
        for (const kind of mute) if (!next.includes(kind)) next.push(kind);
        const kept = next.filter((kind) => !unmute.includes(kind));
        const changed = kept.length !== current.length || kept.some((kind, i) => kind !== current[i]);
        if (!changed) return { mutedKinds: current, changed: false };
        // The route replaces the whole document (`apps/server/src/notification-preferences/store.ts:37-55`), so the whole result is sent.
        const stored = notificationPreferencesSchema.parse(await putJson(session, PREFS_PATH, { mutedKinds: kept }));
        return { mutedKinds: stored.mutedKinds, changed: true };
      },
    },
    {
      name: 'list_saved_filters',
      description:
        'Your saved filters in one workspace (the named views on the project page): id, name and filter. Pass a filter to list_tickets or search exactly as it is. ' +
        'Only yours, and read-only.',
      inputSchema: { workspaceId: id },
      handler: async (args) => {
        const { workspaceId } = z.object({ workspaceId: id }).parse(args);
        const doc = await readOrNotFound(session, `/v1/me/preferences?${new URLSearchParams({ workspaceId }).toString()}`, 'workspace');
        const parsed = savedFiltersView.safeParse(doc);
        if (!parsed.success) throw new Error('your saved filters could not be read');
        return { workspaceId, savedFilters: parsed.data.savedFilters.map((f) => ({ id: f.id, name: f.name, filter: f.filterSpec })) };
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
