import { DECISION_TYPE_ID, normaliseLinkLabel, ticketDecidedPayload, type EventEnvelope, type TicketLink, type TicketState } from '@gisik-nokma/domain';
import type { Accept, EngineContext, Refusal } from '../engine.js';
import { REFUSAL_RULES, malformedPayloadDetail } from '../refusal-rules.js';
import { getTicketState } from './context-helpers.js';
import { ACCEPT, refuse, sameOutcomeRefusal, staleFromRefusal, unknownOutcomeRefusal } from './refusals.js';

/**
 * A Decision's rules (wtg2 T6, spec DC-4 and DC-5). Every check here reads only `ctx.getEntityState`: a Decision is
 * recognised by `ticket.typeId === DECISION_TYPE_ID` (DC-1), never through a type definition, because the client precheck's
 * `contextFromCache` throws on `getTicketTypeDef` and runs these same functions.
 */

const sameLabel = (a: string | null, b: string | null): boolean =>
  a === null || b === null ? a === b : normaliseLinkLabel(a) === normaliseLinkLabel(b);

/**
 * A ticket's branches: its OWN outgoing `leads_to` entries, in the order they were added. An entry with `from` is a link
 * INTO this ticket, filed on its stream while it is a draft (drafts R42; `links.ts` reads the same distinction), so it
 * is never a branch of this one.
 */
export function branchesOf(ticket: TicketState): TicketLink[] {
  return (ticket.links ?? []).filter((link) => link.kind === 'leads_to' && link.from === undefined);
}

/** A Decision's outcomes: the labels of its branches, in the order they were added. */
export function outcomeLabels(ticket: TicketState): string[] {
  const labels: string[] = [];
  for (const link of branchesOf(ticket)) if (link.label !== undefined) labels.push(link.label);
  return labels;
}

/**
 * `ticket.decided`. The order is type, stale-from, then the outcome rules, so two people revising at once hear about each
 * other before they hear about labels. `from` absent equals `null` (DC-4): a first choice sends none, a revision and a
 * clear send what they saw. Clearing a decision that is not set is `decision.same-outcome`: it would record a revision
 * from null to null.
 */
export async function checkTicketDecided(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  if (env.type !== 'ticket.decided') return ACCEPT;
  if (env.entity.kind !== 'ticket') {
    return refuse(REFUSAL_RULES.malformedPayload, `This ticket.decided event does not point at a ticket; it points at a ${env.entity.kind}.`);
  }
  const parsed = ticketDecidedPayload.safeParse(env.payload);
  if (!parsed.success) {
    return refuse(REFUSAL_RULES.malformedPayload, `This ticket.decided event's payload is malformed: ${malformedPayloadDetail(parsed.error)}`);
  }
  const ticket = await getTicketState(ctx, env.entity.id);
  if (ticket === null) return refuse(REFUSAL_RULES.unknownTicket, `This event records a decision on ticket ${env.entity.id}, but no such ticket is known.`);
  if (ticket.typeId !== DECISION_TYPE_ID) return refuse('decision.not-a-decision');
  const { outcome, from } = parsed.data;
  const current = ticket.outcome ?? null;
  if (!sameLabel(from ?? null, current)) return refuse('decision.stale-from', staleFromRefusal(current));
  if (outcome === null) return current === null ? refuse('decision.same-outcome', sameOutcomeRefusal(null)) : ACCEPT;
  const labels = outcomeLabels(ticket);
  if (!labels.some((label) => sameLabel(label, outcome))) return refuse('decision.unknown-outcome', unknownOutcomeRefusal(outcome, labels));
  if (current !== null && sameLabel(current, outcome)) return refuse('decision.same-outcome', sameOutcomeRefusal(current));
  return ACCEPT;
}

/**
 * DC-5: a Decision with at least one branch and no outcome may not be finished. Shared by the transition door, the close
 * door and the client mirror, so the three cannot drift. Reads `TicketState.links` and `.outcome`, the facts the server
 * row, the replica and the memory context all fold. `branchNotTaken` is the one exemption (PS-5: the flow closes a
 * Decision that sits on a branch not taken); the callers pass it only AFTER `flowCauseForgery` has proved the actor.
 */
export function decisionOutcomeRequired(ticket: TicketState, branchNotTaken = false): Refusal | null {
  if (branchNotTaken || ticket.typeId !== DECISION_TYPE_ID || (ticket.outcome ?? null) !== null) return null;
  if (branchesOf(ticket).length === 0) return null;
  return refuse('decision.outcome-required');
}
