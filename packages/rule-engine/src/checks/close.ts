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
 * until `ticket.reopened` clears the flag.
 *
 * Same shape as every other check's entity-kind guard (`transition.ts:41-47`,
 * `workflow-rebind.ts:44-50`, `fields.ts:90-96`): a misfiled kind is a
 * malformed claim and is REFUSED, naming the kind it actually points at — it
 * is not silently accepted, which the first cut of this file got backwards
 * (fix round 1, review). The `env.type` check ahead of it is this file's own
 * addition, not a departure from the shape: two handlers share one file here,
 * and each first confirms the event is its own to judge — a mismatch there is
 * a stranger's event, accepted exactly as `evaluateEvent`'s dispatch already
 * guarantees, and never reaches the kind guard at all.
 */
export async function checkTicketClosed(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  if (env.type !== 'ticket.closed') return ACCEPT;
  if (env.entity.kind !== 'ticket') {
    return refuse(REFUSAL_RULES.malformedPayload,
      `This ticket.closed event does not point at a ticket; it points at a ${env.entity.kind}.`);
  }
  const parsed = ticketClosedPayload.safeParse(env.payload);
  if (!parsed.success) {
    return refuse(REFUSAL_RULES.malformedPayload,
      `This ticket.closed event's payload is malformed: ${malformedPayloadDetail(parsed.error)}`);
  }
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
  if (env.type !== 'ticket.reopened') return ACCEPT;
  if (env.entity.kind !== 'ticket') {
    return refuse(REFUSAL_RULES.malformedPayload,
      `This ticket.reopened event does not point at a ticket; it points at a ${env.entity.kind}.`);
  }
  const parsed = ticketReopenedPayload.safeParse(env.payload);
  if (!parsed.success) {
    return refuse(REFUSAL_RULES.malformedPayload,
      `This ticket.reopened event's payload is malformed: ${malformedPayloadDetail(parsed.error)}`);
  }
  const ticket = await getTicketState(ctx, env.entity.id);
  if (ticket === null) return refuse(REFUSAL_RULES.unknownTicket, `This event reopens ticket ${env.entity.id}, but no such ticket is known.`);
  if ((ticket.closed ?? null) === null) return refuse(REFUSAL_RULES.notClosed, 'This ticket is not closed.');
  return ACCEPT;
}
