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
