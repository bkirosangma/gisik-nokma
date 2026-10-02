'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  InboxView,
  notificationTarget,
  type InboxFilter,
  type NotificationsPage,
} from '@gisik-nokma/app-core';
import { Button, SegmentedControl, Toast } from '@gisik-nokma/ui';
import { HttpError } from '@gisik-nokma/app-core/online';
import type { Notification } from '@gisik-nokma/domain';
import { AppNav } from '../../src/app-nav.js';
import { ExpiredSessionNotice, useSignInOnExpiredSession } from '../../src/expired-session.js';
import { useAppServices, useSessionStatus } from '../../src/providers.js';
import { useLastWorkspace } from '../../src/use-last-workspace.js';
import { useActorLabels } from '../../src/use-actor-labels.js';
import { ShellRefusal } from '../../src/shell-refusal.js';
import { ticketSheetPath } from '../../src/ticket-location.js';

/**
 * What an inbox with nothing in it says.
 *
 * Task 12 recorded this as Task 14's: `InboxView` renders a bare `<ul>` for an
 * empty list, so a reader with no notifications got an empty box, while the
 * calendar and the timeline both name their emptiness out loud (`NO_DATES_NOTE`,
 * `NO_DAY_CLAIMS_NOTE`). The two siblings source that copy from a model
 * constant; the inbox has no model layer, so the shell that composes it owns
 * the sentence. Exported so the test asserts THIS string rather than a
 * paraphrase of it.
 */
export const EMPTY_INBOX_COPY = 'Nothing in your inbox. You will be told here when someone assigns you a ticket, mentions you, contests a claim, or a claimed day comes near.';

/**
 * The filter tabs (2026-09-19) — the prototype's `inboxTabs`, and the read each
 * one asks for.
 *
 * **The tab name and the filter are kept apart on purpose.** `'mentions'` is a
 * word that exists only on this screen; the read speaks the domain's terms
 * (`kind: 'mention'`). Mapping one to the other in exactly one place is what
 * stops a screen word reaching a query.
 *
 * **`All` asks for NOTHING rather than for a value**, so an unfiltered reader
 * makes the identical request every caller made before this control existed —
 * one spelling of "no filter", not two.
 */
type InboxTab = 'all' | 'unread' | 'mentions';

const INBOX_TABS: ReadonlyArray<{ value: InboxTab; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'unread', label: 'Unread' },
  { value: 'mentions', label: 'Mentions' },
];

const FILTER_OF: Record<InboxTab, InboxFilter> = {
  all: {},
  unread: { unreadOnly: true },
  mentions: { kind: 'mention' },
};

/**
 * The empty arms, and the reason the two filtered ones may NOT reuse the first.
 *
 * *"Nothing in your inbox"* is a claim about the WHOLE inbox, and under a filter
 * it is false — the reader has messages, just not of the kind they asked for. A
 * narrowed set presented as whole is the defect this repo names most often, and
 * the fix costs one sentence. The prototype draws the same distinction and adds
 * the reassurance its own empty arm carries: *"Nothing was deleted — this filter
 * just has no matches."*
 */
const EMPTY_COPY: Record<InboxTab, string> = {
  all: EMPTY_INBOX_COPY,
  unread:
    'Nothing unread. You have read everything sent to you. Nothing was deleted, this filter just has no matches.',
  mentions:
    'No mentions. Nobody has named you in a comment. Nothing was deleted, this filter just has no matches.',
};

/**
 * What the page says when it knows the ticket but the server will not place it.
 *
 * `TicketLocator.locate` answers `null` for the ONE 404 the ticket route sends
 * for both "no such ticket" and "not yours" — see `src/ticket-location.ts`. The
 * notification itself stays on screen and stays readable, because the standing
 * ruling is that a delivered message is the reader's own; what is unavailable is
 * the ticket behind it, and this says exactly that and nothing more.
 */
/**
 * What the page says when the bulk write is REFUSED, and the two arms are two
 * different facts — the same split the toast's own slots keep.
 *
 * **⚠ THIS COPY EXISTS BECAUSE THE FIRST VERSION OF THIS ACTION FAILED
 * SILENTLY.** The catch reloaded the page and set no state at all: a reader
 * whose inbox held more rows than one batch could click `Mark 120 read`, watch
 * nothing happen, watch the list snap back, and be told nothing. The adapter's
 * own docblock asserted the opposite — *"the caller renders the refusal rather
 * than assuming the write landed"* — so this is that promise being kept, found
 * by independent review.
 */
