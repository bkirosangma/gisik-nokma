/**
 * The unread count, on the inbox's own entry point.
 *
 * ## Hidden when there is nothing to say
 *
 * A zero badge is a permanent dot on a navigation item that means "no news",
 * which is the opposite of what a badge is for. The guard is `count <= 0`, not
 * `count === 0`: a count is a quantity of letters and a negative one is not a
 * smaller quantity, it is a broken input — `unreadCount()` crosses a network in
 * Task 14's adapter, and a badge reading `-1` would be this component
 * faithfully rendering a bug into the chrome. Both spellings agree on every
 * count a healthy server sends, which is exactly why the difference has to be
 * pinned by a test rather than left to whichever was typed first;
 * `test/inbox/unread-badge.test.tsx` renders a negative count.
 *
 * ## The visible text caps; the accessible name does NOT
 *
 * Past ninety-nine the badge shows `99+`, because the exact number stops being
 * information and starts being a layout problem. The label keeps the real
 * total: a screen reader user who is told "99+" learns strictly less than a
 * sighted user, who at least sees a badge whose size says "many". So the label
 * says `137 unread notifications` while the glyph says `99+`, and the two are
 * asserted against each other rather than each against itself.
 *
 * ## No colour is named here
 *
 * The badge is `.gn-inbox__badge` and its two colours resolve in
 * `packages/ui/src/ui.css` to `var(--gn-accent)` and `var(--gn-accent-text)` —
 * the pair `CONTRAST_PAIRS` already holds to 4.5:1 in both themes. The plan
 * asks for `tokens.color.unreadDot` and `tokens.color.accentInk`; there is no
 * `tokens` object in `@gisik-nokma/ui`, and those two names are the existing
 * `accent`/`accentText` roles wearing new words. Inventing a role per word
 * would have been two more ways to say what the roster already says — the same
 * finding Task 9 made about five of its six colour names.
 */
export type UnreadBadgeProps = { count: number };

/** The point past which the exact number is noise. */
const CAP = 99;

export function UnreadBadge({ count }: UnreadBadgeProps) {
  if (count <= 0) return null;
  return (
    <span
      className="gn-inbox__badge"
      data-capped={count > CAP ? 'true' : undefined}
      aria-label={`${count} unread notification${count === 1 ? '' : 's'}`}
    >
      {count > CAP ? `${CAP}+` : String(count)}
    </span>
  );
}
