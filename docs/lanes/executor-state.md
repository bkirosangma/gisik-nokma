# Serial executor — live state

**This file is the restart surface.** A controller that kills and relaunches the executor from its
brief recovers only what is written here. Refreshed at every task boundary.

> **Warning about shas in narrative prose.** Every sha cited in any *narrative* document in this
> repo — the dispatch brief, the coordination doc's sections, the narrative parts of this file — is
> a fact about the moment it was written. Anchors in the table below were verified with
> `git branch --contains` (empty output = orphaned), never with `git cat-file`, which passes on
> reflog-only commits and hands you pre-rebase content while looking like it worked.

## WHERE I AM: **STEP 14 — PLAN 9. T1-T8 COMMITTED (8/15), GATE GREEN. T8 fix + T10 IN FLIGHT.**

> # DO NOT TRUST THE WORD "NEXT" ANYWHERE IN THIS FILE. MEASURE INSTEAD.
> ```
> /usr/bin/git log --oneline origin/main..HEAD     # what is actually committed
> /usr/bin/git status --porcelain=v1               # what a dead agent left behind
> ```
> **Batch B+C is DONE — T4, T5 and T6 are all committed.** What is running now is the
> **RECOVERY ROUND** dispatched after it: T4's fix (the red gate + 4 Important), T5's fix
> (4 Important), and **T6's review, which never ran at all** because its agent died on an API 529.
> Three agents, each committing its own work, so by the time you read this zero to two of those fixes
> may be committed **and this section will not say so** — the handoff is written before the work and
> the agents do not update it.
>
> **A dead fan-out leaves COMMITTED tasks and no handoff entry, and it can also leave UNCOMMITTED work
> in the tree.** Both have now happened here. Step 13's Batch B died on an expired login with a full
> task written and not committed, recovered only because someone ran `git status` first. Step 14's T6
> died on a 529 with its work **committed and amended** — so `git status` was clean and the task
> looked untouched by the handoff while being finished on disk. **Run both commands. Neither alone
> would have caught both cases.**
>
> *(This warning exists because the alternative was live, not hypothetical: the header said "BATCH B
> (T4) IS NEXT" while T4 was already being written. That is the third instance of the stale-middle
> failure this file documents — and the first two were retrospective. Being able to describe a failure
> is not the same as not committing it.)*

Branch **`exec/14-plan9-calendar`**, cut from `origin/main` `4b8b048`. **Step 13 is merged and closed**
(PR #85 -> `9b70ab9`; the controller's close is #87 -> `4b8b048`). **Plan 8's fifteen ledger rows are
ALREADY PROMOTED on `main` by #87 — do NOT promote them again.** I wrote that promotion commit before
seeing #87 and dropped it; the status/PR/sha matched exactly but the controller's *notes* column is
better (`artefact: <path> (PR #85)` vs my branch-name prefix), so re-applying mine would have silently
reverted it. **The repo stands at 133/177 (75.1%), 0 claimed, 0 in-flight, recounted from the ledger.**

**In flight and NOT mine to merge: PR #88** (`docs/p29-annotation`, head `022f0fc`) — the P29
declaration annotation #86 asked for. It is **not stacked** on this branch in the git sense: its commit
was **replayed here as `555c5d8`** when this branch rebased onto `4b8b048`. `022f0fc` itself lives only
on `docs/p29-annotation`. Disjoint from #87 by file, so #88 merges clean.

> **WHEN #88 MERGES, THE REBASE BASE IS `555c5d8`, NOT `022f0fc`. Measured, not assumed:**
>
> ```
> git rebase --onto origin/main 555c5d8      # correct — replays d27b073 onward, this step's own work
> git rebase --onto origin/main 022f0fc      # WRONG — replays 4b8b048 too, the CONTROLLER'S #87 commit
> ```
>
> `git merge-base --is-ancestor 022f0fc HEAD` **fails** — it is not on this branch — so
> `022f0fc..HEAD` sweeps in `4b8b048` and would replant the controller's own merge onto `main`.
> `git rev-list 022f0fc..HEAD` returns three commits; `git rev-list 555c5d8..HEAD` returns one.
> **And `022f0fc` becomes ORPHANED by the very event that triggers the rebase** — #88 merging deletes
> the only branch that reaches it — after which `git cat-file` still passes on it and hands back
> pre-rebase content. This is the brief's named trap, arrived at from the direction that makes it look
> right: the sha was correct when written, about a branch this one is no longer built on.
>
> Do it in a SCRATCH worktree (`git worktree add --detach`), never in this one. **Verify with a
> POSITIVE CONTROL**, because an empty diff is also what a broken diff invocation prints:
> `git diff --stat <old-head> HEAD` empty **AND** `git diff --stat origin/main HEAD` non-empty and
> matching expectation.

## PRE-FLIGHT IS DONE. Four findings, all verified by me on disk, not adopted from the agent.

**1. NO RULING IS NEEDED FOR TASK 13, AND THE DOCUMENT THAT SAYS OTHERWISE IS WRONG.** The pre-flight
reported the saved-filter field name as *"OPEN / UNRESOLVED … needs an explicit ruling"*. **It was
reading the coordination doc accurately, and the coordination doc was a day stale.** **P26 was written
2026-09-02** in `controller-state.md`: `SavedFilter`'s field is **`filterSpec`**; Plan 9 T13's `spec` is
superseded before it is written. Both stale sites in the coordination doc are corrected in this branch.
**Task 13 adopts `filterSpec`. Do not escalate this.**

> **The generalisation: a ruling recorded in one lane's state file is invisible to the other lane's
> agents.** Subagents read the coordination doc; they do not read `controller-state.md`. **A ruling is
> not landed until it is written where the work will read it.**
>
> **Two instances I can point at, not a counted trend.** P26 was first ruled in a message and reported
> as *"a number, a subject, and no text"* — `controller-state.md`'s own note calls that "the second
> time in one day" — and then written to `controller-state.md` while the coordination doc went on
> asking for it. I said "third instance in two days" in the commit that made this correction and could
> not enumerate the third when challenged. **A counted plural in a document about stale documents is a
> bad place to round up**, and this file's own rule already says it: when correcting a plural, check
> which noun it counts.

**2. THE THREE-WAY SPLIT IS REAL AND TWO `SavedFilter` TYPES ALREADY SHIP.** Verified by direct read:
`packages/domain/src/preferences.ts:28` -> **`filterSpec`** (schema is `.strict()`);
`packages/app-core/src/view-types.ts:183` -> **`filter`**; Plan 9 text line 5795 -> **`spec`**. The
first two are closed under P24 and pinned by `client-contract.test.ts:605` — **not reopened.**

**3. TASK 14 IS BIGGER THAN ITS OWN TEXT SUGGESTS — Plan 6's Step 5b was SKIPPED.**
`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:29-33` carries an explicit comment saying so and
naming Plan 9 T14 as the carrier. **Verified with a positive control**: the only `CalendarView` /
`TimelineView` hit anywhere in `apps/web/` is that comment itself, while a control grep for
`BoardView|ListView` returns real files — so the absence is real and not an eaten glob. **T14 must add
the calendar/timeline mount (four-way board|list|calendar|timeline chain) on top of the inbox wiring.**
Pull the tab mechanics from Plan 6's own Step 5b text, not from the comment's paraphrase — that was the
pre-flight's own least-sure claim and I have not closed it.

**4. TASK 8 IS TOLD TO CREATE A TYPE THAT ALREADY EXISTS ELSEWHERE.** The plan says create
`packages/app-core/src/filter/filter-spec.ts` "guarded — Plan 6's wins if landed". Plan 6's **did**
land, at a different path and a richer shape: `packages/app-core/src/view-types.ts:70`. **Consume it;
do not create the guarded path.** Task 8's Step 0 scaffold guard likewise resolves to "Both exist" —
`packages/app-core` and `packages/ui` are fully populated. The *tokens* it needs are genuinely new.

Smaller, verified: T1's plan path `src/ticket-types.test.ts` is really `packages/domain/test/…` (the
coordination doc already pre-corrected this). T2's `docToPlainText` **already exists**
(`packages/domain/src/doc-text.ts`) — created by **Plan 5**, not Plan 7 as T2's text says; take the
skip branch. T5's fan-out hook is `apps/server/src/app.ts:294-300` (`onEventCommitted`), not
`src/index.ts` as the plan says.

## PROGRESS: T1-T8 COMMITTED (8 of 15). T8's fix + T10 IN FLIGHT. **Measure; do not trust this line.**

`/usr/bin/git log --oneline origin/main..HEAD` · `/usr/bin/git status --porcelain=v1`

**T7's fix (`6c7af0d`) rebuilt the test on `buildTestApp`** — the real `buildApp` — and the app.ts
mutation that previously survived 937/937 now reddens **all ten tests in the file by name**. It also
took a side-effect worth knowing: routing through the real `setErrorHandler` means `cursor=%00` still
500s but now returns `INTERNAL_ERROR_BODY` instead of leaked Postgres text. **The leaked driver message
was only ever visible because the harness was a bare `Fastify()`** — one root cause, two symptoms. The
limit guard follows `list.ts`'s convention (refuse, don't clamp) using **`store.ts`'s own ceiling of
100**, not `list.ts`'s unrelated `MAX_LIMIT=200` — an error in its first draft, caught before commit.

### T8 (the calendar view-model) — committed, and it caught two lies in the PLAN's own draft

- **The all-hidden month lie.** With every claimed date on a legend-hidden field, the plan's own model
  returns the honest-empty sentence — telling a viewer *"no claimed dates fall in this month"* about
  claims they hid one switch ago. New `CALENDAR_ALL_HIDDEN_COPY`.
- **`epicAncestorOf` disagreed with the server.** The plan tests `typeId === 'epic'`; the server
  (`routes/list.ts:388,410`) groups by **rank 1**. A workspace with its own rank-1 type would get a
  lane on the server and *"No epic"* here. Now injectable, defaulting to the id derived from
  `BUILTIN_TICKET_TYPE_SEEDS` **by rank**.

It also declined to invent color tokens, and the reason is the good one: **Task 8 renders nothing, so
no Task 8 test could redden if it guessed a primitive wrong — a check that cannot fail.** The landed
`tokens.ts` is a role system (`TOKEN_ROLES` -> themes -> `CONTRAST_PAIRS`), not the plan's flat
`color.*` map. **Owner: Task 9**, the first thing that renders one.

**43 mutations, 10 survived first contact, all closed.** Its own note to the next implementer is worth
keeping: *every one of the ten was a fixture where the correct value and the defect's value coincide* —
the grid's string bounds silently absorb malformed days, and a fixture's declared order was also its
alphabetical order. **It also reported one thing it could NOT prove**: deleting the cycle-guard `seen`
set makes the walk loop forever, which hangs the runner rather than reddening a named test — a
did-not-run, not a survivor, and it said so instead of claiming the guard was pinned.

