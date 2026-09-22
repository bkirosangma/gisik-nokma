# 13. The HIG palette and the per-screen plan — test cases

Part of bucket 13 (`Features.md` §13) — one part-file of the catalogue split performed 2026-09-19.
Index and id-block allocation: [`13-deployment-dogfooding.md`](./13-deployment-dogfooding.md).
Case ids are unchanged and are never renumbered by the split.

## THE BLOCKS — take from yours, never from the tip

Allocated by the controller 2026-09-21 22:0x (cycle 46) after B03/B05 minted `13.1050`–`13.1052` twice
from one base. Mirrors `17-open-work.md`: **blocks are per RELEASE BATCH (the branch that lands), not
per lane session** — a lane runs several batches in one worktree tonight, and a block that follows the
session would be shared by two branches landing in either order.

| release batch | §13 block |
|---|---|
| **B03** (`rel/b03-accessible-names`) | **`13.1057`–`13.1066`** — minted: `13.1057`–`13.1059` (moved from `13.1050`–`13.1052`); `13.1053`–`13.1056` predate the blocks and are uncontested |
| **B04** (`rel/b04-help-corpus-and-copy`) | **`13.1067`–`13.1076`** |
| **B01** (`rel/b01-server-doors-security-and-refusa`) | **`13.1077`–`13.1086`** |
| **B02** (`rel/b02-account-page-workflow-builder-dr`) | **`13.1087`–`13.1096`** |
| **B06** (`rel/b06-new-ticket-and-move-dialogs`) | **`13.1097`–`13.1106`** |
| **B09** (`rel/b09-failure-states-on-the-web-reads-`) | **`13.1107`–`13.1116`** |
| **B08** (`rel/b08-ticket-sheet-crumbs-history-comm`) | **`13.1117`–`13.1126`** |
| **B07** (`rel/b07-soft-delete-integrity-engine-rep`) | **`13.1127`–`13.1136`** |
| **B10** (`rel/b10-paint-ua-chrome-phone-width-cont`) | **`13.1137`–`13.1156`** |
| **B11** (`rel/b11-session-expiry-and-dead-controls`) | **`13.1157`–`13.1166`** |
| **B12** (`rel/b12-workflow-and-type-invariants-in-`) | **`13.1167`–`13.1176`** |
| **B13** (`rel/b13-due-date-soft-delete-undo-member`) | **`13.1177`–`13.1186`** |
| **B14** (`rel/b14-minimal-shells-phone-and-desktop`) | **`13.1187`–`13.1196`** |
| **B16** (`rel/b16-outbox-ordering-projection-verif`) | **`13.1197`–`13.1206`** |
| **B15** (`rel/b15-calendar-timeline-and-canvas-for`) | **`13.1207`–`13.1216`** — self-allocated by the B15 driver (exec6, 2026-09-21 23:3x); absent from the controller's 22:0x table, next free block after B16's `13.1206` |
| **`rel/browser-findings`** (the release FIX lane, deepseek ds1) | **`13.1217`–`13.1226`** — self-allocated 2026-09-22 by the lane that fixes the five browser-suite release findings; absent from the controller's 22:0x table, next free block after B15's `13.1216`. Minted: `13.1217`, `13.1218`. |
| **`rel/priority-builtin`** (the priority-built-in plan, claude-sonnet then deepseek) | **`13.1227`–`13.1266`** — named in the plan's Global Constraints (`docs/superpowers/plans/2026-09-22-priority-builtin.md`, controller correction 2026-09-22 02:0x, after `rel/browser-findings` minted `13.1217`–`13.1218` out from under the plan's original draft block); the plan's PR (#672) landed without a row here, so this row is that recovery, added in the same commit as the first id it mints. Next free block after `rel/browser-findings`'s `13.1226`. Minted: `13.1227`–`13.1238`. |
| **sheet prototype parity** (`docs/superpowers/specs/2026-09-22-sheet-prototype-parity-design.md`, branches `rel/sheet-parity-a`/`-b`/`-tail`) | **`13.1267`–`13.1286`** — allocated 2026-09-22 by the owner-side session against `origin/main` `5de12392` (§13 tip `13.1218`, rows above held through `13.1266`); cases file in `13-board-prototype-port.md`. **Minted: `13.1267`-`13.1268`** by lane A (`rel/sheet-parity-a`, the `Popover` primitive) and **`13.1270`–`13.1274`** by lane B (`rel/sheet-parity-b`, the editor chrome — three cases and two control arms, each control carrying its own id). ⚠ **THE PLAN CLOSED 2026-09-22 with no further mints:** the tail lane (`rel/sheet-parity-tail`, Tasks 3, 4, 6, 8 and the held half of 7) minted nothing in this block, because every case it added belongs to the plan's §16 block (`16.110`–`16.127`), including its control arms, which are arms of those ids rather than ids of their own. So `13.1275`–`13.1286` were never spent by the plan. **Minted 2026-09-22 by the owner-side follow-up `owner/editor-body-field-style` (the typing area is the field): `13.1275`–`13.1277`; and by `owner/board-card-key` (the board card carries its key): `13.1278`–`13.1281`. `13.1282`–`13.1286` are unused, not held.** Left recorded because a table that still reads *"next free"* against a finished plan is how the next lane concludes a finished reservation is live — the same expiry the note at the top of `test-cases/16-remaining-doors.md` states. |
| **`rel/project-card-actions-fit`** (owner request 2026-09-22: the actions strip is the button's size) | **`13.1297`–`13.1301`** — allocated 2026-09-22 by the controller against `origin/main` `2ca7c080` (`13.1287`–`13.1296` is `rel/assignee-names`, in flight); cases file `13-owner-requests-and-backlog.md` |
| **`rel/project-head-prototype`** (owner request 2026-09-22: the project header arranged as the prototype's two rows) | **`13.1302`–`13.1311`** — allocated 2026-09-22 by the controller against `origin/main` `2ca7c080` (`13.1287`–`13.1301` are two sibling lanes in flight); cases file `13-board-prototype-port.md`. **Minted: `13.1302`–`13.1306`** (Task 1, the head row; Task 2, the content-sized rail); `13.1307`–`13.1311` unspent |

**⚠ THIS TABLE IS THE ALLOCATION, AND IT EXPIRES.** Re-read it before minting, and if your own
allocation changes, change it HERE in the same action. **When your block is empty, STOP AND ASK.** Do
not mint from the tip and do not borrow a neighbour's — that is the rule whose breach made §13 go red
twice, and a third time tonight (`13.1050`–`13.1052`, B03 and B05, one base). **Ids already minted on
`main` are never renumbered — the branch's move.**

## The HIG palette adoption (2026-09-08) — block `13.281`–`13.320`

*Both cases pin a place where the adoption deliberately did NOT follow Apple. Neither departure is
visible from reading the palette — the values look reasonable, and the harm is a ratio you have to
compute against one specific background — which is exactly why they are cases and not comments.*

- **13.281** ✅ `success` is not Apple's increased-contrast green, and the case computes *why* rather
  than restating the ruling: `successText` on Apple's `#248A3D` measures **4.1233** against 4.5 on the
  shipped `onColorWarmLight` `#fbf7f3` ground, while the kept `green700` `#1e7a34` measures **5.0662**.
  The counterfactual is calculated in the test against the same foreground the shipped palette actually
  puts on it, so "complete the palette" arrives as a red test naming the pair instead of a shipped 4.1233.
  *Controlled: swapping in `#248a3d` reddens **two** guards — this case (naming the hex) and the
  data-driven declared pair, which prints **4.1233**. Two independent witnesses for one defect.*
- **13.282** ✅ `textMuted` and `categoryOpen` must not resolve to the same primitive. They shared
  `inkMuted` before this change, which is precisely the shape that invites reuniting them. Apple's
  accessible grey `#6C6C70` is correct for a chip dot's 3:1 and **wrong for read text at 4.16 on
  `surfaceSunken`** — and `textMuted on surfaceSunken` is a declared pair because `/mcp/tokens` puts
  muted text on a sunken row.
  *Controlled three ways, and the second and third matter more than the first: reuniting them on the
  safe grey reddens the identity assertion; reuniting them on the DOT grey reddens this case **and** the
  declared pair, which prints **4.164** — the figure §8 predicted and an independent solver computed,
  agreeing three ways; and making the dot grey clear 4.5 reddens the assertion that states the REASON,
  so the case cannot keep passing while its own explanation has become false.*

> **Not in this change, and deliberately: the `border`-on-`surface` and `focusRing`-on-`surface` pairs.**
> Ruling R1(c) drops borders in favour of fill, so the `border` role must be remapped to a grey that
> clears 3:1 *and* the declarations that paint it must be removed. **Those are one atomic change.**
> Landing the remap alone would give every card, chip, table cell and column a heavy dark rule, and
> **no gate would object — a *darker* border fails nothing** — leaving the product visibly wrong on
> `main` between two PRs while it is being tested by hand. The measurement the sweep starts from, taken
> here: `border` on `surface` is **1.34** light and **1.49** dark against 3:1.


## The border sweep (2026-09-08) — R1(c) applied, and the number that closed

- **13.283** ✅ Non-text contrast (WCAG 1.4.11) across the rendered signed-in surface: **zero classes
  below 3:1**, product-wide, on five routes.
  *This case changed shape mid-change and the reason is the useful part. It was written to RECORD, not
  assert, because the defect was live at **13 of 20**. It carried
  `expect(examinedTotal).toBeGreaterThan(20)` to guard the real hazard that **a sweep matching nothing
  reports zero offenders — the best possible result and the least trustworthy one.** The sweep then
  removed 54 borders, the population fell to **19**, and the guard went RED. It was working; its
  threshold had become an assumption about a population this very change was designed to shrink.*
  *It was **not** lowered to 19 — that is moving a bar to meet a result. It was replaced by a control
  that runs through the SAME path as the measurement: **the same sweep, on the same rendered page,
  re-run at 25:1, must report offenders.** A sweep that answers "zero below 3" AND "zero below 25" is
  not measuring anything, and that control stays honest at any future population.*
  *The instrument composites alpha, which `relativeLuminance` cannot — the checklist records that mode
  reading 11.87 where the truth is 1.85, a false GREEN. Every fill R1(c) introduces is `rgba()`.*
- **13.921** ✅ The non-text-contrast sweep's positive control is **PLANTED**, so no styling change can
  remove it. *It replaces `expect(bestSeen).toBeGreaterThan(15)`, which **until 2026-09-18 passed for a
  reason unrelated to the property it named**: both readings above 15 (17.62, twice) were
  `rgba(0,0,0,1)` — Chrome's own default border on two BARE `<button>`s on `/settings/workflows`. The
  control was resting on an unstyled button, the exact defect class this day's work was removing.*
  *Putting those buttons on `.gn-button` (`border: none`, `packages/ui/src/ui.css:60`) removed both
  readings and the maximum fell to **3.81**, so the assertion went red — not because the instrument
  broke, but because the defect it leaned on got fixed. `aside.gn-attention`'s 4.36 leaves by the same
  door in the same week, which is why the repair could not lean on it either.*
  *The `15` is NOT lowered and the assertion is NOT deleted. What changes is what it stands on: the
  sweep is handed an element whose ratio is known to the decimal — black on an opaque white ground,
  **21.0** — and must read it through the SAME `sweepBorders` path the measurement uses. A planted
  fixture does not depend on the product happening to contain a high-contrast border, so it survives
  every future styling change, and it asserts a property of the INSTRUMENT rather than of the product.*
  *Verified end-to-end in Chromium rather than by arithmetic alone: on a bare page the sweep reads
  **nothing** (`examined=0`), and after the plant it reads `div.non-text-contrast-control` at
  `ratio 21`, `border rgba(0,0,0,1)`, `backdrop rgb(255,255,255)` — the empty BEFORE state being the
  control that the reading came from the plant. The white ground is a real ANCESTOR rather than the
  control's own background, because `backdropOf` walks to the PARENT; painting the control itself would
  leave the ratio at the mercy of whatever the page's body is painted that day.*
  *`bestSeen` remains the PRODUCT's own maximum and is still written as the roster's `highestReading` —
  it is simply no longer load-bearing for a threshold it can never durably hold.*
  ***THE NEGATIVE CONTROL HAD THE SAME DEFECT, AND IT WAS THE RUN THAT FOUND IT.** `viewport.spec.ts`
  runs TWO controls through `sweepBorders`, and the negative one — `sweepBorders(page, 25)`,
  `absurd.below.length > 0` — sweeps the page the route loop ENDS on, `/settings/workflows`. That is
  precisely the page whose two bare buttons carried the `rgba(0,0,0,1)` border and became `.gn-button`
  (`border: none`), so after the change **that page has no painted borders at all**: the roster's
  `examined` falls 9 → 4, `highestReading` 17.62 → 4.36, `totalClasses` 5 → 2, both `rgba(0,0,0,1)`
  entries gone, `below.length` is `0`, and the control fails **for exactly the reason the positive one
  had**. The first version of this fix planted BETWEEN the two controls and was caught by running the
  suite — F1 was found by thinking, this by running, and a green forced gate could see neither because
  `e2e-stack` is not in the turbo graph.*
  ***THE REPAIR IS THE ORDERING.** The fixture is planted ahead of BOTH controls. Its fixed 21:1 is
  BELOW the negative control's 25, so **one fixture satisfies both** — the positive control reads it and
  the negative control counts it as an offender. Neither threshold is lowered and neither control is
  deleted; **a control that runs before the fixture it needs is not a control.** Verified in Chromium
  against a borderless page, which is the failing page's own shape: **before the plant
  `below.length=0` — the reported failure reproduced — and after it `below.length=1` with
  `div.non-text-contrast-control` at 21 as the offender**, while the positive control reads the same
  element at 21. Both now stand on the fixture, which depends on no product element, so neither this
  change nor `aside.gn-attention`'s border leaving in the same week can take it away.* —
  (`apps/web/e2e-stack/viewport.spec.ts`)
- **13.284** ✅ A non-primary control is identifiable without a boundary — the affordance is fill plus an
  accent-coloured semibold label, and the case measures which of the two actually carries it.
  *Measured, because the ruling explicitly declined to assert it: **the FILL is 1.09–1.15 against every
  surface and carries nothing.** The **LABEL** measures **5.31–6.81**, well past the 4.5 it owes as text.*
  *The reading, stated as a reading: WCAG 1.4.11 asks for 3:1 on "visual information required to
  identify" a component; where the label does the identifying and clears 3:1 several times over, the
  fill is reinforcement rather than the identifying signal. **Its weakest point, named rather than
  omitted: this product colours links with the same accent, so accent-plus-semibold is not UNIQUELY a
  button.** What is left to separate them is fill, radius and a 44px target — each individually
  sub-3:1. A reader who thinks that insufficient should reopen R1, which is the owner's call.*

> **THREE FIELDS ARE DELIBERATELY NOT SWEPT, and this is requirement 4's "say so" half.**
> `.gn-sign-in__method label input`, `.gn-mcp-authorize__input` and `.gn-notfound__link` keep their
> borders. **13.284's argument does not transfer to them:** an EMPTY text field has no accent label
> inside it, so removing its boundary leaves a 1.09–1.15 fill as the only thing marking it, which I
> believe genuinely fails 1.4.11. The ruling says to come back rather than quietly ADD a boundary; the
> same logic forbids quietly REMOVING one. Looked at directly on `/sign-in`, the bordered phone field
> reads correctly and is easy to locate — which is the evidence for leaving it. **Owner's call.**

> **SEEN BY LOOKING, NOT BY COUNTING — and it is NOT this change's doing.** On `/sign-in` the
> `Phone | Email link` segmented control renders as two browser-default boxes, visibly inconsistent
> beside the swept `Continue with Google` and `Sign in with a passkey`. Verified rather than assumed:
> `.gn-view-tabs button` sets `min-height` and `padding-inline` **and nothing else** — globals.css says
> so in its own comment — and `git diff` over this change touches none of it. It is the same
> already-recorded finding as the 26 controls rendering at the browser's font. **The sweep did not
> break it; the sweep made it visible**, because the controls beside it stopped looking browser-default
> too. Per-screen work, so it belongs to the reconciliation audit, recorded here rather than fixed.


## Task 0 of the HIG per-screen plan (2026-09-08) — the accessible-name gate

*Built BEFORE any screen is touched, and that ordering is the point: the per-screen work is delegated
to smaller models, and **a rule enforced by a test survives a delegation while a rule enforced by
attention does not.** The owner's rule is "reject anything that loses information or an aria-label";
before this, **46 `aria-label` and 140 `role` attributes existed across 53 source files and NOT ONE
ASSERTION TOUCHED ANY OF THEM** — a restyle could have deleted every accessible name in the product and
the gate would have stayed 33/33.*

> **⚠ WHAT 13.285/13.287 CANNOT SEE, measured 2026-09-08 by the mutation that was supposed to prove
> the opposite.** The plan's Task 2 required deleting the passkey button to redden **both** 13.292 and
> 13.285. **Only 13.292 fired.** Root cause, read from `button.tsx`: `Button` renders a bare
> `<button>` whose role is IMPLICIT in the tag and whose accessible name comes from its TEXT — so none
> of the four counted attributes moves when an entire unlabelled control is deleted.
>
> **The gate counts ARIA ATTRIBUTES, not accessible roles**, and it therefore cannot see the loss of
> any control named by its own text — which is most buttons in this product. The case wording below is
> accurate (it names the four attributes) but **Task 0's rationale oversold it**: "a rule enforced by a
> test survives a delegation" is true only for the population the test counts. Every remaining
> per-screen task leans on this gate, so the limit is written here rather than left to be rediscovered.
>
> **It is a real gap, not a nuisance, and it is recorded rather than fixed** — closing it means
> counting computed accessible roles instead of attributes, which is a different instrument.
> **Owner: whoever next touches `sweepAccessibleNames`.** What still holds: explicit `role`,
> `aria-label`, `aria-selected` and `aria-describedby` cannot fall, which is what caught the
> SegmentedControl transcription and what the sign-in restyle was measured against.

- **13.285** ✅ Accessible names and roles on the signed-out surface are a one-way ratchet: `aria-label`,
  `role`, `aria-selected` and `aria-describedby` counts per `viewport|route` may rise and never fall.
  Lowering one is a deliberate deletion of the key in a commit that names the element — the same
  contract as the tap-target and type-scale baselines, and `recordAccessibleBaseline` writes ABSENT keys
  only so a branch that lowered a count cannot re-baseline over it.
  *Mutation-witnessed, and the witness is the whole reason to believe the rest: deleting
  `aria-selected` from the Phone tab alone (`sign-in/page.tsx:104`) reddens it on all three viewports,
  naming the route and printing **"LOST ariaSelected: baseline 2, now 1"**. Committed first, then
  mutated, then restored — `git checkout --` restores from HEAD and has destroyed uncommitted work here
  twice.*
  **FLOOR 0 ON `/sign-in` SINCE ROUND 2c (2026-09-08), and it is recorded here rather than left to be
  discovered.** Gating the Phone tab removed the segmented control, which carried this page's only
  `aria-label`, its `tablist`/`tab` roles and both `aria-selected`s — so all four ratcheted counts are
  `0`, and **a floor of zero cannot fall: 13.285 protects nothing on `/sign-in`** until a labelled
  control returns (Task 12's passkey UI, or a deployment with a provider configured). 13.286 still
  guards the sweep on that route — `rawMatches` is 54, so a sweep that saw nothing is still caught. The
  ratchet MECHANISM is witnessed on `/privacy`, whose floor is non-zero: deleting the back button's
  `aria-label` reddens 6 of 19 with **"LOST ariaLabel: baseline 1"** naming `/privacy` and `/terms` at
  all three viewports.
- **13.286** ✅ The sweep's selector control, asserted HARD and BEFORE the ratchet: `*` over a rendered
  document must examine more than zero elements. *A sweep that stopped matching reports zero losses and
  is byte-for-byte indistinguishable from a page that lost nothing — the failure this file catalogues
  more than any other. Measured populations range from 48 elements on `/sign-in` to 999 on `/help`.*
- **13.287** ✅ The signed-in twin, over the stack suite's routes, with its own baseline file
  because it is a different population. *It is not redundant with 13.285 and the numbers show why:
  `AppNav`, the view tabs, the board and every settings screen exist only behind a session, so the
  signed-out ratchet is structurally blind to them — `/p/:projectId` alone carries 14 roles and 5
  `aria-selected`, and the signed-out sweep sees none of it.* *(Both counts read 13 and 4 until
  2026-09-20 and were stale: recounted against `e2e-stack/accessible-names-baseline.json`'s own
  recorded values and re-measured on the live stack, which agree at 14 and 5.)*
  **`/p/:projectId`'s `ariaLabel` floor moved `66 → 65` on 2026-09-22** (`rel/browser-findings`), and the
  movement is attributed rather than absorbed: the sweep was run twice through the same predicate — on the
  deployed stack at 390 (64, the number the release run reddened at) and on the branch's own tree (65) — and
  every element of both counts is named in `Features.md`'s ratchet bullet and in the commit. Four instances
  left with the two EPIC cards the owner ruled off the board (`0cc3520d`), two arrived with `Main` (P31) and
  `Project view` (P19), and the branch's project-item name is the last. **The recorded `role` stays at 14
  while the same run measures 15** — a rise is the direction this floor does not check, and it is recorded
  rather than passed over. The count is also **data-bound (two per drawn card)**, which is the thing to know
  before reading any future move on this key as a loss.
  **⚠ WHICH PAGE THIS CASE MEASURES WAS WRONG UNTIL 2026-09-20, and the repair is what gives the
  numbers their meaning.** `/p/:projectId` resolved its project as the FIRST project link on
  `/w/<id>` — a POSITION, not a project. The live dev database holds a second project (`gggg`,
  created through the real web UI 2026-09-10, 1 ticket) and it sorts ahead of the seeded
  `Shop operations` (26 tickets), so the ratchet was measuring `gggg`'s board and reporting
  `LOST ariaLabel: baseline 66, now 9`. Measured with the instrument: `gggg` reads
  `{ariaLabel: 9, role: 9}`, `Shop operations` reads `{ariaLabel: 65, role: 14}`, against the
  recorded `{66, 14}`.
  **⚠ HOW FAR BACK — corrected under review, and the first version was too wide.** It said the
  wrong-board period ran "since 2026-09-10", which the database falsifies: `gggg`'s own event log
  records `project.archived` at **2026-09-16 04:27:47** and `project.restored` at **2026-09-19
  18:40:20**, and the workspace home renders live projects only by default — so `gggg` was out of the
  DOM across **2026-09-18**, when this baseline was recorded. **The recorded page WAS `Shop
  operations`**, so the `role` match corroborates the baseline rather than being its only warrant.
  The wrong-board window starts at the **2026-09-19 restore**. The route now
  names the seeded project and refuses to fall back to a neighbour (`e2e-stack/helpers/board.ts`);
  **it reds, correctly, at `66 → 65`: one accessible name genuinely lost on the real board, not yet
  attributed. Owner: whoever next touches the board's labelled controls.**


> **What this gate deliberately does NOT do.** It counts; it does not read. A restyle that swaps one
> accessible name for another of equal count passes here, and should — whether the new words are better
> is the copy rule, which is a person's judgement. This gate catches the LOSS, which is the half that
> can be mechanised and the half a delegated implementer is most likely to cause by accident.

## Every route names its view (exec1 P12, 2026-09-21) — case `13.1057`

**Id `13.1057`, and the number is derived rather than guessed.** `13.922` — this file's next free id above
its own last line — was ALREADY TAKEN in `13-settings-and-workflows.md:577`, and the guard caught it.
`13.x` is ONE space across every `13-*.md` file, so the tip is the global high-water mark (`13.1046`), and
the block `13.1034`–`13.1049` is another executor's with `13.1047`–`13.1049` recorded as reserved and
deliberately unused (`13-owner-requests-and-backlog.md:2185`). `13.1048` is inside that reservation and
must not be taken, so the first genuinely free id is the one after the block. **This lane's standing
request for an allocated block, first recorded under `13.969`, is still open** — this task was dispatched
without one, as that one was.

- **13.1057** ✅ Every routing file under `app/` is titled by a SERVER mechanism — its own
  `metadata`/`generateMetadata`, or a SIBLING `layout.tsx` exporting `metadata`, which is a server
  component even when the page under it is `'use client'`. A second arm reddens on any non-dynamic route
  that titles itself from `<DocumentTitle>` with a literal topic, and a third pins the two dynamic
  exceptions: each must render `<DocumentTitle>` for the resolved name AND carry a server layout for the
  generic title shown meanwhile. A fourth arm keeps every declared topic non-empty and none the bare
  product name. The sweep walks `page.tsx` **and** `not-found.tsx`, whose exclusion list
  (`app/page.tsx`, a bare `redirect`) is itself asserted to still be a bare redirect so it cannot become
  a hiding place. (`apps/web/test/document-title.test.tsx`)

**The finding.** `app/layout.tsx` set `{ title: 'Gisik Nokma' }` and nothing else set a title, so
`/sign-in`, `/inbox`, `/help`, a board, a ticket sheet, `/settings`, `/privacy`, `/terms` and the 404
all read the same string. WCAG 2.2 §2.4.2 *Page Titled* is **Level A**, and its Understanding document
speaks to exactly this shape: *"for web applications (single page applications) where the view changes
dynamically, the title should also be changed dynamically to reflect the content or topic of the
current view."*

### ⚠ THE FIRST FIX SHIPPED IN THIS BATCH DID NOT WORK, AND THIS CASE PASSED THROUGHOUT IT

The first version gave each `'use client'` route a `<DocumentTitle>` whose effect writes `document.title`,
and asserted only that the mechanism was DECLARED. **It lands on zero of those routes.** Traced in Chrome
against the built app, with a forwarding `document.title` setter and a 20 ms poll of the real value:

```
  /sign-in   atMs  0  value ""                            ← no <title> yet
             atMs 21  set   "Sign in · Gisik Nokma"       ← the effect
             atMs 21  value "Sign in · Gisik Nokma"       ← it took
             atMs 42  value "Gisik Nokma"                 ← REACT PUT IT BACK
             finalTitle after 15 s: "Gisik Nokma"
  /help      setter at 127 ms; finalTitle after 4 s: "Gisik Nokma"
```

The 42 ms repair **does not go through the `title` setter** — React mutates the `<title>` NODE while
hydrating Next's `<head>`, repairing the text it finds changed under it. **The suite was green the whole
time**, because a jsdom arm can see the mechanism and cannot see this.

**Two replacements were tried and are MEASURED FAILURES**, recorded so neither is re-attempted (both in
`src/document-title.tsx`): a `useSyncExternalStore` hydration gate (the write still landed at 21 ms —
React repairs *after* hydration of the subtree, so no hydration signal precedes it), and returning
`<title>` for React 19 to hoist (**three** `<title>` elements in the hydrated document; React does not
deduplicate them and `document.title` reads the first, which is Next's — strictly worse).

### What holds, and how it is measured

**A SERVER route-segment `layout.tsx` exporting `metadata`.** A segment layout is a server component even
when the page beneath it is `'use client'`, so the title is in the head **before any JavaScript runs** —
which is what a Level A criterion actually asks for. `<DocumentTitle>` survives ONLY where the topic
resolves from a READ (the workspace and project names), whose writes land long after the repair; each of
those keeps a server layout for the generic title meanwhile.

**MEASURED against the built app on lane port 3055** (`/tmp/b03-tp12-served-titles.log`):

- **Served, every route own its own:** `/sign-in` → `Sign in · Gisik Nokma` · `/help` → `Help · Gisik
  Nokma` · `/inbox` → `Inbox · Gisik Nokma` · `/account` → `Account · Gisik Nokma` · `/settings` →
  `Settings · Gisik Nokma` · `/workspaces` → `Workspaces · Gisik Nokma` · `/privacy` → `Privacy · Gisik
  Nokma` · `/terms` → `Terms · Gisik Nokma` · `/mcp/tokens` → `MCP tokens · Gisik Nokma` ·
  `/definitely-not-a-route` → `Page not found · Gisik Nokma`.
- **Post-hydration in Chrome, the reading this case previously OWED and has now PAID:** `/sign-in`,
  `/help` and the 404 each have **exactly one `<title>`** (`titleElements: 1`), correct at the FIRST
  sample and unchanged across 4–6 s of polling.
- **That last one also proves Next honours `metadata` in `not-found.tsx`** — a file its own docs do not
  list — which is why the 404 no longer needs the client component at all.

`apps/web/src/page-title.ts` carries no `'use client'` on purpose: a directive there would turn the
helper into a client reference and break the server half, which is now every route's half.

## The project view rail is a NAMED tablist (exec1 P19, 2026-09-21) — case `13.1058`

- **13.1058** ✅ The project page's view rail — Backlog, Board, List, Calendar, Timeline — is reached by
  ROLE AND NAME (`getByRole('tablist', { name: 'Project view' })`), and the named element is the rail the
  five tabs live in, not a second tablist elsewhere on the page. The case queries by name on purpose: the
  remedy was to adopt the SHARED `SegmentedControl`, whose `'aria-label'` prop is **required**, so an
  unnamed tablist is unrepresentable at this mount rather than merely corrected once — a page that
  hand-rolled the markup again would fail this case. (`apps/web/test/project-calendar-timeline.test.tsx`)

**The finding.** The rail declared `role="tablist"` with no `aria-label` and no `aria-labelledby`, so a
screen reader met an unnamed set of five tabs on the product's primary view switcher — while the repo had
**already fixed the identical defect on the ticket sheet's tablist**
(`packages/app-core/src/views/ticket-sheet.tsx:1904`). Two real `role="tablist"` elements existed in the
product, comments excluded, and this was the one still unnamed.

**What did NOT change: the rendered DOM.** `SegmentedControl` draws the same `.gn-segmented` /
`.gn-segmented__item` / `.gn-segmented__item--on` classes, the same `tablist` / `tab` roles and the same
`aria-selected`, with the same one-boolean-per-tab derivation — so every case scoped to `.gn-segmented`
and every `role="tab"` query sees exactly what it saw before, plus the name. The suite moved
`630 → 631 passed` (the new case) with no existing case touched.

**A stale sentence in a docblock this task did not otherwise edit, replaced rather than deleted:**
`project-calendar-timeline.test.tsx`'s `viewTabs()` scoping note ended *"the view-tabs tablist itself
still carries no `aria-label` to disambiguate by name"* — true when written, expired by this change, and
now says so with the name it does carry.

**The rail's order** (Backlog first — spec §1.3, tickets are born there — while `view`'s DEFAULT stays
`'board'`) moved out of the JSX and onto `PROJECT_VIEW_OPTIONS`, whose labels are a
`Record<ProjectTab, string>`: a `Record` requires every member of the union, so a sixth tab added to
`PROJECT_TABS` without words fails `typecheck` rather than rendering an unlabelled segment — a property
the hand-written `as const` tuple array this replaced did not have.

## Every menu is named (exec1 P22, 2026-09-21) — case `13.1059`

- **13.1059** ✅ No product source declares `role="menu"` without an `aria-label` or `aria-labelledby` in
  the SAME OPENING TAG — swept over six source trees with comments stripped, taking each element's whole
  tag rather than its line so an attribute added on a continuation line counts and a multi-line tag is not
  missed. Positive control: the sweep found at least three menus, so a green cannot be "the regex matched
  nothing". Two runtime arms read the name off the RENDERED menu instead of the source —
  `getByRole('menu', { name: 'Account' })` in `app-nav.test.tsx` and
  `getByRole('menu', { name: 'Add rule' })` in `workflow-builder/inspectors.test.tsx` — because the
  accessible-name ratchet cannot see either menu: it counts attributes on routes it paints, and the
  builder's menu is only in the DOM while open. (`apps/web/test/menu-accessible-name.test.tsx`)

**The finding.** Two menus declared `role="menu"` with **no `aria-label` and no `aria-labelledby`** —
`apps/web/src/account-menu.tsx:148` and
`packages/app-core/src/workflow-builder/ui/rule-editors/add-rule-menu.tsx:47` — while a THIRD menu in the
same product, `apps/web/src/last-project-nav.tsx:249`'s `aria-label="Projects"`, showed the pattern the
other two were missing. The reviewer's control for the sweep was that same named twin: the grep that
found the unnamed menus also surface the named one.

**The words are each trigger's own.** The account menu is `"Account"` — not `Account menu for {name}`,
because the menu's own header names WHO and a label that changed with the session would describe the
person rather than the menu. The builder's is `"Add rule"`, the trigger's exact text three lines above it.

**What was NOT taken, named rather than passed over:** the reviewer's stronger remedy — a shared menu
component whose label is required by type, the shape `SegmentedControl` gave P19 — **does not exist to
adopt here**. P19's remedy worked because the component was already there with `'aria-label': string`
required; the product's three menus share no component, and writing one is a refactor beyond this
finding. So both menus carry the attribute and the SWEEP is what prevents the recurrence.

## Every navigation landmark is named (exec1 P31, 2026-09-21) — case `13.1053`

- **13.1053** ✅ No product source renders a `<nav>` without an `aria-label` or `aria-labelledby` in the
  SAME OPENING TAG, swept over six source trees with comments stripped and whole tags rather than lines.
  Positive control: the sweep found more than three NAMED navs, so a green cannot be "the regex matched
  nothing". Two runtime arms read the name off the RENDERED bar rather than the source —
  `getByRole('navigation', { name: 'Main' })` in `app-nav.test.tsx` and `{ name: 'Legal' }` in
  `not-found-and-legal.test.tsx` — because the accessible-name ratchet counts ATTRIBUTES and cannot judge
  one name against another. (`apps/web/test/nav-landmark-name.test.tsx`)

**The finding, in its own count.** Nine `<nav>` elements in product source; **seven carried a name and two
did not** — `apps/web/src/app-nav.tsx:232` and `apps/web/src/legal-nav.tsx:68`, both rendering
`<nav className="gn-nav">` with neither `aria-label` nor `aria-labelledby`. **Both co-render with a SECOND,
already-labelled `<nav>` on the same page**, so a screen-reader user who opens the landmark list meets two
`navigation` regions and only one of them says what it is. Named neighbours, for the pattern:
`settings/page.tsx:180` *"Settings sections"*, `w/[workspaceId]/page.tsx:570` *"Workspace sections"*,
`workflows/[workflowId]/page.tsx:80` and `history/page.tsx:39` *"Breadcrumb"*,
`legal-chrome.tsx:115` *"On this page"*.

**One attribute each:** `aria-label="Main"` on the product's primary bar, `aria-label="Legal"` on the legal
chrome — the reviewer's own words, and the house's: the component is `LegalNav` and its class family is
`.gn-legal*`.

### A case this change HAD to move, and why that is not a widened assertion

**`13.685`** asserted the legal pages carry **exactly ONE** `aria-label` — `['On this page']` — because its
job was to record the swap that kept `BackButton`'s departure from taking the ratchet's `ariaLabel` count
to 0. P31's whole point is that the bar above the TOC was a second, UNNAMED landmark on those very routes,
so naming it makes the page carry **two**, and the expectation becomes `['Legal', 'On this page']`. The
property `13.685` actually guards — the TOC's label is present and is exactly `On this page` — is
unchanged and still asserted; what is gone is the incidental *"and nothing else on this page is
labelled"*, which was never about the TOC. The reason is written into the case rather than the number
quietly edited.

### The ratchet RISES, and a rise is the direction nothing checks

`e2e-viewport` and `e2e-stack` both assert `toBeGreaterThanOrEqual(baseline[attr])` — **read in both spec
files rather than assumed**, because a rise that failed would break the e2e gate. The `ariaLabel` count
rises on every route `AppNav` renders and 1 → 2 on `/privacy` and `/terms`. It is recorded here, in
`legal-chrome.tsx`'s own note (whose paragraph said *"the top bar and this row"* while the top bar was
still unnamed — the correction names the half that was missing), and in the PR body, rather than absorbed.

## The shell names a person who has no display name (exec4 E4-33, 2026-09-21) — case `13.1054`

- **13.1054** ✅ The two labels every signed-in screen carries name the person even when the account has
  no display name — the product's DEFAULT email sign-up, where magic-link sign-up creates `name: ''` and
  the sign-in form asks for none. `/workspaces`' `<h1>` reads `Workspaces — accountant@e2e.gisik-nokma.local`
  rather than the measured `Workspaces — `, the nav button reads
  `Account menu for accountant@e2e.gisik-nokma.local` rather than `Account menu for `, and the monogram
  draws `AC` rather than `?`. Each arm runs the SAME assertions against a named person first as its
  positive control, because the defect is only visible in the difference between the two — and the
  heading arm asserts the absence of a trailing em dash as well, so a regression that appends the address
  somewhere else still fails. (`apps/web/test/display-label.test.tsx`)

**The measurement.** Painted as the seeded guest `accountant@e2e.gisik-nokma.local`, `name = ''`:
`h1.gn-page-title` → `"Workspaces — "`; `button.gn-nav__avatar-button` → `aria-label === "Account menu for "`,
glyph `?`, `title=""`, `aria-label=""` on the avatar span. The signed-in owner paints
`Workspaces — Kiro` / `Account menu for Kiro` / `KI` on the same elements.

**One module, not a `||` at each site.** `apps/web/src/display-label.ts` holds `displayLabelOf` (name, else
email, else `''`) and `avatarNameOf` (name, else the email's LOCAL PART — the domain is the same for
everyone on a hosted service and would put the same letters in every monogram). **The contract that
matters is that `''` means NO LABEL, and every caller omits its suffix for it** — which is why the h1 and
the button are ternaries rather than interpolations, and why neither can reproduce the dangling
punctuation for a person who has neither a name nor an address. `useCurrentUser` types `email` as
`string | null`, so that case is reachable and not hypothetical.

**Two things deliberately NOT changed, named rather than passed over.**

1. **`initialsOf`'s `?` fallback stands.** A person with neither a name nor a usable address has no handle
   to draw from, and `?` is its own documented answer (`packages/ui/src/components/avatar.tsx:19`). What
   changed is that the caller stops FEEDING it an empty string.
2. **The account menu's header still renders `{user.name}`.** It is a two-line block with the email on its
   own line below, so a nameless person sees one line, not a dangling one — and routing it through
   `displayLabelOf` would print the address TWICE, once bold and once muted, which is worse than the gap
   it would close.

**Not to be confused with two neighbours:** exec 5's E5-4 (the visibility editor's people picker) and
E4-6 (provenance's raw-id fallback, where `provenance.ts` records a RULED decision to attribute rather
than blank). This is the shell.

## A skip link, for the person pressing Tab (exec1 P13, 2026-09-21) — case `13.1055`

- **13.1055** ✅ The product's first focusable element is a `Skip to content` link whose target resolves:
  the rendered anchor is asserted to be FIRST among the focusable elements and to point at an id that a
  real element carries; a sweep asserts every route's RENDERING `<main>` carries that id, so the next
  route added without one reddens rather than shipping a dead anchor; and the layout arm asserts the
  control renders before `<Providers>` with comments stripped and that `.gn-skip`/`.gn-skip:focus` exist
  as two rules read separately — hidden by clipping, never `display: none`, which would take it out of the
  tab order. (`apps/web/test/skip-link.test.tsx`)

**The finding, and the part of it that was WITHDRAWN.** The reviewer's sweep —
`grep -rniE 'skip[ -]?(to|link)|gn-skip'` over `apps/web/app`, `apps/web/src`, `packages/app-core/src`
and `packages/ui/src` — returned **zero lines**, while the same sweep with the needle `aria-label`
returned 166, so the instrument traverses. **The lane withdrew the WCAG 2.4.1 *Bypass Blocks* citation**
(landmarks satisfy it) and the surviving core is filed MINOR: a keyboard-only user Tabbed the whole nav on
every navigation. **The fix is argued from the measurement, not from a criterion the product already
meets.** Re-running the reviewer's own sweep after the change returns 12 lines.

**What was built.** `apps/web/src/skip-link.tsx` (an anchor, no `'use client'` — a directive there would
push the whole shell tree client-side for one `<a>`), rendered in `layout.tsx` before `<Providers>`, plus
`id="gn-main"` on each route's rendering `<main>` and the `.gn-skip` rules in `globals.css`.

**MEASURED in the real prerendered output** (`next build` → `.next/server/app/workspaces.html`):
`<a class="gn-skip" href="#gn-main">Skip to content</a>` at byte **14060**, the first `<nav` at byte
**14147** — the anchor precedes the chrome in the delivered HTML, which is what makes it the document's
first focusable element.

⚠ **What is NOT proved:** that the link is **invisible until focused**. jsdom applies no stylesheet and
neither does this HTML, so a skip link drawn as a permanent banner would pass every assertion in the
suite. The rules exist and are asserted as two separately-sliced blocks (an earlier cut sliced to EOF, so
its `display: none` check was asserting a property of the rest of the file); the *visually hidden* half is
a BROWSER reading and is **owed**, not claimed.

**Two cuts of this test that could not have failed, both caught before commit:** the layout arm read
`indexOf('<Providers>')` over RAW source and found the one in the docblock that explains the ordering —
*the prose about the property defeated the check for the property*, `expected 2778 to be less than 2428`;
and the id-placement pass over the routes was written with an inverted self-closing test, so the id landed
on the five Suspense FALLBACK shells and on none of the real `<main>`s. Both are recorded because each
looked green-ish for a moment.

## The project page's loading arms announce themselves (exec2 V6, 2026-09-21) — case `13.1056`

- **13.1056** ✅ Every `Loading…` arm on the project page carries `role="status"`, and there are **exactly
  five** — the count is PINNED, because exactly one arm renders at a time and no single mount can see them
  all, so a sweep is the only instrument that can assert them together; a sixth arm added bare reddens and
  so does a removal. In the same sweep, none of the file's `role="status"` sites spells `aria-live` — the
  arms MATCH the file's own three create-region waits rather than inventing a second shape for the same
  job, and the site count is asserted as `arms.length + 3` so it says where it comes from. One runtime arm
  in `project-calendar-timeline.test.tsx` reads the role off a RENDERED arm, with `getBoard` never
  settling, scoped to the status whose text IS the loading words — a bare `getByRole('status')` would pass
  against the create region's own with the arm still bare. (`apps/web/test/loading-status.test.tsx`)

**The finding.** Five arms rendered a bare `<p>Loading…</p>` — calendar, timeline, list, board and backlog
— **in a file that uses `role="status"` three times already**, in the create region (`:1759`, `:1768`,
`:1810`). A screen reader got the words with no announcement on every view but the one whose waits the file
had decided deserve a role. The reviewer's own instrument was a single grep for `Loading…`, which returned
exactly those five lines with no role on any of them.

**The measured count is five, re-measured rather than inherited:** a grep for `Loading…` over the file
returns five live arms plus two DOCBLOCK mentions (`:99-100`), which is why the sweep strips comments
before counting — a raw search would have counted prose as implementation.

⚠ **One number in this case was wrong on the run that proved the fix**, and it is recorded rather than
quietly corrected: the create-region assertion read `toBe(3)`, written against the PRE-fix file and left
in place when the five arms joined it, so it failed `expected 8 to be 3`. It is now `arms.length + 3` — a
count that says where it comes from, because one that has to be re-derived whenever the thing it counts
grows is a count nobody maintains.

## Task 1 of the HIG per-screen plan (2026-09-08) — the four shared pieces every screen reuses

- **13.288** ✅ `SegmentedControl` renders `role=tablist` (named by a required `aria-label`), one
  `role=tab` per option, `aria-selected` true on exactly the chosen one, and calls `onChange` with the
  clicked value — the exact roles `.gn-view-tabs` carried, so replacing it registers no loss on 13.285.
  — (`packages/ui/test/components.test.tsx`)
- **13.1051** ✅ `SegmentedControl` implements the tab keyboard model its roles promise. Declaring
  `role="tablist"` / `role="tab"` / `aria-selected` tells assistive tech to announce "tab, 1 of 3" and
  tells the person listening that the arrow keys move between tabs; none did. Measured by grep on the
  component (`onKeyDown` / `Arrow` / `tabIndex` / `aria-controls` / `tabpanel` → nothing) and confirmed
  with real key events: ArrowRight left focus on the same tab, and every tab was its own Tab stop, which
  is the opposite of the pattern — one stop per tablist, arrows within it. Now: a roving `tabindex` with
  exactly one tab at `0` and the rest at `-1`, ArrowRight/ArrowLeft moving focus and selection with
  wraparound at both ends, and Home/End jumping to the first and last. Selection follows focus, which is
  the pattern's automatic activation and what a single-choice segmented control means. **ArrowUp/ArrowDown
  are deliberately NOT handled** — optional in the pattern, and claiming them would swallow vertical
  scrolling on a control that sits inside scrolling pages. **`aria-controls`/`tabpanel` is deliberately
  NOT added**, and that limit is the finding's own fork resolved rather than dodged: `SegmentedControl` is
  generic and has seven render sites of two kinds — the sheet's *Details*/*History* and the help browser's
  sections really do switch a panel in place, while the theme and style toggles, `/inbox` and `/sign-in`
  switch a setting or a route — so the finding's first alternative (`aria-pressed` on a group of buttons,
  needing no keyboard model at all) would misdescribe the panel-switching sites, and the second half needs
  a `tabpanel` id no caller passes. Every case asserts focus as well as `aria-selected`, with the focus
  control run first, so a component that never received focus cannot pass by having nothing to move.
  Mutation-witnessed: dropping the roving `tabindex` alone reddens three of the four (one-tab-stop,
  ArrowRight, Home/End) and leaves the ArrowLeft-wraparound case green, because that case asserts focus
  and selection and not the tab-stop attribute — recorded as measured rather than rounded up. —
  (`packages/ui/test/components.test.tsx`)
