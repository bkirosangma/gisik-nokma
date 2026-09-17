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

  const latest = await ctx.getWorkflowDef(env, payload.id);
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

    // Backlog/closed spec §2.4 (Ruling 53(iii), Finding 5, final
    // whole-branch review, 2026-09-17): closed ⇒ terminal must survive a
    // republish exactly as it must survive a rebind (Ruling 53(i),
    // `checkTicketWorkflowRebound`) — the fold this mapping drives
    // (`foldTicketToWorkflowVersion`) spreads `...state`, so a closed
    // ticket's `closed` claim rides along unconditionally while `stateId`
    // moves to whatever `oldId` maps to. If `oldId` was TERMINAL in the
    // version being dropped, every ticket left in it may be closed, and a
    // mapping that sends it somewhere NON-terminal stamps `closed_at IS NOT
    // NULL` beside an active or open `state_category` — the exact state
    // `close-requires-terminal` exists to forbid, reached through a publish
    // instead of a `ticket.closed` event. A dropped state that was NOT
    // terminal carries no such risk (nothing closed can be sitting in it),
    // so only the terminal case is gated.
    const oldCategory = latest.states.find((state) => state.id === oldId)?.category;
    const targetCategory = payload.states.find((state) => state.id === target)?.category;
    if (oldCategory === 'terminal' && targetCategory !== 'terminal') {
      return {
        refused: true,
        rule: REFUSAL_RULES.workflowStateMapping,
        reason: `The stateMapping sends terminal state "${oldId}" to "${target}", which is not terminal; closed tickets must stay in a terminal state, so a dropped terminal state may only map to another terminal state.`,
      };
    }
  }

  // Ruling 56(a), N1 (opus re-review, final fix wave round 2, 2026-09-17):
  // the fourth door into the same breach. 53(iii) above only walks
  // `stateMapping`, which is owed for a DROPPED state — but a state that
  // KEEPS its id owes no mapping at all, dropped or not, and
  // `foldTicketToWorkflowVersion` (`ticket-state.ts:359`) recomputes a
  // ticket's `stateCategory` from THIS version's definition regardless: a
  // closed ticket sitting in a surviving state rides the fold with
  // `closed` intact while its category silently follows whatever this
  // publish now says that state id means. So an author who flips a
  // surviving state's category from `terminal` to anything else — the
  // builder's category select carries no published-state lock, only a
  // permission gate (`state-node.tsx:41-42`) — reaches the identical
  // `closed_at IS NOT NULL` beside a non-terminal `state_category` that
  // (iii) exists to forbid, without dropping the state and without
  // `validateWorkflowDef` objecting (a surviving terminal state renamed to
  // active is invisible to the "no terminal state" check as long as some
  // OTHER state is still terminal). `REFUSAL_RULES.workflowStateMapping`
  // rather than `workflowStructure` is deliberate: `workflowStructure` is
  // reserved for what `validateWorkflowDef` finds looking at `payload`
  // ALONE (duplicate ids, unreachable states, no terminal state at all) —
  // it takes no `latest` and could not name a "before" to compare against.
  // This check, like (iii) immediately above it, is inherently a
  // two-version comparison over the exact same invariant, so it reads
  // more honestly as the mapping rule's own id: "this republish did not
  // honour what closed ⇒ terminal requires of it" is one sentence whether
  // the state was dropped and mis-mapped or kept and demoted, and every
  // consumer that already knows how to handle a `workflow-state-mapping`
  // refusal needs no new branch to handle this one too.
  for (const newState of payload.states) {
    const oldState = latest.states.find((state) => state.id === newState.id);
    if (oldState !== undefined && oldState.category === 'terminal' && newState.category !== 'terminal') {
      return {
        refused: true,
        rule: REFUSAL_RULES.workflowStateMapping,
        reason: `Version ${payload.version} changes state "${newState.id}" from terminal to ${newState.category}; closed tickets must stay in a terminal state, so a terminal state may not be demoted while it keeps its id — drop it and map it, or reopen the tickets in it first.`,
      };
    }
  }

  return { refused: false };
}
