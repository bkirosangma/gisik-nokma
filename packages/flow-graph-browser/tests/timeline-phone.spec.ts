import { expect, test } from '@playwright/test';

/**
 * The Timeline on a phone, in a real browser (spec PK-7, TV-6, TV-9; Workflow and Timeline graphs, Part 1). A container narrower
 * than 40rem is portrait: time runs DOWN, a lane is a column group, the day labels ride a sticky gutter.
 */
test('29.111 on a 390 px phone the view is portrait: time runs down, bars are 100 px columns, the day gutter stays on the left, and the page does not scroll sideways', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await page.goto('/timeline.html?n=40&span=90&theme=light');
  await expect(page.locator('.gn-timeline__canvas')).toBeVisible();
  expect(await page.locator('.gn-timeline').getAttribute('data-orientation')).toBe('portrait');
  const geometry = await page.evaluate(() => {
    const bars = [...document.querySelectorAll<HTMLElement>('.gn-timeline__bar')].map((b) => ({ day: Number(b.dataset['dayFrom']), top: b.offsetTop, width: b.offsetWidth }));
    const later = bars.filter((b) => b.day > bars[0]!.day).sort((a, b) => a.day - b.day)[0];
    const c = document.querySelector('.gn-timeline__canvas') as HTMLElement;
    return { first: bars[0]!, later: later!, widths: [...new Set(bars.map((b) => b.width))], pageWide: document.documentElement.scrollWidth - window.innerWidth, canvasScrolls: c.scrollHeight > c.clientHeight };
  });
  expect(geometry.widths).toEqual([100]);
  expect(geometry.later.top).toBeGreaterThan(geometry.first.top);
  // time runs down at the scale: the two bars' tops are their day gap x 24 px (the Week preset), whatever rows they packed into
  expect(Math.abs(geometry.later.top - geometry.first.top - (geometry.later.day - geometry.first.day) * 24)).toBeLessThanOrEqual(1);
  expect(geometry.canvasScrolls).toBe(true);
  expect(geometry.pageWide).toBeLessThanOrEqual(0);
  const labelLeft = () => page.evaluate(() => {
    const c = (document.querySelector('.gn-timeline__canvas') as HTMLElement).getBoundingClientRect();
    const label = [...document.querySelectorAll<HTMLElement>('.gn-timeline__axis-day')].map((d) => d.getBoundingClientRect()).find((r) => r.bottom > c.top && r.top < c.bottom);
    return label === undefined ? null : label.left - c.left;
  });
  // scroll the lanes down and a day label is still on screen at the canvas's left edge
  await page.evaluate(() => { (document.querySelector('.gn-timeline__canvas') as HTMLElement).scrollTop = 400; });
  await page.waitForTimeout(150);
  const gutter = await labelLeft();
  expect(gutter).not.toBeNull();
  expect(Math.abs(gutter as number)).toBeLessThan(1);
  // the gutter is STICKY: on a chart whose lanes are wider than the phone (40 tickets packed into 10 days), scroll the lanes 200 px
  // SIDEWAYS and the day labels stay at the left edge (a vertical scroll alone cannot tell sticky from absolute)
  await page.goto('/timeline.html?n=40&span=10&theme=light');
  await expect(page.locator('.gn-timeline__canvas')).toBeVisible();
  const room = await page.evaluate(() => {
    const c = document.querySelector('.gn-timeline__canvas') as HTMLElement;
    c.scrollLeft = 200;
    return { room: c.scrollWidth - c.clientWidth, left: c.scrollLeft };
  });
  expect(room.room).toBeGreaterThanOrEqual(200);
  expect(room.left).toBe(200);
  await page.waitForTimeout(150);
  const stuck = await labelLeft();
  expect(stuck).not.toBeNull();
  expect(Math.abs(stuck as number)).toBeLessThan(1);
  // ERRATA E9, measured (AMEND leg A): a bar in its lane's SECOND column sits exactly 112 + 6 px into the lane and is 100 px wide (a
  // first-column bar alone cannot tell a 0 px inset from 6, nor a 112 px pitch from 120); the lane is its columns x 112 px wide and
  // starts after the 80 px gutter.
  const box = await page.evaluate(() => {
    const bars = [...document.querySelectorAll<HTMLElement>('.gn-timeline__bar')];
    const rowOf = (b: HTMLElement) => Number((b.parentElement as HTMLElement).style.getPropertyValue('--row'));
    const second = bars.find((b) => rowOf(b) === 1);
    const first = bars.find((b) => rowOf(b) === 0 && b.closest('.gn-timeline__lane') === second?.closest('.gn-timeline__lane'));
    const lane = second?.closest('.gn-timeline__lane') as HTMLElement | null | undefined;
    if (second === undefined || first === undefined || lane === null || lane === undefined) return null;
    return {
      second: [second.offsetLeft, second.offsetWidth],
      first: [first.offsetLeft, first.offsetWidth],
      laneLeft: lane.offsetLeft - parseFloat(lane.style.getPropertyValue('--lane-offset')),
      laneColumns: lane.offsetWidth / 112,
    };
  });
  expect(box).not.toBeNull();
  expect(box!.second).toEqual([118, 100]);
  expect(box!.first).toEqual([6, 100]);
  expect(box!.laneLeft).toBe(80);
  expect(Number.isInteger(box!.laneColumns) && box!.laneColumns >= 2).toBe(true);
  await ctx.close();
});

