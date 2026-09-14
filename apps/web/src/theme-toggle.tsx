'use client';

import { useEffect, useState } from 'react';
import { Button } from '@gisik-nokma/ui';

type ThemeChoice = 'system' | 'light' | 'dark';
const ORDER: ThemeChoice[] = ['system', 'light', 'dark'];

/**
 * `stroke="currentColor"`, no fill literal — same reason `AppleMark` in
 * `app/sign-in/page.tsx` is inline rather than a fixed-colour asset: this
 * button's label colour (and thus the icon's) already varies by theme and
 * nav state, and `currentColor` is what makes the icon report no hit to
 * `packages/ui/test/token-discipline.test.ts` while still following it.
 */
function SunIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

/**
 * `system`'s own glyph — half-filled, not a resolved guess at the device's
 * actual preference. Tracking the real OS value would need `matchMedia`,
 * which this repo's jsdom test environment does not polyfill (no other test
 * in the tree calls it either); a static half-light/half-dark circle says
 * "follows the system" without needing that.
 */
function SystemIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
    </svg>
  );
}

/**
 * Three states, not two. `system` is the ABSENCE of a choice — it removes the
 * attribute and the stored key, so `themeStylesheet`'s
 * `prefers-color-scheme` arm takes over again. A two-state toggle would have
 * no way back to "whatever this device prefers" once a choice was made.
 */
export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>('system');

  useEffect(() => {
    const stored = localStorage.getItem('gn-theme');
    if (stored === 'light' || stored === 'dark') setChoice(stored);
  }, []);

  const apply = (next: ThemeChoice) => {
    setChoice(next);
    if (next === 'system') {
      delete document.documentElement.dataset['theme'];
      localStorage.removeItem('gn-theme');
    } else {
      document.documentElement.dataset['theme'] = next;
      localStorage.setItem('gn-theme', next);
    }
  };

  const next = ORDER[(ORDER.indexOf(choice) + 1) % ORDER.length] ?? 'system';
  const icon = choice === 'dark' ? <MoonIcon /> : choice === 'light' ? <SunIcon /> : <SystemIcon />;
  // The accessible name below still names all three states in full; only the
  // VISIBLE label collapses to an icon (same pattern as `AppNav`'s sign-out
  // button — see its own docblock on why the accessible name and the visible
  // label are allowed to diverge here).
  return (
    <Button
      className="gn-theme-toggle"
      aria-label={`Theme: ${choice}. Switch to ${next}.`}
      onClick={() => apply(next)}
    >
      {icon}
    </Button>
  );
}
