/**
 * The read epoch: a counter that moves when the person the reads belong to
 * changes (smoothness T3, spec D1 and review focus 2).
 *
 * `clearLiveQueryCache()` bumps it. Anything that holds a read ACROSS time
 * (the live-query cache's in-flight writes, `withInflightDedupe`'s shared
 * promises, the roster burst memo) stamps what it holds with the epoch it was
 * issued under and refuses to serve or store it under another. Emptying the
 * cache alone is not enough: a read still on the wire when the first person
 * signs out would otherwise resolve into the second person's cache, and an
 * identical read the second person makes would join the first person's promise.
 *
 * It lives in its own module, not in `views/live-query-cache.ts`, because
 * `online/` reads it and the online layer does not import from `views/`.
 */
let epoch = 0;

export function readEpoch(): number {
  return epoch;
}

export function bumpReadEpoch(): void {
  epoch += 1;
}
