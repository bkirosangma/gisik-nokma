import { expect, test, type Page } from '@playwright/test';
import { RING_CONFIGS, radius } from '@gisik-nokma/knowledge-graph';
import { openAdapter, pagePoint, stageAt, still, takePageErrors } from './helpers.js';

/*
 * Spec C §4.2's traps, each measured on the REAL adapter (`harness/adapter.html`: the fixture centred on GN-142, desktop,
 * 2 clear hops) through the test-only probe. One test() per case; its control lives inside it.
 */

type Pt = { x: number; y: number };

// an uncaught page error fails every case: a throw inside a rAF callback kills the camera driver and shows nothing else (27.285)
test.afterEach(() => expect(takePageErrors()).toEqual([]));

/** A point near `from`, `dist` px away, with nothing drawn within `clear` px of it (no node, edge or label to hit). */
async function emptyPointNear(page: Page, from: Pt, dist: number, clear = 14): Promise<Pt> {
  const p = await page.evaluate(
    ({ from, dist, clear }) => {
      const probe = window.__kg.probe!;
      const r = document.querySelector('.gn-kg__stage')!.getBoundingClientRect();
      for (let i = 0; i < 32; i += 1) {
        const a = (i / 32) * 2 * Math.PI, x = from.x + dist * Math.cos(a), y = from.y + dist * Math.sin(a);
        if (x < clear || y < clear || x > r.width - clear || y > r.height - clear) continue;
        const around: Pt[] = [];
        for (let dx = -clear; dx <= clear; dx += 2) for (let dy = -clear; dy <= clear; dy += 2) around.push({ x: x + dx, y: y + dy });
        if (probe.alphaAt(around).every((v) => v === 0)) return { x, y };
      }
      return null;
    },
    { from, dist, clear },
  );
  if (p === null) throw new Error('no empty point found');
  return p;
}

test('27.264 trap 1, still: ten refreshes of the same states draw identical ink; control: selecting another item (a person, whose card shows only when selected) changes it', async ({ page }) => {
  await openAdapter(page);
  const r = await page.evaluate(async () => {
    const k = window.__kg, p = k.probe!, s = k.scene();
    p.clearInk();
    for (let i = 0; i < 10; i += 1) {
      k.renderer.setStates(s.states);
      await new Promise((done) => setTimeout(done, 30));
    }
    const same = p.inkLog();
    p.clearInk();
    // a ticket's selection only re-strokes its border, which covers no new pixel; a person's card appears (`program.ts` backdropVisibility)
    k.renderer.setStates({ ...s.states, selected: 'person:pA' });
    return { same, other: p.inkLog() };
  });
  expect(r.same.length).toBeGreaterThanOrEqual(10); // an empty log makes "all identical" true of nothing
  expect(r.same.every((n) => n > 0)).toBe(true);
  expect(new Set(r.same).size).toBe(1); // flick3.cjs STATIC: no frame without the second lines
  expect(r.other.length).toBeGreaterThan(0);
  expect(r.other[0]).not.toBe(r.same[0]); // control: the ink count does see a change
});

test('27.265 trap 1, hover: hovering a chip and leaving invalidates nothing and the first frame after leaving has the same ink; control: a changed subtitle invalidates exactly that item', async ({ page }) => {
  await openAdapter(page);
  const s = await stageAt(page);
  const before = await page.evaluate(() => window.__kg.probe!.inkLog().at(-1)!);
  const chip = await pagePoint(page, 'ticket:t160');
  const away = await emptyPointNear(page, { x: chip.x - s.left, y: chip.y - s.top }, 120);
  await page.mouse.move(chip.x, chip.y);
  await still(page);
  expect(await page.evaluate(() => window.__kg.hovers.at(-1))).toEqual({ kind: 'node', ref: 'ticket:t160' }); // the hover happened
  await page.evaluate(() => window.__kg.probe!.clearInk());
  await page.mouse.move(s.left + away.x, s.top + away.y);
  await page.waitForFunction(() => window.__kg.probe!.inkLog().length > 0);
  const firstAfter = await page.evaluate(() => window.__kg.probe!.inkLog()[0]);
  expect(await page.evaluate(() => window.__kg.probe!.invalidated())).toEqual([]);
  expect(firstAfter).toBe(before);
  // control: setGraph with that chip's subtitle changed invalidates exactly its ref
  const invalidated = await page.evaluate(() => {
    const k = window.__kg, sc = k.scene();
    const nodes = sc.nodes.map((n) => (n.ref === 'ticket:t160' ? { ...n, sub: `${n.sub} (edited)` } : n));
    k.renderer.setGraph(nodes, sc.edges, sc.positions, sc.states, { ...sc.view, keepView: true });
    return k.probe!.invalidated();
  });
  expect(invalidated).toEqual(['ticket:t160']);
});

