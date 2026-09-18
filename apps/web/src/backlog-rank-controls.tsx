'use client';

import { useEffect, useRef, useState } from 'react';
import { makeSubmittedFactory, moveTarget, planRankMove, type DataSource, type ListRow } from '@gisik-nokma/app-core';

/**
 * Second wave Task 5 — the Backlog tab's Move up / Move down, and the ONE
 * submit path the drag shares with them.
 *
 * ## `submitRank` is a single function on purpose
 *
 * The drag (`rowDrag.onReorder`) and these two buttons are two entry points
 * for one intent, and the plan's own instruction is that they must not
 * compute their neighbours separately: two implementations of "which key sits
 * between these rows" is how a drag and a button come to produce *different*
 * keys for the same gesture, each individually defensible. So the buttons
 * below call `submitRank`, and so does the page's `onReorder` — the same
 * function, exported from this module, reached from both. 13.708 (buttons)
 * and 13.709 (drag) assert keys from the two entry points; a second
 * neighbour calculation would have to agree with the first on every case to
 * keep both green, which is exactly the property the plan asked to be able to
 * state in one line.
 *
 * ## The three-way failure split is `backlog-start-button.tsx`'s, not a new one
 *
 * Same `make`/`ingest`/`results[0]` shape, same latch reset in a `finally`
 * rather than only after a successful `await`, and the same Ruling-27 split:
 * a real refusal and a transport failure are different sentences on different
 * channels, and silence is neither. The one addition is that this path has an
 * optimistic override to unwind, so every non-committed answer also reports
 * `onOptimistic(ticketId, null)` — see the prop's own note.
 */

/**
 * What `submitRank` needs from its caller. Deliberately not the component's
 * props: the page's drag handler supplies the same six things without a
 * component existing for the row under the pointer.
 */
export type RankDeps = {
  /** The rows AS RANKED AND DRAWN — the order `neighboursFor` reads its neighbours out of. Not the server's raw answer. */
  sorted: ListRow[];
  dataSource: DataSource;
  workspaceId: string;
  currentUserId: string;
  /**
   * Applies an optimistic key for a row, or CLEARS it when `rank` is `null`.
   *
   * One callback rather than two because the two operations are the same
   * operation: the override is a value that exists between the gesture and
   * the server's answer, and clearing it is how the tab snaps back. The page
   * implements the clear as a `Map.delete`, so an override can never be
   * `null`-valued and shadow a row's real key with "unranked".
   */
  onOptimistic: (ticketId: string, rank: string | null) => void;
  /** Called ONLY on `committed` — the page's `list.reload()`, which is what reconciles the tab with the server's key. */
  onRanked: () => void;
};

/** The answers a caller can render, already split the way Ruling 27 requires. */
export type RankOutcome =
  | { status: 'committed' }
  | { status: 'refused'; rule: string; reason: string }
  | { status: 'unreachable'; message: string }
  /**
   * SOME of the events in the batch committed and some did not. Its own status
   * rather than a folded refusal, because it is neither a verdict nor a
   * dropped connection, and calling it either would be a lie about the cause.
   * See `submitRank`'s docblock for what the reader sees.
   */
  | { status: 'partial'; applied: number; total: number; message: string };