export const BULK_REFUSED_COPY =
  'Those notifications were not marked read. One go can carry at most a page of your inbox, and this list is longer. Mark a page at a time, or narrow the tab first.';
/** The other arm: nobody adjudicated, so it must not read as a refusal. */
export const BULK_UNREACHED_COPY =
  'Those notifications were not marked read. The server could not be reached. What is on screen has been reloaded.';

/**
 * THE SINGLE ROW'S OWN PAIR, and the same split the bulk pair keeps (E5-10,
 * 2026-09-21).
 *
 * Separate sentences rather than the bulk pair reused: those say *"Those
 * notifications"*, and a plural said about one row is a second false statement
 * laid on top of the missing one. The row's failure is otherwise identical — the
 * optimistic flip has to be reverted by the truth either way, and NOTHING SAID is
 * the state this pair exists to end.
 */
export const ROW_REFUSED_COPY =
  'That notification was not marked read. The server refused it. What is on screen has been reloaded.';
/** The row's transport arm: nobody adjudicated, so it must not read as a refusal. */
export const ROW_UNREACHED_COPY =
  'That notification was not marked read. The server could not be reached. What is on screen has been reloaded.';

/**
 * The UNDO's own sentence (E5-10, 2026-09-21).
 *
 * The Undo had the same silent catch as the row, and it is the worse of the two:
 * the reader has just been TOLD those notifications are unread again, by a toast
 * that then disappears — so a failed undo leaves the screen contradicting a
 * sentence the page has already withdrawn. It says which way the truth now lies.
 */
export const UNDO_FAILED_COPY =
  'That could not be undone. The notifications are still marked read. What is on screen has been reloaded.';

export const CANNOT_OPEN_COPY =
  'That ticket cannot be opened from here. It may have been removed, or it is no longer visible to you. The message itself is yours and stays.';

/**
 * What the page says when the NEXT page fails — beside the control, not instead
 * of the messages.
 *
 * Measured before it was written: with `loadMore`'s failure routed into `error`,
 * a page-2 refusal left ZERO rows on screen and one refusal panel, because the
 * render's first arm is `ShellRefusal` and it stands ahead of the rows. So a
 * request that FAILED took away messages that had already ARRIVED — which is the
 * standing ruling ("a message you were sent is yours") read backwards, and the
 * opposite of what `inbox-nav-link.tsx` does one file over, where a failed
 * refresh deliberately keeps the last count rather than asserting "none" from a
 * request that did not answer.
 *
 * The rows already delivered therefore stay, the Load-more control stays (the
 * cursor is unchanged, so the retry is real), and this sentence appears next to
 * it. The prefix is the server's own words, appended by the caller.
 */
export const PAGING_FAILURE_PREFIX = 'More of your inbox could not be loaded, so what is below is only part of it: ';

/**
 * `/inbox` — a GLOBAL route, and that is a decision rather than an accident.
 *
 * There is no `[workspaceId]` segment above this page, so there is no workspace
 * in scope, which is the second of the two reasons
 * `createHttpNotificationsGateway` sends no `workspaceId` on the list query (the
 * first being the interface's own contract with Plan 10's replica). Notifications
 * carry their own `workspaceId` per row, and the deep link uses it.
 *
 * ## FOUR states, because the sketch's two collapse the one that lies
 *
 * The plan's draft holds `notifications: Notification[]` initialised to `[]` and
 * branches on `failed`. That renders the loaded-and-empty view during the FIRST
 * READ — the same falsehood as `?? []` on the attention strip and a spinner over
 * a refused read, one layer up: a reader whose inbox is still arriving is told
 * it is empty. So the page holds `page: NotificationsPage | null`, `null`
 * meaning "not answered yet", and the four arms below are refused / loading /
 * empty / loaded.
 *
 * A FIFTH state is deliberately not one of the four: a failed SECOND page. It is
 * held in `pagingError` and rendered beside the Load-more control inside the
 * loaded arm, because it is not a reason the page cannot be shown — the page is
 * on screen and the rows in it are real. Routing it through `error`, which is
 * what the first version of this file did, put the refusal panel in the first
 * arm and took every delivered message off the screen; measured with a probe,
 * zero rows and one panel. See `PAGING_FAILURE_PREFIX`.
 *
 * ## Display names — read per workspace on the page, once each
 *
 * **CORRECTED (2026-09-29).** This block used to read *"Display names are ids"*:
 * the actor id rendered because a cross-workspace inbox has no workspace to key
 * the roster read by, and building a directory in a page looked like a second
 * naming authority. That put a raw ULID in every row for every role. The rows DO
 * carry a `workspaceId`, and `useActorLabels` reads each distinct one once
 * (`getMembers` for the roster's name/email label, `getActorNames` for the people
 * a member's roster omits) — the same two sources the notes byline and the ticket
 * sheet use, ordered by `actorLabelFrom`, so this is not a third authority. A
 * person no read names still renders as their id: attributed, never anonymous.
 */