test('27.266 trap 2: a solid edge has no notch along its middle 60%; control: a dashed edge has gaps', async ({ page }) => {
  await openAdapter(page);
  const r = await page.evaluate(() => {
    const p = window.__kg.probe!;
    const along = (from: string, to: string, t0: number, t1: number, steps: number) => {
      const a = p.viewportOf(from)!, b = p.viewportOf(to)!;
      const pts: Pt[] = [];
      for (let i = 0; i <= steps; i += 1) {
        const t = t0 + ((t1 - t0) * i) / steps;
        pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      }
      return p.alphaAt(pts);
    };
    const len = (from: string, to: string) => Math.hypot(p.viewportOf(from)!.x - p.viewportOf(to)!.x, p.viewportOf(from)!.y - p.viewportOf(to)!.y);
    // 1 px steps (denser than the plan's 9 points: a 9-point sample can straddle a dash period)
    const solid = along('ticket:t118', 'ticket:t142', 0.2, 0.8, Math.round(len('ticket:t118', 'ticket:t142') * 0.6));
    const l = len('ticket:t142', 'ticket:t160');
    const dashed = along('ticket:t142', 'ticket:t160', 0.5 - 12 / l, 0.5 + 12 / l, 24); // two 7/5 periods about the midpoint
    return { solid, dashed };
  });
  expect(r.solid.length).toBeGreaterThan(50);
  expect(r.solid.filter((a) => a === 0)).toEqual([]); // no notch
  expect(r.dashed.length).toBe(25);
  expect(r.dashed.some((a) => a === 0)).toBe(true); // control: relates (dash 7 / gap 5) has gaps
});

test('27.268 trap 4: a note\'s and a person\'s icon reach Sigma\'s display data as SVG data URIs, and a person in fog has none; control: a ticket has none', async ({ page }) => {
  await openAdapter(page);
  const r = await page.evaluate(() => {
    const p = window.__kg.probe!;
    return { note: p.nodeDisplay('note:n1')!.image, person: p.nodeDisplay('person:pA')!.image, ticket: p.nodeDisplay('ticket:t133')!.image, fogPerson: p.nodeDisplay('person:pB')!.image };
  });
  expect(r.note.startsWith('data:image/svg+xml')).toBe(true);
  expect(r.person.startsWith('data:image/svg+xml')).toBe(true);
  expect(r.ticket).toBe('');
  expect(r.fogPerson).toBe(''); // a person in fog is a bare dot
});

