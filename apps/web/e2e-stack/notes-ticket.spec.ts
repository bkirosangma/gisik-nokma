import { expect, test } from '@playwright/test';
import { ACCOUNTANT_EMAIL, OWNER_EMAIL, signIn } from './helpers/sign-in.js';
import { openSeededBoard } from './helpers/board.js';

/**
 * 18.254–18.257 — the ticket's Notes section (Plan 6 of 7, spec §10, §11.10),
 * from a real browser against the built stack.
 *
 * UNEXECUTED AT WRITE TIME — the dev stack is down for a separate server-boot
 * fix (controller note), so these four specs were written against the
 * shipped components and the house conventions (`smoke.spec.ts`,
 * `visibility.spec.ts`, `notes.spec.ts`, `helpers/board.ts`) rather than run.
 * They stay 🧪 with the recipe until the controller runs them against the
 * built stack, per this plan's Task 4.
 *
 * Every spec opens on a board or the Notes page and asserts a POSITIVE
 * CONTROL first (`visibility.spec.ts`'s own rule): a bare absence assertion
 * later in the flow would also pass on a blank page or a stalled read.
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

test('18.254 attach note → New note navigates to the note page, and the badge persists on return without a reload', async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await openFirstSeededTicket(page);

  await page.getByTestId('attach-note').click();
  await page.getByRole('textbox', { name: 'Find a note' }).fill('Compressor log');
  await page.getByRole('option', { name: 'New note: Compressor log' }).click();

  // The New-note row writes note.created + attaches at birth, then the
  // section navigates via TicketSheetProps.onNavigate (a real router.push at
  // the project page's call site).
  await expect(page).toHaveURL(/\/notes\/[^/]+$/, { timeout: 20_000 });
  await expect(page.getByTestId('note-title')).toHaveText('Compressor log');

  // Back to the ticket — an SPA history navigation, no page.reload() call —
  // and the badge is present from the live query alone.
  await page.goBack();
  await expect(page.getByTestId('ticket-notes')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('link', { name: 'Compressor log' })).toBeVisible({ timeout: 10_000 });
});

test('18.255 × on a note badge detaches it; Undo brings it back', async ({ page }) => {
  await signIn(page, OWNER_EMAIL);
  await openFirstSeededTicket(page);

  // Attach a fresh note so this spec does not depend on 18.254 having run.
  await page.getByTestId('attach-note').click();
  await page.getByRole('textbox', { name: 'Find a note' }).fill('Fridge parts list');
  await page.getByRole('option', { name: 'New note: Fridge parts list' }).click();
  await expect(page).toHaveURL(/\/notes\/[^/]+$/, { timeout: 20_000 });
  await page.goBack();

  // POSITIVE CONTROL FIRST: the badge is present before it is touched.
  const badge = page.getByRole('link', { name: 'Fridge parts list' });
  await expect(badge).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'Detach Fridge parts list' }).click();
  await expect(badge).toHaveCount(0, { timeout: 10_000 });
  await expect(page.getByRole('button', { name: 'Undo' })).toBeVisible({ timeout: 10_000 });

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByRole('link', { name: 'Fridge parts list' })).toBeVisible({ timeout: 10_000 });
});

/**
 * Spec §11.10 item 3, two sessions. The scenario needs a ticket the
 * accountant can read (workspace role `guest`, no project membership — the
 * seed's four explicit-visibility errands are one route, but this spec does
 * not depend on their titles: it grants the accountant EXPLICIT visibility on
 * the board's first ticket itself, through the real Visibility editor, so the
 * fixture is self-contained rather than resting on unread seed data).
 *
 * ⚠ The PeoplePicker checkbox is matched by the accountant's EMAIL
 * (`memberLabel`'s fallback when no display name is set — the magic-link
 * sign-in form collects only an email, so this is the expected shape, not a
 * guess against a known name). If the seed or a future sign-in flow ever
 * sets a name, this selector is the first thing to fix.
 */
