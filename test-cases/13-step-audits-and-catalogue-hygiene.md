# 13. Step 2c/4b/5a audits and catalogue hygiene — test cases

Part of bucket 13 (`Features.md` §13) — one part-file of the catalogue split performed 2026-09-19.
Index and id-block allocation: [`13-deployment-dogfooding.md`](./13-deployment-dogfooding.md).
Case ids are unchanged and are never renumbered by the split.

## Step 2c-2 (2026-09-18) — the legal pair and the 404, to the refreshed export

**Block `13.682`–`13.689`**, allocated by `CTL-DISPATCH-2026-09-18-step2c2-legal-notfound.md`. The
highest id in this file before the block was `13.681` (2c-1's); **the next free id at this tip was
therefore `13.690`** — Step 4b's block at the foot of this file now occupies `13.690`–`13.693`, so the
next free id is `13.694` — recounted at this tip with the per-style counts rather than assumed — `node
scripts/check-case-ids.mjs` reads **2196 unique ids** on the base and **2204** after this block, +8.

The spec is `docs/design/prototype-delta-2026-09-18.md`'s own audit of the two blocks — `isLegal`
(`desktop.dc.html@6d7b67c0a52c:1720-1755`) and `isNotFound` (`:1844-1862`) — whose verdicts are
`port (M)` and `port (S)`. Both verdicts are NARROWER than their screen names suggest, and every case
below sits on the narrow side of one of them: the legal port is three items plus a bar, and the 404's
is three items with **no copy change at all**.

**`13.322` and `13.323` are SUPERSEDED here** — not deleted, not renumbered, and not because they were
wrong. The export's `isLegal` block draws **no back affordance anywhere in `:1720-1755`**, which was
the dispatch's own condition for replacing `BackButton` rather than keeping both. What that costs,
stated because a supersession that reads as a pure upgrade is how a loss goes unnoticed: the removed
control's no-history branch went to `/sign-in`, and the bar's `Sign in` link goes to the same route,
so a reader who landed with no history still has a destination — **the one-press return for a reader
who DOES have history is gone**, and the export leaves them the browser's chrome and nothing else.

**Every case in this block was mutation-witnessed, and the table is the evidence rather than the
claim.** Twelve mutations, each reddening exactly the case(s) named: label rename → 13.685 · both tabs
current → 13.684 · no tab current → 13.684 · hand-typed anchor row → 13.683 · row removed →
13.683 + 13.685 · third 404 link removed → 13.687 · icon tile removed → 13.686 · 404 copy replaced →
13.689 · heading size reverted → 13.688 · 520px column removed → 13.688 · bar removed → 13.682 ·
`Back` control re-added → 13.682 + 13.685. **The first run of that table reported a mutation CLEAN
and was wrong**: the mutation broke the JSX, vitest printed `Tests  no tests`, and a parser that only
looks for `FAIL` lines cannot tell "nothing failed" from "nothing ran". The harness now requires the
run's own summary line before it will report anything, which is the same rule this file's
`rawMatches` controls exist for.

- ✅ **13.682 — the legal pages carry the export's bar, and the `Back` control it replaced is gone.**
  Two halves, and the second is the load-bearing one: asserting the `Sign in` link exists would pass
  just as well against a page that kept `BackButton` beside the bar, which is exactly the shape the
  dispatch rejected. So the absence is asserted by the old control's own accessible name
  (`Back to the previous page`) — the same string 13.322/13.323 queried — and the two mutations fire
  on opposite halves. The bar itself is the product's `.gn-nav` chrome, not a bespoke one, which is
  what brings the 2.75rem tap floor and `--gn-surface` with it. (`apps/web/src/legal-nav.tsx`,
  `apps/web/app/privacy/page.tsx`, `apps/web/app/terms/page.tsx`, `apps/web/app/globals.css`)
- ✅ **13.683 — the anchor row IS the page's headings, label for label and anchor for anchor.** The
  dispatch's words were "built from the pages' existing headings — not a hand-typed list", and this
  is that property made checkable: each anchor's text equals its `<h2>`'s text, in order, and each
  `href` equals that heading's own `id` prefixed with `#`. A second, independently typed list of
  section names fails it the moment a heading is added, renamed or reordered — the only way this
  drifts in practice. **Its boundary, stated rather than implied:** the comparison is against the
  RENDERED headings, so a hand-typed row that happens to match today passes; what it cannot do is keep
  passing after the next edit to either side. *(A first version found the row with
  `getByRole('navigation', { name: 'On this page' })`, which made the label-rename mutation redden this
  case as well as 13.685 — one mutation, two sites, neither case naming its own. It finds the row by
  class now.)* (`apps/web/src/legal-chrome.tsx`, both pages)
- ✅ **13.684 — the tab pair links the two legal routes and marks exactly ONE as current.** Exactly
  two links, hrefs `/privacy` and `/terms` in that order, and `aria-current="page"` on the page's own
  route and on nothing else — the failure a current-page indicator exists to prevent, and `aria-current`
  on an `<a>` is what a screen reader announces as "current page". Both mutations fire: marking both
  current, and marking neither. The class assertion is not cosmetic — the segments ride the SHARED
  `.gn-segmented` control, and that inheritance is what carries the tap floor, the focus ring and
  `--gn-text`'s contrast pair. (`apps/web/src/legal-chrome.tsx`, `apps/web/app/globals.css`)
- ✅ **13.685 — the anchor row is named `On this page`, and it is the page's ONLY label.** The dispatch
  required the new accessible names asserted BY STRING, because `e2e-viewport`'s sweep counts
  ATTRIBUTES — it cannot tell this label from any other, so a rename would keep its count at 1 while
  the announced name changed underneath. The label is load-bearing twice: it distinguishes this page's
  two `<nav>` landmarks from each other, which ARIA requires; and it is what holds `/privacy` and
  `/terms` at `ariaLabel: 1` in the baseline after `BackButton`'s label left with the control. **That
  swap is precisely what the ratchet cannot judge** — its own docblock says an equal-count swap "is not
  this gate's business ... that is the copy rule, reviewed by a person" — so it is pinned here instead
  of absorbed by a number that did not move. `toBe(1)` and not "at least 1": a second label appearing
  silently makes the live count RISE, and a rise is the direction nothing checks.
  (`apps/web/src/legal-chrome.tsx`)
- ✅ **13.686 — the 404 leads with the export's 72px tile, and it is hidden from assistive tech.** Three
  properties with three reasons: `aria-hidden` because the tile repeats what the `h1` says and a screen
  reader hearing it twice is a regression, not a decoration; the 34px svg box inside a 72px tile
  because that is the export's own geometry (`:1847`); and the glyph's two cross strokes, which are
  what make it this screen's mark rather than the bar's brand tile. (`apps/web/app/not-found.tsx`,
  `apps/web/app/globals.css`)
- ✅ **13.687 — the 404 offers the manual as a THIRD action, in the export's order, into a real route.**
  The ORDER is asserted, not just the set: the export draws workspaces / manual / inbox
  (`:1855-1857`), and this page's two existing links already agreed with it, so inserting the manual
  anywhere else would have been arbitrary against both. `Search the manual` is the export's own label
  and one of the two new accessible names the dispatch required BY STRING. A positive control on the
  target asserts `app/help/page.tsx` exists on disk — "the route exists" was the audit's own reason for
  calling this a bounded addition rather than a wire gap, and if that page is ever removed this reddens
  here rather than shipping a link into a 404. (`apps/web/app/not-found.tsx`)
- ✅ **13.688 — both headings take the export's 34/41/700/-0.4px at 72ch, and the 404 is a centred
  520px column.** Read from the CSS SOURCE, because that is where those numbers live and jsdom resolves
  neither an external stylesheet nor `ch` — a computed-style assertion here would measure nothing and
  pass. The positive control is the RETIRED value: `1.6rem` must be absent from the rule, or the
  assertions above describe a declaration something further down the file still overrides. Both
  mutations fire — reverting the size, and deleting the 520px column. (`apps/web/app/globals.css`)
- ✅ **13.689 — the export's 404 wording is ABSENT and the product's own three causes are intact.** The
  one case here about what did NOT change, and the reason the reviewer's brief names it. The export
  says "This page isn't here" and "Nothing was deleted."; adopting either would answer a question this
  page exists to refuse — the API returns the same 404 for a thing that is absent and a thing that is
  not yours, so a lead asserting nothing was deleted is false in one of the two cases and quietly so.
  The third absent string is the export's illustrative `Last updated 8 September 2026`, which the audit
  measured at zero product hits and which must not replace the `[DATE]` placeholder 13.251 counts.
  BOTH directions are asserted, because either alone has a way to pass while being wrong: only the
  absences would pass against a page somebody emptied, and only the presences would pass against one
  that added the export's wording underneath. (`apps/web/app/not-found.tsx`)

---

## Three contrast debts and one stale calibration, recorded as cases rather than fixed (Step 4b, 2026-09-18) — block `13.690`–`13.693`

Block `13.690`–`13.693`, allocated by `CTL-DISPATCH-2026-09-18-step4b-ledger-evidence.md`. Unlike every
other block in this file these four were **`❌` by construction**: no commit performed the work, and each
names its FIX as the deliverable so the entry cannot be closed by editing the measurement instead. All
four come out of PR #426's review, which measured them and recorded them as pre-existing; Step 4b gives
each an id, because a debt held only in a review comment has no owner and no scope. **Three of the four
remain `❌`** — `13.690`, `13.691` and `13.692` are the contrast debts the owner deliberately left on
hold (*"leave the contrast debts on hold as well. record it."*). `13.693` was closed on 2026-09-19 by a
commit, which is the only thing that could close it.

**The arithmetic below was re-derived for this block rather than transcribed from the review.** Every
figure reproduces the review's to four decimal places — which is the point rather than the reassurance: a
transcription reproduces a wrong number exactly as faithfully as a right one, and the fourth case is
precisely that. Ratios use the WCAG 2.x relative-luminance formula on the shipped role→primitive map;
`13.6px` is `0.85rem` at the browser's 16px default. `hig` and `minimal` share one colour map (they
diverge only in `radii`/`shadows`), so each measurement below is stated once for both.

