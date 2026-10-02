import { expect, type Page } from '@playwright/test';

/**
 * How you reach the seeded board — ONE definition, because three specs need it.
 *
 * ## Why this file exists, and it is not tidiness
 *
 * On 2026-09-20 `smoke.spec.ts` still read `page.getByText('Shop operations').click()` on
 * `/workspaces`, on the stated belief — written into its own comment — that "the project link is
 * already on /workspaces, and clicking THAT is what navigates". Round 19c (owner: *"the entire
 * workspace card should be clickable … everything else on the card should just be info, nothing
 * clickable"*) had made that false: the whole card is now ONE `<Link>` to `/w/<id>`, the project
 * names are plain TEXT inside it, and a text click therefore lands on the WORKSPACE, not the board.
 *
 * MEASURED on the live stack, not inferred: the text node's `closest('a')` is
 * `/w/0TZSS5W6ATCTF2YBPMWGGP9JF5`, and the page after the click renders `heading "Rename Convenience
 * Corner"` — the workspace home. The spec then waited 20 s for a `board-column-*` that its own
 * navigation had made impossible, and reported the result as a broken board.
 *
 * ## The other half: `.first()` is not a project, it is a POSITION
 *
 * `viewport.spec.ts` had already learned that Round 19c moved the project links onto `/w/<id>`, and
 * read its project href from there — with `.first()`. That is the same defect one step later: on
 * `/w/<id>` the first project link is whichever project sorts first, which is a fact about the
 * DATABASE, not about the product. The live dev database holds a second project — `gggg`, created
 * through the real web UI — and **it sorts ahead of the seeded `Shop operations` today** (measured
 * on the running stack). **So `/p/:projectId` was measured on the wrong board**: the accessible-name
 * ratchet's recorded `66`/`role 14` belongs to `Shop operations` (26 tickets, 8 columns) and the run
 * was reading `gggg` (1 ticket, 3 columns) — reported as `LOST ariaLabel: baseline 66, now 9` and
 * read as a catastrophic accessibility regression.
 *
 * ## ⚠ THE WINDOW, corrected — this file first said "since 2026-09-10" and that was too wide
 *
 * A reviewer challenged the history and the database settles it. `gggg`'s own event log
 * (`events`, `entity_id = 01M25DBPXAK3NC9YRVS95MB7J6`, read 2026-09-20):
 *
 * ```
 * project.created   2026-09-10 15:51:06   project.archived   2026-09-16 04:27:39
 * project.member_added 2026-09-10 15:51:06   project.restored   2026-09-16 04:27:43
 *                                           project.archived   2026-09-16 04:27:47
 *                                           project.restored   2026-09-19 18:40:20
 * ```
 *
 * `/w/<id>` renders LIVE projects only by default (`showArchived` starts `false`), so `gggg` was out
 * of the DOM from **2026-09-16 04:27:47 until 2026-09-19 18:40:20** — a window that CONTAINS
 * 2026-09-18, when the `66`/`role 14` baseline was recorded. **So the baseline was legitimately taken
 * on `Shop operations`**, and the `role` match is corroboration rather than the only evidence.
 *
 * **The wrong-board window therefore starts at the 2026-09-19 18:40:20 restore, not on 2026-09-10.**
 * What I can state from measurement is what holds TODAY (the running stack, `gggg` live and first);
 * I cannot re-measure a DOM that has gone. The creation date is not a window, and this note no longer
 * says it is.
 */

/**
 * The seeded workspace's name, and the seeded project's.
 *
 * `seed-convenience-corner.ts` emits exactly one `workspace.created` (`Convenience Corner`) and one
 * `project.created` (`Shop operations`). Both are named rather than positioned, for the reason above.
 */
export const SEEDED_WORKSPACE_NAME = 'Convenience Corner';
export const SEEDED_PROJECT_NAME = 'Shop operations';

/**
 * The seeded workspace's id, read off its own door link — BY NAME, not by position.
 *
 * A positional read here is the same defect one level up and a reviewer found it: `/workspaces`
 * lists workspaces in served order, so a workspace founded through the UI (a real `01M…` ULID, which
 * sorts ahead of the seed's `0TZSS5W6…`) would silently take over every spec, and the failure would
 * surface as "no project link named `Shop operations` … Projects rendered: []" — a correct red
 * naming the wrong cause.
 */
export async function readWorkspaceId(page: Page): Promise<string> {
  const door = page.getByRole('link', { name: SEEDED_WORKSPACE_NAME, exact: true });
  await expect(
    door,
    `expected exactly one workspace door link named "${SEEDED_WORKSPACE_NAME}" on /workspaces. ` +
      `More than one means the name is no longer a unique anchor; zero means the seed or the session ` +
      `is wrong. Rendered links: ${JSON.stringify(await page.locator('a[href^="/w/"]').allTextContents())}`,
  ).toHaveCount(1, { timeout: 15_000 });
  const href = await door.getAttribute('href');
  const id = /^\/w\/([^/]+)/.exec(href ?? '')?.[1];
  if (id === undefined) {
    throw new Error(`the "${SEEDED_WORKSPACE_NAME}" door carries no /w/<id> href (got ${String(href)})`);
  }
  return id;
}

/** Every project link on `/w/<id>`, in DOM order. */
function projectLinks(page: Page, workspaceId: string) {
  return page.locator(`a[href^="/w/${workspaceId}/p/"]`);
}

