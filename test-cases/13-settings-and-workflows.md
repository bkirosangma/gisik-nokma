# 13. settings -> workflows — test cases

Part of bucket 13 (`Features.md` §13) — one part-file of the catalogue split performed 2026-09-19.
Index and id-block allocation: [`13-deployment-dogfooding.md`](./13-deployment-dogfooding.md).
Case ids are unchanged and are never renumbered by the split.

## settings → workflows: the card grid, and a CSS family that did not exist (executor 1, 2026-09-18) — case `13.920`

Slice 1 of the `isWorkflows` port (`docs/superpowers/plans/…`, dispatch
`CTL-DISPATCH-2026-09-18-settings-workflows.md`). The prototype block is
`design-system/interactive/desktop.dc.html:841-869` at `@227434a5` — read from `main`, and the dispatch
records why that matters: the primary checkout sits on a retired branch whose copy is **15 lines short**,
so `isWorkflows` is at `826` there and `841` here. The audit's own row is
`docs/design/prototype-delta-2026-09-18.md:68` (`wire-gap`, M).

**THE UNSTYLED FAMILY WAS THE REAL DEFECT, and it was total.** `workflow-list__*` had **NO CSS AT ALL** —
every `*.css` in the repo held exactly **one** `workflow-list` occurrence and it was a comment listing
`.workflow-list__new` among *"unclassed-control offenders"* (`apps/web/app/globals.css:44`); there were
**zero rules**. The primary action rendered as a bare `<button>` resolving to the UA default rather than
`.gn-button--primary`. The audit established the absence with a control — the same sweep finds 31
`.ticket-type-list__` rules — so the instrument reaches CSS and this family was simply not in it.

- ✅ **13.920 — the workflow card grid, its state chips and category bars, and the two absences the
  prototype draws and this product cannot back.** Two halves, in two files, split the way every styling
  case in this repo splits: `packages/app-core/test/workflow-builder/screens.test.tsx:165` proves the
  COMPONENT applies the classes, and `packages/ui/test/tokens.test.ts:1443` proves the classes DRAW
  something. A rule that sets a colour is not a boundary that reads.

  **The component half.** The prototype's own header sentence — *"Publishing records a version. Nothing
  already recorded is rewritten."* (`:845`) — is asserted character for character; it had **0 hits** in
  the product before this. One chip per state, one bar per chip, and the bar's class is asserted to be
  `workflow-list__state-bar--<category>` for each state IN ORDER, with a set-equality arm proving the
  fixture really carries all three categories, so the list is not satisfied by one class repeated. Every
  bar is `aria-hidden` — the state's NAME is the accessible content. **Both absences were asserted rather
  than assumed:** `.workflow-list__badge` must be `null` and the action row must hold exactly one button.
  A badge that can only ever say `Published` and a second button with no gateway method are exactly what
  this repo keeps re-finding, so their absence was pinned in the test rather than left to the docblock.
  **THE SECOND HALF WAS SUPERSEDED ON 2026-09-19 (Task 3, lifted; cases `13.938`–`13.942`).** The badge
  is still `null` and is still pinned. **The action row now holds TWO buttons and the count is no longer
  the assertion** — `screens.test.tsx` pins them **by name and by order**
  (`Open <name>`, `View history of <name>`), because a count of two would pass two `Open` buttons. The
  old arm is quoted here rather than deleted: a reader comparing the two versions should meet the reason
  the count became the weaker check, not a silent swap.

  **The measurement half, and it is the same defect as the avatar's, one screen over.** The prototype
  fills a chip with `--trayBg` (`:3184`) — `--gn-surface-sunken` here — and under `neo` that role is the
  SAME hex as the `.gn-card` behind it, so the chip composites to exactly the card's colour. Asserted as
  a fact about the palette (`toBe(card)`, both themes) with a **control** that under `hig`/`minimal` the
  two roles genuinely differ — so the claim is about `neo` rather than about the palette. That equality
  is what makes the `[data-style="neo"]` compact shadow *load-bearing* rather than decorative, and the
  rule is asserted to take its shadow from the token layer rather than a literal. The three category bars
  are DATA (`WorkflowState.category`, `packages/domain/src/workflow.ts:3`), so each is held to the 3:1
  WCAG 1.4.11 floor **against the chip composite**, in all six style/theme combinations. **Measured
  minimum 3.733** (`hig`/`minimal` light, `open`); the roles are read out of `ui.css` rather than named
  in the test, so a repoint cannot pass.

  **GUARD PROVED BY MUTATION, twice, each dying specifically.** Dropping the `neo` shadow reddens the
  token-layer assertion by name. Repointing `.workflow-list__state-bar--open` from `--gn-category-open`
  to `--gn-surface-sunken` reddens the ratio arm — **measured ratio 1.000**, the bar becoming invisible,
  which is the exact defect the case exists for. Restored, `ui.css` returned to SHA-256
  `99676339e7f3ae68498f82fd1fcc189454976b25ba5ea6871c89cd64a74c9e80` byte for byte **at that point in the
  branch's history**; the fix round that followed edited this file's own docblock, so the tip's hash is
  `2b4be36e08b22b12b62b40c86a6980cd131a29d64f485a79c50081fba1e83358`. The proof is that the restore was
  byte-exact against the pre-mutation bytes, which is a fact about that revision, not about this one.

  **A RECORDED DEVIATION — the version stays, in the meta line.** The prototype writes the version into
  the workflow's NAME (`"Delivery v4"`, `:3175`) because its data has no separate field. The product names
  the workflow and its version separately, and case **10.62** asserts the version is shown, so dropping it
  to match the drawing would lose a fact the screen already had. The meta line is therefore
  `v7 · 3 states · 9 transitions` — the prototype's `"N states · N transitions"` plus the fact the row
  list already carried. 10.62 was updated in the same change to build that string from the fixture rather
  than typing today's numbers.

  **PLACEMENT, priced rather than lazy.** The `workflow-list__*` rules are **appended at the end of
  `ui.css`** instead of beside `.ticket-type-list__*` where a reader would look. Inserting a block that
  size at line ~1832 shifts every `ui.css:NNN` citation below it, and **45** of the repo's 134 name a line
  past that point; appending stales **0**, measured both ways. The two families sit **2,524** lines
  apart in that file (`.ticket-type-list__*` at `:1740-1832`, this family at `:4356-4410`), so the locality
  given up is small and the citations kept are not. The reasoning is
  in the CSS comment, so the next reader can move it deliberately rather than wonder.

  **Citations:** `packages/app-core/src/workflow-builder/ui/workflow-list-screen.tsx:112` (the grid),
  `:118` (the chip), `:120` (the bar and its category), `:127` (the meta line), `:99` (the subtitle),
  `:103` (the primary action on the shared variant), `packages/ui/src/ui.css:4384` (the chip fill),
  `:4394` (the neo shadow), `:4406-4408` (the bar roles)

  **RECORDED, NOT FIXED — this change removes the non-text-contrast sweep's only high reading, so
  `test:e2e:stack` is expected to go red.** The committed roster
  (`apps/web/e2e-stack/non-text-contrast-roster.json`, `totalClasses: 5`) has exactly two readings above 15:
  `button.workflow-list__new` and the generic `button`, both **17.62**, both on `/settings/workflows`, both
  carrying the UA default border `rgba(0,0,0,1)`. Both were bare `<button>`s before this change; both are now
  `Button`, i.e. `.gn-button`, which sets `border: none` (`ui.css:60`, with the reasoning at `ui.css:33-35`).
  The sweep scores only elements with a painted border (`helpers/non-text-contrast.ts:132-137`), so those two
  readings disappear, the maximum falls to 4.36, and `viewport.spec.ts:1020`'s
  `expect(bestSeen).toBeGreaterThan(15)` — the positive control proving the sweep can still tell red from
  green in the ordinary range — fails. The roster is rewritten unconditionally (`:946-968`), so the two
  entries would vanish with no trace. **Predicted from committed numbers and read CSS, not from a red run:
  the suite needs the live stack and `docker compose` is out of bounds for this lane.** `apps/web/e2e-stack/`
  is untouched by this branch (0 files changed). The repair is a decision about the control's premise — which
  this change deliberately removes — rather than a defect in this slice. **Owner: whoever next regenerates the
  viewport roster; raised to the controller.**

  **A RECORDED DEVIATION, previously silent.** `.workflow-list__title` is `font-size: 1rem`
  (`ui.css:4364`) where the prototype's heading is `20px/25px` (`desktop.dc.html:844`). The title is one of
  the three `isSettingsShell` nits the dispatch measured, and the third of those is a deliberate freeze
  (`globals.css:333`); this one was simply not carried over, and no case measures it. It is recorded rather
  than changed, because a heading size is a settings-shell decision rather than a card-grid one — the same
  reasoning that kept the other two nits out of slice 1. **Owner: the settings-shell pass.**

## settings → workflows: the two absences the prototype draws are RULED, not left as slots (executor 2, 2026-09-18)

Plan Tasks 2 and 3 (`docs/superpowers/plans/2026-09-18-settings-workflows-port.md:101-122`),
dispatch `CTL-DISPATCH-2026-09-18-settings-wf-task3.md`, branch `exec2/settings-wf-t2-t3`.

**NO NEW CASE ID IS MINTED, and that is a decision rather than an omission.** Both absences are
already pinned at the **RENDERED** node by **13.920**
(`packages/app-core/test/workflow-builder/screens.test.tsx:208-213`: `.workflow-list__badge` is
`null`, `.workflow-list__actions` holds exactly one `button`, the card's `textContent` matches
none of `/Published|Superseded|Draft/`, and the card holds exactly one `a, button`). Neither
ruling below adds an assertion a reader could falsify, so minting an id for them would put a case
in this catalogue that no run can ever turn ❌ — the opposite of what a case is for. **The tasks'
deliverable IS the record**: the screen's docblock, `Features.md`, and this entry. Executor 2's
block `13.890`–`13.919` is therefore still free from `13.894` on, exactly as it was before.

**Task 2 — `PublishedWorkflowDef` gains no status field; the badge is not built.** Owner ruling
2026-09-18, approving the controller's recommendation. The list serves only published
definitions, so a field that can hold exactly one value would be a badge that lies by omission
the moment a second state exists. `"Published"` is derivable from the read itself (had the badge
been built, it would have been a constant), and the prototype's other two values — `"Superseded"`
and `"Draft · N issues"` (`desktop.dc.html:3175-3178`) — are not on the wire, nor will an event be
added to carry them. Recorded in the docblock as a scope decision rather than as a missing field.

**Task 3 — `"View history"`: MEASURED FIRST, then not built.** The ruling was conditional — build
it *if the version chain is readable from an existing read* — so the measurement is the
deliverable. Two facts, each read rather than inferred:

1. **The prototype has no history view to port.** `"View history"` is the **`primary`** label of
   the SUPERSEDED card (`:3178`), *not* a second action: every card's `secondLabel` is
   `"Duplicate"` (`"Discard draft"` on the draft card). The plan and the delta doc group the three
   strings as "the second action" (`docs/design/prototype-delta-2026-09-18.md:635`), and that
   grouping hides the one that is not second — a correction to the dispatch's own framing, not to
   its conclusion. The block declares ten `screen:` values (`board`, `builder`, `legal`,
   `mcptokens`, `signin`, `typeeditor`, `types`, `workflows`, `workspace`, `workspaces`) and
   **none is a workflow history screen**; the only history SURFACE in the prototype is the ticket
   sheet's History tab (`:3589`, `:3734`), the word appearing elsewhere only in legal prose and
   toasts, which are not views. The handler `"View history"` is wired to (`:3187`)
   fires a **toast** — *"…has 128 recorded events — history is read-only"* — and navigates
   nowhere. So porting it would mean designing a view the prototype does not draw.
2. **The card that carries the affordance is not rendered by this product.** The prototype lists
   a superseded version as its own card (`"Field ops v2"` and `"Field ops v1"`, `:3176`, `:3178`).
   This screen renders one card per workflow id — `gateway.listWorkflows` →
   `GET /v1/workspaces/:id/workflows` → `latestWorkflowDefs`
   (`apps/server/src/read/workflow-defs.ts:25-38`), whose docblock says "the latest published
   definition per workflow id" and which loops `getWorkflowDefFromProjection(db, workspaceId, id)`
   with no version selector, i.e. the reader's `ORDER BY version DESC LIMIT 1` branch. There is no
   superseded card for the button to sit on.

   **The version-aware read DOES exist — end to end — and the first draft of this entry denied it.
   Corrected rather than left standing, and the correction is the reviewer's Critical finding, verified
   against the tree rather than accepted.** `DataSourceQuery.getWorkflowDef(workspaceId, workflowId,
   version?)` (`packages/app-core/src/data-source.ts:146`) declares a version parameter; the ONLINE
   adapter sends it (`online-data-source.ts:277-281` builds `?version=`), the replica adapter answers one
   locally, and the server route `GET /v1/workspaces/:workspaceId/workflows/:workflowId?version=N` serves
   any single version (`apps/server/src/routes/builder-reads.ts:579-608` — **re-pointed 2026-09-19 from
   `:517-546`, which was correct until Task 8's two insertions in that file moved it by +62**; numeric branch at
   `apps/server/src/projections/workflows.ts:116-120`). `WorkflowAuthoringGateway`
   (`packages/app-core/src/workflow-builder/gateway.ts:56-94`) **is** version-BLIND — neither
   `listWorkflows` nor `getWorkflow(workspaceId, workflowId)` takes a version — but the adapter that
   implements it **DROPS an argument that already exists one layer down**
   (`apps/web/src/authoring/data-source-gateway.ts:233`, whose own seam docblock names the member as
   `getWorkflowDef(workspaceId, workflowId, v?)` at `:26`). Versions are contiguous **by server-side
   ENFORCEMENT**, not by convention: the engine refuses a first version that is not 1, and any later
   version that is not `latest + 1` (`packages/rule-engine/src/workflow-defined.ts:53-58`, `:63-68`, rule
   `workflowVersion` at `refusal-rules.ts:18`) — so `1..N` is walkable from the `N` the list already
   returns. **What is missing is an exposed parameter, not a read.**

