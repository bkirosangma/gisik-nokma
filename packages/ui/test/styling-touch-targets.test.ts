import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_ROOT } from './helpers/colour-scan.js';
import { parseRules, ruleExactly, valueOf } from './helpers/css-rules.js';
import { cssOf, expectRow } from './helpers/style-patterns.js';

/**
 * Touch-target pass, cases 20.611–20.619 (§20.61). Browser check B (case 20.594) measured seven
 * controls under 44px that no KEPT list names. jsdom lays nothing out, so each case reads the
 * DECLARATIONS that give the control its 44px hit box; the measured hit boxes are case 20.619.
 *
 * Two techniques, chosen per control and named in `Features.md` §17:
 *  - HIT-SLOP: a `::before` centred on the control, 2.75rem tall, painting nothing. The control's
 *    drawn box does not change, so its visuals are exactly what they were.
 *  - GROW: `min-height: 2.75rem` on a control whose box IS its look (a bordered field, a row whose
 *    hover fill is its box). Growing it is the fix, and its look declarations stay.
 */
const FLOOR = '2.75rem';
const HALF = '-1.375rem';

/** The hit-slop pseudo paints nothing: no fill, edge, shadow or outline — it only extends the hit box. */
const PAINTS = ['background', 'background-color', 'border', 'box-shadow', 'outline', 'color', 'opacity'];

function expectHitSlop(sheet: 'ui' | 'globals', base: string, inline: string): void {
  const css = cssOf(sheet);
  // the base is the positioning context for the absolutely placed pseudo
  expect(valueOf(ruleExactly(css, base), 'position'), `${base}: position`).toBe('relative');
  const slop = ruleExactly(css, `${base}::before`);
  expect(valueOf(slop, 'content'), `${base}::before content`).toBe("''");
  expect(valueOf(slop, 'position'), `${base}::before position`).toBe('absolute');
  expect(valueOf(slop, 'top'), `${base}::before top`).toBe('50%');
  expect(valueOf(slop, 'height'), `${base}::before height`).toBe(FLOOR);
  expect(valueOf(slop, 'margin-top'), `${base}::before margin-top`).toBe(HALF);
  expect(valueOf(slop, 'left'), `${base}::before left`).toBe(inline);
  expect(valueOf(slop, 'right'), `${base}::before right`).toBe(inline);
  for (const property of PAINTS) {
    expect(valueOf(slop, property), `${base}::before paints ${property}`).toBeNull();
  }
}

describe('20.611 the board workflow toggle has a 44px hit box; its drawn box is unchanged', () => {
  it('20.611 hit-slop on the toggle, its 36px box and transparent look untouched', () => {
    expectHitSlop('ui', '.gn-board__workflow-toggle', '0');
    // CONTROL — the drawn box: the same 36px min-height, padding, negative margin and no fill.
    expectRow({
      sheet: 'ui',
      selectors: '.gn-board__workflow-toggle',
      declarations: { 'min-height': '2.25rem', padding: '0 0.75rem', 'margin-inline-start': '-0.75rem', background: 'transparent', border: 'none' },
    });
  });
});

describe('20.612 the workspace-home rename trigger has a 44px hit box; its drawn box is unchanged', () => {
  it('20.612 hit-slop on the trigger, its padding-less text look untouched', () => {
    expectHitSlop('globals', '.gn-workspace-home__rename-trigger', '0');
    expectRow({
      sheet: 'globals',
      selectors: '.gn-workspace-home__rename-trigger',
      declarations: { padding: '0', margin: '0', background: 'none', border: 'none' },
    });
  });
});

describe('20.613 the notes filter is 44px tall (its box is its look)', () => {
  it('20.613 min-height 2.75rem on the field, its edge and fill kept', () => {
    expectRow({
      sheet: 'globals',
      selectors: '.gn-notes__filter',
      declarations: {
        'min-height': FLOOR,
        border: '1px solid var(--gn-border)',
        background: 'var(--gn-surface-raised)',
        'border-radius': 'var(--gn-radius-control)',
      },
    });
  });
});

describe('20.614 every notes row is 44px tall (its hover fill is its box)', () => {
  it('20.614 min-height 2.75rem, centred, hover and open fills kept', () => {
    expectRow({
      sheet: 'globals',
      selectors: '.gn-notes__row',
      declarations: { 'min-height': FLOOR, 'align-items': 'center', 'border-radius': 'var(--gn-radius-control)' },
    });
    expectRow({ sheet: 'globals', selectors: '.gn-notes__row:hover', declarations: { background: 'var(--gn-fill-secondary)' } });
    expectRow({ sheet: 'globals', selectors: '.gn-notes__row--open', declarations: { background: 'var(--gn-fill-tertiary)' } });
  });
});

