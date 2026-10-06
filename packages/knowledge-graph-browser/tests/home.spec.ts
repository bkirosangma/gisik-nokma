import { expect, test, type Page } from '@playwright/test';
import { waitStill } from './helpers.js';

/*
 * Home's graph in a real browser (KG-E T4, cases 27.653–27.656): `harness/home.tsx` mounts `KnowledgeGraph` the way Home's
 * `HomeBody` does, centred on the fixture's workspace, with harness buttons that set the highlight. Every wait is for the
 * camera to settle (SwiftShader runs at about 5 fps), never a timer.
 */
const errors: string[] = [];
test.afterEach(() => {
  expect(errors.splice(0)).toEqual([]);
});

const CENTRE = 'workspace:wgn';
const still = (page: Page) => waitStill(page, () => page.evaluate(() => [window.__kgHome.probe!.camera(), window.__kgHome.probe!.frames()]));
async function openHome(page: Page, query = ''): Promise<void> {
  await page.goto(`/home.html${query}`);
  await page.waitForFunction(() => window.__kgHome?.probe !== null && window.__kgHome?.zones !== null, null, { timeout: 60_000 });
  await still(page);
}
async function press(page: Page, id: 'light-a' | 'light-b' | 'clear'): Promise<void> {
  await page.click(`#${id}`);
  await still(page);
}
const zones = (page: Page) =>
  page.evaluate(() => {
    const z = window.__kgHome.zones!;
    return { clear: [...z.clear], fog: [...z.fog], clearHop: z.clearHop };
  });
const sets = (page: Page) => page.evaluate(() => window.__kgHome.sets);
const lit = (page: Page) => page.evaluate(() => window.__kgHome.lit);
const opacities = (page: Page, refs: readonly string[]) => page.evaluate((rs) => rs.map((r) => window.__kgHome.probe!.nodeDisplay(r)!.opacity), refs);
const display = (page: Page, ref: string) =>
  page.evaluate((r) => {
    const d = window.__kgHome.probe!.nodeDisplay(r)!;
    return { opacity: d.opacity, size: d.size };
  }, ref);
/** Every drawn edge, with its fog flag and its current opacity. */
const edges = (page: Page) =>
  page.evaluate(() => window.__kgHome.edges.map((e) => ({ id: e.id, from: e.from, to: e.to, fog: e.fog, opacity: window.__kgHome.probe!.edgeDisplay(e.id)!.opacity })));
async function pointOf(page: Page, ref: string): Promise<{ x: number; y: number }> {
  return page.evaluate((r) => {
    const s = document.querySelector('.gn-kg__stage')!.getBoundingClientRect();
    const v = window.__kgHome.probe!.viewportOf(r)!;
    return { x: s.left + v.x, y: s.top + v.y };
  }, ref);
}
async function hover(page: Page, ref: string): Promise<void> {
  const p = await pointOf(page, ref);
  await page.mouse.move(p.x, p.y);
  await still(page);
}
const centreName = (page: Page) => page.locator('.gn-kg__mount').getAttribute('aria-label');

test.beforeEach(({ page }) => {
  page.on('pageerror', (e) => errors.push(String(e)));
});

