import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fetchMagicLink, purgeInbox } from './helpers/mailpit.js';
import { ACCOUNTANT_EMAIL, OWNER_EMAIL } from './helpers/sign-in.js';
import { probeShellCommand, seedArgv, seedShape } from './helpers/seed-shape.js';
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
 * all, so that spec is unbuildable on it.
 *
 * WHY THE IN-CONTAINER EXEC WORKS HERE, stated correctly after review caught the
 * first version measuring the wrong environment: `reference/` is NOT in the
 * server image. `docker run --rm --entrypoint sh <image> -c 'ls /app'` shows
 * `dist`, `migrations`, `node_modules`, `package.json` and config — nothing
 * else. It is present in THIS container because `docker-compose.dev.yml`
 * bind-mounts `./reference:/app/reference:ro`, which is a dev-stack affordance
 * App Platform has no equivalent of. So this exec is correct for the dev stack
 * and must NOT be read as evidence that the CC seed can run in a production
 * container — the runbook's "Seeding production" says to run it from a
 * checkout, and that is not merely a preference.
 *
 * AND THE `reference/` MOUNT SURVIVES HOT MODE, which is worth stating rather
 * than inferring: `docker-compose.hot.yml` adds `./reference:/repo/reference:ro`
 * on top of the base file's `/app/reference` mount (compose MERGES `volumes`
 * lists), and the hot stage's WORKDIR is `/repo`. So the seed's relative read of
 * `reference/convenience-corner-tracker/board.data.js` resolves in that shape
 * too, by a different mount at a different path. Two mounts, one affordance —
 * neither of which App Platform has.
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
  // Read by `global-teardown.ts` (same process): only sessions and passkeys created from here on are this run's to remove (6.338).
  process.env['GISIK_E2E_RUN_STARTED_AT'] = new Date().toISOString();
  const { sha } = await assertStackIsTheStack();
  console.log(`[e2e-stack] stack verified, deploy sha ${sha}`);

  await createUser(OWNER_EMAIL);
  await createUser(ACCOUNTANT_EMAIL);

  const composeExec = [
    'compose', '-f', COMPOSE_FILE, 'exec', '-T',
    '-e', `SEED_OWNER_EMAIL=${OWNER_EMAIL}`,
    '-e', `SEED_ACCOUNTANT_EMAIL=${ACCOUNTANT_EMAIL}`,
    'server',
  ];

  /**
   * 13.180 — globalSetup runs seed:cc via `docker compose exec ... server ...` — inside the DEV
   * compose container, on every e2e-stack run — and asserts the seed's own report names 'guest
   * configured'; the corrected reasoning (reference/ is absent from the runtime image, present in
   * dev only via docker-compose.dev.yml's bind mount) lives in this file's header docblock, not in
   * the app image.
   *
   * AMENDED 2026-09-18 (Step 5b) — THE COMMAND IS SHAPE-AWARE, and it has to be, because there are
   * two images this suite runs against and only one of them has a `dist`. The prod-parity image
   * (`docker-compose.dev.yml` alone) carries `/app/dist` and no `src`, so `node dist/seed/…` is
   * right there. The hot image (`-f docker-compose.hot.yml`, `target: dev`) bind-mounts
   * `apps/server/src` at `/repo/apps/server/src`, has WORKDIR `/repo`, and has NO `dist` anywhere —
   * measured in this worktree's own container, 2026-09-18 — so the previous unconditional command
   * died with MODULE_NOT_FOUND before a single spec ran.
   *
   * AND THE SHAPE IS TWO DECISIONS, NOT ONE — the second found only by RUNNING the fix. `pnpm
   * --filter … run seed:cc` sets the cwd to the package directory, not the container's `/repo`, so
   * the seed's relative default for `board.data.js` resolved to `/repo/apps/server/reference/…` and
   * the first live run died on `ENOENT … open 'reference/convenience-corner-tracker/board.data.js'`.
   * The source shape therefore states `--board-path` outright. Both shapes, both halves, and why
   * the probe is a separate exec rather than one `sh -c` with `a && b || c`, are in
   * `helpers/seed-shape.ts`.
   */
  const probe = execFileSync('docker', [...composeExec, 'sh', '-c', probeShellCommand()], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
  const shape = seedShape(probe);
  console.log(`[e2e-stack] server image shape: ${shape} — seeding via ${seedArgv(shape).join(' ')}`);

  const output = execFileSync('docker', [...composeExec, ...seedArgv(shape)], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  });
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
