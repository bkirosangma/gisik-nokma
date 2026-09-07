import { describe, expect, it } from 'vitest';
import { evaluateEvent } from '../src/index.js';
import { assertFixtureOutcome, buildInMemoryContext, completeCandidate, loadFixtures } from '../src/fixtures/harness.js';

const fixtures = loadFixtures();

/**
 * 4.34 — advisories never gate publish: a definition that trips only `rdu-bypassable` is ACCEPTED by the engine. Proven by the fixture `workflow-defined-accepts-a-def-the-advisory-warns-about.json`, which this loop executes by name — the acceptance lives here rather than in `advise-workflow.test.ts`, which only asserts that the advisory is emitted.
 */
/**
 * 5.14 — every fixture in packages/rule-engine/fixtures/ runs as its own it(fx.name) test in this one file, auditing that each refusal fixture has an accepting twin directly off the directory rather than via a single generic property test.
 */
describe('planted-defect fixtures', () => {
  // The count gate `loadFixtures` names as its compensating control for the
  // non-recursive scan: a fixture filed into a subdirectory, or saved with the
  // wrong extension, is silently skipped, and only an exact count catches it.
  // Bump this number in the SAME COMMIT as any fixture addition or removal —
  // a gate that lags its directory is a gate that has been turned off.
  it('every fixture in the directory loads — exactly 86', () => {
    expect(fixtures).toHaveLength(86);
  });

  for (const fx of fixtures) {
    it(fx.name, async () => {
      const result = await evaluateEvent(completeCandidate(fx), buildInMemoryContext(fx));
      assertFixtureOutcome(result, fx);
    });
  }
});
