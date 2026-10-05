import { expect, test, type Page } from '@playwright/test';
import type { DrawNode } from '@gisik-nokma/knowledge-graph';
import { openAdapter, pagePoint, stageAt, still, takePageErrors } from './helpers.js';

/*
 * Owner ruling B (2026-10-05, spec §4.2 trap 10): a directed edge (blocks, ref) ends at its target's CARD border and its
 * arrowhead is drawn just outside it; a parent edge keeps no head. Measured on the REAL adapter (`harness/adapter.html`) in
 * SwiftShader. The border is found from PIXELS (the card's opaque fill and border, read along the edge with the edge removed),
 * never from the code under test, so a wrong card box shows as a head inside the card or in mid-air.
 */

type Pt = { x: number; y: number };
/** A drawn variant of the fixture scene: items moved to stage points, node fields replaced, edges dropped. */
type Patch = { move?: Record<string, Pt>; nodes?: Record<string, Partial<DrawNode>>; drop?: string[] };
/**
 * `B`: the target's border, px from its centre along the edge; `head`/`line`: the edge's ink beside the line, 3–8 px and
 * 20–25 px outside B; `tip`: px past B where the edge's own ink first shows on the axis (the head's point); `ink(lo, hi)`:
 * the band's ink between `lo` and `hi` px from the target's centre.
 */
type HeadRead = { B: number; head: number; line: number; tip: number; L: number; ink: (lo: number, hi: number) => number };

const AXIS_STEP = 0.25;
/** Beside the line: the line (≤ 3 px wide) leaves these offsets blank, the head (4 × its width) does not. */
const BAND = [-2.5, -2, 2, 2.5];
/** Alpha the edge must add on the axis for its point to count as drawn (an antialiased point starts faint). */
const TIP_INK = 40;

test.afterEach(() => expect(takePageErrors()).toEqual([]));

/** Redraws the fixture scene with `patch` applied, the camera kept, and waits until it is still. */
async function draw(page: Page, patch: Patch = {}): Promise<void> {
  await page.evaluate((patch) => {
    const k = window.__kg, p = k.probe!, sc = k.scene();
    const positions = new Map(sc.positions);
    for (const [ref, v] of Object.entries(patch.move ?? {})) {
      const g = p.graphAt(v.x, v.y);
      positions.set(ref, { x: g.x, y: -g.y }); // Sigma's y points up (adapter.ts)
    }
    const nodes = sc.nodes.map((n) => ({ ...n, ...(patch.nodes?.[n.ref] ?? {}) }));
    const edges = sc.edges.filter((e) => !(patch.drop ?? []).includes(e.id));
    k.renderer.setGraph(nodes, edges, positions, sc.states, { ...sc.view, keepView: true });
  }, patch);
  await still(page);
}

/** Alpha at every 0.25 px along the edge from its target's centre towards its source (up to 220 px, or `past` px beyond the source), on the axis and in the band. */
async function readAlongEdge(page: Page, id: string, past?: number): Promise<{ L: number; axis: number[]; band: number[][] }> {
  return page.evaluate(
    ({ id, step, band, past }) => {
      const k = window.__kg, p = k.probe!;
      const [, from, to] = id.split('|') as [string, string, string];
      const s = p.viewportOf(from)!, t = p.viewportOf(to)!;
      const L = Math.hypot(s.x - t.x, s.y - t.y), ux = (s.x - t.x) / L, uy = (s.y - t.y) / L;
      const ds: number[] = [];
      for (let d = 0; d < (past === null ? Math.min(L, 220) : L + past); d += step) ds.push(d);
      const at = (off: number) => ds.map((d) => ({ x: t.x + ux * d - uy * off, y: t.y + uy * d + ux * off }));
      return { L, axis: p.alphaAt(at(0)), band: band.map((o) => p.alphaAt(at(o))) };
    },
    { id, step: AXIS_STEP, band: BAND, past: past ?? null },
  );
}

/**
 * The probe 27.278 names. CONTROL: the same reads with the edge removed. `B` is the first point, walking out from the target's
 * centre, where the edge-free axis is no longer opaque (< 200: past the card's border; the shadow and the stage are fainter).
 */
