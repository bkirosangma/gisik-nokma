import { describe, expect, it } from 'vitest';
import { formatRollup } from '../../src/views/rollup-text.js';

describe('3.145 formatRollup — derived progress to the viewer (spec §6)', () => {
  it('reads "n of m done" over ALL children', () => {
    expect(formatRollup({ totalChildren: 8, terminalChildren: 5, restrictedCount: 0 })).toBe('5 of 8 done');
  });

  it('PLANTED DEFECT: restricted children are counted AND named, never hidden', () => {
    // The deceptive render would be "5 of 6 done" (only visible children) or
    // dropping the restriction note. True counts, restriction named:
    const text = formatRollup({ totalChildren: 8, terminalChildren: 5, restrictedCount: 2 });
    expect(text).toBe('5 of 8 done, 2 restricted');
    expect(text).toContain('of 8');
    expect(text).not.toContain('of 6');
  });

  it('PLANTED DEFECT: the denominator never shrinks by the restricted count, at any ratio', () => {
    // A defect that subtracts restricted children from the total is invisible
    // at restrictedCount 0 and hides behind a single example at any one ratio.
    // Every visible child restricted still reports the true total.
    expect(formatRollup({ totalChildren: 3, terminalChildren: 0, restrictedCount: 3 })).toBe(
      '0 of 3 done, 3 restricted',
    );
    expect(formatRollup({ totalChildren: 12, terminalChildren: 11, restrictedCount: 1 })).toBe(
      '11 of 12 done, 1 restricted',
    );
  });

  it('says nothing about restriction when there is none to name', () => {
    expect(formatRollup({ totalChildren: 0, terminalChildren: 0, restrictedCount: 0 })).toBe('0 of 0 done');
  });
});
