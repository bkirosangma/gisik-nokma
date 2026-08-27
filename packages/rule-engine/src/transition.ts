import { ticketTransitionedPayloadSchema, type EventEnvelope } from '@gisik-nokma/domain';
import { REFUSAL_RULES } from './refusal-rules.js';
import { resolveCurrentStateId } from './version-map.js';
import type { Accept, EngineContext, Refusal } from './engine.js';

export async function evaluateTicketTransitioned(
  env: EventEnvelope,
  ctx: EngineContext,
): Promise<Accept | Refusal> {
  // Two layers, by design, exactly as in workflow-defined.ts: the fixture
  // suite and Plan 10's offline replica enter at evaluateEvent and never pass
  // through ingest's door, so the engine keeps its own kind check. On the
  // server the door answers first — though not yet with this sentence:
  // 'ticket.transitioned' is not a registered event type until Plan 3, so
  // today `parseEvent` refuses it as unknown-event-type before any kind is
  // examined. Once Plan 3 registers it against entity kind 'ticket', that
  // door refuses a misfiled kind and this check never runs server-side. It
  // still runs everywhere else, and says the same sentence in the same words
  // — a person who meets this refusal twice should not have to work out
  // whether it is the same refusal.
  if (env.entity.kind !== 'ticket') {
    return {
      refused: true,
      rule: REFUSAL_RULES.malformedPayload,
      reason: `This ticket.transitioned event does not point at a ticket; it points at a ${env.entity.kind}.`,
    };
  }

  const parsed = ticketTransitionedPayloadSchema.safeParse(env.payload);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((issue) => issue.message).join('; ');
    return {
      refused: true,
      rule: REFUSAL_RULES.malformedPayload,
      reason: `This ticket.transitioned event's payload is malformed: ${detail}`,
    };
  }
  const payload = parsed.data;

  const entity = await ctx.getEntityState('ticket', env.entity.id);
  if (entity === null || entity.kind !== 'ticket') {
    return {
      refused: true,
      rule: REFUSAL_RULES.unknownTicket,
      reason: `This event moves ticket ${env.entity.id}, but no such ticket is known.`,
    };
  }
  const ticket = entity;

  const latest = await ctx.getWorkflowDef(ticket.workflowId);
  if (latest === null) {
    return {
      refused: true,
      rule: REFUSAL_RULES.unknownWorkflow,
      reason: `Ticket ${ticket.id} uses workflow ${ticket.workflowId}, but no published definition of that workflow is known.`,
    };
  }

  const resolved = await resolveCurrentStateId(ticket, latest, ctx);
  if (!resolved.ok) {
    return {
      refused: true,
      rule: REFUSAL_RULES.strandedState,
      reason: `Ticket ${ticket.id} sits in state "${resolved.unmappedStateId}" of workflow version ${ticket.workflowVersion}, which no longer exists in version ${latest.version} and no state mapping covers it.`,
    };
  }

  const toState = latest.states.find((state) => state.id === payload.to);
  if (toState === undefined) {
    return {
      refused: true,
      rule: REFUSAL_RULES.unknownState,
      reason: `The workflow "${latest.name}" has no state "${payload.to}".`,
    };
  }

  const fromName = latest.states.find((state) => state.id === resolved.stateId)?.name ?? resolved.stateId;
  const transition =
    latest.transitions.find((t) => t.from === resolved.stateId && t.to === payload.to) ??
    latest.transitions.find((t) => t.from === '*' && t.to === payload.to);
  if (transition === undefined) {
    return {
      refused: true,
      rule: REFUSAL_RULES.illegalTransition,
      reason: `The workflow "${latest.name}" does not allow moving from "${fromName}" to "${toState.name}".`,
    };
  }

  // Invariant above all workflows (spec invariant 3): parents cannot outrun
  // children. Runs before any authored rule; no definition can switch it off.
  if (toState.category === 'terminal') {
    const children = await ctx.getChildrenStates(ticket.id);
    const openCount = children.filter((child) => child.stateCategory !== 'terminal').length;
    if (openCount > 0) {
      return {
        refused: true,
        rule: REFUSAL_RULES.parentTerminal,
        reason: `This ticket cannot enter "${toState.name}" while ${openCount} of its child tickets ${openCount === 1 ? 'is' : 'are'} still open.`,
      };
    }
  }

  // TASK 8 replaces this acceptance with the transition-rule evaluation.
  return { refused: false };
}
