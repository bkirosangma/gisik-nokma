'use client';

import { Suspense, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { BUILTIN_TICKET_TYPE_SEEDS } from '@gisik-nokma/domain';
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
 * Step 5b's snippet renders the views over `(list.rows ?? []).map(...)`. Against
 * the server that ships today `getTickets` REFUSES — `mapListView` throws a
 * `ServingGapError` over five absent `ListRow` fields — so `list.rows` is null,
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

  const board = useBoard(dataSource, workspaceId, projectId);
  const list = useTicketList(dataSource, workspaceId, projectId, currentUserId);
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
      epicTitle: (epicId) => rows.find((row) => row.ticketId === epicId)?.title ?? epicId,
      typeName: (typeId) => typeId,
    };
  }, [list.rows]);

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
   * the shipped server `getTickets` REFUSES — so `list.rows` is null forever,
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
   * **The cost, named rather than left to be discovered:** against the server
   * that ships today `getTickets` refuses, so this control is NOT offered at all
   * and no ticket can be created from this page — not even at project root, which
   * needs no parent. That is a true report of this build. Plan 7 owns the list
   * route's serving gap; the day it lands the control appears with no change
   * here.
   */
  const createRegion = (() => {
    if (list.error !== null || ticketTypes.error !== null) {
      return (
        <>
          {list.error !== null ? (
            <ShellRefusal
              what="The tickets that could be a parent, so New ticket is not offered"
              message={list.error}
            />
          ) : null}
          {ticketTypes.error !== null ? (
            <ShellRefusal
              what="This workspace’s ticket types, so New ticket is not offered"
              message={ticketTypes.error}
            />
          ) : null}
        </>
      );
    }
    if (session.kind === 'signed-out') {
      return (
        <p role="status" className="gn-new-ticket__gate">
          Sign in to create a ticket.
        </p>
      );
    }
    if (session.kind === 'loading' || list.rows === null) {
      return (
        <p role="status" className="gn-new-ticket__gate">
          Preparing the New ticket form…
        </p>
      );
    }
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
      <AppNav workspaceId={workspaceId} />
      <div className="gn-shell__main">
        {expired ? (
          // ONE notice for the page. Four reads can 401 together and they are one
          // event: four panels would describe four.
          <ExpiredSessionNotice />
        ) : (
          <>
            {/* `?? []` would render no strip at all, which reads as "nothing needs
                attention" — see `src/shell-refusal.tsx`. */}
            {attention.error !== null ? (
              <ShellRefusal what="What needs your attention" message={attention.error} />
            ) : attention.data !== null ? (
              <AttentionStrip items={attention.data} onOpenTicket={openTicket} />
            ) : null}

            <div className="gn-view-tabs" role="tablist">
              <button
                role="tab"
                type="button"
                aria-selected={view === 'board'}
                onClick={() => setView('board')}
              >
                Board
              </button>
              <button
                role="tab"
                type="button"
                aria-selected={view === 'list'}
                onClick={() => setView('list')}
              >
                List
              </button>
              <button
                role="tab"
                type="button"
                aria-selected={view === 'calendar'}
                onClick={() => setView('calendar')}
              >
                Calendar
              </button>
              <button
                role="tab"
                type="button"
                aria-selected={view === 'timeline'}
                onClick={() => setView('timeline')}
              >
                Timeline
              </button>
              {createRegion}
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
          </>
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
