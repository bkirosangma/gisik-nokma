import { expect, test, type Page } from '@playwright/test';

type Cam = { x: number; y: number; zoom: number };
const cam = (page: Page): Promise<Cam> => page.evaluate(() => (window as unknown as { __camera: { getCamera(): Cam } }).__camera.getCamera());
const nodeLeft = (page: Page): Promise<number> => page.evaluate(() => document.querySelector('.node')!.getBoundingClientRect().left);
const settled = async (page: Page): Promise<void> => {
  let last = await cam(page);
  for (let i = 0; i < 80; i += 1) {
    await page.waitForTimeout(50);
    const now = await cam(page);
    if (now.x === last.x && now.y === last.y && now.zoom === last.zoom) return;
    last = now;
  }
  // a camera that never comes to rest is a failure, not a quiet return (a fast flick stops within about 2.3 s)
  throw new Error('the camera never came to rest within 4 s');
};
// Chromium hands touch pointermoves to the page on its next animation frame, after the CDP call has returned: read after two.
const frames = (page: Page): Promise<void> => page.evaluate(() => new Promise<void>((done) => requestAnimationFrame(() => requestAnimationFrame(() => done()))));

test('29.045 a mouse drag pans the world with the pointer, then momentum carries on and stops', async ({ page }) => {
  await page.goto('/camera.html');
  const view = page.locator('#view');
  const box = (await view.boundingBox())!;
  await page.mouse.move(box.x + 500, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 250, { steps: 10 });
  const during = await cam(page);
  expect(during.x).toBeCloseTo(200, 0);
  await page.mouse.up();
  await settled(page);
  const after = await cam(page);
  // the release velocity carried the camera further than the pointer went (strictly: with no momentum after === during), and it came to rest
  expect(after.x).toBeGreaterThan(during.x);
  expect(after.y).toBeCloseTo(0, 0);
  const rest = await cam(page);
  await page.waitForTimeout(200);
  expect((await cam(page)).x).toBe(rest.x);
});

test('29.046 Ctrl + wheel zooms about the pointer: the world point under it stays within half a pixel', async ({ page }) => {
  await page.goto('/camera.html');
  const view = page.locator('#view');
  const box = (await view.boundingBox())!;
  const px = { x: 420, y: 180 };
  await page.mouse.move(box.x + px.x, box.y + px.y);
  const worldAt = (c: Cam) => ({ x: c.x + px.x / c.zoom, y: c.y + px.y / c.zoom });
  const before = worldAt(await cam(page));
  let worst = 0;
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -12);
    await page.keyboard.up('Control');
    const c = await cam(page);
    const w = worldAt(c);
    worst = Math.max(worst, Math.hypot(w.x - before.x, w.y - before.y) * c.zoom);
  }
  // zoomed in, and not pinned at the 3x ceiling (a clamped step would make the drift trivially zero)
  expect((await cam(page)).zoom).toBeGreaterThan(1.3);
  expect((await cam(page)).zoom).toBeLessThan(3);
  expect(worst).toBeLessThanOrEqual(0.5);
  // the SCREEN agrees with the camera at this zoom: node 0 (world 0, 0) is drawn at (0 - x) * zoom from the view's left
  const c = await cam(page);
  expect(Math.abs((await nodeLeft(page)) - (box.x - c.x * c.zoom))).toBeLessThan(0.5);
});

test('29.047 a pixel wheel scroll pans; the arrow keys pan by 80 px; plus and minus zoom; the page does not scroll', async ({ page }) => {
  await page.goto('/camera.html');
  const view = page.locator('#view');
  const box = (await view.boundingBox())!;
  // make the page itself scrollable both ways, so "the page does not scroll" can fail (the 800 x 500 view alone never overflows)
  await page.evaluate(() => {
    document.body.style.width = '3000px';
    document.body.style.height = '3000px';
  });
  await page.mouse.move(box.x + 200, box.y + 200);
  await page.mouse.wheel(60, 0);
  await page.waitForTimeout(100);
  expect((await cam(page)).x).toBeCloseTo(60, 0);
  await view.focus();
  const x0 = (await cam(page)).x;
  await page.keyboard.press('ArrowRight');
  await settled(page);
  expect((await cam(page)).x - x0).toBeCloseTo(80, 0);
  const z0 = (await cam(page)).zoom;
  await page.keyboard.press('+');
  await settled(page);
  expect((await cam(page)).zoom).toBeCloseTo(z0 * 1.25, 2);
  await page.keyboard.press('-');
  await settled(page);
  expect((await cam(page)).zoom).toBeCloseTo(z0, 2);
  // the wheel and the arrow are horizontal: scrollX is the axis they would have moved
  expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
  // CONTROL: the page CAN scroll, so the line above is not true merely of an unscrollable page
  await page.evaluate(() => window.scrollTo(10, 10));
  expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([10, 10]);
});

test('29.048 reduced motion: a key press jumps with no glide and a drag release leaves no momentum', async ({ page }) => {
  await page.goto('/camera.html?reduced=1');
  const view = page.locator('#view');
  await view.focus();
  await page.keyboard.press('ArrowRight');
  // no animation frames needed: the camera is already there
  expect((await cam(page)).x).toBeCloseTo(80, 0);
  const box = (await view.boundingBox())!;
  await page.mouse.move(box.x + 500, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 300, box.y + 250, { steps: 10 });
  await page.mouse.up();
  const released = await cam(page);
  await page.waitForTimeout(300);
  expect((await cam(page)).x).toBe(released.x);
  // CONTROL: the screen position of a node follows the camera exactly (translate(-x*zoom)), so the cases above read the real thing
  expect(Math.abs((await nodeLeft(page)) - (box.x - released.x))).toBeLessThan(0.5);
});

test('29.049 two touch points pinch and pan as one gesture; the world point under their midpoint follows it', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto('/camera.html');
  const cdp = await ctx.newCDPSession(page);
  const box = (await page.locator('#view').boundingBox())!;
  const at = (x: number, y: number, id: number) => ({ x: box.x + x, y: box.y + y, id });
  const world0 = { x: 400, y: 250 };
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [at(300, 250, 1), at(500, 250, 2)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at(200, 250, 1), at(600, 250, 2)] });
  await frames(page);
  const c = await cam(page);
  expect(c.zoom).toBeGreaterThan(1.9);
  // the midpoint stayed at 400, so the world point first under it (400, 250) is still under it
  expect(c.x + 400 / c.zoom).toBeCloseTo(world0.x, 0);
  expect(c.y + 250 / c.zoom).toBeCloseTo(world0.y, 0);
  // the pan half of the gesture: both fingers slide 50 px right, the midpoint (now 450, off the view's centre) still holds world0
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [at(250, 250, 1), at(650, 250, 2)] });
  await frames(page);
  const d = await cam(page);
  expect(d.x + 450 / d.zoom).toBeCloseTo(world0.x, 0);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await ctx.close();
});
