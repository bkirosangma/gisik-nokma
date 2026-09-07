import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `check-runbook-commands.mjs` asserts that every file the runbook NAMES exists. That is
 * its job and it should keep doing only that — "the commands resolve" and "the documents
 * still say what they decided" are different questions, and folding the second into a
 * command resolver would give it two reasons to change.
 *
 * So the content assertion lives here instead, where the gate runs it and a catalogue row
 * can cite it. What it guards is a DECISION recorded in prose in two places: a decision
 * that exists only as a document can be deleted wholesale without any check noticing,
 * which is exactly what case 13.196 said about this pair.
 *
 * The assertions deliberately match SENTENCE FRAGMENTS rather than whole paragraphs or
 * single words. A whole paragraph breaks on rewrapping and teaches people to delete the
 * test; a single word like "scratch" would survive the decision being reversed.
 */
const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../../..');
const read = (rel: string): string => readFileSync(join(REPO_ROOT, rel), 'utf8');

/**
 * The three load-bearing clauses of the decision recorded for case 13.194. Each is a
 * separate claim, and reversing any one of them is the change this test exists to catch:
 * widening the scope beyond scratch databases, allowing production, or adding the DDL
 * credential the decision refuses.
 */
const DECISION_CLAUSES = [
  'runs ONLY against restore scratch databases',
  'never against production',
  'DDL-capable credential',
];

describe('recorded decisions survive in the documents that carry them', () => {
  /**
   * 13.196 — the content assertion the checker deliberately does not make. `verify:projections`
   * needs `CREATE SCHEMA` and `CREATE TABLE` on whatever it verifies, and the shadow trick is
   * safe only while every registered projection declares its table — one missing gets no shadow
   * copy and its unqualified `TRUNCATE` resolves to `public`, truncating the live table. The
   * decision not to hold a DDL credential is the whole mitigation, and until now it lived in
   * prose that nothing read.
   */
  it.each(['docs/runbook.md', 'deploy/do/README.md'])(
    '%s still records the verify:projections DDL decision (13.194)',
    (file) => {
      const text = read(file);
      for (const clause of DECISION_CLAUSES) {
        expect(text, `${file} no longer records: "${clause}"`).toContain(clause);
      }
    },
  );

  /**
   * 13.196 — the positive control for the pair above. Without it, a path typo or a moved file
   * would make `read()` throw or return something unrelated, and "contains the clauses" would
   * be failing for a reason that has nothing to do with the decision being intact.
   */
  it('reads the two real documents, not empty or missing files', () => {
    for (const file of ['docs/runbook.md', 'deploy/do/README.md']) {
      const text = read(file);
      expect(text.length).toBeGreaterThan(1000);
      expect(text).toContain('verify:projections');
    }
  });
});