**The strongest argument the other way, recorded rather than glossed.** The chain is NOT missing
from the product. Every published version is its own row in `proj_workflows` — the projection's
docblock gives the reason ("every published version, queryable individually, because the engine's
version walk needs the intermediates and their stateMappings, not just the newest definition") —
`getWorkflowDefFromProjection` reads any one of them by number, and `readWorkflowVersions`
(`apps/server/src/sync/ledger-deps.ts:156-174`) already returns the whole ladder as
`Map<number, WorkflowDef>`. So a history view would need **no new schema and no new event**. Nor is
the chain even unserved over HTTP: `GET /v1/sync/bootstrap?workspaceId=<id>` returns "definitions
in `workspace_seq` order for everyone including guests"
(`apps/server/src/sync/sync-routes.ts:172-198`), so every published version of every workflow is
already reachable by a client that asks the replica door.

**THE RESOLUTION — a DEPARTURE from the ruling's words, stated that way so a reader does not take this
absence as what the ruling asked for.** The ruling is DATA-conditional and its data half is
**SATISFIED** — the chain is readable, by version, through reads that already ship — so **on the ruling's
own words the button was owed.** What stops this change short is a second rule from the same task text
colliding with the first: a button with no door behind it is *"the exact defect this repo keeps
re-finding"* (plan `:118-120`). Here it would have no door — the prototype draws no history view (its own
handler is a toast), and the card it hangs `"View history"` on is a SUPERSEDED version's, which this
screen does not render — so it would open nothing and sit nowhere. **Those two rules cannot both be
honoured, and only the owner can pick between them: ESCALATED to the controller, not decided here.**
Building it means designing the view and choosing where the button lives — two product decisions, and
inventing a screen is the one thing a measurement cannot authorise. The work needs no schema change and
should be dispatched as its own task rather than folded into this slice.

**No test was added and no test changed.** 13.920's pins are unchanged and still pass; this change
touches one docblock, `Features.md`, and this file.

## settings → workflows: the `isTypes` zebra and three strings — and two items the dispatch ordered that the hold register says are HELD (executor 2, 2026-09-18) — case `13.894`

Task 7 of the settings-workflows plan (`docs/superpowers/plans/2026-09-18-settings-workflows-port.md:146`),
the port part only, on `exec2/settings-wf-t7-t8` from `origin/main` = `99884bc9`. The prototype block is
`design-system/interactive/desktop.dc.html:817-839` at commit `227434a5`, **blob `6d7b67c0a52c`** — the two
shas are the commit and the blob of the same file and both are cited across the docs, which is worth
knowing before concluding one of them is stale.

