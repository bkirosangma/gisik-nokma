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
| **release batch B08** (ds3, `rel/b08-ticket-sheet-crumbs-history-comm`) | **`17.021`–`17.040`** — allocated by the controller 2026-09-21 21:0x (cycle 46) when ds3 reported F3's §16 case OWED with §16 fully allocated; `17.021` is that case |
| **release batch B06** (ds1, `rel/b06-new-ticket-and-move-dialogs`) | **`17.041`–`17.060`** — allocated 2026-09-21 21:0x (cycle 46) |
| **release batch B09** (ds5, `rel/b09-failure-states-on-the-web-reads-`) | **`17.061`–`17.080`** — allocated 2026-09-21 21:0x (cycle 46) |
| **release batch B01** (exec6, `rel/b01-server-doors-security-and-refusa`) | **`17.081`–`17.100`** — allocated 2026-09-21 21:0x (cycle 46) |
| **release batch B02** (exec2, `rel/b02-account-page-workflow-builder-dr`) | **`17.101`–`17.120`** — allocated 2026-09-21 21:0x (cycle 46) |
| **release batch B07** (exec4, `rel/b07-soft-delete-integrity-engine-rep`) | **`17.121`–`17.140`** — allocated 2026-09-21 21:0x (cycle 46) |

**⚠ 2026-09-21 (cycle 46): blocks are now per RELEASE BATCH (the branch that lands), not per lane session** — a lane runs several batches in one worktree tonight, and a block that follows the session would be shared by two branches landing in either order. **A batch that empties its block asks the controller for the next twenty; a later batch in the same lane gets its own row.** The rule this file already states applies unchanged: mint only from your own row, never from the tip, never from a neighbour's. (ds5 measured the alternative tonight in §10/§13, where three batches minting from "next free N" collided: `10.90` and `13.1050`–`13.1056` were minted twice.)

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
`apps/server/src/routes/tickets.ts` refuses to serve `own_user_ids` / `resolved_user_ids` —
*"an explicit audience ROSTER, a disclosure no plan authorized."* **The prototype DRAWS that roster**
(`design-system/interactive/desktop.dc.html`: a chip per viewer with a removable `×` at `:1214`–`:1224`,
an *"Add someone who can see it…"* `<select>` over `viewerCandidates` at `:1225`–`:1229`, and a closing
guest note at `:1230`). **The product has no data behind any of it, so none of it is built** — a picker
over an empty set is the same defect as a form that can only be refused. Case `17.006` holds that as a
NEGATIVE assertion with a positive control.

**MEASURED BEFORE BUILDING, because a "known gap" that had already shipped is this repo's most expensive
recorded failure.** At `534c450b`, `git grep -nE '^\s*\.gn-visibility' -- '*.css'` answered **0**. The
string's only appearance in any stylesheet was a **comment** (`packages/ui/src/ui.css:4810`) naming
`.gn-visibility__modes` / `.gn-visibility__people` **hypothetically**, assuming they inherit a house rule
that does not exist. **The gap is total: the section rendered as raw user-agent chrome** — the identical
defect class `16.83` records for `.ticket-type-list__move`.
⚠ **THE POSITIVE CONTROL WAS FIRST RECORDED AS *"`.gn-filters__body` → 3"*, AND A REVIEWER MEASURED THAT
AS THE WRONG NUMBER FOR THE RIGHT REASON.** Three is the **unanchored substring** count; under the
measurement's OWN anchored pattern (`^\s*`), the control answers **1** (`ui.css:4800`). **The zero is
unaffected and was independently re-measured — but as recorded the control could not have caught a broken
`^\s*` anchor, which is the one way this measurement could have been wrong.** Corrected here rather than
left, because a control that does not traverse the measurement's own path is the failure mode this repo
has recorded more than any other.

**The TWO STRUCTURAL DIVERGENCES are recorded rather than built, on the rule the sheet-parity lane
states at `test-cases/16-remaining-doors.md:838`** — *"styled differently* is a restyle; *structured
differently* is a feature" — ⚠ **the first draft of this sentence attributed it to `16.81`, which is the
segmented-control CASE and does not state it; a reviewer opened both lines.** The rule is: the prototype draws
Visibility as a `<dt>/<dd>` row **inside** the sheet's `<dl>` where the product mounts a standalone
`<section>` **after** `</dl>` (`ticket-sheet.tsx:2293` vs `:2335`), and the prototype's control is a
**binary toggle** where the product's is a **4-mode radio group** a toggle cannot express. Neither is
fixed here; both are named in `docs/lanes/executor-3-state.md`.

