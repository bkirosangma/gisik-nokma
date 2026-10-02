import { z } from 'zod';
import { PRIORITIES, rankBetween } from '@gisik-nokma/domain';
import { spliceDoc, type BodyEdit } from '@gisik-nokma/editor/markdown-doc';
import { HttpError } from '../http-client.js';
import type { Session } from '../session.js';
import { markdownBody, MARKDOWN_SYNTAX_HELP } from './markdown-io.js';
import { confirmOrPreview } from './preview.js';
import type { ToolDefinition } from './read-tools.js';
import { envelopeFor, submitBatch } from './submit.js';

export type TicketDetailWire = {
  key: string | null;
  title: string;
  ticketState: { fields: Record<string, { value: unknown }>; rank?: string | null; workflowId: string };
  rollup?: { totalChildren?: number } | null;
};
const id = z.string().min(1);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a day in YYYY-MM-DD form');
const BUILT_IN = new Set(['title', 'description', 'priority', 'startDate', 'dueDate']);
const enc = encodeURIComponent;

export async function readTicket(session: Session, workspaceId: string, ticketId: string): Promise<TicketDetailWire> {
  try {
    return (await session.get(`/v1/workspaces/${enc(workspaceId)}/tickets/${enc(ticketId)}`)) as TicketDetailWire;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) throw new Error('ticket not found or not visible to you');
    throw error;
  }
}

const updateShape = {
  workspaceId: id, ticketId: id, title: z.string().min(1).optional(), markdown: z.string().optional(),
  mode: z.enum(['replace', 'append', 'replace_section']).optional(), section: z.string().optional(),
  priority: z.enum(PRIORITIES).optional(), startDate: day.nullable().optional(), dueDate: day.nullable().optional(),
  fields: z.record(z.string().min(1), z.unknown()).optional(), parentId: id.nullable().optional(),
  addCollaborators: z.array(id).optional(), removeCollaborators: z.array(id).optional(),
  workflow: z.object({ toWorkflowId: id, toStateId: id }).optional(),
};

/** A history line without any document in it (owner question Q4): the ledger's facts, never a body. */
function historyLine(e: { id: string; type: string; payload: Record<string, unknown>; actorId: string; origin: string; serverTime: string }) {
  let payload: Record<string, unknown> = e.payload;
  if (e.type === 'comment.added') payload = { commentId: e.id };
  else if (e.type === 'comment.edited' || e.type === 'comment.deleted') payload = { commentId: e.payload['commentId'] };
  else if (e.type === 'ticket.field_set' && e.payload['fieldId'] === 'description') payload = { fieldId: 'description' };
  else if (e.type === 'ticket.transitioned' && 'comment' in e.payload) {
    // A transition's own comment is a comment body (`{ text }`): the move is the fact, the words are list_comments'.
    const { comment: _omit, ...rest } = e.payload;
    payload = rest;
  } else if (e.type === 'ticket.created' && 'description' in e.payload) {
    const { description: _omit, ...rest } = e.payload;
    payload = rest;
  }
  return { eventId: e.id, type: e.type, actorId: e.actorId, origin: e.origin, serverTime: e.serverTime, payload };
}

