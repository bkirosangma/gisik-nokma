import { describe, expect, it } from 'vitest';
import { spacing } from '../src/tokens.js';
import { readUiCss, ruleExactly, valueOf } from './helpers/css-rules.js';

/**
 * Optimistic board moves (owner, 2026-10-01) — case 20.134: a moved card glides to its landing slot on the
 * repo's motion tokens, and not at all under reduced motion; a card waiting on its dialog is washed, not
 * faded by `opacity` on an ancestor of the dialog. jsdom paints nothing, so this reads the stylesheet;
 * how the flight LOOKS in hig/minimal/neo is 20.144 (🧪).
 */
const CSS = readUiCss();
const REDUCE = '@media (prefers-reduced-motion: reduce)';

describe('20.134 the flight rides the move token and switches off under reduced motion', () => {
  it('20.134 the flight animates transform from the flip offset, on the move token and ease-out', () => {
    const flight = ruleExactly(CSS, '.gn-board__card-slot--flight');
    const animation = valueOf(flight, 'animation') ?? '';
    expect(animation).toContain('gnCardFlight');
    expect(animation).toContain('var(--gn-motion-move)');
    expect(animation).toContain('var(--gn-motion-ease-out)');
    const keyframes = CSS.match(/@keyframes gnCardFlight\s*\{[^}]*\{[^}]*\}\s*\}/)?.[0] ?? '';
    expect(keyframes).toContain('var(--gn-flip-x');
    expect(keyframes).toContain('var(--gn-flip-y');
    expect(keyframes).toContain('transform');
    // Only transform moves: a flight that animated top/left/height would reflow the column.
    expect(keyframes).not.toMatch(/\b(top|left|height|width|margin)\b/);
  });

  it('20.134 CONTROL: the reduce arm is what sets animation none — the base rule does not', () => {
    expect(valueOf(ruleExactly(CSS, '.gn-board__card-slot--flight', REDUCE), 'animation')).toBe('none');
    expect(valueOf(ruleExactly(CSS, '.gn-board__card-slot--flight'), 'animation')).not.toBe('none');
  });

  it('20.134 the waiting card is washed by a pseudo-element; the slot itself keeps full opacity', () => {
    const wash = ruleExactly(CSS, '.gn-board__card-slot--waiting::after');
    expect(valueOf(wash, 'pointer-events')).toBe('none');
    expect(valueOf(wash, 'position')).toBe('absolute');
    expect(valueOf(wash, 'opacity')).not.toBeNull();
    // The dialog lives inside the slot: an `opacity` on the slot would fade it too.
    expect(CSS).not.toMatch(/\.gn-board__card-slot--waiting\s*\{[^}]*opacity/);
  });

  it('20.151 the wash is really there: a visible opacity, a ground, over the whole card, and it never takes a pointer event', () => {
    // Mutation `fade wash removed`: `opacity: 0.6` -> `opacity: 0` in `.gn-board__card-slot--waiting::after`.
    const wash = ruleExactly(CSS, '.gn-board__card-slot--waiting::after');
    const opacity = Number(valueOf(wash, 'opacity'));
    expect(opacity).toBeGreaterThan(0);
    expect(opacity).toBeLessThan(1); // a wash that is fully opaque would hide the card it is meant to fade
    // CONTROL — the same probe on a rule with no wash says "absent": the flight rule sets no opacity, so it reads as 0
    expect(Number(valueOf(ruleExactly(CSS, '.gn-board__card-slot--flight'), 'opacity') ?? 0)).toBe(0);
    expect(valueOf(wash, 'background')).toContain('var(--gn-');
    expect(valueOf(wash, 'inset')).toBe('0');
    expect(valueOf(wash, 'content')).toBe('""');
    expect(valueOf(wash, 'pointer-events')).toBe('none');
  });

  it('20.160 the landing slot stops with breathing room: scroll-margin of a spacing token on every side, so `nearest` never rests flush against the window or the rail', () => {
    // Mutations: `scroll-margin: 0`; the declaration dropped.
    const slot = ruleExactly(CSS, '.gn-board__card-slot');
    const margin = valueOf(slot, 'scroll-margin');
    expect(margin).toBe('var(--gn-space-2)');
    expect(spacing[2]).toBe('1rem'); // the token is the 16px step
    // CONTROL — the probe reads the right rule (its other declarations are there) and a rule without the margin reads null.
    expect(valueOf(slot, 'position')).toBe('relative');
    expect(valueOf(ruleExactly(CSS, '.gn-board__card-slot--flight'), 'scroll-margin')).toBeNull();
  });
});