test('29.112 Nothing in view appears once the view comes to rest over a gap, its jump glides to a bar and the pill goes; control: a bar in view shows no pill', async ({ page }) => {
  // 3 bars in the first 20 days; today (day 60) is far from them: the view opens centred on today with nothing in view
  await page.goto('/timeline.html?n=3&span=20&theme=light');
  await expect(page.locator('.gn-timeline__canvas')).toBeVisible();
  const pill = page.getByRole('status');
  await expect(pill).toContainText('Nothing in view');
  await expect(page.getByRole('button', { name: 'Jump to the next bar' })).toBeDisabled();
  // The fixture's bars are days 0, 6-13 and 13-15; all three are mounted at open. The NEAREST bar before the view is the one that
  // ends LAST (13-15), so that is where "previous" must land, not merely on some bar.
  const ends = await page.locator('.gn-timeline__bar').evaluateAll((bars) => bars.map((b) => Number((b as HTMLElement).dataset['dayTo'])));
  expect(ends).toHaveLength(3);
  const lastEnd = Math.max(...ends);
  /** The `data-day-to` of the bar whose centre sits within 1.5 days (36 px at 24 px/day) of the canvas's centre, or null. */
  const centredOn = () => page.evaluate(() => {
    const r = (document.querySelector('.gn-timeline__canvas') as HTMLElement).getBoundingClientRect();
    const mid = (r.left + r.right) / 2;
    const hit = [...document.querySelectorAll<HTMLElement>('.gn-timeline__bar')].find((b) => { const q = b.getBoundingClientRect(); return Math.abs((q.left + q.right) / 2 - mid) < 36; });
    return hit === undefined ? null : Number(hit.dataset['dayTo']);
  });
  // a verdict about where the view has come to REST: while a glide is moving over the same gap there is no pill, and it is back after.
  // PageDown aims past the last scrollable day, so this also pins that a glide clamped by the scroller still comes to rest.
  await page.locator('.gn-timeline__canvas').focus();
  await page.keyboard.press('PageDown');
  await page.waitForTimeout(60);
  await expect(pill).toHaveCount(0);
  await expect(pill).toContainText('Nothing in view', { timeout: 3000 });
  await page.getByRole('button', { name: 'Jump to the previous bar' }).click();
  await expect(pill).toHaveCount(0, { timeout: 3000 });
  const barsShown = () => page.evaluate(() => {
    const c = document.querySelector('.gn-timeline__canvas') as HTMLElement;
    const r = c.getBoundingClientRect();
    return [...document.querySelectorAll('.gn-timeline__bar')].filter((b) => { const q = b.getBoundingClientRect(); return q.right > r.left && q.left < r.right; }).length;
  });
  // the jump glides (inside 450 ms): wait for it to land, then a bar is on screen and still no pill
  await expect.poll(barsShown, { timeout: 3000 }).toBeGreaterThan(0);
  await page.waitForTimeout(300);
  await expect(pill).toHaveCount(0);
  // ...and it came to rest CENTRED on the nearest bar before the view (the last-ending one), not on the farthest. Read it only
  // after the glide's 450 ms cap, so a glide to the farthest bar cannot be sampled while passing over the nearest one.
  await page.waitForTimeout(500);
  await expect.poll(centredOn, { timeout: 3000 }).toBe(lastEnd);
  // no paging control survives: nothing is named Earlier, Later, Previous or Next
  await expect(page.getByRole('button', { name: /^(Earlier|Later|Previous|Next)$/i })).toHaveCount(0);
  // "next" likewise lands on the NEAREST bar after the view: bars at days 0, 90-97 and 180-182, today (day 60) over the gap between
  await page.goto('/timeline.html?n=3&span=270&theme=light');
  await expect(pill).toContainText('Nothing in view');
  const nearestAfter = await page.evaluate(() => {
    const today = Number((document.querySelector('.gn-timeline__today') as HTMLElement).dataset['day']);
    const after = [...document.querySelectorAll<HTMLElement>('.gn-timeline__bar')].filter((b) => Number(b.dataset['dayFrom']) > today);
    return after.length === 0 ? null : Math.min(...after.map((b) => Number(b.dataset['dayTo'])));
  });
  expect(nearestAfter).not.toBeNull();
  await page.getByRole('button', { name: 'Jump to the next bar' }).click();
  await page.waitForTimeout(500);
  await expect.poll(centredOn, { timeout: 3000 }).toBe(nearestAfter);
  await expect(pill).toHaveCount(0);
  // CONTROL: with bars around today there is no pill at all
  await page.goto('/timeline.html?n=40&span=120&theme=light');
  await expect(page.locator('.gn-timeline__bar').first()).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole('status')).toHaveCount(0);
});

