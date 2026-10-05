import { expect, test, type Locator, type Page } from '@playwright/test';
import { dragBy, edgePath, node, nodeBox, openHarness } from './helpers';

// Full-screen editing (G-9 T5, spec §4) in Chromium. The harness seeds the simple kanban: To do, Doing, Done and four transitions.
const screenRoot = (page: Page) => page.locator('.workflow-builder-screen');
const headerActions = (page: Page) => page.locator('.workflow-builder-screen__actions');
/** The canvas's own Full screen button (top-right `Panel`), as opposed to the header's. */
const canvasRegion = (page: Page) => page.getByRole('region', { name: 'Canvas' });
const toolbar = (page: Page) => page.locator('.gn-wf-toolbar');
const panel = (page: Page) => page.getByRole('region', { name: 'Workflow panel' });

type Box = { x: number; y: number; width: number; height: number };
async function boxOf(locator: Locator): Promise<Box> {
  return (await locator.boundingBox())!;
}
/** React Flow's viewport as numbers: `translate(Xpx, Ypx) scale(S)`. */
async function viewport(page: Page) {
  const transform = await page.locator('.react-flow__viewport').evaluate((el) => (el as HTMLElement).style.transform);
  const match = /translate\(([-\d.]+)px, ([-\d.]+)px\) scale\(([-\d.]+)\)/.exec(transform);
  expect(match, transform).not.toBeNull();
  return { x: Number(match![1]), y: Number(match![2]), scale: Number(match![3]) };
}
async function enterFullScreen(page: Page) {
  await headerActions(page).getByRole('button', { name: 'Full screen' }).click();
  await expect(screenRoot(page)).toHaveAttribute('data-fullscreen', 'true');
}
/** The stored draft (not the `:fullscreen` / `:panelWidth` entries beside it). */
async function storedDraft(page: Page) {
  return page.evaluate(() => {
    const key = Object.keys(sessionStorage).find((candidate) => candidate.startsWith('gn-workflow-draft:') && candidate.split(':').length === 3);
    return key === undefined ? null : (JSON.parse(sessionStorage.getItem(key)!) as { def: { name: string } });
  });
}
async function allBoxes(page: Page) {
  return page.locator('.react-flow__node').evaluateAll((els) =>
    els.map((el) => {
      const { x, y, width, height } = el.getBoundingClientRect();
      return { x, y, width, height };
    }),
  );
}
const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
const anyOverlap = (list: Box[]) => list.some((a, i) => list.some((b, j) => i < j && overlaps(a, b)));
async function pickOption(page: Page, form: Locator, picker: 'From' | 'To', option: string) {
  await form.getByRole('button', { name: new RegExp(`${picker}$`) }).click();
  await page.getByRole('listbox').getByRole('option', { name: option, exact: true }).click();
}

test('25.551 full screen covers the window, keeps the viewport, every toolbar control works, and Exit restores the normal box', async ({ page }) => {
  await openHarness(page);
  const w = page.viewportSize()!.width;
  const h = page.viewportSize()!.height;
  const normal = await boxOf(screenRoot(page));
  // precondition: the normal layout does NOT cover the window (the harness body keeps its 8 px margin)
  expect(normal.x > 0.5 || normal.y > 0.5 || Math.abs(normal.width - w) > 0.5 || Math.abs(normal.height - h) > 0.5).toBe(true);
  const before = await viewport(page);

  await enterFullScreen(page);
  const full = await boxOf(screenRoot(page));
  expect(full.x).toBeCloseTo(0, 0);
  expect(full.y).toBeCloseTo(0, 0);
  expect(Math.abs(full.width - w)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(full.height - h)).toBeLessThanOrEqual(0.5);
  // spec §4.1: zoom and pan carry over, no re-fit
  const after = await viewport(page);
  expect(Math.abs(after.x - before.x)).toBeLessThanOrEqual(0.5);
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(0.5);
  expect(after.scale).toBeCloseTo(before.scale, 5);

  const bar = toolbar(page);
  // rename
  await bar.getByRole('textbox', { name: 'Workflow name' }).fill('Renamed in full screen');
  await expect.poll(async () => (await storedDraft(page))?.def.name).toBe('Renamed in full screen');
  // Publish (a template draft has no base, so no mapping step; the fake gateway accepts)
  await bar.getByRole('button', { name: 'Publish' }).click();
  await expect(page.getByText('Version 1 published.', { exact: true })).toBeVisible();
  // Tidy: two states dragged onto each other first, then Tidy offers "Undo tidy" and no two boxes overlap
  await dragBy(page, 'Doing', -250, 6);
  await bar.getByRole('button', { name: 'Tidy' }).click();
  await expect(bar.getByRole('button', { name: 'Undo tidy' })).toBeVisible();
  expect(anyOverlap(await allBoxes(page))).toBe(false);
  // zoom in
  const unzoomed = (await viewport(page)).scale;
  await bar.getByRole('group', { name: 'Zoom' }).getByRole('button', { name: 'Zoom in' }).click();
  await expect.poll(async () => (await viewport(page)).scale).toBeGreaterThan(unzoomed);
  // Add transition: a pair that does not exist yet (To do → Done)
  const edges = await page.locator('.react-flow__edge').count();
  await bar.getByRole('button', { name: 'Add transition' }).click();
  const form = page.getByRole('dialog', { name: 'Add transition' });
  await pickOption(page, form, 'From', 'To do');
  await pickOption(page, form, 'To', 'Done');
  await form.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.locator('.react-flow__edge')).toHaveCount(edges + 1);
  // Add state
  const nodes = await page.locator('.react-flow__node').count();
  await bar.getByRole('button', { name: 'Add state' }).click();
  await expect(page.locator('.react-flow__node')).toHaveCount(nodes + 1);
  // the Issues badge opens the Issues tab
  await bar.getByRole('button', { name: /^Issues \d+$/ }).click();
  await expect(panel(page).getByRole('tab', { name: 'Issues' })).toHaveAttribute('aria-selected', 'true');
  await expect(panel(page).locator('.issues-panel').first()).toBeVisible();
  // Exit restores the normal layout
  await bar.getByRole('button', { name: 'Exit full screen' }).click();
  await expect(screenRoot(page)).toHaveAttribute('data-fullscreen', 'false');
  const back = await boxOf(screenRoot(page));
  for (const side of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(back[side] - normal[side]), side).toBeLessThanOrEqual(1);
});