- ✅ **13.894 — the ticket-type list stripes the 1-indexed EVEN rows, and the stripe is visible.** Two
  halves, split the way every styling case in this repo splits: `packages/app-core/test/ticket-types/ticket-types.test.tsx`
  proves the COMPONENT renders the ported strings and the DOM the parity depends on, and
  `packages/ui/test/tokens.test.ts` measures the `ui.css` rule.

  **The zebra, and why the parity is the whole case.** The prototype stripes
  `(i % 2 ? ";background:var(--fill4)" : "")` over a **0-based** `i` (`:3159`), so the tint falls on the
  **1-indexed EVEN** rows. That single bit is silently invertible and **two families in this repo already
  inverted it** — `.gn-list__table-row:nth-child(odd)` (`packages/ui/src/ui.css:1088`) and
  `.gn-timeline__row:nth-of-type(odd)` (`:2703`), both ODD, both therefore reading inverted against the
  prototype. Those two are **already recorded with a named owner** at `apps/web/app/globals.css:1518-1523`
  (*"owner: whoever next touches those two families"*), so this change adds the third member of the
  MATCHING set — `.gn-members__row:nth-child(even)` (`:1524`) was the first — and **re-records nothing and
  harmonises nothing**. The case reads the sibling rules as its own control: if the instrument could not
  tell the parities apart it would report ODD for them too, and the pair would prove nothing.

  **The DOM precondition is asserted in the component half because `:nth-child` counts ELEMENTS.** Every
  row must be a DIRECT `<li>` of the one `<ul>`, one per type, in the rendered order — a wrapper, a header
  row, or a row moved out of the list would shift every stripe by one and land on ODD. Five rows render,
  so `:nth-child(even)` has two to choose from: not zero, not all five.

  **The measurement.** `--fill4` → `--gn-fill-quaternary` over the row's own resting fill, composited and
  measured in all six style/theme combinations: **1.0951** (hig/light), **1.2536** (hig/dark), **1.0757**
  (neo/light), **1.1727** (neo/dark). No style collapses the stripe onto its own ground, so unlike the
  state chip in 13.920 there is no shadow-shaped repair owed here. The case asserts a floor of **1.05**
  and pins the four readings, so a palette nudge that stays green still shows up as a movement.

  **THE ROLE IS READ OUT OF THE RULE, NOT NAMED IN THE TEST, and a mutation is why.** The first draft
  hard-coded `surfaceSunken`/`fillQuaternary`; repointing the stripe at the ground token left it GREEN,
  because a hard-coded palette assertion is unfalsifiable by any CSS edit — the exact
  check-that-cannot-fail shape this repo keeps re-finding. It now reads the role out of the declarations,
  as 13.920 does, and the same mutation reddens it.

  **The three strings**, all the prototype's: the action is `"New type"` (`:823`), the h2 carries its
  `20px/25px` (`:820`), and the summary is its sentence (data `:3150`). This screen's own singular
  handling is KEPT — the prototype writes `${n} types.` unconditionally and would say "1 types." — and it
  is witnessed by a second render with one type rather than by a negative against the five-type one,
  which would be a check that cannot fail.

  **`"New type"` had a blast radius the dispatch did not name, carried end to end in this change:**
  `ticket-type-list-screen.tsx`, `apps/web/test/settings-page.test.tsx` (10.72),
  `packages/app-core/test/ticket-types/ticket-types.test.tsx`, this file, and `docs/manual.md:973` with
  `content.generated.ts` regenerated (`check:help` fails when the two disagree). **The one that matters
  most is a CONTROL that would have been silently disarmed:** `"hides New ticket type from non-authors"` is
  a `queryByRole(...).not.toBeInTheDocument()`, and left on the old string it would have gone on passing
  while being unable to fail. The editor pane's own `"New ticket type"` heading
  (`apps/web/src/ticket-type-editor-pane.tsx:155`) is a DIFFERENT screen and is deliberately untouched.

  **MUTATION BATTERY — three on the CSS, three on the component, all restored and sha256-verified in the
  same invocation.** Parity `even`→`odd`: 3 killed. Hover rule left at the bare selector: **1 killed, its
  own site.** Stripe repointed to the ground token: **1 killed, its own site.** Row stops being an `<li>`:
  3 killed. Action label and summary sentence reverted: **1 each, their own site.**

  **TWO ITEMS THE DISPATCH ORDERED ARE NOT BUILT, AND BOTH ARE HOLDS RATHER THAN DECISIONS.**
  **⚠ SUPERSEDED 2026-09-19 — THE OWNER LIFTED BOTH, AND BOTH ARE NOW BUILT.** The reorder is BUILT (cases
  `13.928`–`13.934`); the per-type count is BUILT TOO (cases `13.948`–`13.955`, `getTicketCountsByType` over
  a new `ticket-counts-by-type` route) — this sentence said "remains unbuilt and is Task 8" until Task 8
  shipped in the same change set that rewrote it. **The
  paragraph below, including its sentence that the measurement "does NOT lift it", is the record as it
  stood on 2026-09-18 — read it as history, not as state.** It is kept rather than rewritten because the
  measurement it carries is what made the reorder a render task rather than the wire task three planning
  documents called it, and that correction is worth more than a tidy paragraph.
  `docs/lanes/owner-holds.md` §1 lists *"`isTypes` | reorder and per-type counts"* as **HELD (owner,
  2026-09-18)**, and the register's own rule is that an item leaves it only when the owner names it — never
  on a belief, and never because another document says so. The dispatch
  (`CTL-DISPATCH-2026-09-18-settings-wf-task78.md`) says both are *"ruled"*; the plan's own ruled table
  lists only the `"Draft"` badge and the Edit button for this screen; and `controller-state.md:324` agrees
  with the register (*"NOT dispatched by default; the owner picks which are wanted"*). **Escalated to the
  controller by name, and held — not decided here.** `EXEC2-QUESTION-2026-09-18-isTypes-held-items.md`.

  **One measurement that bears on the reorder's hold, and does NOT lift it.** §1 scopes itself to screens
  *"whose prototype controls have no server behind them"*, and for the reorder that premise is false: the
  gateway declares no update op, but the editor already writes `rank` through the ONE existing door —
  `onSave` authors a `ticket-type.defined` carrying the whole definition and calls `gateway.submit`
  (`ticket-type-editor-screen.tsx:178-204`), and `ticketTypeDefSchema.rank` is
  `z.number().int().min(1)` (`packages/domain/src/ticket-types.ts:98`). **So if the hold lifts it is a
  render task, not the wire task the audit scoped it as** — and the plan's own Task 6 text anticipated
  exactly this (*"may be a route over existing data rather than a new concept — measure before
  designing"*). Two things a later implementer must carry that the prototype does not model: the four
  built-ins are rank-locked server-side (`packages/rule-engine/src/checks/ticket-type.ts:60-62`), and the
  product's rank is a stored number with no uniqueness enforcement, while the prototype's is its array
  index. **The count is the opposite: it genuinely needs server surface** — the only population read is
  pinned to one workflow and the route counts `WHERE workflow_id = $n`
  (`apps/server/src/routes/builder-reads.ts:408-414`).

  **The prototype's leading 34px rank tile is a delta this change does NOT close** — the row still leads
  with `<TypeIcon>` and carries `rank N` in the meta line. It is neither ruled nor held; it is simply
  outside this task's scope, and it is reported rather than left to be discovered by a reader comparing
  the two. `packages/app-core/src/workflow-builder/ticket-types/ticket-type-list-screen.tsx`,
  `packages/ui/src/ui.css`, `apps/web/test/settings-page.test.tsx`,
  `packages/app-core/test/ticket-types/ticket-types.test.tsx`, `packages/ui/test/tokens.test.ts`,
  `docs/manual.md`, `packages/app-core/src/help/content.generated.ts`, `Features.md`

### The review round — three Important, and one of them was in the test's own evidence

One reviewer at `0fd14cd8`, read-only, record before the PR. **No Critical.** The port itself held —
parity, specificity, source order, the DOM precondition and the rename all verified. All three Important
findings were defects in **what the new evidence claimed about itself**, which is the class this repo
catalogues most.

- **I1 — the visibility pin composited against a layer the change itself replaces.** The zebra rule sets
  `background` on the row; it does not layer over the row's own fill, and neither
  `.ticket-type-list__rows` nor `.ticket-type-list__card` sets one — so the translucent stripe composites
  over **`.gn-card`'s `--gn-surface-raised`**, not over `--gn-surface-sunken`. Under `neo` the two roles are
  the same hex, which is why the error hid there and only showed under `hig`. **Corrected and re-measured:
  1.1026 / 1.2727 (hig and minimal, light and dark) and 1.0757 / 1.1727 (neo)** — the stripe is *more*
  visible than first asserted, so the error was conservative, but two of the four pinned numbers did not
  describe the browser. All six style/theme combinations are now pinned rather than four. **13.920
  composites its chip over `surfaceRaised` for the same reason**, so this was a divergence from the file's
  own precedent.
- **I2 — the hover case's name claimed a property no assertion read.** *"…not by `!important`"*, with
  nothing reading the stylesheet for `!important`: a mutation adding it to the stripe left the case green,
  which is precisely the defect the case exists to prevent — hover dying silently on the striped rows. The
  claim is now read, not assumed: **`!important` on the stripe alone reddens that case.**
- **I3 — five citations did not resolve, and two of them were invalidated by this change's own edit.**
  `ui.css:2671` → **`:2703`** (my +32 lines moved it; the number appeared in four artifacts), the
  row-as-door owner quote `ui.css:1603-1611` → **`:1811-1812`**, `desktop.dc.html:3150` → **`:3155`** for
  `rank: String(i + 1)`, and the docblock's self-citations `:65-70`/`:17-23` → **`:149-177`**/**`:100-107`**.
  **A citation that points into the docblock being read is the worst kind**: the reader cannot tell a stale
  number from a forward reference. All corrected.

**Also fixed:** the parity case's two `toContain` lines were tautologies on this file's own literal (kept
only because the not-null read of that exact string out of `ui.css` is what makes them facts about the
stylesheet — now stated); the "control" that asserted the siblings merely *exist* was **overstated** in its
own comment and now reads their parity and their token through the same instrument, reporting the two
limits it cannot cover; a "the even rows number two" control in the component half was **arithmetic off the
`toHaveLength(5)` beside it** and has been **removed rather than padded**, with the reason recorded; and the
h2's `20px/25px/600` — the third of the three ported strings — was pinned by **nothing**, so it now has its
own case.

**MUTATION BATTERY AFTER THE FIX ROUND — eight, each killed, all restored sha256-verified in the same
invocation, the last two surgical (one rule, not the twelve an earlier `sed` matched).** Parity
`even`→`odd`: 3 killed. Hover at the bare selector: **1, its own site.** Stripe repointed to the ground:
**1, its own site.** `!important` added to the stripe: **1, its own site** — the reviewer's gap, now
closed. Title metrics reverted: **1, its own site.** Row stops being an `<li>`: 3. Action label and summary
reverted: **1 each.**

**ONE FINDING IS REPORTED AND NOT FIXED, WITH A NAMED OWNER.** This change adds 83 lines to the top of the
screen file, so citations to that file in **files this change does not touch** are now off:
`docs/design/prototype-delta-2026-09-18.md:622` cites `ticket-type-list-screen.tsx:56`/`:50-52` and
`ui.css:1590`, and the plan cites `ticket-type-list-screen.tsx:17-23`. `check:citations` passes — these are
prose citations and it does not cover them. **They are recorded rather than rewritten**, because the delta
doc is a dated audit snapshot whose line numbers describe the tree at audit time, and because two other
writers hold conflicting claims on those files. **Owner: the controller, at the next settings-cluster
sweep.**

**ADDED 2026-09-19 — the same sweep is due again, and Task 8 followed the same rule rather than inventing
one.** That change is **net +71 lines** in the same screen file. **Only five of them sit above the
`Edit`/`Draft`/reorder bullets** — the count bullet is appended after them and the component bodies are
below — so the shift is **+5** in the bullet region and larger further down, which is what a reader
re-pointing a citation actually needs to know. **Re-pointed, because both ends are in this change set:**
`packages/app-core/test/ticket-types/ticket-types.test.tsx`'s `:38-54` → **`:43-59`**; `Features.md`'s
`:130-145` → **`:331-351`** (already off — it named the loading effect rather than the
`section > header > Card` shell — so it is a fix rather than a shift, marked as one where it stands); and
**`:311-337` → `:387-416` at three sites** — `ticket-type-list-screen.tsx:37` and `:357`, and
`ticket-types.test.tsx:322`, all citing the row-door `<button>`. **Those three are the review's finding,
not the author's:** the range was already drifting (the button was `:317-345` when the reorder shipped)
and this change moved it out of the region entirely, so a reader following it landed in `ticketsSegment`.
**A same-file citation whose target has moved twice is the one no instrument catches** —
`check-case-citations` reads prose citations not at all.
**Recorded and NOT rewritten, same named owner — the controller:**
`apps/web/src/workspace-settings-form.tsx:94` (`:130-145`), the plan's `:195` (`:35-56`) and its
`:113`/`:234` (`:17-23`), all five delta-audit rows, and `docs/lanes/controller-state.md:53`.
**One of those is not merely shifted but CLOSED:** the delta audit's row for the `"N tickets"` segment
reads *"the only population call is pinned to ONE workflow … no `countTicketsOfType` exists and the pinned
count would be wrong here"* — both halves are now false, because the wide read exists and the screen
renders it. That row describes the tree at audit time, which is what the audit is for.

**A SECOND FILE SHIFTED, AND THE SAME RULE APPLIES TO IT.** Task 8's server work inserted **+62 lines**
into `apps/server/src/routes/builder-reads.ts` (`readTicketCounts` and its docblock, then the performance
note added after the review). **Re-pointed, because this file is in the change set:** the version-route
citation at `:517-546` → **`:579-608`**, verified by content — the route's `app.get` opening line and its
closing `);`. **Recorded, owner: the controller** — every other citation INTO that file:
`test-cases/03-foundation-ledger.md:109` (`:531`), `test-cases/07-api-realtime-search.md:476` and `:629`
(`:444`, `:448`), `test-cases/13-second-wave-board-actions.md:23` and
`13-second-wave-roles-and-navigation.md:119`/`:1259` (`:247`, `:247-252`),
`docs/hig-reconciliation-audit.md:185`/`:186` (`:247`), and the `docs/lanes/executor-state.md` ledger
tables. **Which of those are actually wrong is part of the record, because a list a reader cannot act on
is not a finding: `:247` and `:408-414` sit BEFORE the insertion and are untouched and still correct**;
**`:444`/`:448` were ALREADY wrong at `origin/main`** (`MIGRATION_RULES` was at `:441` there, not `:444`),
so they are pre-existing drift rather than this change's; the rest are shifted by +62.

## Settings → Workspace restyle: the switch, the info icons, the Save row (executor 2, 2026-09-18) — cases `13.895`–`13.901`

The owner: *"the settings -> workspace tab, needs to be a better UI. also have an info icon near the
fiends to give a brief explanation (hover/focus/click - same witht the projects nav item). save button
on a new row. auto close on/off -> make it a radio rather than checkbox (check the account page on the
styling of the radio.) and be mindful of the spacings."* The control question was settled by the owner
after two wrong guesses: what `/account` draws is a **switch**, not a radio group. The `Off` checkbox on
the auto-close field therefore became a switch, and **its polarity INVERTED** — `checked` now means ON,
where the box's tick meant off. That inversion is the whole hazard of the swap and is why the cases
below pin both directions separately.

`13.890`–`13.894` were already spent (`#480`, `#482`); these seven continue the block. Recounted at this
branch's tip by case MARKER only — `13.895`–`13.918` are free repo-wide, and every hit in a body-text
sweep for the block's own bounds is prose *mentioning* the range, which is exactly the trap
`scripts/check-case-ids.mjs` exists to tell apart.

- ✅ **13.895 — the switch's CHECKED state means ON, which is the inverse of the `Off` box it replaced,
  and turning it off is what claims `null`.** `apps/web/test/settings-page.test.tsx`. The fixture is a
  workspace at `autoCloseAfterDays: 30`, so the control must mount CHECKED; a binding carried across
  unchanged (`checked={autoCloseOff}`) mounts it unchecked and fails on that line. Both directions are
  asserted — mounted-checked, then clicked to unchecked with the window disabled and the payload
  `{autoCloseAfterDays: null}` — because a single "click then read the payload" case passes against the
  inverted mutant half the time.
- ✅ **13.896 — a blank window is a THIRD state, and turning the switch ON over it is not a claim.**
  `apps/web/test/settings-page.test.tsx`. From `autoCloseAfterDays: null`, switching ON enables the
  number input while leaving it EMPTY, sends nothing, and keeps Save disabled. Empty is not a window and
  must not be read as one; nor may it be read as "off" — the switch is demonstrably ON at the moment
  Save is still refused. This is the distinction the original `Off` control existed to protect, asserted
  after the control changed.
- ✅ **13.897 — each field's info icon opens on hover, on focus AND on click, and closes on Escape.**
  `apps/web/test/settings-page.test.tsx`. All three paths are asserted separately because the owner
  named all three, and the CLICK path is the one a plausible implementation gets wrong: a click focuses
  the button first, so a toggling `onClick` reads the state `onFocus` has just set and closes the panel
  immediately. The case also pins that the three buttons carry three DIFFERENT accessible names
  (`About Stale after` / `About Due soon within` / `About Auto-close after`) — three buttons named
  "About" would be one name for three different disclosures.
- ✅ **13.898 — Save sits on its own row, outside the field column.** `apps/web/test/settings-page.test.tsx`.
  Asserted as a RELATIONSHIP rather than by class name: the button's row must not be inside
  `.gn-workspace-settings__fields`, and must be a sibling of it under the same card. A wrapper added
  around each field would still satisfy `closest('.gn-workspace-settings__actions')`, which is why the
  discriminating assertion is the `closest(...__fields)` returning null.
- ✅ **13.899 — the switch is ONE rule set in `ui.css`, and its two states differ.**
  `packages/ui/test/tokens.test.ts`. Reads declarations out of `ui.css` and resolves their roles through
  `colorOf`, in every style×theme: the checked track and the unchecked track must name different roles
  AND resolve to different colours (the `neo`-collapses-the-fills failure would name two roles and paint
  one hex), and the knob's ring must differ from the knob's own fill both by role and by resolved value —
  a ring that resolves to the fill is a boundary that is not drawn. The CONTROL is the file the rules
  moved OUT of: the pre-extraction selector `.gn-account__notification-row input[type='checkbox']` must
  be absent from `apps/web/app/globals.css`, which is what makes "there is one switch rule set" a
  measurement rather than a claim. It also reads both SOURCES and asserts each imports the shared
  `Switch` and neither has grown a hand-rolled `<input type="checkbox">` back. **What it cannot see,
  stated rather than implied:** the track is an alpha fill, so the knob ring's true contrast against it
  is a COMPOSITING question this instrument is blind to — the same limit `13.894` records for its stripe.
- ✅ **13.900 — `Switch` and `InfoTip`, the component halves.** `packages/ui/test/components.test.tsx`.
  `Switch` is a real checkbox named by the label it wraps (`getByLabelText` resolves to it), hands the
  caller the NEXT boolean rather than the event, keeps the caller's `className` alongside its own row
  class, and passes `disabled` through. `InfoTip` is closed to begin with and names its button for what
  it explains.
- ✅ **13.901 — the info panel keeps a boundary where the shadow cannot, and the trigger meets the
  24px floor.** `packages/ui/test/tokens.test.ts`. Three things the review found entirely unpinned.
  **(a)** The panel declares `border: 1px solid var(--gn-border)`, and the border is load-bearing
  rather than decorative: the panel is `surfaceRaised` on a card that is also `surfaceRaised` (the
  same role on the same role, so the fill separates nothing), and `SHADOWS.minimal.raised` is `[]` in
  both themes — asserted in the case rather than asserted-about — so under `minimal` the shadow
  resolves to `none` and the border is the only edge there is. The first version of the rule had no
  border and justified itself by false analogy with `.gn-card`'s boundary against its PARENT, which is
  `surfaceRaised` over `surface`, a boundary of a different kind. **(b)** The trigger is at least
  24×24 — the product's own floor for a dense in-list control (`ui.css:1246-1249`). It shipped at
  20×20, and the hit area is exactly the declared box because `globals.css:5` is
  `* { box-sizing: border-box }` and the trigger's padding is `0`. **(c)** The 44px tap ratchet does
  NOT see it, and that is recorded rather than left to read as compliance: it is reached by NEITHER
  exemption in `e2e-viewport/tap-targets.ts` — the inline-in-prose one needs `display: inline` with a
  text-bearing parent, and a `DENSE_IN_LIST` entry (added 2026-09-20) would need its route swept at
  all — and an `inline-flex` trigger holding an `aria-hidden` SVG fails both. ⚠ Cited by SELECTOR:
  this line named `e2e-viewport/tap-targets.ts:100-104` until 2026-09-20, and those numbers now land
  inside the table added there. The ratchet stays
  green only because no roster walks the settings routes (`viewports.ts:171-176`,
  `e2e-stack/viewport.spec.ts:419-427`). **Owner: whoever next owns the settings-cluster viewport
  roster** — the whole settings page, not this control, is the gap.

**A defect the tests caught before the PR, recorded because it is the kind a screenshot would not
show.** `InfoTip`'s first `onClick` was a TOGGLE, and a toggle loses a race it cannot see: clicking a
button focuses it first, so React ran `onFocus` (open) and then `onClick`, which read the state it had
just been given and closed the panel. The click appeared to do nothing. `13.897` and `13.900` now pin
the click path explicitly; the handler opens idempotently, which is also the honest spelling of the
owner's request that hover, focus and click all OPEN it.

## Migration ordering (owner ruling 2026-09-18 — `scripts/check-migration-order.mjs`)

**The incident these cases exist for, measured rather than reconstructed.** PR #459 added
`1789300000000_proj-tickets-reopened-at.sql` to a branch cut from main after
`1789400000000_workspace-settings-auto-close.sql` had already landed. There is no database on which
that migration could ever have run: `node-pg-migrate`'s `checkOrder` compares the applied list against
the sorted file list position by position and throws *"Not run migration … is preceding already run
migration …"*. **The full server suite — 1,548 tests — was green on that tree**, because a fresh test
database applies every migration cleanly in numerical order, and the hot stack went down instead
(migrations run only at container start and its entrypoint aborts on failure). Commit `73c40ea3`
renamed the file to `1789500000000` and its own subject records the reason. **The gate proves the
repo; it cannot prove a database that has already run something.** This is the one place that can.

**The real check was run against both real revisions, not just the fixtures** — and this is the
falsifiability the whole file rests on, so it is recorded with its command:
`checkMigrationOrder` over the migrations directory at PR #459's fork point (`36ec6ae3`, highest
prefix `1789400000000`) against the branch tip (`dc7be7d3`) exits **1**, naming
`1789300000000_proj-tickets-reopened-at.sql`; the same comparison against `73c40ea3` exits **0**.
Red before the fix, green after, on the real trees.

- ✅ **13.902 — a migration numbered below the base ref's highest prefix is refused, and the refusal
  names the offender and the ceiling.** `apps/server/test/tooling/check-migration-order.test.ts`,
  which imports the script's own exported rule. Both directions are pinned on one pair, because
  asserting only the refusal would pass under a mutation that refused everything: the real incident's
  filename is refused against a base holding `1789400000000`, and the same file renumbered to
  `1789500000000` is accepted with `newFiles` exactly `['1789500000000_reopened-at.sql']`.
- ✅ **13.903 — every planted defect shape is caught, and the known-good control stays clean.**
  Six planted defects, each asserting its **exact** problem count *and* that the refusal names its own
  site — a count alone cannot tell a check that fired for the right reason from one that fired
  broadly. One of the six legitimately produces **two** problems (a prefix equal to the base's highest
  is both a duplicate and not-strictly-above) and the count is written down per case rather than fixed
  at one; an earlier draft asserted one and the run refused the fixture, so the fixture was corrected
  and not the check. Five known-good cases, including a hidden dotfile and a migration **removed** from
  the current directory — removal is explicitly not this rule, since a rename of a not-yet-applied
  migration is legitimate and indistinguishable from this side.
- ✅ **13.904 — the reader is under test, not only the comparison.** The fixtures are real
  **directories** read by the same `readdirSync` reader the real sweep uses, so the filter and the sort
  are witnessed rather than assumed. Dropping the `^\..*` ignore pattern reddens this case and 13.903
  and nothing else: `.DS_Store` carries no numeric prefix, the runner reads that as `0`, and it would
  otherwise be refused as the lowest migration in the tree. The case also pins the sort as numeric
  rather than lexicographic, which is the one direction where the two disagree — `'1789400000000_a.sql'
  < '900000000000_b.sql'` as strings while `900000000000 < 1789400000000` as numbers.
- ✅ **13.905 — the prefix parser mirrors `node-pg-migrate`'s, including its 17-digit `utc` form.**
  This is the divergence that produces a well-formed WRONG answer instead of a failure:
  `Number('20260101000000000')` is `2.026e16`, larger than any 13-digit epoch, so a check that compared
  `Number()` would **accept** a migration dated 2026-01-01 that in fact sorts below everything. The
  case asserts the 17-digit prefix resolves to its instant (`1767225600000`) rather than its digits,
  and that a file carrying it below the floor is refused naming that instant.

