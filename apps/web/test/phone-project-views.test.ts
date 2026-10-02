import { describe, expect, it } from 'vitest';
import { parseRules, readUiCss, ruleExactly, valueOf } from '../../../packages/ui/test/helpers/css-rules.js';
import { readGlobalsCss } from '../../../packages/ui/test/helpers/style-patterns.js';

/**
 * The web app on phones, Plan Task 8 — the project page's other views (§21.8): the project header and
 * view tabs (21.110), List / Backlog (21.111), Calendar (21.112) and Timeline (21.113). 21.114 (the four
 * views at 360 / 412 / 440, no page overflow, scrollers scroll) is a browser case and stays 🧪.
 *
 * Every phone rule sits inside the existing 40rem arm (FD1) and AFTER the base rule it overrides — equal
 * specificity, so source order decides, and a phone arm above its base paints nothing while passing every
 * value check. The order is asserted next to the values. The CLASS HOOKS these rules key on are asserted
 * to be carried by the components in the two hook suites (`phone-project-views-hooks.test.tsx` here and in
 * app-core), because a rule on a class the component does not carry is a rule that paints nothing.
 */
const PHONE = '@media (max-width: 40rem)';
const ui = readUiCss();
const globals = readGlobalsCss();

/** Index of the (single) rule in the stylesheet, so source order can be compared. */
function position(css: string, selectors: string[], atRule: string | null): number {
  const index = parseRules(css).findIndex(
    (rule) =>
      rule.atRule === atRule &&
      rule.selectors.length === selectors.length &&
      rule.selectors.every((selector, i) => selector === selectors[i]),
  );
  if (index === -1) throw new Error(`no rule ${selectors.join(', ')} under ${atRule ?? 'top level'}`);
  return index;
}

/**
 * Index of the LAST top-level rule whose selector list names every one of `selectors` (a base rule may be split
 * across the file, and a later top-level rule that undoes the arm must be seen — the FIRST one is not the check).
 */
function lastBaseIndex(css: string, selectors: string[]): number {
  let found = -1;
  parseRules(css).forEach((rule, i) => {
    if (rule.atRule === null && selectors.every((selector) => rule.selectors.includes(selector))) found = i;
  });
  if (found === -1) throw new Error(`no top-level rule names ${selectors.join(', ')}`);
  return found;
}

/**
 * The arm comes after EVERY top-level rule that names the selectors it overrides — compared against the LAST
 * such rule (`bases`: one selector list per base; by default the arm's own selector list).
 */
function after(css: string, selectors: string[], bases: string[][] = [selectors]): void {
  for (const base of bases) {
    expect(
      position(css, selectors, PHONE),
      `${selectors.join(', ')}: the phone arm must follow the LAST top-level rule naming ${base.join(', ')}`,
    ).toBeGreaterThan(lastBaseIndex(css, base));
  }
}

/** No top-level rule names `selector` — it is a hook only the phone arm paints. */
function onlyInPhoneArm(css: string, selector: string): void {
  expect(parseRules(css).filter((rule) => rule.atRule === null && rule.selectors.includes(selector))).toEqual([]);
}

