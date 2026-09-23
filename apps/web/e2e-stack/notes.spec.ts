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

test('18.228 create a note, save it, and find it in the tree after a reload', async ({ page }) => {
  await signIn(page, OWNER_EMAIL);
  await page.goto('/notes');

  // POSITIVE CONTROL FIRST.
  await expect(page.getByRole('heading', { name: 'Convenience Corner' })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'New note' }).click();
  // Home defaults to the first workspace, at the WORKSPACE level
  // (homeProjectId ''), and Scope defaults to Private — this note is meant
  // to stay both, so neither select is touched.
  await page.getByRole('textbox', { name: 'Title' }).fill('Cold room');
  await page.getByRole('button', { name: 'Create' }).click();

  // The dialog's own Create navigates to `/notes/<id>` on success.
  await expect(page).toHaveURL(/\/notes\/[^/]+$/, { timeout: 20_000 });
  await expect(page.getByTestId('note-title')).toHaveText('Cold room');

  const body = page.getByTestId('note-editor').locator('.ProseMirror');
  await body.click();
  await body.pressSequentially('The compressor needs a filter change next week.');
  await expect(page.getByTestId('editor-save-state')).toHaveText('Saved', { timeout: 10_000 });

  await page.reload();

  // The tree row, under the workspace it was filed in — the create flow's
  // Home default proven from the reader's side, not the dialog's.
  await expect(page.getByRole('link', { name: 'Cold room' })).toBeVisible({ timeout: 20_000 });
  // The body survived the reload — a fresh `getNote`, not a cached draft.
  await expect(page.getByTestId('note-editor').locator('.ProseMirror')).toContainText(
    'The compressor needs a filter change next week.',
  );
});

test('18.229 renaming updates the tree row and the document title without a reload', async ({ page }) => {
  await signIn(page, OWNER_EMAIL);
  await page.goto('/notes');
  await expect(page.getByRole('heading', { name: 'Convenience Corner' })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Freezer audit');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/notes\/[^/]+$/, { timeout: 20_000 });

  // POSITIVE CONTROL: the pre-rename title, in both places, before touching it.
  await expect(page.getByTestId('note-title')).toHaveText('Freezer audit');
  await expect(page.getByRole('link', { name: 'Freezer audit' })).toBeVisible();

  const title = page.getByTestId('note-title');
  await title.click();
  await title.press('ControlOrMeta+A');
  await title.pressSequentially('Freezer audit — Q4');
  await title.press('Enter');

  // NO RELOAD BETWEEN HERE AND THE ASSERTIONS — this is the live query, not
  // a page refresh: the tree row is a sibling render fed by its own
  // `getNotes` subscription, not the document's own state.
  await expect(page.getByTestId('note-title')).toHaveText('Freezer audit — Q4');
  await expect(page.getByRole('link', { name: 'Freezer audit — Q4' })).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole('link', { name: 'Freezer audit', exact: true })).toHaveCount(0);
});
