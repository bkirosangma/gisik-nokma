import { expect, test, type Page } from '@playwright/test';
import { openAdapter, pageErrors, pagePoint, stageAt, still, takePageErrors } from './helpers.js';

/*
 * The camera on the REAL adapter (`harness/adapter.html`): the wheel, the trackpad and touch gestures, the fit, the glide
 * and reduced motion, measured as `sigtest.cjs` did against the mockup. One test() per case; its control lives inside it.
 */

// an uncaught page error fails every case: a throw inside a rAF callback kills the camera driver and shows nothing else (27.285)
test.afterEach(() => expect(takePageErrors()).toEqual([]));

const camera = (page: Page) => page.evaluate(() => window.__kg.probe!.camera());
const frames = (page: Page) => page.evaluate(() => window.__kg.probe!.frames());

/** The minimum zoom ratio the camera passes through from now on (the rubber band's peak). */
async function trackPeak(page: Page): Promise<() => Promise<number>> {
  await page.evaluate(() => {
    const w = window as unknown as { __peak: number };
    w.__peak = Infinity;
    window.__kg.renderer.onCamera((s) => (w.__peak = Math.min(w.__peak, s.ratio)));
  });
  return () => page.evaluate(() => (window as unknown as { __peak: number }).__peak);
}

test('27.272 trap 7: a notched wheel over the graph zooms about the pointer by its own amount, anchors a mid-glide notch on the target camera and never scrolls the page; control: the same wheel outside the graph scrolls it', async ({ page }) => {
  await openAdapter(page);
  const s = await stageAt(page);
  const at = { x: s.left + s.width * 0.3, y: s.top + s.height * 0.35 };
  const r0 = (await camera(page)).ratio;
  const g0 = await page.evaluate(({ x, y }) => window.__kg.probe!.graphAt(x, y), { x: at.x - s.left, y: at.y - s.top });
  const f0 = await frames(page);
  expect(await page.evaluate(() => scrollY)).toBe(0);
  await page.mouse.move(at.x, at.y);
  for (let i = 0; i < 3; i += 1) {
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(16);
  }
  await still(page);
  const g1 = await page.evaluate(({ x, y }) => window.__kg.probe!.graphAt(x, y), { x: at.x - s.left, y: at.y - s.top });
  expect(await page.evaluate(() => scrollY)).toBe(0);
  expect((await camera(page)).ratio).toBeLessThan(r0 * 0.75);
  expect(Math.hypot(g1.x - g0.x, g1.y - g0.y)).toBeLessThan(2); // the point under the cursor stayed put
  expect((await frames(page)) - f0).toBeGreaterThanOrEqual(8); // it eased, it did not jump
  // the amount: a notch of deltaY -100 is exp(0.0022 × 100) (`engine/wheel.ts`); Sigma's own fixed-step zoom, left
  // uncancelled, would add to it
  expect(Math.abs((await camera(page)).ratio / (r0 / Math.exp(3 * 0.22)) - 1)).toBeLessThan(0.01);
  // trap 8's anchor: a notch that lands mid-glide anchors on the TARGET camera, so two notches at two points end on the
  // same camera whether the camera rested between them or not
  const twoNotches = async (rest: boolean) => {
    await page.evaluate(() => window.__kg.renderer.setCamera('fit', { instant: true }));
    await still(page);
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, -100);
    if (rest) await still(page);
    await page.mouse.move(at.x + 260, at.y + 120);
    await page.mouse.wheel(0, -100);
    await still(page);
    return camera(page);
  };
  const rested = await twoNotches(true), quick = await twoNotches(false);
  expect(quick.ratio).toBeCloseTo(rested.ratio, 6);
  expect(quick.x).toBeCloseTo(rested.x, 6);
  expect(quick.y).toBeCloseTo(rested.y, 6);
  // control: three wheels over the page OUTSIDE the graph do scroll it (downwards: at scrollY 0 an upward wheel has nowhere to go)
  const below = await page.evaluate(() => {
    const r = document.getElementById('below')!.getBoundingClientRect();
    return { x: r.left + 20, y: r.top + r.height / 2 };
  });
  await page.mouse.move(below.x, below.y);
  for (let i = 0; i < 3; i += 1) {
    await page.mouse.wheel(0, 100);
    await page.waitForTimeout(16);
  }
  await page.waitForFunction(() => scrollY > 0);
});

