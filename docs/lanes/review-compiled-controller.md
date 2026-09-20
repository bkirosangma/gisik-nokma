# COMPILED REVIEW RULINGS — the controller's answer to all three reports

**Controller session:** woken 2026-09-21, backend `deepseek-flash[1m]`, working tree
`/Users/kiro/my_projects/gisik-nokma-ctl` on `ctl/cycle35-review-compiled`, cut from `origin/main`
`33f1438616792331e8f0d5727cf49ea70bbebdb2` (the cycle-34 anchor, PR #624).

**This document rules on every criticism raised by the three-reviewer exercise** (owner-ordered
2026-09-21; spec in `docs/lanes/controller-state.md` cycles 31–34). **Nothing here is a fix and nothing
was built.** An ACCEPTED ruling states what *would* be done, precisely enough that a later exercise
executes it without re-deriving the finding.

## The three reports, collected at pinned shas

| lane | concern | branch | sha | size | findings |
|---|---|---|---|---|---|
| exec 1 | UI | `exec1/review-ui` | `ebcca2b50e5c` | 64,835 B | 18 |
| exec 2 | UX | `exec2/review-ux` | `2eddb291773a` | 69,827 B | 19 |
| exec 3 | features / functionality | `exec3/review-functionality` | `5e039f45652b` | 50,910 B | 8 |

⚠ **exec 1's report was superseded mid-collection.** The copy first pushed was `d53161a1` (50,696 B,
16 findings); the lane then continued and pushed `ebcca2b5` (64,835 B, 18 findings) — adding `P12`,
`P13`, growing `P1` from six members to seven, and correcting its own severity arithmetic from
`1 + 8 + 8` to `1 + 8 + 9` against eighteen findings. **This document rules the final copy.**
`exec2/review-ux` did not move (`04a5fc30…`, byte-identical to the copy read).

---

# 1. THE COUNTS — asserted, with members named

**Raised = 45.** `accepted + accepted-deferred + rejected = 45`.

| lane | raised | ACCEPTED | ACCEPTED-DEFERRED | REJECTED |
|---|---|---|---|---|
| exec 1 (UI) | 18 | 18 | 0 | 0 |
| exec 2 (UX) | 19 | 19 | 0 | 0 |
| exec 3 (functionality) | 8 | 7 | 1 | 0 |
| **TOTAL** | **45** | **44** | **1** | **0** |

**Members, so the numbers are checkable rather than asserted:**

- **exec 1 — 18:** `I1` `I2` `I3` `I4` `I5` `P1` `P2` `P3` `P4` `P5` `P6` `P7` `P8` `P9` `P10` `P11`
  `P12` `P13`. Its own severity split is 1 Critical / 8 Important / 9 Minor = 18.
- **exec 2 — 19:** `F1`–`F9` (9), `V1`–`V6` (6), `V7`–`V10` (4). Its own split is 2 Critical /
  11 Important / 6 Minor = 19.
- **exec 3 — 8:** `F1`–`F8`. Its own split is 0 Critical / 3 Important / 2 Medium / 3 Low = 8.
  ⚠ **exec 3's §7.6 (migrations never applied incrementally) is NOT counted**: exec 3 labels it
  *"Observation, not a defect"*. It is carried in §5 below instead.

### Why zero rejections — and the three I considered rejecting

A reader is entitled to be suspicious of a 44/45 acceptance rate. **Zero is a finding about the
reviews, not a courtesy**, and the audit trail is these three near-misses:

1. **`exec1-P5`, the product half.** The criticism has two halves; the *product* half (the subtask
   form ships title-only) is defensible — the owner's sentence carries an `or`, and the
   deepest-legal-type default delivers the first clause. **I rejected the product half and accepted
   the record half**, which is why `P5` is ACCEPTED as one finding with the product change *not*
   ordered. Where a finding's halves point different ways I have said so in the ruling.
2. **`exec1-P1`'s implied severity.** Read as a tap-target violation it would be wrong — exec 1
   itself measured the one member it could check at paint (`a.gn-nav__signin`, 77×44,
   `offenders=0`). **I accept it strictly as a *styling* defect and explicitly reject any reading of
   it as a floor violation.**
3. **`exec1-P13`'s WCAG citation.** The claim "no bypass mechanism" is false for assistive-tech
   users — the product renders `<main>` on every content route, which exec 1 verified and conceded.
   **I accept it only in exec 1's own narrowed form** (the keyboard-only, non-AT user). I did not
   reject it because the remedy is ~10 lines and the affected user is real.

**No finding was rejected outright.** Every one names a file, a line, and a measurement, and my own
spot-checks (below) reproduced them.

---

# 2. WHAT I VERIFIED MYSELF, AND WHAT I INHERITED

**My rulings rest on the lane's measurement where I say so, and on my own reading where I say so.**
The distinction is stated per finding. I opened the lines for the load-bearing twenty-odd; the
remainder rest on the lane's own controls, which are unusually good.

**Verified by me, in the collection tree at `33f14386`:**

| finding | my measurement | result |
|---|---|---|
| `exec1-I1` | `gh api …/runs?status=success` → newest success `34023679658` @ `2026-09-06T09:05:54Z`; the 8 most recent runs all `failure` | **confirmed**, sha and timestamp exact |
| `exec1-P1` | comment-stripped selector extraction; all six classes → **0**; controls `gn-board-card__move` → 3, `ticket-type-list__move` → 3 | **confirmed** |
| `exec1-P2` | `gn-board__empty`/`-copy` → **0**; sibling `gn-board__column-empty`/`-copy` → **1** each | **confirmed** |
| `exec1-P8` | `aria-modal="true"` at `dialog.tsx:20` and `sheet.tsx:103`; attribute-level `inert` sweep → **empty**; all 34 raw hits are prose ("the rule is inert", "an inert no-op") | **confirmed** |
| `exec1-P9` | `role="tablist"` `:25`, `role="tab"` `:31`, `aria-selected` `:33`; `onKeyDown\|Arrow\|tabIndex\|aria-controls\|tabpanel` → **none** | **confirmed** |
| `exec1-P12` | source-only `generateMetadata\|metadata` → **exactly 1 file** (`layout.tsx`); `<title>` in source → 0 | **confirmed** |
| `exec2-V1` | `onCreateTicket` in `apps/web/app`+`src` → **0**; control `onOpenTicket` → **8**; `board.tsx` itself → 18 | **confirmed** |
| `exec2-V2` | `members/page.tsx:553` is the only `MintForm` mount, inside the final `else`; `:765-766` `setMinted(result); onMinted()`; `:204-216` both failure arms leave `adminGate.kind==='admin'` | **confirmed** |
| `exec2-V5` | resolver searches `assigned`, `inTransit`, `shared` — **three** arms, under a comment claiming "all four" | **confirmed** |
| `exec2-V8` | `subtasksKey` includes `read.data?.ticket.projectId` (`:591`); `useLiveQuery` `setData(null)` (`:95`) | **confirmed** |
| `exec2-V10` | four `useState`, no latch (`new-ticket-dialog.tsx:96-106`); `:280` gates title/type only; `create-ticket-flow.tsx:212` mints `newUlid()` per call | **confirmed** |
| `exec2-F4(i)` | `canSetVisibility` across `apps`+`packages` → one hit, and it is a **comment** (`page.tsx:2825`) | **confirmed** |
| `exec3-F1` | `grep -c deleted` → `attachments.ts` **5** (claim: ZERO), `tickets.ts` **13** (claim: 6); `ticketIsLive` imported `:10`, called `:388` and `:545` | **confirmed** |
| `exec3-F6` | `${LIVE_TICKET_WHERE}` → 10 lines; `LIVE_TICKET_WHERE,` → 12 lines — **my raw counts differ from exec 3's filtered ones, which is the finding** | **confirmed** (the unit is unpinned) |

