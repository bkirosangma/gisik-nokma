# §17 — open work

**Opened 2026-09-21 by the controller, exercising the standing grant *"open 17 if 16 runs out"*.** §17
opens with executor 3's sheet-`Visibility` styling task, which is why this lane minted the section's
first block.

## THE ID SHAPE — the owner's ruling, recorded HERE because this file is what a minting session trusts

**§17 is UNIFORMLY 3-DIGIT PADDED: `17.001`–`17.999`, ceiling 999.** Ruled by the owner 2026-09-20
(cycle 29) and recorded in `test-cases/16-remaining-doors.md`'s own `## §17's SHAPE` section, which is
the primary source. **§16's minted ids stay unpadded and are NOT renumbered** — its padded-to-unpadded
boundary is closed, and padding is not retro-fittable across merged ids. **The rule is therefore ONE
width per section, and the widening that matters is the one WITHIN a section:** the trap is `16.100`
sorting below `16.99`, which is a MIXING trap and not a padding trap. **§13 is the proof a uniform width
works** — it ran `13.001`–`13.999` and minted 882 ids with no sort trap.

**Write cases as `- **17.001** ✅ …` id LINES.** The guard counts **id LINES** and nothing else, and four
spellings are invisible to it: a markdown **table row**, a **`##` heading**, a **backticked** id inside
the bold, and — added 2026-09-20 — **two ids in ONE sentence**. A green `ok` is not evidence the guard
saw them, so **after adding cases, confirm the `check-case-ids` count moved by EXACTLY the number you
added** (`node scripts/check-case-ids.mjs`); an unchanged count has reported a clean sweep over cases it
never saw.

## THE BLOCKS — take from yours, never from the tip

| lane | block |
|---|---|
| **exec 3** | **`17.001`–`17.020`** (taken 2026-09-21 for the sheet's `Visibility` section styling) — **minted: `17.001`–`17.006`** |

**⚠ THIS TABLE IS THE ALLOCATION, AND IT EXPIRES.** A block is a longer-lived reading than a "next free
N", but it still expires when the controller reallocates. **Re-read it before minting, and if your own
allocation changes, change it HERE in the same action** — not only in a handoff or a message.
**When your block is empty, STOP AND ASK.** Do not mint from the tip and do not borrow a neighbour's —
that is the rule whose breach made §13 go red twice.

## §16's WINDOW — the grant was exercised, and the measurement behind it is recorded rather than tidied

The controller's 2026-09-21 dispatch opens §17 on the standing order. ⚠ **A future lane measuring §16 for
itself will find ids it may read as "not run out":** cycle 29's own entry
(`docs/lanes/controller-state.md`) measured **23 of §16's 99 ids UNMINTED** (`16.91`–`16.95` and
`16.63`–`16.80`). Both facts are true and they are about different questions — **§16 is fully
ALLOCATED** (every one of `16.1`–`16.99` is assigned to a lane) while **23 are not yet MINTED**. The
standing order's words are *"if 16 runs out"*, and the controller read it as allocation. **Recorded here
so the next reader meets the discrepancy with both numbers rather than concluding the premise was
false.**

---

## The sheet's `Visibility` section, styled to the prototype's row (executor 3, 2026-09-21) — cases `17.001`–`17.006`

**Owner, on `visibility`: (a) BUILD, (b) KEEP THE RULING.** (a) was item 4a and shipped — `#600` →
`ffb9389a` served the mode the wire always carried. **This section is the STYLING of that section against
the prototype's row, and it is neither the mode nor the roster.**

⛔ **§6's law, restated because it is the whole risk here: (b) KEEPS THE EXPLICIT AUDIENCE ROSTER CUT.**
`apps/server/src/routes/tickets.ts:115-118` refuses to serve `own_user_ids` / `resolved_user_ids` —
*"an explicit audience ROSTER, a disclosure no plan authorized."* **The prototype DRAWS that roster**
(`design-system/interactive/desktop.dc.html`: a chip per viewer with a removable `×` at `:1214`–`:1224`,
an *"Add someone who can see it…"* `<select>` over `viewerCandidates` at `:1225`–`:1229`, and a closing
guest note at `:1230`). **The product has no data behind any of it, so none of it is built** — a picker
over an empty set is the same defect as a form that can only be refused. Case `17.006` holds that as a
NEGATIVE assertion with a positive control.