async function headProbe(page: Page, id: string, patch: Patch = {}): Promise<HeadRead> {
  await draw(page, patch);
  const on = await readAlongEdge(page, id);
  await draw(page, { ...patch, drop: [...(patch.drop ?? []), id] });
  const off = await readAlongEdge(page, id);
  await draw(page, patch);
  expect(off.axis[0]).toBeGreaterThanOrEqual(200); // the walk starts inside the target's card (or dot)
  const i = off.axis.findIndex((a) => a < 200);
  expect(i).toBeGreaterThan(0);
  const B = i * AXIS_STEP;
  const ink = (lo: number, hi: number) =>
    on.band.reduce((sum, row, r) => sum + row.reduce((s, a, j) => (j * AXIS_STEP >= lo && j * AXIS_STEP <= hi ? s + Math.max(0, a - off.band[r]![j]!) : s), 0), 0);
  const from = Math.ceil((B - 2) / AXIS_STEP);
  const k = on.axis.findIndex((a, j) => j >= from && a - off.axis[j]! > TIP_INK);
  return { B, head: ink(B + 3, B + 8), line: ink(B + 20, B + 25), tip: k < 0 ? Infinity : k * AXIS_STEP - B, L: on.L, ink };
}

/**
 * A visible head, its point just outside the border: 0.5–4 px past B (B is where the card's antialiased edge falls below
 * 200, so this is the ruling's 1–2 px gap). Measured on the code, 1–2.75 px; a gap of 0 or 0.15 px reads 0–0.25 on the centre card.
 */
const expectHead = (r: HeadRead) => {
  expect(r.head).toBeGreaterThan(300);
  expect(r.head).toBeGreaterThan(3 * r.line);
  expect(r.tip).toBeGreaterThanOrEqual(0.5);
  expect(r.tip).toBeLessThanOrEqual(4);
};

/** The stage point `d` px from `ref`'s centre towards `toward`'s. */
async function along(page: Page, ref: string, toward: string, d: number): Promise<Pt> {
  return page.evaluate(
    ({ ref, toward, d }) => {
      const p = window.__kg.probe!, t = p.viewportOf(ref)!, s = p.viewportOf(toward)!;
      const L = Math.hypot(s.x - t.x, s.y - t.y);
      return { x: t.x + ((s.x - t.x) * d) / L, y: t.y + ((s.y - t.y) * d) / L };
    },
    { ref, toward, d },
  );
}

test('27.278 trap 10, arrows: the head of a blocks edge is visible just outside the centre card and outside a compact chip; control: the same probe with the edge removed finds no head', async ({ page }) => {
  await openAdapter(page);
  const centre = await headProbe(page, 'blocks|ticket:t133|ticket:t142');
  expectHead(centre);
  const chip = await headProbe(page, 'blocks|ticket:t126|ticket:t125');
  expect(await page.evaluate(() => window.__kg.scene().nodes.find((n) => n.ref === 'ticket:t125')!.lv)).toBe('compact');
  expectHead(chip);
  const control = await headProbe(page, 'blocks|ticket:t133|ticket:t142', { drop: ['blocks|ticket:t133|ticket:t142'] });
  expect(control.head).toBe(0);
});

test('27.350 blocks and ref edges carry a visible head; a parent edge into the same card has none (the same probe)', async ({ page }) => {
  await openAdapter(page);
  expectHead(await headProbe(page, 'blocks|ticket:t133|ticket:t142'));
  expectHead(await headProbe(page, 'ref|note:n7|note:n1'));
  const parent = await headProbe(page, 'parent|ticket:t118|ticket:t142');
  expect(parent.head).toBeLessThanOrEqual(parent.line + 60);
  expect(parent.head).toBeLessThan(300);
  // a parent edge into a DOT (27.355's patch: no card covers its end) has no head either
  const dot = await headProbe(page, 'parent|ticket:t118|ticket:t125', { nodes: { 'ticket:t125': { lv: 'dot', lbl: '', sub: null } } });
  expect(dot.B).toBeLessThan(6);
  expect(dot.head).toBeLessThanOrEqual(dot.line + 60);
  expect(dot.head).toBeLessThan(300);
});

