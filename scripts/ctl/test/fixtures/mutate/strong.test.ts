// the STRONG test: every mutant of calc.ts dies (13.2207)
import { it, expect } from 'vitest';
import { over } from '../src/calc';
it('over', () => {
  expect(over(201)).toBe(true);
  expect(over(200)).toBe(false);
  expect(over(21)).toBe(false);
  expect(over(1999)).toBe(true);
  expect(over(5000)).toBe(true);
});
