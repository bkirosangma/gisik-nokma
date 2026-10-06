import { expect, test, type Page } from '@playwright/test';
import { waitStill } from './helpers.js';

/*
 * The view as the web hosts it (KG-C T9; case 27.342's browser half): `harness/main.tsx?panel=sheet` puts it in the ui `Sheet`
 * inside a `.gn-kg-panel`, as `apps/web/src/knowledge-graph/graph-panel.tsx` does for the ticket tab and the note panel. The
 * sheet is 40rem at any window width while the view picks its two-column body by the VIEWPORT, so the panel rules in
 * `packages/ui/src/ui.css` (`KG: T9 tab+panel`) stack it in one column. Measured from the laid-out boxes, at a desktop
 * viewport (1280 × 720) where the view's own two-column arm is on.
 */
type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
const errors: string[] = [];
test.afterEach(() => {
  expect(errors.splice(0)).toEqual([]);
});

const stillView = (page: Page) => waitStill(page, () => page.evaluate(() => [window.__kgView.probe!.camera(), window.__kgView.probe!.frames()]));
async function openView(page: Page, query: string): Promise<void> {
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/index.html${query}`);
  await page.waitForFunction(() => window.__kgView?.probe !== null && window.__kgView?.zones !== null, null, { timeout: 60_000 });
  await stillView(page);
}
const box = (page: Page, sel: string): Promise<Box> =>
  page.evaluate((s) => {
    const r = document.querySelector(s)!.getBoundingClientRect();
    return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
  }, sel);
/** The view's root, its canvas, its inspector and the keys line and list under them. */
async function layout(page: Page): Promise<{ view: Box; canvas: Box; insp: Box; below: Box }> {
  return { view: await box(page, '.gn-kg'), canvas: await box(page, '.gn-kg__canvas'), insp: await box(page, '.gn-kg-insp'), below: await box(page, '.gn-kg__below') };
}

test('27.342 (browser) in a sheet the panel stacks the view: the canvas is the panel\'s width, the inspector 18px under it, the list 10px under that; control: the same sheet without the panel class keeps the inspector beside a narrow canvas', async ({ page }) => {
  await openView(page, '?panel=sheet');
  const sheet = await box(page, '.gn-sheet');
  expect(sheet.width).toBeCloseTo(640, 0); // 40rem: the sheet, not the 1280px window, is what the view has
  const { view, canvas, insp, below } = await layout(page);
  expect(canvas.width).toBeCloseTo(view.width, 0);
  expect(insp.left).toBeCloseTo(canvas.left, 0);
  expect(insp.top - canvas.bottom).toBeCloseTo(18, 0); // the body's 1.125rem gap
  expect(below.top - insp.bottom).toBeCloseTo(10, 0); // 0.625rem: the view's own one-column stacking
  expect(below.left).toBeCloseTo(canvas.left, 0);

  // CONTROL, same test: the same Sheet without `.gn-kg-panel` is the viewport's two-column body squeezed into 40rem, the
  // inspector (18.75rem) beside a canvas of what is left.
  await openView(page, '?panel=bare');
  const bare = await layout(page);
  expect(bare.view.width).toBeCloseTo(view.width, 0);
  expect(bare.insp.left - bare.canvas.right).toBeCloseTo(18, 0);
  expect(bare.insp.width).toBeCloseTo(300, 0);
  expect(bare.canvas.width).toBeCloseTo(bare.view.width - 300 - 18, 0);
});

test('27.342 (browser) the phone view keeps its own stacking inside the panel; control: the same phone view outside a panel', async ({ page }) => {
  await openView(page, '?config=phone');
  const own = await layout(page);
  expect(own.insp.top - own.canvas.bottom).toBeCloseTo(10, 0);
  expect(own.below.top - own.insp.bottom).toBeCloseTo(10, 0);

  await openView(page, '?config=phone&panel=sheet');
  const inPanel = await layout(page);
  expect(inPanel.canvas.width).toBeCloseTo(inPanel.view.width, 0);
  expect(inPanel.insp.top - inPanel.canvas.bottom).toBeCloseTo(10, 0);
  expect(inPanel.below.top - inPanel.insp.bottom).toBeCloseTo(10, 0);
});

test('27.342 (browser) the loading box is the canvas\'s own height at two window heights, so the panel does not jump by a canvas when the view arrives', async ({ page }) => {
  for (const height of [720, 1100]) {
    await page.setViewportSize({ width: 1280, height });
    await page.goto('/index.html?panel=loading');
    const loading = await box(page, '.gn-kg-panel--loading');
    await openView(page, '?panel=sheet');
    const { canvas } = await layout(page);
    expect(loading.height, `window height ${height}`).toBeCloseTo(canvas.height, 0);
    // CONTROL: the canvas follows the window here (62vh, inside its clamp), so a fixed height could not pass both rounds.
    expect(canvas.height, `window height ${height}`).toBeCloseTo(height * 0.62, 0);
  }
});