test('27.653 light: lit clear items 1, the other clear items 0.25, every clear edge 0.12; a hover keeps it (control: unlit, the same hover dims to 0.32); clear restores 1', async ({ page }) => {
  await openHome(page);
  const z = await zones(page);
  const clear = z.clear.filter((r) => r !== CENTRE);
  const drawn = await edges(page);
  const adjacent = (a: string, b: string) => drawn.some((e) => (e.from === a && e.to === b) || (e.from === b && e.to === a));

  // Control first, nothing lit: hovering X dims a clear item that is not X's neighbour to 0.32 (the hover landed).
  const x = clear[0]!;
  const third = clear.find((r) => r !== x && !adjacent(r, x))!;
  expect(third).toBeDefined();
  await hover(page, x);
  expect(await opacities(page, [third])).toEqual([0.32]);
  await page.mouse.move(0, 0);
  await still(page);

  await press(page, 'light-a');
  const a = (await sets(page)).a;
  expect(a.length).toBeGreaterThanOrEqual(2);
  expect(a.every((r) => clear.includes(r))).toBe(true);
  const outside = clear.find((r) => !a.includes(r))!; // a CLEAR item, so fog's own opacity cannot stand in for 0.25
  expect(outside).toBeDefined();
  expect(await opacities(page, a)).toEqual(a.map(() => 1));
  expect(await opacities(page, [outside])).toEqual([0.25]);
  const clearEdges = (await edges(page)).filter((e) => !e.fog);
  expect(clearEdges.length).toBeGreaterThan(0);
  expect(new Set(clearEdges.map((e) => e.opacity))).toEqual(new Set([0.12]));

  // The highlight wins over the hover: the hovered unlit item stays 0.25, the lit ones 1.
  await hover(page, outside);
  expect(await opacities(page, [outside])).toEqual([0.25]);
  expect(await opacities(page, a)).toEqual(a.map(() => 1));
  await page.mouse.move(0, 0);

  await press(page, 'clear');
  expect(await opacities(page, [...a, outside])).toEqual([...a, outside].map(() => 1));
});

test('27.654 switch and fog: light-b replaces A; its fog item stays a fog dot outside clear; control: its clear item is lit', async ({ page }) => {
  await openHome(page);
  await press(page, 'light-a');
  const a = (await sets(page)).a;
  const z = await zones(page);
  const fogId = z.fog[0]!;
  expect(fogId).toBeDefined();
  const fogBefore = await display(page, fogId);

  await press(page, 'light-b');
  const b = (await sets(page)).b;
  expect(b).toContain(fogId);
  expect(z.fog).toContain(fogId); // IN the fog, not merely absent from clear (an id off the graph is that too)
  expect(z.clear).not.toContain(fogId);
  const bClear = b.find((r) => z.clear.includes(r))!;
  expect(bClear).toBeDefined();
  expect(await lit(page)).toEqual(b);

  expect(await display(page, fogId)).toEqual(fogBefore); // a fog dot: its opacity and size are the fog's, not a lit card's
  expect(fogBefore.opacity).toBeLessThan(1);
  expect(await opacities(page, [bClear])).toEqual([1]);
  const aOnly = a.filter((r) => !b.includes(r));
  expect(aOnly.length).toBeGreaterThan(0);
  expect(await opacities(page, aOnly)).toEqual(aOnly.map(() => 0.25)); // replaced, not merged
});

test.describe('27.655 the phone (390 × 844, touch)', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('27.655 Home\'s phone form: one clear hop (a hop-2 item in fog, even with a held pick of 3) and the semantic switch inside Scope and links; control: at desktop width two clear hops, the item clear and the switch in the bar', async ({ page }) => {
    await openHome(page);
    expect(await page.evaluate(() => window.__kgHome.phone)).toBe(true);
    const z = await zones(page);
    expect(z.clearHop).toBe(1);
    expect(z.fog).toContain('ticket:t142'); // Mobile web's ticket: workspace → project → ticket is two hops
    expect(z.clear).not.toContain('ticket:t142');
    const semantic = '[role="tablist"][aria-label="Semantic layer"]';
    await expect(page.locator(`details.gn-kg__fold ${semantic}`)).toHaveCount(1);
    await expect(page.locator(semantic)).toHaveCount(1);

    // A pick held from a desktop (Show more hops → 3) still draws one clear hop: the view forces it on a phone.
    await openHome(page, '?hops=3');
    expect((await zones(page)).clearHop).toBe(1);

    // Control: the same seed opened at a desktop width.
    await page.setViewportSize({ width: 1280, height: 800 });
    await openHome(page);
    expect(await page.evaluate(() => window.__kgHome.phone)).toBe(false);
    const d = await zones(page);
    expect(d.clearHop).toBe(2);
    expect(d.clear).toContain('ticket:t142');
    await expect(page.locator(`details.gn-kg__fold ${semantic}`)).toHaveCount(0);
    await expect(page.locator(semantic)).toHaveCount(1);
  });
});