test('27.269 trap 5: a fog dot is drawn the same size in px after a 2× zoom; control: the camera ratio did halve', async ({ page }) => {
  await openAdapter(page);
  // start zoomed out to the 0.5× limit so every fog dot stays inside the stage at both zoom levels
  await page.evaluate(() => window.__kg.renderer.zoomBy(0.5));
  await still(page);
  const dot = await page.evaluate(() => {
    const k = window.__kg, p = k.probe!;
    const fog = k.scene().nodes.filter((n) => n.fog && p.nodeDisplay(n.ref)!.size === 3).map((n) => ({ ref: n.ref, v: p.viewportOf(n.ref)! }));
    fog.sort((a, b) => a.v.y - b.v.y); // the top of the fog ring, away from the cards
    return fog[0]!.ref;
  });
  // the painted area in px² (Σ alpha / 255 over a 13 × 13 px box): a 1 px edge measure moves by a whole pixel with the
  // dot's sub-pixel position; the area does not
  const area = () =>
    page.evaluate((ref) => {
      const p = window.__kg.probe!, c = p.viewportOf(ref)!;
      const pts: { x: number; y: number }[] = [];
      for (let dx = -6; dx <= 6; dx += 1) for (let dy = -6; dy <= 6; dy += 1) pts.push({ x: c.x + dx, y: c.y + dy });
      return p.alphaAt(pts).reduce((sum, a) => sum + a / 255, 0);
    }, dot);
  const r0 = await page.evaluate(() => window.__kg.probe!.camera().ratio);
  const a0 = await area();
  await page.evaluate(() => window.__kg.renderer.zoomBy(2));
  await still(page);
  const r1 = await page.evaluate(() => window.__kg.probe!.camera().ratio);
  const a1 = await area();
  expect(a0).toBeGreaterThan(12); // the dot was found (π · 3² ≈ 28 px²)
  expect(Math.abs(a1 / a0 - 1)).toBeLessThan(0.15); // a dot sized in graph units would be 4× the area
  expect(r1 / r0).toBeCloseTo(0.5, 2); // control: the zoom happened
});

test('27.270 trap 6 + label: a click on a chip\'s label picks it; a click on a fog dot picks nothing; a click on an edge picks it, and a fog edge Sigma hovers is neither reported nor picked; control: Sigma did fire its own clickNode on the fog dot, and did hover the fog edge', async ({ page }) => {
  await openAdapter(page);
  const label = await pagePoint(page, 'ticket:t133');
  await page.mouse.click(label.x + 30, label.y);
  await page.waitForTimeout(500); // past Sigma's double-click window, so the next click is a click
  expect(await page.evaluate(() => window.__kg.picks)).toEqual([{ kind: 'node', ref: 'ticket:t133', double: false }]);
  const fogRef = await page.evaluate(() => {
    const k = window.__kg;
    return k.scene().nodes.find((n) => n.fog && k.probe!.nodeDisplay(n.ref)!.size === 3)?.ref ?? null;
  });
  expect(fogRef).not.toBeNull();
  const raw0 = await page.evaluate(() => window.__kg.rawClicks());
  const fog = await pagePoint(page, fogRef!);
  await page.mouse.click(fog.x, fog.y);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__kg.picks.length)).toBe(1); // no pick recorded
  expect(await page.evaluate(() => window.__kg.rawClicks())).toBeGreaterThan(raw0); // control: Sigma's own clickNode fired
  // edges: a click on a solid edge's midpoint (where 27.279 hovers it) picks the edge
  const a = await pagePoint(page, 'ticket:t133'), c = await pagePoint(page, 'ticket:t142');
  await page.mouse.click((a.x + c.x) / 2, (a.y + c.y) / 2);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__kg.picks.at(-1))).toEqual({ kind: 'edge', id: 'blocks|ticket:t133|ticket:t142' });
  // a fog edge, chosen by machine: a point near its middle that is inked, inside the stage, more than 6 px from every
  // other edge and clear of every dot and card; then Sigma itself must hover it (its hover size, 3.4) for the leg to count
  const cands = await page.evaluate(() => {
    const k = window.__kg, p = k.probe!, sc = k.scene();
    const r = document.querySelector('#mount .gn-kg__stage')!.getBoundingClientRect();
    const V = (ref: string) => p.viewportOf(ref)!;
    const segDist = (q: Pt, u: Pt, v: Pt) => {
      const dx = v.x - u.x, dy = v.y - u.y, t = Math.max(0, Math.min(1, ((q.x - u.x) * dx + (q.y - u.y) * dy) / (dx * dx + dy * dy || 1)));
      return Math.hypot(q.x - (u.x + t * dx), q.y - (u.y + t * dy));
    };
    const pts = sc.edges
      .filter((e) => e.fog)
      .flatMap((e) => [0.5, 0.4, 0.6].map((t) => ({ id: e.id, x: V(e.from).x + (V(e.to).x - V(e.from).x) * t, y: V(e.from).y + (V(e.to).y - V(e.from).y) * t })))
      .filter((q) => q.x > 20 && q.y > 20 && q.x < r.width - 20 && q.y < r.height - 20)
      .filter((q) => sc.edges.every((o) => o.id === q.id || segDist(q, V(o.from), V(o.to)) > 6))
      .filter((q) => sc.nodes.every((n) => (n.fog ? Math.hypot(V(n.ref).x - q.x, V(n.ref).y - q.y) > 10 : Math.abs(V(n.ref).x - q.x) > 160 || Math.abs(V(n.ref).y - q.y) > 50)));
    const ink = p.alphaAt(pts);
    return pts.filter((_, i) => ink[i]! > 0);
  });
  const st = await stageAt(page);
  let hit: { id: string; x: number; y: number } | null = null;
  for (const q of cands.slice(0, 6)) {
    await page.mouse.move(st.left + q.x, st.top + q.y);
    await still(page);
    if ((await page.evaluate((id) => window.__kg.probe!.edgeDisplay(id)!.size, q.id)) === 3.4) {
      hit = q;
      break;
    }
  }
  expect(cands.length).toBeGreaterThan(0);
  expect(hit).not.toBeNull(); // control: Sigma did hover a fog edge
  const n0 = await page.evaluate(() => window.__kg.picks.length);
  await page.mouse.click(st.left + hit!.x, st.top + hit!.y);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__kg.picks.length)).toBe(n0); // no pick
  expect(await page.evaluate((id) => window.__kg.hovers.filter((h) => h.kind === 'edge' && h.id === id), hit!.id)).toEqual([]); // no hover reported
});

