import { expect, test, type Page } from '@playwright/test';
import { waitStill } from './helpers.js';

/*
 * The empty states on the real Sigma adapter (cases 27.668, 27.674): `harness/main.tsx?world=gn9-blocks|gn9-lonely` centres GN-9, whose
 * one link is a Blocks link to GN-5, or which has nothing linked. The centre card is WebGL, so its box is MEASURED off a
 * screenshot of the canvas (every overlay hidden, the ink that differs from the canvas's own fill), never the fit's assumed extents.
 */
type Box = { left: number; top: number; right: number; bottom: number };
const errors: string[] = [];
test.afterEach(() => {
  expect(errors.splice(0)).toEqual([]);
});

const stillView = (page: Page) => waitStill(page, () => page.evaluate(() => [window.__kgView.probe!.camera(), window.__kgView.probe!.frames()]));
async function openWorld(page: Page, world: 'gn9-blocks' | 'gn9-lonely'): Promise<void> {
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/index.html?world=${world}`);
  await page.waitForFunction(() => window.__kgView?.probe !== null && window.__kgView?.zones !== null, null, { timeout: 60_000 });
  await page.waitForSelector('.gn-kg__chip');
  await stillView(page);
}
const sentence = (page: Page) => page.evaluate(() => {
  const p = document.querySelector('.gn-kg__empty p');
  if (p === null) return null;
  const r = p.getBoundingClientRect();
  return { text: p.textContent, box: { left: r.left, top: r.top, right: r.right, bottom: r.bottom } };
});
/**
 * The centre card's page box: the canvas is shot with its overlays and ring layer hidden (visibility only, so nothing moves),
 * decoded in the page, and every pixel that differs from the canvas's commonest colour (its fill) is ink. 12 px in from each edge
 * is skipped: the canvas's rounded corners show the page behind them. With only the centre drawn, the ink is the centre card.
 */
async function cardBox(page: Page): Promise<{ box: Box; centre: { x: number; y: number }; origin: { x: number; y: number } }> {
  const c = await page.evaluate(() => {
    const r = document.querySelector('.gn-kg__canvas')!.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  await page.addStyleTag({ content: '.gn-kg__canvas > :not(.gn-kg__mount), .gn-kg__rings { visibility: hidden !important; }' });
  const png = (await page.screenshot({ clip: c })).toString('base64');
  await page.evaluate(() => document.head.lastElementChild!.remove()); // the style tag just added
  return page.evaluate(async ({ png, c }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${png}`;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.width;
    cv.height = img.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, cv.width, cv.height);
    const freq = new Map<number, number>();
    for (let i = 0; i < data.length; i += 4) {
      const k = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
      freq.set(k, (freq.get(k) ?? 0) + 1);
    }
    const bg = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const [br, bgr, bb] = [(bg >> 16) & 255, (bg >> 8) & 255, bg & 255];
    let L = Infinity, R = -Infinity, T = Infinity, B = -Infinity;
    for (let y = 12; y < height - 12; y += 1) {
      for (let x = 12; x < width - 12; x += 1) {
        const i = (y * width + x) * 4;
        if (Math.max(Math.abs(data[i]! - br), Math.abs(data[i + 1]! - bgr), Math.abs(data[i + 2]! - bb)) <= 12) continue;
        L = Math.min(L, x); R = Math.max(R, x + 1); T = Math.min(T, y); B = Math.max(B, y + 1);
      }
    }
    const k = width / c.width; // screenshot px per CSS px
    const s = document.querySelector('.gn-kg__stage')!.getBoundingClientRect();
    const v = window.__kgView.probe!.viewportOf('ticket:t9')!;
    return { box: { left: c.x + L / k, top: c.y + T / k, right: c.x + R / k, bottom: c.y + B / k }, centre: { x: s.left + v.x, y: s.top + v.y }, origin: { x: c.x, y: c.y } };
  }, { png, c });
}
const meets = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

const EVERY = "Every link type is turned off. Turn one on to see GN-9's links.";
const CARRY = "The link types that carry GN-9's links are turned off. Turn one on to see them.";
const NOTHING = 'Nothing is linked to GN-9 yet.';

for (const width of [1280, 768]) {
  test(`27.668 at ${width}: with the chips carrying GN-9's links off (the carry and every-off sentences), the centre card is framed above the sentence as with nothing linked; control: nothing linked`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    const shot = async (want: string) => {
      const s = await sentence(page);
      expect(s?.text).toBe(want);
      const card = await cardBox(page);
      // the ink is the centre card: it holds the renderer's own centre point and is a card, not a speck
      expect(card.box.left).toBeLessThan(card.centre.x);
      expect(card.box.right).toBeGreaterThan(card.centre.x);
      expect(card.box.top).toBeLessThan(card.centre.y);
      expect(card.box.bottom).toBeGreaterThan(card.centre.y);
      expect(card.box.right - card.box.left).toBeGreaterThan(30);
      const o = card.origin; // the card inside the canvas, for the comparison across worlds
      return { card: card.box, sentence: s!.box, inCanvas: { left: card.box.left - o.x, top: card.box.top - o.y, right: card.box.right - o.x, bottom: card.box.bottom - o.y } };
    };
    // control: nothing linked (the state that already re-frames) keeps the card off the sentence
    await openWorld(page, 'gn9-lonely');
    const lonely = await shot(NOTHING);
    expect(meets(lonely.card, lonely.sentence)).toBe(false);

    await openWorld(page, 'gn9-blocks');
    await page.getByRole('button', { name: /^Blocks/ }).click();
    await stillView(page);
    const carry = await shot(CARRY);
    expect.soft(meets(carry.card, carry.sentence), JSON.stringify(carry)).toBe(false);
    const on = page.locator('.gn-kg__chip[aria-pressed="true"]');
    while ((await on.count()) > 0) await on.first().click();
    await stillView(page);
    const every = await shot(EVERY);
    expect.soft(meets(every.card, every.sentence), JSON.stringify(every)).toBe(false);
    // one layout for every empty state: the card lands where nothing-linked puts it
    for (const b of [carry.inCanvas, every.inCanvas]) for (const k of ['left', 'top', 'right', 'bottom'] as const) expect.soft(Math.abs(b[k] - lonely.inCanvas[k]), k).toBeLessThanOrEqual(2);
  });
}

