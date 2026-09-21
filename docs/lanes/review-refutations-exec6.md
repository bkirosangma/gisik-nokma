# Refutations — executor 6 (Opus 5, functionality lane), round 2 phase 2

**Phase 2 opened EARLY at 15:05:23 IST (owner) and closes 17:05:23 IST; the report is frozen at `737294ae`.**
This file was written during phase 1 (last
edit stamped below) because this lane has no guarantee of a turn at the boundary and push is durability. If a
turn comes in phase 2, the "Refutations" section is finalised then; if not, **what is below is this lane's
phase-2 position as of the stamp**, and nothing in it is a new finding.

Refutation ids are `R6-<n> → E<lane>-<m>`; each must name the target and the falsifying measurement with the
line opened. A refutation costs the refuter the finding's points if rejected, so none is filed on suspicion.

## Branches read

`origin/exec3/review-functionality-r2` at `7d75419b` (11:03 IST) · `origin/exec5/review-ux` at `cdffa421`
(11:03) · `origin/exec4/review-ui` at `bf928c83` (10:59) · `origin/exec1/review-ui-r2` at `8dcf2cfb` ·
`origin/exec2/review-ux-r2` at `ad054454` — headings of all five read; exec 3's round-2 findings E3-9 … E3-21 read
in full for E3-14, E3-15, E3-18, E3-19, E3-20, E3-21; exec 5's E5-13 read in full. **Re-fetched 14:30 IST:**
`origin/exec3/review-functionality-r2` at `e2f74ec2` (14:21) — E3-22 … E3-27 and §36–§41 (their attacks on E6-3,
E6-8, E6-9, E6-11: all "hold") read; E3-25, E3-26, E3-27 re-measured below.

## Candidates examined and NOT refuted — with the reason, so the judge can see the work

| target | what I checked | verdict |
|---|---|---|
| **E3-14** (claimed Critical — five cookie-authenticated mutating routes outside `HTTP_ORIGIN_PROTECTED_ROUTES`) | Opened `apps/server/src/http/http-origin.ts:128-172`. Two of the five (`POST /v1/invites/:token/accept`, `PUT /v1/me/preferences`) are **recorded exclusions with reasons and owners** in that docblock (*"excluded here rather than silently omitted"*), and the docblock's own pricing of the accept variant — *"a workspace they can leave"* — is the reasoning the Critical rests on for `/v1/me/invitations/:inviteId/accept`. The other three routes are genuinely unmentioned. | **Valid for three routes, and the recorded exclusion of the other two is weaker than it reads**: its reasoning — *"a workspace they can leave"* — is measured false in my E6-21 (a member or guest cannot revoke their own membership; only an admin can), which makes the forced join E3-14 describes permanent from the victim's side. Not a refutation; the opposite — a connected finding. My E6-15 is the read-side complement (`/v1/stream`), measured independently. |
| **E3-18** (Important — replica answers `restricted` for a dangling parent; online answers `null`) | Opened `replica-data-source.ts:1164-1175` and `routes/tickets.ts:400-404`; the divergence is as stated and their probe is reproducible in shape. | **Valid.** The sub-claim *"it can [distinguish absent from not-delivered]"* is doubtful — a guest's replica holds no row for a parent it may not see either, and `reconcile` answers `restricted` for both — but a doubtful remedy is not a false finding. |
| **E3-19** (Important — a child can be moved *out* of terminal under a terminal parent) | `transition.ts:132-142` guards only the terminal-**entering** direction, as they say. Adjacent to my E6-8 (republish promotion), different door. | **Valid; independent of E6-8.** |
| **E3-20 / E3-21** (stale ❌ cases 6.82 and 6.84) | Same class as my E6-12 (6.51, 6.77, 6.123). On 6.84 I had judged the ❌ still true of the *projection's own* robustness and declined to file; exec 3 files it on the door's refusal (`hierarchy.ts:124`, ruling P12). | **Valid as filed; different reading of the same line, not a falsification.** |
| **E5-13** (claimed Critical — `/account` PUTs a guessed notification-preferences document after a failed read) | Browser-reproduced with a mocked `fetch`; source lines at `account/page.tsx:81`, `:215-232` as cited. | **Valid.** Not this lane's to re-measure; the wire half (a whole-document PUT) is the gateway's stated contract. |
| **E3-25** (Minor — `SyncItem` has four arms, not three; twenty ❌ lines in `06-auth-visibility.md`) | `sync-item.ts:96` is a four-arm union. Their "twenty" re-counted with my §1 first-marker instrument restricted to file 06: **20**, at the same twenty line numbers they list (`73 77 82 87 93 95 97 98 107 115 116 117 129 131 193 198 199 201 202 203`). | holds — count reproduced by an independent instrument |
| **E3-26** (Important — `Features.md:2350` says no settings nav entry; `app-nav.tsx:299` renders one) | `grep -n "Nothing in the app links to any of them yet" Features.md` → `:2350`; `app-nav.tsx:299` is `href={\`/settings?workspaceId=…\`}`, and `:84` calls it *"`Settings`"*. | holds |
| **E3-27** (Important — two files say `checkErrandTemplate` "not yet landed"; it landed) | `grep -rn "not yet landed on this branch"` → `Features.md:452` and `app-core/test/workflow-builder/templates.test.ts:66`; `apps/server/src/seed/templates.ts:41` exports `checkErrandTemplate`. | holds |
| **E5-24** (help describes a product that no longer exists — "you cannot delete a job" among four passages) | Overlaps my **E6-1**, found independently (mine is stamped 10:0x IST, theirs pushed 11:03). | **Both stand; independent duplicates score in full (rules §3).** |

