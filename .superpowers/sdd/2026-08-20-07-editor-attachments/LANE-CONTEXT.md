# Lane 3 — Plan 7 client half — binding context for every dispatch

You are working in the git worktree `/Users/kiro/my_projects/gisik-nokma-lanes/lane3-plan7-8`
on branch `exec/07-editor-client`. Run every command from there. Do NOT `cd` to any other
checkout. Never commit or push to `main`.

## Environment (non-negotiable)

- Prefix EVERY toolchain command: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`
- `pnpm` only. `vitest run` only — never watch mode.
- Verify with `pnpm turbo run build test typecheck` from the repo root. Never bare `npx vitest`
  (stale `dist/`).
- Postgres 16 on port 54329 (this partition is client-only; you almost certainly need none).

## Tool pitfalls that have already cost this project real time

- **Recursive directory searches SILENTLY RETURN NOTHING here — `rg` AND `grep -r` both.**
  Confirmed twice on this branch and once in a sibling lane. A silent empty result is
  indistinguishable from a true negative, which makes recursion **the wrong instrument for any
  claim of the form "this appears nowhere"**. For such a claim, enumerate the files first and
  grep them explicitly: `find <dir> -name '*.ts' -print0 | xargs -0 grep -n <pattern>`, or a
  shell glob that expands to files before grep sees it, or the Grep tool. Never rest a negative
  on a bare `-r` sweep.
- **Never use ANY `diff`-family command to prove two files are equal — `git diff` included.**
  The recorded project mitigation names `git diff` as the safe alternative and that is WRONG:
  it reported two genuinely different files as identical on this branch. Use `md5` / `shasum`
  on both versions, or read the file. To prove a change is comments-only, strip comments with a
  real TypeScript printer (`ts.createPrinter({removeComments:true})` over the parsed AST, which
  preserves types) and compare hashes — a regex or token scanner desyncs on backticks inside
  comments. To prove which files a commit touched, compare `git ls-tree -r <a>` against
  `git ls-tree -r <b>` blob by blob.

## Repo conventions (from shipped code — these beat plan text)

- ESM everywhere: `"type": "module"`, `moduleResolution: NodeNext`, relative imports in source
  carry the `.js` suffix.
- `tsconfig.base.json` sets `verbatimModuleSyntax: true` AND `isolatedModules: true`: a type
  imported through a value import is a compile error, and a type re-exported through a plain
  `export { X }` is a compile error. Use `import type` / `export { ..., type X }`.
- `strict` + `noUncheckedIndexedAccess: true`: every array index and `Record` lookup yields
  `T | undefined` and needs a guard. `exactOptionalPropertyTypes` is OFF.
- Every package carries TWO tsconfigs: `tsconfig.json` (build, `include: ["src"]`) and
  `tsconfig.typecheck.json` (`noEmit: true`, `include: ["src","test"]`). The `typecheck`
  script points at the SECOND. Read `packages/domain/` for the pattern.
- `packages/domain/src/index.ts` is an APPEND-ONLY barrel: one `export * from './<file>.js';`
  line per module, in rough dependency order. Append at the tail. **Never re-sort it** —
  three other lanes are appending to this same file concurrently and a sort turns an
  append-only file into a whole-file conflict for all of them.
- Package version is `0.1.0`; `exports` uses conditional form with an explicit `types`
  condition (see `packages/rule-engine/package.json`, whose `./fixtures` subpath is the
  precedent for any subpath export).

## The standing law of this project

**Import origins and type shapes come from SHIPPED CODE, never from plan text.** Plan 7 was
written 2026-08-20; the repo has moved since. Where the plan and the tree disagree, the tree
wins, and you record the adaptation in your report.

## Testing discipline (spec §1 invariant 6 — not optional)

- **Every refusal is proven against a planted defect.** For each planted-defect test you write,
  run it against the UNMODIFIED pre-fix code first and record that it FAILED. A test that
  passes before the change proves nothing — a check that cannot fail is not evidence.
- **Exact-rejection tests**: assert the type/code AND the complete message, character for
  character, against the canonical constant. Use `toBe(CONSTANT)` imported from its single
  origin — never a retyped literal, and never `toContain` where identity is the claim.
- Refusal wording has ONE origin. If a constant exists for a reason string, import it.

## Reporting

Write your full report to the report file named in your dispatch. Return only: status
(DONE / DONE_WITH_CONCERNS / NEEDS_CONTEXT / BLOCKED), the commit shas, a one-line test
summary, and concerns. Do NOT dispatch subagents of your own — not helpers, and never a
reviewer. Review arrives from the controller after your report.

## Writing CSS in this package — a trap that has already fired once

`packages/editor/src/styles/editor.css` is in the scope of lane 4's repo-wide colour scanner
(`packages/ui/test/helpers/colour-scan.ts`), which **walks raw lines and has no notion of a CSS
comment.** So a stylesheet here **cannot name a colour function even in order to prohibit one** —
writing `/* no rgb() or hsl() here */` turns a test red in a package you do not own, and the
failure names your file.

Therefore: keep the stylesheet structural, use `currentColor` for every boundary, and in the
file's own comments **do not enumerate the banned forms**. Say what the rule is and where it
lives — colour has one origin, `packages/ui/src/tokens.ts` (coordination amendment 11) — and
leave the enumeration to the scanner and to your dispatch, neither of which is scanned.

Two further facts about that scanner, so you know what it does and does not cover: it matches
hex and colour *functions*, and it does **not** match bare CSS colour keywords, so `color: red`
passes the machine and is still wrong. Its hits now name the full repo-relative path.

## Counting, and claiming a negative

**A delta is a fact about a commit; an absolute is a fact about a moment, and nobody holds the
moment.** Never add a remembered delta to a remembered base. Count from the tree at the moment
you make the claim — run the suite, or enumerate the directory. Every number in your dispatch
brief is ADVISORY, including test counts and fixture counts; if it disagrees with what you
count, what you count wins and you say so.

**Any claim of the form "X appears nowhere" needs a positive control from the same run.** The
search proxy on this machine silently turns some directory searches into empty results, and
from inside the run an empty is indistinguishable from a true negative. So alongside the null
sweep, run the identical enumeration for something you KNOW is present, and report both. A null
without a control is not evidence — it is an absence of evidence that looks exactly like one.

## The worktree is single-writer

Never run a git operation that mutates the working tree — rebase, checkout, stash, reset —
while another agent is live in it. This has already happened once on this branch: the
controller rebased onto a new `main` while a fix-round implementer was working, and that
implementer observed the real, transient mid-rebase state (detached HEAD, staged additions, a
`UU pnpm-lock.yaml` conflict) and reasonably read it as a fabricated or corrupted repository.
It came close to `git rebase --abort` on a healthy branch.

If you are an implementer and the repository state contradicts what you expect: **do not run a
destructive recovery command.** Re-check with `rtk proxy git status --porcelain=v2`, which
resists reformatting, report what you see, and stop. A state that looks impossible is more
often a concurrent writer than a corruption, and the recovery command is what turns a
recoverable situation into a lost one.

## Mutation testing across a package boundary

The property that decides this is **how the test imports**, not which package it lives in.

- A test importing `../src/…` mutates and catches correctly under bare `vitest`.
- A test importing another workspace package **by name** (`@gisik-nokma/domain`) resolves
  through that package's `./dist`. Mutating the other package's SOURCE and running bare
  `vitest` then tests a stale build and **passes** — a false green.

Measured on this branch: dropping `'paragraph'` from `packages/domain/src/doc-text.ts` gave
**8 passed** under bare vitest and **3 failed / 70** under `pnpm turbo run test`. The two
`packages/editor` tests that import domain by name are `doc-text-conformance.test.ts` and
`mention.test.ts`; every other editor test imports relatively and is immune.

**Two tooling workarounds compose badly here.** rtk collapses `pnpm test` output to
`PASS (n) FAIL (n)`, which is why bare `node ./node_modules/vitest/vitest.mjs run <file>` is
the usual way to get assertion-level detail. That is safe for a same-package mutation and
unsafe the moment the test imports another package by name. If you need both detail and a
cross-package mutation: rebuild the mutated package first
(`pnpm --filter @gisik-nokma/<pkg> build`), then run bare vitest — and rebuild again after
restoring, or you leave a mutated `dist` behind for the next agent.
