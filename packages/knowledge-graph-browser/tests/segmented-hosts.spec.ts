import { expect, test, type Page } from '@playwright/test';
import { dropRules } from './css-controls.js';

/*
 * The two segmented hosts whose one-line labels outgrow their box on a phone (kg-walk-fixes-2 item 1, case 27.686), on
 * `harness/segmented-hosts.html`: the REAL `/account` Appearance card and the REAL My work Group pair, ui.css and
 * globals.css, neo light, at LITERAL widths. Every label is one line (the shared item's `nowrap`, 27.686), so:
 *
 * - /account's Style trims its side padding to 0.5rem up to 26rem and fits its card from 360px; up to 359px it scrolls
 *   inside itself with the selected style wholly in view (`fade keepSelectedInView`), and the keyboard reaches both ends.
 *   Nothing spills the card at any width.
 * - My work's Group trims its side padding to 0.625rem up to 22.5rem and fits its row at 320.
 *
 * The boxes are pinned to the live app's (measured on the stack at 320/360/390: the card's content `viewport - 88px`, the
 * Group row `viewport - 48px`), so a harness whose chrome drifted fails instead of measuring air. CONTROLs, same leg, on the
 * live stylesheet: at 390 the 26rem padding arm deleted, Style spills its card; at 320 the scroller arm deleted, Style
 * spills its card, and the Group arm deleted, the pair spills its row.
 */

type Box = { sw: number; cw: number };
type Track = Box & { left: number; right: number; overflowX: string; faded: boolean; atStart: string | undefined; atEnd: string | undefined; fade: number };
type Item = { name: string; selected: boolean; lines: number; left: number; right: number; padLeft: number };
type Hosts = {
  style: { track: Track; group: Box; card: Box; items: Item[] };
  theme: { track: Track; items: Item[] };
  grouping: { track: Track; row: Box; items: Item[] };
};

function measure(page: Page): Promise<Hosts> {
  return page.evaluate(() => {
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const box = (element: Element): { sw: number; cw: number } => ({ sw: element.scrollWidth, cw: element.clientWidth });
    const track = (element: HTMLElement) => {
      const raw = getComputedStyle(element).getPropertyValue('--gn-scroll-fade-size').trim();
      const r = element.getBoundingClientRect();
      return {
        ...box(element),
        left: r.left,
        right: r.right,
        overflowX: getComputedStyle(element).overflowX,
        faded: element.classList.contains('gn-scroll-fade'),
        atStart: element.dataset['atStart'],
        atEnd: element.dataset['atEnd'],
        fade: raw.endsWith('rem') ? parseFloat(raw) * rootPx : parseFloat(raw) || 0,
      };
    };
    const items = (element: HTMLElement) =>
      [...element.querySelectorAll<HTMLElement>('[role="tab"], [role="radio"]')].map((item) => {
        const range = document.createRange();
        range.selectNodeContents(item);
        const r = item.getBoundingClientRect();
        return {
          name: item.textContent ?? '',
          selected: item.getAttribute('aria-selected') === 'true' || item.getAttribute('aria-checked') === 'true',
          lines: range.getClientRects().length,
          left: r.left,
          right: r.right,
          padLeft: parseFloat(getComputedStyle(item).paddingLeft),
        };
      });
    const style = document.querySelector<HTMLElement>('[role="tablist"][aria-label="Style"]')!;
    const theme = document.querySelector<HTMLElement>('[role="tablist"][aria-label="Theme"]')!;
    const grouping = document.querySelector<HTMLElement>('.gn-group-toggle')!;
    return {
      style: { track: track(style), group: box(style.closest('.gn-account__appearance-group')!), card: box(style.closest('.gn-account__appearance')!), items: items(style) },
      theme: { track: track(theme), items: items(theme) },
      grouping: { track: track(grouping), row: box(grouping.closest('.gn-my-work-control')!), items: items(grouping) },
    };
  });
}

/** The item is wholly inside the track, and clear of the fade on any edge that is faded (`data-at-* = false`). */
function inView(track: Track, item: Item): boolean {
  const start = track.left + (track.atStart === 'false' ? track.fade : 0);
  const end = track.right - (track.atEnd === 'false' ? track.fade : 0);
  return item.left >= start - 0.5 && item.right <= end + 0.5;
}

