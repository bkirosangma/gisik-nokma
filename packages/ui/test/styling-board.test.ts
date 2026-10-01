import { describe, expect, it } from 'vitest';
import { CONTRAST_PAIRS, colorOf, type StyleName, type ThemeName } from '../src/tokens.js';
import { contrastRatio, over } from './helpers/contrast.js';
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

const STYLES: StyleName[] = ['hig', 'minimal', 'neo'];
const THEMES: ThemeName[] = ['light', 'dark'];
const rem = (value: string | null): number => Number.parseFloat(value ?? 'NaN');

describe('20.053 the title is the one loud element', () => {
  it('20.053 15/24 at 500 in text; everything else on the card is at most 13px', () => {
    const title = ruleExactly(CSS, '.gn-board-card__title');
    expect(valueOf(title, 'font-size')).toBe('0.9375rem');
    expect(valueOf(title, 'line-height')).toBe('1.5rem');
    expect(valueOf(title, 'font-weight')).toBe('500');
    expect(valueOf(title, 'color')).toBe('var(--gn-text)');
    const others = [
      '.gn-board-card__epic',
      '.gn-board-card__meta-line',
      '.gn-board-card__progress',
      '.gn-board-card__provenance',
      ['.gn-board-card__close', '.gn-board__column-action'],
    ] as const;
    for (const selector of others) {
      const size = rem(valueOf(ruleExactly(CSS, selector), 'font-size'));
      expect(size, String(selector)).toBeLessThanOrEqual(0.8125);
      // CONTROL — strictly smaller than the title.
      expect(size).toBeLessThan(rem(valueOf(title, 'font-size')));
    }
  });
});

describe('20.054 three groups 16 apart, lines 8 apart, the footer inside the padding', () => {
  it('20.054 margins that add to the 8px gap, the empty people row collapses', () => {
    expect(valueOf(ruleExactly(CSS, '.gn-board-card__meta'), 'margin-top')).toBe('0.5rem');
    expect(valueOf(ruleExactly(CSS, '.gn-board-card__meta:empty'), 'display')).toBe('none');
    expect(valueOf(ruleExactly(CSS, '.gn-board-card__meta:empty + .gn-board-card__meta-line'), 'margin-top')).toBe('0.5rem');
    // The keys row adds nothing of its own otherwise: the card's 8px gap is its only separation.
    expect(valueOf(ruleExactly(CSS, '.gn-board-card__meta-line'), 'margin')).toBe('0');
    const footer = ruleExactly(CSS, '.gn-board-card__footer');
    expect(valueOf(footer, 'margin')).toBe('0.5rem -0.5rem -0.5rem');
    expect(valueOf(footer, 'display')).toBe('flex');
    expect(valueOf(footer, 'flex-wrap')).toBe('wrap');
    // CONTROL — the epic and title are one group: the chip adds no margin.
    expect(valueOf(ruleExactly(CSS, '.gn-board-card__epic'), 'margin')).toBe('0');
  });
});

describe('20.055 the epic chip', () => {
  it('20.055 padding 4/8, radius 8, chip fill, text2 12px, 24px tall', () => {
    const epic = ruleExactly(CSS, '.gn-board-card__epic');
    expect(valueOf(epic, 'padding')).toBe('0.25rem 0.5rem');
    expect(valueOf(epic, 'border-radius')).toBe('0.5rem');
    expect(valueOf(epic, 'background')).toBe('var(--gn-fill-tertiary)');
    expect(valueOf(epic, 'color')).toBe('var(--gn-text-muted)');
    expect(valueOf(epic, 'font-size')).toBe('0.75rem');
    expect(valueOf(epic, 'min-height')).toBe('1.5rem');
    // CONTROL — 13.1467's block-level shape is kept.
    expect(valueOf(epic, 'display')).toBe('flex');
    expect(valueOf(epic, 'width')).toBe('fit-content');
  });
});