/**
 * The seeded project's href, found by its EXACT accessible name.
 *
 * ## Why `exact` and why a count, after a reviewer broke the first version
 *
 * The first version was `.filter({ hasText: SEEDED_PROJECT_NAME }).first()`. Two defects, and
 * together they are the same failure this file exists to remove:
 *
 * 1. **`hasText` is a case-insensitive SUBSTRING match.** Any sibling whose rendered text merely
 *    *contains* "Shop operations" satisfies it — and the premise of this whole repair is that the dev
 *    database accumulates projects through the web UI, so a second such project is one accumulation
 *    away rather than hypothetical.
 * 2. **`.first()` re-introduces the positional pick.** A loose match plus `.first()` is exactly
 *    "whichever the database put first", with a name-shaped alibi.
 *
 * The door carries `aria-label="Open <project name>"` (`app/w/[workspaceId]/page.tsx`, WS-03), so an EXACT
 * accessible-name match is available and is the identity, not a filter over it. `toHaveCount(1)`
 * makes ambiguity a loud red instead of a silent pick.
 *
 * It also REFUSES to fall back to a neighbour: a positional pick silently follows whatever the
 * database accumulated, which is how this defect stayed invisible.
 */
export async function seededProjectHref(page: Page, workspaceId: string): Promise<string> {
  await page.goto(`/w/${workspaceId}`, { waitUntil: 'networkidle' });
  const link = page.getByRole('link', { name: `Open ${SEEDED_PROJECT_NAME}`, exact: true });
  try {
    await expect(link).toHaveCount(1, { timeout: 15_000 });
  } catch {
    const seen = await projectLinks(page, workspaceId).allTextContents();
    throw new Error(
      `expected exactly one project link named "${SEEDED_PROJECT_NAME}" on /w/${workspaceId}. ` +
        `Projects rendered: ${JSON.stringify(seen)}. The seed creates exactly one project by that ` +
        `name, so its absence means the seed, the session or the workspace is wrong — not that a ` +
        `measurement should fall back to a different board.`,
    );
  }
  const href = await link.getAttribute('href');
  if (href === null) throw new Error(`the "${SEEDED_PROJECT_NAME}" link carries no href`);
  return href;
}

/**
 * Walk the real doors: `/workspaces` → the workspace card door → the seeded project.
 *
 * A CLICK path rather than a `goto`, deliberately: the card door is the navigation 13.173 names
 * ("navigates Convenience Corner -> Shop operations"), and replacing it with an href would
 * assert the destination while skipping the thing that was wrong.
 *
 * ## The reached URL is checked for IDENTITY, not for shape
 *
 * The first version waited on `/\/p\/[^/?]+/` — a pattern that says "some board", never "the board
 * the link pointed at". A click that landed on a DIFFERENT project would satisfy it and the
 * measurement would be of the wrong page while reading as the seeded one. The href is read BEFORE
 * the click now, so the same value serves the error message and the assertion; and reading it early
 * also removes a second round trip on a possibly-detached locator inside the `catch`.
 */
export async function openSeededBoard(
  page: Page,
): Promise<{ workspaceId: string; projectId: string }> {
  await page.goto('/workspaces', { waitUntil: 'networkidle' });
  const workspaceId = await readWorkspaceId(page);

  // The card is one link to the workspace home. This click is the step that used to be a text
  // click on a project name, and it went to the wrong page for as long as Round 19c had been in.
  await page.locator(`a[href^="/w/${workspaceId}"]`).first().click();
  await page.waitForURL(new RegExp(`/w/${workspaceId}(/|\\?|$)`), { timeout: 15_000 });

  const link = page.getByRole('link', { name: `Open ${SEEDED_PROJECT_NAME}`, exact: true });
  try {
    await expect(link).toHaveCount(1, { timeout: 15_000 });
  } catch {
    const seen = await projectLinks(page, workspaceId).allTextContents();
    throw new Error(
      `reached /w/${workspaceId} but found no single project link named "${SEEDED_PROJECT_NAME}". ` +
        `Projects rendered: ${JSON.stringify(seen)}.`,
    );
  }
  const href = await link.getAttribute('href');
  await link.click();
  // WAIT for the route, do not SAMPLE it: the card door is a Next `<Link>`, so the navigation is a
  // `history.pushState` and `click()` can resolve before the URL moves. Reading `page.url()` on the
  // next line reports the page the click was made FROM — found by running it.
  await page.waitForURL(/\/p\/[^/?]+/, { timeout: 15_000 }).catch(() => {
    throw new Error(
      `clicking the "${SEEDED_PROJECT_NAME}" link left the browser at ` +
        `${new URL(page.url()).pathname}, not a board. The link's href is ${String(href)}.`,
    );
  });

  // IDENTITY, not shape: the URL must be the href the link carried.
  const path = new URL(page.url()).pathname;
  if (href !== null && path !== href) {
    throw new Error(
      `clicking the "${SEEDED_PROJECT_NAME}" link reached ${path}, but that link points at ${href}. ` +
        `The click landed somewhere else, so every measurement downstream would be of another board.`,
    );
  }
  const projectId = /\/p\/([^/]+)/.exec(path)?.[1] ?? '';
  if (projectId === '') {
    throw new Error(`clicking the "${SEEDED_PROJECT_NAME}" link left the browser at ${path}, not a board`);
  }
  return { workspaceId, projectId };
}