### T8's review — the sharpest finding on this branch so far

**It found the model telling the SAME lie it was proud of fixing, at two other doors.** A month emptied
by a **filter** or by a **lane** prints the honest-empty sentence about a month full of claimed dates.
Demonstrated as shipped behaviour, not under mutation: two August-dated tickets with
`filter:{assigneeIds:['user_nobody']}` yield `emptyCopy = "No claimed dates fall in this month…"`, and
an unmatched `laneEpicId` yields the identical copy. **The commit set the standard — "two different
facts, two different sentences" — and applied it at one door of three.**

Second Important: **the grid's outer edge is unwitnessed at BOTH ends.** The Aug-2026 grid renders
`2026-07-27..2026-09-06`; four mutations survive there, including one that makes **every marker on a
padding day vanish** while **777/777 pass**. The only out-of-grid fixture sits at `2026-10-02` —
**twenty-six days past the edge**, which is exactly why nothing bites. The series' "gate closing one
end of a range" class, here closing **neither**.

## PROGRESS: T1-T7 COMMITTED. T7's fix + T8 IN FLIGHT. **Measure, do not trust this line.**

`/usr/bin/git log --oneline origin/main..HEAD` · `/usr/bin/git status --porcelain=v1`

**T6's fix (`df4834a`) closed all four Importants and both regraded Minors** — test file only,
`sweep.ts` never modified (sha256 matched its HEAD blob). Suite 30 -> 37. **Every "was" figure was
RE-MEASURED rather than inherited from the review**, and its mutation harness refused to run unless the
pattern matched exactly once and printed its own applied diff — which is how it avoided the did-not-run
class entirely. It also found a survivor **the review had missed**: asking the date-loop's gate about
`row.assignee_id ?? ''` instead of the resolved target survived 36/36; the stale loop's recipient
argument was already pinned and the date loop's was not.

It regraded one Minor **up** to Important and fixed it (`ticketTitle`/`field` are user-visible payload
and the stale side was already `toEqual`-pinned — the asymmetry *was* the defect), and kept one at
Minor while fixing it anyway. **Recorded, not fixed, owner: whoever next opens `sweep.ts`** — the
malformed-claim branch at `sweep.ts:194-197` skips a bad `dueDate` claim with a log line and no test
seeds one, so *"skipped, not guessed"* is unwitnessed. `expectNoNotifications` was deliberately left
per-call rather than an `afterEach` so that branch can expect a log line when someone writes it.

### T7 (the notification API) — committed, and its review found the sharpest wiring gap yet

**The shipped handlers are CORRECT.** Every faithful "wrong id" mutation reddens. Three Importants,
all proof gaps plus one missing guard:

| # | Finding |
|---|---|
| **I1** | **The route registration has NO WITNESS.** Deleting `registerNotificationRoutes` from `app.ts:299` leaves **85 files / 937 tests green** — the inbox could ship **404ing on all three routes with a fully green gate**. A contrast mutation (route path -> `/v1/me/notificationsX`) reddens 3 tests by name, so the *handlers* are covered and the *wiring* is not. Root cause: the test hand-builds `Fastify()` instead of `buildTestApp` like **every** sibling route test — and `test/helpers/app.ts:88-92` states exactly why in its own docstring: *"every new route registered in `buildApp` has to be reachable from all of them."* |
| **I2** | **The forged-parameter probe covers one route of three.** A client-readable `?userId=` override added to `unread-count` or `mark-read` SURVIVES 7/7; measured under mutation it returned another user's `{"unread":3}` and flipped their row to `read=true`. **Scope stated honestly by the reviewer:** these mutations ADD a parameter the shipped code never reads, so this is a proof gap, not a live leak — which is why it graded Important, not Critical. The test file claims in prose that *"rows come from the session only"* while testing it on one route. |
| **I3** | **The route validates nothing it takes from the client.** `?limit=1.5` -> **500** (pg 22P02, `invalid input syntax for type bigint: "2.5"`); `?cursor=%00` -> **500** (pg 22021). The handler accepts any `Number.isFinite` value and the store clamps the RANGE but never rounds. **The branch already solved this one file away**: `routes/list.ts:518-527` rejects a non-integer limit with 400, and its comment names this exact trap — *"`Number('2.5')` is 2.5 and fails the integer test"*. Not production disclosure (`setErrorHandler` masks 5xx), and the raw Postgres text was visible only because the harness is a bare `Fastify()` — I1's root cause again. |

## RECOVERY ROUND CLOSED — GATE IS GREEN AGAIN. T6's fix + T7 now in flight.

**The gate is no longer red.** T4's fix (`d060595`) guarded the two unindexed accesses in the style the
production file already used — `const [row] = page.notifications; if (!row) throw` — no `!`, no `as`.
`pnpm turbo run build test typecheck --force`: **24/24, 0 cached, server 923/923 across 84 files.**

**T4's fix closed all eight surviving mutations**, each re-run and each now naming its own site. It also
refused to fake one: the no-redaction-on-revoke ruling is left as a **comment, not a test**, because the
store has no visibility dependency to flip into a revoked state, so no fixture here could catch a future
redacting join. **Saying so is better than a test that would pass either way.** Owner for the real
check: whoever adds a `canSee` join, if anyone ever does.

**T5's fix closed all four Importants and both Minors — and TWO of its three commits are it correcting
its own fix.** `4e02cb6`: *"The boot test waited for nothing: `expect.poll(...).toBe(0)` returns on its
first check."* `60c4931`: *"Three assertions I added had no mutation of their own, and a log spy that
could not see the leak it was written against."* **This is the branch's recorded fix-round pattern
holding: a fix is a change like any other and needs its own verification.**

Two rulings the T5 fix took, both recorded because they are decisions and not deductions:
- **Per-recipient isolation, not documented batch-abort.** An order-dependent disclosure outcome must
  not be settled by where a name happens to sit in a document. The per-recipient log names the *event*,
  never the recipient — and there is now a test that reddens if the recipient leaks into either
  argument of the log call.
- **The contested branch excludes nobody** — a refusal is not something the claimant did — now pinned by
  its own test, where before the fixtures pinned it by accident.

## T6's REVIEW FINALLY RAN, AND THE TZ DISCIPLINE IS REAL — a first for this repo

**The brief's known-gap is broken here for the first time.** The reviewer VERIFIED rather than inherited
the implementer's claim, and did it in the one order that works:

1. **Where is the day boundary computed?** Grepped every query on the sweep's path — the two sweep
   queries, `getWorkspaceSettings`, `getWorkflowDefFromProjection`, `canSee`, `insertNotification` — for
   `now()|CURRENT_DATE|AT TIME ZONE|current_date`: **zero matches.** The comment at `sweep.ts:169` is
   true. **This check had to come first**, because `TZ` on the node process does not move Postgres's
   `CURRENT_DATE`, so if the arithmetic had been in SQL the whole zone loop would have agreed for a
   reason unrelated to the property it names.
2. **Session-TZ controls:** forced the Postgres session to `UTC` and then to `Pacific/Kiritimati`. Both
   green — proving the session timezone is not load-bearing anywhere on this path, so process `TZ` is
   the correct axis.
3. **The mutation reproduced exactly.** Replacing the IST arithmetic with a local-clock read reddens
   **Kiritimati** (cross-midnight: both claims notify on the first sweep) and **Niue** (both cases),
   while **Asia/Kolkata stays GREEN** — which is precisely why a suite that only ever ran in India
   would have shipped it. The file's own predicted table matched.

**Also on this branch, and it is the stale-dist trap from the brief arriving in the wild:** the reviewer
mutated `packages/domain/src/events/workspace-settings.ts` and got 30/30 green. **Not a survivor — a
mutation that never ran**, because `@gisik-nokma/domain` resolves to `dist/index.js`. Re-run against
`dist` (backed up and sha256-verified on restore): **5 tests red.** It reported both legs rather than
the flattering one.

### T6's four Important findings — fix in flight

| # | Finding |
|---|---|
| **I1** | **The `canSee` gate on BOTH sweep paths cannot fail.** Every test injects `seeEverything` (`async () => true`); no test anywhere returns false. Deleting either gate leaves **30/30 green**. A control proves the seam is live (16 red), so only the **deny** direction — the only direction a gate exists for — is unexercised. Concrete leak: `can-see.ts` states the explicit list is exactly the authored list and **assignees are not implicitly appended**, so an assignee omitted from an explicit-mode ticket is denied — and without the gate the sweep posts them a row carrying `ticketTitle` and the claim `note`. Same shape as the mention-gate finding. |
| **I2** | **The staleness range is gated at ONE END.** Nagging a full IST day EARLY survives 30/30; only the too-late direction reddens. The "fresh" fixtures sit 3 and 22 IST days from the boundary — **never one day inside it.** The approaching horizon is correctly pinned at both ends; copy that shape. |
| **I3** | **`state_category = 'open'` is never seeded** — and it is the commonest case there is: `simple-kanban.ts:24` gives the shipped default workflow's `todo` state category `'open'`. Narrowing the date-approaching gate silently stops warning on open tickets (SURVIVED); widening the stale gate starts nagging them (SURVIVED). "Terminal tickets never notify" is only **half** pinned — nothing says a terminal ticket is never stale-nagged. |
| **I4** | **Plan 2's `getWorkflowDefFromProjection` is a declared consumed interface that is never witnessed.** The whole lookup can be deleted (`stateName = null`) with the suite green. The only assertion is `stateName: null`, and the test's own comment admits why: no workflow row was seeded. **The state name is what a person reads in their inbox, and the resolved path has zero coverage.** |

Plus a Minor worth its own line, because it is a *class*: **eight `toHaveLength(0)` assertions cannot
distinguish "correctly suppressed" from "attempted and crashed"** — `deliverToAll` swallows transport
errors and every test passes `log: () => {}`. Demonstrated by accident: a mutation that hit a NOT NULL
violation reported **30/30 green**. This is the second log-spy-that-cannot-see finding on this branch.

## BATCH B+C — T4/T5/T6 committed. (The gate WAS red here; T4 fix cleared it. Kept for the lesson.)