describe('21.110 the project header: tabs scroll in their own track, search and Filters share a row, Create ticket is full width', () => {
  it('21.110 the view tabs are a deliberate horizontal scroller with scroll-snap (never wrapped) at ≤40rem; above 40rem the rail still wraps and does not scroll', () => {
    const rail = ruleExactly(globals, '.gn-project__rail', PHONE);
    expect(valueOf(rail, 'flex-wrap')).toBe('nowrap');
    expect(valueOf(rail, 'overflow-x')).toBe('auto');
    expect(valueOf(rail, 'scroll-snap-type')).toBe('x proximity');
    expect(valueOf(rail, 'max-width')).toBe('100%');
    expect(valueOf(rail, 'overscroll-behavior-x')).toBe('contain');
    const item = ruleExactly(globals, '.gn-project__rail .gn-segmented__item', PHONE);
    expect(valueOf(item, 'scroll-snap-align')).toBe('start');
    expect(valueOf(item, 'flex')).toBe('none');
    expect(valueOf(item, 'white-space')).toBe('nowrap');
    after(globals, ['.gn-project__rail']);
    after(globals, ['.gn-project__rail .gn-segmented__item']);

    // CONTROL — the desktop/tablet rail is unchanged: content-sized at the left, wrapping, no scroller.
    const base = ruleExactly(globals, '.gn-project__rail');
    expect(valueOf(base, 'flex-wrap')).toBe('wrap');
    expect(valueOf(base, 'align-self')).toBe('flex-start');
    expect(valueOf(base, 'overflow-x')).toBeNull();
    expect(valueOf(base, 'scroll-snap-type')).toBeNull();
  });

  it('21.110 the header row is full width; search takes the first row with Filters beside it; Create ticket is the one full-width primary; above 40rem the controls row is unchanged', () => {
    const header = ruleExactly(ui, '.gn-project__header', PHONE);
    expect(valueOf(header, 'flex')).toBe('1 1 100%');
    const search = ruleExactly(ui, '.gn-project__search', PHONE);
    expect(valueOf(search, 'order')).toBe('-2');
    expect(valueOf(search, 'flex')).toBe('1 1 0');
    expect(valueOf(search, 'min-width')).toBe('0');
    const filters = ruleExactly(ui, '.gn-project__filters', PHONE);
    expect(valueOf(filters, 'order')).toBe('-1');
    expect(valueOf(filters, 'flex')).toBe('none');
    // Create ticket is the header's one primary button: it takes a row of its own, at full width.
    expect(valueOf(ruleExactly(ui, '.gn-project__header > .gn-button--primary', PHONE), 'flex')).toBe('1 1 100%');
    after(ui, ['.gn-project__header']);
    after(ui, ['.gn-project__search']);

    // CONTROL — above 40rem the header is the wrapping 1rem-gap row it was, the search keeps its 12.5rem
    // floor, and `.gn-project__filters` is a hook only the phone arm paints.
    const base = ruleExactly(ui, '.gn-project__header');
    expect(valueOf(base, 'flex-wrap')).toBe('wrap');
    expect(valueOf(base, 'gap')).toBe('1rem');
    expect(valueOf(base, 'flex')).toBeNull();
    expect(valueOf(ruleExactly(ui, '.gn-project__search'), 'min-width')).toBe('12.5rem');
    onlyInPhoneArm(ui, '.gn-project__filters');
  });
});

