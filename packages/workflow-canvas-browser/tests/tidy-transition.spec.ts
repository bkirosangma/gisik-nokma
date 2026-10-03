import { expect, test, type Page } from '@playwright/test';
import { dragBy, nodeBox, openHarness, readDraftPositions } from './helpers';

// The harness seeds the simple kanban: To do, Doing, Done and the four transitions todo→doing, doing→todo, doing→done, done→doing.
const NAMES = ['To do', 'Doing', 'Done'];
const header = (page: Page) => page.locator('.workflow-builder-screen__actions');
const corner = (page: Page) => page.locator('.gn-workflow-canvas__corner');

async function boxes(page: Page) {
  return Promise.all(NAMES.map((name) => nodeBox(page, name)));
}
const overlaps = (a: { x: number; y: number; width: number; height: number }, b: typeof a) =>
  a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
function anyOverlap(list: Awaited<ReturnType<typeof boxes>>) {
  return list.some((a, i) => list.some((b, j) => i < j && overlaps(a, b)));
}

test('25.541 Tidy lays the states out with no two boxes overlapping, and Undo tidy puts every box back (±1 px) and the draft back exactly', async ({ page }) => {
  await openHarness(page);
  const laidOut = await boxes(page);
  // control: the seeded layout is already clear, so a pass below is not "nothing happened"
  expect(anyOverlap(laidOut)).toBe(false);
  // drag Doing onto To do, then Done onto the pair: the scattered layout Tidy has to undo
  await dragBy(page, 'Doing', -250, 6);
  await dragBy(page, 'Done', -500, 12);
  const scattered = await boxes(page);
  expect(Math.abs(scattered[1]!.x - laidOut[1]!.x)).toBeGreaterThan(100);
  const draftBefore = await readDraftPositions(page);

  await header(page).getByRole('button', { name: 'Tidy' }).click();
  const tidied = await boxes(page);
  expect(anyOverlap(tidied)).toBe(false);
  // every box is back on the layout (the seeded one), not merely apart
  tidied.forEach((box, at) => {
    expect(Math.abs(box.x - laidOut[at]!.x)).toBeLessThan(1);
    expect(Math.abs(box.y - laidOut[at]!.y)).toBeLessThan(1);
  });

  await header(page).getByRole('button', { name: 'Undo tidy' }).click();
  const restored = await boxes(page);
  restored.forEach((box, at) => {
    expect(Math.abs(box.x - scattered[at]!.x)).toBeLessThan(1);
    expect(Math.abs(box.y - scattered[at]!.y)).toBeLessThan(1);
  });
  expect(await readDraftPositions(page)).toEqual(draftBefore);
  await expect(header(page).getByRole('button', { name: 'Undo tidy' })).toHaveCount(0);
});

async function openAddTransition(page: Page) {
  await header(page).getByRole('button', { name: 'Add transition' }).click();
  return page.getByRole('dialog', { name: 'Add transition' });
}
async function pickOption(page: Page, form: ReturnType<Page['getByRole']>, picker: 'From' | 'To', option: string) {
  await form.getByRole('button', { name: new RegExp(`${picker}$`) }).click();
  await page.getByRole('listbox').getByRole('option', { name: option, exact: true }).click();
}

test('25.542 Add transition from Any state to a state draws a new arrow out of the any-state node', async ({ page }) => {
  await openHarness(page);
  const before = await page.locator('.react-flow__edge').count();
  expect(before).toBe(4);
  const form = await openAddTransition(page);
  await pickOption(page, form, 'From', 'Any state');
  await pickOption(page, form, 'To', 'To do');
  await form.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(page.locator('.react-flow__edge')).toHaveCount(before + 1);
  // the new transition is the fifth (index 4), and it leaves the any-state node
  const added = page.locator('[data-testid="rf__edge-t:4"]');
  await expect(added).toHaveAttribute('aria-label', /any-state/);
  await expect(page.locator('.react-flow__node-anyState')).toBeVisible();
});

test('25.543 an existing pair shows the reason and a disabled Add; control: a fresh pair enables it', async ({ page }) => {
  await openHarness(page);
  const form = await openAddTransition(page);
  const add = form.getByRole('button', { name: 'Add', exact: true });
  await pickOption(page, form, 'From', 'To do');
  await pickOption(page, form, 'To', 'Doing');
  await expect(form.getByText('That transition already exists')).toBeVisible();
  await expect(add).toBeDisabled();
  await pickOption(page, form, 'To', 'To do');
  await expect(form.getByText('Pick two different states')).toBeVisible();
  await expect(add).toBeDisabled();
  await pickOption(page, form, 'To', 'Done');
  await expect(form.locator('.gn-add-transition__reason')).toHaveCount(0);
  await expect(add).toBeEnabled();
  expect(await page.locator('.react-flow__edge').count()).toBe(4);
});

test.describe('phone', () => {
  test.use({ hasTouch: true });
  test('25.544 on a phone Add transition is in the header and Tidy is in the canvas corner, both reachable by touch', async ({ page }) => {
    await openHarness(page, { phone: true });
    const viewport = page.viewportSize()!;
    const inView = async (locator: ReturnType<Page['locator']>) => {
      const box = (await locator.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.height).toBeGreaterThanOrEqual(44);
      return box;
    };
    const addTransition = header(page).getByRole('button', { name: 'Add transition' });
    await inView(addTransition);
    // the header's own Tidy is hidden at this width: one Tidy, in the corner
    await expect(page.getByRole('button', { name: 'Tidy' })).toHaveCount(1);
    const tidy = corner(page).getByRole('button', { name: 'Tidy' });
    await inView(tidy);

    await tidy.tap();
    await expect(corner(page).getByRole('button', { name: 'Undo tidy' })).toBeVisible();
    await corner(page).getByRole('button', { name: 'Undo tidy' }).tap();
    await expect(corner(page).getByRole('button', { name: 'Undo tidy' })).toHaveCount(0);

    await addTransition.tap();
    const form = page.getByRole('dialog', { name: 'Add transition' });
    await expect(form).toBeVisible();
    const formBox = (await form.boundingBox())!;
    expect(formBox.x).toBeGreaterThanOrEqual(0);
    expect(formBox.x + formBox.width).toBeLessThanOrEqual(viewport.width);
  });
});