⚠ **Two of my own first attempts were wrong and are recorded rather than tidied**, because the class
matters: (a) I ran the case-id guard in the **primary checkout** and read `2567 ids / 24 files` —
honest for that tree, but that tree is **114 commits behind `origin/main`**, so it was not a
measurement of the product; (b) my `inert` sweep returned 34 and looked like a refutation of
`exec1-P8` until I read them and found they were prose. **Both were caught by traversing the same
path as the claim, not by reading my own number harder.**

---

# 3. THE RULINGS — exec 1 (UI), 18 findings

### `exec1-I1` · **CRITICAL** · **ACCEPTED**
**No browser-based UI instrument has executed anywhere since 2026-09-06, and the local gate
structurally cannot run one.** I verified the CI half myself.
**What would be done.** Two separable pieces.
(a) *Executable now.* A **non-browser proxy on the gate**: a selector-level check asserting that no
interactive element's classes lack a rule — the same shape as the existing `DENSE_IN_LIST` liveness
check at `apps/web/test/tap-target-density.test.ts`, needing no browser. Register it with the other
`check:*` scripts and wire it into `ci.yml` beside them. This keeps §4's defect *class* guarded while
CI is dark.
(b) *Not executable by this topology.* Restoring CI is **not a code change**: the runner never
starts — all 14 jobs of run `35529457412` carry `"steps": []` and `"runner_name": ""`, `scope`
completes in 2 s, and `--log-failed` answers `log not found`. That is an account/runner condition.
**Owner action, named rather than escalated as a ruling:** the standing auto-merge authorization
reads *"an independent CI run green"*, and no run has been green since `2026-09-06T09:05:54Z`. Until
the runner is restored, that clause of the authorization cannot be satisfied, and every merge in that
window rested on the local machinery alone.
**Risk of (a).** A new selector-level check will find the six/seven controls in `P1` on its first run
— so `P1` and `I1(a)` must land together, or the gate goes red at birth.
**Rests on.** My own `gh api` measurement; exec 1's `turbo.json` check (`test:e2e` → 0 occurrences,
control: `build`/`test`/`typecheck` present) and its hand-run of the signed-out suite
(`31 passed, 2 skipped`, `EXIT=0`) which shows the instrument works and is simply unwired.

### `exec1-I2` · IMPORTANT · **ACCEPTED**
**The `e2e-stack` contrast roster records a defect fixed eight hours later, with no provenance.**
**What would be done.** At the `writeFileSync` call in `apps/web/e2e-stack/viewport.spec.ts:1006`,
stamp the artefact with the head sha and an ISO timestamp (three lines), and have the file itself
carry a supersession line when a later commit fixes an entry it names. File:
`apps/web/e2e-stack/non-text-contrast-roster.json` + its writer. **Risk:** none — an additive field;
any consumer reading `belowCount` is unaffected. **Follow-on requiring a stack:** whether the *other
two* reds recorded at `8e742d18` still stand is unmeasured — correctly, since `:3001` serves a baked
image predating `main`.

### `exec1-I3` · IMPORTANT · **ACCEPTED**
**`DENSE_IN_LIST`'s stated reason for excluding `.gn-my-work__title` is falsified by its own
docblock.** Clause (b) ("a sweep actually visits the route") holds; the reason actually given is a
*measurement-window* argument.
**What would be done.** Two parts, one now and one conditional.
(i) *Now, no stack needed:* restate the exclusion as what it is — *"excluded because no lane has had
a tree-accurate stack window to measure it; owner: whoever next runs `test:e2e:stack`"* — leaving
clause (b) clean for the cases where it is the real reason. File:
`apps/web/e2e-viewport/tap-targets.ts:82-90`.
(ii) *Conditional:* add the entry and re-baseline **in the same commit** — but only when a
tree-accurate stack exists, because re-baselining against `:3001`'s stale image would bake a wrong
baseline in. Do not do (ii) before `I1`'s runner is restored or a lane holds a real stack.
**Risk.** (ii) done early is worse than not done: it would record a baseline measured on a
different product.

### `exec1-I4` · MINOR · **ACCEPTED**
**`tap-targets.ts` cites a line range that resolves and misleads** (`ui.css:1606-1616` for a sentence
at `:1662-1663`).
**What would be done.** Cite the sentence by **content** — the `".gn-attention__title"` docblock —
rather than by range, which is the remedy `test-cases/16-remaining-doors.md:19` already prescribes
for itself. File: `apps/web/e2e-viewport/tap-targets.ts:43-45`. **Risk:** none.

### `exec1-I5` · MINOR · **ACCEPTED**
**exec 1's own handoff carries two contradicting position blocks, and the pointer that found it is
itself stale.**
**What would be done.** In `docs/lanes/executor-state.md`, collapse to one position block per fact —
the older subtask-affordance block (`:65`) carries a *forward pointer* to the current block (`:27`)
instead of restating the allocation. Any `file:line` citation into a growing file names the **string**
to find. **Risk:** none; this is the file a restarted executor trusts to find its position.

### `exec1-P1` · IMPORTANT · **ACCEPTED** (as styling — **not** as a floor violation)
**Seven interactive controls are styled by no rule at all**, so they paint as raw user-agent chrome.
I reproduced all six original members at 0 selector blocks, with non-zero controls on the same path.
**What would be done.** One shared bare-control reset applied as a class —
`border:none; background:transparent; padding:0; font:inherit; color:inherit` — in
`packages/ui/src/ui.css`, following the shape `button.gn-ticket-sheet__crumb--link` already uses at
`:672`; applied to the seven classes: `gn-board__empty-create`,
`gn-attachment__link`, `add-rule-menu__trigger`, `attachment-item__name`,
`evidence-picker__cancel`, `editor-slot__submit`, `gn-nav__signin`. Land **with** `I1(a)`'s
selector-level check, which is the thing that stops an eighth control joining silently.
**Risk.** One member is already painted-measured and **passing** (77×44, `offenders=0`) — so this is
cosmetic, and a shared reset class changes the box model of every control that adopts it. Prefer a
new class the six/seven adopt explicitly over a global `button` reset, which would reach controls
nobody inspected.

