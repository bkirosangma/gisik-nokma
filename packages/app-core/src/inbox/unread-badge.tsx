/**
 * The unread count, as a numbered badge.
 *
 * ⚠ CORRECTED 2026-09-21 (E2-25): this read "on the inbox's own entry point",
 * which is false — nothing mounts this component. The nav's inbox link draws a
 * DOT and puts the number in its accessible name (`inbox-nav-link.tsx:126-131`),
 * and `/inbox` itself paints no count either; measured across `apps/` and
 * `packages/`, this component has zero production renders. It is kept exported
 * and unreferenced, which the repo's own rule for controls (`ticket-sheet.tsx`)
 * says a component carried "in case" is not. Mounting it or deleting it is a
 * product decision, recorded by E2-25 and NOT taken here.
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
 * ## `role="img"`, because a bare `<span>` HAS NO ACCESSIBLE NAME TO GIVE
 *
 * The whole argument below — cap the glyph, keep the label truthful — rests on
 * the label being announced, and the first version of this component put
 * `aria-label` on a role-less `<span>`. ARIA maps that to the `generic` role,
 * where naming is PROHIBITED: a conforming AT is not required to expose the
 * label at all, so the design's one concession to screen-reader users could
 * simply not exist. Three tests appeared to disprove that and could not:
 * `getByLabelText` matches the ATTRIBUTE and never computes an accessible
 * name, so no assertion written with it can tell a named element from an
 * unnamed one carrying an ignored attribute.
 *
 * The repo's own precedent for this correction is
 * `workflow-builder/ui/read-only-banner.tsx`, which uses `role="status"` "so a
 * screen reader is told the same thing the sighted user is". This badge takes
 * `role="img"` INSTEAD, and the difference is the point: `status` is a live
 * region, and what a live region announces on update is its CONTENT — which
 * here is `99+`, the capped string this component exists to keep OUT of the
 * spoken answer. `role="img"` makes the children presentational, so the label
 * REPLACES the glyph rather than competing with it, which is exactly the
 * relationship the next paragraph describes. `img` also supports naming, which
 * is the property `generic` lacks.
 *
 * What that correction can and cannot be proved to do is stated plainly in
 * `test/inbox/unread-badge.test.tsx`: a role query reddens when the role is
 * removed, so the fix is witnessed as PRESENT — but jsdom is not a screen
 * reader, and no test in this repo can demonstrate what the old markup did in
 * one.
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
      role="img"
      data-capped={count > CAP ? 'true' : undefined}
      aria-label={`${count} unread notification${count === 1 ? '' : 's'}`}
    >
      {count > CAP ? `${CAP}+` : String(count)}
    </span>
  );
}
