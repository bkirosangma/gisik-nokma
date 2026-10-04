import type { EventEnvelope, TicketLinkKind, TicketState } from '@gisik-nokma/domain';
import { ticketLinkAddedPayload } from '@gisik-nokma/domain';
import type { Accept, EngineContext, Refusal } from '../engine.js';
import { REFUSAL_RULES, malformedPayloadDetail } from '../refusal-rules.js';
import { getTicketState } from './context-helpers.js';
import { ACCEPT, linkExistsRefusal, refuse } from './refusals.js';

const holds = (t: TicketState, kind: TicketLinkKind, targetId: string): boolean =>
  (t.links ?? []).some((l) => l.kind === kind && l.targetId === targetId);
const titleOf = (t: TicketState): string => {
  const v = t.fields['title']?.value;
  return typeof v === 'string' && v !== '' ? v : t.id;
};

/**
 * Typed links, rules 1–5 (spec A §2.3) plus `link.absent`. Both tickets' links
 * come from `getEntityState`, which on the server is `proj_tickets.links`
 * (typed-links T2) and on the client the cache (`precheck.ts`). The rules
 * about WHO may link (6, 7) are the permission gate's, because they need
 * `canSee`, which this context does not carry.
 *
 * A deleted SOURCE never reaches here: `checkTicketLive` refuses it ahead of
 * the dispatch (`evaluate.ts`). The two event types share one payload shape,
 * so one schema parses both.
 */
export async function checkTicketLink(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  if (env.entity.kind !== 'ticket') {
    return refuse(REFUSAL_RULES.malformedPayload,
      `This ${env.type} event does not point at a ticket; it points at a ${env.entity.kind}.`);
  }
  const parsed = ticketLinkAddedPayload.safeParse(env.payload);
  if (!parsed.success) {
    return refuse(REFUSAL_RULES.malformedPayload,
      `This ${env.type} event's payload is malformed: ${malformedPayloadDetail(parsed.error)}`);
  }
  const { kind, targetId } = parsed.data;
  const source = await getTicketState(ctx, env.entity.id);
  if (source === null) return refuse(REFUSAL_RULES.unknownTicket, `This event links ticket ${env.entity.id}, but no such ticket is known.`);
  if (env.type === 'ticket.link_removed') return holds(source, kind, targetId) ? ACCEPT : refuse('link.absent');

  if (targetId === source.id) return refuse('link.self');
  const target = await getTicketState(ctx, targetId);
  if (target === null || target.workspaceId !== env.workspaceId) return refuse('link.unknown-target');
  if ((target.deleted ?? null) !== null) return refuse('link.target-deleted');
  if (holds(source, kind, targetId)) return refuse('link.duplicate', linkExistsRefusal(kind, titleOf(source), titleOf(target)));
  if (holds(target, kind, source.id)) {
    // `relates` is unordered, so its stored reverse IS a duplicate (rule 3);
    // for blocks and duplicates it is the direct reverse (rules 4 and 5).
    return refuse(kind === 'relates' ? 'link.duplicate' : 'link.reverse', linkExistsRefusal(kind, titleOf(target), titleOf(source)));
  }
  return ACCEPT;
}
