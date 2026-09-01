import type { TicketState, TicketTypeDef } from '@gisik-nokma/domain';
import type { EngineContext, TenantScope } from '../engine.js';

/**
 * Typed reads over `EngineContext`, so no check has to restate how a kind is
 * narrowed or where a definition comes from.
 */

/**
 * NARROWS, never casts. `getEntityState` returns a union keyed on `kind`, and a
 * cast to `TicketState` would compile happily against a `MembershipState` and
 * then read `undefined` off every field the check asks about. Same pattern as
 * `transition.ts:41-42`.
 */
export async function getTicketState(ctx: EngineContext, id: string): Promise<TicketState | null> {
  const state = await ctx.getEntityState('ticket', id);
  return state !== null && state.kind === 'ticket' ? state : null;
}

/**
 * A ticket TYPE's definition arrives through the fourth `EngineContext` method,
 * NOT through `getEntityState('ticket-type', id)` — that door answers
 * `OtherEntityState`, literally `{ kind, id }`, with no rank, name, workflowId
 * or fields (`packages/domain/src/entity-state.ts:49-53`), which makes every
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
