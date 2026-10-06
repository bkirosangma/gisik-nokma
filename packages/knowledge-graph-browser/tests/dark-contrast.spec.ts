import { expect, test, type Page } from '@playwright/test';
import { waitStill } from './helpers.js';

/*
 * Dark-theme contrast in the list and the inspector (owner ruling 2026-10-06; cases 27.665–27.667): measured on computed
 * colours, never token names. Each dark leg runs in three arms: hig and neo by `data-theme="dark"`, and neo by the OS
 * preference alone (the `@media (prefers-color-scheme: dark)` arm, with no attribute). The light controls pin the values the
 * tip read BEFORE the change, as literals, so a change that leaks into light (a retuned shared token, a media rule without
 * its `:not([data-theme="light"])`) is red.
 */
type Rgba = [number, number, number, number];
type Arm = { name: string; style: 'hig' | 'neo'; theme: 'dark' | 'light' | null; os: 'dark' | 'light' };
const DARK: Arm[] = [
  { name: 'hig, data-theme dark', style: 'hig', theme: 'dark', os: 'light' },
  { name: 'neo, data-theme dark', style: 'neo', theme: 'dark', os: 'light' },
  { name: 'neo, OS dark, no attribute', style: 'neo', theme: null, os: 'dark' },
];
const SELECTED = '.gn-kg-list__row[aria-current="true"]';

const errors: string[] = [];
test.afterEach(() => {
  expect(errors.splice(0)).toEqual([]);
});

const stillView = (page: Page) => waitStill(page, () => page.evaluate(() => [window.__kgView.probe!.camera(), window.__kgView.probe!.frames()]));
async function openArm(page: Page, arm: Arm, query = ''): Promise<void> {
  page.removeAllListeners('pageerror');
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.emulateMedia({ colorScheme: arm.os });
  await page.goto(`/index.html${query}`);
  await page.evaluate(({ style, theme }) => {
    if (style !== 'hig') document.documentElement.dataset.style = style;
    if (theme !== null) document.documentElement.dataset.theme = theme;
  }, arm);
  await page.waitForFunction(() => window.__kgView?.probe !== null && window.__kgView?.zones !== null, null, { timeout: 60_000 });
  await stillView(page);
}
const listRow = (page: Page, name: RegExp) => page.locator('.gn-kg-list').getByRole('button', { name }).first();
async function select(page: Page, name: RegExp, title: string): Promise<void> {
  await listRow(page, name).click();
  await expect(page.locator('.gn-kg-insp__title')).toHaveText(title);
  await page.mouse.move(0, 0); // nothing hovered
}

function parse(css: string): Rgba {
  const m = /rgba?\(([\d.]+), ([\d.]+), ([\d.]+)(?:, ([\d.]+))?\)/.exec(css);
  if (m === null) throw new Error(`not a colour: ${css}`);
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] === undefined ? 1 : Number(m[4])];
}
/** `fg` laid over an opaque `bg`. */
function over(fg: Rgba, bg: Rgba): Rgba {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
}
function luminance(c: Rgba): number {
  const [r, g, b] = c.slice(0, 3).map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
/** WCAG contrast ratio of two opaque colours. */
function ratio(a: Rgba, b: Rgba): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
/** An inset box-shadow's colour and its x offset and spread (`rgb(…) 3px 0px 0px 0px inset`). */
function inset(shadow: string): { colour: Rgba; x: number; blur: number; spread: number } {
  const m = /^(rgba?\([^)]*\)) (-?[\d.]+)px (-?[\d.]+)px ([\d.]+)px (-?[\d.]+)px inset$/.exec(shadow);
  if (m === null) throw new Error(`not one inset shadow: ${shadow}`);
  return { colour: parse(m[1]!), x: Number(m[2]), blur: Number(m[4]), spread: Number(m[5]) };
}

/** The computed paint of `selector` (first match) and of the opaque ground under it. */
async function paint(page: Page, selector: string) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (el === null) return null;
    const cs = getComputedStyle(el);
    let up = el.parentElement, ground = 'rgba(0, 0, 0, 0)';
    while (up !== null) {
      const bg = getComputedStyle(up).backgroundColor;
      if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') {
        ground = bg;
        break;
      }
      up = up.parentElement;
    }
    const rel = el.querySelector('.gn-kg-links__rel');
    return { bg: cs.backgroundColor, shadow: cs.boxShadow, color: cs.color, rel: rel === null ? null : getComputedStyle(rel).color, ground };
  }, selector);
}

