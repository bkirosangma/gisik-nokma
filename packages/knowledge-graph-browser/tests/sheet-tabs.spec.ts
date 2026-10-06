import { expect, test, type Page } from '@playwright/test';

/*
 * The ticket sheet's four sections in a real browser (kg-walk-fixes-2 item 1; the release walk's P2-1), on
 * `harness/sheet-tabs.html`: the REAL `TicketSheet` with the REAL Knowledge Graph in its fourth tab, ui.css and the web
 * app's globals.css, neo light. Every leg sets a LITERAL viewport width and asserts `window.innerWidth` took it.
 *
 * - 27.680 / 27.681: with each section selected in turn, `.gn-sheet__body` never scrolls sideways, every label is ONE line
 *   (`Range.getClientRects()` of the tab's text, not the 44px button's height), and neo's selected bar lies below the whole
 *   label and within it. Below 40rem the track itself scrolls (overflow-x auto, wider than its box, 0.625rem a side); from
 *   641px it does not (overflow-x visible, 1rem a side). CONTROL, same leg at 360 and 1280: the sheet's rules deleted from
 *   the live stylesheet, the body scrolls sideways at 360 and "Knowledge Graph" breaks onto two lines under the bar at 1280
 *   while the other three stay one line.
 * - 27.682: the keyboard alone (arrows with wraparound, Home, End) reaches all four at 360, and the selected tab is the
 *   focused one and wholly inside the track, clear of a faded edge.
 * - 27.683: a TAP on the visible sliver of Knowledge Graph at 360 and 390 brings it wholly into view, and the graph's
 *   Add link (the host taking the sheet back to Details) brings Details back. CONTROL, same legs: with the track's
 *   `scrollTo` stubbed out, Chrome leaves the tapped tab half hidden and Details off the start (measured: Chrome does not
 *   scroll a button focused by a click), so the reveal is what these legs witness.
 */

const NAMES = ['Details', 'History', 'Attachments', 'Knowledge Graph'] as const;

type Tab = { name: string; selected: boolean; left: number; right: number; lines: number; textLeft: number; textRight: number; textBottom: number; padLeft: number; bar: { top: number; centre: number } | null };
type Measure = {
  body: { sw: number; cw: number };
  track: { left: number; right: number; sw: number; cw: number; sl: number; overflowX: string; atStart: string | undefined; atEnd: string | undefined; fade: number };
  tabs: Tab[];
};

/** Everything the legs read, in one pass inside the page. */
function measure(page: Page): Promise<Measure> {
  return page.evaluate(() => {
    const track = document.querySelector<HTMLElement>('[role="tablist"][aria-label="Ticket sections"]')!;
    const body = document.querySelector<HTMLElement>('.gn-sheet__body')!;
    const rootPx = parseFloat(getComputedStyle(document.documentElement).fontSize);
    const fadeRaw = getComputedStyle(track).getPropertyValue('--gn-scroll-fade-size').trim();
    const fade = fadeRaw.endsWith('rem') ? parseFloat(fadeRaw) * rootPx : parseFloat(fadeRaw) || 0;
    const t = track.getBoundingClientRect();
    const tabs = [...track.querySelectorAll<HTMLElement>('[role="tab"]')].map((tab) => {
      const box = tab.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(tab);
      const text = range.getBoundingClientRect();
      const after = getComputedStyle(tab, '::after');
      const bar =
        after.content === 'none' || after.content === 'normal'
          ? null
          : { top: box.bottom - parseFloat(after.bottom) - parseFloat(after.height), centre: box.left + parseFloat(after.left) };
      return {
        name: tab.textContent ?? '',
        selected: tab.getAttribute('aria-selected') === 'true',
        left: box.left,
        right: box.right,
        lines: range.getClientRects().length,
        textLeft: text.left,
        textRight: text.right,
        textBottom: text.bottom,
        padLeft: parseFloat(getComputedStyle(tab).paddingLeft),
        bar,
      };
    });
    return {
      body: { sw: body.scrollWidth, cw: body.clientWidth },
      track: { left: t.left, right: t.right, sw: track.scrollWidth, cw: track.clientWidth, sl: track.scrollLeft, overflowX: getComputedStyle(track).overflowX, atStart: track.dataset['atStart'], atEnd: track.dataset['atEnd'], fade },
      tabs,
    };
  });
}