- **13.289** ✅ A ghost button renders as fill plus an accent 600 label with **no painting border on either rule** — the modifier AND the base, because `button.tsx` always emits them together and a boundary reintroduced on the base would reach the screen while a modifier-only assertion stayed green.
  *The plan justified this case with "its 2.49:1 border was its only affordance". **That was true of the pre-#354 tree and is false now** — the border sweep removed it and the base `.gn-button` has carried `border: none` plus the fill, accent and weight ever since, so the new modifier rule is inert duplication that repairs nothing. Corrected here rather than left standing, because this file is read later as a record of what the tree used to be.*
  *And the guard the plan shipped could not have caught what it names: `not.toMatch(/border:\s*1px/)` sees only the shorthand, so **`border: 2px solid` beside a `border-color: transparent` passed green**, demonstrated. Widened to any border longhand that PAINTS — `-color` and `-radius` excluded because neither draws one, and `none`/`0` excluded because they are how a rule says there is no border, which the first draft of the regex forbade and went red against a correct file.*
  affordance), is fill `--gn-fill-tertiary` + accent 600 label with `border-color: transparent`.
  Mutation-witnessed: restoring a border reddens it by name. — (`packages/ui/test/components.test.tsx`)
- **13.290** ✅ `.gn-refusal--preview` / `--server` carry tone as `inset 4px 0 0` box-shadow fills, and
  *Same widening as 13.289, and it was needed here too: the shipped `/\bborder:/` let **`border-left: 4px solid` beside the inset shadow** pass green — a visible rule on the one panel whose whole job is to look like content rather than decoration.*
  declare no `border`. The honesty panels are the last thing that should look decorative. —
  (`packages/ui/test/components.test.tsx`)
