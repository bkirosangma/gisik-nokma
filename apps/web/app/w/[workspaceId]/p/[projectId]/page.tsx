'use client';

import { Suspense, useMemo, useState } from 'react';
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
  useAttention,
  useBoard,
  useLiveQuery,
  useTicketList,
  type GroupLabels,
  type TicketDatesInput,
} from '@gisik-nokma/app-core';
import { AppNav } from '../../../../../src/app-nav.js';
import { istToday } from '../../../../../src/ist-today.js';
import { ShellRefusal } from '../../../../../src/shell-refusal.js';
import {
  customDateFieldsByType,
  rankOneEpicPredicate,
  toTicketDatesInput,
} from '../../../../../src/ticket-dates-input.js';
import { useAppServices, useSessionStatus } from '../../../../../src/providers.js';
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
              `.gn-project__header` — Task 2 of the prototype port. Produces the
              container Task 4 (search), Task 8 (workflow `<select>`) and Task 5
              (Filters) add their own controls to; New ticket is the one control
              already built, so it moves in now rather than waiting for a later
              task to relocate it.

              MOVED OUT OF THE TABLIST, not merely reclassed: `createRegion` used
              to render as the tablist's fifth child, a plain `<button>` (or a
              `<p role="status">`) sitting inside a `role="tablist"` alongside four
              `role="tab"` children — an ARIA violation `.gn-segmented`'s 2px-gap
              flex track would only have made more visible. Every assertion this
              page's tests make against `New ticket` queries `screen`/`within(dialog)`
              directly rather than scoping from the tablist container, so the move
              changes no test's reach (`page-refusals.test.tsx`,
              `project-create-gate.test.tsx`).
            */}
            <div className="gn-project__header">{createRegion}</div>

            {/*
              The segmented control (`ui.css`'s shared `.gn-segmented` /
              `.gn-segmented__item` / `.gn-segmented__item--on`), replacing the
              page-local `.gn-view-tabs`. Same roles, same handlers — a restyle,
              not a rebuild: `role="tablist"`/`role="tab"`/`aria-selected` are
              unchanged, and each button still drives `setView` directly.

              One boolean per tab feeds BOTH `aria-selected` and the `--on`
              modifier class, rather than two `view === 'x'` comparisons that would
              have to be kept in agreement by hand.

              `.gn-view-tabs` survives nowhere else in the product after this
              (`apps/web/app/globals.css`'s own docblock already said so — "survives
              only on the project page"); its now-dead rules are left in place,
              out of this task's file scope, and reported rather than deleted.
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
              ) : board.data !== null ? (
                <Board board={board.data} onOpenTicket={openTicket} />
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
    </main>
  );
}
