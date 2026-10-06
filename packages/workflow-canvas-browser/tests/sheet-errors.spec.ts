import { expect, test, type Page } from '@playwright/test';

/*
 * 27.077-27.078 (kg-walk-fixes items 2-3, release walk should-fixes #2-#3) on `harness/sheet-errors.html`. A failed read
 * or write carries the transport's `HTTP 503 for /v1/workspaces/<id>/…`, one unbroken run, and widened the ticket sheet
 * (and a refusal page) at a phone's width. Measured at a LITERAL viewport width, asserted in the leg, and each leg carries
 * its CONTROL: the overflow-wrap rules deleted from the live stylesheet, the same boxes measured again, RED.
 */
const SHEET_BOXES = [
  '.gn-ticket-sheet__links .gn-ticket-sheet__notes-error',
  '.gn-linked-from__error',
  '.gn-ticket-sheet__history-error',
  '.gn-ticket-sheet__attachments-error',
  '.gn-ticket-sheet__subtask-withheld',
  '.gn-ticket-sheet__refusal',
  '.gn-visibility__unreached',
];
const SHELL_BOXES = ['.gn-shell__refusal', '.gn-refusal.gn-refusal--server', '.gn-refusal.gn-refusal--transport', '.gn-notes__dialog-failure', '.gn-notes__scope-failure', '.publish-controls__banner-reason'];

type Box = { selector: string; scroll: number; client: number; outer: number };
async function measure(page: Page, scroller: string, selectors: string[]) {
  return page.evaluate(
    ({ scroller, selectors }) => {
      const el = (s: string) => {
        const found = document.querySelector<HTMLElement>(s);
        if (found === null) throw new Error(`no ${s}`);
        return found;
      };
      const box = (s: string) => ({ selector: s, scroll: el(s).scrollWidth, client: el(s).clientWidth, outer: el(s).getBoundingClientRect().width });
      return { width: window.innerWidth, scroller: box(scroller), boxes: selectors.map(box) };
    },
    { scroller, selectors },
  );
}
/** Deletes every style rule that declares `overflow-wrap` on one of the boxes' classes; returns how many. */
async function dropWrapRules(page: Page, selectors: string[]): Promise<number> {
  const classes = [...new Set(selectors.flatMap((s) => s.match(/\.gn-[\w-]+/g) ?? []))].filter((c) => c !== '.gn-ticket-sheet__links');
  return page.evaluate((classes) => {
    let dropped = 0;
    for (const sheet of [...document.styleSheets]) {
      for (let i = sheet.cssRules.length - 1; i >= 0; i--) {
        const rule = sheet.cssRules[i];
        if (rule instanceof CSSStyleRule && rule.style.overflowWrap !== '' && classes.some((c) => rule.selectorText.split(',').some((part) => part.trim() === c))) {
          sheet.deleteRule(i);
          dropped++;
        }
      }
    }
    return dropped;
  }, classes);
}
/**
 * A box overflows when its text runs past it (scroll > client) OR the box itself is wider than the scroller's content
 * box: the Links error is a grid item of `.gn-ticket-sheet__links`, and an unwrapped string widens its track, so its own
 * scroll equals its client while it pushes the sheet body sideways (measured: 734 px in a 312 px body at 360).
 */
const overflowing = (boxes: Box[], room: number) => boxes.filter((b) => b.scroll > b.client || b.outer > room).map((b) => b.selector);

for (const width of [360, 1280]) {
  test.describe(`at ${width} px`, () => {
    // Reduced motion: the Sheet's entry slide is a transform, so the boxes are read with the sheet at rest.
    test.use({ viewport: { width, height: 800 }, contextOptions: { reducedMotion: 'reduce' } });

    test(`27.078 the ticket sheet's failure sentences wrap; the sheet body never scrolls sideways (${width})`, async ({ page }) => {
      await page.goto('/sheet-errors.html');
      await expect(page.locator('.gn-ticket-sheet__notes-error')).toContainText(`HTTP 503 for /v1/workspaces/01J9GWS0000000000000000001/tickets/01J9GTKT000000000000000001/links`);
      await expect(page.locator('.gn-linked-from__error')).toContainText('/references?target=ticket%3A01J9GTKT000000000000000001');
      const fixed = await measure(page, '.gn-sheet__body', SHEET_BOXES);
      expect(fixed.width).toBe(width);
      expect(fixed.scroller.scroll).toBe(fixed.scroller.client);
      expect(overflowing(fixed.boxes, fixed.scroller.client)).toEqual([]);
      await expect(page.getByRole('button', { name: 'Add link' })).toBeInViewport({ ratio: 1 });

      // CONTROL, same leg: without the rules the transport strings overflow every box and widen the body
      expect(await dropWrapRules(page, SHEET_BOXES)).toBe(1);
      const bare = await measure(page, '.gn-sheet__body', SHEET_BOXES);
      expect(bare.scroller.scroll).toBeGreaterThan(bare.scroller.client);
      // Measured, not assumed: at 360 every one; in the desktop sheet (640 px) the three longest runs only.
      expect(overflowing(bare.boxes, bare.scroller.client)).toEqual(width === 360 ? SHEET_BOXES : SHEET_BOXES.filter((s) => /notes-error|history|attachments/.test(s)));
    });

    test(`27.078 a refusal page's panels wrap; the page never scrolls sideways (${width})`, async ({ page }) => {
      await page.goto('/sheet-errors.html?view=shell');
      await expect(page.locator('.gn-shell__refusal-wire')).toContainText('HTTP 503 for /v1/workspaces/01J9GWS0000000000000000001/projects/');
      const fixed = await measure(page, 'html', SHELL_BOXES);
      expect(fixed.width).toBe(width);
      expect(fixed.scroller.scroll).toBe(fixed.scroller.client);
      expect(overflowing(fixed.boxes, fixed.scroller.client)).toEqual([]);

      // CONTROL, same leg: without the rules (ui.css's and globals.css's) every panel overflows at a phone's width
      expect(await dropWrapRules(page, SHELL_BOXES)).toBe(2);
      const bare = await measure(page, 'html', SHELL_BOXES);
      if (width === 360) {
        expect(bare.scroller.scroll).toBeGreaterThan(bare.scroller.client);
        expect(overflowing(bare.boxes, bare.scroller.client)).toEqual(SHELL_BOXES);
      }
    });
  });
}