**MEASURED BEFORE BUILDING, because a "known gap" that had already shipped is this repo's most expensive
recorded failure.** At `534c450b`, `git grep -nE '^\s*\.gn-visibility' -- '*.css'` answered **0**, against
a **positive control in the same sweep path** (`.gn-filters__body` → 3). The string's only appearance in
any stylesheet was a **comment** (`packages/ui/src/ui.css:4810`) naming `.gn-visibility__modes` /
`.gn-visibility__people` **hypothetically**, assuming they inherit a house rule that does not exist. **The
gap is total: the section rendered as raw user-agent chrome** — the identical defect class `16.83`
records for `.ticket-type-list__move`.

**The TWO STRUCTURAL DIVERGENCES are recorded rather than built, on `16.81`'s own rule** that
*styled differently* is a restyle and *structured differently* is a feature: the prototype draws
Visibility as a `<dt>/<dd>` row **inside** the sheet's `<dl>` where the product mounts a standalone
`<section>` **after** `</dl>` (`ticket-sheet.tsx:2293` vs `:2335`), and the prototype's control is a
**binary toggle** where the product's is a **4-mode radio group** a toggle cannot express. Neither is
fixed here; both are named in `docs/lanes/executor-3-state.md`.

- **17.001** ✅ **The section had NO CSS RULE AT ALL, and now has one that carries the prototype's own column geometry.** This is the whole defect: every other case in this group asserts against a class that rendered as UA chrome precisely because this one was false. The rule takes `rowValueB` (`:3756`) whole — `display:flex; flex-direction:column; gap:4px; align-items:flex-end` — so the section is the right-aligned value column the prototype draws. Mutation-witnessed by deleting the rule: `rule()` **throws** ("no rule for .gn-visibility") rather than answering empty, so the case reddens by naming its own site. — `packages/ui/src/ui.css`, `packages/ui/test/components.test.tsx`
- **17.002** ✅ **The eyebrow and the notes carry the ROW'S OWN 12px scale — which is the prototype's outlier, MEASURED rather than inherited.** `desktop.dc.html` carries the identical uppercase eyebrow declaration at **13px/18px twelve times**; this row's `:1213` at **12px/16px is the ONLY 12px instance in the file**. The row is internally consistent about it — its `visNote` (`:1210`) and its closing note (`:1230`) are both 12px/16px — so the row has its own dense scale and it is carried deliberately. **The 1px difference from `.gn-comments__heading` (which transcribed the 13px/18px constant) is the PROTOTYPE's divergence, not an invention here**, and the case exists so that a later "harmonise the two" edit reddens here instead of landing quietly. Mutation-witnessed: `0.75rem` → `0.8125rem` reddens it and nothing else. — `packages/ui/src/ui.css`, `packages/ui/test/components.test.tsx`
- **17.003** ✅ **The CONTROL block opts out to the LEFT, and the UA fieldset box is reset.** The prototype's row is right-aligned **except its control**, which carries `align-self:flex-start` (`visBtnStyle`, `:3786`) — that mixed geometry is the authority's own, and a form that right-aligned its own radio labels would be a transcription nobody could read. One wrapper carries it so the next control added to the block cannot miss it. **The fieldset reset is the defect `ui.css:4804` predicted one level up:** that comment names `.gn-visibility__modes`/`.gn-visibility__people` as selectors it assumed would "inherit a house rule already", while no rule anywhere provides one. Mutation-witnessed: removing `align-self` reddens it. — `packages/ui/src/ui.css`, `packages/ui/test/components.test.tsx`
- **17.004** ✅ **The standing line is the prototype's control — a pill with a dot — and the dot is toned by the MODE, not by the roster.** ⚠ **The fixture is the PRODUCTION SHAPE and that is what makes this case load-bearing:** the roster is cut at the wire, so a restricted ticket served by the shipped server has `resolvedMode: 'explicit'` and `userIds: null`. A dot keyed on the roster — the natural mistake, since the two arrive together in `VisibilityClaim` — would paint the NOT-restricted tone on exactly that ticket and would pass every assertion written against a fixture that happened to carry names. Both directions are asserted (restricted and not), and `current: null` draws **no pill and no dot at all**, because a tone for an audience nobody served is the same invention the absence sentence refuses. The dot is `aria-hidden` and contributes **zero characters** — asserted as an EXACT `textContent` match, so a dot that introduced so much as a leading space leaves `toContain` green and this red. Mutation-witnessed on both halves: the CSS tone swapped, the modifier rule deleted, and the component re-keyed onto `userIds`. — `packages/ui/src/ui.css`, `packages/ui/test/components.test.tsx`, `packages/app-core/src/views/visibility-editor.tsx`, `packages/app-core/test/views/visibility-editor.test.tsx`
- **17.005** ✅ **No `[data-style]` block forks the section, and each rule is declared exactly ONCE across BOTH stylesheets.** The scan covers `ui.css` and `globals.css` because `apps/web/app/layout.tsx` imports `ui.css` and **then** `globals.css`, so a `[data-style]` override appended there wins at equal specificity — a scan of `ui.css` alone is a check that cannot fail. The second half is that every assertion above goes through `rule()`, which answers the **FIRST** match: an appended second `.gn-visibility { … }` would beat them all while every one stayed green. Mutation-witnessed: a duplicate rule appended at EOF reddens it. — `packages/ui/src/ui.css`, `packages/ui/test/components.test.tsx`
- **17.006** ✅ **The section offers no audience picker and no chip — (b) keeps the roster off the wire — and the members picker is the POSITIVE CONTROL.** The prototype draws a `<select>` over `viewerCandidates` and a chip per viewer; the product has no data behind either. Asserted as `select`/`option`/chip-class absence **in the same run** as the control that the members fieldset IS rendered with its per-member rows, so the case cannot pass by the section drawing nothing at all. — `packages/app-core/test/views/visibility-editor.test.tsx`

