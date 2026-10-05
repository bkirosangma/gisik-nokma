import { expect, test, type Page } from '@playwright/test';
import { waitStill } from './helpers.js';

/*
 * The inspectors on the real Sigma adapter (KG-C T8; cases 27.337, 27.338, and 27.660 for the list under the canvas, whose
 * rules `packages/ui/test/knowledge-graph-list-css.test.ts` reads): `harness/main.tsx` renders `KnowledgeGraph` on
 * the fixture, centred on GN-142, with the probe on. Every wait is for the camera to settle (`waitStill`), never a timer.
 */
type Pt = { x: number; y: number };
const errors: string[] = [];
test.afterEach(() => {
  expect(errors.splice(0)).toEqual([]);
});

const stillView = (page: Page) => waitStill(page, () => page.evaluate(() => [window.__kgView.probe!.camera(), window.__kgView.probe!.frames()]));
async function openView(page: Page, query = ''): Promise<void> {
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/index.html${query}`);
  await page.waitForFunction(() => window.__kgView?.probe !== null && window.__kgView?.zones !== null, null, { timeout: 60_000 });
  await stillView(page);
}
/** A drawn item's centre in page px. */
async function pointOf(page: Page, ref: string): Promise<Pt> {
  return page.evaluate((r) => {
    const s = document.querySelector('.gn-kg__stage')!.getBoundingClientRect();
    const v = window.__kgView.probe!.viewportOf(r)!;
    return { x: s.left + v.x, y: s.top + v.y };
  }, ref);
}
const canvasBox = (page: Page) => page.evaluate(() => {
  const r = document.querySelector('.gn-kg__canvas')!.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
});
const camera = (page: Page) => page.evaluate(() => window.__kgView.probe!.camera());
type Box = { left: number; right: number; top: number; bottom: number; width: number };
const boxOf = (page: Page, sel: string): Promise<Box> =>
  page.evaluate((s) => {
    const r = document.querySelector(s)!.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width };
  }, sel);
const CENTRE_TITLE = 'Move sheet loses its scroll position on phone';
/** A box in PAGE px (a click on a list row below the fold scrolls the page). */
const pageBox = (page: Page, sel: string) =>
  page.evaluate((s) => {
    const r = document.querySelector(s)!.getBoundingClientRect();
    return { top: r.top + scrollY, bottom: r.bottom + scrollY, left: r.left, width: r.width, height: r.height };
  }, sel);
const listRow = (page: Page, name: RegExp) => page.locator('.gn-kg-list').getByRole('button', { name }).first();
/** The grid placement the inspector and the keys-and-list block compute to (jsdom loads no CSS, so this is the CSS leg). */
const placement = (page: Page) =>
  page.evaluate(() => {
    const at = (s: string) => {
      const c = getComputedStyle(document.querySelector(s)!);
      return `${c.gridColumnStart} / ${c.gridColumnEnd}, ${c.gridRowStart} / ${c.gridRowEnd}`;
    };
    return { aside: at('.gn-kg-insp'), below: at('.gn-kg__below') };
  });
const DESKTOP = { aside: 'auto / auto, 1 / span 2', below: '1 / auto, 2 / auto' };
const STACKED = { aside: 'auto / auto, auto / auto', below: 'auto / auto, auto / auto' };
const rowHeights = (page: Page) => page.locator('.gn-kg-insp .gn-kg-links__row').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));

test('27.337 clicking the middle of blocks GN-133 → GN-142 opens the edge inspector with its provenance; control: a fog dot leaves the heading as it was', async ({ page }) => {
  await openView(page);
  const heading = page.locator('.gn-kg-insp__title');
  await expect(heading).toHaveText(CENTRE_TITLE); // the centre is selected at open
  expect(await rowHeights(page)).toEqual(Array(7).fill(36)); // its seven Direct links rows: 2.25rem each
  const before = await canvasBox(page);
  // control: GN-126 is in the fog at two hops, and a click on it changes nothing
  expect(await page.evaluate(() => window.__kgView.zones!.fog.has('ticket:t126'))).toBe(true);
  const fog = await pointOf(page, 'ticket:t126');
  await page.mouse.click(fog.x, fog.y);
  await stillView(page);
  await expect(heading).toHaveText(CENTRE_TITLE);
  // zoomed in, the edge, at its middle: the edge inspector, and the camera stays where it was (selection keeps the zoom)
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await stillView(page);
  const zoomed = await camera(page);
  const a = await pointOf(page, 'ticket:t133'), b = await pointOf(page, 'ticket:t142');
  await page.mouse.click((a.x + b.x) / 2, (a.y + b.y) / 2);
  await expect(heading).toHaveText('GN-133 blocks GN-142');
  expect(await rowHeights(page)).toEqual([36, 36]); // its From and To rows (two of them: the height check is not vacuous)
  await expect(page.locator('.gn-kg-insp__prov')).toHaveText('Added by Bolsrang Momin on 1 Oct 2026. A typed link.');
  await stillView(page);
  expect(await camera(page)).toEqual(zoomed);
  expect(await canvasBox(page)).toEqual(before); // the inspector changed; the canvas did not
});

test('27.337 a link clicked twice keeps no zoom for later: Escape back to GN-142 is fitted; control: the second click kept the zoom', async ({ page }) => {
  await openView(page);
  const mount = page.locator('.gn-kg__mount');
  const fit142 = (await camera(page)).ratio; // GN-142 opens fitted
  const t133 = await pointOf(page, 'ticket:t133');
  await page.mouse.dblclick(t133.x, t133.y);
  await expect(mount).toHaveAttribute('aria-label', 'Knowledge Graph of items linked to GN-133');
  await stillView(page);
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await stillView(page);
  }
  const zoomed = await camera(page);
  const a = await pointOf(page, 'ticket:t133'), b = await pointOf(page, 'ticket:t142');
  const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  await page.mouse.click(mid.x, mid.y);
  await expect(page.locator('.gn-kg-insp__title')).toHaveText('GN-133 blocks GN-142');
  await stillView(page);
  await page.waitForTimeout(700); // the one timer: past Sigma's double-click window, so the next click is a second click
  await page.mouse.click(mid.x, mid.y);
  await stillView(page);
  expect(await camera(page)).toEqual(zoomed); // control: the second click kept the zoom too
  await page.keyboard.press('Escape'); // Back to GN-142, whose rings are cached: this centre change is ONE draw
  await expect(mount).toHaveAttribute('aria-label', 'Knowledge Graph of items linked to GN-142');
  await stillView(page);
  expect((await camera(page)).ratio).toBeCloseTo(fit142, 6); // fitted, not left at the zoom
});

test('27.338 a double-click centres GN-133, Escape goes back, and the canvas box holds with a 200-character title selected; control: a single click does not centre', async ({ page }) => {
  await openView(page, '?long=ticket:t133');
  const heading = page.locator('.gn-kg-insp__title');
  const mount = page.locator('.gn-kg__mount');
  const before = await canvasBox(page);
  // control: one click selects GN-133 (its 200-character title fills the inspector) and does not centre it
  const t133 = await pointOf(page, 'ticket:t133');
  await page.mouse.click(t133.x, t133.y);
  await expect(heading).toHaveText(/^Move sheet loses its scroll position on phone when the board column/);
  expect((await heading.textContent())!.length).toBe(200);
  await stillView(page);
  await expect(mount).toHaveAttribute('aria-label', 'Knowledge Graph of items linked to GN-142');
  await expect(page.locator('.gn-kg__trail')).toHaveCount(0);
  await expect(page.locator('.gn-kg-insp').getByRole('heading', { name: 'How it connects to GN-142' })).toHaveCount(1);
  expect(await canvasBox(page)).toEqual(before);
  // the double-click centres it: the trail, the canvas's name, and an inspector whose centre is GN-133 (no path to show)
  await page.mouse.dblclick(t133.x, t133.y);
  await expect(page.getByRole('button', { name: 'Back to GN-142' })).toBeVisible();
  await expect(mount).toHaveAttribute('aria-label', 'Knowledge Graph of items linked to GN-133');
  await stillView(page);
  await expect(heading).toHaveText(/^Move sheet loses its scroll position on phone when the board column/);
  await expect(page.locator('.gn-kg-insp').getByRole('heading', { name: /^How it connects/ })).toHaveCount(0);
  await expect(page.locator('.gn-kg-insp').getByRole('button', { name: /^Center on/ })).toHaveCount(0); // it IS the centre
  expect(await canvasBox(page)).toEqual(before);
  // Escape (the focus is in the view: the click focused the canvas) goes back to GN-142
  expect(await page.evaluate(() => document.activeElement?.closest('.gn-kg') !== null)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(mount).toHaveAttribute('aria-label', 'Knowledge Graph of items linked to GN-142');
  await expect(heading).toHaveText(CENTRE_TITLE);
  await expect(page.locator('.gn-kg__trail')).toHaveCount(0);
});

test('27.338 the inspector is a fixed column beside the canvas from 921 px wide and under it, full width, at 920 px; never over it', async ({ page }) => {
  await page.setViewportSize({ width: 921, height: 800 });
  await openView(page);
  const c = await boxOf(page, '.gn-kg__canvas'), a = await boxOf(page, '.gn-kg-insp');
  expect(a.left).toBeGreaterThan(c.right); // beside it
  expect(a.width).toBe(300); // 18.75rem whatever it holds: a long title cannot move the canvas
  await page.setViewportSize({ width: 920, height: 800 });
  await expect.poll(async () => (await boxOf(page, '.gn-kg-insp')).top >= (await boxOf(page, '.gn-kg__canvas')).bottom).toBe(true); // under it
  expect((await boxOf(page, '.gn-kg-insp')).width).toBe((await boxOf(page, '.gn-kg__canvas')).width);
});

test('27.338 a phone: the inspector is a card under the canvas, full width, in a window wide enough for two columns', async ({ page }) => {
  expect(page.viewportSize()!.width).toBeGreaterThan(920); // so the card is the phone layout's doing, not the breakpoint's
  await openView(page, '?config=phone');
  await expect(page.locator('.gn-kg-insp')).toHaveClass(/gn-kg-insp--card/);
  const c = await boxOf(page, '.gn-kg__canvas'), a = await boxOf(page, '.gn-kg-insp');
  expect(a.top).toBeGreaterThanOrEqual(c.bottom);
  expect(a.width).toBe(c.width);
});

test('27.660 a desktop: the keys line and the list sit under the canvas, in its column, and the inspector beside them never moves the list; control: Phone pass rulings\' inspector runs past the canvas, GN-133\'s does not', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openView(page);
  const canvas = await pageBox(page, '.gn-kg__canvas');
  const heading = page.locator('.gn-kg-insp__title');
  await listRow(page, /^GN-133 /).click();
  await expect(heading).toHaveText('Move sheet: workflows branch');
  const short = { aside: await pageBox(page, '.gn-kg-insp'), keys: await pageBox(page, '.gn-kg__keys'), list: await pageBox(page, '.gn-kg-list'), head: await pageBox(page, '.gn-kg-list__head') };
  await listRow(page, /^Phone pass rulings/).click();
  await expect(heading).toHaveText('Phone pass rulings');
  const tall = { aside: await pageBox(page, '.gn-kg-insp'), head: await pageBox(page, '.gn-kg-list__head') };
  expect(short.aside.bottom).toBeLessThan(canvas.bottom); // control: GN-133's inspector ends above the canvas's foot
  expect(tall.aside.bottom).toBeGreaterThan(canvas.bottom); // and Phone pass rulings' runs past it
  expect(tall.head.top).toBe(short.head.top); // the list did not move
  // under the canvas, in its column: the keys line 10 px down, then the list 10 px under it, as wide as the canvas
  expect(short.keys.top).toBeCloseTo(canvas.bottom + 10, 1);
  expect(short.head.top).toBeCloseTo(short.keys.bottom + 10, 1);
  expect([short.list.left, short.list.width]).toEqual([canvas.left, canvas.width]);
  expect(await placement(page)).toEqual(DESKTOP);
});

test('27.660 a short list: GN-149 at one hop lists GN-142 alone, and GN-142\'s inspector, longer than the canvas and the list together, does not move it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openView(page);
  const mount = page.locator('.gn-kg__mount');
  await mount.focus();
  await page.keyboard.press('1');
  await stillView(page);
  await listRow(page, /^GN-149 /).click();
  await page.locator('.gn-kg-insp').getByRole('button', { name: 'Center on GN-149' }).click();
  await expect(mount).toHaveAttribute('aria-label', 'Knowledge Graph of items linked to GN-149');
  await stillView(page);
  await expect(page.locator('.gn-kg-list').getByRole('button')).toHaveCount(1);
  const head = await pageBox(page, '.gn-kg-list__head');
  await listRow(page, /^GN-142 /).click();
  await expect(page.locator('.gn-kg-insp__title')).toHaveText(CENTRE_TITLE);
  const aside = await pageBox(page, '.gn-kg-insp'), list = await pageBox(page, '.gn-kg-list');
  expect(aside.bottom).toBeGreaterThan(list.bottom); // control: the inspector runs past the list's foot, so a row must take its excess
  expect((await pageBox(page, '.gn-kg-list__head')).top).toBe(head.top); // row 2 takes it: the canvas's row, and the list, stay
});

test('27.660 one column (920, 768 and 360 wide) and a phone keep canvas, inspector, keys line, list in that order, with no sideways scroll; control: 921 wide is two columns', async ({ page }) => {
  // the boundary: 921 px wide places the list in the canvas's column, 920 stacks
  await page.setViewportSize({ width: 921, height: 800 });
  await openView(page);
  expect(await placement(page)).toEqual(DESKTOP);
  await page.setViewportSize({ width: 920, height: 800 });
  await expect.poll(() => placement(page)).toEqual(STACKED);
  for (const [width, height] of [[768, 1024], [360, 780]] as const) {
    await page.setViewportSize({ width, height });
    await openView(page);
    await listRow(page, /^Phone pass rulings/).click();
    await expect(page.locator('.gn-kg-insp__title')).toHaveText('Phone pass rulings');
    expect(await placement(page)).toEqual(STACKED);
    const c = await pageBox(page, '.gn-kg__canvas'), a = await pageBox(page, '.gn-kg-insp'), k = await pageBox(page, '.gn-kg__keys'), l = await pageBox(page, '.gn-kg-list');
    // as before the list moved into the body: the inspector 18 px under the canvas, the keys line 10 px under it, the list 10 px on
    expect(a.top - c.bottom).toBeCloseTo(18, 1);
    expect(k.top - a.bottom).toBeCloseTo(10, 1);
    expect(l.top - k.bottom).toBeCloseTo(10, 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  // a phone: the card and then the list, in a wide window too (its own layout, not the breakpoint's), and at 360
  for (const width of [1280, 360]) {
    await page.setViewportSize({ width, height: 780 });
    await openView(page, '?config=phone');
    expect(await placement(page)).toEqual(STACKED);
    const a = await pageBox(page, '.gn-kg-insp'), l = await pageBox(page, '.gn-kg-list');
    expect(l.top).toBeGreaterThanOrEqual(a.bottom);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});
