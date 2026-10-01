import { expect, test, type Locator, type Page } from '@playwright/test';
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
 *
 * 18.330 (task/notes-badge-sheet, owner request 2026-09-24) is the SAME
 * shape, reversed: instead of opening a note from the ticket's Notes
 * section, it opens the ticket's sheet from the NOTE's own byline badge,
 * added to this file rather than a new one because it needs 18.254's own
 * "attach note → land on the note page" recipe to get a note with a real
 * ticket badge on screen. Also UNEXECUTED AT WRITE TIME, for the same
 * reason as the four above.
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
 * Clicks a popover's trigger only after the sheet's scroll has come to rest
 * (18.254–18.256, 18.330 — a spec defect, not a product one).
 *
 * The Notes section and the Visibility control can sit far below the fold of
 * the sheet's scroll body (measured: Attach-note button top 1446 px in a
 * 720 px viewport). Playwright's own auto-scroll before a click moves that
 * body, but the resulting `scroll` event is delivered on the NEXT frame —
 * after the click handler has already opened the popover. `Popover`
 * (packages/ui/src/components/popover.tsx) hands `onClose` to react-aria's
 * `useOverlayPosition`, which closes an open overlay on any scroll of the
 * trigger's scrollable ancestors, so the popover opened and was gone within
 * ~5 ms; `getByRole('textbox', { name: 'Find a note' })` then waited out the
 * 90 s test timeout on a popover that no longer existed. A person clicks
 * after the scroll has come to rest; so do we.
 */
async function clickTriggerSettled(page: Page, trigger: Locator) {
  await trigger.scrollIntoViewIfNeeded();
  // Two frames: the scroll event of the scroll above is delivered, and spent,
  // before the click that opens the popover.
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
  await trigger.click();
}

/** Opens the ticket sheet's Attach-note popover and returns its search box. */
async function openAttachPicker(page: Page) {
  await clickTriggerSettled(page, page.getByTestId('attach-note'));
  const search = page.getByRole('textbox', { name: 'Find a note' });
  await expect(search).toBeVisible({ timeout: 10_000 });
  return search;
}

/**
 * A per-run-unique tag for the note titles this file attaches. The seeded
 * board's first ticket is SHARED fixture state (this file's four specs and
 * `notes-references.spec.ts` all attach to it, and a rerun finds the last
 * run's notes still there), so a fixed title makes `getByRole('link', { name })`
 * match the earlier attachments too — by substring, and by exact name on a
 * rerun — and the badge assertion dies on a strict-mode violation.
 */
function uniqueTag(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

test('18.254 attach note → New note navigates to the note page, and the badge persists on return without a reload', async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  await openFirstSeededTicket(page);

  const title = `Compressor log ${uniqueTag()}`;
  await (await openAttachPicker(page)).fill(title);
  await page.getByRole('option', { name: `New note: ${title}` }).click();

  // The New-note row writes note.created + attaches at birth, then the
  // section navigates via TicketSheetProps.onNavigate (a real router.push at
  // the project page's call site).
  await expect(page).toHaveURL(/\/notes\/[^/]+$/, { timeout: 20_000 });
  await expect(page.getByTestId('note-title')).toHaveText(title);

  // Back to the ticket — an SPA history navigation, no page.reload() call —
  // and the badge is present from the live query alone.
  await page.goBack();
  await expect(page.getByTestId('ticket-notes')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('ticket-notes').getByRole('link', { name: title, exact: true })).toBeVisible({
    timeout: 10_000,
  });
});

