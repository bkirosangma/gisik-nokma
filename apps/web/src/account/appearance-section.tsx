import { StyleToggle } from '../style-toggle.js';
import { ThemeToggle } from '../theme-toggle.js';

/**
 * Both controls already work and are already tested (`style-toggle.test.tsx`,
 * `theme-toggle.test.tsx`) — this wraps them, it doesn't reimplement anything.
 * `ThemeToggle` moves here from `AppNav` (Step 4); `StyleToggle` already lived
 * on `/account` and is unchanged.
 */
export function AppearanceSection() {
  return (
    <section className="gn-account__section gn-account__appearance">
      <h2 className="gn-account__section-title">Appearance</h2>
      <StyleToggle />
      <ThemeToggle />
    </section>
  );
}
