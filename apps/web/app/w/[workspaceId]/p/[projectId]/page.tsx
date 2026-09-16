'use client';

import { Suspense, useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { BUILTIN_TICKET_TYPE_SEEDS, type StateCategory } from '@gisik-nokma/domain';
import {
  AttentionStrip,
  Board,
  CalendarView,
  CreateTicketFlow,
  TicketList,
  TicketSheet,
  TimelineView,
  matchesBoardCard,
  useAttention,
  useBoard,
  useLiveQuery,
  useTicketList,
  type Actor,
  type BoardFilterSpec,
  type FilterSpec,
  type GroupLabels,
  type TicketDatesInput,
} from '@gisik-nokma/app-core';
import { Avatar } from '@gisik-nokma/ui';
import { AppNav } from '../../../../../src/app-nav.js';
import {
  buildBoardFilterChips,
  describeUnappliedBoardAxes,
  shouldRenderBoardNarrowingStrip,
  type BoardFilterChip,
} from '../../../../../src/board-search-scope.js';
import { istToday } from '../../../../../src/ist-today.js';
import { ShellRefusal } from '../../../../../src/shell-refusal.js';
import {
  customDateFieldsByType,
  rankOneEpicPredicate,
  toTicketDatesInput,
} from '../../../../../src/ticket-dates-input.js';
import { useAppServices, useSessionStatus } from '../../../../../src/providers.js';
import { useProjectName } from '../../../../../src/use-project-name.js';
import { useWorkspaceName } from '../../../../../src/use-workspace-name.js';
import {
  ExpiredSessionNotice,
  useSignInOnExpiredSession,
} from '../../../../../src/expired-session.js';

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
 * which is the same invented fact as `attention.data ?? []` and the spinner over
 * a refused read: the defect this page's own `parentCandidates` note was written
 * about, one tab across. So the calendar and timeline arms use this page's own
 * `error → ShellRefusal, null → Loading…, data → view` shape, and Step 5b's
 * `<p>{board.error ?? 'Loading…'}</p>` spellings are NOT adopted for the two
 * existing arms either — those would have deleted `ShellRefusal` from the board
 * and the list on the way past.
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
}));

export const BUILTIN_LADDER_NOTICE =
  'Showing the four built-in ticket types while this workspace’s own types load.';

