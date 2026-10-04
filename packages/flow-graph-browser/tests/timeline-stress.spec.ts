import { expect, test, type Page } from '@playwright/test';
import type { Mode, Result } from '../harness/timeline-stress.js';

// WTG Part 4 T2 (cases 29.300, 29.301): the Home-shaped pan scene in the product's scroller, bridge and painter.
// Headless Chromium composites in software: 29.300's 60 fps bar is read only on a GPU (TLG_GPU=1); 29.301's 30 fps bar is
// read here, on the default project, under a 4x CPU throttle. Every line printed is LOCAL and names the machine.
const GPU = process.env['TLG_GPU'] === '1';
const machine = `${process.platform}/${process.arch} ${process.env['FG_HEADED'] === '1' ? 'headed' : 'headless'}`;
const run = (page: Page, mode: Mode): Promise<Result> =>
  page.evaluate((m) => (window as unknown as { __tlg: { run(mode: Mode): Promise<Result> } }).__tlg.run(m), mode);
const twoFrames = (page: Page): Promise<void> => page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

test.describe('29.300 desktop pan (gated: needs a GPU)', () => {
  test.skip(!GPU, 'TLG_GPU is not 1: headless Chromium has no GPU, so 60 fps is not measurable here; set TLG_GPU=1 on a GPU machine');
  test('29.300 windowed pan holds 60 fps; unwindowed control misses', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/timeline-stress.html?scene=desktop');
    const r = await run(page, 'desktop');
    console.log(`tlg-pan desktop ${JSON.stringify(r)} machine ${machine} (LOCAL)`);
    expect(r.maxMounted).toBeLessThanOrEqual(1_200);
    expect(r.emptyFrames).toBe(0);
    expect(r.fps).toBeGreaterThanOrEqual(60);
    expect(r.worstMs).toBeLessThanOrEqual(20);
    const control = await run(page, 'unwindowed');
    console.log(`tlg-pan desktop-unwindowed ${JSON.stringify(control)} machine ${machine} (LOCAL)`);
    expect(control.maxMounted).toBeGreaterThan(10_000); // the control really mounted every bar
    expect(control.worstMs > 20 || control.fps < 60).toBe(true); // 29.300 control
  });
});

test.describe('29.301 Pixel 7 proxy', () => {
  test.use({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.625, isMobile: true, hasTouch: true });
  test('29.301 600 bars, 30 fps, worst 50 ms; scrollY unchanged after a wheel and a touch drag over the scroller at its end; control: the same wheel outside it scrolls the page', async ({ page, context }) => {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await page.goto('/timeline-stress.html?scene=phone');
    const r = await run(page, 'phone');
    console.log(`tlg-pan phone ${JSON.stringify(r)} machine ${machine} (LOCAL, 4x CPU throttle)`);
    expect(r.maxMounted).toBeLessThanOrEqual(600);
    expect(r.maxMounted).toBeGreaterThan(300); // the scene is dense enough to load the painter near its cap
    expect(r.emptyFrames).toBe(0);
    expect(r.fps).toBeGreaterThanOrEqual(30);
    expect(r.worstMs).toBeLessThanOrEqual(50);
    expect(r.scrollYAfter).toBe(r.scrollYBefore);
    // the page CAN scroll (the stage is `innerHeight - 120` px tall, then `#tlg-outside`, 120 px, then 2,000 px of page), so the legs below can fail
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(915);
    // The scroller at its END: a wheel or a drag that it cannot take would chain to the page unless `overscroll-behavior: contain`
    // stops it (a scroller with room left takes the scroll itself, and the leg would pass with or without the defence).
    await page.evaluate(() => { const s = document.getElementById('tlg-stage') as HTMLElement; s.scrollTop = s.scrollHeight; });
    expect(await page.evaluate(() => { const s = document.getElementById('tlg-stage') as HTMLElement; return s.scrollTop > 0 && s.scrollTop + s.clientHeight >= s.scrollHeight - 1; })).toBe(true);
    await page.mouse.move(200, 400);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(300); // `mouse.wheel` does not wait for the scroll; the control below proves 300 ms is long enough to see one
    expect(await page.evaluate(() => scrollY)).toBe(r.scrollYBefore);
    // a touch DRAG, finger moving up (content down), over the canvas; E8 FD-2: a CDP touchMove lands a frame later
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 600 }] });
    for (let k = 1; k <= 5; k++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 600 - (400 * k) / 5 }] });
      await twoFrames(page);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => scrollY)).toBe(r.scrollYBefore);
    // control: the same wheel over `#tlg-outside` (not the canvas) does scroll the page
    await page.mouse.move(200, 860);
    await page.mouse.wheel(0, 600);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => scrollY)).toBeGreaterThan(r.scrollYBefore);
  });
});