/**
 * GN-5's card in the canvas shot (overlays and rings hidden). GN-5 sits straight above GN-9, so the canvas above the midpoint
 * of their renderer points holds GN-5's card and the top of the edge into it: the card is the rows with at least 10 ink pixels
 * (the edge is 2 px wide, so its rows never count), and their ink's left and right, 16 px in from each side (the rounded
 * corners show the page). Null when no such row exists: no card drawn.
 */
async function farCard(page: Page): Promise<{ box: Box; size: { width: number; height: number } } | null> {
  const c = await page.evaluate(() => {
    const r = document.querySelector('.gn-kg__canvas')!.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  await page.addStyleTag({ content: '.gn-kg__canvas > :not(.gn-kg__mount), .gn-kg__rings { visibility: hidden !important; }' });
  const png = (await page.screenshot({ clip: c })).toString('base64');
  await page.evaluate(() => document.head.lastElementChild!.remove());
  return page.evaluate(async ({ png, c }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${png}`;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = img.width;
    cv.height = img.height;
    const ctx = cv.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0);
    const { data, width, height } = ctx.getImageData(0, 0, cv.width, cv.height);
    const freq = new Map<number, number>();
    for (let i = 0; i < data.length; i += 4) {
      const k = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
      freq.set(k, (freq.get(k) ?? 0) + 1);
    }
    const bg = [...freq.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const ink = (x: number, y: number) => {
      const i = (y * width + x) * 4;
      return Math.max(Math.abs(data[i]! - ((bg >> 16) & 255)), Math.abs(data[i + 1]! - ((bg >> 8) & 255)), Math.abs(data[i + 2]! - (bg & 255))) > 12;
    };
    const k = width / c.width;
    const s = document.querySelector('.gn-kg__stage')!.getBoundingClientRect();
    const v5 = window.__kgView.probe!.viewportOf('ticket:t5'), v9 = window.__kgView.probe!.viewportOf('ticket:t9')!;
    if (v5 === null) return null;
    const edge = Math.round(16 * k); // the canvas's rounded corners show the page: 16 px in from each side is not scanned
    const mid = Math.min(height, Math.round((s.top - c.y + (v5.y + v9.y) / 2) * k));
    let L = Infinity, R = -Infinity, T = Infinity, B = -Infinity;
    for (let y = 0; y < mid; y += 1) {
      let n = 0, l = Infinity, r = -Infinity;
      for (let x = edge; x < width - edge; x += 1) if (ink(x, y)) (n += 1), (l = Math.min(l, x)), (r = Math.max(r, x + 1));
      if (n < 10 * k) continue;
      T = Math.min(T, y); B = Math.max(B, y); L = Math.min(L, l); R = Math.max(R, r);
    }
    if (T === Infinity) return null;
    return { box: { left: L / k, top: T / k, right: R / k, bottom: (B + 1) / k }, size: { width: width / k, height: height / k } };
  }, { png, c });
}

for (const width of [1280, 768]) {
  test(`27.674 at ${width}: every chip off, then Blocks back on: GN-5's card is drawn inside the stage (the kept empty frame holds ring 1)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await openWorld(page, 'gn9-blocks');
    // control: linked, before any chip moves, GN-5's card is measured inside the canvas (the measurement finds a drawn card)
    const linked = await farCard(page);
    expect(linked).not.toBeNull();
    const on = page.locator('.gn-kg__chip[aria-pressed="true"]');
    while ((await on.count()) > 0) await on.first().click();
    await stillView(page);
    expect((await sentence(page))?.text).toBe(EVERY);
    await page.getByRole('button', { name: /^Blocks/ }).click();
    await stillView(page);
    expect(await sentence(page)).toBeNull();
    const far = await farCard(page);
    expect(far, 'GN-5 is not drawn on the canvas').not.toBeNull();
    const { box, size } = far!;
    expect(box.right - box.left).toBeGreaterThan(40); // a card, not the edge
    expect(box.left).toBeGreaterThan(16); // clear of the unscanned side band, so not cut by it
    expect(box.top).toBeGreaterThan(0);
    expect(box.right).toBeLessThan(size.width - 16);
    expect(box.bottom).toBeLessThan(size.height);
  });
}
