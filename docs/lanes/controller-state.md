# Cross-lane controller — live state

**This file is the controller's restart surface.** A controller relaunched from
`gisik-nokma-lanes/dispatch-controller-serial.md` recovers only what is written here. Refreshed at every
decision boundary. *(The brief was renamed 2026-09-01: `dispatch-main-controller.md` is the dead
parallel-wave one. The "READ FIRST" section below still applies to anyone holding the old file.)*

> **Shas in narrative prose below are facts about when they were written.** Verify anchors with
> `git branch --contains` — empty output means orphaned. `git cat-file` passes on reflog-only commits and
> will lie. This file lives on `main` deliberately: an earlier handoff was tracked, pushed, and stranded on
> a branch that had already merged, so a restart read a copy 70 lines out of date. **Once the branch
> carrying a handoff merges, the next update branches off `main`.**

## ⏩ CONTROLLER RESUMED 2026-09-06 02:10 IST IN A FRESH CONTEXT (Fable, session name unchanged `gisik-nokma-0d`) — LIVE STATE, re-measured at `c017cdf`

**This block supersedes the "CLEARED ITSELF" block below it; that one's per-lane table is history now.** The
`/clear` worked exactly as designed: the fresh context read this file top-down, then every lane's handoff
from its OWN branch, then measured. Nothing was adopted from prose. **Session model is Fable (owner-set);
the brief's Sonnet gating does not apply; rulings are taken in-session.**

### Anchors — re-measured 2026-09-06 ~02:30 IST

