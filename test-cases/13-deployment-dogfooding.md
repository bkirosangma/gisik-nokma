# 13. Deployment & dogfooding — test cases

Mirrors `Features.md` §13. Status: `❌` not covered · `✅` covered · `🟡` partial · `🧪` manual · `🚫` out of scope (with reason).

## This file is the INDEX — the catalogue is split into part-files (2026-09-19)

It was one file of **12,722 lines, 775 case ids and 97 `## ` sections**. **106 commits touched it in the
24 hours to 2026-09-19 alone** (263 in all), so it conflicted on essentially every merge pair. **No id was
renumbered and no case text was edited**; of the 12,638 moved body lines, **exactly one differs from the
original** — a citation re-point, forced by the move: the pointer that named line 5424 of this file now
names line 1172 of `13-board-prototype-port.md`, as the shift map below records. Every other line moved
out verbatim. The id-block allocation header follows below and is still the authority for which block a
lane may mint from.

| part-file | holds | its sections sat at |
|---|---|---|
| [`13-deploy-and-ops.md`](./13-deploy-and-ops.md) | Deploy, seed, backups and shutdown | old lines `85`–`457` |
| [`13-plan11-seams-and-scheduler.md`](./13-plan11-seams-and-scheduler.md) | Plan 11 seams and the scheduler generalisation | old lines `458`–`1032` |
| [`13-pre-launch-checklist.md`](./13-pre-launch-checklist.md) | The test-citation check and the pre-launch checklist | old lines `1033`–`1775` |
| [`13-hig-per-screen.md`](./13-hig-per-screen.md) | The HIG palette and the per-screen plan | old lines `1776`–`2281` |
| [`13-neomorphism-and-workspace-screens.md`](./13-neomorphism-and-workspace-screens.md) | The neomorphism amendment and the workspace screens | old lines `2282`–`4258` |
| [`13-board-prototype-port.md`](./13-board-prototype-port.md) | The board-prototype-port plan | old lines `4259`–`5851` |
| [`13-owner-requests-and-backlog.md`](./13-owner-requests-and-backlog.md) | Owner requests, backlog and closed | old lines `5852`–`7743` |
| [`13-step-audits-and-catalogue-hygiene.md`](./13-step-audits-and-catalogue-hygiene.md) | Step 2c/4b/5a audits and catalogue hygiene | old lines `7744`–`8399` |
| [`13-second-wave-board-actions.md`](./13-second-wave-board-actions.md) | Second wave: board actions, members and roles | old lines `8400`–`10242` |
| [`13-second-wave-roles-and-navigation.md`](./13-second-wave-roles-and-navigation.md) | Second wave: roles review, navigation, members styling | old lines `10243`–`11744` |
| [`13-settings-and-workflows.md`](./13-settings-and-workflows.md) | settings -> workflows | old lines `11745`–`12722` |

**Where a new case goes.** Into the part-file whose topic it belongs to — not here. Id allocation is
unchanged: recount the maximum in use before minting, and never renumber a landed id.

**Five sentences in the header below point at sections that have moved** — recorded here rather than
rewritten, because they are part of that header's own dated record. Two name *this file*: *"the block's own
note at the end of this file"* (Step 1's hot-reload note, now in `13-step-audits-and-catalogue-hygiene.md`)
and *"the sign-in bucket (see that section at the foot of this file)"* (now in
`13-pre-launch-checklist.md`). Three say *below* and mean a run of sections, not the header: *"Tasks 7–8
below"*, *"the Task 14/15 section below"* and *"the Tasks 7–10 sections below it"* — all three now in
`13-deploy-and-ops.md`. One further *below* is still correct: *"Both readings below are ways that recount
goes wrong"* means the two bullets directly under it, which did not move. The remaining "this file"s in the
header mean the BUCKET, and the bucket's allocation still lives here.

### Shift map for line-precise citations

**Seven** line numbers were cited as `13-deployment-dogfooding.md:NNN` before the split, from seven sites.
Their targets are:

| cited line | now |
|---|---|
| `23` | `13-deployment-dogfooding.md`:84 — the header, now below this index block. **Re-measure this one if the block above changes length**: it has moved twice already, both times because this file's own prose was edited. |
| `274` | `13-deploy-and-ops.md`:196 |
| `2406` | `13-neomorphism-and-workspace-screens.md`:131 |
| `4680` | `13-board-prototype-port.md`:428 |
| `5424` | `13-board-prototype-port.md`:1172 |
| `7273` | `13-owner-requests-and-backlog.md`:1428 |
| `8638` | `13-second-wave-board-actions.md`:245 |

