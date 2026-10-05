import { expect, test, type Page } from '@playwright/test';

type Box = { id: string; key: string | null; row: string; left: number; right: number; top: number; bottom: number };
type KeyBox = { owner: string; left: number; right: number; top: number; bottom: number };

/**
 * 29.089 — ERRATA E11 in a real browser: the product's Timeline view at the Month preset (8 px per day) over `timeline-geometry.html`'s
 * seed. A one-day bar is drawn 12 px (its two 6 px paddings), so the packer must not seat the next day's bar beside it, and an
 * outside key starts KEY_GAP_PX (4 px) after the DRAWN end. Measured from real rects after the zoom settles, with reduced
 * motion so the re-pack does not glide. LOCAL, headless Chromium (layout, not a frame-time number).
 */
test('29.089 at Month: zero overlaps among the bars (the keyless one-day draft row included) and every outside key sits at least 4 px clear of its bar and over no bar', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/timeline-geometry.html');
  await page.getByRole('radio', { name: 'Month' }).click();
  await expect(page.getByRole('radio', { name: 'Month' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.gn-timeline')).not.toHaveAttribute('data-zooming', 'true');
  await expect.poll(() => page.locator('.gn-timeline__canvas').evaluate((el) => getComputedStyle(el).getPropertyValue('--tl-ppd').trim())).toBe('8');

  const { bars, keys } = await page.evaluate(() => {
    const bars: Box[] = [...document.querySelectorAll<HTMLElement>('.gn-timeline__row')].map((row) => {
      const r = (row.querySelector('.gn-timeline__bar') as HTMLElement).getBoundingClientRect();
      const keyText = row.querySelector('.gn-timeline__key')?.textContent ?? null;
      return { id: row.dataset['ticketId'] as string, key: keyText, row: row.style.getPropertyValue('--row'), left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    });
    const keys: KeyBox[] = [...document.querySelectorAll<HTMLElement>('.gn-timeline__key--outside')].map((key) => {
      const r = key.getBoundingClientRect();
      return { owner: (key.closest('.gn-timeline__row') as HTMLElement).dataset['ticketId'] as string, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    });
    return { bars, keys };
  });

  // The premise: all twenty bars are mounted, a keyless one-day bar is drawn 12 px (not 8), adjacent days are in the seed, and
  // every keyed one-day bar draws its key outside.
  expect(bars).toHaveLength(20);
  const drafts = bars.filter((b) => b.id.startsWith('d'));
  expect(drafts).toHaveLength(12);
  for (const d of drafts) expect(d.right - d.left).toBeCloseTo(12, 0);
  expect(keys.map((k) => k.owner).sort()).toEqual(bars.filter((b) => b.id.startsWith('k')).map((b) => b.id).sort());

  const meets = (a: { left: number; right: number; top: number; bottom: number }, b: { left: number; right: number; top: number; bottom: number }) =>
    a.left < b.right - 0.5 && b.left < a.right - 0.5 && a.top < b.bottom - 0.5 && b.top < a.bottom - 0.5;
  const overlaps: string[] = [];
  for (let i = 0; i < bars.length; i += 1) {
    for (let j = i + 1; j < bars.length; j += 1) {
      const a = bars[i] as Box;
      const b = bars[j] as Box;
      if (meets(a, b)) overlaps.push(`${a.id}/${b.id}`);
    }
  }
  expect(overlaps).toEqual([]);
  // The draft row is not one row: twelve adjacent one-day bars at 1.5 days each cannot all stand side by side.
  expect(new Set(drafts.map((d) => d.row)).size).toBeGreaterThan(1);

  const clearance: string[] = [];
  for (const k of keys) {
    const own = bars.find((b) => b.id === k.owner) as Box;
    if (k.left - own.right < 4 - 0.5) clearance.push(`${k.owner}: ${(k.left - own.right).toFixed(1)} px`);
    for (const b of bars) if (meets(k, b)) clearance.push(`${k.owner} key over ${b.id}`);
  }
  expect(clearance).toEqual([]);
});

/**
 * The continuous Timeline view in a real browser (Workflow and Timeline graphs, Part 1; spec TV-1 to TV-11, VP-1 to VP-9, PR-7).
 * The page is `harness/timeline-main.tsx`: the BUILT app-core view over a synthetic project, today fixed at 2026-10-02.
 * 24 px per day is the Week preset the view opens on.
 */
const PPD = 24;

const state = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector('.gn-timeline__canvas') as HTMLElement;
    return {
      ppd: Number(getComputedStyle(c).getPropertyValue('--tl-ppd')),
      scrollLeft: c.scrollLeft,
      scrollTop: c.scrollTop,
      weekend: c.dataset['weekend'],
      panelH: (document.querySelector('.gn-timeline') as HTMLElement).getBoundingClientRect().height,
      pageY: window.scrollY,
    };
  });

const todayCentre = (page: Page) =>
  page.evaluate(() => {
    const c = document.querySelector('.gn-timeline__canvas') as HTMLElement;
    const t = document.querySelector('.gn-timeline__today') as HTMLElement;
    const r = c.getBoundingClientRect();
    const q = t.getBoundingClientRect();
    return q.left + q.width / 2 - (r.left + r.width / 2);
  });

test('29.040 the panel fills the height under its filters (16 px short of the window, never under 320 px), a bar is 28 px on a 40 px pitch, the axis stays at the top when the lanes scroll, and the weekend tint is on at Day and off at Month', async ({ page }) => {
  await page.goto('/timeline.html?n=200&span=60&theme=light&h=80vh');
  await expect(page.locator('.gn-timeline__canvas')).toBeVisible();
  const s = await state(page);
  expect(s.panelH).toBeGreaterThan(500);
  // TV-11 fills to the WINDOW, not to the host div (80vh = 576 px here): the panel ends 16 px above the window's bottom edge
  const bottomGap = await page.evaluate(() => window.innerHeight - (document.querySelector('.gn-timeline') as HTMLElement).getBoundingClientRect().bottom);
  expect(bottomGap).toBeGreaterThanOrEqual(15);
  expect(bottomGap).toBeLessThanOrEqual(17);
  const tops = await page.evaluate(() => {
    // ONE lane, every bar in it (the band covers all 60 days): the packed rows are contiguous, so the distinct tops are the pitch
    const bars = [...document.querySelectorAll<HTMLElement>('.gn-timeline__lane')[0]!.querySelectorAll<HTMLElement>('.gn-timeline__bar')];
    return { heights: [...new Set(bars.map((b) => b.getBoundingClientRect().height))], tops: [...new Set(bars.map((b) => Math.round(b.getBoundingClientRect().top)))].sort((a, b) => a - b) };
  });
  expect(tops.heights).toEqual([28]);
  expect(tops.tops.length).toBeGreaterThanOrEqual(3); // at least two pitches to compare, or `every` below passes on nothing
  const pitches = tops.tops.slice(1).map((t, i) => t - (tops.tops[i] as number));
  expect(pitches).toEqual(pitches.map(() => 40));
  // 200 bars over 60 days stack into more rows than the panel holds: scroll the lanes and the axis keeps its place
  await page.evaluate(() => { (document.querySelector('.gn-timeline__canvas') as HTMLElement).scrollTop = 300; });
  await page.waitForTimeout(100);
  const axis = await page.evaluate(() => {
    const c = (document.querySelector('.gn-timeline__canvas') as HTMLElement).getBoundingClientRect();
    return { scrollTop: (document.querySelector('.gn-timeline__canvas') as HTMLElement).scrollTop, gap: (document.querySelector('.gn-timeline__axis') as HTMLElement).getBoundingClientRect().top - c.top };
  });
  expect(axis.scrollTop).toBeGreaterThan(100);
  expect(Math.abs(axis.gap)).toBeLessThan(1);
  // weekend tint: the Week preset (24 px/day) shows it, Month (8) hides it, Day (56) shows it again
  expect((await state(page)).weekend).toBe('on');
  await page.getByRole('radio', { name: 'Month' }).click();
  await page.waitForTimeout(700);
  let z = await state(page);
  expect(z.ppd).toBeCloseTo(8, 0);
  expect(z.weekend).toBe('off');
  await page.getByRole('radio', { name: 'Day' }).click();
  await page.waitForTimeout(700);
  z = await state(page);
  expect(z.ppd).toBeCloseTo(56, 0);
  expect(z.weekend).toBe('on');
  // TV-11's floor (MIN_PANEL_PX, 320 px) where it BINDS, with real layout (AMEND-wtg1-t10-t13; 29.088 is its jsdom twin): a
  // window 321 px taller than the panel's top plus the 16 px gap gets a 321 px panel (the fill, the control), one 319 px taller
  // gets 320 (the floor). `setViewportSize` fires `resize`, which is what re-fits the panel. Exact, so the floor and the gap
  // each break a leg when moved by one pixel.
  const width = page.viewportSize()?.width ?? 1280;
  const fitWith = async (free: number) => {
    const top = await page.evaluate(() => (document.querySelector('.gn-timeline') as HTMLElement).getBoundingClientRect().top);
    await page.setViewportSize({ width, height: Math.ceil(top) + 16 + free });
    await page.waitForTimeout(150);
    return page.evaluate(() => ({ top: (document.querySelector('.gn-timeline') as HTMLElement).getBoundingClientRect().top, height: (document.querySelector('.gn-timeline') as HTMLElement).getBoundingClientRect().height }));
  };
  const fill = await fitWith(321);
  expect(fill.height).toBe(321);
  const floor = await fitWith(319);
  expect(floor.top).toBe(fill.top); // the premise: the panel's top did not move, so the window really left 319 px for it
  expect(floor.height).toBe(320);
});

test('29.041 Ctrl + wheel zooms about the pointer: the day under it moves less than half a pixel on every event, and the page does not scroll', async ({ page }) => {
  await page.goto('/timeline.html?n=40&theme=light');
  const canvas = page.locator('.gn-timeline__canvas');
  await expect(canvas).toBeVisible();
  // The page must be ABLE to scroll, or `pageY === 0` below is true whatever the view does (the panel alone fits the window).
  // Every wheel event is recorded at the window, after the canvas's listener: `defaultPrevented` is the cancel itself.
  await page.evaluate(() => {
    document.body.style.minHeight = '200vh';
    const w = window as unknown as { __wheel: boolean[] };
    w.__wheel = [];
    window.addEventListener('wheel', (e) => w.__wheel.push(e.defaultPrevented), { passive: true });
    // A whole-pixel start, so the reference day below is exact (the open position may be a half pixel the platform rounded)
    (document.querySelector('.gn-timeline__canvas') as HTMLElement).scrollLeft = 2400;
  });
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight)).toBeGreaterThan(100);
  const box = (await canvas.boundingBox()) as { x: number; y: number };
  const dayAtPointer = (st: { ppd: number; scrollLeft: number }) => (st.scrollLeft + 600) / st.ppd;
  const before = await state(page);
  expect(before.scrollLeft).toBe(2400);
  await page.mouse.move(box.x + 600, box.y + 200);
  let worst = 0;
  // 24 small steps (x e^0.048 each: 24 -> 76 px/day), every one BELOW the 96 cap: an event at the cap writes nothing, so a
  // sweep that reaches it (the old -60 steps did after two events) gives the naive read-back nothing to drift on
  for (let i = 0; i < 24; i += 1) {
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -4);
    await page.keyboard.up('Control');
    await page.waitForTimeout(40);
    const st = await state(page);
    worst = Math.max(worst, Math.abs(dayAtPointer(st) - dayAtPointer(before)) * st.ppd);
  }
  await page.waitForTimeout(600);
  const after = await state(page);
  expect(after.ppd).toBeGreaterThan(before.ppd);
  expect(after.ppd).toBeLessThan(96);
  expect(worst).toBeLessThanOrEqual(0.5 + 1e-6);
  expect(after.pageY).toBe(0);
  const cancelled = await page.evaluate(() => (window as unknown as { __wheel: boolean[] }).__wheel);
  expect(cancelled.length).toBeGreaterThan(0);
  expect(cancelled.every((prevented) => prevented)).toBe(true);
});

