# Serial executor — live state

**This file is the restart surface.** A controller that kills and relaunches the executor from its
brief recovers only what is written here. Refreshed at every task boundary.

> **Warning about shas in narrative prose.** Every sha cited in any *narrative* document in this
> repo — the dispatch brief, the Chain B handoff, the coordination doc's sections, the narrative
> parts of this file — is a fact about the moment it was written. Anchors in the table below were
> verified with `git branch --contains` (empty output = orphaned), never with `git cat-file`, which
> passes on reflog-only commits and hands you pre-rebase content while looking like it worked.

## Live anchors — 2026-09-02, **STEP 11 IN FLIGHT (Plan 6 remainder)**

**Step 10 is CLOSED — PR #70 merged as `ac187e8`.** Everything below the "STEP 10 RECORD" line is
history. Read it for its *reasoning*, never for its position.

| Anchor | Value | How verified |
|---|---|---|
| **Branch in flight** | **`exec/11-plan6-remainder`**, cut from `ac187e8`. | `git branch --show-current` |
| **`main`** | **`ac187e8`** — step 10 (PR #70) on top of `75c3d1e` (the ledger PR-column fix, #71) and `c9ab31c` (#69). **REFETCH before trusting this.** | `git rev-parse origin/main` |
| **`ac187e8` reachable?** | **YES** — `git branch -r --contains ac187e8` names `origin/main`. | `git branch -r --contains` (empty output = orphaned; `cat-file` would lie) |
| **Ledger** | **177 data rows, 88 done, 89 todo (49.7%)**, counted from the file at this sha with `awk -F'\t' '$1 ~ /^[0-9]+$/'`. Do **not** count it with `wc -l` (206) or `head -1` — the rtk proxy rewrites both and returned `[206 more lines]` for `head -1` in this very session. | `awk` tally over data rows |
| **Plan 6 remaining** | **12 todo**: T5, T7, T8, T10, T11, T12, T12a, T13, T14, T15, T15b, T16. Done: T1–T4 (#16), T6 (#36), T9 (#43). | `grep -E "^06" docs/lanes/task-ledger.tsv` |
| Node | **v22.22.2** under the brief's PATH export. Machine default is **v24.11.1**, outside `>=22 <23`, enforced by nothing. | `node -v` |
| Orphaned, do not cite | every sha in the narrative below the "STEP 10 RECORD" line, and every sha in the step-10 section above it (`44fb736`, `684839f`, `2b9876d`, `eeea9a6`) — **#70 was SQUASHED into `ac187e8`.** | `git branch --contains` |

## WHERE I AM: **STEP 11 — PLAN 6 REMAINDER.** 12 tasks, nothing yet complete.

**This is the first step of Phase 3**, and it goes first because Plan 8's T13–14 and Plan 9's T14 both
need `apps/web`, which is Plan 6 T14.

**Four things step 10 handed this step, all already measured — do not re-derive them from scratch, but
DO re-verify before building on them:**

1. ~~**`board.tsx` is a LIVE DEFECT**~~ — **CLOSED in step 11.** The claim as inherited was *"none of
   those three fields exists in any server response"*, and it is now false on all three, by two
   different routes. `workflowVersion` is **SERVED**: `routes/board.ts` puts `def.version` on every
   column (P25 clause 1's one pure field addition). `assignee.id`/`.name` are **JOINED client-side**
   from `GET /v1/workspaces/:workspaceId/members`, off the `workspaceId` the board body already carries
   — a second shipped route, no invented fact. `getBoard` is one of the six methods the online
   `DataSource` now answers.

   **The correction is the point.** Two of the three were never serving gaps at all; the third was the
   cheapest one on the list. An inherited "exists nowhere" is a reading of a moment, and this one was
   already wrong about a route that a client is allowed to call.
2. **Ruling P24 is TAKEN and binds Task 10** — the SERVER's `UserPreferences` shape wins. Plan 6's
   document is refused three ways by the shipped `.strict()` schema, so this is adoption, not a rename.
   Reversible in one direction only while T10 is unexecuted.
3. **9 of 12 `DataSourceQuery` methods cannot be implemented over the shipped routes**; three of those
   cannot even form their request (`getMyWork`, `getPreferences`, `putPreferences` take no
   `workspaceId`, and those routes 400 `invalid_query` without it). The blocked rows were sorted into
   **serving** gaps (one route change) and **data** gaps (a product decision); step 10 named that sort
   as the thing it was least sure of. **Re-derive the sort before building on it.**
4. **There is ONE fake and NO real `DataSource` anywhere** — `packages/app-core/test/helpers/fake-data-source.ts`.
   It is load-bearing: the only real view component is built against it.

`apps/server/test/integration/client-contract.test.ts` is the machine-checked register of what an HTTP
`DataSource` can and cannot be built from. **Read it before writing one.**

### THE ONE THING A RESTART MUST NOT MISS: **RULING REQUEST P25 IS OPEN AND UNANSWERED**

Written in full at the END of `docs/superpowers/plans/2026-08-20-00-series-coordination.md`, section
*"Step 11 (Plan 6 remainder) — the `DataSource` register, re-derived, and RULING REQUEST P25"*. Read
that section, not this summary, before acting on it.

**The finding.** Step 10's "9 of 12 blocked" reproduces exactly, from the interface body at
`data-source.ts:36-47`. The SORT moves: **6 serving · 1 data · 2 signature**, not 3 signature. Six of
the nine blocked methods are gaps where **the server holds the fact and does not put it on the wire**.

**Why it is a ruling and not a note.** The standing rule sends an out-of-scope finding to a named
owner. That owner is Plan 5. **Plan 5 is 17/17 and merged — it has no task left to carry them.** A gap
recorded against an owner with no remaining tasks is dropped, by the rule meant to prevent dropping it.

**Proposed default, and what has actually been DONE under it.**

- **`getBoard` — DONE.** The one pure field addition; `routes/board.ts` now serves `def.version`.
- **`getMyWorkspaces`, `getTicket`, `getTickets` — HELD.** All three carry a visibility decision under
  Plan 4's read enforcement. `getMyWorkspaces` was mis-priced as a field addition and corrected: no
  route reads `proj_projects` at all, so serving `projects` means designing a read.
- **Signature gaps — DONE in the CLIENT.** `getPreferences`/`putPreferences`/`getMyWork` take a
  `workspaceId`, extending ruling P24 from the document to the signature.
- **`inTransit: []` — answered honestly**, because an online client has no outbox. Not an absence.
- **`contested` — REFUSED, and the REASON was corrected.** The inherited reason ("the attention route
  never reads `proj_contested`") points at the wrong file. **`GET /v1/contests` is shipped**
  (`sync/contests-route.ts:107`, wired at `app.ts:208`, gated per-row by `canSee`) and its own docblock
  says *"The ticket banner, My Work and the attention strip all read this."* The real gap is that
  `ContestView` carries **no `projectId` and no `title`**, both of which `AttentionItem` requires. So
  the fix is one field pair on `/v1/contests`, not a new read in `attention.ts`.

**The part that decides how big this is.** Two of the four — `getTicket` and `getTickets` — carry a
VISIBILITY decision, not a field addition, and sit under Plan 4's read enforcement. **Those two are
being HELD** until the controller answers. The other two are field additions and proceed.

**If a restart finds this unanswered: do not re-derive the register.** It is measured, cited
line-by-line, and one cell that shipped contested was resolved against its own deriver in a follow-up
commit. Re-ask the ruling; do not re-earn it.

| Task | What | State |
|---|---|---|
| T5 | Domain gap guards | **DONE, no code.** All four guards present, each with a check that notices removal. |
| T8 | Online stream | **DONE.** `online/stream.ts`, 26 cases. `StreamItem` widened to five members, event member carries `LedgerEvent`. |
| T7 | Online DataSource + P25's one approved route change | **DONE.** `online/{http,mappers,online-data-source,index}.ts`. **6/12 methods answer, 6 refuse by name.** |
| T10 | List view | **DONE.** `list-model.ts`, `ticket-list.tsx`, `use-preferences.ts`, 47 cases. Ruling P24 now honoured PER HALF via `Chosen<T>`. |
| T11 | My Work + attention strip | **DONE.** `my-work.tsx`, `attention-strip.tsx`, 35 cases. Review shipped clean. |
| T12, T12a, T13 | ticket sheet / attachments / reopen flow | **DONE.** 9 view modules + flows/guarded-child-event.ts, 104 cases. Both reviews shipped clean. |
| T14 | `apps/web` Next.js shell | **NEXT — and it is what Plans 8 and 9 are blocked on.** Greenfield: `apps/web/` does not exist. |
| T15, T15b, T16 | invite + doors + catalogue | **todo.** T15's Playwright smoke goes behind `test:e2e`, NOT `test` — the gate runs `test` only and CI installs no browsers. |

### WHAT "REFUSES" MEANS FOR T10–T13, so a restart does not read it as blocked

Six `DataSourceQuery` methods throw a `ServingGapError` rather than invent a fact. **The views are still
buildable and testable** — they take view types as props and are proven against
`test/helpers/fake-data-source.ts`, exactly as T9's board was. The refusal bites only at runtime with
the ONLINE source, and each one is pinned by a server-side cross-check in
`apps/server/test/integration/client-contract.test.ts` that goes RED the day the route starts serving
the field. Build the views. Do not weaken the refusals to make a view light up.

### Gate at the T12/T12a/T13 commit, measured at the tree reported

**exit 0 · 21/21 · 0 cached · 1902 tests · Node v22.22.2 · 0 engine warnings.**
domain 335 · rule-engine 280 · **server 761** · **app-core 415** · editor 72 · ui 31 · sync-client 8.

Decomposes from main's 1612 in four steps: app-core 130 → 224 (T7+T8) → 311 (T10+T11) → 415
(T12+T12a+T13); server 756 → 761 (the client-contract cross-checks). **Every other package byte-identical throughout**, which
is the check that this branch has not touched what it does not claim to touch.

### RULING P24 WAS BEING VIOLATED BY THIS BRANCH'S OWN CODE, and the fix is a type

`mapPreferences` filled a half-set project's missing half with `DEFAULT_VIEW_PREFS` — exactly what P24
forbids. Closed with `Chosen<T> = {origin:'stored'; value:T} | {origin:'default'}`. **The default arm
carries no `value` deliberately**: a record with both fields expresses the distinction but lets a
consumer read `.value` and ignore `.origin`, leaving the ruling on convention. With no value to read,
the offending line will not compile. Do not "simplify" this back into a pair.

### RECORDED FOR STEP 12 (Plan 7), from the controller's structural scan — not mine to fix

- **`EditorSlotProps`**: Plan 6 declares `doc: unknown`, Plan 7 `doc: DocJson | null`.
- **`AttachmentListEntry`**: Plan 6 inlines the drive-reference fields, Plan 7 uses `& DriveReference`.
- **`EditorSlotUpload` was a FALSE POSITIVE** — identical fields, different line breaks. Named here so
  nobody re-finds it.

Both real ones are the "one contract written twice" seam Plan 6's Open questions 13 and 15 describe:
edit both or neither. **Owner: step 12.**

### RECORDED FOR TASK 16, not fixed — the catalogue lives in §3, and Task 16's own text says §8

Plan 6 Task 16 says *"`Features.md` §8, `test-cases/08-web-client.md` (cases 8.x only — no other
numbers)"*. **Every Plan 6 client feature already shipped is catalogued under `Features.md` §3 and
`test-cases/03-foundation-ledger.md`** — the `DataSource` contract (`:31`), the submit factory
(`:33`), provenance (`:34`), the pre-check cache (`:35`), the live-query hook (`:37`), the board view
(`:39`). There is **no §8 header in `Features.md` at all** (it runs §7 → §9) and no
`test-cases/08-web-client.md`. Task 8's two new cases were filed as 3.33/3.34, next to their siblings,
which is the consistent choice and the one that conflicts with the instruction.

**Owner: Plan 6 Task 16.** It has to decide whether to open §8 and migrate six bullets plus their
cases, or to record §3 as the real home and amend its own text. Not fixed here, because moving a
catalogue mid-step would put half of Plan 6 in each place — which is worse than either.
| T10 | List view | **todo** — bound by ruling P24 |
| T11, T12, T12a, T13 | My Work / ticket sheet / attachments / reopen flow | **todo** |
| T14 | `apps/web` Next.js shell | **todo** — the thing Plans 8 and 9 are waiting on |
| T15, T15b | Invite acceptance + Playwright smoke; the doors | **todo** |
| T16 | `Features.md` §8, `test-cases/08-web-client.md`, full verification | **todo** |

### THE FINAL REVIEW'S RESULT IS THE MOST USEFUL THING ON THIS BRANCH — read it before the code

**Every one of its six findings was against a DOCUMENT, and every one was the executor's own prose.**
The code, the tests and the catalogues came through clean. Three were Important, and all three are
the failure classes this very branch documents, committed by the party writing the documentation
about them:

1. **The restart surface contradicted itself.** This file's heading still read *"Task A of three, in
   flight"* and *"Nothing is committed on the branch yet"*, three lines under an anchors row saying
   the opposite. That is `a63b326`'s lesson — *a pointer from a correct document to a stale one
   reverses* — recurring **in the same file, on the same branch that cites it.** A patched table does
   not repair a heading, and a restarted session reads the heading first.
2. **The signature-failure lesson named the WRONG MODULE, in four places** including the production
   docblock. It said the rule engine's `restrict-to` suite is green because `memory-context.ts`
   carries memberships. **It does not** — `memory-context.ts:151-159` answers null for
   `'membership'`, and `test/memory-context.test.ts:214` is a case named *"does not serve memberships
   — this context is a SECOND context, not a replacement"*. **`fixtures/harness.ts:294` alone
   answers.** The root cause is a misread antecedent at `memory-context.ts:18-24`, and **the branch
   already carried the correct version** at case 6.136 and in `docs/plan-3-chain-b-handoff.md`. The
   executor introduced the error in its own dispatch prompt and it propagated outward from there.
3. **"Only `lockWorkspace`/`lockEntity` has no coverage anywhere" was false**, in four places.
   `test/event-store.test.ts:83` is `lockEntity holds off a second transaction until the first
   commits (falsifiable)` — it asserts non-acquisition after 100 ms, asserts `pg_locks` holds exactly
   one ungranted advisory lock, then asserts acquisition on commit; `:242` drives `lockWorkspace`.
   The true claim is **"uncovered through the real door"**. An absence claim was published without
   the sweep this repo's own rule demands.

The Minors were the same shape: a positive control quoted as `4/5/3/1` where the grep returns
`4/5/3/2` (the test file had it right and the two documents did not), and **"9 of 11" where
`DataSourceQuery` declares 12 methods** — the table has 11 rows only because `getPreferences` and
`putPreferences` share one, so the fraction mixed rows into a denominator of methods. **9 of 12.**

**The fix round found MORE copies than the review cited in every single case** — four where three
were named, twice — and corrected two copies that predate this branch, on the ground that leaving
them would make one document assert both readings of the same fact. It also caught two errors its own
edits introduced. Nothing was refuted, because nothing was refutable.

**The lesson, since it is the one this step actually earned:** the branch's tests were mutation-proved
and its prose was not. Six false claims in documents that later plans navigate by, on a branch whose
own thesis is that a claim without an executed check behind it is not evidence. **Prose is not exempt
from the falsifiability law, and it is the part no gate runs.**

### Task B — what it added, and the finding that nearly escaped

Two files under `apps/server/test/integration/`, 36 cases.

`real-door-round-trip.test.ts` (21) builds its world ONLY through the shipped doors and reads it
back through the shipped read routes. No `applyCommitted`, no `insertEvent`, no INSERT into any
projection table — the four `db.pool.query` calls (`:222`, `:838`, `:870`, `:964`) are SELECTs used
as oracles. It also carries **the repo's first proof that varies `TZ`**: three zones, the expectation
computed without the function under test, a first case proving the knob moves before anything leans
on it, and the mutation captured as a number rather than a colour — under
`formatUtcDay` reading `getDate()`/`getMonth()`/`getFullYear()` instead of their UTC forms, the three
zones answer different `daysInFlight` and the run reddens. The expected count is **computed at run
time, not hard-coded**: pinning the frozen instant to 20:00Z makes the IST-correct answer 30 or 31
depending on where in the Indian evening the entry instant fell, so naming either number as *the*
answer would be a fixture that is right on some runs and wrong on others. That closes the brief's
known gap #2 for this surface.

`client-contract.test.ts` (15) pins the divergences, sorted into **signature / serving / data** gaps
because the sort decides whether each is a client edit, a route change, or a product decision.

**THE FINDING WORTH CARRYING FORWARD.** Its docblock claimed it would redden "the day either side
moves". The reviewer MEASURED that claim and it was false in the client direction: adding
`scope-revoked` to `StreamItem` in `packages/app-core` reconciled the divergence and the suite still
passed. The client half was literals the test file typed about itself, so two assertions could only
fire on someone editing the line directly above them. **A file whose whole purpose is to notice
movement, that could not notice movement.** It now derives those facts by `readFileSync` over the
sibling source text — which preserves the reason the package import was refused, since the text is
the checked-in `.ts` and never `./dist` — and the extractors THROW rather than returning `[]`,
because an empty list satisfies every `not.toContain` in the file. **I re-ran the reconciliation
myself: one death, by name, with the derived array grown to five — which is what proves the
extractor parsed the mutation instead of failing open.**

### RECORDED FOR THE CONTROLLER, not fixed — `pnpm check:tasks` fails

It is **not a gate**: CI runs `pnpm check:env` and `pnpm turbo run build test typecheck`, and
`check:tasks` appears in neither. It is not this branch's doing either —
`git diff origin/main -- docs/lanes/task-ledger.tsv` is **empty**, so it fails identically on `main`.
It reports rows with `pr "-"` (04/2, 04/3, 06/1–4, 07/1–3, 10/1–3, 10/8). **Owner: the controller**,
whose file the ledger is.

### Gate, run by the executor at the tree being reported — THREE TIMES, and the third is the one that matters

**exit 0 · 21/21 · 0 cached · 1612 tests · Node v22.22.2 · 0 `Unsupported engine` WARNs.**
domain 335 · rule-engine 280 · **server 756** · app-core 130 · editor 72 · ui 31 · sync-client 8.

**The delta decomposes twice over.** Main 1573 → 1576 after Task A (+3, all `engine-context.test.ts`,
15 → 18 `it(`) → 1612 after Task B (+36, all `apps/server`, 720 → 756, split 21 round-trip + 15
contract). Every other package is unchanged, as it must be: **the branch changes nothing under
`packages/`** — its single production edit is `apps/server/src/engine-context.ts`.

**The post-review fix round was gated again and came back byte-identical: 1612, same composition,
Node v22.22.2, 0 cached, 0 engine warnings.** For a round that changed only comments and prose that
is the expected result, and it is the evidence that no behaviour moved — a prose round whose totals
shifted would mean something was edited that was not prose.

### Task A — what it cost and what it bought, since a successor should not re-derive it

`getEntityState('membership')` now reads `proj_memberships` through **`resolveEffectiveRole`**, never
a SELECT of its own, and the id is decoded **fail-closed by re-encoding it and comparing to the
input**. It is answered BEFORE the head read, because a membership head row is the §9 hazard's own
instrument and a head gate would be true for every membership the ledger can produce — a check that
cannot fail, in an authorisation path.

**Two mutations survived a green 720-test suite and are why the task has three tests rather than
one.** The reviewer found both; the fix round confirmed and closed both, and pushed back on the
reviewer's METHOD (it proposed a hand-written `proj_memberships` row; the fixture is built through
the ledger instead, which the file's own `granted()` docblock demands).

1. Replacing `resolveEffectiveRole` with a bare `WHERE workspace_id = $1 AND user_id = $2` passed
   **all 720**. It hands back a revoked person's surviving project-roster row as a role — because
   `membership.revoked` deletes the workspace-scope row ALONE and the guarantee lives in
   `resolveEffectiveRole`'s early return. **I re-ran this mutation myself: exactly one death, the
   named case, `expected { kind: 'membership', …(4) } to be null`, with the ADMIN_USER `toEqual`
   above it passing in the same run — so the mutated path is confirmed executed.**
2. `role: eff.workspaceRole === 'admin' ? 'admin' : 'guest'` passed all 720, because `role` was only
   ever witnessed as `'admin'`. The `member` REFUSAL cannot see it — `'guest'` is no more in
   `['admin']` than `'member'` is — so only a direct read of the whole state catches it.

Gate at `44fb736`: **exit 0 · 21/21 · 0 cached · 1576 tests · Node v22.22.2 · 0 engine warnings.**
Decomposes: **+3 from main's 1573, entirely in `apps/server` (717 → 720), entirely in
`engine-context.test.ts` (15 → 18 `it(`)**, the only server test file the change touches.

### The scope was RE-MEASURED at `c9ab31c`, and the brief and the previous recon are both wrong

Do not work from the dispatch brief's description of step 10, and do not work from the predecessor's
"six shape disagreements" either. Both were recounted from the routes' own `return` statements and
the two type files. Findings, each with a positive control run in the same command:

**1. The six `applyCommitted` absences are NOT the target — five are already closed.**
`lockWorkspace`/`lockEntity` is the only one uncovered **through the real door**. Both are covered
directly, so "no coverage anywhere" would be false: `test/event-store.test.ts:83` is
*`lockEntity` holds off a second transaction until the first commits (falsifiable)* — it asserts B
has not acquired after 100 ms, that `pg_locks` reports exactly one ungranted advisory lock in this
database, and that B acquires the moment A commits — and `lockWorkspace` is driven at
`event-store.test.ts:242` by `appendUnderBothLocks`. Seqs-from-the-DB,
`checkPermission`, the rule engine, `bootstrapWorkspace` and `notifyCommitted` are each already
exercised through the real door — the last by `stream-route.test.ts`'s `submit()`, whose docblock
says exactly why a row-writing helper cannot drive the hub.

**2. The real gap is one sentence.** *Every Plan 5 read-route test seeds through `applyCommitted`
and none of them writes through `POST /v1/events`.* Measured: `grep -l "v1/events"` over
`board|list|search|my-work|attention|preferences`.test.ts returns **nothing**; the same grep returns
4 · 5 · 3 · 2 for `workspaces` · `invites` · `security` · `stream-route`. The grep can hit. (The
first three are in `test/routes/`; `stream-route.test.ts` is in `test/stream/`, so it is the same
grep and not the same directory. `grep -c v1/events test/stream/stream-route.test.ts` is **2** — a
docblock mention at `:114` and the real `url: '/v1/events'` at `:126`.)

**3. The write half is already proven end to end** — `workspaces.test.ts` does real sign-in →
`POST /v1/workspaces` → `project.created` → `project.member_added` → `ticket.created`, all
committing, then asserts **`proj_tickets` by querying the table directly**. So the missing link is
small and precise: *nothing on `main` reads back through a shipped READ route what a real POST
wrote.*

**4. The client contract is worse than "six disagreements": 9 of 12 `DataSourceQuery` methods cannot
be implemented over the shipped routes**, and 3 of those cannot even form their request
(`getMyWork`, `getPreferences`, `putPreferences` take no `workspaceId`; all three routes 400
`invalid_query` without it). **The denominator is 12** — `packages/app-core/src/data-source.ts`
declares twelve methods on `DataSourceQuery`, and 9 blocked + 3 adaptable = 12; the register's table
shows only 11 rows because `getPreferences` and `putPreferences` share one, so do not recount it from
rows. The full register — per method, with the serving-gap vs data-gap
distinction that decides who fixes each — is in the coordination doc section this step adds. The
distinction matters: a **serving** gap is a fact the server holds and does not put on the wire (one
route change); a **data** gap is a fact it does not have (a product decision).

**5. A live defect, not a disagreement.** *(CLOSED in step 11 — see the correction at the top of this
file. `workflowVersion` is served; `assignee` is joined from the members route. The sentence below was
true of `main` when written and is false now, and it is kept only because the correction above cites
it.)* `packages/app-core/src/views/board.tsx` — the one real view component on `main`, fed by
`source.query.getBoard()` — dereferences `group.workflowVersion` (line 28) and `card.assignee.id`/`.name`
(line 94). Neither is in any response. It breaks the moment an HTTP `DataSource` exists.
**Owner: Plan 6, which is step 11.**

**6. `StreamItem` has no `scope-revoked` member**, so a revocation arrives as an unrecognised `type`
and is silently dropped, leaving stale authorization in the client cache. Severest of the stream
items. Owner Plan 6. Does not change this step's scope — no client consumer exists yet.
**CLOSED in step 11 (Plan 6 Task 8)**, together with the `workspaceSeq` drift beside it: the union has
five members and its event member carries `LedgerEvent`. `error.code` remains bare `string`.

### RULING TAKEN THIS STEP — `UserPreferences` (coordination doc §6b), the one with a deadline

**The SERVER's shape wins; Plan 6 Task 10 adopts it.** The doc called the two "informationally
equivalent … the cost is a decision, not a migration." True in the abstract, misleading in practice:
the shipped schema is `.strict()`, so Plan 6's document is **refused at the door three times over** —
unknown key `version`, `SavedFilter.filter` vs the shipped `filterSpec`, and project keys narrowed to
`ulidString` while Plan 6's fixtures key by `prj_1`. One asymmetry the doc does not name: server →
client is **not total**, because the client pairs `{columns, grouping}` under one project key and the
server keeps two parallel records; a project in `listColumns` and absent from `grouping` has no
faithful client representation, and reaching for `DEFAULT_VIEW_PREFS` there invents a preference the
user never set. Conservative default, and reversible in one direction only while Plan 6 T10 is
unexecuted — which is why it is ruled now.

### Ruling P18 is DISCHARGED BY THIS STEP, and it was genuinely unclaimed

The coordination doc hands it to *"whoever dispatches Plan 4 Task 6 or the step-10 integration
checkpoint, whichever comes first."* Plan 4 T6 ran and did not take it: `engine-context.ts` still
answered `null` for `'membership'` at `c9ab31c`, and the only section the doc gained from T6 is about
determinism tests. So it falls here, and the conservative default the doc names binds — **it lands as
its own reviewed change**, which is Task A.

It is a **functionality gap, not a security defect**, and saying so is load-bearing: `restrict-to`
fails CLOSED, so every role-gated transition rule is refused for everyone on the server path. Anyone
reporting it as an authorisation bypass will provoke a mis-sequencing ruling. The reason nothing
noticed is this series' signature failure in its purest form: the rule engine's own `restrict-to`
tests pass against **`packages/rule-engine/src/fixtures/harness.ts` alone** — it is the only
in-memory context that carries `fx.memberships` and answers (`harness.ts:294`), and the eleven
`rule-restrict-to-*` fixtures run through it via `test/fixtures.test.ts`. The SECOND in-memory context, `memory-context.ts`, answered
`null` for `'membership'` exactly as the server did, and its own suite pins that
(`test/memory-context.test.ts:214`, *"does not serve memberships — this context is a SECOND context,
not a replacement"*). So: green on the one side with the fake, untested everywhere else.

---

## BELOW THIS LINE IS THE STEP 9 / STEP 10 RECORD — history, not position. Every sha in it is orphaned.

### How to find Plan 5's work now that its shas are dead

Do not chase the shas. **The work is one squashed commit, `563c983`.** For a task's actual content use
`git log --oneline 1223c4c..563c983` (empty — it is one commit) or read the files directly; the task
names live in `Features.md` §7 and `test-cases/07-api-realtime-search.md`, which are the durable index.
**The status table further down is kept for its REVIEW OUTCOMES, which are still true. Its shas are
not.**

### STEP 10 IS ALREADY SCOPED — read-only recon, run 2026-09-02, before you re-derive any of it

**The brief's framing of step 10 is wrong in one way and understated in another.** Both corrections
are measured, with a positive control (`rtk proxy grep -rn "FakeDataSource"` returned the 3 files it
should, run before any null result below was trusted).

**WRONG: there is only ONE fake, and Plans 8 and 9 have no client code in this repo at all.**
`packages/app-core/test/helpers/fake-data-source.ts` (`createFakeDataSource`) is the whole of it, and
it is total — it implements every one of `DataSource`'s 12 query methods plus `ingest` and
`subscribe`. Its own docblock already calls itself a *"SANCTIONED MOCKED-CONTRACT SEAM"*. **No
`http-data-source.ts` or online `DataSource` exists anywhere**, so the fake is the only implementation
there is. It is consumed by `cache.test.ts`, `data-source.test.ts` and `board.test.tsx` — and
`board.tsx` is the one real view component in the repo, so it is load-bearing. Nothing server-facing
was found in `packages/editor`, `packages/ui` or `packages/sync-client`.
*(`stream-frames.ts:161` names the stream fake's readers as Plans 6, 9 and 10 — reconcile that against
the brief's "6a, 8 and 9" before scoping.)*

**UNDERSTATED: SIX confirmed shape disagreements, not the two already known.** The two known ones hold
exactly as recorded. The four new ones, each cited:

| # | Contract | The disagreement |
|---|---|---|
| c | `StreamItem` vs `ServerStreamFrame` | **Self-documented in `stream-frames.ts:143-162`. Two of the three CLOSED in step 11 (Plan 6 Task 8):** the event member now carries `LedgerEvent` and so holds `workspaceSeq`, and `scope-revoked` is a fifth member carrying the server's `projectId?: never` verbatim. **Still open: `error.code` is bare `string` vs the server's typed enum**, so a misspelled code is a runtime surprise rather than a compile error. `stream-frames.ts` argues the end state is REPLACEMENT by `ServerStreamFrame`, not re-synchronisation — owner Plan 10 |
| d | `SearchHit` vs the real search response | Client expects a **flat array**; server returns `{workspaceId, query, hits:[{card: TicketCard, snippet}]}`. **`matchedIn` does not exist server-side at all** — the server headlines title+description+comments into one blob and cannot say which field matched |
| e | `MyWorkView` vs `MyWorkResponse` | **The most severe: a different grouping MODEL, not a rename.** Client `{assigned, inTransit, contested}` vs server `{open, active, terminal}`. **`contested` does not exist server-side** (`my-work.ts:96` calls it a Plan 10 extension point) |
| f | `BoardView` vs `BoardResponse` | Client nests columns under `groups: BoardGroup[]`; server returns a **flat** `columns[]`. Card level: client `assignee: Actor \| null` **with `.name`** vs server `assigneeId: string \| null`, never resolved — and **`board.tsx:94` already reads `card.assignee.id`/`.name`**, so this is live, not dead |
| + | `getPreferences` / `getMyWork` signatures | Take **no `workspaceId`**, but both routes 400 `invalid_query` without `?workspaceId=`. `putPreferences` is typed `Promise<void>`; the real PUT returns the stored document |
| + | `WorkspaceRef` vs `GET /v1/me/workspaces` | Wrapped not bare, `id`→`workspaceId`, `role` added, **`projects` absent entirely** |

**That last row is the one to think about.** `GET /v1/me/workspaces` has the repo's ONLY real
POST→GET round-trip test (`workspaces.test.ts:375-392`), it is green — **and it still disagrees with
the client contract.** So a passing end-to-end test does not close this gap unless it is asserted
against the CLIENT's shape.

**NO end-to-end test exists for the new read surface.** Every read-route test builds its world through
`read-app.ts` → `applyCommitted`, i.e. through the six-absence seeder. Two near-misses, both
incomplete: `security.test.ts:96` does a real `POST /v1/events` but never reads it back through a
route; `security.test.ts:156` reads through a real route but seeds via raw `insertEvent`, bypassing
ingest entirely. **The real building blocks already exist** — `buildTestApp()` (real Fastify, real
auth, the real gated `IngestService`, real projection registry, no stubs) and `createTestDatabase()`
(real Postgres, real migrations).

**THE FIRST TEST TO WRITE, and why this one:** a real founding-through-board round trip —
`POST /v1/workspaces` → `POST /v1/events` with `project.created` + `ticket.created` under a real
signed-in session → `GET /v1/projects/:projectId/board`, asserting the raw body. It is **the only
scenario that can exercise `bootstrapWorkspace` at all**, since its side effects fire only from a real
`workspace.created` through real ingest; in the same flow it proves the seqs come from the database
rather than the process map, and that the permission gate and rule engine admit an ordinary creation —
**three of the six absences closed by one scenario.** And because `board.tsx` is the one view built
against the fake, it surfaces disagreements (b) and (f) in the place the client already depends on
them.

**Not established, time-boxed:** `getMembers`/`Actor`, `getTicket`/`ParentRef`,
`getTicketHistory`/`TicketHistoryEvent`, `getWorkflowDef`/`WorkflowDef` were not compared in depth —
plausible homes for a seventh and eighth disagreement.

### WHAT THE NEXT SESSION SHOULD DO

**STALE WHEN WRITTEN — kept only so the paragraph below it stays readable.** This said the next item
was step 10. **Step 10 merged as `ac187e8`.** The live position is the "WHERE I AM" section at the top
of this file, and it is step 11. Nothing in this document assigns the executor any step-9 or step-10
work, and re-running any of it would be redoing merged work against orphaned shas.

## THE RULE THIS COST US — kept because it generalises, though its example is now history

**`git cherry` belongs BEFORE the pre-rebase gate rule fires. An ahead-count is not a work-count.**

`git rev-list --left-right --count` measures **commit identity**; `git merge-tree` measures **a merge**.
Neither asks the only question that matters — *is this content already upstream?* A branch whose commits
were rebase-merged keeps its own shas, so it reports "4 ahead" forever while contributing nothing. The
previous recon read `30 / 4` plus two real conflicts and concluded there was a large rebase to perform.
Both readings were accurate; the conclusion was false.

**The cheapest way to make a rebase gate unnecessary is discovering there is no rebase.** For every
remaining branch in the serial order, run `git cherry -v origin/main <branch>` FIRST. `-` on every line
means delete the branch and start from main.

**Cost of learning it late:** a pre-rebase gate was run at `5c71689` per the coordination doc's rule —
**green, 15/15 tasks, exit 0, 488 tests, Node v22.22.2**. It is recorded here as a footnote only. It
measured a tree strictly *behind* main and is **a control for nothing**. Do not place 488 beside any
main-derived total: they are different trees, and a total that rises without decomposing is exactly what
the coordination doc warns against.

## Gate composition — recounted at the sha being reported (step 6 complete)

**GREEN.** Redirected to a file, **never piped, nothing chained after it** — any following command
becomes the status you are shown, a bare `echo` included.

| Measure | `main @ 40c5219` | step 6 final |
|---|---|---|
| **Node** | v22.22.2 | **v22.22.2** |
| Exit code | 0 | **0** |
| Turbo tasks | 21/21, 0 cached | **21/21, 0 cached** |
| **Tests** | **1032** | **1070** |
| **server** | 237 | **275** |
| domain 276 · rule-engine 278 · app-core 130 · editor 72 · ui 31 · sync-client 8 | unchanged | unchanged |

**The delta decomposes: +38, entirely in `apps/server` (237 → 275)** — `contest-coherence.test.ts` 13 ·
`contest-coherence-door.test.ts` 6 · `contested-projection.test.ts` 6 · `contests-route.test.ts` **8**
(7 from the task + **1 added by the Minor fix**, the `open=false` refusal) · `engine-context.test.ts` +4
· `verify-projections.test.ts` +1. Every other package is unchanged, as it must be — step 6 touches only
`apps/server`, and the one `packages/` file it reads it does not modify.

**The jsonb column was validated by OBSERVATION, not by reasoning from the type name.** The contract
forbids `json` because it has no equality operator and the verifier's `EXCEPT` diff needs one.
`original_event` is this repo's **first `jsonb` projection column**, so whether the ban extends to it was
an open question. Measured: a real contest committed, `verifyProjections` clean; one live cell tampered
via `jsonb_set` → `{clean:false, tables:['proj_contested']}`; cell restored → clean again. **jsonb
satisfies the requirement the `json` ban is about, and the instrument was proven live in the same run.**

## What was verified about step 4's surface, so the next session does not re-pay for it

| Claim | Finding | How |
|---|---|---|
| Coordination-doc conflict would lose content | **FALSE — nothing to re-append.** The branch's 154-line §7 block is **byte-identical** on main. The one-line diff seen initially was the extraction picking up main's *next* heading (`### 8. The envelope-origin gate has landed`) | `git diff --no-index` over both extracted blocks |
| `app.ts` conflict would lose content | **FALSE.** Main's `app.ts` is a strict superset — it has the branch's `auth: Auth` block *and* the `ingest: ClientIngest` narrowing the branch lacks | read both blobs |
| T5 is unstarted | **PARTLY FALSE.** T5's **first branch already landed on main** via `fc904f4`: `checkPermission`, `SERVER_ORIGIN_RULE`, `SERVER_ORIGIN_REASON`, and the `SubmissionGate` type — which its own comment says was "named as a type so Task 5 can widen it to carry the session (`(env, session)`) without every call site changing shape." **T5 WIDENS; it does not create.** | read `apps/server/src/permissions/check-permission.ts` on main |
| T4 is unstarted | **TRUE.** `proj_memberships` appears on main only in doc comments — `registry.ts`, `engine-context.ts`, plan text. No implementation file, and `buildProjectionRegistry` registers exactly two projections | `git grep`, read `projections/index.ts` |
| CSRF anchor line | **`sign-in-flows.test.ts:148` on `main @ 91df593`**, content confirmed: `expect(attributes).toEqual(['Max-Age=604800', 'Path=/', 'HttpOnly', 'SameSite=Lax']);` — re-verified on main, not merely on the stale branch, because T5 item 3 anchors a sentence to a line and line numbers drift across a rebase-merge | `awk` over the blob at `origin/main` |
| `docs/` affects the gate | **NO.** `turbo.json` declares no `inputs`, and `docs/` sits outside every package, so a docs-only merge cannot move gate composition. **PRs #48 and #49 were both docs-only** — do not re-run a gate to "check" them | read `turbo.json` |

## Where I am in the serial sequence

# ★ STEP 9 IS COMPLETE AND **MERGED** — PR #67 → `563c983`, 2026-09-02. ★

**This whole section is now a RECORD of a finished step, not a status.** It was written while the PR
was open and it still says so in places; every sha in it is orphaned by the squash. Read it for the
review outcomes and the lessons, not for position — position is the anchors table at the top.

**Nothing is in flight. The executor's work on this step is finished; the controller merges.**

| Task | Review outcome |
|---|---|
| T1 `docToPlainText` · T2 FilterSpec + compiler | done pre-restart; T2 had a fix round |
| T3 `workspace.settings_set` | clean, 1 Minor fixed |
| T4 `proj_workspace_settings` + shared helpers | clean, 1 Minor fixed |
| **T5 FLOOR** visibility predicate in SQL | 1 **Important** + 2 Minor, fixed and proven |
| T6 `proj_search` (tsvector) | **CLEAN — zero findings** |
| T7 read models / TicketCard | **CLEAN — zero findings** |
| T8 `GET /board` | **CLEAN — zero findings** |
| T9 `GET /tickets` list read | clean, 1 Minor fixed |
| **T9b FLOOR** builder reads | 2 **Important** + 3 Minor + 1 ruling, all closed |
| T10 `GET /v1/search` | clean, 1 Minor fixed |
| T11 `/me/work` · T12 `/attention` | **CLEAN — zero findings each** |
| T13 `/me/preferences` | **CLEAN — zero findings** |
| **T14 FLOOR** stream frames + hub | 2 **Important** + 4 Minor + 1 Nit, all closed |
| **T15 FLOOR** WS `/v1/stream` | 1 **Important (a LIVE bug)** + 5 more, all closed |
| T16 catalogue reconciliation | **CLEAN**, +0 tests as expected |
| **Final whole-branch review (1 opus)** | **No Critical, no Important. SAFE TO MERGE.** 2 Minor + 2 Nit, all fixed. |

**FINAL GATE ON THE BRANCH, re-run by the executor at the tip, never taken from an agent's report:**
**exit 0 · 21/21 · 0 cached · 1573 tests** — domain 335 · rule-engine 280 · **server 717** ·
app-core 130 · editor 72 · ui 31 · sync-client 8. Zero `Unsupported engine` WARNs, **Node v22.22.2**.
`pnpm check:env` (the other CI step) also passes.

**BRANCH POSITION AS MEASURED ON 2026-09-01, BEFORE THE MERGE — historical, and every value here is
now superseded by the anchors table at the top of this file:**
`origin/main` was `1223c4c`; merge-base `00cb2e0`; branch **93 commits ahead**, main 6 ahead.
**All of that is spent — #67 squashed those 93 commits into `563c983`.** The paragraph is kept for the
measurement lesson below, which is the part that generalises.
**`git log --oneline origin/main..HEAD | wc -l` printed 50 — a PROXIED WRONG COUNT.** The raw
`rtk proxy git rev-list --count` says 93. That is the "silent wrong COUNT" mode from the rtk notes,
met live at the last measurement of the step. **Pipe a count through the proxy and you get a
well-formed lie.**

**NOT REBASED, deliberately — and it merged clean, so the call held.** `git merge-tree --write-tree
origin/main HEAD` → **exit 0, zero conflicts**, and main's 6 commits touched only `docs/lanes/controller-state.md`,
`docs/lanes/task-ledger.tsv` and `scripts/check-task-ledger.mjs` — **no file this branch touches.**
Rebasing 93 commits would orphan every sha this file and 50 commit messages cite, for no gain.

**CI will not fail on the new ledger script:** `check:tasks` exists in `package.json` but
`.github/workflows/ci.yml` runs only `pnpm check:env` and `pnpm turbo run build test typecheck`.
**But the merger should know:** main's `992c459`/`1223c4c` rewrote the `done` evidence rule after this
branch diverged, so Plan 5's ledger rows must satisfy the NEW artefact-evidence rule. **The ledger is
the controller's file and this branch deliberately does not touch it.**

## WHAT THIS STEP FOUND — the through-line, because it repeated six times

**A negative assertion is only as good as your ability to make it fire.** Six instances, each caught
by a different party, none by a rule:

1. **T2** — `expect(sql).not.toContain(hostile)` **fired on CORRECT code**. It measures whether a
   value LOOKS like SQL, not whether it was concatenated.
2. **T9b** — a `__proto__` state id, and every live ticket in it, vanished from a response. The
   earlier fix used `toString` as its proof value, and `toString` is exactly the value that makes such
   a fix look complete: plain assignment shadows the prototype method, while `__proto__` assigns
   through an accessor that creates **no own key**. **A proof run with one value proves that value.**
3. **T9b's fix** — a *literal* `{ __proto__: 1 }` in the expected object collapses identically, so the
   new assertion would have passed against the defect. **The test for a `__proto__` bug can have the
   `__proto__` bug.** It uses a computed key.
4. **T10** — `not.toContain(secret)` on a snippet **survived a real leak**, because `ts_headline`
   windows onto a match and never renders unmatched text. Replaced by a substring-of-its-own-row form.
5. **T14** — the assertion carrying the task's central disclosure decision inspected only
   `frames.slice(-1)`, which is structurally incapable of holding the id it forbade.
6. **T15** — `expect(hub.stats().subscriptions).toBeGreaterThan(0)` was satisfied by the case's own
   well-formed subscribe, so a malformed frame opening a real subscription passed it.

**Two more rules earned here, both now in the catalogue's header or a docblock:**
- **NAME THE CASES A MUTATION KILLS, NEVER THE COUNT** — unless deterministic AND reproduced by a
  second party. "Reddens seven cases" re-ran as 15, 18, 4, 15; a "dies 6" measured 7.
- **A MUTATION CAN BE INERT IN ITS FIXTURE.** T14's reviewer proposed one that emitted nothing at that
  cursor, so its "all tests passed" was evidence of nothing. **Confirm the mutated path EXECUTED
  before concluding anything from a survivor** — and a survivor is a MISSING FIXTURE until proven
  otherwise (T12 had four survive on first run and closed all four with fixtures).

## OPEN ITEMS FOR THE CONTROLLER — none block the merge

1. **§6b, coordination doc: Plan 6 declares an INCOMPATIBLE `UserPreferences`.** Informationally
   equivalent to the server's, so it is a naming conflict — **but it needs a ruling before Plan 6
   Task 10.** This is the one item with a deadline.
2. **One EXECUTOR RULING was made and recorded (coordination doc §5): a guest may NOT call
   `GET /v1/workspaces/:id/members`.** The plan settles who is hidden from the listing and never says
   who may call it, so a guest invited to one shared ticket was receiving the workspace's entire staff
   directory. Conservative default, cheap to reverse, owner Plan 8.
3. **An OWNER QUESTION, shipped per the spec's plain reading:** `terminalChildren` counts children the
   viewer cannot see. Supported by one illustrative sentence in the product design doc, not a ruling.
   Reversible in one JOIN predicate.
4. **The integration checkpoint (sequence step 10) is now due and it has a specific target.**
   `applyCommitted` enumerates six things real ingest does that it does not — no locks, seqs from a
   process map rather than the DB, no permission gate, no rule engine, no `bootstrapWorkspace`, no
   stream notify — and nearly every read test on this branch is built on it. **A read model green
   against it is proven correct about ROWS and proven nothing about whether those rows are reachable
   through the shipped door.**
5. Recorded with named owners, not fixed: the stream suite's tenancy coverage is an artifact of test
   order (Plan 4); `foldStateIdForward`'s prototype hazard (Plan 3); `assigneeId` cannot distinguish
   never-assigned from unassigned (Plan 3); `rollupFor` N+1 at 50 hits (Plan 5 T7's own note).

### THE SEAM — exactly where a successor picks up

**Plan 5 has THREE commits of its own**, now sitting directly on `origin/main` (`00cb2e0`) after the
rebase. **These are the POST-rebase shas; the pre-rebase ones are orphaned and listed in the anchors
table above:**

| sha | task |
|---|---|
| `b5a776c` | **T1** `docToPlainText` — closed a termination gap the pulled-forward walker shipped with |
| `3c107c4` | **T2** FilterSpec + the injection-proof compiler |
| `9286404` | **T2's fix round** — the NUL byte, and a guard that fired on correct code |

**Four files are Plan 5's whole surface so far:** `packages/domain/src/doc-text.ts` (+31),
`packages/domain/src/filter-spec.ts` (+63), `apps/server/src/read/compile-filter.ts` (+116),
`apps/server/src/read/sql-params.ts` (+27). `Features.md` **§7** and
`test-cases/07-api-realtime-search.md` were **opened by T2 in its own change set.**

**T3 AND T4 ARE DONE AND REVIEWED.** Commits: T3 `f57f084`, its doc correction `597b8be`, T4 `2e4c54e`,
T4's doc correction + honest-helper docblock in the commit after it.

**NEXT: Plan 5 Task 5** (the SQL visibility predicate, plan line 1213) — **FLOOR-LIST**: opus
implementer AND opus reviewer. **Remaining floor-list in this plan: T5 (1213), T9b (3183), T14 (4918),
T15 (5452).** Then T6 (1579), T7 (1821), T8 (2315), T9 (2657), T10 (3638), T11 (3874), T12 (4079),
T13 (4551), T16 (6047).

### NOTHING IS IN FLIGHT. T3, T4 AND T5 ARE ALL DONE, REVIEWED, AND PUSHED.

| Task | Commits | Review outcome |
|---|---|---|
| T3 `workspace.settings_set` | `f57f084`, doc fix `597b8be` | clean, 1 Minor (fixed) |
| T4 `proj_workspace_settings` | `2e4c54e`, doc fix `0a140fa` | clean, 1 Minor (fixed) |
| T5 **FLOOR-LIST** visibility predicate | `34c62fd`, `e582909`, `6a19638`, fix round `2f24959` | 1 **Important** + 2 Minor, all fixed and PROVEN |
| T6 `proj_search` (tsvector) | `a21448d`, `91ea648` | **CLEAN — zero findings** |
| T7 read models / TicketCard | `36c3d85`, `0422b20`, `41bb405` | **CLEAN — zero findings**; 18 mutations, 17 killed, 1 survivor correctly diagnosed as an unconstrained path |
| T8 `GET /board` (first route) | `d6245e1`, `5a51097`, `6264776`, `dd58777`, `ccfc625`, `0c74fde` | **CLEAN — zero findings**; both door mutations die |
| T9 `GET /tickets` (list read) | `7bab0b0`, `699aa18`, `c1f577f`, `ca6c39b`, `cc4536c`, `27f64b2`, + doc fix | CLEAN; 1 Minor (an unreproducible count) fixed. **Found and closed a real title-disclosure hole.** |
| T9b **FLOOR-LIST** builder reads | `98a761a`, `e47bb59`, `4189247`, `8a8444d` (+3), fix round `6406048` | **2 Important + 3 Minor + 1 ruling**, all closed and PROVEN. The most productive review of the plan. |
| T10 `GET /v1/search` (cross-project) | `1eb3f32`, `66e3549`, `9d642c0`, `82db02b`, `fa2ff11`, `6ae49e7` | CLEAN; 1 Minor (an unstable count) fixed. **Its own leak assertion could not see a leak.** |
| T11 `GET /v1/me/work` | `4de353f`, `6ec5084`, `32d9df7`, `9afa6ca` | **CLEAN — zero findings.** Reviewer re-ran 8 mutations; all matched. |
| T12 `GET /attention` (computed) | `347ded7`, `59cd86b`, `fdf7875`, `2d61b13`, `4f97a43`, `d14cf76` | **CLEAN — zero findings.** Reviewer re-ran 10 mutations; all matched. |
| T13 `/v1/me/preferences` (first WRITE) | `f136086`…`820b575` (7) | **CLEAN — zero findings.** Five items recorded to the coordination doc (§6a-6e). |
| T14 **FLOOR-LIST** stream frames + hub | `11877e2`…`449a979` (5), fix round `d6a9a2c`, `619a9a7`, `b9b4184`, `7361fbc` | **2 Important + 4 Minor + 1 Nit**, all closed. Hub itself sound; both Importants were in the TESTS. |

**Gate re-run by the executor rather than taken from any agent's report:** exit 0, 21/21, **0 cached**,
**1555 tests** — domain 335 · rule-engine 280 · **server 699** · app-core 130 · editor 72 · ui 31 ·
sync-client 8. Zero `Unsupported engine` WARNs, **Node v22.22.2**. Sum re-added by script in the same
run rather than eyeballed: 7 packages, 1430, matches.

### THE CONTROLLER SHOULD SEE THIS BEFORE MERGING — recorded in the coordination doc, not escalated

Task 7 made **two additive cross-plan contract widenings** and left **one owner question**. All three
are written up in the coordination doc's new section *"Plan 5 execution consequences (2026-09-01)"*.
In one line each:

1. **`TicketRollup` is four fields, not three** — `uncategorizedChildren` was added, and it is not
   padding: a renderer showing `terminalChildren` of `totalChildren` without consulting it is showing
   a silently incomplete progress bar. **Binding on Plans 6, 9, 10.**
2. **`RollupView` gained two fields, so `GET /v1/workspaces/:ws/tickets/:id`'s body carries two more
   keys** — additive, but it is Plan 4's route changed by a Plan 5 task.
3. **OWNER QUESTION: `terminalChildren` counts children the viewer cannot see.** Shipped per the
   product design doc's plain reading (line 116, *"5 of 8 done · 2 restricted"*), which is an
   illustrative phrase rather than a ruling. **Cheap to reverse** — one JOIN predicate and its tests.
   The implementer and the reviewer reached this reading independently and both flagged the same
   doubt, which is why it is recorded rather than left implicit.

**This did NOT meet the bar to interrupt the controller** (no Critical or Important, and step 9's
scope is unchanged), so it is written where the interface authority lives instead.

### THE AUTH CONTRACT T8 SET — every later route in this plan should match it, and it is measured

**T8 is the first route, so its door shape is the precedent.** Verified by execution and by mutation,
not by reading:

| caller | answer |
|---|---|
| no session (and a FORGED bearer) | **401** `{error:'unauthenticated'}` — forged-bearer proves the session is *resolved*, not merely present |
| valid session, **different workspace** | **404** |
| projectId that does not exist | **404 — byte-identical.** Status, body, and every header but `date`, `content-length` included |
| workspace member **not on** the project | **200, `columns: []`** — the emptiness is the visibility predicate answering, not the door |

**The boundary is the WORKSPACE, and the identical-404 is the point.** A 403 would confirm the project
exists. A stranger, a neighbouring workspace's owner, and a nonexistent id are indistinguishable — and
the neighbour gets 200 on their own project in the same test, so the 404 is not a blanket refusal.

**Both door mutations die, and their SHAPES were recorded rather than just their redness:** deleting
the `preHandler` turns 401 into 404 (no `currentUserId` → null role → 404); making `requireMember`
return unconditionally turns 404 into **200 with an empty board**, which is precisely the existence
oracle the identical-404 exists to prevent.

**Two survivors, both correctly diagnosed as unconstrained paths rather than reported as defects:** the
route's own `t.workspace_id` clause (unfalsifiable because ingest already refuses a ledger whose two
scopes disagree — kept as belt-and-braces, documented as such) and `appendStragglerColumns`
(unreachable because the reducer throws on a transition to a state its workflow lacks — **owner: the
plan's Open question 8**, which owns whether it becomes a throw).

**A REUSABLE HARNESS LANDED:** `apps/server/test/helpers/read-app.ts` — the shared read world for
Tasks 8-15. **Note it takes a `TestDatabase`, not a `Pool`, and returns the whole world including
tokens** — the plan text says otherwise.

**MORE PLAN-TEXT DEFECTS, for T9-T15:** `migrateTestDb` / `testPool` / `truncateAll` **do not exist**;
`latestWorkflowDefs` takes a `workspaceId`; `TicketRollup` is four fields; and the plan's
`{ pool, auth }` deps shape was NOT adopted — **the branch convention is preHandler-by-parameter and
Tasks 9-15 should follow T8, not the plan.**

### WHAT TASK 9 FOUND — a disclosure the plan text would have shipped

**The plan's `epicAncestors`/`epicTitles` CTE carried no visibility and no tenancy clause.** A group's
key is a ticket id and **its LABEL is that ticket's title** — so the walk would hand a caller who may
see a child the *title of an ancestor they may not see*. Reachable rather than theoretical: a child
authors its own audience and stops inheriting. Closed by putting `visibleTicketsWhere` into **both**
CTE terms and stopping at an invisible link (`no-epic`). Forcing that predicate to `TRUE` puts
"Confidential programme" back as a group label — and the reviewer isolated that mutation to the epic
walk alone, confirming it is enforced there and not merely inherited from the page query.

**And a flake the implementer wrote, then caught, and that generalises to this whole branch:**
**`newUlid()` is NOT monotonic within a millisecond** — the low 80 bits are random. A cursor
expectation derived from seeded order passed about half the time, and when it passed it sometimes
passed **vacuously** (the derived expectation collapsed to `[]`). **Any assertion on this branch that
assumes mint order equals id order is a coin flip.** Fixed here by computing the cursor from the ids;
the implementer's own guess is that other seeded-order assumptions exist elsewhere on the branch.

**The Minor, fixed, and it is the recurring class:** the catalogue said removing `ORDER BY` "reddens
seven cases." The reviewer re-ran it four times: 15, 18, 4, 15 — never 7. A query with no `ORDER BY`
has **no ordering guarantee**, so which assertions redden is a planner detail. 7.81 now states the
reproducible claim ("it reddens *something* here") and says explicitly that a count is not a fact about
this suite. **A number measured once is not a measurement.**

### WHAT THE T9b FLOOR-LIST REVIEW PAID FOR — two Importants an ordinary review would have missed

**1. A `__proto__` state id, and every live ticket in it, VANISHED from the occupancy read.** The
implementer had already found and fixed the sibling hazard for `toString` one function below — and
`toString` is exactly the value that made the fix look complete, because **plain assignment creates an
own property that shadows the prototype method.** `__proto__` does not: `Object.prototype.__proto__`
is an **accessor whose setter silently ignores a non-object value**, so `counts['__proto__'] = 0`
creates no own key and `JSON.stringify` omits it. Verified in bare node:
`c['__proto__']=0; c['toString']=1` → `Object.keys(c)` is `["toString"]`.

**The reviewer found it by re-running the implementer's own corruption proof with a DIFFERENT value.**
That is the generalisable move: *a proof run with one value proves that value.*

Driven end-to-end through the shipped doors — the state committed, a ticket transitioned into it,
`proj_tickets.state_id` held `__proto__`, and the read answered `{"counts":{"ok":1,"done":0}}`. Plan 8's
publish-mapping dialog is built from that response, so an author would never be shown the state and
could delete it believing it empty. **The escape hatch was shut too:** naming the key in a migrate body
is refused by Fastify's parser with an opaque 400, making the type permanently unmigratable.

**And the fix round caught a second-order version of the same trap:** a *literal* `{ __proto__: 1 }` in
the expected object collapses the same way, so the assertion would have passed against the defect. It
uses a **computed** key. **The test for a `__proto__` bug can have the `__proto__` bug.**

**2. The admin gate's DEFINITION was unconstrained.** The predicate was correct, but widening it to
admit any project admin **passed all 24 cases** — because the fixture had no plain workspace member who
was a project admin, and the permissive variant is exported two lines away in `effective-role.ts`.
Closed by seeding that cell; the mutation now fails naming that caller. The world also had **no
`admin`-role viewer at all**, so `|| workspaceRole === 'admin'` had no caller that could reach it —
also seeded, and deleting the disjunct now reddens.

### RULING RECORDED — a guest may NOT call `GET /v1/workspaces/:id/members`

**Executor ruling, conservative default, taken where the plan is silent.** The plan settles who is
HIDDEN from the listing and never says who may CALL it, so it fell through to the blanket
"not a member → 404", under which a guest passes. A guest invited to ONE shared ticket was receiving
the workspace's entire non-guest staff directory, and nothing in that response is about their ticket.

The withholding rule's own rationale decides it: a guest is *"a person invited to one shared ticket,
not a member of the workspace's roster"*, so handing them the directory is the mirror of the leak that
rule exists to prevent. **Recorded in the coordination doc's Plan 5 section as §5, stated as cheap to
reverse, owner Plan 8.** Also recorded there as §4: `foldStateIdForward`'s `def.stateMapping[current]`
carries the same prototype hazard — **pre-existing and OUT of Plan 5's scope, owner Plan 3.**

### WHAT T10 FOUND, and a rule now written into the catalogue's header

**The snippet-leak assertion could not see a leak.** `expect(snippet).not.toContain(secret)` **survived
a real leak mutation**, because `ts_headline` windows onto a MATCH and never renders unmatched text —
so the assertion was testing the headline's windowing, not the route's scoping. Replaced by two things
that can fail: a leak pair whose secret sits *inside* a matching fragment, and the strong form —
**the snippet must be a SUBSTRING of its own row's three columns.** Both leak mutations now die.
This is the same shape as T2's `not.toContain` finding and T9b's `__proto__` proof: **a negative
assertion is only as good as your ability to make it fire.**

**The `simple` FTS config now has one constant** (`apps/server/src/read/fts.ts`), consumed by
`compile-filter.ts` and the route's three uses — closing the seam T6 recorded and named T10 as owner
of. It does NOT reach the migration's generated column (SQL predates the TypeScript); that side is
linked *behaviourally* by a test where `licence` hits and `licences` does not, with the positive
control in the same case.

**THE COUNTING RULE, now in `test-cases/07-...md`'s header, because this file learned it twice:**
**name the CASES a mutation kills, never the COUNT** — unless the count is deterministic AND has been
reproduced by a second party. "Removing the `ORDER BY` reddens seven cases" was one run's artifact
(re-runs: 15, 18, 4, 15). A "dies 6" for a visibility mutation measured **7** on re-run, the two extra
deaths being cases whose assertions are coupled to a shared fixture query's LENGTH — a hidden
dependency worth knowing about on its own. The one count kept is `FTS_CONFIG`→`english` = eleven,
because it is a configuration name rather than a planner choice and a second party re-ran it.

### T11 AND T12 — what is worth carrying forward from two clean tasks

**T11 (`/me/work`) is the endpoint whose FILTER IS its security boundary.** The viewer id comes from
the session only. Because Fastify hands over undeclared query keys anyway, the test *sends*
`userId`/`user_id`/`assigneeId`/`viewerId`/`as` naming the owner and pins the response
**byte-identical** to the one naming nobody — and the impersonation mutation (`raw.userId ??
request.currentUserId`) dies on that case alone, with the owner's queue visibly leaking. **Being
assigned a ticket is not being allowed to see it**, proven five ways: hidden/explicit, never-on-project,
removed-from-project after assignment, visibility narrowed after assignment, and admin-without-bypass.

**T12 (attention) is the first task on this branch where the CLOCK is load-bearing**, and it is the
first to take the standing TZ rule seriously. The IST arithmetic is measured from **four directions**
(18:35Z/18:31Z twins, the exact-midnight bound, a 19:30 IST evening entry, and a read a millisecond
either side of 18:30Z) and each direction has a mutation that dies naming it. **Four mutations SURVIVED
on first run** — staleness `>=`→`>`, the tenancy clause, `daysInFlight` as a millisecond quotient, and
blocked-narrowed-to-active — and each was closed with a new fixture and re-run rather than explained
away. That is the discipline working: *a survivor is a missing fixture until proven otherwise.*

**The clock is now injectable**: `AppDeps.now` (optional, undefaulted) and `BuildTestAppOverrides.now`,
with `read-app.ts` frozen at `SCENARIO_NOW`. **T14 and T15 will need this** — a heartbeat is a clock.

**Recorded, owner = the coordination doc:** `latestWorkflowDefs` resolves the NEWEST published version,
so republishing a workflow that newly flags a state re-classifies tickets already sitting in it **with
no event on their own streams.** Defensible for a "what needs attention now" strip, and it is the
reader every route on this branch uses — but the plan does not address it and version-pinning is an
equally defensible product. Shipped as-is; the test comment was deliberately downgraded to a
description of behaviour so no future reader mistakes it for pinned intent.

### T14's FLOOR-LIST REVIEW — the hub was sound; both Importants were DEAD ASSERTIONS

**The hub itself survived everything.** The fan-out is genuinely per-subscriber; a neighbour
workspace's owner and a workspace guest, probed against the REAL filter and a real database, each
received nothing but their own cursor echoed back, with a member in the same case as the positive
control. Narrowing mid-subscription is honoured and the guard that makes it work dies when removed.

**Important 1: the assertion guarding this task's central disclosure decision could not fire.**
`expect(JSON.stringify(socket.frames.slice(-1))).not.toContain(ticket)` — and `slice(-1)` is always
the `scope-revoked` frame, whose shape is `{type, workspaceId}` and which **structurally cannot carry a
ticket id**. Purge frames emitted before it fall outside the slice. That one assertion carries the
entire reason `scope-revoked` is ONE frame rather than per-id purges (per-id purges tell an outsider
how many tickets existed in a scope they were never shown).

**Important 2: the recording socket asserted against a SANITIZED COPY, not the bytes sent.**
`fakeSocket.send` pushed the schema's *parse result*. The outer frame is `.strict()`, but the envelope
inside is **not**, so unknown envelope keys were silently stripped — the hub could attach an
attacker-chosen key to every envelope on the wire and 21/21 passed. **Two docblocks stated the opposite
as a load-bearing guarantee to Plans 6, 9 and 10**, which is what made it Important rather than Minor.
Now the raw string is recorded alongside, disclosure is asserted over the raw, and the recorder also
proves the parse stripped nothing.

**THE METHOD MOMENT WORTH KEEPING: the fix round REFUTED the reviewer's evidence while confirming the
finding.** The reviewer's stated mutation was **inert in that fixture** — at that `afterSeq`,
`stream.rows` holds only the revocation row, so there were no ticket rows to itemise and the mutation
emitted nothing. Its "passes 21 tests" was therefore not evidence about the dead assertion at all. The
finding was real; its proof was mis-attributed. A substitute mutation that actually fires was built,
and the fix proven by a **before/after pair under ONE mutation, varying only the assertion spelling** —
which isolates the fix from the choice of mutation. *A finding whose mechanism is refuted is not
therefore worthless: refute the mechanism, then ask what the observation was evidence of.*

### RECORDED — two items a later party owns

- **The stream suite's tenancy coverage is an ARTIFACT OF TEST ORDER — owner Plan 4.** Removing the
  workspace predicate from `visibleEventsFor` (with its param, so the mutation genuinely ran) reddened
  only one case, incidentally: **7.134 survives because it runs FIRST and `events` is append-only, so
  no other workspace's rows exist yet.** Re-ordering, or a `.only`, removes the coverage silently.
- **`StreamSocket.terminate()` is declared and faked but called by nothing — owner Task 15.** Every hub
  give-up path uses `close(code, reason)`; the real caller is a heartbeat timeout, which T15 owns.

### T13 RECORDED FIVE CROSS-PLAN ITEMS — the controller should see §6b before Plan 6 runs

Coordination doc §6a-6e. **§6b is the one that matters: Plan 6 declares an INCOMPATIBLE
`UserPreferences`** (`{version, projects, savedFilters[].filter}` against the server's
`{savedFilters[].filterSpec, listColumns, grouping}`). Informationally equivalent, so it is a naming
conflict rather than a design one — **but it needs a ruling before Plan 6 Task 10.** §6a narrowed
record keys `string`→`ulidString`, forced by measurement: **zod 3.25.76 parses `{"__proto__": …}`
SUCCESSFULLY into `{}`**, so a full-replace PUT would have stored and answered a document nobody sent.

**NEXT: Plan 5 Task 15** — WS `/v1/stream`, the route, heartbeat and planted stream defect, plan line
5452. **FLOOR-LIST.** Then T16 (6047), the catalogue task, and the branch is complete.
**`makeRequireSession` is still wrong at plan line 5915.** · T9 (2657) · **T9b (3183, FLOOR-LIST)** · T10 (4079) ·
T13 (4551) · **T14 (4918, FLOOR-LIST)** · **T15 (5452, FLOOR-LIST)** · T16 (6047).

### WHAT T5 COST AND WHAT IT BOUGHT — read before dispatching any later floor-list task

**The first T5 implementer DIED on a transient network error** (ENOTFOUND) after ~15 minutes, leaving
four untracked, unreviewed, uncommitted files. Nothing was lost only because the resume dispatch handed
them over as **untrusted drafts with a keep/fix/delete decision per file**, rather than either deleting
them or silently inheriting them. It rewrote one (the draft had duplicated the decision table instead of
extracting it), kept two, and fixed one. **The standing lesson is in every dispatch from now on:
COMMIT EARLY AND OFTEN — an uncommitted increment is the only thing a dropped connection can destroy.**

**The extraction worked and is proved rather than asserted.** `listVisibleTickets` now consumes
`visibleTicketsWhere`; `grep -rn "resolved_mode" apps/server/src/` finds the table in SQL **nowhere
else**. The proof is a mutation: break the builder and `test/visibility/visible-tickets.test.ts` — a
file the implementer never touched — goes red.

**A plan-text defect worth carrying: the plan's Task-5 decision table and its sample predicate are both
WRONG ABOUT THE OWNER.** They collapse owner into "member/admin/owner"; three implemented sites say
owner is a separate always-yes row (`can-see.ts:101`, its own table, `visible-tickets.test.ts:88`). A
predicate transcribed from the plan fails on the first owner fixture. **Owner compiles to `'TRUE'`.**

**And `resolved_user_ids` is `text[]`, not jsonb** (`1787961300000_proj-visibility.sql:28`) — so
`$n = ANY (...)`, NOT the plan's `@> to_jsonb(...)`, which raises 42883.

### THE FINDING THAT ONLY A FLOOR-LIST REVIEW WOULD HAVE CAUGHT

An **over-permissive guest branch survived all 520 server tests.** The predicate was correct; the
suite could not have told you if it were not. Two reasons, and the second is the transferable one:

1. the `guest x project` cell only ever asked about a guest whose project set was EMPTY — an answer no
   implementation of that branch could get wrong; and
2. **the `canSee`-vs-SQL agreement oracle is STRUCTURALLY BLIND wherever both implementations ignore
   the same input.** Neither consults `eff.projects` for a guest, so they agree whatever the fixture
   holds. **An agreement test between two implementations cannot see a rule they both ignore** —
   generalise this to every later oracle-shaped test in this plan.

Closed by seeding a guest onto a project roster and asserting their slice is unchanged. **Proven, not
asserted:** the same mutation now fails naming `guest x project`, `visible: false` vs `true`.

Two Minors closed with it: a `seeded` guard that was a JS-literal tautology (it compared literals to
literals and could not fail — replaced by reading each cell ticket's real `resolved_mode` back out of
`proj_visibility`), and an injection assertion that was live only in the over-permissive direction and
now carries a positive control.

### RECORDED, NOT FIXED — owner: permissions / a Plan 4-line ruling

**Can an owner add a GUEST to a project roster with `projectAdmin: true`?** `check-permission.ts:488-494`
gates `project.member_added` on the **actor's** `hasProjectAdminRights` and constrains the **target's**
role not at all. `hasProjectAdminRights` returns true for `eff.projects.get(projectId)?.projectAdmin`,
so such a guest would hold project-admin rights — roster changes and `visibility.set` on that project —
**while `visibleTicketsWhere` and `canSeeResolved` still show them nothing.** The READ side's inertness
for a guest is now proven (T5's new fixture). **The COMMAND side is not, and was not executed.** Stated
as a question, not a confirmed defect. It surfaced only because T5's fix needed that event as a means
to an end.

### THE REGISTRATION PIN: ENUMERATED, because "three places" was a reading and it was imprecise

T4's implementer found a second pin the expensive way — a red gate, 1 failed / 502 passed — and
recorded "three places" in its commit message, which is not somewhere a later subagent reads. The
count was never enumerated, so it is enumerated here. **The actionable answer is THREE ASSERTION
ARRAYS ACROSS TWO FILES**, not three files:

| File | What it holds | Extend on registering? |
|---|---|---|
| `apps/server/test/projection-order.test.ts` | **TWO** `toEqual([...])` arrays, lines 56 and 113. DB-free on purpose. The pin of record. | **YES — both arrays** |
| `apps/server/test/entity-heads.test.ts:92` | ONE array. Postgres-bound, so it **goes silent exactly when the database is down** | **YES** |
| `apps/server/src/projections/index.ts` | Comments only, no assertion | Prose, not a gate |
| `apps/server/test/verify-projections.test.ts:173-179` | **NOT an order pin.** A non-emptiness anti-vacuity list of the six tables its fixture seeds — *"a clean verdict over it proves nothing"* | **No** — but see below |
| `apps/server/test/determinism.test.ts` | Single-table usage, no list | No |

**The `verify-projections` row is the one worth reading twice.** It does not need extending, but a
projection absent from it gets a **vacuous `clean: true`** from that suite, because the verifier
returns clean over an empty table. `proj_workspace_settings` is absent from it and T4 covered the gap
the right way — a planted live corruption inside its own test file, reported as
`missingFromLive: 1, extraInLive: 1` scoped to that one table. **Every later registrant owes the same
proof somewhere, or its verifier coverage is a check that cannot fail.**

### TASK 6 IS DONE AND THE `tsvector` QUESTION IS ANSWERED — this note is retired, not pending

**`tsvector` DOES support the verifier.** Proven by execution, twice, independently: the implementer
planted a live corruption and the reviewer re-ran it with a DIFFERENT corruption string to rule out a
canned fixture. Both saw `proj_search: 1 row(s) missing from live, 1 extra in live`, then clean again
after `rebuildProjection`. **`EXCEPT` executes over `tsvector`** — a missing equality operator would
have raised `could not identify an equality operator for type tsvector`, not returned a wrong answer —
and `CREATE TABLE (LIKE … INCLUDING ALL)` carries the GENERATED column and its GIN index into the
shadow schema, so the tsvector genuinely participates in the diff.

**Review was CLEAN — zero findings.** All three pin arrays extended and confirmed by mutation (register
the projection one slot early and all three redden). Registration APPENDED on dependency grounds:
`searchProjection.apply` reads no table at all, and no projection reads `proj_search` in a transaction.
It does have readers — `compile-filter.ts:97` and the future Task 12 route — but both are read-time on
a request path, never handlers, so neither creates an adjacency. The comment says that rather than
implying a §8 slot exists.

**A seam was found that would have reddened the gate:** `compile-filter.test.ts` had been creating its
own stand-in `proj_search`, so the real migration collided with `relation "proj_search" already
exists`. Task 2 had left a note asking Task 6 to keep the column names — it did, the stand-in is gone,
and that test now runs against the shipped table.

### RECORDED, NOT FIXED — owner: Plan 5 Task 12 (the search route)

**The `'simple'` text-search configuration is pinned in THREE unlinked places and nothing forces them
to move together:** the migration's generated column, `compile-filter.ts:97`'s
`websearch_to_tsquery('simple', …)`, and the search test's own helper. They agree today (checked). A
change to the QUERY side alone would leave the projection green while search quietly stopped matching.
No shared constant was invented, deliberately — Task 12 writes the search route and is the task that
should decide where such a constant lives, with the route in front of it. **If Task 12 does not, this
is the seam that rots.**

### THE FORWARD HAZARD T4 CREATED, and it is this series' signature failure — owner: STEP 10

`applyCommitted` in `apps/server/test/helpers/apply.ts` is the seeding path for **every read model in
Tasks 5–15**. Its docblock said *"seeds envelopes the way ingest would."* **It does not.** Verified
against `ingest-service.ts`: real ingest also takes `lockWorkspace` + `lockEntity` (`:157-158`), reads
the seqs from the DB via `nextWorkspaceSeq`/`nextSeq` rather than a process map, runs
`checkPermission`, runs the rule engine, runs `bootstrapWorkspace`, and calls `notifyCommitted`.
`applyCommitted` does `insertEvent` plus projections, and nothing else.

The docblock now **enumerates those six absences** rather than calling itself simplified — *a
partial-implementation marker enumerates the absences, not the partiality*. The consequence, written
where the next eleven tasks will read it: **a read model green against this helper is proven correct
about ROWS and proven nothing about whether those rows are reachable through the shipped door.**

**This is exactly "a mocked contract is the thing that excuses the server from existing."** It is
recorded, not fixed — closing it is the **integration checkpoint (sequence step 10)**, which is the
step that exists for it. One absence is a live trap rather than a philosophical one and is called out
by name: the seq map starts at 0 regardless of what the database already holds, so seeding into a
non-fresh database silently collides.

## THE PLAN 5 ADAPTATION MAP — three compile-breaks, one of them at EIGHT sites

Run 2026-09-01, one sonnet agent, read-only against `git show origin/main:<path>` blobs (never the
working tree, because an implementer was editing it concurrently). **Positive control: 26 cross-module
symbols checked and found to MATCH main exactly** — a map reporting drifts and no matches would mean a
broken method rather than a broken plan, so the matches are the evidence the misses are real.

| Task | Symbol | Plan assumes | Main actually has |
|---|---|---|---|
| **T7** | `RollupView` (`src/visibility/rollup.ts`) | `{total, open, active, terminal, restrictedCount}`; the snippet reads `rollupView.terminal` for `TicketRollup.terminalChildren` | **`{total, restrictedCount}` — two fields.** No `terminal`, `open` or `active` exists on the type or on what `rollupFor` returns |
| **T8 + 7 more** | `makeRequireSession` | `import … from '../auth/routes.js'` | Exported **only** from `src/auth/require-session.ts`; `auth/routes.ts` exports `registerAuthRoutes` and nothing else |
| **T5** | `EffectiveRole` | a plain literal `{workspaceRole: null, projects: new Map()}` | **A required unexported unique-symbol brand `readonly [RESOLVED]: true` (Ruling P22).** No object literal can satisfy it structurally; main's own tests write `as unknown as EffectiveRole` |

**The `makeRequireSession` one is the expensive one and it is why this map paid for itself.** The wrong
import recurs **verbatim at plan lines 2527 (T8), 2956 (T9), 3442 (T10), 3774 (T11), 4009 (T12), 4369
(T13), 4865 (T14's test helper) and 5915 (T15)** — every route-registration snippet in the plan. Only
the T8 occurrence (line 2632) carries an inline self-correction; **the other seven are unmarked.** Seven
separate implementers would each have hit it cold. Fix it at every site without re-deriving it.

**All three are compile-break, i.e. self-announcing — and the map went looking for the dangerous class
and reported the null.** It specifically hunted a T3-style *silent-wrong* (an optional field the
snippet omits, which compiles and passes while behaving differently) across T4–T16 and found none,
having checked `EventEnvelope`'s 11 required fields against `makeCommitted`'s literal, the
refresh-on-publish fold-forward that T8's "unreachable now" claim rests on, and all 10
`PROJ_TICKET_COLUMNS` against the live `CREATE TABLE`. **A reported null with its method named is worth
more than a silent omission** — but note it is a null, not a proof, and the map states its own gaps:
T4's and T6's full code bodies, T9/T9b's route-handler bodies, and T13's preferences SQL were not
swept beyond their import blocks.

### RECORDED BEFORE THEY WERE NEEDED — two plan/as-built drifts found by reading, not by failing

Both were found while orienting for T3, before any implementer ran. Recorded here so a restart does not
re-pay for them, and because the second is **not T3's to fix.**

* **T3's registration snippet is stale, and its AS-BUILT annotation proves the plan was patched
  incompletely.** The snippet registers `{type, version, payloadSchema}`. As-built,
  `EventTypeRegistration` also carries **`entityKind?`**, and `parse-event.ts:79` enforces it at the
  door. It is **optional**, so the plan's snippet *compiles and its tests pass* — which is the trap:
  omitting it admits a `workspace.settings_set` envelope pointed at `entity.kind: 'ticket'`, and
  **nothing in T3's supplied test suite can tell the two apart** (`parsed.ok === true` either way).
  The task carries an explicit AS-BUILT correction for a *different* drift in the same code block (Plan
  4 T5's `workspaceExists`). **An AS-BUILT annotation is evidence the plan was reviewed, not that it was
  reviewed completely** — treat one as a signal to check the rest of the snippet, not as a clearance.
* **T5 will be tempted into a THIRD copy of the visibility decision table — owner Plan 5 T5.**
  `apps/server/src/visibility/visible-tickets.ts` is on main and already expresses that table in SQL;
  its own docblock names the hazard: *"Once in `canSeeResolved`, once in SQL — the two-sources-of-truth
  shape."* T5 produces `visibleTicketsWhere(eff, userId, params): string`, which **does not exist**
  (main has `listVisibleTickets`, an async query function, not a predicate builder), and neither do
  `workspaceOfProject` / `requireMember`. So T5 is genuinely create — but it must **extract from**
  `visible-tickets.ts`, not re-derive beside it. Checked because Plan 4's T5 turned out to *widen*
  rather than create; this one does not, and that was measured rather than assumed.

### THE REBASE IS DONE — do not re-run it, and here is why `cherry` said what it said

**Performed 2026-09-01: `git rebase --onto origin/main 8858f28`.** Four commits, replayed clean, zero
conflicts. **Not 62** — the branch is Chain B's tip plus four, and Chain B's content was already on main
under `6cb631d`, so only the four were ever mine to move.

**The verification that makes this trustworthy is a diff, not the rebase's own success message:**
`git diff --stat 95004e1 c3b1090` prints **exactly two files** — `docs/lanes/controller-state.md` and
`docs/lanes/task-ledger.tsv`, i.e. the controller's docs-only `00cb2e0` and nothing else. That is
positive evidence the branch already carried step 7's and Chain B's content **byte-identically**: had it
not, source files would appear in that diff. A clean rebase alone would not have shown me this.

`git cherry` marked all 60 pre-rebase commits `+` although 58 were merged, because **#57 and #59 were
SQUASHED**. Main's subjects carry the **`(#57)` / `(#59)` suffix** — that suffix is the marker telling
you the `+` is uninformative. **Post-rebase the branch is 4 ahead of `origin/main` and `cherry` is
meaningful again.**

### What batch A found — both defects were in code or plan text that predated the task

* **T1:** the pulled-forward `docToPlainText` had **unbounded recursion** while its own docblock said
  *"Total function… never throws."* Three hostile inputs (self-referential node, nested one, 100k-deep
  chain) all threw `RangeError` **against the real exported function**. Fixed with a depth cap rather
  than a seen-node set, because **a seen-set would misrender a document that legitimately reuses one JS
  object in two tree positions.**
* **T2:** the plan's own blocked-states CTE used `DISTINCT ON (workflow_id)` across all of
  `proj_workflows`. The PK is `(workflow_id, version)` **globally**, so workspace A holding `('wf',1)`
  and B holding `('wf',2)` means **A's `blocked` filter read A's tickets against B's flags** — a
  **second consumer** of the same global key whose reader half was ruling P14. Fixed by correlating on
  the ticket row's own workspace, which nothing an actor sends can aim.
* **T2's answer to "which identifiers can vary": NONE — the allowlist is the empty set.** And it was
  honest about the limit: the base tenancy scope stays the caller's, **"and yes, a caller can forget
  it"**, with a test enumerating all twelve terms that fails if a new one reaches another table
  uncorrelated.
* **The fix round closed two Importants:** a **U+0000 the schema admitted and Postgres cannot carry**
  (SQLSTATE 22021 — a door accepting what the store cannot hold turns a 400 into a 500), and §7's
  arrival making two neighbouring scope notes false.

### A REVIEW FINDING WORTH CARRYING INTO EVERY LATER TASK

`expect(sql).not.toContain(hostile)` **measures whether the value LOOKS LIKE SQL, not whether it was
concatenated.** Add `'$1'` to the hostile set and a **correct** compiler fails — it emits
`t.assignee_id = $1` and binds the string safely. **A guard that fires on correct code is worse than no
guard, because the next person deletes it.** The meaning lives in the paired execution assertion.

### Three method results from batch A's fix round, worth more than the fixes

* **A review nit's stated mechanism was REFUTED, and a working one substituted.** N3 proposed seeding a
  second workspace's ordinary `proj_search` rows to make a tenancy correlation executable. That cannot
  work: `proj_tickets.ticket_id` is a **primary key**, so ticket_id → workspace is a *function*, and a
  correctly-filed neighbouring row can never satisfy the outer predicate. The reachable failure is
  projection **drift** — a WS_A ticket whose `proj_search` row is filed under WS_B. Correlated → `[]`;
  uncorrelated → the foreign row. **A reviewer's proposed experiment is a claim like any other.**
* **N5's premise was PROVEN, not accepted.** The deleted `not.toContain` guard was restored as a
  mutation and **failed against the correct, unmodified compiler** (`Expected: "$1"`). Replaced by a
  pinned SQL constant plus **exact** parameter-array equality — the old `>= 5` would pass on a compiler
  that had lost two bindings.
* **The NUL rule was measured, not assumed.** BEL, TAB, LF, CR, ESC, DEL and a lone surrogate all
  round-trip through Postgres; **only 0x00 raises 22021.** So the door refuses exactly what the store
  cannot hold, rather than inventing a control-character policy nothing downstream needs. A mutation
  widening the guard to all C0 controls is killed by a test named `refuses ONLY NUL`.

## RULING P23 — SETTLED. Do not reopen; do not restore the walk.

**DELETE upheld, not narrow.** What carries it, in the controller's weight order:
1. the **blessed scope-wide emitter survives**;
2. the residual is **under-purge** — the direction P23 explicitly named;
3. **refusing the project-membership gate is correct**, because *being on a container is not holding the
   entity*;
4. **no gatable predicate exists**, so a gate here would be a deletion wearing a condition.

**6.104 stands, owner Plan 10.** *(A supporting figure of 495 insertions / 0 deletions was offered and
then withdrawn by the controller: it was measured at `eadc748`, before #57, and re-run now prints 0/0.
It is context, not the reason — and the escalation's actual claim was forward-looking, about the
residual reaching all per-event triggers and members, which that figure does not touch.)*

## What step 2 actually contained

T9 was the one task on this branch that had passed none of implementer → reviewer → fix → re-review.
It has now passed all four.

1. **Rebased** onto `55ae0a1`, resolving the `Features.md` conflict (above).
2. **F1–F4 fixed** (`c240c53`): the TZ restore that assigned the string `"undefined"`; `useBoard`
   never refetching on a `projectId` change; the views-never-speak-HTTP guard that tested a prefix and
   read one import spelling of four; the `Features.md` merge conflict.
3. **Eight mutations** run against the fix round. Seven died naming their own site. **The eighth
   survived** — F1's own pinning test read `process.env.TZ` *after* the three tests above it had
   corrupted it, so it was asserting that `"undefined"` had been faithfully restored to `"undefined"`.
   Rewritten to set both configurations; now dies under ambient TZ and under `TZ=Pacific/Niue`
   (`10a314e`).
4. **Scoped re-review** — triggered by the ruling's own criterion, since the fix round changed a public
   signature and widened four scanner claims. Three read-only lenses (1 opus, 2 sonnet; cap 6).
   Response in `439da6c`. Full disposition of all twelve findings:
   `docs/lanes/plan-6a-t9-review.md`.

## Open items for the controller — read before merging

- **The re-review's one Critical is REFUTED, and the PR body carries the experiment chain.** It claimed
  `provenance.test.ts`'s naive TZ restore leaks across files and reddens the suite. It does not: the
  failure reproduces on `main` with that file **alone**, and `forks`+`singleFork` — all seven files in
  one process, sequentially, the sharing hypothesis' own maximal configuration — is **92/92 green**.
  The variable is the vitest **pool**, not the sharing. Do not re-panic at the word "Critical" in the
  workflow output without the refutation beside it.
- **What that investigation found instead is in this branch and is fixed here:** T9's three zone tests
  were **32/32 green under `--pool=threads`** while the zone never moved, because a worker thread does
  not get the process-level clock reconfiguration. An anti-vacuity probe is now in `board.test.tsx`;
  under `threads` the file is 33 passed / 1 failed naming its own line, and under the gate's pool
  130/130. **Ruling recorded in the coordination doc** — it generalises to Plan 9's Calendar and
  Timeline.
- **`useLiveQuery`'s signature changed** and eight call sites in Plan 6's own plan text are now wrong.
  **Ruling P17**, coordination doc. Binding on Plans 6 T10–T13 and Plan 10.
- **Recorded, not fixed, with named owners:** F6, F7, F8, F9, F10 from the original review;
  `provenance.test.ts:104,130`'s naive restore (owner Plan 6a); the one-committed-render window that
  F2's fix shortens but does not remove (owner Plan 6 T7/T8, with the design that closes it together
  with F6 written up beside it); `packages/app-core` still has no owning `test-cases/` file (owner
  Plan 6a, carried forward — nothing in `test-cases/` went stale from these fixes).
- **Auto-merge eligibility is the controller's call.** The PR is offered as a review ledger with the
  fixes-applied and recorded-with-owner split stated explicitly.

## RECORDED, owner Plan 11 (infra) — the Node version is declared and enforced by nothing

Raised by the controller after it cost a round, then verified here rather than adopted:

| Fact | Evidence |
|---|---|
| `package.json` declares `"engines": { "node": ">=22.0.0 <23" }` | read at `c93c910` |
| CI pins `node-version: 22` | `.github/workflows/ci.yml:62` |
| This machine's default `node` is **v24.11.1** — outside that range | `node -v` with no PATH export |
| **Nothing pins a shell** | `.nvmrc`, `.node-version`, `.tool-versions` all **ABSENT** |
| **Nothing enforces the declaration either** | no `.npmrc`, so `engine-strict` is off by default. Tested: under v24.11.1, `pnpm exec node -v` and `pnpm run` both **succeed with no refusal and not even a warning**. Control: the same commands under v22.22.2 behave identically, so the silence is not a broken probe. |

**Why this is the same class as the TZ finding, and worse.** Each worktree carries its own
`node_modules`, and a native binding (`better-sqlite3@11.10.0`) matches whichever Node last rebuilt
it. So **two sessions can certify the same commit under different Node majors and both report
green**, with nothing in either report saying which. The controller met the loud half — a *false red*
at `@gisik-nokma/sync-client#test`, ABI 137 runtime against an ABI 127 binding. The quiet half is a
**false green**, and this repo has no way to notice it.

**A gate result is not evidence unless it names its Node.** This file now does.

**The fix is not mine to make and is named so it is not lost:** an `.nvmrc` (or `.node-version`)
pinning 22, and `engine-strict=true` in `.npmrc` so an unsupported Node is a loud refusal rather than
a silent success — *prefer the check whose failure is loud* applied to the toolchain itself. Not done
here: it is Plan 11's infra surface, `engine-strict` needs a CI run to prove it does not break the
pipeline, and it does not belong in a doc-only PR. The controller's PR #44 already carries the Node
finding and is the natural home.

**Rebuilding a stale binding takes `nvm use 22 && pnpm rebuild better-sqlite3`** — the bare rebuild
compiles against whatever Node the shell has, which on this machine's default is 24, i.e. it
reproduces the problem while looking like the cure.

## Method notes earned here — cheap to re-learn, expensive to rediscover

- **`process.env.TZ` assignment does nothing inside a worker thread.** Verified with `new Worker(...)`:
  two zones render the same instant identically there and differently on the main thread. Vitest's
  `forks` default hides this; `--pool=threads` exposes it. **A test that varies an ambient setting must
  also assert that varying it does something** — the brief's "vary `TZ` explicitly" is necessary and
  not sufficient.
- **`delete process.env.TZ` DOES restore the machine zone** (probed both ways: the naive restore lands
  on GMT+0000, the delete lands back on GMT+0530 with the key genuinely absent). This machine is
  Asia/Kolkata with TZ unset — confirmed by probe, contradicting an earlier session note that called it
  UTC.
- **A mutation harness that restores with `git checkout -- <file>` restores to the last COMMIT.** An
  uncommitted fix was silently reverted by the very run confirming it, while the harness printed
  `restore-clean = True` — true of the commit, false of the work. Only a `git commit` that reported
  "nothing to commit" caught it. **Commit before mutating, or the restore is a revert.**
- **A finding whose mechanism is refuted is not therefore worthless.** Refute the mechanism, then ask
  what the observation was actually evidence of.
- **A read-only lens that names its mutation precisely and hands it back works.** One Important here
  was a prediction the lens could not execute; running it took two seconds and confirmed it. Prefer
  that shape over granting a fan-out write access to a shared tree.
- **Hold the tree still while a fan-out reads it.** All doc edits here were deferred until the three
  lenses returned, rather than repeating 2026-08-28's concurrent-mutation incident.
- **This machine's Node was upgraded to v24.11.1 (ABI 137) mid-series**, while `better-sqlite3@11.10.0`
  bindings built under Node 22 are ABI 127. **Any worktree whose `node_modules` predates the upgrade
  shows a false RED at `@gisik-nokma/sync-client#test` that is not a code defect.** Fix:
  **`nvm use 22 && pnpm rebuild better-sqlite3`** — the bare rebuild builds against the shell's Node,
  which defaults to 24 here, so it reproduces the fault while looking like the fix. Reported by the
  controller after it cost a round, and corrected by it before this file was pushed.
- **A trailing command makes the harness report the gate's exit code as its own.** The piped-gate trap
  (`| tail` returning 0 over a failed turbo run) is the special case; the general rule is that ANY
  command after the gate in the same chain — including a bare `echo` — becomes the status you are
  shown. **The summary line is the only honest signal.** The controller hit this with a gate that
  reported "exit code 0" while its own summary said `Tasks: 11 successful, 18 total`.
