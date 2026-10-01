import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { measure, spacing, themeStylesheet } from '../../../packages/ui/src/tokens.js';
import { parseRules, ruleExactly, rulesNaming, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { readGlobalsCss } from '../../../packages/ui/test/helpers/style-patterns.js';

/**
 * UX fixes, Task 3 — the shell (cases 23.040–23.044; the half of 23.042 that depends on the tablet
 * bar is Task 4's). Audit ids: BRD-04, WF-20, SYS-14, SYS-16, WS-05, SET-19, SYS-20, NP-26, WS-08.
 * The nav's behaviour half is in `app-nav.test.tsx` and `bottom-bar.test.tsx`.
 */
const HERE = dirname(fileURLToPath(import.meta.url));
const read = (relative: string): string => readFileSync(resolve(HERE, relative), 'utf8');
const css = readGlobalsCss();
const ui = read('../../../packages/ui/src/ui.css');

const WORK_SURFACES = [
  'app/w/[workspaceId]/p/[projectId]/page.tsx',
  'app/w/[workspaceId]/settings/workflows/[workflowId]/page.tsx',
];
const READING_PAGES = [
  'app/settings/page.tsx',
  'app/account/page.tsx',
  'app/help/page.tsx',
  'app/privacy/page.tsx',
  'app/terms/page.tsx',
  'app/workspaces/page.tsx',
  'app/w/[workspaceId]/members/page.tsx',
];

/** Every `<main …>` opening tag's class list in a source file. */
function mainClasses(source: string): string[] {
  return [...source.matchAll(/<main\b[^>]*className="([^"]*)"/g)].map((m) => m[1] ?? '');
}

describe('23.040 the work surfaces escape the 80rem shell; reading pages keep it (audit BRD-04, WF-20)', () => {
  it('23.040 the project page (and its Suspense fallback) and the workflow editor mount gn-shell--wide; the reading pages do not', () => {
    for (const file of WORK_SURFACES) {
      const mains = mainClasses(read(`../${file}`));
      expect(mains.length, `${file} mounts no <main>`).toBeGreaterThan(0);
      for (const classes of mains) {
        expect(classes.split(/\s+/), `${file}: ${classes}`).toEqual(expect.arrayContaining(['gn-shell', 'gn-shell--wide']));
      }
    }
    // The project page has BOTH a real <main> and a fallback <main>: neither may be left at 80rem.
    expect(mainClasses(read(`../${WORK_SURFACES[0]}`)).length).toBeGreaterThanOrEqual(2);

    // CONTROL (same `it`): the reading pages keep the cap, and `.gn-shell--wide` is what lifts it.
    for (const file of READING_PAGES) {
      for (const classes of mainClasses(read(`../${file}`))) {
        expect(classes.split(/\s+/), `${file}: ${classes}`).not.toContain('gn-shell--wide');
      }
    }
    expect(valueOf(ruleExactly(css, '.gn-shell--wide'), 'max-width')).toBe('none');
    expect(valueOf(ruleExactly(css, '.gn-shell'), 'max-width')).toBe('80rem');
  });

  it('23.040 the notes-only bottom padding is scoped to the notes page, so the board and the editor keep theirs', () => {
    // Every notes <main> carries the notes-page class …
    for (const file of ['src/notes/notes-page.tsx', 'app/notes/page.tsx', 'app/notes/[noteId]/page.tsx']) {
      for (const classes of mainClasses(read(`../${file}`))) {
        expect(classes.split(/\s+/), `${file}: ${classes}`).toEqual(
          expect.arrayContaining(['gn-shell--wide', 'gn-notes-page']),
        );
      }
    }
    // … and the `padding-bottom: 0` rule is on that compound, not on the bare modifier.
    const scoped = ruleExactly(css, '.gn-notes-page.gn-shell--wide', '@media (width > 60rem)');
    expect(valueOf(scoped, 'padding-bottom')).toBe('0');
    const bare = rulesNaming(css, '.gn-shell--wide').filter((rule) => rule.selectors.includes('.gn-shell--wide'));
    // CONTROL — the bare modifier still exists (the cap lift) and declares no padding anywhere.
    expect(bare.length).toBeGreaterThan(0);
    for (const rule of bare) expect(rule.body).not.toMatch(/padding/);
  });
});

describe('23.041 one 24px gutter at every width (audit SYS-14, WS-05, SET-19)', () => {
  const GUTTER = 'var(--gn-space-3)';
  it('23.041 .gn-shell pads 0 var(--gn-space-3) at every width, .gn-nav__inner and the sign-in arm follow', () => {
    expect(spacing[3]).toBe('1.5rem');
    expect(valueOf(ruleExactly(css, '.gn-shell'), 'padding')).toBe(`0 ${GUTTER} var(--gn-shell-pad-bottom)`);
    expect(valueOf(ruleExactly(css, '.gn-shell', '@media (max-width: 60rem)'), 'padding')).toBe(`0 ${GUTTER} 2rem`);
    expect(valueOf(ruleExactly(css, '.gn-nav__inner'), 'padding')).toBe(`0.8rem ${GUTTER}`);
    // No narrower arm re-inserts a smaller side padding on the bar.
    for (const rule of rulesNaming(css, '.gn-nav__inner')) {
      expect(valueOf(rule.body, 'padding-inline'), rule.atRule ?? 'base').toBeNull();
    }
    expect(valueOf(ruleExactly(css, '.gn-shell--centred', '@media (max-width: 40rem)'), 'padding-inline')).toBe(GUTTER);
    // CONTROL — the non-wide shell keeps its 80rem cap, and the bar mirrors it.
    expect(valueOf(ruleExactly(css, '.gn-shell'), 'max-width')).toBe('80rem');
    expect(valueOf(ruleExactly(css, '.gn-nav__inner'), 'max-width')).toBe('80rem');
  });
});

describe('23.043 prose has a measure (audit SYS-16, ENT-17, NP-11, NP-23, SET-23)', () => {
  const PROSE_IN_GLOBALS = [
    '.gn-legal__column',
    '.gn-workspace-home__empty',
    '.gn-members__empty',
    '.gn-mcp-tokens__empty',
    '.gn-mcp-tokens__what',
    '.gn-notes__empty',
    '.gn-notes__hint',
  ];
  it('23.043 the measure token is 70ch and emitted once; the legal column, Help column and the empty/helper text classes use it', () => {
    expect(measure).toBe('70ch');
    const sheet = themeStylesheet();
    expect(sheet.match(/--gn-measure: 70ch;/g)).toHaveLength(1);
    // The one :root block that carries the spacing tokens carries the measure too.
    expect(/:root \{[^}]*--gn-space-3: 1\.5rem;[^}]*--gn-measure: 70ch;/.test(sheet)).toBe(true);

    for (const selector of PROSE_IN_GLOBALS) {
      const capped = rulesNaming(css, selector).filter((r) => r.atRule === null && /max-width:\s*var\(--gn-measure\)/.test(r.body));
      expect(capped.length, `${selector} has no max-width: var(--gn-measure)`).toBeGreaterThan(0);
    }
    expect(valueOf(ruleExactly(ui, '.gn-help__column'), 'max-width')).toBe('var(--gn-measure)');

    // CONTROL (same `it`): tables, the board and the notes document are NOT capped by the measure.
    for (const selector of ['.gn-board', '.gn-table', '.gn-notes', '.gn-notes__document', '.gn-list', '.gn-calendar', '.gn-timeline']) {
      for (const rule of [...rulesNaming(css, selector), ...rulesNaming(ui, selector)]) {
        if (rule.selectors.length === 1) expect(rule.body, selector).not.toMatch(/--gn-measure/);
      }
    }
  });
});