test('27.271 a click exactly on a dot picks it; control: a click in empty space picks the stage', async ({ page }) => {
  await openAdapter(page);
  const s = await stageAt(page);
  const dot = await pagePoint(page, 'ticket:t160');
  const empty = await emptyPointNear(page, { x: dot.x - s.left, y: dot.y - s.top }, 200);
  await page.mouse.click(dot.x, dot.y);
  await page.waitForTimeout(500);
  await page.mouse.click(s.left + empty.x, s.top + empty.y);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__kg.picks)).toEqual([{ kind: 'node', ref: 'ticket:t160', double: false }, { kind: 'stage' }]);
});

test('27.276 trap 8: after load every clear item is inside the stage and the fit is real, with the two hop rings, their labels and the fog band drawn outside the 2-hop ring, and the rings follow the camera after a 2× zoom; control: the same check after a 2× zoom finds items outside', async ({ page }) => {
  await openAdapter(page);
  // the ring layer (`rings.ts`), read from the DOM: the fixture has 2 clear hops and fog
  const rings = () =>
    page.evaluate(() => {
      const svg = document.querySelector('#mount .gn-kg__rings')!;
      const num = (e: Element, k: string) => Number(e.getAttribute(k));
      return {
        rings: [...svg.querySelectorAll('ellipse.gn-kg__ring')].map((e) => ({ cx: num(e, 'cx'), cy: num(e, 'cy'), rx: num(e, 'rx'), ry: num(e, 'ry') })),
        labels: [...svg.querySelectorAll('text.gn-kg__ring-label')].map((t) => ({ text: t.textContent, x: num(t, 'x'), y: num(t, 'y') })),
        fogBands: svg.querySelectorAll('ellipse.gn-kg__fog-band').length,
        bands: [...svg.querySelectorAll('ellipse.gn-kg__fog-band')].map((e) => ({ cx: num(e, 'cx'), cy: num(e, 'cy'), rx: num(e, 'rx'), ry: num(e, 'ry') })),
        fogNodes: window.__kg.scene().nodes.filter((n) => n.fog).length,
      };
    });
  const ring0 = await rings();
  expect(ring0.fogNodes).toBeGreaterThan(0);
  expect(ring0.rings.length).toBe(2); // hops 2 and 1, outermost first
  expect(ring0.labels.map((l) => l.text)).toEqual(['2 hops', '1 hop']);
  expect(ring0.fogBands).toBe(1);
  expect(ring0.rings[0]!.rx).toBeGreaterThan(ring0.rings[1]!.rx);
  // each label sits on its own ring, at angle −0.2 rad
  ring0.labels.forEach((l, i) => {
    const r = ring0.rings[i]!;
    expect(Math.abs(l.x - (r.cx + r.rx * Math.cos(-0.2)))).toBeLessThan(0.1);
    expect(Math.abs(l.y - (r.cy + r.ry * Math.sin(-0.2) - 8))).toBeLessThan(0.1);
  });
  // the fog band is centred on the rings and drawn 1.08× the NEXT hop out (hop 3), not on the 2-hop ring: in viewport px it is
  // 1.08 × 545/440 ≈ 1.3377 and 1.08 × 355/290 ≈ 1.3221 of the outer ring (desktop `RING_CONFIGS.R`, `engine/layout.ts:8`)
  const [band] = ring0.bands, outer = ring0.rings[0]!;
  expect(Math.abs(band!.cx - outer.cx)).toBeLessThan(0.1);
  expect(Math.abs(band!.cy - outer.cy)).toBeLessThan(0.1);
  const [h3x, h3y] = radius(RING_CONFIGS.desktop.R, 3), [h2x, h2y] = radius(RING_CONFIGS.desktop.R, 2);
  expect(band!.rx / outer.rx).toBeCloseTo((1.08 * h3x) / h2x, 3);
  expect(band!.rx / outer.rx).toBeCloseTo(1.3377, 3);
  expect(band!.ry / outer.ry).toBeCloseTo((1.08 * h3y) / h2y, 3);
  expect(band!.ry / outer.ry).toBeCloseTo(1.3221, 3);
  const check = () =>
    page.evaluate(() => {
      const k = window.__kg, p = k.probe!;
      const r = document.querySelector('#mount .gn-kg__stage')!.getBoundingClientRect();
      const clear = k.scene().nodes.filter((n) => !n.fog).map((n) => n.ref);
      // written positively: a NaN position (a fit solved from a zero-size viewport) is NOT inside
      const isIn = (v: { x: number; y: number } | null) => v !== null && Number.isFinite(v.x) && Number.isFinite(v.y) && v.x >= 0 && v.y >= 0 && v.x <= r.width && v.y <= r.height;
      return { clear: clear.length, out: clear.filter((ref) => !isIn(p.viewportOf(ref))), fit: p.fitRatio() };
    });
  const real = await check();
  expect(real.clear).toBeGreaterThan(0);
  expect(real.out).toEqual([]);
  expect(Number.isFinite(real.fit)).toBe(true);
  expect(real.fit).not.toBe(1);
  await page.evaluate(() => window.__kg.renderer.zoomBy(2));
  await still(page);
  expect((await check()).out.length).toBeGreaterThan(0); // control: the check does see an item outside
  // the rings are redrawn from the camera: after a 2× zoom the outer ring and the fog band have doubled, and the label moved with the ring
  const ring1 = await rings();
  expect(Math.abs(ring1.rings[0]!.rx / ring0.rings[0]!.rx - 2)).toBeLessThan(0.04);
  expect(Math.abs(ring1.bands[0]!.rx / ring0.bands[0]!.rx - 2)).toBeLessThan(0.04);
  expect(Math.abs(ring1.labels[0]!.x - (ring1.rings[0]!.cx + ring1.rings[0]!.rx * Math.cos(-0.2)))).toBeLessThan(0.1);
});

