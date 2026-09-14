'use client';

import { useEffect, useState } from 'react';
import { Select, type StyleName } from '@gisik-nokma/ui';

// Not `ReadonlyArray` (the pre-migration type): `Select`'s `options` prop is typed
// `SelectOption[]`, a mutable array — `readonly` here fails typecheck (TS4104) since
// `Select`'s two other call sites (`fields-editor.tsx`, `ticket-type-editor-screen.tsx`) each
// pass a fresh `.map()` result, never hitting this. `OPTIONS` itself is still never mutated.
const OPTIONS: Array<{ value: StyleName; label: string }> = [
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
 * Moved off `AppNav` onto `/account` (owner request), first rendered as a
 * plain `<select>` (the same `<label htmlFor>` + `<select>` pair
 * `members/page.tsx` used for its invite form at the time), then migrated
 * onto the shared `Select` component in Phase 2 Wave A alongside that same
 * invite form — both control families now share one component rather than
 * two independent native-`<select>` conventions.
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
      <span>Style</span>{' '}
      <Select
        options={OPTIONS}
        value={style}
        onChange={(value) => {
          if (isStyleName(value)) apply(value);
        }}
        aria-label="Style"
      />
    </p>
  );
}
