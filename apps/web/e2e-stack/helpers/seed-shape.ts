/**
 * WHICH SEED COMMAND THE `server` CONTAINER NEEDS — as a pure function, because
 * one of the two shapes cannot be run from this worktree and would otherwise
 * ship untested.
 *
 * ## The two shapes, both measured rather than assumed
 *
 * The stack suite's `globalSetup` seeds through `docker compose exec … server …`
 * (case 13.180). Until Step 5b it ran
 * `node dist/seed/cli-seed-convenience-corner.js` unconditionally, which is
 * correct for the PROD-parity image (`docker-compose.dev.yml`, the Dockerfile's
 * un-targeted `runtime` stage) whose `/app` holds `dist` and no `src`.
 *
 * The HOT image (`docker-compose.hot.yml`, `target: dev`) is the other shape:
 * `apps/server/src` is bind-mounted at `/repo/apps/server/src`, the working
 * directory is the repo root `/repo`, and **no `dist` exists anywhere** —
 * measured 2026-09-18 in this worktree's own `server` container:
 *
 *     docker compose -f docker-compose.dev.yml exec -T server sh -c 'pwd; ls'
 *       /repo
 *     … sh -c 'test -f dist/seed/cli-seed-convenience-corner.js'  ->  absent
 *     … sh -c 'ls apps/server/dist'                               ->  No such file or directory
 *
 * so the unmodified setup died with `MODULE_NOT_FOUND` before any spec ran —
 * the "e2e-stack RED by construction" the 2026-09-17 Task 12 pause recorded.
 *
 * ## Why the probe and the seed are TWO execs rather than one `sh -c` with `||`
 *
 * The obvious one-liner is
 *
 *     test -f dist/… && node dist/… || pnpm --filter @gisik-nokma/server seed:cc
 *
 * and it is wrong in a way that only shows up on a bad day. `a && b || c` runs
 * `c` whenever `b` fails for ANY reason, so a seed that fails on its own merits
 * — the missing-accountant refusal `seed:cc` exists to make — would fall through
 * and run the seed a SECOND time, replacing the failure the report is written to
 * name with whatever the second run happened to say. Splitting the probe from
 * the seed keeps `||` out of the command path entirely: the probe always exits 0
 * and only ever prints which shape it found.
 *
 * It also makes the mapping testable. `seedArgv` is total over `SeedShape`, so
 * the PROD shape — whose container is deliberately not running here (the
 * Step 5b dispatch forbids starting it, and `--build` is out of scope) — gets a
 * witness that does not depend on a container existing:
 * `apps/web/test/seed-shape.test.ts`.
 */

/** The path `node` is handed in the prod-parity image, relative to `/app`. */
export const DIST_SEED_ENTRY = 'dist/seed/cli-seed-convenience-corner.js';

export type SeedShape = 'dist' | 'source';

/**
 * Prints `dist` or `source`, and ALWAYS exits 0 so a caller reads the shape from
 * stdout instead of catching an exception. `test -f` exits 1 when the file is
 * absent; that is the probe's ANSWER, not an error, and letting it surface as a
 * thrown `execFileSync` would make "no dist" indistinguishable from "no
 * container" in the stack trace.
 */
export function probeShellCommand(): string {
  return `test -f ${DIST_SEED_ENTRY} && echo dist || echo source`;
}

/**
 * The probe's stdout, narrowed. An unrecognised answer THROWS rather than
 * defaulting: a default would pick a seed command on the strength of a probe
 * that said something new, which is the silent-empty shape this repo has
 * measured six times (eaten globs, wrong-directory enumeration, proxied
 * directory search, reformatted diff markers, an unquoted zsh loop variable,
 * and stale `dist`) — all of which produce a well-formed wrong answer.
 */
export function seedShape(probeStdout: string): SeedShape {
  const answer = probeStdout.trim();
  if (answer === 'dist' || answer === 'source') return answer;
  throw new Error(
    `the seed-shape probe answered ${JSON.stringify(probeStdout)}, which is neither "dist" nor ` +
      `"source". The probe command changed shape and this function no longer measures anything; ` +
      `refusing rather than guessing which seed to run.`,
  );
}

/**
 * The argv that follows the service name.
 *
 * `seed:cc` is `tsx src/seed/cli-seed-convenience-corner.ts`
 * (`apps/server/package.json`), which is why the source shape needs pnpm's
 * filter rather than a path: in the hot container the working directory is the
 * repo root `/repo`, so the workspace filter resolves and a bare relative
 * `src/…` path would not.
 */
export function seedArgv(shape: SeedShape): string[] {
  return shape === 'dist'
    ? ['node', DIST_SEED_ENTRY]
    : ['pnpm', '--filter', '@gisik-nokma/server', 'seed:cc'];
}
