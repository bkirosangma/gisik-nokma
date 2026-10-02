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

  it('10.154 the left column scrolls on its own ONLY side by side; the base rule carries none of it; the two queries never overlap', () => {
    const sideBySide = ruleExactly(css, '.workflow-builder-screen__left', SIDE_BY_SIDE);
    // W1d (2026-10-01, case 10.161): no longer sticky — the screen is bounded to the viewport and the column fills its track.
    expect(valueOf(sideBySide, 'overflow-y')).toBe('auto');
    expect(valueOf(sideBySide, 'overscroll-behavior')).toBe('contain');
    expect(valueOf(sideBySide, 'align-self')).toBe('stretch');
    expect(valueOf(sideBySide, 'position')).toBeNull();

    // Stacked, the column is plain flow: the BASE rule (no at-rule) must not carry any of them.
    const base = ruleExactly(css, '.workflow-builder-screen__left');
    // CONTROL — the base rule was found and does carry its own layout, so "absent" below is a reading and not an empty string.
    expect(valueOf(base, 'flex-direction')).toBe('column');
    for (const property of ['position', 'top', 'max-height', 'overflow-y', 'overscroll-behavior', 'align-self']) expect(valueOf(base, property), property).toBeNull();

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

/**
 * W1 polish (2026-10-01, cases 10.157–10.161) — the stylesheet half of four owner-approved fixes. Browser-only claims are
 * 10.162/10.163 (🧪); everything here is a contract on declarations, each asserted by exact value with a control in the same `it`.
 */
describe('10.157 the Add rule trigger has a 44px hit box and the drawn box is unchanged', () => {
  const css = cssOf('ui');
  const floor = 44;
  const px = (rem: string | null): number => Number(/^(-?[\d.]+)rem$/.exec(rem ?? '')?.[1]) * 16;

  it('10.157 a transparent ::before, centred, 2.75rem tall, on a positioned trigger', () => {
    // CONTROL — the trigger's own reset rule is intact (bare: no border, no fill), so the slop is what adds the 44.
    const reset = ruleExactly(css, ['.gn-board__empty-create', '.add-rule-menu__trigger']);
    expect(valueOf(reset, 'border')).toBe('none');
    expect(valueOf(reset, 'padding')).toBe('0');
    expect(valueOf(ruleExactly(css, '.add-rule-menu__trigger'), 'position')).toBe('relative');
    const slop = ruleExactly(css, '.add-rule-menu__trigger::before');
    expect(valueOf(slop, 'content')).toBe("''");
    expect(valueOf(slop, 'position')).toBe('absolute');
    expect(px(valueOf(slop, 'height'))).toBeGreaterThanOrEqual(floor);
    // Centred on the control, so the extra height is split above and below.
    expect(valueOf(slop, 'top')).toBe('50%');
    expect(px(valueOf(slop, 'margin-top'))).toBe(-px(valueOf(slop, 'height')) / 2);
    // It paints nothing.
    for (const property of ['background', 'border', 'box-shadow']) expect(valueOf(slop, property), property).toBeNull();
  });

  it('10.157 the list is positioned, so the first item (painted after the trigger) wins the overlap under the trigger\'s slop', () => {
    expect(valueOf(ruleExactly(css, '.add-rule-menu__list'), 'position')).toBe('relative');
  });
});

describe('10.158 the Add rule menu items have a 44px hit box', () => {
  const css = cssOf('ui');
  it('10.158 an item is at least 2.75rem tall, a quiet row that washes on hover', () => {
    const item = ruleExactly(css, '.add-rule-menu__item');
    // CONTROL — the rule reads as the reset it is (no UA chrome), so the height check reads the real rule.
    expect(valueOf(item, 'border')).toBe('none');
    expect(valueOf(item, 'background')).toBe('transparent');
    expect(valueOf(item, 'min-height')).toBe('2.75rem');
    expect(valueOf(item, 'width')).toBe('100%');
    expect(valueOf(ruleExactly(css, '.add-rule-menu__item:hover'), 'background')).toBe('var(--gn-fill-quaternary)');
  });

  it('10.158 a keyboard-focused item shows the product focus ring (2px, --gn-focus-ring), like the panel row heads beside it', () => {
    // CONTROL — the row head's focus rule has this exact shape, so "the product ring" is read off a rule that is really there.
    const head = ruleExactly(css, '.builder-row__head:focus-visible');
    expect(valueOf(head, 'outline')).toBe('2px solid var(--gn-focus-ring)');
    expect(valueOf(head, 'outline-offset')).toBe('0');
    const item = ruleExactly(css, '.add-rule-menu__item:focus-visible');
    expect(valueOf(item, 'outline')).toBe('2px solid var(--gn-focus-ring)');
    expect(valueOf(item, 'outline-offset')).toBe('0');
  });
});

describe('10.159 the destructive buttons inside the well are quiet danger buttons', () => {
  const css = cssOf('ui');
  const QUIET = '.gn-button.builder-quiet-danger';

  it('10.159 the builder class carries METRICS only (44px, no paint, no hover or press arm); the paint is the danger-quiet variant', () => {
    // CONTROL — the filled variant still fills, and the one quiet treatment still outlines, so "no paint here" below means
    // the builder rule defers to a real variant rather than that nothing paints.
    expect(valueOf(ruleExactly(css, '.gn-button--danger'), 'background')).toBe('var(--gn-danger)');
    const variant = ruleExactly(css, '.gn-button--danger-quiet');
    expect(valueOf(variant, 'background')).toBe('transparent');
    expect(valueOf(variant, 'border')).toBe('1px solid var(--gn-danger)');
    const rest = ruleExactly(css, QUIET);
    expect(valueOf(rest, 'min-height')).toBe('2.75rem');
    expect(valueOf(rest, 'padding')).toBe('0 1rem');
    expect(valueOf(rest, 'font-size')).toBe('inherit');
    // A paint declaration here would re-fork the destructive treatment (case 23.022).
    for (const property of ['background', 'color', 'box-shadow', 'border']) {
      expect(valueOf(rest, property), `${QUIET} declares ${property}`).toBeNull();
    }
  });

  it('10.159 no rule naming the builder class has a :hover or :active arm, and none fills with danger', () => {
    const naming = parseRules(css).filter((rule) => rule.selectors.some((selector) => selector.includes('builder-quiet-danger')));
    expect(naming.length).toBeGreaterThanOrEqual(1);
    for (const rule of naming) {
      for (const selector of rule.selectors) expect(selector, 'a state arm re-forks the variant\'s hover').not.toMatch(/:(hover|active)/);
      expect(valueOf(rule.body, 'background'), rule.selectors.join(', ')).not.toBe('var(--gn-danger)');
    }
    // CONTROL — the variant it defers to DOES own the hover and press arms, so the absence above is a hand-off.
    expect(valueOf(ruleExactly(css, '.gn-button--danger-quiet:hover:not(:disabled)'), 'box-shadow')).toBe('inset 0 0 0 1px var(--gn-danger)');
    expect(valueOf(ruleExactly(css, '.gn-button--danger-quiet:active:not(:disabled)'), 'box-shadow')).toBe('none');
  });
});

/**
 * The whole chrome the screen sits inside, as `apps/web/app/globals.css` publishes it (polish 2, 2026-10-01, case 10.164):
 * the sticky app bar, the breadcrumb block above the screen (its top margin and its line box) and the shell's bottom padding.
 * Every term reads its token with a `0px` fallback — the same convention `--app-nav-offset` has — so this file carries no
 * second copy of any number; `apps/web/test/builder-screen-chrome.test.ts` pins the values the tokens resolve to.
 */
const CHROME_TERMS = [
  'var(--app-nav-offset, 0px)',
  'var(--gn-builder-crumb-gap, 0px)',
  'var(--gn-builder-crumb-line, 0px)',
  'var(--gn-shell-pad-bottom, 0px)',
];
const SCREEN_HEIGHT = `calc(100dvh - ${CHROME_TERMS.join(' - ')})`;

describe('10.164 the wide screen is exactly the window minus the real chrome, so the page itself has nothing to scroll', () => {
  const css = cssOf('ui');
  it('10.164 height = 100dvh minus the app bar, the breadcrumb (margin + line) and the shell padding, in the side-by-side block only', () => {
    const wide = ruleExactly(css, '.workflow-builder-screen', '@media (min-width: 64.0625rem)');
    const height = valueOf(wide, 'height') ?? '';
    // CONTROL — the declaration exists and is a calc, so each term check below reads a real expression.
    expect(height).toMatch(/^calc\(100dvh - /);
    // The viewport, bounded (not `auto`, not a bare `100vh` that ignores the dynamic toolbar)…
    expect(height.startsWith('calc(100dvh')).toBe(true);
    // …and ALL four chrome terms, each by name: the app bar, the breadcrumb's margin, its line, the bottom padding.
    for (const term of CHROME_TERMS) expect(height, term).toContain(term);
    expect(height).toBe(SCREEN_HEIGHT);
    // No literal length is left in it (the old `- 4rem` was a second copy of a measurement that was 26px short).
    expect(height.replace(/var\([^)]*\)/g, '')).not.toMatch(/\d+(\.\d+)?(rem|px)/);
    // The stacked block declares no height for the screen (unchanged) — the page scrolls there, as it always did.
    const stacked = parseRules(css).filter((rule) => rule.atRule === '@media (max-width: 64rem)' && rule.selectors.join(',') === '.workflow-builder-screen');
    expect(stacked).toEqual([]);
  });
});

describe('10.161 the left column is its own scroll region above the wide breakpoint', () => {
  const css = cssOf('ui');
  const SIDE_BY_SIDE = '@media (min-width: 64.0625rem)';
  const STACKED = '@media (max-width: 64rem)';
  const BASES = [
    { selector: '.workflow-builder-screen', properties: ['height'] },
    { selector: '.workflow-builder-screen__layout', properties: ['flex', 'min-height', 'grid-template-rows'] },
    { selector: '.workflow-builder-screen__left', properties: ['overflow-y', 'overscroll-behavior', 'align-self', 'position', 'max-height'] },
    { selector: '.workflow-builder-screen__canvas', properties: ['max-height'] },
  ];

  it('10.161 the screen is bounded to the viewport below the app bar, the layout takes the rest, the column fills its track and scrolls inside it', () => {
    const screen = ruleExactly(css, '.workflow-builder-screen', SIDE_BY_SIDE);
    // Whole-expression pin; the terms are read one by one in 10.164 just below.
    expect(valueOf(screen, 'height')).toBe(SCREEN_HEIGHT);
    const layout = ruleExactly(css, '.workflow-builder-screen__layout', SIDE_BY_SIDE);
    expect(valueOf(layout, 'flex')).toBe('1 1 auto');
    expect(valueOf(layout, 'min-height')).toBe('0');
    expect(valueOf(layout, 'grid-template-rows')).toBe('minmax(0, 1fr)');
    const left = ruleExactly(css, '.workflow-builder-screen__left', SIDE_BY_SIDE);
    expect(valueOf(left, 'overflow-y')).toBe('auto');
    expect(valueOf(left, 'overscroll-behavior')).toBe('contain');
    expect(valueOf(left, 'align-self')).toBe('stretch');
    // The canvas keeps its own size but is capped at the track.
    expect(valueOf(ruleExactly(css, '.workflow-builder-screen__canvas', SIDE_BY_SIDE), 'max-height')).toBe('100%');
    // CONTROL — the screen is the flex column the layout's `flex: 1` is a child of (so the declarations above mean something).
    const screenBase = ruleExactly(css, '.workflow-builder-screen');
    expect(valueOf(screenBase, 'display')).toBe('flex');
    expect(valueOf(screenBase, 'flex-direction')).toBe('column');
  });

  it('10.161 every wide declaration is declared AFTER its base rule, none of them is in the base rule, and the stacked block gives the screen, layout and column nothing', () => {
    const rules = parseRules(css);
    const indexOf = (selector: string, atRule: string | null) => rules.findIndex((rule) => rule.atRule === atRule && rule.selectors.join(',') === selector);
    for (const { selector, properties } of BASES) {
      const base = indexOf(selector, null);
      const wide = indexOf(selector, SIDE_BY_SIDE);
      // CONTROL — both rules were found, and the base rule carries real declarations, so "absent" is a reading.
      expect(base, selector).toBeGreaterThanOrEqual(0);
      expect(wide, selector).toBeGreaterThan(base);
      expect(rules[base]?.body.trim().length, selector).toBeGreaterThan(0);
      for (const property of properties) expect(valueOf(rules[base]!.body, property), `${selector} base ${property}`).toBeNull();
    }
    // Stacked: nothing on the column or the screen, and the layout's stacked rule is the one-track arm and nothing else.
    expect(indexOf('.workflow-builder-screen__left', STACKED)).toBe(-1);
    expect(indexOf('.workflow-builder-screen', STACKED)).toBe(-1);
    const stackedLayout = ruleExactly(css, '.workflow-builder-screen__layout', STACKED);
    expect(valueOf(stackedLayout, 'grid-template-columns')).toBe('minmax(0, 1fr)');
    for (const property of ['height', 'flex', 'min-height', 'grid-template-rows']) expect(valueOf(stackedLayout, property), property).toBeNull();
  });
});
