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
 * ## NOT EXECUTED AT THE TIME IT WAS WRITTEN — said here so nobody reads a
 * ## committed spec as a passing one
 *
 * This suite needs the real compose stack listening on `:3001`
 * (`playwright.stack.config.ts` has no `webServer`; `global-setup.ts` refuses
 * the run if what answers there is not the stack). At the time this file was
 * written `:3001` was held by a developer's own `next dev`, and that config's
 * own docblock names the hazard precisely: adopting a stray dev server makes
 * the suite "report deployment coverage of a deployment it never touched".
 * Standing up a second stack on that port was not an option available to the
 * session that wrote it.
 *
 * So this file is COMPILED (it is inside `tsconfig.e2e.json`'s `include`, so
 * `pnpm --filter @gisik-nokma/web typecheck` covers it and it cannot rot
 * silently) but was never RUN. Its first green is owed to CI, whose `gate` job
 * runs this suite against a real compose stack — or to the next person with
 * the stack up locally. Treat a failure here as unexplored ground, not as a
 * regression.
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

async function attachVirtualAuthenticator(client: CDPSession): Promise<string> {
  await client.send('WebAuthn.enable');
  const result = (await client.send('WebAuthn.addVirtualAuthenticator', {
    options: {
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
    },
  })) as AddVirtualAuthenticatorResult;
  return result.authenticatorId;
}

test('register a passkey on /account, then sign in with it — no magic link in the second half', async ({
  page,
  context,
}) => {
  const client = await context.newCDPSession(page);
  const authenticatorId = await attachVirtualAuthenticator(client);

  try {
    // The FIRST sign-in is by magic link, through the shipped form and the test
    // inbox — the existing helper, unchanged. A passkey cannot be the way in
    // before one exists, and pretending otherwise would be the same "offer a
    // control that cannot work" defect this whole task removes.
    await signIn(page, OWNER_EMAIL);

    await page.goto('/account');

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
    await page.getByRole('button', { name: 'Add a passkey' }).click();
    // The row is drawn from a RE-READ of `/passkey/list-user-passkeys`, not from
    // the typed name — `app/account/page.tsx` re-lists rather than pushing
    // locally — so this is the server confirming it stored the credential under
    // the label this run chose.
    await expect(page.getByText(passkeyName)).toBeVisible();
    // The per-row delete control's ACCESSIBLE name carries that same unique
    // label, which is the one assertion that proves the row is a real
    // `PasskeysSection` row rather than the typed text lingering in the field.
    await expect(
      page.getByRole('button', { name: `Delete passkey ${passkeyName}` }),
    ).toBeVisible();

    // AppNav's control, addressed by its full accessible name (`Sign out
    // {name}`). A bare `/sign out/i` would also match every Sessions row's own
    // revoke button on this very page, which is a different control entirely.
    await page.getByRole('button', { name: /^Sign out .+/ }).click();

    await page.goto('/sign-in');
    await page.getByRole('button', { name: 'Sign in with a passkey' }).click();

    // Signed in again, by the credential registered above and nothing else: no
    // inbox was purged, no link was fetched, no email field was filled in this
    // half of the spec. Landing anywhere off `/sign-in` on the web origin is
    // only reachable by a completed WebAuthn authentication.
    await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 20_000 });
    await expect(page).toHaveURL(/\/workspaces|\/w\//);
  } finally {
    // In a `finally` so a mid-spec failure still detaches it: a leaked virtual
    // authenticator outlives the test and would silently satisfy the NEXT
    // spec's ceremony.
    await client.send('WebAuthn.removeVirtualAuthenticator', { authenticatorId });
  }
});
