import { describe, expect, it } from 'vitest';
import { parseRules, readUiCss, ruleExactly, rulesNaming, valueOf } from './helpers/css-rules.js';

/**
 * Styling refresh Plan A, Tasks 5–6 — cases 20.041–20.046 (§20.5) and
 * 20.051–20.059 (§20.6). The owner-approved board (`Main.dc.html:64-122`),
 * translated: columns are recessed tracks, cards are raised, the lift comes
 * toward the user (owner ruling, 2026-09-29) — and, amended the same day after
 * the kanban video, only while DRAGGED (Task 5A): hover and press change the
 * shadow and nothing else.
 */
const CSS = readUiCss();
const REDUCE = '@media (prefers-reduced-motion: reduce)';
const HOVER = '.gn-board__card-slot:hover > .gn-board-card';
const PRESS = '.gn-board__card-slot:active > .gn-board-card';
/** Task 5A's drag clone — the ONE place a board card may transform. */
const DRAG_CLONE = '.gn-board-drag-image > .gn-board-card';

describe('20.041 a board column is a recessed track', () => {
  it('20.041 track ground, track shadow, track radius, 8px padding, 8px between cards', () => {
    const column = ruleExactly(CSS, '.gn-board__column');
    expect(valueOf(column, 'background')).toBe('var(--gn-surface-track)');
    expect(valueOf(column, 'box-shadow')).toBe('var(--gn-shadow-track)');
    expect(valueOf(column, 'border-radius')).toBe('var(--gn-radius-track)');
    expect(valueOf(column, 'padding')).toBe('0.5rem');
    expect(valueOf(column, 'gap')).toBe('0.5rem');
    expect(valueOf(ruleExactly(CSS, '.gn-board__cards'), 'gap')).toBe('0.5rem');
    // CONTROL — nothing on the board paints the 1.14:1 flat fill any more.
    const boardRules = parseRules(CSS).filter((rule) => rule.selectors.some((s) => s.includes('.gn-board')));
    expect(boardRules.length).toBeGreaterThan(20);
    for (const rule of boardRules) {
      expect(rule.body, rule.selectors.join(', ')).not.toMatch(/var\(--gn-surface-sunken\)/);
    }
  });
});

describe('20.042 a board card is raised', () => {
  it('20.042 16px padding, flex column with 8px lines, lift shadow, no radius of its own', () => {
    const card = ruleExactly(CSS, '.gn-board-card');
    expect(valueOf(card, 'padding')).toBe('1rem');
    expect(valueOf(card, 'display')).toBe('flex');
    expect(valueOf(card, 'flex-direction')).toBe('column');
    expect(valueOf(card, 'gap')).toBe('0.5rem');
    expect(valueOf(card, 'box-shadow')).toBe('var(--gn-shadow-lift)');
    // CONTROL — 13.464: the radius is the card token's, never a literal here.
    expect(valueOf(card, 'border-radius')).toBeNull();
  });
});

describe('20.043 hover deepens the shadow and moves nothing', () => {
  it('20.043 near shadow, raised above neighbours, box-shadow-only transition, no transform', () => {
    const hover = ruleExactly(CSS, HOVER);
    expect(valueOf(hover, 'box-shadow')).toBe('var(--gn-shadow-lift-near)');
    expect(valueOf(hover, 'transform')).toBeNull();
    expect(valueOf(ruleExactly(CSS, '.gn-board__card-slot:hover'), 'z-index')).toBe('1');
    expect(valueOf(ruleExactly(CSS, '.gn-board__card-slot'), 'position')).toBe('relative');
    const card = ruleExactly(CSS, '.gn-board-card');
    expect(valueOf(card, 'transition')).toBe('box-shadow var(--gn-motion-lift) var(--gn-motion-ease-out)');
    expect(valueOf(card, 'transform-origin')).toBeNull();
    expect(valueOf(ruleExactly(CSS, '.gn-board__rail'), 'padding-bottom')).toBe('1.5rem');
    // CONTROL — no board card or slot transforms anywhere, except Task 5A's drag clone.
    let scanned = 0;
    for (const rule of parseRules(CSS)) {
      for (const selector of rule.selectors) {
        if (!/\.gn-board-card\b|\.gn-board__card-slot\b/.test(selector)) continue;
        scanned += 1;
        const transform = valueOf(rule.body, 'transform');
        if (transform === null || transform === 'none') continue;
        expect(selector, 'only the drag clone may transform a board card').toBe(DRAG_CLONE);
      }
    }
    // Measured 10 slot/card rules at Task 5 (the plan's `> 10` assumed 11+); Task 5A adds the drag clone.
    expect(scanned).toBeGreaterThanOrEqual(10);
  });
});