test('29.042 a mouse drag pans, a touch swipe is the platform\'s own scroll, the arrow keys glide 7 days, Today and Home put today in the middle, and reduced motion lands at once', async ({ page, browser }) => {
  await page.goto('/timeline.html?n=40&span=200&theme=light');
  const canvas = page.locator('.gn-timeline__canvas');
  await expect(canvas).toBeVisible();
  expect(Math.abs(await todayCentre(page))).toBeLessThan(2);
  // mouse drag: 200 px left of the pointer is 200 px of scroll, and a drag begun on a bar would not pan (unit-tested), so the
  // drag must START on empty canvas or a correct view reds here for the wrong reason
  const onBar = (p: Page, x: number, y: number) =>
    p.evaluate(([px, py]) => document.elementFromPoint(px, py)?.closest('.gn-timeline__bar') != null, [x, y] as const);
  const box = (await canvas.boundingBox()) as { x: number; y: number };
  const before = await state(page);
  expect(await onBar(page, box.x + 700, box.y + 250)).toBe(false);
  await page.mouse.move(box.x + 700, box.y + 250);
  await page.mouse.down();
  await page.mouse.move(box.x + 500, box.y + 250, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(900);
  expect((await state(page)).scrollLeft - before.scrollLeft).toBeGreaterThan(190);
  // keys
  await page.getByRole('button', { name: 'Today' }).click();
  await page.waitForTimeout(700);
  expect(Math.abs(await todayCentre(page))).toBeLessThan(2);
  await canvas.focus();
  const x0 = (await state(page)).scrollLeft;
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(600);
  expect(Math.abs((await state(page)).scrollLeft - x0 - 7 * PPD)).toBeLessThan(2);
  await page.keyboard.press('Home');
  await page.waitForTimeout(700);
  expect(Math.abs(await todayCentre(page))).toBeLessThan(2);
  // touch: no drag handler runs and the browser's own pan scrolls the canvas. `gn-dragging` is added on pointerdown and removed on
  // pointerup/cancel, so a class check AFTER the swipe is green either way: an observer records every class it ever held.
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, hasTouch: true });
  const touch = await ctx.newPage();
  await touch.goto('/timeline.html?n=40&span=200&theme=light');
  await expect(touch.locator('.gn-timeline__canvas')).toBeVisible();
  expect(await onBar(touch, 450, 300)).toBe(false); // a touch begun on a bar is ignored by the adapter anyway: start off one
  await touch.evaluate(() => {
    const c = document.querySelector('.gn-timeline__canvas') as HTMLElement;
    const w = window as unknown as { __dragged: boolean };
    w.__dragged = false;
    new MutationObserver((records) => {
      for (const r of records) if ((r.oldValue ?? '').includes('gn-dragging') || c.classList.contains('gn-dragging')) w.__dragged = true;
    }).observe(c, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  });
  const dragged = () => touch.evaluate(() => (window as unknown as { __dragged: boolean }).__dragged);
  const t0 = await state(touch);
  const cdp = await ctx.newCDPSession(touch);
  await cdp.send('Input.synthesizeScrollGesture', { x: 450, y: 300, xDistance: -400, yDistance: 0, gestureSourceType: 'touch', speed: 1200 });
  await touch.waitForTimeout(500);
  const t1 = await state(touch);
  expect(t1.scrollLeft - t0.scrollLeft).toBeGreaterThan(300);
  expect(await dragged()).toBe(false);
  // control: the same observer on the same page sees a MOUSE drag (begun on the sticky axis, which holds no bar whatever scrolled)
  const tbox = (await touch.locator('.gn-timeline__canvas').boundingBox()) as { x: number; y: number };
  await touch.mouse.move(tbox.x + 450, tbox.y + 20);
  await touch.mouse.down();
  await touch.mouse.move(tbox.x + 400, tbox.y + 20, { steps: 4 });
  await touch.mouse.up();
  expect(await dragged()).toBe(true);
  await ctx.close();
  // reduced motion: the same key press has already landed on the next frame
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/timeline.html?n=40&span=200&theme=light');
  await page.locator('.gn-timeline__canvas').focus();
  const r0 = (await state(page)).scrollLeft;
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(50);
  expect(Math.abs((await state(page)).scrollLeft - r0 - 7 * PPD)).toBeLessThan(2);
});