### What is NOT covered, named rather than implied

- **No browser measurement was taken.** Every assertion in this group is jsdom or stylesheet TEXT; jsdom
  computes no cascade, so no case here observes a painted pixel. The section is also outside the viewport
  suite's reach — `apps/web/e2e-viewport/responsive.spec.ts` drives `UNAUTHED_ROUTES` plus `/workspaces`,
  `/invite/<token>`, `/sign-in` and `/`, and **never opens a ticket sheet** (the same limitation `16.81`
  records for `aria-label`). **Consequence, stated rather than implied: the type-scale and tap-target
  ratchets cannot see this section either way today.** The notes are `<p>` elements at 12px and ARE in
  `type-scale.ts`'s `BODY_SELECTOR`, so they sit below its 16px body floor — that is a real relationship
  with the sweep, recorded here rather than discovered by whoever first renders the sheet.
- **The dot's contrast is NOT proven.** No `CONTRAST_PAIRS` row covers a dot on `--gn-fill-quaternary`.
  The nearest declared row is `customMarker` on `surface` (4.5), and `restricted` shares `customMarker`'s
  primitives — a neighbouring guarantee, not this one. The dot is decorative (`aria-hidden`), so 1.4.11's
  obligation is discharged by the label beside it; the missing row is named in `ui.css`'s own block.
- **The `<dl>` placement and the binary toggle are NOT done, deliberately.** Both are structural
  divergences from the prototype and both are recorded in `docs/lanes/executor-3-state.md` § 2. **Owner:
  the controller, if either is ever wanted** — neither has a disclosure this dispatch names.
