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
| **exec 1** | `16.1`–`16.30`, **then `16.32`–`16.40`** (taken 2026-09-19 late for `/v1/search`) |
| **exec 2** | **`16.41`–`16.60`** (`16.31` spent on the evidence upload; `16.32`–`16.40` reallocated to exec 1) |

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
trap in a new costume.

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
