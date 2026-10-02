/**
 * The look-not-touch banner (Pinned UI copy).
 *
 * Read-only is not the same as hidden: everything on these screens stays
 * VISIBLE to a member — the states, the rules, the bindings, the counts.
 * Visibility of truth is not gated; changing it is. So the banner says what a
 * member cannot do rather than the screen quietly omitting what it is looking
 * at, and `access.test.tsx` pins that by counting: the member's builder screen
 * carries exactly the same value-bearing controls as the admin's, every one of
 * them disabled, and strictly fewer buttons.
 *
 * `role="status"` so a screen reader is told the same thing the sighted user
 * is, without stealing focus — the banner is context, not an interruption.
 *
 * NO PROPS, deliberately. The copy is one sentence covering both areas
 * ("workflows and ticket types") and is pinned character for character, so
 * there is nothing to parameterise; a `role`/`area` prop would invite four
 * near-identical spellings of one pinned string.
 *
 * COLOUR ROUTE, corrected against the shipped repo — the third time this plan
 * has needed the same correction, after Task 8 (issues panel) and Task 9
 * (publish controls). The plan's Task 12 snippet imports `tokens` from
 * `@gisik-nokma/ui` and reads `tokens.workflowBuilder.panelBorder` /
 * `.textMuted` into inline styles. NO SUCH EXPORT EXISTS: packages/ui/src/
 * tokens.ts exports `primitives`, `themes`, `colorOf`, `cssVariableName` and
 * `themeStylesheet`, and TOKEN_ROLES carries no workflow-builder roles. The
 * route Task 5 settled for this plan's components holds here too — a BEM class
 * in the TSX, the colours in packages/ui/src/ui.css as `var(--gn-*)` against
 * roles that already exist (`--gn-border`, `--gn-text-muted`,
 * `--gn-surface-sunken`), and no new roles. packages/ui/src is scanned by
 * token-discipline.test.ts, `.css` included, so a literal in either place
 * fails the build rather than shipping.
 */
export function ReadOnlyBanner() {
  return (
    <p className="read-only-banner" role="status">
      You can look, but not change anything. Only a workspace owner or admin can change workflows and ticket types.
    </p>
  );
}