> ### THIS WAS TRUE AND IS NOW FIXED (T4 fix `d060595`). Kept because the LESSON is the point.
> `pnpm --filter @gisik-nokma/server run typecheck` **exits 2**:
> ```
> test/notifications/store.test.ts(132,12): error TS2532: Object is possibly 'undefined'.
> test/notifications/store.test.ts(171,12): error TS2532: Object is possibly 'undefined'.
> ```
> Unguarded `page.notifications[0].x` under `noUncheckedIndexedAccess`, in **Task 4's test file**
> (`57e6991`), whose commit message claimed full verification. **`vitest` is FULLY GREEN — 916 server
> tests pass — and the gate still fails.** CI runs `pnpm turbo run build test typecheck`, so this is
> the gate, not a side check. Three independent parties reported it: T4's reviewer, T5's implementer
> (which proved it pre-existing by running `tsc` at HEAD in a detached worktree where its own files
> were absent), and T5's reviewer. **This is the clearest instance yet of "a tests-pass report is not
> a gate report", and it is worth more than the two-line fix: the branch was green in every way its
> author checked.**

**THE T6 FAN-OUT DIED ON AN API 529 — AND IT DIED *AFTER* COMMITTING.** T6's implementer errored at
183K tokens / 74 tool calls with its work **committed**; T6's reviewer then failed to start at all.
This is step 13's Batch B lesson repeating with a different cause: **a dead fan-out leaves committed
work, not just a gap.** Measured, not assumed — tree clean, `1dad73d` present, server suite 916 green.

> **`3c1dab1` IS ORPHANED. Do not cite it.** It is T6's pre-amend commit; the agent amended before
> dying. `git branch --contains 3c1dab1` returns empty while `git cat-file` passes on it happily and
> hands back the earlier content. **The live sha is `1dad73d`.**

| Task | Committed | Review | Outcome |
|---|---|---|---|
| **T4** store | `57e6991` | opus, ran | **fix-required — 1 CRITICAL (the red gate) + 4 Important.** All four Importants are MISSING TESTS, not broken code: cross-user leakage in `unreadNotificationCount` survives, four of seven `rowToNotification` fields unpinned (including a `userId`/`workspace_id` **column swap**), `nextCursor` off-by-one survives, and a test named "clamps limit to 1..100 and defaults to 30" pins only the lower clamp. |
| **T5** fan-out | `f8d7f4e` | opus, ran | **fix-required — 4 Important + 2 Minor.** The `canSee` gate itself is **well** pinned (deleting it reddens; forcing it false reddens 14). What is unpinned is everything around it — see below. |
| **T6** sweep | **`1dad73d`** | **NEVER RAN (529)** | **UNREVIEWED CODE ON THE BRANCH.** Re-dispatched. Until that returns, T6 is committed and unexamined by anyone but its author. |

**T5's sharpest finding, because it is the one branch with no visibility gate.** `claim.contested` is
deliberately ungated, justified as *"the payload is the claimant's own refused event echoed back"*. The
recipient is `original.actorId` — and swapping it for `env.actorId` left **18/18 fanout and 886/886
server tests green**. Root cause is a FIXTURE defect: both fixtures set contester and claimant to the
**same user**, so the branch's one distinguishing fact is untestable. Plan 10 amendment 16 makes
contester != claimant the *normal* case, and the exemption's own justification evaporates the moment
the recipient is not the claimant. **One fixture defect blinded two disclosure checks on the only
ungated path.**

**Also from T5, an order-dependence worth remembering:** the outer try/catch wraps the whole recipient
loop, so a throwing `canSeeTicket` at recipient N drops N..end. Measured — throw at #1: nobody gets a
row; at #2: only the first does. **Who gets notified depends on the order mentions appear in the
document.** The existing pin uses a single recipient, where "contained" and "aborted" are the same
observation. The task text only promises isolation across *transports*, so the reviewer honestly
flagged it as possibly-within-spec; **my ruling was to pin the behaviour either way**, because an
order-dependent outcome on a disclosure path must not be settled by document order.

**T6's TZ question was answered by construction, and the answer needs verifying not inheriting.** The
implementer avoided SQL date arithmetic deliberately (`sweep.ts:169` claims the predicate carries no
`now()` and no `CURRENT_DATE`), used fixed +05:30 arithmetic via `istDayOf`/`istDayBounds`, and wrote
a mutation table claiming Kiritimati and Niue each **diverge** under a local-clock mutation while
Kolkata stays green. **If that reproduces, it is the first test in this repo to break the 48-file TZ
gap.** The re-dispatched reviewer is told to reproduce it, not believe it.

## LIVE ANCHORS — step 14, Batch A closed. RECOUNTED at the sha below, not carried forward.

