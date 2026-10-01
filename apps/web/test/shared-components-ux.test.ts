import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseRules, ruleExactly, rulesNaming, valueOf, type CssRule } from '../../../packages/ui/test/helpers/css-rules.js';
import { readGlobalsCss } from '../../../packages/ui/test/helpers/style-patterns.js';
import { readUiCss } from '../../../packages/ui/test/helpers/css-rules.js';

/**
 * UX fixes Task 6 (audit SYS-10/14/09/07, PV-09/18, ENT-13, SET-13/25, NP-14, TT-04/06/07/08, WF-03/10/18):
 * the shared components. The CSS half, cases 23.090, 23.092 (the utility and the seven hosts), 23.093 (the
 * stylesheet half), 23.094 and 23.095. jsdom lays nothing out, so each case reads the DECLARATIONS that give the
 * control its box, the way `styling-touch-targets.test.ts` (20.611–20.619) does.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../../..');
const ui = readUiCss();
const globals = readGlobalsCss();
const editor = readFileSync(resolve(REPO, 'packages/editor/src/styles/editor.css'), 'utf8');

const FLOOR = '2.75rem';
/** The hit-slop pseudo paints nothing: it only extends the hit box. */
const PAINTS = ['background', 'background-color', 'border', 'box-shadow', 'outline', 'color', 'opacity'];

/** Every reason `selector`'s hit box is not provably ≥44×44 in `css`, as a list (empty = it is). */
function hitBoxProblems(css: string, selector: string): string[] {
  const rules = parseRules(css).filter((r) => r.atRule === null);
  const problems: string[] = [];
  const base = rules.find((r) => r.selectors.includes(selector) && valueOf(r.body, 'position') === 'relative');
  if (base === undefined) problems.push(`${selector} is not a positioned box (position: relative)`);
  const slop = rules.find((r) => r.selectors.includes(`${selector}::before`));
  if (slop === undefined) {
    problems.push(`${selector}::before is not declared`);
    return problems;
  }
  if (valueOf(slop.body, 'content') !== "''") problems.push(`${selector}::before has no content`);
  if (valueOf(slop.body, 'position') !== 'absolute') problems.push(`${selector}::before is not absolute`);
  for (const axis of ['width', 'height'] as const) {
    if (!(valueOf(slop.body, axis) ?? '').includes(FLOOR)) problems.push(`${selector}::before ${axis} does not reach ${FLOOR}`);
  }
  for (const property of PAINTS) {
    if (valueOf(slop.body, property) !== null) problems.push(`${selector}::before paints ${property}`);
  }
  return problems;
}

