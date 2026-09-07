import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { OWNER_EMAIL, signIn } from './helpers/sign-in.js';
import {
  measureTapTargets,
  readTapBaseline,
  recordTapBaseline,
} from '../e2e-viewport/responsive.spec.js';

/**
 * ## THE ONE VIEWPORT CASE THAT CANNOT LIVE IN `e2e-viewport/`
 *
 * `playwright.viewport.config.ts` covers the five routes reachable with no
 * session — `/help`, `/privacy`, `/terms`, `/sign-in`, the 404 — and that is the
 * right scope for a suite that starts its own `next dev` and talks to no server.
 *
 * **But the defect item 7 actually found was on the authenticated pages, and a
 * regression suite that cannot see the page the bug was on is decoration.**
 * `.gn-nav` overflowed the viewport by 10px at 390x844 on `/my-work`,
 * `/members`, both settings pages and the board — and on none of the unauthed
 * routes, because `AppNav` is the thing that overflowed and signed-out pages do
 * not render it. So the unauthed suite would have stayed green through the whole
 * bug, before and after.
 *
 * It is also not enough to sign in and stop at `/workspaces`: measured, that
 * page did NOT overflow while `/my-work` did. `AppNav` renders more links once a
 * workspace is in scope (`My Work`, and the rest), and it is the longer row that
 * runs past the edge. The case therefore has to reach a WORKSPACE-SCOPED page.
 *
 * WHY THE OVERFLOW IS DATA-DEPENDENT, which is what makes a fixed-width guess
 * the wrong fix: the row's last child is `Sign out {user.name}`, so its width
 * follows the signed-in user's name. 10px was the seeded owner's; a longer name
 * runs further. `.gn-nav` now sets `flex-wrap: wrap` (`globals.css`), which is
 * what every other flex row of its shape in the two stylesheets already did.
 *
 * THE INSTRUMENT ASSERTS ITSELF FIRST. `page.setViewportSize` is trusted by
 * nobody here: this repo has a recorded failure where a resize reported success
 * while the page kept reporting `innerWidth: 1512` and the screenshot was
 * byte-identical to the desktop one, twice on two different days. So the width
 * is read back INSIDE the page and asserted before any measurement is believed.
 * A viewport case that cannot tell whether the viewport applied measures the
 * default width and calls it a phone.
 */

const PHONE = { width: 390, height: 844 };

/**
 * 13.254 — the signed-in shell does not scroll sideways on a phone. Signs in
 * through the real door, reaches a WORKSPACE-SCOPED page (`AppNav`'s longer row,
 * the one that overflowed; `/workspaces` did not and would not have caught it),
 * asserts `window.innerWidth` really is 390 before measuring, then asserts
 * `documentElement.scrollWidth <= clientWidth + 1` AND that no element's rect
 * crosses the right edge — the second because a clipped child can leave
 * scrollWidth clean while still being unreachable.
 */