test('27.273 a two-finger scroll pans the way a page scrolls, without zooming; control: a notched wheel at the same spot zooms', async ({ page }) => {
  await openAdapter(page);
  const s = await stageAt(page);
  const at = { x: s.left + s.width * 0.5, y: s.top + s.height * 0.5 };
  const c0 = await camera(page);
  const p0 = await page.evaluate(() => window.__kg.probe!.viewportOf('ticket:t142')!);
  await page.mouse.move(at.x, at.y);
  for (let i = 0; i < 6; i += 1) {
    await page.mouse.wheel(14, 9);
    await page.waitForTimeout(16);
  }
  await still(page);
  const c1 = await camera(page);
  const p1 = await page.evaluate(() => window.__kg.probe!.viewportOf('ticket:t142')!);
  expect(Math.abs(c1.ratio / c0.ratio - 1)).toBeLessThan(0.01);
  expect(Math.hypot(c1.x - c0.x, c1.y - c0.y)).toBeGreaterThan(0.01);
  expect(p1.x).toBeLessThan(p0.x); // the content moved left and up, as a page does when scrolled right and down
  expect(p1.y).toBeLessThan(p0.y);
  await page.mouse.wheel(0, -100);
  await still(page);
  expect(Math.abs((await camera(page)).ratio / c1.ratio - 1)).toBeGreaterThan(0.05); // control
});

test('27.274 a pinch (ctrl+wheel) zooms, rubber-bands past 4× and springs back to the limit; control: the peak really passed the limit', async ({ page }) => {
  await openAdapter(page);
  const s = await stageAt(page);
  await page.mouse.move(s.left + s.width * 0.5, s.top + s.height * 0.5);
  const fit = await page.evaluate(() => window.__kg.probe!.fitRatio());
  const r0 = (await camera(page)).ratio;
  await page.keyboard.down('Control');
  for (let i = 0; i < 5; i += 1) {
    await page.mouse.wheel(0, -8);
    await page.waitForTimeout(16);
  }
  await still(page);
  expect((await camera(page)).ratio).toBeLessThan(r0); // a pinch zooms in
  const peak = await trackPeak(page);
  for (let i = 0; i < 25; i += 1) {
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(16);
  }
  await page.keyboard.up('Control');
  await still(page);
  expect(await peak()).toBeLessThan((fit / 4) * 0.98); // control: the rubber band let it past the limit
  expect(Math.abs((await camera(page)).ratio / (fit / 4) - 1)).toBeLessThan(0.01); // and it sprang back to the limit
});

test('27.275 a touch pinch zooms (Sigma\'s own touch handling, undisturbed by the driver); control: a one-finger drag of the same length does not', async ({ browser }) => {
  const context = await browser.newContext({ hasTouch: true, viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  await openAdapter(page);
  const s = await stageAt(page);
  const cx = s.left + s.width / 2, cy = s.top + s.height / 2;
  const cdp = await context.newCDPSession(page);
  const touch = async (type: 'touchStart' | 'touchMove' | 'touchEnd', points: { x: number; y: number }[]) => {
    await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map((p, id) => ({ x: p.x, y: p.y, id })) });
  };
  const r0 = (await camera(page)).ratio;
  // one finger, 160 px, as the control
  await touch('touchStart', [{ x: cx - 80, y: cy }]);
  for (let i = 1; i <= 10; i += 1) await touch('touchMove', [{ x: cx - 80 + 16 * i, y: cy }]);
  await touch('touchEnd', []);
  await still(page);
  const r1 = (await camera(page)).ratio;
  expect(Math.abs(r1 / r0 - 1)).toBeLessThan(0.01); // control
  // two fingers spreading from 60 to 220 px apart about the centre
  await touch('touchStart', [{ x: cx - 30, y: cy }, { x: cx + 30, y: cy }]);
  for (let i = 1; i <= 10; i += 1) await touch('touchMove', [{ x: cx - 30 - 8 * i, y: cy }, { x: cx + 30 + 8 * i, y: cy }]);
  await touch('touchEnd', []);
  await still(page);
  expect((await camera(page)).ratio).toBeLessThan(0.7 * r1);
  await context.close();
});

