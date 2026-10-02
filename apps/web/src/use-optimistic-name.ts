'use client';

import { useCallback, useEffect, useState } from 'react';

/** How long a committed rename may wait for a read that carries the name (the same bound as the sheet's overlay). */
export const NAME_TTL_MS = 20_000;

/**
 * A rename, shown the moment it is made (smoothness T7, spec S5; audit SM-03; owner D2b).
 *
 * `name` is what to DRAW: the optimistic name while one is held, else what the read says. `settle` keeps the name
 * until a read carries it (so a committed rename never flashes the old name back while the re-read is in flight)
 * or the TTL passes; `drop` is the refusal arm and returns the read's own name at once. View state only — nothing is
 * written anywhere, so a refusal leaves nothing behind.
 */
export function useOptimisticName(readName: string) {
  const [held, setHeld] = useState<{ name: string; settledAt: number | null } | null>(null);

  const begin = useCallback((name: string) => setHeld({ name, settledAt: null }), []);
  const settle = useCallback(() => setHeld((current) => (current === null ? null : { ...current, settledAt: Date.now() })), []);
  const drop = useCallback(() => setHeld(null), []);

  useEffect(() => {
    if (held !== null && held.settledAt !== null && readName === held.name) setHeld(null);
  }, [held, readName]);

  const settledAt = held?.settledAt ?? null;
  useEffect(() => {
    if (settledAt === null) return;
    const timer = setTimeout(() => setHeld(null), Math.max(0, settledAt + NAME_TTL_MS - Date.now()));
    return () => clearTimeout(timer);
  }, [settledAt]);

  return { name: held?.name ?? readName, pending: held !== null, begin, settle, drop };
}