describe('20.615 the switch input has a 44px hit box; its 51×31 track is unchanged', () => {
  it('20.615 hit-slop on the input, track size and knob untouched', () => {
    expectHitSlop('ui', '.gn-switch', '0');
    expectRow({ sheet: 'ui', selectors: '.gn-switch', declarations: { width: '3.1875rem', height: '1.9375rem', position: 'relative' } });
    expectRow({ sheet: 'ui', selectors: '.gn-switch::after', declarations: { width: '1.6875rem', height: '1.6875rem' } });
  });
});

describe('20.616 the breadcrumb link has a 44px hit box; the crumb is drawn as before', () => {
  it('20.616 hit-slop on the link, no padding or display added to it', () => {
    expectHitSlop('globals', '.gn-breadcrumb a', '-0.25rem');
    const crumb = ruleExactly(cssOf('globals'), '.gn-breadcrumb');
    expect(valueOf(crumb, 'font-size')).toBe('0.85rem');
    for (const property of ['padding', 'min-height', 'line-height']) expect(valueOf(crumb, property), `.gn-breadcrumb ${property}`).toBeNull();
    const link = ruleExactly(cssOf('globals'), '.gn-breadcrumb a');
    for (const property of ['padding', 'margin', 'display', 'min-height']) expect(valueOf(link, property), `.gn-breadcrumb a ${property}`).toBeNull();
  });
});

describe('20.624 the searchable select input fills its 44px field; nothing about its drawn box changes', () => {
  it('20.624 stretch plus a -1px block margin reaches the field edge to edge; no border or fill added', () => {
    expectRow({
      sheet: 'ui',
      selectors: '.gn-select__trigger--searchable input',
      declarations: { 'align-self': 'stretch', 'margin-block': '-1px' },
    });
    // CONTROL — the input is still drawn as bare text: no border, transparent, flex:1, and its field wrapper keeps the 44px floor.
    expectRow({
      sheet: 'ui',
      selectors: '.gn-select__trigger--searchable input',
      declarations: { border: 'none', background: 'transparent', flex: '1' },
    });
    expectRow({ sheet: 'ui', selectors: '.gn-field__input', declarations: { 'min-height': FLOOR } });
  });
});

describe('20.617 the hit-slop rules paint nothing anywhere', () => {
  it('20.617 every touch-slop pseudo declares no paint; there are four', () => {
    const slops = [...parseRules(cssOf('ui')), ...parseRules(cssOf('globals'))].filter((rule) =>
      rule.selectors.some((selector) =>
        ['.gn-board__workflow-toggle::before', '.gn-workspace-home__rename-trigger::before', '.gn-switch::before', '.gn-breadcrumb a::before'].includes(selector),
      ),
    );
    // CONTROL — the scan finds the four hit-slop rules, not an empty set.
    expect(slops.length).toBe(4);
    for (const rule of slops) for (const property of PAINTS) expect(valueOf(rule.body, property), `${rule.selectors.join()} ${property}`).toBeNull();
  });
});

describe('20.618 the exemptions on the KEPT list stay exempt for a stated reason', () => {
  it('20.618 the visually-hidden native select sits behind a 44px trigger; inline links are not enlarged', () => {
    // CONTROL — the shared Select's trigger, the real target, keeps the 44px floor (`.gn-field__input`).
    expectRow({ sheet: 'ui', selectors: '.gn-field__input', declarations: { 'min-height': FLOOR } });
    // The native <select> the measurement saw at 20px is React Aria's HiddenSelect: the shared component renders it visually hidden.
    const source = readSelectSource();
    expect(source).toMatch(/<HiddenSelect /);
    // Inline links in running text (footer, sign-in, legal pages: 19px) are exempt (WCAG 2.5.8) and are given no hit-slop.
    for (const sheet of ['ui', 'globals'] as const) {
      for (const rule of parseRules(cssOf(sheet))) {
        for (const selector of rule.selectors) {
          expect(selector, 'an inline-link hit-slop').not.toMatch(/gn-(footer|legal|auth)[^{]*a::before/);
        }
      }
    }
  });
});

function readSelectSource(): string {
  return readFileSync(join(REPO_ROOT, 'packages/ui/src/select/select.tsx'), 'utf8');
}
