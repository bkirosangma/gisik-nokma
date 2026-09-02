# Serial executor — live state

**This file is the restart surface.** A controller that kills and relaunches the executor from its
brief recovers only what is written here. Refreshed at every task boundary.

> **Warning about shas in narrative prose.** Every sha cited in any *narrative* document in this
> repo — the dispatch brief, the Chain B handoff, the coordination doc's sections, the narrative
> parts of this file — is a fact about the moment it was written. Anchors in the table below were
> verified with `git branch --contains` (empty output = orphaned), never with `git cat-file`, which
> passes on reflog-only commits and hands you pre-rebase content while looking like it worked.

## WHERE I AM: **STEP 12 — Plan 7 remainder. Eighteen tasks. STARTING, 0 of 18.**

Step 11 (Plan 6 remainder) **merged as PR #77 → `7b45099`**. Its twelve ledger rows said `in-flight`
on `main` after the merge; this branch's first commit promotes them. **Nothing from step 11 is
outstanding.** If you are a restarted session reading this: do not reopen Plan 6.

## Live anchors — 2026-09-02

| Anchor | Value | How verified |
|---|---|---|
| **Branch** | **`exec/12-plan7-remainder`**, cut from `origin/main` `7b45099`. | `git rev-parse --abbrev-ref HEAD` |
| **Base** | `origin/main` = `7b45099ef6b6ee23b9266d8ec047bae070322398` | `git rev-parse origin/main`, fetched |
| **Ahead-count** | **Not written here on purpose. Run `git rev-list --count origin/main..HEAD`.** A count taken while writing the commit that records it is *always* short by one and always looks right to its author — step 11's handoff shipped `18` where the command answered `19`, and it had reached a review brief before anyone ran it. A number that cannot be written correctly from inside the commit carrying it should not be written at all. | measured 2026-09-02 |
| **Gate at `7b45099`** | **exit 0 · 24/24 tasks · 0 cached · Node v22.22.2 · 2027 tests.** domain 335 · rule-engine 280 · server 761 · app-core 471 · web 69 · editor 72 · ui 31 · sync-client 8. | run by the executor at this sha with `--force`, Node printed into the same log |
| **`check:tasks`** | **exit 0**, 177 rows / 177 plan tasks, **100 done (56.5%)**, 0 claimed, 0 in-flight, 77 todo. | `node scripts/check-task-ledger.mjs` at this sha, after the promotion below |
| **Gate SHAPE** | **24 tasks over EIGHT packages** since `apps/web` exists. Any inherited "21/21 over 7" figure is spent. | the run above |
| Orphaned, do not cite | every sha in the narrative sections below. | `git branch --contains` (empty = orphaned) |

### The ledger promotion in this branch's first commit, and its evidentiary basis

Twelve Plan 6 rows (`06/5, 7, 8, 10, 11, 12, 12a, 13, 14, 15, 15b, 16`) still read `in-flight` on
`main` *after* PR #77 merged. They are promoted to `done`, PR `77`, sha `7b45099`.

**The basis matters, because this repo has already run one ledger audit that refused three rows.**
The vocabulary grants `done` to "a merged PR whose title **or the controller record** names THIS
plan AND task specifically". PR #77's *title* names the step, not the tasks — on the title alone
these rows would be `claimed`. They qualify on the **controller-record** clause: step 11's handoff
carried a per-task table naming each of the twelve DONE with its artefact, and the ledger's `note`
column carries the artefact paths. Recorded here so the next audit does not have to re-derive it.

## THE SEQUENCE, and where step 12 sits

Spine: `1,2 → 3,4 → 5 → {6,7,8,9,10} → 11`. Steps 1–11 are closed.

**Step 12 = Plan 7 remainder** — `docs/superpowers/plans/2026-08-20-07-editor-attachments.md`.
Tasks 1–4 merged as PR #47 (`a3746fb`). **Eighteen remain: 5, 6, 7, 8, 9, 9a, 10, 11, 11a, 12, 12a,
12b, 12c, 13, 13a, 14, 15, 16.**

**The plan's own sequencing binds the order** (plan §"Task order", line ~140):

- **Tasks 5–6** — editor, pure. Independent track.
- **Tasks 7–11a** — server (object store, upload, download, gates). Independent track.
- The two tracks may be **interleaved**, but **Tasks 12–15 need BOTH**, so neither can start early.
- **Task 16 closes.**
- **Lettered tasks run immediately after their numbered parent, in letter order**: 9a after 9,
  11a after 11, 12a→12b→12c after 12, 13a after 13. Each is a full task with its own commit.

