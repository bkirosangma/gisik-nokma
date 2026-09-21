# 13. Second wave: roles review, navigation, members styling — test cases

Part of bucket 13 (`Features.md` §13) — one part-file of the catalogue split performed 2026-09-19.
Index and id-block allocation: [`13-deployment-dogfooding.md`](./13-deployment-dogfooding.md).
Case ids are unchanged and are never renumbered by the split.

## Task 7's review round — one independent reviewer, verdict CLEAN, and two surviving mutations

One reviewer, dispatched before the PR opened, read the frozen tip `74b12565` (base `dda4c342`) and
attacked every new test by mutation. **Verdict: CLEAN** — no defect that breaks behaviour or violates
the Task 7 contract. Five findings, recorded here in full because **three of them were about claims
rather than code, and the two surviving mutations are worth more than the kills**.

- **Important — `t.reopened_at` in `PROJ_TICKET_COLUMNS` is dead selection, and pinned by nothing.**
  The plan's Task 7 `Files:` line requires it; nothing reads it. `assembleTicketCards` never touches
  `row.reopened_at`, the only consumer of the column is `rowToTicketState` (fed by `SELECT *`), and the
  plan's own Task 8 Step 3 gives the sweep its own SQL, so no reader is waiting for the list to carry
  it. **Mutation M3 (delete `, t.reopened_at` from the list) SURVIVES the entire server suite —
  reproduced here, 1548 passed / 0 failed, byte-identical to baseline.** The line was kept because the
  plan is the authority being audited against, and both readings were priced rather than hidden.
  **RULED, AND THE RULING IS DROP.** The controller checked the two row types separately rather than
  assuming they were one decision — `rowToTicketState` reads `row.reopened_at` off **`TicketRow`** in
  `apps/server/src/projections/tickets.ts`, a DIFFERENT type fed by that file's own queries, and that
  read stays; `ProjTicketRow` and `PROJ_TICKET_COLUMNS` exist to feed `assembleTicketCards`, which
  builds cards, and the plan itself says this is not a card field. So **both the constant entry and the
  declared `ProjTicketRow.reopened_at` member were removed**, and the surviving mutation is what
  settled it: keeping a dead column in a shared SELECT to satisfy a line written on an assumption is
  the "carried but never read" pattern this repo's mapper rule exists to prevent, wearing the opposite
  hat. The plan contradicted itself — Task 7's `Files:` line versus Task 8's own SQL — and the code now
  agrees with Task 8. Verified after the drop: the server suite is still **1548 passed / 5 skipped**,
  unchanged, because the line was read by nothing.
- **Minor, FIXED — the tolerance's stated rationale was false.** `mapOptionalInstant` is right to be
  tolerant (`?? null` is what the plan mandates, the value is policed, and no surface reads the field),
  but the docblock justified it with "keeps the same SHAPE as the one `replica-data-source.ts` folds
  locally" — **and no such comparison exists**: the repo's two-sided rig compares the server
  PROJECTION against the replica, and neither side passes through this mapper. The comment now states
  the real price (a spent tripwire for a comparison nobody makes) and says when the read should become
  strict. A comment asserting a signal the product does not emit is the same defect class as a test
  asserting a property nothing pins.
- **Minor, recorded, belongs to Task 8 — `reopenedAt` survives a state move that is not a
  `ticket.transitioned`.** Both `ticket.workflow_rebound` and `foldTicketToWorkflowVersion` move
  `stateId` by spreading the state, so a ticket reopened and then rebound or folded into a terminal
  state keeps the flag and Task 8's sweep would skip it forever. **The direction is safe** — a non-null
  flag can only make the sweep skip more, never close what it should skip, so no false close is
  reachable — and spec §8.2's clear rule is literally "cleared by any `ticket.transitioned`", so this
  matches the spec's letter. Nothing pins either direction; Task 8 is where the sweep's semantics is
  exercised.
- **Minor, FIXED with a correction — "last reopened" was pinned by nothing.** Covered in 13.722 above;
  the short version is that the first attempt at a pin walked a path where the mutant is
  indistinguishable, and only the no-transition double reopen kills it.
- **Minor, FIXED — "four routes' bodies" undercounted.** Measured: **five** route files call
  `assembleTicketCards` (`attention`, `board`, `list`, `my-work`, `search`; `tickets.ts` imports the
  module but never calls the assembler). The Features.md sentence now carries the measured number and
  names the files. The sibling `four other routes` comment at `ticket-cards.ts:25` is pre-existing and
  not this task's; recorded, not edited.

**What the reviewer confirmed and could not fault:** the `actorLabel` precedence (system → roster → id,
all fifteen call sites read); the `ULID_REGEX` match with a control genuinely outside the class;
`newUlid()` cannot mint the constant and no client can forge it (`check-permission.ts` refuses
`env.actorId !== ctx.sessionUserId`); the migration's Down as a true inverse; the `ON CONFLICT SET`
list reaching an existing row to clear it; the timestamptz handling under a pinned Asia/Kolkata test
database; that no other whole-`TicketState` literal was stale; that `task-ledger.tsv` is correctly
untouched; and that the rebase union lost nothing (`comm -23` of the id sets is empty, additions are
exactly `13.722`–`13.726`).
## The members roster's role control, with `Owner` omitted (executor 2, 2026-09-18) — plan `2026-09-18-membership-role-guard` Task 2, ids `13.824`–`13.828`

Block `13.820`–`13.849` is this executor's for this plan; Task 1 took `13.820`–`13.823`, so this section
starts at `13.824`. Recounted at this tip **by case MARKER only** (the five headings below; `13.829` is the
next free id in the block, and **no id was taken from the second-wave block `13.760`–`13.819`**). An earlier
draft of this sentence said that block was "untouched by this change", which **as written was false**:
`13.761` lives in it and this change REPOINTS that case, replacing its assertion (it also re-scopes `3.132`
and `3.133`, which are outside both blocks). Saying "no id was taken" is the claim that was always true, and
it is stated this way because the loose version was the kind of sentence a later reader would have caught me
on — or worse, believed.

- ✅ **13.824 — the control exists for an admin, and offers `admin`, `member` and `guest` — and NOT `owner`.**
  The option list is the whole decision: the plan ruled `Owner` out because there is no ownership-transfer
  flow, so minting an owner from a roster row would be a transfer with no door designed for it, and
  `grant-owner-requires-owner` refuses the event server-side. The case opens the control and reads the
  options out of the `listbox` rather than asserting a prop, because the prop is what a reader can already
  see and the rendered list is what a person meets. **The prototype disagrees and that is why the case
  exists**: it draws `Owner` as an option and gates the select on the viewer alone
  (`design-system/interactive/desktop.dc.html:679-685`, data `:3061`).
  **Citations:** `apps/web/app/w/[workspaceId]/members/page.tsx:538` (the option list), `:467` (the arm),
  `:565` (the representability predicate, `isEditableRole`), `apps/web/test/members-page.test.tsx:770`

- ✅ **13.825 — changing a role ingests exactly ONE `membership.granted`, with the right entity, and re-reads
  the roster.** Three claims, each of which a different defect would satisfy while the other two held: a
  control that submitted on every render or batched would pass "something was sent"; an entity id that only
  looks plausible would pass "an event was sent" while addressing a different row of the world; and a commit
  that did not re-read would leave the old role on screen, a write the person cannot see land. The entity id
  is `membershipId(workspaceId, userId)` — the key `proj-memberships.ts` upserts on and the id the guard
  reads the target's CURRENT role through — and the payload restates the `userId`, because `parse-event.ts`
  refuses an entity and a payload that disagree. **No new server route was added**: the write goes through
  `POST /events`, the generic client batch every other claim on this shell uses.
  **Citations:** `apps/web/app/w/[workspaceId]/members/page.tsx:309` (the change), `:303` (the entity id),
  `:171` (the re-read), `apps/web/test/members-page.test.tsx:799`

- ✅ **13.826 — a member sees the role as text and no control at all.** The gate is the page's EXISTING
  signal and not a second role read — `adminGate.kind === 'admin'` is the server's own answer from
  `GET .../invites`, which 403s for exactly the population the ingest door refuses, so a second client-side
  answer could only drift from the door's. Both halves are asserted: the control is ABSENT **and** the role
  is still said, because the absence alone passes on a page that draws no role at all. **The absence
  assertion is UNANCHORED on purpose** — see the accessible-name measurement below, which is what made an
  anchored pattern a check that could not fail.
  **Citations:** `apps/web/app/w/[workspaceId]/members/page.tsx:467` (the viewer half of the predicate),
  `apps/web/test/members-page.test.tsx:834`

- ✅ **13.827 — a REFUSED role change is said out loud, and the cell does not move.** A swallowed answer
  shows the person their own click as a fact — the same defect 3.138 pins for Withdraw on the same page.
  **★ WHICH REFUSALS CAN ACTUALLY REACH THIS CONTROL, measured after the independent review challenged the
  first version of this sentence, which named the two rules plan-internally and was wrong about both.**
  `grant-owner-requires-owner` fires only when the payload grants `owner`
  (`apps/server/src/permissions/check-permission.ts:589`), and this control's options
  (`apps/web/app/w/[workspaceId]/members/page.tsx:538-542`) cannot build that payload, so **it can never fire from here**. `last-owner` fires
  only when the SERVER's row for that user holds `owner`
  (`packages/rule-engine/src/checks/membership.ts:139-146`) while the rendered row is editable — and
  `isEditableRole` suppresses the control on an owner's row, both halves reading `proj_memberships`
  (`routes/builder-reads.ts:247-252` for the roster; `engine-context.ts:124` `readMembershipState`, reached
  from `getEntityState('membership')` at `:273`, for the guard — **an earlier version of this sentence cited
  `:405-411`, which is `countWorkspaceOwners`, the COUNT `last-owner` compares against and not the read
  behind it**), so **in the ordinary case it cannot fire
  either**; it is reachable through a STALE roster read, which is a real race and not the common path. What
  the arm is actually for: a stale-read `last-owner`, the ordinary `permission.role` refusal when the
  actor's own authority changes under them, a malformed payload, and transport failures. **The assertion was
  right and the reachability claim was overstated** — which is why the correction is here rather than in a
  quiet edit: a reader pricing this control's failure modes from the old sentence would have budgeted for
  two refusals that cannot arrive. Three
  assertions, and the two beyond the alert are the ones that cost thought. The cell still says the role the
  server holds — the control is driven by the roster rather than by local state, so a refused change cannot
  leave the new role sitting on screen — and `rosterReads` stays at **1**, because a refused write must not
  re-read either. That second half is not decoration: the mutation that reloads on every answer (M6 below)
  reddens this case alone.
  **Citations:** `apps/web/app/w/[workspaceId]/members/page.tsx:309` (the refusal arms), `:454` (the alert),
  `apps/web/test/members-page.test.tsx:862`

- ✅ **13.828 — an OWNER's row keeps the chip, because the control cannot state the value it would hold.**
  This is the arm where this product's judgement and the prototype's do not compose, and the case carries
  the measurement rather than the preference. The prototype's `canEditRole` is **viewer-scoped**
  (`:3061`, `canEditRole: myRoleIsAdmin`) and its option list includes `Owner`, so its owner rows are
  editable like any other; this product removed `Owner` from the options, and a `Select` whose `value`
  matches no option renders its **placeholder** (`packages/ui/src/select/select.tsx:255`,
  `selected ? selected.label : placeholder`) — so an owner's cell would read `Select…` beside the person who
  owns the workspace, on the screen whose whole subject is who holds what. Offering the row a control would
  also be a demotion door with no designed flow, the mirror of the promotion the plan refuses to add.
  **This narrowing was a CONSERVATIVE DEFAULT taken by the executor, filed rather than assumed, and it has
  since been RULED ON: the controller confirmed it on 2026-09-18**, answering
  `gisik-nokma-lanes/EXEC2-2026-09-18-owner-row-editability.md`, which priced both readings. If that
  decision is ever revisited, the predicate at `:475` (`isEditableRole(member.role)` in the arm) and this case change together and nothing else does.
  **Citations:** `apps/web/app/w/[workspaceId]/members/page.tsx:475`, `:546`,
  `apps/web/test/members-page.test.tsx:910`

**Mutations, each applied to a backed-up file, confirmed by sha256 to have CHANGED the file, run, then
restored by `cp` with the sha256 matching the backup exactly (`b8b72fd1…`).** The two the plan names are
M1 and M2; the other four exist because M1/M2 alone leave 13.825 and 13.827 unconstrained, and a case no
mutation can redden is a case that has not been shown to check anything.

