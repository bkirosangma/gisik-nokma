# 12. Offline sync & the apps — test cases

Mirrors `Features.md` §12. Status: `❌` not covered · `✅` covered · `🟡` partial · `🧪` manual · `🚫` out of scope (with reason).

**Numbering, and why this file does not start at 12.1.** `Features.md` §12 and this bucket belong to
Plan 10 by the coordination doc's reservation table (§3→Plan 1 … §6→Plan 4, then §7+ one per plan in
order). **Plan 10's own Task 18 pins cases 12.1–12.44 and states "this plan claims §12 and cases 12.x
only".** That task has not run, so those ids are RESERVED and are not claimed here; this file continues
from **12.45**, following the precedent `09-editor-attachments.md` set when Plan 7 Task 16's 9.1–9.34
were reserved the same way. **Never renumber; when Task 18 lands, its 12.1–12.44 fill in above these.**

**HIGHEST ID IN USE HERE IS `12.135`. THE NEXT FREE ID IS `12.136`.** *(Recount it from the case lines before trusting it — this very line said `12.81` for the few minutes between being written and three carried gaps being appended below it, said `12.93` for the time between that and Task 6's four bootstrap cases landing, said `12.97` for the time between that and a fix round hardening 12.94/12.96 and adding 12.98–12.99, said `12.99` until Task 7's fourteen `POST /v1/sync` cases landed, said `12.113` until Task 7's fix round added the cross-workspace batch case, said `12.114` until Batch A's whole-branch review round added 12.115–12.118, and said `12.118` until Task 9's replica landed 12.119–12.135. A stated maximum is a fact about a moment, and the file is the only thing that holds the moment — and the same staleness bit 12.113's and 12.77's own prose in the 12.114 round, where THIS line was updated and those two sentences were not. Updating the header is not the whole job: grep the file for the old maximum.)* Stated explicitly because the cases
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

**Scope of this file today.** Plan 10 Tasks 4, 5, 6 and 7. Task 4 as lifted out of the plan's position:
the §11 envelope-coherence closer, `proj_contested`, `getContest` and `GET /v1/contests`. Task 5: the
snapshot writer and the ledger-sourced reducer deps. Task 6: `GET /v1/sync/bootstrap`. Task 7:
`POST /v1/sync`. Nothing else from Plan 10 is catalogued — Tasks 8–17 (sync-client, the replica, the
outbox, the two app shells, the dual-client harness) are absent rather than missing.

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

**Seventeen `it` declarations, one per id 12.119–12.135, running as EIGHTEEN tests** — 12.132's `it`
sits inside a two-zone loop, so it executes twice. Both numbers are stated because neither implies the
other, and each is measured: `grep -cE "^\s*it\(" packages/sync-client/test/replica.test.ts` → 17, and
the runner's own line → `test/replica.test.ts (18 tests)`. (This sentence said "eighteen `it` blocks"
for the few minutes between being written and being checked, from a grep that matched only two of the
three indents in the file — the same class of error as the `TZ` count two paragraphs down.) **Every one
of the seventeen ids was proved able to fail** — enumerated case by case below, each with the mutation
that reddened it. Eighteen source mutations were applied one at a time to
`packages/sync-client/src/replica/`, restored between runs and hash-verified against a backup taken
before the first. The harness's own control was a null mutation (text replaced with itself) →
`18 passed (18)`, so the reddenings are the mutations and not the harness.

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
  per-entity `seq` from `rowToEnvelope` → red here, on 12.122, 12.123 and 12.124.*
- 12.120 ✅ a duplicate event id answers `{ applied: false }` and adds no second ledger row —
  at-least-once delivery is the contract. *Mutation: drop the `SELECT 1 FROM events WHERE id = ?`
  guard → red here alone.*
- 12.121 ✅ a `claim.contested` folds into the `contests` table and NOT into ticket state (the ticket
  stays in `todo`), `claimantId` is the actor of the **refused claim** rather than of the contest the
  server filed, and `claim.contested_resolved` flips `resolved`/`resolution` so `{ open: true }`
  empties. The `[]` carries a positive control from the same call: unfiltered, the contest is still
  there. *Mutation: skip `applyContest` → red here, on 12.127 and on both 12.132 runs.*
- 12.122 ✅ bootstrap folds a snapshot plus only the events past its `seq`: a backfilled `comment.added`
  at seq 2 sits below a snapshot at seq 3 and does not fold again, while the seq-4 transition does —
  **the transition log's LENGTH is what tells a correct fold from a whole-tail replay**, since both
  land in `doing`. The cursor lands at `streamSeq`, and `searchLocal` finds the ticket by comment text
  through `docToPlainText`, with a positive control (a phrase in no comment and no title) returning
  `[]` from the same call. *Mutation: read the title from a top-level `title` property instead of the
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
  i.e. unify it with the reducer's lookup → red here alone, and silently WRONG rather than loud: the
  ticket folds to v3 through a definition it never sat in.*
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
  rather than a throw. *Mutation: keep the definitions → red here alone.*
- 12.129 ✅ a project `scope-revoked` removes that project's tickets alone, leaves another project's
  ticket standing, and leaves the definitions and the cursor in place — the member is still in the
  workspace. *Mutation: ignore `projectId` → red here alone.*
- 12.130 ✅ **filter before folding, on both doors.** Thirteen event types bind to
  `entityKind: 'ticket'` and `applyTicketEvent` folds ten; a `visibility.set` arriving over sync AND a
  `visibility.set` in a bootstrap ticket tail are both stored without folding and without throwing.
  This is the common path, not an edge case — bootstrap backfills `claim.contested` unconditionally.
  *Mutation: drop the `TICKET_EVENT_TYPES` membership test in `refoldTicket` → red here alone, with
  `applyTicketEvent: not a ticket event: visibility.set`.*
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
  **15 files, this one included**. The first attempt at this number here said *four*, because it
  matched only `process.env.TZ` and this repo's strict settings push most call sites to
  `process.env['TZ']` — a grep that sees one spelling of two returns a well-formed wrong answer with
  no error, which is why the count above ships with its command. So this is sync-client's first
  TZ-varying test, not the repo's, and the control follows a convention several of those files already
  spell out. They also record the limit it inherits: `process.env.TZ` is live for V8's `Date` getters
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