All seven sites were re-pointed. Two references were deliberately **left alone**. The range citation
`test-cases/13-deployment-dogfooding.md:1-3` (in `docs/superpowers/plans/2026-09-07-mcp-server.md`) still
resolves, because the header stayed here. And the string `13-deployment-dogfooding.md: 485 cited` in
`13-owner-requests-and-backlog.md` is a **quoted run of `check-case-citations.mjs`** recorded on 2026-09-17,
not a citation — re-pointing it would falsify a record of what the checker printed.

---


**Numbering, and why this file starts at 13.1.** `Features.md` §13 and this bucket belong to Plan 11 by
the coordination doc's reservation table. Plan 11's own Task 16 normally opens this section (held until
Tasks 1–15 merge) and would pin its own numbering across the whole plan. Tasks 14 and 15 landed ahead of
that, in separate PRs — lifted to close the Plan 5 gate's CI precondition sooner — so this file opens the
bucket early: 13.1–13.6 are Task 14's (added first), 13.7+ are Task 15's, continuing from Task 14's
then-highest id rather than renumbering. **Never renumber**: when Task 16, or any of Tasks 1–13, land,
they continue from this file's then-highest id in turn, exactly as `09-editor-attachments.md` and
`12-offline-sync-apps.md` did for the reservation gaps they each recorded.

