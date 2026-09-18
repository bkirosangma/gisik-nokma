import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  EXPECTED_KNOWN_GOOD,
  EXPECTED_PLANTED,
  KNOWN_GOOD,
  PLANTED,
  checkMigrationOrder,
  materializeRef,
  numericPrefix,
  readMigrationNames,
} from '../../../../scripts/check-migration-order.mjs';

/**
 * The same reasoning as `check-runbook-commands.test.ts` beside this file: the script's own
 * planted-defect self-test is real, but it lives in `scripts/`, outside the citation corpus and
 * outside `pnpm turbo run test`. These cases import the SAME exported fixtures and the SAME
 * directory reader the script uses, so a copied fixture could never drift from the one the check
 * actually runs against.
 *
 * The fixtures are real DIRECTORIES, not arrays, and that is the point rather than a detail: the
 * reader (`readdirSync` plus the runner's filter and sort) is the half that rots silently, and a
 * test that passed arrays would prove the comparison while leaving the reader unwitnessed.
 */
const scratch = mkdtempSync(join(tmpdir(), 'check-migration-order-test-'));
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

let n = 0;
function dirWith(names: string[]): string {
  const dir = join(scratch, `d${n++}`);
  mkdirSync(dir, { recursive: true });
  for (const name of names) writeFileSync(join(dir, name), '-- fixture\n');
  return dir;
}

/**
 * 13.902 — a migration numbered below one already on the base ref is refused, and the refusal names
 * the offender AND the ceiling it failed to clear. Both directions are asserted on the same pair,
 * because one-sided it would pass under a mutation that refused everything: the file the real
 * incident carried (`1789300000000_proj-tickets-reopened-at.sql`, PR #459) is refused against a
 * base holding `1789400000000`, and the SAME file renamed to `1789500000000` — which is what commit
 * `73c40ea3` actually did — is accepted.
 */
describe('check-migration-order', () => {
  it('13.902 — refuses a migration below the base refs highest prefix, and accepts the rename above it', () => {
    const base = dirWith(['1789200000000_rank.sql', '1789400000000_auto-close.sql']);

    const refused = checkMigrationOrder({
      baseDir: base,
      currentDir: dirWith([
        '1789200000000_rank.sql',
        '1789300000000_reopened-at.sql',
        '1789400000000_auto-close.sql',
      ]),
    });
    expect(refused.problems).toHaveLength(1);
    expect(refused.problems[0]).toContain('1789300000000_reopened-at.sql');
    expect(refused.problems[0]).toContain('1789400000000');
    expect(refused.baseMax).toBe(1789400000000);

    const accepted = checkMigrationOrder({
      baseDir: base,
      currentDir: dirWith([
        '1789200000000_rank.sql',
        '1789400000000_auto-close.sql',
        '1789500000000_reopened-at.sql',
      ]),
    });
    expect(accepted.problems).toEqual([]);
    expect(accepted.newFiles).toEqual(['1789500000000_reopened-at.sql']);
  });

  /**
   * 13.903 — every planted defect shape is caught, and the mirror control stays clean. The count is
   * asserted rather than "greater than zero" so a case cannot quietly start producing a second,
   * unrelated problem; each refusal must also NAME its own site, which is what separates a check
   * that fired for the right reason from one that fired broadly.
   */
  it('13.903 — catches every planted defect shape, and accepts the known-good control', () => {
    expect(PLANTED).toHaveLength(EXPECTED_PLANTED);
    for (const c of PLANTED) {
      const { problems } = checkMigrationOrder({
        baseDir: dirWith(c.base),
        currentDir: dirWith(c.current),
      });
      expect(problems, `planted defect: ${c.name}`).toHaveLength(c.expect);
      for (const name of c.names) {
        expect(problems.join('\n'), `planted defect: ${c.name}`).toContain(name);
      }
    }

    expect(KNOWN_GOOD).toHaveLength(EXPECTED_KNOWN_GOOD);
    for (const c of KNOWN_GOOD) {
      const { problems } = checkMigrationOrder({
        baseDir: dirWith(c.base),
        currentDir: dirWith(c.current),
      });
      expect(problems, `known-good case: ${c.name}`).toEqual([]);
    }
  });

  /**
   * 13.904 — the reader is what is under test, not only the comparison. A hidden file must not be
   * read as a migration: `.DS_Store` carries no numeric prefix, so the runner's `Number(prefix) || 0`
   * would read it as prefix 0 and it would be refused as the lowest migration in the tree. The
   * known-good fixture above covers that, and this asserts the reader directly so the filter's
   * removal reddens a test that names the filter rather than one that names a fixture.
   */
  it('13.904 — the reader ignores hidden files and sorts by numeric prefix, not lexicographically', () => {
    const probe = dirWith(['1789400000000_a.sql', '.DS_Store', '900000000000_b.sql']);
    expect(readMigrationNames(probe)).toEqual(['900000000000_b.sql', '1789400000000_a.sql']);

    // The two disagree in exactly one direction, which is why the reader cannot sort as strings:
    // `'1789400000000' < '900000000000'` lexicographically, and `900000000000 < 1789400000000`
    // numerically. A string sort would put the shorter prefix last and report the wrong ceiling.
    expect('1789400000000_a.sql' < '900000000000_b.sql').toBe(true);
    expect(numericPrefix('900000000000_b.sql')).toBeLessThan(
      numericPrefix('1789400000000_a.sql'),
    );
  });

  /**
   * 13.905 — the prefix parser mirrors `node-pg-migrate`'s, including the 17-digit `utc` form it
   * special-cases. This is the one divergence that produces a well-formed WRONG answer rather than a
   * failure: `Number('20260101000000000')` is 2.026e16, larger than any 13-digit epoch, so a check
   * that compared `Number()` would accept a migration that in fact sorts below everything.
   */
  it('13.905 — the 17-digit utc prefix resolves to its instant, not to its digits', () => {
    expect(numericPrefix('20260101000000000_backfill.sql')).toBe(1767225600000);
    expect(Number('20260101000000000')).toBeGreaterThan(1767225600000);

    const { problems } = checkMigrationOrder({
      baseDir: dirWith(['1789400000000_a.sql']),
      currentDir: dirWith(['1789400000000_a.sql', '20260101000000000_backfill.sql']),
    });
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('20260101000000000_backfill.sql');
    expect(problems[0]).toContain('1767225600000');
  });

  /**
   * 13.906 — the baseline half of the path is witnessed too. Review measured that `materializeRef`
   * and `resolveBaseRef` were covered by NO test at all, which is the half a defect had just been
   * found in, so the part that turns a git ref into a directory is now exercised rather than
   * assumed. `HEAD` is used instead of `origin/main` because it resolves in any checkout, and the
   * throw case is the one that matters most: a ref the repo cannot list must not silently
   * materialise an EMPTY baseline, which would make every migration "new" above a maximum of none
   * and report a clean sweep it had not earned.
   */
  it('13.906 — materialises a real ref into real files the reader can read, and THROWS for a ref it cannot list', () => {
    const dest = join(scratch, 'materialised');
    mkdirSync(dest, { recursive: true });
    const names = materializeRef('HEAD', dest);
    expect(names).toBeGreaterThan(0);
    // The materialised output must be readable by the SAME reader the real sweep uses, or the
    // baseline is on a different path from the tree it is compared against.
    expect(readMigrationNames(dest)).toHaveLength(names);

    expect(() => materializeRef('0'.repeat(40), join(scratch, 'never-written'))).toThrow();
  });
});
