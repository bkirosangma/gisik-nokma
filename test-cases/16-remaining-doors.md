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
| **exec 1** | `16.1`–`16.30` |
| **exec 2** | `16.31`–`16.60` |

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

- **16.15** ✅ Lists this ticket's children, **each with its OWN state** — the empty state's claim ("a subtask is a ticket of its own") asserted in structure, not just in words.
- **16.16** ✅ The empty state draws the prototype's sentence, verbatim, when `rollup` is null (the server's own spelling for "no children at all").
- **16.17** ✅ **Refuses to render a short list:** when the rollup counts more children than were read, the section says so in the server's numbers and **draws no rows**.
- **16.18** ✅ The control for 16.17 — with the count AGREEING, the list IS drawn and no refusal appears.
- **16.19** ✅ Lists **only this ticket's** children: a sibling's child in the same project is not one of them.
- **16.20** ✅ **Add subtask** sends `ticket.created` with **this ticket as `parentId`**, the title **as typed**, and `start: 'focus'` — the prototype births a subtask in the workflow's first state (`col: states[0].key`).
- **16.21** ✅ A refused title shows the **server's own sentence** and **keeps** what was typed. An `invalid` answer carries `message`, not `reason` — reading the wrong arm renders `undefined`.
- **16.22** ✅ Does **not** draw the prototype's `Subtask of {parent}` chip — out of the dispatch's row, and this case exists so adding it later is a decision rather than a drift.

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
- **The `Subtask of {parent}` chip is out of scope**, not tested and not built — see `16.22`, which asserts its ABSENCE rather than its behaviour.
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
half, the same way `16.22` asserts F's chip absence.

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
