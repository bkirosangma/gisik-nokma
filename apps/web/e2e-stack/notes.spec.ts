import { expect, test } from '@playwright/test';
import { OWNER_EMAIL, signIn } from './helpers/sign-in.js';

/**
 * 18.228–18.229 — the Notes page (Plan 5 of 6), from a real browser against
 * the built stack.
 *
 * Both specs open on `/notes` and assert the WORKSPACE HEADING is present
 * before doing anything else — the positive control `visibility.spec.ts`'s
 * own docblock argues for: a `toHaveCount(0)`-only assertion later in the
 * flow would also pass on a blank page, a 500, or a stalled read, and the
 * heading proves the tree actually rendered something before the create
 * flow's own assertions are trusted.
 */

/*
 * Titles carry a per-run suffix: the dev stack's database PERSISTS between runs, so a fixed title from an earlier run
 * would make every `getByRole('link', { name })` below resolve to several notes (strict-mode violation) — measured
 * 2026-09-23 on the first run against the built stack. The dialog's inputs are scoped to the dialog with an exact name
 * because the page's own "Filter by title" box also matches a substring `name: 'Title'` query.
 */
const RUN = Date.now().toString(36);
const COLD = `Cold room ${RUN}`;
const FREEZER = `Freezer audit ${RUN}`;
const FREEZER_Q4 = `Freezer audit ${RUN} — Q4`;

test('18.228 create a note, save it, and find it in the tree after a reload', async ({ page }) => {
  await signIn(page, OWNER_EMAIL);
  await page.goto('/notes');

  // POSITIVE CONTROL FIRST.
  await expect(page.getByRole('heading', { name: 'Convenience Corner' })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Create note' }).click();
  // Home defaults to the first workspace, at the WORKSPACE level
  // (homeProjectId ''), and Scope defaults to Private — this note is meant
  // to stay both, so neither select is touched.
  await page.getByRole('dialog', { name: 'New note' }).getByRole('textbox', { name: 'Title', exact: true }).fill(COLD);
  await page.getByRole('dialog', { name: 'New note' }).getByRole('button', { name: 'Create', exact: true }).click();

  // The dialog's own Create navigates to `/notes/<id>` on success.
  await expect(page).toHaveURL(/\/notes\/[^/]+$/, { timeout: 20_000 });
  await expect(page.getByTestId('note-title')).toHaveText(COLD);

  const body = page.getByTestId('note-editor').locator('.ProseMirror');
  await body.click();
  await body.pressSequentially('The compressor needs a filter change next week.');
  await expect(page.getByTestId('editor-save-state')).toHaveText('Saved', { timeout: 10_000 });

  await page.reload();

  // The tree row, under the workspace it was filed in — the create flow's
  // Home default proven from the reader's side, not the dialog's.
  await expect(page.getByRole('link', { name: COLD })).toBeVisible({ timeout: 20_000 });
  // The body survived the reload — a fresh `getNote`, not a cached draft.
  await expect(page.getByTestId('note-editor').locator('.ProseMirror')).toContainText(
    'The compressor needs a filter change next week.',
  );
});

test('18.229 renaming updates the tree row and the document title without a reload', async ({ page }) => {
  await signIn(page, OWNER_EMAIL);
  await page.goto('/notes');
  await expect(page.getByRole('heading', { name: 'Convenience Corner' })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Create note' }).click();
  await page.getByRole('dialog', { name: 'New note' }).getByRole('textbox', { name: 'Title', exact: true }).fill(FREEZER);
  await page.getByRole('dialog', { name: 'New note' }).getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/notes\/[^/]+$/, { timeout: 20_000 });

  // POSITIVE CONTROL: the pre-rename title, in both places, before touching it.
  await expect(page.getByTestId('note-title')).toHaveText(FREEZER);
  await expect(page.getByRole('link', { name: FREEZER })).toBeVisible();

  const title = page.getByTestId('note-title');
  await title.click();
  await title.press('ControlOrMeta+A');
  await title.pressSequentially(FREEZER_Q4);
  await title.press('Enter');

  // NO RELOAD BETWEEN HERE AND THE ASSERTIONS — this is the live query, not
  // a page refresh: the tree row is a sibling render fed by its own
  // `getNotes` subscription, not the document's own state.
  await expect(page.getByTestId('note-title')).toHaveText(FREEZER_Q4);
  await expect(page.getByRole('link', { name: FREEZER_Q4 })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: FREEZER, exact: true })).toHaveCount(0);
});