describe('23.044 the lit state is one thing in the bar and the top nav (audit SYS-20, NP-26, WS-08)', () => {
  it('23.044 both draw an indicator from --gn-nav-indicator on [aria-current="page"], and the last-project item is divided from the destinations', () => {
    const phone = '@media (max-width: 40rem)';
    // The token is declared once, in :root.
    const declared = rulesNaming(css, ':root').filter((rule) => valueOf(rule.body, '--gn-nav-indicator') !== null);
    expect(declared).toHaveLength(1);
    expect(valueOf(declared[0]?.body ?? '', '--gn-nav-indicator')).toBe('var(--gn-text)');
    // The bar: its indicator bar is painted with the token and shown for the current item.
    expect(valueOf(ruleExactly(css, '.gn-bottom-bar__indicator', phone), 'background')).toBe('var(--gn-nav-indicator)');
    expect(valueOf(ruleExactly(css, '.gn-bottom-bar__item[aria-current="page"] .gn-bottom-bar__indicator', phone), 'opacity')).toBe('1');
    // The top nav: the lit link draws the same indicator (an ::after bar), keyed on aria-current.
    const top = ruleExactly(css, ".gn-nav a[aria-current='page']:not([role='menuitem'])::after");
    expect(valueOf(top, 'background')).toBe('var(--gn-nav-indicator)');
    expect(valueOf(top, 'content')).toBe('""');
    // The last-project item is set apart from the destinations by a rule and its label is a quiet one.
    expect(valueOf(ruleExactly(css, '.gn-nav__project'), 'border-inline-start')).toBe('1px solid var(--gn-border)');
    expect(valueOf(ruleExactly(css, '.gn-nav__project-label'), 'color')).toBe('var(--gn-text-muted)');

    // Popover rows (menuitems) are excluded from the bar, and the project name may shrink below its text.
    expect(top).not.toBe('');
    expect(valueOf(ruleExactly(css, '.gn-nav__more > .gn-nav__project > a', '@media (min-width: 70.0625rem)'), 'min-width')).toBe('0');
    // The label gives its room back up to 80rem — the rule is nested in the min-width: 70.0625rem arm, so it is the 1121–1280px band (the row has no width to spare).
    const hidden = ruleExactly(css, '.gn-nav__project-label', '@media (max-width: 80rem)');
    expect(valueOf(hidden, 'display')).toBe('none');

    // CONTROL (same `it`): the indicator is NOT a colour on the text alone — it is a separate bar in both.
    expect(valueOf(ruleExactly(css, '.gn-bottom-bar__indicator', phone), 'height')).toBe('0.1875rem');
    expect(valueOf(top, 'height')).toBe('0.1875rem');
  });
});