- ❌ **13.690 — `contested` is READ TEXT on `surface` in `hig`/`minimal` light and measures 4.3746
  against AA's 4.5.** `.gn-sync-status-bar__failed { color: var(--gn-contested); }` (`ui.css:2602`) sits
  inside a bar that sets `background: var(--gn-surface)` and `font-size: 0.85rem` at normal weight, so
  this is body-sized text and its floor is 4.5, not 3. In `hig`/`minimal` light `surface` is `warmPaper`
  `#efe7df` and `contested` is `magenta600` `#d30f45`; `neo` light ships its own darker
  `neoLightContested` `#9a3054` and clears at 6.0238. **The existing gate cannot see this:** the roster's
  own `contested` row is `{ fg: 'contested', bg: 'surface', minimum: 3 }` — the marker tier — and 4.3746
  clears 3 while failing 4.5, so the row that has to move first is the minimum, not the hex. 13.681 pins
  the failing value; this case names the fix, because a case that only pins a number is satisfied by
  deleting the pin. Deliverable: `contested` gains a read-text role clearing 4.5 on `surface` in `hig`
  and `minimal` light, or the sync bar stops painting it as text — the `neo` map is the precedent for the
  first. Owner: whoever next touches the sync status bar or the `contested` role.
  (`packages/ui/src/ui.css`, `packages/ui/src/tokens.ts`)

- ❌ **13.691 — `warning` on `surface` measures 4.2485 in `hig`/`minimal` light, and NO `CONTRAST_PAIRS`
  row names the pair.** `amber700` `#b25000` on `warmPaper` `#efe7df`. The roster's only `warning` row is
  `{ fg: 'warningText', bg: 'warning' }` — text on the warning colour — a different pair that cannot fail
  from this one being wrong, which is why it reads as guarded. Deliverable: add the row. `neo` light
  already carries a purpose-built `neoLightWarning` `#8c4708`, so the shape of the fix exists in the same
  file. (`packages/ui/src/tokens.ts`)

- ❌ **13.692 — `danger` on `surface` measures 4.4013 in `hig`/`minimal` light, and NO `CONTRAST_PAIRS`
  row names that pair either.** `red600` `#d70015` on `warmPaper` `#efe7df` — the closest of the three to
  the floor and still under it. Same shape and same deliverable as 13.691, with `neoLightDanger`
  `#9e2a20` as the precedent; the two are split into separate ids because the roster is a list of PAIRS,
  and a row added for one role leaves the other equally unguarded.
  (`packages/ui/src/tokens.ts`)