/**
 * Move `movedId` to sit just before `beforeId` — or last, when `beforeId` is
 * `null` — by ingesting the events `planRankMove` says the move needs.
 *
 * ## Why this can be more than one event (owner ruling, 2026-09-18, option B)
 *
 * A rank key cannot place a row AFTER a row that has no key, so in a backlog
 * where nothing is ranked — the state every project starts in — "place last"
 * and any move that steps over an unranked row are unrepresentable. The ruling
 * is to rank those rows first, in their drawn order, and then apply the move,
 * all in one `ingest`. `planRankMove` computes both halves; this function
 * sends them.
 *
 * ## What the reader sees when only SOME events commit
 *
 * The results are read BY INDEX, and the first index that is not `committed`
 * decides the outcome. If it is index 0 nothing was applied and this is the
 * ordinary refusal/silence/transport case. If it is LATER, the batch partially
 * applied: some rows now carry keys and the move did not happen (or happened
 * against a list the server only half-ranked). **The drawn order can therefore
 * differ from the one the person asked for** — that is the cost of option B,
 * accepted by the owner, not waived. This function does not paper over it: it
 * reports `partial`, drops every optimistic key it applied, and calls
 * `onRanked()` so the tab reloads and shows the SERVER'S OWN state. The person
 * is told what happened rather than left with a client-side order the server
 * never agreed to.
 *
 * The realistic partial — the server applies a batch in order, so a PREFIX
 * commits — leaves the drawn order unchanged and simply does not perform the
 * move, because the backfilled keys ascend within the tail they already
 * occupied. A non-prefix partial can genuinely reorder, and the reload is what
 * makes that visible instead of hidden.
 *
 * The order of the steps is load-bearing. The keys are computed first, so a
 * `rankBetween` throw (an inverted neighbour pair — the caller's own bug)
 * happens before anything is shown as moved and before any event exists. Every
 * optimistic key is applied before the await, INCLUDING the backfilled rows':
 * without those, the moved row would be the only ranked row in the client's
 * list and would draw above the rows it was dragged past — the very defect
 * this ruling fixes, reintroduced optimistically. And every key this call
 * applied is dropped on any non-committed answer, because a key that outlives
 * its answer is a row displayed at a position the server never agreed to.
 */
export async function submitRank(
  movedId: string,
  beforeId: string | null,
  deps: RankDeps,
): Promise<RankOutcome> {
  const plan = planRankMove(deps.sorted, movedId, beforeId);
  const applied = [...plan.backfill.map((entry) => entry.ticketId), movedId];
  for (const entry of plan.backfill) deps.onOptimistic(entry.ticketId, entry.rank);
  deps.onOptimistic(movedId, plan.rank);

  let keep = false;
  try {
    const make = makeSubmittedFactory({ actorId: deps.currentUserId, origin: 'web' });
    const events = [
      ...plan.backfill.map((entry) =>
        make({
          workspaceId: deps.workspaceId,
          entity: { kind: 'ticket', id: entry.ticketId },
          type: 'ticket.ranked',
          payload: { rank: entry.rank },
        }),
      ),
      make({
        workspaceId: deps.workspaceId,
        entity: { kind: 'ticket', id: movedId },
        type: 'ticket.ranked',
        payload: { rank: plan.rank },
      }),
    ];
    const results = await deps.dataSource.ingest(events);
    // BY INDEX, and a MISSING result counts as a failure rather than being
    // skipped: an answer shorter than the batch is silence about the tail of
    // it, which is not a commit.
    const failedAt = events.findIndex((_, index) => results[index]?.status !== 'committed');
    if (failedAt === -1) {
      keep = true;
      deps.onRanked();
      return { status: 'committed' };
    }
    if (failedAt > 0) {
      // Partial. Reload so the tab shows what the server holds, and say so.
      deps.onRanked();
      return {
        status: 'partial',
        applied: failedAt,
        total: events.length,
        message: `Only ${failedAt} of the ${events.length} parts of this move reached the server — the list has been reloaded to match what the server holds.`,
      };
    }
    const failure = results[0];
    if (failure === undefined) {
      // Ruling 27/41: silence, not a refusal.
      return { status: 'unreachable', message: 'The server did not answer this move.' };
    }
    if (failure.status !== 'committed') {
      // The batch's FIRST event is the one that did not commit, so this is the
      // ordinary one-event failure — a refusal, or a rejected event, split the
      // way Ruling 27 requires.
      return failure.status === 'refused'
        ? { status: 'refused', rule: failure.rule, reason: failure.reason }
        : { status: 'refused', rule: failure.code, reason: failure.message };
    }
    // UNREACHABLE, and said rather than cast away: `failedAt === 0` means the
    // first event did not commit, so a `committed` first result contradicts
    // the index that got us here. If a future change to the loop above ever
    // makes this reachable, silence is the honest answer — the batch reported
    // no failure and no success worth acting on.
    return { status: 'unreachable', message: 'The server did not answer this move.' };
  } catch (cause) {
    // Ruling 27: a transport failure is not a refusal either.
    const message = cause instanceof Error ? cause.message : String(cause);
    return { status: 'unreachable', message: `We could not reach the server for this move — ${message}` };
  } finally {
    // The snap-back. Reached for BOTH failure shapes, for the partial case and
    // for the throw above — which is why it is a `finally` and not branches —
    // and NOT for the committed path, where the keys must survive until the
    // reload's own rows land (that is what keeps the list from flicking back
    // to its old positions during the round trip).
    if (!keep) for (const id of applied) deps.onOptimistic(id, null);
  }
}

