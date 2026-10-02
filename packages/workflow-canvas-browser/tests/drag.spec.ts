import { expect, test } from '@playwright/test';
import { dragBy, edgePath, node, nodeBox, openHarness, readDraftPositions } from './helpers';

// Edge `t:0` is To do → Doing (the template's first transition), and "To do" is the first state node drawn: it touches the dragged state.
test('25.500/25.501 a dragged state moves live under the pointer and its arrow follows, before release; control: a press-release without movement selects and does not move', async ({ page }) => {
  await openHarness(page);
  const name = await page.locator('.gn-state-node__name').first().innerText();
  const before = await nodeBox(page, name);
  const pathBefore = await edgePath(page, 0);
  // control first (25.501): no movement → selected, not moved
  await dragBy(page, name, 0, 0, { steps: 1 });
  expect(Math.abs((await nodeBox(page, name)).x - before.x)).toBeLessThan(1);
  await expect(node(page, name).locator('.gn-state-node')).toHaveClass(/gn-state-node--selected/);
  // the case (25.500)
  await dragBy(page, name, 200, 0, { steps: 10, release: false });
  const during = await nodeBox(page, name);
  expect(during.x - before.x).toBeGreaterThan(196);
  expect(during.x - before.x).toBeLessThan(204);
  expect(await edgePath(page, 0)).not.toBe(pathBefore);
  await page.mouse.up();
  const positions = await readDraftPositions(page);
  expect(Object.keys(positions).length).toBeGreaterThan(0);
});
