import { expect, test, type Page } from '@playwright/test';

/**
 * The Playwright smoke for the workflow builder: the real canvas, a real
 * drag-to-connect gesture, against a REAL running `apps/web` signed in with a
 * REAL session — not `apps/web/e2e/smoke.spec.ts`'s stubbed routes. That smoke
 * proves the shell renders against server shapes it names; this one proves the
 * one gesture no component test can reach, because `@xyflow/react` computes
 * handle positions from live DOM layout and jsdom (`packages/app-core`'s test
 * runner) never lays anything out.
 *
 * ## THIS SUITE IS COMPILED BY THE GATE BUT NEVER EXECUTED BY IT, AND IT SKIPS
 * BY DEFAULT WHEN A HUMAN RUNS IT — say both, precisely, not "not on the gate"
 *
 * `apps/web/package.json`'s `test` script is `vitest run`, and `vitest.config.ts`
 * collects `test/**` only, so `pnpm --filter @gisik-nokma/web test` (the script
 * `turbo run build test typecheck` invokes) never executes anything under
 * `e2e/` — MEASURED: 87 tests / 12 files before and after this file existed,
 * unchanged. But `apps/web/tsconfig.e2e.json` includes everything under `e2e/`, and
 * `typecheck` runs `tsc -p tsconfig.e2e.json --noEmit` right after the app
 * tsconfig — MEASURED: planting `const x: number = 'not a number';` in this
 * file turns that command red (TS2322), reverting turns it green again. So the
 * gate DOES compile this file on every run — a renamed export, a changed
 * Playwright API, a typo'd import all still get caught — it just never
 * executes a single `test()` in it. That is a real but partial backstop, and
 * conflating it with "not on the gate" would overclaim in the direction that
 * looks safer than it is.
 *
 * Execution runs under the separate `test:e2e` script only
 * (`pnpm --filter @gisik-nokma/web test:e2e`), which `.github/workflows/ci.yml`
 * does not call — its only two mentions of e2e are a comment naming a future
 * pipeline and one explicitly deferring it ("needs a deployable stack (Plans
 * 4/6) and Playwright infra"), and `turbo.json` defines no `e2e` task for
 * `turbo run` to reach either. So no `test()` here can fail CI or block a
 * merge. Wiring a CI job that runs it is **Plan 11 Task 14** ("CI pipeline and
 * release discipline"), verified at `docs/superpowers/plans/
 * 2026-08-20-11-deployment-dogfooding.md:3604` — that task's own
 * `.github/workflows/ci.yml` snippet already names the stage order "lint →
 * typecheck → unit → fixtures (shared, client/server) → dual-client harness →
 * E2E", so this spec's eventual CI wiring lands there, not here. (The
 * coordination doc's line 579 note — Plan 6's Playwright smoke "gains a
 * live-server variant when Plan 6b lands" — is about `smoke.spec.ts`'s stubbed
 * suite, not this one; it is not this spec's owner.)
 *
 * Independently of CI, every `test.describe` below gates on `configured`, so
 * `pnpm --filter @gisik-nokma/web test:e2e` with no env vars set — MEASURED —
 * prints the loud warning and reports all 3 cases skipped, 0 failed. A spec
 * that the gate only compiles and that skips itself without hand-configuration
 * is a check that cannot fail either way on its own — say so plainly rather
 * than let a green run imply coverage it does not have. It earns its keep only
 * when a person runs it deliberately against a seeded stack, which is the only
 * way to exercise a real pointer-drag connection at all.
 *
 * ## Why this spec builds ABSOLUTE urls instead of using `baseURL`
 *
 * `apps/web/playwright.config.ts` (Plan 6's, shared with `smoke.spec.ts`) hard
 * codes `baseURL: 'http://localhost:3001'` and a `webServer` block that starts
 * `pnpm dev` itself — correct for that spec's self-contained stubbed run, wrong
 * for this one, which the task brief requires pointed at "Plan 6's `apps/web`
 * running against a seeded server" (a real database, real auth, real
 * `apps/server`). Editing the shared config to read `E2E_BASE_URL` would also
 * repoint `smoke.spec.ts` and would still leave its `webServer` block trying to
 * boot a second local dev server underneath a real remote target when this
 * suite is the one running — a config concern belonging to whoever wires CI
 * for this suite (Plan 11 Task 14, see above), not a rewrite to attempt here.
 * So every `page.goto` below is built from `E2E_BASE_URL` directly and ignores
 * the config's `baseURL` entirely; `webServer` still runs when the whole `e2e/`
 * directory is invoked together, which is harmless (`reuseExistingServer` and,
 * when unconfigured, this suite's own tests skip before touching the network)
 * but is recorded here rather than silently relied on.
 */

const E2E_BASE_URL = process.env.E2E_BASE_URL;
const workspaceId = process.env.E2E_WORKSPACE_ID;
const adminState = process.env.E2E_ADMIN_STORAGE_STATE;
const memberState = process.env.E2E_MEMBER_STORAGE_STATE;