## Where this lane would DEFEND

- **E6-2** — the expected refutation is *"committed is not a defect; the FAQ promises only views."* Answer: the
  product's own rule that a notification is a view (`notifications/sweep.ts:175-177`), the measured letter into a
  404 (Appendix A), and the product's precedent that a write door refuses a deleted ticket (`ticketIsLive` at the
  upload door, cases 16.97–16.99).
- **E6-11** — it is recorded; that is why it is filed at Minor, and the argument is the same-commit contradiction
  (`18d7e391`), not the residual's existence.
- **E6-13** — "Open question 11 is recorded and unassigned." Answer: recorded 2026-09-02, trigger shipped
  2026-09-03, and the runbook's restore drill (`docs/runbook.md:149-150`) makes the verifier's verdict
  operational; an unassigned question with a shipped trigger is the subject, not a defence.
- **E6-15** — "SameSite=Lax closes it." Answer: `http-origin.ts:180-181`, the product's own sentence that Lax does
  not close same-site siblings, and `deploy/do/app.yaml:5` deploying two siblings of one registrable domain.
- **E6-16** — "the width is the product's decision." Agreed and said in the finding; the contradiction is the
  consent page's *"lasts until you revoke it"* against a measured successor that survives revocation.
- **E6-24** — "16.90(c) already records the replica reads; category 2." Answer: 16.90(c) (`16-remaining-doors.md:923`)
  asserts the replica *applies the same rule* at two lines and records that those two are unwitnessed; E6-24
  measures three sibling reads — the ones `apps/mobile` and `apps/desktop` actually call — with no rule at all
  (Appendix AF, five reads before/after, positive control). A case that says the rule is applied is not a record
  that it is missing, and the commit that wrote the two gates says "a filter at every view-serving read".
- **E6-10** — "per-event transactions are the design; a partial batch is what 7.45 promises." Answer: the finding is
  not that the batch is per-event; it is that the CLIENT is told "refused" while k tickets moved (Appendix I prints
  both the server's per-ticket rows and the client's single sentence), and that the docblock's "pre-flight
  refusals append nothing" is true of the pre-flight and false of the gate that runs after it.
- **E6-17** — "the assignee is checked against the roster somewhere." Answer: Appendix O commits `ticket.assigned`
  with a fresh ULID and with the string `nobody-here` through `POST /v1/events` (controls: a member commits; the
  board renders the string). If a refuter names the line that checks the roster, it must also explain the commit.
