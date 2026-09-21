# 13. Second wave: board actions, members and roles — test cases

Part of bucket 13 (`Features.md` §13) — one part-file of the catalogue split performed 2026-09-19.
Index and id-block allocation: [`13-deployment-dogfooding.md`](./13-deployment-dogfooding.md).
Case ids are unchanged and are never renumbered by the split.

## The members roster, ported from the prototype (executor 2, 2026-09-18) — block `13.760`–`13.766`

Block `13.760`–`13.819`, allocated to executor 2 by the controller so that two executors minting
in parallel cannot collide. **One clause of this paragraph was corrected at the rebase onto `main`
(2026-09-18), and the correction is kept visible rather than overwritten** — it is the same id-arithmetic
fault this file keeps recording. It read "`13.694` is still unwritten", and it was: at the shared base
`afbd361d` the highest case MARKER in this file was `13.693`, and `13.694` appeared only as prose
("the next free id is `13.694`"). Executor 1s Task 1 then measured the same thing at its own tip and
minted **`13.694`–`13.696`** — the section immediately above this one. The live picture is therefore:
`13.694`–`13.696` minted by executor 1, `13.697`–`13.699` **minted by nobody**, `13.700`–`13.759`
reserved to executor 1, `13.760`–`13.819` reserved to executor 2 (this section). Every id below was
recounted at this tip before minting rather than assumed from the block floor.

The screen is `design-system/interactive/desktop.dc.html@6d7b67c0a52c:651-798` — the members screen's
body, with the invite panel to follow at `:722`. The prototype draws **five** table columns and two
side panels; the members read serves **four** fields (`user_id`, `u."name"`, `role`, and `u."email"`
since 2026-09-19 — `apps/server/src/routes/builder-reads.ts:254`; this sentence read THREE and `:247`
until that change moved the SELECT and added the address). The port is therefore partial by construction, and the
four things not drawn are named as deliberate absences in the page's own file docblock and in the
commit message rather than left to be inferred from an empty column. **A case is not minted for them:**
they are scope decisions about surface nobody wrote, not scenarios with an assertion, and minting a
`🚫` apiece would put four numbers in this file that no test could ever flip. The precedent — `13.319`'s
mobile deferral — is a 🚫 because the work was SCHEDULED and then consciously dropped; these columns
were never in scope for a client whose route cannot serve them.

