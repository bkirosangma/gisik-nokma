# Owner holds — the register

Items the owner has **explicitly put on hold**. Nothing here is dispatched, planned, or "picked up
while we're in the area" by a controller or an executor session.

**The rule: an item leaves this register only when the owner names it.** A hold does not decay, does
not lapse because a ticket was already open, and is not lifted by an entry in some other document. If
a session believes a hold is stale, the correct action is to ask once, by name, in a report — never to
act on the belief.

This file exists because a decision held only in a chat message has no owner and no scope. It was
created 2026-09-18 on the owner's instruction: *"mark all those on hold and keep somewhere so we can
revisit them."*

---

## Held

### 1. The wire-gap screens — **ALL SEVEN LIFTED, 2026-09-19 LATE.** Nothing here is held any more.

Seven screens from the 2026-09-18 prototype delta audit whose prototype controls have no server
behind them. Each is server + mapper work, i.e. the most expensive category in the queue.

**THIS SECTION DISAGREED WITH ITSELF UNTIL 2026-09-19 ~15:5x IST, AND WITH THE RULINGS BLOCK — recorded
rather than tidied away, because the disagreement is the reason a whole tranche sat still.** Its intro
said *"Four rows are now LIFTED and three remain HELD"* while its own table showed one lifted, one
split and five held; and **`docs/lanes/controller-state.md`'s rulings block (item 6) had already
recorded the owner saying the other five were no longer held.** The table above the disagreement was
never updated from the owner's later sitting. **The owner resolved it directly on 2026-09-19 late,
shown the five screens running: _lift all 5 and queue them up_.** That is the authority for every
`LIFTED` in the table below.

| Screen | What is missing | status |
|---|---|---|
| `isInbox` | the filter and the bulk actions | **LIFTED 2026-09-19 late — owner: "lift all 5 and queue them up"** |
| `isTypes` | reorder and per-type counts | **LIFTED 2026-09-19 — both halves approved, and both BUILT (Tasks 6/7 `#505`, Task 8 `#513`)** |
| `isWorkflows` | a badge and a second action | **SPLIT: the badge is DROPPED (not held, not to be built); the second action is LIFTED with version history (§9.1) as ONE decision — BUILT (`#506`)** |
| `isMcpTokens` | row names (the issue-token flow itself is separately ruled out) | **LIFTED 2026-09-19 late — owner: "lift all 5 and queue them up"** |
| `isInvite` | three read fields | **LIFTED 2026-09-19 late — owner: "lift all 5 and queue them up"** |
| `isMcpAuth` | scopes, client, and the deny route | **LIFTED 2026-09-19 late — owner: "lift all 5 and queue them up"** |
| `isWorkspace` | project description, chips, delete | **LIFTED 2026-09-19 late — owner: "lift all 5 and queue them up"** |

**The old rule that stood here — *"the owner picked them individually, so do not generalise from the
lifted ones"* — is DISCHARGED, and it is kept only as the record of why the five sat still.** It was
written when the lifting was per-row. **The owner has now lifted the remainder as a group, by name, so
there is nothing left to generalise FROM.** What still binds is the per-screen scope: **`isMcpTokens`
excludes the issue-token flow (separately ruled out), and `isWorkflows`' badge is DROPPED, not
deferred.** A lifted row is a licence to build **that row's column and nothing beside it.**

**A lift is not a door.** These are server + mapper changes, and this repo refuses both "a second door
to one thing" and a widened route that answers a different question — **so each screen's dispatch
requires the DOOR to be measured and, where it is a new route, a migration, or destructive surface,
RULED before it is built.** The lift removes the hold; it does not pre-approve an interface.

#### THE DOORS, RULED — owner, 2026-09-19 late: _go with all recommended_

**Measured first, by a read-only reconnaissance across all five screens**
(`gisik-nokma-lanes/EXEC-RECON-2026-09-19-five-doors.md`), whose headline was that **three of the five
starting rows in the 2026-09-18 audit did not survive re-measurement.** The owner then approved the
recommended set in one word, and **the table below is the authority for what may be built on these five
screens.** Fifteen items: **nine BUILD, four DECLINED, one NOT NOW, two already built — NOTHING HELD, and nothing awaiting anything.** Every item is settled; the last two (`isInvite` inviter identity, then its member count) were ruled the same evening, the second after being measured.

