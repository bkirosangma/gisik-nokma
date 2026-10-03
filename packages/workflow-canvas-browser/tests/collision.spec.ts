import { expect, test, type Page } from '@playwright/test';
import { node, openHarness, readDraftPositions } from './helpers';

// G-9 T3 (cases 25.520–25.526). Boxes are compared in FLOW units: the harness opens at a fit zoom of ~0.8 (not 1), so a screen-pixel
// assertion would be about the zoom, not the canvas. The states on the template's one row: "To do" (tall), "Doing" (shorter), "Done" (tall).
type Flow = { x: number; y: number; width: number; height: number };
const A = 'To do';
const B = 'Doing';

async function viewport(page: Page) {
  return page.evaluate(() => {
    const m = new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')!).transform);
    const r = document.querySelector('.react-flow')!.getBoundingClientRect();
    return { zoom: m.a, tx: m.e + r.left, ty: m.f + r.top };
  });
}
async function flowBox(page: Page, name: string): Promise<Flow> {
  const b = (await node(page, name).boundingBox())!;
  const v = await viewport(page);
  return { x: (b.x - v.tx) / v.zoom, y: (b.y - v.ty) / v.zoom, width: b.width / v.zoom, height: b.height / v.zoom };
}
async function draftOf(page: Page, name: string) {
  const id = (await node(page, name).getAttribute('data-id'))!.slice('s:'.length);
  return (await readDraftPositions(page) as Record<string, { x: number; y: number }>)[id]!;
}
const centreX = (b: Flow) => b.x + b.width / 2;
const centreY = (b: Flow) => b.y + b.height / 2;

/**
 * Press on the state's name and make the first 5 px move along x: React Flow measures a drag from the first move past
 * `nodeDragThreshold` 4 px, so the state trails the pointer by that first move on x and by NOTHING on y or after it.
 * Returns the pointer, which now maps 1:1 onto the state.
 */
async function pickUp(page: Page, name: string) {
  const n = (await node(page, name).locator('.gn-state-node__name').boundingBox())!;
  const x = n.x + n.width / 2;
  const y = n.y + n.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 5, y, { steps: 5 });
  return { x: x + 5, y };
}
const gap = (a: Flow, b: Flow) =>
  Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width), b.y - (a.y + a.height), a.y - (b.y + b.height));

test('25.520/25.521 a state dragged into another stops 8 flow px clear of it with a dashed outline where the pointer wants it, and drops where it stands, not at the pointer; control: a free spot shows no outline and lands under the pointer', async ({ page }) => {
  await openHarness(page);
  const { zoom } = await viewport(page);
  const outline = page.locator('.gn-canvas-outline');
  const a0 = await flowBox(page, A);

  // control (25.521): straight down is free
  let p = await pickUp(page, A);
  await page.mouse.move(p.x, p.y + 250, { steps: 50 });
  await expect(outline).toHaveCount(0);
  const free = await flowBox(page, A);
  expect(Math.abs(free.y - a0.y - 250 / zoom)).toBeLessThan(10); // under the pointer, give or take the grid
  await page.mouse.up();
  const freeDraft = await draftOf(page, A);
  expect(Math.abs(freeDraft.y - free.y)).toBeLessThan(0.6);

  // the case (25.520): the pointer carries A's name onto B's centre
  const b = await flowBox(page, B);
  const a1 = await flowBox(page, A);
  p = await pickUp(page, A);
  const to = { x: p.x + (centreX(b) - centreX(a1)) * zoom, y: p.y + (centreY(b) - centreY(a1)) * zoom };
  await page.mouse.move(to.x, to.y, { steps: 60 });
  await expect(outline).toBeVisible();
  const held = await flowBox(page, A);
  expect(gap(held, b)).toBeGreaterThanOrEqual(8 - 0.6);
  expect(gap(held, b)).toBeLessThan(8 + 0.6); // flush on the gap, not thrown clear
  const o = (await outline.boundingBox())!;
  expect(to.x).toBeGreaterThan(o.x - 4);
  expect(to.x).toBeLessThan(o.x + o.width + 4);
  expect(to.y).toBeGreaterThan(o.y - 4);
  expect(to.y).toBeLessThan(o.y + o.height + 4);
  await page.mouse.up();
  await expect(outline).toHaveCount(0);
  const dropped = await flowBox(page, A);
  expect(Math.abs(dropped.x - held.x) + Math.abs(dropped.y - held.y)).toBeLessThan(1);
  const draft = await draftOf(page, A);
  expect(Math.abs(draft.x - held.x)).toBeLessThan(0.6);
  expect(Math.abs(draft.y - held.y)).toBeLessThan(0.6);
  // the pointer's own drop point would have put A's centre on B's
  expect(Math.abs(draft.x - (centreX(b) - held.width / 2)) + Math.abs(draft.y - (centreY(b) - held.height / 2))).toBeGreaterThan(20);
});

