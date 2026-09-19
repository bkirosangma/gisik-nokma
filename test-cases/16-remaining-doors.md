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