- **13.291** ✅ `.gn-field__input` keeps `border: 1px solid var(--gn-border)` — the one R1(c) exception,
  because an empty field has no label to identify it. — (`packages/ui/test/components.test.tsx`)

## Sign-in on the HIG surface (2026-09-08) — Task 2 of the per-screen plan

- **13.292** ✅ **AMENDED 2026-09-08 (controller ruling). Its property is now: _every method the server
  will accept is offered, and no control the server will refuse is rendered._** The struck property
  below is kept rather than deleted, per the ruling, because it is the finding: ~~The sign-in restyle
  keeps all four shipped methods — Phone (default), Email link, Continue with Google, Sign in with a
  passkey — where the prototype drew two. Mutation-witnessed: removing the passkey button reddens
  this.~~ **Two of those four could not work — Google was unconfigured on the dev stack and passkey has
  no registration flow anywhere in app code — so a case that pinned their presence was pinning the
  defect.** The case now drives `/v1/auth/methods` through `page.route` in BOTH directions at each
  viewport: with `{google:false, apple:false}`, count 0 for Google, Apple and the passkey button and no
  `.gn-sign-in__marks` row; with `{google:true}`, `Continue with Google` at count 1, visible, and
  `toHaveText('')` because it is icon-only with the shipped wording in `aria-label`. Passkey is asserted
  by `autocomplete="username webauthn"` on the email input, never by a button.
  **THE NEGATIVE HALF WAS A CHECK THAT COULD NOT FAIL BEFORE THE ANSWER WAS DRIVEN, and a mutation
  proved it rather than a reading.** This suite runs `next dev` with no API behind it, so
  `/v1/auth/methods` never resolved, the page's availability state stayed `null`, and nothing rendered
  whatever the gate did — a mutation dropping the provider check and rendering the row on any answer
  left all three viewports GREEN. With the empty answer supplied and a positive control asserting the
  page came back, the same mutation reddens: Expected 0, Received 1, ×3. **13.285 (the accessible-name/role ratchet) was
  expected to also redden and did NOT** — `Button` (`packages/ui/src/components/button.tsx`)
  renders a plain `<button>` with no explicit `role`, `aria-label`, `aria-selected` or
  `aria-describedby` attribute, so removing one moves none of the four counts
  `sweepAccessibleNames` tracks; its accessible name comes from text content and its role is
  implicit from the tag. 13.285 is inert against the loss of a whole unlabelled button — a real
  gap in that guard, reported rather than papered over. — (`apps/web/e2e-viewport/responsive.spec.ts`)

