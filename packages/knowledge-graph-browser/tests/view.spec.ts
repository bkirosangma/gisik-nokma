import { devices, expect, test, type Page } from '@playwright/test';
import { waitStill } from './helpers.js';

/*
 * The VIEW on the real Sigma adapter (KG-C T7; cases 27.320 browser half, 27.325, 27.327–27.329): `harness/main.tsx`
 * renders `KnowledgeGraph` on the fixture, centred on GN-142, with the probe on. Every wait is for the camera to settle.
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
const box = (page: Page, sel: string) => page.evaluate((s) => {
  const r = document.querySelector(s)!.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}, sel);

test('27.320 browser: the canvas keeps its box from the first paint (the skeleton still showing) to the settled graph: no layout shift', async ({ page }) => {
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/index.html?delay=500');
  await page.waitForSelector('.gn-kg__canvas');
  const loading = await page.evaluate(() => document.querySelector('.gn-kg__skeleton') !== null);
  const before = await box(page, '.gn-kg__canvas');
  expect(loading).toBe(true); // read while ring 1 is still out, or both reads land after the answer
  expect(before.height).toBeGreaterThan(300); // the canvas's own height, not a collapsed placeholder
  await page.waitForFunction(() => window.__kgView?.probe !== null && window.__kgView?.zones !== null, null, { timeout: 60_000 });
  await stillView(page);
  expect(await page.evaluate(() => document.querySelector('.gn-kg__skeleton'))).toBeNull();
  expect(await box(page, '.gn-kg__canvas')).toEqual(before);
});

const TAGS = ['tag|concept:c1|ticket:t142', 'tag|concept:c1|ticket:t151', 'tag|concept:c1|ticket:t139', 'tag|concept:c1|note:n2'];
const conceptsDrawn = (page: Page) => page.evaluate((tags) => {
  const p = window.__kgView.probe!;
  return { nodes: ['concept:c1', 'concept:c2'].filter((r) => p.nodeDisplay(r) !== null), edges: tags.filter((id) => p.edgeDisplay(id) !== null) };
}, TAGS);

test('27.325 the semantic switch: Off removes every concept and tag edge and the Concepts chip, is remembered across a reload; control: On draws concept:c1 again', async ({ page }) => {
  await openView(page);
  const on = await conceptsDrawn(page);
  expect(on.nodes).toContain('concept:c1');
  expect(on.edges.length).toBeGreaterThan(0); // or "gone" below holds of nothing
  await page.getByRole('tab', { name: 'Off' }).click();
  await stillView(page);
  expect(await conceptsDrawn(page)).toEqual({ nodes: [], edges: [] });
  await expect(page.getByRole('button', { name: /^Concepts/ })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('gn-kg-semantic'))).toBe('off');
  await page.reload();
  await page.waitForFunction(() => window.__kgView?.probe !== null && window.__kgView?.zones !== null, null, { timeout: 60_000 });
  await stillView(page);
  await expect(page.getByRole('tab', { name: 'Off' })).toHaveAttribute('aria-selected', 'true');
  expect(await conceptsDrawn(page)).toEqual({ nodes: [], edges: [] });
  await page.getByRole('tab', { name: 'On' }).click();
  await stillView(page);
  expect((await conceptsDrawn(page)).nodes).toContain('concept:c1');
  await expect(page.getByRole('button', { name: /^Concepts/ })).toHaveCount(1);
});

const opacities = (page: Page) => page.evaluate(() => {
  const p = window.__kgView.probe!;
  return { t142: p.nodeDisplay('ticket:t142')!.opacity, t160: p.nodeDisplay('ticket:t160')!.opacity, t118: p.nodeDisplay('ticket:t118')!.opacity, edge: p.edgeDisplay('parent|ticket:t118|ticket:t142')!.opacity };
});

test('27.327 Home\'s highlight: lit items 1, the rest 0.25, edges 0.12, and a hover keeps it; onZones reported the clear set; control: with no highlight the same hover dims to 0.32', async ({ page }) => {
  await openView(page, '?hl=ticket:t142,ticket:t160');
  expect(await opacities(page)).toEqual({ t142: 1, t160: 1, t118: 0.25, edge: 0.12 });
  expect(await page.evaluate(() => [...window.__kgView.zones!.clear].includes('ticket:t142'))).toBe(true);
  const t133 = await pointOf(page, 'ticket:t133');
  await page.mouse.move(t133.x, t133.y);
  await stillView(page);
  expect((await opacities(page)).t118).toBe(0.25); // GN-118 is not GN-133's neighbour: the highlight wins over the hover's 0.32
  // control: no highlight, the same hover
  await openView(page);
  const again = await pointOf(page, 'ticket:t133');
  await page.mouse.move(again.x, again.y);
  await stillView(page);
  expect((await opacities(page)).t118).toBe(0.32);
});

test.describe('27.328 the phone (§5)', () => {
  // Pixel 7 minus defaultBrowserType, which a describe may not set (the project's SwiftShader Chromium stays)
  const { defaultBrowserType: _browser, ...pixel7 } = devices['Pixel 7'];
  test.use(pixel7);
  /** GN-142's ring 1 in the fixture's `gn` scope, read off its raw edge table (roles/mut-out/kg-c-t7-view/oracle.py). */
  const RING1 = ['concept:c1', 'note:n1', 'note:n2', 'person:pA', 'person:pT', 'ticket:t118', 'ticket:t133', 'ticket:t139', 'ticket:t149', 'ticket:t151', 'ticket:t160'];

  test('27.328 no sideways scroll, no Hops, the bar folds into Scope and links, N linked, one hop clear, the canvas keeps pinches, and a hop-1 label is a 32 px target', async ({ page }) => {
    await openView(page, '?config=phone');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.getByRole('tablist', { name: 'Hops' })).toHaveCount(0);
    expect(await page.evaluate(() => document.querySelector('details.gn-kg__fold > summary')?.textContent?.startsWith('Scope and links'))).toBe(true);
    await expect(page.locator('.gn-kg__count')).toHaveText(/^\d+ linked/);
    const clear = await page.evaluate(() => [...window.__kgView.zones!.clear]);
    expect(clear.filter((r) => RING1.includes(r)).length).toBeGreaterThan(0); // at least one hop-1 item, or the next line holds of an empty canvas
    expect(clear.filter((r) => r !== 'ticket:t142' && !RING1.includes(r))).toEqual([]);
    const css = await page.evaluate(() => {
      const s = getComputedStyle(document.querySelector('.gn-kg__canvas')!);
      return { touch: s.touchAction, over: s.overscrollBehavior };
    });
    expect(css).toEqual({ touch: 'none', over: 'contain' });
    // GN-160's label box (a 'tap' chip, label to the right): the inked run through its centre row, at three x inside the label
    // past the node square; the smallest of the three (an edge crossing one column cannot lengthen all three)
    const run = await page.evaluate(() => {
      const p = window.__kgView.probe!;
      const c = p.viewportOf('ticket:t160')!;
      const runs = [22, 30, 38].map((dx) => {
        const ys = Array.from({ length: 81 }, (_, i) => c.y - 40 + i);
        const a = p.alphaAt(ys.map((y) => ({ x: c.x + dx, y })));
        let lo = 40, hi = 40;
        if (a[40] === 0) return 0;
        while (lo > 0 && a[lo - 1]! > 0) lo -= 1;
        while (hi < 80 && a[hi + 1]! > 0) hi += 1;
        return hi - lo + 1;
      });
      return Math.min(...runs);
    });
    expect(run).toBeGreaterThanOrEqual(32);
    expect(run).toBeLessThan(48);
  });
});