test('25.552 a member can enter full screen and is offered no Add state, Add transition or Tidy; control first: the owner is', async ({ page }) => {
  const authoring = ['Add state', 'Add transition', 'Tidy'];
  // control, same test: the owner in full screen sees each one, which proves the locators
  await openHarness(page);
  await enterFullScreen(page);
  for (const name of authoring) expect(await page.getByRole('button', { name, exact: true }).count(), name).toBeGreaterThanOrEqual(1);

  await openHarness(page, { role: 'member' });
  await expect(headerActions(page).getByRole('button', { name: 'Full screen' })).toBeVisible();
  await expect(canvasRegion(page).getByRole('button', { name: 'Full screen' })).toBeVisible();
  await enterFullScreen(page);
  for (const name of authoring) expect(await page.getByRole('button', { name, exact: true }).count(), name).toBe(0);
  // narrower, where zoom and Tidy fold into More: the menu opens (its zoom items prove it) and holds no Tidy either
  await page.setViewportSize({ width: 700, height: 800 });
  await toolbar(page).getByRole('button', { name: 'More' }).click();
  const menu = page.getByRole('menu', { name: 'More' });
  await expect(menu.getByRole('menuitem', { name: 'Zoom in' })).toBeVisible();
  for (const name of authoring) expect(await page.getByRole('menuitem', { name, exact: true }).count(), name).toBe(0);
  for (const name of authoring) expect(await page.getByRole('button', { name, exact: true }).count(), name).toBe(0);
});

test('25.553 a drag inside full screen moves the state live under the pointer, and its arrow follows', async ({ page }) => {
  await openHarness(page);
  await enterFullScreen(page);
  const name = await page.locator('.gn-state-node__name').first().innerText();
  const before = await nodeBox(page, name);
  const pathBefore = await edgePath(page, 0);
  await dragBy(page, name, 200, 0, { steps: 100, release: false });
  const during = await nodeBox(page, name);
  expect(during.x - before.x).toBeGreaterThan(192);
  expect(during.x - before.x).toBeLessThan(204);
  expect(await edgePath(page, 0)).not.toBe(pathBefore);
  await page.mouse.up();
});