- ✅ **13.693 — `tokens.ts`'s `green700` calibration arithmetic WAS STALE: it was computed against a text
  colour the light theme stopped shipping on 2026-09-16.** `tokens.ts:36-38` used to record that
  `successText` on `success` measures **4.40** against 4.5 for Apple's `#248A3D` and **5.40** for the
  incumbent `green700` `#1e7a34`; `:117` repeated the 4.40. Both reproduced exactly against **pure
  white** — re-measured here as 4.3953 and 5.4004 — and that was the right ground when the docblock was
  written (`c71e58bb`, 2026-09-08, whose light `successText` was the primitive `white`). `b05e723f`
  (2026-09-16) introduced `onColorWarmLight` `#fbf7f3` and repointed `successText` to it, and against
  that ground the same two hexes measure **4.1233** and **5.0662**. **The conclusion survived** — both
  values stay on the same side of 4.5, so `green700` is still the correct keeper — but the recorded
  arithmetic did not, and it was the kind that gets quoted forward into the next decision as a measured
  fact. **Closed 2026-09-19.** `:36-38` now reads 4.1233 / 5.0662 *on the shipped `onColorWarmLight`
  ground*, names 4.40 / 5.40 as the pure-white figures it used to carry, and `:117` carries 4.1233 and
  `#fbf7f3`. Both substitutions are LINE-NEUTRAL — `tokens.ts` is 1493 lines before and after — so no
  citation into that file moved. The sweep this entry asked for ran and took `Features.md`'s two stale
  clauses with it (`successText` 4.40 / 5.40 → 4.1233 / 5.0662; the pairless `brand` tile —
  `textInverted` on it — 2.87 → **2.69**). Proof: every figure above, re-derived 2026-09-19 from the
  shipped role→primitive map using the suite's own WCAG helpers, on an instrument calibrated against
  eight ratios this repo had already pinned elsewhere — 4.3953, 5.4004, 4.3746, 4.2485, 4.4013, 4.876,
  and `accentText`-on-`accent`'s recorded 5.26 / 4.93 — every one reproduced to four decimals. The moved
  roles came back sound: `accentText` on `accent` **5.8139**, `dangerText` on `danger` **5.0511**,
  `warningText` on `warning` **4.8758**, `successText` on `success` **5.0662**, all against 4.5, and the
  light roster's 33 declared rows report zero failures.
  (`packages/ui/src/tokens.ts`, `Features.md`)

---

## The states-cases audit and the mobile deferral (Step 5a, 2026-09-18) — the reserved block `13.301`–`13.315`, resolved

