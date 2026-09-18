import { compareByRank, rankBetween } from '@gisik-nokma/domain';

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
 * THAT HAS A KEY. Skipping backwards to the last real key is what makes the
 * tail case correct: reading `.rank` off the immediately preceding row instead
 * answers `null`, and `rankBetween(null, null)` is the midpoint, so the moved
 * row lands wherever the midpoint happens to sort — with `[A('g'), B('n'),
 * C(null)]` and C moved last, the midpoint `'i'` draws `A C B`, one row from
 * where the pointer was, and with nothing ranked at all it draws the row
 * FIRST (see the OPEN DEFECT below).
 *
 * ## OPEN DEFECT THIS FUNCTION CANNOT FIX (measured 2026-09-18, needs a ruling)
 *
 * `compareByRank` sorts EVERY ranked row above EVERY unranked one, so a rank
 * key can never place a row AFTER an unranked row. When `rows` holds no key at
 * all — the state of every backlog before its first move, since `rank` starts
 * `NULL` — this function answers `null`, `rankBetween(null, null)` answers the
 * midpoint, and "place last" therefore moves the moved row to the **front**:
 * `[t1,t2,t3,t4]` all unranked, `t4` dragged to the tail, draws `t4 t1 t2 t3`.
 * The same fact makes an enabled `Move down` a no-op whenever it would have to
 * step over an unranked row. Neither is a bug in this file — it is the plan's
 * §8 rule (the plan says `before` is "the last RANKED row's key") meeting a
 * case the plan does not contemplate. Recorded rather than fixed here because
 * the remedy is a product decision (refuse the inexpressible move, or rank the
 * unranked rows first), not a local repair. Owner: the controller ruling
 * requested in `gisik-nokma-lanes/EXEC-2026-09-18-t5-unranked-tail.md`.
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
 * unranked row has no key to sit after, and only a key can express "after".
 * The same fallback covers a `beforeId` whose row is itself unranked — there
 * is no key to sit before.
 *
 * THAT ANSWER IS THE CLOSEST EXPRESSIBLE POSITION, NOT ALWAYS THE REQUESTED
 * ONE, and an earlier draft of this docblock said the opposite ("after the
 * last row and after the last key are the same position in the rendered
 * order"). **They are not**, and an independent review measured it: because
 * `compareByRank` sorts ranked rows above unranked ones, a new key above the
 * last ranked key still renders ABOVE every unranked row. So a move that has
 * to step over an unranked row does not land where the pointer was — it lands
 * after the last ranked row, which may be several rows higher. See the OPEN
 * DEFECT note on `lastRankedKey`: when no row is ranked at all, this returns
 * `null` and the caller's "place last" inverts to "place first".
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

/** One row that had no key and is about to be given one. */
export type RankBackfill = { ticketId: string; rank: string };

/** What a move must ingest: keys for the rows that had none, then the key for the moved row. */
export type RankMovePlan = {
  /** Keys for the rows that had none, in DRAWN order. Empty when every other row already had one. */
  backfill: RankBackfill[];
  /** The key the moved row takes. */
  rank: string;
};

/**
 * The events a move must ingest — OWNER RULING, 2026-09-18, option B.
 *
 * ## Why this exists at all
 *
 * `compareByRank` sorts EVERY ranked row above EVERY unranked one, so a rank
 * key can never place a row AFTER a row that has no key. Two moves are
 * therefore unrepresentable on their own — and both are the ordinary case,
 * because `rank` starts `null` for every ticket and so every project's backlog
 * begins with nothing ranked:
 *
 * - "place last" in an all-unranked backlog: the only key available is the
 *   midpoint, and a midpoint is the FIRST ranked row, so the row went to the
 *   top (`[t1,t2,t3,t4]` + `t4` to the tail drew `t4 t1 t2 t3`);
 * - any move that has to step over an unranked row: the row landed after the
 *   last RANKED row, several places from where the pointer was, and if it was
 *   already there the move committed an event and changed nothing.
 *
 * The owner ruled that the fix is to rank the rows that have no key FIRST, in
 * their current drawn order, and then apply the move — one ingest, N+1 events.
 * The drawn order is preserved because the backfilled keys are strictly
 * ascending and all sit above the last existing key, which is exactly where
 * `compareByRank` was already drawing those rows.
 *
 * ## The cost the owner accepted, stated rather than implied
 *
 * This is the first path on this surface that writes MORE THAN ONE event for
 * one gesture, so a batch can partially succeed. `submitRank` reads the
 * results BY INDEX and treats a partial application as its own outcome: the
 * client's optimistic keys are dropped and the server's own state is reloaded,
 * so the tab shows what the server actually holds rather than what was asked
 * for. What a reader sees in the partial case is therefore NEVER a lie about
 * the server's state — but it can be a silently different order from the one
 * they asked for, and that is the price of B. The realistic partial (a prefix
 * committing, since the server applies a batch in order) leaves the drawn
 * order UNCHANGED and simply does not perform the move; a non-prefix partial
 * can reorder, and the reload is what makes that visible instead of hidden.
 */
export function planRankMove<T extends RankRow>(
  sorted: readonly T[],
  movedId: string,
  beforeId: string | null,
): RankMovePlan {
  const others = sorted.filter((row) => row.ticketId !== movedId);
  const newKeys = new Map<string, string>();
  const backfill: RankBackfill[] = [];
  // The unranked rows are a contiguous TAIL of `sorted` (that is what
  // `compareByRank` does), and they are visited in drawn order, so the keys
  // ascend and the visible order is untouched by the backfill itself.
  let cursor = lastRankedKey(others);
  for (const row of others) {
    if (row.rank !== null) continue;
    const key = rankBetween(cursor, null);
    backfill.push({ ticketId: row.ticketId, rank: key });
    newKeys.set(row.ticketId, key);
    cursor = key;
  }
  // The neighbours are read against the backfilled list, so "place last" now
  // has a last key to sit after and the moved row lands where it was asked to.
  const effective =
    backfill.length === 0
      ? sorted
      : sorted.map((row) => {
          const key = newKeys.get(row.ticketId);
          return key === undefined ? row : { ...row, rank: key };
        });
  const { before, after } = neighboursFor(effective, movedId, beforeId);
  return { backfill, rank: rankBetween(before, after) };
}
