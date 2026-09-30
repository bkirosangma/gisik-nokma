import { describe, expect, it } from 'vitest';
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
});
