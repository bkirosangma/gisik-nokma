import { describe, expect, it } from 'vitest';
import { readUiCss, ruleExactly, valueOf } from './helpers/css-rules.js';

/**
 * Board drag fixes D2 (owner, 2026-09-30; supersedes plan D25) — cases 20.108
 * (the refused look) and 20.124 (the landing slot's motion, and its reduced-motion
 * arm). jsdom paints nothing, so this reads the stylesheet the way
 * `styling-buttons.test.ts` does; how it LOOKS in hig/minimal/neo is 20.123 (🧪).
 */
const CSS = readUiCss();
const REDUCE = '@media (prefers-reduced-motion: reduce)';

describe('20.124 the drop placeholder eases in over at most 200ms, and not at all under reduced motion', () => {
  it('20.124 the slot opens on the move token + ease-out; the reduce arm sets animation none', () => {
    const slot = ruleExactly(CSS, '.gn-board__drop-placeholder');
    const animation = valueOf(slot, 'animation') ?? '';
    expect(animation).toContain('gnDropSlot');
    expect(animation).toContain('var(--gn-motion-move)'); // 200ms — tokens.ts `motion.move`
    expect(animation).toContain('var(--gn-motion-ease-out)');
    // The slot is a recessed hole in the track, the source placeholder's own look, and never hit-tested.
    expect(valueOf(slot, 'border-radius')).toBe('var(--gn-radius-card)');
    expect(valueOf(slot, 'pointer-events')).toBe('none');
    // CONTROL — the arm is what turns it off, and it is the only place `animation: none` is declared for it.
    expect(valueOf(ruleExactly(CSS, '.gn-board__drop-placeholder', REDUCE), 'animation')).toBe('none');
    expect(/@keyframes gnDropSlot\s*\{/.test(CSS)).toBe(true);
  });
});

describe('20.108 the refused column reads as "can’t drop here"', () => {
  it('20.108 not-allowed cursor on the column and its card slots, and a muted look', () => {
    const refused = ruleExactly(CSS, '.gn-board__column--drop-refused');
    expect(valueOf(refused, 'cursor')).toBe('not-allowed');
    expect(valueOf(refused, 'opacity')).not.toBeNull();
    expect(valueOf(ruleExactly(CSS, '.gn-board__column--drop-refused .gn-board__card-slot'), 'cursor')).toBe('not-allowed');
    // CONTROL — the legal target keeps its accent outline; the refused one does not borrow it.
    expect(valueOf(ruleExactly(CSS, '.gn-board__column--drop-target'), 'outline')).toBe('2px solid var(--gn-accent)');
    expect(valueOf(refused, 'outline')).toBeNull();
  });
});