| Anchor | Value | How verified |
|---|---|---|
| **Branch** | `exec/14-plan9-calendar`, rebased onto `origin/main` after #88 merged | `git rev-parse --abbrev-ref HEAD` |
| **Base** | `origin/main` — **re-fetch before trusting; it moved four times today** (#87, #88, #89, #90) | `git rev-parse origin/main` |
| **Branch HEAD at Batch A close** | `0520a1c` | `git rev-parse HEAD` |
| **Ahead-count** | **Deliberately not written. Run `git rev-list --count origin/main..HEAD`.** A count taken while writing the commit that records it is always short by one and always looks right to its author. | — |
| **GATE at `0520a1c`** | **check:env exit 0** (45 documented / 23 referenced) · **check:tasks exit 0** · **turbo 24 successful / 24 total, 0 cached, exit 0** · Node v22.22.2 · clean tree at gate start | all three run together on a clean tree with **zero agents running**; exit codes captured explicitly, not inferred from a trailing echo |
| **Test total** | **2,594** — ui 31 · domain **464** · rule-engine **282** · sync-client 8 · editor 178 · web 87 · app-core 687 · server 857 | the same run |
| **Delta, and it RECONCILES** | main = 2,463. Batch A adds **+131**: domain 335 -> 464 (**+129**), rule-engine 280 -> 282 (**+2**). 2,463 + 131 = **2,594**, exact. | subtraction against the controller's post-#85 re-verify figure |
| **Gate SHAPE** | 24 tasks over EIGHT packages — unchanged by Batch A | the run above |

**A NOTE ON `git status` IN THIS WORKTREE, found by the T3 fix agent and worth inheriting.** The
`rtk` hook rewrite can return the single token `ok` for a clean tree instead of porcelain output.
That is fine to read and useless to parse. **Every tree-state claim above used
`/usr/bin/git status --porcelain=v1`**, bypassing the hook. Do the same before asserting a tree is
clean — "ok" and "no output" are not the same evidence.

## BATCH A IS CLOSED — T1, T2, T3 done, fix rounds applied, gate green

| Task | Outcome |
|---|---|
| **T1** startDate day-claim | **SHIP, zero findings.** It was a verification task and the honest answer was that Plan 3's work was already correct — the implementer said so rather than rebuilding it. 4 mutations, all reddened AND named their site. Added 2 rule-engine fixtures (the first to run a built-in day claim through the real engine) and bumped the exact-count pin 84 -> 86. |
| **T2** mention walkers | **One Important, fixed.** `extractMentionedUserIds(null)` was unpinned — `typeof null === 'object'`, so deleting `\|\| node === null` from the guard survived all four tests while flipping null's behaviour from `[]` to a thrown TypeError. The task's own text names `null` as a case to cover, so this was a gap against the contract, not a reviewer's preference. Took the skip branch on `docToPlainText` correctly. |
| **T3** notification vocabulary | **THIRTEEN SURVIVING MUTATIONS behind a "ship" verdict.** The reviewer graded `ship` while listing three Importants and thirteen survivors; **I treated the findings, not the verdict.** All thirteen were MISSING TESTS, not broken schemas — the production code was right throughout and was not touched. Now closed and re-measured in both directions; **no survivors remain.** |

**The T3 fix agent corrected my own dispatch, which is the behaviour to keep.** I handed it thirteen
survivors transcribed from the review. It re-measured the baseline itself instead of trusting me and
found **M12 was never a survivor** — it already reddened. It also ran two mutations *wider* than the
review had (`nonEmpty` spelled a second way; `serverTime` optional at all four sites, not one).

**What the thirteen actually were, because the shape recurs:** almost all were `.strict()` guarantees
that existed in the schema and were asserted nowhere — pinned on 2 of 5 payload schemas, absent on the
nested `claim` object the commit called "carried verbatim", absent on `notificationBaseSchema`. Plus a
day-shape regex with **no test at all** (every input used the one valid value `2026-08-30`). The test
named for the planted defect probed only the TOP level, so invented urgency could live one level down.

**One pin is a TYPECHECK pin, not a vitest pin, and `vitest run` says nothing about it.** The
`NotificationPayload` exhaustiveness check is a type-level identity between the schema map's inferred
outputs and the union. A 6th kind with schema and map entry but a stale union used to typecheck
**clean**; it now fails `tsc` with TS2344. **Anyone verifying with the test suite alone will not see
it** — this is why the gate runs `typecheck`, and why a "tests pass" report is not a gate report.

**RECORDED, NOT FIXED — carried forward with owners:**
- **The `as NotificationPayload` cast in `parseNotification` remains.** It cannot be removed from
  inside a test file, and the plan's Interfaces block fixes the non-discriminated `{ kind, payload }`
  shape, so the fix agent had no licence. The drift it hides is now caught at compile time; the
  residual risk is that deleting one type alias in the test file silently removes the only check.
  **Owner: whoever revisits Task 3's source.**
- **Batch A added ~131 tests with no `test-cases/` entry.** **Owner: Plan 9 Task 15**, which opens
  §11 and reserves ids 11.1-11.47 — it must back-fill these or they never get catalogued.
- **`extractMentionedUserIds(42)` / `(true)` / `({content:'x'})` are unpinned.** Structurally safe
  (traced), and the task contract does not name them, so not built. **Owner: next owner of
  `doc-mentions.ts`**, if parity with `docToPlainText`'s malformed-input list is ever wanted.

## STOP — PLAN 9 NAMES TEST PATHS THAT VITEST NEVER COLLECTS. 25 SITES. READ BEFORE ANY TASK.

**Every test path the plan spells `packages/<pkg>/src/<name>.test.ts` is a suite that CANNOT FAIL.**
All four packages Plan 9 touches restrict collection to `test/`:

| Package | `vitest.config.ts` include |
|---|---|
| `packages/domain` | `['test/**/*.test.ts']` |
| `packages/rule-engine` | `['test/**/*.test.ts']` |
| `packages/app-core` | `['test/**/*.test.{ts,tsx}']` |
| `apps/server` | `['test/**/*.test.ts']` |

**PROVED BY CANARY, not reasoned.** A deliberately failing test (`expect(1).toBe(2)`) planted at
`packages/domain/src/zz-canary.test.ts` left the full suite reporting **"350 passed"**. An explicit
`vitest run src/zz-canary.test.ts` printed `include: test/**/*.test.ts` and collected nothing.

**The plan names `src/*.test.ts` in 25 places** — File Structure blocks, Step instructions, the
`vitest run` command lines at plan lines 163/248/356/364/369, and even a `git add` at line 380.
**Task 2 and Task 3's implementers each caught it independently and deviated correctly**, but that is
two coin flips that happened to land right, not a control. **The next implementer who follows the plan
faithfully ships an invisible suite, and every downstream reviewer sees a green run.**

**THE RULE FOR EVERY REMAINING PLAN 9 TASK, and it goes in every dispatch:** tests live under
`packages/<pkg>/test/` (or `apps/server/test/`), importing the subject as `../src/<name>.js` —
**never by package name**, which resolves through a stale `dist` and tests the wrong build.

This is exactly the shape the brief warns about — *a check passing for a reason unrelated to the
property it names* — with the failure moved one level out: not a test that cannot fail, but a test
that was never run at all, reporting as part of a passing suite.

## CLOCK SENSITIVITY — the brief's named known-gap, enumerated for this plan

**Only TWO places in Plan 9 read a clock, and only one of them is in production code.**

- **T6 (the sweep)** injects `now: () => Date` everywhere it is tested, which is already the right
  design. The risk is a future test falling back to the `deps.now ?? (() => new Date())` default and
  passing because **both machines are Asia/Kolkata**. Every dedupe-key/boundary assertion in
  `sweep.test.ts` must run at least once under a forced non-IST `TZ`.
- **T14** is the one unmocked `new Date()` -> `istToday()` in production. `apps/web/src/ist-today.ts`
  **already exists** (Plan 6) **and already carries the TZ discipline** — a documented
  Asia/Kolkata / Pacific/Kiritimati / Pacific/Niue loop. **Reuse it; do not reinvent a day computation
  inline.**
- **T8, T9, T10, T11 are clock-FREE by construction** — `today`, `month` and `anchor` are injected
  strings. The obligation there is architectural: keep them that way. A `new Date()` appearing inside
  `calendar-model.ts` or `timeline-model.ts` reintroduces exactly the conflation this plan avoids.

> ### THE TZ LOOP IS INERT IF THE DAY ARITHMETIC HAPPENS IN POSTGRES — check this BEFORE believing T6
>
> **`TZ` on the node process does not change `CURRENT_DATE`, `now()` or `date_trunc` server-side.**
> `apps/server` tests hit a real database on 54329. So a sweep written as
> `WHERE due_date <= CURRENT_DATE + interval '3 days'` returns **identical results under every zone**,
> and a reviewer running Asia/Kolkata / Pacific/Kiritimati / Pacific/Niue would report three-zone
> agreement **as evidence the TZ discipline works, when in fact nothing varied.** That is a check
> passing for a reason unrelated to the property it names — the exact shape this series keeps finding,
> wearing a new costume.
>
> **So the discriminating question comes BEFORE the TZ loop: where is the day boundary computed?**
> When T6's review lands, establish that first. If "today", the approaching horizon, or the staleness
> cut-off is computed in SQL, three-zone agreement proves nothing and the real check is varying the
> **session** timezone (`SET TIME ZONE`) or proving the arithmetic is JS-side end to end. T6's
> dispatch pushes toward JS by telling the implementer to copy `ist-today.ts`, so this may well come
> out fine — **but "came out fine" and "was checked" are the distinction this branch is built on.**

## BATCHES for step 14, from the pre-flight and adjusted for shared files

**A: T1, T2, T3** (domain) · **B: T4** (table+store) · **C: T5 then T6, SERIAL** (T6 consumes T5) ·
**D: T7** (API) · **E: T8, T10, T12** (disjoint app-core dirs) · **F: T9, T11** (components over E's
models) · **G: T13** · **H: T14** · **I: T15** (closeout, last).

**T2 and T3 both modify `packages/domain/src/index.ts`** — additive export lines, but run them so the
writes do not interleave.

**BATCH E RUNS SERIAL TOO. Decided now, in the quiet, rather than under pressure with three agents
queued.** T8, T10 and T12 are genuinely independent by directory, so E is the one place the serial
pattern could be broken — but **T8 writes `packages/ui/src/tokens.ts`, which T10 and T12 may READ
while it is half-written**, and the pre-flight called that "a light shared-file coordination point"
rather than no point at all. Against that: nine commits of a working serial pattern with **zero
transient-state incidents**, a cost ruling that explicitly wants thinner machinery, and step 13's
recorded episode where thirteen agents on one shared tree produced states another reviewer read as
tampering and nearly filed as a security finding. **Worktree-per-agent is the alternative the brief
allows; it is not worth its merge overhead for three tasks.** Serial.

**NOT YET VERIFIED, and it is T15's to check LIVE before it writes anything:** the pre-flight took
`Features.md` §11 and `test-cases/11-calendar-notifications.md` as free from the coordination doc's
line ~6546, and said so — *"not verified in this recon pass … worth a live grep before executing."*
**Plans 6, 7 and 8 may have claimed adjacent numbers since that line was written.** The numbering
convention is plan N → §N+2, which puts Plan 9 at §11, but confirm on disk rather than by convention:
this repo has already produced one controller note refusing a section number an executor assumed. **T6 is the floor-list task and carries a hard MUST from the coordination
doc: no stub.** If Plan 5's `getWorkspaceSettings` surface were missing it must STOP and escalate, never
substitute a local constant. It is not missing — `apps/server/src/projections/workspace-settings.ts`
and migration `1788272876259_proj-workspace-settings.sql` are both present.

## COORDINATION OBLIGATIONS BINDING PLAN 9 (verified present in the doc)

- **Notification rows stay UNREDACTED after a user's visibility is revoked** — *"a message you were
  sent is yours; revocation removes future sight, not letters delivered."* T4/T7 must not scrub history.
- **The mention gate stays SILENT server-side** — a mention notification must never become a probe for
  who can see a ticket. Apply `canSee` before delivering. Editor-side "unreachable mention" warnings are
  *permissible polish, not queued scope*.
- **Preferences are whole-document** `GET/PUT /v1/me/preferences?workspaceId=`, not the per-key
  `PUT /:key` Plan 9 assumed. T13's gateway does read-modify-write, inheriting last-write-wins. **Do not
  "fix" it back toward the plan's text.**

# ============================================================================
# EVERYTHING BELOW THIS LINE IS STEP 13 (PLAN 8) HISTORY. Step 13 is MERGED.
#
# It is kept because its LESSONS are live and several were expensive to learn.
# It is NOT a position, and nothing below it tells you what to do next --
# the sections above do. Read below for method, never for state: its "next
# work", "in flight", "remaining" and "no PR is open" phrasings are all spent.
# This banner exists because the previous version of this file was refreshed
# at its top and stale twenty lines down, and merged to main that way.
# ============================================================================

## THE SEQUENCE, and where step 13 sat

Spine: `1,2 → 3,4 → 5 → {6,7,8,9,10} → 11`. **Steps 1–12 are closed.**

Remaining: **13. Plan 8** (here) · 14. Plan 9 *(T6 floor-list)*, T14 after `apps/web` · 15. Plan 10
remainder *(T7, T9, T14/T15 floor-list)* · 16. Plan 11 *(T8/T9, T12 floor-list)* — last by
construction.

## PLAN 8's FLOOR-LIST ENTRY IS ALREADY DISCHARGED — and that licenses less than it looks like

The coordination doc's floor list names exactly one Plan 8 item: **"Plan 8's F5 amendment (the
'cover' semantics are a design call)"**. Coordination line 546 records that the amendment was
**pulled forward as its own PR** because no task in any plan absorbed it — *"Plan 8 only consumes
`adviseWorkflowDef`, never modifies it."* **Verified on disk at this base:**
`packages/domain/src/advise-workflow.ts` ships both advisory sweeps (`rdu-bypassable`,
`rule-bypassable`), and the COVER design call is made *and argued* in its docblock —
same-kind-present, parameters never compared, stated explicitly as "a floor, not a proof of equal
strictness". `packages/domain/test/advise-workflow.test.ts` and the rule-engine fixtures exist.

**So Plan 8 carries no floor-list task. It does NOT follow that Plan 8 is a sonnet plan.** The
MODEL & EFFORT class rows are independent of the floor list, and two of them — *honesty-carrying
view-models* and *fixture authoring and planted-defect design* — are opus-high wherever they appear.
**Priced as opus BEFORE the batch starts, not discovered mid-batch:**

| Task | Why opus |
|---|---|
| **T8** live validation | Eleven issue codes, each owed a planted-defect test, **plus the advisory code whose test proves the OPPOSITE property** — that publish stays *enabled* while a warning is on screen. That inversion is exactly where a check that cannot fail hides. |
| **T9** publish flow | Server refusals rendered verbatim + the stranded-state mapping dialog, where occupancy is **"a builder courtesy, never an engine input"**. A refusal that depends on a count would make the two engines disagree by construction. |
| **T11** ticket-type management | The plan's own title names it: *"the divergence a re-binding leaves behind"*. |
| **T12** admin gating end-to-end | A read-enforcement surface. This series has produced rulings P19, P22 and P23 on exactly that shape, **every one a disclosure no test caught**. |

Escalation runs upward; the cost ruling lowered floors, it did not forbid this. **Plan 7's T10 was
not on any floor list and its escalated reviewer found the step's most dangerous unfalsifiable
check.**

## FIVE THINGS THAT WILL COST A ROUND EACH IN STEP 13

**1. The catalogue home is §10, NOT §8 — and the §8 refusal on record does not apply here.**
`Features.md` runs §7 → §9 → §12 and `test-cases/` holds `03,04,05,06,07,09,12`. The numbering is
**plan N → §N+2** (§1 Reference base and §2 Product design sit ahead of the plans): Plan 1→§3,
Plan 3→§5, Plan 5→§7, Plan 7→§9, Plan 10→§12. **Plan 8→§10.** Ledger row `06/16` carries a
controller note refusing §8 — **that refusal is about PLAN 6's web client**, whose catalogue landed
in §3 because migrating 112+ live cross-referenced ids breaks the never-renumber rule. It says
nothing about Plan 8. Plan 8's own Task 15 pins **§10 / `10-workflow-builder` / cases `10.x`** and
instructs: *"If the numbers on disk disagree at execution time, stop and flag it to the
orchestrator; do not take another number."* **They do not disagree — §10 and
`test-cases/10-workflow-builder.md` are both free.** T15 therefore **opens** a section rather than
extending one, which is the opposite of Plan 7 T16's situation. New cases start at **10.1**.

**2. `@xyflow/react` is NOT installed anywhere in the monorepo** — swept across the root and every
`packages/*` and `apps/*` `package.json`. Task 5 adds it. **The jsdom hazard is the real cost:**
React Flow measures its container, and in jsdom with no `ResizeObserver` and no explicit
width/height **it renders no nodes**. That fails two ways and the second is worse — confusing red,
or **a green suite asserting over an empty canvas**. The discriminating check is a planted defect
that *removes a node* and must redden. If it does not, the harness is not rendering and every
canvas assertion in the plan is vacuous.

**3. T4's gateway — MEASURED, and the answer is the opposite of the feared one. ALL SEVEN
OPERATIONS ARE ALREADY SERVED BY A REGISTERED ROUTE.**

`apps/server/src/routes/builder-reads.ts` exists, and `registerBuilderReadRoutes` is **called** at
`apps/server/src/app.ts:253` — not merely defined. It registers exactly Plan 8's gateway surface:

| Gateway operation | Route | builder-reads.ts |
|---|---|---|
| `listWorkflows` | `/v1/workspaces/:workspaceId/workflows` | 482 |
| `getWorkflow` | `/v1/workspaces/:workspaceId/workflows/:workflowId` | 500 |
| `listTicketTypes` | `/v1/workspaces/:workspaceId/ticket-types` | 531 |
| `listMembers` | `/v1/workspaces/:workspaceId/members` | 547 |
| `getStateOccupancy` | `/v1/workspaces/:workspaceId/workflows/:workflowId/state-occupancy` | 580 |
| `getTypeWorkflowPopulation` | `/v1/workspaces/:workspaceId/ticket-types/:typeId/population` | 602 |
| `migrateTypeToWorkflow` | `/v1/workspaces/:workspaceId/ticket-types/:typeId/migrate` | 693 |

`submit` rides `registerEventRoutes`, called at `app.ts:204`. **So Plan 8's gateway is NOT a mocked
contract excusing a server that does not exist** — the read surface landed ahead of it.

**Two consequences, and the second is a live correction to the plan.**

- **The plan's own assumption 3 is now stale.** It calls the migrate endpoint *"unowned server
  work — see Open question 13"* and assumes the path
  `POST /v1/workspaces/:workspaceId/ticket-types/:typeId/migrate-workflow`. **The real path is
  `…/:typeId/migrate`** and the endpoint is built. T4 and T13 must consume the real path; an
  implementer transcribing the plan's assumed path would write an adapter that 404s, and no
  app-core test would notice because the fake answers instead.
- The fake stays justified for tasks 5–12 — but T13's adapter is now checkable against a real route
  rather than a promise, and **T4's docblocks must not claim any of these is unserved.**

**The sweep that found this failed its own control first, and the correction is the transferable
part.** The pattern `export function register[A-Za-z]*Routes` returned 12 registrars and **omitted
`registerAttachmentRoutes`, which is known to exist** — because that one is declared
`export **async** function`. Twelve results looked like a complete enumeration. Re-run as
`export (async )?function …` it returns **13**, and the one registrar with no call site is
`registerAttachmentRoutes` — which independently re-confirms step 12's finding. **An over-specific
sweep returns a well-formed wrong answer, and the only thing that exposed it was knowing one row
that had to be in the output.**

**The original hazard, kept because it still binds the shape of T4:** T4
defines `WorkflowAuthoringGateway` and its in-memory fake, and **twelve tasks then build against
that fake** before T13 ever touches a real `DataSource`. The wave-boundary integration checkpoint no
longer fires and step 10's replacement is spent. **Do a server-read inventory BEFORE T4**, not at
T13: enumerate every read and write the gateway needs (workflow list, def fetch, `getStateOccupancy`,
ticket-type reads, publish submit) and check which the shipped server actually serves. The publish
path is wired — `registerEventRoutes` resolves to `app.ts:204`. The **reads** are the open question.
Where a read does not exist, the honest shape is for T4's interface to make the gap visible so T13
surfaces `ServingGapError` — **never to weaken one to make a view light up**, which main's handoff
explicitly forbids. Step 12's final review found `registerAttachmentRoutes` is defined and **never
called**, so "the module exists" is not evidence the route serves.

**3b. PLAN 8 COVERS ONE OF THE TWO ADVISORY CODES THAT SHIP, AND ITS OWN CATALOGUE TEXT SAYS SO.**

Measured with a positive control in the same run: **`rule-bypassable` appears 0 times in Plan 8**,
while **`rdu-bypassable` appears 17 times in the same file**, and
`packages/domain/src/advise-workflow.ts` demonstrably emits **both** codes. Plan 8's text predates
the F5 amendment commit `c7fef4b` (*"Every guard now says when an arrow goes around it, and the
arrow that carries its own guard says nothing"*), which is the commit that added `rule-bypassable`.
The amendment was pulled forward as its own PR precisely because no task absorbed it — and the
consequence nobody wrote down is that **the plan that consumes the advisory tier still describes the
one-code version of it.**

The code half is harmless: the advisory section is fed by `adviseWorkflowDef` and anchored through
the same widened `anchorIssues`, so a `rule-bypassable` advisory **renders correctly today with no
change**. Two things are not harmless:

- **Task 8's advisory coverage table has one row (A1, `rdu-bypassable`).** Nothing exercises the
  second code, so the claim "the advisory tier is covered" would hold for half the tier. Given the
  plan's own standard — *"Without the pair, 'advisories do not gate publish' is a convention rather
  than a guarantee"* — the same argument applies to the second code.
- **Task 15's `Features.md` text is dictated verbatim by the plan and says the advisory section
  "carries `rdu-bypassable`"**, naming one code where two ship. Transcribed faithfully, that ships a
  false catalogue claim, in the document whose whole purpose is describing reality.

**Conservative default taken, per the coordination doc's ruling protocol** (take the conservative
option, record it in the same change set, notify, continue — never block): **cover both codes and
correct the one catalogue sentence.** This widens Task 8 by one test and edits one dictated
sentence in Task 15; it does not touch `packages/domain`, whose COVER semantics are settled and must
not be reopened. Recorded here rather than fixed on the spot because the tasks that own it have not
run yet — **this is a note to T8 and T15, not a licence for any other task to touch the tier.**

**4. The `apps/web` TS6053 hazard returns at T13, which adds six pages.** `apps/web/tsconfig.json`
excludes `.next` because Next's default `include` globs a directory `next build` deletes while turbo
runs typecheck concurrently — measured **2 red of 3** without the exclude. It cannot be a narrower
include: `next build` rewrites that file's `include` every run and never touches its `exclude`.
**If the gate reddens on `@gisik-nokma/web:typecheck` with TS6053, this is why — and run it three
times before believing either answer.**

**5. Verify BEFORE T14 whether Playwright is installed and whether CI actually runs it.** T15's own
verification step accepts `pnpm --filter web e2e` **SKIPping loudly when the env gate is unset** as a
pass. A smoke test that is outside the gate and skips by default is a check that cannot fail. State
plainly in T14's commit which of the two it is.

## THE THREE THINGS FROM EARLIER STEPS A SUCCESSOR MUST NOT UNDO

1. **`Chosen<T>`'s default arm carries no `value`, deliberately**
   (`packages/app-core/src/views/view-types.ts`). A pair would let a consumer read `.value` and
   ignore `.origin`, which is how ruling P24 was being violated. The obvious tidy-up restores the
   defect.
2. **`packages/app-core/src/views/transition-dialog.tsx` resolves wildcard-vs-exact by
   `find(exact) ?? find('*')`**, matching the engine and `precheck.ts`. That is **Ruling P27**,
   applied in step 12, pinned by cases 3.149–3.151. Restoring first-declaration-order kills exactly
   one test (3.149). Plan 8 authors workflow defs constantly and will meet this resolution; do not
   "simplify" it back.
3. **The six `ServingGapError` refusals in `packages/app-core/src/online/` are the point, not a
   shortfall.** Each is cross-checked in `apps/server/test/integration/client-contract.test.ts` and
   goes RED the day its route serves the field. **Do not weaken one to make a Plan 8 view light up.**

## RECORDED, NOT FIXED — carried into step 13 with owners, from step 12

- **`registerAttachmentRoutes` is never called** (`routes/attachments.ts:211` is its only appearance
  in `src/`), so the `attachments` table can never gain a row and `image-embed-gate` refuses every
  embedded image: correct about the rule, useless as a product. **Owner: Plan 11's deployment work**,
  which owns the boot path, the `start` script and the deployment target.
- **`.env.example` carries a stale `S3_*` placeholder block** predating T8's `OBJECT_STORE_*`
  variables. **Owner: Plan 11's deployment hardening.**
- **`comparableHeaders` is defined locally in ELEVEN server test files**, all byte-identical.
  **Owner: a later test-helper consolidation.**
- **`schema.test.ts` carries two "CURRENT BEHAVIOUR pending Task 5" cases about paste-rule
  autoformatting that Plan 7 Task 5's text never covers.** **Owner: plan author.**
- *(raised in step 13, not carried from step 12.)* **`packages/app-core/test/helpers/fake-data-source.ts`
  validates nothing.** Its `ingest` pushes to
  an array and runs no schema check, so it is the seam through which the `toStateId` payload drift
  and the non-ULID seed `actorId`s pass silently (coordination doc §"The validating fake", 2802–2825).
  It is the sibling of the seam Plan 8 T4 hardened (`createFakeGateway`), and T4 does not touch it.
  **The doc's own assignment — "Owner: Lane 4" at line 2825 — names an owner that no longer exists.**
  (The review that raised this cited 2826; that line is blank. Measured: 2825, and it is the only
  `Owner: Lane 4` in the file — the other `Owner: Lane` is Lane 2 / Plan 4 at 2590.)
  Lane 4's own file opens *"execution state at fold-back to serial … written 2026-08-31 when Wave 1
  folded back into serial execution"*, and the last mention of the lane anywhere in the coordination
  doc is line 4001 of 6169 — a back-reference to a dependency version it shipped, inside a 2026-08-31
  section — with roughly 2,100 lines of later material naming it nowhere. Two sweeps found no
  successor: succession vocabulary (`successor`, `inherits`, `picks up`, `passes to`, `reassign`,
  `carried into`, `hands off`) and the item's own vocabulary (`fake-data-source`, `validating fake`,
  `app-core/test/helpers`), each run through `rtk proxy` with a positive control from the same run.
  Lane 4's `lane4-periphery-state.md` §6 "Open claims on other plans" does not carry this item either
  — it carries only the `seed.ts` non-ULID half, **and that bullet names no owner at all**, so it is
  orphaned by the same fold-back and needs one too. **Owner: the serial executor chain**, recorded
  here because this file is the surface a task boundary actually reads. **Do not re-assign to Plan 6**,
  which created the file and has closed: measured in `task-ledger.tsv`, all eighteen `06` rows read
  `done` with a merge sha, against a positive control of fifteen `08` rows reading `todo` in the same
  run. (`executor-state.md`'s own lesson list says step 12 twice mis-assigned work to Plan 6 after it
  closed; that aside is what prompted the check, not what settles it.)

