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
  jobs: Record<string, { needs?: string | string[]; if?: string }>;
};

const needsOf = (job: string): string[] => {
  const n = workflow.jobs[job]?.needs;
  return n === undefined ? [] : Array.isArray(n) ? n : [n];
};

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
});
