import { expect, test, type Page } from '@playwright/test';
import { waitStill } from './helpers.js';

/*
 * Knowledge Graph spec D §6 (KG-D Task 8, case 27.530): the concept inspector on the real Sigma adapter. `?concepts=on`
 * mounts app-core's `ConceptInspector` through `renderConceptPanel`, as the web does, on the fixture (centred on GN-142):
 * `concept:c1` is confirmed, `concept:c2` a suggestion (`harness/main.tsx`). Every wait is for the camera to settle
 * (`waitStill`), never a timer.
 */
type Pt = { x: number; y: number };
const errors: string[] = [];
test.afterEach(() => {
  expect(errors.splice(0)).toEqual([]);
});

const C1 = 'concept:c1';
const C2 = 'concept:c2';
const stillView = (page: Page) => waitStill(page, () => page.evaluate(() => [window.__kgView.probe!.camera(), window.__kgView.probe!.frames()]));
async function openView(page: Page, query: string, theme: 'light' | 'dark' = 'light', style: 'hig' | 'neo' = 'hig'): Promise<void> {
  page.removeAllListeners('pageerror');
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`/index.html${query}`);
  await page.evaluate(({ theme, style }) => {
    document.documentElement.dataset.theme = theme;
    if (style !== 'hig') document.documentElement.dataset.style = style;
  }, { theme, style });
  await page.waitForFunction(() => window.__kgView?.probe !== null && window.__kgView?.zones !== null, null, { timeout: 60_000 });
  await stillView(page);
}
/** A drawn item's centre in page px. */
const pointOf = (page: Page, ref: string): Promise<Pt> =>
  page.evaluate((r) => {
    const s = document.querySelector('.gn-kg__stage')!.getBoundingClientRect();
    const v = window.__kgView.probe!.viewportOf(r)!;
    return { x: s.left + v.x, y: s.top + v.y };
  }, ref);
/** Which pills Sigma holds display data for (27.325's reading). */
const shown = (page: Page) => page.evaluate((refs) => refs.filter((r) => window.__kgView.probe!.nodeDisplay(r) !== null), [C1, C2]);

/**
 * The ink around each pill's centre (±10 px), as `empty.spec.ts`'s `cardBox` reads the canvas: the canvas shot with its
 * overlays and ring layer hidden (visibility only, so nothing moves), decoded in the page, ink = every pixel more than 12
 * from the canvas's commonest colour (its fill).
 */
async function inkAround(page: Page, refs: string[]): Promise<number[]> {
  const c = await page.evaluate(() => {
    const r = document.querySelector('.gn-kg__canvas')!.getBoundingClientRect();
    return { x: r.left, y: r.top, width: r.width, height: r.height };
  });
  const points = await Promise.all(refs.map((r) => pointOf(page, r)));
  await page.addStyleTag({ content: '.gn-kg__canvas > :not(.gn-kg__mount), .gn-kg__rings { visibility: hidden !important; }' });
  const png = (await page.screenshot({ clip: c })).toString('base64');
  await page.evaluate(() => document.head.lastElementChild!.remove()); // the style tag just added
  return page.evaluate(
    async ({ png, c, points }) => {
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
      const k = width / c.width; // screenshot px per CSS px
      return points.map((p) => {
        const cx = (p.x - c.x) * k;
        const cy = (p.y - c.y) * k;
        let ink = 0;
        for (let y = Math.max(0, Math.round(cy - 10 * k)); y < Math.min(height, Math.round(cy + 10 * k)); y += 1) {
          for (let x = Math.max(0, Math.round(cx - 10 * k)); x < Math.min(width, Math.round(cx + 10 * k)); x += 1) {
            const i = (y * width + x) * 4;
            if (Math.max(Math.abs(data[i]! - br), Math.abs(data[i + 1]! - bgr), Math.abs(data[i + 2]! - bb)) > 12) ink += 1;
          }
        }
        return Math.round(ink / (k * k)); // in CSS px²
      });
    },
    { png, c, points },
  );
}
const insp = (page: Page) => page.locator('.gn-kg-insp');