test('18.330 clicking a note’s ticket badge opens the sheet in place; the URL path stays /notes/<id>', async ({
  page,
}) => {
  await signIn(page, OWNER_EMAIL);
  const { ticketId } = await openFirstSeededTicket(page);

  // The same recipe 18.254 uses to reach a note with a real ticket badge on
  // it — this spec's own subject only exists once that badge does.
  await (await openAttachPicker(page)).fill('Ticket-sheet-in-place note');
  await page.getByRole('option', { name: 'New note: Ticket-sheet-in-place note' }).click();
  await expect(page).toHaveURL(/\/notes\/[^/]+$/, { timeout: 20_000 });
  const notePath = new URL(page.url()).pathname;

  // POSITIVE CONTROL: the note itself is actually on screen before the
  // badge under test is touched.
  await expect(page.getByTestId('note-title')).toHaveText('Ticket-sheet-in-place note');
  // The byline's ticket badge is the one link on the page whose href IS the
  // ticket's `?ticket=` sheet path. (An earlier `getByRole('link').first()`
  // resolved to the "Skip to content" link, which is off-screen by design.)
  const badge = page.locator(`a[href$="?ticket=${ticketId}"]`);
  await expect(badge).toBeVisible({ timeout: 10_000 });

  await badge.click();

  // The path is UNCHANGED — this is the whole point: the old behaviour
  // navigated to `/w/:ws/p/:project?ticket=…`, leaving /notes entirely.
  await expect(page).toHaveURL(new RegExp(`${notePath}\\?ticket=${ticketId}$`), { timeout: 10_000 });
  const sheet = page.getByRole('dialog');
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await expect(sheet.getByLabel('Ticket title')).toBeVisible({ timeout: 10_000 });
  // The note underneath is still mounted, not replaced.
  await expect(page.getByTestId('note-title')).toHaveText('Ticket-sheet-in-place note');

  // Close returns to the bare note path, sheet gone.
  await sheet.getByRole('button', { name: 'Close sheet' }).click();
  await expect(page).toHaveURL(new RegExp(`${notePath}$`), { timeout: 10_000 });
  await expect(sheet).toBeHidden({ timeout: 10_000 });
});

test('18.255 × on a note badge detaches it; Undo brings it back', async ({ page }) => {
  await signIn(page, OWNER_EMAIL);
  await openFirstSeededTicket(page);

  // Attach a fresh note so this spec does not depend on 18.254 having run.
  const title = `Fridge parts list ${uniqueTag()}`;
  await (await openAttachPicker(page)).fill(title);
  await page.getByRole('option', { name: `New note: ${title}` }).click();
  await expect(page).toHaveURL(/\/notes\/[^/]+$/, { timeout: 20_000 });
  await page.goBack();

  // POSITIVE CONTROL FIRST: the badge is present before it is touched.
  const notes = page.getByTestId('ticket-notes');
  const badge = notes.getByRole('link', { name: title, exact: true });
  await expect(badge).toBeVisible({ timeout: 20_000 });

  await notes.getByRole('button', { name: `Detach ${title}`, exact: true }).click();
  await expect(badge).toHaveCount(0, { timeout: 10_000 });
  // Scoped: the description and comment editors each carry their own (disabled)
  // toolbar "Undo" button, so an unscoped name match is a strict-mode violation.
  await expect(notes.getByRole('button', { name: 'Undo' })).toBeVisible({ timeout: 10_000 });

  await notes.getByRole('button', { name: 'Undo' }).click();
  await expect(badge).toBeVisible({ timeout: 10_000 });
});

