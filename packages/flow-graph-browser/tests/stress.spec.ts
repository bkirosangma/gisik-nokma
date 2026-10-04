import { expect, test, type Page } from '@playwright/test';
import type { StressRecord } from '../harness/results.js';

async function run(page: Page, query: string): Promise<StressRecord> {
  await page.goto(`/stress.html?${query}&auto=1`);
  await page.waitForFunction(() => (window as unknown as { __stress?: unknown }).__stress !== undefined, null, { timeout: 60_000 });
  return page.evaluate(() => (window as unknown as { __stress: StressRecord }).__stress);
}

test('29.002 the time scene mounts 1,200 bars in a native scroller and the sampler records a scripted pan of it; control: a 60 ms stall planted in the pan is the worst frame', async ({ page }) => {
  const r = await run(page, 'scene=time&n=1200');
  console.log(`fg-stress time (LOCAL, headless): ${JSON.stringify(r.pan)}`);
  expect(r.count).toBe(1200);
  expect(await page.locator('#host button').count()).toBe(1200);
  expect(r.pan.frames).toBeGreaterThan(20);
  // CONTROL: the same page with a busy loop in a scroll handler. A harness that cannot see a stall measures nothing.
  await page.goto('/stress.html?scene=time&n=1200');
  await page.evaluate(() => {
    document.getElementById('host')!.addEventListener('scroll', () => { const t = performance.now(); while (performance.now() - t < 60); }, true);
  });
  await page.click('#run');
  await page.waitForFunction(() => (window as unknown as { __stress?: unknown }).__stress !== undefined, null, { timeout: 60_000 });
  const stalled = await page.evaluate(() => (window as unknown as { __stress: StressRecord }).__stress);
  expect(stalled.pan.worstMs).toBeGreaterThanOrEqual(60);
  expect(stalled.pan.over50).toBeGreaterThan(r.pan.over50);
});

test('29.002 the flow scene mounts 300 nodes and about 1.3 edges each under one transformed layer and records a pan and zoom of it', async ({ page }) => {
  const r = await run(page, 'scene=flow&n=300');
  console.log(`fg-stress flow (LOCAL, headless): ${JSON.stringify(r.pan)}`);
  expect(r.count).toBe(300);
  expect(await page.locator('#host path').count()).toBe(390);
  expect(r.pan.frames).toBeGreaterThan(20);
});

test('29.003 the product\'s own Timeline view at 2,000 dated tickets: panned and measured; the numbers are the recorded baseline', async ({ page }) => {
  const r = await run(page, 'scene=view&n=2000');
  console.log(`fg-stress view (LOCAL, headless): ${JSON.stringify({ pan: r.pan, clickToSettleMs: r.clickToSettleMs })}`);
  expect(await page.locator('.gn-timeline').count()).toBe(1);
  expect(r.pan.frames).toBeGreaterThan(5);
  // CONTROL, same test: the view's one movement button is Today. T1 measured the paged grid's Later; T9 (Workflow and
  // Timeline graphs Part 1, VP-10) retired Earlier and Later, so the control and the click-to-settle are re-pointed to Today.
  expect(await page.locator('#host').getByRole('button', { name: 'Today', exact: true }).count()).toBe(1);
  expect(await page.locator('#host').getByRole('button', { name: 'Later', exact: true }).count()).toBe(0);
  expect(typeof r.clickToSettleMs).toBe('number');
  expect(await page.evaluate(() => (window as unknown as { __stressClicked?: string | null }).__stressClicked)).toBe('Today');
});
