# 12. Offline sync & the apps — test cases

Mirrors `Features.md` §12. Status: `❌` not covered · `✅` covered · `🟡` partial · `🧪` manual · `🚫` out of scope (with reason).

**Numbering, and why this file does not start at 12.1.** `Features.md` §12 and this bucket belong to
Plan 10 by the coordination doc's reservation table (§3→Plan 1 … §6→Plan 4, then §7+ one per plan in
order). **Plan 10's own Task 18 pins cases 12.1–12.44 and states "this plan claims §12 and cases 12.x
only".** That task has not run, so those ids are RESERVED and are not claimed here; this file continues
from **12.45**, following the precedent `09-editor-attachments.md` set when Plan 7 Task 16's 9.1–9.34
were reserved the same way. **Never renumber; when Task 18 lands, its 12.1–12.44 fill in above these.**

**HIGHEST ID IN USE HERE IS `12.114`. THE NEXT FREE ID IS `12.115`.** *(Recount it from the case lines before trusting it — this very line said `12.81` for the few minutes between being written and three carried gaps being appended below it, said `12.93` for the time between that and Task 6's four bootstrap cases landing, said `12.97` for the time between that and a fix round hardening 12.94/12.96 and adding 12.98–12.99, said `12.99` until Task 7's fourteen `POST /v1/sync` cases landed, and said `12.113` until Task 7's fix round added the cross-workspace batch case. A stated maximum is a fact about a moment, and the file is the only thing that holds the moment.)* Stated explicitly because the cases
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
  second' to be 'A v3 first'`; the workspace filter dropped → red in seven cases.*
  (snapshot-writer.test.ts)
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
  …(4) }`), all thirteen other cases green.* (sync-route.test.ts)
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
- 12.77 ✅ the `POST /v1/sync` door is enumerated, by 12.100-12.113. It calls `ingestClientBatch`, so it
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
  a server-authored contest cannot survive now rides inside `results`. 12.114 pins it. The throw is kept
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