test('27.277 trap 9: an item hover dims non-neighbours to 32% and other edges to 8%; an edge hover dims nothing and thickens the edge, and back on the item dims again; control: leaving restores every item and edge and reports node-leave', async ({ page }) => {
  await openAdapter(page);
  const s = await stageAt(page);
  const centre = await pagePoint(page, 'ticket:t142');
  const edge0 = await page.evaluate(() => window.__kg.probe!.edgeDisplay('parent|ticket:t131|ticket:t133')!.opacity);
  expect(edge0).toBe(0.45); // a parent edge at rest: not the hover's 0.08, so the after-leave comparison can fail
  await page.mouse.move(centre.x, centre.y);
  await still(page);
  const hovered = await page.evaluate(() => {
    const p = window.__kg.probe!;
    return {
      nonNeighbour: p.nodeDisplay('ticket:t131')!.opacity,
      neighbour: p.nodeDisplay('ticket:t160')!.opacity,
      otherEdge: p.edgeDisplay('parent|ticket:t131|ticket:t133')!.opacity,
    };
  });
  expect(hovered).toEqual({ nonNeighbour: 0.32, neighbour: 1, otherEdge: 0.08 });
  const a = await pagePoint(page, 'ticket:t133');
  await page.mouse.move((a.x + centre.x) / 2, (a.y + centre.y) / 2);
  await still(page);
  const onEdge = await page.evaluate(() => {
    const k = window.__kg, p = k.probe!;
    return {
      hover: k.hovers.at(-1)!.kind,
      notOne: k.scene().nodes.filter((n) => !n.fog && p.nodeDisplay(n.ref)!.opacity !== 1).map((n) => n.ref),
      size: p.edgeDisplay('blocks|ticket:t133|ticket:t142')!.size,
    };
  });
  expect(onEdge).toEqual({ hover: 'edge', notOne: [], size: 3.4 });
  const away = await emptyPointNear(page, { x: centre.x - s.left, y: centre.y - s.top }, 160);
  await page.mouse.move(centre.x, centre.y);
  await still(page);
  // edge → item: Sigma's `hasHovered` stays true across it, so only the adapter's own restyle dims again
  expect(await page.evaluate(() => window.__kg.probe!.nodeDisplay('ticket:t131')!.opacity)).toBe(0.32);
  await page.mouse.move(s.left + away.x, s.top + away.y);
  await still(page);
  const after = await page.evaluate(() => {
    const k = window.__kg, p = k.probe!;
    return { dimmed: k.scene().nodes.filter((n) => !n.fog && p.nodeDisplay(n.ref)!.opacity !== 1).map((n) => n.ref), edge: p.edgeDisplay('parent|ticket:t131|ticket:t133')!.opacity };
  });
  expect(after).toEqual({ dimmed: [], edge: edge0 }); // control: every non-fog item back to 1, the other edge back to its own
  expect(await page.evaluate(() => window.__kg.hovers.at(-1))).toEqual({ kind: 'node-leave' }); // the view hides its hover state
});