**Disabling the 17-digit branch, dropping the hidden-file filter, and weakening `>` to `>=` each
redden a different, named case** (13.905 + 13.903 · 13.904 + 13.903 · 13.903 alone), verified by
mutation against the real file with the original restored byte-identically at sha256
`0543ba334e4223b4d627739d4f5d52f9e4d851d8cf863dae41927342d348f055`.

**Today's directory passes as-is, and that is a measurement rather than an assumption.** All 27 files
carry a unique 13-digit prefix, sorted order equals numeric order, and the highest is `1789500000000`;
the check reports `0 new against origin/main`. **No pre-existing violation was found, and none was
waived** — the check has no skip list and skips nothing.

- ✅ **13.906 — the baseline half of the path is witnessed too.** Review measured that `materializeRef`
  and `resolveBaseRef` were covered by **no test at all** — which is the half a defect had just been
  found in — so the part that turns a git ref into a directory is now exercised rather than assumed.
  `materializeRef('HEAD', dir)` returns a non-empty count AND its output is read back by the same
  `readMigrationNames` the real sweep uses, because a baseline on a different path from the tree it is
  compared against is exactly the drift this guards. The throw case matters most: a ref the repo cannot
  list must not silently materialise an **empty** baseline, which would make every migration "new" above
  a maximum of none and report a clean sweep it had not earned. Deleting the throw reddens this case and
  only this case.

**Two honest non-coverage notes.** It does not refuse a migration *removed or renamed* from the base
set (13.903 records a removal as accepted, deliberately). And it cannot see a lower-numbered migration
that reached the base ref before the branch existed — that is the base ref's own run of this check.

**Two defects the REVIEW round found in the first version, both fixed and both verified by measurement
rather than by re-reading the diff.** (a) **The new CI job was not in `gate`'s `needs`** — so a
violating PR would have produced `check-migrations: failure` *and* `gate: success`, and `gate` is the
single check name the auto-merge precondition reads. The branch's own comment claimed it ran "on the
same terms as `check-tasks`", which **is** in that list; the claim was false as written. (b) **A stacked
branch was a real false accept**: compared against `origin/main` a migration that its own base already
outranks is accepted, and both merge into the same out-of-order file set. Reproduced in a scratch repo —
the same tree gives `EXIT 0` against the parent branch's *base* and `EXIT 1` against the parent branch —
and the CI job now passes `--base origin/${{ github.base_ref || 'main' }}`, so a pull request is measured
against the branch it will actually land on. **14 of the last 400 merges here were based on a non-main
branch**, so the shape is used rather than hypothetical.

## settings → workflows: the ticket-type editor's Implications card, and a sentence the product only said to itself (executor 1, 2026-09-18) — cases `13.922`–`13.923`

The two items of Task 5's `isTypeEditor` port that carry **no product decision**, and nothing else. The
prototype block is `design-system/interactive/desktop.dc.html:871-957`, read from `main`; the audit's own
row is `docs/design/prototype-delta-2026-09-18.md:638`. **What is NOT in this slice is named at the end of
this section**, because a partial port that reads as a finished one is the exact failure this catalogue
exists to stop — and the delta row this slice was staged from had already gone stale in one place
(`customFieldDefSchema`'s `required`, closed hours earlier by `#447` at `caf1edec`), which is why every
line here was re-measured against `origin/main` before it was written.

- ✅ **13.922 — the Implications card renders the prototype's three-item list, with the workspace-derived
  hierarchy sentence as its MIDDLE item.** The prototype's two constant lines
  (*"Two pickers will re-order: the board's New ticket menu and MCP's `create_ticket`."* and *"Published
  workflows are versioned — nothing already recorded is rewritten."*, `:950` and `:952`) now bracket the
  sentence `rankImplicationsCopy` computes from the workspace's own types
  (`packages/app-core/src/workflow-builder/ticket-types/ticket-type-editor-screen.tsx:440`).

  **The assertion is the rendered list, IN ORDER** (`packages/app-core/test/ticket-types/ticket-types.test.tsx:296`),
  and that is the whole point of the case. The failure it has to catch is a port that swaps the derived
  sentence out for the two constants — which would still render an "Implications" card, would still show
  both prototype strings, and would have silently deleted the only line on that panel computed from real
  data. Two of the three items are constants; the test exists to say which one is not.

  **Proved by a discriminating mutation.** Swapping the derived item to the end reddens **13.922 alone**
  (`Tests 1 failed | 30 passed`), while the pre-existing case at `:277` — which queries the same
  `rank-implications` testid and asserts its text — **stays green**, because the node is still there with
  the right words. A *contains-all-three* assertion would also have stayed green. That is what makes this
  case worth its line count: it sees ORDER, and the instrument that was already here cannot.

- ✅ **13.923 — the divergence notice tells the admin that staying put is a decision, in the prototype's own
  words** (`packages/app-core/test/ticket-types/ticket-types.test.tsx:620`, rendered at
  `packages/app-core/src/workflow-builder/ticket-types/ticket-type-editor-screen.tsx:341`).

  The product already **held** this position — its source says *"Staying put is a decision, not the absence
  of one"* as a comment beside the Leave button — and the delta audit measured the prototype's sentence at
  **0 hits** across `apps/` and `packages/`. A position the product takes only in its own source is a
  position the admin deciding this cannot read, and that is the gap the case pins. It renders with the two
  buttons and not outside them, because it is a sentence about THAT choice: the `left` branch above it has
  already made the decision, and the migrated branch has finished making it.

  **Mutation:** deleting the note reddens **13.923 alone** (`1 failed | 30 passed`).

**THE CSS IS FOUR NEW RULES APPENDED AT THE END OF `ui.css`, and the placement is priced rather than
lazy.** `.ticket-type-editor__implications` is **not** redefined — its typography lives in a rule it already
shares with `__builtin-note` (`packages/ui/src/ui.css:1942-1943`), and that rule is left byte-identical; the
list carries a second class for its shape (`:4714`, `:4720`), plus the prototype's inline chip (`:4725`) and
the note (`:4734`). Editing the shared rule in place would have added lines at `:1942` and pushed every
citation below it stale. **This change APPENDS AT EOF instead, which moves no existing citation at all —
a structural fact, not a count.** A count was the wrong instrument and this is the record of why: the same
figure read **33, then 34, then 32** across three merges in one afternoon, because a count is a reading that
expires and its universe must be named every time. **Every `ui.css` and test-file number above was
re-measured after the last rebase onto `4505cb6d`**, which moved `ui.css` again — the first pass swept only
the former, and three citations that had come
to resolve to unrelated code rather than to nothing were corrected afterwards.

**One claim in this slice is reasoning, not measurement, and it is flagged rather than dressed up.** The
prototype gets its row rhythm from `display:flex` + `gap:6px` (`:949`). This slice does **not** transcribe
that; it uses a sibling margin, `li + li { margin-top: 0.375rem }`, so the card keeps its bullets. The
reason is that a flex container blockifies its children, which is a CSS-spec rule rather than something
observed here — **no browser was run for this slice, and none can be: the viewport suite is not in this
branch's gate.** The shape chosen is the one that does not depend on the answer, so nothing here breaks
whichever way the spec question lands. What IS asserted is the rendered `<li>` order and text, which is
independent of it.

**The five items this slice did NOT port, and what Task 5b did with each.** The list is kept because it
is this slice's scope contract, not because anything on it is outstanding — three of the five are now
built or ruled, and the two that remain are rules with owners rather than unfinished work.

| # | item | Task 5b outcome |
|---|---|---|
| 1 | **the header row** — prototype Cancel + Save in the h2 row at 22px (`:874-880`) | **BUILT.** The row is the SCREEN's (`packages/app-core/src/workflow-builder/ticket-types/ticket-type-editor-screen.tsx:124`, `EditorHeader` at `:112`), because the screen owns `parsed`, `save` and the `canAuthor` gate and two components' subtrees cannot be one flex row. The pane hands its Cancel in as a node (`apps/web/src/ticket-type-editor-pane.tsx:114-125`). **The Save MOVED; it did not multiply** — one control, every gate it had. Case **13.924**. |
| 2 | **the right-hand `--tintWarning` placement** of the divergence card | **BUILT, and the composite was re-measured on BOTH candidate grounds** before the move: over `surface`, `text` 10.51–11.94 and `textMuted` 8.23–12.08; over `surfaceRaised`, 9.79–11.91 and 8.45–10.74. Both clear the 4.5 floor, so **the placement does not depend on the measurement**. The notice is now `ticket-type-editor-screen.tsx:463`, in the aside, and its 3px marker is gone (`packages/ui/src/ui.css`, § DIVERGENCE at EOF). Case **13.925**. |
| 3 | **the "Choose again" reopen control** (`:944`) | **NOT BUILT — a rule, not an omission.** No reopen door exists on `WorkflowAuthoringGateway`, and a button with no door behind it is the defect this repo keeps re-finding. Recorded as an ABSENCE with an owner (whoever first adds a reopen route), not as an empty slot. Case **13.926** asserts the migrated branch stays terminal. |
| 4 | **the prototype's state-naming** — *"Move them to Scheduled"*, a **state** | **NO CHANGE.** The product names the **workflow** (`ticket-type-editor-screen.tsx:514`), deliberately: a re-binding moves tickets between workflows and the state mapping is the dialog's own, per ticket. Now recorded at the button itself, so a reader comparing the two screens does not read it as a transcription slip. |
| 5 | **the field-kind vocabulary** — prototype `Text / Date / Number / Attachment` (`:919`) vs the product's `['text','number','date','select','person']` (`packages/domain/src/ticket-types.ts:4`) | **THE VOCABULARY IS UNCHANGED; the LABEL was fixed.** The value stays the lowercase wire member; the label is the prototype's (`packages/app-core/src/workflow-builder/ticket-types/fields-editor.tsx:121-124`). Adding `Attachment` is a **data-model** decision (it decides whether a custom field can hold a file) and is with the owner — **not in this PR**. Case **13.927** pins both halves in one test, so a future rename cannot pass by satisfying the label half alone. |

**Two citations in this list had no successor line and were re-resolved by CONTENT, not by arithmetic:**
the header row's old home (`apps/web/src/ticket-type-editor-pane.tsx:108-113`) and the form-foot Save
(`ticket-type-editor-screen.tsx:382-389`) both describe code that **moved** rather than shifted, so each is
given its new home above instead of being silently renumbered. The other citations this change moved were
repaired against an explicit shift map, one file at a time.

---

## Second wave Task 12 — closing paragraph: final gate, catalogue checks, citation sweep

Closes out the second-wave plan (`docs/superpowers/plans/2026-09-17-backlog-and-closed-second-wave.md`,
spec §8). The plan's own last step, and the one this section is.

### The gate, per package, with its Node

`node --version` → **v22.22.2** for every number below. `pnpm turbo run build --force` ran FIRST and
exited 0, because these suites import sibling packages **by package name** and would otherwise resolve a
stale `dist` and report a false red. Each package then ran its own `vitest run --maxWorkers=2` and its own
`typecheck`.

| Package | Tests | Files | Typecheck |
|---|---|---|---|
| `packages/domain` | PASS 514 / FAIL 0 | 30 | EXIT=0 |
| `packages/rule-engine` | PASS 331 / FAIL 0 | 16 | EXIT=0 |
| `packages/app-core` | PASS 1554 / FAIL 0 | 94 | EXIT=0 |
| `packages/ui` | PASS 351 / FAIL 0 | 6 | EXIT=0 |
| `packages/mcp-server` | PASS 44 / FAIL 0 | 8 | EXIT=0 |
| `apps/web` | PASS 534 / FAIL 0 | 49 | EXIT=0 |
| `apps/server` (Postgres 16.15 on 54329) | PASS 1563 / FAIL 0 / **SKIP 5** | 153 | EXIT=0 |

**The skip count is at the 5-skip baseline**, quoted rather than assumed. The forced gate itself
(`pnpm turbo run build test typecheck`) was **NOT** run here — it is the controller's, run at the frozen
head; these are the packages' own suites, which is the evidence this task owes.

**One instrument defect, recorded rather than buried.** The first attempt passed `--concurrency=1`, which
is **not a vitest 3.2.7 option**: every package exited 1 with `CACError: Unknown option '--concurrency'`.
Seven red packages that were one flag. The runner does not allow that flag, so the load limit used is
`--maxWorkers=2`. A red that is an instrument error is indistinguishable in a log from a red that is a
defect, and only reading the log body told them apart.

### Catalogue checks, and TWO expectations in the plan text that are stale

| check | exit | measured |
|---|---|---|
| `check:env` | 0 | — |
| `check:tasks` | 0 | — |
| `check:db-tz` | 0 | `database timezone: Asia/Kolkata` |
| `check:runbook` | 0 | 27 references, 20 distinct, all resolve |
| `check:citations` | 0 | ratchet holds exactly on every file |
| `check:help` | 0 | 2 documents, 29 sections, 224 entries |
| `check:migrations` | 0 | 27 migrations, 0 new against `origin/main`, highest `1789500000000` |
| `node scripts/check-case-ids.mjs` | **0** | **2370 unique ids, ZERO duplicates**, highest `15.34` |
| `node scripts/check-case-citations.mjs` | **0** | file 13: **680 cited / 0 uncited / 680 total** |

**The plan's Task 12 text predicted the opposite on both catalogue checks, and both predictions are
stale.** It says `check-case-ids.mjs` may report "only `13.387`/`13.413`" and that file 13's uncited set
must be "exactly `13.401`/`13.476`/`13.477`". Measured at this head: **no duplicate case id exists in the
repo at all**, and **no case in file 13 is uncited**. Those two baselines were real; they were closed by
work that landed after the plan was written, and the checks are now strictly GREEN rather than
green-by-exemption. **Because a green that replaced an allowance is exactly the shape that reads as a
weakened check, the duplicate case was proved to still fire:** a `13.387` marker appended to file 13
(backup taken, sha256 `dbce682e…`) made `check-case-ids.mjs` **exit 1** and name the offender at its new
line; the file was restored and its sha256 matched the backup exactly, and the clean run exited 0 again.
The two markers the plan names are themselves each still singular — `13.387` and `13.413` each appear
**once** as a case marker.

### The citation sweep (Ruling 30's method — open the file, never add an offset)

**Scope, measured rather than taken from the plan's own table:**
`git diff --numstat 2f28acd5..HEAD -- '*.ts' '*.tsx' '*.css' '*.sql'` → **128 source files** moved since
the plan's first task landed (`2f28acd5` is the parent of #441's merge, which is the commit immediately
before Task 1 reached `main`). Restricting to files the plan's OWN eleven merges grew gives **77 source
files**, which is the universe used: sweeping the wider delta would attribute other plans' citations to
this one.

**Instrument, and why it is not a grep.** Every citation the wave ADDED was extracted from the added
lines of its eleven merges (**1713 normative added lines**, **97 qualified + 52 bare = 149 citations**,
both citation FORMS handled — a bare `:NNN` continuing a named file is the form no tool catches). For
each, the commit that introduced it was located, and the cited line's **content** was compared between
that commit and `HEAD`. **Every single re-point was found this way, never by applying an offset.**

**Result: 58 distinct re-points, 60 citation numbers changed, across 41 lines in this file and 2 in
`Features.md`.**
The rule applied throughout: *name the line that now carries the content the citation named when it was
written.* Representative re-points, each verified by reading the new line:

| citation | was (correct when written) | now |
|---|---|---|
| `packages/domain/src/ticket-state.ts:299` | `case 'ticket.ranked': {` | **`:345`** |
| `packages/domain/test/ticket-state.test.ts:632` | `describe('13.696 …` | **`:644`** |
| `apps/server/src/projections/tickets.ts:128` | `export function rowToTicketState(…)` | **`:135`** |
| `apps/server/src/projections/tickets.ts:229` | `rank = EXCLUDED.rank` | **`:245`** |
| `packages/rule-engine/src/evaluate.ts:48` | `case 'ticket.ranked':` | **`:49`** |
| `packages/app-core/src/views/backlog-rank.ts:73` | `export function sortByRank` | **`:82`** |
| `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:643` | `const backlogRows = useMemo(` | **`:850`** |
| `packages/ui/test/components.test.tsx:143` | `describe('13.706 …` | **`:180`** |

**This is the whole reason Ruling 30 forbids offsets:** on that one page the shifts run +207, +109, +107,
and on `tickets.ts` +5, +16, +17 for three lines in the same block. No single delta would have been right
for even one file.

**Verification, and its control.** The instrument was re-run against the working tree: **0 citations in a
wave-added line still name a moved line.** The control is the same instrument on the same code against the
UN-fixed tree, where it reported **66 candidates** — so a 0 is a reading, not a dead probe. Separately, 0
path-qualified citations still carry an old number.

**Already-stale citations, left as written and named here rather than silently repaired.** A handful of the
wave's citations were imprecise *at birth* — the line they named did not carry the fact even then (the
`13.703` mapper set `mappers.ts:1277`/`:1339`/`:1518` and `mappers.test.ts:1398` are the clearest: those
three name the mapper FILE's neighbourhoods, not the `rank: mapRank(…)` sites, which were `:1370`/`:1549`
at birth and are `:1388`/`:1567` now). Ruling 30's method corrects DRIFT, not a claim that never matched;
re-pointing those to the fact-bearing lines would be guessing at an intent rather than restoring one, so
they were left and are listed here. **The frozen historical narrative in `docs/lanes/*.md` is likewise
untouched**, per this catalogue's own precedent — those files are a running handoff log, not a spec.