/**
 * The next step out of an empty inbox (23.195, SYS-18): a real link, not a sentence about one. This page has no
 * `[workspaceId]` segment, so My work is reached through the workspace the shell remembers; a person with none yet
 * is sent to the workspace list, which is where one is chosen or created.
 */
function EmptyInboxNext(): React.JSX.Element {
  const session = useSessionStatus();
  const userId = session.kind === 'signed-in' ? session.user.id : null;
  const remembered = useLastWorkspace(undefined, userId);
  return remembered.status === 'remembered' ? (
    <p className="gn-inbox__next">
      <Link href={`/w/${remembered.workspaceId}/my-work`}>Open My work</Link>
    </p>
  ) : (
    <p className="gn-inbox__next">
      <Link href="/workspaces">Choose a workspace</Link>
    </p>
  );
}

export default function InboxPage() {
  const router = useRouter();
  const { notifications: gateway, ticketLocation } = useAppServices();

  const [page, setPage] = useState<NotificationsPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openFailure, setOpenFailure] = useState<string | null>(null);
  /** The bulk write's own outcome — a refusal or a silence, rendered rather than swallowed. */
  const [bulkFailure, setBulkFailure] = useState<string | null>(null);
  /**
   * The ids the last bulk write actually CHANGED, held only while the Undo is
   * still offered. `null` means there is nothing to take back, and the toast is
   * rendered from exactly this — so a toast that is not undoable cannot be drawn
   * by mistake, and dismissing the toast drops the ids with it.
   */
  const [undoable, setUndoable] = useState<{ changed: string[] } | null>(null);
  /**
   * The undo's own failure slot (E5-10, 2026-09-21). Separate from `bulkFailure`
   * because the two are said in different places: the bulk and row failures sit
   * above the list, next to the rows they are about, while the undo's belongs
   * beside the toast — where the sentence it contradicts was just shown.
   */
  const [undoFailure, setUndoFailure] = useState<string | null>(null);
  /**
   * The NEXT page's failure, held apart from `error` on purpose. `error` means
   * "this page cannot be shown"; this means "this page is shown and there is
   * more of it that would not come". Collapsing them into one string is exactly
   * the defect this round fixed — see `PAGING_FAILURE_PREFIX`.
   */
  const [pagingError, setPagingError] = useState<string | null>(null);

  /**
   * The active filter tab. **Held as the TAB, not as the filter**, so the
   * control's own vocabulary is the state and the domain's shape is derived —
   * see `FILTER_OF`.
   *
   * Changing it re-runs the first read and REPLACES the rows, which is what the
   * `loadFirstPage` dependency below does: a filter that appended to the rows
   * already on screen would show matches and non-matches in one list.
   */
  const [tab, setTab] = useState<InboxTab>('all');
  const filter = FILTER_OF[tab];
  // Who did it, by name — every workspace on the page read once (`useActorLabels`).
  const userName = useActorLabels(page?.notifications.map((notification) => notification.workspaceId) ?? []);

  /**
   * Both reads and the mark-read write fail the same way, so the message is
   * extracted the same way. `HttpError`'s message is `HTTP ${status} for
   * ${path}` — the format `isExpiredSession` matches on — so a 401 anywhere on
   * this page reaches the sign-in redirect rather than a refusal panel that
   * names the wrong cause.
   */
  const messageOf = (cause: unknown): string =>
    cause instanceof Error ? cause.message : String(cause);

  const loadFirstPage = useCallback(async (): Promise<void> => {
    try {
      setPage(await gateway.list(undefined, filter));
      setError(null);
      // A fresh first page REPLACES the rows, so a complaint about a second page
      // that no longer exists would be describing nothing on screen. Decided
      // rather than left ambiguous: the first read clears it, the retry below
      // clears it, and nothing else does.
      setPagingError(null);
    } catch (cause) {
      setError(messageOf(cause));
    }
    // `filter` is a DEPENDENCY, not a captured value: changing the tab must
    // re-run this read, and `FILTER_OF` is a module constant so the identity is
    // stable per tab and the effect does not thrash.
  }, [gateway, filter]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const expired = useSignInOnExpiredSession([error, openFailure, pagingError]);

  async function loadMore(): Promise<void> {
    if (page === null || page.nextCursor === null) return;
    try {
      // The SAME filter as the first page. A `loadMore` that dropped it would
      // append unfiltered rows to a filtered list, which reads as the filter
      // silently failing halfway down.
      const next = await gateway.list(page.nextCursor, filter);
      // Appended to the rows already on screen. `page` is read from the closure
      // the click was rendered with, and a second click cannot race a first
      // because `onLoadMore` is withdrawn while `nextCursor` is null.
      setPage({
        notifications: [...page.notifications, ...next.notifications],
        nextCursor: next.nextCursor,
      });
      // A retry that worked withdraws the complaint about the try that did not.
      setPagingError(null);
    } catch (cause) {
      // NOT `setError`. That arm blanks the page; this one keeps the rows the
      // server already delivered and says, beside the control, that there is
      // more it would not give. See `PAGING_FAILURE_PREFIX`.
      setPagingError(messageOf(cause));
    }
  }

  /**
   * The optimistic flip, and the reload that undoes it.
   *
   * `markRead` THROWS on the route's 404 — a row that is not yours and a row
   * that does not exist are one frozen body (`routes/notifications.ts`) — and
   * this shell's gateway does not swallow it (case 11.138). So the catch is not
   * defensive decoration: it is the arm that reloads the truth instead of
   * leaving a row drawn as read that the server never marked.
   */
  function markRead(id: string): void {
    setBulkFailure(null);
    setPage((current) =>
      current === null
        ? current
        : {
            ...current,
            notifications: current.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
          },
    );
    // ⚠ **THIS CATCH USED TO RELOAD AND SAY NOTHING (E5-10, 2026-09-21)** — the
    // exact first-version defect the BULK arm's docblock above records, still
    // standing here sixty lines down: a reader over the bound saw a click do
    // nothing and the list snap back, with no sentence anywhere.
    //
    // **The split is by KIND here, not by status, and that is the row's own
    // fact rather than a simplification of the bulk pair's.** The bulk route's
    // 400 is its bound — a number only a bulk request can exceed, which is why
    // THAT arm splits on the status. A single-row read has no such bound: the
    // only status this route answers is the 404 documented at the top of this
    // function, and a 404 IS the server adjudicating ("not yours" and "does not
    // exist" are one frozen body). So an `HttpError` of any status means a
    // server judged it, and anything else never reached one.
    void gateway.markRead(id).catch((cause: unknown) => {
      setBulkFailure(cause instanceof HttpError ? ROW_REFUSED_COPY : ROW_UNREACHED_COPY);
      loadFirstPage();
    });
  }

  /**
   * The unread rows THIS PAGE HAS DRAWN, in draw order. The bulk action is
   * scoped to exactly these — never to "the inbox" — because the route is
   * id-scoped by ruling and a control that claimed more than it did would be
   * the same defect as a badge that lies.
   */
  const drawnUnreadIds: string[] =
    page === null ? [] : page.notifications.filter((n) => !n.read).map((n) => n.id);

  /**
   * Mark the drawn-unread rows read — the same optimistic-flip-then-reload
   * idiom `markRead` above uses, for the same reason.
   *
   * ⚠ **AND THE TOAST CARRIES THE SERVER'S `changed`, NOT THE IDS WE SENT.**
   * That distinction is the whole reason the route answers with a list: a row
   * that was ALREADY read is not in `changed`, and an Undo built from our own
   * request would flip it to unread — inventing a notification nobody un-read.
   * The server's answer is the only account of what actually moved.
   */
  function markAllRead(): void {
    const ids = drawnUnreadIds;
    if (ids.length === 0) return;
    // A new attempt clears the last attempt's outcome — a refusal sentence left
    // standing while a second attempt succeeds would describe something over.
    setBulkFailure(null);
    setPage((current) =>
      current === null
        ? current
        : {
            ...current,
            notifications: current.notifications.map((n) => (n.read ? n : { ...n, read: true })),
          },
    );
    void gateway
      .setRead(ids, true)
      .then((changed) => {
        // Nothing moved: no toast, because there is nothing to undo.
        if (changed.length > 0) setUndoable({ changed });
      })
      /**
       * ⚠ A REFUSAL IS RENDERED, NOT SWALLOWED, AND THE TWO FAILURES ARE TOLD
       * APART BY STATUS. The first version of this catch reloaded and said
       * NOTHING: a reader over the bound saw a click do nothing and the list
       * snap back, with no sentence anywhere.
       *
       * `HttpError.status === 400` is the server's own refusal — over the bound
       * or a malformed body — and gets the bound's sentence. Anything else did
       * not reach a server that judged it, and must not read as a refusal: the
       * same server/transport split the dialog's refusal slots and the toast's
       * tones keep.
       *
       * The reload stays on BOTH arms: the optimistic flip has to be reverted
       * by the truth either way, or rows stay drawn as read that nothing marked.
       */
      .catch((cause: unknown) => {
        setBulkFailure(
          cause instanceof HttpError && cause.status === 400 ? BULK_REFUSED_COPY : BULK_UNREACHED_COPY,
        );
        loadFirstPage();
      });
  }

  /** The Undo: exactly the ids the forward call reported, and nothing else. */
  function undoMarkAllRead(): void {
    if (undoable === null) return;
    const ids = undoable.changed;
    setUndoable(null);
    // A new attempt clears the last one's sentence, the same rule `markAllRead`
    // keeps for `bulkFailure`.
    setUndoFailure(null);
    const undone = new Set(ids);
    setPage((current) =>
      current === null
        ? current
        : {
            ...current,
            notifications: current.notifications.map((n) => (undone.has(n.id) ? { ...n, read: false } : n)),
          },
    );
    // **And this catch said nothing either (E5-10, 2026-09-21)** — the worse of
    // the two, because the reader has just been told by the toast that these
    // notifications are unread again, and a failed undo leaves the screen
    // contradicting a sentence the page has already withdrawn.
    void gateway.setRead(ids, false).catch(() => {
      setUndoFailure(UNDO_FAILED_COPY);
      loadFirstPage();
    });
  }

  /**
   * The deep link. A notification names a ticket and a workspace; the shell's
   * ticket sheet needs a PROJECT, which no notification payload carries — so the
   * project is asked for rather than guessed. `src/ticket-location.ts` carries
   * the whole argument, including why the plan's `/tickets/${id}` names a route
   * this shell does not have.
   */
  function open(notification: Notification): void {
    const target = notificationTarget(notification);
    setOpenFailure(null);
    // A mention that sat in a NOTE opens the note, and the comment when it sat in
    // one (`#comment-<id>` — the note page scrolls to it). No location lookup: a
    // note's route is `/notes/<id>` alone (spec §9.1), and whether the reader may
    // still open it is the note page's own answer, not a guess made here.
    if (target.kind === 'note') {
      router.push(`/notes/${target.noteId}${target.commentId === null ? '' : `#comment-${target.commentId}`}`);
      return;
    }
    const ticketId = target.ticketId;
    void (async () => {
      try {
        const location = await ticketLocation.locate(notification.workspaceId, ticketId);
        if (location === null) {
          setOpenFailure(CANNOT_OPEN_COPY);
          return;
        }
        router.push(ticketSheetPath(location, ticketId));
      } catch (cause) {
        setOpenFailure(messageOf(cause));
      }
    })();
  }

  return (
    <main id="gn-main" className="gn-shell">
      <AppNav />
      {/*
        The header ROW — title and filter beside each other, which is where the
        prototype puts them, and the bulk action shares that row in the prototype
        too. **This paragraph used to end "...and is NOT in this task: it needs a
        route the server does not have", and that sentence was TRUE when it was
        written and is false now** — the route exists (`POST
        /v1/me/notifications/read`, this change set) and the control is drawn
        below. Kept as a struck note rather than deleted because a reader who
        remembers the absence should find the correction where they last saw it.
        The label differs from the prototype's for a reason stated at the
        control.

        The control is the SHARED `SegmentedControl`, not a local rule — the
        repo refuses a hand-rolled segmented control by name, and this one
        carries the `tablist`/`tab`/`aria-selected` roles the accessible-name
        ratchet counts.
      */}
      <div className="gn-inbox__header">
        <h1 className="gn-page-title">Inbox</h1>
        <SegmentedControl
          options={INBOX_TABS}
          value={tab}
          onChange={setTab}
          aria-label="Filter notifications"
        />
        {/*
          ⚠ **THE LABEL IS "Mark N read", NOT THE PROTOTYPE'S "Mark all read",
          AND THE DIFFERENCE IS A CORRECTION RATHER THAN A PREFERENCE.** The
          prototype's handler marks its whole local array (`s.notifs.map(...)`,
          `desktop.dc.html:3025-3029`) because a mockup holds everything. Ours
          acts on **exactly the rows this page has drawn** — the ruling put the
          bulk write on an id-scoped route and kept a non-id-scoped "mark all"
          OUT of scope — so "all" would be a claim about the inbox when the
          action is a claim about the page. The count makes the control say what
          it will actually do.

          Absent while nothing drawn is unread: a control that would change
          nothing is the shape this repo refuses to draw.
        */}
        {drawnUnreadIds.length > 0 ? (
          <Button onClick={markAllRead}>{`Mark ${drawnUnreadIds.length} read`}</Button>
        ) : null}
      </div>
      <div className="gn-shell__main">
        {expired ? (
          <ExpiredSessionNotice />
        ) : (
          <>
            {bulkFailure !== null ? (
              <p role="status" className="gn-inbox__bulk-failure">
                {bulkFailure}
              </p>
            ) : null}
            {openFailure !== null ? (
              <p role="status" className="gn-inbox__open-failure">
                {openFailure}
              </p>
            ) : null}
            {error !== null ? (
              <ShellRefusal what="Your inbox" message={error} />
            ) : page === null ? (
              <p role="status">Loading…</p>
            ) : page.notifications.length === 0 ? (
              <>
                <p role="status" className="gn-inbox__empty">
                  {/* Filter-SPECIFIC, because the unfiltered sentence is a claim
                      about the whole inbox and is false under a filter. */}
                  {EMPTY_COPY[tab]}
                </p>
                <EmptyInboxNext />
              </>
            ) : (
              <>
                <InboxView
                  notifications={page.notifications}
                  userName={userName}
                  onOpen={open}
                  onMarkRead={markRead}
                  onLoadMore={page.nextCursor === null ? null : loadMore}
                />
                {/* AFTER the view, which is where the Load-more button it is
                    about sits — and inside the loaded arm, so it can never
                    stand in place of the rows. */}
                {pagingError !== null ? (
                  <p role="status" className="gn-inbox__paging-failure">
                    {PAGING_FAILURE_PREFIX}
                    {pagingError}
                  </p>
                ) : null}
              </>
            )}
          </>
        )}
      </div>
      {/*
        The Undo, and it is mounted at the FOOT of the page rather than inside
        the list: the toast is `position: fixed`, so its place in the tree is
        only about which subtree it re-renders with. Here it survives the list's
        own empty/loading/refused arms changing underneath it — an undo offered
        after a reload that emptied the list must still be clickable, and a
        toast rendered inside the loaded arm would vanish with it.
      */}
      <Toast
        /**
         * ⚠ **THE KEY IS LOAD-BEARING, NOT A REACT NICETY.** The toast stays
         * MOUNTED between actions (`open` only toggles its render), so a second
         * `Mark N read` within the first toast's window would otherwise inherit
         * the FIRST one's remaining time — measured at 5 s rather than the ruled
         * 15 — and would inherit its `paused` flag too. Keying on the changed
         * set makes a new action a NEW toast: fresh window, fresh state.
         *
         * The cost, recorded rather than hidden: the previous action's Undo is
         * no longer reachable once a second action runs. That is the toast's
         * one-slot design, and the prototype's is the same — a second toast
         * replaces the first there too.
         */
        key={undoable === null ? 'none' : undoable.changed.join(',')}
        open={undoable !== null}
        message={
          undoable === null
            ? ''
            : `${undoable.changed.length} notification${undoable.changed.length === 1 ? '' : 's'} marked read`
        }
        undo={{ onUndo: undoMarkAllRead }}
        onDismiss={() => setUndoable(null)}
      />
      {/*
        The undo's failure, BESIDE the toast (E5-10, 2026-09-21). It is rendered
        out here rather than inside the toast's own message because the toast is
        gone by the time this appears — the Undo closed it — and a sentence about
        an undo that failed has to outlive the control that failed.
      */}
      {undoFailure !== null ? (
        <p role="status" className="gn-inbox__undo-failure" data-testid="inbox-undo-failure">
          {undoFailure}
        </p>
      ) : null}
    </main>
  );
}
