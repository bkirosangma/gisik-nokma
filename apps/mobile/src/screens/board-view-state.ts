import type { TicketSummary } from '@gisik-nokma/app-core';

export const BOARD_EMPTY_TEXT = 'No tickets yet';
export const BOARD_NO_MATCH_TEXT = 'No tickets match';

export type BoardListState = 'loading' | 'error' | 'empty' | 'no-match' | 'rows';

/**
 * What the board's list area shows. `tickets` is `null` until the first read answers, and `null` is NOT empty: the empty copy is only for a
 * read that answered `[]` (spec §3.3). A read or init that FAILED is an `error` — the screen's alert already says why — never a skeleton
 * forever (E2-41's shape). An empty SEARCH answers "No tickets match", not "No tickets yet". Rows already on screen stay when a later read
 * fails. A pure function because this package's tests run in node with no React Native renderer (`vitest.config.ts`).
 */
export function boardListState(input: {
  tickets: readonly TicketSummary[] | null;
  readError: string | null;
  initError: string | null | undefined;
  query: string;
}): BoardListState {
  if (input.tickets === null) return input.readError !== null || (input.initError ?? null) !== null ? 'error' : 'loading';
  if (input.tickets.length > 0) return 'rows';
  return input.query === '' ? 'empty' : 'no-match';
}
