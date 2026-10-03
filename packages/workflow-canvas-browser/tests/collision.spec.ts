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
  // nothing is persisted before the first edit: NaN reads as "not moved" instead of a TypeError
  return ((await readDraftPositions(page)) as Record<string, { x: number; y: number }> | undefined)?.[id] ?? { x: NaN, y: NaN };
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
async function boxOfNode(page: Page, id: string): Promise<Flow> {
  const b = (await page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox())!;
  const v = await viewport(page);
  return { x: (b.x - v.tx) / v.zoom, y: (b.y - v.ty) / v.zoom, width: b.width / v.zoom, height: b.height / v.zoom };
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
  // control: 100 screen px down lines up with no edge of any state (40 put A's top on the Any state node's bottom edge)
  await page.mouse.move(p.x, p.y + 100, { steps: 30 });
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
  // control: down into the free row below, no Alt (90 flow px right: no edge of another state is within the guide threshold of it)
  let p = await pickUp(page, A);
  await page.mouse.move(p.x + 90 * zoom, p.y + 250, { steps: 40 });
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
  // an arrow key during the cancelled gesture: the gesture is still ACTIVE (cancelled, not ended), so neither this key nor React Flow's
  // drag-end change on release is a nudge. (A hook that forgot the gesture on Escape would read both as one and commit +16.)
  await page.keyboard.press('ArrowRight');
  await page.mouse.up();
  // React Flow's drag-end change (dragging: false) must not be read as a nudge either
  expect(await readDraftPositions(page)).toEqual(before);
  const after = await flowBox(page, A);
  expect(Math.abs(after.x - start.x) + Math.abs(after.y - start.y)).toBeLessThan(1);
});

