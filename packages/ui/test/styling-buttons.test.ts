import { describe, expect, it } from 'vitest';
import { parseRules, readUiCss, ruleExactly, valueOf } from './helpers/css-rules.js';

/**
 * Styling refresh Plan A, Task 3 — cases 20.021–20.026 (§20.3). The owner's
 * button rules 01–06, the approved primary (`Buttons.dc.html:13-19`, `:52`)
 * and the quiet outlined control (`Main.dc.html:54`).
 */
const CSS = readUiCss();
const REDUCE = '@media (prefers-reduced-motion: reduce)';
const LIFT_SELECTORS = [
  '.gn-button--primary:hover:not(:disabled)',
  '.gn-button--primary:active:not(:disabled)',
  '.gn-button--danger:hover:not(:disabled)',
  '.gn-button--danger:active:not(:disabled)',
] as const;

describe('20.021 the primary Button — size, label, edge, radius', () => {
  it('20.021 48px, 24px sides, 17px semibold, pill, 10px icon gap, accent fill with its edge', () => {
    const primary = ruleExactly(CSS, '.gn-button--primary');
    const base = ruleExactly(CSS, '.gn-button');
    expect(valueOf(primary, 'min-height')).toBe('3rem');
    expect(valueOf(primary, 'padding')).toBe('0 1.5rem');
    expect(valueOf(primary, 'font-size')).toBe('1.0625rem');
    expect(valueOf(primary, 'border')).toBe('1px solid var(--gn-accent-edge)');
    expect(valueOf(primary, 'background')).toBe('var(--gn-accent)');
    expect(valueOf(primary, 'color')).toBe('var(--gn-accent-text)');
    // Amended 2026-10-02 (neo refresh T2, 24.020): `action` -> `action-filled`; hig maps the role to `action`, so it renders as before.
    expect(valueOf(primary, 'box-shadow')).toBe('var(--gn-shadow-action-filled)');
    expect(valueOf(base, 'font-weight')).toBe('600');
    expect(valueOf(base, 'border-radius')).toBe('999px');
    expect(valueOf(base, 'gap')).toBe('0.625rem');
    // CONTROL — the quiet controls keep the 44px floor.
    expect(valueOf(base, 'min-height')).toBe('2.75rem');
  });
});

describe('20.022 the primary Button lifts toward the user', () => {
  it('20.022 hover 1.04 + near, press 0.98 + press in 100ms, from 50% 60%', () => {
    const hover = ruleExactly(CSS, '.gn-button--primary:hover:not(:disabled)');
    const press = ruleExactly(CSS, '.gn-button--primary:active:not(:disabled)');
    expect(valueOf(hover, 'transform')).toBe('scale(1.04)');
    // Amended 2026-10-02 (neo refresh T2, 24.020): `action-near` -> `action-filled-near`, `action-press` -> `action-filled-press` below.
    expect(valueOf(hover, 'box-shadow')).toBe('var(--gn-shadow-action-filled-near)');
    expect(valueOf(hover, 'background')).toBe('var(--gn-accent-edge)');
    expect(valueOf(press, 'transform')).toBe('scale(0.98)');
    expect(valueOf(press, 'box-shadow')).toBe('var(--gn-shadow-action-filled-press)');
    expect(valueOf(press, 'transition-duration')).toBe('var(--gn-motion-feedback)');
    expect(valueOf(ruleExactly(CSS, '.gn-button'), 'transform-origin')).toBe('50% 60%');
    // CONTROL — at rest, no transform.
    expect(valueOf(ruleExactly(CSS, '.gn-button--primary'), 'transform')).toBeNull();
  });
});

describe('20.023 reduced motion turns the lift off', () => {
  it('20.023 no transition, and the four lift selectors cancel their transform with the same specificity', () => {
    expect(valueOf(ruleExactly(CSS, '.gn-button', REDUCE), 'transition')).toBe('none');
    expect(valueOf(ruleExactly(CSS, LIFT_SELECTORS, REDUCE), 'transform')).toBe('none');
    // CONTROL — outside the arm the transition is real and names the motion tokens.
    const transition = valueOf(ruleExactly(CSS, '.gn-button'), 'transition') ?? '';
    expect(transition).toContain('var(--gn-motion-feedback)');
    expect(transition).toContain('var(--gn-motion-move) var(--gn-motion-ease-out)');
  });
});

describe('20.024 the ghost Button is quiet and outlined with the accessible edge', () => {
  it('20.024 transparent, 1px border role, text2 label, soft hover fill', () => {
    const ghost = ruleExactly(CSS, '.gn-button--ghost');
    expect(valueOf(ghost, 'background')).toBe('transparent');
    expect(valueOf(ghost, 'border')).toBe('1px solid var(--gn-border)');
    expect(valueOf(ghost, 'color')).toBe('var(--gn-text-muted)');
    expect(valueOf(ghost, 'font-weight')).toBe('600');
    expect(valueOf(ruleExactly(CSS, '.gn-button--ghost:hover:not(:disabled)'), 'background')).toBe(
      'var(--gn-fill-quaternary)',
    );
    // CONTROL — the base paints no border.
    expect(valueOf(ruleExactly(CSS, '.gn-button'), 'border')).toBe('none');
  });
});

describe('20.025 the danger Button matches the primary geometry on neutral depth', () => {
  it('20.025 same size and lift, the danger roles (neutral lift in hig) not the action shadows', () => {
    const danger = ruleExactly(CSS, '.gn-button--danger');
    const primary = ruleExactly(CSS, '.gn-button--primary');
    for (const property of ['min-height', 'padding', 'font-size']) {
      expect(valueOf(danger, property), property).toBe(valueOf(primary, property));
    }
    // Amended 2026-10-02 (neo refresh T2, 24.021): `lift` -> `danger`; hig maps the role to `lift`, so it renders as before.
    expect(valueOf(danger, 'box-shadow')).toBe('var(--gn-shadow-danger)');
    expect(valueOf(ruleExactly(CSS, '.gn-button--danger:hover:not(:disabled)'), 'transform')).toBe('scale(1.04)');
    expect(valueOf(ruleExactly(CSS, '.gn-button--danger:active:not(:disabled)'), 'transform')).toBe('scale(0.98)');
    // CONTROL — not the accent-tinted action shadow.
    expect(valueOf(danger, 'box-shadow')).not.toBe(valueOf(primary, 'box-shadow'));
  });
});

describe('20.026 motion discipline', () => {
  it('20.026 no will-change anywhere; Button transitions name the motion tokens', () => {
    const rules = parseRules(CSS);
    // CONTROL — the scan is reading a stylesheet that has transitions at all.
    expect(rules.filter((rule) => valueOf(rule.body, 'transition') !== null).length).toBeGreaterThan(5);
    for (const rule of rules) {
      expect(valueOf(rule.body, 'will-change'), rule.selectors.join(', ')).toBeNull();
    }
    const transition = valueOf(ruleExactly(CSS, '.gn-button'), 'transition') ?? '';
    // The plan's version held only the `not.toMatch` below, which a rule with NO transition
    // satisfies (null → ''), so 20.026 passed before it was implemented; the two lines
    // above make the transition required as well as token-only.
    expect(transition).toContain('var(--gn-motion-ease-out)');
    expect(transition).not.toMatch(/\d+m?s/);
  });
});
