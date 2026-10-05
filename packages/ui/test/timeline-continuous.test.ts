import { describe, expect, it } from 'vitest';
import { contrastRatio } from './helpers/contrast.js';
import { parseRules, ruleExactly, rulesNaming, valueOf } from './helpers/css-rules.js';
import { cssOf } from './helpers/style-patterns.js';
import { CONTRAST_PAIRS, TOKEN_ROLES, colorOf, cssVariableName, themeStylesheet } from '../src/tokens.js';

/** Workflow and Timeline graphs, Part 1 — T9: 29.104 (the weekend role) and 29.106 (the stylesheet contract); T11: 29.109 (portrait and the pill). */
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
    // The view MEASURES its height (TV-11, `useFillHeight`), so a flex parent of fixed height must not shrink it back: in the T10
    // harness (an 80vh flex-column host, 29.040) the shrinkable panel ended 144 px above the window instead of 16.
    expect(valueOf(ruleExactly(ui, '.gn-timeline'), 'flex-shrink')).toBe('0');
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

describe('29.109 portrait runs time down a sticky gutter, and the Nothing-in-view pill floats over the stage', () => {
  const ui = cssOf('ui');
  const portrait = (selector: string): string => `.gn-timeline[data-orientation='portrait']${selector === '' ? '' : ` ${selector}`}`;

  it('29.109 a lane is a 112 px column group placed by --lane-offset, the day labels ride an 80 px sticky gutter, a bar is 100 px wide inside its 112 px column (ERRATA E9) and as tall as its days, its title wraps in at most 3 lines (TG-7), and a re-pack glides only left, so reduced motion still stops it; control: the landscape bar is unchanged', () => {
    expect(valueOf(ruleExactly(ui, portrait('')), '--tl-gutter')).toBe('80px');
    const lane = ruleExactly(ui, portrait('.gn-timeline__lane'));
    expect(valueOf(lane, 'left')).toBe('calc(var(--tl-gutter) + var(--lane-offset))');
    expect(valueOf(lane, 'width')).toBe('var(--lane-extent)');
    const bar = ruleExactly(ui, portrait('.gn-timeline__bar'));
    expect(valueOf(bar, 'left')).toBe('calc(var(--row) * 112px + 6px)');
    expect(valueOf(bar, 'width')).toBe('100px');
    expect(valueOf(bar, 'top')).toBe('calc(var(--tl-axis-height) + var(--d0) * var(--tl-ppd) * 1px)');
    expect(valueOf(bar, 'height')).toBe('max(6px, calc(var(--dn) * var(--tl-ppd) * 1px - 2px))');
    // A re-pack moves a portrait bar sideways, and a zoom frame moves its top: only `left` glides. A `transition` SHORTHAND here would
    // outrank the reduced-motion `transition: none` on `.gn-timeline__bar` (this selector is more specific than that one), so the
    // portrait arm names the PROPERTY alone and keeps the base rule's duration, which reduced motion zeroes.
    expect(valueOf(bar, 'transition-property')).toBe('left');
    expect(valueOf(bar, 'transition')).toBeNull();
    expect(valueOf(ruleExactly(ui, ['.gn-timeline__bar', '.gn-timeline__key--outside'], '@media (prefers-reduced-motion: reduce)'), 'transition')).toBe('none');
    // TG-7 (ERRATA E9): the title wraps inside the 100 px bar, ellipsis after the third line.
    const title = ruleExactly(ui, portrait('.gn-timeline__bar .gn-timeline__title-text'));
    expect(valueOf(title, '-webkit-line-clamp')).toBe('3');
    expect(valueOf(title, 'display')).toBe('-webkit-box');
    const axis = ruleExactly(ui, portrait('.gn-timeline__axis'));
    expect(valueOf(axis, 'position')).toBe('sticky');
    expect(valueOf(axis, 'width')).toBe('var(--tl-gutter)');
    expect(valueOf(ruleExactly(ui, portrait('.gn-timeline__today')), 'border-top')).toBe('2px solid var(--gn-accent)');
    // The key outside a short bar has no room in a 100 px column; its words are in the bar's title.
    expect(valueOf(ruleExactly(ui, portrait('.gn-timeline__key--outside')), 'display')).toBe('none');
    // CONTROL, same it: the landscape bar is still placed by --d0 from the left, and portrait is NOT a media query.
    expect(valueOf(ruleExactly(ui, '.gn-timeline__bar'), 'left')).toBe('calc(var(--d0) * var(--tl-ppd) * 1px)');
    const portraitRules = parseRules(ui).filter((r) => r.selectors.some((s) => s.includes("[data-orientation='portrait']")));
    expect(portraitRules.length).toBeGreaterThanOrEqual(10);
    expect(portraitRules.filter((r) => r.atRule !== null).map((r) => `${r.atRule} ${r.selectors.join(', ')}`)).toEqual([]);
  });

  it('29.109 the pill is a rounded status chip over the bottom of the stage, never inside the scroller; the disabled jump is dimmed and not clickable', () => {
    const pill = ruleExactly(ui, '.gn-timeline__nothing');
    expect(valueOf(pill, 'position')).toBe('absolute');
    expect(valueOf(pill, 'bottom')).toBe('1rem');
    expect(valueOf(pill, 'border-radius')).toBe('999px');
    expect(valueOf(pill, 'z-index')).toBe('4');
    expect(valueOf(pill, 'background')).toBe('var(--gn-surface-raised)');
    // Placed by `left: 50%`, an absolute box shrinks to the room RIGHT of that edge (half the stage: 195 px on a 390 px phone, where
    // the sentence and both jumps stacked into three rows). It sizes to its content instead, capped 1rem inside each side.
    expect(valueOf(pill, 'width')).toBe('max-content');
    expect(valueOf(pill, 'max-width')).toBe('calc(100% - 2rem)');
    expect(valueOf(pill, 'box-sizing')).toBe('border-box');
    expect(valueOf(ruleExactly(ui, '.gn-timeline__stage'), 'position')).toBe('relative');
    const disabled = ruleExactly(ui, '.gn-timeline__nothing .gn-timeline__nav:disabled');
    expect(valueOf(disabled, 'cursor')).toBe('default');
    // The ONE disabled token (23.094 polices every :disabled opacity in the sheets), never a literal of its own.
    expect(valueOf(disabled, 'opacity')).toBe('var(--gn-disabled-opacity)');
    // GUARD (T9's canvas, not a control of this task's rules): the canvas is itself a positioning parent that scrolls, so a pill inside
    // it would be carried away; the pill's place OUTSIDE it is pinned in the DOM by 29.108 (`pill.closest('.gn-timeline__canvas')`).
    expect(valueOf(ruleExactly(ui, '.gn-timeline__canvas'), 'position')).toBe('relative');
    expect(ruleExactly(ui, '.gn-timeline__stage')).not.toContain('overflow');
  });
});
