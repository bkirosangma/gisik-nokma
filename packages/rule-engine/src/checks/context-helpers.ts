import type { MembershipState, TicketState, TicketTypeDef } from '@gisik-nokma/domain';
import type { EngineContext, TenantScope } from '../engine.js';

/**
 * Typed reads over `EngineContext`, so no check has to restate how a kind is
 * narrowed or where a definition comes from.
 */

/**
 * NARROWS, never casts. `getEntityState` returns a union keyed on `kind`, and a
 * cast to `TicketState` would compile happily against a `MembershipState` and
 * then read `undefined` off every field the check asks about. Same pattern as
 * `transition.ts:42-43`.
 */
export async function getTicketState(ctx: EngineContext, id: string): Promise<TicketState | null> {
  const state = await ctx.getEntityState('ticket', id);
  return state !== null && state.kind === 'ticket' ? state : null;
}

/**
 * A ticket TYPE's definition arrives through the fourth `EngineContext` method,
 * NOT through `getEntityState('ticket-type', id)` — that door answers
 * `OtherEntityState`, literally `{ kind, id }`, with no rank, name, workflowId
 * or fields (`packages/domain/src/entity-state.ts:54-58`), which makes every
 * rank check unimplementable through it (pre-flight BA-4). Controller ruling P3
 * settled the widening: the union stays as it is, and the definition comes from
 * `getTicketTypeDef` (`engine.ts`, and its comment for why the alternative was
 * rejected).
 *
 * The wrapper exists so that no check reaches for the wrong door by habit: the
 * two lookups sit side by side here, named for what they return, and the shape
 * of each answer is a compile error away from the other.
 *
 * SCOPED, and `getTicketState` above is deliberately NOT (controller rulings
 * P14 and P12, Task 12). A type id is a slug the ACTOR chose — `epic`, `task`
 * and `bug` exist in most workspaces at once — and a `TicketTypeDef` carries no
 * workspace for a caller to compare afterwards, so an unscoped lookup hands one
 * tenancy another's rank, workflow binding and field list. A `TicketState` does
 * carry one, which is why the ticket lookup stays global and ruling P12's guard
 * in `hierarchy.ts` is what does the comparing — and stays reachable.
 */
export async function getTicketTypeDef(
  ctx: EngineContext,
  scope: TenantScope,
  id: string,
): Promise<TicketTypeDef | null> {
  return ctx.getTicketTypeDef(scope, id);
}

/**
 * A membership state, narrowed the same way and for the same reason as
 * `getTicketState` above — a cast to `MembershipState` would compile against a
 * `TicketState` and then read `undefined` off `.role`, which is the one field
 * the caller asks about.
 *
 * The id is `membershipId(workspaceId, userId)`, so this read is already asked
 * inside a named tenancy — there is no `TenantScope` parameter, and
 * `engine-context.ts`'s factory docblock gives the full argument for why
 * `getEntityState('membership')` does not take one. Callers must build the id
 * with `membershipId`, never from a payload field, which the same docblock
 * records as the condition under which that stops being true.
 *
 * `null` means "not a member of this workspace", which is a statement about the
 * person and not about a gap in any context: the server reads it through
 * `resolveEffectiveRole`, and the two in-memory contexts answer it two different
 * ways by design.
 */
export async function getMembershipState(
  ctx: EngineContext,
  id: string,
): Promise<MembershipState | null> {
  const state = await ctx.getEntityState('membership', id);
  return state !== null && state.kind === 'membership' ? state : null;
}
