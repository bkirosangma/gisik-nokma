# `@gisik-nokma/web`

The Next.js 15 App Router shell. Three notes that belong beside the config files
rather than inside them, because `next build` rewrites `tsconfig.json` and JSON
carries no comments.

## `exclude` lists `.next`, and that is a fix — not a tidy-up

The plan's `tsconfig.json` includes `.next/types/**/*.ts` — Next's own default,
and correct for a project where `tsc` and `next build` never run at the same
time. Under the repo gate they do: turbo runs `build`, `test` and `typecheck`
concurrently, nothing orders this package's `typecheck` after its own `build`
(`dependsOn` is `^build`, the UPSTREAM packages), and `next build` deletes and
regenerates `.next/types/` while it works. `tsc` globs that directory at start
and reads it later, so the gate failed with six of these:

```
error TS6053: File '.../apps/web/.next/types/app/page.ts' not found.
  The file is in the program because:
    Matched by include pattern '.next/types/**/*.ts' in 'tsconfig.json'
```

Non-deterministically, in whatever order turbo happened to schedule the two —
which is the worst shape a gate failure can have.

**Reproduced, both directions, 2026-09-02.** The failure needs `.next/types/`
to EXIST when `tsc` builds its program: with the directory absent the glob
matches nothing and the run is green, which is why the first isolated
`pnpm typecheck` passed and hid this. With `.next` present and every task
forced to execute (`pnpm turbo run build test typecheck --force`, `0 cached`):
without `.next` in `exclude`, **2 of 3 runs failed** with 6 × TS6053 each and
the third passed — flaky, not broken, the shape that gets re-run rather than
fixed. With `.next` in `exclude`, **4 of 4 runs passed**, 0 TS errors.

**Why the fix is `exclude` and not a shorter `include`.** Removing the pattern
from `include` does not hold: `next build` rewrites `tsconfig.json` on every run
and puts `.next/types/**/*.ts` back. It does NOT touch `exclude`, and `exclude`
beats `include`, so listing `.next` there survives the rewrite and neutralises
the pattern whether or not Next has re-added it. Measured: after a build the
file is byte-identical (sha256 `17d6f3bb…`, checked with `cmp` against a
deliberately-altered control), the include is present, and `typecheck` is clean.

**What that costs, stated rather than glossed:** those generated files are what
type-check a page's exported signature against the route it sits on. That check
is not lost, it MOVES: `next build` runs its own "Checking validity of types"
pass over a program that does include them, and `build` is on the same gate. So
the coverage still runs on every gate run; it just runs in the task that owns
the directory instead of the task that races it.

`declaration: false` is beside it for a different reason: `tsconfig.base.json`
turns declarations on for the libraries, and with them on `tsc` tries to
serialise `authClient`'s inferred type and answers TS7056 ("exceeds the maximum
length the compiler will serialize") and TS2742. This app emits nothing and
publishes no `.d.ts`, so it has no use for them.

## `next.config.ts` carries a `webpack` hook, and that opts out of Turbopack

Relative imports here carry an explicit `.js` suffix — the repo's ESM
convention. TypeScript resolves those to the `.ts`/`.tsx` beside them; Next's
bundler does not, without `resolve.extensionAlias`. Reaching that setting means
a `webpack` key, and a `webpack` key means `next dev` and `next build` both run
webpack rather than Turbopack. The alternative was one import convention for
this app and another for every package it consumes.

## `test` is vitest; Playwright lives behind `test:e2e`

CI runs `pnpm check:env` and `pnpm turbo run build test typecheck`, and installs
no browsers. `test:e2e` is not on that path. `playwright@1.62` ships no install
script (verified: `scripts` is `undefined` in the resolved package), so having
`@playwright/test` as a devDependency downloads no browsers at install time
either. The config and the smoke itself are Plan 6 Task 15.

Two independent facts keep the smoke off the gate, and both are deliberate:
`test` is `vitest run`, and `vitest.config.ts` includes `test/**` only, so
nothing under `e2e/` is collected by the gate's runner even if the scripts were
edited. One of them being changed should not silently put a browser download on
CI's critical path.

## `typecheck` is TWO `tsc` invocations, and the second one is the smoke's

`tsconfig.json` excludes `e2e`, and it must: `next build` REWRITES that file on
every run (that is the whole reason the `.next` exclusion above lives in
`exclude` rather than in `include`), so a directory added to its `include` would
be silently dropped the next time a build ran, taking its type coverage with it
and saying nothing. `tsconfig.e2e.json` is a separate project covering `e2e/**`
and `playwright.config.ts`, which `next build` does not touch, and the package's
`typecheck` script runs both. Verified rather than assumed: a deliberate typo in
the smoke (`nmae:` for `name:`, `toBeVisibleTypo()`) answers `TS2353` and
`TS2551` and fails the script; restored, it exits 0. So a smoke that stopped
compiling is a red gate, not a file quietly rotting behind a script CI never
runs.
