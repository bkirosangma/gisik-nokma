'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

/** What the Backlog tab prints under a row whose Start did not take — held HERE, because the row's own button unmounts while the row is hidden. */
export type StartRefusal = { kind: 'server'; rule: string; reason: string } | { kind: 'transport'; message: string };

/** How long a committed Start may wait for a read that no longer holds the row (the same bound as the sheet's overlay). */
export const START_TTL_MS = 20_000;

/**
 * The Backlog tab's Start, shown the moment it is made (smoothness T7, spec S5; audit SM-03; owner D2b).
 *
 * `begin` hides the row at once; `settle` keeps it hidden until a read no longer holds it in the backlog (or the
 * TTL passes) so a committed Start never flashes the row back while the reload is in flight; `fail` brings the row
 * back and keeps the reason. The state is VIEW state: nothing here is data, so a failure leaves nothing behind.
 *
 * The refusal lives on the PAGE, keyed by ticket, because `BacklogStartButton` unmounts with its hidden row and
 * would take its own refusal with it.
 */
export function useOptimisticStarts(inBacklog: ReadonlySet<string> | null) {
  /** ticketId → when its write was answered (`null` while it is still open). */
  const [started, setStarted] = useState<ReadonlyMap<string, number | null>>(new Map());
  const [refusals, setRefusals] = useState<Readonly<Record<string, StartRefusal>>>({});

  const forget = useCallback((ids: readonly string[]) => {
    setStarted((current) => {
      const next = new Map(current);
      for (const id of ids) next.delete(id);
      return next;
    });
  }, []);

  const begin = useCallback((ticketId: string) => {
    setStarted((current) => new Map(current).set(ticketId, null));
    setRefusals((current) => {
      if (current[ticketId] === undefined) return current;
      const { [ticketId]: _gone, ...rest } = current;
      return rest;
    });
  }, []);
  const settle = useCallback((ticketId: string) => setStarted((current) => new Map(current).set(ticketId, Date.now())), []);
  const fail = useCallback(
    (ticketId: string, refusal: StartRefusal) => {
      forget([ticketId]);
      setRefusals((current) => ({ ...current, [ticketId]: refusal }));
    },
    [forget],
  );

  // A settled Start retires when a read no longer holds the row in the backlog.
  useEffect(() => {
    if (inBacklog === null) return;
    const done = [...started].filter(([id, at]) => at !== null && !inBacklog.has(id)).map(([id]) => id);
    if (done.length > 0) forget(done);
  }, [inBacklog, started, forget]);

  // A settled Start no read ever confirms expires, so the row can never stay hidden for good.
  useEffect(() => {
    const times = [...started.values()].filter((at): at is number => at !== null);
    if (times.length === 0) return;
    const timer = setTimeout(() => {
      const now = Date.now();
      forget([...started].filter(([, at]) => at !== null && now - at >= START_TTL_MS).map(([id]) => id));
    }, Math.max(0, Math.min(...times) + START_TTL_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [started, forget]);

  const hidden = useMemo<ReadonlySet<string>>(() => new Set(started.keys()), [started]);
  return { hidden, refusals, begin, settle, fail };
}
