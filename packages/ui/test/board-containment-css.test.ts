import { describe, expect, it } from 'vitest';
import { parseRules, readUiCss, ruleExactly, valueOf } from './helpers/css-rules.js';

/**
 * Smoothness T12 (audit SM-10) — case 25.202. The plan asked for `contain: content` on the card list and `content-visibility:
 * auto` on each slot. Neither ships, and this case is what keeps them from arriving later by accident:
 *
 *  - Layout, paint and `content-visibility: auto` (which implies both while the element is on screen) make the element the
 *    containing block for `position: fixed` descendants. `Dialog` (`packages/ui`) does not portal, and `MoveArrows` renders its
 *    transition dialog INSIDE the card, so its scrim would be confined to the list instead of the viewport — the very premise
 *    the hover rule's docblock records ("a box-shadow and a z-index create no containing block").
 *  - Paint containment clips to the padding box, so a neo card's resting and hover shadows (`--gn-shadow-reach`, 20 px; G-2)
 *    would be cut off at the slot's edge on every side.
 *
 * What T12 does instead is in JS (a memoised slot, 25.201) and in the page (a deferred narrowing, 25.203).
 */

const CONTAINERS = [
  '.gn-board',
  '.gn-board__rail',
  '.gn-board__group',
  '.gn-board__column',
  '.gn-board__cards',
  '.gn-board__card-slot',
  '.gn-board-card',
];

const strip = (body: string): string => body.replace(/\/\*[\s\S]*?\*\//g, '');

/** The rules that style a board container or card itself (not a modifier, a child, or a pseudo-element of it). */
function boardContainerRules(css: string) {
  return parseRules(css).filter((rule) => rule.selectors.some((selector) => CONTAINERS.includes(selector.replace(/:(hover|focus-within|active)$/, ''))));
}

/** The declarations that would re-parent a fixed dialog or clip a shadow. */
function containing(body: string): string[] {
  const text = strip(body);
  return [valueOf(text, 'contain'), valueOf(text, 'content-visibility')].filter((value): value is string => value !== null);
}

describe('25.202 no board container establishes containment', () => {
  it('25.202 none of the board containers or the slot declares contain or content-visibility; the scan sees them and a planted one is caught', () => {
    const css = readUiCss();
    const rules = boardContainerRules(css);
    // CONTROL 1 — the scan reaches the rules it is about (it is not looking at an empty set) …
    expect(valueOf(strip(ruleExactly(css, '.gn-board__cards')), 'list-style')).toBe('none');
    expect(valueOf(strip(ruleExactly(css, '.gn-board__card-slot')), 'position')).toBe('relative');
    expect(rules.length).toBeGreaterThanOrEqual(7);
    // CONTROL 2 — … and the detector catches the plan's own declarations when they are planted.
    expect(containing('.x { contain: content; content-visibility: auto; }'.replace(/^[^{]*\{|\}$/g, ''))).toEqual(['content', 'auto']);

    const offenders = rules.flatMap((rule) => containing(rule.body).map((value) => `${rule.selectors.join(', ')}: ${value}`));
    expect(offenders).toEqual([]);
  });
});
