import { writeFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { openSeededBoard } from './helpers/board.js';
import { OWNER_EMAIL, signIn } from './helpers/sign-in.js';
test('dbg', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await signIn(page, OWNER_EMAIL);
  const { workspaceId, projectId } = await openSeededBoard(page);
  const card = page.locator('[data-testid^="ticket-card-"]').first();
  await expect(card).toBeVisible({ timeout: 20000 });
  const id = (await card.getAttribute('data-testid'))!.replace('ticket-card-', '');
  await page.goto(`http://localhost:3197/w/${workspaceId}/p/${projectId}?ticket=${id}`, { waitUntil: 'networkidle' });
  await expect(page.getByRole('dialog')).toBeVisible({ timeout: 20000 });
  await page.waitForTimeout(800);
  const out = await page.evaluate(() => {
    const panel = document.querySelector<HTMLElement>('.gn-sheet')!;
    const header = panel.querySelector<HTMLElement>('.gn-sheet__header')!;
    const r = (e: Element) => { const b = e.getBoundingClientRect(); const h = header.getBoundingClientRect(); return [b.left - h.left, b.top - h.top, b.width, b.height].map((n) => Math.round(n * 10) / 10); };
    const kids = (sel: string) => Array.from(header.querySelectorAll<HTMLElement>(sel));
    const info = () => ({
      move: r(header.querySelector('.gn-sheet__move')!),
      close: r(header.querySelector('.gn-sheet__close')!),
      crumbs: kids('.gn-ticket-sheet__crumbs > *').map(r),
      title: r(header.querySelector('.gn-ticket-sheet__title-input')!),
      header: r(header),
    });
    const compactNow = info();
    const vars = ['--gmx0','--gmy0','--gmw','--gcx0','--gcy0','--p','--gh-h0'].map((v) => [v, panel.style.getPropertyValue(v)]);
    const cs = getComputedStyle(header.querySelector('.gn-sheet__move')!);
    const mode = panel.getAttribute('data-compact');
    panel.removeAttribute('data-compact');
    const natural = info();
    const hdrCss = { disp: getComputedStyle(header).display, pos: getComputedStyle(header).position };
    panel.setAttribute('data-compact', mode!);
    return { mode, compactNow, natural, vars, moveTransform: cs.transform, moveW: cs.width, hdrCss, crumbHtml: header.querySelector('.gn-ticket-sheet__crumbs')!.outerHTML.slice(0, 900) };
  });
  writeFileSync('/tmp/g8-debug.json', JSON.stringify(out, null, 1));
});
