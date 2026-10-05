import { z } from 'zod';
import { draftNotAllowedReason, estimateValueSchema, linkPayloadDirection, PRIORITIES, rankBetween, TICKET_LINK_KINDS, withheldLinkPayload, type TicketLinkKind } from '@gisik-nokma/domain';
import { spliceDoc, type BodyEdit } from '@gisik-nokma/editor/markdown-doc';
import { HttpError } from '../http-client.js';
import type { Session } from '../session.js';
import { markdownBody, MARKDOWN_SYNTAX_HELP } from './markdown-io.js';
import { isDraftDetail } from './flow-seams.js';
import { linkEvent, pickLink, relabelStored, type LinkEnd, type LinkRow } from './link-events.js';
import { confirmOrPreview } from './preview.js';
import type { ToolDefinition } from './read-tools.js';
import { readOrNotFound } from './reads.js';
import { envelopeFor, submitBatch, submitBatchByIndex, submitOne, type EventResult } from './submit.js';

export type TicketDetailWire = {
  key: string | null;
  title: string;
  ticketState: {
    fields: Record<string, { value: unknown }>;
    rank?: string | null;
    workflowId: string;
    /** Present only on the author's own draft (drafts G7). */
    draft?: { authorId: string; at: string; discarded?: boolean };
    typeId?: string; stateId?: string; stateCategory?: string; workflowVersion?: number; parentId?: string | null;
    outcome?: string | null; links?: Array<{ kind: string; targetId: string; label?: string | null }>;
  };
  rollup?: { totalChildren?: number } | null;
};
const id = z.string().min(1);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a day in YYYY-MM-DD form');
const BUILT_IN = new Set(['title', 'description', 'priority', 'startDate', 'dueDate', 'estimate', 'reworkEstimate', 'waitForAll']);
const enc = encodeURIComponent;

export const TICKET_NOT_FOUND = 'ticket not found or not visible to you';

export async function readTicket(session: Session, workspaceId: string, ticketId: string): Promise<TicketDetailWire> {
  try {
    return (await session.get(`/v1/workspaces/${enc(workspaceId)}/tickets/${enc(ticketId)}`)) as TicketDetailWire;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) throw new Error(TICKET_NOT_FOUND);
    throw error;
  }
}

const updateShape = {
  workspaceId: id, ticketId: id, title: z.string().min(1).optional(), markdown: z.string().optional(),
  mode: z.enum(['replace', 'append', 'replace_section']).optional(), section: z.string().optional(),
  priority: z.enum(PRIORITIES).optional(), startDate: day.nullable().optional(), dueDate: day.nullable().optional(),
  estimate: estimateValueSchema.nullable().optional(), reworkEstimate: estimateValueSchema.nullable().optional(),
  fields: z.record(z.string().min(1), z.unknown()).optional(), parentId: id.nullable().optional(),
  addCollaborators: z.array(id).optional(), removeCollaborators: z.array(id).optional(),
  workflow: z.object({ toWorkflowId: id, toStateId: id }).optional(),
};

/** A `leads_to` branch label (Graph Part 2 LK-2: 1 to 60 characters, trimmed). */
const label = z.string().trim().min(1).max(60).optional();
const linkShape = {
  workspaceId: id, ticketId: id, targetId: id,
  kind: z.enum(TICKET_LINK_KINDS), action: z.enum(['add', 'remove', 'relabel']), label,
};

/** The other end of a link the server withheld from this caller, as a line's payload names it. */
const HIDDEN_END = "a ticket you can't see";
/** A person the server withheld from this caller, as a flow cause's `triggeredBy` / `decidedBy` names them (wtg2 T8). */
const HIDDEN_ACTOR = "someone you can't see";
const FLOW_CAUSE_EVENT_TYPES: readonly string[] = ['ticket.transitioned', 'ticket.closed', 'ticket.reopened'];

/**
 * A flow cause with its withheld ids phrased (wtg2 T8, 29.208): a ticket id the server nulled (`sourceTicketId`,
 * `decisionTicketId`) reads as a hidden ticket, a person it nulled (`triggeredBy`, `decidedBy`) as a hidden person. Every
 * other member, the kind, outcome, label and pass among them, is kept. Any other cause passes through untouched.
 */
function phrasedCause(cause: unknown): unknown {
  if (typeof cause !== 'object' || cause === null) return cause;
  const phrased: Record<string, unknown> = { ...(cause as Record<string, unknown>) };
  for (const key of ['sourceTicketId', 'decisionTicketId']) if (phrased[key] === null) phrased[key] = HIDDEN_END;
  for (const key of ['triggeredBy', 'decidedBy']) if (phrased[key] === null) phrased[key] = HIDDEN_ACTOR;
  return phrased;
}

