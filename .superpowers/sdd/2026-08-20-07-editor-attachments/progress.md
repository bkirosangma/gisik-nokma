# SDD ledger — plan: docs/superpowers/plans/2026-08-20-07-editor-attachments.md

## STATE — handoff to serial execution, 2026-08-31. Rewritten in place; history below is append-only.

Read this block, then `git log`, then every line containing `Ruling:`. Do NOT trust shas quoted
in the history below — this branch was rebased three times and the completion lines for Tasks 1,
2 and 11a cite pre-rebase shas that no longer exist. `git log` is authoritative.

**Branch `exec/07-editor-client`, PUSHED, HEAD `1e83700`, 16 commits.**
- Merge-base **`b0ef5f5`**; `origin/main` is **`f3e919b`**, 13 commits ahead.
  **Do not rebase piecemeal — serial rebases once, cleanly.** The only conflict seen in three
  prior rebases was `pnpm-lock.yaml`, and the resolution is fixed: take one side wholesale,
  regenerate with `pnpm install`, never hand-merge (CI runs `--frozen-lockfile`).
- Gate on this tree: **21/21 turbo tasks**, 589 tests — domain 241 · rule-engine 128 ·
  server 106 · editor 70 · ui 31 · sync-client 8 · app-core 5. Counted on a clean tree with no
  operation in flight; do not add a remembered delta to this.
- Worktree is **single-writer**: never mutate the tree while a subagent is live in it.

**DONE, review-clean:** T1 (4 fix rounds) · T2 · T11a domain half · T3 (3 fix rounds).
**IN FLIGHT, incomplete:** **T4** — implemented, fix round 1 landed and reported DONE, but its
scoped re-review was **never dispatched**. That is the one open gate. Its fix round closed the
blank-`userId` hole, rewrote the parse-door rationale, added picker ARIA, and reported two
findings from building rather than reading (popup rows cannot be `<button>` — tab order fights
the `mousedown` handler; ProseMirror already sets `role="textbox"`, so combobox attributes are
saved and restored, not set and removed). Editor went 64 → 70.

