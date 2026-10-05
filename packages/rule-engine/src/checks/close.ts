import type { EventEnvelope } from '@gisik-nokma/domain';
import { statesWithBacklog, ticketClosedPayload, ticketReopenedPayload } from '@gisik-nokma/domain';
import type { Accept, EngineContext, Refusal } from '../engine.js';
import { REFUSAL_RULES, malformedPayloadDetail } from '../refusal-rules.js';
import { getTicketState } from './context-helpers.js';
import { flowCauseForgery } from './flow-cause.js';
import { ACCEPT, refuse } from './refusals.js';

/**
 * The closed flag's two doors (backlog/closed spec §2, 2026-09-17). Closing is
 * only legal from a terminal state — the ticket's final state stays visible,
 * which is the owner's reason for a flag rather than a state — and reopening
 * is explicit: a closed ticket's transitions are refused in `transition.ts`
 * until `ticket.reopened` clears the flag.
 *
 * And closing is only legal over finished children (E6-8, 2026-09-21): a
 * parent may not be closed while any of its children is non-terminal — the
 * parent-terminal invariant, held here at the LAST door. `transition.ts`
 * refuses a parent ENTERING terminal over open children (case 4.23), but a
 * workflow republish reaches the same relation without a transition — a kept
 * state promoted to `terminal`, or a dropped open state mapped onto a
 * terminal one — and `workflow-defined.ts` accepts both deliberately, because
 * publish legality never depends on where tickets sit (owner, 2026-08-26:
 * occupancy is a builder courtesy, never an engine input). So the parent can
 * legitimately sit in a terminal category over open work, and this check is
 * what keeps that from becoming a CLOSED parent over open work — by a person
 * through the sheet, or unattended by the auto-close sweep
 * (`apps/server/src/auto-close/sweep.ts`, whose SELECT mirrors this
 * predicate so it never builds a close this door refuses). The same rule id
 * as the transition-side refusal, `parent-terminal-with-open-children`: one
 * invariant, one id, and every consumer that handles it needs no new branch.
 * The open-child predicate is the transition guard's, line for line
 * (`stateCategory !== 'terminal'` over `getChildrenStates`), and the two must
 * move together — E6-4 (soft-deleted children) is the change that will move
 * them.
 *
 * Same shape as every other check's entity-kind guard (`transition.ts:42-48`,
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
  // wtg2 T8: only the flow may close "Not taken"; a forged cause hears so before the terminal check (29.203).
  const forged = flowCauseForgery(env, parsed.data.cause);
  if (forged !== null) return forged;
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
  // After the terminal check, deliberately: "not terminal" is the more
  // fundamental refusal, and a parent in an open state with open children
  // should hear that first (the remedy is different, and the children may
  // finish before it does).
  const children = await ctx.getChildrenStates(ticket.id);
  // A DRAFT child is not open work (drafts spec): it is private to its author, so counting it would refuse a close
  // over work no view shows, and the refusal's number would disclose it. Mirrored by the auto-close sweep's
  // `NOT EXISTS` (`apps/server/src/auto-close/sweep.ts`), which must answer alike.
  const openCount = children.filter((child) => child.stateCategory !== 'terminal' && child.draft === undefined).length;
  if (openCount > 0) {
    return refuse(REFUSAL_RULES.parentTerminal,
      `This ticket cannot be closed while ${openCount} of its child tickets ${openCount === 1 ? 'is' : 'are'} still open.`);
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
  // wtg2 T8: only the flow may reopen for a loop reset; a forged cause hears so before the not-closed check (29.203).
  const forged = flowCauseForgery(env, parsed.data.cause);
  if (forged !== null) return forged;
  const ticket = await getTicketState(ctx, env.entity.id);
  if (ticket === null) return refuse(REFUSAL_RULES.unknownTicket, `This event reopens ticket ${env.entity.id}, but no such ticket is known.`);
  if ((ticket.closed ?? null) === null) return refuse(REFUSAL_RULES.notClosed, 'This ticket is not closed.');
  return ACCEPT;
}
