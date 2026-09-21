import { describe, expect, it } from 'vitest';
import { SIGNED_OUT_HINT } from './copy.js';

/**
 * 12.407 — E5-26: the desktop shell's signed-out sentence states plainly
 * that sign-in isn't available yet, and names neither a Settings screen
 * (there is none — `grep -rni settings apps/desktop/src` finds only this
 * sentence's own old wording) nor a plan section a reader here cannot open.
 */
describe('SIGNED_OUT_HINT', () => {
  it('12.407 — states plainly that sign-in is not available, pointing at the website', () => {
    expect(SIGNED_OUT_HINT).toBe('The desktop app cannot sign in yet — use the website.');
  });

  it('names no Settings screen and no plan reference the reader cannot open from here', () => {
    expect(SIGNED_OUT_HINT.toLowerCase()).not.toContain('settings');
    expect(SIGNED_OUT_HINT.toLowerCase()).not.toContain('plan');
    expect(SIGNED_OUT_HINT.toLowerCase()).not.toContain('token');
  });
});
