import { describe, expect, it } from 'vitest';
import { contrastRatio } from './helpers/contrast.js';
import { parseRules, ruleExactly, rulesNaming, valueOf } from './helpers/css-rules.js';
import { cssOf } from './helpers/style-patterns.js';
import { CONTRAST_PAIRS, TOKEN_ROLES, colorOf, cssVariableName, themeStylesheet } from '../src/tokens.js';

/** Workflow and Timeline graphs, Part 1, T9 — cases 29.104 (the weekend role) and 29.106 (the stylesheet contract). */
const STYLES = ['hig', 'minimal', 'neo'] as const;
const THEMES = ['light', 'dark'] as const;

describe('29.104 the weekend tint is one opaque role whose day numbers clear 4.5:1 in every style and theme', () => {
  it('29.104 the role is declared, opaque and exported; textMuted on it is a declared pair at 4.5; control: a translucent tint would fail the opaque check', () => {
    expect(TOKEN_ROLES as readonly string[]).toContain('timelineWeekend');
    expect(cssVariableName('timelineWeekend')).toBe('--gn-timeline-weekend');
    const sheet = themeStylesheet();
    expect(sheet).toContain('--gn-timeline-weekend:');
    for (const style of STYLES) {
      for (const theme of THEMES) {
        const tint = colorOf(theme, 'timelineWeekend', style);
        // Opaque: the day numbers are measured on THIS colour, not on whatever it composites over.
        expect(tint, `${style}/${theme}`).toMatch(/^#[0-9a-f]{6}$/);
        const ratio = contrastRatio(colorOf(theme, 'textMuted', style), tint);
        expect(ratio, `${style}/${theme}: textMuted on the weekend tint`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // The pair is DECLARED, so tokens.test.ts's every-pair loop guards it in all six combinations.
    expect(CONTRAST_PAIRS.some((p) => p.fg === 'textMuted' && p.bg === 'timelineWeekend' && p.minimum === 4.5)).toBe(true);
    // CONTROL: the opaque pattern rejects an 8-digit (translucent) hex, so the assertion above can fail.
    expect('#e8ded480').not.toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe('29.106 the Timeline stylesheet is the continuous canvas: one scroller, packed 28 px bars, no paging', () => {
  const ui = cssOf('ui');
  const names = (selector: string): number => rulesNaming(ui, selector).length;

  it('29.106 the canvas scrolls and contains its overscroll; the bar is 28 px on a 40 px pitch; the axis is sticky; rows are transparent to layout', () => {
    const canvas = ruleExactly(ui, '.gn-timeline__canvas');
    expect(valueOf(canvas, 'overflow')).toBe('auto');
    expect(valueOf(canvas, 'overscroll-behavior')).toBe('contain');
    const bar = ruleExactly(ui, '.gn-timeline__bar');
    expect(valueOf(bar, 'height')).toBe('28px');
    expect(valueOf(bar, 'top')).toBe('calc(34px + var(--row) * 40px + 6px)');
    expect(valueOf(bar, 'container-type')).toBe('inline-size');
    expect(valueOf(ruleExactly(ui, '.gn-timeline__axis'), 'position')).toBe('sticky');
    expect(valueOf(ruleExactly(ui, '.gn-timeline__row'), 'display')).toBe('contents');
    // A long bar (150 px or more) shows its title: the container query that turns the title on.
    const long = ruleExactly(ui, '.gn-timeline__bar .gn-timeline__title-text', '@container (min-width: 150px)');
    expect(valueOf(long, 'display')).toBe('block');
    // The minimum height (TG-13) and the weekend tile (seven days of the packing scale).
    expect(valueOf(ruleExactly(ui, '.gn-timeline'), 'min-height')).toBe('20rem');
    expect(valueOf(ruleExactly(ui, ['.gn-timeline__surface', '.gn-timeline__axis']), 'background-size')).toBe('calc(var(--tl-ppd) * 7px) 100%');
    // The surface fills the canvas even when the lanes are short, so the weekend tint and the today line run to the bottom of
    // the chart rather than stopping under the last row (measured in the T1 harness at 60 bars: they stopped 550 px short).
    expect(valueOf(ruleExactly(ui, '.gn-timeline__surface'), 'min-height')).toBe('100%');
  });

  it('29.106 nothing of the paged grid survives: no weeks band, no header grid, no zebra, no clipped edges, no phone arm for the timeline', () => {
    for (const retired of ['.gn-timeline__weeks', '.gn-timeline__header', '.gn-timeline__corner', '.gn-timeline__week', '.gn-timeline__row:nth-of-type(odd)']) {
      expect(names(retired), retired).toBe(0);
    }
    expect(ui).not.toContain('timeline-week-columns');
    expect(ui).not.toContain('data-clipped');
    // The phone is a portrait ORIENTATION chosen by the view (PK-7), not a media-query arm of the same grid.
    const phoneArms = parseRules(ui).filter((r) => r.atRule !== null && r.atRule.includes('max-width') && r.selectors.some((s) => s.includes('.gn-timeline')));
    expect(phoneArms.map((r) => r.selectors.join(', '))).toEqual([]);
    // CONTROL: the same filter does find a view's phone arm where one exists (the calendar keeps its own), so the empty list
    // above is the stylesheet's answer and not a filter that can match nothing.
    expect(parseRules(ui).some((r) => r.atRule !== null && r.atRule.includes('max-width') && r.selectors.some((s) => s.includes('.gn-calendar')))).toBe(true);
    // CONTROL: the scan can see a timeline rule at all.
    expect(names('.gn-timeline__bar')).toBeGreaterThan(0);
  });

  it('29.106 the Today pill keeps the quiet nav treatment; reduced motion stops the re-pack glide', () => {
    const nav = ruleExactly(ui, '.gn-timeline__nav');
    expect(valueOf(nav, 'border')).toBe('1px solid var(--gn-border)');
    expect(valueOf(nav, 'min-height')).toBe('2.75rem');
    const calm = ruleExactly(ui, ['.gn-timeline__bar', '.gn-timeline__key--outside'], '@media (prefers-reduced-motion: reduce)');
    expect(valueOf(calm, 'transition')).toBe('none');
  });
});
