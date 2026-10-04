# HANDOFF task/wtg1-stress-output-ignored

**Cause.** The stress harness appended to `packages/flow-graph-browser/results/stress.jsonl`, ignored only by a root `.gitignore` line that exists on `release/workflow-graph` (added in WTG T1 PR B, 79f09d92e). A branch without that line (KG) shows the folder as `??`, and `ctl gate` fails "gate tree is dirty". A package-level `.gitignore` would not help: it is a tracked file and vanishes on a branch switch.

**Fix.** Records go to `packages/flow-graph-browser/test-results/stress.jsonl`; the root rule `test-results/` is on every branch, `main` included. Playwright empties its `outputDir` each run, so `outputDir` is now `test-results/pw` and the records survive a run (second run: 4 -> 8 lines). Changed: `vite.config.ts`, `playwright.config.ts`, `harness/results.ts` (docblock), `README.md`, the Features.md bullet, and the old root `.gitignore` line is kept with a comment (a checkout that still has a `results/` folder stays clean). No case names the old path; the plan text (`docs/superpowers/plans/2026-10-03-wtg-part1-...md`) still says `results/` and is left as written history.

**Other packages.** `packages/viewport` (vitest, no file output), `workflow-canvas-browser`, `knowledge-graph-browser`: no harness output path, nothing to fix.

**Proof (same check, local, headless, via slot-run.sh).** Control, old code + root rule removed (the KG state): stress spec 3 passed, `git status --porcelain` = ` M .gitignore` + `?? packages/flow-graph-browser/results/`. Fix, same root-rule-absent state, twice: 3 passed each, `test-results/stress.jsonl` 4 then 8 lines, no `results/`, porcelain shows only the source edits.

**Battery (LOCAL).** flow-graph-browser typecheck rc 0; its full `test` 7 passed; check:citations, check:help, check:tasks, check:env rc 0.