- **E6-19** — "`IST_DAY_REGEX` is documented as shape-only." Answer: agreed and cited (`ist-day.ts:27`); the finding
  is what the product then DOES with an impossible day — Appendix W commits `2026-02-30`, `2026-13-45`,
  `0000-00-00` and the attention read prints "Needed by 0000-00-00". A documented parse bound is not a ruling that an
  impossible day is a valid claim.
- **E6-20** — "P15 was scoped to `displayName`." Answer: P15's sentence is general ("a name of only spaces names
  nothing"), the finding lists which schemas got the refinement and which did not (`min(1)` only), and Appendix X
  commits a state named `" "` that becomes a board column. Filed Minor for exactly the scoping objection.
- **E6-21** — "leaving a workspace was never a product feature." Answer: the export's privacy copy promises it,
  `http-origin.ts:180-181`'s exclusion reasoning ("a workspace they can leave") assumes it, and Appendix Y measures
  that a member's and a guest's self-revocation are refused while the owner's revocation of the member commits
  (the control) and an admin's self-revocation commits (so "leaving" exists for admins only). With E3-14's forced join, the absence is what makes that join permanent — which is why it is Important.
- **E6-14** — exec 3's examination (not a refutation) measured the headline's interval against the key's LEDGER half
  (`ac18f2bc`, 13:04) where the WIRE half came at `277b5d22` (23:07). Conceded and narrowed in a dated
  *Defence and correction* paragraph under E6-14 in the report (`a53a6929`); the Minor's basis — `:1588` reads the
  key while `:296-306` says none exists — is what exec 3 itself confirms holds.
- **E6-25** — "comments in a deploy file are not the product." Answer: filed Minor for exactly that reason; the
  class (a record declaring a closed gap open) is the one the judge priced in round 1 (E3-1) and exec 3 re-files
  six times this round (E3-22 … E3-27); two of the six sentences are security claims an operator acts on, and every
  "landed" claim is dated by `git log -S` / `blame`, not inferred.

## Refutations

### R6-1 → E5-21 (exec 5, Important) — PARTIAL: the finding's absolute and its stated mechanism are false; its core survives

**What E5-21 claims** (`review-ux-exec5.md:843-875` at `1641161d`): the phone's Comment button files `comment.added`
with `actorId: state.assigneeId ?? 'me'`, and *"what it files can never be committed — the actor on the event is not
the session's, and `IDENTITY_SPOOF_REASON` exists to refuse exactly that, so the refusal is guaranteed by
construction."*

**What is false, measured.** The phone's replica syncs through `POST /v1/sync`, not `/v1/events`. On that door,
with the PEER assigned to the ticket, three envelopes shaped exactly as `ticket-screen.tsx:36-57` shapes them:

```
self-assigned  (actorId = assigneeId = session user)  -> committed  (seq 3, workspaceSeq 14) — and the thread door serves it
other-assignee (actorId = assigneeId ≠ session user)  -> invalid: actor-mismatch "A synced claim must belong to the signed-in user."
actorId='me'   (unassigned ticket)                     -> invalid: malformed-envelope "actorId: must be a ULID"
```

So (1) **a person commenting on a ticket assigned to THEM commits** — an ordinary case on a shell whose list is
every ticket the person can see (`listTicketSummaries`), including the ones assigned to them — which falsifies "can never be committed" and "guaranteed by construction"; and (2)
the refusal the finding names, `IDENTITY_SPOOF_REASON` (`check-permission.ts:71`, `:544`, the `/v1/events` gate),
is not the one the phone meets: the sync door answers `invalid` with `actor-mismatch` (`sync-service.ts:325`) before
any gate runs, and the `'me'` shape never reaches even that — it fails the envelope parse. An `invalid` result is
terminal in the outbox (`outbox.ts:412`, `status = 'failed'`), which is a different fate from a refusal (a refused
ticket claim on the sync door becomes a contest, `sync-service.ts:416-417`) — so the sentence "sit in a local queue
that will be refused at the first sync" describes the wrong outcome too: they fail, once, and are not retried.

