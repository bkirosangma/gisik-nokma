/**
 * Which destinations a person has put in the phone bottom bar, and in what order.
 *
 * Owner ruling, 2026-10-01 (mobile-web spec P3/P4): *"a bottom tab bar … customizable"*, and the choice
 * is *"remembered per device (like Appearance: local storage, keyed by user, never the server)"*.
 * Four slots the person chooses; **More** is always the fifth control and is NOT a slot, so nothing a
 * person removes from the bar is ever unreachable.
 *
 * ## `workflow-collapse.ts`'s three rules, copied rather than reinvented
 *
 * - **Keyed by user.** `localStorage` outlives a session; a bare key would hand the next person on a
 *   shared phone the previous person's bar. The stored document carries its `userId` and is not
 *   honoured for anyone else (it is not cleared on sign-out; it is simply not read, which also
 *   survives a sign-out that never ran).
 * - **Every storage access is wrapped.** A browser with site data blocked throws on the ACCESSOR, so
 *   a `try`/`catch` around the access is the only shape that survives. A lost memory is a lost
 *   convenience, never a bar that refuses to render.
 * - **The default is carried out.** Every failure answers `DEFAULT_BAR`, so a viewer whose storage is
 *   unreadable still gets the owner's default bar and loses only the memory of their edits.
 *
 * The door is on BOTH sides: `rememberBottomBar` and `readBottomBar` each cut to four, drop duplicates
 * and drop ids this build does not know — a hand-edited or older document cannot put a fifth slot, or
 * a destination with no route, into the bar.
 */

/** Everything a slot can hold. The scoped ones (all but `notes`, `inbox` and `my-work`) need a workspace to resolve. */
export type BarDestination =
  | 'board'
  | 'my-work'
  | 'notes'
  | 'inbox'
  | 'list'
  | 'calendar'
  | 'timeline'
  | 'backlog'
  | 'members';

/** Declared once: the type above, the editor's "Available" list and the read-side door all derive from this. */
export const BAR_DESTINATIONS: readonly BarDestination[] = [
  'board',
  'my-work',
  'notes',
  'inbox',
  'list',
  'calendar',
  'timeline',
  'backlog',
  'members',
];

/** The one key. Exported so a case can read the bytes this module wrote rather than a second spelling. */
export const BOTTOM_BAR_KEY = 'gn-bottom-bar';

/** The owner's default: Board · My work · Notes · Inbox (· More). */
export const DEFAULT_BAR: readonly BarDestination[] = ['board', 'my-work', 'notes', 'inbox'];

/** Four slots; More is the fifth control and is not counted. */
export const MAX_SLOTS = 4;

function isDestination(value: unknown): value is BarDestination {
  return typeof value === 'string' && (BAR_DESTINATIONS as readonly string[]).includes(value);
}

/** The door: known ids only, first occurrence wins, at most `MAX_SLOTS`. */
function sanitize(slots: readonly unknown[]): BarDestination[] {
  const out: BarDestination[] = [];
  for (const slot of slots) {
    if (!isDestination(slot) || out.includes(slot)) continue;
    out.push(slot);
    if (out.length === MAX_SLOTS) break;
  }
  return out;
}

/**
 * This person's bar, or the default — for every way there is nothing to return: no session id, a
 * throwing accessor, a missing key, unparseable text, a document that is not an object, one that
 * belongs to somebody else, and one whose `slots` is not an array. A saved EMPTY bar is a real choice
 * (an all-More bar) and is returned as `[]`, never promoted back to the default.
 */
export function readBottomBar(userId: string): BarDestination[] {
  if (userId === '') return [...DEFAULT_BAR];

  let raw: string | null;
  try {
    raw = window.localStorage.getItem(BOTTOM_BAR_KEY);
  } catch {
    return [...DEFAULT_BAR];
  }
  if (raw === null) return [...DEFAULT_BAR];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [...DEFAULT_BAR];
  }
  if (typeof parsed !== 'object' || parsed === null) return [...DEFAULT_BAR];

  const { userId: storedUserId, slots } = parsed as { userId?: unknown; slots?: unknown };
  // SOMEONE ELSE'S: checked before the value is handed back, never after.
  if (storedUserId !== userId) return [...DEFAULT_BAR];
  if (!Array.isArray(slots)) return [...DEFAULT_BAR];
  return sanitize(slots);
}

/** Remembers this person's bar (cut to the door above). A no-op with no session id; a failed write is swallowed. */
export function rememberBottomBar(userId: string, slots: readonly BarDestination[]): void {
  if (userId === '') return;
  try {
    window.localStorage.setItem(BOTTOM_BAR_KEY, JSON.stringify({ userId, slots: sanitize(slots) }));
  } catch {
    // Blocked site data or a full quota: a lost convenience, not a failure to surface from a click handler.
  }
}

/** Back to the default: the record is removed, so a later default change reaches this person too. */
export function resetBottomBar(userId: string): void {
  if (userId === '') return;
  try {
    window.localStorage.removeItem(BOTTOM_BAR_KEY);
  } catch {
    // As above.
  }
}
