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

/**
 * A per-run-unique tag for note titles this file creates. This is the
 * SEEDED BOARD's first ticket — the same one `notes-ticket.spec.ts`'s
 * `openFirstSeededTicket` opens for 18.254–18.256 — so a fixed title (and a
 * `Notes · N` COUNT) would be two different fragilities at once: stale
 * across a rerun of this file alone (strict-mode duplicate matches on the
 * second run's `getByRole('option'/'link', { name: <fixed title> })`), and
 * wrong whenever Plan 6's specs have also attached notes to this ticket
 * (the section's count is shared fixture state, not this spec's own). Both
 * are avoided by (a) a unique title per run and (b) asserting the presence
 * of THAT SPECIFIC badge, never a count.
 */
function uniqueTag(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('18.282 posting a ticket comment with :note Compressor attaches the note; its badge appears in the Notes section with no page.reload()', async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  const title = `Compressor log ${uniqueTag()}`;

  // A fresh, unattached note this spec owns — created via /notes so :note's
  // own queryNotes (a workspace-wide search) has something new to find,
  // independent of any note another spec created or attached.
  await page.goto('/notes');
  await expect(page.getByRole('heading', { name: SEEDED_WORKSPACE_NAME })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Create note' }).click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill(title);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/notes\/[^/]+$/, { timeout: 20_000 });
  const noteId = /\/notes\/([^/]+)$/.exec(page.url())?.[1] ?? '';
  expect(noteId, 'a note id must be readable off the just-created note\'s URL').not.toBe('');

  await openFirstSeededTicket(page);

  // POSITIVE CONTROL FIRST: this specific note is not attached yet — a count
  // ("Notes · 0") would be false whenever Plan 6's own specs (or a prior run
  // of this one) have already attached OTHER notes to this shared ticket.
  await expect(page.getByTestId('ticket-notes').getByRole('link', { name: title })).toHaveCount(0);

  const composer = page.getByTestId('sheet-comments').getByRole('textbox', { name: 'Comment' });
  await composer.click();
  await composer.pressSequentially(`see :note ${title}`);
  await page.getByRole('option', { name: title }).click();
  await page.getByRole('button', { name: 'Post' }).click();

  // The comment's own wikiLink chip — always a link (comment-body.tsx builds
  // wikiLink's href from the id, with no resolver dependency).
  await expect(page.getByTestId('sheet-comments').getByRole('link', { name: title })).toBeVisible({
    timeout: 10_000,
  });

  // The section reloads ON ITS OWN (submitComment's implied-attachment
  // ingest + notes.reload()) — no page.reload() anywhere in this spec. This
  // specific badge is now present, whatever else the ticket already held.
  const badge = page.getByTestId('ticket-notes').getByRole('link', { name: title });
  await expect(badge).toBeVisible({ timeout: 10_000 });
  await expect(badge).toHaveAttribute('href', `/notes/${noteId}`);
});

test('18.283 :ticket in a note comment inserts a chip that opens the ticket', async ({ page }) => {
  await signIn(page, OWNER_EMAIL);

  const { workspaceId, projectId, ticketId } = await openFirstSeededTicket(page);
  const key = (await page.getByTestId('sheet-crumb-ticket').textContent())?.trim() ?? '';
  expect(key, 'the ticket key must be readable off the sheet crumb').not.toBe('');
  const ticketTitle = (await page.getByRole('textbox', { name: 'Ticket title' }).inputValue()).trim();
  expect(ticketTitle, 'the ticket title must be readable off the sheet').not.toBe('');
  const expectedHref = `/w/${workspaceId}/p/${projectId}?ticket=${ticketId}`;

  // A fresh note this spec owns (a unique title, so a rerun of this file
  // never collides with an earlier run's own note), so it does not depend
  // on 18.282 having run either.
  const noteTitle = `Ticket reference check ${uniqueTag()}`;
  await page.goto('/notes');
  await expect(page.getByRole('heading', { name: SEEDED_WORKSPACE_NAME })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Create note' }).click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill(noteTitle);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/\/notes\/[^/]+$/, { timeout: 20_000 });

  // POSITIVE CONTROL FIRST: the note's own comment thread mounted.
  await expect(page.getByTestId('sheet-comments')).toBeVisible({ timeout: 20_000 });

  // The note's composer is one "Add a comment" button until clicked (25.153); the editor mounts focused.
  await page.getByTestId('sheet-comments').getByRole('button', { name: 'Add a comment' }).click();
  const composer = page.getByTestId('sheet-comments').getByRole('textbox', { name: 'Comment' });
  await composer.click();
  await composer.pressSequentially(`see :ticket ${ticketTitle}`);
  await page.getByRole('option', { name: `${key} ${ticketTitle}` }).click();
  await page.getByRole('button', { name: 'Post' }).click();

  // The comment's own ticketRef chip: a link to the ticket's canonical sheet
  // path (the note page supplies resolveTicketHref, Task 4).
  const chip = page.getByTestId('sheet-comments').getByRole('link', { name: `${key} ${ticketTitle}` });
  await expect(chip).toBeVisible({ timeout: 10_000 });
  await expect(chip).toHaveAttribute('href', expectedHref);

  // The chip's href stays the ticket's canonical sheet path (asserted above),
  // but since 18.330 a click on it from a note page opens the sheet IN PLACE:
  // the path stays `/notes/<id>` and `?ticket=<id>` is appended. This line
  // asserted the pre-18.330 navigation to `/w/:ws/p/:project?ticket=…`.
  const notePath = new URL(page.url()).pathname;
  await chip.click();
  await expect(page).toHaveURL(`${new URL(page.url()).origin}${notePath}?ticket=${ticketId}`, { timeout: 20_000 });
  await expect(page.getByTestId('sheet-crumb-ticket')).toHaveText(key, { timeout: 20_000 });
});
