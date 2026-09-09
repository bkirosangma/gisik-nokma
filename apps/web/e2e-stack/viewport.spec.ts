import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { OWNER_EMAIL, signIn } from './helpers/sign-in.js';
import { sweepBorders } from './helpers/non-text-contrast.js';
import {
  RATCHETED,
  readAccessibleBaseline,
  recordAccessibleBaseline,
  sweepAccessibleNames,
} from '../e2e-viewport/accessible-names.js';

/** The signed-in twin's own baseline — a different population from the signed-out one. */
const STACK_ACCESSIBLE_BASELINE_PATH = fileURLToPath(
  new URL('./accessible-names-baseline.json', import.meta.url),
);
// The plain MODULE, never the spec: Playwright loads an imported spec's
// `test()` registrations too, and importing `responsive.spec.ts` here made this
// config try to run all six unauthed cases — six `project "" has no entry in
// VIEWPORTS` failures. A spec is not a library.
import {
  measureTapTargets,
  readTapBaseline,
  recordTapBaseline,
} from '../e2e-viewport/tap-targets.js';
import {
  LABEL_FLOOR_PX,
  measureTypeScale,
  readTypeScaleBaseline,
  recordTypeScaleBaseline,
} from '../e2e-viewport/type-scale.js';

// 13.364 (Round 2d, 2026-09-09) — this suite is one of the "both viewport
// suites" that case names as passing against the dev stack rebuilt from this
// round's frozen head (`../e2e-viewport/responsive.spec.ts` is the other).

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
 * FIVE ROUTES, AND THE OBVIOUS TWO WERE THE WRONG ONES. `/my-work` and the board
 * are the pages the finding itself names, and measured first they BOTH reported
 * zero elements under the floor. The five sub-floor declarations are on the
 * settings and membership surfaces instead, so a sweep of the named pages alone
 * would have ratcheted 0 and 0 and been blind to every rule this change fixes.
 * The route list below carries the detail.
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
 * 13.265 — label text on the signed-in surface holds this product's own 12px
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
   * user and links to ticket surfaces, not projects; and `/w/<id>` **was not a
   * page at all** when this was written — there was no
   * `app/w/[workspaceId]/page.tsx`, so it rendered the 404, which is a document
   * with a nav and some prose and would have swept cleanly while measuring
   * nothing this test is about. Guessing a route is how a sweep ends up
   * reporting a green number for a page it never loaded.
   *
   * **CORRECTED 2026-09-09 (Task 19): `/w/<id>` IS a page now** — the workspace
   * home — and it is swept as a seventh route below. The paragraph is kept
   * rather than deleted because its reasoning is what makes the new route worth
   * adding: a sweep of a 404 and a sweep of a real page are indistinguishable
   * from the numbers alone, which is why the new route carries `MUST_NAME`
   * probes that fail if the page did not actually render its controls. The
   * project links are still read from `/workspaces`, unchanged.
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
   * SIX ROUTES, AND THREE OF THEM ARE THE ONES THAT EARN THEIR KEEP.
   *
   * `/my-work` and the board were the obvious choices — the checklist's own
   * reading is about the board — and measured first they BOTH came back with
   * zero elements under the floor (smallest 12.8px, the chips). A sweep of just
   * those two would have ratcheted 0 and 0, reported green, and been perfectly
   * blind to every rule this change actually fixes.
   *
   * Because the five sub-floor declarations are not on those pages.
   *
   * ONE OF THE FIVE IS WITNESSED HERE, AND FOUR ARE NOT. Stated plainly because
   * "five rules fixed" beside "this suite is green" reads as five rules proven,
   * and only one of them is:
   *
   *     .ticket-type-list__badge    /settings/ticket-types   WITNESSED, 4 -> 0
   *     .gn-transition-edge__label  workflow EDITOR canvas   not rendered by
   *                                 (not the /settings/workflows list)  any route here
   *     .gn-avatar--small           board + ticket list, but ONLY when a card
   *                                 has an assignee -- and no seeded card does,
   *                                 so it rendered on none of these five routes
   *     .escape-chip__hint          editor chrome, reached only inside a
   *     .upload-chips__chip         ticket's description editor
   *
   * `.gn-avatar--small` is the one worth knowing about: it IS a `<span>` with
   * direct text, so this sweep would have caught it at 10.4px had it rendered.
   * It did not appear in the before-reading, which is how the gap was found —
   * the absence of an expected offender, not a green tick.
   * Owner for the four: whoever next seeds an assigned card or sweeps the
   * workflow editor and the description editor.
   *
   * THE WORKFLOW EDITOR WAS TRIED AND REMOVED, which is worth more than the
   * route would have been. `/settings/workflows/<id>` is where
   * `.gn-transition-edge__label` lives, so it looked like the way to witness
   * that repair. Reached by clicking (the list navigates with `router.push`;
   * there is no `<a href>` to read an id from), it measured:
   *
   *     {labelsInDom: 0, rulesInDom: 0, flowNodes: 0, flowEdges: 0}
   *     label text: selector matched 7, examined 5, smallest 16px
   *
   * The canvas renders NOTHING at 390px in the seeded world — not empty labels,
   * no graph at all — and the page is a shell of five nav elements. A route
   * that sweeps five nav links and reports 0 offenders is a green row meaning
   * nothing, reached by the most fragile navigation in the file. Removed.
   * The MUST_EXAMINE assertion is what said so, in one line naming the
   * selector, which is why that is a measured fact rather than a guess.
   *
   * `/members` is kept although it currently examines ZERO elements (its roster
   * rows are `li`/`p`, which belong to the body sweep's population, not this
   * one). Its baseline of 0 is still a live guard — small label text appearing
   * there later would be examined and would redden — but it proves nothing
   * today, and it does NOT cover `.gn-avatar--small`, which was why it was
   * added.
   *
   * The general lesson, which is the one this repo keeps paying for: a ratchet
   * on the pages a finding NAMED is not a ratchet on the pages the defect is
   * ON. Zero offenders on two routes is evidence about two routes.
   */
  /**
   * SELECTORS THAT MUST BE EXAMINED, per route.
   *
   * This exists because of a gap this suite's own first version had. Five CSS
   * rules were raised onto the floor; the ratchet witnessed exactly ONE of
   * them, and the other four were "fixed" against no measurement at all. A
   * ratchet at 0 for a rule that never renders is indistinguishable from a
   * ratchet at 0 for a rule that is fine.
   *
   * So the routes that are supposed to render a repaired rule now ASSERT that
   * they do. If a refactor stops rendering one, this reddens naming the
   * selector, rather than the ratchet quietly continuing to report 0 for
   * something it can no longer see.
   *
   * `gn-transition-edge__rule` and not `__label`: the label `div` has no direct
   * text (its children carry it) and this sweep counts only direct-text
   * carriers, so the child is where the inherited size is actually measured.
   */
  const MUST_EXAMINE: Record<string, string[]> = {
    'stack-phone-390|/settings/ticket-types': ['ticket-type-list__badge'],
  };

  /**
   * ACCESSIBLE NAMES THAT MUST BE ON THE PAGE, per route — and the reason this
   * map exists at all.
   *
   * `recordAccessibleBaseline` writes ABSENT keys only, so a route joining this
   * sweep for the first time RECORDS its floor and asserts nothing on that run:
   * "the floor did not fall" is vacuously true for a floor that was written
   * from the same numbers it is compared against. A new route's first pass is
   * therefore green by construction, which is the exact shape this repo has a
   * catalogue of.
   *
   * So a route whose POINT is that it carries named controls names them here,
   * and they are asserted directly, on every run including the first. This is
   * the accessible-name twin of `MUST_EXAMINE` above and it exists for the same
   * stated reason: a count of 3 for a page that rendered a 404 and a count of 3
   * for a page that rendered its controls are the same number.
   *
   * Task 19's `/w/<id>` is the first entry. Its probes are the three things the
   * workspace home adds that nothing else on this route list has: the sections
   * nav, an archive control named for its project, and the archived disclosure
   * named for its workspace.
   */
  const MUST_NAME: Record<string, Array<{ role: 'navigation' | 'button' | 'link'; name: RegExp }>> = {
    'stack-phone-390|/w/:workspaceId': [
      { role: 'navigation', name: /^Workspace sections$/ },
      { role: 'button', name: /^Archive / },
      { role: 'link', name: /^Ticket types$/ },
    ],
  };

  const routes: { path: string; key: string; reach?: () => Promise<void> }[] = [
    { path: `/w/${workspaceId}/my-work`, key: 'stack-phone-390|/my-work' },
    { path: projectHref ?? '', key: 'stack-phone-390|/p/:projectId' },
    { path: `/w/${workspaceId}/members`, key: 'stack-phone-390|/members' },
    {
      path: `/w/${workspaceId}/settings/ticket-types`,
      key: 'stack-phone-390|/settings/ticket-types',
    },
    { path: `/w/${workspaceId}/settings/workflows`, key: 'stack-phone-390|/settings/workflows' },
    /* `/workspaces` — ADDED 2026-09-08 with Task 4, and it should have been here
       from the start. Task 4's dispatch asserted "13.287's signed-in ratchet
       watches /workspaces"; it did not. The baseline file held five keys and
       none of them was this route, so the screen Task 4 restyles had NO
       accessible-name floor under it at all — the (a) task's stated guard was
       missing exactly the half that guards it.

       Recorded because of HOW it survived: the claim was written from the
       plan's promise rather than from `accessible-names-baseline.json`, and a
       ratchet nobody has read the keys of is indistinguishable from one that
       covers everything. The route is unscoped — it is the workspace CHOOSER,
       so it takes no `workspaceId`.

       Its sibling `/invite/<token>` is still uncovered and is a KNOWN RESIDUAL
       GAP, not an oversight: this suite has no standing invite token to visit,
       and a token-less visit renders the dead-link branch, which would baseline
       the wrong screen. Owner: whoever gives the stack seed a standing invite
       token — Task 4's successor at the invite surface, or Task 10 if it lands
       first. Also written in `docs/pre-launch-checklist.md`, because a gap that
       lives only in a code comment is a gap nobody reviews.

       13.350/13.351 (Task 15, neo restyle): this route's accessible-name,
       tap-target and type-scale ratchets — the loop below, run against THIS
       list — are what proves those floors did not fall under the restyle.
       Baselines are unchanged and this suite stayed green through Task 15's
       commits. */
    { path: '/workspaces', key: 'stack-phone-390|/workspaces' },
    /* `/w/<workspaceId>` — the workspace HOME, ADDED 2026-09-09 with Task 19,
       which is the commit that made it a page. It is the route that most needed
       a floor of the seven: it is the only one carrying admin-gated MUTATION
       controls, so a restyle that dropped an `aria-label` here would leave a
       person with a screen reader unable to tell which project a bare
       "Archive" button belongs to. Its `MUST_NAME` probes are what give this
       route's FIRST run teeth — see that map. */
    { path: `/w/${workspaceId}`, key: 'stack-phone-390|/w/:workspaceId' },
  ];

  for (const route of routes) {
    if (route.reach !== undefined) await route.reach();
    else await page.goto(route.path, { waitUntil: 'networkidle' });

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

    // Every rule this route is supposed to render, actually rendered. See
    // MUST_EXAMINE: a ratchet at 0 for a rule that never renders looks exactly
    // like a ratchet at 0 for a rule that is fine.
    for (const cls of MUST_EXAMINE[route.key] ?? []) {
      expect(
        typeScale.examined.map((e) => e.selector).filter((sel) => sel.includes(cls)),
        `${route.key} examined no element matching ".${cls}". This route exists in the sweep to ` +
          `witness that rule, so a 0 here would be a 0 about nothing. Either the page stopped ` +
          `rendering it or the sweep stopped seeing it; both make the ratchet decorative.`,
      ).not.toEqual([]);
    }

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

    /* ── 13.287 — ACCESSIBLE NAMES AND ROLES, signed-in twin of 13.285. ──
     * The signed-out ratchet cannot see any of this: `AppNav`, the view tabs,
     * the board and every settings screen only exist behind a session. Same
     * one-way contract, its own baseline file.
     * ──────────────────────────────────────────────────────────────────*/
    // 13.389 (Task 19) — the probes that have teeth on a route's FIRST run,
    // when the ratchet below has none. See MUST_NAME for why.
    for (const probe of MUST_NAME[route.key] ?? []) {
      await expect(
        page.getByRole(probe.role, { name: probe.name }).first(),
        `13.389: ${route.path} rendered no ${probe.role} named ${probe.name}. This route is in ` +
          `the sweep to witness that control, so an accessible-name count taken here would be a ` +
          `number about a page that is not the one under test.`,
      ).toBeVisible();
    }

    const names = await sweepAccessibleNames(page);
    expect(
      names.rawMatches,
      `13.287: the accessible-name sweep examined NOTHING on ${route.path}.`,
    ).toBeGreaterThan(0);

    // 13.342 (Task 14, 2026-09-09): this is the instrument that proved the
    // style toggle's accessible-name contribution — one `tablist` + three
    // `tab`s, `ariaLabel` +1 / `role` +4 / `ariaSelected` +3 / `ariaDescribedby`
    // +0 — rose on every signed-in route here without falling on any of them,
    // and that the signed-out twin (`e2e-viewport/responsive.spec.ts`) stayed
    // byte-identical because `AppNav` never renders there.
    //
    // 13.383 (Task 18, 2026-09-09): the same instrument, measured the same way
    // for the workspace card and the two new nav doors. `/workspaces` rose
    // `ariaLabel` 2 → 3 — the `Avatar`'s own `aria-label`, one per card — and
    // nothing else moved on it. **The five other signed-in routes rose on
    // `rawMatches` by exactly +2 and on NO ratcheted attribute**, which is the
    // measurement, not the prediction: `/help` and `/account` are plain
    // `<a href>` elements, and an implicit role is not a `role` ATTRIBUTE, so
    // the sweep's `hasAttribute` counts cannot see them. That +2 is the control
    // that says the sweep saw the new links at all. The floor was raised by
    // deleting the keys and re-recording under `UPDATE_ACCESSIBLE_BASELINE=1`,
    // which is the only way this file permits a rise — and it was safe to do
    // because the run BEFORE it asserted every old baseline and passed, so
    // nothing could be silently lowered by the re-record.
    const accessibleKey = route.key;
    const accessibleBaseline = readAccessibleBaseline(STACK_ACCESSIBLE_BASELINE_PATH)[accessibleKey];
    if (accessibleBaseline === undefined) {
      if (process.env['UPDATE_ACCESSIBLE_BASELINE'] === '1') {
        recordAccessibleBaseline(STACK_ACCESSIBLE_BASELINE_PATH, accessibleKey, names);
      }
      test
        .info()
        .annotations.push({ type: 'baseline', description: `${accessibleKey}: recorded, not asserted` });
    } else {
      for (const attr of RATCHETED) {
        expect(
          names[attr],
          `13.287: ${route.path} LOST ${attr}: baseline ${accessibleBaseline[attr]}, now ` +
            `${names[attr]}. Something that identified an element to assistive tech is gone. ` +
            `If this is intended, delete the key from e2e-stack/accessible-names-baseline.json ` +
            `in a commit that says which element and why.`,
        ).toBeGreaterThanOrEqual(accessibleBaseline[attr]);
      }
    }

    /* Case 13.267 — every control renders in the PRODUCT's font, not the
       browser's. The signed-in half of the guard for the owner-ruled
       2026-09-08 `font: inherit` fix, and it exists because the
       ratchet beside it could not have caught the thing it fixed: the 26
       controls sat at 13.3333px, ABOVE the 12px floor, so `offenders` was 0
       and the baseline stayed 0 through the whole defect. A fix whose only
       evidence is a number that did not move is not guarded at all.

       Deleting `button { font: inherit }` from `apps/web/app/globals.css`
       turns this red on four of the five routes, naming the selectors. */
    expect
      .soft(
        typeScale.uaFont,
        `text on ${route.path} is painted in the BROWSER's font, not the product's — a control ` +
          `where no rule sets \`font\`, which is what \`button { font: inherit }\` in ` +
          `apps/web/app/globals.css exists to prevent. These render at the UA default and no ` +
          `font-SIZE floor can see them, because the UA default sits above the floor. ` +
          `Offending: ${JSON.stringify(typeScale.uaFont)}`,
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

/**
 * 13.283 — non-text contrast (WCAG 1.4.11) over the rendered signed-in surface, with the number recorded rather than asserted.
 *
 * ## What this measures that nothing else did
 *
 * "17 of 24 distinct bordered classes below 3:1" was measured ad hoc and never
 * committed, so the finding could not be RE-measured — and a before/after
 * comparison built from two different instruments compares two different
 * populations while reading as meaningful. This is the instrument, committed
 * before the border sweep changes anything, so the "before" is a fact about a
 * tree rather than a fact recovered from prose.
 *
 * ## It RECORDS, it does not yet gate
 *
 * The defect is known, product-wide and owner-recorded. A test that failed on
 * it today would be red on `main` for a condition nobody has authorised fixing
 * in this commit — so this prints the roster and asserts only what must be true
 * for the printed number to MEAN anything:
 *
 * * the sweep examined a non-trivial number of bordered elements (a sweep that
 *   matched nothing reports zero offenders, which is the best possible result
 *   and the least trustworthy one), and
 * * the instrument can still tell red from green — the highest reading must
 *   clear 3:1 by a wide margin, which is the positive control the original
 *   ad-hoc measurement also carried (the primary button at 19.43 light).
 *
 * The moment the sweep lands, this becomes an assertion.
 *
 * ## 13.356 — TWO ROUTES ADDED, and a gap the sweep still cannot close, disclosed rather than hidden
 *
 * This sweep never visited `/sign-in` or `/workspaces` before Task 15 — the
 * five routes above are all SIGNED-IN, `/sign-in` never can be and
 * `/workspaces` was simply omitted. That is exactly where Task 14's neo
 * pure-look ruling (case 13.339: the empty `.gn-field__input` under
 * `[data-style="neo"]` is sunken with `border: none`, its identifying
 * boundary a `box-shadow` the owner accepted below 3:1) actually renders —
 * so a sweep that never looked there could not have recorded the waiver it
 * was measuring FOR, and `docs/lanes/executor-state.md`'s Task 14 entry
 * says so in as many words: "`.gn-field__input` renders only on
 * `/workspaces` … and `/sign-in` … NEITHER is among the five routes this
 * sweep visits."
 *
 * Both routes are added below. That closes the "never looked" half. The
 * "cannot compute a box-shadow's contrast ratio" half is NOT closed —
 * `sweepBorders` composites `border-{side}-width/style/color` only
 * (`helpers/non-text-contrast.ts`), by design, and an element with
 * `border: none` contributes nothing for it to measure regardless of what
 * its `box-shadow` paints. So visiting `/sign-in` and `/workspaces` now
 * finds the field, confirms empirically (DOM checks below, on the actual
 * rendered route) that it has no border and does have a shadow, and then
 * — because that shadow's ratio is exactly the thing this instrument
 * cannot compute — records Task 13's measured numbers (1.24 light / 1.16
 * dark, `docs/neo-token-report.md`, quoted verbatim in `ui.css`'s
 * `[data-style="neo"] .gn-field__input` docblock and case 13.339) as a
 * SANCTIONED entry in the persisted roster, citing the owner's ruling.
 * "Sanctioned" means: known, measured elsewhere, accepted — appended to the
 * FILE for a human reading the roster to see, and deliberately never to
 * `below` — an instrument cannot fail an assertion over a number it did
 * not itself compute. The gap this closes is the roster silently NOT
 * growing (case 13.343's finding) and looking like "nothing to disclose"
 * rather than "the owner accepted something outside what this can see".
 */
test('records non-text contrast across the signed-in surface, with a positive control', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);

  const worst = new Map<string, { ratio: number; border: string; backdrop: string; routes: string[] }>();
  const sweptRoutes: string[] = [];
  let examinedTotal = 0;
  let bestSeen = 0;

  function absorb(routeKey: string, sweep: Awaited<ReturnType<typeof sweepBorders>>): void {
    sweptRoutes.push(routeKey);
    examinedTotal += sweep.examined;
    for (const reading of sweep.readings) {
      bestSeen = Math.max(bestSeen, reading.ratio);
      const existing = worst.get(reading.selector);
      if (existing === undefined) {
        worst.set(reading.selector, {
          ratio: reading.ratio,
          border: reading.border,
          backdrop: reading.backdrop,
          routes: [routeKey],
        });
      } else {
        if (!existing.routes.includes(routeKey)) existing.routes.push(routeKey);
        if (reading.ratio < existing.ratio) {
          existing.ratio = reading.ratio;
          existing.border = reading.border;
          existing.backdrop = reading.backdrop;
        }
      }
    }
  }

  /** The neo sunken-input DOM ground-truth this waiver rests on, checked on the ACTUAL rendered route rather than trusted from prose. */
  async function assertSunkenNoBorderField(routeLabel: string): Promise<void> {
    const field = page.locator('.gn-field__input').first();
    await expect(field).toBeVisible();
    const style = await field.evaluate((el) => {
      const computed = getComputedStyle(el);
      return { borderStyle: computed.borderStyle, boxShadow: computed.boxShadow };
    });
    expect(
      style.borderStyle,
      `13.356: .gn-field__input on ${routeLabel} has a border (${style.borderStyle}) — the pure-neo ` +
        `no-border ruling (13.339) no longer holds, so the sanctioned waiver below is unearned.`,
    ).toBe('none');
    expect(
      style.boxShadow,
      `13.356: .gn-field__input on ${routeLabel} has no box-shadow — there is no boundary at all here, ` +
        `not merely one this sweep cannot compute, which is a worse defect than the waiver discloses.`,
    ).not.toBe('none');
  }

  // 13.356 — visited BEFORE signing in: this is the one signed-out route the
  // sweep now walks, and the only place `.gn-field__input` renders without a
  // session.
  await page.goto('/sign-in', { waitUntil: 'networkidle' });
  absorb('/sign-in', await sweepBorders(page));
  await assertSunkenNoBorderField('/sign-in');

  await signIn(page, OWNER_EMAIL);

  // 13.356 — `/workspaces` was never in this sweep's route list even though
  // every OTHER stack instrument (the accessible-names ratchet, `:382` above)
  // already covers it; its founding form is the other place the field renders.
  await page.goto('/workspaces', { waitUntil: 'networkidle' });
  absorb('/workspaces', await sweepBorders(page));
  await assertSunkenNoBorderField('/workspaces');

  const workspaceLink = page.locator('a[href^="/w/"]').first();
  await workspaceLink.waitFor({ timeout: 15_000 });
  const workspaceHref = await workspaceLink.getAttribute('href');
  const workspaceId = /^\/w\/([^/]+)/.exec(workspaceHref ?? '')?.[1];
  expect(workspaceId, `could not read a workspace id out of ${workspaceHref}`).toBeDefined();

  const projectLink = page.locator(`a[href^="/w/${workspaceId}/p/"]`).first();
  await projectLink.waitFor({ timeout: 15_000 });
  const projectHref = await projectLink.getAttribute('href');
  expect(projectHref, 'no project link — the seed or the session is wrong').not.toBeNull();

  const routes = [
    { path: `/w/${workspaceId}/my-work`, key: '/my-work' },
    { path: projectHref ?? '', key: '/p/:projectId' },
    { path: `/w/${workspaceId}/members`, key: '/members' },
    { path: `/w/${workspaceId}/settings/ticket-types`, key: '/settings/ticket-types' },
    { path: `/w/${workspaceId}/settings/workflows`, key: '/settings/workflows' },
  ];

  for (const route of routes) {
    await page.goto(route.path, { waitUntil: 'networkidle' });
    absorb(route.key, await sweepBorders(page));
  }

  const roster = [...worst.entries()].sort((a, b) => a[1].ratio - b[1].ratio);
  const below = roster.filter(([, r]) => r.ratio < 3);

  /*
   * 13.356 — the SANCTIONED waiver. Not a `worst` entry (nothing this sweep
   * measured produced it — `sweepBorders` never scored `.gn-field__input`
   * under neo at all, per the docblock above), so it is appended to the
   * PERSISTED roster only, after `below` is already computed: it can never
   * trip the zero-below-3 assertion, because that assertion is about what
   * THIS instrument measured, and this number is Task 13's, cited, not
   * remeasured. Both figures are recorded even though only light is
   * DOM-confirmed above — dark is Task 13's own measurement, structurally
   * out of reach of a suite with no theme-switching (`docs/lanes/executor-state.md`'s
   * Task 14 entry names the theme this sweep runs under as light-only, and
   * that has not changed here).
   */
  const sanctionedWaivers = [
    {
      selector: '[data-style="neo"] .gn-field__input',
      sanctioned: true as const,
      ratioLight: 1.24,
      ratioDark: 1.16,
      border: 'none — sunken box-shadow only, not compositable by this instrument',
      backdrop: 'surface (neo)',
      routes: ['/sign-in', '/workspaces'],
      citation:
        'Owner ruling 2026-09-09 (Task 14 AMENDMENT rule (a)): the empty input takes the pure neo ' +
        'look (sunken, no border) even below 3:1. Measured by Task 13 (docs/neo-token-report.md); ' +
        'quoted in packages/ui/src/ui.css\'s [data-style="neo"] .gn-field__input docblock and case ' +
        '13.339. Light confirmed by this run\'s own DOM check; dark is Task 13\'s measurement, cited.',
    },
  ];

  /*
   * Written to a FILE, not only logged. Two reasons, one of them measured
   * today: the console output of this run reached the operator EMPTY because a
   * shell-level tool filtered it, and a sweep whose result can be silently
   * swallowed is a sweep that reports whatever the reader already believed. The
   * other is that a before/after comparison needs the BEFORE to still exist
   * after the tree has changed — prose is not a baseline.
   */
  writeFileSync(
    new URL('./non-text-contrast-roster.json', import.meta.url),
    `${JSON.stringify(
      {
        belowCount: below.length,
        totalClasses: roster.length,
        examined: examinedTotal,
        highestReading: Number(bestSeen.toFixed(2)),
        routes: sweptRoutes,
        roster: roster.map(([selector, r]) => ({
          selector,
          ratio: Number(r.ratio.toFixed(2)),
          border: r.border,
          backdrop: r.backdrop,
          routes: r.routes,
        })),
        sanctionedWaivers,
      },
      null,
      2,
    )}\n`,
  );
  console.log(
    `[non-text-contrast] ${below.length} of ${roster.length} distinct bordered classes below 3:1 ` +
      `(${examinedTotal} bordered elements examined across ${sweptRoutes.length} routes; ` +
      `highest reading ${bestSeen.toFixed(2)} as the positive control; ` +
      `${sanctionedWaivers.length} sanctioned waiver(s) recorded separately)`,
  );
  for (const [selector, r] of roster) {
    console.log(
      `[non-text-contrast]   ${r.ratio < 3 ? 'BELOW' : 'ok   '} ${r.ratio.toFixed(2)}  ${selector}  ` +
        `border ${r.border} on ${r.backdrop}  [${r.routes.join(' ')}]`,
    );
  }

  /*
   * ## This ASSERTS now, where it only recorded before
   *
   * When this case was written the defect was live — 13 of 20 — so it printed
   * the roster and asserted only that the instrument worked. The sweep has
   * closed it, so the case becomes the guard: zero classes below 3:1, product
   * wide, on every route it walks.
   *
   * ## The population assertion it USED to carry was retired deliberately
   *
   * It read `expect(examinedTotal).toBeGreaterThan(20)`, guarding the real
   * hazard that a sweep matching nothing reports zero offenders — the best
   * possible result and the least trustworthy one. **The sweep then removed 54
   * borders and the count fell to 19, and this went red.** The guard was
   * working; its threshold had become an assumption about a population the
   * change itself was designed to shrink.
   *
   * It is NOT lowered to 19, which would be moving a bar to meet a result. It
   * is replaced by a control that cannot be satisfied by an instrument that has
   * stopped working: **the same sweep, on the same rendered page, run again at
   * an absurd threshold, must report offenders.** A sweep that answers "zero
   * below 3" AND "zero below 25" is not measuring anything — and that check
   * stays honest no matter how many borders the product ends up with.
   */
  expect(
    below.map(([selector, r]) => `${selector} ${r.ratio.toFixed(2)}`),
    'non-text contrast regressed — these classes render below WCAG 1.4.11 3:1',
  ).toEqual([]);

  // The negative control, run through the SAME path as the measurement: at a
  // threshold nothing could clear, the instrument must find offenders.
  const absurd = await sweepBorders(page, 25);
  expect(
    absurd.below.length,
    'the sweep reported no offenders even at 25:1 — it is not measuring, and its ' +
      'zero above means nothing',
  ).toBeGreaterThan(0);

  // And it can still tell red from green in the ordinary range.
  expect(bestSeen).toBeGreaterThan(15);
});
