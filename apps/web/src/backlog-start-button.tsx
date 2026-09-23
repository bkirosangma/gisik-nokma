'use client';

import { useEffect, useRef, useState } from 'react';
import {
  makeSubmittedFactory,
  writeFailureCopy,
  writeFailureRefusalClass,
  type DataSource,
  type ListRow,
} from '@gisik-nokma/app-core';

export type BacklogStartButtonProps = {
  row: ListRow;
  /**
   * The universal Start edge's target — `startTargetFor(row, types, defs)`,
   * this file's caller. `null` while the row's own workflow definition has
   * not (yet) arrived, or while its type is unknown; either way Start stays
   * disabled rather than submitting an event with no `to`.
   */
  toStateId: string | null;
  dataSource: DataSource;
  workspaceId: string;
  /**
   * NOT in Ruling 42's own prop list, which named only `{ row, toStateId,
   * dataSource, workspaceId, onStarted }` — added deliberately, because
   * `makeSubmittedFactory` (below) needs an `actorId` and nothing else in
   * that list can supply one. The page gates whether this component mounts
   * at all on `session.kind === 'signed-in'` (mirroring `board.tsx`'s own
   * `moves` capability, gated the same way for the identical reason: case
   * 3.144, "the write door is never offered an empty actor"), so this is
   * never `''` while a click can reach it.
   */
  currentUserId: string;
  /** Called after a `committed` answer. The page's own `list.reload()` — the row leaves this tab on the next read. */
  onStarted: () => void;
};

/**
 * Task 10 (backlog/closed spec §5.4) — the Backlog tab's per-row **Start**.
 *
 * Ruling 41 (coordinator, backlog-and-closed-core dispatch, 2026-09-17):
 * spec §1.2 says the Start edge "carries no rules, ever" and
 * `universalTransitions` (`packages/domain/src/workflow.ts:87`) builds it
 * with `rules: []`, so §5.4's "a gated initial edge still asks" is
 * unreachable — `moveOutcome` could only ever answer `direct`. Start
 * therefore submits `ticket.transitioned { to: toStateId }` DIRECTLY through
 * `dataSource.ingest`, with no page-level `TransitionDialog` and no
 * `MoveArrows` extraction — the smaller diff the brief asked to choose
 * between, and the ruling names it explicitly: neither.
 *
 * The idiom below mirrors `board.tsx`'s `submitDirect` almost exactly (same
 * `make`/`ingest`/`results[0]` shape, same `submitting` latch reset in a
 * `finally` rather than only after a successful `await`, same Ruling-27
 * split of a real refusal from a transport failure or silence) because it is
 * the SAME edge case that component already proved out — a rules-free,
 * declared transition submitted with no dialog. Two things differ: there is
 * no `refusal`/`MoveRefusalNotice` state here (that is `attemptMove`'s OWN
 * client-side "which arrow target is undeclared" check; a Backlog row's
 * Start target is either known or `null`-and-disabled, never ambiguous
 * between several), and a `committed` answer calls `onStarted` rather than a
 * capability-object `onMoved` — the page's own `list.reload()`, since the
 * server's `getTickets` simply stops returning this row in the backlog once
 * its state moves, the same "the reload is what makes it leave" reasoning
 * `board.tsx`'s `closeCard` docblock gives for the board's own `getBoard`.
 */
export function BacklogStartButton({ row, toStateId, dataSource, workspaceId, currentUserId, onStarted }: BacklogStartButtonProps) {
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

  const start = async (): Promise<void> => {
    if (toStateId === null) return; // disabled in the DOM too; guarded here against a stray programmatic click
    setSubmitting(true);
    try {
      const make = makeSubmittedFactory({ actorId: currentUserId, origin: 'web' });
      const transition = make({
        workspaceId,
        entity: { kind: 'ticket', id: row.ticketId },
        type: 'ticket.transitioned',
        payload: { to: toStateId },
      });
      const results = await dataSource.ingest([transition]);
      const result = results[0];
      if (result === undefined) {
        // Ruling 41/27: silence, not a refusal.
        if (mountedRef.current) {
          setServerRefusal(null);
          setTransportError('The server did not answer this start.');
        }
        return;
      }
      if (result.status === 'committed') {
        if (mountedRef.current) {
          setServerRefusal(null);
          setTransportError(null);
        }
        onStarted();
        return;
      }
      if (mountedRef.current) {
        setTransportError(null);
        setServerRefusal(
          result.status === 'refused'
            ? { rule: result.rule, reason: result.reason }
            : { rule: result.code, reason: result.message },
        );
      }
    } catch (cause) {
      // Ruling 27: a transport failure is not a refusal either — own channel,
      // own sentence. E5-25: the 401 arm joins it through the one author.
      if (mountedRef.current) {
        setTransportError(
          writeFailureCopy(cause, (message) => `We could not reach the server for this start — ${message}`),
        );
      }
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className="gn-row-action"
        aria-label={`Start ${row.title}`}
        disabled={toStateId === null || submitting}
        onClick={() => void start()}
      >
        Start
      </button>
      {serverRefusal !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--server">
          {`Refused by the server — ${serverRefusal.rule}: ${serverRefusal.reason}`}
        </p>
      ) : null}
      {transportError !== null ? (
        <p role="alert" className={writeFailureRefusalClass(transportError)}>
          {transportError}
        </p>
      ) : null}
    </>
  );
}
