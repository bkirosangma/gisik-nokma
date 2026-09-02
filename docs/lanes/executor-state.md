# Serial executor — live state

**This file is the restart surface.** A controller that kills and relaunches the executor from its
brief recovers only what is written here. Refreshed at every task boundary.

> **Warning about shas in narrative prose.** Every sha cited in any *narrative* document in this
> repo — the dispatch brief, the Chain B handoff, the coordination doc's sections, the narrative
> parts of this file — is a fact about the moment it was written. Anchors in the table below were
> verified with `git branch --contains` (empty output = orphaned), never with `git cat-file`, which
> passes on reflog-only commits and hands you pre-rebase content while looking like it worked.

## WHERE I AM: **STEP 12 — Plan 7 remainder. ALL EIGHTEEN TASKS DONE.**

T5, T6, T7, T8 · T9, T9a, T10, T11, T11a · T12, T12a, T12b, T12c · T13, T13a, T14, T15 · **T16
closed the catalogue.** `check:tasks` reports Plan 7 at **18 in-flight, 0 todo** — `in-flight`
rather than `done` only because `done` requires a merge sha that is an ancestor of `origin/main`.

**Plus one change outside any task's scope, on RULING P27** — the wildcard/exact divergence in
`packages/app-core/src/views/transition-dialog.tsx`. See the ruling section below.

**Remaining before the PR: the final whole-branch review — ONE opus reviewer, per the cost
ruling — then the PR.** No PR is open yet. Nothing is awaiting a decision.

Step 11 (Plan 6 remainder) **merged as PR #77 → `7b45099`**. Its twelve ledger rows said `in-flight`
on `main` after the merge; this branch's first commit promotes them. **Nothing from step 11 is
outstanding.** If you are a restarted session reading this: do not reopen Plan 6.

## Live anchors — 2026-09-02

| Anchor | Value | How verified |
|---|---|---|
| **Branch** | **`exec/12-plan7-remainder`**, cut from `origin/main` `7b45099`. | `git rev-parse --abbrev-ref HEAD` |
| **Base** | `origin/main` = `7b45099ef6b6ee23b9266d8ec047bae070322398` | `git rev-parse origin/main`, fetched |
| **Ahead-count** | **Not written here on purpose. Run `git rev-list --count origin/main..HEAD`.** A count taken while writing the commit that records it is *always* short by one and always looks right to its author — step 11's handoff shipped `18` where the command answered `19`, and it had reached a review brief before anyone ran it. A number that cannot be written correctly from inside the commit carrying it should not be written at all. | measured 2026-09-02 |
| **Gate at branch HEAD** | **exit 0 · 24/24 tasks · 0 cached · Node v22.22.2 · 2152 tests.** domain 335 · rule-engine 280 · **server 856** · app-core 471 · web 69 · **editor 102** · ui 31 · sync-client 8. `check:env` exit 0. | run by the executor with `--force` after Batch B, Node printed into the same log |
| Gate at the base `7b45099`, for the delta | exit 0 · 24/24 · 2027 tests; server 761, editor 72. **This branch has added +95 server and +30 editor so far.** | measured separately at the base before any Batch A work |
| **`check:tasks`** | **exit 0**, 177 rows / 177 plan tasks, **100 done (56.5%)**, 0 claimed, **9 in-flight** (Plan 7 T5–T11a, on this branch), 68 todo. **The `done` count does not move until this branch merges** — `done` requires a merge sha that is an ancestor of `origin/main`, and nine finished tasks are correctly not counted as complete yet. | `node scripts/check-task-ledger.mjs` at branch HEAD |
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

**2. The two contract seams handed to step 12 were BOTH described wrongly. Re-measured 2026-09-02.**
The controller's structural scan at step 11's close named two "real" seams and one false positive.
Measurement says one of the two "real" ones is also false, and the other's hazard runs backwards.

**`AttachmentListEntry` — NOT a divergence. A THIRD false positive, alongside `EditorSlotUpload`.**
`packages/app-core/src/views/attachment-list.tsx:15-40` already carries the refutation: a
conditional-type probe run in **both directions** against `tsconfig.base.json`, with a control that
dropping a REQUIRED member breaks it and a second control recording that dropping the OPTIONAL
`iconLink` leaves mutual assignability intact — so the claim is scoped to required members and says
nothing stronger. Its own verdict: *"step 12 may collapse the two onto the domain type, but **it has
no difference to reconcile**."* Plan 6 spelling the six members out and Plan 7 writing
`& DriveReference` are the same type. **T12b's work here is an optional tidy-up, not a
reconciliation.** Do not let a reviewer re-find it as a divergence.

