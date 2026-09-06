# 12. Offline sync & the apps — test cases

Mirrors `Features.md` §12. Status: `❌` not covered · `✅` covered · `🟡` partial · `🧪` manual · `🚫` out of scope (with reason).

**ID BLOCKS — allocated by the controller, and a lane MINTS FROM ITS BLOCK, never from the maximum.**
**Lane A `12.320–12.339`** (used through `12.328`, next free `12.329`) · **Lane B `12.290–12.319`**
(**EXHAUSTED** — `12.319` was spent by Task 18 on the two `sync-client` guard suites that had no id;
Lane B now mints from **`12.360–12.379`**, allocated with the sync-surface override, used through
`12.364`) · **Lane D `12.340–12.359`**
(used through `12.343` — the socket-cutting fixture) · **next block `12.380`, controller-allocated ON REQUEST ONLY.** Earlier, exhausted blocks,
kept because their ids are live in this file: Lane D `12.224–12.227` · Lane C `12.228–12.239` · Lane A
`12.240–12.259` · Lane B `12.260–12.289`. **`12.1–12.44` belonged to Plan 10 Task 18 and are now WRITTEN
by it** — the reservation is discharged, not outstanding.

**MAXIMUM IN USE: `12.364`** — recounted at this commit across all three id styles, not carried.
*A maximum is a fact about a moment and this line is the only thing holding the moment.* It has gone
stale **twenty times** in this file's life (counted from the running parenthesis it used to carry — and counted with `uniq -c`, because `grep -c` counts matching LINES and that whole parenthesis was ONE line, which is its own instance of a check answering a question nobody asked), twice inside a single change set, and twice that staleness
became a real double-mint that two branches both reached from correct readings of it. That is why ids
here are **allocated rather than discovered**: recount the maximum as the *control* at every rebase, and
never mint from it. Before this rewrite the line read `12.318` while `12.322` had been on `main` since
#176 — the twenty-first instance, found by Task 18's own recount. It then went stale a twenty-second
time *inside Task 18's own change set*, between the catalogue commit saying `12.322` and the rebase past
#187 making it `12.328` — which is precisely why this line is recounted at the sha being reported and
never carried forward from the previous one.

> **⚠ RECOUNT WITH ALL THREE STYLES, AND PRINT THE PER-STYLE COUNTS.** Ids appear as `- 12.274 🚫 …`
> (bare), `- **12.240** ✅ …` (bold) and `- 🧪 **13.1 — …` (marker-first, in sibling files). A recount
> matching one style reports "zero duplicates" through a collision it structurally cannot see. Use
> `node scripts/check-case-ids.mjs` — it extracts from the LINE HEAD only, prints per-style counts, and
> **compares the union against their SUM, so `union < sum` is the machine-readable signal that a style is
> being missed.** It is a SEPARATE CI step and is **NOT** part of `pnpm check:env`; a lane reporting
> "check:env 0" has verified nothing about case ids. **A zero from a matcher you have not watched fire is
> not a measurement** — this file's marker-first count is genuinely 0, believed only after the same
> pattern was watched returning 40 on `test-cases/13`.

**Style: BARE is canonical here** (`- 12.45 ✅ …`). Task 18 normalised this file's 23 bold-style line
heads to bare — **marker and bold placement only; no id was renumbered, and never may be.** Census at
this commit: **bare 322, bold 0, marker-first 0; sum 322 == union 322, zero duplicates** — the 267 that
were here (bare 244 + bold 23), plus Task 18's 44 and `12.319`, plus Lane A's `12.323–12.328` from #187,
plus Lane D's `12.340–12.343` (the socket-cutting fixture), which were authored BOLD against the header
this branch forked from and are written bare here because Task 18's rule above is the one that now
holds. *Recounted at this sha rather than carried: it read `318` until this branch rebased past Task 18,
which is the twenty-third instance of exactly what this section is about.*
**Those six were authored bold and normalised to bare by Task 18 in its rebase, with Lane A informed** —
by the controller's ruling of 2026-09-06, since Task 18 owns §12's final shape and a marker/bold change
is not a renumber. That ownership ends when this task merges. New cases in any block are written bare.

