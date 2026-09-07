import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  EXPECTED_PLANTED,
  PLANTED,
  PLANTED_OK,
  check,
} from '../../../../scripts/check-runbook-commands.mjs';

/**
 * The same reasoning as `check-case-citations.test.ts`: the script's own planted-defect
 * self-test is real, but it lives in `scripts/`, outside the citation corpus and outside
 * `pnpm turbo run test`. These cases import the SAME exported fixtures the script checks
 * itself with, so the two can never drift — a copied fixture would be a second source of
 * truth that silently stops matching.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');

describe('check-runbook-commands', () => {
  /**
   * 13.190 — the real sweep over `docs/runbook.md` resolves every reference it matches, and
   * reports both a raw and a distinct count. The counts are asserted because a matcher that
   * quietly stopped firing would still report "all references resolve" over the handful it
   * still saw — a clean answer it had not earned.
   */
  it('resolves every command docs/runbook.md names, and reports both counts', () => {
    const runbook = readFileSync(join(REPO_ROOT, 'docs/runbook.md'), 'utf8');
    const { problems, counted, unique } = check(runbook, 'docs/runbook.md');
    expect(problems).toEqual([]);
    expect(counted).toBeGreaterThan(0);
    expect(unique).toBeGreaterThan(0);
    expect(unique).toBeLessThanOrEqual(counted);
  });

  /**
   * 13.191 — the planted-defect self-test catches every shape it claims to, and its mirror
   * control stays clean. One planted defect per SHAPE rather than per matcher: with four
   * defects that all used `scripts/….sh`, dropping `deploy/` from the path prefixes left
   * every defect still caught while `deploy/do/README.md` silently stopped being checked.
   */
  it('catches every planted defect shape, and accepts the known-good control', () => {
    expect(check(PLANTED, 'self-test').problems).toHaveLength(EXPECTED_PLANTED);
    expect(check(PLANTED_OK, 'self-test').problems).toEqual([]);
  });

  /**
   * 13.192 — the resolver is checked at BOTH ends of its range on the same pair: the ghost
   * script name the runbook's first draft carried (`ops:sweep-orphans`, which no package
   * defines) is reported, and the real name it was corrected to (`sweep:orphans`) is not.
   * A one-sided assertion here would pass under a mutation that flagged everything.
   */
  it('flags a script name no package defines, and accepts the real one', () => {
    const ghost = check('    pnpm --filter @gisik-nokma/server run ops:sweep-orphans\n', 'test');
    expect(ghost.problems).toHaveLength(1);
    expect(ghost.problems[0]).toContain('ops:sweep-orphans');

    const real = check('    pnpm --filter @gisik-nokma/server run sweep:orphans\n', 'test');
    expect(real.problems).toEqual([]);
    expect(real.counted).toBe(1);
  });
});
