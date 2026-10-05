import { expect, test } from '@playwright/test';

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