function ProjectBoard() {
  const router = useRouter();
  const params = useParams<{ workspaceId: string; projectId: string }>();
  const searchParams = useSearchParams();
  const { workspaceId, projectId } = params;
  const { dataSource, cache } = useAppServices();
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
  const projectName = useProjectName(workspaceId, projectId);
  const [view, setView] = useState<'board' | 'list' | 'calendar' | 'timeline'>('board');
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
   * (`mappers.ts:838-853`) throws `UnexpressibleFilterError` on it: the SIX
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
  const attention = useAttention(dataSource, workspaceId);

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
  const filtersButtonRef = useRef<HTMLButtonElement | null>(null);
  const closeFilters = useCallback((returnFocus: boolean) => {
    setFiltersOpen(false);
    if (returnFocus) filtersButtonRef.current?.focus();
  }, []);

  /**
   * THE ONE ENUMERATION of the six axes a board can answer — `Pick`'s own
   * field list, restated here exactly once. `boardNarrowing` below and
   * `activeFilterChips` further down BOTH read this SAME value; before the
   * review that asked for this, they were two independently hand-written
   * lists of "which axes exist" that had already drifted (the chip builder
   * only ever checked `text`) — see `board-search-scope.ts`'s own docblock on
   * `buildBoardFilterChips` for the full account. A future axis added to
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
    }),
    [
      filter.text,
      filter.assigneeIds,
      filter.typeIds,
      filter.stateIds,
      filter.stateCategories,
      filter.projectIds,
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
   * ONE PASS produces the narrowed board, its shown count, and its total — per
   * coordinator Ruling 1. A count computed by a SECOND walk over `board.data`
   * (or, worse, borrowed from `list.rows.length`, which `activeOnly` narrows
   * server-side and the board never does) could disagree with what actually
   * renders; a single fold cannot disagree with itself. `<Board>` below is
   * handed `boardNarrowing.view`, never `board.data` directly, so the grid and
   * the count are reading the SAME computed groups.
   *
   * TWO mechanisms fold into this ONE pass as of Task 8, not one:
   * `boardFilter` (Task 4) drops CARDS, never a column or a group —
   * `board.tsx:204-208`'s own rule, still exactly true of that mechanism on
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
   * why `shouldRenderBoardNarrowingStrip`'s third term (`shown !== total`)
   * exists independently of `activeFilterChips`/`boardUnappliedAxes`: no
   * axis enumeration can ever name "a whole group was dropped", so the gate
   * would otherwise miss this mechanism entirely — see that function's own
   * docblock in `board-search-scope.ts`.
   *
   * Reads `resolvedWorkflowFilter`, not raw `workflowFilter` — see that
   * value's own docblock immediately above (Ruling 20(b)): a picked
   * workflow that has dropped out of `board.data` falls back to `'all'`
   * here rather than narrowing every group to nothing on a stale id.
   */
  const boardNarrowing = useMemo(() => {
    if (board.data === null) return null;
    let total = 0;
    let shown = 0;
    const groups = board.data.groups.flatMap((group) => {
      const keepGroup =
        resolvedWorkflowFilter === 'all' || group.workflowId === resolvedWorkflowFilter;
      const columns = group.columns.map((column) => ({
        ...column,
        cards: column.cards.filter((card) => {
          total += 1;
          const keep = keepGroup && matchesBoardCard(card, column, projectId, boardFilter);
          if (keep) shown += 1;
          return keep;
        }),
      }));
      return keepGroup ? [{ ...group, columns }] : [];
    });
    return { view: { ...board.data, groups }, shown, total };
  }, [board.data, boardFilter, resolvedWorkflowFilter, projectId]);

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
    [filter.collaboratorIds, filter.dueBefore, filter.dueAfter, filter.fields],
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

  // Every read on this page, one rule, one author — see `src/expired-session.tsx`.
  // Before this, an expired session here rendered "The board cannot be shown yet
  // — HTTP 401 for /v1/projects/…/board", which names the wrong cause and offers
  // the viewer nothing to do about it.
  const expired = useSignInOnExpiredSession([
    attention.error,
    board.error,
    list.error,
    ticketTypes.error,
  ]);

  const openTicketId = searchParams.get('ticket');
  const openTicket = (ticketId: string) =>
    router.push(`/w/${workspaceId}/p/${projectId}?ticket=${ticketId}`);
  const closeTicket = () => router.push(`/w/${workspaceId}/p/${projectId}`);

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
    const byId = new Map((members.data ?? []).map((member) => [member.id, member.name]));
    return (userId: string): string => byId.get(userId) ?? userId;
  }, [members.data]);

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
  const today = istToday();
  /*
   * RECORDED, NOT FIXED: `today` is computed once per RENDER and never
   * re-derived on its own, so a tab left open across IST midnight keeps
   * yesterday's ring until something else re-renders this page. The day
   * COMPUTATION is right — 11.164 pins it at the instant the UTC and IST
   * spellings disagree — and this is only about when it is recomputed.
   * Deliberately not fixed here: the fix is a timer, and a timer is a
   * re-render mechanism that needs its own case, its own cleanup and its own
   * argument about cadence. OWNER: whoever next opens this page's date wiring.
   */

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
   * `list.rows === null ? [] : …` and NOT `list.rows ?? []`, for the reason the
   * `parentCandidates` note below gives at length: the two spellings agree here
   * only because the arms that render these inputs are gated on `list.rows !==
   * null` themselves. The gate is the guarantee; this expression never carries
   * an empty array into a view.
   */
  const dateInputs = useMemo<TicketDatesInput[]>(
    () =>
      list.rows === null
        ? []
        : list.rows.map((row) =>
            toTicketDatesInput(
              row,
              { workspaceId, projectId },
              dateFieldsByType.get(row.typeId) ?? [],
            ),
          ),
    [list.rows, workspaceId, projectId, dateFieldsByType],
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
   */
  const parentCandidates =
    list.rows === null ? [] : list.rows.map((row) => ({ id: row.ticketId, title: row.title }));

  const typeOptions =
    ticketTypes.data === null
      ? BUILTIN_TYPE_LADDER
      : ticketTypes.data.map((type) => ({ id: type.id, name: type.name }));

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
   * `boardFilter` itself (declared above, alongside `boardNarrowing`), one
   * chip per axis actually set, covering all SIX of `BoardFilterSpec`'s
   * fields rather than only `text`. See `buildBoardFilterChips`'s own
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
      buildBoardFilterChips(
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
   * `buildBoardFilterChips`, on purpose: that function enumerates
   * `boardFilter`'s six fields one by one, and `workflowFilter` is not one
   * of them (see its own declaration above) and never can be —
   * `matchesBoardCard` has no group in its signature for a seventh axis to
   * join. So this is a second, small builder rather than a seventh case
   * inside `buildBoardFilterChips`, shaped identically (`BoardFilterChip`)
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
    return { key: 'workflow', label, onRemove: () => setWorkflowFilter('all') };
  }, [resolvedWorkflowFilter, board.data]);

  /**
   * THE STRIP'S FULL CHIP LIST — `activeFilterChips` plus `workflowChip`
   * when one is active, merged ONLY here, at the render boundary. Every
   * other reader of `activeFilterChips` (the gate's `chipCount` term below,
   * and the mirror note further down that checks for the `text` chip
   * specifically) keeps reading `activeFilterChips` alone, unmerged — the
   * gate does not need `workflowChip` counted in `chipCount` because
   * `shouldRenderBoardNarrowingStrip`'s independent third term
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
   * same `error → ShellRefusal, data → component` the attention strip, the board
   * and the list all use — and puts the reason where the viewer is already
   * looking.
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
    if (session.kind === 'loading' || (list.rows === null && list.error === null)) {
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
     * `parentCandidates` above is built from `list.rows`. `list.error` is
     * `list.error ?? preferences.error` (`ticket-list.ts`'s `useTicketList`), so an
     * ordinary preferences 500 — or a `setPrefs` PUT the user triggered themselves —
     * sets it while the rows sit there intact. Keyed on the error alone, this told a
     * user that the tickets which could be a parent *"cannot be shown"*, and offered a
     * PREFERENCES failure as the reason, while the very same page could have listed
     * them. Two false sentences at once, and the state a stale parent could be
     * submitted from. Witnessed at 3.158.
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
          dataSource={dataSource}
          cache={cache}
          workspaceId={workspaceId}
          projectId={projectId}
          currentUserId={currentUserId}
          typeOptions={typeOptions}
          parentCandidates={parentCandidates}
          {...(activeOnly ? { parentCandidatesNarrowing: 'tickets in progress' } : {})}
          {...parentsUnavailable}
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

  return (
    <main className="gn-shell">
      {/* No `projectId`: the nav's Board item was removed in Round 23 and that
          prop was its only consumer, so passing it would be feeding a parameter
          nothing reads. */}
      <AppNav workspaceId={workspaceId} />
      <div className="gn-shell__main">
        {expired ? (
          // ONE notice for the page. Four reads can 401 together and they are one
          // event: four panels would describe four.
          <ExpiredSessionNotice />
        ) : (
          <div className="gn-project">
            {/* `?? []` would render no strip at all, which reads as "nothing needs
                attention" — see `src/shell-refusal.tsx`. */}
            {attention.error !== null ? (
              <ShellRefusal what="What needs your attention" message={attention.error} />
            ) : attention.data !== null ? (
              <AttentionStrip items={attention.data} onOpenTicket={openTicket} />
            ) : null}

            {/*
              ABOVE the tab arms, and that placement is the whole point rather than
              a layout choice.

              Which forces the note beside it to NAME THE SURFACES. The control
              renders on every tab, but it narrows only the reads that take a
              filter: `useBoard` takes none and cannot be narrowed, so an unscoped
              "done are excluded" sits on the DEFAULT tab directly above a Done
              column holding a done card — an unnarrowed set claiming to be
              narrowed, which is the same class of lie as a narrowed one claiming
              to be whole and is the reason this control exists. Every renderer of the list lives inside
              `list.error === null` — put the narrowing control there and it is
              reachable by everyone EXCEPT the person who needs it, because past the
              cap those arms render a refusal instead. That is the identical mistake
              `createRegion` was making until PR #270, and it has the identical fix:
              gate an affordance on what it actually needs, not on the read that
              happens to sit beside it. This control needs nothing.
            */}
            <div className="gn-list-filter">
              <label className="gn-list-filter__control">
                <input
                  type="checkbox"
                  checked={activeOnly}
                  onChange={(event) => setActiveOnly(event.target.checked)}
                />
                Only tickets in progress
              </label>
              {/*
                Said here as well as in the list's own summary, because past the cap
                there IS no list to carry a summary — the arms are refusing — and
                this is the only place the state of the question is visible.
              */}
              {activeOnly ? (
                <span className="gn-list-filter__note" data-testid="list-filter-note">
                  the list, calendar and timeline are asking only for tickets in progress —
                  not started and done are both excluded. The board is not narrowed.
                </span>
              ) : null}
            </div>

            {/*
              BREADCRUMB AND TITLE (fix round 1, Ruling 6; restructured fix round
              2, coordinator Critical finding) — stacked children of `.gn-project`
              itself, NOT of `.gn-project__header`. The metrics table lists "Page
              padding", "Header row top margin 24px", "Breadcrumb 13/18" and
              "Title 34/41" as separate entries against a COLUMN
              (`.gn-project { flex-direction: column; gap: 14px }`), which is three
              stacked children, not one flex line — putting the 34px/700 heading
              inside `.gn-project__header` (`align-items: center`, `flex-wrap:
              wrap`) vertically centred it on the same line as the 13px breadcrumb
              and the New-ticket button, and would have put Tasks 4/5/8's search
              box, workflow `<select>` and Filters button on that same line too.

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
            {workspaceName !== null ? (
              <p className="gn-project__breadcrumb">{workspaceName}</p>
            ) : null}
            {projectName !== null ? <h1 className="gn-project__title">{projectName}</h1> : null}

            {/*
              `.gn-project__header` — Task 2 of the prototype port. Controls
              ONLY: Task 4 (search), Task 8 (workflow `<select>`) and Task 5
              (Filters) add their own controls here; New ticket is the one
              control already built, so it moves in now rather than waiting for a
              later task to relocate it. The breadcrumb and title moved OUT of
              this container in fix round 2 — see the comment above.

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
                declared beside `boardFilter`/`boardNarrowing` above, not
                beside `filter`. `All workflows` is the first `<option>` and
                `workflowFilter`'s own initial value, so the picker's resting
                state IS the default (R3) with no extra wiring to keep them
                in sync.

                GATED ON `board.data.groups.length > 1`, not merely on
                `board.data !== null`: a project with zero or exactly one
                workflow offers no real choice — "All workflows" and that one
                workflow's name would render the identical board — so the
                control would be a picker between one thing and itself. This
                mirrors `Board`'s OWN gate for the identical judgment one
                level down (`board.tsx`: `board.groups.length > 1 ? <h3
                className="gn-board__workflow">` — the workflow name itself
                only renders once there is more than one to distinguish).
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

            {/*
              The segmented control (`ui.css`'s shared `.gn-segmented` /
              `.gn-segmented__item` / `.gn-segmented__item--on`), replacing the
              page-local `.gn-view-tabs`. Same roles, same handlers — a restyle,
              not a rebuild: `role="tablist"`/`role="tab"`/`aria-selected` are
              unchanged, and each button still drives `setView` directly.

              One boolean per tab feeds BOTH `aria-selected` and the `--on`
              modifier class, rather than two `view === 'x'` comparisons that would
              have to be kept in agreement by hand.

              `.gn-view-tabs` NO LONGER EXISTS ANYWHERE IN THE PRODUCT as of this
              commit (Task 4, coordinator Ruling 7) — `globals.css`'s own dead
              rules (`:1244`, `:1391-1392`) and the docblock sentence claiming
              they "survive… only on the project page" are both removed there;
              that claim stopped being true the moment THIS page moved onto
              `.gn-segmented` (Task 2), and a stale rule is one thing but a
              comment misstating the file it sits in is the thing this repo
              punishes hardest.
            */}
            <div className="gn-segmented" role="tablist">
              {(
                [
                  ['board', 'Board'],
                  ['list', 'List'],
                  ['calendar', 'Calendar'],
                  ['timeline', 'Timeline'],
                ] as const
              ).map(([tab, label]) => {
                const selected = view === tab;
                return (
                  <button
                    key={tab}
                    role="tab"
                    type="button"
                    aria-selected={selected}
                    className={`gn-segmented__item${selected ? ' gn-segmented__item--on' : ''}`}
                    onClick={() => setView(tab)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/*
              THE DISCLOSURE STRIP (Step 3/4, the shared mechanism Task 8's
              workflow picker also feeds). Board-tab-only: the count and the
              scope note are both facts about the BOARD's own narrowing, and
              showing them on a tab they say nothing about would be its own
              small lie.

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
              remedy 2 — `shouldRenderBoardNarrowingStrip` in
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
              down, which also includes `workflowChip` when one is active).
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
            {view === 'board' &&
            boardNarrowing !== null &&
            shouldRenderBoardNarrowingStrip({
              chipCount: activeFilterChips.length,
              unappliedAxisCount: boardUnappliedAxes.length,
              shown: boardNarrowing.shown,
              total: boardNarrowing.total,
            }) ? (
              <div className="gn-project__narrowing" data-testid="board-narrowing">
                <span className="gn-project__count" data-testid="board-narrowing-count">
                  {boardNarrowing.shown} of {boardNarrowing.total} shown
                </span>
                {narrowingChips.map((chip) => (
                  <span
                    key={chip.key}
                    className="gn-project__filter-chip"
                    data-testid={`board-filter-chip-${chip.key}`}
                  >
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
                {boardUnappliedAxes.length > 0 ? (
                  /**
                   * THE LOCATION CLAUSE — REMOVED (Task 5). Task 4 shipped
                   * "— set on the list tab, where a ticket carries the
                   * field", written before this sheet existed and flagged in
                   * that task's own report for re-verification once it
                   * landed. It is not re-pointed at the Filters sheet:
                   * `boardUnappliedAxes` can join UP TO THREE axis names in
                   * one sentence (collaborator, due date, custom field), and
                   * after this task only ONE of those three — collaborator —
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
                   */
                  <span className="gn-project__scope-note" data-testid="board-scope-note">
                    Not applied on the board: {boardUnappliedAxes.join(', ')}.
                  </span>
                ) : null}
              </div>
            ) : null}

            {/*
              THE MIRROR NOTE (Task 4 fix round 1, coordinator Ruling 10;
              WIDENED in the final whole-branch review's fix wave, Finding 1,
              2026-09-16).

              `matchesBoardCard` narrows the BOARD only — `useBoard` has no
              way to be narrowed by anything else, and the spec's own search
              ruling exists precisely because "one search box would then
              answer differently on two tabs of one page" if it silently
              filtered one and not the others. The `aria-label` on the
              search box discloses this to a screen-reader user, but a
              sighted person on List/Calendar/Timeline sees a search box,
              types into it, and watches nothing happen — the SAME
              asymmetry, from the other direction. This note is the fix:
              on every tab BUT Board, when there is something set on
              `filter` this tab does not apply, say so in words, beside the
              existing "Only tickets in progress" note
              (`.gn-list-filter__note`) rather than replacing it.

              Ruling 10 gated this on `text` alone, because `text` was the
              only axis with a control when it was written. Task 5's
              Filters sheet then reached FIVE more axes
              (`assigneeIds`/`typeIds`/`stateIds`/`stateCategories`/
              `projectIds`) onto the SAME page-level `filter`, from every
              tab — a `chip.key === 'text'` gate goes silently inert on all
              five, the identical one-axis-enumeration defect
              `buildBoardFilterChips` was already rewritten to stop
              repeating for the strip above. GATED NOW on
              `activeFilterChips.length > 0 || boardUnappliedAxes.length >
              0` — the SAME two terms the strip's own gate reads for the
              board (`shouldRenderBoardNarrowingStrip`'s first two), never
              its third (`shown !== total`): that term is a fact about what
              the BOARD rendered, meaningless on a tab the board never
              touches. `activeFilterChips` already enumerates every
              `BoardFilterSpec` axis (`buildBoardFilterChips`'s own
              docblock); `boardUnappliedAxes` covers the three the board
              itself cannot evaluate either. Between the two, every axis
              this `filter` state can carry is covered.

              THE SENTENCE NAMES ONLY WHAT IT KNOWS. It no longer says "the
              board only" — that would overclaim for a `filter` set to only
              a `boardUnappliedAxes` entry (`collaboratorIds`,
              `dueBefore`/`dueAfter`, `fields`), none of which narrow the
              board either (see `describeUnappliedBoardAxes`'s own
              docblock). It says only that what is set is not applied on
              THIS tab, true under every combination that trips the gate.

              Still gated on something actually being set, not on the tab
              alone (a permanent sentence on three tabs would be noise
              nobody reads), and still never on Board itself, where at
              least some of what is set does apply.
            */}
            {view !== 'board' && (activeFilterChips.length > 0 || boardUnappliedAxes.length > 0) ? (
              <p className="gn-project__scope-note" data-testid="search-not-applied-note">
                Filters set here are not applied on this tab.
              </p>
            ) : null}

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
                />
              ) : (
                <p>Loading…</p>
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
                     `isEpicType` for its GROUPING (`:273`, `:320`) and not only
                     for a lane filter, so a rank-1 predicate reaching here
                     changes the lane heading on screen. Witnessed at 11.165. */
                  {...(isEpicType === undefined ? {} : { isEpicType })}
                />
              ) : (
                <p>Loading…</p>
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
                // `shouldRenderBoardNarrowingStrip` above already reads as one
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
                  isNarrowed={boardNarrowing.shown !== boardNarrowing.total}
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
                        },
                      }
                    : {})}
                />
              ) : (
                <p>Loading…</p>
              )
            ) : list.error !== null ? (
              <ShellRefusal what="The ticket list" message={list.error} />
            ) : list.rows !== null ? (
              <TicketList
                // The words, not a flag: the summary has to say WHICH narrowing,
                // and `undefined` here is what makes the unnarrowed count still
                // read as the project's own.
                {...(activeOnly ? { narrowing: 'tickets in progress' } : {})}
                rows={list.rows}
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
                labels={labels}
                onOpenTicket={openTicket}
              />
            ) : (
              <p>Loading…</p>
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
          dataSource={dataSource}
          cache={cache}
          workspaceId={workspaceId}
          ticketId={openTicketId}
          currentUserId={currentUserId}
          onClose={closeTicket}
        />
      ) : null}

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

