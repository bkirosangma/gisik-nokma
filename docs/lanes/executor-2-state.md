# Executor 2 — live state

**This file is executor 2's restart surface.** Executor 1's is `docs/lanes/executor-state.md` —
**never write that one.** Two writers on one file produce a conflict on every landing.

> **Warning about shas in narrative prose.** Every sha cited in any *narrative* document — the dispatch
> brief, the coordination doc, this file's prose — is a fact about the moment it was written. Verify an
> anchor with `git branch --contains` (empty output = orphaned; `git cat-file` passes on reflog-only
> commits and hands you pre-rebase content while looking like it worked).

> **Never pipe a test or build run into `head`.** It orphans the vitest fork pool at `ppid=1`, ~1 core
> each, growing — measured at 22.4 GB and a forced restart on 2026-09-04. Use `| tail -N` or
> `> /tmp/x.log 2>&1` then read the file. A machine-local `PreToolUse` hook refuses the piped form.

> **This session runs on the DeepSeek backend.** Every model alias resolves to `deepseek-flash[1m]`;
> the brief's model/effort tiers are void here, but no review step is skipped because of it.

> **TOOL HAZARD — `rtk git log` IGNORES its revision argument and logs HEAD instead**, intermittently,
> and both outputs are well-formed. **Use `/usr/bin/git` for every git command whose output is evidence.**

---

## ▲ TOP BLOCK — `isTypeEditor`: fields gain `required` (2026-09-18)

**Position: the change set is COMPLETE, the review round is CLOSED, the branch is
REBASED onto `main`, and PR #447 is open and awaiting the controller's merge.**
Dispatch: `CTL-DISPATCH-2026-09-18-exec2-typerequired`, then
`CTL-EXEC2-2026-09-18-rebase-447`. Owner ruling behind it: decision-list item 1,
**"1 - yes"** (2026-09-18). One PR, `--base main`, branch `exec2/type-required`.

**The review round returned: NO Critical, NO Important, six Minor — and four of
the six were defects in THIS CHANGE'S OWN DOCUMENTATION rather than in its code.**
All six are fixed or recorded, and two new cases came out of it (13.786, the
ingest-door witness, which the reviewer correctly identified as the case worth
spending and which `parseEvent`'s existing `roundTrips` assertion made nearly
free). Details in § "The review round" below.

### Anchors — verify these; do not trust the row

