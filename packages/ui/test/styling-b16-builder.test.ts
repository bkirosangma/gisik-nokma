import { describe, expect, it } from 'vitest';
import { parseRules, ruleExactly, valueOf } from './helpers/css-rules.js';
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
  // W1 (2026-09-30, case 10.154): the States / Transitions panels replace the right-hand inspector (and its hint card).
  { sheet: 'ui', selectors: '.builder-panel', pattern: 'P-RAISED' },
  { sheet: 'ui', selectors: '.builder-row__body', pattern: 'P-WELL' },
  { sheet: 'ui', selectors: '.builder-row__head:hover', pattern: 'P-HOVER' },
  { sheet: 'ui', selectors: '.builder-row__head', declarations: { 'min-height': '2.75rem', background: 'transparent' } },
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
  '.builder-',
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

/**
 * W1 survivors (2026-09-30, case 10.154 / 13.771) — five stylesheet claims that `declarationsFor(...).toContain` and the
 * 20.351 roster could not see: a substring hit survives a THIRD grid track, a sticky column that also sticks when
 * stacked, a dropped `list-style`, or an emptied chevron rule.
 */
describe('10.154 the States / Transitions layout and row declarations', () => {
  const css = cssOf('ui');
  const SIDE_BY_SIDE = '@media (min-width: 64.0625rem)';
  const STACKED = '@media (max-width: 64rem)';

  it('10.154 the screen is TWO grid tracks — the 22rem left column and the canvas — and no third', () => {
    const layout = ruleExactly(css, '.workflow-builder-screen__layout');
    // CONTROL — the rule was found and reads as a grid, so the exact-value check below reads something.
    expect(valueOf(layout, 'display')).toBe('grid');
    const columns = valueOf(layout, 'grid-template-columns');
    expect(columns).toBe('minmax(0, 22rem) minmax(0, 1fr)');
    expect(columns?.match(/minmax\(/g)).toHaveLength(2);
    // The stacked arm is ONE track, so the two-column claim is about side by side only.
    expect(valueOf(ruleExactly(css, '.workflow-builder-screen__layout', STACKED), 'grid-template-columns')).toBe('minmax(0, 1fr)');
  });

  it('10.154 the left column is sticky and scrolls ONLY side by side; the base rule carries none of it; the two queries never overlap', () => {
    const sideBySide = ruleExactly(css, '.workflow-builder-screen__left', SIDE_BY_SIDE);
    expect(valueOf(sideBySide, 'position')).toBe('sticky');
    expect(valueOf(sideBySide, 'top')).toBe('1rem');
    expect(valueOf(sideBySide, 'max-height')).toBe('calc(100vh - 2rem)');
    expect(valueOf(sideBySide, 'overflow-y')).toBe('auto');

    // Stacked, the column is plain flow: the BASE rule (no at-rule) must not carry any of the four.
    const base = ruleExactly(css, '.workflow-builder-screen__left');
    // CONTROL — the base rule was found and does carry its own layout, so "absent" below is a reading and not an empty string.
    expect(valueOf(base, 'flex-direction')).toBe('column');
    for (const property of ['position', 'top', 'max-height', 'overflow-y']) expect(valueOf(base, property), property).toBeNull();

    // No viewport width matches both queries: min strictly above max, and contiguous (under one px, 1/16 rem).
    const min = Number(/min-width: ([\d.]+)rem/.exec(SIDE_BY_SIDE)?.[1]);
    const max = Number(/max-width: ([\d.]+)rem/.exec(STACKED)?.[1]);
    expect(Number.isFinite(min) && Number.isFinite(max)).toBe(true);
    expect(min).toBeGreaterThan(max);
    expect(min - max).toBeLessThanOrEqual(0.0625);
  });

  it('10.154 the panel lists carry no markers', () => {
    const list = ruleExactly(css, '.builder-panel__list');
    // CONTROL — the same rule still lays the list out as a column, so the marker check reads the right rule.
    expect(valueOf(list, 'flex-direction')).toBe('column');
    expect(valueOf(list, 'list-style')).toBe('none');
  });

  it('10.154 the chevron points right closed and turns down when the row is open', () => {
    const closed = ruleExactly(css, '.builder-row__chevron');
    expect(valueOf(closed, 'transform')).toBe('rotate(-45deg)');
    const open = ruleExactly(css, '.builder-row[data-open="true"] > .builder-row__head > .builder-row__chevron');
    expect(valueOf(open, 'transform')).toBe('rotate(45deg)');
  });

  /**
   * Survivor 6 — `.builder-row__body[hidden] { display: none }` — is an EQUIVALENT mutant TODAY: the body is a `<div hidden>`
   * when collapsed and no author rule gives `.builder-row__body` a `display`, so the user-agent's own `[hidden]` rule is what
   * hides it, and removing ours changes nothing observable. The removal is deliberately NOT asserted (a test for it could not
   * fail for a behavioural reason). What CAN fail for a real reason is the scenario where the rule starts to matter: an author
   * rule that gives the body a `display`, which beats the UA `[hidden]` and would paint every collapsed row's well.
   */
  it('10.154 a `display` on the row body is only allowed together with the `[hidden]` guard', () => {
    const naming = parseRules(css).filter((rule) => rule.selectors.includes('.builder-row__body'));
    // CONTROL — the scan reads the body's real rule (its well background), so "no display" below is a reading of a real rule.
    expect(naming.some((rule) => valueOf(rule.body, 'background') === 'var(--gn-surface-well)')).toBe(true);
    const displayed = naming.filter((rule) => valueOf(rule.body, 'display') !== null);
    if (displayed.length > 0) expect(valueOf(ruleExactly(css, '.builder-row__body[hidden]'), 'display')).toBe('none');
  });
});