/** The tab is wholly inside the track, and clear of the fade on any edge that is faded (`data-at-* = false`). */
function inView(m: Measure, name: string): boolean {
  const tab = m.tabs.find((x) => x.name === name)!;
  const start = m.track.left + (m.track.atStart === 'false' ? m.track.fade : 0);
  const end = m.track.right - (m.track.atEnd === 'false' ? m.track.fade : 0);
  return tab.left >= start - 0.5 && tab.right <= end + 0.5;
}

async function open(page: Page, width: number, query = ''): Promise<void> {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(`/sheet-tabs.html${query}`);
  expect(await page.evaluate(() => window.innerWidth), 'the literal viewport width took').toBe(width);
  await expect(page.getByRole('tablist', { name: 'Ticket sections' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Knowledge Graph' })).toBeVisible();
}

/** Selects a section the way a reader does with a pointer, and waits for its panel. */
async function choose(page: Page, name: (typeof NAMES)[number]): Promise<void> {
  await page.getByRole('tab', { name }).click();
  await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
  if (name === 'Knowledge Graph') await expect(page.locator('.gn-kg__bar')).toBeVisible();
}

/** Deletes every rule naming the sheet's track class (inside media rules too); returns how many went. */
function dropSectionsRules(page: Page): Promise<number> {
  return page.evaluate(() => {
    let dropped = 0;
    const sweep = (list: CSSRuleList, remove: (i: number) => void) => {
      for (let i = list.length - 1; i >= 0; i -= 1) {
        const rule = list[i]!;
        if (rule instanceof CSSStyleRule && rule.selectorText.includes('gn-ticket-sheet__sections')) {
          remove(i);
          dropped += 1;
        } else if (rule instanceof CSSMediaRule) {
          sweep(rule.cssRules, (j) => rule.deleteRule(j));
        }
      }
    };
    for (const sheet of [...document.styleSheets]) sweep(sheet.cssRules, (i) => sheet.deleteRule(i));
    return dropped;
  });
}

const WIDTHS = [360, 390, 640, 641, 768, 1280] as const;
for (const width of WIDTHS) {
  test(`27.680 / 27.681 at a literal ${width}px: the body never scrolls sideways and every label is one line under its bar`, async ({ page }) => {
    await open(page, width);
    const phone = width <= 640;
    for (const name of NAMES) {
      await choose(page, name);
      const m = await measure(page);
      expect(m.body.sw, `${name} selected: .gn-sheet__body scrollWidth == clientWidth`).toBe(m.body.cw);
      for (const tab of m.tabs) {
        expect(tab.lines, `${tab.name}: one line with ${name} selected`).toBe(1);
        expect(tab.padLeft, `${tab.name}: ${phone ? '0.625rem' : '1rem'} a side`).toBe(phone ? 10 : 16);
      }
      const on = m.tabs.find((x) => x.selected)!;
      expect(on.name).toBe(name);
      expect(on.bar, 'neo draws the selected bar').not.toBeNull();
      expect(on.bar!.top, `${name}: the bar starts below the label's last line`).toBeGreaterThanOrEqual(on.textBottom);
      expect(on.bar!.centre, `${name}: the bar is under the label`).toBeGreaterThanOrEqual(on.textLeft);
      expect(on.bar!.centre, `${name}: the bar is under the label`).toBeLessThanOrEqual(on.textRight);
      expect(m.track.overflowX, phone ? 'the track scrolls inside itself below 40rem' : 'no scroller from 641px').toBe(phone ? 'auto' : 'visible');
      if (width <= 390) expect(m.track.sw, 'the four are wider than the track: it really scrolls').toBeGreaterThan(m.track.cw);
      if (!phone) expect(m.track.sw, 'the four fit from 641px').toBe(m.track.cw);
    }
    if (width === 360 || width === 1280) {
      // CONTROL, same leg: the sheet's own rules gone, the walk's two failures come back.
      // Knowledge Graph is still the selected section (the loop's last); layout is read synchronously after the deletion.
      expect(await dropSectionsRules(page), 'the rules this leg depends on were found and deleted').toBe(3);
      const bare = await measure(page);
      expect(bare.tabs.find((x) => x.selected)!.name).toBe('Knowledge Graph');
      if (width === 360) {
        expect(bare.body.sw, 'CONTROL: without the rules the body scrolls sideways at 360').toBeGreaterThan(bare.body.cw);
      } else {
        const graph = bare.tabs.find((x) => x.name === 'Knowledge Graph')!;
        expect(graph.lines, 'CONTROL: without nowrap "Knowledge Graph" breaks in the 640px sheet').toBe(2);
        expect(graph.bar!.top, 'CONTROL: and the bar crosses its second line').toBeLessThan(graph.textBottom);
        for (const tab of bare.tabs.filter((x) => x.name !== 'Knowledge Graph')) expect(tab.lines, `CONTROL: ${tab.name} still one line`).toBe(1);
      }
    }
  });
}

test('27.682 at a literal 360px the keyboard reaches all four, and the selected tab is the focused one, wholly in view', async ({ page }) => {
  await open(page, 360);
  await page.getByRole('tab', { name: 'Details' }).focus();
  const step = async (key: string, name: (typeof NAMES)[number]) => {
    await page.keyboard.press(key);
    await expect(page.getByRole('tab', { name })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tab', { name })).toBeFocused();
    await expect.poll(async () => inView(await measure(page), name), `${key} → ${name} wholly in view`).toBe(true);
  };
  await step('ArrowRight', 'History');
  await step('ArrowRight', 'Attachments');
  await step('ArrowRight', 'Knowledge Graph');
  // Back from the end: History sits under the START fade unless it is brought in clear of it (the scroll-padding).
  await step('ArrowLeft', 'Attachments');
  await step('ArrowLeft', 'History');
  expect((await measure(page)).track.atStart, 'the track is still scrolled, so its start is faded').toBe('false');
  await step('ArrowRight', 'Attachments');
  await step('ArrowRight', 'Knowledge Graph');
  await step('ArrowRight', 'Details'); // wraps
  expect((await measure(page)).track.sl).toBe(0);
  await step('End', 'Knowledge Graph');
  await step('Home', 'Details');
});

for (const width of [360, 390] as const) {
  test(`27.683 at a literal ${width}px a tap on Knowledge Graph's visible sliver brings it wholly into view; CONTROL: Chrome alone does not`, async ({ page }) => {
    const tapSliver = async () => {
      const at = await page.evaluate(() => {
        const track = document.querySelector('[role="tablist"][aria-label="Ticket sections"]')!.getBoundingClientRect();
        const graph = [...document.querySelectorAll('[role="tab"]')].find((x) => x.textContent === 'Knowledge Graph')!.getBoundingClientRect();
        return { x: track.right - 4, y: (graph.top + graph.bottom) / 2, hidden: graph.right > track.right };
      });
      expect(at.hidden, 'the tab starts half hidden past the track end').toBe(true);
      await page.mouse.click(at.x, at.y);
      await expect(page.getByRole('tab', { name: 'Knowledge Graph' })).toHaveAttribute('aria-selected', 'true');
    };
    // CONTROL first: the track's scrollTo stubbed out, the tap selects but the tab stays cut by the track end.
    await open(page, width);
    await page.evaluate(() => {
      HTMLElement.prototype.scrollTo = () => undefined;
    });
    await tapSliver();
    await page.waitForTimeout(500);
    expect(inView(await measure(page), 'Knowledge Graph'), 'CONTROL: without the reveal the tapped tab stays half hidden').toBe(false);
    // The product: the same tap, the reveal brings it in.
    await open(page, width);
    await tapSliver();
    await expect.poll(async () => inView(await measure(page), 'Knowledge Graph'), 'the tapped tab is wholly in view').toBe(true);
  });
}

test('27.683 at a literal 360px the graph\'s Add link takes the sheet back to Details and brings Details into view; CONTROL: not without the reveal', async ({ page }) => {
  for (const reveal of [false, true]) {
    await open(page, 360, '?world=lonely');
    await page.getByRole('tab', { name: 'Details' }).focus();
    await page.keyboard.press('End');
    await expect.poll(async () => inView(await measure(page), 'Knowledge Graph')).toBe(true);
    expect((await measure(page)).track.sl, 'scrolled to the end: Details is off the start').toBeGreaterThan(0);
    if (!reveal) {
      await page.evaluate(() => {
        HTMLElement.prototype.scrollTo = () => undefined;
      });
    }
    await page.getByRole('button', { name: 'Add link' }).click();
    await expect(page.getByRole('tab', { name: 'Details' })).toHaveAttribute('aria-selected', 'true');
    if (reveal) {
      await expect.poll(async () => inView(await measure(page), 'Details'), 'Details is wholly in view').toBe(true);
    } else {
      await page.waitForTimeout(500);
      expect(inView(await measure(page), 'Details'), 'CONTROL: without the reveal Details stays off the start').toBe(false);
    }
  }
});