test('25.526 an arrow moves a state exactly 16 px (1 with Alt) on ONE axis or not at all: into a neighbour it changes nothing and announces who blocks it; a state that starts inside a neighbour can still be nudged out', async ({ page }) => {
  await openHarness(page);
  const live = page.locator('[aria-live="polite"]');
  await expect(live).toBeAttached();
  await node(page, A).locator('.gn-state-node__name').click();
  const x0 = (await flowBox(page, A)).x;
  // control: arrows step exactly 16 on x (dy 0) until the next step would break the 8 px gap, then the press is blocked
  let flush = await draftOf(page, A);
  let moves = 0;
  for (let i = 0; i < 12; i++) {
    const before = await draftOf(page, A);
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => (await draftOf(page, A)).x !== before.x || /Blocked by/.test((await live.textContent()) ?? '')).toBe(true);
    const after = await draftOf(page, A);
    if (after.x === before.x) break;
    expect(after.x - before.x).toBeCloseTo(16, 2);
    expect(after.y).toBe(before.y);
    await expect(live).not.toContainText('Blocked by');
    flush = after;
    moves++;
  }
  expect(moves).toBeGreaterThan(0);
  expect(flush.x).toBeCloseTo(x0 + 16 * moves, 1);
  await expect(live).toContainText('Blocked by Doing');
  const box = await flowBox(page, A);
  expect(gap(box, await flowBox(page, B))).toBeGreaterThanOrEqual(8 - 0.6);
  // blocked: twice, so React Flow's own 5 px drift in its store cannot show either
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('ArrowRight');
    await expect(live).toContainText('Blocked by Doing');
    expect(await draftOf(page, A)).toEqual(flush);
    const now = await flowBox(page, A);
    expect(Math.abs(now.x - box.x) + Math.abs(now.y - box.y)).toBeLessThan(0.6);
  }
  // React Flow's own 5 px steps were dropped, not kept in its store: it starts the next drag from ITS position of the node. Alt keeps the
  // grid and guides out of the way, so a straight drag down must leave x exactly where the blocked state stood.
  const { zoom } = await viewport(page);
  await page.keyboard.down('Alt');
  const n = (await node(page, A).locator('.gn-state-node__name').boundingBox())!;
  await page.mouse.move(n.x + n.width / 2, n.y + n.height / 2);
  await page.mouse.down();
  await page.mouse.move(n.x + n.width / 2 + 5, n.y + n.height / 2, { steps: 5 });
  await page.mouse.move(n.x + n.width / 2 + 5, n.y + n.height / 2 + 100 * zoom, { steps: 20 });
  await page.mouse.up();
  await page.keyboard.up('Alt');
  const dragged = await flowBox(page, A);
  expect(Math.abs(dragged.x - box.x)).toBeLessThan(0.6);
  expect(dragged.y - box.y).toBeGreaterThan(90);

  // never diagonal (spec §3.3): with "To do" just above-left of Doing, so its bottom plus the gap overlaps Doing's top by ~4 flow px,
  // an arrow that is blocked must NOT slide the state up along the neighbour's edge (the drag's clamp does; a key must not)
  await openHarness(page);
  const a0 = await flowBox(page, A);
  const b0 = await flowBox(page, B);
  await node(page, A).locator('.gn-state-node__name').click();
  let up = Math.round(a0.y - (b0.y - a0.height - 8 + 4));
  for (; up >= 16; up -= 16) await page.keyboard.press('ArrowUp');
  await page.keyboard.down('Alt');
  for (; up > 0; up -= 1) await page.keyboard.press('ArrowUp');
  await page.keyboard.up('Alt');
  await expect.poll(async () => (await flowBox(page, A)).y).toBeCloseTo(b0.y - a0.height - 8 + 4, 0);
  const steps: Array<{ dx: number; dy: number }> = [];
  let prev = await flowBox(page, A);
  let sawBlocked = false;
  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);
    const now = await flowBox(page, A);
    steps.push({ dx: +(now.x - prev.x).toFixed(2), dy: +(now.y - prev.y).toFixed(2) });
    if (Math.abs(now.x - prev.x) < 0.6) {
      await expect(live).toContainText('Blocked by Doing');
      sawBlocked = true;
    }
    prev = now;
  }
  for (const step of steps) {
    expect(Math.abs(step.dy), `no vertical drift ${JSON.stringify(steps)}`).toBeLessThan(0.6);
    expect([0, 16].some((d) => Math.abs(step.dx - d) < 0.6), `dx is 0 or 16 ${JSON.stringify(steps)}`).toBe(true);
  }
  expect(sawBlocked, `a blocked press happened ${JSON.stringify(steps)}`).toBe(true);

  // a state that STARTS inside a neighbour (a template's 140 px rows, states ~200 px tall) is not trapped: it can be nudged OUT by
  // exactly 16 (1 with Alt) with dy = 0, while a step deeper into the neighbour is blocked
  await openHarness(page, { seed: 'errand-with-waits' });
  const names = await page.locator('.react-flow__node .gn-state-node__name').allTextContents();
  const boxes = new Map<string, Flow>();
  for (const name of names) boxes.set(name, await flowBox(page, name));
  const partners = (a: string) => names.filter((b) => b !== a && gap(boxes.get(a)!, boxes.get(b)!) < 8);
  const inner = names.find((a) => partners(a).length === 1);
  expect(inner, 'errand-with-waits opens with a state that overlaps exactly one neighbour').toBeDefined();
  const [outer] = partners(inner!);
  const a = boxes.get(inner!)!;
  const o = boxes.get(outer!)!;
  // how far the state must move each way to clear the neighbour by the gap: the smallest is the way OUT, the opposite is deeper in
  const pushes = { ArrowRight: o.x + o.width + 8 - a.x, ArrowLeft: a.x + a.width + 8 - o.x, ArrowDown: o.y + o.height + 8 - a.y, ArrowUp: a.y + a.height + 8 - o.y };
  const [away] = Object.entries(pushes).sort((p, q) => p[1] - q[1])[0]! as [keyof typeof pushes, number];
  const toward = { ArrowRight: 'ArrowLeft', ArrowLeft: 'ArrowRight', ArrowDown: 'ArrowUp', ArrowUp: 'ArrowDown' }[away] as keyof typeof pushes;
  expect(pushes[toward] - 16, 'a 16 px step toward still overlaps, and deeper').toBeGreaterThan(pushes[away]);
  const along = away === 'ArrowLeft' || away === 'ArrowRight' ? 'x' : 'y';
  const across = along === 'x' ? 'y' : 'x';
  const sign = away === 'ArrowLeft' || away === 'ArrowUp' ? -1 : 1;
  await node(page, inner!).locator('.gn-state-node__name').click();
  const start = await draftOf(page, inner!);
  await page.keyboard.press(toward);
  await expect(live).toContainText(`Blocked by ${outer}`);
  expect(await draftOf(page, inner!)).toEqual(start);
  await page.keyboard.press(away);
  await expect.poll(async () => (await draftOf(page, inner!))[along]).toBeCloseTo(start[along] + sign * 16, 2);
  expect((await draftOf(page, inner!))[across]).toBe(start[across]);
  await page.keyboard.down('Alt');
  await page.keyboard.press(away);
  await page.keyboard.up('Alt');
  await expect.poll(async () => (await draftOf(page, inner!))[along]).toBeCloseTo(start[along] + sign * 17, 2);
  expect((await draftOf(page, inner!))[across]).toBe(start[across]);
});