| screen | item | ruling | the door |
|---|---|---|---|
| `isWorkspace` | **description** | **BUILD** | `MIGRATION` — `projectCreatedPayload` is `.strict()`, so payload, projection, read and render move together, and **every `ProjectRef` construction site must carry it** or the field arrives `undefined` on some route |
| `isWorkspace` | **rename** | **BUILD** | **NO NEW DOOR** — `workspace.renamed` already exists in the vocabulary with **zero client UI**. The cheapest item in the reconnaissance |
| `isWorkspace` | **delete** | **DECLINED** | destructive, and **the prototype refuses it itself** — its own button is a no-op toast: *"that is irreversible, so it is disabled here"*. Building it would **exceed** the design, not implement it |
| `isInbox` | **filter** | **BUILD** | `ADDITIVE FIELD` on the existing read; `workspaceId` is the precedent |
| `isInbox` | **bulk + Undo** | **BUILD** | `NEW ROUTE` + CSRF registration — and the audit was **WRONG** here: `markRead` is one-way, so there is **no unread door at all** and the prototype's Undo has nothing behind it |
| `isMcpTokens` | **row name** | **BUILD** | `MIGRATION` + a new owner-scoped write. **The ruled-out issue-time flow is NOT required** — the name is set *afterwards*; `mcp_tokens` has no `name` column and both insert paths confirm it |
| `isMcpTokens` | **Revoked badge** | **NOT NOW** | it implies **soft-delete** — revoke is a hard `DELETE` today. A behaviour change, not a display change |
| `isInvite` | **expiry** | **BUILD** | `ADDITIVE FIELD` — and it is **already in hand**: `openableInvite` reads `expires_at` and throws it away |
| `isInvite` | **decline** | ✅ **DONE — ALREADY BUILT. NOTHING TO BUILD.** | **This row has been wrong FOUR times, and the fourth correction closes it.** It was ruled `BUILD / NEW ROUTE / against invite_tokens.status` — wrong on all three. Corrected to *"the route exists and the client door is refused on purpose"* — right, but incomplete. **Now measured: a working Decline control already ships.** `apps/web/app/workspaces/page.tsx:543` (`aria-label={\`Decline the invitation to ${workspace}\`}`), wired at `:455` to `myInvitations.decline(...)`, through the gateway at `packages/app-core/src/online/my-invitations.ts:151-155`. **Task 17 built it.** ⚠ **The row was written from a recommendation rather than a measurement, twice in the same direction — this is the standing lesson it leaves.** |
| `isInvite` | **inviter identity** | **BUILD — name + role, AUTHENTICATED ONLY** | ruled by the owner on elaboration, 2026-09-19 late: **the inviter's name and role, shown only to an authenticated recipient** on the accept path — **never on the session-less token page, and NO email anywhere.** `proj_invites.invited_by` already records the inviter; note `invite.sent`'s payload carries **no inviter**, so it comes from the event's **ENVELOPE ACTOR** |
| `isInvite` | **member count** | **DECLINED** | measured, then refused by the owner. **No door exists:** `visibleMemberCount` (`read/workspace-counts.ts:146`) takes a resolved `EffectiveRole` and returns `null` when there is none — and the invite page has **NO SESSION**, so a count there would be a **NEW anonymous read**, not an additive field. **And that same function returns `null` for a GUEST** (`:151-153`): building this would disclose more to an unauthenticated holder of a forwardable URL than the product discloses to an authenticated person **inside** the workspace. The page already gives a link-holder the workspace **name** and the **role offered** — those are about the OFFER; a count is a fact about the workspace's SIZE, on a bearer URL |
| `isMcpAuth` | **deny** | **BUILD** | `NEW ROUTE`, a sibling of approve — **do not extend approve with a `deny` flag**; that is one route answering two questions |
| `isMcpAuth` | **scopes** | **DECLINED** | it **contradicts the shipped consent model** — the file's own docblock: what is granted is *"a credential that acts AS this person"*, not a scope, and no scope column exists |
| `isMcpAuth` | **displayed code** | **DECLINED** | it **inverts who holds the code** — the browser would receive a credential-adjacent secret it deliberately never sees |

**A DECLINE here is a decision, not a hold** — the same distinction §3 draws for the legal copy. These
are settled product positions, and **a later session must not surface them as gaps to close.**

#### THE CAPABILITY SWEEP'S ONE OPEN ITEM, RULED — `/v1/search`'s `matchedIn`

