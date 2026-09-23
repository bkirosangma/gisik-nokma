import { expect, test } from '@playwright/test';
import { OWNER_EMAIL, signIn } from './helpers/sign-in.js';
import { openSeededBoard, SEEDED_WORKSPACE_NAME } from './helpers/board.js';

/**
 * 18.282–18.283 — inline `:ticket`/`:note` references and the auto-attach
 * (Plan 7 of 7, spec §14), from a real browser against the built stack.
 *
 * UNEXECUTED AT WRITE TIME — the dev stack is down (controller note carried
 * over from Plan 6's own close). Written against the shipped components and
 * this suite's own conventions (`smoke.spec.ts`'s ticket-card discovery,
 * `visibility.spec.ts`'s positive-control-first rule, `notes.spec.ts`'s
 * `pressSequentially` typing into a `role="textbox"` ProseMirror host,
 * `notes-ticket.spec.ts`'s `openFirstSeededTicket`, duplicated locally
 * rather than imported — specs do not import each other in this suite, only
 * `helpers/`). Stays 🧪 with the recipe until the controller runs it against
 * the built stack.
 *
 * Every spec opens with a POSITIVE CONTROL before touching the thing under
 * test, per `visibility.spec.ts`'s own rule: a bare absence/presence
 * assertion later in the flow would also pass on a blank page or a stalled
 * read.
 */

/** The seeded board's first ticket, opened at its canonical sheet path. */
async function openFirstSeededTicket(page: Parameters<typeof openSeededBoard>[0]) {
  const { workspaceId, projectId } = await openSeededBoard(page);
  const firstCard = page.locator('[data-testid^="ticket-card-"]').first();
  await expect(firstCard).toBeVisible({ timeout: 20_000 });
  const testId = await firstCard.getAttribute('data-testid');
  const ticketId = testId?.replace('ticket-card-', '') ?? '';
  expect(ticketId, 'a ticket id must be readable off the board').not.toBe('');
  await page.goto(`/w/${workspaceId}/p/${projectId}?ticket=${ticketId}`, { waitUntil: 'networkidle' });
  // POSITIVE CONTROL FIRST: the sheet's Notes section actually mounted.
  await expect(page.getByTestId('ticket-notes')).toBeVisible({ timeout: 20_000 });
  return { workspaceId, projectId, ticketId };
}

test('18.282 posting a ticket comment with :note Compressor attaches the note; its badge appears in the Notes section with no page.reload()', async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);

  // A fresh, unattached note this spec owns — created via /notes so :note's
  // own queryNotes (a workspace-wide search) has something new to find,
  // independent of any note another spec created or attached.
  await page.goto('/notes');
  await expect(page.getByRole('heading', { name: SEEDED_WORKSPACE_NAME })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Compressor log 18.282');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/notes\/[^/]+$/, { timeout: 20_000 });
  const noteId = /\/notes\/([^/]+)$/.exec(page.url())?.[1] ?? '';
  expect(noteId, 'a note id must be readable off the just-created note\'s URL').not.toBe('');

  await openFirstSeededTicket(page);

  // POSITIVE CONTROL FIRST: no notes attached to this ticket yet.
  await expect(page.getByTestId('ticket-notes').getByText('Notes · 0')).toBeVisible({ timeout: 20_000 });

  const composer = page.getByTestId('sheet-comments').getByRole('textbox', { name: 'Comment' });
  await composer.click();
  await composer.pressSequentially('see :note Compressor log 18.282');
  await page.getByRole('option', { name: 'Compressor log 18.282' }).click();
  await page.getByRole('button', { name: 'Post' }).click();

  // The comment's own wikiLink chip — always a link (comment-body.tsx builds
  // wikiLink's href from the id, with no resolver dependency).
  await expect(
    page.getByTestId('sheet-comments').getByRole('link', { name: 'Compressor log 18.282' }),
  ).toBeVisible({ timeout: 10_000 });

  // The section reloads ON ITS OWN (submitComment's implied-attachment
  // ingest + notes.reload()) — no page.reload() anywhere in this spec.
  await expect(page.getByTestId('ticket-notes').getByText('Notes · 1')).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByTestId('ticket-notes').getByRole('link', { name: 'Compressor log 18.282' }),
  ).toHaveAttribute('href', `/notes/${noteId}`);
});

test('18.283 :ticket in a note comment inserts a chip that opens the ticket', async ({ page }) => {
  await signIn(page, OWNER_EMAIL);

  const { workspaceId, projectId, ticketId } = await openFirstSeededTicket(page);
  const key = (await page.getByTestId('sheet-crumb-ticket').textContent())?.trim() ?? '';
  expect(key, 'the ticket key must be readable off the sheet crumb').not.toBe('');
  const title = (await page.getByRole('textbox', { name: 'Ticket title' }).inputValue()).trim();
  expect(title, 'the ticket title must be readable off the sheet').not.toBe('');
  const expectedHref = `/w/${workspaceId}/p/${projectId}?ticket=${ticketId}`;

  // A fresh note this spec owns, so it does not depend on 18.282 having run.
  await page.goto('/notes');
  await expect(page.getByRole('heading', { name: SEEDED_WORKSPACE_NAME })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Ticket reference check 18.283');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/notes\/[^/]+$/, { timeout: 20_000 });

  // POSITIVE CONTROL FIRST: the note's own comment thread mounted.
  await expect(page.getByTestId('sheet-comments')).toBeVisible({ timeout: 20_000 });

  const composer = page.getByTestId('sheet-comments').getByRole('textbox', { name: 'Comment' });
  await composer.click();
  await composer.pressSequentially(`see :ticket ${title}`);
  await page.getByRole('option', { name: `${key} ${title}` }).click();
  await page.getByRole('button', { name: 'Post' }).click();

  // The comment's own ticketRef chip: a link to the ticket's canonical sheet
  // path (the note page supplies resolveTicketHref, Task 4).
  const chip = page.getByTestId('sheet-comments').getByRole('link', { name: `${key} ${title}` });
  await expect(chip).toBeVisible({ timeout: 10_000 });
  await expect(chip).toHaveAttribute('href', expectedHref);

  await chip.click();
  await expect(page).toHaveURL(expectedHref, { timeout: 20_000 });
  await expect(page.getByTestId('sheet-crumb-ticket')).toHaveText(key, { timeout: 20_000 });
});