## BATCH A — T1, T2, T3, T4. All committed. Gate green at HEAD.

| Task | Result |
|---|---|
| **T1** draft store + layered auto-layout | **DONE.** One Important: **the copy-on-write immutability the plan's own header names was pinned by NOTHING** — mutating `renameState` to assign in place left all 497 app-core tests green and `tsc` silent. The implementer's own commit title records the sequel: *"the test I wrote to pin it passed on mutating code twice before it worked."* The reviewer also reported a genuine **survivor** (dropping the dangling-marker guard in `layoutDraft` kills nothing) and — this is the part that matters — **stated in the same breath that the mutation demonstrably ran**, which is the distinction between an unconstrained path and a mutation that never executed. Only the second condemns a check that is fine. |
| **T2** summaries, field choices, per-code anchoring | **DONE.** Two Important: `BUILTIN_FIELD_CHOICES` was missing `startDate` against domain's own `BUILTIN_FIELD_IDS`, and a `duplicate-transition` anchor queue whose fixture could not distinguish one-anchor-per-repeat from the correct grouping — **the reviewer reported that mutation as a non-site-identifying survivor rather than a pass**, and the fix round replaced the fixture. Anchoring was separately verified order-independent by reversing `validateWorkflowDef`'s output and re-running. |
| **T3** template gallery | **DONE, and it did not fall into the trap.** It imported `SIMPLE_KANBAN_TEMPLATE` from `packages/domain/src/simple-kanban.ts` and created only the genuinely-absent `errand-with-waits.ts`. **It also found a real conflict nobody had ruled** — see below. One **Critical**, and it was against T3's own ruling-request prose. |
| **T4** gateway, validating fake, event builders | **DONE.** Nine mutations run, **every one site-identifying**. One Important, again against prose: the commit's owner-verification claim for a recorded item was false in both its parts. |