test('27.328 control: the desktop page shows the Hops control', async ({ page }) => {
  await openView(page);
  await expect(page.getByRole('tablist', { name: 'Hops' })).toHaveCount(1);
});

test('27.329 the edge tooltip: the sentence inside the canvas, clamped at the right edge, gone on leaving; control: it follows the pointer', async ({ page }) => {
  await openView(page);
  const tip = page.getByRole('tooltip');
  const along = async (t: number) => {
    const a = await pointOf(page, 'ticket:t133'), b = await pointOf(page, 'ticket:t142');
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  };
  const m = await along(0.5);
  await page.mouse.move(m.x, m.y);
  await expect(tip).toHaveText('GN-133 blocks GN-142');
  const canvas = await box(page, '.gn-kg__canvas');
  const t1 = await box(page, '.gn-kg__tip');
  expect(t1.left).toBeGreaterThanOrEqual(canvas.left);
  expect(t1.right).toBeLessThanOrEqual(canvas.right);
  expect(t1.top).toBeGreaterThanOrEqual(canvas.top);
  // control: a second point on the same edge moves the tip
  const m2 = await along(0.4);
  await page.mouse.move(m2.x, m2.y);
  await expect(tip).toHaveText('GN-133 blocks GN-142');
  const t2 = await box(page, '.gn-kg__tip');
  expect(t2.left !== t1.left || t2.top !== t1.top).toBe(true);
  // leaving: an empty corner of the canvas
  await page.mouse.move(canvas.left + 6, canvas.bottom - 60);
  await expect(tip).toHaveCount(0);
  // and leaving the canvas straight off the edge (above it, into the bar)
  await page.mouse.move(m.x, m.y);
  await expect(tip).toHaveText('GN-133 blocks GN-142');
  await page.mouse.move(m.x, canvas.top - 4);
  await expect(tip).toHaveCount(0);
  // pan the edge's midpoint to 20 px inside the canvas's right edge (camera centre moved by the same px), then hover it there
  await page.evaluate(({ target }) => {
    const k = window.__kgView, p = k.probe!;
    const s = document.querySelector('.gn-kg__stage')!.getBoundingClientRect();
    const a = p.viewportOf('ticket:t133')!, b = p.viewportOf('ticket:t142')!;
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const centre = { x: s.width / 2 + (mid.x - (target - s.left)), y: s.height / 2 };
    const n = p.normalise(p.graphAt(centre.x, centre.y));
    k.renderer!.setCamera({ ...p.camera(), x: n.x, y: n.y }, { instant: true });
  }, { target: canvas.right - 20 });
  await stillView(page);
  const near = await along(0.5);
  expect(near.x).toBeGreaterThan(canvas.right - 30); // the precondition: the hover point IS near the right edge
  expect(near.x).toBeLessThan(canvas.right);
  await page.mouse.move(near.x, near.y);
  await expect(tip).toHaveText('GN-133 blocks GN-142');
  const t3 = await box(page, '.gn-kg__tip');
  expect(t3.right).toBeLessThanOrEqual(canvas.right - 8);
});