test('25.527 the Add state button drops the new state clear of every other state, inside the part of the board the author is looking at', async ({ page }) => {
  await openHarness(page);
  const names = ['To do', 'Doing', 'Done'];
  await page.getByRole('button', { name: 'Add state' }).click();
  const added = page.locator('.react-flow__node', { has: page.locator('.gn-state-node__name', { hasText: 'New state' }) });
  await expect(added).toBeVisible();
  const v = await viewport(page);
  const b = (await added.boundingBox())!;
  const box = { x: (b.x - v.tx) / v.zoom, y: (b.y - v.ty) / v.zoom, width: b.width / v.zoom, height: b.height / v.zoom };
  for (const name of names) expect(gap(box, await flowBox(page, name)), `clear of ${name}`).toBeGreaterThanOrEqual(8 - 0.6);
  const pane = (await page.locator('.react-flow__pane').boundingBox())!;
  expect(b.x + b.width / 2).toBeGreaterThan(pane.x);
  expect(b.x + b.width / 2).toBeLessThan(pane.x + pane.width);
  expect(b.y + b.height / 2).toBeGreaterThan(pane.y);
  expect(b.y + b.height / 2).toBeLessThan(pane.y + pane.height);

  // the new state is as big as a REAL state (~200 flow px tall in neo), not the 120 px guess: pan so the centre sits 150 flow px above Doing
  // (a 120 px box fits there with its gap, a real one does not) and add another; it must still clear every state by the gap
  const before = await page.locator('.react-flow__node').evaluateAll((all) => all.map((n) => n.getAttribute('data-id')));
  const doing = await flowBox(page, 'Doing');
  const grid = (await page.locator('.react-flow__pane').boundingBox())!;
  const view = await viewport(page);
  const panX = grid.x + grid.width / 2 - (view.tx + (doing.x + doing.width / 2) * view.zoom);
  const panY = grid.y + grid.height / 2 - (view.ty + (doing.y - 150) * view.zoom);
  await page.mouse.move(grid.x + 20, grid.y + 20);
  await page.mouse.down();
  await page.mouse.move(grid.x + 20 + panX, grid.y + 20 + panY, { steps: 20 });
  await page.mouse.up();
  await page.getByRole('button', { name: 'Add state' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(before.length + 1);
  const fresh = (await page.locator('.react-flow__node').evaluateAll((all) => all.map((n) => n.getAttribute('data-id')))).find((id) => !before.includes(id))!;
  await expect.poll(async () => (await page.locator(`.react-flow__node[data-id="${fresh}"]`).boundingBox())!.height).toBeGreaterThan(150);
  const second = await boxOfNode(page, fresh);
  for (const at of before.filter((id) => id?.startsWith('s:'))) {
    expect(gap(second, await boxOfNode(page, at!)), `clear of ${at}`).toBeGreaterThanOrEqual(8 - 0.6);
  }
});