### `exec1-P2` · IMPORTANT · **ACCEPTED**
**The board's whole-board empty state has no prototype counterpart and is the one board empty state
with no styling.** Verified: `gn-board__empty`/`-copy` → 0; the per-column sibling → 1 each.
**What would be done.** (i) Style the three classes (`gn-board--empty`, `gn-board__empty-copy`,
`gn-board__empty-create`) from the prototype's own shared control constant — fill-tertiary +
text-accent + control radius, no border — the same constant `981aa92b` reused for
`.ticket-type-list__move`. (ii) **Record the whole-board banner as a deliberate product addition** in
`Features.md` with its rationale, so a later reader does not "correct" it back toward a prototype
that has no such state. **The divergence itself is hereby ruled** (§4 below): an addition, not a
defect.

### `exec1-P3` · MINOR · **ACCEPTED**
**The parent crumb cannot show the parent's key; the prototype's does; no ruling found.**
**Ruling issued (this closes the category-3 gap).** **The title-only parent crumb STANDS.** Reason:
the wire carries no key for an ancestor — `ParentRef` is `{kind,id,title}`
(`packages/app-core/src/view-types.ts:368-371`) and the server's visible arm is
`{kind:'ticket', id: parentRow.ticket_id, title: titleOf(parentState)}`
(`apps/server/src/routes/tickets.ts:435-436`). Serving it is a three-file change
(`routes/tickets.ts:435`, `mappers.ts:1868-1872`, `view-types.ts`) for a disambiguation case the epic
crumb does not share.
**What would be done.** Record the divergence **with the wire as its reason**, in the dispatch's own
idiom. **Risk of leaving it unrecorded** is the real one: the key is what disambiguates two identical
crumbs, so a future reader will re-open this unless the reason is written down.

### `exec1-P4` · MINOR · **ACCEPTED**
**"the SAME plain span" is not the same span** — the no-callback arm carries no modifier and
inherits `--gn-text-muted`, while the restricted arm carries `--restricted`.
**What would be done.** Reword `ticket-sheet.tsx:1528-1530` **and** `Features.md:77` to *"degrades to
a plain span — the same *shape* the restricted arm uses, though not its ink"*, or give the arm the
modifier. **Do both files** — the sentence is duplicated, and fixing one is how it survived.
**Risk:** none.

