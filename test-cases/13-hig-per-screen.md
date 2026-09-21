# 13. The HIG palette and the per-screen plan — test cases

Part of bucket 13 (`Features.md` §13) — one part-file of the catalogue split performed 2026-09-19.
Index and id-block allocation: [`13-deployment-dogfooding.md`](./13-deployment-dogfooding.md).
Case ids are unchanged and are never renumbered by the split.

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

## Every route names its view (exec1 P12, 2026-09-21) — case `13.1050`

**Id `13.1050`, and the number is derived rather than guessed.** `13.922` — this file's next free id above
its own last line — was ALREADY TAKEN in `13-settings-and-workflows.md:577`, and the guard caught it.
`13.x` is ONE space across every `13-*.md` file, so the tip is the global high-water mark (`13.1046`), and
the block `13.1034`–`13.1049` is another executor's with `13.1047`–`13.1049` recorded as reserved and
deliberately unused (`13-owner-requests-and-backlog.md:2185`). `13.1048` is inside that reservation and
must not be taken, so the first genuinely free id is the one after the block. **This lane's standing
request for an allocated block, first recorded under `13.969`, is still open** — this task was dispatched
without one, as that one was.

- **13.1050** ✅ Every routing file under `app/` declares a title — Next's `metadata`/`generateMetadata`
  on a server route, `<DocumentTitle>` on any route — and a `'use client'` route that leans on
  `metadata` is caught, because that export is **silently IGNORED** in a client module and the page
  keeps whatever the previous route left in `document.title`. The sweep walks `page.tsx` **and**
  `not-found.tsx`, whose exclusion list (`app/page.tsx`, a bare `redirect`) is itself asserted to still
  be a bare redirect so it cannot become a hiding place. Two further arms: every declared topic is
  non-empty and none is the bare product name — the defect restated as a property — and a mounted
  `<DocumentTitle>` really sets `document.title` and follows a topic that resolves late.
  (`apps/web/test/document-title.test.tsx`)

**The finding.** `app/layout.tsx` set `{ title: 'Gisik Nokma' }` and nothing else set a title, so
`/sign-in`, `/inbox`, `/help`, a board, a ticket sheet, `/settings`, `/privacy`, `/terms` and the 404
all read the same string. WCAG 2.2 §2.4.2 *Page Titled* is **Level A**, and its Understanding document
speaks to exactly this shape: *"for web applications (single page applications) where the view changes
dynamically, the title should also be changed dynamically to reflect the content or topic of the
current view."*

**Two mechanisms, one source for the format.** A `'use client'` route uses `<DocumentTitle>` (an
effect; Next's `metadata` is not honoured in a client module); a server route uses
`export const metadata`. Both read `documentTitleFor` from `src/page-title.ts`, so the two cannot
disagree about what a title looks like. `apps/web/src/page-title.ts` carries no `'use client'` on
purpose — a directive there would turn the helper into a client reference and break the server half.

⚠ **What is MEASURED and what is not.** The server half is measured in the real build output:
`next build` → `.next/server/app/privacy.html` carries `<title>Privacy · Gisik Nokma</title>` and
`terms.html` carries `Terms · Gisik Nokma`. **The client half's title is NOT in the prerendered HTML —
measured, and expected**: the effect runs after hydration, so a browser reading of a client route
post-hydration is **OWED** and is not claimed. jsdom witnesses the mechanism (the mounted component
sets `document.title`); the sweep witnesses DECLARATION on every route, never execution.

## The project view rail is a NAMED tablist (exec1 P19, 2026-09-21) — case `13.1051`

- **13.1051** ✅ The project page's view rail — Backlog, Board, List, Calendar, Timeline — is reached by
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

## Task 1 of the HIG per-screen plan (2026-09-08) — the four shared pieces every screen reuses

- **13.288** ✅ `SegmentedControl` renders `role=tablist` (named by a required `aria-label`), one
  `role=tab` per option, `aria-selected` true on exactly the chosen one, and calls `onChange` with the
  clicked value — the exact roles `.gn-view-tabs` carried, so replacing it registers no loss on 13.285.
  — (`packages/ui/test/components.test.tsx`)
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

