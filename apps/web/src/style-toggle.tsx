'use client';

import { useEffect, useState } from 'react';
import { SegmentedControl, type StyleName } from '@gisik-nokma/ui';

const OPTIONS: ReadonlyArray<{ value: StyleName; label: string }> = [
  { value: 'hig', label: 'HIG' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'neo', label: 'Neu' },
];

/**
 * Style is a runtime axis parallel to theme, but with no "system" state:
 * `neo` is the default (case 13.345), not the absence of a choice — every
 * value, `hig` included, is only ever reached by an explicit stored pick.
 * `layout.tsx`'s `styleInitScript` applies the same default before first
 * paint; this component's initial state matches it on mount so the first
 * render agrees with what already painted, the same discipline `ThemeToggle`
 * follows for its own pre-paint script.
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

  return <SegmentedControl aria-label="Style" value={style} onChange={apply} options={OPTIONS} />;
}
