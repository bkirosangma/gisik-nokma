import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { expect } from 'vitest';
import { REPO_ROOT } from './colour-scan.js';
import { parseRules, readUiCss, ruleExactly, valueOf } from './css-rules.js';

/**
 * Styling refresh Plan B, Task B1. The Pattern table of
 * `docs/superpowers/plans/2026-09-29-styling-system-refresh-b-screens.md`, as
 * data, and the three checks every screen task runs. `globals.css` is read by
 * this package's tests already (`components.test.tsx:544-547`), so turbo's
 * inputs already cover it.
 */
export const GLOBALS_CSS_PATH = join(REPO_ROOT, 'apps/web/app/globals.css');
export function readGlobalsCss(): string {
  return readFileSync(GLOBALS_CSS_PATH, 'utf8');
}

const RAISED = {
  background: 'var(--gn-surface-raised)',
  'box-shadow': 'var(--gn-shadow-lift)',
  'border-radius': 'var(--gn-radius-card)',
} as const;

export const PATTERNS = {
  'P-QUIET': {
    'min-height': '2.75rem',
    border: '1px solid var(--gn-border)',
    'border-radius': '999px',
    background: 'transparent',
    color: 'var(--gn-text-muted)',
  },
  'P-GHOST': {
    'min-height': '2.75rem',
    border: 'none',
    'border-radius': '999px',
    background: 'transparent',
    color: 'var(--gn-text-subtle)',
  },
  'P-TRACK': {
    background: 'var(--gn-surface-track)',
    'box-shadow': 'var(--gn-shadow-track)',
    'border-radius': 'var(--gn-radius-track)',
    padding: '0.5rem',
  },
  'P-WELL': {
    background: 'var(--gn-surface-well)',
    'box-shadow': 'var(--gn-shadow-track)',
    'border-radius': 'var(--gn-radius-card)',
  },
  'P-RAISED': RAISED,
  'P-ROW': RAISED,
  'P-FLOAT': {
    background: 'var(--gn-surface-raised)',
    'box-shadow': 'var(--gn-shadow-lift-near)',
    'border-radius': 'var(--gn-radius-card)',
  },
  'P-HOVER': { background: 'var(--gn-fill-quaternary)' },
} as const satisfies Record<string, Record<string, string>>;
export type PatternName = keyof typeof PATTERNS;

export type RosterRow = {
  sheet: 'ui' | 'globals';
  selectors: string | readonly string[];
  pattern?: PatternName;
  /** Declarations beyond (or instead of) the pattern's — a row the plan's table spells out. */
  declarations?: Record<string, string>;
  atRule?: string;
  /**
   * `P-QUIET` / `P-GHOST` rows are also checked for their COMPANION hover rule
   * (`HOVER_COMPANIONS`). A row skips it only by naming a reason:
   * `hover: 'none: <why>'`, so an opt-out is visible in the roster.
   */
  hover?: string;
};

/**
 * The "And" column of the Pattern table for the two patterns that have one.
 * `${s}` is one of the row's selectors; each rule is `selectors` (a list, in
 * order) → declarations.
 */
const HOVER_COMPANIONS: Partial<Record<PatternName, ReadonlyArray<{ selectors: (s: string) => string[]; declarations: Record<string, string> }>>> = {
  'P-QUIET': [{ selectors: (s) => [`${s}:hover:not(:disabled)`], declarations: { background: 'var(--gn-fill-quaternary)' } }],
  'P-GHOST': [
    {
      selectors: (s) => [`${s}:hover:not(:disabled)`, `${s}:focus-visible`],
      declarations: { background: 'var(--gn-fill-tertiary)', color: 'var(--gn-text-muted)' },
    },
    { selectors: (s) => [`${s}:focus-visible`], declarations: { outline: '2px solid var(--gn-focus-ring)', 'outline-offset': '0' } },
  ],
};

function expectHoverCompanion(row: RosterRow, css: string): void {
  const companions = row.pattern === undefined ? undefined : HOVER_COMPANIONS[row.pattern];
  if (companions === undefined) return;
  if (row.hover !== undefined) {
    if (!/^none: \S/.test(row.hover)) throw new Error(`row ${String(row.selectors)}: an opt-out must read 'none: <reason>', got '${row.hover}'`);
    return;
  }
  const bases = typeof row.selectors === 'string' ? [row.selectors] : row.selectors;
  for (const companion of companions) {
    const body = ruleExactly(css, bases.flatMap((base) => companion.selectors(base)), row.atRule ?? null);
    for (const [property, value] of Object.entries(companion.declarations)) {
      expect(valueOf(body, property), `${String(row.selectors)} (${row.pattern} hover companion): ${property}`).toBe(value);
    }
  }
}