### Per-task mutation summary

One line per task, quoting each task's own recorded evidence in this file rather than re-running ~50
mutations — the same convention the core plan's Task 12 used.

- **Task 1** — **8 mutations**, each reddening its own site, all restored by sha256 (baseline 45 tests
  green; +1 for the assertion M7 is caught by). The mutation the independent reviewer found that **passed
  the entire file** — stop descending once `lo` is exhausted, returning `'0010'` for `('001','0011')` — is
  now killed by the assertion added in response.
- **Task 2** — the engine mirror's mutation (E) reddens exactly the two cases it should, and the identical
  mutation in the client's copy (F) kills its own case; **dropping the agreement clause reddened `13.604`'s
  rank row while BOTH `13.701` cases stayed green**, which is what shows the agreement case is the one
  carrying that property.
- **Task 3** — dropping `rank` from the INSERT's column list and dropping `rank = EXCLUDED.rank` from the
  ON CONFLICT SET list **redden identically** (`expected null to be 'i'`), because `ticket.created` already
  inserted the row so even the first ranking travels the UPDATE path. Emission-shape mutation → **13 rig
  cases across all four `test/dual-client/` files plus `13.702`'s presence pin**. `isRankKey(raw)` →
  `typeof raw === 'string'` → **`13.703` alone**.
- **Task 4** — the `Table` row hook: presence kills the "replaced, not appended" mutant (M6); the ORDER
  assertion is what makes "appended" failable rather than a synonym for "present".
- **Task 5** — **two mutations, each verified to have CHANGED the file before its result was read**:
  `neighboursFor` returning the swapped pair → 6 of 19 cases red; `submitRank` ingesting `before ?? 'i'`
  instead of the computed key → 3 of 10 red.
- **Task 6** — the CASE-vs-`COALESCE` mutation, and **an earlier version of it was DISCARDED because it
  reddened for a reason unrelated to the property it named**.
- **Task 7** — `reopenedAt: null` dropped from the `ticket.transitioned` case → **`13.722`'s clear case
  reddens and nothing else in the file**. Two mutations **survived** the reviewer's round and are recorded
  as survivors rather than quietly closed.
- **Task 8** — the sweep's reviewer returned **NOT CLEAN** with two surviving mutations, and
  `AND t.reopened_at IS NULL` is the clause that makes Task 7's column load-bearing.
- **Task 9** — **6 mutations in round 1 and 4 more in round 2**, each applied by an exact
  single-occurrence replacement (**a replacement count other than 1 is reported as a HARNESS FAILURE
  rather than a survivor**), each restored from a byte copy.
- **Task 10** — mutations against `board-close.test.tsx`, each restored from a byte copy verified by
  sha256 (**not `git checkout`**), each guarded by a replacement count of exactly 1.
- **Task 11** — the plan's own `closed === null` term dropped from the gate → **`13.648`'s gate `it`**;
  each restored from a byte copy verified by sha256, not `git checkout`, which errors on an untracked path.

### Letter-suffixed ids (the citation script cannot see them)

Hand-checked by `grep -rln` under `packages/*/test` and `apps/*/test`. **File 13 holds 22
letter-suffixed ids; 20 appear under a test path.** The two that do not are both explained and neither is
a gap: **`13.621a` was deliberately NEVER MINTED** — the dispatch recorded the plan's own ids as taken and
this file says so at its id note — and **`13.40a` is not a case at all** but an example in the prose
describing what the id script's regex would and would not match. **This plan added no suffixed id.**

### Follow-ons named during execution

Cross-referenced from the spec's `## Follow-ons named during execution — second wave` rather than
duplicated:

- **Per-project `autoCloseAfterDays` override** — spec §9's own first entry; the setting is
  workspace-scoped and a project-level override needs a project settings surface that does not exist.
- **Ranking under grouping/nesting is DISPLAY-ONLY** — plan ruling R2; the rank order is flat.
- **The Board's `Close all (N)` and the List's `Close selected (N)` share one dialog, one batch and one
  path, but carry NO keyboard shortcut.**
- **`ListRow.closed.actorName` is still the core plan's follow-on**, and this wave makes it also name
  `Auto-close` — but only through `provenance.ts`'s `actorLabel`. The system actor has no `users` row and
  no membership, so any reader joining the roster for a name renders it blank.
- **`isTypes` (reorder, per-type counts) and `isWorkflows` (a badge, a second action) are HELD, not
  outstanding** — `docs/lanes/owner-holds.md` §1. A hold is a decision, not a debt.
  **⚠ SUPERSEDED 2026-09-19 — the owner answered all four items, and none is a hold any more.** The
  reorder is **BUILT** (cases `13.928`–`13.934`); the per-type count is **BUILT** too (cases
  `13.948`–`13.955`); the `isWorkflows` **badge was DROPPED**; and its **second action was
  LIFTED** together with the version-history screen (Task 3). The sentence above is kept as the position on
  2026-09-18.

## settings → workflows: the ticket-type editor's five NOT-ported items, each given a rule (executor 1, 2026-09-18) — cases `13.924`–`13.927`

Task 5b. The five items the section above left open, and **the point of this section is that three of the
five are RULES rather than builds.** A partial port that reads as a finished one is the failure this
catalogue exists to stop; so is a *rule* that reads as unfinished work, which is why the table above names
each item's outcome rather than only its status. The prototype block is
`design-system/interactive/desktop.dc.html@6d7b67c0a52c:871-957`.

- ✅ **13.924 — the type's name, Cancel and Save are ONE ROW, and the Save moved rather than multiplied**
  (`packages/app-core/test/ticket-types/ticket-types.test.tsx:952` and `:956`, rendered at
  `packages/app-core/src/workflow-builder/ticket-types/ticket-type-editor-screen.tsx:124`).

  The prototype puts all three on one line at 22px (`:874-880`); the product had the name and Cancel in a
  row at `2.125rem` and the Save at the form's foot. The assertion is on the ROW
  (`[data-testid="type-editor-header"]`), not on three elements existing — the defect it replaces is
  precisely that all three existed and one was elsewhere — and `toHaveLength(1)` is the other half: a port
  that ADDS a header Save without removing the foot one would satisfy a naive presence check and leave two
  controls for one action.

  The second case is the half a placement test cannot see: the header Save is the FORM's control, so it is
  still `disabled` exactly when `ticketTypeDefSchema` refuses the def, and still absent for a non-author
  (`packages/app-core/test/workflow-builder/access.test.tsx:631`, unchanged and still green). A header Save
  that was always enabled would report a definition the server will reject.

  **THREE MORE ASSERTIONS WERE ADDED BY THE TASK'S OWN REVIEW ROUND, and the first of them is the reason
  the round was worth running.** A mutation — deleting `display: flex` from `.gn-type-editor-header` —
  left the first case **GREEN**, because *"all three are inside `[data-testid="type-editor-header"]`"* is
  satisfied by a block-layout STACK. **The claim "they are ONE ROW" was passing for a reason unrelated to
  row-ness**, which is this repo's signature defect class; row-ness is a layout property and lives in a
  stylesheet the DOM assertion never reads. The repair reads `apps/web/app/globals.css` across the same
  package boundary `builder-css-binding.test.tsx` already crosses, and pins `display: flex`,
  `justify-content: space-between` and the row title's own `1.375rem` (`:988`). **Re-run after the fix: the
  same mutation reddens exactly that case and nothing else** (`1 failed | 39 passed`).

  The other two pin claims that were true only by construction: the heading tracks the LIVE name — frozen
  at the fetched one, the mutation reddens exactly that case (`:1009`) — and the header renders in the
  LOADING arm, which nothing had exercised at all (deleting `{header}` from the early return reddens
  exactly that case at `:1029`).

- ✅ **13.925 — the divergence notice is the prototype's `--tintWarning` card in the RIGHT column, above
  Implications, with its 3px marker gone** (`packages/app-core/test/ticket-types/ticket-types.test.tsx:1056`
  and `:1004`, rendered at
  `packages/app-core/src/workflow-builder/ticket-types/ticket-type-editor-screen.tsx:463`).

  Asserted as DOCUMENT ORDER inside the aside, not as a distance: *above Implications* is a fact about the
  tree, and a DOM-order assertion survives every styling change. The second case reads the rule out of
  `packages/ui/src/ui.css` and pins three things at once — the fill is `var(--gn-tint-warning)`, the rule no
  longer names `--gn-surface-raised`, and no `border-left` declaration remains — with the rule's
  `border-radius` as the control that the block was FOUND rather than the regex silently matching nothing.

  **The composite was re-measured on BOTH candidate grounds before the move**, because
  `--gn-tint-warning` is an ALPHA role whose documented correctness is a condition on its ground: over
  `surface`, `text` 10.51–11.94 and `textMuted` 8.23–12.08; over `surfaceRaised` — the ground the card it
  left sat on — 9.79–11.91 and 8.45–10.74. **Both clear the 4.5 floor, so the placement does not depend on
  the measurement**, and no new assertion was added for it: the ground is `surface`, which
  `packages/ui/test/tokens.test.ts`'s `tintWarning` block already asserts both roles against in all six
  style×theme combinations. A third block measuring the same two pairs over the same ground would be a
  check that cannot fail for a reason of its own — the shape case 11.213 was retracted for.

  **The marker is not a contrast change.** No ledger row covers this element: `hig-per-screen/7a`/`8a` rule
  on `.gn-attention` and `.gn-state-node`, and both were re-measured for this change rather than assumed.
  The treatment matches `.gn-invitations` and `.gn-attention`, which each took the wash and dropped their
  inline-start rule.

- ✅ **13.926 — a completed move is TERMINAL: the prototype's `Choose again` control is deliberately not
  built** (`packages/app-core/test/ticket-types/ticket-types.test.tsx:1102`).

  The prototype's `strandedDone` card offers a control that re-opens a finished move (`:930`). **No reopen
  door exists on `WorkflowAuthoringGateway`, and a button with no door behind it is the defect this repo
  keeps re-finding**, so the migrated branch states what moved and offers no way back it cannot honour. The
  case pins the absence AND that the notice is retired rather than re-armed — no `Choose again`, no
  `reopen`, and no second move offered on the same screen. **Owner: whoever first adds a reopen route.**