describe('21.111 List / Backlog: the table becomes stacked rows, the bulk-close bar is full width', () => {
  it('21.111 the table, its body and each row stack as blocks: title line first, key · state · assignee · due as meta; the header row is visually hidden', () => {
    expect(valueOf(ruleExactly(ui, '.gn-list__table', PHONE), 'display')).toBe('block');
    expect(valueOf(ruleExactly(ui, '.gn-list__table', PHONE), 'min-width')).toBe('0');
    expect(valueOf(ruleExactly(ui, '.gn-list__table tbody', PHONE), 'display')).toBe('block');
    const head = ruleExactly(ui, '.gn-list__table thead', PHONE);
    expect(valueOf(head, 'position')).toBe('absolute');
    expect(valueOf(head, 'width')).toBe('1px');
    expect(valueOf(head, 'height')).toBe('1px');
    expect(valueOf(head, 'margin')).toBe('-1px');
    expect(valueOf(head, 'overflow')).toBe('hidden');
    expect(valueOf(head, 'clip')).toBe('rect(0 0 0 0)');
    expect(valueOf(head, 'white-space')).toBe('nowrap');
    const row = ruleExactly(ui, '.gn-list__table-row', PHONE);
    expect(valueOf(row, 'display')).toBe('flex');
    expect(valueOf(row, 'flex-wrap')).toBe('wrap');
    expect(valueOf(row, 'position')).toBe('relative');
    expect(valueOf(row, 'align-items')).toBe('center');
    expect(valueOf(row, 'gap')).toBe('0.125rem 0.75rem');
    expect(valueOf(row, 'padding')).toBe('0.625rem 1rem');
    // The title is the first line: first in order, and it takes the whole line.
    const title = ruleExactly(ui, '.gn-list__table-cell--title', PHONE);
    expect(valueOf(title, 'order')).toBe('-1');
    expect(valueOf(title, 'flex')).toBe('1 0 100%');
    expect(valueOf(title, 'min-width')).toBe('0');
    expect(valueOf(title, 'padding')).toBe('0');
    // The meta cells (key · state · assignee · due) are small and may wrap their own text.
    const meta = ruleExactly(ui, '.gn-list__table-cell--data', PHONE);
    expect(valueOf(meta, 'padding')).toBe('0');
    expect(valueOf(meta, 'font-size')).toBe('0.8125rem');
    expect(valueOf(meta, 'line-height')).toBe('1.125rem');
    expect(valueOf(meta, 'white-space')).toBe('normal');
    // The bulk-select checkbox sits in its own 44px square at the row's start, and the row makes room for it.
    const select = ruleExactly(ui, '.gn-list__select', PHONE);
    expect(valueOf(select, 'position')).toBe('absolute');
    expect(valueOf(select, 'width')).toBe('2.75rem');
    expect(valueOf(select, 'height')).toBe('2.75rem');
    // …at the row's top-left corner (without `left`/`top` the absolute cell falls back to its static position, over the
    // title), centred in the square, and the base `0.75rem 0 0.75rem 1rem` padding is zeroed.
    expect(valueOf(select, 'top')).toBe('0');
    expect(valueOf(select, 'left')).toBe('0');
    expect(valueOf(select, 'display')).toBe('flex');
    expect(valueOf(select, 'align-items')).toBe('center');
    expect(valueOf(select, 'justify-content')).toBe('center');
    expect(valueOf(select, 'padding')).toBe('0');
    expect(valueOf(ruleExactly(ui, '.gn-list__table-row:has(.gn-list__select)', PHONE), 'padding-left')).toBe('3.25rem');
    for (const selectors of [['.gn-list__table'], ['.gn-list__table-cell--title'], ['.gn-list__table-cell--data'], ['.gn-list__select']]) {
      after(ui, selectors);
    }

    // CONTROL — above 40rem the table keeps its columns: 51.25rem wide, the header row painted, cells padded.
    expect(valueOf(ruleExactly(ui, '.gn-list__table'), 'min-width')).toBe('51.25rem');
    expect(valueOf(ruleExactly(ui, '.gn-list__table-cell--data'), 'white-space')).toBe('nowrap');
    expect(valueOf(ruleExactly(ui, '.gn-list__table-cell--title'), 'min-width')).toBe('16.25rem');
    expect(valueOf(ruleExactly(ui, '.gn-list__select'), 'padding')).toBe('0.75rem 0 0.75rem 1rem');
    onlyInPhoneArm(ui, '.gn-list__table thead');
    onlyInPhoneArm(ui, '.gn-list__table-row');
  });

  it('21.111 the bulk-close bar is full width: the controls slot takes its own row and the Confirm close button fills it; above 40rem it stays right-aligned', () => {
    const end = ruleExactly(ui, '.gn-list__controls-end', PHONE);
    expect(valueOf(end, 'flex')).toBe('1 1 100%');
    expect(valueOf(end, 'margin-left')).toBe('0');
    expect(valueOf(end, 'display')).toBe('flex');
    const bulk = ruleExactly(ui, '.gn-list__bulk', PHONE);
    expect(valueOf(bulk, 'flex')).toBe('1 1 100%');
    expect(valueOf(bulk, 'display')).toBe('flex');
    expect(valueOf(ruleExactly(ui, '.gn-list__bulk-close', PHONE), 'flex')).toBe('1 1 auto');
    for (const selectors of [['.gn-list__controls-end'], ['.gn-list__bulk'], ['.gn-list__bulk-close']]) after(ui, selectors);

    // CONTROL — desktop: the slot hugs the right edge and the bar is an inline pair.
    expect(valueOf(ruleExactly(ui, '.gn-list__controls-end'), 'margin-left')).toBe('auto');
    expect(valueOf(ruleExactly(ui, '.gn-list__controls-end'), 'display')).toBe('inline-flex');
    expect(valueOf(ruleExactly(ui, '.gn-list__bulk'), 'display')).toBe('inline-flex');
  });
});

describe('21.112 Calendar: the month grid is a deliberate horizontal scroller with 3rem day cells', () => {
  it('21.112 the grid scrolls sideways, each week row is at least 22rem, every day track is minmax(3rem, 1fr), and the toolbar wraps', () => {
    expect(valueOf(ruleExactly(ui, '.gn-calendar__grid', PHONE), 'overflow-x')).toBe('auto');
    expect(valueOf(ruleExactly(ui, '.gn-calendar__grid', PHONE), 'overscroll-behavior-x')).toBe('contain');
    const tracks = ruleExactly(ui, ['.gn-calendar__weekday-head', '.gn-calendar__days', '.gn-calendar__items'], PHONE);
    expect(valueOf(tracks, 'grid-template-columns')).toBe('repeat(7, minmax(3rem, 1fr))');
    expect(valueOf(ruleExactly(ui, ['.gn-calendar__weekday-head', '.gn-calendar__week'], PHONE), 'min-width')).toBe('22rem');
    expect(valueOf(ruleExactly(ui, '.gn-calendar__header', PHONE), 'flex-wrap')).toBe('wrap');
    after(ui, ['.gn-calendar__grid']);
    after(ui, ['.gn-calendar__header']);
    after(ui, ['.gn-calendar__weekday-head', '.gn-calendar__days', '.gn-calendar__items'], [
      ['.gn-calendar__weekday-head'],
      ['.gn-calendar__days'],
      ['.gn-calendar__items'],
    ]);
    after(ui, ['.gn-calendar__weekday-head', '.gn-calendar__week'], [['.gn-calendar__weekday-head']]);

    // CONTROL — the PAGE does not overflow: the scroller is the grid, the calendar is bounded to its column.
    const calendar = ruleExactly(ui, '.gn-calendar', PHONE);
    expect(valueOf(calendar, 'min-width')).toBe('0');
    expect(valueOf(calendar, 'max-width')).toBe('100%');
    // …and above 40rem the grid is the plain 7×1fr it was: no scroller, no 3rem floor, no wrapping toolbar.
    expect(valueOf(ruleExactly(ui, '.gn-calendar__grid'), 'overflow-x')).toBeNull();
    expect(valueOf(ruleExactly(ui, '.gn-calendar__days'), 'grid-template-columns')).toBe('repeat(7, 1fr)');
    expect(valueOf(ruleExactly(ui, '.gn-calendar__header'), 'flex-wrap')).toBeNull();
  });
});

