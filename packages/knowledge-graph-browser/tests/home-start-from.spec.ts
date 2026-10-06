import { expect, test, type Page } from '@playwright/test';
import { dropSharedNowrap } from './css-controls.js';

/*
 * Home's body in a real browser (kg-walk-fixes-2; the release walk's P2-1(b), item 1), on `harness/home-page.html`: the
 * web app's REAL `HomeNumbers`, `HomeGraphPlaceholder` and `HomeGraph`, ui.css and globals.css, neo light. Every leg sets
 * a LITERAL viewport width and asserts `window.innerWidth` took it.
 *
 * 27.686: Start from's two labels are ONE line each (`Range.getClientRects()` of the label) with either selected, the
 *   track fits its row, and neo's bar lies below the selected label and within it. CONTROL, same leg: the shared item's
 *   `nowrap` removed from the live stylesheet, "This workspace" breaks onto two lines and the bar crosses it.
 */

async function open(page: Page, width: number, query = ''): Promise<void> {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/home-page.html${query}`);
  // Vite may discover a dependency on a fresh cache and reload the page once: read nothing before the load that sticks.
  await page.waitForLoadState('networkidle');
  expect(await page.evaluate(() => window.innerWidth), 'the literal viewport width took').toBe(width);
}

type Option = { name: string; selected: boolean; lines: number; textLeft: number; textRight: number; textBottom: number; bar: { top: number; centre: number } | null };

function startFrom(page: Page): Promise<{ sw: number; cw: number; options: Option[] }> {
  return page.evaluate(() => {
    const track = document.querySelector<HTMLElement>('[role="tablist"][aria-label="Start from"]')!;
    const options = [...track.querySelectorAll<HTMLElement>('[role="tab"]')].map((tab) => {
      const box = tab.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(tab);
      const text = range.getBoundingClientRect();
      const after = getComputedStyle(tab, '::after');
      const bar =
        after.content === 'none' || after.content === 'normal'
          ? null
          : { top: box.bottom - parseFloat(after.bottom) - parseFloat(after.height), centre: box.left + parseFloat(after.left) };
      return { name: tab.textContent ?? '', selected: tab.getAttribute('aria-selected') === 'true', lines: range.getClientRects().length, textLeft: text.left, textRight: text.right, textBottom: text.bottom, bar };
    });
    return { sw: track.scrollWidth, cw: track.clientWidth, options };
  });
}

function expectUnderBar(on: Option): void {
  expect(on.bar, `${on.name}: neo draws the selected bar`).not.toBeNull();
  expect(on.bar!.top, `${on.name}: the bar starts below the label's last line`).toBeGreaterThanOrEqual(on.textBottom);
  expect(on.bar!.centre, `${on.name}: the bar is under the label`).toBeGreaterThanOrEqual(on.textLeft);
  expect(on.bar!.centre, `${on.name}: the bar is under the label`).toBeLessThanOrEqual(on.textRight);
}

for (const width of [320, 360, 390, 1280] as const) {
  test(`27.686 at a literal ${width}px Start from's labels are one line each, under the bar; CONTROL: without the shared nowrap "This workspace" breaks`, async ({ page }) => {
    await open(page, width);
    await expect(page.getByRole('tablist', { name: 'Start from' })).toBeVisible();
    for (const name of ['Me', 'This workspace']) {
      await page.getByRole('tab', { name }).click();
      await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
      const m = await startFrom(page);
      for (const option of m.options) expect(option.lines, `${option.name}: one line with ${name} selected`).toBe(1);
      expect(m.sw, 'the track fits its row').toBeLessThanOrEqual(m.cw);
      const on = m.options.find((x) => x.selected)!;
      expect(on.name).toBe(name);
      expectUnderBar(on);
    }
    expect(await dropSharedNowrap(page), 'the shared one-line declaration was found and removed').toBe(1);
    const bare = await startFrom(page);
    const workspace = bare.options.find((x) => x.name === 'This workspace')!;
    expect(workspace.selected).toBe(true);
    expect(workspace.lines, 'CONTROL: without nowrap "This workspace" breaks at its space').toBe(2);
    expect(workspace.bar!.top, 'CONTROL: and the bar crosses its second line').toBeLessThan(workspace.textBottom);
  });
}