**What survives.** The manual sentence is still wrong in the direction E5-21 says; an UNASSIGNED ticket's comment
and a comment on SOMEONE ELSE's ticket never post, and the phone's failure arm (`:54`) swallows the `OfflineAcceptError` that
`ds.ingest` throws for every queued claim (`replica-data-source.ts`, the `ingest` arm) as "the expected offline
outcome"; the `invalid` arrives later on the sync engine, where the ticket screen reads nothing back. (Whether the
`'me'` shape is refused LOCALLY before it is queued — which would put a sentence on the screen — I did not measure.) The severity is the judge's; this refutation narrows the finding to "comments on tickets not
assigned to you", it does not remove it.

**MEASUREMENT.** `apps/server/test/zz-exec6-probe-phone-comment.test.ts` (never committed; verbatim below), run
from `apps/server` with `pnpm exec vitest run test/zz-exec6-probe-phone-comment.test.ts --no-file-parallelism`
(node v22.22.2), 1 file / 1 test passed. Lines opened: `apps/mobile/src/screens/ticket-screen.tsx:21`, `:36-57`,
`:45`, `:49` (`draft` is an `EditorDoc`, so the body is well-formed); `domain/src/events/ticket-events.ts:108`
(`body: z.record(...)`); `sync/sync-service.ts:29`, `:318-326`, `:416-417`; `permissions/check-permission.ts:71`,
`:544`; `sync-client/src/outbox/outbox.ts:412`.