describe('21.113 Timeline: the weeks band scrolls inside its track; the page does not', () => {
  it('21.113 the timeline is the scroller; its week band and rows keep a 40rem floor and a narrower title column; the toolbar wraps and stays in view', () => {
    const track = ruleExactly(ui, '.gn-timeline', PHONE);
    expect(valueOf(track, 'overflow-x')).toBe('auto');
    expect(valueOf(track, 'max-width')).toBe('100%');
    expect(valueOf(track, 'min-width')).toBe('0');
    expect(valueOf(track, 'overscroll-behavior-x')).toBe('contain');
    const bands = ruleExactly(ui, ['.gn-timeline__weeks', '.gn-timeline__row'], PHONE);
    expect(valueOf(bands, 'min-width')).toBe('40rem');
    expect(valueOf(bands, 'grid-template-columns')).toBe('9rem var(--timeline-week-columns)');
    const header = ruleExactly(ui, '.gn-timeline__header', PHONE);
    expect(valueOf(header, 'flex-wrap')).toBe('wrap');
    expect(valueOf(header, 'position')).toBe('sticky');
    expect(valueOf(header, 'left')).toBe('0');
    after(ui, ['.gn-timeline']);
    after(ui, ['.gn-timeline__header']);
    after(ui, ['.gn-timeline__weeks', '.gn-timeline__row'], [
      ['.gn-timeline__weeks', '.gn-timeline__row'],
      ['.gn-timeline__weeks'],
      ['.gn-timeline__row'],
    ]);

    // CONTROL — desktop unchanged: no scroller on the timeline, the 14.375rem title column, no floor.
    const base = ruleExactly(ui, '.gn-timeline');
    expect(valueOf(base, 'overflow-x')).toBeNull();
    const desktopBands = ruleExactly(ui, ['.gn-timeline__weeks', '.gn-timeline__row']);
    expect(valueOf(desktopBands, 'grid-template-columns')).toBe('14.375rem var(--timeline-week-columns)');
    expect(valueOf(desktopBands, 'min-width')).toBeNull();
  });
});

describe('21.115 the Calendar grid contains its own absolutely placed descendants, so the page does not scroll sideways at 360', () => {
  /**
   * Found by the T13 browser pass (2026-10-01): at 360 the Calendar tab made the DOCUMENT 5px wider than the window
   * (`scrollWidth` 365). The grid is the deliberate scroller (21.112) and clips its overflow — but an absolutely
   * placed descendant (the `.gn-visually-hidden` text inside each day chip) whose containing block is OUTSIDE the
   * scroller is not clipped by it, so its right edge (365) reached the page. `position: relative` on the grid makes
   * the scroller their containing block. Measured with the rule injected on the `d22d4ffa` build: 5 → 0.
   */
  it('21.115 the phone grid is `position: relative` (the scroller is the containing block), after nothing that would undo it', () => {
    expect(valueOf(ruleExactly(ui, '.gn-calendar__grid', PHONE), 'position')).toBe('relative');
    // The arm still scrolls sideways, as 21.112 says.
    expect(valueOf(ruleExactly(ui, '.gn-calendar__grid', PHONE), 'overflow-x')).toBe('auto');
    // CONTROL — above 40rem the grid is not positioned (the plain 7x1fr it was): nothing about the desktop calendar changes.
    expect(valueOf(ruleExactly(ui, '.gn-calendar__grid'), 'position')).toBeNull();
  });
});
