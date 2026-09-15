'use client';

import { useEffect, useState } from 'react';
import { SegmentedControl } from '@gisik-nokma/ui';

type ThemeChoice = 'system' | 'light' | 'dark';

/**
 * THREE SEGMENTS, THOUGH THE REFERENCE IMAGE SHOWS TWO — the one place this
 * Appearance rebuild departs from what the owner drew, and it is flagged
 * rather than silently decided.
 *
 * The reference shows `Light | Dark`. Shipping exactly that would delete
 * `system`, and this component's previous docblock had already argued why
 * that is wrong, in words worth keeping: "`system` is the ABSENCE of a
 * choice — it removes the attribute and the stored key, so
 * `themeStylesheet`'s `prefers-color-scheme` arm takes over again. A
 * two-state toggle would have no way back to 'whatever this device prefers'
 * once a choice was made." A person who once tapped Light could never return
 * to following their OS, including its automatic day/night switch, and
 * nothing else in the product offers that.
 *
 * `system` is also the DEFAULT, so a two-segment control would start with
 * neither segment selected and no way to express the state it is actually in.
 *
 * Reverting to two is a one-line change here plus its two cases — say the
 * word.
 */
const OPTIONS: ReadonlyArray<{ value: ThemeChoice; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

/**
 * The three icons this component used to carry (sun, moon, and a half-filled
 * "system" circle) are gone with the cycle button they labelled: a segmented
 * control shows all three states as words, so an icon standing in for the
 * current one has nothing left to do. Their `stroke="currentColor"` note is
 * likewise moot — there is no longer an icon to keep token-clean.
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

  return (
    <div className="gn-account__appearance-group">
      <span className="gn-account__appearance-label">Theme</span>
      <SegmentedControl options={OPTIONS} value={choice} onChange={apply} aria-label="Theme" />
    </div>
  );
}