**The capability sweep's triage closed everything but one item, and the owner ruled it on 2026-09-19
late: _change the query so `matchedIn` is derivable._**

**What the item is.** `GET /v1/search` is a **working full-text search over ticket titles, descriptions
AND comments** (`routes/search.ts`, reading `proj_search`): `websearch_to_tsquery` against a `tsv`
tsvector, ranked by `ts_rank_cd`, with a `ts_headline` snippet. **The client calls it and then refuses
the answer** — `mapSearchHits(_raw): never` (`mappers.ts:1711`), registered in `SERVING_GAPS` — because
the route squashes all three columns into **one** headline:

```sql
ts_headline(…, s.title || ' — ' || s.description || ' — ' || s.comments, …) AS snippet
```

so **which field matched is not recoverable from the response**, and `SearchHit.matchedIn`
(`view-types.ts:476`, `'title' | 'description' | 'comment'`) is *"the whole of it — a hit that claimed
`matchedIn: 'title'` because that is the commonest case would be this client inventing the answer to the
one question the field asks."* **And no view calls `.search(` at all** — so the search is built, indexed
and served, and unreachable.

**⚠ THE FAVOURABLE DETAIL, MEASURED: THE PROJECTION IS ALREADY COLUMN-AWARE, SO THIS IS A QUERY
CHANGE AND NOT A MIGRATION.** `proj_search` stores `title`, `description` and `comments` as **three
separate columns**, and its generated `tsv` already weights them apart —
`setweight(… title …, 'A') || setweight(… description …, 'B') || setweight(… comments …, 'C')`. **The
distinction the client needs is already in the data; it is the SELECT that throws it away.**

**⚠ AND `matchedIn` IS A SINGLE VALUE, NOT A LIST** — so a query matching two columns needs a
**documented precedence**, and the weights' own order (title → description → comment) is the one the
schema already implies. **A derivation with no stated precedence is the same defect one layer down.**

**The board's "Search the board" box is NOT this** — it is a `FilterSpec.text` axis narrowing the rows
already loaded. It works today and is untouched by this ruling.

#### THE TICKET SHEET, RULED — owner, 2026-09-19 late

**Raised by the owner's own correction.** The controller had compared the ticket sheet's *container*
(`.gn-sheet__scrim`) and called it a match; the owner said *"not just the container. the entire. how the
ticket is displayed. how the fields description etc are."* The follow-up reconnaissance is
`gisik-nokma-lanes/EXEC-RECON-2026-09-19-ticket-sheet.md`, and **it refuted half the controller's own
headline**, which is why it is worth reading in full.

| item | ruling | evidence |
|---|---|---|
| **Assignee** | **BUILD — editable.** Owner: *"assignee should not be read only."* | `SERVER EXISTS → SURFACE`. `ticket.assigned` is wired end to end — payload `events/ticket-events.ts:50` (an UNASSIGNMENT is the same event with `null`), projected `projections/tickets.ts:436,466`, a read `read/assigned-provenance.ts`, fan-out `notifications/fanout.ts:225`, synced `sync/snapshot-writer.ts:95`, and an MCP write tool `mcp/write-tools.ts:167-173`. **The web renders it read-only at `ticket-sheet.tsx:573`.** |
| **Description** | **BUILD — editable.** Owner: *"description should be editable."* | `SERVER EXISTS → SURFACE`, **and the fix is a PROP, not a door.** The door exists (`compose-editor-submission.ts:14,29`), the sheet already submits `ticket.field_set` (`ticket-sheet.tsx:284`), and the editor has both modes — **but the mount is `readOnly` (`:581`) and the web never passes `editorSlot`** (`page.tsx:2346-2353`), so the real editor never mounts at all. **One mount, four gaps.** |
| **State dropdown** | **REFUSED — no second door** | The chip + "Move…" and a dropdown are **two presentations of the same legal-transition set**. A restyle, not a gap. |

**⚠ THE FINDING THAT EXPLAINS MOST OF THE SHEET, and it is one line:** the web mounts `TicketSheet` at
`page.tsx:2346-2353` with **six props and NONE of the four optional ones** — no `editorSlot` (so the real
editor never mounts and the description falls back to `readOnly`), no `attachments` (so `<AttachmentList>`
renders empty), no `uploadEvidence`, no `visibility`. **One mount, four gaps.**

