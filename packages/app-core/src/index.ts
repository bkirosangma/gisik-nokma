export type { DataSource, DataSourceQuery, ServerStreamFrame, Unsubscribe } from './data-source.js';
export * from './workflow-builder/index.js';
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
export { Board, EMPTY_BOARD_COPY, useBoard, type BoardProps } from './views/board.js';
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
export {
  PlainTextEditorSlot,
  type EditorSlotComponent,
  type EditorSlotProps,
  type EditorSlotSubmission,
  type EditorSlotUpload,
} from './views/editor-slot.js';
export { HistoryList } from './views/history-list.js';
export {
  AttachmentList,
  type AttachmentListEntry,
  type AttachmentListProps,
} from './views/attachment-list.js';
export {
  TransitionDialog,
  transitionOptions,
  type TransitionDialogProps,
  type TransitionOption,
  type TransitionSubmission,
} from './views/transition-dialog.js';
export { TicketSheet, HISTORY_PAGE_LIMIT, type TicketSheetProps } from './views/ticket-sheet.js';
export {
  UnansweredClaimError,
  reopenAndProceed,
  reopenStateOptions,
  submitChildEvent,
  type GuardedOutcome,
  type InvalidResult,
  type Refusal,
  type ReopenOutcome,
  type ReopenPlan,
} from './flows/guarded-child-event.js';
export { ReopenDialog, type ReopenDialogProps, type RefusalOrigin } from './views/reopen-dialog.js';
export {
  NewTicketDialog,
  type NewTicketDialogProps,
  type NewTicketDraft,
} from './views/new-ticket-dialog.js';
export { CreateTicketFlow, type CreateTicketFlowProps } from './views/create-ticket-flow.js';
export {
  LOCKOUT_WARNING_COPY,
  OWNER_ALWAYS_SEES_COPY,
  VisibilityEditor,
  type VisibilityClaim,
  type VisibilityEditorProps,
} from './views/visibility-editor.js';
// Plan 9 Task 8 — the calendar view-model and the claim readers under it.
// `FilterSpec` is deliberately absent from this block: it is declared in
// `view-types.ts` and already leaves through the `export *` above. The
// predicate lives in `filter/matches-filter.ts` precisely so the TYPE keeps
// one declaration site.
export {
  DAY_MS,
  addDays,
  dateMs,
  isCalendarDay,
  isoDate,
  mondayOnOrBefore,
  monthGridWeeks,
  type WeekDays,
} from './claims/dates.js';
export {
  customDateClaimsOf,
  dateClaimOf,
  titleOf,
  type CustomDateClaimView,
  type CustomDateField,
  type DateClaimView,
  type TicketDatesInput,
} from './claims/ticket-dates.js';
export {
  CALENDAR_ALL_HIDDEN_COPY,
  CALENDAR_EMPTY_MONTH_COPY,
  CALENDAR_NARROWED_MONTH_COPY,
  TIMELINE_EMPTY_COPY,
  TIMELINE_NARROWED_COPY,
  TIMELINE_OUT_OF_WINDOW_COPY,
  TIMELINE_SIDE_LIST_COPY,
  TIMELINE_SIDE_LIST_UNDRAWABLE_COPY,
  barProvenance,
  claimTooltip,
  contradictionCopy,
  customClaimLabel,
  dueClaimLabel,
  formatClaimDate,
  startClaimLabel,
  unplaceableDayCopy,
  type AttributedDate,
  type UserNameFn,
} from './claims/claim-labels.js';
export {
  BUILTIN_EPIC_TYPE_ID,
  EPIC_RANK,
  epicAncestorOf,
  isBuiltinEpicType,
  type IsEpicType,
} from './hierarchy/epic-ancestor.js';
export { matchesFilter } from './filter/matches-filter.js';
export {
  buildCalendarModel,
  type CalendarBar,
  type CalendarCustomFieldTally,
  type CalendarItem,
  type CalendarMarker,
  type CalendarModel,
  type CalendarModelOptions,
  type CalendarMonth,
  type CalendarWeek,
} from './calendar/calendar-model.js';
// Plan 9 Task 9 — the month grid over that model. Named exports with the `.js`
// extension, matching every other block here; `export *` would re-export the
// module's internal helpers as package surface.
export {
  CalendarView,
  MAX_VISIBLE_PER_WEEK,
  type CalendarViewProps,
} from './calendar/calendar-view.js';
// Plan 9 Task 10 — the timeline view-model. `FilterSpec` and `IsEpicType` are
// deliberately absent from this block: both already leave through the
// declarations above, and a second export path would fork the vocabulary the
// calendar and the timeline must share to agree about one claim.
export {
  NO_DATES_NOTE,
  NO_DAY_CLAIMS_NOTE,
  buildTimelineModel,
  type TimelineBarSpan,
  type TimelineCustomClaim,
  type TimelineGroup,
  type TimelineModel,
  type TimelineModelOptions,
  type TimelineRow,
  type TimelineSideEntry,
  type TimelineSideReason,
  type TimelineWeekCol,
} from './timeline/timeline-model.js';
// Plan 9 Task 11 — the week columns over that model. Named exports with the
// `.js` extension, matching every block above; `export *` would re-export this
// module's internal helpers (`CustomClaimList`, `sideEntryClassName`) as
// package surface. `SHIFT_DAYS` is deliberately not listed: nothing outside
// the component reads it, and its own test measures the shift by the columns
// that move rather than by re-stating the constant.
export { TimelineView, type TimelineViewProps } from './timeline/timeline-view.js';
// Plan 9 Task 12 — the inbox. Named exports with the `.js` extension, matching
// every block above; `export *` (which the plan's draft writes five times)
// would re-export this module's internals — `PATHS`, `sinceDay`, `CAP` — as
// package surface. `Notification` and the payload types are deliberately absent:
// they are the DOMAIN's declarations and re-exporting them here would give the
// vocabulary a second path, which is the drift the calendar and timeline blocks
// above refuse for `FilterSpec` and `IsEpicType`.
export type { NotificationsGateway, NotificationsPage } from './inbox/gateway.js';
export {
  notificationBody,
  notificationHeadline,
  notificationTicketId,
} from './inbox/format.js';
export { NotificationIcon, type NotificationIconProps } from './inbox/icons.js';
export { UnreadBadge, type UnreadBadgeProps } from './inbox/unread-badge.js';
export { InboxView, type InboxViewProps } from './inbox/inbox-view.js';
// Plan 9 Task 13 — saved filters. `SavedFilter`, `PreferencesDoc` and the
// domain's `FilterSpec` are deliberately absent from this block, and the reason
// is sharper than the one the `FilterSpec`/`IsEpicType` notes above give: this
// package ALREADY declares a `SavedFilter` (`view-types.ts:183`, the client
// vocabulary, field `filter`) which leaves through the `export *` on line 3.
// Re-exporting the domain's `SavedFilter` (field `filterSpec`, ruling P26) here
// would put two different declarations behind one name at the package root.
// Consumers of these functions take those types from `@gisik-nokma/domain`,
// which is where the schema that validates them lives.
export type { PreferencesGateway } from './preferences/preferences-gateway.js';
export {
  MAX_SAVED_FILTERS,
  SavedFilterRefused,
  deleteSavedFilter,
  loadSavedFilters,
  parseSavedFilters,
  saveFilter,
  type SavedFilterRefusalReason,
} from './preferences/saved-filters.js';
export {
  SAVED_FILTERS_EMPTY_COPY,
  SavedFiltersMenu,
  type SavedFiltersMenuProps,
} from './preferences/saved-filters-menu.js';

