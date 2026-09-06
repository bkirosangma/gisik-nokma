import type { Page } from '@playwright/test';
import { fetchMagicLink, purgeInbox } from './mailpit.js';

export const OWNER_EMAIL = 'kiro@e2e.gisik-nokma.local';
export const ACCOUNTANT_EMAIL = 'accountant@e2e.gisik-nokma.local';

/**
 * Sign in through the REAL UI: the email goes into the shipped form, the link
 * comes out of the test inbox, the browser follows it.
 *
 * Addressed by role and label, not by test id. The seven role-addressable ids
 * the plan asked for were deliberately never added, and the shipped sign-in page
 * is reachable without them: `<label>Email <input type="email"/></label>` is
 * `getByLabel('Email')`, and the submit is `getByRole('button', …)`. Matching the
 * existing suite's 19-to-0 preference for roles over ids is not a style choice —
 * a test id added to satisfy a test proves only that the id exists.
 */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/sign-in');
  // The page opens on the phone tab; the email form is behind "Email link".
  await page.getByRole('tab', { name: 'Email link' }).click();
  await page.getByLabel('Email').fill(email);

  // Purge LAST, immediately before the send, so exactly one link is in flight.
  await purgeInbox();
  await page.getByRole('button', { name: 'Send magic link' }).click();

  // The shipped confirmation, asserted so a silently-failed send cannot pass as
  // "the mail is just slow".
  await page.getByText('Check your inbox').waitFor({ timeout: 15_000 });

  const link = await fetchMagicLink(email);
  await page.goto(link);
  await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 20_000 });
}
