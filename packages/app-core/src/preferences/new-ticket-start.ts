/**
 * Where a new ticket starts, remembered for the person who chose it — the
 * answer to the Create ticket dialog's "Starts in the backlog?" switch.
 *
 * ## This is `apps/web/src/use-last-workspace.ts`'s pattern, one question over
 *
 * The owner's ruling (2026-09-23) was *"same as how workspace and project is
 * remembered"*, so this follows that pair rather than inventing a third
 * convention. Three things are copied deliberately, and each was paid for:
 *
 * - **The record is KEYED BY USER.** `localStorage` outlives a session. Sign
 *   out, hand the laptop over, and a bare key starts the next person's tickets
 *   in the previous person's state — the same defect `useLastWorkspace`'s own
 *   docblock records for the workspace NAME, and case 11.169 for the inbox
 *   count. The stored value therefore carries the user it was written for, and
 *   a record belonging to anyone else answers the default. It is not cleared on
 *   sign-out — it is simply not honoured, which also survives the case where
 *   sign-out never runs at all.
 * - **Every storage access is wrapped.** A browser with site data blocked
 *   throws on the ACCESSOR, not on the value, so a `try`/`catch` around the
 *   access is the only shape that survives it. A lost memory is a lost
 *   convenience; a dialog that refused to render because it could not read one
 *   would be worse, so every failure answers the default.
 * - **`'backlog'` is the default**, matching the switch's own shipped position
 *   (ON) and the universal state a ticket is born into when nobody says
 *   otherwise (backlog/closed spec §1.3).
 *
 * ## Two divergences from the sibling, both deliberate
 *
 * **It is a synchronous pair, not a hook.** The workspace and project hooks are
 * hooks because they feed a nav that renders before storage is read, and they
 * need a third `unknown` state to avoid flashing a false sentence during that
 * window. Nothing here renders before it is read: the Create ticket dialog reads
 * this exactly ONCE per open, inside the effect that already resets the dialog's
 * draft (`NewTicketDialog`'s "empty on OPEN"), which runs on the client, after a
 * user action, and never during the server render. There is no window to name and
 * therefore no `unknown` state to carry — a fourth state here would be a state
 * nothing could ever observe.
 *
 * **It is in `packages/app-core`, not `apps/web/src`.** The control it belongs
 * to lives there. Putting the memory one layer up would mean threading the
 * remembered value down and the change back up through `CreateTicketFlow` for
 * no gain, and the dialog needs the value at the instant it opens rather than at
 * the instant its parent re-renders.
 *
 * ## What it does NOT do
 *
 * It does not remember anything for a viewer with no session. `NewTicketDialog`'s
 * `userId` is `CreateTicketFlow`'s `currentUserId`, which is `''` when signed out
 * (`page.tsx` names the sentinel). `''` is not a person, so nothing is written
 * for it and nothing is read back — the dialog still renders, at the default.
 * That is the same answer `rememberProject` gives a `null` user, with the empty
 * string this shell uses for the same fact.
 */

/**
 * The one key. Exported so the cases that assert the stored SHAPE — and that a
 * record belonging to another user is refused — can read the bytes this module
 * wrote rather than a second spelling of the key that could drift from it.
 */
export const NEW_TICKET_START_KEY = 'gn-new-ticket-start';

/**
 * Where a ticket is born. The domain's own union (`ticketCreatedPayload.start`),
 * restated here because `packages/app-core` is where the dialog's draft lives and
 * the two are not the same type: this one is the CONTROL's two positions, and the
 * draft's `start` is what it resolves to. Keeping them as one name would invite a
 * reader to think the switch's state is the payload's field.
 */
export type BirthStart = 'backlog' | 'focus';

/** ON, and the answer every failure gives. See the docblock above. */
export const DEFAULT_BIRTH_START: BirthStart = 'backlog';

/**
 * The remembered answer for this user, or the default.
 *
 * Answers the default for all five ways there is nothing to return: no session,
 * a throwing accessor, a missing key, unparseable text, and a record whose shape
 * or owner this build does not recognise. Collapsing them costs nothing — the
 * caller's only move on any of them is to show the default — and it means the
 * four failure modes cannot come back wearing a fifth meaning later.
 */
export function readNewTicketStart(userId: string): BirthStart {
  if (userId === '') return DEFAULT_BIRTH_START;

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(NEW_TICKET_START_KEY);
  } catch {
    return DEFAULT_BIRTH_START;
  }
  if (raw === null) return DEFAULT_BIRTH_START;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Hand-edited, or written by an older shape of this key.
    return DEFAULT_BIRTH_START;
  }
  if (typeof parsed !== 'object' || parsed === null) return DEFAULT_BIRTH_START;

  const { userId: storedUserId, start } = parsed as { userId?: unknown; start?: unknown };
  if (typeof storedUserId !== 'string') return DEFAULT_BIRTH_START;
  // SOMEONE ELSE'S. See the docblock — this is the whole reason for the key's
  // shape, and it is checked before the value is handed back, never after.
  if (storedUserId !== userId) return DEFAULT_BIRTH_START;
  // The union is the door. A value outside it — hand-edited, or written by an
  // older shape of this key — must not reach the switch: it would render neither
  // ON nor OFF, which is a control with no position rather than a wrong one.
  if (start !== 'backlog' && start !== 'focus') return DEFAULT_BIRTH_START;

  return start;
}

/**
 * Remembers the answer for this user, replacing whatever was there.
 *
 * A no-op with no session, for the reason `readNewTicketStart` answers the
 * default: nothing is remembered FOR anybody, so nothing is written.
 */
export function rememberNewTicketStart(userId: string, start: BirthStart): void {
  if (userId === '') return;

  try {
    window.localStorage.setItem(NEW_TICKET_START_KEY, JSON.stringify({ userId, start }));
  } catch {
    // A private window, or site data blocked. The switch still moved and the
    // draft still carries the answer; only the memory of it is lost, and a
    // dialog that refused the toggle would be worse.
  }
}