`13.301`–`13.319` was reserved by `docs/superpowers/plans/2026-09-08-hig-per-screen.md` on 2026-09-08
for Tasks 3–11's states halves and never minted. The tasks shipped; the ids stayed reserved; and a
reserved id that is never pinned is the same defect class as an unrecorded deferral (Plan 1's class 4)
— the work reads as covered because a number was set aside for it. Part 2 of
`CTL-DISPATCH-2026-09-18-step5a-residue.md` ordered the audit. `13.295`–`13.297` (Task 3b, Members)
stay reserved and untouched on the owner's sign-in hold.

**The method, which is the only thing that makes the verdicts worth anything.** For each id the plan's
own sentence was read first, then the tests were swept for a witness of THAT sentence — the assertion,
not a comment beside it. Three verdicts were permitted and no fourth: **(a) pinned** — a test witnesses
it, so the case is minted ✅ and the citing test carries the id; **(b) covered** — an already-minted case
states it, so the id gets one line here and no row; **(c) unwitnessed** — minted ❌ with the deliverable
named, so the entry cannot be closed by editing the measurement instead of doing the work. **No case was
written to make a verdict come out (a)**, and no verdict is `?`. **No id in this block came out (b)** —
every one of the fifteen is either witnessed directly or is not witnessed at all, which is itself a
finding about how these tasks landed.

**One measurement note, because it nearly produced fifteen wrong verdicts at once.** The first sweep put
the test-path list in an unquoted shell variable; under `zsh` that does not word-split, so `grep` got one
nonexistent path, wrote its error to `/dev/null`, and printed nothing — fifteen well-formed empty results
that read exactly like "unwitnessed", which was the verdict four of them were about to be given. The
sweep was re-run with literal paths **and a positive control through the identical pipeline** (a literal
known to exist in `board.tsx`). **A null result needs a positive control from the same run**, and the
same trap then recurred once more in the re-run itself, which is why the row text below names the file
and line rather than a count.

**One verdict was corrected after an independent review, and the correction is in the row rather than
in a follow-up.** `13.315` was first minted ✅ on a "structural warrant" — the claim that `board.tsx:415`
and `ticket-list.tsx:676` both read `stateCategory`, so the List's tone was the Board's by construction.
The reviewer read line 415: it is the **column header's** chip, reading `column.category`, and a Board
**card** renders no state chip at all. The warrant was invented, the verdict is ❌, and the false
sentence is quoted and refuted in the row. **The count was therefore 10 ✅ / 5 ❌, not 11 / 4 — and it is 12 ✅ / 3 ❌ as of 2026-09-18, because `13.309` was witnessed by `hig-per-screen/7b` and `13.306` by `hig-per-screen/6b`, each marked ✅ IN PLACE in the list below rather than moved out of it.** The
reviewer also read `13.307` and `13.309` against their primary sources; 13.309's ❌ was upheld, and
13.307 kept its ✅ with an absence now enumerated in the row. *A verdict is only as good as the line it
cites, and the first draft cited a line it had not read.*

### Verdict (a) — pinned. The case is minted ✅ and the witness now carries its id.

- ✅ **13.301 — the reopen cause chip renders for a card whose `cause` is not null.** Witness: renders
  a card seeded `cause: { kind: 'reopened-for-child', childTicketId: 't_child' }` and asserts
  `getByText('reopened — live work added')`. The plan's own mutation — delete the `card.cause !== null`
  branch — reddens it, which is what makes it a guard rather than a screenshot. **Stated because a
  reader will assume both arms: this case has only one.** Every card in the render carries a cause, so
  nothing asserts the chip is ABSENT when `cause` is null; the `!== null` guard is witnessed from the
  positive side only. That is the plan's own sentence's shape ("renders for a seeded reopened card"),
  not a gap this audit introduced — recorded rather than silently widened, because widening it would
  have meant writing a test to make a verdict come out (a). (`packages/app-core/test/views/board.test.tsx`)

- ✅ **13.302 — the provenance control unfolds to text carrying BOTH an actor and a time.** Witness:
  clicks the control whose accessible name is `who · when` and asserts the unfolded string
  `marked Doing by Anselma Marak on 19 Aug 2026` — one assertion, both halves. A sibling two cases
  down asserts the nameless-claim arm (`marked Doing by user_anselma on 19 Aug 2026`), so the actor is
  never dropped for want of a display name. The block below it varies `TZ` over the same unfold, so the
  *time* half is witnessed against the domain's formatter rather than the machine's zone.
  (`packages/app-core/test/views/board.test.tsx`)

- ✅ **13.303 — an empty project renders `No tickets here yet — create one.`** Witness: asserts
  `getByText(EMPTY_BOARD_COPY)` **and** `expect(EMPTY_BOARD_COPY).toBe('No tickets here yet — create
  one.')` in the same case, so the rendered text is tied to the literal rather than to whatever the
  constant happens to hold — a re-export of an empty string would fail. Same case asserts
  `queryAllByRole('region')` is empty, so the copy is not painted over scaffolding.
  (`packages/app-core/test/views/board.test.tsx`)

- ✅ **13.305 — the three real contested-claim resolutions render by their shipped labels.** Witness:
  asserts three controls by their shipped names — `/redo/i`, `/convert to comment/i`, `/discard/i` — on
  a banner holding one live contest. The plan's mutation (remove one real action) reddens it, which is
  the plan's own stated falsifiability criterion and the reason this is ✅ rather than ❌.
  **A caveat that belongs on the row, not under it:** `ContestBanner` is mounted **nowhere** in the
  product. `docs/hig-reconciliation-audit.md:577` recorded this on 2026-09-08 and it is re-measured
  here — the only non-test references anywhere in the repo are the component's own definition,
  `Features.md`, the audit and the plans' own quotes. The plan's Task 6b is about the **TicketSheet**,
  which imports no contest component at all. **So this case witnesses the component, and the surface
  the plan named does not render contest resolution on the web.** The two claims are kept apart on
  purpose: folding the unmounted fact into this verdict would have marked ❌ a case whose own stated
  mutation passes. Reported to the controller as a scope-changing finding.
  (`packages/app-core/test/contests.test.tsx`)

- ✅ **13.307 — all four My Work sections are present, each under its own accessible name.** Witness:
  one case asserts three regions by accessible name — `Assigned to me`, `My claims in transit`, `My
  contested claims` — and a second asserts the fourth, `Shared with me`, as a region of its own with a
  row in it and without one. The four are witnessed across two cases rather than in a single render.
  **The plan's word is "headings", and that word is not witnessed — enumerated rather than glossed:**
  each section is `<section role="region" aria-label="…">` with a SEPARATE
  `<h3 className="gn-my-work__heading">…</h3>` (`my-work.tsx:63-64`, `74-75`, `85-86`, `104-105`), and
  the accessible name comes from the `aria-label`, so **deleting all four `<h3>` elements leaves every
  assertion in both My Work test files green**. `gn-my-work__heading` appears in no test and no
  `getByRole('heading')` exists in the file. The verdict is ✅ because the plan's OWN mutation — delete
  the `Shared with me` section → RED — passes, so the case guards what it is for; a reader who takes
  "headings" literally is being told exactly where the gap is rather than left to find it.
  (`packages/app-core/test/views/my-work.test.tsx`)

- ✅ **13.308 — the four empty-state sentences render verbatim.** Witness: `No claims in transit.`;
  `Nothing has been shared with you.` and `Nothing assigned to you.` asserted together under a fixture
  whose four sections are ALL empty; `No contested claims.` under the same shape. **Not all four in one
  render**, and the difference is stated rather than smoothed over: the in-transit sentence is asserted
  under the spec's own fixture, whose only empty section is in-transit. Every sentence is pinned
  verbatim as a literal, which is the part the plan's sentence is about.
  (`packages/app-core/test/views/my-work.test.tsx`)

- ✅ **13.310 — the move dialog's button text contains the incoming workflow's REAL name.** Witness:
  finds the button by `` `Move them to "${errandPublished.name}"…` `` — built from the fixture's own
  workflow. **Checked for vacuity rather than assumed:** `errandPublished` is `cloneTemplate(
  WORKFLOW_TEMPLATES[1])`, whose name is `Errand` (`packages/app-core/test/helpers/seed.ts:18`) — not
  the prototype's hard-coded `Scheduled`, so the assertion cannot be satisfied by transcription of the
  rejected copy. An earlier case in the same file asserts the prototype's phrasing is ABSENT.
  (`packages/app-core/test/ticket-types/ticket-types.test.tsx`)

- ✅ **13.311 — each workflow row's open control carries an aria-label containing that row's name.**
  Witness: `getByRole('button', { name: 'Open Simple kanban' })` — the expected name is a hard-coded
  row name rather than one read back off the fixture, so a template that dropped the interpolation
  cannot satisfy it. (`packages/app-core/test/workflow-builder/screens.test.tsx`)

- ✅ **13.312 — the issues panel's text equals a string produced by `adviseWorkflowDef`.** Witness:
  imports the real `adviseWorkflowDef`, calls it on the SAME `def` the panel is rendering, and asserts
  every returned `advisory.message` appears on screen — in both the pre-publish and post-publish states,
  so the panel is not a thing cleared by publishing. The expected strings are produced by the function
  under test rather than re-typed, which is the only way to assert "the engine's own words" rather than
  "the words someone copied out of the engine".
  (`packages/app-core/test/workflow-builder/publish.test.tsx`)

- ✅ **13.313 — TicketTypes' rank label is the shipped `rank ${type.rank}` form.** Witness asserts
  `rank 3` on a row whose fixture is rank 3, and a sibling case pins the rank IMPLICATIONS derived
  from the same types, so the label is tied to the row's own rank rather than to a fixed string.
  (`packages/app-core/test/ticket-types/ticket-types.test.tsx`)

> One ✅ sits beside one ❌ here and the difference is worth stating, because both sentences name
> something the assertions do not. The four SECTIONS in the row above are genuinely witnessed and that
> case's own mutation passes; only the wording "headings" is unwitnessed. The ❌ below has a comparison
> half with **no referent at all**, which is a different order of thing. (Written as a blockquote, not
> a bullet: a bullet beginning with a status marker and a bold id is a CASE ROW to
> `check-case-ids`, and this line named two ids in prose — it was parsed as a duplicate `13.307` and
> the check went red, correctly.)

### Verdict (c) — unwitnessed. Minted ❌ with the deliverable named.

> **Two rows in this list are no longer ❌.** `13.309` was witnessed on 2026-09-18 (`hig-per-screen/7b`)
> and `13.306` by `hig-per-screen/6b`; both are marked ✅ IN PLACE below, so the audit's verdict and its
> outcome stay side by side. **The other three are unwitnessed exactly as minted.** One row here is a
> verdict the WITNESS could not move on its own — `13.306` — and its own row says which half moved and
> which half did not.

- ❌ **13.304 — the `Only tickets in progress` checkbox "exists and toggles the rendered count": the
  plan's sentence is UNSATISFIABLE as written, and the half that is true is unwitnessed.** The checkbox
  exists and is clicked in three suites. It cannot toggle the count the plan means, and the reason is
  a type: `getBoard(projectId: string)` takes no filter at all
  (`packages/app-core/src/data-source.ts:134`), so the Board's `N of M` is the complete board total
  under every value of `activeOnly` — `board-narrowing.test.tsx:26-52` measures this against the
  primary source and records it. What the control really narrows is the LIST's server read, and **that
  half is asserted nowhere**: no test ticks the control and then asserts the List's row set shrank.
  Deliverable: a case that ticks the control and asserts the narrowed List (and, in the same case, that
  the Board's own count is UNMOVED — the negative arm is the part that makes the narrowing real rather
  than claimed). The recorded impossibility is part of the deliverable, not a note about it: a future
  reader who implements the plan's sentence literally will move the Board's count into the list's
  narrowing and produce a page that claims a narrowing it does not perform.
  (`apps/web/test/board-narrowing.test.tsx`, `apps/web/src/…/page.tsx`)

- ✅ **13.306 — the prototype's invented resolution pair, witnessed as ABSENT, with the shipped set pinned
  EXACTLY and each control wired to its own resolution KIND.** The audit files the pair as *"I — SHOWN BUT
  DOES NOT EXIST. Do not build."* (`docs/hig-reconciliation-audit.md:306`; its pair-specific bullet is
  `:308`) and the prototype still draws all three of its labels
  (`design-system/interactive/mobile.dc.html:353-355`), so a future port has a live source to copy from.
  The witness renders the REAL `ContestBanner` and asserts four things: the three shipped controls **by
  exact accessible name**; that each submits **its own resolution kind** (`converted-to-comment`, then
  `discarded`, in order); that no control matching `Keep mine`/`Keep theirs` exists by role or in the
  rendered text; and that the set is **exactly three per OPEN contest** (six for two contests, which is
  what distinguishes "three per contest" from "three, given one contest"). **Two of those halves were
  missing and neither is decoration — both were found by an independent review's mutation sweep, not by
  the author:** the arm already in that file (12.193, whose assertions the catalogue cites as `13.305`'s
  witness) finds its third control with `/discard/i`, which the prototype's OWN third label **`Discard
  mine`** also satisfies, so a rename to the prototype's wording reddened nothing; and labels alone are
  satisfied by a banner whose DISCARD button submits `converted-to-comment`, which silently removes the
  product's discard path while every label assertion stays green. **Six planted mutations, each killing it
  at a different assertion:** the pair added beside the three → the negative arm; `Discard` renamed to
  `Discard mine` → the POSITIVE arm; a fourth control matching neither negative pattern → the count arm;
  the banner rendering nothing → the anti-vacuity arm; the Discard button submitting the convert kind →
  the kind arm; `.slice(0, 1)` on the open list → the per-contest arm. **THE FLAG IS RECORDED IN THE CASE
  RATHER THAN SMOOTHED OVER:** `ContestBanner` is mounted NOWHERE in the product
  (`docs/hig-reconciliation-audit.md:577`), so this is a **COMPONENT-level** guard and says nothing about
  any screen. The two surfaces are easy to conflate and the difference is the point — the WEB ticket sheet
  renders no contest UI at all (TicketSheet imports no contest component), while the MOBILE ticket screen
  renders its OWN three buttons from its own markup (`apps/mobile/src/screens/ticket-screen.tsx:119-121`).
  **Neither is this component, and this case witnesses neither. The ledger row must not be promoted as
  though it did.** The verdict is ✅ on the guard's own terms: absence is now a property something checks,
  which is exactly the state the ❌ was minted to change.
  (`packages/app-core/test/contests.test.tsx`)

- ✅ **13.309 — the withheld-project-name fallback's TITLE text, witnessed — this is the row this
  audit minted ❌, and it is upgraded IN PLACE so its verdict and its outcome stay readable together.**
  The plan's sentence has two halves; the first was already pinned and the second was not.
  `projectName === null` rendering the **id** is asserted (`getByText('prj_withheld')`, in a case that
  also proves the withheld row is still openable — a correction recorded at the site). The **exact title
  text** was asserted nowhere; the witness now carries it as the RENDERED attribute rather than as a
  source string — `13.309 the withheld-name fallback carries its exact title text` reads the withheld
  row's own `title` and compares the whole string. **The apostrophe is the case, so it is pinned from
  both sides:** the positive assertion spells the string with the source's U+2019, and a second lookup
  with a straight U+0027 must MISS — without it the assertion would be about "some apostrophe" rather
  than about this string, and would pass on a test and a source that had quietly agreed on the WRONG
  character. A third assertion counts the titled nodes at exactly one, so the title belongs to the
  FALLBACK and not to every project line. **All three were measured against planted mutations rather
  than assumed:** replacing the title text and straightening the source's apostrophe each killed the
  case, and the straight-quote lookup — re-run FIRST and unmasked, because the earlier assertion stops
  the test before it — was measured failing alone against the straightened source. This audit's original
  search is what makes the codepoint worth pinning: it looked with both forms and recorded that a
  straight-quote grep could not have found the string even if a test had used it.
  **The dispatch's "the same gap exists on three other surfaces" is refuted, and measured rather than
  assumed:** `You have not been told this project’s name.` appears in exactly ONE SOURCE file repo-wide —
  every `.ts`/`.tsx` searched, with a positive control matched in the same sweep — at `my-work.tsx:220`.
  **A SECOND withheld-name treatment does exist, and it is on TWO of the three surfaces, not three:**
  `nameRestrictedProjectCount` and its `N projects · name restricted` line, consumed in exactly two files
  (`apps/web/app/workspaces/page.tsx:250`, `apps/web/app/w/[workspaceId]/page.tsx:628`), and IS asserted
  (`apps/web/test/workspaces-cards.test.tsx:257`, `:363`). **The members page carries NO withheld-name
  treatment at all** — it names no `nameRestrictedProjectCount`, draws no restricted line, and its only
  project-shaped control is an invitation form field hidden from a guest
  (`apps/web/app/w/[workspaceId]/members/page.tsx:621`), which is a hidden control rather than a withheld
  name. **Of the dispatch's three citations, two support the claim and one only appears to:**
  `workspaces/page.tsx:170` and `w/[workspaceId]/page.tsx:147` are prose about withheld project names,
  but `members/page.tsx:41` is about the withheld ROLE `<select>` — it contains the word "withheld" and
  means something else, which is how a citation that RESOLVES misleads a reader who does not open it.
  **The first draft of this row repeated the dispatch's three-surface claim; an independent review
  measured it and this is the correction.**
  (`packages/app-core/test/views/my-work.test.tsx`)

- ❌ **13.314 — "List renders the same tickets Board does, by count" is unwitnessed, and the product
  is deliberately built so it need not hold.** No test compares the two counts. The two views read
  different routes — the List through `getTickets` (which takes a filter) and the Board through
  `getBoard` (which cannot) — so they can legitimately disagree, and one suite already asserts they DO:
  a narrowed list reads `1 of 2 shown` while the board reads `1 of 3 shown`
  (`apps/web/test/board-narrowing.test.tsx:330-336`). **Deliverable:** state the property that is
  actually true and worth guarding — on an UNNARROWED project both views render the same ticket set —
  and witness that, rather than the plan's phrasing, which is false under narrowing by construction.
  (`packages/app-core/test/views/ticket-list.test.tsx`, `apps/web/test/board-narrowing.test.tsx`)

- ❌ **13.315 — the plan's sentence has NO REFERENT for its second half, and this row is a CORRECTION:
  it was minted ✅ in the first draft and an independent reviewer refuted the warrant.** The plan asks
  for "List's rows carry the same `Chip tone` as their Board cards". The List half is genuinely
  witnessed — two rows measured, `gn-chip--active` for `Doing` and `gn-chip--terminal` for `Done`, with
  the negative arm, so the modifier follows the row's category rather than being one hard-coded class.
  **But a Board CARD carries no state chip to be the same as.** `BoardCardView` (`board.tsx:745-762`)
  renders exactly two chips: `tone="pending"` ("claim in transit") and `tone="active"` (the reopen-cause
  chip). The chip the first draft cited as the structural warrant, `board.tsx:415`, is the **column
  header's** chip reading `column.category` — a `BoardColumn` field — **not `stateCategory`**. So the
  comparison cannot be made, let alone witnessed. **That draft asserted a structural justification
  without reading the line it named; the reviewer read it and it was false.** The correction is kept in
  the row rather than quietly overwritten, because "both sides read `stateCategory`" is exactly the
  kind of true-sounding sentence a later reader would otherwise re-derive and believe.
  **Deliverable:** state the List-side property the tests really pin, and either give the Board a state
  chip to compare against or drop the comparison from the case.
  (`packages/app-core/test/views/ticket-list.test.tsx`)

### Verdict from Part 1 — the mobile deferral, recorded with an owner

- 🚫 **13.319 — HIG per-screen adoption on `apps/mobile`, deferred rather than done.** `apps/mobile` is
  React Native; the `--gn-*` CSS variables the whole plan is written in do not exist there, so the
  per-screen adoption does not transfer and the task is docs-only by construction. Recorded under "What
  was NOT measured" in `docs/pre-launch-checklist.md` with the owner the plan names — *whoever next
  touches `apps/mobile` theming* — and with the reason the palette half is already satisfied
  (`colorOf()` reads `themes` directly, so the palette IS Apple's after #353; only spacing, radius and
  fill treatment remain). 🚫 rather than ❌ because this is a conscious scope decision with a named
  owner, not an unmade debt. (`docs/superpowers/plans/2026-09-08-hig-per-screen.md` § Task 11)

**Recount, at this tip.** The fifteen ids above are all inside the reserved block `13.301`–`13.319`, so
none of them moves this file's high-water mark; the highest id in the file is still `13.693` (Step 4b's
block) and the next free id is still `13.694`, recounted rather than assumed. **No new id beyond the
reserved block was minted, and none was needed** — which is the outcome the reservation was for.


---

## Backlog and closed (owner request, 2026-09-17) — the second wave, spec §8

### Second wave (spec §8)

**Task 1 (domain) — `13.694`–`13.696`. The ids were MEASURED at the tip, not taken from the plan.**
The plan says to start at `13.613`; that block was consumed long before this task began — `13.613`–`13.620`
by Steps 1 and 1b, `13.650`–`13.671` by Step 2. This file's own two "Recount, at this tip" notes already
recorded the highest case marker as `13.693`, re-measured here per style (bare / bold / marker-first)
before minting. `13.694` and `13.695` were free; `13.695`/`13.696` were free as well, because Step 5a's
dispatch pencilled an "extras block `13.695`–`13.699`" that was never drawn on — the merged 5a PR minted
nothing outside `13.301`–`13.319`. **Step 5b's handoff carries an off-by-one and is corrected here:** it
reads the `13.694` pointer sentence as meaning "the next block starts at `13.695`", but `13.694` appears
in this file only as that pointer prose, never as a case marker, so it was free and is what was minted.
**The next free id is `13.697`.**

- ✅ **13.694 — `rankBetween` yields a key strictly between its neighbours, and inserting between the
  same pair 200 times straight renumbers nobody.** The ordering property the whole ranking feature rests
  on: the returned key is strictly between the two neighbours it was given, and repeating an insertion
  between the same pair only lengthens the NEW key — no other ticket's key ever changes, which is what
  makes a reorder exactly one `ticket.ranked`. `(null, null)` yields a first key; `before >= after`
  (including `a === b`) THROWS rather than guessing, because the caller's neighbours are wrong and a
  silent answer would corrupt the shared order. The case also pins the key space: `isRankKey` refuses the
  empty string, spaces, characters outside the alphabet, a non-string, and any key ending in `0`.
  **And it pins the property the module claims "by construction" — that every key `rankBetween` RETURNS
  is itself valid, on prefix-adjacent neighbours (`('a','ab')`, `('001','0011')`, `('zz','zz1')`, …) and
  over 300 chained insertions.** That last one is not decoration: see the review section below, where a
  mutant that leaves this whole file green was measured before the assertion existed.
  `packages/domain/src/rank.ts:54`, `packages/domain/test/rank.test.ts:18`

- ✅ **13.695 — `compareByRank`: ranked tickets first by key, the unranked after them by `ticketId`
  ascending.** A ULID is creation order, so "unranked" reads as "in the order they were filed", which is
  what someone who has never dragged anything expects to see. Equal keys fall back to `ticketId` rather
  than returning 0, so the order is TOTAL and stable: a comparator that reported equality would let the
  sort's own tie-breaking decide a shared manual order nobody chose, and two clients could then render
  the same project differently. `packages/domain/src/rank.ts:85`, `packages/domain/test/rank.test.ts:119`

- ✅ **13.696 — `ticket.ranked` sets `rank` and touches nothing else; a created ticket is unranked.**
  The event carries `{rank}` and is registered against `entityKind: 'ticket'`; the reducer folds it onto
  `TicketState.rank`, and the case asserts the REST of the state is indistinguishable with the field
  stripped from both sides — `stateId` in particular never moves, for the same reason it does not on the
  closed pair: a reorder is not a status change, and letting it look like one would put a move nobody
  made into the transition log four-eyes reads. `ticket.ranked` also joins `TICKET_EVENT_TYPES`, so
  every replay reader that iterates that list sees it. The creation half asserts the READER's contract
  (`rank ?? null` is null), not the field's presence — see the ruling below for why.
  `packages/domain/src/ticket-state.ts:345`, `packages/domain/test/ticket-state.test.ts:644`

#### RULING (executor, conservative default): creation does NOT write `rank`

**Task 1's step text says "creation sets `rank: null`", and following it makes the gate red.** The first
gate run came back **28 of 33 tasks**, `@gisik-nokma/server#test` failed, thirteen cases across four
`test/dual-client/` files, every one of them this diff:

```
expect(onB?.ticket).toEqual(await h.projTicket(ticketId));
  AssertionError: expected { kind: 'ticket', …(15) } to deeply equal { kind: 'ticket', …(14) }
  +   "rank": null,
```

The left side is the client's replica, folded by the shared `applyTicketEvent`; the right side is the
server's read model, and `rowToTicketState` builds a `TicketState` **from columns**
(`apps/server/src/projections/tickets.ts:135`). There is no `rank` column — **Task 3 creates it**
(`apps/server/migrations/1789200000000_proj-tickets-rank.sql`) — so writing the field in the reducer
makes the two readers disagree, and those rig cases exist precisely to assert `replica.fold ≡ server.read`.

The plan is internally inconsistent here, and the inconsistency was invisible until the gate ran: its
`Files:` block for Task 1 lists **only domain files**, so it does not expect a server change; its own
Global Constraint says *every new wire field is carried end to end in ONE task*; and its own **Task 7**
shows the correct shape for exactly this situation — `reopenedAt` sets creation's `null` **and** adds
`reopened_at`, `$17`, `rowToTicketState` and the mapper **in the same task**. For `rank` the plan split
them across Tasks 1 and 3.

**Ruled (conservative default, recorded rather than asked):** creation omits `rank`. The field stays
absent on BOTH sides until the task that owns the column can move them together. Every reader spells
`state.rank ?? null`, which is the contract `entity-state.ts` already states for this optional field, so
absent and null are the same fact to every consumer — only `toEqual` across the client/server boundary
can tell them apart. **Not fixed by adding `rank: null` to `rowToTicketState` instead**, which was the
obvious alternative and is worse: a hardcoded null in the mapper would be the "closed flag dead in
production" failure this plan's Global Constraint was written to prevent, because from Task 2 onward a
real rank could be ingested while the read model kept answering null. **Task 3 inherits one decision:**
whether the reducer's creation writes the null once the column exists. Whoever lands it should decide
with both sides in hand, as Task 7 does.

