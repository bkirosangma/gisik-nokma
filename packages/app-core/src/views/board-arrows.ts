import { BACKLOG_STATE_ID, type WorkflowDef } from '@gisik-nokma/domain';
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
 * drag-and-drop, whose drop target is NOT filtered this way. Task 14 ships
 * no second module and no second decision point for it: a column's drop
 * handler looks up the dragged card's own `attemptMove` — the exact closure
 * `MoveArrows` (`board.tsx`) already built for its own arrow clicks — in a
 * small per-card registry, and calls it. One function, invoked from two
 * input events, never two functions that could disagree.
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
 *
 * **Defined as `arrowTargets(...)[0]`, not as its own scan** (owner request,
 * 2026-09-17 — "if multiple paths exist for the column, on clicking next, it
 * should open up a modal to select which"). `MoveArrows` now reads the whole
 * directional list to decide between moving and asking; the singular is kept
 * for every caller and test that only ever wanted the nearest, and defining
 * it as the plural's head is what guarantees the two can never disagree
 * about which state is nearest — one walk, one author.
 */
export function arrowTarget(
  def: WorkflowDef,
  columnOrder: string[],
  fromStateId: string,
  direction: ArrowDirection,
): string | null {
  return arrowTargets(def, columnOrder, fromStateId, direction)[0] ?? null;
}

/**
 * EVERY state the arrow could reach that way, nearest first — the same
 * outward walk `arrowTarget` always ran, kept in full rather than stopped at
 * the first hit. Empty where the singular answers `null`. `MoveArrows` opens
 * the picker dialog when this has more than one entry, offering exactly this
 * list (`TransitionDialog`'s `offerStateIds`), and moves — or opens the
 * dialog already aimed — when it has exactly one.
 */
export function arrowTargets(
  def: WorkflowDef,
  columnOrder: string[],
  fromStateId: string,
  direction: ArrowDirection,
): string[] {
  const index = columnOrder.indexOf(fromStateId);
  if (index === -1) return [];
  const declared = new Set(transitionOptions(def, fromStateId).map((option) => option.toStateId));
  const scanRange =
    direction === 'next' ? columnOrder.slice(index + 1) : columnOrder.slice(0, index).reverse();
  return scanRange.filter((stateId) => declared.has(stateId));
}

/**
 * EVERY state the board offers a card in `fromStateId`, in both directions at once — what the phone's (and, from
 * Task 5, the desktop's) "Move" button asks the dialog to list. It is `transitionOptions` and nothing more, in its
 * declaration order, minus Backlog: Backlog is never a board column (`refusalCopy` makes the same cut), and the
 * only door to it is the ticket sheet's own "Move to Backlog". No second move rule lives here — a state returned
 * is, by construction, one `moveOutcome` would accept, exactly as for `arrowTargets`.
 *
 * Unlike `arrowTargets` it takes no `columnOrder`: it does not walk columns, it reads declared edges. A state with
 * no declared exit (only the universal Send-to-Backlog) answers `[]`, and the Move button disables itself.
 */
export function allBoardTargets(def: WorkflowDef, fromStateId: string): string[] {
  return transitionOptions(def, fromStateId)
    .map((option) => option.toStateId)
    .filter((stateId) => stateId !== BACKLOG_STATE_ID);
}
