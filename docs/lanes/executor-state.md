# Serial executor — live state

**This file is the restart surface.** A controller that kills and relaunches the executor from its
brief recovers only what is written here. Refreshed at every task boundary.

> **Warning about shas in narrative prose.** Every sha cited in any *narrative* document in this
> repo — the dispatch brief, the Chain B handoff, the coordination doc's sections, the narrative
> parts of this file — is a fact about the moment it was written. Anchors in the table below were
> verified with `git branch --contains` (empty output = orphaned), never with `git cat-file`, which
> passes on reflog-only commits and hands you pre-rebase content while looking like it worked.

## Live anchors — 2026-08-31, rewritten after the step-4 recon was found WRONG

**The previous version of this file told a restarted executor to rebase `exec/04-auth-visibility` and
called it "the largest rebase left in the series." That instruction was live and wrong. Do not do it.**
The branch is **fully redundant**: all four of its commits are already on `main` under different shas,
and `git cherry -v origin/main origin/exec/04-auth-visibility` prints `-` (already upstream) for every
one of them. There is no rebase in step 4.

| Anchor | Value | How verified |
|---|---|---|
| Branch in flight | **`exec/05-api-realtime` @ `c3b1090`** — **REBASED ONTO `origin/main` 2026-09-01.** **STEP 9 (Plan 5) IN PROGRESS.** | `git log`, `git branch -r --contains` |
| `main` | **`00cb2e0`** — steps 7 and 8 BOTH MERGED (#57 → `dd7bfcf`, Chain B → `6cb631d` via **#59**, not #58), then the controller's docs-only **#60 → `00cb2e0`**. **REFETCH before trusting this** | `git log origin/main` |
| `exec/04-auth-visibility`, `exec/04-t4-t5-permissions` | **Both merged/redundant — safe to delete.** NOTE: `cherry` returns `+` for all 10 of `t4-t5`'s commits **even though #51 merged them**, because #51 was SQUASHED. Main's subject ends `(#51)` — that suffix is the marker | `git cherry -v`, `git log -1 --format=%s` |
| Node | **v22.22.2** under the brief's PATH export. Machine default is **v24.11.1**, outside `>=22 <23`, enforced by nothing | `node -v` |
| Orphaned, do not cite | `52520b0`, `72a7e3e`, `30e3db4`, every pre-squash sha of the Phase 0 branches, and **NEW 2026-09-01: `6d15e50`, `96a6ff3`, `400fbfc`, `95004e1`** — Plan 5 batch A's PRE-REBASE shas, killed by the rebase below. An earlier version of this very file cited all four as live. | `git branch --contains`, empty = orphaned |

## THE RULE THIS COST US, and it generalises to every remaining rebase

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

**STEPS 7 AND 8 ARE MERGED.** `main` = **`00cb2e0`**. **RULING P23 IS SETTLED — see below.**

**STEP 9 (Plan 5, the hinge, 17 tasks) IS IN PROGRESS on `exec/05-api-realtime`.**
**BATCH A ONLY IS DONE: T1 and T2, plus T2's fix round. T3 ONWARD IS NOT STARTED.**

Gate **re-run at the post-rebase sha `c3b1090`**, not carried over from the pre-rebase run:
**exit 0 READ (not inferred), 21/21 (0 cached), 1321 tests**, zero `Unsupported engine` WARNs,
**Node v22.22.2**. domain 314 · rule-engine 280 · **server 486** · app-core 130 · editor 72 · ui 31 ·
sync-client 8. (Sum checks: 314+280+486+130+72+31+8 = 1321.) The rebase moved only docs, so composition
could not have shifted — but it was measured rather than argued, because *docs-only* was itself a claim.

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

**Gate re-run by the executor rather than taken from any agent's report:** exit 0, 21/21, **0 cached**,
**1456 tests** — domain 320 · rule-engine 280 · **server 615** · app-core 130 · editor 72 · ui 31 ·
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

**NEXT: Plan 5 Task 10** — `GET /v1/search`, cross-project and visibility-filtered, plan line 3638.
**`makeRequireSession` is still wrong at plan lines 3774, 4009, 4369, 4865 and 5915 — five sites left,
none marked.**

Then T11 · T9 (2657) · **T9b (3183, FLOOR-LIST)** · T10 (3638) · T11 (3874) · T12 (4079) ·
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
