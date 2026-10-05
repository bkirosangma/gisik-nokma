import type { EventEnvelope } from '@gisik-nokma/domain';
import { BACKLOG_STATE_ID, statesWithBacklog, ticketRankedPayload } from '@gisik-nokma/domain';
import type { Accept, EngineContext, Refusal } from '../engine.js';
import { REFUSAL_RULES, malformedPayloadDetail } from '../refusal-rules.js';
import { getTicketState } from './context-helpers.js';
import { ACCEPT, refuse } from './refusals.js';

/**
 * A ticket's manual order is a BACKLOG fact (backlog/closed spec §8.1): the
 * Backlog tab is the one surface that shows a rank, so a rank on a ticket that
 * has left it would be an order nobody can see, recorded in the ledger and
 * carried on every read. The door is therefore the engine's, not the payload
 * schema's — `ticketRankedPayload` judges the KEY (its alphabet, and the tail
 * no key can sort below), and this check judges the TICKET, which is the same
 * split `ticket.closed` has with `close-requires-terminal`.
 *
 * THE TEST IS `stateId`, NOT `stateCategory`, and the difference is not
 * pedantic: the universal `BACKLOG_STATE` is `category: 'open'`
 * (`packages/domain/src/workflow.ts:74`), so a category test would admit every
 * open ticket in the workspace — `"To do"` among them — and the backlog is not
 * a category, it is one reserved id no workflow can declare.
 *
 * A CLOSED ticket is caught here rather than by a flag test, because closing
 * does not clear `stateId` (spec §2 keeps the final state visible) — so a
 * closed ticket is terminal, not backlog, and the refusal names the state it
 * finished in.
 *
 * The entity-kind guard REFUSES a misfiled kind rather than accepting it,
 * naming the kind it actually points at — the shape every check in this file's
 * neighbourhood shares (`transition.ts:42-48`, `workflow-rebind.ts:44-50`,
 * `fields.ts:90-96`), and the one `close.ts`'s first cut got backwards. There
 * is deliberately NO `env.type` guard ahead of it: `close.ts` carries one only
 * because two handlers share that one file, and this file has a single handler
 * (`evaluate.ts` dispatch is by type). A guard here would be a branch no
 * product path reaches.
 */
export async function checkTicketRanked(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  if (env.entity.kind !== 'ticket') {
    return refuse(REFUSAL_RULES.malformedPayload,
      `This ticket.ranked event does not point at a ticket; it points at a ${env.entity.kind}.`);
  }
  const parsed = ticketRankedPayload.safeParse(env.payload);
  if (!parsed.success) {
    return refuse(REFUSAL_RULES.malformedPayload,
      `This ticket.ranked event's payload is malformed: ${malformedPayloadDetail(parsed.error)}`);
  }
  const ticket = await getTicketState(ctx, env.entity.id);
  if (ticket === null) return refuse(REFUSAL_RULES.unknownTicket, `This event ranks ticket ${env.entity.id}, but no such ticket is known.`);
  if (ticket.stateId !== BACKLOG_STATE_ID) {
    // The def is read ONLY for the name in the reason below, never for the
    // verdict — `stateId` is already the fact this refusal rests on — so an
    // unresolvable definition degrades the name to the bare state id rather
    // than turning a decided refusal into something weaker. `statesWithBacklog`
    // rather than `def.states`, because the synthetic Backlog state is appended
    // by that helper and never declared by a workflow. Both mirror
    // `checks/close.ts:42-43` exactly.
    const def = await ctx.getWorkflowDef(env, ticket.workflowId);
    const stateName = def === null ? ticket.stateId
      : (statesWithBacklog(def).find((state) => state.id === ticket.stateId)?.name ?? ticket.stateId);
    return refuse(REFUSAL_RULES.rankRequiresBacklog,
      `Only a backlog ticket can be ranked; this one is in "${stateName}".`);
  }
  return ACCEPT;
}
