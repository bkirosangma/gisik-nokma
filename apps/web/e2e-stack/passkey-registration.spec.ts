import { expect, test, type CDPSession } from '@playwright/test';
import { OWNER_EMAIL, signIn } from './helpers/sign-in.js';

/**
 * ACCOUNT/HELP-SCREENS PLAN, TASK 8 — the end-to-end witness that the passkey
 * story is REAL and not merely wired.
 *
 * ## What only this spec can prove
 *
 * Three suites cover three disjoint slices of this feature and none of them
 * can reach the fourth:
 *
 *   * `packages/app-core/test/account/passkeys-section.test.tsx` — the
 *     component, driven directly. Knows nothing of `authClient`.
 *   * `apps/web/test/account-page.test.tsx` and `test/sign-in.test.tsx` — the
 *     page wiring. Both mock `../src/auth-client.js` WHOLESALE, so neither can
 *     see a request leave, and both say so in their own docblocks.
 *   * `apps/server/test/auth/sign-in-flows.test.ts` — the server endpoints,
 *     driven by `app.inject`. Knows nothing of a browser.
 *
 * What none of them touches is the WebAuthn ceremony itself: that
 * `addPasskey` really produces a credential the server will store, and that
 * `signIn.passkey` really authenticates with it. A virtual authenticator
 * attached over CDP is the only way to run that without a fingerprint sensor,
 * and it is why this spec exists.
 *
 * ## IT WAS NOT EXECUTED FOR A WEEK, AND HAS NOW RUN — the history is kept
 * ## because the first half is why nobody could see it
 *
 * This suite needs the real compose stack listening on `:3001`
 * (`playwright.stack.config.ts` has no `webServer`; `global-setup.ts` refuses
 * the run if what answers there is not the stack). At the time this file was
 * written `:3001` was held by a developer's own `next dev`, and that config's
 * own docblock names the hazard precisely: adopting a stray dev server makes
 * the suite "report deployment coverage of a deployment it never touched".
 * Standing up a second stack on that port was not an option available to the
 * session that wrote it. So the file was COMPILED and never RUN, and the
 * catalogue said so in as many words.
 *
 * **FIRST LIVE GREEN: 2026-09-18, case 13.330, Step 5b.** Not owed to CI after
 * all — the hot stack (`docker-compose.dev.yml` + `docker-compose.hot.yml`)
 * holds `:3001` permanently from the executor's worktree, so the window this
 * was waiting for is not a schedule item. The run line, verbatim:
 *
 *     ✓  1 e2e-stack/passkey-registration.spec.ts:75:1 › register a passkey on
 *        /account, then sign in with it — no magic link in the second half (19.6s)
 *
 * It reached that state only because two seed defects were fixed first
 * (`helpers/seed-shape.ts`): the suite died at `globalSetup` before any spec
 * ran, first on `MODULE_NOT_FOUND` for a `dist` the hot image does not have,
 * then on `ENOENT` for a `board.data.js` path that pnpm's cwd move broke.
 *
 * What the green does and does not establish: the WebAuthn ceremony really runs
 * end to end — `addPasskey` produces a credential the server stores, and
 * `signIn.passkey` really authenticates with it, with no magic link in the
 * second half. It does NOT re-measure the rate-limit property (that is 13.333's
 * separate case, unchanged by this run).
 *
 * ## Why the CDP result is cast
 *
 * Playwright types `CDPSession.send(method: string, params?: object)` as
 * returning `Promise<object>` — the protocol's own per-method result types are
 * not threaded through — so destructuring `authenticatorId` off it needs the
 * shape stated. Narrowed to exactly the one field this spec reads, rather than
 * an `any`.
 */
type AddVirtualAuthenticatorResult = { authenticatorId: string };

/**
 * 13.1731 — DIAGNOSTICS for the CI-only 90 s hang (run 36972594038: this spec timed out in CI and passes in 1.5 s on a
 * dev machine). Gated by `GISIK_E2E_DIAG=1` (set on the CI e2e step), silent otherwise. Every line is stamped with
 * seconds since the spec started, so the log says WHICH step stalled rather than "Test timeout of 90000ms".
 */
