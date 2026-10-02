import { describe, expect, it } from 'vitest';
import { ruleExactly, valueOf } from './helpers/css-rules.js';
import { readGlobalsCss } from './helpers/style-patterns.js';

/** The web app on phones, Plan Task 3 — the CSS half of the bottom bar (cases 21.028, 21.029, 21.031). */
/** AMENDED 2026-10-02 (UX fixes Task 4, owner ruling U3, cases 23.050/23.051): the bar's rules moved from the 40rem phone arm to the 64rem tablet arm; the name stays so each case reads as it was written. */
const PHONE = '@media (max-width: 64rem)';
const css = readGlobalsCss();
const BAR = 'calc(var(--gn-phone-bar-height) + env(safe-area-inset-bottom))';

describe('21.028 the bar is fixed above the safe area and the shell leaves room for it', () => {
  it('21.028 at ≤64rem (was ≤40rem; amended 2026-10-02): fixed to the bottom, bar height + safe-area inset, the shell padded by the same calc; above 64rem the bar is display: none', () => {
    const bar = ruleExactly(css, '.gn-bottom-bar', PHONE);
    expect(valueOf(bar, 'position')).toBe('fixed');
    expect(valueOf(bar, 'bottom')).toBe('0');
    expect(valueOf(bar, 'height')).toBe(BAR);
    expect(valueOf(bar, 'padding-bottom')).toBe('env(safe-area-inset-bottom)');
    expect(valueOf(ruleExactly(css, '.gn-shell:has(.gn-bottom-bar)', PHONE), 'padding-bottom')).toContain(BAR);
    expect(valueOf(ruleExactly(css, '.gn-bottom-bar'), 'display')).toBe('none');
    // CONTROL — the desktop shell's own padding is untouched (it still reads the shared token).
    expect(valueOf(ruleExactly(css, '.gn-shell'), 'padding')).toBe('0 var(--gn-space-3) var(--gn-shell-pad-bottom)');
  });
});

describe('21.029 every slot is a 44px target and the current one is not colour alone', () => {
  it('21.029 each item is ≥2.75rem tall and wide; the current item draws an indicator bar; the indicator is hidden on the others', () => {
    const item = ruleExactly(css, '.gn-bottom-bar__item', PHONE);
    expect(valueOf(item, 'min-height')).toBe('2.75rem');
    expect(valueOf(item, 'min-width')).toBe('2.75rem');
    const indicator = ruleExactly(css, '.gn-bottom-bar__indicator', PHONE);
    expect(valueOf(indicator, 'opacity')).toBe('0');
    // CONTROL — the same indicator is made visible for the current item, so the `0` above is the other items' state.
    const current = ruleExactly(css, '.gn-bottom-bar__item[aria-current="page"] .gn-bottom-bar__indicator', PHONE);
    expect(valueOf(current, 'opacity')).toBe('1');
  });
});

describe('21.031 the bar steps aside while the on-screen keyboard is open', () => {
  it('21.031 [data-keyboard="open"] is display: none at ≤64rem (amended 2026-10-02)', () => {
    expect(valueOf(ruleExactly(css, '.gn-bottom-bar[data-keyboard="open"]', PHONE), 'display')).toBe('none');
    // CONTROL — the bar itself is displayed (flex) in the arm, so the `none` above is a state, not the default.
    expect(valueOf(ruleExactly(css, '.gn-bottom-bar', PHONE), 'display')).toBe('flex');
  });
});
