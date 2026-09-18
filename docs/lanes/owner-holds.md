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

### 1. The wire-gap screens — **PARTLY LIFTED 2026-09-19.** Read the per-row status.

Seven screens from the 2026-09-18 prototype delta audit whose prototype controls have no server
behind them. Each is server + mapper work, i.e. the most expensive category in the queue.

**The owner answered all seven, row by row, on 2026-09-19.** **Four rows are now LIFTED and three remain
HELD — do not dispatch a `HELD` row, and do not treat a lifted row as licence for a held one.**

| Screen | What is missing | status |
|---|---|---|
| `isInbox` | the filter and the bulk actions | **HELD** |
| `isTypes` | reorder and per-type counts | **LIFTED 2026-09-19 — both halves approved** |
| `isWorkflows` | a badge and a second action | **SPLIT: the badge is DROPPED (not held, not to be built); the second action is LIFTED with version history (§9.1) as ONE decision** |
| `isMcpTokens` | row names (the issue-token flow itself is separately ruled out) | **HELD** |
| `isInvite` | three read fields | **HELD** |
| `isMcpAuth` | scopes, client, and the deny route | **HELD** |
| `isWorkspace` | project description, chips, delete | **HELD** |

**The rule this section was written for still stands for the three HELD rows**: the owner picked them
individually, so do not generalise from the lifted ones.

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

### 2. `McpAuthorize` and `McpTokens` — HELD (owner, 2026-09-18)

The last two screens of `hig-per-screen/10`, both wire-gap by the same audit. This is why that ledger
row cannot close: Help, Legal and NotFound all ship, and these two do not. Same hold as §1.

### 3. The legal copy placeholders — HELD (owner, 2026-09-18)

`/privacy` and `/terms` ship with bracketed placeholder text where the real legal wording goes. Step
2c-2 (#428) ported the chrome and deliberately left the copy untouched. This is a content gap only the
owner can close; the owner's instruction was **"9 - hold these for now."**

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
  record `successText` on `success` as 4.40 / 5.40, computed against pure white; the light theme has
  shipped `onColorWarmLight #fbf7f3` as that ground since 2026-09-16, against which the same hexes
  measure 4.1233 / 5.0662. The decision survives; the arithmetic does not.

**The catalogue rows stay `❌` and are not edited by this hold.** The hold says *do not fix*; it does
not say *stop recording*. A future session that fixes the CSS closes the case by the normal route.

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

### `test-cases/13-deployment-dogfooding.md` is to be **SPLIT** — **yes** (2026-09-19)

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
