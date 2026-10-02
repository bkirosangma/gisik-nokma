import { describe, expect, it } from 'vitest';
import { parseRules, ruleExactly, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { cssOf } from '../../../packages/ui/test/helpers/style-patterns.js';

/**
 * Smoothness add-on G-4 (owner 2026-10-02): "The switches are not aligned." On /account's Notifications card a
 * label that wrapped to two lines pushed its switch BELOW the label at the left, while one-line rows kept it at
 * the right. The row was the shared `flex-wrap: wrap` base rule (a session row's button may drop under its text);
 * a switch row has no such need: one line of layout, the label wrapping inside its own column, the switch always
 * at the trailing end. Cases 25.360-25.362 (bucket 25, `test-cases/25-smoothness.md`); 25.362 is the browser frame.
 */
const globals = cssOf('globals');
const ui = cssOf('ui');
const ROW = '.gn-account__notification-row';
const BASE = ['.gn-account__session-row', '.gn-account__workspace-row', '.gn-account__passkey-row', ROW];

/** Source position of the rule whose selector list is exactly `selectors` (top level). */
function at(selectors: readonly string[]): number {
  return parseRules(globals).findIndex(
    (r) => r.atRule === null && r.selectors.length === selectors.length && r.selectors.every((s, i) => s === selectors[i]),
  );
}

describe('25.360 a notification row is ONE line of layout: it never wraps its switch under the label', () => {
  it('25.360 the row sets flex-wrap: nowrap AFTER the shared base rule that wraps; it keeps the trailing-edge switch and the centred axis', () => {
    expect(valueOf(ruleExactly(globals, BASE), 'flex-wrap')).toBe('wrap');
    const own = ruleExactly(globals, ROW);
    expect(valueOf(own, 'flex-wrap')).toBe('nowrap');
    expect(valueOf(own, 'justify-content')).toBe('space-between');
    expect(at([ROW])).toBeGreaterThan(at(BASE));
    // CONTROL — only the switch row changed: the session, workspace and passkey rows share the base rule and still wrap,
    // and no rule narrows that to a switch row by any other selector.
    for (const other of BASE.slice(0, 3)) {
      expect(parseRules(globals).filter((r) => r.selectors.includes(other) && valueOf(r.body, 'flex-wrap') === 'nowrap')).toEqual([]);
    }
    expect(valueOf(ruleExactly(globals, BASE), 'align-items')).toBe('center');
  });
});

describe('25.361 the label takes the column and wraps inside it; the switch is flex: none', () => {
  it('25.361 .gn-account__notification-row .gn-switch__label is flex: 1 1 auto (min-width: 0 from the shared label); .gn-switch is flex: none, so a long label never moves or squeezes it', () => {
    const label = ruleExactly(globals, `${ROW} .gn-switch__label`);
    expect(valueOf(label, 'flex')).toBe('1 1 auto');
    expect(valueOf(ruleExactly(ui, '.gn-switch__label'), 'min-width')).toBe('0');
    expect(valueOf(ruleExactly(ui, '.gn-switch'), 'flex')).toBe('none');
    // CONTROL — the shared label rule is NOT given `flex`, so the Settings → Workspace switch (control beside its own label) is unchanged.
    expect(valueOf(ruleExactly(ui, '.gn-switch__label'), 'flex')).toBeNull();
    expect(valueOf(ruleExactly(ui, '.gn-switch-row'), 'justify-content')).toBeNull();
    expect(valueOf(ruleExactly(ui, '.gn-switch-row'), 'flex-wrap')).toBeNull();
  });
});