describe('20.044 pressing settles the shadow', () => {
  it('20.044 press shadow, feedback time, no transform', () => {
    const press = ruleExactly(CSS, PRESS);
    expect(valueOf(press, 'box-shadow')).toBe('var(--gn-shadow-lift-press)');
    expect(valueOf(press, 'transition-duration')).toBe('var(--gn-motion-feedback)');
    expect(valueOf(press, 'transform')).toBeNull();
    // CONTROL — press is its own role, not the hover shadow again.
    expect(valueOf(press, 'box-shadow')).not.toBe(valueOf(ruleExactly(CSS, HOVER), 'box-shadow'));
  });
});

describe('20.045 no hover motion to reduce', () => {
  it('20.045 the card animates only its shadow, so hover and press have no reduced-motion arm', () => {
    // The positive arm — RED before Step 4, and red again under the mutation.
    expect(valueOf(ruleExactly(CSS, '.gn-board-card'), 'transition')).toBe(
      'box-shadow var(--gn-motion-lift) var(--gn-motion-ease-out)',
    );
    // CONTROL — no reduced-motion rule names the hover or press selectors. (These two
    // arms pass before Step 4 as well, since no such rule exists yet; the arm above is
    // the one that can fail.)
    expect(() => ruleExactly(CSS, [HOVER, PRESS], REDUCE)).toThrow();
    expect(() => ruleExactly(CSS, HOVER, REDUCE)).toThrow();
  });
});

describe('20.046 the column header and the rail sit on the 8pt grid', () => {
  it('20.046 8px padding and gap, third-tier count, action to the far edge, 16px between columns', () => {
    const header = ruleExactly(CSS, '.gn-board__column-header');
    expect(valueOf(header, 'padding')).toBe('0.5rem');
    expect(valueOf(header, 'gap')).toBe('0.5rem');
    expect(valueOf(ruleExactly(CSS, '.gn-board__count'), 'color')).toBe('var(--gn-text-subtle)');
    expect(valueOf(ruleExactly(CSS, '.gn-board__column-header > .gn-board__column-action'), 'margin-left')).toBe('auto');
    expect(valueOf(ruleExactly(CSS, '.gn-board__rail'), 'gap')).toBe('1rem');
    // CONTROL — no more space-between spreading the chip, count and action.
    expect(valueOf(header, 'justify-content')).toBeNull();
    expect(rulesNaming(CSS, '.gn-board__column-header')).toHaveLength(1);
  });
});

describe('20.103 the drag clone is tilted and lifted', () => {
  it('20.103 rotate + scale + lift-drag, padded off-screen wrapper, reduced motion drops the transform', () => {
    const clone = ruleExactly(CSS, DRAG_CLONE);
    expect(valueOf(clone, 'transform')).toBe('rotate(2.5deg) scale(1.03)');
    expect(valueOf(clone, 'box-shadow')).toBe('var(--gn-shadow-lift-drag)');
    const wrapper = ruleExactly(CSS, '.gn-board-drag-image');
    expect(valueOf(wrapper, 'position')).toBe('fixed');
    expect(valueOf(wrapper, 'top')).toBe('-10000px');
    expect(valueOf(wrapper, 'left')).toBe('-10000px');
    expect(valueOf(wrapper, 'padding')).toBe('1.5rem 3rem 5.5rem');
    expect(valueOf(wrapper, 'pointer-events')).toBe('none');
    const reduced = ruleExactly(CSS, DRAG_CLONE, REDUCE);
    expect(valueOf(reduced, 'transform')).toBe('none');
    // CONTROL — reduced motion keeps the shadow: it restates no box-shadow.
    expect(valueOf(reduced, 'box-shadow')).toBeNull();
  });
});

