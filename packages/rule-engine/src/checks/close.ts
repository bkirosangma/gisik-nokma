import type { EventEnvelope } from '@gisik-nokma/domain';
import { statesWithBacklog, ticketClosedPayload, ticketReopenedPayload } from '@gisik-nokma/domain';
import type { Accept, EngineContext, Refusal } from '../engine.js';
import { REFUSAL_RULES, malformedPayloadDetail } from '../refusal-rules.js';
import { getTicketState } from './context-helpers.js';
import { ACCEPT, refuse } from './refusals.js';

/**
 * The closed flag's two doors (backlog/closed spec §2, 2026-09-17). Closing is
 * only legal from a terminal state — the ticket's final state stays visible,
 * which is the owner's reason for a flag rather than a state — and reopening
 * is explicit: a closed ticket's transitions are refused in `transition.ts`
 * until `ticket.reopened` clears the flag. Same shape as every other check:
 * an `entity.kind` guard of its own, the ticket read through `getTicketState`,
 * the reason a whole sentence a person can act on.
 */
export async function checkTicketClosed(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  if (env.type !== 'ticket.closed' || env.entity.kind !== 'ticket') return ACCEPT;
  const parsed = ticketClosedPayload.safeParse(env.payload);
  if (!parsed.success) return refuse(REFUSAL_RULES.malformedPayload, malformedPayloadDetail(parsed.error));
  const ticket = await getTicketState(ctx, env.entity.id);
  if (ticket === null) return refuse(REFUSAL_RULES.unknownTicket, `This event closes ticket ${env.entity.id}, but no such ticket is known.`);
  if ((ticket.closed ?? null) !== null) return refuse(REFUSAL_RULES.alreadyClosed, 'This ticket is already closed.');
  if (ticket.stateCategory !== 'terminal') {
    const def = await ctx.getWorkflowDef(env, ticket.workflowId);
    const stateName = def === null ? ticket.stateId
      : (statesWithBacklog(def).find((state) => state.id === ticket.stateId)?.name ?? ticket.stateId);
    return refuse(REFUSAL_RULES.closeRequiresTerminal,
      `A ticket can only be closed from a terminal state; "${stateName}" is not one.`);
  }
  return ACCEPT;
}

export async function checkTicketReopened(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  if (env.type !== 'ticket.reopened' || env.entity.kind !== 'ticket') return ACCEPT;
  const parsed = ticketReopenedPayload.safeParse(env.payload);
  if (!parsed.success) return refuse(REFUSAL_RULES.malformedPayload, malformedPayloadDetail(parsed.error));
  const ticket = await getTicketState(ctx, env.entity.id);
  if (ticket === null) return refuse(REFUSAL_RULES.unknownTicket, `This event reopens ticket ${env.entity.id}, but no such ticket is known.`);
  if ((ticket.closed ?? null) === null) return refuse(REFUSAL_RULES.notClosed, 'This ticket is not closed.');
  return ACCEPT;
}
