import type { WorkflowDef } from '@gisik-nokma/domain';
import { transitionOptions } from './transition-dialog.js';

export type ArrowDirection = 'previous' | 'next';

/**
 * Which state a card's `‹` (previous) or `›` (next) arrow targets, given the
 * board's own column order — or `null` when the workflow declares no move
 * that way.
 *
 * **THIS IS NOT "GO TO THE ADJACENT COLUMN."** Board-prototype-port Task 13's
 * whole point: arrows follow DECLARED EDGES, not column order. A workflow can
 * declare `todo -> done` while `doing` sits between them in `columnOrder` —
 * clicking `›` from `todo` in that shape resolves to `done`, never to
 * `doing`, because `doing` is not a declared target from `todo` at all. The
 * natural "fix" — `columnOrder[index + 1]` — silently reintroduces the exact
 * bug the port's own design spec calls out by name: "The prototype's arrows
 * walk the column array unconditionally." Say this here because the arrows
 * LOOK like plain left/right, and a future reader who has not read the spec
 * will assume they mean column order.
 *
 * The scan: starting one column past (or before) `fromStateId` in
 * `columnOrder`, walk outward and return the FIRST state that
 * `transitionOptions(def, fromStateId)` actually declares reachable — the
 * NEAREST declared target in that direction, skipping every column that is
 * not a real edge. This also means a click computed from this function's own
 * output can never disagree with `moveOutcome` (`board-moves.ts`) about
 * whether the target is declared: both read `transitionOptions` off the same
 * `(def, fromStateId)`, so a target this function returns is, by
 * construction, always a member of `moveOutcome`'s own `options`. The
 * `refused` outcome stays reachable — and load-bearing — for Task 14's
 * drag-and-drop, whose drop target is NOT filtered this way; see that task's
 * own module for the shared "attempt a move" handler both routes call.
 *
 * `columnOrder` is expected to be `group.columns.map(c => c.stateId)` —
 * provably the SAME sequence as `def.states`, for the identical pinned
 * `(workflowId, workflowVersion)` a `BoardGroup` carries: the server builds
 * `BoardColumn[]` by iterating `def.states` in order, off the very `def`
 * `group.workflowVersion` is read from (`apps/server/src/routes/board.ts:113-116`
 * and its own comment there). So the caller hands in the rendered column
 * list directly rather than re-deriving order from `def` a second time — one
 * more case of not forking a fact this codebase already has one source for.
 *
 * Returns `null` when `fromStateId` is not in `columnOrder` at all (should
 * not happen given the pinned-version guarantee above — a card is always
 * rendered under one of its own group's columns — but a scan with no home
 * column has nothing to walk from) or when nothing in that direction is
 * declared reachable.
 */
export function arrowTarget(
  def: WorkflowDef,
  columnOrder: string[],
  fromStateId: string,
  direction: ArrowDirection,
): string | null {
  const index = columnOrder.indexOf(fromStateId);
  if (index === -1) return null;
  const declared = new Set(transitionOptions(def, fromStateId).map((option) => option.toStateId));
  const scanRange =
    direction === 'next' ? columnOrder.slice(index + 1) : columnOrder.slice(0, index).reverse();
  return scanRange.find((stateId) => declared.has(stateId)) ?? null;
}