describe('20.056 a status chip on a card is plain third-tier text', () => {
  it('20.056 no fill, no inset, 12px textSubtle; the shared chip keeps its fill', () => {
    const chip = ruleExactly(CSS, '.gn-board-card__meta .gn-chip');
    expect(valueOf(chip, 'background')).toBe('transparent');
    expect(valueOf(chip, 'box-shadow')).toBe('none');
    expect(valueOf(chip, 'padding')).toBe('0');
    expect(valueOf(chip, 'font-size')).toBe('0.75rem');
    expect(valueOf(chip, 'color')).toBe('var(--gn-text-subtle)');
    // CONTROL — everywhere else a chip is still a filled pill.
    expect(valueOf(ruleExactly(CSS, '.gn-chip'), 'background')).toBe('var(--gn-fill-tertiary)');
  });

  it('20.056 it WINS: it ties the minimal and neo chip rules at (0,2,0), so it must come after them and restate what they set', () => {
    const rules = parseRules(CSS).filter((rule) => rule.atRule === null);
    const at = (selector: string): number => {
      const index = rules.findIndex((rule) => rule.selectors.length === 1 && rule.selectors[0] === selector);
      expect(index, selector).toBeGreaterThanOrEqual(0);
      return index;
    };
    const card = at('.gn-board-card__meta .gn-chip');
    const cardBody = rules[card]!.body;
    for (const styled of ['[data-style="minimal"] .gn-chip', '[data-style="neo"] .gn-chip']) {
      expect(card, `${styled} is declared after the card's chip rule, so it would win the tie`).toBeGreaterThan(at(styled));
      // Every property the tied rule sets is set again by the card's rule, so nothing of theirs shows through.
      const set = [...rules[at(styled)]!.body.matchAll(/(?:^|;|\s)([a-z-]+)\s*:/g)].map((match) => match[1]!);
      expect(set.length, styled).toBeGreaterThan(0);
      for (const property of set) expect(valueOf(cardBody, property), `${styled} sets ${property}`).not.toBeNull();
    }
  });
});

