# 12. Offline sync & the apps — test cases

Mirrors `Features.md` §12. Status: `❌` not covered · `✅` covered · `🟡` partial · `🧪` manual · `🚫` out of scope (with reason).

**Numbering, and why this file does not start at 12.1.** `Features.md` §12 and this bucket belong to
Plan 10 by the coordination doc's reservation table (§3→Plan 1 … §6→Plan 4, then §7+ one per plan in
order). **Plan 10's own Task 18 pins cases 12.1–12.44 and states "this plan claims §12 and cases 12.x
only".** That task has not run, so those ids are RESERVED and are not claimed here; this file continues
from **12.45**, following the precedent `09-editor-attachments.md` set when Plan 7 Task 16's 9.1–9.34
were reserved the same way. **Never renumber; when Task 18 lands, its 12.1–12.44 fill in above these.**

**HIGHEST ID IN USE HERE IS `12.97`. THE NEXT FREE ID IS `12.98`.** *(Recount it from the case lines before trusting it — this very line said `12.81` for the few minutes between being written and three carried gaps being appended below it, and said `12.93` for the time between that and Task 6's four bootstrap cases landing. A stated maximum is a fact about a moment, and the file is the only thing that holds the moment.)* Stated explicitly because the cases
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

**Scope of this file today.** Plan 10 Tasks 4 and 5. Task 4 as lifted out of the plan's position: the
§11 envelope-coherence closer, `proj_contested`, `getContest` and `GET /v1/contests`. Task 5: the
snapshot writer and the ledger-sourced reducer deps. Nothing else from Plan 10 is catalogued — Tasks
6–17 (bootstrap, `POST /v1/sync`, sync-client, the two app shells, the dual-client harness) are absent
rather than missing.

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
  both producing `[]`), a `streamSeq` greater than zero, and a tail that excludes everything at or below
  the snapshot's seq EXCEPT the four backfill types — content and contests are not ticket state, so a
  `comment.added` filed before the snapshot still travels. *Mutations, both confirmed red against this
  same test: reintroduce the tuple spread → `expected {…} to deeply equal {…}`, `projectIds` carrying
  arrays instead of strings; drop the backfill clause from the tail filter → the comment goes missing
  from `visible.events`.* (bootstrap.test.ts)
- 12.95 ✅ planted defect: an invisible ticket is absent from a member's bootstrap — no id, no stub,
  nothing — with a positive control in the SAME request: the visible ticket's id must actually appear in
  the response body, so "invisible one absent" cannot pass by the route answering nothing to anyone.
  *Mutation: `listVisibleTickets` call replaced with a constant `[]` → red here (the positive control
  fails: the visible ticket's id is gone too) and red on 12.94 (`tickets` no longer has length 1).*
  (bootstrap.test.ts)
- 12.96 ✅ a guest gets definitions and exactly the ticket explicitly shared with them, not the
  workspace-mode ticket a member sees — a positive control on the empty case: "the guest gets `[]`"
  would otherwise pass for a route that returns `[]` to everyone. *Mutation: `listVisibleTickets` call
  replaced with a constant `[]` → red here AND on 12.94, since the member's ticket also disappears; the
  guest case adds the proof that a NON-empty answer (the shared ticket) is reachable at all, which the
  member case alone does not establish for a guest's role branch.* (bootstrap.test.ts)
- 12.97 ✅ `GET /v1/sync/bootstrap` 403s `{error:'not_a_member'}` for a signed-in caller who resolves no
  workspace role, and 401s a request carrying no session at all. *Mutation: `preHandler: requireSession`
  removed → red on the 401 assertion here, and red on every other case in this file too — every
  authenticated call in 12.94-12.96 now reaches the handler with no `request.currentUserId` to read.*
  (bootstrap.test.ts)

## Carried, with owners — recorded here rather than fixed

- 12.76 ❌ nothing establishes that a contest's embedded claim was **actually refused**, by the rule the contest names; the coherence check cannot see it and says so. *Owner: Plan 10 Task 7 (`POST /v1/sync`), the one path that holds a real refusal.*
- 12.77 ❌ `POST /v1/sync` does not exist, so the door it will open is not enumerated by 12.54–12.58. It must call `ingestClientBatch`, which is where it inherits both the permission gate and this coherence check. *Owner: Plan 10 Task 7.*
- 12.82 ❌ the coherence check binds `workspaceId`, `entity.kind` and `entity.id` and leaves the rest of the embedded claim FREE, and two of those free fields carry consequences that 12.76 does not cover. **`originalEvent.actorId` becomes `proj_contested.claimant_id` verbatim** — verified live: a coherent contest naming a fabricated actor committed, and `SELECT claimant_id` returned the fabrication — so `GET /v1/contests?claimantId=<victim>` surfaces it and Plan 5's My Work will show it as that person's contested claim. **`originalEvent.type` and `payload` are checked only by `submittedEventSchema`** (`type: z.string().min(1)`, payload unvalidated against any registry schema) and flow verbatim into `renderContestedClaimText`'s comment body, in an append-only table where it can only be superseded. Reachable today only through `ingestBatch`, which no production caller uses for contests. **Not a defect this task introduced** — `renderContestedClaimText` is Plan 10 Task 1's — but the binding rationale understated it, and P19 forbids leaving a category looking closed. *Owner: Plan 10 Task 7, with 12.76.*
- 12.83 ❌ `proj_contested`'s UNIQUE index on `original_event_id` is enforced with **no lookup guarding it**, and `isUniqueViolation` matches only on `events_pkey`, so a second contest embedding the same `originalEvent.id` rethrows out of `commitOne` and **rejects the entire batch call** — the already-committed events in that batch never return their answers, and a legal third event is never appended. Verified by driving the batch through the real `ingestBatch`: the call threw on `proj_contested_original_idx` and `events` held one row, then none. A retry does not recover, because a re-minted contest carries a fresh event id and never reaches the `events_pkey` duplicate path the recovery story relies on. The migration COMMENT and `Features.md` §12 both describe the index as making a sync retry *find* the prior contest; **nothing in this branch performs that lookup.** *Owner: Plan 10 Task 7, which inherits the index, the missing lookup and the retry story together.*
- 12.84 ❌ the `entity.kind` binding — one of the coherence check's three comparisons — is exercised only as a pure function and has **no door test**, so nothing pins that this third of the check is reachable through a real submission path. Deleting that comparison reddens exactly one test, and it is the unit one. The path is LIVE, not dead code: a hand-built contest with an outer `{kind:'ticket'}` and an embedded `{kind:'workspace'}` at the same id was refused `contest.incoherent-original` at `ingestBatch` with the entity-kind sentence and appended nothing. What is unproven is whether anything legitimate would ever walk it — `parseEvent` pins the outer kind to `'ticket'` and `buildContestedClaim` structurally cannot produce a mismatch — which is why this is recorded rather than fixed. *Owner: Plan 10 Task 7, alongside 12.77's door enumeration.*
