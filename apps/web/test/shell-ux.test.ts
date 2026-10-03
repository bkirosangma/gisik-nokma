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
    // The project page's real <main> carries it; its Suspense fallback is `ProjectPageSkeleton` since smoothness T5 (25.052), whose own
    // <main> carries it too: neither may be left at 80rem.
    expect(mainClasses(read(`../${WORK_SURFACES[0]}`)).length).toBeGreaterThanOrEqual(1);
    expect(read(`../${WORK_SURFACES[0]}`)).toContain('fallback={<ProjectPageSkeleton');
    expect(read('../src/skeletons/page-shells.tsx')).toContain('<main id="gn-main" className="gn-shell gn-shell--wide gn-shell--skeleton"');

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
    // No narrower arm re-inserts a smaller side padding on the bar: NO `.gn-nav__inner` rule inside an at-rule declares
    // `padding` (the shorthand carries the sides) or `padding-inline` — only the base rule owns the gutter.
    for (const rule of rulesNaming(css, '.gn-nav__inner')) {
      expect(valueOf(rule.body, 'padding-inline'), rule.atRule ?? 'base').toBeNull();
      if (rule.atRule !== null) expect(valueOf(rule.body, 'padding'), rule.atRule).toBeNull();
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
    '.gn-workspace-home__stranger',
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

    // The measure group is pinned EXACTLY: the one rule whose whole body is `max-width: var(--gn-measure)` lists
    // these seven classes (in any order) — so a work surface added to it, or a class dropped from it, is red.
    const group = parseRules(css).filter((rule) => rule.atRule === null && /^\s*max-width:\s*var\(--gn-measure\);?\s*$/.test(rule.body));
    expect(group, 'exactly one bare max-width: var(--gn-measure) rule').toHaveLength(1);
    expect([...(group[0]?.selectors ?? [])].sort()).toEqual(PROSE_IN_GLOBALS.filter((s) => s !== '.gn-legal__column').sort());

    // CONTROL (same `it`): tables, the board and the notes document are NOT capped by the measure — in ANY rule that
    // names them, however many other selectors share it (a grouped rule is how one would sneak in).
    for (const selector of ['.gn-board', '.gn-table', '.gn-notes', '.gn-notes__document', '.gn-list', '.gn-list__table', '.gn-calendar', '.gn-timeline']) {
      for (const rule of [...rulesNaming(css, selector), ...rulesNaming(ui, selector)]) {
        expect(rule.body, `${selector} in ${rule.selectors.join(', ')}`).not.toMatch(/--gn-measure/);
      }
    }
  });
});

describe('23.044 the lit state is one thing in the bar and the top nav (audit SYS-20, NP-26, WS-08)', () => {
  it('23.044 both draw an indicator from --gn-nav-indicator on [aria-current="page"], and the last-project item is divided from the destinations', () => {
    // The bar's rules are the 64rem arm's since UX fixes Task 4 (case 23.051); they were the 40rem phone arm's when this case was written.
    const phone = '@media (max-width: 64rem)';
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
    expect(valueOf(ruleExactly(css, '.gn-nav__more > .gn-nav__project > a', '@media (min-width: 64.0625rem)'), 'min-width')).toBe('0');
    // The label is not hidden at any width (UX fixes Task 4, amended 2026-10-02): the 1121–1280px `display: none` Task 3 added as an
    // interim — the row had no width to spare — is gone, the row being refitted from 1025px with a tighter gap (case 23.042).
    expect(rulesNaming(css, '.gn-nav__project-label').filter((rule) => valueOf(rule.body, 'display') === 'none')).toEqual([]);
    // What fits it (measured in Chrome 2026-10-02: 1121px, seed names, label 76 of 76px; 25-character names: the label gives way
    // first and the link stays readable): link padding and gap tightened, the label shrinks before the link, the group has a floor.
    const arm = '@media (min-width: 64.0625rem)';
    expect(valueOf(ruleExactly(css, '.gn-nav .gn-nav__links a', arm), 'padding-inline')).toBe('0.5rem');
    expect(valueOf(ruleExactly(css, '.gn-nav__project-label', arm), 'flex')).toBe('0 8 auto');
    expect(valueOf(ruleExactly(css, '.gn-nav__more > .gn-nav__project', arm), 'min-width')).toBe('6.25rem');

    // CONTROL (same `it`): the indicator is NOT a colour on the text alone — it is a separate bar in both.
    expect(valueOf(ruleExactly(css, '.gn-bottom-bar__indicator', phone), 'height')).toBe('0.1875rem');
    expect(valueOf(top, 'height')).toBe('0.1875rem');
  });
});