test('27.351 the head sits outside the border of the widest card (two rays, one through its far end) and of a chip at fit and at 2× zoom', async ({ page }) => {
  await openAdapter(page);
  // the centre card carries the longest subtitle the view draws (34 characters, `nodeSub`)
  await page.evaluate(() => window.__kg.setFixtureTitle('ticket:t142', 'W'.repeat(200)));
  await still(page);
  expect(await page.evaluate(() => [...window.__kg.scene().nodes.find((n) => n.ref === 'ticket:t142')!.sub!].length)).toBe(34);
  const low = await headProbe(page, 'ref|note:n2|ticket:t142');
  expectHead(low);
  expect(low.B).toBeGreaterThan(60); // the ray leaves through the long bottom edge, far from the centre
  // a source right of the card, past its end: the ray leaves through the card's far end (25 px below the parent line to GN-151)
  const t = await page.evaluate(() => window.__kg.probe!.viewportOf('ticket:t142')!);
  const s = await stageAt(page);
  const end = await headProbe(page, 'blocks|ticket:t133|ticket:t142', { move: { 'ticket:t133': { x: Math.min(s.width - 20, t.x + 330), y: t.y + 25 } } });
  expectHead(end);
  expect(end.B).toBeGreaterThan(110);
  // a chip (a note: the icon is its dot) at fit, then at 2× zoom centred on it
  const fit = await headProbe(page, 'ref|note:n7|note:n1');
  expectHead(fit);
  await page.evaluate(() => {
    const p = window.__kg.probe!, c = p.normalise(p.positions()['note:n1']!);
    window.__kg.renderer.setCamera({ x: c.x, y: c.y, ratio: p.fitRatio() / 2 }, { instant: true });
  });
  await still(page);
  const zoomed = await headProbe(page, 'ref|note:n7|note:n1');
  expectHead(zoomed);
  expect(Math.abs(zoomed.B - fit.B)).toBeLessThan(2); // the card is screen-sized: the same border at both zooms
  expect(zoomed.L).toBeGreaterThan(1.8 * fit.L); // control: the camera did zoom
});

test('27.352 between adjacent cards the head stops at the TARGET\'s border, not the source\'s; a source inside the target card draws nothing outside it', async ({ page }) => {
  await openAdapter(page);
  const t = await page.evaluate(() => window.__kg.probe!.viewportOf('ticket:t142')!);
  // GN-133's card sits right above the centre card, a gap of about 20 px between their borders; 40 px left, so the edge
  // meets GN-133's card through its label box, not along the box's left side
  const patch: Patch = { move: { 'ticket:t133': { x: t.x - 40, y: t.y - 72 } } };
  const r = await headProbe(page, 'blocks|ticket:t133|ticket:t142', patch);
  expectHead(r);
  // the source's border: the first point no longer opaque, walking from the source's centre towards the target (edge removed)
  await draw(page, { ...patch, drop: ['blocks|ticket:t133|ticket:t142'] });
  const back = await page.evaluate(() => {
    const p = window.__kg.probe!, s = p.viewportOf('ticket:t133')!, t = p.viewportOf('ticket:t142')!;
    const L = Math.hypot(s.x - t.x, s.y - t.y), ux = (t.x - s.x) / L, uy = (t.y - s.y) / L, pts: { x: number; y: number }[] = [];
    for (let d = 0; d < L; d += 0.25) pts.push({ x: s.x + ux * d, y: s.y + uy * d });
    const a = p.alphaAt(pts);
    return { L, border: a.findIndex((v) => v < 200) * 0.25 };
  });
  expect(back.border).toBeGreaterThan(0);
  const srcBorder = back.L - back.border; // px from the TARGET's centre
  expect(srcBorder).toBeGreaterThan(r.B + 12); // the borders are apart: a gap the head could sit at either end of
  // just outside the SOURCE's border, on the gap side: the line only, no head
  expect(r.ink(srcBorder - 8, srcBorder - 3)).toBeLessThan(300);
  // a dot-level source inside the target card, near its right end (20 px below the parent line to GN-151): the edge collapses
  // onto it, so nothing shows past the border
  const inside: Patch = { move: { 'ticket:t133': { x: t.x + 100, y: t.y + 20 } }, nodes: { 'ticket:t133': { lv: 'dot', lbl: '', sub: null } } };
  await draw(page, inside);
  const withE = await readAlongEdge(page, 'blocks|ticket:t133|ticket:t142', 60);
  await draw(page, { ...inside, drop: ['blocks|ticket:t133|ticket:t142'] });
  const without = await readAlongEdge(page, 'blocks|ticket:t133|ticket:t142', 60);
  const outside = without.axis.map((a, j) => (a < 200 ? j : -1)).filter((j) => j >= 0);
  expect(outside.length).toBeGreaterThan(0);
  const leaked = outside.reduce((sum, j) => sum + Math.abs(withE.axis[j]! - without.axis[j]!) + withE.band.reduce((s, row, k) => s + Math.abs(row[j]! - without.band[k]![j]!), 0), 0);
  expect(leaked).toBe(0);
});

