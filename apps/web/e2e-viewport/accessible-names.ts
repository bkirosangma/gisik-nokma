import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

/**
 * The population the owner's copy rule protects and nothing else watched:
 * "reject anything that loses information or an aria-label" (2026-09-08).
 *
 * Counts, not names. A restyle that swaps one accessible name for another of
 * equal count is not this gate's business — that is the copy rule, reviewed by
 * a person. A restyle that DROPS one is, and a count that fell is the whole
 * signal. Same one-way shape as the tap-target and type-scale baselines.
 */
export type AccessibleNameCounts = {
  ariaLabel: number;
  role: number;
  ariaSelected: number;
  ariaDescribedby: number;
  /** Every element the sweep examined — the selector control. */
  rawMatches: number;
};

export const ACCESSIBLE_BASELINE_PATH = fileURLToPath(
  new URL('./accessible-names-baseline.json', import.meta.url),
);

export async function sweepAccessibleNames(page: Page): Promise<AccessibleNameCounts> {
  return page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('*'));
    const count = (attr: string): number => all.filter((el) => el.hasAttribute(attr)).length;
    return {
      ariaLabel: count('aria-label'),
      role: count('role'),
      ariaSelected: count('aria-selected'),
      ariaDescribedby: count('aria-describedby'),
      rawMatches: all.length,
    };
  });
}

export function readAccessibleBaseline(
  path: string = ACCESSIBLE_BASELINE_PATH,
): Record<string, AccessibleNameCounts> {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Record<string, AccessibleNameCounts>;
  } catch {
    return {};
  }
}

/**
 * Writes ABSENT keys only. A branch that lowered a count must not be able to
 * re-baseline over it; lowering needs the key deleted from the file first, on
 * purpose, in a commit that says why. Copied from `recordTypeScaleBaseline`'s
 * contract, which cost two wasted runs to relearn on the tap-target pass.
 */
export function recordAccessibleBaseline(
  path: string,
  key: string,
  counts: AccessibleNameCounts,
): void {
  const current = readAccessibleBaseline(path);
  if (key in current) return;
  current[key] = counts;
  writeFileSync(path, `${JSON.stringify(current, null, 2)}\n`);
}

/** The four counts that may fall and never rise. `rawMatches` is the control, not ratcheted. */
export const RATCHETED: ReadonlyArray<keyof AccessibleNameCounts> = [
  'ariaLabel',
  'role',
  'ariaSelected',
  'ariaDescribedby',
];