test('29.043 a fast pan of 10 viewports at one per second leaves no frame with an empty band, and the band moves only once the view comes within a quarter viewport of its edge', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/timeline.html?n=1200&span=1500&theme=light');
  await expect(page.locator('.gn-timeline__canvas')).toBeVisible();
  // park on the first day that has data (the margin before it is empty BY DESIGN, TV-3) and let the band settle: a teleport is
  // not a pan, and the first paint after one may be empty
  await page.evaluate(() => {
    const c = document.querySelector('.gn-timeline__canvas') as HTMLElement;
    c.scrollLeft = 0;
    c.scrollLeft = 1400;
  });
  await page.waitForTimeout(500);
  const result = await page.evaluate(
    () =>
      new Promise<{ frames: number; empty: number; moved: number }>((resolve) => {
        const c = document.querySelector('.gn-timeline__canvas') as HTMLElement;
        const start = c.scrollLeft;
        let last = performance.now();
        const t0 = last;
        let frames = 0;
        let empty = 0;
        const step = (): void => {
          const now = performance.now();
          const dt = now - last;
          last = now;
          c.scrollLeft += (c.clientWidth * dt) / 1000;
          const r = c.getBoundingClientRect();
          const visible = [...document.querySelectorAll('.gn-timeline__bar')].filter((b) => {
            const q = b.getBoundingClientRect();
            return q.right > r.left && q.left < r.right;
          }).length;
          frames += 1;
          if (visible === 0) empty += 1;
          if (now - t0 < 10_000) requestAnimationFrame(step);
          else resolve({ frames, empty, moved: c.scrollLeft - start });
        };
        requestAnimationFrame(step);
      }),
  );
  expect(result.frames).toBeGreaterThan(100);
  expect(result.moved).toBeGreaterThan(9 * 1280);
  expect(result.empty).toBe(0);
  // PR-5, the mechanism: the band is mounted BEFORE it scrolls in. The data covers every day several times over, so a bar that
  // intersects the visible days never leaves the view empty for one frame; `empty === 0` alone stays green with the band cut to
  // the visible days. At rest the band reaches at least a quarter viewport past each edge (the refresh rule), so bars that START
  // an eighth of a viewport beyond the right edge, and END one before the left, are mounted.
  await page.waitForTimeout(500);
  const beyond = await page.evaluate(() => {
    const r = (document.querySelector('.gn-timeline__canvas') as HTMLElement).getBoundingClientRect();
    const bars = [...document.querySelectorAll('.gn-timeline__bar')].map((b) => b.getBoundingClientRect());
    return { ahead: bars.filter((q) => q.left > r.right + r.width / 8).length, behind: bars.filter((q) => q.right < r.left - r.width / 8).length };
  });
  expect(beyond.ahead).toBeGreaterThan(0);
  expect(beyond.behind).toBeGreaterThan(0);

  // The refresh rule itself (AMEND-wtg1-t10-t13): the band, the visible days plus one viewport V on each side, is mounted again
  // only once the visible days come within a quarter viewport (`days / 4`) of its edge. jsdom has no scroll frames, so this is
  // where it is proven. Exact in whole days: the canvas is sized to 48 days at 24 px per day and every scroll lands on a whole
  // day, so the quarter is 12 days and the edge is ONE scroll position; each side of it is probed, at the right edge and the left.
  // The band is read from the DOM: the axis mounts a day label for every day of the band (`--d0`, days from the surface start).
  const inset = (page.viewportSize()?.width ?? 1280) - (await page.evaluate(() => (document.querySelector('.gn-timeline__canvas') as HTMLElement).clientWidth));
  await page.setViewportSize({ width: 48 * PPD + inset, height: 720 });
  await page.goto('/timeline.html?n=1200&span=1500&theme=light');
  await expect(page.locator('.gn-timeline__canvas')).toBeVisible();
  const band = () =>
    page.evaluate(() => {
      const c = document.querySelector('.gn-timeline__canvas') as HTMLElement;
      const d0 = [...document.querySelectorAll<HTMLElement>('.gn-timeline__axis-day')].map((s) => Number(s.style.getPropertyValue('--d0')));
      return { start: Math.min(...d0), end: Math.max(...d0), labels: d0.length, width: c.clientWidth, surfaceDays: c.scrollWidth / 24 };
    });
  const scrollToDay = async (d: number): Promise<void> => {
    await page.evaluate((px) => {
      (document.querySelector('.gn-timeline__canvas') as HTMLElement).scrollLeft = px;
    }, d * PPD);
    await page.waitForTimeout(200);
  };
  // re-centre far from the band the page opened with, on day 600 of the surface: the band is [600 - 48, 600 + 47 + 48]
  await scrollToDay(600);
  const centred = await band();
  expect(centred.width).toBe(48 * PPD); // the premise: 48 whole days in view
  expect(centred.surfaceDays).toBeGreaterThan(centred.end + 60); // ... and the band is not clipped by the surface's end
  expect({ start: centred.start, end: centred.end, labels: centred.labels }).toEqual({ start: 552, end: 695, labels: 144 });
  // right edge: visible end + 12 days = band end is still inside (nothing moves), one day further is outside (re-centred)
  await scrollToDay(centred.end - 47 - 12);
  expect(await band()).toMatchObject({ start: centred.start, end: centred.end });
  await scrollToDay(centred.end - 47 - 12 + 1);
  const right = await band();
  expect({ start: right.start, end: right.end }).toEqual({ start: centred.end - 58 - 48, end: centred.end - 58 + 47 + 48 });
  // left edge, from the re-centred band: visible start - 12 days = band start is still inside, one day further is outside
  await scrollToDay(right.start + 12);
  expect(await band()).toMatchObject({ start: right.start, end: right.end });
  await scrollToDay(right.start + 12 - 1);
  const left = await band();
  expect({ start: left.start, end: left.end }).toEqual({ start: right.start + 11 - 48, end: right.start + 11 + 47 + 48 });
});

test('29.044 a custom date claim is a callout that opens on hover and on focus and is hidden otherwise', async ({ page }) => {
  await page.goto('/timeline.html?n=40&span=60&theme=light');
  const row = page.locator('.gn-timeline__row:has(.gn-timeline__claims)').first();
  const claims = row.locator('.gn-timeline__claims');
  // `toBeHidden` also passes when NOTHING matches: the callout must exist (and stay mounted) for "hidden" to mean anything
  await expect(claims).toHaveCount(1);
  await expect(claims).toBeHidden();
  await row.locator('.gn-timeline__bar').hover();
  await expect(claims).toBeVisible();
  await page.mouse.move(5, 5);
  await expect(claims).toHaveCount(1);
  await expect(claims).toBeHidden();
  await row.locator('.gn-timeline__bar').focus();
  await expect(claims).toBeVisible();
});
