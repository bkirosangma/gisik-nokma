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
 *
 * ## What a CUSTOM re-rank does to tickets already placed — a decision (E6-3)
 *
 * The rank invariants are write-time invariants: a child's type outranks its
 * parent's and a type at or below `DEEPEST_RANK` always has a parent are asked
 * of every `ticket.created` and `ticket.reparented` against the definitions
 * current at that moment (`hierarchy.ts`, four sites) and are NOT re-asked of
 * tickets already placed when a type's rank changes. So a custom type
 * re-ranked from 2 to 3 while tasks (rank 3) sit under it is ACCEPTED here,
 * and the ledger then holds a placement the write doors refuse to reproduce
 * — a task moved out from under such a feature cannot be moved back, and a
 * feature re-ranked to the deepest rank keeps its place at the root while a
 * new one may not (measured in `test/ticket-type-rerank.test.ts`, case 5.76).
 *
 * That is the product's position, not a gap left for later, and the reason is
 * the owner's (2026-08-26, Plan 2 open question 6, restated at
 * `workflow-defined.ts`'s stranding block): occupancy is a builder courtesy,
 * never an engine input. A replica is visibility-scoped, so an engine whose
 * verdict on a DEFINITION depended on where tickets sit would answer one way
 * on the server and another on a client by construction — the thing the
 * shared fixture suite exists to prevent. It is the same shape as re-pointing
 * a type's workflow (case 5.32): existing tickets stay where they are, and
 * the definition describes what happens from now on. The type editor says so
 * at the moment the rank is changed ("Tickets already placed keep their
 * place", `ticket-type-editor-screen.tsx`), so the admin decides with the
 * consequence in front of them rather than meeting it at the next reparent.
 *
 * The alternative the review proposed — refuse the re-rank with a count of
 * the tickets it would misplace — needs a context method that enumerates a
 * type's tickets (nothing on `EngineContext` does; `getChildrenStates` and
 * `getEntityState` are keyed by ticket id), which the `countWorkspaceOwners`
 * precedent shows how to add server-only, and it makes a definition's legality
 * an occupancy question. That is an owner ruling, not a lane's call; until it
 * is made, this check stays as it is and the sentence above stays true.
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
  // (design decision 6) — but the built-ins are the fixed points the ladder
  // hangs on, `DEEPEST_RANK` above all: it is 4 *because* the built-in
  // sub-task's rank is, so re-ranking `sub-task` to 3 releases every sub-task
  // from `hierarchy.deepest-rank-parent-required` while the builder still
  // displays the lock.
  if (seed !== undefined && def.rank !== seed.rank) {
    return refuse('type.builtin-rank', builtinRankRefusal(def.name, seed.id, seed.rank));
  }

  return ACCEPT;
}
