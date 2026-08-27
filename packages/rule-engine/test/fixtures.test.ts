import { describe, expect, it } from 'vitest';
import { evaluateEvent } from '../src/index.js';
import { assertFixtureOutcome, buildInMemoryContext, completeCandidate, loadFixtures } from '../src/fixtures/harness.js';

const fixtures = loadFixtures();

describe('planted-defect fixtures', () => {
  it('the suite is not empty', () => {
    expect(fixtures.length).toBeGreaterThan(0);
  });

  for (const fx of fixtures) {
    it(fx.name, async () => {
      const result = await evaluateEvent(completeCandidate(fx), buildInMemoryContext(fx));
      assertFixtureOutcome(result, fx);
    });
  }
});
