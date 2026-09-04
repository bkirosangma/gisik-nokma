# 12. Offline sync & the apps — test cases

Mirrors `Features.md` §12. Status: `❌` not covered · `✅` covered · `🟡` partial · `🧪` manual · `🚫` out of scope (with reason).

**Numbering, and why this file does not start at 12.1.** `Features.md` §12 and this bucket belong to
Plan 10 by the coordination doc's reservation table (§3→Plan 1 … §6→Plan 4, then §7+ one per plan in
order). **Plan 10's own Task 18 pins cases 12.1–12.44 and states "this plan claims §12 and cases 12.x
only".** That task has not run, so those ids are RESERVED and are not claimed here; this file continues
from **12.45**, following the precedent `09-editor-attachments.md` set when Plan 7 Task 16's 9.1–9.34
were reserved the same way. **Never renumber; when Task 18 lands, its 12.1–12.44 fill in above these.**

**HIGHEST ID IN USE HERE IS `12.186`. THE NEXT FREE ID IS `12.187`.** *(Recount it from the case lines before trusting it — this very line said `12.81` for the few minutes between being written and three carried gaps being appended below it, said `12.93` for the time between that and Task 6's four bootstrap cases landing, said `12.97` for the time between that and a fix round hardening 12.94/12.96 and adding 12.98–12.99, said `12.99` until Task 7's fourteen `POST /v1/sync` cases landed, said `12.113` until Task 7's fix round added the cross-workspace batch case, said `12.114` until Batch A's whole-branch review round added 12.115–12.118, said `12.118` until Task 9's replica landed 12.119–12.135, and said `12.135` until Task 9's fix round added 12.136 (the bootstrap door's own refresh-on-publish fold, which did not exist) and 12.137 (the type filter in front of `claim.contested`, the type the docs call the common path), said `12.137` until Task 10 added 12.138-12.153 (the outbox and the local pre-check), and said `12.155` until Task 11 added 12.156-12.169 (the sync engine and its transport) — a line that read `12.168` for the few minutes between Task 11's first draft and its review round adding 12.169, and `12.169` until Task 11's FIX round added 12.170 (the third door into `applyServerItem`) and 12.171 (`caught-up.seq`, the value this client persists), and said `12.171` until Task 12 added 12.172-12.186 (the replica `DataSource`) — the first cases in this bucket that live in `packages/app-core` rather than `packages/sync-client`, which is why this file now quotes TWO current package denominators and they are not interchangeable. A stated maximum is a fact about a moment, and the file is the only thing that holds the moment — and the same staleness bit 12.113's and 12.77's own prose in the 12.114 round, where THIS line was updated and those two sentences were not. Updating the header is not the whole job: grep the file for the old maximum.)* Stated explicitly because the cases
below are grouped by SURFACE — the coherence check, then `proj_contested`, then the route — and not by
number, so the largest id is **not** the last line of the file. `12.81` sits in the projection section
and `12.76`/`12.77` trail the route's. An author who scans the tail for the next free number reads
`12.80` and mints a `12.81` that already exists two sections up. Grouping by surface is worth keeping —
it is how a reader finds the cases for the thing they are changing — so the maximum is written down
instead of the order being bent to expose it, and **the never-renumber rule means the existing ids
cannot be tidied into sequence anyway.**

One consequence worth stating rather than leaving to be discovered: **12.15 is already true on `main`**
— `apps/server/test/sync/stream-seq.test.ts` shipped with Plan 10 Task 2 — but it is a reserved id and
is deliberately not flipped here. *Owner: Plan 10 Task 18.*

**Scope of this file today.** Plan 10 Tasks 4, 5, 6, 7, 9, 10, 11 and 12. Task 4 as lifted out of the plan's
position: the §11 envelope-coherence closer, `proj_contested`, `getContest` and `GET /v1/contests`.
Task 5: the snapshot writer and the ledger-sourced reducer deps. Task 6: `GET /v1/sync/bootstrap`.
Task 7: `POST /v1/sync`. Task 9: the replica (12.119–12.137). Task 10: the outbox and the local
pre-check (12.138–12.153). Task 11: the sync engine and its HTTP/WS transport (12.156–12.171, the last two from its fix round).
Task 12: the replica `DataSource` (12.172–12.186), which lives in `packages/app-core` and is the first
part of this bucket that does. Nothing else from Plan 10 is catalogued — Task 8 (the `sync-client` scaffold
and the storage seam), Task 13 (app-core's
offline UX), Tasks 14–15 (the dual-client harness and its scenarios) and Tasks 16–17 (the two app
shells) are absent rather than missing. **Task 12 came off that absent list in the change set that
landed it**, together with the HIGHEST-ID line and the section enumeration above — the omission that
produced two of this work's false claims was updating one of those three and not the others. **Task 8's absence is measured, not assumed**: this file has no
Task 8 section and no case id for it. **The command this sentence used to quote is the wrong command,
and quoting it was one of this work's false claims**: it read *"`grep -n "Task 8" …` returns one
line"*, and a plain name-match returns this paragraph itself — which names Task 8 repeatedly in order
to say it is absent — plus the passing mention of its `outbox` table in the replica section's
uncovered-behaviour note. That count is SELF-REFERENTIAL: every correction to this sentence changes
it, which is exactly what happened when the "one line" version was first repaired. So the measure is
the one that cannot move with the prose:
`grep -nE "^## .*Task 8|^- 12\.[0-9]+ .*Task 8" test-cases/12-offline-sync-apps.md` returns NOTHING —
no Task 8 heading, no Task 8 case line — with `grep -cE "^## " …` printing **10** as the
control that the pattern can match a heading at all (re-measured here, not carried). Its storage-conformance
and barrel-guard suites (the "+4 and +4" inside `packages/sync-client`'s package run, which read 45 at
Task 10, 47 after the recorded-hazard file, 61 at Task 11, and **63** since Task 11's fix round) are catalogued in no
`test-cases/` file at all. *Owner for placing them: Plan 10 Task 18.*

**This paragraph was itself the drift the header line above warns about.** Written for Task 7 (commit
`09765d0`), it went on saying "Tasks 8–17 … the replica, the outbox … are absent rather than missing"
through Task 9's replica section and Task 10's outbox section landing in this same file — it named as
absent two things a reader could scroll to. The HIGHEST/NEXT-FREE line got bumped both times and this
sentence did not. Rewrite this enumeration in the SAME change set as any section you add.

**Terminology.** "envelope-origin" throughout means `EventEnvelope.origin`, the provenance enum
`'web' | 'mobile' | 'desktop' | 'server'`. It is NOT the browser `Origin` header; nothing in this file
concerns CSRF. The two are routinely conflated in this area of the repo, and the conflation is how
someone writes a header check and believes the forgery window is closed.

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
  offending event, which only the server can write: today `apps/server/src/sync/snapshot-writer.ts`
  has no `workflowVersion` handling and `apps/server/src/ledger/snapshot-store.ts` has no DELETE, so
  publishing a version invalidates no snapshot anywhere. *Owner: Plan 10 Task 6 (the bootstrap route
  and the snapshot writer).* **RECORDED, NOT FIXED — the other direction of the baseline, and it is LIVE.**
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
(12.156–12.171), the barrel guard's four, and the storage conformance suite's four. It read 45 until
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
- 12.167 ✅ **all five server frames reach a handler, and `ping` is answered with `pong`.** The socket
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
added no test there. These fifteen run in `packages/app-core`: the file's own current run is
`Tests 15 passed (15)`, and the package's is `Tests 1044 passed (1044)` across 64 files, both re-run at
the tree that ships them. A mutation record below that quotes `(15)` is a fact about the tree the
mutation ran on and is deliberately not re-run.

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
- 12.186 ✅ **`subscribe` hands its callback a real `StreamItem` — the kind `useLiveQuery` acts on.**
  A frame delivered through the engine's own stream door arrives at the subscriber as
  `{type:'event', envelope}`, and after `off()` a second frame arrives at nobody. **This case exists
  because the plan's `subscribe(..., cb: () => void)` would have shipped a source that looks wired up
  and repaints nothing**: `packages/app-core/src/views/use-live-query.ts` re-queries ONLY on
  `item.type === 'event'` or `'purge'`, so a bare signal — or a synthesized `caught-up` in its place —
  leaves every app-core view frozen against the offline copy with no type error anywhere. The frames
  come from `SyncEngine.onItem`, added by this task: the engine is the only component that holds a
  frame-shaped value, and it exposes the union it already has (`SyncItem`) rather than declaring a
  parallel or truncated one, which the deferred `StreamItem` → `ServerStreamFrame` ruling forbids.
  *Mutation: delete the `itemListeners` fan-out at the end of the engine's `applyOne` → red HERE ALONE,
  `Tests 1 failed | 14 passed (15)`, with zero `event` frames delivered where the case expects one.*

**RECORDED, NOT FIXED — Task 12's additions, with owners.**

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
