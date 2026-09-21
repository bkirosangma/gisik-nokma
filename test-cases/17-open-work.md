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
| **release batch B09** (lane ds5) | **`17.061`–`17.080`** (allocated by the controller 2026-09-21 21:0x, recorded in the cycle-46 anchor PR on `main`) — **minted: `17.061`–`17.067` and `17.069`–`17.072`** (`17.068` deliberately unused: a control arm folded into `17.067`'s case rather than given its own id) |
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