test('27.279 trap 11: an edge hover reports the edge and the pointer, moving off it reports edge-leave, and Sigma draws no edge label; control: the edge thickened', async ({ page }) => {
  await openAdapter(page);
  const a = await pagePoint(page, 'ticket:t133');
  const c = await pagePoint(page, 'ticket:t142');
  const mid = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
  const s = await stageAt(page);
  const size0 = await page.evaluate(() => window.__kg.probe!.edgeDisplay('blocks|ticket:t133|ticket:t142')!.size);
  await page.mouse.move(mid.x, mid.y);
  await still(page);
  const r = await page.evaluate(() => {
    const k = window.__kg;
    return { hover: k.hovers.filter((h) => h.kind === 'edge').at(-1), size: k.probe!.edgeDisplay('blocks|ticket:t133|ticket:t142')!.size };
  });
  // off the edge to an empty point: the view's tooltip hides on edge-leave; then back on it, so the redraw below runs hovered
  const empty = await emptyPointNear(page, { x: mid.x - s.left, y: mid.y - s.top }, 120);
  await page.mouse.move(s.left + empty.x, s.top + empty.y);
  await still(page);
  expect(await page.evaluate(() => window.__kg.hovers.at(-1))).toEqual({ kind: 'edge-leave' });
  await page.mouse.move(mid.x, mid.y);
  await still(page);
  expect(await page.evaluate(() => window.__kg.hovers.at(-1))).toMatchObject({ kind: 'edge', id: 'blocks|ticket:t133|ticket:t142' });
  // no label: Sigma would centre one ON the line, and other edges and cards crowd its midpoint, so the edge is redrawn
  // ALONE with its two ends (camera kept) and a strip 4.5 px off it on both sides, ±15 px along it (further out, the end cards' shadows reach it), must stay empty
  const off = await page.evaluate(() => {
    const k = window.__kg, p = k.probe!, sc = k.scene(), id = 'blocks|ticket:t133|ticket:t142';
    k.renderer.setGraph(sc.nodes.filter((n) => n.ref === 'ticket:t133' || n.ref === 'ticket:t142'), sc.edges.filter((e) => e.id === id), sc.positions, sc.states, { ...sc.view, keepView: true });
    const a = p.viewportOf('ticket:t133')!, c = p.viewportOf('ticket:t142')!;
    const len = Math.hypot(c.x - a.x, c.y - a.y), tx = (c.x - a.x) / len, ty = (c.y - a.y) / len, mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
    return p.alphaAt([-1, 1].flatMap((side) => Array.from({ length: 31 }, (_, i) => ({ x: mx + tx * (i - 15) - side * ty * 4.5, y: my + ty * (i - 15) + side * tx * 4.5 }))));
  });
  expect(r.hover).toMatchObject({ kind: 'edge', id: 'blocks|ticket:t133|ticket:t142' });
  const h = r.hover as { x: number; y: number };
  expect(Math.abs(h.x - (mid.x - s.left))).toBeLessThanOrEqual(3);
  expect(Math.abs(h.y - (mid.y - s.top))).toBeLessThanOrEqual(3);
  expect(off.length).toBe(62);
  expect(off.filter((v) => v > 0)).toEqual([]); // no text pixel beside the edge
  expect(size0).toBeLessThan(3.4);
  expect(r.size).toBe(3.4); // control: the hover did reach the edge
});

