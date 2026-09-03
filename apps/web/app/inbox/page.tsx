'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { InboxView, notificationTicketId, type NotificationsPage } from '@gisik-nokma/app-core';
import type { Notification } from '@gisik-nokma/domain';
import { AppNav } from '../../src/app-nav.js';
import { ExpiredSessionNotice, useSignInOnExpiredSession } from '../../src/expired-session.js';
import { useAppServices } from '../../src/providers.js';
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
 * What the page says when it knows the ticket but the server will not place it.
 *
 * `TicketLocator.locate` answers `null` for the ONE 404 the ticket route sends
 * for both "no such ticket" and "not yours" — see `src/ticket-location.ts`. The
 * notification itself stays on screen and stays readable, because the standing
 * ruling is that a delivered message is the reader's own; what is unavailable is
 * the ticket behind it, and this says exactly that and nothing more.
 */
export const CANNOT_OPEN_COPY =
  'That ticket cannot be opened from here — it may have been removed, or it is no longer visible to you. The message itself is yours and stays.';

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
 * ## Display names are ids, and the reason is not "not yet wired"
 *
 * The plan's Guard says to use the shell's member-directory hook if one exists.
 * Measured: `grep -rn "useWorkspaceMembers\|memberName\|userName" apps/web/src
 * apps/web/app` returns nothing — there is no such hook. `DataSource.getMembers`
 * exists and is served, but it is keyed BY WORKSPACE and this page has no
 * workspace: a cross-workspace inbox would have to fan out one roster read per
 * distinct `workspaceId` on the page and rebuild it as rows page in. That is a
 * directory, not a wiring line, and inventing a half of one here would put a
 * second naming authority in the product beside whatever Plan 6's eventually is.
 * So the actor id renders — attributed, if unpolished, and never anonymous.
 * Recorded as a finding rather than left as a silent `(id) => id`.
 */
export default function InboxPage() {
  const router = useRouter();
  const { notifications: gateway, ticketLocation } = useAppServices();

  const [page, setPage] = useState<NotificationsPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openFailure, setOpenFailure] = useState<string | null>(null);

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
      setPage(await gateway.list());
      setError(null);
    } catch (cause) {
      setError(messageOf(cause));
    }
  }, [gateway]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  const expired = useSignInOnExpiredSession([error, openFailure]);

  async function loadMore(): Promise<void> {
    if (page === null || page.nextCursor === null) return;
    try {
      const next = await gateway.list(page.nextCursor);
      // Appended to the rows already on screen. `page` is read from the closure
      // the click was rendered with, and a second click cannot race a first
      // because `onLoadMore` is withdrawn while `nextCursor` is null.
      setPage({
        notifications: [...page.notifications, ...next.notifications],
        nextCursor: next.nextCursor,
      });
    } catch (cause) {
      setError(messageOf(cause));
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
    setPage((current) =>
      current === null
        ? current
        : {
            ...current,
            notifications: current.notifications.map((n) => (n.id === id ? { ...n, read: true } : n)),
          },
    );
    void gateway.markRead(id).catch(() => loadFirstPage());
  }

  /**
   * The deep link. A notification names a ticket and a workspace; the shell's
   * ticket sheet needs a PROJECT, which no notification payload carries — so the
   * project is asked for rather than guessed. `src/ticket-location.ts` carries
   * the whole argument, including why the plan's `/tickets/${id}` names a route
   * this shell does not have.
   */
  function open(notification: Notification): void {
    const ticketId = notificationTicketId(notification);
    setOpenFailure(null);
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
    <main className="gn-shell">
      <AppNav />
      <h1 className="gn-page-title">Inbox</h1>
      <div className="gn-shell__main">
        {expired ? (
          <ExpiredSessionNotice />
        ) : (
          <>
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
              <p role="status" className="gn-inbox__empty">
                {EMPTY_INBOX_COPY}
              </p>
            ) : (
              <InboxView
                notifications={page.notifications}
                userName={(id) => id}
                onOpen={open}
                onMarkRead={markRead}
                onLoadMore={page.nextCursor === null ? null : loadMore}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}
