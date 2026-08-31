# Lane 4 (periphery) — execution state at fold-back to serial

**Written 2026-08-31 when Wave 1 folded back into serial execution.** This lane held slices of
five plans and kept no `.superpowers/sdd` ledger, so this file is the only durable record of what
it knows. Load-bearing *rulings* are in the coordination doc under **"Lane 4 (periphery) execution
consequences" §§1–12** — that remains the authority. This file carries what is NOT there: slice
state, the mutation ledger, dispatch tiers, and the review composition that was never dispatched.

---

## 1. Slice state across five plans

| Plan | Slice | State |
|---|---|---|
| **Plan 6a** | T1–T4 scaffold (`packages/ui`, `packages/app-core`) | **merged**, PR #16 |
| | T5 domain gap guards | **discharged, no code** — all four targets already shipped; shapes verified (`blocked: z.boolean().optional()` at `workflow.ts:13`; `cause` with the `reopened-for-child` literal at `:144`; `docToPlainText` and `IngestResult` barrel-exported). Nothing to write. |
| | T6 claims machinery | **MERGED** — PR #36, on `main` as `3fb22d3`. Implemented, fable-reviewed, three blocking items fixed, scoped re-review CLEAN. |
| | T9 Board + `useLiveQuery` | **REVIEWED 2026-08-31, and its fix round is on this branch.** It finished minutes after the fold-back order and for one day was the only task here that had passed none of implementer→reviewer→fix→scoped-re-review. It has now passed all four: one opus reviewer (`docs/lanes/plan-6a-t9-review.md`, four Important + six Minor), a fix round for the four Important, and a three-lens scoped re-review whose own findings are dispositioned in that same file. The gate figure this row used to carry ("621") was stale twice over and is deliberately gone — the composition below is anchored to a sha, because a bare number in prose is what went wrong here the first time. `PLANTED DEFECT` labels across T9's two test files: **21** (board 19 · rollup-text 2), recounted at HEAD; the row's old "8 falsifiability proofs" counted something else and never said what. |
| | T10–T13 (List, My Work + attention strip, ticket sheet + `EditorSlot`, attachment list, reopen flow) | **not started** |
| | T7/T8/T14/T15/T15b | deferred to Wave 3 by the original brief (need Plans 4/5) |
| **Plan 10** | T1, T2, T3a, T8 (the prefix) | **merged**, PR #23 |
| | T3a's `visible-events-for.ts` half | not ours — Plan 4 T11 owns the file |
| **Plan 11** | infra scaffold | **only the env-contract slice landed** (PR #17: `.env.example`, `scripts/check-env-example.mjs`, `check:env`, CI step). Everything else not started. |
| **Plan 5** | T2 `filter-spec`, T3/T13/T14 domain halves | **not started** |
| **Plan 9** | T2 `extractMentionedUserIds`, T3 notification vocabulary | **not started**. T4 became eligible when Plan 4's `Queryable` landed. |

**Merged PRs:** #16 scaffold · #17 env-contract gate · #19 colour-scan attribution · #23 Plan 10 prefix.
**Unmerged:** `exec/06a-client-core` carried **only unreviewed work** — T9, plus this file — which was
the point of splitting T6 onto its own branch at its reviewed sha and merging it separately (PR #36).
That split did its job and the sentence has now expired: as of 2026-08-31 the branch carries T9's
review, its fix round, and the response to a scoped re-review, so **nothing on it is unreviewed**.
Kept rather than deleted because the arrangement is worth reusing — `main` holding only reviewed work
and a branch holding only unreviewed work means nobody has to trust a label to tell them apart.

**Gate, recounted at each sha rather than carried forward** (see the correction below):

- **`main` @ `3fb22d3` — 631, 18/18**: app-core 91 · domain 230 · rule-engine 128 · **server 143** ·
  ui 31 · sync-client 8. *Historical: this is where the lane folded back, and it is no longer
  current main.*
- **branch @ `30e3db4` — 658**: identical except app-core **118** (T9's +27). *Historical, and
  orphaned by the rebase.*
- **`main` @ `55ae0a1` — app-core 92**, measured with
  `--pool=forks --poolOptions.forks.singleFork=true` in the main worktree.
- **branch after the rebase onto `55ae0a1` — 851, 18/18**: domain 263 · rule-engine 278 ·
  server 143 · app-core **130** · ui 31 · sync-client 8.

> **The two historical rows are no longer comparable to each other, and saying so is the point.**
> Plan 3 Chain A landed underneath (`6b2fc76`), moving domain 230 → 263 and rule-engine 128 → 278 on
> BOTH sides. So "identical except app-core" was true of the pair it was measured on and false of
> anything since. The app-core delta is the only figure that survives the rebase: **92 → 130**, and
> even that is a delta, stated against a named sha, not an absolute.

> **This figure was wrong in its first version and the error is instructive.** It said server 106 —
> true at `8209397`, false at `3fb22d3`, because three server commits (`fc904f4`, `5450085`,
> `f3e919b`) landed underneath while this lane worked. **Five of the six packages were still
> correct, which is precisely why the sixth was invisible.** A composition carried forward is a
> claim about the commit it was measured at; recount it, do not transcribe it. That is this file's
> own delta-versus-absolute rule, arriving one more time and catching its author.

---

## 2. Mutation ledger — T6, reconstructed here because it exists in no other file

25 mutations, 25 killed, plus the reviewer's independent runs. Baselines: campaign 1 against
`precheck.ts 6ea3ad4e`; campaign 2 against post-fix `d26eb052`; the canary against
`rule-engine/src/evaluate.ts dc5b5d13`. Final reviewed `precheck.ts` is `1a78728f` (comment-only
delta over `d26eb052`).

**Campaign 1 (m1–m22)** covered: the injected clock, factory output equivalence against
`newSubmittedEvent`, actor-label fallback, day-claim vs instant rendering, `toLocaleString` drift
under an absurd `TZ`, the calendar-impossible day guard, `serverTime`-not-`clientTime` provenance,
snapshot drop-vs-patch, vouch invalidation (clear and targeted), vouch eviction, cache-vs-source
precedence, the decorated query's exact key set, each of the three precheck gates, the
restrict-to roles downgrade in both directions, non-ticket and unhandled-type routing, the
terminal test inverted, the reparent exemption, the provisional-`seq` door refusal, and the
uncached-parent path.

**Campaign 2 (m23–m26), the ones that matter most:**
- **m23** — delete the ticket-side top-of-chain guard (`precheck.ts:228`) → matrix row *"the ticket
  names a workflow version newer than the cached definition"* flips to **`passed`**; the entry-side
  row stays `not-evaluated`.
- **m24** — delete the entry-side guard (`:237`) → only *"a transition-log entry names a version
  newer than the cached definition"* flips to **`passed`**. Independence proven in both directions.
- **m25** — `claimedParentId` reparent branch returns `null` instead of `undefined` on parse failure
  → dies at *"a reparent whose payload the door itself would refuse"*. **This mutant survived all 88
  tests before the witness was added.**
- **m26** — add a `case 'ticket.created'` returning a hierarchy refusal to `evaluate.ts`, **rebuilt**
  → the canary dies. A `case` label returning `{refused:false}`, rebuilt, leaves the canary **silent**
  — so it trips on the arrival of a *rule*, not of a label.

**Vacuity probe:** a constant `not-evaluated` satisfies the ten-row matrix **by itself**. The two
gate-lifting twins and thirteen preview tests are what rule it out. The matrix is non-vacuous **as a
system, not alone** — a later reader trimming the twins as redundant guts it without touching it.

---

## 3. Corrected dispatch tiers — audited, and the audit found zero, not drift

**I dispatched no sonnet implementer across four partitions**, against a table that assigns sonnet
to transcription, scaffolds, migrations, barrel exports and catalogue tasks. A ratio reads as drift;
zero is a policy that was never in force.

- **sonnet**: Plan 11 infra (Dockerfile, entrypoint, `.dockerignore`, CI YAML extension,
  `deploy/do/app.yaml` + README, `.env.example` additions, `restore.sh`, `check-db-timezone.mjs`,
  `seedUlid`, `plan-series.ts` parser) · Plan 5's T3/T13/T14 domain halves · all of Plan 9 ·
  **every catalogue task** (these were being folded into opus dispatches unnoticed).
- **opus**: Plan 5 T2 `compileFilterSpec` (an injection-proof compiler is security semantics) ·
  Plan 6a views T9–T13 (view-models carry the honesty semantics) · Plan 11 T3 error alerting.
- **floor list**: Plan 6 T6 — opus implementer + **fable** reviewer, per task, never batched.
- Reviewers stay opus-high throughout.

---

## 4. The batched final review — composition, never dispatched

Deliberately not run: it cannot finish before close, and **a fan-out killed mid-flight is the worst
outcome available — full price, no gate.** (Learned here: four lenses dispatched 2026-08-28 at
22:28 IST were killed by the weekly limit; $27 bought nothing and the review re-ran three days later.)

Composition when someone picks it up, over the accumulated slices at a coherence point — **one
review, not one per branch**, because a whole-branch lens cannot see interaction between two
branches it read separately:

- **three reading lenses** — falsifiability, cross-plan/coordination, correctness — at **opus, `max`**
- **the mocked-contract lens** at **fable**
- **adversarial refuters** at **fable**, defaulting to REFUTED, **in isolated worktrees**
- synthesis at opus-high
- ~$117 measured; **check the pool clears it before dispatching**

**Refuters must stay at tier**: the §11 cross-workspace forgery was found by one that *committed the
forgery end to end over the shipped door* rather than reasoning about whether it was possible. A
reading lens finds what is written wrongly; a refuter finds what is not written at all.

---

## 5. Verification-method rules this lane learned by breaking them

- **A check that cannot fail is not evidence**, in four disguises: satisfied by construction
  (`toContain` over an array holding its own subject); fixtures whose values coincide (dense seqs
  make `count()` ≡ `max()`); a guard naming a hazard by one of its spellings (`node:` but not `fs`);
  and prose asserting a mechanism nobody ran.
- **A survivor with no explanation is either an unconstrained path or a mutation that never ran, and
  those must be distinguished before either is reported.** Every mutation kept must fail specifically
  enough to identify its own site. Four false greens on this branch: a regex that hit a comment; a
  deletion that left no marker; a mutation that failed to compile; a mutation resolved against stale
  `dist`.
- **Stale dist is an IMPORT-STYLE property, not a package-boundary one.** Tests importing
  `@gisik-nokma/*` by package name resolve through `./dist`; `../src/*.js` imports are immune.
  app-core has **8** by-package-name sites, and `precheck.test.ts` imports from both domain and
  rule-engine. CI is protected by `test.dependsOn: ["^build"]`; bare `vitest` is not.
- **After any mutating agent dies, restore by verifying the GATE, never by scanning for markers** — a
  deletion leaves no marker. A fable reviewer died mid-mutation here and left a false-pass hole in
  the tree for about an hour; a marker grep called it clean and the gate caught it.
- **A machine whose configuration matches the product's hides a whole defect class.** T9 mutated
  `formatIstInstant` to `toLocaleDateString` and the plan's own unfold test **passed** — this machine
  runs Asia/Kolkata, so the device clock printed the right day by coincidence. Only tests that swap
  `TZ` to Kiritimati and Niue killed it, turning one recorded instant into three different days. The
  same shape as fixtures whose values coincide, one level up: the *environment* was the fixture.
- **A per-package composition is a measurement, not a fact you may carry.** This file first reported
  server 106 at a sha where it was 143. Five of six entries stayed right across the move, so the
  decomposition looked self-consistent and the one drifted entry hid inside it. Recount at the sha
  you are reporting.
- **Two measurements that disagree are information.** The gate said 1 failed; the file alone said 2
  passed. That contradiction was the finding.
- **A familiar pattern is the easiest false story to believe.** Seeing the guard absent, I nearly
  committed a comment blaming the implementer — the evidence that a reviewer had removed it was in a
  message I had already read.
- **Empty search results need a positive control**; **non-empty ones need a mechanism that answers
  the question asked** (`main..branch` answers "differs from main", not "changed by this branch").
  Prefer the query that over-reports: only that failure announces itself.
- **A line-number citation is a claim with a shelf life** — in a parallel repo it expires at the next
  rebase, not the next edit. Cite what, not only where.
- **`git commit --amend` amends what is STAGED.** A commit message is a claim about the tree it ships
  with; one here narrated a change that was never staged, and no test can catch that.
- **Authorship, not ownership, decides fix-vs-record:** does your change *create* the breakage or
  merely *reveal* it? "It lives in a plan I do not own" is a reason to record, never a reason to
  leave broken something you broke.
- **The instinct to fix what you find is the one that hides compounds.** §11 was recorded rather than
  fixed; only that made it legible against the envelope-origin gap, and the compound is the serious
  defect.

---

## 6. Open claims on other plans

- **Plan 6 Task 7** owes the completeness vouch a producer. Until then every accepted move into a
  terminal state answers `not-evaluated` and the pass-preview is inert. Do **not** use
  `TicketRead.rollup`: `rollup: null` cannot distinguish "no children" from "not computed".
- **Plan 3** should export its parent-terminal refusal sentence; two wordings exist for one rule id
  today. And when Plan 3 lands hierarchy checks as engine cases, `app-core`'s canary fires — that is
  intended, and the fix is to route `precheckParentTerminal` through the engine.
- **Plan 10 Task 4** owns the §11 closer: nothing binds a contest's embedded claim to its envelope.
- **Plan 11** inherits the verifier-DDL-credential ruling (§4 of Plan 1's consequences) and must
  assert `@better-auth/cli` is absent from the lockfile **by reading the lockfile file, never install
  output** — `--frozen-lockfile` prints nothing, so an output grep reads clean forever.
- **`packages/app-core/test/helpers/seed.ts`** still uses non-ULID actor ids — inert against the fake,
  refused the moment anything crosses `parseEvent`.