test('25.522 a state whose centre comes within a few screen px of another state\'s centre snaps onto it and a guide shows; control: far from every edge there is no guide', async ({ page }) => {
  await openHarness(page);
  const { zoom } = await viewport(page);
  const guide = page.locator('.gn-canvas-guide[data-axis="y"]');
  const b = await flowBox(page, B);
  const a0 = await flowBox(page, A);
  const p = await pickUp(page, A);
  // control: 40 screen px down lines up with no edge of any state
  await page.mouse.move(p.x, p.y + 40, { steps: 20 });
  await expect(page.locator('.gn-canvas-guide')).toHaveCount(0);
  // the case: A's centre 1.5 screen px below B's. (Closer to B's centre than to B's top or bottom, which sit 5.6 flow px off it.)
  await page.mouse.move(p.x, p.y + (centreY(b) - centreY(a0)) * zoom + 1.5, { steps: 20 });
  await expect(guide).toBeVisible();
  const held = await flowBox(page, A);
  expect(Math.abs(centreY(held) - centreY(b))).toBeLessThan(0.6);
  const g = (await guide.boundingBox())!;
  const v = await viewport(page);
  expect(Math.abs((g.y - v.ty) / v.zoom - centreY(b))).toBeLessThan(1);
  await page.mouse.up();
  await expect(page.locator('.gn-canvas-guide')).toHaveCount(0);
  const draft = await draftOf(page, A);
  expect(Math.abs(draft.y + held.height / 2 - centreY(b))).toBeLessThan(0.6);
});

test('25.523 at zoom 0.25 a guide still triggers within 6 SCREEN px, and the dashed outline sits under the pointer', async ({ page }) => {
  await openHarness(page);
  const pane = (await page.locator('.react-flow__pane').boundingBox())!;
  await page.mouse.move(pane.x + pane.width / 2, pane.y + pane.height - 30);
  for (let i = 0; i < 40 && (await viewport(page)).zoom > 0.26; i++) {
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(40);
  }
  const { zoom } = await viewport(page);
  expect(zoom).toBeLessThanOrEqual(0.26);
  const b = await flowBox(page, B);
  const a0 = await flowBox(page, A);
  let p = await pickUp(page, A);
  // 4 screen px = 16 flow px below B's centre: a 6 flow px threshold (zoom fixed at 1) would miss it
  await page.mouse.move(p.x, p.y + (centreY(b) - centreY(a0)) * zoom + 4, { steps: 12 });
  await expect(page.locator('.gn-canvas-guide[data-axis="y"]')).toBeVisible();
  const held = await flowBox(page, A);
  const g = (await page.locator('.gn-canvas-guide[data-axis="y"]').boundingBox())!;
  const v = await viewport(page);
  const at = (g.y - v.ty) / v.zoom;
  expect([held.y, centreY(held), held.y + held.height].some((edge) => Math.abs(edge - at) < 0.6)).toBe(true);
  await page.mouse.up();

  // the outline, onto B's centre
  const a1 = await flowBox(page, A);
  p = await pickUp(page, A);
  const to = { x: p.x + (centreX(b) - centreX(a1)) * zoom, y: p.y + (centreY(b) - centreY(a1)) * zoom };
  await page.mouse.move(to.x, to.y, { steps: 30 });
  const outline = page.locator('.gn-canvas-outline');
  await expect(outline).toBeVisible();
  const o = (await outline.boundingBox())!;
  expect(to.x).toBeGreaterThan(o.x - 3);
  expect(to.x).toBeLessThan(o.x + o.width + 3);
  expect(to.y).toBeGreaterThan(o.y - 3);
  expect(to.y).toBeLessThan(o.y + o.height + 3);
  await page.mouse.up();
});

