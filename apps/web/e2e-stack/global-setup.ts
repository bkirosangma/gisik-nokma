import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fetchMagicLink, purgeInbox } from './helpers/mailpit.js';
import { ACCOUNTANT_EMAIL, OWNER_EMAIL } from './helpers/sign-in.js';
import { assertStackIsTheStack, SERVER, WEB } from './helpers/stack.js';

/**
 * People first, then the seed — people are never invented.
 *
 * `seed:cc` resolves both emails to real user rows and REFUSES if the accountant
 * does not exist (`no user has the email … — have the accountant sign in`), so
 * the users must be created through the real auth door before it runs.
 *
 * WHICH SEED, AND WHY IT IS NOT A PREFERENCE. The visibility spec needs a guest
 * with explicit per-ticket visibility and the Convenience Corner names. Only
 * `seed-convenience-corner` produces those; `seed-dev-workspace` has no guest at
 * all, so that spec is unbuildable on it. Measured on this image: `reference/`
 * IS present at /app, so the CC seed runs in-container exactly as the plan
 * wrote — while `docs/superpowers/plans` is ABSENT, which is why the dev seed
 * cannot be run this way and is not used here.
 */

const COMPOSE_FILE = 'docker-compose.dev.yml';
// `fileURLToPath`, not `.pathname`: a checkout under a path containing a
// space yields `%20` from `.pathname` and `execFileSync` fails on `cwd`.
const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));

async function createUser(email: string): Promise<void> {
  await purgeInbox();
  // `Origin` is sent DELIBERATELY, and the reason is a measured one rather than
  // a cargo-culted header. Node's fetch presents `Sec-Fetch-*` headers, which
  // is browser provenance, so better-auth's `validateFormCsrf`
  // (`origin-check.mjs:141`) force-validates the origin — and with no `Origin`
  // present that is `403 MISSING_OR_NULL_ORIGIN`. curl, which sends no
  // `Sec-Fetch-*` at all, falls through the same code unchecked and answers
  // 200, which is why a curl probe and this helper disagreed. Sending WEB, the
  // origin a browser really presents, is both the fix and the faithful thing.
  const requested = await fetch(`${SERVER}/api/auth/sign-in/magic-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: WEB },
    body: JSON.stringify({ email, callbackURL: '/' }),
  });
  if (!requested.ok) {
    // The BODY, not only the status. An earlier version of this line printed
    // `answered 403` alone, and that hid which of two different refusals it was
    // — INVALID_ORIGIN (the product defect) or MISSING_OR_NULL_ORIGIN (this
    // helper's own missing header). A failure message that cannot tell two
    // causes apart costs exactly one debugging round every time it fires.
    throw new Error(
      `magic-link request for ${email} answered ${requested.status}: ${await requested.text()}`,
    );
  }
  const link = await fetchMagicLink(email);
  const verified = await fetch(link, { redirect: 'manual' });
  // 2xx or a redirect are "verified"; anything from 400 up is not. The earlier
  // bound was `>= 500`, which accepted a 4xx as success — backstopped only by
  // `seed:cc` refusing later for want of the user, which reports the failure
  // one step away from its cause.
  if (verified.status >= 400) {
    throw new Error(
      `magic-link verify for ${email} answered ${verified.status}: ${await verified.text()}`,
    );
  }
}

export default async function globalSetup(): Promise<void> {
  const { sha } = await assertStackIsTheStack();
  console.log(`[e2e-stack] stack verified, deploy sha ${sha}`);

  await createUser(OWNER_EMAIL);
  await createUser(ACCOUNTANT_EMAIL);

  const output = execFileSync(
    'docker',
    [
      'compose', '-f', COMPOSE_FILE, 'exec', '-T',
      '-e', `SEED_OWNER_EMAIL=${OWNER_EMAIL}`,
      '-e', `SEED_ACCOUNTANT_EMAIL=${ACCOUNTANT_EMAIL}`,
      'server', 'node', 'dist/seed/cli-seed-convenience-corner.js',
    ],
    { cwd: REPO_ROOT, encoding: 'utf8' },
  );
  console.log(`[e2e-stack] ${output.trim()}`);

  // The seed's own report, asserted in BOTH directions. "It ran" is not "it
  // seeded a guest", and the visibility spec is meaningless without one.
  //
  // Written as two explicit checks rather than one substring test: the seed
  // prints either "guest configured" or "guest NOT configured (…)", and the
  // second does not contain the first only because of the word between them.
  // A check whose correctness rests on that is one edit away from being vacuous.
  if (output.includes('guest NOT configured')) {
    throw new Error(
      `seed:cc ran but left the guest unconfigured: ${output.trim()}. ` +
        `The accountant user must exist BEFORE the seed runs.`,
    );
  }
  if (!output.includes('guest configured')) {
    throw new Error(
      `seed:cc printed a report naming neither "guest configured" nor "guest NOT configured": ` +
        `${output.trim()}. The report format changed and this assertion no longer measures anything.`,
    );
  }
}
