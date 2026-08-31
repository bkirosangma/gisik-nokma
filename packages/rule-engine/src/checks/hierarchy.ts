import type { EventEnvelope, TicketState } from '@gisik-nokma/domain';
import { DEEPEST_RANK, ticketCreatedPayload, ticketReparentedPayload } from '@gisik-nokma/domain';
import type { Accept, EngineContext, Refusal } from '../engine.js';
import { REFUSAL_RULES, malformedPayloadDetail } from '../refusal-rules.js';
import { getTicketState, getTicketTypeDef } from './context-helpers.js';
import { ACCEPT, deepestRankParentRefusal, parentTerminalRefusal, rankRefusal, refuse } from './refusals.js';

/**
 * Hierarchy sanity for ticket.created. Check order is deliberate — the most
 * fundamental truth names the refusal:
 *
 *   already exists → unknown type → workflow undefined
 *     → (root) deepest-rank rule
 *     → unknown parent (a parent in another WORKSPACE is one of these)
 *     → cross-project → parent's type unknown → rank → parent-terminal
 *
 * Parent-terminal comes last because it is the only refusal whose remedy is an
 * OFFER rather than a correction: put it earlier and it offers a reopen that
 * does not work, because the thing actually in the way is still in the way
 * afterwards.
 *
 * `already exists` leads because it is the only question about the event's own
 * target rather than about what the payload points at. A create for a ticket
 * that exists is refused whatever its type or parent would have been — and
 * telling that actor their type is undefined would send them to fix the one
 * thing that was never the problem.
 *
 * The same doctrine is why the parent's-type guard has a refusal of its own
 * (`hierarchy.parent-type-unknown`, controller ruling P11) rather than reusing
 * `ticket.unknown-type`: by the time it fires, THIS ticket's type has already
 * resolved, so the borrowed sentence sent the actor to define a type that is
 * already defined. Every refusal in the chain above must be true on the path
 * that reaches it, not merely true of something.
 *
 * The project this ticket is created INTO is not checked here: Plan 4 owns
 * `proj_projects` and the "the project does not exist" refusal (coordination
 * doc, owner decision 2026-08-26). The order above is every precondition this
 * check forces, which is not the same as every precondition creation has.
 */