/**
 * Spec §11.10 item 3, two sessions — asserting the LAZY behaviour the product
 * has by design (owner ruling 2026-09-29; case 6.104: no frame on narrowing).
 * The scenario needs a ticket the
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
test('18.256 two sessions: narrowing a ticket away from a guest leaves their open inherit-scoped note page in place, and their next read is refused', async ({
  browser,
}) => {
  const ownerContext = await browser.newContext();
  const guestContext = await browser.newContext();
  try {
    const ownerPage = await ownerContext.newPage();
    const guestPage = await guestContext.newPage();

    await signIn(ownerPage, OWNER_EMAIL);
    const { ticketId, workspaceId, projectId } = await openFirstSeededTicket(ownerPage);

    // A grants the accountant EXPLICIT visibility on this ticket — and names
    // every OTHER person on the roster too. Apply is disabled while `explicit`
    // names nobody (visibility-editor.tsx), so a list of ONLY the accountant
    // leaves the narrowing step below with nothing to Apply: unchecking the
    // accountant empties the list, and the click waits out the 90 s timeout on
    // a disabled button.
    await clickTriggerSettled(ownerPage, ownerPage.locator('.gn-visibility__trigger'));
    await ownerPage.getByRole('radio', { name: 'Only the people I name' }).check();
    await expect(ownerPage.getByRole('checkbox', { name: new RegExp(ACCOUNTANT_EMAIL) })).toBeVisible();
    for (const person of await ownerPage.locator('.gn-popover').getByRole('checkbox').all()) {
      await person.check();
    }
    await ownerPage.getByRole('button', { name: 'Apply' }).click();
    await expect(ownerPage.getByRole('button', { name: 'Apply' })).toBeHidden({ timeout: 10_000 });

    // A attaches an inherit-scoped note (the New-note row's own scope, D12).
    await (await openAttachPicker(ownerPage)).fill('Shared maintenance notes');
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

    // A narrows the ticket away from B. The editor RE-AUTHORS the audience on
    // every open: an `explicit` roster is cut from the wire (routes/tickets.ts,
    // cited in visibility-editor.tsx), so the reopened list shows nobody
    // checked whatever was saved — there is no accountant box to untick. Narrowing
    // is therefore a fresh list that simply omits B: everyone but the accountant.
    // (Naming nobody leaves Apply disabled, hence the others are checked.)
    await ownerPage.goto(`/w/${workspaceId}/p/${projectId}?ticket=${ticketId}`, { waitUntil: 'networkidle' });
    await clickTriggerSettled(ownerPage, ownerPage.locator('.gn-visibility__trigger'));
    await ownerPage.getByRole('radio', { name: 'Only the people I name' }).check();
    const everyoneButB = ownerPage
      .locator('.gn-popover')
      .getByRole('checkbox', { name: /^(?!accountant@)/ });
    for (const person of await everyoneButB.all()) await person.check();
    await expect(ownerPage.getByRole('checkbox', { name: new RegExp(ACCOUNTANT_EMAIL) })).not.toBeChecked();
    await expect(ownerPage.getByRole('button', { name: 'Apply' })).toBeEnabled();
    await ownerPage.getByRole('button', { name: 'Apply' }).click();
    // POSITIVE CONTROL: the narrowing was accepted (Apply closes the menu on
    // success and leaves it open on a refusal) before B is asked to react to it.
    await expect(ownerPage.getByRole('button', { name: 'Apply' })).toBeHidden({ timeout: 10_000 });

    // B's OPEN note page is NOT evicted live — by design. Narrowing a ticket's
    // visibility pushes B no frame at all (`visible-events-for.ts`, case 6.104:
    // from the current table a ticket just lost and one never held look the
    // same, so a per-event purge would disclose ids), so nothing tells the open
    // page to leave. Case 18.221's toast-and-return path fires only when an
    // event or a read reaches B. POSITIVE CONTROL: B is still on the note, with
    // its title, after the narrowing has been accepted and given time to arrive.
    await guestPage.waitForTimeout(3_000);
    await expect(guestPage).toHaveURL(noteUrl);
    await expect(guestPage.getByTestId('note-title')).toHaveText('Shared maintenance notes');

    // Eviction happens on the next READ: B reloads the same URL and the server
    // now refuses the note, so the page shows the not-shared hint instead of
    // the document.
    await guestPage.reload();
    await expect(guestPage.getByTestId('note-document-missing')).toHaveText(
      'That note is no longer shared with you.',
      { timeout: 30_000 },
    );
    await expect(guestPage.getByTestId('note-title')).toHaveCount(0);
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

  await page.getByRole('button', { name: 'Create note' }).click();
  await page.getByRole('textbox', { name: 'Title', exact: true }).fill('Compressor stopped in the cold room');
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
