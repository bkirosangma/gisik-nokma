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
  // the case (25.500). `nodeDragThreshold={4}`: React Flow measures the drag from the first move past 4 px, so the state trails the
  // pointer by that first distance (6 px at 2 px per move) and by nothing after it.
  await dragBy(page, name, 200, 0, { steps: 100, release: false });
  const during = await nodeBox(page, name);
  expect(during.x - before.x).toBeGreaterThan(192);
  expect(during.x - before.x).toBeLessThan(204);
  // the lifted look while held: the wrapper's `dragging` class (ui.css `.react-flow__node.dragging`), the 1.02 scale, the drag-image shadow
  await expect(node(page, name)).toHaveClass(/\bdragging\b/);
  const lifted = node(page, name).locator('.gn-state-node');
  await expect(lifted).toHaveCSS('transform', /^matrix\(1\.02,/);
  await expect(lifted).not.toHaveCSS('box-shadow', 'none'); // neo, the harness's style
  expect(await edgePath(page, 0)).not.toBe(pathBefore);
  await page.mouse.up();
  const positions = await readDraftPositions(page);
  expect(Object.keys(positions).length).toBeGreaterThan(0);
});

test('25.504 a drag that starts on a nodrag control (the Category select) does not move the state; the control still opens', async ({ page }) => {
  await openHarness(page);
  const name = await page.locator('.gn-state-node__name').first().innerText();
  const before = await nodeBox(page, name);
  const select = node(page, name).locator('.gn-state-node__category [aria-label="Category"]');
  const s = (await select.boundingBox())!;
  await page.mouse.move(s.x + 5, s.y + 5);
  await page.mouse.down();
  await page.mouse.move(s.x + 150, s.y + 5, { steps: 8 });
  await page.mouse.up();
  expect(Math.abs((await nodeBox(page, name)).x - before.x)).toBeLessThan(1);
  // react-aria opens the menu on the press itself, so the drag's own press may have left it open: settle it closed, then use it.
  const trigger = node(page, name).locator('button[aria-haspopup="listbox"]');
  await page.keyboard.press('Escape');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
});

test('25.517 Escape during a drag puts the state back at its start, keeps it there while the pointer still moves, and commits nothing on release', async ({ page }) => {
  await openHarness(page);
  const name = await page.locator('.gn-state-node__name').first().innerText();
  const before = await nodeBox(page, name);
  const positionsBefore = await readDraftPositions(page);
  await dragBy(page, name, 150, 0, { steps: 75, release: false });
  expect((await nodeBox(page, name)).x - before.x).toBeGreaterThan(142);
  await page.keyboard.press('Escape');
  expect(Math.abs((await nodeBox(page, name)).x - before.x)).toBeLessThan(1);
  // React Flow is still tracking the pointer; the working copy drops its moves
  await page.mouse.move(before.x + before.width / 2 + 230, before.y + 12, { steps: 6 });
  expect(Math.abs((await nodeBox(page, name)).x - before.x)).toBeLessThan(1);
  await page.mouse.up();
  expect(Math.abs((await nodeBox(page, name)).x - before.x)).toBeLessThan(1);
  expect(await readDraftPositions(page)).toEqual(positionsBefore);
});
