'use client';

import { Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  BACKLOG_STATE,
  BACKLOG_STATE_ID,
  BUILTIN_TICKET_TYPE_SEEDS,
  isCreatableState,
  type StateCategory,
  type WorkflowDef,
} from '@gisik-nokma/domain';
import {
  Board,
  BulkCloseDialog,
  CalendarView,
  CreateTicketFlow,
  TicketList,
  EPIC_RANK,
  TicketSheet,
  TimelineView,
  isBuiltinEpicType,
  makeSubmittedFactory,
  matchesBoardCard,
  matchesListRow,
  memberLabel,
  sortByRank,
  useBoard,
  useLiveQuery,
  useTicketList,
  type Actor,
  type BoardFilterSpec,
  type BulkCloseTicket,
  type FilterSpec,
  type GroupLabels,
  type ListFilterSpec,
  type ListRow,
  type TicketDatesInput,
  classifyBatch,
  restoreSeeds,
  restoreUnreachableLine,
  ticketDeletedToast,
  ticketDurableUndoLine,
  writeFailureCopy,
  writeFailureRefusalClass,
} from '@gisik-nokma/app-core';
import { TicketEditorSlot, uploadAttachmentHttp } from '@gisik-nokma/editor';
import {
  Avatar,
  Chip,
  RemoveIcon,
  SegmentedControl,
  Switch,
  Toast,
  type SegmentedOption,
} from '@gisik-nokma/ui';
import { AppNav } from '../../../../../src/app-nav.js';
import { startTargetFor } from '../../../../../src/backlog-start.js';
import { BacklogStartButton } from '../../../../../src/backlog-start-button.js';
import { NewTicketDescriptionSlot } from '../../../../../src/new-ticket-description-slot.js';
import { BacklogRankControls, submitRank } from '../../../../../src/backlog-rank-controls.js';
import {
  buildFilterChips,
  describeUnappliedBoardAxes,
  describeUnappliedListAxes,
  shouldRenderNarrowingStrip,
  type BoardFilterChip,
} from '../../../../../src/board-search-scope.js';
import { choiceMode, closedMode, withCycledClosed, withCycledId } from '../../../../../src/filter-cycle.js';
import { listNarrowingWord } from '../../../../../src/list-narrowing-word.js';
import { ChoiceGlyph, TriStateChoice } from '../../../../../src/tri-state-choice.js';
import { istToday } from '../../../../../src/ist-today.js';
import { ShellRefusal } from '../../../../../src/shell-refusal.js';
import {
  customDateFieldsByType,
  rankOneEpicPredicate,
  toTicketDatesInput,
} from '../../../../../src/ticket-dates-input.js';
import { useAppServices, useSessionStatus } from '../../../../../src/providers.js';
import { peopleProps } from '../../../../../src/people-props.js';
import { ticketSheetPath } from '../../../../../src/ticket-location.js';
import { buildProjectPageQueryTickets, ticketRefHrefIn } from '../../../../../src/ticket-ref-callbacks.js';
import { useProjectName } from '../../../../../src/use-project-name.js';
import {
  DEFAULT_PROJECT_TAB,
  readProjectTab,
  rememberProjectTab,
  useLastProject,
  type ProjectTab,
} from '../../../../../src/use-last-project.js';
import { useWorkspaceName } from '../../../../../src/use-workspace-name.js';
import { useWorkspaceProjects } from '../../../../../src/use-workspace-projects.js';
import {
  ExpiredSessionNotice,
  useSignInOnExpiredSession,
} from '../../../../../src/expired-session.js';
import { DocumentTitle } from '../../../../../src/document-title.js';

/**
 * Board | List | Calendar | Timeline.
 *
 * The four-way chain is Plan 6's Step 5b, landed late by Plan 9's Task 14 — the
 * order Step 5b's own precondition names. When Plan 6 ran, `CalendarView` and
 * `TimelineView` did not exist and the step recorded a SKIP here; both are
 * exported now, so this task carries the mount, and `istToday()` from
 * `src/ist-today.ts` is the day source Step 5a landed unconditionally so that
 * this order would work.
 *
 * ## The two new arms refuse; they do not draw an empty month
 *
 * Step 5b's snippet renders the views over `(list.rows ?? []).map(...)`. Whenever
 * the read does not answer — a transport failure, a `MappingError`, or (until
 * ruling P25 clause 1 served its five absent `ListRow` fields) the
 * `ServingGapError` `mapListView` used to throw — `list.rows` is null,
 * `?? []` is `[]`, and `CalendarView` would draw a complete month grid with
 * nothing on it. That grid says "no ticket in this project has a claimed date",
 * the same invented fact the spinner over a refused read produces: the defect
 * this page's own `parentCandidates` note was written about, one tab across. So
 * the calendar and timeline arms use this page's own `error → ShellRefusal,
 * null → Loading…, data → view` shape, and Step 5b's `<p>{board.error ??
 * 'Loading…'}</p>` spellings are NOT adopted for the two existing arms either —
 * those would have deleted `ShellRefusal` from the board and the list on the way
 * past.
 *
 * The Suspense boundary is `useSearchParams()`'s, exactly as on the sign-in
 * page — without it `next build` fails the route rather than warning.
 */
export default function ProjectPage() {
  return (
    <Suspense fallback={<main className="gn-shell" />}>
      <ProjectBoard />
    </Suspense>
  );
}

/**
 * The LOADING fallback for the type picker, and nothing else.
 *
 * Plan 6's Open question 7 settles both halves: `typeOptions` is fed from `GET
 * /v1/workspaces/:workspaceId/ticket-types`, and "the built-in ladder remains
 * only the LOADING FALLBACK, since Plan 4's bootstrap guarantees the four
 * built-ins exist as real `ticket-type.defined` events in every workspace from
 * its first moment". That guarantee is what makes showing the ladder honest for
 * the window before the read lands — every entry in it is a type the workspace
 * really has — and it is exactly why the ladder must NOT survive a FAILED read:
 * a workspace's own types are a superset of these and may be ranked, named and
 * ordered differently (the server's own fixture answers `epic`, `chore`, `task`
 * — see case 7.38), so a ladder shown in place of an answer is a picker
 * asserting four types the workspace was never asked about.
 *
 * Derived from the DOMAIN's seed list rather than retyped, so the day a built-in
 * is added, renamed or dropped this fallback moves with it instead of becoming a
 * fifth opinion about what a new workspace contains.
 */
const BUILTIN_TYPE_LADDER = BUILTIN_TICKET_TYPE_SEEDS.map((seed) => ({
  id: seed.id,
  name: seed.name,
  // The RANK travels with the ladder (E5-16): `NewTicketDialog` chooses which
  // type a root ticket starts on, and a ladder without ranks left it naming
  // `typeOptions[0]` — the top of the hierarchy. Derived from the domain's own
  // seed list, like the two fields above it, so it cannot drift from the
  // hierarchy the engine enforces.
  rank: seed.rank,
  // `''` — "no workflow known" (starting-status design, 2026-09-23):
  // `BUILTIN_TICKET_TYPE_SEEDS` carries no workflow binding of its own, only
  // `builtinTicketTypeDefs(defaultWorkflowId)` does, and this constant is the
  // LOADING fallback shown before the workspace's real types (and their real
  // `workflowId`s) have answered. `workflowStates('')` reads `null` for it,
  // the same "not loaded" state the Starting-status select already shows
  // while this fallback ladder itself is on screen.
  workflowId: '',
}));

export const BUILTIN_LADDER_NOTICE =
  'Showing the four built-in ticket types while this workspace’s own types load.';

/**
 * THE BACKLOG'S THREE EMPTY SENTENCES (owner ruling, 2026-09-20; the third added
 * for E5-40, 2026-09-21), hoisted out of the JSX so the page spec can assert the
 * same strings the tab renders rather than re-typing them — the discipline
 * `EMPTY_BOARD_COPY`'s own docblock gives, and the reason
 * `packages/app-core/src/index.ts` re-exports the board's pair.
 *
 * `BACKLOG_EMPTY_COPY` is the original and is UNCHANGED: it is true of a backlog with
 * nothing in it, and nothing about the epic ruling made it false there.
 * `BACKLOG_EMPTY_EPICS_COPY` is the second and is reached ONLY when every row the
 * tab would have drawn was an epic — see `backlogNarrowing`'s `epicsOnly`.
 *
 * `BACKLOG_EMPTY_ACTIVE_ONLY_COPY` is the third, and it exists because the first
 * was being said in a state it is not true of. "Only tickets in progress" writes
 * `stateCategories: ['active']` into the SERVER read (`listFilter`, above
 * `useTicketList`), and a backlog ticket's category is `open` — so the toggle
 * strips every backlog row before any screen-level fold can see it, `shown` and
 * `total` both read 0, and nothing inside `backlogNarrowing` can tell a backlog
 * emptied BY THE TOGGLE from one that is genuinely empty. The toggle's state is
 * known only at the render site, so the choice is made there — and the sentence
 * chosen is true of BOTH: it says the backlog is hidden, which the toggle does
 * whether or not anything was behind it. `TicketList` may draw a backlog that is
 * empty for a reason, and this is that reason named.
 */
export const BACKLOG_EMPTY_COPY = 'Nothing in the backlog — new tickets land here.';
export const BACKLOG_EMPTY_EPICS_COPY = 'Nothing in the backlog — epics appear in the List.';
export const BACKLOG_EMPTY_ACTIVE_ONLY_COPY =
  'The backlog is hidden while “Only tickets in progress” is on.';

/**
 * The view rail's five choices, in the rail's own order.
 *
 * **`'backlog'` is FIRST** (Task 10, backlog/closed spec §5.4): Backlog precedes
 * the board in a ticket's LIFECYCLE (spec §1.3 — every ticket is born there),
 * even though `view`'s own default stays `'board'`. **The rail's ORDER and the
 * page's DEFAULT SELECTION are independent facts**, and only the first moved.
 *
 * The LABELS are a `Record` over the tab union, not a second list, for this
 * file's standing reason (see `TAB_NOUN` below): a `Record<K, V>` requires every
 * member of `K`, so a sixth tab added to `PROJECT_TABS` without words fails
 * `typecheck` rather than rendering an unlabelled segment. That property was
 * what the hand-written `as const` tuple array this replaced did NOT have.
 */
const PROJECT_VIEW_LABELS: Record<ProjectTab, string> = {
  backlog: 'Backlog',
  board: 'Board',
  list: 'List',
  calendar: 'Calendar',
  timeline: 'Timeline',
};

const PROJECT_VIEW_OPTIONS: ReadonlyArray<SegmentedOption<ProjectTab>> = (
  ['backlog', 'board', 'list', 'calendar', 'timeline'] as const
).map((tab) => ({ value: tab, label: PROJECT_VIEW_LABELS[tab] }));

