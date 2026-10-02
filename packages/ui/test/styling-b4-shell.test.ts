import { describe, expect, it } from 'vitest';
import { parseRules, ruleExactly, valueOf } from './helpers/css-rules.js';
import { cssOf, expectRow, flatBoundaryOffenders, type RosterRow } from './helpers/style-patterns.js';

/** Styling refresh Plan B, Task B4 — cases 20.231–20.232 (§20.24). */
function stillDeclared(list: string): boolean {
  return (['ui', 'globals'] as const).some((sheet) =>
    parseRules(cssOf(sheet)).some((rule) => rule.selectors.join(', ') === list),
  );
}

const CURRENT = [".gn-nav a[aria-current='page']", ".gn-nav button[aria-current='page']"];
const ROWS: RosterRow[] = [
  { sheet: 'globals', selectors: '.gn-nav', declarations: { 'box-shadow': 'var(--gn-shadow-raised-lg)' } }, // N7 (2026-10-02, 24.083): the nav wears the large pair (hig: = lift, 24.009)
  {
    sheet: 'globals',
    selectors: ['.gn-nav a'], // amended 2026-10-02: the retired `Menu` toggle (`.gn-nav__more-toggle`) left this selector list (UX fixes Task 4, case 23.042)
    declarations: {
      'border-radius': '0.75rem',
      // amended 2026-10-02 by N9 (case 24.043): the nav link also eases its `box-shadow` (the neo current-item inset).
      transition:
        'background-color var(--gn-motion-feedback) ease-out, color var(--gn-motion-feedback) ease-out, box-shadow var(--gn-motion-move) var(--gn-motion-ease-out)',
      color: 'var(--gn-text-muted)',
    },
  },
  {
    sheet: 'globals',
    selectors: CURRENT,
    declarations: {
      background: 'var(--gn-surface-raised)',
      'box-shadow': 'var(--gn-shadow-lift)',
      color: 'var(--gn-text)',
      'font-weight': '600',
      'border-radius': '0.75rem',
    },
  },
  { sheet: 'globals', selectors: '.gn-theme-toggle', declarations: { 'box-shadow': 'var(--gn-shadow-lift)' } },
  { sheet: 'globals', selectors: '.gn-skip', declarations: { 'box-shadow': 'var(--gn-shadow-near-lg)' } }, // N7 (2026-10-02, 24.083): floating, so `near-lg`
  {
    sheet: 'globals',
    selectors: '.gn-nav__menu .gn-nav__menu-item--signout',
    declarations: { 'border-top': '1px solid var(--gn-fill-secondary)' },
  },
];
const NEO_CURRENT = [
  "[data-style=\"neo\"] .gn-nav a[aria-current='page']",
  "[data-style=\"neo\"] .gn-nav button[aria-current='page']",
];
const KEPT = [NEO_CURRENT.join(', ')];

describe('20.231 the shell follows the rules', () => {
  it('20.231 every row; the non-current links keep text-muted', () => {
    // CONTROL — the resting links stay `text-muted` (only the current item changes ink).
    const resting = ruleExactly(cssOf('globals'), ['.gn-nav a'], null);
    expect(valueOf(resting, 'color')).toBe('var(--gn-text-muted)');
    for (const row of ROWS) expectRow(row);
  });
});
describe('20.232 no flat boundary in the shell', () => {
  it('20.232 none; neo current kept', () => {
    // CONTROL — neo's pressed-in current item is still declared.
    for (const kept of KEPT) expect(stillDeclared(kept), kept).toBe(true);
    expect(flatBoundaryOffenders(cssOf('globals'), ['.gn-nav', '.gn-theme-toggle', '.gn-skip'], KEPT)).toEqual([]);
  });
});

/** [ids, classes + attributes + pseudo-classes, elements] of one selector (no :not/:is in these rules). */
function specificity(selector: string): [number, number, number] {
  const bare = selector.replace(/"[^"]*"|'[^']*'/g, '');
  const ids = (bare.match(/#[\w-]+/g) ?? []).length;
  const classes = (bare.match(/\.[\w-]+|\[[^\]]*\]|:(?!:)[\w-]+/g) ?? []).length;
  const elements = (bare.replace(/\[[^\]]*\]/g, '').match(/(?:^|[\s>+~])[a-z][\w-]*/gi) ?? []).length;
  return [ids, classes, elements];
}
function outranks(a: [number, number, number], b: [number, number, number]): boolean {
  for (let i = 0; i < 3; i += 1) if (a[i] !== b[i]) return (a[i] as number) > (b[i] as number);
  return true; // equal: the later rule wins, and rules are walked in source order
}
/** The value the cascade picks for `property` among rules with a selector `applies` accepts. */
function winningValue(css: string, applies: (selector: string) => boolean, property: string): string | null {
  let best: { spec: [number, number, number]; value: string } | null = null;
  for (const rule of parseRules(css)) {
    const value = valueOf(rule.body, property);
    if (value === null) continue;
    for (const selector of rule.selectors.filter(applies)) {
      const spec = specificity(selector);
      if (best === null || outranks(spec, best.spec)) best = { spec, value };
    }
  }
  return best === null ? null : best.value;
}
const CURRENT_TAIL = { a: "a[aria-current='page']", button: "button[aria-current='page']" } as const;
const winnerFor = (css: string, element: keyof typeof CURRENT_TAIL, neo: boolean, property: string): string | null =>
  winningValue(
    css,
    (selector) =>
      // A pseudo-element rule (the lit link's indicator bar, UX fixes 23.044) styles the ::after, not the element.
      !selector.includes('::') &&
      selector.includes(`.gn-nav ${CURRENT_TAIL[element]}`) && (selector.startsWith('[data-style="neo"]') ? neo : true),
    property,
  );

describe('20.233 under neo a current button is pressed in like a current link', () => {
  it('20.233 the winning declarations for a neo current <button> are sunken', () => {
    const css = cssOf('globals');
    // CONTROL — the same probe reads the raised look where neo is not in play, and a neo <a> is pressed in.
    expect(winnerFor(css, 'button', false, 'background')).toBe('var(--gn-surface-raised)');
    expect(winnerFor(css, 'button', false, 'box-shadow')).toBe('var(--gn-shadow-lift)');
    expect(winnerFor(css, 'a', true, 'background')).toBe('var(--gn-surface-sunken)');
    // the cascade winner for a current <button> under neo
    expect(winnerFor(css, 'button', true, 'background')).toBe('var(--gn-surface-sunken)');
    // amended 2026-10-02 by N9 (case 24.041): the neo current item is a control inset, `recess`.
    expect(winnerFor(css, 'button', true, 'box-shadow')).toBe('var(--gn-shadow-recess)');
  });
});
