import { validateWorkflowDef, workflowDefinedPayloadSchema, type EventEnvelope } from '@gisik-nokma/domain';
import { REFUSAL_RULES, malformedPayloadDetail } from './refusal-rules.js';
import type { Accept, EngineContext, Refusal } from './engine.js';

export async function evaluateWorkflowDefined(
  env: EventEnvelope,
  ctx: EngineContext,
): Promise<Accept | Refusal> {
  // Two layers, by design: on the server `parseEvent` refuses a misfiled
  // entity kind at the door and this check never runs, but the fixture suite
  // and Plan 10's offline replica enter at evaluateEvent and never pass
  // through that door, so the engine keeps its own check. Same condition, and
  // deliberately the same sentence as parse-event.ts — a person who meets this
  // refusal twice should not have to work out whether it is the same refusal.
  if (env.entity.kind !== 'workflow') {
    return {
      refused: true,
      rule: REFUSAL_RULES.malformedPayload,
      reason: `This workflow.defined event does not point at a workflow; it points at a ${env.entity.kind}.`,
    };
  }

  const parsed = workflowDefinedPayloadSchema.safeParse(env.payload);
  if (!parsed.success) {
    const detail = malformedPayloadDetail(parsed.error);
    return {
      refused: true,
      rule: REFUSAL_RULES.malformedPayload,
      reason: `This workflow.defined event's payload is malformed: ${detail}`,
    };
  }
  const payload = parsed.data;

  if (payload.id !== env.entity.id) {
    return {
      refused: true,
      rule: REFUSAL_RULES.malformedPayload,
      reason: `This workflow.defined event points at workflow ${env.entity.id}, but its payload defines workflow ${payload.id}.`,
    };
  }

  const issues = validateWorkflowDef(payload);
  if (issues.length > 0) {
    return {
      refused: true,
      rule: REFUSAL_RULES.workflowStructure,
      reason: `This workflow definition cannot be published: ${issues.map((issue) => issue.message).join(' ')}`,
    };
  }

  const latest = await ctx.getWorkflowDef(payload.id);
  if (latest === null) {
    if (payload.version !== 1) {
      return {
        refused: true,
        rule: REFUSAL_RULES.workflowVersion,
        reason: `The first published version of a workflow must be version 1; this definition claims version ${payload.version}.`,
      };
    }
    return { refused: false };
  }

  if (payload.version !== latest.version + 1) {
    return {
      refused: true,
      rule: REFUSAL_RULES.workflowVersion,
      reason: `Workflow "${latest.name}" is at version ${latest.version}; the next published version must be ${latest.version + 1}, not ${payload.version}.`,
    };
  }

  // Stranding: every state the new version drops must be mapped somewhere that
  // exists in the new version — occupied or not. This is permanent semantics,
  // not a stopgap (Open question 6, settled by the owner). Making publish
  // legality depend on occupancy would make the client and server engines
  // disagree by construction: replicas are visibility-scoped, so a user who
  // cannot see the tickets in the dropped state computes a different
  // occupancy than the server does, and one shared fixture suite could no
  // longer bind both. Occupancy is a builder courtesy, never an engine input.
  const newStateIds = new Set(payload.states.map((state) => state.id));
  const dropped = latest.states.filter((state) => !newStateIds.has(state.id)).map((state) => state.id);
  const mapping = payload.stateMapping ?? {};

  const unmapped = dropped.filter((id) => mapping[id] === undefined);
  if (unmapped.length > 0) {
    const list = unmapped.map((id) => `"${id}"`).join(', ');
    return {
      refused: true,
      rule: REFUSAL_RULES.workflowStateMapping,
      reason: `Version ${payload.version} drops state(s) ${list} that version ${latest.version} has; publishing cannot see which tickets sit in which state, so every dropped state needs a stateMapping entry.`,
    };
  }

  for (const [oldId, target] of Object.entries(mapping)) {
    if (!dropped.includes(oldId)) {
      return {
        refused: true,
        rule: REFUSAL_RULES.workflowStateMapping,
        reason: `The stateMapping remaps "${oldId}", but that state still exists in version ${payload.version}; only dropped states may be remapped.`,
      };
    }
    if (!newStateIds.has(target)) {
      return {
        refused: true,
        rule: REFUSAL_RULES.workflowStateMapping,
        reason: `The stateMapping sends "${oldId}" to "${target}", but "${target}" is not a state in version ${payload.version}.`,
      };
    }
  }

  return { refused: false };
}
