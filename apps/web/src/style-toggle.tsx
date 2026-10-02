'use client';

import { useEffect, useState } from 'react';
import { SegmentedControl, type StyleName } from '@gisik-nokma/ui';

/**
 * `ReadonlyArray` is fine here, unlike the `Select` version this replaced:
 * `SegmentedControl`'s `options` prop is already `ReadonlyArray<…>`, so the
 * TS4104 workaround that forced a mutable array is gone with it.
 */
const OPTIONS: ReadonlyArray<{ value: StyleName; label: string }> = [
  { value: 'hig', label: 'Apple HIG' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'neo', label: 'Neumorphic' },
];

/**
 * One line per style, describing what the style actually DOES rather than
 * selling it. Checked against `tokens.ts` rather than written from
 * impression: `minimal` "has no shadow in either theme — its cards/fields are
 * flat" (its own docblock) and shares `hig`'s colour mapping outright
 * ("`minimal` needs no entry: its colours are" the same), so the honest
 * difference between those two is shadow alone. `neo`'s line is the owner's
 * own wording from the reference.
 */
const NOTES: Record<StyleName, string> = {
  hig: 'Apple HIG: the same palette as Minimal, with a light shadow lifting cards and fields off the page.',
  minimal:
    'Minimal: the same colours, no shadows at all. Cards and fields are flat, and spacing does the separating.',
  neo: 'Neumorphic: soft raised surfaces, no borders. Heavier on the eye, lighter on lines.',
};

/**
 * Style is a runtime axis parallel to theme, but with no "system" state:
 * `neo` is the default (case 13.345), not the absence of a choice — every
 * value, `hig` included, is only ever reached by an explicit stored pick.
 * `layout.tsx`'s `styleInitScript` applies the same default before first
 * paint; this component's initial state matches it on mount so the first
 * render agrees with what already painted, the same discipline `ThemeToggle`
 * follows for its own pre-paint script.
 *
 * ## CONTROL HISTORY, because this is the third shape this picker has had
 *
 * `SegmentedControl` → plain `<select>` → shared `Select` → `SegmentedControl`
 * again (owner, 2026-09-15, with a reference image: all three styles visible
 * at once, the chosen one raised, and a line under them describing the
 * choice). **This deliberately takes this ONE control back off the shared
 * `Select` that Phase 2 Wave A migrated it onto.** That rollout's point was
 * that no native `<select>` remained, and that still holds — this is a
 * segmented picker, not a native select — but the Select-rollout notes in
 * `Features.md` name this site, so they are corrected in the same change set.
 *
 * Three options shown at once is also the reason the label is a plain
 * `<span>` and not a `<label>`: there is no single form control to point at,
 * and `SegmentedControl` carries its own required `aria-label`.
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
    <div className="gn-account__appearance-group">
      <span className="gn-account__appearance-label">Style</span>
      <SegmentedControl options={OPTIONS} value={style} onChange={apply} aria-label="Style" />
      <p className="gn-account__appearance-note">{NOTES[style]}</p>
    </div>
  );
}