describe('20.057 priority ink is neutral except Urgent', () => {
  it('20.057 P1 danger, P2 text2, P3 text3 — each ≥ 4.5 on the card ground — and no card tint remains', () => {
    const ink = { p1: 'danger', p2: 'textMuted', p3: 'textSubtle' } as const;
    for (const [level, role] of Object.entries(ink)) {
      const cssVar = `var(--gn-${role.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)})`;
      expect(valueOf(ruleExactly(CSS, `.gn-board-card__priority--${level}`), 'color'), level).toBe(cssVar);
      for (const style of STYLES) {
        for (const theme of THEMES) {
          expect(
            contrastRatio(colorOf(theme, role, style), colorOf(theme, 'surfaceRaised', style)),
            `${level} ${style}/${theme}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
      // No rule of any shape (a pseudo-class, a compound) is keyed on the card's tint modifier.
      const tinted = parseRules(CSS).filter((rule) => rule.selectors.some((s) => s.includes(`.gn-board-card--${level}`)));
      expect(tinted, `card tint for ${level}`).toEqual([]);
    }
    // ...and nothing reads a priority tint or P3 ink variable.
    expect(CSS).not.toMatch(/--gn-priority-p\d/);
    // CONTROL — the badge base rule still exists (the icon inherits currentColor from it).
    expect(valueOf(ruleExactly(CSS, '.gn-board-card__priority'), 'display')).toBe('inline-flex');
  });
});

describe('20.058 the keys row', () => {
  it('20.058 12/16 text3 with 8px gaps; key 500 tabular; parent text2 underlined; late danger 600', () => {
    const line = ruleExactly(CSS, '.gn-board-card__meta-line');
    expect(valueOf(line, 'font-size')).toBe('0.75rem');
    expect(valueOf(line, 'line-height')).toBe('1rem');
    expect(valueOf(line, 'color')).toBe('var(--gn-text-subtle)');
    expect(valueOf(line, 'gap')).toBe('0.5rem');
    const key = ruleExactly(CSS, '.gn-board-card__key');
    expect(valueOf(key, 'font-weight')).toBe('500');
    expect(valueOf(key, 'font-variant-numeric')).toBe('tabular-nums');
    const parent = ruleExactly(CSS, '.gn-board-card__parent-key');
    expect(valueOf(parent, 'color')).toBe('var(--gn-text-muted)');
    expect(valueOf(parent, 'text-decoration')).toBe('underline');
    expect(valueOf(parent, 'border')).toBe('none');
    expect(valueOf(ruleExactly(CSS, '.gn-board-card__parent-sep'), 'margin')).toBe('0 -0.25rem');
    const late = ruleExactly(CSS, '.gn-board-card__due--late');
    expect(valueOf(late, 'color')).toBe('var(--gn-danger)');
    expect(valueOf(late, 'font-weight')).toBe('600');
    // CONTROL — on time is third tier, regular weight.
    expect(valueOf(ruleExactly(CSS, '.gn-board-card__due'), 'color')).toBe('var(--gn-text-subtle)');
    expect(valueOf(ruleExactly(CSS, '.gn-board-card__due'), 'font-weight')).toBeNull();
  });
});

describe('20.059 the footer controls are ghost controls with real targets', () => {
  it('20.059 44px targets, pills, transparent, fill + ink step + ring on hover/focus', () => {
    const provenance = ruleExactly(CSS, '.gn-board-card__provenance');
    expect(valueOf(provenance, 'min-height')).toBe('2.75rem');
    const move = ruleExactly(CSS, '.gn-board-card__move');
    expect(valueOf(move, 'min-height')).toBe('2.75rem');
    expect(valueOf(move, 'min-width')).toBe('2.75rem');
    const close = ruleExactly(CSS, ['.gn-board-card__close', '.gn-board__column-action']);
    expect(valueOf(close, 'min-height')).toBe('2.75rem');
    for (const body of [provenance, move, close]) {
      expect(valueOf(body, 'border')).toBe('none');
      expect(valueOf(body, 'border-radius')).toBe('999px');
      expect(valueOf(body, 'background')).toBe('transparent');
    }
    const lit = ruleExactly(CSS, [
      '.gn-board-card__provenance:hover',
      '.gn-board-card__provenance:focus-visible',
      '.gn-board-card__move:hover:not(:disabled)',
      '.gn-board-card__move:focus-visible',
      '.gn-board-card__close:hover:not(:disabled)',
      '.gn-board-card__close:focus-visible',
      '.gn-board__column-action:hover:not(:disabled)',
      '.gn-board__column-action:focus-visible',
    ]);
    expect(valueOf(lit, 'background')).toBe('var(--gn-fill-tertiary)');
    expect(valueOf(lit, 'color')).toBe('var(--gn-text-muted)');
    const ring = ruleExactly(CSS, [
      '.gn-board-card__provenance:focus-visible',
      '.gn-board-card__move:focus-visible',
      '.gn-board-card__close:focus-visible',
      '.gn-board__column-action:focus-visible',
    ]);
    expect(valueOf(ring, 'outline')).toBe('2px solid var(--gn-focus-ring)');
    for (const style of STYLES) {
      for (const theme of THEMES) {
        const lifted = over(colorOf(theme, 'fillTertiary', style), colorOf(theme, 'surfaceRaised', style));
        expect(contrastRatio(colorOf(theme, 'textMuted', style), lifted), `${style}/${theme}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // CONTROL — why the ink steps up: textSubtle over the same fill fails 4.5 in hig dark.
    const higDark = over(colorOf('dark', 'fillTertiary', 'hig'), colorOf('dark', 'surfaceRaised', 'hig'));
    expect(contrastRatio(colorOf('dark', 'textSubtle', 'hig'), higDark)).toBeLessThan(4.5);
    // The pairs the refresh added are still declared (Task 1 owns their count).
    expect(CONTRAST_PAIRS.length).toBeGreaterThanOrEqual(44);
  });

  it('20.059 no [data-style] rule restyles a footer control, so the fill and the ink read the same tokens in every style', () => {
    const footer = [
      '.gn-board-card__provenance',
      '.gn-board-card__move',
      '.gn-board-card__close',
      '.gn-board__column-action',
    ];
    const styled = parseRules(CSS).filter(
      (rule) =>
        rule.selectors.some((selector) => selector.includes('[data-style')) &&
        rule.selectors.some((selector) => footer.some((name) => selector.includes(name))),
    );
    expect(styled.map((rule) => rule.selectors.join(', '))).toEqual([]);
    // CONTROL — the scan can see style-scoped rules at all: the chip has them.
    expect(
      parseRules(CSS).some((rule) => rule.selectors.some((selector) => selector === '[data-style="neo"] .gn-chip')),
    ).toBe(true);
  });
});
