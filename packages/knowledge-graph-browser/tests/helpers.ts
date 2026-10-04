import type { Page } from '@playwright/test';
/** Waits until `read()` returns the same JSON twice 250 ms apart (≤ 10 s). SwiftShader runs at about 5 fps, so a timer is never the wait (§8). */
export async function waitStill(page: Page, read: () => Promise<unknown>): Promise<void> {
  let a = '', b = '-';
  for (let i = 0; i < 40 && a !== b; i += 1) {
    a = b;
    await page.waitForTimeout(250);
    b = JSON.stringify(await read());
  }
}

/** Still = the camera has not moved AND no frame was drawn for 250 ms (the icon atlas and label attachments draw late). */
export const still = (page: Page) => waitStill(page, () => page.evaluate(() => [window.__kg.probe!.camera(), window.__kg.probe!.frames()]));

/** The adapter harness (`harness/adapter.html`), loaded and still. */
export async function openAdapter(page: Page): Promise<void> {
  await page.goto('/adapter.html');
  await page.waitForFunction(() => window.__kg?.probe, null, { timeout: 60_000 });
  await still(page);
}

/** The stage's page offset: probe coordinates are px inside the stage. */
export async function stageAt(page: Page): Promise<{ left: number; top: number; width: number; height: number }> {
  return page.evaluate(() => {
    const r = document.querySelector('.gn-kg__stage')!.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  });
}

/** Viewport (stage) px of an item, as page px for `page.mouse`. */
export async function pagePoint(page: Page, ref: string): Promise<{ x: number; y: number }> {
  const s = await stageAt(page);
  const v = await page.evaluate((r) => window.__kg.probe!.viewportOf(r), ref);
  if (v === null) throw new Error(`no viewport position for ${ref}`);
  return { x: s.left + v.x, y: s.top + v.y };
}
