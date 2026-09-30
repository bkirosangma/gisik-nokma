import { describe, expect, it } from 'vitest';
import { parseRules } from './helpers/css-rules.js';
import { cssOf, expectRow, flatBoundaryOffenders, type RosterRow } from './helpers/style-patterns.js';

/** Styling refresh Plan B, Task B16 — cases 20.351–20.352 (§20.36). */
const ROWS: RosterRow[] = [
  { sheet: 'ui', selectors: '.ticket-type-list__row', pattern: 'P-ROW' },
  { sheet: 'ui', selectors: '.fields-editor__row', declarations: { background: 'var(--gn-surface-well)' } },
  { sheet: 'ui', selectors: '.ticket-type-list__move', pattern: 'P-GHOST', declarations: { 'min-width': '2.75rem' } },
  {
    sheet: 'ui',
    selectors: '.advisories-panel',
    declarations: { background: 'var(--gn-surface-well)', 'border-radius': 'var(--gn-radius-card)', 'border-left': '3px dashed var(--gn-warning)' },
  },
  { sheet: 'ui', selectors: '.ticket-type-editor__issues', declarations: { background: 'var(--gn-surface-well)', 'border-left': '3px solid var(--gn-danger)' } },
  { sheet: 'ui', selectors: ['.ticket-type-editor__refused', '.ticket-type-editor__invalid'], declarations: { background: 'var(--gn-surface-well)' } },
  { sheet: 'ui', selectors: '.ticket-type-editor__divergence-refused', declarations: { background: 'var(--gn-surface-well)' } },
  { sheet: 'ui', selectors: '.read-only-banner', pattern: 'P-WELL' },
  { sheet: 'ui', selectors: '.workflow-builder-screen__canvas', pattern: 'P-RAISED' },
  { sheet: 'ui', selectors: ['.state-inspector', '.transition-inspector'], pattern: 'P-RAISED' },
  { sheet: 'ui', selectors: '.inspector-panel__hint', pattern: 'P-RAISED' },
];
const KEPT = [
  '.state-mapping-dialog__confirm:disabled',
  '.icon-picker__choice:disabled',
  '.ticket-type-editor__divergence-move:disabled',
  '.workflow-rebind-dialog__confirm:disabled',
  '.workflow-builder-screen__name:disabled',
  '[data-style="neo"] .ticket-type-list__badge',
  '[data-style="neo"] .workflow-builder-screen__name',
  '[data-style="neo"] .ticket-type-list__row',
  '[data-style="neo"] .fields-editor__row',
  '.workflow-list__state',
];
const PREFIXES = [
  '.ticket-type',
  '.fields-editor',
  '.advisories-panel',
  '.read-only-banner',
  '.workflow-',
  '.state-',
  '.transition-inspector',
  '.inspector-panel',
  '.icon-picker',
  '.publish-controls',
];

function stillDeclared(list: string): boolean {
  return parseRules(cssOf('ui')).some((rule) => rule.selectors.join(', ') === list);
}

describe('20.351 the builder follows the rules', () => {
  it('20.351 every row; kept rules intact', () => {
    // CONTROL — every kept neo override and disabled fill is still declared (the list is non-empty, so this reads something).
    expect(KEPT.length).toBeGreaterThan(5);
    for (const kept of KEPT) expect(stillDeclared(kept), kept).toBe(true);
    for (const row of ROWS) expectRow(row);
  });
});

describe('20.352 no flat boundary in the builder', () => {
  it('20.352 none outside the kept list', () => {
    const css = cssOf('ui');
    // CONTROL — the scan reads the builder and ticket-type rules, not an empty set.
    const scanned = parseRules(css).filter((rule) => rule.selectors.some((s) => PREFIXES.some((p) => s.includes(p))));
    expect(scanned.length).toBeGreaterThan(80);
    expect(flatBoundaryOffenders(css, PREFIXES, KEPT)).toEqual([]);
  });
});