/** A payload without any document in it (owner question Q4): the ledger's facts, never a body. One rule for a line and for a contested claim's original. */
export function redactedPayload(type: string, eventId: string, rawPayload: Record<string, unknown>): Record<string, unknown> {
  const payload = FLOW_CAUSE_EVENT_TYPES.includes(type) && 'cause' in rawPayload
    ? { ...rawPayload, cause: phrasedCause(rawPayload['cause']) }
    : rawPayload;
  if (type === 'ticket.link_added' || type === 'ticket.link_removed') {
    if (payload['targetId'] !== null) return payload;
    // Withheld (typed-links T4b). A draft-side `from` entry hides its SOURCE: its target is this ticket (drafts T6 FIX 1).
    // A `leads_to` label is kept on 'out', the visible source's branch (workflow-timeline-graphs LK-6, planner ruling
    // 2026-10-04 13:01), and dropped on 'in', where the hidden end IS the source (planner ruling 2026-10-05 00:13). The
    // domain's `withheldLinkPayload` decides it, here as at the server's doors: no second copy of the rule (29.126).
    const direction = linkPayloadDirection(payload);
    const { label } = withheldLinkPayload(payload['kind'] as TicketLinkKind, direction, payload['label'] as string | undefined);
    const kept = label === undefined ? {} : { label };
    return direction === 'in'
      ? { kind: payload['kind'], from: HIDDEN_END, ...kept }
      : { kind: payload['kind'], target: HIDDEN_END, ...kept };
  }
  if (type === 'ticket.decided' && Array.isArray(payload['closeStarted'])) {
    // wtg2 T5: the outcome label stays (it names the Decision's branch); a withheld id among the started tickets the
    // person asked the settle to close is phrased like a link's hidden end (the route that nulls it is T17's).
    return { ...payload, closeStarted: (payload['closeStarted'] as unknown[]).map((v) => (v === null ? HIDDEN_END : v)) };
  }
  if (type === 'comment.added') return { commentId: eventId };
  if (type === 'comment.edited' || type === 'comment.deleted') return { commentId: payload['commentId'] };
  if (type === 'ticket.field_set' && payload['fieldId'] === 'description') return { fieldId: 'description' };
  if (type === 'ticket.transitioned' && 'comment' in payload) {
    // A transition's own comment is a comment body (`{ text }`): the move is the fact, the words are list_comments'.
    const { comment: _omit, ...rest } = payload;
    return rest;
  }
  if (type === 'ticket.created' && 'description' in payload) {
    const { description: _omit, ...rest } = payload;
    return rest;
  }
  if (type === 'claim.contested' && typeof payload['originalEvent'] === 'object' && payload['originalEvent'] !== null) {
    // The refused claim rides along WHOLE: keep what was refused (its type and id), drop its text.
    const original = payload['originalEvent'] as { id: string; type: string; payload: Record<string, unknown> };
    return { rule: payload['rule'], reason: payload['reason'], originalEvent: { id: original.id, type: original.type, payload: redactedPayload(original.type, original.id, original.payload ?? {}) } };
  }
  return payload;
}

/**
 * One `get_ticket_history` line. A link event keeps the server's two labels: `linkTarget` (`{ key }` of the other end, or
 * `null` for one this caller cannot see; typed-links T4) and `linkDirection` (`'in'` for a draft-side link that points into
 * this ticket, else `'out'`; drafts T6 FIX 1).
 */
function historyLine(e: {
  id: string; type: string; payload: Record<string, unknown>; actorId: string; origin: string; serverTime: string;
  linkTarget?: { key: string | null } | null; linkDirection?: 'out' | 'in';
}) {
  return {
    eventId: e.id, type: e.type, actorId: e.actorId, origin: e.origin, serverTime: e.serverTime, payload: redactedPayload(e.type, e.id, e.payload),
    ...(e.linkTarget === undefined ? {} : { linkTarget: e.linkTarget }),
    ...(e.linkDirection === undefined ? {} : { linkDirection: e.linkDirection }),
  };
}

const closeManyShape = {
  workspaceId: id,
  ticketIds: z.array(id).min(1).max(100),
  // A string or a number, and NOT `.int()`: 3.5 must reach the preview, not a schema error (CT-9).
  confirm_count: z.union([z.string(), z.number()]).optional(),
};
const CLOSE_OUTCOME_UNKNOWN =
  'gisik-nokma did not report what happened to every ticket, so which ones closed is unknown. Do not assume any closed or any left open; read them again with list_tickets before doing anything else';