```ts
// EXEC6 PHASE-2 PROBE — NOT A PRODUCT TEST. Deleted after the run; never committed.
// Question (R6 -> E5-21): does a comment filed under the ASSIGNEE's id ever commit?
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { membershipId, newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers/app.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { signInWithPhone } from './helpers/session.js';

let db: TestDatabase; let app: FastifyInstance;
let ownerToken = ''; let ownerId = ''; let peerToken = ''; let peerId = ''; let WS = ''; let PRJ = ''; let T = '';
function auth(token: string) { return { authorization: `Bearer ${token}` }; }
function env(entity: { kind: string; id: string }, type: string, payload: unknown, actorId: string) {
  return { id: newUlid(), workspaceId: WS, entity, type, version: 1, payload, actorId, origin: 'mobile', clientTime: new Date().toISOString() };
}
async function events(e: unknown, token: string) {
  const res = await app.inject({ method: 'POST', url: '/v1/events', headers: auth(token), payload: { events: [e] } });
  return res.json<{ results: Array<Record<string, unknown>> }>().results[0]!;
}
async function sync(e: unknown, token: string) {
  const res = await app.inject({ method: 'POST', url: '/v1/sync', headers: auth(token), payload: { events: [e] } });
  return res.statusCode === 200 ? res.json<{ results: Array<Record<string, unknown>> }>().results[0]! : { status: `HTTP ${res.statusCode}`, body: res.body.slice(0, 120) };
}
function doc(text: string) { return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }; }

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db); app = built.app; await app.ready();
  const owner = await signInWithPhone(app, built.otp, '+919000000701'); ownerToken = owner.token; ownerId = owner.userId;
  const peer = await signInWithPhone(app, built.otp, '+919000000702'); peerToken = peer.token; peerId = peer.userId;
  const res = await app.inject({ method: 'POST', url: '/v1/workspaces', headers: auth(ownerToken), payload: { name: 'Exec6 phase2' } });
  expect(res.statusCode, res.body).toBe(201); WS = res.json<{ workspaceId: string }>().workspaceId;
  expect((await events(env({ kind: 'membership', id: membershipId(WS, peerId) }, 'membership.granted', { userId: peerId, role: 'member' }, ownerId), ownerToken)).status).toBe('committed');
  PRJ = newUlid();
  expect((await events(env({ kind: 'project', id: PRJ }, 'project.created', { name: 'P' }, ownerId), ownerToken)).status).toBe('committed');
  for (const uid of [ownerId, peerId]) expect((await events(env({ kind: 'project', id: PRJ }, 'project.member_added', { userId: uid, projectAdmin: uid === ownerId }, ownerId), ownerToken)).status).toBe('committed');
  T = newUlid();
  expect((await events(env({ kind: 'ticket', id: T }, 'ticket.created', { typeId: 'task', projectId: PRJ, parentId: null, title: 'phone comment target' }, ownerId), ownerToken)).status).toBe('committed');
  // the PEER is the assignee
  expect((await events(env({ kind: 'ticket', id: T }, 'ticket.assigned', { assigneeId: peerId }, ownerId), ownerToken)).status).toBe('committed');
});
afterAll(async () => { await app.close(); await db.drop(); });

describe('exec6 phase-2 probe: a phone comment filed under state.assigneeId ?? "me"', () => {
  it('measures the three actor shapes the phone can produce, on the sync door', async () => {
    // (1) the assignee themself comments: actorId = assigneeId = session user
    const self = await sync(env({ kind: 'ticket', id: T }, 'comment.added', { body: doc('from the assignee') }, peerId), peerToken);
    // (2) somebody else (the owner) comments on the peer's ticket: actorId = assigneeId != session user
    const other = await sync(env({ kind: 'ticket', id: T }, 'comment.added', { body: doc('from the owner, filed as the peer') }, peerId), ownerToken);
    // (3) an unassigned ticket: actorId = 'me'
    const me = await sync(env({ kind: 'ticket', id: T }, 'comment.added', { body: doc('from me') }, 'me'), peerToken);
    console.log('PROBE self-assigned  ->', JSON.stringify(self));
    console.log('PROBE other-assignee ->', JSON.stringify(other));
    console.log("PROBE actorId='me'   ->", JSON.stringify(me));
    // did the self comment land in the thread?
    const thread = await app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${T}/comments`, headers: auth(peerToken) });
    const bodies = JSON.stringify(thread.json());
    console.log('PROBE thread has "from the assignee":', bodies.includes('from the assignee'), '| has "filed as the peer":', bodies.includes('filed as the peer'));
    expect(self.status).toBe('committed');
    expect(other.status).not.toBe('committed');
    expect(me.status).not.toBe('committed');
  });
});
```

```
PROBE self-assigned  -> {"status":"committed","eventId":"01M31N8T186WBH81395TSW4637","seq":3,"workspaceSeq":14,"serverTime":"2026-09-21T09:38:03.950Z"}
PROBE other-assignee -> {"status":"invalid","eventId":"01M31N8T1KA6879EMBFETHQMXX","code":"actor-mismatch","message":"A synced claim must belong to the signed-in user."}
PROBE actorId='me'   -> {"status":"invalid","eventId":"01M31N8T1PN5036NA93NCJRP57","code":"malformed-envelope","message":"event envelope is malformed at actorId: must be a ULID"}
PROBE thread has "from the assignee": [33mtrue[39m | has "filed as the peer": [33mfalse[39m
 ✓ test/zz-exec6-probe-phone-comment.test.ts (1 test) 831ms
 Test Files  1 passed (1)
      Tests  1 passed (1)
```

### R6-2 → E2-42 (exec 2, Important) — PARTIAL, same measurement as R6-1

E2-42 (`review-ux-exec2.md:2334-2389` at `778a6439`) is the same phone handler. After its own correction it
states: *"the claim is REFUSED, never committed — the ledger is not falsified … refused at the first sync that has a
session"*, naming `IDENTITY_SPOOF_REASON` (`check-permission.ts:542-545`) as the mechanism — and its WHY paragraph,
left standing beneath the correction, still says the comment *"is written to the ledger as that person's claim …
their name on words they did not write"*. R6-1's probe answers both sentences: (1) when the assignee IS the
session user the comment **commits** (`seq 3`, served by the thread door) — and that attribution is correct, the
words are the assignee's own; (2) when it is not, the sync door answers `invalid: actor-mismatch`
(`sync-service.ts:325`), not `IDENTITY_SPOOF_REASON`, and an `invalid` is terminal in the outbox (`outbox.ts:412`)
rather than "refused at the first sync" — the outbox marks the row `failed`, once. E2-42's own "⚠ Not verified"
line concedes that whether a member id occupies `assigneeId` at send time was not measured; the probe measures the
case where it is the sender's own id. What survives of E2-42 is the same core as E5-21's: for an unassigned
ticket or someone else's ticket the comment never posts and no screen says so; the "wrong real person's name on
the ledger" sentence is false in both directions (never written for another person; correctly written for oneself).

**MEASUREMENT.** R6-1's probe and log, verbatim above; lines opened as listed there plus
`review-ux-exec2.md:2334-2389`.

### R6-3 → E2-28 (exec 2, Minor) — REACHABILITY: the sentence E2-28 describes cannot be rendered by any shipped shell

**What E2-28 claims** (`review-ux-exec2.md:1650-1693` at `778a6439`): *"A bulk close that was ACCEPTED and queued is
reported as 'We could not reach the server'"* — `bulk-close-dialog.tsx:230-233`'s catch prefixes the replica's
`OfflineAcceptError` message with the transport sentence.

**What is false, measured.** The catch exists (`bulk-close-dialog.tsx:230-233`, opened), but no shipped shell can
put an `OfflineAcceptError` into it:

```
BulkCloseDialog mounts (non-test, non-dist):   apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx, packages/app-core/src/views/board.tsx  (+ its own file)
BulkCloseDialog in apps/mobile + apps/desktop:  0 lines
DataSource the web constructs:                 apps/web/src/providers.tsx:108  createOnlineDataSource(…)   — createReplicaDataSource in apps/web → 0
OfflineAcceptError in online-data-source.ts:   0   (the online source never answers `pending`; it returns the server's results)
createReplicaDataSource constructor sites:     apps/mobile/src/app.tsx:40, apps/desktop/src/app.tsx:56 only (E6-24's enumeration)
```

The only `DataSource` whose `ingest` throws `OfflineAcceptError` (`replica-data-source.ts:1406`) is constructed by
the two minimal shells, and neither mounts `BulkCloseDialog` (or any app-core view — `apps/desktop/src/app.tsx:120-123`
says so in words). The web mounts the dialog and feeds it the online source, whose `ingest` cannot throw that error.
So the self-contradictory sentence is a property of a branch no product path reaches today; "is reported" is not
a sentence a person can be shown. The code contradiction E2-28 reads is real as code and will become reachable
the day Plan 6's views mount on the replica — which is a note for that day, not a defect a person meets on this
build. Filed against a Minor, with that bound stated.

**MEASUREMENT.** The five greps above (each with the neighbouring positive result as its control: the web mount
IS found, the online constructor IS found); lines opened: `bulk-close-dialog.tsx:224-234`,
`replica-data-source.ts:1406`, `apps/web/src/providers.tsx:21`, `:108`, `apps/desktop/src/app.tsx:120-123`.

## Phase-2 findings (half points, rules §2)

### E6-26 — MINOR — `proj_rollups` is recomputed inside every ticket, workflow and reparent transaction, replayed by the release-gate verifier, and read by nothing in the product — a state `Features.md` records as interim ("Nothing reads it yet") for a reason that has since expired

**WHAT.** Measured at `a7b6292b`:

```
SQL readers of proj_rollups outside projections/rollups.ts (FROM/JOIN, non-test):   0   (control: `FROM proj_tickets` → 15 files)
callers of getRollup() outside tests/dist/the projection itself:                    0   (control: rollupFor() → read/ticket-cards.ts:159, routes/tickets.ts:451)
what writes it: rollups.ts:372-420 — workflow.defined (every parent whose workflow matches, :362-367), ticket.created,
                ticket.transitioned, ticket.workflow_rebound, ticket.deleted, ticket.restored, ticket.reparented (both parents)
who verifies it: tools/verify-projections.ts replays the whole registry (index.ts:25 lists proj_rollups at position 6)
```

Every card's `rollup` and the detail route's rollup come from `visibility/rollup.ts` at read time — a fresh
enumeration of `proj_visibility` joined to `proj_tickets` — and `rollup.ts:79-96` records why the cards do not read
`proj_rollups` (the two tables do not enumerate the same children, case 6.83/7.78).

**Correction, 16:10 IST, before anyone else found it:** the absence IS recorded. `Features.md:408` (blame `6cb631d0`,
2026-09-01) says, verbatim: *"Nothing reads it yet: Plan 4's `RollupView` (`src/visibility/rollup.ts`) still ships
without the open/active/terminal half, and its cases 6.82 and 6.83 remain open."* — an interim state with a
reason. The reason has expired on all three counts: `rollup.ts` now carries the category half as far as the cards use it (`RollupView.terminal` and
`.uncategorized`, `:126-132`, counted at `:276`; open and active are the remainder of `total`); 6.83 is measured (case 7.78, `ticket-cards.test.ts:507`, exec 3's
E3-30); 6.82's capability shipped (exec 3's E3-20). So the finding is narrower than its first sentence: not "an
unrecorded dead table" but "an interim recorded on 2026-09-01 whose stated reason is gone, and whose 'yet' has
become twenty days with no reader" — the same class as E6-25's sentences, in the catalogue rather than the deploy
directory.

**WHY it matters.** A table with no reader still costs: a `workflow.defined` recomputes one row per parent on that
workflow inside the publish transaction (E6-8's door), every transition recomputes the parent, and the verifier —
the restore drill's gate (E6-13) — can report `DRIFT DETECTED` on a table whose contents no route serves, which
is the false-red shape E6-13 already documents for `proj_tickets`. `Features.md:408` records the interim and a reason that no longer holds; a reader of it today is told the
read half is still unbuilt when it was built at read time instead (`rollup.ts:79-96` chose the enumeration over
the table), which is the decision the bullet should now state.

**WHAT WOULD HAVE BEEN BETTER.** Either read it — `rollupFor` could take its category counts from it once the
enumeration mismatch (6.83) is resolved — or drop the projection and its verifier row, and say in `Features.md:408`
which. A projection kept "in case" is the rule the repo states for controls and components (E2-25 quotes it).

**MEASUREMENT.** The four greps above with their controls; lines opened: `projections/rollups.ts:362-367`,
`:372-420`; `visibility/rollup.ts:79-96`; `read/ticket-cards.ts:159`; `routes/tickets.ts:445-456`;
`projections/index.ts:25`; `tools/verify-projections.ts:5-8`; `Features.md:408` (the "Nothing reads it yet" sentence, found
by `grep -o "Nothing reads it yet.*"` after the first draft claimed the absence was unrecorded — corrected above).

**SEVERITY: Minor.** Cost and a false-red surface, no wrong answer to a person. Phase-2, half points.

**Stamp:** written 2026-09-21 11:25 IST, E3-14 row amended 12:00 IST after E6-21; phase 1; branch heads as listed above.
**Phase 2:** R6-1 filed 15:10 IST against `origin/exec5/review-ux` at `1641161d`; R6-2 filed 15:16 IST against
`origin/exec2/review-ux-r2` at `778a6439` (same probe); R6-3 filed 15:20 IST against the same head; E6-26 (phase-2, half) filed 15:30 IST. **15:44 IST:** exec 5's file (`d3234320`) records R6-1 as CONCEDED
(*"R6-1 was right about my absolute"*, E5-21 refiled narrower); E6-14 defence paragraph added to the report. **15:47 IST:** exec 2's file (`9fdfa40f`, table under
"Exec 6's R6-2 and R6-3 … both were right") records **R6-2 conceded and narrowed** (E2-42 → comments on tickets not
assigned to the commenter; `f282f3e1`, `c3daab69`) and **R6-3 conceded** (E2-28: *"the sentence has no path to a
screen on this build"*, `d33281fe`). All three refutations filed by this lane are conceded by their targets. **Watch 16:36 IST:** nothing filed against
this lane on any branch (polled 15:54, 16:03, 16:06, 16:19, 16:20, 16:36); heartbeat push.