**`EditorSlotProps.doc` — a real divergence, but "typecheck won't catch it" is exactly backwards.**
Plan 7 Task 14 declares its own `EditorSlotProps` with `doc: DocJson | null`; app-core's says
`doc: unknown` (`views/editor-slot.tsx:59`). The inherited claim was that the seam ships silently
because `unknown` accepts everything. **Measured with the repo's own `tsc` under `strict: true`:**

```
const slot: (p: PropsAppCore) => null = TicketEditorSlot
  error TS2322: Type 'PropsAppCore' is not assignable to type 'PropsEditor'.
                Type 'unknown' is not assignable to type 'DocJson | null'.
CONTROL 1 — a component taking the WIDER prop: COMPILES (the probe is not rejecting everything).
CONTROL 2 — value-level unknown -> DocJson|null: fails, as expected.
```

Function parameters are **contravariant** under `strictFunctionTypes`, so the **narrower** declaration
is the one that breaks, loudly, at the `apps/web` assignment site. **The hazard is therefore the WRONG
FIX, not silence:** on hitting TS2322 an implementer is tempted to widen `packages/editor`'s `doc` to
`unknown` — destroying the `null → empty composer` distinction Plan 7 asks for — or to cast, which
hides it. Note also that **the plan's own Task 14 comment argues the wrong direction**: *"DocJson is
assignable to unknown"* is true for passing a doc VALUE into a slot typed `unknown`, and is not what
the component assignment needs. The correct resolution is a decision — narrow app-core's prop, or
give the slot the doc as a separate narrower prop — and **both declarations move in the same commit.**

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
   never-renumber rule. **Plan 7's Task 16 does NOT inherit that refusal, and its targets both
   exist — verified 2026-09-02:** `Features.md` has a `## 9. Editor, documents & attachments`
   header, and `test-cases/09-editor-attachments.md` is a real file whose highest live case id is
   **9.62**. So T16 extends an existing catalogue rather than opening one, and **new cases continue
   past 9.62** under the never-renumber rule. (`Features.md` runs §7 → §9 → §12; the absent §8, §10
   and §11 are a separate matter and not T16's to resolve.)

## BATCH A — T5, T6, T7, T8. All committed, gate green at HEAD.

| Task | Result |
|---|---|
| **T5** escape-suggestion | **DONE**, +27 tests. Two Important findings, both **against prose, not code** — a docblock generalising ProseMirror's `appendTransaction` contract as "receives the FULL set" when the real contract is per-plugin incremental (`n ? trs.slice(n) : trs`, skipped once a plugin has seen everything). **The fix round ran the discriminating experiment and REFUTED the reviewer's own ordering-dependence theory** — it inserted a second `appendTransaction` plugin after `EscapeSuggestion` so it was no longer last, and all 27 tests stayed green — then corrected the docblock to the real mechanism anyway. Reverted the experiment, verified with `git diff`, rebuilt `dist`. |
| **T6** docToPlainText conformance | **DONE**, +3 tests. Extended the existing `doc-text-conformance.test.ts` rather than creating the plan's `doc-to-plain-text.test.ts` — the gap was **one node (`image`), not a whole file.** Two Important findings, both false claims in prose. **Then the fix round's own corrected node count was itself wrong, and a further commit (`7985a27`) fixed that** — the recorded pattern holding again. |
| **T7** attachments table + `ObjectStore` + local-disk | **DONE**, +10 tests, **verdict ship, no findings.** The reviewer's note: *"this task is unusually well-verified"* — all five planted-defect mutations reproduced. Implementer flagged that **the plan's own traversal assertion is vacuous** (`readdir(root).every(e => e === 'w')` is trivially true for keys that resolve *above* root) and replaced it with direct `stat()` checks. |
| **T8** S3 store + store factory | **DONE**, +10 tests. Two Important findings, and **both were checks that cannot fail** — the exact signature failure of this series. A test *named* "put uploads with bucket, key, content type and length" **never asserted `ContentLength`** (deleting it left all six tests green), and the plan's declared "path-style default true" had **zero coverage** (inverting the condition left both files green). Both fixed. |

**The through-line of Batch A: every finding was either a false claim in prose or a check that could
not fail. No implementation defect was found in four tasks.** That is the same distribution step 11's
whole-branch review produced, and it is the argument for keeping the reviewer stage even at the
lowered floors.

## RECORDED, NOT FIXED — carried out of Batch A with owners

- **`.env.example` carries a stale `S3_*` placeholder block** (`S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`,
  `S3_ACCESS_KEY`, `S3_SECRET_KEY`, …) predating T8's `OBJECT_STORE_*` variables. Restored verbatim
  rather than merged. **Owner: Plan 11's deployment hardening.**
- **`schema.test.ts` carries two "CURRENT BEHAVIOUR pending Task 5" cases about paste-rule
  autoformatting that Task 5's actual text never covers** — Task 5 is typed-input-rule only.
  **Owner: plan author / a coordination-doc amendment.**
- **Shadowing the `undoInputRule` command name is monorepo-wide**, affecting every future
  `editor.commands.undoInputRule()` caller, and Task 5's Cross-plan Produces list names only
  `getEscapeSuggestion`. **Owner: plan author.**
- **`comparableHeaders` is defined locally in ELEVEN server test files**, all byte-identical.
  This entry first said "at least three" — that was the three I happened to grep, published as
  though it were a sweep. T10's reviewer ran the file-by-file enumeration and found **eleven**;
  re-verified here at branch HEAD with a positive control in the same run (16 files mention
  `canSee`). **The understatement is the finding**: an absence-shaped claim written from a partial
  grep reads exactly like one written from a sweep. **Owner: a later test-helper consolidation;
  explicitly NOT T10, which was told to consume the pattern and not hoist it.**

## BATCH B — T9, T9a, T10, T11, T11a. All committed.

| Task | Result |
|---|---|
| **T9** sniffing + `POST /v1/attachments` *(floor-list, opus/opus)* | **DONE**, +30 tests. Four Important. The sharpest: **the size-refusal planted-defect ledger claimed four tests reddened when only one would** — under "move the size check below the streaming loop", three of the four still compare `total > limit` after the loop and stay green. The guard itself is sound; the ledger's provenance was not. Also: `fieldSize: 256` **truncates silently** rather than refusing (multipart sets `valueTruncated` and passes the value through), so a docblock claiming "exactly ONE size decision in the upload path" was false. |
| **T9a** SHA-256 at the door | **DONE**, +9 tests, **verdict ship, no findings.** |
| **T10** `GET /v1/attachments/:id` *(reviewer escalated to opus)* | **DONE**, +5 tests. Four Important — **and the escalation earned itself on the first one.** The step's headline property, byte-identity across the three 404s, **carried no executed mutation**: all three planted defects reddened a status or `content-disposition` assertion and aborted the test *before* reaching the identity comparison. That is the "mutation that never ran" costume sitting on exactly the property this task exists for. Also: `(sanitized)` filename behaviour asserted by a check that cannot fail — the fixture filename was already sanitary, so deleting `sanitizeFilename` left it green. |
| **T11** server gates *(floor-list, opus/opus)* | **DONE**, +21 tests. One Important: **the gate loop's POSITION inside `commitOne` — the property that stops the refusals being an existence oracle — was pinned by nothing.** Every service constructed with `gates` in this repo also had the other ordering, so no test could tell the two apart. |
| **T11a** attachment kinds + evidence refusal | **DONE**, +2 tests, **verdict ship, no findings.** Domain half was already merged; only the server half was built. |

**Two fix-round commits corrected claims inside their own immediately-preceding commit**
(`81efdd8`, `75abf70`). That is the third and fourth instance this step of the recorded pattern: a
fix round finds more than the review cited, including its own new errors.

**Batch B's through-line differs from Batch A's and is worth the contrast.** Batch A found no
implementation defect at all — everything was prose or an unfalsifiable check. Batch B found the
same two classes again, but on the *load-bearing* properties: the byte-identity of a disclosure
refusal, the position of a gate loop, and the one ceiling named in Global Constraints. **The
escalation policy is doing real work** — T10 was not on the brief's floor list, and its reviewer
found the step's most dangerous unfalsifiable check.

## BATCH C — T12, T12a, T12b, T12c. All committed.

| Task | Result |
|---|---|
| **T12** `TicketEditor`, paste/drop, wrap menu *(reviewer opus)* | **DONE**, +10 tests. Two Important, **both confirmed by the reviewer actually RUNNING the mutation rather than reasoning about it.** (1) The ordering contract in the commit's own headline — `attachment.added` before any node — **was unproven on the image branch**: hoisting the node insertion above the `await` survived all ten tests, because the call-order recorder never recorded node insertion. (2) **No test asserted any attribute of the inserted node.** `attachmentId` could be replaced with a hard-coded literal and all ten stayed green — and `attachmentId` is the load-bearing link layer 3 refuses foreign ids on. Layer 2 would have emitted a node pointing at an attachment that does not exist, with nothing in the package noticing. |
| **T12a** Google Picker *(Drive references)* | **DONE**, +12 tests. Two Important, and **the first is a correction to an instruction I wrote** — see the `TZ` rule above. |
| **T12b** honest rendering *(opus/opus)* | **DONE**, +10 tests. Two Important, both about prose. One is the seam closure below. |
| **T12c** a Drive image is never an inline image *(reviewer opus)* | **DONE**, +4 tests. Two Important: a **false and internally impossible test-count reconciliation** in the commit message (it asserted "139 (was 138; +4)", and 138+4≠139), and the mime-check discrimination the task was explicitly told to state was only given for the server case. |

**Three fix rounds needed a SECOND commit to correct an error the fix itself introduced**
(`7f9afc0`, `edf8f22`, `c330dcd`). That is now six instances in this step. The pattern is not
occasional; it is the norm, and it is the argument for the fix round being reviewed rather than
trusted.

### The twin-declaration seam: closed here, by the step owner, because its recorded owner did not exist

Task 12b created `AttachmentListEntry` in `packages/editor/src/components/AttachmentListItem.tsx:49`
— the twin Plan 6 Open question 13 promised. **That falsified a dated measurement in three places**,
each true when written. Task 12b, correctly scoped to `packages/editor`, refused to reach into
another package and instead **wrote an annotation naming all three sites, naming its own blind
spot** (*"an annotation on this side cannot reach a reader who arrives cold at app-core"*), and
assigning owners.

**It assigned two of them to "Plan 6 Open question 13" — and Plan 6 closed at step 11.** That owner
does not exist, so the sites would have shipped false. Closed here:

- `packages/app-core/src/views/attachment-list.tsx` — **CLOSED**, now names the twin.
- `packages/app-core/test/views/attachment-list.test.tsx` — **CLOSED**. Its assertion is deliberately
  left comparing against the DOMAIN shape rather than importing `packages/editor`: app-core
  depending on the editor package is precisely what the twin arrangement exists to avoid.
- **`Features.md:44` — STILL OPEN.** *"it declares none today"*. **Owner: Task 16**, which touches
  the catalogue anyway and is separately owed a description of this component.

**The survivor matters as much as the corrections.** `packages/app-core/src/views/editor-slot.tsx:17`
carries a sentence of exactly the same shape about `EditorSlotUpload`, and **that one is still
true** — swept at the closing commit with the right predicate (`type`/`interface`/`const`, not bare
mention): `packages/editor` contains **zero declarations** of that name and only two prose mentions,
one of which is the annotation making the claim. A reader who sees two corrections of a sentence
shape and writes off the third would break a claim that holds.

**The transferable lesson: a scope refusal that names its own blind spot is what made this
actionable, and an annotation is not a fix.** Task 12b did the right thing and said so plainly. The
failure would have been the owner assignment quietly pointing at a closed plan — which is the
`a63b326` lesson (*a pointer from a correct document to a stale one reverses*) in its owner-field
form. **Check that a recorded owner still exists.**

### The env gate went RED on a file for saying it reads no environment

`check:env` failed after Batch C, naming `CANCEL` and `PICKED` as *"config vars read by code but
undocumented in `.env.example`"*. **Neither is an environment variable.** They are members of the
Google Picker `Action` enum in a TypeScript type declaration:
`Action: { PICKED: string; CANCEL: string }`.

The scanner admits a file to detectors D2/D3 with `if (!/process\.env|ProcessEnv/.test(source))`,
testing the **raw source including comments**, then runs the detectors on
`withoutCommentLines(source)`. `google-picker.ts` was admitted **on the strength of a docblock
sentence reading *"never read from `process.env` in here"*** — a sentence asserting the file does
**not** touch the environment — after which D3 read the two type members as config keys.

**The tempting fix was to reword that sentence**, which is one word, touches only this step's file,
and turns the gate green. It was refused: it deletes a true and useful sentence to satisfy a check,
and leaves the defect armed for the next file that mentions `process.env` in prose. **The scanner
was fixed instead** — the gate now tests `code`, so the admission test and the detectors read the
same text. D1 is deliberately left on raw `source`: a commented-out `process.env.FOO` still names a
variable someone meant to read.

**Proven, with the controls in the same run**: clean at exit 0 (41 documented / 19 referenced); a
planted `process.env.GN_PROBE_UNDOCUMENTED` is still caught (exit 1, then restored and verified with
`git diff`); D2 still reports the `OBJECT_STORE_*` destructuring and D3 still reports
`HOST`/`PORT`/`LOG_LEVEL`. **All three detectors demonstrably survive the fix.**

## BATCH D — T13, T13a, T14, T15. All committed.

| Task | Result |
|---|---|
| **T13** evidence picker + `transitionRequiresEvidence` *(reviewer opus)* | **DONE**, +8 tests. Three Important — one of them the **F5 recurrence below**, which is not this task's to fix. The other two were false absolutes in docblocks: a claim that a type is *"structurally incapable of describing a Drive reference"* (it is not — a caller can map one in, and `onPick` only needs the id), and a claim that the lookup *"can never diverge from what the server will actually enforce"* (it can: the engine matches the **forward-folded** state id via `resolveCurrentStateId`, this lookup matches whatever the caller passes). |
| **T13a** Drive references not offerable as evidence *(reviewer opus)* | **DONE**, +2 tests. One Important: a new `Features.md` bullet marked **✅ user-observable when nothing mounts `EvidencePicker`** — no surface passes `driveReferences`, so no user can observe it. `⚙️` is the honest marker. Handed to T16. |
| **T14** `<EditorSlot>` implementation *(opus/opus)* | **DONE**, +17 tests, **verdict ship.** The `doc` seam was resolved — see below. |
| **T15** RN webview bundle + message bridge *(reviewer opus)* | **DONE**, +11 tests. Two Important: a **false absolute in the trust-boundary docblock** — it claimed no field of a host message ever reaches anything downstream, but `loadDoc` passes `record.doc` straight through — and eleven new tests with no case ids deferred to an owner whose own text does not cover them. |

### T14 resolved the `doc` seam, and named the limit of its own proof

The seam I measured (TS2322, contravariance) was handed to T14 with the wrong-fix trap spelled out,
and it did **not** take either tempting escape. **But its own stated uncertainty is the thing to
carry forward:** the compile-time proof rests on a **TRANSCRIPTION** of app-core's declaration
inside `packages/editor/test/ticket-editor-slot.test.tsx`, because the real assignment would need a
dependency edge from `packages/editor` to `packages/app-core` — **which is exactly what the twin
architecture exists to prevent.** So the seam is proven against a copy, and a copy can drift from
the original. That is the irreducible cost of a contract written twice, and it should be stated
wherever the twin arrangement is described rather than discovered again.

## RULING P27 — TAKEN AND APPLIED. The F5 recurrence is FIXED, not parked.

**The controller ruled Option (a): fix it in step 12**, matching `precheck.ts` exactly, with the
probe promoted to a permanent regression test in **both directions**. Done — cases **3.149–3.151**
in `packages/app-core/test/views/transition-dialog.test.tsx`, plus `Features.md` and
`test-cases/03`. **The mutation is site-identifying: restoring the old resolution kills exactly 1
of that file's 20 tests — 3.149 only — with 3.150 and 3.151 green.**

**3.150 is not decoration.** It declares the exact edge first; without it, 3.149 shows only that one
ordering yields the right answer, not that the answer is *independent of ordering*, which is the
property the engine actually has. **3.151 guards the regression the fix itself could introduce** —
preferring the exact edge must not drop targets that have no exact edge to prefer.

**The pre-existing "reachable twice" case was renamed, not deleted.** It declares the exact edge
first, so it answered identically under both implementations and **could never have caught this**,
while being titled as though it pinned resolution order. Its real content — never a *merged* rule
set — is true and kept.

**Ruling P27's full text lives in `docs/lanes/controller-state.md`.** Cite that, not the message
that carried it. Flagged in the PR body as a ruling-directed addition outside T13–T16's scope.

### The finding, kept because the shape of it is the lesson

**`packages/app-core` now holds BOTH answers to one question, in two files**, and the wrong one is
on the surface a user touches.

| Site | Resolves wildcard-vs-exact by | Verdict |
|---|---|---|
| `packages/rule-engine/src/transition.ts:91-93` — **the engine, authoritative** | `find(exact) ?? find('*')` — **exact wins, regardless of declaration order** | correct |
| `packages/app-core/src/precheck.ts:375-378` (`needsMembership`) | `find(exact) ?? find('*')` | **correct, and already documents its own drift caveat** |
| `packages/app-core/src/views/transition-dialog.tsx:23-29` (`transitionOptions`) | iterates `def.transitions` in order, `if (!targets.has(to)) targets.set(...)` — **first declaration wins** | **WRONG** |

**Executed proof** (temporary probe under `packages/app-core`, run and removed; tree verified clean
with `git status`, never a shell `diff`). Given a def declaring the wildcard *before* the specific
edge — which `adviseWorkflowDef` only **warns** about, *"real, but not fatal"*, so it publishes
clean:

```
transitions: [ {from:'*',   to:'done', rules:[]},
               {from:'doing',to:'done', rules:[{kind:'require-evidence'}]} ]

ENGINE  resolves (doing -> done) to  [{kind:'require-evidence'}]     ✓ asserted
DIALOG  resolves (doing -> done) to  []                              ✓ asserted — no evidence prompt
POSITIVE CONTROL: reverse the two declarations and the dialog AGREES  ✓ asserted
```

The control is what makes this a divergence rather than a constant: the dialog's answer **depends on
declaration order**, and the engine's does not.

**The user-visible consequence** is the exact failure mode named in T13's own dispatch: the ticket
sheet offers a transition with no evidence prompt, the user submits, and the server refuses. **It
looks like a bug in the product rather than a rule.**

**Why it went to the controller instead of being fixed on the spot:** it is in **Plan 6's package**
and the fix is a behaviour change, not prose. The reviewer recorded the owner as *"the Plan 6/6a
lane"* — **and Plan 6 closed at step 11**, the second time on this branch that a recorded owner
named something that no longer exists. Parking it against another dead owner would have repeated
the mistake the branch keeps finding, and fixing another plan's package unilaterally is a scope
decision. **Ruling P27 chose to fix it here.**

**The old behaviour was DELIBERATE, and that is the transferable part.** Its docblock had already
considered the multi-edge case and rejected **merging** two rule sets into one no transition
declares — sound reasoning, aimed at an alternative the engine does not implement either. The live
question was exact-versus-wildcard and it was never asked. **A decision argued against a straw
option reads as considered**, which is why it survived review and why the replacement docblock says
so explicitly instead of presenting the new rule as though it had always been obvious.

## IN FLIGHT

**T16 — the closer.** Catalogue plus full verification. No open PR for this step.

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
- **Any clock-sensitive assertion must vary `TZ` explicitly — AND the thing under test must
  actually be TZ-sensitive, or the variance is theatre.** Zero of the pre-step-11 test files varied
  `TZ`; `packages/domain/test/ist-day.test.ts` therefore cannot distinguish *the code computes IST
  correctly* from *the machine is already in IST*. **But Task 12a proved the rule can be satisfied
  vacuously, and it was my prompt that induced it.** Its test looped two timezones and asserted the
  same ISO string came out both times — which is guaranteed by ECMA-262 regardless of the code
  under test, because `Date.prototype.toISOString()` is TZ-invariant *by specification*. The loop
  ran, `TZ` genuinely changed, and the assertion could not fail. **A TZ loop around a TZ-invariant
  function is a check that cannot fail wearing the costume of the rule that forbids them.** Before
  wrapping a TZ loop around anything, name the local-time accessor (`getDate`, `getMonth`,
  `getHours`, `toLocaleString`, …) whose behaviour the loop is supposed to expose; if there isn't
  one, the loop proves nothing and should be replaced by a test of what actually varies.
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
