import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { OWNER_EMAIL, signIn } from './helpers/sign-in.js';
import {
  LABEL_FLOOR_PX,
  measureTypeScale,
  readTypeScaleBaseline,
  recordTypeScaleBaseline,
} from '../e2e-viewport/type-scale.js';

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
});

/**
 * ## THE TYPE-SCALE SWEEP THE SIGNED-OUT SUITE CANNOT PERFORM
 *
 * Same argument as the overflow case above, applied to a different property.
 * `docs/pre-launch-checklist.md` reported the finding this test answers, and
 * every element it named is on an authenticated page:
 *
 *     "Small text is real but mostly legitimate labels
 *      (`gn-board-card__provenance` at 12.5px x25, chips at 12.8px)"
 *
 * MEASURED, not assumed: the unauthed suite sweeps the same population over
 * `/help`, `/privacy`, `/terms`, `/sign-in` and the 404 and reports every
 * examined element at exactly **16px** on all five. The signed-out surface has
 * no small label text at all, so a guard living only there would stay green
 * through any regression on the board — the same way it would have stayed green
 * through the whole `.gn-nav` overflow bug.
 *
 * TWO ROUTES, NOT ONE. `/my-work` is where the tap-target work measured, but the
 * checklist's own reading is about the BOARD (`gn-board-card__provenance`, x25),
 * which renders on a project page. Sweeping only `/my-work` would ratchet a
 * number for a page the finding was not about and report coverage of one it
 * never loaded.
 *
 * The floor and its derivation live in `e2e-viewport/type-scale.ts`. The one
 * thing worth repeating at the call site: **no WCAG success criterion sets a
 * minimum font size** — 12px is the bottom rung of this product's own scale
 * (0.75rem, seventeen rules in `packages/ui/src/ui.css`), not a borrowed number.
 */

const STACK_TYPE_SCALE_BASELINE = fileURLToPath(
  new URL('./type-scale-baseline.json', import.meta.url),
);

/**
 * 13.264 — label text on the signed-in surface holds this product's own 12px
 * floor, ratcheted per route. Signs in through the real door, reaches the
 * workspace-scoped pages from the seeded world rather than hardcoding ids,
 * asserts the viewport took effect before believing any measurement, and prints
 * the full size histogram on every run so the next reader starts from the shape
 * of the page instead of one count.
 */