const configured = E2E_BASE_URL !== undefined && workspaceId !== undefined && adminState !== undefined;
if (!configured) {
  console.warn(
    'workflow-builder smoke skipped — set E2E_BASE_URL, E2E_WORKSPACE_ID, E2E_ADMIN_STORAGE_STATE ' +
      '(and optionally E2E_MEMBER_STORAGE_STATE) to run it against a seeded apps/web + apps/server stack',
  );
}

function url(path: string): string {
  // E2E_BASE_URL is asserted defined by `configured` before any test that
  // calls this runs; the fallback only satisfies the type checker for the
  // module-level reads above, which execute before that guard.
  return new URL(path, E2E_BASE_URL ?? 'http://unconfigured.invalid').toString();
}

/** Drag from one node's source handle to another node's target handle. Exact-text match — "New" must not also match "New state". */
async function connectNodes(page: Page, fromText: string, toText: string): Promise<void> {
  const node = (text: string) =>
    page.locator('.react-flow__node').filter({ has: page.getByText(text, { exact: true }) });
  const fromHandle = node(fromText).locator('.react-flow__handle').last();
  const toHandle = node(toText).locator('.react-flow__handle').first();
  const fromBox = await fromHandle.boundingBox();
  const toBox = await toHandle.boundingBox();
  if (fromBox === null || toBox === null) throw new Error('handles not visible for drag');
  await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 12 });
  await page.mouse.up();
}

test.describe('workflow builder smoke — admin', () => {
  test.skip(!configured, 'E2E environment not configured');
  test.use({ storageState: adminState });

  test('clone errand-with-waits, publish, and find it in the list', async ({ page }) => {
    await page.goto(url(`/w/${workspaceId}/settings/workflows/new`));
    await page.getByRole('button', { name: 'Use the Errand with waits template' }).click();
    await expect(page.getByText('No issues. This workflow can be published.')).toBeVisible();
    // PLAN TEXT WAS WRONG HERE: the plan's snippet asserts 'Waiting on
    // counterparty', a string that appears nowhere in this template.
    // `packages/domain/src/workflows/errand-with-waits.ts` names the
    // blocked-flagged state plainly `'Waiting'` — 'Waiting on counterparty' is
    // an unrelated test-fixture's state name used across several `.test.ts`
    // files (`packages/app-core/test/helpers/seed.ts`,
    // `apps/server/test/helpers/read-scenario.ts`, and others), not this
    // template's. Asserting the plan's string would fail against the real
    // canvas every time; asserting the shipped one is what actually proves the
    // clone landed.
    await expect(
      page.locator('.react-flow__node').filter({ has: page.getByText('Waiting', { exact: true }) }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page).toHaveURL(/\/settings\/workflows$/);
    await expect(page.getByText('Errand with waits').first()).toBeVisible();
  });

  test('author from blank: add a state, drag a connection, publish', async ({ page }) => {
    await page.goto(url(`/w/${workspaceId}/settings/workflows/new`));
    await page.getByRole('button', { name: 'Start from a blank workflow' }).click();
    // the blank draft seeds one open start state named "New"
    await page.getByRole('button', { name: 'Add state' }).click();
    // `Select` (packages/ui/src/select/select.tsx) is a react-aria button+listbox
    // widget, not a native <select> — `.selectOption()` is a Playwright API
    // exclusive to real <select> elements and throws against this at runtime
    // (TypeScript won't catch it: Locator types the method generically). Role
    // changed combobox->button to match the migration; name is a regex because
    // the trigger's accessible name concatenates the current value with the
    // aria-label (confirmed in packages/ui/src/select/select.tsx and exercised
    // by the equivalent Vitest queries in canvas.test.tsx, which resolve
    // against the same component in jsdom). The listbox panel renders via
    // createPortal(..., document.body), so the option is queried unscoped from
    // the picked-up listbox rather than from the node locator.
    await page
      .locator('.react-flow__node')
      .filter({ has: page.getByText('New state', { exact: true }) })
      .getByRole('button', { name: /Category/ })
      .click();
    await page.getByRole('listbox').getByRole('option', { name: 'terminal' }).click();
    await connectNodes(page, 'New', 'New state');
    await expect(page.getByText('No issues. This workflow can be published.')).toBeVisible();
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page).toHaveURL(/\/settings\/workflows$/);
  });
});

test.describe('workflow builder smoke — member is read-only', () => {
  test.skip(!configured || memberState === undefined, 'member storage state not configured');
  test.use({ storageState: memberState });

  test('a member sees the banner and no publish', async ({ page }) => {
    await page.goto(url(`/w/${workspaceId}/settings/workflows`));
    await expect(
      page.getByText(
        'You can look, but not change anything. Only a workspace owner or admin can change workflows and ticket types.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'New workflow' })).toHaveCount(0);
  });
});
