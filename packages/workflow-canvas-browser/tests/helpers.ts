import type { Page } from '@playwright/test';

export async function openHarness(page: Page, opts: { phone?: boolean; role?: string; seed?: string } = {}) {
  const q = new URLSearchParams({ phone: opts.phone ? '1' : '0', role: opts.role ?? 'owner', seed: opts.seed ?? '' });
  if (opts.phone) await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/?${q}`);
  await page.locator('.react-flow__node').first().waitFor();
}
export const node = (page: Page, name: string) =>
  page.locator('.react-flow__node', { has: page.locator('.gn-state-node__name', { hasText: name }) });
export async function nodeBox(page: Page, name: string) {
  return (await node(page, name).boundingBox())!;
}
export async function edgePath(page: Page, index: number) {
  return page.locator(`[data-testid="rf__edge-t:${index}"] path`).first().getAttribute('d');
}
export async function dragBy(page: Page, name: string, dx: number, dy: number, o: { steps?: number; release?: boolean } = {}) {
  const b = await nodeBox(page, name);
  const x = b.x + b.width / 2;
  const y = b.y + 12; // the header, never a nodrag control
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + dx, y + dy, { steps: o.steps ?? 10 });
  if (o.release !== false) await page.mouse.up();
}
export async function readDraftPositions(page: Page) {
  return page.evaluate(() => (window as unknown as { __draftPositions: () => Record<string, unknown> }).__draftPositions());
}
