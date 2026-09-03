export type { DataSource, DataSourceQuery, StreamItem, Unsubscribe } from './data-source.js';
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