test('27.282 Review Focus 4: a 200-character title keeps the centre card\'s real ink inside the stage; structural: its fit box is inside; control: the fit ratio is unchanged, because the second line truncates', async ({ page }) => {
  await openAdapter(page);
  const fit0 = await page.evaluate(() => window.__kg.probe!.fitRatio());
  await page.evaluate(() => window.__kg.setFixtureTitle('ticket:t142', 'x'.repeat(200)));
  await still(page);
  const r = await page.evaluate(() => {
    const k = window.__kg, p = k.probe!, sc = k.scene();
    const rect = document.querySelector('#mount canvas')!.getBoundingClientRect();
    const stage = document.querySelector('#mount .gn-kg__stage')!.getBoundingClientRect();
    const c = p.viewportOf('ticket:t142')!;
    const box = sc.view.fit.find((f) => f.x === 0 && f.y === 0)!; // the centre sits at the layout origin
    const sub = sc.nodes.find((n) => n.ref === 'ticket:t142')!.sub, fit = p.fitRatio();
    // Sigma paints the card into the canvas (no element to measure), and the neighbours' cards touch it on its own rows,
    // so the card is measured ALONE: the same view redrawn with the centre item only, the camera kept
    k.renderer.setGraph(sc.nodes.filter((n) => n.center), [], sc.positions, sc.states, { ...sc.view, keepView: true });
    const c2 = p.viewportOf('ticket:t142')!;
    let left = Infinity, right = -Infinity;
    for (let dy = -24; dy <= 24; dy += 4) {
      const row = p.alphaAt(Array.from({ length: Math.ceil(stage.width) }, (_, x) => ({ x, y: c2.y + dy })));
      row.forEach((a, x) => {
        if (a > 0) {
          left = Math.min(left, x);
          right = Math.max(right, x);
        }
      });
    }
    return {
      moved: Math.hypot(c2.x - c.x, c2.y - c.y),
      ink: { left: stage.left + left, right: stage.left + right, width: right - left },
      rect: { left: rect.left, right: rect.right },
      structural: { left: c.x - box.l, right: c.x + box.r, width: stage.width },
      sub,
      fit,
    };
  });
  expect(r.sub).toContain('xxxx'); // the title did change
  expect(r.moved).toBeLessThan(0.5); // the card was measured where it was drawn
  expect(r.ink.width).toBeGreaterThan(40); // the scan found the card, or the legs hold of an empty row
  expect(r.ink.left).toBeGreaterThanOrEqual(r.rect.left + 1);
  expect(r.ink.right).toBeLessThanOrEqual(r.rect.right - 1);
  // structural check only: the code's own assumed box, so it catches only a fit that ignores its own numbers
  expect(r.structural.left).toBeGreaterThanOrEqual(0);
  expect(r.structural.right).toBeLessThanOrEqual(r.structural.width);
  expect(Math.abs(r.fit / fit0 - 1)).toBeLessThan(1e-9); // control: both titles truncate to the same 34 characters
});