describe('20.104 the placeholder keeps the card box', () => {
  it('20.104 hidden card, recessed outline, no box-changing declaration', () => {
    const slot = ruleExactly(CSS, '.gn-board__card-slot--placeholder');
    expect(valueOf(slot, 'background')).toBe('var(--gn-surface-track)');
    expect(valueOf(slot, 'box-shadow')).toBe('var(--gn-shadow-track)');
    expect(valueOf(slot, 'border-radius')).toBe('var(--gn-radius-card)');
    expect(valueOf(slot, 'outline')).toBe('1px dashed var(--gn-border)');
    expect(valueOf(slot, 'outline-offset')).toBe('-1px');
    expect(valueOf(ruleExactly(CSS, '.gn-board__card-slot--placeholder > .gn-board-card'), 'visibility')).toBe('hidden');
    // CONTROL — nothing that changes the box.
    for (const property of ['height', 'min-height', 'padding', 'margin', 'border']) {
      expect(valueOf(slot, property), property).toBeNull();
    }
  });
});

describe('20.105 the drop target is an outline, inside the edge', () => {
  it('20.105 accent outline, negative offset', () => {
    const target = ruleExactly(CSS, '.gn-board__column--drop-target');
    expect(valueOf(target, 'outline')).toBe('2px solid var(--gn-accent)');
    expect(valueOf(target, 'outline-offset')).toBe('-2px');
  });
});

describe('20.116 the collapsed column is a labelled 3.5rem strip', () => {
  it('20.116 strip width, full-size ghost button, vertical name, ghost collapse icon', () => {
    const collapsed = ruleExactly(CSS, '.gn-board__column--collapsed');
    expect(valueOf(collapsed, 'flex')).toBe('0 0 3.5rem');
    expect(valueOf(collapsed, 'min-width')).toBe('3.5rem');
    expect(valueOf(collapsed, 'align-self')).toBe('stretch');
    expect(valueOf(collapsed, 'min-height')).toBe('12rem');
    const strip = ruleExactly(CSS, '.gn-board__column-strip');
    expect(valueOf(strip, 'width')).toBe('100%');
    expect(valueOf(strip, 'min-height')).toBe('2.75rem');
    expect(valueOf(strip, 'background')).toBe('transparent');
    expect(valueOf(ruleExactly(CSS, ['.gn-board__column-strip:hover', '.gn-board__column-strip:focus-visible']), 'background')).toBe(
      'var(--gn-fill-tertiary)',
    );
    const name = ruleExactly(CSS, '.gn-board__column-strip-name');
    expect(valueOf(name, 'writing-mode')).toBe('vertical-rl');
    expect(valueOf(name, 'color')).toBe('var(--gn-text-muted)');
    const toggle = ruleExactly(CSS, '.gn-board__column-collapse');
    expect(valueOf(toggle, 'min-width')).toBe('2.75rem');
    expect(valueOf(toggle, 'min-height')).toBe('2.75rem');
    expect(valueOf(toggle, 'border')).toBe('none');
    expect(valueOf(toggle, 'margin-left')).toBe('auto');
    expect(valueOf(ruleExactly(CSS, '.gn-board__column-action + .gn-board__column-collapse'), 'margin-left')).toBe('0');
    // CONTROL — an expanded column is still the 18rem lane.
    expect(valueOf(ruleExactly(CSS, '.gn-board__column'), 'flex')).toBe('0 0 18rem');
  });
});
