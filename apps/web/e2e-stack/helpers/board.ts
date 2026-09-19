import type { Page } from '@playwright/test';

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
 * DATABASE, not about the product. The live dev database has held a second project since
 * 2026-09-10 (`gggg`, created through the real web UI), and it sorts ahead of the seeded
 * `Shop operations`. **So every `/p/:projectId` measurement since has been taken on the wrong
 * board**: the accessible-name ratchet's recorded `66` belongs to `Shop operations` (26 tickets,
 * 8 columns) and the run was reading `gggg` (1 ticket, 3 columns) — reported as
 * `LOST ariaLabel: baseline 66, now 9` and read as a catastrophic accessibility regression.
 *
 * Both halves have one repair: name the project, and reach it through the doors the product
 * actually has.
 */

/**
 * The seeded project's name. `seed-convenience-corner.ts` emits exactly one `project.created`
 * (`cc#project#shop-operations`), named `Shop operations` — the name the board the parity work,
 * the smoke and the visibility specs all describe.
 */
export const SEEDED_PROJECT_NAME = 'Shop operations';

/** Every project link on `/w/<id>`, in DOM order. */
function projectLinks(page: Page, workspaceId: string) {
  return page.locator(`a[href^="/w/${workspaceId}/p/"]`);
}

/** The workspace id, read off the door link on `/workspaces`. */
export async function readWorkspaceId(page: Page): Promise<string> {
  const link = page.locator('a[href^="/w/"]').first();
  await link.waitFor({ timeout: 15_000 });
  const href = await link.getAttribute('href');
  const id = /^\/w\/([^/]+)/.exec(href ?? '')?.[1];
  if (id === undefined) {
    throw new Error(`could not read a workspace id out of ${String(href)} — is the session signed in?`);
  }
  return id;
}

/**
 * The seeded project's href, found by NAME.
 *
 * A positional pick is not a project: `/w/<id>` orders its projects by the served list, so
 * `.first()` silently follows whatever the database accumulated. This locator instead names the
 * one project the seed creates, and **fails loudly when it is absent** rather than falling back to
 * a neighbour — a fallback would make every downstream measurement a number about some other
 * board while reading as the seeded one.
 */
export async function seededProjectHref(page: Page, workspaceId: string): Promise<string> {
  await page.goto(`/w/${workspaceId}`, { waitUntil: 'networkidle' });
  const link = projectLinks(page, workspaceId).filter({ hasText: SEEDED_PROJECT_NAME }).first();
  try {
    await link.waitFor({ timeout: 15_000 });
  } catch {
    const seen = await projectLinks(page, workspaceId).allTextContents();
    throw new Error(
      `no project link named "${SEEDED_PROJECT_NAME}" on /w/${workspaceId}. Projects rendered: ` +
        `${JSON.stringify(seen)}. The seed creates exactly one project by that name, so its absence ` +
        `means the seed, the session or the workspace is wrong — not that a measurement should fall ` +
        `back to a different board.`,
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

  const link = projectLinks(page, workspaceId).filter({ hasText: SEEDED_PROJECT_NAME }).first();
  try {
    await link.waitFor({ timeout: 15_000 });
  } catch {
    const seen = await projectLinks(page, workspaceId).allTextContents();
    throw new Error(
      `reached /w/${workspaceId} but found no project link named "${SEEDED_PROJECT_NAME}". ` +
        `Projects rendered: ${JSON.stringify(seen)}.`,
    );
  }
  await link.click();
  // WAIT for the route, do not SAMPLE it. The card door is a Next `<Link>`, so the navigation is a
  // `history.pushState` rather than a document load — `click()` can resolve before the URL moves,
  // and reading `page.url()` on the next line then reports the page the click was made FROM. That
  // is not hypothetical: it is how the first version of this helper failed, reporting that the
  // `Shop operations` link "left the browser at /w/<id>", which reads exactly like the link being
  // dead. A no-argument wait on the URL was the fix; the assertion is on the pattern, so a link
  // that really is dead still fails — after 15 s, with the URL it stayed on.
  try {
    await page.waitForURL(/\/p\/[^/?]+/, { timeout: 15_000 });
  } catch {
    throw new Error(
      `clicking the "${SEEDED_PROJECT_NAME}" link left the browser at ${new URL(page.url()).pathname}, ` +
        `not a board. The link's href is ${String(await link.getAttribute('href'))}.`,
    );
  }
  const path = new URL(page.url()).pathname;
  const projectId = /\/p\/([^/]+)/.exec(path)?.[1] ?? '';
  if (projectId === '') {
    throw new Error(`clicking the "${SEEDED_PROJECT_NAME}" link left the browser at ${path}, not a board`);
  }
  return { workspaceId, projectId };
}
