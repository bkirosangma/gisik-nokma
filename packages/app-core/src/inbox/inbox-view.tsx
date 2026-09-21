import type { Notification } from '@gisik-nokma/domain';
import type { UserNameFn } from '../claims/claim-labels.js';
import { formatDateTime } from '../provenance.js';
import { notificationBody, notificationHeadline, notificationTicketLabel } from './format.js';
import { NotificationIcon } from './icons.js';

/**
 * The inbox list. PRESENTATIONAL: it renders the rows it is handed and calls
 * back. It holds no state, reads no clock, and owns no data access — the
 * gateway is an interface (`gateway.ts`) that the shell implements and the
 * shell hands the rows down.
 *
 * ## It renders EVERY row it is given, and there is no seam where it could not
 *
 * The standing coordination ruling: "a message you were sent is yours;
 * revocation removes future sight, not letters delivered." A delivered
 * notification stays exactly as delivered even after the reader's visibility to
 * the underlying ticket is narrowed. In this file that ruling is an ABSENCE —
 * no `visibleTicketIds` prop, no per-row predicate, no re-check, no `filter`
 * anywhere in the map. The mention body prints the excerpt as captured; the
 * contested body prints the engine's reason as written.
 *
 * An absence is not something a per-row assertion can see: a test that looks up
 * one headline passes just as happily when a different row was dropped. So
 * `test/inbox/inbox-view.test.tsx` renders a mixed five-kind fixture and
 * asserts the COUNT of rendered items against the fixture's length — measured against a
 * planted `.filter(...)`, which is the mutation the ruling is really about.
 *
 * ## No colour literal, and no `tokens.color.*` either
 *
 * The plan styles this file with `tokens.color.*` / `tokens.space.*`;
 * `@gisik-nokma/ui` exports no `tokens` object. It exports a ROLE system, and
 * the way a shipped component in this repo reaches it is a BEM class whose
 * colours resolve to `var(--gn-…)` in `packages/ui/src/ui.css` — the same
 * answer `calendar-view.tsx` and `timeline-view.tsx` reached. This file added
 * NO role: the plan's `unreadDot` and `accentInk` are `accent` and
 * `accentText`, which the roster has carried since the first theme and which
 * `CONTRAST_PAIRS` already holds to 4.5:1 in both themes.
 *
 * ## The mention gate stays silent
 *
 * The coordination doc calls an editor-side "this person cannot see the ticket
 * you mentioned them on" warning permissible polish, NOT queued scope — the
 * gate is silent server-side. Nothing here tells a reader why a mention did or
 * did not arrive, and nothing should be added that does.
 */
export type InboxViewProps = {
  notifications: Notification[];
  userName: UserNameFn;
  onOpen: (notification: Notification) => void;
  onMarkRead: (id: string) => void;
  /**
   * Absent when there is no next page. `null` and `undefined` both mean
   * "nothing more to load" — the gateway reports exhaustion as
   * `nextCursor: null`, and a shell that maps that straight to this prop should
   * not have to invent an `undefined` on the way.
   */
  onLoadMore?: (() => void) | null;
};

export function InboxView(props: InboxViewProps) {
  return (
    <div className="gn-inbox">
      <ul className="gn-inbox__list">
        {props.notifications.map((notification) => (
          <li key={notification.id} className="gn-inbox__item">
            <button
              type="button"
              className="gn-inbox__row"
              data-notification-id={notification.id}
              /* `undefined` rather than `'false'`: an attribute that is absent
                 is a state a test can assert the ABSENCE of, while
                 `data-unread="false"` is a truthy attribute whose value only a
                 test that already suspected the bug would read. */
              data-unread={notification.read ? undefined : 'true'}
              onClick={() => {
                // Read rows are not marked again. The gateway's `markRead` is
                // idempotent, so this is not about correctness on the server —
                // it is about not spending a request per click on a row that
                // has nothing to change.
                if (!notification.read) props.onMarkRead(notification.id);
                props.onOpen(notification);
              }}
            >
              <span className="gn-inbox__glyph">
                <NotificationIcon kind={notification.kind} />
              </span>
              <span className="gn-inbox__text">
                <span className="gn-inbox__headline">
                  {notificationHeadline(notification, props.userName)}
                </span>
                {/* `title` is the SAME string, not a second one: `.gn-inbox__body`
                    clamps to a single line with `text-overflow: ellipsis`, and
                    the string most likely to overflow it is a contested
                    claim's refusal reason — the engine's own sentence about
                    somebody's move, which this file is otherwise at pains to
                    pass through character for character. Clipped with no way
                    to see the rest, that care buys nothing. `textContent`
                    assertions cannot see a clip, so the hover text is the
                    cheapest affordance that is also measurable. */}
                <span className="gn-inbox__body" title={notificationBody(notification)}>
                  {notificationBody(notification)}
                </span>
                {/* E5-35 — WHICH TICKET, for the one row whose body is not
                    already the title. A mention's body is the sender's excerpt,
                    so without this the row never said where the words were
                    written; `ticketTitle` was on the payload the whole time. */}
                {notificationTicketLabel(notification) !== null ? (
                  <span className="gn-inbox__ticket">{notificationTicketLabel(notification)}</span>
                ) : null}
                {/*
                  E5-35 — WHEN. `Notification.createdAt` is on every row this
                  component is handed and was rendered nowhere: `grep -n createdAt
                  inbox-view.tsx format.ts` returned nothing, so a reader met five
                  rows with no idea whether the newest was from an hour ago or
                  from March. Through `formatDateTime`, the one renderer every
                  other instant in this package goes through — the prototype draws
                  `{{ n.time }}` here (`EXPORT:606-637`).
                */}
                <span className="gn-inbox__time">{formatDateTime(notification.createdAt)}</span>
              </span>
              {/* Decorative twin of `data-unread` — the row's unread state is
                  already carried by the attribute above and by the heavier
                  headline; this is the same fact made visible, not a second
                  one, so it is hidden from the accessibility tree. */}
              {!notification.read && <span className="gn-inbox__dot" aria-hidden="true" />}
            </button>
          </li>
        ))}
      </ul>
      {props.onLoadMore ? (
        <button type="button" className="gn-inbox__more" onClick={props.onLoadMore}>
          Load more
        </button>
      ) : null}
    </div>
  );
}