describe('23.090 hit areas: every listed shared control reaches 44×44 (audit SYS-10, PV-09, PV-18, ENT-13, SET-13, NP-14, TT-06, WF-03)', () => {
  const LINK_BUTTONS = [
    '.gn-board-card__epic',
    '.gn-board-card__title',
    '.gn-board-card__parent-key',
    '.gn-my-work__title',
    '.gn-list__open',
  ];
  const ICON_BUTTONS = ['.gn-list__collapse', '.gn-project__filter-chip-remove', '.gn-infotip__trigger'];

  it('23.090 the inline link-buttons and the 24px icon buttons carry a ::before hit-slop, their drawn boxes untouched', () => {
    for (const selector of [...LINK_BUTTONS, ...ICON_BUTTONS]) {
      expect(hitBoxProblems(ui, selector), selector).toEqual([]);
    }
    // CONTROL — the checker CAN fail: a control no hit-slop names reports every reason; the breadcrumb's own
    // technique (20.616, globals) is a different spelling and the checker says so rather than passing it by accident.
    expect(hitBoxProblems(ui, '.gn-board-card__epic-title').length).toBeGreaterThanOrEqual(2);
    expect(hitBoxProblems(globals, '.gn-breadcrumb a')).toContain(".gn-breadcrumb a::before width does not reach 2.75rem");
    // The drawn boxes did not move: the epic chip keeps its 1.5rem box, the collapse its 1.5rem square.
    expect(valueOf(ruleExactly(ui, '.gn-board-card__epic'), 'min-height')).toBe('1.5rem');
    expect(valueOf(ruleExactly(ui, '.gn-list__collapse'), 'min-width')).toBe('1.5rem');
    expect(valueOf(ruleExactly(ui, '.gn-infotip__trigger'), 'width')).toBe('1.5rem');
  });

  it('23.090 the calendar arrows, the icon picker and the editor toolbar clear 44px by their own size or a hit-slop', () => {
    const nav = ruleExactly(ui, '.gn-calendar__nav');
    expect(valueOf(nav, 'min-height')).toBe(FLOOR);
    expect(valueOf(nav, 'min-width')).toBe(FLOOR);
    const choice = ruleExactly(ui, '.icon-picker__choice');
    expect(valueOf(choice, 'width')).toBe(FLOOR);
    expect(valueOf(choice, 'height')).toBe(FLOOR);
    // The editor toolbar: its desktop buttons are 32px tall (the phone arm already floors them at 44), so the
    // desktop button gets the hit-slop and the phone arm keeps its own floor.
    expect(hitBoxProblems(editor, '.ticket-editor__tool')).toEqual([]);
    const phoneTool = rulesNaming(editor, '.ticket-editor__tool').filter((r) => r.atRule === '@media (max-width: 40rem)');
    expect(phoneTool.map((r) => valueOf(r.body, 'min-height'))).toContain(FLOOR);
    // CONTROL — the breadcrumb is a false positive in the audit: it keeps its 20.616 hit-slop, untouched.
    expect(valueOf(ruleExactly(globals, '.gn-breadcrumb a::before'), 'height')).toBe(FLOOR);
  });
});

/** The seven scrollers and the source file that mounts each (case 23.092). */
const SCROLLERS: ReadonlyArray<{ name: string; file: string; marker: RegExp }> = [
  { name: 'the project view rail', file: 'apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx', marker: /className="gn-project__rail"[\s\S]{0,200}?fade/ },
  { name: 'the board rail', file: 'packages/app-core/src/views/board.tsx', marker: /className="gn-board__rail gn-scroll-fade"/ },
  { name: 'the list table wrap', file: 'packages/app-core/src/views/ticket-list.tsx', marker: /className="gn-list__table-wrap gn-scroll-fade"/ },
  { name: 'the settings phone track', file: 'apps/web/app/settings/page.tsx', marker: /className="gn-settings__sidebar gn-scroll-fade"/ },
  { name: 'the help sidebar', file: 'packages/app-core/src/help/help-browser.tsx', marker: /className="gn-help__sidebar gn-scroll-fade gn-scroll-fade--y"/ },
  { name: 'the board phone picker', file: 'packages/app-core/src/views/board-phone-picker.tsx', marker: /className="gn-board-phone-picker"[\s\S]{0,200}?fade/ },
  { name: 'the workflow-builder left panel', file: 'packages/app-core/src/workflow-builder/ui/workflow-builder-screen.tsx', marker: /className="workflow-builder-screen__left gn-scroll-fade gn-scroll-fade--y"/ },
];

