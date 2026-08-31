import type { EventEnvelope } from '@gisik-nokma/domain';
import { BUILTIN_TICKET_TYPE_SEEDS, ticketTypeDefSchema } from '@gisik-nokma/domain';
import type { Accept, EngineContext, Refusal } from '../engine.js';
import { REFUSAL_RULES, malformedPayloadDetail } from '../refusal-rules.js';
import { ACCEPT, builtinRankRefusal, refuse } from './refusals.js';

/**
 * The built-in rank lock — `ticket-type.defined`.
 *
 * Added at Plan 8's walk (2026-08-27), closing the half of its Open question 6
 * that stayed open: the type builder locks the built-in types' ranks **in the
 * UI**, and the server's last-definition-wins accepted a re-rank anyway. A lock
 * the server does not hold is a description of a rule, not a rule.
 *
 * `_ctx` is unread on purpose. Nothing here is a question about workspace
 * state: the seeds are canonical constants, and last-definition-wins means the
 * type's own history says nothing about whether THIS definition is allowed. A
 * check that consulted the context would be claiming otherwise.
 */
export async function checkTicketTypeDefined(
  env: EventEnvelope,
  _ctx: EngineContext,
): Promise<Accept | Refusal> {
  // Two layers, exactly as the hierarchy checks (pre-flight A19). The kind here
  // is `'ticket-type'`, not `'ticket'`: the type has its own entity kind and its
  // own stream (`vocabulary.ts`, `TICKET_EVENT_TYPES`'s comment).
  if (env.entity.kind !== 'ticket-type') {
    return {
      refused: true,
      rule: REFUSAL_RULES.malformedPayload,
      reason: `This ticket-type.defined event does not point at a ticket type; it points at a ${env.entity.kind}.`,
    };
  }

  const parsed = ticketTypeDefSchema.safeParse(env.payload);
  if (!parsed.success) {
    const detail = malformedPayloadDetail(parsed.error);
    return {
      refused: true,
      rule: REFUSAL_RULES.malformedPayload,
      reason: `This ticket-type.defined event's payload is malformed: ${detail}`,
    };
  }
  const def = parsed.data;

  // Looked up BY ID against the seeds, which carry only `{ id, name, icon, rank }`
  // — no `workflowId`, no `fields` (pre-flight A18). The full definitions come
  // from `builtinTicketTypeDefs(defaultWorkflowId)`, and a workspace's binding is
  // its own; only the rank is compared here.
  const seed = BUILTIN_TICKET_TYPE_SEEDS.find((builtin) => builtin.id === def.id);

  // Name, icon and workflow binding of a built-in are an admin's to change
  // (Plan 8 decision 7); the RANK is the ladder itself. Custom types may
  // re-rank — the reparent cycle check is load-bearing for exactly that case
  // (design decision 6) — but the four built-ins are the fixed points the ladder
  // hangs on, `DEEPEST_RANK` above all: it is 4 *because* the built-in
  // sub-task's rank is, so re-ranking `sub-task` to 3 releases every sub-task
  // from `hierarchy.deepest-rank-parent-required` while the builder still
  // displays the lock.
  if (seed !== undefined && def.rank !== seed.rank) {
    return refuse('type.builtin-rank', builtinRankRefusal(def.name, seed.id, seed.rank));
  }

  return ACCEPT;
}