const DIAG = process.env['GISIK_E2E_DIAG'] === '1';
const startedAt = Date.now();
const diag = (message: string): void => {
  // eslint-disable-next-line no-console
  if (DIAG) console.log(`[passkey-diag +${((Date.now() - startedAt) / 1000).toFixed(1)}s] ${message}`);
};

async function attachVirtualAuthenticator(client: CDPSession): Promise<string> {
  await client.send('WebAuthn.enable');
  diag('CDP WebAuthn.enable ok');
  const options = {
      // `ctap2` + `internal` + a resident key is the platform authenticator a
      // laptop's own fingerprint sensor presents. `isUserVerified: true`
      // auto-approves the ceremony, which is what makes this runnable
      // head-less — there is no prompt for a test to click.
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
  } as const;
  diag(`WebAuthn.addVirtualAuthenticator options ${JSON.stringify(options)}`);
  const result = (await client.send('WebAuthn.addVirtualAuthenticator', { options })) as AddVirtualAuthenticatorResult;
  diag(`WebAuthn.addVirtualAuthenticator -> authenticatorId ${result.authenticatorId}`);
  return result.authenticatorId;
}

/**
 * 13.330 — a passkey is registered on `/account` over a CDP virtual
 * authenticator, the session is signed out, and sign-in completes by passkey
 * alone: no magic link is requested, no inbox is purged and no email field is
 * filled in the second half, so arriving off `/sign-in` is reachable only by a
 * completed WebAuthn authentication. **First live witness 2026-09-18 (Step 5b);
 * the run line is in the header docblock.** The row's absence-of-residue
 * design — a per-run-unique label rather than an empty-list precondition — is
 * explained at `passkeyName` below.
 */