- ✅ **13.927 — the field-kind labels are the prototype's while the VALUE picked is still the wire
  vocabulary** (`packages/app-core/test/ticket-types/ticket-types.test.tsx:1131`, labels at
  `packages/app-core/src/workflow-builder/ticket-types/fields-editor.tsx:121-124`, `FIELD_TYPE_LABELS` at
  `:33`).

  The prototype offers `Text / Date / Number / Attachment` as capitalised pills (`:919`) and the product
  rendered the wire values as raw lowercase labels — the audit recorded *"vocabulary AND casing differ"*,
  and they are not the same question. **The CASING is fixed; the VOCABULARY is not.** The label map is
  `Record<kind, string>` over `CUSTOM_FIELD_KINDS`, so it is TOTAL by construction: a sixth kind added to
  `packages/domain/src/ticket-types.ts:4` fails `turbo run typecheck` here rather than rendering `undefined`
  in the picker.

  **Both halves are asserted in ONE test on purpose.** The listbox's option texts are the prototype's
  capitalised five, AND picking `Number` still yields `type: 'number'` on the saved definition. A rename
  would pass the first assertion and fail the second, which is exactly why they are not two cases.
  **Adding `Attachment` is NOT here** — it is a data-model decision (does a custom field hold a file?) with
  the owner.

**THE CITATIONS THIS CHANGE MOVED WERE PAID, NOT IGNORED.** A mid-file hunk in a file cited by line from
across the repo is a hazard this repo has recorded repeatedly, and the sweep before repair found **147
drifted citations across 28 files** — including other lanes' handoffs, the plans, `Features.md` and the
delta audit. **102 of them were pure shift and were designed away:** the `ui.css`, `globals.css` and
`tokens.ts` edits were rewritten LINE-COUNT-NEUTRAL (nine lines replacing nine, one replacing one) with the
prose appended at EOF, so that comparing each committed file to its parent line by line shows differences
at ONLY `ui.css:1978-1981`, `globals.css:153` and `tokens.ts:344-349`. The remaining 27, in the three
restructured components, were repaired against an explicit shift map, one file at a time, each repaired
citation asserted byte-identical to the line it replaced. Four had no successor line because the code
genuinely moved and are given their new homes by content rather than silently renumbered.

**And the sweep surfaced a defect that was not this change's:** four citations
(`fields-editor.tsx:151`, formerly `:99` and before that `:64`) mean the danger-variant Button precedent but
pointed at a BLANK COMMENT LINE — collateral from the `required` docblock landing after the delta audit was
written. A content-preserving repair would have laundered them into looking maintained, so they were
corrected to the real target and the pre-existing staleness is recorded rather than absorbed.
## settings → workflows Task 9: the settings shell's two token nits, and the one prototype value that is NOT a port (executor 2, 2026-09-18) — cases `13.907`–`13.909`
## settings → workflows Task 9: the settings shell's two token nits, and the one prototype value that is NOT a port (executor 2, 2026-09-18) — cases `13.907`–`13.910`

The `isSettingsShell` block is `design-system/interactive/desktop.dc.html:800-1011`, read from `main`; its
`<nav>` is `:808`, its nav item is `:3145`. The audit's row is
`docs/design/prototype-delta-2026-09-18.md:637-647`. **The block's third nit — the subtitle at `17px/22px`
against the frozen `0.8rem` at `globals.css:333` — is RULED to stay** (owner, 2026-09-18): a deliberate
freeze outranks a prototype delta, and this task does not touch it.

- ✅ **13.907 — the settings sidebar is the prototype's 248px, not the 192px it shipped.**
  `:808` draws `width:248px;flex:none`; the rule read `flex: 0 0 12rem` (192px), 56px short
  (`apps/web/app/globals.css:1227`). The case asserts the **resolved pixel value**, 248, not the string
  `15.5rem` — so a later edit to `14rem` reads as the 224px drift from the prototype it is rather than as
  a spelling that merely looks different. A count is evidence only once its unit is pinned, and `rem` at
  the root's own 16px is that unit here.

  **Mutation witness, and it plants through the same extraction the case reads**: a basis of `9rem` reads
  back as 144 and `12rem` as 192 — the value this task removes called out by name. A witness that appended
  a competing rule to the end of the file instead would have left `ruleFor` — which returns the FIRST
  match — reading the real rule, and the control would have traversed a different path from the
  measurement. It is the bug this repo has paid for before, caught here before the first run.

- ✅ **13.908 — the current sidebar item is the prototype's SOLID accent, not the top nav's tint**
  (`apps/web/app/globals.css:1242-1245`). `:3145` appends `background:var(--accent);color:var(--onColor)`
  to the item's base style. This file had used `.gn-nav`'s pair — `--gn-fill-tertiary` /
  `--gn-text-accent` — and its own docblock justified that as "reusing `.gn-nav`'s own pattern rather than
  inventing a second one".

  **The product was self-consistent and the prototype is not.** The prototype draws its TOP nav's current
  item as a *tint* (`:2599`, `background:var(--tintAccent)`) and its settings sidebar's current item as a
  *solid fill*, and it even declares a named pair for the second that nothing in that file ever applies
  (`--sideOnBg:var(--accent); --sideOnColor:var(--onColor)`, `:31`). Collapsing both onto the tint was
  ours; the docblock was describing a divergence, not a decision. `--gn-accent`/`--gn-accent-text` is a
  pair `CONTRAST_PAIRS` already holds to 4.5 (`packages/ui/src/tokens.ts:1224`), so no new guarantee is
  needed — and `.gn-help__nav-link[aria-current='location']` (`packages/ui/src/ui.css:3633`) already
  ships exactly this pair on an active nav item, so the treatment is not new to the product either.

  **Three claims, each with its own plant, because they are separable and only one of them is the
  port.** (a) the background is `var(--gn-accent)`; (b) the foreground is `var(--gn-accent-text)` — and the
  near-miss assertion names `--gn-text-accent`, which is a different role that differs from
  `--gn-accent-text` by the order of its two words; (c) the rule adds **no declaration** `:3145`'s active
  delta does not carry. The `font-weight: 700` that used to sit here is what (c) is for: the prototype's
  active state is its base style plus exactly two declarations, and the emphasis was ours — `.gn-nav`'s,
  in fact, imported along with its tint. A plant of the tint pair reddens all three; a plant of
  `font-weight` **alone** reddens (c) and leaves (a) and (b) green.

- ✅ **13.909 — the item's radius stays `--gn-radius-control`, and that is a measured deviation**
  (`apps/web/app/globals.css:1235`). `:3145` hard-codes `border-radius:10px`. **It is the one NAV ITEM in
  that file that does**: the top nav composes `NAV_BASE`, whose own radius is `var(--ctlR)`
  (`design-system/interactive/desktop.dc.html:2011`, used at `:2598`), so `:3145` departs from the
  prototype's own control-radius token where its sibling does not.

  **That sentence was WRONG in the first version of this entry, and the correction is the point of
  recording it.** It read *"it is the only control in that file that does"* — and a plain count returns
  **nine** `border-radius:10px` occurrences, among them an `<input type="search">` at `:1676` and three
  `<a>` doors at `:1855-1857`. Found by the task's independent review, not by its author, which is the
  pattern this repo keeps recording. The *decision* survives the correction unchanged; only the stated
  reason was false, and a false reason in a load-bearing sentence is the kind of thing a later reader
  builds on.

  The reason the decision survives: the prototype's neo block sets `--ctlR:14px` (`:59`), and `tokens.ts`'s
  `radii` table carries `hig`/`minimal` `8px` and `neo` `14px` (`packages/ui/src/tokens.ts:935-938`) — the
  product's token IS the prototype's `--ctlR`, exactly, in both styles. A literal port would therefore
  leave this one item at 10px while every other control under `neo` is 14px. **The token expresses the
  style axis the prototype's literal cannot**, and the rule is where that is declared rather than left to
  look like an oversight. This case pins an existing state rather than changing one, which is why it was
  green before the fix.

  **Its second claim is the substantive one, and its two plants are aimed to prove they are separable:**
  "a token is used" and "no literal competes" are different properties, and only the second is the port's
  real content. Planting `border-radius:10px` reddens the literal claim while the token claim is
  trivially false too; planting `var(--gn-radius-card)` — a **wrong token of the right shape** — reddens
  the token claim alone and is **invisible** to the literal claim. A single claim would have missed one of
  the two.

- ✅ **13.910 — exactly ONE rule carries the current item, across both stylesheets.** 13.907–13.909 read
  `apps/web/app/globals.css` alone, and that was **the gap the task's independent review found in their
  first version**: a competing rule — equal specificity and later in source order, or higher specificity
  anywhere — defeats the change invisibly. The review measured it, appending two such rules to a copy and
  getting ten passes with the active item dead in a browser. 13.908's NAME is a claim about what gets
  painted, so the instrument has to be able to see what else paints it. The check is the shape
  `members-styling.test.ts`'s 13.887 established for the same reason, reading
  `packages/ui/src/ui.css` alongside `globals.css` — `apps/web/app/layout.tsx:3-4` loads the former
  first, so a tie also goes `globals.css`'s way.

  **The claim is about the PATTERN, not the one literal selector**, because the competing rules that
  matter are not the same string: `[data-style='neo'] .gn-settings__sidebar a[aria-current='page']` and
  `.gn-settings a[aria-current='page']` both qualify and neither is the rule under test. The parser
  splits on `}` and takes each chunk's text before its `{`, which reads a selector written across lines
  correctly; comments are stripped by CONTEXT first, because this file's prose names its own selectors.

  **Proved end-to-end, not only in-process.** The review's own plant was appended to the real
  `globals.css` — `MUTATED_EXIT=1`, reddening 13.910's first and third `it`s **by name** — and the file
  was then restored from a byte copy and verified `sha256 517404944da99f83…`, not by `git checkout`. The
  case also carries its own in-process plants at equal and at higher specificity, plus a positive control
  (a rule that does not name both tokens is not counted) so the count is not simply "number of rules".

  The review also measured the change EFFECTIVE, which is the other half and is why the guard now exists
  rather than the CSS having changed: the built chunk carries exactly three `aria-current` selectors in
  source order — this one and two `.gn-nav` ones that require a `.gn-nav` ancestor the sidebar does not
  have.

