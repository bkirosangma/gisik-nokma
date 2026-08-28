import { describe, expect, it } from 'vitest';
import { evaluateEvent } from '../src/index.js';
import { assertFixtureOutcome, buildInMemoryContext, completeCandidate, loadFixtures } from '../src/fixtures/harness.js';

const fixtures = loadFixtures();

describe('planted-defect fixtures', () => {
  // The count gate `loadFixtures` names as its compensating control for the
  // non-recursive scan: a fixture filed into a subdirectory, or saved with the
  // wrong extension, is silently skipped, and only an exact count catches it.
  // Bump this number in the SAME COMMIT as any fixture addition or removal —
  // a gate that lags its directory is a gate that has been turned off.
  it('every fixture in the directory loads — exactly 61', () => {
    expect(fixtures).toHaveLength(61);
  });

  for (const fx of fixtures) {
    it(fx.name, async () => {
      const result = await evaluateEvent(completeCandidate(fx), buildInMemoryContext(fx));
      assertFixtureOutcome(result, fx);
    });
  }
});