function codeOf(relative: string): string {
  return readFileSync(resolve(REPO, relative), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('23.092 scroll fades: one utility, applied to the seven scrollers (audit SYS-14, BRD-07, ENT-13, SET-25, WF-10, PV-04)', () => {
  it('23.092 .gn-scroll-fade masks an edge only while content hides past it, and the vertical variant runs top to bottom', () => {
    const bare = ruleExactly(ui, '.gn-scroll-fade');
    expect(valueOf(bare, 'mask-image')).toBeNull(); // CONTROL — a scroller with nothing hidden is not masked at all
    const start = ruleExactly(ui, ".gn-scroll-fade[data-at-start='false']");
    const end = ruleExactly(ui, ".gn-scroll-fade[data-at-end='false']");
    expect(valueOf(start, '--gn-fade-from')).toBe('transparent');
    expect(valueOf(end, '--gn-fade-to')).toBe('transparent');
    const masked = ruleExactly(ui, [".gn-scroll-fade[data-at-start='false']", ".gn-scroll-fade[data-at-end='false']"]);
    expect(valueOf(masked, 'mask-image')).toMatch(/^linear-gradient\(to right, var\(--gn-fade-from\),/);
    expect(valueOf(masked, '-webkit-mask-image')).toBe(valueOf(masked, 'mask-image'));
    const vertical = ruleExactly(ui, [".gn-scroll-fade--y[data-at-start='false']", ".gn-scroll-fade--y[data-at-end='false']"]);
    expect(valueOf(vertical, 'mask-image')).toMatch(/^linear-gradient\(to bottom, var\(--gn-fade-from\),/);
    // The fade length is a variable, not a literal in the gradient.
    expect(valueOf(bare, '--gn-scroll-fade-size')).toBe('1.5rem');
    expect(valueOf(masked, 'mask-image')).toContain('var(--gn-scroll-fade-size)');
  });

  it('23.092 each of the seven scrollers wears the utility (and the hook that drives it)', () => {
    for (const scroller of SCROLLERS) {
      expect(codeOf(scroller.file), scroller.name).toMatch(scroller.marker);
      expect(codeOf(scroller.file), `${scroller.name} drives its edges`).toMatch(/useScrollEdges|fade/);
    }
    // CONTROL — the scan can fail: a scroller this task did not name is not in the list.
    expect(codeOf('packages/app-core/src/views/ticket-list.tsx')).not.toMatch(/className="gn-list__bulk-bar gn-scroll-fade/);
  });
});

describe('23.093 colour is never the only signal (audit NP-06, BRD-04, WF-12; stylesheet half)', () => {
  it('23.093 the waiting chip has its own amber dot, not the blocked red, and the due label has a late look', () => {
    expect(valueOf(ruleExactly(ui, '.gn-chip--waiting .gn-chip__dot'), 'background')).toBe('var(--gn-pending)');
    expect(valueOf(ruleExactly(ui, '.gn-chip--blocked .gn-chip__dot'), 'background')).toBe('var(--gn-blocked)'); // CONTROL — blocked itself is unchanged
    expect(valueOf(ruleExactly(ui, '.gn-board-card__due-label'), 'font-weight')).toBe('600');
    const late = rulesNaming(ui, '.gn-board-card__due-label--late');
    expect(late.length).toBeGreaterThan(0);
  });

  it('23.093 the workflow chip lays its category word out beside the name', () => {
    const chip = ruleExactly(ui, '.workflow-list__state');
    expect(valueOf(chip, 'gap')).toBe('0.375rem');
    const word = ruleExactly(ui, '.workflow-list__state-category');
    expect(valueOf(word, 'color')).toBe('var(--gn-text-muted)');
    // CONTROL — the category bar (the shape) is still drawn for each category.
    for (const category of ['open', 'active', 'terminal']) {
      expect(valueOf(ruleExactly(ui, `.workflow-list__state-bar--${category}`), 'background')).toBe(`var(--gn-category-${category})`);
    }
  });
});

/** Every rule in `css` that is a `:disabled` rule setting `opacity`. */
function disabledOpacities(css: string): CssRule[] {
  return parseRules(css).filter((r) => r.selectors.some((s) => s.includes(':disabled')) && valueOf(r.body, 'opacity') !== null);
}

describe('23.094 one disabled token, and a quiet Save on an unchanged form (audit SYS-09, TT-07, TT-08)', () => {
  it('23.094 every :disabled opacity in the three sheets is var(--gn-disabled-opacity), the four named rules included', () => {
    for (const [name, css] of [['ui.css', ui], ['globals.css', globals], ['editor.css', editor]] as const) {
      for (const rule of disabledOpacities(css)) {
        expect(valueOf(rule.body, 'opacity'), `${name}: ${rule.selectors.join(', ')}`).toBe('var(--gn-disabled-opacity)');
      }
    }
    for (const selector of ['.gn-button:disabled', '.ticket-type-list__move:disabled', '.gn-board-card__move:disabled']) {
      expect(valueOf(ruleExactly(ui, selector), 'opacity'), selector).toBe('var(--gn-disabled-opacity)');
    }
    expect(valueOf(ruleExactly(ui, ['.gn-row-action:disabled', '.gn-list__bulk-close:disabled']), 'opacity')).toBe('var(--gn-disabled-opacity)');
    // CONTROL — the sweep sees rules: it finds the four named ones and more (it is not an empty loop).
    expect(disabledOpacities(ui).length).toBeGreaterThanOrEqual(8);
  });
});

describe('23.095 the depth grammar: nothing sunken inside a card, notices flat, headings not troughs (audit TT-04, PV-17, NP-21, WF-18)', () => {
  it('23.095 a neo ticket-type row is flat with a hairline, its radius is the inner radius, and the list heading has no inset', () => {
    const neoRow = ruleExactly(ui, '[data-style="neo"] .ticket-type-list__row');
    expect(valueOf(neoRow, 'box-shadow')).toBe('none');
    expect(valueOf(neoRow, 'background')).toBe('transparent');
    expect(valueOf(neoRow, 'border-radius')).toBe('0');
    expect(valueOf(neoRow, 'border-bottom')).toBe('1px solid var(--gn-border)');
    expect(valueOf(ruleExactly(ui, '.ticket-type-list__row'), 'border-radius')).toBe('calc(var(--gn-radius-card) - 0.5rem)');
    const heading = ruleExactly(ui, '.gn-list__section-title');
    expect(valueOf(heading, 'box-shadow')).toBeNull();
    expect(valueOf(heading, 'background')).toBe('var(--gn-fill-quaternary)');
    // CONTROL — the card itself keeps its lift, so "no depth inside" is not "no depth anywhere".
    expect(valueOf(ruleExactly(ui, '.gn-card'), 'box-shadow')).toBe('var(--gn-shadow-lift)');
  });

  it('23.095 the help quote and the legal draft notice are a tinted flat fill, with no inset shadow', () => {
    const quote = ruleExactly(ui, '.gn-help__quote');
    expect(valueOf(quote, 'background')).toBe('var(--gn-fill-quaternary)');
    expect(valueOf(quote, 'box-shadow')).toBeNull();
    const draft = ruleExactly(globals, '.gn-legal__draft');
    expect(valueOf(draft, 'background')).toBe('var(--gn-fill-quaternary)');
    expect(valueOf(draft, 'box-shadow')).toBeNull();
    // CONTROL — the neo rules for those two classes do not bring an inset back.
    for (const css of [ui, globals]) {
      for (const rule of rulesNaming(css, '.gn-help__quote').concat(rulesNaming(css, '.gn-legal__draft'))) {
        expect(valueOf(rule.body, 'box-shadow') ?? '', rule.selectors.join(', ')).not.toContain('inset');
      }
    }
  });

  it('23.095 the members zebra is a hairline, not a tint that reads as selection', () => {
    expect(rulesNaming(globals, '.gn-members__row:nth-child(even)')).toEqual([]);
    // CONTROL — the rows still have a boundary: the hairline is declared on the row itself, and the zebra's
    // selector would be found if it came back (the helper reads the sheet's real rules).
    expect(rulesNaming(globals, '.gn-members__row').length).toBeGreaterThan(0);
    expect(valueOf(ruleExactly(globals, '.gn-members__row'), 'border-bottom')).toBe('1px solid var(--gn-border)');
  });
});
