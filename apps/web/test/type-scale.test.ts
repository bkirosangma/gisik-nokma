import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { themeStylesheet, titleScale, titleVariableName } from '../../../packages/ui/src/tokens.js';
import { ruleExactly, rulesNaming, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { readGlobalsCss } from '../../../packages/ui/test/helpers/style-patterns.js';

/**
 * UX fixes, Task 5 — the type scale and the phone page-header pattern (cases 23.070, 23.072, 23.073,
 * 23.074; 23.071, the one-h1 sweep, is `one-h1.test.tsx`). Audit ids: SYS-02, WF-05, WF-06, SET-10,
 * SET-17, NP-15 (the scale); SYS-15, BRD-06, PV-03, TT-09 (the header pattern).
 *
 * CSS is read from source (the gate has no browser), through the exact-selector reader, so a rule
 * declared twice or a literal size left in a title rule is refused rather than first-matched.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const ui = readFileSync(resolve(HERE, '../../../packages/ui/src/ui.css'), 'utf8');
const globals = readGlobalsCss();
const PHONE = '@media (max-width: 40rem)';
const SHEETS = { ui, globals } as const;

const remOf = (value: string | null): number => {
  const hit = /^([\d.]+)rem$/.exec(value ?? '');
  if (hit === null) throw new Error(`not a rem length: ${String(value)}`);
  return Number(hit[1]);
};

/** The six page-title rules and the scoped overrides that used to spell the size themselves. */
const PAGE_TITLE_RULES: ReadonlyArray<{ sheet: keyof typeof SHEETS; selectors: string[]; phone: boolean }> = [
  { sheet: 'globals', selectors: ['.gn-page-title'], phone: true },
  { sheet: 'globals', selectors: ['.gn-account .gn-page-title'], phone: true },
  { sheet: 'globals', selectors: ['.gn-notfound__title', '.gn-legal__title'], phone: true },
  { sheet: 'ui', selectors: ['.gn-help__title'], phone: true },
  { sheet: 'ui', selectors: ['.gn-page-header__title'], phone: true },
  { sheet: 'ui', selectors: ['.gn-project__title'], phone: true },
  { sheet: 'ui', selectors: ['.workflow-builder-screen__name'], phone: true },
];

describe('23.070 every page title reads the page-title token, and the phone arm the phone step (audit SYS-02, WF-05, SET-10)', () => {
  it('23.070 the six rules (and the scoped overrides) read var(--gn-title-page) and var(--gn-title-page-phone); none keeps a literal font-size', () => {
    // CONTROL (same `it`): the token values are the sizes the rules used to spell (34px / 22px), and
    // the stylesheet declares them once, in the bare :root block.
    expect(titleScale.page).toEqual({ size: '2.125rem', phone: '1.375rem' });
    expect(titleScale.page.size).toBe('2.125rem'); // 34px
    expect(titleScale.page.phone).toBe('1.375rem'); // 22px
    const theme = themeStylesheet();
    expect(theme.match(new RegExp(`${titleVariableName('page')}: 2\\.125rem;`, 'g'))).toHaveLength(1);
    expect(theme.match(new RegExp(`${titleVariableName('page', true)}: 1\\.375rem;`, 'g'))).toHaveLength(1);
    expect(titleVariableName('page')).toBe('--gn-title-page');
    expect(titleVariableName('page', true)).toBe('--gn-title-page-phone');

    for (const { sheet, selectors, phone } of PAGE_TITLE_RULES) {
      const css = SHEETS[sheet];
      const label = `${sheet}: ${selectors.join(', ')}`;
      expect(valueOf(ruleExactly(css, selectors), 'font-size'), `${label} base`).toBe('var(--gn-title-page)');
      if (phone) {
        expect(valueOf(ruleExactly(css, selectors, PHONE), 'font-size'), `${label} phone`).toBe('var(--gn-title-page-phone)');
      }
      // No literal size survives in ANY rule that names the selector (a base, a scoped override, an arm).
      for (const selector of selectors) {
        for (const rule of rulesNaming(css, selector)) {
          const size = valueOf(rule.body, 'font-size');
          if (size !== null) expect(size, `${label} / ${rule.atRule ?? 'top'}`).toMatch(/^var\(--gn-title-page(-phone)?\)$/);
        }
      }
    }
  });
});

/** The section heads: a section title is always larger than the items under it (23.072). */
const SECTION_RULES: ReadonlyArray<{ sheet: keyof typeof SHEETS; selector: string }> = [
  { sheet: 'ui', selector: '.gn-list__section-title' },
  { sheet: 'ui', selector: '.gn-my-work__heading' },
  { sheet: 'ui', selector: '.workflow-list__title' },
  { sheet: 'ui', selector: '.workflow-history__title' },
  { sheet: 'ui', selector: '.ticket-type-list__title' },
  { sheet: 'globals', selector: '.gn-workspace-settings__title' },
  { sheet: 'globals', selector: '.gn-mcp-tokens__subtitle' },
];

describe('23.072 section titles use the section token, which is larger than an item title (audit WF-06, SET-17, NP-15)', () => {
  it('23.072 each section head reads var(--gn-title-section) (phone: var(--gn-title-section-phone)), and the token is larger than the item titles beneath', () => {
    for (const { sheet, selector } of SECTION_RULES) {
      const css = SHEETS[sheet];
      expect(valueOf(ruleExactly(css, selector), 'font-size'), `${selector} base`).toBe('var(--gn-title-section)');
      const phone = rulesNaming(css, selector).filter((rule) => rule.atRule === PHONE);
      expect(
        phone.some((rule) => valueOf(rule.body, 'font-size') === 'var(--gn-title-section-phone)'),
        `${selector} phone`,
      ).toBe(true);
    }
    // The comparison is of the TOKENS to the sizes the item titles are drawn at, read from the rules.
    const itemTitle = remOf(valueOf(ruleExactly(ui, '.workflow-list__name'), 'font-size'));
    const itemInVersions = remOf(valueOf(ruleExactly(ui, '.workflow-history__version-name'), 'font-size'));
    for (const size of [itemTitle, itemInVersions]) {
      expect(remOf(titleScale.section.size)).toBeGreaterThan(size);
      expect(remOf(titleScale.section.phone)).toBeGreaterThan(size);
    }
    // CONTROL (same `it`): the three steps are ordered (page > section > group), on the phone too, so
    // "larger than the items" is a statement about a scale and not about one lucky number.
    expect(remOf(titleScale.page.size)).toBeGreaterThan(remOf(titleScale.section.size));
    expect(remOf(titleScale.section.size)).toBeGreaterThan(remOf(titleScale.group.size));
    expect(remOf(titleScale.page.phone)).toBeGreaterThan(remOf(titleScale.section.phone));
    expect(remOf(titleScale.section.phone)).toBeGreaterThan(remOf(titleScale.group.phone));
    expect(remOf(titleScale.group.size)).toBeGreaterThanOrEqual(itemTitle);
  });
});

/** Every rule at the phone or tablet arm that names a project-header class. */
const PROJECT_HEADER_CLASSES = [
  '.gn-project__header',
  '.gn-project__head',
  '.gn-project__identity',
  '.gn-project__search',
  '.gn-project__filters',
  '.gn-project__header > .gn-button--primary',
  '.gn-project__header > *',
];
const narrowArms = (): Array<{ selector: string; atRule: string; body: string }> =>
  PROJECT_HEADER_CLASSES.flatMap((selector) =>
    rulesNaming(ui, selector)
      .filter((rule) => rule.atRule === PHONE || rule.atRule === '@media (max-width: 64rem)')
      .map((rule) => ({ selector, atRule: rule.atRule ?? '', body: rule.body })),
  );

describe('23.073 the project header on a phone: the primary in the header row, filters behind one button (audit SYS-15, BRD-06, PV-03)', () => {
  it('23.073 no narrow-arm header rule makes the primary or the filters a full-width row; the page renders ONE Filters button; above the arm the header is unchanged', () => {
    const arms = narrowArms();
    // The arms exist (a vacuous scan would pass on nothing): the two-row toolbar of Task 4 is here.
    expect(arms.length).toBeGreaterThan(3);
    for (const { selector, atRule, body } of arms) {
      const label = `${selector} under ${atRule}`;
      expect(valueOf(body, 'flex') ?? '', label).not.toMatch(/\b100%$/);
      expect(valueOf(body, 'flex-basis'), label).not.toBe('100%');
      expect(valueOf(body, 'width'), label).not.toBe('100%');
    }
    // The only `flex-basis: 100%` the toolbar keeps is the zero-height line break between its two rows.
    const withBasis = arms.filter(({ body }) => valueOf(body, 'flex-basis') === '100%');
    expect(withBasis.map(({ selector }) => selector)).toEqual([]);
    const breakRule = ruleExactly(ui, '.gn-project__head::after', '@media (max-width: 64rem)');
    expect(valueOf(breakRule, 'flex-basis')).toBe('100%');
    expect(valueOf(breakRule, 'height')).toBe('0');

    // ONE Filters button in the header: the page source has exactly one element carrying the class.
    const page = readFileSync(resolve(HERE, '../app/w/[workspaceId]/p/[projectId]/page.tsx'), 'utf8');
    const filtersButtons = [...page.matchAll(/className="[^"]*\bgn-project__filters\b[^"]*"/g)];
    expect(filtersButtons).toHaveLength(1);

    // CONTROL (same `it`): above the arm the header is the base flex row and wraps, so the scan above
    // is about the narrow arms and not about a header that never had a row.
    const base = ruleExactly(ui, '.gn-project__header');
    expect(valueOf(base, 'display')).toBe('flex');
    expect(valueOf(base, 'flex-wrap')).toBe('wrap');
  });
});

describe('23.074 the ticket-type editor header on a phone: Cancel and Save on one row, Save not full width (audit TT-09)', () => {
  it('23.074 no ≤40rem rule gives the header actions or the Save a full-width basis; the actions row keeps wrapping', () => {
    for (const [css, selector] of [
      [globals, '.gn-type-editor-header__actions'],
      [ui, '.ticket-type-editor__save'],
    ] as const) {
      for (const rule of rulesNaming(css, selector).filter((r) => r.atRule === PHONE)) {
        expect(valueOf(rule.body, 'flex'), `${selector} phone`).not.toBe('1 1 100%');
        expect(valueOf(rule.body, 'flex-basis'), `${selector} phone`).not.toBe('100%');
        expect(valueOf(rule.body, 'width'), `${selector} phone`).not.toBe('100%');
      }
    }
    // CONTROL (same `it`): the base rules are what lays the row out — wrapping flex with the Save held
    // to its own width (`align-self: flex-start`) — so the phone arm removal leaves a row, not a pile.
    const actions = ruleExactly(globals, '.gn-type-editor-header__actions');
    expect(valueOf(actions, 'display')).toBe('flex');
    expect(valueOf(actions, 'flex-wrap')).toBe('wrap');
    expect(valueOf(ruleExactly(ui, '.ticket-type-editor__save'), 'align-self')).toBe('flex-start');
  });
});
