import type { TicketState, TicketTypeDef } from '@gisik-nokma/domain';
import type { EngineContext } from '../engine.js';

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
 */
export async function getTicketTypeDef(ctx: EngineContext, id: string): Promise<TicketTypeDef | null> {
  return ctx.getTicketTypeDef(id);
}