- **17.001** ✅ **The section had NO CSS RULE AT ALL, and now has one that carries the prototype's own column geometry.** This is the whole defect: every other case in this group asserts against a class that rendered as UA chrome precisely because this one was false. The rule takes `rowValueB` (`:3756`) whole — `display:flex; flex-direction:column; gap:4px; align-items:flex-end` — so the section is the right-aligned value column the prototype draws. Mutation-witnessed by deleting the rule: `rule()` **throws** ("no rule for .gn-visibility") rather than answering empty, so the case reddens by naming its own site. — `packages/ui/src/ui.css`, `packages/ui/test/components.test.tsx`
- **17.002** ✅ **The eyebrow and the notes carry the ROW'S OWN 12px secondary-text scale — the prototype's outlier, MEASURED rather than inherited.** Of the **13** lines in `desktop.dc.html` carrying `letter-spacing:0.6px` (the eyebrow constant), **twelve are `13px/18px` and exactly one, `:1213` (this row), is `12px/16px`.** ⚠ **THIS LINE FIRST READ *"this row's `:1213` at 12px/16px is the ONLY 12px instance in the file"*, WHICH IS FALSE AND WAS FALSIFIED BY A REVIEWER: 61 other lines carry `12px/16px`** (a weekday header at `:497` among them), so the claim was wrong by a factor of sixty. The narrow claim above is the measured one. The row's own SECONDARY TEXT is consistent at 12px/16px — its `visNote` (`:1210`) and its closing note (`:1230`) — which is what makes this the row's scale rather than a slip; ⚠ **that consistency is the secondary text's and not the row's: the same row also draws a 13px/18px chip (`:1216`), a 15px `<select>` (`:1224`) and a 15px `<dt>` (`:3755`).** **The 1px difference from `.gn-comments__heading` (which transcribed the 13px/18px constant) is the PROTOTYPE's divergence, not an invention here**, and the case exists so that a later "harmonise the two" edit reddens here instead of landing quietly. Mutation-witnessed: `0.75rem` → `0.8125rem` reddens it and nothing else. — `packages/ui/src/ui.css`, `packages/ui/test/components.test.tsx`
- **17.003** ✅ **The CONTROL block opts out to the LEFT, and the UA fieldset box is reset.** The prototype's row is right-aligned **except its control**, which carries `align-self:flex-start` (`visBtnStyle`, `:3786`) — that mixed geometry is the authority's own, and a form that right-aligned its own radio labels would be a transcription nobody could read. One wrapper carries it so the next control added to the block cannot miss it. **The fieldset reset is the defect `ui.css:4804` predicted one level up:** that comment names `.gn-visibility__modes`/`.gn-visibility__people` as selectors it assumed would "inherit a house rule already", while no rule anywhere provides one. Mutation-witnessed: removing `align-self` reddens it. — `packages/ui/src/ui.css`, `packages/ui/test/components.test.tsx`
- **17.004** ✅ **The standing line is the prototype's control — a pill with a dot — and the dot is toned by the MODE, not by the roster.** ⚠ **The fixture is the PRODUCTION SHAPE and that is what makes this case load-bearing:** the roster is cut at the wire, so a restricted ticket served by the shipped server has `resolvedMode: 'explicit'` and `userIds: null`. A dot keyed on the roster — the natural mistake, since the two arrive together in `VisibilityClaim` — would paint the NOT-restricted tone on exactly that ticket and would pass every assertion written against a fixture that happened to carry names. Both directions are asserted (restricted and not), and `current: null` draws **no pill and no dot at all**, because a tone for an audience nobody served is the same invention the absence sentence refuses. The dot is `aria-hidden` and contributes **zero characters** — asserted as an EXACT `textContent` match, so a dot that introduced so much as a leading space leaves `toContain` green and this red. Mutation-witnessed on both halves: the CSS tone swapped, the modifier rule deleted, and the component re-keyed onto `userIds`. — `packages/ui/src/ui.css`, `packages/ui/test/components.test.tsx`, `packages/app-core/src/views/visibility-editor.tsx`, `packages/app-core/test/views/visibility-editor.test.tsx`
- **17.005** ✅ **No `[data-style]` block forks the section, and every selector this group asserts on is declared exactly ONCE across BOTH stylesheets.** The scan covers `ui.css` and `globals.css` because `apps/web/app/layout.tsx` imports `ui.css` and **then** `globals.css`, so a `[data-style]` override appended there wins at equal specificity — a scan of `ui.css` alone is a check that cannot fail. The second half is that every assertion above goes through `rule()`, which answers the **FIRST** match, so an appended duplicate beats them while they all stay green. ⚠ **THIS HALF WAS FIRST WRITTEN AS A COUNT OVER THE BASE SELECTOR ALONE, AND IT WAS A CHECK THAT COULD NOT FAIL FOR THE FAILURE ITS OWN COMMENT NAMED — a reviewer measured it.** It counted `/^\.gn-visibility\s*\{/gm` while the comment over it gave `.gn-visibility__standing-mode` as the example; the reviewer appended a duplicate of THAT selector at EOF and the case stayed **43 passed / 43** while the pill repainted danger-red in a browser (the negative control — a duplicate `.gn-visibility` — reddened correctly, so the case *could* fail, it just did not fail for its own subject). **A count over one member of a family is not a count over the family**, so the check now enumerates the eight selectors the group asserts on. Mutation-witnessed both ways. — `packages/ui/src/ui.css`, `packages/ui/test/components.test.tsx`
- **17.006** ✅ **The section draws NO roster — (b) keeps it off the wire — and the members picker is the POSITIVE CONTROL.** The prototype draws a `<select>` over `viewerCandidates` and a chip per viewer; the product has no data behind either. The `<select>`/`<option>` half is a tag-name assertion; ⚠ **the chip half WAS a `[class*="chip"]` SUBSTRING SEARCH FOR A CLASS NAME, AND A REVIEWER MEASURED IT FAILING FOR WHAT IT NAMES:** the reviewer mounted the prototype's actual chip row — a `×` remove button per member (`desktop.dc.html:1214-1224`'s shape) — under the class `gn-visibility__viewer`, i.e. a roster drawn on screen, and the file stayed **25 passed / 25**. The property is not a spelling, it is **whether the section DRAWS the audience**, so the assertion is now keyed on the roster itself: **no member's name may appear anywhere in the section except inside the editable people picker** — caught whatever the class is called, and it catches a list, a tooltip or a stray sentence too. The control is the SAME WALK with its predicate flipped (it must find exactly `MEMBERS.length` names inside the picker), so the empty result cannot be a scan that finds nothing anywhere. **The picker's own LABEL is part of this case (E4-6, 2026-09-21):** it rendered `actorLabel(member.id, member.name)`, whose fallback is the raw id — right for a claim this screen ATTRIBUTES, wrong for a box a person ticks — so a member whose display name is empty was offered as a 26-character ULID. The fixture now carries the dev seed's real shape (`name: ''` with an email) and the picker labels through `pickerLabel` (`name || email || id`); `actorLabel` is untouched at both provenance sites. The walk reads the member's LABEL rather than `member.name`, because `text.includes('')` is true of every element and the control would otherwise pass for the wrong reason. — `packages/app-core/test/views/visibility-editor.test.tsx`

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
- **THE STALE `routes/tickets.ts:111-114` IS CORRECTED AS OF 2026-09-21 — AND THIS NOTE WAS STALE IN THE
  SAME WAY IT WAS WARNING ABOUT.** The roster-cut clause — *"an explicit audience ROSTER, a disclosure no
  plan authorized"* — sits at **`tickets.ts:119-122`**. `:111-113` is the tail of the existence-disclosure
  paragraph and `:114-117` is *"Reachable today, not hypothetical"*, so **`111-114` was wrong from the
  start and `115-118` — the range this note named as the live one — was wrong too**: the clause had moved
  again between this note and its reading. Neither range is replaced with a third. Every citation now
  names the file and carries the quoted clause, so a reader greps the words instead of trusting a number
  that has moved twice under this same sentence. Fixed here (task `T-E3-16`, batch B18): `mappers.ts`,
  `view-types.ts`, `visibility-editor.tsx` ×2, `packages/ui/test/components.test.tsx`,
  `visibility-editor.test.tsx` ×2, `Features.md`, `test-cases/03-foundation-ledger.md` ×2, and this file's
  own line above — the last of those is why the earlier "four files this lane did not touch" is now empty
  rather than four.  **Two corrections to this note's own bookkeeping, measured:** it said
  `test-cases/03-foundation-ledger.md` held **three** occurrences — it held **two** (`:99`, `:172` at the
  head before this change) — and it named `docs/lanes/executor-state.md`, which carries neither range; the
  lane handoff that does is `docs/lanes/executor-3-state.md`. **Left alone deliberately: `docs/lanes/` —
  four files still carry the old range** (`executor-3-state.md`, `executor-state-history.md`,
  `review-compiled-controller.md`, `review-functionality-exec3.md`), and three of those are review reports
  or lane history that quote what was written at the time. **Owner: the controller** — a lane that
  rewrites another lane's report is a lane editing evidence.