test('27.530 both concept pills are drawn; a click on the suggested pill opens the panel with Suggested and Confirm, the confirmed one its items; Semantic Off removes both pills and the panel; control: On draws them again', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await openView(page, '?concepts=on');
  expect(await shown(page)).toEqual([C1, C2]);
  const [inkC1, inkC2] = await inkAround(page, [C1, C2]);
  expect(inkC1).toBeGreaterThan(40);
  expect(inkC2).toBeGreaterThan(40);
  // the suggested pill, clicked where Sigma drew it
  const p2 = await pointOf(page, C2);
  await page.mouse.click(p2.x, p2.y);
  const suggested = insp(page).getByRole('region', { name: 'Suggested concept drag · column · board' });
  await expect(suggested).toBeVisible();
  await expect(suggested.getByText('Suggested', { exact: true })).toBeVisible();
  await expect(suggested.getByRole('button', { name: 'Confirm' })).toBeVisible();
  await expect(suggested.getByRole('textbox', { name: 'Name' })).toHaveValue('drag · column · board');
  await expect(suggested.getByText('Fewer people will see this concept: 8 of 9 members')).toBeVisible();
  // the confirmed one: the server's concept, attributed (D2), its items removable
  const p1 = await pointOf(page, C1);
  await page.mouse.click(p1.x, p1.y);
  const confirmed = insp(page).getByRole('region', { name: 'Concept Scroll position on phone sheets' });
  await expect(confirmed.getByText('Created by Assistant, for Ama Rangsa')).toBeVisible();
  await expect(confirmed.getByRole('button', { name: 'Remove from concept' })).toHaveCount(4);
  // Off: both pills and the panel go
  await page.getByRole('tab', { name: 'Off' }).click();
  await stillView(page);
  expect(await shown(page)).toEqual([]);
  await expect(insp(page).locator('.gn-kg-concept-inspector')).toHaveCount(0);
  // control: On draws both again
  await page.getByRole('tab', { name: 'On' }).click();
  await stillView(page);
  expect(await shown(page)).toEqual([C1, C2]);
  const [againC1, againC2] = await inkAround(page, [C1, C2]);
  expect(againC1).toBeGreaterThan(40);
  expect(againC2).toBeGreaterThan(40);
});

/** The panel's measured geometry: no horizontal overflow, every Remove and Confirm a 44 px target beside its label. */
const measure = (page: Page) =>
  page.evaluate(() => {
    const panel = document.querySelector('.gn-kg-concept-inspector')!;
    const r = panel.getBoundingClientRect();
    const rows = [...panel.querySelectorAll('.gn-kg-concept__items > li, .gn-kg-concept-links > li')].map((li) => {
      const label = li.querySelector('.gn-kg-concept__label')!.getBoundingClientRect();
      const button = li.querySelector('button')?.getBoundingClientRect() ?? null;
      return { labelRight: Math.round(label.right), buttonLeft: button === null ? null : Math.round(button.left), buttonHeight: button === null ? null : Math.round(button.height), height: Math.round(li.getBoundingClientRect().height) };
    });
    const targets = [...panel.querySelectorAll('button')].map((b) => Math.round(b.getBoundingClientRect().height));
    return { width: Math.round(r.width), scrollWidth: panel.scrollWidth, clientWidth: panel.clientWidth, pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, rows, minTarget: Math.min(...targets) };
  });

for (const [width, config] of [[390, 'phone'], [768, 'desktop'], [1280, 'desktop']] as const) {
  for (const theme of ['light', 'dark'] as const) {
    test(`27.530 at ${width} px (${config}), ${theme}: the confirmed and the suggested panel fit their column, every button a 44 px target, no label under its button`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      for (const [ref, name] of [[C1, 'Concept Scroll position on phone sheets'], [C2, 'Suggested concept drag · column · board']] as const) {
        // each panel on a fresh view (the switch between the two is the first test's, at 1280)
        await openView(page, `?concepts=on&config=${config}`, theme);
        if (config === 'phone' && ref === C2) {
          // a phone draws the second ring as fog, which takes no tap; the suggestion tags GN-160, so a phone user centres
          // there first (from the list under the canvas, so back to the top before reading the pill)
          await page.locator('.gn-kg-list').getByRole('button', { name: /^GN-160 / }).click();
          await insp(page).getByRole('button', { name: 'Center on GN-160' }).click();
          await expect(page.locator('.gn-kg__mount')).toHaveAttribute('aria-label', 'Knowledge Graph of items linked to GN-160');
          await page.evaluate(() => scrollTo(0, 0));
          await stillView(page);
        }
        const p = await pointOf(page, ref);
        // after a re-centre Sigma's picking buffer can hold a tag edge over the pill's centre until the next frame: hover,
        // then click once its own hit test answers the pill
        await page.mouse.move(p.x, p.y);
        await expect.poll(() => page.evaluate((r) => window.__kgView.probe!.hitAt([window.__kgView.probe!.viewportOf(r)!])[0], ref)).toBe(`node:${ref}`);
        await page.mouse.click(p.x, p.y);
        const region = insp(page).getByRole('region', { name });
        await expect(region).toBeVisible();
        await page.mouse.move(0, 0);
        const m = await measure(page);
        console.log(`27.530 ${width} ${config} ${theme} ${ref} ${JSON.stringify(m)}`);
        expect(m.scrollWidth).toBeLessThanOrEqual(m.clientWidth);
        expect(m.pageOverflow).toBeLessThanOrEqual(0);
        expect(m.minTarget).toBeGreaterThanOrEqual(44);
        for (const row of m.rows) if (row.buttonLeft !== null) expect(row.labelRight).toBeLessThanOrEqual(row.buttonLeft);
        await region.screenshot({ path: info.outputPath(`concept-${width}-${theme}-${ref.replace(':', '-')}.png`) });
      }
    });
  }
}