test('27.283 setGraph at the stress size (500 clear + 2,000 fog + 3,000 edges) draws every node and edge; its time is printed', async ({ page }) => {
  await openAdapter(page);
  const ms = await page.evaluate(() => window.__kg.stressGraph());
  console.log(`kg-setgraph (LOCAL): ${ms.toFixed(1)} ms`);
  const r = await page.evaluate(() => {
    const p = window.__kg.probe!;
    return { nodes: Object.keys(p.positions()).length, edges: [0, 333, 666, 999, 1332, 1665, 1998, 2331, 2664, 2999].filter((i) => p.edgeDisplay(`x${i}`) !== null).length };
  });
  expect(r).toEqual({ nodes: 2500, edges: 10 });
});

test('27.286 trap 1, the other half: an item that leaves the graph drops its cached subtitle; control: an item kept with the same subtitle does not', async ({ page }) => {
  await openAdapter(page);
  // Chosen by machine over every fixture centre and every pair of centres: no single re-centre both drops a subtitled
  // item and keeps one with the same subtitle (a kept item's level, so its second line, follows its distance). The plan's
  // t133 drops nothing at all; it only turns items to fog. So there are two re-centres from GN-142: to GN-125 (t118 and
  // n1 keep their subtitles), the control; and to note n5 (t133 leaves), the case.
  const recentre = (ref: string) =>
    page.evaluate(async (ref) => {
      const k = window.__kg;
      await k.show('ticket:t142');
      const before = k.scene().nodes.map((n) => ({ ref: n.ref, sub: n.sub }));
      const n0 = k.probe!.invalidated().length; // the log is cumulative
      const after = new Map((await k.setCenter(ref)).nodes.map((n) => [n.ref, n.sub]));
      return {
        dropped: before.filter((n) => n.sub !== null && !after.has(n.ref)).map((n) => n.ref),
        keptSame: before.filter((n) => n.sub !== null && after.get(n.ref) === n.sub).map((n) => n.ref),
        invalidated: k.probe!.invalidated().slice(n0),
      };
    }, ref);
  const control = await recentre('ticket:t125');
  expect(control.keptSame.length).toBeGreaterThan(0);
  for (const ref of control.keptSame) expect(control.invalidated).not.toContain(ref); // control
  const r = await recentre('note:n5');
  expect(r.dropped.length).toBeGreaterThan(0);
  for (const ref of r.dropped) expect(r.invalidated).toContain(ref);
});

test('27.288 destroy: no canvas or layer is left and a wheel where the graph was scrolls the page; control: before destroy the same wheel did not', async ({ page }) => {
  await openAdapter(page);
  const s = await stageAt(page);
  await page.mouse.move(s.left + s.width * 0.5, s.top + s.height * 0.5);
  await page.mouse.wheel(0, 100);
  await page.waitForTimeout(300);
  const before = await page.evaluate(() => scrollY);
  await page.evaluate(() => window.__kg.renderer.destroy());
  expect(await page.evaluate(() => document.querySelectorAll('#mount canvas').length)).toBe(0);
  expect(await page.evaluate(() => document.getElementById('mount')!.childElementCount)).toBe(0); // nor the stage and ring layer
  await page.mouse.wheel(0, 100);
  await page.waitForFunction(() => scrollY > 0);
  expect(before).toBe(0); // control
});