export type BacklogRankControlsProps = {
  row: ListRow;
  /** Every row of the tab, in drawn order — see `RankDeps.sorted`. */
  sorted: ListRow[];
  dataSource: DataSource;
  workspaceId: string;
  currentUserId: string;
  onRanked: () => void;
  onOptimistic: (ticketId: string, rank: string | null) => void;
};

/**
 * A Backlog row's Move up / Move down pair, and that row's own notice.
 *
 * The buttons are disabled at the edges — `moveTarget` answers `undefined`
 * there — but a `disabled` attribute is not a guard: `rank()` re-checks the
 * target before submitting, the same way `BacklogStartButton` guards its
 * `null` target against a stray programmatic click.
 */
export function BacklogRankControls({
  row,
  sorted,
  dataSource,
  workspaceId,
  currentUserId,
  onRanked,
  onOptimistic,
}: BacklogRankControlsProps) {
  const [submitting, setSubmitting] = useState(false);
  const [serverRefusal, setServerRefusal] = useState<{ rule: string; reason: string } | null>(null);
  const [transportError, setTransportError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  const up = moveTarget(sorted, row.ticketId, 'up');
  const down = moveTarget(sorted, row.ticketId, 'down');

  const rank = async (beforeId: string | null | undefined): Promise<void> => {
    // A GUARD, not a comment. The `disabled` attribute stops a click at the
    // edge, but this function's docblock used to claim it "re-checks the
    // target ... the same way `BacklogStartButton` guards its `null` target"
    // while the body forwarded `up ?? null` — turning the edge's `undefined`
    // into "place last" and teleporting the top row to the bottom on any
    // programmatic call. `BacklogStartButton` really does guard (its
    // `if (toStateId === null) return`), so this is that shape rather than a
    // sentence about it.
    if (beforeId === undefined) return;
    setSubmitting(true);
    try {
      const outcome = await submitRank(row.ticketId, beforeId, {
        sorted,
        dataSource,
        workspaceId,
        currentUserId,
        onOptimistic,
        onRanked,
      });
      if (!mountedRef.current) return;
      if (outcome.status === 'refused') {
        setTransportError(null);
        setServerRefusal({ rule: outcome.rule, reason: outcome.reason });
        return;
      }
      if (outcome.status === 'unreachable') {
        setServerRefusal(null);
        setTransportError(outcome.message);
        return;
      }
      if (outcome.status === 'partial') {
        // NOT the refusal channel: part of the batch did commit, so this is
        // not a verdict, and `ui.css` is explicit that a non-verdict never
        // wears `--server`. The sentence already says what happened.
        setServerRefusal(null);
        setTransportError(outcome.message);
        return;
      }
      setServerRefusal(null);
      setTransportError(null);
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="gn-row-action"
        aria-label={`Move ${row.title} up`}
        disabled={up === undefined || submitting}
        onClick={() => void rank(up)}
      >
        Move up
      </button>
      <button
        type="button"
        className="gn-row-action"
        aria-label={`Move ${row.title} down`}
        disabled={down === undefined || submitting}
        onClick={() => void rank(down)}
      >
        Move down
      </button>
      {serverRefusal !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--server">
          {`Refused by the server — ${serverRefusal.rule}: ${serverRefusal.reason}`}
        </p>
      ) : null}
      {transportError !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--transport">
          {transportError}
        </p>
      ) : null}
    </>
  );
}
