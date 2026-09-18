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

### 1. The wire-gap screens — HELD (owner, 2026-09-18)

Seven screens from the 2026-09-18 prototype delta audit whose prototype controls have no server
behind them. Each is server + mapper work, i.e. the most expensive category in the queue.

| Screen | What is missing |
|---|---|
| `isInbox` | the filter and the bulk actions |
| `isTypes` | reorder and per-type counts |
| `isWorkflows` | a badge and a second action |
| `isMcpTokens` | row names (the issue-token flow itself is separately ruled out) |
| `isInvite` | three read fields |
| `isMcpAuth` | scopes, client, and the deny route |
| `isWorkspace` | project description, chips, delete |

The owner did **not** pick any of them. Do not dispatch one, and do not treat "the owner named a
different wire-gap" as a precedent for the rest.

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
