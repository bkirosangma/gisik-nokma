import { compareByRank } from '@gisik-nokma/domain';

/**
 * Second wave Task 5 (backlog/closed second-wave plan, spec §8) — the Backlog
 * tab's rank arithmetic, kept pure and headless so the three decisions that
 * can silently corrupt the shared order are testable without a DOM.
 *
 * WHY THESE ARE SEPARATE FROM THE COMPONENT. `rankBetween` refuses an
 * inverted pair (`before >= after`) by throwing, so a wrong neighbour pair is
 * loud — but only once it is inverted. A pair that is merely OFF BY ONE ROW
 * produces a valid key in a place nobody asked for, and the tab renders it
 * happily: the row lands one position from where the pointer was. These
 * helpers exist so that "which two keys" is answerable without rendering
 * anything, and 13.707 pins all three.
 *
 * `RankRow` is structural on purpose: `ListRow` satisfies it, and the
 * generic on each function returns the CALLER'S row type, so the page can
 * hand `sortByRank` a `ListRow[]` and keep a `ListRow[]`.
 */
export type RankRow = { ticketId: string; rank: string | null };

/**
 * The last key in `rows` that is actually a key, or `null` when none is.
 *
 * THIS IS THE WHOLE REASON UNRANKED ROWS ARE A PROBLEM. An unranked row has
 * no key to sit after, so "the row above the target" is not the same question
 * as "the last row before the target" — it is the last row before the target
 * THAT HAS A KEY. Reading `.rank` off the immediately preceding row instead
 * returns `null`, and `rankBetween(null, null)` is the midpoint — i.e. the
 * row is dropped at the FRONT of the backlog while the pointer sat at the
 * back. Skipping backwards to the last real key is what makes the tail case
 * correct.
 */
function lastRankedKey(rows: readonly RankRow[]): string | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const row = rows[i];
    if (row !== undefined && typeof row.rank === 'string') return row.rank;
  }
  return null;
}

/**
 * The Backlog tab's display order: ranked rows first, by key; unranked rows
 * after them, by ticket id.
 *
 * `compareByRank` owns both halves of that rule and is imported rather than
 * re-stated, because a second implementation of "where do unranked rows go"
 * is exactly the drift this series keeps finding. The sort is stable in
 * effect for its own purposes: two rows compare equal only when they are the
 * same ticket, and the unranked tail is ordered by id, so the order does not
 * depend on the order the server's answer happened to arrive in.
 *
 * Returns a new array — the caller's `rows` is a prop.
 */
export function sortByRank<T extends RankRow>(rows: readonly T[]): T[] {
  return [...rows].sort(compareByRank);
}

/**
 * The `{ before, after }` pair `rankBetween` is handed for a move of
 * `movedId` to the position just before `beforeId` — or to the end of the
 * list when `beforeId` is `null`.
 *
 * THE UNRANKED-LAST-ROW RULE, stated once here because it is the case nobody
 * guesses: when the row being moved is placed last and the last row is
 * UNRANKED, `before` is the last RANKED row's key, not the last row's. An
 * unranked row has no key to sit after, so "after the last row" and "after
 * the last key" are the same position in the rendered order, and only the
 * second one can be expressed as a rank key. The same fallback covers a
 * `beforeId` whose row is itself unranked — there is no key to sit before.
 *
 * `movedId` is excluded from the neighbour search throughout. Without that,
 * moving a row to the end reads "the last ranked row" as the row being moved
 * itself and builds the new key from its own old one.
 *
 * A `beforeId` naming a row this list is not showing falls back to the tail,
 * the same answer `null` gives. That path is unreachable from the wired
 * component (a drop's `beforeId` is always one of the rows it rendered) and
 * it is a fallback rather than a throw on purpose: a stale id should not take
 * the whole tab down, and there is no honest index to guess.
 */
export function neighboursFor<T extends RankRow>(
  sorted: readonly T[],
  movedId: string,
  beforeId: string | null,
): { before: string | null; after: string | null } {
  const others = sorted.filter((row) => row.ticketId !== movedId);
  const index = beforeId === null ? -1 : others.findIndex((row) => row.ticketId === beforeId);
  const target = index === -1 ? undefined : others[index];
  return {
    before: lastRankedKey(index === -1 ? others : others.slice(0, index)),
    after: target?.rank ?? null,
  };
}

/**
 * Where a Move up / Move down button for `movedId` should point, as the
 * `beforeId` `neighboursFor` takes:
 *
 * - `undefined` — the row is already at that edge; the button is DISABLED.
 * - `null` — move it to the end (the tail zone's own answer).
 * - a ticket id — move it to just before that row.
 *
 * "Down" points TWO rows below, not one, and that is not an off-by-one: the
 * target is a `beforeId`, and "move down past the next row" means "place
 * before the row after it". Pointing at the row directly below instead is a
 * NO-OP — the row is already before it — so a button wired that way would
 * ingest a `ticket.ranked`, spend a server round trip, and move nothing.
 * When that second row does not exist the answer is `null` (the tail) rather
 * than the edge, which is why the second-to-last row's Move down is enabled:
 * only the genuinely last row has nowhere to go.
 */
export function moveTarget<T extends RankRow>(
  sorted: readonly T[],
  movedId: string,
  direction: 'up' | 'down',
): string | null | undefined {
  const index = sorted.findIndex((row) => row.ticketId === movedId);
  if (index === -1) return undefined;
  if (direction === 'up') {
    return index === 0 ? undefined : sorted[index - 1]?.ticketId;
  }
  if (index === sorted.length - 1) return undefined;
  return sorted[index + 2]?.ticketId ?? null;
}