**⚠ THE COMMENTS CORRECTION — the controller's own headline was WRONG and is recorded wrong here.**
`comment.added` is fully wired on the server (vocabulary `:195`, state machine, projections, search index,
mention fan-out, sync, and a `require-comment` seed rule). But the claim *"no UI anywhere"* is **false**:
**mobile has a Comment button** (`apps/mobile/src/screens/ticket-screen.tsx:44`), the MCP server has a
comment tool, and both contest banners can resolve as `converted-to-comment`. **The accurate position is:
fully supported on the server; the WEB has no composer; and no screen anywhere renders a comment THREAD**
(`<EditorSlot>` is mounted in exactly one place repo-wide, the read-only description). **The product's own
FAQ already says so in the user's words — `docs/faq.md:415-421` — and calls it backwards.**

#### The 2026-09-19 rulings, verbatim, and what each means

| item | owner's answer | effect |
|---|---|---|
| `isTypes` **reorder** (↑/↓) | **yes** | build it. `rank` already exists on `TicketTypeDef` and `rank.ts` already computes the hierarchy implications, so this is likely **a route and a gateway method over data that already exists** |
| `isTypes` **per-type counts** | **yes** | build it. **This one needs NEW server surface**: the only population read is pinned to one workflow (`WHERE … workflow_id = $3`), which the screen itself records would print a WRONG number |
| `isWorkflows` **status badge** | **drop it** | not built, and recorded as a **named absence** — not as an outstanding gap. The read serves only published workflows, so a field holding one value would be a badge that lies by omission |
| `isWorkflows` **second action** + **version history** | **yes** | **ONE decision, one task.** The version chain is already readable (route `?version=`, `data-source.ts:146` `version?: number`); the web adapter drops the argument at `data-source-gateway.ts:224` and **no history screen exists** — so this is the first port that draws a screen the prototype does not |

#### And one product question outside this register, ruled the same day
**`Attachment` as a custom field kind — NO.** `CUSTOM_FIELD_KINDS` is `['text','number','date','select','person']`;
the prototype's `Text/Date/Number/Attachment` is a **different set, not a superset**, and adding `Attachment`
decides whether a custom field can hold a file. **Recorded as a deliberate absence** in
`packages/domain/src/ticket-types.ts`'s docblock and in the ticket-type editor's — a reader comparing the two
must find the reason, not a silence.

### 2. `McpAuthorize` and `McpTokens` — ~~HELD (owner, 2026-09-18)~~ **LIFTED 2026-09-19 late**

The last two screens of `hig-per-screen/10`, both wire-gap by the same audit. This is why that ledger
row could not close: Help, Legal and NotFound all ship, and these two did not. Same hold as §1 —
**and it is lifted with §1's, by the same words** (*"lift all 5 and queue them up"*, the owner shown
both screens running). **The `hig-per-screen/10` ledger row is now blocked only by the work, not by a
hold** — `isMcpTokens`' row names still need a naming door and a migration, which is a door ruling and
not part of the lift.

### 3. The legal copy placeholders — ~~HELD (owner, 2026-09-18)~~ **A DECIDED STATE, 2026-09-19**