// Plan 10 Task 12 — the replica `DataSource` (amendment 10's second
// implementation). It is at the ROOT and not behind a subpath, unlike
// `./online`: that subpath exists because `no-http-in-views.test.ts` enforces
// "no view may speak HTTP", and this module speaks no protocol at all — it
// takes a `Replica`, an `Outbox` and a `SyncEngine` as injected dependencies
// and reads a local store through them.
export {
  OFFLINE_BORN_ABSENCE,
  OFFLINE_BORN_OMISSIONS,
  OfflineAcceptError,
  REPLICA_GAPS,
  ReplicaGapError,
  createReplicaDataSource,
  type LocalIngestResult,
  type ReplicaAbsence,
  type ReplicaDataSource,
  type ReplicaDataSourceDeps,
  type ReplicaOnlyQuery,
  type OfflineListEntry,
  type TicketSummary,
} from './replica/replica-data-source.js';

// Plan 10 Task 13 — the offline/sync UX surfaces. Named exports, not
// `export *`, for the reason the blocks above give: a star would publish each
// module's internals as package surface.
//
// `ContestLike` is exported under its own name and NOT as `ContestedClaim`,
// which this package already declares (`view-types.ts:165`, the `MyWorkView`
// row) and which leaves through the `export *` on line 3. They are different
// shapes for different jobs — the row renders a summary, `ContestLike` carries
// the original envelope every resolution needs — and putting two declarations
// behind one name at the package root is the drift the saved-filters block
// above refuses for `SavedFilter`.
export {
  resolveContest,
  type ContestLike,
  type IngestFn,
  type ResolveContestInput,
} from './contests/contest-view-model.js';
export { ContestBanner } from './contests/contest-banner.js';
export { buildReopenPair, nonTerminalStates } from './offline/reopen-pair.js';
export { ClockSkewBadge, formatClockSkew } from './history/clock-skew-badge.js';
export { SyncStatusBar, syncStatusLabel } from './sync/sync-status-bar.js';
// Account/help-screens plan, Task 6 — the Notifications section of
// `/account` and the abstract half of its gateway. The concrete HTTP
// adapter (`createHttpNotificationPreferencesGateway`) is a `./online`
// export beside its sibling `createHttpNotificationsGateway`, matching how
// `PreferencesGateway` above is named here while nothing implements it at
// the package root either.
export type { NotificationPreferencesGateway } from './account/notification-preferences-gateway.js';
export {
  NotificationsSection,
  type NotificationsSectionProps,
} from './account/notifications-section.js';
// Account/help-screens plan, Task 7 — the Sessions half of `/account`'s
// "Sign-in and devices" section (Passkeys is a later task) and the abstract
// half of its client. The concrete `authClient`-backed adapter
// (`createSessionsClient`) is an `apps/web`-local export, matching how
// `NotificationPreferencesGateway` above is named here while its own HTTP
// implementation lives at the package root's `./online` instead.
export type { SessionsClient, SessionSummary } from './account/sessions-client.js';
export {
  SessionsSection,
  type SessionsSectionProps,
} from './account/sessions-section.js';
export * from './help/index.js';