test('27.353 regression control: layout, hover dimming and node hits are as before; a directed edge is hit where it is drawn and not under the target card', async ({ page }) => {
  await openAdapter(page);
  // recorded on the clean tree (KG 38366a4e) with this harness; the engine's ring layout, Sigma's y up
  const before: Record<string, [number, number]> = {
    'concept:c1': [-150, 160.215], 'concept:c2': [267.855, 230.072], 'note:n1': [0, -185], 'note:n2': [-259.808, -92.5], 'note:n3': [0, -290],
    'note:n4': [168.381, 267.925], 'note:n5': [0, -355], 'note:n7': [98.978, -282.567], 'person:pA': [-259.808, 92.5], 'person:pB': [-28.523, 354.513],
    'person:pR': [-98.978, -282.567], 'person:pT': [-300, 0], 'project:j_ds': [-38.017, -354.135], 'project:j_mw': [-150, -160.215], 'project:j_wf': [57.432, 287.519],
    'ticket:s12': [-471.984, 177.5], 'ticket:s15': [-545, 0], 'ticket:t101': [-364.777, -162.166], 'ticket:t118': [150, -160.215], 'ticket:t120': [168.381, -267.925],
    'ticket:t125': [267.855, -230.072], 'ticket:t126': [-300.079, -212.093], 'ticket:t128': [-113.312, 347.242], 'ticket:t130': [71.137, 351.963], 'ticket:t131': [-57.432, 287.519],
    'ticket:t133': [0, 185], 'ticket:t139': [259.808, 92.5], 'ticket:t142': [0, 0], 'ticket:t149': [259.808, -92.5], 'ticket:t151': [300, 0],
    'ticket:t157': [-220, -251.147], 'ticket:t160': [150, 160.215], 'ticket:t96': [-128.644, -277.328], 'workspace:wgn': [-30.693, -289.294],
  };
  const positions = await page.evaluate(() => window.__kg.probe!.positions());
  expect(Object.keys(positions).sort()).toEqual(Object.keys(before).sort());
  for (const [ref, [x, y]] of Object.entries(before)) {
    expect(positions[ref]!.x).toBeCloseTo(x, 2);
    expect(positions[ref]!.y).toBeCloseTo(y, 2);
  }
  // the styles' outputs at rest and on hovering GN-133, as `size/opacity` multisets (recorded on the clean tree)
  const census = (page: Page) =>
    page.evaluate(() => {
      const k = window.__kg, p = k.probe!, sc = k.scene();
      const count = (xs: string[]) => Object.fromEntries([...new Set(xs)].sort().map((x) => [x, xs.filter((y) => y === x).length]));
      return {
        nodes: count(sc.nodes.map((n) => `${p.nodeDisplay(n.ref)!.size}/${p.nodeDisplay(n.ref)!.opacity}`)),
        edges: count(sc.edges.map((e) => `${p.edgeDisplay(e.id)!.size}/${p.edgeDisplay(e.id)!.opacity}`)),
        lit: sc.edges.filter((e) => p.edgeDisplay(e.id)!.opacity === 1).map((e) => e.id).sort(),
        dimmed: sc.nodes.filter((n) => p.nodeDisplay(n.ref)!.opacity === 0.32).length,
      };
    });
  const rest = await census(page);
  expect(rest.nodes).toEqual({ '1/1': 1, '12/1': 1, '16/1': 2, '3/0.9': 7, '4.5/1': 15, '8/1': 5, '9.5/1': 3 });
  expect(rest.edges).toEqual({ '1.1/0.55': 20, '1.2/0.22': 12, '1.3/0.45': 3, '1.7/0.45': 9, '1.7/0.6': 3, '2.2/0.45': 5, '3/0.55': 1, '3/1': 11 });
  const t133 = await pagePoint(page, 'ticket:t133');
  await page.mouse.move(t133.x, t133.y);
  await still(page);
  expect(await page.evaluate(() => window.__kg.hovers.at(-1))).toEqual({ kind: 'node', ref: 'ticket:t133' });
  const hover = await census(page);
  expect(hover.edges).toEqual({ '1.1/0.08': 19, '1.1/1': 1, '1.2/0.22': 12, '1.3/0.08': 3, '1.7/0.08': 11, '1.7/1': 1, '2.2/0.08': 5, '3/0.08': 11, '3/1': 1 });
  expect(hover.lit).toEqual(['blocks|ticket:t133|ticket:t142', 'in|project:j_wf|ticket:t133', 'parent|ticket:t131|ticket:t133']);
  expect(hover.dimmed).toBe(23);
  const s = await stageAt(page);
  await page.mouse.move(s.left + 4, s.top + s.height - 4);
  await still(page);
  // every node's centre still hits a node: no edge, and no hole
  const hits = await page.evaluate(() => {
    const p = window.__kg.probe!;
    return window.__kg.scene().nodes.map((n) => p.hitAt([p.viewportOf(n.ref)!])[0]);
  });
  expect(hits).toHaveLength(34);
  expect(hits.filter((h) => !h?.startsWith('node:'))).toEqual([]);
  // the named change (ruling B): the ref edge into the centre card is hit along its drawn line, not under the card it ends at
  const id = 'ref|note:n2|ticket:t142';
  const r = await headProbe(page, id);
  const inside = await Promise.all([0.45, 0.6, 0.8].map((f) => along(page, 'ticket:t142', 'note:n2', r.B * f)));
  const outside = await along(page, 'ticket:t142', 'note:n2', r.B + 15);
  const [a, b, c, d] = await page.evaluate((pts) => window.__kg.probe!.hitAt(pts), [...inside, outside]);
  expect([a, b, c].filter((h) => h === `edge:${id}`)).toEqual([]); // the clean tree hit the edge at all three (under the card's subtitle)
  expect(d).toBe(`edge:${id}`);
  // mirror control: an UNdirected edge still runs to its target's centre, so it is still hit inside the target's card (GN-151's
  // chip, between its dot and its border; the clean tree hit it there too)
  const inChip = await Promise.all([6, 8, 10].map((d) => along(page, 'ticket:t151', 'ticket:t142', d)));
  expect(await page.evaluate((pts) => window.__kg.probe!.hitAt(pts), inChip)).toEqual(Array(3).fill('edge:parent|ticket:t142|ticket:t151'));
  // a hover on the arrowhead itself reports the edge
  const head = await along(page, 'ticket:t142', 'note:n2', r.B + 5);
  await page.mouse.move(s.left + head.x, s.top + head.y);
  await still(page);
  expect(await page.evaluate(() => window.__kg.hovers.at(-1))).toMatchObject({ kind: 'edge', id });
});

test('27.355 a target drawn as a dot (no card) keeps Sigma\'s own clamp: the head is visible just outside the dot', async ({ page }) => {
  await openAdapter(page);
  const r = await headProbe(page, 'blocks|ticket:t126|ticket:t125', { nodes: { 'ticket:t125': { lv: 'dot', lbl: '', sub: null } } });
  expect(r.B).toBeLessThan(6); // the border found is the dot's (3.5 px), not a card's
  expectHead(r);
});