#### The second deviation: the payload door refuses keys the plan's schema admits

**The plan's docblock declares the key space excludes keys ending in `0`; the schema it ships admits
them.** `RANK_KEY_REGEX` is `/^[0-9a-z]+$/`, so `'a0'` parses clean; `isRankKey` refuses it. That is not
cosmetic. The independent reviewer proved the two-case theorem and confirmed it empirically: *any* key
strictly between `'a'` and `'a0'` would have to be `'a' + t` with `t` non-empty and `t < '0'`, and
`'0'` is the alphabet's minimum, so no such `t` exists — and `rankBetween` does not refuse the request
either. Run in a child process with a heap cap, the real `rankBetween('a', 'a0')` **never returned**; it
grew the string until the allocation aborted (`SIGABRT`), while its positive control
`rankBetween('a', 'a1')` returned `"a0i"` in 0 ms. `ticketRankedPayload` therefore refines with
`isRankKey` instead of the loose regex (`packages/domain/src/events/ticket-events.ts:191`). **No
signature in the plan's Interfaces block changed**, and `RANK_KEY_REGEX` is still exported and still the
first check, because its message names the alphabet — the more useful error for the common mistake.

Two corrections the review forced on the *prose*, both kept because a right rule with a wrong reason
reads as verified: (1) the docblock's stated reason ("a trailing `0` would equal its prefix") was simply
false — `'a0' > 'a'`; the real reason is that nothing sorts below `'0'`. (2) The mechanism is narrower
than "a trailing zero": it needs `before` to be a STRICT PREFIX of `after` with every remaining digit
`0`, which is why `rankBetween(null, 'a0')` terminates fine. The shipped rule is broader than the
mechanism, which is the safe direction for a rule enforced at a door, and the docblock now says so.