for (const arm of DARK) {
  test(`27.665 dark (${arm.name}): the selected row has a 3:1 accent bar and a fill stronger than hover, its text still 4.5:1; control: the hover was real`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openArm(page, arm);
    await select(page, /^Phone pass rulings/, 'Phone pass rulings');
    const sel = (await paint(page, SELECTED))!;
    expect(sel).not.toBeNull();
    const ground = parse(sel.ground);
    expect(ground[3]).toBe(1); // the page itself, opaque
    const bar = inset(sel.shadow);
    expect([bar.x, bar.blur, bar.spread]).toEqual([3, 0, 0]);
    expect(ratio(over(bar.colour, ground), ground)).toBeGreaterThanOrEqual(3);
    const selFill = over(parse(sel.bg), ground);
    // the text on the selected fill: the name and the relation line
    expect(ratio(parse(sel.color), selFill)).toBeGreaterThanOrEqual(4.5);
    expect(ratio(parse(sel.rel!), selFill)).toBeGreaterThanOrEqual(4.5);
    // hover an UNselected row with a real pointer
    const other = listRow(page, /^GN-133 /);
    const resting = await other.evaluate((e) => getComputedStyle(e).backgroundColor);
    await other.hover();
    const hovered = await other.evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(hovered).not.toBe(resting); // control: the hover applied
    const hoverFill = over(parse(hovered), ground);
    expect(ratio(selFill, ground)).toBeGreaterThan(ratio(hoverFill, ground));
    // CLEARLY stronger (brief item 1): by at least 0.25. fill-tertiary passes a bare `>` (neo 1.196 vs hover 1.172; reviewer mutant Mb)
    expect(ratio(selFill, ground) - ratio(hoverFill, ground)).toBeGreaterThanOrEqual(0.25);
  });
}

const LIGHT: Array<Arm & { sel: string; hover: string; rel: string }> = [
  { name: 'hig light', style: 'hig', theme: null, os: 'light', sel: 'rgb(232, 222, 212)', hover: 'rgba(39, 58, 99, 0.06)', rel: 'rgb(94, 94, 98)' },
  { name: 'neo light', style: 'neo', theme: null, os: 'light', sel: 'rgb(230, 220, 210)', hover: 'rgba(176, 152, 132, 0.1)', rel: 'rgb(94, 94, 98)' },
  { name: 'neo, data-theme light under an OS dark', style: 'neo', theme: 'light', os: 'dark', sel: 'rgb(230, 220, 210)', hover: 'rgba(176, 152, 132, 0.1)', rel: 'rgb(94, 94, 98)' },
];
for (const arm of LIGHT) {
  test(`27.665 control (${arm.name}): the selected row, the hover and the relation line are the values before the change`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openArm(page, arm);
    await select(page, /^Phone pass rulings/, 'Phone pass rulings');
    const sel = (await paint(page, SELECTED))!;
    expect({ bg: sel.bg, shadow: sel.shadow, rel: sel.rel }).toEqual({ bg: arm.sel, shadow: 'none', rel: arm.rel });
    const other = listRow(page, /^GN-133 /);
    await other.hover();
    expect(await other.evaluate((e) => [getComputedStyle(e).backgroundColor, getComputedStyle(e).boxShadow])).toEqual([arm.hover, 'none']);
  });
}