### `exec1-P5` · MINOR (product) / IMPORTANT (record) · **ACCEPTED**
**An owner-requested control was neither built nor reported.**
**Ruling.** The **product** half needs no change: the owner's sentence is *"subtask is always at the
bottom. **or at least** have a type selector"*, and the deepest-legal-type default
(`subtaskTypeFor`, `ticket-sheet.tsx:118`) delivers the first clause. **The record half is the
defect.**
**What would be done.** Record the stop-and-report the override asked for — one line in the lane's
handoff or `Features.md`: *"the selector is not built; the deepest-legal-type default satisfies the
owner's first clause."* **Also:** the dispatch's heading (*"THE SUBTASK FORM GETS A TYPE SELECTOR"*)
and its §4 mutation requirement (that an illegal type be absent from the selector) describe an
artifact that does not exist — a dispatch that mandates a mutation for a control it did not order
built. **Owner-facing note, not an escalation:** if the owner wants the selector, it is a small
product task, and the default question ("which type is the default, what happens to the derived-type
guarantee") is his to answer — which is exactly why the override told the lane not to decide it
alone.

### `exec1-P6` · MINOR · **ACCEPTED**
**Mobile: two of three screens have no styling of any kind while the third is themed.**
**What would be done.** Amend the `Features.md:2164` bullet to name which screen is themed:
*"`help-screen` alone is themed (`help-theme.ts`); `board-screen` and `ticket-screen` render with RN
defaults and no palette."* **Risk:** none. The `⚙️` mark and the never-rendered record stay true;
this only stops the themed third from reading as a design system.

### `exec1-P7` · MINOR · **ACCEPTED**
**Desktop's task list has no rules at all** (`.ticket-list`, `__row`, `__title`, `__state` → 0 each).
**What would be done.** Extend the existing `ui.css:3912-3919` note (which already reasons about
`apps/desktop`) to name what it *does* style there, and **either** style the four classes **or**
record it as a named absence with an owner — the shape `Features.md:2169` uses for mobile's missing
push transport. **Risk:** the shell's *recorded, deliberate* unstyled state makes the content's
omission read as the same decision, so the record must distinguish them explicitly.

### `exec1-P8` · IMPORTANT · **ACCEPTED**
**`Dialog` and `Sheet` both declare `aria-modal="true"` and nothing implements containment.**
Verified: the attributes are at `dialog.tsx:20` / `sheet.tsx:103`, and the attribute-level `inert` /
trap sweep is genuinely empty.
**What would be done — and I rule for the cheap arm.** Either implement containment (move focus in on
open, restrict Tab, restore focus to the opener on close) **or drop `aria-modal` to `role="dialog"`
alone**. **Recommended: drop the attribute**, because the current state is the only *wrong* one — it
asserts a property rather than merely lacking it — and the drop is one attribute per component.
**Risk.** Dropping it loses nothing real: nothing implements the modality it claims. If containment
is later wanted, `InfoTip` (`info-tip.tsx:43-47`) is the in-repo model for *justifying* an omission.

### `exec1-P9` · IMPORTANT · **ACCEPTED**
**`SegmentedControl` carries full ARIA tab semantics and implements none of the tab keyboard model**,
in seven render sites. Verified.
**What would be done.** Decide the control's nature and make the markup agree:
- if these are **view switches** (they are — theme, style, tabs in a browser) → `role="tablist"` is
  the wrong role; a group of buttons with `aria-pressed` needs no keyboard model beyond Tab, and
  nothing needs a `tabpanel`; **or**
- if they really are tabs → add arrow-key navigation, a roving `tabindex`, and the
  tab↔tabpanel relationship.
**Risk — and it is specific.** The component's docblock records the roles were kept *"so the
accessible-name ratchet (13.285/13.287) sees no loss"*. **Whichever arm is taken, the ratchet must be
re-run and re-baselined in the same change set**, or the fix reddens it and the next reader reverts
the fix to get green. Blast radius to update: `theme-toggle.tsx:64`, `style-toggle.tsx:74`,
`inbox/page.tsx:406`, `sign-in/page.tsx:292`, `help-browser.tsx:494`, `ticket-sheet.tsx:1915`,
`components.test.tsx:258`.

### `exec1-P10` · MINOR · **ACCEPTED**
**The accessible-name ratchet's unit is an attribute; its failure message claims a property of
assistive tech.**
**What would be done.** Keep the count (it is cheap and does catch a dropped attribute) and reword
the failing assertion at `apps/web/e2e-stack/viewport.spec.ts:719-722` to say what it measured:
*"an `aria-label` attribute left the document; whether it named anything is not what this
measured."* **Risk:** none. Note exec 1 withdrew its stronger version of this finding and recorded
that the code disproved it — the attribute on that `<span>` *is* exposed.

### `exec1-P11` · IMPORTANT · **ACCEPTED**
**The `Select` panel is outside the population of every rendered-property sweep, for two independent
reasons** — it is portaled and rendered only while open, and its rows match no arm of the tap-target
selector.
**What would be done.** (i) Add `[role="option"]` (and `[role="listbox"]`) to the tap-target
selector at `apps/web/e2e-viewport/tap-targets.ts:268-280`. (ii) Have the stack spec **open one
Select before at least one sweep**, so the panel enters the population — opening the style toggle on
`/account` is one click on an already-swept route. (iii) Until then, have the sweep **print the
surfaces it cannot reach**: a stated blind spot beats a silent zero.
**Risk.** (ii) changes a spec's navigation order and may disturb an existing baseline; land it with
the gate, not ahead of it.

### `exec1-P12` · IMPORTANT · **ACCEPTED**
**Every screen in the product has the same document title** — one `metadata` export in
`layout.tsx`, no `<title>` in source, 25 routes. Verified.
**What would be done.** A per-route title (`Settings · Gisik Nokma`, `<project> · Gisik Nokma`) via
Next's `metadata`/`generateMetadata` on the route modules that already exist. The `'use client'`
routes need either a small server wrapper exporting `generateMetadata` or a `document.title` effect;
the workspace/project routes already resolve their names via `use-workspace-name`/`use-project-name`,
so the data is in hand. **Risk.** A `document.title` effect is the cheap arm but is invisible to a
crawler and flashes the old title on first paint; prefer the server wrapper where the route allows
it. This is **WCAG 2.4.2 Level A** and the only Level-A failure in this lane that is product-wide.

### `exec1-P13` · MINOR · **ACCEPTED** (in the narrowed form exec 1 measured)
**No skip link exists anywhere in the product.**
**Ruling.** Accepted **only** as exec 1 scoped it: `<main>` is a conforming bypass for
assistive-technology users and exec 1 verified it is on every content route, so the affected person
is the **keyboard-only, non-AT user** who must Tab through `AppNav` on every navigation.
**What would be done.** A visually-hidden-until-focused "Skip to content" link as the first focusable
element in `apps/web/app/layout.tsx`, targeting the `<main>` landmark. ~10 lines. **Risk:** it
becomes the first Tab stop for everyone, so it must be visually hidden until focused — otherwise it
is a new visible element on 25 routes.

---

# 4. THE CATEGORY-3 DIVERGENCES, RULED

Cycle 33 §2 requires every prototype comparison to be classified **MATCHES · DIVERGES-AND-RULED ·
DIVERGES-WITH-NO-RULING-FOUND**, and says *"the third is the finding — the reason a thing was built
is not a ruling."* These are the category-3 divergences the three reports raised. **Each is now
ruled, which is the whole of what the criticism asked for.**

| # | divergence | raised by | ruling issued |
|---|---|---|---|
| 1 | **Whole-board empty state** — not in the prototype in any arm | `exec1-P2` | **Stands, as a deliberate addition.** The prototype draws only a per-column and a per-group empty state (`Gisik Nokma - Desktop.dc.html:390-396`, `:590-591`). The product's whole-board banner answers a real question the prototype's silence does not. **Record it in `Features.md` as an addition**, and fix its styling — the defect was never the addition. |
| 2 | **Parent crumb is title-only** — the prototype shows `key + " " + title` | `exec1-P3` | **Stands.** The wire carries no ancestor key; serving one is a three-file change for a disambiguation case. Record the divergence with the wire as its reason. (§3, `P3`.) |
| 3 | **Comment thread renders plain text while the composer offers marks** — the link's destination is unrecoverable | `exec2-F3` | **The rendering must change; the composer must not be stripped.** The plain-text *choice* is declared (16.74), but that rationale addresses **images only** — there is no ruling on marks or hrefs, and the loss is real: a typed link renders as its label with the URL gone. The root cause is one function serving two jobs (`docToPlainText` feeds the search index **and** the thread). **Rule: the search index keeps `docToPlainText`; the thread stops using it** — render through the read-only editor (as the description row already does) or a marks/href-preserving projection. (§5, `exec2-F3`.) |
| 4 | **Founding lands on `/my-work`, the prototype lands on the list with a toast** | `exec2-F5` | **The implementation's destination is upheld; the journey is not.** The prototype (`:2741-2752`) stays on Workspaces, appends the card and toasts *"<name> created · you are its owner"*. The product navigates to `/my-work`, which for a seconds-old workspace is **four negatives and no control**. **Rule: keep the destination and give the empty My Work state a first-run pointer to New-project when the workspace has no projects** — cheaper than moving a deliberate, tested destination (`3.126`) and it fixes the seam rather than the route. (§5, `exec2-F5`.) |
| 5 | **Epic group band counts the epic row itself** (`epic · 4 tickets` where the drawing says 3) | `exec2-F7` | **The implementation's count STANDS.** The prototype puts the epic in `g.epic` (`:2904`), counts `g.items.length` (`:2920`) and still renders the epic as a row (`:2927`) — so the drawing renders four rows under a band reading three. The product's band answers for *the membership actually on screen*, which is the better answer. **Record the ruling beside the divergence** at `ticket-list.tsx:656-664`, which currently says only *"DECLARED DIVERGENCE, kept deliberately"* — an author's decision, which is what the owner's rule says is not a ruling. |
| 6 | **Visibility control: a 4-mode radio group where the prototype draws a binary toggle** | `exec3-§7.2` | **Stands.** Four modes are the product's rule; the prototype's binary toggle cannot express "members" vs "everyone". Record the ruling at the divergence site, which currently names an owner but no ruling. |
| 7 | **Visibility row: a standalone `<section>` after `</dl>` where the prototype nests `<dt>/<dd>` inside the sheet's `<dl>`** | `exec3-§7.2` | **Stands.** The product's section is independently reachable and does not depend on the `<dl>`'s rendering; the prototype's nesting is a drawing convenience. Record the ruling. |

⚠ **One divergence was raised as category 2 and remains correctly classified:** the `Visibility`
**roster cut** — the server refuses `own_user_ids`/`resolved_user_ids`
(`apps/server/src/routes/tickets.ts:115-118`) and case `17.006` holds the absence as a **negative
assertion with a positive control**. That is the model the other categories should copy.

---

# 5. THE RULINGS — exec 2 (UX), 19 findings

### `exec2-F1` · IMPORTANT · **ACCEPTED**
**The in-app help describes a product that no longer exists, in at least six places** (eight rows,
(a)–(h)). The manual tells a reader the Settings screens are unreachable *"not in the top bar, not
anywhere"* while `app-nav.tsx:297-304` renders the link.
**What would be done.** Apply the convention the corpus **already carries** — `docs/manual.md:355-359`
records that a corrected absence is *kept*, not deleted, *"so a reader who remembers it as an absence
finds the correction where they last saw it"*, and `apps/web/app/w/[workspaceId]/page.tsx:945-957`
states the rule that a document quoting a sentence is corrected **in the same change set**. So:
correct all eight rows in `docs/manual.md` / `docs/faq.md` at the place each sentence lives, keep the
superseded sentence visible with its correction, and regenerate `content.generated.ts`. Then land
`F2` so it cannot drift again. **Risk:** none to the product; the risk is doing it *without* `F2`,
which is how the corpus got here.

### `exec2-F2` · IMPORTANT · **ACCEPTED**
**The only gate over the help corpus cannot fail on the property that matters.** `check:help` proves
the generated copy matches its source and nothing about whether the source is true.
**What would be done.** A check in the shape `scripts/check-runbook-commands.mjs` already uses:
assert that every **back-ticked control name** ("Sign out", "Settings", "Comment") and every **route
mention** ("/settings") in `docs/manual.md` + `docs/faq.md` appears as a literal somewhere in
`apps/`+`packages/`. That single check would have caught `F1` rows (a), (b), (c) and (g) on the day
each broke. **Risk.** A name may be legitimately quoted from a *future* or *removed* control; the
check needs an explicit allowlist with a reason per entry, or it reddens on prose. Land it with `F1`.

### `exec2-F3` · IMPORTANT · **ACCEPTED**
**A comment renders as plain text while the composer offers marks it discards; a link's destination
is unrecoverable.** Category 3 for marks/hrefs — the declared rationale covers **images only**.
**What would be done.** **Stop rendering the thread through the search projection.** Concretely:
`comments-thread.tsx:118` (`docToPlainText(comment.body)`) and `:129` are the site; render through
the read-only editor the description row already uses, or a projection that preserves `marks` and
`attrs.href`. **Keep `docToPlainText` for the search index** — it is correct there, and its
conformance case (`doc-text-conformance.test.ts:163`) pins it for that motive. **Do not remove the
composer's formatting controls**: that would strip formatting from the record rather than show it.
**Risk.** A read-only editor per comment changes the thread's DOM and its test surface; the
description row is the working precedent for both. **This is the finding exec 2 itself named as most
likely to be wrong and most expensive to leave wrong** — see §7's disposition.

### `exec2-F4` · IMPORTANT · **ACCEPTED**
**The visibility editor's read-only sentence can never render in the shipped app — and states the
rule wrongly.** I verified (i): the only non-build hit for `canSetVisibility` is a comment.
**What would be done.** Two parts.
(i) The dead arm: either **delete it**, or give it the read that makes it reachable. Note the sheet's
own docblock (`:225-241`) argues at length that the client *cannot* know role or creator — which is
a sound argument for **showing the control and letting the door refuse**, and **not** an argument for
keeping an unreachable sentence.
(ii) The false sentence at `visibility-editor.tsx:441-443`: the server's rule
(`check-permission.ts:1058-1060` with `hasProjectAdminRights`) admits a **workspace owner or admin**,
whom the sentence omits. Rewrite against `check-permission.ts`, in the form the sibling already uses
(`:31`, `:34`). **Risk:** none; this is the sentence a person reads *after* being refused.

### `exec2-F5` · MINOR · **ACCEPTED**
**The founding flow lands a new owner on a page of four negatives.** Category 3.
**Ruling and what would be done — see §4 row 4.** Keep the destination (deliberate and witnessed by
`founding.test.tsx:126-131`, case `3.126`); give the all-empty **My Work** state a first-run sentence
with a link to the New-project form when the workspace has no projects. Files:
`packages/app-core/src/views/my-work.tsx:77,88,99,118` and the host that passes the workspace's
project count. **Risk.** The empty state must distinguish *no projects at all* from *no work
assigned to you* — collapsing them would replace four true negatives with one false statement, which
is the defect class this report keeps finding.

### `exec2-F6` · MINOR · **ACCEPTED**
**A docblock states an absolute the same card falsifies four lines later** — *"a guest gets no
numbers at all"* against `1 project · name restricted` on the same card.
**What would be done.** Scope the sentence at `apps/web/app/workspaces/page.tsx:165-169` to what it
governs — *"no count chips on this branch — a guest gets no ticket, member or archived numbers"* —
and name the restriction sentence as the deliberate exception, as `workspace-viewer.ts:152-163`
**already does** for case `13.380`. **Risk:** none; the exception is correct and documented at the
other site.

### `exec2-F7` · MINOR · **ACCEPTED**
**The epic group count diverges from the prototype and the divergence is declared but not ruled.**
**Ruling — see §4 row 5.** The count stands; record the ruling beside
`ticket-list.tsx:656-664`, which currently carries only the author's declaration.

### `exec2-F8` · MINOR · **ACCEPTED**
**A recorded self-test count is stale** — `test-cases/15-in-app-help.md:44` says *"10 cases, 4 of them
planted"*; the runner prints *"12 cases, 5 of them planted"*, and the "224 entries" is now 231.
**What would be done.** Either state the count without the number, or **generate it** — `scripts/help-content.mjs`
prints the figure on every run, so the check can assert the entry matches. **Prefer generating**:
this is a number that will go stale again by construction. **Risk:** none.

### `exec2-F9` · MINOR · **ACCEPTED**
**A comment box is offered on a ticket where the post can only be refused** — a priced, declared cost
with no ruling.
**Ruling.** **The behaviour STANDS.** The code's own trade-off is sound: gating the box on
`comments.error` *"would hide a working control every time a transient read failed"*, and the refusal
lands in the sheet's own refusal slot in the server's words.
**What would be done.** Record the ruling **at the sentence** (`ticket-sheet.tsx:2547-2552`) so the
next reader does not re-open it — which is exactly what exec 2 asked for. **Risk:** none. ⚠
exec 2 marked this finding's reachability as **reasoned, not measured**; the ruling does not depend
on it, since the *behaviour* is what is ruled, not the frequency.

### `exec2-V1` · IMPORTANT · **ACCEPTED**
**The Board's empty states invite a person to create a ticket, and no caller in the web app wires
the control.** Verified: 0 hits, control 8, `board.tsx` 18.
**What would be done.** Either (i) pass `onCreateTicket` from the project page's **existing create
region**, already gated correctly at `page.tsx:1720-1789`, or (ii) make the copy conditional, so an
unwired board states the situation instead of instructing. **And the decorative `+` glyph
(`board.tsx:746-758`) must never render unaccompanied** — it is the one part of the empty column
that reads as a control. **Risk.** (i) puts two creation entry points on one screen; that is
acceptable if the empty-state button is the same control in a different place, and it must not mint a
different ticket shape.

### `exec2-V2` · **CRITICAL** · **ACCEPTED**
**A failed pending-list re-read destroys a one-time invitation URL that cannot be recovered.**
Verified end to end at the lines.
**What would be done.** Both arms, because they are independent and each is cheap:
(i) **Hoist `minted` into the page** so the credential outlives the gate's re-render — `MintForm` is
presentational and the credential is not its business (`members/page.tsx:746` → the page).
(ii) **Make the post-mint refresh non-destructive** — never let a failed refresh unmount the surface
whose only job is to show the link (guard the `adminGate` transition at `:204-216`, or render the
minted block independently of the gate).
**Risk.** (i) changes which component owns state and touches `MintForm`'s props; (ii) changes the
gate's transitions. Do both: (i) alone still unmounts the form, and (ii) alone still loses the URL on
a remount. **This is the highest-severity product defect in the exercise** — the mint *succeeded*
server-side, so a live invitation exists that nobody can use, and a 403 arm makes it reachable by an
ordinary role change rather than only a network blip.

### `exec2-V3` · IMPORTANT · **ACCEPTED**
**A rejected visibility write leaves Apply permanently disabled and silent** — `apply` awaits
`ingest` with **no `try`/`catch`**, and the call site is `void apply()`, so the rejection is
discarded.
**What would be done.** Wrap `apply` (`visibility-editor.tsx:273-309`) in `try`/`catch`, restore
`submission` to `idle` on rejection, and route it to a transport sentence — the shape
`BulkCloseDialog` already uses two files away. Note the author already handled the *absent answer*
carefully (`:291-297`); this is its sibling. **Risk:** none.

### `exec2-V4` · IMPORTANT · **ACCEPTED**
**The comment thread reports a still-loading read as "Comments · 0" and "No comments yet."** — the
boundary collapses `data === null` into `[]`, and both the count and the sentence are read as claims
about the ticket.
**What would be done.** Pass the pending signal the way the **History tab in the same file already
receives it** (`ticket-sheet.tsx:2719-2723` distinguishes `null` → *"Loading…"* from `[]`), give
`CommentsThread` a wait arm, and stop collapsing `null` → `[]` at `:2555-2556`. **Risk:** none; the
model is three arms away in the same file.

### `exec2-V5` · IMPORTANT · **ACCEPTED**
**A "My contested claims" title button is a dead click, under a comment claiming all four sections
resolve.** Verified: three arms searched, comment says four.
**What would be done.** Add the fourth arm, **or** make the resolver exhaustive over the view's own
members so a fifth section cannot reintroduce it — the structure, not the patch. Files:
`app/w/[workspaceId]/my-work/page.tsx:39-45` and `my-work.tsx:136-151`. **Risk:** a contested claim
is one the engine *refused*, so the ticket may be in none of the three lists; the fix must handle
`undefined` as a visible outcome rather than swallowing it.

### `exec2-V6` · MINOR · **ACCEPTED** (five arms, one finding)
**Five tab-loading arms on the project page carry no role, in a file that uses one three times.**
**What would be done.** Add `role="status"` to the five `Loading…` paragraphs (`page.tsx:2390`,
`:2428`, `:2515`, `:2650`, `:2769`), matching the create region's three (`:1732`, `:1741`,
`:1783`). **Risk:** five `role="status"` regions can each announce; if the board is
stream-refetched, prefer one region with per-tab text over five live regions, or the screen reader
gets a queue.

