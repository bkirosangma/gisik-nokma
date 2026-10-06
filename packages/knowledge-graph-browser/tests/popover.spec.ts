import { expect, test, type Page } from '@playwright/test';

/*
 * 27.706 (release walk row 5): Add link's first Enter on a just-loaded sheet opened the picker and closed it at once, in 19
 * of 20 trials on the dev stack (`roles/mut-out/kg-walk-fixes-3/probe-addlink-trace*.mjs`): the scroll that brought Add
 * link into view dispatches its scroll event at the next frame, which came after Enter opened the popover, and react-aria's
 * close-on-scroll closed it. `harness/popover.tsx` is the same ui Sheet and Popover. Each run loads the page fresh,
 * scrolls the trigger into view, focuses it and presses Enter with no frame in between, as the walk did.
 */
const errors: string[] = [];
test.afterEach(() => {
  expect(errors.splice(0)).toEqual([]);
});

/** Two animation frames and 150 ms: long past the frame a pending scroll event is dispatched in. */
const settle = (page: Page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 150)))));

test('27.706 20 fresh loads: Enter on Add link, just scrolled into view, opens the picker on the FIRST press every time; control: a scroll that moves the trigger still closes it', async ({ page }) => {
  page.on('pageerror', (e) => errors.push(String(e)));
  const results: boolean[] = [];
  for (let i = 0; i < 20; i += 1) {
    await page.goto('/popover.html');
    const add = page.getByRole('button', { name: 'Add link' });
    await add.scrollIntoViewIfNeeded();
    await add.focus();
    await page.keyboard.press('Enter');
    await settle(page);
    results.push(await page.getByRole('dialog', { name: 'Add link' }).isVisible());
  }
  expect(results).toEqual(Array.from({ length: 20 }, () => true));
  // the haystack: the sheet body is the scroller and it was scrolled (the trigger was past its fold), and one press opened once
  expect(await page.evaluate(() => [document.querySelector('.gn-sheet__body')!.scrollTop > 0, window.__pop.opens])).toEqual([true, 1]);

  // CONTROL, same test: a real scroll of the sheet body moves the trigger, and close-on-scroll closes the picker as before
  await page.evaluate(() => {
    document.querySelector('.gn-sheet__body')!.scrollTop -= 120;
  });
  await settle(page);
  await expect(page.getByRole('dialog', { name: 'Add link' })).toHaveCount(0);
  expect(await page.getByRole('button', { name: 'Add link' }).getAttribute('aria-expanded')).toBe('false');
});