1. **The viewer half of the predicate removed** (`adminGate.kind === 'admin' &&` dropped) — the control is
   rendered for a member → reddens **exactly 13.826**, 27 green. *(The plan's own "render the select for a
   non-admin viewer" mutation, and it kills precisely the case written for it.)*
2. **`owner` ADDED to the option list** — reddens **three**: 13.824 (the list is no longer the three), and
   **13.828 and 13.761**, because `isEditableRole('owner')` becomes true and the owner's row gains a control
   the case asserts is absent. The plan predicted 13.824 only; the extra two are correct and are recorded
   rather than edited away.
3. **The representability predicate made always-true** (`isEditableRole` → `role !== '' || …`) — reddens
   **13.828 and 13.761** and leaves 13.824 **green**. This is the mutation that separates the two halves
   M2 moves together: it proves 13.824 pins the option LIST and 13.828 pins the GATE, so neither case is
   carrying the other's property.
4. **The entity id made the bare user id** (`membershipId(workspaceId, member.id)` → `member.id`) — reddens
   **exactly 13.825**, 27 green.
5. **The refusal SWALLOWED** (the `setRoleRefusal(...)` call deleted) — reddens **exactly 13.827**.
6. **The reload moved before the status check** (`loadMembers()` called on every answer) — reddens
   **exactly 13.827** again, by its `rosterReads === 1` half rather than by the alert. Two mutations with
   different causes landing on the same case is the case doing its job, not a coincidence: it asserts three
   things and each of these two breaks a different one.

**★ TWO OVERCLAIMS IN MY OWN COMMIT MESSAGE (`19a5c3c9`), corrected here because a commit message cannot be
edited without moving shas the review was run against.** Both were caught by the independent review.
1. **"Six mutations, six distinct kill sets" is false — there are FIVE distinct kill sets.** M5 and M6 both
   redden exactly `13.827` and nothing else; the table above says so, and the sentence contradicts its own
   table. The correct phrasing is "six mutations, five distinct kill sets, and the two that share a set
   break different assertions of the same case".
2. **"web 28/28" reads as the package and was the FILE.** 28 is `test/members-page.test.tsx` alone; the
   whole `apps/web` package is **487/487** (`test/` holds 45 files). The number was true of what had been
   run at that moment and misleading about what it named — the same class of error as a sweep reported
   without its universe, one level up.

**★ THE MEASUREMENT THAT DECIDED EVERY NAME QUERY IN THIS BLOCK — and it is not a style choice.**
**The shared `Select`'s trigger takes its accessible name from `<its current value> <the caller's
aria-label>`** — for the second person's control, `member Role for Anselma Marak`. Measured by probing the
rendered page: the exact strings `'Role for Anselma Marak'` and `'member'` each return **0**,
`'member Role for Anselma Marak'` returns **1**, and `/Role/` returns **2**. The cause is `useSelect`'s own
wiring: react-aria sets `aria-labelledby="<the value span's id> <the trigger's own id>"` on the trigger and
the accessible-name algorithm resolves and concatenates those references, so the caller's `aria-label` is
APPENDED to the value rather than being the name. Two consequences, and the second is the dangerous one.
A case that queried the control by its exact `aria-label` fails against a control that is present and
correct — which is how this was found, three cases red for a reason unrelated to what they named. And the
mirror image: an ABSENCE assertion anchored to the start of that name (`/^Role for /`) **can never match**,
so it holds whether or not the control is rendered. 13.826's absence arm is unanchored for exactly that
reason, and it would have been a check that cannot fail.
**Recorded rather than fixed, with a named owner:** this is `packages/ui/src/select/select.tsx`'s behaviour
on every `Select` in the product, and changing it means changing that file and every call site written
against the current names. **Owner: whoever next touches that file.** Not minted as a catalogue case here,
because it is a property of a shared component that this task did not alter and whose repair is a different
piece of work.

**★ FOUR PLAN-TEXT AND TEST-TEXT DEFECTS, measured rather than assumed.**
1. **The plan's Step 1 test code queries a `combobox` that does not exist.** Its three sample cases use
   `findByRole('combobox', { name: /role for Kiro/i })`, `userEvent.selectOptions(...)` and
   `getByText('Member')`. The shared `Select` renders a **`button`** trigger
   (`packages/ui/src/select/select.tsx:254`), which is why the product's own cases query
   `findByRole('button', { name: … })` and then read options from the `listbox`
   (`apps/web/test/list-prefs-wiring.test.tsx:69` documents the same migration). A test transcribed from
   the plan would be red against a correct implementation. **The cases were written against the rendered
   control instead.**
2. **The plan's sample cases name a control on `Kiro`'s row, and the fixture makes `Kiro` the OWNER** —
   the signed-in user is `ROSTER[0]`, whose role is `owner`. Under this task's conservative default that
   row has no control at all, so a transcribed case would be red for a third unrelated reason. Every case
   in this block addresses `Anselma Marak`'s row and says why.
3. **Capitalised labels were NOT adopted, and this is a deviation from the plan's sample rather than an
   oversight.** The plan expects `['Admin', 'Member', 'Guest']`; the shipped control offers
   `['admin', 'member', 'guest']`. Two reasons, and the second is decisive: the mint form on this same page
   already ships the lowercase labels (`apps/web/app/w/[workspaceId]/members/page.tsx:688-690`, pinned by case 3.132), and the roster's chip
   prints the wire's own token — case 13.761 pins that with the reasoning that a case expecting `'Owner'`
   "would be asserting a mapping nobody wrote". A capitalised label here would be a display mapping living
   in exactly one control; the mixed presentation it produces on one screen (a lower-case `owner` chip
   beside capitalised selects) is the visible symptom of the same split.
4. **13.761 was RE-POINTED, not weakened, and its old assertion is gone rather than quietly loosened.** It
   ended with `queryByRole('combobox')`/`queryByRole('button')` both null — "NO control per row" — which was
   true only while the guards did not exist. The absence was a PROXY for the property the case is actually
   about (no role is prettified; nothing offers a change it cannot honour), so the proxy is replaced by the
   property asserted directly in both arms at once: the owner's row chips the wire token, and the row the
   control can edit announces itself and displays that same token. A capitalised label in either arm fails
   that line now (`members-page.test.tsx:485-488`; `:474` is the comment that explains it, and an earlier
   draft of this sentence cited that instead — a citation to the explanation rather than the assertion).
   **And two PRE-EXISTING cases needed re-scoping as a consequence, both recorded rather than left to be
   rediscovered.** `3.132` and `3.133` queried `findByRole('button', { name: /Role/ })`, which was
   unambiguous only by accident: it worked while the mint form's picker was the page's only control whose
   accessible name contained "Role". The roster's control is named `Role for Anselma Marak`, so the unscoped
   regex now matches two elements and throws. Both queries are now scoped to the mint form itself, which is
   what those cases are about — a tightening, not a repair of something they were testing.

**★ THE FOLLOW-ON TASK 1 ASSIGNED TO THIS TASK — corrected by measurement rather than repeated.** Task 1's
section above ends with a named follow-on: *"It goes live with the roster's role control, which wires
exactly that event to the client ingest path. **Owner: that task — the one that makes it reachable.**"*
This is that task, so the claim was checked rather than inherited, and **its stated reason is wrong though
its concern is real.** Measured: `apps/web`'s `dataSource` is the ONLINE source — `dataSource.ingest` posts
to `POST /events`, whose engine context implements `countWorkspaceOwners`, so the guard answers there
exactly as Task 1 designed and **no throw is reachable from this control**. The replica's outbox is reached
through `createReplicaDataSource` (defined at `packages/app-core/src/replica/replica-data-source.ts:653`),
which is constructed in **SIX** places repo-wide, not the two an earlier draft of this paragraph named:
`apps/desktop/src/app.tsx:56`, **`apps/mobile/src/app.tsx:40`**, the dual-client harness at
`apps/server/test/dual-client/rig.ts:434` (the `:28` that draft cited is that file's IMPORT list, not a
construction), and three inside the defining package's own test file —
`packages/app-core/test/replica/replica-data-source.test.ts:194`, `:506` and `:605`.
**★ The first corrected version of this sentence said "THREE", and that was a universe error of exactly the
kind the paragraph below describes**: it counted apps and the harness while silently excluding the package
that defines the function, which is the sort of scope a reader cannot see and would not think to widen. The
number is only meaningful with its universe attached, so both are stated now. *Caught by the scoped
re-review, i.e. by the same instrument that caught the truncation this paragraph is about — the lesson
applied to itself is the only form in which it is worth writing down.* **★ That first draft said "not by `apps/web` (measured…)" and its sweep had been truncated
by the author's own `sed -n '1,20p'`, which cut `apps/mobile` off the end of the output.** The claim's
conclusion survived and its EVIDENCE did not: the universe was wrong in exactly the way a truncated sweep
is always wrong — silently, and in the direction of the answer the author expected. Caught by the
independent review, which re-ran the sweep untruncated. The lesson is the one this file keeps relearning:
**a sweep is a fact about its own command line, and `| head`-shaped truncation is a change to the
measurement, not a convenience applied to it.**
So "the role control wires the event to the client ingest path" is true, and "the client ingest path is the
replica's outbox" is not — `apps/web` does not construct a replica data source at all. **The follow-on
stays open with a corrected trigger: it goes live when a REPLICA-BACKED client gains a screen that emits
`membership.granted` or `membership.revoked`.** Measured: the only client in the repo that emits either
today is this task's control (`apps/web/app/w/[workspaceId]/members/page.tsx:321`); `apps/desktop` is a `TicketList` shell and `apps/mobile` has
`editor/`, `push/`, `screens/`, `storage/` and no members surface, so the throw remains latent on both. The
finding itself (`outbox.ts:315` calls `evaluateEvent` with no `try`/`catch`) is **narrower than its first
record and no less real**; the repair is still where a throwing evaluation is caught, and still not a
counter invented in a context that cannot answer. Filed for the controller in the same message that carries
this task's PR.

**★ A RECORDED DEVIATION, and the arithmetic that makes it one: this task ships FIVE cases, not the plan's
three.** `13.827` and `13.828` are additions within this executor's own block, and each is here because
without it a property of the shipped change is unchecked: without 13.827 the refusal path (which Task 1's
guard makes REACHABLE) would be unwitnessed, and without 13.828 the owner-row narrowing would exist as an
implementation detail with nothing pinning it — M3 above shows 13.824 does not cover it. Both are within
`13.820`–`13.849`; neither takes an id from any other block; the count is stated so that a later reader
comparing this section against the plan's Step 6 sees five and does not read the difference as drift.

---

# Second wave, Task 8 — the auto-close sweep and its daemon job

Plan ids `13.635`–`13.639` are the plan's own Step 1 assignment for this task, and the dispatch recorded
them as taken. **Measured at this tip, they are unminted anywhere in the catalogue** — the only occurrence
of `13.635`–`13.639` in this file before this section was the sentence naming them — and they sit outside
this executor's block `13.700`–`13.759`. So this task's cases are **`13.727`–`13.731`**, recounted by case
MARKER at the tip before the first mint: the block's high-water was `13.726` (Task 7), with
`13.725`/`13.726` present as the positive control, and `13.727` returning **false**. The "taken" claim
rests on the dispatch's record rather than on the repo, which is why it is stated that way here.

**The case that decides the task is `AND t.reopened_at IS NULL`, and it is the assertion that proves
Task 7's column earns its existence.** A ticket reopened yesterday and one nobody has touched for a month
are identical on every column this sweep otherwise reads — both terminal, both `closed_at IS NULL`, both
old — so without that clause the sweep re-closes a ticket an hour after a person deliberately reopened
it, undoing an act they cannot make stick. **Mutation: drop the clause** → **13.727 reddens on its own
report arithmetic (`candidates` 1→2, `closed` 1→2) and 13.729 reddens too**, and nothing else in the file
moves. Both cases are about that clause, so the pair is a specific kill rather than a broad red.

- ✅ **13.727 — the sweep closes only the ticket that is terminal, long-sitting and never reopened.** Two
  cases in `apps/server/test/auto-close/sweep.test.ts`, each on its own database. Five tickets in one
  workspace with `autoCloseAfterDays: 7`: A closes; B is inside the window; C is `active`, not terminal;
  D is already closed; **E was reopened 30 days ago and untouched, and is skipped**. The report is
  asserted whole (`{workspacesOn: 1, candidates: 1, closed: 1, refused: 0}`) and the close is proved in
  the columns the product reads — `closed_at` set, exactly ONE `ticket.closed` in the ledger with
  `actor_id = SYSTEM_ACTOR_AUTO_CLOSE` and `origin = 'server'`. The other four are each asserted
  untouched FOR THEIR OWN REASON rather than by symmetry, and each against **the count the seeder left**
  rather than zero: D and E already own one `ticket.closed` before the sweep runs, so a `toHaveLength(0)`
  there failed for a reason unrelated to what it named — which is how the assertion was written on the
  first pass and what caught it. The second case asserts the cutoff from BOTH sides: a ticket entered at
  `2026-09-11T18:29:59.999Z` closes and one at exactly `2026-09-11T18:30:00.000Z` does not, which is the
  half-open interval and, run under this file's non-India `TZ`, a red for any cutoff computed from the
  machine's calendar rather than from IST.
- ✅ **13.728 — a workspace without auto-close contributes nothing.** One case. An explicit
  `autoCloseAfterDays: null` claim gives `workspacesOn: 0` with an old terminal ticket left open, and
  **the control sits in the same test**: the SAME world then claims a 7-day window and the same sweep
  answers `workspacesOn: 1` and closes it. Without that third arm a sweep that never counted any
  workspace would pass this case perfectly.
- ✅ **13.729 — a transition back into the terminal state re-arms the clock.** One case. A ticket
  reopened and untouched is left alone (`candidates: 0` — the clause is in the SELECT, so the row is
  never selected and there is no downstream "skip" to assert); it is then transitioned back into `done`
  ten days before `now`, and the next sweep closes it. The fold's clearing of `reopened_at` is asserted
  BEFORE the sweep, so a failure there names the reducer rather than the sweep.
- ✅ **13.730 — the sweep closes THROUGH THE DOOR, proved by making the door say no.** One case, and the
  plan offered two shapes: (a) construct a candidate the engine refuses, or (b) count ledger rows rather
  than projection writes. **(a) was chosen and the reasoning is part of the case.** (b) is weaker than it
  looks — a sweep that wrote `proj_tickets` directly AND appended a ledger row by hand would satisfy it,
  and the whole question is whether an engine decision stands between the SELECT and the write. (a) is
  decisive: a REFUSED close leaves the ticket open and the ledger empty, which no direct writer can
  produce. **The race has to be injected, and saying why matters:** a statically-seeded candidate the
  engine refuses is impossible, because the sweep's SELECT and `checkTicketClosed` read the SAME two
  projection columns — so any ticket the SELECT returns is one the engine would accept. The window is
  therefore temporal, and the only honest place to open it is the `ingest` dependency, which is exactly
  the seam the real window sits on. The wrapper commits a real transition and then hands the batch to the
  REAL service, so the refusal is the engine's own `close-requires-terminal`; the case then asserts
  `refused: 1` AND `closed_at IS NULL` AND **zero** `ticket.closed` events — the second and third
  together being what a direct writer cannot fake.
- ✅ **13.731 — the auto-close job's interval is validated by `requirePositiveIntervalMs`, on the same
  scheduler as the other four.** One case in `apps/server/test/ops/backup-daemon-main.test.ts`, which is
  a **recorded placement deviation**: the plan named `test/auto-close/sweep.test.ts` as this task's test
  file, but the mechanism is the DAEMON's env handling and the 40-line child-process harness that proves
  it was built there by 13.203. Re-deriving it in the sweep file would be a second copy of a fixture with
  its own failure modes. `AUTO_CLOSE_SWEEP_INTERVAL_MS=0` aborts the whole scheduler and the stderr names
  the variable; 13.203 is its positive control, since it announces with only the OTHER sweep's interval
  set — leaving this one on its `'3600000'` default — so the daemon really does arm all five jobs here.
  **The describe heading in that file was corrected from "four jobs" to "five"**: the plan's Files block
  calls `auto-close` "a fourth `ScheduledJob`", which was true when three existed, and the code is the
  primary source.

## Task 8's review round — one independent reviewer, verdict NOT CLEAN, and two mutations that survived

One reviewer, dispatched before the PR opened, read the frozen tip `50fe9a0f`. Its brief was the two
places the controller named as where this task can be wrong while looking green. **Verdict: NOT CLEAN —
no Critical, two Important.** Both Importants were reproduced here before being acted on.

**I1 — a docblock claim that was FALSE AS WIRED.** `logOf` defaulted to a **no-op**, so a refused or
invalid close left no per-ticket trace anywhere in the process: the reason was discarded while the
aggregate count went into the daemon's structured line. The numbers survived and the *why* did not —
the worse half to lose — and the docblock claimed the opposite ("so it reaches the alerter the daemon
wires up"), naming a connection that does not exist. The sibling it claimed to mirror defaults the other
way (`notifications/sweep.ts:126` is `deps.log ?? console.error`). **Fixed:** the default is now
`console.error`, matching the sibling, and the comment says what is true. Reproduced with a console spy —
zero lines printed for a refused close.

**I2 — a SURVIVING MUTANT on the IST-vs-UTC axis, and the `TZ` pin cannot see it.** Replacing
`istDayOf(clientTime)` with `clientTime.slice(0, 10)` **survived every case in the file**. Between 18:30Z
and midnight the two disagree — the UTC date still says the 18th while IST is already the 19th — so the
cut-off walks one day further back and every eligible ticket waits until 05:30 IST to close, whole-day,
every night, for 5.5 hours of the product's clock. **The file's non-India `TZ` gives it no protection at
all**: a UTC slice never consults the process zone. And every case ran at midday, where the two spellings
agree — so they passed for a reason unrelated to the property they named. **Fixed by a case, not by a
comment:** 13.727 now carries an arm with `now = 2026-09-18T19:00:00.000Z`, where `istDayOf` says
`2026-09-19` and the slice says `2026-09-18`, and a ticket entered IST 12 Sep closes under the correct
code and stays open under the mutant. Re-run after the fix: **I2 dies on that arm and nothing else.**
`notifications/sweep.ts:128` had the same warning one file over and this task did not inherit it.

**M1 — the `!== 'committed'` count shape was prose, not a witness.** Mutating the counter to include
only `status === 'refused'` **survived**, because no case ever fed the sweep an `invalid` result and the
sweep builds its own envelopes by construction. **Fixed:** 13.730 has a second arm that hands the sweep a
deliberate `invalid` answer and asserts `refused: 1`, so `closed + refused === candidates` is now pinned.
That arm is labelled for what it is — a test of the sweep's OWN counting against the contract
`ingestBatch` publishes, NOT a second proof that the door works, which the arm above owns.

**M3 — idempotence was unpinned.** The module says the sweep is "idempotent by the ledger, not by a
cursor" and no case ran a closing sweep twice. **Fixed:** 13.727's first arm now sweeps again and asserts
all four counters are zero and the ticket is still closed exactly once.

**M4 — per-workspace settings resolution was unpinned.** Every case seeded exactly ONE workspace, so
hoisting the cut-off out of the loop would have survived. **Fixed:** a case with two workspaces on
different windows (7 and 30 days) where the same ten-day-old ticket must close in one and stay open in the
other, and `workspacesOn: 2` is witnessed for the first time. Writing it found a second thing — the
seam helper published one workflow id for both workspaces, which `proj_workflows` (keyed by the workflow's
own id) refuses; the helper is now parameterised.

**M2 — "all four jobs" drift, two sites, now fixed.** `Features.md:2366` and this file's own 13.203 prose
both still said four. Both now say five, with the change named rather than silently overwritten.

**M5 — the "taken" sentence, sharpened rather than left implying the repo says it.** `13.635`–`13.639`
have **zero** catalogue hits at this tip; the claim rests on the dispatch's record, and the sentence now
says exactly that.

**Confirmed and could not be faulted:** §8.2's cutoff arithmetic (re-derived, not accepted — `endUtc` is
genuinely IST midnight, the interval half-open, N=1/365 and month/leap boundaries all correct); that
`process.env.TZ` is live before the sweep computes; that 13.730's injected race is legitimate and the
refusal is the real engine's `close-requires-terminal` naming "Doing", with the reviewer verifying that
`ticket.closed`'s only dispatch reaches `checkTicketClosed` alone and that the other refusals cannot fire
for a SELECT-returned row; the daemon wiring, `.env.example` (check:env really fixed, not suppressed),
`deploy/do/app.yaml` parity, same-commit hygiene, and that no migration was added.

## The nav's last-open project item, and the global tab memory (executor 2, 2026-09-18) — ids `13.850`–`13.877`

The owner's request, verbatim: *"new nav item :right to the workspace name -> last open project name. on
click, open the project page (save the last open tab as well). on hover, show the non archived projects as
a dropdown, and clicking them opens those projects. if there is no last opened project, then this defaults
to the first in the order that we display in the workspace page."* Two answers they gave directly and which
the design follows rather than infers: **the tab memory is GLOBAL** (it applies whenever a project opens,
not only when you arrive through this item) and **the dropdown opens on hover AND on focus/click**.

Block `13.850`–`13.879` is this executor's for this work. **The section uses `13.850`–`13.880` — one id
MORE than the block, which is stated with its measurement in the last subsection rather than squeezed
in.** `13.850`–`13.877` are the original change set; `13.878`–`13.880` are the three cases the review round
required, and each of those three reproduced a real defect before it was fixed. Recounted at this tip **by case MARKER only**, with the instrument's own positive
control in the same run: `13.826` was found, and `13.850`–`13.879` was empty across `test-cases/`,
`apps/web/test/`, `apps/web/src/`, `apps/web/app/` and `Features.md` under a boundary-anchored pattern
(`13\.8[5-7][0-9]([^0-9]|$)`, which excludes a `13.8500`-shaped truncation). The four-digit pattern is
deliberately the *broader* instrument for a FREEDOM claim — it matches a bare mention as well as a marker —
so "free under the broad instrument" implies "free under markers". The block's upper bound is checked
against the catalogue's two documented truncation traps: `13.999` and `13.632866` are not case ids here, and
a bare `grep '13\.[0-9][0-9][0-9]'` reads the first of them out of `13.9999`. No id was taken from any other
block; the earlier blocks (`13.700`–`13.759`, `13.760`–`13.819`, `13.820`–`13.849`) are untouched, and no
existing case was renumbered.

Three of the paragraphs below are about defects this work FOUND rather than built, and they are recorded
here rather than fixed silently, per the coordination doc's rule about what is outside a change's scope.

- ✅ **13.850 — the three states, with `unknown` distinguished from `none` on the FIRST PAINT.** `unknown` is
  the window before storage is read and `none` is a settled answer, and the nav does something different in
  each: `none` licenses the first-project fallback, `unknown` licenses nothing. Collapsing them is the bug
  the type exists to make unrepresentable, and it would flash a different project's name at every first
  paint. Asserted at BOTH ends (`seen[0]` and the settled answer), so a two-state collapse cannot pass.
  **Citations:** `apps/web/src/use-last-project.ts:119` (the type), `:145` (the hook), `apps/web/test/use-last-project.test.tsx:122`

- ✅ **13.851 — another USER's project record is `none`, with the control in the same case.** `localStorage`
  outlives a session, so an unkeyed record points the next person's nav at the previous person's project.
  The control stores the identical record with only `userId` changed, so a `none` here cannot be a malformed
  fixture or a wrong key: the same bytes, read by the right person, answer `remembered`.
  **Citations:** `apps/web/src/use-last-project.ts:256` (the guard), `apps/web/test/use-last-project.test.tsx:142`

- ✅ **13.852 — the plain positive.** A record for this user in this workspace is honoured. Without it both
  absence cases above would pass on a hook that never reads storage at all.
  **Citations:** `apps/web/src/use-last-project.ts:145`, `apps/web/test/use-last-project.test.tsx:162`

- ✅ **13.853 — the PROJECT record does not leak across WORKSPACES.**
  **This bullet's rationale was CORRECTED on 2026-09-18 after the review round, and the correction is the
  point of leaving it visible.** It first said a record keyed by user alone would resolve `p_1` inside
  whichever workspace the viewer was standing in, "and if another workspace has a project with that id, it
  would silently name the WRONG project". **That arm cannot happen:** `proj_projects.project_id` is the
  PRIMARY KEY and the migration's own comment records why an entity id belongs to exactly one workspace, so
  there is no id to collide and no collision that could be silent. The reviewer could not construct it and
  neither could the author. What the workspace half actually buys: it is part of the QUESTION the record
  answers ("the last project you opened in THIS workspace"); it refuses a foreign record at the record
  rather than depending on a later `find` to not notice it; and it stays correct if ids ever cease to be
  global. The full replacement is in the file's own docblock at `apps/web/src/use-last-project.ts:35`.
  The control reads the same record from the workspace it was written for.
  **Citations:** `apps/web/src/use-last-project.ts:69` (the key), `:256` and `:258` (the two guards), `apps/web/test/use-last-project.test.tsx:183`

- ✅ **13.854 — a browser with site data blocked does not throw, and answers `none`.** The accessor is what
  raises, not the value, so this is the shape the guard exists for; an unguarded read would take down the
  nav on every page. The assertion is on the settled answer and not merely on "did not throw", because a
  hook that swallowed the error and invented an id would pass a throw-only assertion.
  **Citations:** `apps/web/src/use-last-project.ts:338` (`readJson`), `apps/web/test/use-last-project.test.tsx:211`

- ✅ **13.855 — the route is authority, asserted on the STORE as well as the return.** Opening a project is
  what remembers it; a hook that answered `remembered` from the route without persisting would pass the
  return half and lose the memory on the next page.
  **Citations:** `apps/web/src/use-last-project.ts:210` (`rememberProject`), `apps/web/test/use-last-project.test.tsx:225`

- ✅ **13.856 — a remembered tab reads back for the same person, and `null` for a project nothing was
  remembered for.** The two arms in one case, because "reads back" alone is satisfiable by a reader that
  returns something for everything.
  **Citations:** `apps/web/src/use-last-project.ts:272`, `apps/web/test/use-last-project.test.tsx:249`

- ✅ **13.857 — another user's TAB map is not honoured.** The control writes through the same writer with a
  different user and reads it back with the writer's own user, so the `null` cannot be a writer that
  silently did nothing.
  **Citations:** `apps/web/src/use-last-project.ts:272`, `:279` (its user guard), `apps/web/test/use-last-project.test.tsx:264`

- ✅ **13.858 — a stored value that is not a tab answers `null`, never a guess.** Five non-members
  (`'settings'`, `''`, `'Board'`, `'{}'`, `'5'`) and five malformed containers (`'not json'`, a bare
  string, an array, a missing `tabs`, `'null'`), with a member written through the writer as the control.
  The union is the door: a value outside it reaching `useState` would put the rail into a state with no
  selected segment and no rendering arm, which is a blank page rather than a wrong one.
  **Citations:** `apps/web/src/use-last-project.ts:326` (`isProjectTab`), `:338`, `apps/web/test/use-last-project.test.tsx:282`

- ✅ **13.859 — blocked storage on the tab path, reading AND writing, and a signed-out viewer writes
  nothing.** The write half is the one that matters: it runs from `setView`, a click handler on the project
  page, so an unguarded write turns "switch to the List tab" into an exception inside a React event handler.
  **Citations:** `apps/web/src/use-last-project.ts:296` (`rememberProjectTab`), `apps/web/test/use-last-project.test.tsx:310`

- ✅ **13.860 — the served project LIST keeps SERVED ORDER and keeps ARCHIVED rows.** Order is not this
  hook's decision: `/workspaces` renders `workspace.projects` with the archived filtered and does NOT sort,
  and the nav's fallback is that same order — so a hook that sorted, or that dropped archived rows on the
  way out, would put the two on different answers to one question. The filtering belongs to the caller.
  **Citations:** `apps/web/src/use-workspace-projects.ts:103`, `apps/web/app/workspaces/page.tsx:248`, `apps/web/test/use-workspace-projects.test.tsx:105`

- ✅ **13.861 — a workspace the read SUCCEEDS without is `null`, and the cache is EVICTED.** `null` and `[]`
  are different claims: `[]` says "this workspace exists and has no projects", which is the one thing the
  nav's fallback would act on. The case warms the cache for the same id FIRST, so an eviction that never had
  anything to evict cannot pass it, and asserts the third mount's FIRST frame is still null.
  **Citations:** `apps/web/src/use-workspace-projects.ts:148` (the eviction), `apps/web/test/use-workspace-projects.test.tsx:134`

- ✅ **13.862 — a REFUSED read is `null`, never an invented empty list.** `[]` would be this hook asserting
  that a workspace exists and contains no projects, and the nav would render its "no reachable project"
  branch — making a refusal indistinguishable from an empty project list.
  **Citations:** `apps/web/src/use-workspace-projects.ts:103`, `apps/web/test/use-workspace-projects.test.tsx:157`

- ✅ **13.863 — no session, or no workspace in scope, fires NOTHING.** The spy is what makes this about the
  REQUEST rather than its answer: a `null` alone would also be produced by a read that fired and failed.
  **Citations:** `apps/web/src/use-workspace-projects.ts:128` (the gate), `apps/web/test/use-workspace-projects.test.tsx:176`

- ✅ **13.864 — THE JITTER, one level down.** `AppNav` is rendered by each PAGE, so every client-side
  navigation remounts it; without the module cache the project item would vanish for the tick it takes to
  read storage and come back. The assertion is on the FIRST frame of the SECOND mount, and the first mount
  in the same case is the control that the cache was warm.
  **Citations:** `apps/web/src/use-workspace-projects.ts:96` (the cache), `apps/web/test/use-workspace-projects.test.tsx:253`

- ✅ **13.865 — the item names the remembered project and links to its page.** Name AND href, because a
  rename of that string is the same orphaning by another route: the nav would say "Gamma" and point at
  nothing.
  **Citations:** `apps/web/src/last-project-nav.tsx:122`, `apps/web/test/last-project-nav.test.tsx:158`

- ✅ **13.866 — with nothing remembered it falls back to the FIRST NON-ARCHIVED project in served order.**
  The fixture's first row IS archived and is deliberately first: taking `projects[0]` would name
  `Archived One` and pass a case that only checked "some project was named". Order is not re-derived.
  **Citations:** `apps/web/src/last-project-nav.tsx:128`, `apps/web/test/last-project-nav.test.tsx:176`

- ✅ **13.867 — NO REACHABLE PROJECT RENDERS NOTHING.** Two shapes, both in the case: a workspace the read
  does not contain, and one whose every project is archived — the second being the one a "does it have
  projects" check would wrongly pass. Asserted as an empty body, because a fallback to some other project
  would satisfy a narrower assertion.
  **Citations:** `apps/web/src/last-project-nav.tsx:186`, `apps/web/test/last-project-nav.test.tsx:198`

- ✅ **13.868 — THE FALLBACK'S EDGE: archiving the project you were last in falls back rather than
  disappearing.** A nav resolving the remembered id against ALL served projects — archived included — would
  name `Archived One` here and be wrong, while passing 13.865 unchanged. This is the case the controller
  asked to be WITNESSED rather than reasoned.
  **Citations:** `apps/web/src/last-project-nav.tsx:121` (the non-archived filter), `:122` (the lookup it feeds), `apps/web/test/last-project-nav.test.tsx:224`

- ✅ **13.869 — and when the remembered project is not served at all.** You were removed from it, or it was
  deleted: the same hazard as 13.426 one level up, where a remembered id is a guess about the past and the
  served read is what turns it into a fact.
  **Citations:** `apps/web/src/last-project-nav.tsx:124`, `apps/web/test/last-project-nav.test.tsx:241`

- ✅ **13.870 — the dropdown opens on HOVER and lists the non-archived projects in served order.**
  `userEvent.hover` moves a pointer and nothing else, so an implementation that opened only on focus leaves
  this red. The menu's accessible name is asserted, and the archived row's absence is the filter.
  **Citations:** `apps/web/src/last-project-nav.tsx:249` (the menu), `apps/web/test/last-project-nav.test.tsx:259`

- ✅ **13.871 — it opens on FOCUS and Escape closes it.** `userEvent.tab()` is the real keyboard path, so an
  implementation opening only on pointer events is unusable without a mouse and reddens here. Case 13.871 is
  also the witness for the interaction between two requirements that pull against each other: Escape returns
  focus to the trigger, and focusing the trigger opens the menu, so without `suppressNextFocusOpen` the menu
  reopens the instant Escape closes it and the case never settles.
  **Citations:** `apps/web/src/last-project-nav.tsx:136` (the suppress ref), `:231` (`aria-haspopup`), `apps/web/test/last-project-nav.test.tsx:287`

- ✅ **13.872 — clicking the item remembers the project AND seeds its tab.** Both asserted on local storage,
  because the navigation it also triggers is `next/navigation`'s mocked `push` and would make either half
  pass without the memory being written. The seeded tab for a project with no memory is `board`.
  **Citations:** `apps/web/src/last-project-nav.tsx:204` (`openProject`), `apps/web/test/last-project-nav.test.tsx:314`

- ✅ **13.873 — a row chosen from the DROPDOWN is what gets remembered, not the project the item showed.**
  Separated from 13.872 because a single-armed case cannot tell the two apart: with only the item's own click
  asserted, an implementation that ignored the row clicked and re-remembered the shown project would pass.
  **Citations:** `apps/web/src/last-project-nav.tsx:259` (the row's own `openProject` call, `:244` is the item's), `apps/web/test/last-project-nav.test.tsx:348`

- ✅ **13.874 — the project page OPENS at the remembered tab.** `waitFor` rather than a bare read, and that
  is the honest shape: the seed is applied by an EFFECT, because a `useState` initialiser reading storage
  would answer `null` on the server and disagree with the client at hydration. Without the seed the case
  never settles on Timeline and times out.
  **Citations:** `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:251` (the seed effect; `:257` is the read inside it), `apps/web/test/project-calendar-timeline.test.tsx:693`

- ✅ **13.875 — switching a tab WRITES it, and a fresh mount opens on it.** Neither half implies the other: a
  page that seeded but never wrote would forget on navigation, and one that wrote but never seeded would
  store a tab it never used. The remount is a real second mount against the same storage.
  **Citations:** `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:275` (`setView`), `apps/web/test/project-calendar-timeline.test.tsx:716`

- ✅ **13.876 — another project's remembered tab does not decide this one's, and writing this one's does not
  disturb it.** Discriminating in both directions: a page that read the map without looking up the id would
  open on Timeline here and still pass 13.874, and a writer that replaced the whole map instead of merging
  one entry would drop `p_other`. **This case did NOT start red**, and saying so matters: before the
  implementation existed the page ignored storage entirely, so its first arm passed on the existing default.
  It was strengthened — the merge assertion added — precisely because a case that cannot fail is not
  evidence, and the strengthened form is what makes it red before the change.
  **Citations:** `apps/web/src/use-last-project.ts:314` (the merge, inside the writer at `:296`), `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:195`, `apps/web/test/project-calendar-timeline.test.tsx:756`

- ✅ **13.877 — opening a project REMEMBERS it, keyed by user AND workspace.** The counterpart of 13.427 one
  level up, and the write the nav's READ depends on: without it the nav would only update when you arrived
  through the nav item, which is the one route that does not need it. The workspace half is asserted because
  a record missing it would resolve `p_1` inside whichever workspace the viewer happened to be standing in.
  **Citations:** `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:268`, `apps/web/test/project-calendar-timeline.test.tsx:846`

- ✅ **13.878 — the projects cache is keyed by USER as well as workspace, because this list is viewer-filtered.** The Critical a reviewer found: the first version copied `use-workspace-name.ts`'s cache KEY (workspace id alone) onto a list that is not a name. `apps/server/src/read/visible-projects.ts` serves an owner the whole row set and everybody else only the projects they hold a membership in, so one `workspaceId` is a different list per viewer. Sign-out is `account-menu.tsx`'s `router.push('/sign-in')` — a CLIENT-side navigation — so module state survives it  and the next person's first paint names projects they cannot open, until the fresh read lands and indefinitely if it is slow. The FIRST FRAME is the assertion: the settled value is Bob's either way, so only a warm cache can make the second mount paint someone else's list.
  **Citations:** `apps/web/src/use-workspace-projects.ts:92` (the key), `:110` (the user it is read from), `:124` (the initialiser), `apps/web/test/use-workspace-projects.test.tsx:230`

- ✅ **13.879 — the nav names the project in the ROUTE, not the one storage still holds.** The Important a reviewer found, and the mechanism was MEASURED rather than taken from documentation: React commits passive effects CHILD-FIRST (a probe rendering a parent with one child logged `["child","parent"]`), and `AppNav` is rendered inside the project page's own JSX — so the nav's reader effect ran BEFORE the page's writer effect and named the project you had just left. It self-healed one navigation later, which is exactly what would let it survive a casual look. The fixture makes the fallback unable to produce the passing answer: `p_other` is served FIRST, so only reading the route names Alpha.
  **Citations:** `apps/web/src/last-project-nav.tsx:114` (the route read), `:117` (the hook call it feeds), `apps/web/test/project-calendar-timeline.test.tsx:605`

- ✅ **13.880 — a tab chosen while the session is still LOADING is not reverted when it lands.** The Minor a reviewer found. The rail is not gated on the session — the page's main return at `:1403` is unconditional and nothing between it and the tablist reads `session.kind` — so the tabs are clickable during the session read. `tabUserId` is `null` then, so the click's write goes nowhere, and because `tabUserId` is the seed effect's dependency the landing session RE-RAN it and put the stored tab back over the choice. The case stores `calendar` and clicks List, so the visible half is unambiguous.
  **Citations:** `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:249` and `:250` (the two refs), `:256` (the guard), `:278` (what a click sets), `apps/web/test/project-calendar-timeline.test.tsx:805`

### The mount witness, and why 11.185's arms did NOT change

`AppNav` renders the item (`apps/web/src/app-nav.tsx:269`), and that mount is witnessed **inside
`apps/web/test/app-nav.test.tsx`** rather than only by the component's own test file — this file's sibling
`test-cases/11` records the reason at length (Task 14: an import AND its element were deleted from
`app-nav.tsx` and the whole suite stayed green, because the component was rendered only by its own test).
A new case was added to `11.185`'s closed-set tripwire — *"WITH a workspace that HAS projects: the project
item joins, right of the workspace name"* (`apps/web/test/app-nav.test.tsx:283`) — and it asserts the
ordered href array, because **the position is as much the claim as the membership**: the owner asked for the
item "right to the workspace name", and an ordered array is the only form that can tell that from anywhere
else in the bar.

**The three existing arms of `11.185` needed no change, and that is a fact about their fixtures rather than
about the change.** Every one of those arms builds its workspace through the file's own `workspace()` helper,
whose `projects` defaults to `[]` — so before this round the new item rendered nothing in all three, and
after it renders nothing still. That is worth stating explicitly rather than leaving as an unexplained
non-change: a reader who found three untouched arms might reasonably conclude the tripwire had been
loosened to accommodate the new link. It was not; it was extended by one arm. **The corollary is the
hazard:** a closed-set tripwire whose arms all lack the input that makes the new member appear is a check
that cannot fail on that member, and adding the arm is the repair.

### Two defects this work found, recorded rather than fixed in place

**1. `test/setup.ts` must not import from `src/`, and the first version of this change did.** Nothing
threw. Importing the remembered-state hooks' `clear*Cache` functions from a `setupFiles` entry pulled
`providers.tsx` and then `auth-client.ts` into the module graph **before any test file's hoisted `vi.mock`
could register a factory**, so `authClient.useSession()` returned the REAL client's initial
`{ isPending: true }` and `useSessionStatus()` answered `{ kind: 'loading' }` **in every test file that
mocks that module**. Four cases in `project-calendar-timeline.test.tsx` simply stopped writing anything — a
loading session has no user id to key a record by — and every failure pointed at the page rather than at the
file that caused it. The fix is that `setup.ts` now clears `localStorage` alone and imports nothing from
`src/`; the module caches are cleared by each case's own file, next to the code that explains them. The
hazard is recorded in `apps/web/test/setup.ts`'s own docblock because it is invisible from a green run and
would be reintroduced by the next person who wants a global reset.

**2. `--concurrency=1` is not a vitest flag.** The dispatch that carried this work specified it as the
machine-load guard; vitest 3.2.7 rejects it outright (`CACError: Unknown option '--concurrency'`) before a
single test is collected. The equivalent is **`--maxWorkers=1`**, which every run in this section used. The
flag in the dispatch is a jest one; recorded here because a later reader following that sentence would get a
tool error rather than a slower run, and the two failure modes look nothing alike.

### Mutations — SIX, each sha256-confirmed to change the file and restored to the backup's sha EXACTLY

A mutation is only evidence if it changes the PROPERTY under test rather than merely the source, and the
kill sets below are what separates the cases that pin different halves of the same behaviour. **Every kill
set here is a MEASURED result, not a predicted one** — and three of the six differ from what this section
first claimed, which is stated rather than quietly corrected because the difference is the whole reason the
run happens. Each ran against all five files this change touches (`use-last-project`, `use-workspace-
projects`, `last-project-nav`, `project-calendar-timeline`, `app-nav`), and each was restored with the
backup's sha256 verified equal to the original.

1. **The remembered project resolved against ALL served projects, archived included** (the lookup reads
   `projects` rather than the non-archived `live`) — reddens **13.868 alone**, 68 green. This is the one that
   shows 13.865 does not cover the archived edge: the remembered project is still live in that case, so the
   item's own name and href are unchanged and only the archived arm notices.
2. **The fallback takes `projects[0]` instead of the first non-archived** — reddens **THREE, not the two
   claimed: 13.866, 13.868 and 13.869**, 66 green. `13.869` is the one the prediction missed, and its
   inclusion is correct rather than surprising: that case remembers a project which is not served at all, so
   the remembered lookup yields nothing and the FALLBACK is exactly what it then asserts. A fallback mutation
   is expected to redden every case that reaches the fallback, and two of the three do.
3. **The workspace half of the project record's key dropped** (`storedWorkspaceId !== workspaceId` deleted) —
   reddens **13.853 alone**, 68 green, with 13.853's own control still passing.
4. **The user guard dropped from the PROJECT reader** (`storedUserId !== userId` deleted in `readFor`) —
   reddens **13.851 alone**, 68 green. The claim this corrects is worth recording: this mutation was
   predicted to redden 13.857 as well, and it does not, because **13.857's guard is a different site** — the
   tab reader's own user check. Two readers, two guards, two mutations; the first draft of this list treated
   them as one.
5. **The user guard dropped from the TAB reader** (`storedUserId !== userId` deleted in `readProjectTab`) —
   reddens **13.857 alone**, 68 green. This mutation was absent from the first draft of this list entirely,
   which is the same error seen from the other side.
6. **The tab merge replaced by a fresh map** (`{ ...existing.tabs }` → `{}`) — reddens **13.876 alone**, by
   its second arm, 68 green. 13.874 and 13.875 stay green, and that is the point: neither has a second
   project's entry to lose.

**What the six do NOT cover, stated so a later reader does not read the table as complete.** No mutation
targets the nav's `suppressNextFocusOpen` ref; deleting it reddens 13.871, but that was reasoned from the
case's own assertion rather than measured, and it is recorded here as unwitnessed. No mutation targets
`use-workspace-projects`' eviction or its zero-request gate, and no mutation targets the ARIA wiring
(`aria-haspopup`, the menu's accessible name) — those are pinned by the cases but not shown to be pinned by
a mutation, and the difference between "asserted" and "shown to discriminate" is the one this section exists
to keep visible.

### The review round — one independent reviewer, 1 Critical + 1 Important + 3 Minor, ALL FIVE CLOSED

The reviewer ran against `53f2cadb` before the PR opened, briefed to attack the storage-keying and the
fallback. It found five things, and **each of the three that named a defect this code could actually
exhibit was reproduced by a failing case BEFORE the fix** — the reproduction is the evidence, not the
finding's argument:

- **C1 (Critical) → 13.878.** The projects cache was keyed by workspace id alone. Reproduced in
  `13.878`'s first RED run as `expected [ { name: 'Alice Only', …(4) } ] to be null` — Alice's filtered
  project list, served to Bob's first frame in the same browser. The reviewer's own cited premise was
  checked rather than adopted: `apps/server/src/read/visible-projects.ts:51-74` really does return
  `visible.filter((project) => eff.projects.has(project.projectId))` for every non-owner.
- **I1 (Important) → 13.879.** The nav read storage before the page wrote it. The mechanism is a claim
  about React's internals and was **measured, not read**: a throwaway probe rendering a parent with one
  child logged `["child","parent"]`, so passive effects do commit child-first. Reproduced as
  `Unable to find role="link" and name "Alpha"`.
- **M2 (Minor) → 13.880.** The tab seed re-ran on the loading → signed-in transition. Reproduced as
  `expected 'Calendar' to be 'List'`. The reviewer stated this finding's weak half honestly — it could not
  measure that a person can land a click inside the session-read window — and the code path was checked
  here: the page's main return is unconditional and nothing between it and the tablist reads
  `session.kind`.
- **M3 (Minor) → corrected prose, no case.** The docblock justified the user+workspace key by a project id
  being able to collide across workspaces. **That arm is impossible and the reviewer could not construct
  it, nor could I:** `proj_projects.project_id` is the PRIMARY KEY, and the migration's own comment says
  an entity id is a ULID belonging to exactly one workspace. The keying is right; the reason was wrong and
  is replaced with the three reasons that survive inspection, stated in the file.
- **M4 (Minor) → 13.872 strengthened.** Its first assertion could not fail: the case's own fixture wrote
  byte-identical bytes to what the assertion checked, so deleting the trigger's `onClick` left it green.
  The record is now removed before the click, so only the click's own write can produce it.

**Two findings the reviewer listed as sound are worth recording as sound**, because a review that only
reports what is wrong is indistinguishable from one that only looked in one place: it independently
confirmed the `readFor`/`readProjectTab` guards are checked before any id is handed back, and that the
`useLastProject` module cache self-invalidates on a user or workspace change — i.e. the hole C1 has is
**not** present in the sibling hook, which is why one is a Critical and the other is not.

### The fix round's own mutations — FOUR, each re-run to prove its fix is pinned

A fix is a change like any other, and the discipline is to verify it by RE-RUNNING the mutation rather
than by reading the new test. Each of the four mutations below removes exactly what one fix added, and
each kills **exactly one case**:

1. **The projects cache keyed by workspace alone again** → **13.878 alone**, 71 green.
2. **The nav stops reading the route's project** (`routeProjectId` → `undefined`) → **13.879 alone**, 71 green.
3. **The seed's chosen-here guard removed** → **13.880 alone**, 71 green.
4. **The trigger's own `onClick` removed** → **13.872 alone**, 71 green. *This one is the point of the
   M4 repair: before it, the same mutation SURVIVED, because the fixture had already written the bytes
   being asserted.*

Each was sha256-confirmed to change the file and restored to the backup's sha EXACTLY.

### Two things this fix round found that are NOT in the diff it was asked for

**1. A partial `next/navigation` mock is an import-time throw, and the fix for I1 exposed four of them.**
Adding `useParams` to `LastProjectNav` took **all fourteen cases in `test/settings-page.test.tsx` down at
once in 43 ms** — an import-time failure, not a behavioural one, because that file mocks
`next/navigation` with `useRouter`/`usePathname`/`useSearchParams` and no `useParams`. A mock is a
MODULE, not a subset. Four files were missing it (`settings-page`, `sign-in`, `account-page`,
`not-found-and-legal`); **only the first rendered the nav, so the other three were latent** and are
repaired here rather than left for whoever mounts the bar on those pages next.

**2. The cache key's first spelling made its own file unsearchable.** `cacheKey` joined the two ids with a
NUL byte, which is a defensible way to make `('a','b:c')` and `('a:b','c')` different keys — and it made
`grep -n cacheKey apps/web/src/use-workspace-projects.ts` print `Binary file … matches` instead of the
line. A source file the repo's own inspection tools silently refuse to search is a blind instrument, which
is the failure this project spends the most effort avoiding, and it would have stayed invisible until
somebody needed a citation out of that file. Replaced with `JSON.stringify([userId, workspaceId])`, which
is unambiguous without assuming anything about what an id may contain.

### Known limitation, recorded rather than closed

**A tab clicked during the session-read window is not REMEMBERED.** `13.880` stops the resolving session
from reverting the choice, but the click's own write is still dropped, because `rememberProjectTab` takes
a `userId` and there is not one yet — `use-last-project.ts:276` returns early on `null` rather than
inventing a key. The choice stands for as long as the page does and is lost on the next visit. The window
is one network round trip. **Owner: whoever next touches the session gating on
`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`** — the two candidate repairs are gating the rail on
`signed-in` (a product change, since the tablist is currently reachable signed out) and buffering the
write until a user id exists (a second source of truth for a convenience).

### Id block — one over, measured, and reported rather than squeezed

**`13.880` is OUTSIDE the dispatch's block for this work, which is `13.850`–`13.879`.** The work needed
31 cases and the block holds 30. `13.880` was measured free at this tip before it was used (boundary-
anchored `13\.880([^0-9]|$)` across `test-cases/`, `apps/web/test/`, `apps/web/src/`, `apps/web/app/` and
`Features.md`, returning only this change's own additions, with the same instrument's positive control
finding `13.878` and `13.879` in the files that carry them). **No id was taken from any other block, no
existing case was renumbered, and `13.850`–`13.879` are used contiguously with none spare** — the overrun
was not avoidable by renumbering within the block, only by dropping coverage of a fix a reviewer required.
Renumbering it is a one-line change plus its three citations if the controller prefers; asking first would
have held the whole PR on an id.
# An untinted `.gn-avatar` had no boundary at all under `neo` (owner report, 2026-09-18) — case `13.732`

The owner's report, verbatim: *"in neomorphic style, the gn-avatar background is not visible. check the bg
colour applied here."* **Measured before it was believed, and the measurement is the case.** Under `neo` —
the shipped default — `surface`, `surfaceRaised` and `surfaceSunken` are the SAME hex, `neoPaper
#F1EAE3`, and `neo`'s whole depth language is shadow-only. The base rule declared `background:
var(--gn-surface-sunken)` (`ui.css:202`), so an untinted avatar on a `.gn-card` (itself `surface-raised`,
the same hex) composited to a boundary ratio of **exactly 1.0000** — not a faint boundary, the same
colour. `hig`/`minimal` were never affected: their two roles genuinely differ (1.3140 and 1.2025 light,
1.2025 and 1.1688 dark), which is why the report read as a `neo`-only bug and why the fix had to be one
that holds in all three styles rather than a `neo` override.

**`neo` ships a `surface-sunken` remedy already, and this element was not given it.** Case `10.80`
(`packages/ui/test/components.test.tsx`) pins `.ticket-type-list__row`, `.fields-editor__row` and
`.workflow-builder-screen__name` to a `[data-style="neo"] … box-shadow: var(--gn-shadow-sunken)`
override, for exactly this reason — "a 'sunken' element with no shadow of its own is indistinguishable
from the raised surface around it". A shadow was REJECTED here: it would draw the disc under `neo` while
leaving `hig`/`minimal` relying on a faint fill difference, two mechanisms for one boundary.

**Fixed by declaring `fill-tertiary` (`ui.css:207`)**, and the fix was already written down one element
over — `apps/web/app/globals.css:1516-1522` records rejecting `surface-sunken` for the members monogram
*"although it is the role `.gn-avatar` declares, because under `neo` … a disc filled with it disappears
into the card it sits in; a boundary that is not drawn is not a disc."* That comment named this bug, on
this element, and the monogram was moved to `fill-tertiary` while `.gn-avatar` was left behind. The
composite is `#E7DDD4` over `neoPaper`, the value `tokens.ts`'s own fills comment names.

**Why the case reads the STYLESHEET rather than naming `fillTertiary`.** `CONTRAST_PAIRS` cannot carry
this obligation: `fillTertiary` is an ALPHA primitive (`#b0988429`) and `tokens.ts:284` forbids naming an
alpha role in that array, because `relativeLuminance` ignores alpha by documented design and the pair
would be measured against a ground the fill is blended INTO — a false green. The obligation is against
the COMPOSITE. So the case parses `.gn-avatar`'s declared `background` role out of `ui.css`, resolves it
back through `TOKEN_ROLES`, and measures that role — the shape case `11.214`
(`packages/ui/test/in-transit.test.ts`) established, and for its reason: a case that hard-coded
`fillTertiary` would stay green if the rule were repointed at a role that vanishes, which is the exact
regression it exists to catch. `11.213` is the tombstone for getting this wrong the other way.

- ✅ **13.732 — an untinted avatar draws its own boundary in every style, not only where the surface
  roles differ.** Three tests in `packages/ui/test/tokens.test.ts`. **(1)** For every style × theme, the
  avatar's declared fill composited over `surfaceRaised` is asserted NOT to equal `surfaceRaised` — the
  assertion the bug fails, reddening on `neo` in both themes and naming the style rather than the role,
  because the role is a legitimate implementation choice and "the same colour as its own ground" is the
  defect. **(2)** The initials are held to the floor they actually owe — **4.5, as read text** — on the
  composite over BOTH grounds the element can sit on (`surfaceRaised` as a card, `surface` as a page),
  each with the anti-vacuous control that the fill composites to something rather than to the bare
  ground. **Measured on the shipped fill: 10.4386 `neo` light, 10.7908 `neo` dark, 10.8348 `hig`/`minimal`
  light, 8.7528 `hig`/`minimal` dark** — comfortable, and asserted anyway, because the neutral base was
  the one avatar state with no declared pair and therefore no gate at all. **(3)** A mutation witness
  plants `surface-sunken` back into the real stylesheet text, re-derives the role with the same helper,
  and asserts the composite collapses onto the card's colour under `neo`/light — with a CONTROL that the
  same planted fill does NOT collapse under `hig`/light, so the witness is provably measuring `neo`'s
  one-hex surface roles and not a general property of the helper.

  **ASSERTED TO EXIST, deliberately NOT asserted to clear 3:1.** No neutral avatar fill does in any style
  (measured 1.1228/1.1928 `neo` light/dark, 1.2096/1.3546 `hig`/`minimal` light, 1.3546 `hig` dark) and
  WCAG 1.4.11 does not owe it here: the disc carries no state and identifies no control, while the
  initials carry the content and `aria-label` carries the identity. Inventing a floor the product has
  never met would be a number with no principle behind it.

  **PROVEN TO GUARD, not written and trusted.** With `ui.css:207` reverted to `var(--gn-surface-sunken)`
  and nothing else touched, all three tests redden — each naming `neo`, and the first reading `neo/light:
  an untinted avatar composites to the card's own colour (#f1eae3) — no boundary is drawn`. Restored, the
  file's SHA-256 returns to `15aa5077928945411ac0e096bacac95382805f786f8e2b0b10e1798b5c6db79f` byte for
  byte and the suite returns to green. The case is also the first sight the neutral avatar state has had:
  the four `--gn-avatar--tint-*` rules are covered by `CONTRAST_PAIRS` (each reuses a declared fill/ink
  pair), so only the UNTINTED variant — which is the default, since `tint` is opt-in
  (`components/avatar.tsx:63`) — fell through to an ungated rule. That is why it read as intermittent.

  **THE TRADE, measured rather than glossed:** in `hig`/`minimal` LIGHT the boundary ratio moves 1.3140 →
  1.2096, marginally weaker, because the old role was not invisible there. `neo` moves 1.0000 → 1.1228
  light and 1.0000 → 1.1928 dark, which is the whole bug. One role for one boundary in every style beats
  a shadow for `neo` and a fill for the other two. (`packages/ui/src/ui.css`, `packages/ui/test/tokens.test.ts`)

## The same defect one element over — measured, and NOT fixed here

**38** rules in `ui.css` fill with `var(--gn-surface-sunken)`. Of those, **12 declare a `box-shadow` of
their own** — 11 of them literally `var(--gn-shadow-sunken)`, one (`[data-style="neo"]
.ticket-type-list__badge`, `ui.css:1824-1827`) `var(--gn-shadow-sunken-compact)` — and a further **8
selectors** receive one from a `[data-style="neo"]` override. `--gn-shadow-sunken` is `none` under
`hig`/`minimal` and an inset shadow under `neo`, so a rule carrying it is drawing a boundary in exactly
the style this defect is about. Those numbers are three different universes and are stated as such
because the first pass at this audit printed "only 5 carry the remedy" — a figure that is exactly right
about the 8-selector neo-override universe and wrong about the binding the sentence gave it ("of the 38").

**Four rules remain whose fill is their ONLY boundary under `neo`** — static, borderless, and with no
shadow from either source. Each verified by reading the rule: `.gn-list__table-header` (`ui.css:1071`),
`.gn-calendar__weekday-head` (`:2357`), `.gn-help__table th` (`:3710`) and `[data-style="neo"]
.gn-segmented__item--on` (`:3807`, which records in its own docblock that its shadow was deliberately
removed to match the reference). Under `neo` each is filled with the same hex as the ground around it.
`.gn-avatar` was a fifth.

**Four more are NOT in that list and the first pass wrongly included them**, which is worth recording
because the error was an instrument's, not a reading's: `.gn-list__section-title` (`ui.css:947-956`),
`.gn-timeline__weeks` (`:2600-2602`), `.gn-timeline__side` (`:2692-2695`) and `[data-style="neo"]
.ticket-type-list__badge` (`:1824-1827`) each declare their own `box-shadow` **inside the rule body**
rather than in a `[data-style="neo"]` block, and the audit only looked for the latter. A shadow declared
in the rule's own body is drawn under `neo` just the same. The corrected count is **4, not 8**.

**Recorded rather than fixed, and the measurement has a stated limit:** this audit establishes that these
fills are identical to their ground, NOT that each is load-bearing — a table header's fill may be doing
less work than an avatar's disc, and `.gn-segmented__item--on`'s selected state carries other cues.
Assessing each is its own task with its own owner, and sweeping four shared surfaces into a one-element
bug fix is how a contrast change becomes a product-wide restyle. **Owner: whoever next touches the `neo`
surface roles or the non-text-contrast sweep.**

**One survivor is named because it is the worst of them.** `.gn-table__row--clickable:hover`
(`ui.css:350`) sets `background: var(--gn-surface-sunken)` with no shadow, no border and no `neo`
override, so under `neo` the hovered row composites to **exactly 1.0000** against both `surface` and
`surfaceRaised` — hovering draws nothing at all. It is not in the four above only because it is a
`:hover` state rather than a static rule, and that exclusion is about my filter, not about its severity:
for a clickable row the hover fill is the element's entire affordance. **Owner: same.**

**A pre-existing condition this change did NOT create, recorded because it was measured:** line-number
citations of `ui.css` are already drifted at `origin/main`, independent of the ~35 lines this fix adds
above line 167. Sampled: `.gn-board__rail` is cited at `ui.css:315`, which is
`.gn-table__row--clickable:hover`; `.gn-timeline__weeks` is cited at `1939-1942`, which is a docblock;
`.gn-table`'s four rules are cited at `284-288`, also a docblock. Only `.gn-chip__dot` (`:155`) checked
out. Nothing enforces line accuracy — `check-case-citations` ratchets on UNCITED case ids, not on where a
citation points — so this drifted silently and is not a gate failure. Left alone rather than repaired:
**104 occurrences across 68 distinct values** of `ui.css:NNN` name a line above 167, counted over
`*.md`/`*.ts`/`*.tsx`/`*.mjs`/`*.css` excluding `node_modules` — a universe worth stating, because the
same sweep run over every file in the worktree reports 150 and that larger number is wrong: it counts
`.next/cache` webpack blobs, `dist` output and graphify's own cache, which are build artefacts rather
than repo files. The shift would be unverifiable by any gate, and rewriting citations whose original
intent cannot be reconstructed is a worse artefact than a stale one a reader can measure.
**Owner: the controller, as a priced decision.**

## The attention strip leaves the project page (executor 2, 2026-09-18) — ids `13.881`–`13.882`

The owner's instruction, verbatim: *"the attention section should not be there in the project page. its
already there in the my work page. and check the prototype for styling of the attention tasks."*

**Part 1 of that instruction is this change. Part 2 is measured and HELD** — and the hold is a finding
rather than a skip, so it is recorded in full below; the next reader will otherwise assume nobody looked.

`13.881`–`13.882` were measured free at this tip **by case MARKER only** before use, with the same
instrument whose positive control found `13.880` in the file that carries it. `13.881` is the next free id
overall; no existing case was renumbered, no other block was entered, and neither of the dispatch's
allocated blocks (`13.700`–`13.759`, `13.760`–`13.819`, `13.820`–`13.849`, `13.850`–`13.880`) was touched.

- ✅ **13.881 — the project page renders no attention strip, and never makes the attention read.**
  `apps/web/test/page-refusals.test.tsx:247`. Two assertions and a control, and **the second assertion is
  the load-bearing one**: a page that still called `useAttention` and discarded the answer would render no
  strip and pass an absence-only check, while still paying the read and still arming the expired-session
  rule on a 401 for a surface that no longer exists. `getAttention` is stubbed to ANSWER here
  (`page-refusals.test.tsx:248`), so a page that still called it would draw a strip and fail the absence
  *and* the `not.toHaveBeenCalled()` (`:268`). The control is the board refusal — both of this case's
  assertions are absences, and an absence passes just as well against a page that threw before it rendered
  anything.

- ✅ **13.882 — and the removal is a PROJECT-PAGE change and nothing wider.**
  `apps/web/test/page-refusals.test.tsx:279`. `13.881`'s two assertions are both absences; on their own
  they are satisfied by deleting the strip everywhere. This is the paired positive, on the route the owner
  named as the one that keeps it: the same read, the same component, rendered, with the item's title and
  the server's own reason string read back out of the strip (`page-refusals.test.tsx:287`).

**One property did not move, it moved house.** The block that previously stood here — *"Project page: the
attention strip refuses out loud rather than rendering nothing"* — asserted the refusal on the project
page. `/my-work` is now the only page that mounts the strip, and the refusals case there
(`page-refusals.test.tsx:122`) asserts the identical sentence at `page-refusals.test.tsx:169`, so the
property is witnessed rather than dropped.

### What was removed, and every reference that had to keep making sense

Five sites in `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`, plus the prose corrections the
dispatch's own rule required (*"If a docblock or a comment still explains a strip that is no longer there,
correct it"*):

| site | what |
|---|---|
| import block | `AttentionStrip` and `useAttention` dropped from the `@gisik-nokma/app-core` destructure |
| hook call | `const attention = useAttention(dataSource, workspaceId)` deleted |
| expired-session list | `attention.error` dropped — `page.tsx:963` **now passes three reads, not four** |
| render block | the comment, the error arm and the strip arm removed; `.gn-project` (`page.tsx:1445`) is now followed directly by the narrowing control's docblock and `<div className="gn-list-filter">` (`page.tsx:1464`) — **the tab arms are further down, not next** |
| prose `:1338` | "the attention strip, the board and the list all use" → "the board and the list both use" |
| prose `:1441` | "Four reads can 401 together … four panels" → **"Three reads"** — a count is a fact about the code, and the code changed |
| prose (Step 5b docblock) | the `attention.data ?? []` analogy kept its reasoning and lost its now-absent referent |

One more, outside the page: `apps/web/test/board-narrowing.test.tsx` carried a docblock explaining that
`AttentionStrip` contributes no stray `<li>` to its `getAllByRole('listitem')` counts. The conclusion still
holds and its reason no longer does, so the reason was corrected — and the **now-inert**
`getAttention: async () => []` overrides were deliberately left in place rather than swept, because the
same helper shape is shared with fixtures that still mount a page carrying the strip and a blanket sweep
would have removed one that is load-bearing. The docblock says so at the site.

### The contrast roster — a generated record whose route list this change invalidates

`apps/web/e2e-stack/non-text-contrast-roster.json` carries `aside.gn-attention` with
`routes: ["/my-work", "/p/:projectId"]`. That file is **written** by the Step 5b sweep
(`viewport.spec.ts`'s `writeFileSync`) and **read by nothing**, so this entry's route list is now stale and
no gate can notice. `/p/:projectId` was removed from that one entry by hand. The reason is stated rather
than implied: the sweep that would regenerate it needs the hot stack, which the two-executor override puts
out of this session's reach. **This edit is a hand-correction of a record, not a measurement, and it is PARTIAL on purpose.** The
`routes` list was right to change; the header aggregates were not touched. `examined: 9` and
`totalClasses: 5` describe the PRE-change sweep, and the next run is expected to write `examined: 8` —
`aside.gn-attention` is the only roster entry covering `/p/:projectId`, and the sweep's `examinedTotal`
sums per route, so that route's single bordered element leaves with the strip. Lowering it by hand would
be asserting a number nobody measured, which is the same reason the accessible-name ratchet below is left
alone. **Read that header as a record of the run that produced it, not as a description of this tree.**

### ⚠️ A consequence no gate in this change's scope can see: the signed-in accessible-name ratchet

`apps/web/e2e-stack/accessible-names-baseline.json` records `stack-phone-390|/p/:projectId` with
**`ariaLabel: 66`**, and the strip's `<aside aria-label="Needs attention">` was one of those 66. The chain,
each link checkable, and the first three found independently by the reviewer and by this executor:

1. `RATCHETED` includes `ariaLabel` (`apps/web/e2e-viewport/accessible-names.ts:89`, counted by
   `hasAttribute` at `:49`) and the assertion is a **FLOOR** —
   `expect(...).toBeGreaterThanOrEqual(accessibleBaseline[attr])`
   (`apps/web/e2e-stack/viewport.spec.ts:673`). A DECREASE is the failure this instrument exists to catch.
2. `AttentionStrip` carries exactly one named attribute, `aria-label="Needs attention"`
   (`packages/app-core/src/views/attention-strip.tsx:74`) — no `role` — so only `ariaLabel` can move.
   *(The attribute's VALUE and its line are as-they-stood in that run: the 2026-09-18 Part 2 change moved it
   to `:94` and set it to `"Needs your attention"`, keeping the attribute itself — which is the whole of
   what this link rests on. The count did not move either way.)*
3. The strip verifiably rendered on `/p/:projectId` in that session: `AttentionStrip` returns `null` for an
   empty list (`:72`), and the non-text-contrast roster written by the same suite records
   `aside.gn-attention` **on `/p/:projectId`**, which it can only do for a selector it found rendered there.
   *(Cite the record as it stood THAT RUN, not as the file reads now: the hand-correction above removed
   `/p/:projectId` from that entry, so today the file no longer shows what this link rests on.)*
4. Nothing else that gained or lost an `aria-label` between the baseline's own commit (`5aab0a90`) and this
   branch's base is in the measured DOM — the reviewer enumerated every `aria-label` added or removed
   across `apps/web/app`, `apps/web/src`, `packages/app-core/src` and `packages/ui/src` for that range and
   showed each is on another route, another tab, or behind a closed disclosure. The sweep navigates the
   project bare (`viewport.spec.ts:467`) with `DEFAULT_PROJECT_TAB = 'board'`.
   **Deliberately NO count here**: the same range was counted three times in this review round and gave
   three answers (a scoped re-review measured 9 changed lines over 7 files, the first reviewer said 7, and
   a naive `git diff | grep -c aria-label` gives 12 because it also counts CONTEXT lines). The count was
   never the claim — the enumeration is, and a number three instruments disagree on is decoration that
   would invite someone to re-derive it instead of checking the substance.

So the count is 66 → 65, `65 >= 66` is false, and the suite reddens with its own sentence naming the
cause: *"13.287: /p/:projectId LOST ariaLabel: baseline 66, now 65."*

**It is recorded and NOT fixed, and that is a deliberate disagreement with the reviewer's recommendation.**
The reviewer proposed hand-correcting the key to 65 in this commit, which the guard's own message invites
("commit that says which element and why"). This change does not, for one reason: **lowering a floor is the
direction that hides a loss.** If the strip was present in that run — likely, on the evidence above — then
65 is right and this costs a red that explains itself. If it was NOT present, then 66 never included the
strip, 65 is wrong, and the guard is silently weakened by one for ever. Both the reviewer and this executor
name that last link as the one we cannot close without running the sweep, and the repo's stated preference
is the loud failure over the quiet one. Re-seeding needs the hot stack, which the two-executor override
puts out of this session's reach. **Owner: whoever runs `e2e-stack` next.** One run settles it, and the red
it prints says exactly what to commit.

Two other ratchets were checked in the same pass and are **unaffected**: `tap-target-baseline.json` holds a
single key (`stack-phone-390|/my-work`) and does not baseline `/p/:projectId` at all, and
`type-scale-baseline.json` records `0` for that route.

**A correction made in passing, and it is load-bearing for the paragraph above.** `Features.md`'s
`StyleToggle` paragraph said `apps/web/e2e-stack/accessible-names-baseline.json` "is `{}` (that suite has
never been executed)". That was true when it was written and is not true now: the file was `{}` when Step
5b began, and `5aab0a90` seeded it from run B and proved it asserts in run C, including a negative control
that raised `/members`' recorded `ariaLabel` 5 → 6, watched it redden, and restored it byte-identically.
The sentence now says so, because the ratchet above is only worth reporting if it is live.

### One pre-existing overclaim found while removing, recorded rather than fixed

`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:959` reads *"Every read on this page, one rule, one
author"* over the expired-session list. That is not true of the whole page and was not before this change:
the page also calls `getMyWorkspaces` (twice, through `src/use-project-name.ts:51` and
`src/use-workspace-name.ts:72`) and `getWorkflowDef` (`page.tsx:938`), and their rejections are swallowed
rather than routed to the notice — the exact shape the sentence denies. **No hunk of this change lands on
that line, so it is pre-existing and is left alone.** Owner: whoever next touches this page's read wiring.
Recorded here for the same reason the rest of this section exists — a sentence about code is a claim, and
this one is false.

### Part 2 — the prototype's styling, measured, and why it was HELD

> **⚠ SUPERSEDED THE SAME DAY — read the "✅ RESOLVED" block at the end of this section before acting on
> anything below.** The owner adopted the prototype's treatment whole on 2026-09-18 and rows 1–6 landed
> together. What follows is kept because it is the measurement that made the adoption whole rather than
> piecemeal, and because **(a)/(b)/(c)/(d) are the four records the decision had to meet** — one of them
> as a design choice, not by a measurement. **Row 1's border ruling stands as a measurement; it was
> superseded as a design decision.**

The dispatch asked for the strip's styling to be checked against
`design-system/interactive/desktop.dc.html:561-575`. It was checked. The delta is real, but it is
**structural rather than a CSS restyle**, and four of its parts meet a record the repo already holds.
Measured, prototype → product:

| # | prototype (`desktop.dc.html:561-575`) | product (`attention-strip.tsx:74-96`, `ui.css:1153-1189`) | class |
|---|---|---|---|
| 1 | `--tintWarning` card, `border-radius:var(--cardR)`, `padding:18px 20px` | `--gn-surface-raised` + `border-left:4px solid var(--gn-pending)`, `padding:0.6rem 0.9rem` | CSS — but see (a) |
| 2 | visible heading `<p>Needs your attention</p>` + 20px warning-triangle SVG | no heading, no icon; accessible name is `aria-label="Needs attention"` | **structural** |
| 3 | row order title → chip → why | chip → title → reason → claim | **structural** |
| 4 | the whole row is the click target (`<div onClick>`) | the title is a `<button>` carrying a 24px floor | **structural** |
| 5 | `gap:4px`; rows `padding:7px 0`, `min-height:24px` | `gap:0.45rem`; no row padding, the floor sits on the title | CSS |
| 6 | `why` in `--label2` | `reason` in `var(--gn-text)` | CSS |

**Why the set is held whole rather than the CSS-only rows taken and the rest reported.** Rows 1, 5 and 6
are not independent of rows 2–4 — taking the tint fill while leaving the heading off produces a treatment
the prototype does not draw and the product never chose, which is a third thing, invented. And each of the
three structural rows meets a record:

- **(a) The tint fill deletes the left border the controller ruled stays, today.** `task-ledger.tsv`'s
  `hig-per-screen/7a` and `8a` rows carry the 2026-09-18 ruling that `.gn-attention`'s 4px left border
  *"carries an affordance"* and is not a leftover, confirmed by Step 5b's own measurement of it at 4.36
  against a 3:1 floor. The ruling's subject was whether that border is contrast DEBT; the prototype's
  container would remove it as a design choice. **That is a decision, not a union, and it is the
  controller's.**
- **(b) The visible heading collides with the copy rule.** The prototype's heading string is *"Needs your
  attention"*; the shipped accessible name is *"Needs attention"*. The dispatch's own rule is that the
  product's copy wins and any string that would have to change is FLAGGED rather than changed silently —
  and a visible heading beside an `aria-label` saying nearly the same thing is a double-name problem, not a
  restyle.
- **(c) The repo's own prototype-delta document already ruled this.** `docs/design/prototype-delta-
  2026-09-18.md:583-586` — written today, read-only on product code — records the same delta, calls the
  flat headingless shape *"a pre-existing ruling"*, and gives `isMyWork` the port verdict **`none`**. **A
  correction to that document is owed and is recorded here rather than made there:** the ruling it cites
  (`packages/app-core/src/views/attention-strip.tsx:37-70`) argues the list is FLAT rather than SECTIONED
  PER KIND — no per-kind sub-headings — which is not the same claim as *no banner-level heading*. The
  verdict may still be right; that citation does not by itself establish it, and a reader who follows it
  finds the weaker argument.
- **(d) `--gn-tint-warning` is an alpha role with a stated single consumer.** `packages/ui/src/tokens.ts`
  records it as *"the only tint role this product has, consumed at exactly one place"*
  (`apps/web/app/globals.css:1314`, the invitations banner), whose docblock adds the constraint that the
  composite holds *"only because this banner sits at page level, not inside a card or other raised
  surface"*. A second consumer must re-establish that condition rather than inherit it. The invitations
  banner is nonetheless a real precedent for exactly this conversion (`globals.css:1296-1307`, Task 8,
  2026-09-15) — which is why this is a recommendation and not a refusal.

**Recommendation, for the controller.** Run Part 2 as its own task, carrying the owner's answer on (b),
since the heading is the visible half of what the owner is most likely reacting to. If the answer is
"adopt the prototype's treatment", rows 1–6 land together, with the left border's ruling explicitly
superseded, the roster's `aside.gn-attention` entry re-measured (its `border` reading
`rgba(178,80,0,1)` **is** that left border and disappears with it), and the `tintWarning` single-consumer
note updated. **Nothing in this change presupposes that answer.**

### ✅ RESOLVED 2026-09-18 — Part 2 is ADOPTED WHOLE (executor 2) — ids `13.890`–`13.893`

**The answer came back yes to both halves, and the two rulings supersede the two records the table above
was built on — one of them as a DESIGN choice, not by a measurement.**

- Owner, on the heading: *"i want the prototype's visible heading adopted."*
- Owner, on the tint fill, asked again because the first answer left it open: *"yes to the prototype's
  tint fill too."*

So **rows 1–6 all landed together, in one commit**, exactly as the recommendation above anticipated: the
set was never separable, and taking the tint while leaving the heading off *"produces a treatment the
prototype does not draw and the product never chose, which is a third thing, invented"* — an argument that
runs in the other direction too, which is why adoption is whole rather than piecemeal.

**Row 1's supersession, stated precisely so a later reader does not think a measurement was overturned.**
`task-ledger.tsv`'s `hig-per-screen/7a`/`8a` rows ruled the 4px left border STAYS, because it renders at
**4.36 against a 3:1 floor** and a marker that passes and carries an affordance is not a leftover. **That
measurement and that conclusion stand — the border was never a contrast failure.** The owner has since
decided the border goes as a **design choice**, which is a different question with a different decider.
The same sentence is at the rule (`packages/ui/src/ui.css`, `.gn-attention`) so a reader who arrives from
the CSS meets it there too.

| # | prototype (`desktop.dc.html:561-575`) | shipped 2026-09-18 | where |
|---|---|---|---|
| 1 | `--tintWarning` card, `--cardR`, `padding:18px 20px` | `--gn-tint-warning` / `--gn-radius-card` / `1.125rem 1.25rem`; **the 4px `--gn-pending` left border is gone** | `ui.css`, `.gn-attention` |
| 2 | visible `<p>Needs your attention</p>` + 20px warning-triangle SVG | the same string, `1.0625rem/1.375rem/600`, the same 20px triangle (`stroke="currentColor"`, `aria-hidden`), and **the accessible name is that string character for character** | `attention-strip.tsx`; `ui.css`, `__heading`/`__icon` |
| 3 | row order title → chip → why | button(title) → chip → reason → claim | `attention-strip.tsx` |
| 4 | whole row is the click target | the button keeps the 24px floor and its `::after` stretches over the row | `ui.css`, `.gn-attention__title::after` |
| 5 | `gap:4px`; rows `padding:7px 0`, `min-height:24px` | `gap: 0.25rem`; rows `padding: 0.4375rem 0`, `min-height: 1.5rem`; heading→list `0.625rem` | `ui.css`, `__items`/`__item` |
| 6 | `why` in `--label2` | reason in `var(--gn-text-muted)` | `ui.css`, `__reason` |

**The claim row is kept and moved, not dropped.** The prototype draws three things per row; the product
draws four, because `item.claim` renders server-composed provenance and dropping it would lose
information. It is now LAST, after the three the prototype orders — `13.892` pins that position rather
than only the first three.

**Row 2's accessible name: which implementation, and why it is the one that does not move a floor.**
Two implementations fix the double-name problem — keep `aria-label` and set it to the visible string, or
drop it and name the region from the `<p>` via `aria-labelledby`. **This took the first.** `aria-labelledby`
removes an `aria-label` ATTRIBUTE from every route the strip renders on, and
`apps/web/e2e-stack/viewport.spec.ts` ratchets that attribute's COUNT with `toBeGreaterThanOrEqual` from
`accessible-names-baseline.json` — `/my-work` is floored at **8**. The standing rule is that a floor is not
hand-lowered to meet a restyle. **The ratchet was NOT re-run and this file does not claim it was**: the
`e2e-stack` suite needs the compose stack, which belongs to executor 1 and is mounted from executor 1's
tree, so a run from this worktree would measure a tree without this change. What is recorded is the
direction and the arithmetic, plus `13.890`'s pin that the attribute is still there.

**The two consequential items the amendment named, and what actually happened to each.**

1. **The non-text-contrast roster's `aside.gn-attention` entry — NOT re-measured, and NOT hand-edited.**
   The entry (`ratio: 4.36`, `border: rgba(178,80,0,1)`) is a generated record of the run that produced
   it, and with the border gone that element's reading is no longer a border reading at all. The sweep
   needs the same compose stack, so it could not be re-run here — and **a hand-edited generated record is
   PARTIAL** (recorded lesson, `packages/app-core`'s members-styling change). The file is left exactly as
   the last run wrote it; its header counts (`examined: 9`, `totalClasses: 5`) describe the PRE-change
   sweep, and its `/members` `input`/`select` entries were already stale for the same reason. **Owner:
   whoever next runs that sweep** — which is a task that already exists, because `/members` needs it too.
2. **`--gn-tint-warning`'s single-consumer note — updated, and the condition RE-ESTABLISHED rather than
   inherited.** `tokens.ts` now names two consumers and states the ground for each. The strip's mount is
   `.gn-shell__main` on `/w/<id>/my-work`, whose ground is `--gn-surface`, so the composite the existing
   `tintWarning` block measures is the right one — and that block already asserts exactly the two text
   roles the strip paints (`text` for the heading and title, `textMuted` for the reason and claim) across
   all six style×theme combinations. **No new assertion was added**, deliberately: a third block asserting
   the same two pairs against the same wash would be a check that cannot fail for a reason of its own —
   the shape case `11.213` was retracted for. The block's docblock records the second consumer and why it
   needed no new teeth.

**A correction to `docs/design/prototype-delta-2026-09-18.md:583-586` is owed and RECORDED, not made** —
it is a read-only delta record for the 2026-09-18 export. It gives `isMyWork` the port verdict **`none`**
and cites `attention-strip.tsx`'s refusal 3 for it, but that citation argues the WEAKER claim (the list is
flat rather than sectioned PER KIND — no per-kind sub-headings), which is not the same claim as *no
banner-level heading*. The owner has now ruled a banner heading in, which makes the correction due rather
than optional. **Owner: the next rewrite of that document.** See `13.890`'s docblock for the same note
written beside the code.

- ✅ **13.890 — the region's accessible name IS the visible heading, character for character.**
  `packages/app-core/test/views/attention-strip.test.tsx`. The heading's text is read off the RENDERED
  `<p>`, and the assertion is `aria-label === that text` — not that a string exists in the component file,
  which is the shape this repo has been bitten by repeatedly. It also asserts the accessible-name
  COMPUTATION agrees (`getByRole('complementary', { name })`), because that is what assistive technology
  reads rather than the attribute. Mutation-witnessed: reverting the `aria-label` to `Needs attention`
  reddens this case alone (1 failed / 20 in the file).
- ✅ **13.891 — the heading's icon is decorative, so the name is not the sentence twice.**
  `attention-strip.test.tsx`. Asserts the SVG is present, `aria-hidden="true"`, and carries no
  `aria-label` and no `<title>` child — `aria-hidden` alone would be defeated by a name of its own.
  Mutation-witnessed: dropping `aria-hidden` reddens this case alone.
- ✅ **13.892 — the row runs title → chip → reason, the prototype's order.**
  `attention-strip.test.tsx`. Asserted as the rendered child class SEQUENCE, with the claim's fourth
  position pinned too: a reorder that left the claim first would satisfy a three-item check.
  Mutation-witnessed: moving the `<Chip>` before the button reddens this case alone.
- ✅ **13.893 — the CSS, measured rule by rule, with a cascade guard.** `packages/ui/test/attention-styling.test.ts`
  (new). Six cases: the extraction control; row 1 (the tint, and **no `border-left` anywhere in the
  family** plus no `--gn-pending`); row 2 (the heading's type and the icon's `color`); rows 3–6 (the
  rhythm, `position: relative` + the stretched `::after`, and the muted reason); **no family selector
  declared twice in either stylesheet**; and witnesses for each. **The witnesses earned their keep
  immediately**: the first `familyRules` resolved rules BY NAME, so a planted duplicate of
  `.gn-attention__items` was invisible to it — the cascade blind spot the file's own docblock claims a
  source scan cannot see, reproduced inside the scan written to look for it. The scan now walks
  sequentially and the uniqueness claim is generalised to every selector in the family.

  **A round of review found two more gaps in that same case, both now closed and both witnessed.**
  **(i)** The "no `border-left` anywhere in the family" claim scanned `ui.css` only — while the file's own
  docblock had already named `globals.css` as the second stylesheet a rule could hide in. Measured:
  appending `.gn-attention__items { border-left: 4px solid var(--gn-pending); }` to
  `apps/web/app/globals.css` left the suite **6/6 green**, and `layout.tsx` loads `ui.css` before
  `globals.css`, so the later rule draws the line in a real browser — the half-applied row 1 this case
  exists to forbid, one line away in the file the docblock had identified and the scan had not read. Both
  stylesheets are now scanned and both are witnessed (**1 failed / 6**, row 1 alone). **(ii)** The
  container scan is a fixed list of SPELLINGS, not a parser: `[class~="gn-attention"] { background:
  transparent; }` — the same class, the same specificity, later in source order — evaded both helpers
  (one requires a literal `.`, the other requires the line to start with the name). That form is now
  caught (**1 failed / 6**, the uniqueness case), and the helper's docblock names the residual it still
  does not cover rather than implying the set is closed.

## The members screen's styling, measured against the prototype (executor 2, 2026-09-18) — ids `13.886`–`13.889`

The owner's instruction, verbatim: *"next task to queue up is the workspace members UI. check the prototype
for the styling and fix it."*

**The measurement came first, and it contradicts the shape of the question.** The dispatch named five
treatments it expected to be missing; **four of the five are already the prototype's values**, and the
fifth is not a styling gap at all but a WIRE absence the page's own docblock already records. What the
family really was missing is the one thing the dispatch did not name — and it was missing because it
lives in the prototype's DATA rather than its markup.

### The five, prototype value / shipped value / verdict

| prototype (`desktop.dc.html`, `isMembers` = `:651-798` at this revision) | shipped (`apps/web/app/globals.css`) | verdict |
|---|---|---|
| table container: `--cardBg` / `--cardShadow` / `--cardR` / `overflow:auto` (`:658`) | `.gn-members`: `surface-raised` / `shadow-raised` / `radius-card` / `overflow:auto` | **aligned already** |
| header row: `--trayBg`, `13px/18px/600`, `var(--label2)`, `padding:11px 18px` (`:662`) | `.gn-members__th`: `surface-sunken` (= the mapping's tray), `0.8125rem/1.125rem/600`, `text-muted`, `0.6875rem 1.125rem` | **aligned already** |
| body: `17px` over `min-width:820px` (`:659`, `:672`) | `.gn-members__table`: `1.0625rem` over `51.25rem` | **aligned already** |
| cells: `padding:13px 18px` (`:672`, `:678`, `:691`) | `.gn-members__cell`: `0.8125rem 1.125rem` | **aligned already** |
| Person cell's second line: `{{ m.email }}`, `13px/18px`, `var(--label2)` (`:675`) | nothing to draw it from | **NOT alignable — wire absence** |
| rows: `style: i % 2 ? "background:var(--fill4)" : ""` (`:3077`, attached at `:671`) | nothing — no rule mentioned the row at all | **MISSING — this change** |
| page container: `padding:0 32px 24px`, `flex`, `gap:20px`, `animation:gnFade .25s ease` (`:652`) | `.gn-shell` (`padding:0 1.25rem 3rem`, block flow) | **the padding is reachable and NOT reached; the flex/`gap` half is not reachable without a restructure** — see below |

**The two-line Person cell is the dispatch's explicit "named absence" branch, and the page docblock
already carries it** (`apps/web/app/w/[workspaceId]/members/page.tsx:53`): the prototype's second line
is the person's EMAIL, and `readMembers` selected `user_id`, `u."name"` and `role` and nothing else
(`apps/server/src/routes/builder-reads.ts:254` — this read *"selects … and nothing else (`:247`)"* until
2026-09-19, when the name fallback added `u."email"` to the SELECT and moved it; the field the prototype's
line needed was the one this branch recorded as missing). Drawing a second line from any other field would be
inventing one. **Recorded, not asked**: the dispatch pre-answered this branch in its own text.

### The zebra, and why the JSX never showed it

`memberRows` (`:3058-3084`) sets `email`, `role`, `seen`, `scopeLabel` — and `style`, a zebra
(`:3077`). It is attached to the row at `:671`, so a port driven by reading the markup sees a row with no
styling at all, which is what happened. **`--fill4` → `--gn-fill-quaternary`** is the mapping table's own
row, and zebra is a NAMED port metric rather than a detail — `Table`'s docblock counts it among the five
List metrics it ports (`packages/ui/src/components/table.tsx:9`), and the ticket list's port names it
(`packages/app-core/src/views/ticket-list.tsx:772`).

**The parity is the prototype's: `i` is 0-based, so `i % 2` tints the 1-indexed EVEN rows.**
`memberRows` is not the only place the prototype writes it — `listRows` writes the identical construct
(`:2887`) — and the product's two ports of it LANDED ON ODD (`.gn-list__table-row:nth-child(odd)`,
`packages/ui/src/ui.css:1088`; `.gn-timeline__row:nth-of-type(odd)`, `:2612`), so those two families read
inverted against the prototype. **`13.887` follows the prototype; the inversion in the other two families
is recorded at the rule with a named owner and is NOT harmonised here** — one screen's styling pass is not
the place to re-parity two others.

### The id space — COLLIDED, renumbered, and the collision is the point

The amendment to this dispatch said *"next free `13.881`"*. **That was wrong before the branch was cut** —
`13.881` and `13.882` were minted by `#471` (`exec2/attention-leaves-project-page`), which merged as
`0e0dbff9` at 16:50, minutes after the amendment was written at 16:34. Recounted at this branch's tip by
case MARKER, `13.883`–`13.885` were then free HERE, and this change minted them at 17:00:29.

**Six minutes earlier, at 16:54:10, the other executor's branch had already minted `13.883`.** Its own head
commit says so: *"Renumber to 13.883: the id the dispatch called free was taken by a parallel writer"*, and
its block carries the lesson this file's head already states — *"a reading that is correct in one tree
expires in another, which is exactly why the case-id protocol is written in BLOCKS."* **Neither tree can see
the other**, so both repo gates pass on both (`check-case-ids` and `check-case-citations` exit 0 here and
there) and the duplicate surfaces only when one PR lands and the other rebases — `check-case-ids.mjs`
asserts `union == sum`, so the second merge goes red.

**This branch yields, because its reading was the later one, and renumbers to `13.886`–`13.888`** —
contiguous, above both trees' high-water mark. Measured on both sides at this tip:
`exec/owner-demotion-guard` carries `13.883` ×5 and stops there (so `13.884`/`13.885` are free in both),
and this tree's sweep for `13.88[345]` returns **no CASE ID** — the pattern does match six lines of
prose (five here and one in `executor-2-state.md`), which is the difference between a sweep and a mint
the file's own head is about, and `check-case-ids.mjs` anchors on the line head so none of them is read
as one. `13.999` and `13.632866` remain this file's
documented truncation traps and are excluded by the `{3}` width. **The remedy is an allocation, not a
number**, and it is on the report to the controller: two executors minting from a shared "next free" pointer
will collide again the next time both are dispatched from one — a BLOCK per executor is the only form of an
id that stays true. **`13.889` joined the set later in the same change set**, when AMENDMENT 2 (owner
  approved, 2026-09-18) ruled the two `Select` fields' labels in — measured free on this tree, on
  `origin/main` and on `exec/owner-demotion-guard` before it was minted, so the next free is `13.890`.

- ✅ **13.886 — the invite form's two native fields wear the product's `.gn-field` pattern, and still
  submit.** `apps/web/test/members-page.test.tsx:988`. Read through the LABEL association rather than by
  id, because a label that no longer labels is the failure a wrapper causes; then the real path end to
  end — type, submit, read what the door was handed — because a wrapper that broke the value's route to
  the handler is the other one. Mutation-witnessed: removing `className="gn-field__input"` from the
  address input reddens this case ALONE (1 failed / 37), and un-wrapping the projects field back to the
  bare pair reddens it alone as well.
  ⚠ **AMENDED BY RULING E5-11 (2026-09-21) — the projects half is no longer a NATIVE field.** It is the
  shared `Select` now, so it wears the pattern the way `Channel`/`Role` do (inside a `.gn-field` with a
  `.gn-field__label`, the component's own trigger carrying `gn-field__input`), and the case asserts the
  same three things about the same three things. Its title's "two NATIVE fields" is now one native
  (the address) and one `Select`; the title is kept because it is what the case was minted as, and the
  live state is this note. **The queries are REGEXES** — `queryAllByRole('button', { name:
  'Project access' })` returns 0 on this trigger while `/Project access/` returns 1, measured — which
  is also why this file's own `Role` queries have always been regexes.

- ✅ **13.1181 — the invite form's project field offers project NAMES, not identifiers (ruling E5-11,
  2026-09-21).** `apps/web/test/members-page.test.tsx`. It was a text box labelled *"Projects
  (comma-separated ids, optional)"*, so a person had to transcribe project ULIDs from somewhere else;
  `docs/manual.md` said so in as many words — *"In practice this box is not usable by a person"* — and
  the finding's judge measured a form whose own docblock already refused to "offer a choice the door
  will reject" for two of its three choices while the third had no honest input at all. It is now the
  export's `<select>` (`desktop.dc.html:768-772`), fed from `useWorkspaceProjects` — the SAME
  `GET /v1/me/workspaces` read the workspace name beside it already makes. **Three cases:** the option
  list is *All projects in this workspace* first, then one *Only `<name>`* per project in SERVED order,
  with the ID as the option's VALUE and never its label (the whole ruling is that a person chooses a
  name and the wire still carries the id); a CONTROL that an UNANSWERED projects read offers only *All
  projects* — the hook holds `null` and not `[]`, and `[]` would be the claim "this workspace has no
  projects", so without this arm a select falling back to the id would pass the case above; and a
  CONTROL that the default choice sends NO `projectIds` key (the door refuses `[]` exactly as it refuses
  a guest's). **Mutation-witnessed with two distinct signatures:** labelling the options with the ID
  reddens the three cases that choose by name (`Tests 3 failed | 37 passed`), and dropping the
  `all`-omits-the-key term reddens the omitted-key control alone (`Tests 1 failed | 39 passed`). The
  id is from **B13's allocated §13 block (13.1177–13.1186)**, not this file's 13.88x series, because
  §13 ids became per-release-batch; the case still lives here, beside its siblings. — (`apps/web/test/members-page.test.tsx`)

- ✅ **13.887 — the roster's zebra, on the rows the prototype actually tints.**
  `apps/web/test/members-styling.test.ts:167`. FOUR claims, and each is there because a different defect
  satisfies the others: the even-child rule carries `--gn-fill-quaternary`; NO odd-child rule exists (odd
  beside even tints every row, which is a table with no zebra and no way to notice); **EXACTLY ONE rule
  SELECTOR in either stylesheet names the row, matched across line breaks with comment spans stripped**; and an in-test witness that each plant LANDS
  before it is asserted to redden — `replace` matching nothing prints success, which is this repo's own
  recorded trap, and the witness now also asserts its anchor is unique so a second copy surfaces as a named
  failure rather than a false red.

  **The third claim is here because the FIRST review measured the case blind without it.** Every other
  assertion here reads DECLARATIONS, and a later rule can neutralise the one they read while all of them
  stay green: appending `.gn-members tbody .gn-members__row:nth-child(even) { background: transparent; }`
  left **36/36 passing with the zebra dead in a browser** — 36, because that measurement predates this
  case; the post-fix totals below are /37. The count catches it, and the witness asserts BOTH halves — the
  extracted rule still reads `--gn-fill-quaternary` (the old check green) while the count has gone to two
  (the new check red).

  **AND THE SECOND REVIEW THEN DEFEATED THAT COUNT TWICE, which is why it is a SELECTOR scan now and not a
  line scan.** Its first version matched LINES: it required the selector and its `{` on one line, and it
  skipped any line starting with `*` (a guard meant for comments). Both evasions were measured green with
  the zebra dead in a browser — a selector split across two lines (`0,3,0` beats `0,2,0`), and a
  `*`-prefixed selector (`*` adds no specificity, so it TIES and wins on source order). Comments are now
  stripped by CONTEXT instead of by a line prefix, **and that guard's own justification was false**:
  `grep -n "gn-members__row" apps/web/app/globals.css` returns exactly one line, the rule itself, so the
  premise ("this file documents the rule in prose naming its selector") was invented — and had such prose
  existed, the prefix guard would have FALSE-REDDENED a correct tree, because prose there starts with bare
  text rather than `*`.

  Mutation-witnessed against the real file, tree restored and sha256-verified at every step: parity flipped
  `even`→`odd` reddens 13.887 (4 failed / 37); the fill swapped to `--gn-surface-sunken` reddens 13.887
  (2 failed / 37); the one-line override — 0 failed before this case existed — reddens 13.887 (2 failed /
  37); **the two-line selector reddens 13.887 (2 failed / 37)**; **the `*`-prefixed selector reddens it too
  (2 failed / 37)** — where the first version of the helper passed both; and the false-red CONTROL, a prose
  comment NAMING the selector inside an otherwise correct tree, stays **37/37 green**. What remains outside
  this instrument's reach is a rule that targets the ELEMENT rather than naming the row (`tr`, `tbody`); no
  stylesheet in the product carries one today, and a rendered measurement is the e2e-viewport suite's job.

- ✅ **13.888 — the four treatments that were already the prototype's, pinned as VALUES.**
  `apps/web/test/members-styling.test.ts:125`. It asserts declarations — `0.8125rem`, `1.125rem`, `600`,
  `var(--gn-surface-sunken)`, `0.6875rem 1.125rem`, `1.0625rem`, `51.25rem`, `var(--gn-radius-card)` —
  rather than that a rule exists, which is the distinction this repo has been bitten by repeatedly: a rule
  that is present and does nothing reads identically to one that works. It is a regression pin on four
  treatments this change does NOT alter; the fifth and sixth rows of the table above are 13.887 and a
  named absence respectively.

- ✅ **13.889 — the two `Select` fields wear the field pattern's LABEL half, and stay the shared
  `Select`.** `apps/web/test/members-page.test.tsx:1053`. RULED, not decided here: AMENDMENT 2
  (owner-approved, 2026-09-18) — *"label it inside `.gn-field` … but pass no native-control class to
  it."* Channel and Role are wrapped in `<label className="gn-field">` with a `.gn-field__label` span,
  which is what the prototype draws (`desktop.dc.html:752-753`, `:758-759`), and no class is passed to the
  `Select`. Mutation-witnessed against the real file, tree restored and sha256-verified: dropping the
  `gn-field__label` class from the Channel label reddens 13.889 alone (1 failed / 38), and converting
  that `Select` BACK to a native `<select>` reddens it alone as well (1 failed / 38).

  **What the case deliberately does NOT assert, because either would be red against correct code.**
  (a) The ABSENCE of `.gn-field__input` on the trigger — the shared component puts that class on its own
  trigger (`packages/ui/src/select/select.tsx:254`), so it is on every `Select` in the product whatever
  the caller does, and the ruling's instruction is about what THIS page passes. What the page controls,
  and what the case asserts, is the label half. (b) The absence of a `<select>` element inside the
  wrapper — the shared component renders a `HiddenSelect` (a visually hidden native `<select>`) on
  purpose (`select.tsx:253`). The trigger's tag and class are the honest signal, and they are asserted.
  **THERE IS NO VISIBLE RESIDUE, and the sentence that claimed one was refuted at the line by the third
  review.** It said these rows show a 15px `Select` trigger beside two 17px inputs; the 15px came from the
  PROTOTYPE's inline style, not from this product's cascade. `.gn-select__trigger` declares no
  `font-size` (`packages/ui/src/ui.css:1604-1612`) while the `.gn-field__input` it also wears declares
  `1.0625rem` (`:3866-3875`, and `packages/ui/src/select/select.tsx:254` puts both on the trigger), so
  equal specificity and later source order give **17px — the same as the inputs and the same as the
  prototype draws** (`desktop.dc.html:754`, `:760`).

  **The same review defeated this case twice, and both defeats are now assertions** (D2 and D3, planted in
  the real file with a sha256-verified restore, each killing 13.889 ALONE at 1 failed / 38):
  `<label className="gn-field">` swapped for `<div className="gn-field">` stayed green, and moving the
  `.gn-field__label` span AFTER the control stayed green — while `.gn-field` is `flex-direction: column`,
  so DOM order IS visual order and the prototype's label-over-control would have been inverted on screen.
  The case now asserts the wrapper's TAG and that the label is its first element.

  **And the ruling's instruction is enforced by the COMPILER, which the same review measured**: passing
  `className` to a `Select` is a `tsc` error (`SelectProps` has none), at all three sites it planted —
  vitest stays green over it and `typecheck` reddens. A property with a compiler behind it needs no test
  to hold it, and that is worth knowing before writing one.

### The independent review, and what it forced

One reviewer at the frozen head, with a lean brief: verify every citation at the line it names, check that
no token outside the shared set was introduced, and decide whether the three cases can fail. It reproduced
the sweep and ran its own mutations on copies under `/tmp` and never touched the live tree.

**It found one CRITICAL and four Important or Minor defects. Every one is corrected above rather than
argued with.**

1. **CRITICAL — the case ids collided with the other executor's branch.** See *The id space* above: the
   reviewer measured `13.883` already minted on `exec/owner-demotion-guard` six minutes before this
   branch took it, and this branch yielded and renumbered to `13.886`–`13.888`. **The reviewer's
   contribution was not the number but the LINKAGE**: it named the mechanism (`check-case-ids`'s
   `union == sum` reddening only at the second rebase) that makes two internally-consistent trees a
   deferred failure rather than a visible one.
2. **IMPORTANT — the reason recorded for leaving the `Channel` and `Role` labels bare was FALSE.** It
   said `.gn-field__input` is "a class for NATIVE controls" a `Select` cannot take. The shared component
   puts that exact class on its own trigger (`packages/ui/src/select/select.tsx:254`, `:231`, `:432`).
   Corrected in the case docblock and in `Features.md`: the verdict for those two fields is **alignable
   and not aligned**, and the decision is the controller's because the amendment reserved it.
3. **IMPORTANT — "the minted-link card … render as a bare stack" overstated the measurement.** A `Card`,
   a `Button` and two `Select`s are styled shared families; only the form container, the `<h2>`, the
   pending `<ul>` and the two label spans are genuinely rule-less. Corrected above and in `Features.md`.
4. **IMPORTANT — the page-container verdict ignored an in-tree precedent.** `apps/web/app/globals.css:2088`
   gives `.gn-legal` its own `padding-top`/`padding-bottom`, applied at
   `apps/web/app/privacy/page.tsx:176` as `<main className="gn-shell gn-legal">` — **a route-scoped
   modifier BESIDE the shared class, not a fork of it**, the same shape `gn-mcp-authorize` and
   `gn-mcp-tokens` already use. So the prototype's `padding:0 32px 24px` is reachable in one rule as
   `0 2rem 1.5rem`, and the honest verdict is **reachable and NOT reached**, not "not alignable".
   **Not taken here**, because the other half of that row — `display:flex` with `gap:20px` — needs the
   children inside one container, which IS the restructure the dispatch forbids, and taking the padding
   half alone would draw a treatment neither document draws. It is on the report to the controller.
5. **MINOR — four line-number defects, all fixed**: `packages/ui/src/ui.css:2611` → `:2612` (the
   selector is on `:2612`; three files cited it), `members/page.tsx:55-57` → `:52-53` (the Email
   absence, two files), `page.tsx:812-818` → `:812-821` (the sibling field block, two files), and a
   **misattributed quotation**: the principle "assert a computed value, not that a rule exists" was
   credited to case 13.284, which is about non-text contrast identification and says no such thing. The
   quote is gone; the principle is stated plainly. **This one is the `verdict-must-cite-a-line-you-read`
   shape inside the very docblock explaining the measurement discipline.**
6. **MINOR — the zebra case could be defeated by a higher-specificity override**, which the reviewer
   measured at 0 failures on a `/tmp` copy. The exactly-one-rule count assertion closes it, and the
   witness asserts both halves — the old check green, the new check red.

**Round 2, a scoped re-review at the fix head.** It confirmed all four defects closed and every corrected
citation true at the line — and then found **no Critical and two Important defects, both of them in the
FIX rather than in the original change**:

- **the new cascade count could still be defeated.** A selector split across two lines, and a
  `*`-prefixed selector, each left the suite green with the zebra dead in a browser — the helper matched
  LINES and skipped anything starting with `*`. It is now a SELECTOR scan that strips comment spans by
  context and matches across line breaks; both evasions redden 13.887 (2 failed / 37 each), and the
  false-red control — prose naming the selector inside a correct tree — stays 37/37 green.
- **the comment guard's premise was false, and its failure direction was a FALSE RED.** It claimed
  `globals.css` documents this rule in prose that names its own selector; that file contains exactly one
  such line, the rule. Had the prose existed, the guard would have reddened a CORRECT tree. Restating the
  reason would not have fixed it — stripping comments by context removes the premise.
- **the handoff's superseded block carried a number this branch now owns**: the blanket renumber rewrote
  its historical "next free `13.883`" into `13.886`. Restored, marked superseded, with the live pointer
  (`13.889` — measured free on this tree, on `origin/main` and on `exec/owner-demotion-guard`) named beside
  it. **A blanket renumber corrupts historical prose**, which is worth more than the one row it broke.
- **two Minor defects in this section**: the `13.88[345]` sweep sentence claimed a null where the sweep
  returns six lines of prose (and no case id), and the "37/37 passing with the zebra dead" figure was
  measured on the pre-fix 36-test tree.

**AMENDMENT 2 arrived after both review rounds** (owner-approved, 2026-09-18): *"label it inside
`.gn-field` … but pass no native-control class to it."* It settles the question round 1 raised and this
change had left open — the two `Select` labels are now wrapped, with no class passed to the component —
and it carries case 13.889 with its own two mutation witnesses. **It is a POST-FREEZE change to an open PR
and is recorded as a new head rather than folded in as a footnote**; the frozen-head figures above are the
pre-amendment ones and the PR body says which head carries what. The ruling's own caution is honoured:
the shared `Select` is NOT restyled, and the role-change predicate is untouched — the row's role control
was narrowed by a separate owner ruling the same day, a different task.

**Confirmed, not merely agreed with:** the `isMembers` block's `:651-798`, the `memberRows` zebra and
its 0-based index, the even-row parity, both odd-parity product zebras, the four already-aligned
treatments on both sides, the `readMembers` wire absence, the mapping table, and the invitation-family
sweep — each re-measured by the reviewer at the line it names, on copies, with a control.

### Recorded with named owners, not fixed here

- **THE INVITATION HALF OF THIS SCREEN HAS NO CSS FAMILY AT ALL** — the finding this dispatch did not
  anticipate and the reason it is recorded rather than folded in. `.gn-invite-mint*` and
  `.gn-invite-pending*` appear in `apps/web/app/globals.css` exactly once, `__url`'s `font-family`
  (`:104`); a repo-wide `git grep` for the two families returns only that rule, the page's own JSX, and
  prose. **The control runs in the same invocation**: the identical search reaches the `.gn-members` rules
  in the same file, so this is a measured null and not a failed sweep. A SECOND INSTRUMENT AGREES FROM THE
  OTHER SIDE: `apps/web/e2e-stack/non-text-contrast-roster.json` — a real browser — records `input` and
  `select` on `/members` wearing Chrome's own UA border, `rgba(118,118,118,1)` at 3.81, which is what an
  unstyled native control has. **What is unstyled is narrower than "the whole half", and the first version
  of this sentence overstated it**: the form's own container, its `<h2>`, the pending `<ul>` and the two
  bare label spans have no rule — while the minted-link card is a `Card` (`gn-card`,
  `packages/ui/src/ui.css:160-165`), the submit is a `Button` and both pickers are the shared `Select`, all
  styled shared families. **A next task should not go and re-style a `Card`.** **It is a family to PORT, not a treatment to align, and this dispatch bounds the
  pass** — the amendment adds exactly one deliverable and says so. Owner: the controller, for the next
  task on this screen. **The `.gn-field` wrapping is the visible half of the cure and does land here**;
  the form's container, heading and pending list do not.
- **The contrast roster's `/members` entries are stale as of this change.** Wrapping the two fields moves
  them off the UA default onto `input.gn-field__input`, whose border is `var(--gn-border)` under
  `hig`/`minimal` and ABSENT under `neo` — the arm that carries a sanctioned waiver for two other routes
  (`/sign-in`, `/workspaces`) and does not carry `/members`. **The sweep that writes that file needs the
  hot stack, which is executor 1's and out of bounds for this session**, so the file was NOT hand-edited:
  a hand-edited generated record is partial by construction. Owner: whoever next runs the e2e-stack sweep.
- **The dispatch's own citation of the prototype block (`:647-783`) is stale**; at this revision the
  `isMembers` block opens at `:651` and closes at `:798`. The prototype-delta doc (`docs/design/
  prototype-delta-2026-09-18.md:524-542`) carries the same drift in the other direction — its `### isMembers`
  section describes the `<ul>` roster this screen has not had since `#443` and asserts the family is
  unstyled throughout. Owner: the next change to that document.
- **An instrument lesson, recorded because it was measured here.** The first `M4` plant removed a
  `<label>`'s opening tag while leaving its closing one, so the file failed to TRANSFORM — and the JSON
  reporter surfaced that as `total=7 passed=7 failed=0` with the broken file simply absent from the
  assertion list. **A mutation result of `failed=0` is not evidence unless the total equals the full
  suite's count**; the suite-level failure is in `testResults[].message`, not in `assertionResults`.

## The roster's name fallback: an address on the wire, withheld where it is synthetic, and ONE resolved label (executor 2, 2026-09-19) — cases `13.958`–`13.960`

**The owner's instruction:** *"on the member's page, member list, if the name is absent, show the email
instead."* It is a decision to show an address, so it was routed to the owner as a **disclosure** question
before anything was built (`EXEC2-RULING-REQUEST-2026-09-19-members-name-fallback.md`), and ruled on in
terms (`CTL-RULING-2026-09-19-members-name-fallback.md`).

**Id block `13.958`–`13.960`, recounted at this tip by TWO instruments that agree.** The marker sweep and
the test-file citation sweep both put the highest used id at **`13.955`**; `13.956`–`13.957` are exec 1's
block tail, recorded *"left UNUSED"*, so taking them would consume another block's boundary and they are
skipped deliberately. `13.958`–`13.965` measure **0 occurrences repo-wide**, with a control in the same
invocation (`13.955` = 6) proving the sweep can see ids at all. **The triple is left contiguous on one
line because the change is one feature with one owner instruction**, even though `13.958`'s subject is a
route and the other two are client-side — `builder-reads.test.ts` already carries `13.611`/`13.612` for the
same reason. *(Flagged for the controller's veto: this block was minted on the standing "recount at the tip"
instruction rather than allocated by name, because the ask at
`EXEC2-ASK-2026-09-19-case-id-block.md` had not been answered when the build finished.)*

### What was measured before a line was written, and why it changed the shape of the answer

**`user.name` is `NOT NULL` and an EMPTY name is the ORDINARY case for an email sign-up.** better-auth's
magic-link request schema has `name` as `optional()` and stores it verbatim (`value: JSON.stringify({ email,
name: ctx.body.name })`); on verification it creates the user with **`name: name || ""`**; and this
product's sign-in page passes no name (`apps/web/app/sign-in/page.tsx`, `.magicLink({ email, callbackURL })`).
**So every magic-link user has `name === ''` today** — the empty cell and the nameless control were not an
edge case, they were the ordinary email population.

**And the phone path can never be nameless:** `apps/server/src/auth/auth.ts` sets
`getTempName: (phone) => phone`, so a phone sign-up's name *is* the phone. Its address, meanwhile, is
synthesised from the same phone (`getTempEmail`, `<digits>@phone.gisik-nokma.invalid`).

**The two populations therefore cannot overlap AS THIS PRODUCT CREATES THEM, and that is what makes the instruction coherent rather than
risky: the fallback fires exactly for genuine addresses and never for synthetic ones.** It is also what
makes withholding the synthetic address free — those rows always have a name, so they never reach the
fallback this field exists to serve.

### The cases

- ✅ **13.958 — the roster carries a real address and WITHHOLDS a synthesised one, IN THE SAME ANSWER.**
  `apps/server/test/routes/builder-reads.test.ts`. Every user the read harness creates signs in **by
  phone**, so every address in that world is synthesised — which would let a route that dropped `email`
  entirely pass. **One member is therefore moved onto a real address** (an `UPDATE` on `"user"`, which is
  better-auth's vendor table and not a projection: no event writes it, and case `7.39` above already
  SELECTs from it), restored in a `finally`. **The control runs FIRST and is what makes the absence an
  absence:** the vendor column really does hold an address for every member, and the non-real ones really
  are synthetic. Then: the real address travels; every other row has **no `email` key at all** — asserted
  with `in`, because a route sending `email: undefined` would satisfy `=== undefined` and would be the
  wrong shape; and **the synthetic domain appears nowhere in the response BYTES**, which is the strongest
  form of the claim and the reason the field is withheld rather than blanked. *(A phone-only member's
  address has the phone number as its local part, so this is a phone number that is not on the wire, not
  merely unrendered.)* **Mutation-witnessed:** replacing the withholding with `email: row.email` reddens
  this case ALONE (`1 failed | 33 passed`) at the `in` assertion — `[id, true]` against `[id, false]` —
  while the control and the real-address arm stay green, so the failure names the withholding and not the
  fixture.
- ✅ **13.959 — `mapActors` carries `email` when the server sent one, and passes its ABSENCE through
  untouched.** `packages/app-core/test/online/mappers.test.ts`. This is the seam a carried field is
  dropped at, so it is asserted rather than assumed. **`toStrictEqual` and not `toEqual`, and the
  difference is this case's whole spine** — verified by measurement, not from the docs: under a mutation
  that sets `email: undefined` on the withheld row, `toStrictEqual` fails (`{…(4)}` vs `{…(3)}`) while a
  `toEqual` written over the *same body* **passes**, because `toEqual` ignores a key whose value is
  `undefined`. The distinction this case protects — *absent* versus *present and undefined* — is exactly
  the one `toEqual` is blind to, so the matcher is part of the assertion rather than a style choice. A
  `null` address is REFUSED, not treated as absence: absent is the server withholding, and `null` is a
  body this client cannot read.
- ✅ **13.960 — the roster shows the address when the name is absent, and names the control after the SAME
  label.** `apps/web/test/members-page.test.tsx`. **Three sites were all reading the same possibly-empty
  string** — the monogram, the name cell, and the control's `aria-label` — which is how they came to be
  broken together. The fixture holds **both populations**, because one alone would not notice a fallback
  that fired unconditionally: a nameless member with a real address (the fallback fires; the cell shows the
  address and the monogram is no longer a blank disc) and a phone member with a name and **no `email` key**
  (the fallback must not fire, and there is nothing to fall back to). The control's label is asserted
  through the **attribute**, not by role name, because its accessible name is a concatenation (`13.828`).
  The defect is then asserted **in its own form** rather than by example: no control on the screen
  announces the fragment. **Mutation-witnessed twice, and the second is the one that matters:** removing
  `memberLabel`'s fallback reddens it at the cell; reverting **only** the `aria-label` site to
  `member.name` reddens it at `:1141` with `expected 'Role for ' to be 'Role for anselma@example.test'` —
  **the failure message IS the defect.**

### What is NOT covered, named rather than implied

- **No viewport or browser run.** The suite that would cover this screen starts its own `next dev` on
  `:3021`; the members route is not in `responsive.spec.ts`, and a viewport run would prove nothing about
  a label's text.
- **`memberLabel`'s third step (`?? member.id`) is reachable only by a magic-link sign-up on the SYNTHETIC domain** — accepted by better-auth's `z.email()`, measured — and is asserted
  nowhere. It is there so that a future population with neither a name nor an address degrades to the id
  rather than to an empty cell — the same convention `actorLabel` uses. Its absence from the cases is
  deliberate and is recorded in the function's own docblock.
- **The accessible-name baseline was not re-run.** The two live `aria-label` strings on this route are
  unchanged in COUNT (the same controls, renamed only for the nameless population), so the ratchet's
  number should not move — but that is a prediction, not a measurement, and the owner of that sweep is
  whoever next runs it.