test('29.111 a rotation re-builds the adapter on the other axis: resized from a phone to a desktop width the view is landscape and scrolls sideways, and back it scrolls down', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 780 } });
  const page = await ctx.newPage();
  // 40 tickets packed into 10 days: the portrait lanes are wider than the phone, so the landscape scrollLeft has room to survive a rotation
  await page.goto('/timeline.html?n=40&span=10&theme=light');
  const canvas = page.locator('.gn-timeline__canvas');
  await expect(canvas).toBeVisible();
  const axes = () => page.evaluate(() => {
    const c = document.querySelector('.gn-timeline__canvas') as HTMLElement;
    return { orientation: document.querySelector('.gn-timeline')!.getAttribute('data-orientation'), x: c.scrollWidth > c.clientWidth, y: c.scrollHeight > c.clientHeight, left: c.scrollLeft, top: c.scrollTop };
  });
  const wide = await axes();
  expect(wide).toMatchObject({ orientation: 'landscape', x: true });
  // landscape opens centred on today (day 60), far from the surface's first day: the scroller is well to the right
  expect(wide.left).toBeGreaterThan(200);
  await page.setViewportSize({ width: 390, height: 780 });
  await expect.poll(async () => (await axes()).orientation).toBe('portrait');
  const tall = await axes();
  // a NEW scroller (`key={orientation}`): the landscape scrollLeft is gone although the portrait lanes could scroll sideways ...
  expect(tall.x).toBe(true);
  expect(tall.left).toBe(0);
  // ... and the portrait adapter centred it on today DOWN the page before any key was pressed
  expect(tall.top).toBeGreaterThan(0);
  // the key press must move the PORTRAIT scroller's own axis: an adapter left on the old axis would write scrollLeft and nothing would move down
  await canvas.focus();
  await page.keyboard.press('PageDown');
  await expect.poll(() => canvas.evaluate((c) => (c as HTMLElement).scrollTop), { timeout: 3000 }).toBeGreaterThan(tall.top);
  await page.setViewportSize({ width: 1000, height: 780 });
  await expect.poll(async () => (await axes()).orientation).toBe('landscape');
  const left = await canvas.evaluate((c) => (c as HTMLElement).scrollLeft);
  await canvas.focus();
  await page.keyboard.press('PageDown');
  await expect.poll(() => canvas.evaluate((c) => (c as HTMLElement).scrollLeft), { timeout: 3000 }).not.toBe(left);
  await ctx.close();
});
