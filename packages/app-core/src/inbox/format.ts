import { istDayOf } from '@gisik-nokma/domain';
import type {
  AssignmentNotificationPayload,
  ContestedClaimNotificationPayload,
  DateApproachingNotificationPayload,
  MentionNotificationPayload,
  Notification,
  StaleTicketNotificationPayload,
} from '@gisik-nokma/domain';
import { dueClaimLabel, formatClaimDate, type UserNameFn } from '../claims/claim-labels.js';

/**
 * The inbox's copy. Headlines are the claims' own attributed wording; there is
 * no urgency vocabulary here because there is no urgency field to read — Task
 * 3's payload schemas are `.strict()` and carry nothing an "URGENT" could be
 * derived from. The most this file can say is what somebody claimed and who
 * claimed it.
 *
 * ## The date-approaching headline is not a second spelling of the calendar's
 *
 * It IS `dueClaimLabel`, the function the month grid and the timeline already
 * print, called with the payload's own flattened claim. The alternative — a
 * sentence composed here — would be a third place in the product that renders
 * "needed by 30 Aug — Kiro's claim", free to drift from the two that agree, and
 * the drift would show up as the inbox and the calendar describing the same
 * claim differently on one screen. `test/inbox/format.test.ts` asserts the
 * headline against the imported function AND against the literal shape, which are two
 * different questions: whether it is the same label, and whether that label is
 * still the one §7 specifies.
 *
 * ## `enteredAt` is an INSTANT, and the only field here that is
 *
 * Every other day in these payloads arrives as a claimed `YYYY-MM-DD`.
 * `stale-ticket.enteredAt` is the ledger's `server_time`, so it goes through
 * `istDayOf` — never a ten-character slice. `2026-08-01T19:00:00.000Z` is
 * 00:30 on 2 Aug in IST; "since 1 Aug" would be the inbox quietly disagreeing
 * with the ticket history sitting beside it and with the calendar cell that
 * same instant lands in.
 *
 * ## A malformed instant is handed back verbatim, not thrown at the reader
 *
 * `istDayOf` refuses anything that is not a real ISO instant with a stated
 * offset — correctly — but the payload schema types `enteredAt` as a non-empty
 * string, so an unparseable value can be stored and delivered. Letting the
 * refusal escape would take down the WHOLE list on one bad row, which is the
 * delivered-mail ruling failing in the one place it matters. So it degrades the
 * way `formatClaimDate` already degrades on an unrenderable day: the input is
 * printed VERBATIM. Nothing is invented, the row stays readable, and the
 * garbage is visible on screen rather than swallowed into a plausible date.
 * Pinned in `test/inbox/format.test.ts`.
 */
function sinceDay(enteredAt: string): string {
  try {
    return formatClaimDate(istDayOf(enteredAt));
  } catch {
    // `istDayOf` throws RangeError and only RangeError; anything else escaping
    // here would be a bug worth seeing, but there is no second thrower to
    // narrow against without restating its contract. Verbatim, as above.
    return enteredAt;
  }
}

/**
 * The casts below are UNCHECKED, and that is inherent to `Notification` rather
 * than a shortcut taken here: the domain type pairs a `kind` with a
 * `NotificationPayload` union and the two are not correlated, so narrowing on
 * `kind` tells the compiler nothing about `payload`. `parseNotification` is the
 * boundary that makes them agree — it validates the payload against its kind's
 * own schema — and every row reaching this file has come through it. A
 * discriminated union in the domain would remove the casts; that is Task 3's
 * type to change, not this file's, and it is recorded rather than done.
 */
export function notificationHeadline(notification: Notification, userName: UserNameFn): string {
  switch (notification.kind) {
    case 'assignment': {
      const payload = notification.payload as AssignmentNotificationPayload;
      return `${userName(payload.assignedBy)} assigned this to you`;
    }
    case 'mention': {
      const payload = notification.payload as MentionNotificationPayload;
      return `${userName(payload.mentionedBy)} mentioned you`;
    }
    case 'contested-claim': {
      const payload = notification.payload as ContestedClaimNotificationPayload;
      return `Your claim was contested — ${payload.rule}`;
    }
    case 'date-approaching': {
      const payload = notification.payload as DateApproachingNotificationPayload;
      return dueClaimLabel(payload.claim, userName);
    }
    case 'stale-ticket': {
      const payload = notification.payload as StaleTicketNotificationPayload;
      const state = payload.stateName ?? payload.stateId;
      return `In ${state} since ${sinceDay(payload.enteredAt)} — moved there by ${userName(payload.enteredBy)}`;
    }
    default: {
      // A sixth kind is a COMPILE error rather than a headline-less row. The
      // arms above return strings the compiler cannot check; their VALUES are
      // pinned one by one in `test/inbox/format.test.ts`.
      const exhaustive: never = notification.kind;
      throw new RangeError(`unknown notification kind: ${String(exhaustive)}`);
    }
  }
}

/**
 * The body is the claim's own words. A contested claim's body is the rule
 * engine's refusal reason VERBATIM — never paraphrased, never prefixed —
 * because the reason is the engine's sentence about someone's move and this
 * surface has no standing to rewrite it. A mention's body is the excerpt as
 * captured, and it is NOT re-checked against the reader's present visibility:
 * the letter was delivered.
 */
export function notificationBody(notification: Notification): string {
  switch (notification.kind) {
    case 'assignment':
      return (notification.payload as AssignmentNotificationPayload).ticketTitle;
    case 'mention':
      return (notification.payload as MentionNotificationPayload).excerpt;
    case 'contested-claim':
      return (notification.payload as ContestedClaimNotificationPayload).reason;
    case 'date-approaching':
      return (notification.payload as DateApproachingNotificationPayload).ticketTitle;
    case 'stale-ticket':
      return (notification.payload as StaleTicketNotificationPayload).ticketTitle;
    default: {
      const exhaustive: never = notification.kind;
      throw new RangeError(`unknown notification kind: ${String(exhaustive)}`);
    }
  }
}

/**
 * The deep-link target. Every one of the five payloads names its ticket — the
 * `contested-claim` schema names it beside the contested event rather than
 * beside a title, which is why this reads the field rather than switching on
 * the kind. `test/inbox/format.test.ts` walks `NOTIFICATION_KINDS` and asserts
 * a ticket id comes back for each, so a sixth kind whose payload omitted `ticketId` would
 * be caught here rather than by a link that goes nowhere.
 */
export function notificationTicketId(notification: Notification): string {
  return (notification.payload as { ticketId: string }).ticketId;
}