// Each arm's bound is met from both sides (STEPS-common P11): the scroller's 22.4375rem at 359 / 360, the Group arm's 22.5rem
// at 360 / 361, the half padding's 26rem at 416 / 417.
for (const width of [320, 359, 360, 361, 390, 412, 416, 417, 1280] as const) {
  test(`27.686 at a literal ${width}px /account's Style and My work's Group keep one-line labels inside their box`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/segmented-hosts.html');
    // Vite may discover a dependency on a fresh cache and reload the page once: read nothing before the load that sticks.
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => window.innerWidth), 'the literal viewport width took').toBe(width);
    await expect(page.getByRole('tablist', { name: 'Style' })).toBeVisible();
    await expect(page.locator('.gn-group-toggle')).toBeVisible();
    const m = await measure(page);
    if (width <= 412) {
      expect(m.style.group.cw, "the harness card is the live app's: viewport - 88px").toBe(width - 88);
      expect(m.grouping.row.cw, "the harness row is the live app's: viewport - 48px").toBe(width - 48);
    }
    for (const item of [...m.style.items, ...m.theme.items, ...m.grouping.items]) expect(item.lines, `${item.name}: one line`).toBe(1);

    // /account's Style.
    expect(m.style.card, 'nothing spills the Appearance card').toEqual({ sw: m.style.card.cw, cw: m.style.card.cw });
    expect(m.style.group.sw, 'nothing spills the Style group').toBe(m.style.group.cw);
    for (const item of m.style.items) expect(item.padLeft, `${item.name}: ${width <= 416 ? '0.5rem' : '1rem'} a side`).toBe(width <= 416 ? 8 : 16);
    const selected = m.style.items.find((x) => x.selected)!;
    expect(selected.name, 'neo is the selected style').toBe('Neumorphic');
    expect(m.style.track.overflowX, width <= 359 ? 'up to 359px the Style track scrolls inside itself' : 'from 360px no scroller').toBe(width <= 359 ? 'auto' : 'visible');
    if (width <= 359) {
      expect(m.style.track.sw, 'and it really scrolls').toBeGreaterThan(m.style.track.cw);
      expect(m.style.track.faded, 'the scrolling track fades the side it hides').toBe(true);
      // The reveal scrolls smoothly (no reduced motion here), so the arrival is polled.
      await expect.poll(async () => {
        const now = (await measure(page)).style;
        return inView(now.track, now.items.find((x) => x.selected)!);
      }, 'the selected style is wholly in view on arrival').toBe(true);
      await expect.poll(async () => (await measure(page)).style.track.atStart, 'and the start it scrolled past is faded').toBe('false');
      const step = async (key: string, name: string) => {
        await page.keyboard.press(key);
        await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
        await expect(page.getByRole('tab', { name })).toBeFocused();
        await expect.poll(async () => {
          const now = (await measure(page)).style;
          return inView(now.track, now.items.find((x) => x.name === name)!);
        }, `${key} → ${name} wholly in view`).toBe(true);
      };
      await page.getByRole('tab', { name: 'Neumorphic' }).focus();
      await step('Home', 'Apple HIG');
      await step('End', 'Neumorphic');
    } else {
      expect(m.style.track.sw, 'from 360px the three fit').toBeLessThanOrEqual(m.style.track.cw);
    }
    expect(m.theme.track.sw, 'Theme fits').toBeLessThanOrEqual(m.theme.track.cw);

    // My work's Group.
    expect(m.grouping.row.sw, 'nothing spills the Group row').toBe(m.grouping.row.cw);
    expect(m.grouping.track.sw, 'the pair fits').toBeLessThanOrEqual(m.grouping.track.cw);
    for (const item of m.grouping.items) expect(item.padLeft, `${item.name}: ${width <= 360 ? '0.625rem' : '1rem'} a side`).toBe(width <= 360 ? 10 : 16);

    if (width === 390) {
      // CONTROL, same leg: the half-padding arm gone, Style's one-line track is wider than its card again.
      expect(await dropRules(page, 'gn-account__appearance .gn-segmented__item', '26rem'), 'the 26rem arm was found and deleted').toBe(1);
      const bare = (await measure(page)).style;
      expect(bare.group.sw, 'CONTROL: without the arm Style spills its group at 390').toBeGreaterThan(bare.group.cw);
    }
    if (width === 320) {
      // CONTROLs, same leg: the scroller arm gone, Style spills its card; the Group arm gone, the pair spills its row.
      expect(await dropRules(page, 'gn-account__appearance .gn-segmented', '22.4375rem'), 'the scroller arm was found and deleted').toBe(1);
      expect(await dropRules(page, 'gn-group-toggle .gn-segmented__item', '22.5rem'), 'the Group arm was found and deleted').toBe(1);
      const bare = await measure(page);
      expect(bare.style.card.sw, 'CONTROL: without the scroller Style spills its card at 320').toBeGreaterThan(bare.style.card.cw);
      expect(bare.grouping.row.sw, 'CONTROL: without the arm the Group pair spills its row at 320').toBeGreaterThan(bare.grouping.row.cw);
    }
  });
}
