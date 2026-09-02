'use client';

import { useEffect, useState } from 'react';
import { Button } from '@gisik-nokma/ui';

type ThemeChoice = 'system' | 'light' | 'dark';
const ORDER: ThemeChoice[] = ['system', 'light', 'dark'];

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
  return (
    <Button aria-label={`Theme: ${choice}. Switch to ${next}.`} onClick={() => apply(next)}>
      theme: {choice}
    </Button>
  );
}