#### The independent review — what it confirmed, and the real hole it found

The reviewer was told to **re-derive the ordering property against `rankBetween` itself**, not to re-read
the author's tests. It imported the shipped module, and reported:

- **Fuzz, HELD**: 4,000 random insertions into a maintained sorted list, asserting strict betweenness,
  ascending order and `isRankKey` validity after EVERY step; longest key 5 chars.
- **Exhaustive, HELD**: 522,753 ordered pairs of valid keys (alphabet `01az`, length ≤ 5) — zero
  non-terminating, zero not-strictly-between, zero invalid results.
- **No-renumbering, HELD** — asserted directly, which the shipped file did not do: 250 middle insertions,
  41,375 pre-existing keys compared byte-for-byte, zero mutated.
- **Both refusals throw**; a 600-insertion same-pair run terminates at key length 101.
- **The trailing-zero claim, HELD** — both halves, including the theorem above.

**The hole it found is the one worth recording.** It mutation-tested the test file and reported a mutant
that **passes the entire file**: stop descending once `lo` is exhausted
(`h - l > 1 || i >= lo.length`) — a plausible "optimisation" — which returns `'0010'` for
`('001','0011')`. That key is strictly between its neighbours and ends in `'0'`: exactly the unorderable
shape the door exists to refuse, produced by the function the door protects. **Reproduced here
independently before acting on it: exit 0, zero failures, whole file green.** Its own honest caveat is
kept: the non-termination result is a bounded non-return plus a faithful model, and a formal proof of
termination was not attempted.

The response is the new assertion in 13.694 above; **with it added, that mutant now fails** (M7 below).
The reviewer also listed four further properties the file's prose claimed but did not pin — no-renumbering
(nothing compared a pre-existing key to a snapshot), key-length growth, determinism, and the descent
corridor being sampled by a single 200-iteration run. The first is now pinned by the reviewer's own
measurement and is a candidate for a future case; the rest are recorded here rather than silently fixed,
because none of them is a defect in the shipped code.

#### Mutation evidence (8 mutations, each reddening its own site, all restored by sha256)

| # | mutation | killed by |
|---|---|---|
| M1 | `rankBetween` returns the lower neighbour instead of a midpoint | 13.694 × 5 |
| M2 | `isRankKey` drops the trailing-zero rule | 13.694 trailing-zero **and** 13.696 door |
| M3 | `compareByRank` puts unranked FIRST | 13.695 "ranked before unranked" |
| M4 | `compareByRank` returns 0 for equal keys | 13.695 × 2 |
| M5 | `ticket.ranked` folds as a no-op | 13.696 × 2 |
| M6 | the door drops the `isRankKey` refine | 13.696 door — **the door deviation is load-bearing** |
| M7 | descending stops once `lo` is exhausted | 13.694's new "every key RETURNS is valid" — **the reviewer's survivor, now killed** |
| M8 | `TICKET_EVENT_TYPES` omits `ticket.ranked` | the list case **and** 13.696 |