### `exec2-V7` · IMPORTANT · **ACCEPTED**
**A comment the server REFUSES costs the author the words they just wrote** — `submitComment`
returns normally on a refusal, so `TicketEditorSlot`'s clear-inside-the-`try` runs.
**What would be done.** Either (i) **`submitComment` rejects on a refusal** — it already records the
refusal in its slot, and rejecting is what makes the composer's stated contract
(`TicketEditorSlot.tsx:178-180`, *"A refused claim must never cost the user their words"*) true — or
(ii) **`handleSubmit` clears on an explicit success signal** rather than on a non-throwing `await`.
**Prefer (i)**, because "no exception" is not "the server accepted it" anywhere else in this
codebase, and the product keeps `serverRefusal` / `transportError` / `editorError` as separate slots
by rule. **Risk.** (i) changes `submitComment`'s contract for every caller; audit them in the same
change. **exec 2 declined Critical and invited an upgrade** — I keep it Important: the loss is a
transient draft, the refusal is on screen, and the ledger is untouched.

### `exec2-V8` · IMPORTANT · **ACCEPTED**
**Opening any parent ticket raises a false "this list is not shown rather than shown short" alert.**
Verified: the key includes `projectId`, and `useLiveQuery` resets `data` to `null` on every key
change — so the window is **guaranteed on every parent ticket**, not occasional.
**What would be done.** Gate the reconciliation on `subtasks.data !== null`: while unread, render
nothing; raise the alert only when a read **that has answered** disagrees with the server's count.
File: `ticket-sheet.tsx:1278-1283`. **Risk.** The narrower condition must not silently draw a short
list — that is the property the section exists for; the three-arm distinction the sibling surfaces
already draw (`:1650-1655`, `:1336-1345`, `:2466-2489`) is the model.

