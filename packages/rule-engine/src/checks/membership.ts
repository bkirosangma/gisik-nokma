import type { EventEnvelope } from '@gisik-nokma/domain';
import { membershipGrantedPayload, membershipId, membershipRevokedPayload } from '@gisik-nokma/domain';
import type { Accept, EngineContext, Refusal, TenantScope } from '../engine.js';
import { REFUSAL_RULES, malformedPayloadDetail } from '../refusal-rules.js';
import { getMembershipState } from './context-helpers.js';
import { ACCEPT, refuse } from './refusals.js';

/**
 * The last-owner guard (owner ruling 2026-09-18). A workspace must not be able
 * to reach a state with no owner, and until this file existed nothing refused
 * it: `membership.granted` and `membership.revoked` were admin-gated and
 * nothing more, `POST /events` accepts them unconstrained by event type, and
 * the projection overwrites `role` on conflict — so an admin could demote the
 * sole owner and promote themselves in two events. That is the hole this closes.
 *
 * ## Why the rule lives HERE and not with the other half
 *
 * The guard is two questions, and they are different KINDS of question, which
 * is why they are answered in two layers rather than one:
 *
 *  - *"may this actor grant this role?"* is a question about the ACTOR, and it
 *    belongs in `apps/server/src/permissions/check-permission.ts`, which
 *    already answers the sibling question for the same two events.
 *  - *"would this change empty the workspace?"* is a question about the WORLD,
 *    and it belongs in the rule engine, whose whole job is refusing claims
 *    about the world. It is here.
 *
 * Answering the second in the permission layer would also have put it out of
 * reach of every door that does not pass through that gate — the fixture suite
 * and the offline replica — and an invariant only one door enforces is an
 * invariant every other door is free to break.
 *
 * ## What the other doors actually do — stated, because an earlier draft of
 * ## this docblock claimed they ENFORCE it and they do not
 *
 * Only the SERVER context can answer `countWorkspaceOwners`: it is the only one
 * backed by a table holding every member. The two in-memory contexts hold no
 * memberships at all (`buildMemoryContext`) or only a fixture's roster, and the
 * offline replica holds the ACTOR's membership alone. None of the three
 * implements the method, so on those doors the guard does not enforce anything
 * — it reaches `ownersOrThrow` and throws.
 *
 * Throwing is the honest answer to a question a context cannot answer, and it
 * is what keeps `last-owner` from being asserted by something that never
 * counted. But it is NOT enforcement, and the distinction has a live
 * consequence rather than a theoretical one: an owner changing their OWN role
 * through a replica-backed client aborts the enqueue instead of getting a
 * refusal, because `outbox.enqueue` evaluates unguarded and has no verdict to
 * return. Measured 2026-09-18; latent today only because no shipped client
 * emits `membership.granted` yet. It goes live with the roster's role control,
 * which is the change that wires that event to the client ingest path.
 *
 * The follow-on is recorded against that task in `test-cases/13` rather than
 * repaired here, and the reason is that the repair is not in this file: the
 * replica genuinely cannot count owners, so the fix is where a throwing
 * evaluation is caught, not a second membership reader invented in a context
 * that holds one row.
 *
 * ## The shape, and the one place it departs from `close.ts`
 *
 * Type guard, kind guard, `safeParse` with `malformedPayloadDetail`, then the
 * domain rule — `close.ts` line for line, and the kind guard is NOT optional:
 * `evaluate.ts`'s own docblock says each case carries its own, because the
 * fixture suite and the offline replica enter through `evaluateEvent` and never
 * pass through ingest's door, so the door's answer is not available to them.
 *
 * ## What this check cannot see, said plainly rather than implied
 *
 * Both contexts that could exercise this guard end-to-end are blind to it in
 * one direction: `buildMemoryContext` answers `null` for every membership, so
 * `wasOwner` is always false there and the guard never fires; the fixture
 * harness DOES serve memberships but no fixture carries a `membership.granted`
 * candidate. So the guard's witness is the hand-rolled context in
 * `test/membership.test.ts`, not the shared fixture suite — recorded in
 * `Features.md` as a hedge rather than left for a reader to discover.
 */

