'use client';

import { useEffect, useState } from 'react';
import type { StyleName } from '@gisik-nokma/ui';

const OPTIONS: ReadonlyArray<{ value: StyleName; label: string }> = [
  { value: 'hig', label: 'HIG' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'neo', label: 'Neu' },
];

function isStyleName(value: string): value is StyleName {
  return value === 'hig' || value === 'minimal' || value === 'neo';
}

/**
 * Style is a runtime axis parallel to theme, but with no "system" state:
 * `neo` is the default (case 13.345), not the absence of a choice — every
 * value, `hig` included, is only ever reached by an explicit stored pick.
 * `layout.tsx`'s `styleInitScript` applies the same default before first
 * paint; this component's initial state matches it on mount so the first
 * render agrees with what already painted, the same discipline `ThemeToggle`
 * follows for its own pre-paint script.
 *
 * Moved off `AppNav` onto `/account` (owner request) and rendered as a
 * `<select>`, not `SegmentedControl` — the same `<label htmlFor>` + `<select>`
 * pair `members/page.tsx` already uses for its invite form, rather than a new
 * control convention for one field. Living on a settled preferences page
 * rather than the persistent nav is what makes a dropdown the right shape
 * here: it no longer needs to announce all three options at a glance on
 * every screen, only let a visiting reader change one.
 */
export function StyleToggle() {
  const [style, setStyle] = useState<StyleName>('neo');

  useEffect(() => {
    const stored = localStorage.getItem('gn-style');
    if (stored === 'hig' || stored === 'minimal' || stored === 'neo') setStyle(stored);
  }, []);

  const apply = (next: StyleName) => {
    setStyle(next);
    document.documentElement.dataset['style'] = next;
    localStorage.setItem('gn-style', next);
  };

  return (
    <p>
      <label htmlFor="gn-style">Style</label>{' '}
      <select
        id="gn-style"
        value={style}
        onChange={(event) => {
          const { value } = event.target;
          if (isStyleName(value)) apply(value);
        }}
      >
        {OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </p>
  );
}