`/privacy` and `/terms` ship with bracketed placeholder text where the real legal wording goes. Step
2c-2 (#428) ported the chrome and deliberately left the copy untouched. The owner's 2026-09-18
instruction was **"9 - hold these for now."**

**This is no longer a hold. On 2026-09-19 the owner closed it as a decision: _"leave the legal copies as
is."_** The distinction matters and is the reason the original sentence is kept above rather than
struck: **a hold is work waiting on an owner; a decided state is a settled product position.** Nothing
here is outstanding, nothing is owed, and **no future session should surface it as blocked or as a gap
to close.** The placeholders stay, deliberately, and the code comments that explain them stay with them.

### 4. The contrast debts — HELD (owner, 2026-09-18)

Four cases minted by Step 4b (#431), each `❌` by construction (no commit performed the work; the fix
is the deliverable). The owner was shown the exact locations and ratios and answered: **"leave the
contrast debts on hold as well. record it."**

- **`13.690`** — `contested` is read text on `surface` and measures **4.3746** against AA's 4.5.
  `packages/ui/src/ui.css:2602` (`.gn-sync-status-bar__failed`), in a bar whose background is
  `var(--gn-surface)` at `0.85rem` normal — 13.6px text, so the floor is 4.5, not 3. The existing gate
  cannot see it because the roster's `contested` row is `{fg: 'contested', bg: 'surface', minimum: 3}`
  — the marker tier — and 4.3746 clears 3. `hig`/`minimal` light: `warmPaper #efe7df` under
  `magenta600 #d30f45`. `neo` light already ships `neoLightContested #9a3054` clearing at 6.0238.
- **`13.691`** — `warning` on `surface` measures **4.2485** and **no roster row names the pair**.
  `amber700 #b25000` on `warmPaper #efe7df`. The only `warning` row is `{fg: 'warningText', bg:
  'warning'}` — a different pair that cannot fail from this one being wrong, which is why it reads as
  guarded.
- **`13.692`** — `danger` on `surface` measures **4.4013**, also unguarded. `red600 #d70015` on
  `warmPaper #efe7df` — the closest to the floor and still under.
- **`13.693`** — not a contrast failure: a stale calibration docblock. `tokens.ts:36-38` and `:117`
  recorded `successText` on `success` as 4.40 / 5.40, computed against pure white; the light theme has
  shipped `onColorWarmLight #fbf7f3` as that ground since 2026-09-16, against which the same hexes
  measure 4.1233 / 5.0662. The decision survives; the arithmetic does not. **CLOSED 2026-09-19** — the
  owner named this lift (*"lift it"*), both docblocks now state the shipped ground, and the catalogue
  row is `✅`.

**The three contrast-debt catalogue rows (`13.690`–`13.692`) stay `❌` and are not edited by this
hold.** The hold says *do not fix*; it does not say *stop recording*. A future session that fixes the
CSS closes the case by the normal route — which is what happened to `13.693`, whose lift the owner
named on 2026-09-19 and which a commit closed the same day.

---

## Decided the same day — NOT held

Recorded so that this register is not mistaken for the whole of the owner's 2026-09-18 rulings. These
came from the controller's decision list of 2026-09-18, answered item by item.

| Item | Owner's answer | Effect |
|---|---|---|
| `isTypeEditor`'s `required` toggle | **yes** | fields gain `required`; the blocked port unblocks |
| Members / InviteAdmin | **yes** | the sign-in hold is **lifted**; these screens may be built |
| `isBuilder` (workflow builder) | *"there for design reference only… make the design just fit for it"* | fit the design to the **existing** backend; invent nothing |
| The second wave (spec §8, 12 tasks) | *"make the plan with the controller… claude is already out of limits"* | proceeds under the **DeepSeek controller**, not a Claude session |
| The three `claimed` ledger rows | **accept** | `shared-select-phase-1/10`, `/12`, `workspaces-prototype-port/0` → `done 422 56b79e3a` |
| Older items (Task 4's look, the two 2c Help passages, "five things", the invite line, the emulator images, the audit's product-scope wishlist) | *"this is already done"* | dropped; not tracked here |

---

## Ruled later the same day — 2026-09-18, second sitting

Two of the three questions the controller had left outstanding were answered directly. Both are
**decisions that create work**, not holds, and both are recorded here so the register is not mistaken for
the whole of the owner's rulings.

### 1. An admin may NOT demote a non-last owner — **"no"** (2026-09-18)

> Owner, verbatim: *"may an admin demote a non-last owner: **no**."*

**This closes a door the membership role guard deliberately left half-open.** The guard
(`docs/superpowers/plans/2026-09-18-membership-role-guard.md`, shipped 2026-09-18) closed two things: a
workspace losing its **last** owner (`last-owner`), and an admin **granting** `owner`
(`grant-owner-requires-owner`). Neither covers **demoting an owner while another owner remains** — so an
admin can still do it today, and the projection overwrites on conflict.

**The consequence is a rule change, not a UI change:** changing any member's role **to or from `owner`**
becomes an **owner-only** act. An admin keeps moving members between `admin` / `member` / `guest`.

**It also narrows the roster's role control** (drawn 2026-09-18, cases 13.824–13.828): an admin must not
be offered a role change that removes `owner` from a row. Whether the control can already build such a
payload is **to be measured, not assumed** — that claim was wrong once already in this exact file.
Dispatched as `CTL-DISPATCH-2026-09-18-owner-demotion-guard.md`.

### 2. Build `scripts/check-migration-order.mjs` — **"yes"** (2026-09-18)

> Owner, verbatim: *"build scripts/check-migration-order.mjs: **yes**."*

**The measured need:** a reviewer reverted a migration rename on 2026-09-18 and the full 1,548-test server
suite passed — nothing in the repository pins migration ordering, and the forced gate **structurally
cannot** (a fresh test database applies every migration cleanly in numerical order). The hidden failure is
not benign: the hot stack applies migrations only at container start and **its entrypoint aborts on a
failed migration**, so an out-of-order prefix takes the app down — which it did.

Dispatched as `CTL-DISPATCH-2026-09-18-migration-order-check.md`.

### 3. The attention strip takes the prototype's whole treatment — **both rulings** (2026-09-18)

> Owner, verbatim, in two answers: *"i want the prototype's visible heading adopted"* and, on the
> follow-up, *"yes to the prototype's tint fill too."*

This is **one decision landing as a whole**, not two: the delta table's own argument is that taking the
tint fill while leaving the heading off *"produces a treatment the prototype does not draw and the product
never chose, which is a third thing, invented"*. Rows 1–6 of Part 2 land together.

**It supersedes the `.gn-attention` left-border ruling, and the record must not be read as an overturned
measurement.** `task-ledger.tsv`'s `7a`/`8a` rows carry a 2026-09-18 ruling that the 4px left border
*"carries an affordance"* and is not debt, confirmed by Step 5b's sweep at **4.36 against a 3:1 floor**.
**That subject was contrast debt, and its answer was no — it stands.** What the owner has decided is that
the border goes as a **design choice**, which is a different question with a different decider. Both rows
now say so, in those words.

Dispatched as `CTL-DISPATCH-2026-09-18-attention-part2-heading.md` + `…-amendment-1.md`. The amendment
also pulls in the consequences: the non-text-contrast roster's `aside.gn-attention` entry re-measured (its
`border: rgba(178,80,0,1)` reading **is** this border), and `packages/ui/src/tokens.ts`'s
`--gn-tint-warning` single-consumer note corrected — the strip is the role's **second** consumer and does
not sit at page level, so it must re-establish the composite condition rather than inherit it.