test('27.656 Escape in the graph with A lit clears it and keeps the centre; a second Escape goes Back; control: with nothing lit the first Escape goes Back', async ({ page }) => {
  await openHome(page);
  expect(await centreName(page)).toBe('Knowledge Graph of items linked to Gisik Nokma');
  const openNeighbour = async () => {
    const p = await pointOf(page, 'project:j_mw');
    await page.mouse.dblclick(p.x, p.y);
    await still(page);
    expect(await centreName(page)).toBe('Knowledge Graph of items linked to Mobile web');
    await expect(page.locator('.gn-kg__trail')).toHaveCount(1);
  };
  await openNeighbour();
  await press(page, 'light-a');
  expect(await lit(page)).not.toBeNull();

  await page.locator('.gn-kg__mount').focus();
  await page.keyboard.press('Escape');
  await still(page);
  expect(await lit(page)).toBeNull();
  expect(await centreName(page)).toBe('Knowledge Graph of items linked to Mobile web');

  await page.keyboard.press('Escape');
  await still(page);
  expect(await centreName(page)).toBe('Knowledge Graph of items linked to Gisik Nokma');
  await expect(page.locator('.gn-kg__trail')).toHaveCount(0);

  // Control: nothing lit, the first Escape is the view's Back.
  await openNeighbour();
  await page.locator('.gn-kg__mount').focus();
  await page.keyboard.press('Escape');
  await still(page);
  expect(await centreName(page)).toBe('Knowledge Graph of items linked to Gisik Nokma');
});

/*
 * 27.700 (release walk row 8): Home's "Linked to" list scrolls in its own box (`listBox`, `.gn-kg-list__box`), so a big
 * workspace no longer makes a page as tall as its rows (444 rows were 25,075 px on the dev stack). `?big=430` adds 430
 * tickets to Mobile web: with the fixture's own items that is more than 444 clear rows at two hops, under the 500 cap.
 */
test('27.700 a big workspace (444+ rows): the page stays under 2,400 px and the first and last rows are both reachable inside the box; control: without the box rule the page is taller than the rows', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await openHome(page, '?big=430');
  const rows = page.locator('.gn-kg-list__row');
  const n = await rows.count();
  expect(n).toBeGreaterThanOrEqual(444);
  expect(await page.locator('.gn-kg__count').textContent()).not.toContain('nearest'); // every row is a clear item (no cap)
  const pageHeight = () => page.evaluate(() => document.documentElement.scrollHeight);
  expect(await pageHeight()).toBeLessThan(2400);

  // reachable: a row focused by keyboard is scrolled into the box's visible rectangle and is the element at its centre
  const insideBox = (i: number) =>
    page.evaluate((k) => {
      const row = document.querySelectorAll<HTMLElement>('.gn-kg-list__row')[k]!;
      const boxEl = row.closest('.gn-kg-list__box')!;
      row.scrollIntoView({ block: 'nearest' });
      const r = row.getBoundingClientRect(), b = boxEl.getBoundingClientRect();
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { within: r.top >= b.top - 0.5 && r.bottom <= b.bottom + 0.5, hit: hit !== null && row.contains(hit) };
    }, i);
  await rows.nth(n - 1).focus();
  expect(await insideBox(n - 1)).toEqual({ within: true, hit: true });
  await rows.nth(0).focus();
  expect(await insideBox(0)).toEqual({ within: true, hit: true });

  // CONTROL, same test: delete the box rule from the live stylesheet and the same page is taller than its rows (2.75rem each)
  const deleted = await page.evaluate(() => {
    let k = 0;
    for (const sheet of [...document.styleSheets]) {
      const list = [...sheet.cssRules];
      for (let i = list.length - 1; i >= 0; i -= 1) if ((list[i] as CSSStyleRule).selectorText === '.gn-kg-list__box') (sheet.deleteRule(i), (k += 1));
    }
    return k;
  });
  expect(deleted).toBe(1);
  expect(await pageHeight()).toBeGreaterThan(n * 44);
});