### `exec2-V9` · IMPORTANT · **ACCEPTED**
**The invite page reports a transport failure as a dead link, and sends the person to ask for a
replacement** — destroying a working invitation.
**What would be done.** Make the state **four-valued**: keep `null` for the answered 404 and add a
distinct failure arm that says the invitation could not be checked and offers a retry. Then the
dead-link sentence means what it says. File: `apps/web/app/invite/[token]/page.tsx:52-69`, `:91-98`.
**Risk.** none; the `accept` failure arm a few lines below (`:78-83`) already carries the door's own
words, so the discipline exists in the same file.

### `exec2-V10` · **CRITICAL** · **ACCEPTED**
**"Create" has no re-entrancy guard, and each call mints a fresh id: a double press files two
tickets.** Verified: no latch, `disabled` never changes during flight, `newUlid()` per call.
**What would be done.** A `submittingRef` set **synchronously** at the top of `create()` — the exact
shape the composer adopted after measuring the identical failure
(`TicketEditorSlot.tsx:128-136`: *"two `comment.added` events for one comment, in an append-only
ledger that cannot take either back"*) — **plus** `disabled={… || submitting}` so the button states
the state. File: `new-ticket-dialog.tsx:96-106`, `:278-306`.
**Siblings of the same class, each named by exec 2, each lower-impact because the second submit is
refused or idempotent:** `transition-dialog.tsx:515` (Move, `disabled={blocked}`) and
`members/page.tsx:995` (Withdraw, no latch **and** no `disabled`). **Fix the whole family in one
change or the class returns.** **Risk.** A ref that never clears on an error path would wedge the
dialog; clear it in a `finally`.

---

# 6. THE RULINGS — exec 3 (functionality), 8 findings

### `exec3-F1` · IMPORTANT · **ACCEPTED**
**An open-gap section still declares a closed security-relevant leak, with both supporting numbers
stale and a named owner pointing at finished work.** I verified all of it: `attachments.ts`
`deleted` → **5** (claim: ZERO), `tickets.ts` → **13** (claim: 6), and `ticketIsLive` is imported
(`:10`) and called at the upload door (`:388`) and the download door (`:545`).
**What would be done.** Replace (a)'s body in
`apps/server/test/read/soft-delete-background-paths.test.ts:123-146` with the **supersession marker
the catalogue already carries** — `test-cases/16-remaining-doors.md:923` does it correctly (*"STATUS
CHANGED 2026-09-20: (a) is FIXED — cases `16.96`–`16.99`"*) — and point the reader at cases
`16.97`/`16.98`/`16.99`. **The cheap detector for the class, worth adopting generally: a "known gap"
paragraph should be greppable by the number it is built on.** **Risk.** None — but note the defect
mechanism: `6a69f5df` corrected the *same claim* in two other files and did not touch the file that
**owns the enumeration**, so a content sweep run over the whole tree still missed it.

### `exec3-F2` · IMPORTANT · **ACCEPTED**
**A recorded survivor measurement's stated warrant is false: the second witness read a stale `dist`.**
**What would be done.** Either (i) run `pnpm turbo run build` before the `dual-client` half and say
so, or (ii) **cite the app-core half alone** — it is the half that is valid
(`test/replica/replica-data-source.test.ts:30` imports by relative path) and it is sufficient. Fix
the sentence at `soft-delete-background-paths.test.ts:179`. **Risk.** (ii) is the honest, cheap fix
and loses nothing: the gap itself survives on one valid witness, which is `F5`.
**Why this matters beyond the sentence:** it is the *"a mutation that never ran is
indistinguishable from a killed one"* class aimed at a check — and it happens to reach the right
conclusion for one half while the stated reason for the other half is false, which is the most
durable form of wrong.

### `exec3-F3` · IMPORTANT · **ACCEPTED**
**exec 3's own lane's §17 group cites an artifact the owner has ruled is not the prototype, and every
citation is off by one against the artifact that is.**
**What would be done.** In `test-cases/17-open-work.md` (header `:87-90` and cases `17.001`–`17.004`,
`17.006`): cite the **staged export by file name and sha** as the common brief requires, and shift
the line numbers by **−1** (measured uniformly at both ends of the file). **The general form to
adopt: a prototype citation must name the artifact it was measured in, because two files in this
repository both call themselves the prototype and only one of them is.**
**Risk.** None to the product — exec 3 verified the underlying comparisons transfer identically to
the ruled export (`13` lines at `letter-spacing:0.6px`, `12` at `13px/18px`, exactly `1` at
`12px/16px`, in both copies), so the defect is in the citation, not the finding it supports.
⚠ **And the repo's copy is not merely different, it is broken:** `viewBox` → 0 occurrences against
the export's 23, `sc-camel-view-box` → 24. Corrected by `I1`'s neighbour problem in exec 1's lane:
any visual comparison made against the repo copy is a comparison against a rendering with no
coordinate system.

### `exec3-F4` · MEDIUM · **ACCEPTED**
**`routes/my-work.ts:364`, the contested-claim title gate, is a confirmed open gap** — reproduced
independently; the conjunct is executed-but-unconstrained, and it is the only soft-delete site in the
server that survives.
**What would be done.** A contested-claim fixture whose ticket is then soft-deleted, asserting the
title is `null` while a live contested sibling's title is not. The project already names this at
`test-cases/16-remaining-doors.md` (16.90(b)) with an owner. **Risk:** none; the positive control in
the same file (`my-work.ts:141`/`:252` are killed by the full-constant mutation) proves the harness
can fail on this subsystem.

### `exec3-F5` · MEDIUM · **ACCEPTED**
**The replica's two TypeScript gates are confirmed open gaps, and the table's citations for them have
rotted** (`:947`/`:980` cited; the real lines are `:996`/`:1029`, +49).
**What would be done.** (i) **Cite by content** — *"the `if ((state.deleted ?? null) !== null)
continue;` in the ticket enumeration"* — which is what the neighbouring note already does and this
one does not. (ii) Cover the two gates with a deleted-ticket fixture in the replica suite.
**Risk:** none. Note the citation rot is the same class as `exec1-I4`: both resolve, both mislead.

### `exec3-F6` · LOW · **ACCEPTED**
**The soft-delete enumeration's own counts do not reproduce from the command printed beside them.**
My own run reproduced the ambiguity: `${LIVE_TICKET_WHERE}` → 10 raw lines (9 executable) and
`LIVE_TICKET_WHERE,` → 12 raw lines (5 array members) — **different units, both honest.**
**What would be done.** One clause at `visible-where.ts:155-156` and
`soft-delete-background-paths.test.ts:45-46`: *"13 view-site uses … plus `read/live-ticket.ts`'s
`ticketIsLive`, which asks the same constant at a route."* Then the command and the caption agree.
**Risk:** none. **The finding is that the unit is unpinned, not that the arithmetic is careless** —
which is worth recording because a reader who runs the published command gets 14/10 and concludes the
document is wrong.

### `exec3-F7` · LOW · **ACCEPTED**
**exec 3's own lane's §17 block table has one row and no rule for a lane with no allocation.**
**What would be done.** Add rows (or `— not allocated —` rows) for exec 1 and exec 2 — both of whose
§16 blocks are recorded **"FULLY SPENT"**, so both will arrive unallocated — plus one sentence:
*"a lane with no row here must STOP AND ASK; silence is not a licence."*
**Risk:** none; it is two table rows. The hole is the one that made §13 go red twice.

### `exec3-F8` · LOW / observation · **ACCEPTED-DEFERRED**
**`check:db-tz` is the only one of the nine checkers with no automated invocation.** exec 3
explicitly does *not* call it a defect.
**Ruling.** The observation is correct and worth keeping: its subject — a client connecting with no
startup options and no `SET TIME ZONE`, so only the database's own configured default can pass — is a
property nothing else tests, and a check that runs only when a human remembers is exactly the failure
the viewport suite's own CI comment was written to fix.
**Why deferred, and when it would be taken up.** Wiring it needs **a provisioned database in CI**,
which the repository may deliberately not have; exec 3 could not determine intent from the tree and
did not guess. **Take it up when CI gains a database service, or when someone records the decision
that it will not** — the deferral is for the missing precondition, not for the finding's value.
**Nothing is done now.** ⚠ **Do not wire it blind:** against no database it would fail in CI for the
wrong reason, which is worse than not running.

---

# 7. THE COUNTS RECOMPUTED, AND THE TWO CARRIED BUCKETS

`accepted 44 + deferred 1 + rejected 0 = **45 raised**`. The members are enumerated in §1 and ruled
in §3, §5 and §6; every id in §1 appears exactly once.

### 7.1 Carried, NOT raised: exec 2's ~40 sweep candidates (`§2d`, `§2e`)

**These are not ruled, because they are not findings.** exec 2 says so in its own words and I am
holding it to that: *"It is a list of hypotheses by a machine, not findings. **If the controller rules
on any of them without someone opening the line first, this report will have caused exactly the
failure it documents.**"* And: *"Treat every one as a hypothesis until someone opens the line."*

They are **carried** here so the owner can see what exists, with exec 2's own calibration warning
attached: **across the two sweeps exec 2 lowered three of the sweep's Criticals after reading the
code**, so the list should not be planned against at face value. Folding them into `raised` would
inflate the count; dropping them silently would hide real material. **The honest disposition: a
verification pass, with the two sweep reports as its queue — not a ruling, and not a dismissal.**

Its highest-severity candidates, named so a later pass starts where the cost is highest: two screens
stuck on "Loading ticket types…" forever (a `Promise.all` with no rejection handler,
`ticket-type-list-screen.tsx:175-181/199`, `ticket-type-editor-screen.tsx:189-193/244`); a rejected
type migration stranding the editor with the dialog gone and the control disabled
(`ticket-type-editor-screen.tsx:271-278/509/546`); and `saveName` coercing a message-less refusal to
`null`, which the consumer reads as success (`account/page.tsx:210-213`, `profile-section.tsx:34`).
⚠ **One of these is already partly covered by a raised finding** — the sweep's
*"`Dialog` declares `aria-modal="true"` with no focus move"* is `exec1-P8`, which **two lanes reached
independently**, which is corroboration rather than duplication.

### 7.2 Carried, NOT raised: exec 3's `§7.6` (migrations never applied incrementally)

exec 3 labels it *"Observation, not a defect"*, so it is not in `raised` — but it is the most
consequential non-finding in the exercise. **The property: no migration in this tree is ever applied
to a database that already holds data.** All 32 `up` migrations and 31 of 32 `down` migrations have
only ever run against an empty database (the only two `runner()` calls are
`test/helpers/db.ts:40` and `projections/tickets-rank.test.ts:230`, both on fresh databases).
`check:migrations` cannot see this **by construction** — its own docblock says so.
⚠ **exec 3 measured the risk rather than asserting it**: zero backfills anywhere, one
`ADD COLUMN … NOT NULL` carrying `DEFAULT false`, two `ADD CONSTRAINT … CHECK` that have already
applied successfully on the dev database, and the one never-run migration is a pure
`CREATE TABLE` + `CREATE INDEX`. **So the gap is real and the present risk is low** — which is the
honest pair, and I am recording it as such rather than promoting it to a finding it was not raised
as.

---

# 8. WHAT THIS EXERCISE DID NOT DO — its own boundary, stated

1. **Nothing was built, fixed, branched or committed as product change.** No lane opened a PR; no fix
   branch exists. `exec3/review-functionality`'s `git status --porcelain` is empty apart from its
   report.
2. **Two lanes declare coverage they did not reach, and I am not going to launder that into
   completeness:**
   - **exec 1:** no signed-in route was measured **at paint**. Every finding about the board, the
     ticket sheet, the settings screens, the members page, the inbox and the desktop/mobile shells
     rests on **source and stylesheets**. It ran the signed-out suite by hand (`31 passed, 2
     skipped`) — 5 routes × 3 viewports — so its painted claims stop at the signed-out surface.
     **Largest hole: `apps/web/app/*`'s 25 route bodies.**
   - **exec 2:** `ticket-sheet.tsx` roughly 15% read; `apps/mobile` and `apps/desktop` untouched;
     `/inbox`, `/members`, `/account`, `/settings`, `/mcp/*` listed and not walked; the workflow
     builder and ticket-type editor (36 files) not walked; `test-cases/13-*.md` not verified id by
     id. **No running browser.**
   - **exec 3:** **no findings in `packages/rule-engine`, `packages/mcp-server`,
     `packages/sync-client` or `packages/domain`** — and exec 3 states plainly that this is *"a
     statement about where I looked, and not about the code."* `mappers.ts` (2,457 lines) was scanned
     for defaulting operators, not reviewed line by line. **No browser or pixel measurement.**
3. **The prototype comparison is uneven by construction.** exec 1 compared **two** surfaces; exec 2
   compared the nav, the scope note, the help pane, the workspace home and the category-3 items;
   exec 3, whose lane is the engine, compared only where a prototype ruling meets the wire. **The
   prototype's ~20 remaining files were not compared by anyone.**
4. **`test-cases/` was not verified id by id by any lane.** The catalogue holds **2606 ids** (measured
   by exec 3 and reproduced by the guard's own count); `check:citations` proves an id is *cited*, not
   that the case still holds of the product — `exec1-§7` states that limit explicitly.
5. **CI stayed dark through the whole exercise.** Every finding that depends on a browser instrument
   is therefore unguarded after this exercise ends, exactly as before it — unless `exec1-I1(a)`
   lands.

---

# 9. THE THING I WOULD FIX FIRST

If the owner reads only one paragraph. Three findings are of a different order from the other
forty-two, because the others are defects **in** the product while these are defects in the product's
**ability to tell**:

1. **`exec1-I1`** — no browser instrument has run since 2026-09-06, and the runner never starts
   (`"steps": []`, `"runner_name": ""`). Every tap-target, contrast, accessible-name and overflow
   guarantee this project believes it holds has been unmeasured for fifteen days. **Restoring the
   runner is the single highest-value action available, and it is not a code change** — it is the one
   thing on this list the controller cannot do.
2. **`exec2-F2`** — a green light over an unverified artifact. `check:help` passes while the manual
   tells people the Settings screens are unreachable. This is the mechanism that produced `exec2-F1`
   and will produce it again.
3. **`exec2-V2` and `exec2-V10`** — the two Criticals, and both are the same shape: **an irreversible
   loss from an ordinary double action** (a one-time invitation URL destroyed by an unrelated failed
   re-read; two tickets filed from one double press, in a ledger that cannot take either back). Both
   have fixes already measured and in-tree one package away.

**And the honest caveat on all three: they are ruled ACCEPTED, and this exercise builds nothing.**
An accepted ruling is a finding with a plan attached — it is not a fix, and until one is executed the
product is exactly as it was.
