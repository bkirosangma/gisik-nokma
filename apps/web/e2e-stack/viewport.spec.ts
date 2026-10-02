import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';
import { readWorkspaceId, seededProjectHref } from './helpers/board.js';
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

/**
 * The signed-in tap-target ratchet's own baseline. **One key per ROUTE**, not
 * one for the suite — E4-12, 2026-09-21.
 *
 * Before this the file called `measureTapTargets` ONCE, inside the `/my-work`
 * test, and the baseline file held one key (`stack-phone-390|/my-work: 6`). The
 * ratchet's whole population was therefore one route at one width, and its
 * `offenders=6` read as a statement about the product rather than about a page.
 * The route loop below now measures every route in its list, so the key is
 * `route.key` — the same string shape the type-scale and accessible-name
 * ratchets already use. **The floor itself still has ONE home**
 * (`e2e-viewport/tap-targets.ts`, and `apps/web/test/tap-target-density.test.ts`
 * fails if either spec ever grows a private comparison of its own).
 */
const STACK_TAP_BASELINE = fileURLToPath(new URL('./tap-target-baseline.json', import.meta.url));
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
 * WHY THE OVERFLOW WAS DATA-DEPENDENT, which is what made a fixed-width guess
 * the wrong fix: the row's last child was `Sign out {user.name}`, so its width
 * followed the signed-in user's name. 10px was the seeded owner's; a longer
 * name ran further. `.gn-nav` now sets `flex-wrap: wrap` (`globals.css`), which
 * is what every other flex row of its shape in the two stylesheets already did.
 *
 * **ROUND 24 REMOVED THAT PARTICULAR DATA-DEPENDENCE, and the fix still
 * stands.** The last child is now `.gn-nav__corner` — an inbox icon and a
 * monogram avatar, two controls at a fixed 2.75rem each — so the tail of the
 * bar no longer grows with the user's name. The wrap is kept because the part
 * that overflowed is `.gn-nav__links`, whose width follows the WORKSPACE NAME
 * and the number of workspace-scoped items, and neither of those became fixed.
 * The corner got narrower, so this case cannot newly fail on its account; it is
 * retained because the links row is still data-dependent and still the thing
 * being measured.
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
  // `readWorkspaceId` carries the same "the seed or the session is wrong" refusal, and RETURNS a
  // `string` — the inline version this replaces left the id `string | undefined`, which typechecks
  // through a template literal and fails the moment it is passed to a typed function. Found by the
  // gate, not by reading.
  const workspaceId = await readWorkspaceId(page);

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
   * The measurement is IMPORTED, not restated. `measureTapTargets`, the
   * `DENSE_IN_LIST` table and the baseline helpers live in
   * `e2e-viewport/tap-targets.ts` — a plain MODULE, which is why the import
   * below reaches them without dragging this file's sibling spec in. (This
   * sentence said `e2e-viewport/responsive.spec.ts` until 2026-09-20; that was
   * true before the 2026-09-08 move and stale for the twelve days after it, in the
   * same paragraph that explains why a spec is not a library.) A second copy
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
  // The split's own reading — the twin of the line `responsive.spec.ts` prints,
  // and the only place this suite can show that `DENSE_IN_LIST` classified the
  // attention row's title rather than leaving it judged at 44.
  console.log(
    `[stack-phone-390] /my-work — tap-target floors: in-list classified ${taps.denseMembers} ` +
      `(24px floor), standalone judged ${taps.examined.length - taps.denseMembers} (44px floor), ` +
      `rescued from the flat 44 by the split=${taps.denseAccepted.length}, ` +
      `stale entries=${JSON.stringify(taps.brokenEntries)}`,
  );
  // The anti-broken-selector control, the same one the unauthed suite carries:
  // `examined` may legitimately be small, but a zero `rawMatches` on a page with
  // a nav, a search box and a board can only mean the selector stopped matching.
  expect(taps.rawMatches, 'the tap-target selector matched NOTHING on the signed-in shell').toBeGreaterThan(5);

  const tapKey = 'stack-phone-390|/my-work';
  const allowed = readTapBaseline(STACK_TAP_BASELINE)[tapKey];
  if (allowed === undefined) {
    // A MISSING BASELINE FAILS rather than seeding itself — the same guard, and
    // for the same reason, as the unauthed suite: a first run that recorded
    // whatever is broken today would print a tick over zero enforcement.
    if (process.env['UPDATE_TAP_BASELINE'] === '1') {
      recordTapBaseline(tapKey, taps.offenders.length, STACK_TAP_BASELINE);
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
      `interactive targets below their own floor on the signed-in shell rose above the recorded ` +
        `${allowed}: ${JSON.stringify(taps.offenders.slice(0, 8))}. The floor is 24px for a ` +
        `control this suite's DENSE_IN_LIST classifies as in-list (WCAG 2.5.8) and 44px for every ` +
        `other control (WCAG 2.5.5); each offender above carries the floor it missed.`,
    ).toBeLessThanOrEqual(allowed);
  }

  /**
   * THE STALE-ENTRY GUARD, the twin of the one the unauthed suite carries. Its
   * own argument is written out there and is not repeated here beyond the part
   * that is specific to this suite: `/my-work` is the ONLY route in this file,
   * so this is the only place the attention strip's entry can be caught
   * matching nothing while its container still renders.
   */
  expect
    .soft(
      taps.brokenEntries,
      `a DENSE_IN_LIST entry's container rendered on the signed-in shell but its control ` +
        `selector matched nothing inside it — the entry has stopped classifying anything, so the ` +
        `control it names is being judged against the 44px floor again. Fix the selector in ` +
        `apps/web/e2e-viewport/tap-targets.ts, or remove the entry.`,
    )
    .toEqual([]);
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
  // `readWorkspaceId` carries the same "could not read a workspace id" refusal and RETURNS a
  // `string` — the inline version this replaces left the id `string | undefined`, which typechecks
  // through a template literal and fails the moment it is passed to a typed function. Found by the
  // gate, not by reading. It does not navigate, so the caller is already on `/workspaces`.
  const workspaceId = await readWorkspaceId(page);

  /**
   * The board's id comes from the page, for the same reason the workspace's
   * does: the seed's ULIDs are not stable across a reseed, and a hardcoded id
   * fails as a 404 — which renders no board, sweeps a nearly empty document,
   * finds no offenders, and reports the best possible result. A missing board
   * must be a LOUD failure here, never a quiet green.
   */
  /**
   * The project links were on `/workspaces` — the SAME page the workspace id
   * came from — until Round 19c moved them.
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
   * probes that fail if the page did not actually render its controls.
   *
   * **MOVED AGAIN, same day (Round 19c, owner: "the entire workspace card
   * should be clickable ... everything else on the card should just be info,
   * nothing clickable")**: the workspace card on `/workspaces` is now one
   * `<Link>` to `/w/<id>` and nothing else inside it is a link, so
   * `app/workspaces/page.tsx` no longer renders a `/w/<id>/p/<projectId>` href
   * at all. `app/w/[workspaceId]/page.tsx` still renders exactly that shape,
   * one per LIVE project ("Open board", `app/w/[workspaceId]/page.tsx:377`),
   * so the read moved one hop later — through the door this test already
   * followed to get `workspaceId` — rather than disappearing. NOT re-run
   * against the real stack after this edit: e2e-stack needs the owner's own
   * `:3001`, which was not taken over for this change (see the accessible-
   * names ratchet note a few hundred lines below for the same caveat on the
   * same day's edits).
   */
  /*
   * ⚠ `BY NAME, NOT BY POSITION` — the second half of the same defect.
   *
   * These two lines were `.first()` on the project links, which is a fact about the DATABASE rather
   * than about the product: on `/w/<id>` the first link is whichever project sorts first. The live
   * dev database holds a second project (`gggg`, created through the real web UI 2026-09-10, 1
   * ticket, 3 columns) and it sorts ahead of the seeded `Shop operations` (26 tickets, 8 columns).
   * MEASURED on the live stack with this suite's own `sweepAccessibleNames`:
   * `gggg` reads `{ariaLabel: 9, role: 9}`, `Shop operations` reads `{ariaLabel: 65, role: 14}` — and
   * the recorded baseline is `{ariaLabel: 66, role: 14}`, matching `Shop operations` on `role`
   * exactly. **So `/p/:projectId` was measured on the wrong board**, and the ratchet reported it as
   * `LOST ariaLabel: baseline 66, now 9` — a catastrophic-sounding accessibility regression that was
   * nothing of the kind.
   *
   * ⚠ **HOW FAR BACK, corrected under challenge.** This comment first said "since 2026-09-10" and
   * that was too wide. `gggg`'s own event log records `project.archived` at 2026-09-16 04:27:47 and
   * `project.restored` at 2026-09-19 18:40:20, and `/w/<id>` renders live projects only by default —
   * so `gggg` was out of the DOM across 2026-09-18, when the `66`/`role 14` baseline was recorded.
   * **The baseline was legitimately taken on `Shop operations`**, and the `role` match corroborates
   * rather than proves it. The wrong-board window starts at the 2026-09-19 restore; the creation
   * date is not a window.
   *
   * `helpers/board.ts` names the project and REFUSES to fall back to a neighbour, so a missing seed
   * fails loudly instead of silently measuring a different board.
   */
  const projectHref = await seededProjectHref(page, workspaceId);

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
   * nav, a more-actions control named for its project, and the archived disclosure
   * named for its workspace.
   */
  const MUST_NAME: Record<string, Array<{ role: 'navigation' | 'button' | 'link'; name: RegExp }>> = {
    'stack-phone-390|/w/:workspaceId': [
      { role: 'navigation', name: /^Workspace sections$/ },
      { role: 'button', name: /^More actions for / },
      { role: 'link', name: /^Ticket types$/ },
    ],
  };

  /**
   * P34 (2026-09-21) — THE VIEWS ARE TABS, SO A ROUTE LIST CANNOT REACH THEM.
   *
   * The project page renders FIVE views — Backlog, Board, List, Calendar,
   * Timeline — as `role="tab"` buttons that switch component state and leave the
   * route unchanged (`page.tsx`: `role="tab"`, `aria-selected={selected}`,
   * `onClick={() => setView(tab)}`). This suite's population was a list of
   * ROUTES and it visited `/p/:projectId` ONCE, so it rendered the default view
   * — `board`, stated twice in the page's own docblocks — and the other four
   * were measured by nothing at all.
   *
   * The mechanism was already here and already typed: the route objects carry
   * `reach?: () => Promise<void>`, so this is one property per view rather than a
   * new instrument. The alternative — making the four views routes — is larger
   * and would change the product to suit its test.
   *
   * ⚠ **THE REACH PROVES ITSELF OR IT IS WORSE THAN NOTHING.** A `reach` that
   * clicks and misses leaves the default board rendered, and then every number
   * the loop prints for that entry is a board measurement wearing the view's
   * label — the failure this file's own `innerWidth` re-read exists to prevent
   * one level up. So the tab is clicked and its `aria-selected` is read back
   * before any sweep runs.
   */
  const openView = async (label: string): Promise<void> => {
    const tab = page.getByRole('tab', { name: label, exact: true });
    await tab.click();
    await expect(
      tab,
      `clicking the "${label}" view tab did not select it, so every number below would be a ` +
        `measurement of whatever view was already rendered, wearing "${label}"'s name.`,
    ).toHaveAttribute('aria-selected', 'true');
  };

  /** A reach must do its own navigation — the loop skips `page.goto` when one exists. */
  const reachView =
    (label: string | null) =>
    async (): Promise<void> => {
      await page.goto(projectHref, { waitUntil: 'networkidle' });
      if (label !== null) await openView(label);
    };

  /**
   * The List view, AND the `Select` panel open — the other half of P11.
   *
   * `Select` portals its panel to `document.body` and renders it only while
   * open, so a closed-page sweep sees none of its option rows; the selector now
   * carries `[role="option"]`/`[role="listbox"]` (P11) but an arm nobody renders
   * is still nothing. The List view is the one swept view carrying a `Select` on
   * the page itself, so this is where the two findings meet.
   *
   * ⚠ THE PANEL IS OPENED ONLY IF THE TRIGGER IS ENABLED, AND SAID OUT LOUD WHEN
   * IT IS NOT. The grouping control is `disabled={!prefsEditable}`, and this
   * suite cannot be run from the worktree that wrote this (the only stack
   * listening on `:3001` belongs to another checkout). So an enabled trigger must
   * produce a visible listbox — an assertion, not a hope — and a DISABLED one is
   * reported: a stated blind spot is worth more than a silent zero, and much more
   * than a reach that quietly measures the closed page.
   */
  const reachListWithSelectOpen = async (): Promise<void> => {
    await page.goto(projectHref, { waitUntil: 'networkidle' });
    await openView('List');
    const trigger = page.locator('.gn-select__trigger').first();
    if (!(await trigger.isEnabled())) {
      /* eslint-disable-next-line no-console */
      console.log(
        `[stack-phone-390] /p/:projectId#list — the grouping Select is DISABLED here, so its ` +
          `portalled panel was not opened and its option rows are in this route's population on ` +
          `NO account. Stated, not silently absent.`,
      );
      return;
    }
    await trigger.click();
    await expect(
      page.locator('[role="listbox"]').first(),
      `the grouping Select's trigger was clicked and no [role="listbox"] appeared. If the trigger ` +
        `moved, fix the locator HERE rather than deleting this reach: the panel renders only while ` +
        `open, so without it every option row is outside every sweep's population (P11).`,
    ).toBeVisible();
  };

  const routes: { path: string; key: string; reach?: () => Promise<void> }[] = [
    { path: `/w/${workspaceId}/my-work`, key: 'stack-phone-390|/my-work' },
    { path: projectHref, key: 'stack-phone-390|/p/:projectId' },
    /* P34: the four views that are NOT the default. Keys carry the view name so
       each one's numbers are its own — the same reason the tap-target and
       type-scale baselines key on the route. */
    {
      path: projectHref,
      key: 'stack-phone-390|/p/:projectId#backlog',
      reach: reachView('Backlog'),
    },
    {
      path: projectHref,
      key: 'stack-phone-390|/p/:projectId#list',
      reach: reachListWithSelectOpen,
    },
    {
      path: projectHref,
      key: 'stack-phone-390|/p/:projectId#calendar',
      reach: reachView('Calendar'),
    },
    {
      path: projectHref,
      key: 'stack-phone-390|/p/:projectId#timeline',
      reach: reachView('Timeline'),
    },
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
       "More actions" button belongs to. Its `MUST_NAME` probes are what give this
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
    //
    // 13.399 (Round 19b, 2026-09-09): the workspace card door, the five
    // door-card notes and the contextual nav each add `aria-label`/
    // `aria-describedby` attributes that were not there before — a RISE on
    // `ariaLabel`/`ariaDescribedby` for `/workspaces` and `/w/<workspaceId>`,
    // never a fall, so this ratchet (a floor, not an exact match) passed with
    // no baseline file touched. **A real regression was caught by the
    // MUST_NAME loop above, not by this ratchet**: the door-card notes'
    // first draft let each note join its link's accessible name by ordinary
    // content concatenation, so `/w/<workspaceId>`'s own `Ticket types` probe
    // (13.389's literal, `MUST_NAME`) stopped matching — the widened name no
    // longer equalled the exact string the probe names. Fixed with
    // `aria-label` pinning each door's name to its label and
    // `aria-describedby` linking the note as a description instead; this
    // route's baseline stayed exact and green on re-measure.
    //
    // 2026-09-09 (owner request): `StyleToggle` moved OFF `AppNav` onto
    // `/account`, and changed from `SegmentedControl` to a `<select>`. This is
    // a genuine FALL, the one direction this ratchet cannot absorb by itself:
    // every route below lost `SegmentedControl`'s `role="tablist"` + three
    // `role="tab"` (role -4), its `aria-label="Style"` (ariaLabel -1), and the
    // three tabs' `aria-selected` (ariaSelected -3) — confirmed from the
    // baseline file itself before this edit, since `ariaSelected` read exactly
    // `3` on every recorded route except `/p/:projectId` (`7` — the extra 4
    // are `.gn-view-tabs`' own Board/List/Calendar/Timeline tabs, unaffected).
    //
    // ALL SEVEN recorded keys are affected (13.342's own comment above names
    // every one of them as StyleToggle's contribution), so rather than guess
    // seven new numbers by hand — which is exactly the failure this file's
    // `recordAccessibleBaseline` refuses to allow ("writes ABSENT keys only")
    // — `e2e-stack/accessible-names-baseline.json` was reset to `{}`. Every
    // key is deleted, not lowered: the ratchet records-but-does-not-assert on
    // its next run (the `undefined` branch below) instead of asserting stale
    // numbers against a page that no longer matches them.
    //
    // **This is not a free pass — name what still has teeth.** Only
    // `stack-phone-390|/w/:workspaceId` keeps a real assertion through the
    // gap, via its `MUST_NAME` entry above. The other six
    // (`/my-work`, `/p/:projectId`, `/members`, `/settings/ticket-types`,
    // `/settings/workflows`, `/workspaces`) have no `MUST_NAME` probes and are
    // NAKED until re-recorded — a real regression on any of them would pass
    // silently. Owner: whoever next has a stack window should run this spec
    // once with `UPDATE_ACCESSIBLE_BASELINE=1` to write fresh values, THEN
    // re-run without it to prove the fresh baseline actually asserts (an
    // unread write is indistinguishable from a ratchet that still does
    // nothing). Also recorded in `Features.md`'s accessible-name-ratchet
    // bullet, because a gap that lives only in a spec comment is a gap nobody
    // reviews (this file's own `/invite/<token>` precedent, 2026-09-08).
    //
    // 2026-09-14 (Phase 2 Wave A): `StyleToggle` changed identity a third
    // time, native `<select>` -> the shared `Select` component from
    // `@gisik-nokma/ui` (same component `members/page.tsx`'s Channel/Role
    // fields now use). The trigger's role changes from `combobox`/native-
    // select semantics to `button` (confirmed against `Select`'s own
    // `select.test.tsx`, e.g. `screen.getByRole('button', { name: /Fruit/ })`);
    // clicking it opens a portal-rendered `listbox` with 3 `option` role
    // elements, matching `Select`'s shape at every other migrated site. In
    // this route sweep's default (closed) DOM, no `aria-selected` triad
    // exists the way `SegmentedControl`'s three `role="tab"` siblings always
    // did — the listbox and its options render only while open, portaled to
    // `document.body`, so a closed-page sweep sees none of them; selection is
    // conveyed instead by a checkmark plus the trigger's own visible label
    // text. No live assertion in this file depended on the old `role=combobox`
    // shape: the ratchet loop below only asserts `RATCHETED` attributes when
    // `accessibleBaseline` is defined for a route, and every key was already
    // deleted to `{}` above (2026-09-09 entry) — confirmed via `grep -n
    // "combobox"` returning no matches anywhere in this file. This paragraph
    // is therefore purely historical documentation, same as the one above it,
    // with nothing live to update.
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
          // P10 (2026-09-21). The old message ended "Something that identified an
          // element to assistive tech is gone.", which claims a PROPERTY OF
          // ASSISTIVE TECH from a count of an ATTRIBUTE. `sweepAccessibleNames`
          // counts `el.hasAttribute(attr)` — nothing more — so an `aria-label`
          // that left an element and was replaced by visible text elsewhere
          // reddens this exactly as a genuine loss does, and the sentence named
          // the first as the second. What the number measures is stated instead,
          // because a count read as a property is how a real loss gets argued
          // away by someone who knows the label is still announced.
          `13.287: ${route.path} LOST ${attr}: baseline ${accessibleBaseline[attr]}, now ` +
            `${names[attr]}. An \`${attr}\` ATTRIBUTE left the document — that is all this ` +
            `measured, and whether it still named anything is not what it measured. ` +
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

    /* ── E4-12 (2026-09-21) — THE TAP-TARGET RATCHET, PER ROUTE. ──
     *
     * The finding was not that the ratchet was wrong; it was that its POPULATION
     * was one route at one width. `measureTapTargets` was called once in this
     * file — in the `/my-work` test above — so every number it printed was about
     * `/my-work`, while the report it was read against measured the board, the
     * sheet and the settings screens. This measures every route in the list
     * above, one line each, which is the shape the type-scale ratchet already
     * had.
     *
     * The `/my-work` test above keeps its own call and its floor-split log; the
     * KEY is shared, so the two cannot disagree about the ratchet, and the floor
     * still lives only in `e2e-viewport/tap-targets.ts`.
     *
     * **NOT RUN IN THE ENVIRONMENT THIS LANDED IN, and the consequence is named
     * rather than left for the next reader.** Six of the seven keys below are
     * new, a missing key FAILS by this file's own doctrine, and no stack was
     * available to seed them — the only one listening on 3001 belonged to
     * another checkout, and a measurement taken there is a measurement of a tree
     * this branch is not. So a first run stops on the first new key and prints
     * the re-record instruction. **That is a run required, not a number
     * invented**: a baseline written from a tree nobody measured is the failure
     * `recordTapBaseline` exists to refuse.
     * ────────────────────────────────────────────────────────────────────*/
    const taps = await measureTapTargets(page);
    const smallestTap = taps.smallestExamined;
    /* eslint-disable no-console */
    console.log(
      `[stack-phone-390] ${route.path} — tap targets: selector matched ${taps.rawMatches}, ` +
        `examined ${taps.examined.length}, inline-in-prose exempt ${taps.inlineExempt.length}, ` +
        `invisible skipped ${taps.invisibleSkipped}, smallest examined = ` +
        `${smallestTap === null ? 'n/a' : `${smallestTap.w}x${smallestTap.h} (${smallestTap.selector})`}, ` +
        `offenders=${taps.offenders.length}`,
    );
    /* eslint-enable no-console */

    // The anti-broken-selector control BEFORE the ratchet, per route: `examined`
    // may legitimately be small, but a zero match on a rendered signed-in page
    // can only mean the selector stopped matching — and a sweep that matched
    // nothing reports the best possible number.
    expect(
      taps.rawMatches,
      `the tap-target selector matched NOTHING on ${route.path}. A rendered signed-in page ` +
        `carries a nav and a search box at minimum, so a 0 here is about the instrument.`,
    ).toBeGreaterThan(5);
    // The stale-entry guard per route: a container that rendered while its
    // control did not means the entry has stopped classifying anything, and the
    // control it names is judged against the 44px floor again.
    expect
      .soft(
        taps.brokenEntries,
        `${route.path}: a DENSE_IN_LIST entry's container rendered but its control selector ` +
          `matched nothing inside it. Fix the selector in e2e-viewport/tap-targets.ts, or remove ` +
          `the entry.`,
      )
      .toEqual([]);

    const tapBaseline = readTapBaseline(STACK_TAP_BASELINE);
    const allowedTaps = tapBaseline[route.key];
    if (allowedTaps === undefined) {
      if (process.env['UPDATE_TAP_BASELINE'] === '1') {
        recordTapBaseline(route.key, taps.offenders.length, STACK_TAP_BASELINE);
      } else {
        expect(
          allowedTaps,
          `no tap-target baseline for "${route.key}" in e2e-stack/tap-target-baseline.json, and ` +
            `this suite refuses to invent one. Observed ${taps.offenders.length} offenders. ` +
            `Re-run once with UPDATE_TAP_BASELINE=1 and COMMIT the file.`,
        ).toBeDefined();
      }
    } else {
      expect
        .soft(
          taps.offenders.length,
          `interactive targets below their own floor on ${route.path} rose above the recorded ` +
            `${allowedTaps} for ${route.key}: ${JSON.stringify(taps.offenders.slice(0, 8))}. The ` +
            `floor is 24px for a control DENSE_IN_LIST classifies as in-list (WCAG 2.5.8) and ` +
            `44px for every other control (WCAG 2.5.5); each offender carries the floor it missed.`,
        )
        .toBeLessThanOrEqual(allowedTaps);
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
/**
 * The planted positive control's class. No product code uses it, so a reading
 * under this signature can only be this fixture — which is the point: a control
 * that depends on the product happening to contain a high-contrast border is a
 * control that the next styling change can delete. It did exactly that on
 * 2026-09-18; see the assertion site for the whole story.
 */
const PLANTED_CONTROL_SELECTOR = 'non-text-contrast-control';

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
      return { borderStyle: computed.borderStyle, borderColor: computed.borderColor, boxShadow: computed.boxShadow };
    });
    // AMENDED 2026-10-02 (N10, case 24.040; earlier UX fixes T1, owner U5, 23.002, 13.339): the neo field wears NO uniform ring. Its
    // border is 1px `solid` but TRANSPARENT (the box keeps its size), and its boundary is the line layer of `--gn-shadow-field`: a crisp
    // 1px edge >= 3:1 on one side, computed from the token in `neo-refresh.test.ts` (24.044) and read here from the rendered route.
    // This suite is light-theme-only, so the line is the light one (#897362); the dark one (#7d88a8) is pinned by 24.044/24.005.
    expect(
      style.borderStyle,
      `13.356: .gn-field__input on ${routeLabel} has no 1px border box (${style.borderStyle}) — the transparent border that keeps ` +
        `the neo field's size (N10, 24.040) no longer holds.`,
    ).toBe('solid');
    expect(
      style.borderColor,
      `13.356: .gn-field__input on ${routeLabel} paints a ring (${style.borderColor}) — N10 (24.040) retired it.`,
    ).toBe('rgba(0, 0, 0, 0)');
    expect(
      style.boxShadow,
      `13.356: .gn-field__input on ${routeLabel} has no field line layer in its box-shadow (${style.boxShadow}) — there is no ` +
        `boundary at all here, which is worse than the soft edge the roster discloses.`,
    ).toContain('rgb(137, 115, 98)');
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

  // `readWorkspaceId` carries the same "could not read a workspace id" refusal and RETURNS a
  // `string` — the inline version this replaces left the id `string | undefined`, which typechecks
  // through a template literal and fails the moment it is passed to a typed function. Found by the
  // gate, not by reading. It does not navigate, so the caller is already on `/workspaces`.
  const workspaceId = await readWorkspaceId(page);

  // Round 19c moved the project links off `/workspaces` (its card is now one
  // door-link and nothing else) onto `/w/<id>`'s own "Open board" rows — see
  // the longer version of this note on the accessible-name sweep above.
  //
  // By NAME, not by position — see the longer note on the accessible-name sweep above (including the
  // corrected window: the wrong-board period starts at `gggg`'s 2026-09-19 restore, not its
  // 2026-09-10 creation). `.first()` here swept `gggg` rather than the seeded board, so
  // `/p/:projectId`'s contrast roster entry was a measurement of the wrong page.
  // `seededProjectHref` navigates to `/w/<id>` itself.
  const projectHref = await seededProjectHref(page, workspaceId);

  const routes = [
    { path: `/w/${workspaceId}/my-work`, key: '/my-work' },
    { path: projectHref, key: '/p/:projectId' },
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
      // UPDATED 2026-09-18 (Step 2c-1, T5): `neoPaper` moved `#ede4db` ->
      // `#f1eae3`, and this shadow-edge ratio is measured against that surface,
      // so it moved with it — `docs/neo-token-report.md`'s Rule (a) row for
      // neo/light reads 1.24 -> 1.18 on the regenerated run. Cited rather than
      // re-measured HERE for the reason the dark figure below already gives:
      // this suite is light-theme-only and its own DOM check is what confirms
      // the value when it runs.
      ratioLight: 1.18,
      // UPDATED 2026-09-10: `neoNavySunken` was reverted to `neoNavy` itself
      // (owner: "revert to prototype's exact dark hex"), so `surface` and
      // `surfaceSunken` are now the IDENTICAL hex in neo/dark — the field's
      // boundary is 100% the shadow, zero colour delta, which is exactly
      // 1.00 by definition rather than Task 13's pre-revert 1.16. Not
      // re-measured by this suite either (still light-theme-only, per the
      // docblock above) — this is the arithmetic consequence of the token
      // change, cited the same way 1.16 was.
      ratioDark: 1.0,
      border: 'none — sunken box-shadow only, not compositable by this instrument',
      backdrop: 'surface (neo)',
      routes: ['/sign-in', '/workspaces'],
      citation:
        'SUPERSEDED 2026-10-02 (UX fixes T1, owner U5; then N10, case 24.040): the neo text field no longer relies on a ' +
        'sunken inset alone — its boundary = the `--gn-shadow-field` line layer (N10, 24.040), 3.31 light / 4.86 dark, ' +
        'computed in `neo-refresh.test.ts`, so this waiver no longer applies to it; kept as the record. ' +
        'Owner ruling 2026-09-09 (Task 14 AMENDMENT rule (a)): the empty input takes the pure neo ' +
        'look (sunken, no border) even below 3:1. Originally measured by Task 13 (docs/neo-token-report.md) ' +
        'at 1.16 dark, against the since-reverted neoNavySunken (#3b425b); quoted in ' +
        'packages/ui/src/ui.css\'s [data-style="neo"] .gn-field__input docblock and case 13.339. ' +
        'Light confirmed by this run\'s own DOM check; dark is arithmetic (surface === surfaceSunken ' +
        'post-revert, tokens.ts\'s neoNavySunken, still neoNavy), not re-measured.',
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
  /*
   * PROVENANCE (round-2 finding I2). **The file is a MEASUREMENT, and that is
   * exactly why it needs to say WHICH measurement.** It recorded
   * `"belowCount": 1` with `button.ticket-type-list__move` at 1.41:1 for four
   * days after that class was fixed in `981aa92b`, and nothing in the twenty
   * keys it carried said which run had produced it — an unattributed number in
   * a committed file reads as a fact about the tree, and was a fact about a
   * tree four commits old. The stamp costs three lines and it is what turns
   * the file from a claim into a record.
   *
   * `git` is called through a TRY, and a failure records `null` rather than
   * throwing: a sweep that dies because the runner has no git binary would
   * lose the measurement it had already taken, which is a worse trade than an
   * honest "I do not know which tree this was".
   */
  const repoRoot = fileURLToPath(new URL('../../..', import.meta.url));
  const gitOrNull = (args: string): string | null => {
    try {
      return execFileSync('git', args.split(' '), { cwd: repoRoot, encoding: 'utf8' }).trim();
    } catch {
      return null;
    }
  };
  const headSha = gitOrNull('rev-parse HEAD');
  const treeWasClean = (gitOrNull('status --porcelain') ?? '') === '';
  writeFileSync(
    new URL('./non-text-contrast-roster.json', import.meta.url),
    `${JSON.stringify(
      {
        headSha,
        producedAt: new Date().toISOString(),
        treeWasClean,
        provenance:
          'Every number below describes the tree at `headSha`, at `producedAt` — no other. ' +
          'A later commit SUPERSEDES any entry whose class it styles, fixes or deletes, and ' +
          'nothing here re-checks that: the file is regenerated only by a run of this sweep. ' +
          'So read an entry as a measurement, never as a claim about the tree you are standing in. ' +
          '`treeWasClean: false` means an uncommitted edit was in the tree the run measured, and ' +
          '`headSha` then names its BASE rather than what was actually swept.',
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

  /*
   * ## 13.921 — THE FIXTURE COMES FIRST, because BOTH controls stand on it
   *
   * Two controls run through `sweepBorders` below, and **the plant sits ahead
   * of both**. That ordering is the repair, not tidiness: *a control that runs
   * before the fixture it needs is not a control.* This was found by RUNNING
   * the suite, not by reading it — the first version of this fix planted
   * between the two controls, and the negative one went red.
   *
   * The element is a fixed, known **21:1** — black on an opaque white ground —
   * which is BELOW the negative control's 25, so **one fixture satisfies
   * both**: the positive control reads it, and the negative control counts it
   * as an offender. Neither threshold is lowered and neither control is
   * deleted.
   *
   * ## The positive control stopped resting on the product
   *
   * It read `expect(bestSeen).toBeGreaterThan(15)` and passed for a reason
   * unrelated to the property it named: both readings above 15 (17.62, twice)
   * were `rgba(0,0,0,1)` — the UA's default border on two BARE `<button>`s on
   * `/settings/workflows`. It was resting on an unstyled button, and putting
   * those buttons on `.gn-button` (`border: none`) removed both readings.
   *
   * ## So did the negative control — which is what the suite caught
   *
   * It sweeps the page the route loop ENDS on, `/settings/workflows`, and
   * after that same change **that page has no painted borders at all** — its
   * two `rgba(0,0,0,1)` entries are gone, the sweep's `examined` drops with
   * them, and `absurd.below.length` was `0`. It failed for exactly the reason
   * the positive one had. **Both controls now stand on the fixture**, which
   * depends on no product element, so no styling change can take it away —
   * neither this one nor `aside.gn-attention`'s border leaving in the same
   * week.
   *
   * `bestSeen` remains the PRODUCT's own maximum and is still recorded as the
   * roster's `highestReading`; it is simply no longer load-bearing for a
   * threshold it can never durably hold.
   */
  await page.evaluate((className) => {
    const ground = document.createElement('div');
    ground.setAttribute('data-planted-control', '');
    /* The element's OWN background is never what `backdropOf` reads — it walks
       to the PARENT — so the white ground has to be a real ancestor. Painting
       the control itself white would leave the ratio at the mercy of whatever
       the page's body happens to be painted that day. Off-screen and fixed: a
       non-zero rect is all the sweep requires. */
    ground.style.cssText =
      'position:fixed;left:-9999px;top:0;width:32px;height:32px;background:rgb(255,255,255)';
    const control = document.createElement('div');
    control.className = className;
    control.style.cssText =
      'width:100%;height:100%;box-sizing:border-box;border:4px solid rgb(0,0,0)';
    ground.appendChild(control);
    document.body.appendChild(ground);
  }, PLANTED_CONTROL_SELECTOR);

  // The NEGATIVE control, through the SAME path as the measurement: at a
  // threshold nothing could clear, the instrument must find offenders. The
  // planted 21:1 is an offender at 25 — which is what makes the fixture,
  // rather than the product, the thing this control rests on.
  const absurd = await sweepBorders(page, 25);
  expect(
    absurd.below.length,
    'the sweep reported no offenders even at 25:1 — it is not measuring, and its ' +
      'zero above means nothing',
  ).toBeGreaterThan(0);
  /* Printed rather than only asserted: a control whose RESULT is invisible in
     the log cannot be audited by whoever reads the run, and the run is the only
     place this defect was ever going to show up. */
  console.log(
    `[non-text-contrast] NEGATIVE control: sweepBorders(page, 25) found ` +
      `${absurd.below.length} offender(s) — ${
        absurd.below.map((r) => `${r.selector} ${r.ratio.toFixed(2)}`).join(', ') || 'NONE, which fails'
      }`,
  );

  // The POSITIVE control, through the same path: the instrument must read the
  // planted element at the ratio it was built to have.
  const plantedSweep = await sweepBorders(page);
  const planted = plantedSweep.readings.find(
    (r) => r.selector === `div.${PLANTED_CONTROL_SELECTOR}`,
  );
  expect(
    planted,
    'the planted control was not read at all — the sweep did not traverse it, so its ' +
      'silence about the product means nothing either',
  ).toBeDefined();
  expect(
    planted!.ratio,
    'the sweep no longer reads a known 21:1 border, so it cannot tell red from green in ' +
      'the ordinary range',
  ).toBeGreaterThan(15);
  /* The tighter half: not merely "high" but the number it must BE. Black on
     opaque white is 21.0 to the decimal, so a compositing regression that
     halved the reading would still clear 15 and fail here — which is the
     direction a loose threshold cannot see. */
  expect(planted!.ratio).toBeCloseTo(21, 1);
  console.log(
    `[non-text-contrast] POSITIVE control: the planted element read ` +
      `${planted!.ratio.toFixed(2)}:1 (border ${planted!.border} on ${planted!.backdrop}) ` +
      `through the same sweepBorders path — while the product's own maximum was ` +
      `${bestSeen.toFixed(2)}.`,
  );

  await page.evaluate(() => {
    document.querySelector('[data-planted-control]')?.remove();
  });
});
