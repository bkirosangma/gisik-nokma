import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

/**
 * Asserted against the PARSED job graph rather than the file's text. A grep for
 * `needs:` under a job would pass or fail on formatting and would say nothing about
 * what CI actually does; parsing gives the property itself, and survives reindentation,
 * comment edits and key reordering.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const workflow = parse(readFileSync(join(REPO_ROOT, '.github/workflows/ci.yml'), 'utf8')) as {
  jobs: Record<string, { needs?: string | string[]; if?: string; steps?: { run?: string }[] }>;
};

const needsOf = (job: string): string[] => {
  const n = workflow.jobs[job]?.needs;
  return n === undefined ? [] : Array.isArray(n) ? n : [n];
};

/**
 * The non-empty `run:` bodies of a job's steps.
 *
 * Carried because "a job exists" and "a job RUNS something" are two different
 * properties, and only the second one can fail. A `viewport:` key with no step
 * that invokes the suite would satisfy a name check while running nothing — the
 * exact shape this repository catalogues as a check that cannot fail, and the
 * shape `e2e`'s own comment records having already been through once
 * ("green-by-absence had become green-by-presence").
 */
const runsOf = (job: string): string[] =>
  (workflow.jobs[job]?.steps ?? [])
    .map((s) => s.run ?? '')
    .filter((r) => r !== '');

describe('ci.yml job graph', () => {
  /**
   * 13.208 — `check-citations` runs UNCONDITIONALLY: no `needs:` and no `if:`. It is the
   * shape `check-runbook` was rewritten into after a docs-only-skip defect, where a
   * change-detection gate meant the check silently did not run on exactly the commits
   * that edited the catalogue. Gating it on "code changed" would make a citation
   * regression invisible on a docs-only PR, which is when citations change.
   */
  it('runs check-citations unconditionally — no needs, no if', () => {
    expect(workflow.jobs['check-citations']).toBeDefined();
    expect(workflow.jobs['check-citations']?.needs).toBeUndefined();
    expect(workflow.jobs['check-citations']?.if).toBeUndefined();
  });

  /**
   * 13.208 — and the other half of the row: a job nothing depends on cannot fail the
   * build, so being unconditional is only half the property. `gate` must name it.
   */
  it('makes gate depend on check-citations, so an unconditional job can still fail the build', () => {
    expect(needsOf('gate')).toContain('check-citations');
    // The positive control: `gate` really is the fan-in, not an empty job whose needs
    // list happens to contain one name. check-runbook is the sibling this shape came from.
    expect(needsOf('gate')).toContain('check-runbook');
    // A gate job that exists but that `gate` does not wait for is a check that
    // cannot fail the build — the exact shape this repository keeps meeting.
    expect(workflow.jobs['check-help']).toBeDefined();
    expect(needsOf('gate')).toContain('check-help');
    expect(needsOf('gate').length).toBeGreaterThan(2);
  });

  /**
   * 16.59 — the VIEWPORT suite is on the gate, and the assertion is on what the
   * job RUNS rather than on the job's name.
   *
   * `apps/web/e2e-viewport/responsive.spec.ts` drives a real Chromium at 390 /
   * 768 / 1512 against a `next dev` built from the working tree. It was
   * reachable only by an explicit `-c playwright.viewport.config.ts` that no
   * turbo task defined and that this workflow never named: measured 2026-09-20,
   * the string `viewport` occurred **0 times** in `ci.yml` while the same
   * invocation found `e2e` nine times. The bill was five days of a red tap-target
   * ratchet on `main` (`25 / 23 / 25` against baselines of `10 / 16 / 16`) that
   * nothing could see. **A ratchet with no runner is a note, not a check.**
   *
   * ⚠ The FIRST assertion below is the one that carries the weight. A `viewport:`
   * job whose steps do not invoke `test:e2e:viewport` satisfies every name-shaped
   * check while running nothing, and then reads as coverage — strictly worse than
   * no job at all, which is the same reasoning `e2e`'s own comment gives for
   * refusing a file-presence gate. So the command is asserted, not the key.
   */
  it('runs the viewport suite on CI, and gate waits on it', () => {
    expect(workflow.jobs['viewport']).toBeDefined();

    const runs = runsOf('viewport');
    // The control for a sweep that found nothing: the job must have SOMETHING to
    // run before "one of them is the suite" can mean anything.
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.some((r) => r.includes('test:e2e:viewport'))).toBe(true);

    // And the second half of the property, the same one check-citations needed:
    // a job nothing depends on cannot fail the build.
    expect(needsOf('gate')).toContain('viewport');

    // The positive control, through the SAME accessor: `runsOf` is not vacuous
    // over this document. `build` really does carry `run:` steps, so an empty
    // list above would mean the parse or the accessor broke, not that CI is tidy.
    expect(runsOf('build').length).toBeGreaterThan(0);
  });
});