test('27.280 selection keeps the view, the selected card wears the selection ring through a zoom, and a selected edge is drawn at 3.4 and full opacity; control: without keepView the camera returns to the fit, and another edge keeps its rest size', async ({ page }) => {
  await openAdapter(page);
  const before = await page.evaluate(() => window.__kg.probe!.nodeDisplay('ticket:t160')!.backdropBorderColor);
  const pal = await page.evaluate(() => window.__kg.readPalette());
  expect(before).toBe(pal.graphCardLine); // not selected yet: the card hairline
  await page.evaluate(() => window.__kg.renderer.zoomBy(2));
  await still(page);
  const zoomed = (await camera(page)).ratio;
  await page.evaluate(() => window.__kg.show('ticket:t142', { selected: 'ticket:t160', keepView: true }));
  await still(page);
  expect((await camera(page)).ratio).toBeCloseTo(zoomed, 6);
  await page.evaluate(() => window.__kg.renderer.zoomBy(0.5));
  await still(page);
  expect(await page.evaluate(() => window.__kg.probe!.nodeDisplay('ticket:t160')!.backdropBorderColor)).toBe(pal.text);
  // control: the same setGraph without keepView returns to the fit
  await page.evaluate(() => window.__kg.show('ticket:t142', { selected: 'ticket:t160', keepView: false }));
  await still(page);
  const fit = await page.evaluate(() => window.__kg.probe!.fitRatio());
  expect(Math.abs((await camera(page)).ratio / fit - 1)).toBeLessThan(0.01);
  // a selected EDGE (with t160 selected, the blocks edge t133 → t142 is not `on`, so it rests thinner and translucent)
  const edges = await page.evaluate(() => {
    const k = window.__kg, p = k.probe!, id = 'blocks|ticket:t133|ticket:t142', other = 'parent|ticket:t131|ticket:t133';
    const rest = { sel: p.edgeDisplay(id)!, other: p.edgeDisplay(other)! };
    k.renderer.setStates({ selected: null, selectedEdge: id, highlight: null });
    return { rest, sel: p.edgeDisplay(id)!, other: p.edgeDisplay(other)! };
  });
  expect(edges.rest.sel).not.toEqual({ size: 3.4, opacity: 1 }); // so the selected leg can fail
  expect(edges.sel).toEqual({ size: 3.4, opacity: 1 });
  expect(edges.other.size).toBe(edges.rest.other.size); // control: only the selected edge thickens
  expect(edges.other.size).toBeLessThan(3.4);
});

test('27.281 the glide: a new centre tweens the items while the frame (the normalisation) stays fixed, through a resize too; an item that keeps its place never moves; control: an item that moves passes through intermediate positions', async ({ page }) => {
  await openAdapter(page);
  // note n7, chosen by machine: the only fixture centres under which an item keeps its exact layout place are n7 (n1)
  // and n6 (n3); under the plan's t133 every item moves, so the "never moves" leg would hold of nothing
  const target = await page.evaluate(() => window.__kg.layoutOf('note:n7'));
  const r = await page.evaluate(async (target) => {
    const k = window.__kg, p = k.probe!;
    const n0 = p.normalise({ x: 100, y: 100 });
    const start = p.positions();
    const frames: Record<string, { x: number; y: number }>[] = [];
    await k.setCenter('note:n7');
    // every frame of the glide, until the positions hold for 3 frames (SwiftShader paints 4 to 9 frames in 340 ms, so a
    // count over a fixed window measures the machine, not the glide)
    const t0 = performance.now();
    await new Promise<void>((done) => {
      let last = '', same = 0;
      const tick = () => {
        const at = p.positions(), key = JSON.stringify(at);
        frames.push(at);
        same = key === last ? same + 1 : 0;
        last = key;
        if (same < 3 && performance.now() - t0 < 3000) requestAnimationFrame(tick);
        else done();
      };
      requestAnimationFrame(tick);
    });
    return { n0, n1: p.normalise({ x: 100, y: 100 }), start, frames, end: p.positions() };
  }, target);
  expect(Math.abs(r.n1.x - r.n0.x)).toBeLessThan(1e-9);
  expect(Math.abs(r.n1.y - r.n0.y)).toBeLessThan(1e-9);
  // in Sigma coordinates (y up); the layout's target for each kept item
  const unmoved = Object.keys(r.start).filter((ref) => target[ref] !== undefined && r.start[ref]!.x === target[ref]!.x && r.start[ref]!.y === -target[ref]!.y);
  expect(unmoved.length).toBeGreaterThan(0);
  for (const f of r.frames) for (const ref of unmoved) if (f[ref]) expect(f[ref]).toEqual(r.start[ref]);
  const moved = Object.keys(r.start).find((ref) => r.end[ref] && Math.hypot(r.end[ref]!.x - r.start[ref]!.x, r.end[ref]!.y - r.start[ref]!.y) > 20)!;
  expect(moved).toBeDefined();
  const between = (v: number, a: number, b: number) => v > Math.min(a, b) && v < Math.max(a, b);
  const mid = r.frames.filter((f) => f[moved] && (between(f[moved]!.x, r.start[moved]!.x, r.end[moved]!.x) || between(f[moved]!.y, r.start[moved]!.y, r.end[moved]!.y)));
  expect(mid.length).toBeGreaterThanOrEqual(3); // control: it eased over several frames (the plan's "frames ≥ 10" in 340 ms, `sigtest.cjs`)
  // the frame is the config's own box, not the stage: with `autoRescale: false` and no custom box, Sigma frames by the
  // stage size, which holds still above, so only a resize can tell the two apart
  await page.setViewportSize({ width: 1000, height: 720 });
  await still(page);
  const n2 = await page.evaluate(() => window.__kg.probe!.normalise({ x: 100, y: 100 }));
  expect(Math.abs(n2.x - r.n0.x)).toBeLessThan(1e-9);
  expect(Math.abs(n2.y - r.n0.y)).toBeLessThan(1e-9);
});