**The through-line of Batch A: eight of the ten findings were against PROSE, not code** — false owner
verifications, a present-tense claim the same commit falsified, an incomplete absence enumeration, and
arithmetic that did not close. **The tests, where mutation-proved, held.** That is the same
distribution steps 11 and 12 produced, and it is the argument for keeping the reviewer stage at the
lowered floors: the gate does not run prose.

### T3 found a conflict that no plan had ruled, and correctly refused to resolve it

`ERRAND_WITH_WAITS_TEMPLATE` is pinned by Plan 11's `checkErrandTemplate` oracle and its own docblock
(*"Edit this only with that check green"*). It trips **`rule-bypassable` twice**: `require-comment`
guards `in-progress → waiting`, while `later → waiting` and `next → waiting` enter the same state
carrying no such rule — and `later → waiting` **must stay rule-free**, because it is one of the seed's
pinned one-hop paths. Task 3's own prose asserts the opposite invariant twice: *"a shipped template
that greets the author with a warning is a shipped template that is wrong."* **Both cannot hold.**

T3 took the conservative path: it recorded the **actual** advisory output in `templates.test.ts`
rather than asserting the stale "warns about nothing" claim for that one template (the other two
still assert clean), touched neither the template nor the check, and filed a ruling request.
**Recorded as an open ruling — do not let a later task resolve it by fixing the template or
weakening the check.**

### The Critical was an overclaim inside the ruling request itself, and the fix needed two commits

