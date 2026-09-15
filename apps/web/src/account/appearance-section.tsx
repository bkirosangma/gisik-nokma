import { StyleToggle } from '../style-toggle.js';
import { ThemeToggle } from '../theme-toggle.js';

/**
 * Both controls already work and are already tested (`style-toggle.test.tsx`,
 * `theme-toggle.test.tsx`) — this composes them, it doesn't reimplement
 * anything. `ThemeToggle` moved here from `AppNav` (Step 4); `StyleToggle`
 * already lived on `/account`.
 *
 * Rebuilt to the owner's reference image (2026-09-15): each axis is a labelled
 * segmented control showing every option at once, Style carrying a line that
 * describes the chosen style, and one footnote closing the card. The card has
 * no counterpart in the desktop prototype's own `isAccount` screen — Appearance
 * is this page's own section per the spec's §4 — so the reference image is the
 * only design authority for it, and `SegmentedControl` is the product's
 * existing picker rather than a new one invented for this card.
 *
 * The footnote is TRUE, which is why it is here: both axes are stored in
 * `localStorage` (`gn-style`, `gn-theme`) and applied to `documentElement`,
 * never sent to the server, so the choice really is per device and really is
 * invisible to everyone else. Nothing in this card is a claim the code cannot
 * back.
 */
export function AppearanceSection() {
  return (
    <section className="gn-account__section gn-account__appearance">
      <h2 className="gn-account__section-title">Appearance</h2>
      <StyleToggle />
      <ThemeToggle />
      <p className="gn-account__note">
        Appearance is per device, not per workspace — nobody else sees your choice.
      </p>
    </section>
  );
}