for (const arm of DARK) {
  test(`27.666 dark (${arm.name}): the Mobile web pill and, on a 360 phone, the outside-the-scope well have a 1px outline at 3:1 on their ground; control: the suggested pill keeps its concept ring`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openArm(page, arm);
    await select(page, /^Phone pass rulings/, 'Phone pass rulings');
    await expect(page.locator('.gn-kg-insp .gn-kg-pill')).toHaveText(['Mobile web']); // the subject is there
    const pill = (await paint(page, '.gn-kg-insp .gn-kg-pill'))!;
    const rim = inset(pill.shadow);
    expect([rim.x, rim.blur, rim.spread]).toEqual([0, 0, 1]);
    expect(ratio(over(rim.colour, parse(pill.ground)), parse(pill.ground))).toBeGreaterThanOrEqual(3);
    // control: a suggested concept's pill keeps its own ring, not the outline
    await select(page, /^drag · column · board/, 'drag · column · board');
    await expect(page.locator('.gn-kg-insp .gn-kg-pill--suggested')).toHaveCount(1);
    const suggested = (await paint(page, '.gn-kg-insp .gn-kg-pill--suggested'))!;
    expect(inset(suggested.shadow).colour).not.toEqual(rim.colour);
    // a phone, a literal 360 viewport: the well sits on the card
    await page.setViewportSize({ width: 360, height: 780 });
    await openArm(page, arm, '?config=phone');
    await select(page, /^Ama Rangsa/, 'Ama Rangsa');
    await expect(page.locator('.gn-kg-insp--card .gn-kg-insp__outs')).toHaveCount(1); // the subject is there
    const well = (await paint(page, '.gn-kg-insp--card .gn-kg-insp__outs'))!;
    const card = (await paint(page, '.gn-kg-insp--card'))!;
    expect(well.ground).toBe(card.bg); // its ground is the card
    const edge = inset(well.shadow);
    expect([edge.x, edge.blur, edge.spread]).toEqual([0, 0, 1]);
    const ground = over(parse(well.bg), parse(card.ground));
    expect(ratio(over(edge.colour, ground), ground)).toBeGreaterThanOrEqual(3);
    // control: the outline is the phone CARD's; at 1280 the same well, not in a card, keeps none (reviewer mutant Mc)
    await page.setViewportSize({ width: 1280, height: 720 });
    await openArm(page, arm);
    await select(page, /^Ama Rangsa/, 'Ama Rangsa');
    await expect(page.locator('.gn-kg-insp--card')).toHaveCount(0);
    await expect(page.locator('.gn-kg-insp .gn-kg-insp__outs')).toHaveCount(1); // the subject is there
    expect((await paint(page, '.gn-kg-insp .gn-kg-insp__outs'))!.shadow).toBe('none');
  });
}

test('27.666 control (hig light, neo light, neo data-theme light under an OS dark): the pill and the phone well have no box-shadow', async ({ page }) => {
  for (const arm of LIGHT) {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openArm(page, arm);
    await select(page, /^Phone pass rulings/, 'Phone pass rulings');
    await expect(page.locator('.gn-kg-insp .gn-kg-pill')).toHaveText(['Mobile web']);
    expect((await paint(page, '.gn-kg-insp .gn-kg-pill'))!.shadow).toBe('none');
    await page.setViewportSize({ width: 360, height: 780 });
    await openArm(page, arm, '?config=phone');
    await select(page, /^Ama Rangsa/, 'Ama Rangsa');
    await expect(page.locator('.gn-kg-insp--card .gn-kg-insp__outs')).toHaveCount(1);
    expect((await paint(page, '.gn-kg-insp--card .gn-kg-insp__outs'))!.shadow).toBe('none');
  }
});

for (const arm of DARK) {
  test(`27.667 dark (${arm.name}): a hovered selected row keeps its accent bar and its selected fill; control: hovering an unselected row changes its fill`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await openArm(page, arm);
    await select(page, /^Phone pass rulings/, 'Phone pass rulings');
    const before = (await paint(page, SELECTED))!;
    const other = listRow(page, /^GN-133 /);
    const resting = await other.evaluate((e) => getComputedStyle(e).backgroundColor);
    await other.hover();
    const hoverBg = await other.evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(hoverBg).not.toBe(resting); // control
    await page.locator(SELECTED).hover();
    expect(await page.locator(SELECTED).evaluate((e) => e.matches(':hover'))).toBe(true);
    const during = (await paint(page, SELECTED))!;
    expect(inset(during.shadow).x).toBe(3);
    expect(during.shadow).toBe(before.shadow);
    expect(during.bg).toBe(before.bg);
    expect(during.bg).not.toBe(hoverBg);
  });
}