**REMAINING on this branch:** T5, T6, T12, T12a, T12b, T12c, T13, T13a, T15; then the partial
catalogue (Features.md §9 + `test-cases/09-editor-attachments.md`, claiming only what shipped,
🟡 with the missing slice named, ❌ reserved verbatim, and Task 2's test assigned **9.35**).
**FOLLOW-ON branch after this PR merges:** T7, T8 — unblocked, `Queryable` is on main.
**NOT this lane, any wave:** T9, T9a, T10, T11, T11a gate half, T14, T16.
**PLAN 8: entirely untouched.** Nothing was started. Its scaffold dependency (`packages/ui`,
`packages/app-core`) has been on main since 2e9f405, so it is unblocked whenever serial reaches
it. One ruling was made in advance and is recorded below: `createFakeGateway` must parse
submitted events with the shipped `submittedEventSchema` rather than accepting what it is
handed — a fake that validates nothing is why the payload-absence defect stayed invisible.

**FINAL WHOLE-BRANCH REVIEW: composed, deliberately NOT dispatched.** A fan-out started at
wind-down could not finish, which is the exact failure the budget rule exists for — full price,
no gate. Serial should dispatch it against the merged tree: **three reading lenses at
opus/`max`**, the **mocked-contract lens at fable**, **adversarial refuters at fable with
`isolation: "worktree"`** (they mutate; thirteen concurrent mutators in one tree were read as
tampering in another lane), read-only lenses may share a tree, and **check the pool against the
measured ~$117 before dispatching**. No floor-list reviewers apply here — Plan 7's floor-list
tasks are T9 and T11, both out of this lane's scope.

**Binding context for every dispatch:** `LANE-CONTEXT.md` beside this file — environment, the
five instruments that fail with confident wrong answers, the counting and positive-control
rules, CSS/colour rules, and the cross-package mutation rule.
**Model tiering for remaining dispatches:** see the MODEL AUDIT entry near the end — 6 of ~11
remaining implementers go sonnet; reviewers stay opus (class floor).
**Consequences are written to the coordination doc** (commit `1e83700`), not left here: ten
plan-text defects, the measured cross-package mutation hazard, and three unruled product
questions (`trailingNode`, unreadable stored `wrap`, paste/drop-to-markup).

Branch: `exec/07-editor-client` off `origin/main` @ f363b2f
Scope: T2, T11a(domain), T1, T3, T4, T5, T6, T12, T12a, T12b, T12c, T13, T13a, T15, partial catalogue
Deferred to Wave 2 (NOT this branch): T7, T8, T9, T9a, T10, T11, T11a gate half, T14, T16

Pre-flight fan-out: run wf_9d6b54e3-7b0 — 7 agents, 14 briefs, 16 adaptations, 17 obligations.

## Rulings

Ruling: one PR for the whole client half, not a T2+T11a domain micro-PR first — why: the
  coordination doc reserves micro-PRs for *unblocking* artifacts ("a keystone sitting unmerged
  blocks three other lanes as if it were unwritten"); no lane consumes `doc-embeds` or
  `attachment-kinds`, so an early merge buys only conflict-window reduction, and the barrel
  conflict is append-only and resolves by keeping both lines — cost if wrong: one extra
  mechanical rebase of `packages/domain/src/index.ts` + a regenerated lockfile.

Ruling: T2 and T11a(domain) execute FIRST, before T1 — why: turbo's `test` task is
  `dependsOn: ["^build"]`, so `@gisik-nokma/domain` must build with the new modules before
  `packages/editor`'s suite can go green against them (adaptation map, T1 vitest note) —
  cost if wrong: T3/T6/T12/T12a fail on a stale domain dist and the cause reads as an
  editor bug.

Ruling: T2 + T11a share one implementer/reviewer dispatch; every other task gets its own —
  why: both are ~40-line pure-domain modules in one package with one barrel line each, and
  the SDD per-task commit boundary is preserved (two commits, one reviewer pass over both) —
  cost if wrong: a reviewer's attention is split across two small modules.

Ruling: T6 runs in Wave 1 though the wave listing files it under Wave 2 — why: the doc's own
  pre-work section states `docToPlainText` was pulled forward *so that* "Plan 9 T2's and
  Plan 7 T6's create-if-absent guards never fire"; pre-ruling 4 is discharged on this base
  (`packages/domain/src/doc-text.ts` present and barrelled) and T6 creates no file —
  cost if wrong: a wave deviation that is answered in the record, not silent.

Ruling: partial catalogue ships on this branch though Task 16 is out of scope — why: the
  workspace rule ("same change set, never a follow-up") is not waived by a task being out of
  scope, and commit bd9e022 set the precedent for Plan 3's keystone — cost if wrong: §9
  claims a case a shipped test does not cover. Mitigation: claim only ✅ what landed, 🟡 with
  the missing slice NAMED, ❌ reserved verbatim, no renumbering.

Ruling: Task 2's `doc-embeds.test.ts` is assigned case **9.35**, past the end of Task 16's
  pinned 9.1–9.34 — why: the plan numbers no case for it and Task 16 says "no other numbers";
  the 5.37 move in bd9e022 is the precedent — cost if wrong: Task 16's executor renumbers,
  which the reservation is designed to prevent.

Ruling: no `apps/server/**` file is created on this branch — why: pre-ruling 5 gives Plan 7
  the evidence gate unconditionally but its Task 11 is Wave 2; `apps/server/src/gates/` does
  not exist, and creating a gate test file with no gate is the mocked-contract failure in
  miniature — cost if wrong: T12c's server case and T11a's gate half are deferred, recorded,
  and marked 🟡 rather than faked.

Ruling: the fixture-count delta for this partition is **0**, stated explicitly — why:
  pre-ruling 6 requires every colliding branch to state its delta so the merger can sum them;
  `grep` over Plan 7 finds zero references to rule-engine fixtures — cost if wrong: a silent
  lane is indistinguishable from a forgetful one and `fixtures.test.ts`'s 61 breaks.

## Binding adaptations (the map overrides plan text — see PR body for full table)

A1  T1 BLOCKING  second tsconfig: `tsconfig.typecheck.json` (noEmit, include src+test,
                 jsx react-jsx, lib DOM, types node); `typecheck` script points at it.
A2  T1 BLOCKING  `@types/node ^22.10.0` devDep + `"types": ["node"]`.
A3  T1 BLOCKING  probe EVERY tiptap package's named exports + dump StarterKit's own
                 composition before writing a single import.
A4  T1 MECH      version 0.1.0; conditional `exports` with an explicit `types` condition.
A5  T1 MECH      `verbatimModuleSyntax` + `isolatedModules` are ON — `import type` /
                 `export { type X }` throughout; `noUncheckedIndexedAccess` guards.
A6  T1 MECH      keep vite ^6 (duplicate major with vitest's vite 7 is legal, not breakage).
A7  T4 DRIFT     mention `label` stays required, but never insert an EMPTY label — the
                 shipped walker falls through to `@<ULID>`. Assert length > 0.
A8  T12a BLOCK   the "pending Plan 3 amendment" hedge is STALE — `attachment.added` is a
                 shipped discriminated union. Add `attachmentAddedPayload.safeParse` pins.
A9  T12a DRIFT   ledger zod is stricter than `isDriveReference` (url(), ULID, ISO ≤3 frac):
                 keep the `webViewLink !== ''` filter and `toISOString()`.
A10 T11a DRIFT   pin `attachment-kinds.ts` field names against `attachmentDriveReferencePayload.shape`.
A11 T12b MECH    `sha256: string | null` on the list entry vs `string` on UploadResult is
                 correct asymmetry — do NOT reconcile.
A12 T13 DRIFT    doc-comment `transitionRequiresEvidence`: `fromStateId` MUST already be
                 folded forward; a stale id yields `false` — a missing prompt, not a refusal.
A13 T15 BLOCK    `src/webview/css.d.ts` = `declare module '*.css';` (NodeNext can't resolve
                 a .css specifier). Do NOT add `"sideEffects": false` — the CSS import IS
                 the side effect.
A14 T15 MECH     `.gitignore` gains `dist-webview/` (the `dist/` line does not match it).
A15 T11a BLOCK   no `Queryable` on main — the Wave-2 helper types against `Pool` from 'pg'.
A16 T1 MECH      jsdom + `.test.tsx` glob are a genuinely NEW monorepo convention, not drift.

## Obligations discharged / outstanding

O1  amendment 15: UploadResult is the SIX-field body-text shape, not the stale two-field
    header row; client echoes SERVER mime/size, never the File's. Planted defect required.
O2  `ticket.transitioned` is `{to, comment:{text}, evidenceAttachmentId?, cause?}` — the
    plan's header row still says `toStateId`. Stale row → by-catch.
O3  IST: `istDayOf` from domain replaces BOTH `toISOString().slice(0,10)` day computations
    (T12b `formatCapturedAt`, T13a unavailable line). Boundary-straddling planted defect.
O4  zero colour literals in `editor.css` + a LOCAL colour-literal guard, because amendment
    11's enforcing test lives in lane 4's `packages/ui` and cannot run here.
O5  three unproven upload seams (T12, T13, T15) each get a doc comment naming plan+task+wave
    that serves the real contract; recorded for the wave-boundary live-integration pass.
O6  no `process.env` in `packages/editor` — asserted by a test, not by inspection.
O7  `DriveLinkCheck` has exactly two values, neither "reachable"; assert exhaustively.
O8  upload permission is `canSee` — no client surface gates attaching on role.
O9  refusal copy has ONE origin: `toBe(EVIDENCE_DRIVE_REFERENCE_REASON)`, never retyped.
O10 every planted defect is run against the pre-fix body and recorded as having FAILED.
    Restorations verified with `git diff` or by reading the file — NEVER shell `diff`.
O11 `grep -rn` with explicit paths, never bare `rg` on a directory (silent empty results).
O12 `ticketId` FormData part before the file part — Plan 1 consequences §7, instance-wide
    AJV `coerceTypes:false`. Comment the WHY so a reorder is not read as harmless.
O13 prefer wiring `build:webview` into `packages/editor`'s own `build` script over editing
    the shared CI YAML.

## Task log

BASE = f363b2f (branch point, == origin/main)

Dispatch D1: Task 2 + Task 11a(domain half) — implementer opus/high, agent ad50e6a2b6bdd9b20.
  Briefs: task-2-brief.md, task-11a-brief.md. Report: task-2-11a-report.md.
  Carried: A8 (attachment.added amendment already landed — drop the "pending" hedges),
  A10 (pin attachment-kinds field names against attachmentDriveReferencePayload.shape),
  A9 (isDriveReference is a shape guard, not a wire validator — keep as written),
  A15 (no Queryable on main — the seed helper is deferred), scope fence (no apps/server/**).

Ruling: UI tasks (T12, T12b, T13, T13a) name concrete testable constraints instead of
  invoking `ui-ux-pro-max` — why: the workspace CLAUDE.md makes that skill binding for UI
  work but it is NOT installed on this machine (verified absent from ~/.claude/skills, the
  plugins tree, and the available-skills list; lane 4 hit the same wall during its
  packages/ui scaffold). An agent given an uninstallable binding constraint either stalls or
  silently skips it. Substitute: a machine-checkable rule per constraint — the colour-literal
  regex guard, the `process.env` absence assertion, `toBe(EVIDENCE_DRIVE_REFERENCE_REASON)`,
  the exhaustive `DriveLinkCheck` union assertion — cost if wrong: no design opinion is
  applied to surfaces that are structural-only by constraint anyway.

D1 implementer returned DONE_WITH_CONCERNS. 371 tests (+11 over the 360 baseline), 9/9 green.
  Commits a8e8bc9 (T2), 687aa44 (T11a domain half).
  Implementer finding against the BRIEF: Task 2's six specified fixture cases do not kill a
  `String()`-coercion mutant behind the `!= null` check — null/{}/missing-attrs are the only
  non-strings offered. Added `attachmentId: 42`, which kills it. Flagged for a coordination-doc
  note because other lanes transcribe the same fixture and inherit the hole.
  Reviewer dispatched (opus/high, agent aa48cf94192261773) with that finding named as the
  highest-value thing to re-derive independently.

Ruling: task N's review and task N+1's implementation are NOT overlapped — why: a fix round
  turns a reviewer into an implementer on the same package, and T1's `pnpm install` rewrites
  the lockfile and node_modules under any concurrent verification; the SDD spine's
  never-parallel-implementers rule is there for exactly this — cost if wrong: wall-clock,
  which the owner's review-depth ruling has already priced in ("the speedup is schedule-only").

D1 review (aa48cf94192261773): spec ✅ both tasks; task quality NEEDS FIXES.
  Verified independently by probe: the implementer's M3 String()-coercion claim holds; the
  A10 pin is bidirectional and derived-not-retyped; the A9 comment's every claim checks out
  against ticket-events.ts; doc-embeds/doc-text totality parity holds.
  Important #1: deleting `type === 'image'` from doc-embeds.ts:39 passes ALL SEVEN cases —
  no fixture carries a non-image node with attrs.attachmentId. Larger than M3: this walker is
  the single definition all three embed-enforcement layers read.
  Minor #2 sorted-order escape · #3 name/mimeType conjuncts unkilled · #4 removal can slip
  past the A10 pin · #5 a8e8bc9 prose omits .gitignore · #6 wire-delta list not exhaustive.

Ruling: minors #2/#3/#4/#6 are folded into fix round 1 rather than deferred to the final
  review — why: the SDD spine keeps minors out of the loop, but these are the SAME class as
  the Important finding, live in the same two files the round already reopens, and cost ~6
  lines; deferring them means shipping fixtures with known-surviving mutants in a project
  whose spec invariant 6 is "every refusal is proven against planted defects" — cost if
  wrong: one slightly larger fix diff for the re-review to read.

Ruling: #5 is answered in the FIX commit's prose, not by amending a8e8bc9 — why: `git
  rebase -i` is unavailable in this environment and history surgery for a documentation nit
  is not worth the risk on a branch that already has a child commit — cost if wrong: the
  .gitignore line is explained one commit later than ideal, and both commits are in the PR.

CARRY TO THE COORDINATION DOC (by-catch, Plan 7 plan defects — not the gitignored ledger):
  Plan 7 Task 2's fixture is transcribed verbatim by other lanes and carries FOUR holes, none
  of which its six specified cases catch: (a) String()-coercion behind the != null guard,
  (b) the `type === 'image'` discriminator entirely unpinned, (c) sorted-output escape,
  (d) Task 11a's guard fixture leaves `name`/`mimeType` conjuncts unkilled. Every lane that
  copies them inherits all four.

D1 fix round 1/5 dispatched to ad50e6a2b6bdd9b20 (5 findings, falsifiability required per fix).

CROSS-LANE (peer gisik-nokma-8d, + my own verification against origin/main @ 2e9f405):

Ruling: O4 is SUPERSEDED — `packages/editor` ships NO local colour-literal guard — why:
  lane 4's shipped scanner already names `packages/editor/src` in `CLIENT_SOURCE_ROOTS`
  (packages/ui/test/helpers/colour-scan.ts) and skips roots that do not exist yet, by design
  ("the moment a plan creates one, the discipline covers it with no edit here"). Writing my
  own guard would be a second statement of one rule — the exact drift class this series keeps
  catching. Rebasing onto 2e9f405 before T1 makes amendment 11 enforced and falsifiable on
  THIS branch at zero cost, which is strictly better than the local guard I had planned —
  cost if wrong: none; if the scanner ever stops covering editor, its own planted-defect
  tests fail loudly in packages/ui.

Ruling: rebase onto origin/main @ 2e9f405 at the D1/T1 boundary, not now — why: the fix-round
  implementer is live in packages/domain, and T1's `pnpm install` regenerates pnpm-lock.yaml;
  installing before the rebase would produce a lockfile missing lane 4's React tree and force
  a second regeneration through a conflict — cost if wrong: one extra lockfile regeneration.

A17 (NEW, T1) — lane 4's shipped React-package conventions, which packages/editor must match
  or duplicate-React and duplicate-jsdom follow. Verified by reading origin/main:
    - react + react-dom are **peerDependencies ^19.0.0 AND devDependencies**, never plain deps
    - `@testing-library/react ^16.2.0` — the plan pins ^16.1.0; align UP to lane 4's
    - also carried: @testing-library/jest-dom ^6.6.3, @testing-library/user-event ^14.6.1,
      @types/react ^19.0.0, @types/react-dom ^19.0.0
    - jsdom ^25.0.1 · typescript ^5.6.3 · vitest ^3.1.0 · @types/node ^22.10.0 — all match
    - `"private": true`, version 0.1.0, conditional exports with an explicit `types` condition
    - vitest.config.ts needs `esbuild: { jsx: 'automatic' }` — the plan's config OMITS it and
      no .test.tsx compiles without it; include glob `test/**/*.test.{ts,tsx}`
    - tsconfig.typecheck.json: extends base, noEmit, `jsx: "react-jsx"`,
      `lib: ["ES2023","DOM","DOM.Iterable"]`, include ["src","test"] — and NO `types` field:
      omitting it auto-includes every @types/* package, which is how packages/ui's node:fs
      scanner type-checks. This REFINES A2: add @types/node as a devDep, omit `types`.
    - CSS subpath export precedent for editor.css: packages/ui uses `"./ui.css": "./src/ui.css"`

Carried for later (Plan 8 gateway work, not Plan 7): shipped `IngestResult`
  (packages/domain/src/ingest-result.ts) is a THREE-variant union — committed/invalid/refused,
  no `pending` — while coordination amendment 10 promises the replica answers `pending` and
  that the type is additive across sources. Any `switch (result.status)` written now is
  missing a case the decision already took. Owner is whichever lands first of Plan 6 T7 or
  Plan 10 T10. Lane 4 deliberately did not add the variant (nothing produces it yet).

Confirms O2 from a second source: `ticket.transitioned` is `{to (required), comment:{text}?,
  evidenceAttachmentId?, cause?}`. Binds T13/T13a, which feed `evidenceAttachmentId` into it.
  The two shape errors travel together — fixing only the field name leaves a later refusal
  that reads as a new problem. Must NOT be unified: the transition-LOG ENTRY keeps `toStateId`.

Test-collection hazard (peer item 2): CHECKED, no live instance. Every `.test.` path in all
  14 Plan 7 briefs is under `test/`; none under `src/`. The plan's own include glob is
  `['test/**/*.test.ts','test/**/*.test.tsx']` — equivalent to lane 4's `{ts,tsx}` form.

CROSS-LANE round 2 (peer gisik-nokma-8d):

A8 IS UPGRADED, not merely confirmed. Peer correction: `EventEnvelope.payload` is typed
  `unknown`, so NO client-built payload is typechecked anywhere in the series — every net is
  a runtime parse. That makes the `attachmentAddedPayload.safeParse(...)` conformance
  assertions in T12a's tests not a nicety but THE ONLY THING standing between a client-composed
  payload and a production `invalid-payload` refusal. Raise their weight in the T12a dispatch
  and in its review lens: a missing safeParse pin there is an Important finding, not a Minor.
  Same reasoning extends to T13/T13a's `evidenceAttachmentId` feed into `ticket.transitioned`.

Peer correction 2: the "transcribe-and-ship-green" drift is silent ONLY where a fake stands in
  with no rule engine in the path. In this partition that is exactly T12 and T13 — the injected
  `uploadAttachment` seam and the evidence picker. Where a real parse sits in the path it goes
  red on transcription and tells you. Unchanged: T13/T13a carry BOTH `ticket.transitioned`
  shape errors together or neither.

SCANNER GAP (lane 4, proven both ways: a planted `color: red` passes 31/31; a planted
  `#c0ffee` fails). `findColourLiterals` matches hex and colour FUNCTIONS but NOT bare named
  CSS colours. So when `packages/editor/src/styles/editor.css` lands, amendment 11 is enforced
  on it for hex and functions only — `color: red` would pass. Lane 4 deferred the widening to
  Plan 6 Task 2 as additive, because Plan 6 T2's pinned test asserts `findColourLiterals`
  returns exactly `['color-mix(']` and a widened regex breaks that assertion.

Ruling: `packages/editor` still ships NO colour guard of its own, despite the named-colour gap
  — why: a package-local check would be a second statement of amendment 11's one rule, which is
  the drift this series keeps catching, and the gap is already owned with a named owner and a
  reason for the deferral. Instead the constraint is carried three ways: (a) every CSS-touching
  dispatch (T12, T12b, T13, T13a) states `currentColor` ONLY — no hex, no colour functions, and
  no bare named colours either, with the reason that the scanner will not catch the third kind;
  (b) the task reviewer reads the stylesheet and verifies it directly; (c) the gap window is
  recorded in the coordination doc so Plan 6 T2's executor knows `editor.css` landed inside it
  and must be re-scanned when the keyword check arrives — cost if wrong: a named colour lives
  in editor.css until Plan 6 T2, caught by review rather than by a test.

BY-CATCH LIST (for the coordination doc, same change set as the work — NOT this gitignored file):
  1. Plan 7 T2's fixture carries four surviving mutants (String() coercion; the `type ===
     'image'` discriminator entirely unpinned; sorted-output escape; T11a's name/mimeType
     conjuncts). Transcribed verbatim by other lanes; all four fixed here.
  2. Plan 7's vitest.config block OMITS `esbuild: { jsx: 'automatic' }`. No `.test.tsx`
     compiles without it and four of this partition's tasks add one. The next plan authoring a
     client-package config hits it identically. (Peer asked for this one specifically.)
  3. Plan 7's Consumed-interfaces table is stale in two rows: the upload response is still the
     pre-amendment `{attachmentId, url}` (amendment 15 pins a five-field superset), and
     `ticket.transitioned` is still `{toStateId, comment}` (keystone amended it to
     `{to, comment:{text}}`).
  4. Plan 7 numbers no test case for Task 2's `doc-embeds.test.ts` (Task 16 pins 9.1–9.34 and
     says "no other numbers") — assigned 9.35 here, the bd9e022 precedent.
  5. `@testing-library/react` skew: Plan 7 pins ^16.1.0, lane 4 shipped ^16.2.0.

D1 fix round 1/5: 5 addressed, 0 open (commits 687aa44..b1ee381). Re-reviewer re-derived
  findings 1 and 2 independently with a four-mutant table rather than reading the report;
  confirmed the reorder kills sort() WITHOUT trading away dedupe-drop or last-seen-order.
  Runtime logic proven untouched by MD5 on both sides. Test count reconciles at 371 (the
  fixes add a fixture node and two array entries INSIDE existing it() blocks, so the count
  cannot move — "stricter, not more numerous" is exactly right).
Task 2: minor (deferred): attachment-kinds.ts:35 is a 117-char comment line, unrewrapped;
  no lint/format task exists in the repo so nothing fails on it. Sweep when next touched.
Task 2: complete (commits f363b2f..b1ee381, review clean)
Task 11a (domain half): complete (same range, review clean)

*** CORRECTION TO A DOCUMENTED PROJECT CONVENTION — carry to the coordination doc ***
  Plan 2 execution consequences §7 records the RTK hazard as: "verify mutation restorations
  with `git diff` or by reading the file, never with a proxied shell `diff`." The re-reviewer
  hit a LIVE recurrence and it is worse than recorded: **`git diff` is filtered here too** —
  it reported two versions of attachment-kinds.ts as identical when their MD5s differed. The
  documented mitigation names as safe the very tool that lied.
  The method that actually held: `md5`/`cmp` on the two versions, or reading the
  review-package diff FILE (which is written by a script, not printed through the filter).
  Every remaining dispatch in this lane carries this. Update Plan 2 consequences §7's rider
  rather than adding a new one — the existing text is what a future lane will read and trust.

CROSS-LANE round 3 — lane 2's stated-count defect class, CHECKED against Plan 7: NO instance.
  Method: counted `it(` blocks per task line-range and compared with every "Expected: PASS (N
  tests)" claim in that range. Result table (block count vs stated): T1 6/6 · T12 10/10 ·
  T12a 7/7 · T12b 4/4 · T13 7/7 · T15 11/11 · T13a 2 blocks stated as "9 — Task 13's seven
  and these two" (cumulative, correctly stated) · T2/T3/T4/T5/T6/T12c state no count.
  ONE apparent mismatch, resolved as a false alarm rather than left flagged: T11a's range
  holds 6 blocks against a stated 4. The range spans BOTH halves of a split task — 4 domain
  cases in attachment-kinds.test.ts and 2 server cases in evidence-gate.test.ts (Wave 2) —
  and the plan states them separately and correctly ("4 domain cases, and the gate suite with
  its two new refusals"). D1 shipped 5 domain cases: the 4 specified plus the mandated A10
  drift pin. Additive, nothing deleted. Standing ruling adopted anyway for the rest of this
  lane: resolve by literal block count, correct the plan's number, never delete to match.

Scanner diagnostic defect (lane 4, relayed): colour-scan.ts's walk() reports
  `relative(root, path)` per source root, so a hit in packages/editor/src/styles/editor.css
  surfaces as `styles/editor.css:N` with nothing naming the package. Lane 4 is landing
  `relative(REPO_ROOT, path)` ahead of my next rebase. No action here; if my stylesheet lands
  first, a red names the file but not the package and it is mine.

CORRECTION to the O4/named-colour ruling recorded above — substitute (c) is WITHDRAWN and
  replaced, on lane 4's correction. I recorded that `editor.css` lands inside a "gap window"
  and that Plan 6 T2's executor must remember to re-scan what predates the keyword check.
  That is wrong here: `colour-scan.ts`'s `walk()` enumerates every EXISTING source root on
  every run, so a keyword check wired into the same walk covers `packages/editor/src` the
  moment that tree exists. There is no window and nothing to remember. The scanner already
  satisfies the corollary structurally rather than by vigilance.
  The constraint that actually travels to Plan 6 T2 is narrower and stronger: **put the
  keyword check INSIDE `walk()`; do not invent a changed-files mechanism for it.** A check
  that enumerates gets history for free; a check that watches a diff must be told about
  history and will not be.
  Substitutes (a) — every CSS-touching dispatch names all three prohibited forms including
  bare keywords — and (b) — the reviewer reads the stylesheet — both stand unchanged, and
  remain the only thing covering keywords until Plan 6 T2 lands.
  Also corrected: I warned of two `relative()` call sites in colour-scan.ts. There is exactly
  one, at line 68. The fix is unambiguous; my caution was unfounded.

CROSS-LANE round 4 — apps/server build-contract change (lane 2 T1). INERT for this branch:
  the client partition touches only packages/domain and packages/editor. BINDING on Wave 2,
  recorded here so whoever picks up Plan 7 T7/T8/T9/T9a/T10/T11 designs against it:
  - better-auth 1.7.2 pulls zod 4 (zod@4.4.3) while apps/server depends on zod ^3.25.0. Two
    zod majors coexist. Symptom is TS2742 — betterAuth()'s inferred type reaches into
    @simplewebauthn/server and zod 4, neither nameable from apps/server — so DECLARATION EMIT
    FAILS. Lane 2 set `"declaration": false` in both apps/server tsconfigs.
  - CONSEQUENCE FOR PLAN 7's SERVER HALF: anything added to apps/server that would need a
    typed export gets no .d.ts. The fix is NOT to flip declaration back on (that reintroduces
    TS2742) but to put the type in packages/domain, the way LedgerEvent / IngestResult /
    IngestErrorCode already were by the pre-work hoist. Design T7/T8's boundary accordingly.
    Checked against this partition: nothing here imports a type from apps/server. `UploadResult`
    is declared LOCALLY in packages/editor by the plan's own design, and A15 already types the
    Wave-2 seed helper against `Pool` from 'pg'. No redesign needed.
  - DO NOT upgrade the monorepo to zod 4 to resolve this — it touches every package to spare
    one private app's declaration emit. Lane 2 ruled it; seconded by lane 3.
  - OPEN (lane 2 checking before its T2): declaration emit off silences the TYPE symptom only;
    two zod majors still coexist at RUNTIME. If better-auth's public API hands zod schemas back
    to callers, one composed with an apps/server zod-3 schema misbehaves at runtime, not at
    compile time. Relevant to Plan 7 only if a server task composes with a better-auth schema —
    none of T7/T8/T9/T11 does as planned, so inert unless that changes.
  - Lane 2 is landing `'invite'` in ENTITY_KINDS together with the membership-id amendment, so
    sibling lanes rebase onto envelope.ts once rather than twice. Expect both in its partition A.

SUPERSEDED — the `ui-ux-pro-max` ruling recorded above is WITHDRAWN. The owner had the skill
  installed mid-session on lane 4's report; it is at ~/.claude/skills/ui-ux-pro-max/ and is
  visible to this session's skill list. The premise of that ruling (uninstallable binding
  constraint) no longer holds, so the workspace convention applies as written: T12, T12b, T13
  and T13a dispatches name `ui-ux-pro-max` as binding.
  Adopting lane 4's synthesis rather than swapping one approach for the other: the numeric
  substitute proved STRONGER than a design opinion for the pairs it covered, because it is
  executable and re-runs on every edit; the skill's value is the pairs nobody thought to
  declare. Use BOTH — machine-checkable assertions AND the skill's coverage.

  Narrower consequence for THIS package, worth stating because it is not obvious: lane 4
  recorded that `CONTRAST_PAIRS` covers seven text pairs at >=4.5:1 and is silent on WCAG
  1.4.11 non-text contrast, where `borderStrong` on `surfaceRaised` measures 2.49 light /
  2.08 dark against a 3.0:1 requirement — ghost-button boundaries are under-contrast. That is
  Plan 6 T2's to fix. It largely does NOT bind packages/editor, and for a reason worth
  recording: this package declares no colour at all and does not depend on packages/ui, so a
  control boundary drawn `1px solid currentColor` inherits the surrounding TEXT colour, which
  is already proven at >=4.5:1 — comfortably above 1.4.11's 3.0:1. The zero-colour constraint
  incidentally satisfies non-text contrast more strongly than a dedicated border token does.
  Carry this into the T12/T12b/T13 dispatches as a positive instruction, not just a prohibition:
  draw boundaries with `currentColor`, never with a token or a literal.

Scanner attribution fix merged (lane 4 #19), proven both ways — hits now name the full
  repo-relative path. Nothing to do here; a future red on my stylesheet will name its package.

T1 DONE_WITH_CONCERNS, commit 5bf6ead. 18/18 turbo tasks, 423 tests.
  BASELINE CORRECTION: pre-T1 baseline was 407, not the 371 my dispatch stated — 371 predated
  lane 4's two packages arriving in the rebase. T1 added 16. Use 423 going forward.
  Finding 1 (high value): StarterKit v3.30.5 bundles an `underline` MARK that schema v1 does
  not name. Nothing in the brief disables it and the brief's `toContain` test could not have
  noticed a sixth mark — all three clients would have stored a mark no spec text names.
  `underline: false` added; vocabulary now pinned by set-equality in both directions.
  Finding 2: A1 (the second tsconfig) was load-bearing immediately — the brief's own `typeText`
  DOES NOT COMPILE (prosemirror-view's handleTextInput takes 5 args, the brief passes 4), and
  that error lives in test/, which the brief's single-tsconfig typecheck never reads. It would
  have shipped into eleven tasks.
  Reviewer dispatched (opus/high, af4d00f99455a7c7e) with all four claims to re-derive.

CROSS-LANE round 5 — passkey specifier move (lane 2). CHECKED against Plan 7: INERT, including
  Wave 2. Method: grepped the whole plan for better-auth/passkey/simplewebauthn — two hits,
  BOTH prose, neither an import: line 2792 says Plan 4 owns the real requireSession
  integration, line 4907 says Google OAuth env vars are untouched because the Drive picker
  needs no server involvement. Plan 7's server half consumes `Auth` as a TYPE from Plan 4
  (line 2774/2954) and stubs sessions as `Bearer <userId>` (line 2798-2801), which the plan
  sanctions. No better-auth subpath is named anywhere in Plan 7, so the
  `better-auth/plugins/passkey` -> `@better-auth/passkey` move cannot reach this plan in any
  wave. Recorded as a clean negative rather than left unchecked.

PROSPECTIVE IMPORT AUDIT (applying the two-part test — subpath resolves AND named export
  present — to all ELEVEN remaining in-scope tasks, before dispatching any of them).
  Method: extracted every external `from '<spec>'` and every `import { … }` name from briefs
  3,4,5,6,12,12a,12b,12c,13,13a,15; probed each against the installed tree with a dynamic
  import and an `in` check per name.
  RESULT: CLEAN. All 11 specifiers resolve; every named export the briefs import is present.
    @tiptap/core (Editor, Extension, Node, mergeAttributes) · @tiptap/react (Editor,
    EditorContent, useEditor) · @tiptap/pm/state (EditorState, NodeSelection, Plugin,
    PluginKey, TextSelection) · @tiptap/pm/view (Decoration, DecorationSet, EditorView) ·
    @testing-library/react (render, fireEvent) · vite-plugin-singlefile (viteSingleFile) ·
    react · react-dom/client (createRoot) · @gisik-nokma/domain (docToPlainText,
    DRIVE_FILE_SCOPE, isDriveReference, EVIDENCE_DRIVE_REFERENCE_REASON, isEmbeddableImageMime,
    newUlid).
  Default-vs-named styles also verified against the plan's actual import lines, since a
  present subpath with the wrong import STYLE is the same failure shape:
    - plan:1229 `import Suggestion from '@tiptap/suggestion'` — default; package exports BOTH
      `Suggestion` named and a default, so either style works. No ambiguity risk.
    - plan:6955 `import react from '@vitejs/plugin-react'` — default; package exports ONLY
      `default`. Correct as written; a named import here would have failed.
    - plan:6957 `import { viteSingleFile } from 'vite-plugin-singlefile'` — named; present.
  Also confirmed T1's implementer installed the FULL dependency set (@tiptap/react,
  @testing-library/react, vite-plugin-singlefile, @vitejs/plugin-react are all resolvable
  already), not only what T1 itself needed — so no later task pays an install surprise.

T1 review (af4d00f99455a7c7e): spec ✅; task quality NEEDS FIXES.
  All four headline claims survived independent verification — the reviewer probed the
  installed tree, reproduced the TS2554 split with an untracked file under BOTH tsconfigs
  (typecheck config errors, build config exits 0), replicated the walker to confirm exactly
  four conformance mutants structurally cannot die, and re-derived the colour scanner by
  planting an untracked #ff0000 (1 failed | 3 passed, then 4/4 on removal). doc-text.ts proven
  unmodified by md5 across four refs.
  Correction to the implementer's own report, in its favour: set-equality covers BOTH nodes
  and marks (schema.test.ts:66-71) — the report undersold it as marks-only.

Ruling: `linkOnPaste: false` — OVERRIDING the plan, which mandated `Link.configure` verbatim.
  Why: (1) spec §2 says verbatim "nothing silently becomes markup" and the comment in this
  very file quotes that rationale while the config contradicts it; (2) `autolink: false` is set
  TWO PROPERTIES AWAY in the same call — the plan disabled the typed-URL path and missed its
  paste-side sibling, so the call is internally inconsistent as written; (3) it is the
  identical defect class to the `underline` find — an unaudited library default entering the
  single origin of the document schema, which eleven tasks and three clients inherit along
  with the comment that misdescribes it. Cost if wrong: pasted URLs need one manual link
  action; reversible in one line, and no stored document is affected either way.

Ruling: `trailingNode` STAYS ENABLED; a ruling-request goes to the coordination doc.
  Why: the reviewer's independent read matches mine — invariant 4 targets invented FACTS
  ("no estimated dates, no fabricated progress"), and an empty trailing paragraph asserts no
  fact, carries no text and renders as nothing through the shipped walker (pinned at
  doc-text-conformance.test.ts:160-166). It is deterministic editing apparatus, not invention.
  The genuine tension is narrower: because it fires on first keystroke rather than on load,
  a saved version bundles structure the author never wrote into the author's claim, and §2
  makes description edits versioned claims. That is real but small, and disabling it can
  strand the cursor after a terminal block. Cost if wrong: `trailingNode: false` is a one-line
  reversal TODAY while no documents exist; once documents are stored it needs a migration —
  which is exactly why this is recorded as a ruling-request rather than settled silently.

Ruling: T1's four minors fold into fix round 1 rather than deferring — same reasoning as D1's,
  and they are all instances of this branch's running theme ("closed only where a check closes
  it"): heading levels 1-6 unenforced (7 and 99 round-trip), stderr noise that should be an
  assertion, jest-dom matchers unwired with the trap armed for the first .tsx task,
  orderedList/horizontalRule absent from the conformance suite. Cost if wrong: a larger fix
  diff for the scoped re-review.

T1 fix round 1/5 dispatched to abbd0c09f9ee7700d — linkOnPaste + 4 minors + a NEW general
  sweep: dump the RESOLVED OPTIONS of every extension buildEditorExtensions configures, not
  just the schema it produces. Set-equality proved the vocabulary; nothing yet proves the
  behavioural options, and both findings so far are unaudited defaults.

T1 fix round 1/5 landed: commit 140afd5. 18/18 turbo tasks, 429 tests (editor 16 -> 22).
  Editor stderr now silent.
  linkOnPaste: FIXED, and the implementer narrowed the blast radius by reading `pasteHandler`
  rather than the option table — it returns early on an empty selection, so the defect fired
  when pasting a URL OVER A SELECTION. Same verdict (that is exactly how a person links a
  phrase), narrower scope. `markdownLinks: false` also stated — already the default, but it is
  the THIRD text-to-link path and "correct by accident" reads identically to "correct on
  purpose" in a single-origin file. Tests assert WIRING (handlePasteLink absent from the
  plugin list) plus a Slice through handlePaste, not an option value.
  SWEEP RESULT: all 28 resolved extensions dumped; `linkOnPaste` was the ONLY option
  contradicting a stated constraint. Two hand-forwards to Task 7, recorded as non-defects:
  `defaultProtocol: 'http'` (inert until a link toolbar exists) and
  `placeholder.showOnlyCurrent: true`. `listKeymap` names taskItem/taskList, which cannot
  match — set-equality independently proves they are absent from the schema.

  TWO SELF-CORRECTIONS, the most informative part of the round — in both the implementer's own
  fix was insufficient and mutation caught it:
  (a) the heading round-trip pin SURVIVED a `levels: [1,2,3]` mutant, because `levels` governs
      what is OFFERED and constrains stored documents not at all — level 6 round-trips under it
      exactly as level 99 does. Offered levels are now asserted directly, and a comment records
      that stored levels are unvalidatable here and belong at the door.
  (b) `horizontalRule` was written off as unfalsifiable; the mutant proved otherwise — it dies
      when the walker is taught to render '---'. The comment was corrected rather than the
      claim quietly kept.
  This is the branch's own lesson turned on the fixes themselves: mutate the implementation,
  not the fixture — including the implementation of your own fix.

  Scoped re-review dispatched (opus/high, ac99e4aa84dae53ed) with all three weight-bearing
  claims to re-derive, plus an explicit instruction to say so if any assertion added this
  round would pass against the pre-fix code.

T1 scoped re-review (ac99e4aa84dae53ed): all 6 findings ADDRESSED; both self-corrections
  independently confirmed; the 28-line sweep dump reproduced IDENTICALLY (and extended — the
  Editor manager resolves 38, the extra 10 all have empty options, so scoping to 28 missed
  nothing). Test arithmetic reconciles 16->22, total 429. doc-text.ts md5 identical across
  four refs. Lockfile md5 identical, --frozen-lockfile exits 0.
  The re-reviewer also stated plainly which added assertions would pass pre-fix (both heading
  cases, the conformance case, the console.warn assertions, the autolink half of :211, the
  markdownLinks pin) and why that is coverage rather than vacuity — each dies under a mutant
  it actually ran. Exactly three assertions fail pre-fix. That is the right way to report it.

  BUT: NEW IMPORTANT BREAKAGE INTRODUCED BY THE FIX. A FOURTH text-to-markup path exists and
  round 1 minted a green check certifying its absence.
    `extension-link@3.30.5` dist:445-482 — `addPasteRules()` UNCONDITIONALLY returns a
    markPasteRule for plain URLs whenever markdownLinks is false. Registered by core
    dist:5232-5240, fires from pasteRulesPlugin's appendTransaction gated on
    `uiEvent === 'paste'`, which prosemirror-view's doPaste sets AFTER someProp('handlePaste')
    declines. None of autolink / linkOnPaste / markdownLinks gates it.
    Empirically: URL over a selection -> link; URL at a BARE CURSOR -> link (worse than the
    original defect, which returned early on an empty selection); bare `gst.gov.in` ->
    http:// link. Not link-only: bold(2), italic(2), code(1), strike(1), link(1) all register
    paste rules — `**x**` -> bold, `*x*` -> italic, backticks -> code, `~~x~~` -> strike.
    And `test/schema.test.ts:224` drives someProp('handlePaste') only — an entry point that
    STRUCTURALLY CANNOT observe an appendTransaction paste rule. It is green while the product
    produces a link on that same paste. Our own named defect class, minted in the commit that
    closed the previous instance of it.

Ruling: fix the FALSE CERTIFICATION now; route the BEHAVIOUR to Task 5. Why: whether pasted
  markdown may silently become markup is a product decision about spec §2's "nothing silently
  becomes markup", it spans five extensions, and Task 5 IS "the escape-suggestion mechanic
  (spec §2's named requirement)" — the task the plan created for exactly this. Deciding it in
  T1 pre-empts the owning task, and `enablePasteRules: false` is an Editor option that
  `buildEditorExtensions` structurally cannot reach anyway. What is NOT deferrable is a comment
  claiming exhaustiveness that is false and a test certifying an absence that is untrue — those
  are fixed in round 2, and the test is RETARGETED to observe the real path and assert what
  actually happens today, labelled as documenting current behaviour pending Task 5. Cost if
  wrong: the tree carries an honest record of an unwanted behaviour for three tasks instead of
  a fix — and the honest test fails the moment Task 5 changes it, which is the point.

Ruling: the re-review's out-of-scope claim that `pnpm typecheck` never checks `test/` is WRONG
  and must not be acted on. It read the BUILD tsconfig's `include: ["src"]` while the script
  targets `tsconfig.typecheck.json` (`include: ["src","test"]`). VERIFIED by planting
  `const x: number = "not a number"` in packages/editor/test/: typecheck exits 2 with TS2322,
  removed, tree clean. Adaptation A1 holds and is working. Cost if wrong: none — this ruling
  prevents a fix to a non-problem.

CARRY INTO TASK 5's DISPATCH (its opening problem, with evidence): the fourth paste path,
  its five extensions, the two remediation shapes the re-review sized
  (`Link.extend({addPasteRules: () => []})` per extension, or `enablePasteRules: false` at the
  Editor — which requires changing what buildEditorExtensions returns or where it is consumed),
  and the fact that spec §2's escape-suggestion mechanic is about TYPED characters while this
  is the paste path, so Task 5 must decide whether §2's "nothing silently becomes markup"
  reaches paste at all.
ALSO CARRY: a future options sweep must dump REGISTERED PLUGINS and paste/input RULES, not just
  `.options`. Reading options is precisely why the fourth path went unseen twice.

T1 fix round 2/5 dispatched to abbd0c09f9ee7700d.

T1 fix round 2/5 landed: commit ce569be. 18/18 turbo tasks, 431 tests (editor 22 -> 24: one
  FALSE case removed, three honest ones added).
  THE SHARPEST DETAIL OF THE WHOLE TASK: `markdownLinks: false` — which the implementer added
  in ROUND 1 as a guard — is the very condition SELECTING the unguarded branch
  (extension-link dist:445-482 returns the plain-URL markPasteRule precisely when markdownLinks
  is false). The defensive addition routed INTO the defect, not away from it. A guard that
  enables what it claims to prevent is a new entry in this branch's defect catalogue and does
  not reduce to any of the three shapes recorded so far.
  Implementer's own framing, which is right: round 1 closed a real hole and in the same commit
  minted a false green check — worse than the hole, because a hole is merely open while a false
  check tells the next person to stop looking.
  Mutants re-run against ONE fixed 15-case file (fixing the round-1 table's off-by-one at
  source rather than editing the record): M1 (drop linkOnPaste:false) -> 3 failed/12;
  M4 (Link.extend addPasteRules:[]) -> 1 failed/14; M5 (enablePasteRules:false, the likelier
  shape of Task 5's eventual fix) -> BOTH `CURRENT BEHAVIOUR pending Task 5` cases die.
  M5 is the one that matters: the honest tests are a TRIPWIRE, not a lock-in — they fail the
  moment Task 5 changes the behaviour, and the cases say "flip, don't delete".
  Minor corrections were the implementer's own claims being WRONG rather than thin: orderedList
  is INERT (not load-bearing as its round-1 comment said) — added to the inert list with the
  general rule that an entry earns its keep exactly when its node holds text directly; and
  `defaultProtocol` had the wrong mechanism AND the wrong tense (linkifyjs's find() is called
  with no options at dist:450, so 'https' still yields http://; and bare domains become http://
  links TODAY, not hypothetically at Task 7).
  Scoped re-review dispatched (opus/high, aac441225a0c9df2c). Crux for it: confirm M5 really
  kills both CURRENT BEHAVIOUR cases, so the tripwire works in the direction it must.

CROSS-LANE round 6 — envelope.ts settles at Plan 4 T3 (one rebase, three changes together:
  membership composite entity id, 'invite' in ENTITY_KINDS, payload presence). Nothing in the
  current partition blocked. Two things to carry:

  (a) PAYLOAD-PRESENCE BOUNDARY, for any assertion written against the door. `z.unknown()`
      does not require the key, so `submittedEventSchema` admitted payload-less events and
      JSON.stringify erased the absence. After T3 the four cases are:
        absent -> REFUSED · present-but-undefined -> REFUSED · null -> ACCEPTED · {} -> ACCEPTED
      An empty claim is still a claim and a null payload is still a claim. A remedy that also
      refused null or {} would look correct and pass a careless review while refusing
      legitimate events — the "present in the form you are about to use it" rule arriving
      inside the remedy rather than the defect.

Ruling (PLAN 8, recorded now so it is not re-litigated at transcription): `createFakeGateway`
  MUST run every submitted event through the SHIPPED `submittedEventSchema` before accepting
  it. Why: lane 4 hit the payload-absence defect live precisely because a fake validates
  nothing, so a wrong shape only fails at a real door — that is the mocked-contract law's exact
  failure mode, and Plan 8's fake is the seam most exposed to it (every Plan 8 authoring test
  runs through it, and Plan 5 T9b's real server is a whole wave away). The validator is a pure
  domain function needing no server, so sharing it costs nothing and converts the fake from
  "the thing that excuses the server from existing" into "a local copy of the door."
  Cost if wrong: a Plan 8 test that was passing against a permissive fake starts failing —
  which is the point, and is cheaper now than at the Wave-2 live-integration checkpoint.
  This is the same move as adaptation A8's safeParse pins, applied to the seam rather than to
  the composer, and it is stronger: A8 pins the payloads a test remembers to check, this pins
  every event the fake ever sees.

T1 round-2 re-review (aac441225a0c9df2c): ALL findings ADDRESSED, no new Critical/Important.
  Crux independently re-derived: control reproduces both CURRENT BEHAVIOUR assertions; M4
  (Link.extend addPasteRules:[]) kills the URL case only; M5 (enablePasteRules:false) kills
  BOTH. Tripwire fires when Task 5 FIXES the behaviour, not when it regresses — as designed.
  Every factual claim in the comment was checked against dist line numbers (13-row table).
  Six Minors, none blocking. Two of them are corrections to MY work:

RETRACTION: my "fourth defect shape" was FALSE and I propagated it to lane 4's coordinator
  before checking. Claimed: `markdownLinks: false` was a guard that selected the unguarded
  branch — "a guard that enables what it forbids." Reality: `markdownLinkPasteRule` ALSO links
  plain URLs via its own findPlainUrls (extension-link dist:225,233), verified empirically with
  markdownLinks:true — plain URL still links, bare domain still gets http://. NO VALUE of the
  option escapes the defect; it selects which rule OBJECT implements the same behaviour.
  What survives is a variant, not a species: an option that appears to select between a safe
  and an unsafe branch may select between two implementations of the same behaviour. The trap
  is that reading the branch condition CONFIRMS the story — you see `if (markdownLinks) … else
  <bad rule>` and stop, because the code agrees with you. Checking the other branch breaks it.
  How it travelled: the implementer produced it, I found it striking, and I forwarded it on the
  strength of being striking. It was checkable in ~2 minutes. **A finding that is interesting
  is not thereby verified, and interestingness is exactly what makes it travel.** The
  re-review caught it only because I had asked it to re-derive headline claims independently —
  luck of instruction, not a systematic guard. Retracted to lane 4 in the same turn.

Ruling CORRECTED: my Task 5 ownership assignment was DEFECTIVE. `task-5-brief.md` contains ZERO
  occurrences of "paste" — its trigger table is explicitly INPUT rules, its contract is TYPED
  sequences, its mechanism reads undoInputRule's store which paste rules never populate.
  Executed as briefed, Task 5 goes green, the CURRENT BEHAVIOUR tripwires stay green, and the
  fourth path ships unnoticed. An ownership claim nobody checked — same species as an import
  origin nobody checked, and it was mine.
  Corrected assignment: **Task 5 DECIDES** (it owns spec §2's "nothing silently becomes
  markup"), **Task 12 IMPLEMENTS** if the decision is to disable — `enablePasteRules` is an
  `Editor` option and `TicketEditor` is where the Editor is constructed, so
  `buildEditorExtensions` structurally cannot carry it. Task 5's dispatch MUST widen explicitly
  to name the paste path as a deliverable; its brief will not raise it.
  Cost if wrong: the decision lands one task later than ideal, in the task that owns the lever.

ALSO NEW, and I did not know it: the same rules fire on `uiEvent === 'drop'` (core dist:5122,
  prosemirror-view dist:3902) and on an `applyPasteRules` meta (dist:5123). Dragging text in is
  a live route. Carry into Task 5's dispatch — the decision covers drop, not just paste.

T1 fix round 3/5 dispatched (documentation accuracy only): the markdownLinks clause, the
  renewed exhaustive-by-assertion count + the omitted drop trigger, `pasteInto`'s "in full",
  and the walker rule's "exactly" (falsified by code_block inside the walker's own set).
  Requirement carried: every factual claim in a comment cites the dist file and line it was
  verified against — this file has now carried three false ones.

T1 fix round 3/5 landed: commit 0458d1e. Documentation-only. 431 tests unchanged, 18/18.
  Implementer proved the documentation-only claim the right way: all three files hashed
  byte-identically before and after once comments were STRIPPED (extensions.ts 7fcb6b19…,
  schema.test.ts d5b4f25d…, doc-text-conformance.test.ts 3745bbb9…). That is a better proof
  than "I only touched comments" and better than any diff, given the filter hazard.
  Its own verification of my retraction: flipped markdownLinks on the same extension list and
  got IDENTICAL results — plain URL links, bare domain -> http://, on paste AND drop. The
  library's own docblock (dist:225-237) says markdownLinkPasteRule "links the plain URLs from
  findPlainUrls". So the retraction is confirmed from the library's own words, not just from
  behaviour.
  Comment now names NO total. Round 1 said three paths, round 2 said four — naming a count is
  what kept recreating the defect, so it describes the mechanism and its triggers instead.
  Both omissions corrected: markdownLinks gates TWO mechanisms (dist:434-435 is a TYPED
  [text](url) input rule, which the round-2 gloss omitted), and the trigger was never
  paste-only (core dist:5121-5125: 'paste' && !isPastedFromProseMirror, 'drop' via pm-view
  dist:3902, and an applyPasteRules meta). DROP CONFIRMED EMPIRICALLY LIVE.
  Walker rule: all 12 entries accounted for (3 load-bearing, 9 inert), split by the two
  genuinely different reasons — containment for the camelCase containers, SPELLING for the
  four snake_case aliases this editor can never emit. The "exactly" is gone.
  Scoped re-review dispatched (opus/high, ad104cc44c13d568b) with the standing instruction to
  verify every factual claim against dist file+line, on the stated grounds that this artifact's
  base rate of false claims is 3 across 3 rounds, and to reproduce the comment-stripped hashes
  with its OWN method rather than trusting the implementer's.

T1 round-3 re-review (ad104cc44c13d568b): all four verdicts ADDRESSED with exact citations —
  a real change from rounds 1-2 — BUT the round introduced a NEW Important defect of the very
  class it was closing. Fourth false claim in four versions.
  `extensions.ts:99-102`: "Nothing live is left unnamed above. Everything not closed by option
  is the same rule set under a different trigger, so one lever covers all of it —
  `enablePasteRules`." FALSE. There is a SECOND, DISJOINT rule set: **input rules**, gated
  separately at core dist:5221 by `enableInputRules` (its own Editor option, default true at
  dist:6147) into a different plugin, inputRulesPlugin at dist:4804. Census: 18 input rules
  across 10 extensions (bold 2, italic 2, code 1, strike 1, heading 6, blockquote 1,
  bulletList 1, orderedList 1, codeBlock 2, horizontalRule 1), all live — typing `**due soon** `
  gives bold, `# h` gives heading, `- x` gives bulletList, `> q` gives blockquote, `---` gives
  horizontalRule. The tell was INSIDE the comment: it offers "`**due soon**` arrives bold" as a
  PASTE consequence, and typing the same string does the same thing through another plugin.
  Rounds 1-2 got completeness wrong as a NUMBER; round 3 replaced the number with PROSE and got
  it wrong as prose. The defect is the completeness claim itself, in any grammatical form.
  Reviewer verified documentation-only independently with a real TypeScript printer
  (removeComments, types preserved) rather than trusting the implementer's hashes, and compared
  `git ls-tree -r` blob-by-blob across 245 files to close the scope checks without any
  diff-family tool. Both are better methods than we had been using.

THIS SHARPENS THE TASK 5 RULING RATHER THAN CHANGING IT. Input rules are exactly what Task 5's
  escape-suggestion mechanic ALREADY owns and is briefed for — typed reserved sequences. So:
    - TYPED path (18 input rules / 10 extensions): Task 5's actual briefed scope. Covered.
    - PASTE + DROP path (7 paste rules / 5 extensions): the genuinely unowned gap, which Task
      5's brief does not mention and which my earlier ruling correctly identified.
  Task 5's dispatch must carry BOTH levers (`enableInputRules`, `enablePasteRules`), name that
  its own brief covers only the first, and note the decision spans TEN extensions, not five.

Ruling: round 4 goes to a FRESH implementer at `model: fable` — one tier above the opus that
  produced four false claims. Why: the SDD spine prescribes fresh eyes plus a capability bump
  at rounds 4-5 ("a loop that survives three resumes usually means the implementer cannot see
  its own problem"), and the coordination doc's escalation rule says a task failing two fix
  rounds escalates one tier, recorded with the reason. Cost if wrong: one fable dispatch on a
  documentation-only diff.
  The dispatch does NOT ask for the sentence to be corrected — it forbids completeness claims
  in ANY grammatical form, supplies the verified census so nothing must be rediscovered, and
  puts one judgement to the implementer explicitly: whether a source comment should be
  attempting a complete account of a library's behaviour at all, given four versions have
  failed at exactly that. Eight true lines beat forty that invite a fifth correction; the
  durable analysis lives in the task report and the PR body regardless.

CROSS-LANE round 7 (lane2-plan4-b5 direct): `Queryable` MERGED — main at 974fb9a.
  `apps/server/src/db/queryable.ts`, `export type Queryable = Pool | PoolClient`, at exactly
  the path Plan 7's text was written against, so T7/T8's relative imports resolve as written.
  This DISCHARGES adaptation A15's blocker and converts T7/T8 from Wave-2-deferred to in-scope
  for this lane — the controller brief says "pick these up the moment it lands."

Ruling: T7/T8 do NOT start now; they get their own branch off origin/main AFTER the client half
  merges. Why: (1) nothing downstream is unblocked by them today — T9/T9a/T10/T11 need Plan 4's
  real `canSee` (its T7) and seed helpers plus Plan 3's proj_tickets, none of which are on main,
  so landing T7/T8 early buys no lane anything; (2) the controller brief mandates a separate
  branch per PR and the current branch is scoped "client half" — folding an attachments storage
  layer into it muddies a PR that is already 4 commits of editor work; (3) one worktree cannot
  safely run two implementer streams, and the client half is mid-flight with 10 tasks left.
  Cost if wrong: T7/T8 land later than they could have, with no lane waiting on them.

Also from lane 2, recorded:
  - `@better-auth/cli` must NEVER be added to this repo — it pins its own better-auth@1.4.21 and
    emits a 1.4 schema regardless of what the server imports, omitting `account.issuer` and its
    unique index. The replacement is `pnpm --filter @gisik-nokma/server run auth:schema`, which
    reads the installed library's own getMigrations. (Not this lane's, but it is the kind of
    thing a server task reaches for.)
  - better-auth is now configured to mint ULID ids, because `envelope.ts:79` has required
    `actorId: ulidString` since Plan 1 and better-auth's default generator produces a
    32-char mixed-case string — every event a real user authored would have been refused
    `malformed-envelope` at the door.
    CHECKED against this partition: consistent, and independently corroborating. Plan 7's own
    stub session helper already gates on `Bearer 01J9…` (plan:2801), i.e. it assumed ULID user
    ids before lane 2 made them true. Nothing in the client half needs changing.

CROSS-LANE round 8: the declaration-flag clause was already on main, landed in lane 2's own
  fix round 1 for the same reason, and written from BOTH sides — tsconfig.typecheck.json
  explains why noEmit does not suppress the declaration-emit CHECK and that deleting the line
  restores the inherited `true` from tsconfig.base.json:9 rather than leaving it unset, while
  tsconfig.json points at it from the other end. The tidy-up is blocked in both directions and
  the exact failure mode (build green / typecheck red, two configs disagreeing for no visible
  reason) is written down as the consequence. Nothing owed by this lane.
  Lane 2 confirms nothing of theirs is blocked on ObjectStore or the attachments table — their
  B1 partition waits on lane 1's proj_tickets/proj_rollups — so the T7/T8 sequencing ruling
  stands unchallenged by its most affected neighbour.

Worth keeping from that exchange, because it upgrades a claim rather than restating it: lane 2
  had argued the ULID config from the CONSTRAINT side (envelope.ts:79 requires actorId as a
  ULID, so ULIDs are forced). This lane supplied the independent half — Plan 7 assumed ULID
  user ids in its stub session gate and its fixtures before anything made that true. Two plans
  authored independently both assumed it and only the library disagreed. That reframes the
  change from "a workaround for a constraint we discovered" to "the library conforming to a
  convention the series already had", which is a stronger position and is now in lane 2's
  record.

T1 fix round 4/5 landed: commit 26a44ec (fresh implementer, model: fable, per the escalation
  ruling). 431 tests, 18/18, unchanged. Comment 58 -> 45 lines.
  No completeness claim survives in any grammatical form. Counts remain only as CENSUSES
  pinned to tiptap 3.30.5: 7 paste rules / 5 extensions (external paste, external drop, or an
  applyPasteRules meta — core dist:5121-5125) and 18 input rules / 10 extensions (from
  handleTextInput, dist:4834). Both levers named with gate lines: enablePasteRules dist:5233,
  enableInputRules dist:5221, defaults dist:6147-6148. The "five extensions" collateral now
  reads ten extensions and both levers.
  LEVER DISJOINTNESS PROVEN BOTH WAYS: `enablePasteRules: false` still bolds a TYPED
  `**due soon**`; `enableInputRules: false` still links a PASTED url. So v3's sentence was not
  merely incomplete — its practical advice would have shipped the defect through the keyboard.

  THE PATTERN NEARLY RECURRED A FIFTH TIME AND WAS CAUGHT IN DRAFT. The implementer's own draft
  claimed pasted `[text](url)` "stays literal" under `markdownLinks: false`. False — the
  plain-URL paste rule links the URL half inside the brackets (dist:474 + 446-464). Removed
  before writing; the replacement states the MECHANISM (the typed input rule is not registered,
  dist:434-435) rather than an absence of behaviour. That is the fifth instance of one impulse
  in one comment, and the first caught before it shipped — by a fresh implementer at a higher
  tier writing under an explicit ban on the sentence form rather than on the specific error.
  Evidence the escalation ruling was right: three same-tier resumes each corrected the
  instance and reproduced the impulse.

  Judgement the implementer volunteered, and I asked for it: shorter is better — every line is
  now a cited mechanism, a census of an enumerated list, or a pointer to the durable analysis,
  so no sentence becomes false even if a fifth mechanism exists somewhere in tiptap. Censuses
  kept in the file because "ten extensions, two levers" is the SIZING fact that stops Task 5
  believing one lever suffices.

OPEN QUESTION put to the round-4 re-reviewer rather than ruled unilaterally: the two censuses
  are now version-pinned PROSE that a tiptap bump can silently falsify. Implementer suggests
  Task 5 converts them into a ~20-line counting test. My inclination is T1 NOW — T1 owns
  buildEditorExtensions, already carries a set-equality test pinning the node/mark vocabularies,
  and the censuses are claims about T1's OWN output. Against: four rounds spent, cap is five,
  and this is an addition rather than a finding. Asked for the argument either way, plus the
  direct question of whether the file has stopped lying — that is what decides whether T1
  closes.

T1 round-4 re-review (a94ae04e40ce3353a, model fable): ALL findings addressed, no new
  Critical/Important. Two non-blocking Minors. Verdict on the standing question: **the file has
  stopped lying** — every sentence line-cited and verified or empirically reproduced, both
  censuses matched by an independent count (paste 7/5: bold 2 italic 2 code 1 link 1 strike 1;
  input 18/10: heading 6 bold 2 codeBlock 2 italic 2 blockquote 1 bulletList 1 code 1
  horizontalRule 1 orderedList 1 strike 1), disjointness reproduced both ways.
  THE STRONGEST VALIDATION: the reviewer LIVE-FIRE TESTED the no-completeness standard and
  found TWO unenumerated mechanisms that exist in the installed library today —
  inputRulesPlugin also fires from handleDOMEvents.compositionend and from Enter handleKeyDown
  (core dist:4844-4869), named nowhere in the comment — and NO sentence is false because of
  them. For the first time in five versions the comment's truth does not depend on its
  enumeration being complete. That is the difference between correcting an instance and
  removing the impulse.
  Branch-name discrepancy in its note resolved: this checkout is on exec/07-editor-client at
  26a44ec; `exec/07-editor-attachments` is the stale foothold branch still present locally. The
  review anchored on SHAs, so its target was correct regardless.

Ruling REVERSED on my own inclination, on the reviewer's argument, which is better than mine:
  the rule-census counting test goes to TASK 5, not a fifth T1 round. My premise was wrong —
  "a tiptap bump silently falsifies the censuses" is false, because the version pin converts
  FALSIFY into STRAND. "At tiptap 3.30.5: seven paste rules" stays true after a bump; it
  describes a version no longer installed, and the pin itself is the tell to a reader comparing
  it against the lockfile. The four prior comment versions were false the day they were
  written; a stale-but-true pinned census is a lesser and different defect class, and this is
  the first version for which that holds. Two further reasons I accept: Task 5 owns the
  decision those numbers SIZE and will flip these very tests, so a counting test written now
  enshrines numbers whose product significance is pending and then churns; and round 5 is the
  cap, an addition breaks the documentation-only clean close, and new executable lines would
  force a review cycle on new code.
  The one genuine risk in routing forward — a report-buried suggestion silently dropping — is
  answered OPERATIONALLY, not with a round: the counting test is a NAMED, LEDGERED DELIVERABLE
  in Task 5's brief. Recorded below. Cost if wrong: the censuses stay prose one task longer.

Task 1: minor (deferred): extensions.ts:118-119 "those ten extensions" — the union carrying
  live rules is ELEVEN (the input-rule ten plus `link`, which has a paste rule and no input
  rule). Not false — "those ten" is anaphoric to the enumerated census and link is named in the
  paste census five lines above — but a reader could take the count as the size of the whole
  job and miss link. Answer with a word in Task 5's brief, not a round.
Task 1: minor (deferred): extensions.ts:63 points at `.superpowers/sdd/…/task-1-report.md`,
  which is GITIGNORED — the pointer dangles in a fresh clone. The checkable content (dist
  lines) is in the comment itself, so nothing rests on it. Sweep in the final review; the PR
  body is the durable home for that analysis.
Task 1: minor (deferred): the typed path has no recording test — the two CURRENT BEHAVIOUR
  tests drive pastes only, so "Task 5's change is what makes them fail" holds for the paste
  half only. Task 5's.

Task 1: complete (commits 0b969eb..26a44ec, 4 fix rounds, review clean, 3 minors deferred)

*** TASK 5 BRIEF ADDITIONS — named deliverables, not suggestions ***
  1. DECIDE whether spec §2's "nothing silently becomes markup" reaches the PASTE and DROP
     paths at all. Task 5's own brief covers only the TYPED path (its trigger table is input
     rules, its contract is typed sequences, its mechanism reads undoInputRule's store which
     paste rules never populate). The decision spans ELEVEN extensions carrying live rules and
     TWO levers — `enableInputRules` (core dist:5221) and `enablePasteRules` (dist:5233), both
     defaulting true at dist:6147-6148, both `Editor` options that buildEditorExtensions
     structurally cannot reach. Task 12 is the implementation site: TicketEditor constructs the
     Editor.
  2. SHIP the rule-census counting test (~20 lines) so 7/5 and 18/10 are enforced against
     dependency bumps rather than asserted in prose.
  3. ADD typed recording tests beside the two paste-side CURRENT BEHAVIOUR cases, so the
     tripwire covers both halves.

REBASED onto origin/main @ dd9c221 (lane 2's envelope.ts amendments, all three, final from
  that lane). Conflict on pnpm-lock.yaml ONLY — exactly the collision the pre-flight table
  predicted, resolved by its prescribed method: take one side wholesale (`git checkout --ours`,
  i.e. upstream's) and REGENERATE with `pnpm install`, never hand-merge, because CI runs
  `--frozen-lockfile` and a hand-merged lockfile fails the gate auto-merge depends on.
  Verified after: `pnpm install --frozen-lockfile` -> "Already up to date"; full gate 18/18;
  editor 24, rule-engine 115, server 102 (was 93 — lane 2's additions), app-core 5, ui 31.
  Branch is 8 commits on top of dd9c221. Only remaining peer warning is lane 2's known
  better-call/zod-4-vs-3 one; the vite-major warning A6 predicted still never materialised.

LANE-CONTEXT.md CORRECTED — the instrument I gave every subagent was unsound.
  It said "rg is proxied to grep; use `grep -rn` with explicit paths." But `grep -r` over a
  DIRECTORY also silently returns nothing here — confirmed twice on this branch and once in
  lane 2, where it cost a reviewer a full redo of every sweep. The general form, which is the
  part that matters: **a silent empty result is indistinguishable from a true negative, so
  recursion is the wrong instrument for any claim of the form "this appears nowhere."**
  New guidance: enumerate files first (`find … -print0 | xargs -0 grep -n`), or a glob that
  expands to files before grep sees it, or the Grep tool. Never rest a negative on a bare -r.
  Also folded in the better methods this branch's reviewers found: prove comments-only with a
  real TypeScript printer over the parsed AST (regex/token scanners desync on backticks inside
  comments), and prove commit scope by comparing `git ls-tree -r` blob-by-blob.
  RE-VERIFIED my own at-risk negative on the sound instrument: "nothing in the client partition
  imports a type from apps/server" — 75 files enumerated explicitly across packages/editor and
  packages/domain, zero hits. The claim I made to lane 2 holds.

INTERRUPTION (2026-08-28 -> 2026-08-31): the T3 implementer died on a weekly-pool rate limit
  (HTTP 429, opus) before doing any work — no commits, no report file, working tree clean.
  Verified rather than assumed: branch still exec/07-editor-client, 8 commits, `git status`
  clean, no task-3-report.md on disk. Nothing to recover or unwind.
  The coordination doc's budget ruling governed the gap and needed no deviation: "budget
  pressure is never grounds to thin a gate — the sanctioned response is to DEFER work, never
  to skip a review, drop a refuter, or de-escalate below a class floor." The lane simply
  stopped. It did not, for example, retry T3 at a cheaper tier.
  Limit reset 2026-08-31. Resumed at full depth.
  Rebased again: origin/main had moved dd9c221 -> 2bc2e13 while the lane was stopped. That
  commit touches ONLY the coordination doc (verified by file list), so the rebase was clean
  with no conflict and nothing in this branch's surface changed. Gate re-verified 18/18,
  --frozen-lockfile clean.

T3 landed: commit fd796aa. Gate 18/18; editor 24 -> 37; packages/ui 31/31 with
  packages/editor/src now inside the colour scanner's scope; repo total 506. Ten mutants,
  each observed RED and restored by md5.
  CENSUS UNCHANGED — 7 paste rules / 5 extensions, 18 input rules / 10 — re-run on a REBUILT
  dist with `image` confirmed present in the resolved list, so extensions.ts's comment stayed
  true and was not touched. The hazard I carried into the dispatch was real to check and
  negative in fact; recording the negative so nobody re-checks.

  Adaptation (shipped code beat the brief), and the METHOD is the notable part: the brief's
  `wrap` validation inside the node-level `parseHTML().getAttrs` was DEAD CODE —
  `injectExtensionAttributesToParseRule` (core dist:1452-1472) spreads per-attribute results
  AFTER it, so the per-attribute default read the bare `wrap` attribute the brief's own
  renderHTML emitted. The implementer proved it by SHIPPING THE BRIEF VERBATIM FIRST and
  watching `wrap="float-up"` beat `data-wrap="block"`, then moved validation into each
  attribute's own parseHTML/renderHTML. Shipping the plan to watch it fail, rather than
  reasoning about whether it would, is the strongest form of the adaptation-map law.

BY-CATCH (coordination doc) — caused by MY OWN DISPATCH WORDING, and it will recur four more
  times if unfixed. `colour-scan.ts` walks raw lines and has NO NOTION OF A CSS COMMENT, so a
  stylesheet in its scope **cannot name a colour function even in order to prohibit one**. The
  implementer's first editor.css comment enumerated the banned forms exactly as my dispatch
  worded them, and turned packages/ui red on four lines of its own prose.
  FIXED IN LANE-CONTEXT.md so T12/T12b/T13/T13a do not repeat it: keep the stylesheet
  structural, use currentColor, and in the file's own comments state the rule and where it
  lives (colour has one origin, packages/ui/src/tokens.ts, amendment 11) WITHOUT enumerating
  the banned forms — the enumeration belongs in the scanner and in the dispatch, neither of
  which is scanned. The general shape, worth the coordination doc: a line-scanning checker
  cannot distinguish a prohibition from a violation, so any document inside its scope must not
  quote the thing it forbids.
  Also confirmed: lane 4's `relative(REPO_ROOT, path)` fix has LANDED — the red named the
  package, as designed.

Open for the reviewer, both flagged by the implementer rather than hidden:
  - `group: 'block'` with two FLOAT wrap modes is an untested layout contract; T12's wrap
    picker is the first place a human sees it. Cheap now, expensive after Task 6 pins walker
    behaviour around it. I asked for a read; I am ruling.
  - No ProseMirror `validate` on `wrap`, deliberately, citing the heading-levels precedent
    (value validation does not live in this schema; layer 3 owns the stored-document question).
    Asked whether that is consistent or a gap.
  - The census is STILL version-pinned prose rather than a test — second time it has been run
    by hand. Already a named deliverable in Task 5's brief additions.

T3 review (af4c7b32e7af65bed): spec ✅; task quality NEEDS FIXES. Two Important, both comments.
  Engineering independently confirmed in every part — reviewer read core's merge order itself
  (dist:1452-1471), reproduced the dead-code diagnosis, fed the replacement TEN hostile parses
  and watched every one coerce, re-derived both censuses to the per-extension figure, and
  matched all four pristine md5s against the shipped bytes. doc-text.ts proven untouched by
  md5 against origin/main. Set-equality confirmed still set-equality in both directions.
  Singled out as unbriefed and genuinely valuable: the `img[data-attachment-id]` discriminator
  (a foreign <img> produces ZERO image nodes — pasted remote images cannot enter the doc
  carrying a third-party URL) and the `src` null-guard (a malformed doc cannot become a real
  HTTP request to /v1/attachments/null).

IMPORTANT 1 — and it is a TASK 1 defect surfaced by TASK 3's reviewer. `ticket-image.ts:77-83`
  claims ProseMirror "validates attribute NAMES, not their values (the same reason `heading`
  cannot pin its levels)". FALSE in the installed stack, proven by construction:
  prosemirror-model dist:2058-2066 runs `attrs[attr].validate(values[attr])` from Node.fromJSON
  (dist:1542), and @tiptap/core dist:1491 forwards an extension attribute's `validate` into the
  schema spec. Built both ways: shipped `wrap` spec has keys ['default'] and accepts
  nodeFromJSON with wrap:'float-up'; re-declared with `validate` it has ['default','validate']
  and throws RangeError on the identical JSON.

Ruling: the DESIGN stands — coerce on the parse path, do not throw on the JSON path. Why:
  `validate` throws at LOAD, so one junk-wrap document would fail the whole editor hard rather
  than degrade to `block`, and that trade is an owner ruling, not something to flip under a
  reviewer finding. Only the stated REASON changes. Cost if wrong: a stored junk wrap renders
  as `block` instead of refusing; reversible in one line if the owner wants layer-1 rejection.

Ruling: the fix covers ALL THREE sites, including Task 1's (schema/extensions.ts:127-131 and
  test/schema.test.ts:137), though T1 is closed. Why: it is ONE claim expressed in three places;
  fixing only T3's leaves two false and a cross-reference aimed at them; and leaving a
  known-false statement in the schema's single-origin file because a task boundary closed is
  exactly the deferral failure Plans 1 and 2 each recorded against themselves. Cost if wrong:
  T3's diff touches two files T1 owns, which the reviewer already has context for.

IMPORTANT 2 — editor.css:3 names a bare colour keyword while :8 claims the note spells none of
  the forms it prohibits; falsified within six lines, and it plants a KNOWN FUTURE FAILURE in
  packages/ui's suite for when Plan 6 T2 widens findColourLiterals. MY DISPATCH WORDING CAUSED
  IT — I enumerated the banned forms with examples and the implementer transcribed them
  faithfully. LANE-CONTEXT already corrected for the four remaining CSS tasks.

Ruling: `group: 'block'` STAYS (reviewer's argument, which I accept over the implementer's
  concern). Why: `inline-left`/`inline-right` name text-WRAP behaviour, not inline FLOW — a
  block atom with a CSS float is how every mainstream editor implements it; an inline node
  would give an image travelling with the characters like an emoji, a different feature the
  vocabulary does not name and one that makes `block` incoherent as a third member of the same
  union. The cheap-now argument cuts TOWARD keeping it: a block atom contributing '' is the
  simple case Task 6 wants to pin, and an inline image would also move where block separators
  land in that walker. Cost if wrong: a mid-sentence icon needs a second node later, not a
  re-grouping of this one.

Ruling: no ProseMirror `validate` on `wrap` is CONSISTENT, not a gap — the reviewer confirms
  the practice holds package-wide (no `validate` anywhere in packages/editor/src;
  VersionedDocument declares schemaVersion the same defaulted, unvalidated way). It was the
  rationale that was wrong, not the practice.

Task 3: minor (deferred): float containment — .editor-image--inline-left/right float with
  nothing establishing a block formatting context, so the wrap bleeds past the intended
  paragraph. Correct home is T12's editor-root styling (`display: flow-root` on the ProseMirror
  container), NOT editor.css. Carry into T12.
Task 3: minor (deferred): `alt` is uncapped; escaping is DOMSerializer's so no injection. The
  length question lands on T12's picker. Carry into T12.
Task 3: minor (deferred): the report's mutant-table denominators drifted from the shipped file
  (13 `it(` blocks vs cited 11/12) — consistent with the file growing during TDD, but the
  stated denominators no longer describe what shipped. Record nit only.

T3 fix round 1/5 dispatched: the three-site rationale correction, the editor.css example word,
  and the uncoerced `data-wrap` (two spellings of one fact that disagree — this branch's own
  theme in miniature, and a one-line close).

T3 fix round 1/5 landed: commit 26d6073. Gate 18/18; editor 37 -> 38; ui 31/31; census
  re-run on the rebuilt dist and UNCHANGED again (7/5, 18/10), so extensions.ts's census
  sentences were not touched.
  The implementer did NOT take the `validate` finding on authority — it read all three dist
  sites and built it both ways in one process before accepting it. Correct instinct: a finding
  handed down deserves the same standard as one raised.
  ITS OWN LATE CATCH, which is the round's most interesting moment: its FIRST corrected comment
  asserted "Heading declares none" as fact, and nobody had observed it — level-99 survival
  proves no `validate` REJECTS 99, not that none EXISTS. It observed before reporting:
  heading.spec.attrs.level keys are ["default"], and no node in schema v1 declares a `validate`
  on any attribute, so `wrap` would be the first. A correction to an unverified claim that was
  itself briefly unverified, caught inside the same round.
  Deviation from my "confirm 37 holds": 38, and justified. No existing case can produce a junk
  stored wrap — the two commands refuse one, which is what they are for — and folding the
  assertion into the existing junk-node case would have kept the number while blinding each
  claim to the other's failure. Additive, nothing deleted, per the standing ruling.

Ruling REVISED — the rule-census counting test moves from Task 5 to **TASK 4**, the next task
  that adds an extension. Two things changed since I routed it to Task 5 on the reviewer's
  argument:
  (a) FRICTION IS NOW MEASURED, not predicted: the ~20-line census script has been hand-run
      FOUR times across two tasks, and T4 (mention node) and T5 (escape suggestion) each add
      an extension, so two more hand-runs are already guaranteed.
  (b) THE CHURN ARGUMENT IS DEAD, and this is the part that actually settles it. The reviewer
      argued a counting test now "enshrines numbers whose product significance is pending, then
      churns immediately" when Task 5 decides the paste question. It cannot: the census counts
      rules DECLARED on extensions via getExtensionField, while Task 5's levers
      (`enablePasteRules` / `enableInputRules`) are EDITOR options that gate plugin
      REGISTRATION. The extensions still declare their rules either way, so the counted numbers
      are invariant under Task 5's decision. The churn the argument feared does not exist.
  What survives from the reviewer's case is that a version-pinned census STRANDS rather than
  falsifies — true, and a reason this was never urgent, not a reason to keep hand-running it.
  Cost if wrong: ~20 lines land one task earlier than planned in a file T4 already opens.
  Task 5's brief additions keep items 1 and 3 (the paste/drop decision, typed recording tests);
  item 2 moves to T4.

Open, unruled, and going to the coordination doc as a ruling-request: should a document with an
  unreadable stored `wrap` FAIL LOUDLY rather than degrade to `block`? The design ruling above
  settles what layer 1 does; nobody has decided what the product wants. Conservative reading
  taken (coerce): `wrap` is a presentation preference, not a claim about the work, so invariant
  4 is not engaged — the image is real and its attachmentId intact; only the float preference
  is unreadable. Throwing would refuse to show a real document over a display attribute. One
  line in either direction, reasoning written at the point of change.

T3 round-1 re-review (a63548ad70c9efee2): all three findings ADDRESSED; NEW Important in the
  fix. Verified with better instruments than the report offered: comments-only proven by
  TypeScript printer emit-hash on BOTH the .js and the .d.ts (so the type surface is covered
  too); the single-hit "attribute NAMES" sweep done by explicit file enumeration, not -r;
  editor.css checked by running the SCANNER'S OWN REGEX over the file rather than re-running
  packages/ui, so the result is a property of the content; census re-derived to the
  per-extension figure (29 resolved extensions, `image` present and last, contributing 0 to
  both); M11 reproduced in-memory and its rendered HTML matched the report's quoted red
  byte-for-byte.
  THIRD LIVE CONFIRMATION OF THE DIFF HAZARD, and the best-documented one: `diff` reported the
  two commit TREES as identical, which is how the reviewer knew to fall back to blob-by-blob
  `git ls-tree` comparison. 264 entries per side, exactly five blobs differ.

NEW IMPORTANT — and it is a DIFFERENT failure from the one round 1 fixed, which is the point.
  The replacement rationale's MECHANISM is true (verified line-exact: prosemirror-model
  dist:2058-2066 runs validate from Node.fromJSON at dist:1542; @tiptap/core dist:1491 forwards
  it). Its CONSEQUENCE is false. `ticket-image.ts:88-90` and `extensions.ts:137-138` say a
  junk-wrap document "would fail the whole editor hard". It would not: @tiptap/core dist:593-600
  wraps nodeFromJSON in try/catch, and with `enableContentCheck` false — the default at
  dist:6150, set NOWHERE in this repo, and create-editor.ts:9 is the only `new Editor(` site —
  it emits ONE console.warn and returns createNodeFromContent(""). THE WHOLE DOCUMENT IS
  REPLACED BY AN EMPTY PARAGRAPH. Only `enableContentCheck: true` actually throws.
  So the real trade is "silent total document loss with a console warning" vs "degrade to
  block" — quieter and WORSE than the comment claims, and it STRENGTHENS the design ruling
  rather than weakening it. schema.test.ts's parenthetical is already correct (it claims only
  the throw, no editor-level consequence) and must not be touched.

THE GENERALISATION, worth the coordination doc: **verifying a mechanism is not verifying its
  consequence.** Round 1 did exactly what was asked — replaced a false claim with a mechanism
  cited line-by-line against the library. What it did not do is check what that mechanism MEANS
  in this product's configuration, and the answer lived in a different file, behind a default
  option, three layers up from the code cited. The citation that proves the mechanism says
  nothing about the consequence. Three distinct shapes have now come out of this one
  explanatory paragraph: a false claim, then a true mechanism with an assumed consequence.
  Operative form for every later dispatch: for each sentence, ask separately what was VERIFIED
  and what is being INFERRED from it — cite both, or claim only the first.

Task 3: minor (deferred): editor.css:11 names `currentColor` — not a CSS named colour, and the
  mechanism the note itself prescribes, but the one token in that file a widened
  findColourLiterals could match. Carry to Plan 6 T2 rather than pre-emptively rewording.

T3 fix round 2/5 dispatched: two sentences, one clause each, plus the generalisation above.

T3 fix round 2/5 landed: commit 2591d98 (amended pre-push to correct a count). 18/18, editor
  holds at 38, ui 31/31. Documentation-only proven by TypeScript printer both sides.
  The implementer REFUSED TO INHERIT the consequence — traced dist:6419 -> 1052-1058 ->
  592-602, confirmed the default at dist:6150, enumerated the single `new Editor(` site with
  find|xargs — and the refusal PAID: it built the case on a document with TWO PARAGRAPHS
  EITHER SIDE of one bad image, and both paragraphs vanish. **The text destroyed has nothing
  to do with the attribute that failed.** Materially worse than "the document is replaced by
  an empty paragraph", which neither the reviewer nor I had established.

*** THE GENERALISATION THAT SUPERSEDES THE OTHERS — coordination doc, verbatim ***
  The implementer announced "three shapes" and enumerated two, then caught that the missing one
  was its OWN: "Heading declares none" shipped in 26d6073 as an asserted fact inside the very
  correction that replaced shape 1, and was only shown true afterwards. Its formulation:
  **"A true sentence asserted without evidence is the same failure as a false one; it just
  settles the bet in your favour."**
  This reframes every instance this branch has catalogued. We diagnosed each as "the claim was
  false." The actual defect is that the claim was UNEVIDENCED — falsity was incidental, and the
  ones that happened to be true were the same error with a luckier outcome. That is why
  correcting instances never stopped the recurrence: each correction was itself asserted.
  Operative test, now carried in every dispatch: for each sentence, what did I VERIFY and what
  am I INFERRING? Cite both, or claim only the first.

T3 fix round 3/5 dispatched — the implementer's own concern 1, one assertion. The corrected
  consequence turns entirely on `enableContentCheck: false`, a default NO TEST ASSERTS at one
  `new Editor(` site NO TEST GUARDS. A later task setting it true silently falsifies a shipped
  comment — the fourth shape of this paragraph, and the first no reviewer could catch by
  reading. Required as a check on the RESOLVED editor option, not on the absence of a key in
  the helper's source: absence proves nothing about what tiptap resolved, which is this
  paragraph's entire history in one sentence.
  It was right to flag rather than smuggle a test into a documentation-only round; that is why
  this is its own round rather than a final-review finding.

COUNTED FROM THE TREE (not carried forward), per the new verification rule — and the rule
  immediately caught me. I had been reporting "506 repo total" and "editor 38". Forced run:
  domain 216 · rule-engine 115 · server 102 · editor 39 · ui 31 · app-core 5 = **508**.
  Both my numbers were stale: editor is 39 (T3's round-3 assertion landed), and domain is 216
  against the 163 I carried, because lane 1's work reached main and I rebased through it. My
  figures were facts about a moment I no longer held — exactly the failure the rule names.
  LANE-CONTEXT gained two rules: count from the tree at the moment of the claim, never add a
  remembered delta to a remembered base; and every "X appears nowhere" claim ships a POSITIVE
  CONTROL from the same run, because a silent-empty and a true negative are indistinguishable
  from inside the run. Re-ran the apps/server null sweep with a control: control finds
  'export' across the enumerated files, sweep returns NULL. The negative now means something.

CROSS-LANE round 9 — three obligations on work not yet run:
  1. BINDING ON THE FINAL WHOLE-BRANCH REVIEW: one worktree per agent for MUTATING fan-outs
     (coordination doc b0ef5f5). Lane 4 ran thirteen concurrent mutation-testing agents against
     one shared worktree; their transient states were read by another reviewer as tampering —
     "a stat-invisible process planting defects with git status clean throughout" — and came a
     step from being filed as a security finding. My final review's adversarial refuters
     MUTATE, so this is exactly that shape. Read-only lenses may still share a tree.
     ACTION: dispatch every refuter with `isolation: "worktree"`; lenses without.
  2. NO FAN-OUT AGAINST A POOL THAT CANNOT FINISH IT. A complete final review is measured at
     ~$117 (four lenses $78.70/559 requests; eight refuters + triage $38.50/399). Lane 4 once
     dispatched four lenses into an exhausted pool, the limit killed them partway, $27 bought
     no gate, and the review re-ran in full three days later. This lane already lost a T3
     dispatch to that limit. ACTION: check remaining pool against ~$117 BEFORE dispatching the
     final review; deferring and recording is sanctioned, starting what cannot finish is not.
  3. Batching does not bind: this lane is Plan 7 client + Plan 8, closer to a full plan lane
     than to the periphery, so the default two-fan-out shape fits. Revisit only if this ships
     several small branches rather than one or two coherent ones.

MODEL-TIERING AUDIT — the peer is right that this lane runs ~27:1 opus:sonnet, and the table
  has assigned sonnet to transcription/scaffolds/barrels/catalogue since 2026-08-28. Audited
  honestly, dispatch by dispatch:
  DEFENSIBLE and staying: every planted-defect-dense implementer (T2/T11a, T3, and T4/T5/T12/
  T12a/T12b/T12c/T13/T13a to come) — the table pins "fixture authoring and planted-defect
  design" at opus/high, and this partition is almost entirely that; every per-task reviewer and
  scoped re-reviewer — "per-task reviewers | opus | high" is a class FLOOR and the rule forbids
  de-escalating below one; T1 round 4 at fable — the escalation rule prescribes it by name.
  GENUINELY OVER-TIERED, and corrected going forward:
    - T6 (docToPlainText conformance) -> **sonnet**. The adaptation map traced all 14 assertions
      by hand and found the suite green-on-arrival; it is transcription against a shipped
      walker.
    - the closing catalogue task -> **sonnet low-medium**, as the table says in terms.
    - T15's vite/webview bundle scaffolding portion -> **sonnet** for the config and entry
      wiring; the bridge protocol stays opus (it carries a parse contract and planted defects).
  ARGUABLE, and I am recording rather than defending: T1 was a scaffold task the table would
  have put at sonnet. I chose opus on failure-cost grounds — eleven tasks inherit its schema —
  and it produced the `underline` and non-compiling-`typeText` findings. I still think it was
  right, but it is the dispatch a strict reading of the table would have tiered down, and one
  data point does not settle it.

CORRECTION — three of my own errors, caught by lane 4's coordinator and by the recount:

1. MY 508 WAS NOT MAIN'S 508. Mine was a fact about my tree at base 2bc2e13; theirs about
   b0ef5f5. Different package sets (mine had editor 39 and no sync-client; theirs the reverse)
   and every shared package LOWER than main's, which is the opposite of what a tree rebased
   through main would show — the tell I should have read myself. Two absolutes about two
   different moments are not a cross-check however equal they look. Citing theirs as
   confirmation would have manufactured corroboration out of an arithmetic coincidence.

2. MY ATTRIBUTION WAS FALSE. I wrote that domain moved "because lane 1's work reached main and
   I rebased through it." Lane 1's Plan 3 work has NOT reached main — verified: the only domain
   change on main since my old base is b62be74, lane 4's Plan 10 prefix (contest vocabulary,
   clock-skew, submit.ts). This is worse than the count error: an unevidenced causal claim,
   and a false one — the exact shape my own T3 implementer named an hour earlier ("a true
   sentence asserted without evidence is the same failure as a false one; it just settles the
   bet in your favour"). Mine did not even settle in my favour. Adopting a rule is not the
   same as applying it.

3. I NEARLY REPORTED A MID-REBASE COUNT. Rebasing onto b0ef5f5 conflicted on pnpm-lock.yaml;
   I ran the forced count anyway and got editor 16 at "commit d30a375" — a coherent-looking
   number, at a real sha, from an incomplete tree. I caught it because 16 contradicted a
   figure I had just verified; had it been plausible I would have shipped it.
   REFINEMENT TO THE COUNTING RULE, offered back: naming the commit is NOT sufficient. A
   mid-rebase, mid-merge or dirty tree has a sha and is not a state anything can be counted at.
   The rule needs "and confirm no operation is in progress" — `git status` clean and no rebase
   in flight — before the count means anything.

REBASED onto origin/main @ b0ef5f5 (was three commits behind: b62be74 lane 4's Plan 10 prefix,
  ed5dbfb, b0ef5f5). Lockfile conflict again, resolved the prescribed way — take one side
  wholesale, regenerate with `pnpm install`, never hand-merge.

COUNTED AT `2a8fa3b`, base `b0ef5f5`, 12 commits on branch, tree clean, no operation in flight,
  --frozen-lockfile clean, forced run:
    domain 241 · rule-engine 128 · server 106 · editor 39 · ui 31 · sync-client 8 · app-core 5
    = **558**, 21/21 turbo tasks (18 -> 21: lane 4's sync-client).
  The decomposition now checks out against main's rather than coinciding with it:
  main's 508 + my editor 39 + my domain 11 (T2's 6 + T11a's 5) = 558, and every shared package
  equals main's exactly (rule-engine 128, server 106, ui 31, sync-client 8, app-core 5;
  domain 230 + 11 = 241). That is a decomposition that can be checked, not a total that can
  only be compared.

T3 fix round 3/5 landed. `enableContentCheck` pinned on `editor.options.enableContentCheck` —
  the RESOLVED option, not the absence of a key — with a second half driving the consequence so
  the pin and the comment cannot drift apart. M12 red on both halves, restored under md5.
  Editor 38 -> 39.

*** MY ERROR, and it is the exact hazard I had been warned about an hour earlier. ***
  The implementer reported that rtk's filtered git output "fabricated a repository state" — a
  rebase in progress, detached HEAD, 13 staged additions, a UU pnpm-lock.yaml conflict — and
  that `rtk proxy git status --porcelain=v2` showed a clean attached tree instead.
  That diagnosis is almost certainly WRONG, and the true cause is me: **I ran `git rebase
  origin/main` on this worktree while that implementer was live in it.** The round-3 dispatch
  went out before the rebase; the completion notification arrived after. So the states it saw
  were REAL and TRANSIENT — my conflicted mid-rebase, then my finished clean tree — observed at
  two different moments and appearing contradictory.
  This is precisely the shape lane 4 hit with thirteen concurrent mutators in one worktree,
  which the coordinator had relayed to me an hour before: agents observing each other's
  in-flight states and reading them as tampering. I recorded that warning, applied it to my
  FUTURE final review, and then violated the same principle immediately in the present.
  What the implementer did right, and what kept this cheap: it did NOT run `git rebase --abort`
  or resolve the phantom conflict. Either would have damaged a healthy branch. It re-checked
  with a more resistant instrument and reported instead of acting.
  LANE-CONTEXT gained a "the worktree is single-writer" section: never mutate the tree while an
  agent is live in it, and if you are an agent seeing an impossible state, re-check and report
  rather than running a destructive recovery — a state that looks impossible is more often a
  concurrent writer than a corruption.
  NOT adopting the implementer's proposed rule that all git answers route through `rtk proxy`.
  The evidence for it is this incident, and this incident has a simpler explanation that does
  not implicate the proxy. `--porcelain=v2` remains worth preferring for machine-read state.

Implementer's own process note, worth the catalogue: its first four-pair blob comparison used a
  shell loop whose word splitting silently failed, and it confidently reported ALL FOUR PAIRS
  DIFFER — a data-loss report about a rebase that had lost nothing. Caught only because the
  four "new" listings hashed identically to each other while the tip pair contradicted a value
  it had verified independently. Its formulation: **a verification harness that fails open is
  as dangerous as the thing it verifies.** That is the same species as the silent-empty grep
  and the mid-rebase count: an instrument whose failure mode is a confident wrong answer.

Carried to T12 and T15 (their dispatches must name it): the `enableContentCheck` pin guards
  TODAY'S SINGLE construction site. T12's TicketEditor and T15's webview entry each create a
  new `new Editor(`. Both dispatches carry the same resolved-option assertion, or the guard
  narrows to a test helper while the comment it protects talks about the product.

Carried to T4: concern 2 is half the argument for the census counting test — version-pinned
  prose is REBASE-FALSIFIABLE and nothing goes red. The implementer's editor.css claim about
  the scanner would have become false BY ARRIVING had lane 4's regex widening landed in this
  rebase. It re-verified only because it went looking.

OWNER RULING — Fable narrowed to absolute necessity (coordination doc #27/#28). Recorded, and
  it corrects my own audit.
  New composition, binding on this lane's final whole-branch review:
    - three of the four reading lenses -> **opus at `max`** (they were $78.70 of the measured
      $117 and are the most substitutable)
    - the **mocked-contract lens** stays **fable**
    - the **adversarial refuters** stay **fable** — the tier is demonstrably the product there
      (a refuter found the §11 forgery by COMMITTING it over the shipped door rather than
      reasoning about it)
    - **floor-list reviewers** stay fable; this lane's floor-list tasks are Plan 7 T9 and T11,
      both Wave 2, so none binds this branch
  Not a licence to tier down at discretion: class floors hold, escalation still runs upward,
  and deferral remains the answer to budget pressure everywhere the ruling does not name.

MY AUDIT WAS WRONG, and so was the sentence I sent about it. I told the coordinator "the one
  fable dispatch" — echoing their singular without checking my own record. Counted from the
  ledger with a positive control: **TWO**.
    1. T1 round 4 IMPLEMENTER (a02cb988e0868df47) — an escalation the rule prescribes by name
       (rounds 4-5: fresh implementer, one tier up, after three failed resumes). STAYS
       JUSTIFIED under the new ruling, which does not touch escalations.
    2. T1 round-4 RE-REVIEW (a94ae04e40ce3353a) — a READING LENS. Not a refuter, not the
       mocked-contract lens, and T1 is not floor-list. Under the new ruling this is
       **opus/max**, and it was over-tiered when I dispatched it.
  My own model-audit entry above (the one I sent the coordinator) names only the implementer
  and silently omits the reviewer — an incomplete count presented as a complete one.
  This is the third time today I have asserted an absolute about my own work without counting
  it, and the first where I INHERITED the number from someone else's sentence rather than
  inventing it. Echoing a count is asserting it. Worth noting the re-review in question was
  the one that live-fire tested the no-completeness standard and found two unenumerated
  mechanisms — so it was valuable; but the ruling is about substitutability, not value, and a
  reading lens is substitutable by the ruling's own definition.

BEFORE THE FINAL REVIEW DISPATCHES (checklist, so it is not rediscovered):
  - check remaining pool against the measured price, which is now BELOW ~$117 since three
    lenses drop from fable to opus/max; defer-and-record rather than start what cannot finish
  - every adversarial refuter gets `isolation: "worktree"` — they mutate, and thirteen
    concurrent mutators in one tree got read as tampering in lane 4
  - read-only lenses may share a tree
  - the worktree is single-writer: no controller-side rebase or checkout while any of them is
    live (my own error, this branch, an hour ago)

T3 round-3 re-review (af91d80bc738fb6cf): ADDRESSED, no new breakage. Task 3 CLOSES.
  The verdict that matters: **the assertion pins the claim, not a neighbouring fact** — the
  first round on this task to reach that. Half 1 pins the hinge on the RESOLVED option and is
  self-proving (an absent key would read `undefined`, and `undefined !== false` would redden
  it, so a passing `.toBe(false)` can only mean tiptap resolved the default). Half 2 drives the
  consequence down the product's own code path.
  Three mutants, and two of them earn their place:
    B — option true AND half 1 flipped, to expose half 2 alone: RED with the tiptap error
        thrown out of `new Editor`. Proves the halves are INDEPENDENTLY sensitive rather than
        half 2 riding on half 1 aborting the case first.
    C — swap the unloadable node for a LOADABLE one, option left false: RED on the document
        comparison. Proves the consequence assertions discriminate a surviving document from
        an emptied one rather than agreeing with the sentence.
  Reviewer read the dist rather than trusting the citation and established something the
  implementer had not claimed: `marquee` is not an ANALOGUE of the comment's path — a `validate`
  throw and an unknown-type RangeError originate in the SAME `try` statement (core dist:592-602)
  and reach the SAME catch. So the test enters the comment's exact path one line earlier.
  Restoration proved three ways per mutation (md5, `git hash-object` against committed blobs,
  and `porcelain=v2` empty) — never a diff. Scope closed by `comm -3` over sorted `ls-tree`
  listings, 291 entries per side, exactly one path differs.

Task 3: complete (commits f840f4e..2a8fa3b, 3 fix rounds, review clean, 4 minors deferred)

Carried forward from the re-review's out-of-scope notes:
  - `src/schema/extensions.ts:130-146` (the heading-level rationale) rests on the SAME hinge and
    is now protected by the same pin — a positive the implementer did not claim.
  - the comment's final clause ("only enableContentCheck: true makes construction actually
    throw") is the one sentence no shipped assertion drives; the reviewer verified it by reading
    (core dist:6416-6439 -> emit contentError -> default onContentError rethrows) and mutant B
    observed it. True, and its verification is a counterfactual rather than the comment's hinge.
  - T3's commit message says "Gate 18/18", pre-rebase-true and post-rebase-stale (21/21 now).
    Cosmetic, inside an immutable commit message; the report's reconciliation section corrects
    it. Recorded rather than rewritten — history surgery for a stale count is not worth it.

T4 landed: commit 8d883e0. Gate 21/21; editor 39 -> 64 (counted from the run); ui 31/31.
  Twelve mutants, each restored under md5.

*** THE MOST SERIOUS FINDING ON THIS BRANCH. *** The brief's node-level parseHTML().getAttrs is
  the Task-3 library-ordering trap again, and worse. Shipped verbatim and OBSERVED: a hostile
  `<span data-mention-user-id="…A" userId="…B" label="Mallory">@Anselma</span>` parsed to
  `{userId: "…B", label: "Mallory"}` — **the stored document naming a DIFFERENT PERSON than the
  one displayed, in exactly the field notifications read.** That is mention-attribution forgery
  reachable from pasted HTML. The brief's renderHTML also emitted `userid=`/`label=` beside the
  data- forms, so the round-trip fed itself. Both attrs now carry per-attribute
  parseHTML/renderHTML, per the TicketImage pattern.

BOUNDED — and this is why the check was worth running rather than assuming. Swept every
  remaining in-scope brief for `getAttrs` with a WORKING positive control (my first control used
  `grep -lc`, whose flags conflict, and returned zeros for files that did contain the term — a
  broken control reads exactly like a confirmed negative, which is instrument failure #5 on this
  branch). Corrected result: `getAttrs` and `parseHTML` appear in EXACTLY TWO Plan 7 briefs,
  T3 and T4 — precisely the two that hit the defect, both now closed. T5, T6, T12, T12a, T12b,
  T12c, T13, T13a and T15 all show zero for both. The plan defect is bounded at two instances
  and no remaining task inherits it.

Empty label — implementer chose REFUSE + TRIM, and the trim is the load-bearing half: a name of
  three spaces passes the walker's `length > 0` and prints `@   `. `mentionLabelOf` trims and
  returns null; `items` filters so an unlabelable candidate is never OFFERED (no silent no-op
  click); `command` refuses as well. Scope stated narrowly — label only, insert path only, with
  the JSON and HTML doors pinned OPEN per ticket-image.ts's reasoning. Refusal rather than
  fabricating a stand-in name follows insertTicketImage's precedent.

Census UNCHANGED and now A TEST with per-extension maps (the deliverable I moved forward from
  Task 5). `@tiptap/suggestion` reaches core via addProseMirrorPlugins (dist:5243), a different
  branch from the two rule gates, which is why adding it moved nothing. M1 (markdownLinks:true)
  reddens the census test — the harness can fail, which is the whole point of it existing.

THREE SELF-REPORTS the implementer volunteered rather than claiming credit for — the behaviour
  the falsifiability law is supposed to produce, arriving without being asked:
  - M4 (delete the `command` guard alone) leaves all 64 green — unreachable while the `items`
    filter stands. Said plainly in the code rather than presented as coverage.
  - M9: re-adding the popup's Escape branch changes NOTHING, because @tiptap/suggestion owns
    Escape (dist:129-138) and calls dispatchExit unconditionally. So **the brief's "planted
    defect: Escape" is not the refusal the brief says it is** — its only fail-first evidence was
    COLLECTION failure against the pre-task tree, not a real timeout. A brief-mandated planted
    defect that is vacuous. By-catch.
  - It caught one of its OWN tests being vacuous: it waited on `.mention-popup`, which appears
    synchronously with zero rows, so it passed without exercising anything. Rewritten to click
    slot 0.

Two defects the brief did not know about: the popup swallowed Enter/arrows while empty (async
  `items` means empty from the moment `@` is typed — the editor looked frozen), and the brief's
  export line was a TS2300 duplicate-identifier error because `MentionCandidate` already had an
  origin in schema/extensions.ts. Origin moved to mention.ts; barrel exports it once.

Raised BY the implementer FOR me rather than fixed — put to the reviewer as a candidate finding:
  a candidate with a BLANK `userId` is guarded by nothing. My inclination is that it must close:
  a mention whose userId is blank addresses nobody, and that is the field notifications read, so
  it is the empty-label hazard with a symmetric fix. Asked the reviewer whether the one-line fix
  is genuinely one line or has a shape I am not seeing.

T4 review (a26cb9293c66fefe1): spec ✅; task quality NEEDS FIXES, "scoped to Important #1 only",
  with the reviewer explicitly asking that the rest be read as approval-grade rather than a
  hedge.
  It reproduced the forgery AND the fix independently, including the serialization side, and
  tried a nastier variant than the implementer's (lowercase `userid=` plus a decoy
  `data-mention-label=`) — the shipped node held. Its verdict on the fix's nature matters:
  **structural, not relocated** — with per-attribute parseHTML defined, the last-writer slot at
  core dist:1460 is occupied by the extension's own handler, so the bare attributes are never
  consulted. Census re-derived from scratch on its own harness; count 64 confirmed from a run
  on the clean tree; every dist citation checked to the line.
  Repo-wide with a firing control (96 files contain `export`): **no layer-3 check on mention
  userIds exists anywhere.** So nothing downstream catches what this task lets through.

Ruling: M4 stays, no finding. The reviewer's distinction is one to keep: *"a check that cannot
  fail is not evidence" governs TESTS; a runtime guard is not evidence, it is a second door.*
  It narrows `label` from `string | null` to `string` at the insertion site, and the M3/M5
  differential — the same case reddening with DIFFERENT documents, `[]` vs `{label:"   "}` — is
  the correct liveness demonstration. Documenting it as unreachable beat deleting it.

Ruling: the blank `userId` CLOSES now. The reviewer observed it rather than inferring —
  `{userId:'', name:'Anselma'}` stores `[{"userId":"","label":"Anselma"}]`, renders `@Anselma`
  perfectly, addresses nobody. Its sharpening decides it: **the empty label is VISIBLY wrong
  (`@01J9GUSA…`); this one is INVISIBLY wrong**, and there is no downstream gate. Confirmed
  genuinely one line inside `mentionLabelOf` (both insertion doors already route through it),
  with three non-structural riders: flip the scope docblock (it currently says in capitals that
  a blank userId "is refused by nothing here"), two owed test cases, and a rename — which the
  reviewer called optional and I ruled IN, because leaving the name while widening the contract
  is the drift this file's own comments argue against. Cost if wrong: a slightly larger diff.

Ruling: the parse door's stated REASON is wrong and gets rewritten. It invokes ticket-image's
  precedent, but that reasoning governs the JSON door only — ticket-image's conclusion for the
  PARSE door is the opposite (it guards it). And the HTML door is closable without any
  `validate`, since a node-level getAttrs returning `false` cancels the rule, so
  validate-throws-at-load is not what keeps it open. The real reason is sound (a blank label
  has no legal value to coerce TO, and fabricating one is what the design refuses) — it simply
  is not the one written. Same failure this branch spent five rounds on in another file: a
  cited precedent supporting a NEIGHBOURING claim rather than the one made.

Ruling: ARIA folds into THIS round rather than T12's. The popup is a bare <div> of <button>s —
  no role=listbox/option, no aria-selected, no aria-activedescendant, no result-count
  announcement; selection is communicated by CLASS NAME alone, so a screen-reader user gets no
  signal of which candidate Enter will take. Why here: **the BEM contract is being frozen in
  this file**, so adding ARIA later reopens it anyway; and the spec's stated primary audience
  is non-technical operators. `ui-ux-pro-max` named as binding (it is installed now). Cost if
  wrong: a slightly wider diff in the file that owns the contract.

INTERRUPTION: the T4 fix-round implementer died on a SESSION limit (reset 12:10 IST) before
  doing any work. Verified rather than assumed: HEAD is exactly 8d883e0, `git status` clean, no
  operation in flight, no fix section appended to task-4-report.md. Nothing to unwind.
  Now 13:14 IST, limit reset, resuming at full depth. The budget ruling again required no
  deviation — the lane stopped rather than retrying at a cheaper tier.

MODEL AUDIT of every REMAINING dispatch, against the table's own rows rather than my habit.
  Measured baseline: Plans 1-2 serial ran 30.1% sonnet; Wave 1 parallel 2.9%. This lane's
  remaining implementer dispatches, reclassified:
    SONNET (transcription / mechanical — the plan carries the complete code and the adaptation
    map has already pinned the deviations, so the work is faithful transcription plus tests):
      T6   docToPlainText conformance — map traced all 14 assertions, green-on-arrival
      T12a Drive picker + attachment-claims — plan carries the code; A8/A9 pin the exact field
           names and the safeParse conformance assertions; no new defect DESIGN
      T12c Drive-never-inline — a node:fs import scanner and a byte-identical-doc assertion,
           both fully specified
      T13a Drive-not-offerable-as-evidence — two cases, copy imported from a domain constant
      T15  vite/webview CONFIG and entry wiring
      catalogue — the table names it explicitly
    OPUS (core semantics / planted-defect DESIGN, which the table pins at opus-high):
      T5   escape-suggestion mechanic — 19 triggers, and the mechanic is semantics even where
           the trigger table is canonical copy
      T12  TicketEditor + paste/drop layer 2 — upload seam, optimistic chips, honesty semantics
      T12b honest rendering — the three Drive rules, the IST day fix, DriveLinkCheck exhaustive
      T13  evidence picker — transitionRequiresEvidence and the fold-forward caveat
      T15  the webview BRIDGE protocol only (parse contract + planted defects), split from its
           config half above
    UNCHANGED: per-task reviewers stay opus — a class floor, and the rule forbids going under.
  That moves 6 of ~11 remaining implementer dispatches to sonnet, from ~0.
  Where a sonnet dispatch hits genuine design judgment it escalates upward per the rule; it does
  not quietly proceed.

CONTEXT DISCIPLINE: this lane runs the lowest context-per-request of the four (~143K). The
  ledger at `.superpowers/sdd/…/progress.md` is the recovery map and lives on disk, so a
  controller `/clear` is survivable — the durable record is the ledger plus `git log`, never my
  context. Dispatch briefs stay self-sufficient: brief path + adaptations + constraints, never
  pasted history.

CROSS-LANE PROTOCOL: messages become short pointers both directions, effective now.

Correction received: the peer told the owner "concurrency, not tier, exhausted the pool" and has
  since corrected it — tier drift was a co-cause (5339af9). Relevant to me because my lane is
  part of the tier-drift numerator, which the audit above addresses.

*** PENDING AUDIT — CROSS-PACKAGE MUTATION MAY HAVE VOIDED SOME FALSIFIABILITY EVIDENCE ***
  Reported by lane 4 and verified there: `domain`, `rule-engine` and `app-core` export only
  `./dist/index.js` with no source export, so mutating a DOMAIN SOURCE file and running bare
  `vitest` tests the STALE DIST and passes. Lane 4 confirmed live — 25/25 green with a mutated
  engine source, then the same mutant killed its test after a rebuild. CI is safe
  (`turbo.json` has `test.dependsOn: ["^build"]`); the exposure is local, and
  `pnpm -r exec vitest run` shares it.
  RULE: cross-package mutation means `pnpm turbo run test`, or an explicit rebuild first.

  MY EXPOSURE, enumerated before auditing so the audit has a target list. The pattern at risk is
  narrow and specific: **an EDITOR test whose mutant is applied to DOMAIN source.**
    - T1's doc-text conformance suite — mutated `doc-text.ts` and ran editor tests; reported
      "paragraph/heading/codeBlock die; doc/blockquote/bulletList/listItem structurally cannot"
    - T3's `horizontalRule` mutant — "dies when the walker is taught to render '---'"
    - T4's doc-text-conformance additions
    - T6 (not yet run) — its whole purpose is conformance against the shipped walker
  NOT at risk: T2's and T11a's mutations, which are domain tests against domain source; those
  suites import relatively from `../src/`, so they never traverse the dist boundary.
  ALSO NOT at risk, and worth noting as the right method arrived at independently: T3's
  re-reviewer patched `packages/domain/dist/doc-text.js` in a scratchpad copy rather than the
  source — immune to this hazard by construction.

  DEFERRED, not skipped: T4's implementer is LIVE in this worktree right now, and mutating the
  tree under a live subagent is precisely the single-writer rule I broke earlier today. The
  audit runs at the T4 boundary. Design: md5 the walker, mutate it, run editor tests BARE
  (expect false green if the hazard is real here), run under turbo (expect red), restore,
  verify by md5. That distinguishes "my evidence was sound" from "my evidence was void" by
  observation rather than by argument.

*** CROSS-PACKAGE MUTATION AUDIT — RUN, MEASURED, RESOLVED ***
  Done at the T4 boundary with the worktree free, per the single-writer rule.

  THE HAZARD IS REAL AND WAS LIVE HERE. Measured both directions on this branch:
    mutate packages/domain/src/doc-text.ts (drop 'paragraph' from BLOCK_NODE_TYPES)
      -> BARE `vitest run test/doc-text-conformance.test.ts`  =  **8 passed** (FALSE GREEN)
      -> `pnpm turbo run test --filter @gisik-nokma/editor`   =  **3 failed / 70** (TRUE RED)
    Restored, md5 back to 55a9a261ddf88a45d4d2892e6bb95efe, dist rebuilt, tree clean.

  THE SUITE ITSELF IS SOUND — verified rather than assumed, now that I had the correct path:
    - the 'paragraph' mutant DOES kill it (3 cases), so the conformance suite is falsifiable
    - the documented "structurally cannot die" claim is ACCURATE: dropping 'doc' leaves
      **70 passed** under turbo, exactly as the test file's own header says
    So the conclusions those suites carry are correct. The only question was whether the
    EVIDENCE was gathered soundly.

  EVIDENCE PROVENANCE, checked in the reports rather than assumed:
    - T1: SOUND. Its report shows an explicit `pnpm --filter @gisik-nokma/domain build` inside
      both its mutate and its restore helpers (report lines 728, 738). It rebuilt every time.
    - T3's horizontalRule mutant: the IMPLEMENTER's own run is unverifiable from its report,
      but the finding was INDEPENDENTLY confirmed by its re-reviewer, which patched
      `packages/domain/dist/doc-text.js` in a scratchpad copy — patching the dist directly is
      immune to this hazard by construction. The conclusion stands on the sound witness.
    - T4's conformance additions: provenance unverified; covered by my own turbo-path
      verification above, which is what actually matters.

  EXPOSURE SURFACE, enumerated (the peer's rule is right — IMPORT STYLE is the property, not
  the package boundary): exactly **two** editor test files import `@gisik-nokma/domain` by
  package name and therefore resolve through `./dist` —
    packages/editor/test/doc-text-conformance.test.ts
    packages/editor/test/mention.test.ts
  Every other editor test imports relatively from `../src/` and is immune. 2 by-name vs 5
  relative.

  NOTE ON THE PEER'S WITHDRAWAL: it withdrew the claim that my editor package was exposed,
  saying it had no way to check. The withdrawal was premature — I had already measured the
  false green on this branch, and the two by-name files above are why. Its RULE is correct and
  its retraction of an unchecked assertion was right in principle; the specific claim it
  retracted happened to be true.

Ruling: LANE-CONTEXT gains the composed-workarounds rule. rtk collapses `pnpm test` output to
  `PASS (n) FAIL (n)`, which is why dispatches have been pushing bare
  `node ./node_modules/vitest/vitest.mjs run <file>` for assertion-level detail — safe for a
  same-package mutation, UNSAFE the moment the test imports another workspace package by name.
  The two workarounds compose badly and anyone adopting the first without the second is
  exposed. Cost if wrong: a rebuild that was not needed.