| | |
|---|---|
| branch | `exec2/type-required` |
| base | **`488bfb2d`** = `origin/main` = the `#446` merge (executor 1's second-wave Task 4, the row drag) |
| `origin/main` | `488bfb2d` at the last count — **recount; main moves without telling you** |
| merge-base | `488bfb2d` |
| ahead | **6** commits (`origin/main..HEAD`) |
| behind | 0 |
| tree | clean (`git status --porcelain` empty) |
| HEAD | **verify with `/usr/bin/git rev-parse HEAD`.** A block cannot contain the commit that carries it, so any number here names an ANCESTOR, never the tip |
| PR | **#447**, `--base main`; reviewer pass recorded in the body BEFORE it opened |

### ⛔ THE PRE-REBASE SHAS ARE ORPHANED. DO NOT CITE THEM.

`5212a2f7` (the frozen head PR #447 first opened at), `d56fca85` (the commit the
reviewer actually ran against), `be237c73`, `27427836`, `51d78f93` and
`e292c2e2` were all orphaned by the rebase onto `488bfb2d`. **`git cat-file`
still resolves every one of them — it passes on reflog-only commits — and
`git branch --contains` returns nothing.** That asymmetry is why this warning is
here rather than left to a reader to discover. `5212a2f7` survives only as the
local safety ref `backup/exec2-type-required-preRebase-5212a2f7`, which is NOT
pushed and must not be relied on by anyone else.

### § 0 — THE REBASE (2026-09-18), AND WHAT IT COST

Executor 1's Task 4 (#446) merged to `main` as `488bfb2d` while this change was
open, so PR #447 went CONFLICTING. **One file conflicted:
`test-cases/13-deployment-dogfooding.md`, both sides appending at EOF** — the
same shape, and the same file, as this lane's previous rebase. `Features.md` and
`packages/ui/src/ui.css` auto-merged.

**Resolved by union, and the audit is the part worth keeping.** Every line the
PEER added to the catalogue (200 of them, `d069fd94..488bfb2d`) is present in the
final tree — **0 absent** — and every line THIS change added (188) is present
too — **0 absent**. The positive control is what makes that a measurement rather
than a probe that cannot fire: the same probe run against a tree without the
resolution reports **178 of the peer's 200 absent**.

**And the control earned its keep twice in one sitting.** The first run of the
preservation command returned `0` — for BOTH the measurement and its control,
which is impossible if the probe works. Cause: **zsh does not word-split an
unquoted `$PATHS`**, so the whole variable was passed as ONE pathspec matching
nothing. Both zeros were vacuous. Re-run with the paths spelled out, the
measurement is `0` and its control is `22`. **A control that does not fire when
it should have is the same defect as one that fires when it should not** — and
this is the zsh trap this project has recorded before, caught here only because
the control was run in the same invocation as the measurement.

**What survived the rebase, stated as a command a reader can run.** Over the
source and test files the reviewed commit touches — the three merged files
(`Features.md`, `ui.css`, `test-cases/13-…`) excluded on purpose, since they
differ from the reviewed version by exactly the peer's content — expect **EMPTY**:

```
git diff d56fca85 caf1edec -- \
  packages/domain/src/ticket-types.ts \
  packages/domain/test/ticket-types.test.ts \
  packages/app-core/src/workflow-builder/ticket-types/fields-editor.tsx \
  packages/app-core/test/ticket-types/ticket-types.test.tsx \
  packages/app-core/test/workflow-builder/access.test.tsx \
  packages/app-core/test/online/online-data-source.test.ts
```

Positive control: the same command with
`backup/exec2-type-required-preRebase-5212a2f7` in place of `caf1edec` returns
**22 lines**, so an empty result is a measurement rather than a probe that cannot
fire. `caf1edec` is the rebased equivalent of the reviewed `d56fca85` — commit 1
of 6 on this branch.

### Verification at the REBASED head

Suites: **domain 506/0 · ui 324/0 · app-core 1492/0 · web 459/0 · server 1538/0**.
(ui and app-core are HIGHER than pre-rebase because main's Task 4 tests arrived
with the rebase.) Typechecks **11 of 12, exit 0**. Six checks plus
`check-case-ids.mjs` all raw **0**.

### ★ THE MEASUREMENT THAT DECIDED THE SHAPE — read this before re-scoping

**Nothing enforces a type-level `required` field today, and that is structural,
not budgetary.** The engine's only `require-field` is EDGE-SCOPED — a workflow
rule evaluated when a ticket crosses one transition
(`packages/rule-engine/src/rules/require-field.ts:5`, surfaced by
`packages/app-core/src/views/transition-dialog.tsx:216`) — answering *may this
move happen?*, not *does this type expect a value?*. `checkTicketFieldSet`
refuses a field absent from the type and a value of the wrong kind and accepts a
clear of any custom field unconditionally
(`packages/rule-engine/src/checks/fields.ts:148-155`). `ticket.created` reads no
fields at all.

**Why enforcement is a CAPABILITY and not a wiring job:** a type definition is
last-writer-wins with no superseded row kept
(`apps/server/src/projections/ticket-types.ts:39-46` — the omission is stated
there as deliberate). The engine therefore cannot answer *"what did this type
require when this ticket was created?"*, and no claim already recorded can be
retroactively refused. Marking a field required would place every existing ticket
of that type out of compliance. **Named absence, owner: the plan that takes up
type-level field enforcement.** It is recorded in `Features.md`, in the
catalogue section for `13.776`–`13.786`, and in the commit message — the dispatch
forbade shipping a silent no-op, and this is not one.

### What the wire actually cost

**Only the schema member and the toggle.** The path is transparent end to end:
`FieldsEditor.onChange` sets `def.fields` → `buildTicketTypeDefinedEvent` passes
the whole def as the payload (`workflow-builder/events.ts`) → the projector
`JSON.stringify`s the parsed fields into JSONB (`projections/ticket-types.ts:79`)
→ `readTicketTypes` returns them verbatim → `mapTicketTypes` casts them. **The
schema member is the one load-bearing change**: a zod object STRIPS an undeclared
key, so without it a `required: true` would have vanished at every parse site
(projection, offline replica, engine memory context) while the editor still
rendered "Required". Case 13.777 is that witness.

`required: z.boolean().optional()`, deliberately NOT `.default(false)` — matching
the `options` member directly above it. A default is applied AT PARSE, so every
definition recorded before today would come back claiming `required: false`, a
claim its author never made (the `p.value ?? null` defect class this series
already corrected, `rule-engine/src/checks/fields.ts:77-83`). **No migration is
needed because of that choice**, and absence stays distinguishable from `false`.

### ★ THE TRAP THAT COST TIME HERE — a stale `dist` produced a FALSE GREEN

The first app-core reading of the schema-removal mutation came back **GREEN and
was wrong**: `packages/domain/dist` was stale and app-core resolves
`@gisik-nokma/domain` **by package name** through it, so the mutation never
reached the suite. Rebuilt, the same mutation reddened 13.777 immediately
(`expected undefined to be true`). **The rule, restated because a green is the
direction nobody audits: after editing a workspace package's SOURCE, rebuild it
before believing ANY test result that consumes it — including a passing one.**

### Verification at this head

- Suites: **domain 506/0 · ui 322/0 · app-core 1485/0 · web 459/0**.
- `pnpm -r run typecheck`: **11 of 12 workspace projects, exit 0, zero errors**.
- Six checks plus the seventh instrument, all raw **0**: `check:env`,
  `check:tasks`, `check:db-tz`, `check:runbook`, `check:citations`, `check:help`,
  `scripts/check-case-ids.mjs`. (`check:db-tz` needs
  `DATABASE_URL=postgres://gisik:gisik@localhost:54329/gisik_nokma`.)
- **The forced gate was NOT run — the controller's.**
- **Ten** mutations run, each killed by a case specific to its own site: seven
  before the review — remove `required` from the schema (13.777);
  `.default(false)` (13.782 + an existing `toEqual`); the toggle never un-setting
  (13.778); `mapTicketTypes` dropping the member (13.784); the toggle never
  disabled (access.test.tsx `toBeDisabled`); `Remove field` leaking back to
  members (**access.test.tsx:610-615** — the one that proves the widened
  enumeration did not open a hole); and the schema member removed from a mutated
  **`dist`** (13.785, the real-Postgres round trip) — and **three after it**,
  each covering a review finding: the fixture truncated to one field (13.784's new
  `toHaveLength(2)` guard), the layout class removed (13.780), and the schema
  member removed so the **ingest door** strips it (13.786).
  Mutation 7 was run against `packages/domain/dist` **only**, with the source left
  pristine, precisely so the running reviewer's view of the tree could not change
  under it; `dist` is gitignored and untracked, and the file was restored from a
  backed-up copy and verified by SHA-256 (`9d5889c3…` before and after).

### ★ THE STRONGEST WITNESS, AND WHY IT IS NOT REDUNDANT WITH 13.784

The dispatch named the failure mode precisely: *the core plan's final review
found a flag dead in production while every view test drove a fake data source.*
Until case **13.785** this change had nothing that answered that at the level it
demands — every client case runs against a recording fetch or a fake gateway.
**13.785 writes through the real projector into a real `jsonb` column and reads
back through the real reader** (`apps/server/test/proj-ticket-types.test.ts:124`),
which is the only place the column's own round-tripping is exercised at all. Its
fixture is ONE decided field and ONE never-decided: an assertion on the first
alone would pass for a projection that defaulted every field to required, and the
second is asserted as key ABSENCE rather than falsiness.

### ★ ONE EXISTING CASE WAS WIDENED — and how it was proved not to go quiet

`packages/app-core/test/workflow-builder/access.test.tsx:567` asserts every
button a MEMBER is offered on the ticket-type editor is an icon choice or a gated
Field-type control, all disabled — a gate-coming-down check. The new toggle is a
**twentieth** button on that render (16 icon choices + 2 Field-type triggers + 2
toggles — measured, not estimated; `Object.keys(TYPE_ICONS)` is 16 and
`'file-text'` is a QUOTED key a naive sweep misses), so the predicate now names
it. **It belongs in that set by the test's own taxonomy:** a value control on the
DEFINITION like the Field-type trigger, not a collection action like
`Remove field`. That taxonomy is also why showing it **disabled** beats hiding it
— a member still learns which fields are required. The third term is enumerated
with its own count (2, one per fixture field) rather than folded into a
catch-all, and the `Remove field` mutation above still reddens the predicate.

### ★ THE REVIEW ROUND — no Critical, no Important, and four of six Minor were MY OWN DOCUMENTATION

An independent reviewer ran against `d56fca85`. **The headline finding is that the
central claim survived an attempt to refute it**: it searched for any enforcement
point for a type-level `required` — `\.required\b`, `requireField`, `required=`,
every `CustomFieldDef` consumer — opened the two that could have enforced it
(`checks/fields.ts:29-59`, `rules/require-field.ts:5-18`), and confirmed the
absence is real and the flag is carried end to end with no hop dropping it. It
also measured the zod semantics the design rests on against the repo's own zod: a
schema without the member strips it, `.optional()` keeps absence absent,
`.default(false)` materialises it — i.e. **the two states the design distinguishes
really are distinguishable**, which was the claim with the least obvious proof.

**Then it attacked the instruments and found four things wrong with what I WROTE,
not with what I shipped:**

1. **A FABRICATED FIGURE.** "The new toggle is a ninth button on that screen"
   matched no reproducible count. It is **twenty** (16 icon choices + 2 Field-type
   triggers + 2 toggles). I had invented "ninth" the way a plausible number gets
   invented — it sounded like the right size for a screen with a few controls, and
   nothing I ran would have contradicted it. **The reviewer's own first count of
   the icon set was 15, wrong because `'file-text'` is a QUOTED key a naive
   key-sweep cannot see** — it caught its own instrument and said so, which is the
   behaviour this file's §32 exists to record.
2. **A WRONG CAUSE ATTACHED TO A RIGHT VERDICT.** The widened access predicate's
   comment claimed the toggle was "already covered by the sweep above". Measured
   FALSE: `valueControls()` returns the same eight members with the toggle present
   as without it. The verdict stood; the reason did not. **A wrong cause is how a
   real hole gets read as covered later**, so it was corrected rather than left.
3. **A VACUITY HOLE ONE FIELD WIDE.** 13.784's absence half was
   `'required' in (fields[1] ?? {})` — which answers `false` for a response
   TRUNCATED to one field, because `?? {}` hands it a fresh empty object. A
   `toHaveLength(2)` guard now precedes it, mutation-proved (mutation 8).
4. **AN INCOMPLETE LIST THAT LED WITH THE WRONG SITE.** The schema docblock named
   the projection, the replica and the memory context as the parses a strip would
   hit. **All three are READS. The door is `parseEvent`, and it comes first** —
   it stores the schema's OUTPUT (`parse-event.ts:177`, `payload.data`), so a
   member the schema does not declare is stripped BEFORE the event is ever
   recorded. The docblock is corrected and **13.786 is the resulting witness**,
   added at near-zero cost because `roundTrips`' existing
   `result.event.payload).toEqual(payload)` already asserted exactly this.

The other two: the new `ui.css` rule `flex: none` is pinned by no test — true, and
now **stated outright in that rule's own docblock** rather than implied away
(its `.fields-editor__add`/`__row` siblings are in the same position, so it is not
a regression; 13.780 now pins that the component applies the class at all, and
mutation 9 proves that assertion can fail). And no server-side case witnessed the
door — which 13.786 now does.

**What the review did NOT find is worth as much as what it did:** it could not
construct a member-visible authoring control that leaves `access.test.tsx` green
(it verified that jest-dom's `toBeDisabled` rejects an `aria-disabled`-only
control rather than being satisfied by it), and every `file:line` citation it
opened said what the citing text claimed. **Recorded because a clean review
reported as clean is the only kind of clean review worth anything.**

### Two deviations from the prototype, both stated

1. **The tinted pill is NOT ported.** `--tintAccent` has no product role
   (`tokens.ts:342-344`, `tintWarning` is the only tint role) — the same refusal
   `isBuilder` recorded for `--tintDanger`/`--tintSuccess`. The states are the
   shared `.gn-button--primary`/`--ghost` variants, so both grounds are pairs the
   contrast audit already carries; `ui.css`'s `.fields-editor__required` is
   **sizing only**.
2. **The pill sits at `.gn-button`'s 2.75rem**, not the prototype's 32px —
   matching the name input and Remove button beside it in the same row.

### Recorded, not fixed (out of scope, named owners)

- **`.fields-editor__row`'s accessible names are not field-specific.**
  `Remove field` is already the same on every row (`access.test.tsx:640` asserts
  exactly two of them for an admin; `:621` asserts the member sees none), and the
  new toggle follows that convention ("Required" / "Optional", static). A
  screen-reader user tabbing two fields hears the same two names twice. **Owner:
  whoever next owns accessible names on this screen** — fixing it here would
  diverge from the neighbouring control and is a row-wide change, not this
  flag's.
- **The prototype's field kinds differ from the product's** (it offers
  Text/Date/Number/Attachment; `CUSTOM_FIELD_KINDS` is
  text/number/date/select/person). Pre-existing, untouched by this change.

### Rules that bind this branch
- **Never `docker compose`** (any subcommand) and **never bind `:3001`** — a
  peer's hot stack is there. Viewport work would use `:3021`. **No viewport run
  was attempted**: the ticket-type editor is not in
  `apps/web/e2e-viewport/responsive.spec.ts` and not in the accessible-names
  baseline (both keyed by route), so a run would prove nothing about this screen.
- Test runs at `--maxWorkers=1` (**not** `--concurrency` — that is not a vitest
  flag). Do not run the forced gate — the controller does.
- **Do not edit `task-ledger.tsv`** — it is `main`'s; the controller flips rows.
- `Features.md` and `test-cases/13-deployment-dogfooding.md` change in the
  **same commit** as the code.
- **Never `AskUserQuestion`** in this topology.

---

## ▼ PREVIOUS BLOCK — `isBuilder`: fit the design to the backend that exists (2026-09-18). MERGED as PR #445 (`d069fd94`).

**Position: the change set is COMPLETE, the review round is CLOSED, the branch is REBASED onto `main`,
and the PR is open and awaiting the controller's merge.** Dispatch:
`CTL-DISPATCH-2026-09-18-exec2-isbuilder`, then `CTL-EXEC2-2026-09-18-rebase-445`. One PR, `--base main`,
branch `exec2/isbuilder`.

### Anchors — verify these; do not trust the row

| | |
|---|---|
| branch | `exec2/isbuilder` |
| base | **`fb346a9f`** = `origin/main` = the `#444` merge (executor 1's Task 3, the rank column) |
| `origin/main` | `fb346a9f` at the last count — **recount; main moves without telling you** |
| merge-base | `fb346a9f` |
| ahead | 3 commits — a reading, not a fact; `git rev-list --count origin/main..HEAD` |
| tree | clean at the last check |
| HEAD | **verify with `/usr/bin/git rev-parse HEAD`.** A block cannot contain the commit that carries it, so any number here names an ANCESTOR, never the tip |
| PR | **#445**, `--base main`; reviewer pass recorded in the body BEFORE it opened |

### ⛔ HISTORICAL — this block is CLOSED. Do not re-run its commands.

**MERGED as PR #445 into `d069fd94`.** Everything below is kept for the method it records; none of it is
work outstanding. Two of its shas are orphaned and one command in it is now MISLEADING — read this
before copying anything out of it.

`de6d2fa8` (the change set, and the head the reviewer ran against), `7fb68f3b` (the fix round) and
`b3a7bdef` (the previous freeze) were orphaned by the rebase onto `fb346a9f`. **`git cat-file` still
resolves all three — it passes on reflog-only commits — and `git branch --contains` returns nothing.**
That asymmetry is the reason this warning is here rather than left to a reader to discover.

> **⛔ DO NOT RUN THE PRESERVATION COMMAND BELOW NOW.** It was written when `HEAD` was the isBuilder
> branch tip. `HEAD` is no longer that branch, so the command returns a large diff for a reason that has
> nothing to do with lost work — a well-formed wrong answer of exactly the kind this file keeps
> recording. If the question is ever reopened, address the merge commit explicitly
> (`d069fd94`) rather than `HEAD`.

**The command as it stood, preserved only so its shape is readable — expect EMPTY only against the
isBuilder tip:**

```
git diff b3a7bdef HEAD -- \
  packages/app-core/src/workflow-builder packages/app-core/test/workflow-builder \
  apps/web/test/builder-route.test.tsx apps/web/app/globals.css apps/web/app/w \
  packages/ui/src/ui.css
```

Positive control: the same command with `de6d2fa8` in place of `HEAD` returns 86 diff lines, so an empty
result is a measurement rather than a probe that cannot fire. The two shared narrative files are excluded
on purpose; they differ by exactly the peer's content.

### The three rebased commits

1. **`6e7132b1`** — the change set (the rebased equivalent of the reviewed head).
2. **`ee7ee37a`** — the review fix round. **No production code and no CSS rule changed between commits 1
   and 2 in the pre-rebase series**, verified by hashing both stylesheets with comments stripped
   (`2daa369d…` and `bc83037a…` identical, positive control: the test file that did change hashes
   differently). Tests, docs and CSS *comments* only. That is what decided no second full review was owed.
3. **`f9013392`** (or its successor) — this handoff.

### § 0 — THE REBASE (2026-09-18), AND THE TWO THINGS IT TAUGHT

One conflict, `test-cases/13-deployment-dogfooding.md`, both sides appending at EOF. **Resolved by
union**: executor 1's reconciliation note + Task 3 section (`13.702`–`13.704`) first, then this change's
section (`13.767`–`13.775`). A second conflict on the same file, over ONE line — this change's own fix
round correcting its section header — resolved by taking the later commit, which is intra-stream
supersession and not a union.

**(a) MY FIRST UNION AUDIT WAS BROKEN AND ITS CONTROL STILL FIRED.** It compared every added line from
both diffs against a SINGLE file and reported 708 and 1144 "missing". The control fired correctly — the
probe was fine, the **universe was wrong**. Per-file, the numbers are 0 of 868 and 0 of 1729.

**(b) A GENERIC "TAKE THEIRS" RESOLVER NEARLY DESTROYED THE PEER'S WORK.** At the second conflict, `ours`
held executor 1's **entire 99-line section**, not the single conflicting line; a script that kept the
incoming side discarded all of it. Caught immediately, `git checkout --merge` restored the conflicted
state, and the corrected resolver **asserted both sides' content before writing**.
**"Take theirs" is only safe when `ours` is known to be the single conflicting line — and the way to know
that is to look at the block, not to infer it from the marker count.**

**(c) A STALE `dist` MADE `apps/web`'s TYPECHECK FAIL AT THE REBASED HEAD — for six errors, all in
executor 1's files.** `domain/dist` was built 09:27 and `app-core/dist` 08:44, both before the rebase
pulled main's `rank` source in, so `tsc` resolved the OLD types and reported `TS2353: Object literal may
only specify known properties` on `backlog-start`, `backlog-tab`, `board-narrowing`, `filters-sheet`,
`project-calendar-timeline` and `project-create-gate`. **The suites passed with that same stale `dist`**
— which is the asymmetry worth remembering: `vitest` and `tsc` resolve a workspace package differently.
`pnpm -r --filter './packages/*' run build` fixed it; the typecheck then exits 0. **This is the second
recurrence of the trap this file documents above; any red on a freshly-rebased tree is re-measured after
rebuilding the workspace packages BEFORE it is reported as a defect.**

### What shipped, and the measurement it rests on

The owner's instruction was *"workflow-builder is there for design reference only. if the backend is
already built, then make the design just fit for it."* **The backend is built** —
`WorkflowBuilderScreen` at `/w/[workspaceId]/settings/workflows/[workflowId]`, ten plan-08 tasks deep.
What was missing is the **design**: `workflow-builder-screen*`, `state-inspector*`, `inspector-panel*`
and `transition-inspector*` had **ZERO CSS** and rendered with user-agent defaults. Measured with a
control: the same sweep finds 7 rules for `.issues-panel`, 11 for `.publish-controls`, 15 for
`.gn-state-node`, 40 for `.ticket-type-editor`.

**Files:** `packages/ui/src/ui.css` (new block), `apps/web/app/globals.css` (the crumb),
`packages/app-core/src/workflow-builder/ui/{workflow-builder-screen,state-inspector,transition-inspector}.tsx`,
`apps/web/app/w/[workspaceId]/settings/workflows/[workflowId]/page.tsx`, plus `Features.md`,
`test-cases/13-…` and two new test files.

### § 1 — THE SETTINGS-PAGE CONTENTION DID NOT MATERIALISE.

`apps/web/app/settings/page.tsx` is **untouched** — verified by `git status --porcelain`, not by
reading the diff summary. The builder's screen is `WorkflowBuilderScreen` in `packages/app-core` plus
its own route page; the `/settings` shell only *links* to that route (`WorkspaceWorkflows`'s `onOpen`),
and the docblock there says in its own words why the builder is the one sub-screen not inlined into it.
**`apps/web/app/globals.css` IS shared and I did append to it** — the crumb block, at EOF, which is the
lowest-collision shape available.

### § 2 — FOUR REFUSALS, EACH WITH A PRIOR RULING OR A MEASUREMENT BEHIND IT.

1. **The prototype's two-column layout — NOT adopted.** It has no left column at all; adopting its grid
   would delete `SystemRulesPanel` and the whole rule-authoring subsystem.
   `docs/hig-reconciliation-audit.md:690-712` already rules those *"EXISTS AND THE PROTOTYPE OMITS IT.
   Keep and restyle; never delete"*, closing *"both must be treated as requirements to preserve, not
   redesign away."* Three rails.
2. **`wfStatus` ("Draft · last saved 11:58") and the header `Cancel` — NOT built.** `wfStatus`,
   `lastSaved` and `last saved` are 0 hits repo-wide; there is no state to render.
3. **The inspector's consolidated card — NOT built** (Category select, "Blocks the ticket" toggle,
   "Initial state" switch). Category and Blocked live on the STATE NODE; `hig-reconciliation-audit.md:703-708`
   already ruled that card *"SHOWN BUT DOES NOT EXIST. Do not build."*
4. **The prototype's `--tintDanger`/`--tintSuccess` washes — NOT adopted.** `tokens.ts:201-202`/`:342-344`:
   `tintWarning` is the only tint role this product has.

**The workflow name is the title and stays an editable `<input>`.** The prototype draws an `h1`. The
product's name is editable; a heading carrying the same string would put one name in two elements and
make `getByText(name)` ambiguous for every later test. So the prototype's `34px/41px/700/-0.4px` is
applied to the field — **via `.gn-page-title`'s own four declarations, read from
`apps/web/app/globals.css:127`, never re-derived** — and the field KEEPS its boundary, because a control
that looks exactly like static text is not editable-looking. **Flagged in the PR body as a deviation.**

### § 3 — TWO MEASUREMENTS THAT CHANGED THE CODE.

1. **`danger`-as-text measured 4.40 on `surface` under `hig`/`minimal` light — below 4.5.** The load-error
   paragraph therefore uses `--gn-text`, not `--gn-danger`. Four rules upstream already ship that pairing
   and it has no `CONTRAST_PAIRS` row at all (recorded pre-existing); this is not a fifth. Measured with
   the repo's own `colorOf` at `/tmp/contrast.mjs`, not estimated.
2. **apps/web's jsdom setup cannot mount the React Flow canvas.** `ReferenceError: ResizeObserver is not
   defined` inside React Flow's own `<ZoomPane>` — the root unmounts and the container comes back **EMPTY**,
   which reads as "the page rendered nothing" rather than as a missing global. Shimmed LOCALLY in
   `apps/web/test/builder-route.test.tsx`, deliberately **not** in `apps/web/test/setup.ts`: copying
   app-core's measured 170-line block would put a second copy in the tree to keep in sync, and changing
   shared setup would alter jsdom for every apps/web suite to serve one assertion. If a later apps/web
   suite needs the canvas, **promote this block into `setup.ts` rather than copy it a third time.**

### § 4 — MUTATION EVIDENCE (and the two that correctly did not count).

Killed: renaming the base `__canvas` and `__layout` rules · deleting the `__name:focus-visible` rule ·
removing the `neo` override · planting a hex literal (against `packages/ui`'s token-discipline suite) ·
deleting the crumb · splitting it into two links · pointing its href at the wrong route · a genuine
reword of the link text.

**Two mutations were run and did NOT redden, and the distinction is the point:** rewording the link text
to the `&rsaquo;` ENTITY (same glyph, identical rendered output), and a first attempt aimed at
`Settings › Workflows` that hit **the docblock's copy of the string instead of the JSX** — perl `s///`
without `/g` replaces the first occurrence in the slurped file, and the docblock quotes the same sentence.
A survivor with no explanation is either an unconstrained path or a mutation that never ran; both were the
second, and each was re-aimed until it was a real change.

**The name-equality test had a REAL hole and the mutation found it.** Renaming
`.workflow-builder-screen__canvas` to `…__canvasRenamed` left the whole file GREEN, because the
`@media (max-width: 64rem)` rule below still names `__canvas` in `{ order: -1 }`, so the class-name sweep
went on harvesting the name while the card treatment was gone. That is case **13.771**'s entire reason to
exist — a declaration-level table, in the shape `saved-filters-css-binding.test.tsx`'s 11.119 already
established.

### § 5 — CASE IDS: MY BLOCK IS `13.760`–`13.819`. USED `13.767`–`13.775`.

**The next free id inside my block is `13.776`.** Recount by case MARKER only, never by substring — the
block `13.767`–`13.819` was measured free before minting, and every hit in that measurement was prose
*mentioning* the block's own bounds, which is exactly the trap this file records.

Members used `13.760`–`13.766`. **The highest `13.*` marker in `test-cases/13` at the frozen tip is
`13.775`**; the highest `13.*` id anywhere in `packages/` + `apps/` is `13.775`. If more than 60 ids are
needed, **stop and ask** — do not run past the block.

### § 5b — THE REVIEW ROUND, AND WHAT IT FOUND THAT MY OWN TESTS COULD NOT.

An independent reviewer ran at `de6d2fa8`: four Important defects, all fixed; nine Minor. **Three were my
instruments being blind in ways their own names did not admit** — deleting `gn-field__input` survived the
whole app-core package; the role sweep was **digit-blind** (`var\((--gn-[a-z-]+)\)` cannot see
`--gn-ink-2`); and case 13.771's recorded **cause** for the hole it closes was simply wrong — the harvest
regex `[a-z][a-z0-9_-]*` **stops at the first uppercase letter**, which is why a mixed-case rename
survived, not the media-query cross-talk I wrote down. The fourth was a **fabricated obstacle**: I
justified refusing the prototype's `h1` with a `getByText` ambiguity the reviewer refuted by probe.

**The lesson worth carrying: a check's NAME is not its instrument.** All three instrument defects were
invisible until something aimed at the exact shape the instrument could not see, and each was found by a
party who did not write it. The corrected regexes are `[A-Za-z]` and `[a-z0-9-]`.

### § 6 — WHAT IS *NOT* COVERED, NAMED RATHER THAN IMPLIED.

- **The viewport suite does not cover this screen.** `apps/web/e2e-viewport/responsive.spec.ts` covers
  `/help`, `/privacy`, `/terms`, `/sign-in` and a 404 probe; the builder route is not in it and neither is
  the accessible-names baseline. **No viewport run was attempted** — running it would prove nothing about
  this screen, and the hot stack on `:3001` is executor 1's.
- **The builder screen renders no `<h1>` at all.** The prototype's h1 is the product's editable name
  field. Asserted as an absence (13.770) and **flagged in the PR body** rather than papered over with a
  duplicate string. A heading-structure gap on this one route; the owner is whoever next owns a11y
  heading work.
- **The prototype's `--tintDanger` washes mean `.issues-panel`'s existing `danger` left rule stays.** A
  real, visible divergence from the drawing, recorded in ui.css's own docblock.

### § 7 — OUT OF SCOPE, RECORDED WITH A NAMED OWNER (not fixed).

- **`.workflow-list__*` has NO CSS either** — swept with a control (one hit repo-wide, and it is a
  *comment* in `apps/web/app/globals.css:44` listing `.workflow-list__new` among "unclassed-control
  offenders"). It belongs to the delta audit's `isWorkflows` row
  (`docs/design/prototype-delta-2026-09-18.md:627`), **not** `isBuilder`, and the workflow LIST screen is
  a different route. **Owner: whoever next picks up `isWorkflows`.**

### Rules that bind this branch
- **Never `docker compose`** (any subcommand) and **never bind `:3001`** — a peer's hot stack is there.
  Viewport work would use `:3021`.
- Test runs at low concurrency — **`--maxWorkers=1`**, not `--concurrency` (that is not a vitest flag).
  **Do not run the forced gate** — the controller does.
- **Do not edit `task-ledger.tsv`** — it is `main`'s; the controller flips rows after each merge.
- `Features.md` and `test-cases/13-deployment-dogfooding.md` change in the **same commit** as the code.
- **Never `AskUserQuestion`** in this topology. A question for the owner is a file plus a one-line
  pointer, then a hold.

---

## ▼ PREVIOUS BLOCK — Members + InviteAdmin. MERGED as PR #443 (`ba96a8d2`).

Kept because § 5's id arithmetic and the two method traps below are still the ones that bite.

**Makes the ledger's `hig-per-screen/3a` and `/3b` true — except see the scope caveat.** The owner lifted
the sign-in hold on 2026-09-18 (*"4 - yes"*).

### § 1 — THE ROLE QUESTION: ANSWERED. Case 1, on the wire, dropped by the mapper.

- **On the wire:** `apps/server/src/routes/builder-reads.ts:247` selects `m.role`; `:256-260` returns
  `{ userId, displayName, role }`; typed at `packages/domain/src/read-models.ts:547`.
- **Dropped in the client:** `packages/app-core/src/online/mappers.ts:395-410` — `mapActors` mapped
  `{id, name}` only.
- **Independently corroborated in-repo:** `apps/web/src/authoring/data-source-gateway.ts:70-87`.

### § 2 — RULED 2026-09-18 (controller). Every answer confirmed the proposal; nothing was reworked.

1. **`role` carry — proceed.**
2. **The four unbacked columns — do NOT build, do NOT fake, name them as absences.** *"A prototype
   drawing is not a requirement."*
3. **The role `<select>` — DO NOT BUILD.** Render the read-only chip; the missing last-owner guard means
   it would let an admin demote the sole owner.
4. **`hig-per-screen/3a` stays `todo`.** Claim in the PR body exactly what ships.

### § 3 — SCOPE CAVEAT
Four unbuildable columns mean **3a is true only for the backed surface.**

### § 4 — TWO METHOD TRAPS THIS BLOCK PAID FOR, STILL LIVE.

1. **A substring sweep over a document that DISCUSSES the ids cannot separate a MINTED id from a
   MENTIONED one.** Count case MARKERS only (`^- ✅ **13.…`). `scripts/check-case-ids.mjs` self-tests
   this trap ("prose citation excluded"); the hand sweep did not. It fails silently in the
   over-estimating direction.
2. **`git grep` with a pathspec of `'packages/*/test' 'apps/*/test'` returned EMPTY on a tree that has
   hundreds of matches** — an eaten glob, the silent-empty mode. It only showed up because an
   un-pathspec'd control fired on the same input. **Every sweep needs its positive control through the
   same invocation.**

`13.999` is a documented truncation trap in file 13, not an id
(`test-cases/13-deployment-dogfooding.md:23,2406,4680,7273`). The `3.129`–`3.139` ids in
`apps/web/test/members-page.test.tsx` are a **different numbering line** — never renumber them.

### § 5 — THE STALE-`dist` TRAP (a false RED on a rebased tree).

After the Members rebase, `app-core` went RED with `TypeError: Cannot read properties of undefined
(reading 'safeParse')` at `packages/app-core/src/precheck.ts:373`. **Not a defect — a STALE `dist`.**
`precheck.ts` imports by package name, which resolves through `packages/domain/dist`, built before the
rebase pulled the new domain source in. `pnpm --filter @gisik-nokma/domain build` fixed it; the same trap
bit `@gisik-nokma/rule-engine`. **Any red on a freshly-rebased tree should be re-measured after rebuilding
the workspace packages before it is reported as a defect.**
