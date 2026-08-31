# 12. Offline sync & the apps — test cases

Mirrors `Features.md` §12. Status: `❌` not covered · `✅` covered · `🟡` partial · `🧪` manual · `🚫` out of scope (with reason).

**Numbering, and why this file does not start at 12.1.** `Features.md` §12 and this bucket belong to
Plan 10 by the coordination doc's reservation table (§3→Plan 1 … §6→Plan 4, then §7+ one per plan in
order). **Plan 10's own Task 18 pins cases 12.1–12.44 and states "this plan claims §12 and cases 12.x
only".** That task has not run, so those ids are RESERVED and are not claimed here; this file continues
from **12.45**, following the precedent `09-editor-attachments.md` set when Plan 7 Task 16's 9.1–9.34
were reserved the same way. **Never renumber; when Task 18 lands, its 12.1–12.44 fill in above these.**

**HIGHEST ID IN USE HERE IS `12.84`. THE NEXT FREE ID IS `12.85`.** *(Recount it from the case lines before trusting it — this very line said `12.81` for the few minutes between being written and three carried gaps being appended below it. A stated maximum is a fact about a moment, and the file is the only thing that holds the moment.)* Stated explicitly because the cases
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

**Scope of this file today.** Plan 10 Task 4 as lifted out of the plan's position: the §11
envelope-coherence closer, `proj_contested`, `getContest` and `GET /v1/contests`. Nothing else from
Plan 10 is catalogued — Tasks 5–17 (snapshot writer, bootstrap, `POST /v1/sync`, sync-client, the two
app shells, the dual-client harness) are absent rather than missing.

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

## Carried, with owners — recorded here rather than fixed

- 12.76 ❌ nothing establishes that a contest's embedded claim was **actually refused**, by the rule the contest names; the coherence check cannot see it and says so. *Owner: Plan 10 Task 7 (`POST /v1/sync`), the one path that holds a real refusal.*
- 12.77 ❌ `POST /v1/sync` does not exist, so the door it will open is not enumerated by 12.54–12.58. It must call `ingestClientBatch`, which is where it inherits both the permission gate and this coherence check. *Owner: Plan 10 Task 7.*
- 12.82 ❌ the coherence check binds `workspaceId`, `entity.kind` and `entity.id` and leaves the rest of the embedded claim FREE, and two of those free fields carry consequences that 12.76 does not cover. **`originalEvent.actorId` becomes `proj_contested.claimant_id` verbatim** — verified live: a coherent contest naming a fabricated actor committed, and `SELECT claimant_id` returned the fabrication — so `GET /v1/contests?claimantId=<victim>` surfaces it and Plan 5's My Work will show it as that person's contested claim. **`originalEvent.type` and `payload` are checked only by `submittedEventSchema`** (`type: z.string().min(1)`, payload unvalidated against any registry schema) and flow verbatim into `renderContestedClaimText`'s comment body, in an append-only table where it can only be superseded. Reachable today only through `ingestBatch`, which no production caller uses for contests. **Not a defect this task introduced** — `renderContestedClaimText` is Plan 10 Task 1's — but the binding rationale understated it, and P19 forbids leaving a category looking closed. *Owner: Plan 10 Task 7, with 12.76.*
- 12.83 ❌ `proj_contested`'s UNIQUE index on `original_event_id` is enforced with **no lookup guarding it**, and `isUniqueViolation` matches only on `events_pkey`, so a second contest embedding the same `originalEvent.id` rethrows out of `commitOne` and **rejects the entire batch call** — the already-committed events in that batch never return their answers, and a legal third event is never appended. Verified by driving the batch through the real `ingestBatch`: the call threw on `proj_contested_original_idx` and `events` held one row, then none. A retry does not recover, because a re-minted contest carries a fresh event id and never reaches the `events_pkey` duplicate path the recovery story relies on. The migration COMMENT and `Features.md` §12 both describe the index as making a sync retry *find* the prior contest; **nothing in this branch performs that lookup.** *Owner: Plan 10 Task 7, which inherits the index, the missing lookup and the retry story together.*
- 12.84 ❌ the `entity.kind` binding — one of the coherence check's three comparisons — is exercised only as a pure function and has **no door test**, so nothing pins that this third of the check is reachable through a real submission path. Deleting that comparison reddens exactly one test, and it is the unit one. The path is LIVE, not dead code: a hand-built contest with an outer `{kind:'ticket'}` and an embedded `{kind:'workspace'}` at the same id was refused `contest.incoherent-original` at `ingestBatch` with the entity-kind sentence and appended nothing. What is unproven is whether anything legitimate would ever walk it — `parseEvent` pins the outer kind to `'ticket'` and `buildContestedClaim` structurally cannot produce a mismatch — which is why this is recorded rather than fixed. *Owner: Plan 10 Task 7, alongside 12.77's door enumeration.*
