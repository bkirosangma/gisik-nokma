import { expect, test } from '@playwright/test';

type Sweep = { frames: number; fps: number; worstMs: number; p99Ms: number; over167: number; overAt: number[] };
type Stress = Sweep & { cards: number; fog: number; edges: number; searched: number; renderer: string; firstMs: number; pass2: Sweep };
async function stress(page: import('@playwright/test').Page): Promise<Stress> {
  await page.goto('/stress.html?auto=1');
  await page.waitForFunction(() => (window as unknown as { __stress?: unknown }).__stress !== undefined, null, { timeout: 60_000 });
  return page.evaluate(() => (window as unknown as { __stress: Stress }).__stress);
}

test('27.204 the stress scene draws 500 clear + 2,000 fog + 3,000 edges through the shipped program and reports its frame rate', async ({ page }) => {
  const r = await stress(page);
  console.log(`kg-stress (LOCAL, headless): ${JSON.stringify(r)}`);
  expect(r.cards).toBe(500);
  expect(r.fog).toBe(2000);
  expect(r.edges).toBe(3000);
  expect(r.searched).toBeGreaterThan(0); // the blocks/ref edges into a card end at its border (owner ruling B)
  expect(r.fps).toBeGreaterThan(0); // a floor: SwiftShader is not a GPU number
});

test('27.205 desktop bar (spec §7): ≥ 60 fps and worst frame ≤ 16.7 ms on a GPU (KG_GPU=1)', async ({ browser }) => {
  test.skip(process.env['KG_GPU'] !== '1', 'kg-stress: set KG_GPU=1 to launch Chromium on the GPU (--use-angle=metal) and assert spec §7: ≥ 60 fps, worst ≤ 16.7 ms');
  const context = await browser.browserType().launch({ args: ['--use-angle=metal', '--ignore-gpu-blocklist'] }).then((b) => b.newContext({ viewport: { width: 1280, height: 1000 } }));
  const page = await context.newPage();
  const r = await stress(page);
  console.log(`kg-stress (LOCAL, GPU): ${JSON.stringify(r)}`);
  expect(r.renderer).not.toMatch(/SwiftShader/i);
  expect(r.fps).toBeGreaterThanOrEqual(60);
  expect(r.worstMs).toBeLessThanOrEqual(16.7);
  await context.close();
});

test('27.206 phone proxy: Pixel 7 emulation with a 4× CPU throttle, measured and printed (recorded, not asserted)', async ({ browser }) => {
  const { devices } = await import('@playwright/test');
  const context = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  const r = await stress(page);
  console.log(`kg-stress (LOCAL, Pixel 7 emulation, CPU ×4, ${r.renderer}): ${r.fps} fps, worst ${r.worstMs} ms`);
  expect(r.edges).toBe(3000);
  await context.close();
});