**AND THE PLANS COUNT TOO — added 2026-09-18, after a real collision.** ids reserved by a plan under
`docs/superpowers/plans/` count as minted — recount BOTH the catalogue and the plans
(`git grep -hoE '13\.[0-9]{3}' -- docs/superpowers/plans test-cases | sort -u | tail`) before allocating.
The trap is exact: a plan reserves its range when it is WRITTEN, a catalogue mint reads the CATALOGUE
when it runs, and the two see the same numbers as free. Step 1's hot-reload block did that on 2026-09-18
(13.613–13.616 against the second-wave plan's 13.613–13.649, reserved since `5039209c` — before it) and
was re-minted to 13.650–13.653; the block's own note at the end of this file carries the detail. **Keep
the `{3}` width in that command.** It is load-bearing twice over, and both halves are measured on this
tree rather than argued: widening it to `[0-9]+` puts `13.99` above `13.649` (lexical sort on
variable-width numbers) and admits `13.9999`/`13.632866`, which are this file's truncation traps rather
than case ids.

**IDS IN §13 ARE ALLOCATED, NOT DISCOVERED — the same collision class §12 recorded, one file over: Lane D
independently minted its own 13.1–13.36 for Tasks 7/8 against this file's 13.1–13.6, from a fork point
that couldn't see this branch.** Blocks, controller-allocated 2026-09-06: **Lane C 13.1–13.40** (Tasks 14
[13.1–13.6, pushed], 15 [13.7–13.8], and — per `docs/lanes/controller-state.md`'s "Re-task 07:50 — Lane
C takes Plan 11 T11 + T12 (backups, restore drill) after #146" — Tasks 11 [13.9–13.39] and 12) · **Lane
D 13.41–13.100** (Tasks 7, 8) · **Lane E 13.101–13.200** (the rest of Plan 11: seam 1, Task 13, Task 16;
NOT Tasks 11–12, which the 07:50 re-task moved to Lane C) · **Lane C 13.201–13.240**, allocated
2026-09-06 once `13.1–13.40` was confirmed exhausted — minted at **13.201–13.209** so far (13.201–13.203
the scheduler-generalisation errand, 13.204–13.209 Lane F Pass 1's citation check; **13.210–13.240 remain
free in this block**). ~~**The next free BLOCK is `13.241`, controller-allocated ON REQUEST ONLY.**~~ **STALE — CORRECTED
2026-09-08. `13.241`–`13.265` are CONSUMED** (`13.241` has 4 hits, `13.265` has 2). A lane obeying that
line would have been handed an occupied block. ~~**Block `13.266`–`13.275` is allocated to the serial
executor (controller, 2026-09-08); the next free BLOCK is `13.276`, controller-allocated ON REQUEST
ONLY.**~~ **SUPERSEDED 2026-09-08 (same day, one change set later).** `13.266`–`13.275` is EXHAUSTED
and `13.276`–`13.280` are CONSUMED by the sign-in bucket (see that section at the foot of this file):
the block was requested from the controller and used provisionally rather than waited on, because
serial mode has one executor and therefore no competing claimant, and an id that has not merged can
still be renumbered. ~~**The next free BLOCK is `13.281`, controller-allocated ON REQUEST ONLY.**~~ **`13.281`–`13.320` is ALLOCATED to the serial executor (controller, 2026-09-08) — `13.281`–`13.284` minted by the HIG palette adoption and the border sweep, `13.285`–`13.287` minted by Task 0 of the HIG per-screen plan, `13.288`–`13.294` by Tasks 1 and 2, `13.295`–`13.319` reserved by the per-screen plan for Tasks 3–11, `13.320` reserved and deliberately unused. `13.321`–`13.326` is ALLOCATED to the owner's sign-in feedback round (controller, 2026-09-08): `13.321`–`13.323` minted by items 1 and 3, `13.324`–`13.326` by item 2. `13.327`–`13.333` is ALLOCATED to Task 12 (passkey registration), of which `13.333` is the rate-limit property. `13.334`–`13.336` is ALLOCATED to round 2c, the phone gating (controller, 2026-09-08). ~~The next free BLOCK after that is `13.337`, controller-allocated ON REQUEST ONLY.~~** **`13.337`–`13.356` is ALLOCATED to the neomorphism-amendment's Tasks 14 and 15 (AMENDMENT 2026-09-09 to `docs/superpowers/plans/2026-09-08-hig-per-screen.md`) — `13.337`–`13.347` minted by Task 14 (the style axis, the toggle, and the shared-pieces restyle; this PR), `13.348`–`13.356` reserved for Task 15 (the sign-in/workspaces/invite neo restyle, not yet landed). The next free BLOCK is `13.357`, controller-allocated ON REQUEST ONLY.** A lane takes its assigned block and does not derive the next free id from this file — recount
the MAXIMUM in use against `origin/main` at every rebase as the control, but never mint from it.

**Line citations into the prototype are dated, not timeless.** Every `desktop.dc.html:<line>` citation
written before 2026-09-18 refers to the PRE-refresh file, readable at `git show
b6d76a90:design-system/interactive/desktop.dc.html`; historical plans and anchors are NOT rewritten,
and a live citation is re-measured by whoever next touches its line.

> **A NEXT-FREE POINTER IS A CACHE, AND THIS ONE WENT STALE SILENTLY** — the same shape as
> `11-calendar-notifications.md`'s pointer corrected on 2026-09-08, one file over. It is written once
> and read by every later lane, and nothing re-derives it, so it is wrong from the first allocation
> after it and stays wrong. **Recount before trusting it. Both readings below are ways that recount
> goes wrong, and both were made for real on 2026-09-08:**
>
> * **Do not extract ids with a bare `13\.[0-9]+`** — it matches **`13.3333px`**, the user-agent font
>   size that cases 13.266–13.267 are about, and reports a maximum of `13.3333`. The id pattern
>   collides with a pixel value living in the same file.
> * **Do not sort ids as FLOATS.** `13.99 > 13.265` numerically, so a float sort reports a maximum of
>   `13.99` and a block allocated from it would hand out ids **already in use**. A case id is a
>   `(section, ordinal)` INTEGER PAIR, not a decimal number. Compare on the ordinal.
>
> One root error under both: *treating a case id as a number.* The first reads a quantity as an id, the
> second reads an id as a quantity. They were caught only because two parties recounted independently
> and **disagreed** — `13.99` against `13.265` — and the disagreement was checked rather than resolved
> in favour of whoever read first.

**Numbering is BLOCK-allocated across parallel lanes, controller-assigned 2026-09-06, because more than
one lane opened this section before Plan 11 Task 16's own catalogue pass (normally the sole opener, held
until Tasks 1–15 merge) could run: Lane C `13.1–13.40` (Task 14 landed at 13.1–13.6; Task 15 continues
inside the block at 13.7–13.8; Tasks 11–12 too, at 13.9+, after the 07:50 re-task cited above moved them
from Lane E) · Lane D `13.41–13.100` (Tasks 7–8 below, at 13.41–13.76; Tasks 9–10 continue inside the
block) · Lane E `13.101–13.200` (seam 1, Task 13, Task 16) · Lane C `13.201–13.240` (the scheduler
generalisation, 13.201–13.203, once `13.1–13.40` was confirmed exhausted; Lane F Pass 1's citation check,
13.204–13.209). Next BLOCK starts at `13.241`, controller-allocated on request. Never renumber a landed id; a lane exhausting its block asks
the controller for another rather than borrowing a neighbour's.**

**`13.1034`–`13.1049` is ALLOCATED to executor 1 (controller dispatch, 2026-09-20) for the owner's
"epics leave the Board, Calendar, Timeline and Backlog" request — `13.1034`–`13.1046` minted by it,
`13.1047`–`13.1049` reserved and deliberately unused.** The block was taken rather than derived: 13.1033
was the maximum in use in section 13 when it was cut, recounted at `origin/main`, and **a bare "next free
N" is a reading that expires — which is why a lane takes a BLOCK.**

Nothing in the Task 14/15 section below is proven by an automated test in the usual `vitest` sense —
there is no test runner for GitHub Actions YAML. `🧪` there means: reproduced by hand against the actual
tools involved (actionlint, a real vitest run), not inferred from reading the YAML. The Tasks 7–10 sections
below it are ordinary `vitest` coverage and use `✅`/`❌` per case (Task 9's CLI-smoke case, 13.90, is `❌`
pending the dev compose stack).