Floor-list for this step (opus implementer AND opus reviewer): **T9, T11** per the dispatch brief,
**plus T10 escalated** — see the hazard list below.

## FIVE THINGS THAT WILL COST A ROUND EACH IN STEP 12

**1. The ledger says `todo` for all eighteen and it is WRONG for at least two.** PR #47 overshot its
scope and left later tasks' declared artefacts on `main`:

- `packages/domain/src/attachment-kinds.ts` — **Task 11a's declared artefact**, already present with
  `AttachmentKind`, `DriveReference`, `DRIVE_FILE_SCOPE`, `RULE_EVIDENCE_DRIVE_REFERENCE`,
  `EVIDENCE_DRIVE_REFERENCE_REASON`, `isDriveReference`.
- `packages/editor/test/doc-text-conformance.test.ts` — the plan's File Structure calls Task 6's file
  `doc-to-plain-text.test.ts`; a conformance test under a different name is already there.

**An implementer told to "create X" against an existing, already-reviewed X either duplicates it or
rewrites merged work.** Every dispatch in this step must be told what already exists and, for each
existing artefact, **the enumerated absences — never the word "partial"**.

**2. Two contract seams are assigned to step 12 BY NAME. Edit both sides or neither.** Recorded by
the controller's structural scan at step 11's close, and not fixed there on purpose:

| Seam | Plan 6 says | Plan 7 says | Lands in |
|---|---|---|---|
| `EditorSlotProps.doc` | `doc: unknown` (`packages/app-core/src/views/editor-slot.tsx:59`) | `doc: DocJson \| null` | **Task 14** |
| `AttachmentListEntry` | inlines the drive-reference fields (`packages/app-core/src/views/attachment-list.tsx:41`) | `… & DriveReference` | **Task 12b** |

If Task 14's implementer writes `doc: DocJson | null` in `packages/editor` while `app-core` still
says `doc: unknown`, **the seam ships and typecheck does not necessarily catch it** — `unknown`
accepts everything. Put the both-or-neither constraint in those two dispatch prompts explicitly.

**`EditorSlotUpload` is a FALSE POSITIVE** — identical fields, different line breaks. Named here so
no reviewer re-finds it and no implementer "fixes" it.

**3. Task 10 is the highest-risk task in the step and the brief does not floor-list it.** Its
property is *"unauthorized or nonexistent attachment downloads answer one **byte-identical** 404"* —
a disclosure property on the read-enforcement surface that has already produced rulings **P19, P22
and P23, every one a disclosure no test caught.** A test asserting `status === 404` on both paths
**does not test byte-identity**; it passes for a reason unrelated to the property it names — the
signature failure of this whole series. T10's check must compare the **full body and the response
headers** between *exists-but-invisible* and *does-not-exist*, against a planted defect that
differentiates them (an error body naming the id is the obvious one). **T10's reviewer is escalated
to opus.** Escalation runs upward; the cost ruling lowered floors, it did not forbid this.

**4. "The origin check" is two unrelated things and Task 9 is where the confusion would land.**
`POST /v1/attachments` is a **cookie-authenticated product mutation**, so the CSRF ruling's
**HTTP-`Origin`-header** requirement applies to it. That is NOT the event-envelope `origin`
provenance enum, which Plan 7 also touches. **Say "HTTP-Origin" or "envelope-origin" in every task,
commit and review of this step.** Before Task 9, establish whether the shipped HTTP-Origin check is
**global middleware the new route inherits automatically** or **per-route wiring the new route must
opt into** — a new route silently outside a per-route check is an open forgery window that no test
on `main` would redden.

**5. Ruling P25 is TAKEN, and three of its subjects are NOT in this step.** Clauses 2 and 3 accepted
as proposed; clause 1 **capped at `getBoard`**, which shipped in step 11. **`getMyWorkspaces`,
`getTicket` and `getTickets` do not enter step 12 and must not be folded into it** — they are
visibility decisions on Plan 4's read-enforcement surface, and `getMyWorkspaces` is not even a field
addition: there is no shipped project-list read at all, so it means designing one. The six
`ServingGapError` refusals in `packages/app-core/src/online/` are **the point, not a shortfall**;
each is cross-checked in `apps/server/test/integration/client-contract.test.ts` and goes RED the day
its route serves the field. **Do not weaken one to make a Plan 7 view light up.**

## THREE THINGS FROM STEP 11 A SUCCESSOR MUST NOT UNDO

1. **`Chosen<T>`'s default arm carries no `value`, deliberately** (`packages/app-core/src/views/view-types.ts`).
   A pair would let a consumer read `.value` and ignore `.origin`, which is how ruling P24 was being
   violated in the first place. The obvious tidy-up restores the defect.