function ProjectBoard() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string; projectId: string }>();
  const searchParams = useSearchParams();
  const { workspaceId, projectId } = params;
  const { dataSource, cache, ticketLocation, people } = useAppServices();
  /**
   * The `:ticket` picker's data source and the chip's link (Plan 7 Task 4,
   * spec §14, D26–D28) — passed into `TicketSheet`, which forwards both to
   * its `<EditorSlot>` mounts and `resolveTicketHref` to `CommentsThread`'s
   * `ticketHref`. Not memoized, matching `TicketSheet`'s own `queryUsers`: a
   * fresh closure on every render costs nothing here, because
   * `TicketEditor`'s `propsRef` pattern reads the LATEST one rather than the
   * one captured at mount.
   */
  const queryTickets = buildProjectPageQueryTickets(dataSource, workspaceId, projectId);
  const resolveTicketHref = ticketRefHrefIn(workspaceId);
  /**
   * `useSessionStatus`, not `useCurrentUser`, and the difference is a write.
   *
   * `useCurrentUser()` answers `null` BOTH while the session request is in
   * flight and when nobody is signed in, and this page used to collapse that to
   * `user?.id ?? ''`. `CreateTicketFlow` was then rendered ungated, so a click
   * landing in the load window built `makeSubmittedFactory({actorId: '', origin:
   * 'web'})` and posted an event with an empty actor. Nothing corrupts —
   * `checkRolePermission` refuses when `env.actorId !== ctx.sessionUserId`
   * (`apps/server/src/permissions/check-permission.ts:392`) — but the person got
   * a PERMISSION REFUSAL where they should have got a wait state, a sentence
   * about their standing in the workspace when the truth was "this browser has
   * not finished asking who you are". And the same button was offered to a
   * signed-out viewer, for whom it could never work at all.
   *
   * So the create flow is mounted only on `signed-in`, and the other two states
   * say which one they are. The remaining `currentUserId` consumers are named
   * where they are passed.
   */
  const session = useSessionStatus();
  const currentUserId = session.kind === 'signed-in' ? session.user.id : '';
  /**
   * The breadcrumb and the title (Task 2 fix round 1 — coordinator Ruling 6).
   * Both read `GET /v1/me/workspaces`, the SAME call `<AppNav>` below already
   * makes for its own workspace-name link — `useWorkspaceName` is one shared
   * hook, not a second derivation, and `useProjectName` narrows one step
   * further into the same served rows. Both omit (render nothing) while
   * pending or refused; see each hook's own docblock.
   */
  const workspaceName = useWorkspaceName(workspaceId);
  /**
   * E2-38 (round-2 ruling, MINOR) — the project's OWN state, on the project's own
   * page.
   *
   * This page had **zero occurrences of `archived`** (case-insensitive, the whole
   * file, measured) while the screen a person must pass through to reach it
   * carries it prominently — the workspace home matches 58 times, with the
   * archive/restore controls and the *"N archived · show"* toggle. So an archived
   * project's own board was indistinguishable from a live one's, which matters
   * because the two differ in what the product will let you do.
   *
   * **The read is the one the nav and the home already make** —
   * `useWorkspaceProjects`, module-cached, no new request — rather than a second
   * way of asking. `null` (pending or refused) and "not in the list" are both
   * SILENT here: an absence of the chip claims nothing, where a chip painted on a
   * failed read would assert the project is live.
   */
  const workspaceProjects = useWorkspaceProjects(workspaceId);
  const projectArchived = workspaceProjects?.find((p) => p.id === projectId)?.archived === true;
  const projectName = useProjectName(workspaceId, projectId);
  // Task 10 (backlog/closed spec §5.4, 2026-09-17) adds `'backlog'` to this
  // union. The default stays `'board'` — Backlog is the FIRST tab in the
  // rail below (it precedes the board in a ticket's lifecycle), not the
  // first one a person lands on; nothing about the union's own default
  // changes.
  //
  // THE UNION MOVED (owner request, 2026-09-18). `'board' | 'list' | …` used to
  // be written out here as an inline union; it is now `ProjectTab`, declared
  // once in `use-last-project.ts`, because the remembered tab this page reads
  // and writes must be a value that hook will accept. Two copies of the list
  // would be free to drift, and the failure would be silent: a tab this page
  // can select and the hook rejects reads as "this project has no remembered
  // tab" rather than as an error. `DEFAULT_PROJECT_TAB` is that same `'board'`,
  // named once so the page and the nav cannot come to different conclusions.
  //
  // The `TAB_NOUN` record below is still `Record<typeof view, string>`, so a
  // sixth member added to `PROJECT_TABS` and forgotten there still fails
  // `typecheck` exactly as it did when the union was inline. That property is
  // the reason the inline-ness was recorded in the first place; it was never
  // the inline-ness itself.
  const [view, setViewState] = useState<ProjectTab>(DEFAULT_PROJECT_TAB);

  /**
   * THE REMEMBERED TAB (owner, 2026-09-18: *"on click, open the project page
   * (save the last open tab as well)"*).
   *
   * GLOBAL, which the owner said directly: it applies whenever a project opens,
   * not only when you arrive through the nav item. A project reached from a
   * card, a bookmark or a pasted link lands you where you left off.
   *
   * **Seeded by an EFFECT, not by `useState`'s initialiser**, and the difference
   * is not stylistic. A client component is still rendered on the server, where
   * `window` does not exist; an initialiser reading storage would answer
   * `'board'` there and something else on the client, and React would meet a
   * hydration mismatch on `aria-selected`. `theme-toggle.tsx` reads `gn-theme`
   * in an effect for exactly this reason, and this follows that convention
   * rather than inventing a second one. The cost is one frame on the default
   * tab before the remembered one arrives, which is stated rather than hidden.
   *
   * `userId` is `null` when signed out, never `''`: the tab map is keyed by
   * user, and an empty string is a key like any other — it would let a
   * signed-out viewer's click be read back by the next signed-out viewer.
   *
   * `currentUserId` above is NOT reused, and the difference is exactly that
   * empty string: it exists for the ticket reads, which want `''`, and this
   * wants `null`.
   */
  const tabUserId = session.kind === 'signed-in' ? session.user.id : null;
  /**
   * A tab the person chose on THIS page outranks the memory, so the seed is
   * applied at most once per project and never after a click — case 13.880,
   * which a reviewer found and which the first version of this effect carried.
   *
   * The rail is not gated on the session. This page's main return is
   * unconditional and nothing between it and the tablist asks what
   * `session.kind` is, so the tabs are clickable during the one network round
   * trip the session read takes. In that window `tabUserId` is `null`, so the
   * click's own write goes nowhere — and because `tabUserId` is this effect's
   * dependency, the session landing then RE-RAN it and put the stored tab back
   * over the choice just made.
   *
   * Two refs rather than one, because they answer different questions:
   * `seededForProject` is how a new project gets a fresh chance to be seeded,
   * and `tabChosenHere` is what a click sets. Resetting the second when the
   * FIRST changes is the whole of it — a person clicking in the loading window
   * is not clicking "for" the project they navigated to next.
   *
   * **What this does NOT fix, stated rather than implied:** that click is still
   * not written to the tab map, because there is no user id to key it by yet.
   * The choice stands for as long as the page does and is forgotten on the next
   * visit. Keying a write to a user the session has not named would be
   * inventing one, and the window is a single round trip; recorded in the
   * catalogue as a known limitation rather than papered over.
   */
  const seededForProject = useRef<string | null>(null);
  const tabChosenHere = useRef(false);
  useEffect(() => {
    if (seededForProject.current !== projectId) {
      seededForProject.current = projectId;
      tabChosenHere.current = false;
    }
    if (tabChosenHere.current) return;
    const rememberedTab = readProjectTab(projectId, tabUserId);
    if (rememberedTab !== null) setViewState(rememberedTab);
  }, [projectId, tabUserId]);

  /**
   * Opening a project is what makes it the last one opened — the counterpart of
   * 13.427 one level up ("opening a workspace is what remembers it"), and the
   * write the nav's own remembered-project READ depends on. Without it the nav
   * would only ever update when you arrived through the nav item, which is the
   * one route that does not need it.
   */
  useLastProject(workspaceId, projectId, tabUserId);

  /**
   * `setView` now WRITES as well as sets. Every control that changes the tab
   * goes through it, so there is one place the memory is written and no arm can
   * forget — the rail's five buttons, and anything later that selects a tab.
   */
  const setView = useCallback(
    (tab: ProjectTab): void => {
      // Read by the seed effect above, which must not undo this.
      tabChosenHere.current = true;
      setViewState(tab);
      rememberProjectTab(projectId, tab, tabUserId);
    },
    [projectId, tabUserId],
  );
  /**
   * The list's narrowing, and the reason there is one at all.
   *
   * `getTickets` walks up to `LIST_PAGE_CAP` pages and REFUSES past it, because a
   * `TicketListView` is defined as the complete row set and serving the pages it
   * already had would present a truncated list as the whole project (12.258).
   * That refusal is right and stays. What was missing is any way for the person
   * who meets it to ask a smaller question — `ticket-list.tsx` sent `{}` and
   * nothing could change it, so a project past the bound refused for ever.
   *
   * **One axis, chosen for whether it RELIEVES the bound** rather than for whether
   * it is useful: a text search narrows nothing reliably — it can match anything —
   * so it would not shorten the walk. More axes are a scope call, not a free
   * addition.
   *
   * **And the axis is `'active'` alone because the WIRE cannot say anything wider.**
   * The first version of this asked for `['open', 'active']` — *"hide done"*, which
   * is the narrowing a person would actually reach for. `toServerFilterSpec`
   * (`mappers.ts:855-870`, re-pointed 2026-09-17 — the exclude-mode refusal
   * above it shifted this block) throws `UnexpressibleFilterError` on it: the SIX
   * id-shaped axes are LISTS client-side — `assigneeIds`, `collaboratorIds`,
   * `typeIds`, `stateIds`, `stateCategories`, `projectIds` — while
   * `filterSpecSchema` takes exactly ONE value for each (`text`, `dueBefore`,
   * `dueAfter` are scalars and `fields` is a record, so they are not part of this).
   * So `stateCategory` can name `open` OR `active` OR `terminal` and never "not
   * terminal". Found by 12.383 failing, not by reading the type — the plural axes
   * look as though they compose.
   *
   * That guard is right and is the reason this is a label change rather than a bug:
   * an unexpressible filter REFUSES loudly instead of being silently dropped and
   * answering the wrong question. The consequence is only that this control says
   * what it can actually do. **Recorded for whoever designs the fuller filter
   * surface: "not done" needs either a plural `stateCategory` on the route or a
   * negation term, and today it has neither.**
   *
   * Local state, not preferences: writing this through `usePreferences` is a
   * whole-document PUT gated on `canSetPrefs`, and the user who most needs the
   * control may be unable to persist anything. Persisting is its own change.
   */
  const [activeOnly, setActiveOnly] = useState(false);
  const listFilter = useMemo(
    () => (activeOnly ? { stateCategories: ['active'] as StateCategory[] } : {}),
    [activeOnly],
  );

  const board = useBoard(dataSource, workspaceId, projectId);
  const list = useTicketList(dataSource, workspaceId, projectId, currentUserId, listFilter);

  /**
   * THE BACKLOG'S OPTIMISTIC RANK OVERRIDES (second wave Task 5).
   *
   * A rank move is a round trip, and the row must move under the pointer
   * rather than a second later — so a move writes the key it just computed
   * here, `sortByRank` below reads this map over the server's rows, and the
   * map is what makes the reorder visible before the answer lands.
   *
   * CLEARED WHENEVER THE SERVER'S ANSWER CHANGES, which is the plan's "cleared
   * on `list.reload()`" made precise. Keying the clear on the reload CALL
   * would be wrong in a way that shows: it would drop the override at the
   * moment the request goes out, so the row would snap back to its old
   * position and then jump forward again when the answer arrived — two moves
   * for one gesture. Keyed on the answer's identity instead, the row holds its
   * optimistic position until the server's own key arrives to take over. It
   * also means EVERY reload clears, not only the ones this task calls.
   *
   * `Map.delete` on `null` is why an override can never be a `null` value: a
   * `null` entry would mean "unranked", which would shadow a row's real key
   * rather than clearing the optimistic one.
   */
  const [rankOverrides, setRankOverrides] = useState<ReadonlyMap<string, string>>(() => new Map());
  /**
   * The drag's notice, carrying its CHANNEL with it.
   *
   * Ruling 27 splits a real refusal from a transport failure or silence, and
   * `ui.css` states the rule in as many words: "a dropped connection or an
   * empty ingest response is not a verdict, so it never wears `--server`". A
   * bare string here painted all three with `gn-refusal--server`, which made
   * the drag the one path on this page that called a dropped connection a
   * verdict. The two per-row buttons get this right by keeping two separate
   * pieces of state; the page has one notice slot, so the channel travels
   * with the text instead.
   */
  const [rankNotice, setRankNotice] = useState<{ channel: 'server' | 'transport'; text: string } | null>(null);
  /**
   * The `Subtask of {parent}` chip's failure arm — see `openParentTicket` below
   * for the two things that can go wrong and why each is said rather than
   * swallowed. Same two-channel shape as `rankNotice` above, for the same
   * reason: a server that would not place the ticket and a request that never
   * arrived are different events with different remedies, and one class for
   * both would print a transport failure as the server's judgement.
   */
  const [parentOpenNotice, setParentOpenNotice] = useState<{
    channel: 'server' | 'transport';
    text: string;
  } | null>(null);
  /**
   * The ticket sheet's soft delete, narrated — and the ONE way back.
   *
   * ## Why this lives on the PAGE and not in the sheet
   *
   * `TicketSheet` calls `onDeleted` and closes itself, so by the time there is
   * anything to say the sheet is unmounted. **An undo offered inside a component
   * that has just been removed is not an undo.** The inbox's bulk action made
   * the same move for the same reason (*"the toast is `position: fixed`, so its
   * place in the tree is …"*), and this is stronger: not a component whose arms
   * change underneath, but one that is GONE.
   *
   * ## `undoFor` is the whole state machine, and `null` is the fail-closed arm
   *
   * A notice with `undoFor: null` INFORMS — it is a delete that went through or
   * a restore that did not, and neither offers a second click. **The Undo is
   * rendered from `undoFor` and from nothing else**, so a toast with nothing to
   * take back cannot be drawn by mistake — the same rule the inbox's `undoable`
   * states for its own bulk action.
   *
   * `permanent` (trash Plan 4, D11): the Undo this notice offers must unmark
   * before it restores.
   */
  const [deleteNotice, setDeleteNotice] = useState<{
    message: string;
    undoFor: string | null;
    permanent: boolean;
  } | null>(null);
  /**
   * RULING E2-30 (2026-09-21) — THE DURABLE HALF OF THE WAY BACK FROM A DELETE.
   *
   * ## What was wrong
   *
   * Every view excludes a soft-deleted ticket (`LIVE_TICKET_WHERE`, the single
   * `deleted_at IS NULL` predicate in `apps/server/src/read/visible-where.ts`),
   * and the inverse event has exactly ONE producer in the client: the Undo
   * button inside `deleteNotice`'s toast. That toast caps itself at
   * `TOAST_DEFAULT_DURATION_MS` (15 s, an OWNER RULING — so this does not touch
   * it), which left a person who deleted by mistake at twenty seconds with **no
   * recourse inside the product at all**, while the server was perfectly able to
   * put the ticket back. `check-permission.ts` gates `ticket.deleted` on
   * project-admin rights: the gate protected the DOING and not the UNDOING,
   * which is backwards.
   *
   * ## What this is, and what it deliberately is not
   *
   * One slot — the last ticket deleted from this page — rendered as an inline
   * strip that does not expire, beside the toast rather than instead of it. The
   * toast stays exactly as it was, because a transient message at the foot of
   * the screen IS the right shape for a quick reversal; this is the route for
   * the person who looked away.
   *
   * **One slot, not a list, and that is the prototype's own shape**: the notice
   * state above is one-slot for the same reason ("a second delete inside the
   * first toast's window is a NEW toast"). A LIST would be a deletion history,
   * which is the surface E2-30 measures as absent everywhere; claiming this is
   * one would repeat the defect the sentence at `onDeleted` is being fixed for.
   * A second delete therefore REPLACES this, and the replace is stated on the
   * strip's own sentence so a person is never told a ticket is reachable when it
   * has been superseded.
   *
   * **Client-only, which is the finding's own claim** — "neither needs anything
   * the server does not already do": `restoreDeletedTicket` already submits the
   * gated `ticket.restored` event and already reloads both reads. The other arm
   * the finding offers, a "Deleted" section on the List, would need the server
   * to serve rows every read path currently excludes by that one predicate, and
   * that is a visibility door rather than a client affordance.
   */
  const [durableUndo, setDurableUndo] = useState<{ ticketId: string; title: string; permanent: boolean } | null>(null);
  const applyRankOverride = useCallback((ticketId: string, rank: string | null) => {
    setRankOverrides((current) => {
      const next = new Map(current);
      if (rank === null) next.delete(ticketId);
      else next.set(ticketId, rank);
      return next;
    });
  }, []);
  useEffect(() => {
    setRankOverrides((current) => (current.size === 0 ? current : new Map()));
  }, [list.rows]);

  /**
   * THE CLIENT NARROWING (board-prototype-port Task 4): one `FilterSpec`-shaped
   * state above the tabs, so a tab switch never resets what a person typed.
   *
   * Typed `FilterSpec`, not `BoardFilterSpec` — a deliberate widening of the
   * brief's own wording ("BoardFilterSpec-shaped state"). If this state were
   * literally `BoardFilterSpec`, the four axes it omits
   * (`collaboratorIds`/`dueBefore`/`dueAfter`/`fields`) would be
   * UNREPRESENTABLE here, and `boardUnappliedAxes` below — the scope note Step
   * 4 requires — would be dead code with nothing it could ever report. Task 5's
   * Filters sheet sets those four axes on this SAME state; only the BOARD path
   * (`boardFilter` below) narrows down to `BoardFilterSpec` before it reaches
   * `matchesBoardCard`, exactly as the brief's closing sentence says: "only the
   * board path narrows to `BoardFilterSpec`."
   *
   * Only `text` has a control in this task (the search box). The other five
   * `BoardFilterSpec` axes and the four board-blind ones are set by Task 5's
   * Filters sheet and Task 8's workflow picker onto this identical piece of
   * state — not a second filter object, per the disclosure invariant note
   * below.
   */
  const [filter, setFilter] = useState<FilterSpec>({});

  /**
   * THE FILTERS SHEET (Task 5) — open/closed state, and the trigger's own
   * ref so a keyboard-operable close (Escape, or the sheet's own "Done") can
   * return focus to the exact control that opened it rather than to
   * `document.body`. `closeFilters(returnFocus)` is the ONE close path both
   * exits share — mirroring `account-menu.tsx`'s `close(returnFocus)`, whose
   * own docblock is the worked example this task's brief names: a pointer
   * click outside the sheet does not yank focus from wherever the pointer
   * landed, but a keyboard exit always leaves focus somewhere real.
   */
  const [filtersOpen, setFiltersOpen] = useState(false);
  /**
   * V1 (round-2 ruling, 2026-09-21) — the New-ticket flow's dialog, lifted so the
   * BOARD'S empty state can open it.
   *
   * `Board`'s empty banner renders *"No tickets here yet — create one."* and a
   * "Create a ticket" button that only appears when `onCreateTicket` is passed —
   * and nothing in this app passed it, so the sentence instructed an action the
   * page made impossible from where it was read. The control existed all along,
   * three centimetres to the left in this header; what was missing was a way to
   * open it from the banner, which is what `CreateTicketFlow`'s new
   * `open`/`onOpenChange` props provide.
   */
  const [createOpen, setCreateOpen] = useState(false);
  /**
   * A board column's own identity, when the New-ticket dialog was opened
   * FROM one (starting-status design, 2026-09-23) — `Board`'s
   * `onCreateTicket` selection, threaded to `CreateTicketFlow`'s
   * `initialSelection`. `null` for every other open (the header's own "New
   * ticket" button, or the empty-board banner), which carry no selection at
   * all. Cleared on CLOSE (`onOpenChange`, below) rather than left to leak
   * into the next open — a header-opened dialog right after a column-opened
   * one must not inherit the column's status.
   */
  const [createSelection, setCreateSelection] = useState<{
    workflowId: string;
    stateId: string;
  } | null>(null);
  const filtersButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeFilters = useCallback((returnFocus: boolean) => {
    setFiltersOpen(false);
    if (returnFocus) filtersButtonRef.current?.focus();
  }, []);

  /**
   * RULING 44 — how "hidden by default" and its own removable chip coexist
   * on Calendar/Timeline. The spec's own mapping (`closed: undefined | true |
   * false`, Calendar/Timeline passing `closed: false` when unset) has no
   * fourth state: with `filter.closed` doing double duty as both "the
   * person's explicit choice" and "the default is in force", picking All on
   * those two tabs could never distinguish itself from having never touched
   * the control at all, so the mandated `Closed: hidden` chip could never be
   * removed. This page-level flag is the fourth state the spec's mapping
   * lacks: `false` (its own default) means the two date tabs still hide
   * closed tickets nobody asked to see; `true` means the person removed that
   * default's own chip, and the date tabs now show every state `filter.closed`
   * itself allows. An EXPLICIT `filter.closed` (either value) overrides this
   * flag in both directions — see `datesNarrowing`'s own `effectiveClosed`
   * below — so this only ever matters while `filter.closed` is unset.
   */
  const [showClosedOnDates, setShowClosedOnDates] = useState(false);

  /**
   * THE ONE ENUMERATION of the six axes a board can answer — `Pick`'s own
   * field list, restated here exactly once. `boardNarrowing` below and
   * `activeFilterChips` further down BOTH read this SAME value; before the
   * review that asked for this, they were two independently hand-written
   * lists of "which axes exist" that had already drifted (the chip builder
   * only ever checked `text`) — see `board-search-scope.ts`'s own docblock on
   * `buildFilterChips` for the full account. A future axis added to
   * `BoardFilterSpec` now has exactly one object literal to update, not two.
   */
  const boardFilter: BoardFilterSpec = useMemo(
    () => ({
      text: filter.text,
      assigneeIds: filter.assigneeIds,
      typeIds: filter.typeIds,
      stateIds: filter.stateIds,
      stateCategories: filter.stateCategories,
      projectIds: filter.projectIds,
      // The exclude half, the same five — `collaboratorIds` deliberately dropped
      // (`BoardFilterSpec.exclude` cannot carry it; `describeUnappliedBoardAxes`
      // discloses it). Exclude-mode spec §1/§3.
      exclude:
        filter.exclude === undefined
          ? undefined
          : {
              assigneeIds: filter.exclude.assigneeIds,
              typeIds: filter.exclude.typeIds,
              stateIds: filter.exclude.stateIds,
              stateCategories: filter.exclude.stateCategories,
              projectIds: filter.exclude.projectIds,
            },
    }),
    [
      filter.text,
      filter.assigneeIds,
      filter.typeIds,
      filter.stateIds,
      filter.stateCategories,
      filter.projectIds,
      filter.exclude,
    ],
  );

  /**
   * THE WORKFLOW PICKER'S OWN STATE (Task 8, Ruling R3) — page-level, like
   * `filter` above, so a tab switch never resets it. Deliberately NOT folded
   * into `filter`/`boardFilter`: those narrow at CARD granularity, and
   * `matchesBoardCard` (`board-filter.ts`) takes a `card`/`column`/
   * `projectId` and a `BoardFilterSpec` — no group anywhere in that
   * signature — so a workflow axis is structurally unrepresentable there.
   * This picker narrows at GROUP granularity instead: a different
   * mechanism, reusing `boardNarrowing`'s shared `shown`/`total` fold below
   * rather than the six-axis vocabulary that fold also reads.
   *
   * `'all'` is the sentinel for "every workflow", not `undefined` — a
   * `<select>`'s `value` must always equal one of its own rendered
   * `<option>` values, and `'all'` is the first and default one (R3: the
   * resting state keeps every card shown exactly once, same as before this
   * picker existed).
   */
  const [workflowFilter, setWorkflowFilter] = useState<string>('all');

  /**
   * THE RESOLVED PICKER VALUE (Ruling 20(b), coordinator, 2026-09-16) — falls
   * back to `'all'` whenever `workflowFilter` names a workflow `board.data`
   * no longer carries. This can only happen MID-SESSION: the picker's own
   * `<option>`s are built from `board.data.groups` at the moment of
   * selection (below), so every value `workflowFilter` can ever be WRITTEN
   * to is valid when written. It stops being valid when the board's own
   * data changes under it — a workflow reassigned or detached elsewhere
   * while this page stays open — and `workflowFilter` itself has no way to
   * notice on its own; it is a plain string, and a plain string cannot tell
   * a real id from one that used to be real.
   *
   * NOT a reconciliation and NOT an error state — a pure fallback,
   * recomputed fresh on every render from `workflowFilter` and the CURRENT
   * `board.data`, never written back into `workflowFilter` itself (no
   * effect, no `setWorkflowFilter` call here — this is a plain `const`, not
   * a second piece of state to keep in sync with the first). Every
   * consumer that narrows or displays by workflow reads THIS value from
   * here down, never `workflowFilter` directly, except the `<select>`'s own
   * `onChange`, which only ever writes a value drawn from the CURRENT
   * `board.data.groups` and is therefore always valid at the moment it
   * writes.
   *
   * Falling back beats the alternative it replaces: without this,
   * `boardNarrowing` below already drops every card for a workflow id that
   * matches no group (`keepGroup` is simply always false) — but
   * `workflowChip` would still resolve its label as
   * `group?.workflowName ?? workflowFilter`, and with no group to find that
   * prints the RAW INTERNAL ID (`wf-bug`, not a name) as if it were a real,
   * removable narrowing the person chose. That is worse than merely losing
   * the selection: it asserts a workflow that is GONE as though it were
   * still real and still picked, on a project that may hold tickets — the
   * `boardNarrowing` fold's own `total` — the person can no longer see any
   * trace of. Exactly the "page asserts a phantom as real" failure this
   * whole port exists to refuse. `'all'` costs nothing to fall back to — it
   * is the picker's own resting state, R3's own default — and it asserts
   * nothing that isn't true.
   */
  const resolvedWorkflowFilter =
    workflowFilter === 'all' || board.data === null
      ? workflowFilter
      : board.data.groups.some((group) => group.workflowId === workflowFilter)
        ? workflowFilter
        : 'all';

  /**
   * THE SCOPE NOTE (Step 4): axes an active filter carries that `BoardCard`
   * cannot answer at all. This is SEPARATE from `activeFilterChips` (declared
   * further down, once the label resolvers it needs exist) and from the
   * count: the count reports cards the board filtered, this reports axes the
   * board never evaluated, and merging the two would put a number on a
   * filter that never ran (spec's own words). Always computed from `filter`
   * directly — never from `boardFilter` above, which by construction cannot
   * carry these three axes at all.
   *
   * The logic itself lives in `src/board-search-scope.ts` as a pure function,
   * not inline here — Task 4's fix round 1 (coordinator concern 4) extracted
   * it specifically so it has a UNIT test that calls it directly, rather than
   * shipping with zero executions until Task 5's Filters sheet became its
   * first real caller.
   */
  const boardUnappliedAxes = useMemo(
    () => describeUnappliedBoardAxes(filter),
    [filter.collaboratorIds, filter.dueBefore, filter.dueAfter, filter.fields, filter.exclude],
  );

  /**
   * THE LIST'S OWN ENUMERATION of `ListFilterSpec` axes from `filter`
   * (exclude-mode spec §3) — beside `boardFilter`'s, the same "one object
   * literal per view to update" discipline. `collaboratorIds` dropped from
   * both halves (`ListFilterSpec` cannot carry it; `listUnappliedAxes` below
   * discloses it); the due bounds and `fields` INCLUDED, because a list row
   * can answer them even though no control sets them yet.
   */
  const listFilterSpec: ListFilterSpec = useMemo(
    () => ({
      text: filter.text,
      assigneeIds: filter.assigneeIds,
      typeIds: filter.typeIds,
      stateIds: filter.stateIds,
      stateCategories: filter.stateCategories,
      projectIds: filter.projectIds,
      dueBefore: filter.dueBefore,
      dueAfter: filter.dueAfter,
      fields: filter.fields,
      // Task 11 (spec §5.5): the List tab honours the Closed control's
      // EXPLICIT choice only — `filter.closed` itself, never defaulted to
      // `false` the way Calendar/Timeline's own `datesNarrowing` does below.
      // An unset control shows every ticket on the List tab, open or closed.
      closed: filter.closed,
      exclude:
        filter.exclude === undefined
          ? undefined
          : {
              assigneeIds: filter.exclude.assigneeIds,
              typeIds: filter.exclude.typeIds,
              stateIds: filter.exclude.stateIds,
              stateCategories: filter.exclude.stateCategories,
              projectIds: filter.exclude.projectIds,
            },
    }),
    [filter],
  );

  /**
   * THE LIST NARROWING (exclude-mode spec §3): `list.rows` through
   * `matchesListRow` ONCE, and List, Calendar and Timeline all read
   * `listNarrowing.rows`. `null` while the list has not answered — the three
   * arms below already gate on `list.rows !== null`, and this mirrors it.
   * `parentCandidates` and `labels.epicTitle` keep reading `list.rows`
   * UNnarrowed on purpose: a parent picker that hid tickets because of a view
   * filter would be the "page asserts they do not exist" failure this shell
   * refuses, and an epic the filter dropped must still name itself above its
   * surviving children.
   */
  const listNarrowing = useMemo(() => {
    if (list.rows === null) return null;
    const rows = list.rows.filter((row) => matchesListRow(row, projectId, listFilterSpec));
    return { rows, shown: rows.length, total: list.rows.length };
  }, [list.rows, listFilterSpec, projectId]);

  /**
   * THE DATES NARROWING (Task 11, Ruling 44) — Calendar and Timeline's own
   * further cut of `listNarrowing.rows`, layering the "closed hidden by
   * default" rule the List tab never applies. `listFilterSpec.closed` above
   * already carries the Closed control's EXPLICIT choice into `listNarrowing`
   * for every tab alike, so when the person has set the control this memo's
   * own re-filter is a no-op — `effectiveClosed` below reduces to
   * `filter.closed` exactly, matching what `listNarrowing.rows` already is.
   * Only while `filter.closed` is UNSET does it diverge: `showClosedOnDates`
   * (off by default) decides whether these two tabs additionally hide closed
   * tickets nobody asked to see. This is Ruling 44's own formula.
   *
   * `total` is `list.rows.length` — the SAME value `listNarrowing.total`
   * already reads, from the unnarrowed source rather than a prior stage
   * (`listNarrowing`'s own docblock explains why) — so `shown !== total`
   * answers "did Calendar/Timeline hide anything, for any reason", the same
   * disclosure invariant `listNarrowing`/`backlogNarrowing` already keep.
   */
  const datesNarrowing = useMemo(() => {
    if (list.rows === null || listNarrowing === null) return null;
    const effectiveClosed = filter.closed ?? (showClosedOnDates ? undefined : false);
    const rows = listNarrowing.rows.filter((row) =>
      matchesListRow(row, projectId, { ...listFilterSpec, closed: effectiveClosed }),
    );
    return { rows, shown: rows.length, total: list.rows.length };
  }, [list.rows, listNarrowing, listFilterSpec, filter.closed, showClosedOnDates, projectId]);

  const listUnappliedAxes = useMemo(() => describeUnappliedListAxes(filter), [filter.collaboratorIds, filter.exclude]);

  /**
   * THE LIST'S ROW SELECTION, AND THE ONE BULK-CLOSE OPENING IT CAN HAVE
   * (second wave Task 11, spec §8.3's List bullet).
   *
   * ## The state is deliberately SEPARATE, in three pieces, and that is the fix
   *
   * `selectedIds` is the person's live selection. `pendingClose` is the
   * SNAPSHOT of the tickets one opening of `BulkCloseDialog` is about, and it
   * is `null` exactly when no dialog is up. `bulkArmed` is whether the mode is
   * on at all — the third piece arrived with the owner's request of
   * 2026-09-22, and it is SEPARATE from the selection rather than derived from
   * it for the same reason the first two are separate: an empty armed selection
   * and an unarmed one are different states that would otherwise share one
   * representation, and the armed one is what draws the column.
   *
   * ## The mode (owner request, 2026-09-22)
   *
   * *"The select checkbox should not always appear. it should appear once bulk
   * close button is clicked … with a small red x on the right to cancel."* The
   * checkbox column is therefore a consequence of the mode and not a permanent
   * feature of the List: `selection` is spread into `TicketList` only while
   * `bulkArmed`, so the column's presence and its absence are the same switch
   * and cannot disagree. **An armed List is the only one that passes
   * `selection` at all**, and a SIGNED-OUT viewer never does: `bulkArmed` is
   * gated behind `session.kind === 'signed-in'` in the same spread, so the
   * arming button does not exist for them and the mode is unreachable
   * (13.649, whose evidence is now the BUTTON rather than the column).
   *
   * **The arming click clears the selection before it arms.** Without that, a
   * second arming would show the previous run's ticks; with it, 13.1332's
   * `Confirm close (0)` after a Cancel is a fact about the set rather than
   * about the column having been hidden, and those two are the same pixels.
   *
   * **The plan's text is INSUFFICIENT here rather than wrong, and an independent
   * review corrected an earlier draft of this very paragraph for overstating
   * it.** The plan names `selectedIds` "cleared on `list.reload`", `onClosed` →
   * `list.reload()`, and clicking opening the dialog "with the selected rows" —
   * and it names **neither a snapshot nor an `open` expression at all**. So it
   * does not *produce* the unmount; it fails to forbid it. Under the reading
   * that makes `open` follow the selection (which "clicking opens … with the
   * selected rows" plus a selection cleared on reload invites), the clear
   * unmounts the dialog in the same tick its `Could not close` rows are
   * written, and the person never reads the reason their ticket was refused.
   * Under the plan's other literal reading — live `tickets`, a separate open
   * flag — the refusal list would still render, because `failures` is the
   * dialog's own state, but the report would be about a selection that has
   * since been emptied (`Close 0 tickets` over an opening that was two). §8.3's
   * Board bullet is one sentence carrying both halves — *"Per-ticket refusals …
   * stay listed; the rest close and the board reloads"* — and the List bullet
   * says "same dialog, same batch"; **both readings fall short of it, and the
   * snapshot is what makes the report coherent while the own flag is what makes
   * it survive.** Task 10's arm carries the same correction, with 13.792 as its
   * witness; this is that correction applied to its second consumer, and 13.794
   * is the witness here.
   *
   * So: **the tickets are snapshotted at CLICK time** (the reload cannot change
   * what an open report is a report about — the dialog's own docblock states
   * this precondition) and **the dialog keeps its OWN open flag** (clearing the
   * selection cannot unmount it). `onClosed` reloads UNCONDITIONALLY — "the
   * rest close and the list reloads" holds on both outcomes — and the snapshot
   * is released only on a COMPLETE close, which is the one outcome with nothing
   * left to read.
   *
   * ## Why the selection is cleared by the RELOAD, and only by this one
   *
   * A selection is a claim about a list, and it stops being true when the list
   * is re-asked. The clear lives in `reloadListClearingSelection` — the wrapper
   * the bulk close's own `onClosed` calls, its only caller today — and not on
   * `list.rows`' identity, for the reason `rankOverrides` above gives in the
   * other direction: a background stream refetch also changes what `list.rows`
   * holds, and clearing there would wipe a selection out from under someone who
   * never asked for a read.
   *
   * **Its ONE caller is deliberate and worth stating, because the Backlog tab's
   * three other reload sites do not go through it.** `list.reload` is called
   * directly by `BacklogStartButton`'s `onStarted`, by the rank controls'
   * `onRanked`, and by `submitRank`'s own partial-application reload — all of
   * them BACKLOG writes, none of which changes what the List tab is showing or
   * has anything to say about a selection made there. Routing them through this
   * wrapper would clear a List selection because somebody started a backlog
   * ticket on another tab. Keyed on the CALL, a re-ask this client makes for
   * the reason the selection exists is what resets the claim.
   *
   * **The mode ends with that same reload, and this is the one asymmetry the
   * request gave a second visible half.** A close that COMPLETED has nothing
   * left to select for, so `reloadListClearingSelection` disarms as well as
   * clears — the checkboxes leave with the selection. Cancelling the ✕ is the
   * person's own undo and disarms directly.
   *
   * The wrapper is not used by the dialog's `onClose`: dismissing an opening
   * changes nothing about the list, and a Cancel that also threw the selection
   * away would be the surface tidying up after the person. **It does not disarm
   * either, and that is the same argument one step further**: the ✕ and the
   * dialog's Cancel are different acts — one leaves the mode, the other leaves
   * the report — and 13.1333 holds both halves in one case precisely so that a
   * page which disarmed on either would be red on the other.
   *
   * ## What the control is enabled on
   *
   * §8.3: *"enabled only when every selected row is terminal and not closed —
   * the cross-column case."* Both terms are read off the rows this list is
   * SHOWING, not off a stored copy of them, so a row a peer moved or closed
   * mid-selection disables the control on the next render rather than being
   * closed on the strength of a stale reading.
   *
   * **`listSelectedRows` is that filter, and it is the count the label prints
   * and the list the snapshot is built from — so N is always the number of
   * ticked checkboxes on screen, and the batch can never contain an id with no
   * row.** The label therefore counts the selection AS SHOWN: an id whose row
   * has left the visible set (a narrowing, or a peer's close under
   * `filter.closed === false`) contributes nothing, and the box re-ticks if the
   * row returns because `selectedIds` still holds it. Inflating is impossible;
   * deflating-with-the-box-hidden is the behaviour, and it is deliberate — the
   * alternative is a label that names a ticket the person cannot see. An
   * earlier draft of this paragraph said the label "keeps the FULL selection
   * count", which is stronger than the code holds and was corrected in the
   * review round.
   */
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());
  const [bulkArmed, setBulkArmed] = useState(false);
  const [pendingClose, setPendingClose] = useState<BulkCloseTicket[] | null>(null);
  const listSelectedRows = (listNarrowing?.rows ?? []).filter((row) => selectedIds.has(row.ticketId));
  const canBulkClose =
    listSelectedRows.length > 0 &&
    listSelectedRows.every((row) => row.stateCategory === 'terminal' && row.closed === null);

  /** The page's own reload of the list, with the selection's claim on it retired — see the docblock above. */
  const reloadListClearingSelection = useCallback(() => {
    setSelectedIds(new Set());
    // …and the MODE with it (owner request, 2026-09-22): a close that completed
    // ends the arming, so the checkbox column leaves with the selection it was
    // there to make. Cancelling the DIALOG does not come through here and so
    // does not disarm — see the docblock above for why those two are different
    // acts, and 13.1333 for both halves in one case.
    setBulkArmed(false);
    list.reload();
  }, [list.reload]);

  /**
   * The soft delete's other half: the sentence, and the Undo that actually
   * restores.
   *
   * ## The Undo is a real write, not an optimistic un-hide
   *
   * `ticket.deleted` is an event, so the way back is its inverse event —
   * `ticket.restored` — and not a client that puts a row back into an array.
   * **That is the whole difference between this product's delete and the
   * prototype's**: `desktop.dc.html:3795` restores a saved `tickets` array
   * because a prototype has no server, and nothing here can. It is also why the
   * message says *"its history is retained"* and means it — the ledger never
   * stopped holding the ticket, so the restore is an ordinary claim about it.
   *
   * ## Both reads are re-asked, and the sheet is NOT reopened
   *
   * A restored ticket is back in the list and the board, so both reload. The
   * sheet is deliberately left closed: the reader dismissed it by deleting, and
   * a restore that also re-opened it would move the page under them.
   *
   * ## A failed restore gets its OWN sentence and NO Undo
   *
   * Ruling 27's split, applied to the second half as well: a refusal and a
   * transport failure are different facts, and `undoFor: null` is what keeps a
   * second click off a toast whose first one did not take.
   *
   * ## After a PERMANENT delete (trash Plan 4, D10/D11)
   *
   * It sends `purge.unmarked` then `ticket.restored` in ONE batch. If only the
   * unmark lands, the ticket is deleted and no longer marked: the strip's
   * `permanent` goes false so its next Undo sends the restore alone (case 19.234).
   */
  const restoreDeletedTicket = useCallback(
    async (ticketId: string, permanent: boolean): Promise<void> => {
      setDeleteNotice(null);
      const make = makeSubmittedFactory({ actorId: currentUserId, origin: 'web' });
      const seeds = restoreSeeds({ kind: 'ticket', workspaceId, entityId: ticketId }, permanent);
      try {
        const results = await dataSource.ingest(seeds.map(make));
        const outcome = classifyBatch(results, seeds.length);
        if (outcome.status === 'unanswered') {
          setDeleteNotice({ message: 'The server did not answer the restore.', undoFor: null, permanent: false });
          return;
        }
        if (outcome.status === 'committed') {
          // Ruling E2-30 — the durable strip goes ONLY on a committed restore.
          // A failed one keeps it, because the route back is still there and
          // the person may want to try again; clearing it here would take the
          // affordance away at the exact moment it proved useful.
          setDurableUndo(null);
          list.reload();
          board.reload();
          return;
        }
        if (outcome.status === 'partly') {
          setDurableUndo((current) =>
            current !== null && current.ticketId === ticketId ? { ...current, permanent: false } : current,
          );
        }
        setDeleteNotice({
          message: `The ticket could not be restored — ${outcome.reason}`,
          undoFor: null,
          permanent: false,
        });
      } catch (cause) {
        // E5-25: a 401 here is a session that ended, not an unreachable server.
        // `writeFailureCopy` is the ONE place that is decided, for all nine
        // write sites; the redirect is the shell's data-source guard.
        setDeleteNotice({
          message: writeFailureCopy(cause, restoreUnreachableLine),
          undoFor: null,
          permanent: false,
        });
      }
    },
    [board.reload, currentUserId, dataSource, list.reload, workspaceId],
  );

  /**
   * THE BACKLOG NARROWING (Task 10, backlog/closed spec §5.4) — the Backlog
   * tab's own further cut of `listNarrowing.rows`: every row that already
   * survived the shell's exclude-mode filter (`listNarrowing`, immediately
   * above) whose `stateId` is the universal `BACKLOG_STATE_ID`. `null` while
   * `list.rows`/`listNarrowing` have not answered, mirroring both their own
   * gates.
   *
   * `total` counts backlog rows in the UNFILTERED `list.rows` — never
   * `listNarrowing.rows` — for the same reason `listNarrowing`'s own `total`
   * counts from `list.rows` rather than from whatever a narrower stage
   * already dropped: a `total` computed after a filter has run is a count OF
   * the filter, not of the project, and 12.258/12.384's own defect is a
   * partial set presented as whole under exactly this kind of silent
   * substitution. `shown` is the same rows the Backlog tab actually renders.
   *
   * ## AND AN EPIC IS NOT A BACKLOG ROW (owner, 2026-09-20)
   *
   * *"it shouldnt show up in the backlog either. only in the list view."* So
   * this fold drops every rank-1 row, and it drops it from `rows` AND from
   * `total` — the same two-term argument `boardNarrowing` states at length: an
   * epic is a row this tab can NEVER draw, so counting it in "of M" would make
   * `shown !== total` true on every backlog holding one and tell a person with
   * no filter in force that a filter is hiding work.
   *
   * **`total` excluding epics is NOT the "count of a filter" the paragraph
   * above forbids**, and the difference is the whole reason this is stated
   * separately: a filter is something the PERSON set and can unset, so a total
   * read after it has run answers a question about their arrangement. "An epic
   * is not a row here" is a fact about the tab, and there is no control that
   * brings those rows back on this tab — the List is where they are.
   *
   * **THE EPIC'S NAME SURVIVES, AND THAT IS THE RULING RATHER THAN AN
   * OVERSIGHT.** The owner was asked whether removing the epic's ROW should
   * also remove the SECTION HEADER its children sit under, and answered
   * *"Row only."* So a backlog section is still headed by its epic and a child
   * still says which epic it belongs to — the header is now the ONLY thing
   * naming the group — while the epic itself is no longer a ticket anyone can
   * click, rank, start or drag on this tab. **Read as: visible as a NAME,
   * absent as a ticket.**
   *
   * ⚠ **"A SECTION IS STILL HEADED BY ITS EPIC" IS TRUE UNDER THE EPIC
   * GROUPING, AND THE PRODUCT'S DEFAULT IS NOT THE ONLY GROUPING.** A section is
   * headed by an epic only because `groupRows` (`list-model.ts`) is grouping on
   * the `epic` axis, which `DEFAULT_GROUPING` makes the resting state — not
   * because anything here guarantees it. Under a person's stored `status`,
   * `assignee`, `type` or `flat` grouping there is no epic header at all, and
   * there was none before this change either. **So this ruling neither creates
   * nor removes that**: it removes the ROW, and on the epic axis the header it
   * leaves is the only name for the group. (Correction taken from an independent
   * review, 2026-09-20.)
   *
   * ⚠ **AND THE PREDICATE HAS A REPLICA EDGE THIS FOLD CANNOT SEE.** A row's
   * `typeRank` comes from the roster the read resolved against, and
   * `replica-data-source.ts:759` fills an UNKNOWN type with `?? 0` — so an epic
   * the replica's own type table does not hold arrives as rank 0 and is drawn on
   * this tab. That is the conservative direction (it draws MORE, never less, and
   * a row whose type nothing can name is one nothing can honestly exclude) and
   * it is RECORDED rather than fixed: excluding it would need the replica to
   * answer a question about a type it does not have. Owner: whoever next touches
   * the replica's type table.
   *
   * It survives by CONSTRUCTION here rather than by a second guard: `total` is
   * read off `list.rows`, and this memo never touches it, so
   * `labels.epicTitle` still resolves every child's `epicId`; that is what
   * `groupRows` titles each section with. The header was never sourced from the
   * epic's own row, which is why dropping the row cannot take the header with
   * it.
   *
   * ⚠ ONE CONSEQUENCE WORTH NAMING: the epic row was its children's PARENT, so
   * `nestRows` no longer finds them a parent in the set and roots them at depth
   * 0 — the caret column disappears and the children move 22px left. That is
   * the honest drawing of "the parent row is not here"; inventing a phantom
   * depth for an undrawn row would indent under nothing.
   *
   * ✅ **THE RESIDUAL IS CLOSED (owner ruling, 2026-09-20).** It used to be that a
   * backlog holding only epics reached this memo's empty answer and `TicketList`
   * rendered *"Nothing in the backlog — new tickets land here."* over a backlog
   * that holds one — a claim about the backlog SET that denied a member of it.
   * `epicsOnly` below is the fact this memo is the only place to compute: it is
   * `true` exactly when there WERE rows here and every one was an epic, and the
   * render site picks `BACKLOG_EMPTY_EPICS_COPY` on it. **A backlog emptied by
   * anything else keeps the original sentence, and case 13.1044 asserts both
   * arms** — one sentence for both would be false of one of them.
   *
   * ✅ **AND THE TOGGLE'S ARM IS CLOSED TOO (E5-40, 2026-09-21).** This memo
   * used to carry a `RECORDED, NOT FIXED` for "Only tickets in progress": it
   * sets `stateCategories: ['active']` SERVER-SIDE (`listFilter`, above
   * `useTicketList`), and a backlog ticket's category is `open`, so the toggle
   * strips every backlog row out of `list.rows` before this memo ever sees
   * them — both `shown` and `total` read 0, so nothing HERE can tell a backlog
   * emptied by the toggle from one that is genuinely empty. **The fix is not in
   * this memo, and deliberately so:** the toggle's own state is known at the
   * RENDER SITE, which picks `BACKLOG_EMPTY_ACTIVE_ONLY_COPY` on `activeOnly`
   * instead of inferring the cause from a set that cannot carry it. The
   * sentence it picks — *"The backlog is hidden while 'Only tickets in
   * progress' is on."* — is true whether or not anything sat behind the
   * toggle, which is what makes it the right one for a state this fold cannot
   * resolve. The scope note beside the switch names the Backlog now too; it
   * had named three tabs of five.
   */
  const backlogNarrowing = useMemo(() => {
    if (list.rows === null || listNarrowing === null) return null;
    /**
     * `inBacklog` is the set BEFORE this fold's epic drop and AFTER the tab's upstream
     * filter — the only instant at which "there were rows here, and every one of them
     * was an epic" is knowable. `TicketList` cannot tell the two empty backlogs apart
     * (it sees only the array it is handed), so the sentence is chosen here.
     */
    const inBacklog = listNarrowing.rows.filter((row) => row.stateId === BACKLOG_STATE_ID);
    const rows = inBacklog.filter((row) => row.typeRank !== EPIC_RANK);
    const total = list.rows.filter(
      (row) => row.stateId === BACKLOG_STATE_ID && row.typeRank !== EPIC_RANK,
    ).length;
    return { rows, shown: rows.length, total, epicsOnly: rows.length === 0 && inBacklog.length > 0 };
  }, [list.rows, listNarrowing]);

  /**
   * THE BACKLOG TAB'S ROWS, IN RANK ORDER (second wave Task 5).
   *
   * Ranked rows first by key, unranked rows last — the whole of `sortByRank`,
   * which is `compareByRank`'s rule and is imported rather than restated. The
   * optimistic overrides are folded in BEFORE the sort, which is what makes a
   * move visible without a round trip: the row's `rank` is what the sort
   * reads, so overriding it is the move.
   *
   * This is the array the tab draws AND the array the drag/button handlers
   * read their neighbours out of. Those must be the same array — neighbours
   * computed against a stale order are exactly how a drag lands one row from
   * where the pointer was — so it is passed to `TicketList` and to
   * `BacklogRankControls` as one value.
   */
  const backlogRows = useMemo(() => {
    if (backlogNarrowing === null) return [];
    const withOverrides =
      rankOverrides.size === 0
        ? backlogNarrowing.rows
        : backlogNarrowing.rows.map((row) =>
            rankOverrides.has(row.ticketId) ? { ...row, rank: rankOverrides.get(row.ticketId) ?? null } : row,
          );
    return sortByRank(withOverrides);
  }, [backlogNarrowing, rankOverrides]);

  /**
   * A DRAG'S MOVE — the same `submitRank` the two buttons call.
   *
   * The drag has no per-row component of its own to own a notice, so its
   * refusal lands in `rankNotice` beside the list instead of in the row. That
   * is the only difference between the two paths; the key arithmetic, the
   * optimistic override, the reload and the failure split are the shared
   * function's, not this callback's.
   */
  const onReorderBacklogRow = useCallback(
    (movedId: string, beforeId: string | null) => {
      // Cleared as a NEW move begins, which is where it goes stale — and NOT
      // when the list reloads. The review's M-d was right that nothing cleared
      // it, but the reload is the wrong moment and measurably so: a PARTIAL
      // application reports its outcome and then reloads to show the server's
      // state, so clearing on the answer ate the very message explaining what
      // the person was looking at. The next gesture replaces it, a success
      // clears it, and a failure keeps it — which is what someone who just
      // watched their row snap back needs.
      setRankNotice(null);
      void (async () => {
        const outcome = await submitRank(movedId, beforeId, {
          sorted: backlogRows,
          dataSource,
          workspaceId,
          currentUserId,
          onOptimistic: applyRankOverride,
          onRanked: list.reload,
        });
        if (outcome.status === 'refused') {
          setRankNotice({ channel: 'server', text: `Refused by the server — ${outcome.rule}: ${outcome.reason}` });
        } else if (outcome.status === 'unreachable' || outcome.status === 'partial') {
          // `partial` rides the transport channel on purpose: part of the
          // batch DID commit, so it is not a verdict, and the refusal class is
          // for verdicts. Its message says what happened; `submitRank` has
          // already reloaded the list to match the server.
          setRankNotice({ channel: 'transport', text: outcome.message });
        } else {
          setRankNotice(null);
        }
      })();
    },
    [backlogRows, dataSource, workspaceId, currentUserId, applyRankOverride, list.reload],
  );

  /**
   * The workspace's own ticket types, through the seam amendment 10 requires.
   *
   * `useLiveQuery` and not a bare `useEffect` so a `ticket-type.defined` landing
   * on the stream refreshes the picker: a type an admin adds while this page is
   * open is a type the next New-ticket dialog must offer. The key is the
   * workspace's, suffixed, because `useLiveQuery` clears its answer whenever the
   * key moves and two reads keyed on the bare `workspaceId` would be two
   * questions wearing one name.
   */
  const ticketTypes = useLiveQuery(dataSource, workspaceId, `${workspaceId}:ticket-types`, () =>
    dataSource.query.getTicketTypes(workspaceId),
  );

  /**
   * THE DISTINCT WORKFLOWS BEHIND THE BACKLOG'S OWN ROWS (Ruling 42) —
   * sorted and joined into one `useLiveQuery` key, so the page fetches ONE
   * `getWorkflowDef` per DISTINCT workflow among the rows on screen rather
   * than one per row: a project with forty backlog tickets sharing three
   * workflows opens three round trips, not forty.
   */
  const backlogWorkflowIds = useMemo(() => {
    if (backlogNarrowing === null || ticketTypes.data === null) return [];
    const typeById = new Map(ticketTypes.data.map((type) => [type.id, type]));
    const ids = new Set<string>();
    for (const row of backlogNarrowing.rows) {
      const type = typeById.get(row.typeId);
      if (type !== undefined) ids.add(type.workflowId);
    }
    return Array.from(ids).sort();
  }, [backlogNarrowing, ticketTypes.data]);

  const backlogWorkflowDefs = useLiveQuery(
    dataSource,
    workspaceId,
    `${workspaceId}:backlog-workflow-defs:${backlogWorkflowIds.join(',')}`,
    async () => {
      const entries = await Promise.all(
        backlogWorkflowIds.map(
          async (workflowId): Promise<readonly [string, WorkflowDef | null]> => [
            workflowId,
            await dataSource.query.getWorkflowDef(workspaceId, workflowId),
          ],
        ),
      );
      const defs = new Map<string, WorkflowDef>();
      for (const [workflowId, def] of entries) {
        if (def !== null) defs.set(workflowId, def);
      }
      return defs;
    },
  );

  // Every read on this page, one rule, one author — see `src/expired-session.tsx`.
  // Before this, an expired session here rendered "The board cannot be shown yet
  // — HTTP 401 for /v1/projects/…/board", which names the wrong cause and offers
  // the viewer nothing to do about it.
  const expired = useSignInOnExpiredSession([
    board.error,
    list.error,
    ticketTypes.error,
  ]);

  const openTicketId = searchParams.get('ticket');
  /**
   * THE OPEN TICKET'S FILES — the read behind `TicketSheet`'s `attachments` prop.
   *
   * That prop has existed since Plan 6 and this mount never passed it, because
   * nothing served it: `listTicketAttachments` was written and tested by Plan 7
   * with zero production callers, so the sheet's attachment list could only ever
   * be empty. The route now exists
   * (`GET /v1/workspaces/:ws/tickets/:id/attachments`, registered beside the
   * events door and riding the same two guards) and this is the seam that
   * reaches it — views never speak HTTP (coordination amendment 10).
   *
   * **`error` is passed down as well as `data`, and that is the half that
   * matters.** The query THROWS on a refusal rather than answering `[]`,
   * precisely so that "this ticket has no files" and "the files could not be
   * read" stay two states; the sheet draws the first as nothing — the list
   * component's own honest silence — and the second as a sentence. Passing only
   * `data` would collapse the two again on the last hop, which is exactly where
   * the distinction was won.
   *
   * The key carries the ticket id, so opening another ticket refetches rather
   * than showing the previous ticket's files under the new one's heading — the
   * failure `useLiveQuery`'s `queryKey` exists to prevent (ruling P17).
   */
  const openTicketAttachments = useLiveQuery(
    dataSource,
    workspaceId,
    `${openTicketId ?? 'none'}:attachments`,
    async () =>
      openTicketId === null
        ? []
        : dataSource.query.getTicketAttachments(workspaceId, openTicketId),
  );
  /*
    `{ scroll: false }` ON BOTH OF THESE, and it is not a nicety: the sheet is a
    `?ticket=` query on the page the reader is ALREADY on, so a navigation that
    stays on the page must not move it. `router.push`'s `scroll` defaults to
    `true`, which is why opening a ticket threw the reader back to the top of a
    list they had scrolled (owner, 2026-09-22: *"the page gets scrolled to the
    top. it should not scroll"*). `openParentTicket` below is the one door this
    does NOT blanket — see its own note.
  */
  const openTicket = (ticketId: string) =>
    router.push(`/w/${workspaceId}/p/${projectId}?ticket=${ticketId}`, { scroll: false });
  const closeTicket = () =>
    router.push(`/w/${workspaceId}/p/${projectId}`, { scroll: false });
  /**
   * Opening the ticket the sheet's `Subtask of {parent}` chip names.
   *
   * **NOT `openTicket` above, and that difference is the whole reason this
   * exists.** That one pushes the CURRENT project's path, which is correct for
   * the rows this project's own list serves. A parent may sit in ANOTHER
   * PROJECT — case 6.57 records that nothing refuses one — and the read the chip
   * is built from carries no project at all (`ParentRef` is `{kind, id, title}`,
   * `packages/app-core/src/view-types.ts`). So the location has to be ASKED FOR,
   * and `TicketLocator` is the shipped answer to exactly that question — the
   * inbox asks it the same way, for the same reason, through the same route.
   *
   * **Both failure arms are SAID rather than swallowed.** `locate` answers
   * `null` for the one frozen 404 the ticket route sends, which is the same
   * answer for a ticket that does not exist and for one this viewer may not see
   * — deliberately, so the status is not an existence oracle — and the locator's
   * own docblock says the caller must *"say 'this cannot be opened from here'
   * rather than guessing which of the two it was"*. A rejection is the other
   * event. A chip that quietly did nothing would be the button that lies, on the
   * surface whose whole subject is what this ticket is part of.
   */
  const openParentTicket = (ticketId: string): void => {
    setParentOpenNotice(null);
    void ticketLocation.locate(workspaceId, ticketId).then(
      (location) => {
        if (location === null) {
          setParentOpenNotice({
            channel: 'server',
            text: 'That ticket cannot be opened from here — the server will not place it for you.',
          });
          return;
        }
        /*
          THE ONE DOOR THAT KEEPS THE DEFAULT. The parent may sit in ANOTHER
          project, and then the reader is leaving the page and the top of the new
          one is where they belong; when it sits in THIS project the sheet is
          again a `?ticket=` query on the page under them and the scroll must not
          move. A blanket `{ scroll: false }` would strand them mid-page on a
          project they have just arrived at.
        */
        router.push(ticketSheetPath(location, ticketId), {
          scroll: location.projectId !== projectId,
        });
      },
      (cause: unknown) => {
        setParentOpenNotice({
          channel: 'transport',
          text: cause instanceof Error ? cause.message : String(cause),
        });
      },
    );
  };

  const labels = useMemo<GroupLabels>(() => {
    // KEPT `?? []`, and it is the truth rather than a substitute: the closures
    // built here are handed to `TicketList`, which is mounted only inside the
    // `list.rows !== null` arm below, and the memo re-runs on `list.rows`. So no
    // call ever reaches this `[]`. Structural, not tested — the same register
    // `apps/server/src/routes/builder-reads.ts` uses for its unfalsifiable
    // predicates, because claiming a test for it would be the overclaim.
    const rows = list.rows ?? [];
    return {
      // `?? epicId` was safe while `list.rows` was always the COMPLETE set: any
      // epic a surviving child pointed at was necessarily in it. A narrowing
      // breaks that — an epic that is `open` or `terminal` is filtered out while
      // its `active` children survive and are rooted by `nestRows`, so the lookup
      // misses and a 26-character ULID appears where a section title goes. Named
      // rather than printed raw, and only when a narrowing can explain it: with no
      // narrowing in force a missing epic means something else (visibility), and
      // saying "outside the narrowing" there would be inventing a reason.
      epicTitle: (epicId) =>
        rows.find((row) => row.ticketId === epicId)?.title ??
        (activeOnly ? 'An epic outside this narrowing' : epicId),
      typeName: (typeId) => typeId,
    };
  }, [list.rows, activeOnly]);

  /**
   * The roster, for the two views that print a claim's AUTHOR.
   *
   * `getMembers` is one of the seven `DataSourceQuery` reads the shipped server
   * actually serves, and this is the same call `app/w/[workspaceId]/members`
   * already makes — not a second naming authority, the same one. It has NO
   * refusal arm and that is deliberate: `UserNameFn` falls back to the raw
   * actor id (`view-types.ts`: "a null name NEVER means anonymous"), so a roster
   * that has not arrived or refused leaves every claim attributed to an id
   * rather than unattributed. Narrower than the truth, never wrong about it —
   * and a refusal panel for it would put the calendar behind a read the calendar
   * does not need in order to be correct.
   */
  const members = useLiveQuery(dataSource, workspaceId, `${workspaceId}:members`, () =>
    dataSource.query.getMembers(workspaceId),
  );
  const nameOf = useMemo(() => {
    // `memberLabel`, not `member.name` (2026-09-22). The old value was the raw
    // display name, and `?? userId` does NOT save it from a blank one: `''` is
    // not nullish, so a magic-link member's blank name SURVIVED the fallback and
    // painted an empty assignee and an empty calendar row — the id floor was
    // never reached for the one population that needs it. `memberLabel` answers
    // name → email → id, so the same lookup now floors correctly.
    //
    // No `actorLabel` here, deliberately: every consumer of this function is a
    // display name (`assigneeName` for the board filter's two views, `userName`
    // for the calendar and the timeline), none of them renders a claim, and the
    // system-actor override belongs to claims. Auto-close has no card in either
    // view to be drawn on.
    const byId = new Map(
      (members.data ?? []).map((member) => [member.id, memberLabel(member)]),
    );
    return (userId: string): string => byId.get(userId) ?? userId;
  }, [members.data]);

  /**
   * The Assignee picker's options for the New-ticket dialog (owner request
   * 2026-09-23) — resolved off the roster this page ALREADY reads for `nameOf`,
   * so nothing new is fetched and there is no second notion of who is in the
   * workspace to keep in step.
   *
   * `memberLabel` and not `member.name`, for the reason `nameOf` records two
   * lines up: `member.name` is the empty string for the magic-link population,
   * and `''` is not nullish, so a blank name survives a `??` fallback and paints
   * an EMPTY option — a hole on screen rather than a degradation. `memberLabel`
   * answers name → email → id, so a nameless member with a real address is
   * offered by their address and only a member with neither by their id.
   *
   * A picker option is a person, so `actorLabel` is deliberately NOT used: the
   * system-actor override belongs to CLAIMS, not to a roster row — the same
   * reason `ticket-sheet.tsx`'s own picker has its own label.
   */
  const assigneeCandidates = (members.data ?? []).map((member) => ({
    id: member.id,
    name: memberLabel(member),
  }));

  /**
   * Why the dialog must NOT offer the roster — or `null` when it must.
   *
   * ⚠ **`members.data === null` is one of the two reasons, and that is the whole
   * point of this variable.** A pending read and a refused one are different
   * facts (the page's own filter panel says so: `membersError` / `members ===
   * null` / an empty roster are three arms), but they agree on the thing that
   * matters here: neither is evidence that this workspace has nobody in it.
   * Handing the dialog `assigneeCandidates={[]}` in either case would render a
   * picker whose only option is "Unassigned" — a control that ASSERTS nobody can
   * be assigned, from a read that has not answered. That is the same lie
   * `ticket-sheet.tsx` fixed for its own picker (`members={members.data ?? []}`,
   * #530), one screen over.
   *
   * The empty-roster case is NOT here on purpose: `data` being an EMPTY ARRAY is
   * a real answer, and the picker legitimately offers only "Unassigned" then.
   */
  const membersRefusal =
    members.error !== null
      ? members.error
      : members.data === null
        ? 'The workspace roster has not loaded yet.'
        : null;

  /**
   * THE ONE PLACE THIS SHELL DECIDES WHICH DAY IS TODAY.
   *
   * Computed once per render and handed to both views as a prop, because neither
   * reads a clock — that is what makes the today-ring provable and their tests
   * deterministic. `TimelineView` takes the same `today`: its scroll anchor is
   * internal state seeded from it, not a second mount prop, and passing one
   * would be inventing a second origin for the same day. `istToday` is the only
   * thing allowed to make this decision; an ISO slice would ring yesterday's
   * cell for five and a half hours every night.
   */
  const [today, setToday] = useState(() => istToday());
  /**
   * RULING E5-43 (2026-09-21) — `today` is now RE-DERIVED, and this replaces the
   * "RECORDED, NOT FIXED" note that stood here. That note was accurate about the
   * defect it named: the day was computed once per RENDER and never on its own,
   * so a tab left open across IST midnight kept yesterday's ring until something
   * else re-rendered this page. The day COMPUTATION was always right — 11.164
   * pins it at the instant the UTC and IST spellings disagree — and the note
   * deferred only WHEN it is recomputed, to "whoever next opens this page's date
   * wiring". This is that change.
   *
   * ## Why an EVENT and not a tick
   *
   * The finding allows either. This takes the event because it needs no cadence
   * argument: a tick must answer "how often is often enough", and every answer
   * is wrong in one direction — a minute is 1440 wake-ups a day to move one
   * value, an hour leaves a ring stale for up to an hour after midnight. A
   * visibility or focus event instead fires exactly when the page is ABOUT to be
   * looked at again, which is the only moment the ring's staleness can be seen,
   * and a background tab's ring is not being looked at. It is also what the
   * finding names first.
   *
   * ## Why state rather than a `let`
   *
   * A re-derivation only reaches the two views through a render, so the day has
   * to be state. Setting the SAME day is free — React bails out on an identical
   * value — so a person switching tabs ten times across a quiet afternoon costs
   * ten comparisons and no render.
   *
   * Both listeners are removed on cleanup; neither is registered on the server,
   * because this file is a client component (`'use client'` at the top) and the
   * effect never runs there.
   */
  useEffect(() => {
    const refresh = (): void => setToday(istToday());
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  /**
   * The roster resolved into the two things the views need from it, and BOTH are
   * omitted while it has not arrived rather than defaulted to an empty answer.
   *
   * `rankOneEpicPredicate([])` would answer false for every type including
   * `epic`, which is wrong about the truth; passing nothing lets both views fall
   * back to app-core's `isBuiltinEpicType`, which is merely narrower than it.
   * The same reasoning is why `customDateFieldsByType` is consulted per row's
   * own type rather than flattened across the project.
   */
  const dateFieldsByType = useMemo(
    () => customDateFieldsByType(ticketTypes.data ?? []),
    [ticketTypes.data],
  );
  const isEpicType = useMemo(
    () => (ticketTypes.data === null ? undefined : rankOneEpicPredicate(ticketTypes.data)),
    [ticketTypes.data],
  );

  /**
   * ONE PASS produces the narrowed board, its shown count, and its total — per
   * coordinator Ruling 1. A count computed by a SECOND walk over `board.data`
   * (or, worse, borrowed from `list.rows.length`, which `activeOnly` narrows
   * server-side and the board never does) could disagree with what actually
   * renders; a single fold cannot disagree with itself. `<Board>` below is
   * handed `boardNarrowing.view`, never `board.data` directly, so the grid and
   * the count are reading the SAME computed groups.
   *
   * THREE mechanisms fold into this ONE pass as of 2026-09-20, not two:
   * `boardFilter` (Task 4) drops CARDS, never a column or a group —
   * `board.tsx:66`'s own rule, still exactly true of that mechanism on
   * its own — while `workflowFilter` above (Ruling R3, Task 8) drops whole
   * GROUPS, by construction, whenever a specific workflow is picked. The
   * per-card predicate below is `keepGroup && matchesBoardCard(...)`, so
   * `total` still counts every card in a DROPPED group — those cards are
   * real, and R3's whole point is that the picker is a filter, so its "of
   * M" must name the project's whole board, never only the remainder it
   * kept — while `shown` counts only cards that are BOTH in a kept group
   * AND pass `matchesBoardCard`. A fully-filtered board (by either
   * mechanism, or both at once) therefore renders its remaining columns
   * empty, or omits a group's rail entirely, rather than vanishing — the
   * `N of M shown` count and the removable chip(s) below are the only
   * disclosure, which is the invariant's whole point. This is also exactly
   * why `shouldRenderNarrowingStrip`'s third term (`shown !== total`)
   * exists independently of `activeFilterChips`/`boardUnappliedAxes`: no
   * axis enumeration can ever name "a whole group was dropped", so the gate
   * would otherwise miss this mechanism entirely — see that function's own
   * docblock in `board-search-scope.ts`.
   *
   * ## The THIRD mechanism: `isEpic(card.typeId)` (owner, 2026-09-20)
   *
   * *"epics should never show up in the board, timeline and calendar views.
   * they can only be in the list views"*, extended the same day to the Backlog
   * — *"only in the list view"*. A board card for an epic is now dropped by
   * this fold, and it is dropped **before `total` increments**, which is the
   * only part of this worth arguing about.
   *
   * **An epic is not counted in `total` either, and that is not the R3 rule
   * flipped.** R3's argument is that a card in a DROPPED GROUP is still a card
   * this board could draw, so "of M" must include it. An epic is a card this
   * board can NEVER draw — the ruling forbids it — so counting it would make
   * `shown !== total` true on every project holding an epic, and `isNarrowed`
   * would then tell a person with NO filter in force that a filter is hiding
   * work. A permanently-false narrowing claim is worse than the residual it
   * buys: with the epic out of both terms, `N of M shown` is a claim about what
   * this view draws, which is the property §4 of the dispatch names.
   *
   * ✅ **THE RESIDUAL IS CLOSED (owner ruling, 2026-09-20).** It used to be that a
   * board whose only non-closed tickets are epics reached `total === 0 && shown
   * === 0`, so `Board` rendered `EMPTY_BOARD_COPY` — *"No tickets here yet —
   * create one."* — over a project that holds an epic. `epicsDropped` below is
   * the fact this fold is the only place to compute, and the render site turns
   * it into `EMPTY_BOARD_EPICS_COPY`, which names the cause and where the work
   * went. **A project with no tickets at all keeps the original sentence** — the
   * ruling is about empty views emptied BY THIS RULE, not about empty projects —
   * and case 13.1043 asserts both arms, because the two are the SAME state here
   * (see `Board`'s own `epicsHidden` docblock) and one sentence would be false
   * of one of them.
   *
   * ⚠ **AND THE PREDICATE HAS A TRANSIENT, WHICH IS THE SAFE DIRECTION.** The
   * roster read is in flight on first paint, so `isEpicType` is `undefined` and
   * this fold falls back to app-core's `isBuiltinEpicType` — the built-in
   * `epic` id only. A workspace whose rank-1 type is NOT the built-in therefore
   * draws those cards until the roster lands, and then they leave. Narrower
   * than the truth, never wrong about it (the same default, and the same
   * argument, `epic-ancestor.ts` states), and the identical transient the
   * calendar and the timeline already carry for their own epic work.
   *
   * Reads `resolvedWorkflowFilter`, not raw `workflowFilter` — see that
   * value's own docblock above (Ruling 20(b)): a picked workflow that has
   * dropped out of `board.data` falls back to `'all'` here rather than
   * narrowing every group to nothing on a stale id. `boardFilter` is likewise
   * declared above, in its own section, because it is a filter the PERSON
   * sets and this memo is only one of its readers.
   *
   * ⚠ **THIS MEMO SITS *AFTER* THE ROSTER BLOCK ON PURPOSE, AND THE POSITION IS
   * LOAD-BEARING.** It was declared above `boardFilter`'s own section until
   * 2026-09-20; `isEpicType` is a `const` declared here, and ⚠ **the throw comes
   * from the DEPS ARRAY, not from the callback** — `useMemo(fn, deps)` evaluates
   * `deps` as an argument at the call, on EVERY render, before `fn` is reached,
   * so a memo above this line would throw unconditionally rather than only when
   * its callback happened to run. *(This paragraph said "the callback runs
   * during the render that reaches it" until an independent review corrected the
   * mechanism; the file's own line numbers were re-read before the correction
   * was taken.)* Moving the DECLARATION was the smaller change than moving the
   * roster read up past `useBoard`/`useTicketList`, and the two orders are not
   * equivalent.
   */
  const boardNarrowing = useMemo(() => {
    if (board.data === null) return null;
    // `?? isBuiltinEpicType` and not `isEpicType === undefined ? … : …`: the
    // fallback is app-core's own stated default rather than a second copy of
    // it here, and it draws MORE, never less. See the transient note above.
    const isEpic = isEpicType ?? isBuiltinEpicType;
    let total = 0;
    let shown = 0;
    /**
     * THE EPIC RULE'S OWN CONSEQUENCE, COUNTED — because the view cannot recover it.
     *
     * `Board` is handed the NARROWED view, so by then a card this pass removed is
     * indistinguishable from a card that was never there; and `isNarrowed` cannot carry
     * it either, because `#602` deliberately does not call the epic drop a narrowing
     * ("a permanently-false narrowing claim is worse than the residual it buys"). This
     * fold is the only place both sets exist at once, so the two sentences the owner
     * asked for (`EMPTY_BOARD_COPY` for a project that is simply empty,
     * `EMPTY_BOARD_EPICS_COPY` for one whose only work this view refuses to draw) are
     * chosen here and passed down as booleans.
     *
     * ⚠ `epicsDropped > 0` IS SUFFICIENT AT THE BOARD LEVEL ONLY BECAUSE THE BANNER
     * ALREADY REQUIRES `totalCards === 0 && isNarrowed !== true`: with nothing drawn and
     * no narrowing in force, a dropped epic is the entire explanation. It is NOT
     * sufficient on its own and is not used on its own.
     */
    let epicsDropped = 0;
    const groups = board.data.groups.flatMap((group) => {
      const keepGroup =
        resolvedWorkflowFilter === 'all' || group.workflowId === resolvedWorkflowFilter;
      const columns = group.columns.map((column) => {
        let epicsInColumn = 0;
        let droppedOtherwise = 0;
        const cards = column.cards.filter((card) => {
          // Before `total`: see "not counted in `total` either" above.
          if (isEpic(card.typeId)) {
            epicsInColumn += 1;
            return false;
          }
          total += 1;
          const keep = keepGroup && matchesBoardCard(card, column, projectId, boardFilter);
          if (keep) shown += 1;
          else droppedOtherwise += 1;
          return keep;
        });
        epicsDropped += epicsInColumn;
        return {
          ...column,
          cards,
          // STRICTER THAN THE BOARD'S, DELIBERATELY: a column also empties under the
          // card filter, which this view cannot disclose (`EMPTY_COLUMN_COPY`'s own
          // docblock), so the epic sentence is reached only when NOTHING else was
          // removed from this column — otherwise "an epic is why this is empty" would
          // be a half-truth over a column a filter also emptied.
          epicsHidden: epicsInColumn > 0 && droppedOtherwise === 0 && cards.length === 0,
        };
      });
      return keepGroup ? [{ ...group, columns }] : [];
    });
    return { view: { ...board.data, groups }, shown, total, epicsDropped };
  }, [board.data, boardFilter, resolvedWorkflowFilter, projectId, isEpicType]);

  /**
   * `listNarrowing === null ? [] : …` and NOT `list.rows ?? []`, for the
   * reason the `parentCandidates` note below gives at length: the two
   * spellings agree here only because the arms that render these inputs are
   * gated on `list.rows !== null` themselves. The gate is the guarantee; this
   * expression never carries an empty array into a view.
   *
   * Read `listNarrowing.rows` from 2026-09-17 to Task 11 (exclude-mode spec
   * §3): the Calendar and Timeline tabs drew from the SAME narrowed rows the
   * List tab's own count and strip report, rather than the complete
   * unnarrowed set — the whole point of the filter reaching every tab.
   *
   * Reads `datesNarrowing.rows` since Task 11 (Ruling 44): one further cut of
   * exactly those rows, applying the "closed hidden by default" rule the List
   * tab does not — see `datesNarrowing`'s own docblock above. `datesNarrowing`
   * is non-null exactly when `list.rows`/`listNarrowing` are (its own
   * docblock says so), so this still mirrors the old gate precisely.
   */
  const dateInputs = useMemo<TicketDatesInput[]>(
    () =>
      datesNarrowing === null
        ? []
        : datesNarrowing.rows.map((row) =>
            toTicketDatesInput(
              row,
              { workspaceId, projectId },
              dateFieldsByType.get(row.typeId) ?? [],
            ),
          ),
    [datesNarrowing, workspaceId, projectId, dateFieldsByType],
  );

  /**
   * ## THE `?? []` THAT TOLD THE USER THIS PROJECT HAS NO TICKETS
   *
   * This used to read `parentCandidates = (list.rows ?? []).map(…)`, and against
   * the shipped server of the day `getTickets` REFUSED (ruling P25 clause 1 has
   * since served its gaps) — so `list.rows` was null forever,
   * `parentCandidates` was permanently `[]`, and the New-ticket dialog's parent
   * picker offered "None (project root)" and nothing else. Measured with this
   * branch's own `stubServices({})`: `PARENT OPTIONS: ['None (project root)']`,
   * while the Board tab on the same page rendered the very tickets the picker
   * said did not exist, because `getBoard` IS served. A refused read had become
   * the sentence "there is nothing here" — the one claim this whole shell exists
   * to refuse to make.
   *
   * `parentCandidates` is only ever built from rows that ARRIVED. Everything
   * else is a state the create control names out loud below.
   *
   * ⚠ AN `inFocus` KEY USED TO BE COMPUTED HERE AND IS GONE (owner ruling
   * 2026-09-23). It was `row.stateId !== BACKLOG_STATE_ID && row.closed ===
   * null` — a candidate is in focus when it sits outside the universal Backlog
   * state AND has never been closed (or was reopened) — and its ONE reader was
   * the New-ticket dialog's "Start in focus" checkbox, which appeared only
   * under an in-focus parent. The owner lifted that condition: the dialog's
   * birth-state control is now a `Switch` that is always present, always
   * answerable, and remembers the person's answer, so the parent's own state
   * has no bearing on where a ticket is born and this map has nothing to claim
   * about it. The formula is recorded here rather than silently dropped because
   * `test-cases/13-owner-requests-and-backlog.md`'s 13.591f pinned it at this
   * exact site for a whole release, and the next reader deserves to know what
   * happened to it rather than to re-derive it from the spec §5.4 text it
   * contradicts.
   */
  const parentCandidates =
    list.rows === null
      ? []
      : list.rows.map((row) => ({
          id: row.ticketId,
          title: row.title,
        }));

  const typeOptions =
    ticketTypes.data === null
      ? BUILTIN_TYPE_LADDER
      : ticketTypes.data.map((type) => ({
          id: type.id,
          name: type.name,
          rank: type.rank,
          // Starting-status design, 2026-09-23 — `TicketTypeDef.workflowId`
          // carries straight through, the same field `workflowStatesFor`
          // below keys its read on.
          workflowId: type.workflowId,
        }));

  /**
   * THE DISTINCT WORKFLOWS BEHIND THIS PROJECT'S OWN TYPES (starting-status
   * design, 2026-09-23) — the same "one `getWorkflowDef` per distinct id"
   * shape `backlogWorkflowIds`/`backlogWorkflowDefs` above already use for
   * the backlog's rows, applied to `typeOptions` instead: a project whose
   * five ticket types share two workflows opens two round trips, not five.
   */
  const ticketTypeWorkflowIds = useMemo(
    () => Array.from(new Set(typeOptions.map((type) => type.workflowId).filter((id) => id !== ''))).sort(),
    [typeOptions],
  );
  const ticketTypeWorkflowDefs = useLiveQuery(
    dataSource,
    workspaceId,
    `${workspaceId}:ticket-type-workflow-defs:${ticketTypeWorkflowIds.join(',')}`,
    async () => {
      const entries = await Promise.all(
        ticketTypeWorkflowIds.map(
          async (workflowId): Promise<readonly [string, WorkflowDef | null]> => [
            workflowId,
            await dataSource.query.getWorkflowDef(workspaceId, workflowId),
          ],
        ),
      );
      const defs = new Map<string, WorkflowDef>();
      for (const [workflowId, def] of entries) {
        if (def !== null) defs.set(workflowId, def);
      }
      return defs;
    },
  );
  /**
   * `NewTicketDialogProps.workflowStates` — a workflow id in, its
   * `initialStateId` and EVERY state out (each with its OWN `creatable`, the
   * ONE helper every other site on this design asks — `isCreatableState`),
   * or `null` while `ticketTypeWorkflowDefs` has not resolved it (the "not
   * loaded" state the select shows as "Loading states…"). Unfiltered
   * deliberately: `NewTicketDialog` is the one place that narrows to
   * `creatable` (its own docblock says why), so this read states the fact
   * and lets the dialog decide what to do with it.
   */
  const workflowStatesFor = (
    workflowId: string,
  ): { initialStateId: string; states: Array<{ id: string; name: string; category: string; creatable: boolean }> } | null => {
    const def = ticketTypeWorkflowDefs.data?.get(workflowId);
    if (def === undefined) return null;
    return {
      initialStateId: def.initialStateId,
      states: def.states.map((state) => ({
        id: state.id,
        name: state.name,
        category: state.category,
        creatable: isCreatableState(def, state.id),
      })),
    };
  };

  /**
   * The board's own column names, id → name, for the `stateIds` chip below.
   * Sourced from `board.data` directly rather than from `boardNarrowing.view`
   * (which may already be narrowed) — a chip naming what a filter EXCLUDES
   * must resolve against the FULL set of states the board has, not the
   * narrowed remainder.
   */
  const boardStateNames = useMemo(() => {
    const names = new Map<string, string>();
    if (board.data !== null) {
      for (const group of board.data.groups) {
        for (const column of group.columns) {
          names.set(column.stateId, column.name);
        }
      }
      /**
       * RULING 45 — the universal Backlog state joins the State options, NO
       * second def fetch: `BACKLOG_STATE_ID`/`BACKLOG_STATE` are the same
       * reserved id/name every workflow already carries implicitly
       * (`workflow.ts`'s own `statesWithBacklog`), so this needs nothing
       * beyond what `board.data` already answers. Appended LAST — mirroring
       * `statesWithBacklog`'s own "always last" rule — so it can never
       * collide with a real column: the id is RESERVED, `validateWorkflowDef`
       * refuses any definition that declares it, so the loop above can never
       * already hold this key.
       */
      names.set(BACKLOG_STATE_ID, BACKLOG_STATE.name);
    }
    return names;
  }, [board.data]);

  /**
   * The same map, as `{id, name}` pairs — the shape the Filters sheet's
   * "State" chips iterate. Derived from `boardStateNames` itself rather than
   * a second walk of `board.data.groups`, so the two can never enumerate a
   * different state set.
   */
  const boardStateOptions = useMemo(
    () => Array.from(boardStateNames, ([id, name]) => ({ id, name })),
    [boardStateNames],
  );

  const typeNameById = useMemo(
    () => new Map(typeOptions.map((type) => [type.id, type.name])),
    [typeOptions],
  );

  /**
   * THE REMOVABLE CHIP HALF of the disclosure invariant — built from
   * `boardFilter` itself (declared above, in its own section — ⚠ **`boardNarrowing`
   * is no longer beside it**: that fold moved down to the roster block on
   * 2026-09-20, because it needs `isEpicType` and a `const` cannot be read
   * above its own declaration), one
   * chip per axis actually set, covering all SIX of `BoardFilterSpec`'s
   * fields rather than only `text`. See `buildFilterChips`'s own
   * docblock in `board-search-scope.ts` for why this single-enumeration
   * design is the fix, not a style choice: the previous version silently
   * closed the disclosure gate on any of the other five axes narrowing the
   * board with no chip and no scope-note entry to show for it.
   *
   * Declared HERE, after `nameOf`/`typeOptions`/`boardStateNames`, because
   * label resolution needs the roster and the type/state name maps — moving
   * this below where they are ready, rather than moving three data reads
   * above where `filter` is declared, is the smaller reshuffle.
   */
  const activeFilterChips = useMemo(
    () =>
      buildFilterChips(
        boardFilter,
        {
          assigneeName: nameOf,
          typeName: (id) => typeNameById.get(id) ?? id,
          stateName: (id) => boardStateNames.get(id) ?? id,
        },
        setFilter,
      ),
    [boardFilter, nameOf, typeNameById, boardStateNames],
  );

  /**
   * THE WORKFLOW PICKER'S OWN CHIP (Task 8) — built separately from
   * `buildFilterChips`, on purpose: that function enumerates
   * `boardFilter`'s six fields one by one, and `workflowFilter` is not one
   * of them (see its own declaration above) and never can be —
   * `matchesBoardCard` has no group in its signature for a seventh axis to
   * join. So this is a second, small builder rather than a seventh case
   * inside `buildFilterChips`, shaped identically (`BoardFilterChip`)
   * so it can join the SAME strip at the render site below without a second
   * chip idiom. `null` while `workflowFilter === 'all'` — the resting state
   * discloses nothing because it has dropped nothing (R3).
   *
   * The label resolves the workflow's NAME from `board.data.groups` (the
   * FULL, unfiltered group list the picker's own `<option>`s are built
   * from below) rather than from `boardNarrowing.view.groups` (which, once
   * a workflow is picked, contains only the surviving group and could never
   * name the one that is missing) — the same "resolve against the whole
   * set, not the narrowed remainder" rule `boardStateNames` already follows
   * for the `stateIds` chip, one section up.
   *
   * Reads `resolvedWorkflowFilter`, not raw `workflowFilter` (Ruling 20(b)):
   * `workflowFilter === 'all'` alone would miss the fallback case, and
   * `group?.workflowName ?? workflowFilter` would then print the raw,
   * unresolvable id as this chip's own label — the exact phantom-narrowing
   * failure `resolvedWorkflowFilter`'s own docblock names. With the
   * fallback, `resolvedWorkflowFilter === 'all'` is true in that case, and
   * this function returns `null` — no chip, nothing to name — before the
   * lookup that could never have found anything runs at all.
   */
  const workflowChip = useMemo<BoardFilterChip | null>(() => {
    if (resolvedWorkflowFilter === 'all') return null;
    const group = (board.data?.groups ?? []).find(
      (candidate) => candidate.workflowId === resolvedWorkflowFilter,
    );
    const label = `Workflow: ${group?.workflowName ?? resolvedWorkflowFilter}`;
    return { key: 'workflow', label, mode: 'include', onRemove: () => setWorkflowFilter('all') };
  }, [resolvedWorkflowFilter, board.data]);

  /**
   * THE STRIP'S FULL CHIP LIST — `activeFilterChips` plus `workflowChip`
   * when one is active, merged ONLY here, at the render boundary. Every
   * other reader of `activeFilterChips` (the gate's `chipCount` term below,
   * and the strip's own `chips` selection for every tab but Board, since
   * 2026-09-17 — `workflowChip` never reaches List/Calendar/Timeline,
   * because it narrows GROUPS only the board renders) keeps reading
   * `activeFilterChips` alone, unmerged — the gate does not need
   * `workflowChip` counted in `chipCount` because
   * `shouldRenderNarrowingStrip`'s independent third term
   * (`shown !== total`) already fires for group-dropping on its own (see
   * `boardNarrowing`'s own docblock above); double-counting it into
   * `chipCount` too would not change the gate's answer, only obscure which
   * term is actually doing the work.
   */
  const narrowingChips = useMemo(
    () => (workflowChip !== null ? [...activeFilterChips, workflowChip] : activeFilterChips),
    [activeFilterChips, workflowChip],
  );

  /**
   * THE LIST/CALENDAR/TIMELINE/BACKLOG CHIP LIST (Task 11, spec §5.5) —
   * `activeFilterChips` plus the one axis those four tabs can apply that the
   * Board cannot at all: `closed` (§5.2 — Board is "unchanged" by this task).
   * A SEPARATE call into `buildFilterChips`, spreading `boardFilter`'s own
   * six fields rather than folding `closed` onto `boardFilter` itself —
   * `boardFilter`'s own docblock is exact about why it stops at those six
   * ("the axes a board can answer"), and `closed` is a SEVENTH `BoardCard`
   * cannot represent AT ALL (no field for it, unlike the four
   * `describeUnappliedBoardAxes` already discloses as merely board-blind).
   * Folding it in there would make `activeFilterChips` — which
   * `narrowingChips` above spreads onto the BOARD tab's own strip — show a
   * "Closed: …" chip on a tab where clicking it changes nothing, exactly the
   * disclosure lie `buildFilterChips`'s own docblock (Task 4 review) was
   * written to stop. Reusing `boardFilter` via a spread, rather than
   * hand-listing the six fields a second time, is what keeps this list from
   * drifting from `activeFilterChips` on the axes the two DO share.
   */
  const listFilterChips = useMemo(
    () =>
      buildFilterChips(
        { ...boardFilter, closed: filter.closed },
        {
          assigneeName: nameOf,
          typeName: (id) => typeNameById.get(id) ?? id,
          stateName: (id) => boardStateNames.get(id) ?? id,
        },
        setFilter,
      ),
    [boardFilter, filter.closed, nameOf, typeNameById, boardStateNames],
  );

  /**
   * THE DEFAULT-HIDE CHIP (Ruling 44) — synthetic, not one of
   * `buildFilterChips`'s own: it discloses a PAGE-LEVEL default
   * (`showClosedOnDates`), not an axis set on `filter` at all, so it has no
   * natural home inside a function that enumerates `FilterSpec` fields.
   * Present exactly when the default is actually IN FORCE on a date tab —
   * `filter.closed === undefined` (the person has not overridden it) AND
   * `!showClosedOnDates` (they have not lifted it either) — mirroring
   * `workflowChip`'s own "resting state discloses nothing" rule (R3): once
   * `filter.closed` is set explicitly, `listFilterChips`'s own "Closed: …"
   * chip takes over and this one stands down, matching Ruling 44's "an
   * explicit filter.closed overrides both ways" — never both chips at once,
   * for the same reason `closedMode`/`buildFilterChips`'s closed branch is an
   * `if`/`else if` rather than two independent conditions.
   */
  const closedDefaultInForce = filter.closed === undefined && !showClosedOnDates;
  const closedDefaultChip: BoardFilterChip | null =
    (view === 'calendar' || view === 'timeline') && closedDefaultInForce
      ? {
          key: 'closed-default',
          label: 'Closed: hidden',
          mode: 'exclude',
          onRemove: () => setShowClosedOnDates(true),
        }
      : null;

  /**
   * Why the create control is GATED rather than mounted with a disabled picker.
   *
   * Two of its three inputs can be missing, and each missing one makes a
   * different silent claim inside a MODAL — where a sentence rendered on the page
   * behind it cannot be read:
   *
   * - no rows: the parent picker asserts this project has no ticket that could
   *   be a parent (the defect above);
   * - no types: the type picker asserts these four are the workspace's types.
   *
   * A disabled picker with the reason beside it was the alternative, and it costs
   * an app-core prop change on `NewTicketDialog` plus a second place for the
   * refusal to be phrased. The gate keeps ONE rendering idiom on this page — the
   * same `error → ShellRefusal, data → component` the board and the list both
   * use — and puts the reason where the viewer is already looking.
   *
   * **That cost is no longer paid, and the reason it was accepted expired.** The
   * note here used to read: against the server that ships today `getTickets`
   * refuses, so this control is not offered at all and no ticket can be created
   * from this page — *not even at project root, which needs no parent* — and that
   * *"Plan 7 owns the list route's serving gap; the day it lands the control
   * appears with no change here."*
   *
   * The premise was that the refusal is TEMPORARY and route-owned. It is not, for
   * the refusal a real customer meets: `LIST_TOO_LARGE_ABSENCE` is a bound this
   * CLIENT chose, its own `owner` field says so, and no route change clears it. A
   * project that grows past it refuses for ever — so "creation returns when Plan 7
   * lands" was never true for the case that matters (measured as 12.382).
   *
   * So the list read no longer gates creation. Types still do, and that asymmetry
   * is the point: **a ticket cannot be created without a TYPE, and can be created
   * without a PARENT** — project root is the arm the old text itself flagged as
   * wrongly blocked. The dialog is told the parent list is unavailable rather than
   * handed an empty one, because an empty picker asserts this project has no
   * possible parent, which is the silent claim the rest of this docblock exists to
   * refuse.
   */
  const createRegion = (() => {
    // TYPES still gate creation: a ticket cannot be created without one.
    if (ticketTypes.error !== null) {
      return (
        <ShellRefusal
          what="This workspace’s ticket types, so New ticket is not offered"
          message={ticketTypes.error}
        />
      );
    }
    if (session.kind === 'signed-out') {
      return (
        <p role="status" className="gn-new-ticket__gate">
          Sign in to create a ticket.
        </p>
      );
    }
    // The list refusing no longer withholds the form — it withholds only the
    // parent picker, which project-root creation never needed.
    // ⚠ `rowsHaveAnswered`, NOT `rows === null` — owner report 2026-09-23, "the
    // project header still has a flicker during transition", and the flicker was
    // this line. `rows` is nulled on every KEY change, and the list's key carries
    // the filter, so toggling *Only tickets in progress* retracted the New ticket
    // BUTTON and put this gate in its place until the refetch landed. The gate is
    // a differently-sized element (229×23 against the button's 116×44), so the
    // header's flex row resized and snapped back — measured at ~40 ms across
    // three animation frames, with the rail and the note row not moving at all.
    //
    // The question this gate asks is "has the list ever been answerable", not
    // "does it have rows for the current filter". The second is what `rows` says
    // and it is the wrong question for deciding whether a CONTROL exists: a
    // re-read is not a reason to take the button away. The comment two lines
    // below was already half of this argument — a list REFUSAL stopped
    // withholding the form — and a list RELOAD is the other half.
    if (session.kind === 'loading' || (!list.rowsHaveAnswered && list.error === null)) {
      return (
        <p role="status" className="gn-new-ticket__gate">
          Preparing the New ticket form…
        </p>
      );
    }
    /**
     * Keyed on `rows === null`, NOT on `error !== null` — those are different facts
     * and only the first one is about parents.
     *
     * `parentCandidates` above is built from `list.rows`. `list.error` USED to be
     * `list.error ?? preferences.error` (`ticket-list.ts`'s `useTicketList`), so an
     * ordinary preferences 500 — or a `setPrefs` PUT the user triggered themselves —
     * set it while the rows sat there intact. Keyed on the error alone, this told a
     * user that the tickets which could be a parent *"cannot be shown"*, and offered a
     * PREFERENCES failure as the reason, while the very same page could have listed
     * them. Two false sentences at once, and the state a stale parent could be
     * submitted from. Witnessed at 3.158.
     *
     * **⚠ AND THAT FOLD WAS THE ROOT OF E5-42 (fixed 2026-09-21), which this comment
     * was the only place to record at the time.** This arm dodged the fold by keying
     * on `rows === null` as well — but the four TAB arms below key on the field alone,
     * so the same preferences failure painted *"The ticket list cannot be shown yet.
     * HTTP … for /v1/me/preferences"* over intact rows on four of the five tabs. The
     * fold is gone: `useTicketList` now returns `error: list.error` and a separate
     * `prefsError` for the preferences half, which renders beside the column chooser.
     * This arm's keying is unchanged and still right — it is simply no longer the only
     * place in this file that knows the difference.
     *
     * Keyed on the rows it says only what it can see: either there are candidates or
     * there are not. The dialog refuses the stale parent independently
     * (`new-ticket-dialog.tsx`), because a component may not depend on its callers
     * getting this right.
     */
    const parentsUnavailable =
      list.rows === null && list.error !== null
        ? { parentCandidatesUnavailable: list.error }
        : {};
    return (
      <>
        <CreateTicketFlow
          {...peopleProps(people, workspaceId)}
          open={createOpen}
          onOpenChange={(next) => {
            setCreateOpen(next);
            // Cleared on CLOSE, not on open (starting-status design,
            // 2026-09-23): a board-column click sets it and opens the
            // dialog in the same act, so clearing it there would race the
            // very read that needs it. The NEXT open — from the header, or
            // from another column — must not inherit a stale selection.
            if (!next) setCreateSelection(null);
          }}
          dataSource={dataSource}
          cache={cache}
          workspaceId={workspaceId}
          projectId={projectId}
          currentUserId={currentUserId}
          typeOptions={typeOptions}
          parentCandidates={parentCandidates}
          {...(activeOnly ? { parentCandidatesNarrowing: 'tickets in progress' } : {})}
          {...parentsUnavailable}
          // The description composer (owner request 2026-09-23). `TicketEditorSlot`
          // wrapped to suppress its own submit control — see
          // `src/new-ticket-description-slot.tsx` for why that is this app's job
          // rather than app-core's.
          editorSlot={NewTicketDescriptionSlot}
          assigneeCandidates={assigneeCandidates}
          {...(membersRefusal === null ? {} : { assigneeCandidatesUnavailable: membersRefusal })}
          workflowStates={workflowStatesFor}
          {...(createSelection === null ? {} : { initialSelection: createSelection })}
          onCreated={openTicket}
        />
        {ticketTypes.data === null ? (
          <p role="status" className="gn-new-ticket__fallback">
            {BUILTIN_LADDER_NOTICE}
          </p>
        ) : null}
      </>
    );
  })();

  /**
   * V1 — whether the `Board`'s empty state may offer its create button.
   *
   * Derived from the SAME two facts `createRegion` branches on to decide whether
   * the flow is offered at all (a signed-in person, and types that did not
   * refuse), read once here rather than re-tested at the board. The transient
   * arms above — the session still loading, the list still loading — are
   * deliberately NOT mirrored: they end on their own, the flow's own dialog
   * opens as soon as it mounts, and a button that disappears for a second and
   * returns is worse than one that opens a dialog a moment later.
   */
  const canCreate = session.kind === 'signed-in' && ticketTypes.error === null;

  return (
    <main id="gn-main" className="gn-shell">
      {/* The route's title. `projectName` is `null` until the read answers, and
          a null name is not a title — the generic `Board` stands in until it
          arrives, and the effect re-runs with the name when it does. exec1 P12. */}
      <DocumentTitle title={projectName ?? 'Board'} />
      {/* No `projectId`: the nav's Board item was removed in Round 23 and that
          prop was its only consumer, so passing it would be feeding a parameter
          nothing reads. */}
      <AppNav workspaceId={workspaceId} />
      <div className="gn-shell__main">
        {expired ? (
          // ONE notice for the page. Three reads can 401 together and they are one
          // event: three panels would describe three.
          <ExpiredSessionNotice />
        ) : (
          <div className="gn-project">
            {/*
              BREADCRUMB AND TITLE — fix round 1 (Ruling 6) put them on the page;
              fix round 2 moved them OUT of `.gn-project__header`; **the owner's
              2026-09-22 instruction supersedes that placement** and this is the
              third arrangement.

              What fix round 2 objected to is real: a 34px/700 `<h1>` that is a
              flex ITEM of a row with `align-items: center` is vertically centred
              on one line with the 13px crumb and the buttons. That objection is
              to the `<h1>` being a SIBLING of the controls — and it is answered
              rather than ignored, because the prototype does not place it as one
              either. `desktop.dc.html:319-341` draws the header as a column
              (`:319`) holding two rows; row 1 (`:320`,
              `justify-content:space-between`) has a LEFT half that is itself a
              `flex-direction: column; gap: 4px` box (`:321-323`) carrying the
              crumb over the `<h1>`, beside the controls row (right, `:325`). So
              these three elements now sit in `.gn-project__identity`, inside the
              `.gn-project__head` row — the `<h1>` is the second line of a column
              beside the controls, never a flex item of the controls row.

              Owner, 2026-09-22: *"the build's project header and controls area.
              arrange it more like the prototype."* An ARRANGEMENT change: no
              control was added, removed or relabelled, and no accessible name
              moved. The archived line stays inside this column — it is the third
              line of the identity, which is also where `ui.css`'s E2-38 note
              already describes it ("it sits under the title as its own line").

              Each name is independently omitted — not a placeholder, not the raw
              id — while its own hook holds `null`. Neither reserves space while
              absent: there is no fixed-height wrapper around either, so the
              column is exactly as tall as its present children and grows once a
              name resolves, rather than holding blank space that a name then
              fills.

              `.gn-project__summary` — DELETED (Task 4). It was declared here
              unconsumed since Task 2, on the coordinator's own say-so, pending
              this task's count. The count that actually shipped is
              `.gn-project__count`, inside the `.gn-project__narrowing` strip
              below the tab rail — a different rule, at different metrics, next
              to the chip and the scope note it may never render without. A
              rule declared for "the task that adds the count" does not get to
              survive unconsumed once that task has run; see `ui.css` for the
              deletion.
            */}
            <div className="gn-project__head">
              <div className="gn-project__identity">
                {workspaceName !== null ? (
                  <p className="gn-project__breadcrumb">{workspaceName}</p>
                ) : null}
                {projectName !== null ? <h1 className="gn-project__title">{projectName}</h1> : null}
                {/* The SAME component and the SAME word the workspace home's card
                    uses for this state, so the two screens cannot describe one fact
                    two ways. A sentence is deliberately NOT added: everything else
                    worth saying about an archived project (who may restore it, where)
                    is admin-only and would be a second false claim for a member. */}
                {projectArchived ? (
                  <p className="gn-project__archived">
                    <Chip tone="neutral">Archived</Chip>
                  </p>
                ) : null}
              </div>

              {/*
                `.gn-project__header` — Task 2 of the prototype port. Controls
                ONLY: Task 4 (search), Task 8 (workflow `<select>`) and Task 5
                (Filters) add their own controls here; New ticket is the one
                control already built, so it moves in now rather than waiting for a
                later task to relocate it. The breadcrumb and title left this
                container in fix round 2 and are now BESIDE it, in
                `.gn-project__identity` — the two are the children of the
                `.gn-project__head` row (owner, 2026-09-22; see the comment
                above).

                MOVED OUT OF THE TABLIST, not merely reclassed: `createRegion` used
                to render as the tablist's fifth child, a plain `<button>` (or a
                `<p role="status">`) sitting inside a `role="tablist"` alongside four
                `role="tab"` children — an ARIA violation `.gn-segmented`'s 2px-gap
                flex track would only have made more visible. Every assertion this
                page's tests make against `New ticket` queries `screen`/`within(dialog)`
                directly rather than scoping from the tablist container, so the move
                changes no test's reach (`page-refusals.test.tsx`,
                `project-create-gate.test.tsx`).

                SEARCH BOX (Task 4) renders here, ABOVE THE TABS, because `filter`
                is page-level state that a tab switch must not reset (Step 2). Its
                `aria-label` says "board" on purpose: today it narrows ONLY the
                Board tab (Ruling 1 scopes T4 to the board path; Calendar and
                Timeline already accept a `filter` prop of their own — confirmed by
                reading `calendar-view.tsx`/`timeline-view.tsx` — but wiring it is
                explicitly out of this task, since narrowing those tabs with no
                count and no chip would itself violate the disclosure invariant
                this task exists to satisfy). A generic, unlabelled "Search" here
                would be a control implying a reach it does not have; naming the
                scope in the accessible name is the fix that costs nothing else.
              */}
              <div className="gn-project__header">
                <input
                  type="search"
                  className="gn-project__search"
                  aria-label="Search the board"
                  placeholder="Search the board"
                  value={filter.text ?? ''}
                  onChange={(event) => {
                    const { value } = event.target;
                    setFilter((current) => ({ ...current, text: value === '' ? undefined : value }));
                  }}
                />
                {/*
                  THE WORKFLOW PICKER (Task 8, Ruling R3). Narrows the board to
                  one workflow's GROUP — a different granularity from every
                  control on this row, which narrow CARDS — so its state
                  (`workflowFilter`) and its fold into `boardNarrowing` are
                  declared beside `boardFilter` above, not beside `filter`.
                  ⚠ `boardNarrowing` itself — the fold this sentence names — moved
                  down to the roster block on 2026-09-20 for the reason recorded
                  there; the STATE this paragraph is about did not move.
                  `All workflows` is the first `<option>` and
                  `workflowFilter`'s own initial value, so the picker's resting
                  state IS the default (R3) with no extra wiring to keep them
                  in sync.

                  GATED ON `board.data.groups.length > 1`, not merely on
                  `board.data !== null`: a project with zero or exactly one
                  workflow offers no real choice — "All workflows" and that one
                  workflow's name would render the identical board — so the
                  control would be a picker between one thing and itself.
                  ⚠ **AMENDED 2026-09-23: this no longer "mirrors a gate in
                  `Board` one level down", because that gate is gone.** The
                  board's group heading used to render only where a board had
                  more than one workflow group, and the owner's collapse ruling
                  removed that condition — a workflow group is collapsible even
                  when it is the only one, so it always has a heading to click.
                  The reason THIS control is still gated is its own and does not
                  depend on the other: a picker whose only option is the thing
                  already on screen is a control with nothing to do.
                  Deliberately reading `board.data.groups` here rather than
                  `boardNarrowing.view.groups`: the latter is ALREADY narrowed
                  by `workflowFilter`, so once a person picks a specific
                  workflow it would hold only that one surviving group and this
                  gate would compute `length > 1` as false and unmount the very
                  control that let them pick it — the picker must be judged
                  against the whole board, never against its own output.

                  No `.gn-select` (the multi-select combobox in
                  `packages/ui`): that component is a listbox-and-panel widget
                  with no native `<select>` underneath it, and the brief and
                  the design spec both name this control a plain `<select>` —
                  metrics table "Workflow select `:325`", its own new
                  `.gn-project__workflow-select` rule in `ui.css` (`ctlBg`/
                  `ctlR`, no new token role; `ctlShadow` omitted, following
                  `.gn-button`'s own already-recorded open decision — see that
                  rule's docblock).

                  `value={resolvedWorkflowFilter}`, not raw `workflowFilter`
                  (Ruling 20(b)) — so the control itself VISIBLY falls back to
                  "All workflows" the moment its own picked workflow drops out
                  of `board.data`, rather than showing a `<select>` whose
                  `value` names an `<option>` that no longer exists (which a
                  browser resolves by silently selecting nothing, an even
                  quieter failure than the phantom chip that motivated the
                  fallback in the first place). `onChange` still WRITES raw
                  `workflowFilter`, never `resolvedWorkflowFilter` — every
                  value this control can write comes from `board.data.groups`
                  at the moment of selection, so it is always valid when
                  written; only the READ side ever needs to fall back.
                */}
                {board.data !== null && board.data.groups.length > 1 ? (
                  <select
                    className="gn-project__workflow-select"
                    aria-label="Workflow"
                    value={resolvedWorkflowFilter}
                    onChange={(event) => setWorkflowFilter(event.target.value)}
                  >
                    <option value="all">All workflows</option>
                    {board.data.groups.map((group) => (
                      <option key={group.workflowId} value={group.workflowId}>
                        {group.workflowName}
                      </option>
                    ))}
                  </select>
                ) : null}
                {/*
                  IN `.gn-project__header`, BESIDE THE FILTERS BUTTON — and the placement
                  is still the whole point rather than a layout choice.

                  It moved here from its own `.gn-list-filter` row on the owner's
                  instruction (2026-09-19: *"gn-list-filter__control in w/<id> page should
                  be next to the new filter button. and it should be a gn-switch."*), and
                  it is the shared `Switch` now rather than a bare checkbox.

                  WHAT THE MOVE HAD TO PRESERVE, because it is why this control was never
                  in a tab arm: every renderer of the list lives inside
                  `list.error === null` — put the narrowing control there and it is
                  reachable by everyone EXCEPT the person who needs it, because past the
                  cap those arms render a refusal instead. That is the identical mistake
                  `createRegion` was making until PR #270, and it has the identical fix:
                  gate an affordance on what it actually needs, not on the read that
                  happens to sit beside it. This control needs nothing.
                  `.gn-project__header` is rendered unconditionally and all four
                  `list.error` gates sit INSIDE the tab arms below it, so the property
                  holds where it now sits.

                  Which forces the note beside it to NAME THE SURFACES. The control
                  renders on every tab, but it narrows only the reads that take a
                  filter: `useBoard` takes none and cannot be narrowed, so an unscoped
                  "done are excluded" sits on the DEFAULT tab directly above a Done
                  column holding a done card — an unnarrowed set claiming to be
                  narrowed, which is the same class of lie as a narrowed one claiming
                  to be whole and is the reason this control exists.
                */}
                <Switch checked={activeOnly} onChange={setActiveOnly}>
                  Only tickets in progress
                </Switch>
                {/*
                  THE FILTERS BUTTON (Task 5). Task 4's own report left it
                  unrendered on purpose ("An inert Filters button is a button
                  that lies... I chose do not render it yet") because nothing
                  existed yet for it to open. It opens now, wired to the SAME
                  `filter` state the search box and the removable chips already
                  share — never a second filter object. `.gn-button`/
                  `.gn-button--ghost` (unchanged, per the plan's own
                  "Divergences already decided") already renders exactly this
                  metric — `min-height:2.75rem` (44px), `padding:0 1.125rem`
                  (18px), `background:fill-tertiary`, `color:text-accent`,
                  `font-weight:600` — so no new CSS rule is needed for the
                  trigger itself.
                */}
                <button
                  ref={filtersButtonRef}
                  type="button"
                  className="gn-button gn-button--ghost"
                  aria-haspopup="dialog"
                  onClick={() => setFiltersOpen(true)}
                >
                  Filters
                </button>
                {createRegion}
              </div>
            </div>

            {/*
              THE SCOPE NOTE'S OWN STANDING ROW (owner request, 2026-09-23).

              IT USED TO BE THE LAST CHILD OF `.gn-project__header` ABOVE, and every
              time it appeared it moved a control — which is what the owner's two
              screenshots of the live project page show, and what the docblock that
              stood here got wrong. With the switch OFF the controls row (search,
              workflow picker, switch, Filters, New ticket) sits beside the title;
              switching it ON dropped that ENTIRE row under the title, and only then
              wrapped the note inside it.

              THE CAUSE IS INTRINSIC WIDTH, NOT WRAPPING. `.gn-project__header`
              (`ui.css:5831`) is a wrapping flex row, itself the second flex item of
              `.gn-project__head` (`ui.css:5864` — `flex-wrap: wrap;
              justify-content: space-between`) whose first item is
              `.gn-project__identity` (crumb over `<h1>`). **A wrapping flex
              container's max-content contribution to ITS parent is all its children
              on ONE line**: the sentence is ~770 CSS px and the controls ~625 px, so
              with the note present the row's intrinsic width is ~1400 px, it no
              longer fits beside the identity column, and `.gn-project__head` wraps
              the whole row down. The note wraps INSIDE the row only after that has
              already happened. The docblock that stood here described that inner
              wrap — "it takes its own line rather than pushing the switch away from
              the button" — and missed the outer one, which is the one the owner saw.
              It was false, so it is replaced rather than patched.

              WHY NO FREE SPOT EXISTED FOR IT, before settling on a reserved row.
              `.gn-project` (`ui.css:5804`) stacks the head row, the rail and the
              content with `gap: 0.875rem` (14px), and the note is an 18px line — an
              overlay in that gap overlaps the rail. The rail row's free width at the
              owner's viewport (~700 px) is narrower than the sentence, so the note
              cannot sit beside the tabs either. Both were rejected on measurement.

              THE RULING (owner, 2026-09-23): **the note must not move any other
              element when it appears.** Two costs are ACCEPTED and recorded here
              rather than discovered later:
                · a permanent 32px band between the head row and the rail — the
                  14px gap, the reserved 18px line, and the 14px gap again —
                  present whether or not the note says anything;
                · at viewports narrow enough to wrap the sentence onto two lines,
                  the rail shifts down by one line when the switch comes on. Only a
                  two-line reservation would remove that, and the owner scoped it
                  out.

              ⚠ WHERE THAT SECOND COST ACTUALLY BITES — MEASURED 2026-09-23, and
              this docblock said otherwise until it was. The line above used to end
              "the measured cases are 1000 px and 1280 px, where the single line
              holds". **It does not hold at 1000 px.** The note is NOT inside the
              fixed-width content column — that column is 684 px wide and merely
              CENTRES as the viewport grows (`header.left` 295.65 → 575.65 between
              1000 px and 1280 px while `header.width` stays 684.35) — so the note's
              own width tracks the viewport: 960 px at a 1000 px viewport, 1240 px at
              1280 px. The sentence needs somewhere between the two. Measured on the
              stack built from `91a82eefaff4`:
                · 1280 px — note 18 px in both states, rail `top` 248.59 → 248.59.
                  Nothing moves.
                · 1000 px — note 18 → 36 px, rail `top` 248.59 → **266.59**. The rail
                  moves by exactly one line.
              The HEADER rect is identical at both widths in both states, so the
              owner's actual complaint — the note dropping the whole controls row out
              from beside the title — is fixed either way.

              RULED 2026-09-23 (owner): **the 18 px rail shift at ~1000 px is
              ACCEPTED.** Reserving two lines and shortening the sentence were both
              offered and not taken, so the row reserves ONE line and the rail drops
              by one line wherever the sentence wraps. That is the shipped behaviour.
              Do not "fix" it by growing `min-height` on `.gn-project__scope-row`:
              that would reserve the second line at EVERY width, which is the cost
              the owner declined. Case `13.1383` carries the numbers.

              ALWAYS RENDERED, EMPTY WHEN OFF. The `<p>` is in the tree in both
              states and only its TEXT is conditional, so the band is reserved either
              way and the element is the SAME node across the toggle — asserted, not
              assumed, in `13.1381`. `visibility: hidden` is deliberately NOT used:
              there is nothing to hide when the switch is off. The row is EMPTY, not
              invisible, and an empty row cannot be read aloud, clicked or focused.

              THE SENTENCE BEGINS WITH A CAPITAL NOW. It is a standing row rather
              than a fragment hanging off the controls, so it reads as the sentence
              it is. Two places quote it and moved in the same change:
              `page-refusals.test.tsx`'s `12.387` arm and `docs/manual.md`, whose
              quote is compiled into the in-app help corpus.

              `gn-project__scope-note` is KEPT for the type treatment (`ui.css:5948`,
              the muted small print it shares with the board tab's own
              `board-scope-note`); `gn-project__scope-row` is the new reservation,
              declared AFTER it so the shared rule is not edited to make one page
              reserve a line. The `data-testid` is the contract and is unchanged.
            */}
            <p
              className="gn-project__scope-note gn-project__scope-row"
              data-testid="list-filter-note"
            >
              {activeOnly ? 'The list, calendar, timeline and backlog are asking only for tickets in progress — not started and done are both excluded, and the backlog is emptied. The board is not narrowed.' : null}
            </p>

            {/*
              THE SHARED CONTROL ITSELF, not the shared control's CLASSES — and
              that distinction is the whole of exec1 P19.

              This markup used to be a page-local `<div className="gn-segmented"
              role="tablist">` with five hand-written `<button role="tab">`
              children: the same classes and the same roles as the shared
              component, and **no accessible name**, because nothing required
              one. `SegmentedControlProps['aria-label']` is a REQUIRED prop, so
              adopting the component makes an unnamed tablist unrepresentable
              here rather than correcting one instance and leaving the next to
              be forgotten — which is the argument the reviewer made for this
              remedy over adding the attribute.

              **What did NOT change:** the rendered DOM. `SegmentedControl`
              draws `.gn-segmented` / `.gn-segmented__item` /
              `.gn-segmented__item--on`, `role="tablist"` / `role="tab"` and
              `aria-selected`, with the same one-boolean-per-tab derivation —
              so every case scoped to `.gn-segmented` and every `role="tab"`
              query sees exactly what it saw before, plus the name.

              `.gn-view-tabs` NO LONGER EXISTS ANYWHERE IN THE PRODUCT as of
              Task 4 (coordinator Ruling 7) — `globals.css`'s dead rules
              (`:1244`, `:1391-1392`) and the docblock sentence claiming they
              "survive… only on the project page" are removed there. This note
              is kept because the reasons it records are not all stale: the
              class rename it describes is what made `.gn-segmented` the
              selector `project-calendar-timeline.test.tsx` scopes by, and a
              future reader looking for `.gn-view-tabs` should find out here
              that it is gone rather than by searching.

              The rail's ORDER — Backlog first — now lives with the options
              themselves (`PROJECT_VIEW_OPTIONS`), not in this JSX.

              **`gn-project__rail` (owner, 2026-09-22).** The rail is now
              content-sized at the LEFT of its row, as the prototype draws it
              (`desktop.dc.html:340`: an `inline-flex` track, the tabs as wide as
              their labels). Its props are otherwise unchanged and no accessible
              name moved. Until this class existed, the rail rendered as a direct
              child of the `.gn-project` COLUMN, so the track filled that column
              and `.gn-segmented__item`'s `flex: 1` spread the five tabs across
              the whole width. The opt-out rules live in `globals.css` — NOT
              beside `.gn-project__*` in `ui.css`, because
              `packages/ui/test/components.test.tsx` resolves a rule with a
              first-match substring regex over `ui.css` and a descendant selector
              ending in `.gn-segmented__item {` there could become the body its
              `13.1153` cases read. `rel/project-head-prototype`, cases
              `13.1305`–`13.1306`.
            */}
            <SegmentedControl
              // exec1 P19: the rail carried `role="tablist"` and NO accessible
              // name, on the product's primary view switcher. THIS prop is the
              // fix, and the reason the page no longer hand-rolls the markup:
              // `SegmentedControlProps['aria-label']` is REQUIRED, so an unnamed
              // tablist is unrepresentable here rather than merely corrected
              // once. The repo had already applied the same fix to the ticket
              // sheet's tablist, which is what made this page's version a
              // standing outlier.
              aria-label="Project view"
              // owner, 2026-09-22: the rail is content-sized at the left of its
              // row, as the prototype draws it (`desktop.dc.html:340`, an
              // `inline-flex` track). Rendered as a direct child of the
              // `.gn-project` COLUMN, the track fills that column and
              // `.gn-segmented__item`'s `flex: 1` spreads the five tabs across
              // the whole width — the spread in the owner's screenshot. The
              // shared component APPENDS this class (`segmented-control.tsx:123`),
              // so `gn-segmented` and every selector reading it are unchanged;
              // the opt-out rules live in `globals.css`, not `ui.css`, for the
              // first-match reason `apps/web/test/project-page-head.test.tsx`
              // records.
              className="gn-project__rail"
              options={PROJECT_VIEW_OPTIONS}
              value={view}
              onChange={setView}
            />

            {/*
              RULING E2-30 — THE DURABLE WAY BACK FROM A DELETE, rendered as a
              direct child of `.gn-project` so it is on EVERY tab rather than
              inside the one that happened to be open: deleting a ticket removes
              it from the Board, the List, the Calendar and the Timeline at
              once, so the route back belongs to the page and not to a tab.

              `role="status"`, not `alert`: this is a state the page is in, and
              it was entered by the reader's own action — the same choice the
              toast makes, and the reason a screen reader announces it once
              rather than interrupting.

              `data-testid` on both the strip and its Undo, because the toast
              renders an Undo too and a test that matched by role and name alone
              would find two of them.
            */}
            {durableUndo !== null ? (
              <div className="gn-project__deleted" role="status" data-testid="deleted-undo">
                <span className="gn-project__deleted-text">
                  {ticketDurableUndoLine(durableUndo.title, durableUndo.permanent)}
                </span>
                <button
                  type="button"
                  className="gn-project__deleted-undo"
                  data-testid="deleted-undo-button"
                  /*
                    NAMED FOR THE TICKET, and not merely "Undo". The toast is on
                    screen at the same moment and ITS control is called "Undo"
                    too, so two identically-named buttons would be on one page —
                    ambiguous to a screen-reader user and unaddressable by role
                    and name. The visible word stays "Undo" and the accessible
                    name CONTAINS it, so WCAG 2.5.3 (Label in Name) holds; the
                    same containment question the bulk-close button's
                    `Close all (2)` does NOT hold, which is recorded on that
                    control rather than silently repeated here.
                  */
                  aria-label={`Undo the deletion of ${durableUndo.title}`}
                  onClick={() => void restoreDeletedTicket(durableUndo.ticketId, durableUndo.permanent)}
                >
                  Undo
                </button>
                <button
                  type="button"
                  className="gn-project__deleted-dismiss"
                  aria-label="Dismiss the deleted-ticket message"
                  onClick={() => setDurableUndo(null)}
                >
                  ×
                </button>
              </div>
            ) : null}

            {/*
              THE DISCLOSURE STRIP (Step 3/4, the shared mechanism Task 8's
              workflow picker also feeds) — ONE strip, rendered once, with
              PER-TAB inputs since 2026-09-17 (exclude-mode spec §3): Board
              reads `boardNarrowing`/`boardUnappliedAxes` and the picker's own
              chip; List, Calendar and Timeline read
              `listNarrowing`/`listUnappliedAxes` and the filter chips alone.

              UNTIL 2026-09-17 this was Board-tab-only: the count and the
              scope note were both facts about the BOARD's own narrowing, and
              showing them on a tab they said nothing about would have been
              its own small lie. What changed is `matchesListRow`/
              `listNarrowing` making the list's own narrowing exactly such a
              fact, computed once per tab it actually describes — the
              mechanism below generalises rather than being abandoned.

              Gated on having something to disclose, not merely on `view ===
              'board'` — with no active axis at all and nothing hidden, the
              strip renders nothing, so a person who has touched no control
              never sees an empty bar. The moment any of the three terms
              becomes true, the count comes along with it (it lives inside
              the SAME conditional block as the chips and the note), which is
              what keeps the invariant — count and chip, always together —
              true by construction rather than by two authors remembering to
              agree.

              THREE TERMS, not two (Task 4 review, Important finding,
              remedy 2 — `shouldRenderNarrowingStrip` in
              `board-search-scope.ts`): `activeFilterChips.length > 0` and
              `boardUnappliedAxes.length > 0` only cover mechanisms this file
              can NAME — a filter axis, or an axis outside `BoardFilterSpec`.
              `boardNarrowing.shown !== boardNarrowing.total` is independent
              of naming anything: it is true whenever the board actually hid
              a card, for ANY reason, which is what makes this gate correct
              for Task 8's workflow picker — that narrows by dropping whole
              GROUPS, not by setting a filter axis, so no enumeration of axes
              could ever notice it on its own.

              `chipCount` below reads `activeFilterChips.length`, NOT
              `narrowingChips.length` (the list actually rendered two lines
              down ON THE BOARD TAB ONLY — the other three tabs render
              `activeFilterChips` directly and never touch `narrowingChips` at
              all — which also includes `workflowChip` when one is active).
              That is not an oversight: `workflowChip` does not need to be
              counted into this gate for the gate to fire correctly WHENEVER
              A CARD IS ACTUALLY HIDDEN — the third term above already does
              that job by construction, since picking a workflow can only
              ever change `shown`/`total`, never `activeFilterChips`.

              HEDGED (final whole-branch review, Finding 4, 2026-09-16): this
              used to claim counting `workflowChip` in here "would not change
              the gate's answer in any case" — false for one constructible
              case. Pick a workflow that keeps its own cards while an empty
              SIBLING group is dropped: `shown === total` (nothing is
              actually hidden) and the other two terms are already zero, so
              the strip stays closed even though the picker itself is
              non-default. Counting `workflowChip` here WOULD open the strip
              in that case. The invariant this gate exists for still holds
              either way — no card is ever hidden without the strip
              disclosing it — and the `<select>` keeps showing the
              non-default pick regardless of whether the strip renders
              beside it, so nothing is lost; but the old sentence claimed
              more certainty than that.
            */}
            {(() => {
              // Task 10 — THE HAZARD THE PARAGRAPH BELOW WARNS ABOUT,
              // MATERIALIZED. `view` gained a fifth member (`'backlog'`) and
              // this ternary chain — unlike `TAB_NOUN`'s `Record` two lines
              // down — has no compiler to catch a missing arm: without this
              // explicit branch, `'backlog'` would silently fall into the
              // `: listNarrowing` default and the disclosure strip would
              // report the LIST's own narrowing while the Backlog tab was on
              // screen. `unapplied`/`chips` need no matching branch: both
              // already resolve correctly for `'backlog'` through their
              // existing `view === 'board' ? … : …` shape, because the
              // Backlog tab shares the List tab's filter vocabulary exactly
              // (same `FilterSpec`, same `matchesListRow`-driven axes) —
              // `board` is the only OTHER special case either needs.
              //
              // `narrowing` gained a FOURTH branch in Task 11: Calendar and
              // Timeline read `datesNarrowing`, not `listNarrowing` — the
              // further cut that applies the "closed hidden by default" rule
              // those two tabs alone carry (Ruling 44). `unapplied` needs no
              // new branch (`describeUnappliedListAxes` already covers all
              // four non-board tabs identically); `chips` does, to add the
              // Closed axis's own disclosure — see `listFilterChips`/
              // `closedDefaultChip`'s own docblocks above for why that is a
              // SEPARATE list from `activeFilterChips` rather than a change
              // to it.
              const narrowing =
                view === 'board'
                  ? boardNarrowing
                  : view === 'backlog'
                    ? backlogNarrowing
                    : view === 'calendar' || view === 'timeline'
                      ? datesNarrowing
                      : listNarrowing;
              const unapplied = view === 'board' ? boardUnappliedAxes : listUnappliedAxes;
              const chips =
                view === 'board'
                  ? narrowingChips
                  : closedDefaultChip !== null
                    ? [...listFilterChips, closedDefaultChip]
                    : listFilterChips;
              // Controller ruling, Task 10 fix round 1 (amended fix round 2):
              // the scope note names the tab it is actually on, rather than
              // always saying "the board" for List/Calendar/Timeline too. A
              // `Record` over `typeof view` — not a ternary chain — because a
              // ternary falls through to its final `else` for ANY unmatched
              // value, so a fifth `view` member added later would compile
              // unchanged and silently inherit `'timeline'`'s noun, the exact
              // "names the wrong place" defect this note exists to prevent.
              // `view`'s own type is `ProjectTab`, and `typeof view` is what
              // keys this `Record` to it — a `Record<K, V>` requires EVERY
              // member of `K` as a property, so a tab added to that union
              // without a matching entry here fails `typecheck`, not silently
              // at runtime.
              // Proven, not asserted: fix round 2 deleted the `timeline`
              // entry and watched `tsc` reject it; Task 10 is the first REAL
              // addition since, and omitting `backlog` here does fail
              // `tsc` exactly as promised — confirmed by trying it.
              //
              // CORRECTED 2026-09-18 (the remembered tab): this paragraph used
              // to say the union was "an inline union …, not a named alias",
              // and offered that as the reason `typeof view` was the key. The
              // union moved to `use-last-project.ts` when the remembered tab
              // made the page and the hook share one list, so the parenthetical
              // became false. What was load-bearing is unchanged and is the
              // sentence above: `Record<typeof view, string>` demands every
              // member whatever the type is spelled as. The clause is corrected
              // rather than deleted, because a reader who remembers it should
              // find the correction here rather than an absence.
              const TAB_NOUN: Record<typeof view, string> = {
                backlog: 'backlog',
                board: 'board',
                list: 'list',
                calendar: 'calendar',
                timeline: 'timeline',
              };
              const tabNoun = TAB_NOUN[view];
              if (
                narrowing === null ||
                !shouldRenderNarrowingStrip({
                  // `activeFilterChips.length` on the BOARD tab, UNCHANGED
                  // (see `narrowingChips`'s own docblock on why `workflowChip`
                  // is deliberately not counted here). `chips.length`
                  // everywhere else — Task 11's own `closedDefaultChip` is a
                  // MANDATED disclosure (Ruling 44) that can be present while
                  // `shown === total` (nothing in this project happens to be
                  // closed today), so unlike `workflowChip` it is not always
                  // covered by the gate's third term on its own; counting it
                  // here is what guarantees a chip this render actually
                  // building is a chip the strip actually shows.
                  chipCount: view === 'board' ? activeFilterChips.length : chips.length,
                  unappliedAxisCount: unapplied.length,
                  shown: narrowing.shown,
                  total: narrowing.total,
                })
              ) {
                return null;
              }
              return (
                <div className="gn-project__narrowing" data-testid="board-narrowing">
                  <span className="gn-project__count" data-testid="board-narrowing-count">
                    {narrowing.shown} of {narrowing.total} shown
                  </span>
                  {chips.map((chip) => (
                    <span
                      key={chip.key}
                      className={chip.mode === 'exclude' ? 'gn-project__filter-chip gn-project__filter-chip--exclude' : 'gn-project__filter-chip'}
                      data-testid={`board-filter-chip-${chip.key}`}
                    >
                      {chip.mode === 'exclude' ? <ChoiceGlyph mode="exclude" /> : null}
                      {chip.label}
                      <button
                        type="button"
                        className="gn-project__filter-chip-remove"
                        onClick={chip.onRemove}
                        aria-label={`Remove filter — ${chip.label}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {unapplied.length > 0 ? (
                    /**
                     * THE LOCATION CLAUSE — REMOVED (Task 5), NAMES ITS TAB
                     * (controller ruling, Task 10 fix round 1, 2026-09-17).
                     * Task 4 shipped "— set on the list tab, where a ticket
                     * carries the field", written before this sheet existed
                     * and flagged in that task's own report for
                     * re-verification once it landed. It is not re-pointed at
                     * the Filters sheet: on the BOARD, `unapplied` (there,
                     * `boardUnappliedAxes`) can join UP TO FOUR axis names in
                     * one sentence (collaborator, due date, custom field,
                     * closed — the last added Task 11 fix round 2, Ruling 46),
                     * and after Task 5 only ONE of those — collaborator —
                     * has a control anywhere in the product, and it lives in
                     * the Filters sheet, not the list tab. `dueBefore`/
                     * `dueAfter`/`fields` remain unsettable anywhere today (see
                     * `FiltersSheet`'s own docblock). A single trailing clause
                     * cannot name a different true location per axis in a
                     * joined list, and "set in the Filters sheet" would be
                     * right for collaborator today and silently wrong for the
                     * other two the moment either gains a control elsewhere —
                     * exactly the "names the wrong place" failure this task
                     * was asked to avoid. Saying only what is true (the axis is
                     * not applied here) outlives whichever surface next grows a
                     * control for the other two.
                     *
                     * UPDATED Task 11 fix round 2 (Ruling 46): `closed` joined
                     * `describeUnappliedBoardAxes` as a FOURTH board-blind
                     * axis — see that function's own docblock for why it is a
                     * different REASON (the board excludes closed tickets
                     * entirely, rather than lacking a field for them) and why
                     * only `filter.closed === true` triggers it. `closed` DOES
                     * have a control (this task's own Filters-sheet toggle),
                     * so two of these four axes — collaborator and closed —
                     * now have one; `dueBefore`/`dueAfter`/`fields` still have
                     * none.
                     *
                     * On the OTHER three tabs, `unapplied` is
                     * `describeUnappliedListAxes`'s result — collaborator, and
                     * nothing else, is the only axis that function can ever
                     * return (its own docblock in `board-search-scope.ts`:
                     * `matchesListRow` answers the due bounds, field clauses
                     * AND `closed` itself) — so the "UP TO FOUR" reasoning
                     * above is Board-specific; List/Calendar/Timeline can only
                     * ever join a ONE-entry list. `tabNoun` (computed above)
                     * is what keeps the WHERE half of the sentence honest per
                     * tab, the same way `unapplied` keeps the WHAT half
                     * honest per tab.
                     */
                    <span className="gn-project__scope-note" data-testid="board-scope-note">
                      Not applied on the {tabNoun}: {unapplied.join(', ')}.
                    </span>
                  ) : null}
                </div>
              );
            })()}

            {view === 'calendar' ? (
              // The calendar and the timeline read the SAME list as the List
              // tab, so they refuse for the same reason and say which view went
              // missing — never a month grid drawn over `?? []`.
              list.error !== null ? (
                <ShellRefusal what="The calendar" message={list.error} />
              ) : list.rows !== null ? (
                <CalendarView
                  tickets={dateInputs}
                  today={today}
                  userName={nameOf}
                  onOpenTicket={openTicket}
                  /* INERT TODAY, AND KEPT ANYWAY — measured, not assumed.
                     `CalendarView` passes `isEpicType` to `buildCalendarModel`,
                     which reads it at exactly one site: the `laneEpicId` lane
                     filter (`calendar-model.ts:275`, inside `laneEpicId !==
                     undefined && !== null`). This page passes no `laneEpicId`
                     and neither does anything else in `apps/web`. The check,
                     written so it can actually be RUN: every occurrence in
                     `apps/web` source is inside THIS comment, so
                     `grep -rn laneEpicId apps/web/src apps/web/app` must return
                     only comment lines and no JSX prop — four of them today,
                     one being the grep line you are reading. (It said "zero hits"
                     until this comment was written, at which point the sentence
                     falsified itself — a verification instruction that stops
                     being runnable the moment it is recorded is worth no more
                     than the claim it was meant to support. `.next/` also
                     matches, which is build output and gitignored.)
                     So deleting this spread changes NOTHING
                     observable through this page, and app-core's own 11.158
                     says as much: the lane fixture "is the ONLY shape that can
                     witness the forward".
                     So no shell case can kill this mutation, and it is reported
                     as a survivor rather than covered by a test that watches the
                     line instead of its consequence. It stays because
                     `calendar-view.tsx`'s docblock forbids exactly the state
                     deleting it would create: the calendar and the timeline
                     answering differently about one ticket's epic on two tabs of
                     one page. The timeline's forward below IS live (11.165), so
                     dropping this one would build that asymmetry one layer up,
                     to surface silently the day a lane filter is wired. */
                  {...(isEpicType === undefined ? {} : { isEpicType })}
                  /*
                    THE OWNER'S RULING (2026-09-20): *"epics should never show
                    up in the board, timeline and calendar views."* The calendar
                    does not draw an epic's own claimed dates.

                    UNCONDITIONAL, and NOT gated on `isEpicType` resolving: the
                    ruling is a fact about the VIEW, while `isEpicType` is a
                    fact about the roster, and the model's own default
                    (`isBuiltinEpicType`) is narrower than the roster's rule
                    rather than broader — so an epic that the fallback cannot
                    name is one this view would drop ONE RENDER LATER anyway.
                    Gating on the roster would only make the flicker
                    conditional.

                    The calendar has no lane-heading half of this question to
                    answer, and that is measured rather than assumed: nothing in
                    `apps/web` passes `laneEpicId` (the block above records the
                    four-hit grep), so an epic here names no group once its row
                    is gone — there is no heading to keep.
                  */
                  hideEpicRows
                />
              ) : (
                /* exec1's V6, and the same `role` all five of this chain's arms
                   now carry: each tab's read-in-flight state announces itself.
                   This file had ALREADY decided its waits deserve one — the
                   create region carries `role="status"` three times (`:1759`,
                   `:1768`, `:1810`) — and these five were the ones that did not
                   match it, so a screen reader got the words with no
                   announcement on every view but the one. ⚠ **No `aria-live`**,
                   matching those three rather than inventing a second shape for
                   the same job: `role="status"` carries an implicit polite
                   live region, and spelling both would be two sources for one
                   behaviour. The five are asserted by a sweep that PINS the
                   count, because exactly one arm renders at a time and no
                   single mount can see them all. */
                <p role="status">Loading…</p>
              )
            ) : view === 'timeline' ? (
              list.error !== null ? (
                <ShellRefusal what="The timeline" message={list.error} />
              ) : list.rows !== null ? (
                <TimelineView
                  tickets={dateInputs}
                  today={today}
                  userName={nameOf}
                  onOpenTicket={openTicket}
                  /* LIVE, unlike the calendar's above: `timeline-model.ts` reads
                     `isEpicType` for its GROUPING (`timeline-model.ts:310`, the
                     `lane-heading` guard, and `:357`, the `epicAncestorOf` that
                     fills a row's `epicId`) and not only
                     for a lane filter, so a rank-1 predicate reaching here
                     changes the lane heading on screen. Witnessed at 11.165. */
                  {...(isEpicType === undefined ? {} : { isEpicType })}
                  /*
                    THE OWNER'S RULING (2026-09-20), and IN THE TIMELINE THE
                    LANE IS THE HALF THAT STAYS. `hideEpicRows` removes the
                    epic's OWN bar from the grid; `buildTimelineModel` builds
                    `byId` from the complete input set BEFORE `visible` narrows
                    it — *"an ancestor removed by a filter still names the lane
                    its child belongs to"* — so a lane that still holds a dated
                    child keeps its heading, titled with the epic's name.

                    That is the shape the owner ruled for the Backlog's section
                    headers in so many words — *"Row only."* — and the two are
                    ONE rule: **the epic stays visible as a NAME and goes
                    absent as a ticket.** `timeline-model.ts`'s `hideEpicRows`
                    states why reaching the same outcome by dropping epics from
                    `inputs` instead would delete the heading and move every
                    child into "No epic".
                  */
                  hideEpicRows
                />
              ) : (
                <p role="status">Loading…</p>
              )
            ) : view === 'board' ? (
              board.error !== null ? (
                <ShellRefusal what="The board" message={board.error} />
              ) : boardNarrowing !== null ? (
                // `boardNarrowing.view`, never `board.data` — the grid and the
                // `N of M shown` count above must read the SAME narrowed
                // groups (Ruling 1), and this is the one render site that
                // proves it: there is no second `board.data.groups` walk
                // anywhere on this page.
                //
                // `isNarrowed` (Ruling 19, board-prototype-port Task 7 fix,
                // 2026-09-16): `shown !== total` is the SAME expression
                // `shouldRenderNarrowingStrip` above already reads as one
                // of its three terms, not a second definition of "narrowed" —
                // true exactly when the filter actually dropped a card, which
                // (since narrowing drops cards only, never columns or groups)
                // is also exactly when `total > 0` while the cards `Board`
                // can see have been cut to `shown`. Without this, `Board`'s
                // own R6 sentence cannot tell "this project truly has no
                // tickets" from "a filter hid all of them" and says "create
                // one" for both — see `Board`'s own `isNarrowed` docblock.
                <Board
                  board={boardNarrowing.view}
                  onOpenTicket={openTicket}
                  /*
                    WHO the board remembers its collapse choices for. The
                    record is `localStorage`, keyed by this id and the
                    project — see `preferences/workflow-collapse.ts`. `''`
                    when signed out (`currentUserId`'s own declaration above
                    names the sentinel), and the storage module reads and
                    writes nothing for it, so a signed-out board shows
                    defaults and remembers nothing rather than remembering it
                    for whoever signs in next on this machine.
                  */
                  currentUserId={currentUserId}
                  /*
                    V1 (round-2 ruling, 2026-09-21) — the empty state's create
                    affordance, wired to the SAME `CreateTicketFlow` the header
                    renders. Gated on the same conditions that control whether
                    that flow is OFFERED at all: the flow is not rendered when
                    the types read refused or the session is not signed in, so
                    the banner must not offer a button in those states either —
                    and `emitting`/`session` are read here rather than
                    re-derived, so the two doors cannot disagree about when
                    creation is available.

                    AMENDED (starting-status design, 2026-09-23): `selection`
                    is now a column's own `{workflowId, stateId}` when the
                    click came from an empty COLUMN's "Add a ticket", or
                    `undefined` from the empty-BOARD button — `Board` calls
                    with none there, unchanged. `setCreateSelection` stores it
                    for `CreateTicketFlow`'s `initialSelection` to read; a
                    `null` (never overwritten by an unscoped open) is what a
                    header-opened dialog reads as "no selection".
                  */
                  {...(canCreate
                    ? {
                        onCreateTicket: (selection?: { workflowId: string; stateId: string }) => {
                          setCreateSelection(selection ?? null);
                          setCreateOpen(true);
                        },
                      }
                    : {})}
                  isNarrowed={boardNarrowing.shown !== boardNarrowing.total}
                  /*
                    WHICH OF THE TWO EMPTY SENTENCES (owner ruling, 2026-09-20). True
                    only when the epic rule removed cards — the fold above counts them,
                    and nothing else here can: `Board` receives the narrowed view, and
                    `isNarrowed` is false for an all-epic board BY DESIGN (#602 does not
                    call the epic drop a narrowing). A project that is simply empty
                    passes `false` and keeps "No tickets here yet — create one."
                  */
                  epicsHidden={boardNarrowing.epicsDropped > 0}
                  /*
                    RULING E5-2 — the board's one relation to the present. The
                    SAME `today` the Calendar and Timeline tabs are handed two
                    blocks up: one `istToday()` per render, so the three views
                    cannot disagree about which day it is. `Board` draws the
                    late tone from it and draws nothing extra without it (its
                    own `BoardProps.today` docblock).
                  */
                  today={today}
                  /*
                    THE MOVE ARROWS' CAPABILITY (board-prototype-port Task
                    13). Gated on `session.kind === 'signed-in'`, the SAME
                    precedent `createRegion` above already sets for
                    `CreateTicketFlow` and for the identical reason spelled
                    out at `currentUserId`'s own declaration: a click landing
                    in the load window, or from a signed-out viewer, would
                    build `makeSubmittedFactory({actorId: '', ...})` and post
                    an event with an empty actor — the door refuses it as a
                    permission problem when the truth is "not signed in yet",
                    the exact wrong-sentence failure that fix already exists
                    to prevent. `undefined` here is what `Board`'s own
                    `moves?` treats as the capability being entirely absent —
                    no arrows drawn, not dead ones with no session behind
                    them (`board.tsx`'s own `BoardMoveCapability` docblock).

                    `onMoved: board.reload` mirrors `TicketSheet.
                    submitTransition`'s own `read.reload()` call: an
                    immediate reload rather than relying solely on
                    `useLiveQuery`'s debounced stream refetch, which can lag
                    up to 200ms behind a move the person just watched
                    succeed.
                  */
                  {...(session.kind === 'signed-in'
                    ? {
                        moves: {
                          dataSource,
                          workspaceId,
                          currentUserId,
                          onMoved: board.reload,
                          cache,
                          /*
                            THE EVIDENCE UPLOAD — the sixth thing this page
                            passes to a board capability, and the one that makes
                            a `require-evidence` transition POSSIBLE rather than
                            permanently blocked.

                            `BoardMoveCapability.uploadEvidence` takes a
                            `ticketId` because one capability serves every card
                            (`MoveArrows` binds it per card); the upload itself
                            is the shipped `POST /v1/attachments` through the
                            shipped client, so no route is added and nothing
                            here speaks HTTP directly.
                          */
                          uploadEvidence: (file: File, ticketId: string) =>
                            uploadAttachmentHttp(file, ticketId),
                        },
                      }
                    : {})}
                />
              ) : (
                <p role="status">Loading…</p>
              )
            ) : view === 'backlog' ? (
              // Task 10 (backlog/closed spec §5.4) — the Backlog tab. Same
              // refusal/loading shape every other arm on this page uses;
              // `backlogNarrowing !== null` implies `list.rows !== null` and
              // `listNarrowing !== null` (its own docblock, above), so this
              // gate is complete on its own.
              list.error !== null ? (
                <ShellRefusal what="The backlog" message={list.error} />
              ) : backlogNarrowing !== null ? (
                <>
                  <TicketList
                    // THE SAME NARROWING WORD THE LIST TAB PASSES — not a
                    // Backlog-specific vocabulary. The brief's own words
                    // ("narrowing word as the List's"): the Backlog tab shares
                    // the List tab's `FilterSpec` and its `matchesListRow`-driven
                    // axes exactly, so whether "your filters" is in force is one
                    // fact, not two — this is the identical expression the List
                    // arm below computes, read against `listNarrowing` (not
                    // `backlogNarrowing`) on purpose, so the word names what the
                    // FILTER did, the same word on both tabs, while `rows` still
                    // narrows each tab to its own subset.
                    {...(() => {
                      const word = listNarrowingWord(
                        activeOnly,
                        shouldRenderNarrowingStrip({
                          chipCount: activeFilterChips.length,
                          unappliedAxisCount: listUnappliedAxes.length,
                          shown: listNarrowing?.shown ?? 0,
                          total: listNarrowing?.total ?? 0,
                        }),
                      );
                      return word === undefined ? {} : { narrowing: word };
                    })()}
                    rows={backlogRows}
                    currentUserId={currentUserId}
                    prefs={list.prefs}
                    onPrefsChange={list.setPrefs}
                    prefsEditable={list.canSetPrefs}
                    prefsError={list.prefsError}
                    labels={labels}
                    onOpenTicket={openTicket}
                    emptyCopy={
                      /*
                        THREE CASES NOW, and the FIRST one is the toggle (E5-40,
                        2026-09-21). `activeOnly` writes `stateCategories: ['active']`
                        into the server read, so with it on the backlog is empty for a
                        reason no fold in this file can see: `backlogNarrowing` is
                        computed from the ALREADY-narrowed `list.rows`, where both
                        `shown` and `total` read 0 and `epicsOnly` is false. The
                        original sentence was therefore rendered over a backlog that
                        may hold plenty. The toggle's own state is known HERE, so the
                        choice is made here, and the sentence it picks is true whether
                        or not anything sat behind the toggle.

                        Below it, the same two cases as the Board, one tab over (owner
                        ruling, 2026-09-20): `TicketList` is handed only the surviving
                        rows, so it cannot tell a backlog that holds nothing from one
                        whose only tickets are epics — the fold above answers that one
                        where both sets exist.
                      */
                      activeOnly
                        ? BACKLOG_EMPTY_ACTIVE_ONLY_COPY
                        : backlogNarrowing.epicsOnly
                          ? BACKLOG_EMPTY_EPICS_COPY
                          : BACKLOG_EMPTY_COPY
                    }
                    /*
                      THE START CAPABILITY, gated on `session.kind ===
                      'signed-in'` — the same precedent `createRegion` and the
                      board's own `moves` prop already set (`currentUserId`'s
                      own declaration, above): a click landing before the
                      session resolves, or from a signed-out viewer, would
                      build an event with an empty `actorId`
                      (`BacklogStartButton`'s own docblock on why it takes
                      `currentUserId` at all). Omitted entirely rather than
                      passed with a blank actor — no trailing column renders
                      for a signed-out viewer, matching `TicketList`'s own
                      `rowAction`-absent default.

                      `startTargetFor` resolves the target PER ROW (Ruling 42);
                      `backlogWorkflowDefs.data ?? new Map()` is the empty
                      answer while that fetch is in flight, which
                      `startTargetFor` reads as `null` — Start renders
                      disabled, never as licence to submit `{to: null}`.
                    */
                    {...(session.kind === 'signed-in'
                      ? {
                          rowAction: (row: ListRow) => (
                            <>
                              <BacklogStartButton
                                row={row}
                                toStateId={startTargetFor(row, ticketTypes.data ?? [], backlogWorkflowDefs.data ?? new Map())}
                                dataSource={dataSource}
                                workspaceId={workspaceId}
                                currentUserId={currentUserId}
                                onStarted={list.reload}
                              />
                              {/*
                                The rank controls sit in the SAME row action as
                                Start, and are gated by the same `session.kind`
                                check for the same reason: a rank event carries an
                                `actorId`, so a signed-out viewer must not be
                                offered the button. `sorted` is `backlogRows` — the
                                array the table is drawing — so the neighbours a
                                move computes are read off the order on screen.
                              */}
                              <BacklogRankControls
                                row={row}
                                sorted={backlogRows}
                                dataSource={dataSource}
                                workspaceId={workspaceId}
                                currentUserId={currentUserId}
                                onRanked={list.reload}
                                onOptimistic={applyRankOverride}
                              />
                            </>
                          ),
                        }
                      : {})}
                    /*
                      THE DRAG IS GATED ON THE SAME SESSION CHECK AS THE BUTTONS,
                      and for the identical reason: a drag ends in
                      `ticket.ranked`, whose envelope carries an `actorId` built
                      from `currentUserId`. Wiring it for a signed-out viewer
                      would offer the write door with an empty actor — the hazard
                      `BacklogStartButton`'s own docblock names (case 3.144), and
                      the buttons above are unreachable for that viewer for
                      exactly this cause. So the two affordances appear and
                      disappear together.
                    */
                    {...(session.kind === 'signed-in' ? { rowDrag: { onReorder: onReorderBacklogRow } } : {})}
                  />
                  {rankNotice !== null ? (
                    <p
                      role="alert"
                      className={
                        rankNotice.channel === 'server'
                          ? 'gn-refusal gn-refusal--server'
                          : writeFailureRefusalClass(rankNotice.text)
                      }
                    >
                      {rankNotice.text}
                    </p>
                  ) : null}
                </>
              ) : (
                <p role="status">Loading…</p>
              )
            ) : list.error !== null ? (
              <ShellRefusal what="The ticket list" message={list.error} />
            ) : list.rows !== null && listNarrowing !== null ? (
              <TicketList
                // THE WORDS, not a flag (exclude-mode spec §3, since
                // 2026-09-17): the summary has to say WHICH narrowing is in
                // force, now that TWO can be at once — the server-side
                // "active only" toggle and the client-side filter that
                // reaches this tab as of this task. `listNarrowingWord` names
                // either, both (joined), or neither; `undefined` is what
                // makes the unnarrowed count still read as the project's
                // own. The second argument calls the SAME
                // `shouldRenderNarrowingStrip` gate the strip above uses for
                // this tab, so the summary word and the strip's own
                // visibility agree BY CONSTRUCTION — one gate, not two hand-
                // written copies of it that could drift apart. Its third
                // term (`shown !== total`) is why this is not just
                // `listUnappliedAxes`/`activeFilterChips`: those two alone
                // would miss the ONE list-only mechanism that can narrow with
                // neither: a `dueBefore`/`dueAfter`/`fields` clause set with
                // no chip and no unapplied-axis entry (both are list-shaped
                // enumerations).
                {...(() => {
                  const word = listNarrowingWord(
                    activeOnly,
                    shouldRenderNarrowingStrip({
                      chipCount: activeFilterChips.length,
                      unappliedAxisCount: listUnappliedAxes.length,
                      shown: listNarrowing.shown,
                      total: listNarrowing.total,
                    }),
                  );
                  return word === undefined ? {} : { narrowing: word };
                })()}
                rows={listNarrowing.rows}
                // `''` while the session resolves or when signed out, and here
                // that is harmless and deliberate: this prop drives only the
                // *Recently assigned* pin, so an unknown viewer pins nothing.
                // It reaches no write door from this component.
                currentUserId={currentUserId}
                prefs={list.prefs}
                onPrefsChange={list.setPrefs}
                // `setPrefs` returns silently while the preferences document has not
                // loaded — it will not PUT a partial document over the rest of the
                // user's arrangements. Passed through, the controls are DISABLED in
                // that window instead of accepting a click that does nothing.
                prefsEditable={list.canSetPrefs}
                prefsError={list.prefsError}
                labels={labels}
                onOpenTicket={openTicket}
                /*
                  THE BULK-CLOSE CAPABILITY (second wave Task 11, spec §8.3),
                  gated on `session.kind === 'signed-in'` — the same precedent
                  the board's `moves`, the Backlog tab's `rowAction` and
                  `rowDrag` all set (`currentUserId`'s own declaration, above):
                  a `ticket.closed` built from an empty `actorId` reaches
                  `POST /v1/events` and is refused by `checkRolePermission`
                  (`env.actorId !== ctx.sessionUserId`) — case 3.144's defect,
                  which tells the person about their permissions when the truth
                  is that this browser never said who they were. Omitted
                  entirely rather than passed inert, so a signed-out viewer gets
                  neither the column NOR the arming button (13.649) — and since
                  2026-09-22 the BUTTON is the evidence for that, because a
                  signed-in viewer also has no column until they arm.
                */
                {...(session.kind === 'signed-in' && bulkArmed
                  ? {
                      selection: {
                        selected: selectedIds,
                        onToggle: (ticketId: string) =>
                          setSelectedIds((current) => {
                            const next = new Set(current);
                            if (next.has(ticketId)) next.delete(ticketId);
                            else next.add(ticketId);
                            return next;
                          }),
                      },
                    }
                  : {})}
                {...(session.kind === 'signed-in'
                  ? {
                      /*
                        THE BULK-CLOSE MODE, ONE ACTION WEARING TWO LABELS
                        (owner request, 2026-09-22). Not armed: `Bulk close`,
                        enabled, which clears whatever selection the last run
                        left and arms. Armed: `Confirm close (N)` — the same
                        control, gated on `canBulkClose` — with a 44px ✕ beside
                        it whose accessible name is `Cancel bulk close`.

                        THE ARMING CLICK CLEARS FIRST. Without
                        `setSelectedIds(new Set())` a second arming would show
                        the previous run's ticks, and 13.1332's `Confirm close
                        (0)` after a cancel could not tell "the set was cleared"
                        from "the column was hidden" — the two are the same
                        pixels, so the clear has to happen where the mode does.
                      */
                      controls: (
                        <span className="gn-list__bulk">
                          {bulkArmed ? (
                            <>
                              <button
                                type="button"
                                className="gn-list__bulk-close"
                                disabled={!canBulkClose}
                                /*
                                  THE SNAPSHOT, and the guard, in one write.
                                  `current ?? …` is 13.795's refusal:
                                  `BulkCloseDialog`'s reset is an effect keyed
                                  on `open`, so writing a second selection into a
                                  non-null `pendingClose` swaps the dialog's
                                  `tickets` with no transition, and the previous
                                  opening's `closedIds`/`failures` survive
                                  against a list they do not describe. The
                                  reachable path is a keyboard one (`Dialog`
                                  ships no focus trap or portal — recorded as a
                                  named follow-on on the shared component, not
                                  repaired from here); jsdom does not hit-test
                                  the scrim, so the case drives it with an
                                  ordinary click.

                                  `.map` over the ROWS, not over the set: the
                                  order is the list's own, which is the order
                                  the dialog lists the titles in, and the batch
                                  is built in that order — the core's Ruling 37
                                  shape, where position i of the answer
                                  describes position i of the request.
                                */
                                onClick={() =>
                                  setPendingClose(
                                    (current) =>
                                      current ??
                                      listSelectedRows.map((row) => ({
                                        ticketId: row.ticketId,
                                        title: row.title,
                                      })),
                                  )
                                }
                              >
                                {`Confirm close (${listSelectedRows.length})`}
                              </button>
                              <button
                                type="button"
                                className="gn-list__bulk-cancel"
                                aria-label="Cancel bulk close"
                                /*
                                  THE GLYPH CARRIES NO NAME. `RemoveIcon` is an
                                  `aria-hidden` SVG, so the button's accessible
                                  name is exactly the `aria-label` above —
                                  asserted, because the alternative (the ✕ as
                                  text) would put "×" in front of a screen
                                  reader's "Cancel bulk close".
                                */
                                onClick={() => {
                                  setBulkArmed(false);
                                  setSelectedIds(new Set());
                                }}
                              >
                                <RemoveIcon />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="gn-list__bulk-close"
                              onClick={() => {
                                setSelectedIds(new Set());
                                setBulkArmed(true);
                              }}
                            >
                              Bulk close
                            </button>
                          )}
                        </span>
                      ),
                    }
                  : {})}
              />
            ) : (
              <p role="status">Loading…</p>
            )}
          </div>
        )}
      </div>

      {openTicketId !== null && !expired ? (
        // KNOWN AND NOT FIXED HERE: `TicketSheet` also builds submitted events
        // from `currentUserId`, so the empty-actor window this page's create flow
        // no longer has still exists inside the sheet
        // (`packages/app-core/src/views/ticket-sheet.tsx`). Closing it is a change
        // to that component's contract — it would have to take a session state
        // rather than an id — and this fix round is scoped to the create flow the
        // review measured. Recorded so the next reader does not read the gate
        // above as covering the whole page.
        <TicketSheet
          {...peopleProps(people, workspaceId)}
          dataSource={dataSource}
          cache={cache}
          workspaceId={workspaceId}
          ticketId={openTicketId}
          currentUserId={currentUserId}
          /*
            THE ATTACHMENTS — the prop this mount never passed, for the same
            reason `editorSlot` above was never passed: nothing served the read,
            so the sheet's list could only ever be empty. It is served now (the
            route beside the events door) and `openTicketAttachments` reaches it
            through the amendment-10 seam; the page speaks no HTTP for it.

            `attachmentsUnavailable` travels BESIDE the entries rather than
            instead of them, so the two states stay apart all the way to the
            screen: `data` is `[]` for a ticket with no files (drawn as nothing,
            which `AttachmentList` does by design), and a failed read hands down
            its reason, which the sheet draws as a sentence. Passing `data`
            alone would have folded them together here, on the last hop.
          */
          attachments={openTicketAttachments.data ?? undefined}
          attachmentsUnavailable={openTicketAttachments.error ?? undefined}
          onClose={closeTicket}
          /*
            THE REAL EDITOR — the prop this mount never passed, which is why the
            description was read-only on the web (`docs/product-coverage-map.md`
            C3) and why `packages/editor/src/components/TicketEditorSlot.tsx`
            recorded its end-to-end proof as OWED: *"an actual `<TicketSheet
            editorSlot={TicketEditorSlot} />` in an app that legitimately depends
            on both packages"*, which `apps/web` did not. This is that proof, and
            the branch that carries it adds the dependency edge.

            Plan 6 declares the arrangement in the same words
            (`docs/superpowers/plans/2026-08-20-06-web-client.md:5667`): *"Plan 7
            ships a Tiptap-backed `EditorSlotComponent` and `apps/web` passes it
            into `TicketSheet` — no mount point changes."*

            It is passed UNCONDITIONALLY and the sheet decides what it means: a
            caller that mounted no editor gets the read-only fallback, and one
            that mounted this one gets a composer. `apps/web` does not gate it on
            anyone's role — the ingest door is the only party that knows, which
            is the argument `canSetVisibility` states at length.
          */
          editorSlot={TicketEditorSlot}
          queryTickets={queryTickets}
          resolveTicketHref={resolveTicketHref}
          /*
            THE SHEET'S BREADCRUMB NAMES. Both are already computed above for
            this page's own header (`:174-175`) and already rendered there
            (`:1611-1614`), so this passes values the page holds rather than
            asking the sheet to fetch them — `TicketRead` carries no workspace
            or project name, and there is no `getProjects` on `DataSourceQuery`.
            See `TicketSheetProps.workspaceName` for the measurement and for why
            a `null` draws no crumb rather than an id.
          */
          workspaceName={workspaceName}
          projectName={projectName}
          /*
            WHERE THE TWO CRUMBS GO — the locations this page already knows
            (owner request, 2026-09-22: *"the workspace and the project should
            also be clickable from the breadcrumb"*). The sheet renders them as
            `<a href>` and cannot import Next's `Link`, so the router comes in
            beside them; the component's own suite holds the click rules.

            ⚠ `scroll` IS FALSE FOR THE PROJECT CRUMB AND TRUE FOR THE
            WORKSPACE'S, and that difference is the owner's other report:
            opening or closing the sheet was scrolling the page to the top,
            because Next 15's `router.push(href)` scrolls by default (measured
            in the running app: `scrollY` 600 → 0 on a default push, 600 → 600
            with `{ scroll: false }`). The project crumb pushes the path this
            page is ALREADY on — it closes the sheet by leaving `?ticket=`, the
            same navigation `closeTicket` makes — so scrolling would jump to the
            top of the page the reader is still reading. The workspace crumb
            leaves for another page, where opening at the top is what a reader
            expects, so it keeps the default.
          */
          workspaceHref={`/w/${workspaceId}`}
          projectHref={`/w/${workspaceId}/p/${projectId}`}
          onNavigate={(href) =>
            router.push(href, { scroll: href !== `/w/${workspaceId}/p/${projectId}` })
          }
          /*
            THE EVIDENCE UPLOAD. The sheet has accepted this prop all along
            (`TicketSheetProps.uploadEvidence`) and forwarded it to its own
            `TransitionDialog` (`ticket-sheet.tsx`); THIS CALL SITE never passed
            it, so the dialog fell to its fallback — *"Evidence upload is not
            available in this build yet"* — and every `require-evidence`
            transition was refused with no way to satisfy it. That sentence was
            TRUE about the build it described and is false about this one.

            The sheet is mounted for ONE ticket, so the closure binds it here;
            `TransitionDialog`'s own prop takes no ticket and never learns what
            one is. The upload is the shipped `POST /v1/attachments` through the
            shipped client — no route is added and nothing here speaks HTTP.
          */
          uploadEvidence={(file: File) => uploadAttachmentHttp(file, openTicketId)}
          /*
            THE COMMENT COMPOSER'S UPLOADER — the same shipped helper, bound to
            the same ticket, and the ONE prop the description editor deliberately
            does not get.

            A comment's files ARE its own document's embeds (`read/ticket-comments.ts`
            carries the measurement: the ledger holds no attachment→comment
            link), so an upload in the comment box is not a side effect — it is
            the only way a file can become part of a comment at all. Without this
            prop `TicketEditorSlot.uploadOrRefuse` refuses every drop with *"this
            editor was mounted without an uploader"*, and the chip row this read
            exists to serve could only ever be empty.
          */
          uploadAttachment={(file: File) => uploadAttachmentHttp(file, openTicketId)}
          /*
            THE PARENT CHIP'S DOOR. The sheet draws `Subtask of {parent}` on a
            ticket that is itself a subtask and has no way to open it: that needs
            the parent's PROJECT, and `ParentRef` — the only thing the chip is
            built from — carries `{kind, id, title}` and no project. So the shell
            supplies the one thing the sheet cannot compute. See
            `openParentTicket` above; it is the same locator the inbox opens
            notifications with, asked the same question.
          */
          onOpenTicket={openParentTicket}
          /*
            THE SOFT DELETE'S NARRATION. The sheet emits `ticket.deleted`, closes
            itself, and calls this on `committed` only — so a refused or
            unanswered delete leaves the sheet up with its own notice and this is
            never called. What it hands back is the ticket's human name — its
            `key` when the workspace has a prefix, its title when it does not —
            which is the same expression the sheet's own breadcrumb uses, and
            never an id. ⚠ **This comment read "the ticket's TITLE ... this
            product has no ticket key (a ULID is not something a person reads
            back)", and the KEY had shipped thirteen minutes before it:**
            `ac18f2bc` landed ticket keys on 2026-09-20 at 13:04:40 IST, and
            this comment's own commit `18d7e391` is at 13:17:51. The
            prototype's own toast — `"GN-1183 deleted · …"` — is what the
            sentence now reproduces wherever a key exists. The reading was what
            was wrong, not the interpolation. See
            `TicketSheetProps.onDeleted`.
          */
          onDeleted={(ticketId, name, { permanent }) => {
            setDeleteNotice({
              /*
                ⚠ THE SENTENCE NAMES THE DURABLE ROUTE (ruling E2-30, 2026-09-21).
                It read `${title} deleted · its history is retained` — TRUE of
                the ledger, and MISLEADING about what the person can do, because
                the retained history had no screen: no deleted view, no filter
                axis, no search arm. A sentence that promises a record nobody
                can reach is worse than one that says nothing, and the fix the
                finding asks for is exactly this: name where the way back is.
                The route named is real from the same moment — the strip below
                is rendered with this toast, not after it.
              */
              message: ticketDeletedToast(name, permanent),
              undoFor: ticketId,
              permanent,
            });
            // One slot: a second delete replaces the first ticket's strip, the
            // same one-slot rule the toast above keeps. Said plainly on the
            // strip's own sentence, so nobody is told a ticket is still
            // reachable when it has been superseded.
            setDurableUndo({ ticketId, title: name, permanent });
            /*
              ⚠ BOTH READS ARE RE-ASKED HERE, and the deletion's correction must
              not depend on the stream. **Found by independent review
              (2026-09-20): this handler used to only set the notice, while
              `restoreDeletedTicket` reloaded — so with the `/v1/stream` socket
              absent the list still showed a row the toast had just said was
              deleted, and nothing in the tree covered it** (the web stub's list
              is static, so no test could have seen it).

              `list.reload()` rather than `reloadListClearingSelection()`: the
              selection is a claim on rows the reader CHOSE, and deleting one
              ticket through the sheet does not invalidate the others. The
              restore below takes the same pair for the same reason, so the two
              halves of one gesture cannot drift apart again.
            */
            list.reload();
            board.reload();
          }}
        />
      ) : null}

      {/* The chip's failure arm, IMMEDIATELY below the sheet rather than in some
          page-level slot: this is where the action was taken, which is the same
          placement rule the roster's role-change refusal states. It renders on
          the page rather than inside the sheet because the sheet is not the
          thing that failed — the shell's own navigation is. */}
      {parentOpenNotice !== null ? (
        <p
          role="alert"
          className={
            parentOpenNotice.channel === 'server'
              ? 'gn-refusal gn-refusal--server'
              : 'gn-refusal gn-refusal--transport'
          }
        >
          {parentOpenNotice.text}
        </p>
      ) : null}

      {/*
        THE HERITAGE OF THE SHEET'S DELETE. It is mounted HERE, on the page,
        because the sheet that caused it is unmounted by the time it can render —
        `TicketSheet.deleteTicket` closes itself on `committed`, and an undo
        offered inside a component that just removed itself is not an undo. The
        inbox's bulk action records the same reasoning from the other side
        (*"the toast is `position: fixed`, so its place in the tree is …"*).
        Position in this subtree is therefore irrelevant to how it LOOKS and load-
        bearing only for surviving the arms above it.

        `undoFor` is the whole state machine: present means an Undo is offered,
        `null` means the notice only informs. The key is `undoFor` so that a
        second delete inside the first toast's 15 s window is a NEW toast with a
        fresh window — the inbox's own reason for keying its toast on the action,
        and its one-slot cost is the prototype's too.
      */}
      <Toast
        key={deleteNotice?.undoFor ?? deleteNotice?.message ?? 'none'}
        open={deleteNotice !== null}
        message={deleteNotice?.message ?? ''}
        undo={
          deleteNotice?.undoFor != null
            ? { onUndo: () => void restoreDeletedTicket(deleteNotice.undoFor as string, deleteNotice.permanent) }
            : null
        }
        onDismiss={() => setDeleteNotice(null)}
      />

      {/*
        Rendered unconditionally on `expired` (matching `TicketSheet` just
        above) — harmless, since the trigger that could ever set
        `filtersOpen` true only exists inside the `!expired` branch, and the
        component's own `if (!open) return null` gate means `expired`
        toggling can never leave it mounted with nothing behind it.
      */}
      <FiltersSheet
        open={filtersOpen}
        onClose={closeFilters}
        filter={filter}
        setFilter={setFilter}
        members={members.data}
        membersError={members.error}
        typeOptions={typeOptions}
        typesError={ticketTypes.error}
        typesPending={ticketTypes.data === null}
        boardStateOptions={boardStateOptions}
        boardLoaded={board.data !== null}
        boardError={board.error}
      />

      {/*
        THE LIST'S BULK CLOSE (second wave Task 11, spec §8.3). One dialog, the
        same one the Board's `Close all (N)` mounts — `BulkCloseDialog`'s own
        docblock says so in its own words ("The two bulk surfaces that consume
        it — Task 10's … Task 11's …"); the phrase "one dialog, two surfaces,
        one batch" is the PLAN's seams-list wording, and an earlier draft of
        this comment put it in quotation marks as the docblock's, which an
        independent review measured false — and it lives HERE
        rather than inside `TicketList` for the reason the whole arm's state
        does: the snapshot must outlive a reload of the list, and a dialog owned
        by the component whose rows are being reloaded could not.

        `open` is `pendingClose !== null` and `tickets` is that same snapshot,
        which is what makes the partial outcome readable: the reload clears the
        SELECTION without touching either.

        `onClosed` reloads unconditionally and releases the snapshot only on a
        COMPLETE close. `closedIds.length === current.length` compares against
        `current` — the snapshot as it stands — rather than against a captured
        `pendingClose`, because the updater form is the one reading React has
        not already closed over: a stale `pendingClose` here would release a
        dialog the person is still reading.
      */}
      <BulkCloseDialog
        open={pendingClose !== null}
        tickets={pendingClose ?? []}
        dataSource={dataSource}
        workspaceId={workspaceId}
        currentUserId={currentUserId}
        onClose={() => setPendingClose(null)}
        onClosed={(closedIds) => {
          reloadListClearingSelection();
          setPendingClose((current) =>
            current !== null && closedIds.length === current.length ? null : current,
          );
        }}
      />
    </main>
  );
}

/** `stateCategorySchema`'s three values (`packages/domain/src/workflow.ts`), fixed and ordered — never derived from a fixture's own key order. */
const STATE_CATEGORIES: readonly StateCategory[] = ['open', 'active', 'terminal'];
const STATE_CATEGORY_LABELS: Record<StateCategory, string> = {
  open: 'Open',
  active: 'Active',
  terminal: 'Terminal',
};

/**
 * RULING 13's own regression: "Clear all" (Ruling 12's fix) cleared a
 * DIFFERENT six than its own docblock and both commit messages claimed —
 * `collaboratorIds` (not a `BoardFilterSpec` axis) IN, `projectIds` (one of
 * the six, with a working chip) OUT — because the set existed only as a
 * hand-typed object literal inside `clearAll`, with nothing else in the file
 * checking it against the axes it was supposed to name. Exported as ONE
 * array so `clearAll` and `filters-sheet.test.tsx` read the SAME list rather
 * than two independently hand-typed copies — the exact mechanism that
 * produced the wrong six twice. The six `BoardFilterSpec` fields
 * (`buildFilterChips`'s own domain) plus `collaboratorIds` (this
 * sheet's one board-blind axis, which discloses through the scope note
 * rather than a chip — see `FiltersSheet`'s own docblock) — plus `exclude`
 * (exclude-mode spec §4, 2026-09-17): the whole exclude half, so "Clear all"
 * clears what the tri-state controls set in EITHER direction. `closed`
 * (Task 11) joined the same list for the same reason as every other member:
 * the set's own criterion is "every axis the narrowing strip's chips can
 * represent" (Ruling 12), and `board-filter-chip-closed`'s own "Remove
 * filter — Closed: …" button is exactly that since `buildFilterChips` grew
 * a `closed` branch — without it, "Clear all" would leave an explicit
 * `filter.closed` in place, the control would still read
 * `Closed, included`/`Closed, excluded`, and the chip would survive: Ruling
 * 12's own defect, on the one axis added since Ruling 13 had to re-fix it.
 * `clearFilterAxes` writes `closed: undefined` here, not the cycler's own
 * delete-the-key idiom (`withCycledClosed`'s "off" branch) — no special case
 * needed, since `closedMode` maps `undefined` to `'off'` either way and every
 * other axis in this array is already reset the same "set to undefined"
 * way, never deleted.
 */
export const FILTERS_SHEET_CLEARABLE_AXES = [
  'text',
  'assigneeIds',
  'typeIds',
  'stateIds',
  'stateCategories',
  'projectIds',
  'collaboratorIds',
  'closed',
  'exclude',
] as const satisfies readonly (keyof FilterSpec)[];

/**
 * Resets every axis named in `FILTERS_SHEET_CLEARABLE_AXES` to `undefined`,
 * leaving every other `FilterSpec` field untouched. A separate function
 * (rather than inlined in `clearAll`) so it can be unit-tested directly
 * against a `FilterSpec` carrying `projectIds` — a shape no control on this
 * page can currently produce through the UI, which is exactly why Ruling
 * 13's gap went unnoticed until the coordinator's review read the code
 * axis-by-axis rather than trusting the docblock.
 */
export function clearFilterAxes(filter: FilterSpec): FilterSpec {
  const next: FilterSpec = { ...filter };
  for (const axis of FILTERS_SHEET_CLEARABLE_AXES) {
    // Every `FilterSpec` field is optional, so `undefined` is a legal value
    // for every one of them — the cast exists only because TypeScript
    // cannot narrow an assignment made through a `keyof` union spanning
    // fields of different types, not because this could ever be unsafe.
    (next as Record<keyof FilterSpec, unknown>)[axis] = undefined;
  }
  return next;
}

type FiltersSheetProps = {
  open: boolean;
  /** The ONE close path for every exit (Escape, backdrop click, "Done") — see `ProjectBoard`'s own `closeFilters` for why a single function, not one per exit. */
  onClose: (returnFocus: boolean) => void;
  filter: FilterSpec;
  setFilter: (updater: (current: FilterSpec) => FilterSpec) => void;
  /** `null` while the roster has not been read — never `[]`, which would claim this workspace has no members (see `visibility-editor.tsx:242-245`'s identical rule for the same read). */
  members: Actor[] | null;
  /** Distinct from `members === null`: PENDING and REFUSED are different facts, and a "has not loaded yet" sentence over a REAL refusal names the wrong cause — the exact defect `ProjectBoard`'s own docblock on `useSessionStatus` was written about, one component over. */
  membersError: string | null;
  /** Already resolved by `ProjectBoard` to the same built-in-ladder-while-loading fallback `createRegion` uses — one source of truth for "what are this workspace's types", not a second. */
  typeOptions: Array<{ id: string; name: string }>;
  typesError: string | null;
  /** True while `typeOptions` is the built-in fallback rather than the workspace's own served types. */
  typesPending: boolean;
  boardStateOptions: Array<{ id: string; name: string }>;
  boardLoaded: boolean;
  /** Same pending-vs-refused distinction as `membersError`, for the State section. */
  boardError: string | null;
};

/**
 * THE FILTERS SHEET (board-prototype-port Task 5) — a side panel over the
 * SAME page-level `filter` state the search box and the removable chips
 * (`board-search-scope.ts`) already read and write. There is no draft copy
 * here and no "Apply" button: every checkbox and chip writes straight
 * through to `filter` on click, exactly like the removable chip's own
 * `onRemove`. A draft-and-apply design would be a second filter state — the
 * one thing the brief and `page.tsx`'s own comments repeatedly forbid — and
 * it would desync the moment someone removes a chip from the narrowing strip
 * while the sheet is closed: the strip writes `filter` directly, and a
 * buffered copy would not see it. The footer is "Clear all" (RULING 12: the
 * button's own label is the promise a viewer reads, so it clears every axis
 * the narrowing strip's chips can represent — the six `BoardFilterSpec`
 * fields, `text` included even though the search box is Task 4's control
 * living outside this sheet — PLUS `collaboratorIds`, which this sheet can
 * set and which discloses through the scope note rather than a chip; see
 * `clearAll`'s own docblock, corrected by RULING 13, for the exact set —
 * does not close) and "Done" (closes only).
 *
 * ## Which axes get a control here, and which do not
 *
 * Five of `BoardFilterSpec`'s six axes get a control (`text` already has the
 * search box built by Task 4): **Assignee**, **Collaborators**, **Type**,
 * **State** and **Category** (`assigneeIds`/`collaboratorIds`/`typeIds`/
 * `stateIds`/`stateCategories`). Every value is ONE control, `TriStateChoice`
 * (exclude-mode spec §4, 2026-09-17): off → include → exclude → off, cycled
 * through `withCycledId` onto this same `filter`; the person rows keep their
 * avatar and name inside that button. `projectIds` gets none: this page is already
 * scoped to the one project it is showing, Task 4's own report found no
 * natural label source for it here ("a project-picker axis has no natural
 * label source... the chip names a COUNT"), and the brief's own curated
 * metrics line for this task never mentions a project control.
 *
 * `collaboratorIds` is deliberately included even though it is one of the
 * four axes `BoardCard` cannot answer at all (`board-search-scope.ts`'s
 * `describeUnappliedBoardAxes`) — Task 4's brief explicitly deferred its
 * third Step-5 test ("names the axes the board could not evaluate... helper
 * added in Task 5") to this commit, and this is that helper's only possible
 * home. `dueBefore`/`dueAfter` and `fields` get no control: the design
 * spec's own Filters-sheet metrics (`:1367-1417`) name exactly two control
 * shapes — "person row" and "category chip" — and Task 5's brief curates
 * those same two into its metrics line while dropping the spec's "Toggle"
 * row entirely, which is the discriminating fact that no boolean/date
 * control was meant to land here. Rendering an un-speced date-range input
 * would be building a control the brief gives no shape for, and "An inert
 * Filters button is a button that lies" cuts the other way too: a control
 * this sheet cannot honestly justify from the brief is one it should not
 * invent. So after this task, `dueBefore`/`dueAfter`/`fields` remain
 * unsettable anywhere in the product — a known, named gap for whoever builds
 * their control next, not a surprise (see the scope-note copy fix in
 * `ProjectBoard`, which stopped naming a location for exactly this reason).
 *
 * ## Absence, not an invented empty list — and PENDING is not REFUSED
 *
 * `members === null` (roster not yet read) and `!boardLoaded` (board not yet
 * read) each render a sentence saying so, never a silently empty picker —
 * the same rule `visibility-editor.tsx` already follows for its own person
 * list, restated here rather than reinvented. But `.data === null` is true
 * for BOTH a read still pending and one that REFUSED, and those are
 * different facts calling for different sentences — the same distinction
 * `typesError`/`typesPending` already draws for the Type section, applied
 * here too: `membersError`/`boardError` (from `members.error`/`board.error`,
 * `useLiveQuery`'s own error channel) are checked FIRST, ahead of the
 * pending branch, so a genuine refusal never gets the "has not loaded yet"
 * sentence — the same wrong-cause failure this page's own
 * `useSessionStatus` docblock was written about, one component over.
 * `typesError !== null` renders a refusal sentence instead of the built-in
 * ladder for the identical reason: `ProjectBoard`'s own docblock on
 * `BUILTIN_TYPE_LADDER` forbids that fallback surviving a FAILED read (only
 * a pending one), and `typeOptions` alone conflates the two, so this
 * component is handed `typesError`/`typesPending` separately rather than
 * inferring either from `typeOptions.length`.
 *
 * ## Accessibility contract
 *
 * `role="dialog"` + `aria-modal="true"`, labelled by its own `<h2>` via
 * `aria-labelledby` (never a redundant `aria-label` naming the same text
 * twice). Escape closes and returns focus to the Filters button
 * (`onClose(true)`); a backdrop click closes without forcing focus
 * (`onClose(false)`, mirroring `account-menu.tsx`'s outside-pointerdown
 * case — the click already landed somewhere real). **Focus moves INTO the
 * panel on open** — the first focusable descendant, mirroring
 * `account-menu.tsx`'s own worked example and its docblock's own warning:
 * without this, focus never leaves the trigger, and "Escape returns focus to
 * the trigger" would be vacuously true because focus never left it. The
 * test suite proves this is not vacuous by deleting the focus-return line
 * and watching the case fail — see `filters-sheet.test.tsx`.
 */
function FiltersSheet({
  open,
  onClose,
  filter,
  setFilter,
  members,
  membersError,
  typeOptions,
  typesError,
  typesPending,
  boardStateOptions,
  boardLoaded,
  boardError,
}: FiltersSheetProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const headingId = useId();

  // Focus the first focusable descendant on open — see the docblock above
  // for why this is load-bearing rather than cosmetic.
  useEffect(() => {
    if (!open) return;
    const first = panelRef.current?.querySelector<HTMLElement>(
      'input, button, select, textarea, [href], [tabindex]:not([tabindex="-1"])',
    );
    first?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose(true);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  /**
   * RULING 12, corrected by RULING 13 (the first fix cleared a DIFFERENT six
   * than it claimed to — see `FILTERS_SHEET_CLEARABLE_AXES`'s own docblock
   * for the exact defect). "Clear all" clears every axis in that ONE
   * exported list — the six `BoardFilterSpec` fields plus `collaboratorIds`
   * — read here, not re-typed, so this function and its test share a single
   * source rather than two hand-typed copies that can silently diverge
   * again. The search `<input>` needs no separate reset for `text`: it is a
   * controlled component reading `value={filter.text ?? ''}` directly
   * (`ProjectBoard`'s own JSX), never local state, so clearing `filter.text`
   * here empties it for free — checked, not assumed, confirmed by `13.459`.
   */
  const clearAll = () => setFilter(clearFilterAxes);

  /**
   * E5-5: `note` is the third argument, and it exists for exactly one caller.
   *
   * The Filters sheet renders a `Collaborators` fieldset whose tri-state rows
   * work — the filter keeps what you set — but **no view narrows by it**, and
   * the only place the product said so was a strip printed AFTER the press
   * (`docs/manual.md:826-828`: *"Collaborators is the one thing no tab applies
   * — the strip's own sentence is 'Not applied on the board: collaborator.'"*).
   * A control that looks like the six around it and quietly does nothing is the
   * dead-affordance shape this shell refuses elsewhere; the remedy is to say so
   * BEFORE the press, in the section that carries it.
   */
  const personSection = (title: string, key: 'assigneeIds' | 'collaboratorIds', note?: string) => (
    <fieldset className="gn-filters__section">
      <legend className="gn-filters__section-label">{title}</legend>
      {note !== undefined ? <p className="gn-filters__note">{note}</p> : null}
      {membersError !== null ? (
        <p className="gn-filters__pending">
          This workspace’s roster could not be loaded, so filtering by {title.toLowerCase()} is not
          offered.
        </p>
      ) : members === null ? (
        <p className="gn-filters__pending">The workspace roster has not loaded yet.</p>
      ) : members.length === 0 ? (
        <p className="gn-filters__pending">No members to choose from.</p>
      ) : (
        <div className="gn-filters__person-list">
          {members.map((member) => {
            // RULING E5-4: `member.name` verbatim is blank for the
            // magic-link population (`name: ''`), painting a row with no
            // visible text and no accessible name — closed the same way
            // E4-18 closed it on the ticket sheet's own pickers.
            //
            // `memberLabel` since 2026-09-22, which is the shared rule and not
            // `actorLabel`: this row is a person being chosen, so the address
            // step applies, and the system override does not — the same split
            // the ticket sheet's pickers and `visibility-editor.tsx` make.
            const label = memberLabel(member);
            return (
              <TriStateChoice
                key={member.id}
                className="gn-filters__choice--row"
                label={label}
                mode={choiceMode(filter, key, member.id)}
                onCycle={() => setFilter((current) => withCycledId(current, key, member.id))}
              >
                {/*
                  `aria-hidden`: `Avatar` sets its OWN `aria-label`/`title` on
                  its span (`components/avatar.tsx`), so left unhidden it
                  doubles this checkbox's accessible name to "Uma One Uma
                  One" — the label's accname concatenates every descendant's
                  text/label, and the plain `<span>` right after already
                  carries the real one. Decorative here, not a second source
                  of truth.
                */}
                <span aria-hidden="true">
                  <Avatar name={label} size="small" />
                </span>
                <span>{label}</span>
              </TriStateChoice>
            );
          })}
        </div>
      )}
    </fieldset>
  );

  return (
    <div className="gn-filters__scrim" data-testid="filters-scrim" onClick={() => onClose(false)}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        className="gn-filters__panel"
        data-testid="filters-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="gn-filters__header">
          <h2 id={headingId} className="gn-filters__heading">
            Filters
          </h2>
        </div>
        <div className="gn-filters__body">
          {personSection('Assignee', 'assigneeIds')}
          {/* The words are the manual's own; the strip's after-the-fact
              sentence is not removed, because it still fires on the board for
              anyone who sets this and forgets. */}
          {personSection(
            'Collaborators',
            'collaboratorIds',
            'No view narrows by this yet — you can set it and the filter keeps it, but nothing is filtered by it.',
          )}

          <fieldset className="gn-filters__section">
            <legend className="gn-filters__section-label">Type</legend>
            {typesError !== null ? (
              <p className="gn-filters__pending">
                This workspace’s ticket types could not be loaded, so filtering by type is not offered.
              </p>
            ) : (
              <>
                <div className="gn-filters__chip-list">
                  {typeOptions.map((type) => (
                    <TriStateChoice
                      key={type.id}
                      label={type.name}
                      mode={choiceMode(filter, 'typeIds', type.id)}
                      onCycle={() => setFilter((current) => withCycledId(current, 'typeIds', type.id))}
                    />
                  ))}
                </div>
                {typesPending ? <p className="gn-filters__pending">{BUILTIN_LADDER_NOTICE}</p> : null}
              </>
            )}
          </fieldset>

          <fieldset className="gn-filters__section">
            <legend className="gn-filters__section-label">State</legend>
            {boardError !== null ? (
              <p className="gn-filters__pending">
                This project’s board could not be loaded, so filtering by state is not offered.
              </p>
            ) : !boardLoaded ? (
              <p className="gn-filters__pending">This project’s board has not loaded yet.</p>
            ) : boardStateOptions.length > 0 ? (
              <div className="gn-filters__chip-list">
                {boardStateOptions.map((state) => (
                  <TriStateChoice
                    key={state.id}
                    label={state.name}
                    mode={choiceMode(filter, 'stateIds', state.id)}
                    onCycle={() => setFilter((current) => withCycledId(current, 'stateIds', state.id))}
                  />
                ))}
              </div>
            ) : null}
          </fieldset>

          {/**
           * THE CLOSED CONTROL (Task 11, spec §5.5): ONE `TriStateChoice`,
           * not a person row or a chip list — `closed` is a single boolean
           * with no per-value list the way Assignee/Type/State/Category each
           * have, so there is exactly one control to render, cycling
           * `filter.closed` itself through `closedMode`/`withCycledClosed`
           * (`filter-cycle.ts`) rather than `choiceMode`/`withCycledId`,
           * which have nothing to add a VALUE to here. Placed after State,
           * before Category, matching the brief's own ordering.
           */}
          <fieldset className="gn-filters__section">
            <legend className="gn-filters__section-label">Closed</legend>
            <div className="gn-filters__chip-list">
              <TriStateChoice
                label="Closed"
                mode={closedMode(filter)}
                onCycle={() => setFilter(withCycledClosed)}
              />
            </div>
          </fieldset>

          <fieldset className="gn-filters__section">
            <legend className="gn-filters__section-label">Category</legend>
            <div className="gn-filters__chip-list">
              {STATE_CATEGORIES.map((category) => (
                <TriStateChoice
                  key={category}
                  label={STATE_CATEGORY_LABELS[category]}
                  mode={choiceMode(filter, 'stateCategories', category)}
                  onCycle={() => setFilter((current) => withCycledId(current, 'stateCategories', category))}
                />
              ))}
            </div>
          </fieldset>
        </div>
        <div className="gn-filters__footer">
          <button type="button" className="gn-button gn-button--ghost" onClick={clearAll}>
            Clear all
          </button>
          <button
            type="button"
            className="gn-button gn-button--primary"
            onClick={() => onClose(true)}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
