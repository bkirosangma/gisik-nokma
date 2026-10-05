'use client';

import { useEffect, useRef, useState } from 'react';
import {
  makeSubmittedFactory,
  writeFailureCopy,
  writeFailureRefusalClass,
  type DataSource,
  type ListRow,
} from '@gisik-nokma/app-core';
import type { StartRefusal } from './use-optimistic-starts.js';

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
  /** Called after a `committed` answer. The page's own `list.reload()`; the row has already left the tab (the page hid it on `onBegin`) and stays hidden until a read agrees. */
  onStarted: () => void;
  /**
   * The optimistic arms (smoothness T7, spec S5), all optional so the button still stands alone. The PAGE hides the
   * row on `onBegin` — which unmounts this button — so the answer is reported through `onSettled` / `onFailed`
   * (closures that outlive the button), and a refusal the page kept comes back as `initialRefusal` when the row does.
   */
  onBegin?: (ticketId: string) => void;
  onSettled?: (ticketId: string) => void;
  onFailed?: (ticketId: string, refusal: StartRefusal) => void;
  initialRefusal?: StartRefusal;
};

/**
 * Task 10 (backlog/closed spec §5.4) — the Backlog tab's per-row **Start**.
 *
 * Ruling 41 (coordinator, backlog-and-closed-core dispatch, 2026-09-17):
 * spec §1.2 says the Start edge "carries no rules, ever" and
 * `universalTransitions` (`packages/domain/src/workflow.ts:88`) builds it
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
 * capability-object `onMoved` — the page's own `list.reload()`. The reload is no longer what makes the row
 * leave: the page hides it the moment Start is pressed (`onBegin`, `use-optimistic-starts.ts`) and keeps it
 * hidden until the server's `getTickets` stops returning it in the backlog, which is what the reload fetches
 * (the board's `closeCard` does the same since T7: the card is hidden once the close commits).
 */
export function BacklogStartButton({
  row,
  toStateId,
  dataSource,
  workspaceId,
  currentUserId,
  onStarted,
  onBegin,
  onSettled,
  onFailed,
  initialRefusal,
}: BacklogStartButtonProps) {
  const [submitting, setSubmitting] = useState(false);
  const [serverRefusal, setServerRefusal] = useState<{ rule: string; reason: string } | null>(
    initialRefusal?.kind === 'server' ? { rule: initialRefusal.rule, reason: initialRefusal.reason } : null,
  );
  const [transportError, setTransportError] = useState<string | null>(initialRefusal?.kind === 'transport' ? initialRefusal.message : null);
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
    onBegin?.(row.ticketId);
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
        onFailed?.(row.ticketId, { kind: 'transport', message: 'The server did not answer this start.' });
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
        onSettled?.(row.ticketId);
        onStarted();
        return;
      }
      onFailed?.(
        row.ticketId,
        result.status === 'refused'
          ? { kind: 'server', rule: result.rule, reason: result.reason }
          : { kind: 'server', rule: result.code, reason: result.message },
      );
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
      const message = writeFailureCopy(cause, (reason) => `We could not reach the server for this start: ${reason}`);
      onFailed?.(row.ticketId, { kind: 'transport', message });
      if (mountedRef.current) setTransportError(message);
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
          {`Refused by the server: ${serverRefusal.rule}: ${serverRefusal.reason}`}
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