test('label text on the signed-in surface holds the 12px floor at 390px', async ({ page }) => {
  await page.setViewportSize(PHONE);
  await signIn(page, OWNER_EMAIL);

  await page.goto('/workspaces');
  const workspaceLink = page.locator('a[href^="/w/"]').first();
  await workspaceLink.waitFor({ timeout: 15_000 });
  const workspaceHref = await workspaceLink.getAttribute('href');
  const workspaceId = /^\/w\/([^/]+)/.exec(workspaceHref ?? '')?.[1];
  expect(workspaceId, `could not read a workspace id out of ${workspaceHref}`).toBeDefined();

  /**
   * The board's id comes from the page, for the same reason the workspace's
   * does: the seed's ULIDs are not stable across a reseed, and a hardcoded id
   * fails as a 404 — which renders no board, sweeps a nearly empty document,
   * finds no offenders, and reports the best possible result. A missing board
   * must be a LOUD failure here, never a quiet green.
   */
  /**
   * The project links are on `/workspaces` — the SAME page the workspace id
   * came from (`app/workspaces/page.tsx:67` renders
   * `/w/<workspaceId>/p/<projectId>` per project).
   *
   * Recorded because two other readings of this looked equally reasonable and
   * both cost a run: `/my-work` lists the tickets assigned to the signed-in
   * user and links to ticket surfaces, not projects; and `/w/<id>` is not a
   * page at all — there is no `app/w/[workspaceId]/page.tsx`, so it renders the
   * 404, which is a document with a nav and some prose and would have swept
   * cleanly while measuring nothing this test is about. Guessing a route is how
   * a sweep ends up reporting a green number for a page it never loaded.
   */
  const projectLink = page.locator(`a[href^="/w/${workspaceId}/p/"]`).first();
  await projectLink.waitFor({ timeout: 15_000 });
  const projectHref = await projectLink.getAttribute('href');
  expect(
    projectHref,
    'no project link reachable from /my-work — the seed or the session is wrong, and sweeping ' +
      'without the board would report coverage of the page the finding was actually about',
  ).not.toBeNull();

  /**
   * FIVE ROUTES, AND THE LAST THREE ARE THE ONES THAT EARN THEIR KEEP.
   *
   * `/my-work` and the board were the obvious choices — the checklist's own
   * reading is about the board — and measured first they BOTH came back with
   * zero elements under the floor (smallest 12.8px, the chips). A sweep of just
   * those two would have ratcheted 0 and 0, reported green, and been perfectly
   * blind to every rule this change actually fixes.
   *
   * Because the five sub-floor declarations are not on those pages. Measured,
   * they live on the settings and membership surfaces:
   *
   *     .ticket-type-list__badge      /settings/ticket-types
   *     .gn-transition-edge__label    /settings/workflows
   *     .gn-avatar--small             /members
   *
   * (`.escape-chip__hint` and `.upload-chips__chip` are editor chrome, reached
   * only inside a ticket's description editor; they are fixed and enumerated in
   * the commit, but no route here renders them and this file does not claim
   * they are covered.)
   *
   * The general lesson, which is the one this repo keeps paying for: a ratchet
   * on the pages a finding NAMED is not a ratchet on the pages the defect is
   * ON. Zero offenders on two routes is evidence about two routes.
   */
  const routes = [
    { path: `/w/${workspaceId}/my-work`, key: 'stack-phone-390|/my-work' },
    { path: projectHref ?? '', key: 'stack-phone-390|/p/:projectId' },
    { path: `/w/${workspaceId}/members`, key: 'stack-phone-390|/members' },
    {
      path: `/w/${workspaceId}/settings/ticket-types`,
      key: 'stack-phone-390|/settings/ticket-types',
    },
    { path: `/w/${workspaceId}/settings/workflows`, key: 'stack-phone-390|/settings/workflows' },
  ];

  for (const route of routes) {
    await page.goto(route.path, { waitUntil: 'networkidle' });

    // ── The instrument proves itself before it is believed, per route: a
    // client-side navigation can reset nothing, but `goto` is a full load and
    // this repo does not trust a viewport it has not re-read.
    const innerWidth = await page.evaluate(() => window.innerWidth);
    expect(
      innerWidth,
      `innerWidth=${innerWidth} on ${route.path}; every size below would be a desktop ` +
        `measurement wearing a phone's label.`,
    ).toBe(PHONE.width);

    // The signed-in shell must actually be rendered — otherwise this passes on a
    // redirect to sign-in, whose sparse document has no small labels to find.
    await expect(page.locator('.gn-nav')).toBeVisible();

    const typeScale = await measureTypeScale(page);

    /* eslint-disable no-console */
    console.log(
      `[stack-phone-390] ${route.path} — label text: selector matched ${typeScale.rawMatches}, ` +
        `examined ${typeScale.examined.length}, body-owned ${typeScale.bodyOwned.length}, ` +
        `skipped ${typeScale.skipped}, smallest = ${
          typeScale.smallest === null
            ? 'n/a'
            : `${typeScale.smallest.fontSizePx}px on ${typeScale.smallest.selector}`
        }, under-${LABEL_FLOOR_PX}px=${typeScale.offenders.length}`,
    );
    console.log(
      `[stack-phone-390] ${route.path} — label-text sizes: ${JSON.stringify(
        Object.fromEntries(
          Object.entries(
            typeScale.examined.reduce<Record<string, number>>((acc, s) => {
              const bucket = `${s.fontSizePx}px`;
              acc[bucket] = (acc[bucket] ?? 0) + 1;
              return acc;
            }, {}),
          ).sort(([a], [b]) => Number.parseFloat(a) - Number.parseFloat(b)),
        ),
      )}`,
    );
    if (typeScale.offenders.length > 0) {
      console.log(
        `[stack-phone-390] ${route.path} — offenders: ${JSON.stringify(typeScale.offenders)}`,
      );
    }
    /* eslint-enable no-console */

    // The selector control, hard and before the ratchet: a sweep that matched
    // nothing reports zero offenders and reads as the best possible result.
    expect(
      typeScale.rawMatches,
      `the label-text selector matched NOTHING on ${route.path}. The population includes ` +
        `\`div\`, so a rendered signed-in page cannot honestly produce 0 here.`,
    ).toBeGreaterThan(0);

    // The disjointness claim that justifies two sweeps instead of one, measured.
    expect
      .soft(
        typeScale.bodyOwned,
        `elements matched BOTH the label-text and body-text selectors on ${route.path}; the ` +
          `two populations have grown into each other and their counts are no longer separable. ` +
          `Overlapping: ${JSON.stringify(typeScale.bodyOwned)}`,
      )
      .toEqual([]);

    const baseline = readTypeScaleBaseline(STACK_TYPE_SCALE_BASELINE);
    const allowed = baseline[route.key];
    if (allowed === undefined) {
      // A missing baseline FAILS rather than seeding itself, exactly as the
      // unauthed suite's guard does: seeding from the current run records
      // whatever is broken today and prints a tick over zero enforcement.
      if (process.env['UPDATE_TYPE_SCALE_BASELINE'] === '1') {
        recordTypeScaleBaseline(route.key, typeScale.offenders.length, STACK_TYPE_SCALE_BASELINE);
      } else {
        expect(
          allowed,
          `no type-scale baseline for "${route.key}" in e2e-stack/type-scale-baseline.json, and ` +
            `this suite refuses to invent one. Observed ${typeScale.offenders.length} offenders. ` +
            `Re-run once with UPDATE_TYPE_SCALE_BASELINE=1 and COMMIT the file.`,
        ).toBeDefined();
      }
    } else {
      expect
        .soft(
          typeScale.offenders.length,
          `label text under ${LABEL_FLOOR_PX}px on ${route.path} rose above the recorded ` +
            `baseline ${allowed} for ${route.key}. This is a RATCHET — the count may fall, never ` +
            `rise. Offenders: ${JSON.stringify(typeScale.offenders)}`,
        )
        .toBeLessThanOrEqual(allowed);
    }
  }
});