/** "a, b and c"; "a"; "". */
function inWords(items: string[]): string {
  return items.length < 2 ? (items[0] ?? '') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

function closeRow(ticketId: string, r: EventResult) {
  if (r.status === 'committed') return { ticketId, status: 'closed' as const, eventId: r.eventId, seq: r.seq };
  if (r.status === 'refused') return { ticketId, status: 'refused' as const, rule: r.rule, reason: r.reason };
  return { ticketId, status: 'invalid' as const, code: r.code, message: r.message };
}

export function ticketTools(session: Session): ToolDefinition[] {
  const me = (userId: string): string => (userId === 'me' ? session.userId() : userId);
  return [
    {
      name: 'update_ticket',
      description:
        'Change a ticket in one go: title; description (markdown, mode "replace" (default) / "append" / "replace_section" with `section` = a heading\'s exact text); ' +
        'priority P1–P3; startDate / dueDate (YYYY-MM-DD, null clears); estimate / reworkEstimate (whole days 1–365, null clears); custom `fields` by field id; parentId (null = top level); ' +
        `addCollaborators / removeCollaborators ("me" works); workflow { toWorkflowId, toStateId }. Every rule is the product's. ${MARKDOWN_SYNTAX_HELP}`,
      inputSchema: updateShape,
      handler: async (args) => {
        const a = z.object(updateShape).parse(args);
        const t = { kind: 'ticket' as const, id: a.ticketId };
        const ev = (type: string, payload: unknown) => envelopeFor(session, a.workspaceId, t, type, payload);
        const set = (fieldId: string, value: unknown) => ev('ticket.field_set', { fieldId, value });
        for (const key of Object.keys(a.fields ?? {})) {
          if (BUILT_IN.has(key)) throw new Error(`"${key}" is a built-in field: use ${key === 'waitForAll' ? 'the set_wait_for_all tool' : `the ${key} argument`}`);
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
        if (a.estimate !== undefined) events.push(set('estimate', a.estimate));
        if (a.reworkEstimate !== undefined) events.push(set('reworkEstimate', a.reworkEstimate));
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
      name: 'close_tickets',
      description:
        'Close several tickets at once (1-100 ticketIds), as the List view\'s Bulk close does: one close per ticket, each decided by the product\'s own rules ' +
        '(a ticket closes only from a terminal state, and not while it has open children). Two calls: without confirm_count you get a preview that names every ' +
        'ticket and nothing changes; repeat the call with confirm_count set to the number of tickets to close them. The answer lists every ticket as closed or ' +
        'refused (with the product\'s reason); a refused ticket stays open and the rest are still closed. Undo with reopen_ticket.',
      inputSchema: closeManyShape,
      handler: async (args) => {
        const a = z.object(closeManyShape).parse(args);
        const repeated = a.ticketIds.find((ticketId, i) => a.ticketIds.indexOf(ticketId) !== i);
        if (repeated !== undefined) throw new Error(`ticketIds lists ${repeated} more than once; list each ticket once`);
        const count = a.ticketIds.length;
        // The count binds the SIZE of the batch, not its members: a different list of the same length is a new batch the caller chose (spec §5.7).
        const preview = await confirmOrPreview(String(count), a.confirm_count === undefined ? undefined : String(a.confirm_count), async () => {
          const named: string[] = [];
          for (const ticketId of a.ticketIds) {
            try {
              const ticket = await readTicket(session, a.workspaceId, ticketId);
              named.push(`${ticket.key ?? ticketId} "${ticket.title}"`);
            } catch (error) {
              // Hidden and missing look the same on purpose (no existence oracle).
              if (error instanceof Error && error.message === TICKET_NOT_FOUND) named.push(`one you cannot see (${ticketId})`);
              else throw error;
            }
          }
          return {
            sentence: `Closes ${count} ticket${count === 1 ? '' : 's'}: ${inWords(named)}. The server decides each close; a ticket that is not in a terminal state, or has open children, will be refused and left open.`,
            counts: { tickets: count },
          };
        }, 'confirm_count');
        if (preview !== null) return preview;
        const events = a.ticketIds.map((ticketId) => envelopeFor(session, a.workspaceId, { kind: 'ticket', id: ticketId }, 'ticket.closed', {}));
        const results = await submitBatchByIndex(session, events, CLOSE_OUTCOME_UNKNOWN);
        const rows = a.ticketIds.map((ticketId, i) => closeRow(ticketId, results[i]!));
        return { closed: rows.filter((r) => r.status === 'closed').length, refused: rows.filter((r) => r.status !== 'closed').length, results: rows };
      },
    },
    {
      name: 'delete_ticket',
      description: 'Move a ticket to Deleted items (restorable for 15 days with restore_ticket). confirm_name must be the ticket KEY (e.g. CCSO-4); without it you get a preview and nothing changes. A draft cannot be deleted: use discard_draft.',
      inputSchema: { workspaceId: id, ticketId: id, confirm_name: z.string().optional() },
      handler: async (args) => {
        const a = z.object({ workspaceId: id, ticketId: id, confirm_name: z.string().optional() }).parse(args);
        const ticket = await readTicket(session, a.workspaceId, a.ticketId);
        // A draft has no key to confirm with, and G1 refuses the delete anyway: say so in its words, before any preview.
        if (ticket.ticketState.draft !== undefined) {
          throw new Error(`refused by draft.not-allowed: ${draftNotAllowedReason('ticket.deleted')}`);
        }
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
    {
      name: 'link_tickets',
      description:
        'Add, remove or relabel a typed link between two tickets: kind "blocks" (ticketId blocks targetId), "relates" (either way), "duplicates" ' +
        '(ticketId duplicates the original, targetId) or "leads_to" (ticketId leads to targetId: an arrow in the flow; a Decision\'s arrows each need a `label`, ' +
        'the outcome that sends the flow that way, 1–60 characters). action "add", "remove" or "relabel" (leads_to only, with the new `label`). ' +
        'Removing works from either end; if a loop stores both directions between two tickets, the one leaving ticketId is removed. ' +
        'A link to or from one of your drafts lives on the draft and is private to you until it is published. Every rule is the product\'s.',
      inputSchema: linkShape,
      handler: async (args) => {
        const a = z.object(linkShape).parse(args);
        if (a.label !== undefined && a.kind !== 'leads_to') throw new Error('label only applies to "leads_to" links');
        if (a.action === 'remove' && a.label !== undefined) throw new Error('remove takes no label: it removes the link between the two tickets');
        // A label already means kind "leads_to" (the first guard), so a relabel needs only the label to be there.
        if (a.action === 'relabel' && a.label === undefined) throw new Error('relabel needs kind "leads_to" and the new label');
        // Each end's draft flag decides the stream (Drafts R42): an end this caller cannot read is the uniform sentence.
        const endOf = async (ticketId: string): Promise<LinkEnd> => ({ id: ticketId, draft: isDraftDetail(await readTicket(session, a.workspaceId, ticketId)) });
        const linksOf = async (ticketId: string): Promise<LinkRow[]> =>
          ((await readOrNotFound(session, `/v1/workspaces/${enc(a.workspaceId)}/tickets/${enc(ticketId)}/links`, 'ticket')) as { links: LinkRow[] }).links;
        if (a.action === 'add') {
          const [source, target] = await Promise.all([endOf(a.ticketId), endOf(a.targetId)]);
          return { result: await submitOne(session, linkEvent(session, a.workspaceId, 'ticket.link_added', { kind: a.kind, source, target, label: a.label })) };
        }
        const links = await linksOf(a.ticketId);
        const found = pickLink(links, a.kind, a.targetId);
        if (found === undefined) throw new Error(`no "${a.kind}" link between ${a.ticketId} and ${a.targetId} that you can see`);
        // The stored source decides the stream (spec A §2.2): find the link as the app shows it.
        const [sourceId, targetId] = found.direction === 'out' ? [a.ticketId, a.targetId] : [a.targetId, a.ticketId];
        const [source, target] = await Promise.all([endOf(sourceId), endOf(targetId)]);
        const stored = { kind: a.kind, source, target, label: found.label };
        if (a.action === 'remove') return { result: await submitOne(session, linkEvent(session, a.workspaceId, 'ticket.link_removed', stored)) };
        // The other branches are the stored SOURCE's outgoing labels, read from its own list when the call names the target end.
        // Only a `leads_to` row carries a label (Graph Part 2 LK-2), so the labelled outgoing rows are exactly those branches.
        const sourceLinks = sourceId === a.ticketId ? links : await linksOf(sourceId);
        const others = sourceLinks
          .filter((l) => l.direction === 'out' && l.ticket.id !== targetId)
          .flatMap((l) => (l.label === undefined ? [] : [l.label]));
        return { results: await relabelStored(session, a.workspaceId, stored, others, a.label as string) };
      },
    },
  ];
}