T3's ruling request titled itself *"unowned by any open plan"* and asserted it had **verified** Plan 2
does not claim the check. Its reviewer refuted this: the **F5 ruling at coordination lines 512 and 521
designed `rule-bypassable` into existence** (*"adviseWorkflowDef emits a `rule-bypassable`-style
advisory for any guarded target also reachable by a lower-guard edge, for every rule kind"*). The
heading now reads *"Plan 2's own ruling designed the check but did not settle this shape"*, which is
the honest narrowing.

**The fix round then needed a SECOND commit (`bdcb5a6`) to withdraw the claim properly** — the first
correction was itself incomplete. That is this series' most reliably recurring pattern, now observed
again on this branch, and it is the whole argument for reviewing a fix round rather than trusting it.

### T4's reviewer compared the fake against the REAL door, and the fake's absence list was short

The coordination doc's Lane 3 ruling (*"the validating fake"*, ~lines 2806-2825) is **not in Plan 8's
own Task 4 text**; it was injected into the dispatch and implemented — `createFakeGateway` now runs
every submitted event through the shipped `submittedEventSchema`, proven by two mutations (disabling
validation, and recording an invalid envelope as submitted) that each redden exactly one test.

But the fake's docblock enumerated its divergences from the real door **incompletely**. A probe that
ran the same events through both found two more: **entity-kind mismatch** (`parseEvent` refuses a
`workflow.defined` filed against a ticket; the fake commits it) and **duplicate event id** (the real
door answers `{status:'invalid', code:'duplicate-event-id'}`; the fake commits it twice, returning
the same `eventId` with `seq` 1 then 2). **An absence enumeration that is short is exactly as
misleading as a partiality marker**, which is why the rule says enumerate rather than say "partial".

### The test-delta arithmetic did not close, and the shape of the error is worth keeping

T4's commit claimed app-core `474 → 543` with *"Tasks 1-3 already added 69 before this one"* and
*"this task added 11"*. **474 + 69 = 543 leaves nothing for the 11.** The 69 was the whole-workspace
delta (2301 − 2232) re-used as the Tasks 1-3 figure, double-counting T4's own contribution.
Re-measured by excluding the task's own test file: **Tasks 1-3 added 58, T4 added 11, 58 + 11 = 69.**
A decomposition that reconciles at the total and not at the parts reads as verified — the total was
right, which is what made it persuasive.

## BATCH B — T5, T6, T7, T8. All committed. Gate green at HEAD.

| Task | Result |
|---|---|
| **T5** React Flow canvas | **DONE**, and it settled the harness question first, as instructed. Two Important, both **false claims in prose**, and its fix round **died mid-write on the expired login** — recovered and committed as `87ab662` after independent verification. See the harness findings below. |
| **T6** select-to-edit inspectors | **DONE.** One Important: **the coordination doc's own test-count arithmetic was self-refuting** (`573 → 578` with a claim no pre-existing test changed status). T6 was told to measure the connect gesture and **did** — result below. |
| **T7** rule editors | **DONE.** One Important, and it is a **finding class worth naming: every conditional affordance was asserted present-when-expected and never absent-when-not**, so none could detect OVER-firing. Load-bearing for the require-field unknown-field warning, which is the only enforcement of design decision 3 anywhere in the product. The reviewer proved it by running both directions of each mutation: `isEmpty = false` (helper never shown) reddens; **`isEmpty = true` (helper ALWAYS shown) does not.** |
| **T8** live validation *(opus/opus)* | **DONE, verdict SHIP — 27 executed mutations, the most thorough review on this branch.** All eleven issue codes reddened individually and by name; **both** advisory codes anchored; merging the two tiers reddens five tests; truncating the advisory list reddens one. It also mutated `packages/domain/src/validate-workflow.ts` itself to confirm the app-core tests genuinely reach the real validator, and mutated `packages/ui/src/ui.css` to confirm the token-discipline check catches a raw hex. |

### The jsdom harness, now measured in three parts rather than assumed

1. **Rendering is real.** Mutating `state-node.tsx`'s `{data.name}` to a literal reddens canvas tests
   by name. The canvas assertions in Tasks 5-10 are not theatre.
2. **`setup.ts`'s `Object.defineProperty` wrapper is load-bearing for GESTURES, not clicks.** Without
   it d3-drag's `nodrag(event.view)` throws on user-event's `view: null`, **jsdom's own dispatch
   SWALLOWS the TypeError**, and the gesture silently no-ops while 561 tests stay green. The drag test
   added in T5's fix round is the only assertion in app-core that reddens when the wrapper goes —
   **verified independently by me: exactly 1 of 11 canvas tests fails, and it is the drag test.**
3. **A connect gesture CANNOT be driven to completion in jsdom, and T6 measured it rather than
   assuming.** The test is named for what it establishes, and its planted defect
   (`onConnectStart` firing `addTransition`) reddens it. **The mapping layer
   (`connectionToTransition`) carries the property instead.** Recorded in the coordination doc under
   `## Plan 8 execution consequences (2026-09-03) — the connect gesture, measured and closed`
   (~line 6171) so Tasks 9-10 read it rather than re-deriving it.
4. **jsdom has no layout engine**: every `getBoundingClientRect` is 0x0 and a drag lands a **zero
   delta**. A gesture test must assert the action firing, **never a coordinate**.

### A stale citation I wrote into two dispatch briefs, caught by T8's reviewer

My Batch B and C briefs cited the errand-template ruling request as *"the coordination doc's Plan 8
execution consequences, entry 5"*. **That was true when T3 filed it and false by the time I wrote
it**: T3's own fix round (`48c3655`) moved the entry to its **own top-level heading**,
`## RULING REQUEST — Plan 8 Task 3's frozen errand template trips rule-bypassable` (~line 6126). Worse,
`## Plan 8 execution consequences` (~line 6171) now exists as a **different** section — T6's
connect-gesture record — so the stale pointer resolves to a real heading that is not the subject.
**A pointer that lands on the wrong real section is worse than one that lands nowhere**, because
nothing about it looks broken. Corrected in the Batch C brief; `batch-d` never carried it.

## BATCH C — T9, T10, T11, T12. All committed.

| Task | Result |
|---|---|
| **T9** publish flow *(opus/opus)* | **DONE.** Two Important, and **both were tests named for properties their own fixtures could not decide.** (1) `bumps from the PUBLISHED base` could not tell the base from the draft: `draftFromPublished` copies `published.version` into **both** `def.version` and `base.version`, so for every draft that file can build, `base.version + 1` and `def.version + 1` are the same number. It ruled out a hard-coded 1 and nothing else. (2) The occupancy-failure test asserted only the **first** half of its named property — it stopped at `toBeDisabled()` and never picked a target, never re-enabled, never published. **The mutation "make a failed count block publishing" SURVIVED**, which is exactly the missing half. |
| **T10** the three screens | **DONE.** Two Important, both about error handling the plan never specified: `Promise.all([...]).catch()` collapsed a **documented-normal** guest roster refusal into a full-screen fatal error — making the empty-roster degradation path unreachable through the screen and throwing away a successfully-loaded `ticketTypes` — and `WorkflowListScreen` had **no `.catch()` at all**, so a rejection left it on "Loading workflows…" forever. |
| **T11** ticket types *(opus/opus)* | **DONE — one CRITICAL, and it is the sharpest finding of the step.** See below. It also corrected the coordination doc's false "Done", and **corrected an absence claim of mine in the process.** |
| **T12** admin gating *(opus/opus)* | **DONE, verdict ship on 16 mutations — but its Important is a lesson about enumeration.** The gate enumeration the commit was built on **stopped at the builder screen**. The ticket-type editor — the other half of the gate, and the half that owns field-schema and rank authoring — got no control enumeration and no button sweep, so **three of its five non-author gates were pinned by nothing and all three mutations survived the full 211-test suite.** Fixed in `c5f7c60`. |

### T11's Critical: the move gate asked the wrong question, and the wrong question is answerable

`ticket-type-editor-screen.tsx:249` gated an irreversible bulk migration on
**`save.phase !== 'saved'`** — *"has this form ever been saved?"* — rather than on whether the
**selected binding matches the saved one**. Both questions return "yes, allowed" in the common case,
which is why it read as correct. **After saving a re-bind, an admin can re-point the combobox again
and fire the migration at a workflow the tickets were never bound to** — an irreversible bulk
operation aimed by a stale answer to a question nobody meant to ask. Fixed in `7d993f2`.

A second Important on the same screen shares the shape: the completed-move sentence **re-read the
live combobox** instead of the workflow the migration actually targeted, so changing the binding
afterwards silently rewrote a statement about a past action into a false one. The `migrated` payload
carried the count but not the destination.

**The transferable form: a gate that asks a question whose usual answer coincides with the right
one.** It is not detectable by reading the gate — only by asking what it would do when the two
answers diverge.

### T11 corrected an absence claim I wrote, and the correction is the "nobody holds the moment" rule

My Batch C brief told T11 that a repo-wide sweep returned **zero files** for six names, including
`migrateTypeToWorkflow`. **That was measured before Task 4 ran and carried forward unchanged after
it.** At the sha T11 measured, `migrateTypeToWorkflow` returned **three** files — `gateway.ts`,
`fake-gateway.ts` and `events.test.ts` — because **Task 4 had already landed the gateway method and
its fake.** Re-verified by me at HEAD: **five** files now, against a control of 34 for
`adviseWorkflowDef`.

**The enumeration was true when I made it and false when I used it, and nothing about its form said
so.** What was actually missing was every *consumer* of that method, not the method. T11 put the
correction in the coordination doc rather than quietly dropping the row, which is the right call:
the corrected line now names its own controls and states which row was stale.

**Rule, restated because I broke it while quoting it: an absence sweep is a fact about a moment, and
a brief that carries one across a task boundary must re-measure it or date it.**

## TWO FINDINGS FROM THE ADAPTATION MAP THAT REACH BEYOND ONE TASK

### A. RULING REQUESTED — T13's adapter cannot be written as scoped. Four operations have a live
### route and no seam to reach it through.

Plan 8 amendment 10 says the builder consumes `WorkflowAuthoringGateway` and **`apps/web` implements
it over Plan 6's `DataSource`**. Measured against `packages/app-core/src/data-source.ts:125-139`:

| Gateway operation | `DataSourceQuery` member | Server route |
|---|---|---|
| `getWorkflow` | `getWorkflowDef(workspaceId, workflowId, version?)` | served |
| `listTicketTypes` | `getTicketTypes(workspaceId)` | served |
| `listMembers` | `getMembers(workspaceId)` — **returns `Actor[]`, not `WorkspaceMember[]`** | served |
| `submit` | `ingest(events)` | served |
| **`listWorkflows`** | **absent** | `/v1/workspaces/:workspaceId/workflows` — LIVE |
| **`getStateOccupancy`** | **absent** | `…/workflows/:workflowId/state-occupancy` — LIVE |
| **`getTypeWorkflowPopulation`** | **absent** | `…/ticket-types/:typeId/population` — LIVE |
| **`migrateTypeToWorkflow`** | **absent** | `…/ticket-types/:typeId/migrate` — LIVE |

**Four of eight operations have a real, registered, working HTTP route and no `DataSource` member to
reach them through.** This is not the usual shape of this series' failure — the server is *ahead*,
not behind. T13 as scoped ("an adapter over `DataSource`") is therefore **not writable** without one
of:

- **(a)** extend `packages/app-core/src/data-source.ts` with the four members — a **cross-plan touch**
  of Plan 6's file, and it widens an interface every existing `DataSource` implementation must then
  satisfy (the online one, the fake, and Plan 10's replica);
- **(b)** have the `apps/web` adapter call the four routes through the existing `online/http` client
  directly, leaving `DataSource` untouched. Amendment 10's rule is that **views** never speak HTTP;
  the adapter is not a view, and the view still sees only the gateway. Narrower, and it does not
  force Plan 10's replica to grow four members it has no offline answer for;
- **(c)** defer the four to a later plan and have T4's interface carry an honest refusal for them —
  but three of the four are load-bearing for Tasks 9 and 11, which are *in this plan*.

**Conservative default if no ruling arrives before Batch D: (b)** — it is the narrowest change, it
touches no other plan's file, and it cannot break an existing `DataSource` implementor. Recorded
here so the choice is visible rather than made silently inside T13. **`getMembers` returning `Actor[]`
where the gateway wants `WorkspaceMember[]` is a second, smaller reconciliation T13 owes regardless
of which option wins.**

### B. THE COORDINATION DOC CARRIES A FALSE "Done" ABOUT THIS VERY PLAN, AND IT IS THE DANGEROUS KIND

Coordination doc **line 216** reads: *"~~Plan 8 — the divergence-notice component.~~ **Done** — it
was already complete when this line was written; the agent that appeared to stall mid-insert had
finished. **Verified against the code rather than the note**: the copy table, the population read
with its honest-degradation states, the helper functions, the JSX, and the tests are all present,
including 'Leave them on …' as an affirmative button beside 'Move them to …'."*

**It is false.** Measured two ways, with positive controls in the same run:

- `git log --all --oneline -- packages/app-core/src/workflow-builder` is **empty** — no commit on any
  branch has ever touched that directory. Control: the same command against
  `packages/app-core/src/views` returns commits.
- A repo-wide sweep of the artefacts that line enumerates returns **zero files** for `Leave them on`,
  `Move them to`, `WorkflowRebindDialog`, `rankImplications`, `migrateTypeToWorkflow` and
  `TicketTypeEditorScreen`. Controls in the same run: `transitionOptions` → 6 files,
  `adviseWorkflowDef` → 6 files.

**What makes it dangerous is not that it is wrong but how it is wrong.** It does not merely assert
completion — it asserts completion *and claims to have verified against the code rather than the
note*, then enumerates five specific artefacts. That is the exact rhetorical shape a reader uses to
decide a claim is trustworthy, which is why a reader who hits it would skip Task 11's divergence
work entirely. **This is the "a pointer from a correct document to a stale one reverses" lesson in
its most persuasive costume: a stale claim wearing the vocabulary of verification.**

**Action: Task 11 is built in full, as if the line did not exist, and the line is corrected in the
same change set as Task 11.** Not corrected earlier, because the honest correction is *"absent, and
here is the commit that supplies it"*, which cannot be written until the commit exists.

## THE POST-MERGE GATE WENT RED ON NODE DRIFT, AND `which pnpm` DOES NOT TELL YOU THE RUNTIME

Recorded because the recorded rule (*a gate result is not evidence unless it names its Node*) is
right about the symptom and does not explain the mechanism, and the mechanism is what makes the trap
survivable.

I ran one gate without `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`. It went **RED**:
`13 successful, 21 total`, with **4 failures in `packages/sync-client`'s `better-sqlite3` conformance
tests** and this in the log —
`/Users/kiro/.nvm/versions/node/**v24.11.1**/bin/pnpm run test exited (1)`. A native binding built
for v22's ABI, loaded under v24. **Nothing about the failure text points at Node**; it reads as a
storage regression, and it appeared in the same command as a merge, which is exactly the moment a
red is most likely to be blamed on the merge. *Run the gate BEFORE a merge so a post-merge red is
attributable* is why this was catchable at all.

**The part worth keeping, because it defeats the obvious check:** with the export applied,
`node --version` prints **v22.22.2** while `which pnpm` prints
**`/Users/kiro/.nvm/versions/node/v24.11.1/bin/pnpm`** — in the same shell, at the same moment. Both
are true and they are not in conflict. `pnpm` is installed only under v24's bin, but it is a
`#!/usr/bin/env node` script, so **the `node` first on PATH decides the runtime regardless of which
directory the pnpm script lives in.** A successor who "verifies the toolchain" with `which pnpm` will
see v24 and conclude the gate is compromised when it is fine; one who checks `node --version` alone
sees v22 and is right, but for a reason they cannot articulate and therefore cannot defend.

**The check that actually discriminates is the one already in the repo:**
`apps/server/test/node-version.test.ts` **self-asserts the Node the suite is running under**, inside
the gate. Confirmed present in the green run. **Trust that, not `which`.**

Re-run with the export: **exit 0 · 24/24 · 0 cached · 2463 tests**, identical composition to the
pre-merge run. **The merge was never implicated.**

## THE GATE IS TWO COMMANDS AND I WAS ONLY RUNNING ONE — read this before reporting any gate result

**`pnpm turbo run build test typecheck` IS NOT THE CI GATE. It is half of it.**
`.github/workflows/ci.yml` runs **`pnpm check:env` FIRST**, then the turbo gate. When `check:env`
exits 1 the turbo step **never runs and shows as skipped**, so a CI failure here does not look like a
test failure at all.

**This blocked PR #85 and my own report said the branch was green.** Task 14's Playwright spec
introduced four `process.env` reads — `E2E_BASE_URL`, `E2E_WORKSPACE_ID`, `E2E_ADMIN_STORAGE_STATE`,
`E2E_MEMBER_STORAGE_STATE` — and none was in `.env.example`. The controller's independent CI run
caught it; fourteen of my own gate runs did not, because none of them asked the question.

**The mechanism is the branch's own recurring defect, and this time it was mine.** The Live-anchors
table has said **`check:env` exit 0** since branch creation. That was measured once, at the base, and
**carried forward through fifteen tasks without re-measurement — including past the task that added
four new environment reads.** The turbo composition was recounted at every batch boundary; the
`check:env` half was inherited every time. **The number nobody re-measures is the number that goes
stale, and a gate report is exactly as current as its least-recently-measured half.**

**RULE, for every remaining step: a gate claim requires BOTH commands, run at the sha being
reported.** The handoff's anchors are not evidence for either half.

Fixed and verified: the four are documented in `.env.example` in the house style (with
`E2E_MEMBER_STORAGE_STATE` marked genuinely **optional** — the spec's `configured` predicate requires
only the first three, a distinction invisible from the names, and the entry records that nothing in
CI sets any of them and `turbo.json` defines no e2e task). `check:env` exit 0 at **45 documented / 23
referenced**; commenting `E2E_WORKSPACE_ID` back out reddens the check **naming exactly that
variable**, restored and confirmed with `git diff`. Full CI-equivalent at `9017ebc`:
**`check:env` exit 0 AND turbo 24/24, 0 cached, 2463 tests.**

## IN FLIGHT

**PR #85** — https://github.com/bkirosangma/gisik-nokma/pull/85 — all fifteen tasks, 54 commits,
81 files, gate green at 2463. Awaiting the controller's merge. Nothing else is outstanding.

## FINAL WHOLE-BRANCH REVIEW — verdict `fix`, no Critical, and ALL FOUR findings were PROSE

One opus reviewer, per the cost ruling. **Four findings, zero code defects.** All four verified
independently before correcting, all four closed, gate unchanged at 2463 — which is what a
prose-only fix round should look like.

**The first finding explains why the other three survived fifteen task reviews, and it is the
strongest argument on this branch for keeping the whole-branch pass.** `builder-wiring.tsx` claimed
`WorkflowBuilderScreen` *"catches a refused roster by name"* — not merely false but **structurally
impossible**: the narrowing needs `AuthoringReadRefused`, declared under `apps/web`, and
`packages/app-core` depends on nothing there. **Its sibling one directory away already said so,
correctly and at length.** Two files in the same directory contradicted each other about the same
screen, and it shipped because **each was reviewed alone**. That is the seam a per-task stage cannot
see by construction.

**And the coordination doc asserted the correction had already landed.** The earlier fix round
corrected the sentence in `data-source-gateway.ts` and **left the identical claim standing one file
away**; `git log` on `builder-wiring.tsx` returns exactly ONE commit — Task 13's own — and never a fix
round. **A correction that names one site does not cover a claim that lives at two, and a doc entry
asserting the fix landed is precisely what stops anyone re-checking.** Both sites and the doc entry
are corrected.

The other three: the catalogue said the errand template blocked-flags "two waiting states" (**it has
one**, and the test it cites asserts `toEqual(['waiting'])`, a one-element array that would have
reddened on the claim written beside it); `Features.md` said the fake *"cannot reject at all"* (**it
can**, on two seeded flags — the absolute belongs to `listMembers` alone, and the coordination doc
had it scoped correctly while `Features.md` dropped the scoping); and a docblock said app-core
depends on three packages *"alone"* (**there is a fourth**, `@xyflow/react`).

**One claim was deliberately NOT "fixed":** that the template trips `rule-bypassable` **twice on two
pinned rule-free one-hop paths**. That is correct — **two paths into one state**. The plural was
wrong about states and right about paths, and a sweep that corrected both numbers would have broken
a true claim. **When correcting a plural, check which noun it counts.**

**Where the reviewer did NOT look, in its own words** — a re-reviewer starts here rather than
repeating covered ground: the workflow-builder UI component internals beyond the named seams, the
rule-editor suites, and the Playwright spec.

## RULINGS — ALL CLOSED. P28 and P29 taken, line 216 closed by T11. Nothing is open.

1. ~~**The T13 `DataSource` seam**~~ — **RULED. P28 (owner-approved, 2026-09-03), and it took the
   executor's recommended option (b).** The `apps/web` `WorkflowAuthoringGateway` adapter calls
   `listWorkflows`, `getStateOccupancy`, `getTypeWorkflowPopulation` and `migrateTypeToWorkflow`
   **directly over HTTP, bypassing `DataSource`**. The ruling's reasoning, recorded because it
   settles a rule that will be read again: **amendment 10's "no HTTP in views" binds VIEWS, not the
   gateway adapter** — the view still only ever sees the gateway interface, unchanged. `DataSource`
   stays untouched, so **Plan 10's offline replica is not forced to answer an offline-migration or
   offline-occupancy question before that plan exists.** The `getMembers` `Actor[]` →
   `WorkspaceMember[]` reconciliation is part of the same T13 work. Full text in
   `docs/lanes/controller-state.md` as P28 — **cite that, not the message that carried it.**
2. ~~**The frozen errand template trips `rule-bypassable` twice**~~ — **RULED AND CLOSED. P29
   (owner-approved, 2026-09-03): accept both trips as known and expected; touch NEITHER
   `checkErrandTemplate` NOR `adviseWorkflowDef`.** The advisory never blocks publishing, and the
   template digitizes a real shop's workflow warts included — sanitizing it would invent a cleaner
   reality than the one being recorded, which is what importing by identity exists to prevent.
   **Scoped to this one frozen template, NOT a carve-out for `rule-bypassable` elsewhere.**
   Rationale written at the declaration, echoed in `Features.md` §10 and case 10.61, and the
   coordination-doc entry now opens with the ruling rather than the request.
   **Verified with it: an admin is NOT stuck with the warning, and the guarantee is structural.**
   The constant is `Omit<WorkflowDef, 'id' | 'version'>` — it lacks exactly the two fields a real
   definition needs, so nothing can publish the object itself. Every live def is a copy with its own
   id and version (`cloneTemplate`; Plan 11's seed via `workflow.defined`), editable in the builder
   without touching the constant or the oracle.
3. ~~**Coordination doc line 216's false "Done" on Task 11**~~ — **CLOSED by T11's own commit
   (`9bf4cbe`)**, which supplies the component the line falsely claimed existed and rewrites the line
   to say so. The corrected line names its controls **before** the run and states which row of the
   inherited absence claim was stale. Nothing further is owed.

P25 taken (capped at `getBoard`). **P27 taken and applied** in step 12.

**P26 IS NOT "a number with no text" — that claim was already stale when written here, and it is
load-bearing for step 14.** P26 was written on 2026-09-02 into `controller-state.md`: **`SavedFilter`'s
field is `filterSpec`, and Plan 9 Task 13's `spec` is SUPERSEDED before it is written.** Step 14's
Task 13 adopts `filterSpec` and needs no ruling. The coordination doc carried the same stale claim in
two places and both are now corrected there — which is the fix that matters, because that document is
the one dispatched subagents read and this one is not.

## THE FIX-ROUND PATTERN IS NOT OCCASIONAL ON THIS BRANCH, IT IS THE NORM

**Three of Batch A's four fix rounds needed a SECOND commit to correct an error the fix itself
introduced**, and the titles say so in the authors' own words:

- `9154e67` — *"I fixed the false-present-tense comment I happened to be reading, then found the same
  defect in the file I had not opened — and my first correction to it was itself false"*
- `bdcb5a6` — *"withdraw the false 'unowned/unverified' claim on rule-bypassable"*, after `48c3655`
  had already tried to soften the same overclaim
- `460ebdc` — *"Second commit of the same fix round: the fragment my own edit left, and the one fact
  in it I had not measured"*, after `340192a`

Step 12 recorded six instances; this is three more in four tasks. **It is the argument for reviewing
a fix round rather than trusting it, and for never citing a fix round's own summary as evidence.**

## METHOD FOR THIS STEP — the cost ruling, applied

- **One fan-out for the plan**: the adaptation map, **one sonnet agent** (pre-flight is retired).
- **Per task: implementer → reviewer.** Fix round only on an Important or worse; scoped re-review
  only if the fix over-reached its scope. **HARD CAP 6 subagents per task.**
- **Final whole-branch review: ONE opus reviewer.** No lens bank, no refuters, no triage stage.
- **Fable is not dispatched, with no exception clause.** Sonnet is the default, opus the exception —
  except the four tasks priced opus above.
- **Batch on the plan's own seams**, with a handoff refresh at each boundary:
  **A: T1–T4** (pure core + gateway) · **B: T5–T8** (canvas → validation) ·
  **C: T9–T12** (publish → admin) · **D: T13–T15** (web wiring, smoke, catalogue).
- Expect escapes at the last gate that the removed machinery used to catch. **Record each instance
  in the coordination doc** for when the trade is next reviewed; do not re-open the trade.

## VERIFICATION RULES THAT BIND EVERY CLAIM IN THIS STEP

- **`grep` through this shell returns SILENT WRONG ANSWERS.** Measured at this base: `grep -c '^#'`
  on a markdown file that opens with `# Workflow Builder` returned **empty**, and
  `grep -n '^### Task'` on a file with fifteen such headings returned **nothing**. The same queries
  through `rtk proxy grep` returned 35 and all fifteen headings. **Every absence-shaped claim in
  this step must run through `rtk proxy` and print a positive control from the same run.**
- **The gate's per-package test counts are COLLAPSED by the proxy.** `pnpm turbo run build test
  typecheck` printed exactly one `Tests N passed` line (server) for a run reporting 24/24 successful.
  The exit code and task count survive; **the composition does not.** Use `rtk proxy pnpm turbo run
  …` when the per-package delta is the thing being claimed.
- **A cross-package mutation under bare `vitest` tests the stale `dist`.** The resolving property is
  **import style**: `../src/*.js` catches its mutation; `@gisik-nokma/domain` by package name
  resolves through `./dist`. Use `pnpm turbo run test` or rebuild explicitly — **and rebuild again
  after restoring**, or you leave a mutated dist for the next agent. Plan 8 imports
  `validateWorkflowDef` and `adviseWorkflowDef` from `@gisik-nokma/domain` **by package name in
  every task**, so this will come up constantly.
- **Every mutation kept should fail specifically enough to identify its own site.** A survivor with
  no explanation is either an unconstrained path or a mutation that never ran, and the second is the
  damaging one: it condemns a check that is fine.
- **"X appears nowhere" needs file-by-file enumeration or a second sweep, and every null prints a
  positive control from the same run.**
- **A TZ loop around a TZ-invariant function is a check that cannot fail wearing the costume of the
  rule that forbids them.** Before wrapping a TZ loop around anything, name the local-time accessor
  (`getDate`, `getHours`, `toLocaleString`, …) whose behaviour the loop is supposed to expose; if
  there isn't one, the loop proves nothing.
- **A partial-implementation marker enumerates the absences, not the partiality.**
- **The instinct to fix what you find is the one that hides compounds.** Anything outside a task's
  scope gets **recorded with a named owner**, not fixed — **and check the recorded owner still
  exists.** Step 12 twice assigned an owner to "Plan 6 Open question 13" after Plan 6 had closed.
- **Prose is not exempt from the falsifiability law, and it is the part no gate runs.** Across steps
  11 and 12, the large majority of review findings were against documents, not code.
- **Never run a state-changing git command in a shell whose cwd was set for a read.** Use `git -C`.
- Verify any file restoration with `git diff` or by reading the file — **never a shell `diff`**,
  which has returned a false "identical" on this machine, on this repo's own ledger.
