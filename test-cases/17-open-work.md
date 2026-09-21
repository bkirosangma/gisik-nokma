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
| **lane ds3 (batch B08)** | **`17.021`–`17.040`** (allocated by the controller 2026-09-21 21:0x, per live batch; the anchor PR carries the same table on `main`) — **minted: `17.021`–`17.025`**, the §16-owed properties recorded in the entries below — `17.021`–`17.023` are the comment thread's, `17.024`–`17.025` the ticket sheet's breadcrumb |

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
- **17.006** ✅ **The section draws NO roster — (b) keeps it off the wire — and the members picker is the POSITIVE CONTROL.** The prototype draws a `<select>` over `viewerCandidates` and a chip per viewer; the product has no data behind either. The `<select>`/`<option>` half is a tag-name assertion; ⚠ **the chip half WAS a `[class*="chip"]` SUBSTRING SEARCH FOR A CLASS NAME, AND A REVIEWER MEASURED IT FAILING FOR WHAT IT NAMES:** the reviewer mounted the prototype's actual chip row — a `×` remove button per member (`desktop.dc.html:1214-1224`'s shape) — under the class `gn-visibility__viewer`, i.e. a roster drawn on screen, and the file stayed **25 passed / 25**. The property is not a spelling, it is **whether the section DRAWS the audience**, so the assertion is now keyed on the roster itself: **no member's name may appear anywhere in the section except inside the editable people picker** — caught whatever the class is called, and it catches a list, a tooltip or a stray sentence too. The control is the SAME WALK with its predicate flipped (it must find exactly `MEMBERS.length` names inside the picker), so the empty result cannot be a scan that finds nothing anywhere. — `packages/app-core/test/views/visibility-editor.test.tsx`

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
- **A STALE `routes/tickets.ts:111-114` SURVIVES IN FOUR FILES THIS LANE DID NOT TOUCH, AND IS RECORDED
  RATHER THAN FIXED.** At this head the roster-cut clause — *"an explicit audience ROSTER, a disclosure no
  plan authorized"* — is at **`tickets.ts:115-118`**; `111-114` is the *"Reachable today, not
  hypothetical"* paragraph above it. This lane corrected **every instance inside its own change set**
  (`visibility-editor.tsx` ×2, `visibility-editor.test.tsx` ×1, `Features.md` ×1) so the change set does
  not carry one sentence at two ranges. **The four it left alone are outside its scope and would push the
  diff into unrelated files:** `packages/app-core/src/online/mappers.ts:1899`,
  `packages/app-core/src/view-types.ts:391`, `test-cases/03-foundation-ledger.md` (×3) and
  `docs/lanes/executor-state.md` (executor 1's handoff, which this lane must not edit). **Owner: whoever
  next touches any of those four files** — it is a citation correction, no behaviour.

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


## §16-OWED PROPERTIES, MINTED HERE — the door is §16's, the id is §17's

**Why these live in §17 rather than §16.** F3 and V4 are both properties of the comment thread, whose
decisive properties are catalogued in `test-cases/16-remaining-doors.md` — but **exec 2's §16 block is
fully spent**, and that file's own rule is *"When your block is empty, STOP AND ASK. Do not mint from the
tip and do not borrow a neighbour's."* The properties were written, tested and pushed with their ids
recorded as **OWED**; the controller allocated this block on 2026-09-21 21:0x and directed the mint here.
**§16 was not touched to mint these**, and each entry below names the §16 door it belongs to, so a reader
arriving from that file's comments-thread section can find them.

- **17.021** ✅ **F3 — THE COMMENT THREAD RENDERS THE MARKS ITS COMPOSER OFFERS, and a link's destination survives the round trip.** §16 door: the comment thread (`comments-thread.test.tsx`, case `16.74`). The composer is the real editor and offers **Bold, Italic, Code, Link, List, Quote**; the thread rendered the stored body through `docToPlainText`, which reads `type`/`text`/`attrs` and **never reads `marks`** — so emphasis, code spans, list markers and a blockquote's quotation were discarded, and **a link's destination was unrecoverable from anywhere on the surface**. That last one is not a lesser rendering but a loss of information, and the table of consequences is the finding's own. **The fix is a SECOND projection, not a change to the first:** `docToPlainText` still serves `proj_search` and notifications, where rendering a link as its text and never its href is the DECLARED decision (`packages/editor/test/doc-text-conformance.test.ts` pins it verbatim — *"the URL is never indexed"*), so a search decision had become a display decision because one function served both; teaching the index about hrefs would have changed what search matches. `renderCommentBody` (`packages/app-core/src/views/comment-body.tsx`) renders the marks as elements, real `<ul>`/`<ol>` (so the browser supplies the markers the plain renderer dropped), `<blockquote>`, `<pre><code>`, `<br>` and `<a href>`, and keeps a mention at the same `@label` spelling the plain projection produces — the one thing that renderer already kept, and the two must not disagree about a person's name. **An href is another person's data, and this is the one place the change could hand a stranger a loaded gun:** React does not sanitise an href, the markdown-link input rule only validates what THIS client types, and the server stores whatever an event carries. `safeHref` allows exactly `http`/`https`/`mailto`, a root-relative path (*never* protocol-relative `//`, which is another origin) and a fragment, tested on a control-character-stripped copy because `java\tscript:alert(1)` executes and a naive `startsWith` reads it as harmless; **a refused href leaves the LABEL standing as text** — never a dead anchor, and never the raw `javascript:` string printed on screen as though it were a destination. Two decisions preserved rather than reversed: an image node still renders as NOTHING (a comment's files are chips, and this file must not become a second place they are drawn) and an unknown node renders its CHILDREN rather than a blank; the whole function is total, so a malformed or 500-deep document renders nothing rather than throwing inside a thread. (Planted defect: `comments-thread.tsx` restored to `origin/main`, `PASS (6) FAIL (1)` — *Unable to find an accessible element with the role "link" and name "the doc"*, i.e. the anchor did not exist at all; `/tmp/ds3-T-F3-red.log`.) — `packages/app-core/src/views/comment-body.tsx`, `packages/app-core/src/views/comments-thread.tsx`, `packages/app-core/test/views/comment-body.test.tsx`, `packages/app-core/test/views/comments-thread.test.tsx`

- **17.022** ✅ **V4 — A STILL-LOADING READ IS NOT AN EMPTY THREAD.** §16 door: the comment thread's empty/failed/loading split (`comments-thread.test.tsx`, case `16.74`). `useLiveQuery` initialises `data` to `null` and leaves it there while the request is in flight; the sheet collapsed it at the boundary — `comments={comments.data ?? []}` — so during the load window the thread rendered `Comments · 0` and *"No comments yet."* **Both are claims about the TICKET**, and this component's own docblock names *"No comments yet."* as exactly such a claim: it was written to prevent it, and the collapse on the last hop reintroduced it. The History tab three arms away has always done this correctly (`result.data === null` drawn as its own state rather than as an empty ledger), so this was one file with two disciplines and the wrong one on the surface that made a statement about a ticket's content. `CommentsThread` now takes `comments: TicketComment[] | null` and draws **three** arms, and **the order of the first two is the whole fix:** a failure outranks a wait, because `useLiveQuery` leaves `data` at `null` after a rejection too, so a thread testing `comments === null` FIRST would draw a spinner over a read that had already failed and is never coming back; once the failure is excluded, `null` can only mean *in flight*. The heading drops its count in BOTH the failed and the pending case — `Comments · 0` over either is a count nobody measured — and the wait arm uses the same word (`Loading…`) the History tab uses for the same state, so the two tabs do not describe one read's progress two ways. The two controls are in the case because the three arms are only distinguishable together: an arm that also swallowed the empty case would satisfy the pending assertion and break the ticket. (Planted defect: the collapse restored — `null` treated as `[]` and the wait arm removed — `PASS (9) FAIL (1)` — *Unable to find an element with the text: Comments*, because the heading read `Comments · 0`; `/tmp/ds3-T-V4-red.log`.) — `packages/app-core/src/views/comments-thread.tsx`, `packages/app-core/src/views/ticket-sheet.tsx`, `packages/app-core/test/views/comments-thread.test.tsx`


- **17.023** ✅ **V7 — A REFUSED COMMENT MUST NOT COST THE AUTHOR THEIR WORDS.** §16 door: the comment composer and the thread it posts to (`ticket-sheet-comments.test.tsx` / `ticket-editor-slot.test.tsx`, cases `16.75` / `9.66`). `TicketSheet.submitComment` records the server's answer in `serverRefusal` and **returns normally** on a refusal; `TicketEditorSlot.handleSubmit` awaited `submit(...)` and, on a **resolution**, ran `editor.commands.setContent(emptyDoc())`. So the promise resolved, the composer cleared, and the person lost what they had written **while the refusal sat on screen beside an empty box**. The clear lives inside the `try`, after the `await`, and the paragraph beside it says exactly what it was supposed to prevent: *"a refused claim must never cost the user their words"* — the mechanism it relied on was **the absence of a throw**, and a refusal does not throw. **This is the one place the two categories this product keeps apart everywhere else collapsed into one** — *the server answered "no"* versus *nobody answered* (`Ruling 27/33`; the sheet's separate `serverRefusal`/`transportError`/`editorError` slots) — and the collapse deleted text. **The fix is the reviewer's second option, an EXPLICIT SUCCESS SIGNAL:** `submit` now returns `Promise<boolean>`, `true` meaning the server accepted the claim, and anything else — a refusal, an `invalid`, a silence, a rejection — means the composer keeps the words and `onDone` does not fire. **Deliberately NOT `Promise<void>` with an optional `false` read as "not accepted":** a fail-open default would restore this defect for any caller that did not opt in, which is the half-witnessed contract this series keeps re-finding; the cost is that every producer must say which happened, and that is the point. The sheet's two producers (`submitComment`, `submitDescription`) return the signal, and the seam is declared twice — app-core's `EditorSlotProps` and the editor's `TicketEditorSlotProps` — so both declarations changed together, with the type-level parity assignment in `ticket-editor-slot.test.tsx` REFUSING to compile when only one moved (it caught exactly that during this task: the build failed with *"An expression of type 'void' cannot be tested for truthiness"* before the second half was updated). The control is in the case: an ACCEPTED submission must still clear, because a fix that stopped clearing altogether would satisfy the refusal assertion and leave the person typing the next comment into the previous one. (Planted defect: `TicketEditorSlot.tsx` restored to `origin/main` — clear on resolution — `PASS (1) FAIL (1) skipped (18)`, *expected '' to contain 'the words'*; `/tmp/ds3-T-V7-red.log`.) — `packages/editor/src/components/TicketEditorSlot.tsx`, `packages/app-core/src/views/editor-slot.tsx`, `packages/app-core/src/views/ticket-sheet.tsx`, `packages/editor/test/ticket-editor-slot.test.tsx`


- **17.024** ✅ **E4-1 + E5-3 — THE BREADCRUMB NAMES THE SAME ANCESTOR TWICE WHEN THE PARENT IS AN EPIC.** §16 door: the ticket sheet's location breadcrumb (`ticket-sheet.test.tsx`, cases `16.63`/`16.64`/`16.87`/`16.88`). The server's ancestry walk starts at `state.parentId` and returns the first ancestor whose type is an epic (`apps/server/src/routes/tickets.ts`), so when the ticket's DIRECT PARENT is an epic, `epic.id === parent.id`. `ticket-sheet.tsx` rendered `epicCrumb` and `parent` under two independent null checks and **nothing compared their ids**, so the painted bar read `Convenience Corner › Shop operations › Open questions › Open questions › CCSO-6` — two link crumbs, `sheet-crumb-epic` and `sheet-crumb-parent`, both labelled *Open questions*, both opening the same ticket. **Blast radius: 23 of the 26 tickets in the seeded project** have an epic as their direct parent, so this is the ordinary shape rather than an edge; the reviewer painted ONE and said so rather than claiming 23 paints. A breadcrumb is a PATH or it is nothing — the component's own argument three lines up, made in the other direction for the missing-project case — and a path naming the same node twice states a depth the hierarchy does not have; for a screen-reader user it is two identical links with no way to tell one ancestor from two. The prototype gives no authority for the doubled form: its fixtures' `parentId` and `epicId` sets are disjoint, so it never draws this shape. **The fix is one comparison on `id` — the EPIC crumb is dropped and the PARENT kept**, the parent being the nearer and the one whose testid a reader of that file looks for; the comparison reads `id` across BOTH `ParentRef` arms, so a `restricted` ancestor (which carries an id and no title) is covered by the same line. ⚠ **NO EXISTING FIXTURE COULD SEE THIS:** `ticketRead()`'s default carries a parent and no epic, and every case that sets an `epic` sets a DISTINCT id, so the equal-id shape was never rendered by any case. The new fixture is the first — `parent.id === epic.id` — and it asserts the ancestor appears ONCE, that the surviving crumb is the parent's, and that the resulting bar is IDENTICAL to the no-epic bar. (Planted defect: the comparison removed, `PASS (0) FAIL (1) skipped (111)` — *expected [ 'Registrations', 'Registrations' ] to have a length of 1 but got 2*; `/tmp/ds3-T-E4-1-red.log`.) — `packages/app-core/src/views/ticket-sheet.tsx`, `packages/app-core/test/views/ticket-sheet.test.tsx`


- **17.025** ✅ **E4-30 — AN ANCESTOR CRUMB THAT OPENS A TICKET IS PAINTED IN A ROLE, NOT IN THE NON-LINK INK.** §16 door: the ticket sheet's location breadcrumb styling (`ticket-sheet.test.tsx`, cases `16.63`/`16.64`/`16.87`/`16.88`; the rule is in `packages/ui/src/ui.css`). Measured on a painted page: the plain `<span>` crumb and the `<button>` that OPENS A TICKET both computed `color: rgb(60,60,67)`, `text-decoration: none`, no weight change — `cursor: pointer` and the UA focus ring the only tells. The rule declared `color: inherit` and its docblock justified that with the prototype: *"its `<a>` sits in a nav declaring `color:var(--label2)` and sets no colour of its own (`:1101`, `:1103`)"*. **The premise is true and the inference is false:** the prototype's anchor does not set a colour of its own AND is not `var(--label2)`, because the export carries `a{color:var(--accent);text-decoration:none;…}` at **`:86`** — a TYPE selector, which applies to every anchor in the document and beats any inherited colour. **A `<button>` inherits; an `<a>` does not** — verified by opening `:86`. The rule now declares `color: var(--gn-text-accent)`, the role this product resolves the prototype's `accent` to FOR TEXT (`.gn-button` and `.gn-board-card__move` already wear it; `--gn-accent` is not text-safe, Round 2d), so the three crumb arms are three inks rather than two. **A CSS-binding case is the only vehicle:** jsdom applies no stylesheet, so `getComputedStyle` would pass against any CSS at all — the case reads `packages/ui/src/ui.css` with COMMENTS STRIPPED FIRST, because the rewritten docblock names `var(--gn-text-accent)` and quotes the old `color: inherit`, so a search over the raw file would find the fix in the PROSE. Two things the measurement taught: the first draft of the rule-body extractor accepted only `^` or `;` before a declaration, so the FIRST declaration of every rule was invisible and the case failed against correct CSS; and **`new Set([...]).size === 3` alone is a control that cannot fail here** — with the declaration reverted to `inherit` the three strings are still distinct, so the discriminating assertion is that the arm's value matches a `var(--gn-…)` ROLE. (Planted defect: `color` reverted to `inherit`, `PASS (3) FAIL (1)` before that case was tightened and `2 failed` after — *expected 'inherit' to be 'var(--gn-text-accent)'*; `/tmp/ds3-T-E4-30-red2.log`.) — `packages/ui/src/ui.css`, `packages/app-core/test/views/ticket-sheet-crumb-css-binding.test.tsx`

