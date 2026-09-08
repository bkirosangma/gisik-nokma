import { expect, type Page } from '@playwright/test';
import { fetchMagicLink, purgeInbox } from './mailpit.js';
import { WEB } from './stack.js';

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
  /* NO TAB CLICK, and its absence is load-bearing rather than a tidy-up.
   *
   * This used to read `getByRole('tab', { name: 'Email link' }).click()` with
   * the comment "the page opens on the phone tab". It no longer does: the stack
   * server selects a `NullOtpSender`, `GET /v1/auth/methods` reports
   * `phone: false`, and the page renders the email form with no segmented
   * control at all — so there is no tab here to click, and clicking for one
   * would fail the whole suite at its first step.
   *
   * `getByLabel('Email')` is what carries the weight now. It is not a weaker
   * assertion for having lost the click: a page that failed to render, or that
   * rendered the phone form instead, fails here loudly rather than silently
   * signing nobody in. */
  await page.getByLabel('Email').fill(email);

  // Purge LAST, immediately before the send, so exactly one link is in flight.
  await purgeInbox();
  await page.getByRole('button', { name: 'Send magic link' }).click();

  // The shipped confirmation, asserted so a silently-failed send cannot pass as
  // "the mail is just slow".
  await page.getByText('Check your inbox').waitFor({ timeout: 15_000 });

  const link = await fetchMagicLink(email);
  await page.goto(link);

  /* Case 13.270 — the user LANDS ON THE WEB APP, not merely somewhere that is
     not the sign-in page.
     ═══════════════════════════════════════════════════════════════════════════
     THE ASSERTION THIS REPLACES COULD NOT FAIL, and it is the reason a real
     defect reached the owner's hands. It read:

         await page.waitForURL((url) => !url.pathname.includes('/sign-in'), …)

     **A JSON 404 on the API origin satisfies that.** It asserted the user LEFT
     the sign-in page and never that they ARRIVED anywhere. `sign-in/page.tsx`
     was handing better-auth a RELATIVE `callbackURL`, which the browser resolves
     against whatever origin it is on when the token is verified — the API, since
     that is where the emailed link points. Every magic-link sign-in ended on raw
     JSON at the API host, in dev and, by `deploy/do/app.yaml`'s two-subdomain
     shape, in production.

     Nothing downstream noticed because on localhost the two ports SHARE COOKIES
     and every test navigates explicitly straight afterwards. **The property that
     concealed the defect is the same property that made the suite green**, which
     is why the fix is asserted on ORIGIN and not on "did some page load".

     The `waitForURL` is now only a settle: the assertions below are what decide,
     because a timeout says "still waiting" while these name where the browser
     actually is. */
  await page
    .waitForURL((url) => url.origin === WEB && !url.pathname.includes('/sign-in'), {
      timeout: 20_000,
    })
    .catch(() => {
      /* Swallowed on purpose — fall through to the assertions, which report the
         URL that was actually reached instead of a bare timeout. */
    });

  const landed = new URL(page.url());
  expect(
    landed.origin,
    `after following the magic link the browser is on ${landed.origin}${landed.pathname}, not the ` +
      `web app at ${WEB}. A relative callbackURL resolves against the API origin the link points ` +
      `at, which lands the user on the API's JSON 404 — the defect the owner hit by hand on ` +
      `2026-09-08. This assertion exists because "the path no longer contains /sign-in" was ` +
      `satisfied by that 404.`,
  ).toBe(WEB);
  expect(
    landed.pathname,
    `still on the sign-in page at ${page.url()} — the link did not sign the user in`,
  ).not.toContain('/sign-in');
}