- ✅ **13.760 — `role` survives the mapper, and a member with no role is refused rather than
  defaulted.** The one defect class this repo has been bitten by hardest is a field the server sends
  and the client silently drops, and every view-level test drives a fake data source, so none of them
  can see the drop: the assertion has to be made at the mapper, the single seam the wire crosses, and
  against a fixture typed as the server's own `MemberListResponse`. `RosterMember = Actor & { role:
  string; email?: string }` (`view-types.ts:60`) — an `Actor` with a field ADDED, so `rosterByActorId`
  and the board's roster join keep compiling, which the case asserts beside the values (`mappers.ts:444`,
  the `role` read). *(Both citations here were re-pointed on 2026-09-19: the name fallback widened the
  type and the mapper, and this row's original `view-types.ts:44` / `mappers.ts:431`/`:438` pointed into
  the lines it moved — `:438` in fact named the `id` read rather than the `role` one even before that
  change, so it was corrected rather than shifted.)* The second arm runs its positive control FIRST and through the same path: the
  identical body WITH its role maps cleanly, then the body without one throws
  `members.members[0].role: expected a string` and it is a `MappingError`, not a `ServingGapError` —
  the route does send this field, so a body missing it is unreadable rather than unserved.
  (`packages/app-core/test/online/mappers.test.ts:148`, `packages/app-core/src/view-types.ts:60`,
  `packages/app-core/src/online/mappers.ts:444`)

- ✅ **13.761 — the roster is a table with a Person column and a Role column, one row per person, role
  printed as the wire's own token.** This is the other half of the absences recorded above: "we left a
  column out" must not quietly become "we left the table out". The role is asserted as `owner` /
  `member`, NOT as a prettified label, because that is what the row carries — `role` is a plain
  `string` on `RosterMember` (never a second `WorkspaceRole` list to drift from), and a case expecting
  "Owner" would assert a mapping nobody wrote. The case also pins the ABSENCE of a per-row control:
  no `combobox`, no `button` inside the table, because the prototype's role cell is a `<select>` under
  `canEditRole` (`:679-685`) and no route accepts a role change on this branch — a picker here would be
  a control that cannot be honoured. (`apps/web/app/w/[workspaceId]/members/page.tsx:253`, `:256`,
  `:259`, `:294`, `apps/web/test/members-page.test.tsx:446`)

- ✅ **13.762 — the monogram draws one capital and does not repeat it to a screen reader.** The
  prototype's disc repeats the person's first letter BESIDE their name (`:674-675`), so read aloud the
  row would say "A Anselma Marak" unless the disc is hidden from assistive tech. Both halves are
  asserted because each alone passes on a broken screen: the half that only checks the letter passes on
  a screen that says it twice, the half that only checks the accessible name passes on a screen that
  draws no disc at all — which is the whole port. The positive arm is `getByRole('row', { name: /Anselma
  Marak/ })`; the negative arm is `queryByRole('row', { name: /A Anselma/ })`. That pattern cannot match
  the name on its own — "Anselma" does not contain "A Anselma" — so the negative assertion is a real
  measurement rather than a tautology.
  (`apps/web/app/w/[workspaceId]/members/page.tsx:272`, `apps/web/test/members-page.test.tsx:481`)

- ✅ **13.763 — the summary line is COUNTED from the roster the viewer was served, not a literal.** The
  prototype's own string (`:3032`) hardcodes "one owner"; the port counts owners and admins from the
  roster instead, and it counts the people THIS viewer may be told about rather than the workspace's
  membership, because `readMembers` hides guests from a non-admin caller. The sentence is therefore
  `You can see N people · O owner(s), A admin(s). Membership and roles are per workspace.` The case
  mounts TWICE over two different rosters — two people, one owner; then three people, one owner, one
  admin, with a guest riding along in the total and in neither count. A constant, or a summary counted
  from a fixture, passes the first mount and fails the second, which is the pair's entire job.
  (`apps/web/app/w/[workspaceId]/members/page.tsx:222`, `:367`, `apps/web/test/members-page.test.tsx:517`)

- ✅ **13.764 — the workspace name is OPTIONAL, and the clause is omitted rather than filled.** The
  prototype's sentence opens "N people in <workspace name>", and on this branch the name is genuinely
  unavailable far more often than missing (**⚠ CORRECTED 2026-09-20: this read "the name is genuinely
  unavailable far more often than missing: `getMyWorkspaces` refuses whole (`mapWorkspaceRefs` throws a
  `ServingGapError`)." That refusal is gone — rulings P32/P38; the register emptied on 2026-09-19 — so
  the name is now unavailable only when it is genuinely missing, which makes the OPTIONALITY below more
  load-bearing rather than less**). `useWorkspaceName` already answers `string | null` and fails silently to `null`,
  so the summary keeps the prototype's wording and drops the `in <name>` clause when it has no name.
  Both readings are asserted, and the second asserts the WHOLE string with `toBe` — a substring
  assertion on the front half would sail past `undefined` or `in null` — and then asserts the text does
  not contain the raw workspace id and does not contain `undefined`. The un-stubbed
  `getMyWorkspaces` is the shape of a real refusal rather than a stand-in for it — **⚠ CORRECTED
  2026-09-20: that read "the shape of the real refusal", and `getMyWorkspaces` does not refuse; the
  un-stubbed shape is this helper's own rule rather than a live server state** — because
  `stubServices` rejects an un-stubbed read by name.
  (`apps/web/app/w/[workspaceId]/members/page.tsx:222`, `apps/web/src/use-workspace-name.ts`,
  `apps/web/test/members-page.test.tsx:559`)

- ✅ **13.765 — an empty roster says what is listed, not who exists, and no count is drawn over it.**
  `online-data-source.ts` answers `[]` BOTH for a body whose `members` array is empty AND for the 404
  this route sends a guest (`door(..., 'no-guests')`) — one shape, two meanings, and the client cannot
  tell them apart. Since a workspace always has an owner, `[]` in practice means "you may not read
  this roster" rather than "nobody is here", so "Nobody is in this workspace" would be a confident
  claim about the world drawn from an absence. The page says `No members are listed here.`, true of
  both readings, and the summary is suppressed because "You can see 0 people" is a number nobody
  counted and the qualification that makes the non-empty line honest has nothing to qualify.
  (`apps/web/app/w/[workspaceId]/members/page.tsx:244`, `apps/web/test/members-page.test.tsx:600`)

- ✅ **13.766 — the heading is `Members` and nothing is counted before the roster answers.** The
  heading is the prototype's own (`:654`); this route's `<h1>` read `People` until 2026-09-18, and the
  rename is deliberate rather than tidy-up — the prototype is the spec and the nav item that reaches
  this page already says Members. The loading arm is asserted with a read that NEVER settles, which is
  the only way to hold the page in that state: a resolved stub's assertion races the microtask queue.
  Both absence halves are asserted too — no table and no summary before the read answered, because a
  roster drawn over a pending read is a roster nobody was served.
  (`apps/web/app/w/[workspaceId]/members/page.tsx:218`, `:229`,
  `apps/web/test/members-page.test.tsx:623`)

**The CSS family** is new rather than edited (`.gn-members` had no rules at all before this change) and
lives with the other screen families in `apps/web/app/globals.css:1407-1550`, built on the shared
`--gn-*` role tokens per the mapping table at
`docs/superpowers/plans/2026-09-16-board-prototype-port.md:33-52` — no literal colours. Three class
names were already in use and keep working (`.gn-members`, `.gn-members__row`, `.gn-members__not-admin`);
the rest are added. The monogram disc uses `--gn-fill-tertiary` rather than `.gn-avatar`'s
`--gn-surface-sunken` because under `neo` all three surface roles collapse onto one `neoPaper` hex, so a
disc drawn in `surface-sunken` would lose its edge against the card it sits on. The role chip is the
shared `.gn-chip` CLASS rather than the `Chip` component, because the component always renders a dot and
the prototype's role chip has none.

**Not measured at this tip, and named rather than implied:** the Playwright/e2e-stack and the
HIG-per-screen e2e suites were NOT run (they need the hot stack on port 3001, which a peer holds). The
three geometry baselines they own were reasoned about rather than measured — `accessible-names-baseline.json`
and `type-scale-baseline.json` are floors, and the smallest type this change introduces is `0.8125rem`,
above the 12px floor — but reasoning is not a measurement and no id is minted on the strength of it.

**Recount, at this tip.** Six ids are minted here (`13.761`–`13.766`) plus `13.760` in the app-core
mapper suite, all inside the reserved block `13.760`–`13.819`; the next free id inside this executor's
block is `13.767`. Measured, not assumed: the highest case HEADING in this file is `13.693` (Step 4b's
block, three sections up), and `13.694`–`13.759` are unwritten — `13.694` is the next free id in the
file and `13.760` is the floor of the reserved block, and the two are not the same number.

**Reconciliation note at the rebase joint (executor 1, 2026-09-18), because these two sections were written on
two branches and their id recounts were taken at two different tips.** Both are kept VERBATIM — neither is
rewritten, and the disagreement is left readable rather than smoothed away. Executor 2 measured the highest case
HEADING as `13.693` at base `afbd361d`; Task 2 of the second wave then merged (13.700/13.701, PR #442,
`7c2a1777`), so on the MERGED tree the highest marker is `13.701` and executor 2 s "13.694 is the next free id in
the file" no longer describes this file. Neither block collides: 13.700–13.704 and 13.760–13.766 are disjoint.
`13.694`–`13.699` remain genuinely unallocated — Task 2 flagged the gap for a ruling and it is still open.
Measured here after the merge, over case MARKERS and test NAMES only.

**Task 3 (server + wire) — `13.702`–`13.704`.** Ids recounted at this tip (branch `exec/second-wave-t3-wire`,
cut from `origin/main` `7c2a1777`), over case MARKERS and test NAMES only, never a substring sweep: the
highest marker in this file is `13.701` (Task 2's pair) and the highest test name is `13.682`, so **`13.702`
is the next free id**. The dispatch's "`13.702`" was right; the recount is what makes it a fact rather than
an echo, and it is the third time this block has had to say so. `13.697`–`13.699` remain unallocated — Task
2's note that this wants a ruling before anyone mints there still stands, and this task did not touch them.

**The decision Task 1 deferred, settled here with its measurement.** Task 1 left `rank` unwritten by the
creation branch, because `rowToTicketState` builds a `TicketState` from COLUMNS and the column did not
exist yet; its comment said so and handed the question to Task 3. **`ticket.created` now writes `rank:
null`**, and `rowToTicketState` reads the column unconditionally. The alternative — leaving the key absent
until `ticket.ranked` — was MEASURED rather than weighed: the dual-client rig compares whole
`TicketState`s with `toEqual`, so a reducer that omits forces the server read to omit too, and an omitting
server read puts an absent key on the single-ticket wire for every unranked ticket, which `mapRank` would
have to tolerate — exactly the shape case 13.603's second `it` forbids. **The mutation is what turns that
argument into evidence:** making `rowToTicketState` omit the key when the column is NULL (`rank: row.rank`
→ `...(row.rank === null ? {} : { rank: row.rank })`) reddened **13 rig cases across all four dual-client
files** (`grant-backfill` 2, `rig` 2, `scenarios` 6, `socket-cut` 3), every one of them
`expected { …(14) } to deeply equal { …(15) }` — a one-key shape mismatch, which is what "the two producers
must agree" looks like when it is broken. The same mutation reddened 13.702's presence pin. Spec §8.1
states the same answer in the domain's words ("`null` = never ranked") and the plan's Global Constraints
state the rule ("every producer sets them"); the rig is why the rule is safe to follow.

- ✅ **13.702 — `proj_tickets.rank` exists, starts NULL for a ticket nobody has ranked, and takes the key a
  `ticket.ranked` carries; `rowToTicketState` reads it into `TicketState.rank`; the migration's Down drops
  the column and leaves its neighbour standing.** The column is one field with one meaning, so unlike the
  `closed` pair above it there is no fold and nothing that could disagree with anything. Both halves of the
  write are pinned, and by the SAME assertions: dropping `rank` from the INSERT's column list and dropping
  `rank = EXCLUDED.rank` from the ON CONFLICT SET list redden identically — `expected null to be 'i'` at
  the first ranking and at the `rowToTicketState` read — **because `ticket.created` already inserted the
  row, so even the first `ticket.ranked` travels the `ON CONFLICT … DO UPDATE` path.** This bullet said
  the opposite when first written ("reddens only on the SECOND", the re-rank), and an **independent
  reviewer measured it false**; the re-rank assertion it pointed at is never reached under the mutation.
  The re-rank block stays as a behavioural assertion (a second `ticket.ranked` on the same ticket is not
  ignored) with its marginal coverage explicitly undemonstrated, not as a witness for the write's halves. The read is
  asserted with `toBeNull()` and NOT `?? null`: `?? null` passes on an absent field, and PRESENCE-AND-NULL
  is the property the rig needs. The Down half is a case for a migration that nothing else exercises — the
  Up runs in every test on this machine, the Down runs nowhere, and a rename in one half would otherwise
  never be noticed. It takes its own database, asks the runner for the migration **by the name the runner
  itself recorded in `pgmigrations`** rather than a guessed convention, and asserts a neighbour column
  (`closed_at`) survives — with a positive control that the migration HAD run, so "the column is gone" is
  not vacuously true of a table that never had it. `apps/server/migrations/1789200000000_proj-tickets-rank.sql`,
  `apps/server/src/projections/tickets.ts:169`, `:245`, `:274`,
  `apps/server/test/projections/tickets-rank.test.ts:98`

- ✅ **13.703 — the same wire key reaches the client on BOTH bodies it is served on: `mapListPage` →
  `mapListRow` and `mapTicketRead` → `mapTicketState`; `null` survives as never-ranked; and a key outside
  the alphabet is REFUSED naming `.rank` rather than passed through.** This is the Global Constraint's case
  and its docblock says so: *"every new wire field is carried end to end in ONE task — server assembler →
  JSON → `mappers.ts` — with a mapper test"*, written after the core plan's final review found the closed
  flag dead in production while every view test drove a fake. **Both routes, because both exist and both
  were enumerated by hand** — which is how 13.603's blocker happened, one route's consumers green against a
  fake while the other route's field was missing for a task. The two halves are independently pinned
  (measured: removing the `mapListRow` call reddened both assertions; removing the `mapTicketState` call
  reddened only `expected undefined to be 'n'`). The predicate is `isRankKey`, **not the `RANK_KEY_REGEX`
  the plan's Interfaces line names**, and the deviation is load-bearing: the regex admits `'a0'`, whose
  ordering `rankBetween` cannot express (it appends `'0'` forever), so a client-side predicate looser than
  the door's would admit into the Backlog tab's sort a key the domain refuses to place. Mutation 5 —
  `isRankKey(raw)` → `typeof raw === 'string'` — reddened exactly this case and nothing else.
  `packages/app-core/src/online/mappers.ts:1278`, `:1357`, `:1536`,
  `packages/app-core/test/online/mappers.test.ts:1399`, `:1434`

- ✅ **13.704 — the replica's list row carries the folded rank: `null` before a ranking, the key after
  it, on the SAME row.** The fold itself is 13.696's; what this case measures is the read door the Backlog
  tab actually uses, that `getTickets` reads `state.rank` rather than a constant, and that the boundary read
  is `?? null` so an absent field on a hand-built fixture cannot become a different claim. `null` and a key
  are not interchangeable here: `compareByRank` separates ranked rows from unranked ones by exactly this,
  so the assertion is `toBe('i')` and not "some string was present".
  `packages/app-core/src/replica/replica-data-source.ts:786`,
  `packages/app-core/test/replica/replica-data-source.test.ts:1051`

**Amendment to 13.696 (Task 3) — a TIGHTENING, not a new id, and it is written as prose rather than as a
bullet because `scripts/check-case-ids.mjs` reads line HEADS and a re-minted bullet is a duplicate (it caught
this exact mistake here on the first run: `13.696: …:8117, …:8371`).** A created ticket's `rank` is now
asserted present-and-`null`, not merely "reads as null". Task 1 wrote the assertion as `rank ?? null` on
purpose, and its comment said why: with creation not writing the field, `toBeNull` would have pinned the very
PRESENCE that broke the reducer/server boundary, and a reader could not tell absent from null. Task 3 makes
presence the contract, so the assertion becomes `toBeNull()` — which fails on `undefined` — and the case now
pins the decision instead of tolerating either reading.
`packages/domain/src/ticket-state.ts:176`, `packages/domain/test/ticket-state.test.ts:661`

**Plan-text corrections found while executing this task.** (1) The plan's Step 1 asks for *"the migration's
Down drops the column (the core's `1789100000000` test shape)"* — **no such test shape exists**; the closed
migration's Down is exercised nowhere in this repo (`grep` over `apps/server/test` finds no down-migration
test at all). The shape was written from scratch here rather than cited, and the plan sentence should not be
read as evidence that the older migration is covered. (2) The plan's Interfaces line names `RANK_KEY_REGEX`
for `mapRank`; `isRankKey` is used instead, for the reason above — this is the second time in this plan that
a text-level "use the loose predicate" instruction was overtaken by the domain's own tighter one.

## The workflow builder, fitted to the backend that exists (executor 2, 2026-09-18) — block `13.767`–`13.775`

The owner's instruction for `isBuilder` was *"workflow-builder is there for design reference only. if the
backend is already built, then make the design just fit for it."* That is a constraint in two halves, and
the first was a measurement: **the backend is built.** The builder is `WorkflowBuilderScreen`
(`packages/app-core/src/workflow-builder/ui/workflow-builder-screen.tsx:52`) at
`/w/[workspaceId]/settings/workflows/[workflowId]`, ten plan-08 tasks deep, with a live validator, a
publish path and its own role gate. What was NOT built is the design: `workflow-builder-screen*`,
`state-inspector*`, `inspector-panel*` and `transition-inspector*` shipped with **zero CSS** — every
element under all four rendering with user-agent defaults. Measured with a control, because "unstyled" is
a claim about an instrument: the same sweep returns 7 rules for `.issues-panel`, 11 for
`.publish-controls`, 15 for `.gn-state-node` and 40 for `.ticket-type-editor`.

The second half is a refusal that was already recorded before this task:
`docs/hig-reconciliation-audit.md:691-718` rules `SystemRulesPanel` and the whole rule-authoring
subsystem — neither of which the prototype draws at all — as *"EXISTS AND THE PROTOTYPE OMITS IT. Keep
and restyle; never delete"*, closing at `:718` with *"Both must be treated as requirements to preserve,
not redesign away."* So the prototype's two-column layout is not adopted; three rails, preserving the
left column. **The closing quote sits at `:718`, outside the `690-712` range this entry first cited** —
corrected here, and the range widened rather than the quote moved, because a range that does not contain
its own quotation is the thing a reader stops trusting.

- ✅ **13.767 — the builder screen's four BEM families and the rules that style them are one fact spelled
  in two packages, and nothing else ties the spellings.** The instrument is `saved-filters`' —
  harvest the classes the stylesheet names and the classes the component renders, and compare the SETS —
  applied across the `ui`/`app-core` boundary, where a rename on one side is invisible to both packages'
  own gates and the failure it produces is the quiet kind: a screen that renders, and is unstyled. Six
  arms are rendered into one union (loading, loaded, load-refused, and the inspector's no-selection,
  state and transition selections), because a fixture that rendered only the loaded screen would leave
  `__loading` and `__load-error` styled and unrendered, and the tempting repair is to weaken the equality
  to a subset. **The exemption is a RULE, not a list:** `.workflow-builder-screen__add-state` carries no
  rule of its own and should not — it sits on the shared `<Button>` — so an element is exempt exactly
  when it ALSO carries a class from the shared component layer, and a separate case pins that the
  exemption is exactly that one class, so it cannot grow by accident.
  (`packages/app-core/test/workflow-builder/builder-css-binding.test.tsx:230`, `:277`)

- ✅ **13.768 — the new block names no colour of its own and adds no role.** Every `var(--gn-*)` the block
  references must already be referenced elsewhere in `ui.css`, harvested by SELECTOR rather than by
  slicing from an offset to EOF (the positional read `saved-filters-css-binding.test.tsx` had to replace,
  because a block that happens to be last works until the next task appends CSS after it). Eleven
  distinct roles, all pre-existing: `surface-raised`/`shadow-raised`/`radius-card` are `.gn-card`'s three,
  `fill-tertiary`/`text-accent` are `.gn-button`'s, `surface-sunken`/`shadow-sunken`/`fill-quaternary`/
  `border` are `.gn-field__input`'s. `packages/ui/test/token-discipline.test.ts` refuses a hex anywhere
  in client source; this case refuses the other half — a role invented for one screen.
  (`packages/app-core/test/workflow-builder/builder-css-binding.test.tsx:328`)

- ✅ **13.769 — the prototype's unbacked controls are absent, and the real ones keep their homes.** The
  header's `wfStatus` line ("Draft · last saved 11:58") is asserted absent because it has no backing
  state — `wfStatus`, `lastSaved` and `last saved` are 0 hits repo-wide — with the control that the
  header really mounted and carries the two actions that ARE real. **The `Cancel` button's warrant is
  NOT that measurement, and the first version of this entry wrongly said it was:** the prototype's
  `isBuilder` block draws no Cancel at all (`:1013-1093` is breadcrumb, h1, `wfStatus`, Add state,
  Publish); the Cancel this inherited comes from `docs/hig-reconciliation-audit.md:705`, describing a
  header the drawing does not show. The assertion stays — it is a useful control that the header mounted
  — but it is recorded as refusing something the reference itself does not have, rather than as a
  backed-out claim. The
  inspector's consolidated card — Category select, "Blocks the ticket" toggle, "Initial state" switch —
  is the shape `hig-reconciliation-audit.md:703-708` already ruled *"SHOWN BUT DOES NOT EXIST. Do not
  build"*, and the case's second half is what makes the first half mean something: the same two controls
  are still rendered **by the canvas node**, one Category picker per state, so the absence is a
  placement refusal and not a deletion.
  (`packages/app-core/test/workflow-builder/builder-css-binding.test.tsx:392`)

- ✅ **13.770 — the workflow name is the title, and stays a control.** The prototype draws an `h1`
  (`desktop.dc.html@6d7b67c0a52c:1016`); the product's name is editable, so the design fit is the
  prototype's TYPOGRAPHY on an `<input>` rather than an `h1` beside it — the name is already on screen
  inside the field the person edits, so a heading would print the same words twice in one header. **The
  reason recorded here was FALSE once and the correction is kept visible:** it first said a duplicate
  heading "would make `getByText(name)` ambiguous for every later test", and the reviewer refuted it with
  a probe — `getByText` matches text CONTENT, and an input's `value` is not text content, so `<h1>X</h1>`
  beside `<input value="X">` matches exactly one node. **The heading gap is real and PRE-EXISTING** (the
  base page had no `<h1>` either), recorded with an owner rather than fixed inside a design port. The
  four metrics are asserted **against `.gn-page-title`'s own declarations**, read from
  `apps/web/app/globals.css:127`, not restated from the prototype: that rule already carries the
  `34px/41px/700/-0.4px` conversion, including the `-0.0118em` its docblock derives from -0.4px ÷ 34px,
  and a second reading of the same four numbers is how two titles drift apart. The field BOUNDARY is
  kept (`gn-field__input`'s fill/border/radius and the same `neo` override) because a control that looks
  exactly like static text is not editable-looking — a deliberate deviation from the drawing, flagged in
  the PR body.
  (`packages/app-core/test/workflow-builder/builder-css-binding.test.tsx:443`, `:460`)

- ✅ **13.771 — the declarations, which the name equality cannot see.** This case exists because the
  equality above was **measured failing to catch a real deletion**: renaming
  `.workflow-builder-screen__canvas` to `…__canvasRenamed` — which removes the card treatment and leaves
  the class rendering unstyled — left every test in the file GREEN. A name-only equality cannot
  distinguish "the rule is there" from "the name is mentioned somewhere", so the table names one
  load-bearing declaration per rule — every rule in the block, after the first version sampled fourteen
  and left `__load-error`, `__rules` and the two inspector titles unpinned. **THE MECHANISM RECORDED
  HERE WAS WRONG, AND THE CORRECTION IS THE POINT.** It first said the survival was because the
  `@media (max-width: 64rem)` rule still names `__canvas` in `{ order: -1 }`. It was not: the harvest
  regex was `[a-z][a-z0-9_-]*`, which **stops at the first uppercase letter**, so `…__canvasRenamed`
  matched only as far as `…__canvas` and the OLD name kept entering the set from the renamed rule
  itself. The two are distinguishable — all-lowercase `…__canvasrenamed` reddens the equality, the
  mixed-case rename reddens only the table — and both are now planted measurements. The regexes carry
  `[A-Za-z]` as a result.
  (`packages/app-core/test/workflow-builder/builder-css-binding.test.tsx:363`, `:100`)

- ✅ **13.774 — the inspector's name field carries the shared `gn-field` classes it claims to inherit.**
  A cross-prefix blind spot the equality is structurally unable to see: `.gn-field__input` belongs to the
  shared layer, outside every prefix that case harvests. Measured by the reviewer: deleting
  `className="gn-field__input"` from `state-inspector.tsx:53` survived all thirteen cases **and the whole
  app-core package (1473 passing)** while silently reverting the field to a bare `<input>` with
  user-agent defaults — the exact defect this change exists to fix — against a docblock claiming it
  "'inherits the measured contrast pair and the `[data-style=\"neo\"]` sunken override for free". Read off
  the rendered DOM, not grepped from source, because a source read passes against the class sitting on
  the wrong element.
  (`packages/app-core/test/workflow-builder/builder-css-binding.test.tsx:470`)

- ✅ **13.775 — the inspectors' actions are the shared `Button`, danger-styled where they destroy.**
  Same structural blindness: `.gn-button`/`.gn-button--danger` are outside every harvested prefix, so the
  four controls that moved off bare `<button>`s could revert to user-agent defaults with every other test
  in the repo green. Asserted by counting: two buttons in the state inspector, exactly one of them
  `--danger` and it is the one whose text is `Delete state`; two danger buttons in the transition
  inspector (`Remove rule`, `Delete transition`). Precedent for the variant is `fields-editor.tsx:64`.
  (`packages/app-core/test/workflow-builder/builder-css-binding.test.tsx:497`)

- ✅ **13.772 — the breadcrumb is on every arm of the builder route.** Not an addition to the design: it
  is the element `apps/web/app/settings/page.tsx:94-96` already names as the reason the builder is the
  only settings sub-screen NOT inlined into that shell — *"it carries its own breadcrumb back ('Settings ›
  Workflows') instead"*. That sentence was true of the prototype and false of the product until this
  change. It renders ABOVE the load states, not inside them, which is why all four arms are asserted
  rather than the loaded one alone: "the way back" is exactly what a person needs when the read failed.
  The loaded arm mounts the React Flow canvas under jsdom, which `apps/web`'s setup cannot do —
  `ReferenceError: ResizeObserver is not defined` inside React Flow's own `<ZoomPane>`, measured, which
  unmounts the root so the container comes back EMPTY rather than reporting anything. Shimmed LOCALLY in
  this one file rather than in `apps/web/test/setup.ts`, so no other suite's jsdom changes and app-core's
  measured 170-line block is not duplicated.
  (`apps/web/test/builder-route.test.tsx:170`, `:203`)

- ✅ **13.773 — the crumb is one link to the list, not two.** The prototype makes the whole crumb a single
  `goWorkflows` target (`:1015`); rendering "Settings" and "Workflows" as two links would be a design
  invented here, since both would land in the same place. The count is pinned, the href is asserted
  against the real list route, and `aria-current` is asserted ABSENT because the crumb points at the
  list and this page is the builder — with the control that the screen really mounted, so "one anchor"
  cannot be satisfied by a page that rendered nothing.
  (`apps/web/test/builder-route.test.tsx:222`, `:234`)

**Recorded, not fixed, each with a named owner.** (1) **Four more families are still at zero CSS inside
the very rail this change styled** — `add-rule-menu*`, `restrict-to-editor*`, `require-field-editor*`,
`require-different-user-editor*` — proven in the DOM, plus `template-gallery*` on the sibling
`/workflows/new` route. The prototype draws no rule-authoring UI at all (`Add rule`/`Remove rule`/
`Restrict` = 0 hits), so there is no drawn design to fit them to; the audit's own `isBuilder` row named
three families, not seven. **Owner: whoever next touches the rule editors** — the audit's *"keep and
restyle"* (`:694`) is the warrant, and without it the rail still changes shape by selection one level
down, which is the argument that justified styling both inspectors in the first place. (2)
**`.advisories-panel__title` sets `color: var(--gn-warning)` on its `--gn-surface-sunken` tray,
measuring 3.711 under `hig`/`minimal` light** — below the 4.5 that text owes, and *worse than the
4.401 `danger`-as-text this change refused to add a sixth instance of* (`ui.css:1303`, pre-existing, six
rules ship `--gn-warning` as text). The refusal stands; the neighbourhood is not clean, and saying so is
the point.

**Mutation evidence, and the two that did not count.** The name equality was mutation-tested rather than
assumed: renaming the base `__canvas` and `__layout` rules, deleting the `__name:focus-visible` rule,
removing the `neo` override and planting a hex literal in the block all redden — the last one against
`packages/ui`'s own token-discipline suite. The route assertions were tested the same way: deleting the
crumb, splitting it into two links, and pointing its href at the wrong route all redden. **Two mutations
were run and correctly did NOT redden, and the distinction matters** — rewording the link text to the
`&rsaquo;` ENTITY, and a first attempt aimed at `Settings › Workflows` that hit the docblock's copy of
the string instead of the JSX, both leave the rendered output identical. A survivor with no explanation
is either an unconstrained path or a mutation that never ran, and these were the second; re-aimed as a
genuine text change, the same assertion reddens.

**The review round found three survivors this change's own tests could not see, and all three now die.**
Independently of the above: deleting `gn-field__input` from the inspector's input (→ 13.774); planting
`var(--gn-ink-2)` inside the block, because the role sweep `var\((--gn-[a-z-]+)\)` is **digit-blind** and
no shipped role contains a digit, so the hole was exactly one a future role would fall through (→ the
class now carries `[a-z0-9-]`); and the mixed-case rename above, whose recorded cause was wrong (→ the
`[A-Za-z]` harvest). Instrument fixes are the highest-value kind here because they are invisible until
someone aims at the exact shape they cannot see.

**Recount, at this tip.** Nine ids are minted here (`13.767`–`13.775`), all inside the reserved block
`13.760`–`13.819`; **the next free id inside this executor's block is `13.776`**. Measured by case MARKER
only, never by substring: the highest `13.*` marker in this file at this tip is `13.775`, and the highest
`13.*` id anywhere in `packages/` + `apps/` is `13.775`. The whole block `13.767`–`13.819` was measured
FREE before minting — the only hits were prose *mentions* of the block's own bounds, which is exactly the
trap this file records: a substring sweep over a document that discusses the ids cannot separate a
MINTED id from a MENTIONED one.

**Task 4 (`Table`/`TicketList` row drag and the tail drop zone) — `13.705`–`13.706`.** Ids recounted at this
tip (branch `exec/second-wave-t4-rowdrag`, cut from `origin/main` `fb346a9f`) over case MARKERS and test
NAMES only, never a substring sweep: the highest case MARKER minted inside this executor's block
(`13.700`–`13.759`) is **`13.704`** (Task 3's third), and `13.705`–`13.759` are minted by nobody —
`/usr/bin/git grep -nE '13\.70[56]' fb346a9f` returns **no hits at all**, against a positive control of the
same command shape over `13\.70[0-4]` (**13 files** — recounted by the reviewer and re-measured here after
this block's first draft said 14; the count is `git grep -l | wc -l`, and the miscount was mine, not a
measurement's) and a null-control over the three lines that mention the
block as a RANGE in prose (`:8241`, `:8313`, `:8427` — the controller's allocation sentence, not a minted
id). **The plan's own ids `13.621`/`13.621a` were NOT used**: the dispatch records them as taken, and the
letter-suffixed half is invisible to `check-case-citations.mjs` by its own Global Constraint note, so the
pair becomes two plain ids the citation script can see. The file's overall high-water mark is `13.766`, which
is executor 2's parallel block (`13.760`–`13.819`) and collides with nothing here. `13.697`–`13.699` remain
unallocated; this task did not touch them.

**The task's whole surface is a wire that crosses a package boundary, and one measurement is why the plan's
own mutation target could not be trusted as written.** The plan's Step 5 asks for `preventDefault()` to be
dropped from `dragover` and expects "the drop case in 13.621" to fail, "exactly as a browser does". **It does
not, and that was measured rather than assumed.** A real browser fires a `drop` only over a target whose
`dragover` cancelled the event; jsdom does not model that, and `fireEvent.drop` dispatches unconditionally.
Run directly: with `event.preventDefault()` deleted from `onDragOver`, **every `fireEvent`-driven case in
13.705 stayed GREEN** (mutation M1 survived). The plan anticipated exactly this and named the fallback — so
the drop read was mutated instead (**M2**, `getData(DRAG_TICKET_FORMAT)` → `''`, which reddens both drop
cases), and the cancelled-event property is pinned separately, at the DISPATCH level, by reading
`defaultPrevented` off a real `Event` with a control that the same dispatch against a list with no `rowDrag`
is NOT cancelled. With that case added, **M1 dies** (re-run: exit 1). This is the same class the series keeps
recording: a check that cannot fail for the property it names is worse than no check, because it reads as
coverage.

**The mutation battery — eight, each restored by `cp` and verified by sha256, each verified to have CHANGED
the file before its result was read.** M1 `onDragOver` loses `preventDefault()` → **killed** by the
dispatch-level case (survived the `fireEvent` cases, as above). M2 the drop reads no ticket id → killed.
M3 the self-drop guard (`moved === id`) is removed → killed. M4 the tail zone renders regardless of `rowDrag`
→ killed. M5 `onReorder`'s arguments are swapped → killed. M6 `Table` REPLACES `className` instead of
appending it → killed. M7 `Table` drops the per-row spread → killed. M8 the dragged row never gets
`gn-list__row--dragging` → **SURVIVED on the first run, and the survivor was the finding**: 13.705 pinned
`--drop-before` but never `--dragging`, so the marker the component paints on the SOURCE had no witness at
all. Two cases were added (the source is marked and only the source; an ABANDONED drag clears both markers on
`dragend`, the one path no handler of ours runs for), after which **M8, M8b (`--drop-before` never applied)
and M8c (`dragend` does not clear) all die**. Per the standing rule, a survivor is evidence about the TEST
before it is evidence about the code, and this one was.

**The cross-package resolution trap fired on the first GREEN run.** `app-core` imports `Table` as
`'@gisik-nokma/ui'`, which resolves through `packages/ui/dist`, so a correct implementation still failed
13.705 until `packages/ui` was rebuilt — the ui package's own suite, which imports `../src/components/table.js`
by relative path, had already gone green. Recorded because the asymmetry is the documented one: the
relative-path suite is the one that catches the change, and the by-package-name suite is the one that tests
a stale `dist`.

- ✅ **13.705 — with `rowDrag` every row drags and reports the row it landed on as the before-neighbour; the
  tail zone means "last"; a drop on itself and a payload with no ticket id are both refused; and without
  `rowDrag` nothing is draggable and no tail zone renders.** Rendered by `TicketList`, the drag mechanism is
  four React props on each `<tr>` — the registry's absence is asserted rather than described: 13.534 recorded
  the flake a passive `useEffect`-registered attempt map produced on the Board, and these handlers are
  attached during the render that draws the row. The two controls are the point of the negative arm: the SAME
  query that finds `draggable="true"` and `.gn-list__tail-drop` on a wired list finds neither on an unwired
  one, and the gesture that calls back once on a wired list calls back never on an unwired one. The
  `dataTransfer` stand-in answers only the format that was actually `setData`-populated, so the case can fail
  for a format mismatch instead of papering over one, and one instance is passed to every event of a gesture
  because a real browser hands the identical object to each. `preventDefault()` on `dragover` is pinned at
  the dispatch level for the reason above.
  `packages/app-core/src/views/ticket-list.tsx:189`, `:339`, `:384`, `:715`, `:745`,
  `packages/app-core/test/views/ticket-list.test.tsx:1668`

- ✅ **13.706 — `Table` spreads a row's own attributes onto its `<tr>` and APPENDS the caller's `className`
  to the built-ins rather than replacing them.** `rowClassName` (Ruling 21) can say only one class for every
  row, and the List's drag needs a fact about a ROW, so `rowProps?: (row) => HTMLAttributes<HTMLTableRowElement>`
  is spread after the built-ins; `className` is the one key the built-ins keep, joined in the same
  `[own, extra].filter(Boolean).join(' ')` shape `card.tsx:7` established and Ruling 21 applied to this
  component's other three hooks. **Both halves are asserted because either alone passes against a hook that
  is half-wrong**: presence kills the "replaced, not appended" mutant (M6), and the ORDER assertion — the
  caller's class is last — is what makes "appended" a claim this case can fail on rather than a synonym for
  "present". The control renders the same table with no `rowProps` and asserts no caller attribute appears,
  while `rowClassName` still applies.
  `packages/ui/src/components/table.tsx:75`, `:111`, `:123`,
  `packages/ui/test/components.test.tsx:180`

**The maximal fixture in 13.671's CSS-binding equality check had to grow, and it reddened first.** That case
asserts, in both directions, that every class the List renders is a class `ui.css` styles and that no rule
styles a class nothing renders. Adding three classes that only exist while a caller wired `rowDrag` — two of
them only MID-GESTURE — left them styled and unrendered, which is precisely the defect the second direction
exists to catch, so it failed and was right to. The fix is a fourth, DRIVEN render in `renderEverything()`
(`dragstart` on the first row, `dragover` on the last, so the two markers land on two different rows and a
component painting the wrong one would not pass a class-union scan) rather than a subtraction from the
equality. `packages/app-core/test/views/ticket-list-css-binding.test.tsx:239`, `:289`

**Task 5 (the Backlog tab's rank order, drag reorder, Move up / Move down) — `13.707`–`13.710`.** Ids
recounted at this tip (branch `exec/second-wave-t5-backlog-rank`, cut from `origin/main` `488bfb2d`) two
independent ways: over case MARKERS in this file using the same `ID_LINE` regex `scripts/check-case-ids.mjs`
sweeps with — never a substring sweep — and over `13.*` ids anywhere in `packages/` + `apps/`. Both agree.
The highest id minted inside this executor's block (`13.700`–`13.759`) is **`13.706`** (Task 4's), and
`13.707`–`13.710` appear **nowhere**: `grep -rnE '13\.70[7-9]|13\.710'` over `packages/`, `apps/` and
`test-cases/` returns no hits at all, against a positive control of the same command shape over
`13\.70[0-6]`, which finds them in both the catalogue and the code, and a null control over `13\.999`
(absent from code, and documented at `:8699` as a truncation trap). **`13.711` and `13.712` were then minted by the owner-ruled fix** (option B, below), recounted the same
two ways at that tip — the only hits for either id were the earlier prose sentences of this very block
saying they were free, which is the mentioned-versus-minted trap this file records — so **`13.713`–
`13.759` remain unminted** and executor 2's parallel block (`13.760`–`13.819`) is untouched.

**UPDATE 2026-09-18 (Task 6): `13.713`–`13.717` are now MINTED, and the trap fired again on the way
in.** A plain substring sweep for the next free id reported `13.713` as PRESENT and it had to be
discounted: the only hit was this file's own sentence above, which *mentions* `13.713` as free without
minting it. A MARKER-ONLY recount — the `ID_LINE` regex `scripts/check-case-ids.mjs` itself uses, over
`packages/` + `apps/` + `test-cases/` — put the block's high-water at `13.712` (Task 5's) and returned
`false` for `13.713`, with `13.711`/`13.712` present as the positive control. **`13.718`–`13.759`
remain unminted**; executor 2's `13.760`–`13.819` is still untouched. The plan's
own ids `13.622`–`13.625` were **NOT** used — the dispatch records them as taken.

**The first RED for the pure module was NOT an assertion failure, and that is recorded rather than
smoothed.** `packages/app-core/src/views/backlog-rank.ts` did not exist when
`test/views/backlog-rank.test.ts` was written, so the first run failed on module resolution. That is a
weaker signal than a test failing on its own assertion, because it cannot distinguish a case that pins a
property from one that would pass against anything — so the falsifiability of this file rests on M1 below,
run after the module existed, not on the RED. The web half's RED was the stronger kind: the six new cases
failed inside a rendered page for a concrete reason (`Unable to find an accessible element with the role
"button" and name "Move First up"`), while the four pre-existing cases in the same file stayed green.

**The mutation battery — two, each restored by `cp` and verified by sha256, each verified to have CHANGED
the file before its result was read.** M1 `neighboursFor` returns the swapped pair `{ before: after,
after: before }` (the plan's own target) → **killed**, 6 of 19 cases red. M2 `submitRank` ingests
`before ?? 'i'` instead of the computed key (also the plan's own target) → **killed**, 3 of 10 red — **and
those three are the one-line proof the dispatch asked for: both 13.709 drag cases fail alongside 13.708's
between assertion, which is only possible because the drag and the two buttons compute their keys through
the same `submitRank`.** A second, independently-computed neighbour for the drag would have kept 13.709
green while 13.708 alone went red.

**Three defects were introduced by this task's own edits and caught before the commit — two by a gate, one
by reading.** A JSX comment written as `{/* … */}` is **not valid in a JSX opening tag's ATTRIBUTE list**:
esbuild parses the brace as a spread attribute and refuses (`Expected "..." but found "}"`), which is why
every comment in that position in `page.tsx` is bare `/* … */`. And `apps/web`'s `typecheck` caught two
errors `vitest run` structurally cannot see, because vitest transpiles without type-checking: an import of
`DRAG_TICKET_FORMAT` that the test never used (it is not on the app-core barrel — that package's own suite
imports it by relative path), and a deferred resolver held in `let answer: ((… ) => void) | null = null`,
which TypeScript narrows to `null` at the call site because the only assignment happens inside a callback
the checker cannot see (`answer?.()` reports *Type 'never' has no call signatures*). The resolver is now a
one-slot array, which is not narrowed that way. **A green `vitest run` is not evidence of type-correctness,
and this is the second task running where that gap was where the defect lived.**

**The cross-package `dist` rule fired in its documented direction.** `apps/web` imports `sortByRank` from
`@gisik-nokma/app-core` by package name, so it resolves through `packages/app-core/dist`, while the app-core
suite imports `../../src/views/backlog-rank.js` by relative path — the suite that catches a change is the
relative-path one, and the by-package-name one tests a stale `dist`. `pnpm --filter @gisik-nokma/domain
--filter @gisik-nokma/app-core build` ran BEFORE any suite was trusted.

- ✅ **13.707 — the three pure rank helpers: order, the `rankBetween` neighbour pair, and where a Move up /
  Move down button points.** Twenty cases, and every assertion is about ORDER or ABOUT WHICH ROW'S KEY,
  never about a key's spelling — because `rankBetween` only refuses an *inverted* pair (`before >= after`),
  so a pair that is merely off by one row produces a perfectly valid key in the wrong place and the tab
  renders it happily. `sortByRank`'s cases separate "sorts by rank" from "sorts by id" with a fixture whose
  ranks and ids run in OPPOSITE orders (`z`/`'g'` before `a`/`'n'`), so a helper that ignored `rank`
  entirely cannot pass. `neighboursFor` pins the rule the plan asked to be written down — when the row is
  placed last and the last row is UNRANKED, `before` is the last **ranked** row's key, because an unranked
  row has no key to sit after; reading `.rank` off the immediately preceding row answers `null`, and
  `rankBetween(null, null)` is the midpoint, so the row lands wherever the midpoint sorts rather than
  where the pointer was. **The moved row is excluded from its own neighbour search, and the case that pins
  it is the SECOND one, not the first** — an independent review measured that the first fixture cannot
  tell: there, the last ranked row among the others and the last ranked row overall are the same row, so
  deleting the filter leaves the answer identical and the suite fully green. The kill lives on a two-row
  fixture where the moved row IS the last ranked one (`{before:'g'}` correct, `{before:'n'}` — the row's
  own key — without the filter). An unknown id is a non-crash. `moveTarget` pins the boundary BETWEEN
  its two edge cases at a two-row list, and that `down` points two rows below rather than one — pointing at
  the row directly below is a NO-OP that would spend a server round trip to move nothing.
  `packages/app-core/src/views/backlog-rank.ts:82`, `:120`, `:151`,
  `packages/app-core/test/views/backlog-rank.test.ts:31`, `:75`, `:155`

- ✅ **13.708 — the Backlog tab draws rows in rank order, `Move down` ingests exactly one `ticket.ranked`
  whose key is strictly BETWEEN its neighbours, the row moves before the server answers, and a refusal
  snaps the order back with the reason shown.** Three cases, each naming the other two's failure as its
  control. The order case feeds the stub the rows in the REVERSE of the answer, so a tab that rendered
  `rows` as they arrived draws exactly backwards. The between-assertion is two comparisons on the CAPTURED
  PAYLOAD (`rank > 'n'` and `rank < 't'`) and never a literal, because a literal would pass on any
  plausible spelling — including one that sorts the row somewhere else entirely — and M2 proves the
  assertion is load-bearing. The optimistic half holds the ingest OPEN on purpose: a stub that resolved
  immediately would let the reload land first and make "the row moved optimistically" indistinguishable
  from "the row moved". The refusal case asserts the optimistic position FIRST and then the snap-back, so a
  component that never moved at all cannot satisfy it, and it asserts the Ruling-27 sentence shape
  (`Refused by the server — <rule>: <reason>`) rather than merely that something was rendered.
  `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:850`, `:351`,
  `apps/web/src/backlog-rank-controls.tsx:115`, `apps/web/test/backlog-tab.test.tsx:334`

- ✅ **13.709 — a drag of the last row onto the first ingests a key BELOW the first row's, and a drop on
  the tail zone ingests a key ABOVE the last ranked row's.** Asserted with `<`/`>` on the captured payload,
  never a literal key. These two cases are the drag half of the plan's one-path requirement: M2 reddens
  both of them together with 13.708's between assertion, which is what makes "the drag and the buttons
  share `submitRank`" a measurement rather than a claim about the source. The gesture is driven through the
  same `dataTransfer` stand-in Task 4's suite uses (`ticket-list.test.tsx:1622`), copied rather than
  re-invented so both suites exercise the component through an identical transfer shape; and because the
  tail drop is genuinely a DIFFERENT target from a row drop, the two cases cannot both pass by way of one
  handler.
  `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:870`, `:2181`,
  `apps/web/src/backlog-rank-controls.tsx:115`, `apps/web/test/backlog-tab.test.tsx:571`

- ✅ **13.710 — only the top row's `Move up` and the bottom row's `Move down` are disabled.** The two
  disabled assertions plus four enabled ones, and the enabled half is the point: `Move Second down` must
  stay ENABLED even though there is no row two below it, because that button means "place last" — a
  component that disabled the button whenever `index + 2` ran past the end would pass the two disabled
  lines and silently strand the second-to-last row, which is the exact off-by-one `moveTarget`'s docblock
  exists to prevent.
  `packages/app-core/src/views/backlog-rank.ts:151`, `apps/web/src/backlog-rank-controls.tsx:236`,
  `apps/web/test/backlog-tab.test.tsx:642`

- ✅ **13.711 — `planRankMove`: rank the rows that have no key FIRST, in their drawn order, then apply the
  move (owner ruling 2026-09-18, option B).** Six cases, every one written as an OUTCOME — apply the plan
  the way `submitRank` does and read the order that results — rather than as an assertion about keys,
  because the keys were never the point: the defect was a perfectly valid key drawn in the wrong place.
  The first case is the **CONTROL in the same run**: `neighboursFor(FRESH, 't4', null)` answering
  `{before:null, after:null}`, which is the defect asserted rather than described, so the fix is a fact
  about a measurable difference. The two `PLANTED DEFECT` cases are the two shapes — a tail drop in a fresh
  backlog drawing `t1 t2 t3 t4` (it drew `t4 t1 t2 t3`), and a `Move down` that steps over an unranked row
  drawing `A C B` (it drew `A C B` unchanged, having spent an ingest). The remaining three pin the
  properties the fix rests on: the backfill keys **ascend in drawn order and all sit above the last
  existing key** (the reason the visible order is untouched by the backfill itself), **no row is backfilled
  when every other row already has a key** — which is what keeps the ordinary move a SINGLE event and
  13.708–13.710 green — and the **moved row is not backfilled**, which would both waste an event and feed
  the move's own neighbour search a key for the row being moved.
  `packages/app-core/src/views/backlog-rank.ts:214`, `packages/app-core/test/views/backlog-rank.test.ts:212`

- ✅ **13.712 — the two broken behaviours now behave, and a PARTIAL batch is reported rather than hidden.**
  Three cases in the web suite. The first is the fresh-backlog tail drop: four unranked rows, the last
  dragged to the tail, **four `ticket.ranked` events** (three backfill in drawn order, then the move)
  whose keys are asserted by COMPARISON and never by literal, and the row drawn LAST — checked
  **optimistically, with the ingest held open**, because the moved row's own key is not enough: without
  the backfilled rows' optimistic keys the moved row would be the only ranked row on screen and would draw
  ABOVE the rows it was dragged past, which is the very defect reintroduced on the client. The second is
  the step-over: `Move Second down` on `[First('g'), Second('n'), Third(null)]` now ingests the backfill
  first and the move second, and the final order is asserted against the reload's rows, **which the stub
  derives from the keys that were actually sent** — a fixture returning its original rows would leave that
  assertion satisfied by the surviving override, a weaker claim than it reads as. The third is the cost the
  owner accepted: a batch whose first event commits and whose rest do not reports `partial` on the
  transport channel (part of it committed, so it is not a verdict), **reloads so the tab shows the
  server's own state**, and says so in a sentence naming how many parts landed.
  `apps/web/src/backlog-rank-controls.tsx:115`, `:158`, `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:870`,
  `apps/web/test/backlog-tab.test.tsx:681`

**The review round found FOUR MUTANTS THAT SURVIVED THE WHOLE SUITE, and all four now die. Three of the
four survived because the fixtures were tidy** — supplied in the order the assertion wanted, with a rank on
every row — which is the generalisable half of this record: **a fixture that agrees with the answer cannot
distinguish an implementation from a coincidence.**

- **M8, dropping the moved-row exclusion from `neighboursFor`, passed both suites (19/19 and 10/10)** and
  the case claiming to kill it could not (the first fixture's last-ranked-among-the-others and
  last-ranked-overall are the same row). Replaced by a two-row fixture where the moved row IS the last
  ranked one: correct `{before:'g'}`, mutant `{before:'n'}`. **Now killed.**
- **M3, clearing the optimistic override on the `committed` path as well as the failures, passed the whole
  web suite.** That is the "two moves for one gesture" flicker `page.tsx` argues the `if (!committed)` flag
  prevents. The new case holds the RELOAD open and asserts the optimistic position is still drawn while the
  server's own rows contradict it. **Now killed.**
- **M4, emptying the clear-on-answer effect's deps to `[]`, passed the whole web suite** — an override free
  to outlive its answer and show a position the server never agreed to. Pinned by the same case, which
  resolves the reload with a CONTRADICTING rank and asserts the tab follows the server. **Now killed.**
- **M5, handing the handlers the server's arrival order instead of the drawn order, passed the whole web
  suite** — because in every other fixture rank order and arrival order coincide. Pinned by a fixture whose
  arrival order is the REVERSE of rank order. **Now killed.**
  M5's survival is its own lesson: **when two candidate implementations both satisfy a case, the case is
  not pinning the one you named.**

**Three Minor findings were fixed in the same change set**: `rank()`'s docblock claimed a re-check its body
did not perform (it forwarded `up ?? null`, turning the edge's `undefined` into "place last"); the drag's
notice wore `gn-refusal--server` for transport failures and silence, which `ui.css:1363` states the rule
against; and `rankNotice` was cleared by nothing, surviving reloads and tab switches. **One Minor is
recorded, not fixed — and MEASURED here after the reviewer offered it only as its least-certain claim:**
`DEFAULT_GROUPING` is `'epic'`, not `'flat'` (`packages/app-core/src/view-types.ts:519`), so with backlog
rows under more than one epic the tab draws them grouped while the handlers compute from the rank order —
rank order `A('e1') B('e2') C('e1')` draws `A C B` under `epic` and `A B C` under `flat`, so A's drawn
neighbour is C while its rank neighbour is B. Invisible to every case in `backlog-tab.test.tsx` only
because each fixture's rows carry `epicId: null` and fall in one section. **Not fixed here**: like the
unranked-tail defect it is a product decision (render the Backlog tab flat, or have the handlers read the
section's rows), and it is priced alongside that one.

**The unranked tail: a defect found by review, HELD rather than shipped, and fixed under an owner ruling.**
In a backlog where NOTHING is ranked — the default state of every project, since `rank` starts `NULL`
(13.702) — "place last" moved the row to the **TOP**. Measured against the built module: with
`[t1,t2,t3,t4]` all unranked, dragging `t4` to the tail computed `{before:null, after:null}` →
`rankBetween` = `'i'` → and because `compareByRank` sorts EVERY ranked row above EVERY unranked one, the
drawn order became **`t4 t1 t2 t3`**. The same root cause made an enabled `Move down` a no-op
(`[A('g'),B('n'),C(null)]`, `Move B down` → key `'q'` → order unchanged `A B C`). **This was the plan's §8
rule implemented faithfully** — the plan says `before` is "the last RANKED row's key", and with no ranked
row that is `null` — so it was recorded with a named owner and priced three ways rather than repaired by
guess, and **the PR was held** on the controller's instruction that a short hold is cheaper than shipping
it and correcting it in a second PR. The owner then ruled **option B**, and it is fixed in this change
set: see 13.711 and 13.712. The docblock's claim that a missing ranked neighbour was harmless ("after the
last row and after the last key are the same position") was **false** and is corrected in the source.

**Two plan-text deviations, both named rather than silently taken.** (1) The plan puts the tail zone "after
the table" and cites `ticket-list.tsx`'s `ListTable` mount; it is rendered ONCE in `TicketList`, after the
sections, because a grouped list mounts one `ListTable` per SECTION and a zone per section would put N drop
targets on screen each claiming a part is the whole, when a drop on any of them means the same order — and
because `rowDrag` is `undefined` for every surface that does not reorder, the single zone is the whole of the
change for them. (2) The plan's `13.621a` letter-suffixed id was not minted; see the id note above. Neither
deviation changes an assertion.

**Fix round (2026-09-18) — an independent review found two Important defects the battery above could not see,
plus four Minor. Both Important were REPRODUCED here before being acted on, and both fixes are themselves
mutation-verified.**

**Important 1 — a foreign drag was NOT refused; any non-empty `text/plain` was forwarded as a ticket id.**
`ticket-list.tsx` gated the drop on `moved === ''`, and the comment above it asserted the false premise that
"a gesture that began outside this list carries no id". **It does.** `DRAG_TICKET_FORMAT` is plain
`'text/plain'` — deliberately, so no allowlist has to be maintained — which is the UNIVERSAL drag format: a
link, a text selection or a file dragged in from another application arrives NON-EMPTY and is not a ticket
id. Measured: dropping `'https://example.com/some-link'` on a row called
`onReorder('https://example.com/some-link', 'rd_a')`. The Board reads the same format and is safe only
because it then looks the value up in a registry that answers `undefined` for a stranger; this component has
no registry, so the equivalent check is membership in the set of rows it is showing (`draggableIds`), and it
now applies at BOTH targets. **The 13.705 battery could not have caught this**: its `dataTransfer` stand-in,
faithful to a browser, answers `''` only for a format nothing populated, so it is structurally incapable of
producing the payload — the test named the property "a payload carrying no ticket id" while only ever
exercising an EMPTY one, which is a different property. The new case drives both a foreign URL and a
synthetic non-member id, with a positive control that one of the list's OWN ids still gets through. M9 and
M10 (the membership check dropped from the row drop, and from the tail drop) both die on that case.

**Important 2 — the drop marker went stale over the tail zone.** The tail `<div>` is a SIBLING of the
sections, not an ancestor of any `<tr>`, so a browser stops firing `dragover` on whichever row the pointer
came from the moment it crosses in; nothing cleared it, so that row kept `gn-list__row--drop-before` while
the pointer sat on the target that means LAST — the user reads "insert before the last row", releases, and
gets "place last", off by one, on the one affordance whose whole job is to say where the row will land.
Reproduced (`dragstart` on a row, `dragover` on another, `dragover` on the tail — the first row still
carried the marker) and fixed by clearing it in the tail's own `dragover`. M11 dies on the tail case. The
`ui.css` paragraph that claimed the tail "takes the accent only while the gesture is over it" was FALSE — no
rule did that — and is corrected to say what actually signals the target: the ROW marker going out.

**Minor 1 — an assertion that could not fail.** The `no rowDrag` arm called
`expect(onReorder).not.toHaveBeenCalled()` against a spy that was never placed in the tree, because that
render passes no `rowDrag`. Deleted, with the reason written where it stood: the meaningful assertions there
are `not.toHaveAttribute('draggable')` and the null tail zone, and a vacuous assertion reads as coverage of
exactly the property those two measure.

**Minor 2 — a pinned row paints `--dragging` on both its copies** (the marker is keyed on `ticketId`, and a
row assigned to the viewer deliberately renders twice — once pinned, once in its section). Cosmetic and
data-safe: both copies carry the same id and the self-drop guard refuses one onto the other. **Follow-on,
owner: the first task that renders the drag on a surface where a row can legitimately appear twice** — the
double-render is already accepted for `rowAction`, so this may be intended, and it is recorded rather than
guessed at.

**Minor 3 — prose corrected, three places.** The `ui.css` citation to `.gn-refusal--*` used PRE-insertion
line numbers (`:1176`) — now cited by SELECTOR, because a line number that is right in one revision is a
false citation in the next, **and this entry proved its own point twice over**: that fix first replaced the
numbers with a fresh set (`:1203`/`:1204`/`:1209`, correct for `d28d609b`), and the fix round's own further
edits to `ui.css` moved the rules again. A reviewer caught the second staleness, which is why the sentence
you are reading names no line number at all. The
`--gn-fill-quaternary` sentence described the zebra token as though the new rule painted it; the rule is
`opacity` alone and names no colour, so the sentence now says that. The control's file count was 13, not 14.

**Minor 4 — documented rather than guarded.** `Table.rowProps` spreads after `onClick`, so a caller's
`onClick` would replace `onRowClick` rather than compose with it. No caller does this (`Table` has exactly
one production consumer and it passes neither), so the docblock now states it instead of leaving it to be
discovered; a guard would be a second decision point with nothing to decide.

**Follow-on named by this fix round, not fixed: the tail zone has no drag-over state of its own.** What tells
a user they are over it is the row marker going out. Styling the target itself is a fourth class, which the
approved plan does not name — and a lit edge beside a still-lit "insert here" line was the worse of the two
readings. Owner: the task that first reports the affordance as unclear.

**Scoped re-review of the fix round (2026-09-18) — both Important fixes upheld, one Minor and one
observation worth carrying.**

**The most valuable finding of the whole task is that MY OWN MUTATION KILL WAS CONTINGENT.** This file's
fix-round block above claims M9/M10 die on the foreign-drag case. The re-review showed that kill was
contingent on a literal: `DRAG_TICKET_FORMAT` appeared in `ticket-list.test.tsx` **only inside comments** —
the case hand-typed `'text/plain'`, the same value, so it passed. The reviewer ran a **paired experiment**,
and it was reproduced here before the fix:

| | change | exit | result |
|---|---|---|---|
| C | M9 alone, original format | **1** | killed on the FOREIGN case — a real kill |
| A | `DRAG_TICKET_FORMAT` changed, code intact | **0** | the whole file is GREEN — it is format-agnostic once nothing agrees on the literal |
| B | format changed **+** the membership check removed at both targets | **0** | **M9 SURVIVES** |

**B is the finding.** With the constant drifted, the foreign payload reaches `getData` under a format the
component no longer reads, comes back `''`, and is refused by the EMPTY clause instead — so the case stayed
green while no longer testing the property in its name. The kill was real only because two hand-typed copies
of `'text/plain'` happened to agree. **Fixed by importing the constant** (the test's own docblock at 13.705
had asserted "imported, never re-spelled" and was FALSE — the sentence was written ahead of the code it
described, which is this file's oldest recurring mistake). Re-verified after the fix: the drift experiment
now leaves both the case and the mutant honest, because the test and the component read one value.

**Finding 2 (Minor) — a sentence arguing against line numbers carried a stale line number.** The fix round
replaced a stale `:1176` citation with `:1203`/`:1204`/`:1209`, correct for `d28d609b`; the fix round's own
further edits then moved the rules again. Now cited by selector, with no number for a reader to chase.

**Observation — a mutant with NO browser-visible effect reads as a kill here, and the kill count therefore
overstates browser-observable coverage.** Deleting `setDraggingId(null)`/`setDropBeforeId(null)` from the
**row** `onDrop` reddens 13.705's first case — yet in a browser it is behaviourally nil, because `dragend`
always fires on the source after a drop and the component's own `onDragEnd` does byte-identical clearing.
The suite proves that redundancy itself: the "ABANDONED drag clears both markers on `dragend`" case passes.
The cause is that no case in this file fires `dragEnd` after a `drop`, so the post-drop marker state is
pinned where a browser supplies it for free. **Not a defect in the code** (clearing on drop is deliberate:
the component does not depend on a second event arriving), but it means this file's kill COUNT and its
COVERAGE are not the same number. Recorded rather than papered over.

**Two further things the re-review confirmed rather than merely accepted.** `rows` is the correct membership
set — `sections` and `pinned` both derive from it, so rendered ids ⊆ `set(rows)` always, and a stale `rows`
mid-reload refuses only rows that genuinely left the list, which is the conservative direction. And the
choice of fix for the stale tail marker is the TESTABLE one: a container `dragleave` would have to be guarded
against firing on every child boundary *and* is unverifiable in this harness, because jsdom never synthesises
`dragenter`/`dragleave` from pointer movement — whereas the tail's `onDragOver` clear is driven by the same
`fireEvent.dragOver` the cases already use.

## The `required` field flag, ported from the prototype (executor 2, 2026-09-18) — block `13.776`–`13.784`

The `isTypeEditor` row of the delta audit (`docs/design/prototype-delta-2026-09-18.md:69`) recorded
`ticket-type-editor-screen.tsx` as **port**, *blocked* on one thing: the prototype draws a per-field
`Required` / `Optional` pill (`desktop.dc.html:904` in the template, `:3207-3208` for its label and
style) and the field schema had no such member. That is a gap in the data model, not in the drawing, so
it needed a ruling rather than an implementation — the owner gave one on 2026-09-18 (decision-list item
1: *"1 - yes"*), and this block is the port that ruling authorised.

**What this block can and cannot witness, stated first because it decides every case below.** The
product does not yet READ the flag: no code path refuses a ticket that omits a field marked required.
The engine's only `require-field` is EDGE-SCOPED — a workflow rule evaluated when a ticket crosses one
transition (`packages/rule-engine/src/rules/require-field.ts:5`, surfaced by
`packages/app-core/src/views/transition-dialog.tsx:216`), which answers *may this move happen?* and not
*does this type expect a value?*. `checkTicketFieldSet` refuses a field that does not exist on the type
and a value that does not fit its kind, and accepts a clear of any custom field unconditionally
(`packages/rule-engine/src/checks/fields.ts:148-155`); `ticket.created` reads no fields at all. So
**no case here asserts a refusal, and none pretends to.** Enforcement is a capability rather than a
wiring job, and the reason is structural rather than budgetary: a type definition is last-writer-wins
with no superseded row kept (`apps/server/src/projections/ticket-types.ts:39-46`, which states that
omission as deliberate), so the engine cannot answer *what did this type require when this ticket was
created?* — and an admin toggling a field to Required would place every existing ticket of that type out
of compliance with no way to retroactively refuse a claim already recorded. **Named absence, owner: the
plan that takes up type-level field enforcement.** It is recorded in `Features.md` in the same commit as
the code, and in the PR body.

What the cases DO pin is the part that is this change: the flag survives a definition being authored,
saved, parsed, projected and carried back to the client, and it never appears as a value nobody chose.

**The three states are distinct, and each of the first three cases is one of them**, which is the whole
point of the schema member being optional rather than `z.boolean().default(false)`: never-said (13.776),
said-required (13.777), said-optional (13.778). A defaulted schema collapses the first into the third,
and 13.776's assertion would then pass for the wrong reason — so 13.782 is the schema-level witness of
the same distinction and 13.776's control is one case down.

- ✅ **13.776 — a field nobody has decided about carries NO `required` key, and its toggle reads
  "Optional".** Absence is not a claim: the recorded definition must not say `false` on the author's
  behalf, which is the same defect class as the `p.value ?? null` that folded an absent value into "a
  clearing nobody made" (`packages/rule-engine/src/checks/fields.ts:77-83`, corrected earlier in this
  series). Asserted as key ABSENCE rather than as a falsy value — `toEqual` would pass on `undefined`
  while the key existed — with its positive control one case down.
  (`packages/app-core/test/ticket-types/ticket-types.test.tsx:456`)

- ✅ **13.777 — pressing the toggle writes an explicit `true`, flips the label to "Required", and the
  flag reaches the submitted `ticket-type.defined` payload.** The assertion runs the submitted payload
  back through `ticketTypeDefSchema.parse` rather than reading the object the editor built, because a
  zod object STRIPS a member it does not declare: without the schema change the editor would still have
  rendered "Required" while the recorded definition said nothing, and a surface-only test would have
  been green through exactly that. **This case is what the schema member being load-bearing means.**
  (`packages/app-core/test/ticket-types/ticket-types.test.tsx:482`, mutation-killed by removing
  `required` from `customFieldDefSchema` — `expected undefined to be true`)

- ✅ **13.778 — pressing twice records an explicit `false`.** Never-said and said-optional are
  different recorded states, and preserving that difference is why the schema member is `.optional()`
  and not `.default(false)`. The toggle writes `field.required !== true`, so an untouched field reads
  false only because nothing has been claimed and the first press always writes `true`.
  (`packages/app-core/test/ticket-types/ticket-types.test.tsx:505`)

- ✅ **13.779 — the toggle is disabled for a non-author, like every other control in the row.** The
  toggle is a WRITE, so it takes the gate the name input and `Remove field` take (owner decision
  2026-08-26).
  (`packages/app-core/test/ticket-types/ticket-types.test.tsx:526`)

- ✅ **13.780 — the toggle is a real `.gn-button`, and its two states are the shared `primary`/`ghost`
  variants rather than a private colour of its own.** The colour half is the point: `ui.css`'s
  `.fields-editor__required` is SIZING ONLY, so both states resolve through variant classes and both
  grounds are pairs the contrast audit already carries. The prototype's tinted pill is **not** ported —
  its `--tintAccent` wash has no product role (`tokens.ts:342-344`: `tintWarning` is the only tint
  role), which is the same refusal `isBuilder` recorded for `--tintDanger`/`--tintSuccess`. A `--on`
  rule restating `--gn-accent` would have passed the two `toHaveClass('gn-button')` assertions and
  failed this one. **Second deviation, also stated:** the prototype's pill is 32px, this sits at
  `.gn-button`'s own 2.75rem, matching the name input and the Remove button it stands beside.
  (`packages/app-core/test/ticket-types/ticket-types.test.tsx:547`, `packages/ui/src/ui.css`)

- ✅ **13.781 — `required: true` survives `customFieldDefSchema.parse`.** The schema-level witness that
  the member is declared rather than stripped. Every parse site in the product routes through this
  schema — the projection, the offline replica and the engine's memory context alike
  (`apps/server/src/projections/ticket-types.ts:56`, `packages/sync-client/src/replica/replica.ts:295`,
  `packages/rule-engine/src/memory-context.ts:136`) — so a strip here would have been silent in
  production while the editor still showed the state. (`packages/domain/test/ticket-types.test.ts:38`)

- ✅ **13.782 — a field that never decided carries NO `required` key after a parse.** The no-migration
  witness AND the never-said witness at once: every `ticket-type.defined` recorded before 2026-09-18
  has no such key, so a defaulted member would make all of them come back claiming `required: false`.
  Asserted as key absence, and 13.781 is its positive control — the key does appear when authored.
  (`packages/domain/test/ticket-types.test.ts:61`, mutation-killed by switching the member to
  `.default(false)` — `expected true to be false`)

- ✅ **13.783 — a non-boolean `required` is refused rather than coerced.**
  (`packages/domain/test/ticket-types.test.ts:79`)

- ✅ **13.784 — a field's `required` flag crosses the route and reaches the client definition, and a
  field that never set it crosses as ABSENT.** The dispatch for this flag named the risk it exists to
  close: the core plan's final review found a flag dead in production while every view test drove a
  fake data source, and `mapTicketTypes` is exactly where such a flag would go to die — it validates
  `fields` as far as ARRAY and casts the rest, so a member the server sends and the mapper does not
  carry vanishes with nothing red anywhere. The case drives the REAL mapper through the REAL data
  source over a recording fetch, not a hand-built object handed to the mapper and not a fake source,
  either of which would test the assertion rather than the route. The fixture is deliberately ONE
  decided field and ONE never-decided: an assertion on the first alone would pass for a mapper that
  defaulted every field to required. **Mutation-killed by making `mapTicketTypes` drop the member —
  `expected { id: 'amount', … } to match object`, which is the silent-drop this case exists for.**
  (`packages/app-core/test/online/online-data-source.test.ts:677`)

**One case was adjusted rather than added, and the adjustment is recorded because widening an
enumeration is how a check goes quiet.** `packages/app-core/test/workflow-builder/access.test.tsx:567`
asserts that every button a MEMBER is offered on the ticket-type editor is an icon choice or a gated
Field-type control, and that every one of them is disabled — a gate-coming-down check. The new toggle is
a **twentieth** button on that screen (16 icon choices — `Object.keys(TYPE_ICONS)`,
`ticket-types/icons.tsx:102`, counted by measurement and NOT by eye, because `'file-text'` is a QUOTED
key a naive key-sweep misses — plus 2 Field-type Select triggers plus the 2 toggles), so the predicate
had to name it or the suite would have reddened for the right reason and been "fixed" the wrong way.
*(An earlier draft of this paragraph said "a ninth button". That figure was invented and matched no
count reproducible from the fixture; the independent review caught it. The reviewer's own first count of
the icon set was 15, wrong for the quoted-key reason — the same instrument-blindness shape this file
catalogues, caught by the party who wrote it.)* **It is a value control on the DEFINITION — the same
taxonomy that admits the Field-type trigger and the icon choices — not a collection action like
`Remove field`**, which is why showing it disabled is correct rather than hiding it: a member reading a
type still learns which of its fields are required. The widening was proved not to have opened a hole by
mutation: rendering `Remove field` for a member again **still** reddens the predicate
(`access.test.tsx:610-615`, `expected false to be true`, reported at `:615`), and dropping the toggle's
`disabled` reddens the per-button assertion beneath it.

- ✅ **13.785 — a field's `required` flag survives a real Postgres round trip, and a field that never
  decided crosses as ABSENT.** The strongest available witness for the failure mode the dispatch for
  this flag named — *the core plan's final review once found a flag dead in PRODUCTION while every view
  test drove a fake data source* — and the reason it is not redundant with 13.784 above. The
  client-side cases run against a recording fetch or a fake gateway; **this one writes through the real
  projector into a real `jsonb` column and reads back through the real reader**, which is the only
  place the column's own round-tripping is exercised at all. `fields` is `jsonb`, so the `toEqual`
  assertion is also what says the member arrives as a boolean rather than a string — the property the
  case above it pins for a select field's `options`. The fixture is deliberately ONE decided field and
  ONE never-decided, because an assertion on the first alone would pass for a projection that defaulted
  every field to required; the second is asserted as key ABSENCE, not falsiness.
  (`apps/server/test/proj-ticket-types.test.ts:124`)

- ✅ **13.786 — the `required` flag survives the INGEST DOOR.** The first and most consequential parse
  site, and the one an earlier draft of this change's own docblock got wrong by listing only the three
  READ sites. `parseEvent` stores the schema's **output**, not the raw payload
  (`packages/domain/src/parse-event.ts:177`, `payload: payload.data`), so a member `ticketTypeDefSchema`
  does not declare is stripped **before the event is ever recorded** — every later reader then sees an
  event that never carried it, and no amount of care at the projection, the replica or the memory
  context can recover a key that never reached the ledger. The witness is the EXISTING
  `roundTrips('ticket-type.defined', …)` call, which asserts `result.event.payload).toEqual(payload)`:
  a stripped member reddens there rather than three hops downstream. Its fixture carries two fields
  deliberately, one claiming `required: true` and one never-decided, so the `toEqual` cannot pass for a
  door that defaulted every field. **Mutation-killed by removing the schema member — the door's own
  `toEqual` reddens.** Raised by the independent review of 2026-09-18, which measured that the three
  parse sites this change originally named are all reads and named the door as the case worth spending;
  it was added at near-zero cost because the assertion already existed.
  (`packages/domain/test/ticket-events.test.ts:59`)

**The independent review round (2026-09-18): no Critical, no Important, six Minor — and four of the six
were defects in THIS CHANGE'S OWN documentation rather than in its code.** Recorded because the pattern
is the one this repo keeps paying for: an instrument or a sentence that is wrong in a direction nobody
audits.

1. **A fabricated figure.** "The new toggle is a ninth button on that screen" matched no reproducible
   count. The real figure is **twenty** (16 icon choices + 2 Field-type triggers + 2 toggles), and the
   review's own first count of the icon set was 15 because `'file-text'` is a QUOTED key a naive key-sweep
   cannot see — the instrument-blindness shape this file catalogues elsewhere, self-caught by the party
   who wrote it. The figure is corrected in both places it appeared; this paragraph is the record.
2. **A wrong CAUSE attached to a right verdict.** The widened access predicate's comment said the toggle
   was "already covered by the sweep above". Measured false — `valueControls()` returns the same eight
   members with the toggle present as without it, because a `required` toggle is not a
   textbox/combobox/checkbox/spinbutton. The verdict (it belongs in the allowed set) stands; the stated
   reason did not, and a wrong cause is how a real hole gets read as covered later. Corrected in place.
3. **A vacuity hole one field wide.** 13.784's absence half was `'required' in (fields[1] ?? {})`, which
   answers `false` for a response TRUNCATED to one field — the `?? {}` hands it a fresh empty object. A
   `toHaveLength(2)` guard now precedes it, **mutation-proved** by shrinking the fixture (reddens:
   `expected [ { id: 'amount', … } ] to have a length of 2 but got 1`).
4. **An incomplete list that led with the wrong site.** The schema docblock named the projection, the
   replica and the memory context as the parses a strip would hit — all three are READS. The door is
   `parseEvent`, and it came first. Corrected in the docblock; 13.786 is the resulting witness.

The remaining two were: the new `ui.css` rule `flex: none` is pinned by no test (true, and now stated
outright in that rule's own docblock rather than implied away — its `.fields-editor__add`/`__row`
siblings are in the same position, so it is not a regression, and 13.780 now pins that the component
applies the class at all), and the note that no server-side case witnessed the door — which 13.786 now
does. **Seven mutations were killed before the review; two more were added for the review's findings
(the truncated fixture, the removed layout class), and the door mutation makes ten.**

**Recount, at this tip.** Eleven ids are minted here (`13.776`–`13.786`), all inside the reserved block
`13.760`–`13.819`; **the next free id inside this executor's block is `13.787`**. Measured by case MARKER
only: the highest `13.*` marker in this file at this tip was `13.775` before this section, and the
block's own upper bound `13.819` appears only as prose *mentioning* it — the trap this file records
twice above.

## The bulk-close dialog, and the Dialog dismiss's own name (executor 2, 2026-09-18) — block `13.640`–`13.643`

**Second-wave Task 9**, reassigned to executor 2 on 2026-09-18 while executor 1 was mid-Task-5. These four
ids are the PLAN's, not this executor's: `docs/superpowers/plans/2026-09-17-backlog-and-closed-second-wave.md`
reserves `13.613`–`13.649` for its twelve tasks and names `13.640`–`13.643` in this task's own step text,
so the ids come from the reservation rather than from the `13.760`–`13.819` block this executor was given
for its other work. Verified free before minting with the sanctioned recount
(`git grep -hoE '13\.[0-9]{3}' -- docs/superpowers/plans test-cases | sort -u | tail`) — `13.640`–`13.643`
appear in the plans and nowhere as a catalogue marker — which is the same collision the note at the head
of this file records for `13.613`–`13.616`/`13.650`–`13.653`, caught this time by reading the reservation
BEFORE minting rather than after.

- ✅ **13.640 — confirming ingests ONE batch of three `ticket.closed` in the listed order.** Spec §8.3's
  third bullet binds two halves at once — one event PER TICKET, and no server-side bulk endpoint — and only
  the batch satisfies both: one event per ticket keeps the ledger honest (an auto-closed ticket and a
  bulk-closed one are the same row), while one CALL is the door's own shape. A loop of N single-element
  calls passes every other assertion in this file and fails this one, which is why the case asserts
  `source.ingested` has length **1** rather than that three events exist somewhere. The ORDER assertion is
  not decoration either: results are read by index, so a batch built from a different iteration would
  submit three correct events and misreport every one of the moment a single ticket is refused. The batch
  is also asserted envelope-by-envelope — `payload: {}` on all three (the envelope alone carries actor and
  time, spec §1.2), `entity` kind/id in the listed order, `workspaceId`, `actorId` and `origin: 'web'`.
  `packages/app-core/test/views/bulk-close-dialog.test.tsx:105`, `packages/app-core/src/views/bulk-close-dialog.tsx:182`

- ✅ **13.641 — a refused second ticket is listed under `Could not close`; the rest are reported closed.**
  The verdict is per ticket, so the two that committed are reported and the refused one is NOT: a dialog
  that reported all three because the call returned would be the "the call succeeded, therefore the work
  happened" defect. The case asserts `onClosed(['a', 'c'])` exactly once, that the dialog is STILL OPEN,
  that the heading and the `<title> — <reason>` row are on screen, and that **the confirm control is GONE
  rather than disabled at zero** — the plan offered both readings and told the implementer to pick the
  former, which is the one asserted. It also asserts `onClose` was never called, which is what makes
  "stays open" a measurement rather than a property of the harness: under an implementation that closed
  itself on confirmation, this task's whole failure list would be unmounted before anyone could read it.
  `packages/app-core/test/views/bulk-close-dialog.test.tsx:154`, `packages/app-core/src/views/bulk-close-dialog.tsx:229`

- ✅ **13.642 — a rejected ingest shows the transport notice, reports nothing closed, re-enables confirm.**
  A rejected promise is not a refusal (Ruling 27/34): the notice wears `.gn-refusal--transport` and this
  client's own sentence with the cause's message, `onClosed` is never called, and the latch resets so the
  person can try again with the whole list intact. **The silence branch is witnessed beside it**, in the
  same file and by the same case's own Interfaces sentence: a results array SHORTER than the batch it
  answers reads as silence — `The server did not answer this close.`, nothing reported closed, all three
  still pending — because index alignment is the only thing that makes the answers meaningful, so a short
  array cannot be read as "the first one committed". A third `it` covers the `invalid` envelope, whose
  reason is the error's `message` rather than a rule's `reason`, plus Cancel closing without a second
  submit. `packages/app-core/test/views/bulk-close-dialog.test.tsx:198`, `:223`, `:399`,
  `packages/app-core/src/views/bulk-close-dialog.tsx:201`, `:233`

- ✅ **13.643 — the `Dialog` dismiss control's accessible name is `Close dialog`.** R4 of this task. The
  control's visible text is `×`, so its accessible name is whatever `aria-label` says and nothing in a
  screenshot or a `getByText` can tell the two spellings apart — which is how the collision survived until
  a feature put a plain "Close" button in a dialog's body (spec §5.3's ticket-sheet Close). The case pins
  the new spelling AND makes the unscoped `getByRole('button', { name: 'Close' })` inside such a dialog
  find exactly one element: that second assertion is the one that FAILED under the old label (testing-
  library threw "found multiple elements"), so it is the assertion that catches the defect rather than one
  that merely describes the fix. `packages/ui/test/components.test.tsx:102`,
  `packages/ui/src/components/dialog.tsx:51`

- ✅ **13.787 — an answer arriving after a dismissal never lands on the NEXT opening.** Minted in the
  review round (block `13.760`–`13.819`, the first id drawn there since `13.786`), and it is the only
  defect this change has that no test could see: every earlier case resolves its promise while the dialog
  is still open. Cancel, Escape, the scrim and `×` all stay live during a submit — deliberately, since a
  person must be able to walk away from a slow call — so the window is the whole round trip, and the
  plan's own consumer mounts the dialog once and toggles `open` (Task 10: "renders `BulkCloseDialog`
  once"), meaning the instance survives the dismissal. The in-flight closure then writes into an opening
  it knows nothing about: a phantom `Could not close` carrying the PREVIOUS batch's refusal, and an
  `onClosed(['a','c'])` for tickets nobody just asked to close — which, for a parent that dismisses in
  `onClosed`, dismisses the new dialog before it is ever used. The case drives exactly that (a deferred
  first ingest, rerendered closed then reopened for a different pair, then resolved) and asserts the new
  opening is untouched. **A fresh mount does not cover this**, which is why the fix is an attempt token
  and not a mount discipline: unmounting stops `setState` landing on the dead instance, but the stale
  closure still holds the OLD `onClosed` prop and calls it, and an ungated `setSubmitting(false)` would
  release a LIVE attempt's latch. It was RED before the fix — `expected "spy" to not be called at all,
  but actually been called 1 times` with `['a','c']` — and the token mutation (`attemptRef.current += 1`
  → `+= 0`) reddens this case and nothing else in the file.
  `packages/app-core/test/views/bulk-close-dialog.test.tsx:305`, `packages/app-core/src/views/bulk-close-dialog.tsx:200`

- ✅ **13.788 — when every ticket is refused, nothing is reported closed and all are listed.** The
  complement of 13.641, and it exists because the decision it pins was UNWITNESSED: an independent review
  made `onClosed` fire unconditionally and all seven cases stayed green, since no case had reached an
  all-refused outcome — 13.641 always leaves something committed and its confirm is gone afterwards, so
  nothing could press it again. Asserted: `onClosed` NOT called, all three titles listed under
  `Could not close`, and the confirm control gone under 13.641's own rule.
  `packages/app-core/test/views/bulk-close-dialog.test.tsx:373`,
  `packages/app-core/src/views/bulk-close-dialog.tsx:229`

#### The review round — one Critical, two unwitnessed decisions, four wrong causes

One reviewer, over commit `ef6da16b`, attacking the three load-bearing points specifically. It could not
falsify the ONE-call assertion or the R4 blast radius (both re-run), found one reproduced defect and two
surviving mutations, and closed the trail on several of this change's own sentences.

1. **The Critical — a dismissed attempt's answer applied to the next opening.** Reproduced by the reviewer
   as two failing probes before it was believed; now the shipped fix, with 13.787 as its witness. The
   docblock's own mitigation was **inverted**: it named "the two consumers close and reopen it" as the
   reason the case needed no guard, when close-and-reopen is the TRIGGER. Corrected in place.
2. **Two mutations survived the first suite.** Deleting the `undefined`/holed half of the silence guard,
   and making `onClosed` fire unconditionally, both left 7/7 green — with controls in the same invocation
   confirming the sites were live. Both are now witnessed (the holed arm inside the silence case, and
   13.788 for the all-refused outcome), and both mutations now redden their own witness.
3. **A stale `Close`/`Close dialog` cause, twice.** `dialog.tsx`'s comment and this file's R4 paragraph
   both said spec §5.3's ticket-sheet Close was the first collision with `Dialog`'s dismiss. Measured
   false: `TicketSheet` renders `Sheet`, not `Dialog` (`ticket-sheet.tsx:429`), and Ruling 31 fixed that
   collision by renaming **`Sheet`'s** dismiss to `Close sheet` on 2026-09-17. The plan's own rationale is
   inexact too — a `Close N tickets` confirm cannot collide with a dismiss named `Close`, because
   testing-library's `name:` is an exact-string match. The rename ships (it is R4) with the honest reason:
   preventive, plus consistency with `Sheet`. A right verdict with a wrong cause is how a real hole gets
   read as covered later.
4. **`Ruling 13.532` cited as a ruling.** `13.532` is a CASE id, and the mechanism it pins is a fresh
   mount (`board.tsx:1081-895`), not an effect keyed on `open` — and the substitution is not equivalent,
   which is finding 1's root cause. Corrected to cite the case and to say what the mechanism can and
   cannot do.

**Recorded, not fixed (out of scope, named owners):** (a) a results array of the right LENGTH whose
entries are the wrong tickets' answers is undetectable, since nothing compares `result.eventId` to
`batch[index].id` — the core's own reader has the same limitation (`flows/guarded-child-event.ts:294-296`),
so this is a server-contract assumption rather than a local bug, and it belongs with that one; owner:
whoever next touches the ingest contract. (b) An `OfflineAcceptError` from the replica source (thrown
AFTER every event is enqueued, `replica-data-source.ts:1220`) renders as a transport failure and invites
a retry that queues N more — `board.tsx`'s `closeCard` and `ticket-sheet.tsx`'s `closeOrReopen` have the
identical gap, and the sentence is the plan's, so it belongs in the plan/task that owns offline accept
wording rather than in this commit; owner: the offline-accept follow-on. (c) The stale comment at
`packages/app-core/test/views/ticket-sheet.test.tsx:821`; owner: whoever next opens that file.


#### The R4 blast radius was MEASURED, not grepped

The plan told this task to grep for every suite a shared accessible-name change would redden, and the
answer the grep gave was **none**. That answer was then checked against the runner rather than trusted:
the full `packages/ui` (325 passing), `packages/app-core` (1502) and `apps/web` (459) suites were run
against the change, and no suite outside `packages/ui/test/components.test.tsx` queries the Dialog dismiss
by name at all — the Dialog's own block queries Escape and the scrim, `Sheet`'s dismiss already says
`Close sheet` (`packages/ui/src/components/sheet.tsx:28`), and `ticket-sheet.test.tsx`'s `name: 'Close'`
queries are all `within(stateRow())`-scoped to that sheet's own feature button. **One stale comment
recorded, not fixed** (outside this task's scope): `packages/app-core/test/views/ticket-sheet.test.tsx:821`
states that `Sheet`'s dismiss carries `aria-label="Close"`; it says `Close sheet`, and the queries beneath
it are scoped, so nothing reddens either way. Owner: whoever next opens that file.

#### Mutation evidence (6 mutations in round 1, 4 more in round 2, each reddening its own site, all restored by sha256)

Every mutant was applied by an exact single-occurrence replacement — a replacement count other than 1 is
reported as a HARNESS FAILURE rather than a survivor — run against the owning suite, and restored from a
byte copy verified by sha256 (not `git checkout`, which ERRORS on the untracked component and would have
left a mutated tree behind).

1. **The plan's own mutation — the batch becomes N calls.** 13.640 reddens exactly as the plan predicted:
   `expected [ [ { …(9) } ], [ { …(9) } ], …(1) ] to have a length of 1 but got 3`. It also reddens 13.641,
   because the index alignment the answers depend on is destroyed with it.
2. **The batch built out of order** (`[...pending].reverse()`) → 13.640 reddens on the entity list:
   `expected [ { kind: 'ticket', id: 'c' }, …(2) ] to deeply equal [ { kind: 'ticket', id: 'a' }, …(2) ]`.
3. **The short-array guard weakened** to "all answers undefined" → the silence witness reddens with
   `Unable to find role="alert"`: two answers for three envelopes would otherwise be read as a partial
   success.
4. **Refused tickets left in the pending list** → 13.641 reddens on `expected <button …> to be null`: the
   confirm control that the plan says must be gone comes back.
5. **`onClosed` reporting every pending id instead of the committed ones** → 13.641 reddens on
   `toHaveBeenCalledWith([['a','c']])`.
6. **R4 reverted** (`aria-label="Close"`) → 13.643 reddens with `Unable to find an accessible element with
   the role "button" and name "Close dialog"`, and nothing else in that file moves.

**Round 2, after the review round — the two survivors and the new Critical.** Round 1 left two mutants
alive, which is the finding that matters most here: a surviving mutation is evidence about the TESTS, not
about the code, and both were unwitnessed decisions rather than unconstrained paths.

7. **The `undefined`/holed half of the silence guard deleted** → reddens **"a holed results array of the
   RIGHT length is silence as well"** (the witness added in round 2). Round 1: SURVIVED 7/7.
8. **`onClosed` fired unconditionally** → reddens **13.788** (added in round 2). Round 1: SURVIVED 7/7.
9. **The attempt token made inert** (`attemptRef.current += 1` → `+= 0`) → reddens **13.787 and nothing
   else in the file**, which is the fix's own site. This one was written only after the gate's first
   anchor turned out to be non-unique (it appears at two sites, in the happy path and the `catch`), and
   the harness reported `replacement count 2 (expected 1)` rather than half-applying it.
10. **Control re-run** (the plan's own: batch → N calls) → still RED, so round 2's harness is measuring.

## `Close all (N)` on a terminal board column (executor 2, 2026-09-18) — block `13.760`–`13.819`, ids `13.789`–`13.793`

**Second-wave Task 10.** Five ids drawn from this executor's own block `13.760`–`13.819`, continuing the
allocation the 2026-09-18 two-executor override set up so two writers never mint into one tip. The plan's
own step text names `13.644`–`13.646`, from its `13.613`–`13.649` reservation; those ids are NOT taken —
a marker sweep over `test-cases/` and a repo-wide sweep over `*.ts`/`*.tsx`/`*.md` both find `13.644`,
`13.645` and `13.646` **only inside the plan file itself**, never as a catalogue marker and never in a
test. The task dispatch's parenthetical "(13.644–13.646 are taken)" is therefore wrong as written and is
recorded here rather than repeated; the block allocation is what binds regardless, so the ids below are
this lane's.

Recount at the tip this block was written against: the highest catalogue marker in this file is `13.788`,
and `13.789`–`13.792` appear nowhere in the repo except this executor's own handoff prose saying they were
free. Sweep run with quoted globs — the unquoted form is silently eaten by zsh and returns a well-formed
empty answer.

- ✅ **13.789 — a terminal column holding cards shows `Close all (N)`, a non-terminal column holding a card
  shows none, and confirming ingests ONE batch and reloads.** The negative is the load-bearing half and it
  is deliberately paired with a column that HOLDS a card: `Doing` has one and still offers no action, so
  the assertion discriminates on the column's `category` rather than passing because the column was
  empty. `Close all (2)` is asserted as visible TEXT and `Close all 2 in Done` as the accessible name —
  the column is in the name because a board draws several columns at once and a duplicate page-level name
  would make the control unaddressable by role and name. The confirm asserts `source.ingested` has length
  **1** with two `ticket.closed` envelopes in the listed order, `origin: 'web'`, and `onMoved` called once:
  the one-batch assertion is the same one 13.640 makes for the dialog, made here at the SURFACE, because a
  surface that looped N single-element calls would satisfy every other assertion in this file. Then the
  dismissal: **everything committed, so the dialog LEAVES** — the board clearing its own `bulkClose` in
  `onClosed`, which is the defect the task was written to fix and which 13.792 pins from the other side.
  The last third renders the `moves`-less board and asserts no such button anywhere, after an explicit
  `cleanup()` — React Testing Library unmounts between TESTS, not within one, so a bare second `render()`
  would leave both trees mounted and the query answering about either.
  **Citations:** `packages/app-core/src/views/board.tsx:592` (the three-term gate), `:305` (the opener), `:478`
  (the single mount), `packages/app-core/test/views/board-close.test.tsx:286`.
- ✅ **13.790 — an empty terminal column shows no `Close all` button.** Spec §8.3 words the action as
  "N = cards in the column", so `Close all (0)` is not a control this surface has to offer. This case is a
  NEGATIVE and cannot fail before the button exists, which is why it is not the pair that carries the
  gate: its discriminating power is against the removal of the `cards.length > 0` term specifically, and
  the mutation that drops that single term reddens **this case and nothing else in the file**.
  **Citations:** `packages/app-core/src/views/board.tsx:592` (the `cards.length > 0` term),
  `packages/app-core/test/views/board-close.test.tsx:354`.
- ✅ **13.791 — a click on `Close all` never opens a ticket, paired with a positive control.** The action
  lives in the column `<header>`, OUTSIDE `BoardCardSlot`, so the card-click bail
  (`CARD_CLICK_BAIL_SELECTOR`) never comes into play here — the assertion is made directly rather than
  inherited from the per-card Close cases. The control is in the same test: a click on the card's own
  title button calls `onOpenTicket` once, then the clear, then the column action does not call it at all
  and the dialog opens. Without the control the negative could not tell "correctly inert" from "the
  handler is dead".
  **Citations:** `packages/app-core/test/views/board-close.test.tsx:376` (both halves in one test).
- ✅ **13.792 — a PARTIAL close reloads the board and KEEPS the dialog, with the refusal still listed.**
  **This is the case the task's own dispatch asked for and it is the reason the board's clear is
  conditional.** Spec §8.3's Board bullet is one sentence carrying both halves — *"Per-ticket refusals …
  stay listed; the rest close and the board reloads."* `onClosed` fires on a partial too (the dialog calls
  it whenever at least one ticket committed), so an unconditional `setBulkClose(null)` — which is what the
  plan's text plus the dispatch's wording produce — unmounts the dialog and destroys the `Could not close`
  rows the same sentence requires it to keep on screen. The case drives a two-ticket column where the
  second is refused: it asserts `onMoved` called once ("the rest close and the board reloads" holds on
  this outcome too), the dialog still present, `Could not close` present, `Beta — Not in a terminal state.`
  present, the committed `Alpha` no longer pending, and the confirm control gone because nothing is left to
  try. The mutation that reinstates the dispatch's literal reading reddens **this case and nothing else in
  the file**.
  **Citations:** `packages/app-core/src/views/board.tsx:346` (the conditional clear), `:478` (the one dialog
  mount), `packages/app-core/test/views/board-close.test.tsx:411`.

- ✅ **13.793 — an OPEN dialog's tickets cannot be swapped under it.** `BulkCloseDialog` states its own
  precondition in its docblock: a parent that swaps `tickets` while the dialog stays OPEN (no `open`
  transition) is *not covered by its reset*, and it declares that this "cannot arise" for its two named
  consumers. For this consumer it could. `open` is `bulkClose !== null`, so writing a second column's
  tickets into a non-null `bulkClose` is a swap with no transition, the `useEffect(…, [open])` never fires,
  and the previous opening's `closedIds`/`failures` survive against a list they do not describe. The
  concrete failure is a FULL success that does not clear — column B closes completely, but stale ids from
  column A are still subtracted from B's `pending`, so `committed.length < tickets.length` and the dialog
  stays mounted with a `Could not close` row naming the OTHER column's ticket and no confirm left to press.

  The fix refuses the swap (`board.tsx:307`), and **the two obvious alternatives were measured and
  rejected rather than merely not chosen.** A `key` on the dialog — a remount — DOES reset that stale
  state, which is exactly what makes it tempting; it is also WORSE, because the attempt token lives in
  `attemptRef` on the INSTANCE, nothing bumps a destroyed instance's token, and an answer still in flight
  then passes its own check and calls the OLD closure's `onClosed` — the precise defect 13.787 exists to
  prevent, and what the dialog's own docblock says a fresh mount cannot fix. Closing through `null` first
  does not work either: two `setState` calls in one handler batch into one render, so `bulkClose` goes
  straight from A's tickets to B's with `open` true throughout.

  **The reachability is a KEYBOARD path in a browser, not a pointer one** — `Dialog` renders a
  full-viewport scrim that blocks pointer events, and the second button is reachable only if focus escapes
  the modal (`Dialog` ships no focus trap and no portal; recorded as a named follow-on on the SHARED
  component, not repaired from here). **jsdom does not hit-test the scrim**, so an ordinary `user.click`
  in the test exercises exactly the state transition the escaped-focus path produces — which is why the
  invariant is testable in this harness at all, and the case's docblock says so rather than implying a
  pointer can do it. The case also asserts the refusal does not WEDGE the surface: dismissing and opening
  the other column afterwards behaves like any first opening.
  **Citations:** `packages/app-core/src/views/board.tsx:307` (the guard), `:305` (the opener),
  `packages/app-core/test/views/board-close.test.tsx:477`.

**Mutations run against `packages/app-core/test/views/board-close.test.tsx`, each restored from a byte copy
verified by sha256 (not `git checkout`), each guarded by a replacement count of exactly 1.**

1. **The plan's own — the button rendered regardless of category** → reddens **13.789** (the non-terminal
   negative) and 13.790. The plan predicted 13.644's negative; that id is now 13.789's.
2. **The `cards.length > 0` term dropped** → reddens **13.790 and nothing else**.
3. **`bulkClose` cleared UNCONDITIONALLY in `onClosed`** — the task dispatch's literal wording, and the
   control for this task's correction → reddens **13.792** and **13.793** (whose partial-close setup
   depends on the dialog surviving a partial, so it cannot reach its own subject without it). This is the
   mutation that proves the conditional clear is load-bearing rather than decorative, and that 13.792 is
   aimed at it.
4. **The swap guard removed** (`openBulkClose` writes unconditionally, so a second column overwrites an
   open dialog) → reddens **13.793 and nothing else**. This one exists because an independent review found
   the reachable path; the mutation confirms the guard, not the prose, is what holds the invariant.

## List row checkboxes and `Close selected (N)` (executor 2, 2026-09-18) — ids `13.647`–`13.649`, plus `13.794`–`13.795`

**Second-wave Task 11.** The plan's own step text names `13.647`–`13.649`, from its `13.613`–`13.649`
reservation. **Measured before minting, not taken from the dispatch**: this file's highest case MARKER at
that tip was `13.793`, and `13.647`/`13.648`/`13.649` were free — so they are used as the plan wrote them,
which is also what Task 9 did with the plan's `13.640`–`13.643`. (The dispatch's warning that they might
not be free was itself a correction of an earlier wrong claim about `13.644`–`13.646`; that measurement
stands — those three ids appear nowhere in this repo except the plan file. `13.644`–`13.646` remain free
and are recorded as such rather than re-used.)

The review round's own cases come from this executor's block `13.760`–`13.819`, continuing it at `13.794`.
The block exists because two executors mint ids concurrently and a *number* handed to a peer is a reading
that expires; a block is the only form that stays true.

- ✅ **13.647 — `TicketList`'s `selection` and `controls` slots, and the checkbox column's width.** With
  `selection`, every row carries a leading checkbox whose accessible name is `Select <title>` and whose
  checked state follows the caller's `selected`; toggling reports the id through `onToggle` and the box
  does **not** move, because `selection` is a CONTROLLED pair and the caller owns the set. The cell really
  is LEADING (the checkbox is the row's first `<td>`), and `<thead>`'s cell count equals every `<tbody>`
  row's — the column-count invariant that a spread-added column can break on one side only. Without
  `selection` no checkbox renders anywhere AND the table is a column narrower, so the negative is not
  passing because some other prop suppressed it. `controls` renders inside `.gn-list__controls` and AFTER
  the summary sentence — compared with `compareDocumentPosition` MASKED to `DOCUMENT_POSITION_FOLLOWING`
  and checked against that constant, never against truthiness, since `PRECEDING` is also non-zero and the
  sloppy form of this assertion is green in both directions — and absent, renders nothing.
  **Citations:** `packages/app-core/src/views/ticket-list.tsx:228` (the `selection` prop), `:250`
  (`controls`), `:482` (the slot's render), `:846` (the leading column),
  `packages/app-core/test/views/ticket-list.test.tsx:1080`

- ✅ **13.648 — `Close selected (N)`: the gate, the batch, and the clear.** Spec §8.3's own sentence —
  *"enabled only when every selected row is terminal and not closed — the cross-column case"* — with BOTH
  terms asserted against their own negative: a `Doing` row is terminal's, a closed `Done` row is
  `closed === null`'s, and the case returns to enabled afterwards so neither negative is passing because
  the control latched off. The label keeps the FULL selection count while disabled. Confirming ingests
  **ONE `ingest` call carrying TWO `ticket.closed` envelopes** in list order with the real actor — a loop
  of two single-event calls would satisfy "one event per ticket" and turn one atomic door into two — and
  `onClosed`'s reload follows, the selection is empty afterwards, and the dialog has left (a COMPLETE
  close, which is the half 13.794 shows the other side of). The read is call-count-driven, so "the list
  reloaded" is falsifiable rather than satisfied by a fixed answer.
  **Citations:** `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:788` (the selection),
  `:684` (the gate), `apps/web/test/list-bulk-close.test.tsx:165`

- ✅ **13.649 — a signed-out viewer is offered neither the checkboxes nor the control.** Its first
  assertion is the positive control, and it is the reason the case means anything: the List's rows ARE on
  screen, so the two absences are the session gate working and not a blank page. `currentUserId` is `''`
  before the session resolves and while signed out, and a `ticket.closed` built from an empty actor is
  refused by `checkRolePermission` for a reason (`env.actorId !== ctx.sessionUserId`) that names the
  person's permissions rather than the truth — case 3.144's defect, one surface over.
  **Citations:** `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2263` (the signed-in gate),
  `apps/web/test/list-bulk-close.test.tsx:282`

- ✅ **13.794 — a PARTIAL close reloads the list and KEEPS the dialog, with the refusal listed.** **This
  is the case the plan's own text gets wrong, and the correction is the whole reason the List's state is
  two pieces rather than one.** §8.3's Board bullet is one sentence carrying both halves — *"Per-ticket
  refusals … stay listed; the rest close and the board reloads"* — and the List bullet inherits it through
  "same dialog, same batch". The plan wires `onClosed` → `list.reload()` with the selection cleared on
  reload and names NEITHER a snapshot NOR an `open` expression — so it does not produce the unmount, it
  fails to forbid it. `onClosed` fires on a partial too, so under the reading that makes `open` follow the
  selection the clear unmounts the dialog in the same tick its `Could not close` rows were written and the
  person never reads the reason their ticket was refused; under the plan's other literal reading (live
  `tickets`, its own open flag) the refusal list still renders — `failures` is the dialog's own state — but
  the report describes a selection that has since been emptied (`Close 0 tickets` over an opening that was
  two). **Both readings fall short of §8.3; an earlier draft of this entry said the plan "produces" the
  unmount, and an independent review measured that as stronger than the document supports.** The fix: the tickets are **snapshotted at click time** and the dialog
  keeps its **own open flag** (they are `pendingClose`, one piece of state serving both), while `onClosed`
  reloads UNCONDITIONALLY and releases the snapshot only on a complete close. The case drives a two-ticket
  selection where the second is refused and asserts the refusal listed verbatim, the committed ticket no
  longer pending, the reads incremented — "the rest close and the list reloads", on this outcome too — the
  dialog still mounted, and the selection cleared by the reload. **That last assertion is what makes the
  survival above a fact about the dialog's own flag rather than about the selection never having moved.**
  **Citations:** `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:789` (the snapshot and the flag),
  `:2289` (the conditional release), `apps/web/test/list-bulk-close.test.tsx:331`

- ✅ **13.795 — an OPEN dialog's tickets cannot be swapped under it.** `BulkCloseDialog` states its own
  precondition: a parent swapping `tickets` while the dialog stays OPEN is *not covered by its reset*,
  because the reset is an effect keyed on `open`. `open` is `pendingClose !== null`, so a second selection
  written into a non-null snapshot is a swap with no transition, and the previous opening's
  `closedIds`/`failures` survive against a list they do not describe — the concrete failure being a FULL
  success that does not clear, with a `Could not close` row naming the other selection's ticket and no
  confirm left to press. The opener refuses the swap. **This is Task 10's case 13.793 one surface over —
  the same guard on the same shared component, found there by an independent review and applied here
  before a review had to find it twice.** The reachability is a KEYBOARD path in a browser (`Dialog` ships
  no focus trap and no portal — recorded as a named follow-on on the SHARED component and now named twice,
  from two surfaces, rather than repaired from either); jsdom does not hit-test the scrim, so an ordinary
  click drives exactly the state transition an escaped focus produces. **The CONTROL is inside the case
  and is half of it:** after dismissing, the same click on the same control opens a fresh dialog carrying
  the CURRENT selection — so the element is live, the selection really did change, and the titles above are
  the same only because the guard refused. **What the control does NOT prove, measured by an independent
  review against an earlier draft of this entry: it is a THIRD click, not the refused second one, so it
  cannot distinguish the shipped guard from a handler that swallows a click only while `pendingClose !==
  null` — the two are observationally identical, because a correctly refused click is a no-op.** The
  guard-removal mutation is what proves the guard; the control proves the click is not dead.
  **Citations:** `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:2301` (the guard),
  `:2279` (the one dialog mount), `apps/web/test/list-bulk-close.test.tsx:430`

**Mutations, each restored from a byte copy verified by sha256 (not `git checkout`, which errors on an
untracked path), each guarded by a replacement count of exactly 1.**

1. **The plan's own — the `closed === null` term dropped from the gate** → reddens **13.648's gate `it`
   and nothing else**, which is the kill the plan predicted for this task.
2. **The clear made UNCONDITIONAL** (`setPendingClose(null)`), which is what the plan's text plus the task
   dispatch produce read literally → reddens **13.794 and nothing else**. This is the control for the
   correction above and it proves the conditional is load-bearing rather than decorative.
3. **The SNAPSHOT removed** (`tickets` tracking the live selection instead) → reddens **13.794 and
   13.795**. Two sites, because two properties depend on the same piece of state — the partial's report
   and the open dialog's immunity to a swap.
4. **The swap guard removed** → reddens **13.795 and nothing else**.
5. **The checkbox column no longer gated on `selection`** → reddens **13.647's control arm** plus four
   pre-existing cases that assert exact table shape (3.51, 3.52 ×3). A structural mutation reddening
   structural neighbours is the expected shape here, and the case this task added is among the killed.
6. **`controls` hoisted ABOVE the summary** → reddens **13.647's `controls` `it` and nothing else**, which
   is what pins the ordering the docblock claims.
7. **`controls` moved to the END of the controls row** → **SURVIVED, all 71 green.** Recorded rather than
   quietly dropped, because it changes the source and the rendered output while changing nothing the case
   asserts: the slot is still after the summary. The property 13.647 pins is therefore exactly "after the
   summary sentence", and the component's docblock was corrected to say that and to record the survival —
   spec §8.3 says only "in the list's control row", so the position among the arrangement controls is a
   freedom this task deliberately does not freeze.

---

# Second wave, Task 6 — `autoCloseAfterDays`: setting, projection, wire, and the Workspace settings tab

Plan ids `13.622`–`13.625` were **taken** (recorded as taken in the dispatch), so this task's cases are
**`13.713`–`13.717`**, recounted by case MARKER at the tip (see the update above — a substring sweep
reported `13.713` present and it was this file mentioning it, not minting it).

**The task's correctness core is one field's present-versus-null distinction, and it is tested at four
layers.** `autoCloseAfterDays` is `number | null`, where `null` is a CLAIM ("turn auto-close off") and
`undefined` is "this claim does not mention it". `COALESCE(EXCLUDED.x, existing.x)` cannot tell those
apart, so a claim that turns auto-close off would be silently ignored — accepted, committed, its
provenance updated, and with no effect on the setting. The projection therefore writes a `CASE` guarded
by a presence boolean, and 13.714 is the assertion a `COALESCE` fails.

- ✅ **13.713 — the domain schema accepts `autoCloseAfterDays` alone, as a number AND as `null`, and
  refuses `0`, `366`, and a claim that names nothing.** Three cases in
  `packages/domain/test/events/workspace-settings.test.ts`. The load-bearing assertion is that `null`
  and `undefined` survive `parse` as DIFFERENT values (`{autoCloseAfterDays: null}` parses to an object
  with the key, not to `{}` and not to `{autoCloseAfterDays: undefined}`), because Zod is the only
  layer where that distinction still exists — by the time SQL sees the bind, both are NULL and only the
  presence boolean separates them. `0` is refused rather than accepted as a second spelling of "off",
  so there is exactly one way to say each thing and the CASE's `$n` can never hold a `0` the sweep
  would have to special-case. The empty-claim case asserts `{autoCloseAfterDays: undefined}` is refused
  too: it is the empty claim wearing a key, and the projection would read it as "not present".
- ✅ **13.714 — the projection: a claim setting `autoCloseAfterDays` to `null` CLEARS a stored value,
  which is the assertion `COALESCE` cannot pass.** Three cases in
  `apps/server/test/projections/workspace-settings.test.ts`. The first applies `30`, asserts the reader
  serves `30` (so the first claim landed), then applies an explicit `null` and asserts the reader
  answers `null` AND the stored column reads `null` — both halves, because a case asserting only the
  `null` would also pass against a projection that never wrote the column at all. Provenance follows
  the row, so the person who turned it off is the settings author. The second case is partiality in
  BOTH directions (an auto-close claim leaves `stale_days`/`due_soon_days` alone, and a threshold claim
  leaves a stored auto-close alone) — the second direction is one a `COALESCE` gets RIGHT, which is why
  it is asserted beside the one it gets wrong: a file exercising one direction cannot tell which
  mechanism the code is using. The third pins `autoCloseAfterDays: null` for a workspace with no row,
  present-with-null rather than omitted, which is what the sweep (Task 8) reads to decide scope.
- ✅ **13.715 — `mapWorkspaceSettings` carries all three knobs and names the provenance actor, with
  `null` passing through as `null`.** Four cases in `packages/app-core/test/online/mappers.test.ts`.
  **This mapper is the one the task plan named and the tree did not have** — see
  `Features.md` and `EXEC-2026-09-18-t6-settings-read.md`. Its discriminating assertions: `null` maps
  to `null` and is NOT coerced to `0` or dropped (`Object.hasOwn` on the mapped result, not just a
  deep-equal); a `null` provenance stays null, with the same mapper returning non-null on a body that
  HAS one, so the assertion is the null branch rather than an unconditional null; and a missing or
  mistyped knob is REFUSED rather than defaulted — a mapper answering `7` for an absent `staleDays`
  would render a threshold with nobody behind it on the one screen whose job is to show what was
  chosen.
- ✅ **13.716 — `/settings?tab=workspace` renders the three knobs at their current values, saves ONLY
  what changed, sends an explicit `null` for `Off`, and is read-only for a member.** Four cases in
  `apps/web/test/settings-page.test.tsx`. The partial-update case asserts the submitted payload is
  EXACTLY `{autoCloseAfterDays: 14}` — `toEqual` on the whole payload is what makes "and nothing else"
  a measurement, since a form echoing all three knobs would write a faithful row and the bug would only
  surface when two people edited different knobs. The `Off` case asserts `{autoCloseAfterDays: null}`
  with the key present, which is the client end of the projection's CASE: a form that OMITTED the key
  when Off was ticked would leave the workspace ON while the user watched the box they just ticked.
  Save is asserted DISABLED until something changes (the schema refuses the empty claim, so an
  always-enabled Save would be a button whose only outcome is a refusal notice), and the member case
  asserts the values are still SHOWN with the read-only sentence and **no Save control at all** rather
  than a disabled one.
- ✅ **13.717 — the read door `DataSourceQuery.getWorkspaceSettings` reads the attention route, maps its
  `settings` sibling, and refuses a body without one.** Three cases in
  `packages/app-core/test/online/online-data-source.test.ts`. Added by the recorded deviation, so these
  pin the shape's own decisions: the recorded URL list is asserted to CONTAIN the attention route and
  to NOT contain a `/settings` path or a contests read (the positive control on the call, since the
  recording fetch 404s anything it was not given); `autoCloseAfterDays: null` survives the round trip
  with a number-case control in the same run; and a body missing `settings` REJECTS rather than
  rendering a form of invented defaults, again with a restored-fixture control so the rejection is
  caused by the missing key.

**The CASE-vs-`COALESCE` mutation, run and recorded — and an earlier version of it DISCARDED as not
isolating its property.**

1. **First attempt: `COALESCE` swapped in but `$7` still bound.** RED, but for the wrong reason —
   `could not determine data type of parameter $7`, because removing the CASE removed the only
   reference to that parameter and Postgres cannot infer its type. **9 of 12 cases failed**, all with
   that plumbing error. This is a mutation that changes the source but not the property under test, in
   the direction that condemns innocent checks; it was discarded rather than reported as a kill.
2. **The faithful mutant: a self-consistent `COALESCE` implementation** — the CASE replaced AND the
   presence boolean dropped from the parameter array, which is what an implementer who never knew
   about the distinction would actually write. **RED, and exactly one case: 13.714's clear-to-null,
   `expected 30 to be null`.** 11 of 12 passed, including the two neighbouring 13.714 cases and every
   pre-existing case in the file. The mutation names its own site and nothing else moves.
3. **Restore verified by checksum, not by reading**: the pristine file was copied aside first and its
   SHA-256 recorded in the same invocation as the backup's, so the "restored" comparison is
   same-path/same-invocation rather than a shell `diff`.

**Task 6 fix round, after the independent review — `13.718`–`13.721`.** The review found one
**Important** defect and three mutations that SURVIVED the whole suite. A survivor is evidence about
the TESTS rather than about the code, so each one got a case, and each case was then proved to kill
its own mutant before the fix was called done.

- ✅ **13.718 — the form adopts the SERVER's values after a save, even when they differ from what was
  submitted.** The review's Important finding (F1), and it was a REAL defect rather than a false
  comment. `onSaved`'s `settings.reload` gave the page new data, but the form holds its draft and its
  `Off` box in `useState` **initialisers**, which React runs once — so it kept rendering the
  submitted values, and the page's comment promising that "a projection that clamped, or a claim the
  engine adjusted, becomes visible on this screen" was false. **Reproduced before it was fixed**: the
  fixture has the second read answer `30` where the user submitted `14`, and the case failed with the
  field showing `14`. The fix is `adoptOnNextLoad`, which re-derives the draft from the next
  `settings` the form sees after ITS OWN successful save — deliberately NOT "adopt on every settings
  change", because `useLiveQuery` refetches whenever the workspace stream moves and an unconditional
  adopt would clobber a draft somebody is typing the moment another admin saved anything.
  `apps/web/src/workspace-settings-form.tsx`, `apps/web/app/settings/page.tsx`
- ✅ **13.719 — `Off` on an already-off workspace is not a change, and Save stays disabled.** Kills
  the review's surviving mutation **M9** (the `Off` branch claiming `null` unconditionally), which the
  reviewer proved LIVE: the mutant left all 11 cases green while enabling Save on a workspace that was
  already off. Every pre-existing fixture started at `autoCloseAfterDays: 30` with the box unchecked,
  so the state most workspaces are actually in — `null` is the default — was never exercised.
  Re-run after the fix: **M9 dies on 13.719 and nothing else.**
- ✅ **13.720 — an emptied number field disables Save and ingests nothing.** Kills the review's
  surviving mutation **M12** (the `invalid` gate removed from BOTH the `save()` guard and the button),
  which survived the whole suite because no case ever built an invalid draft. Re-run after the fix:
  **M12 dies on 13.720 and nothing else.** The same finding had a second half, and it is why the
  docblock above the gate was **rewritten rather than left alone**: it claimed the user "sees that
  something is wrong", and the reviewer measured that no alert appears — the entire signal is a
  greyed-out button. A comment describing a signal the product does not emit is the same defect class
  as a test asserting a property nothing pins. A message naming the offending field is recorded as a
  follow-on, NOT implied by the comment.
- ✅ **13.721 — `getWorkspaceSettings` refuses a body that is not an object.** Kills the review's
  surviving mutation **M7** (the non-object guard returning the domain defaults instead of throwing),
  which left all 29 cases green because the existing 13.717 case supplies a body that IS an object and
  merely lacks `settings`, so it refuses inside `mapWorkspaceSettings` for a different reason. Re-run
  after the fix: **M7 dies on 13.721 and nothing else.** **Reachability is stated honestly rather than
  implied**: neither the reviewer nor this session found a production path that feeds the route a
  non-object body, so this pins a GUARD rather than a witnessed server behaviour — which is the
  guard's whole job at a network boundary the type system does not police.

**Not fixed, and recorded rather than smoothed.** The review noted a Minor inconsistency: the core
fake (`packages/app-core/test/helpers/fake-data-source.ts`) invents defaults for this door while the
web stub (`apps/web/test/helpers/stub-services.ts`) deliberately refuses. **Kept as-is, on purpose**:
the two helpers have different jobs and always have — the core fake is a working fake whose defaults
mirror states the product can really produce (`getTicketTypes` does the same), while the web stub's
rule is that a read a case did not stub must fail loudly. The web stub's refusal is the one that
pins the settings screen, and 13.716/13.718 depend on it. Changing the core fake to refuse would
break unrelated suites for a consistency that buys nothing here.

## The last-owner guard, in both layers (executor 2, 2026-09-18) — plan `2026-09-18-membership-role-guard` Task 1, ids `13.820`–`13.823`

- ✅ **13.820 — a `membership.granted` that would leave the workspace with no owner is refused, and one
  that would not is accepted.** The guard fires only on a move **out** of owner, and that narrowing is
  the case's whole content rather than a detail: a grant to somebody who is not currently an owner is
  accepted even when the workspace has exactly one owner (`wasOwner` is false, so the count is never
  consulted), re-stating the sole owner as an owner is accepted, and demoting one of **two** owners is
  accepted because the workspace is not emptied. **The accept arms are the assertions that make the
  refusal mean something** — a guard that refused every owner-touching grant would satisfy the refusal
  alone. The count excludes the subject of the change, and that exclusion is load-bearing in the
  opposite direction from the obvious one: without it a sole owner counts **himself** and the guard never
  fires at all — pinned by mutation, which reddens the sole-owner case and leaves the accept arms green.
  **Batching is not a way around it, and that is asserted rather than assumed.** Two events in ONE
  submission are judged one at a time and the context reads through the ingest transaction's own client,
  so the count for the second event sees the first's effect: demoting one owner and then the last in a
  single batch commits the first and is refused `last-owner` on the second. **This assertion is the one
  that pins the property; the per-event arm above it does not.**

  **AMENDED 2026-09-18 (second sitting) — the ACTOR of the real-door arms changed, and two sentences above
  are superseded rather than deleted.** The owner ruled that an admin may not demote a *non-last* owner
  either, so the actor that reaches the engine's world-half is no longer an admin: an admin acting on ANY
  owner is now refused by the GATE, before the engine runs. The real-door arms therefore moved to an
  **owner** actor, and the count-proof they exist for is now an owner demoting **themselves** out of the
  last ownership — the one act the gate admits and the count alone decides. The two superseded claims:
  *"the demotion is driven by an admin … so a refusal there can only have come from the engine's
  world-half"* — an admin's demotion now never reaches the engine at all — and *"an admin demoting both
  owners in a single batch"*, which is now refused on the FIRST event. **The batch arm keeps its actor
  reasoning in inverted form:** the actor must now be an owner, and an owner stays an owner for both
  events because the second is the one refused. Measured by mutation: disabling the new gate check makes
  the batch arm's first event commit again and returns this case to `last-owner`. See **13.883**.
  **Citations:** `packages/rule-engine/src/checks/membership.ts:87` (the check), `:103` (the move-out-of-owner
  test), `:82` (the target's current role), `packages/rule-engine/test/membership.test.ts:106`,
  `apps/server/test/permissions/check-role-permission.test.ts:1256` (the real-door half, where the `SELECT`
  itself is what is under test, and `:1377` the same-batch assertion)

- ✅ **13.821 — a `membership.revoked` of the only owner is refused by the same rule.** The second door to
  the same state, and it must answer identically: there is no role in a `membership.revoked` payload, so a
  revocation is a move out of owner by construction and the only question is whether the target held it.
  Revoking one of two owners is accepted **by the ENGINE**; revoking somebody who is not an owner is
  accepted. **This case is why the guard lives in the engine rather than in the permission gate alone** —
  the gate never sees the ledger, so a rule written there could not tell a sole owner from a second one.
  **AMENDED 2026-09-18 (second sitting): "revoking one of two owners is accepted" is now true of the ENGINE
  and FALSE of the client door, and the sentence above did not say which it meant.** The owner ruled that
  an admin may not remove owner status from ANY owner, so on the client door an admin revoking one of two
  owners is refused `remove-owner-requires-owner` before the engine is consulted; an OWNER revoking one of
  two still commits. Measured on the real door, both ways. See **13.883**.
  **Citations:** `packages/rule-engine/src/checks/membership.ts:114` (the check), `:130` (its refusal),
  `packages/rule-engine/test/membership.test.ts:168`

- ✅ **13.822 — the guard THROWS rather than refusing when its context cannot count owners, and its other
  exits are unchanged.** Witnessed rather than asserted, because the plan asked for that specifically:
  `countWorkspaceOwners` is OPTIONAL on `EngineContext` so every context that predates it still
  typechecks, and the guard's answer to a context that cannot supply it is a **throw** — a refusal minted
  from an absent counter would be the sentence *"this change would leave the workspace with no owner"*
  made by something that never counted, dressed as a fact about the workspace. **The case carries its own
  control and half of it is the control:** the SAME cannot-count context accepts a change that never needs
  the count, which is what separates "throws because the count is unavailable" from "throws on every
  membership event" — the second would make every context that predates this guard unusable. The kind
  guard is pinned here too, refuting a misfiled entity kind by name rather than accepting it, and a
  malformed payload stays `malformed-payload` rather than becoming a role refusal. **A defect in the
  plan's own Step 1 code is pinned as a case rather than left to be rediscovered:** its sample payloads use
  `userId: 'u1'`, and `membershipGrantedPayload`'s `userId` is `ulidString` — measured, `'u1'` fails with
  `userId: must be a ULID`, so a test transcribed from the plan would be red for a reason unrelated to this
  guard and the tempting repair would be to loosen the assertion, which deletes the witness.
  **Citations:** `packages/rule-engine/src/checks/membership.ts:69` (the throw — `:63` is the helper's
  signature, and an earlier draft cited that as "the throw"), `:91` (the kind refusal),
  `packages/rule-engine/test/membership.test.ts:196`

- ✅ **13.823 — only a workspace OWNER may grant the owner role, which is what stops an admin promoting
  themselves.** The actor half, and the half that closes an escalation the world half cannot: an admin
  could demote the sole owner and then promote themselves, and at no step of that does the workspace hold
  zero owners — only zero of the *original* owner's role — so 13.820 alone does not refuse it. An admin
  is refused `grant-owner-requires-owner` for `membership.granted { role: 'owner' }`; an owner is not,
  which is the control that stops the rule from being a deadlock in which no workspace can ever gain a
  second owner. A third assertion pins the **ordering** as behaviour: a plain member granting owner is
  refused by the broad `permission.role` sentence about their standing, not by this narrower rule, because
  the wide refusal runs first and the sentence a person reads should be about the thing that actually
  stopped them. A malformed owner grant is deliberately **not** refused here — it falls through to the
  engine's `malformed-payload`, which names the field — and that is asserted too, so the two layers cannot
  start answering for each other.
  **Citations:** `apps/server/src/permissions/check-permission.ts:619` (the clause), `:86` (the sentence),
  `apps/server/test/permissions/check-role-permission.test.ts:290` (the pure case),
  `:1355` (the real-door case, through the client door because the internal one does not run the gate)

## An admin may not remove owner status from ANY owner (executor 1, 2026-09-18, second sitting) — case `13.883`

> **THE ID WAS `13.881`, AND IT COLLIDED — recorded because the collision is the lesson, not the fix.**
> Both executors measured "next free is `13.881`" at their own tips, minutes apart, and **both were right
> at the moment they measured**; exec 2's attention-strip entry (`13.881`–`13.882`) merged first, so this
> case renumbered to `13.883` before its PR opened. The bare number was the defect: **a reading that is
> correct in one tree expires in another**, which is exactly why the case-id protocol is written in
> BLOCKS (`13.700`–`13.759` and so on) rather than as a tip. `check-case-ids` caught it — the duplicate
> was reported as two files-and-lines for one id, and it FAILS rather than warning — so the gate did its
> job here and the cost was one renumber. Recorded at this length because the next executor handed a
> "next free" number will otherwise take it, and the number is only true until someone else takes it.

**The owner's ruling, verbatim:** *"may an admin demote a non-last owner: **no**."*

**The hole, and why two already-shipped rules left it open.** `grant-owner-requires-owner` refuses a
payload that **grants** `owner` (13.823); `last-owner` refuses a change that would leave the workspace with
**zero** owners (13.820). Neither has anything to say about an admin demoting an owner **while another
owner remains** — so an admin could do it, and the projection's `ON CONFLICT … DO UPDATE SET role =
excluded.role` would write it. **Measured on the real door before the fix: the event COMMITTED.** Ownership
is a transfer of the workspace itself, which is the whole reason the grant half is owner-only; the removal
half is the same act read backwards, and it was open.

- ✅ **13.883 — an admin removing owner status from ANY owner is refused, and every other admin act keeps
  working.** One case in `apps/server/test/permissions/check-role-permission.test.ts`, through
  **`ingestClientBatch`** — the client door, the only one that runs both halves; `ingestBatch` is the
  internal append path and does not apply the permission gate, so a permission assertion driven through it
  is vacuous (the block above records a first cut that made exactly that mistake). The workspace holds
  **two owners throughout**, so none of the refusals below can be the world-half — `last-owner` would allow
  every one of them, and that is what isolates the new rule.

  **FOUR attempts, and three of them are controls**, because each refusal alone is consistent with a wrong
  implementation: **(1)** an admin demotes a non-last owner → refused
  `remove-owner-requires-owner`; the same act through `membership.revoked`, which names no role and
  therefore reaches the rule by a different read, answers identically. **(2)** the ADMIN promotes a plain
  member to **admin** → **committed** — a blanket "refuse everything an admin does to a member" would have
  satisfied (1), and this arm forbids it; the ruling narrows owner transitions only. **(3)** an admin
  GRANTS owner → still refused by the **sibling** id `grant-owner-requires-owner`, so this change did not
  swallow the rule that already shipped. **(4)** the **OWNER** performs the same demotion the admin was
  refused → **committed** — the arm that proves the rule reads the actor's role rather than refusing the
  act outright, and the only path by which ownership is transferred. The last assertion reads
  `proj_memberships` directly: the refused event must leave the target's row untouched, because a gate
  that refused the event and a projection that wrote it anyway look identical from the verdict alone.

  **GUARD PROVED BY MUTATION, and it reproduces the hole as the "before" half:** with the new refusal's one
  `return` statement replaced by `return null` — the check still running, still reading nothing — attempt
  (1) comes back **`committed`**, which IS the defect the ruling closes, and the 13.820 real-door arms
  revert to `last-owner`. Restored, `check-permission.ts` returns to SHA-256
  `974313512fa0c0a6acd0c20f93f9b03e4f17d6b1a43aa57c7b30f66f62149fa5` byte for byte and the suite to 48/48.

  **THE UI HALF, DECIDED BY READING THE CODE RATHER THAN REPEATING A CLAIM:** an admin is **not** offered a
  role change that removes `owner`, and no narrowing was needed. `EDITABLE_ROLE_OPTIONS`
  (`apps/web/app/w/[workspaceId]/members/page.tsx:546-550`) is `admin`/`member`/`guest` — `owner` is absent
  — and line `:475` renders the `<Select>` only when `isEditableRole(member.role)`, so **an owner's row
  renders the `.gn-chip` instead of a control**. The control therefore cannot build such a payload from
  either side. Recorded as measured, because the same file's prose claims the prototype's version *does*
  list `Owner` and that "the two halves do not compose" — the claim was worth re-deriving, and it holds.

  **ACTOR-AUTHORITY LAYER, and the alternative that was rejected.** The check lives in
  `check-permission.ts` (`checkMembershipOwnerAuthority`, `:963`), not in the rule engine beside
  `last-owner`. The ruling is about the ACTOR — the plan's own split puts actor questions in that module —
  and the placement is forced rather than merely consistent: the check needs **who the actor is** (already
  resolved in `ctx.eff.workspaceRole`) and **who the target currently is** (a `proj_memberships` read,
  since neither payload carries a previous role). An engine-side version would have to ask the first
  question, which the engine must not, and on the doors where it is asked most could not answer the second
  — `membership.ts` records that the fixture context answers `null` for every membership and the offline
  replica holds the ACTOR's row alone. The target read reuses `resolveEffectiveRole`, the module's one safe
  reader of that table, rather than a bare `SELECT`.
  **Citations:** `apps/server/src/permissions/check-permission.ts:963` (the check), `:1011` (its refusal),
  `:101` (the sentence), `:1060` (the pass, and why it is second),
  `packages/rule-engine/src/refusal-rules.ts:32` (the id),
  `apps/server/test/permissions/check-role-permission.test.ts:1462` (the case)

**Mutations, each applied to a backed-up file, confirmed to have CHANGED it, run, then restored by `cp`
with a matching sha256.**

1. **The `wasOwner` guard removed** (`isCurrentlyOwner` returns false) → reddens **five**: 13.820's and
   13.821's refusal arms, both `evaluateEvent` reachability arms, **and 13.822's THROWS arm** — 11 green.
   An earlier draft called this "kills refusals and nothing else", which is wrong twice: it also kills the
   throw, and of the eleven green only **eight** are accept arms (the other three are
   `malformed-payload` refusals, which this mutation correctly leaves alone).
2. **The stub's count ignores `excludingUserId`** → reddens the same four refusal/reachability arms, the
   rest green.
3. **The server's SQL ignores `excludingUserId`** → reddens **exactly one case, the real-door sole-owner
   refusal, 46 green** — with a genuine `AssertionError`, which took three attempts to obtain and the two
   failures are the point of this entry.
   **★ TWO SUCCESSIVE ATTEMPTS AT THIS MUTATION WERE INVALID EVIDENCE AND BOTH LOOKED LIKE KILLS.**
   *(a)* A perl substitution dropped `$2` and produced `AND (::text IS NOT NULL)` — a SQL **syntax
   error**. *(b)* The "corrected" re-run deleted the clause whole; that removed the query's **only** `$2`,
   leaving one placeholder against a two-element parameter array, and the case reddened with
   `bind message supplies 2 parameters, but prepared statement "" requires 1` — **a bind error, the same
   failure class as (a)**, and it was recorded here as "the kill that counts" until an independent review
   measured it false. Neither run could have distinguished a wrong predicate from a mistyped column, a
   missing parameter, or an absent table.
   *(c)* The kill that counts keeps **both placeholders** and makes the clause a tautology —
   `AND ($2::text IS NULL OR $2::text IS NOT NULL)` — verified by reading the mutated line back, with the
   failure text confirmed to be `AssertionError: expected { status: 'committed' } to match object
   { status: 'refused' }` and **not** a bind or syntax error.
   **A mutation that reddens for a reason unrelated to the property it names is not a kill — and the exit
   code cannot tell you which you have.** The first two attempts exit 1 exactly like the third, and both
   were more convincing-looking than the real one.
4. **The owner-grant clause replaced with `if (false)`** → reddens the pure permission case **and** the
   real-door self-promotion case, both halves, so neither is decorative.
5. **The `env.entity.kind !== 'membership'` guard removed** → reddens exactly the misfiled-kind case.
   Worth recording that this guard was **absent from the plan's Step 5 code block while its prose required
   it** ("type guard, **kind guard**, `safeParse`…"), and that `evaluate.ts`'s own docblock makes it
   mandatory — the fixture suite and the offline replica enter through `evaluateEvent` and never pass
   through ingest's door, so no check may trust that dispatch.

**★ A NAMED FOLLOW-ON this task creates and does not fix: the throw is reachable on the offline replica.**

Found by the independent review, and it is a real consequence of the throw decision rather than a
theoretical one. The chain, each link read: `packages/sync-client/src/precheck/local-context.ts:217` serves
the ACTOR's own membership **with a role**, from bootstrap `me`; none of the four in-memory contexts
implements `countWorkspaceOwners` (the server's is the only implementation), so `ownersOrThrow` throws
there; and `packages/sync-client/src/outbox/outbox.ts:315` calls `evaluateEvent` with **no `try`/`catch`**,
so the throw escapes `enqueue` — which its own contract describes as returning an `IngestResult`, and
whose docblock claims the local verdict is *"identical to the answer the server will give on the same
facts"*. For this guard it is not: the server **refuses**, the replica **throws**.

**Latent today, not live** — no shipped client emits `membership.granted` or `membership.revoked`
(measured: zero hits across `apps/web/src`, `packages/app-core/src`, `packages/sync-client/src`). **It goes
live with the roster's role control**, which wires exactly that event to the client ingest path.
*Owner: that task — the one that makes it reachable.* **The repair is not in this file and must not be a
second membership reader:** the replica genuinely holds one row and cannot count owners, so what needs
changing is where a throwing evaluation is caught, not a context inventing an answer it does not have.
Recorded rather than repaired here because the trigger does not exist yet and because fixing it means
editing a file this task has no other reason to touch.

**One plan-text defect is recorded rather than silently repaired, and it has since been RULED ON.** The
plan's Step 3 declares `REFUSAL_RULES.grantOwnerRequiresOwner` under **"Produces"**, while its Step 7 emits
the generic `permission.role` instead; the two cannot both hold. The id was taken as authoritative and
emitted through `refuseWith`, because a rule name nothing emits is a matching key that can never match —
all twenty ids already in `REFUSAL_RULES` are emitted somewhere (measured), so a twenty-first with no
emitter would be the catalogue's only dead entry. The alternative reading costs only a different string in
a rendered refusal; this one costs a dead constant. **Flagged to the controller with both readings priced
rather than settled unilaterally; the controller ruled on 2026-09-18: carry on with `refuseWith` and the
new id — and then FIXED THE PLAN rather than leaving the conflict standing.** Step 7 of
`docs/superpowers/plans/2026-09-18-membership-role-guard.md` now reads
`refuseWith(REFUSAL_RULES.grantOwnerRequiresOwner, WORKSPACE_OWNER_GRANT_REASON)` (PR #456,
`fff365bd`), matching this implementation. **So the plan and the code agree as of that commit, and an
earlier draft of this paragraph — which said the two steps still disagreed — is struck rather than
left standing**, since it was true only until the plan was corrected.
---

# Second wave, Task 7 — `reopenedAt`, the reserved auto-close actor, and its name

Plan ids `13.630`–`13.634` were **taken** (recorded as taken in the dispatch), so this task's cases are
**`13.722`–`13.726`**, recounted by case MARKER at the tip before the first mint: the block's
high-water was `13.721` (Task 6's fix round) with `13.720`/`13.721` present as the positive control, and
`13.722` returned **false**.

**The task's correctness core is a timestamp that is not a display fact, and a constant that must pass
the ingest door.** `reopenedAt` exists so the auto-close sweep can honour spec §8.2's "reopen wins": a
ticket that sat terminal for 30 days because nobody came back and one a person deliberately reopened
yesterday carry the SAME `closed: null` and the same terminal `stateId`, so without this field the
sweep would close the second one an hour later. `SYSTEM_ACTOR_AUTO_CLOSE` is the actor the sweep files
that close under; it must match `ULID_REGEX` or the ingest door refuses every event and the sweep
reports `refused: N` forever — a failure that would present as a rules problem rather than as a bad
constant. 13.722 pins the match with a negative control for exactly that reason.

- ✅ **13.722 — `ticket.reopened` arms `reopenedAt`; ANY transition clears it, including back into the
  same terminal state.** Four cases in `packages/domain/test/ticket-state.test.ts`. A created ticket is
  present-and-null (`toBeNull`, not `?? null`: the field is optional on the DOMAIN type only because
  hundreds of test literals predate it, so a `?? null` here would pass on a regression that dropped the
  key — the shape the dual-client rig's whole-`TicketState` `toEqual` compares). The reopen case
  records the envelope's `serverTime` and proves the rest of the state is byte-identical by stripping
  the one field under test from both sides. The clear case carries its OWN positive control in the same
  test — after the reopen and before the transition the field IS set — without which the clearing
  assertion is satisfied by a reducer that never sets it at all; it then transitions back into `done`,
  the state the ticket is already in, and asserts both `reopenedAt === null` and that the transition
  LOG grew by one, which is what separates a real re-arm from a transition the fold skipped.
  **Mutation M1** (drop `reopenedAt: null` from the `ticket.transitioned` case) → **13.722's clear case
  reddens and nothing else in the file** (1 failed, 36 passed); the mutation was re-applied through the
  editor after a first attempt died of a perl plumbing error, so the kill is the semantics and not a
  bind error. The fourth case pins `ULID_REGEX.test(SYSTEM_ACTOR_AUTO_CLOSE)` with a one-character
  negative control and the `SYSTEM_ACTOR_NAMES` entry, because a constant the ingest door refuses would
  turn every auto-close into a refusal.
  **The fifth case is a review-round addition, and its history is the point** (see the review section
  below): `state.reopenedAt ?? env.serverTime` — a first-write-wins stamp — **survived** all 514 domain
  cases until this case existed, because the sweep's predicate is only "is it NULL" and nothing held
  the field's documented meaning to the word *last*. **The first version of this case did not kill it
  either**, and the reason is worth keeping: `??` differs from a plain stamp only when a
  `ticket.reopened` arrives while `reopenedAt` is ALREADY set, and that version walked
  `closed → reopened → transition → closed → reopened` — the transition clears the flag, so the mutant
  read a null and behaved identically. **The discriminating path needs a second reopen with no
  transition between, and the doors permit exactly that**: `ticket.reopened` clears `closed` and leaves
  the ticket in its terminal state (§1.2), `checkTicketClosed` refuses only on `already-closed` +
  `close-requires-terminal`, and `checkTicketReopened` refuses only on `not-closed` — so
  `closed → reopened → closed → reopened` is accepted end to end, and at that second reopen the field
  still holds the FIRST instant. The case asserts BOTH directions there (`toBe(second)` and
  `not.toBe(first)`), because the first alone would also pass a stamp carrying both. Re-run after the
  fix: **M4 dies on this case and nothing else** (1 failed, 513 passed of 514).
- ✅ **13.723 — `proj_tickets.reopened_at` follows the state, all three arms.** One case in
  `apps/server/test/projections/tickets-closed.test.ts` (a sibling of 13.572, which owns the
  closed/reopened columns of this table). Real Postgres through `applyCommitted`; seeded along the real
  path (terminal → closed → reopened → transitioned) rather than by hand-writing the column. `NULL` on
  creation and through `rowToTicketState`; the reopen's `serverTime` after a reopen; `NULL` again after
  a transition back into `done`. The middle arm is the control — without it the third passes against a
  projection that never wrote the column — and the third is the arm an `ON CONFLICT SET` list that
  omits this column cannot produce, leaving the row holding the reopen's stamp for the rest of the
  ticket's life, which is the "never auto-closable again after one reopen" failure §8.2 names.
- ✅ **13.724 — `mapTicketState` carries the wire's `reopenedAt` onto `TicketState.reopenedAt`.** One
  case in `packages/app-core/test/online/mappers.test.ts`, through `mapTicketRead`. This is the last
  member of this mapper that could have gone dead the 13.603 way: the route serves a whole
  `TicketState` and the mapper enumerates its members BY HAND, so a member added to `rowToTicketState`
  and not added here is silently dropped on this route alone. **The tolerance is stated rather than
  incidental, and it is a deliberate difference from `mapClosed`/`mapRank`:** an absent `closed` or
  `rank` is a visible product defect (a hidden badge, a reordered Backlog tab) so those throw, while
  `reopenedAt` is a server-side sweep input no surface renders and its job here is that the mapped
  state keep the same SHAPE as the one the replica folds locally. An absent key reads as `null` — the
  same answer as an explicit null — and the case asserts that arm explicitly. The VALUE is still
  policed: a number is refused rather than coerced into `string | null`.
- ✅ **13.725 — `actorLabel` knows the reserved system actors, and the ROSTER cannot rename one.** Three
  cases in `packages/app-core/test/provenance.test.ts`. The precedence is the load-bearing part, not
  the lookup: system name FIRST, then the roster, then the id — so
  `actorLabel(SYSTEM_ACTOR_AUTO_CLOSE, 'Someone')` still answers `'Auto-close'`, because a person's
  name printed over a decision no person made is the claim honesty contract 1 exists to refuse. The
  same test carries the positive control that an ordinary id still takes its roster name, so the system
  lookup is a first check and not a replacement. The second case pins the sentence
  (`formatStateProvenance` → `marked Done by Auto-close on 19 Aug 2026`), the second surface that would
  otherwise print the raw 26-character id. The third pins `isSystemActor` **including
  `isSystemActor('toString') === false`** — the reason `SYSTEM_ACTOR_NAMES` is a `Map` and not an object
  literal, since `'toString' in {}` is true and an object-backed lookup would answer `true` for a name
  no product reserved. **Mutation M2** (delete the `SYSTEM_ACTOR_NAMES` lookup from `actorLabel`) →
  **both 13.725 arms and 13.726 redden** (2 failed of 26 in this file; 1 failed of 42 in the sheet
  file), and nothing else.
- ✅ **13.726 — a ticket the sweep closed reads `Closed by Auto-close on <date>`.** One case in
  `packages/app-core/test/views/ticket-sheet.test.tsx`, 13.586's fixture with the actor swapped and
  nothing else changed — which is the point: the badge, Reopen and the disabled Move… all go through
  the one `nameOf` → `actorLabel` join, so the system actor needs no branch in the sheet and must not
  acquire one. The date is 13.586's discriminating 19:00 UTC instant (00:30 IST, 21 Aug), so a
  system-actor branch that formatted its own date would also redden this. The case asserts the id is
  NOT on screen in the same render: a badge falling through to the honesty-contract-1 fallback would
  print the 26-character id and satisfy a `toContain('Auto-close')`-shaped check only by accident of
  the constant's own `SYS0AC` tail.


## The Assignee row becomes editable, on the door that already exists (executor 2, 2026-09-19) — cases `13.966`–`13.968`

**The owner's ruling, verbatim:** *"assignee should not be read only."* The controller's reconnaissance read it
as **SERVER EXISTS → SURFACE**, and that is what it turned out to be — with one correction to the dispatch's
own cost model, below.

**Id block `13.966`–`13.968`**, minted on the tip instruction and deliberately skipping **`13.961`, which the
open sheet-motion PR holds**, and `13.958`–`13.960`, which `#525` owns. Swept with a control in the same
invocation (`13.955`=5; `13.966`–`13.968` = 0 before these cases were written). **Veto if a block was
allocated elsewhere.**

### ⚠ THE DISPATCH'S HARD HALF RESTED ON A PREMISE THAT IS FALSE

The dispatch priced this task as *"the web mounts `TicketSheet` … with six props and NONE of the four optional
ones … **A picker needs a roster, which is a SEVENTH thing to pass**"*. **Measured: there is no seventh thing
to pass.** `ticket-sheet.tsx` **already reads the roster itself** — `useLiveQuery(dataSource, workspaceId,
workspaceId, () => dataSource.query.getMembers(workspaceId))` — and already uses it for `nameOf` and for
`VisibilityEditor`. The candidate list was in the component before this task; nothing new is passed and
nothing new is read.

### ⚠ AND THE SHEET WAS HANDLING AN ABSENT ROSTER THE WAY THIS REPO'S OWN RULE FORBIDS

`members={members.data ?? []}` collapsed **refused** and **not-yet-loaded** into `[]`, and `members.error`
was read **nowhere** in the file. That is precisely the value `page.tsx`'s own docblock names as the defect:
*"`null` while the roster has not been read — **never `[]`, which would claim this workspace has no
members**"*. An assignee picker offering an empty list over a REFUSED roster asserts that nobody can be
assigned, which is a worse lie than a filter's. **The new control tells the three apart**, and a fourth arm
with them.

### The cases

- ✅ **13.966 — the single read serves the assignee's PROVENANCE.** `apps/server/test/routes/tickets-read.test.ts`.
  **A WIDENING, NOT A SECOND DOOR:** one more call to the reader the list already uses
  (`read/assigned-provenance.ts`), batched by the same `DISTINCT ON` shape as the `stateProvenanceFor` call on
  the line above it, on the route that already answers `stateProvenance`. **No route is added**, and the
  dispatch's own prohibition (*"if you find yourself adding a route, stop and ask"*) is not reached. The case
  asserts the claim's actor and serverTime for an assigned ticket **and, as the control, that an unassigned
  ticket answers `null`** — without which a route answering `null` for everything would pass.
  **Mutation-witnessed:** deleting the field from the response reddens it.
- ✅ **13.967 — `mapTicketRead` carries it, and REFUSES a body that omits the key.**
  `packages/app-core/test/online/mappers.test.ts`. **Absent is not `null`, and the two arms are the case:**
  `null` is a real answer (nobody is assigned, and the server's reader establishes there is no claim to carry
  — there is no such thing as a claim with no actor), while an ABSENT key is a body this client cannot read,
  because the route always emits it. Mapping that to `null` would turn a malformed payload into "nobody is
  assigned". **Mutation-witnessed:** dropping the mapping reddens it.
- ✅ **13.968 — the row is editable, and a refused roster is not an empty one.**
  `packages/app-core/test/views/ticket-sheet.test.tsx`. Four arms, each of which would otherwise pass for
  another: the roster the sheet **already reads** plus an explicit `Unassigned`; the submission going through
  the ordinary `dataSource.ingest` as `ticket.assigned`; **unassigning as the SAME event carrying `null`**
  (there is no `ticket.unassigned` — the reader enumerates the event set from the reducer rather than guessing
  a second type), asserted with `toEqual` so `{assigneeId: ''}` or a dropped key would fail; and a **refused
  roster rendering a refusal with NO control at all**, because a picker holding only `Unassigned` is a control
  that lies about the world. A fourth arm — not a case, a branch — covers an assignee **not in the roster you
  can see** (the read hides guests from a non-admin): the row says the name it can and offers no control,
  following the rule the members page's role control settled, that **a control must be able to STATE its
  current value** (`select.tsx:255` renders the placeholder otherwise).
  **Mutation-witnessed twice:** `submitAssignee` never ingesting reddens it, and collapsing a refused roster
  back into `[]` — the sheet's own old behaviour — reddens it too.
  **A FIFTH arm added, RULING E4-18 (closed), same file, no new id (§13's own numbering is exhausted —
  see `test-cases/17-open-work.md`'s block-allocation rule; this ruling has none there either):** a member
  with no display name used to render as a BLANK 13px option — `...people.map((member) => ({ value:
  member.id, label: member.name }))`, `member.name` verbatim — breaking the same honesty contract
  `provenance.ts` states for every other actor label on this sheet (`visibility-editor.tsx:410`'s own
  picker already keeps it via `actorLabel`). The picker now routes through `actorLabel(member.id,
  member.name)` too, so a nameless member reads by its raw id rather than as nothing — asserted with a
  seeded three-member roster (one carrying `name: ''`) against the full rendered option-text array, plus
  a direct check that no option's text is the empty string.

### What is NOT covered, named rather than implied

- **No browser run for this change.** Every arm above is reachable in jsdom, and the control's accessible
  behaviour is the shared `Select`'s, already covered by its own cases; nothing here claims a rendered-truth
  reading it did not take.
- **The refuse-and-render path is not driven end to end from this control.** The sheet's existing position is
  that the ingest door is the authority and its words are rendered verbatim; this control follows that
  (`submitAssignee` carries `refused`/`invalid` through the same `serverRefusal` the siblings use), but no
  case here makes the server refuse a `ticket.assigned`.
- **`fields-editor`-style per-field authority is not consulted** — deliberately: gating the control
  client-side would leave a door refusal unreachable and therefore unrendered.

## The description becomes editable, and the row that was never there (executor 2, 2026-09-19) — case `13.989`

**Owner's ruling, verbatim: _«"description should be editable."»_** Dispatch:
`CTL-DISPATCH-2026-09-19-description-editable.md`. Classified `SERVER EXISTS → SURFACE`, and it is —
no route, no migration, no new door. **Id `13.989`**, from this lane's allocated block
`13.988`–`13.999` (`13.988` spent on the invite expiry). Swept with the control in the same
invocation: `13.988` found at 3 sites in `apps/server/test/routes/invites.test.ts`, `13.989` at none.

### ⚠ THE DISPATCH'S CAUSE WAS HALF RIGHT, AND THE OTHER HALF IS WHY THE ROW WAS NEVER THERE

The dispatch said *"the editor never mounts at all … the answer is a missing prop at the call site"* —
and `page.tsx:2346-2353` did pass six props and none of the four optional ones, so that is true.
**But enabling the composer alone would have changed almost nothing**, and the measurement that shows
it is the reducer, not the sheet:

> `ticket.created` writes `fields: { title: claim(p.title, env) }` and NOTHING else
> (`packages/domain/src/ticket-state.ts:150`). No other path writes a description except an explicit
> `ticket.field_set` — `create-ticket-flow.tsx:209` submits `ticket.created` alone.

The description row lived **inside** the `Object.entries(state.fields)` loop, so on any ticket nobody
had described there was no `description` key, no row, and nowhere for an editor to mount. The row is
now lifted out and drawn unconditionally, on the **assignee row's precedent** (one row up in the same
`<dl>`, which is unconditional and whose claim line states what is known), and the loop skips
`description` so it is drawn exactly once.

### TWO MORE THINGS THE DISPATCH DID NOT NAME, BOTH REQUIRED FOR THE MOUNT TO BE REAL

- **The web loaded no editor stylesheet.** `packages/editor/src/styles/editor.css` was imported only
  by `packages/editor/src/webview/entry.tsx` — the RN webview bundle — and the package's `exports` map
  had no entry for it. Mounting the composer without it renders unstyled, so the stylesheet is now
  exported (`"./editor.css"`, mirroring `packages/ui`'s `"./ui.css"`) and imported by
  `apps/web/app/layout.tsx`.
- **⚠ `apps/web/e2e-viewport/type-scale.ts` asserted the opposite**, in the paragraph explaining why
  two mono rules are exempt from its font equality: *"`editor.css` is loaded only inside the RN webview
  this suite never opens"*. That sentence was true and this change makes it false — corrected in the
  same change set, with the equality **re-measured** rather than assumed: the stylesheet declares
  `font: inherit` in three rules and no `font-family` of its own, so it introduces no second typeface
  and reaches no element this suite visits. This is the sweep's whole point — **the stale sentence was
  in a file the change is not about.**

### THE DOOR

`composeEditorSubmission('description', doc)` →
`{ type: 'ticket.field_set', payload: { fieldId: 'description', value: doc } }`
(`packages/editor/src/attachments/compose-editor-submission.ts:14,29`). The sheet hands the editor's own
composition straight to the envelope and does **not** re-spell the payload — a second
`{ fieldId: 'description' }` beside the composer that guarantees it is the duplication
`submitTransition` already warns about. No route is added. ⚠ **The dispatch's path for this file,
`packages/app-core/src/views/compose-editor-submission.ts`, does not exist**; the recon had it right.

### The case

- ✅ **13.989 — the description is editable on the door that already exists.**
  `packages/app-core/test/views/ticket-sheet.test.tsx`, six arms. It draws the row **on a ticket that
  has never carried a claim** (with a control asserting the fixture really has none, so the arm cannot
  pass on a ticket that happened to have one); it draws it **once**; the submission reaches
  `dataSource.ingest` as `ticket.field_set` with the payload asserted by `toEqual`, not `toMatchObject`;
  the claim line **moves** onto the actor who wrote it; **with no `editorSlot` the fallback renders and
  offers nothing to type into**; and the editor's own failure reaches an alert instead of being
  swallowed.
  **Mutation-witnessed five times, each killing the arm it names:** mounting the editor only when a
  claim exists (kills arm 1, plus four siblings that share the no-claim fixture — expected for a
  structural mutation); `readOnly` hardcoded true (arm 1); `submit` dropped (arm 3); `onError` dropped
  (arm 6); the loop's dedup guard deleted (arm 2). Every run printed the file's sha before and after,
  and the file was restored byte-identical.

#### ⚠ One arm was written as a check that could not fail, and the mutation is what caught it

The dedup arm's first fixture carried only `title`/`dueDate` — **no description claim** — so the loop
never saw a `description` key, the guard was never reached, and `toHaveLength(1)` passed with the guard
deleted. It stayed GREEN while a *different* arm caught the mutation incidentally on a duplicate-testid
error. The fixture now carries a claim, and the guard's deletion reddens the arm that names it.
**A case whose fixture cannot reach the branch it is about is a case that reports one thing and
measures another.**

### What is NOT covered, named rather than implied

- **Attachment paste inside the composer is refused, not wired.** The editor's upload capability
  (`uploadAttachment`/`emitAttachmentAdded`) is NOT supplied, so a dropped file is refused through
  `onError` with the editor's own sentence and rendered in a new `gn-refusal--editor` slot — the third
  distinct fact, given its own slot for the reason Ruling 27 gives the other two (`--server` = the
  authority adjudicated; `--transport` = nothing came back; `--editor` = nothing was sent). **This
  depends on case 9.59's open client half** (`uploadAttachmentHttp`, zero coverage) and does not close
  it. The `attachments` list and the visibility editor are untouched, per the dispatch.
- **A REFUSED roster makes `@` say "No people match".** `queryUsers` is wired off the roster the sheet
  already reads, and `mention-popup.ts:100` renders a count from whatever comes back — so over a
  refused or not-yet-loaded roster the popup states a falsehood about the workspace, **the same
  collapse the assignee row was built to refuse (#530)**. It is kept deliberately: leaving `queryUsers`
  unwired reaches the identical `[]` through the slot's own `NO_MENTIONS`, so `@` would say it on every
  keystroke instead. **Named owner: whoever next widens `EditorSlotProps.queryUsers`** — the interface
  has no way to express "the roster is unavailable".
- **`canEditDescription` is not an authority check, and must not become one.** It answers one question
  — *is a real composer mounted* — because the ingest door is the only party that knows who may write
  (the argument `canSetVisibility` states at length). **The `readOnly` it produces in the fallback
  branch is unobservable by construction**, since `PlainTextEditorSlot` ignores every prop; the true
  branch is what the mutation kills.
- **No browser run yet.** The dispatch asks for one (*"a typed change survives a reload … the
  `set by {actor} on {date}` line moves"*) and it is owed.