2. **`apps/web/tsconfig.json` excludes `.next`.** Next's default `include` globs a directory
   `next build` deletes while turbo runs typecheck concurrently — measured **2 red of 3** without the
   exclude. It cannot be a narrower include: `next build` rewrites that file's `include` every run and
   never touches its `exclude`. **If the gate reddens on `@gisik-nokma/web:typecheck` with TS6053,
   this is why** — and run it three times before believing either answer.
3. **`Features.md` §3, not §8, is the web client's catalogue home.** §8 was considered and refused
   because migrating means mapping 112+ live cross-referenced ids against the README's own
   never-renumber rule. Plan 7's Task 16 targets **§9 / `test-cases/09-editor-attachments.md`**,
   which is a different question and does not inherit that refusal — but check that §9 exists before
   assuming it does, because §8 did not.

## IN FLIGHT

**Nothing.** No open PR for this step. No fan-out running.

## RULINGS OPEN

**None blocking step 12.** P25 is taken (above). P26 exists as a number and subject with no text on
`main` — noted, not load-bearing here.

## METHOD FOR THIS STEP — the cost ruling, applied

- **One fan-out for the plan**: the adaptation map, **one sonnet agent** (pre-flight is retired).
- **Per task: implementer → reviewer.** Fix round only on an Important or worse; scoped re-review
  only if the fix over-reached its scope. **HARD CAP 6 subagents per task.**
- **Final whole-branch review: ONE opus reviewer.** No lens bank, no refuters, no triage stage.
- **Fable is not dispatched, with no exception clause.** Sonnet is the default, opus the exception.
- Expect escapes at the last gate that the removed machinery used to catch. **Record each instance in
  the coordination doc** for when the trade is next reviewed; do not re-open the trade.

## VERIFICATION RULES THAT BIND EVERY CLAIM IN THIS STEP

- **A cross-package mutation under bare `vitest` tests the stale `dist`.** The resolving property is
  **import style**: `../src/*.js` catches its mutation; `@gisik-nokma/domain` by package name
  resolves through `./dist`. Use `pnpm turbo run test` or rebuild explicitly — **and rebuild again
  after restoring**, or you leave a mutated dist for the next agent. Plan 7 crosses
  `packages/editor` → `@gisik-nokma/domain` constantly, so this will come up.
- **Every mutation kept should fail specifically enough to identify its own site.** A survivor with
  no explanation is either an unconstrained path or a mutation that never ran, and the second is the
  damaging one: it condemns a check that is fine.
- **"X appears nowhere" needs file-by-file enumeration or a second sweep, and every null prints a
  positive control from the same run.** Six silent-empty modes are recorded on this machine and all
  produce well-formed wrong answers rather than errors.
- **Any clock-sensitive assertion must vary `TZ` explicitly.** Zero of the pre-step-11 test files
  varied it; `packages/domain/test/ist-day.test.ts` therefore cannot distinguish *the code computes
  IST correctly* from *the machine is already in IST*. `attachment.added` carries `capturedAt` and
  Task 12b dates a last-seen observation — both are clock-sensitive surfaces.
- **A partial-implementation marker enumerates the absences, not the partiality.**
- **The instinct to fix what you find is the one that hides compounds.** Anything outside a task's
  scope gets **recorded with a named owner**, not fixed.
- **Prose is not exempt from the falsifiability law, and it is the part no gate runs.** Step 11's
  final review found five findings and **every one was against a document** — the tests were
  mutation-proved and the prose was not.
- **Never run a state-changing git command in a shell whose cwd was set for a read.** Use `git -C`.
- Verify any file restoration with `git diff` or by reading the file — **never a shell `diff`**,
  which has returned a false "identical" on this machine.

## NARRATIVE — step 11's closing lesson, kept because it is the one this series keeps re-earning

Step 11's whole-branch review returned verdict *ship* with five findings, **all five against
documents, all five the executor's own prose**, on a branch whose own thesis is that a claim without
an executed check behind it is not evidence. Three were Important, and each was a failure class the
branch itself documents:

1. **The restart surface contradicted itself** — the heading still read "Task A of three, in flight"
   three lines under an anchors row saying the opposite. **A patched table does not repair a heading,
   and a restarted session reads the heading first.** That is why this file now leads with position.
2. **A lesson named the wrong module in four places**, including a production docblock, from a
   misread antecedent — while the branch already carried the correct version elsewhere.
3. **An absence claim ("only X has no coverage anywhere") was published without the sweep this
   repo's own rule demands**, and was false in four places.

**The fix round found MORE copies than the review cited in every single case** — four where three
were named, twice.