**Baseline is 45 tests green** (was 44; +1 for the assertion M7 is caught by). Every mutation restored
the file to a sha256 matching the original.

**Two checks this task found in itself, and fixed rather than shipped.** (1) The "a malformed rank
throws" test PASSED during RED, before `rank.ts` existed, because an unknown event TYPE throws too — a
check that could not fail for the property it named. It now asserts the CAUSE (`must be a rank key over
0-9a-z`, and NOT `not a ticket event`), with a positive control through the same call. (2) While writing
the new prefix-adjacent case, the first version of its pair list contained `('1','10')` — and that pair
**hangs**, because `'10'` ends in `0` and is outside the key space: a test that times out rather than
fails, for a pair no producer can emit. The pairs are now verified in-space, and the reason is written
into the case.

**Task 2 (engine + precheck) — `13.700`–`13.701`.** These two ids were **allocated**, not inferred: with a
second executor minting ids on a disjoint branch, a bare "next free" number is a reading that expires the
moment a peer writes, so the controller carved `13.700`–`13.759` for this executor and `13.760`–`13.819`
for the other.

**Recount, at this tip (branch `exec/second-wave-t2-engine`, cut from `origin/main` `43650f15`).** The
dispatch states *"the highest id in this region is `13.699`"* — **that is false, and the shape of the
error is the point.** `13.697`, `13.698` and `13.699` appear in this file only inside PROSE: the sentence
"The next free id is `13.697`" and an earlier note about an "extras block `13.695`–`13.699`". Neither is a
case marker. A substring sweep over a file that *discusses* case ids cannot separate a minted id from a
mentioned one, so it reported a high-water mark four above the real one — the same class of silent-empty
failure this file already records twice. **Measured over case markers (`^- ✅ **13.…`) and test names
(`describe/it('13.…`) only, the highest marker on `main` is `13.696`**, which makes `13.697`–`13.699`
genuinely free — and, less comfortably, unallocated: they sit in the core plan's wake, inside neither
executor's block. Worth a ruling before anyone recounts and mints there. Neither the stale figure nor
that gap touches the two ids below, which are inside this task's own block.

- ✅ **13.700 — a `ticket.ranked` is accepted only for a ticket in the universal Backlog, and refused
  `rank-requires-backlog` naming the state the ticket is actually in.** The door is the engine's rather
  than the payload schema's, the same split `ticket.closed` has with `close-requires-terminal`: the schema
  judges the KEY, the check judges the TICKET. The test is `stateId` and deliberately NOT `stateCategory`
  — the universal `BACKLOG_STATE` carries `category: 'open'` (`packages/domain/src/workflow.ts:56`), so a
  category test would admit every open ticket in the workspace, `"To do"` among them, while the backlog is
  one reserved id no workflow may declare. The state NAME resolves over `statesWithBacklog(def)` — which
  APPENDS the synthetic Backlog state that `def.states` never declares — and degrades to the bare state id
  when the definition cannot be resolved, exactly as `close-requires-terminal` does. A **closed** ticket is
  caught here too, by the backlog test rather than by a flag test, because closing does not clear `stateId`
  (spec §2 keeps the final state visible), so a closed ticket is terminal and not backlog. The payload
  door covers both halves of the key space — a space refuses on the alphabet, a trailing `0` refuses
  because nothing sorts below it — and a misfiled entity kind is REFUSED naming the kind rather than
  accepted. `evaluateEvent` dispatches the new arm. `packages/rule-engine/src/checks/rank.ts:49`,
  `:60`, `packages/rule-engine/src/evaluate.ts:49`, `packages/rule-engine/test/rank.test.ts:48`

- ✅ **13.701 — `precheckEvent` previews the identical verdict and the identical sentence from the client's
  cached state; the engine and the pre-check cannot drift into two different reasons for one refusal.**
  A `ticket.ranked` for a cached backlog ticket answers `passed` — genuinely, not manufactured from
  absence: `checkTicketRanked` reads `stateId` (cached) and consults a workflow definition only to spell a
  NAME inside a refusal it has already decided to give — and for a cached `todo` ticket it answers the
  refusal with the reason the engine produces byte-for-byte. An UNCACHED ticket stays `not-evaluated`
  rather than refusing, because "I have never heard of this ticket" is not "this ticket is not in the
  backlog". The agreement half extends **13.604**'s table to a fifth reason, driving both real producers
  over the same ticket/event pair. **The mutation is what proves the table is load-bearing:** dropping the
  backlog check from `checks/rank.ts` (and rebuilding, since `dist` is what the client suite resolves
  through) reddened 13.604's rank row while BOTH 13.701 cases stayed green — so the agreement case catches
  the drift the two literals cannot, and the pre-check's own two cases hold their ground independently of
  the engine's copy. `packages/app-core/src/precheck.ts:372`, `:387`,
  `packages/app-core/test/precheck.test.ts:407`, `:527`

  **FIX ROUND 1 (independent review, Important 1, 2026-09-18) — "cannot drift" was FALSE as first
  written, for a reason worth keeping.** The sentence is produced by **two different expressions**, the
  cached-definition name and the degraded fallback used when the reader holds no definition, and the
  table as first shipped drove **only the first**: every row built its cache through `readyCache()`,
  which always caches the def. So the fallback on the precheck side was pinned by **nothing** — the
  reviewer replaced it with the string `SOMEWHERE-ELSE` and all forty cases in the file stayed GREEN
  (mutation E), while the identical mutation in the engine's mirror, which IS pinned by
  `rule-engine/test/rank.test.ts:70`, killed its own case (mutation F). **The branch is reachable, not
  theoretical:** `cache.ts:93` drops a workflow's version map on a `workflow.defined` while ticket rows
  survive, and `cache-feed.ts:22`/`:27` cache tickets and definitions on different reads, so "ticket
  cached, definition not" is an ordinary state — and in it `precheckTicketRanked` REFUSES with the
  degraded name rather than deferring, making the unpinned string user-visible. **Fixed** by a
  `cacheWithoutDef()` helper plus a 13.701 case and a 13.604 row that drive both producers through the
  withheld-definition branch; re-running mutation E now reddens exactly those two cases. The claim above
  becomes true only because the table now covers both branches.
  `packages/app-core/test/precheck.test.ts:130`, `:429`, `:546`