/**
 * The owner count, or a THROW when this context cannot provide one.
 *
 * Throwing rather than refusing, and it is the contest evaluators' rule
 * (`contests.ts:66-72`), restated for a sharper reason here. Elsewhere a
 * manufactured refusal is merely a wiring bug reported as a policy decision;
 * here it would be a sentence about the WORKSPACE — "this change would leave
 * the workspace with no owner" — minted by a context that never counted. A
 * context that cannot count has answered nothing, and the honest thing for it
 * to do is fail loudly where a broken wiring can be seen.
 */
async function ownersOrThrow(
  ctx: EngineContext,
  scope: TenantScope,
  excludingUserId: string,
): Promise<number> {
  if (ctx.countWorkspaceOwners === undefined) {
    throw new Error('This context cannot count workspace owners, so the last-owner guard cannot run.');
  }
  return await ctx.countWorkspaceOwners(scope, excludingUserId);
}

/**
 * The target's CURRENT role, or `false` when they hold no membership here.
 *
 * "Not an owner" and "not a member at all" collapse to the same answer on
 * purpose: neither can be a move OUT of owner, so neither can empty the
 * workspace. The two are distinguished only in what they mean, and nothing in
 * this guard acts on that difference.
 */
async function isCurrentlyOwner(env: EventEnvelope, ctx: EngineContext, userId: string): Promise<boolean> {
  const target = await getMembershipState(ctx, membershipId(env.workspaceId, userId));
  return target !== null && target.role === 'owner';
}

export async function checkMembershipGranted(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  if (env.type !== 'membership.granted') return ACCEPT;
  if (env.entity.kind !== 'membership') {
    return refuse(REFUSAL_RULES.malformedPayload,
      `This membership.granted event does not point at a membership; it points at a ${env.entity.kind}.`);
  }
  const parsed = membershipGrantedPayload.safeParse(env.payload);
  if (!parsed.success) {
    return refuse(REFUSAL_RULES.malformedPayload,
      `This membership.granted event's payload is malformed: ${malformedPayloadDetail(parsed.error)}`);
  }
  // Only a change that MOVES SOMEBODY OUT of owner can empty the workspace. A
  // grant that leaves an owner an owner — re-stating the same role, or
  // promoting somebody else — cannot, however few owners there are, and asking
  // the count for those would be a query the answer cannot change.
  if (await isCurrentlyOwner(env, ctx, parsed.data.userId)) {
    if (parsed.data.role !== 'owner') {
      const others = await ownersOrThrow(ctx, env, parsed.data.userId);
      if (others === 0) {
        return refuse(REFUSAL_RULES.lastOwner,
          'This change would leave the workspace with no owner. Grant the owner role to somebody else first.');
      }
    }
  }
  return ACCEPT;
}

export async function checkMembershipRevoked(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  if (env.type !== 'membership.revoked') return ACCEPT;
  if (env.entity.kind !== 'membership') {
    return refuse(REFUSAL_RULES.malformedPayload,
      `This membership.revoked event does not point at a membership; it points at a ${env.entity.kind}.`);
  }
  const parsed = membershipRevokedPayload.safeParse(env.payload);
  if (!parsed.success) {
    return refuse(REFUSAL_RULES.malformedPayload,
      `This membership.revoked event's payload is malformed: ${malformedPayloadDetail(parsed.error)}`);
  }
  // A revocation is a move out of owner by construction — there is no role to
  // read off the payload, so the only question is whether the target held it.
  if (await isCurrentlyOwner(env, ctx, parsed.data.userId)) {
    const others = await ownersOrThrow(ctx, env, parsed.data.userId);
    if (others === 0) {
      return refuse(REFUSAL_RULES.lastOwner,
        'This change would leave the workspace with no owner. Grant the owner role to somebody else first.');
    }
  }
  return ACCEPT;
}