### Ruled earlier the same day, and now closed

**`hig-per-screen/3a` closed as superseded by `#443`** — *"for 3a. go with your recommendation."* The row
is `done`, evidence `#443`'s merge commit `ba96a8d2`; its one verifiably-absent deliverable (the `.gn-field`
form wrapping) moved into the `members-styling` dispatch by amendment. `3b` was **not** covered by that
ruling and stays `todo`.

---

## 2026-09-19 — the register's §1 answered row by row, and one repo-structure decision

The owner answered **all seven** questions the controller put by name, in one message. **Six are recorded
above** (§1's table and the `Attachment` ruling). The seventh is not a hold and is recorded here:

### `test-cases/13-deployment-dogfooding.md` is to be **SPLIT** — **yes** (2026-09-19) — ✅ **LANDED**

> **DONE, and this section described it as outstanding for ~17 hours.** The split landed at **`8d144483`**
> (2026-09-19 01:18:44 IST, *"The catalogue's §13 bucket is one index and eleven part-files, not one
> file"*). `13-deployment-dogfooding.md` is now a **145-line index** over **eleven part-files**, with a
> **shift map** re-pointing all seven line-precise citations; **no id was renumbered and exactly one of
> 12,638 moved lines differs** (a citation re-point, forced by the move). Both readers were updated and
> the counts are reconciled — `check-case-ids.mjs` reports **23 files scanned, 2406 unique ids, union ==
> sum**. **The shape chosen was per-section, not per-task.** Everything below is kept as the ruling's own
> record of what was required; **do not re-do it.**

**The measured need:** that single file was touched by **104 commits today** across 71 merges, and it
conflicted on essentially every merge *pair* — including both merges the controller made in the final
hour. Each conflict costs a rebase, an independent audit and a re-gate; it is the most frequent single
source of rework in the queue.

**What "split" means is NOT yet decided** — per-task files and per-section files are both live readings.
**The brief that does this work must name which shape it takes and why**, and it must update every reader
of the file (`check-case-ids.mjs`, `check-case-citations.mjs`, the citation ratchet, the roster header)
rather than leaving one pointed at a file that no longer exists. **A checker that silently finds fewer
files is the failure mode this repo catalogues most**, so the split's own PR must show the counts before
and after and reconcile them.

**Sequencing, and it matters:** the split **must land before the newly-lifted feature work**, because that
work appends cases to this file and would collide with a structural move underneath it.

**Nothing is open for the owner** — as of 2026-09-19 every question this register, the decision list and the
controller's escalations have put to them has been answered.
