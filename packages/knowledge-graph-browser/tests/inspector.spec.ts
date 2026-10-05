import { expect, test, type Page } from '@playwright/test';
import { waitStill } from './helpers.js';

/*
 * The inspectors on the real Sigma adapter (KG-C T8; cases 27.337, 27.338): `harness/main.tsx` renders `KnowledgeGraph` on
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

test('27.337 clicking the middle of blocks GN-133 → GN-142 opens the edge inspector with its provenance; control: a fog dot leaves the heading as it was', async ({ page }) => {
  await openView(page);
  const heading = page.locator('.gn-kg-insp__title');
  await expect(heading).toHaveText(CENTRE_TITLE); // the centre is selected at open
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
  await expect(page.locator('.gn-kg-insp__prov')).toHaveText('Added by Bolsrang Momin on 1 Oct 2026. A typed link.');
  await stillView(page);
  expect(await camera(page)).toEqual(zoomed);
  expect(await canvasBox(page)).toEqual(before); // the inspector changed; the canvas did not
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
