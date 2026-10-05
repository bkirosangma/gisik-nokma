import {
  BACKLOG_STATE_ID,
  stateCategoryOf,
  statesWithBacklog,
  ticketTransitionedPayloadSchema,
  transitionsWithBacklog,
  universalTransitions,
  type EventEnvelope,
} from '@gisik-nokma/domain';
import { getTicketState } from './checks/context-helpers.js';
import { decisionOutcomeRequired } from './checks/decision.js';
import { flowCauseForgery, flowExemptEdge } from './checks/flow-cause.js';
import { REFUSAL_RULES, malformedPayloadDetail } from './refusal-rules.js';
import { evaluateTransitionRules } from './rules/index.js';
import { resolveCurrentStateId } from './version-map.js';
import type { Accept, EngineContext, Refusal } from './engine.js';

/**
 * Since 2026-09-17 the state and edge sets include the universal Backlog
 * (spec §1.1) — Start and Send to backlog are legal without being declared,
 * and the engine learns them from the same two helpers the client's
 * `transitionOptions` reads. Backlog is a special case within that, not an
 * ordinary member of it: a declared wildcard edge (`from: '*'`) means "from
 * any AUTHORED state" — the author who wrote it never knew about the
 * universal Backlog — so a wildcard edge never applies FROM backlog; its
 * only exit is Start (backlog/closed spec §1.1 as amended 2026-09-17).
 * Without that guard `* → done` would let a backlog ticket jump straight to
 * Done, skipping Start entirely.
 */
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
    const detail = malformedPayloadDetail(parsed.error);
    return {
      refused: true,
      rule: REFUSAL_RULES.malformedPayload,
      reason: `This ticket.transitioned event's payload is malformed: ${detail}`,
    };
  }
  const payload = parsed.data;
  // wtg2 T8: a flow cause from anyone but the flow actor is forged, and says so before any other rule answers (29.203).
  const forged = flowCauseForgery(env, payload.cause);
  if (forged !== null) return forged;

  const entity = await ctx.getEntityState('ticket', env.entity.id);
  if (entity === null || entity.kind !== 'ticket') {
    return {
      refused: true,
      rule: REFUSAL_RULES.unknownTicket,
      reason: `This event moves ticket ${env.entity.id}, but no such ticket is known.`,
    };
  }
  const ticket = entity;

  // Explicit reopen (spec §2): a closed ticket has no legal move at all, so
  // this is decided before any edge is looked at.
  if ((ticket.closed ?? null) !== null) {
    return { refused: true, rule: REFUSAL_RULES.closedTicket, reason: 'This ticket is closed. Reopen it first.' };
  }

  const latest = await ctx.getWorkflowDef(env, ticket.workflowId);
  if (latest === null) {
    return {
      refused: true,
      rule: REFUSAL_RULES.unknownWorkflow,
      reason: `Ticket ${ticket.id} uses workflow ${ticket.workflowId}, but no published definition of that workflow is known.`,
    };
  }

  const resolved = await resolveCurrentStateId(env, ticket, latest, ctx);
  if (!resolved.ok) {
    return {
      refused: true,
      rule: REFUSAL_RULES.strandedState,
      // No version clause beside the state id, deliberately. `resolveCurrentStateId`
      // reports the id at the point the chain BROKE, not the id it started from
      // (`foldStateIdForward`, packages/domain/src/workflow.ts:159), while
      // `ticket.workflowVersion` is the ticket's ORIGIN version. On a chain
      // longer than two those are different versions, so "state X of version Y"
      // named a pair that never coexisted. It coincided — and so read true — only
      // while every stranded fixture was two-version; Plan 3's refresh-on-publish
      // makes the divergence routine. Naming the id alone is the whole truth this
      // refusal can tell without a backward walk, and a backward walk is
      // forbidden: there is no such thing, and inventing one is a second set of
      // rounding errors of exactly the kind THE ONE VERSION WALK exists to
      // prevent. Plan 6 renders this sentence verbatim to a human.
      reason: `Ticket ${ticket.id} sits in state "${resolved.unmappedStateId}", which no longer exists in version ${latest.version} and no state mapping covers it.`,
    };
  }

  const toState = statesWithBacklog(latest).find((state) => state.id === payload.to);
  if (toState === undefined) {
    return {
      refused: true,
      rule: REFUSAL_RULES.unknownState,
      reason: `The workflow "${latest.name}" has no state "${payload.to}".`,
    };
  }

  const fromName = statesWithBacklog(latest).find((state) => state.id === resolved.stateId)?.name ?? resolved.stateId;
  const edges = transitionsWithBacklog(latest);
  const declared =
    resolved.stateId === BACKLOG_STATE_ID
      ? universalTransitions(latest).find((t) => t.from === BACKLOG_STATE_ID && t.to === payload.to)
      : (edges.find((t) => t.from === resolved.stateId && t.to === payload.to) ??
         edges.find((t) => t.from === '*' && t.to === payload.to));
  // PS-11 (wtg2 T8): the flow's loop reset and not-taken moves ride a synthetic, rules-less edge. Asked only when no
  // declared edge exists (a declared one keeps its authored rules), after the closed check above and before the
  // parent/child invariants below, which no definition and no actor can switch off.
  const transition = declared ?? flowExemptEdge(env, latest, resolved.stateId, toState, payload.cause) ?? undefined;
  if (transition === undefined) {
    return {
      refused: true,
      rule: REFUSAL_RULES.illegalTransition,
      reason: `The workflow "${latest.name}" does not allow moving from "${fromName}" to "${toState.name}".`,
    };
  }

  // Invariant above all workflows (spec invariant 3): a parent may not be
  // finished while any of its children is live — parents cannot outrun
  // children, and children cannot reopen under a finished parent. Guarded from
  // BOTH sides here, because the relation has two doors on this path: a parent
  // may not ENTER terminal over open children, and a child may not LEAVE
  // terminal under a terminal parent (E3-19, 2026-09-21 — until then only the
  // first was refused, and `done → todo` on the child produced the state the
  // first exists to make unreachable). Runs before any authored rule; no
  // definition can switch it off.
  //
  // Invariant above all workflows (spec invariant 3): parents cannot outrun
  // children. Runs before any authored rule; no definition can switch it off.
  //
  // A SOFT-DELETED child is not open work (E6-4). `getChildrenStates` serves
  // deleted rows by documented design — the server's reader says so and hands
  // the live-only predicate to its callers — and until this conjunct the count
  // here included a child that "stops appearing in views", so the refusal
  // named a number every view reported as zero, and from the product's UI the
  // parent could never be finished. The same boundary read as `closed` above:
  // `deleted?` is optional on the domain type.
  // A DRAFT child is not open work either (drafts spec; `checks/close.ts`).
  if (toState.category === 'terminal') {
    const children = await ctx.getChildrenStates(ticket.id);
    const openCount = children.filter(
      (child) => child.stateCategory !== 'terminal' && (child.deleted ?? null) === null && child.draft === undefined,
    ).length;
    if (openCount > 0) {
      return {
        refused: true,
        rule: REFUSAL_RULES.parentTerminal,
        reason: `This ticket cannot enter "${toState.name}" while ${openCount} of its child tickets ${openCount === 1 ? 'is' : 'are'} still open.`,
      };
    }
    // DC-5 (wtg2 T6, `checks/decision.ts`): a Decision with branches and no outcome is not finished. After the parent
    // invariant, which no definition can switch off, so an open child is still reported first.
    const outcomeRequired = decisionOutcomeRequired(ticket);
    if (outcomeRequired !== null) return outcomeRequired;
  }

  // The child's side. Live work arriving under a finished parent is what
  // `checks/hierarchy.ts` refuses on create and on reparent; a child leaving a
  // terminal state IS live work arriving, and this is the one door of the
  // three that did not ask. Only the move that CREATES the relation is
  // refused — from terminal into non-terminal, parent terminal. A child
  // already open under a terminal parent keeps its ordinary moves: that
  // relation is reachable through a republish that promotes a kept state to
  // terminal (`workflow-defined.ts`, deliberately not gated on occupancy), and
  // trapping the child there would not repair it — `checks/close.ts` holds
  // the last line by refusing to close the parent over open work. The
  // category of the FROM state is read off the resolved definition, not off
  // the denormalized `ticket.stateCategory`, for the same reason `toState`
  // is: the fold-forward may have moved the ticket since the row was written.
  // A parent this context cannot resolve refuses nothing (an absence is not
  // a fact — the same stance `getChildrenStates` takes on an unseen child);
  // the client pre-check defers such an accept rather than announcing it
  // (`packages/app-core/src/precheck.ts`, `acceptRestsOnUnseenParent`).
  // `ticket.workflow_rebound` (`checks/workflow-rebind.ts`) does not ask this
  // question either way; it is not this guard's door.
  if (
    toState.category !== 'terminal' &&
    stateCategoryOf(latest, resolved.stateId) === 'terminal' &&
    ticket.parentId !== null
  ) {
    const parent = await getTicketState(ctx, ticket.parentId);
    if (parent !== null && parent.stateCategory === 'terminal') {
      // `env` is the scope; `parent` supplies only the id and the version —
      // the same reading, for the same reason, as `checks/hierarchy.ts`'s
      // parent-terminal reason lookup (`TenantScope` in `engine.ts`).
      const parentDef = await ctx.getWorkflowDef(env, parent.workflowId, parent.workflowVersion);
      const parentStateName = parentDef?.states.find((s) => s.id === parent.stateId)?.name ?? parent.stateId;
      const titleClaim = parent.fields['title']?.value;
      const parentTitle = typeof titleClaim === 'string' ? titleClaim : parent.id;
      return {
        refused: true,
        rule: REFUSAL_RULES.childOpenUnderTerminalParent,
        reason: `"${parentTitle}" is finished (${parentStateName}); reopen it before moving this ticket back to "${toState.name}".`,
      };
    }
  }

  return evaluateTransitionRules(transition.rules, {
    env,
    ctx,
    ticket,
    def: latest,
    toState,
    fromStateId: resolved.stateId,
    payload,
  });
}