export async function checkTicketCreated(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  // Two layers, by design, exactly as in transition.ts:11-28 (pre-flight A19):
  // the fixture suite and Plan 10's offline replica enter at `evaluateEvent`
  // and never pass through ingest's door, so this check keeps its own kind
  // guard. Server-side the door answers first and this never runs — but it says
  // the same sentence in the same words as its sibling, because a person who
  // meets this refusal twice should not have to work out whether it is the same
  // refusal.
  if (env.entity.kind !== 'ticket') {
    return {
      refused: true,
      rule: REFUSAL_RULES.malformedPayload,
      reason: `This ticket.created event does not point at a ticket; it points at a ${env.entity.kind}.`,
    };
  }

  // `safeParse`, not `parse`, for the same reason the kind guard exists.
  // `evaluateEvent`'s frozen signature is `Promise<Accept | Refusal>` — a
  // throw is neither, and the callers that reach this check without the door
  // in front of them are exactly the ones with no other net. On the server the
  // registered schema has already accepted this payload, so this branch is
  // unreachable there; everywhere else it is the difference between a refusal
  // and a crash.
  const parsed = ticketCreatedPayload.safeParse(env.payload);
  if (!parsed.success) {
    const detail = malformedPayloadDetail(parsed.error);
    return {
      refused: true,
      rule: REFUSAL_RULES.malformedPayload,
      reason: `This ticket.created event's payload is malformed: ${detail}`,
    };
  }
  const p = parsed.data;

  // Routed here by Task 3's review; not in this task's brief. The reducer folds
  // `ticket.created` unconditionally (`ticket-state.ts:94`), so a second
  // accepted create for an existing ticket does not error and does not merge —
  // it RESETS the fold, erasing the ticket's status, its collaborators, its
  // field claims and its transition log, which is the evidence four-eyes reads.
  // Nothing shipped refused it. The reducer is right to stay unconditional (a
  // projection replaying a ledger that already refused this should not carry a
  // second opinion); the door that keeps it out is here.
  if ((await getTicketState(ctx, env.entity.id)) !== null) return refuse('ticket.already-exists');

  const type = await getTicketTypeDef(ctx, p.typeId);
  if (!type) return refuse('ticket.unknown-type');

  const workflow = await ctx.getWorkflowDef(type.workflowId);
  if (!workflow) return refuse('ticket.workflow-undefined');

  if (p.parentId === null) {
    // Owner decision (2026-08-20): the parent requirement follows the RANK, not
    // the built-in id — the built-in sub-task and any custom type an admin
    // defines at that rank or below it all carry it.
    //
    // `>=` rather than `===`: the rule's justification is that the smallest
    // kind of work always belongs to something bigger, so a type DEEPER than
    // sub-task is smaller still and cannot coherently be exempt — `===` would
    // leave an escape hatch where defining rank 5 floats your tickets free.
    //
    // DEEPEST_RANK stays a fixed constant rather than a max computed over the
    // workspace's defined types: a computed max would silently change this
    // refusal's meaning as the type inventory changed, and a refusal that
    // shifts underfoot is exactly what this product refuses to ship. Fixed
    // floor plus `>=` gives both — the meaning never moves, and nothing slips
    // underneath it. The constant is imported from `@gisik-nokma/domain`
    // (`ticket-types.ts:70`), never restated: a second 4 written down here is a
    // second chance for the floor to move on one side only.
    if (type.rank >= DEEPEST_RANK) {
      return refuse('hierarchy.deepest-rank-parent-required', deepestRankParentRefusal(type.name));
    }
    return ACCEPT;
  }

  // ONE refusal, two ways of not existing here (controller ruling P12). A
  // parent this workspace does not hold resolves anyway: `getTicketState` is an
  // id lookup with no workspace predicate, over a projection whose primary key
  // is `(entity_kind, entity_id)` — global, not per-tenant. Left to fall
  // through, a foreign parent was refused `hierarchy.cross-project`, which said
  // something false ("a different project" — it is a different WORKSPACE) and
  // confirmed to the actor that the id exists somewhere they cannot see. The
  // ingest door's tenancy check does not cover this: it guards the event's own
  // entity, never the parent the payload names.
  const parent = await getTicketState(ctx, p.parentId);
  if (!parent || parent.workspaceId !== env.workspaceId) return refuse('hierarchy.unknown-parent');
  if (parent.projectId !== p.projectId) return refuse('hierarchy.cross-project');

  // The PARENT's type, and the parent is the subject of the refusal. This used
  // to answer `ticket.unknown-type` — "This ticket's type is not defined in
  // this workspace." — which is false the moment it can fire: this ticket's
  // type resolved above, or we never got here. Controller ruling P11.
  const parentType = await getTicketTypeDef(ctx, parent.typeId);
  if (!parentType) return refuse('hierarchy.parent-type-unknown');
  if (type.rank <= parentType.rank) {
    return refuse('hierarchy.rank', rankRefusal(type.name, parentType.name));
  }

  // Owner decision (2026-08-20): a finished parent refuses new live work; the
  // decision keys off the denormalized stateCategory — the def lookup below
  // only names the state for the reason, so it falls back to raw ids rather
  // than blocking the refusal on a missing definition.
  if (parent.stateCategory === 'terminal') {
    const parentDef = await ctx.getWorkflowDef(parent.workflowId, parent.workflowVersion);
    const stateName = parentDef?.states.find((s) => s.id === parent.stateId)?.name ?? parent.stateId;
    const titleClaim = parent.fields['title']?.value;
    const parentTitle = typeof titleClaim === 'string' ? titleClaim : parent.id;
    return refuse('hierarchy.parent-terminal', parentTerminalRefusal(parentTitle, stateName, 'add'));
  }

  return ACCEPT;
}

/**
 * Walking more ancestors than this means the ledger itself is broken — this
 * check is the thing that keeps the tree acyclic, so a cycle already standing
 * in it was never accepted here.
 */
const MAX_ANCESTOR_HOPS = 1000;

/**
 * Hierarchy sanity for ticket.reparented. Same questions as creation, asked of
 * a ticket that already exists — plus the one creation cannot raise, because a
 * ticket being created has no descendants yet:
 *
 *   unknown ticket → unknown type
 *     → (to root) deepest-rank rule
 *     → self/cycle → unknown parent (a parent in another WORKSPACE is one of
 *       these) → cycle by ancestry
 *     → cross-project → parent's type unknown → rank → parent-terminal
 *
 * **A LOOP IS NAMED AS A LOOP even when rank or project is also violated.** The
 * cycle walk sits above both for the reason the whole order exists: a person
 * told "the ranks are wrong" fixes the ranks and meets the loop, which was the
 * thing actually in the way. It is also the refusal a rank re-definition can
 * make reachable — see below.
 *
 * **Why the cycle check is load-bearing at all.** Under strict rank ordering a
 * loop looks unreachable: every parent outranks its child, so no chain can bend
 * back on itself. But `ticket-type.defined` is last-definition-wins
 * (`memory-context.ts:132-137`), so a workspace can move a type's rank UNDER
 * the rank of a type it already contains — after which a reparent that closes a
 * loop is rank-legal, and nothing but this walk refuses it. That is the planted
 * defect in `test/reparent.test.ts`, and it is why deleting the walk as
 * "unreachable" would be wrong.
 *
 * Parent-terminal comes last for the same reason it does on creation: it is the
 * only refusal whose remedy is an OFFER rather than a correction.
 */