test('register a passkey on /account, then sign in with it — no magic link in the second half', async ({
  page,
  context,
}) => {
  // 20 s per ACTION in this spec (the config's default is the 90 s test timeout), so a stalled click or fill fails
  // naming ITSELF instead of as an anonymous test timeout. 13.1731.
  page.setDefaultTimeout(20_000);
  const client = await context.newCDPSession(page);
  if (DIAG) {
    diag(`browser ${context.browser()?.version() ?? 'unknown'}`);
    page.on('console', (m) => diag(`console.${m.type()} ${m.text().slice(0, 400)}`));
    page.on('pageerror', (e) => diag(`pageerror ${e.message.slice(0, 400)}`));
    page.on('requestfailed', (r) => diag(`requestfailed ${r.method()} ${r.url()} ${r.failure()?.errorText ?? ''}`));
    page.on('response', (r) => {
      if (/passkey|webauthn|\/api\/auth|\/v1\/me/i.test(r.url())) diag(`response ${r.status()} ${r.request().method()} ${r.url()}`);
    });
    page.on('framenavigated', (f) => {
      if (f === page.mainFrame()) diag(`navigated ${f.url()}`);
    });
    client.on('WebAuthn.credentialAdded', () => diag('WebAuthn.credentialAdded'));
    client.on('WebAuthn.credentialAsserted', () => diag('WebAuthn.credentialAsserted'));
  }
  const authenticatorId = await attachVirtualAuthenticator(client);

  try {
    // The FIRST sign-in is by magic link, through the shipped form and the test
    // inbox — the existing helper, unchanged. A passkey cannot be the way in
    // before one exists, and pretending otherwise would be the same "offer a
    // control that cannot work" defect this whole task removes.
    diag('step: magic-link sign-in');
    await signIn(page, OWNER_EMAIL);
    diag(`step: signed in, at ${page.url()}`);

    await page.goto('/account');
    diag('step: /account loaded');

    /**
     * A PER-RUN-UNIQUE NAME, AND NOT AN EMPTY-LIST PRECONDITION.
     *
     * This read `await expect(page.getByText('You have no passkeys yet.'))
     * .toBeVisible()` before the add, reaching for a real property: that the row
     * appearing below is a fact about THIS registration rather than about a list
     * some earlier run already populated. But this spec never deletes what it
     * creates, so that precondition is only true on the FIRST run against fresh
     * containers. A local re-run, or any CI with cached volumes, would fail on
     * the precondition — **and it would fail looking exactly like a feature
     * regression rather than like test residue**, which is the worst way for a
     * suite to be wrong.
     *
     * A unique name carries the same discriminating weight without needing an
     * empty database or a cleanup step: a row labelled with THIS run's timestamp
     * cannot have been left behind by anything else, so its presence is
     * attributable to the registration performed three lines below and to
     * nothing else. The list may hold residue from earlier runs; this assertion
     * does not care, which is the point.
     */
    const passkeyName = `Test authenticator ${Date.now()}`;

    await page.getByLabel('Passkey name').fill(passkeyName);
    diag('step: clicking Add a passkey');
    await page.getByRole('button', { name: 'Add a passkey' }).click();
    // The row is drawn from a RE-READ of `/passkey/list-user-passkeys`, not from
    // the typed name — `app/account/page.tsx` re-lists rather than pushing
    // locally — so this is the server confirming it stored the credential under
    // the label this run chose.
    await expect(page.getByText(passkeyName)).toBeVisible();
    diag('step: passkey row visible');
    // The per-row delete control's ACCESSIBLE name carries that same unique
    // label, which is the one assertion that proves the row is a real
    // `PasskeysSection` row rather than the typed text lingering in the field.
    await expect(
      page.getByRole('button', { name: `Delete passkey ${passkeyName}` }),
    ).toBeVisible();

    // AppNav's control, addressed by its accessible name prefix (`Sign out {name}`). The name part is
    // NOT required: the e2e owner signs up by email and has `name: ''`, so the label is `Sign out ` and
    // its accessible name is just `Sign out` (CI run 36976174333: `/^Sign out .+/` waited 20 s for it;
    // a dev machine's owner had been given a name, so it passed there). 13.1731.
    //
    // A bare `/sign out/i` would also match every Sessions row's own revoke button on this very page,
    // which is a different control entirely; the `menuitem` role and the `^` anchor keep it to the menu.
    //
    // ROUND 24 put the control inside the account menu, so the trigger is opened first. That move did
    // not change the control's accessible name; the 13.1731 fix loosened the match above, and only
    // that.
    await page.getByRole('button', { name: /^Account menu for / }).click();
    await page.getByRole('menuitem', { name: /^Sign out/ }).click();
    // The click only STARTS the sign-out; the account menu's handler pushes `/sign-in` once the server has
    // answered. Without waiting for that, `goto('/sign-in')` and the passkey click raced the in-flight
    // sign-out, which could land after the new passkey session and leave the page on `/sign-in` (seen
    // locally: `waitForURL` timed out at 20 s on an otherwise green flow). 13.1731.
    await page.waitForURL((url) => url.pathname.includes('/sign-in'), { timeout: 20_000 });
    diag('step: signed out');

    await page.goto('/sign-in');
    diag('step: clicking Sign in with a passkey');
    await page.getByRole('button', { name: 'Sign in with a passkey' }).click();

    // Signed in again, by the credential registered above and nothing else: no
    // inbox was purged, no link was fetched, no email field was filled in this
    // half of the spec. Landing anywhere off `/sign-in` on the web origin is
    // only reachable by a completed WebAuthn authentication.
    await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 20_000 });
    await expect(page).toHaveURL(/\/workspaces|\/w\//);
  } catch (error) {
    if (DIAG) {
      diag(`FAILED at ${page.url()}: ${String(error).slice(0, 600)}`);
      try {
        const creds = await client.send('WebAuthn.getCredentials', { authenticatorId });
        diag(`authenticator credentials ${JSON.stringify(creds).slice(0, 600)}`);
        diag(`page text ${(await page.locator('body').innerText({ timeout: 3_000 })).replace(/\s+/g, ' ').slice(0, 700)}`);
      } catch (probe) {
        diag(`post-failure probe failed: ${String(probe).slice(0, 200)}`);
      }
    }
    throw error;
  } finally {
    // In a `finally` so a mid-spec failure still detaches it: a leaked virtual
    // authenticator outlives the test and would silently satisfy the NEXT
    // spec's ceremony.
    // A closed page (the test already timed out) makes this throw "Target page, context or browser has been closed",
    // which REPLACED the real failure in run 36972594038's report. Swallow only that.
    await client.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId }).catch((error: unknown) => {
      if (!/has been closed/.test(String(error))) throw error;
    });
  }
});