**One consequence the review measured and this entry records rather than leaves implicit: the
sidebar/content WRAP THRESHOLD moves.** `.gn-settings` is `flex-wrap: wrap`, the sidebar is
`flex: 0 0 15.5rem` and therefore cannot shrink, and `.gn-settings__content` is `flex: 1 1 20rem`. The
sidebar grew by exactly 56px, so the viewport at which the pair stops sharing a line moves right by
exactly that 56px, and a window in that band now stacks — the content takes the full width instead of
sitting beside the sidebar. Not a break at any width (the review swept 320–640px and found no overflow at
either value, and at the `stack-phone-390` baseline the content pane is 366px before and after, because
248 + 320 already exceeded the shell's inner width at `12rem` too). But a reader comparing screenshots
just under that boundary should expect a difference, and `globals.css:1227` now carries the note inline
so it is visible from the declaration that causes it.

## The workflow builder's canvas drew into nothing — `min-height` is not a definite height (2026-09-19)

**Owner-prioritised out of order.** ONE case, `13.911`, minted at the tip of `exec2/builder-canvas-collapse`
over `origin/main` `ed4c992f` — and **rebased onto `98ffab2a` when the catalogue split landed**, which is
why this section lives in a part-file rather than at the foot of the index — **by case MARKER only**:
`13.890`–`13.910` are spent and `13.920`–`13.927`
belong to another lane, so this case takes the first free id of the dispatched block and **the next free
in that block is `13.912`**.

- ✅ **13.911 — the builder's canvas is a box the viewer can see, and a node is drawn inside it.**
  `apps/web/e2e-stack/builder-canvas.spec.ts`, instrument in `apps/web/e2e-stack/helpers/canvas-box.ts`.

  **The defect, measured on the running app.** The builder rendered its whole chrome — breadcrumb, title,
  Add state, Publish, the system-rules rail, the inspector — and an **empty canvas card**. Four
  `.react-flow__node` elements were in the DOM the entire time; they were laid out inside a container that
  computed to **zero height**, so the graph was invisible while every DOM-presence assertion in the repo
  passed. **A count of elements present is not a claim about their geometry.**

  **Why, and it is a general CSS trap rather than a typo.** `.gn-workflow-canvas` was
  `height: 100%; min-height: 480px`, and React Flow's own stylesheet gives `.react-flow` `height: 100%`.
  **A percentage height cannot resolve against a parent whose height comes only from `min-height`** —
  `min-height` does not make a height *definite*, so the child's `100%` computed to `auto` → 0. The rule
  was present, the class was present, and the canvas was still invisible. That is the whole reason this
  case asserts a **measured** height and not the presence of a rule.

  **The fix is one declaration: `display: grid`** on `.gn-workflow-canvas` (`packages/ui/src/ui.css`). A
  grid track gives the child a definite height to fill. `min-height: 480px` is **untouched** — it is
  load-bearing for the narrow-screen layout and the grid track resolves against it; the pair is the fix
  and either half alone restores the bug. The rule now carries that reasoning inline.

  **What discriminates, and what does not — measured in a real browser, same page, same session, both
  states:**

  | property | broken | fixed |
  |---|---|---|
  | `.react-flow` rect height | **0** | **480** |
  | `.gn-workflow-canvas` rect height | 480 | 480 |
  | FIRST node's height / width, and the node count | 75.27 / 91.98 / 4 | 75.27 / 91.98 / 4 |
  | first node ∩ `.react-flow` box (area) | **0px²** | **6923px²** |

  The third row is the **first** node's box rather than a property of every node — they are not all the
  same height — and what it carries is that every one of them is non-zero on the broken tree, confirmed
  node by node by the independent review's own probe.

  **The middle rows are why the case does not assert on the container's own height, on a node's height, or
  on the node COUNT** — all three are already satisfied on the broken tree, and the dispatch's own
  suggested "a node's rendered height is non-zero" is measurably one of them. The two bold rows separate
  the states; the second is the property the person needs, *a node drawn inside the canvas being looked
  at*, and it is the one a future regression is most likely to fail.

  **Not a unit test, by construction:** jsdom has no layout engine, so `getBoundingClientRect()` returns
  zeros for everything and an assertion on the computed `display` would have passed on the broken tree.
  It lives in `e2e-stack` because that suite already signs in and walks signed-in routes.

  **The control is planted, and it runs the SAME helper as the measurement.** A height assertion that can
  only report a positive number is not a measurement, so `measureCanvas` runs a second time over an
  element reproducing the **pre-fix cascade** in-page — the same two classes, the grid track overridden
  back to `block`, no definite height on its wrapper — and must read **0**. It is planted rather than
  pointed at because the product no longer contains a broken canvas, and a control that depends on the
  defect staying present dies with the fix.

  **Both directions witnessed.** Against the hot stack (which was serving `main`, i.e. the unfixed tree)
  the case **fails**, printing `.react-flow 0px · 4 node(s) · inside 0px²`. Against this branch's tree
  served on `:3021` — a `next dev` from this worktree, after `pnpm turbo run build` — the same
  measurement, through the same helper, reads **`flowHeight 480 · nodeAreaInsideFlow 6923`** while its
  planted control reads **0**. The `:3021` run signs in on `:3001` and navigates across, because the
  server's `trustedOrigins` is the single configured web origin; cookies are host-scoped, so the session
  carries. That is a verification-run arrangement, not part of the case.

  **The sweep for the same shape, reported and not fixed.** `packages/ui/src/ui.css` + `apps/web/app/globals.css`
  were swept for `min-height` rules with percentage-height children, using `.gn-workflow-canvas` as the
  **positive control** (the sweep must find the known instance, and does). Three more `height: 100%` sites
  exist and **none of them is a second invisible canvas**: `.gn-sheet` (`ui.css:292`) resolves against
  `.gn-sheet__scrim`, which is `position: fixed; inset: 0` and therefore definite; `.gn-workspace-card`
  (`globals.css:378`) and `.gn-project-card` (`globals.css:1070`) take their `100%` against `<li>` grid
  items, and **each child has intrinsic content height**, so where the percentage fails to resolve the
  card keeps its content height rather than collapsing — a lost equal-height, not an invisible surface.
  The trap here needs *both* halves: a parent sized only by `min-height` **and** a child with no intrinsic
  height of its own (React Flow's children are absolutely positioned, so it has none). No second instance
  was found. **Owner: whoever next adds a percentage-height child to a `min-height` container.**

## settings → workflows Tasks 6+7: the ticket-type list's ↑/↓ reorder, built through the door that already existed (executor 1, 2026-09-19) — cases `13.928`–`13.934`

Tasks 6+7 of the settings-workflows plan, built after the owner lifted the hold on `isTypes | reorder` on
2026-09-19. **The task was scoped as WIRE work by three planning documents and is a RENDER task** — the
plan's own Task 6 section was corrected to say so on the same day, resting on a measurement this screen had
already recorded (`ticket-type-list-screen.tsx`, the ↑/↓ bullet). **No route, no gateway method and no event
type is added:** the swap goes through `gateway.submit` with `ticket-type.defined`, the same door the
editor's `"Hierarchy rank"` field already uses.

**A swap is TWO events, and that is the load-bearing detail.** `IngestResult` carries one result per
submitted event, so re-ranking only the moved type would leave it **tied** with its neighbour — and the
server's own `ORDER BY rank, type_id` resolves a tie by an id, which is nothing a person can see. Both
types are re-ranked in one `submit`.

**The arrow that would move a built-in is DISABLED, not refused after the fact** — for the same per-event
reason. The four built-ins are rank-locked server-side
(`packages/rule-engine/src/checks/ticket-type.ts:60-62` refunds `type.builtin-rank`), so a swap across one
would **half commit**: the neighbour's re-rank lands, the built-in's is refused, and the pair ends up tied.
The control anticipates the refusal rather than discovering it. **A refusal the server returns anyway — for
a reason this screen does not model — is surfaced with the server's own words, never swallowed**, because a
control that silently does nothing is indistinguishable from one that worked.

- ✅ **13.928 — every row carries an ↑ and a ↓ control, and each is a SIBLING of the row door rather than
  inside it.** The whole row is one `<button aria-label="Edit …">` (the row-as-door ruling), so a control
  nested inside it would be a button inside a button — an invalid tree jsdom renders without complaint,
  which is why this asserts DOM containment (`not.toContainElement`) rather than that a control exists.
  (`packages/app-core/test/ticket-types/ticket-types.test.tsx`)
- ✅ **13.929 — the ends are disabled, asserted on the RENDERED control, and the same test names a control
  that is NOT disabled.** The first row's ↑ and the last row's ↓ are `toBeDisabled()`; the movable control
  (`Invoice`, between a built-in and a custom type) is `toBeEnabled()`. The second half is not decoration —
  a screen that disabled every control would satisfy the first half perfectly, which is this repo's
  "check that cannot fail" shape. (`packages/app-core/test/ticket-types/ticket-types.test.tsx`)
- ✅ **13.930 — a swap submits two `ticket-type.defined` events through the EXISTING door, exchanging the
  two ranks.** Asserted on the submitted payloads' `rank` values — a computed value, not the presence of a
  call — plus the two `id`s and `fields` carried through untouched, because this is a re-rank and not a
  redefinition. (`packages/app-core/test/ticket-types/ticket-types.test.tsx`)
- ✅ **13.931 — the arrow that would move a built-in is disabled, read from BOTH sides.** `Invoice`'s ↑
  (pointing at the built-in above it) and the last built-in's ↓ (pointing at the custom type below it, but
  itself a built-in) are both disabled. (`packages/app-core/test/ticket-types/ticket-types.test.tsx`)
- ✅ **13.932 — a server refusal is displayed with its reason rather than silently doing nothing.** Seeded
  as two refused `IngestResult`s; the server's own sentence reaches the reader through a `role="alert"`,
  and the list does not re-order for a swap whose ranks did not change.
  (`packages/app-core/test/ticket-types/ticket-types.test.tsx`)
- ✅ **13.933 — a committed swap re-orders the RENDERED rows.** Asserted on the DOM order a person sees,
  not on state or on the submitted payload. The fake gateway serves its seed unchanged, so a screen that
  re-read instead of applying what it committed would show the old order here.
  (`packages/app-core/test/ticket-types/ticket-types.test.tsx`)
- ✅ **13.934 — a viewer gets no reorder controls, matching the `"New type"` gate.** The reorder is a WRITE
  and every other write affordance on this screen is author-gated, so the two must agree. The test carries
  its own control: the same query on an author finds the button, so the nulls are the gate and not a
  misspelt name. (`packages/app-core/test/ticket-types/ticket-types.test.tsx`)

- ✅ **13.935 — every arrow is disabled while a swap is in flight, and a second click submits nothing.**
  **This case exists because review found a REAL defect, and it is the most valuable one in the block.**
  `moveType` read a render-scope snapshot and applied its result to that snapshot, so a second click
  landing inside the first `submit`'s round-trip computed from the **pre-swap** array and overwrote it.
  Probed through this harness, two clicks in one tick folded to two types **sharing a rank** — the exact
  tie the two-event swap exists to prevent — while the screen rendered `rank 5` for a type it had
  submitted as 6; against the real door the window is a whole round-trip. The fix is a one-swap-at-a-time
  guard plus a **functional** `setTypes(previous => …)` matched by id, so the update is computed against
  the state as it is NOW and never against the snapshot the click was born in.
  **The case's own first draft was a check that could not fail** — it waited on `Move Invoice up`, which
  is disabled in *every* state because a built-in sits above it, so `waitFor` returned instantly and
  asserted nothing. It now waits on `Move Invoice down`, which is enabled before the click and disabled
  only while a swap is in flight. (`packages/app-core/test/ticket-types/ticket-types.test.tsx`)

### Task 8 — the ticket-type list's `"N tickets"` count (2026-09-19)

**The read is a QUERY and not a projection.** `proj_tickets` already carries `workspace_id` and `type_id`,
and `proj_ticket_types` is keyed `(workspace_id, type_id)`, so a workspace-wide count needs nothing
derived. **The route was NOT a widening of the pinned one:** `GET …/ticket-types/:typeId/population`
answers 400 without a `workflowId` on purpose, and letting an absent one mean "the whole workspace" would
be one door answering two questions — the "second door" defect read backwards.

- ✅ **13.948 — the read answers each type's OWN count across the workspace, and the fixture makes the two
  questions disagree.** Three separate pairs, because three different wrong implementations each pass
  most of it:
  **(1) the wide/pinned pair** — `chore` is bound to `wf-second` and its ticket sits there, so the type's
  own count is 1 while the pinned read for `wf-errands` is **0**, with the pinned read's own 1 for
  `wf-second` as the control that the first 0 is the workflow predicate speaking.
  **(2) the cross-tenancy pair** — the neighbour workspace defines its OWN `task` and gives it a ticket,
  so a read matching on `type_id` alone would count another tenant's work in this number; this workspace's
  `task` reads **5 and not 6**, and 13.951 reads the neighbour's own 1.
  **(3) the divergence** — `stray` is defined, given a ticket on `wf-errands`, then **re-pointed** at
  `wf-second`, so its binding and its tickets disagree: wide = **1**, the type's bound workflow = **0**,
  and where the ticket actually sits = **1**. This is the state the screen's docblock names as the moment
  the bound-workflow number stops being the type's count.
  (`apps/server/test/routes/builder-reads.test.ts`)
- ✅ **13.949 — a type the workspace DEFINES but has never given a ticket reads 0, and `count(*)` would say
  1.** The read LEFT JOINs from `proj_ticket_types` so empty types appear (the same contract
  `state-occupancy` keeps for empty states), which makes `count(k.ticket_id)` load-bearing: on a LEFT JOIN
  a ticket-less type has one row — the left row itself — so `count(*)` answers **1** for every empty type.
  **That mutation is invisible without this fixture**, because the shared world has no ticket-less type;
  the case seeds one, and carries the same-read control that a type holding work is not collapsed to the
  same value. A type the workspace has never heard of is **absent** rather than 0.
  (`apps/server/test/routes/builder-reads.test.ts`)
- ✅ **13.950 — admin-only on the pinned read's exact terms.** Owner/admin read it; member, guest,
  outsider and stranger each get the tenancy **404**, byte-identical to one another, so no role can tell
  "not for you" from "nothing here"; an unauthenticated read is refused earlier, on the session gate.
  (`apps/server/test/routes/builder-reads.test.ts`)
- ✅ **13.951 — one workspace's counts never appear in another's.** The neighbour reads its OWN workspace
  and gets its own `nb-task` 1 **and its own `task` 1** — the same type KEY this workspace uses — while
  this workspace's answer holds neither of the neighbour's. Neither direction resolves across the tenancy,
  and both 404; the entitled caller's 200 in their own workspace is the control.
  (`apps/server/test/routes/builder-reads.test.ts`)
- ✅ **13.952 — the segment renders the type's own count, not the pinned one, and renders it LAST.** The
  seed makes the two reads **disagree on purpose** — `invoice-type` is pinned 7 tickets while its
  workspace-wide count is 3 — because a screen rendering the pinned number passes any assertion written
  against a seed where they agree. The rendered meta line contains `3 tickets`, contains no `7 tickets`,
  and **ends** with the segment, which is the prototype's own order (`desktop.dc.html:3156`).
  (`packages/app-core/test/ticket-types/ticket-types.test.tsx`)
- ✅ **13.953 — a failed read says `tickets unavailable`, never a `0`, and the list still renders.** The
  load-bearing assertion is the negative one: `0 tickets` is a REAL answer for a type that holds nothing,
  so printing it for a request that never returned would be inventing a number — the same refusal the
  editor screen's `divergenceBody` makes. The case also pins that the failure is not collateral: the list
  renders and the rest of the meta line (`rank 5 · 0 fields`) is untouched, because the counts are read in
  a **separate promise** from the list's own tuple.
  (`packages/app-core/test/ticket-types/ticket-types.test.tsx`)
- ✅ **13.954 — `1 ticket`, `0 tickets` for a type the read omits, and NO segment while the read is in
  flight.** Three edges in one case because each is a different claim: the singular (the prototype writes
  `used + " tickets"` and has no singular, and this screen already handles singular for fields); an omitted
  type reading a real **0** rather than "unknown", since the type is in the list so the screen knows it
  exists; and — the one a later refactor is most likely to delete — the segment being **absent** rather
  than empty while the read is in flight, so no `·` dangles after a number nobody has yet. The in-flight
  arm is driven by a gateway whose count read never settles.
  (`packages/app-core/test/ticket-types/ticket-types.test.tsx`)
- ✅ **13.955 — the adapter asks the COUNTS route, not the pinned one with a query string dropped.** The
  assertion that carries it is the recorded path: `…/ticket-counts-by-type`, with **no workflowId at all**.
  A `getTicketCountsByType` implemented over `…/population` sends either a query string or a 400 and
  matches neither. It also pins that `counts` is passed through **whole** — a seeded `chore: 0` survives —
  so an adapter filtering zeroes cannot hide the ticket-less type the server went out of its way to
  include. The method is additionally in the file's own 404 table, so it is held to "a 404 is a refusal to
  answer, never an empty" alongside the three reads that were there before it.
  (`apps/web/test/data-source-gateway.test.ts`)

**Ids `13.947` and `13.956`–`13.957` are left UNUSED** in this block — the case set above is what the
feature needed, and the rule is that a minted id is never renumbered down.

**Ids `13.936`–`13.937` are left UNUSED** in this block — no case was written for them, and the rule is
that a minted id is never renumbered down.
## `settings → workflows`: the version history — the FIRST screen this repo authors rather than ports (executor 2, 2026-09-19) — cases `13.938`–`13.942`

**Task 3, lifted by the owner on 2026-09-19, and it is ONE task with the screen its action opens.** The
plan's Task 3 was DATA-conditional (*"build it if the version chain is readable from an existing read"*),
and the screen's own docblock had escalated the collision rather than deciding it — building the button
meant designing a view **the prototype does not draw**. The owner's answer resolved both at once.

**Ids recounted at this branch's tip BY MARKER only.** `13.938`–`13.945` are minted here; **the next free
in this block is `13.946`**. `13.920`'s now-superseded arm is corrected in place above rather than
renumbered. **`13.943`–`13.945` were minted by the review rather than by the plan** — each closes a
mutation that SURVIVED the first version of this change set, which is the reason they are listed with the
mutation they kill.

**Files:** `packages/app-core/src/workflow-builder/ui/workflow-history-screen.tsx` ·
`packages/app-core/src/workflow-builder/ui/workflow-list-screen.tsx` ·
`packages/app-core/src/workflow-builder/gateway.ts` · `apps/web/src/authoring/data-source-gateway.ts` ·
`apps/web/app/w/[workspaceId]/settings/workflows/[workflowId]/history/page.tsx` ·
`packages/ui/src/ui.css` · tests in `packages/app-core/test/workflow-builder/history.test.tsx`,
`screens.test.tsx`, and `apps/web/test/data-source-gateway.test.ts`.

- ✅ **13.938 — the second action renders on every card and opens the history for THAT workflow.**
  `packages/app-core/test/workflow-builder/history.test.tsx`. The button's accessible name is
  `View history of <name>` and clicking it calls `onHistory` with that workflow's id — asserted on the
  **RENDERED** control, with a control arm proving the click did not simply fire any handler
  (`onOpen` was not called). **The two doorless candidates are asserted ABSENT rather than assumed:**
  querying by `/Duplicate/` and `/Discard draft/` returns `null`. Neither has a route behind it under any
  reading — no operation duplicates a workflow, and this product has no draft state — so a button for
  either would be the affordance-with-no-door this repo keeps re-finding. The reason is in the screen's
  docblock, where a reader comparing the product to the prototype meets it.

- ✅ **13.939 — the chain renders newest-first, with the current version marked.**
  Same file. The rendered order is asserted by reading `data-version` off the rendered list items
  (`['2','1']`) rather than by trusting the sort the screen performed — a `reverse()` that ran twice
  leaves both cards present and the reading wrong. `Current` appears on the newest card and `Superseded`
  on the older one, **and the newest card is asserted NOT to say `Superseded`**, so the marker is a fact
  about each card rather than a word somewhere on the page. The current version is marked twice, and only
  one of the two is colour (`--gn-accent`'s leading edge plus the word), because the screen's whole
  subject is which version you are looking at.

- ✅ **13.940 — a superseded version renders WITH ITS CONTENT, not as a version number.**
  Same file. This is the acceptance's load-bearing half. The fixture's two versions carry **different
  definitions**: `v1` has a `Review` state and two transitions through it, `v2` dropped `Review` and
  carries a `stateMapping`. The case asserts `Review` renders **inside v1's card** and is **absent from
  v2's** — so a screen that drew one definition under two headings passes every count in `13.939` and
  fails here. **Its control is v2's own content** (`To do`, `Done` render), which keeps the absence from
  being an empty card, and the content is not only state names: `2 transitions` on v1 against
  `1 transition` and `maps 1 state` on v2.

- ✅ **13.941 — a hole in the chain is NAMED rather than shown as a shorter list.** Same file. When the
  read answers `v2` and not `v1`, the screen says *"1 version in this workflow's range did not answer…"*.
  A screen that silently rendered the versions it happened to receive would display a chain shorter than
  the workflow has, with nothing on screen to say which.

- ✅ **13.942 — the version argument reaches the query at the web seam.** `apps/web/test/data-source-gateway.test.ts`.
  Task 3's own measurement named this line as the whole of the gap: the route serves `?version=`, the
  online adapter sends it, and `DataSourceQuery` declared it — while the web adapter called the query
  with **two** arguments, so no screen could read a chain. The case asserts the **argument** the query
  receives (`('ws', 'wf-flow', 2)`), because that is the thing that was absent; an assertion that
  `getWorkflow` merely returns a definition passes on the version-blind wiring, which it did for the
  whole life of the seam. The pre-existing delegation arm is corrected in the same change set — it read
  `toHaveBeenCalledWith('ws','wf-flow')`, **and the two-argument call WAS the dropped version**.

### Three cases the REVIEW added, each killing a mutation that had survived

An independent review mutated this change set and found three survivors. Each is now killed by a case, so
they are recorded with the mutation they close rather than as extra coverage:

- ✅ **13.943 — a workflow that answers nothing says *"No published versions to show."* rather than
  loading forever.** `packages/app-core/test/workflow-builder/history.test.tsx`. **Mutation killed:**
  replacing the missing-workflow branch with a bare `return` left **all four** history cases green, because
  nothing asserted the state a stale `workflowId` in the URL reaches — the shell would claim an answer was
  on its way, permanently. Its control asserts the loading line is GONE, so the sentence is the answered
  state and not a caption beside a spinner that never stops. *(The `load-error` branch — a rejection rather
  than a null — stays uncovered; said here rather than implied.)*
- ✅ **13.944 — the action's DESTINATION.** `apps/web/test/authoring-routes.test.tsx`. **Mutation
  killed:** pointing `onHistory` at the BUILDER's path left **548 `apps/web` tests green**, because
  `13.938` proves the handler is called with the right id and nothing proved the id became the right URL.
  The case renders the shipped list PAGE and asserts `push` received
  `/w/<workspace>/settings/workflows/<id>/history` — with the builder path as its negative, which is
  exactly the mutation.
- ✅ **13.945 — the history ROUTE renders a real chain**, through the page the product ships: wiring,
  gateway and screen. **Mutation killed:** nothing rendered this route at all, so its seven-deep relative
  imports and its `useBuilderWiring` arm were compiler-checked only. Asserts both version markers and
  `Review` — `v1`'s dropped state — arriving through the real page.

**And one arm strengthened rather than added: `13.939` now pins the current-version MARKER's class.**
**Mutation killed:** deleting the `--current` class left every case green, so the accent leading edge could
vanish silently while the word `Current` still printed. The screen's own claim that the marker is *"two
things, and only one of them is colour"* is now half-measured rather than half-asserted; the colour half is
**not** measured by anything (no browser case walks this route), and that is stated rather than implied.

**Why this needed an owner and not a ruling, recorded because it is the first of its kind here.** The
prototype draws **no history view**: its `View history` handler fires a toast (`desktop.dc.html:3187`) and
navigates nowhere, and none of the block's ten `screen:` values is a history screen. There is therefore
nothing to be faithful to, and a port cannot author a view. `WorkflowHistoryScreen`'s docblock states
that in those words, so a reader comparing the two meets the reason rather than a silence.

## The inbox filter tabs — cases `13.969`–`13.975` (2026-09-19)

**Why these are here and not in §11.** Their subject is the inbox, whose home is
`11-calendar-notifications.md`, but the minted block is **§13** — the shared id space is allocated in
blocks and §11's was not this lane's to mint from. They sit in the §13 part-file that already carries
the recent screen-level work (`13.928`–`13.955`) so a reader looking for it finds it in one place.

**The door.** The prototype's header carries a segmented `All / Unread / Mentions`
(`desktop.dc.html@6d7b67c0a52c:616`, data `:2999`). The audit measured that the route took only
`cursor, limit, workspaceId, mutedKinds` — **no `read` and no `kind`** — so the tabs had nothing to
ask. The read is an `ADDITIVE FIELD` on the existing route, and the gateway contract was **WIDENED**
rather than ridden: `list(cursor?, filter?)`.

**Widening it is the deliberate half, and the reason is citable.** Task 14 refused `limit` and
`workspaceId` standing in this same signature, on two grounds — *"every parameter in it is one both
implementations must honour"* (the replica has no page-size knob and no query string) and *"`/inbox`
is a GLOBAL route … there is no workspace in scope to send"*. **Neither ground applies to a read/kind
filter**: a replica holds the rows and narrows them trivially, and read/kind is not workspace-scoped.
The alternative — a second method — is refused by name: two methods over one read are two places for
paging to drift.

- **13.969** ✅ `?unread=true` narrows to unread rows, and the case **pairs it with the unfiltered read
  in the same run** — without that control a route that had simply stopped returning read rows would
  pass. — (`apps/server/test/routes/notifications.test.ts`)
  *Planted defect, run: removing BOTH filter clauses from the store's WHERE reddens **13.969, 13.970
  and 13.973** and leaves 13.971/13.972 green — the two refusals test validation, not narrowing, so
  their greenness is correct rather than a miss. **Zero `500` mentions in the log**, which is the
  requirement: an earlier draft of this mutation pushed the parameter without a placeholder and
  reddened a REFUSAL case with six 500s — a plumbing red proving the query broke, not the property.*
- **13.970** ✅ `?kind=mention` narrows by kind — **the tab says `Mentions`, the read says the domain's
  `'mention'`**, and that mapping lives in exactly one place so a screen word cannot reach a query.
  Paired with the unfiltered control. — (`apps/server/test/routes/notifications.test.ts`)
- **13.971** ✅ An `unread` value the route cannot honour is **refused 400 `invalid_unread`**, not
  ignored — `unread=yes` is a caller who believes they narrowed and did not, and the failure mode is
  concluding the inbox is empty. `?unread=` (empty) is the route's own "absent" spelling, the same
  rule `cursor` uses. — (`apps/server/test/routes/notifications.test.ts`)
- **13.972** ✅ An **unknown kind** is refused 400 `invalid_kind`, with the real kind accepted in the
  same case as the control. `kind=mentons` would otherwise match no row and the page would render
  *"No mentions"* — a false statement about the caller's whole inbox, made on the strength of a typo.
  — (`apps/server/test/routes/notifications.test.ts`)
- **13.973** ✅ The **cursor walks the FILTERED set** — the read row is inserted NEWEST on purpose, so a
  cursor that walked the unfiltered set would hand it back on page two. — (`apps/server/test/routes/notifications.test.ts`)
- **13.974** ✅ The control sends the tab you clicked as a **filter**, and `All` sends **none at all**.
  — (`apps/web/test/inbox-page.test.tsx`)
  *Planted defect, run: dropping the filter at the page's call site reddens **13.974 alone** —
  `expected undefined to deeply equal {}`.*
- **13.975** ✅ A **filtered empty does not claim the whole inbox is empty** — *"Nothing in your inbox"*
  is a claim about the whole set and is false under a filter, so the filtered arms say
  *"Nothing unread"* / *"No mentions"* instead. **The assertion that matters is the ABSENCE of the
  unfiltered sentence**, because asserting only the filtered one would pass against a page rendering
  both. — (`apps/web/test/inbox-page.test.tsx`)

**The fake was extended, and that is load-bearing.** `FakeNotificationsGateway.list` ignored its
second argument — it compiled, because an implementation may take fewer parameters — so every case
driven through it would have passed against a page that sent no filter. It now **applies the filter
BEFORE cutting the page**, mirroring `store.ts`, where the filter joins the WHERE and therefore narrows
what the cursor walks. (`packages/app-core/test/inbox/fake-gateway.ts`)

## The type editor's issues list stops painting danger-toned text on a sunken surface (lane ds1, 2026-09-21, batch B10) — case `13.1061`

**The finding, round 2 `P24`, IMPORTANT, flagged `r2 NEW`.** `ui.css` `.ticket-type-editor__issues` set
`background: var(--gn-surface-sunken)` **and** `color: var(--gn-danger)` at `font-size: 0.8rem` — 12.8px,
far below the large-text exemption, so WCAG 2.2 §1.4.3 requires 4.5. Measured **3.844** (`hig`/`minimal`
light) and **4.191** (dark) — below 4.5 in both — and **the pair is in no `CONTRAST_PAIRS` row**, so
`tokens.test.ts`'s enforcement loop never evaluated it. The finding's own extraction found **46 rules
setting both a token `color` and a token `background`, against 34 declared pairs — 14 of those rules naming
a pair with no row, i.e. 7 distinct pairs.**

### The remedy taken, and the one refuted

**The text moves to `--gn-text` and the danger tone stays on the 3px left border.** `{ fg: 'text', bg:
'surfaceSunken' }` is a pair that is **already declared and already enforced** (`tokens.ts`
`CONTRAST_PAIRS`), measuring 9.97 light / 11.09 dark; the border owes 3:1 as a non-text boundary and
clears it at the same ratios the text failed. **The reviewer's second option is REFUTED with its number:**
it proposed `dangerText` on this surface, but `dangerText` is `onColorWarmLight` (`#fbf7f3`) in light and
`redInk` (`#300a06`) in dark — the ink that goes ON a danger fill, not a danger-tinted ink — so on
`surfaceSunken` it measures **≈1.06:1 light**, the least legible value on the page. Recorded in the rule so
the next reader of the finding does not reach for it.

### The case

- ✅ **13.1061 — a gate-able sweep: every rule painting a token colour on `surfaceSunken` must name an fg
  role the roster declares for it.** `packages/ui/test/tokens.test.ts`. This is the finding's own second
  half, which it called *"the instrument this regime has never had"* — it reads two files, needs no
  browser, and is scoped to `surfaceSunken` **because that is the surface the finding measured; widening it
  to every surface is the right next move and is not claimed here.** **The control runs FIRST and in both
  directions** — a planted `.gn-zz-planted { … color: var(--gn-danger) }` must be FOUND, and the same
  plant with `--gn-text` must not be — because without it a regex that matched nothing would report "no
  violations" over a stylesheet that had lost the family. The RED names the finding's own rule:
  `.ticket-type-editor__issues -> color: var(--gn-danger)`. A third assertion pins that the danger signal
  SURVIVED the fix (the border keeps `--gn-danger`, the text may not go back). **A source scan, and it says
  so:** it proves the roster COVERS the pair, not that the pair passes — the enforcement loop above is what
  measures ratios. `ui.css` was reverted to `HEAD` for the RED run and restored from a sha256-compared
  backup. **The two ratios are computed, not painted.** Package suites: ui 413, web 639, all green.

**No `Features.md` bullet.** This corrects an existing notice's paint; it adds no affordance.