export function cssOf(sheet: 'ui' | 'globals'): string {
  return sheet === 'ui' ? readUiCss() : readGlobalsCss();
}

export function expectRow(row: RosterRow, css: string = cssOf(row.sheet)): void {
  const body = ruleExactly(css, row.selectors, row.atRule ?? null);
  const expected = { ...(row.pattern === undefined ? {} : PATTERNS[row.pattern]), ...(row.declarations ?? {}) };
  if (Object.keys(expected).length === 0) throw new Error(`row ${String(row.selectors)} expects nothing`);
  for (const [property, value] of Object.entries(expected)) {
    expect(valueOf(body, property), `${String(row.selectors)} (${row.pattern ?? 'custom'}): ${property}`).toBe(value);
  }
  expectHoverCompanion(row, css);
}

/**
 * The flat fills rule 03/04 retire as a BOUNDARY: a `surface-sunken`
 * background (1.14:1 on the paper, Plan A 20.001) and the retired control
 * constant (`fill-tertiary` fill + `text-accent` label, 1.09–1.15:1). Returns
 * the selector lists of offending rules that name any of `prefixes`, minus the
 * `kept` lists (state fills, neo's own character — each task's table).
 */
export function flatBoundaryOffenders(css: string, prefixes: readonly string[], kept: readonly string[]): string[] {
  return parseRules(css)
    .filter((rule) => rule.selectors.some((selector) => prefixes.some((prefix) => selector.includes(prefix))))
    .filter((rule) => {
      const sunken = valueOf(rule.body, 'background') === 'var(--gn-surface-sunken)';
      const constant =
        valueOf(rule.body, 'background') === 'var(--gn-fill-tertiary)' &&
        valueOf(rule.body, 'color') === 'var(--gn-text-accent)';
      return sunken || constant;
    })
    .map((rule) => rule.selectors.join(', '))
    .filter((list) => !kept.includes(list));
}

/** Every route file, repo-relative. */
export function listPageRoutes(root: string = join(REPO_ROOT, 'apps/web/app')): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name === 'page.tsx') found.push(relative(REPO_ROOT, path));
    }
  };
  walk(root);
  return found.sort();
}

export function unownedRoutes(found: readonly string[], owners: Record<string, string>): { unowned: string[]; stale: string[] } {
  return {
    unowned: found.filter((route) => !(route in owners)),
    stale: Object.keys(owners).filter((route) => !found.includes(route)),
  };
}

/** The Inventory table of the plan, route → owning task. */
export const SCREEN_OWNERS: Record<string, string> = {
  'apps/web/app/page.tsx': 'B1',
  'apps/web/app/sign-in/page.tsx': 'B19',
  'apps/web/app/invite/[token]/page.tsx': 'B19',
  'apps/web/app/mcp/authorize/page.tsx': 'B19',
  'apps/web/app/mcp/tokens/page.tsx': 'B19',
  'apps/web/app/workspaces/page.tsx': 'B14',
  'apps/web/app/w/[workspaceId]/page.tsx': 'B13',
  'apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx': 'A5-A7, B5-B8',
  'apps/web/app/w/[workspaceId]/my-work/page.tsx': 'B10',
  'apps/web/app/w/[workspaceId]/members/page.tsx': 'B12',
  'apps/web/app/w/[workspaceId]/settings/workflows/page.tsx': 'B16',
  'apps/web/app/w/[workspaceId]/settings/workflows/new/page.tsx': 'B16',
  'apps/web/app/w/[workspaceId]/settings/workflows/[workflowId]/page.tsx': 'B16',
  'apps/web/app/w/[workspaceId]/settings/workflows/[workflowId]/history/page.tsx': 'B16',
  'apps/web/app/w/[workspaceId]/settings/ticket-types/page.tsx': 'B16',
  'apps/web/app/w/[workspaceId]/settings/ticket-types/new/page.tsx': 'B16',
  'apps/web/app/w/[workspaceId]/settings/ticket-types/[typeId]/page.tsx': 'B16',
  'apps/web/app/settings/page.tsx': 'B15',
  'apps/web/app/account/page.tsx': 'B17',
  'apps/web/app/inbox/page.tsx': 'B18',
  'apps/web/app/notes/page.tsx': 'B11',
  'apps/web/app/notes/[noteId]/page.tsx': 'B11',
  'apps/web/app/help/page.tsx': 'B20',
  'apps/web/app/privacy/page.tsx': 'B20',
  'apps/web/app/terms/page.tsx': 'B20',
};