> **13.292 AMENDED AGAIN, 2026-09-15 (final whole-branch review of the account/help-screens plan, fix
> wave item 1).** The "count 0 ... for the passkey button" sentence above described the case as it
> stood *before* Task 8: registration now exists on `/account`, so the passkey button is no longer one
> of the two methods "that could not work". The case's own code kept asserting `toHaveCount(0)` for it
> anyway — a stale assertion Task 8's own audit had already found and fixed once, in the identical
> shape, in `apps/web/e2e/smoke.spec.ts`; this file just sat outside that audit's `apps/web/e2e/` grep
> scope. Deterministic red, not gated by CI (this suite isn't in the turbo gate), caught only by this
> review. Fixed to `toBeVisible()`: the passkey button is not gated on `/v1/auth/methods` the way
> Google/Apple are (it needs no provider), so it is the one control that survives the all-refused
> answer this case drives — the honest expectation is now Google absent, Apple absent, the passkey
> button visible, and no `.gn-sign-in__marks` row.

- **13.293** ✅ The adopted helper text ("It expires in 15 minutes.") renders on the Email method
  only, not on Phone. — (`apps/web/e2e-viewport/responsive.spec.ts`)
- **13.294** ✅ No `Password` tab exists on sign-in; `auth.ts:84` forbids the method
  (`emailAndPassword: { enabled: false }`). — (`apps/web/e2e-viewport/responsive.spec.ts`)

## The owner's sign-in feedback round (2026-09-08) — item 2, the methods that can work

*The owner's item 2 read "Google and Apple, as logo marks". The work underneath it was not icons: two
of the four visible sign-in options could not succeed for anybody. Item 2 is therefore **render only
what works, then style what remains**.*

- **13.324** ✅ `GET /v1/auth/methods` answers which social providers this server will accept, and the
  answer is read off `auth.options.socialProviders` — **the constructed better-auth instance**, not the
  environment and not a copy any caller kept. `toEqual` and not a partial match, because the point is
  that the route says NOTHING else: a body that grew a client id would satisfy `toMatchObject`. Each
  provider is asserted alone as well as together, since `{google:true,apple:true}` and
  `{google:false,apple:false}` are both satisfied by a route returning one boolean twice. One case also
  pins that **better-auth preserves the ABSENCE of an unconfigured provider in `options`** — if a future
  version normalised absent keys into present-and-disabled ones, every boolean would silently become
  true and the dead button would come back. — (`apps/server/test/routes/auth-methods.test.ts`)
- **13.325** ✅ "Empty disables" is a property of this repo rather than a vendor coincidence. The whole
  cross-product of the four variables, asserted twice per row — once on the config
  `socialProvidersFromEnv` builds, once through the real route on a real auth instance built from it,
  because asserting the config alone would pass against a route that never consulted it. **The mixed
  rows are the ones that matter**: an id with no secret is the state a deployment is in for the seconds
  between setting two variables, and it must read as OFF, not as ON-and-broken. Empty strings and
  whitespace are included; `.env.example` ships the empty pair. A separate case asserts the optional
  `APPLE_APP_BUNDLE_IDENTIFIER` is OMITTED rather than present-and-undefined, via `Object.keys` —
  `toEqual` treats a key holding `undefined` as absent and would pass against the shape being avoided.
  — (`apps/server/test/routes/auth-methods.test.ts`)
- **13.326** ✅ The page renders exactly the social methods the server accepts. The load-bearing shape
  is a **DISCRIMINATION case, and it replaced a negative that could not fail** — the second instance of
  that defect in this one change set, found by mutation and not by reading.
  *The first version answered `{google:false, apple:false}` and wrapped the absence in `waitFor`.
  **`waitFor` waits for nothing when its callback asserts an absence**: it retries until the callback
  PASSES, and "the button is not there" passes on the first tick, before the fetch resolves and before
  the page has been told anything. The mutation that drops the per-provider check and renders the row
  on any answer left it GREEN. It asserted the absence of a state update, not the presence of a gate —
  and the comment at the site claimed `waitFor` handled it, which is what made the gap read as covered.*
  The replacement answers **asymmetrically** — `apple: true, google: false`, then the reverse. The
  enabled button appearing is a positive, genuinely awaited signal (`findByRole` waits because it waits
  for something to EXIST) and the other's absence is read off the same settled DOM; no tick passes
  vacuously. Both orderings run, because a page rendering whichever provider it checked first satisfies
  one of them. The all-disabled answer is kept for the one thing the asymmetric pair cannot show — that
  the marks ROW disappears rather than rendering empty — anchored on the fetch having been made and its
  body consumed plus a microtask flush, which is weaker by construction and labelled so at the site.
  With the server answering all-true, both buttons resolve by their exact shipped accessible names,
  have empty text content (icon-only), and each reaches the provider it names — a mark wired to the
  wrong provider would satisfy every other assertion. Passkey is asserted as
  **no passkey request at all, plus the field kept ready** — and the deferral is the finding.
  *The dispatch specified `signIn.passkey({ autoFill: true })` as the replacement for the dead button.
  Two defects were found in it, in order. First it fired on MOUNT with `[]` deps while the default tab
  is Phone, so the only field carrying `autocomplete="username webauthn"` was not rendered and the
  request had nothing to attach to — the replacement for the dead button was itself dead, and every
  test passed because a mock can see that a call happened and with what argument but not that the call
  was pointless. Then, with that fixed, review DEMONSTRATED the real objection:
  `signInPasskey` issues `GET /passkey/generate-authenticate-options` as its first statement, charged
  against the shared `auth:` bucket (`RATE_LIMIT_AUTH_MAX` = 10/60s in production); ten such probes
  through the assembled app made the eleventh real `POST /sign-in/magic-link` answer **429**, with a
  zero-probe control answering 500 and not 429, and `http/rate-limit.ts` records as measured that a web
  container proxies every browser into ONE client key. **A request that spends a shared sign-in budget
  on a flow with zero possible successes is this round's own defect one layer down.*** So the case now
  asserts there is no passkey button, that the email field DOES carry the token (asserting only "no
  button" would let the request return silently; asserting only "no request" would let the token be
  dropped and Task 12 start from a worse place), and — after a microtask flush, because asserting
  immediately would pass against a page that fires one tick later — that `passkey` was never called.
  Turning mediation on is Task 12's, in the change set that makes a passkey obtainable.
  *(Refuted limb, recorded so nobody builds against it: the challenge rows are NOT unbounded.
  `findVerificationValue` sweeps expired rows globally on every call, `disableCleanup` is unset, and
  phone-OTP verification calls it. No cleanup job is owed.)*
  Mutation-witnessed: the provider check dropped reddens the discrimination case and the all-disabled
  case; the `google:true, apple:false` ordering correctly stays green because that mutation leaves
  Apple's branch intact, which is why two orderings run. — (`apps/web/test/sign-in.test.tsx`)

> **Case 3.84 was amended in the same change set** (`apps/web/test/sign-in.test.tsx`): it asserted that
> all four methods render as controls, and asserting the presence of the two that could not work is what
> kept them on screen. Its property is now *phone and email are offered unconditionally, and nothing
> password-shaped is*; the social pair and passkey are 13.326's subject. The password absence is
> unchanged — `auth.ts:84` forbids the method, so the prototype's Password tab is not merely absent.

> **What the `/sign-in` accessible-name floor raise does and does not guard, stated because the
> difference is not visible from the number.** The key was recorded at Task 0, before Tasks 1 and 2
> added labels, and `recordAccessibleBaseline` refuses to overwrite an existing key — so the tree
> emitted one `aria-label` against a floor of `0` and a deletion would have cleared it. Raised to 1 and
> witnessed: deleting `SegmentedControl`'s label reddens 13.285 at all three viewports. **It does NOT
> guard the two icon buttons' labels**, because those render only when a provider is configured and this
> suite's server has no credentials. Those are guarded by 13.326 in the unit suite. A floor that cannot
> see the thing it was raised for is worth naming rather than counting.

## The owner's sign-in feedback round (2026-09-08) — items 1 and 3

*Four items came back from the owner's live look at `/sign-in` on `ebb21aa`. Items 1 and 3 are here;
item 2 (render only the auth methods that can actually work, then style them) is its own change set
because the finding underneath it is a product gap, not a styling one.*

- **13.334** ✅ With the server reporting `phone: false` — the dev stack's real state — `/sign-in`
  offers **neither the Phone tab nor the OTP form nor a segmented control at all**, at all three
  viewports, and Email link is the method the page opens on. The Email field is asserted FIRST and is
  what makes the four zero counts mean anything: it is a positive, awaited signal that the answer
  arrived and the page re-rendered against it, and without it **a blank document satisfies every
  `toHaveCount(0)` in the case** — the same vacuous shape 13.292's own social half was rewritten to
  escape, which is why it is not repeated here. The answer is supplied by `page.route`, because this
  suite's `next dev` has no API behind it and an unanswered fetch leaves the page's availability state
  `null`, which renders nothing whatever the gate does. Mutation: dropping `phoneAvailable ?` in
  `sign-in/page.tsx` so the control renders unconditionally → RED at all three viewports.
  — (`apps/web/e2e-viewport/responsive.spec.ts`)
- **13.335** ✅ And with `phone: true` driven through `page.route`, the Phone tab is back, Email link
  beside it, and **phone is the default** — the half that stops 13.334 from being satisfied by simply
  deleting phone sign-in. The phone FORM is asserted, not merely the tab: a selected tab sitting over
  the email form is the state the page would reach if `method` were stored and corrected by an effect
  rather than derived, and that state is unrecoverable by clicking because the tab that would switch
  back is the one that is missing. Mutation: forcing `method` to `'email'` → RED here, and 13.334
  stays green, so the two cases fail for different reasons.
  — (`apps/web/e2e-viewport/responsive.spec.ts`)
- **13.336** ✅ `GET /v1/auth/methods` reports `phone` from the sender the running auth instance holds
  — `NullOtpSender` ⇒ `false`, a sender that can deliver ⇒ `true` — and **both directions are pinned**,
  because the false half alone would pass forever against a route that hard-coded false. The third
  case builds two apps in ONE process, so `process.env` is byte-identical for both, and they disagree:
  no answer derived from an environment variable can produce two different booleans there, which is
  what makes "from the selection, not from env" a measurement rather than a claim. That case is also
  the one that fails if the route is "simplified" into calling `selectOtpSender()` itself, which
  re-decides instead of reporting and so stops reporting on the instance that actually sends.
  Mutations: hard-code `phone: true` → RED on exactly two cases, both 13.336's, naming their own site;
  hard-code `phone: false` → RED including 13.336's true half; substitute `selectOtpSender()` for
  `auth.otpSender` → RED on the true half and the disagreement case, with the false half correctly
  still green. — (`apps/server/test/routes/auth-methods.test.ts`)

- **13.321** ✅ The sign-in sheet is centred in the viewport — **both halves, measured from the live
  box rather than the computed style.** (a) the `<main>` is at least the viewport height, and (b) the
  space above its first child equals the space below its last within 2px. *Either assertion alone
  passes on a broken page: a full-height container with the content pinned to the top satisfies (a),
  and a shrink-to-fit container satisfies (b) trivially because its own padding is all the space
  there is.* Asserting `justify-content: center` instead would have been the useless check — the card
  was ALREADY `margin: 3rem auto` and therefore already centred horizontally, and a declaration does
  not say which axis a reader sees. Mutation: deleting `justify-content` reddens (b) on all three
  viewports; deleting the two `min-height` lines reddens (a). — (`apps/web/e2e-viewport/responsive.spec.ts`)
- **13.322** ✅ **SUPERSEDED 2026-09-18 (Step 2c-2) — its SUBJECT is gone, not its claim being false.**
  The refreshed export's `isLegal` block draws a top bar with **no back affordance at all**
  (`desktop.dc.html@6d7b67c0a52c:1720-1755`), so the control this case witnessed was removed by the
  port. Read the block at the end of this file for what replaced it and what was lost with it; the
  text below is kept because the ruling it pinned was real. — `/privacy` carries a Back control, and
  **the branch that matters is the one without history.** The accessible name is `Back to the previous page` while the visible word is `Back` —
  asserted as containment, which is WCAG 2.5.3 (Label in Name) and what keeps voice control working.
  With `history.length > 1` the control calls `router.back()` and never `push`; with `history.length`
  driven to 1 it calls `push('/sign-in')` and never `back()`. *An unconditional `router.back()` is
  indistinguishable from a correct control on every page a test navigates to — it fails only for the
  reader who opened the link in a new tab, where `back()` is a silent no-op and the page appears
  frozen.* Mutation: deleting the `history.length > 1` guard reddens the second case alone. —
  (`apps/web/test/not-found-and-legal.test.tsx`)
- **13.323** ✅ **SUPERSEDED 2026-09-18 (Step 2c-2), the same removal as 13.322.** — The same pair for
  `/terms`. Both pages get the case because both had the same defect:
  they linked only to EACH OTHER, so a reader arriving from the sign-in card could cross between them
  indefinitely without ever returning. — (`apps/web/test/not-found-and-legal.test.tsx`)

> **The accessible-name floors for `/privacy` and `/terms` were RAISED in this change, deliberately.**
> Both keys read `ariaLabel: 0` and the pages now carry one. The baseline writer refuses to overwrite
> an existing key (`recordAccessibleBaseline`, `accessible-names.ts:63`) precisely so a regression
> cannot re-baseline over itself, so raising it means deleting the key and letting the run record it —
> which is what happened here, in this commit, for these two routes only. **Leaving the floor at 0
> would have left 13.285 unable to see the new label disappear**, which is the same inertness 13.292
> already records for an unlabelled button. Raising a floor only ever tightens the gate; lowering one
> is the move that needs the argument.



> ### Two things Task 2 corrected that belong to earlier PRs, recorded here because nothing else would
>
> **The segmented control shipped 4px under the tap-target floor.** `.gn-segmented__item` landed in
> #360 with `min-height: 2.5rem` — 40px against the 44px this repo's own ratchet enforces and every
> other control here uses. **It was invisible for exactly one PR because nothing rendered the component
> yet**; sign-in is the first screen to use it, and the ratchet reddened on all three viewports the
> moment it did. Raised to 2.75rem, with the reason written at the site. *Controlled: reverting the
> line to #360's value reddens `/sign-in` at 390, 768 and 1512.* **A number that only becomes wrong
> when something finally uses it is the kind a component library ships most easily.**
>
> **13.292 claimed a default it did not assert.** Its own text says "Phone (default)", and review
> showed the whole viewport suite stayed green with `useState<Method>('phone')` flipped to `'email'` —
> the only thing that reddened was an unnamed vitest case that types into "Phone number" without
> clicking the tab, i.e. it caught the default by accident. The assertion is now explicit.
> *Controlled: the same flip now reddens three viewports.*

> ### One deviation from the plan's literal JSX, declared rather than left for a reader to find
>
> The plan puts the adopted helper text *before* the `{emailSent ? …}` ternary; it shipped inside the
> not-yet-sent branch, so the hint disappears once the link is on its way rather than sitting above the
> confirmation. Kept, because a hint about what a button will do reads oddly beside a message saying it
> already happened — but the plan called Task 2 transcription, and this is a departure from it.
> **13.293 cannot see the difference**, since it never sends; that is a limit of the case, not evidence
> the placement is right.

## Task 4a / 4b of the HIG per-screen plan (2026-09-08) — Workspaces + Invite

The surface half is transcription and carries no new ids: `/workspaces` and `/invite/<token>` move onto
`surface-raised` at 12px with no container borders, the founding form adopts the shared `.gn-field`, and
the guard is the existing suites plus the ratchet. **The ratchet is the part that needed fixing first**:
Task 4's dispatch said the signed-in sweep already watched `/workspaces`, and it did not — the baseline
held five keys and neither of this task's routes was among them. `/workspaces` joins it here.
`/invite/<token>` does NOT, and the reason is recorded in `docs/pre-launch-checklist.md` with a named
owner rather than left as an absence a later reader mistakes for coverage: this suite holds no standing
invite token, and a token-less visit renders the DEAD-LINK branch, so the baseline would pin a page
nobody ships and then defend it.

- **13.298** ✅ A 401 from `/v1/me/workspaces` leaves the **real browser settled on `/sign-in`** — the
  navigation itself, which nothing had ever witnessed. **This is NOT the case the plan specified, and
  the substitution was measured rather than argued.** The plan asked for *401 renders
  `ExpiredSessionNotice`, mutation: delete the 401 branch → RED, **alone***. Deleting that arm on a
  committed tree gives `EXIT=1`, **19 pass / 1 fail**, and the failure is a PRE-EXISTING case —
  `apps/web/test/page-refusals.test.tsx:180` — which already asserts the notice, the `push` and the
  absence of the spinner, so "alone" was unsatisfiable before the plan was written. And it could not
  have been witnessed in a browser at all: `useSignInOnExpiredSession` pushes to `/sign-in`, so the
  notice is transient and mutant and original both SETTLE there. **A case whose mutation cannot redden
  it is not a guard.** Re-pointed by controller ruling at the claim every other case only assumes:
  `page-refusals.test.tsx:180` awaits `expect(push).toHaveBeenCalledWith('/sign-in')` — *a double that
  records a call is not a browser that moved*. The two are complements: that one owns what is rendered
  in the interim, this one owns where the browser ends up. The positive control is `/sign-in`'s Email
  field and deliberately **not** the redirect, because a page that failed to load would leave the
  pathname at `/workspaces` and read as a clean kill for the wrong reason. `?next=` is **not** carried
  by the push (`/invite/[token]` does carry one on its own link, so the product is inconsistent); the
  assertion checks the PATHNAME only and leaves the query free, so adding `next=` later is not a test
  change. Mutation: delete `router.push('/sign-in')` from `expired-session.tsx` → **WITNESSED RED on
  all three viewports and on this case ALONE** (13.299 and 13.300 green in the same run). **What
  reddens is the POSITIVE CONTROL, not the pathname assertion** — an earlier draft of this row said
  "RED naming both routes", which the run disproved: with the push gone the browser sits on
  `/workspaces`, so `getByLabel('Email')` times out first and the pathname line is never evaluated.
  Its long diagnostic is unreachable under THIS mutation and is kept for a different one — arriving
  somewhere that is neither route. The row is corrected rather than the assertions reordered, because
  putting the pathname check above the control would restore the message and destroy the control's
  own reason for existing. — (`apps/web/e2e-viewport/responsive.spec.ts`)
- **13.299** ✅ `/workspaces` with the roster answering `[]` renders the empty-state sentence and the
  founding form's `Create workspace` button. **The empty-state sentence is the positive control and its
  position is load-bearing**: `<FoundingForm />` renders OUTSIDE all four branches of that page — by
  design, so a person who cannot be told which workspaces they are in can still found one — which means
  `Create workspace` is visible on a page that never received an answer at all. Asserting it first would
  establish nothing about the stub. The sentence is the only thing on the screen gated on `[]`.
  Reordering the two assertions destroys the case without reddening it. The `<h1>` is deliberately NOT
  asserted: it renders `Workspaces — {user.name}` from a session request `next.config.ts` proxies to the
  running stack, so its text is whichever developer is signed in on the machine — the same class of leak
  that put a live Google credential in a baseline on 2026-09-08. Mutation: delete the
  `workspaces.length === 0` arm → RED. — (`apps/web/e2e-viewport/responsive.spec.ts`)
- **13.300** ✅ `/invite/<token>` names the workspace **and the role** —
  `/You are invited to join .+ as (admin|member|guest)\./`. The role is the whole point: the prototype's
  sentence drops it and the copy rule rejects that, because a person accepting an invitation is being
  told what they will be able to do. The alternation is the shipped `InviteSummary['role']` union, not a
  guess. Matched on the `.gn-invite` container rather than one element, because the sentence is split
  across three text nodes and a `<strong>`. Two assertions that do not subsume each other: removing the
  `<strong>` reddens the name assertion but **not** the regex. The last assertion says the DEAD-LINK
  branch is not what was measured — a stubbed body that failed `createHttpInviteGateway`'s validation
  would render that branch and read exactly like a copy regression. Mutation: drop ` as {invite.role}` →
  RED. — (`apps/web/e2e-viewport/responsive.spec.ts`)

> ### The next-free pointer at the head of this file already collides, and it is NOT this task's doing
>
> `13.321` is what the plan's Global Constraints tell the LAST task of the series to set the pointer
> to — and `13.321` is **already consumed by a live case in this file**. Verified pre-existing on
> `origin/main`, so nothing on this branch caused it. Recorded because Task 11 will walk into it, and
> because this branch is the last to touch this section. The pointer is a CACHE — this file warns
> that twice about itself — and this is the third time one has gone stale here.
> **Owner: the controller, who allocates the blocks.**

> ### The instrument cannot see a case that has no catalogue row
>
> Found while writing these: `check-case-citations` runs catalogue → test, so an id **cited by a test
> with no row in this file is invisible to it**. Both id checkers stayed green with 13.299 and 13.300
> cited from `responsive.spec.ts` and no rows here. The direction it guards — deleting the last citing
> test for a catalogued case — is real; the opposite direction is not guarded at all, and nothing in the
> repo would have reminded anyone to write these three rows. Recorded rather than fixed: widening it is
> a change to a shared instrument, not part of Task 4.

## Ruling E4-22 — the board row carries an accessible name (2026-09-21, B14, block `13.1187`–`13.1196`)

*`board-screen.tsx`'s row (`TouchableOpacity`) had no `accessibilityRole` or `accessibilityLabel`, so
VoiceOver/TalkBack read it as unstructured text rather than as a button naming the ticket. Fixed by
extracting `boardRowAccessibilityLabel` (`board-row-a11y.ts`, a sibling `.ts` — `apps/mobile/src`'s
`.tsx` files stay thin and untested at this layer) and wiring
`accessibilityRole="button"`/`accessibilityLabel={boardRowAccessibilityLabel(item)}` onto the row.*

- 13.1187 ✅ `boardRowAccessibilityLabel` names the ticket's title and state, comma-separated, the
  same pair the row's visible text shows — RED confirmed against a pre-fix stub that returned `''`
  (no accessible name at all), GREEN after. —
  (`apps/mobile/src/screens/board-row-a11y.test.ts`)

## Ruling P28 — every pressable under apps/mobile/src carries a role (2026-09-21, B14, block `13.1187`–`13.1196`)

*The finding's own measurement claimed "all six pressables in the app, each opened" — PARTIAL per the
judge. Opened and counted here, correctly this time: `board-screen.tsx`'s row (1, fixed by E4-22) and
`help-screen.tsx`'s tab `Pressable` (1, already carried `accessibilityRole="button"`). `app.tsx`,
`ticket-screen.tsx` and `editor-web-view.tsx` have no `TouchableOpacity`/`Pressable`/
`TouchableHighlight`/`TouchableWithoutFeedback` at all. Total: **2**, not six. `pressable-a11y-sweep.ts`
makes this census a standing test rather than a one-time count — per PRESSABLE, not per file: a
per-file aggregate first draft scored the real pre-fix `board-screen.tsx` `ok: true` (four sibling
`<Text accessibilityRole="text">` attributes covered for the `TouchableOpacity`'s zero), verified
against the actual pre-fix history before being replaced with the per-tag version shipped here.*

- 13.1188 ✅ Every real pressable under `apps/mobile/src` carries a role, and the census is exactly
  `2` — plus a negative control (a bare pressable with no role → `ok:false`), a positive control (one
  that carries the role → `ok:true`), and the specific regression a sibling `<Text
  accessibilityRole>` must not mask. —
  (`apps/mobile/src/screens/pressable-a11y-sweep.test.ts`)

## The bar's project item and the card door do not share one name (`rel/browser-findings`, 2026-09-22) — case `13.1217`

- **13.1217** ✅ On a workspace home, **exactly one** link answers to the project's own name, and it is the
  project card's door: `screen.getAllByRole('link', { name: 'Shop operations' })` equals `[door]` over the
  finished page, with the door's `href` pinned to its own project. The bar's "last open project" item is
  asserted to be RENDERED and to answer to `Shop operations, projects menu`, so the uniqueness above cannot
  be satisfied by the item's absence. (`apps/web/test/workspace-home.test.tsx`; the item's own eleven cases
  live in `apps/web/test/last-project-nav.test.tsx`.)

**The finding, and the mechanism it did NOT have.** The release lane's browser run failed in
`e2e-stack/helpers/board.ts:166` with `found no single project link named "Shop operations" … Projects
rendered: ["Shop operations","Shop operations26 tickets3 blocked"]`, and the dispatch read that as ONE card
holding two links (a title link, plus a card-level link whose name was the concatenated text). **Measured on
the deployed stack at 1280×720, 2026-09-22: the card holds ONE link.** The two are
`a.gn-nav__project` (148×44 — the bar's item, `aria-label` absent, named by its text) and
`a.gn-project-card__door` (363×63 — the card, `aria-label="Shop operations"`). Both point at
`/w/0TZSS5W6ATCTF2YBPMWGGP9JF5/p/0XB92YA4CGEBF9S285AH4SDXR1`, and
`getByRole('link', { name: 'Shop operations', exact: true }).count()` reads **2** at desktop and **1** at
390 (where the bar's item is behind the phone nav and out of the accessible tree) — so no jsdom case could
have seen it either, since the item renders on every width there.

**Why the qualifier is on the bar's side.** The card door's name is the project's: it is the row's identity,
what every `within(card)` query in `workspace-home.test.tsx` and the stack suite's exact-name query address.
The bar's item is a second, contextual door, so it is the one that says which it is. The rejected
alternative is measured rather than argued: renaming the card makes the exact-name query match the BAR's
item, whose project is `routeProject ?? rememberedLive ?? live[0]` — a POSITION, which is the silent
wrong-board pick `helpers/board.ts`'s own docblock exists to remove.

**One direction of this change is not covered by a test and is named rather than left implicit:** the bar
item's name is not anything the accessible-name ratchet (`13.287`) can judge — it counts `aria-label`
ATTRIBUTES, and this element had none before and has one now, so the count RISES there rather than falling.

## The phone `Menu` toggle is not painted above 40rem (E4-11, `rel/browser-findings`, 2026-09-22) — case `13.1218`

- **13.1218** ✅ The `Menu` toggle LOSES the cascade above 40rem and WINS it below, read as the WINNING
  `display` rather than as a declaration. A matcher over tag/class compounds and descendant combinators
  resolves the cascade over the unconditional rules (`none`) and over those PLUS the 40rem block's contents
  (`inline-flex`); the competitor `.gn-nav button { display: inline-flex }` is asserted present in the same
  case, and the mutation witness plants the PRE-FIX selector and requires the desktop reading to flip while
  the phone one does not. (`apps/web/test/nav-phone-disclosure.test.ts`)

**The defect, measured live on the deployed stack (`:3001`, main `9b7c38a9`) at 2026-09-22, signed in on
`/w/0TZSS5W6ATCTF2YBPMWGGP9JF5`:**

| viewport | present | computed `display` | box | ground | border | radius |
|---|---|---|---|---|---|---|
| 390 | yes | `flex` | 57×44 | `rgb(239,239,239)` | `outset 2px` | `0px` |
| 1512 | **yes** | `flex` | **57×44** | `rgb(239,239,239)` | `outset 2px` | `0px` |
| 1512 (fixed tree, `next dev` on `:3022`) | in DOM | **`none`** | **0×0** | transparent | none | 6px |

The 1512 row is the owner's screenshot: the phone disclosure button painted on the desktop bar, as raw UA
button chrome. Above 40rem `.gn-nav__more` is `display: contents` and the links it reveals are drawn
directly, so the toggle is the only thing that should not be there.

**The cause is specificity, not order.** `.gn-nav__more-toggle { display: none }` is (0,1,0);
`.gn-nav a, .gn-nav button { display: inline-flex; … }` is (0,1,1) and wins wherever either rule sits —
source order only decides between EQUAL specificity, which is why moving the rule later would not have
fixed it. `.gn-nav .gn-nav__more-toggle` (0,2,0) is the fix, and the phone arm carries the same two classes
so it still wins inside the media query (equal specificity, later in the file — which also means the PHONE
arm was winning its tie before the fix, and the button looked right at 390 by luck, for exactly the defect
the desktop arm shows).

**The second half of the fix is at phone, where the button is meant to show.** It carried no `.gn-button`,
so nothing gave it a ground, a radius or a hover: `background rgb(239,239,239)` and `border outset 2px` are
the UA's own, and `cursor` was `default`. It now takes the same resting/hover treatment as the nav links it
reveals (`background: transparent; border: none; cursor: pointer`, the shared radius and padding) — measured
post-fix as `rgba(0,0,0,0)` / `none` / `6px` / `pointer`, 69×44.

**⚠ THE CHECK THAT SHOULD HAVE CAUGHT IT WAS GREEN THROUGHOUT.** Case 13.1137's `'the toggle is painted
nowhere above 40rem'` asserted that the rule's DECLARATION reads `display: none` — which it did, while the
browser painted the button. A scan of declarations is not a scan of the WINNING declaration; the case now
resolves the cascade, which is a strictly larger instrument over the same stylesheet. The old assertion is
kept as a precondition inside it rather than deleted.