| what | value |
|---|---|
| `main` | **`b4e2f14`** — thirty-three merges this context; since `e0c8294`: #157 (lock v3.2) · **#150** (Lane A, the HELD pair under P38, `b4e2f14`, eleven jobs green at `063f6af` — **P25 clause 1 is DISCHARGED: every `owner: 'P25 clause 1 — HELD'` absence in `mappers.ts` is served or catalogued**; `getMyWorkspaces` closes completely, `getMyWork` still refuses on three fields, all now assigned under P39). Every `gh pr merge` exit read from `$?` on its own line |
| ledger | **`CHECK_EXIT=0` · 166/177 (93.8%)** · claimed 0 · in-flight 0 · todo 11 · Plan 10 **17/18** (T18 held) · Plan 11 **7/16** (T7–T10, T14, T15 done; T1–T5/A0 on Lane E's branch unmerged; T11/T12 C in flight; T13/T16 E) |
| last forced gate | **`b4e2f14`** — ONE backgrounded invocation under **lock v3.2** (acquired 08:33:28 fifteen seconds after Lane B's gate released, released clean), install 0, rebuild 0, **`check:env` 0**, `--force --concurrency=1`: **`GATE_EXIT=0` · 30/30 · 0 cached · 1m35.0s · node v22.22.2** · zero `Unsupported engine` · **3364 tests / 260 files** — server **1083** (+25: T9/T10's seed runners and the HELD pair's route cases), app-core 1092, sync-client 67, the rest unchanged. Covers #154 and #150 together. *(Previous: `c8268e1` 3340.)* |
| open PRs | **#161** (Lane B closure 5b under P37/P37.1, `89b29ca`, 28 commits / 30 files, gate 30/30 · 0 cached · **3385 tests / 263 files** (server 1090, sync-client 80) · check-case-ids self-test fired, 1324 unique ids, union = sum; **HELD for its Fable branch review — merge on B's confirmation, then restart B onto T18, override staged as `override-laneB-next.md`**). In flight: Lane A `getMyWork`'s residuals under P39/P40 (`exec/31-mywork-residuals`); Lane C T11+T12; Lane D the two retention sweeps (rebased to `c86c4b5`, minting §6 from 6.143); Lane E seam 1 (T4 next). |
| watch | **re-armed as a `Monitor` task** (this session's `ctl-watch.sh`, 120 s poll: `origin/main`, open-PR set with head+mergeable, per-PR check-run state, pane set; sentinel-initialised so the zero→one PR transition IS reported). It is a child of this session and dies with it — re-arm at every relaunch |
| machine | swap **3.8 GB of 5 GB used at 02:08, 3.6 at 02:26**, ~76 MB free pages — five lanes plus their fan-outs. The gate lock keeps pools at one at a time; nothing crashed. Not a blocker; watch it |
| watchdogs | `launchctl list`: limit-resumer, net-resumer, idle-nudger all present (the nudger still does not submit — memory file) |

### The five lanes NOW — verify with `gh pr view` / `git log origin/<branch>`, do not adopt

| lane | session | branch | doing | controller's next action |
|---|---|---|---|---|
| **A** | `gisik-nokma-exec-06` (opus, ctx ~35%) | `exec/19-serving-gaps` merged as #125; **#128** on `exec/24-stream-frames`; `exec/25-snapshot-provenance` holds closure 4's escalation at `144ac55` | queue, in order: **closure 2b** (P34 items 1–2) → **closure 4 under P36** → C2's proper close (a cursor on `TicketListView`) → **HELD pair under P32** (guest-exclusion fixture is the whole test) → the mapper-vs-real-`/v1`-body contract test (devDep lands with #126 / E's T5) | merge #128 at the re-gated sha after CI green; merge each closure PR on arrival; promote nothing (closures are not ledger rows) |
| **B** | `lane2-plan4-e5` (opus, ctx ~51%) | `exec/20-plan10-t13-t15`, **#126** | T14 rig done + catalogued; **T15 scenarios in flight** (Fable author running; P35 applied by the lane on its return); T18 HELD until #126 and #128 have merged AND Lane A's §12 writes are in | tell it every `main` move that touches `Features.md`/`test-cases/12`; merge #126 at the re-gated sha; **promote 10/14** then; T15 PR → promote 10/15; then release T18 |
| **C** | `lane3-plan7-8-b6` → **RELAUNCHED 02:25** (sonnet, fresh) | new branch `exec/24-plan11-ci-deploy` (from `c017cdf`) | **Plan 11 T14** (extend `ci.yml`: wire `check:tasks`, postgres client + loud-skip guard, e2e job visibly skipped until T13's compose) → **T15** (`deploy/do/` spec FILE, env block from `.env.example` not the plan, two root-manifest lines pre-announced to E) | merge each PR on arrival after reading the Actions JOB STEPS, not the conclusion; **promote 11/14, 11/15**; then re-task (candidates: T9/T10 script lines if E frees the manifest) |
| **D** | `lane4-periphery-e5` → **RELAUNCHED 02:24** (sonnet, fresh) | new branch `exec/25-plan11-seed` (from `dca435d`+) | **Plan 11 T7 + T8** (seed plumbing + Convenience Corner mapping — new files only, reads frozen `reference/`; opus impl+review for T8) | merge on arrival; **promote 11/7, 11/8**; then decide T9/T10's manifest routing WITH Lane E before dispatching them |
| **E** | `lane5-plan11-1d` (opus) | `exec/23-plan11`, 13 commits, gate green at `a30496f` (24/24, 3183 tests, `check:env` 0) | seam 1: A0 ✓ `.nvmrc`/`engine-strict` ✓ T5 ✓ 25 MiB timeout ✓ → **T1 in flight** → T2 → T3 → T4 → shutdown path → T6 (port 54330) | merge seam-1 PR on arrival (`check:env` on its own line; **`engine-strict` lands for every lane** — under node 24 pnpm exits 1 SILENTLY); promote its T-rows; then seam 2 (T11/T12 stay E's) and seam 3 (T13, T16) |

**Lane E's file map, adopted verbatim as the re-task basis (2026-09-06):** T7+T8 create only new files
(`apps/server/src/seed/*`, `test/seed/*`) · T14 is one file · T15 is a new directory **plus two root
edits** (a `package.json` script and `pg` at root for `check:db-tz`) that collide with the manifest owner ·
T9/T10, T11/T12 and T15 **all collide on a manifest — never two of those three at once** ·
`apps/server/package.json` is **Lane E's for all lanes** (B's two devDeps are already in E's T5) · T13
needs T6's compose AND T9's seed AND `pnpm-workspace.yaml` — E keeps it (zero of fifteen pinned
`data-testid`s exist; `getMyWorkspaces` refuses so the plan's navigation click cannot land) · T16 held.

### RULING P35 (2026-09-06, controller as ruling tier; AMENDED the same hour) — Plan 10 T15's scenario S4 is written against the SHIPPED rule, and the absent purge is a RECORD, not an assertion

Lane B found that Task 15's S4 expects a `purge` on `visibility.set`. **No such purge exists**: the per-event
walk was DELETED under P23's disposition; the under-purge residual is accepted and disclosed (6.101/6.104).
The rig reproduces the server correctly; the SCENARIO is the plan defect. **S4 asserts:** (b) after
visibility narrows, B receives **no further events** for the ticket — the excluding half and the whole
point, because continued delivery after narrowing is a disclosure; Lane B mutates the server's visibility
gate to permit (locally, inside one locked run, restored with `git checkout HEAD -- <path>` — name the
ref) and reports that (b) reddens ALONE; (c) re-widening re-delivers the full pre-cursor history and B's
replica converges, `projTicket` equality included. **(a) — "no purge arrives" — is RECORDED at the case
and in the docblock, cross-citing 6.104 and P23, and NOT asserted.** First issued as an assertion; Lane B
stopped and showed that **case 6.104 on `main` explicitly declines to pin it** (*"a test asserting 'no
purge arrives' would harden the wrong half of a gap this branch wants closed rather than preserved"*),
owner Plan 10. A ruling applies existing rules; it does not override a landed case by accident, and a
self-expiring assertion (P25 clause 3's shape) is a precedent for REFUSALS that go red when a route starts
serving, not for pinning a behaviour a case chose not to pin. Specific beats general. **Adopted from Lane
B's reading, to be written AT 6.104:** S4(c) is the first executable evidence for 6.104's MIRROR half
(backfill on newly GRANTED visibility) and partially discharges it. **6.104's purge half** — the WS
catch-up/purge protocol, closing the residual without recreating P23's disclosure — **stays open with Plan
10 and no task**; carried for a ruling when Lane A reaches that surface (same surface as closure 4).

### RULING P36 (2026-09-06, controller as ruling tier) — closure 4: the snapshot carries the RECORDED provenance; option 3 is refused in writing

**Found by Lane B's T14 rig, measured not inferred:** after a snapshot pass a fresh client cannot read the
snapshotted ticket through `ds.query.getTicket` — `ReplicaGapError` on `stateProvenance`, because
`replica-data-source.ts` requires a `ticket.created`/`ticket.transitioned` in local events and a
snapshot-bounded bootstrap ships neither below the line. `replica.getTicket` answers; only the DataSource
door refuses. **Lane A escalated before building (correctly — a new data contract is P25's "new rule"
class):** `TicketState.transitions[]` carries `{toStateId, actorId, seq, workflowId, workflowVersion}` —
the ACTOR and not the CLOCK — and `ClaimProvenance` REQUIRES `serverTime`. Three candidates, non-equivalent:
(1) widen the snapshot to carry the claim's recorded instant; (2) let the door report provenance absent for
snapshot-bounded reads; (3) synthesise a time from a neighbouring event — **refused: that is exactly the
move refused on `ContestedClaim.claim.serverTime`, and it is the one that would pass a gate.**
**RULING: option 1.** The instant EXISTS — the ledger row at `transitions[last].seq` carries `serverTime`
and the writer folds that very row — so copying it is not fabrication; the distinction from the
contested-claim hold is that THERE no row ever recorded the instant. Option 2 rejected because a fresh
device is snapshot-bounded for nearly every ticket, making "absent" the product's normal answer.
**Constraints:** (a) the writer READS `serverTime` from the event row at that seq — copied, never
computed; the excluding fixture asserts a snapshot-bounded client's `stateProvenance.serverTime` EQUALS
the ledger row's, and a writer mutated to copy the adjacent event's time must redden it alone (that
mutation IS option 3); (b) additive to the bootstrap payload — the rig's existing cases stay green
unchanged; (c) prefer a sibling provenance block on the snapshot row over widening `TicketState.transitions[]`
(the reducer's output; a PENDING transition has no `serverTime`, so widening reintroduces a null case for
a different reason and touches Lane B's full-`TicketState`-equality rig) — widen only with a measurement
that the sibling block cannot serve the door without duplicating fold logic, stated as a deviation;
(d) every provenance-bearing field the door serves gets the same treatment in the same PR, or its
snapshot-bounded refusal is a named ❌ case with P36 as owner (`assignedProvenance` to be measured);
(e) P30 holds; the door serves anything the replica serves. Files: `snapshot-writer.ts`, the bootstrap
payload in `sync-routes.ts`, `replica.ts`, `replica-data-source.ts` — none are B's or E's. Fable review at
branch level (sync surface). Lane B carries a ❌ case for the door meanwhile and asserts through
`replica.getTicket`; no red test on `main`, no skipped scenario.

**P36 AMENDED 03:00 (Lane A's read-only prep, adopted verbatim): the provenance block must be CARRIED
FORWARD, or a re-snapshot silently drops it.** `writeSnapshotsForWorkspace` folds from `previous.state` and
reads only the TAIL past the previous seq; closure 1's invalidation pass re-states head state under the new
vocabulary with an EMPTY tail (`seq === previousSeq` is its ordinary case, per the writer's own docblock), so a
writer that captures provenance only from events it folds would write a NULL block over a good one and the
door would refuse again on tickets it had just fixed — **latent on a fresh device, visible only after a
workflow publish (the P14 shape).** Rule: capture from the tail when the tail carries a state claim, otherwise
carry the previous snapshot's block forward unchanged — carrying forward is copying the same recorded instant
one more hop. **`snapshot-store.ts` joins the file list** (`readLatestSnapshot` selects `seq, state` only
today; the `Snapshot` type changes). **The excluding fixture gets a second half:** snapshot a ticket, run the
invalidation pass with an empty tail, assert the provenance survives; mutating the carry-forward to write null
must redden it alone. Both halves are built.

### RULING P37 (2026-09-06, controller as ruling tier) — case 12.274 and 6.104's purge half are CLOSURE 5, owner Lane B: backfill-on-grant, and a CLIENT-PRESENTED purge

**Found by Lane B against its own PR, after a Fable review's Critical it reproduced before accepting.**
The lane had reported that T15's S4(c) "partially discharges" 6.104's newly-GRANTED backfill half. **False**,
and retracted in place: **there is no backfill-on-grant anywhere in the product** (`visible-events-for.ts`
says so — "Plan 10's job, on top of this primitive"). S4's re-widening re-delivered the history ONLY because
that scenario's workspace was silent between the narrow and the widen, so B's cursor never advanced past
them. The lane's own probe with ONE unrelated visible commit in between — the ordinary shape —
`C1PROBE {cursorAfterNarrow:4, cursorAfterOther:7, head:8, bCount:2, aCount:4, replicasEqual:false}`:
**B holds two events where the server holds four, never receives the narrowing or the contest, and the
divergence is permanent — no purge, no backfill, no resync path.** Recorded as **12.274, 🚫, owner Plan 10,
no task** — recorded and not asserted, for 6.104's own reason. *A degenerate fixture excusing the server from
existing — this series' signature failure — committed and then caught by the lane that had just written that
sentence into three commit messages.* The 6.104 amendment is withdrawn and left visible as withdrawn.

**The owner's instruction answers the "task-wanting question": it gets BUILT.** Two defects, siblings across
one gap — **6.104 is the stale copy nobody takes away; 12.274 is the fresh copy nobody gives back.**
**OWNER: Lane B, as closure 5, after #126 merged and before T18** — it holds the rig that reproduces both
halves and the harness is the test bed; Lane A's queue already carries closure 2b/4, C2, the HELD pair and
the contract test, none of which touch `visible-events-for.ts`. **Constraints, not a design:**
1. **GRANT side:** the trigger is the visibility event ITSELF, never a reconstructed prior audience
   (6.82/6.94 stand). Deliver the ticket's full history (or a per-ticket snapshot in the bootstrap's own
   shape) to every viewer in the NEW audience, cursor notwithstanding; over-delivery to a viewer who already
   held it is acceptable **iff replay is idempotent — measured, not assumed.** Excluding fixture: a viewer NOT
   in the new audience receives nothing; mutate the audience check to permit → red, alone.
2. **NARROW side is CLIENT-PRESENTED:** the server never initiates a purge for an entity a device may never
   have held — P23 is not reopened. The client names the ids it holds (on catch-up or a reconcile door); the
   server answers ONLY about ids the client named, "no longer yours" in the `{kind:'restricted', id}`
   register. Excluding fixtures: the answer never contains an id the client did not present (mutate to
   enumerate → red); a client presenting an id it never held learns nothing beyond "not yours". **This
   resolves "cannot distinguish lost from never-had" in the SAFE direction: the client's own holding IS the
   relationship** 6.101's ruling named as the missing axis. (Lane B's restatement, adopted.)
3. The 12.274 probe becomes the GREEN case (`replicasEqual: true`); 6.104's residual flips 🚫 → ✅ only when a
   narrowed ticket is actually removed from B by the client-presented path.
4. P30 holds; closure 1 and P36's provenance block are untouched; a NEW visibility rule escalates before
   building. **Collision:** Lane A's closure 4 touches `sync-routes.ts`'s bootstrap payload; closure 5
   touches the catch-up path and the reconcile door — file lists exchanged before either starts; whoever
   lands second rebases. Lane B's cases from **12.275** inside its block.

**Also from #126's review, kept because each generalises:** the P35(b) mutation (visibility gate forced to
permit) reddened S4 **and S5** — S5 depends on the same gate for the child's `claim.contested` reaching
nobody; a mutation proving two scenarios, not a failure to isolate. S5's prose "both cursors sit permanently
at `head − 1`" was false (what is permanent is the NON-delivery; the next visible envelope carries both
cursors past the invisible row) — the assertion was right, the sentence was not, corrected and left visible.
S4's control was a wall-clock race (`not.toEqual` on a whole contest object whose only differing field is
`contestedAt`) — failed safe, now compares the field. **And a refuted tooling scare:** the T15 author reported
the hook-rewritten `tsc` returns a FALSE GREEN; Lane B planted a TS2322 and both paths exit 2 naming it — the
author had compared a fresh-dist run against a stale-`packages/domain/dist` run. **The typechecker does not
lie; stale dist does. Not broadcast, because it was checked first.**

### §12 CASE-ID BLOCKS — allocated 2026-09-06 02:20, the only source of truth until the header says otherwise

**Lane D 12.224–12.227 (landed)** · **Lane C 12.228–12.239 (12.228–12.229 landed)** · **Lane A 12.240–12.259** (12.240–12.243 landed with #137) · **Lane B 12.260–12.289 (EXHAUSTED at #139: T14 260–266, T15 267–274, closure 5 275–289)** · **Lane B 12.290–12.319 (allocated 03:30 for closure 5b)** · **next block 12.320, controller-allocated on request only.** Lane B's recount at #139: 215 ids, max 12.289, zero duplicates.
**Lane A 12.240–12.259** (its former "240+" is now BOUNDED) · **Lane B 12.260–12.289** (T14's seven =
12.260–12.266 on #126; T15 from 12.267) · **next block 12.290, controller-allocated on request only.**
The header line in `test-cases/12` (Lane B rewrote it on #126) carries the four blocks and no derivable
next-free id; every lane recounts the MAXIMUM against `origin/main` at rebase as the control and never
mints from it. Lane B measured at allocation time: 181 ids, max 12.229, zero duplicates; after its
catalogue commit 186, max 12.266, zero duplicates.

### §6 CASE-ID BLOCKS — allocated 2026-09-06 08:40, after the same collision nearly happened a THIRD time

Lane D reported minting `user_preferences` cases "from 6.138, §6 max 6.137 before this round" — measured
against its branch base `de88248`, twenty minutes after Lane A's #150 (the HELD pair) had landed **6.138–6.142**
on `main`. Caught from the message, before the commit. **Blocks: Lane D 6.143–6.159** (the two retention
sweeps) · **Lane B 6.160–6.179** (closure 5b's 6.102 guest side) · **Lane A 6.180+ on request** (6.138–6.142
landed) · next block on request. Whoever touches §6's header first carries the blocks; one header.
**The rule, third statement:** a fork point is a fact about a moment; mint against `origin/main` at the
moment of minting, with `scripts/check-case-ids.mjs` as the control — and any section three lanes write
gets blocks BEFORE the second lane starts, not after the first collision.

### §13 CASE-ID BLOCKS — allocated 2026-09-06 03:10, after the §12 collision recurred one file over

Lane C's #134 (Plan 11 T14) CREATED `test-cases/13-deployment-dogfooding.md` and minted **13.1–13.6**;
Lane D had independently minted **13.1–13.36** for T7/T8, uncommitted. Caught by reading both branches
before either landed — the check the §12 rule already prescribes. **BLOCKS: Lane C 13.1–13.40** (T14 =
13.1–13.6 as pushed; T15 continues inside) · **Lane D 13.41–13.100** (T7/T8 renumbered by enumeration to
13.41–13.76; T9/T10 continue inside) · **Lane E 13.101–13.200** (seam 1, T11/T12, T13; T16's final shape
re-states the header) · **next block 13.201, controller-allocated on request only.** The header line in
`test-cases/13` carries the four blocks and no derivable next-free id (Lane C adds it in its #134 amendment;
whoever lands first carries it). **Rule restated for every section a lane opens: the FIRST PR that creates
a `test-cases/NN` file carries an allocation header, because two lanes minting from "13.1" is not a
collision anyone can see until rebase.**

**Lane session names rotated with the relaunches** — `ListAgents` is the source; these are for the reader:
A `gisik-nokma-exec-06` · B `lane2-plan4-83` · C `lane3-plan7-8-3b` · D `lane4-periphery-9d` (after its
03:24 restart) · E `lane5-plan11-1d`. A `SendMessage` to a dead name fails loudly with the live suggestion; not a trap, noted.

**#134 (Lane C, T14) at `e78212b` — HELD for an amendment before merge:** Plan 11 T14's `Files:` block
declares `Modify: root package.json (scripts test:fixtures, test:dual-client)` and the PR does not touch
root `package.json`; the lane lands the two lines (announced to Lane E, the manifest owner) or names the
omission and what runs the dual-client suite instead (the sharded `server-tests` job). Its own new
8-job workflow is the CI that counts, read by JOB STEPS: `scope`, `check-tasks` (wired for the first
time), `e2e` (detect-only until T13) green; `check-env` green (with the new `.skipIf(`-coverage
trip-wire); `build` → `typecheck` / `server-tests` (4 shards, `postgresql-client-16` pinned with a
version check, `check-no-silent-skips.mjs`) / `other-tests` pending at this writing.

### Re-task 07:50 — Lane C takes Plan 11 **T11 + T12** (backups, restore drill) after #146; Lane E's queue is seam 1 → T13 → T16

Lane E's file map named T11/T12 hand-off-able (`apps/server/src/ops/*`, `scripts/restore.sh`, tests,
manifest script lines, `object-store.ts`); E measured before releasing them that nothing of its own sits
under `src/ops/` or touches `object-store.ts` (positive control: its `src/http/` query returned 2 commits).
C's override carries E's seven pre-flight findings verbatim — the object-store key regex that refuses both
of T11's formats (a security control with a planted-defect test; **if widened, `..` must stay
unrepresentable and the test must assert it**), `pg_dump` keg-only at 18.4 against a 16.15 server (the
ARCHIVE version is what `pg_restore` must read), the two acceptance assertions that cannot fail for the
reason their names imply, `restore.sh` never executed by any test, `verifyProjections` at `src/tools/`,
the alerter that T3 will export as **`ErrorAlerter` / `alerterFromConfig`** (C injects a local shape with
those names and swaps on rebase — never a second `src/alerts/`), scratch databases only. Manifest script
lines: C announces to E and D before pushing; keep both. Lane sessions after the 07:3x restarts:
C `lane3-plan7-8-13`, B (restarted 07:38, name per `ListAgents`).

### Re-task 08:25 — Lane D takes the two RETENTION errands after #154; Lane C takes the two SCHEDULER errands after T11/T12; the verifier's DDL decision is NOT discharged by T15

Lane E's split of P33's four seam-2/3 errands is by whether the errand needs the SCHEDULER Lane C is
building in `src/ops/schedule.ts` for T11: **C** — `ops:sweep-orphans` (monthly, 30-day, only objects no
ledger event ever named; coordination:310/:1115; reads the object store C already touches) and scheduling
the notification-sweep CLI (`tools/sweep-notifications.ts:8`); both fold into the SAME scheduler, as a
follow-up PR after T11/T12 to keep that review's scope honest. **D** — the `invite_tokens` sweep (6.131)
and `user_preferences` retention for revoked members (coordination:5495-5502): data-retention sweeps in
`apps/server/src/tools/`, invoked by whatever scheduler exists, cases in **§6** (D's §13 block is exhausted
at 13.100 by #154), membership read through `resolveEffectiveRole` (P22), dry-run flag, never
`object-store.ts` (C's). D's override is staged for its restart at #154's merge. **Still open, with T16 as
a written decision (Lane E measured `deploy/do/` on `main`: every "verif" hit is `sslmode=verify-full`;
`DDL`/`DROP SCHEMA`/`scratch` appear zero times, positive control `DATABASE_URL` ×4):** coordination:1607-1611's
requirement that `deploy/do/` carry either a DDL-capable credential for the projection verifier or an
explicit recorded decision that it runs only against restore scratch DBs. **Lane E's T3 committed at
`b5ec53a`** (two more guards-that-could-not-fire found by its reviewer, repaired with positive controls).

### ⚠ THE CONTROLLER'S OWN CONTROL FIXTURE HELD THE LOCK (08:28–08:31) — a control never launches the instrument it is testing

To positive-control the v3.2 peers matcher this controller copied its gate script to `/tmp/gate77.sh` and
launched it with a made-up flag. **The script has no dry-run flag: it took `--dry-run-never-runs` as its
log label, acquired the lock for real, and ran a real gate on the primary worktree**, orphaned at `ppid=1`
the moment the tool shell returned and outliving its own deleted script file (bash keeps the fd). Under
v3's rules — the only ordinary reclaim is a DEAD pid — **no lane could reclaim it by protocol**, and every
gate on the machine would have queued behind it. **Found by Lane A** while measuring the peers term
(`ps -p 8994` alive, `ppid=1`, no vitest pools, script file gone), reported rather than killed — correctly,
because killing another session's process is exactly what the standing rule forbids. The controller killed
its own process; the EXIT trap released the lock; **Lane B's waiting gate acquired it within one poll**
(pid 9775, a legitimate 10-worker pool under B's session, zero orphans). Three minutes lost, no
collision. **Rules:** (1) **a control never launches the instrument it is testing** — a control for a
process matcher runs the matcher against a process that only LOOKS like the instrument (a shell named
`gate*.sh` that sleeps), never a copy of the instrument itself; (2) *the instrument becoming the fault* is
now the lock's fourth defect class in one night (the inline form, the empty-pid reclaim, the line-count
idle check, and this) — every one caught by a lane measuring rather than reading; (3) Lane A's residual
stands with no protocol answer: v3 has no rule for a LIVE pid that is not a gate ("alive" is doing more
work than it can carry), and every argv-based test of "is this a gate" has produced a defect today, so it
stays a human rule — **a live holder you do not recognise is a message to the controller, never a kill.**
Also from Lane A's measurement: the peers count over-counts a shell TREE (E's `locked-test.sh` counted
twice — its zsh wrapper and its bash child both match) — **never read it as "how many gates"**; it is a
zero-or-not signal.

### ⛔ THE 06:40 SESSION-LIMIT WINDOW TOOK EVERY LANE AND THIS CONTROLLER DOWN FOR ~3.5 HOURS (03:5x → ~07:20 IST)

Every lane's five-hour session meter read 80% at 03:25; by ~03:50 subagents were dying with `You've hit
your session limit · resets 6:40am (Asia/Calcutta)` (HTTP 429): **Lane A's Fable review of #141** (8
minutes, zero findings — replaced by an opus reviewer, accepted as the verdict); **Lane D's whole T9/T10
workflow** (four agents, ~13 min, 212K subagent tokens, zero output — relaunched via `resumeFromRunId`
after the reset, nothing cached to reuse); **Lane E's T2 fix round** (the lane finished it by hand). This
controller's last event was at 03:55 and its next at 07:29; the lanes' meters then read **6%, resets
12:20pm**. **What held:** every ruling was on `main` before the window (P35–P38, P37.1 — #142 merged 03:48),
every lane's handoff was on its branch, and the monitor and gate lock came back with the sessions. **What
it cost:** #134 sat fully green for three hours; C idled from 03:44. **Rule:** when the meters pass ~80%,
merge what is green and write the restart surface BEFORE dispatching anything Fable-tier; a Fable review
that dies on a limit returns nothing and looks like a review that found nothing.

**Closure 5b(d) — measured before the restart (Lane B):** the ruling assumed one missing artefact; there
are three, and the third would have cost a round. (i) **`Replica.loadBootstrap` is the replica's only
bootstrap door and it unconditionally sets `cursor:<workspace>` to the server's head** — pulling one ticket
through it would SKIP every intervening event for every other ticket and present as convergence in a
quiet fixture; a per-ticket door that does not touch the cursor comes FIRST, with the no-cursor-movement
excluding fixture and per-ticket rollback (`loadBootstrap` rolls the whole response back on a fold
failure). (ii) `bootstrapTicket` is PRIVATE to `sync-routes.ts` — the reason the rig restates it. (iii) no
per-ticket route exists (`/v1/sync`, `/v1/sync/bootstrap`, `/v1/sync/reconcile` is the whole surface).
Shape of the ruling unchanged.

### RULING P37.1 (2026-09-06 03:50, controller as ruling tier) — the push-shaped grant backfill WEDGES; disclosed and capped now, made pull-shaped and client-presented under closure 5b(d)

**Found by #139's Fable branch review (8 raised, 6 survived refutation, one Important), traced link by link
and refused refutation.** Before closure 5, every envelope the hub sent advanced a cursor; a backfill
inverts that by construction — **every backfilled envelope is `≤ afterSeq`, so none moves any cursor, and
the only one that does (the trigger) is yielded after the whole subtree's history.** `hub.ts` closes with
1013 `slow-consumer` at `bufferedAmount > 1 MB` and detaches; no `caught-up` is sent; the engine persists
its cursor only in `onCaughtUp`; app-core's `lastSeq = Math.max(...)` cannot move on envelopes below its
own `afterSeq`; `needsBootstrap` refuses to re-bootstrap over a local baseline. **The client reconnects at
the same cursor, receives the identical burst, is closed again — permanently and silently.** Independently:
the per-trigger unit is the full pre-cursor history of an inheriting subtree read with `afterSeq = 0`, and
`check-permission.ts` does not refuse a `visibility.set` that sets the mode a ticket already has, so a
member can make the server re-walk and re-stream the subtree to every subscriber per commit. (The verifier
did not MEASURE buffer growth; the amplification half does not depend on that.) **The cheap fix is unsafe
and Lane B checked before proposing it:** yielding the trigger first makes `refoldTicket` replay a
`ticket.reparented` for a client with no `ticket.created`, and `applyTicketEvent` throws — the engine's
terminal stall.
**RULING: Lane B's recommendation.** In #139 now: **(2) disclose** — the wedge is its own ❌ case with the
mechanism in the line and owner closure 5b; **(1) cap the candidate walk** with a documented maximum and a
truncation case; the trigger stays AFTER the burst. **Closure 5b gains (d), the real fix without the
per-subscriber server state `visibleEventsFor` deliberately lacks: the grant side becomes PULL-SHAPED and
CLIENT-PRESENTED, the narrow side's own principle.** The hub pushes only the trigger plus the ids it newly
admits (a bounded notice); the client pulls each ticket it does not hold through a per-ticket bootstrap door
(the rig's `bootstrapTicket` restates one; if no route exists it is (d)'s first artefact) BEFORE applying
the trigger, persisting as it goes. A cut-short session resumes by pulling what it lacks; a repeated no-op
`visibility.set` costs a holding client nothing (the amplifier is bounded by holdings, not by trust in
`check-permission`); the refold hazard closes by *bootstrap-before-apply on any event for an entity not
held* — the rule a replica needs for `ReplicaGapError` anyway. Excluding fixtures carry over; the wedge
case flips to ✅ only when a slow-consumer close mid-pull is followed by convergence on reconnect.
**Also from the review, kept:** 12.277's positive control was VACUOUS — `toContain(ticket)` passed because
the narrowing event itself carries the ticket id, so it would have passed against an empty
`grantBackfillFor`; now asserted by pre-cursor event id. A check passing for a reason unrelated to the
property it names, in the case written to demonstrate that discipline.

### ⛔ GATE LOCK v3 (2026-09-06 08:15) — the directory form's empty-pid reclaim ROBBED A LIVE HOLDER; the lock is now a FILE created and filled in one atomic open(O_EXCL). Supersedes every lock snippet below this line.

**Found by Lane D, diagnosed by Lane E, both measuring rather than arguing.** D's gate ran with a bare
`mkdir /tmp/gisik-gate.lock` and **never wrote a pid file** (its script had no `echo $$ > pid`); E's
`locked-test.sh` had three acquisition paths — `mkdir` succeeds; pid dead (`ps -p` fails) → reclaim; and
**pid file EMPTY for 60 s → reclaim, with no `ps -p` anywhere in it** — and the third fired on exactly
D's shape, deleting a live holder's lock while its gate ran. No collision resulted this time (D's gate
finished first). **Both lanes were following the protocol as written in this file** — the "reclaim an
empty-pid lock after 60 s, loudly" refinement adopted 01:20 — which makes the protocol the defect: **a
holder with no pid is indistinguishable from a corpse, and *a lock protocol shared by scripts that differ
is not one protocol* (Lane E).** E had written the residual risk into its own state file two hours before
it happened: *"empty pid ⇒ dead holder is an inference, not a measurement."* Predicting a failure is not
preventing it. The emptiness window between `mkdir` and `echo` is the entire attack surface, so v3 removes
it: `set -o noclobber; echo $$ > /tmp/gisik-gate.lock` creates and fills the lock in ONE atomic operation.

```
LOCK=/tmp/gisik-gate.lock; empty_wait=0
until ( set -o noclobber; echo $$ > "$LOCK" ) 2>/dev/null; do
  if [ -f "$LOCK" ]; then
    p=$(cat "$LOCK" 2>/dev/null)
    if [ -n "$p" ]; then
      if ! ps -p "$p" >/dev/null 2>&1; then echo "RECLAIMING stale lock: holder $p dead"; rm -f "$LOCK"; fi
    else
      empty_wait=$((empty_wait+15))
      if [ "$empty_wait" -ge 600 ] && [ "$(ps -eo comm= | grep -c '^node (vitest')" -eq 0 ] && [ "$(pgrep -fl 'gate.sh|locked-test.sh' | grep -vc "^$$ ")" -eq 0 ]; then echo "RECLAIMING empty lock after 10 min, machine idle"; rm -f "$LOCK"; empty_wait=0; fi
    fi
  fi
  sleep 15
done
trap 'rm -f "$LOCK"' EXIT
# then the drain-wait on live vitest pools (unchanged), then the run — ONE backgrounded invocation.
```
**v3.1 (08:25) — the idle check's `pgrep -fl … | grep -vc` line in v3 was DEFECTIVE and is replaced.**
Lane E measured it before adopting: `pgrep -fl` emits one line per argv LINE, and a claude session's argv is
its whole multi-line brief — **371 lines for 1 process** — so once any brief or relayed message quotes a
script name (v3's own text did), the count never reaches 0, the empty-file reclaim can never fire, and a
genuinely orphaned lock wedges all five lanes forever. `pgrep -f vitest`'s class, one turn later. The
peers term is now a PROCESS count requiring the executable to be a shell, excluding self AND the parent
shell (the tool's own shell carries the command text in its argv; measured here: idle reads 0 only with
both excluded):
```
peers=$(ps -eo pid=,comm=,args= | awk -v self=$$ -v parent=$PPID '{ c=$2; sub(/.*\//,"",c) } (c=="bash"||c=="sh"||c=="zsh") && ($0 ~ /gate\.sh/ || $0 ~ /locked-test\.sh/) && $1!=self && $1!=parent { n++ } END { print n+0 }')
… && [ "$peers" -eq 0 ] …
```
Positive-controlled by E: a real `locked-test.sh` run reports `peers=3`. Sent to all five lanes 08:25; the
controller's `gate.sh` is on v3.1.

**v3.2 (08:30) — v3.1's term had TWO more defects, found by Lane E watching the matcher fire against real
processes rather than reading it.** (a) `gate.sh` as a regex wants exactly one character between "gate"
and "sh", so it cannot match a script named `gate19.sh` — measured with Lane A's gate live at pid 80157:
broadened form 2, narrow form 0; every lane whose script is not literally `gate.sh` was invisible to the
idle check. (b) Matching the whole `$0` makes the matcher match its own caller, because the awk program
contains the names and the tool wraps commands in more than one shell level — `$PPID` does not cover it.
E's first strict form reported **0 against two live gate-shaped processes**; it was caught only by refusing
a vacuous positive control when the real gate had happened to finish. **The final form matches a path
TOKEN in argv, with both controls green in one instant** (a real gate-shaped process plus a shell merely
mentioning the names → 1; nothing → 0):
```
peers=$(ps -eo pid=,comm=,args= | awk -v self=$$ -v parent=$PPID '
  { c = $2; sub(/.*\//, "", c); hit = 0
    for (i = 3; i <= NF; i++)
      if ($i ~ /(^|\/)(gate[^\/]*|locked-test[^\/]*)\.sh$/) hit = 1 }
  (c == "bash" || c == "sh" || c == "zsh") && hit && $1 != self && $1 != parent { n++ }
  END { print n + 0 }')
```
Name gate scripts `gate*.sh` or `locked-test*.sh` so peers can see them. **Reference copy on Lane E's
branch at `e814f49`: `docs/lanes/gate-lock/{locked-test.sh,gate.sh,sweep-test-dbs.sh,README.md}`** — copy the
form, not the file (paths inside are per-worktree). **Interoperation confirmed live, not simulated:** the
controller's v3 gate held the lock as a regular file containing pid 80157 and E's independently written v3
script WAITED rather than reclaiming — two implementations, one protocol, the property v2 lacked. **Lane
A's caveat, measured:** `peers=0` is not instantaneously reliable — a previous tool call's shell can
linger as a sibling carrying the script text, neither self nor parent — which is why the reclaim also
needs 10 minutes and zero vitest workers; never sample it once for any other purpose. Sent to all five
lanes 08:30; the controller's `gate.sh` is on v3.2.

**Rules:** (1) `$$` is the process that survives the whole gate — one script, one `run_in_background`
invocation, never a subshell, pipeline or `nohup … &` (Lane D's earlier near-miss); (2) the ONLY stale
reclaim is a dead pid; an EMPTY file (a crash between open and write — microseconds) is reclaimed only
after 10 minutes AND with zero vitest workers and zero other gate scripts alive — E's idle criterion,
which fails SAFE (a session whose command line mentions a gate script counts as alive and merely delays
the reclaim); (3) mixed period: an OLD directory-form lock at the path makes `[ -f ]` false and `cat`
fail → WAIT; never `rmdir`/`rm` a directory you did not create; old-form holders cannot reclaim a file
either (their `rmdir` fails), so the two forms wait for each other correctly until every lane is on v3;
(4) `rm -f` on release, never `rm -rf`. **The controller's `gate.sh` is on v3; all five lanes were sent
the form at 08:15 and adopt it at their next gate; Lane E's `locked-test.sh` is the reference copy.**
*Earlier "RECLAIMING stale empty-pid lock after 60s" lines in this file's gate rows (07:43) were this
mechanism firing benignly — the holder was still in its acquire loop.*

### CLOSURE 5b built (#161, Lane B) — the grant side is pull-shaped; four findings and the LANE F list

1. **The grant half does NOT close 12.274 on its own, and a straight port of that case would have been
   green and false.** The client's filter is "do I hold this ticket", and a device can hold a STALE PARTIAL
   copy because narrowings purge nothing (6.101 struck the walk; 6.104 is the disclosed residual). What
   closes it is BOTH halves in `onCaughtUp`'s order: reconcile purges, THEN the notice finds a ticket not
   held — the narrow half is a PRECONDITION of the grant half converging, now written into
   `grant-backfill.ts`. **Residual — CORRECTED 08:58 by Lane B's own review: it is NOT bounded in time.**
   The first report said reconcile runs on every catch-up completion and the residual was bounded by a
   60 s interval; **`hub.ts:295` gates on `caughtUpSent`, a per-SUBSCRIPTION latch — reconcile runs once per
   RECONNECT.** On a stable live socket a narrow-and-re-widen with no reconnect between them never
   reconciles: **12.274 is the full defect there**, and 12.275 is green only because it calls reconcile by
   hand. **Ruling (08:58): closure 5c's MINIMAL form — on a grant/reach notice, reconcile the NAMED ids the
   client already holds before pulling the rest, so neither the interval nor the reconnect latch matters
   for exactly the tickets the notice names — is folded into #161's fix round IF it is the notice handler
   plus its 12.274-shaped fixture (narrow → other → widen on ONE live socket, no reconnect, no manual
   reconcile → `replicasEqual`); otherwise it stays Lane F's.** Every "bounded in time" sentence on the
   branch is being corrected.

**#161 HELD AGAIN (08:58) — the Fable branch review found a CRITICAL in the branch's most confident claim,
reproduced by Lane B by reading:** its docblock said *"the refold hazard closes as bootstrap-before-apply
on any event for an entity not held"* — **no such rule existed.** `applyServerItem` refolds on ANY folding
ticket event with no holdings guard (`replica.ts:954`); `refoldTicket` starts from `state = undefined`;
`applyTicketEvent` throws "never created" (`ticket-state.ts:145`) → `stall()`, the one-way latch. The only
bootstrap-before-apply built was for ids a notice named AND whose pull SUCCEEDED. Two sequences: (a) a
transient pull failure → the id stays pending → the trigger `ticket.reparented` for that ticket arrives one
link later → refold throws → STALL — the terminal stall the swallow was built to avoid, one link past where
the author was looking; (b) deterministic: the 200-cap leaves ticket 201 unnamed, a later ordinary
transition on it throws the same way, and `needsBootstrap` refuses to re-bootstrap over a local baseline —
pre-existing in kind under closure 5's cap, WIDENED by 5b (`readerReachNoticeFor` caps a whole project or
workspace where the old walk capped one subtree). **Fix under way, shape ruled:** make the rule real — a
fold failure for a ticket-entity event whose ticket the replica does NOT hold records the id as owed and
drains; a fold failure for a HELD ticket still stalls, loud; both halves get excluding fixtures (mutate the
owed path away → the latch fires → red; mutate the held-ticket stall to swallow → red). Also in the round:
`loadTicketBootstrap` applies definitions without `foldTicketsOntoVersion` (a client pulling across a
workflow publish keeps stale categories until the NEXT publish); two stale docblocks; the hub's
`reach-granted` arm had NO test. **Refuted under attack and kept:** the disclosure argument (every id
passes `canSee` as-of-now per candidate; authored descendants pruned; guests resolve through the explicit
list; the cycle guard terminates) and the notice-before-trigger ordering. *A claim true of the pull's own
rejection and false of the chain behind it — the exact class this series punishes, in the lane that had
just written that sentence about someone else.* The review cost ~378K subagent tokens.
2. **12.290 (the wedge) stays 🟡, not ✅, and refusing the flip is the point:** the mechanism is gone, but
   the flip condition (a slow-consumer close MID-PULL followed by convergence) is unmeasurable here —
   **nothing in this repo can cut a socket** (the rig has none by construction; the engine's tests use a
   fake transport with no buffer bound). Measured link by link, never end to end; refused on 12.274's own
   precedent. **Owner: Lane F — a socket-cutting fixture for the rig; 12.290 flips only when it exists.**
3. **A typecheck is NOT a sweep for a wire union.** The union's fourth arm (the grant notice) had EIGHT
   consumers: six were type errors — including `hub.ts`, whose `if/else` read "purge, otherwise
   scope-revoked" and would have handled a notice AS A REVOCATION (detach the subscription, empty the
   replica); an accident of field names saved it — and TWO the compiler could not find, both silent:
   app-core's `parseFrame` returning null (a second, independent wire reader that would have dropped the
   notice while accepting the trigger behind it) and the cross-package `CLIENT_STREAM_TYPES` pin, caught
   only by cases that read SOURCE TEXT. Closure 3 taught *the compiler is the enumerator for interfaces*;
   this teaches its limit. T18 puts both beside each other in §12's scope notes.
4. 6.102's guest side needed no escalation: `reconcileHeldIds` asks `canSee` and nothing else, and `canSee`
   resolves a guest through the explicit list exactly as a member through a project — an APPLICATION,
   closed by measurement (12.304), 6.102 amended in place, no new §6 id.
**Least sure (B's own):** the durable pending-pull set — unpulled ids as durable client state so the
cursor can advance without stalling on a transient failure; the review is aimed at it first. **Two
process notes for every lane:** `git add -A` with subagents running commits their work-in-progress under
your message (two commits on #161 carry hunks their messages do not describe — not rewritten, because
rebasing under live writers trades a cosmetic problem for a real one); and the permission hook refuses a
WHOLE compound command, so a python edit paired with a bad pipe runs neither and reads exactly like an
edit with no effect.

### LANE F — the serial end-of-run passes, accumulated (run after every lane's last PR merges, one at a time)
1. The repo-wide test-cases↔test citation convention (P33; coordination:3749/:4108 — no ✅ is grep-checkable
   and deleting a test reddens nothing) — the worst collision surface while lanes write tests.
2. The semantic-extraction pass (`--mode deep`, client packages only — scheduled section below).
3. The comment-cleanup pass (a tightening pass, not a stripping pass — scheduled section below).
4. **Closure 5c: reconcile-on-notice** (item 1 above).
5. **A socket-cutting fixture for the dual-client rig** (item 2 above) → flips 12.290.
6. The rig calling the REAL reconcile route through `inject()` instead of restating its rule — if #161 did
   not already do it (B's "first commit if cheap"); verify at merge.
7. The verifier's DDL credential / scratch-DB written decision — with **Lane E's T16**, not F, unless T16
   does not land.
8. The `TicketState`-fold `BoardCard.cause` ❌ case under P36, the 7.210/7.211 fixture items — with **Lane A**
   after `getMyWork`'s residuals, unless A runs out of runway; then F.

### RULING P40 (2026-09-06 08:45, controller as ruling tier) — `/v1/me/work` serves the viewer's OWN contested claims (Door B); mappers.ts's "never will" was wrong and is corrected in place

**Lane A found two landed docblocks contradicting each other** on which door serves `MyWorkView.contested`
(the viewer's own contested claims): `mappers.ts` (~86) — *"`/v1/me/work` does not serve contests and NEVER
WILL, because `GET /v1/contests` already does"*; `routes/my-work.ts` (~100) — *"Plan 10 extends
`MyWorkResponse` with an ADDITIVE `contested` key … nested under `groups` PRECISELY SO THAT KEY CAN ARRIVE
BESIDE IT"*. **Measured, not argued:** the online client cannot form the query — `getMyWork(workspaceId)`
carries no viewer id and P30 forbids widening `data-source.ts`; `OnlineDataSourceDeps` could take one, but
`apps/web/src/providers.tsx:96` builds the source in a `useMemo` keyed on services only while the session
loads asynchronously, and keying it on the session rebuilds the source AND the cache against that file's
one-cache invariant; `/v1/contests?claimantId=` is caller-supplied, so an unfiltered read serves EVERY
visible contest as "mine" — strictly wrong, worse than the refusal. For Door B: the server holds
`request.currentUserId`; `proj_contested_claimant_idx (workspace_id, claimant_id)` exists with a migration
comment naming "My Work / attention strip"; the route nests cards under `groups` for exactly this key.
**RULING: Door B.** "My contested claims" is a viewer-scoped read and the server is the only party that
knows the viewer. mappers.ts's sentence was about where the cross-check should look for a wireKey, and it
was wrong — corrected in place, the cross-check re-aimed. **Constraints:** claimant = the session, never a
query parameter (excluding fixture: user X's contested claims never appear in user Y's `/v1/me/work`;
mutate the claimant filter away → red, alone); the contested ticket's title on that key iff the viewer
`canSee` it NOW (id and no title otherwise — P32/P38's register; visibility may have narrowed since the
claim); provenance is P39's shape. `getAttention` needs no viewer id (`routes/attention.ts` scopes by
`visibleTicketsWhere` only) and closes on `/v1/contests` serving `title` + `projectId` through one
tenancy-scoped LEFT JOIN (LEFT so a missing ticket row throws loudly; inside the tenancy because
`proj_contested` has no FK). **Also measured by Lane A and corrected in the same change set:**
`read-models.ts:250`'s reason for `WorkItem.stateName`'s absence was FALSE — the version is on the ROW and
`readMyWork` had selected `workflow_id, workflow_version` all along; served via `foldedWorkflowDefs` by
version, NOT `attention.ts`'s latest-def `stateNameOf` (the workflowVersion lie). P39's compiler found a
live consumer the ruling did not name (`views/my-work.tsx:124` rendered `actorName` and `serverTime`,
neither of which the row can say) → `renderContestedClaimAttribution`, a sibling in `@gisik-nokma/domain`.
Two override corrections accepted: the replica's `MY_WORK_ABSENCES` never listed `serverTime` (its two
entries stay valid locally; no replica file changes); `getAttention` did not already serve `title`.

### RULING P39 (2026-09-06 08:05, controller as ruling tier) — `ContestedClaim.claim` is NOT a `ClaimProvenance`; it gets its own shape, with no `serverTime` member and no synthesis

**Measured by Lane A on #150 before asking, after it had inherited "unservable by anyone" from the
mapper's own `because` and caught itself citing an assertion as a measurement:** `SubmittedEvent =
Omit<EventEnvelope, 'serverTime' | 'seq'>`, so the stored `original_event` carries the claimant's
`clientTime` and **no server instant, by construction**; `proj_contested.contested_at` IS a recorded
instant — but it is the CONTEST event's `serverTime` (when the server filed the refusal), not the claim's;
`ClaimProvenance` requires both clocks. **So no row records a server instant for the refused claim
itself** — the mirror image of P36, where the ledger row DID record the instant and the writer merely
dropped it. Spending `contested_at` would attribute one event's instant to another: P36's option 3.
**RULING:** neither the copied instant nor a bare optional. A bare `serverTime?` on `ClaimProvenance` would
make every consumer of a REAL claim's provenance handle an absence that can never occur there — the type
would stop saying which shapes have a server instant and which cannot. **`ContestedClaim.claim` becomes
its own shape that tells the truth: `actorId`, `clientTime` (the device instant, recorded), `contestedAt`
(the server's instant for the CONTEST event, named for what it is), and no `serverTime` member at all,
because a refused claim never took effect.** View-type change in app-core; `data-source.ts` untouched
(P30); the replica source's refusal on the field flips to served. Excluding fixture: the mapper never
populates anything named `serverTime` for a contested claim (mutate to copy `contested_at` into one →
red). `renderContestedClaimText` (in `@gisik-nokma/domain`, consumed by `contest-banner.tsx` and
`contest-view-model.ts` — verified by Lane A, not named from memory) already prints `clientTime` as IST
device time — extend it. *If a consumer needs a server instant for a contested claim, that consumer is
wrong about what a contested claim is, and the case says so.* **Scope, so nobody reads more into it:** P39
closes one of `getMyWork`'s three remaining absences; `WorkItem.stateName` and `ContestedClaim.title`
must close too before the method stops refusing (`MAP_MY_WORK_ABSENCES`). `getMyWorkspaces` closing
completely after the HELD pair is the exception, not the pattern.

**Four sentences from Lane A's session, each paid for by a real defect, none specific to the code that
taught it:**
- *A guard that checks whether a value exists is not checking whether it is the right value* — and the
  comment claiming to catch "drift" was the aggravating factor: it made the gap read as covered.
- *An empty filter is not a neutral default; it is the one input under which a filter bug cannot show.*
- *Nullable describes the VALUE; additive describes the CONSTRUCTOR.*
- ***A case can kill the mutation it was written for and leave its stated property untested*** — 12.244
  killed option 3 while "the LAST state-claiming event wins" went unconstrained, because its fixture had
  only one such event. This one defeats the usual "I mutation-tested it" reassurance.
Also from #141's opus review: **the entire client half of closure 4 had ZERO tests** — replacing
`getSnapshotProvenance`'s body with `return null` left sync-client 63/63 and app-core 1092/1092 green;
the read-door defect P36 exists to close was never shown closed by any case until 12.246–12.249. The
`snapshot_provenance` retention gap in `purgeEntity`/`revokeScope` (fixed); a migration that promised a
healing the code does not do (owner named). **The HELD pair (#150) discharges P25 clause 1 completely**
— every `owner: 'P25 clause 1 — HELD'` absence in `mappers.ts` is served or catalogued; cases 6.138–6.142,
the mutation reddening exactly the three exclusion cases and pointedly not the owner exemption.

### RULING P38 (2026-09-06 03:45, controller as ruling tier; TO BE PUT BEFORE THE OWNER after the fact, revocable in a word) — the HELD pair's admin/member half: `WorkspaceRef.projects` is `eff.projects` for every role except owner

**Lane A escalated before building, as P32 wrote into itself.** `canSeeResolved` (`visibility/can-see.ts:94`)
settles three of four roles: owner → `true` unconditionally; guest → P32 (`eff.projects` and nothing
else); admin/member → `workspace` mode true, `project` mode `eff.projects.has(v.projectId)` with the
"no admin bypass — deliberate" comment. **The gap: a PROJECT has no `resolvedMode`** — the rule decides
against a ticket's audience and a project has none — so two readings follow from the same switch: (a) all
projects (the `workspace`-mode branch read across) or (b) only `eff.projects` (the `project`-mode branch).
Measured fact that narrows it: an admin/member ALREADY receives the project IDs of projects they are not
in — `TicketCard.projectId` (`read/ticket-cards.ts:138`) on any workspace-mode ticket — so existence is
disclosed today through the ticket surface; the new disclosure would be the NAME only.
**RULING: (b).** It is an APPLICATION, not a new rule: **P32 already ruled `WorkItem.projectName` for
ALL viewers, role-independent** — *served iff the project is in `eff.projects`, otherwise the item carries
the id and no name* — and stated the principle generally (*a project's NAME is itself a disclosure and is
not served for any other project*). `WorkspaceRef.projects` is the same question one door over. The
strangeness (an admin sees a project's workspace-mode tickets but not its name) is a shape P32 already
accepted for the my-work item. **Tie-break: naming a thing whose id you already hold is a WIDENING, and
widenings are reversible; narrowing after a disclosure is not** — the same direction 6.101's ruling
chose. Owner sees all, pinned by its own case so the switch's exemption is a tested fact. Excluding
fixtures on both doors, admin and member separately: not in project Y → neither Y's name nor id in the
projects list, and Y's id with no name on a my-work item; mutate the `eff.projects` check to permit → red,
alone. `Features.md` says a partial workspace is the correct answer for admin/member as it does for
guests. If the owner prefers (a), the change is a widening on a branch, not a rollback.

### THE CASE-ID RECOUNT WAS BLIND TO ITS OWN SUBJECT — three id styles, one grep (2026-09-06 03:30, Lane B, refined by Lanes E and C)

`test-cases/12` carries ids as `- 12.274 🚫 …` (plain) AND `- **12.240** ✅ …` (bold, Lane A's closure 2b);
`test-cases/13` adds a third, `- 🧪 **13.1 — …` (marker first, Lane C). **The control every lane cites —
"recount the maximum against `origin/main` at rebase", run as `grep -o '^- 12\.[0-9]*'` — sees ONE style
and reported "zero duplicates" through a collision it structurally could not see.** Lane B measured at
its rebase: plain 215, bold 4, union 219, max 12.289, zero duplicates — and its earlier "215, zero
duplicates" was correct for its tree and blind by method, which is the honest way to record it. Lane E:
§12 on `main` = 200 plain + 4 bold; its own marker-first matcher returned **0 on all three real files,
indistinguishable from a matcher that cannot fire**, resolved only by a synthetic file carrying every
spelling — *a zero from a matcher you have not seen fire is not a measurement* (the `pgrep`/pool-matcher
lesson, again). **Rules now:** ids are extracted from the LINE HEAD only (`^- (\S+ )?\*{0,2}(NN\.\d+)`;
prose cites ids and a citation is not a definition); per-style counts are printed as the positive
control and **the union is compared against their SUM — `union < sum` is the machine-readable signal
that a style is being missed.** **`scripts/check-case-ids.mjs` (Lane C, in #134's amendment, wired into
`check-env`, BLOCKING)** implements this with a checked-in fixture asserting known counts (bare 1, bold 1,
marker-first 2, union = sum = 4, citation excluded) so the script's own blindness is a test failure. It
found its first bug in itself (a greedy marker group swallowing `**7.1,` and reporting a false duplicate
at 7.2) and its first true positives in `test-cases/07`: two "Reserved-block disposition" bullets that
lead with a bare id (`- **7.1, 7.2 — written by this task.**`, `- **7.35 — …**`) beside the real entries.
**Ruling: reworded in the same PR, no exception, no section heuristic** — a documented exception is a
check that cannot fail for exactly the shape it exempts, and making the repo pass the gate a PR
introduces is the same-change-set rule applied to a gate (#85's precedent).

**Nullable describes the VALUE; additive describes the CONSTRUCTOR (Lane A, closure 4, #141).** P36(b)
said the bootstrap field is ADDITIVE; the first draft wrote `provenance: SnapshotProvenance | null`, which
is nullable and not additive — every existing constructor, including Lane B's rig, had to write
`provenance: null`, and the rig stopped compiling. Now optional on the wire. The asymmetry is deliberate:
the server's own `Snapshot` ROW type keeps it REQUIRED, because that is what surfaced `snapshot-refresh.ts`
as a compile error instead of a NULL written over a good block — a wire payload with foreign constructors
versus a row this code owns. **And the honest fixture overlap:** option 3 kills {12.244}; removing the
carry-forward kills {12.244, 12.245} — not orthogonal, and left recorded rather than split, because two
mutations with two different failure sets is what identifies the fault; manufacturing separation would
remove the second pass that makes 12.244 exercise the carry-forward at all. `BoardCard.cause` is narrowed
rather than served on the snapshot-bounded path — ❌ case owed, owner P36.

### Carried this context, with owners

- **#126 was opened without its catalogue** — seven rig tests, no case ids, `Features.md` §12 still
  listing the harness as absent. Lane B found it against its own PR while asking for an id block, and
  this controller reached the same hold independently a minute apart. **Held, not merged, per #47's
  precedent** ("never a follow-up"); closed on the branch at `1f9d7ef` before any rebase.
- **From Lane A's closure-2 review (52 agents, 6 lenses, Fable on visibility):** both Criticals were gaps
  declared CLOSED that were closed only for the case the fixtures used — `getTicket` could not map a ticket
  WITH CHILDREN (route returned `RollupView`, mapper read `TicketRollup`), `getTickets` served a project's
  first 50 as the whole project (`nextCursor` had no field). **The fixtures were ENCODING the defects**
  (`rollup: null` hard-coded; `nextCursor: 't3'` with every row asserted back) — 1033/1033 green with C1
  present. → **Owner Lane A, last in its queue:** no test executes a mapper against a real `/v1` body
  (`client-contract.test.ts` reads `mappers.ts` as TEXT; `apps/server` has no `app-core` dep) — the
  devDependency now exists on E's T5 and B's #126. Also carried, Lane A: 7.210's folded-vs-latest
  property unconstrained (every fixture workflow has one version); 7.211's dangling-`parent_id` branch has
  no fixture and survives its own mutation.
- **Closure 3 (#128) found the third stream divergence AS A COMPILE ERROR** — `StreamItem` declared
  `code: string` where the domain declares `code: StreamErrorCode`; `online/stream.ts:118` had been
  assigning an unvalidated wire string. 7.199's 🚫 owner clause named this work; flips to ✅. The contract
  test was re-aimed at the only property the deletion makes checkable: `data-source.ts` re-exports the union
  and declares no second one (mutation-measured). **Batch C's two guardrails on the deferral HELD** — it
  landed as a rename, not a reconciliation. Carried, unassigned: a per-`StreamErrorCode` policy (an error
  frame with an unrecognised code is now DROPPED like any unreadable frame — named in the code as a cost).
- **Lane D's rebase finding, worth every lane's attention:** a plain `pnpm install` after a rebase bumped
  `react-native-webview` 13.15.0 → 13.17.0 through its `^` range and **broke `apps/mobile`'s typecheck
  outright** (WebView prop types resolved to `never` — three `@types/react` copies in the store). Pinned
  exact. **A caret range is a rebase hazard on every native-toolchain package.**
- **CLOSURE 5 is BUILT (#139, Lane B, held for review):** `visibility/grant-backfill.ts` wired into
  `visibleEventsFor`; `sync/reconcile-route.ts` + a FOURTH `SyncTransport` method + `SyncEngine.reconcile`.
  Mutations verbatim: triggers → `[]` reddens 5 of 6 (the survivor 12.277 is held by the caller's `canSee`,
  which is the finding); `grantBackfillFor`'s `canSee` → permit reddens **12.280 alone**; the route
  enumerating `proj_visibility` reddens 12.285/12.286 (**12.284 stayed green, which is why 12.285
  exists**); the engine dropping `chunk.includes(item.id)` reddens **12.287 alone**. 12.274 🚫 → ✅; **6.104 ✅
  both halves** (its earlier withdrawal stands as written). **CLOSURE 5b assigned, Lane B, after #139 and
  before T18:** 12.283 (the READER's reach grows — `membership.granted`/`project.member_added`, same P37
  shape keyed on the viewer), 12.288 (nothing calls `reconcile` on a schedule — the engine calls it on
  every reconnect/catch-up completion, proved by an offline-narrow scenario with no manual call), 6.102's
  guest side (same client-presented path if an application; escalate if a new rule). Carried, closes when
  cheap: the dual-client rig RESTATES the reconcile route's rule in-process instead of calling it
  (Lane B's own least-sure claim) — the same shape as Lane A's `/v1`-mapper item.
- **The compiler is the enumerator; the grep is a hint (Lane B, #139):** the grep the controller asked for
  found FOUR `SyncTransport` implementors; `pnpm turbo run typecheck` found a FIFTH — an inline object
  literal at `packages/app-core/test/replica/replica-data-source.test.ts:486` with no `: SyncTransport`
  annotation, structurally typed by inference and invisible to any textual search for the type name.
- **"An empty filter is not a neutral default — it is the one input under which a filter bug cannot
  show" (Lane A, closure 2b's Critical, found by the Fable review):** `listProjectWithOfflineBorn` read its
  born half from an unfiltered `listTicketSummaries` and deduped against the FILTERED settled rows, so
  typing in a search box turned settled tickets into claims; all three of its cases passed `{}` because
  `matchesFilter` guards every axis on `!== undefined`. The mirror of closure 2's `rollup: null`. **A door
  that takes a filter needs a case with a filter.** Fixed at the root; restoring the old code reddens
  12.243 alone.
- **A measurement that looked careful and was wrong (Lane A):** `test-cases/03` carried `**3.149–3.151**`
  as ONE bullet; a ceiling grep requiring `**` straight after the digits read past the range and reported
  3.148 as the max, so 3.149 was minted twice an hour after range-collisions became a rule. Renumbered to
  3.152; §3 now has a header that says *recount with a pattern that catches a range*. **§12 — header AND
  allocation — collided on nothing but one prose line at the same rebase**: the scheme worked on its first
  real test.
- **The local replica schema has NO migration path (Lane A, closure 4 prep):** `migrateLocal` runs
  `CREATE TABLE IF NOT EXISTS` only; `LOCAL_SCHEMA_VERSION` is written into `meta` and **never read by
  anything** (checked across sync-client, app-core, both shells). A new COLUMN works on a fresh device and
  throws `no such column` on every existing one — so P36's provenance block is a sibling TABLE. **Named
  owner: the first change that must ALTER rather than CREATE needs a mechanism that does not exist.**
  The client-side carry-forward omission was also available and is handled (a local re-snapshot with no
  block must not erase one an earlier bootstrap delivered).
- **"A behaviour correct today for a reason nobody is asserting" — raised as a CLASS by Lanes C and E,
  three instances in one night:** `DATABASE_CA_CERT` was documented as consumed and silently discarded
  on every managed-Postgres URL (pg applies the parsed connection string over the caller's object; `ssl`
  replaced `ssl: {ca}` wholesale) and its guard asserted `pool.options` (what the driver was handed) not
  `connectionParameters` (what it connects with); Lane C's timezone demo; the `sslmode=require` warning.
  **The test form: a mutation that restores the defect AND reverts the assertion, proving the old guard
  blind by construction** — the paired-mutation rule's third costume.
- **`nohup … &` inside a `run_in_background` call reports "completed" the instant the outer shell
  returns (Lane D):** a gate was still genuinely running when the harness said done, and its lock was
  nearly reclaimed as stale. `ps -p` before any reclaim; never nest a detach inside the harness's own.
- **Lane E's catalogue debt:** T1 and T5 landed on its branch with NO `Features.md`/`test-cases` entries
  (two instructions composed into "catalogue nothing"); accepted as one dedicated commit after its rebase
  onto #134, counted as the same change set only because seam 1 is one PR — said so in the PR body.
- **Session limits:** every lane's five-hour session meter read **80% at 03:25 (resets 06:40 IST)**;
  weekly 34%. Expect `/limit-reset` work before dawn; the launchd limit-resumer is loaded.
- **Restarts this context:** C (02:25, T14→T15) · D (02:24, T7+T8; 03:24, T9+T10 on
  `exec/27-plan11-seed-runners` — manifest ruling: D takes its own `seed:cc`/`seed:dev` script lines,
  announced to E first) · B (02:55, closure 5). Staged: C → T15 on `exec/28-plan11-do-spec` at #134's
  merge; B → closure 5b + T18 on `exec/29-closure5b-reach` at #139's merge. Old overrides saved as
  `override-lane{B,C,D}-*.md.bak`.
- **P36 constraint (d) is MEASURED (Lane A):** the door derives provenance from local events in exactly two
  places — `stateClaimOf` → `stateProvenance` (three doors) and `assignedClaimOf` → `assignedProvenance`
  (`getTickets`). The control that explains why nothing else qualifies: `dueDate` is a `FieldClaim` carrying
  its own `actorId`/`clientTime`/`serverTime` INSIDE `TicketState`, so it already survives a snapshot-bounded
  bootstrap — **field claims are carried in the state; the state claim and the assignment claim are not.**
  Closure 4's scope is those two, one PR.
- **Closure 2b is BUILT** (`exec/25-snapshot-provenance` at `9cfa978`, 30/30, 3259 tests): `listProjectWithOfflineBorn`
  unions the settled list with offline-born tickets tagged by kind (12.240–12.242); the OPPOSITE answer to P36
  is stated in the type's docblock — an offline-born ticket has no `serverTime` because NO row recorded one,
  so it renders as a CLAIM, never as a row missing a field. Fable whole-branch review running; PR follows.
- **`test-cases/03` has no id allocation and no highest-id marker** — the gap that produced today's 12.156
  collision, in another file. Lane A minted 3.149 by re-measuring `main`'s ceiling and adds the header line
  in closure 2b's PR.
- **`vitest: command not found` on `mobile#test` after a rebase** = the install-then-gate trap in a new
  package's costume (the worktree had no `node_modules` for a package `main` gained with #121). Reinstall after
  every rebase; not a defect.
- **Lane B restarted 02:55 at the #126 fixed point** (`override-laneB.md` rewritten: closure 5 → T18; the old
  one saved as `override-laneB-t13-t15-done.md.bak`); fresh session was reading `visible-events-for.ts` within
  a minute. **T18 stays behind closure 5 AND Lane A's remaining §12 writes (12.240–12.259)** — a catalogue task
  cannot close on a moving §12.
- **Lane B's phrasing, adopted as a method rule:** *a mutation that fails nothing is an UNCONSTRAINED
  PATH only if the edit was confirmed present in the file before the run; otherwise it is a mutation that
  never fired, and the two are indistinguishable from outside.* Say which, every time.

> ### ⚠ A LANE PANE THAT RENDERS A PROMPT BUT TAKES NO KEYS — relaunch it, do not paste into it
> Lane C's pane held an unsent line ("keep holding, no action needed yet" — the previous controller's
> paste, or the idle-nudger's) and **accepted nothing**: Enter (INSERT mode), Escape then Enter (NORMAL
> mode), Ctrl-C, and typed characters all left the buffer unchanged, with `pane_in_mode=0` and the
> session listed `idle`. Cause unknown and not worth diagnosing: the lane had nothing unpushed (state
> file at `913f6aa` = remote), so **`start-lanes.sh C` with a rewritten override** replaced the window in
> one step, and the fresh session was reading `ci.yml` 60 s later. The launcher exists for exactly this;
> the old override is saved beside it as `override-laneC-t16-done.md.bak`.

## ⏩ CONTROLLER CLEARED ITSELF 2026-09-06 ~02:10 IST AT THE OWNER'S INSTRUCTION (ctx 70%) — SUPERSEDED BY THE BLOCK ABOVE, kept for the record

**Deliberate, not a crash.** The owner said *"ctx is 70%. need to clear the main. do it automatically."*
The controller merged what was ready, wrote this block, landed it on `main`, then typed `/clear` into its
own tmux pane (`gisik:0`) followed by a paste of `dispatch-controller-serial.md` as the first message of the
fresh context — the same in-pane mechanism used for the executors' `/limit-reset`. **The session model is
Fable (owner-set); the brief's Sonnet gating does not apply to this session.** The ⚡ section below this
one is the live topology; everything above the old serial sections is current.

**`main` at the clear: `9e8777e`** (PR #120, Plan 10 T16 desktop, merged after independent CI at
`5b8d7a6`). **Ledger 156/177** (T13 promoted, PR #122). **Open: #121 only.**

### Per-lane position at the clear — verify each with `gh pr view` / `git log origin/<branch>`, do not adopt

| lane | session name | state at clear | next action for the controller |
|---|---|---|---|
| **A** | `gisik-nokma-exec-06` | closure 2 under Fable review (6 lenses) on `exec/19-serving-gaps`; then buildable gaps → 11th gap → closure 3 → **closure 2b** (P34 items 1–2) → **HELD pair, unblocked by P32** | merge its PRs on arrival; promote nothing (closures are not ledger rows) |
| **B** | `lane2-plan4-e5` | T13 **merged + promoted**. **T14 rig VERIFIED** — self-test 4/4 under the lock at `0cbdc82`, Fable review running; then T15 scenarios (Fable) → **T18 held until T16 AND T17 have merged** (T16 has; T17 = #121) | merge T14/T15 PR on arrival; promote 10/14, 10/15 |
| **C** | `lane3-plan7-8-b6` | **T16 MERGED at `9e8777e`, NOT YET PROMOTED.** Pool-pinning gap accepted as MEASURED (SQLITE_BUSY with zero concurrency in the two-call form; one-call form pins but cannot carry callers that read inside the transaction) — case 12.229, owner named. **Holding for a re-task; told not to start Plan 11 files unilaterally** | **(1) promote 10/16** — evidence: `gh pr view 120 --json files` vs T16's `Files:` block; **(2) re-task C onto Plan 11 work file-disjoint from Lane E's current seam** (the ETA lever) — ask E its position first |
| **D** | `lane4-periphery-e5` | #121 (T17) re-gated 27/27, 3238 tests at `a38b3de` — **conflicted after #120 landed** (adjacent §12 blocks); **rebasing past `9e8777e` now**, will report a new head | merge at the sha D reports after CI green there; **promote 10/17**; then re-task D like C |
| **E** | `lane5-plan11-1d` | Plan 11 seam 1 in flight on `exec/23-plan11` (attachment routes A0, T5a Dockerfiles, `.nvmrc`/`.npmrc` landed, sweep-test-dbs.sh); **P33's 18 errands adopted** | merge seam-1 PR on arrival (`check:env` on its own line); promote its T-rows; coordinate C/D's re-task boundaries with it |

**Pending decisions, none blocking:** the not-a-member retry POLICY (Lane B, P34 item 3: surface shipped,
policy refused) wants a TASK, with the owner; the 36.8 GB of unused Docker images is the owner's call and
no longer needed. **Standing protocol reminders for the fresh context:** never pipe `gh pr merge` (read
`$?`); ledger-only PRs need an independent `check:tasks` re-run (CI skips); the gate lock is ONE
backgrounded invocation; reap by ppid=1 only; case-ids in §12 are ALLOCATED (see the collision map);
`SendMessage` to lane names works — tmux `gisik:N` is the fallback.

## ⚡ RESUMED 2026-09-06 00:30 IST — FIVE PARALLEL LANES, OWNER-DIRECTED. THIS SUPERSEDES THE SERIAL TOPOLOGY BELOW

**Quota rolled to 0% weekly at ~00:30 IST Sunday, BEFORE the labeled Monday 06:30 reset.** Second
observation of this (first: 62% → 1% Tue→Wed). **The weekly window ROLLS; the Monday label is not a
cliff.** The rolling-window question this file has carried as "unresolved" is now resolved by two
independent data points. Re-derive every quota-based stop point on that basis from here on.

### Three owner instructions, in this order, all 2026-09-06 — recorded verbatim because each supersedes a standing ruling

1. *"resume operations with the highest model and the highest parallelism"* — **supersedes the serial
   topology** (one executor) and lifts the **HARD CAP 6 subagents/task** and **one fan-out per plan**
   cost rulings, bounded only by the machine (16 GB / 10 cores) via the gate lock below.
2. *"aside from the actual deployments to the servers, make sure every single thing is completed.
   testing, and everything should be thoroughly done"* — **dissolves the T14 stop point** (its rationale
   was quota, now rolled) and sets the scope: **Plan 10 T13–T18, all of Plan 11 except the act of
   deploying to a live server, the three closures, the eleventh gap, the never-wired attachment routes,
   and the two scheduled passes (semantic extraction, comment cleanup).** T15's DigitalOcean spec is a
   FILE and is in scope; applying it to a live DO app is the one thing out.
3. *"fable unblock is lifted. but fable should only be used for what is actually necessary. do not need
   to use a butcher's knife to kill a chicken"* — **supersedes the 2026-08-31 "Fable out entirely"
   ruling with a PROPORTIONALITY rule, not a reversal.** The brief's MODEL & EFFORT table stays as the
   default (sonnet default, opus for core semantics / floor-list). **Fable is a new top tier, used ONLY
   for: (a) the visibility/read-enforcement surface — the one that produced P19, P22, P23 — i.e. Lane A's
   closure-2 reviewer and the HELD pair if/when unblocked; (b) the dual-client distributed-systems
   scenarios, T14/T15 author AND reviewer; (c) a lane's final whole-branch reviewer when the branch touches
   visibility or sync.** Scaffolds, Dockerfiles, CI YAML, catalogues, Tauri/Expo shells: sonnet, as the
   table already says. The controller runs Fable because the owner set it.

### RULING P31 (2026-09-06, controller as ruling tier) — `restricted-parents.ts` APPLIES `canSeeResolved`; it invents nothing

The load-bearing unknown from the quota block, answered by reading the code against the real exports,
with every docblock citation verified rather than trusted:
- Decision function is **`canSeeResolved`** (`visibility/can-see.ts:94`, confirmed export, signature
  `(eff, userId, v: ResolvedVisibility)`) — the new file passes exactly `{workspaceId, projectId,
  resolvedMode, resolvedUserIds}` and adds **no branch**. The SQL fetches the parents' `resolved_*` rows and
  restates nothing about who may see what.
- Role is resolved via **`resolveEffectiveRole` per the PARENT's workspace** (brand-protected, Ruling P22),
  cached per workspace — **byte-for-byte the call shape `rollup.ts:262–276` uses for children.** Verified.
- Disclosure is **strictly weaker than an existing door**: `routes/tickets.ts:304` already serves
  `parent = { kind: 'restricted', id }` (case 6.14, spec §6's deliberate existence leak — verified at the
  line), and `parentId` is already on every `TicketCard`. This boolean drops the id.
- Unknown parent → `false` mirrors the root-resolution ruling (case 6.9) rather than inventing existence.
- **`TicketRead.title` also applies the existing gate**: the WIP's `titleOf(state: TicketState)` reads the
  title from the reducer's claim map inside the single-ticket route that is ALREADY `canSee`-gated — not
  a new `proj_tickets` read. **One residual check for Lane A's reviewer: confirm in control flow that the
  route's gate precedes `titleOf`.** That is a reading, not a ruling.
**So P25's condition is SATISFIED for both rule-first gaps. Closure 2's WIP may be gated and reviewed,
not discarded.** Unknown #4 also measured: the WIP removed `mapListView: never` and `mapTicketRead:
never` (closed `getTickets`, `getTicket`), touched neither HELD entry, and never reached `search` or
`getAttention`.

### THE FIVE LANES — file-disjoint by construction, collisions named, sequence inside each lane is fixed

| lane | window · worktree · branch · state file | work, in order | model tier |
|---|---|---|---|
| **A** | `gisik:1` · `gisik-nokma-exec` · `exec/19-serving-gaps` (existing) · `executor-state.md` | rebase #109 → merge · gate+review closure-2 WIP (Fable reviewer) · finish `search`/`getAttention` buildable fields · `WorkItem.stateName` (11th gap) · closure 3 `StreamItem` · **HELD pair LAST, only if owner has answered — else stop and report** | opus impl, **Fable review** |
| **B** | `gisik:2` · `lanes/lane2-plan4` · `exec/20-plan10-t13-t15` · `executor-state-B.md` | T13 (app-core UX) → T14 rig → T15 scenarios (**Fable author+review**) → **T18 catalogue held until C and D have MERGED** | table; Fable for T14/T15 |
| **C** | `gisik:3` · `lanes/lane3-plan7-8` · `exec/21-plan10-t16-desktop` · `executor-state-C.md` | T16 Tauri desktop. Gate = `cargo check` + `tsc` + vitest on the storage adapter; **no simulator claim** | sonnet/opus per table |
| **D** | `gisik:4` · `lanes/lane4-periphery` · `exec/22-plan10-t17-mobile` · `executor-state-D.md` | T17 Expo mobile (`npx expo`, no global CLI). Same honesty: built, typechecked, unit-tested, **not device-verified** | sonnet/opus per table |
| **E** | `gisik:5` · `lanes/lane5-plan11` (new) · `exec/23-plan11` · `executor-state-E.md` | T1→T6 (config, CORS/rate-limit, alerting, SMTP, Dockerfiles, dev stack) **+ wire `registerAttachmentRoutes` into `app.ts` (owner: this lane, carried since step 12)** → T7→T12 (seeds, backups, restore) → T13 E2E vs compose → T14 (ci.yml EXISTS — extend #89, do not recreate) → T15 DO spec file → **T16 catalogue held until T1–T15 merged**. Live deploy: OUT | table; floor-list opus |
| **F** (later) | after everything merges, serial | semantic-extraction pass (`--mode deep`, client packages) and the comment-cleanup pass | per their own sections |

**Collision map, named so nobody rediscovers it:** `apps/server/package.json` (B's T14 devDep vs E's
T2/T4/T5/T9/T10/T11) · `apps/server/src/app.ts` (E only — A's closures touch `read/` and
`routes/tickets.ts`, verified from the WIP stat) · `packages/app-core/src/index.ts` (A's closure 3 vs B's
T13 exports) · root `pnpm-lock.yaml` (C, D, E all add packages) · `Features.md` / `test-cases/12` (A, B, C,
D — each lane appends ONLY in its own plan's section; T18 is the one that owns §12's final shape) ·
`docs/lanes/executor-state*.md` (per-lane files, no sharing). **Every lane rebases onto `origin/main`
before opening its PR; the controller merges in arrival order; a `pnpm-lock.yaml` conflict is resolved
by re-running `pnpm install`, never by hand.**

### ⛔ THE INLINE LOCK BELOW NEVER HELD — superseded 2026-09-06 ~01:20 IST by the ONE-BACKGROUNDED-INVOCATION form

**Found by Lane B, verified by this controller, and the flaw is the controller's.** Each Bash tool call
is a fresh, short-lived shell, so `echo $$ > /tmp/gisik-gate.lock/pid` records a pid that exits within
seconds — after which every peer's stale-check is **correct** to fire and reclaims the lock inside one
15-second poll. **It released itself after every acquisition; it never held for anyone using the inline
form.** Compounding it: the harness denies foreground `sleep`, so the one-liner could not run in the
foreground at all; the natural repair — acquire in one call, gate in the next — is exactly the split that
kills `$$`. **Consequence, measured by Lane B: two independent 9-worker vitest pools live at once, ~66 MB
free, swap 1983 MB of 3072 — the Sep 4 shape with a multiplier.** Nothing crashed: both pools had live
parents and finished; zero orphans after; swap peaked at 3.6 GB of 4 GB and is draining.
**Lane E's `locked-test.sh`/`gate.sh` never had the bug** — acquire+pid+trap+run in one backgrounded
invocation, evidenced by `LOCK ACQUIRED pid=77833` → `GATE FINISHED` 85 s later in one process. "Never
held" is true of the inline form; the record distinguishes so nobody hunts a bug they do not have.

**THE PROTOCOL NOW, every lane and this controller — ONE backgrounded invocation (`run_in_background:
true`), never split, never foreground, no `kill`/`rm -rf`/`trap`-less forms (the harness denies `kill`
even as `kill -0`; use `ps -p`):**
```
until mkdir /tmp/gisik-gate.lock 2>/dev/null; do p=$(cat /tmp/gisik-gate.lock/pid 2>/dev/null); if [ -n "$p" ] && ! ps -p "$p" >/dev/null 2>&1; then rm -f /tmp/gisik-gate.lock/pid; rmdir /tmp/gisik-gate.lock 2>/dev/null; fi; sleep 15; done
echo $$ > /tmp/gisik-gate.lock/pid
trap 'rm -f /tmp/gisik-gate.lock/pid; rmdir /tmp/gisik-gate.lock 2>/dev/null' EXIT
while [ "$(ps -eo comm= | grep -c '^node (vitest')" -gt 0 ]; do sleep 15; done
source ~/.nvm/nvm.sh && nvm use 22 && pnpm turbo run build test typecheck --force --concurrency=1 > gate.log 2>&1; echo GATE_EXIT=$? >> gate.log
```
`--concurrency=1` plus the zero-live-pools wait bounds the machine to **one pool at a time**. Package-
scoped runs: `pnpm --filter <pkg> exec vitest run --maxWorkers=2` (direct CLI — turbo's `--` passthrough
hands `--maxWorkers` to `tsc` and breaks `build`). **Two refinements from Lane E, adopted:** a lock dir
with **no pid file** (holder died between `mkdir` and `echo`) is never reclaimed by the `[ -n "$p" ]`
guard and wedges every lane — reclaim an empty-pid lock after 60 s, loudly; and bound the drain-wait at
10 minutes with a loud proceed, or back-to-back unlocked package runs starve a gate silently. The live-pool
matcher was **verified to fire on macOS** by Lane E against a real pool (0 → 3 during the run) after it
had nearly refuted it from two `ps` snapshots taken at two instants — "a count is true of a tree that has
stopped moving," in process-table costume.

> ### ⚠ AND THIS CONTROLLER REPORTED A MERGE THAT DID NOT HAPPEN — the pipe trap, fourth costume
> `gh pr merge 117 --squash 2>&1 | tail -1 && echo "#117 MERGED"` printed **MERGED** while `gh` had
> **refused** ("the merge commit cannot be cleanly created" — #117 conflicts with `main` after #109) —
> because `| tail -1` made the pipeline's status `tail`'s. Caught on re-check against `gh pr view` state,
> not by the command. **Never pipe a merge; read `$?` on its own line. The same rule this file already
> states for gates and for `check:tasks`, now proven to need stating for `gh pr merge` too.** #117 is OPEN,
> rebasing; it merges at the re-gated sha Lane B reports, and at no other.

### ⚠ DOCKER'S DISK FILLED AND POSTGRES PANICKED — found by Lane B, cleared by Lane E within the hour

Docker's VM volume hit **100%** (56.1 G of 58.4 G, 0 available) while the host had 77 GB free. The shared
test Postgres (`gisik-nokma-exec-postgres-1`, 54329) went into a **crash-recovery PANIC loop** — `could not
write to file "pg_logical/replorigin_checkpoint.tmp": No space left on device` → checkpointer signal 6 →
reinitialize → repeat — with `pg_isready` rejecting and **`docker ps` still reporting "Up 43 hours"**, so a
glance says healthy. Lane B found it when its T14 rig's `CREATE DATABASE` failed on space, dropped 39 idle
orphaned `gisik_test_*` databases (331 MB, zero backends, checked first), and correctly refused to prune a
daemon that also hosts the owner's `mongo`/`redis`/`postgres:15.3`. Verified line for line by this
controller: `docker system df` showed **12.6 GB build cache, 0 active** and **36.8 GB unused images**.
**Lane E then cleared its OWN artefacts** — the build cache had gone 986 MB → 12.6 GB during ITS four T5a
image builds, so `docker builder prune -f` (cache-only by construction, 0 of 94 entries active) plus its two
superseded `gisik-server` images: ~13.1 GB reclaimed, the owner's 17 images and 4 containers untouched,
Postgres `accepting connections`. **Both lanes were right**: a lane may clean what it created; anything
else is the owner's. **The 36.8 GB of unused images is still the owner's call and is no longer needed to
unblock anything.** Every lane was told to stop server runs and then told they were back.
**Standing fix, owner Lane E, DONE**: `sweep-test-dbs.sh` drops idle `gisik_test_*` databases — **zero
backends in `pg_stat_activity`, computed in one query** so a peer's running suite is never touched —
**before every gate**, because `createTestDatabase`'s `drop()` lives in `afterAll` and a killed run never
reaches it: the cleanup that exists is precisely the one that does not run when it matters. 39 → 0.
**Two more traps recorded from the outage:** turbo prints the pnpm LAUNCHER's path
(`…/v24.11.1/bin/pnpm`) only on failure — it is absent from every green log and reads as a Node-24
regression that is not real (`node-version.test.ts` asserts the worker's Node from inside); and a red
server suite whose visible error is `TypeError: Cannot read properties of undefined (reading 'drop')` in
`afterAll` is teardown masking the real cause (here: `the database system is in recovery mode`).

**Session limits:** Lanes B and E stopped on `You've hit your session limit`; on the owner's instruction
this controller typed `/limit-reset` into each pane via tmux (text, 1.2 s, Enter as a separate key) —
both resumed (B's T14 rig self-test then passed under the lock). Lane A's window rolled on its own
(97% → 4%). The machine-local hook's own advice text still said `pgrep -f vitest && pkill -f vitest` —
**the hook was recommending the session-killing command to every lane** — fixed to the ppid=1 form,
recompiled.

**Lane C's "main is red" was the stale-dist trap, refuted by two instruments** — this controller's
`turbo run build --filter=@gisik-nokma/app-core... --concurrency=1` at `6ed5b44` with current dists (5/5,
exit 0) and #120's own full-suite CI (green). The three reused lane worktrees carried `dist/` from their
old branches; `pnpm install` does not rebuild them. **Ruling on Lane C's CRITICAL** (tauri-plugin-sql's
sqlx pool cannot pin a transaction to one connection): **not accepted as a permanent gap until the
one-call form is measured** — the plugin acquires one pooled connection per `execute`, so a transaction
issued as ONE multi-statement call is pinned by construction; measure both forms, and only if the one-call
form genuinely cannot carry the adapter's transactions does the gap stand with its owner.

**T13 promoted (PR #122): 156/177 (88.1%)**, Plan 10 **13/18**. #120 (T16) and #121 (T17) are rebasing past
#117 — all three touch `Features.md`/`test-cases/12`. **Lane-table correction:** "T15" appears twice one
letter apart — Lane B's is **Plan 10** T15 (dual-client scenarios), Lane E's is **Plan 11** T15 (the
DigitalOcean spec FILE); `coordination:1610`'s "Lane 4 owns `deploy/do/app.yaml`" is the dead four-lane
numbering, and Plan 11 T15 is Lane E's with §4's verifier-credential obligation travelling with the file.

### THE GATE LOCK — the one physical constraint, because this machine has already been crashed once

16 GB / 10 cores, no vitest worker caps, no turbo concurrency setting (both measured absent). Five lanes
running server test suites at once is the Sep 4 crash with a multiplier. **Rule, in every lane's brief:**
- **Any test run that includes `apps/server`** (package-scoped or full gate) takes the machine-wide lock
  first: `until mkdir /tmp/gisik-gate.lock 2>/dev/null; do p=$(cat /tmp/gisik-gate.lock/pid 2>/dev/null);
  [ -n "$p" ] && ! kill -0 $p 2>/dev/null && rm -rf /tmp/gisik-gate.lock; sleep 15; done; echo $$ >
  /tmp/gisik-gate.lock/pid; trap 'rm -rf /tmp/gisik-gate.lock' EXIT` — `mkdir` is atomic, the PID file
  makes it stale-safe, the trap releases it.
- Full gates run `pnpm turbo run build test typecheck --force --concurrency=2`.
- Non-server package tests (`domain`, `app-core`, `sync-client`, `ui`, `editor`, `web`) may run unlocked
  with `--maxWorkers=2`.
- **Never pipe a test run** (the hook refuses `| head`; the rule is broader — redirect to a file).
- Test databases are `gisik_test_<uuid>` per run (verified `test/helpers/db.ts:32`), so lanes share the
  one Postgres on 54329 safely under the lock.

**The controller's own forced gate at each merge stays `--force`, uncached, node 22, chained in one call
— and takes the same lock.**

> ### ⚠ `pgrep -f vitest` NAMES THE LANE SESSIONS, NOT THE WORKERS — found by Lane E within 20 minutes of launch
> Every lane's command line embeds its brief, and the brief contains the word "vitest" (in the
> never-pipe rule). So `pgrep -f vitest` matched **all five lane sessions** (`comm=claude`) — and, when
> this controller re-measured, **also a peer's live 10-worker vitest pool.** The reap instruction in
> every brief, this file's own Method rules, `CLAUDE.md`, and the memory file — *"reap `pgrep -f vitest`
> survivors"* — resolved, today, to *"kill lanes A–E and a live gate."* **The inverse of the Sep 4 crash:
> that command left workers alive; this one kills sessions that are not workers.** Same class — a command
> that looks like it names one thing and names another.
> **Lane E's replacement was a FINDER, not a REAPER** — its "negative control returns 0 rows" was true
> for one quiet minute and false the next, because a live pool matches too. The orphan criterion is
> **ppid=1** (reparented to launchd), the crash post-mortem's own definition. **The only reap command
> from here, everywhere:**
> `ps -eo pid=,ppid=,comm=,args= | awk '$3 ~ /node$/ && $2 == 1 && index($0, "vitest") > 0 {print $1}'`
> — verified on synthetic input (node+vitest matched; a claude line containing "vitest" not; a next.js
> node not), and live (a running pool has a live parent and does not appear). **Never `pkill -f vitest`.
> Never kill `pgrep -f vitest`'s output.** Corrected in all five overrides, `CLAUDE.md` (owner-approved
> PR — outside `docs/`), and the memory file; every lane messaged and acknowledged.
> **Credit where the method earned it:** Lane E caught its own first awk (an unterminated character
> class that printed an ERROR reading exactly like a clean empty result) *only* because it ran a positive
> control. The refinement it missed — a live pool — is the "a count is only true of a tree that has stopped
> moving" lesson wearing a process-table costume.

> ### CASE-ID RANGES COLLIDE ACROSS LANES — a collision class the map did not cover, now ALLOCATED not discovered
> The map listed FILES that collide; **ID RANGES collide too, and no header can prevent it.** Two lanes
> minting from the same "NEXT FREE ID" line at the same fork point each mint the same ids, and neither
> breaks never-renumber (that rule protects LANDED ids). It is only visible at rebase. **Twice in the first
> hour:** #109 (closure 1) minted 12.156–12.159, which T11/T12 had taken and merged first — moved to
> 12.189–12.192, thirty code citations followed, and **a project-wide `sed` would have silently repointed
> Task 11's own citations in a file the change never touched, with every test green, because a comment
> does not run**; then Lane D minted exactly 12.189–12.192 against its branch's base, unaware #109 had
> landed them. **Rules:** (1) whatever is on `main` keeps its numbers; (2) **measure against
> `origin/main`, never your branch's base** — a fork point is a fact about a moment; (3) renumber the
> catalogue and every citation in ONE commit, by enumeration, never by `sed`; (4) re-run the measurement
> at rebase as the control, and if the ceiling has passed your floor, say so rather than re-pick.
> **§12 allocation as of 2026-09-06 01:35 IST** (`main` highest in use **12.192**, 152 ids; Lane A's):
> **Lane B ≤ 12.223** (12.193–12.219 + its four moved to 12.220–12.223, landing with #117) ·
> **Lane D 12.224–12.227** · **Lane C 12.228–12.239** · **Lane A 12.240+**. When #117 lands, §12's header
> must read *next free 12.240* with the reservations named, or the next reader mints from 12.224 and
> collides with D on the day D lands. Lane E mints into `test-cases/13` alone but its 18 errands cite §6,
> §7 and §12 — same rule applies to any id it adds there.

> ### Collision-map additions from the lanes' first hour — real, not hypothetical
> - **Plan 11 T6's text pins the DEV stack's Postgres to host port 54329** — *the shared TEST Postgres all
>   five lanes use.* Written verbatim it fails to bind or silently points the dev stack at the test
>   database. **Lane E uses 54330** (confirmed free) and records the deviation. Add to any dev-stack docs.
> - **Registering `@fastify/multipart` at the ROOT would silently convert `/v1/events`'s 415 into a 400
>   with `request.body` undefined** — the events door's stated contract, broken invisibly, and **no
>   existing test sends multipart to any non-attachment route**, so the suite could not have caught it.
>   Lane E's A0 wiring (`registerAttachmentRoutes`, encapsulated `app.register(fn, deps)` from a
>   synchronous `buildApp`) measured three variants (201/415 · 201/400 · 404/—) and carries the
>   cross-route case explicitly. The nested-await-then-declare shape is the one `stream/routes.ts:165-178`
>   already records as failing silently for websocket.
> - **Lane D's T17 screens consume `syncStatusLabel`, `resolveContest`, `buildReopenPair` from app-core —
>   Lane B's T13, not yet merged.** D builds everything self-contained first and renders sync/contest
>   state honestly from raw `DataSource` fields meanwhile, naming the gap rather than duplicating T13's
>   logic; rebases when T13 lands. Lane B told to export under those names or tell D directly.
> - Lane D also found `ReplicaDataSource.ingest()` **throws** `OfflineAcceptError` on any pending write,
>   where Plan 10's screens assumed fire-and-forget `void ds.ingest(...)` — an unhandled rejection on
>   every offline write if transcribed. Fixing at the screen. And Plan 7's real editor webview bridge is a
>   versioned `{bridge, kind}` protocol, not the plan's assumed `{type: 'editor-ready' | ...}` — using the
>   real one.

### LAUNCHED 2026-09-06 00:47 IST — all five lanes live, verified working, not merely rendered

| window | lane | session model | worktree · branch | verified doing |
|---|---|---|---|---|
| `gisik:1` | A | opus | `gisik-nokma-exec` · `exec/19-serving-gaps` @ `4af1426` | found the HELD pair stays unbuilt, started step 0 (the three uncommitted test files) |
| `gisik:2` | B | opus | `lanes/lane2-plan4` · `exec/20-plan10-t13-t15` | verifying domain exports vs T13's plan assumptions |
| `gisik:3` | C | sonnet | `lanes/lane3-plan7-8` · `exec/21-plan10-t16-desktop` | reading the topology (slow Sonnet start, working) |
| `gisik:4` | D | sonnet | `lanes/lane4-periphery` · `exec/22-plan10-t17-mobile` | reading controller-state |
| `gisik:5` | E | opus | `lanes/lane5-plan11` · `exec/23-plan11` | went straight to the attachment routes and `ci.yml` |

**Launcher: `gisik-nokma-lanes/start-lanes.sh`** (brief + `override-lane{A..E}.md` concatenated per lane,
`send-keys`, replaces a window at the same index; `./start-lanes.sh C E` relaunches a subset). **Relaunch
a dead lane with it, not by hand.** All four new worktrees were cut from `1e372e3` with `pnpm install
--frozen-lockfile` + `pnpm rebuild better-sqlite3` under node 22 before launch. The old lane branches
(`lane2-handover`, `exec/07-editor-client`, `exec/06a-client-core`) were left in place, detached-from,
not deleted — they are the record. The watch monitor survived (pid 23056) and logged the pane set going
`0,1` → `0,1,2,3,4,5`.

**Two facts about Lane A found at launch and written INTO its override rather than left to be
rediscovered:** (1) its branch had moved to `4af1426` — a pushed handoff in which the executor answered
**four of the five unknowns itself before the quota wall**, reaching the same APPLIES conclusion on
`restricted-parents.ts` as Ruling P31 independently — **two instruments, one answer, which is the
strongest form this file recognises**; (2) **three uncommitted test files** sat in the worktree
(`app-core/test/online/online-data-source.test.ts`, `views/reopen-flow.test.tsx`,
`views/ticket-sheet.test.tsx`, +97/−17) — the predecessor's in-progress fix for the expected red its own
gate found (21/24), pinning `getTickets`/`getTicket` as **served** rather than deleting the refusal rows.
The override's step 0 is "commit these first; never `git checkout --`". A window kill does not touch a
worktree, so nothing was lost — but a fresh session reading `main` would not have known they existed.

### RULING P33 (2026-09-06, controller as ruling tier) — "Plan 11 done" means its 16 tasks PLUS the 18 errands other plans deferred to it by name

**Lane E's seam-1 pre-flight found that Plan 11's own T1–T16 text claims almost none of the work other
plans deferred to it** — 18 errands, each with a `file:line`, invisible to a `Plan 11` grep because they
say *"the deployment errand"* or *"whoever owns the boot path."* Found by sweeping `apps/server/src` and
`packages/` for the deferral **phrasing**, not the plan name. **The owner's instruction answers the
ruling** — *"make sure every single thing is completed"* — so: **a deferral naming Plan 11 IS Plan 11's
work, and the ledger's 16 rows going `done` does not close Plan 11 until these do.** Recorded here
because the ledger cannot show them (they are not `### Task` headings), which is exactly the gap this
file exists to cover.

**Adopted into Lane E's seams — the six in seam 1 first, because they are the server's deployment
surface and Lane E owns those files alone:**
1. **CSRF: HTTP-Origin on cookie-authenticated product mutations** (standing owner ruling; Plan 4 T5
   declined it in writing and named Plan 11; **no line in `apps/server/src` reads `Origin` today**; CORS
   is not a substitute — `pm.` and `pm-api.` share a registrable domain, so `SameSite=Lax` was never
   going to protect this deployment) → T2.
2. **The shutdown path** — no SIGTERM handler, no `pool.end()`, no `app.close()`; `index.ts:124-131`
   hung the snapshot writer's stop on Fastify's `onClose` for "the day Plan 11 adds a real shutdown";
   Node as PID 1 ignores SIGTERM by default, so a rolling deploy is a hard kill without it → T5.
3. **`LogOtpSender`'s two production faults** — logs every code; accumulates every code ever issued in
   an unbounded in-process array (`coordination:2455-2460`, "Plan 11 owns the replacement") → T4.
4. **Invite-issuance rate limiting** — `check-permission.ts:321-329` and case 6.123 name Plan 11; each
   issuance mints a credential and T2's two buckets do not cover `POST /v1/invites` → T2.
5. **`WEB_ORIGIN`/`BETTER_AUTH_URL` are `z.string().url()`, which requires only a scheme** —
   `localhost:3001` parses and mints dead invitation links (case 6.124) → T1.
6. **Assert `pnpm-lock.yaml` carries no `@better-auth/cli` inside the Docker build** — in the build,
   not CI, so it cannot regress (`coordination:1791-1803`) → T5.
**Seams 2/3:** `ops:sweep-orphans` (coordination:310 — "no task, no Files entry, no steps anywhere in
Plan 11"), the `invite_tokens` sweep (6.131), `user_preferences` retention for revoked members
(coordination:5495-5502), scheduling the notification-sweep CLI, the verifier's DDL credential in
`app.yaml`, the interim-plumbing CI gate, CI wiring for `apps/web/e2e`.

**DEFERRED — to LANE F by name, not to "an owner":** the repo-wide test-cases↔test citation convention
(coordination:3749/:4108 — today no ✅ is grep-checkable and deleting a test reddens nothing). It is a
convention, not a deployment task, **and it is the worst possible collision surface while five lanes
are writing tests.** It runs in the serial end-of-run passes because the owner also said *"testing
thoroughly done."* Stream load/soak (7.35) stays 🚫.

**Two further rulings taken inline:** `/healthz`'s version — `healthz` appears **zero** times in the
6592-line coordination doc, so this is an originated disclosure decision, not an inherited one — is the
**deploy sha only**, unauthenticated (the platform's probe and an operator verifying a rollout both need
it without a session), recorded at the handler as a bounded disclosure. And **this controller's own
override was wrong**: `contact@artsourced.in` binds **T15's `app.yaml` only** (it appears once in the
plan, line 3859); every `sign-in@gisik-nokma.local` in T1–T4 is the dev default the 2026-09-02 correction
explicitly preserves, and a production domain must not enter a code default or a unit test. Lane E's
fan-out caught it; the plan was right.

### RULING P32 (2026-09-06, owner: *"use the defaults"*) — the HELD pair is UNBLOCKED; guest project visibility is membership-only

**The question P25 held for the owner** — *what does a project-scoped guest see of a workspace's other
projects?* — **is answered: nothing.** A guest is served only the projects they hold a membership in. **A
project's NAME is itself a disclosure and is not served for any other project.** The workspaces list
therefore shows a guest a *partial* workspace, and that is the correct answer, not a defect — say so in
`Features.md` and the case that pins it.

**This is an APPLICATION of an existing rule, which is what P25's condition requires** — the set is
**`EffectiveRole.projects`**, produced only by `resolveEffectiveRole` (brand-protected, P22), the same set
`canSeeResolved` already consults for project-mode tickets (`can-see.ts`: `eff.projects.has(v.projectId)`,
with **no admin bypass — deliberate**). Both mappers close against it:
- **`WorkspaceRef.projects` (`getMyWorkspaces`)** — for a guest, the list IS `eff.projects` and nothing
  else. For owner/admin/member the implementer applies the same existing role resolution; **if serving a
  non-guest's project list turns out to need a rule that does not already exist, ESCALATE before
  building** — P25's condition binds the non-guest half exactly as it bound the guest half.
- **`WorkItem.projectName` (`getMyWork`)** — a my-work item is a ticket the viewer already sees; its
  project's name is served **iff that project is in `eff.projects`**, otherwise the item carries the
  project id and no name — the existence-without-title register `routes/tickets.ts:304` already uses for
  a restricted parent. Same rule, one level up.

**The excluding fixture is the whole test** (closure 1's lesson, binding hardest on this surface): the case
that proves this is a guest on project X who must NOT receive project Y's name or id in either response —
mutate the rule to permit and confirm red. A suite built only from the allowed case cannot distinguish a
correct exclusion from no exclusion at all.

**Lane A builds this LAST in its sequence, after closure 3, and only against this ruling as recorded
here** — its override said "build only if controller-state.md records the owner's answer," and this is it.

## ⛔ BOTH SESSIONS QUOTA-BLOCKED 2026-09-06, RESET MON 2026-09-07 06:30 IST — READ BEFORE TOUCHING ANYTHING

**Executor hit its weekly limit outright** (`You've hit your weekly limit · resets Sep 7 at 6:30am`) mid-
closure-2, and **this controller session is at 99% weekly** as this is written — assume it may stop
mid-sentence. **Do not spend either session's remaining runway trying to finish closure 2 or resolve PR
#109's conflict** — both need real judgment (semantic doc content, a visibility-rule correctness call) that
a nearly-exhausted session should not gamble on. Write state, stop, resume Monday.

**CORRECTION to the executor's own last report, verified rather than trusted**: it said *"PR #107 ... open
and green and yours to merge."* **False — #107 merged 2026-09-04 10:44:55Z, and #108 (its ledger promotion)
merged 10:49:55Z, both already recorded above.** The executor's message was composed from stale local
state, not re-checked against GitHub. **Standard practice held**: verify before merging, never their word.

### Exactly where the two open threads stand

1. **PR #109 (closure 1, snapshot invalidation) — still `CONFLICTING`/`DIRTY` at `631582e`.** Conflicts in
   `docs/lanes/executor-state.md` and `test-cases/12-offline-sync-apps.md` only (both drifted after Batch C
   merged past this branch's fork point) — verified with `git merge-tree`, the actual server-side code files
   (`snapshot-writer.ts`, `ledger-deps.ts`, `snapshot-refresh.ts`, `replica.ts`) merge clean. **The executor
   never got to rebase it before the quota wall hit.** Do not resolve this doc conflict from the controller
   side — it requires reading both documents' semantic content to merge correctly, which is implementer
   judgment, not a mechanical resolution. **Resume: the executor rebases its own branch onto current
   `origin/main`, then this controller verifies + merges as normal.**
2. **`exec/19-serving-gaps` (closure 2) — WIP commit `143f279`, PUSHED, marked DO NOT MERGE.** The
   implementer died at 321k tokens / 141 tool calls with 26 modified + 3 new files, never gated, never
   reviewed. **Two of three hard constraints verified HELD by the executor before it died** (not re-verified
   here — record the executor's method so Monday's session can re-run it cheaply rather than redo it blind):
   - **Ruling P30 intact**: `data-source.ts` changed by one docblock line only, no type change, `DataSourceQuery` not widened. Re-check: `git show 143f279 -- packages/app-core/src/data-source.ts` should show a comment-only diff.
   - **Neither HELD gap touched**: a sweep of the `mappers.ts` diff for `WorkspaceRef.projects`, `WorkItem.projectName`, `HELD pending` returned nothing, against a control of 371 changed lines in that same file (so the absence is real, not a broken grep). Re-check the same way before trusting it a second time — a control from a dead session is still worth re-running once, cheaply.
   - **⛔ THE THIRD IS UNKNOWN AND IT IS THE ONE THAT MATTERS**: whether `ListRow.hasRestrictedParent` and `TicketRead.title` applied an EXISTING Plan 4 visibility rule (P25's condition) or invented a new one. A new file `apps/server/src/read/restricted-parents.ts` exists — its presence alone doesn't answer the question. **Read it against `apps/server/src/visibility/`'s actual exports before this branch is trusted with anything.** Executor's own hypothesis, explicitly flagged as unverified: `visible-events-for.ts:328` already serves an unreachable parent as `{ kind: 'restricted', id }`, so `hasRestrictedParent` is *probably* an application of the existing `canSee` machinery — but "probably" from a dead agent's plan text is not evidence. **If it invented a rule: discard and escalate, per the standing P25 condition — do not fix in place.** This is exactly the failure class that produced P19, P22, P23.
3. **Closure 3 (`StreamItem`→`ServerStreamFrame`) correctly never started.** Its two guardrails (T11 reused
   `online/stream.ts`'s pattern; neither T11 nor T12 declared a parallel frame union) hold it stable while
   waiting — verified in PR #107, already recorded above. No decay risk from the pause.

### State of the three-item priority order at the quota wall

**7 of 8 permitted Plan 10 tasks done** (T5–T12; T13 deferred by owner). Closure 1 shipped (conflicting,
unmerged). Closure 2 half-built, unreviewed, DO NOT MERGE. Closure 3 untouched by design.

### RESUME MONDAY, in this order — do not reorder, each step's safety depends on the one before it

1. Restart the executor from `dispatch-executor-serial.md` per the normal fixed-point procedure — nothing
   about this is mid-step in the ledger sense (no ledger row is `in-flight`), so this is a clean restart, not
   the mid-step override shape.
2. Executor reads `docs/lanes/executor-state.md`'s **⛔ heading** — its own account says this names five
   specific unknowns in resume order, not a general caution. Follow that order.
3. Executor rebases `exec/18-snapshot-invalidation` (PR #109) onto current `origin/main`, resolving the two
   doc conflicts by content, re-verifies both directions with positive controls per this file's own stacked-
   PR procedure. Controller re-verifies CI + gate independently, merges.
4. **Only after #109 merges**: the `restricted-parents.ts` APPLIES-vs-INVENTS question gets answered, by
   reading the code, not by inheriting the dead agent's hypothesis. If it invented a rule, the WIP commit is
   discarded (not repaired) and escalated per P25's standing condition, and closure 2 restarts clean.
5. Closure 2 resumes or restarts depending on step 4's answer. Closure 3 stays last, still the one to drop
   if quota is tight again.

### Still open, unchanged by any of this — carried forward again so it isn't lost across the reset

- **The `getMyWorkspaces`/`getMyWork` guest-visibility question** — with the owner, held, not built.
- **`WorkItem.stateName`** — an eleventh gap the executor surfaced in #109's body but did not build; not yet
  triaged into the buildable/rule-first/held buckets the other ten got.
- **Two merged-code items already with the owner**: `StreamItem`→`ServerStreamFrame`'s missing task
  allocation, and the snapshot-invalidation defect (now being fixed by closure 1, but the OWNER decision
  about who owns this class of gap going forward is separate from fixing this one instance).

## BATCH C CLOSED AS T11+T12 (PR #107) — 155/177, and the promotion was taken IN-SESSION, not delegated

**PR #107 merged (`270f0f9` → `9a5275c`)**, T13 deferred per the owner priority change. Independently
re-verified: real CI green at the exact head sha (source PR), local forced gate **24/24, 3181 tests, 0
cached**, node 22 — matches the executor's own figure exactly. Ledger **155/177 (87.6%)**, Plan 10 **12/18**.

> **⚙ THE SESSION IS OPUS NOW (owner switched the model mid-session), so trigger #2's remedy is satisfied
> IN-SESSION.** The 2026-09-04 authorization lets a *Sonnet* controller dispatch an Opus subagent for a
> ledger promotion because a Sonnet session may not take that judgment itself. An Opus controller session
> **is** the thing that authorization was routing to, so this promotion was taken directly — the same path
> steps 11–13 used before the Sonnet split existed. **Saves the delegation overhead** (~70–100k tokens per
> promotion, material at ~11 points) **and loses nothing**, because the check that matters was never the
> subagent: it is that the EXECUTOR does the work and the controller verifies it. That split is intact.
> **The evidence standard is unchanged and was met**: declared `Files:` blocks read, cross-checked against
> PR #107's actual changed-file list, ancestry (`merge-base --is-ancestor`) and PR attribution
> (`commits/9a5275c/pulls` → 107) confirmed, `check:tasks` exit read from its own line.

> ### ⚠ T12 LANDED IN A DIFFERENT PACKAGE THAN IT DECLARED, AND THE PR DID NOT SAY SO
> Declared `packages/sync-client/src/data-source/replica-data-source.ts` (+ that package's barrel and
> test). **That directory does not exist.** It landed as `packages/app-core/src/replica/
> replica-data-source.ts`, with app-core's barrel and test. **The relocation is CORRECT** — `DataSource` is
> declared in app-core, so implementing it there keeps the dependency direction **app-core → sync-client**
> instead of inverting it — but it is a *package* change, not a path tidy, and **PR #107's body explains
> T12's behaviour at length while never mentioning it**; `executor-state.md` does not either.
> **Checked before promoting, because the obvious risk here is real:** app-core gained a **runtime**
> dependency on `@gisik-nokma/sync-client`, and app-core feeds the Next.js browser bundle. **No native
> module reaches it** — `sync-client`'s runtime deps are `domain` + `rule-engine` only, `better-sqlite3` is
> a devDependency in *both* packages, and sync-client's barrel is deliberately narrow (its docblock: the
> engine "lives behind" the interface). Layering holds. Deviation is named in row 10/12's note, per the T6
> mount-site precedent.
> **The general point: a deviation big enough to change a package is big enough to state.** The PR was
> unusually rigorous about everything it *did* discuss, which is exactly what makes an unmentioned
> structural change easy to miss.

> ### THE EXECUTOR'S OWN CATCH, worth keeping: "stop before T13" ≠ "no uncommitted work"
> The instruction was to stop before T13, and T13 genuinely had not started (verified: its four declared
> files absent, `replica-data-source.ts` present as the control). **But stopping the workflow killed T12's
> last refinement round mid-write** — between a docblock and its test, leaving a citation to case 12.188
> that did not exist. The executor finished it by hand rather than reverting or shipping the dangling
> reference (wrote 12.188, mutation-proved it reddens alone, removed the probe). **A stop instruction names
> a task boundary; it says nothing about the working tree at the moment the stop lands.** Anyone issuing a
> mid-workflow stop should check `git status` as a separate condition — the two conditions are independent
> and only one of them was in the instruction.
> **Same family as the sharper form the executor reached on the one-door heuristic this round:** *find the
> pair, check both doors* invites stopping at two, and both instances this branch found were **three**, the
> third hidden by **a docblock asserting its own set was complete**. Restated properly: **enumerate every
> caller from the call graph; never trust a docblock's count of them.**

## ⛔ OWNER PRIORITY CHANGE 2026-09-04 — CLOSE THE THREE UNOWNED ITEMS BEFORE ANY FURTHER PLAN WORK

**The owner instructed this directly**, after being shown that "Plans 1–9 complete, 153/177" does not mean
the browser application works: *"lets finish this before we move on to the rest. close all 3."* **Plan 10
T13 and everything after it defers until these are closed.**

**WHY THIS CAME UP, because the measurement is the point.** Asked whether the browser app was
feature-complete, the answer measured on `main` was no, and not marginally: **six reads refuse
unconditionally.** `mapWorkspaceRefs`, `mapListView`, `mapTicketRead`, `mapSearchHits`, `mapMyWork`,
`mapAttention` are all `(_raw: unknown): never` — they throw, always. Consequences, from the shell's own
docblocks rather than inferred: the **workspaces list is the first screen after sign-in and it refuses**;
List / Calendar / Timeline tabs refuse; **New ticket is not offered at all** (*"no ticket can be created
from this page — not even at project root"*); opening a ticket refuses; my-work, the attention strip and
search refuse. What works is the surfaces that bypass `DataSource` — the authoring gateway (workflow
builder, ticket types, per Ruling P28) and the notifications gateway (inbox) — plus the **Board tab**,
which is served, plus writes. **Task completion and product completeness diverged here and nothing in the
ledger could show it**, because every one of those refusals is a task that landed exactly as declared.

### THE THREE, in dispatch order — cheapest and least-blocked first

| # | item | why this position |
|---|---|---|
| 1 | **Snapshot invalidation** — publishing a workflow version invalidates no snapshot (0 `workflowVersion` hits vs 25 `snapshot` as control, no `DELETE`; verified directly on `main`) | cheapest, pure correctness, no design question |
| 2 | **Serving gaps — BUILDABLE SUBSET ONLY** (below) | the user-visible payoff |
| 3 | **`StreamItem` → `ServerStreamFrame`** | zero user-visible benefit, priced above T11 or T12 by the executor, already protected by its two guardrails. **This is the one that drops if quota runs short** |

**Quota reality, stated rather than discovered later: ~11 points left at 89% weekly, and the three price at
roughly 9–16.** Probably not all three this week. Dropping #3 is the planned response, not a failure.

### CLOSING THESE IS RULING P25 CLAUSE 1 BEING DISCHARGED — and its condition is still live

Nearly every absent field in `mappers.ts` carries `owner: 'P25 clause 1 — HELD'`. The owner's "close all 3"
discharges the priority half of that hold. **It does not discharge P25's condition**, which still binds:
*each must be implemented by APPLYING AN EXISTING Plan 4 visibility rule; if any requires a NEW rule,
ESCALATE BEFORE BUILDING.*

- **Buildable now, no visibility decision:** `ListRow.typeRank`, `ListRow.epicId`, `ListRow.stateName`,
  `ListRow.assignedProvenance` (its own note says `read/state-provenance.ts` already ships the shape),
  `TicketRead.stateProvenance`, `TicketRead.ticket`.
- **Build only after naming the existing rule being applied:** `ListRow.hasRestrictedParent` (*"a statement
  about what this viewer may not see"*) and `TicketRead.title` (*"reading `proj_tickets` here is a
  visibility decision"*).
- **⛔ HELD — WITH THE OWNER, DO NOT BUILD: `WorkspaceRef.projects` (`getMyWorkspaces`) and
  `WorkItem.projectName` (`getMyWork`).** **P25's escalation condition has ALREADY FIRED on these** — the
  mapper's own owner line reads *"HELD pending the owner ruling, because it carries a visibility
  decision,"* and P25's text says there is **no shipped project-list read at all**, so adding one means
  *designing* what a project-scoped guest sees of a workspace's **other** projects. That is Plan 4's
  read-enforcement surface, which has produced **P19, P22 and P23 — every one a disclosure no test
  caught.** "Close all 3" is a priority instruction, not a ruling on that semantics. **Question is with the
  owner; both stay refusing until answered.**

### TWO THINGS THAT WILL OTHERWISE BE MIS-READ

- **`client-contract.test.ts` goes RED by design as each gap closes.** It names five of the six gaps
  server-side, so *"a refusal goes RED the day its route starts serving"* (P25 clause 3) — that is the
  self-expiring gap working. Update in the same change set; **the first red is not a regression.**
- **"All three closed" will NOT mean zero serving gaps.** `SearchHit.matchedIn` and the two `FilterSpec`
  absences are not P25 items (`owner: Plan 6 — the client type, not a route`), and
  `ContestedClaim.title`/`claim.serverTime` belong to **T13, which is deferred.**

**TRACKING: no ledger rows.** These are not plan tasks — same precedent as the semantic-extraction and
comment-cleanup passes, deliberately kept outside the 177 denominator rather than editing locked plan
documents. Progress lives here.

**Batch C sequencing:** T11 complete (impl+review+fix), T12 was at 2/3 agents when this landed — it
finishes, then the executor **stops before T13** and PRs T11+T12. Stopping there is free (T13 unstarted)
where killing T12 would have discarded two agents' work.

## ⛔ OWNER-SET STOP POINT — ASK BEFORE DISPATCHING PLAN 10 T14 (2026-09-04)

**The owner instructed this directly: stop at the boundary below and ASK before going further. Do not
dispatch past it on the autonomy grant — the standing auto-merge authorization does NOT cover this.**

**STOP AFTER Plan 10 T13. ASK before dispatching T14.**

Permitted without asking: finish Plan 9 (T9, T11–T15), then Plan 10 **T5, T6, T7, T9, T10, T11, T12, T13**
— the whole server-side sync surface, the replica core, and its app-core UX.

**Ask first for: T14, T15 (dual-client harness + scenarios) and T16, T17 (Tauri desktop, Expo mobile).**

**WHY THIS BOUNDARY AND NOT A ROUND NUMBER.** Quota is the binding constraint, not time. Measured
2026-09-04 at 01:15 IST: **weekly 76% used, 24 points left, reset Monday 2026-09-07 06:30 (77h out)**.
Plan 9's remainder is ~2.4M tokens (~5–7 points); Plan 10's remaining 13 tasks are ~8–9.5M
(~18–29 points, the spread depending on whether controller overhead lands in the same bucket). So roughly
**8–9 of Plan 10's 13 tasks fit this week, not 13.** At the recent 1.3–2.1 points/hour, the 24 points are
~11–18 hours of work against 77 hours to reset — **you will run out of quota, not clock.**

**The four deferred tasks are the four WORST to interrupt, which is the actual reason the line is here:**
T14/T15 need contiguous attention to get six distributed-systems scenarios honest, and T16/T17 each stand
up a **new native toolchain** (Rust/Cargo for Tauri, Expo for RN) that this repo has never built before and
that the gate cannot fully verify — no simulator, Playwright already deferred. Starting any of them with
three points left wastes the setup cost and leaves a half-built app shell on a branch.

**Estimate honesty, because the number that decides this is the soft one:** the tokens-per-quota-point
conversion is **330k–450k**, a 35% spread, and it is what separates "Plan 10 nearly fits" from "well
short." Plan the pessimistic end. There is also an unresolved question recorded below about whether the
weekly window is a hard Monday cliff or a ROLLING window — weekly was once observed dropping 62% → 1%
overnight Tue→Wed, which no Monday reset explains. If it rolls, this whole outlook improves and the stop
point should be re-derived rather than obeyed mechanically. **Re-measure before acting on it.**

> ### ⚠ RE-MEASURED 2026-09-04 ~10:40 IST, at PR #98's merge — the arithmetic above no longer holds, and it
> points the WRONG way
> **Weekly is now 87–89% used** (own status line 87%, own banner 89%), against the **76%** this section's
> "8–9 of 13 tasks fit" estimate was built on. That is **~11–13 points left**, not 24. Applying the same
> per-task cost this section already derived (~18–29 points for 13 tasks, i.e. ~1.4–2.2 points/task): **at
> 11–13 points, roughly 5–7 of Plan 10's remaining tasks fit, not 8–9** — short of reaching T13, the
> boundary this whole stop point is built around. Two tasks (T5–T7 = Batch A) already landed since the 76%
> reading, consistent with the pace this section assumed; the gap is that quota moved faster than the
> reading it was priced against, not that the per-task cost estimate was wrong.
> **Also observed, weakly relevant to the unresolved rolling-window question above:** the reset date shown
> on this session's own status line and banner is **Sep 7**, consistent with the Monday-cliff reading, not
> a rolling window. One data point, not a resolution — flagged, not treated as settled.
> **This is an owner call, not a controller one — passed up, not resolved here.** Options as of this
> reading: hold the stop point where it is (accept reaching fewer than T5–T13 in full this week), move it
> earlier than T13, or treat this as further evidence for re-deriving on a rolling-window assumption if the
> owner has direct visibility into which reset model actually applies. **Not obeyed mechanically either
> way — surfaced, per this section's own instruction.**

## STEP 14 CLOSED — Plan 9 complete at 148/177, promoted via an Opus SUBAGENT, not an owner-relaunched session

**First use of the new trigger-#2 remedy** (see the "OWNER AUTHORIZATION 2026-09-04" section below): rather
than handing back to the owner for a full Opus controller session, this Sonnet controller dispatched an
Opus **subagent** to do the promotion judgment, then independently verified and merged its output itself —
same two-party split as every other PR here, just with the judgment-supplying party now a subagent instead
of a relaunched session. Worked cleanly on the first try; kept as the template.

**What the subagent did, and how it was checked before merging, not after:**
- Read each of Plan 9's 15 tasks' own `Files:` blocks, cross-checked against PR #93's **actual** changed-file
  list (`gh pr view 93 --json files`), not the plan's claim about it. All 15 promoted `todo` → `done`, `pr`
  93, `merge_sha` `e09666c` — none refused, none guessed.
- **The catalogue-task refusal rule (07/T16's precedent) was checked explicitly for T15** ("full
  verification"), not assumed satisfied just because it's a `Files:`-present task: T1–T14's own artefacts
  are confirmed present in the *same* squash, so the precondition holds here — unlike 07/T16, 10/T18,
  11/T14 at the 2026-09-02 audit, which stayed `todo` because their precondition did NOT hold.
- **Two guarded creates deliberately excluded from citation** — `doc-text.ts` (actually landed under Plan 5,
  PR #67) and Task 8's app-core/ui scaffolding (actually landed under Plan 8, PR #85) — the
  `docToPlainText` precedent avoided a second time: crediting Plan 9 for work another plan's PR put on
  `main` first.
- **`git merge-base --is-ancestor e09666c origin/main`** confirmed, plus a direct spot-check of three cited
  artefact paths against `origin/main` content (not just existence — read the file head), plus
  `gh api .../commits/e09666c/pulls` confirming `93` is the owning PR. This controller did not adopt the
  subagent's word for any of these; each was re-run independently before merging.

> ### ⚠ NEW FINDING, the subagent's own: **CI green on a ledger-only PR verifies NOTHING about the ledger**
> `check:tasks` (`scripts/check-task-ledger.mjs`) is **not wired into `.github/workflows/ci.yml` at all** —
> `grep -rn "check:tasks\|check-task-ledger" .github/` returns empty. And PR #96's sole changed file was
> `docs/lanes/task-ledger.tsv`, entirely under `docs/`, so #89's docs-only skip fired: the `gate` job
> reported **green in 22s with every substantive step (`check:env`, the turbo build/test/typecheck) marked
> `skipped`.** So for THIS class of PR — a pure ledger assertion — "independent CI green at the exact head
> sha" is a green with nothing behind it. **The standing auto-merge criterion is insufficient here and this
> controller does not treat it as sufficient**: `check:tasks` was independently re-run in a detached scratch
> worktree at the PR's exact head sha (`8f68a886`) before merging, node 22, exit read from `$?` on its own
> line — `148/177 (83.6%)`, matching the subagent's own figure exactly. **Standing procedure from here:
> any PR whose entire diff is `docs/lanes/task-ledger.tsv` must have `check:tasks` independently re-run by
> the controller at its exact head sha before merging — CI's green cannot be read as covering it.**

> ### CARRIED, not fixed — PR #93 contains real work no Plan 9 task declares
> `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`, `apps/web/src/{providers,ticket-dates-input,
> ticket-location}.ts(x)`, `apps/web/test/project-calendar-timeline.test.tsx`, `packages/ui/src/ui.css`,
> and the `app-core/test/helpers/clock-scan.ts` + `calendar/clock-free.test.ts` pair — the calendar/timeline
> actually mounted in the web shell, plus a clock-purity sweep, neither one cited by any of the 15 rows'
> evidence (none of the 15 rows depend on it, so this doesn't put the promotion in doubt). Same direction as
> the unattributed-PR list `check:tasks` already prints, one level down — undeclared work inside an
> otherwise-declared PR rather than a whole undeclared PR. No owner assigned; noted for whoever next reviews
> Plan 9's `Features.md`/`test-cases` catalogue for completeness.

> ### CARRIED, not fixed — Plan 9's plan TEXT drifts from landed paths in 9 of its 15 tasks
> PascalCase→kebab-case filenames, co-located tests moved to `test/`, a `filters/` directory that landed as
> `preferences/`, `src/lib/` that landed as `src/`. Each verified by exported symbol (`CalendarView`,
> `TimelineView`, `InboxView`, `UnreadBadge`, `SavedFiltersMenu`, `InboxNavLink`, all present under the
> renamed files) rather than by path, so the promotion itself is sound — but **Plans 10 and 11 predate the
> same file-layout conventions Plan 9 landed under**, so whoever promotes their rows next should expect this
> same drift and verify by symbol, not by transcribing the plan's own path.

| what | value |
|---|---|
| `main` | **`e09666c`** — PR #93 (step 14, Plan 9: calendar, timeline, notification engine) merged. CI verified green at the exact head sha `5d0be1d5` (`gate` conclusion `success`) before merging, per the standing auto-merge authorization |
| executor | **restarted immediately after the merge** (fixed-point rule), fresh session confirmed reading `dispatch-executor-serial.md` → `executor-state.md` |
| last forced gate | **`e09666c`** — `GATE_EXIT=0` read from `$?` on the next line (never piped), `--force` so **0 cached**, **24/24 tasks**, **3074 tests**, 42.9s, node **v22.22.2**, zero `Unsupported engine` matches. `pnpm install --frozen-lockfile` run first (package set may have changed); `pnpm rebuild better-sqlite3` run before the gate (see trap below) |
| gate composition | domain 464 · rule-engine 282 · server 940 · app-core 1029 · web 136 · editor 178 · ui 37 · sync-client 8 = **3074** |
| `check:env` | own row, re-measured separately per standing note — **exit 0** |
| ledger | **`CHECK_EXIT=0` · 148/177 (83.6%)** · claimed 0 · in-flight 0 · todo 29 · **Plan 9 promoted 15/15 via PR #96**, independently re-verified at its exact head sha before merging (see below) |
| quota | executor's own status line: **84% weekly** (was 82% at this session's start, 76% at the last full measurement). Re-derivation of the stop point (hard-cliff vs rolling) is an owner call, passed up, not resolved here |

> ### ⚠ NEW TRAP: `nvm use 22` in one Bash tool call does NOT survive into the next — a fresh gate run
> silently reverts to node 24
> This machine's `Bash` tool does not persist shell state (env vars, `nvm`'s shell function) across
> separate tool calls, only the working directory. Running `nvm use 22` in one call, then the gate in a
> **later, separate** call, silently re-resolves `node`/`pnpm` back to whatever the default shell init
> lands on — measured here as **node v24.11.1**, even though a `node -v` run immediately after `nvm use 22`
> in the SAME call correctly printed `v22.22.2`. The gate then failed exactly as the documented
> `better-sqlite3` ABI false red describes: `sync-client#test` 4/8 failed with `NODE_MODULE_VERSION`
> mismatch, **and the `Unsupported engine` WARN was present in the log** — the loud tell this file already
> names, and it caught the false red correctly. **This is a new costume of the "install-then-gate" hole
> already documented below**, same family: the written procedure ("forced gate under node 22") is
> incomplete about *how* node 22 is selected, not merely *that* it must be. **Operative rule: `source
> ~/.nvm/nvm.sh && nvm use 22 && pnpm rebuild better-sqlite3 && <gate command>` must be ONE chained shell
> invocation, in one tool call — never split across calls and trusted to persist.**

> ### Carried forward from the executor's final pre-restart message, step 15's dispatch must include these
> **`docs/lanes/plan10-adaptation-map.md` exists, untracked on purpose, 33KB, confirmed present after the
> executor restart** (untracked files live in the worktree, not the session — verified with `git status
> --porcelain` before writing this). Its substance is good; **two of three spot-checked file paths in it
> were wrong** (cited `visibility/effective-role.ts` and `apps/server/src/ingest/ingest-result.ts`, neither
> exists) while being substantively correct — caveat is at the top of the file itself.
> Three findings the executor flagged as needing to land IN step 15's dispatch text, not just in a killed
> pane (the file's own standing rule: an obligation assigned from outside a task must be written into that
> task's own text or the next reader will not perform it):
> 1. **Plan 10 T7's own snippet calls `ingestBatch` for client-submitted offline events — an ungated door.**
>    `ingest-service.ts`'s docblock names this exact case for `POST /v1/sync`. `ClientIngest` now makes the
>    wrong call a compile error, so it is a design note, not a live hole — but `sync-service.ts` needs BOTH
>    doors (server-authored `claim.contested` append is a legitimate internal use), so the type cannot just
>    be narrowed. **T7 must decide this deliberately.**
> 2. **`EffectiveRole` is brand-protected by a non-exported symbol (Ruling P22) — the adaptation map missed
>    it.** Every safety property of `canSeeResolved` rests on the value having come from
>    `resolveEffectiveRole`. T6/T7 must not hand-build one to make a test pass.
> 3. **`buildMemoryContext` already exists for T10's local pre-check** — its docblock names Plan 10's
>    offline replica explicitly, same reducer as `proj_tickets`, "so a rule cannot answer one way in a unit
>    test and another on the server." The map missed this too.

## STEP 15 BATCH B CLOSED — PR #102 (T9, T10), quota flat at 89%, executor self-gating past this point

**PR #102 merged (`c3bf254` → `f03838d`)**, independently re-verified: real CI green (source PR, not
docs-only), local forced gate 24/24, **3148 tests**, node 22, 0 cached — matches the executor's own figure
exactly. Rebase onto `999d486` verified both directions with positive controls (the executor's own
account, not re-derived here — same rigor as its Batch A report). Ledger promotion for T9/T10 in flight via
the same Opus-subagent delegation, isolated in a scratch worktree this time (see the collision trap above)
to avoid repeating the working-directory hazard.

**Quota re-measured at merge time: 89% weekly, essentially flat from the 87–89% reading two batches ago.**
Plan 10 now **10/18 done** (T1–T10) once T9/T10 promote. **The executor is NOT auto-dispatching further** —
it is holding at Batch B and waiting for a fresh reading before T11, exactly as it said it would. T11 alone
(not T11–T13 as a batch) is its stated preference if the numbers support only partial further work. **Note
for whoever reads this next: T11–T13 do NOT need owner permission** — the stop point already covers T5–T13
without asking; only T14+ needs an explicit ask. The quota question here is practical (will a batch finish
cleanly) not one of authorization.

> ### CARRIED, confirmed directly — Batch A's snapshot writer invalidates no snapshot on a workflow-version
> publish
> Executor's claim, verified before recording: `grep -c workflowVersion apps/server/src/sync/
> snapshot-writer.ts` → **0**, control `grep -c snapshot` (same file) → **25** (the grep itself works), and
> **no `DELETE` of any kind** in the file. **Confirmed live on `main` as of `999d486` (Batch A, already
> merged and promoted `done`).** Consequence: a bootstrap tail can carry a `ticket.transitioned` into a
> workflow state a newer version dropped, and throw on replay. **Not in any T5–T13 task's own text — no
> current owner.** Not production-live (no shipping client yet), so not a rollback trigger, and the
> promoted `done` status for T5 stands (the artefact landed as declared; a discovered defect in landed code
> is a carried item, not grounds to reverse a promotion — same precedent as every other carried gap in this
> file). **Needs an owner decision the same way `StreamItem`→`ServerStreamFrame` did**: no task currently
> claims it. Raised with the owner alongside that item, not resolved here.

> ### THE HIGHEST-YIELD REVIEW HEURISTIC THIS SERIES HAS PRODUCED, per the executor — "find the pair, check
> both doors"
> **A behaviour implemented on one door of a pair, silently missing from the other.** Three appearances now:
> Batch A's contest backfill pinned on T5 and T7 by nothing on T6; `foldTicketsOntoVersion` called from
> `applyServerItem` and not `loadBootstrap`; `refoldTicket` folding a reducer with no `try/catch` where
> `buildPendingOverlay` wraps the identical call against the identical deps. **The third crosses a task
> boundary, which is exactly why per-task review cannot see it — only a whole-branch or cross-task pass
> can.** Recorded here rather than in the 3700-line coordination doc (deliberately, quota) — the executor's
> own request was to put this "at the top of every whole-branch review brief"; until it lands there, **any
> session running a whole-branch review on this repo should apply it explicitly**: for every interface with
> more than one implementer or more than one call site, check that a change to one shows up at all of them.

> ### TWO PROCESS REMEDIES ALREADY IN THIS FILE, MEASURED NOT TO WORK — amend, don't re-cite as-is
> 1. **A positive control does not catch a pattern blind to an equivalent SPELLING.** The existing "print
>    the rows" / positive-control practice (Traps section) assumes a wrong instrument and a right one
>    disagree; it does not cover an instrument that is wrong **the same way its own control is wrong**.
>    Measured: `grep -rl "process\.env\.TZ *="` returns 6 where the true count is 16, because strict
>    `noPropertyAccessFromIndexSignature` pushes call sites to `process.env['TZ']` — a control written with
>    the same regex family agrees with the wrong answer. **Amended remedy: two INDEPENDENT readings, by
>    different method, not merely a second needle in the same search family** (e.g. a regex sweep plus a
>    TypeScript AST/compiler-level check, not two regexes).
> 2. **"State the count with the command that produced it" is insufficient — it is silent about WHEN.**
>    `replica.test.ts` did exactly that, correctly, and went stale anyway because a later commit **in the
>    same PR** added a 16th file after the count was taken. **A count is only true of a tree, and a PR is
>    not a tree until it stops moving.** Amended remedy: re-measure every quoted count in the FINAL pre-PR
>    pass, not merely once, cited honestly, earlier in the branch's life. The executor applied this to
>    itself before opening #102 (two methods, agreed at 16) — the fix generalises past this one instance.

> ### RAISED WITH THE OWNER, not implemented — scope banners that assert absence go stale silently
> `Features.md`/`test-cases/` banners asserting "X is absent" have gone stale twice on this branch, once in
> a banner that had ALREADY been rewritten once to fix the first instance. **Executor's proposal: a test
> that extracts absence claims from these banners and fails when the named symbol is actually present** —
> the first proposal for this class that doesn't depend on someone remembering to check. This is tooling
> scope (a new script, likely Plan 11's), not something this controller builds. Passed to the owner as a
> structural suggestion, alongside the quota re-derivation and the two unowned-defect items above.

## STEP 15 IS THREE PRs, NOT ONE — Batch A closed, Batch B in flight

**Topology change, executor's call, reasoned rather than announced.** Step 15 (Plan 10's remaining tasks)
is shipping as three batch PRs on clean task seams (server sync surface / replica core / engine+DataSource+
UX) instead of one step-close PR, because the executor cannot read quota from its own session and judged
the errors asymmetric: split-wrongly costs one round-trip, batch-wrongly risks eight tasks on a
never-reviewed branch at full price with no gate. **Batch A (T5, T6, T7) merged as PR #98 at `999d486`** —
independently re-verified: CI green at the exact head sha (a REAL suite result, unlike a docs-only PR —
#89's skip does not apply to source changes), gate re-run locally 24/24, 3109 tests, matching the
executor's own figure exactly. **Batch B (T9 → T10) is running now on `exec/16-plan10-replica`, cut from
`32393be`.** The executor's first handoff said this sha would be orphaned by Batch A's merge — **corrected
by the executor itself, same session**: `git branch --contains` still names both local branches holding it
alive, so it orphans only once `exec/15-plan10-sync` is deleted, not at the merge. Rebase (`--onto
origin/main 32393be`) is deliberately deferred to the Batch B boundary, in a scratch worktree — not now,
because Batch B's agents are mid-flight committing to this branch and rebasing under them is how a task
gets lost. Recorded as an example of the executor catching its own overstated timing claim, the exact
class of finding this whole branch has been surfacing all session.

**Promotion**: T5/T6/T7 promoted via the same Opus-subagent delegation as step 14, merged as **PR #100**
(`0c97de4` → `c95e840`) — see the trigger-#2 authorization above. Kept per-batch rather than deferred to a
single end-of-step promotion — deferring would leave landed work invisible in the ledger across a quota
boundary that may land mid-step, the same "no ledger row citing it" failure mode the 2026-09-02 audit
already found. **Ledger now 151/177 (85.3%)**, independently re-verified (ancestry, PR attribution, three
artefact spot-checks, `check:tasks` re-run in a detached scratch worktree at the exact head sha — matched
the subagent's own figure exactly).

> ### ⚠ NEW TRAP: a subagent sharing this session's working directory can silently switch the CONTROLLER's
> own checked-out branch
> The Plan 9 (#96) and Plan 10 Batch A (#100) promotion subagents both ran in the SAME physical working
> directory as this controller session (`/Users/kiro/my_projects/gisik-nokma`), not an isolated worktree —
> `Agent`-dispatched subagents are not automatically sandboxed the way `git worktree` isolates the executor
> from the controller. On the #100 promotion, the subagent's own `git checkout -b
> docs/promote-plan10-batchA-ledger origin/main` **silently switched this controller's checked-out branch
> mid-task**, discovered only when a subsequent `gh pr create` (which defaults to the current branch) failed
> with "you must first push the current branch." **No work was lost** — a prior `git push` had already
> landed the controller's own commit on the remote before the collision, verified by reading the remote ref
> directly rather than trusting local state. **The fix used, and the one to reuse:** `gh pr create --head
> <branch> --base main` names the branch explicitly, bypassing dependence on the current local checkout, and
> `gh pr merge <n> --squash` operates entirely through the API — neither needs the working directory to be
> on the right branch. **General rule: once a subagent has been dispatched into the same working directory,
> treat every subsequent LOCAL git command in that directory as unsafe until the subagent completes** —
> prefer read-only commands (`git show origin/...`, `gh api`) or explicit `--head`/API-based forms over
> anything that depends on the current checkout.

> ### A subagent's OWN account of CI is not evidence — same lesson as an author reporting their own artefact
> The #100 promotion subagent reported *"CI at head `0c97de4`: 1 check run, `gate | completed | success` —
> a real green, not an empty list, despite the docs-only skip path."* **Checked directly and found wrong**:
> `gh api .../actions/runs/<id>/jobs` shows `check:env` and the turbo build/test/typecheck steps **both
> `skipped`** — identical to PR #96's case, not a "real green." The subagent read only the check-run's
> top-level `conclusion`, not the job's per-step breakdown. **This is exactly why the standing procedure
> (independently re-run `check:tasks` for any ledger-only PR, never rely on CI's word) exists, and it just
> paid for itself a second time** — the independent re-run still matched (151/177), so the promotion itself
> was fine, but the subagent's CLAIM about why it was safe to trust CI was false. **Corollary: an agent's
> account of its own CI status is subject to the same "worst-placed party to report" rule as its account of
> its own artefacts** — verify the check-run's STEPS, not just its top-level conclusion.

**Quota decision, changed by the executor after this controller's re-derivation was sent across**: Batch C
is **NOT auto-dispatched**. The executor will stop after Batch B's PR opens and check in with a fresh
reading before starting a three-task batch it may not be able to gate at 4–6-tasks-fit. If the numbers then
support only part of it, T11 alone (the sync engine) is a coherent unit, with T12+T13 following separately.

> ### CARRIED to the owner — `StreamItem` should be REPLACED by `ServerStreamFrame`; DEFERRED, with named
> guardrails, and Plan 10 has no task to own it
> Verified directly: `packages/app-core/src/data-source.ts:60-63`'s own docblock states the replacement is
> owed, "owner Plan 10." Swept T9–T13's own text: **zero mentions in any of them.** This controller
> initially asked the executor to fold it into Batch C; **the executor pushed back, correctly** — the
> replacement touches `data-source.ts`, `online/stream.ts`, and every subscriber, which is strictly larger
> than T11 or T12 and collides with the executor's own (unrecorded outside its scratch, referenced here as
> **P30**) ruling for T12: the replica `DataSource` is built as a structural superset of the shipped one,
> `data-source.ts` itself is NOT widened, matching the class of constraint P24/P25 already set. Taking the
> `StreamItem` replacement on inside Batch C at 11–13 points is exactly the "full price, no gate" outcome
> the batch split exists to avoid.
> **Why the deferral doesn't decay while it waits**: the executor is writing two constraints into Batch C's
> own commit (greppable from code, not only from this file) that keep the eventual replacement the same
> size it is today — T11 reuses `online/stream.ts`'s existing `WebSocketLike`-injection and lenient-parsing
> pattern rather than inventing a second WS abstraction for the same wire protocol, and T11/T12 consume the
> REAL five-kind `StreamItem`, never a parallel or truncated union declared locally in `sync-client`. Under
> those two constraints the replacement stays one type/N consumers/one seam whenever it is eventually taken.
> **OWNER: this needs a TASK Plan 10 does not currently have** — not T12 (would silently absorb a
> cross-cutting change under a task titled for something narrower), not Plan 11 (owns the boot path, not
> the wire types). Creating a task is the owner's call. Carry this to the owner framed as *"Plan 10 owns a
> decision it never allocated a task for,"* not as a routine T14-conversation item.

> ### CARRIED to the T14 owner conversation, per the executor's own request — two items
> 1. **No server identity exists in this system.** Three docblocks say a contest should attribute to "the
>    server identity"; every `actorId` ULID in that position is actually a real person's. T7 followed
>    `bootstrapWorkspace`'s precedent and attributed to the claimant instead, so `claimant_id` equals the
>    contest's own `actorId` — fan-out mis-routing becomes invisible against production data, detectable
>    only through its own fixture. Minting a system user is a product decision no plan has taken.
> 2. **`isUniqueViolation` matches only `events_pkey`** — closed for `POST /v1/sync` (T7), open for every
>    other `ingestBatch` caller.

> ### FOUR SELF-FALSIFYING COUNTS on the Batch-A branch — same shape every time, worth a named rule
> A confident sentence about coverage standing in for the argument that a change is safe. Worst: case
> 12.93 claimed a mutation "reddens seven cases"; it reddens exactly one, 974/975 green. Three of the four
> were caught only by the reviewer AFTER the implementer, not by the implementer's own check. This is the
> Traps section's **"PRINT THE ROWS, NOT THE COUNT"** rule (above) recurring in a new package. The
> executor's suggestion — name it explicitly in `docs/superpowers/plans/2026-08-20-00-series-coordination.md`
> (the "interface authority" it reads first) with these four instances as evidence — is sound and
> docs-only, but **deliberately not done this turn**: that file is ~3700 lines and quota is at 87–89%. The
> rule already binds via this file, which every executor session reads. **Pending, not forgotten** — do it
> when quota allows, not urgently.

> ### CORRECTION — `SendMessage` controller→executor DOES work now, contradicting the earlier trap entry
> The "How a controller reaches the executor" section above records `SendMessage` as HELD-then-declined on
> a permission-mode class mismatch, tmux as the only working channel. **Not true this session**: the
> executor reached this controller via a cross-session message (a different channel, `uds:` socket) and a
> reply via `SendMessage` to `gisik-nokma-exec-a2` delivered successfully (`{"success":true}`, confirmed —
> not merely sent). **Do not delete the tmux fallback** — the mismatch condition that caused the original
> failure may still exist under some permission-mode combination this session didn't hit; recorded as "now
> observed working," not as "the old finding was wrong." If `SendMessage` fails again, fall back to tmux
> per the original section rather than assuming the tool is broken outright.

## RULING P29 (2026-09-03, owner-approved) — the frozen errand-with-waits template keeps its two advisories

**Escalated by the executor at step 13's close** (`exec/13-plan8-workflow-builder`, PR #85 already open,
non-blocking — step 14 was not waiting on it). Owner explicitly asked for the consequences of the accepted
option before ruling, so they are recorded alongside it.

**THE TENSION.** `ERRAND_WITH_WAITS_TEMPLATE` — the real Convenience Corner shop's workflow, imported by
identity for Plan 11's dogfooding, never re-declared — trips the `rule-bypassable` advisory **twice** once
Plan 8's Task 8 covers that code (Ruling P28's FYI item 3). Two paths, both genuinely blocked:
- **Fixing the template** violates Plan 11's `checkErrandTemplate` oracle, which pins this exact shape as
  the ground truth for dogfooding fidelity.
- **Silencing the check** means editing `adviseWorkflowDef` — the exact module Plan 2's F5 ruling built to
  catch this class of issue, for every workflow, not just this one.

**RULING: Option 3 — accept both trips as known and expected. Touch neither `checkErrandTemplate` nor
`adviseWorkflowDef`.**

**Why, in order of weight:**
1. **`rule-bypassable` is advisory-only, never blocking** — Task 8's own title separates the "issues" tier
   (blocks publish) from the "advisory" tier (does not). This costs nothing functionally; the workflow
   works regardless.
2. **It is the philosophically consistent answer for THIS product specifically.** Plan 11 Task 8's own
   framing is *"frozen record in, events out, nothing invented."* The template exists to digitize the real
   shop's actual workflow, warts included. Sanitizing it to clear an advisory panel would mean **inventing
   a cleaner reality than the one being recorded** — the exact thing "nothing invented" forbids, and a
   direct contradiction of the product's own founding principle (a board that cannot lie).
3. **Scoped, not a precedent.** The acceptance names this one frozen, identity-imported template
   specifically — it does not weaken `rule-bypassable` for any workflow a real user authors fresh.

**Cost, stated honestly:** whoever opens the Workflow Builder on this workflow sees two advisories that
never auto-clear on the frozen template/gallery entry. Mitigated if — **to be confirmed by the
executor** — the dogfooding seed creates an independently-editable live `WorkflowDef` row rather than
re-deriving from the frozen constant each time, in which case the shop's own admin can fix their live copy
through the builder UI without touching the template or the oracle at all, and the permanent cost shrinks
to "the gallery/seed source stays as originally captured," not "every real user is stuck."

**Action required, not a code change:** a one-line rationale near the template's declaration (and in
`Features.md`/`test-cases` if there's a natural home) stating the two advisories are expected and why, so
a future session doesn't mistake them for a bug and try to "fix" the frozen template.

## RULING P28 (2026-09-03, owner-approved) — Plan 8's gateway adapter calls HTTP directly for 4 operations

**Escalated by the executor mid-step-13** (`exec/13-plan8-workflow-builder`, Batch A running, no PR yet),
via cross-session message — non-blocking, the executor had a conservative default and kept working while
this was pending.

**THE FINDING.** Amendment 10 says `apps/web` implements `WorkflowAuthoringGateway` "over Plan 6's
`DataSource`." Measured against `packages/app-core/src/data-source.ts:125-139`: **four of the gateway's
eight operations have no `DataSourceQuery` member at all** — `listWorkflows`, `getStateOccupancy`,
`getTypeWorkflowPopulation`, `migrateTypeToWorkflow`. All four have a **live, registered** server route
(`routes/builder-reads.ts`, `registerBuilderReadRoutes` at `app.ts:253`). **This is the inverse of the
series' usual failure** — the server is ahead, and the client-side seam is missing, not the other way round.

**RULING: Option (b) — the gateway ADAPTER calls those four directly over HTTP, bypassing `DataSource`.**
Amendment 10's "no HTTP in views" rule binds **views**, not the adapter that implements the gateway — the
view still only ever sees the `WorkflowAuthoringGateway` interface, unchanged. Narrowest change: touches no
other plan's file, and does not force Plan 10's not-yet-built offline replica to invent an answer for
"what does migrating a ticket type mean with no network" before that plan exists.

**Rejected:**
- **(a) Widen `DataSource` itself** with the four members. More architecturally uniform long-term, but a
  cross-plan touch to Plan 6's already-shipped file, and it widens an interface **every** `DataSource`
  implementor must satisfy — including Plan 10's, which has no offline story for a migration or an
  occupancy count and would be forced to invent one under time pressure from an unrelated plan.
- **(c) Defer the four operations** with an honest refusal, same shape as the `ServingGapError` pattern
  used elsewhere in this series. Rejected because **three of the four are load-bearing for Tasks 9 and 11,
  in this same plan** — unlike prior deferrals (P25), which parked things genuinely out of scope, this
  would break in-plan work rather than defer future work.

**Also folded in, same T13 scope, no separate ruling needed:** reconcile `getMembers`'s `Actor[]` against
the gateway's wanted `WorkspaceMember[]`.

**Two things flagged alongside this, neither needing a ruling:**
- **The coordination doc carries a false "Done" claim about Plan 8's divergence-notice component**
  (line 216), phrased as if verified against the code and naming five artefacts — `git log --all --
  packages/app-core/src/workflow-builder` is **empty** (positive control: the same command on
  `app-core/src/views` finds commits), and a repo-wide sweep for `WorkflowRebindDialog`, `rankImplications`,
  `migrateTypeToWorkflow`, `TicketTypeEditorScreen`, and the two named button labels returns **zero** files
  (controls in the same run: `transitionOptions` and `adviseWorkflowDef` each return 6). **The dangerous
  part is the vocabulary, not the falsehood alone** — "verified against the code" plus five named artefacts
  reads as already-checked, which is exactly what makes a reader skip the task it describes as done.
  Executor is building Task 11 in full as if the line did not exist, correcting it in the same change set
  once the real commit exists — the only honest order, since "absent, and here is the commit that supplies
  it" cannot be written before that commit does.
- **Plan 8's text predates the F5 amendment**: `rule-bypassable` appears 0 times in the plan against
  `rdu-bypassable`'s 17, while `adviseWorkflowDef` ships both. Conservative default taken: cover both codes
  in T8, correct the one dictated `Features.md` sentence in T15, domain untouched.

## RULING P27 (2026-09-02/03, owner-approved) — F5 recurrence in `packages/app-core`: fix now in step 12

**Escalated by the executor mid-step-12** (`exec/12-plan7-remainder`, T16 running, no PR open yet), via a
direct cross-session message to this controller — not tmux, a different channel, and it worked. Recorded
here immediately because a ruling that lives only in a message or a pane does not survive either session's
restart (P26's own history, twice now).

**THE FINDING, proven by execution, not merely read.** `packages/app-core` held two answers to the
wildcard-vs-exact transition-rule question, and the wrong one was on the user-facing surface:

- `packages/rule-engine/src/transition.ts:91-93` (the ENGINE, authoritative) and
  `packages/app-core/src/precheck.ts:375-378` (`needsMembership`) both do `find(exact) ?? find('*')` —
  **exact wins, declaration order irrelevant.**
- `packages/app-core/src/views/transition-dialog.tsx:23-29` (`transitionOptions`) iterates
  `def.transitions` in order and keeps the **first match** — **first DECLARATION wins. Wrong.**

Proven with a temporary probe (removed, tree verified clean via `git status`, not shell `diff`): a workflow
def declaring the wildcard *before* the specific edge is a shape `adviseWorkflowDef` only warns about
("real, but not fatal"), so it publishes clean. Under it, the ENGINE resolves `(doing→done)` to
`[{kind:'require-evidence'}]` while the DIALOG resolves the same transition to `[]` — no evidence prompt
shown. **Positive control**: reversing the two declarations makes the dialog agree, which is what makes
this a genuine divergence rather than a constant. **User-visible consequence**: the ticket sheet offers a
transition with no evidence prompt, the user submits, the server refuses — reads as a product bug, not a
rule, which is the exact failure mode T13's own dispatch named as the thing to avoid.

**Why it needed a ruling rather than a silent fix**: it is a 2-line change in a package that shipped under
Plan 6 (closed at step 11), so fixing it is a scope decision, not a task detail. The reviewer's first
instinct was to record the owner as "the Plan 6/6a lane" — **the second time this branch has found a
recorded owner naming a plan that no longer exists** (the first was the `AttachmentListEntry` false
positive, corrected in the same branch). Assigning it to another dead owner would repeat the mistake the
branch keeps independently finding.

**RULING: Option (a) — fix it now, in step 12.** Match `precheck.ts`'s exact-match-wins resolution exactly
in `transitionOptions`; promote the removed probe to a **permanent** regression test in `app-core`, both
directions (wildcard-before-exact and exact-before-wildcard), so the positive control that makes this a
divergence rather than a constant stays in the suite. Recorded in the step-12 PR body as a ruling-directed
addition outside T13–T16's original scope, same shape as every other named deviation this branch has
carried. Rejected: (b) assign to Plan 8 (workflow-def semantics owner, unrun) and (c) assign to Plan 11
hardening — both park a live, proven, user-visible defect for a plan that has not started, when the fix is
cheap and the correct pattern already exists twice in the same package.

**General form, worth keeping alongside the `getBoard`/version-field lesson**: `adviseWorkflowDef`'s
wildcard-before-exact warning is real but non-fatal, which is exactly the gap that let two consumers of the
same `WorkflowDef` disagree for as long as nobody executed the shape it warns about rather than merely
reading past the warning.

## OWNER CORRECTION 2026-09-02 — magic-link sender is `contact@artsourced.in`, not `sign-in@artsourced.in`

Plan 11's Open question 13 and the coordination doc's sign-off table (line 86) both recorded
`sign-in@artsourced.in` as the owner's 2026-08-20 confirmation. **The owner corrected the local-part to
`contact@artsourced.in` on 2026-09-02** — the apex-address reasoning (sender reputation and deliverability
stay with the established zone) is unchanged, only the mailbox name. Both plan documents and
`deploy/do/app.yaml`'s `MAGIC_LINK_FROM` value are corrected in place (this PR); dev/CI's
`sign-in@gisik-nokma.local` is untouched — it never leaves Mailpit. **No code has executed against the old
value** — Plan 11 is 0/16 `done`, so this is a plan-text correction, not a rollback.

## Anchors — re-measured 2026-09-04 ~01:20 IST, at `d3e0889`

| what | value |
|---|---|
| `main` | **`d3e0889`** — step 13 merged at `9b70ab9`; four more have landed since: **#88** (P29's rationale), **#89** (CI optimisation, below), **#90** (the access.test.tsx race fix), plus #91 |
| step 14 | **IN FLIGHT on `exec/14-plan9-calendar`** — Plan 9, T1–T8 + T10 committed (9 of 15), T9 and T10's fix round running. **No PR yet.** Named by BRANCH deliberately; its head sha moves every few minutes |
| ledger | **`CHECK_EXIT=0` · 133/177 (75.1%)** · claimed 0 · in-flight 0 · todo 44 · Plans 1–8 all complete |
| executor's own gate | 2,594 tests at Batch A close, its figure, on its branch — **not re-verified by me**, and it is not `main`'s number |
| quota | **76% weekly at 2026-09-04 01:15 IST**, reset Monday 06:30. See the STOP POINT section at the top of this file — it is an owner instruction, not a suggestion |

> ### ⚙ THE CI MACHINERY CHANGED ON 2026-09-04 — #89, owner-directed. A successor MUST know this.
> **`turbo.json` no longer sets `"cache": false` on `test`/`typecheck`, and `.turbo` is persisted between
> runs via `actions/cache`.** Measured effect on the very next code PR (#90): turbo step **5m18s → 1m44s**,
> **18 of 24 tasks cached**, total job 5m45s → 2m27s. Correctness proven by paired control before it
> landed: unchanged tree → 20/20 cached (17ms, FULL TURBO); one line touched in `packages/domain` → domain
> **and all six dependents** re-ran, only dependency-free `ui` stayed cached.
> **THE SAFETY PROPERTY, do not lose it: the controller's own forced gate runs `--force` and never consults
> this cache.** A CI cache hit means "this exact input hash already passed"; the merge decision still rests
> on an uncached run. Keep running the pre-merge gate with `--force`.
> **`ci.yml` also skips the suite for docs-only PRs** — the job still runs and still reports `gate` green so
> the auto-merge precondition has a check to read, but its log says green means "nothing outside `docs/`
> changed", NOT "the suite passed". Only `docs/**` is inert; `Features.md` and `test-cases/**` still run the
> full gate. An **empty** changed-file list runs everything, because during development a wrong base made a
> real 82-file change report zero files — an empty list is "learned nothing", not "docs only".
> **Plan 11 T14 still owns the six-job split and sharding the server suite** (270s, the critical path);
> `ci.yml`'s comments say so, so T14 extends this rather than reverting it.

> ### THE FLAKE THAT COST A ROUND, and the shape of the evidence that settled it (#90)
> `access.test.tsx` failed one case in CI while 686 others passed — it awaited an unrelated element then
> called **synchronous `getByTestId`** for a React Flow EDGE label, which is painted later. **Neither green
> run was the evidence**: it had passed 17 consecutive local runs, and a re-run of the identical commit
> also passed. What settled it was a probe measuring the DOM at the awaited instant — the edge was absent
> **1 observation in 16**, on the first attempt of a cold run. The fix (8 sites → `await findByTestId`) was
> then verified by a **deterministic** paired control, not repetition: synchronously after `render()` the
> edge is absent 16/16, so at that instant `getByTestId` must throw and `findByTestId` must succeed.
> **The executor proposed making the probe's assertion a permanent pin; that was refused — it asserts the
> race IS happening, so it would fail ~15 runs in 16.** A probe and a pin are different artifacts.

## ~~Anchors — 2026-09-03 ~16:35 IST, at `9b70ab9` (step 13 merged)~~ superseded, kept for the gate figures

| what | value |
|---|---|
| `main` | **`9b70ab9`** — **STEP 13 (Plan 8, all 15 tasks) MERGED, PR #85.** Ruling P28 (gateway adapter HTTP-bypass) and Ruling P29 (frozen-template advisory acceptance) both apply to this step |
| last forced gate | **`9b70ab9`** — `GATE_EXIT=0` read from `$?`, `--force` so **0 cached**, **24/24 tasks**, **2463 tests**, 52.5s, node **v22.22.2**, zero `Unsupported engine` — install-then-gate, `check:env` run as its own step first and confirmed `exit 0` before the turbo gate |
| gate composition | domain 335 · rule-engine 280 · server 857 · **app-core 687 (was 474)** · **web 87 (was 69)** · editor 178 · ui 31 · sync-client 8 = **2463** |
| corroboration | independently re-measured, not carried from the executor's report — matched the executor's own 2463 exactly, same split |
| ledger | **`CHECK_EXIT=0` · 133/177 (75.1%)** · claimed 0 · in-flight 0 · todo 44 · Plan 8 now 15/15 |
| executor | restarted immediately after the merge (fixed-point rule), context reset to ~7%. Next: **step 14 (Plan 9, calendar & notifications)** |

> ### PR #85's FIRST CI RUN WAS GENUINELY RED, AND THE EXECUTOR'S OWN REPORT SAID GREEN
> Independent CI at the exact head sha (`b6e7ea4`) failed at `check:env` — Task 14's new Playwright spec
> reads four env vars (`E2E_ADMIN_STORAGE_STATE`, `E2E_BASE_URL`, `E2E_MEMBER_STORAGE_STATE`,
> `E2E_WORKSPACE_ID`) never added to `.env.example`. The executor's gate report said exit 0. **Root cause,
> in the executor's own words: the CI gate is TWO commands** (`check:env` then the turbo build/test/typecheck
> gate), and the executor's own anchors table had carried "check:env exit 0" from branch creation, never
> re-measured after Task 14 added the reads that broke it — the fourth instance of the stale-measurement
> defect this branch has caught. **Fixed and re-verified** (pushed at `9017ebc`, PR head became `932c194`,
> independently confirmed green before merge): `check:env` now passes at 45 documented / 23 referenced.
> **Standing procedure note for this controller too: `check:env` is a separate anchors row, re-measured at
> every reported sha — the turbo composition being green is not evidence for it.**

> ### RULING P27 VERIFIED LANDED — mutation-proved, not merely claimed (carried from step 12)
> `transition-dialog.tsx`'s `transitionOptions` now matches `precheck.ts`'s exact-match-wins resolution.
> Cases 3.149–3.151 pin it in both directions; the executor reports the mutation is **site-identifying**
> (restoring the old first-declaration-wins resolution kills exactly 3.149, 1 of 20, with 3.150/3.151 still
> green) — the positive control (3.150) is what makes 3.149 a divergence test rather than proof one ordering
> happens to work.

## CARRIED FORWARD, owner Plan 11 — `registerAttachmentRoutes` is never wired into the composition root

**Found and recorded by the executor at step 12's close, not fixed** — registering routes is not Plan 7's
task text, and turning an editor plan into a deployment change is not step 12's call.

Verified with a positive control: `registerEventRoutes` resolves to a real call site at `app.ts:204`;
`registerAttachmentRoutes` appears in `src/` **only at its own definition** — nothing calls it. **The
consequence, not just the gap, is the finding**: the attachments table can never gain a row on the server
this repo actually starts, so `image-embed-gate`'s `attachment.embed-unknown` refusal branch would refuse
**every** inline image in a real deployment — correct about the rule, useless as a product. The gap itself
was already disclosed (`Features.md`, cases 9.59/9.61); the consequence was not.

**Owner: Plan 11's deployment work**, which owns the boot path and the start script. Surface this in Plan
11's dispatch — a route that exists, is tested, and is never mounted is not caught by any check this series
runs short of actually booting the server, which Plan 11 is the first plan to do.

> ### ⚠ THE FORCED-GATE PROCEDURE WAS INCOMPLETE AND IT PRODUCED A FALSE RED
> **`pnpm install --frozen-lockfile` MUST run before the gate whenever the package set may have
> changed.** Step 11 added `apps/web`, an eighth workspace package. My worktree had no
> `node_modules` for it, so the gate came back **`GATE_EXIT=1`, `Tasks: 16 successful, 24 total`,
> `Failed: @gisik-nokma/web#test`** — with `sh: vitest: command not found`, `sh: next: command not
> found`, `sh: tsc: command not found` and **`WARN Local package.json exists, but node_modules
> missing`**. After the install: **24/24, 2027 tests, exit 0.**
> **Nothing was wrong with `main`.** Same family as the `better-sqlite3` ABI false red already in this
> file — a stale worktree, not a defect. **The discriminator is the WARN line and
> `command not found`; a real failure names a test, not a missing binary.**
> **This is a hole in the written procedure, not a slip.** The loop says "forced gate under node 22"
> and never mentioned install — **a Sonnet controller following it literally would have reported
> `main` broken.** Trigger #4 sends a RED gate to Opus, so it would have escalated rather than
> mis-merged, but it would have escalated a non-event. **The procedure now reads: install, then gate.**

## STEP 13 CLOSED — Plan 8 complete, and the restart-then-verify shape caught a real red this time

82 files, +10787/−485, ~54 commits, 15/15 Plan 8 tasks. **This is the step where independently re-verifying
CI rather than trusting the executor's report actually mattered** — see the false-green box above. Gate,
ledger and test count all independently re-confirmed at `9b70ab9` before merging: 2463 tests matched
exactly, `check:tasks` and `check:env` both `exit 0`.

**Two more carried items from this step, neither fixed here:**
- **Task 14's Playwright spec is outside the gate entirely.** `turbo.json` defines no `e2e` task and
  `ci.yml` explicitly defers it as needing "a deployable stack and Playwright infra" — the spec is honest
  about what backstops it (nothing, until Plan 11 wires CI). Its env-var *reads* were still inside
  `check:env`'s reach, which is exactly what caught the gap above.
- **`registerAttachmentRoutes` is still never called** (inherited from step 12, unchanged — see below).

**Two rulings this step, both durable:** P28 (gateway adapter bypasses `DataSource` for 4 HTTP-only
operations) and P29 (the frozen errand-with-waits template keeps its two `rule-bypassable` advisories,
undocumented as of this close — the executor was asked to add the one-line rationale near the template's
declaration; **verify it landed before treating P29 as fully discharged**, since it was ruled after this
step's PR was already open).

**The ledger promotion this time arrived with rich per-task evidence already written**, unlike step 12's
placeholder-only handoff — the executor closed exactly the gap step 12's close recorded. Promotion here was
copy-and-attribute, not reconstruct-from-`Files:`-blocks.

## STEP 12 CLOSED — Plan 7 complete, and the restart-then-verify shape held under a bigger diff

81 files, +9983/−1260, 52 commits, 22/22 Plan 7 tasks. Independently verified rather than adopted: CI at
the exact head sha (`gh api …/check-runs`), a fresh `pnpm install --frozen-lockfile` + forced gate
(2232 tests, matched the executor's own count exactly), and a direct read of the merge-conflict resolution
the executor reported (`docs/lanes/task-ledger.tsv` row 06/16 — confirmed the controller's §8-refusal note
survived the rebase, not merely told so).

**Two things worth keeping from this step's own account, because they generalise:**
- **Shell `diff` reported two ledger-row versions as IDENTICAL when one was 241 characters longer** — the
  same false-identical failure this file already warns about, and it fired at the one point where believing
  it would have deleted a controller note. Caught with a Python line-compare and `cmp` (exit 1). Re-flagging
  because it keeps recurring on this machine specifically, not as a general git property.
- **The step's own defect distribution, stated because it bears on model policy**: across 18 tasks, the
  defect classes were overwhelmingly *false claims in prose* and *checks that could not fail* — in two of
  four batches, those were the ONLY classes found, and Batch A had zero implementation defects at all. The
  executor's own escalations (reviewer→opus on T10, T12, T12c, T13, T13a, T15 — beyond what the brief
  floor-listed) caught the step's most dangerous findings, including T10's byte-identity property having no
  executed mutation behind it. **Recommendation carried into Plans 8–11: escalate the reviewer wherever a
  task's point is a refusal or a disclosure, even when the brief doesn't floor-list it** — the pattern paid
  for itself twice in this step alone.

**The step-12 handoff moved the ledger to `in-flight` with placeholder notes (branch name only, no
per-task artefact), unlike step 11's rich per-task evidence.** The controller filled in the actual
artefact citations at promotion time from each task's own `Files:` block in the plan text, cross-checked
against the PR's changed-file list — same `done` definition as always, just assembled by the promoting
party this time rather than handed over pre-written. Not a defect in the handoff; recorded so a future
promotion doesn't assume the notes will always arrive populated.

## STEP 11 CLOSED — Plan 6 complete, and the executor solved a boundary I never specified

**`apps/web` is real**: Next.js 15 shell, sign-in, navigation, invite acceptance, and a Playwright
smoke **run for real (5 passed) but deliberately off the gate**. `app-core` went 130 → **471** tests.

> **THE EXECUTOR INVENTED THE RIGHT ANSWER FOR A CASE THE RULES DID NOT COVER.** It had completed 12
> tasks it could not itself mark `done` — promotion is the controller's act. Instead of leaving them
> `todo` (understating) or marking them `done` (overstepping), **it moved them to `in-flight` and wrote
> the per-task artefact evidence into each note.** So the 12 promotions arrived with their evidence
> already attached rather than reconstructed. That is the `done`/`claimed` split's logic applied one
> case further out, by the party the split exists to check. **Keep this shape.**

**T16 was promoted WITH ITS DEVIATION NAMED.** Its declared artefact `test-cases/08-web-client.md` was
**deliberately not created** — opening §8 means remapping **112+ live cross-referenced ids** against the
README's own never-renumber rule. The catalogue landed in **§3** instead (3.145–3.147 + citations +
a README correction). **The artefact rule could not decide this one**; the note carries the deviation so
the ledger does not read as if the file exists.

## RULING P25 — TAKEN 2026-09-02. Clauses 2 and 3 accepted; clause 1 CAPPED AT `getBoard`

**`getMyWorkspaces`, `getTicket`, `getTickets` do NOT enter step 12 and must not be folded into it.**

1. **They are visibility decisions, not field additions** — corrected upward from two to three by the
   executor checking rather than assuming. **`getMyWorkspaces` is not even a field addition:** there is
   **no shipped project-list read at all** (`grep -rn "proj_projects"` finds the projection, one
   existence check, and **no route that reads it**; positive control `proj_memberships` = eight
   readers). Adding it means DESIGNING a read whose first question is *what a project-scoped guest sees
   of a workspace's other projects.* That is Plan 4's read-enforcement surface — which has produced
   **P19, P22 and P23, every one a disclosure no test caught.**
2. **The executor's own confidence decided it:** *"neither has been implemented, so the assertion is a
   prediction from reading the routes, not a measurement."* A step that might be *"bigger than a step"*
   by its author's own admission is not absorbed silently.
3. **Deferring is SAFE here, which is unusual — and it was VERIFIED, not taken on the PR's word.**
   `ServingGapError`: 11 uses in `mappers.ts`, handled in four views, and `client-contract.test.ts`
   names five of the six **server-side**, so a refusal **goes RED the day its route starts serving**.
   A self-expiring gap is cheap to hold; a rotting one is not.

**CONDITION, and it is the checkable part:** each of the three must be implemented by **applying an
existing Plan 4 visibility rule.** **If any requires a NEW rule rather than an application of one,
ESCALATE BEFORE BUILDING.** Same shape as P23's condition, which fired correctly.

> **TWO LESSONS PROMOTED FROM THE EXECUTOR'S OWN POSTSCRIPT, because they generalise past their cases:**
> **"A sweep is a fact about the directories it walked."** The register misrouted `getAttention`'s fix
> because the derivation swept `routes/**` and the route lives in `sync/`. **A register that misroutes a
> fix is worse than none — it looks checked.**
> **`getBoard`'s field addition was nearly a check that could not fail.** Every fixture workflow was at
> v1, so serving the constant `1` left **all 756 server tests green**, whole-body `toEqual` included.
> **Tidy fixtures make a version field indistinguishable from a constant.**

## STEP 10 CLOSED — and the executor found the controller's ledger bug, not the other way round

**Ruling P18 discharged, and it was real.** `getEntityState('membership')` answered `null`
unconditionally, so **every role-gated `restrict-to` edge refused everyone, an owner included.** It
fails *closed*, so a functionality gap and never a bypass. It survived because the contract was **half
witnessed** — only `fixtures/harness.ts` carried a roster, so fixtures were green on the side with the
fake. **Two mutations of the new reader passed all 720 tests**: a bare `SELECT` of `proj_memberships`
(hands back a revoked person's surviving row as a role), and collapsing every non-admin to `guest`
(invisible, because a wrong role and a missing one refuse identically).

**The scoping in BOTH documents that set this step was wrong.** The six `applyCommitted` absences were
not the target — five are already closed through the real door. **The real gap was one sentence:**
*every Plan 5 read-route test seeds through `applyCommitted` and none writes through `POST /v1/events`.*

**Carried, owner Plan 6 (step 11):** `board.tsx` is a **live defect** — it dereferences
`group.workflowVersion` and `card.assignee.id`/`.name`, none of which any response contains, and
`board.tsx:94` already reads `card.assignee.name`. And **9 of 12 `DataSourceQuery` methods cannot be
implemented over the shipped routes**, three because they take no `workspaceId` and those routes answer
400 without it.

**RULING P24 — taken by the executor, standing: the SERVER's `UserPreferences` shape wins.** §6b called
the two "informationally equivalent"; the shipped schema is `.strict()`, so Plan 6's document is
**refused three ways, not renamed.** Reversible in one direction only while Plan 6 T10 is unexecuted.
This closes the §6b deadline item.

> **The final whole-branch review found six things and ALL SIX WERE IN THE EXECUTOR'S OWN PROSE, none
> in its code** — a restart surface contradicting itself, a lesson naming the wrong module in four
> places including a production docblock, and a "no coverage anywhere" claim falsified by a test that
> exists. **Prose is not exempt from the falsifiability law, and it is the part no gate runs.**

## A STRUCTURAL GRAPH EXISTS — and it is gitignored, so nothing else will tell you

Built 2026-09-02 on the owner's instruction. **`graphify-out/` is in `.gitignore` (PR #73), so it does
NOT arrive with a clone or a fetch — this section is the only durable pointer to it.** Both worktrees
have their own, which is correct: they sit on different branches, so a shared graph would describe the
wrong tree for one of them.

| | primary (`main`) | exec worktree |
|---|---|---|
| nodes / edges | **3133 / 5999** (hook, whole-repo) — was 2151/4987 code-only | 2261 / 5319 (code-only) |
| built from | `main` at `4194172`, **then rebuilt whole-repo by the hook** | `exec/11-plan6-remainder` (code-only, manual) |
| outputs | `graphify-out/GRAPH_REPORT.md`, `graph.html`, `graph.json` | same |

**A POST-COMMIT HOOK NOW REBUILDS IT — installed 2026-09-02 on the owner's instruction.**
`graphify hook install` writes `post-commit` and `post-checkout` into `.git/hooks`. **Measured before
being left in place: commit latency 0.74s, because the hook launches the rebuild in the BACKGROUND**
(log: `~/.cache/graphify-rebuild.log`). It is incremental and AST-only, so still **zero LLM tokens**.

> **⚠ `.git/hooks` IS SHARED WITH THE EXEC WORKTREE** — `git -C <exec> rev-parse --git-path hooks`
> resolves to the primary's. So the executor's commits fire it too. That is why the 0.74s was measured
> first rather than assumed; a foreground rebuild would have taxed every commit of a session that makes
> dozens per step. A `post-commit` failure cannot abort a commit, so the downside is bounded to noise.

> **⚠ AND THE HOOK'S SCOPE IS NOT THE SCOPE I BUILT.** My manual run was code-only (`apps/` +
> `packages/`) → **2151 nodes**. The hook rebuilds the **WHOLE REPO** → **3133 nodes**: 1151 `packages`,
> 1000 `apps`, plus **653 `docs`, 172 `reference` (the FROZEN upstream snapshot), 53 `test-cases`, 35
> `scripts`.** Still free — AST parses markdown structurally, no LLM — but **`reference/` is noise by
> construction** and the graph is broader and less focused than the code-only one. **Filter by
> `source_file` when querying; do not assume a node is ours.** Recorded because the numbers in any older
> note will not match what is on disk, and the mismatch is the hook, not drift.

**The merge driver that `hook install` also registers was REMOVED**, along with the `.gitattributes` it
wrote: it targets `graphify-out/graph.json`, which is **gitignored, so the driver can never fire.** Dead
config that would have sat untracked in `git status` forever.

**Rebuild is FREE and takes about a minute** — a code-only corpus (`apps/` + `packages/`) has zero docs,
so graphify skips semantic extraction entirely and runs pure AST. **0 LLM tokens, no subagents.** Scope
it to code; the 13 plan documents are 3.8 MB of prose and are what makes a full run expensive.

**HONEST LIMITS, so it is not over-trusted.** The **15 `.sql` migrations contributed NOTHING**
(`tree_sitter_sql` not installed), 84 files produced zero nodes (mostly `.json` fixtures, expected), and
with semantic extraction skipped there are **no INFERRED edges at all** — only what the AST could prove.
**It is a structural map, not a conceptual one, and an absent edge is not evidence of no relationship.**

> **THE FINDING WORTH KEEPING, because it arrived from an instrument that knows nothing about this
> project's history.** The top god nodes by edge count are **test infrastructure, not production code**:
> `TestDatabase` (61), `createTestDatabase()` (61), `testEnvelope()` (45), `makeCommitted()` (28), with
> **`applyCommitted()` at #10 with 25 edges.** Step 10 reached *"the test seam is more connected than the
> shipped door"* by reading routes. The graph reaches it by counting edges. **Two independent
> instruments, same conclusion** — which is worth more than either alone.

### The workspace CLAUDE.md is WRONG about graphify — do not act on it

`/Users/kiro/my_projects/CLAUDE.md` asserts three things that were measured false 2026-09-02:
a cross-repo graph at `my_projects/graphify-out/` (**does not exist**), a **PostToolUse hook that
auto-rebuilds** (**there is no graphify PostToolUse hook at all**), and an instruction to read
`graphify-out/GRAPH_REPORT.md` before architecture questions (there was no graph until today).

**Why nobody noticed for weeks:** the one hook that does exist is
`[ -f graphify-out/graph.json ] && echo '{...}' || true`. **With no graph it evaluates to `true` and
emits nothing** — it fails silently by construction, so its absence is indistinguishable from its
success. Same family as a `grep` filter that can only match good news. The `HISTORY:` blocks in Read
results are **claude-mem** and the `SEMANTIC:` blocks are **semble**; both work, which is exactly why the
third missing leg looked normal.

### SCHEDULED — one semantic pass over the client packages, AFTER STEP 14

**Owner-approved 2026-09-02. This is the ONLY semantic extraction planned; everything else stays AST.**

| | |
|---|---|
| **TRIGGER** | **after step 14 (Plan 9) merges** — Plans 6, 7, 8, 9 all landed, before step 15 |
| **SCOPE** | `packages/app-core` + `packages/ui` + `packages/editor` + `packages/sync-client` only |
| **COST** | ~74 files → **~4 subagents**. A full-code pass would be ~20; the plans would be ~18 |
| **NOT IN SCOPE** | the 13 plan documents (3.8 MB), `apps/server`, `reference/` |

**What it buys that AST cannot give, stated as the one thing to look for:**
`semantically_similar_to` edges — *"two functions that solve the same problem and never call each
other."* **That is this series' signature failure with a different name.** The visibility decision table
lives **once in `canSeeResolved` and once in SQL**, its own docblock names the hazard, and **Plan 5 T5
nearly wrote a third copy** — caught by an executor reading carefully, not by any instrument. AST cannot
see this class at all: there is no import, no call, no citation to extract, which is precisely why it
survives review.

**WHY AFTER STEP 14 AND NOT NOW — two reasons, both measured:**
1. **60 of the 80 remaining tasks are client-side and unwritten.** Extracting now maps a codebase about
   to double, and the duplication it hunts cannot exist before the components do.
2. **Cost lands where the bill already hurts.** The spend record has this controller at 39% of
   $1,072. One 4-agent pass at the right moment beats a 20-agent pass at the wrong one.

**Run it with `--mode deep`** — the flag exists to be aggressive with INFERRED edges and to mark
uncertain ones AMBIGUOUS rather than omitting them. For a duplicate-logic hunt a false positive costs a
minute's reading; a false negative costs the defect this pass exists to find.

**Do NOT let the post-commit hook satisfy this.** The hook is AST-only whole-repo — it keeps the
structural graph fresh and produces **zero** inferred edges. Freshness is not the same capability.

### SCHEDULED — code-comment cleanup pass, BEFORE PLAN 11 STARTS (owner request 2026-09-03)

**Goal:** cross-cutting quality pass, not a plan task — apply `CODING_STANDARDS.md`'s own rule
retroactively across shipped code. **This is a tightening pass, not a stripping pass** — see the caveat
below before anyone runs it as a blind mechanical sweep.

| | |
|---|---|
| **TRIGGER** | after Plan 10 (offline-sync-apps) merges — every application package/app (`packages/*`, `apps/server`, `apps/web`, `apps/desktop`, `apps/mobile`) is complete and stable; before Plan 11 (deployment/dogfooding) starts |
| **SCOPE** | inline code comments and docblocks across `packages/*` and `apps/*`. **NOT** the plan documents, commit messages, or this file / `executor-state.md` — those serve a different audience and function, and this series already has a separate falsifiability rule for prose. **NOT** `reference/` (frozen) |
| **NOT a ledger task** | deliberately kept outside the 177-task denominator, same reasoning as the semantic-extraction pass above — inserting it into Plan 11's numbered tasks would mean editing a locked plan document and risks the same renumbering hazard this series repeatedly guards against elsewhere |

**WHY THIS TIMING, not earlier and not at the very end:**
1. **Not now** — 60+ of the remaining tasks are client-side code that doesn't exist yet (same reason the
   semantic pass above waits). Cleaning comments now means redoing it after every later plan's new files.
2. **Not after Plan 11** — Plan 11 is deployment/dogfooding: Dockerfiles, the DO spec, seed scripts. Lower
   comment-density than the application code, and delays the actual benefit (easier review) for the whole
   rest of the series for comparatively little gain.
3. **Right before Plan 11** — every application package is done and stable by then, so one pass covers
   everything that actually accumulated the verbose-comment style this series is known for, and Plan 11's
   own new files get written directly in the cleaned convention. No second pass needed for them.

**⚠ CAUTION, because a blind pass here would do real damage.** A large share of this codebase's verbose
comments are genuinely WHY-explaining — hidden constraints, workarounds, "this test's TZ loop cannot fail
and here is why" — exactly what `CODING_STANDARDS.md` says to *keep*. Several of this series' real defects
(the TZ-invariant test, the env-gate scanner's raw-vs-stripped mismatch, the database-timezone triple
redundancy) were caught by someone reading precisely this kind of comment. **The job is tightening
legitimate rationale for readability, not deleting it** — stripping WHY-comments in the name of brevity
would remove the exact signal this series has repeatedly relied on. A blanket "shorter is better" pass is
explicitly the wrong shape.

**Exact scope left to a dedicated planning pass at trigger time, not decided here:** whether this touches
test-file comments (planted-defect docblocks are load-bearing, not decorative) and the extensive rationale
comments in shared low-level utilities (e.g. `ist-day.ts`'s "no dependencies, and that is not an accident
of style") that this series has used as documentation. Run `superpowers:writing-plans` or equivalent when
the trigger fires rather than pre-committing task-by-task now.

### The cheap scan that replaces graphifying the plans

**Do NOT graphify the 13 plan documents to hunt cross-plan contract collisions.** A targeted scan does it
better, in seconds, for zero tokens: extract every `interface`/`type` declaration per plan, normalise
away comments and ordering, and report only where the **shapes** differ — not merely where the name
recurs. Measured 2026-09-02: **55 names in 2+ plans → 45 with differing shapes → 13 spanning two
unexecuted plans → 1 live (`SavedFilter`, now Ruling P26), 2 real-but-later (Plan 7's boundary), 1 false
positive.** Filtering by shape rather than name cut the candidate list by 76%. Script:
`scratchpad/collide.py`. **Re-run it before dispatching each remaining plan.**

## READ FIRST IF YOU WERE JUST LAUNCHED — the brief you hold is stale

`gisik-nokma-lanes/dispatch-main-controller.md` describes the **parallel Wave 1** topology: four lane
sessions, each merging its own PR, and a controller that only watches for cross-lane collisions. **None
of that is true any more.** Execution is **serial**, there is **one executor**, and **you merge its
work** — it never merges its own. The brief is not being rewritten because this file is the restart
surface and correcting it here is cheaper than keeping two documents true. **Where the brief and this
file disagree, this file wins.**

## Restarting the executor MID-STEP — main's handoff is not current, and the override is what bridges it

Done 2026-09-01 at 19:30 IST, at the owner's direction, because the executor hit 85% context in the
middle of step 9 rather than at a step boundary. **The documented trigger — restart after merging its
step PR — could not fire, because there was no step PR: Plan 5 is 17 tasks and only batch A was done.**

**The precondition "handoff current on `main`" CANNOT be met mid-step, and pretending otherwise loses
the work.** `main`'s `executor-state.md` stopped at step 8. Plan 5's three commits and the whole
step-9 seam existed only on `exec/05-api-realtime`, which **did not exist on `origin` at all** until
the executor was told to push it — `git ls-remote origin refs/heads/exec/05-api-realtime` returned
empty. A relaunch before that push would have destroyed step 9 outright, and the fresh session would
have read `main`, concluded nothing was in flight, and been confidently wrong.

**The sequence that works, mid-step:**
1. **Tell the executor it is being restarted and to flush a handoff FIRST** — covering which tasks
   landed, which branch carries them, and exactly where the seam is. Then stop. No PR, no merge.
2. **Poll `git ls-remote origin refs/heads/<branch>` for the push, not the executor's TUI.** A remote
   ref appearing is a fact; a pane saying "pushed" is a claim.
3. **Read the handoff yourself before killing anything** — confirm it covers the seam, not merely that
   a push happened. This one named three commits, four files with line counts, the next task *by plan
   line number*, and the floor-list tasks. That is the bar.
4. **Relaunch with an OVERRIDE appended after the brief**, naming the branch and sha and stating that
   `main` is NOT current. Put the position in it — tasks done, next task, plan line — so the fresh
   session can *check* the handoff rather than take it on faith. Launch from a script via
   `tmux new-window -d -t gisik:1 -n exec -c <worktree> <script>`; do not try to type a multi-line
   prompt through `send-keys`.
5. **Name the CURRENT `main` sha in the override, and expect to be caught if you do not.** This
   override said `6cb631d`; #60 merged in the interval and the fresh executor's first line was
   *"main has moved: origin/main is 00cb2e0, not 6cb631d as the override states."* Harmless here, and a
   good sign about the session — but it is a stale sha in a live instruction, which is the exact defect
   this file opens by warning about.

**Result: context 85% → 7%, on branch, mid-step, nothing lost.** Cost of the whole manoeuvre was one
handoff commit.

## How a controller reaches the executor — `SendMessage` does NOT work, tmux does

Found 2026-09-01 by a successor controller whose first message was silently never delivered.

- **`SendMessage` to `gisik-nokma-exec-*` is HELD, then declined**, with
  *"the sending session's permission mode class doesn't match this session's."* The executor runs
  `--permission-mode bypassPermissions`; a controller running in **auto mode does not**, and the class
  mismatch gates every cross-session message. The executor sees an approval dialog; if nobody clicks it,
  the message is dropped and **the executor goes on believing no controller exists** — which is exactly
  what it recorded in its transcript while the message sat undelivered.
- **`ListAgents` still lists the executor as reachable.** A listing is not a delivery guarantee. **The
  only proof a message arrived is seeing the executor act on it in its pane.**
- **The channel that works is tmux**, and it is the same one `idle-nudger.py` uses:
  `tmux load-buffer -b <name> <file>` → `tmux paste-buffer -b <name> -t gisik:1` → **sleep** →
  `tmux send-keys -t gisik:1 Enter` **as a separate call**. Text and Enter in one `send-keys` are
  coalesced into a paste event in the TUI's vim INSERT mode and insert a literal newline instead of
  submitting. Confirmed working: the executor replied to a pasted ruling within one turn.
- **The durable fix is to launch the controller with `--permission-mode bypassPermissions`**, matching
  the executor. In auto mode a controller also loses `git push --force-with-lease` to the classifier,
  which is what turned a routine rebase into a new PR number below.

## Stacked PRs and squash-merge — #58 became #59, and the check that made it safe

**A PR stacked on another PR's branch goes CONFLICTING the moment the base squash-merges.** #58
(Chain B) was based on `exec/04-t8-t14-enforcement`, deliberately, because `proj_tickets` collides with
step 7's projection registry. #57 squashed to `dd7bfcf`; retargeting #58 to `main` with
`gh pr edit 58 --base main` produced `mergeable=CONFLICTING state=DIRTY`, 93 files. **This will recur on
every stacked step — expect it, do not diagnose it again.**

The repair, and the shape to reuse:
1. `git worktree add --detach <scratch> origin/<branch>` — never rebase in the primary worktree.
2. `git rebase --onto origin/main <base-PR-head-sha>` — replays only the stacked commits. 20/20 clean.
3. **Verify content identity WITH A POSITIVE CONTROL, because an empty diff is what a broken diff
   invocation also prints.** `git diff --stat <old-head> HEAD` → **empty**; the control
   `git diff --stat origin/main HEAD` → **49 files, +5975 −285**, the exact stat the closed PR reported.
   One empty and one non-empty from the same instrument is the evidence; the empty one alone is not.
4. Force-push if you can. **In auto mode you cannot** — push to a new branch, open a replacement PR that
   states what it supersedes, and close the old one with the verification in the comment. Leave the
   original branch in place: it is the record of what was gated.

## Task-level progress is now tracked — stop reconstructing it

`pnpm check:tasks` (`scripts/check-task-ledger.mjs`) reports task-level completion from
`docs/lanes/task-ledger.tsv`, one row per `### Task N:` heading across the eleven plans. **Do not
recompute a progress figure from prose again — run the gate and quote it.**

- **The denominator is derived, never typed.** 177 tasks (167 plain + 10 lettered). The earlier "167
  total" was produced by `grep -cE '^#+ *Task '`, which returns **BLANK, not 0**, for plans 08 and 11 —
  both have very long lines. The gate carries a positive control so a reader that drifts fails loudly
  instead of reporting an empty backlog as clean.
- **Two numbers, deliberately not one.** ~~`done` = a PR **naming** that exact plan+task~~ **WIDENED by
  owner ruling 2026-09-02, because the original definition promoted ZERO rows whose work had shipped:**
  `done` = **the commit that introduced the task's declared artefact to `main`**, identified from the
  task's own `Files:` block and confirmed to belong to that task's PR. `claimed` = asserted at plan or
  branch granularity only, never counted as complete — **currently 0, and see the audit section for why
  the status is kept anyway.**
  Why the widening was forced: **#3's and #4's bodies name none of their own 28 tasks.** Every
  task-shaped string in either refers to a *different plan*. The old definition was unsatisfiable by the
  very PRs it was meant to adjudicate.
- **Evidence is the commit that PUT THE ARTEFACT ON MAIN — which is the merge sha only under a squash.**
  ~~This repo squash-merges~~ — true from #51 onward, **false of #3, #4 and #13**, which were
  rebase-merged and whose recorded `mergeCommit` is the LAST commit of the replayed chain: 3 files for
  #3, 1 for #4, both documentation. Recording it passes the ancestry check while pointing at a commit
  containing none of the work. **And do not infer merge style from an ancestry count** — a rebase that
  replays commits rewrites their shas and reports 0/N exactly like a squash. Use
  `gh api repos/<o>/<r>/commits/<sha>/pulls`. Recording an unmerged implementing sha still false-REDs,
  and the ancestry check still catches it: proven by mutation with the live exec branch tip.
- **Rejected and recorded so it is not re-tried: fenced-code stripping.** It looks obviously right and it
  drops the count 177 → 166, removing the real tail headings of plans 06 and 07, which carry an **odd**
  number of ``` markers. It fails toward "more complete" while every per-plan count stays non-zero, so
  the positive control cannot see it. Rationale is in the script header.
- **The 13 rows moved to `done` on 2026-09-01 were evidenced per task, not per title.** `check:tasks`
  passing proves only that the merge sha is an ancestor of `main` — **it cannot see whether the PR names
  each task**, and that human half is the entire reason the `done`/`claimed` split exists. Marking a
  range from a PR *title* would have been a claim wearing a verification's clothes. What was actually
  run: `gh pr view 57 --json title,body -q '.title + "\n" + .body' | grep -oE '\b(T|Task )(8|9|1[0-4])\b' | sort -u`
  → **T8 T9 T10 T11 T12 T13 T14, all seven present individually**; #59's per-task evidence is the
  outcome table in the executor's own handoff, one row per T9–T14. **Do this before moving rows, and
  cite the command** — three of #57's rows read `todo` beforehand, so a title-only edit would have
  manufactured completions in the very instrument built to catch them.
- **Keep it current in the same change set as the work**, like `Features.md`. A merged PR no row cites is
  printed every run — that is the direction that catches work landing unrecorded.

## THE ENVIRONMENT IS NOT THE DECLARED ONE — read before running a gate

Found 2026-08-31 by a post-merge gate that came back RED and was **not** a code defect.

- `package.json` declares `"engines": { "node": ">=22.0.0 <23" }`. CI (`.github/workflows/ci.yml:62`)
  uses `node-version: 22`. **This machine's default `node` is v24.11.1** — outside the declared range.
- There is **no `.nvmrc`, no `.node-version`, no `.tool-versions` — and no `.npmrc`.** The last one is
  the load-bearing absence: without `engine-strict=true`, **`engines` enforces nothing.** Verified under
  v24.11.1: `pnpm exec node -v` and `pnpm run` both succeed with **no refusal and not a single warning**,
  with the same commands under 22 as the control so the silence is not a broken probe. The declared
  engine is decorative. *(Pending item below; the controller does not implement.)*
  > **CORRECTED 2026-09-01 — that sentence is half wrong, and the wrong half is the one that matters.**
  > Re-measured with v22.22.2 as the control: **`pnpm run <script>` under v24 DOES warn** —
  > `WARN Unsupported engine: wanted: {"node":">=22.0.0 <23"} (current: {"node":"v24.11.1",...})` — and
  > prints nothing of the kind under 22. Only `pnpm exec node -v` is genuinely silent, which is the half
  > the original claim generalised from. **Every gate and every CI step goes through `pnpm run`**, so the
  > signal was there the whole time, one line above output nobody reads.
  > This does not rescue anything — it still does not REFUSE, so a wrong-Node gate still goes green — but
  > "says nothing at all" is not the accurate description of the false GREEN, and the pending fix is
  > smaller than recorded: `engine-strict=true` promotes an existing warning to an error rather than
  > inventing a check. **Claim only what the probe you ran covers**: two commands were tested, they
  > disagreed, and the summary took the quieter one for both.
  > **OPERATIONAL FORM — use this, it is free:** the gate is not unguarded after all. Every gate and CI
  > step runs through `pnpm run`, so **if `WARN Unsupported engine` appears anywhere in gate output, you
  > are on the wrong Node and that run is not evidence.** Detection, not prevention — Plan 11 keeps the
  > `.nvmrc` + `engine-strict` fix — but it means a wrong-Node gate is now readable rather than silent,
  > which is a materially weaker version of the false-GREEN than this section originally recorded.
  > *(Independently re-measured by the executor with v22.22.2 as its control; both sessions agree.)*
- **So there are two failure modes, and the quiet one is worse.** The false RED is what this section was
  written from — loud, and it names itself in the error text. The false GREEN is a gate that passes on an
  unsupported Node and says nothing at all. Nobody catches that one.
- `better-sqlite3@11.10.0` is a **native** module. Its binding matches whichever Node last rebuilt it —
  ABI **127** = Node 22, ABI **137** = Node 24. Under the wrong one, `@gisik-nokma/sync-client#test`
  fails 4/8 with `NODE_MODULE_VERSION` and **looks exactly like main being red.** It is not.
- Fix: `nvm use 22 && pnpm rebuild better-sqlite3`, then gate. **The main worktree's binding is currently
  built for ABI 127 (Node 22)** — correct, and it means a gate run there under Node 24 will now false-red.
- Each worktree has its own `node_modules`, so lanes are isolated — which is the hazard: **two sessions
  can certify the same code under different Node majors and both report green.** A gate result is not
  evidence unless it names its Node.

This is the same class as the TZ finding one level up. The coordination doc says *"the environment is a
fixture, and no test on `main` varies it."* It is worse than that: the environment is not even the
**declared** fixture, and nothing in the repo makes it be.

## Role and authority

Controller of a **two-session serial topology**: this session plus one executor. The wave schedule is
superseded (see the coordination doc's serial-execution section).

- **The controller merges the executor's work.** The executor never merges its own — *that* is the check
  the two-session split exists to provide, and it is untouched.
  > ~~**and NEVER its own. Its own doc PRs go to the owner.**~~ **SUPERSEDED 2026-09-01 — and it was
  > superseded by PRACTICE before anyone wrote it down, which is why a successor found this file
  > contradicting itself.** This sentence sat ~250 lines above an anchors table recording that this
  > file's own previous two updates merged as **#60** and **#61**, controller-authored and
  > controller-merged. `dispatch-controller-serial.md` grants it explicitly (*"This includes your own
  > doc PRs"*).
  > **The replacement is a substitution, not a deletion, because the original check still has a job.**
  > What licenses a controller merging its own PR is two properties *together*:
  > **(a) it is docs-only by construction** — the controller does not implement plan tasks, so its diff
  > cannot reach a package; and **(b) independent CI green at the exact head sha.** Verify (a) the same
  > way the gate anchor is verified — `rtk proxy git diff --name-only origin/main HEAD`, read as rows.
  > **A controller PR that touches anything outside `docs/` falls back to the original rule and goes to
  > the owner.** Deleting the sentence outright would have lost that fallback.
  > *(Recording the tie-break honestly: `gh pr view 60/61 --json author,mergedBy` returns
  > `bkirosangma` for both fields, because both sessions act through the owner's single `gh`
  > credential. **That query cannot discriminate controller from owner and should not be cited as if it
  > could** — the discriminating evidence is the session record plus the brief.)*
- Auto-merge is re-granted: a PR that passed its machinery **and** an independent CI run green merges
  without a per-PR ask. `gh pr checks <n>` — **pending is not green.** Prefer
  `gh api repos/<o>/<r>/commits/<head-sha>/check-runs` — it names the conclusion at the exact sha.
- The controller does **not** implement plan tasks, and does not re-review the executor's work.
- ~~**Restart the executor at task boundaries.**~~ **WRONG — that boundary cannot meet its own
  precondition.** The precondition is *"handoff current on `main`"*, and the handoff only reaches `main`
  when the **step's PR merges**. Within a step no such moment exists: mid-step, `main`'s handoff is a full
  step behind, so a relaunched session does not know which tasks have landed or which branch carries them.

  **THE RULE: restart the executor immediately after merging its step PR, BEFORE dispatching the next
  step.** That is the only instant where every precondition holds at once — handoff just merged, nothing
  in flight, no branch name to hand over, no fan-out to interrupt. It is a fixed point in the loop, not a
  judgment call, and **it is not optional because the executor did not ask.**

  It is a kill-and-relaunch from the brief, NOT a `/clear` (user-typed, cannot be issued to another
  session). Measured cost of skipping it: three consecutive opportunities missed (#51, #52, #53), context
  7% → 54%, and the only restart that did happen was one the executor requested.

  **Note the conflict, because it is live:** the brief's "KEEP GOING / do not end a turn" rule removes the
  natural pause a restart used to occupy. The two are reconciled *only* by the step-PR trigger — chaining
  is correct WITHIN a step, and the restart happens BETWEEN steps.

## The executor

- Session `gisik-nokma-exec-*`, tmux `gisik:exec`, worktree `/Users/kiro/my_projects/gisik-nokma-exec`.
- Brief: `gisik-nokma-lanes/dispatch-executor-serial.md` — **self-sufficient by design**; policy lives
  there, position lives in `docs/lanes/executor-state.md`.
- Relaunch: `tmux kill-window -t gisik:exec` then `tmux new-window -t gisik -n exec -c <worktree>` and
  `claude --model opus --permission-mode bypassPermissions "$(cat <brief>)"`.
- **Before restarting: the executor's handoff must be current on `main` and its anchors reachable.**
  Restarting against a stale handoff destroys what the restart was meant to preserve.
- **A branch checked out in ANY worktree cannot be checked out or deleted from another.** Four failures in
  one session: three `--delete-branch`, plus `git -C <exec-worktree> checkout main`, which refuses because
  `main` is held by the primary worktree. **So the exec worktree can never sit on `main`** — leave it on
  whatever branch it holds and let the fresh session check out its own target. `exec/06a-client-core` is
  held by `gisik-nokma-lanes/lane4-periphery`; work such a branch in place.

## Position in the serial sequence

**PHASE 0 IS COMPLETE.** All three branches landed: step 1 Chain A (`6b2fc76`), step 2
`exec/06a-client-core` (`c93c910`), step 3 `exec/07-editor-client` (`a3746fb`). P17's stale plan text was
discharged in `f40a850`.

> **Reconciled, because it would otherwise fire deterministically:** the coordination doc's step-2 line
> *"at `8209397`, not at the branch tip"* is **SUPERSEDED** — T9 was reviewed and its fixes applied, and
> the branch merged at its tip.

**Steps 4, 5 and 6 are CLOSED** — `45c83eb` (#51), `40c5219` (#52), `33538be` (#53).
**The §11 envelope-origin window is CLOSED at the constructor** (`fc904f4` had closed only the client
door). **Step 7 is next: Plan 4 T8–T14**, with **T11 and T14 floor-list**.

**Three privilege/forgery defects were found and closed in Phase 1, none by a pre-existing test:** a
founding bypass that made strangers owners of workspaces they were never in; a role chain whose
unenumerated direction was *grant*; and the embedded-claim window. All three were caught by review.

**Seven gaps carried with named owners, none folded in opportunistically.** The two that bite hardest:
**P19 guest admissions (T9)** — a guest is admitted TODAY for `ticket.created`, `visibility.set`,
`workspace.renamed`, `comment.added`, and `visibility.set` in an append-only ledger cannot be walked back;
and **P22 (T8)** — `canSeeResolved` takes `EffectiveRole` **by value**, so every safety property rests on
provenance nothing enforces. TypeScript is structural, so Task 8/9/11 can each build or cache one no early
return ever emptied. **Closer, so it is not re-litigated: a branded type** carrying a unique symbol only
`resolveEffectiveRole` can produce — turning a silent grant into a compile error.

> ### ⚠ IN-FLIGHT NOW — `exec/05-api-realtime` (step 9, Plan 5, 17 tasks)
> **No PR yet, and there will not be one until the step completes** — this is the state in which the
> restart trigger cannot fire (see the mid-step section at the top). Branch is 4 commits ahead of
> `origin/main`, rebased onto it by the executor. Batch A (T1, T2, T2's fix round) is done; **T3 is
> running now.** The executor's handoff on this branch is the current one; `main`'s is a step behind.
>
> **CHECK AT MERGE TIME, not before — do not interrupt a running turn for it.** The executor is running
> a background `Workflow` (adaptation map T4–T16 + T3 implement/review). The standing ruling is **one
> fan-out per plan, hard cap 6 subagents per task**, and **batch A's fix round already ran review lenses
> on Plan 5** — so this may be Plan 5's second fan-out. It is a budget question, not a correctness one:
> read the handoff's own account when the step PR lands, and if the budget is genuinely spent, say so
> then rather than re-litigating it mid-task.
>
> ### ~~⚠ IN-FLIGHT — `exec/04-t8-t14-enforcement` (step 7)~~ **MERGED as `dd7bfcf` via #57.** Kept for the rulings below.
> **Cut from `main` at `33538be`, 7 commits, pushed.** T8, T9, T10 landed; **T11 reviewed, fix round running**;
> T12 + **T13 (BLIND — its dispatch must carry 6.52/6.53)** then T14 (floor-list) follow. Branch gate
> **1138 tests at T11's sha and still moving — the fix round will change it.** `main`'s executor handoff is a
> step behind and does not name this branch — **hand it to
> any relaunched executor.**
> **T8 closed P22**: `EffectiveRole` is branded with a module-private `unique symbol`, so a hand-built one
> fails `TS2741`. Provenance is compiler-enforced, not conventional.
>
> **T10 clean (zero findings, reviewed as the ONLY check on a task whose implementer died mid-report).
> T11 review found a CRITICAL disclosure, reported 2026-09-01; fix round dispatched, gate at T11's sha
> 21/21, 1138 tests, server 343 — will move.** The purge walk in `visible-events-for.ts` sits OUTSIDE the
> `canSee` branch and applies no role test, so an ordinary `visibility.set` or `ticket.reparented` on ANY
> ticket yields `purge:<thatTicketId>` to every member AND every guest. A guest holding only ticket S,
> after an admin re-authors unrelated ticket N's audience, syncs down `{kind:'purge', entityId:N}` — a
> positive assertion that N exists plus roughly when, since ULIDs are timestamp-ordered. Contradicts case
> **6.16**'s own asserted property and falsifies the module docblock's "the ticket list is not even
> computed" on the guest path. **6.16's correction lands in the SAME change set, not the fix follow-up.**
>
> **DO NOT FILE THIS WITH P19.** P19 (guest admissions) is unrecoverable because the wrong facts ARE
> ledger rows in an append-only store. This one is a read-path computation over correct rows: no ledger
> row is wrong, so the fix is complete and retroactive the instant it lands. Filing them together
> over-scopes the fix or under-scopes P19.
> **GENERAL FORM, worth more than the instance — when triaging any disclosure, ask whether the wrong
> thing was WRITTEN or COMPUTED.** Written means it is in the ledger: closed for the future, existing
> rows superseded but never removed, and there is something to migrate. Computed means a read path
> derived it from correct rows: fixing the path fixes every past and future read at once, and there is
> nothing to migrate. The two look identical in a review — same severity, same guest, same leaked id —
> and they have completely different remediation shapes.
>
> **RULING, stated as a condition so it does not need re-arguing:** if the fix agent derives that
> `ScopeRevokedInstruction`'s docblock already blesses the itemised whole-workspace purge by analogy to
> case 6.14's restricted-parent leak, **that outcome escalates to the controller before it is built on.**
> Not because it misreads the docblock, but because of what it becomes — a precedent that a docblock
> written for a bounded case licenses whole-set enumeration. 6.14 names one parent id to a viewer already
> holding its child; this enumerates the entire invisible set to a party with no relationship to any of
> it. Cardinality and relationship both differ, so it is a different shape, not a wider instance of the
> same one. Derived the other way, no escalation.
>
> **T11's implementer also found the PLAN TEXT carries a dead branch, and it is the sharper finding.**
> The plan opens `if (eff.workspaceRole === null) return;` and places the `membership.revoked` purge
> branch inside the loop below it — but a revocation deletes the workspace-scope row, so the revoked
> user's role IS null. The generator returns before reaching the branch written to serve exactly those
> people, and **every ticket on that device stays there forever.** Unreachable by construction, so the
> more faithfully an implementer transcribes the plan the more certainly they ship it. `ticket.reparented`
> had no test at all, found by a mutation that killed nothing. **Five purge triggers, not the three the
> executor briefed — carry the corrected count INTO T14's dispatch text**, per the standing sweep rule.
>
> ### ~~⚠ IN-FLIGHT — `exec/04-t6-t7-visibility`~~ **MERGED as `40c5219`. Kept for the rule below.**
> **Cut from `main` at `45c83eb`. T6 (`proj_visibility`) is running.** The executor's handoff on `main`
> may still read *"step 5 is next and nothing is in flight"* — that was true when written and goes stale
> the moment T6 starts, because the executor deliberately does **not** commit a docs refresh underneath a
> reviewer reading `git diff origin/main...HEAD` (the 2026-08-28 concurrent-mutation incident).
> **So: before restarting the executor, hand the new session this branch name.** Otherwise it reads
> `main`, sees step 5 unstarted, and cuts a second branch duplicating T6.
> The executor mitigated this by telling the controller in a message — which does not survive the
> CONTROLLER being restarted. **A mitigation that lives only in a conversation is not a mitigation.**
> It is recorded here because this file is the thing that survives.
T6/T7 must read membership through **`resolveEffectiveRole`**, never by joining `proj_memberships`
directly — documented in three places and **enforced by nothing**; it is T4's implementer's own
least-sure claim, so raise a ruling if T6 joins directly.

**Four gaps carried with named owners, none silently fixed:** P18 engine-context wiring (T6 or the
step-10 checkpoint) · **P19 guest admissions (T9)** — a guest is admitted TODAY for `ticket.created`,
`visibility.set`, `workspace.renamed`, `comment.added`, and `visibility.set` in an append-only ledger is
unrecoverable · a second `workspace.created` still commits (T13) · the half-founded workspace with no
repair path (T13), **already closed by T5's escalation guards — do not read it as a regression.**

**Case ids are reserved too, and I got this wrong a second time.** I ruled "cases numbered from 6.1";
Plan 4 reserves **6.1–6.42 verbatim with content assigned per id**, and 6.5–6.8 are exactly T4's and T5's
work. The executor filled those and continued at 6.43. **Same root error as the §6/§9 section mistake:
assuming sequential allocation in a scheme that allocates from a table.** Claim from the table — at every
level, sections and case ids alike.

~~**Step 4 is running: Plan 4 T4 → T5.**~~ T4 (`proj_memberships`) is committed and green; T5 widens
`SubmissionGate` — note **T5 is NOT unstarted**, `fc904f4` landed its first branch, so review its PR as a
widening, not a creation. **No rebase was needed:** `exec/04-auth-visibility` is redundant (see the
`git cherry` rule below) — the recon's "31 behind / 4 ahead, two conflicts" was accurate and its
conclusion was false.

**Catalogue, ruled 2026-08-31 — an earlier version of this line was WRONG.** It said step 4 "creates §6",
asserted from the dispatch brief without opening Plan 4. **Plan 4's explicit catalogue steps are all in
Tasks 12–14** (lines 4700/4866/4884/4922, 5131, 5260); T4 and T5 have none. But **the same-change-set rule is a series-wide
standing constraint, not Plan 4 boilerplate** — measured, it appears in **all 11 numbered plans** (01–11),
phrased differently in each. So if T12–14's steps meant "earlier tasks are exempt", the same inference
would exempt earlier tasks in *every* plan and the rule would mean nothing anywhere. A general rule stated
in eleven places governs the specific steps below it. **Ruling:
step 4's PR creates §6 and `test-cases/06-auth-visibility.md` carrying ONLY T4's and T5's own entries**;
T12–14 append theirs. Rationale: `proj_memberships` ships to `main` at this PR, so deferring leaves the
catalogue not knowing about a live projection — the drift #47 was blocked for. Waiving it would make that
block arbitrary.

### `git cherry` before you believe an ahead-count

**An ahead-count is not a work-count.** `exec/04-auth-visibility` read `31 behind / 4 ahead` with two real
`merge-tree` conflicts — and `git cherry origin/main <branch>` prints `-` for all four commits: every one
already upstream. `rev-list` measures commit identity, `merge-tree` measures a merge; **neither asks
whether the content is already upstream.** Run `git cherry` FIRST for every remaining branch.

**CONFIRMED LIVE 2026-08-31** on the first branch to test it: after #51 squash-merged,
`git cherry origin/main origin/exec/04-t4-t5-permissions` returns **`+` for all 11** already-merged
commits, and `main`'s subject ends in `(#51)`. A `+` from a branch whose PR landed with a `(#N)` suffix
means nothing.

**Asymmetry, because this repo squash-merges.** `-` is strong evidence of redundancy. `+` is NOT
conclusive: a squash collapses N commits into one and destroys the per-commit patch-ids `cherry` matches,
so `exec/03-tickets-hierarchy` reports `31/31 new` despite having merged as `6b2fc76`. A false `+` costs
work, never loses it. **Tell them apart:** a squash landing's subject ends in `(#N)` and a rebase landing's
does not — verified against both populations here. That is a GitHub UI convention, not a git property, so
it is good evidence rather than proof.

Measured: `exec/04-envelope-origin-gate` is the only genuinely inert branch (merge-tree byte-identical to
`main`). `exec/04-auth-visibility` and `exec/10-prefix` are superseded AND conflicting — **merging either
would now regress `main`**, which is a stronger statement than "redundant".

### The catalogue rule, and how I got its number wrong

`Features.md` and `test-cases/` are stated in **two** CLAUDE.md files with the follow-up excluded both
times: *"same change set, never a follow-up"*, *"any PR that touches source files and leaves `Features.md`
untouched is incomplete."* **Nothing in this repo enforces it** — not the gate, not a scoped review. It is
the controller's job to read a PR against it, and #47 arrived with a 20-file package and an untouched
catalogue, recorded "with owner, not fixed", which IS the forbidden follow-up. Blocking it was right.

**But the section number I demanded was wrong, and would have collided within the hour.** I said "§6,
next-free". **Numbering is RESERVED, not sequential** — `test-cases/README.md`: *"claim from the table
rather than renumbering"*, and the coordination doc's reconciliation decision 2 assigns **§6 →
Plan 4** (the very next task) and **Plan 7 → §9 / `09-editor-attachments`**. I had applied the *case*
rule ("next free number in the matching section") one level up to *section* numbers, where it is false.
**§6–§8 are absent from `Features.md` by design, not missing.** Claim from the table. Always.

Case ids are reserved the same way: Plan 7 T16 pins 9.1–9.34 and has not run, so the new bucket starts
at **9.35**.

### The sonnet reviewer default is CONDITIONAL, and the condition is checkable

The cost ruling's table reads *"Per-task reviewers **where the plan text is complete** | sonnet | medium"*
(line 1016; the older `| opus | high` row at 613 is superseded — do not cite it). **That precondition is
measurable, so measure it** rather than defaulting: grep the task's own line range for the
security-relevant terms it is supposed to cover, with a control term from the same range.

Measured at step 6: **Plan 10 T4's range (1300–1810) contains ZERO** `coheren` / `binds` / `embedded` /
`outer envelope` / `envelope-origin` / `§11`, against `projection` = 30 as the control. The §11 closer —
**the entire reason the task was lifted to Phase 1** — is absent from its own text. It lives in the
coordination doc and in `packages/rule-engine/src/contests.ts:36`. **Named where a reader of the
EVALUATOR would find it; absent where a reader of the TASK would.** An implementer following the plan
faithfully ships the task with the window still open.

So an opus reviewer there is **not opus-by-exception** — the sonnet row simply does not cover the case.
An exception invites re-argument every time; an unsatisfied precondition does not.

General form: **lifting a task changes when it runs, not what its text says.** And the corollary, which is
the reusable half: **when an obligation is assigned to a task from OUTSIDE that task, it must be written
INTO that task's own text — or the next reader will not perform it, and the more faithful they are to the
plan the more certainly they will miss it.** Fidelity is the failure mode, which is why no amount of care
by the implementer would have caught this.

**Standing instruction: before dispatching any remaining lifted or re-sequenced item, sweep its own range
for the thing it was moved to do**, with a control term. Cheap, and it is the only check that fires before
the work rather than after it.

## THE MACHINE WAS ASLEEP — read before diagnosing any stall

**`pmset sleep 1` on BATTERY** (AC is `0`/never). A laptop on battery idle-sleeps after **one minute**,
freezing every session, every launchd agent and every `sleep` timer, **with no error recorded anywhere**.

**Evidence, from a 120-second agent's own log:** 16 gaps of 8–47 minutes overnight. Measured cost of one
occurrence: **2.9 h and ~871K subagent tokens for zero completed agents.** A `sleep 1432` observed still
alive at 59:11 is the same signature. **This is the mechanism behind both "idle executor" incidents that
were previously attributed to session behaviour.**

**Owner keeps the laptop plugged in (2026-09-01) — AC never sleeps, so this is closed by power, not
software.** `pmset` was NOT modified; changing owner power settings is not the controller's call.

### Three watchdogs, all launchd, all verified with controls before enabling

| agent | covers | why the others cannot |
|---|---|---|
| `com.kiro.claude-limit-resumer` | quota exhaustion | matches a transcript limit-error signature (45 min) |
| `com.kiro.claude-net-resumer` | connectivity loss | different signature + reachability gate (180 s) |
| `com.kiro.claude-idle-nudger` | **a turn that just ended** | leaves **no transcript trace at all** (120 s) |

The nudger hashes the pane's content area (**status bar stripped** — it carries a live token counter, so
including it makes every pane look permanently active), and holds a **self-expiring** `caffeinate` so a
dead agent cannot pin the laptop awake. READMEs and disable steps in `~/.claude/scripts/`.

**It shipped with a bug worth remembering: it counted 4 identical *samples* and assumed they were 120 s
apart.** Across sleep gaps they were 45+ minutes apart, so both its "IDLE" detections were false — the
pane was identical because the machine was stopped. **Fixed to wall-clock, and it now treats an oversized
sweep gap as a sleep event and resets rather than counting across it.** An instrument whose meaning
depended on an unchecked assumption, shipped one hour after that rule was written down.

## Spend — measured 2026-09-01, and it indicts this role

**$1,072 across 3,785 orchestrator requests since 31 Aug, 100% `claude-opus-5`.**

- **Cache reads are 68% of it** ($725; 1.45 **billion** tokens). Output is 12%. The bill is re-sending
  history, not generating text — so context growth costs money *directly*.
- **This controller alone is $416 — 39% of everything**, 1.4× the executor it spends the day policing.
- **Subagents are NOT in that figure.** No sidechain records exist on disk (`~/.claude/projects`, 46
  files; `~/.claude/tasks`, none since 31 Aug). One *failed* fan-out was reported at 871K tokens. **Real
  spend is materially higher and is not measurable from artifacts.**

## Standing owner rulings currently in force

- **RULING P26 (2026-09-02) — `SavedFilter`'s field is `filterSpec`. Plan 9 Task 13's `spec` is
  SUPERSEDED before it is written.** *(Written here because the executor received P26 as a message and
  correctly reported it had "a number, a subject, and no text" — a ruling that lives only in a pane does
  not survive either session's restart. That is the second time in one day.)*
  - **Three spellings of one field exist.** `packages/domain/src/preferences.ts:28` → **`filterSpec`**,
    shipped, schema is `.strict()`. `packages/app-core/src/view-types.ts:183` → `filter`, shipped.
    **Plan 9 Task 13 → `spec`, not yet built, 48 mentions.**
  - **SCOPE, stated precisely because the first version of this was too wide.** The first two are **NOT
    new**: they are one of P24's "three renames", and `client-contract.test.ts:605` already pins them —
    *"the client's document is REFUSED whole — `.strict()` turns three renames into one 400."* **That
    half is closed and is not reopened here.** What is new is only Plan 9's third spelling.
  - **Plan 9 T13 is not disagreeing — it does not know.** Measured against its own text: **zero**
    mentions of `filterSpec`, **zero** of `preferencesDocSchema`, **zero** of `Plan 5`.
  - **The ruling needs no new argument:** a `.strict()` schema REFUSES a third spelling rather than
    renaming it. `filterSpec` wins; Plan 9 T13 adopts it. P24's logic, a plan P24 never looked at.
  - **Also recorded, owner step 12 (Plan 7):** `EditorSlotProps` differs (Plan 6 `doc: unknown` vs
    Plan 7 `doc: DocJson | null`) and `AttachmentListEntry` differs structurally (Plan 6 inlines the
    drive-reference fields, Plan 7 uses `& DriveReference`). **`EditorSlotUpload` was a FALSE POSITIVE**
    — identical fields, different line breaks — named so nobody re-finds it.

## QUOTA IS THE BINDING CONSTRAINT, NOT TIME — measured 2026-09-02

**Measured, not estimated:** weekly went 1% → 33% between 03:27 and 14:20, i.e. **2.94 percentage points
per hour across BOTH sessions**. 67% remaining ≈ **23 hours of work**, against **112 hours** until the
stated reset. **We exhaust the week's allowance in about a day and then idle for ~3.7 days.**

- **Step 11's pace is 48 min/task** (7 tasks in 5.6h), against Plan 5's 31. **UI work is genuinely
  slower and 60 of the 89 remaining tasks are client-side — plan against 48.**
- This weekly buys roughly **28 more tasks**. All 89 need ~3 weekly cycles; 73 (excluding Plan 11) ~2.6.
- **A CONTROLLER ESTIMATE OF "4–6 DAYS" WAS GIVEN EARLIER AND WAS WRONG.** It measured throughput and
  **ignored quota entirely.** Time was never the constraint. Correct form: 4–6 days *of permitted
  execution*, spread across ~3 weekly windows.
- **⚠ The reset semantics do not match the label.** The status line says *"resets mon 6:30am"*, but
  weekly was observed dropping **62% → 1% overnight Tue→Wed**, which no Monday reset explains. That is
  consistent with a ROLLING window. If it rolls, capacity replenishes continuously and the outlook is
  materially better than the figures above, which assume hard cliffs. **Unresolved — do not present
  either reading as settled.**

## ⚠ THE CONTROLLER LOOP RUNS ON SONNET FROM THE NEXT RESTART — owner ruling 2026-09-02

**This AMENDS the standing ruling** at coordination doc §"Lane controllers / orchestrators | Opus 5"
(owner amendment 2026-08-28). **The loop is Sonnet. Rulings escalate to Opus.**

### THE DESIGN PROBLEM, stated first because it is the whole difficulty

**A session cannot reliably detect that it is out of its depth.** Every judgment call this role got
right on 2026-09-02 had the same shape: *something passed every check and was still wrong* — a ledger
audit where **both instruments said promote and the right answer was refuse**; an escalation answered
against the nearest claim rather than the claim actually made; a graph whose numbers silently
invalidated documentation written 40 minutes earlier. **None was flagged by a tool, and a session that
could spot them by feel would not need the rule.**

**So the triggers below are SYNTACTIC. They are things a session can detect by looking, not by
judging.** Do not replace them with "escalate when it seems subtle" — that is the version that erodes.

### STOP AND HAND TO THE OWNER FOR AN OPUS SESSION when ANY of these is true

1. **A ruling is requested or needed** — the executor's PR, handoff or pane contains `escalat`,
   `ruling`, `P2x`, or an explicit open question addressed to the controller.
2. **A `task-ledger.tsv` STATUS would change** — any `todo`/`claimed` → `done`, or any demotion.
   Promotion is the single act with the worst failure mode and the least loud failure.
3. **Two documents on `main` disagree about the same fact**, or a document contradicts a measurement.
4. **The gate is RED** — but FIRST check the log has a `Tasks:` line. **No `Tasks:` line means the gate
   did not run and it is a command error, not an escalation** (this cost a false alarm on 2026-09-02).
5. **The executor's report and the controller's own measurement disagree** about any number.
6. **A controller PR would touch anything outside `docs/`** — this already goes to the owner.
7. **NO WRITTEN PROCEDURE COVERS WHAT YOU ARE ABOUT TO DO.** This is the load-bearing one, because it
   converts *"know when you are out of your depth"* — which is unreliable — into *"check whether a
   procedure exists"*, which is checkable. **Never invent a procedure. The absence of one IS the
   trigger.**

### OWNER AUTHORIZATION 2026-09-04 — trigger #2's REMEDY is amended: dispatch an Opus subagent, don't hand back

**The owner instructed this directly**, immediately after this controller correctly stopped at trigger #2
for Plan 9's promotion and reported it rather than acting: *"going forward you can spin up an opus
subagent and do the ledger promotion autonomously."* **This changes only trigger #2's remedy, not the
trigger itself** — a ledger status change still requires Opus-level judgment; it no longer requires an
owner-relaunched Opus **controller session** to supply it.

**What this licenses:** when trigger #2 fires, this (Sonnet) controller may dispatch an Opus subagent
(`Agent` tool, `model: "opus"`, a fresh general-purpose agent — not a fork, since the subagent needs no
controller-session context, only the plan document, the merged PR, and this file) to perform the
promotion: read the plan's task `Files:` blocks, cross-check each against the merged PR's actual
changed-file list (not the plan's claim about it), apply the `done`/`claimed`/`todo` vocabulary and the
**catalogue/verification-task refusal rule** exactly as documented above (`## Task-level progress is now
tracked`), edit `task-ledger.tsv`, run `pnpm check:tasks` to confirm the new counts and `exit 0`, and open
a **docs-only PR** — never merge its own. **The controller still performs the merge-side check**: docs-only
diff (`git diff --name-only origin/main HEAD`, read the rows), independent CI green at the exact head sha —
the same two-party split as every other PR in this topology, subagent or executor. **The subagent supplies
the judgment; the controller still owns the gate.**

**What this does NOT license:** the other six triggers are unchanged and still hand back to the owner. This
does not make the Sonnet controller itself competent to edit `task-ledger.tsv` directly — it still may not.
And it does not license skipping the refusal rule for catalogue/verification tasks, or inventing evidence a
subagent could not find: a row with no clean per-task artefact stays `todo` and is reported, never guessed
— the same standard the manual 2026-09-02 audit held itself to.

### THE LOOP, which Sonnet runs — every step has a written procedure and a loud failure

Verify CI at the **exact head sha** (`gh api …/commits/<sha>/check-runs`; pending is not green) · merge ·
**restart the executor** · forced gate under **node 22** with `--force`, redirect to a file, read `$?` on
the NEXT line, grep for `Unsupported engine` · re-anchor with **re-measured** values · quote
`pnpm check:tasks` with its exit code read from a redirect, **never a pipe** · dispatch the next step ·
open and merge its own **docs-only** PRs.

**Two habits that are not optional, because both were violated by an Opus session today:** re-measure
every anchor at the sha you report, and never pipe a gate — `grep`'s exit code is not the gate's.

### RELAUNCH

    claude --model sonnet --permission-mode bypassPermissions \
      "$(cat /Users/kiro/my_projects/gisik-nokma-lanes/dispatch-controller-serial.md)"

**Escalations are relaunched with `--model opus`, same brief.** The brief's header was updated to say so.

**The honest argument against, recorded so it is not lost:** today the controller was the only party
between a wrong ledger and `main`. **The mitigating fact is that the EXECUTOR caught this controller's
worst bug** — the piped exit code hiding a red ledger gate — not the other way round. The two-session
split is doing real work independent of tier, which is what makes this change safe rather than merely
cheap.

## THE CONTROLLER RESTARTS ITSELF AT THE NEXT STEP BOUNDARY — owner-instructed 2026-09-02

**The owner instructed this directly.** This role has imposed a restart on the executor at every step
boundary all day and **has never once applied it to itself** — while the spend record has it at **39% of
$1,072, 1.4× the executor it supervises**, and context growth costs money *directly* because cache reads
are 68% of the bill.

**A controller cannot restart itself** — the restart is owner-issued (`/clear`) or owner-relaunched.
**So the obligation is to make it free, and that is what this file is for.** Before the next step PR
merges, confirm: anchors re-measured at the reported sha, every ruling written HERE and not only sent,
the ledger figure quoted from `check:tasks` with the exit code read from a redirect, and the executor's
position named by BRANCH rather than by sha. All four hold as of this commit.

    claude --model opus --permission-mode bypassPermissions \
      "$(cat /Users/kiro/my_projects/gisik-nokma-lanes/dispatch-controller-serial.md)"


- **RULING P23 (2026-09-01) — the `ScopeRevokedInstruction` blessing is SCOPE-WIDE ONLY; 6.101's
  per-event extension is settled by PROBE, not by the docblock.** Raised by the executor when the
  escalation condition set for it actually fired — the fix agent derived that the docblock *does* bless
  the itemised purge and kept the behaviour on that basis.
  - **Accepted:** the guest-side fix (`!isGuest` gate). M1 reddens exactly 2, M6 reddens 6 with 6.100
    green because it is an exclusion — each side killed only by the mutation that touches it.
  - **Blessing HOLDS at the revocation boundary, and is not reopened.** The decisive source is that
    `Features.md` line 120 **had already shipped this rule**, making the guest-side behaviour a failure
    to honour an existing contract rather than the fix inventing an allowance. A fix round does not
    reopen a shipped contract.
  - **It does NOT carry the per-event subtree purge.** The argument for extending it reasons about
    **cardinality only**, and the 6.14 precedent rests on cardinality **and relationship** — 6.14 is
    tolerable because the viewer ALREADY HOLDS THE CHILD. Drop the relationship axis and 6.14 stops being
    a precedent for anything; it degrades into "small leaks are fine", which is not what it says.
    The cardinality half is itself the wrong-subject class: *"one subtree per event is smaller than the
    whole workspace at once"* compares a **per-emission** quantity against a **per-boundary** one. The
    per-event walk fires far more often and nobody has measured the integral over a sync window.
  - **THE PROBE THAT SETTLES IT — and it needs no prior-audience reconstruction, so the 6.82/6.94
    second-definition ban does not block it.** The question is not historical: *does the member-side walk
    ever emit a purge for an entity that member's replica does not hold?* Build it like the probe that
    found the original Critical — member M, ticket N in a subtree M cannot see and never held, fire the
    trigger, read M's sync-down. **`purge:N` appears** → blessing does not reach it, gate it and disclose
    the under-purge residual as a sibling of 6.102 (stale local data is the safe direction, and the guest
    side already chose it). **Never appears** → relationship holds, it IS 6.14's shape, land it and
    **record the probe as the evidence, not the docblock.**
  - **The point of ruling it this way:** a docblock written for a bounded case must not become the thing
    that licenses the unbounded one. Making the code's measured behaviour the evidence is what stops that.
  - **RESOLVED THE SAME DAY — BRANCH ONE FIRED. DO NOT RE-RUN THIS PROBE.** No new experiment was
    needed: the fix round's own shipped test already answers it. Case 6.101 seeds ticket `foreign` in a
    project the viewer was **never on**, asserts `canSee(viewer, foreign) === false` immediately before
    the trigger, and then asserts ``expect(ids).toContain(`purge:${foreign}`)``. The member-side walk
    **does** emit a purge for an entity the member's replica does not hold. **Relationship absent →
    gate it**, accept the under-purge residual, disclose it as a sibling of 6.102. Prior audience is NOT
    to be reconstructed (6.82/6.94). 6.101's comment must be rewritten to state the relationship
    reasoning: it currently argues from spec §6 for the rejected conclusion, and **a false sentence a
    maintainer reasons from is worse than a missing one.**

- **P23 DISPOSITION (2026-09-01, controller `gisik-nokma-aa`) — the executor applied the ruling as
  DELETE rather than NARROW, and that is UPHELD. Do not restore the walk.** The escalation was written
  as an open question for a successor controller because `gisik-nokma-8d` became unreachable mid-step-7;
  it is now closed and must not be reopened without new evidence.

  **What carries the disposition, in order of weight:**
  1. **The blessed emitter survives.** P23 held the `ScopeRevokedInstruction` blessing at the revocation
     boundary; that path is intact. What is gone is only the per-event subtree tombstone.
  2. **The residual is UNDER-purge — stale local retention, no disclosure.** That is the direction P23
     explicitly named ("accept the under-purge residual, disclose it as a sibling of 6.102") and the
     direction the guest side had already taken.
  3. **The narrower project-membership gate is correctly refused, and this is the load-bearing half:**
     being on a container is not holding the entity, so that gate fails P23's own **relationship** axis
     and leaves the same disclosure at a smaller radius — precisely what P23 rejected for guests.
  4. **No conforming per-event emission exists**, because `proj_visibility` keeps no prior audience, no
     payload carries a before-image, and 6.82/6.94 forbid reconstructing one. **A gate with no gatable
     predicate is a deletion wearing a condition** — so DELETE and NARROW are the same act here, and the
     honest spelling is the one that leaves no dead branch behind.

  **CORRECTION, made the same day, to how this disposition was first written down.** The first version
  led with a measurement — *`git diff --stat origin/main origin/exec/04-t8-t14-enforcement --
  apps/server/src/visibility/visible-events-for.ts` was 495 insertions, **0 deletions** (measured while
  `main` was `eadc748`, before #57; re-run after #57 it prints 0/0)* — and called it "the fact that
  settles it." **It is not.** It establishes only that the walk never shipped to `main`, so nothing live
  regressed. **The escalation never claimed a regression.** Its own words are *"its footprint is wider
  than THE RULING named"* and *"what it cost BEYOND 6.101"* — a forward claim about scope: the residual
  now applies to all per-event triggers and to members, so the retention half of the gap Plan 10
  inherits (6.104) got wider. **That claim is true, and the never-shipped fact does not touch it.** It is
  supporting context, nothing more.
  **The executor was told otherwise and filed it against itself as a wrong-subject instance. It was not
  one, the attribution was withdrawn before its handoff was written, and it must not be counted in that
  tally.** By this file's own standard — *a false sentence a maintainer reasons from is worse than a
  missing one* — the correction belongs here at the same weight as the ruling. **A controller answering
  an escalation must answer the claim the escalation made, not the nearest claim its evidence refutes.**

  **Two further things that stand:**
  - **Do not cite case 6.100 as evidence that a purge gate exists** — it passes on the `canSee` guard
    that 6.16 already pins, not on anything purge-shaped. Stated on the case and in the test comment.
  - **The executor's correction to this project's own rule is upheld.** *"Nothing may be chained after
    the gate"* forbids a **trailing command in the same pipeline** stealing the status; it does **not**
    forbid reading `$?` on the next line. `pnpm turbo … > gate.log 2>&1` then `GATE_EXIT=$?` is correct
    practice, and **an inferred exit code is a self-inflicted downgrade from a read one.** The gate in
    the anchors above was taken that way.

- **Fable is not dispatched, for any role.** Sonnet default, opus by exception, hard cap **6 subagents per
  task**, one fan-out per plan, judgment fan-outs withdrawn. Cost ledger of what this trade has already
  cost is in the ruling — **add to it, do not re-argue it.** Note fable was the **premium** tier the
  ruling replaced with opus as "the ceiling" — not the cheap one. A controller got this backwards once.
- **CSRF ruling**: Plan 4 T5 owes HTTP-Origin on cookie-authenticated routes, `sameSite` set explicitly,
  and a sentence naming that the cookie assertion forbids a `Domain` attribute.
- **Plan 10 T4 is lifted to Phase 1** — the §11 envelope-origin closer. `fc904f4` closed only the client
  door.
- **Ruling P17** (new, this merge): `useLiveQuery(source, workspaceId, queryKey, load, debounceMs)` is a
  **breaking** signature change binding Plan 6 T10–T13 and Plan 10. Its unstated invariant — *the key must
  name every input `load` closes over* — is enforced by nothing.
  **P17's own "eight call sites" was wrong — there are NINE**, corrected in place by PR #45. The
  controller's dispatch said four. Both counts were wrong and the five neither named (5514, 6390, 6391,
  6395, 6396) sit in Tasks 11–13 — the only tasks not yet written, i.e. the ones that will be transcribed
  from that text. **A count asserted in two places can be wrong in both; recount from the file.**

## Traps that cost a round each if rediscovered

1. **Two "origin checks".** HTTP `Origin` header (CSRF) vs the event-envelope `origin` provenance enum.
   They meet in Plan 4 T5. Always say **envelope-origin** or **HTTP-Origin**.
2. **`docs/plan-3-chain-b-handoff.md` is read BEFORE Plan 3 Task 12, not during** — two tenancy hazards
   converge there, one a total outage presenting as a data problem.
3. **Clock tests: varying `TZ` is necessary and NOT sufficient.** Under vitest's `threads` pool,
   `process.env.TZ = zone` **does not move the clock** — a worker thread gets no process-level
   reconfiguration. T9's three zone tests were 32/32 green while the zone never moved. **A test that
   varies an ambient setting must also assert that varying it does something.** Binds Plan 9's Calendar
   and Timeline. Recorded as a ruling in the coordination doc at this merge.
4. **The integration checkpoint no longer fires** — replacement trigger is the Phase 2/3 boundary.
5. **A pre-ruling covers *who*, not *what*.** Reading "a pre-ruling covers this" and skipping the thought
   is the trap.
6. **A native-module false red.** See the Node section above. `sync-client` failing 4/8 is an ABI
   mismatch, not a defect.

## Method rules this role keeps breaking

Every one below was violated by a controller that had just written it. **Assume you are the next.**

- Never run a state-changing git command in a shell whose cwd was set for a read — use `git -C`. Violated;
  it swapped a live lane's worktree for 26 seconds and contaminated a running review.
- **A pipe has a second failure mode, and it is worse than the exit code.** `| head` (and `grep -m N`)
  closes the pipe early, so the runner's parent dies on EPIPE and its fork workers are orphaned at
  `ppid=1` — spinning at ~1 core each and growing, with the tool call reporting success. On 2026-09-04
  a task-14 agent's `pnpm exec vitest run 2>&1 | head -6` left six workers behind at 05:05; by 05:28 they
  held 22.4 GB on a 16 GB machine and the machine had to be force-restarted. The control is in the same
  transcript: the same suite through `| tail -6`, five seconds later, left nothing. Reproduced on demand
  in 30 seconds. Same lesson as the two entries below it — **do not pipe a run at all**: redirect to a
  file and read the file. A machine-local `PreToolUse` hook now refuses the piped form.
- **A gate's exit code is the LAST command's exit code.** The known form is the pipe (`| tail` reports
  `tail`'s status). It was re-hit 2026-08-31 in a new costume: a trailing `echo` made the harness report
  **"exit code 0"** for a gate whose summary said `Tasks: 11 successful, 18 total / Failed:
  sync-client#test`. **Read the `Tasks:` line. It is the only honest signal.** Write the exit code INTO
  the log (`echo "TURBO_EXIT=$?" >> log`), never after a pipe.
- **I PIPED THE LEDGER GATE AND READ `grep`'s EXIT CODE, FOR FOUR CONSECUTIVE MERGES.** Found 2026-09-02
  by the **executor**, in PR #70, which correctly said *"`check:tasks` fails and is not this branch's —
  owner: the controller."* Every check I ran was `pnpm check:tasks 2>&1 | grep -E 'VERIFIED|todo'`.
  **The summary printed `88/177 (49.7%)` while the command was exiting 1.** I even wrote
  `; echo "CHECK_EXIT=$?"` once and it printed `0` — **`grep`'s status, because the pipe was still
  there.** The tell was available and I filtered it out: the report carries a
  `ROWS CLAIMING done WITH NO EVIDENCE` section, and my grep pattern could not match it.
  **The defect it hid was also mine.** The audit's applier set status, sha and note on the 14
  `todo → done` rows and **never set the `pr` column**. `claimed → done` rows already carried one —
  which is exactly why the bug was invisible in the 32 and present in the 14.
  **Third costume of the entry directly above** (`| tail`, then a trailing `echo`, now **a `grep` whose
  pattern cannot match the failure section**, so the output reads as a clean report). Committed inside
  the instrument built to catch drift, while writing about falsifiability.
  **Redirect to a file, read `$?` on the NEXT line, grep the file afterwards — and grep the FAILURE
  vocabulary, not only the success vocabulary. A filter that can only show you good news is not a check.**
- A rule does not reliably fire on its author. **The executor caught three controller errors on its first
  day**, each in an artifact the controller had just written *and verified*.
- Over-caution has a price here. Blocking a restart on a documentation merge spends session carriage —
  66% of all spend — to protect against a risk already closed.
- **A pointer from a correct document to a stale one does not drift; it reverses, deterministically.**
- **A control must be on the fact you are claiming, not merely in the same file.** Blocked a restart on
  "main's handoff has zero matches for `21 behind`", with `editor-client` hitting 3 as the control. The
  control was sound and the conclusion was false: main said **20**, and carried the whole recon. **A
  working search for the wrong term is still the wrong test** — it proves the probe is alive, not that the
  fact is absent. Search for the fact (`packages/domain/src/index.ts`), never for your own number.
- **Delta counts are not facts, they are readings.** That branch went 20 → 21 → 23 behind inside one
  session. Write "N as of <when>, and still moving", never a bare digit. Note also that `**two**
  conflicts` will not match a search for `two conflicts` — bold markers sit inside the phrase.
- **A ✅ written from the implementation is not evidence; only one written from the test is.** The
  executor's own catalogue was wrong **four times** before it checked — claims drafted from source and
  commit messages, then corrected by reading actual test names: a wrong file cited, a property no test
  asserts, a round-trip described as a direct test, and a 🚫 that two tests document as current behaviour.
  **The drift the catalogue exists to prevent, arriving during its creation.** Honest limit, stated in the
  bucket rather than implied away: **no test in this repo cites a case id in either direction**, so a ✅ is
  checkable by reading the named file and not by grep (owner workspace/Plan 11).
- **A claim that a test CANNOT fail needs the same mutation evidence as a claim that it can.** A recorded
  ruling called T4's Escape defect vacuous because the library calls `dispatchExit` unconditionally —
  right about the library, wrong about the test: deleting `container?.remove()` reddens it. One of three
  assertions was dead, not the test. **"Vacuous" invites deletion**, so a too-wide verdict licenses
  removing a working check. The controller propagated this one in a dispatch while simultaneously
  demanding mutation proof for the positive claim.
  > **THE PAIRED-MUTATION RULE — this is the demonstration the entry above never shipped.** Recorded
  > 2026-09-01 from T11's review, the first time the discrimination was run cleanly. **A mutation that
  > kills nothing is not evidence of anything until a mutation that DOES kill has run beside it, in the
  > same suite and the same run.** Measured: deleting the `canSee` guard reddened **7 of 16** cases —
  > genuinely tested — while a `throw` in the non-guest re-grant arm left **343/343 green** — never
  > executed. Alone, "343/343 green" is equally consistent with a coverage gap and with an unexecuted
  > path, and those two demand opposite responses (write the test vs. delete the branch). The green run
  > is only interpretable next to the red one. **Pair them or report neither.**
- **AN INABILITY TO TELL TWO CASES APART IS A REASON TO TAKE THE SAFE BRANCH, NOT A LICENCE TO TAKE THE
  UNSAFE ONE.** Found 2026-09-01 inside case 6.101's own comment, which argued the disclosure was correct
  because `canSee` now is *"true of a ticket taken away and equally true of one never held, and this
  module cannot ask the other question."* That is reasoning FROM an inability TO a permission. The module
  cannot distinguish *lost access* from *never had access*, and it resolved the ambiguity toward the
  disclosing branch. The guest side had already been gated for precisely this; the member side inherited
  the same blind spot at a different radius and defended it in a comment.
  **The tell is a sentence of the form "X and Y are indistinguishable here, so we treat both as Y" where
  Y is the permissive case.** The valid inference from indistinguishability is always toward the
  conservative case — here, retaining stale local data rather than emitting an id. Under-purge is
  recoverable by a resync; a disclosure is not recoverable at all.
  **And note where it was hiding: in a test's explanatory comment, next to a passing assertion.** The
  test encoded the wrong behaviour AND the argument for it, so reading the test as documentation
  propagated the defect. A green suite is not evidence the behaviour it pins is correct.
- **THE INSTRUMENT'S SCOPE IS NARROWER THAN THE CLAIM BUILT ON IT — three instances, so stop calling it
  a coincidence.** Each time the probe was real, it ran correctly, and it answered truthfully about a
  narrower subject than the sentence written from it. **A right answer about the wrong subject.**
  1. `git merge-tree --write-tree` answers *"did this conflict"*; it was read as *"is this redundant"*.
  2. `@{u}` answers *"ahead of the upstream this branch was created with"* — `origin/main` — and it was
     read as *"pushed"*, truthfully returning `0 6` right after a successful push.
  3. `pnpm exec node -v` answers for **`pnpm exec`**; it was read as *"pnpm"*, and `pnpm run` — the
     command every gate actually uses — behaves differently.
  4. `git checkout -- <path>` restores from the **INDEX**; the sentence built on it was *"restored to
     HEAD"*. After an earlier `git checkout <sha> -- <path>` staged the old content, the "restore"
     truthfully put the PRE-FIX files back and reported success. Found by the executor 2026-09-01,
     caught by reading the files for named markers rather than by trusting the command's exit.
  **SUB-PATTERN, now two of the four: a git command that takes an IMPLICIT ref resolves a different one
  than the writer assumed, and reports success either way** (`@{u}`, `checkout --`). **So name the ref:**
  `git checkout HEAD -- <path>`, `origin/<branch>...HEAD`. Never the bare implicit form.
  **The check: name the subject your instrument actually ranged over, then reread your sentence and see
  whether it names the same one.** All three passed every falsifiability test that was applied, because
  those tests asked whether the instrument WORKED, and the instrument did work. None asked what it was
  pointed at. Note this is the one failure class in this file that a positive control cannot catch.
- **An over-specific search returns a false negative that looks like a finding.** Searching all 12 plans
  for Plan 4's *exact* wording of the catalogue rule found it in **one** file; searching for the rule
  loosely found it in **all 11**. Same class as grepping for `21 behind` when the file said `20`.
  **Search for the fact in the vocabulary the other author would have used, not in yours** — and print the
  rows, because two of the twelve returned blank rather than `0`.
- **A RIGHT ANSWER ON DEAD EVIDENCE is worse than a wrong one** — a wrong answer gets caught; a right one
  confirms the method that produced it. P21's role/mode asymmetry was established by widening a union in
  `packages/domain/src` and compiling `apps/server`, which resolves that package through
  **`dist/*.d.ts`** — the edit never reached the compiler under test, so `tsc` exiting 0 was equally
  consistent with the finding and with a blind instrument. This is the **stale-`dist`** trap in its
  *type-level* form; the mutation form is already recorded. Both fail as a **quiet pass**, never an error.
  **Prove the instrument can see before reading it**: rebuild, then confirm a probe (`const _probe:
  WorkspaceRole = 'viewer'`) does NOT error. And prefer a check whose **count** discriminates — the fix
  raised exactly two `TS2366`s, one per file, where one would have meant a single switch was load-bearing.
- **Name the ref; don't trust the symbol.** I prescribed `git rev-list --left-right --count @{u}...HEAD`
  to verify a push. `@{u}` is whatever upstream the branch was *created* with, and
  `git checkout -b <n> origin/main` sets it to **`origin/main`** — so it returned `0 6` right after a
  successful push, truthfully answering a question nobody asked. Use `origin/<branch>...HEAD`.
- **`git cat-file` also lies from a SIBLING WORKTREE, not only the reflog.** Worktrees share one object
  store, so an unpushed commit resolves as `commit` from the main clone and reads as landed — fooling the
  *reviewing* session, which is the party least able to suspect it. `git branch -r --contains <sha>`
  (empty = on no remote) is the discriminating check. Caught two unpushed rounds this way.
- **PRINT THE ROWS, NOT THE COUNT, whenever a count is about to decide something.** Four instances in one
  day, one cause: a proxied `grep -c` silently reformatting its output; a `merge-tree` stat whose 11-line
  "difference" was **conflict markers**; a regex counting `9.1`/`9.34` out of prose *describing* a reserved
  range; and an idle check where a `✻` inside a "done" line made a finished session look busy. Corollary:
  when the rows are too many to read, print the first few **and** the count — the disagreement is the signal.
- **`git merge-tree --write-tree` writes conflict markers INTO the tree**, so comparing its output tree to
  `main`'s answers *"did this conflict"*, never *"is this redundant"* — a conflicting branch can never
  compare equal whatever its content. The tell for any instrument: **could it produce the answer that
  would clear the subject?** If not, it is not a check.
- **Verify a count by enumerating and marking, with the marker string counted as a control** so a zero
  cannot come from a sweep that matched nothing. Method from the executor, after the controller and
  Ruling P17 asserted two different wrong counts for the same thing.
- An artifact's author is the worst-placed party to report its contents. *(Corollary earned this merge:
  verifying an author's claims is cheap and it worked — every claim in the PR #43 handoff held, including
  four shas my naive `--contains` sweep called orphaned that the file itself labelled "do not cite".
  **A sweep that cannot tell "cited as live" from "marked dead" produces false defects.**)*

## The monitor's blind spot: it cannot see an idle session

**Measured 2026-08-31: the executor idled ~55 minutes on a full quota and nothing reported it.** It armed
a `sleep`-based wake-up for the 18:00 reset; the timer was **still alive at 59:11 for a 24-minute wait**,
output frozen at `waiting 1432s`, and it never fired. The owner noticed, not the controller and not the
monitor — the monitor watches `main`, open PRs and pane membership, and **has no signal for "a session is
idle when it should be working."**

**Do not close this with `#{window_activity}`.** I tested it before building on it: both windows returned
**identical** timestamps incrementing in exact lockstep with wall-clock (`…735 → …740 → …745`, +5 per
5-second sample). It tracks the clock, not activity, so a monitor built on it reports "active" forever —
**including for a dead session.** An idle detector structurally incapable of detecting idleness.
A workable signal is hashing `capture-pane` output (a working pane animates, an idle prompt does not);
~~unbuilt, because the threshold needs tuning against how long a legitimate fan-out stays quiet.~~
**BUILT — that is `com.kiro.claude-idle-nudger` in the table above, and it is the instrument that closes
this gap.** Verified loaded 2026-09-01 19:40 IST alongside the other two:
`launchctl list | grep -i claude` → `com.kiro.claude-idle-nudger`, `com.kiro.claude-limit-resumer`,
`com.kiro.claude-net-resumer`, all present. **Check this after every controller relaunch too** — unlike
the shell monitor these are launchd agents and genuinely do outlive the session, but that is a fact to
confirm rather than assume, and the nudger was still being debugged the morning of the same day.

**Second blind spot, demonstrated by the monitor itself.** The controller killed the `exec` window and
relaunched a fresh session into a new window of the same name. The monitor reported **no** `LANE PANES
CHANGED` — it compares the sorted pane-NAME set, which was `exec,main` before and `exec,main` after. **It
cannot see a session being replaced, nor one dying if anything takes the name back.** Combined with the
idle gap: the monitor answers *"did the repo move"* well and *"is anyone home"* not at all.

**Until then the controller tracks boundaries itself.** If you approve a hold-until-time, you own the
clock; do not approve one and then stop watching, which is exactly what happened here.

## The watch monitor — do NOT re-arm it blindly

A persistent monitor runs on `origin/main`, the open-PR set, and tmux pane membership. **It survives
`/clear`** — it is a shell child of the session process, and `/clear` ends the context, not the session.
Confirmed by observation 2026-08-31: it fired the `60bc7ca` event into a freshly cleared context.

**Check before re-arming: `pgrep -fl prev_main`.** Re-arming a live monitor gives you two and duplicate
events on every merge. It emits only on change — long silence means nothing changed, not that it died.
~~Currently alive as **PID 78292**.~~

> **BUT IT DOES NOT SURVIVE A CONTROLLER RELAUNCH, AND THAT IS THE CASE THIS ENTRY WAS MISSING.**
> Found 2026-09-01 by the controller that replaced `gisik-nokma-aa`: `pgrep -fl prev_main` returned
> **nothing at all**. "Survives `/clear`" and "survives a relaunch" are opposite consequences of the
> *same* fact — the monitor is a child of the **session process**. `/clear` ends the context and keeps
> the process; **an owner relaunch (or `tmux kill-window`) ends the process and takes every child with
> it.** The old entry recorded the reassuring half and pinned a PID that could not outlive its parent.
> **So: expect it ABSENT after any controller relaunch, and re-arm as a startup step** — the
> `pgrep` check is for the `/clear` case only. And note the ordering hazard: the controller is relaunched
> at exactly the moments the repo is most likely to move.

**The re-armed version fixes the zero→one guard; the script is not the one described above.** Live as of
2026-09-01 19:40 IST, source in the session scratchpad (`ctl-watch.sh`), three changes:
1. `prev_prs` / `prev_main` initialise to a **sentinel**, not `""`. The old guard `[ -n "$prev_prs" ]`
   is false whenever no PR is open, which suppressed **exactly the step-PR-appears event the serial loop
   turns on** (the third blind spot below). The sentinel suppresses only the startup emission.
2. Every remote call is wrapped in **`perl -e 'alarm shift; exec @ARGV'`** — there is **no `timeout` or
   `gtimeout` binary on this machine** (checked; both absent), so this is what stops a wedged
   `ls-remote` freezing the loop for hours the way one did for 5h16m.
3. It watches the exec window by **presence** (`window_index` 1), so a session *dying* emits even though
   the pane-NAME set is blind to a session being *replaced* (the second blind spot).

**Its reader was proven live before it was trusted:** `--state open` returned empty while the identical
query at `--state all` returned #61/#60/#59. An empty open-PR set that is a real zero, not a broken probe.

> **THIRD BLIND SPOT, and it is on the event this role most needs: it cannot report the FIRST PR.**
> The guard is `[ -n "$prev_prs" ] && [ "$prs" != "$prev_prs" ]`, and `prs` is the empty string when no
> PR is open. So the **zero → one** transition is indistinguishable from "no previous reading" and is
> suppressed. With the open-PR set usually at zero here, that is exactly the step-PR-appears event the
> serial loop turns on. **Poll `gh pr list` yourself; do not wait to be told.**
>
> **FOURTH: `pgrep -fl prev_main` returning a PID does not mean the monitor is running.** Found alive
> 2026-09-01 with its `git ls-remote origin main` child stuck for **5h16m** — the loop was blocked
> inside a command substitution and had reported nothing since 04:58, while `ls-remote` run by hand
> completed in 0.002s. Liveness is the CHILD's age, not the parent's existence:
> `pgrep -P <monitor-pid>` and read the etime. A child older than the 180s poll means it is wedged;
> `kill` that child and the loop resumes. Note the cost of the recovery — `prev_main`/`prev_prs` reset to
> empty, so the first change after the kill is suppressed by the guard above.

It costs **zero tokens** — a shell loop that wakes the session only on a real event. **If it is genuinely
gone**, re-arm change-triggered on a 180s poll against `git ls-remote origin main`, `gh pr list --state
open`, and `tmux list-panes -s -t gisik`.

Note its wording is one-directional: a pane being ADDED also reports "a lane may have exited."

## ✅ THE LEDGER AUDIT IS DONE — executed 2026-09-02, NOT at the step-9 boundary

**`pnpm check:tasks` at this commit: `VERIFIED COMPLETE: 72/177 (40.7%)`, `claimed: 0`, `todo: 105`.**
Quoted from the gate, not computed here. Was 26/177 (14.7%) with 33 claimed.

### THE REASON THIS WAITED FOR STEP 9 WAS FALSE, AND I WROTE IT

I recorded, and told the owner, that the audit had to wait because *"`task-ledger.tsv` is the one file
both sessions write."* **It is not. It is controller-only.** Measured three ways: the executor's live
branch does not touch it (three-dot diff, empty); only **two commits in the file's entire history**
modify it, #55 which created it and #60, both controller PRs; the executor maintains
`executor-state.md` and the coordination doc instead. The owner asked *"will the audits happen after
plan 5 merge?"* — and the honest answer was that the constraint I had invented did not exist.

**And the first check I ran on it was wrong in the same family as everything else in this file.**
`git diff --name-only origin/main origin/exec/05-api-realtime -- docs/` reported `controller-state.md`
as changed by the branch. **It was changed by `main`** — by my own four doc PRs since the fork.
**Two-dot compares two trees; three-dot compares against the merge base.** Use `origin/main...<branch>`
whenever the question is *"what did the BRANCH change."* Third instance of *name the ref, don't trust
the symbol* in one session.

**GENERAL FORM, and it is the expensive one: a constraint you invented is still a constraint you must
re-derive before obeying.** This one delayed approved work behind seven unrelated tasks, was repeated
to the owner as fact, and was only caught because the owner asked a scheduling question. **The
inherited rules in this file get re-measured on every restart; the ones a controller writes mid-session
get obeyed.**

### WHAT WAS APPLIED — 46 rows, all with per-row artefact evidence

- **32 promoted `claimed` → `done`**: Plans 1 (15) and 2 (13) per Ruling A, plus 03/T1, 03/T2,
  06/T9, 07/T4.
- **14 promoted `todo` → `done`**: 04/T1–T3 · 06/T1–T4 · 07/T1–T3 · 10/T1, T2, T3, T8. These were
  rows whose work had landed with **no ledger row citing it** — and `check:tasks` had been printing
  their PRs (#20, #22, #30, #16, #47, #23) in its unattributed-PR list on every run, under the
  understated figure, unread.
- **1 demoted `claimed` → `todo`**: **11/T6.** `docker-compose.dev.yml` was never added to `main`.
  The only row in the ledger that was concealing work which had not shipped — and the entire
  justification for the `done`/`claimed` split existing.

### 3 OF THE 17 CANDIDATES WERE REFUSED — and the reason generalises

**07/T16, 10/T18 and 11/T14 stay `todo`** although every declared artefact is present. Each is a
**final-catalogue-and-verification task**, and its files exist because *earlier tasks in the same plan
catalogued themselves* — the same-change-set rule is series-wide, so `test-cases/NN.md` exists from
task 1 onward. Plan 10 has 13 tasks unrun; Plan 11 has 15; PR #10's own subject calls itself a
**"CI skeleton."**

> **THE RULE: artefact presence is NOT evidence for a task whose job is to catalogue or verify OTHER
> tasks.** Such a task cannot be complete while the things it must sweep do not exist, whatever its
> files say. Check the structural precondition — *have the tasks it catalogues actually run?* — never
> the file. This is the `docToPlainText` precedent in its second costume: a file on `main` that a
> different task put there. It would have promoted 3 rows wrongly, and the two instruments that
> approved the other 14 (artefact present, declared tests present) both said yes to all three.

### The instrument that did this, and its guards — all four proven to fire

Idempotent by construction: a row already in its target state **with the expected sha** is a no-op; the
same row with a **wrong** sha still errors. Every guard was mutation-tested against scratch copies with
a passing control beside it — non-ancestor sha, wrong starting status, missing row, wrong sha under
idempotency. **The working tree was never used as a test fixture.**

## Pending owner decisions

1. ~~**The executor's advisor is running on Fable.**~~ **RESOLVED, no owner action needed** — its status
   line now reads `advisor: opus`. Recorded only so the question is not re-raised: `advisor:` is harness
   session config, not a dispatch, and the ruling's three named roles are all dispatch roles. Had it still
   been fable it would have been an owner scope call, not a controller one (trap #5).
2. **The declared Node engine is unenforced.** `engines` demands `>=22 <23`, the machine defaults to 24,
   and there is no `.nvmrc` *and no `.npmrc`* — so without `engine-strict=true` pnpm accepts the wrong
   Node silently. The fix is two lines (`.nvmrc` + `engine-strict=true`), but it turns an unsupported Node
   into a hard refusal and so needs a CI run to prove it does not break the pipeline. Recorded by the
   executor with owner **Plan 11**; surfaced here because it wants an owner decision, not a plan slot.
   The controller does not implement.

## Controller context discipline

Measured 2026-08-31: this role ran **655 requests at 404K average context, rising 165K → 609K per request
across the session** — worse than any session it was policing. **The controller is the most expensive
session in the topology and should restart itself at decision boundaries on the same terms it imposes on
the executor.** Its restart is owner-issued (`/clear`) or owner-relaunched; this file is what makes that
free rather than destructive.
