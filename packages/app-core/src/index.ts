export type {
  ClientStreamFrame,
  DataSource,
  DataSourceQuery,
  NoteListFilter,
  ServerStreamFrame,
  Unsubscribe,
} from './data-source.js';
export * from './workflow-builder/index.js';
export * from './view-types.js';
export { makeSubmittedFactory, type EnvelopeSeed, type MakeSubmitted } from './submit.js';
export { actorLabel, attributionLabel, formatDate, formatDateTime, formatDay, formatStateProvenance } from './provenance.js';
export { actorLabelFrom, memberLabel, UNKNOWN_PERSON } from './member-label.js';
export { mentionCandidatesOf, type MentionPerson } from './mention-candidates.js';
export { createClientStateCache, type ClientStateCache } from './cache.js';
export { withCacheFeed } from './cache-feed.js';
export {
  SESSION_EXPIRED_COPY,
  SessionExpiredError,
  writeFailureCopy,
  writeFailureRefusalClass,
} from './session-expired.js';
export {
  PARENT_TERMINAL_RULE,
  completeForPrecheck,
  contextFromCache,
  precheckEvent,
  type PrecheckDeps,
  type PrecheckResult,
} from './precheck.js';
export { formatRollup } from './views/rollup-text.js';
export { useLiveQuery, type LiveQueryOptions, type LiveQueryResult } from './views/use-live-query.js';
export {
  LIVE_QUERY_CACHE_MAX,
  LIVE_QUERY_CACHE_TTL_MS,
  clearLiveQueryCache,
  forgetLiveQuery,
  liveQueryAgeMs,
  liveQueryStoreKey,
  recallLiveQuery,
  rememberLiveQuery,
  staleWorkspaces,
} from './views/live-query-cache.js';
export { scheduleReload, subscribeReloads } from './views/reload-scheduler.js';
export { withInflightDedupe } from './inflight-dedupe.js';
export { readEpoch } from './read-epoch.js';
export { useActorNames } from './views/use-actor-names.js';
export {
  Board,
  EMPTY_BOARD_COPY,
  // Re-exported alongside `EMPTY_BOARD_COPY` for the identical reason that
  // constant's own docblock gives: a consumer's test should assert the SAME
  // string this renders, not a re-typed copy of it, and a copy change should
  // fail the assertion rather than pass a stale paraphrase. Added for
  // board-prototype-port Task 8's fix round (Ruling 20(a)) — the first
  // `apps/web` case to need it; `packages/app-core/test/views/board.test.tsx`
  // already imports it directly, being in the same package.
  EMPTY_COLUMN_COPY,
  EMPTY_BOARD_UNWIRED_COPY,
  // The epic-rule twins, re-exported for exactly the same reason (owner ruling,
  // 2026-09-20): the shell's page spec asserts the SAME string the component
  // renders, so that a future copy change fails the assertion rather than
  // passing a stale paraphrase. `13.1043` and `13.1046` are the cases.
  EMPTY_BOARD_EPICS_COPY,
  EMPTY_COLUMN_EPICS_COPY,
  useBoard,
  type BoardProps,
} from './views/board.js';
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
// Second wave Task 5 — the Backlog tab's rank arithmetic. Pure and headless;
// `apps/web`'s `backlog-rank-controls.tsx` is the only caller today.
export {
  moveTarget,
  neighboursFor,
  planRankMove,
  sortByRank,
  type RankBackfill,
  type RankMovePlan,
  type RankRow,
} from './views/backlog-rank.js';
export { MyWork, useMyWork, type MyWorkProps } from './views/my-work.js';
// my-work-global T3: the global My work page's pieces — the pure grouping and chip helpers,
// the fan-out hook, and the Show / Group controls. `MyWorkGroups` is My Work's grouped arm;
// `placeLookup` / `ItemPlace` its flat arm's per-row label (T4).
export type { MyWorkGroups } from './views/my-work.js';
export {
  groupByWorkspaceProject,
  placeLookup,
  showForWorkspace,
  showOptionsFor,
  UNKNOWN_PROJECT_NAME,
  type ItemPlace,
  type WorkspaceGroup,
} from './views/my-work-global.js';
export { useGlobalMyWork, type GlobalMyWork, type GlobalSection } from './views/use-global-my-work.js';
export {
  GroupToggle,
  SHOW_LABELS,
  ShowFilter,
  type GroupToggleProps,
  type MyWorkGrouping,
  type ShowFilterProps,
} from './views/my-work-controls.js';
export {
  PlainTextEditorSlot,
  type EditorSlotComponent,
  type EditorSlotProps,
  type EditorSlotSubmission,
  type EditorSlotUpload,
} from './views/editor-slot.js';
export { HistoryList } from './views/history-list.js';
export { describeEvent, HISTORY_RENDERED_TYPES, type HistoryCopyContext } from './views/history-copy.js';
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
export { TicketNotesSection, type TicketNotesSectionProps } from './views/ticket-notes-section.js';
export { LinkedFromSection, linkedFromHref, type LinkedFromSectionProps } from './views/linked-from-section.js';
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
// MCP-everything T5 — the two comment seeds, shared by the ticket sheet and the web's note comments.
export { commentDeletedSeed, commentEditedSeed, type CommentParent } from './flows/comment-edits.js';
export { ReopenDialog, type ReopenDialogProps, type RefusalOrigin } from './views/reopen-dialog.js';
// Second wave Task 9 — the shared bulk-close confirm. Its two consumers
// (Task 10's board column action, Task 11's list selection) live in this
// package; it is exported for `apps/web` and for the same reason every other
// view here is: the consumer's own test should render the SHIPPED component,
// not a re-typed stand-in for it.
export {
  BulkCloseDialog,
  type BulkCloseDialogProps,
  type BulkCloseTicket,
} from './views/bulk-close-dialog.js';
export {
  NewTicketDialog,
  type NewTicketDialogProps,
  type NewTicketDraft,
} from './views/new-ticket-dialog.js';
export { CreateTicketFlow, type CreateTicketFlowProps } from './views/create-ticket-flow.js';
export { usePendingCreates, type PendingCreate } from './views/board-move-state.js';
export { useOptimisticTicket, type TicketOverlay } from './views/optimistic-ticket.js';
export { OutsiderFinder } from './views/outsider-finder.js';
export type { AssignOutsider, LookedUpPerson, LookupPerson } from './people/types.js';
export { outsiderIngest } from './people/outsider-ingest.js';
export {
  ASSIGNEE_OUTSIDE_ROSTER,
  ASSIGN_OUTSIDER_OPTION,
  OUTSIDER_ASSIGN,
  OUTSIDER_CANCEL,
  OUTSIDER_EMAIL_LABEL,
  OUTSIDER_FIND,
  OUTSIDER_JOINS_AS_GUEST,
  OUTSIDER_NOT_FOUND,
  alreadyInWorkspaceLine,
  foundLine,
  lookupFailedLine,
} from './people/copy.js';
export {
  LOCKOUT_WARNING_COPY,
  OWNER_ALWAYS_SEES_COPY,
  VisibilityEditor,
  type VisibilityClaim,
  type VisibilityEditorProps,
} from './views/visibility-editor.js';
// The explicit-audience checkbox roster (notes series Plan 5, Task 3),
// extracted from `visibility-editor.tsx` so the two callers share ONE label
// rule rather than two copies of it. See the component's own docblock.
export { PeoplePicker } from './views/people-picker.js';
// The comment thread (Notes series Plan 5 Task 7): `apps/web`'s note comments
// mount reuses the TICKET sheet's own component rather than a second copy —
// `TicketComment` names a ticket in its export only by history, not by the
// shape (`commentId`/`authorId`/`body`/`recordedAt`/`files`), which a note's
// own comment fits by mapping `files: []` at the call site (no note ever
// names an attachment through a comment today).
export {
  CommentsThread,
  type CommentActions,
  type CommentsThreadProps,
  type TicketComment,
  type TicketCommentFile,
} from './views/comments-thread.js';
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
  TIMELINE_EMPTY_COPY,
  TIMELINE_OUT_OF_WINDOW_COPY,
  TIMELINE_SIDE_LIST_COPY,
  TIMELINE_SIDE_LIST_NO_DATES_COPY,
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
// The board's own filter vocabulary (Plan: board-prototype-port, Task 3) —
// `BoardFilterSpec` is declared in `filter/board-filter.ts` and has exactly
// one export path, unlike `FilterSpec` above, which already leaves through
// `view-types.ts`'s `export *`.
export { matchesBoardCard, type BoardFilterSpec } from './filter/board-filter.js';
// Exclude-mode spec §2 (2026-09-17): the list-row predicate, beside the board's.
export { matchesListRow, type ListFilterSpec } from './filter/list-filter.js';
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
export type { InboxFilter, NotificationsGateway, NotificationsPage } from './inbox/gateway.js';
export {
  notificationBody,
  notificationHeadline,
  notificationTarget,
  notificationTicketId,
  type NotificationTarget,
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
  BAR_DESTINATIONS,
  BOTTOM_BAR_KEY,
  DEFAULT_BAR,
  MAX_SLOTS,
  readBottomBar,
  rememberBottomBar,
  resetBottomBar,
  type BarDestination,
} from './preferences/bottom-bar.js';
export {
  DEFAULT_PROJECT_GROUPING,
  PROJECT_GROUPING_KEY_PREFIX,
  projectGroupingKey,
  readProjectGrouping,
  rememberProjectGrouping,
  type ProjectGrouping,
} from './preferences/project-grouping.js';
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
export { usePurgedPredicate, type PurgedLookupQuery, type PurgedPredicateState } from './views/use-purged-predicate.js';
export { SyncNotices, SYNC_NOTICE_DISMISS, failedClaimNotice, type SyncNoticeView } from './sync/sync-notices.js';
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
export type { SessionsClient, DeviceSummary } from './account/sessions-client.js';
export { relativeTime } from './account/relative-time.js';
export {
  SessionsSection,
  type SessionsSectionProps,
} from './account/sessions-section.js';
// Account/help-screens plan, Task 8 — the Passkeys half of `/account`'s
// "Sign-in and devices" section (the half Task 7's own note deferred) and the
// abstract half of its client. The concrete `authClient`-backed adapter
// (`createPasskeyClient`) is an `apps/web`-local export, exactly as
// `createSessionsClient` above is, and for the same reason: it speaks
// `@better-auth/passkey`, which this package must not.
export type { PasskeyClient, PasskeySummary } from './account/passkey-client.js';
export {
  PasskeysSection,
  type PasskeysSectionProps,
} from './account/passkeys-section.js';
export * from './help/index.js';

// Trash series Plan 4 — the pure half of the trash UI: every string it shows,
// which events each act sends and in which order, what a batch answer means,
// and the IST day. The dialog and the Deleted items section (Tasks 4 and 9)
// are exported beside these by their own tasks.
export * from './trash/copy.js';
export {
  archiveWorkspaceSeeds,
  deleteSeeds,
  markSeeds,
  restoreSeeds,
  targetOf,
  unmarkSeeds,
  type LifecycleTarget,
} from './trash/seeds.js';
export { classifyBatch, type BatchOutcome } from './trash/batch.js';
export { isPurgeOverdue, istDayLabel } from './trash/dates.js';

export { DeleteDialog, type DeleteDialogProps } from './views/delete-dialog.js';
export { DeletedItemsSection, type DeletedItemsSectionProps } from './account/deleted-items-section.js';
export { DeletedItemsFromCache, cachedDeletedItemsOf } from './deleted-items-from-cache.js';