/** Toggle `value` in-or-out of an optional id list, collapsing back to `undefined` rather than `[]` — matching `buildBoardFilterChips`'s own `clear()` convention, so a fully-deselected axis is indistinguishable from one never touched. */
function toggledArray<T>(current: T[] | undefined, value: T): T[] | undefined {
  const existing = current ?? [];
  const next = existing.includes(value) ? existing.filter((item) => item !== value) : [...existing, value];
  return next.length === 0 ? undefined : next;
}

function withToggledId(
  filter: FilterSpec,
  key: 'assigneeIds' | 'collaboratorIds' | 'typeIds' | 'stateIds',
  id: string,
): FilterSpec {
  return { ...filter, [key]: toggledArray(filter[key], id) };
}

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
 * (`buildBoardFilterChips`'s own domain) plus `collaboratorIds` (this
 * sheet's one board-blind axis, which discloses through the scope note
 * rather than a chip — see `FiltersSheet`'s own docblock).
 */
export const FILTERS_SHEET_CLEARABLE_AXES = [
  'text',
  'assigneeIds',
  'typeIds',
  'stateIds',
  'stateCategories',
  'projectIds',
  'collaboratorIds',
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
 * search box built by Task 4): **Assignee** and **Collaborators** as
 * "person row" checkbox lists (`assigneeIds`/`collaboratorIds`), **Type**
 * and **State** as "category chip" multi-selects (`typeIds`/`stateIds`), and
 * **Category** as the same chip idiom over the three fixed
 * `stateCategories` values. `projectIds` gets none: this page is already
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

  const personSection = (title: string, key: 'assigneeIds' | 'collaboratorIds') => (
    <fieldset className="gn-filters__section">
      <legend className="gn-filters__section-label">{title}</legend>
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
          {members.map((member) => (
            <label key={member.id} className="gn-filters__person-row">
              <input
                type="checkbox"
                checked={filter[key]?.includes(member.id) ?? false}
                onChange={() => setFilter((current) => withToggledId(current, key, member.id))}
              />
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
                <Avatar name={member.name} size="small" />
              </span>
              <span>{member.name}</span>
            </label>
          ))}
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
          {personSection('Collaborators', 'collaboratorIds')}

          <fieldset className="gn-filters__section">
            <legend className="gn-filters__section-label">Type</legend>
            {typesError !== null ? (
              <p className="gn-filters__pending">
                This workspace’s ticket types could not be loaded, so filtering by type is not offered.
              </p>
            ) : (
              <>
                <div className="gn-filters__chip-list">
                  {typeOptions.map((type) => {
                    const selected = filter.typeIds?.includes(type.id) ?? false;
                    return (
                      <button
                        key={type.id}
                        type="button"
                        className="gn-filters__chip"
                        aria-pressed={selected}
                        onClick={() => setFilter((current) => withToggledId(current, 'typeIds', type.id))}
                      >
                        {type.name}
                      </button>
                    );
                  })}
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
                {boardStateOptions.map((state) => {
                  const selected = filter.stateIds?.includes(state.id) ?? false;
                  return (
                    <button
                      key={state.id}
                      type="button"
                      className="gn-filters__chip"
                      aria-pressed={selected}
                      onClick={() => setFilter((current) => withToggledId(current, 'stateIds', state.id))}
                    >
                      {state.name}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </fieldset>

          <fieldset className="gn-filters__section">
            <legend className="gn-filters__section-label">Category</legend>
            <div className="gn-filters__chip-list">
              {STATE_CATEGORIES.map((category) => {
                const selected = filter.stateCategories?.includes(category) ?? false;
                return (
                  <button
                    key={category}
                    type="button"
                    className="gn-filters__chip"
                    aria-pressed={selected}
                    onClick={() =>
                      setFilter((current) => ({
                        ...current,
                        stateCategories: toggledArray(current.stateCategories, category),
                      }))
                    }
                  >
                    {STATE_CATEGORY_LABELS[category]}
                  </button>
                );
              })}
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