test('the signed-in shell does not scroll sideways at 390px', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signIn(page, OWNER_EMAIL);

  // Reach a workspace-scoped route from the seeded world rather than hardcoding
  // an id: the seed's ULIDs are not stable across a reseed, and a hardcoded id
  // would fail as a 404 that looks like a layout pass.
  await page.goto('/workspaces');
  const workspaceLink = page.locator('a[href^="/w/"]').first();
  await workspaceLink.waitFor({ timeout: 15_000 });
  const href = await workspaceLink.getAttribute('href');
  expect(href, 'no workspace link on /workspaces — the seed or the session is wrong').not.toBeNull();
  const workspaceId = /^\/w\/([^/]+)/.exec(href ?? '')?.[1];
  expect(workspaceId, `could not read a workspace id out of ${href}`).toBeDefined();

  await page.goto(`/w/${workspaceId}/my-work`, { waitUntil: 'networkidle' });

  // ── The instrument proves itself before it is believed.
  const innerWidth = await page.evaluate(() => window.innerWidth);
  expect(
    innerWidth,
    `setViewportSize reported success and the page reports innerWidth=${innerWidth}. That is the ` +
      `exact shape of this repo's recorded resize failure; every number below would be a desktop ` +
      `measurement wearing a phone's label.`,
  ).toBe(PHONE.width);

  // The nav must actually be on screen — otherwise this passes on a redirect to
  // sign-in, which renders no AppNav and trivially does not overflow.
  await expect(page.locator('.gn-nav')).toBeVisible();

  const layout = await page.evaluate(() => {
    const doc = document.documentElement;
    const viewportWidth = doc.clientWidth;
    const escaping: Array<{ selector: string; right: number }> = [];
    for (const el of Array.from(document.querySelectorAll('*'))) {
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      if (rect.right > viewportWidth + 0.5) {
        const cls =
          typeof el.className === 'string' && el.className !== ''
            ? `.${el.className.trim().split(/\s+/).join('.')}`
            : '';
        escaping.push({ selector: `${el.tagName.toLowerCase()}${cls}`, right: Math.round(rect.right) });
      }
    }
    return { scrollWidth: doc.scrollWidth, clientWidth: viewportWidth, escaping: escaping.slice(0, 10) };
  });

  expect(
    layout.escaping,
    `elements crossing the right edge at ${PHONE.width}px: ${JSON.stringify(layout.escaping)}`,
  ).toEqual([]);
  expect(
    layout.scrollWidth,
    `documentElement.scrollWidth ${layout.scrollWidth} > clientWidth ${layout.clientWidth} + 1 — ` +
      `the signed-in shell scrolls sideways on a phone`,
  ).toBeLessThanOrEqual(layout.clientWidth + 1);

  /* ──────────────────────────────────────────────────────────────────────────
   * TAP TARGETS ON THE SIGNED-IN SHELL — the numbers that had no guard at all.
   *
   * The pre-launch review measured 48 interactive elements under 24x24 on the
   * board and recorded them as "reported, not fixed". Nothing pinned them: this
   * file measured OVERFLOW only, and the unauthed suite cannot see these pages.
   * So the one place the counts were written down was a prose note in a
   * checklist, which no run can contradict.
   *
   * The measurement is IMPORTED, not restated. `measureTapTargets` and the
   * baseline helpers live in `e2e-viewport/responsive.spec.ts`; a second copy
   * here would be a second definition of "what a tap target is", free to drift
   * from the first while both files keep reporting confident numbers.
   * ────────────────────────────────────────────────────────────────────────*/
  const taps = await measureTapTargets(page);
  const smallest = taps.smallestExamined;
  console.log(
    `[stack-phone-390] /my-work — tap targets: selector matched ${taps.rawMatches}, ` +
      `examined ${taps.examined.length}, inline-in-prose exempt ${taps.inlineExempt.length}, ` +
      `invisible skipped ${taps.invisibleSkipped}, smallest examined = ` +
      `${smallest === null ? 'n/a' : `${smallest.w}x${smallest.h} (${smallest.selector})`}, ` +
      `offenders=${taps.offenders.length}`,
  );
  // The anti-broken-selector control, the same one the unauthed suite carries:
  // `examined` may legitimately be small, but a zero `rawMatches` on a page with
  // a nav, a search box and a board can only mean the selector stopped matching.
  expect(taps.rawMatches, 'the tap-target selector matched NOTHING on the signed-in shell').toBeGreaterThan(5);

  const TAP_BASELINE = fileURLToPath(new URL('./tap-target-baseline.json', import.meta.url));
  const tapKey = 'stack-phone-390|/my-work';
  const allowed = readTapBaseline(TAP_BASELINE)[tapKey];
  if (allowed === undefined) {
    // A MISSING BASELINE FAILS rather than seeding itself — the same guard, and
    // for the same reason, as the unauthed suite: a first run that recorded
    // whatever is broken today would print a tick over zero enforcement.
    if (process.env['UPDATE_TAP_BASELINE'] === '1') {
      recordTapBaseline(tapKey, taps.offenders.length, TAP_BASELINE);
    } else {
      expect(
        allowed,
        `no tap-target baseline for "${tapKey}" in e2e-stack/tap-target-baseline.json, and this suite ` +
          `refuses to invent one. Observed ${taps.offenders.length} offenders. Re-run once with ` +
          `UPDATE_TAP_BASELINE=1 and COMMIT the file.`,
      ).toBeDefined();
    }
  } else {
    expect(
      taps.offenders.length,
      `interactive targets under 44x44 on the signed-in shell rose above the recorded ` +
        `${allowed}: ${JSON.stringify(taps.offenders.slice(0, 8))}`,
    ).toBeLessThanOrEqual(allowed);
  }
});