export function ticketTools(session: Session): ToolDefinition[] {
  const me = (userId: string): string => (userId === 'me' ? session.userId() : userId);
  return [
    {
      name: 'update_ticket',
      description:
        'Change a ticket in one go: title; description (markdown, mode "replace" (default) / "append" / "replace_section" with `section` = a heading\'s exact text); ' +
        'priority P1–P3; startDate / dueDate (YYYY-MM-DD, null clears); custom `fields` by field id; parentId (null = top level); ' +
        `addCollaborators / removeCollaborators ("me" works); workflow { toWorkflowId, toStateId }. Every rule is the product's. ${MARKDOWN_SYNTAX_HELP}`,
      inputSchema: updateShape,
      handler: async (args) => {
        const a = z.object(updateShape).parse(args);
        const t = { kind: 'ticket' as const, id: a.ticketId };
        const ev = (type: string, payload: unknown) => envelopeFor(session, a.workspaceId, t, type, payload);
        const set = (fieldId: string, value: unknown) => ev('ticket.field_set', { fieldId, value });
        for (const key of Object.keys(a.fields ?? {})) {
          if (BUILT_IN.has(key)) throw new Error(`"${key}" is a built-in field: use the ${key} argument`);
        }
        const events = [];
        if (a.title !== undefined) events.push(set('title', a.title));
        if (a.markdown !== undefined) {
          const edit: BodyEdit = a.mode === 'replace_section' ? { mode: 'replace_section', section: a.section ?? '' } : { mode: a.mode ?? 'replace' };
          const current = edit.mode === 'replace' ? null : (await readTicket(session, a.workspaceId, a.ticketId)).ticketState.fields['description']?.value ?? null;
          const spliced = spliceDoc(current, await markdownBody(session, a.workspaceId, a.markdown), edit);
          if ('problem' in spliced) throw new Error(spliced.problem);
          events.push(set('description', spliced.doc));
        }
        if (a.priority !== undefined) events.push(set('priority', a.priority));
        if (a.startDate !== undefined) events.push(set('startDate', a.startDate === null ? null : { date: a.startDate }));
        if (a.dueDate !== undefined) events.push(set('dueDate', a.dueDate === null ? null : { date: a.dueDate }));
        for (const [fieldId, value] of Object.entries(a.fields ?? {})) events.push(set(fieldId, value));
        if (a.parentId !== undefined) events.push(ev('ticket.reparented', { newParentId: a.parentId }));
        for (const u of a.addCollaborators ?? []) events.push(ev('ticket.collaborator_added', { userId: me(u) }));
        for (const u of a.removeCollaborators ?? []) events.push(ev('ticket.collaborator_removed', { userId: me(u) }));
        if (a.workflow !== undefined) events.push(ev('ticket.workflow_rebound', a.workflow));
        if (events.length === 0) throw new Error('update_ticket needs at least one change');
        return { results: await submitBatch(session, events) };
      },
    },
    ...(['close', 'reopen'] as const).map((verb): ToolDefinition => ({
      name: `${verb}_ticket`,
      description: `${verb === 'close' ? 'Close' : 'Reopen'} a ticket, optionally with a comment (Markdown) recorded first in the same change. The product's rules decide (a ticket closes only from a terminal state).`,
      inputSchema: { workspaceId: id, ticketId: id, comment: z.string().min(1).optional() },
      handler: async (args) => {
        const a = z.object({ workspaceId: id, ticketId: id, comment: z.string().min(1).optional() }).parse(args);
        const t = { kind: 'ticket' as const, id: a.ticketId };
        const events = [];
        if (a.comment !== undefined) events.push(envelopeFor(session, a.workspaceId, t, 'comment.added', { body: await markdownBody(session, a.workspaceId, a.comment) }));
        events.push(envelopeFor(session, a.workspaceId, t, verb === 'close' ? 'ticket.closed' : 'ticket.reopened', {}));
        return { results: await submitBatch(session, events) };
      },
    })),
    {
      name: 'delete_ticket',
      description: 'Move a ticket to Deleted items (restorable for 15 days with restore_ticket). confirm_name must be the ticket KEY (e.g. CCSO-4); without it you get a preview and nothing changes.',
      inputSchema: { workspaceId: id, ticketId: id, confirm_name: z.string().optional() },
      handler: async (args) => {
        const a = z.object({ workspaceId: id, ticketId: id, confirm_name: z.string().optional() }).parse(args);
        const ticket = await readTicket(session, a.workspaceId, a.ticketId);
        const key = ticket.key ?? a.ticketId;
        const children = ticket.rollup?.totalChildren ?? 0;
        const preview = await confirmOrPreview(key, a.confirm_name, async () => ({
          sentence: `Moves ${key} "${ticket.title}" to Deleted items; it can be restored for 15 days.`,
          counts: { childTickets: children },
        }));
        if (preview !== null) return preview;
        return { results: await submitBatch(session, [envelopeFor(session, a.workspaceId, { kind: 'ticket', id: a.ticketId }, 'ticket.deleted', {})]) };
      },
    },
    {
      name: 'restore_ticket',
      description: 'Bring a deleted ticket back from Deleted items.',
      inputSchema: { workspaceId: id, ticketId: id },
      handler: async (args) => {
        const a = z.object({ workspaceId: id, ticketId: id }).parse(args);
        return { results: await submitBatch(session, [envelopeFor(session, a.workspaceId, { kind: 'ticket', id: a.ticketId }, 'ticket.restored', {})]) };
      },
    },
    {
      name: 'get_ticket_history',
      description: "A ticket's history: every recorded change, who made it, from where (web, phone, mcp) and when. Comment and description text is not repeated here; read it with list_comments / get_ticket.",
      inputSchema: { ticketId: id, cursor: z.string().regex(/^\d+$/).optional(), limit: z.number().int().min(1).max(1000).optional() },
      handler: async (args) => {
        const a = z.object({ ticketId: id, cursor: z.string().regex(/^\d+$/).optional(), limit: z.number().int().min(1).max(1000).optional() }).parse(args);
        const q = new URLSearchParams();
        if (a.cursor !== undefined) q.set('afterSeq', a.cursor);
        if (a.limit !== undefined) q.set('limit', String(a.limit));
        const qs = q.toString();
        try {
          const out = (await session.get(`/v1/tickets/${enc(a.ticketId)}/history${qs === '' ? '' : `?${qs}`}`)) as { ticketId: string; events: Parameters<typeof historyLine>[0][] };
          return { ticketId: out.ticketId, events: out.events.map(historyLine) };
        } catch (error) {
          if (error instanceof HttpError && error.status === 404) throw new Error('ticket not found or not visible to you');
          throw error;
        }
      },
    },
    {
      name: 'rank_ticket',
      description: 'Reorder a backlog ticket: put it right after the ticket `before` and/or right before the ticket `after` (both must be in the backlog).',
      inputSchema: { workspaceId: id, ticketId: id, before: id.optional(), after: id.optional() },
      handler: async (args) => {
        const a = z.object({ workspaceId: id, ticketId: id, before: id.optional(), after: id.optional() }).parse(args);
        if (a.before === undefined && a.after === undefined) throw new Error('rank_ticket needs before, after, or both');
        const rankOf = async (ticketId: string | undefined): Promise<string | null> => {
          if (ticketId === undefined) return null;
          const rank = (await readTicket(session, a.workspaceId, ticketId)).ticketState.rank ?? null;
          if (rank === null) throw new Error(`ticket ${ticketId} is not in the backlog, so nothing can be ranked beside it`);
          return rank;
        };
        const rank = rankBetween(await rankOf(a.before), await rankOf(a.after));
        return { results: await submitBatch(session, [envelopeFor(session, a.workspaceId, { kind: 'ticket', id: a.ticketId }, 'ticket.ranked', { rank })]) };
      },
    },
  ];
}