test.describe('phone', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('25.554 on a 390×844 touch phone: the toolbar row and its More menu, a bottom sheet on a tap, and a live touch drag', async ({ page }) => {
    await openHarness(page, { phone: true });
    await headerActions(page).getByRole('button', { name: 'Full screen' }).tap();
    await expect(screenRoot(page)).toHaveAttribute('data-fullscreen', 'true');
    const bar = toolbar(page);
    await expect(bar.getByRole('textbox', { name: 'Workflow name' })).toBeVisible();
    for (const name of ['Add state', 'Add transition', 'Publish', 'More', 'Exit full screen']) {
      await expect(bar.getByRole('button', { name, exact: true }), name).toBeVisible();
    }
    // exactly those: no Tidy, no zoom and no Issues badge in the row
    await expect(bar.getByRole('button')).toHaveCount(5);
    await expect(bar.getByRole('textbox')).toHaveCount(1);
    await bar.getByRole('button', { name: 'More' }).tap();
    const menu = page.getByRole('menu', { name: 'More' });
    for (const name of ['Zoom out', 'Zoom in', 'Fit to screen', 'Tidy']) {
      await expect(menu.getByRole('menuitem', { name, exact: true }), name).toBeVisible();
    }
    await expect(menu.getByRole('menuitem', { name: /^Issues \d+$/ })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(menu).toHaveCount(0);

    // a tap on a state opens the bottom sheet on the Selection tab
    const name = await page.locator('.gn-state-node__name').first().innerText();
    await node(page, name).locator('.gn-state-node__name').tap();
    const sheet = panel(page);
    await expect(sheet).toBeVisible();
    const box = await boxOf(sheet);
    expect(Math.abs(box.y + box.height - 844)).toBeLessThanOrEqual(1);
    expect(Math.abs(box.width - 390)).toBeLessThanOrEqual(1);
    expect(box.height).toBeLessThanOrEqual(0.7 * 844 + 1);
    await expect(sheet.getByRole('tab', { name: 'Selection' })).toHaveAttribute('aria-selected', 'true');
    await expect(sheet.getByRole('textbox', { name: 'State name' })).toHaveValue(name);
    // G-9 T5 FIX 1 (O2): the bound above is from above only, and a sheet capped at 7vh (59 px) passes it. From below: the sheet is
    // tall enough to show what it opened for, the tapped state's State name field lying wholly inside it.
    const field = await boxOf(sheet.getByRole('textbox', { name: 'State name' }));
    expect(field.y).toBeGreaterThanOrEqual(box.y);
    expect(field.y + field.height).toBeLessThanOrEqual(box.y + box.height);
    await sheet.getByRole('button', { name: 'Close panel' }).tap();
    await expect(sheet).toHaveCount(0);

    // a touch drag moves the state live (React Flow's drag listens to touchstart, so the touches are real CDP touch events)
    const start = await nodeBox(page, name);
    const pathBefore = await edgePath(page, 0);
    const cdp = await page.context().newCDPSession(page);
    const x = start.x + start.width / 2;
    const y = start.y + 12;
    const dy = 120;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let step = 1; step <= 40; step += 1) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (dy * step) / 40 }] });
    }
    const during = await nodeBox(page, name);
    // The dragged distance on the dragged axis, within one grid step at this zoom plus React Flow's 4 px start threshold: the phone
    // opens at a readable zoom (~1.1), where the drag's 16 flow px grid is ~18 screen px, so the plan's ±6 is tighter than the snap.
    const { scale } = await viewport(page);
    expect(Math.abs(during.y - start.y - dy)).toBeLessThanOrEqual(16 * scale + 6);
    expect(during.y - start.y).toBeGreaterThan(dy / 2); // it moved, a long way, before the touch ended
    expect(await edgePath(page, 0)).not.toBe(pathBefore);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  });
});

test('25.555 the Escape ladder in Chromium at 700 px: the More menu, then the panel, then full screen', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 800 });
  await openHarness(page);
  await enterFullScreen(page);
  const name = await page.locator('.gn-state-node__name').nth(1).innerText();
  await node(page, name).locator('.gn-state-node__name').click();
  await toolbar(page).getByRole('button', { name: 'More' }).click();
  const menu = page.getByRole('menu', { name: 'More' });
  // precondition: all three layers are up
  await expect(menu).toBeVisible();
  await expect(panel(page)).toBeVisible();
  await expect(screenRoot(page)).toHaveAttribute('data-fullscreen', 'true');
  // at this width the toolbar wraps, and the panel still starts below it (its tabs are not under the toolbar)
  const bar = await boxOf(toolbar(page));
  expect(bar.height).toBeGreaterThan(70); // control: two rows, so the clearance is measured, not the one-row default
  // 12 px clear of the toolbar's measured bottom (the toolbar's own inset), not the one-row default's 72 px from the top
  expect(Math.abs((await boxOf(panel(page))).y - (bar.y + bar.height) - 12)).toBeLessThanOrEqual(0.5);

  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await expect(panel(page)).toBeVisible();
  await expect(screenRoot(page)).toHaveAttribute('data-fullscreen', 'true');

  await page.keyboard.press('Escape');
  await expect(panel(page)).toHaveCount(0);
  await expect(screenRoot(page)).toHaveAttribute('data-fullscreen', 'true');

  await page.keyboard.press('Escape');
  await expect(screenRoot(page)).toHaveAttribute('data-fullscreen', 'false');
});

test('25.556 a reload in the same tab keeps full screen on; control: after Exit a reload keeps it off', async ({ page }) => {
  await openHarness(page, { stableDraft: true });
  await enterFullScreen(page);
  await page.reload();
  await page.locator('.react-flow__node').first().waitFor();
  await expect(screenRoot(page)).toHaveAttribute('data-fullscreen', 'true');
  // control, same test
  await toolbar(page).getByRole('button', { name: 'Exit full screen' }).click();
  await expect(screenRoot(page)).toHaveAttribute('data-fullscreen', 'false');
  await page.reload();
  await page.locator('.react-flow__node').first().waitFor();
  await expect(screenRoot(page)).toHaveAttribute('data-fullscreen', 'false');
});