**Scope — every Plan 10 task, and where each one's cases actually live.** In this file: **Task 4** (the
LIFTED §11 envelope-coherence closer, `proj_contested`, `getContest`, `GET /v1/contests`) · **Task 5**
(snapshot writer, ledger-sourced reducer deps) · **Task 6** (`GET /v1/sync/bootstrap`) · **Task 7**
(`POST /v1/sync`) · **Task 9** (the replica) · **Task 10** (outbox + local pre-check) · **Task 11** (sync
engine + HTTP/WS transport) · **Task 12** (replica `DataSource`, the first cases here that live in
`packages/app-core`) · **Task 13** (app-core's offline/sync UX, also `packages/app-core`) · **Task 14**
(dual-client harness rig) · **Task 15** (the six scripted scenarios) · **Task 16** (`apps/desktop`'s
storage adapter) · **Task 17** (the `apps/mobile` shell) · **Task 18** (this header, and `12.1–12.44`).
**NOT in this file, deliberately:** **Tasks 1–2**' shared vocabulary — `formatIstInstant`,
`IST_CLOCK_NOTE`, `istDayOf`/`istDayBounds` and the clock-skew derivation are catalogued in
`Features.md` §3 and `test-cases/03`, and the contest *evaluators* (`contest.server-only`,
`contest.unknown`, `contest.already-resolved`, `contest.wrong-ticket`) in §4 and `test-cases/04`,
because those are the sections that own the domain and the rule engine · **Task 8**'s `sync-client`
scaffold and storage seam, catalogued beside the ledger in §3. **That split is real and is left standing
rather than tidied** — Task 18 owns the reconciliation and this sentence IS it, measured: the four
tokens above return 0 in §12 and non-zero elsewhere in `Features.md`, with `proj_contested` at 9 as the
positive control that the same measurement can find a §12 string at all.

**Also here, belonging to no plan task:** refresh on publish, snapshot door (`12.189–12.192`) — the
snapshot-invalidation gap Task 5's ledger row flags in its own notes; it gets no ledger row and is
catalogued here because the surface it fixes is this bucket's. Likewise **closures 1–5b**, which are
rulings applied to this bucket's surface rather than tasks: closure 2/2b (`12.240–12.243`), closure 3,
closure 4, closure 5 (`12.275–12.289`) and closure 5b (`12.290–12.318`).

**Task 8's absence is MEASURED, not assumed.** The measure is the one that cannot move with this prose:
`grep -nE "^## .*Task 8|^- 12\.[0-9]+ .*Task 8" test-cases/12-offline-sync-apps.md` returns **nothing**,
with `grep -cE "^## " …` printing **19** as the control that the pattern can match a heading at all
(re-measured at this commit). An earlier version of this sentence quoted a plain name-match instead and
counted *itself* — the paragraph names Task 8 repeatedly in order to say it is absent, so every
correction to the sentence changed its own answer.

**Cases are grouped by SURFACE, not by number**, so the largest id is **not** the last line of the file
(`12.81` sits in the projection section; `12.76`/`12.77` trail the route's). Grouping is worth keeping —
it is how a reader finds the cases for the thing they are changing — so the maximum is written down
instead of the order being bent to expose it, and never-renumber means the ids cannot be tidied into
sequence anyway.

**Whoever adds a section rewrites the enumeration above IN THE SAME CHANGE SET.** This is not advice:
this header and `Features.md` §12's banner have each carried a claim contradicted by content a reader
could scroll to, three times between them. Task 18 found three still live — this line said `12.318` with
`12.322` landed; it called Tasks 14–15 "absent rather than missing" while both have sections in this
file; and §12's banner listed "both app shells" as absent with `apps/desktop` and `apps/mobile` bulleted
inside it. **Two of the three were Lane B's own drift, from its own #126.**

**Terminology.** "envelope-origin" throughout means `EventEnvelope.origin`, the provenance enum
`'web' | 'mobile' | 'desktop' | 'server'`. It is NOT the browser `Origin` header; nothing in this file
concerns CSRF. The two are routinely conflated in this area of the repo, and the conflation is how
someone writes a header check and believes the forgery window is closed.

## Plan 10 Task 18 — the reserved block `12.1–12.44`, reconciled against what actually landed

**Read this preamble before counting anything here as coverage.** These 44 ids are the guarantees **the
plan text declared** (`docs/superpowers/plans/2026-08-20-10-offline-sync-apps.md:7471–7629`), reserved
since this file was opened and filled in only now. The plan wrote **every one of them ✅ before any of the
code existed** — that is a statement of intent, not a measurement, and Task 18's whole job was to refuse
it where it is false. Each line below was checked by reading the test, not the case.

**Most of these ids do not carry their own assertion — they POINT at one.** Five closures and thirteen
tasks landed the properties under different numbers between the plan being written and Task 18 running,
so **36 of the 44 name a landed case that already proves them**. Those lines are cross-references and
**must not be counted a second time**: the assertion lives at the id named after `→`, and this block is
the map from the plan's promise to it. **Eight ids carry a property no landed case asserts** —
`12.1`, `12.2`, `12.3`, `12.5`, `12.15`, `12.40`, `12.41`, `12.42` — and those are the ones that add
coverage rather than describe it.

**Downgraded from the plan's pre-written ✅, with the conjunct that has no witness named:** `12.5`, `12.6`,
`12.13`, `12.16`, `12.24`, `12.33`, `12.38`. Every one is a multi-clause property where the clauses were
verified separately and one of them turned out to have nothing behind it — which is why they read 🟡 and
not ✅, and why each names its missing half rather than saying "partial".

### Contest vocabulary & rules

- 12.1 ✅ `claim.contested` carries the original claim whole; a payload lacking that original refuses at the **parse** door (`packages/domain/test/contest-events.test.ts:45`). The discriminating pair at `:79–83` is the load-bearing part — **absence** is refused while **emptiness** (`payload: null`, `payload: {}`) is accepted, so the check cannot be satisfied by a blanket falsy guard. **No landed case covers the parse door**: 12.59 is the builder and 12.72 the read surface, and neither reddens if the schema stops requiring `originalEvent`.
- 12.2 ✅ `claim.contested_resolved` requires the replacement link for `redone` and the comment link for `converted-to-comment`; `discarded` needs neither (`contest-events.test.ts:95, :106, :117`). Each refusal has an **accepting twin** (`:96–102`, `:107–113`), without which a schema that refused *every* resolution would pass.
- 12.3 ✅ a client-forged `claim.contested` refuses `contest.server-only` — **envelope-origin**, the provenance enum, not the HTTP `Origin` header (`packages/rule-engine/test/contests.test.ts:64–74` + `fixtures/contest-refuses-client-origin.json`). Asserted as a **whole verdict** with `toEqual`, so a refusal under a *different* rule id fails too; the harness compares rule **and** reason (`src/fixtures/harness.ts:567–577`), not merely the boolean.
- 12.4 ✅ an unknown contest refuses `contest.unknown`, a second resolution `contest.already-resolved`, a misaimed one `contest.wrong-ticket` (`contests.test.ts:90–128`, three whole-verdict `toEqual`s). → **landed 12.78/12.79/12.80 at the SERVER layer**; this id is the shared-engine layer, and deleting a branch here reddens the fixture, not those. The `{refused:false}` control at `:130` stops all three passing under an evaluator that refuses everything.
- 12.5 🟡 the contest evaluators run from the shared fixture suite in every build (`packages/rule-engine/test/fixtures.test.ts`), with an **86-fixture count gate** (`:13–15`) so a fixture mis-filed into a subdirectory cannot go silently unrun. **The word "identically" is NOT earned: there is exactly one runner.** `loadFixtures` resolves only in `fixtures.test.ts` and the harness — no client-side runner executes these fixtures, and CI's own comment says so (`.github/workflows/ci.yml:21–26`: *"`packages/app-core` … does not yet run the shared rule-engine fixture harness"*). *Owner: Plan 11 / CI — the client half of the fixture gate.*

### Sync ingress & bootstrap

- 12.6 🟡 a legal offline claim commits through `POST /v1/sync` → **landed 12.100**, whose ledger read-back at `sync-route.test.ts:293–295` compares the answer against the row ingest actually wrote, so a hardcoded reply fails. **"Exactly like ingest" has no assertion**: both cross-door comparisons in the file (`:511`, `:665`) compare a **refusal**, never a legal commit. Structurally true in source (`sync-service.ts:370` calls the same `ingestClientBatch`), never pinned. *Owner: Plan 10 Task 7.*
- 12.7 ✅ a refused offline claim becomes a `claim.contested` ledger event naming the exact rule → **landed 12.101** (`sync-route.test.ts:300–330`).
- 12.8 ✅ the same batch twice: identical results, ledger unchanged, exactly one contest → **landed 12.104** (`:390` — a retried **committed** claim: same instant, seq and cursor, ledger count unchanged) · **12.105** (`:411` — a retried **contested** claim answers the one recorded contest, never a second) · **12.106** (`:431`). *12.104 contains no contest assertion; "exactly one contest" is 12.105's.*
- 12.9 ✅ an interactive `/v1/events` refusal records NOTHING — proven side by side against the sync door → **landed 12.110** (`:508–524`), counting `proj_contested` rows before and after.
- 12.10 ✅ actor-mismatch and client-supplied `claim.contested` are both refused at the sync door → **landed 12.107** (actor mismatch, `:454`) · **12.108** (a client-supplied `claim.contested` refused as `reserved-type`, **before** the coherence check could answer, `:465`).
- 12.11 ✅ a claim on a no-longer-visible ticket contests `permission.visibility` → **landed 12.103** (`:365–388`).
- 12.12 ✅ bootstrap returns snapshot + tail for exactly the visible tickets, and an invisible ticket leaves no trace → **landed 12.94** (`bootstrap.test.ts:366` — snapshot + tail for exactly the visible ticket) · **12.95** (`:418` — the strong form of "no trace": the WHOLE response body stringified, `not.toContain(HIDDEN)` with `toContain(VISIBLE)` as its positive control). *12.94's `toHaveLength(1)` alone would stay green if the hidden id leaked anywhere outside the tickets array.*
- 12.13 ✅ bootstrap backfills comments and contests below the snapshot seq, and guests get definitions plus explicit tickets only → **landed 12.94** (comments, contests) · **12.96** (`:434` — the guest clause, which is NOT 12.94's) · **12.115/12.116** (`visibility.set` and the two contest entries, each made to travel from below the cut) · and, closing the fourth clause, **12.363**. Was 🟡. **The attachments clause had no witness**: `attachment.added` is a live member of `BOOTSTRAP_BACKFILL_TYPES` (`apps/server/src/sync/sync-routes.ts:59`) and **deleting it from that constant left the whole server suite green** — 12.94's loop hardcodes the five names rather than importing them (deliberately, so shrinking the constant shrinks only one side), but that loop is a boundary check driven by `comment.added` alone, and the attachment was the one member of the five nothing made travel.
- 12.363 ✅ **AN `attachment.added` FILED BELOW THE SNAPSHOT SEQ REACHES THE REPLICA.** The attachments clause of 12.13, in 12.115's shape and for its reasons: the premise is asserted rather than assumed (a snapshot exists, and the event really is below it), so the case cannot pass vacuously the day the seed order shifts and the attachment lands above the cut — where it would travel for a reason unrelated to the backfill list. Stated RELATIVE to the seq the response carries, never against a literal. `toHaveLength(1)`, not `some()`: a filter returning the whole tail would satisfy a `some()` here for nothing. The payload is asserted WHOLE (`attachmentId`, `filename`, `sha256`) — a replica that has to render or re-fetch the file needs the digest, not the fact that a row existed. **The seed edit could not land silently, and that is the file working:** `bootstrap.test.ts`'s `beforeAll` pins AUDIT's snapshot seq EXACTLY, so adding one event reddened the premise assertion by name (27 → 28) instead of passing three cases below with the attachment above the cut. *Mutation: delete `'attachment.added'` from `BOOTSTRAP_BACKFILL_TYPES` → **1 failed / 103 passed over the whole of `test/sync/` and `test/dual-client/` (15 files, 104 tests) — 12.363 ALONE**, in the two directories that hold every consumer of the constant, `rig.ts` and both `snapshot-refresh` suites included. The 103 are the measurement of the gap as much as the 1 is: before this case, that deletion was invisible to all of them.* (`apps/server/test/sync/bootstrap.test.ts`)
- 12.14 ✅ the snapshot equals the reducer's fold and the next pass resumes from the previous snapshot → **landed 12.86** (the snapshot IS the reducer fold, and the projections it could have been read from are empty, `snapshot-writer.test.ts:248`) · **12.87** (`:272` — the next pass folds from the previous snapshot, not from scratch).
- 12.15 ✅ `readStreamSeq` is 0 for an empty workspace, is workspace-**scoped**, and advances across entities whose per-entity seq is both 1 (`stream-seq.test.ts:44–98` — the third clause is the test at `:79`, outside the range this line first cited). **This id fills a real gap** — those four assertions had **no case id anywhere in `test-cases/`** until now, which this file's header has flagged as owed to Task 18 since Task 2 landed. Note the landed test is **stronger than the plan asked**: the plan's "two workspaces both start at 1" is the weaker construction the test explicitly rejects at `:61–64`, because an unscoped `max(workspace_seq)` also returns 1 for both and would pass it.

### Replica, outbox & pre-check

- 12.16 🟡 the replica read model is the reducer's fold, contests fold beside state and never into it, and the local ledger stores **both** sequences it was handed → **landed 12.119/12.121/12.137** for the fold, the beside-not-inside property (with `listContests` length as its own control against an empty query) and the per-entity `seq` round-trip. **The `workspace_seq` half is not asserted**: a mutation writing a constant 0 into that column leaves the suite green. *Owner: Plan 10 Task 9 / replica.*
- 12.17 ✅ duplicate stream delivery is a no-op → **landed 12.120** (`replica.test.ts:309–315`), the same envelope applied twice returning `{applied:true}` then `{applied:false}`.
- 12.18 ✅ purge removes every local trace — unreadable, unsearchable, gone from raw SQLite — with the claimant's own contested-claim stub as the single deliberate exception → **landed 12.126** (unreadable, unsearchable, gone from raw storage, `replica.test.ts:502`) · **12.127** (`:540` — the exception: purge keeps **this** user's own contested-claim stub and drops another user's).
- 12.19 ✅ the local pre-check refuses instantly with the named rule and queues nothing → **landed 12.138** (`precheck.test.ts:165–180`), asserting the rule engine's own sentence rather than a local paraphrase.
- 12.20 ✅ the pending overlay leaves confirmed state unmoved, exposes pending state separately, and exposes the badge ids → **landed 12.151** (`outbox.test.ts:325–360`).
- 12.21 ✅ the outbox preserves order, applies committed / contested / failed results, and backs off exponentially → **landed 12.144** (order, `outbox.test.ts:116`) · **12.145** (committed, `:138`) · **12.146** (contested, `:164`) · **12.147** (failed, TERMINAL, `:198`) · **12.153** (backoff doubles from 1s and caps at 60s, `:438`). *The middle clause previously named no id at all.*
- 12.22 ✅ the replica `DataSource` answers `pending` and never `committed` for a local accept → **landed 12.173** (`replica-data-source.test.ts:230–244`).
- 12.23 ✅ the sync engine bootstraps once, advances its cursor only at caught-up, reconnects, flushes in order and survives transport failure → **landed 12.156** (bootstraps once, `sync-engine.test.ts:278`) · **12.159** (flush in order, `:318`) · **12.160** (survives transport failure, `:347`) · **12.161** (reconnects at the persisted cursor, `:377`) · **12.162**/**12.164** (the cursor advances only at caught-up, `:392`/`:635`). *The earlier text cited `:278–290` for all five; that range is 12.156 alone, and four of the five clauses would survive broken with it green.*
- 12.24 🟡 offline search names its source → **landed 12.183** for the **flag**: dropping `offlineCopy: true` reddens two assertions, and a miss-control stops a `searchOfflineCopy` that returned everything unfiltered from passing. **The user-visible label is not asserted**: `board-screen.tsx:55` could render "searching the server", or nothing at all, and no test in this repo would go red. *Owner: Plan 10 Task 13 / app-core UX.*

### Contested-claim UX & reopen

- 12.25 ✅ the banner names what was claimed, by whom, when and the refusing rule, and renders nothing when there is nothing → **landed 12.193** (`contests.test.tsx:64` — asserting the IST rendering of the claim time, not merely its presence) · **12.201**/**12.202** (`:115`/`:122` — renders nothing when there is nothing contested, and nothing when every contest is resolved).
- 12.26 ✅ discard emits one attributed resolution; convert emits the linked comment carrying the claim text; redo links its replacement → **landed 12.204–12.207**.
- 12.27 ✅ the reopen pair emits the parent transition with its cause FIRST, then the child unchanged → **landed 12.220** (`reopen-pair.test.ts:68–84`).
- 12.28 ✅ gross skew renders attributed to the device clock, sub-threshold renders nothing, unreadable claims are flagged → **landed 12.211** (sub-threshold renders nothing, `skew-and-status.test.tsx:8`) · **12.212** (the gross skew, both directions, `:14`) · **12.213**/**12.214** (an unreadable client *and* server instant flagged — the gate is symmetric, `:26`/`:32`).
- 12.29 ✅ sync status labels — waiting count, offline, catching up, failed attention → **landed 12.215** (`:65–74`).

### Dual-client harness

- 12.30 ✅ S1 concurrent `field_set`: the later claim wins the projection, the earlier survives in history, both replicas end byte-identical → **landed 12.267** (`scenarios.test.ts:223`), with an exact `toEqual` over the whole ledger.
- 12.31 ✅ S2 stale-assignee `restrict-to`: passes the stale LOCAL pre-check, contests with the exact rule → **landed 12.268** (`:267`). The staleness is **asserted, not assumed** (`:274`), and the pre-check is asserted to have PASSED (`:280`) — without that, a claim refused locally would satisfy the case vacuously.
- 12.32 ✅ S3 workflow changed while offline: a transition legal under v1 and stranded by v2 contests on arrival → **landed 12.269** (`:386`). The rule is `unknownState`, **not** the `stranded-state` the plan's wording implies — pinned to the engine's real literal, as the task instructed.
- 12.33 🟡 S4 visibility revoked → **landed 12.270** (`:545`) for contest-up, the honest claimant stub and viewer-visible history, each with an assertion that fails if broken. **The plan's PURGE conjunct has no assertion and cannot have one: the product does not do it.** The per-event purge walk on `visibility.set` was **struck** (coordination cases 6.101/6.104); purge is now a per-**boundary** instruction only — `membership.revoked`, `project.member_removed`. The scenario's own docblock at `:472–491` records this. **The plan's premise is false, not the test.** *Owner: Plan 10 Task 15 — plan text, already recorded.*
- 12.34 ✅ S5 the offline reopen pair contests coherently, both halves with their own exact rules, nothing moved → **landed 12.272** (`:750`).
- 12.35 ✅ S6 the same batch twice is idempotent to the byte → **landed 12.273** (`:916`), two real calls through the object `POST /v1/sync` delegates to, compared with `toEqual`.

### App shells

- 12.36 ✅ the `tauri-plugin-sql` adapter maps the `SyncStorage` surface and observes transaction discipline → **landed 12.228** (`tauri-sql-storage.test.ts:22` the `run`→`execute` / `all`→`select` mapping, `:33` the transaction discipline).
- 12.37 ✅ the `op-sqlite` adapter, proven against the **shared conformance suite** over a real engine rather than a canned fake → **landed 12.224** (`op-sqlite-storage.test.ts:39`).
- 12.38 🟡 the editor webview bridge protocol → **landed 12.226** for the pinned names and tolerant parsing, fully and non-vacuously (`editor-web-view.test.ts:26–47`; the review-corrected version checks all four clauses of `isDocJson`, where the first draft checked one and would have persisted `{type:'paragraph'}` as a comment body the editor refuses on next load). **The component wiring is not covered** — `EditorWebView` itself has no test. *Owner: Plan 10 Task 17 / mobile shell.* **Note the plan named a protocol this build does not speak**: it assumed `{type: 'editor-ready' | 'set-doc' | 'doc-changed'}`; the shipped bridge is a **versioned** `{bridge, kind}` frame (`packages/editor/src/webview/bridge.ts`), which is Plan 7's real one — the plan's open question 8 anticipated exactly this and it resolved in Plan 7's favour.
- 12.39 ✅ the push registration stub registers, tolerates a missing transport, reports denial → **landed 12.227** (`register-push.test.ts:7` registers, `:20` tolerates a missing transport, `:26` reports denial).
- 12.40 🧪 desktop end-to-end smoke — `pnpm tauri dev`, sign in, toggle the network, watch a claim go pending → committed. **Genuinely manual and genuinely absent**: repo-wide search for `e2e|playwright|detox|maestro` returns hits only under `apps/web`; `apps/desktop` declares no e2e harness. *Owner: Plan 11 / e2e.*
- 12.41 🧪 mobile end-to-end smoke — dev build, airplane mode, edit, reconnect, watch the claim land or contest. Same method, same result: nothing under `apps/mobile`, no detox/maestro dependency. *Owner: Plan 11 / e2e.* **These are the first two 🧪 markers in this file** — before Task 18 the legend on line 3 was the only place the character appeared.

### Time: one clock, one day boundary (owner decision 2026-08-20 — Asia/Kolkata)

- 12.42 ✅ `formatIstInstant` prints India time and rolls the day at **IST** midnight, not UTC midnight — `18:29:59.999Z` is the 20th and `18:30:00.000Z` is the 21st, agreeing with `istDayOf` (`packages/domain/test/clock-skew.test.ts:44–68` — `:46` prints India time, `:55` rolls at IST midnight, `:58` agrees with `istDayOf`, `:62` prints one moment once from two spellings, `:66` passes an unreadable instant verbatim; `ist-day.test.ts` carries the boundary pair). The same moment stated as `+05:30` and as `Z` prints once; an unreadable instant travels verbatim rather than becoming an invented time.
- 12.43 ✅ a contested claim's banner and its converted comment carry the claimant's time in IST, never the raw instant — a claim made at 00:00 IST on the 21st does not read as the 20th → **landed 12.193** (banner) and **12.206** (converted comment), with the domain half at `contest-events.test.ts:139–156` minting the claim at `2026-08-20T18:30:00.000Z` and asserting `'21 Aug 2026, 00:00 IST'` **and** that the raw instant does not appear.
- 12.44 ✅ a sync retry re-answers the same **instant**, not merely the same characters: parsed `serverTime`, `seq` and `workspaceSeq` all match the first answer, and the stored `timestamptz` agrees with both → **landed 12.104** (`sync-route.test.ts:390–409`), comparing `Date.parse` rather than strings.

> **The `TZ` note this block owes its reader.** Case **12.194** (`packages/app-core/test/contests.test.tsx:97`) renders the IST day **under a non-IST `TZ`** and asserts that the `TZ` actually took effect — so 12.42/12.43's IST claims are not resting on the machine already being in Asia/Kolkata. **17 of this repo's 272 test files now vary `TZ`.** That number was zero when the executor brief's "known gaps" section was written, and the brief still says so; the rule it states — vary `TZ` explicitly on any clock-sensitive assertion — is now followed rather than pending. `contests.test.tsx:47–59` also documents the restore bug worth knowing: the naive `process.env.TZ = original` assigns the **string** `"undefined"` when `TZ` was unset, which ICU resolves to GMT, silently switching every later file in the same worker.

### The `sync-client` package's own structural guards — placed here because Task 18 was named their owner

- 12.319 ✅ **the two suites that had no case id in any `test-cases/` file.** (a) `packages/sync-client/test/barrel.test.ts` — the root barrel reaches **no native module, no test framework and no `node:` builtin**, and does not reach the adapter or the conformance suite at all. Its third and fourth tests are the reason this case is worth an id: *"actually walked the graph — the guard is not passing by reading nothing"* and *"the walker finds the forbidden imports where they really live"* are **positive controls on the guard itself**, the antidote to this series' signature defect. (b) `packages/sync-client/test/storage.test.ts` — `migrateLocal` creates the replica tables and stamps the version **idempotently**, plus the three `storageConformanceTests` assertions run against `better-sqlite3` (DDL/DML round-trip with named columns; a transaction that commits atomically and rolls back on throw; concurrent transactions **serialised** rather than interleaved). The same three run again against `tauri-plugin-sql` (**12.229** — `tauri-sql-storage.conformance.test.ts`, NOT 12.228, which is the `vi.fn()` fixture over `{execute, select}` and imports the suite zero times) and `op-sqlite` (12.224), which is what makes one storage interface a claim rather than a hope. **Correcting this file's own arithmetic, and the correction is APPLIED rather than merely narrated:** the count line above this file's replica section said *"the storage conformance suite's four"* — the suite has **three**, and the fourth test in that package run is `migrateLocal`. **That line now says so.** The first draft of this case asserted the correction in the past tense while leaving the line untouched, and a reviewer caught it — the same species as the three live falsehoods Task 18 removed, committed inside the change set that removed them. Barrel's four are four.

## The §11 closer: a contest's embedded claim is bound to its envelope

*Decided as a pure function (`apps/server/test/sync/contest-coherence.test.ts`), proven at the ledger
on both doors (`apps/server/test/sync/contest-coherence-door.test.ts`).*

- 12.45 ✅ a contest whose embedded claim names the same workspace, entity kind and ticket is accepted — the non-vacuity control every refusal below rests on (contest-coherence.test.ts)
- 12.46 ✅ a contest embedding a claim that names a **different workspace** is refused `contest.incoherent-original`, with the workspace sentence (contest-coherence.test.ts)
- 12.47 ✅ a contest embedding a claim that names a **different ticket** in the same workspace is refused, with a different sentence — one rule id covers the family, so the reason is what discriminates (contest-coherence.test.ts)
- 12.48 ✅ a contest embedding a claim about a **different entity kind at the same id** is refused; the ticket-id comparison cannot catch it, which is why kind is its own binding (contest-coherence.test.ts)
- 12.49 ✅ a doubly-forged contest names the wider fault first — the workspace comparison precedes the ticket one (contest-coherence.test.ts)
- 12.50 ✅ the check does NOT bind the claimant to the contest's actor — `claimant_id` depends on their differing (contest-coherence.test.ts)
- 12.51 ✅ the check does NOT bind envelope-origin: the contest is `'server'`, the refused claim is a client event (contest-coherence.test.ts)
- 12.52 ✅ the check does NOT bind `clientTime`, and answers null for any event that is not a `claim.contested` (contest-coherence.test.ts)
- 12.53 ✅ a payload that is not a contest payload at all answers null rather than throwing — shape is the vocabulary door's refusal, and a throw here would become an opaque 500 (contest-coherence.test.ts)
- 12.54 ✅ PLANTED DEFECT, the compound's own path: through the **internal** door (`ingestBatch`, ungated by design), a contest embedding a claim about a different ticket — and one naming a different workspace — is refused and **nothing reaches the append-only ledger** (contest-coherence-door.test.ts)
- 12.55 ✅ a **coherent** server contest still commits through the internal door and lands in `proj_contested` — without this, every refusal above is consistent with a check that refuses all contests (contest-coherence-door.test.ts)
- 12.56 ✅ only the forged contest in a batch is refused; its honest neighbour commits (contest-coherence-door.test.ts)
- 12.57 ✅ through the **client** door (`POST /v1/events`) by a caller who founded the workspace and wears an honest envelope-origin — so identity, membership and role all pass — an incoherent contest is refused and nothing is appended (contest-coherence-door.test.ts)
- 12.58 ✅ a client contest wearing server provenance still meets the envelope-origin refusal FIRST: the coherence check sits after Plan 4's gate, so a forger is told the fault it can act on (contest-coherence-door.test.ts)
- 12.59 ✅ `buildContestedClaim` derives workspace and entity off the refused claim, sets envelope-origin `'server'`, and carries the claim whole — coherence is structural, not checked (contest-coherence.test.ts)
- 12.60 ✅ what `buildContestedClaim` builds passes `checkContestCoherence` for an original in ANY workspace or ticket — the property, not one example (contest-coherence.test.ts)

## `proj_contested` — the contested-claims projection

- 12.61 ✅ a contest open is recorded keyed by both event ids, with `claimant_id` read off the **refused claim** and `contested_at` from the event's stored `serverTime`, never a clock read at apply time (contested-projection.test.ts)
- 12.62 ✅ a resolution records who, how, when, and the resolving event id (contested-projection.test.ts)
- 12.63 ✅ every other event type is ignored — determinism over defensiveness (contested-projection.test.ts)
- 12.64 ✅ a resolution aimed at an unknown contest FAILS LOUDLY; a silent no-op would leave a resolved contest showing as open forever (contested-projection.test.ts)
- 12.65 ✅ `reset` empties the table, asserted against a non-empty table so resetting nothing cannot pass (contested-projection.test.ts)
- 12.66 ✅ a rebuild in canonical `(entity_kind, entity_id, seq)` order derives the same bytes as a live application in a **different** arrival order — two ticket streams interleaved, with the orders asserted to DIFFER before the bytes are compared (contested-projection.test.ts)
- 12.67 ✅ `proj_contested` is registered LAST, after `proj_visibility`, in both registration pins — names and `[name, tables]` (projection-order.test.ts, entity-heads.test.ts)
- 12.81 ✅ the rebuild-and-diff verifier runs over `proj_contested` with a REAL row in it, not an empty table — `original_event` is the repo's first jsonb projection column, and `EXCEPT` diffs it in both directions between live and the shadow schema; the seed's non-emptiness is asserted separately so a clean verdict over nothing cannot pass (verify-projections.test.ts)

## `GET /v1/contests` — the read surface

- 12.68 ✅ answers 401 without a session, and never reaches the projection (contests-route.test.ts)
- 12.69 ✅ lists an open contest for a ticket the caller can see, carrying the refused claim whole (contests-route.test.ts)
- 12.70 ✅ PLANTED DEFECT: a caller who cannot see the ticket gets NO contest — not even its existence — though signed in and naming the right workspace (contests-route.test.ts)
- 12.71 ✅ `open=true` excludes resolved contests, and without it they are listed with resolution, resolver and instant (contests-route.test.ts)
- 12.72 ✅ filters by claimant for the My Work surface (contests-route.test.ts)
- 12.73 ✅ a workspace the caller is not in answers an empty list, not an error — "forbidden" and "empty" are the same answer, so the route is not an existence oracle (contests-route.test.ts)
- 12.74 ✅ a request with no `workspaceId` is refused 400 — the query is workspace-scoped by contract (contests-route.test.ts)
- 12.75 ✅ `getContest` is wired end to end: a `claim.contested_resolved` commits only because the server context can read `proj_contested` (engine-context.test.ts)
- 12.78 ✅ a resolution naming no recorded contest is refused `contest.unknown` — `null` here means "never recorded", which is what makes a refusal honest rather than a wiring bug in disguise (engine-context.test.ts)
- 12.79 ✅ a resolution aimed at a contest on ANOTHER ticket is refused `contest.wrong-ticket`, which is what makes the returned `ticketId` load-bearing rather than decorative (engine-context.test.ts)
- 12.80 ✅ a second resolution of the same contest is refused `contest.already-resolved` — the `resolved` column read back, so a hard-coded `false` cannot pass (engine-context.test.ts)

## Snapshot writer (Task 5) — `apps/server/test/sync/snapshot-writer.test.ts`

Every case in this section seeds the LEDGER ONLY — `insertEvent`, no projection — so `proj_tickets`,
`proj_workflows` and `proj_ticket_types` are empty throughout. That is not a shortcut, it is the whole
discriminator: `proj_tickets` is maintained by the SAME reducer the writer folds, so against a fixture
seeded through the full ingest path a writer that read the projection and a writer that folded the
ledger produce identical bytes and an equality assertion distinguishes nothing. Each of the six
implementation mutations named below was run and reddened the case named beside it.

- 12.85 ✅ below the threshold the pass writes nothing — asserted against a ledger the SAME run proves
  holds eleven events for the entity, so the empty result cannot be satisfied by an empty fixture or a
  query aimed at the wrong entity kind (snapshot-writer.test.ts)
- 12.86 ✅ the stored `state` equals a full independent fold of the ledger through `applyTicketEvent`,
  AND all three projections it could have been read from are asserted empty in the same test — the
  equality alone cannot see a wrong deps SOURCE, because the independent fold calls the same
  `buildLedgerDeps`. *Mutation: deps sourced from something empty in this fixture (what
  `proj_workflows` would be) → red, `applyTicketEvent: unknown ticket type "snap-task"`.*
  (snapshot-writer.test.ts)
- 12.87 ✅ the next pass RESUMES from the previous snapshot rather than folding from event 1 — pinned by
  the `afterSeq` bind value `readEntityEvents` is called with (exactly 21, the previous snapshot's
  seq), because both strategies compute the same state and an equality assertion here would be a check
  that cannot fail. *Mutation: fold from scratch → red, `expected [ +0 ] to deeply equal [ 21 ]`.*
  (snapshot-writer.test.ts)
- 12.88 ✅ a `claim.contested` sitting LAST on the ticket's stream still advances the snapshot's seq
  past it (61, not 60) and is not folded. Last, not mid-stream: with a foldable event after it both a
  correct and a broken writer answer 61. That seq is Task 6's resume cursor. *Mutations: advance seq
  only on folded events → red on the seq; drop the `TICKET_EVENT_TYPES` filter → red,
  `applyTicketEvent: not a ticket event: claim.contested`.* (snapshot-writer.test.ts)
- 12.89 ✅ a repeated pass at `minEvents: 0` — the only door that makes every entity due every pass —
  does not collide on the snapshots primary key. *Mutation: drop the guard → red, `duplicate key value
  violates unique constraint "snapshots_pkey"`.* (snapshot-writer.test.ts)
- 12.90 ✅ `startSnapshotWriter` writes REAL snapshots on its interval and the returned stop function
  halts it — the entity is made due again after stopping and the ledger head is asserted, so "nothing
  more was written" is a fact about the stop function rather than about there being nothing to write.
  Real timers, not fake ones: vitest's fake timers patch the timer functions only and do not wait for a
  pg round trip, so an advanced fake clock would read the snapshots table before the pass that writes
  it has returned. *Mutation: stop() made a no-op → red.* (snapshot-writer.test.ts)
- 12.91 ✅ a pass that rejects is logged with the failure's own words and the timer survives to run
  again, then stops when told to — a background sweep that can take the process down is a worse failure
  than a snapshot one interval late (snapshot-writer.test.ts)

- 12.92 ✅ a ticket type redefined in one workspace resolves to the LAST definition on the WORKSPACE
  stream, not the last by entity id — the two definitions sit on different entity streams (each
  `ticket-type.defined` gets a fresh ULID entity id, so per-entity `seq` is 1 for both and cannot order
  them against each other) and the WINNING one is deliberately given the SMALLER ULID, so the plan
  text's `(entity_kind, entity_id, seq)` ordering picks the loser. The id ordering is a premise the
  test asserts before relying on it — `newUlid()` turned out not to be monotonic within a millisecond,
  which that guard caught on its first run. *Mutation: the plan's ordering → red, `expected 'wf-a' to
  be 'wf-b'`.* (snapshot-writer.test.ts)
- 12.93 ✅ a workflow resolves to its GREATEST version even though a lower version was published later
  on the stream, the FIRST publisher of the winning version wins a tie (matching `proj_workflows`'
  `ON CONFLICT (workflow_id, version) DO NOTHING`), and neither map ever crosses a workspace — asserted
  in both directions, with the neighbouring workspace's own definitions resolving in the same run so
  "invisible here" cannot be satisfied by a loader that finds nothing anywhere. *Mutations: version
  comparison flipped → red, `expected 1 to be 3`; the tie loosened to `<=` → red, `expected 'A v3
  second' to be 'A v3 first'`; the workspace filter dropped → **red in exactly ONE case, this one**
  (`expected {…} to be undefined`), 974 of 975 green across all 88 server test files.* *(That last
  number said "red in seven cases" until it was measured. It was never measured; it was estimated from
  how many cases touch `buildLedgerDeps`, and it is the largest of the four self-falsifying counts this
  branch produced — 7 claimed against 1 actual. The lesson is not "count more carefully": a mutation's
  blast radius is not derivable from reading, only from running, so the number goes in AFTER the run or
  not at all.)* (snapshot-writer.test.ts)
- 12.94 ✅ `GET /v1/sync/bootstrap` hands a member the reducer-folded snapshot + tail for a ticket they
  can see, `me.projectIds` as real ULIDs and not `[key, value]` tuples (the plan's own snippet spreads
  `[...eff.projects]` — a `Map` — instead of `[...eff.projects.keys()]`; this case pins the fix by
  seeding the member onto a real project, so the bug and the fix disagree on the assertion rather than
  both producing `[]`), the ACTUAL `streamSeq` (checked against `readStreamSeq(db.pool, WS)`, not merely
  `> 0` — a hardcoded wrong value used to pass this case, fixed in the same round that added 12.98), and
  a tail that excludes everything at or below the snapshot's seq EXCEPT the four backfill types — content
  and contests are not ticket state, so a `comment.added` filed before the snapshot still travels.
  *Mutations, all confirmed red against this same test: reintroduce the tuple spread → `expected {…} to
  deeply equal {…}`, `projectIds` carrying arrays instead of strings; drop the backfill clause from the
  tail filter → the comment goes missing from `visible.events`; `const streamSeq = 1` → `expected 1 to be
  28`.* (bootstrap.test.ts)
- 12.95 ✅ planted defect: an invisible ticket is absent from a member's bootstrap — no id, no stub,
  nothing — with a positive control in the SAME request: the visible ticket's id must actually appear in
  the response body, so "invisible one absent" cannot pass by the route answering nothing to anyone.
  *Mutation: `listVisibleTickets` call replaced with a constant `[]` → red here (the positive control
  fails: the visible ticket's id is gone too) and red on 12.94 (`tickets` no longer has length 1).*
  (bootstrap.test.ts)
- 12.96 ✅ a guest gets definitions and exactly the ticket explicitly shared with them, not the
  workspace-mode ticket a member sees — a positive control on the empty case: "the guest gets `[]`"
  would otherwise pass for a route that returns `[]` to everyone. Also the ONLY case in this bucket
  exercising the un-snapshotted branch (`bootstrapTicket`'s `snapshot?.seq ?? 0` fallback): the shared
  ticket has too few events to have a snapshot yet, so this asserts `snapshot === null` and that its
  `events` carries its full history (`ticket.created`) — 12.94's ticket has a snapshot and never touches
  this branch. *Mutations: `listVisibleTickets` call replaced with a constant `[]` → red here AND on
  12.94, since the member's ticket also disappears; the guest case adds the proof that a NON-empty
  answer (the shared ticket) is reachable at all, which the member case alone does not establish for a
  guest's role branch; the `?? 0` fallback changed to `?? Number.MAX_SAFE_INTEGER` → red here
  (`expected false to be true`), while 12.94 stays green because its ticket does have a snapshot.*
  (bootstrap.test.ts)
- 12.97 ✅ `GET /v1/sync/bootstrap` 403s `{error:'not_a_member'}` for a signed-in caller who resolves no
  workspace role, and 401s a request carrying no session at all. *Mutation: `preHandler: requireSession`
  removed → red on the 401 assertion here, and red on every other case in this file too — every
  authenticated call in 12.94-12.96 now reaches the handler with no `request.currentUserId` to read.*
  (bootstrap.test.ts)
- 12.98 ✅ `GET /v1/sync/bootstrap` opens its transaction with the literal `BEGIN ISOLATION LEVEL
  REPEATABLE READ`, asserted directly rather than inferred from any value in the response body — no
  field in the payload can tell REPEATABLE READ apart from plain READ COMMITTED in a single-request test
  with no concurrent writer. `db.pool.connect` is wrapped for the duration of one request to record every
  SQL string every connection issues, and the literal is checked by membership rather than position
  (`requireSession` and other request machinery may open connections of their own). *Mutation: `BEGIN
  ISOLATION LEVEL REPEATABLE READ` changed to plain `BEGIN` → red, `expected […] to include 'BEGIN
  ISOLATION LEVEL REPEATABLE READ'`.* (bootstrap.test.ts)
- 12.99 ✅ the `definitions` query's `workspace_id = $1` filter, made observable the way 12.93 makes its
  sibling loader's: a second workspace (`WS2`) is seeded in `beforeAll` with its own
  `workflow.defined`/`ticket-type.defined` events and nothing else, and a member's bootstrap of `WS`
  asserts WS2's definition ids are absent and WS's own two are exactly what comes back. Without this
  fixture a single-workspace test cannot catch the filter being dropped — there is nothing foreign for a
  leak to carry. *Mutation: `workspace_id = $1` in the definitions query replaced with a harmless `$1 =
  $1` (keeping the bind count so the route does not 500 for an unrelated reason) → red on three cases at
  once — 12.94 (`expected […] to deeply equal […]`, extra types from WS2), 12.96 (`expected […] to have a
  length of 2 but got 4`), and this case directly (`expected […] to not include`).* (bootstrap.test.ts)
- 12.115 ✅ a `visibility.set` filed BELOW a ticket's snapshot seq still reaches the replica. The
  registry binds THIRTEEN types to `entityKind: 'ticket'`; `TICKET_EVENT_TYPES` folds ten and
  `BOOTSTRAP_BACKFILL_TYPES` carried four, two of them overlapping — union twelve, and the one type in
  neither set was `visibility.set`. The snapshot writer skipped it while still advancing `seq` past it,
  so below the snapshot it was dropped from the payload entirely while an identical event ONE SEQ ABOVE
  travelled in full: not an exclusion but an accident of when the background pass last ran.
  **No existing fixture could see it** — `applyAll` + `setVisibilityEnv` run the PROJECTIONS only
  (`test/helpers/seed.ts`) and write no `events` row, so the whole file contained zero `visibility.set`
  ledger rows. This case seeds a REAL one, at seq 2 under a snapshot at seq 27, and asserts the snapshot
  seq as a PREMISE first so the case cannot pass vacuously if the fixture's arithmetic ever shifts the
  event above the cut. *Mutation: `'visibility.set'` removed from `BOOTSTRAP_BACKFILL_TYPES` → red here
  alone, `expected [] to have a length of 1 but got +0`, the other nine cases in the file green.*
  (bootstrap.test.ts)
- 12.116 ✅ a `claim.contested` and its `claim.contested_resolved`, both filed BELOW a ticket's snapshot
  seq, travel in full — the case that makes the two contest entries in `BOOTSTRAP_BACKFILL_TYPES`
  load-bearing. **Before it, they were decorative:** deleting BOTH from the constant — which makes
  bootstrap silently omit every contest predating a ticket's snapshot, exactly the failure the design
  note exists to prevent — left the whole server suite green (*measured by the review at `06b6ec2`, where
  the suite was 971 tests over 88 files; this sha's suite is 975 over 88, and the same mutation now
  reddens this case*). 12.94's "drop the backfill clause" mutation
  pins the CLAUSE and only through `comment.added`; the fixture had no `claim.contested` on any
  snapshotted ticket. This is the T6 half of the branch's one cross-task property (T5 advances the
  cursor past a contest without folding it — 12.88; T7 appends it — the degrade set; T6 must backfill it
  regardless of position — here). *Mutation: both contest entries deleted from
  `BOOTSTRAP_BACKFILL_TYPES` → red here alone, `expected undefined to be defined`, the other nine green.*
  (bootstrap.test.ts)
- 12.117 ✅ `definitions` arrives in ASCENDING `workspace_seq` order, so a replica folding it in the
  order received resolves the same definition the server's own `buildLedgerDeps` does — asserted by
  doing exactly that fold and comparing against `buildLedgerDeps` in the same test. The route shipped
  `ORDER BY entity_kind, entity_id, seq`, which is the ordering **this file's own 12.92 exists to prove
  wrong**: a ticket type's key lives in its PAYLOAD and successive definitions of one key arrive on
  different entity streams, so per-entity `seq` is 1 for both and the id ordering resolves the winner by
  ULID collation. Nothing constrained it — 12.94 `.sort()`s the types before comparing, 12.96 checks a
  length, 12.99 checks ids by membership. The fixture mirrors 12.92's construction in a third workspace:
  one key defined twice, the WINNER given the smaller ULID, so the shipped ordering hands the replica
  the loser last. The premises are stated order-INSENSITIVELY on purpose, so the mutation fails on the
  consequence rather than on a premise. *Mutation: `ORDER BY workspace_seq` → `ORDER BY entity_kind,
  entity_id, seq` → red here alone, `expected '<WS3_WF_OLD>' to be '<WS3_WF_NEW>'` — the replica
  resolving the superseded workflow binding — the other nine green.* (bootstrap.test.ts)
- 12.118 ✅ the stream cursor is read BEFORE the first per-ticket tail read, not merely inside the same
  transaction. Three places on this branch asserted the ordering and Features.md claimed "both halves of
  that claim are now pinned by the tests"; only one half was. 12.98 checks the isolation level **by
  membership**, and its own note says so — membership cannot see position, so it constrained nothing
  about where the cursor read sits. Moving `readStreamSeq` to immediately before `COMMIT`, after the
  whole visible-ticket loop, left every bootstrap case green (*measured by the review at `06b6ec2`, where
  this file held six*). This reuses 12.98's `db.pool.connect`
  recorder, which already captured every SQL string in issue order, and compares `indexOf` of
  `readStreamSeq`'s literal against `readEntityEvents`'. Both indexes are asserted `>= 0` FIRST: the
  recorder only sees queries passed as plain strings, and a query passed as a `{text, values}` config
  object would record nothing, making `-1 < -1` false but `-1 < 0` true for a reason unrelated to
  ordering. *Mutation: `readStreamSeq` moved to immediately before `COMMIT` → red here alone, `expected
  24 to be less than 21`, the other nine green.* (bootstrap.test.ts)

## `POST /v1/sync` (Task 7) — `apps/server/test/sync/sync-route.test.ts`

Every case here seeds through REAL events and REAL projections and signs its caller in over the wire,
so the session user id under test is the one the token resolves to. **The two cases marked DOOR TEST
are the reason this file exists**: they are the only ones that discriminate `ingestClientBatch` (the
gated door, which this route must use for the client's own claim) from `ingestBatch`/`serverAppend`
(the internal one, which the plan's own snippet reached for). Every other refusal here is an ENGINE
refusal, which fires on both doors and therefore proves nothing about which was used.

- 12.100 ✅ a legal offline claim commits and the answer carries the REAL workspace stream position —
  `seq`, `workspaceSeq` and `serverTime` compared against the row ingest actually wrote, not merely
  `typeof === 'number'`, which a hardcoded constant satisfies (sync-route.test.ts)
- 12.101 ✅ an engine refusal (`restrict-to` on an assignee-only edge) becomes a `claim.contested`
  ledger event carrying envelope-origin `'server'`, one `proj_contested` row keyed to both event ids,
  and an embedded claim whose workspace and entity match the contest's — coherence being STRUCTURAL
  here, because the append goes through `buildContestedClaim` rather than a hand-rolled
  `newSubmittedEvent` (sync-route.test.ts)
- 12.102 ✅ **DOOR TEST** — an offline claim wearing envelope-origin `'server'` is still refused by
  `checkRolePermission` (`permission.role`, `SERVER_ORIGIN_REASON`) and contested; the forged claim
  itself never reaches the ledger. No engine rule refuses a `ticket.field_set` for its provenance, so
  through the internal door this claim COMMITS and a client wears the server's own provenance in an
  append-only ledger. *Mutation: `deps.ingest.ingestClientBatch([event], userId)` replaced with
  `deps.serverAppend([event])` → red, `expected { status: 'committed', …(4) } to match object
  { status: 'contested', …(3) }`. And the reflex form does not even compile: `deps.ingest.ingestBatch`
  → `error TS2339: Property 'ingestBatch' does not exist on type 'ClientIngest'`.*
  (sync-route.test.ts)
- 12.103 ✅ **DOOR TEST** — a claim on a ticket the caller can no longer see is contested
  `permission.visibility` / `TICKET_NOT_VISIBLE_REASON` by `checkVisibilityPermission`, a DIFFERENT
  gate check from 12.102's, so neither door test is load-bearing alone. It is a door test at all only
  because the plan's step-6 local visibility pre-check was deliberately not implemented — with a
  duplicate check in `sync-service.ts` this case would pass through the ungated door too. *Mutation:
  the same `serverAppend([event])` swap → red, same sentence.* (sync-route.test.ts)
- 12.104 ✅ a retried committed claim re-answers the same INSTANT, seq and cursor with no second ledger
  row — instants via `Date.parse`, not string equality, so a change in how either side spells an
  instant is caught as a formatting change instead of being mistaken for a broken idempotency contract
  (sync-route.test.ts)
- 12.105 ✅ a retried CONTESTED claim answers the one recorded contest — same `contestEventId`, one
  `proj_contested` row, no second `claim.contested` — and the request is 200 rather than a 500 taking
  the batch with it. Case 12.83's sequential half (sync-route.test.ts)
- 12.106 ✅ the SAME refused claim twice in ONE batch is answered twice from the contest the earlier
  iteration committed, and the batch's legal third event still commits. The failure this pins is not
  the duplicate contest but what it did to its NEIGHBOURS: the throw left `processBatch` entirely.
  *Mutation, run in two stages: disabling the `storedContest` lookup alone changes nothing (the
  constraint catch covers it); disabling BOTH → red here and on 12.105, `expected 500 to be 200`,
  which is 12.83 reproduced.* (sync-route.test.ts)
- 12.107 ✅ a claim whose `actorId` is not the session user is `invalid` `actor-mismatch` and records
  no contest — which is also what makes 12.82's claimant-forgery half unreachable through this door
  (sync-route.test.ts)
- 12.108 ✅ a client-supplied `claim.contested` is `invalid` `reserved-type`, and the answer is that
  rather than `contest.incoherent-original` even though the embedded claim names a different entity
  kind AND a different entity — the door's step 3 is upstream of ingest entirely, which is 12.84's
  question answered rather than left open (sync-route.test.ts)
- 12.109 ✅ an envelope error answers `invalid` and records NO contest — a malformed claim is not a
  well-formed claim, so there is nothing coherent to embed in a contest's payload (sync-route.test.ts)
- 12.110 ✅ the interactive door NEVER records a contest for the same refusal — no `proj_contested`
  row, no ledger row — with the sync door's contest for the same refusal asserted in the same test as
  the control, so "the interactive path recorded nothing" cannot pass for a fixture in which nothing
  was refusable (sync-route.test.ts)
- 12.111 ✅ a refusal on a NON-ticket entity (`membership.granted` by a member) answers `refused` with
  no contest — there is no ticket to attach one to. Incidentally a third door discriminator: the same
  `serverAppend` swap turns it into a commit (sync-route.test.ts)
- 12.112 ✅ 401 without a session, and 400 for an `events: []` body — HTTP status means "was this a
  batch", per-event answers ride inside `results` (sync-route.test.ts)
- 12.113 ✅ a retry of an ALREADY-COMMITTED claim is answered from the ledger even after the caller has
  lost the ticket, with a fresh claim on the same ticket refused in the same test as the control. This
  is the case that decides the ledger lookup must sit BEFORE ingest: 12.104 cannot tell the two
  placements apart, because the `duplicate-event-id` fallback produces an identical result object while
  the caller can still see the ticket. *Mutation: the step-4 lookup replaced with a constant `null` →
  red here alone (`expected { status: 'contested', …(4) } to deeply equal { status: 'committed',
  …(4) }`), all **fourteen** other cases green — `PASS (14) FAIL (1)`, re-measured.* *(This said
  "thirteen" because it was written when 12.113 was the file's last case; the round that added 12.114
  updated the HIGHEST-ID line and not this sentence. A count of "the others" is a fact about the file's
  size at one moment, so it goes stale the next time the file grows — which is why the recount is
  stated with the runner's own line rather than as a bare number.)* (sync-route.test.ts)
- 12.114 ✅ a claim naming a ticket bound to ANOTHER workspace answers `refused`
  `entity-workspace-mismatch` **inside `results`**, and the batch around it survives: `[legal1, bad,
  legal2]` → 200 with three index-aligned answers, `legal2` actually in the ledger, no ledger row and
  no `proj_contested` row for the bad claim, and a retry answering identically so an outbox holding it
  drains instead of wedging. Before the fix this was a **500**: `contest()` threw because
  `buildContestedClaim` copies the refused claim's `workspaceId` and `entity` verbatim, so the contest
  is the SAME mis-filing and meets the SAME `commitOne` guard. Two positive controls run in the same
  test — `POST /v1/events` answering the identical claim with the identical `rule` and `reason`
  (the side-by-side the wire contract is written against), and an in-workspace ticket refusal still
  becoming a recorded contest, without which a fixture whose seeds had quietly stopped working would
  refuse everything and pass this case for the wrong reason. *Mutation: restore
  `if (appended?.status !== 'committed') { throw … }` → red here alone, `expected 500 to be 200`, the
  other fourteen cases green.* (sync-route.test.ts)

## Carried, with owners — and what Task 7 closed

- 12.76 ✅ **closed by Task 7, and scoped rather than declared shut.** Nothing at the coherence layer
  can establish that a contest's embedded claim was actually refused, by the rule the contest names —
  that is still true and `contest-coherence.ts` still says so. What changed is the producer: the ONE
  production caller that files contests is `POST /v1/sync`, and it passes the `Refusal` it is holding
  straight into `buildContestedClaim`, so on that path the guarantee is structural at the point of
  construction. 12.101 asserts the contest carries the rule the refusal named; 12.102/12.103 assert it
  for two refusals produced by the permission gate. *The class is not closed for a contest built any
  other way — `checkContestCoherence` remains the net for those, and it still cannot see this.*
- 12.77 ✅ the `POST /v1/sync` door is enumerated, by 12.100-**12.114** (fifteen cases; this read
  `12.100-12.113` until the recount, the same stale-by-one artifact as 12.113's own sentence — and in an
  entry that reads as a CLOSURE claim, where an undercount silently narrows what was closed). It calls `ingestClientBatch`, so it
  inherits both the permission gate and the coherence check; the two DOOR TESTs above pin that, and the
  route's deps type makes the wrong call a compile error rather than a comment.
- 12.82 🟡 **narrowed by this door, NOT closed as a class.** Two of the free fields the coherence check
  leaves alone are unreachable through `POST /v1/sync`: `originalEvent.actorId` cannot be forged,
  because step 2 refuses any claim whose actor is not the session (12.107), so no contest filed through
  this door can name a claimant who did not submit it; and `originalEvent.type`/`payload` are NOT
  merely `submittedEventSchema`-shaped here, because the embedded claim has already been through
  `parseEvent`, which validates the type against the registry and the payload against that type's own
  schema. **Both remain fully open through `ingestBatch`**, which is where 12.82 measured them, and
  `renderContestedClaimText` still renders whatever it is given. *Owner for the general case: unchanged
  — whoever closes the `ingestBatch` contest path, or Plan 10 Task 18 if it re-scopes.*
- 12.83 ✅ **confirmed as a live defect and closed FOR THIS DOOR — and the first round's scoping of the
  residual was WRONG, which is why this entry was rewritten.** Reproduced here, not inherited: with
  both guards removed, a second sync request carrying the same refused claim answers **500** and takes
  its whole batch with it (`expected 500 to be 200`, 12.105 and 12.106). `POST /v1/sync` performs the
  `proj_contested.original_event_id` lookup the index's own migration COMMENT describes, and catches
  `proj_contested_original_idx` by name for the residual two concurrent requests can still race into.

  **What the first round got wrong.** It scoped the residual SOLELY to `isUniqueViolation` matching only
  `events_pkey` — i.e. to duplicate contests — and on that basis called the class closed for this door.
  It was not: a second batch-killing throw sat in `contest()` itself, reachable through a path with no
  unique violation anywhere in it. `commitOne` refuses `entity-workspace-mismatch` as a `refused` on a
  ticket entity; `processOne` sends any ticket refusal to `contest()`; `buildContestedClaim` copies the
  refused claim's `workspaceId` and `entity` verbatim, so the contest is the same mis-filing and the
  same guard refuses it; `contest()` threw on the non-committed append and rejected the whole
  `processBatch`. **500, unrecoverably** — the retry 500s, the solo claim 500s, and every event queued
  behind it in the outbox never syncs. Closed by degrading a `refused` contest-append to the claim's
  own refusal instead of throwing, which closes it as a CLASS rather than as a rule: any future refusal
  a server-authored contest cannot survive now rides inside `results`. 12.114 pins it. *That the degrade
  cannot quietly turn this door back into the interactive one is measured, not argued: forcing the
  degrade to take EVERY contest-append reddens eight cases — 12.101, 12.102, 12.103, 12.105, 12.106,
  12.110, 12.113 and 12.114's second control.* The throw is kept
  for a contest-append that comes back `invalid` or absent — a server-built envelope the server's own
  door calls malformed, which has no honest per-event answer to give.

  **What remains open, stated as the absence and not as partiality**: `isUniqueViolation` still matches
  only `events_pkey`, so any OTHER `ingestBatch` caller that appends two contests embedding one refused
  claim still rejects its whole batch — that half is untouched, and it is a different mechanism from the
  one 12.114 closes. *Owner: whoever next touches `commitOne`'s duplicate handling — named here rather
  than fixed inside a route task.*
- 12.84 🚫 **out of scope for this door, with the reason measured rather than asserted.** The
  `entity.kind` comparison cannot be reached through `POST /v1/sync` at all: step 3 refuses every
  client-supplied `claim.contested` as `reserved-type` before ingest is called, which 12.108 pins by
  submitting a contest whose embedded claim names a different entity kind AND asserting the answer is
  `reserved-type` and not `contest.incoherent-original`. So this task cannot supply the door test 12.84
  asks for — it can only prove the door does not open. The remaining production path,
  `buildContestedClaim`, is structurally incapable of a mismatch (12.59/12.60). *Owner if the series
  ever wants a real door test for that comparison: whoever adds a second server-side contest producer;
  there is exactly one today.*


## The replica (Task 9) — `packages/sync-client/test/replica.test.ts`

**EVERY ENUMERATION IN THIS SECTION IS A RUN OF `vitest run test/replica.test.ts` ALONE**, which is
what its `(20)` denominators mean. Task 9 also owns 12.154–12.155, which live in
`packages/sync-client/test/recorded-hazards.test.ts` and have their own section at the end of this
file; run package-wide, some of the mutations below ALSO redden those two — measured for 12.128
(it does) and 12.129 (it does not), and not measured for the other seventeen.

**Nineteen `it` declarations, one per id 12.119–12.137, running as TWENTY tests** — 12.132's `it`
sits inside a two-zone loop, so it executes twice. Both numbers are stated because neither implies the
other, and each is measured: `grep -nE "^[[:space:]]*it\(" packages/sync-client/test/replica.test.ts`
prints nineteen lines, one per id, **enumerated rather than counted**: a count with no rows behind it
is how the wrong number in this very paragraph survived once before. The runner's own line reads
`Tests 20 passed (20)`.
**Every one of the nineteen ids was proved able to fail** — enumerated case by case below, each with
the mutation that reddened it. Twenty source mutations have now been applied one at a time to
`packages/sync-client/src/replica/`, restored by `cp` from a pre-mutation backup between runs and
re-verified with `git diff` (never `git checkout --`, and never shell `diff`, which has returned a
false "identical" on this machine). The harness's own control was a null mutation (text replaced with
itself) → `20 passed (20)`, so the reddenings are the mutations and not the harness.

**Every "red here alone" below was RE-MEASURED in the fix round, and four enumerations were false.**
The corrections are in the notes themselves; the pattern they share is worth naming once, because it is
the one this file's own header warns about: an enumeration is a fact about a moment, and nothing
re-derives it when a case is appended below. 12.120's and 12.125's were falsified by cases in the very
round that wrote them; 12.121's by 12.135 a round later; 12.122's claim about what it discriminates was
never true.

**One thing in this module is deliberately NOT covered here, recorded rather than left implicit**: the
`DELETE FROM outbox WHERE event_id = ?` in `applyServerItem` — "an echo of our own claim confirms it".
The `outbox` table exists (Task 8's schema) so the statement compiles and an echo cannot leave a queued
row behind forever, but its semantics belong to the outbox, and no case here exercises them. *Owner:
Plan 10 Task 10 (outbox + local pre-check).* It gets no id of its own, because an id here would burn
the number Task 10's own echo case will want and the never-renumber rule would keep it burned.

- 12.119 ✅ `ticket.created` + `ticket.transitioned` + `ticket.field_set` fold into a `TicketState`
  through `applyTicketEvent`, and the transition log entry keeps `toStateId`, `actorId`, `seq`,
  `workflowId` and the `workflowVersion` its destination is written in. **The payload spells the
  destination `to` and the log entry spells it `toStateId`; both are correct and deliberately not
  unified** (`packages/domain/src/ticket-state.ts` header) — the plan's own snippet for this task
  builds the payload as `{ toStateId }`, which zod refuses. *Mutation: hand the reducer a constant
  per-entity `seq` from `rowToEnvelope` → red here, on 12.122, 12.123, 12.124 and 12.137
  (`Tests 5 failed | 15 passed (20)`). 12.137 was added after this note and is included by
  re-measurement, not by inheritance.*
- 12.120 ✅ a duplicate event id answers `{ applied: false }` and adds no second ledger row —
  at-least-once delivery is the contract. *Mutation: drop the `SELECT 1 FROM events WHERE id = ?`
  guard → red here **and on 12.133** (`Tests 2 failed | 18 passed (20)`). This note said "red here
  alone" until it was measured: 12.133 asserts that `onChange` does not fire on a redelivered event,
  and `applyServerItem` answers `applied: false` — which is what holds the beat count at 1 — only
  because of this guard. The two cases were written in the same round and neither was checked against
  the other.*
- 12.121 ✅ a `claim.contested` folds into the `contests` table and NOT into ticket state (the ticket
  stays in `todo`), `claimantId` is the actor of the **refused claim** rather than of the contest the
  server filed, and `claim.contested_resolved` flips `resolved`/`resolution` so `{ open: true }`
  empties. The `[]` carries a positive control from the same call: unfiltered, the contest is still
  there. *Mutation: skip `applyContest` → red here, on 12.127, on 12.135, on 12.137 and on both
  12.132 runs — FIVE ids across SIX runs (`Tests 6 failed | 14 passed (20)`). This note said "red here,
  on 12.127 and on both 12.132 runs" — four runs — and was already false when 12.135 landed in a later
  round without it being re-derived; 12.137 has since been added on top.*
- 12.122 ✅ bootstrap folds a snapshot plus the events past its `seq`: a backfilled `comment.added` at
  seq 2 sits below a snapshot at seq 3, the seq-4 transition folds, and the ticket lands in `doing`
  with a one-entry transition log. The cursor lands at `streamSeq`, and `searchLocal` finds the ticket
  by comment text through `docToPlainText`, with a positive control (a phrase in no comment and no
  title) returning `[]` from the same call. **What this case does NOT constrain, corrected because the
  sentence here claimed otherwise:** it read *"the transition log's LENGTH is what tells a correct fold
  from a whole-tail replay"*, and that is measured false — forcing `refoldTicket` to replay from seq 0
  leaves this case GREEN and reddens 12.124 alone (`Tests 1 failed | 19 passed (20)`). The only
  sub-snapshot event in the fixture is a `comment.added`, and `applyTicketEvent` returns state
  unchanged for it (`packages/domain/src/ticket-state.ts`), so a windowed fold and a whole-tail replay
  produce the identical one-entry log. **And no realistic bootstrap fixture could do better**: of the
  five `BOOTSTRAP_BACKFILL_TYPES`, only `comment.added` and `attachment.added` are in
  `TICKET_EVENT_TYPES`, and both are reducer no-ops — so on any input the server actually sends, the
  `AND seq > ?` window is unobservable through this module's public surface. That is the same fact
  12.131 records from the other side ("every backfilled type that can sit below a snapshot today is a
  reducer no-op"), and it is why the window is held by **12.124**, where the fold's own snapshot puts a
  DROPPED state behind the baseline and replaying it throws. *Mutation: read the title from a top-level `title` property instead of the
  `fields.title` claim the reducer writes → red here alone.*
- 12.123 ✅ an arriving `workflow.defined` whose new version RE-CATEGORISES a state moves the ticket's
  `stateCategory` and `workflowVersion` without moving the ticket, and leaves the transition log
  byte-identical — each entry keeps the workflow and version whose vocabulary its `toStateId` is
  written in, which is the only thing that lets `require-different-user` walk it forward later.
  *Mutation: write the fold's snapshot but leave the `tickets` row stale → red here, on 12.124 and on
  12.125's positive control.*
- 12.124 ✅ a version that DROPS the state a ticket stands in moves it where `stateMapping` says, and
  **the fold writes the folded state as the ticket's replay baseline**, asserted on the `snapshots`
  row directly. The next `ticket.transitioned` then folds on top of that baseline. *Mutation: delete
  the `writeSnapshot` call in `foldTicketsOntoVersion` → red here and on 12.131; the failure is the
  planted defect the plan describes — `refoldTicket` replays the seq-2 move into `doing`, a state v2
  no longer has, and `applyTicketEvent` throws.*
- 12.125 ✅ a HOLE in the version chain (v1 held, v3 arrives, v2 never delivered) is refused as a hole
  — `foldTicketToWorkflowVersion`'s own pre-check message — and not as an unmapped drop, and the whole
  arrival rolls back: no `events` row, no `workflows` row, ticket unmoved. **Positive control in the
  same case**: the identical v3 publish succeeds once v2 is delivered first, so the refusal is about
  the hole. *Mutation: make `workflowVersionsOf` answer the latest definition for every version —
  i.e. unify it with the reducer's lookup → red here **and on 12.134** (`Tests 2 failed |
  18 passed (20)`), and silently WRONG rather than loud: the ticket folds to v3 through a definition it
  never sat in. This note said "red here alone"; 12.134 asserts `versions(3)` is `null` directly, in
  the same file, deliberately pairing the two lookups — and a lookup that answers the latest definition
  for every version cannot answer `null`. Two cases written to pair with each other, neither
  cross-checked against the other's mutation.*
- 12.126 ✅ purge leaves no readable trace: `getTicket` null, `listEntityEvents` empty, and the
  `events` / `tickets` / `snapshots` / `contests` **rows** (printed, not counted) empty for that id,
  plus no row anywhere whose payload still contains the comment text. A second ticket created
  afterwards in the same store is the positive control, so those empties are deletions and not an
  empty database. **The `searchLocal` assertion in this case is decoration and says so in the file**:
  `searchLocal` skips a comment whose ticket row is gone, so it would be `[]` even if every event row
  had survived. *Mutation: stop deleting the ledger rows → red here alone.*
- 12.127 ✅ purge keeps **this user's own** contested-claim stub and drops another user's, both halves
  in one case (honesty invariant 5: the `originalEvent` in my own stub is what I authored on this
  device). *Mutation: delete every contest regardless of claimant → red here alone.*
- 12.128 ✅ a workspace `scope-revoked` empties the replica of that workspace — tickets, definitions
  (`workflows`, `ticket_types`) and the resume cursor — and a re-delivered instruction is a no-op
  rather than a throw. *Mutation: keep the definitions → red here alone IN THIS FILE'S OWN RUN; over
  this file plus `test/recorded-hazards.test.ts` it reddens **12.155** too (`Tests 2 failed |
  20 passed (22)`), because 12.155's workspace-wide half depends on `ticket_types` being emptied.
  Measured, not inferred — and it is why those two cases are not in this file.*
- 12.129 ✅ a project `scope-revoked` removes that project's tickets alone, leaves another project's
  ticket standing, and leaves the definitions and the cursor in place — the member is still in the
  workspace. *Mutation: ignore `projectId` → red here alone, and still alone over this file plus
  `test/recorded-hazards.test.ts` (`Tests 1 failed | 21 passed (22)`) — measured, because 12.155's
  project-scoped half deletes its ticket under either behaviour.*
- 12.130 ✅ **filter before folding, on both doors.** Thirteen event types bind to
  `entityKind: 'ticket'` and `applyTicketEvent` folds ten; a `visibility.set` arriving over sync AND a
  `visibility.set` in a bootstrap ticket tail are both stored without folding and without throwing.
  This is the common path, not an edge case — bootstrap backfills `claim.contested` unconditionally.
  *Mutation: drop the `TICKET_EVENT_TYPES` membership test in `refoldTicket` → red here **and on
  12.137** (`Tests 2 failed | 18 passed (20)`), with `applyTicketEvent: not a ticket event:
  visibility.set` here and `… : claim.contested` there.* **Read this case's scope narrowly**: the only
  type it puts in front of the guard is `visibility.set`. The sentence above — and `replica.ts`'s own
  docblock, and `Features.md` §12 — rest the "common path, not an edge case" claim on `claim.contested`,
  and until 12.137 was added no case put a `claim.contested` where the filter had to catch it: a
  contest arriving over sync is answered by `applyServerItem`'s `CONTEST_TYPES` branch before the
  ticket branch and triggers no refold of its own, and 12.135's contest sits below the snapshot `seq`
  where the window keeps it away from the reducer whatever the filter does. The guard was proved on the
  secondary example and asserted on the primary one.
- 12.131 ✅ the fold never moves a ticket's replay baseline BACKWARDS: bootstrap can leave backfilled
  ticket-entity events below the snapshot's `seq`, and a fold that set the new baseline to
  `MAX(events.seq)` alone would drop it from 5 to 2, putting pre-fold history back in front of the
  reducer in a vocabulary that no longer contains it. **Stated honestly: every backfilled type that
  can sit below a snapshot today is a reducer no-op, so the damage is not yet observable through the
  public surface** — which is why the `snapshots` row is asserted directly. *Mutation: drop the
  `Math.max` against the standing baseline → red here alone.*
- 12.132 ✅ instants survive the replica **byte-for-byte**, and the case runs twice: under
  `TZ=America/Los_Angeles` and under `TZ=Asia/Kolkata`. `serverTime`, `clientTime` and a contest's
  `contestedAt` come back as the ISO `Z` strings that went in; ordering `contested_at` as TEXT is
  chronological across IST midnight (`18:29:59.999Z` / `18:30:00.000Z`); and `istDayOf` over those
  stored strings answers `2026-08-20` / `2026-08-21` **identically under both timezones**. Each run
  opens with a positive control — `new Date('…18:30:00.000Z').getHours()` is 11 under LA and 0 under
  IST — because without it the case could pass while the process never left the machine's own zone.
  **A claim in the brief that commissioned this task is corrected rather than repeated: `TZ` is NOT
  unvaried in this repo**, and the lane's own commit says the same thing independently. Measured with
  the command, both property-access spellings:
  `grep -rlE "process\.env(\.TZ|\['TZ'\]) *=" --include='*.ts' --include='*.tsx' packages apps` →
  **16 files, this one included**. The first attempt at this number here said *four*, because it
  matched only `process.env.TZ` and this repo's strict settings push most call sites to
  `process.env['TZ']` — a grep that sees one spelling of two returns a well-formed wrong answer with
  no error, which is why the count above ships with its command. **This bullet said 15 until the fix
  round, and 15 was true when it was written**: `origin/main` measured 14, this batch's `40762a6`
  (which added this very case) 15, and `e0c73ba` — Task 10's own commit, later in the same PR — 16,
  because 12.152 in `test/outbox.test.ts` varies `TZ` too and does it with the dotted spelling, moving
  both this count and the dotted sub-count. So this is the first TZ-varying test WRITTEN in
  sync-client rather than the only one, 12.152 is the second, and the control follows a convention
  several of those files already spell out. They also record the limit it inherits: `process.env.TZ` is live for V8's `Date` getters
  under vitest's `forks` pool (sync-client sets no `pool`, so it gets the v3 default) and INERT under
  `threads`, where every zone claim would silently be a no-op. **And the honest ceiling, since the
  lane's correction names it**: varying `TZ` is evidence only where the value under test moves with it.
  Here the device-offset mutation reddens under BOTH zones, so the non-IST run catches no bug the IST
  run misses; what it establishes is the negative — that nothing on this path moves with the machine's
  zone — which an IST-only run on an IST machine cannot show, and which is the property Tasks 12 and 13
  build their day math on. *Mutation: re-render
  `serverTime` through the device offset in `rowToEnvelope` → red under **both** timezones, measured
  rather than assumed. The non-IST run is not catching a bug the IST run misses; what it establishes
  is that the case is evidence about the code and not about a machine that happens to be in
  Asia/Kolkata.* Task 9 itself derives no days — its produced surface has no day-shaped method and its
  implementation calls no ist-day symbol — so what it owes Tasks 12 and 13 is exactly this: unparsed,
  un-re-rendered instants for their `istDayOf` to read.
- 12.133 ✅ `onChange` fires once per APPLIED item, not on a duplicate (a view that re-rendered on
  every at-least-once redelivery would flicker for a whole catch-up), and the returned unsubscribe is
  honoured. *Mutation: notify unconditionally → red here alone.*
- 12.134 ✅ `setCursor`/`getCursor` round-trip, a cursor for an unheld workspace is 0 rather than this
  one's, `getMe` returns what bootstrap stored, and `buildDeps` answers **any** workflow id at the
  **latest** version (the `getWorkflow` pure-by-id contract `ticket.workflow_rebound` depends on),
  while `workflowVersionsOf` still answers for the older version and `null` beyond the newest — the
  two lookups over one table, side by side, in one case. *Mutation: make `buildLocalDeps` take the
  OLDEST version → red here and on 12.124.*
- 12.135 ✅ a `claim.contested` BELOW a snapshot's `seq` lands in the contests table and is never
  folded. This is the shape bootstrap actually produces — `claim.contested` is backfilled
  unconditionally, so it arrives at whatever seq it was recorded at, snapshot or no snapshot — and no
  other case in this file puts a contest below a baseline. The two halves are held by different code
  and the mutations say so: the contests half by `loadBootstrap` applying contest types irrespective
  of seq (*mutation: gate `applyContest` on `seq > snapshot.seq` → red here alone*), the never-folded
  half by the `TICKET_EVENT_TYPES` membership test, not by the seq window — measured, not assumed:
  *making `refoldTicket` replay from seq 0 reddens 12.124 and NOT this case*, because the filter
  catches the contest either way.
- 12.136 ✅ **refresh on publish, on the BOOTSTRAP door** — a snapshot recorded at `workflowVersion: 1`
  arriving alongside a bootstrap that ships v1 AND v2 is folded forward before its tail is replayed:
  the re-categorised half lands `{stateId: 'doing', stateCategory: 'open', workflowVersion: 2}`,
  byte-identical to what 12.123 asserts on the stream door, with the transition log carried across
  unchanged in v1's vocabulary; the DROPPED half — which a re-categorisation cannot show — moves where
  `stateMapping` says rather than leaving the ticket standing in a state the workflow no longer has;
  the folded state is written as the replay baseline with the baseline `seq` **carried across
  unchanged** (asserted on the `snapshots` row), because the tail above it has not been applied yet and
  raising the baseline would skip it; and a positive control from the same helper — a bootstrap whose
  newest definition is the one the snapshot already sits on — leaves the ticket at v1, so the two
  assertions above are the fold and not this case rewriting every ticket it sees. **This was a real
  absence, not a missing test**: `foldTicketsOntoVersion` had exactly one call site
  (`applyServerItem`'s definition branch), `loadBootstrap` stored the same `workflow.defined` events
  through `applyDefinition` and never folded, and the two doors answered differently on identical
  input — stream `{v:2, cat:'open'}`, bootstrap `{v:1, cat:'active'}`. Nothing healed it: the two
  backfilled types the reducer folds are both state-unchanged no-ops. *Mutation: make
  `foldSnapshotForward` return its input → red here alone (`Tests 1 failed | 19 passed (20)`).*
  **RECORDED, NOT FIXED — the half no client-side fold can repair.** A bootstrap tail can carry a
  `ticket.transitioned` INTO a state the new version dropped; that event is history in the old
  vocabulary sitting ABOVE the snapshot, and `applyTicketEvent` throws on it
  (`applyTicketEvent: workflow "…" has no state "doing"`) whether or not the snapshot was folded first
  — measured on this branch both before and after the fold landed. The repair is a snapshot above the
  offending event, which only the server can write. **NOW WRITTEN — this paragraph's "NOT FIXED" and
  its two grep readings were true when written and are not now.** `apps/server/src/sync/snapshot-refresh.ts`
  re-snapshots every affected ticket at its head inside the publish's own transaction; cases
  12.156–12.158 in this file pinned it and were measured red first (`Tests 3 failed (3)`, both throwing
  this exact message). 12.159 was added by that pass's own fix round and pins it too, for the ticket
  that has never been snapshotted. The RESIDUE is a tail that already spanned an older state-dropping
  publish before that shipped: such a ticket is skipped server-side and can still throw here, which is
  why `foldSnapshotForward` stays. *No longer Plan 10 Task 6's; the closure took no ledger row.*
  **RECORDED, NOT FIXED — the other direction of the baseline, and it is LIVE.**
  `writeSnapshot`'s `ON CONFLICT … DO UPDATE SET seq = excluded.seq` is unconditional, and this door
  passes the response's `snapshot.seq` with no `Math.max` against the baseline already standing
  locally, so a replica whose stream-door fold had raised its baseline to `MAX(events.seq) = 6` drops
  to 5 on a re-bootstrap and replays event 6 — pre-fold history against new vocabulary, exactly the
  failure 12.131 exists to prevent on the other door. **Now pinned by 12.154, which is why this
  paragraph no longer ends "unreachable today, because nothing calls `loadBootstrap` a second time":
  that sentence was false in the commit that wrote it**, refuted 94 lines below by 12.149, which calls
  `loadBootstrap` a second time on an already-bootstrapped replica and whose own docblock calls the
  sequence "a live sequence, not a contrivance". *Owner: Plan 10 Task 11 (the sync engine), the first
  PRODUCTION caller that will re-bootstrap a live replica — 12.149 already re-bootstraps one in a
  test.*
- 12.137 ✅ **filter before folding, proved on `claim.contested`** — the type every sentence around the
  guard calls the common path, and which no case reached until this one. A `claim.contested` stored in
  the ledger above the replay baseline (printed, not assumed: `listEntityEvents` shows
  `ticket.created@1` and `claim.contested@2`, and the `snapshots` rows for the ticket are empty, so the
  baseline is 0) is replayed by `refoldTicket` when a LATER `ticket.transitioned` arrives — and the
  `TICKET_EVENT_TYPES` membership test is the only thing between it and a reducer that throws on it.
  The ticket still moves to `doing`, the contest is still there to be shown (skipped is not dropped),
  and the transition log holds the seq-3 move alone. *Mutation: replace the membership test in
  `refoldTicket` with an unconditional fold → red here and on 12.130 (`Tests 2 failed |
  18 passed (20)`), here with `applyTicketEvent: not a ticket event: claim.contested`.* **Why nothing
  reached this path before**: `applyServerItem` tests `CONTEST_TYPES` before the ticket branch, so a
  contest triggers no refold of its own; 12.121, 12.127 and 12.132 apply no foldable ticket event after
  their contests, so the stored row is never replayed; and 12.135 puts its contest below the snapshot
  `seq`, where the window keeps it away from the reducer regardless of the filter. What forces it in
  front of the guard is a foldable ticket event arriving AFTER it, which is this case's whole shape.

## The outbox and the local pre-check (Task 10) — `packages/sync-client/test/precheck.test.ts`, `test/outbox.test.ts`

**THREE numbers, stated separately because no one of them implies the others and a single grep
appears to refute the first.** Each is measured, with the command beside it:

1. **Sixteen `it` declarations** across the two files —
   `grep -cE "^[[:space:]]*it\(" packages/sync-client/test/precheck.test.ts packages/sync-client/test/outbox.test.ts`
   prints `6` and `10`.
2. **Fifteen of those name an id** — `grep -nE "it\('12\.[0-9]+" …` enumerates fifteen lines. The
   sixteenth declaration is 12.152's, named `holds under TZ=${tz}` because it is a two-zone loop: it
   carries the sixteenth id (12.138–12.153 is sixteen ids) and it is why a reader running the grep in
   (2) gets fifteen and must not read that as the id range being wrong.
3. **Seventeen executions** — sixteen declarations, one of which runs twice.

The package's own run reads **`Tests 63 passed (63)`**, and the sum is stated so it can be checked:
these seventeen, Task 9's twenty, the two recorded-hazard cases below, Task 11's sixteen
(12.156–12.171), the barrel guard's four, and the storage conformance suite's three plus `migrateLocal`. It read 45 until
the fix round added `test/recorded-hazards.test.ts`, 47 until Task 11 added
`test/sync-engine.test.ts`, and 61 until Task 11's FIX round added 12.170 and 12.171.

**THE RULE THIS FILE FOLLOWS ABOUT DENOMINATORS, stated because the sentence that used to stand here
claimed more than it could keep.** It read *"every package-wide denominator in this file has been
RE-RUN at 60"* — a universal over a file this long, and false twice over (the package was 61, and it
is 63 now). What is actually true, and checkable: a package-wide denominator quoted as the CURRENT
state is re-run at the tree that writes it, and a denominator inside a MUTATION result is left at the
tree that mutation was measured on, because a mutation result is a fact about a tree and a recomputed
one is a fiction. So `(47)`, `(60)` and `(61)` still appear below inside mutation records and are not
errors; a *current* `(61)` would be.

**THIS PARAGRAPH IS WHERE TWO OF THIS WORK'S FALSE CLAIMS LIVED, and both were self-inflicted in the
way it warns about.** It said "RE-RUN at **60**" four lines after stating `Tests 61 passed (61)`, and
it said the 12.139 re-run went "from four ids to **six**" while the bullet twenty lines below it —
edited in the same commit — correctly listed SEVEN. Neither was a hard measurement to make; both were
recomputed from a remembered number instead of re-run. The failing set is now written where it is
measured (the 12.139 bullet) and this paragraph points at it rather than restating it, so there is one
copy to go stale instead of two.

**Every id below was proved able to fail**, each with the mutation that reddens it and the full list of
cases that mutation takes down — a mutation that reddens five cases is not evidence about one, and
saying "red here alone" without running it is how this branch produced four wrong counts. Eight
mutations were run; **none survived**.

### The local pre-check — `test/precheck.test.ts`

- 12.138 ✅ creating under a TERMINAL parent is refused `hierarchy.parent-terminal` before anything is
  queued, with the engine's own sentence (it names the parent's title and the state's name), and the
  outbox rows are printed empty rather than counted. *This case is also 12.139's control.*
- 12.139 ✅ **the reopen pair** — the parent's reopen is queued first, and the child create that 12.138
  refuses is then ACCEPTED, because the pre-check reads confirmed state with the outbox overlaid. The
  only difference between the two cases is the queued reopen. *Mutation: hold one `EngineContext` on
  the `createOutbox` closure, which is what the plan's snippet does → red on **eight ids, written out
  rather than counted: 12.139, 12.141, 12.144, 12.151, 12.159, 12.160, 12.169 and 12.170**
  (`Tests 8 failed | 55 passed (63)`, re-run at 63 on the tree that added 12.170). It read
  `Tests 7 failed | 54 passed (61)` before this fix round, `Tests 6 failed | 54 passed (60)` before
  12.169 was added, `Tests 4 failed | 43 passed (47)` at 47, and `41 passed (45)` at 45 — the set has
  moved FOUR times and every move was inside the change set that caused it. **One of those moves is
  why this bullet is now an enumeration**: the paragraph above this section said the re-run went "from
  four ids to six" while this bullet, edited in the same commit, said seven. The four engine ids are
  the flush cases, whose claims are enqueued after the replica was bootstrapped, so a context frozen at
  `createOutbox` time judges them against an empty world. This bullet and `outbox.ts`'s docblock both
  said THREE for one task, and the missing id is a measurement of WHEN the held context is built: build
  it eagerly in the `createOutbox` body — which is what "one built at `createOutbox` time" means and
  what the plan's snippet does — and the eight above go red; memoise it lazily on the first `enqueue` (`??=`) and
  12.151 stays green, because that test's first `enqueue` is its only one, so its "held" context is
  built after the `applyServerItem` that confirms the ticket. Both runs are real; only the eager one is
  the mutation the prose describes. 12.151's failure is also the OTHER half of the staleness: 12.139
  and 12.144 fail because a frozen context cannot see what was QUEUED after it, while 12.151 fails
  because it cannot see what the replica CONFIRMED after it — `applyServerItem` creates that ticket
  after `fixture()`, so the frozen context refuses the transition, nothing is queued, and `pendingFor`
  answers `null`.*
- 12.140 ✅ `getEntityState('membership', …)` answers the actor's OWN membership out of bootstrap's
  `me`, `null` for anyone else, and `null` for an id that is not a `workspace:user` pair at all.
- 12.141 ✅ **definitions come from the replica's TABLES, never from its event log.** After a
  workspace-wide `revokeScope` the same claim that was legal a line earlier is refused
  `ticket.unknown-type` — while the `ticket-type.defined` rows are still standing in `events`, printed
  to prove it. A context rebuilt by replaying the log would resurrect exactly the definitions the
  replica purged. *Mutation: seed `memory.ticketTypes` from `events` instead of `ticket_types` → red
  here and nowhere else.*
- 12.142 ✅ `restrict-to: {roles:['admin']}` refuses a member and accepts an admin, through the real
  engine. **The admin half is the load-bearing half**: a `null` membership refuses just as a wrong role
  does, so the member half passes with the membership door unimplemented. *Mutation: replace the
  membership arm with `return null` → red on 12.140 and on this case's SECOND half only.*
- 12.143 ✅ a queued claim the reducer can no longer fold (its definitions went with a scope
  revocation, while outbox rows deliberately stay) leaves the device working: the claim is still
  counted, still offered by `nextBatch`, and its pending READING is `null` rather than a partial fold
  wearing a pending label. *Mutation: drop the `try`/`catch` in `buildPendingOverlay` → red here and on
  12.141, both with `applyTicketEvent: unknown ticket type "…"` — and in production, every `enqueue`
  after a revocation throws, offline, permanently.*

### The outbox — `test/outbox.test.ts`

- 12.144 ✅ enqueue order is preserved and `nextBatch(limit)` respects the limit; the ids are
  enumerated in order, because a batch that lost the order would send a `field_set` for a ticket the
  server has not been told about.
- 12.145 ✅ a `committed` answer folds the claim into the local ledger through `applyServerItem` — with
  the SERVER's `serverTime`, printed — and clears the row; the ticket stops being a pending creation.
- 12.146 ✅ a `contested` answer records the contest locally from the response and clears the row. The
  claim is preserved verbatim in `original_event`, because if visibility was lost with the refusal the
  real `claim.contested` envelope never streams in and this stub is the claimant's only record.
- 12.147 ✅ a `refused` answer is TERMINAL: the row goes `status='failed'`, leaves `nextBatch`, appears
  in `failedItems`, and carries the server's words in `last_error`.
- 12.148 ✅ `recordFailure` is TRANSIENT: it backs off, holds the batch until due, and **leaves the row
  `queued`** — the assertion that stops a future reader "tidying" it into a `failed` write and
  stranding every retryable claim on the device forever.
- 12.149 ✅ a claim that came home through a RE-BOOTSTRAP is still cleared by its own answer.
  `loadBootstrap` inserts the device's already-committed claim into `events` and touches the outbox not
  at all, so `applyServerItem` then returns `{applied: false}` and RETURNS BEFORE its own
  `DELETE FROM outbox` — `applyResult`'s delete is the only thing that clears the row, and without it
  the claim is flushed forever. *Mutation: drop that delete → red here alone
  (`Tests 1 failed | 60 passed (61)`, re-run at 61; it read `Tests 1 failed | 46 passed (47)` at 47).* **The first draft of this case tested the ECHO race instead and
  its comment claimed the same thing about it — wrongly.** A stream echo is the FIRST arrival of that
  id, so it is `{applied: true}` and clears the row itself; the case had to re-insert the row by hand to
  have anything left to delete, which tests only that a hand-inserted row can be deleted. Recorded
  because the sentence read as a measured causal claim and the run beside it said otherwise.
- 12.150 ✅ **PENDING IS NEVER SETTLED FACT.** A ticket that exists only as a queued claim is absent
  from every settled surface — `getTicket`, `listTickets`, `listEntityEvents`, `searchLocal`, and the
  `tickets` and `snapshots` tables read directly — and present in exactly one, `pendingCreatedTickets`,
  with the claim ids that made it. Another workspace's caller sees nothing of it. *Mutation: make
  `enqueue` also upsert the overlaid state into `tickets` → red here, on 12.151 and on 12.139.*
- 12.151 ✅ a queued transition moves the pending reading and NOT the confirmed one; the provisional
  `seq` sits above the confirmed transition log, which is the property require-different-user's sort
  depends on. Once the claim leaves the outbox, `pendingFor` answers `null` rather than confirmed state
  wearing a pending label. *Mutation: return confirmed state when nothing is queued → red here alone.*
- 12.152 ✅ `next_attempt_at` is a Z instant under a NON-IST `TZ` as well as under IST, with a positive
  control (`new Date(t0).getHours()`) proving the zone switch took effect. *Mutation: render it with
  `getFullYear()/getHours()` and append `Z` → red under BOTH zones and on 12.148.* **The honest
  ceiling, stated because the map's correction is right that varying `TZ` is ceremony where the value
  does not move with it:** that mutation reddens under IST too, so the non-IST run catches no bug the
  IST run misses. What it establishes is the NEGATIVE — nothing on this path moves with the machine's
  zone — which is not knowable from an IST-only run on an IST machine, and which is what Tasks 12 and
  13 will build their day math on. Every other case in these two files is zone-free and deliberately
  does not vary `TZ`.
- 12.153 ✅ `backoffMs` is enumerated at eight points (`1000, 2000, 4000, 8000, 16_000, 32_000, 60_000,
  60_000`) rather than asserted at the cap, because a single cap assertion cannot tell "capped" from
  "constant". It is **a different function from `app-core`'s `backoffDelayMs`** (500 ms initial, 30 s
  cap, ±20% jitter): outbox flush versus websocket reconnect, two surfaces, two independently chosen
  curves. Do not dedupe them. **The two "initial" delays are not comparable, and `outbox.ts`'s
  docblock used to compare them** — it read "1 s initial" against app-core's "500 ms initial", true of
  the two functions and false of the two callers: `stream.ts` increments its counter AFTER calling, so
  500 ms is really its first reconnect delay, while `recordFailure` increments BEFORE calling, so the
  first flush retry waits `backoffMs(1)` = 2 s and `backoffMs(0)` = 1 s is unreachable from the only
  production caller. 12.148 pins that through the function (its first retry falls due at `backoffMs(1)`,
  its second at `backoffMs(2)`) and 12.152 asserts the literal `…00:00:02.000Z`; only the prose was
  wrong.

### Carried, with owners — Task 10

- **The `SyncEventResult` mirror can drift silently.** `packages/sync-client/src/outbox/outbox.ts`
  re-declares the wire shape of `POST /v1/sync`'s answer because this package may not depend on
  `apps/server`; there is no compile-time link, exactly as for `SyncItem` in `replica/sync-item.ts`.
  Both belong in `@gisik-nokma/domain`. *Owner: Plan 10 Task 11 (the sync engine), which consumes the
  same shape over HTTP and would otherwise inherit a third copy.*
- **`pendingCreatedTickets` filters by the workspace of the FOLDED state, not by the outbox row's
  `workspace_id`.** The two cannot disagree today — the local store is implicitly single-workspace
  (`revokeScope`'s recorded note: `workflows` and `ticket_types` carry no `workspace_id`) — and the
  folded state is the more honest source, since it is what would be rendered. *Owner: whoever widens
  `packages/sync-client/src/storage/schema.ts` to hold more than one workspace.*

## Recorded hazards, pinned as executable cases (Task 9 fix round) — `packages/sync-client/test/recorded-hazards.test.ts`

**TWO `it` declarations, running as two tests.** `vitest run test/recorded-hazards.test.ts` reads
`Tests 2 passed (2)`; the package's run reads `Tests 63 passed (63)` since Task 11's fourteen and its
fix round's two landed, read `Tests 61 passed (61)` in between, and read `Tests 47 passed (47)` when
this paragraph was written, which is the 45 above plus these two. Both mutations below were run over `test/recorded-hazards.test.ts` **and**
`test/replica.test.ts` together (22 executions), because what each mutation does NOT redden in the
task's own file is half of what it establishes.

**Why these two are not in `test/replica.test.ts`.** That file carries nineteen mutation
enumerations and every one is a FILE-SCOPED measurement — "red here and on 12.137 (`Tests 2 failed |
18 passed (20)`)" is a fact about a run of `vitest run test/replica.test.ts`. Appending two cases
would silently change what all nineteen measured, and would have falsified AT LEAST ONE outright.
**Two of the nineteen were run against the merged pair; the other seventeen were not, and this
sentence claims nothing about them.** 12.128's mutation ("keep the definitions" on a workspace
revocation) reddens 12.155 as well — measured, `red: ['12.128', '12.155']`, `Tests 2 failed |
20 passed (22)` — so its "red here alone" would have become false the moment the two files were
merged. 12.129's ("ignore `projectId`") does NOT: it reddens 12.129 alone (`Tests 1 failed |
21 passed (22)`), because 12.155's project-scoped half deletes that ticket under either behaviour.
This paragraph claimed both until the pair was actually run, and then claimed "one" — a count over
nineteen from a sample of two — until that was caught as the same reflex again.
The split also makes the category difference operational: **these two assert behaviour nobody wants
and are DELETED when their owner fixes them**, while `replica.test.ts` holds the task's contract.
Measured after the split: `vitest run test/replica.test.ts` still reads `Tests 20 passed (20)`.

- 12.154 ✅ **the bootstrap door LOWERS a baseline the stream door raised, and the replay then
  throws.** A snapshot at seq 5 arrives; the stream moves the ticket to `doing` at seq 6; a v2 that
  DROPS `doing` arrives and `foldTicketsOntoVersion` folds the ticket to `todo` and raises the
  baseline to 6 (asserted on the `snapshots` row, and on both transition-log entries). The device then
  re-bootstraps against the server's **still-stale** snapshot at seq 5 — nothing on the server
  invalidates a snapshot when a workflow is published — `writeSnapshot`'s unconditional
  `ON CONFLICT … DO UPDATE SET seq = excluded.seq` drops the baseline back to 5, and `refoldTicket`
  replays event 6 against v2's vocabulary: `applyTicketEvent: workflow "…" has no state "doing"`,
  thrown out of `loadBootstrap` with the whole response rolled back (baseline and ledger rows printed
  afterwards, unchanged). So the consequence is not "one ticket is wrong": every re-bootstrap throws
  identically for as long as the server keeps serving that snapshot and the offending event stays
  stored locally, and nothing on either side clears either. **`events` is `[]` on both bootstraps, and that is what separates this from the
  tail hazard 12.136 records for Task 6**: no response tail is involved, the throwing row is a locally
  stored event the stream fold had already moved past, and only the baseline drop puts it back in
  front of the reducer. *Mutation — and it is the "obvious fix", which is the point: wrap the `seq` in
  `Math.max(ticket.snapshot.seq, await snapshotSeqOf(tx, ticket.ticketId))` → red **here alone**
  (`Tests 1 failed | 21 passed (22)`). It removes the throw and every case in `replica.test.ts` stays
  green, because it writes the SERVER's seq-5 state under the LOCAL seq-6 baseline: the seq-6
  transition then vanishes from the log while its row still stands in `events` — measured,
  `transitions` came back with the seq-5 entry alone. A loud throw traded for a quiet divergence in
  the log `require-different-user` sorts on, caught by nothing. The consistent repair is the other
  shape — keep the higher local baseline, write no older snapshot, fold the LOCAL state forward — and
  that is a decision about what a re-bootstrap means.* *Owner: Plan 10 Task 11 (the sync engine), the
  first PRODUCTION caller that will re-bootstrap a live replica.* **TASK 11 SHIPPED AND THIS CASE
  STAYS.** The engine closed the only production route to this door — `needsBootstrap` refuses to
  re-bootstrap a replica that holds a local baseline, pinned by 12.165 — and deliberately did NOT
  re-apply the `Math.max` guard measured and rejected above. The hazard below is still exactly
  reproducible through `loadBootstrap`, which is what this case runs; an owner for the FIX is still
  open.
- 12.155 ✅ **a stream item that lands after a scope revocation throws out of `applyServerItem`, where
  the pre-check door catches the identical fold.** Both halves in one case: a project-scoped
  revocation followed by an in-flight `ticket.transitioned` for the ticket it just deleted gives
  `applyTicketEvent: ticket.transitioned for ticket … that was never created`; a workspace-wide
  revocation followed by an in-flight `ticket.created` gives `applyTicketEvent: unknown ticket type
  "…"`, because `ticket_types` is empty **by design** while the `ticket-type.defined` event still
  stands in `events` (printed, which is 12.141's point). The throw is inside `storage.transaction`, so
  the envelope insert rolls back with it — asserted against the exact row list from before the
  arrival, so the item is absent from the local ledger too, not merely unfolded. A positive control
  from the same helpers and the same door runs both arrivals with no revocation and gets
  `{applied: true}` twice, so the throws are the revocation and not a malformed fixture. **The finding
  is the ASYMMETRY, not the throw**: `buildPendingOverlay` wraps this reducer in `try`/`catch` and its
  docblock says why in words that apply here unchanged (12.143 pins it; dropping that catch reddens
  12.141 and 12.143), while `refoldTicket` folds the same reducer against the same `buildLocalDeps`
  object with no catch and nobody wrote the sentence. **It stays a throw on purpose**: `enqueue` is a
  user's offline action and must not brick the device, while `applyServerItem` is machine-driven and
  its contract is per-arrival rollback (12.125); catching here would mean inventing what an unfoldable
  CONFIRMED ticket is and where it surfaces. *Mutation — mirror Task 10 and wrap `refoldTicket`'s fold
  in `try`/`catch` → red here **and on 12.154** (`Tests 2 failed | 20 passed (22)`), and — the part
  worth writing down — **nothing in `test/replica.test.ts` reddens at all**, so before these two cases
  existed nothing in the package constrained that behaviour either way.* *Owner: Plan 10 Task 11 (the
  sync engine), the first caller of `applyServerItem` with a cursor to advance — a cursor left
  unadvanced on a throw is handed the same item again, which is a wedged stream, offline, after a
  revocation.* **TASK 11 SHIPPED AND THIS CASE STAYS.** The throw is unchanged and deliberately so;
  what the engine added is what happens NEXT to the cursor. It stalls — stream closed, no reconnect
  scheduled, cursor frozen, the reducer's own sentence kept in `lastApplyFailure()` — so the wedge
  this note predicts is a visible terminal state rather than a silent hot loop. Pinned by 12.163 (the
  item's own door) and 12.164 (the `caught-up` door, the other half of the same pair).

## The sync engine and its transport (Task 11) — `packages/sync-client/test/sync-engine.test.ts`

**EVERY ENUMERATION IN THIS SECTION IS A RUN OF `vitest run test/sync-engine.test.ts` ALONE**, which is
what its denominators mean. The file holds SIXTEEN cases and its denominator is `(16)`; every `(14)`
below belongs to a mutation run recorded when the file held fourteen, and each of those is left at the
number it was actually measured at rather than being recomputed to 16 — a mutation result is a fact
about the tree it ran on. The package-wide run is `Tests 63 passed (63)` and is quoted in the Task 10
section, where the sum is itemised.

**The fix round added 12.170 and 12.171**, and both are corrections to claims this section made about
itself: 12.170 because "the guard is on BOTH doors of the pair" counted two of three callers of
`applyServerItem`, and 12.171 because "the ONE field held to the server's own rule" left the value
this client actually PERSISTS unchecked.

**This section placed itself at the END and not beside the replica's, and the reason is the one the
file header gives.** Cases here are grouped by surface, not by number, so the largest id is not the
last line of the file — it is the last line of *this* section, which is currently the last section.
Task 11 is also the OWNER of two recorded hazards catalogued above (12.154, 12.155) and neither is
deleted: the engine closed the production route to one and changed what happens after the other, and
both owner lines say so in the same change set as this section.

**FIVE of these cases are about what the engine does with a failure measured one layer down** —
12.163, 12.164, 12.165, 12.166 and 12.170 — and each carries its own mutation, because the engine is
the first caller of `loadBootstrap` and `applyServerItem` that has a cursor to advance. Before this
file, nothing in the repository constrained that behaviour in either direction. *(This said "four"
until the fix round found the third caller of `applyServerItem` and added 12.170; the ids are written
out so the next such move is visible rather than arithmetic.)*

- 12.156 ✅ **an empty replica bootstraps exactly once, subscribes at the bootstrap cursor, and goes
  live at `caught-up`.** `bootstraps` is 1, the subscription is `[{afterSeq: 7}]` — `streamSeq` off the
  bootstrap body, printed as the whole list rather than counted — status reads `catching-up` before the
  first `caught-up` and `live` after, and `stop()` reads `offline`.
- 12.157 ✅ a second `start` after a `stop` does NOT re-bootstrap and resumes from the PERSISTED cursor
  (`bootstraps` still 1; last subscription `{afterSeq: 9}`, the cursor the `caught-up` wrote, not the
  bootstrap's 7).
- 12.158 ✅ event and purge frames reach the replica through the engine: a streamed `ticket.created`
  makes the ticket readable, a `{kind:'purge'}` for it makes it `null` again.
- 12.159 ✅ **`caught-up` triggers a flush, and the batch goes up IN ORDER** — two claims enqueued
  offline drain to zero and the transport is handed `[e1.id, e2.id]`, the ids themselves rather than a
  length. *Also reddened by the outbox's held-context mutation; see 12.139, which was re-run for it.*
- 12.169 ✅ **a results array that does not match its batch applies NOTHING.** `POST /v1/sync` answers
  index-aligned with the request, and every result but `invalid` carries its own `eventId` — so the
  contract is checkable, and applying a verdict to the wrong claim is the one outcome that cannot be
  walked back (`committed` folds a server position into the ledger and deletes the row; `refused` marks
  a claim terminally failed). Two halves, each on its OWN fixture: a short array (one answer for two
  events), and an array SHIFTED by one whose second entry is an `invalid` with `eventId: null`. Both
  leave every row `queued` with `failedItems` empty — printed as rows, not counted — and each half
  asserts the batch actually reached the transport, so neither passes on a flush that never ran.
  **The two fixtures are the load-bearing part**: `recordFailure` pushes `next_attempt_at` out by
  `backoffMs(1)` = 2 s, so a second `flush()` on the same outbox finds nothing due and never reaches
  the transport — the second half would have asserted over a batch that was never sent, which is a
  check that cannot fail, and it did until the `sent` assertion caught it. *Mutation: apply per
  position and collect the disagreements afterwards — the shape this loop had first — → red here alone
  (`Tests 1 failed | 13 passed (14)`): the shifted array's first entry is filed against the wrong claim
  before the loop reaches the id-less entry that would have proved the shift, which is why the check
  runs over the whole batch BEFORE anything is applied.* **The residual is stated rather than
  guarded**: an array in which every member is `invalid` with `eventId: null` carries no id information
  at all, so index alignment is the only contract there is and this check cannot see a shift in it.
- 12.160 ✅ **a transport rejection is TRANSIENT and the claim is never lost** — the flush throws once,
  `queuedCount` is still 1, and the row is printed rather than counted: `{attempts: 1, status:
  'queued'}` for that exact event id. `status` is NOT `failed`, because the server never answered.
- 12.161 ✅ a stream close flips status through `connecting` and reconnects at the persisted cursor
  (`{afterSeq: 9}`), not at the bootstrap's.
- 12.162 ✅ **an amendment-19 `error` frame is kept verbatim and moves no cursor.** `lastError()` is
  `null` before and `{code:'not-a-member', message:'not a member of this workspace'}` after — the
  server's own words, unedited — and `getCursor` is unchanged, because a stream that errors has not
  caught up.
- 12.163 ✅ **an item that will not fold STALLS the stream instead of wedging it.** After a
  project-scoped revocation, an in-flight `ticket.transitioned` for the deleted ticket throws out of
  `applyServerItem` (12.155's project-scoped half). The engine records `{code:'apply-failed'}` with the
  reducer's own `… that was never created`, closes the stream, schedules NO reconnect (the subscription
  count is unchanged after a wait LONGER than `reconnectDelayMs`, and the published status sequence is
  exactly `['offline']` with no `connecting`), goes `offline`, and leaves the cursor exactly where it
  was. **The subscription count alone could not fail** and the status sequence is what fixed that: the
  engine's `stall` sets its flag before closing, and the fake handle's `close()` dispatches `onClose`
  synchronously (as `app-core`'s `SynchronousCloseWebSocket` does, for the reason that file records) so
  the re-entrant close path is really exercised. *Second mutation: move `stalled = true` BELOW
  `closeStream()` → red here alone (`Tests 1 failed | 13 passed (14)`,
  `expected ['connecting', 'offline'] to deeply equal ['offline']`), and a retry timer is left armed
  that nothing clears. The count assertion stays GREEN under it, because the stray timer's own guard
  reads `stalled` by the time it fires — which is exactly why the claim needed a second assertion.* A positive control from the same door — the same ticket's earlier transition, with no revocation
  — folds cleanly and leaves `lastApplyFailure()` null, so the failure is the revocation and not a
  malformed fixture. *Mutation: replace `stall(...)` in `onItem`'s catch with the plan's snippet
  `() => undefined` → red here **and on 12.164** (`Tests 2 failed | 12 passed (14)`). This note first
  said 12.164 stayed green; that is true of the cursor and false of the case, because 12.164 waits for
  `lastApplyFailure()` to appear before it sends its `caught-up`, and a swallowed failure never
  appears.*
- 12.164 ✅ **a `caught-up` arriving after a failed item does NOT advance the cursor — the second of
  the two CURSOR doors inside one function.** (The engine has a third caller of `applyServerItem`
  that neither this case nor 12.163 touches; it went unguarded until 12.170, and "both doors of the
  pair" is the sentence that hid it.) The plan's snippet writes `.catch(() => undefined)` TWICE, and the
  cursor advance lives on the second one, so fixing only the item's chain leaves the permanent skip
  intact. *Mutation: drop the stall guard from `onCaughtUp`'s chain alone → red here **alone**
  (`Tests 1 failed | 13 passed (14)`); 12.163 stays green because it never sends a `caught-up` after
  the throw.*
- 12.165 ✅ **the engine does not re-bootstrap a replica that holds a local baseline, even at cursor 0.**
  A bootstrap carrying `streamSeq: 0` leaves the cursor at 0 until the first `caught-up`; a streamed
  ticket folded in that window is a baseline a stale server snapshot would lower (12.154). `start()`
  again: `bootstraps` stays 1, the subscription is `{afterSeq: 0}`, and re-delivery of the identical
  envelope is a no-op with no apply failure. *Mutation: make `needsBootstrap` ask `cursor === 0` alone
  → red here **alone** (`Tests 1 failed | 13 passed (14)`), `bootstraps` comes back 2. The plan's own
  guard (`cursor === 0 && me === null`) leaves this case GREEN and reddens 12.166 instead; this note
  claimed the opposite until both mutations were actually run.* **What this case does NOT claim: that a
  re-bootstrap here would throw.** The harm is 12.154's and is measured there; this pins the engine's
  refusal to open that door and nothing more — deliberately narrow, because "unreachable through this
  door" is one sentence away from the "nothing calls `loadBootstrap` twice" claim this branch already
  falsified.
- 12.166 ✅ **after a workspace-wide `scope-revoked` the engine DOES re-bootstrap — the state the plan's
  guard trips over.** `revokeScope` deletes the tickets, the definitions and `meta cursor:<ws>` but NOT
  `me` (`me` is written once by `loadBootstrap` and the only `DELETE FROM meta` in `replica.ts` is the
  cursor row), so the replica lands on cursor 0 with a non-null `me` — asserted, not assumed. The
  instruction is terminal for the subscription (`stream-frames.ts`: no cursor, and reconnecting into a
  workspace you were removed from earns `not-a-member` forever), so status is `offline`; the next
  `start()` bootstraps (`bootstraps` 2) and subscribes at the fresh `streamSeq`. *Mutation: the plan's
  guard verbatim → red here **alone** (`Tests 1 failed | 13 passed (14)`), `bootstraps` stays 1 and the
  stream would resume at 0 into a store with no `workflows` and no `ticket_types` — 12.155's
  workspace-wide half, on the first frame.*
- 12.167 ✅ **all five server frames reach a handler, and a TEXT `ping` is answered with NOTHING.** The socket
  URL is `wss://api.example/v1/stream` and the first send is
  `{type:'subscribe', workspaceId, afterSeq}` — both compared as values. The three item frames arrive as
  the envelope itself, `{kind:'purge', entityId}` and `{kind:'scope-revoked', workspaceId}`; the other
  two reach `onCaughtUp(12)` and `onError({code:'bad-message'})`. The plan's own `openStream` snippet
  declares a five-member frame union inline and `scope-revoked` is not among them, which would leave a
  revoked device told nothing. *The transport declares no frame union at all and carries a compile-time
  assertion that every member of `@gisik-nokma/domain`'s `ServerStreamFrame` has a branch; verified by
  deletion — dropping `'purge'` from `HandledFrameType` makes `pnpm turbo run typecheck --force` fail
  with `src/net/http-transport.ts(71,34): error TS2344: Type 'false' does not satisfy the constraint
  'true'`. It pins the frame TYPE STRINGS and says nothing about whether each branch reads the right
  fields, which is this case's job.*
  **The second clause was `ping` is answered with `pong` until 12.328 deleted that protocol from both
  clients.** The ping is still sent and the sent-list is now asserted EXACTLY as `['subscribe']`, so the
  case reddens if the arm comes back; `subscribe` is that absence's own positive control that sends are
  observable in this run at all. A `not.toContain('pong')` would also have passed on a transport that
  sent nothing, including one that never opened.
- 12.168 ✅ **what the parser refuses, and what it deliberately does not.** Seven inputs produce ZERO
  handler calls — non-string data, unparseable bytes, an unknown frame type, an event frame whose
  `envelope.workspaceSeq` is 0 (one of the TWO fields held to the server's own rule — the other is
  `caught-up.seq`, unguarded until 12.171 — because a frame without a resumable position is one this
  subscription cannot resume from), and purge / `caught-up` /
  `scope-revoked` frames naming a DIFFERENT workspace, which are crossed streams and would otherwise
  move this cursor by a number that means nothing here. An `error` frame with `workspaceId: null` is
  then delivered, because amendment 19 uses null for connection-level errors raised before any
  subscribe — the assertion is `[]` and then `['error:bad-message']`, so the empty half is proved
  non-vacuous by the same handler set that later fires. Everything else is deliberately MORE permissive
  than `serverStreamFrameSchema`, for the reason `packages/app-core/src/online/stream.ts` argues at
  length: a client that hard-drops a frame it could have delivered fails silently.
  **What this case does NOT cover, and the summary prose that said it did**: an `event` frame whose
  `envelope.workspaceId` names ANOTHER workspace is delivered to `onItem`. The `event` branch returns
  before the `frame.workspaceId !== workspaceId` comparison and checks the envelope's `workspaceSeq`
  alone, so the three frames listed above are the whole of what "cross-workspace" means here. The
  transport's own inline comment enumerates those three correctly; `Features.md` and this case's
  docblock said "cross-workspace frames are dropped" flatly, and both now say what the code does.
  *Recorded, not fixed: adding the guard is a behaviour change with its own case, not a prose repair.
  Owner: Plan 10 Task 12, the next task to own this seam.*

### The fix round — two claims this section made about itself, and the cases that make them true

- 12.170 ✅ **a `committed` verdict the replica cannot fold STALLS the flush door — the THIRD caller of
  `applyServerItem`, which "both doors of the pair" did not cover.** 12.163 and 12.164 pin the two
  CURSOR chains; `outbox.applyResult` folds a `committed` claim through the same throwing function, and
  the flush loop called it with no catch. Sequence: bootstrap, stream a `ticket.created`, enqueue a
  `ticket.transitioned` for it (the pre-check passes — the ticket is still there), deliver a
  project-scoped `scope-revoked` (which deletes the ticket and leaves the outbox row by design), then
  `flush()` against a `committed` answer. *Measured BEFORE the fix, and it is the whole reason the case
  exists: `flush()` REJECTED with `applyTicketEvent: … that was never created`; `status()` was
  `catching-up`, not stalled; `lastApplyFailure()` was `null`, so a shell could see nothing;
  `recordFailure` never ran, so the row stood at `attempts: 0, status: 'queued'` with
  `next_attempt_at` unmoved; and the next `flush()` re-sent the IDENTICAL batch — the hot loop
  `sync-engine.ts`'s own docblock says the engine exists to prevent. `onCaughtUp` reaches this code
  through `await engine.flush()`, so identical input produced a visible terminal stall on one path and
  a silent no-backoff resubmit on the other.* After the fix the case asserts, printed as rows rather
  than counted: `flush()` RESOLVES, `lastApplyFailure()` carries the reducer's own words, `status()` is
  `offline`, `nextBatch()` at the current clock is `[]` (backoff applied) while `nextBatch` at
  2100-01-01 is exactly `[{attempts: 1, status: 'queued'}]` for that event id, and the ids that reached
  the transport across two flushes are `[[claim.id]]` — one batch, not two. *Mutation: delete the
  `try`/`catch` around `outbox.applyResult` → red HERE ALONE (`Tests 1 failed | 15 passed (16)`), the
  rejection thrown out of the unguarded `await engine.flush()`; 12.163 and 12.164 stay green, because
  neither flushes a claim the replica cannot fold — which is precisely why this door went unseen.*
  *Also reddened by the outbox's held-context mutation; see 12.139, which was re-run for it.*
- 12.171 ✅ **`caught-up.seq` is held to the same rule as `envelope.workspaceSeq`, and it is the one
  that PERSISTS.** The event branch four lines above refuses a non-positive-integer `workspaceSeq`; the
  `caught-up` branch accepted its `seq` on `typeof 'number'` alone — and that value is what
  `replica.setCursor` writes to durable storage as `String(seq)`, read back by `getCursor` as
  `Number(value)`. `1e999` is the reachable input: JSON has no NaN literal, but `1e999` is legal JSON
  and `JSON.parse` yields `Infinity` with `typeof 'number'`. *Measured one layer down before the fix:
  the cursor persisted as `"Infinity"`, `needsBootstrap` returned false forever because
  `Infinity !== 0`, and every later subscribe serialised as `{"afterSeq":null}` — a device that can
  neither resume nor re-bootstrap, silently, across process restarts. A negative or fractional `seq` is
  milder and was equally unrefused; a too-large finite one advances the cursor past events never
  delivered.* The case sends `1e999`, `-1`, `1.5` and `"9"` as RAW STRINGS — not through
  `JSON.stringify`, which turns `Infinity` into `"null"` and would test a frame the wire cannot send —
  asserts zero handler calls, then sends `0` and `12` and asserts `['caught-up:0', 'caught-up:12']`.
  **The `0` half is the non-vacuity control and also the reason the bound is `>= 0` rather than the
  event branch's `> 0`**: `readStreamSeq` answers 0 for an empty workspace, so copying the stricter
  rule would strand every empty workspace at `catching-up` forever. *Mutation: restore
  `if (typeof frame.seq !== 'number') return;` → red HERE ALONE (`Tests 1 failed | 15 passed (16)`),
  with `['caught-up:Infinity', 'caught-up:-1', 'caught-up:1.5']` delivered where the case expects
  nothing. Every other case in this file drives `onCaughtUp` through the fake handlers directly and
  never through the parser, which is why nothing caught it.*

## Task 12 — the replica `DataSource` (`packages/app-core`)

**A DIFFERENT PACKAGE, AND THEREFORE A DIFFERENT DENOMINATOR.** Every case above runs in
`packages/sync-client`, whose current run is `Tests 63 passed (63)` — unchanged by this task, which
added no test there. These sixteen run in `packages/app-core`: the file's own current run is
`Tests 16 passed (16)`, and the package's is `Tests 1045 passed (1045)` across 64 files, both re-run at
the tree that ships them. **The mutation records for 12.175 and 12.186 below quote `(15)`** — they were
measured before 12.187 existed, and a mutation denominator is a fact about the tree the mutation ran on;
recomputing it to `(16)` would falsify the record rather than update it. A *current* `(15)` would be an
error, and there is none.

**The one widening this task made outside its own files:** `ListRow.pending` (ruling P30's permitted
one). `TicketListView` is untouched, so `packages/app-core/test/views/list-model.test.ts`'s
compile-time tripwire — which asserts that view type's keys are exactly `rows` and `projectId` — stays
green, and its staying green is the guard working rather than the guard being avoided. **Exactly three
`ListRow` literals existed in the repo and `tsc` enumerated them, not a grep**: `app-core/test/helpers/
seed.ts`, `apps/web/test/project-calendar-timeline.test.tsx` and `apps/web/test/project-create-gate.
test.tsx`. The third names no `ListRow` type anywhere in the file, so the name-grep that found the
first two missed it and the gate found it — which is the same "match on the name and filter after"
failure this bucket has recorded before, caught here by a compiler instead of by a second reading.

- 12.172 ✅ **the replica source IS a `DataSource` — ruling P30's falsifier, as a compiled line.**
  `const assignable: DataSource = ds` inside the case body. Its evidence is that `typecheck` accepts
  it and its kill is `tsc` refusing it; `packages/app-core/tsconfig.typecheck.json` includes `test`, so
  the line is in the gate's program (verified by `tsc --listFiles`, which lists both
  `src/replica/replica-data-source.ts` and this test file). Deliberately a `const` with an explicit
  annotation and not a cast — a cast compiles whatever the shape is. The runtime half names the three
  members plus two replica-only ones, so a reader who does not run `tsc` still sees the claim.
  *Mutation: declare `ReplicaDataSource` as a sibling with the PLAN'S OWN `subscribe(workspaceId,
  afterSeq, cb: () => void)` instead of `DataSource & {...}` → `typecheck` red at
  `test/replica/replica-data-source.test.ts(216,11)` with `TS2322: Type 'ReplicaDataSource' is not
  assignable to type 'DataSource'. Types of property 'subscribe' are incompatible … Target signature
  provides too few arguments.` The plan's snippet is exactly the shape that fails.*
- 12.173 ✅ **a locally-accepted claim answers pending — through a throw, never as an `IngestResult`.**
  `ingest` rejects with `OfflineAcceptError` whose `results` is `[{status:'pending', eventId}]` and
  whose `queuedEventIds` is that id; `outbox.queuedCount` is 1, so "pending" is a statement about the
  outbox rather than a mood. **The fixture had to DECLARE a `notes` field on the ticket type**: the
  local pre-check runs the real rule engine, so a `ticket.field_set` for an id the type does not
  declare is refused before it is queued — a fixture with `fields: []` (which the plan's snippet has)
  measures the refusal path while claiming to measure the accepted one, and it did, red, before the
  fixture was corrected.
- 12.174 ✅ **the settled columns do not move; the claim in transit is visible and DISTINCT.**
  `replica.getTicket(...).confirmed.fields['notes']` is `undefined` after the claim is queued, while
  `query.getTicketWithPending` answers both halves side by side — `confirmed` unchanged, `pending.
  pending.fields['notes'].value` the claimed text, `pendingEventIds` the claim's id. This is
  `outbox.ts`'s own invariant ("nothing here writes to `tickets`, `snapshots` or `events`") asserted at
  the surface that renders it.
- 12.175 ✅ **the badge renders on BOTH doors of the pair — the list row AND the board card.**
  One queued claim, and `getTickets` reports `pending: true` on that row and `false` on the untouched
  one, while `getBoard` reports the same pair on the cards. This is the case that exists because the
  highest-yield defect in this codebase is a behaviour implemented on one door of a pair, and this
  pair was ALREADY half-implemented before the task started: `BoardCard.pending` shipped in Plan 6 and
  `ListRow` had no such field. *Mutation: hardcode `pending: false` in `rowOf` (the list half) → red
  HERE ALONE, `Tests 1 failed | 14 passed (15)`. The board half stays green, which is exactly how the
  asymmetry survived being shipped.*
- 12.176 ✅ **a rule violation refuses instantly with the named rule, RETURNS a real `IngestResult`, and
  queues nothing.** A `ticket.transitioned` to a state whose transition carries `{kind:'require-comment'}`,
  with no comment: `ingest` RESOLVES (it does not throw — there is nothing accepted-for-now in the
  batch) with `[{status:'refused', rule:'require-comment', …}]`, and `queuedCount` is 0. The refusal is
  the server's own answer arriving early, which is why it is a real `IngestResult` and the acceptance
  is not.
- 12.177 ✅ **`ingest` can never answer `committed` — enumerated over the whole outcome space, not
  asserted.** Three batches: all-refused (returns, statuses `['refused']`), all-accepted (throws), and
  MIXED (throws, and the error's `results` is `['pending','refused']` — so a caller that catches loses
  neither the rule nor the reason). The enumeration is total because `outbox.enqueue` answers
  `{queued:true}` or `{queued:false, rule, reason}` and has no third arm, so no input reaches a
  `committed`. *Mutation: annotate `ingest` as `Promise<LocalIngestResult[]>` — the plan's own
  `LocalIngestResult` as the return type → `typecheck` red at `src/replica/replica-data-source.ts`
  with `TS2322 … Type '{ status: "pending"; eventId: string; }' is not assignable to type
  'IngestResult'`. That is return-type covariance refusing the fourth member, which is the mechanism
  ruling P30 names, measured rather than quoted.*
- 12.178 ✅ **`getTickets` fills all FIVE fields `online/mappers.ts` refuses `getTickets` over**, as
  rows and not as "five": `typeRank` 3 (the local ticket-type roster), `epicId` the epic's id (the
  workspace's OWN rank-1 types, which is the server's `rank = EPIC_RANK` rule rather than
  `isBuiltinEpicType`'s narrower built-in-id test — the roster is local, so this client can agree with
  the server exactly), `stateName` `'To do'` (the ticket's own workflow VERSION, not the latest),
  `hasRestrictedParent` false, and `assignedProvenance` the assigning event's actor and both clocks
  with `actorName: null`. `rollup` is asserted null in the same case: `restrictedCount` counts children
  this viewer may not see and a replica cannot count what it was never sent, so null under-claims
  rather than inventing a number.
- 12.179 ✅ **`hasRestrictedParent` stays FALSE while the engine is not live — lag is not restriction.**
  The parent is purged, so it is genuinely absent from local scope, and the field still answers false
  because `engine.status()` is `offline`. Locally the two causes — "you may not see it" and "it has not
  arrived yet" — are one observation, and the field names only the first. The narrower answer follows
  `hierarchy/epic-ancestor.ts`'s own rule: narrower than the truth shows less, wrong about the truth
  shows the wrong work.
- 12.180 ✅ **`getWorkflowDef` answers a NAMED version, not merely the latest.** With v1 and v2 both
  stored: no argument → v2, `1` → `'Basic'`, `2` → `'Basic (renamed states)'`, `9` → null (a hole in
  the version chain reports as a hole), and a foreign workspace id → null. It reads through
  `workflowVersionsOf`, sync-client's own version-accurate lookup, rather than `buildDeps` — which
  `local-deps.ts` says in its own words is "the quiet way to lose the version chain".
- 12.181 ✅ **board columns are the definition's own states, in the definition's order, carrying its
  `blocked` flag.** One group at `workflowVersion: 1`, columns `['todo','doing','waiting','done']`,
  `blocked` `[false,false,true,false]` — the flag lives on the workflow state (`workflowStateSchema`'s
  optional `blocked`), so it is read from the definition and never defaulted. Columns are never
  invented and a state no published definition names lands in a straggler group at
  `workflowVersion: 0`, the convention copied from `apps/server/src/routes/board.ts` rather than
  re-decided — `0` cannot collide with a published version because `workflowDefSchema` is
  `version: z.number().int().min(1)`.
- 12.182 ✅ **`myWork` separates assigned, claims in transit, and contested.** One assigned ticket with
  one queued claim: it appears in `assigned` and in `claimsInTransit`, and `contested` is empty. The
  base `getMyWork` REFUSES (12.185) because `WorkItem.projectName` is not a fact this device holds;
  this is the replica-only door that answers what it can, in a shape that carries no project name.
- 12.183 ✅ **search names its source: the base method REFUSES, and only the offline-copy door
  answers.** `query.search` rejects with a `ReplicaGapError` whose absences are exactly
  `['SearchHit.matchedIn','SearchHit.snippet']`, and `query.searchOfflineCopy` answers
  `{offlineCopy: true, hits:[…]}`. The plan's honesty pin — the UI must say "searching the offline
  copy" — survives the type change because the flag rides on the only search this source serves.
- 12.184 ✅ **`syncStatus` reports the engine, the queue depth and the terminal failures.**
  `{status:'offline', queued:0, failed:0}` before, `{status:'offline', queued:2, failed:0}` after two
  accepted claims. This is one of the two channels ruling P30 names for accepted-for-now, and the case
  measures it moving rather than existing.
- 12.185 ✅ **SEVEN methods refuse, enumerated by id rather than counted**, and the enumeration is
  compared against `Object.keys(REPLICA_GAPS)` so the registry and the behaviour cannot drift:
  `getMyWorkspaces`, `getMembers`, `search`, `getMyWork`, `getAttention`, `getPreferences`,
  `putPreferences`. **NOT the online source's SIX**, and the difference is enumerated rather than
  characterised, because "nearly disjoint" was written here first and is false. Online refuses
  `getMyWorkspaces`, `getTickets`, `getTicket`, `search`, `getMyWork`, `getAttention`. FOUR are
  refused by both (`getMyWorkspaces`, `search`, `getMyWork`, `getAttention`); TWO are refused online
  and ANSWERED here (`getTickets`, `getTicket` — the replica holds the `TicketState` and the raw
  events the wire does not carry); THREE are answered online and refused here (`getMembers`,
  `getPreferences`, `putPreferences` — a roster and amendment-14 rows, neither of which is replicated).
  6 + 7 over 13 methods with a 4-way overlap: the two implementations are not each other's complement
  and no sentence should say they are. The case also
  asserts, structurally, that every absence object has exactly `field`/`because`/`owner` and no
  `wireKey`/`wireRoute`: an `online/mappers.ts` `Absence` carries those because
  `apps/server/test/integration/client-contract.test.ts` measures each against a real `/v1` body, and a
  REPLICA absence has no route to measure — feeding one into `SERVING_GAPS` would either break that
  suite or pass vacuously through a `wireRoute: null`, which is a check that cannot fail wearing the
  costume of one that can. Every `owner` is checked to start with `Plan 10 — `, i.e. to name something
  the CLIENT would have to change. And the two methods that do NOT refuse are named beside them
  (`getTicketTypes`, `getTicketHistory`), because a refusal list is only evidence next to the list of
  what answers.
- 12.186 ✅ **`subscribe` hands its callback a real `ServerStreamFrame` — the kind `useLiveQuery` acts on.** *(Written as `StreamItem`; closure 3 deleted that duplicate and the client now re-exports the domain union.)*
  A frame delivered through the engine's own stream door arrives at the subscriber as
  `{type:'event', envelope}`, and after `off()` a second frame arrives at nobody. **This case exists
  because the plan's `subscribe(..., cb: () => void)` would have shipped a source that looks wired up
  and repaints nothing**: `packages/app-core/src/views/use-live-query.ts` re-queries ONLY on
  `item.type === 'event'` or `'purge'`, so a bare signal — or a synthesized `caught-up` in its place —
  leaves every app-core view frozen against the offline copy with no type error anywhere. The frames
  come from `SyncEngine.onItem`, added by this task: the engine is the only component that holds a
  frame-shaped value, and it exposes the union it already has (`SyncItem`) rather than declaring a
  parallel or truncated one, which the then-deferred `StreamItem` → `ServerStreamFrame` ruling forbade — **that deferral ENDED with closure 3 (2026-09-06)**: the replacement is done, and the guardrail held long enough to make it a rename rather than a reconciliation.
  *Mutation: delete the `itemListeners` fan-out at the end of the engine's `applyOne` → red HERE ALONE,
  `Tests 1 failed | 14 passed (15)`, with zero `event` frames delivered where the case expects one.*

- 12.187 ✅ **a ticket born offline reaches THREE doors, and this case is the only thing that made them
  agree.** One `ticket.created` submitted through `ingest` while offline, then all three read doors
  asserted together: `listTicketSummaries` CARRIES it (`pending: true`, `pendingEventIds` the claim's
  id), `getTickets` does NOT contain it and does not throw, `getBoard` does NOT contain it.
  *The first draft of this task had all three behaving differently and the whole-file run was green.*
  `getTickets` included offline-born rows and `rowOf` then threw `ReplicaGapError` — "no ticket.created
  or ticket.transitioned event is stored … so no actor or clock can be named" — on the ORDINARY offline
  path, because `outbox.ts` writes nothing to `events` by design and the error's own docblock calls
  that a corrupt store. `getBoard` never read `pendingCreatedTickets` at all and omitted the ticket in
  silence. `listTicketSummaries` carried it, because `TicketSummary` reads the overlay and no events.
  Three doors, three behaviours, and 12.175 stayed green throughout because it badges an EXISTING
  ticket carrying a queued `field_set` rather than a ticket that is only a claim.
  **The fix is a type fact, not a preference:** `ListRow` and `BoardCard` both require a
  `stateProvenance` and `ClaimProvenance` requires a `serverTime`, which `SubmittedEvent` omits by
  construction because it is the server's to assign. `buildPendingOverlay` does fold such a ticket and
  fills `serverTime: submitted.clientTime` — a substitution it documents where it makes it — and
  repeating that in a view row would launder a device clock into the field every consumer reads as the
  server's answer, which is the same shape as the `committed` this source refuses to say about the same
  claim. So the settled listings keep `outbox.ts`'s own invariant ("never in any settled listing") and
  `OFFLINE_BORN_ABSENCE` names the gap and its owner; the case asserts the owner string too, so the
  absence cannot lose its owner and go quiet. *Mutation: restore the `pendingCreatedTickets` loop in
  `getTickets` → red HERE ALONE (`Tests 1 failed | 15 passed (16)`), failing with the very
  `ReplicaGapError` the shipped defect produced.*

**RECORDED, NOT FIXED — Task 12's additions, with owners.**

0. **`ingest`'s CONTRACT CHANGE reaches four call sites that do not catch.** The read path is
   interchangeable; the write door is not, and the callers are enumerated rather than characterised —
   `grep -rn "\.ingest(" packages/app-core/src apps/web/src apps/web/app` returns six:
   `cache-feed.ts:17` and `apps/web/src/authoring/data-source-gateway.ts:296` pass the promise through,
   while `views/ticket-sheet.tsx:276`, `views/visibility-editor.tsx:176`,
   `flows/guarded-child-event.ts:54` (`ingestOne`) and
   `apps/web/app/w/[workspaceId]/members/page.tsx:137` each `await` it and branch on the array without
   catching a rejection. Against the replica each sees an `OfflineAcceptError` where it saw an array.
   That is the honest signal arriving at the caller — there is no `IngestResult` to hand it — and it is
   the caller that must learn to read it. Nothing today mounts a view on the replica source, so nothing
   is broken; the day one does, these four are the sites. OWNER: **Plan 10 Task 13**.
1. **A queued claim repaints nothing on any OTHER view.** `use-live-query.ts` reloads on `event`/`purge`
   frames, and a local `ticket.field_set` sitting in the outbox produces no frame — it is not a
   `LedgerEvent` and has no `seq`, `serverTime` or `workspaceSeq`, so emitting one would be inventing
   the three fields the server assigns. The view that CALLED `ingest` learns immediately, because
   `OfflineAcceptError` reaches it; a second view of the same workspace does not, until the server
   commits the claim and streams it back. OWNER: **Plan 10 Task 13** (app-core's offline UX), which is
   the first code to render an offline list beside an offline board.
2. **`getBoard` and `getTickets` read the local event log once per ticket** (`listEntityEvents`, for
   provenance), so a project with N tickets costs N+1 queries. Correct and unmeasured at scale. OWNER:
   unassigned; a `Replica` accessor that batches provenance would close it.
3. **`subscribe` never emits the `error` arm.** The engine keeps the server's amendment-19 error frame
   in `lastError()` and does not re-broadcast it, so emitting one here would mean choosing a moment the
   engine never named. A shell can read `lastError()` directly. OWNER: **Plan 10 Task 11's engine** if
   an error observer is ever wanted; deliberately not invented here.
4. **`ReplicaDataSourceDeps` takes a `workspaceId` and a `SyncStorage` that the plan's `deps` do not.**
   Both are forced by the repo rather than chosen: `getBoard`/`getTickets` are keyed by PROJECT while
   every local table is keyed by workspace and `Replica` exposes no accessor for the id it bootstrapped
   with; and a version-accurate workflow lookup is `workflowVersionsOf(storage, …)`, which takes the
   store. OWNER: unassigned — a `Replica.workspaceId()` and a `Replica.getWorkflowDef(id, version?)`
   would let both come off the deps.


- 12.188 ✅ **the fourth door, and the one where INCLUSION is correct.** The same offline-born ticket
  12.187 keeps out of both settled listings IS returned by `searchOfflineCopy` under a needle matching
  its title, while `getTickets` still omits it in the same case. *Written because 12.187 pinned three
  doors that agree by excluding, and a later reader "fixing" the fourth into agreement with them would
  break the thing the method exists for: a ticket created on a plane that cannot be found by its own
  title.* The type argument that keeps a queued claim out of the settled listings — `ListRow` and
  `BoardCard` both require a `stateProvenance`, and `ClaimProvenance` requires a `serverTime` no server
  has assigned — does NOT reach a search hit, which is `{ticketId, title}` and carries no provenance
  field. So `search` and `searchOfflineCopy` are not a pair that should agree: one is the wire shape
  this device cannot fill, the other is the local answer.
  *Mutation: neutralise the `pendingCreatedTickets` loop in `searchOfflineCopy` so it iterates nothing
  → red on 12.188 ALONE, `Tests 1 failed | 16 passed (17)`, with 12.187 green — measured at this tree,
  and the restore verified by `git hash-object` matching the pre-mutation blob rather than by a diff.*
  Carries its own non-vacuity control: a needle that matches nothing returns without the born ticket,
  so a `searchOfflineCopy` answering every ticket unfiltered would not satisfy the case.

## Refresh on publish, snapshot door — `apps/server/test/sync/snapshot-refresh.test.ts`

**Owned by no plan task.** The gap is the one the Task 5 ledger row flags in its own notes
(`docs/lanes/task-ledger.tsv`, commit `b65f6fb`): publishing a workflow version invalidated no
snapshot. It was found by Plan 10 Batch B while building the replica, confirmed on `main` by the
controller, and left unowned. This section is the closure; it takes no ledger row, on the precedent of
the semantic-extraction and comment-cleanup passes.

**The damage was never mainly the stale snapshot.** A snapshot's `state` is folded under whatever
workflow version was current when the pass ran; `GET /v1/sync/bootstrap` serves it plus every event
above its seq, and one of those can be a `ticket.transitioned` INTO a state the new version dropped —
legal history when it was written. The ROUTE does not throw (`bootstrapTicket` reads a snapshot,
filters events and returns; it replays nothing). What throws is whoever replays that tail: the
replica's `loadBootstrap`, and the server's own `runSnapshotPass`. Both were measured at `18b749c`
before a line was written, and both threw `applyTicketEvent: workflow "…" has no state "doing"`.

**Deleting or refusing the stale snapshot makes it WORSE**, which is why neither is what shipped: both
degenerate to serving the ticket's full history, which contains the same offending event EARLIER, and
a full replay has been paid for the identical throw. `packages/sync-client/src/replica/replica.ts`
reached the same conclusion from the other side and recorded it: *"No client-side fold can repair it,
because the fix is a snapshot ABOVE the offending event."* So the fix is a re-snapshot at the ticket's
HEAD on every version-raising publish, inside the publish's own transaction
(`apps/server/src/sync/snapshot-refresh.ts`, wired in `commitOne`).

*Mutation record — the whole fix reverted to `18b749c` (four files restored from that commit, plus
`snapshot-refresh.ts` removed), test file unchanged: `Tests 3 failed (3)`. 12.189 and 12.190 both fail
with `applyTicketEvent: workflow "01M1P1GB3VR8AXJMQDVW8D5FG2" has no state "doing"`; 12.191 fails on
the row list (`expected [ 'ticket:A:21:todo:v1', …(1) ] to deeply equal [ 'ticket:A:21:todo:v1',
…(4) ]` — two rows where five belong). Restored by `cp` from a backup taken first and verified by
`git hash-object` on all five files, then `Tests 3 passed (3)`.*

**The fixture carries TWO tickets on the workflow, and that is the second measurement this section
owes.** The refresh walks a candidate list, hoisting the as-of deps and the version ladder out of the
loop and re-using one `SAVEPOINT` name per iteration; a one-ticket fixture cannot tell "refreshes every
affected ticket" from "refreshes the first one", which is the per-iteration form of the one-door class
this repo has met five times. Both tickets are asserted on every claim below, so which ULID sorts first
under `ORDER BY ticket_id` changes nothing about what is proven.

- 12.189 ✅ **a publish that drops a state re-snapshots the ticket at its head, and the bootstrap
  payload it then serves replays clean.** The fixture is ordered so the offending event sits ABOVE the
  snapshot — snapshot at seq 21 under v1, `ticket.transitioned` to `doing` at seq 22, THEN v2 dropping
  `doing` with `stateMapping {doing: todo}` — because with the transition BELOW the snapshot every
  assertion here passes with the fix reverted: the client's own `foldSnapshotForward` already repairs
  that case. The publish goes through the real `createIngestService(...).ingestBatch`, so the case
  constrains the WIRING and not just the module. Asserted in this order on purpose: the publish
  answers `committed` (a fold error escaping `commitOne` would roll the append back and 500 the
  publish); the replayed payload lands on `todo`/v2 — this is where the case reds without the fix; the
  snapshot rows are `[21 todo v1, 22 todo v2]`, so the repair is an ADDED higher-seq row and nothing is
  deleted; the served tail above seq 22 is empty; and the `ticket.transitioned` is still in the ledger,
  so the repair is not a rewrite of history. (snapshot-refresh.test.ts)
- 12.190 ✅ **the background pass resumes over the refreshed snapshot instead of throwing on the old
  vocabulary** — the SECOND door, which the brief for this work did not name. `runSnapshotPass` builds
  its deps with `buildLedgerDeps` at the NEWEST version, so before the fix it re-folded event 22
  against v2 and threw. It now resumes from the seq-22 snapshot over an empty tail and writes nothing;
  the positive control that this is a real "nothing to do" rather than a pass that found no entity is
  the row list asserted beside it, plus a following `ticket.transitioned` to `done` that the same pass
  does snapshot, at seq 23. (snapshot-refresh.test.ts)
- 12.191 ✅ **a publish that moves no state still re-stamps each head snapshot IN PLACE, and a first
  publish with no tickets writes nothing.** A publish appends to no ticket's stream, so the refresh
  routinely lands on a seq that ALREADY has a row — `writeSnapshot`'s bare INSERT dies there on
  `snapshots_pkey`, which is why the publish door has its own `overwriteSnapshot`. v3 drops nothing:
  five rows before and five after, ticket A's seq-23 row moving `done` v2 → `done` v3 and ticket B's
  seq-22 row moving `todo` v2 → `todo` v3, each on its OWN head seq, no row added and none deleted.
  The second half is the shape `bootstrap-workspace.ts` fires on every workspace creation — a
  version-1 `workflow.defined` for a workflow with no tickets — which must commit and write nothing.
  **Both halves assert the WHOLE `snapshots` table, not this ticket's rows**: a per-ticket read cannot
  support "writes nothing", because rows for a ticket the publish never touched are unchanged whatever
  it did to anything else — the check-that-cannot-fail shape this file's header warns about, and the
  first draft of this case had exactly it. (snapshot-refresh.test.ts)

**All three cases above use a ticket that HAS a snapshot, and that is a hole this fix round found.**
`SNAPSHOT_MIN_EVENTS` is 20 and `runSnapshotPass` writes nothing below it, so a ticket under twenty
events has never been snapshotted and never would be — a population none of 12.189–12.191 touches. The
publish door repairs it anyway, because its candidate query carries no snapshot-existence filter, and
that absence is load-bearing rather than an oversight: bootstrap serves an unsnapshotted ticket its
FULL history, which holds the same offending `ticket.transitioned` the stale-snapshot case is about.
*"No stale snapshot to invalidate" is not "nothing to repair"* — it is the same argument the module
already makes against DELETING a superseded snapshot, reached from the other end.

- 12.192 ✅ **a publish repairs a ticket that never crossed `SNAPSHOT_MIN_EVENTS`, writing its first
  snapshot at head.** The 12.189 fixture with the snapshot step removed: two events on the ticket, the
  second the `ticket.transitioned` into the state v2 drops, and no snapshot pass run at all. Asserted
  in 12.189's order — damage first, mechanism second. Pre-publish the WHOLE `snapshots` table is `[]`,
  the served payload is snapshot-`null` plus full history, and that full history replays clean to
  `doing`/v1: the positive control, so a post-publish throw is caused by the publish and not by a
  fixture that never replayed at all. Post-publish the replay lands `todo`/v2 — this is where the case
  reds — the served tail is empty, the table holds exactly `['ticket:T:2:todo:v2']` (one row at the
  ticket's own head seq 2, eighteen events below the threshold, a row the background pass would never
  write), and the `ticket.transitioned` is still in the ledger, so the repair is not a rewrite of
  history. In its own file rather than in `snapshot-refresh.test.ts`, because that fixture snapshots
  both its tickets and 12.191 asserts the whole table — a third ticket would change row lists this file
  quotes as historical evidence. *Mutation record — `AND EXISTS (SELECT 1 FROM snapshots …)` added to
  the candidate query in `snapshot-refresh.ts`, the narrowing an outside review proposed to spare the
  publish a full replay: `Test Files 1 failed | 1 passed (2)`, `Tests 1 failed | 3 passed (4)`. 12.192
  fails with `applyTicketEvent: workflow "…" has no state "doing"`; 12.189, 12.190 and 12.191 all stay
  GREEN — which is exactly why this case had to exist before the docblock could call that absence
  deliberate. Restored by `cp` from a backup taken first and verified by `git hash-object`, then `Tests
  4 passed (4)`.* A second mutation, of the wiring rather than the query — the
  `refreshSnapshotsForWorkflowPublish` call moved to sit AFTER the projection loop in
  `ingest-service.ts`, nothing else changed — gives `Test Files 2 failed (2)`, `Tests 4 failed (4)`:
  12.189, 12.190 and 12.192 on the throw, 12.191 on the row list. Recorded because the module's own
  prose used to call that late ordering a no-op "that every test still passes", and it is not.
  (snapshot-refresh-unsnapshotted.test.ts)

**What these four do NOT cover, enumerated.**
- **A fold that throws is SKIPPED, silently, on the live path.** Each ticket is folded inside a
  `SAVEPOINT`; a throw rolls back that ticket alone and leaves it with its stale snapshot, so the
  publish still commits. That is deliberate — letting it escape trades a broken bootstrap for a broken
  publish, the same reasoning `projections/tickets.ts` gives for its own `DOOR_LEAVES_EXISTENCE_UNCHECKED`
  skip — but no case here exercises a throwing ticket, and `commitOne` discards the returned
  `skipped` list because ingest has no logger. *Owner: whoever adds logging to ingest.*
- **The pre-existing tail that already spans an older state-dropping publish.** The as-of deps bound
  is "immediately below THIS publish", which is sufficient only by induction from this fix being
  present at every earlier publish. A database that already holds such a tail when this ships takes the
  skip above on its first publish and stays stale.
- **The replica is untouched.** `packages/sync-client`'s `foldSnapshotForward` / `writeSnapshot` /
  `applyServerItem` still hold the client-side fold, deliberately: it is the only fold on the LIVE
  stream door, and after this fix the bootstrap-door fold merely becomes a no-op in the common case
  rather than dead code.
- **No case asserts the route's own 500-or-not.** It does not throw, before or after — asserting that
  it did would have been a check that could not fail.

## Task 13 — app-core's offline/sync UX (`packages/app-core`)

The contested-claim banner and its three resolutions, the offline reopen pair, the clock-skew flag and
the sync-truth strip. Five source files, four test files, all under `packages/app-core`. **Two cases
here exist because the plan text's own prescribed tests could not fail**, and they are marked as such
rather than folded in silently.

### The offline reopen pair — `test/reopen-pair.test.ts`

- 12.220 ✅ `buildReopenPair` emits the parent's `ticket.transitioned` FIRST, carrying
  `cause: { kind: 'reopened-for-child', childTicketId }`, then the child event byte-identical (same id,
  same payload). Order is the contract: the caller enqueues them adjacently and the server sees the
  same order at sync.
- 12.221 ✅ **the check the plan's own test could not make.** The built payload is parsed through
  `domainRegistry.get('ticket.transitioned', 1)`, the registration the ingest door itself consults, and
  the plan text's spelling (`toStateId`) is built by hand in the same test and asserted to FAIL that
  parse. *Plan 10 Task 13's published signature block prescribed `payload: { toStateId, cause }` and
  asserted it with `toMatchObject` against an envelope the function had just built — green for any
  spelling, including one the real door refuses. The schema names the destination `to`
  (`packages/domain/src/workflow.ts:138`) and is not `.strict()`, so `toStateId` is stripped rather
  than named and the parse fails on the missing required `to`.*
  *Mutation: change `to:` back to `toStateId:` in `buildReopenPair` → red on 12.220 and 12.221 ALONE,
  `Tests 2 failed | 3 passed (5)`, with 12.222 and 12.223 green — measured at this tree.*
  Carries its own non-vacuity control: the negative half means a registry that answered `success: true`
  for everything cannot leave this green.
- 12.222 ✅ `nonTerminalStates` is NOT the reopen picker. On a definition with no declared
  transitions it offers two states while `reopenStateOptions(def, 'done')` — the function the ONLINE
  reopen dialog is fed from — offers none. Pinned so the two answers to "what may this parent be
  reopened into" cannot be mistaken for one; if this ever goes green with equal arrays, either
  `nonTerminalStates` grew a reachability filter (delete it) or the shipped picker lost one.
- 12.223 ✅ the cause names the child ENTITY id, never the child EVENT id, with both asserted
  distinct on the same envelope so a fixture reusing one id could not hide the mix-up.
- 12.200 ✅ `nonTerminalStates` returns exactly the non-terminal states, in definition order.

### The contested-claim banner and its resolutions — `test/contests.test.tsx`

- 12.193 ✅ the banner names the claimant, the claim type, the refusing rule and its reason, prints
  the instant in India time (`21 Aug 2026, 00:00 IST`) and never the raw ISO string, and offers all
  three resolutions.
- 12.194 ✅ **the banner's date is IST because the code says so, not because the machine is.** The
  same assertion under `TZ=UTC`, `America/Los_Angeles` and `Pacific/Kiritimati`, with a probe FIRST
  proving `process.env.TZ` actually moves the ambient clock in that worker (without it a green result
  could come from `TZ` having been ignored). *Measured before writing: `packages/domain/test/` assigns
  `process.env.TZ` on ZERO lines while `formatIstInstant` appears in two of its files — nothing
  anywhere had varied the zone under this formatter.* The fixture instant is chosen so the UTC day and
  the IST day differ, so a zone-dependent implementation gets the DAY wrong, not merely the hour.
  *Mutation: `shifted.getUTCHours()` → `shifted.getHours()` in `packages/domain/src/clock-skew.ts`,
  rebuilt → red on 12.194 naming its own zone (`under TZ=America/Los_Angeles: … received "21 Aug 2026,
  17:00 IST"` — the label right, the hour the device's), and on 12.193 and 12.206 with it. Restored and
  rebuilt; restoration verified by reading the file, not by a shell `diff`.*
- 12.195 ✅ an offline-queued resolution propagates `OfflineAcceptError` and is NEVER laundered into
  `ok: true`. The replica's `ingest` throws rather than returning a fourth status; catching it here
  would put "the server accepted your discard" on screen for a discard the server has never seen.
- 12.201 ✅ nothing renders when there is nothing contested. No empty chrome.
- 12.202 ✅ nothing renders when every contest is already resolved.
- 12.203 ✅ planted defect: "Redo legally" calls `onRedo` and NEVER `onResolve` with the contested
  envelope as the replacement — that call would throw in `resolveContest`, so the banner must not be
  able to make it.
  *Mutation: rewire the Redo button to `onResolve(c, { resolution: 'redone', replacementEvent:
  c.originalEvent })` → red on 12.203 ALONE, `Tests 1 failed | 12 passed (13)`.*
- 12.204 ✅ a discard emits ONE `claim.contested_resolved`, attributed to whoever discarded, naming
  the contested event id.
- 12.205 ✅ a discard with no note carries no `note` key at all (asserted by exact key set, not by
  `note === undefined`, which `toMatchObject` would satisfy either way).
- 12.206 ✅ convert-to-comment emits `comment.added` carrying the claim text — claimant, rule and the
  IST instant all surviving into a comment body that lives in the ledger forever — then the resolution
  linking that comment's id.
- 12.207 ✅ a redo sends the fresh replacement FIRST and links it from the resolution.
- 12.208 ✅ a refused resolution comes back as the door's own `rule`/`reason`, not a sentence this
  client invented.
- 12.209 ✅ an `invalid` answer comes back as the door's `code`/`message`, not as a rule it never
  named.
- 12.210 ✅ planted defect: redoing with the contested envelope itself throws before `ingest` is
  called at all. A redo is a fresh claim; re-sending the contested id would idempotently re-answer
  `contested`.

### The clock-skew flag and the sync-truth strip — `test/skew-and-status.test.tsx`

- 12.196 ✅ the threshold is the domain's `GROSS_CLOCK_SKEW_MS` and it is INCLUSIVE: exactly at it
  flags, one millisecond under does not. Read from the domain constant rather than a `600000` restated
  here, so the case follows the threshold instead of going stale beside it. *A gate closing one end of
  a range is a defect class this branch has already paid for.*
- 12.197 ✅ no badge renders at all when the clocks agree.
- 12.198 ✅ `connecting` and a queue-less `offline` both have labels; a clean client renders no
  failure chrome, and the strip carries its status as a data attribute.
- 12.211 ✅ no badge under the gross threshold. Both clocks are simply kept.
- 12.212 ✅ planted defect: an 11-minute skew renders the flag in both directions, attributed to the
  DEVICE clock ("device clock ran 11 min ahead of / behind the server"), never phrased as the event
  having happened at the wrong time.
- 12.213 ✅ an unparseable client claim is flagged *unreadable*, not hidden.
- 12.214 ✅ an unparseable SERVER time is flagged the same way. The gate is symmetric.
  *Mutation for 12.213/12.214: reorder `formatClockSkew` to gate on `clockSkewMs(env) === null` before
  `hasGrossClockSkew` — the obvious-looking simplification, which returns `null` (no badge) for the
  unreadable case → red on 12.213 and 12.214 ALONE, `Tests 2 failed | 6 passed (8)`.*
- 12.215 ✅ the queue sentence is singular-aware and status-aware: `Live` · `3 claims waiting to
  send` · `Offline — 3 claims waiting to send` · `Offline — 1 claim waiting to send` ·
  `Catching up…`, and the rendered strip carries both the label and the "needs attention" count.

### The classes and the stylesheet — `test/sync-ux-css-binding.test.tsx`

- 12.199 ✅ the three components' BEM classes and the `ui.css` rules that style them are ONE fact,
  tied by SET EQUALITY in both directions. *`ui.css` had no `gn-contest-banner`, `gn-clock-skew-badge`
  or `gn-sync-status-bar` selector at all when these components were written (measured, with
  `gn-inbox` as the positive control on the same file) — their class names bound to nothing, so the
  token discipline the components' own interface contract names was not actually being consumed. The
  rules were added in the same change set.* The technique is `inbox-css-binding.test.tsx`'s, and it
  carries that file's cost: the fixture must render every conditional class, so `__action--discard`
  needs an unresolved contest, `__failed` a non-zero count, and the badge a gross skew.
  *Mutations, both directions: rename `gn-contest-banner__claim` → `…__claimx` in the component → red
  on the equality case; delete the `.gn-clock-skew-badge` rule from `ui.css` → red on the equality case
  AND on the harvest's own non-vacuity control, `Tests 2 failed | 1 passed (3)`.*

### The stream error surface (Ruling P34) — `test/skew-and-status.test.tsx`

- 12.216 ✅ no error, no notice, and no chrome for one — with `error` ABSENT and `error={null}` asserted
  to mean the same thing, since the prop is optional precisely so a shell holding no engine yet can
  mount the strip.
- 12.217 ✅ **the notice may not claim a policy the engine does not implement.** Every code in the
  domain's own `STREAM_ERROR_CODES` is asserted to produce a notice carrying the code verbatim, the
  server's own message, and the words "still retrying" — and asserted NOT to contain "will not
  reconnect". *Measured: `createSyncEngine` reconnects after an amendment-19 `error` frame on the same
  delay as any other close, for all three codes; only `scope-revoked`, a different frame type, is
  terminal. A surface saying otherwise would assert a decision on the engine's behalf — the same shape
  as laundering "queued" into "accepted".* The loop reads the domain constant rather than a list
  restated here, so a fourth code lands in it automatically, and carries a non-empty control so an
  emptied constant cannot make it vacuous.
- 12.218 ✅ an unrecognised code is printed raw rather than dropped for a friendlier sentence.
- 12.219 ✅ the notice renders inside the strip BESIDE the label, not replacing it.

### Carried, with owners — Task 13, as re-assigned by Ruling P34 (2026-09-06)

All three of these named *"Plan 10 Task 13"* in code. Task 13's five files are the banner, the
view-model, the reopen pair, the skew badge and the status bar — no ticket list, no `ListRow` renderer,
no error surface among them — so all three named the next task touching app-core UX by NUMBER rather
than by content. Raised as R-B1; **P34 ruled that none was Task 13's and that none stays unassigned.**

- **An offline ticket list that unions `getTickets` with `listTicketSummaries`.** `OFFLINE_BORN_ABSENCE`
  (`packages/app-core/src/replica/replica-data-source.ts`). *Owner: **Lane A, closure 2b** — an app-core
  view/DataSource concern, queued after closure 3 and before the HELD pair. Annotation text updated in
  the same change set as this line.*
- **`ListRow.pending` has no renderer.** *Owner: **Lane A, closure 2b**, for the same reason.*
- **A per-`StreamErrorCode` retry POLICY** (give up on `not-a-member`, retry on `bad-message`). **The
  SURFACE half is now DONE** — cases 12.216–12.219 above, `syncErrorNotice` in
  `packages/app-core/src/sync/sync-status-bar.tsx`. **The POLICY half is still open and still lives in
  `createSyncEngine`**, not in a view: whether `not-a-member` should end the retry loop is a judgement
  about a membership that may be restored, and no view can take it. The engine's docblock was split in
  two to say exactly that. *Owner of the remaining policy half: unassigned.*

## Task 16 — `apps/desktop`'s storage adapter (`apps/desktop/src/storage/*.test.ts`)

The gate for this task, per the lane owning it, is `cargo check` + `tsc` + `vitest` on the storage
adapter alone — no simulator, no app launch, no `tauri build` claim. These cases are that adapter's
whole test surface; this package has no other test file. Numbered 12.228–12.229 per the controller's
explicit allocation to this lane, made once three lanes minting into this one file concurrently had
already collided twice on "next free" — see this file's HIGHEST-ID line.

- 12.228 ✅ **`wrapTauriDatabase` maps `run`→`execute` and `all`→`select` with positional params, and the
  transaction sequence is exactly `BEGIN IMMEDIATE` / the body's statement / `COMMIT`, or `BEGIN
  IMMEDIATE` / `ROLLBACK` when the body throws.** `apps/desktop/src/storage/tauri-sql-storage.test.ts`,
  a fixture over a `vi.fn()` `{execute, select}` pair asserting the exact call sequence.
  *Mutation: swap the `catch` branch's `db.execute('ROLLBACK')` for `db.execute('COMMIT')` → red on both
  files at once, `Tests 2 failed | 3 passed (5)` (this case's own exact-sequence assertion, plus 12.229
  below), restored and re-verified green by reading the file back rather than by a shell `diff` against
  an untracked path — `git diff` is silent on an untracked file regardless of its content, which is not
  evidence of anything.*
- 12.229 ✅ **The SAME `SyncStorage` behavioural contract every adapter answers to — DDL/DML round-trip,
  transaction atomicity with rollback, and non-interleaving of concurrent transactions — holds for this
  adapter's actual `BEGIN IMMEDIATE`/`COMMIT`/`ROLLBACK` statement logic, not only for the exact-string
  fixture above.** `apps/desktop/src/storage/tauri-sql-storage.conformance.test.ts` imports
  `storageConformanceTests` from `@gisik-nokma/sync-client/testing` (the same suite
  `packages/sync-client/test/storage.test.ts` runs against `better-sqlite3` itself) and runs it against
  `wrapTauriDatabase` wrapping a small fake `{execute, select}` shim backed by a REAL in-memory
  `better-sqlite3` database — not a second `vi.fn()` mock re-answering canned values, which would be
  exactly the "mocked contract that excuses the real thing from existing" this series has a name for.
  *Mutation: shared with 12.228 above (same statement sequence, same guard).*

**RECORDED, NOT FIXED — one limitation neither case above can see.**

0. **The queue above serialises this module's JS callers; it cannot pin a pooled connection — and this
   is MEASURED as a live failure, not argued as a theoretical race.** `tauri-plugin-sql` 2.4.1's public
   `Builder` exposes no pool-size or connection-pinning option, `DbPool::connect` opens the database
   through sqlx's `Pool::connect` (default `max_connections` 10, no `busy_timeout` set anywhere in the
   plugin), and every `execute`/`select` Tauri command independently acquires/releases a pooled
   connection for one `sqlx::query(sql)` call — read from the crate's own source in the local cargo
   registry cache, not inferred. *Standalone probe (a scratch `sqlx = "=0.8.6"` binary, the plugin's
   pinned version, replicating its exact `Pool::connect`/`sqlx::query`/`pool.execute` calls): one
   `BEGIN IMMEDIATE` then one `INSERT` as two sequential `pool.execute()` calls — this adapter's own
   pattern, with ZERO concurrency — reproducibly errors `(code: 5) database is locked` on the INSERT,
   the pool reporting a second physical connection opened despite the first sitting idle. A single
   `execute()` call carrying a WHOLE transaction as one multi-statement string was also measured and
   DOES work (all statements land on the one connection that call acquires, pool left clean after) —
   but every real production caller of `SyncStorage.transaction`
   (`packages/sync-client/src/storage/schema.ts`; all four transaction sites in
   `packages/sync-client/src/replica/replica.ts`) reads with `tx.all()` INSIDE the transaction and
   branches on what it reads, which no single pre-built SQL string can express.* Both 12.228 and 12.229
   back the wrapper with exactly ONE `better-sqlite3` handle, which has no pool to race against and no
   separate command boundary to violate — no case here can fail on this, by construction, so none
   claims to have closed it. OWNER: whoever next hardens this adapter for real multi-device use, a
   decision no task owns yet.

- 12.240 ✅ **ONE PROJECT LIST WITH BOTH KINDS IN IT** — `listProjectWithOfflineBorn`, the union `OFFLINE_BORN_ABSENCE` has prescribed since it was written (*"an offline shell that wants one project list containing both must union `getTickets` with `listTicketSummaries` and render the second kind as claims"*), built under ruling P34 as closure 2b. The two kinds stay DISTINGUISHABLE — `kind:'settled'` carries a `ListRow`, `kind:'offline-born'` carries a `TicketSummary` — because an offline-born ticket **cannot** be a `ListRow`: `stateProvenance` needs a `serverTime` no server has assigned. Flattening them would either invent one or ship a row missing a required field. **This is the OPPOSITE answer to ruling P36 on the same surface, and the distinction is why both are right**: P36 copies a `serverTime` that a ledger row really recorded and the snapshot writer merely dropped; here no row anywhere recorded one, so the claim is rendered AS a claim. Control in the same run: settled entries are still present and still carry a real `stateProvenance`, so "the born ticket is in the list" is not satisfied by a door that answers only queued claims; and `getTickets` still omits it, so this ADDED a door rather than quietly widening a settled listing. — `packages/app-core/test/replica/replica-data-source.test.ts`
- 12.241 ✅ THE EXCLUSION — a ticket born in ANOTHER project is not in this project's list. `listTicketSummaries` is WORKSPACE-scoped, so without the project filter the foreign ticket rides in; `TicketSummary` gained a `projectId` for exactly this, off `TicketState.projectId`, which the overlay fills from the creating claim (an omission, not a fact, so adding it invents nothing). **Both directions in one run** — the local ticket present, the foreign one absent — because asserting only the absence would also pass against a door that returned nothing. (Planted defect: removing the project filter kills 1, this case alone.) — `packages/app-core/test/replica/replica-data-source.test.ts`
- 12.242 ✅ A ticket CONFIRMED while its own claim is still queued is listed ONCE, not twice. It is answered by `getTickets` and by `listTicketSummaries` simultaneously — `pending` stays true on the summary while the settled listing has already begun carrying it — so concatenating the two doors shows one ticket as two rows. The dedup keys on TICKET ID and not on `pending`, because `pending` is true on both sides. Non-vacuity in the same run: the summary door is asserted still to name the ticket, so a single occurrence is the dedup working rather than the summary having dropped it. (Planted defect: removing the dedup kills 1, this case alone.) — `packages/app-core/test/replica/replica-data-source.test.ts`
- 12.243 ✅ **A NON-EMPTY FILTER NARROWS BOTH HALVES, and no confirmed ticket comes back tagged `offline-born`.** *The case the first draft could not have failed.* 12.240–12.242 all pass `{}`, and `matchesFilter` guards every axis on `!== undefined` — so under an empty spec the two halves cannot disagree about what belongs in the list, and the dedup hides the summary side completely. **An empty filter is not a neutral default; it is the one input under which a filter bug cannot show.** The defect it now pins, reproduced by review: the born half read `listTicketSummaries`, which answers EVERY confirmed ticket, and deduped against the FILTERED settled rows — so every confirmed ticket the filter excluded came back as `offline-born` with `pending: false`, and typing in a search box turned settled tickets into claims. Asserts (a) no `offline-born` entry is confirmed and every one is badged, (b) every entry on BOTH sides satisfies the filter, (c) ids are unique — the dedup is not doing the filter's job. Control in the same run: the born ticket the filter excludes is asserted PRESENT without the filter, so "absent" cannot pass against a door that dropped the born half entirely. (Planted defect: restoring the pre-fix implementation kills 1, this case alone.) — `packages/app-core/test/replica/replica-data-source.test.ts`
- 12.244 ✅ **THE SNAPSHOT COPIES THE STATE CLAIM'S RECORDED INSTANT, NOT A NEIGHBOUR'S** (ruling P36, first half of its excluding fixture). The assertion is not "a `serverTime` is present" — a fabricated one is present too. It is that the block's value EQUALS the ledger row's own `server_time` at the seq the claim was made, **read out of the `events` table in the same run rather than compared against a fixture constant**: a constant passes against a writer that copied the right value and equally against one that computed the same string, and only the row tells those apart. The adjacent event's instant is asserted DIFFERENT in the same run, so the equality is discriminating rather than lucky, and the query itself carries a positive control (a null row would make every comparison vacuously true against `undefined`). (Planted defect: letting every event overwrite the state claim — **ruling P36's refused option 3, attributing one event's instant to another** — kills 1, this case alone.) — `apps/server/test/sync/snapshot-writer.test.ts`
- 12.245 ✅ **A PUBLISH WITH AN EMPTY TAIL CARRIES THE PROVENANCE BLOCK FORWARD instead of erasing it** (P36's second half, added to the ruling after this lane found the hazard). `foldTicketHead` reads only the tail PAST the previous snapshot's seq, and the invalidation pass's ORDINARY case is `seq === previousSeq` — a re-state with an empty tail. There is then no state-claiming event to capture from, and `overwriteSnapshot` sets `provenance = excluded.provenance`, so a writer capturing only from folded events would write NULL over a good block **on every workflow publish** and the read door would start refusing tickets the previous pass had just fixed. **Latent until a publish — the P14 shape — which is why this is a case and not a comment.** Asserts the pre-state (a block exists, or "it survived" is satisfied by a world where none was written), that the tail really is empty (or the case never exercises the carry at all), and that the state was re-folded AND the block came through untouched — both, because a pass that did nothing would also preserve it. (Planted defect: removing the carry-forward kills this case; *it also kills 12.244, whose second pass runs an empty tail too — the two mutations are not orthogonal and this entry says so rather than claiming a cleaner kill than the code supports.*) — `apps/server/test/sync/snapshot-refresh.test.ts`
- 12.246 ✅ **A BOOTSTRAP-DELIVERED PROVENANCE BLOCK IS STORED AND READ BACK** — the client door that shipped with NO test at all. A whole-branch review found `getSnapshotProvenance` had five references repo-wide and zero tests, and that replacing its body with `return null` left sync-client 63/63 and app-core 1092/1092 green: **the read-door defect ruling P36 exists to close was not shown by any case to be closed.** Asserted field by field, never `toBeTruthy` — a constructed empty object satisfies truthiness and names nobody. Control in the same run: a ticket nobody delivered a block for answers null, so this is a fact about DELIVERY and not about the reader. (Planted defect: `return null` kills 3 across 12.246–12.248, where it previously killed nothing.) — `packages/sync-client/test/replica.test.ts`
- 12.247 ✅ A later snapshot write with NO block does NOT erase the one a bootstrap delivered. `writeSnapshot` returns early on an absent block by design — **absent means "nothing new to say", never "forget what you knew"** — which is the client-side twin of the server's carry-forward. The identical omission was available on both halves of this change, and on the server it would have nulled a good block on every workflow publish. — `packages/sync-client/test/replica.test.ts`
- 12.248 ✅ `purgeEntity` removes the block, so a forgotten ticket leaves no actor and no instants behind. **This was MISSED when the table was added** and found by review: `purgeEntity` and `revokeScope` each deleted `events`, `tickets` and `snapshots` in lockstep and neither dropped the new table, against this file's own stated invariant — *"a replica for a workspace you are not in should hold nothing of it beyond your own authored stubs."* Graded retention rather than disclosure: nothing serves an orphaned row today, but `writeSnapshot` deliberately does not overwrite with an absent block, so a future re-delivery would resurface it rather than replace it. — `packages/sync-client/test/replica.test.ts`
- 12.249 ✅ **A NEWER LOCAL ASSIGNMENT BEATS THE SHIPPED BLOCK** — the Critical this branch shipped and review reproduced. `claimsFor` branched ONCE on the state event and, finding none, took the snapshot block for BOTH claims, never looking at the local `ticket.assigned` events it had been handed. On the ordinary fresh-device path — a snapshot-bounded bootstrap ships neither state events NOR `ticket.assigned` below the line, then one streamed assignment arrives — the door served the snapshot's OLD claim beside the NEW assignee: a stale actor and a stale instant, rendered as the claim that produced the current assignment and used as the My Work sort key. **The guard that was meant to prevent it checked only NULLNESS while its comment claimed to catch drift** — it caught move-to-null and not move-to-a-different-assignee, the drift it named. *A guard that checks whether a value exists is not checking whether it is the right value.* Each claim now prefers its own local event and falls back to the block independently. The instant is asserted POSITIVELY against the local event's stamp, not merely as "not the old one" — a build inventing a third instant would satisfy a negative. Control in the same run: the STATE claim still comes from the block, so the case cannot pass against a build that abandoned the block and reopened the refusal P36 exists to close. (Planted defect: restoring the all-or-nothing branch kills 1, this case alone.) — `packages/app-core/test/replica/replica-data-source.test.ts`
## The `apps/mobile` shell (Task 17) — `apps/mobile/src/**/*.test.ts`

Fourth package, fourth denominator (`packages/sync-client`, `packages/app-core`, `apps/desktop`, now
`apps/mobile`): 20 tests across three files, all module-seam unit tests — no RN component is rendered
under vitest (no simulator, no device; see `Features.md` §12). Two are the task's declared
honesty-carrying pieces and were opus-reviewed for exactly the failure class this whole bucket is
about: a check that passes for a reason unrelated to the property it claims to verify — both reviews
found real defects, fixed here, not only in this file's history but in the code itself.
**This section uses `12.224`–`12.227`, allocated by the controller after two same-day collisions in
this file** (see the header line) rather than measured off `main` alone. Both Task 13 (12.193–12.223)
and Task 16 (12.228–12.229, of its own `12.228`–`12.239` allocation, above) had already landed by the
time this branch took its final rebase past them.

- 12.224 ✅ `wrapOpSqliteDatabase` conforms to `SyncStorage` against the SAME shared behavioural suite
  (`storageConformanceTests`, `@gisik-nokma/sync-client/testing`) the `better-sqlite3` adapter runs —
  DDL/DML round-trip, transaction commit/rollback, serialised concurrent transactions — run against a
  fake `execute(sql, params) → {rows}` facade that is itself backed by a REAL in-memory `better-sqlite3`
  database rather than canned responses, because op-sqlite is a native module unavailable under vitest.
  The docblock originally claimed this canned shape "would pass every conformance assertion by
  construction"; the opus review actually ran it and found it passes only 1 of 3 (the one whose fixture
  coincides with the expectation) — corrected in place. Two properties the shared suite does not reach
  are pinned directly: a nested transaction (`tx.transaction(...)`) rejects with `'no nested
  transactions'` rather than silently forwarding to the outer connection, and `close()` closes the
  underlying database rather than resolving as a no-op — both were unverified before the review; the
  second was a real latent bug (a delete-local-data flow awaiting `close()` then unlinking the DB file
  would have failed or left a partial file). (`apps/mobile/src/storage/op-sqlite-storage.test.ts`)
- 12.225 ✅ the adapter's exact SQL shape is pinned against a SEPARATE recording fake (`vi.fn()`,
  canned responses) for the one thing the real-engine fake cannot check — literal SQL text: `run`/`all`
  map onto `execute` unchanged, and a transaction emits exactly `BEGIN IMMEDIATE`, the caller's SQL,
  `COMMIT` on success or `ROLLBACK` on throw, serialised across two overlapping transactions.
  (`apps/mobile/src/storage/op-sqlite-storage.test.ts`)
- 12.226 ✅ the mobile app's HOST-side reader for Plan 7's real editor webview bridge
  (`packages/editor/src/webview/bridge.ts`'s versioned `{bridge, kind}` protocol — NOT the task
  plan text's originally assumed `{type: 'editor-ready'|'set-doc'|'doc-changed'}` shape, which this
  build does not use) parses all five `EditorToHostMessage` kinds (`ready`, `change`, `submit`,
  `requestUpload`, `mentionQuery`), and rejects — without throwing — the wrong bridge version, a
  missing version field, an unrecognised `kind` (the tolerated-forward-compat case), a recognised
  `kind` missing its required field, non-object payloads, arrays, and unparseable JSON strings.
  `packages/editor` exports no validator for this direction at all (only the reverse, host→editor,
  used inside its own webview bundle); this is the first one, scoped to `apps/mobile` rather than
  the shared package. **The opus review caught the first version of the `doc`-field check accepting
  `[]`, `{}` and `{type:'paragraph'}`** — one check short of the real `isDocJson`'s four (object,
  non-null, not-array, `type === 'doc'`) — which a `change`/`submit` message carrying any of those
  would have persisted as a comment body the real validator refuses on the next load; now pinned
  directly against all three, and a round-trip test drives `serializeHostMessage`'s output through
  the REAL `parseHostMessage` (imported from `packages/editor`, not reimplemented) for every
  `HostToEditorMessage` kind including `loadDoc` with `doc: null` — the case that would have caught a
  second review finding, a `doc: undefined` that `JSON.stringify` drops entirely, silently sending a
  `loadDoc` the editor refuses whole and leaving a read-only request fully editable with nothing
  loaded; closed by typing `EditorWebView`'s `initialDoc` prop as the protocol's own `DocJson | null`
  rather than `unknown`, so passing `undefined` is now a typecheck error, not a runtime one.
  (`apps/mobile/src/editor/editor-web-view.test.ts`)
- 12.227 ✅ push registration degrades honestly against the routes that actually exist today: a 200
  response registers the Expo token; a 404 (the real answer — no `/v1/push/registrations` route is
  registered on `apps/server`, verified by reading its routes rather than assumed) reports
  `transport-unavailable` rather than throwing; a denied OS permission reports `no-token`; a non-404
  error status reports `http-<status>`. None of these is hypothetical — the 404 path is what this
  route actually answers on `main` as of this task. (`apps/mobile/src/push/register-push.test.ts`)

**What Task 17 does NOT cover here, named rather than left to be inferred.** No test exercises
`app.tsx`, `board-screen.tsx` or `ticket-screen.tsx` — they are thin RN components wiring the tested
modules together, per this project's own vitest-environment limits (no RN renderer under `node`), and
their correctness rests on the reviewed module seams above plus manual reading, not an executed
assertion. No case here is a distributed-systems scenario (that is Tasks 14–15); no case touches a
running app on a device or simulator. One fix the editor review found (a rejected `onMentionQuery`
leaving the webview's mention popup pending forever, now answered with an empty result on rejection)
is a `.tsx` component-level change with no test at this layer for the same reason.


## Task 14 — the dual-client harness rig (`apps/server/test/dual-client/`)

Two sync-client replicas on in-memory SQLite against the REAL ingest service, the REAL sync service and
real Postgres. The rig proves itself here before Task 15's scenarios trust it. **The rig is the
instrument, so a defect in it is a defect in every scenario that uses it** — which is why the two cases
that pin its own corrections (12.261, 12.262) matter as much as the three that pin its behaviour.

- 12.260 ✅ a claim made offline by A reaches B through sync and every side holds it EXACTLY ONCE after
  any number of further syncs. "Offline" is witnessed at the LEDGER, not at B — B has not synced, so
  B's silence would prove nothing. Asserts replica ≡ replica ≡ the SERVER's `proj_tickets`, which is
  the property Task 15 exists to lean on: full `TicketState` equality between the replica's reducer fold
  and `rowToTicketState`, kept exact rather than weakened to `stateId`.
- 12.261 ✅ **`ingestInteractive` is the GATED door.** A forged envelope-origin `'server'` is refused
  with the gate's own `PERMISSION_ROLE_RULE`/`SERVER_ORIGIN_REASON`, and the same claim with honest
  provenance commits through the same call. *The plan text used `ingestBatch` here — the INTERNAL door,
  which passes `door = null` so `checkPermission` never runs and whose own docblock says "an HTTP route
  must never call this". An online stand-in that skipped the gate would have let Task 15 assert
  permission outcomes the product does not have.* `ingestBatch` remains correct for the SEED and a
  comment says so where it is used.
  *Mutation: swap `ingestClientBatch` back to `ingestBatch` → red on 12.261 ALONE, `1 failed | 2 passed`.*
- 12.262 ✅ **a `visibility.set` BELOW the snapshot line still reaches a fresh client.** The rig imports
  the server's `BOOTSTRAP_BACKFILL_TYPES` rather than restating it; the plan's hand-copied list has four
  entries where the real one has five — it omits `visibility.set`. *Measured BEFORE this case existed:
  replacing the import with the plan's literal left every other case GREEN, with the edit confirmed
  present in the file before the run — an unconstrained path, not a mutation that never fired, and the
  two are indistinguishable from outside while only one condemns a check.* The snapshot pass runs
  between the claim and the fresh client so the event is genuinely below the line, which is the only
  position where the backfill is load-bearing.
  *Mutation: the four-entry literal → red on 12.262 ALONE, `1 failed | 3 passed`.* Carries its own
  control: `not.toContain('ticket.created')` proves the snapshot actually covered the ticket, so "below
  the line" is a fact about the run rather than an assumption.
- 12.263 ✅ **`goOnline()` throws rather than resolving with a claim the sync door never accepted.**
  `flush` answers a `transport.sync` throw with `outbox.recordFailure` and returns NORMALLY: the row
  keeps status `'queued'`, `next_attempt_at` moves out, `lastApplyFailure()` stays null and
  `failedItems` stays EMPTY — `recordFailure` deliberately does not mark `'failed'`, or every retryable
  claim would strand forever. A scenario would then assert one contest, see zero, and blame the product
  while the reason sat unread in `outbox.last_error`. *The FIRST version of this case failed and the RIG
  WAS RIGHT: `submit` goes through `ds.ingest`, which fires a flush that parks on the offline gate
  having ALREADY read its batch, so a later `recordFailure` never reaches it. The case enqueues directly
  and says so, because the next author will reach for `submit` too.* Carries the control that the same
  claim goes through once the failure is cleared.
  *Mutation: the `queuedCount` guard replaced by a constant `0` → red on 12.263 ALONE, `1 failed | 6 passed`.*
- 12.264 ✅ **an owner can publish a workflow through the GATED door and a member cannot.**
  `ADMIN_ONLY_TYPES` refuses `workflow.defined` and kin from every non-admin, and both scenario users
  are members — so Task 15's S3 and S4 were INEXPRESSIBLE until the rig grew a seeded owner. The
  member-refused half is the control: without it this would prove the owner passes a gate that might
  not exist.
- 12.265 ✅ **the same batch sent twice through the real sync door is idempotent** — identical results,
  one ledger row. Task 15's S6 was inexpressible until `Harness.sync` existed: `engine.flush()` drains
  only what is queued and the rows are gone after the first flush. *The plan's S6 built its own
  `createSyncService({pool, ingest})`, which does not compile — `serverAppend` is required — and would
  have been a SECOND instance, hiding any duplicate-suppression bug living in per-instance state.*
- 12.266 ✅ a client created AFTER a commit holds the ticket through `loadBootstrap` alone, with its
  cursor at the stream head, so its first `syncDown()` delivers and moves nothing.

### Carried, with owners — Task 14

- **A per-`StreamErrorCode` retry POLICY** — unchanged from Task 13's record; the surface shipped, the
  policy is still `createSyncEngine`'s. *Owner: unassigned.*
- **PRODUCT DEFECT: the snapshot-bounded bootstrap and the DataSource's provenance rule contradict each
  other.** After a snapshot pass, a FRESH client cannot read the snapshotted ticket through
  `ds.query.getTicket` — `ReplicaGapError` on `stateProvenance`, because `replica-data-source.ts`
  requires a `ticket.created`/`ticket.transitioned` in local `events` and a snapshot-bounded bootstrap
  ships neither below the line. `replica.getTicket` answers fine; only the DataSource door refuses.
  Found by the Task 14 review, NOT repaired in the harness — repairing it there would hide it.
  *Owner: **Lane A, closure 4**, sequenced after closure 3 (same replica/DataSource surface).*
- **Not measured by this task**, recorded so nobody reads the green as broader than it is: the stall
  path where `lastApplyFailure()` is non-null, the engine's no-progress guard, `bootstrapFor` under a
  concurrent writer, the JSON round trip the real WS performs, and `contests()` ordering with two
  contests filed in one batch.


## Task 15 — the dual-client scenarios (`apps/server/test/dual-client/scenarios.test.ts`)

The spec's named discipline (§7), executed: two replicas diverge offline, sync, and the outcome —
including every contested claim — is asserted EXACTLY, against the final ledger, the SERVER's own
projection, BOTH replicas and `proj_contested`. A fresh harness and a fresh database per scenario.

**The plan's scenario code assumed an API that does not exist** — `ds.query.getTicket` returns
`TicketRead`, which has no `confirmed`, no `contests` and no `pending`, and nearly every assertion in
the plan reads one of those off it. Sixteen corrections were verified against source before a line was
written; they are recorded in `docs/lanes/executor-state-B.md`.

- 12.267 ✅ **S1 — concurrent `field_set`: the later claim wins the projection and the earlier survives
  in history.** Both offline edits `pending`; the ledger witnessed at `[created]` before anyone goes
  online; after A then B land, the exact ledger `[created@1 A, claimA@2 A, claimB@3 B]`, the server's
  `fields.title` carrying B's value AND B's `actorId` and `clientTime`, A's replica holding the
  identical claim, A's history still containing claimA's id with its payload intact, and `contests()`
  EMPTY — a race is not a rule violation. Server ≡ A ≡ B; both cursors at head.
- 12.268 ✅ **S2 — a stale `restrict-to`: the offline claim contests with the exact rule.** B is
  assignee locally (asserted, not assumed), claims Done, A reassigns meanwhile. The contest row is
  asserted field-for-field including the embedded `original_event` deep-equal to what was sent, and the
  refusal REASON as the sentence `evaluateRestrictTo` builds. B's `LocalContest` is checked including
  `contestedAt` equal to the SERVER's instant — which is what proves the outbox's device-clock stub was
  corrected by the streamed envelope. `myWork(B).contested` holds it and `myWork(A).contested` is empty.
- 12.269 ✅ **S3 — a workflow changed while offline: the stranded transition contests with the engine's
  own rule.** The owner (not a member — `ADMIN_ONLY_TYPES`) publishes v2 dropping `review` with
  `stateMapping: { review: 'todo' }`; the server's projection is already folded onto v2 before B lands.
  The contest rule is asserted as the single literal `REFUSAL_RULES.unknownState` with the reason naming
  **"Harness v2"** — *the plan's three-way `toContain` replaced by strict equality, because a membership
  test is not an exact outcome; and the v2 NAME in the reason is the control that the claim was judged
  against v2 rather than v1.*
- 12.270 ✅ **S4 — visibility narrowed while offline: the claim contests, NOTHING is delivered, and
  re-widening converges both.** The queued edit is refused with `permission.visibility` /
  "This ticket is not visible to you." and recorded as `claim.contested`. **The excluding half:** B
  receives neither the narrowing `visibility.set` nor the contest — asserted BY EVENT ID, because a
  count would pass if the wrong two events arrived — and B's cursor does not move, since only a
  DELIVERED envelope moves it. A, still listed, sees both as history. Re-widening drains all four
  events in order, the server's envelope corrects the stub's device timestamp, and the replicas
  converge exactly — **and that convergence is a property of THIS SCENARIO'S SHAPE, not of the
  product. See 12.274, which measures what happens when the shape is ordinary.** *Carries a control
  that B's stub `contestedAt` differs from the server's before re-widening, so convergence is something
  re-widening must DO rather than something already true — compared on that ONE field rather than by
  whole-object inequality, which would have been a wall-clock race.*
  *Mutation (Ruling P35(b)): the server's visibility gate in `visible-events-for.ts` forced to permit →
  **12.270 and 12.272 both redden**, S1/S2/S3/S6 stay green. Not "12.270 alone" as the ruling
  anticipated: 12.272 independently depends on the same gate for the child's contest reaching nobody.
  Both reddenings are correct and for the same reason. Restored with `git checkout HEAD -- <path>`,
  verified by reading the file and `git status --porcelain`.*
- 12.271 🚫 **THE UNDER-PURGE RESIDUAL — recorded, deliberately NOT asserted.** After the narrowing, B
  still holds its pre-narrowing copy in full: `listEntityEvents` unchanged, `getTicket().confirmed`
  unchanged, and the ticket still returned by `searchOfflineCopy`. That is case **6.104**: the
  per-event purge walk was DELETED, not narrowed (the ruling on 6.101), so a member un-shared by a
  plain `visibility.set` keeps the stale copy until a full resync. **No test pins it, on 6.104's own
  stated reason** — *"a test asserting 'no purge arrives' would harden the wrong half of a gap this
  branch wants closed rather than preserved"* — and the reason is sharper here than there: **6.104's
  owner is Plan 10, this plan**, so an assertion would be a test that whoever closes the gap must BREAK
  to fix it, with a comment insisting its own redness is correct. The assertions 12.270 DOES keep
  survive that fix: a purge instruction removes state and does not move a cursor, so "these two events
  never arrived" and "the cursor did not move" both stay true. *Owner of the residual: Plan 10 — the WS
  catch-up/purge protocol. Ruling P35(a), as amended after this lane raised the conflict.*
- 12.272 ✅ **S5 — the offline reopen pair contests coherently when the world changed.** The bare child
  creation is refused LOCALLY by the pre-check with `hierarchy.parent-terminal` and queues nothing; the
  reopen pair is then built against a stale replica and both halves contest on arrival — the reopen
  with `restrict-to`, the child with `hierarchy.parent-terminal` whose reason is asserted `===` the
  sentence the LOCAL pre-check produced, which is what proves client and server refuse in the same
  words. The contests are located by `original_event_id`, never by index, because `contested_at` can
  tie. Nothing moved: the parent is still Done on the server, the child ticket does not exist, and the
  child's contest is filed against the CHILD's entity id — a ticket that never came to be.
  **THE FINDING THIS SCENARIO SURFACED, asserted as product behaviour:** the child's `claim.contested`
  streams to NOBODY. `canSee` is false for a ticket with no `proj_visibility` row (unknown ≡ invisible,
  by design), so `visibleEventsFor` never yields it — A never learns of it and B holds only the outbox
  stub. Not mentioned anywhere in the plan. **CORRECTED after review: an earlier version of this line
  said "both cursors sit PERMANENTLY at `head - 1`". That is false and is left visible rather than
  edited into looking right.** What is permanent is the NON-DELIVERY; the next visible envelope in the
  workspace carries both cursors past the invisible row (measured: one `field_set` on the parent takes
  head to 8 and both cursors to 8, with the child's contest still reaching neither replica). `head - 1`
  is also incidental to BATCH ORDER — the reopen is submitted before the child, so the child's contest
  is the head row; child-first would leave the cursors AT head with the same non-delivery.
- 12.273 ✅ **S6 — the same batch twice is idempotent to the byte.** Sent through `Harness.sync`, the
  object `POST /v1/sync` itself delegates to: identical answers including the same contest id, the
  ledger unchanged and asserted exactly, one contest row, and `readStreamSeq` unchanged across the
  retry. *The plan built its own service instance here, which would have hidden a duplicate-suppression
  bug living in per-instance state.*

- 12.274 ✅ **A RE-WIDENED TICKET COMES BACK EVEN IF THE CLIENT READ SOMETHING ELSE MEANWHILE.**
  *This case was 🚫 and recorded a PRODUCT DEFECT. Closure 5 (ruling P37) closed it, and P37 constraint 3
  makes this probe the GREEN case rather than retiring it — so the script is unchanged and only the
  expected outcome moved.* The defect, kept because it is what the case measures: the sync cursor is the
  highest `workspaceSeq` DELIVERED, so any visible event committed while a ticket is narrowed carried the
  client's cursor PAST the narrowing and past any row filed on it meanwhile; re-widening then delivered
  only the widening, the earlier rows sat below the cursor, and **nothing ever re-sent them**. Measured
  twice and independently — by the Task 15 floor-list reviewer and then by this lane's own probe: one
  unrelated visible commit between narrow and widen took the cursor 4 → 7 past narrow(5) and contest(6),
  and the client ended holding 2 events where the server held 4, permanently.
  **What closed it:** `visibleEventsFor` now backfills on newly GRANTED visibility
  (`apps/server/src/visibility/grant-backfill.ts`). The executable form is **12.275**, which runs this
  exact script and additionally ASSERTS the control that made it a defect — B's cursor must have run past
  the narrowing before the widening, or the test is 12.270's quiet shape under a new name.
  *`visible-events-for.ts` had named this absence in prose since Task 11 — "Plan 10's job, on top of this
  primitive" — and for that whole time nothing did it. A sentence naming an owner is what made the absence
  look like a decision.*

### Closure 5 — the grant half (ruling P37, 2026-09-06)

`apps/server/test/dual-client/grant-backfill.test.ts` (against two real replicas) and
`apps/server/test/visibility/grant-backfill.test.ts` (at the filter, where the decision is made).

- 12.275 ✅ **A re-widened ticket comes back even if the client read something else meanwhile — and it
  takes BOTH halves of closure 5 to make it.** *(REWRITTEN by closure 5b. The old entry said "the control
  is the case"; that is no longer true — the RECONCILE is.)* This is 12.274's own script: narrow, one
  unrelated visible commit so the cursor passes the narrowing, re-widen. **A straight port would have been
  green-looking and false.** The client's filter is *"do I hold this ticket"*, and a narrowing purges
  nothing (6.101 struck the walk; 6.104 is the disclosed residual), so B holds a STALE PARTIAL copy right
  through the narrowing — the notice names a ticket B "holds", nothing is fetched, and 12.274's
  divergence survives wearing closure 5's clothes. What closes it is `reconcile` purging the stale copy
  FIRST, so the later notice finds a ticket B does not hold. The `reconcile` call is therefore asserted as
  a step of the real path (`{presented: 2, purged: [ticketId]}`), not slipped in as setup. Asserts the
  wire (exactly one notice naming exactly that ticket; the drain's only envelope is the widening, because
  the pushed tail is gone), the pull (exactly that one id, pending set empty), and convergence (full
  `TicketState` equality, `projTicket` equality, both cursors at the head). **The equality is load-bearing
  for a NEW reason:** A's state is the incremental `applyServerItem` fold and B's was rebuilt by
  `refoldTicket` inside `loadTicketBootstrap`, so it now compares two different construction paths.
  *Residual recorded at the case and in `grant-backfill.ts`: `RECONCILE_MIN_INTERVAL_MS` bounds the
  reconcile, so a narrow-and-re-widen inside that window leaves the stale copy with no repair — 12.274 at
  reduced width.* **⚠️ THE "BOUNDED IN TIME" CLAIM THAT STOOD HERE WAS WRONG, and the branch review found
  it.** It said `RECONCILE_MIN_INTERVAL_MS` bounded the window. It does not: `hub.ts` sends `caught-up`
  once per SUBSCRIPTION (`caughtUpSent`), so the automatic reconcile is once per RECONNECT — and a
  narrow-and-re-widen with no reconnect between them never reconciles at all. **On a stable socket the
  "bounded" residual was the FULL defect**, and this case was green only because it calls
  `b.engine.reconcile()` by hand. *The wrong sentence is recorded rather than deleted: "bounded in time"
  is exactly the reassurance a later reader takes on trust.*
  **CLOSED in the same PR by closure 5c's minimal form** (controller ruling, 2026-09-06): the client's
  `reach-granted` handler reconciles the ids the notice NAMED before deciding what to pull, and re-owes
  anything that purged — so the schedule and the reconnect latch are irrelevant for exactly the tickets
  at risk. Cases 12.312 and 12.313.
- 12.276 ✅ **A repeated no-op `visibility.set` costs a holding client NOTHING** *(retitled: it used to
  measure "the same history handed back twice is idempotent", which was the push shape's property and has
  no subject now)*. This is the amplifier bound ruling P37.1 claims, measured rather than cited —
  `check-permission.ts` does not refuse a `visibility.set` that sets the mode a ticket already has, so
  without this property one member could make the server re-serve a subtree per commit. The notice is
  witnessed on the wire first, then the pull count is exactly zero, the pending set empty and the local
  history gains exactly the trigger. **Same-run positive control:** widening a ticket the client never
  held costs exactly one pull, and its history arrives BY PULL and not by push (the drain's envelope list
  is the trigger alone). Then the loop closes — a further no-op on that now-held ticket costs zero again.
- 12.277 ✅ **A viewer OUTSIDE the new audience receives nothing, and a narrowing is not a trigger for the
  person it narrowed away.** *(REWRITTEN by closure 5b: the observation moved from "which history
  envelopes arrived" to "which ids the notice named".)* The excluding fixture P37 names. Asserted as ONE
  exact drain list, which fails if a notice appears at all; the insider, from the same cursor on the same
  call, does get the notice. **The vacuity trap this case is famous for SURVIVED the reshape and got
  worse**: its old control read `JSON.stringify(delivered).toContain(ticket)`, which passed because the
  narrowing event itself carries the ticket id — and under the notice shape the trigger still travels
  beside the notice, while the ids are now the entire payload. So the control asserts the NOTICE's
  `ticketIds`, never a dump. *A widening self-selects, a narrowing self-excludes, and that is why no
  before-image is needed and 6.82/6.94 stay untouched.*
- 12.278 ✅ **A widening NAMES the ticket and every inheriting descendant** *(was: "hands back the
  pre-cursor history … eight envelopes")* — parent, child and grandchild, in the walk's breadth-first
  order, with no duplicates, asserted as one exact sequence that also pins two further properties: the
  notice arrives BEFORE its trigger, and the trigger is the drain's only envelope. Under the push shape
  this drain carried eight; it now carries one plus a notice.
- 12.279 ✅ **A descendant that AUTHORED its own audience is pruned** — the ancestor's widening does not
  name it. Asserted as the notice's exact id list, so the exclusion and its positive control are one
  assertion rather than a `toContain`/`not.toContain` pair. This is `reResolveSubtree`'s own prune,
  applied read-only.
- 12.280 ✅ **An inheriting child in ANOTHER project is refused by the notice's own `canSee`.** The case
  exists to make that guard killable: for every ORDINARY descendant the guard is redundant, and it is
  load-bearing only where the inherited mode is `'project'` and the child's OWN `project_id` differs —
  because `canSeeResolved` asks `eff.projects.has(v.projectId)` against the CHILD's row. **Without this
  fixture the guard would be unkillable and would have had to be dropped**, on `stream/hub.ts`'s own
  precedent of four masked `sub.ended` guards. **Under the notice shape it matters MORE than it did**:
  the ids ARE the payload now, so this guard is the only thing between a subtree walk and a notice naming
  ids the reader may not see.
- 12.281 ✅ **`ticket.reparented` is a trigger too** — inheritance is an audience, so moving an unauthored
  ticket under a visible parent widens it exactly as a `visibility.set` does. The payload field is
  `newParentId`; `parentId` is the plan text's spelling and leaves `parent_id` unchanged for ever. The
  notice-before-trigger ordering is asserted here specifically, because `ticket.reparented` is the folded
  event: a client handed the trigger first would replay a transition with no `ticket.created`.
- 12.282 ✅ **Once per widening, per drain** *(the "bounded to PRE-cursor rows" half DIED with the push
  shape — a notice carries no rows, so that clause has no subject; the exact-envelope-list assertions in
  12.278, 12.281 and 12.291 are what replaced it)*. Two triggers on one ticket in one drain — deliberately
  one `visibility.set` and one `ticket.reparented`, so nothing rests on a same-value short-circuit — name
  it once; a LATER drain that sees a NEW widening is owed the notice again, because the ledger is scoped
  to the drain and not to the subscription.
- 12.283 ✅ **The THIRD shape of grant — CLOSED by closure 5b(a).** *(Was 🚫, recorded and not built;
  P37 scoped closure 5 to "the visibility event itself".)* Visibility also widens when the READER's reach
  grew rather than the ticket's — `membership.granted`, `project.member_added` — and every ticket such an
  event reveals carries the identical pre-cursor gap. **It could not be another entry in
  `GRANT_BACKFILL_TRIGGERS`, for a structural reason rather than a scoping choice:** those are roster
  events filed against the roster entity, so there is no ticket to start a subtree walk from, and the
  question inverts with the widening — not who can now see this ticket, but which tickets can this viewer
  now see. `readerReachNoticeFor` answers it with `listVisibleTickets`, the same predicate every read
  endpoint uses, rather than a second definition of visibility. It answers what the reader can see NOW,
  not what they gained, because there is no before-image to subtract; it therefore OVER-NAMES, which is
  affordable only because the client drops ids it already holds without asking the server anything.
  Two cases in `apps/server/test/visibility/reader-reach.test.ts`, each with its excluding half in the
  same run against the same ledger. The project case asserts the notice EXACTLY — a workspace-wide
  listing would satisfy "contains the joined project's ticket" while disclosing one in a project the
  member still cannot see — and the membership case plants an owner-only ticket in the same project for
  the same reason, plus a bystander who CAN see the named ticket and would be a plausible recipient for
  an implementation keyed on the ticket rather than on the event's subject. *The file's own docblock
  records the trap that would have made both pass for the wrong reason: `seedMember` writes the
  projections and NOT the ledger, so in most fixtures no roster row exists to be drained at all.*
- 12.284 ✅ **`POST /v1/sync/reconcile` answers `{kind:'restricted', id}` for the narrowed ticket and says
  nothing about the one still held** — asserted as an EXACT response, because `toContainEqual` alone would
  pass on an answer that restricted both, and that answer wipes a replica. A caller with no role gets
  403 `{error:'not_a_member'}` for the SAME ids the member just got a real answer for, so the refusal is
  about the caller and not about the ids: a stranger never reaches `canSee` and cannot use this door as
  an id probe. *This case alone does NOT catch a handler that enumerates the workspace — it presents both
  ids, so enumeration adds nothing to its fixture. 12.285 is why it is caught.*
- 12.285 ✅ **The answer can only name ids the caller presented.** Presenting only the lost ticket must not
  mention the kept one, whose id appears in no field of the response; presenting only the kept one yields
  an empty `restricted` rather than an opportunistic list.
- 12.286 ✅ **An id that never existed answers EXACTLY as a genuine loss — no existence oracle.** This is
  the case that would go green under a wrong implementation of everything else: a handler that OMITTED ids
  it had no row for, and restricted only the known-but-invisible, would make presence-versus-absence the
  oracle — "lost versus never-had" closed in the content and reopened in the SHAPE. Asserted by
  substitution: replacing the fabricated id with the real one makes the two responses byte-identical.
  Mixed in one request both are named in the caller's own order, so position leaks nothing either, and a
  repeated id is answered once so length is not a second channel. *`canSee` already answers unknown and
  invisible identically and says so; this door is the second reader depending on that sentence.*
- 12.287 ✅ **The engine purges only ids it presented.** Given an answer naming a held ticket it never
  presented, the engine purges the presented one and leaves the other standing. The server cannot name an
  unpresented id — its reply is built by walking the request — but a purge is destructive and LOCAL, and
  this device does not need to trust a remote party in order to be safe from it. Vacuity excluded: the
  replica is asserted to hold both tickets before the reconcile.
- 12.288 ✅ **The reconcile SCHEDULE — CLOSED by closure 5b(b).** *(Was 🚫: "nothing calls `reconcile` on
  a schedule; when a device should is a product decision with a cost and no plan states it".)* The engine
  calls it on catch-up completion — **which is once per SUBSCRIPTION, not once per catch-up**, because
  `hub.ts` gates the frame on `caughtUpSent`; an earlier version of this entry said "every catch-up
  completion" and overstated it until the branch review measured the latch — with **no
  `engine.reconcile()` call anywhere in the test** — the
  moment a device's cursor is current is the moment its HOLDINGS may be stale, because a narrowing sends
  the losing device nothing at all (6.104). **The tempting cheaper trigger is unsound and is refused in
  the source:** gating on "the catch-up delivered something" would skip the zero-frame catch-up, which is
  precisely the case reconcile exists for. So the bound is TIME, not activity — `reconnectDelayMs` is a
  fixed 2000 with no growth or jitter and the hub sends one `caught-up` per subscription
  unconditionally, so a flapping socket would otherwise reconcile every two seconds for ever at
  `ceil(held / 100)` requests each. Asserts the restricted ticket is purged and the OTHER one still
  folds, so this is a targeted purge and not an emptied store. *Its scheduling mutation reddens 12.288
  AND 12.307 — a case bounding the interval must observe the interval's first firing, so no honest 12.307
  leaves it alone; a second discriminating mutation (skip the purge) reddens 12.288 and 12.287 instead.
  Both recorded as measurements rather than as an "alone" nobody saw.*
- 12.305 ✅ **A notice pulls exactly the ids the device does NOT hold.** The held ticket is asserted
  readable first — the non-vacuity control — then the pull list is asserted EXACTLY, so an id already held
  costing a pull would redden. This is ruling P37.1's "a repeated no-op `visibility.set` costs a holding
  client nothing" measured on the client side. The cursor is asserted unmoved: the pull door writes none.
  *Dropping the holdings filter in `replica.ts`'s `reach-granted` arm reddens this case ALONE.*
- 12.306 ✅ **A failing pull does not stall the engine, stays owed, and the next catch-up retries it.**
  The most important case in the set: `stalled` is a one-way latch cleared only by `start()`, which
  mobile never calls again, so a transient network failure that reached `stall()` would brick the device
  until the process restarts. Asserts `lastApplyFailure()` null, the chain still alive (a later
  transition folds), the id still owed — then a working transport on the next catch-up converges.
  *Rethrowing inside the drain's catch reddens 12.306 and 12.308.*
- 12.307 ✅ **Two catch-ups in quick succession produce ONE reconcile.** Time is controlled honestly:
  `vi.useFakeTimers({ toFake: ['Date'] })` — `Date` only, `setTimeout` left real — and the base instant
  is captured from the REAL clock first, because sinon's default epoch is 0 and would compute a negative
  age, passing for the opposite reason. The second half advances 61 s and requires a second reconcile, so
  the case pins the interval in both directions. Cursor 10 is the control that the second catch-up ran
  at all. *Both `true ||`-ing the guard and reducing it to once-per-process redden this case ALONE, in
  opposite directions.*
- 12.308 ✅ **A pull that never settles is abandoned rather than parking the apply chain for ever.**
  Written rather than skipped. `net/http-transport.ts` calls bare `fetch` with no `AbortSignal` anywhere
  in the file and `applyChain` is strictly serial, so without a timeout the chain simply stops: status
  stuck at `live`, `stalled` false, `settled()` never resolving, nothing surfaced — a SILENT brick traded
  for the loud one. Asserts not-drained at `PULL_TIMEOUT_MS - 1` and drained at `+1`, the id still owed,
  and no apply failure. *Dropping `withTimeout` reddens this case ALONE — as a 7 ms assertion, not a
  runner timeout, so the case DETECTS the hang rather than surviving it. The author's own prediction said
  "vitest timeout" and is corrected here against the measurement.*
- 12.289 ✅ **6.104's residual actually closes, by the CLIENT-PRESENTED path.** *(Not "end to end" — that word was here until the branch review measured it. The rig's transport RESTATES the route's rule in-process rather than calling it, the same way it restates `bootstrapTicket`; the ROUTE is covered by 12.284-12.286 through `app.inject`. **No single case runs the client and the real route together**, so a drift between them is caught by nothing until closure 5b points the rig at `inject()`.)* The residual is
  witnessed first — after a narrowing B still holds the ticket, its history and its searchable title, and
  no tombstone ever arrived — then `engine.reconcile` removes it: `getTicket` null, `listEntityEvents`
  empty, offline search blank. **Bounded:** a ticket B still legitimately holds is untouched, so the same
  assertions could not pass against a reconcile that wiped everything. **Honesty invariant 5:** B's own
  contested claim survives the purge, because `purgeEntity` deliberately keeps contests this user
  authored. A is unaffected. A second reconcile presents one fewer ticket and purges nothing.
  *P37 constraint 3 requires exactly this path — a rig driver calling `purgeEntity` per id would be
  asserting the harness rather than the product.*

### Ruling P37.1 (2026-09-06) — the atomic burst, and the interim cap

Raised by the branch review, survived adversarial refutation, ruled the same hour. **This lane's block
12.290–12.319, controller-allocated after 12.260–12.289 was exhausted.**

- 12.290 ✅ **THE MECHANISM IS GONE, AND THE CONVERGENCE IT ASKED FOR IS NOW MEASURED END TO END.**
  *(Was ❌ under closure 5b(d), then 🟡 for the whole of ruling P37.1's life. Flipped 2026-09-06 by
  `apps/server/test/dual-client/socket-cut.test.ts`, cases 12.340-12.343 — Lane D, the fixture the
  🟡 entry named as the only thing that could flip it.)*
  **What changed first:** the grant side no longer streams history at all — `grantNoticeFor` returns ids
  and `visible-events-for.ts` yields ONE bounded `reach-granted` frame — so the atomic non-progressing
  burst the wedge was made of does not exist. A list of ids is a list of ids however long the histories
  behind it are.
  **What changed second, and is why this is ✅.** The ruling's flip condition was *"a slow-consumer close
  MID-PULL followed by convergence on reconnect"*, and the 🟡 entry's stated blocker was that **nothing
  on this branch could cut a socket** — the dual-client rig has none by construction (`openStream`
  throws, deliberately) and the engine's tests use a fake transport with no buffer bound. That is no
  longer true. `socket-cut.test.ts` stands a REAL `buildApp` on a REAL `listen()` (so a real HTTP
  upgrade happens, which `app.inject` cannot make), against real Postgres, the real
  `visibleEventsFor`, and **`stream/hub.ts` and `stream/routes.ts` completely unmodified** — driven from
  outside by the real, unmodified `@gisik-nokma/sync-client` engine, replica, outbox and HTTP transport
  over a real `ws` socket authenticated by a real better-auth bearer token at the upgrade.
  **How the cut is real.** `bufferedAmount` is a PROTOTYPE accessor on `ws`'s `WebSocket`, so an own
  property of that name on ONE live instance shadows it for that instance and nothing else — no
  prototype touched, no other connection affected, the hub told nothing, and the bound it trips is the
  shipped `DEFAULT_MAX_BUFFERED_BYTES` (1 MB, which `buildApp` does not even expose) rather than a
  shrunken test value. The next ordinary commit makes `hub.ts`'s `send` close that peer for real.
  **MEASURED client-side, not assumed: close code `1013`, reason `'slow-consumer'`, twice**, recorded on
  the client's own `ws` instance (the transport discards the close event, so it is visible nowhere
  else). Status sequence across the run, asserted whole:
  `connecting, catching-up, live` × 3 — which is the evidence the two reconnects really ran rather than
  the fixture timing out into a pass.
  **The re-delivery chain is now measured in TWO halves, because one cut cannot see both** (12.340 and
  12.341, and the split is itself a finding): `visible-events-for.ts` scopes `backfilled` PER DRAIN and
  a notice advances no cursor, so a cut before the pulls finish is repaired by the REGENERATED notice on
  the reconnect — and while the notice comes back, `onCaughtUp`'s own drain is unreachable. A second cut
  taken after the cursor has passed the trigger removes the notice from the wire and leaves
  `onCaughtUp`'s pre-cursor drain as the only path, which is where the pull that failed under the first
  cut finally lands. Both ends compare against SERVER TRUTH (`getTicketStateFromDb`), the comparator
  `grant-backfill.test.ts` already uses.
  **What was already measured and still is:** a failed or timed-out pull leaves its id in a DURABLE
  pending set and the next catch-up retries it (12.306), and an unsettling pull is abandoned rather than
  parking the apply chain (12.308). 12.340-12.343 are what make those link-by-link facts an end-to-end
  one.
  **The residual kept from the old entry, because it is unchanged:** `check-permission.ts` still does not
  refuse a `visibility.set` that sets the mode a ticket already has. What changed is the cost of one — a
  client that already holds the subtree now does no work for it (12.276), so the amplifier is bounded by
  HOLDINGS rather than by trust in the permission check.
  **⚠️ THE OLD WARNING STILL APPLIES to anyone restoring a push shape:** do not yield the trigger first.
  `ticket.reparented` IS folded, so a client that never held the ticket replays a transition with no
  `ticket.created` and `applyTicketEvent` throws — the engine's terminal stall, worse than the failure it
  fixes. **The measurement that was owed — Lane F (test infrastructure), ruled by the controller
  2026-09-06, "a socket-cutting fixture" — was BUILT AND RUN on 2026-09-06 and this entry is flipped on
  it.** The old owner line said *"12.290 flips to ✅ only when that fixture exists; nothing in this repo
  can cut a socket, so the ruling's own flip condition is unmeasurable here"*, and it is quoted rather
  than deleted because it states the exact condition that has now been discharged. The fixture is NOT
  built on the dual-client rig, which is where the ruling expected it: the rig's whole design is a
  socketless in-process mirror, so the fixture stands its own real server instead and leaves
  `rig.ts` untouched.

- 12.291 ✅ **The walk is capped at `GRANT_BACKFILL_MAX_TICKETS` (200) — P37.1's interim guard, and not
  its fix.** Fixture is OVER the cap by two, all direct children of one parent so the whole excess sits
  in a single breadth-first frontier. Asserts the touched-ticket count is **EXACTLY** the cap — not
  "at most", which would also pass against a backfill that delivered nothing, and this file's whole
  family of defects is a check that passes for the wrong reason. Also asserts the trigger ticket is
  never the one dropped (it is the walk's seed; the cap is checked before each pop) and that at least
  two children really were excluded, so the fixture is over-cap rather than exactly at it.
  **What the cap does NOT bound, stated in the constant's own docblock:** a single ticket with a very
  long history — one ticket over the wire is one ticket whatever its event count. The reachable burst is
  narrowed, not closed; 12.290 owns the residual. **Truncation is silent on the wire** and deliberately
  so: announcing it would need a fourth `SyncItem` arm, which is a protocol nobody agreed and exactly
  what `applyInstruction`'s fail-closed switch exists to make a deliberate act.

### Mutations run for closure 5 — each result is the measurement, not the intent

| mutation | result |
|---|---|
| `GRANT_BACKFILL_TRIGGERS` → `[]` | **`6 failed (6)`** after the review round — every case in the file. *It was `5 failed \| 1 passed` before, and the SURVIVOR was the finding: 12.277's positive control read `JSON.stringify(forInsider).toContain(ticket)`, which passed because the NARROWING EVENT ITSELF carries the ticket id in `entity.id` and `payload.ticketId` — so it would have passed against an empty `grantBackfillFor`. A check passing for a reason unrelated to the property it names, in the case written to demonstrate that discipline. Re-aimed at the pre-cursor event's ID, it now reddens with the rest.* |
| the walk cap removed (`while (frontier.length > 0)`) | **12.291 alone**, against its over-cap fixture. |
| `grantBackfillFor`'s own `canSee` → permits everything | **`1 failed \| 5 passed` — 12.280 ALONE.** Edit confirmed present in the file before the run, so this is a killed guard and not a mutation that never fired. |
| the reconcile route enumerates `proj_visibility` instead of walking the request | **`2 failed \| 10 passed`** — 12.285 and 12.286. 12.284 stayed GREEN, which is why 12.285 exists. |
| the engine drops `chunk.includes(item.id)` | **`1 failed \| 63 passed` — 12.287 ALONE.** |

*A restore trap recurred and is recorded because it will recur again: `git checkout HEAD -- <path>` does
NOT restore an UNTRACKED file — it fails with "pathspec did not match any file(s) known to git", which is
easy to skim past in a background log. The first run of the second mutation above was therefore executed
with the FIRST mutation still applied and its result was discarded as confounded. The fix is to commit
before mutating, not to remember.*

### Carried, with owners — Task 15

- **The contest event's `actor_id` is the CLAIMANT, not a server identity** (`sync-service.ts`'s own
  docblock says so). Asserted in the exact ledger rows of 12.268 and 12.273 rather than left to be
  rediscovered — a reader expecting a server actor would call these rows wrong.
- **Two submits while a client is parked offline become TWO batches, not one.** `ds.ingest` fires a
  flush after each enqueue; the first parks holding its batch and the second returns the in-flight
  promise. The server outcome is identical, so nothing asserts batch COUNT — recorded so nobody adds an
  assertion that one `processBatch` call happened.
- **What a green run here does NOT prove**, recorded because these scenarios are this project's
  evidence that sync works: the stall path where a committed claim cannot be folded, the engine's
  no-progress guard, `bootstrapFor` under a concurrent writer, the JSON round trip the real WebSocket
  performs (the rig hands objects to the replica), and `contests()` ordering when two contests are
  filed inside one batch and tie on `contested_at`.
- 12.250 ✅ `mapMyWork` ANSWERS — the three server groups concatenate open → active → terminal into `assigned`, in that ORDER (asserted as the id sequence, not a length: a length passes for a mapper that emitted one group three times), each item's `stateName` read from the `stateNames` map keyed by TICKET id while all three cards share `stateId: 'doing'` — so a fallback to the state id reads `doing` three times and fails — the `stateCategory` surviving so a client can rebuild the server's buckets without a second read, and `inTransit: []` as a structural emptiness rather than a read that came back empty. This case REPLACED 3.41, which asserted that the two contested refusals blamed `/v1/contests`; both refusals are gone (P39 removed the field, P40 moved the door) and a removed refusal must leave something that would notice the day the mapper invents a `stateName` again. *The fixture's first draft put cards carrying `stateCategory: 'active'` into the `open` and `terminal` groups — a body the route cannot emit, since that field IS the key `bucketFor` groups by — and this case caught it.* (`packages/app-core/test/online/mappers.test.ts`)
- 12.251 ✅ THE EXCLUSION, and the two sibling-map misses do NOT mean the same thing: a `projectNames` miss is the visibility rule applying (P32/P38) and degrades to `projectName: null` with the `projectId` kept, while a `stateNames` miss is a MALFORMED BODY and refuses with a `MappingError` naming `myWork.stateNames.<ticketId>` — the route documents that map as total and `WorkItem.stateName` is required. Both halves in one run, with a named project as the positive control, so `null` is the rule and not a mapper that never reads the map. A mapper treating the two alike would either blank a legal name or put a slug where a name goes, and only a case carrying both can tell those apart. (`packages/app-core/test/online/mappers.test.ts`)
- 12.252 ✅ A contested claim maps with both RECORDED instants and no `serverTime` — ruling P39's own excluding fixture. The claim's key set is asserted by equality (`['actorId','clientTime','contestedAt']`) and `not.toHaveProperty('serverTime')` is stated separately so the failure names the member that would make it a `ClaimProvenance`. The title register is exercised both ways in one body: a visible contest carries its title, a withheld one carries `null` and keeps its `ticketId`. Mutation: making the mapper copy `contestedAt` into a `serverTime` reddens **12.252 alone**. (`packages/app-core/test/online/mappers.test.ts`)
- 12.253 ✅ `mapAttention` maps the three SHIPPED kinds, each carrying the claim the item is actually ABOUT — `blocked` and `stale` the state provenance, `due-soon` the DUE claim. The fixture gives the due claim a different actor AND a different instant from the state provenance, because `card.stateProvenance` is present on every arm: a mapper reaching for the nearest provenance produces a perfectly well-formed strip that attributes a deadline to whoever last transitioned the ticket, and only differing fixtures catch it. The route's `reason` sentence is asserted verbatim (it is composed server-side from workspace thresholds this client does not hold). A fourth wire arm is REFUSED, never skipped — silently dropping it would shorten a strip whose emptiness the user reads as an answer. (`packages/app-core/test/online/mappers.test.ts`)
- 12.254 ✅ The fourth item kind is the JOIN: contests from `GET /v1/contests` are appended to the swept items with `title` and `projectId` off the contest row itself and `claim: null`. The union is asserted (both kinds present), not one or the other; `claim: null` sits beside a swept item whose claim is NOT null, so the null is `AttentionItem.claim`'s nullability working rather than a mapper that fills nothing. This is the difference from `ContestedClaim.claim`, which is non-nullable and therefore needed a type of its own. (`packages/app-core/test/online/mappers.test.ts`)
- 12.255 ❌ **`BoardCard.cause` is NARROWED, not served, on the SNAPSHOT-BOUNDED path** — and the narrowing is already argued in the source (`replica-data-source.ts`, the board card literal): `cause` is read off the EVENT payload by `causeOf`, the snapshot provenance block does not carry it, so a device whose bootstrap was snapshot-bounded shows **no “reopened — live work added” badge** for any ticket whose reopening is below the snapshot line. *Owner: ruling P36, per its own clause for fields the block does not carry.* **Why it is ❌ and not 🚫:** the direction is safe — a MISSING badge, never a false one, the same direction `hasRestrictedParent` argues for a few lines up — but “safe” is a claim about the code as written and nothing asserts it. A future change that fabricated a cause from the state category, or defaulted the badge on for any terminal→open move, would invert it silently and every replica test would stay green. **The case to write:** a snapshot-bounded fixture (no `ticket.transitioned` in the local log, a delivered provenance block) whose ticket WAS reopened on the server, asserting `card.cause === null` on the board — with the two controls this file has learned to demand: the SAME ticket served with its local reopening event present must carry `{kind:'reopened-for-child', childTicketId}`, so `null` cannot pass for a `causeOf` that never fires; and the card must be PRESENT in the column, so the assertion is not being made about an absent card. **Closing it properly is a sync-client change, not a test:** the block would have to grow the cause, which couples `sync-client` to a domain type it does not otherwise know — which is exactly why P36 left it, and why this stays ❌ rather than being built here. Not attempted on `exec/37-c2-cursor`: the session halt arrived first, and a half-written snapshot fixture pushed unverified is worth less than a precise statement of what is missing. — `packages/app-core/test/replica/replica-data-source.test.ts`
- 12.256 ✅ **THE C2 REFUSAL FLIPS TO THE SERVED PATH** (ruling P41, Door B). This case used to assert that `mapListView` THREW on a non-null cursor: `TicketListView` had nowhere to say *there is more*, so serving the rows presented a page as the whole project. **The refusal was right and is now unnecessary rather than wrong** — the mapper no longer claims to produce the view. `mapListPage` maps ONE PAGE to `ListPage` and carries the cursor out; the property that mattered moved one level up, where no caller can mistake a page for a project because no caller ever receives a page. Pins that the cursor is READ and not defaulted: a set cursor, a null cursor and an ABSENT key (the same answer as null, deliberately — the server omits it on some terminal shapes and distinguishing them would make an unobservable wire detail load-bearing) in one run, plus a wrong-TYPED cursor refused, because stringifying a number would page forever against a request the server cannot resolve. — `packages/app-core/test/online/mappers.test.ts`
- 12.257 ✅ **A TWO-PAGE PROJECT ASSEMBLES: both pages, disjoint, and complete together.** The excluding fixture ruling P41 required. Four rows across two pages in page order (a loop stopping after page one returns two and fails); a `Set` size check so a loop that failed to advance the cursor and re-fetched page one cannot pass the length check by accident; and the URLs are asserted — two requests, the first WITHOUT `cursor=`, the second WITH it, and `groupBy` surviving onto the second, since a second page requested without the filter would silently be a different query feeding the same accumulator. The fixture uses a dedicated `pagingFetch` rather than the file's `recordingFetch`, which strips the query string before looking an answer up and would therefore answer page one forever — *a harness that cannot distinguish the pages cannot test paging.* (Mutation: stop the loop after page one → **2 failed, 21 passed**, this case with `expected [ 't1', 't2' ] to deeply equal [ 't1', 't2', 't3', 't4' ]`, and 12.258 too, since the cap becomes unreachable.) — `packages/app-core/test/online/online-data-source.test.ts`
- 12.258 ✅ **PAST THE CAP IT REFUSES LOUDLY** rather than serving a truncated project. One page beyond `LIST_PAGE_CAP`, every page still offering a cursor. Asserts a `ServingGapError` carrying `LIST_TOO_LARGE_ABSENCE` — a NAMED entry in the register a shell renders like every other absence, never a bare `Error` and never a silent truncation, because **returning the rows fetched so far would be the C2 defect one bound further out, at 2000 rows instead of 50 and harder to notice for being bigger.** Also asserts the loop stopped AT the cap (`urls.length === LIST_PAGE_CAP`), without which a cap of 1 would pass, and that the absence's `owner` names the cap as a *disclosed assumption* — no real project-size distribution has ever been measured on this product, so 40 pages × `DEFAULT_LIMIT` 50 is a guess with a stated basis, and the loud refusal is what makes it safe to be wrong about. **CARRIED AND UNVERIFIED, with a named owner (controller, 2026-09-06):** what the WEB SHELL renders when `getTickets` throws past the cap is not exercised anywhere — this case asserts the throw, not the page. *Owner: Task 13's E2E, or a web render test.* Naming it because a refusal nobody renders is a blank screen with a good conscience. (Mutation: remove the cap → **1 failed, 22 passed — this case alone.** Recorded honestly: it reddens as `expected MappingError … to be an instance of ServingGapError`, because the unbounded loop runs off the end of the fixture and 404s, rather than as a truncated-rows assertion. The property killed is the right one — the refusal never fires — but the MECHANISM is not the naive one, and a reader comparing the message to the case text would otherwise think the mutation missed.) — `packages/app-core/test/online/online-data-source.test.ts`
- 12.259 ✅ THE CONTROL for the two above: an ordinary ONE-PAGE project makes exactly one request and never pages. Without it, a source that always paged — or always made a speculative second call — would satisfy both cases above while paying a round trip on every list render. **The replica source needs no change and 12.257's describe block says so rather than leaving it inferred:** `replicaDataSource.getTickets` reads the local confirmed set directly and has always answered the whole project. Paging is a property of the HTTP route, not of the view type. — `packages/app-core/test/online/online-data-source.test.ts`
- 12.320 ✅ **THE EXACT-CAP BOUNDARY — a project of exactly `LIST_ROW_CAP` ASSEMBLES**, and refusal starts one page later. Found by the opus reviewer as a **surviving mutant**, which is the finding class this repo cares most about: moving the refusal to `page >= LIST_PAGE_CAP - 1`, thrown after the fetch and before the `nextCursor` check, left 12.257, 12.259 AND 12.258 all green — 12.258 asserts `urls.length` and the absences and still could not see it — while a legitimate largest-allowed project refused. **Nothing exercised `pages.length === LIST_PAGE_CAP`, so the cap was asserted on ONE SIDE only.** A cap is a claim about both sides of a line; this is the other side. (Mutation: the off-by-one above → **1 failed, 23 passed — 12.320 ALONE**, with 12.257/12.258/12.259 all still green, exactly as predicted.) — `packages/app-core/test/online/online-data-source.test.ts`
- 12.321 🚫 **REFETCH AMPLIFICATION is carried, not fixed here.** `getTickets` went from one request to N under `use-live-query.ts`, which reloads on every stream event on a 200 ms debounce with no cancellation (last-one-wins). Partially MITIGATED in this change set rather than ignored: the client now SENDS `limit=200` (the route's validated `MAX_LIMIT`), so a 2000-row project is **10 round trips instead of 40** — a four-fold cut, each request otherwise re-running the recursive `epicAncestors` CTE. What is NOT done is cancellation, or any measurement: whether a busy workspace's event rate actually outruns the walk is unmeasured, and the reviewer flagged its own "pile up" wording as the claim it was least sure of. *Owner: whoever measures walk duration against observed stream event rate — the fix is cancellation in `use-live-query.ts`, not in the loop.* Out of scope for C2, which was a correctness closure.
- 12.322 🚫 **THE CAP IS A CLIFF, and no user-side escape exists.** `ticket-list.tsx` hardcodes the filter as `{}`, so a user cannot narrow the query to get under the bound, and the project page routes `list.error` to `ShellRefusal` on the **List, Calendar and Timeline** arms — only Board survives on a separate read. So a project crossing the bound loses three of four tabs, with a message whose `owner` names a SOURCE change as the remedy. **Throwing remains right** (a truncated set is the C2 defect, and the reviewer agreed); what is missing is a graceful path — a filter affordance, or a degradation that is not a blank tab. 2000 tickets in one project is ordinary for a mature team, so this is a cliff a real customer reaches, not a hostile-input guard. *Owner: the list surface's product design.* Recorded rather than built: it is a product decision, not a closure.
- 12.323 ✅ **AN UNRECOGNISED LIST CURSOR NARROWS TO AN EMPTY PAGE; IT DOES NOT 404.** `pagingFetch` answered `{ok:false, status:404}` for any cursor it did not recognise (`online-data-source.test.ts:67`). No server can: `routes/list.ts:143` binds the cursor as a VALUE — `t.ticket_id > $n` — so an unknown, foreign, invisible or hostile cursor is a text comparison that NARROWS, and the route's own docblock (`list.ts:103-112`) records that the server's tests *"hand back all three (foreign, invisible, hostile) and pin that"*. **So both sides carried tests, they contradicted each other, and neither could see the other.** This is the SECOND invented rule found in `pagingFetch` — the first was the cursor implemented as a page index — and it is the case for the whole pass: **fixing one lie in a fixture does not convert the fixture into a witness, it only moves the lie.** An empty page has NO groups (`list.ts:205`), asserted as `groups` length 0 rather than off `groups[0]`. Non-vacuity first: the same route, same viewer, no cursor, must answer three cards. The fake's 404 arm is corrected in the same change set. (Mutation: the route treats the cursor as a KEY — `reply.status(404).send(READ_NOT_FOUND_BODY)` when a cursor matched nothing, which is EXACTLY what `pagingFetch` claimed → **1 failed, 3 passed**, 12.323 alone, `expected 404 to be 200`. **A first attempt threw inside `readList`, where no `reply` is in scope, and surfaced as a 500** — it reddened the right case, but the case's claim is *never a 404*, and a mutation that produces some other refusal does not falsify the rule the fixture invented. Re-run at the handler, where `reply` is in scope, so the mutant IS the invented rule.) — `apps/server/test/integration/fixture-witnesses.test.ts`
- 12.324 ✅ **THE SHIPPED `getTickets` LOOP, EXECUTED AGAINST THE SHIPPED ROUTE, RETURNS THE COMPLETE ROW SET.** 7.220 proved the route accepts a cursor and that `mapListPage` carries the value the route resolves, but the case drove the two requests itself. This runs the client's OWN loop over an `inject()`-backed `FetchLike`, so termination, accumulation and request shape are the shipped ones. **What it does NOT witness is asserted, not narrated:** `LIST_PAGE_SIZE` is 200 and the loop hard-codes `limit=200`, so a three-ticket world is answered in ONE page with `nextCursor: null` and the multi-page threading is never reached. Calling it *"walks to exhaustion"* would be the same defect this pass catches at 7.221 — a title claiming more than the body keeps — so the round-trip count is pinned (`calls` length 1, `limit=200` present, no `cursor=`), and the day someone seeds 201 tickets or drops the page size, that line goes red and says the case's reach changed. The multi-page half is 7.220's, at the route level. *Owner for closing the client-loop multi-page gap end to end: whoever can afford a 201-ticket fixture, or a seam that lets the page size be injected.* (Mutation: the route drops the last card of the page → **2 failed**, 12.324 on `expected … length of 3 but got 2` and 12.323 on its own non-vacuity precondition — the guard doing its job, recorded rather than hidden.) — `apps/server/test/integration/fixture-witnesses.test.ts`
- 12.325 ✅ **THE NOTIFICATIONS `nextCursor` IS THE LAST ID OF THE PAGE, NOT MERELY NON-NULL.** `packages/app-core/test/inbox/fake-gateway.ts:20` reimplements this route's paging rule and its own docblock admits it is *"MIRRORING the server's paging semantics"* and that *"the interface has no consumer in this package"*; lines 37-44 record a drift it has ALREADY had, on the empty-string cursor. `notifications.test.ts:97-110` drives the real route but asserts only that `nextCursor` is non-null, re-sends it, and gets a different row — ADVANCE and TERMINATION, never the VALUE. This pins the value at `limit=2`, where the last row differs from the first, using `.at(-1)`: at `limit=1` the two coincide and an assertion on `[0]` would be **accidentally correct** and would go silently wrong the day anyone raised the limit. **The honest limit, stated at the case:** `apps/server` has no dependency on `apps/web`, where the only real `NotificationsGateway` adapter lives, so the client CONSUMER cannot be executed here the way `getTickets` and the founding gateway are — this pins the PRODUCER's end, and the fake's rule is witnessed by copying a rule that is now pinned rather than by a round trip. **A witness that cannot reach its consumer says so instead of implying it did.** (Mutation: `store.ts:96` emits the FIRST row of the page instead of the last → 12.325 **RED alone** (1 failed, 3 passed) while `notifications.test.ts` stays **10 passed, 0 failed** — the existing suite cannot see a broken keyset cursor and this case can, which is the measurement this whole pass exists to produce.) — `apps/server/test/integration/fixture-witnesses.test.ts`
- 12.326 ❌ **THE DUAL-CLIENT RIG RESTATES THE BOOTSTRAP ROUTE'S ENVELOPE, and `snapshot.provenance` is absent from its payload.** Four `sync-client` fixtures (`replica-data-source.test.ts:56`, `recorded-hazards.test.ts:141`, `outbox.test.ts:26`, `precheck.test.ts:24`) rest on `apps/server/test/dual-client/rig.ts:366`, while `rig.ts:219`/`:249` are themselves a restatement of `sync-routes.ts` — two restatements by the same authors, which is not a witness. Ruling: **VALUES WITNESSED / ENVELOPE MIRROR** — every value comes from real server modules over real Postgres and a required-key rename breaks at compile time, but the SERIALISATION is restated, and the one field that escaped the compile-time chain (`snapshot.provenance`, optional on the wire by P36's additive rule) is exactly the one that diverged. **The principle, recorded because it generalises: a compile-time chain witnesses REQUIRED keys only; every OPTIONAL wire field in a restated envelope is an unwitnessed row until a round trip carries it.** Owner: Lane F item 6 — the rig calling the real route through `inject()`.
- 12.327 ✅ **THE `invalid` CODE THE `sync-client` FIXTURES CARRY IS NO LONGER A LITERAL — IT COMES FROM THE REAL PARSER.** Was ❌. `sync-engine.test.ts` pinned `code: 'bad-envelope'`, a code no server emits: the real union is `SyncInvalidCode = IngestErrorCode | 'actor-mismatch' | 'reserved-type'` (`sync-service.ts:29`) over `IngestErrorCode = EnvelopeErrorCode | 'duplicate-event-id'` (`ingest-result.ts:3`), and the envelope arm is `malformed-envelope` (`parse-event.ts:7`). **Nothing could see the invention**: `SyncEventResult.code` is deliberately `string` on the client side, so no type refused it and no assertion read it. *(The ❌ text located the fixture at `:547`; it is at `:625` on the tree that fixed it and moved again inside the fix. The FILE is the durable half of that reference — `outbox.ts` had already recorded the same line drifting twice.)* **Replacing one literal with a better literal would fix today and drift again, so there is no literal:** the fixture reads `parseEvent`'s own answer for a malformed envelope — `@gisik-nokma/domain`'s function, the SAME one the server's ingest door calls — behind a non-vacuity guard that throws if `parseEvent` ever starts ACCEPTING that input, which would otherwise put `undefined` into the fixture silently. The constant is deliberately un-annotated so it infers `EnvelopeErrorCode` rather than widening back to `string`. **What this does NOT witness is that the SERVER SENDS the code** — agreeing with a shared pure function is not agreeing with a running door — and that half is 12.362. **A standing measurement in `outbox.ts` was repriced in the same change set**, because it quoted this fixture's spelling as the cost of moving `SyncEventResult` into `domain`: the cost was *one fixture edit*, and it is now zero. Measured, with its control: the narrowing compiles (`tsc` exit 0) and the same narrowing with `'bad-envelope'` put back exits 1 with `TS2322`. *A cost quoted for a fixture is a fact about that fixture's spelling and expires when someone spells it better.*
- 12.362 ✅ **THE SYNC DOOR'S ENVELOPE REFUSAL, AS A VALUE ON THE WIRE.** `POST /v1/sync` through `inject()` with a non-ULID `actorId` answers `{status:'invalid', eventId: <the claimed id>, code:'malformed-envelope'}` and appends nothing to the ledger. 12.109 already pinned `unknown-event-type` and 12.107 `actor-mismatch`, so two of the door's `invalid` codes were values here; **`malformed-envelope` appeared in this suite only in prose** — and it is the one a client fixture had drifted from for the whole life of 12.327. The malformation is chosen so `submittedEventSchema` refuses BEFORE the session's actor comparison, and `.not.toBe('actor-mismatch')` says so rather than leaving the ordering to the reader; `eventId` is asserted non-null because `extractClaimedId` reads the id off an envelope it could not otherwise parse, which is what lets a client match a verdict to the claim it sent. *Mutation: change all five `'malformed-envelope'` sites in `packages/domain/src/parse-event.ts` → **red here, and the sibling count is MEASURED and reported rather than bought off by loosening the assertion**. Within `sync-route.test.ts` it is 12.362 ALONE (1 failed / 15 passed). Across every test file that mentions the code at all (enumerated by grep, with `unknown-event-type` as the positive control that the shape finds widely-asserted codes): `packages/domain` **6 failed / 28 passed** across `parse-event.test.ts` and `events/invites.test.ts` — the package that OWNS the string; the other four server files **0 failed / 40 passed**, their mentions being prose. Seven reddened tests in total, six of them in the string's own package, which is the right shape: this case constrains the DOOR'S ANSWER, not the string's uniqueness. **`sync-client` also stays green (29/29), and that is the point of 12.327 rather than a gap** — its fixture now READS the parser, so it follows a rename instead of drifting from it.* (`apps/server/test/sync/sync-route.test.ts`)
- 12.328 ✅ **THE TEXT `ping`/`pong` PROTOCOL NOTHING IMPLEMENTS IS DELETED FROM ALL FOUR PRODUCTION SITES.** Was ❌. The client declared `PingFrame` (`app-core/src/online/stream.ts:35`), parsed it (`:93`) and replied `{type:'pong'}` (`:283`), and `sync-client/src/net/http-transport.ts:202` did the same. **The server sends no such frame:** `stream/routes.ts:319` calls `socket.ping()`, a WebSocket PROTOCOL control frame that `ws` answers automatically and routes to a dedicated `socket.on('pong')` listener (`:290`), never to `message`; and `:342` accepts only `subscribeFrameSchema`, answering `bad-message` to anything else. **Ruled 13:44: no runtime measurement is owed — the sites are deletable on SOURCE evidence**, because a runtime run through a `ws` client would measure a configuration nothing ships. The three grep shapes were **re-run at the deleting commit rather than adopted from the finding**: (a) `webSocketFactory` is injected by three TEST files only (`sync-engine.test.ts`, `online-data-source.test.ts`, `stream.test.ts`); the production hits are the two default-application lines plus one PASS-THROUGH at `online-data-source.ts:403`, which forwards a caller's option and injects nothing — that reading is the load-bearing half of the claim; (b) **only `apps/server` depends on `ws`**, enumerated package.json by package.json with each package's name printed beside its answer, so a silent-empty sweep would have been visible as a short list rather than as a clean zero; (c) the four sites and two agreeing test arms, with `type:'subscribe'` at `stream.ts` and `http-transport.ts` as the same-run positive control that the shape fires. **What replaced the two test arms are EXCLUDING fixtures, not deletions** → **12.360** (app-core: a text ping is neither answered nor delivered) and the second clause of **12.167** (sync-client: the sent list is exactly `['subscribe']`). Restoring either arm reddens its own case alone. *The residual — never inject a raw `ws` socket into `webSocketFactory` — is a DOCBLOCK at both default-application lines and therefore not a check: see 12.361, which says so under its own marker rather than letting this ✅ carry it.*
- 12.360 ✅ **A TEXT `ping` REACHING `createStreamSubscriber` IS NEITHER ANSWERED NOR DELIVERED.** The excluding fixture for 12.328's app-core half, replacing the deleted `answers ping with pong without delivering it` — a test that agreed with a protocol nothing implements. It asserts the sent list EXACTLY (`['{"type":"subscribe",…}']`) rather than `not.toContain('pong')`, because a negative containment also passes on a subscriber that sent nothing at all, including one that never opened; the `subscribe` frame is the assertion's own positive control that sends are observable on this fake. *Mutation: restore the `pong` arm in `stream.ts`'s `onmessage` → red here alone.* (`packages/app-core/test/online/stream.test.ts`)
- 12.361 🚫 **THE OWNER RULE AT BOTH `webSocketFactory` DEFAULTS IS A DOCBLOCK, NOT A CHECK — out of scope by construction, and recorded rather than implied.** 12.328's deletion rests on the PLATFORM `WebSocket` never surfacing a protocol ping to JavaScript. `webSocketFactory` is an INJECTED seam, so that is a property of what gets injected, not of either module: Node's `ws` does surface protocol pings to a listener, and a shell that injected one and answered with a text `pong` would earn `bad-message` from `stream/routes.ts:342` — a live defect in a configuration nothing ships. **No test can hold this**, because the failing case requires a dependency no client package has and a construction no production site performs; a test that injected `ws` itself would assert about a shell this repo does not build. So the rule lives as prose at `stream.ts`'s and `http-transport.ts`'s default-application lines, citing 12.328, and this line exists so that "12.328 ✅" is never read as covering it. *Owner if a client shell ever adopts `ws`: whoever adds that dependency — the grep in 12.328(b) is the tripwire, and it is a human one.*

## Closure 5b — ruling P37.1's real fix: the grant side becomes PULL-shaped (cases 12.292–12.308)

**Closure 5 pushed the history and that WEDGED.** Every backfilled envelope sat at or below the
client's cursor, so none of them advanced it, and the only one that did — the trigger — was yielded
last; a slow-consumer close mid-burst left the client reconnecting into the identical burst for ever
(case 12.290). The one-line repair of yielding the trigger first is unsafe and the code says so.
So the direction inverted into the narrow half's own shape: **the server names ids, the client pulls
what it lacks.** `grantBackfillFor` became `grantNoticeFor`, a `reach-granted` frame joined the wire,
and `GET /v1/sync/bootstrap/ticket` is the door the client pulls through.

*Every case below carries a positive control from the same run, because most of them assert an
absence and this branch has already shipped one control that could not fail (12.277's, recorded above).*

### The client's per-ticket door and its durable pending set — `packages/sync-client/test/ticket-bootstrap.test.ts`

- 12.292 ✅ **`loadTicketBootstrap` applies a ticket the device did not hold, snapshot-less, so it becomes readable.** Its positive control is the TITLE, which comes only from `ticket.created`'s payload — so "the ticket is there" cannot be satisfied by a row some other door wrote.
- 12.293 ✅ **It does NOT move the workspace cursor, though the events it applies sit far above it.** `loadBootstrap` writes `cursor:<workspaceId>` to the server's head unconditionally; a device at cursor 40 pulling from a server at 900 would skip everything between for every OTHER ticket, silently and permanently, and look exactly like convergence in a quiet fixture. **So this fixture is deliberately not quiet** — the pulled ticket's own events are at `workspaceSeq` 900/901, giving the plausible wrong implementation ("advance to the highest seq I just applied") something to advance to. Paired with a readability assertion so "the cursor did not move" cannot be satisfied by a door that did nothing.
- 12.294 ✅ **A pull that cannot fold rolls back ITSELF and leaves the session intact.** `loadBootstrap` wraps every ticket in one transaction — correct there, because a partial cut is not a cut. Here the opposite is correct: wedging a pull the way the burst wedged the stream is the failure closure 5b exists to remove. Asserts the failed ticket left NOTHING (no row, no events) and that an earlier ticket and the cursor both stand.
- 12.295 ✅ **The pending-pull set survives a process restart**, measured by reopening a REAL FILE with a fresh replica rather than by arguing from a shared in-memory handle.
- 12.296 ✅ **A re-recorded id does not duplicate, and an unknown workspace owes nothing** — the set is workspace-scoped exactly as `cursor:` is.
- 12.297 ✅ **A workspace-wide revocation forgets what the device was owed; a project-scoped one does not.** Left behind, the ids would have a removed device asking for tickets in a workspace it is not in, on every catch-up, answered 403 each time. The project-scoped half is the control proving this is about the workspace arm and not about revocation generally.
- 12.298 ✅ **A ticket on a workflow the device has NEVER SEEN folds with its definition shipped beside it and throws without it**, with the exact refusal text asserted (`vanished — replay integrity is broken`) rather than "some error". **This case's first draft was WRONG and the correction is the interesting half:** a device on v1 pulling a ticket whose snapshot names v2 does *not* throw — `foldSnapshotForward` finds no latest, returns the state untouched, and the tail folds against v1 perfectly happily, leaving a state that records v2 and was folded under v1's rules. *That silent version-down fold is reachable through `loadBootstrap` too, is a property of `foldSnapshotForward`'s `latest === undefined` guard rather than of this door, and is RECORDED, not fixed. Owner: unassigned.*
- 12.302 ✅ **A pulled ticket keeps the provenance closure 4 ships it.** Found by rebasing rather than by reading: the argument is optional and defaults to null, so the omission compiled and every other case stayed green. It is the worst place to drop it — a ticket arriving through this door is by definition one the device never held, so it is snapshot-bounded on arrival by construction, which is exactly the refusal ruling P36 exists to have closed. The block is passed THROUGH, never constructed: an absent block means "nothing new to say", so a door supplying its own helpful `null` would erase a good one on a re-pull.

### The route — `apps/server/test/sync/ticket-bootstrap-route.test.ts`

- 12.299 ✅ **`GET /v1/sync/bootstrap/ticket` serves one ticket the caller may see: a real tail, the definitions, and NO stream cursor.** The key set is asserted EXACTLY rather than `streamSeq` being `undefined` — the latter would also pass on a response that grew some other cursor-shaped field under a different name.
- 12.300 ✅ **A ticket the caller may not see and a ticket that never existed answer IDENTICALLY**, byte for byte, not merely "both 4xx". A fetch-one-thing route naturally wants to say "no such thing", and that split is the existence oracle `reconcile-route.ts` refuses in its own words and `can-see.ts` refuses one layer down. A successful pull sits in the same case so the 404s are about those ids rather than about the caller.
- 12.301 ✅ **A stranger is refused for being a stranger, before any ticket is consulted** — asserted with the SAME id the member just pulled, and with a phantom too, so the 403/404 split cannot itself become the probe.
- 12.303 ✅ **Only the asked-for ticket travels.** The hidden ticket is in the same workspace and project, so a handler reaching for `listVisibleTickets` — the workspace route's own helper, one import away — would have every opportunity to include it, and for an owner it *would* be visible, so the mistake would not even look like a leak in a single-user fixture.

### The narrow half's guest side — `apps/server/test/sync/reconcile-route.test.ts`

- 12.304 ✅ **The reconcile door answers a GUEST correctly, which is case 6.102 and closes it.** 6.102 was never a missing rule: `reconcileHeldIds` asks `canSee` and nothing else, and `canSee` resolves a guest through the explicit share list exactly as it resolves a member through a project. Nothing about the door was role-aware — what was missing was the measurement, which is what 6.102's own text says. **An APPLICATION of the shipped rule, so no escalation under P25.** Both ids in ONE request with an exact `toEqual`: a guest presenting only the lost id could be answered "restricted" by a door that restricted everything a guest named, which is the shape that wipes a guest's whole device. Two controls in the same run — the MEMBER's answer restricts both, proving the guest's asymmetric answer is about the explicit list rather than about leniency; and the status is asserted not to be 403, or the case would also pass against a door that refused guests outright, failing for the wrong reason.

### The hub's own arm — `apps/server/test/stream/hub.test.ts`

- 12.314 ✅ **The notice is framed with the HUB's `workspaceId`, and the subscription runs on behind it.** Two properties in one case because one fixture measures both. **The workspace-id half was UNFALSIFIABLE until the fixture changed**: in production `sub.workspaceId` and `item.workspaceId` coincide, which is exactly why the wrong one would ship green — so the scripted seam gained a `claimsWorkspaceId`, letting the routing key and the claimed key differ, and the case asserts the frame carries the ROUTING one. The liveness half exists because this arm sits directly beside `scope-revoked`, which detaches and returns; before closure 5b the code was an `if/else` reading *"purge, otherwise scope-revoked"*, so a new instruction WOULD have been handled as a revocation — which empties the replica — and an accident of field names is all that caught it. Its control is the identical fixture with a `scope-revoked` in the notice's slot, which DOES stop the stream, so the liveness assertions are known to be able to see a detach at that exact position.
- 12.315 ✅ **A drain ending on a notice resumes exactly where it would without one.** The property the whole pull-shaped design rests on: a notice must be RE-DELIVERED if the socket dies before the client finishes pulling, and only its trigger — which IS above the cursor — regenerates it. Measured differentially against the same script with the notice removed, so any cursor value the arm might write shows up as a divergence between two runs rather than as disagreement with a number this file chose. **The fixture puts the notice LAST in the drain deliberately, which is not the production order**: a `sub.cursor += 1` mutant is MASKED in the production shape, because the trigger behind it re-advances past the drift. That asymmetry is why the fixture is shaped this way and is written into the case.

**Mutations run against the hub arm — measured, and the two "alone" results are the point.**

| mutation | result |
|---|---|
| delete the `send` | 12.314 + 12.315 |
| `sub.workspaceId` → `item.workspaceId` | **12.314 ALONE**, `1 failed \| 18 passed` |
| the arm `detach`es like `scope-revoked` | 12.314 + 12.315 |
| the arm advances `sub.cursor` | **12.315 ALONE**, `1 failed \| 18 passed` — and 12.314 survives it, exactly as the case's own masking analysis predicts |

*Baseline `19 passed (19)` before and after every restore. One label in the sweep script was wrong and the run corrected it: it expected one `detach(sub);` in `hub.ts` and there are two, so the injected third read as "3" and the restore as "2" — the restore is verified by the baseline going green again, not by that count.*

### 12.316 — closure 5c's first form could not work, DERIVED (and the measurement that said so was contaminated)

- 12.316 ✅ **A device on a live socket, narrowed then re-widened with no reconnect and no manual reconcile, converges.** Closed by ruling **P37.2**: the notice carries each named ticket's `headSeq` and the client pulls iff its own local maximum for that ticket is lower.
  **Why the FIRST attempt (reconcile the notice's named ids) could not work — and this is a DERIVATION, not a measurement.** `grant-backfill.ts:301` admits a candidate to the notice only `if (canSee(...))` is TRUE. `reconcile-route.ts:140` marks an id restricted only `if (!canSee(...))`. Same function, same db, same user, same instant — complementary predicates over one primitive, so **the intersection is empty by construction**: a notice cannot name an id reconcile will say anything about. The stale copy is stale in its CONTENT and `canSee` answers about its AUDIENCE, so reconcile was the wrong instrument rather than a mistimed one.
  **⚠️ THE RUN THAT FIRST REPORTED THIS WAS CONTAMINATED, and the record says so rather than quietly resting on the proof.** A subagent was mutation-testing `sync-engine.ts` in the same worktree; commit `75657f2` swept its MUTANT-4 in (blob check: `9135059` 0 occurrences, `75657f2` 1, `1533e00` 1), so the dual-client run behind `1533e00` executed with `reconcileNamed` NEVER CALLED. `b.pulls` was empty because the reconcile was disabled, not because it was useless. The subagent found this and reported it unprompted. **The conclusion survives on the derivation above and on nothing else**, and it cannot now be re-measured because P37.2(c) deleted the function — which is the right outcome and is why this stays a proof.
  *The transferable lesson, because the obvious fix was already in place and did not help:* this lane had already replaced `git add -A` with explicit-path staging after an earlier incident. It staged `sync-engine.ts` by name, legitimately, for a docblock fix — and that made no difference, because the contamination was in a file it had every reason to stage. **The rule is not about the staging verb: do not commit a shared source file while another party is mutating it.** Mutations now run in a quiet window with nothing else touching the tree.

### The Critical's own fixtures — `packages/sync-client/test/sync-engine.test.ts`

*Bootstrap-before-apply was a CLAIM in `grant-backfill.ts` and not a rule; the branch review found it. These five measure the rule that replaced it.*

- 12.309 ✅ **A failed pull followed by the ticket's own folded TRIGGER converges instead of stalling.** The Critical's sequence (a): the pull fails, the id stays owed, and the `ticket.transitioned` for that same ticket arrives one link later — `applyServerItem` throws *never created*, which used to reach the one-way `stall()` latch. Asserts `lastApplyFailure()` null, the chain still alive, the exact pull list across both attempts, and — after the network returns — that the ticket reaches the state the ROLLED-BACK trigger described, delivered by the pull payload rather than by the streamed event. `reconcileCalls` empty, which also pins P37.2(c)'s deletion.
- 12.310 ✅ **A fold failure on a ticket the device DOES hold still stalls, loudly.** The case that stops the swallow becoming a blanket: a held ticket transitioned into a state its workflow lacks stalls with the message naming the state, the cursor frozen and a later item NOT applied. Second half, fresh fixture: a malformed non-ticket definition stalls too, with a well-formed one as the in-run control. *`recoverByPull`'s INSTRUCTION refusal is honestly unmeasured — every statement in the two instruction arms is a DELETE, and nothing makes one throw without stubbing the replica, which would measure the stub. Disclosed at the case rather than faked.*
- 12.311 ✅ **A definition arriving in a PULL payload folds the tickets already held, and the stream's later copy of it is inert.** The gap: `loadTicketBootstrap` stored definitions without `foldTicketsOntoVersion`, and `applyServerItem`'s duplicate-event-id early return then made the stream's copy a permanent no-op — so a client that pulled across a publish kept stale categories until the NEXT publish. A v3 over the same door is the control proving the door still works.
- 12.312 ✅ **A notice naming a ticket the device holds STALE pulls it, and the missing tail lands.** The case ruling P37.2 exists for: `headSeq` above the local head is what makes the staleness visible, where "do I hold it" could not. An unnamed sibling is the exactness control.
- 12.313 ✅ **A current ticket costs no pull; a behind one in the same notice is fetched.** One notice carrying both, so the boundary (`headSeq` EQUAL to the local head) and the miss are measured against each other in one run. This is the amplifier bound at the id level, and its mutation — flipping the comparison to always-pull — reddens exactly the two cases carrying an equal-boundary id.

**Mutations for this set were measured at the PRE-P37.2 tree and are labelled so wherever they appear**, because the wire shape changed under them mid-task: `recoverByPull` → always false reddens **12.309 alone**; → always true reddens four (12.163, 12.164, 12.309, 12.310); dropping its holdings check reddens three; dropping its ticket-kind check reddens **12.310 alone**; dropping `foldTicketsOntoVersion` reddens **12.311 alone**. *Two further mutations on the `headSeq` comparison were derived and handed over rather than run, for the reason recorded at 12.316: mutations no longer run while another party may commit.*

**⚠️ THE CRITICAL'S FIX CHANGED TWO EXISTING CASES, and they were re-witnessed rather than deleted.** 12.163 and 12.164 drove their stall with an event for a ticket the device does NOT hold — exactly what `recoverByPull` now swallows — so they were red on arrival (`2 failed | 20 passed`). Proof rather than reasoning: the always-false mutation on the un-repaired file left both GREEN and reddened 12.309, which is the two behaviours separating. They now witness the same property against a HELD ticket, and the retired witness is recorded in 12.163's docblock.

### Ruling P37.3 (2026-09-06) — the 404 drop, keyed to the notice that issued the pull

The Critical's fix turned the revoked-project sequence from a loud stall into a **quiet permanent leak**: a
pull that 404s and an id owed on every catch-up, for ever. The bound could not be keyed to the status code,
because `bootstrapTicket` answers *"you may not see it"* and *"it never existed"* with the **same 404** —
deliberately, so presence-versus-absence is not an oracle — so the device cannot tell a phantom from a race
in which visibility narrowed again between the notice and the pull. It is keyed to the **notice** instead:
each pending entry carries the `workspaceSeq` of the notice that named it, and a 404 drops the entry only if
that seq is still the one the pull was issued for. **A 404 is never the last word; the next notice is.**

- 12.317 ✅ **One 404 forgets the owed id for good, while a wobbling id beside it is retried on every catch-up.** The revoked-project sequence. Two ids ride the same notice, the same drain and the same catch-ups, failing in the two different ways the arm distinguishes — `TicketPullNotFound` and an ordinary transport error — so the assertion is a **contrast measured in one run** rather than an absence measured against nothing: a drain that stopped running shows the wobbling id missing too and fails loudly instead of passing. **TWO later catch-ups, not one**, because "no request on ANY later catch-up" is a claim about the steady state and one catch-up cannot distinguish it from one-shot suppression.
- 12.318 ✅ **A notice arriving during the pull keeps the id owed through its 404, and the next catch-up fetches it.** The race the ruling refused to lose: an unconditional drop discards a re-widening that landed a millisecond early, silently, with no error and nothing to retry. `headSeq: 9` is asserted rather than presence — the number is what says the racing notice REPLACED the recorded seq and that the guard compared against the new value, which is the whole mechanism in one integer.

**⚠️ The race in 12.318 is NOT reachable through the socket today, and the case says so.** `applyChain` is
strictly serial and every `drainPendingPulls` call site is on it, so a socket-delivered notice queues
*behind* the link holding the in-flight pull; `withTimeout`'s abandonment cannot deliver a late 404 to the
`catch` either, because `Promise.race` has already settled. **Through the socket path alone the keyed drop
and an unconditional drop are behaviourally identical** — the second notice has not written at drop time and
re-adds the id afterwards either way — so a fixture driven purely through `onItem` would let the
unconditional mutant survive and report a green case for a guard that does nothing. 12.318 therefore applies
the racing notice through `replica.applyServerItem` from inside `pullImpl`: off-chain, as the public-API
writer `replica.ts`'s own docblock names (*"the set is public API and a shell may add to it too"*), and
through the real `reach-granted` filter rather than around it. The keying becomes socket-load-bearing the
moment the drain runs off the apply chain. *Derived before the cases were written, not discovered after.*

**The pair discriminates, which is why there are two of them.** Neither means anything alone: 12.317 says the
drop HAPPENS, 12.318 says it is not UNCONDITIONAL. 12.318 deliberately does **not** re-assert 12.317's
property — that omission is the design, because a case that reddened under both mutations would be measuring
12.317 twice and its racing write would be doing no work.

**Recorded with an owner, not fixed (outside these fixtures' scope):** a pull abandoned by `withTimeout` that
later rejects with `TicketPullNotFound` produces an **unhandled rejection** nobody catches — `Promise.race`
has settled, and `net/http-transport.ts` calls bare `fetch` with no `AbortSignal`. Owner: Plan 6 / sync-client.

**Mutations run for P37.3 — measured 2026-09-06 12:49 IST at `bc45bba`, in ONE locked quiet window (lock
free on entry, zero live vitest pools, nothing else touching the tree).** The denominator is the WHOLE
`sync-client` package, 8 files / 87 tests, so "alone" is a claim about the package and not about one file.
Baseline `87 passed (87)` **before and after** every mutation; each restore left `dirty-src-files=0`; each
edit was confirmed PRESENT by grep before its run, because a mutation that fails nothing is an
unconstrained path only if it actually fired.

| mutation | site | predicted | MEASURED |
|---|---|---|---|
| **never drop** — the `TicketPullNotFound` arm's drop deleted | `sync-engine.ts` | 12.317 alone | **12.317 ALONE**, `1 failed \| 86 passed` |
| **always drop** — the `headSeq` guard deleted, drop unconditional | `replica.ts` | 12.318 alone | **12.318 ALONE**, `1 failed \| 86 passed` |
| **never below** — `localHeadSeq(...) < headSeq` neutered to `false` | `replica.ts` | **7 at derivation, 9 at this tree** | **9**: 12.305, 12.306, 12.308, 12.309, 12.311, 12.312, 12.313, **12.317, 12.318** — and **12.310 SURVIVES**, as predicted |
| **always pull** — the off-by-one, `<` becomes `<=` | `replica.ts` | 12.305 + 12.313 | **12.305 + 12.313**, `2 failed \| 85 passed` |

**The pair discriminates, which is the result worth having:** never-drop reddens 12.317 and 12.318 passes;
always-drop reddens 12.318 and 12.317 passes. Each fixture kills its own mutant and is blind to the other's,
so neither is measuring the other twice.

*The two `headSeq` mutations were derived by a previous session and handed over unrun, and their prediction
of **7** was made BEFORE 12.317/12.318 existed. Both new fixtures route their initial entry through that same
comparison, so the honest prediction at this tree is **9** — reported here as three numbers
(predicted-at-derivation, predicted-at-this-tree, measured) rather than one, because otherwise a correct
measurement reads as a finding. The `<=` prediction is unchanged at either tree: an unheld id satisfies
`0 < h` and `0 <= h` alike, so neither new case can see that mutant.*

## A REAL socket, really cut (Lane D, block 12.340–12.359) — `apps/server/test/dual-client/socket-cut.test.ts`

**These four discharge case 12.290's flip condition.** Ruling P37.1 asked for *"a slow-consumer close
MID-PULL followed by convergence on reconnect"*, and 12.290 stood 🟡 for the whole of that ruling's life
on one stated blocker: *nothing on this branch can cut a socket.* The dual-client rig has none by
construction (`rig.ts`'s `openStream` throws on purpose, so a scenario cannot believe a subscription
exists) and the engine's own tests drive a fake transport with no buffer bound at all.

**What is real here, enumerated rather than claimed.** A real `buildApp` on a real `listen()` — so a real
HTTP **upgrade** happens, which is the one request `app.inject` cannot make and therefore the reason no
existing test could have reached this; real Postgres and real projections; the real `visibleEventsFor`;
the real `createStreamHub` and `registerStreamRoute`, **both completely unmodified and driven only from
outside**; real better-auth sign-in for two people, with a real bearer token on the HTTP calls *and* on
the WebSocket handshake headers; and the real, unmodified `@gisik-nokma/sync-client` engine, replica,
outbox and HTTP transport. Only the transport's two DECLARED seams are supplied — `fetchImpl`, to inject
one transient wobble on one ticket, and `webSocketFactory`, to send the bearer header the default
`new WebSocket(url)` cannot and to record close codes.

**How the cut is a real 1013.** `bufferedAmount` is a PROTOTYPE accessor on `ws`'s `WebSocket`, so an own
property of that name on ONE live instance shadows it for that instance and for nothing else — no
prototype is touched, no other connection is affected, and the hub is told nothing. The bound it trips is
the shipped `DEFAULT_MAX_BUFFERED_BYTES` (1 MB), which `buildApp` does not even expose, rather than a
shrunken test value. The next ordinary commit makes `hub.ts`'s `send` close that peer for real.
**Measured on the client's own `ws` instance, not assumed:** `1013 / 'slow-consumer'`, twice — and it has
to be read there, because `http-transport.ts` sets `socket.onclose = () => handlers.onClose()` and throws
the event away, so the code the server sent is visible nowhere else on the client. The whole status
sequence is asserted by equality: `connecting, catching-up, live` three times over, which is the evidence
the two reconnects really ran instead of the fixture timing out into a pass.

- 12.340 ✅ **A slow-consumer close lands MID-PULL and the REGENERATED NOTICE repairs it.** "Mid-pull"
  is a fact, not a label: the transport holds one child's `GET /v1/sync/bootstrap/ticket` open until the
  case releases it, so the engine's apply chain is demonstrably parked inside `applyOne` — asserted off
  the REPLICA (the parent already pulled and cleared, the faulted child in flight, the second child still
  owed) rather than off the engine's item listener, which does not fire until `applyOne` finishes and is
  therefore exactly what the held pull is stopping. The cursor is asserted UNCHANGED across the cut,
  which is the property the whole chain rests on. The engine then reconnects on its own real timer at
  that unchanged cursor, `visible-events-for.ts` re-scans the trigger, and **the notice comes back** —
  its `backfilled` set is scoped per drain and a notice moves no cursor, deliberately, *"because the
  notice must be RE-DELIVERED if the socket dies before the client finishes pulling"*. That sentence was
  the argued half of 12.290; this is it measured.
- 12.341 ✅ **A SECOND cut, with the cursor past the trigger, and `onCaughtUp`'s drain is the only
  path left — convergence still happens.** *Two cuts rather than one is a finding, not a preference:*
  while the notice is regenerated, `onCaughtUp`'s retry is unreachable, so a one-cut fixture cannot see
  it and deleting that line changes nothing. Taken after the cursor has passed the trigger, no notice can
  be regenerated, and the pull that failed under the first cut lands on the pre-cursor drain of the third
  subscription's catch-up. **The notice COUNT is pinned across the second cut**, so this convergence
  cannot be the regeneration 12.340 already measured. Convergence is against SERVER TRUTH
  (`getTicketStateFromDb`) for all three tickets plus both commits that tripped the bound — the
  comparator `grant-backfill.test.ts` already uses for *server ≡ replica*.
- 12.342 ✅ **THE CONTROL: no cut, no injected failure — one pull per ticket, one socket, zero
  closes.** A permanent case rather than a step of the mutation sweep, so *"control green, headline red"*
  is one run's evidence instead of two runs a reader has to trust were the same harness. It is also the
  positive control on the close-recording apparatus itself: the headline's two 1013s are a mechanism
  firing, not a socket this harness drops on its own. **And it MEASURES the property that makes the
  second cut necessary** — the widening commits, the pull it causes completes, and the cursor does not
  move, because `hub.ts` gates `caught-up` on `caughtUpSent` and so sends exactly one per SUBSCRIPTION.
- 12.343 ✅ **Per-ticket persistence, measured where batching would differ.** `drainPendingPulls`
  clears each id INSIDE the loop, right after that ticket's own pull lands; a loop running to its natural
  end reaches an identical final state either way, so the difference is observable only when the loop is
  genuinely interrupted part-way. `stop()` during an in-flight pull is that interruption — the flag is
  re-read at the TOP of the next iteration, so the in-flight pull still completes and persists while the
  two behind it are never reached. Asserts the pending set immediately afterwards holds exactly the two
  that were never reached, then restarts the engine on the same durable replica and asserts the
  discriminator: **the ticket that already landed is fetched exactly ONCE across the whole run**, and only
  what was still owed is re-fetched.

### Mutations run for the socket-cut fixture — denominator 3 cases in this one file

*Run under ONE gate-lock acquisition. `apps/server` resolves `@gisik-nokma/sync-client` through the
package's `exports` to `dist/`, so each mutation was applied to the source, the package REBUILT, and the
mutant's presence in `dist` proved before the run — a green under an unbuilt mutation would be
indistinguishable from a mutation that never fired. Restored with `git checkout HEAD --` after each, with
`git diff` clean AND the restored lines read back.*

| mutation | predicted | measured |
|---|---|---|
| *(none — the unmutated baseline)* | `3 passed (3)` | **`3 passed (3)`.** Dist control: `drainPendingPulls(ws)` appears **2×** (its declaration and `onCaughtUp`'s call). |
| **(a)** delete `onCaughtUp`'s `await drainPendingPulls(ws)` | 12.340+12.341 RED; 12.342 and 12.343 green | **`1 failed \| 2 passed (3)` — exactly as predicted.** Dist proof: the occurrence count fell 2 → 1. The failure is 12.341's convergence, with its own message: *"C1 never converged (last status: live, attempts: 2)"* — two network attempts, the mid-pull one and the regenerated notice's, and never the third that `onCaughtUp` would have made. **12.342 (the control) stayed green**, so the redness is the mechanism and not the harness. |
| **(b)** defer per-ticket `clearPendingPull` to one batch pass after the loop (NOT in a `finally`, or the early `return` would still clear) | 12.343 RED on the pull count; the others green | **`2 failed \| 1 passed (3)` — it bit HARDER than predicted, and the extra kill is the honest part.** 12.343 red as predicted, and 12.340 red too: both fail at their *pending-set* assertion rather than at the pull COUNT, because with the clear deferred the parent is still owed at the moment each is read (three ids where two were expected). That is a more direct measurement of per-ticket persistence than the count is, and it means the property has two independent witnesses rather than one. **12.342 stayed green.** |
| **(c)** the control — the whole fixture with the cut and the injected failure removed | must stay green | **Green in all three blocks above.** It is case 12.342, permanently in the file, so this is a reading taken in the same run as each mutation rather than a separate run. |

*Not claimed: that these four kill anything in `hub.ts` or `routes.ts`. Neither file was touched, and no
mutation of either was run — this fixture's subject is the CLIENT's convergence across a real close, and
the hub's own bound already has its unit coverage in `test/stream/hub.test.ts`. Owner of a hub-side
mutation sweep through this door: unassigned.*
