import { describe, expect, it } from 'vitest';
import { parseRules, readUiCss, ruleExactly, valueOf } from './helpers/css-rules.js';

/**
 * Knowledge Graph spec D §6 (KG-D Task 9, case 27.544's stylesheet leg): the `/* D: concepts row *\/` block, the Concepts
 * row's pills on a ticket's and a note's Details. jsdom has no layout, so what "never wider than the row" and "a 24px
 * target" rest on is read from the rules themselves: the pill is capped at its row and its name wraps, and the remove
 * control is a circle at least 24px wide (WCAG 2.5.8) that fits inside the pill. The paint sweep (360 / 390 / 768 /
 * 1280) is the lane's HANDOFF's, not this file's.
 */
const CSS = readUiCss();
const START = '/* D: concepts row */';
const rem = (value: string | null): number => {
  const m = /^([\d.]+)rem$/.exec(value ?? '');
  if (m === null) throw new Error(`not a rem length: ${String(value)}`);
  return Number(m[1]);
};

describe('27.544 the Concepts row block', () => {
  it('27.544 sits once in the ticket sheet\'s Notes region, outside the Knowledge Graph region, and holds every concepts-row rule', () => {
    const at = CSS.indexOf(START);
    expect(at).toBeGreaterThan(0);
    expect(CSS.indexOf(START, at + 1)).toBe(-1);
    expect(at).toBeGreaterThan(CSS.indexOf('.gn-ticket-sheet__note-badges {'));
    expect(at).toBeLessThan(CSS.indexOf('/* KG: T7 view+bar */'));
    // every rule naming the row's classes is in the block (the block runs to the next top-level comment)
    const end = CSS.indexOf('/*', CSS.indexOf('*/', CSS.indexOf('*/', at) + 2) + 2);
    const block = CSS.slice(at, end);
    const named = (css: string) => parseRules(css).flatMap((r) => r.selectors).filter((s) => /gn-concepts?-(row|pill)/.test(s));
    expect(named(block).length).toBeGreaterThanOrEqual(7); // precondition: the block's own rules are read
    expect(named(CSS.slice(0, at) + CSS.slice(end))).toEqual([]);
  });

  it('27.544 a pill is never wider than its row and a long name wraps inside it, in the concept fill', () => {
    expect(valueOf(ruleExactly(CSS, '.gn-concepts-row'), 'min-width')).toBe('0');
    const pills = ruleExactly(CSS, '.gn-concepts-row__pills');
    expect(valueOf(pills, 'flex-wrap')).toBe('wrap');
    expect(valueOf(pills, 'min-width')).toBe('0');
    const pill = ruleExactly(CSS, '.gn-concept-pill');
    expect(valueOf(pill, 'max-width')).toBe('100%');
    expect(valueOf(pill, 'background')).toBe('var(--gn-concept-fill)');
    expect(valueOf(pill, 'color')).toBe('var(--gn-text)');
    // a full pill: the radius is at least half its height
    expect(Number.parseFloat(valueOf(pill, 'border-radius') ?? '')).toBeGreaterThanOrEqual((rem(valueOf(pill, 'min-height')) * 16) / 2);
    const name = ruleExactly(CSS, '.gn-concept-pill__name');
    expect(valueOf(name, 'overflow-wrap')).toBe('anywhere');
    expect(valueOf(name, 'min-width')).toBe('0');
  });

  it('27.544 the remove control is a circle at least 24px wide that fits inside the pill, with a visible keyboard focus', () => {
    const remove = ruleExactly(CSS, '.gn-concept-pill__remove');
    const pill = ruleExactly(CSS, '.gn-concept-pill');
    const [w, h] = [rem(valueOf(remove, 'width')), rem(valueOf(remove, 'height'))];
    expect(w).toBe(h);
    expect(w * 16).toBeGreaterThanOrEqual(24);
    expect(h).toBeLessThanOrEqual(rem(valueOf(pill, 'min-height')));
    expect(Number.parseFloat(valueOf(remove, 'border-radius') ?? '')).toBeGreaterThanOrEqual(50);
    expect(valueOf(remove, 'border-radius')).toMatch(/%$/);
    const focus = ruleExactly(CSS, ['.gn-concept-pill__name:focus-visible', '.gn-concept-pill__remove:focus-visible']);
    expect(valueOf(focus, 'outline')).toBe('2px solid var(--gn-focus-ring)');
  });
});