export async function checkTicketReparented(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  // Two layers, exactly as `checkTicketCreated` above (pre-flight A19).
  if (env.entity.kind !== 'ticket') {
    return {
      refused: true,
      rule: REFUSAL_RULES.malformedPayload,
      reason: `This ticket.reparented event does not point at a ticket; it points at a ${env.entity.kind}.`,
    };
  }

  // `safeParse`: `evaluateEvent`'s frozen signature is `Promise<Accept | Refusal>`
  // and a throw is neither. The callers that reach here without ingest's door in
  // front of them are the ones with no other net.
  const parsed = ticketReparentedPayload.safeParse(env.payload);
  if (!parsed.success) {
    const detail = malformedPayloadDetail(parsed.error);
    return {
      refused: true,
      rule: REFUSAL_RULES.malformedPayload,
      reason: `This ticket.reparented event's payload is malformed: ${detail}`,
    };
  }
  const p = parsed.data;

  const ticket = await getTicketState(ctx, env.entity.id);
  if (!ticket) return refuse('ticket.unknown');

  const type = await getTicketTypeDef(ctx, ticket.typeId);
  if (!type) return refuse('ticket.unknown-type');

  if (p.newParentId === null) {
    // The same rank rule as creation, and deliberately the same sentence: a
    // person who meets this refusal twice should not have to work out whether
    // it is the same refusal. `>=` and the fixed `DEEPEST_RANK` carry the same
    // reasoning documented on `checkTicketCreated` — the floor never moves, and
    // nothing slips underneath it.
    if (type.rank >= DEEPEST_RANK) {
      return refuse('hierarchy.deepest-rank-parent-required', deepestRankParentRefusal(type.name));
    }
    return ACCEPT;
  }

  // The degenerate loop, answered before the parent is even looked up: a ticket
  // named as its own parent is a loop of length one, and the walk below would
  // say the same thing one lookup later.
  if (p.newParentId === ticket.id) return refuse('hierarchy.cycle');

  // ONE refusal, two ways of not existing here (controller ruling P12), and it
  // matters MORE here than on creation. `getTicketState` is an id lookup with no
  // workspace predicate over a projection keyed `(entity_kind, entity_id)` —
  // global, not per-tenant — so a parent this workspace does not hold resolves.
  // A create that resolved a foreign parent merely failed to make a new ticket;
  // a REPARENT grafts an EXISTING ticket under it, moving live work into another
  // workspace's hierarchy, and left to fall through it was refused (if at all)
  // with a sentence about projects. The ingest door's tenancy check does not
  // cover this: it guards the event's own entity, never the parent the payload
  // names.
  const newParent = await getTicketState(ctx, p.newParentId);
  if (!newParent || newParent.workspaceId !== env.workspaceId) return refuse('hierarchy.unknown-parent');

  // Is this ticket an ANCESTOR of its proposed parent? Walk up from the parent;
  // meeting ourselves means the move would put the ticket inside its own
  // sub-tree.
  let cursor: TicketState | null = newParent;
  let hops = 0;
  while (cursor !== null) {
    if (cursor.id === ticket.id) return refuse('hierarchy.cycle');
    hops += 1;
    if (hops > MAX_ANCESTOR_HOPS) {
      // A THROW, not a refusal, and the distinction is the same one `safeParse`
      // above rests on: a malformed payload is the ACTOR's claim and is
      // refusable in the actor's language, while a chain this long is the
      // STORE's state — a cycle already standing in the tree, which this check
      // is what prevents. There is no true sentence to tell the actor, and
      // `hierarchy.cycle` would name a loop that is not the one they proposed.
      throw new Error(
        `checkTicketReparented: ancestor chain of ${p.newParentId} exceeds ${MAX_ANCESTOR_HOPS} — ledger integrity is broken`,
      );
    }
    cursor = cursor.parentId === null ? null : await getTicketState(ctx, cursor.parentId);
  }

  if (newParent.projectId !== ticket.projectId) return refuse('hierarchy.cross-project');

  // The PARENT's type, and the parent is the subject. Not `ticket.unknown-type`
  // — that sentence is false on every path that reaches here, because this
  // ticket's own type resolved above (controller ruling P11).
  const parentType = await getTicketTypeDef(ctx, newParent.typeId);
  if (!parentType) return refuse('hierarchy.parent-type-unknown');
  if (type.rank <= parentType.rank) {
    return refuse('hierarchy.rank', rankRefusal(type.name, parentType.name));
  }

  // Owner decision (2026-08-20): only LIVE work under a finished parent
  // contradicts — a terminal child moving under a terminal parent reopens
  // nothing and is legal. The decision keys off the denormalized
  // `stateCategory`; the def lookup only NAMES the state for the reason, so a
  // missing definition degrades to raw ids rather than blocking the refusal.
  if (newParent.stateCategory === 'terminal' && ticket.stateCategory !== 'terminal') {
    const parentDef = await ctx.getWorkflowDef(newParent.workflowId, newParent.workflowVersion);
    const stateName = parentDef?.states.find((s) => s.id === newParent.stateId)?.name ?? newParent.stateId;
    const titleClaim = newParent.fields['title']?.value;
    const parentTitle = typeof titleClaim === 'string' ? titleClaim : newParent.id;
    return refuse('hierarchy.parent-terminal', parentTerminalRefusal(parentTitle, stateName, 'move'));
  }

  return ACCEPT;
}