## THE REVIEW PASS — recorded BEFORE the PR opened, and four of its findings were in THIS LANE'S OWN PROSE

**One reviewer, dispatched 2026-09-21 at head `a959289d`, read-only (it mutated three files to test
hypotheses and restored all three from the committed blobs, sha-verified).** It could not falsify the
transcription or ruling (b), and it **did** falsify eleven things around them. Every one is fixed above.

**The pattern, and it is the one worth carrying:** **four of the findings were in prose written the same
day as the code it describes.** The lane doc claimed `origin/main` had not moved (it moved 103 seconds
after the commit); `ui.css` claimed this row held *"the ONLY 12px/16px uppercase eyebrow"* in the file
(61 other lines are 12px/16px); the same block claimed `rowValueB` was *"taken whole"* (four of nine
declarations); and `17.002`/`17.005`/`17.006` each described a check broader than the check they had.
**Two of the three test defects were checks that could not fail for the failure their own comments
named** — which is exactly the class this repo's `checks-that-cannot-fail` record covers, found here by
a peer rather than by the author of the check.

**The Critical one is the one with a shelf life, and it is why the fold exists.** A handoff sentence that
`origin/main` has not moved is *true when written* and *false within two minutes*; the `git log
origin/main..HEAD` check the handoff itself prescribes is **structurally blind to being BEHIND**, so
nothing in this lane's own machinery could have caught it.
