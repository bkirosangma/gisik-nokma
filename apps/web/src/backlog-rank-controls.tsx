'use client';

import { useEffect, useRef, useState } from 'react';
import { rankBetween } from '@gisik-nokma/domain';
import { makeSubmittedFactory, moveTarget, neighboursFor, type DataSource, type ListRow } from '@gisik-nokma/app-core';

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

/** The three answers a caller can render, already split the way Ruling 27 requires. */
export type RankOutcome =
  | { status: 'committed' }
  | { status: 'refused'; rule: string; reason: string }
  | { status: 'unreachable'; message: string };

/**
 * Move `movedId` to sit just before `beforeId` — or last, when `beforeId` is
 * `null` — by ingesting one `ticket.ranked`.
 *
 * The order of the three steps is load-bearing. The key is computed FIRST, so
 * a `rankBetween` throw (an inverted neighbour pair — the caller's own bug)
 * happens before anything is shown as moved and before any event exists. The
 * override is applied before the await, so the row moves under the pointer
 * rather than after a round trip. And the override is cleared on every
 * non-committed answer, because an override that outlives its answer is a row
 * displayed at a position the server never agreed to.
 */
export async function submitRank(
  movedId: string,
  beforeId: string | null,
  deps: RankDeps,
): Promise<RankOutcome> {
  const { before, after } = neighboursFor(deps.sorted, movedId, beforeId);
  const rank = rankBetween(before, after);
  deps.onOptimistic(movedId, rank);

  let committed = false;
  try {
    const make = makeSubmittedFactory({ actorId: deps.currentUserId, origin: 'web' });
    const event = make({
      workspaceId: deps.workspaceId,
      entity: { kind: 'ticket', id: movedId },
      type: 'ticket.ranked',
      payload: { rank },
    });
    const results = await deps.dataSource.ingest([event]);
    const result = results[0];
    if (result === undefined) {
      // Ruling 27/41: silence, not a refusal.
      return { status: 'unreachable', message: 'The server did not answer this move.' };
    }
    if (result.status === 'committed') {
      committed = true;
      deps.onRanked();
      return { status: 'committed' };
    }
    return result.status === 'refused'
      ? { status: 'refused', rule: result.rule, reason: result.reason }
      : { status: 'refused', rule: result.code, reason: result.message };
  } catch (cause) {
    // Ruling 27: a transport failure is not a refusal either.
    const message = cause instanceof Error ? cause.message : String(cause);
    return { status: 'unreachable', message: `We could not reach the server for this move — ${message}` };
  } finally {
    // The snap-back. Reached for BOTH failure shapes and for the throw above,
    // which is why it is a `finally` and not two branches — and NOT for the
    // committed path, where the override must survive until the reload's own
    // answer lands (that is what keeps the row from flicking back to its old
    // position during the round trip).
    if (!committed) deps.onOptimistic(movedId, null);
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

  const rank = async (beforeId: string | null): Promise<void> => {
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
        onClick={() => void rank(up ?? null)}
      >
        Move up
      </button>
      <button
        type="button"
        className="gn-row-action"
        aria-label={`Move ${row.title} down`}
        disabled={down === undefined || submitting}
        onClick={() => void rank(down ?? null)}
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