test('27.284 reduced motion: a zoom lands in one frame and a new centre lands without intermediate positions; control: without it the same zoom takes 8 frames or more', async ({ page }) => {
  await openAdapter(page);
  const f0 = await frames(page);
  await page.evaluate(() => window.__kg.renderer.zoomBy(2));
  await still(page);
  expect((await frames(page)) - f0).toBeGreaterThanOrEqual(8); // control first, on the same page
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const f1 = await frames(page);
  await page.evaluate(() => window.__kg.renderer.zoomBy(0.5));
  await still(page);
  expect((await frames(page)) - f1).toBeLessThanOrEqual(2);
  const r = await page.evaluate(async () => {
    const k = window.__kg, p = k.probe!;
    const samples: Record<string, { x: number; y: number }>[] = [];
    let on = true;
    const tick = () => {
      samples.push(p.positions());
      if (on) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    await k.setCenter('ticket:t133');
    await new Promise((done) => setTimeout(done, 400));
    on = false;
    return { samples, end: p.positions() };
  });
  const after = r.samples.filter((f) => Object.keys(f).length === Object.keys(r.end).length && Object.keys(r.end).every((ref) => f[ref]));
  expect(after.length).toBeGreaterThan(0);
  for (const f of after) expect(f).toEqual(r.end); // no intermediate position
});

test('27.285 momentum: a drag released while moving coasts on in its direction (Sigma\'s inertia), and a drag during a running zoom spring leaves the driver alive (no page error, a later notch zooms); control: a drag that rests before release does not coast', async ({ page }) => {
  await openAdapter(page);
  const s = await stageAt(page);
  const drag = async (rest: number) => {
    const at = { x: s.left + s.width * 0.3, y: s.top + s.height * 0.85 };
    const c0 = await camera(page);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i += 1) {
      await page.mouse.move(at.x + 20 * i, at.y);
      await page.waitForTimeout(12);
    }
    if (rest > 0) await page.waitForTimeout(rest);
    const atRelease = await camera(page);
    await page.mouse.up();
    await still(page);
    const end = await camera(page);
    return { dragged: atRelease.x - c0.x, coast: end.x - atRelease.x };
  };
  const moving = await drag(0);
  expect(moving.dragged).toBeLessThan(0); // dragging right moves the camera left
  expect(Math.sign(moving.coast)).toBe(Math.sign(moving.dragged));
  expect(Math.abs(moving.coast)).toBeGreaterThanOrEqual(0.2 * Math.abs(moving.dragged));
  const rested = await drag(150);
  expect(Math.abs(rested.coast)).toBeLessThan(1e-9); // control
  // a drag DURING a running spring: the driver keeps its target while its own loop runs (`raf === 0` clause), so the
  // loop never reads a null target, and the driver is still alive afterwards
  const r0 = (await camera(page)).ratio;
  const at = { x: s.left + s.width * 0.3, y: s.top + s.height * 0.85 };
  await page.mouse.move(at.x, at.y);
  await page.evaluate(() => window.__kg.renderer.zoomBy(2));
  await page.mouse.down();
  const atDown = (await camera(page)).ratio;
  for (let i = 1; i <= 10; i += 1) {
    await page.mouse.move(at.x + 20 * i, at.y);
    await page.waitForTimeout(12);
  }
  await page.mouse.up();
  await still(page);
  expect(atDown / (r0 / 2)).toBeGreaterThan(1.01); // control: the drag began while the spring was still running
  expect(pageErrors(page)).toEqual([]);
  const r1 = (await camera(page)).ratio;
  await page.mouse.move(s.left + s.width * 0.5, s.top + s.height * 0.5);
  await page.mouse.wheel(0, -100);
  await still(page);
  expect(Math.abs((await camera(page)).ratio / r1 - 1)).toBeGreaterThan(0.05); // a notch still zooms: the driver is alive
});
