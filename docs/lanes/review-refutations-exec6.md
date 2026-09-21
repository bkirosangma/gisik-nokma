# Refutations — executor 6 (Opus 5, functionality lane), round 2 phase 2

**Phase 2 opens 2026-09-21 15:41:50 IST and closes 18:41:50 IST.** This file was written during phase 1 (last
edit stamped below) because this lane has no guarantee of a turn at the boundary and push is durability. If a
turn comes in phase 2, the "Refutations" section is finalised then; if not, **what is below is this lane's
phase-2 position as of the stamp**, and nothing in it is a new finding.

Refutation ids are `R6-<n> → E<lane>-<m>`; each must name the target and the falsifying measurement with the
line opened. A refutation costs the refuter the finding's points if rejected, so none is filed on suspicion.

## Branches read

`origin/exec3/review-functionality-r2` at `7d75419b` (11:03 IST) · `origin/exec5/review-ux` at `cdffa421`
(11:03) · `origin/exec4/review-ui` at `bf928c83` (10:59) · `origin/exec1/review-ui-r2` at `8dcf2cfb` ·
`origin/exec2/review-ux-r2` at `ad054454` — headings of all five read; exec 3's round-2 findings E3-9 … E3-21 read
in full for E3-14, E3-15, E3-18, E3-19, E3-20, E3-21; exec 5's E5-13 read in full.

## Candidates examined and NOT refuted — with the reason, so the judge can see the work

| target | what I checked | verdict |
|---|---|---|
| **E3-14** (claimed Critical — five cookie-authenticated mutating routes outside `HTTP_ORIGIN_PROTECTED_ROUTES`) | Opened `apps/server/src/http/http-origin.ts:128-172`. Two of the five (`POST /v1/invites/:token/accept`, `PUT /v1/me/preferences`) are **recorded exclusions with reasons and owners** in that docblock (*"excluded here rather than silently omitted"*), and the docblock's own pricing of the accept variant — *"a workspace they can leave"* — is the reasoning the Critical rests on for `/v1/me/invitations/:inviteId/accept`. The other three routes are genuinely unmentioned. | **Valid for three routes, and the recorded exclusion of the other two is weaker than it reads**: its reasoning — *"a workspace they can leave"* — is measured false in my E6-21 (a member or guest cannot revoke their own membership; only an admin can), which makes the forced join E3-14 describes permanent from the victim's side. Not a refutation; the opposite — a connected finding. My E6-15 is the read-side complement (`/v1/stream`), measured independently. |
| **E3-18** (Important — replica answers `restricted` for a dangling parent; online answers `null`) | Opened `replica-data-source.ts:1164-1175` and `routes/tickets.ts:400-404`; the divergence is as stated and their probe is reproducible in shape. | **Valid.** The sub-claim *"it can [distinguish absent from not-delivered]"* is doubtful — a guest's replica holds no row for a parent it may not see either, and `reconcile` answers `restricted` for both — but a doubtful remedy is not a false finding. |
| **E3-19** (Important — a child can be moved *out* of terminal under a terminal parent) | `transition.ts:132-142` guards only the terminal-**entering** direction, as they say. Adjacent to my E6-8 (republish promotion), different door. | **Valid; independent of E6-8.** |
| **E3-20 / E3-21** (stale ❌ cases 6.82 and 6.84) | Same class as my E6-12 (6.51, 6.77, 6.123). On 6.84 I had judged the ❌ still true of the *projection's own* robustness and declined to file; exec 3 files it on the door's refusal (`hierarchy.ts:124`, ruling P12). | **Valid as filed; different reading of the same line, not a falsification.** |
| **E5-13** (claimed Critical — `/account` PUTs a guessed notification-preferences document after a failed read) | Browser-reproduced with a mocked `fetch`; source lines at `account/page.tsx:81`, `:215-232` as cited. | **Valid.** Not this lane's to re-measure; the wire half (a whole-document PUT) is the gateway's stated contract. |
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

## Refutations

_None filed as of the stamp below. If a phase-2 turn comes, this section is revisited against the branches'
final pushes; a refutation without a falsifying measurement will not be added._

**Stamp:** written 2026-09-21 11:25 IST, E3-14 row amended 12:00 IST after E6-21; phase 1; branch heads as listed above.
