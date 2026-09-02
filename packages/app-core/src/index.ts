export type { DataSource, DataSourceQuery, StreamItem, Unsubscribe } from './data-source.js';
export * from './view-types.js';
export { makeSubmittedFactory, type EnvelopeSeed, type MakeSubmitted } from './submit.js';
export { actorLabel, formatDate, formatDateTime, formatStateProvenance } from './provenance.js';
export { createClientStateCache, type ClientStateCache } from './cache.js';
export { withCacheFeed } from './cache-feed.js';
export {
  PARENT_TERMINAL_RULE,
  completeForPrecheck,
  contextFromCache,
  precheckEvent,
  type PrecheckDeps,
  type PrecheckResult,
} from './precheck.js';
export { formatRollup } from './views/rollup-text.js';
export { useLiveQuery, type LiveQueryResult } from './views/use-live-query.js';
export { Board, useBoard, type BoardProps } from './views/board.js';
export {
  columnLabel,
  countRows,
  groupRows,
  nestRows,
  recentlyAssignedRows,
  visibleNodes,
  type GroupLabels,
  type ListRowNode,
  type ListSection,
} from './views/list-model.js';
export { usePreferences, type PreferencesResult } from './views/use-preferences.js';
// `PrefsOrigin` is NOT re-listed here: it is declared in `view-types.ts` and
// already leaves through the `export *` above. Naming it twice at the package
// root would make two export paths for one type — the same duplication the type
// change itself removes.
export {
  TicketList,
  useTicketList,
  type TicketListProps,
  type TicketListState,
} from './views/ticket-list.js';
export { AttentionStrip, useAttention, type AttentionStripProps } from './views/attention-strip.js';
export { MyWork, useMyWork, type MyWorkProps } from './views/my-work.js';
