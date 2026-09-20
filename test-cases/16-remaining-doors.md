# §16 — the remaining doors

**Opened 2026-09-19 on the owner's ruling.** **`§13` IS CLOSED TO NEW IDS:** its remaining window is
`13.990`–`13.993`, `13.995`–`13.998` and `13.999`, and all of it sits inside executor 2's exhausted
block. **Nothing may be minted there, and nothing may be borrowed from it.**

**Why a new section rather than a wider pattern.** The next id after §13's window is four digits, and this
repo already documents `13.9999` — a user-agent pixel value — as a counting trap that has fooled a count
once before. Widening the id pattern to reach four digits would move that trap inside the guard instead of
leaving it outside, so the section was opened.

## THE BLOCKS — take from yours, never from the tip

| lane | block |
|---|---|
| **exec 1** | `16.1`–`16.30`, **then `16.32`–`16.40`** (taken 2026-09-19 late for `/v1/search`), **then `16.61`–`16.80`** (taken 2026-09-20 for `hig-per-screen/3b`), **then `16.81`–`16.99`** (taken 2026-09-20 for the sheet prototype parity) — of which **`16.96`–`16.99` are MINTED 2026-09-20 for the attachments leak** and **`16.91`–`16.95` are MINTED 2026-09-20 for the Add-subtask affordance**. ⚠ **THE BLOCK `16.81`–`16.99` IS NOW FULLY SPENT**; exec 1's next free ids are `16.63`–`16.80` (the `3b` allocation, of which only `16.61`–`16.62` are minted) |
| **exec 2** | **`16.41`–`16.60`**, **then `16.76`–`16.80`** (allocated by the controller 2026-09-21 for the markdown-editing item — ⚠ **carved out of the `16.63`–`16.80` slice the exec 1 row above still names, because the controller reallocated it in a message. That row is corrected by this one; both were re-read before minting, which is the discipline this table's own warning below asks for**; it is the unminted remainder of `16.72`–`16.80` after `#617` spent `16.72`–`16.75` on the comment thread) — ⚠ **`16.88`–`16.90` were minted from exec 1's block by the soft-delete lane on 2026-09-20, and its merged handoff records `16.88`–`16.99` as THAT lane's block**, which overlaps exec 1's. **The controller corrected the spent set (exec 1's next free is `16.91`); the OVERLAP is flagged to the owner, not resolved here.** It is why the attachments lane minted from the TOP of the shared block instead of `16.91`: `16.91` is inside both claims and is the one id that can collide, and `exec2/comment-thread` was live in the tree at the time |

**⚠ THIS TABLE IS THE ALLOCATION, AND IT EXPIRES.** It read `exec 2: 16.31–16.60` for about forty
minutes on 2026-09-19 and was wrong for that whole time, because the controller reallocated in a message
rather than in this file — **and a table a minting session trusts is exactly the artifact that must not
be corrected only in prose elsewhere.** A number is a reading; a block lasts longer; **a block still
expires when the controller reallocates.** Re-read it before minting, and **if your own allocation
changes, change it HERE in the same action** — not only in a handoff, a queue note or a message.

**When your block is empty, STOP AND ASK.** Do not mint from the tip and do not borrow a neighbour's —
that is the rule whose breach made §13 go red twice.

## The id shape is `16.N`, with NO zero padding

`16.1`, `16.2`, … `16.30`. **Do not reintroduce the `{3}` width** that §13 used: that width existed to
stop `13.99` sorting above `13.649`, and ids here are not padded, so importing it would be the truncation
trap in a new costume. ⚠ **READ THE SCOPE WORD THAT WAS MISSING FROM THIS SENTENCE (added 2026-09-20,
executor 1, on cycle 29 §3):** the trap it names is **MIXING two widths inside ONE section** — `16.100`
sorting below `16.99` — and it is **NOT a prohibition on padding as such**. Beside a padded `17.NNN` this
read as forbidding §17's shape, and it does not. **§13 is the proof a uniform width works:** it ran
`13.001`–`13.999` and minted 882 ids with no sort trap.

## §17's SHAPE — ruled by the owner 2026-09-20 (cycle 29), recorded here because THIS file, not the controller's, is what a minting session trusts

**§17 is uniformly 3-digit padded: `17.001`–`17.999`, ceiling 999.** §16's own minted ids stay unpadded
and are NOT renumbered — 76 of them are merged, so padding is not retro-fittable. **The rule is therefore
one width per section, and the widening that matters is the one WITHIN a section.** §17's block table row
is the controller's to write, under the standing grant, when §16's window is spent.

## ⚠ THREE SPELLINGS `check-case-ids` CANNOT SEE — write cases as id LINES

The guard counts **id LINES** and nothing else. All three of the following are invisible to it, each
measured on 2026-09-19:

- a case written as a markdown **table row**;
- a case written under a **`##` heading**, with the id appearing only in prose;
- a **backticked** id inside the bold — ``- ✅ **`13.989` — …`` — which *looks* exactly like a proper id
  line, because the matcher demands a digit after the asterisks and the backtick stops it at the first
  character.

**So write cases as `- **16.N** ✅ …` lines**, and after adding any, **confirm the `check-case-ids` count
moved by exactly the number you added**. A green `ok` is not evidence that the guard saw them: twelve
cases written as a table left the sweep at 2433, unchanged, and reporting `ok`.

## The evidence upload — the rule that permanently blocked a move (executor 2, 2026-09-19)

**Owner's ruling: build it.** Dispatch `CTL-DISPATCH-2026-09-19-evidence-upload.md`. **This one was a
DEFECT rather than a gap:** `require-evidence` is authorable from a shipped screen
(`add-rule-menu.tsx:6-11`), the engine enforces it, and **no surface in the product could satisfy it** —
so an admin could configure a move that nobody, ever, could make. The dialog's own fallback said so:
*"Evidence upload is not available in this build yet."*
**Id `16.31`**, from this lane's block `13.988`–`13.999` (`13.988` = E, `13.989` = the description PR).
Swept in one invocation with `13.989` as its control.

### THE DOOR, MEASURED FIRST — and it is `SERVER EXISTS → SURFACE` for the THIRD task running

1. **What the rule reads:** `evaluateRequireEvidence` reads `input.payload.evidenceAttachmentId` and
   refuses when it is blank (`packages/rule-engine/src/rules/require-evidence.ts:9-15`).
2. **The payload field already existed.** `ticketTransitionedPayloadSchema` carries it
   (`packages/domain/src/workflow.ts:186`), the sheet already forwards it (`ticket-sheet.tsx`), and the
   dialog already sets it (`transition-dialog.tsx:377`). **⚠ This citation read `:270` until independent
   review re-measured it: the line moved by this very change, and the pointer resolved to
   `cancelled = true;`. A stale citation still RESOLVES, so a reader is misled rather than corrected.**
3. **⚠ THE DEAD END WAS ONE `undefined`.** `transition-dialog.tsx` renders the file input when
   `uploadEvidence !== undefined` and the dead-end sentence when it is not — **the whole upload path was
   already built.** The web simply never passed the prop, exactly as it never passed `editorSlot`.
4. **And the door to upload to already ships:** `POST /v1/attachments`, with its one client
   `uploadAttachmentHttp(file, ticketId)` (`packages/editor/src/upload.ts:44` — the ONLY caller of that
   route anywhere in the product). **No route was added.**
5. **The server's EVIDENCE GATE settles what "evidence" means:** `gates/evidence-gate.ts:44-50` admits an
   upload only when `attachments.id = $1 AND ticket_id = $2` — the id **and the ticket**. So a real
   `attachments` row is required and **an `attachment.added` ledger claim is not**; and an uploader that
   named the wrong ticket would not merely mis-file the bytes, it would refuse the very move it was meant
   to unblock.

### ⚠ TWO THINGS THE DISPATCH DID NOT NAME

- **`BoardMoveCapability.uploadEvidence` could not carry the ticket.** `Board` is mounted for the whole
  board and holds ONE capability object for every card, so it cannot close over "the ticket" the way
  `TicketSheet` can. The prop is widened to `(file, ticketId)` and `MoveArrows` binds each card's own id.
  **The board's arrows open the SAME dialog**, so fixing only the sheet would have left a second dead end
  standing.
- **The upload could now FAIL, and nothing said so.** `transition-dialog.tsx`'s handler was
  `void uploadEvidence(file).then(…)` with **no `.catch`** — unreachable while no caller supplied an
  uploader, and reachable the moment one did. A file over the ceiling would have left a rejected promise
  nobody handled and a Move button disabled with no sentence beside it. Now caught, and split the way
  Ruling 27 splits every other outcome in that dialog: **the server refusing to store the bytes** gets
  `--server`'s tone in the server's own words, **nothing reaching a server** gets `--transport`'s.

### The cases

- **16.31** ✅ **the page supplies an uploader, so the dead end is GONE.**
  `apps/web/test/evidence-upload.test.tsx`, rendering the **REAL** page, opening a **REAL** ticket,
  driving the **REAL** dialog. Its first assertion is an **ABSENCE** — the dead-end sentence is not on the
  page — and the second follows the upload to the **shipped door**: `/v1/attachments`, `POST`, and a
  form carrying **`ticketId` = the ticket the sheet is open on**. **Mutation-witnessed:** deleting the
  prop from the page reddens both arms.
- ✅ **`3.72`'s SIX new arms** — `packages/app-core/test/views/transition-dialog.test.tsx`, every one of
  them named `16.31` so a grep for the case finds all of its witnesses. **Three were added in the first
  pass**: a refused upload states the server's reason and keeps the move blocked; an upload that never
  reached a server says that instead and never claims a verdict (**mutation-witnessed:** deleting the
  `.catch` reddens both); and **evidence attached for one move does not satisfy another**
  (**mutation-witnessed:** deleting the `[toStateId]` reset reddens it). **Three more were added by the
  review round**, each one a hole the first pass left: an upload **still in flight** when the destination
  changes must not re-arm the new move (deleting the attempt token reddens it); the instant check
  **re-asks once evidence lands**, instead of printing a refusal beside the button it contradicts
  (dropping the id from the `precheck` call reddens it); and **closing and reopening drops the
  evidence**, rather than re-arming it invisibly behind an empty file input (deleting the `!open` effect
  reddens it). Files restored byte-identical, sha printed before and after, on every mutation.

#### ⚠ Why the dialog's own suite could not have caught the defect

`transition-dialog.test.tsx` already covered **both** branches — the dead end when `uploadEvidence` is
`undefined`, and the working path when it is supplied — and **both were green while the defect was live**,
because the working path was proven against a `vi.fn()` stub. *A mocked contract is the thing that
excuses the server from existing.* The new `apps/web` case is deliberately at the CALL SITE, which is the
only place this defect was ever visible.

### What is NOT covered, named rather than implied

- **`attachment.added` is not emitted for an evidence upload.** The gate does not require it (it queries
  the `attachments` table), so the move succeeds — but the file will not appear in the ticket's
  attachment list, which is built from `attachment.added` history. **That list is one of the two gaps the
  dispatch keeps open**, so this is the known `attachments` gap rather than a new one — recorded, with an
  owner: whoever wires the sheet's `attachments` prop should decide whether an evidence upload should also
  be claimed.
- **No browser run.** The dispatch asks for one; a routed `/p/:projectId?ticket=` needs a real session
  this lane cannot reach. The `apps/web` case drives the real components in jsdom, which has **no layout
  engine** — it cannot tell a rendered control from one drawn into nothing.
- **The Drive-reference refusal is not exercised.** The gate refuses a Drive reference as evidence
  (`attachment.evidence-drive-reference`); the transition dialog offers a plain file input, so no Drive
  reference can reach it from here.
- **⚠ THE IN-APP MANUAL NOW DESCRIBES A CONTROL THE PHONE DOES NOT HAVE.** The manual and FAQ are
  compiled once (`packages/app-core/src/help/content.generated.ts`) and **rendered by mobile too**
  (`apps/mobile/src/screens/help-screen.tsx`) — but `apps/mobile/src/screens/ticket-screen.tsx` has no
  move control at all. So *"The person moving the job picks the file on the job screen"* is true on the
  web and unreachable on the phone, where the sentence it replaced (*"It does not work"*) was true
  everywhere. **Found by independent review, recorded rather than fixed:** the fix is a platform
  qualifier in the help text, and the help system has no per-platform variant today — that is a bigger
  decision than this task. **Owner: whoever next touches the help content's platform story.**
## Door D — naming a connection (executor 1, 2026-09-19) — cases `16.1`–`16.14`

**The door.** `isMcpTokens`' row carries a NAME. The prototype leads each row with one —
`Claude Desktop — Anjali`, `CI — ticket sync` (`McpTokens.dc.html:100-112`) — over a second line of the
token's own facts. Ours listed only the approval date, so a person with three connections saw three
dates. The ruled-out issue-time flow is **not required**: a name is set ABOUT a token already held, so
this is a `migration` (`mcp_tokens.name`) plus a new owner-scoped write.

**`null` is NOT NAMED, and it is not `''`** — the same distinction `proj_projects.description` draws.
Every token minted before this column existed is unnamed in exactly that sense, and the row draws
NOTHING where a name would go rather than a blank line that reads as a name of zero length.

**⚠ The write is a `PUT` on the path the DELETE already owns, and that is the CSRF story.** The route-URL
matcher in `http-origin.ts` is **path-keyed with no method in the key**, so `/v1/me/mcp-tokens/:id` was
already protected and this route is covered **by construction** — no new entry, nothing to remember.
`16.5` asserts it with a forged-`Origin` write rather than by reading the set. `PUT` rather than `PATCH`
because `HttpClient` carries no `patch` and six files in the repo satisfy its shape; widening that
interface for one route was out of this row's scope.

- **16.1** ✅ A freshly minted token is NOT NAMED: the key is present and `null`, never `''`.
- **16.2** ✅ Naming sticks, and the LIST reads it back — the row is observed by re-reading, never by the client editing its own copy.
- **16.3** ✅ Refuses a blank, a spaces-only and a 61-character name with one fixed body; accepts exactly 60; and a refused write leaves the row unnamed.
- **16.4** ✅ The SAME 404 for a token that is not yours and one that never existed — identical bodies, and the refused write leaves the real owner's name alone.
- **16.5** ✅ CSRF-protected by construction: a forged-`Origin` write is refused, writes nothing, and the same write bearer-authenticated succeeds.
- **16.6** ✅ Needs a session, and the refusal writes nothing.
- **16.7** ✅ Naming changes the NAME and nothing else the row states — `createdAt` and `lastUsedAt` are untouched, since a rename is not a use.
- **16.8** ✅ Naming your own token names no other person's.
- **16.9** ✅ A named token still never returns the credential — a write path is a new chance for it to leak.
- **16.10** ✅ The row draws the name when there is one.
- **16.11** ✅ A connection nobody named draws NO name element at all — not an empty one — and its control says `Name`.
- **16.12** ✅ The control sends the draft AS TYPED, addressed to that row's id, and the list is re-read.
- **16.13** ✅ A refused name keeps the editor OPEN and shows the server's own sentence, so a fixable refusal does not discard the draft.
- **16.14** ✅ Cancel closes the editor and sends the server NOTHING — not merely "the editor closed".

**Mutation witnesses, run and recorded rather than predicted.** Defeating the UPDATE's tenant clause
(`user_id = $2` → `(user_id = $2 OR true)`, which keeps the parameter USED so the failure is the
property and not a 500) reddens **16.4 alone**, with `expected 204 to be 404` — A renamed B's token.
Collapsing `name: r.name` to `name: r.name ?? ''` reddens **16.1** with `expected '' to be null`.

### What is NOT covered

- **The CSS is a judgement, not a measurement.** jsdom loads no stylesheet, so nothing here shows that the name's 600 weight, its place above the dates, or the inline editor's wrap RENDER as drawn.
- **The accessible-name baseline was NOT re-run.** The row's naming control carries an `aria-label` naming the connection (`Name the connection approved 8 Sept 2026`) because a column of identical `Rename` buttons tells a screen-reader user nothing about which renames what. That baseline is generated from a live `e2e-stack` run, so this is a PREDICTION that it moves, not a measurement — and two connections approved on the SAME day are the one pair the label cannot separate, which is stated rather than hidden.

## Door F — the SUBTASKS section (executor 1, 2026-09-19) — cases `16.15`–`16.22`

**The door.** Our sheet drew only a COUNT (`2 of 4 done`, `formatRollup`). The prototype draws a section:
a heading carrying the count, the children, an empty state, and an add row (`desktop.dc.html:1238-1265`).

**⚠ THE QUEUE'S OWN QUESTION, ANSWERED BY MEASUREMENT: this is a SURFACE, not an architecture task.**
*"If a subtask is a ticket in our model too, this is a surface over data we already have; if not, it is an
architecture question."* **A subtask IS a ticket:** `TicketState.parentId` (`ticket-state.ts:139`) with a
`ticket.reparented` fold (`:284`), served as `parentId: string | null` (`view-types.ts:266`), read into
cards (`ticket-cards.ts:175`), and already rolled up as a count (`ticket-sheet.tsx`, `formatRollup`).

**And the prop is honest, which was the measurement that decided it.** Children are DERIVED from the list
read the client already makes, and three things had to hold before that was safe — all three measured:
the read **walks the server's cursor to exhaustion** (no single-page loss); the call passes an **EMPTY
`FilterSpec`**, which means "all" and so cannot exclude a closed child; and past `LIST_ROW_CAP` (2000
rows) it **throws `ServingGapError`** — *"never 'we happened to stop'"* — so a project too large to read
completely REFUSES rather than returning a short list. **No route, no migration:** `ticket.created`
already carries `parentId` (`packages/domain/src/events/ticket-events.ts:44`).

**⚠ AND A SECOND, INDEPENDENT GUARD.** The server already sends the number — `rollup.totalChildren` counts
them all and `restrictedCount` names the ones this viewer may not see — so the derivation is RECONCILED
against it on every render, and a disagreement is **said** rather than drawn. `16.17` is what makes that
falsifiable; `16.18` is its control, without which a section that refused everything would pass.

- **16.15** ✅ Lists this ticket's children, **each with its OWN state** — the empty state's claim ("a subtask is a ticket of its own") asserted in structure, not just in words. **And the ROW is read as a row** — `textContent` exactly `Order the brochures · To do`. The first version of this case did not, and that is the whole of the defect below: it queried each span's own text, so it passed while the row rendered `Order the brochuresTo do`. Two adjacent inline spans with no text between them are ONE RUN OF GLYPHS on screen and in the accessible name, and nothing in the case read the row as anything but two independent strings. **Found by the controller's browser pass on 2026-09-20** (`HSN codes for the real catalogueWaiting`); removing the separator now reddens this case with the defect itself in the message (`expected 'Order the brochuresTo do' to be 'Order the brochures · To do'`). **The treatment is TEXT rather than a CSS gap, deliberately**: this section declares no stylesheet rule at all and jsdom has no layout engine, so a gap would have been UNMEASURABLE — the unverifiable fix and the defect are the same shape.
- **16.16** ✅ The empty state draws the prototype's sentence, verbatim, when `rollup` is null (the server's own spelling for "no children at all").
- **16.17** ✅ **Refuses to render a short list:** when the rollup counts more children than were read, the section says so in the server's numbers and **draws no rows**.
- **16.18** ✅ The control for 16.17 — with the count AGREEING, the list IS drawn and no refusal appears.
- **16.19** ✅ Lists **only this ticket's** children: a sibling's child in the same project is not one of them.
- **16.20** ✅ **Add subtask** sends `ticket.created` with **this ticket as `parentId`**, the title **as typed**, and `start: 'focus'` — the prototype births a subtask in the workflow's first state (`col: states[0].key`).
- **16.21** ✅ A refused title shows the **server's own sentence** and **keeps** what was typed. An `invalid` answer carries `message`, not `reason` — reading the wrong arm renders `undefined`.
- **16.22** ✅ **DRAWS the prototype's `Subtask of {parent}` chip — FLIPPED 2026-09-20.** The superseded claim is kept beside it because it is why the flip is a decision rather than a drift: *"Does **not** draw the prototype's `Subtask of {parent}` chip — out of the dispatch's row, and this case exists so adding it later is a decision rather than a drift."* The owner ruled it IN and the same id now records the decision. The owner ruled it IN, and the same id now records the decision, updated rather than deleted, which is exactly what a negative witness exists for. It also carries the OTHER ARM of the same property: a ticket with NO parent draws no chip at all, so "the chip appears exactly when there is a parent" is one assertion rather than a presence test a root ticket would also satisfy.

**Mutation witnesses, run and recorded rather than predicted.** Defeating the reconciliation
(`subtasksIncomplete = false && …`) reddens **16.17 alone**. Dropping the parent from the add payload
(`parentId: null`) reddens **16.20 alone**, on the payload comparison.

**⚠ A defect the cases found, recorded because it is a live trap in this file.** The subtasks live query
was first keyed `${ticketId}:subtasks`, which registers on the first render — while the ticket read is
still null — runs once, answers `[]`, and **never re-runs**, because nothing in the key changes when the
ticket arrives. Four cases caught it (they passed children in and the section listed none). The fix keys
on the **project id**, which only exists once the ticket has landed — the same dodge the workflow query
one screen up makes with `workflowId@version`.

### What is NOT covered

- **The CSS is not measured.** jsdom loads no stylesheet, so nothing here shows that the section's heading, list or add row RENDER as the prototype draws them.
- **The `Subtask of {parent}` chip is out of scope**, not tested and not built — see `16.22`, which asserted its ABSENCE rather than its behaviour — **UNTIL 2026-09-20, when the chip was ruled in and built; its behaviours are `16.38`–`16.40` below, and `16.22` flipped to assert its presence.**
- **The paste/move of a child between parents is not covered.** `ticket.reparented` exists and moves `parentId`, but nothing in this row changes a child's parent, so `16.19`'s filter is asserted for the CREATE path only.

## Door G — Priority, Due and Type as rows (executor 1, 2026-09-19) — cases `16.23`–`16.30`

**The classification came first, and it is the deliverable the dispatch demanded.** The queue's row G
warns this is *"a difference in what the sheet CLAIMS TO BE, not just layout"*, and asks which of the
three are domain concepts, which are conventions, and which would need new schema. **Measured, not
inferred from the prototype:**

| field | bucket | evidence |
|---|---|---|
| **Type** | a **DOMAIN CONCEPT** | `TicketState.typeId` (`entity-state.ts:29`). Its NAME is not on the ticket; it comes from the ladder the sheet now reads — `getTicketTypes(workspaceId)` (`data-source.ts:147`), which already ships. |
| **Due** | a **DOMAIN CONCEPT** and a **BUILT-IN field** | `ticket-events.ts:66`: *"built-ins title/description/dueDate/startDate ride this same event"*. Typed `{date, note?}`, own schema, on `WorkItem` as `{date, claim} \| null`, and in `DEFAULT_LIST_COLUMNS`. Read through `dateClaimOf`, the declared single source of dates. |
| **Priority** | **NEITHER — a CUSTOM-FIELD CONVENTION** | **Zero hits for `priority` in `packages/domain`**, against 9 files for `assignee` and 6 for `dueDate` in the same run. No new schema is needed (the `ticket.field_set` mechanism carries it), but it exists only when a ticket's TYPE declares such a field. |

**⛔ No migration, no route, no new schema** — so nothing here was a stop-and-ask.

**⚠ And two of the prototype's three are EDITORS there, which is a separate door.**
`desktop.dc.html:1192-1205` draws Priority as a segmented control whose options carry `on-click`
handlers, and Due as an `<input type="date">` **with a note line**; only Type is read-only
(`<span>{{ sheetType }}</span>`). The dispatch's scope is *the three ROWS … not editing them*, so
**this is the read half** and the editors are named as an unbuilt door. `16.29` asserts the read-only
half, the same way `16.22` ASSERTED F's chip absence.

- **16.23** ✅ All three rows are drawn **ALWAYS**, even on a ticket claiming none of them — the state this task exists to end. Each absence carries its own sentence.
- **16.24** ✅ Due renders the claimed day **and** its claim line — a value is never a standing property, the rule every other row on this sheet keeps.
- **16.25** ✅ Type renders the **NAME from the workspace ladder**, not the raw id.
- **16.26** ✅ Type **falls back to the id** when the ladder does not hold it — the control for 16.25, without which a hard-coded name would pass.
- **16.27** ✅ Priority renders the claim when the ticket carries one: it is a CONVENTION, so the claimed case arrives by the ticket carrying the field, exactly as a custom field would.
- **16.28** ✅ **No second row for a field that now has its own** — `dueDate` is skipped by the generic field loop, so one claim is not drawn twice.
- **16.29** ✅ The three rows are **READ-ONLY**: no `input`, `select` or `button` inside any of them.
- **16.30** ✅ They are drawn in the prototype's **order** — Assignee, Priority, Due, Type — compared by document position, not by markup index.

**Mutation witnesses, run and recorded rather than predicted.** Dropping `dueDate` from the generic
loop's exclusion reddens **16.28 alone** (a second row for one claim). Removing the Type row's `??
state.typeId` fallback reddens **16.26 alone** — the row renders an empty span, which is what the
ladder-miss case would look like undetected.

**⚠ The absent copy is the prototype's own.** `No date claimed` is transcribed
(`desktop.dc.html:2362`/`:2853`/`:3587`); `No priority claimed` is the same construction for the field
the prototype always has and we often do not — worded to be TRUE of a ticket whose type declares no such
field, rather than "none", which would be a claim about a field the type does not have.

**⚠ And the claim line uses the sheet's OWN wording.** The first draft said `claimed by …`; every other
field row on this sheet says `set by …`, and one surface with two provenance phrasings is the drift this
file's claim-line comment exists to prevent. The ABSENT copy stays the prototype's, because that
sentence is about the DATE and the claim line is about the ACTOR.

### What is NOT covered

- **The two editors are NOT built.** Priority and Due are read-only rows here; making them editable — Priority as a segmented control, Due as a date input with its note line — is a separate door, named and not taken. `16.29` asserts the absence rather than describing it.
- **The CSS is not measured.** jsdom loads no stylesheet.
- **`pendingFieldIds` is empty.** `ClientStateCache` exposes no pending surface (measured), so the Due row does not badge an in-flight claim. The sheet's other field rows do not badge one either — this is stated because an empty list is a value, not a placeholder.
## Door — `/v1/search`: `matchedIn` becomes derivable (executor 1, 2026-09-19) — cases `16.32`–`16.37`

**The owner's ruling, verbatim: _change the query so `matchedIn` is derivable._**

**The door.** `GET /v1/search` squashed three columns into one headline —
`ts_headline(cfg, s.title || ' — ' || s.description || ' — ' || s.comments, …) AS snippet` — so **which field
matched was not recoverable**, and the client REFUSED the answer rather than invent it
(`mapSearchHits(_raw): never`, registered in `SERVING_GAPS`). **⚠ And the distinction was in the data all
along:** `proj_search` stores the three columns separately and its generated `tsv` already weights them apart
(`setweight(… 'A') || setweight(… 'B') || setweight(… 'C')`). **No column, no migration — the SELECT was
throwing away what the projection had kept.**

**The derivation, and why this one:** **one `@@` per column, in a `CASE`.** Three `ts_headline` calls would
answer the same question at three times the cost and three ways for the snippet to disagree with the field;
one predicate per column asks exactly "did THIS column match" and nothing else. `setweight(…) @@ q` is
equivalent to `to_tsvector(…) @@ q` — weights affect RANKING, never MATCHING — so the three predicates
partition the very vector the `WHERE` already tested, and `ELSE` is a floor rather than a case (`16.37`).

**⚠ `matchedIn` IS ONE VALUE, SO THE PRECEDENCE IS A DECISION: title → description → comment.** That is the
order the weights already imply (A, B, C), and it is stated in the `CASE` so it is a rule rather than an
accident of how the expression was written. `16.34` and `16.35` measure both rungs.

**⚠ AND THE SNIPPET IS STILL COMBINED — deliberately.** Narrowing the headline to the matched column would
have been the easy way to make `matchedIn` "obvious", and it strips a comment's words out of the window,
which is the feature's reason to exist: a comment is where people put what they would not put in a title.
`16.36` is the case that would redden if someone narrowed it.

- **16.32** ✅ A description-only match answers `description` — and the word is in **no title anywhere**, so a constant answer fails it.
- **16.33** ✅ **The derivation is PER ROW**: one `quokka` query answers `title` for one hit and `comment` for another, in one run.
- **16.34** ✅ **PRECEDENCE rung one**: a ticket matching in TITLE **and** DESCRIPTION answers `title`.
- **16.35** ✅ **PRECEDENCE rung two**: a ticket matching in DESCRIPTION **and** COMMENT answers `description`.
- **16.36** ✅ **The snippet stays COMBINED**: a comment match still shows its comment's words, and a title match its own.
- **16.37** ✅ **The partition has no gap**: every hit of a broad query carries a value from the closed union, and all of them are `title` for a title-indexed word.

**Mutation witnesses, run and recorded rather than predicted.** Inverting the `CASE`'s precedence reddens
**16.34 alone** (`expected 'description' to be 'title'`). Making the answer a constant reddens **16.32, 16.33
and 16.35** — exactly the three cases that name a non-title column — while `16.34`, `16.36` and `16.37`
correctly stay green, because a constant `'title'` satisfies them.

**⚠ TWO EXISTING CASES WERE INVERTED RATHER THAN DELETED** (7.189's rule, which this repo applies): the app
core unit case `3.39` (*"search refuses, naming 1 absent fact"*) and the server contract case
(*"DATA GAP — `matchedIn` is on no hit"*). Both read the opposite way and now assert the field ARRIVES —
**and `3.39`'s register assertion became `[]`, because `search` was the last entry in `SERVING_GAPS`.** No
new ids were minted for that half: the property is `matchedIn` being served, and it is asserted where it was
already asserted.

**⚠ AND THE DOMAIN'S OWN `SearchHit` WAS MISSING THE FIELD.** `read-models.ts` declared
`{card, snippet}` — so the route would have served a key its own wire type did not name. **TypeScript did not
catch it**: `rows.map(…)` is not a fresh object literal in that position, so no excess-property check
applied. Declaring the field there is what made the compiler check the route's value, and typing the SQL
column as the union is what made the two agree.

### What is NOT covered

- **The client's presentation of a hit is not built.** This change makes the fact DERIVABLE and maps it; no view renders a search result yet, so nothing here shows `matchedIn` on a screen.
- **`description` and `comment` precedence is asserted through the two planted fixtures only** — a ticket matching all THREE columns is not in the seed, and the first rung's answer implies the third.

## The `Subtask of {parent}` chip (executor 1, 2026-09-20) — cases `16.38`–`16.40`

**The door, and it is F's inverse.** F lists a ticket's CHILDREN; this names a ticket's PARENT and offers
the way to it — `desktop.dc.html@6d7b67c0a52c:1237-1241`, a pill beside the section heading, drawn only
when the sheet's ticket is itself a subtask (`sheetIsSub`, `:3605`). **Owner ruling, relayed by the
controller: _"Door F's `Subtask of {parent}` chip — in."_**

**No route, no migration.** `ticketRead.parent` already carries `{kind, id, title}` for a parent the
viewer may see (`:144-168` at the read door). What the SHELL adds is the parent's PROJECT: `ParentRef`
carries none, so the chip cannot build a sheet URL itself, and a parent may sit in ANOTHER project
(6.57). The page asks the shipped `TicketLocator` — the same question the inbox asks — and answers
`null` honestly when the server will not place the ticket.

**⚠ ONE HOP, stated rather than accidental.** The prototype's `openParent` swaps the open sheet in place
(`:3611`), so the chip names the IMMEDIATE parent and a chain is walked one sheet per click. No traversal
lives in the chip, so no cycle is reachable.

- **16.38** ✅ Names the parent and **opens it** — and is a control **ONLY when it can be honoured**: with `onOpenTicket` a `BUTTON` carrying the immediate parent's id, without it the same label as a `SPAN`. A button that would do nothing is the failure the second arm exists to avoid.
- **16.39** ✅ **One hop** — exactly one chip, labelled with the immediate parent's title EXACTLY. A chain would have to append a second name and there is no second chip to append it with.
- **16.40** ✅ **A restricted parent wears a NON-CONTROL pill** — `Subtask of a restricted parent`, a `SPAN`, and the parent's id nowhere in the body. It cannot be the prototype's chip for three structural reasons: the read's restricted arm carries no title (`apps/server/src/routes/tickets.ts:144-168`), the title is read INSIDE the `canSee` branch that arm never reaches (`apps/server/src/routes/tickets.ts:353-372`) — the real reason, and **not** 6.66's "no table stores a ticket title", which is stale now that `proj_tickets` exists — and the prototype's own fallback — `p ? p.title : sheet.parentId` (`:3609`) — would print an ID where a name belongs.

**Mutation witnesses, run and recorded:** removing the restricted arm reddens **16.40 alone**; making the
label a constant reddens **16.38 and 16.39**; making the control open nothing reddens **16.38**; drawing a
chip for a ROOT ticket reddens **16.22**.

**⚠ THE LABEL WITNESS NAMES ITS ARM, AND THAT IS A CORRECTION.** The line above first read *"making the
label a constant reddens 16.38 and 16.39"* without saying WHICH of the chip's two label occurrences was
mutated. The independent review mutated the same sentence in the other arm, reddened **four** tests
(`16.22` among them, since that case asserts the span arm's label), and read the difference as an error in
this record. Both measurements are right; the record was ambiguous. **A witness is a fact about ONE
specific mutation, not about a sentence.**

**Two mutations the review round ADDED, and one green that is CORRECT.** Making the restricted arm render
`{parent.id}` — the prototype's own fallback — reddens **16.40** *and* the pre-existing planted-defect
case that asserts the parent's id is absent from the body, so **the leak guard can fail**; dropping the
state from a subtask row reddens **16.15**; and moving the separator INSIDE the title span stays **green**,
correctly — the row's text and its accessible name are byte-identical either way, so green is the right
answer there rather than a blind spot.

**The review round's five findings, all applied BEFORE the PR opened:** the stale authority (this section's
`16.40` cited 6.66's *"no table stores a ticket title"*, true when written and false since `proj_tickets`
landed — the real reason is the `canSee` gate, and the authorities are `7.212` and `6.14`); the CSS comment
that falsified itself (it said `subtask` appears in NO rule, in the commit that added the first three); this
bullet's lead, which opened with the claim the flip superseded; **two `it`s sharing one id** (`16.38` twice,
invisible to `check-case-ids`, which counts catalogue lines — one case, one id, one test); and the flex row's
citation, off by one at `:1237` rather than `:1238`.

**⚠ AND THE SECTION'S OWN SEPARATOR DEFECT, found by the controller's browser pass and fixed here.**
`16.15`'s rows rendered `Order the brochuresTo do` until 2026-09-20 — two adjacent inline spans with no
text between them — and the controller saw `HSN codes for the real catalogueWaiting` in a browser. **The
case passed because it queried each span's own text; nothing read the row as a row.** It now does, and
removing the separator reddens it with the defect itself in the message. **The fix is TEXT rather than a
CSS gap on purpose**: this section declares no stylesheet rule at all and jsdom has no layout engine, so
a gap would have been unmeasurable — an unverifiable fix and the defect are the same shape.

## The inbox's bulk action and its Undo — one route, both directions (executor 2, 2026-09-20)

**Owner's ruling: option A — ONE bidirectional bulk route, id-scoped, bounded to the list page's own
size; Undo surface = a shared `packages/ui` toast; dismissal after 15 seconds; a non-id-scoped "mark all
read" stays OUT of scope.** Dispatch `CTL-DISPATCH-2026-09-19-c-inbox-bulk-undo.md`.

### THE DOOR WAS MEASURED FIRST, AND IT NEEDED A WRITE THAT DID NOT EXIST

`owner-holds.md:69` rules **"bulk + Undo"** BUILD with door `NEW ROUTE` + CSRF registration — ONE route —
and separately records that `markRead` is one-way with no unread door. **An honest Undo needs an unread
WRITE**, and the row did not name one. Measured with the control in the same invocation: the sweep for the
write shape `SET read` finds **exactly one** hit (`store.ts:145`, so the sweep can see writes), and the
sweep for `SET read = false` in any spelling finds **none**. The prototype's Undo proves nothing about
ours — it is a pure CLIENT snapshot restore (`desktop.dc.html:3029`) and the prototype has no server.

- **16.41** ✅ — **the bulk write, at the route and at the call site.** `POST /v1/me/notifications/read`,
  `{ ids, read }` → `{ changed }`. **The property every arm is built around: the Undo must un-read exactly
  what the forward call CHANGED, not what it asked about.** The route suite
  (`apps/server/test/routes/notifications.test.ts`) covers the changed-set, the other-caller's-row
  indistinguishability, the round trip, the bound, and the malformed bodies; the page suite
  (`apps/web/test/inbox-bulk.test.tsx`) drives the real page and **its fake returns a SUBSET of what it was
  asked for on purpose**, so a page that discarded `changed` and un-read its own request fails there rather
  than in production. **⚠ MUTATION-WITNESSED TWICE, and the first caught a REAL BUG:** the store's
  statement was `UPDATE … RETURNING id` with no `IS DISTINCT FROM`, and `RETURNING` reports every row the
  `WHERE` **MATCHED** — so an already-read row came back in `changed` and **the Undo would have flipped it
  to unread, inventing a notification nobody un-read.** Removing `AND read IS DISTINCT FROM $1::boolean`
  reddens exactly the two arms that name the property; making the page store its requested ids instead of
  the server's `changed` reddens the call-site arm. **The CSRF registration is witnessed THREE ways:**
  unregistering the route reddens the 13.116 set-equality drift guard, the forged-Origin refusal, and the
  no-Origin refusal — `HTTP_ORIGIN_PROTECTED_ROUTES` is an **exact-match `Set`**, so the per-id neighbour
  string does not cover the bulk route.
- **16.42** ✅ — **the shared `Toast`.** `packages/ui/test/toast.test.tsx`. The product had **no transient
  surface at all** before this. ⚠ **The "zero `toast` hits across …" first written here was FALSE** —
  there are **five, in three files, all comments about the prototype's toast**, and the sweep's own
  `grep -viE` comment filter ate exactly the hits that existed: **a silent empty produced by the
  searcher.** The material claim (nothing SHIPS a transient message) survives; the quoted measurement
  did not, and is corrected rather than deleted. Covers the ruled 15 s window **at the boundary**
  (not-yet at `-1 ms`, fired at `+1 ms`), `null` meaning no timer, the Undo and Dismiss being two
  different calls, and the absence of an Undo button when none is offered. **Mutation-witnessed:** removing
  the timer reddens the two arms that name it. ⚠ **ONE ADDITION TO THE RULING, flagged rather than
  smuggled:** the countdown **pauses while the pointer or focus is inside the toast**. The ruling's 15 s is
  the default and unchanged; the pause exists because a timer that runs down while somebody is reading or
  tabbing toward the Undo makes the control vanish mid-use, and WCAG 2.2.1 asks for a time limit a person
  can extend. **Owner may veto; it is one effect and its own arm.**

### What is NOT done, named rather than implied

- **A non-id-scoped "mark all read" is NOT built** — excluded by the ruling. The control acts on the drawn
  rows and says so (`Mark N read`), which is also why its label departs from the prototype's *"Mark all
  read"*: that sentence would be a claim about the whole inbox for an action scoped to the page.
- **A page holding more rows than the bound cannot bulk-act.** The client sends exactly the ids it drew and
  the server refuses an over-long list WHOLE; with the read's 30-per-page default, four Load-mores reach
  101. Recorded rather than papered over — the ruling chose the bound and the refusal, and chunking would
  make one click several writes.
- **The toast is wired for the inbox ONLY.** The prototype's serves 66 call sites; the shared component is
  in place for the rest, and wiring them is other tasks'.
- **No browser run.** The dispatch asks for one; a routed `/inbox` needs a real session this lane cannot
  reach, and jsdom has no layout engine — it cannot tell a toast drawn at the foot of the screen from one
  drawn into nothing.

## The sheet footer — `Delete` BUILT and the navigation REMOVED (executor 2 measured the door 2026-09-20; executor 1 closed it the same day)

**The owner's ruling, verbatim (`controller-state.md:79`): _"The footer: Delete and ‹ Previous / Next ›:
build it."_** `CTL-QUEUE:131` rules the `Delete` half *a HISTORY-RETAINING removal with undo, NOT a hard
delete.* **Half of this row was then HELD on a measurement taken by executor 2, and the owner later RULED
THE OTHER HALF OUT — so both halves now move in opposite directions and neither is a gap.**

### ✅ THE HOLD IS DISCHARGED: the door was measured, the owner authorised it, and it is BUILT

Executor 2's hold was correct and is confirmed here rather than overturned — *"a history-retaining removal
has no door"*, measured as: no removal in the ticket vocabulary, `archived` project-scoped only,
`proj_tickets` carrying no removal column, and a controlled sweep reading `ticket.deleted` → 0 against
`ticket.closed` → 110. **What changed is the ruling, not the measurement.** The owner's 2026-09-20
*"yes i want the delete to exist (hoping it is a soft delete), build it"* authorises all of it.

**The shape, and it is the repo's own `closed`/`reopened` pattern copied piece for piece:**
`ticket.deleted` / `ticket.restored` (the pair named after the existing
`project.archived`/`project.restored`) → `TicketState.deleted` → `proj_tickets.deleted_at`/`deleted_by`
plus a partial index → a filter at every view-serving SELECT.

- ⚠ **THERE IS NO ROUTE TO ADD, and the dispatch's list of four guessed one.** The ingest door is generic
  (`POST /v1/events` → `evaluateEvent`'s switch, whose `default` arm accepts an unlisted type), so
  registering the event is the whole of it. **Three doors, not four.**
- ⚠ **THERE IS NO CHOKE POINT FOR THE READ FILTER EITHER, and the first reading of it was WRONG in
  writing.** The ASSEMBLER is shared; the SELECTs are not — hand-written, and independent review counted **14 statements carrying the rule**, which is why no number is given here — and the repo's own
  `closed_at IS NULL` exclusion lives inline at five separate sites with no helper. The filter is therefore
  a single exported constant, `LIVE_TICKET_WHERE`, AND-ed in at each view site so that `grep` enumerates
  the coverage.
  **The near-miss is worth recording: folding it into `visibleTicketsWhere` instead would have COMPILED
  and then died at runtime.** `visibility/visible-tickets.ts` selects `FROM proj_visibility v` with no `t`
  in its FROM at all, so the predicate would have raised Postgres *"missing FROM-clause entry for table
  t"* for that one caller. Verified at the line.
- ⛔ **THE ENGINE'S OWN BY-ID READS MUST NOT FILTER, and this is the trap in the feature.** `getTicketStateFromDb`
  feeds `EngineContext`; filter deleted rows there and `ticket.restored` — the UNDO — is refused with
  `unknown-ticket`, so the delete works and cannot be reversed. **The exclusion belongs to the views; a
  rule engine judging a claim ABOUT a ticket is not a view.**
- ⚠ **AN AUTHORIZATION DOOR THAT NEITHER THE DISPATCH NOR ITS FOUR NAMED.** Nothing gated `ticket.deleted`
  before this change: a workspace **guest named on one ticket could delete it**. It is now gated on
  `hasProjectAdminRights` — the same call `visibility.set`, the neighbouring ticket-scoped privileged act,
  already uses. **This is the executor's conservative default, and it is in the PR body for the owner to
  reverse.**

### What is BUILT, and the two cases that carry it

- **16.84** ✅ — **`Delete` is a history-retaining removal with an undo.**
  `packages/app-core/test/views/ticket-sheet.test.tsx` (the sheet's half) and
  `apps/web/test/sheet-delete.test.tsx` (the CALL SITE's half — the sentence, and the Undo posting
  `ticket.restored` for the id it was offered for). **The sheet emits, closes ITSELF, and hands the
  committed fact to the host**, which owns the toast: an undo offered inside a component that has just
  removed itself is not an undo, and the close is the sheet's own so that a host which narrates nothing
  still cannot leave a reader on a sheet for a ticket that is now in no view. A REFUSED delete keeps the
  sheet open and shows the engine's own rule; a SILENT non-answer is a transport error and never a refusal.
  **Mutation-witnessed ten times (a count of MUTATIONS, not arms — M8 kills two and M21 three), every one killing an arm on its own assertion, every file restored from a
  checksum-verified copy** — the close removed, a refusal made to narrate, the emitted type swapped for
  `ticket.closed`, a nav button re-added, a `[data-style]` fork planted in the stylesheet that WINS, a
  duplicate rule appended at EOF, the nav rules restored, the wrong danger token, Dismiss wired to the
  restore, and the page dropping `onDeleted` entirely. **The last one is why the call-site file exists:**
  all three of its arms redden, while every assertion in the sheet's own suite stays green.
  ⚠ **A DEPARTURE FROM THE PROTOTYPE'S COPY, recorded rather than smuggled.** The prototype toasts
  `"GN-1183 deleted · its history is retained"` — a ticket KEY.
  ⚠ **CORRECTED 2026-09-20: THE PRODUCT NOW HAS A TICKET KEY.** This sentence read *"This product has no
  ticket key (its ids are ULIDs)"*, and that was true when written. The ticket key landed on
  `exec/ticket-key` (`CCSO-1183`: a workspace prefix, a project prefix, and a per-project number), so
  **the toast's sentence is now reachable as the prototype wrote it** — the remaining work is one
  interpolation in the host, which reads the key off the same read that already carries the title.
  Until then the sentence carries the ticket's TITLE, and that is a live departure rather than a
  standing one. The parity list's note that the breadcrumb needs a ticket key is satisfied by the same
  change.
  - **The stylesheet half, and the ground the control really has.** It has a rule of its own: `packages/ui/test/components.test.tsx` pins the rule's existence, its roles, its 44px floor and
  its `justify-content: space-between`; `packages/ui/test/tokens.test.ts` pins the CONTRAST PAIR.
  **`--gn-danger` as TEXT measures 4.4013 on `surface` in hig/minimal light — below AA, a shortfall this
  repo already records.** It is safe here because the footer's ground is `surface-raised`
  (`.gn-sheet`'s own background), where the same ink measures **5.0511** and clears 4.5 in all six
  style×theme combinations (worst `hig`/`minimal` DARK at 5.0392). **Two controls bind the figure** —
  `colorOf` reproduces `tokens.test.ts`'s pinned primitives, and the same computation reproduces the
  recorded 4.4013 — and the pair is ENFORCED rather than written into a comment, which is the criticism
  16.83 earned.

### The sheet's three missing surfaces — the toolbar, the editable title, the breadcrumb

**Owner ruling, 2026-09-20: *"all 3 yes."*** Branch `exec/sheet-surfaces`, cut from `origin/main` =
`e9c1a04f` (the `#591` merge). ⚠ **The `#591` round changed this file's subject underneath the dispatch:**
the footer's `‹ Previous / Next ›` is GONE and `Delete` EXISTS, so `16.43` is a retired absence and `16.84`
is built. Nothing here re-adds, re-wires or re-tests the navigation.

- **16.85** ✅ — **The editor's rich-text toolbar: `B i code link list quote` and the markdown hint.**
  `packages/editor/test/editor-toolbar.test.tsx`. **No door, no migration, no schema change** — measured,
  not assumed: `StarterKit` carries bold/italic/code/bulletList/blockquote and all six commands were
  checked against the INSTALLED packages (`extension-bold`/`-italic`/`-code`/`-blockquote`/`-link` at
  3.30.5, `toggleBulletList` in `@tiptap/core` 3.30.5). **Ten cases, and NOT ONE asserts that a control is
  on screen** — the dispatch names the trap in one line (*"a test asserting a button exists proves nothing
  about whether pressing it changes the document"*), so **EIGHT of the ten** click a control and read the
  serialized ProseMirror JSON. A button that rendered and did nothing passes every "exists" assertion and
  fails all of these. (The other two read the strip itself — the control SET AND ORDER, and its absence on
  a read-only composer. This sentence said "not one" until an independent reviewer counted them.)
  ⚠ **THE ORDER CASE WAS NAMED FOR AN ORDER IT DID NOT ASSERT** until that same review: the strip rendered
  `B i code list quote link` while the case name, the component's comment and this file all said
  `B i code link list quote`. Fixed in the component, and the assertion now pins the prototype's order
  (`desktop.dc.html:3670-3678`). **Mutation-witnessed twice, each killing its own site and nothing else:** the bold
  command replaced with a no-op killed exactly the two bold cases; pointing `list` at
  `toggleBlockquote` killed exactly the bullet-list case. Both files restored from a checksum-verified
  copy. **`link` needs a destination, so it gets an inline URL field** (`toggleLink` with no `{href}`
  would leave an anchor going nowhere), and an EMPTY box is a cancel rather than a link to `''`. Active
  marks are reported through `aria-pressed`, asserted in BOTH directions so a hard-wired value cannot
  pass. A read-only composer gets neither the strip nor the hint.
- **16.86** ✅ — **The ticket sheet's inline title editor.** `packages/app-core/test/views/ticket-sheet.test.tsx`
  (the sheet's half) and `packages/ui/test/components.test.tsx` (the `Sheet` contract's half). **A surface
  over a door that already existed:** `ticket.field_set` with `fieldId: 'title'`, so the case asserts the
  EMITTED EVENT (`source.ingested`), not the input's presence — a field that rendered and sent nothing is
  the shape this could fail in. **Mutation-witnessed:** changing the payload's `fieldId` to `description`
  killed exactly the `ticket.field_set` case and nothing else. **An UNCHANGED title sends NOTHING** — the
  ledger is append-only, so re-sending the current title would put a line in the ticket's history saying
  somebody changed it to what it already said. **A refused title KEEPS the reader's words** beside the
  server's own sentence, and **no client-side blank rule is written**: the engine's
  `checks/fields.ts:118-123` already refuses a spaces-only title, so the value travels AS TYPED — the same
  reuse the New-ticket form's rule stands on. **The dialog's `aria-label` stays the SERVER's title while a
  draft is on screen**, which is the case that catches the tempting simplification of naming the sheet
  after a control's uncommitted value.
- **16.87** ✅ — **The location breadcrumb: `Workspace › Project › State`, and no fourth crumb.**
  `packages/app-core/test/views/ticket-sheet.test.tsx`. **Three crumbs and STOP** — the ticket KEY is OUR
  FOURTH and is a separate round, so nothing is stubbed for it. ⚠ **THE KEY SHIPPED WHILE THIS BRANCH
  WAS OPEN** (PR #595, merged `6f08452c`); the wording here used to call it "another lane's in-flight
  branch" and that is no longer true. The fourth crumb is still not built for a reason that has changed
  rather than lapsed — `TicketRead` is the same SIX fields and does not carry the key either, so a fourth
  crumb needs a third host prop or a read. (The
  prototype's own chain at `desktop.dc.html:3404-3420` is FIVE elements — workspace, project, epic,
  parent, key — so "the fourth" counts against our three and not against that line range; an earlier
  wording said "the prototype's fourth" and read as a claim about it.) ⚠ **THE DISPATCH'S MEASUREMENT OF THE SOURCE WAS FALSE:** it said
  all three crumbs are *"already on the ticket read"*, and `TicketRead` (`view-types.ts:356-381`) is six
  fields carrying no workspace name, no project name and no state name; `BoardView` is
  `{projectId, groups}` and `DataSourceQuery` has no `getProjects`. **Only the STATE is derived here**;
  the two names are host props, which is recorded as the executor's conservative default on
  `TicketSheetProps.workspaceName` and in the PR body. **Mutation-witnessed:** relaxing the nav's gate from
  `&&` to `||` killed exactly the half-path case — the version that drew `Workspace › Doing` for a caller
  that passed one name, a crumb list missing its MIDDLE level and stating a hierarchy the product does not
  have, with every crumb in it individually correct.

### 🚫 The navigation, RETIRED — a decided ABSENCE, not a gap and not a TODO

- **16.43** 🚫 **RETIRED BY OWNER RULING.** The owner ruled the pair out on 2026-09-20 — *"remove the
  navigation"*. **Its five arms retire with the control**, and `TicketSheetProps.navigation` no longer
  exists, so no caller can bring it back. The property they asserted was real when they were written —
  the list was the CALLER's, an end was a DISABLED button rather than an absent one, and a step reset the
  open tab to `details` — and none of it is false now: it is simply about a control the product does not
  draw. **What replaces it is the ABSENCE assertion in 16.84**, which reddens if a future edit re-adds the
  markup or the rules without a caller.
  ⚠ **Why it goes beyond unused: nothing computes a queue position.** `navigation` had ZERO call sites
  repo-wide, so the footer drew `null` on every mount in the product — the pair never rendered anywhere.
  **The prototype still draws them; the product does not, and that is the decision.**

**⚠ ONE DELIBERATE DEPARTURE, RESTATED FOR THE COMPLETE FOOTER.** The prototype grounds this strip in
`--fill4` and runs it to the sheet's edges. It is still a separator rule instead, and the reason is
unchanged — but it is now MEASURED rather than asserted: `ui.css` contains **zero** negative margins,
against 184 `margin` declarations in the same file, so reaching the edge for this one strip would be the
repo's first. **A true full-bleed footer is a `Sheet` API change** — a `footer` slot rendered as a SIBLING
of `.gn-sheet__body`, exactly the way `header` already is — and `justify-content: space-between` is kept
in the meantime because it is the structure a second, right-hand control lands in.

### ⚠ THE INDEPENDENT REVIEW, AND WHAT THE FIX ROUND CHANGED (2026-09-20)

One reviewer, dispatched per the brief's cap, with restore verified by checksum on 20/20 files. **No Critical.** It re-derived the read-path coverage independently and confirmed the two prohibitions hold (the engine's reads do not filter, enforced — filtering `getTicketStateFromDb` kills the suite in `beforeAll`), agreed with the permission LEVEL, and reproduced the contrast figures with its own WCAG implementation.

**Three Important, and all three are now fixed or recorded:**

1. **I1 — THE SWEEP'S OWN UNIVERSE WAS THE BUG, AGAIN, IN THE SAME FILE.** `Features.md` carried a SECOND bullet, 300 lines down, still saying the navigation was BUILT and `Delete` was HELD — in the file this branch had just added the opposite bullet to. **Deleted, not tombstoned**, per the workspace rule. Two survivors remain in `docs/lanes/executor-2-state.md` and `docs/lanes/controller-state.md`, **neither in this branch's diff** — recorded with a named owner rather than reached into across lanes.
2. **I2 — ELEVEN SITES CARRY THE PREDICATE AND NOTHING CONSTRAINS THEM.** The implementer disclosed this; the reviewer **proved it**: mutating each to `AND TRUE` leaves the whole server and app-core suites green, while `AND FALSE` reddens them — **so they are executed-but-unconstrained paths, not mutations that never ran**, which is the distinction that matters. **One is now covered:** a new `rollupFor` case makes `DELETED` and `RESTORED` children of `LIVE`, so a parent's child count is a reading of a real rollup, and mutating `visibility/rollup.ts`'s predicate now reddens it (`expected 2 to be 1`). **The other ten remain unconstrained**: `projections/rollups.ts:219`, `auto-close/sweep.ts:197`, `notifications/sweep.ts:187`/`:265`, `routes/builder-reads.ts:362`/`:438`, `read/workspace-counts.ts:226`, and `app-core/src/replica/replica-data-source.ts:888`/`:921`. **Named, not implied.**
3. **I3 — THE DELETE PATH NEVER RE-ASKED THE LIST OR THE BOARD, WHILE THE RESTORE DID.** `page.tsx`'s `onDeleted` only set the notice, so with the `/v1/stream` socket absent the list kept showing a row the toast had just said was deleted. **Fixed**, and the fix has its own witness: a `getTickets` call-count case that reddens when the reload is removed (`expected 2 to be greater than 2`), which no other case in that file can see.

**Four Minor were wrong COUNTS or wrong UNITS in this branch's own new prose, and each is corrected in place with the measurement and the reviewer's credit:**

- **"184 `margin` declarations"** was the **LINE** count. Measured: 161 `margin*:` declarations, 186 occurrences, **zero negative** — the substantive half was right and the unit was the thing that was wrong.
- **"eleven hand-written SELECTs"** is **withdrawn**: the reviewer measured 13 executable uses plus 1 hand-written predicate = **14 statements carry the rule**, and no reading of "hand-written" yields 11. **The grep is the enumeration; a bare number about an unpinned universe was the defect.**
- **"zero call sites repo-wide"** overreached — case `16.43`'s own arms passed one five times. The claim that holds is **one product call site, and it passed none**.
- **"Mutation-witnessed TEN ways, each killing its OWN arm"** conflated mutations with arms (M8 kills two, M21 three).

## The inviter card — ALREADY BUILT, and the half that was missing was the ABSENCE (executor 2, 2026-09-20)

**Queue Addendum 5; the doors-table row at `owner-holds.md:74`.** ⚠ **That row was carried as an
outstanding `BUILD`, and it is the FIFTH on that table written from a recommendation rather than a
measurement** — the `isInvite` decline row sits four lines above it, leaving exactly that lesson. **The
build had shipped before the ruling.**

### The half that WAS built, and it was built by `#400`

`apps/web/app/workspaces/page.tsx:507-515` renders

> `` `${inviter} invited you to ${workspace} ${ROLE_SENTENCE[invitation.role]}.` ``

— the prototype's own sentence (`desktop.dc.html:216`, *"Anjali invited you to Garo Hills Logistics as a
member."*), landed in **`d3d0abdd` — "Task 17: caller-scoped pending invitations + Accept/Decline
(#400)"**, with `invitedByName` resolved by the `LEFT JOIN "user"` on `proj_invites.invited_by`
(`apps/server/src/routes/my-invitations.ts:140-144`). **Already tested verbatim** at
`workspaces-invitation-banner.test.tsx:176`.

⚠ **AND `name + role` means the inviter's NAME plus the role OFFERED — settled by the design authority,
not by grammar.** The prototype draws *"…as a member"*, the role being offered, so **the inviter's own
workspace role is NOT built** — that reading would be a third-party disclosure the ruling does not name.
Recorded here so the next reader does not take the sentence the other way and build it.

### The half that was missing, and it was a TEST rather than code

- **16.44** ✅ — **the session-less token page names NO inviter, in ANY branch.**
  `apps/web/test/invite-page.test.tsx`. Before this case the file did not contain the word `inviter`
  anywhere, so the ruling's negative half was **true but unpinned**: a later edit could have put the
  inviter on the token page and nothing would have objected. ⚠ **The fixture supplies an inviter the
  CONTRACT does not carry** (`InviteSummary` is `{workspaceId, workspaceName, role}`) — without one the
  assertion could not fail, because a page rendering `summary.invitedByName` would pass against a fixture
  that never supplied it. **Mutation-witnessed:** rendering the inviter on the page reddens **both `16.44`
  arms and nothing else**. The **signed-in** branch is asserted deliberately — that is the reader an
  implementer would most reasonably decide is entitled to know who asked, and the ruling says no
  regardless, because this page's audience is whoever holds the URL, which `routes/invites.ts` records
  *"may have been forwarded"*.

## The calendar's empty month names the filter (executor 2, 2026-09-20) — case `16.45`

**The owner's ruling, against a measurement this lane filed the day before:** *"the message should name
the filter"*, on an item whose recorded shape was *"three sentences in code, two renderable;
`CALENDAR_NARROWED_MONTH_COPY` is dead"*.

- **16.45** ✅ — **the REACHABLE empty-month sentence names the filter.** `packages/app-core/test/claims/claim-labels.test.ts`.
  The three sentences were `CALENDAR_EMPTY_MONTH_COPY` (the fallback), `CALENDAR_ALL_HIDDEN_COPY` (the
  legend, driven by the view's own switch state) and the third, which no app could render: no production
  call site passes `filter` or `laneEpicId` to `CalendarView` — `apps/web`'s project page hands
  `datesNarrowing`-filtered rows to `dateInputs` and passes neither prop — so `visible === inputs` in
  every app and the fallback is what a filtered month reaches. **So the fix had to be the reachable
  sentence, not the dead one**, and that was not a preference: the common shape — *wire the dead
  constant* — is foreclosed by the owner's own second ruling in the same sitting (*"delete the copy"*)
  and could not have worked in any case, because the page filters UPSTREAM of the view, so passing the
  filter down would re-filter an already-filtered set and still exclude nothing. **A page-LEVEL "a filter
  is on" flag was considered and rejected with the reason recorded**: it cannot answer whether THIS month
  was emptied by the filter, so it would license a sentence that is false whenever the filter is simply
  irrelevant to the month.
  ⚠ **The assertion is on the WORD (`'your filter'`), and on the reference's honesty note surviving
  (`'Undated work is absent, not estimated'`).** Pinning the whole string would pin wording, not the
  ruling's property — and the second assertion is load-bearing for someone else's case: `11.186`/`11.187`
  assert that same substring is ABSENT while a read is in flight; **that one assertion** would have gone
  unfailable had this copy stopped containing the substring. (⚠ The first draft said "those cases would
  have gone vacuous" — the reviewer refuted it: the `.gn-calendar` / `.gn-timeline` assertions in the
  same cases still catch the defect they name. The refinement matters, because the stronger claim is the
  one that overstated.) Both `docs/manual.md` and `docs/faq.md` had **documented this
  sentence as the product's known lie** ("the first one is wrong more often than it looks … trust the
  count in the strip instead"); both are corrected in the same change set, and `content.generated.ts` is
  regenerated (`check:help` 231 entries, delta 0 — no heading moved).
  ⚠ **Corrected 2026-09-20 by the reviewer, and the correction is the point.** This paragraph first
  read *"No test watched the copied string before this case"* — **which was FALSE**, and false in the
  direction that flatters a change. `claim-labels.test.ts`'s **11.1 pinned this exact string** before
  the ruling, and this branch's diff *edits that expectation*: the sentence was watched, and the watch
  had to be updated. The true statement is about the OTHER sentence in this dispatch — the
  `page.tsx` project-creation refusal, for which **no test watched it in either direction** (measured
  with a control that fired, and separately by a reviewer's gibberish-probe). Two different strings,
  one paragraph, and conflating them is how a "nothing watched this" claim gets asserted where it
  isn't true.

## `hig-per-screen/3b` — Members states (executor 1, 2026-09-20) — cases `16.61`–`16.80`

**The dispatch's decisive question, already answered before this branch opened:** *is `role` on the server's members
response and merely dropped by the mapper, or absent from the wire entirely?* — **on the wire, and already carried**
(`readMembers` selects `m.role`; `mapActors` maps it, case `13.760`). So the "carry it end to end in ONE task" half
was done long before this row, and the remaining work is the surface.

**Both changes the audit recorded for this screen are also already in the product**: the **conditional role cell**
(`adminGate === 'admin' && isEditableRole` → `Select`, else the chip) and the **invitation panel's gate** (the door's
own 403, argued in the page's docblock). Neither was re-built.

- **16.62** ✅ **The identity cell STACKS, and exactly one rule says so.** A source scan of `apps/web/app/globals.css` asserting the column's three declarations, plus the uniqueness claim (the class is named by exactly one rule) so a higher-specificity override cannot kill it silently. **Witnessed by deleting `flex-direction: column`** — which reddens this case and nothing else. **It is the ONLY instrument that can see the structure**: jsdom has no layout engine (two inline spans here render as one run of glyphs — the shape the subtask rows shipped), and the only real-browser instrument over `/members` measures colour, not geometry.
- **16.61** ✅ **The Person cell carries the address on a second line — and ONLY when the label is not already the address.** Two arms, because the line is honest in one of them: a person whose NAME is the label gets the address beneath it (`:675`), and the nameless population — a magic-link sign-up with no name, labelled *by* their address — gets one string, not two. **Mutation-witnessed:** drawing the line unconditionally reddens **2** (this case's second arm and the pre-existing nameless-roster case); never drawing it reddens **1**.

### What is NOT covered, and one omission the review FOUND

The reviewer re-read the authority's `isInviteAdmin` block against the page and confirmed both changes this row
was sent for are present and untouched. It also found a **thing the authority draws, that we do not, and that the
data already serves** — so it is named here with an owner rather than built on this row:

- **The pending-invitations HEADING — BUILT (executor 2, 2026-09-20, case `16.46`).** The authority draws
  `<p>{{ inviteHeading }}</p>` at `:725`, defined at `:3091` as `"Pending invitations · " + s.invites.length` —
  and the product rendered **no heading for the pending list at all** (`PendingList` emitted only the empty `<p>`
  or the `<ul>`, and the page's only `<h2>` **was** `Invite somebody`). `pending.length` was already in state, so this
  needed no read and no route. **It was in neither the page's absent-list docblock nor the audit's gap list — an
  unrecorded omission rather than a scope decision** — and the controller dispatched it. See the section below
  for what shipped and how it was witnessed.
  ⚠ **`(data :3096)` WAS A STALE CITATION and is corrected to `:3091` in this change set.** `:3096` is the
  `named` scope line *inside* `inviteRows`; it does not carry `inviteHeading`. Nothing depended on it — the
  omission it was cited for was real either way — but a citation that resolves to a different statement than the
  one it is cited for is the shape this repo keeps paying for.
- Also drawn and absent, in decreasing order of how data-backed they are: the pending row's **project scope**
  (`:732`; `PendingInvite.projectIds` is served, project *names* are not), the minted card's **`Copy link` and
  `Done`** (`:788-789`; the product renders the URL as inert text), and four static sentences the authority
  carries (`:726`, `:778`, `:780`, `:793`).

## The pending-invitations heading (executor 2, 2026-09-20) — case `16.46`

**The dispatch:** the omission recorded above, whose owner was "the controller, for a dispatch". One branch
(`exec2/pending-heading`), one PR, `--base main`.

**The authority draws the heading and the count was already in state, so this needed NO read and NO route.**
⚠ **The three other things the same paragraph names are deliberately NOT in this change set** — the pending
row's project scope (`:732`; needs project *names*, which are not served), the minted card's `Copy link`
and `Done` (`:788-789`), and the four static sentences. They are unaffected and still recorded above.

- **16.46** ✅ **The pending list carries its heading, and its count is the list it heads.** `PendingList` draws
  `<h2 className="gn-invite-pending__heading">` reading `` `Pending invitations · ${rows.length}` `` — the SAME
  array the `<ul>` maps, read in the same expression, which is why the heading lives in the COMPONENT rather
  than beside it at the call site: a count fed from anywhere else is a second, weaker answer to a question the
  list already answers. **Four arms, each with a literal expectation and none built by calling the component's
  own code** — an expectation the implementation also produces cannot fail when the implementation changes.
  Two rows read `· 2` **and the list is asserted to draw exactly two rows**; one row reads `· 1`, so the
  number is a count and not a constant; no rows reads `· 0` **over** the `No invitations are outstanding.`
  sentence, which is the empty-case DECISION (the authority draws the heading unconditionally inside its
  `isInviteAdmin` block, and the empty sentence already makes the claim, so `· 0` repeats rather than adds
  one); and a member who meets the door's 403 gets **neither the heading nor the list it heads**.
  *Mutation-witnessed SEVEN ways, each declaring the arms it should redden BEFORE it ran, so a mutation that
  reddened nothing would be a reported survivor rather than a silent hole.* The middot swapped for a hyphen
  (A1/A2/A3); the count pinned to the constant `2` (A2/A3 — **and A1 stays green, which is exactly why A2
  exists**); the heading deleted outright (A1/A2/A3); the heading **hoisted out of the admin gate** so it
  renders for a member too (A4); the `<ul>` truncated to `rows.slice(0, 1)` while the heading still counts all
  of them (A1 — **the only arm that catches the LIST drawing fewer rows than the fixture holds**; a count PINNED
  to a constant leaves A1 green, which is exactly why A2 exists); the count off by one (A1/A2/A3).
  ⚠ **THE SEVENTH SURVIVED THE FIRST RUN, AND IT WAS MY OWN CLAIM THAT DIED WITH IT.** Rebuilding the string
  as `` {'Pending invitations · '}<span>{rows.length}</span> `` — the label-plus-span composition the dispatch
  warned about — left the accessible name `Pending invitations · 2` **unchanged** and **all four arms green**.
  So the docblock sentence "an accessible name inserts a space between sibling elements, so a composed name
  would not be the authority's string" was **false as stated in this case's own environment**: measured, a
  boundary between the text node and the span does not double the space the literal already ends with. (Whether
  a boundary adds no separator at all or the whitespace is collapsed, this measurement does not distinguish, and
  a real browser is not measured here.) **The one-node form is kept — it is still what the dispatch asked for —
  and the COMPOSITION is now pinned by an assertion instead of argued in prose:** the case asserts the heading
  has exactly one child node and holds no element, which is the only instrument that can see the difference.
  Re-run after the fix, the seventh mutation reddens A1. **A survivor with no explanation is either an
  unconstrained path or a mutation that never ran; this was neither — it was an assertion that could not make
  the distinction it was named for.**
  `<h2>` rather than the authority's `<p>` because this screen's other heading is the authority's own
  identically-styled `17px/600` heading (`:747`, `Invite someone`) and the product already renders it as an
  `<h2>` (`page.tsx:781`). ⚠ **The heading is ONE text node and not a label plus a `<span>`, deliberately** —
  **and the reason first written HERE was measured FALSE by this same bullet's seventh mutation, above: a
  two-node composition left the accessible name unchanged and every arm green.** The form is kept because it is
  what the dispatch asked for; what holds it is the case's **STRUCTURAL assertion, not the name**. The middot is
  pinned as a character, so a lookalike dot or a hyphen reddens. ⚠ **The
  heading carries NO `aria-label`, `role`, `aria-selected` or `aria-describedby`, which is why the `/members`
  accessible-name ratchet cannot move on it** — `sweepAccessibleNames` counts exactly those four attributes and
  `rawMatches` is its un-ratcheted control. **No baseline file was touched, and the case is not claimed to be
  seen by that ratchet.**
  `apps/web/app/w/[workspaceId]/members/page.tsx`, `apps/web/test/members-page.test.tsx`, `Features.md`

## Sheet prototype parity (executor 1, 2026-09-20) — cases `16.81`–`16.99`

**Owner: _"make our build like the prototype."_** **The authority is
`design-system/interactive/desktop.dc.html`** — NOT `design-system/prototypes/TicketSheet.dc.html`, which nothing in
the repo cites and which matches our build much more closely, so comparing against it concludes "we are nearly
there". **Every comparison is style-matched:** the prototype is drawn in the flat language, so `data-style="hig"`
comes first — at the app's default (`neo`) our screens are neumorphic and look like a different design.

**The work splits in two, and the split is the task's own rule:** *styled differently* is a restyle; *structured
differently* is a feature. The PR body must say which list each item is on, and anything needing a route, a
migration or a disclosure the table does not name is a **STOP AND ASK**.

- **16.82** ✅ **`Full screen`** — the authority's pill (`desktop.dc.html:1119-1120`: 32px minimum height, fully round, an icon and a label that BOTH change), toggling **the scrim, the panel and the body TOGETHER** (the prototype's own three-part treatment, `:3396-3400`: the scrim goes opaque, the panel fills the viewport, the body becomes a centred 860px column). **All three parts are one property**: any one alone is a panel that grew while the page behind it stayed visible, which is what each part looks like on its own. Mutation-witnessed both ways — the scrim alone left behind reddens it, and a label that never turns around reddens it.
- **16.81** ✅ The sheet's sections are **ONE segmented control** — the authority's shape (`:1134-1140`) — rendered by the SHARED `SegmentedControl`, carrying the same `tablist` / `tab` / `aria-selected` roles the two bordered buttons had, **plus a `aria-label` the tablist never carried** (see the correction below). **Two tabs exactly**: `Attachments` is a read, and its absence is pinned so inventing it cannot pass. Mutation-witnessed: an empty label reddens it, and adding a third tab reddens it. **⚠ The added `aria-label` is NOT seen by the accessible-name ratchet, and an earlier version of this line claimed a "ratchet RISE": no suite renders the sheet** (the sweeps navigate `/p/:projectId` without `?ticket=`, and the sheet mounts only when it is present), so the number cannot move either way today — the witness is the unit assertion, and the rise would be exactly one `ariaLabel` the day something renders it.
- **16.83** ✅ **The ticket-type list's ↑/↓ reorder had NO CSS RULE AT ALL**, and now has one — which is the whole case, because the class rendered as raw user-agent chrome for as long as it existed. **Measured in Chromium against the real screen:** `button.ticket-type-list__move` appeared in `ui.css` and `globals.css` **zero times**, against a positive control of `.ticket-type-list__row` in the same sweep; it painted `border: 2px outset`, `background: rgba(239,239,239,0.3)`, `border-radius: 0px`, `font-weight: 400`, `28.2 × 29.2`. **⚠ AND THE FIRST REPORT OF IT WAS MISDIAGNOSED** — the controller told the owner it was a *contrast* regression at 1.41:1; a class with no rule has no ratio of its own to be below, and the 1.41 was the stripped UA border colour the roster had been recording all along. **So this case does not pin a colour and must not be read as fixing one.** It pins that the rule EXISTS, that it carries the repo's ruled borderless-control roles (`--gn-fill-tertiary` + `--gn-text-accent` + `--gn-radius-control`, the same pairing `.gn-button` and `.gn-board-card__move` resolve this identical prototype constant to), that **no `[data-style]` block forks it** (13.340's positive scan, repeated for this class), and that the **44px tap target is taken over the prototype's own `32px`/`36px`** — the recorded divergence `.gn-board-card__move` already made, pinned so a re-transcription cannot land quietly. Mutation-witnessed **six ways, and each mutation dies on ITS OWN assertion**: the rule deleted (`rule()` throws), the fill swapped, `2.75rem` → `32px`, a `[data-style="neo"]` override added, `:disabled` `0.4` → `0.55`, and the `<li>` taken back off `display: flex`. **The three styles resolve from ONE unconditional rule** — measured in Chromium: `hig`/`minimal` at `rgba(39,58,99,0.11)` + 8px, `neo` at `rgba(176,152,132,0.16)` + 14px. **The glyph clears 4.5 in all six style×theme combinations on its real painted composite** — worst **`hig`/`minimal` DARK at `4.75`** (the full set: 4.75 · 4.75 · 4.98 · 5.18 · 5.18 · 5.85; an earlier draft of this line named `neo` light's `4.98` as the worst, which is **not the minimum in the author's own table**) — measured rather than assumed because the button's ground is the card, not the `surface` the existing `fillTertiary` case pins, and **no case in `tokens.test.ts` asserts this pairing** (its composited check at `:588` uses the default style only, over `surface`). **The layout half is part of it:** `<li>` is now the flex row the component's own comment claims ("the controls sit beside the door") and nothing honoured while `<li>` was `display: list-item` and the row door is `width: 100%` — measured before: pair top `205.7` against row top `234.8`, i.e. the pair sat on its own line ABOVE the row it reorders. **What it does NOT settle, named rather than assumed:** the owner's 2026-09-20 ruling that *dense in-list* controls take 24px has a checker that does not exist yet, so 44 is taken here — matching the repo's only other instance of this exact control — and **24 would LOWER a floor a live gate currently enforces.** That question and the rule to change are named in `ui.css`'s own block. `packages/ui/src/ui.css`, `packages/ui/test/components.test.tsx`

## The attachments read — a route over the table that has been waiting for a caller (executor 2, 2026-09-20) — cases `16.47`–`16.58`

**Dispatch: the controller's cycle-25 dispatch, option (A) — a thin route over the existing
`listTicketAttachments`.** The owner's ruling is the one-line kind, and this section is that read: the route, the
seam behind it, and the mount that had never passed the prop.

**What was measured before building, and why the shortcut was refused.** `listTicketAttachments`
(`apps/server/src/attachments/attachment-repo.ts:76`) was written and TESTED by Plan 7 with **zero production
callers** — every reference in the tree was a test — while `TicketSheetProps` has accepted an `attachments`
prop since Plan 6 and the product's single mount
(`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`) never passed it. ⚠ **CORRECTED
2026-09-20: this read `apps/web/app/w/[entry]./page.tsx`, which is not a path in this repository — the mount
this task wired is the one named above, the same one `Features.md` cites.** The
tempting alternative needs no wire change at all and is **wrong**: the sheet's own history read serves the
OLDEST 200 events (`ticket-history.ts`, `ORDER BY seq ASC LIMIT`, no paging on the wire) and
`AttachmentList` returns `null` on empty, so a long ticket's recent attachments would vanish as a **drawn
absence** — the product quietly claiming there are none. The route was built instead.

**THE LOAD-BEARING PROPERTY IS THE VISIBILITY PREDICATE, and it is proved by AGREEMENT rather than asserted.**
The events door (`routes/tickets.ts`, `/v1/workspaces/:ws/tickets/:id/events`) guards with
`loadTicketRow` → 404 and then `canSee` → 404. The new route is registered beside it with the same two guards,
in the same order, answering the same `NOT_FOUND_BODY`, so "may this caller see this ticket" is still asked in
exactly one function (`visibility/can-see.ts:227`). Case `16.52` holds the two doors to identical status and
identical bytes for an unseen ticket and a nonexistent one, behind a positive control proving neither door
merely 404s everything.

- **16.47** ✅ The door serves THIS ticket's attachments, in creation order, in the shape the client's `AttachmentListEntry` upload arm names; an unauthenticated caller is refused (401) before any of it. The positive control for everything below.
- **16.48** ✅ **Never another ticket's rows** — two tickets with attachments in the SAME workspace, each door held to a SET DIFFERENCE against the other's ids in both directions. A containment assertion over one ticket is passed by a door that returns every attachment in the database; this is the shape that catches a missing `ticket_id` predicate, which is the one way a file from an unseen ticket could reach a list for a seen one.
- **16.49** ✅ **An empty list and a refusal are different answers.** A visible ticket with no attachments answers `200 {attachments: []}`; the same call for an id naming no ticket answers `404 {error:'not_found'}` **in the same run**. This is the pair `AttachmentList`'s null-on-empty docblock depends on — the one answer this door must never give is `[]` for a ticket the caller may not see.
- **16.50** ✅ **An invisible ticket and a nonexistent one are byte-identical**: status, parsed body, raw payload, and the two headers Fastify derives from the body, behind a 200 positive control. A status-code assertion twice is not this property — a route that 404s everything passes it.
- **16.51** ✅ A real ticket in a DIFFERENT workspace, probed through THIS workspace's path, is refused with the same bytes as the ghost — and the positive control is the same caller reading the same ticket successfully at its own workspace's path, so the refusal is about the path and not the viewer.
- **16.52** ✅ **The two doors agree about who may see the ticket.** For an unseen ticket, a nonexistent one and a foreign-workspace one, the attachments door and the events door answer the same status and the same bytes; the control is that both doors DO answer for a ticket the caller may see. This is the "same predicate, not a second weaker answer" proof.
- **16.53** ✅ The filename is `sanitizeFilename`d at this door as it is at the download door, so the list cannot say `bad"name.pdf` while the download names the same object `badname.pdf`. Fixture is a row no upload path wrote — the "some other writer put it there" case the download door already argues.
- **16.54** ✅ **The seam keeps the two states apart.** `getTicketAttachments` resolves `[]` for an empty list and REJECTS with the status it was (404) on a refusal — written as a pair in one run, because either half alone passes for the wrong reason (a method that always throws passes the rejection half; one that never throws passes the resolution half). `[]` has exactly one meaning here, which is what lets the sheet draw silence for it and a sentence for the other.
- **16.55** ✅ The five served fields map onto the upload arm IN THE ORDER the route answered (the list renders that order), and a `sha256` that is neither a string nor `null` is REFUSED rather than mapped into the view as `undefined`, where it would render as nothing and read as "no hash known" — which is what `null` means.
- **16.56** ✅ **The offline replica refuses this read with a NAMED absence while `getTicketHistory` serves the same fact.** The local ledger really does carry `attachment.added`, so the list looks derivable on the spot; the case applies the event to a real replica, shows the history door serving it (the positive control that makes the refusal a DECISION rather than an inability), and holds the refusal to naming what cannot be filled, why the ledger cannot stand in, and who closes it. Case `12.185` was updated in the same change set: its enumeration moved EIGHT → NINE, and its `Object.keys(REPLICA_GAPS)` comparison is order-sensitive, so the entry is inserted where the registry inserts it.
- **16.57** ✅ **The sheet keeps an empty list and a failed read apart.** All three arms in one run — entries (drawn), empty list (nothing drawn, and no sentence: the component must not turn "there are none" into a warning), and a failed read (a sentence carrying the transport's own reason, deliberately NOT dressed as `Loading…`). `attachmentsUnavailable` mirrors `NewTicketDialogProps.parentCandidatesUnavailable`, which draws its reason the same way.
- **16.58** ✅ **The page asks the read for the OPEN ticket.** The real page renders, opens a real ticket, and the assertion is on the ARGUMENTS the production caller passes — a page that read attachments for some OTHER ticket would draw a plausible list and pass every screen-level assertion in `16.57`. Delete the read from the page and this reddens while `16.57` stays green, which is exactly why `16.57` could not catch it (the same argument `evidence-upload.test.tsx` makes for `16.31`).

### What is NOT covered, named rather than implied

- **The Drive-reference arm is not served, and cannot be.** `attachment.added` is a discriminated union carrying a
  reference as well as an upload, and `AttachmentListEntry` renders both; the `attachments` table has no kind
  column and its only writer is the upload door. The row and the event are two facts — a row exists the moment
  bytes land, the event is the client's claim about them, which `routes/attachments.ts` expects afterwards and
  which `Features.md` §9 records the web client does not post at all today. **No producer emits the reference
  arm at this commit** (swept). It becomes a silent omission the day one lands. **RECORDED, not fixed — owner:
  whoever gives the `attachments` table a kind column, or emits the reference arm for the first time.**
- **No browser measurement was taken.** The sheet's own summary says no suite renders it, and this change does
  not alter that: the two suites here are jsdom. The new CSS rule is a one-line twin of
  `.gn-ticket-sheet__history-error` and is asserted by neither a viewport nor a contrast run.
- **`check:db-tz` was not run** — it requires a live database and this lane never runs `docker compose`.
- **The route's own rate-limit placement is a decision, stated:** it is NOT in the `events:` bucket, because the
  only sibling read of a ticket's ledger — `GET /v1/workspaces/:ws/tickets/:id/events` — is not in any bucket
  either. ⚠ **CORRECTED 2026-09-20: this read "and this read is strictly smaller than that one", which is
  unmeasured and false in general — NEITHER read is bounded.** The argument is PARITY and it stands without the
  size claim: an unbounded sibling door has never been rate-limited, so a bucket on the newer door alone would
  bound one of two comparable reads and leave the other open. It is also NOT added to
  `HTTP_ORIGIN_PROTECTED_ROUTES`, which is a set of MUTATIONS: the file's own docblock says `GET` routes are
  absent "by definition and not by oversight", and CSRF needs a state change.

## The viewport suite reaches a gate, and the body floor SPLITS rather than dropping (executor 2, 2026-09-20) — cases `16.59`–`16.60`

**Owner ruling, 2026-09-20, on executor 2's ruling request:** *"wire it into the gate"*, and for the one
pre-existing red that stood in the way, *"move the eyebrows into the ratcheted label population, by a
named membership rule — section 4's 16px floor stays hard and unchanged for anything not declared a
label."* Both halves are below. **The lane minted exactly these two ids and no others.**

- **16.59** ✅ **The signed-out viewport suite RUNS on CI's gate, and the assertion is on what the job runs rather than on the job's name.** `apps/web/playwright.viewport.config.ts` drives a real Chromium at 390 / 768 / 1512 against a `next dev` built from the working tree, and until this change it was reachable only by an explicit `-c` spelling that no turbo task defined and that `.github/workflows/ci.yml` never named: **the string `viewport` occurred 0 times in that file**, measured with a positive control in the same invocation (the same grep found `e2e` nine times, `test:e2e:stack` three). The bill was measured rather than argued — the `/help` tap-target ratchet sat at **25 / 23 / 25** offenders at 390 / 768 / 1512 against recorded baselines of **10 / 16 / 16**, red on `main`, for as long as the topic sidebar has existed, and nothing could see it. `ci.yml` now carries a `viewport` job whose steps invoke `pnpm run test:e2e:viewport`, and `gate` waits on it. **The first assertion is the load-bearing one**: a `viewport:` key whose steps run nothing satisfies every name-shaped check while covering nothing, and then reads as coverage — strictly worse than no job, which is the same reasoning the `e2e` job's own comment gives for refusing a file-presence gate. Mutation-witnessed in both directions: delete `viewport` from `gate`'s `needs` and the test reddens naming that list; change the job's step to `echo` and it reddens on the command. Deliberately NOT a turbo task — a turbo verdict can be replayed from CACHE, and `turbo.json` already records `#270` reaching `main` behind a replayed green log. — `apps/server/test/ci/ci-workflow-shape.test.ts`, `.github/workflows/ci.yml`, `apps/web/playwright.viewport.config.ts`
- **16.60** ✅ **The body-text floor SPLITS into two populations by a DECLARED membership rule, and a moved label is still covered afterwards.** `/help` at 390px was the single red the wiring above would have imported: 17 offenders, every one an uppercase eyebrow LABEL — `p.gn-help__eyebrow` at 12.48px ×1 and `p.gn-help__section-eyebrow` at 13px ×16. Both sizes are owner-directed guide values (`c21246b0` moved 0.8125rem → 0.78rem under *"lets move the styling towards the guide"*; the 13px is annotated "all from the reference"), both sit inside the `0.78rem-1.3rem` band `type-scale.ts` itself calls the legitimate scale, and both clear `LABEL_FLOOR_PX` — they were red only for being `<p>` elements. ⚠ **The ruling asked one thing be CHECKED rather than assumed, and it decided the shape of the fix**: `p` is in `BODY_SELECTOR` (`p, li, dd, dt, td, figcaption, label`) and **NOT** in `LABEL_SELECTOR` (`span, small, div, …`), intersection empty — so removing these from section 4 without adding them to section 4b would have left them with **no floor of any kind, silently**. The fix is therefore a **SECOND SELECTOR**, `LABEL_SELECTOR` built from the declared table rather than typed beside it, and the element is still covered rather than merely excused. **The dangerous direction is guarded by leaving it alone:** an element not declared in `LABEL_IN_BODY` is still judged at 16px, hard. Three mutations, each reddening for the property it names: undeclare a label and section 4 names it at 16px again (`{"selector":"p.gn-help__section-eyebrow","fontSizePx":13,…}`); rename a declared class and the stale-entry guard reddens — *"exempt from section 4's 16px floor and covered by NOTHING"* — isolated at a width where section 4 does not assert, so only the guard can fire; reduce `LABEL_SELECTOR` to its base (**the exemption the ruling forbade**) and the hand-off assertion reddens with *"section 4 handed 17 declared label(s)… but the label sweep says it received 0 by declaration"*. That last one is why the hand-off is measured from BOTH ends: an exemption leaves the element in NEITHER population, which reads green. Measured at this head: the suite is **31 passed / 0 failed / 2 skipped**, where it was 30 / 1 / 2. No skip, no widened timeout, and **no re-baselined number** — `type-scale-baseline.json` is untouched and every key in it is still 0. — `apps/web/e2e-viewport/type-scale.ts`, `apps/web/e2e-viewport/responsive.spec.ts`

### What is NOT covered, named rather than implied

- **The cold cost of the CI job was NOT measured.** The suite takes **67 s wall** on a warm `.next` (31 passed / 0 failed / 2 skipped, `EXIT=0`); the cold figure was declined at the permission layer rather than estimated, so the honest statement is that the warm number is measured and the cold one is not. What the job adds beyond the suite is the browser install and `pnpm turbo run build`, both of which the existing `e2e` job already pays.
- **The CI job has never executed, and cannot be verified in CI today.** GitHub Actions on this account fails every job before its first step (`steps: []`, `runner_name: ""`, ~3 s), under the owner-waived billing block `controller-state.md:4600` records. Measured: **200 CI runs since 2026-09-07, 200 failures, 0 successes**; the last successful run of any workflow is `34023679658`, 2026-09-06. The command the job runs was therefore executed **locally, at this head**, and that is the only evidence available for it.
- **`e2e-stack/viewport.spec.ts` gets the label sweep but not these two assertions.** It imports `type-scale.js` and never `measureBodyText`, so the hand-off equality has no second side there, and the declared labels are on the signed-out `/help` route it does not visit. The stale-entry guard is carried on its `TypeScale` return but is not asserted there. **Recorded rather than fixed**; owner: whoever next touches the signed-in suite.
- **`check:db-tz` was not run** — it requires a live database and this lane never runs `docker compose`.

## The delete filter becomes a TYPE-ENUMERATED behavioural invariant (executor 2, 2026-09-20) — cases `16.88`–`16.90`

**Owner, on the shape: *"suggestion of the constraint: sounds good. proceed with it."*** The `Delete` feature row says
the whole truth about what shipped and then admits the hole in the same sentence: the predicate has **no choke
point**, it is AND-ed into hand-written SELECTs, and `#591`'s own reviewer measured that mutating a site to
`AND TRUE` left the whole server and app-core suites **green**. So the filter was held by **convention**, and a
later edit could un-filter a tombstone with nothing anywhere to say so. These three cases are the constraint.
**This lane's id block is `16.88`–`16.99`; it minted `16.88`–`16.90` and no others.**

- **16.88** ✅ **The client read surface is walked BY TYPE against the real door, so a sixteenth read method is a COMPILE ERROR rather than a silent omission.** `apps/server/test/integration/soft-delete-client-surface.test.ts` founds a workspace, builds a project/parent/child through `POST /v1/events`, soft-deletes a marker-carrying child **through the same door**, and asks the **real** `createOnlineDataSource` every question it can ask. **The load-bearing half is the guard, not the walk:** `absenceTripwire(key: keyof DataSourceQuery): AbsenceDecision` copies `paginationTripwire`'s device (`packages/app-core/test/views/list-model.test.ts:68`), so widening the type past those fifteen members makes the return unassignable — **MEASURED**: adding a sixteenth member reddens `tsc` with `TS2322: Type 'keyof DataSourceQuery' is not assignable to type 'AbsenceDecision'`, and the two implementers besides. Two `Record<AbsenceDecision, …>` tables (**visit** it and **decide** it) plus the tripwire itself make a new member a compile error on all three counts at once, including whether the marker can reach it at all. **The absence assertion carries a POSITIVE CONTROL in the same run** — every declared carrier must carry the marker *before* the delete — because a reader that returned nothing satisfies every absence claim. **One surface is declared RETAINED on the record, not skipped:** `getTicketHistory` legitimately serves a deleted ticket (*"Its history is retained, because other events cite it"*; `read/visible-where.ts:137-139`), and asserting absence there would be asserting a lie. `getTicket` is constrained here but **by a different mechanism** — `routes/tickets.ts:366` 404s on the domain `deleted` flag, not on the constant. **Mutation-witnessed: EIGHT sites un-filtered one at a time**, every one reddening **naming the surface**, no skips — board, list, search, both halves of My Work, attention, the workspace directory's count, and the rollup. (⚠ This read "seven" when it was written; an independent reviewer counted eight and could not reproduce a seven from any partition. The count is of MUTATIONS, and the table in the PR body lists them.) — `apps/server/test/integration/soft-delete-client-surface.test.ts`
- **16.89** ✅ **The paths no client query can reach are covered by their own fixtures, and the enumeration is PUBLISHED WITH ITS SCOPE.** `apps/server/test/read/soft-delete-background-paths.test.ts` covers the five sites Arm 1 is **structurally blind** to rather than merely under-covering — `state-occupancy` and `ticket-types/:typeId/population` are admin-only routes with no `DataSourceQuery` member beside them, and the two sweeps are background jobs: `runAutoCloseSweep` (`auto-close/sweep.ts:197`), `runNotificationSweep`'s due and stale arms (`notifications/sweep.ts:187`, `:265`), `readStateOccupancy` (`builder-reads.ts:362`), `readTypePopulation` (`:438`) — plus `ticketVisibleProjectIds` (`read/workspace-counts.ts:226`), **whose own docblock said "No fixture separates the two today; stated here rather than left as an absence"** and which this case is. ⚠ **Nothing gives THIS arm completeness and the file says so** — it carries the full table of all **seventeen SQL statements** that carry the rule (13 uses of the named constant + **4 written LONGHAND**, found by a SECOND sweep), which arm constrains each, and which are constrained by neither. ⚠ **THE TABLE WAS WRONG TWICE AND BOTH CORRECTIONS CAME FROM SOMEONE WHO DID NOT WRITE IT**: it first said fourteen, from a sweep for the constant; a reviewer mutated a site that sweep could not see and found it a survivor, and widening the pattern found two more. **A sweep is only as complete as its pattern, and "the constant" is not "the rule"** — *the universe is the bug*. ⛔ **And one sentence in this case's own docblock was REFUTED outright**: it claimed *"there is no question the client can ask that reaches them"*, while the **shipped web client reaches all three admin routes** through `apps/web/src/authoring/data-source-gateway.ts` (`getStateOccupancy`, `getTypeWorkflowPopulation`, `getTicketCountsByType`). Arm 1's blindness is a property of the TYPE it walks, **not of the product**. Every case pairs its tombstone with a **LIVE twin differing in exactly one respect**, so an absence is a filter rather than an empty world: `readStateOccupancy` reads **2** against **5** unfiltered, `readTypePopulation` and `readTicketCounts` each read **3** against **7**. Mutation-witnessed: **seven sites**, each reddening naming its own case. — `apps/server/test/read/soft-delete-background-paths.test.ts`
- **16.90** 🟡 **TWO applications of the delete rule that NO arm constrains, both MEASURED as survivors rather than suspected — (a) the attachments, and (b) a TypeScript gate.** ⚠ **STATUS CHANGED 2026-09-20: (a) is FIXED — cases `16.96`–`16.99` — and (b) and (c) are NOT.** The marker is 🟡 rather than ✅ for exactly that reason: this case is a composite, two of its three parts are still open under their own named owners, and flipping it to ✅ would report a fix that covers two thirds of what the sentence asserts. **The (a) half below is kept as written, because it is the measurement the fix was made from; the entries at the end of this file carry what changed.** **(a)** A soft-deleted ticket's ATTACHMENTS are still served, while the ticket itself 404s. MEASURED, RECORDED WITH A NAMED OWNER, NOT FIXED.** One row from `insertAttachment`, one ticket, deleted through the real door: `GET …/tickets/:id` → **404**, `GET …/tickets/:id/attachments` → **200** carrying the file — both read in the same run, with the same pair answering 200/200 **before** the delete, so the refusal is a filter and not a route that 404s everything. **THREE doors, and the third serves the BYTES**: the **list** (`GET …/tickets/:id/attachments`, `routes/tickets.ts:628`) guards `loadTicketRow` + `canSee`; the **upload** (`POST /v1/attachments`, `routes/attachments.ts:285`, guard `:356`) and the **download** (`GET /v1/attachments/:id`, `:482`, guard `:486`) guard on `canSee` alone. None consults deletion, for one ruling: `canSee` does not mean "not deleted". The sibling detail route carries the third guard they lack (`routes/tickets.ts:366`). ⚠ **The LIST half is MEASURED; the upload and download doors are read at the line and NOT independently measured — named rather than folded into the measurement.** The control is a grep with a control: `routes/attachments.ts` contains the word `deleted` **ZERO** times while the same grep finds it **6** times in `routes/tickets.ts`. **This is NOT one of the fourteen sites** — there is no predicate to un-filter, so no mutation in either arm's battery can reach it, and it is invisible to both arms rather than covered by either. That is why it is published here instead of left as an absence. **Owner: whoever next picks up the attachment surface.** Write-up: `gisik-nokma-lanes/EXEC-2026-09-20-softdelete-attachment-leak.md`. **(b)** The **18th application** of the rule is not SQL at all: `routes/my-work.ts:364` gates a CONTESTED claim's title on `row.deleted_at === null && (await canSee(…))`, and the file's own docblock calls it *"`LIVE_TICKET_WHERE`'s rule reaching the one surface that cannot filter its row"*. **MEASURED SURVIVOR** — with that conjunct removed, **89 tests across 7 files stay green**, while the same command run against `my-work.ts:141` reports 18 failures, so it *can* fail and an edit to that very file reaches the compiled artifact. Neither arm contains the word `contested` and `my-work.test.ts` never exercises a deleted ticket; covering it needs a contested-claim fixture, which is a different subsystem. **Owner: whoever next picks up the contested-claim surface.** **(c)** The client has TWO implementations of `DataSource` and Arm 1 walks only the ONLINE one: Plan 10's **replica** applies the same rule in TypeScript at `packages/app-core/src/replica/replica-data-source.ts:947` (`(state.deleted ?? null) !== null → continue`, the ticket enumeration) and `:980` (the same boundary read beside `closed`), each docblock naming `LIVE_TICKET_WHERE` as the rule it carries. **BOTH MEASURED SURVIVORS** — remove each conjunct in turn and app-core's replica suite reads 27 passed / 0 failed while `apps/server`'s `test/dual-client` reads 21 passed / 0 failed; and the mutation reached the artifact (that test imports `../../src/replica/replica-data-source.js`, not the package name, so nothing resolved through a stale `dist`). ⚠ **The pre-existing I2 note above already named these two as unconstrained, at `:888`/`:921` — it was RIGHT about them and its line numbers had rotted**, which is the case for citing by what a line READS rather than by where it sat. **Owner: whoever next picks up Plan 10's replica reads.** — `apps/server/src/routes/tickets.ts`, `apps/server/src/routes/attachments.ts`, `apps/server/src/attachments/attachment-repo.ts`, `apps/server/src/routes/my-work.ts`, `packages/app-core/src/replica/replica-data-source.ts`

### What is NOT covered, named rather than implied

- **Arm 2's completeness is a LIST, not an inheritance.** Arm 1 cannot fall behind the type it walks; Arm 2 can fall behind the sweeps it lists. It is defended by the published table in its own docblock and by nothing else — a fifteenth site spelled into a SELECT tomorrow is invisible to both arms until someone re-runs the symbol sweep. The sweep is `git grep -n 'LIVE_TICKET_WHERE' -- apps/server/src`, and it must be run **for the SYMBOL**: a search for the literal `deleted_at` reports **ZERO** in `auto-close/sweep.ts` and `notifications/sweep.ts`, which splice the named constant, and that silent empty is how the dispatcher was first misled.
- **The marker is a TITLE; a surface carrying ticket content in another field is not covered by it.** That boundary is exactly what the attachments leak lives behind, and it is stated in Arm 1's decision table at the `getTicketAttachments` row rather than left for a reader to infer.
- **Neither arm runs the app.** Arm 1 drives the real route through `app.inject` (no socket, no browser) and Arm 2 calls the readers and the sweeps in-process. A web-layer consumer that re-implemented a filter would be outside both.

## The attachment doors and the tombstone (executor 1, 2026-09-20) — cases `16.96`–`16.99`

**Owner, on the recommendation: *"attachments leak: do as you recommend."*** `#591` gave a soft-DELETED ticket a
third guard on its DETAIL route and left the routes beside it carrying only `loadTicketRow` + `canSee`. `canSee`
is the VISIBILITY predicate and by its own written ruling does not mean "not deleted"
(`read/visible-where.ts`: *"Deletion is not visibility"*), so a ticket the product had removed from every view
kept serving its file list, kept serving **the bytes**, and kept **accepting uploads** — content accreting onto
a ticket nobody can see, which is the worse half of the disclosure.

**MEASURED at the base before any fix, one ticket, through the real doors**: live, the list answers 200 with the
row, the download door streams the exact bytes, and the upload door answers 201; after `ticket.deleted` through
`POST /v1/events`, the detail route 404s while the list still answers **200**, the download still answers
**200**, and the upload still answers **201**. Those four arms are the new suite's RED, and the two arms that
must NOT move — the empty list's 200 and a ticket the caller may not see — are green BEFORE the change, so a
fix that broke them could not be mistaken for one that worked.

**The fix is a THIRD GUARD AT THE ROUTE and never a widened `canSee`**: `read/live-ticket.ts` asks
`LIVE_TICKET_WHERE` — the constant this repo wrote so the rule has one spelling and stays greppable — and each
door calls it after `canSee`, answering the same 404 body it already answered. Folding deletion into the
visibility predicate would break the `canSeeResolved` cross-check AND make `listVisibleTickets`, whose SELECT
has no `proj_tickets` in its FROM, a runtime "missing FROM-clause entry for table t".

**This lane's id block is `16.96`–`16.99` and it minted all four. Why not from `16.91`:** the allocation table
above gives executor 1 `16.81`–`16.99`, and the merged soft-delete lane's own handoff claims `16.91`–`16.99` as
its block and is **live in the tree while this was written** (`exec2/comment-thread`). `16.91` is inside both
claims, so it is the one id that can collide; the top of the shared block cannot. Executor 2 spent `16.88`–`16.90`
and stopped there.

- **16.96** ✅ **A tombstoned ticket gets the SAME refusal from every refusing door within its family, and the two HISTORY doors still serve it — pinned rather than discovered.** The four doors that answer 404 for a deleted ticket are asserted against the ghost's own answer for their own door — the two `routes/tickets.ts` doors (detail, attachments list) against the ghost *list*, and the two `routes/attachments.ts` doors (upload, download) against the ghost *upload* and the ghost *attachment id* respectively — so neither can pass on the other's behaviour. **The asymmetry is the other half and is asserted**: `GET …/tickets/:id/events` answers 200 carrying the `ticket.deleted` event and `GET /v1/tickets/:id/history` answers 200, because *"Its history is retained, because other events cite it"*. The owner has ruled the FILES are not that question, and the attachments route's own docblock claim that the ledger and the files are *"one question about one ticket"* is corrected by this change rather than left standing beside it. A live ticket's events door answers 200 in the same run, so the two 200s are not an empty world. ⚠ **THE TWO FAMILIES DO NOT AGREE WITH EACH OTHER, and the suite does not assert that they do**: `routes/tickets.ts` refuses with `{error: 'not_found'}` and `routes/attachments.ts` with `{error: 'not-found'}` — MEASURED here, a recorded divergence whose owner is *"whoever next touches `attachments.ts`"*. **This lane IS that owner and declines it deliberately**: it is a wire-vocabulary change to a shipped API, not this leak, and six assertions in `attachments-{download,upload}.test.ts` pin the hyphen. Recorded in the PR body. — `apps/server/test/integration/soft-deleted-attachments.test.ts`
- **16.97** ✅ **The attachments LIST door refuses a tombstoned ticket, and refuses it byte-identically to a ticket that never existed.** Live, the door lists the ticket's file (the positive control, so a door that 404s everything cannot pass); then the tombstone, through `POST /v1/events`; then the detail route's 404 is read as the reference that the delete landed. The deleted answer is compared to the GHOST ticket's answer on the raw payload **and** every header but `date` — a status code alone is not this property. **The arm that must not regress is in the same run**: the same ticket, asked by a signed-in person with no membership anywhere, still answers 404 for the reason it always did, held against the ghost rather than against the tombstone's own answer. A second case keeps the **empty list at 200** with a live ticket holding no files — the pair case 16.49 pins, and the one that must not be folded into the new guard, because `AttachmentList` returns `null` on empty (*"must not promise there are none"*). — `apps/server/src/routes/tickets.ts`, `apps/server/src/read/live-ticket.ts`
- **16.98** ✅ **The UPLOAD door refuses a tombstoned ticket, and NOTHING ACCRETES — asserted at two levels, because "the request was refused" and "nothing was stored" are different claims.** The `beforeAll` uploads each fixture's file through the real door, so the 201 is the live control; after the tombstone the same upload is refused, byte-identically to the ghost ticket's upload. **The accrual proof is the load-bearing half**: the object store is counted before and after the refused upload and reads the same, AND the ticket is RESTORED through the product's own undo (`ticket.restored`) and its list read back — showing the refused file is absent from the list it would have joined. The store count alone would miss a row written without bytes; the list alone would miss an object written without a row. — `apps/server/src/routes/attachments.ts`, `apps/server/src/read/live-ticket.ts`
- **16.99** ✅ **The DOWNLOAD door, which serves the BYTES, is the one where a 200 after the delete is the whole disclosure rather than a hint of it.** Live, the exact bytes come back (`rawPayload.equals(FILE)`, not a status check — this door's whole job is the content). After the tombstone: the shared 404, byte-identical to a nonexistent attachment id, **asserted not to be the file**, and with `content-disposition` absent. ⚠ The door was asked whether it resolves through the ticket at all, because an attachment id is addressed on its own and a caller holding a pre-delete URL never passes a ticket-scoped route: **MEASURED, it does** — the handler reads the row, takes `row.ticketId`, and asks `canSee` about the TICKET, so the guard is the ticket's and is asked here as well as at the list door. ⚠ **`x-content-type-options` is deliberately NOT asserted absent here, and that is a measurement, not an omission**: `http/security-headers.ts:51` sets the same header on EVERY response of the assembled app, so in this suite its presence is the security surface's and says nothing about this handler. The route-isolated `attachments-download.test.ts` is where the handler's own header discipline is observable. — `apps/server/src/routes/attachments.ts`

**The independent review ran BEFORE the PR opened, told to falsify, and it earned its keep**: eight load-bearing claims, each answered `CONFIRMED / REFUTED / IMPRECISE` with the `file:line` it read — **6 confirmed, 2 imprecise, 0 refuted, plus five findings**, two of which needed action and were taken.

1. ⚠ **The refusal-ORDER note in `routes/attachments.ts` was left stale by this change.** Its own list said *"In the order they can actually fire"* and had seven steps; the tombstone 404 is a **second, distinct 404 reason** and appeared nowhere in it. Corrected — the list now has eight steps, with step 6 named as the tombstone and the reason it sits BELOW the visibility refusal (a caller who may not see the ticket must get that answer whether or not the ticket is also deleted, or deleted-ness becomes an inference they were never owed) and ABOVE the byte-decided refusals (a tombstone must not become detectable by uploading rubbish). The renumbering is called out in the text, because a reader comparing it to an older copy will find the numbers moved.
2. ⚠ **The equivalence paragraph in `read/live-ticket.ts` named ONE divergence where there are TWO.** It said the detail route and this reader differ in "ONE reachable-in-theory case"; the mapper's OR (`deleted_at === null || deleted_by === null`) makes a second — a row with `deleted_at` set and `deleted_by` NULL is SERVED by the detail route and REFUSED here. Both are unreachable through the writer, and both are now named, with the sentence that matters: **the equivalence is a fact about the WRITER, not about the schema.** No writer but `upsertTicket` reaches `proj_tickets` today; the day one exists, these doors can drift and nothing would notice.
3. **Confirmed rather than assumed, and the confirmation is the review's own best reading:** 16.98's two accrual levels are **complements, not redundancy.** Mutating an object write onto the refused path reddens the store count and leaves the restore-then-list arm GREEN; mutating a ROW write reddens the restore-then-list arm and leaves the store count GREEN; and with the store-count assertion neutralised, an object written on the refused path leaves the whole file **6 passed / 0 failed**. Each level is blind to the other's half, so neither alone is the property.
4. ⚠ **The review's own first row-mutation was invalid and it caught that itself**: inserting unconditionally produced a 500 and **six skipped**, the same "a mutation that never ran looks killed" shape this lane's own battery hit. Re-cut to act only on the refused path, which is what produced the reading above.
5. **All three restored files verified by checksum** (pre == post), tree left clean, HEAD unmoved — reported by the reviewer, which also independently confirmed the door sweep, the untouched `visible-where.ts`, and the history asymmetry.

**The mutation battery — four mutations, all four killed, control green before and after, restore verified by checksum.** M1 list-door guard disabled → **16.97** and **16.96** redden, nothing else. M2 upload-door guard disabled → **16.98** and **16.96**. M3 download-door guard disabled → **16.99** and **16.96**. M4 the RULE itself (`LIVE_TICKET_WHERE` → `TRUE`) → all four redden and **the two must-not-regress arms stay green**. Every mutation reddens its own door's case and the agreement case — which is what 16.96 asserts, so it is expected to move with any door — and leaves the other doors' cases untouched. ⚠ **The first run of this battery was INVALID and is recorded because the failure mode is the one this repo keeps meeting**: M1–M3 replaced the `if (…) {` LINE with a comment, leaving an orphaned block, so the file would not parse and the run reported **zero tests** — which the script's own verdict logic scored as a SURVIVOR, the damaging direction that condemns a check which is fine. Fixed twice: the mutation now disables the condition (`if (false)`) so the file still parses, and the runner refuses any run whose test count is not 6, because a mutation that never ran is not a mutation that survived.

**A SECOND suite's mutation battery covers the repair that rode along with this change** — `S1` empty the refusal pin, `S2` remove the tolerance, `S3` disable the list-door guard. All three killed; see 16.90's status note and the entry below.

### What is NOT covered, named rather than implied

- **`GET /v1/workspaces/:ws/tickets` (the workspace ticket list) has no soft-delete predicate**, and that is a RECORDED ruling rather than an omission (`visibility/visible-tickets.ts`): its SELECT has no `proj_tickets` in its FROM, so the column is unreachable without adding a join, and the same note records that the route has no client consumer, measured by a sweep of both clients against a positive control. Not touched here.
- **The two HISTORY doors** (`…/tickets/:id/events`, `/v1/tickets/:id/history`) are deliberately left serving — 16.96 asserts that rather than closing it.
- **`routes/my-work.ts`'s contested-claim title gate and the replica's two TypeScript applications of the rule** remain measured survivors under their own owners — 16.90 (b) and (c), unchanged by this lane.
- **The refusal costs one extra query per request on three doors**, and nothing asserts the query count. `read/live-ticket.ts` records why it is a separate read rather than a field taken off the state the detail route already holds.
- ⚠ **`read/visible-where.ts`'s published COVERAGE COUNT is now stale, and this lane did not correct it.** Its docblock says *"**17 SQL statements carry the rule** (13 + 4)"*; this change adds one more (`read/live-ticket.ts` splices the constant against `proj_tickets t`), so the total is at least one short, and three of this change's applications are at ROUTES rather than in SQL, so the constant-vs-longhand axis is no longer the only split. **The dispatch forbids editing that file** — the fix is a guard at the route, never a change to the predicate — so the correction belongs to **whoever next touches `visible-where.ts`**, and the same docblock already says why a bare total is the wrong artifact to trust: three earlier versions of it (11, 14, 17) were each wrong, and *"the method is the thing that matters and the method is the grep."*

## The Add-subtask affordance (executor 1, 2026-09-20) — cases `16.91`–`16.95`

**The offering, not the refusal.** The owner pressed **Add subtask** on an Errand and was told
`"Errand" cannot go under "Errand": a ticket's parent must be a bigger kind of work.` **The refusal was
correct and the server was right.** What was wrong was the payload: `addSubtask` sent
`typeId: state.typeId` — the PARENT'S OWN type, which is what `typeId: state.typeId` sent — and
`checks/hierarchy.ts:133` refuses `type.rank <= parentType.rank`, which EQUAL RANKS satisfy. So the
control was dead on **every** ticket, in **every** workspace, for **every** type, and the owner's report
was one instance of a universal failure rather than a property of `errand`. MEASURED at the payload
before any fix: pressing the button on an `errand` produced `typeId: 'errand'`.

**Nobody chose that type; it was inherited.** `git blame` puts the line in door F's lane (`b6c88359`,
2026-09-19), whose docblock argues `start: 'focus'` and the title rule at length and **never mentions the
type**. The one case that covered it asserted `typeId: expect.any(String)` — it could see that a string
was there and not WHICH, so the field that was wrong was the field the case declined to name, and its
fake source always commits, so the refusal path was never reached from a test. The prototype names this
operand and gets it right: `type: "Task"` (`desktop.dc.html:3654`), a FIXED type, never the sheet's.

**The affordance and the payload now read ONE answer.** `subtaskTypeFor` asks the rank rule in the one
direction the client can answer — a legal child is a type whose rank is **strictly greater** than the
parent's — over the **workspace's own ladder**, never `BUILTIN_TICKET_TYPE_SEEDS`.

⚠ **`DEEPEST_RANK` is NOT a bound here, and reading it as one is the natural mistake.** The constant
(= 4, `packages/domain/src/ticket-types.ts:136`) governs ROOT creation alone — a type at that rank or
below may not sit at project root (`hierarchy.ts:108`) — while a child's rank is unbounded above, which
is that file's own reason for writing `>=`: *"a type DEEPER than sub-task is smaller still and cannot
coherently be exempt… `===` would leave an escape hatch where defining rank 5 floats your tickets free."*
The interval is `(parentRank, ∞)`, and the dispatch that opened this work wrote `(parentRank, DEEPEST_RANK]`.

**The ladder this was measured against is the owner's**, read READ-ONLY from the dev database
(`proj_ticket_types`, port 54330): workspace `0TZSS5W6ATCTF2YBPMWGGP9JF5` holds `epic 1 · story 2 ·
task 3 · errand 3 · sub-task 4`. **`errand` is workspace-defined at rank 3, sharing a built-in's rank**,
so a fix hard-coded to the built-ins would agree with a default workspace and disagree with the one the
owner is looking at. For an Errand a legal child **does** exist (`sub-task`, rank 4), so the dispatch's
proposed sentence — *"This is an Errand — nothing smaller can sit under it"* — is **false of the ticket it
was written for**; the sentence now names THIS ticket's type, read off the ladder.

**Three LADDER states, but FIVE render outcomes, and the extra ones are the point.** *"No type is deeper"*
and *"the ladder has not been read"* are different facts, and rendering the first for the second asserts an
absence this client has not measured — `Features.md:88`'s rule for the New-ticket control, *"TOLD … rather
than handed an empty one"*. The outcomes: an unread ladder renders **nothing** and claims nothing; a ladder
read but unusable — **the read FAILED**, **this ticket's type is ABSENT from it**, or **no type is deeper** —
renders **its own sentence for each**, which is three distinct sentences and not one; and a READ ladder with
a legal child draws the form. **A disabled control is never one of the answers** — it
still asserts the action exists.

- **16.91** ✅ **The form is WITHHELD where no type in the workspace's ladder is deeper, and the sentence names THIS ticket's type.** The withheld arm is `sheet-subtask-withheld`, `role="status"` and not `alert` — nothing went wrong and nothing was attempted; it is the role the New-ticket dialog's unavailable-parent sentence already wears. **The control is in the same run**: one rank deeper and the form is back, so a withheld arm cannot pass for a component that never draws anything. — `packages/app-core/src/views/ticket-sheet.tsx`
- **16.92** ✅ **THE OWNER'S CASE: an Errand takes a subtask, and the child's type is LEGAL — asserted in both directions so a fix sending some OTHER illegal type cannot pass by differing.** `expect(payload.typeId).not.toBe('errand')` AND `.toBe('sub-task')`, plus the parent, on a ticket whose type shares a built-in's rank. `sub-task` (rank 4) is the shallowest type strictly deeper than rank 3. — `packages/app-core/src/views/ticket-sheet.tsx`
- **16.93** ✅ **An unreadable ladder and an UNKNOWN ticket type each withhold the form and SAY which question could not be answered — never a silent absence, and never each other's sentence.** Two arms, because a case that only threw would be satisfied by a fix that collapsed "could not read" and "this type is not in the ladder" into one state. Arm one carries the read's own words; arm two is the shape `16.26` already records — an empty or partial ladder is something the product really serves. — `packages/app-core/src/views/ticket-sheet.tsx`
- **16.94** ✅ **The built-in `Task` is preferred ONLY where it is legal, and its absence withholds nothing — both directions, because either arm alone is passed by a rule nobody wants.** Arm one: a ladder with no `task` in it at all still yields a legal child (`chore`), which a fix that looked up the built-in id and did not fall back would withhold. Arm two: under an `epic` (rank 1) with the owner's ladder the shallowest legal child is `story` (rank 2) and the answer is `task` (rank 3) — the prototype's own operand — which a rule that never preferred it would miss. — `packages/app-core/src/views/ticket-sheet.tsx`
- **16.95** ✅ **While the ladder is still unread NOTHING is offered and NOTHING is claimed — and it arrives.** An absent control may mean "not yet" or "not ever" and only the arrival distinguishes them, so both arms are in one case: the deferred ladder resolves and the form appears. Rendering the 16.91 sentence here would assert an absence the client has not read. — `packages/app-core/src/views/ticket-sheet.tsx`

**The mutation battery — five mutations, all five killed, and EVERY RUN ASSERTED ITS TEST COUNT (100), because a mutation that makes the file unparseable runs ZERO tests and a `failed`-only verdict scores that as a SURVIVOR — the damaging direction that condemns a check which is fine.** M1 the payload reverted to `state.typeId` → **16.20, 16.92, 16.94**. M2 the form drawn regardless of the answer → **16.91, 16.93, 16.95** — exactly the three withholding cases and nothing else. M3 the `task` preference dropped → **16.94 ONLY**, which is why arm two of that case exists. M4 `rank >` → `rank >=` → **16.20, 16.91, 16.92, 16.94**. M5 the unread state collapsed into the unknown-type state → **16.93, 16.95**. Each mutation reddens the cases that own its property and leaves the rest green; the file was restored and checksum-verified after every one.

**One judgement in this change is FLAGGED FOR A RULING rather than settled here.** Where the prototype's `Task` is not legal — under a `task`/`errand` parent (equal rank) and under a `sub-task` parent — the fallback is the **shallowest legal type**. Whether it should instead be the deepest is a product question and the owner's; `subtaskTypeFor` is a pure function with its own cases so the answer changes in one line. **The withheld sentence is likewise provisional and the owner's**, quoted verbatim in the PR body.

**Two cases moved with this change, and one of them was the check that let the defect ship.** `16.20`'s `typeId: expect.any(String)` is now the literal `'sub-task'`; and the shared `sheetSource` ladder gained `sub-task` (rank 4), because the default world must be one where the Add-subtask form can legitimately draw — with the ladder as it stood (`task` 3, `epic` 1) NOTHING could sit under the default ticket and every case that presses the button would have become a case about a correctly-withheld form. It changes no existing case's behaviour: the ladder is read for the `Type` row's NAME (which resolves off `task`, untouched) and for this decision.

### What is NOT covered, named rather than implied

- ⚠ **THE WITHHELD SENTENCE CLAIMS MORE THAN THE CLIENT MEASURED, AND THE REVIEW FOUND IT (F7).** *"This is a X — nothing smaller can sit under it"* is a statement about the WHOLE WORKSPACE, computed from whatever `getTicketTypes` returned. If a ladder is PARTIAL — it holds this ticket's type but not a deeper type the workspace also has — the sentence asserts an absence out of a read that did not cover the world. **16.26 already records that a partial or empty ladder is a shape the product really serves**, and the docblock above argues only the unread-versus-empty distinction, not this one. **The failure direction is safe** — withholding can only UNDER-offer, and an offered form is always legal — so this is a product caveat and not a defect, and it is recorded rather than fixed because narrowing it would mean refusing to answer at all on a partial read, which is a worse screen. **Owner: whoever next touches this section's copy or its ladder read.**
- ⚠ **`errand` and `task` share rank 3, and nothing in the product prevents a workspace from defining two types at one rank.** This change reads that ladder correctly rather than assuming uniqueness; it does not add a constraint.
- ⚠ **The withheld sentence is single-line copy owned by the owner.** It ships as a default and is quoted verbatim in the PR body so it can be changed in one line.
- **`precheck.ts` still answers `not-evaluated` for both `ticket.created` and `ticket.reparented`**, and this change does NOT touch it: that module reads `ClientStateCache`, which holds no ticket-type store (`precheck.ts:251-267`), while the sheet reads the ladder over the wire. The two are different questions about different facts, and the sheet's answer decides only what to OFFER — never whether the event will be accepted, which stays the server's.
- ⚠ **A POPULATION OF `file:line` CITATIONS INTO `ticket-sheet.tsx` HAD ALREADY ROTTED, AND THIS LANE MEASURED IT RATHER THAN SWEPT IT.** Adding 171 lines to that file shifts every citation into it below the insertion. The population, counted with the unit NAMED because three units give three different numbers: **45 occurrences, 41 distinct (file, line) pointers, across 13 files** (one of the 13 is not Markdown — `packages/editor/src/components/TicketEditorSlot.tsx:35`). **Only TWO were live pointers, and both are repointed** — `docs/lanes/controller-state.md:116`'s `:1683-1693` (now `:1807-1817`) and `:1745-1778` (now `:1869-1902`) — each verified by re-reading the new line, which is `gn-ticket-sheet__parent` and the chip's own docblock respectively.
- ⛔ **AND A THIRD WAS REPOINTED, THEN WITHDRAWN — the independent review caught it and it is the most instructive thing in this change.** `docs/lanes/executor-2-state.md:1374`'s `:491` was repointed to `:554` on the strength of a PARTIAL read of its own prose. Read in full, that sentence is *"the comment is carried end-to-end (`transition-dialog.tsx:376` → `ticket-sheet.tsx:491` → `domain/src/workflow.ts:185`)"* — and old `:491` is `const page = await dataSource.query.getTickets(…)`, the SUBTASKS live query, not the comment carry (old `:617`, now `:680`). **So `:491` was ALREADY WRONG and repointing it was an arithmetic shift of a rotten pointer — precisely the practice this note says it refuses.** The file is reverted whole and carries no change from this lane. **Content plausibility is not liveness**, and a partial read of the citing sentence is not a read of it.
- ⚠ **A FOURTH CANDIDATE WAS WITHDRAWN before it was touched**, on the same rule: `docs/lanes/executor-state.md:693`'s `:1596-1607` reads as a live pointer to a component comment and is a HISTORICAL record of where a hold was written down.
- **The rest were ALREADY WRONG before this change.** The evidence is the cited lines themselves, and ⚠ **this list is a SAMPLE OF EIGHTEEN, not all 45 — I read the cited line for each one named here and for no others, and any not named is UNVERIFIED**: `docs/hig-second-audit.md:44` cites `:334-343` for the three self-describing parent branches and old `:334` is `canSetVisibility = true,` (the branches are at `:1679-1693`); `docs/product-coverage-map.md:239` and `docs/lanes/executor-2-state.md:1324` both cite `:979` for the Assignee picker and old `:979` is a docblock line about the prototype's handler (the picker is at `:1311`); `docs/lanes/controller-state.md:729` cites `:1135-1136` for the subtask row's two spans and old `:1135` is the refusal comment (the spans are at `:1800`); `test-cases/13-second-wave-board-actions.md:1105` cites `:429` for `TicketSheet` rendering `Sheet` and old `:429` is `);` (`<Sheet` is at `:516`); `docs/hig-reconciliation-audit.md` cites `:391-403`, `:480-509`, `:371-373`, `:170`, `:298-315` and `:324` for constructs that sit at `:1249`, `:2062`, `:1282`+, `:1521` and `:1653`+; `docs/lanes/owner-holds.md:128` cites `:486` and the `ticket.field_set` submit is at `:612`; `docs/superpowers/specs/2026-09-17-backlog-and-closed-design.md`'s `:195`, `:184` and `:279` are the `submitting` state at `:411`, `transportError` at `:361` and `submitTransition` at `:607`.
- ⚠ **AND THE BUCKET IS NOT ALL ROT: four of the rest are DELIBERATELY HISTORICAL and must not be counted as wrong.** `docs/lanes/executor-state.md:1011` names `:276` and lists the real sites in the same breath (*"resolved BY CONTENT … the real sites are `:501/:543/:585/:705/:868`"*); `:1979-1985` is a table whose own text records *"P25 deleted the absence"*; `docs/lanes/owner-holds.md:127` quotes a sentence that *"was TRUE when written"*; and `test-cases/13-owner-requests-and-backlog.md:1144` is a from→to repair mapping (`:276`→`:299`). **A citation that tells the reader to re-measure self-corrects**, and the same reasoning that withdrew `:693` applies to these.
- ⚠ **The rotted ones are NOT repointed, deliberately**: mechanically shifting an already-wrong citation relocates it and makes it look maintained — which is exactly what the withdrawn third repoint did before the review caught it. Nothing detects any of it: `check:citations` counts CASE-ID citations (this file: 79 cited / 0 uncited) and **no gate resolves a `file:line`**. **Owner: whoever next edits `ticket-sheet.tsx` at scale, or the owner of a future citation gate** — the old→new map is reproducible from `git show origin/main:packages/app-core/src/views/ticket-sheet.tsx` against the working tree.
- **The refusal path itself is unchanged and is still reachable from other clients**: a caller that POSTs `ticket.created` directly can still send a same-type child and still gets `hierarchy.rank`. This change removes the SHEET as a route to it, which is what the dispatch scoped; it does not make the refusal unreachable in the product.


## The seeds are PARSED, and the typed link is ON (executor 2, 2026-09-21) — cases `16.76`–`16.80`

**Owner ruling 2026-09-20, verbatim: *"both"*.** Two written decisions, each citing spec §2 (*"nothing silently becomes
markup"*), were put to the owner and both were reversed: `markdownLinks` goes `false` → `true` so a typed
`[text](url)` becomes a link, and the seeds' record prose is parsed instead of rendered literally. **Each reversal is
recorded where its decision was written, and the record is superseded in place, never deleted** — `plainTextDoc`'s
docblock in `apps/server/src/seed/doc-text.ts` for the seed half, `packages/editor/src/schema/extensions.ts` for the
option. Which decision moved and where its record now lives is stated in the PR body.

**The measurement the parse had to survive.** Read READ-ONLY from the dev database (54330): **23 descriptions, ALL of
them literal-text docs, zero marks anywhere** — `**bold**` in **111** text nodes, `*italic*` in **135**, `` `code` ``
in **34**, two `[text](url)`, **32** `#` heading lines, **15** dash-bullet lines, **17** numbered ones. The 23 strings
were also rebuilt from the frozen board (`reference/convenience-corner-tracker/board.data.js`) and matched the stored
docs **character for character in both directions**, which is what makes the corpus cases below run over the REAL
strings rather than a fixture.

- **16.76** ✅ **The parser handles exactly the constructs the shipped records were measured to hold, and REFUSES the rest.** `**bold**`, `*italic*`, `` `code` ``, `[text](url)`, `#` headings, `-`/`+`/`*` bullets, `1.` ordered items, blank line → empty paragraph. Refused and left as characters, each with a case: `_underscore_` emphasis (**the real records write `submitted_on` and `enroling_in_apple_developer_program` — a naive `_…_` rule would emphasise an intraword run nobody wrote as markup**), `__bold__`, `~~strike~~`, `> quote`, ``` fences ```, `---`, and a bare URL (nothing autolinks). ⚠ **An unmatched delimiter stays literal** — `2 * 3 * 4` is `2 * 3 * 4` — and a single `*` may not open with `*`, which is what stops a stray `**` being re-paired into an italic. — `apps/server/test/seed/markdown-doc.test.ts`
- **16.77** ✅ **THE PARSE IS LOSSLESS OVER THE 23 REAL DESCRIPTIONS**, asserted line-for-line against an oracle written from the SYNTAX RULES and never by calling the parser — a comparison against the parser's own output could not fail. Both halves: the prose (every character survives; the marks the corpus holds are produced, pinned per construct) and the record block (not one character touched, no mark gained). ⚠ **The oracle's precondition is asserted, not assumed** — it strips delimiters by count and is only valid where every `*` and backtick is PAIRED, which the corpus is (measured: zero odd-count lines) — and its **control runs in the same invocation**, proving it is not an identity, so a parser that did nothing could not pass. — `apps/server/test/seed/doc-text.test.ts`
- **16.78** ✅ **A description is split into markdown PROSE and a LITERAL record block by CONSTRUCTION — the builder says which lines are prose, never an inspection of the text.** The witness is a record note that looks like a list (`- first thing`): it stays characters, while the same two lines through the markdown renderer do become a `bulletList` — the control is in the same run, so the case cannot pass by the renderer being broken. ⚠ **No line of the shipped corpus starts with a block marker, so on real data alone a whole-string parse would look identical — the split would be untested decoration, which is why this case exists.** — `apps/server/test/seed/cc-map.test.ts`
- **16.79** ✅ **THE REAL DOOR: the description the LEDGER holds is the parsed doc.** Seeded through `ingestClientBatch`, written by the projection registry, read back out of `proj_tickets` — the prose parsed (asterisks gone, a bold mark holding their run) and the record block byte-for-byte beside it, with every emitted node checked against the editor's closed schema vocabulary. ⚠ Two halves in one case, so a fix that parsed everything or nothing fails here. — `apps/server/test/seed/seed-cc.test.ts`
- **16.80** ✅ **The plan seed's own descriptions obey the same split** — 178 of them, one `Goal:` per plan and one `source:` per task — and the prose half is asserted on a plan that REALLY carries markdown: **3 of the 11 goals do** (measured), plan 06's backticked package names becoming `code` marks. ⚠ Corrected mid-write: the case first asserted against a fixture goal, and a fixture cannot show that the real series is parsed. — `apps/server/test/seed/seed-dev.test.ts`

**The mutation battery — six mutations, six killed, EVERY RUN ASSERTING ITS TEST COUNT (103), because a mutation that makes a file unparseable runs ZERO tests and a `failed`-only verdict scores that as a SURVIVOR.** M1 `plainTextDoc` reverted to the literal renderer → **10 cases**, including 16.79 and 16.80. M2 the record block marked `markdown` → **16.78 ONLY**, which is exactly why that case exists. M3 the bold rule disabled → **10 cases**, the census among them. M4 a heading keeps its structure and loses its text → **16.77 and the heading case** — a real loss, and the losslessness case caught it. M5 the link rule drops the destination → **16.77 (the link case) and the parser's link case**. M6 in the editor, `markdownLinks` back to `false` → **4 cases including 9.95**, the typed `[text](url)` case. Every mutation restored by copy from a snapshot with sha256 verified — **never `git checkout -- <file>`, which would have destroyed this uncommitted work and left a clean `git status` reading like success.**

### The existing 23 dev rows — measured, and NOT silently corrected

**They are the OLD shape, and re-seeding does not fix them.** The seed's ids are deterministic (`seedUlid`), so
`existingSeedEventIds` skips every already-present event — pinned by `13.83`/`13.84` — and a re-run of the corrected
seed commits nothing. The rows are dev-seed data and are reproducible from the frozen board, so the honest remedy is a
database seeded FRESH, not a corrective ingest: an ingest would mint event ids the seed can never reproduce on a ledger
whose whole premise is that the events are the record. **⚠ NOT PERFORMED HERE: 54330 is a live stack another lane is
using, and `docker compose` is forbidden in this topology. Owner: whoever next rebuilds the dev stack.**

### What is NOT covered, named rather than implied

- ⚠ **The parse is a one-way reader; nothing writes markdown back.** Markdown is NOT the stored format and this change
  does not make it one — the output is schema-v1 doc JSON and only that.
- ⚠ **The parser's vocabulary is closed at what the measured corpus holds.** A future record containing `_italic_`,
  `~~strike~~` or a fenced code block will render it LITERALLY. That is the conservative direction and it is a choice,
  not a gap: it is the same rule as the refusal list in 16.76.
- ⚠ **`plainTextDoc`'s name now under-describes it** (it parses). Kept deliberately — the reversal's record belongs on
  the symbol the decision was written about, and a rename detaches them — with the accurate spelling `markdownToDoc`
  named in its docblock. **Owner: whoever next renames the seed's doc layer.**
- ⚠ **The link rule offers no escape suggestion where the bold rule does** — measured in `9.95`, cause NOT established,
  recorded with a named owner in `packages/editor/src/schema/extensions.ts` rather than guessed at here.
