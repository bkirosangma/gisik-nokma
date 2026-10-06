import { expect, test, type Page } from '@playwright/test';
import { restoreRegionSpecificity } from './css-controls.js';

/*
 * Home's body in a real browser (kg-walk-fixes-2; the release walk's P2-2, item 2), on `harness/home-page.html`: the
 * web app's REAL `HomeNumbers`, `HomeGraphPlaceholder` and `HomeGraph`, ui.css and globals.css, neo light. Every leg sets
 * a LITERAL viewport width and asserts `window.innerWidth` took it.
 *
 * 27.687: the numbers' placeholders sit in the tiles' own grid, so the swap to numbers moves nothing: with the read held,
 *   the grid's height and the graph placeholder's top are read, the read is released, and both read again; equal within
 *   1px, and the layout-shift entries recorded from the release sum below 0.01. CONTROL, same leg on a fresh load: ui.css's
 *   region rule given back its old specificity (`.gn-skeleton-region`, not `:where()`; item 5, 27.695), the placeholders
 *   stack and the release moves the graph.
 */

declare global {
  interface Window {
    __cls: number;
  }
}

async function open(page: Page, width: number, query = ''): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/home-page.html${query}`);
  // Vite may discover a dependency on a fresh cache and reload the page once: read nothing before the load that sticks.
  await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => window.innerWidth), 'the literal viewport width took').toBe(width);
}

/** The numbers grid's box and the graph placeholder's top: what the release must not move. */
function layout(page: Page): Promise<{ height: number; graphTop: number; display: string; columns: number }> {
  return page.evaluate(() => {
    const grid = document.querySelector<HTMLElement>('.gn-home__numbers')!;
    const style = getComputedStyle(grid);
    return {
      height: grid.getBoundingClientRect().height,
      graphTop: document.querySelector('.gn-home__graph-placeholder')!.getBoundingClientRect().top,
      display: style.display,
      columns: style.gridTemplateColumns.split(' ').filter(Boolean).length,
    };
  });
}

/** Opens Home with the numbers read held and the scope held (the graph stays its placeholder), lets the page settle, and
 *  starts summing layout shifts from zero. */
async function openHeld(page: Page, width: number, oldSpecificity: boolean): Promise<void> {
  // Once per document: a second `openHeld` in the same it() adds the script again, and two observers would count twice.
  await page.addInitScript(() => {
    const flags = window as unknown as Record<string, unknown>;
    if (flags['__clsObserved'] === true) return;
    flags['__clsObserved'] = true;
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
        if (!entry.hadRecentInput) window.__cls += entry.value;
      }
    }).observe({ type: 'layout-shift', buffered: true });
  });
  await open(page, width, '?numbers=held&scope=held');
  await expect(page.locator('.gn-home__numbers.gn-skeleton-region')).toBeVisible();
  await expect(page.locator('.gn-home__graph-placeholder')).toBeVisible();
  if (oldSpecificity) expect(await restoreRegionSpecificity(page), "the region rule's old specificity was restored").toBe(1);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.__cls = 0;
  });
}

/** Releases the read, waits for the six tiles and two frames, and returns the layout and the shift sum since `openHeld`. */
async function release(page: Page): Promise<{ height: number; graphTop: number; display: string; columns: number; cls: number }> {
  await page.evaluate(() => window.__home.release());
  await expect(page.locator('.gn-home__numbers .gn-home__number-value')).toHaveCount(6);
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  await page.waitForTimeout(300);
  return { ...(await layout(page)), cls: await page.evaluate(() => window.__cls) };
}

for (const width of [1280, 360] as const) {
  test(`27.687 at a literal ${width}px the numbers' placeholders hold the tiles' grid: the release moves nothing (CLS < 0.01); CONTROL: the region rule at its old specificity, it does`, async ({ page }) => {
    // CONTROL first, on its own load: the region rule at its old (0,1,0), the placeholders take its `display: block` and stack.
    await openHeld(page, width, true);
    const bareHeld = await layout(page);
    expect(bareHeld.display, 'CONTROL: the region is a block under the old specificity').toBe('block');
    const bare = await release(page);
    expect(Math.abs(bare.graphTop - bareHeld.graphTop), 'CONTROL: the release moves the graph placeholder').toBeGreaterThan(1);
    expect(bare.cls, 'CONTROL: and the shift is counted').toBeGreaterThanOrEqual(0.01);

    // The product.
    await openHeld(page, width, false);
    const held = await layout(page);
    expect(held.display, 'the placeholders sit in a grid').toBe('grid');
    const shown = await release(page);
    expect(shown.display).toBe('grid');
    expect(held.columns, "the placeholder grid has the tiles' columns").toBe(shown.columns);
    expect(Math.abs(shown.height - held.height), 'the grid keeps its height through the release (≤ 1px)').toBeLessThanOrEqual(1);
    expect(Math.abs(shown.graphTop - held.graphTop), 'the graph placeholder does not move (≤ 1px)').toBeLessThanOrEqual(1);
    expect(shown.cls, 'the layout shifts from the release sum below 0.01').toBeLessThan(0.01);
  });
}