test('25.524 holding Alt drops the state wherever the pointer leaves it, not on the 16 px grid; control: without Alt it lands on the grid', async ({ page }) => {
  await openHarness(page);
  const { zoom } = await viewport(page);
  // control: two screen-distinct drags down into the free row below, no Alt
  let p = await pickUp(page, A);
  await page.mouse.move(p.x + 37 * zoom, p.y + 250, { steps: 40 });
  await page.mouse.up();
  const grid = await draftOf(page, A);
  expect(Math.abs(grid.x / 16 - Math.round(grid.x / 16))).toBeLessThan(0.01);
  expect(Math.abs(grid.y / 16 - Math.round(grid.y / 16))).toBeLessThan(0.01);
  // the case: the same A, Alt held, 37 flow px further right
  await page.keyboard.down('Alt');
  p = await pickUp(page, A);
  await page.mouse.move(p.x + 37 * zoom, p.y, { steps: 40 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  const free = await draftOf(page, A);
  expect(Math.abs(free.x - grid.x - 37)).toBeLessThan(1);
  const off = Math.abs(free.x / 16 - Math.round(free.x / 16)) * 16;
  expect(off).toBeGreaterThan(2); // 37 is 5 past a multiple of 16
});

/** Tab to the state's node wrapper and press Enter: React Flow's own keyboard selection, which the draft has to hear about too. */
async function focusAndSelect(page: Page, name: string) {
  for (let i = 0; i < 80; i++) {
    await page.keyboard.press('Tab');
    const hit = await page.evaluate(() => {
      const el = document.activeElement;
      return el?.classList.contains('react-flow__node') ? (el.querySelector('.gn-state-node__name')?.textContent ?? null) : null;
    });
    if (hit === name) break;
  }
  await page.keyboard.press('Enter');
}

test('25.525 an arrow moves the focused state one grid step and Alt+arrow one px, through the draft; Escape during a drag clears the guides and the outline and the release commits nothing', async ({ page }) => {
  await openHarness(page);
  await focusAndSelect(page, A);
  const x0 = (await flowBox(page, A)).x; // nothing is persisted before the first edit
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await draftOf(page, A)).x).toBeCloseTo(x0 + 16, 2);
  await page.keyboard.down('Alt');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.up('Alt');
  await expect.poll(async () => (await draftOf(page, A)).x).toBeCloseTo(x0 + 17, 2);

  // Escape: show the outline FIRST (the control that makes "gone" mean something), then cancel
  const { zoom } = await viewport(page);
  const b = await flowBox(page, B);
  const before = await readDraftPositions(page);
  const start = await flowBox(page, A);
  const p = await pickUp(page, A);
  await page.mouse.move(p.x + (centreX(b) - centreX(start)) * zoom, p.y + (centreY(b) - centreY(start)) * zoom, { steps: 40 });
  await expect(page.locator('.gn-canvas-outline')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.gn-canvas-outline')).toHaveCount(0);
  await expect(page.locator('.gn-canvas-guide')).toHaveCount(0);
  // React Flow still tracks the pointer; a cancelled gesture must not light the overlays again (onto B, then across B's centre line)
  await page.mouse.move(p.x + (centreX(b) - centreX(start)) * zoom + 6, p.y + (centreY(b) - centreY(start)) * zoom + 6, { steps: 8 });
  await page.mouse.move(p.x + 300, p.y + (centreY(b) - centreY(start)) * zoom + 1.5, { steps: 20 });
  await expect(page.locator('.gn-canvas-outline')).toHaveCount(0);
  await expect(page.locator('.gn-canvas-guide')).toHaveCount(0);
  await page.mouse.up();
  // React Flow's drag-end change (dragging: false) must not be read as a nudge either
  expect(await readDraftPositions(page)).toEqual(before);
  const after = await flowBox(page, A);
  expect(Math.abs(after.x - start.x) + Math.abs(after.y - start.y)).toBeLessThan(1);
});

test('25.526 an arrow that would push the state into its neighbour changes nothing and announces who blocks it; control: the arrows before it moved the state', async ({ page }) => {
  await openHarness(page);
  const live = page.locator('[aria-live="polite"]');
  await expect(live).toBeAttached();
  await node(page, A).locator('.gn-state-node__name').click();
  const x0 = (await flowBox(page, A)).x;
  await page.keyboard.press('ArrowRight');
  await expect.poll(async () => (await draftOf(page, A)).x).toBeCloseTo(x0 + 16, 2);
  await page.keyboard.press('ArrowRight'); // 16 more would overlap B's gap: the clamp stops it flush, a step short
  await expect.poll(async () => (await draftOf(page, A)).x).toBeGreaterThan(x0 + 16.5);
  await expect(live).not.toContainText('Blocked by');
  const flush = await draftOf(page, A);
  const box = await flowBox(page, A);
  expect(gap(box, await flowBox(page, B))).toBeLessThan(8 + 0.6);
  // blocked: twice, so React Flow's own 5 px drift in its store cannot show either
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('ArrowRight');
    await expect(live).toContainText('Blocked by Doing');
    expect(await draftOf(page, A)).toEqual(flush);
    const now = await flowBox(page, A);
    expect(Math.abs(now.x - box.x) + Math.abs(now.y - box.y)).toBeLessThan(0.6);
  }
});