test('18.256 two sessions: narrowing a ticket away from a guest evicts them from its inherit-scoped note', async ({
  browser,
}) => {
  const ownerContext = await browser.newContext();
  const guestContext = await browser.newContext();
  try {
    const ownerPage = await ownerContext.newPage();
    const guestPage = await guestContext.newPage();

    await signIn(ownerPage, OWNER_EMAIL);
    const { ticketId, workspaceId, projectId } = await openFirstSeededTicket(ownerPage);

    // A grants the accountant EXPLICIT visibility on this ticket.
    await ownerPage.locator('.gn-visibility__trigger').click();
    await ownerPage.getByRole('radio', { name: 'Only the people I name' }).check();
    await ownerPage.getByRole('checkbox', { name: new RegExp(ACCOUNTANT_EMAIL) }).check();
    await ownerPage.getByRole('button', { name: 'Apply' }).click();
    await expect(ownerPage.getByRole('button', { name: 'Apply' })).toBeHidden({ timeout: 10_000 });

    // A attaches an inherit-scoped note (the New-note row's own scope, D12).
    await ownerPage.getByTestId('attach-note').click();
    await ownerPage.getByRole('textbox', { name: 'Find a note' }).fill('Shared maintenance notes');
    await ownerPage.getByRole('option', { name: 'New note: Shared maintenance notes' }).click();
    await expect(ownerPage).toHaveURL(/\/notes\/[^/]+$/, { timeout: 20_000 });
    const noteUrl = ownerPage.url();

    // B opens the SAME note directly — reachable because the note inherits
    // the ticket's now-explicit-including-B audience.
    await signIn(guestPage, ACCOUNTANT_EMAIL);
    await guestPage.goto(noteUrl);
    // POSITIVE CONTROL FIRST: B can actually read it before A narrows.
    await expect(guestPage.getByTestId('note-title')).toHaveText('Shared maintenance notes', {
      timeout: 20_000,
    });

    // A narrows the ticket away from B — re-open the SAME picker and uncheck.
    await ownerPage.goto(`/w/${workspaceId}/p/${projectId}?ticket=${ticketId}`, { waitUntil: 'networkidle' });
    await ownerPage.locator('.gn-visibility__trigger').click();
    await ownerPage.getByRole('checkbox', { name: new RegExp(ACCOUNTANT_EMAIL) }).uncheck();
    await ownerPage.getByRole('button', { name: 'Apply' }).click();

    // B's OPEN note page — no navigation performed by B — returns to /notes
    // with the toast (spec §9.6, case 18.221's own wiring, seen through the
    // real inherit cascade rather than a mocked dataSource).
    await expect(guestPage).toHaveURL(/\/notes$/, { timeout: 30_000 });
    await expect(guestPage.getByText('That note is no longer shared with you')).toBeVisible({
      timeout: 10_000,
    });
  } finally {
    await ownerContext.close();
    await guestContext.close();
  }
});

/**
 * Spec §11.10 item 4. The embed worker (`EMBED_WORKER_INTERVAL_MS`, 10 s)
 * must pick up the note's title before a MEANING match is possible — a real
 * processing delay, not a UI debounce, so the wait below is not padding.
 */
test('18.257 a semantically related note surfaces in meaning search after the embed worker catches up', async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await page.goto('/notes');
  await expect(page.getByRole('heading', { name: 'Convenience Corner' })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: 'New note' }).click();
  await page.getByRole('textbox', { name: 'Title' }).fill('Compressor stopped in the cold room');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page).toHaveURL(/\/notes\/[^/]+$/, { timeout: 20_000 });
  await expect(page.getByTestId('note-title')).toHaveText('Compressor stopped in the cold room');

  await page.goto('/notes');
  await expect(page.getByRole('heading', { name: 'Convenience Corner' })).toBeVisible({ timeout: 20_000 });

  await page.waitForTimeout(15_000);

  await page.getByRole('searchbox', { name: 'Search notes' }).fill('fridge broken');
  // Lexical (100 ms) shares no word with the seeded title and finds nothing
  // by design; the meaning half appends after its own 400 ms pause — poll
  // rather than a second fixed wait, so a slower worker pass still passes.
  await expect
    .poll(
      async () =>
        page.getByRole('link', { name: 'Compressor stopped in the cold room', exact: true }).count(),
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
});
