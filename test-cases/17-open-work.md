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
| **release batch B08** (ds3, `rel/b08-ticket-sheet-crumbs-history-comm`) | **`17.021`–`17.040`** — allocated by the controller 2026-09-21 21:0x (cycle 46) when ds3 reported F3's §16 case OWED with §16 fully allocated; `17.021` is that case — **minted: `17.021`–`17.028`** (the §16-owed properties: `17.021`–`17.023` the comment thread's, `17.024`–`17.028` the ticket sheet's breadcrumb; recorded in the entries below) |
| **release batch B06** (ds1, `rel/b06-new-ticket-and-move-dialogs`) | **`17.041`–`17.060`** — allocated 2026-09-21 21:0x (cycle 46) |
| **release batch B09** (lane ds5) | **`17.061`–`17.080`** (allocated by the controller 2026-09-21 21:0x, recorded in the cycle-46 anchor PR on `main`) — **minted: `17.061`–`17.067` and `17.069`–`17.072`** (`17.068` deliberately unused: a control arm folded into `17.067`'s case rather than given its own id) |
| **release batch B01** (exec6, `rel/b01-server-doors-security-and-refusa`) | **`17.081`–`17.100`** — allocated 2026-09-21 21:0x (cycle 46) |
| **release batch B02** (exec2, `rel/b02-account-page-workflow-builder-dr`) | **`17.101`–`17.120`** — allocated 2026-09-21 21:0x (cycle 46) |
| **release batch B07** (exec4, `rel/b07-soft-delete-integrity-engine-rep`) | **`17.121`–`17.140`** — allocated 2026-09-21 21:0x (cycle 46) — **minted: `17.121`–`17.126`** (the batch's replica case is `12.399` in §12, which owns the replica) |
| **release batch B11** (ds5, `rel/b11-session-expiry-and-dead-controls`) | **`17.141`–`17.160`** — **used PROVISIONALLY, 2026-09-21 21:5x: the row above is the last allocated one and B11 had NO row when it started, so this block was taken from the tip at `origin/main` `0f06cc04` (`17.140` was the highest id in the table) rather than waited on. NOT controller-allocated — the controller is asked to ratify or reallocate it, and the ids are unmerged and renumberable until then.** Minted: **`17.141`–`17.143`** (E2-45) — and no more from this block: the controller allocated B11 a §13 block on 2026-09-21 22:0x (`13.1157`–`13.1166`, recorded in `13-neomorphism-and-workspace-screens.md`, now fully minted), so `17.144`–`17.160` are UNUSED and free for whoever next needs §17 |

**⚠ 2026-09-21 (cycle 46): blocks are now per RELEASE BATCH (the branch that lands), not per lane session** — a lane runs several batches in one worktree tonight, and a block that follows the session would be shared by two branches landing in either order. **A batch that empties its block asks the controller for the next twenty; a later batch in the same lane gets its own row.** The rule this file already states applies unchanged: mint only from your own row, never from the tip, never from a neighbour's. (ds5 measured the alternative tonight in §10/§13, where three batches minting from "next free N" collided: `10.90` and `13.1050`–`13.1056` were minted twice.)

**⚠ THIS TABLE IS THE ALLOCATION, AND IT EXPIRES.** A block is a longer-lived reading than a "next free
N", but it still expires when the controller reallocates. **Re-read it before minting, and if your own
allocation changes, change it HERE in the same action** — not only in a handoff or a message.
**When your block is empty, STOP AND ASK.** Do not mint from the tip and do not borrow a neighbour's —
that is the rule whose breach made §13 go red twice.

**A lane with NO ROW in that table must also STOP AND ASK — silence is not a licence.** The escape hatch
above fires on a block that has RUN OUT, and it said nothing about a lane that was never given one: those
are different states with the same remedy, and the second is the easier one to read past, because a table
that does not name you looks like a table that does not constrain you. ⚠ **When §17 was opened this table
had ONE row** (exec 3's), and the count is the half that did not survive — the table grew to seven rows at
cycle 46. **The sentence is the half that did**, and it is written here because the next lane to arrive
without an allocation will read this table rather than the cycle it was allocated in.

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

⚠ **WHICH COPY THESE NUMBERS ARE IN — named, because two files in this repository are called the
prototype and only one of them is.** Every `:NNNN` in this group is a line in
**`design-system/interactive/desktop.dc.html`** — the file `design-system/interactive/PROVENANCE.md`
records as the 2026-09-18 owner export, sha256
`2cda054b4320ebb6b379d290a6e8dba69ac45cd1eabe0da100b5425e45b6d90c`, 320,109 bytes, re-measured
2026-09-21 and unchanged since it was written. **It is NOT the copy the controller's common brief rules
on:** that ruling (`CTL-REVIEW-COMMON-2026-09-22.md`) names a later export (2026-09-20) as the ruled
artifact and records every one of these numbers as **+1** against it. So a reader holding THAT file
subtracts one and a reader holding this one does not — and the offset is carried from the ruling rather
than re-measured here, because that artifact is not in this worktree. **The substance transfers either
way:** the `letter-spacing:0.6px` / 12px outlier `17.002` rests on is present in both copies, which the
review measured on each. Cite the file and its sha rather than a bare number whenever this group is
quoted elsewhere.

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

## The ticket sheet's subtask reconciliation fired on an unread list (batch B06, 2026-09-21) — case `17.041`

- **17.041** ✅ **The subtasks section no longer asks the person to believe a claim about a list nobody has read yet.** `subtaskRows` was `subtasks.data ?? []`, so an in-flight read counted as a list of ZERO; `useLiveQuery` resets `data` to `null` on every KEY change (`packages/app-core/src/views/use-live-query.ts`), and the subtasks key carries the project id — which arrives only when the ticket read lands (`${ticketId}:subtasks:${projectId}`, whose own comment records why). So on EVERY ordinary parent-ticket load, for the whole second round trip, `subtaskRows.length` was 0 while `subtaskExpected` was the server's real child count, and the section drew a **`role="alert"`** reading *"The server counts N subtasks you can see, and 0 could be read — so this list is not shown rather than shown short."* **The reconciliation is now gated on the read having ANSWERED** (`!subtasksUnread`), which is strictly narrower and leaves the property the section exists for untouched: a short list is still never drawn silently. **The empty arm was the same false claim one notch quieter** and is gated with it — `subtaskRows.length === 0` is true of an unread list too, so both arms now render nothing until an answer arrives. ⚠ **The RED run measured the alert, not a stand-in:** the child read is held open on a promise this case resolves itself, so the in-flight window is deterministic rather than raced, and the failure before the fix was `expected <p …(3)></p> to be null` — the alert element itself. ⚠ **A FAILED read is deliberately lumped in with a pending one, and that is named rather than hidden:** `subtasks.error` is not consulted, so a child read that REJECTS renders neither arm nor a failure sentence — the section draws nothing. The empty sentence it used to draw in that case was a false claim about the ticket, so the new behaviour is the smaller one, but it is still an absence with an **owner: whoever next touches this section**; the three-arm treatment `HistoryTab` already uses (error tested BEFORE `data === null`, on the surfaced fact that a rejection leaves both true) is the model. — `packages/app-core/src/views/ticket-sheet.tsx`, `packages/app-core/test/views/ticket-sheet.test.tsx`

## The visibility fieldset could outlive the sentence it contradicts (batch B06, 2026-09-21) — case `17.042`

- **17.042** ✅ **A reload that changes the standing claim re-seeds the fieldset, and a reload that re-delivers the SAME claim does not.** The seed is one-shot (`useState`), and the ONE behaviour that re-runs it is a QUERYKEY change: `useLiveQuery` answers `null` and the "Loading…" branch remounts this subtree, so a ticket SWITCH is correct — recorded in the component's own docblock. A RELOAD keeps the key, so `current` updates IN PLACE with the component still mounted, and the standing sentence (rendered from `current`) could then show one mode while the fieldset (rendered from the stale seed) showed another, with Apply sending the stale one. The reconcile is keyed on the CLAIM'S CONTENT and not on the object — `current` is a fresh object on every read, so an identity key would wipe a half-authored fieldset whenever a stream event merely re-delivered the same claim. **Both directions are asserted, because only the pair distinguishes "reconciles" from "resets on every render".** (Planted defect, MEASURED as a mutation on the fixed tree with the `ui`/`app-core` sources as they stand: disabling the re-seed reddens the first arm with `expected 'explicit' to be 'inherit'` while the second stays green — `/tmp/ds1-T-E2-33c-mutation.log`, restored afterwards, the file's diff sha byte-identical before and after.) — `packages/app-core/src/views/visibility-editor.tsx` (`visibilityClaimKey`), `packages/app-core/test/views/visibility-editor.test.tsx`

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

## The invite page's fourth arm: a link that could not be CHECKED — cases `17.061`–`17.062` (V9, 2026-09-21)

**Why this case is in §17.** The invite page's older cases are §3 (`3.118`–`3.123`), and its newer
token-page case is §16 (`16.44`) — but §16's blocks are spent and §3's tip is shared across live lanes
with no block held here. §17's own table above carries this batch's allocation, so the case is minted
from it. It is a door case, which is what that block was allocated for.

**The defect.** `getInvite`'s rejection arm set `invite = null` for ANY failure, and the render gave
`null` exactly one sentence: *"This invitation link does not open anything. It may have been used,
withdrawn, or lapsed — ask whoever invited you for a new one."* So a dropped connection, a 500 or an
unparseable body were all drawn as a dead link — and that sentence **sends the person to ask for a
replacement, retiring a link that was never tried and may be perfectly good.** `null` is not nothing
here: it is the transport's read affordance for the server's ONE frozen 404 body, which really does mean
the link opens nothing.

- **17.061** ✅ A transport failure says the link could not be CHECKED, says nothing has been used up,
  and does not say the link opens nothing. Asserted on the pair, because the two sentences are
  alternatives in one branch — a case asserting only the new one passes on a page drawing both. Plus the
  retry, which re-asks and believes a second answer. — (`apps/web/test/invite-page.test.tsx`)
- **17.062** ✅ An ANSWERED `null` still renders the dead-link sentence, and not the
  unable-to-check one. Without it the fix could be "always say it could not be checked", which would be
  false of every link the server actually refused. — (`apps/web/test/invite-page.test.tsx`)

**The state is four-valued now** — `'loading' | 'unreachable' | null | InviteSummary` — where it was
three. `3.121` keeps the ANSWERED-`null` arm and its own docblock; the half of it that asserted the
transport failure was the defect, and it moved here rather than being renumbered.

## The visibility editor's read-only sentence — case `17.063` (F4, 2026-09-21)

**The arm answered "then who can?"** — the exact question a person who has just been told "no" is asking —
with a sentence that omitted the two roles most likely to be able to help, and that contradicted its own
sibling two declarations up.

**The measurement, re-taken rather than inherited.** The server's rule is
`apps/server/src/permissions/check-permission.ts:1058-1060`,
`hasProjectAdminRights(ctx.eff, projectId) || ctx.sessionUserId === creatorId`, and
`hasProjectAdminRights` (`apps/server/src/permissions/effective-role.ts`) is
`workspaceRole === 'owner' || workspaceRole === 'admin' || projectAdmin`. **A workspace owner or admin
may change any ticket's visibility.** The shipped sentence — *"Only a project admin, or whoever created
this ticket, can change who sees it."* — named neither, while `LOCKOUT_WARNING_COPY` in the same file
says *"or the workspace owner, who always sees"*.

- **17.063** ✅ The read-only sentence NAMES the workspace owner and admin. Asserted on the pair — the
  corrected sentence present AND the understated one absent — because a case asserting only the presence
  passes over a component rendering both; and the two role words are asserted separately, because a
  sentence that merely reworded the old one would satisfy a presence-only check. —
  (`packages/app-core/test/views/visibility-editor.test.tsx`)

**The second copy of the same omission was found while fixing the first, and it is the more load-bearing
one.** `canEdit`'s own prop docblock read *"spec §6: project admins and the ticket's creator"* — the same
under-permissive rule, stated at the place a CALLER reads to decide what to pass. It is corrected in the
same change set; had it been left, the next caller would have written the gate the old sentence
described.

**⚠ THE ARM IS STILL DEAD IN THE SHIPPED PRODUCT, AND THAT IS RECORDED AT THE SITE RATHER THAN FIXED
HERE.** It renders only when `canEdit` is false; `canEdit` is `TicketSheet`'s `canSetVisibility` prop,
whose declared default is `true` (`ticket-sheet.tsx:422`); and a sweep of `apps/web/**`,
`apps/desktop/**` and `apps/mobile/**` for `canSetVisibility` finds ONE hit and it is a COMMENT
(`page.tsx:2825`). **Deleting the arm — or giving it the read that makes it reachable — is a decision
about `canSetVisibility`, not about this sentence**, and the sheet's own docblock
(`ticket-sheet.tsx:225-241`) argues that the client cannot know role or creator, which is a sound
argument for showing the control and letting the door refuse. **Owner: whoever next revisits
`canSetVisibility`.** The sentence was corrected regardless: a wrong permission statement is not made
less wrong by being unreachable, and the prop is a declared part of this component's public surface.

## The visibility editor's write: a transport failure left Apply dead and silent — cases `17.064`–`17.065` (V3, 2026-09-21)

**The defect.** `apply` set `{kind:'sending'}` and then awaited `dataSource.ingest([…])` with **no
`try`/`catch`**, and its call site is `onClick={() => void apply()}` — a `void`, so the rejection was
discarded entirely. Nothing caught it, so `submission` stayed `'sending'`, and that is exactly the state
the Apply button is `disabled` on (`disabled={explicitNamesNobody || submission.kind === 'sending'}`).
The component's only sentence lives under `submission.kind === 'refused'`, which the throw had made
unreachable. A dropped connection therefore left a control that never came back and nothing said — the
shape `BulkCloseDialog` two files away already handles with a dedicated `transportError` slot.

- **17.064** ✅ A rejected write says so, and Apply comes back. Asserted on the PAIR, because the two
  halves are one state: a component that re-enabled the control and said nothing, or one that spoke and
  left the control dead, would each satisfy one half alone. The sentence carries the cause's own words
  and says WHO CAN SEE THIS IS UNCHANGED — the reader's next question, whose honest answer is that
  nothing was recorded. — (`packages/app-core/test/views/visibility-editor.test.tsx`)
- **17.065** ✅ A COMMITTED write says nothing about the server being unreachable, and `onChanged`
  still fires. Without it the fix could be "always render the transport sentence", which would be false
  of every write that landed. — (`packages/app-core/test/views/visibility-editor.test.tsx`)

**`submission` returns to `idle`, NOT to `refused`.** Nothing was refused — no server judged this — and
dressing a transport failure in the engine's words is the thing the refusal slot exists to prevent. The
transport sentence is its own slot (`transportError`), with its own CSS rule and deliberately no coloured
inset marker: the two markers this section carries mean something (danger = refused, warning = you are
about to lose access) and this is neither.

**RED was observed against a MUTATION rather than against `HEAD`**, because the true pre-fix file has no
`writeUnreachedCopy` at all and the spec imports it — the run would have died on the import, which is the
"a mutation that cannot parse runs zero tests" shape. The first attempt at that mutation did not parse
either (a `perl` template ate the quoting around `.ticket.`), and it was discarded rather than counted.

## The invite page names the deadline and offers a next step — cases `17.066`–`17.069` (E5-18, 2026-09-21)

**Two of this finding's three parts are closed; the third is recorded with its reason rather than built.**

**(a) The expiry was on the wire and dropped.** The door has served `expiresAt` — the presented
TOKEN's own window, the value `openableInvite` matched on — as a fourth field on `GET /v1/invites/:token`
since 2026-09-19 (`apps/server/src/routes/invites.ts:417`, the `isInvite` expiry ruling), and
`createHttpInviteGateway` read three fields and threw it away. So the page could not say when the link
lapses while `/workspaces` renders the same fact for a waiting invitation (*"Invited … · lapses …"*).

- **17.066** ✅ The mapper carries the token's expiry, and answers `null` — never an invented day — for a
  body that sent none. — (`packages/app-core/test/online/invites.test.ts`)
- **17.067** ✅ The page NAMES the day it lapses, in the workspace's zone, through the same `onDay` shape
  `/workspaces` uses rather than a second date vocabulary; a summary with NO expiry draws no line at all
  (the control arm, in the same case).
  — (`apps/web/test/invite-page.test.tsx`)

**(b) The dead arm offered nothing.** It was ONE `<p>` in a Card with no link: a person who followed a
dead link, possibly while signed out, got a sentence and no next step.

- **17.069** ✅ The dead-link arm links to `/workspaces` — where their own waiting invitations live,
  including the one this link was for if they signed in under the address it was sent to — rather than a
  generic home link. — (`apps/web/test/invite-page.test.tsx`)

**(c) ⚠ DECLINE IS NOT BUILT, AND THE DOOR THE FINDING NAMES DOES NOT FIT THIS PAGE.** The decline that
exists is `MyInvitationsGateway.decline(inviteId)` (`packages/app-core/src/online/my-invitations.ts:50`),
served by `apps/server/src/routes/my-invitations.ts` — and **it is keyed by `inviteId`, matched to the
SIGNED-IN person's own address**, which is why `/workspaces` can offer it and this page cannot: a token
page holds a bearer TOKEN and, on a signed-out arrival, no session at all. Declining from here would need
a new door (decline-by-token), which is a route and a ruling rather than a control, and it would have to
answer what a decline means for a person who never signed in. **Owner: whoever next takes the invite
surface.** The finding's own words — *"A Decline beside Join (the door exists)"* — are true of the
PRODUCT and not of this page, and that distinction is the reason this part is recorded rather than built.

## The shared refusal panel says what to DO — case `17.070` (E5-30, 2026-09-21)

**The defect.** `ShellRefusal` — the one panel every refusing read in the shell renders — drew
`"{what} cannot be shown yet."` with the transport's raw string spliced straight after it. `message` is
the page's `error` string, the stringified cause, so a 500 read *"Your inbox cannot be shown yet. HTTP 500
for /v1/me/notifications"*: a sentence that reports the failure and stops — it never says a RELOAD is the
way out, which is the one thing a person looking at this panel can do — and then appends a status code to
someone who cannot act on one.

- **17.070** ✅ The panel names the action — *"{what} could not be loaded — reload to try again."* — the
  same advice the sibling load-error sentences in `packages/app-core` already give, AND still carries the
  transport's own words, now on their OWN LINE in their own element rather than spliced into a sentence
  designed to be read. Asserted on the pair, and with the old wording asserted ABSENT, because a panel
  rendering both would satisfy a presence-only check. — (`apps/web/test/page-refusals.test.tsx`)

**⚠ THE JUDGE SCORED THIS "PARTIAL" ON SCOPE, AND THE CORRECTION IS RECORDED RATHER THAN REPEATED.** The
finding said the panel is mounted on six sites across five routes; the verifier's own grep found
**fourteen mounts on seven routes**. Nothing in this case asserts a count — the copy change reaches every
mount either way, since it is one component.

**⚠ AND THE COPY CHANGE'S BLAST RADIUS IS THE HONEST COST OF A SHARED COMPONENT, MEASURED RATHER THAN
GLOSSED:** **29 assertions across 8 spec files** asserted the old wording and moved with it. Three of
those are historical records and were deliberately EXCLUDED from the sweep (this file's own record above,
`page-refusals`'s E5-30 docblock, and `ticket-list.test.tsx`'s E5-42 note). **The sweep also had to be
narrowed twice after it ran:** a generic `/could not be loaded/` matcher reddens on `/workspaces`'s
*"Your invitations could not be loaded:"*, which is a DIFFERENT component's sentence, so the two
absence-assertions that used it now name their own page's copy.

The `401` arm is untouched: `expired-session.tsx` routes it to the sign-in notice, deliberately, and the
panel never renders it.

## The single row's failure speaks in the ROW's vocabulary — case `17.071` (E2-26, 2026-09-21)

**Why this case is in §17 and not beside E5-10's in §13.** E2-26 and E5-10 name the same lines
(`apps/web/app/inbox/page.tsx:278`, `:269-279`) and were judged to score independently. The FIX landed
with E5-10; §13's B09 block (`13.1107`–`13.1116`) is spent, so this case is minted from this batch's §17
allocation. It records the property the fix turns on that E5-10's case does not assert.

**⚠ THE FINDING'S OWN REMEDY WAS "REUSE THE SAME TWO SENTENCES THE BULK PATH ALREADY HAS — one fact, one
vocabulary, no new copy", AND THIS CASE ASSERTS THE OPPOSITE ON PURPOSE.** The bulk pair says *"Those
notifications were not marked read"* — a plural, about a set. Said about ONE row it is a second false
statement laid on top of the missing one: the reader clicked one row and is told about several. So the row
has its own pair (`ROW_REFUSED_COPY`/`ROW_UNREACHED_COPY`), and the deviation is stated at the constant,
in the case, and in the commit rather than made silently. **The disagreement is with a reviewer's
suggestion, not with the finding's substance** — the substance, that the failure was silent, is closed.

- **17.071** ✅ The row renders its OWN sentence and the bulk path's is absent — both halves asserted,
  because a page rendering the bulk sentence would satisfy a check that only looked for "a sentence".
  — (`apps/web/test/inbox-bulk.test.tsx`)

## A committed move does not carry its comment into the next one — case `17.072` (E2-32, 2026-09-21)

**The defect.** `TransitionDialog` holds `comment` and `fieldValues`, and neither reset clears them: the
destination-change effect clears `evidenceAttachmentId`/`uploadError`, and the `!open` effect does the same
on close. The docblock beside the latter defends keeping the comment — *"typing into a dialog and losing it
to a stray Cancel is a real cost"* — **and that argument names CANCEL while the effect serves Cancel and
Commit alike.** The dialog is mounted for the sheet's whole life (`open={moveOpen}`), so after a committed
move — which only calls `setMoveOpen(false)` — the comment is still in state, and `submit` puts it on the
wire for the NEXT move: **a comment written about move A is recorded as the comment for move B.**

- **17.072** ✅ After one committed move, reopening the dialog and choosing the same destination finds an
  EMPTY comment box. The first move's arm is the control — its comment REACHES THE WIRE, asserted on the
  ingested payload — without which "empty on reopen" would be satisfiable by a box that never held
  anything. — (`packages/app-core/test/views/ticket-sheet.test.tsx`)

**The fix is NOT inside the dialog, and the reason is the property rather than the file.** The `!open`
effect cannot tell a Cancel from a Commit, and giving it a flag would be the component guessing at a fact
only the caller has. `TicketSheet` bumps a `movesCommitted` counter on the success path and uses it as the
dialog's `key`, so a committed move REMOUNTS the dialog — discarding the whole finished attempt and
nothing else. **Cancel does not change the key, so the cost the docblock defends is untouched**, which is
the half of the finding's own remedy that says *"while keeping preserve-on-Cancel"*.

The dialog's docblock is corrected in the same change set: it named only Cancel while its effect served
both closes, and that sentence is where the defect was legible.
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
- **17.026** ✅ **E5-3 — THE ONE-HOP SHAPE IS THE SAME TICKET ON BOTH SIDES OF THE WIRE, and it is NAMED ONCE on screen.** §16 door: the ancestry walk and the breadcrumb it feeds (`ticket-crumbs.test.ts` case `16.70`; `ticket-sheet.test.tsx` cases `16.65`/`16.87`). E5-3 is the independent duplicate of E4-1, whose client fix landed as `17.024`; **what this id adds is the two arms that fix depends on and no case witnessed.** (i) **SERVER:** `16.70` walks TWO HOPS (task → story → epic) and never covers the shape the seeded project is made of — **23 of 26 tickets have an epic as their direct parent**, so `cursor = state.parentId` is epic-rank on the first iteration and the walk returns the same row the parent branch reports. The new route case asserts `epic.id === parent.id` for that shape, with a CONTROL one hop deeper proving the two are not always equal. **It pins a contract the client depends on, which is why it lives in the server's suite:** if a future change has the route NULL the epic when it equals the parent — the alternative remedy the finding offered — this case reddens and the client comparison has to be revisited in the same change rather than quietly becoming dead code that still looks load-bearing. (ii) **CLIENT:** the visible pair is `17.024`; the same shape with BOTH refs `restricted` — which a viewer may be sent, since the walk answers `{kind:'restricted', id}` on both branches — is asserted to draw `Restricted parent` ONCE. **An implementation that special-cased `kind` would pass the visible case and draw two restricted crumbs here**, and a restricted crumb carries no title, so the person least able to notice the duplication by eye is the one seeing it. The dossier's own authority gives no guidance for either arm: the prototype never draws this shape, its `parentId` and `epicId` fixtures coming from disjoint sets. (Planted defects: the route's alternative remedy — epic nulled when it equals the parent — `PASS (0) FAIL (1) skipped (4)`, *expected null to deeply equal { kind: 'ticket', …(2) }*, `/tmp/ds3-T-E5-3-red.log`; the client comparison special-casing `kind` — kills ONLY the restricted arm, the visible case surviving as designed, *expected <span data-testid="sheet-crumb-epic"> to be null*, `/tmp/ds3-T-E5-3-red2.log`.) — `apps/server/test/routes/ticket-crumbs.test.ts`, `packages/app-core/test/views/ticket-sheet.test.tsx`
- **17.027** ✅ **P3 — THE PARENT CRUMB CARRIES THE PARENT'S OWN KEY, AND THE WIRE NOW HAS ONE TO CARRY.** §16 door: the ticket sheet's location breadcrumb and the ancestry the route serves (`ticket-sheet.test.tsx` cases `16.63`/`16.87`; `ticket-crumbs.test.ts` case `16.69`). The prototype labels its PARENT crumb `p.id + " " + p.title` (`Gisik Nokma - Desktop.dc.html:3417`) and its EPIC crumb `e.title` alone (`:3410-3413`). The product matched the epic and not the parent, because **the wire carried no key for an ancestor** — `ParentRef` was `{kind:'ticket'; id; title}` and the route's visible arm sent exactly that. **The cost was not cosmetic: the key is what disambiguates**, so a ticket whose epic and parent shared a title drew two IDENTICAL crumbs and a reader could not tell one ancestor from two. The parent ref now carries `key: string | null`, composed by the SAME three facts the ticket's own key uses — the workspace prefix, the project prefix, the parent's OWN position by `workspace_seq` — with the two prefix reads HOISTED above the parent branch rather than duplicated (`projectPrefixesInWorkspace` answers the whole workspace in one call, so the parent's key costs ONE extra read). **`key` on `ParentRef` is `string | null | undefined` and the three states are three different facts, which is why the field is not simply required:** a STRING is a composed key; `null` is one that could not be composed (the ticket-number ruling's own absence — a key is not worth refusing a read over); ABSENT means this ref carries no key at all, which is the GRANDPARENT, and that is the prototype's asymmetry rather than an omission. `mapParentRef` keeps the absent arm absent rather than collapsing it to `null` — the same discipline the ticket's own `key` mapping records one ref over. **The render is decided by WHICH CRUMB IT IS, not by whether a key is present:** the first version showed a key whenever the ref had one and drew `CCSO-7 Open Questions` for the epic as readily as for the parent, so `crumbLabel` takes the same `noun` parameter the restricted arm already uses. (Planted defects, measured on each side: the client rendering the title alone — the pre-P3 product — reddens `PASS (113 skipped, 1 failed)` on *the crumb bar's ordered texts*; the route omitting the key reddens the server case *expected { kind: 'ticket', …(3) } to match object { kind: 'ticket', …(2) }* at `/tmp/ds3-T-P3-red-server.log`. ⚠ Two EXISTING cases asserted the parent ref's exact shape and were updated rather than excused: `tickets-read.test.ts` now pins `key: null` there — its fixture seeds NO founding claim, so the prefix is null and the composition refuses to assemble a key from a hole — and `real-door-round-trip.test.ts` asserts `expect.any(String)`, deliberately NOT a literal typed from reasoning about a `freezeClocks` pipeline, with the exact string pinned deterministically in the case that seeds the founding claim.) — `apps/server/src/routes/tickets.ts`, `packages/app-core/src/view-types.ts`, `packages/app-core/src/online/mappers.ts`, `packages/app-core/src/views/ticket-sheet.tsx`, `apps/server/test/routes/ticket-crumbs.test.ts`, `packages/app-core/test/views/ticket-sheet.test.tsx`
- **17.028** ✅ **P4 — "THE SAME PLAIN SPAN" IS NOT THE SAME SPAN.** §16 door: the ticket sheet's location breadcrumb, the `onOpenTicket`-less arm (`ticket-sheet.test.tsx` case `16.64`; the rules are in `packages/ui/src/ui.css`). The arm's own docblock said the crumb *"degrades to the SAME plain span the restricted arm uses"*, and **that sentence was the only thing making the two arms look alike.** They share a SHAPE — a plain `<span>` carrying the base class — and not an INK: `.gn-ticket-sheet__crumb--restricted` carries `var(--gn-restricted)`, while the no-callback arm carries the bare class, has **no rule of its own at all**, and inherits `var(--gn-text-muted)` from `.gn-ticket-sheet__crumbs`. **The inks stay different on purpose, so the remedy is the SENTENCE and not the CSS:** *"you cannot open this here"* and *"you may not see this"* are different facts, and this surface keeps them apart everywhere else — the finding itself offers both remedies and says plainly *"one of the two; not a sentence claiming both"*. The identical sentence in `Features.md` said *"it degrades to the same plain span"* and is corrected in the same change. **A case is still owed for a prose fix**, because a corrected sentence with nothing behind it drifts back, and the cheapest way to make the two arms the same span is to give the bare class the restricted modifier — which is exactly what the case reddens on: it asserts the bare rule's ABSENCE (an absence being the only way to see it) and that the two arms' inks differ. (Planted defect: a `.gn-ticket-sheet__crumb { color: var(--gn-restricted); }` rule added — P4's other remedy, taken literally — kills 1, *expected … not to match /^\.gn-ticket-sheet__crumb\s*\{/m*; `/tmp/ds3-T-P4-red.log`.) — `packages/app-core/src/views/ticket-sheet.tsx`, `Features.md`, `packages/app-core/test/views/ticket-sheet-crumb-css-binding.test.tsx`
## Release batch B07 — soft-delete integrity at the doors (2026-09-21, block `17.121`–`17.140`)
*The release plan's B07 (`docs/lanes/release-2026-09-22-plan.md` §6): round-2 findings E6-2, E6-4, E6-11 and
round-1 F2, F4, F5, all about one rule — a soft-deleted ticket "stops appearing in views" — reaching the
WRITE doors and the reads the Delete commit missed. E6-24, the replica's three unfiltered reads, is `12.399`
in §12 because that section owns the replica.*
- **17.121** ✅ **The ingest door refuses every ordinary write against a soft-deleted ticket, and `ticket.assigned`
  on one no longer manufactures an inbox notification pointing at a 404** (E6-2). One check ahead of
  `evaluateEvent`'s dispatch — `checkTicketLive` in `checks/deletion.ts`, where the flag was already read —
  refuses `deleted-ticket` ("This ticket is deleted; restore it first.") for an event filed against a ticket
  that RESOLVES and is deleted; the exempt five are enumerated with a reason each (`ticket.deleted`,
  `ticket.restored`, `ticket.created`, `claim.contested`, `claim.contested_resolved`), and a ticket that does
  not resolve passes through UNCHANGED, because the server commits `ticket.assigned` for a never-created ticket
  today and pins it (`DOOR_LEAVES_EXISTENCE_UNCHECKED`) — a second ruling this gate does not make. **Engine
  half** (`packages/rule-engine/test/live-ticket.test.ts`, 23 cases): the gated thirteen and the exempt five
  are asserted to be the WHOLE ticket-scoped vocabulary (read from `vocabulary.ts` as text, with the block
  count as its control), each gated type is refused on the deleted twin and passes the gate on the live twin
  in the same case, reachability through `evaluateEvent` for a type WITH a dispatch arm and one WITHOUT, a
  restore re-opening the door, an unknown ticket passing, a stranger kind passing. Witnessed by mutation
  (`if (false && …)` on the flag read → `Tests 14 failed | 9 passed (23)`, every kill at its own
  `deleted-ticket` assertion). **Door half** (`apps/server/test/integration/soft-deleted-writes.test.ts`,
  13 cases, through `POST /v1/events`): the finding's eight-event battery on the deleted twin refused
  `deleted-ticket` and on the live twin committed — or, for `ticket.closed`/`ticket.ranked`, met the
  workflow's own refusal, which pins that the gate is AHEAD of those rules rather than instead of them; the
  deleted head untouched while the live twin's writes landed; the peer's inbox and the `notifications` table
  holding an assignment for the live twin and none for the deleted one; a second delete still
  `already-deleted`; and after `ticket.restored` the same `ticket.assigned` commits AND its notification is
  delivered (the case waits for the fanout's row, which also drains it before the pool closes). RED before
  the gate: `Tests 10 failed | 3 passed (13)`; GREEN: `Tests 13 passed (13)`. `fanout.ts`'s premise paragraph
  now says what the door enforces; `notifications/sweep.ts` is named as a producer, not the inbox read. —
  (`packages/rule-engine/test/live-ticket.test.ts`, `apps/server/test/integration/soft-deleted-writes.test.ts`)
- **17.122** ✅ **A soft-deleted child is not open work: its parent closes over it, and a LIVE open sibling still
  blocks with the ordinary sentence** (E6-4, transition half). `transition.ts`'s parent-terminal count now
  carries `(child.deleted ?? null) === null` beside `stateCategory !== 'terminal'` — the live-only predicate
  the projection's reader hands its callers and this caller never took, so the refusal named a count every
  view reported as zero and, with no UI that emits `ticket.restored` past the undo toast, the parent could
  never be finished from the product. Engine (`packages/rule-engine/test/deleted-hierarchy.test.ts`): P with
  two open children, one deleted → refused "1 … is still open" (the live one, not the deleted one); both
  deleted → accepted; none deleted → "2 … are still open" (so the accept is the flag being read, not the
  invariant gone); deleted-then-restored counts again. Door
  (`apps/server/test/integration/soft-deleted-hierarchy.test.ts`, `POST /v1/events`): the finding's own
  sequence — create P/C, P → doing, delete C, `proj_tickets` counts 0 live open children, P → done COMMITS;
  control P2 with a live open child refused "1 … is still open"; the same P2 closes once that child is done.
  RED (engine): `Tests 4 failed | 2 passed (6)`, the count reading 2 for 1; RED (door): `Tests 3 failed | 1
  passed (4)`, P → done refused. GREEN: `6 passed (6)` / `4 passed (4)`. —
  (`packages/rule-engine/test/deleted-hierarchy.test.ts`, `apps/server/test/integration/soft-deleted-hierarchy.test.ts`)
- **17.123** ✅ **A soft-deleted ticket is not a parent: `ticket.created` under one and `ticket.reparented`
  onto one are refused `hierarchy.parent-deleted`, and the live twin takes the same child** (E6-4, hierarchy
  half). Both parent-resolution sites in `checks/hierarchy.ts` refuse after tenancy (`unknown-parent` still
  answers a foreign or absent id — there is no flag to read on nothing) and before anything about the
  parent's shape; ahead of `cross-project` on purpose, because "pick a parent from the same project" would
  send the actor after a ticket no view shows, and the ordering case pins it with the same foreign parent
  live (→ `cross-project`) and deleted (→ `parent-deleted`). Reason: "The chosen parent ticket is deleted.
  Restore it, or pick another parent." — not `unknown-parent`, whose sentence is false of a ticket that
  exists. A restored parent takes children again. Engine and door halves in the same two files as 17.122;
  the door half creates under / moves onto a deleted story (refused) and its live twin (committed), then
  restores one and creates under it. —
  (`packages/rule-engine/test/deleted-hierarchy.test.ts`, `apps/server/test/integration/soft-deleted-hierarchy.test.ts`)
- **17.124** ✅ **A contested claim on a soft-deleted ticket keeps its row and loses its title; the live
  contested sibling keeps both** (round-1 F4). `routes/my-work.ts` gates a contested claim's title on
  `row.deleted_at === null && (await canSee(…))`; 7.217 constrained the `canSee` half and nothing
  constrained the `deleted_at` half — the finding measured the full server suite byte-identical with it
  removed, and 16.90(b) recorded the gap with the owner "whoever next picks up the contested-claim
  surface". The fixture: two of the owner's own tickets, both contested, both titles read by VALUE before
  the delete; one soft-deleted (the projection's `deleted_at` read back before the route is asked); after,
  the deleted one's row is present with `title: null` and the live one is unchanged in the same answer —
  so `null` is the conjunct answering, not a route that joins no title. GREEN on first run (the conjunct is
  correct); RED by the finding's own mutation (`row.deleted_at === null &&` removed): `Tests 1 failed | 24
  passed (25)` at `expected 'Contested, then deleted' to be null`, restored from a copy and verified. Placed
  last in its file because a deleted ticket is absent from every group the cases above count. —
  (`apps/server/test/routes/my-work.test.ts`, "F4: the deleted ticket keeps its row and loses its title; the
  live sibling keeps both")
- **17.125** ✅ **The replica's two soft-delete gates — `getTickets`' `if ((state.deleted ?? null) !== null)
  continue;` and `getBoard`'s `(state.deleted ?? null) === null` conjunct — are witnessed by a deleted-ticket
  fixture, and each mutation the finding ran now reddens exactly its own case** (round-1 F5). The same world
  as `12.399` (two tasks in `doing`, assigned to the viewer, one then deleted, the fold proven before any
  read), asked at the two reads the Delete commit did write. GREEN on first run (the gates are correct);
  RED by mutation, one at a time, each restored from a copy: `if (false) continue;` → `Tests 1 failed | 5
  passed (6)` at the `getTickets` case; the board conjunct → `true,` → `Tests 1 failed | 5 passed (6)` at the
  `getBoard` case. The other publications of the survivor (the `soft-delete-background-paths.test.ts`
  docblock's (c), Features.md's invariant row, 16.90(c)) are updated in the same change set: cited by
  content, witnessed, owner line discharged; 16.90's marker flips 🟡 → ✅ with this case, its third part. —
  (`packages/app-core/test/replica/replica-deleted-reads.test.ts`, "F5: getTickets drops a soft-deleted
  ticket…", "F5: getBoard drops it…")
- **17.126** ✅ **The list's epic grouping no longer serves a soft-deleted epic's title as a group header:
  a deleted ancestor ends the walk exactly as an invisible one does, and its children fall to `no-epic`**
  (E6-11). `epicAncestors`' recursive member now carries `AND ${LIVE_TICKET_WHERE}` after the visibility
  hop — the seed term needs no copy, its rows are the page's own cards, already live-filtered — so the
  title never leaves the query. The list was the one door of four still serving the content: the detail
  door answers `restricted` for a deleted parent, the crumb withholds the title, search withholds it; and
  it served it in the group HEADER (`titleOfEpic`), not on the card, which carries only `epicId` — the
  residual note had that wrong too. The paragraph that called this "named, not decided" is retired: the
  cascade question (what happens to EXISTING children when a parent is deleted) stays open, but the title
  question was decided in the same commit at the neighbouring door. Through the real door with a LIVE
  epic and its child in the same project as the control: before the delete both epics head their groups
  by title; after, the live one is unchanged, the deleted one is no key and no label, the body carries the
  child but not the title, `no-epic` holds exactly the child, and the child's card keeps `parentId` (the
  boundary 7.80 pins) with `epicId: null`. RED: `Tests 1 failed | 36 passed (37)` at the body containing
  the title; GREEN: `37 passed (37)`. ⚠ **NOT decided here, and the same open question the walk's own
  docblock already files with the owner: whether a deleted (or invisible) ancestor should be a DISTINCT
  `restricted-epic` bucket rather than `no-epic` — the finding's remedy asks for it; it is a response
  shape Plan 5's contract pins.** —
  (`apps/server/test/routes/list.test.ts`, "E6-11: a deleted epic ends the walk like an invisible one —
  its children fall to `no-epic` and its title is nowhere in the body")
## Sign out that failed and read as success — cases `17.141`–`17.143` (E2-45, 2026-09-21)

**Why these cases are in §17.** Their subject is the nav's account menu, whose cases are §13
(`13.416`–`13.423`, in `13-neomorphism-and-workspace-screens.md`), but §13's blocks are spent and its tip
is shared across live lanes with no block held here; §17's table above carries this batch's allocation,
so the cases are minted from it.

**The defect.** `apps/web/src/account-menu.tsx:189-194` ran `close(false)` FIRST and then
`void authClient.signOut().then(() => { router.push('/sign-in'); })` — one callback, no rejection arm, and
the menu closed before the request was even sent. A sign-out that failed offlined, dropped its connection
or met a 5xx pushed nothing, rendered nothing, and **left the session live while the only visible change —
the menu closing — read as success.** `docs/manual.md:112-114` sells this exact control as what protects a
person on somebody else's machine (*"That matters if you have signed in on somebody else's laptop"*), so
silence here is the one outcome that sentence promises cannot happen.

**Two arms, because the transport fails two ways and they are different code paths.** `@better-fetch/fetch`
REJECTS when `fetch` itself throws (offline, a dropped connection) — only a second callback sees that — and
RESOLVES `{ data: null, error: { status, … } }` on a non-2xx ANSWER, so the `error` field has to be read.
The finding named both in one breath; the judge's note records that the 5xx member is the resolving arm
rather than the rejecting one, which is why the fix has two.

- **17.141** ✅ A sign-out the server REFUSED keeps the menu open, says the session is still signed in, and
  pushes nothing. — (`apps/web/test/app-nav.test.tsx`)
- **17.142** ✅ A sign-out that never reached a server says THAT instead — its own sentence, not the
  refusal's ("the server refused" is a claim about a server the request never reached) — and likewise
  keeps the menu open and pushes nothing. — (`apps/web/test/app-nav.test.tsx`)
- **17.143** ✅ **The positive control**, minted as its own case rather than folded in: a sign-out that
  SUCCEEDED still closes the menu and pushes `/sign-in`, and renders no refusal. Without it the two cases
  above would also pass on a control that never closes the menu and never navigates. —
  (`apps/web/test/app-nav.test.tsx`)

**What the fix does NOT claim.** The menu's refusal is a non-`menuitem` row inside `role="menu"`, which
already carried one (its name/email header) before this change; the shape is unchanged, not newly correct.
