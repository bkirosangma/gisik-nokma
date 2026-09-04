# Serial executor — live state

**This file is the restart surface.** A controller that kills and relaunches the executor from its
brief recovers only what is written here. Refreshed at every task boundary.

> **Warning about shas in narrative prose.** Every sha cited in any *narrative* document in this
> repo — the dispatch brief, the coordination doc's sections, the narrative parts of this file — is
> a fact about the moment it was written. Anchors in the table below were verified with
> `git branch --contains` (empty output = orphaned), never with `git cat-file`, which passes on
> reflog-only commits and hands you pre-rebase content while looking like it worked.

> **Never pipe a test run into `head`.** `pnpm exec vitest run 2>&1 | head -6` returns in seconds looking
> like a pass and orphans the whole fork pool at `ppid=1`, ~1 core each, growing. That command, run at
> 05:05 on 2026-09-04 by a task-14 agent, put six workers on the machine that reached 22.4 GB and forced a
> restart. `| tail -N` is safe — it drains the pipe. So is `> /tmp/run.log 2>&1; head -N /tmp/run.log`, and
> so is a `grep` without `-m`. If a run returned suspiciously fast, `pgrep -f vitest` before you move on.
> A machine-local `PreToolUse` hook now refuses the piped form outright.

## WHERE I AM: **STEP 14 — PLAN 9 IS COMPLETE. T1–T15 ALL COMMITTED. Merged `origin/main`
`421db9f`. NEXT: the single opus whole-branch review, then the PR. The controller merges.**

> # DO NOT TRUST THE WORD "NEXT" ANYWHERE IN THIS FILE. MEASURE INSTEAD.
> ```
> /usr/bin/git log --oneline origin/main..HEAD     # what is actually committed
> /usr/bin/git status --porcelain=v1               # what a dead agent left behind
> ```
> **Batch B+C is DONE — T4, T5 and T6 are all committed.** What is running now is the
> **RECOVERY ROUND** dispatched after it: T4's fix (the red gate + 4 Important), T5's fix
> (4 Important), and **T6's review, which never ran at all** because its agent died on an API 529.
> Three agents, each committing its own work, so by the time you read this zero to two of those fixes
> may be committed **and this section will not say so** — the handoff is written before the work and
> the agents do not update it.
>
> **A dead fan-out leaves COMMITTED tasks and no handoff entry, and it can also leave UNCOMMITTED work
> in the tree.** Both have now happened here. Step 13's Batch B died on an expired login with a full
> task written and not committed, recovered only because someone ran `git status` first. Step 14's T6
> died on a 529 with its work **committed and amended** — so `git status` was clean and the task
> looked untouched by the handoff while being finished on disk. **Run both commands. Neither alone
> would have caught both cases.**
>
> *(This warning exists because the alternative was live, not hypothetical: the header said "BATCH B
> (T4) IS NEXT" while T4 was already being written. That is the third instance of the stale-middle
> failure this file documents — and the first two were retrospective. Being able to describe a failure
> is not the same as not committing it.)*

Branch **`exec/14-plan9-calendar`**, cut from `origin/main` `4b8b048`. **Step 13 is merged and closed**
(PR #85 -> `9b70ab9`; the controller's close is #87 -> `4b8b048`). **Plan 8's fifteen ledger rows are
ALREADY PROMOTED on `main` by #87 — do NOT promote them again.** I wrote that promotion commit before
seeing #87 and dropped it; the status/PR/sha matched exactly but the controller's *notes* column is
better (`artefact: <path> (PR #85)` vs my branch-name prefix), so re-applying mine would have silently
reverted it. **The repo stands at 133/177 (75.1%), 0 claimed, 0 in-flight, recounted from the ledger.**

**In flight and NOT mine to merge: PR #88** (`docs/p29-annotation`, head `022f0fc`) — the P29
declaration annotation #86 asked for. It is **not stacked** on this branch in the git sense: its commit
was **replayed here as `555c5d8`** when this branch rebased onto `4b8b048`. `022f0fc` itself lives only
on `docs/p29-annotation`. Disjoint from #87 by file, so #88 merges clean.

> **WHEN #88 MERGES, THE REBASE BASE IS `555c5d8`, NOT `022f0fc`. Measured, not assumed:**
>
> ```
> git rebase --onto origin/main 555c5d8      # correct — replays d27b073 onward, this step's own work
> git rebase --onto origin/main 022f0fc      # WRONG — replays 4b8b048 too, the CONTROLLER'S #87 commit
> ```
>
> `git merge-base --is-ancestor 022f0fc HEAD` **fails** — it is not on this branch — so
> `022f0fc..HEAD` sweeps in `4b8b048` and would replant the controller's own merge onto `main`.
> `git rev-list 022f0fc..HEAD` returns three commits; `git rev-list 555c5d8..HEAD` returns one.
> **And `022f0fc` becomes ORPHANED by the very event that triggers the rebase** — #88 merging deletes
> the only branch that reaches it — after which `git cat-file` still passes on it and hands back
> pre-rebase content. This is the brief's named trap, arrived at from the direction that makes it look
> right: the sha was correct when written, about a branch this one is no longer built on.
>
> Do it in a SCRATCH worktree (`git worktree add --detach`), never in this one. **Verify with a
> POSITIVE CONTROL**, because an empty diff is also what a broken diff invocation prints:
> `git diff --stat <old-head> HEAD` empty **AND** `git diff --stat origin/main HEAD` non-empty and
> matching expectation.

## RECORDED, NOT FIXED — carried forward with owners, from T8's fix round

**1. Task 8 deferred the calendar's colour tokens, and the deferral is larger than "seven names are
missing". OWNERS: TASK 9 (the calendar), TASK 11 (the timeline), TASK 12 (the inbox).**

T8's review found the silence, not the decision — the decision was right: a view-model renders
nothing, so a palette invented for it would be judged against no screen. What the first draft of
this note got wrong, and what a `grep` for bare names hides:

**`tokens.color.*` DOES NOT EXIST.** Measured, not assumed — `packages/ui/src/index.ts` exports
`TOKEN_ROLES`, `colorOf(theme, role)`, `themes`, `primitives`, `CONTRAST_PAIRS`, `cssVariableName`,
`themeStylesheet`. There is no `tokens` object at all, and therefore no `tokens.space`,
`tokens.radius` or `tokens.font` either. **Every `style={{ color: tokens.color.ink, padding:
tokens.space.md, fontFamily: tokens.font.body }}` snippet in Tasks 9, 11, 12 and 13 is written
against an API this repo does not have.** Transcribed as written it does not compile — this is a
plan-vs-landed-code divergence, not a missing key.

Against the real `TOKEN_ROLES`, of the fourteen colour names the plan uses:

- **Real roles, usable today:** `surface`, `accent`, `contested`.
- **NOT roles — they are `primitives` keys, and reaching for them is the one thing `tokens.ts`
  forbids** ("primitives are the palette, roles are the meaning… no colour literal is legal anywhere
  else", enforced by `packages/ui/test/token-discipline.test.ts`): `ink`, `inkMuted`, `line`. The
  roles that carry those meanings are **`text`, `textMuted`, `border`**. A component reaching for
  `primitives.ink` is a literal wearing a name.
- **Absent entirely, eight, and each one needs a light AND a dark entry in `themes` plus a
  `CONTRAST_PAIRS` row if text sits on it:** `todayRing`, `pendingHatch`, `barActive`,
  `barTerminal`, `marker`, `customMarker` (T9/T11), `accentInk`, `unreadDot` (T12).

Per-task ownership, measured with
`awk '/^### Task /{t=$0} /tokens\.color\./{print t}' <plan>`:
T9 needs `todayRing`, `pendingHatch`, `barActive`, `marker`, `customMarker`; T11 repeats four of
those and adds `barTerminal`; T12 owns `accentInk` and `unreadDot`. **T9 adds the five it renders and
no more** — a token whose only consumer is a plan snippet is a colour nobody has looked at, and
`CONTRAST_PAIRS` is checked numerically, so a value added blind either fails that check or is tuned
to pass against a background that does not exist yet.

Nothing shipped is false today: `grep -rn "customMarker\|barActive\|todayRing" Features.md
test-cases/` returns nothing. It goes false the moment T9 renders a marker.

**2. Two new test-case ids are Task 15's to carry, and they are not in the plan. OWNER: TASK 15.**
Task 15 writes `test-cases/11-calendar-notifications.md`, which does not exist yet. Four ids invented
during execution must land in it — **11.48** (the calendar view-model reads no clock, proved by
varying `TZ` and by scanning the source, `test/calendar/clock-free.test.ts`), **11.49** (an
all-hidden month says the field is hidden, not that nothing was claimed), **11.50** (a month emptied
by a filter or a lane says so, and a month narrowed by both does not claim the legend did all of it),
**11.51** (the grid's padding cells are rendered cells: markers, bars, the legend tally and the
all-hidden check are each witnessed ON both edges and one day outside each). Each carries the same
reminder in its own docblock; this is the copy a relaunched executor can find without opening the
test files.

**3. A SECOND read-modify-write writer over one last-write-wins preferences document, INSIDE ONE
CLIENT. OWNER: PLAN 6 — the shell that mounts both.** (From T13's fix round.)

`views/ticket-list.tsx:432-438` (`setPrefs`) composes its whole-document PUT from
`usePreferences`'s `document`, which is a **mount-time snapshot** — `views/use-preferences.ts` never
re-reads before writing — and spreads it whole, `savedFilters` included. Meanwhile
`packages/app-core/src/preferences/saved-filters.ts` writes the same document through
`PreferencesGateway`. One screen holding both loses a filter **with no concurrency at all**: mount
(no filters) → the person saves one through the gateway (the server holds one) → the person changes
the grouping → `setPrefs` PUTs the mount-time `savedFilters: []`.

**T13's docblock pre-empted the WRONG version of this** and the fix round corrected it: it argued
*"two clients still resolve last-write-wins … not fixable from this side"*, which is true and a
different problem. **Two paths inside ONE client is orderable by that client.** `ticket-list.tsx`
already understands the shape — `ticket-list.tsx:434` reads *"refuse: see the docblock — this PUT
would erase the rest"* —
but the window it guards is the one BEFORE the first load, not the one the gateway opens after it.

**Not fixed, and the reason is not shyness:** the two writers speak different vocabularies
(`PreferencesDoc` vs `view-types.ts`'s `UserPreferences`) over different transports, and nothing in
`app-core/preferences` can order writes it cannot see. The ordering belongs to whatever mounts both,
which is Plan 6 — the implementer `preferences-gateway.ts` already names for this interface.

**Nothing shipped is false today:** nothing mounts `SavedFiltersMenu` and no `PreferencesGateway`
implementation exists — `grep -rn --include='*.ts' --include='*.tsx' "PreferencesGateway" packages
apps` finds the interface, the store, the barrel, the two fakes under `test/preferences/`, and
`dist/` echoes of the same (build output); `SavedFiltersMenu` is mounted only from two test files.
**No implementation, and no screen.** **It goes
false the moment one screen holds both writers.** Also carried in `saved-filters.ts`'s docblock,
because a Plan 6 agent has no reason to open this file first.

**4. The test-case ids Task 15 must carry now run to 11.122, and entry 2 above names only 11.48-11.51.
OWNER: TASK 15.** Measured this round, not recalled —
`grep -rEoh "\b11\.[0-9]+\b" packages/*/test apps/*/test | sort -u` answers **11.1-11.8, 11.18,
11.36-11.39 and 11.48-11.122**, and `test-cases/11-calendar-notifications.md` still does not exist
(`ls test-cases/` has no `11-`). T13 alone invented 11.96-11.120; its fix round adds **11.121** (every
control a person can tab to is in the `:focus-visible` rule, and the reverse — the cross-package
set equality in `test/preferences/saved-filters-css-binding.test.tsx`) and **11.122** (an absent
preferences document reads as `[]` and refuses every write, which pins the gateway's precondition).
This entry does not re-derive what 11.63-11.95 mean; it records that the range is continuous to 122
so Task 15 does not carry only the four ids entry 2 names.

**5. THE SAME FOCUS-RING SURVIVOR LIVES ON THREE OTHER SURFACES, AND THE GUARD THAT NOW CATCHES IT
IS IN THE PREFERENCES SUITE ONLY. OWNER: TASK 15** — the plan's own *"full verification"* task and
the last one on this branch; if it judges three components' guards outside its stated scope (a scope
guard, `Features.md` §11 and the test-cases file) it must carry this entry forward rather than drop
it. (Found by T13's fix round while building 11.121.)

**Measured, three mutations, each re-run on the committed tree (app-core 1,019 after this round):**

| deleted from `packages/ui/src/ui.css` | surface | app-core | ui | verdict |
|---|---|---|---|---|
| `:1010-1014` `.gn-inbox__{row,more}:focus-visible` | T12's inbox | 1019/1019 | 37/37 | **SURVIVES** |
| `:863-868` `.gn-timeline__{nav,bar,open}:focus-visible` | T11's timeline | 1019/1019 | 37/37 | **SURVIVES** |
| `:720-725` `.gn-calendar__{nav,fold,item}:focus-visible` | T9's calendar | 1019/1019 | 37/37 | **SURVIVES** |

**The mechanism DIFFERS PER ROW, and that difference is the job being handed over. Measured, not
assumed — the first draft of this entry asserted one shared cause for all three and was wrong about
two of them:**

- **inbox — a BLIND guard.** `test/inbox/inbox-css-binding.test.tsx:174` (11.95) *is* the class-name
  set equality, plus a data-attribute check. The ring survives because a `:focus-visible` rule adds
  no new class name — exactly the blindness the review found in T13's copy of the same instrument.
  The job here is to GENERALISE an existing guard.
- **timeline — NO class/rule guard exists.** `test/timeline/timeline-view.test.tsx` reads `ui.css`
  only to pin the custom property `--timeline-week-columns` and its substitution form (`grep -n
  "ui.css"` in that file hits 377, 383, 819 and 830, all inside that one case). There is no class-set
  comparison for the timeline block at all. The job here is to WRITE one.
- **calendar — nothing reads `ui.css` for it.** `grep -rn "ui.css" packages/app-core/test
  packages/ui/test` answers the preferences, inbox and timeline files plus `packages/ui/test/
  in-transit.test.ts` and `tokens.test.ts`, and no calendar file. Same job as the timeline, one
  surface older.

**This is the fourth appearance of the class this file
already names** — *"a guard built for one surface does not generalise on its own … the next
component in the same package reproduced the gap while the fix for it sat two files away"* — and it
is the first time the gap has been measured on the surfaces that came BEFORE the guard rather than
after it.

**Not fixed here on purpose:** T13's fix round is not three other components' guards, and a fix
written blind into `inbox-css-binding.test.tsx` would be a fourth copy of an instrument rather than
the shared one the recurrence argues for. The shape to copy is
`test/preferences/saved-filters-css-binding.test.tsx`'s `focusVisibleRules` +
`focusableRenderedClasses` set equality; it needs each component's own maximal fixture, which is why
it is not a mechanical transplant. **What is false today is only the coverage, not any claim any
commit made** — and, as with T13, deleting these rules removes the design-system ring, not all focus
indication: the browser's UA outline still renders and nothing in this repo can see it.

## PRE-FLIGHT IS DONE. Four findings, all verified by me on disk, not adopted from the agent.

**1. NO RULING IS NEEDED FOR TASK 13, AND THE DOCUMENT THAT SAYS OTHERWISE IS WRONG.** The pre-flight
reported the saved-filter field name as *"OPEN / UNRESOLVED … needs an explicit ruling"*. **It was
reading the coordination doc accurately, and the coordination doc was a day stale.** **P26 was written
2026-09-02** in `controller-state.md`: `SavedFilter`'s field is **`filterSpec`**; Plan 9 T13's `spec` is
superseded before it is written. Both stale sites in the coordination doc are corrected in this branch.
**Task 13 adopts `filterSpec`. Do not escalate this.**

> **The generalisation: a ruling recorded in one lane's state file is invisible to the other lane's
> agents.** Subagents read the coordination doc; they do not read `controller-state.md`. **A ruling is
> not landed until it is written where the work will read it.**
>
> **Two instances I can point at, not a counted trend.** P26 was first ruled in a message and reported
> as *"a number, a subject, and no text"* — `controller-state.md`'s own note calls that "the second
> time in one day" — and then written to `controller-state.md` while the coordination doc went on
> asking for it. I said "third instance in two days" in the commit that made this correction and could
> not enumerate the third when challenged. **A counted plural in a document about stale documents is a
> bad place to round up**, and this file's own rule already says it: when correcting a plural, check
> which noun it counts.

**2. THE THREE-WAY SPLIT IS REAL AND TWO `SavedFilter` TYPES ALREADY SHIP.** Verified by direct read:
`packages/domain/src/preferences.ts:28` -> **`filterSpec`** (schema is `.strict()`);
`packages/app-core/src/view-types.ts:183` -> **`filter`**; Plan 9 text line 5795 -> **`spec`**. The
first two are closed under P24 and pinned by `client-contract.test.ts:605` — **not reopened.**

**3. TASK 14 IS BIGGER THAN ITS OWN TEXT SUGGESTS — Plan 6's Step 5b was SKIPPED.**
`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:29-33` carries an explicit comment saying so and
naming Plan 9 T14 as the carrier. **Verified with a positive control**: the only `CalendarView` /
`TimelineView` hit anywhere in `apps/web/` is that comment itself, while a control grep for
`BoardView|ListView` returns real files — so the absence is real and not an eaten glob. **T14 must add
the calendar/timeline mount (four-way board|list|calendar|timeline chain) on top of the inbox wiring.**
Pull the tab mechanics from Plan 6's own Step 5b text, not from the comment's paraphrase — that was the
pre-flight's own least-sure claim and I have not closed it.

**4. TASK 8 IS TOLD TO CREATE A TYPE THAT ALREADY EXISTS ELSEWHERE.** The plan says create
`packages/app-core/src/filter/filter-spec.ts` "guarded — Plan 6's wins if landed". Plan 6's **did**
land, at a different path and a richer shape: `packages/app-core/src/view-types.ts:70`. **Consume it;
do not create the guarded path.** Task 8's Step 0 scaffold guard likewise resolves to "Both exist" —
`packages/app-core` and `packages/ui` are fully populated. The *tokens* it needs are genuinely new.

Smaller, verified: T1's plan path `src/ticket-types.test.ts` is really `packages/domain/test/…` (the
coordination doc already pre-corrected this). T2's `docToPlainText` **already exists**
(`packages/domain/src/doc-text.ts`) — created by **Plan 5**, not Plan 7 as T2's text says; take the
skip branch. T5's fan-out hook is `apps/server/src/app.ts:294-300` (`onEventCommitted`), not
`src/index.ts` as the plan says.

## PROGRESS: T1-T14 COMMITTED (14 of 15). T14's fix + T15 (the closeout) IN FLIGHT. Then final review, PR.

### T14 did the mount Plan 6 skipped, and found a plan defect that would have 404'd every inbox row

**The plan's deep link pointed at a route this shell does not have.** `/tickets/${'{'}id{'}'}` — `apps/web` has
no `/tickets` route, and Board cards push `?ticket=` on the **project** page, which needs a `projectId`
no `Notification` carries. **Every row in the inbox would have 404'd.** It added `ticket-location.ts`
reading `project_id` off a row the existing endpoint already serves.

**It closed three seams where the fake was looser than the real routes** — `markRead` must throw on
404 (a stub that resolved let an optimistic flip stand for a row the server never marked),
a transport-`null` now names its path instead of throwing `Cannot read properties of null`, and
`parseNotification` runs per kind rather than a cast. **That is the series' signature failure being
closed at the seam where it is normally introduced.**

> **AN ID COLLISION ALREADY HAPPENED, AND IT IS THE ARGUMENT FOR TASK 15.** T14's first block was
> 11.90–11.128 and **collided with ~30 of Tasks 12's and 13's ids**, because Task 13 landed on this
> branch *while T14 worked*. It caught it by diffing every id definition in the repo and renumbered.
> **Two lanes numbering into one unregistered section cannot see each other** — which is exactly what
> `test-cases/11-calendar-notifications.md` not existing has meant for seven tasks.

**It also corrected two of its own prose claims by measurement**, including one where it swapped in the
hook it had claimed would leave the badge dark, found all six cases still green, and recorded that its
claim had been false.

**NOT RUN, and it said so rather than implying otherwise:** Step 4's dev walk-through against a live
server. Typecheck and a forced `next build` passed with `/inbox` present. *"The 40 unit cases cover
more than the walk-through would, but it is not-run, not covered."*

### T14's review — three Important, and the first is the Task 7 precedent exactly

| # | Finding |
|---|---|
| **I1** | **THE NAV MOUNT IS UNWITNESSED — one line orphans the whole feature.** Deleting the import and `<InboxNavLink />` from `app-nav.tsx` leaves **125/125 green AND typecheck clean**. `InboxNavLink` is rendered directly only by its own test; where it renders transitively, `unreadCount()` is un-stubbed, the stub rejects by name, and a bare `catch {}` swallows it. **`/inbox` has no other link anywhere** — and e2e is not in the gate. This is Task 7's finding (a route registration deleted from `buildApp` left 937 green) in its **reachable-page-with-no-door** form. |
| **I2** | **"No survivors left standing" is FALSE.** Deleting the `isEpicType` spread on `<CalendarView>` alone survives 125/125, while both app-core forwards redden by name — so the shell half is only half-covered (the one case that builds a rank-1 predicate opens the *Timeline* tab). **This is precisely the state T14's own commit argues is worse than doing nothing**: the two tabs would answer differently about the same ticket's epic, and nothing could detect it. |
| **I3** | **A failed "Load more" DISCARDS every message already on screen.** Measured: after a page-2 failure, **0 rows and 1 refusal panel** — because the render's first arm is the refusal, ahead of the rows arm. Neutering that catch survives 125/125. **It inverts the standard the same files argue for** — the nav badge keeps its last count rather than asserting "none" from a failed request — and it runs against the standing ruling *"a message you were sent is yours."* |

 T13's fix + T14 IN FLIGHT. Then T15, final review, PR.

**T12's fix built a STRONGER guard than the one it copied**: a **set EQUALITY** between the classes the
components render and the classes `ui.css` styles, harvested from both sides and typed on neither —
because *a subset check in either direction catches only one rename direction*. Its four scanners are
proven against planted input before use. Ten mutations, ten reddened. It deleted `gn-inbox__icon`
outright (vestigial — nothing in the repo referenced it), **which is what permitted equality rather
than a subset**, and it said plainly that six of the review's seven renames are now caught by rename
tests while the seventh is resolved by the class ceasing to exist.

**It also DIVERGED on the accessibility fix and gave the better reason.** The review pointed at the
sibling's `role="status"`. T12 used **`role="img"`** instead: *`status` is a live region, and what a
live region announces on update is its CONTENT — `99+`, which is exactly the string the component
exists to keep out of the spoken answer.* `img` makes children presentational so the label replaces
the glyph. **And it stated its proof boundary**: the mutations witness the fix is *present*; they do
not show the old markup went unannounced in any real AT, because jsdom is not a screen reader and no
mutation of the component could show it.

### T13 (saved filters) adopted `filterSpec` under P26 — and PROVED the choice rather than citing it

`client-contract.test.ts:1022` measures the plural spelling **400ing** with the singular control at
**200 in the same run**. It also wrote the cross-package class/rule guard **in the same commit as the
component**, rather than a review later — the first task on this branch to do so. And it **amended its
own commit message** when the mutation count did not reconcile (36 attempted, 35 valid), on the
grounds that *a count a reviewer can measure and find false is worse than the thing it covered.*

### T13's review — two Important

| # | Finding |
|---|---|
| **I1** | **It named this exact class and closed half of it.** Deleting the whole `:focus-visible` rule leaves **ui 37/37 and app-core 1014/1014 green.** Its own 11.119 exists *because* a rule can vanish under a green set equality — and pins `__submit` and `__submit:disabled` only. 11.118 compares class NAMES (all four keep base rules, so the set is unchanged) and 11.120's `used.length > 3` floor goes 7 -> 6 and still passes. **Two of its three CSS tests straddle the rule and neither can see it.** Note: this was a mutation it never ATTEMPTED, so "35 killed, 0 survivors" is **not false** — the coverage was incomplete. |
| **I2** | **A SECOND read-modify-write writer over one last-write-wins document, inside ONE client.** `views/ticket-list.tsx` `setPrefs` reads a **mount-time snapshot** (`use-preferences.ts` never re-reads before writing), spreads it whole including `savedFilters`, and PUTs. So: mount (0 filters) -> save a filter -> change grouping -> **the PUT carries the stale `savedFilters: []` and the filter is gone.** The commit pre-empts the *wrong* version of this — it argues two CLIENTS resolve last-write-wins, which is true and a different problem; **two paths inside one client is orderable.** Latent (nothing mounts the menu yet) but **recorded nowhere.** |

 T12's fix + T13 IN FLIGHT. **Measure; do not trust this line.**

### A CLASS NAME AND ITS CSS RULE ARE TIED TOGETHER BY NOTHING — twice now, on two tasks

**T12: seven BEM class renames survive BOTH suites.** `gn-inbox__glyph` -> `gn-inbox__glyphx` leaves
**app-core 955/955 and ui 37/37 green**, and that class carries one of the two colour signals the
commit itself names for unread. T12 ran 58 mutations and every one was thorough — **but all of them
were on VALUES, and none on a selector.** A whole dimension was unexamined.

**T11's fix had already built the guard for this**, one task earlier, after the identical defect on
`--timeline-week-columns`. It lives at `timeline-view.test.tsx` and `packages/ui/test/in-transit.test.ts`.
**The lesson is that a guard built for one surface does not generalise on its own** — the next
component in the same package reproduced the gap while the fix for it sat two files away.

### T11's fix found a survivor beyond the review's ten — and then caught itself committing the defect

It measured the review's ten and added an eleventh (`start-after-due` returning the
`--unplaceable-day` class). More telling: **its first draft of the cross-package test hand-typed
`--timeline-week-columns` three lines above a comment claiming it never did** — the exact failure the
round existed to close, committed inside the fix for it, caught by its own re-run.

It also left **two survivors deliberately and named both**: `weeksCount ?? 8` (no input discriminates
it — `0 ?? 8` is `0`, `null` is not type-legal, `undefined` maps to the model's own default), and
**export completeness — deleting `TIMELINE_EMPTY_COPY` from the barrel leaves the whole repo at 24/24,
0 cached, because the repo has no public-surface test.** Both stated rather than quietly dropped.

### T12's other two Important findings

- **The one place the fake models the server REFUSING is unasserted.** `markRead` rejecting an unknown
  id can become `Promise.resolve()` with gateway tests 7/7 green. Its four PAGING mirrors are all
  genuinely measured — **the refusal half is not.** This is the series' signature failure in miniature:
  *a mocked contract excusing the server from existing*, and **Task 14's HTTP adapter is written
  against this contract.**
- **`UnreadBadge`'s accessible name may not exist.** `aria-label` sits on a role-less `<span>`, where
  ARIA prohibits naming. Three tests appear to confirm it works — **`getByLabelText` matches the
  ATTRIBUTE and never computes an accessible name**, so the harness that would catch it is precisely
  the one blind to it. The reviewer ran no mutation and said so: **no mutation of the component can
  expose it.** The repo's own precedent (`read-only-banner.tsx`, `role="status"`) is three files over.

 T11's fix + T12 IN FLIGHT. **Measure; do not trust this line.**

### T11's review found the prose-claim class at its sharpest, and graded it Important

**T11's commit message asserted two things its own tests do not support**, and the reviewer graded the
false claims themselves as a finding — *"a reviewer who reads the message and takes the switch and the
both-directions rule as settled is exactly the path by which findings 1 and 2 survive a second
review."*

| Claim in the commit | Reality |
|---|---|
| *"Every conditional affordance is asserted in BOTH directions"* | Falsified three times over — side-entry claim list, title text, header spacer all survive always/never mutations. |
| *"The switch here is 1:1 over all five with a `never` default"* | **True of the SOURCE, false of the EVIDENCE.** Two of five arms can `return ''` with 26/26 green. The compiler proved exhaustiveness; no test proved the VALUES. |
| *"24 mutations, every one red and naming its own site"* | The reviewer's 22 found **10 survivors, 8 on code that commit introduced.** |

**This is the branch's recurring defect class** — step 13's whole-branch review found four findings and
all four were prose. **A claim in a commit message is load-bearing precisely because it stops the next
reader looking**, which is why the dispatch for the fix round now says: if you did not measure it, do
not claim it; if a mutation survived and you left it, say so.

**Two findings worth carrying beyond their fix:**
- **A duplication removed and reintroduced one layer out.** T11 correctly collapsed a doubly-stated
  `gridTemplateColumns` into one custom property — then stated it twice **across a package boundary**
  instead. Typoing the consumer in `ui.css` leaves **ui 34/34 AND app-core 26/26 green**, while
  `grid-template-columns` falls back to `none` and every row drops onto implicit tracks.
- **The two views disagree about a fact of the product.** An in-transit custom claim is drawn as
  pending by `CalendarView` and rendered identically to a settled one by `TimelineView` — there is no
  `.gn-timeline__claim[data-pending]` rule. Deleting the one pending rule that does exist leaves ui
  34/34 green, which is why the omission went unnoticed.

**T9's fix closed all six one-directional claims, and it guarded against vacuity** — a zero-count is
true of a broken render too, so each absence case first asserts the grid rendered, the marker exists,
and (for the today ring) that today is genuinely outside this month's grid. It also **stated which of
its own new assertions does NOT discriminate**: a `toHaveLength(1)` it added cannot see the forced
`data-unplaceable` mutant, because that fixture has exactly one button either way. **The kill is
entirely the new absence case, and the commit says so.**

## REBASED ONTO `d3e0889` — this branch was carrying a race I had already fixed on `main`

**T10's fix agent hit an intermittent failure in `access.test.tsx` on an unchanged tree**, reported it
honestly as *"recorded, not diagnosed"*, and it was **PR #90's race arriving in my own work.** This
branch was cut from `eb20d7c`, #90 merged after, so every agent here was running against the
pre-fix `getByTestId`. Rebased; verified with two positive controls:

- `git diff <old-head> HEAD` shows **only `access.test.tsx`** — #90 arriving, nothing else moved.
- `git diff origin/main..HEAD` is **non-empty and is the Plan 9 work** (46 files).
- Code-level `user.click(screen.getByTestId` count is now **0** (the 4 remaining matches are inside
  the comment I wrote, which quotes the old spelling deliberately).

**The lesson is about branch age, not about the race.** A long-lived branch keeps every bug that was
fixed on `main` after it was cut, and the symptom arrives as *someone else's* flake in *your* agent's
report. **Re-fetch and rebase at batch boundaries, not only when a PR merges.**

## PROGRESS: T1-T11 in flight; T1-T10 committed (T9 done, T11 building). T9 fix + T11 IN FLIGHT.

**T9 (`CalendarView`) is the first task that rendered a colour, and it did the token work right —
ONE new role, not fourteen.** Most plan names turned out to be existing roles under new words. It
**declined `barActive`/`barTerminal` outright**, because `CalendarBar` carries no `stateCategory` and
two bar colours would *colour a distinction the model cannot make*. It added `customMarker` with a
`CONTRAST_PAIRS` entry **at the text minimum, not the glyph minimum**, because the label renders in it.

**It found two more silent defects in the plan's code.** `2026-02-30` passes `IST_DAY_REGEX`, so the
model places it by string comparison into a week where `days.indexOf` is `-1` — and the plan's
`index + 1` produced `grid-column: 0 / 1`, **which CSS discards, so the auto-placer drops the claim
onto a day nobody claimed.** And the plan renders ONE empty-month sentence where the model has three
arms; all three now render verbatim.

**It also closed a hole nothing was watching:** `token-discipline.test.ts` proves no colour *literal*
escapes `tokens.ts`, but nothing proved a `var(--gn-…)` names a role that **exists** — a typo resolves
to nothing, the element inherits, the suite stays green, and the colour is simply gone.
`packages/ui/test/tokens.test.ts` now cross-checks every `var(--gn-…)` against `TOKEN_ROLES`.

### T9's review — three Important, and all three are ONE class

**Asserted present-when-expected, never absent-when-not, so nothing can detect OVER-firing.** This is
already a recorded failure class on this branch and it produced every finding here:

| Mutation | Result |
|---|---|
| today ring compares day-of-month only (`day.slice(8)`) — rings 09-23 as "today" in September | **SURVIVED 25/25.** Both ring tests assert presence *inside August*, where day-of-month 23 and 10 each occur once. |
| drop every item on a leading/trailing **padding** cell | **SURVIVED 25/25.** Every fixture is `2026-08-xx`. **This is the exact defect the MODEL shipped with 777 green — same blind spot, one layer up.** |
| make a **bar's** `onClick` dead | **SURVIVED 25/25.** Only markers are ever clicked; the bar test asserts `title` and `gridColumn`. |

**T10's fix took `emptyCopy` from distinct-count 1 to 3**, and made a design call worth keeping: **the
window sentence is deliberately NOT exhaustive** — *"Dated work here sits outside the weeks in view"*,
never *"every piece of"* — because a filter can remove work that would ALSO have missed the window, and
an exhaustive quantifier there is the all-hidden failure in timeline clothes. It kept the undated-epic
guard as-is and pinned both halves. It fixed the **prose** of the `0099-01-01` docblock rather than the
code, on the grounds that refusing pre-1000 years would invent a validity rule at a *rendering* surface
the write path does not have — the product would store a claim it then refuses to place.

## STOP — THE PLAN'S STYLING API DOES NOT EXIST. 57 SITES. BLOCKS T9, T11, T12, T13.

**The plan writes `tokens.color.ink`, `tokens.space.md` and similar in 57 places.
`@gisik-nokma/ui` exports NO `tokens` object at all.** Verified on disk at
`packages/ui/src/tokens.ts`, which exports:

`primitives` · `PrimitiveName` · `TOKEN_ROLES` · `TokenRole` · `themes` · `CONTRAST_PAIRS` ·
`colorOf(theme, role)` · `cssVariableName(role)` · `themeStylesheet()`

It is a **role system** — role -> primitive -> theme, with a contrast check — not the flat map the plan
drafts against. **Every `tokens.*` snippet in Tasks 9, 11, 12 and 13 fails to compile as transcribed.**

Of the plan's fourteen colour names: **3 are real roles** (`surface`, `accent`, `contested`); **3 are
`primitives` keys the package's own discipline forbids a client from touching** (`ink`, `inkMuted`,
`line` — the roles are `text`, `textMuted`, `border`); **8 are absent** — `todayRing`, `pendingHatch`,
`barActive`, `barTerminal`, `marker`, `customMarker` (T9/T11) and `accentInk`, `unreadDot` (**T12**).
`barActive`/`barTerminal` may simply be the existing `categoryActive`/`categoryTerminal` — check before
inventing. Adding a role means picking primitives for BOTH themes and satisfying `CONTRAST_PAIRS`, and
**a raw hex where a token belongs is a recorded failure class here with a check that catches it.**

**Task 8 was RIGHT to defer this and its reasoning is the reusable part:** Task 8 renders nothing, so
no Task 8 test could have reddened if it guessed a primitive wrong — *a check that cannot fail*. The
work belongs to the first task that renders a colour, which is **T9**.

## PROGRESS: T1-T10 COMMITTED (9 of 15 built; T9 pending). T10's fix + T9 IN FLIGHT.

**T8's fix (`9e28e81`) closed both Importants and found the case the review had not named: NARROWINGS
STACK.** With a filter removing one August claim and the legend hiding the other, the all-hidden
sentence's *"EVERY claimed date belongs to a field you have hidden"* is false — and so is any
filter-only phrasing. **Emitting either would have been a fourth instance of the defect the fix exists
to close.** So the new arm is a disjunction, the exhaustive sentence is reachable only when the legend
is the sole narrowing, and that precedence is witnessed. It also closed **four more boundary mutations
the review never enumerated**, found by asking which *other* end of which *other* range had no fixture.

> **It caught a defect in its own fix, by mutation.** Its first draft asserted the clock-scan file list
> against itself — a loop over `CLOCK_FREE_DOMAIN_FILES` checking `scanned` contained each entry.
> **Deleting a file from the list left all 50 tests green.** Names are literal now. *A list asserted
> against itself is a check that cannot fail, and this is the second time that exact shape has appeared
> on this branch.*

**T10 (the timeline model) predicted its own defect class and found it.** `TIMELINE_SIDE_LIST_COPY`
says work stays in the list *"until it carries both"* a start and a needed-by — but a **start-after-due**
entry carries both and is still listed. Per-entry copy honest, heading false. Every side-list case in
the plan holds ONE reason, so none of them could see it; the fixture that does holds two. It also
found `dateMs` throws on `2026-02-30` — **storable, because `dueDateValueSchema` is regex-only** — where
one such claim would have blanked the entire timeline.

### T10's review — two Important, and one hole in the purity guard itself

| # | Finding |
|---|---|
| **I1** | **`TimelineModel` has no `emptyCopy` at all.** Four different empties — no tickets, filtered out, laned out, and **fully-dated work wholly outside the window** — `JSON.stringify` to the SAME bytes. **DISTINCT COUNT: 1.** The sibling `CalendarModel`, same package and same author, declares `emptyCopy` for exactly this. The window-miss case is the one **Task 11 cannot reconstruct** — its props carry no window. Ruled: Task 10's, on the model. |
| **I2** | **The undated-epic `continue` is witnessed on its true branch only.** Two mutations survive: a HALF-dated epic vanishes from rows *and* side list; a FULLY dated epic's bar vanishes. A control proves the true branch is pinned. It is the only statement that removes a ticket on the grounds of what it **is** rather than what it **claims** — and with I1, a vanished epic leaves nothing on screen explaining it. |
| **Minor** | **The purity guard has a hole, and it is Task 8's harness, not Task 10's.** A literal `new Date()` is caught and named. An **aliased** read — `const CLOCK = Date; new CLOCK().valueOf()` — **survives both halves**: the scanner anchors on `\bnew\s+Date\s*\(`, and the four-zone identity test structurally cannot catch an *instant* read, since `Date.now()` returns the same number in every zone. The harness's own docblock already concedes the scan is the guard *because* the runtime harness cannot be. |

## PROGRESS: T1-T8 COMMITTED (8 of 15). T8's fix + T10 IN FLIGHT. **Measure; do not trust this line.**

`/usr/bin/git log --oneline origin/main..HEAD` · `/usr/bin/git status --porcelain=v1`

**T7's fix (`6c7af0d`) rebuilt the test on `buildTestApp`** — the real `buildApp` — and the app.ts
mutation that previously survived 937/937 now reddens **all ten tests in the file by name**. It also
took a side-effect worth knowing: routing through the real `setErrorHandler` means `cursor=%00` still
500s but now returns `INTERNAL_ERROR_BODY` instead of leaked Postgres text. **The leaked driver message
was only ever visible because the harness was a bare `Fastify()`** — one root cause, two symptoms. The
limit guard follows `list.ts`'s convention (refuse, don't clamp) using **`store.ts`'s own ceiling of
100**, not `list.ts`'s unrelated `MAX_LIMIT=200` — an error in its first draft, caught before commit.

### T8 (the calendar view-model) — committed, and it caught two lies in the PLAN's own draft

- **The all-hidden month lie.** With every claimed date on a legend-hidden field, the plan's own model
  returns the honest-empty sentence — telling a viewer *"no claimed dates fall in this month"* about
  claims they hid one switch ago. New `CALENDAR_ALL_HIDDEN_COPY`.
- **`epicAncestorOf` disagreed with the server.** The plan tests `typeId === 'epic'`; the server
  (`routes/list.ts:388,410`) groups by **rank 1**. A workspace with its own rank-1 type would get a
  lane on the server and *"No epic"* here. Now injectable, defaulting to the id derived from
  `BUILTIN_TICKET_TYPE_SEEDS` **by rank**.

It also declined to invent color tokens, and the reason is the good one: **Task 8 renders nothing, so
no Task 8 test could redden if it guessed a primitive wrong — a check that cannot fail.** The landed
`tokens.ts` is a role system (`TOKEN_ROLES` -> themes -> `CONTRAST_PAIRS`), not the plan's flat
`color.*` map. **Owner: Task 9**, the first thing that renders one.

**43 mutations, 10 survived first contact, all closed.** Its own note to the next implementer is worth
keeping: *every one of the ten was a fixture where the correct value and the defect's value coincide* —
the grid's string bounds silently absorb malformed days, and a fixture's declared order was also its
alphabetical order. **It also reported one thing it could NOT prove**: deleting the cycle-guard `seen`
set makes the walk loop forever, which hangs the runner rather than reddening a named test — a
did-not-run, not a survivor, and it said so instead of claiming the guard was pinned.

### T8's review — the sharpest finding on this branch so far

**It found the model telling the SAME lie it was proud of fixing, at two other doors.** A month emptied
by a **filter** or by a **lane** prints the honest-empty sentence about a month full of claimed dates.
Demonstrated as shipped behaviour, not under mutation: two August-dated tickets with
`filter:{assigneeIds:['user_nobody']}` yield `emptyCopy = "No claimed dates fall in this month…"`, and
an unmatched `laneEpicId` yields the identical copy. **The commit set the standard — "two different
facts, two different sentences" — and applied it at one door of three.**

Second Important: **the grid's outer edge is unwitnessed at BOTH ends.** The Aug-2026 grid renders
`2026-07-27..2026-09-06`; four mutations survive there, including one that makes **every marker on a
padding day vanish** while **777/777 pass**. The only out-of-grid fixture sits at `2026-10-02` —
**twenty-six days past the edge**, which is exactly why nothing bites. The series' "gate closing one
end of a range" class, here closing **neither**.

## PROGRESS: T1-T7 COMMITTED. T7's fix + T8 IN FLIGHT. **Measure, do not trust this line.**

`/usr/bin/git log --oneline origin/main..HEAD` · `/usr/bin/git status --porcelain=v1`

**T6's fix (`df4834a`) closed all four Importants and both regraded Minors** — test file only,
`sweep.ts` never modified (sha256 matched its HEAD blob). Suite 30 -> 37. **Every "was" figure was
RE-MEASURED rather than inherited from the review**, and its mutation harness refused to run unless the
pattern matched exactly once and printed its own applied diff — which is how it avoided the did-not-run
class entirely. It also found a survivor **the review had missed**: asking the date-loop's gate about
`row.assignee_id ?? ''` instead of the resolved target survived 36/36; the stale loop's recipient
argument was already pinned and the date loop's was not.

It regraded one Minor **up** to Important and fixed it (`ticketTitle`/`field` are user-visible payload
and the stale side was already `toEqual`-pinned — the asymmetry *was* the defect), and kept one at
Minor while fixing it anyway. **Recorded, not fixed, owner: whoever next opens `sweep.ts`** — the
malformed-claim branch at `sweep.ts:194-197` skips a bad `dueDate` claim with a log line and no test
seeds one, so *"skipped, not guessed"* is unwitnessed. `expectNoNotifications` was deliberately left
per-call rather than an `afterEach` so that branch can expect a log line when someone writes it.

### T7 (the notification API) — committed, and its review found the sharpest wiring gap yet

**The shipped handlers are CORRECT.** Every faithful "wrong id" mutation reddens. Three Importants,
all proof gaps plus one missing guard:

| # | Finding |
|---|---|
| **I1** | **The route registration has NO WITNESS.** Deleting `registerNotificationRoutes` from `app.ts:299` leaves **85 files / 937 tests green** — the inbox could ship **404ing on all three routes with a fully green gate**. A contrast mutation (route path -> `/v1/me/notificationsX`) reddens 3 tests by name, so the *handlers* are covered and the *wiring* is not. Root cause: the test hand-builds `Fastify()` instead of `buildTestApp` like **every** sibling route test — and `test/helpers/app.ts:88-92` states exactly why in its own docstring: *"every new route registered in `buildApp` has to be reachable from all of them."* |
| **I2** | **The forged-parameter probe covers one route of three.** A client-readable `?userId=` override added to `unread-count` or `mark-read` SURVIVES 7/7; measured under mutation it returned another user's `{"unread":3}` and flipped their row to `read=true`. **Scope stated honestly by the reviewer:** these mutations ADD a parameter the shipped code never reads, so this is a proof gap, not a live leak — which is why it graded Important, not Critical. The test file claims in prose that *"rows come from the session only"* while testing it on one route. |
| **I3** | **The route validates nothing it takes from the client.** `?limit=1.5` -> **500** (pg 22P02, `invalid input syntax for type bigint: "2.5"`); `?cursor=%00` -> **500** (pg 22021). The handler accepts any `Number.isFinite` value and the store clamps the RANGE but never rounds. **The branch already solved this one file away**: `routes/list.ts:518-527` rejects a non-integer limit with 400, and its comment names this exact trap — *"`Number('2.5')` is 2.5 and fails the integer test"*. Not production disclosure (`setErrorHandler` masks 5xx), and the raw Postgres text was visible only because the harness is a bare `Fastify()` — I1's root cause again. |

## RECOVERY ROUND CLOSED — GATE IS GREEN AGAIN. T6's fix + T7 now in flight.

**The gate is no longer red.** T4's fix (`d060595`) guarded the two unindexed accesses in the style the
production file already used — `const [row] = page.notifications; if (!row) throw` — no `!`, no `as`.
`pnpm turbo run build test typecheck --force`: **24/24, 0 cached, server 923/923 across 84 files.**

**T4's fix closed all eight surviving mutations**, each re-run and each now naming its own site. It also
refused to fake one: the no-redaction-on-revoke ruling is left as a **comment, not a test**, because the
store has no visibility dependency to flip into a revoked state, so no fixture here could catch a future
redacting join. **Saying so is better than a test that would pass either way.** Owner for the real
check: whoever adds a `canSee` join, if anyone ever does.

**T5's fix closed all four Importants and both Minors — and TWO of its three commits are it correcting
its own fix.** `4e02cb6`: *"The boot test waited for nothing: `expect.poll(...).toBe(0)` returns on its
first check."* `60c4931`: *"Three assertions I added had no mutation of their own, and a log spy that
could not see the leak it was written against."* **This is the branch's recorded fix-round pattern
holding: a fix is a change like any other and needs its own verification.**

Two rulings the T5 fix took, both recorded because they are decisions and not deductions:
- **Per-recipient isolation, not documented batch-abort.** An order-dependent disclosure outcome must
  not be settled by where a name happens to sit in a document. The per-recipient log names the *event*,
  never the recipient — and there is now a test that reddens if the recipient leaks into either
  argument of the log call.
- **The contested branch excludes nobody** — a refusal is not something the claimant did — now pinned by
  its own test, where before the fixtures pinned it by accident.

## T6's REVIEW FINALLY RAN, AND THE TZ DISCIPLINE IS REAL — a first for this repo

**The brief's known-gap is broken here for the first time.** The reviewer VERIFIED rather than inherited
the implementer's claim, and did it in the one order that works:

1. **Where is the day boundary computed?** Grepped every query on the sweep's path — the two sweep
   queries, `getWorkspaceSettings`, `getWorkflowDefFromProjection`, `canSee`, `insertNotification` — for
   `now()|CURRENT_DATE|AT TIME ZONE|current_date`: **zero matches.** The comment at `sweep.ts:169` is
   true. **This check had to come first**, because `TZ` on the node process does not move Postgres's
   `CURRENT_DATE`, so if the arithmetic had been in SQL the whole zone loop would have agreed for a
   reason unrelated to the property it names.
2. **Session-TZ controls:** forced the Postgres session to `UTC` and then to `Pacific/Kiritimati`. Both
   green — proving the session timezone is not load-bearing anywhere on this path, so process `TZ` is
   the correct axis.
3. **The mutation reproduced exactly.** Replacing the IST arithmetic with a local-clock read reddens
   **Kiritimati** (cross-midnight: both claims notify on the first sweep) and **Niue** (both cases),
   while **Asia/Kolkata stays GREEN** — which is precisely why a suite that only ever ran in India
   would have shipped it. The file's own predicted table matched.

**Also on this branch, and it is the stale-dist trap from the brief arriving in the wild:** the reviewer
mutated `packages/domain/src/events/workspace-settings.ts` and got 30/30 green. **Not a survivor — a
mutation that never ran**, because `@gisik-nokma/domain` resolves to `dist/index.js`. Re-run against
`dist` (backed up and sha256-verified on restore): **5 tests red.** It reported both legs rather than
the flattering one.

### T6's four Important findings — fix in flight

| # | Finding |
|---|---|
| **I1** | **The `canSee` gate on BOTH sweep paths cannot fail.** Every test injects `seeEverything` (`async () => true`); no test anywhere returns false. Deleting either gate leaves **30/30 green**. A control proves the seam is live (16 red), so only the **deny** direction — the only direction a gate exists for — is unexercised. Concrete leak: `can-see.ts` states the explicit list is exactly the authored list and **assignees are not implicitly appended**, so an assignee omitted from an explicit-mode ticket is denied — and without the gate the sweep posts them a row carrying `ticketTitle` and the claim `note`. Same shape as the mention-gate finding. |
| **I2** | **The staleness range is gated at ONE END.** Nagging a full IST day EARLY survives 30/30; only the too-late direction reddens. The "fresh" fixtures sit 3 and 22 IST days from the boundary — **never one day inside it.** The approaching horizon is correctly pinned at both ends; copy that shape. |
| **I3** | **`state_category = 'open'` is never seeded** — and it is the commonest case there is: `simple-kanban.ts:24` gives the shipped default workflow's `todo` state category `'open'`. Narrowing the date-approaching gate silently stops warning on open tickets (SURVIVED); widening the stale gate starts nagging them (SURVIVED). "Terminal tickets never notify" is only **half** pinned — nothing says a terminal ticket is never stale-nagged. |
| **I4** | **Plan 2's `getWorkflowDefFromProjection` is a declared consumed interface that is never witnessed.** The whole lookup can be deleted (`stateName = null`) with the suite green. The only assertion is `stateName: null`, and the test's own comment admits why: no workflow row was seeded. **The state name is what a person reads in their inbox, and the resolved path has zero coverage.** |

Plus a Minor worth its own line, because it is a *class*: **eight `toHaveLength(0)` assertions cannot
distinguish "correctly suppressed" from "attempted and crashed"** — `deliverToAll` swallows transport
errors and every test passes `log: () => {}`. Demonstrated by accident: a mutation that hit a NOT NULL
violation reported **30/30 green**. This is the second log-spy-that-cannot-see finding on this branch.

## BATCH B+C — T4/T5/T6 committed. (The gate WAS red here; T4 fix cleared it. Kept for the lesson.)

> ### THIS WAS TRUE AND IS NOW FIXED (T4 fix `d060595`). Kept because the LESSON is the point.
> `pnpm --filter @gisik-nokma/server run typecheck` **exits 2**:
> ```
> test/notifications/store.test.ts(132,12): error TS2532: Object is possibly 'undefined'.
> test/notifications/store.test.ts(171,12): error TS2532: Object is possibly 'undefined'.
> ```
> Unguarded `page.notifications[0].x` under `noUncheckedIndexedAccess`, in **Task 4's test file**
> (`57e6991`), whose commit message claimed full verification. **`vitest` is FULLY GREEN — 916 server
> tests pass — and the gate still fails.** CI runs `pnpm turbo run build test typecheck`, so this is
> the gate, not a side check. Three independent parties reported it: T4's reviewer, T5's implementer
> (which proved it pre-existing by running `tsc` at HEAD in a detached worktree where its own files
> were absent), and T5's reviewer. **This is the clearest instance yet of "a tests-pass report is not
> a gate report", and it is worth more than the two-line fix: the branch was green in every way its
> author checked.**

**THE T6 FAN-OUT DIED ON AN API 529 — AND IT DIED *AFTER* COMMITTING.** T6's implementer errored at
183K tokens / 74 tool calls with its work **committed**; T6's reviewer then failed to start at all.
This is step 13's Batch B lesson repeating with a different cause: **a dead fan-out leaves committed
work, not just a gap.** Measured, not assumed — tree clean, `1dad73d` present, server suite 916 green.

> **`3c1dab1` IS ORPHANED. Do not cite it.** It is T6's pre-amend commit; the agent amended before
> dying. `git branch --contains 3c1dab1` returns empty while `git cat-file` passes on it happily and
> hands back the earlier content. **The live sha is `1dad73d`.**

| Task | Committed | Review | Outcome |
|---|---|---|---|
| **T4** store | `57e6991` | opus, ran | **fix-required — 1 CRITICAL (the red gate) + 4 Important.** All four Importants are MISSING TESTS, not broken code: cross-user leakage in `unreadNotificationCount` survives, four of seven `rowToNotification` fields unpinned (including a `userId`/`workspace_id` **column swap**), `nextCursor` off-by-one survives, and a test named "clamps limit to 1..100 and defaults to 30" pins only the lower clamp. |
| **T5** fan-out | `f8d7f4e` | opus, ran | **fix-required — 4 Important + 2 Minor.** The `canSee` gate itself is **well** pinned (deleting it reddens; forcing it false reddens 14). What is unpinned is everything around it — see below. |
| **T6** sweep | **`1dad73d`** | **NEVER RAN (529)** | **UNREVIEWED CODE ON THE BRANCH.** Re-dispatched. Until that returns, T6 is committed and unexamined by anyone but its author. |

**T5's sharpest finding, because it is the one branch with no visibility gate.** `claim.contested` is
deliberately ungated, justified as *"the payload is the claimant's own refused event echoed back"*. The
recipient is `original.actorId` — and swapping it for `env.actorId` left **18/18 fanout and 886/886
server tests green**. Root cause is a FIXTURE defect: both fixtures set contester and claimant to the
**same user**, so the branch's one distinguishing fact is untestable. Plan 10 amendment 16 makes
contester != claimant the *normal* case, and the exemption's own justification evaporates the moment
the recipient is not the claimant. **One fixture defect blinded two disclosure checks on the only
ungated path.**

**Also from T5, an order-dependence worth remembering:** the outer try/catch wraps the whole recipient
loop, so a throwing `canSeeTicket` at recipient N drops N..end. Measured — throw at #1: nobody gets a
row; at #2: only the first does. **Who gets notified depends on the order mentions appear in the
document.** The existing pin uses a single recipient, where "contained" and "aborted" are the same
observation. The task text only promises isolation across *transports*, so the reviewer honestly
flagged it as possibly-within-spec; **my ruling was to pin the behaviour either way**, because an
order-dependent outcome on a disclosure path must not be settled by document order.

**T6's TZ question was answered by construction, and the answer needs verifying not inheriting.** The
implementer avoided SQL date arithmetic deliberately (`sweep.ts:169` claims the predicate carries no
`now()` and no `CURRENT_DATE`), used fixed +05:30 arithmetic via `istDayOf`/`istDayBounds`, and wrote
a mutation table claiming Kiritimati and Niue each **diverge** under a local-clock mutation while
Kolkata stays green. **If that reproduces, it is the first test in this repo to break the 48-file TZ
gap.** The re-dispatched reviewer is told to reproduce it, not believe it.

## LIVE ANCHORS — step 14, Batch A closed. RECOUNTED at the sha below, not carried forward.

| Anchor | Value | How verified |
|---|---|---|
| **Branch** | `exec/14-plan9-calendar`, rebased onto `origin/main` after #88 merged | `git rev-parse --abbrev-ref HEAD` |
| **Base** | `origin/main` — **re-fetch before trusting; it moved four times today** (#87, #88, #89, #90) | `git rev-parse origin/main` |
| **Branch HEAD at Batch A close** | `0520a1c` | `git rev-parse HEAD` |
| **Ahead-count** | **Deliberately not written. Run `git rev-list --count origin/main..HEAD`.** A count taken while writing the commit that records it is always short by one and always looks right to its author. | — |
| **GATE at `0520a1c`** | **check:env exit 0** (45 documented / 23 referenced) · **check:tasks exit 0** · **turbo 24 successful / 24 total, 0 cached, exit 0** · Node v22.22.2 · clean tree at gate start | all three run together on a clean tree with **zero agents running**; exit codes captured explicitly, not inferred from a trailing echo |
| **Test total** | **2,594** — ui 31 · domain **464** · rule-engine **282** · sync-client 8 · editor 178 · web 87 · app-core 687 · server 857 | the same run |
| **Delta, and it RECONCILES** | main = 2,463. Batch A adds **+131**: domain 335 -> 464 (**+129**), rule-engine 280 -> 282 (**+2**). 2,463 + 131 = **2,594**, exact. | subtraction against the controller's post-#85 re-verify figure |
| **Gate SHAPE** | 24 tasks over EIGHT packages — unchanged by Batch A | the run above |

**A NOTE ON `git status` IN THIS WORKTREE, found by the T3 fix agent and worth inheriting.** The
`rtk` hook rewrite can return the single token `ok` for a clean tree instead of porcelain output.
That is fine to read and useless to parse. **Every tree-state claim above used
`/usr/bin/git status --porcelain=v1`**, bypassing the hook. Do the same before asserting a tree is
clean — "ok" and "no output" are not the same evidence.

## BATCH A IS CLOSED — T1, T2, T3 done, fix rounds applied, gate green

| Task | Outcome |
|---|---|
| **T1** startDate day-claim | **SHIP, zero findings.** It was a verification task and the honest answer was that Plan 3's work was already correct — the implementer said so rather than rebuilding it. 4 mutations, all reddened AND named their site. Added 2 rule-engine fixtures (the first to run a built-in day claim through the real engine) and bumped the exact-count pin 84 -> 86. |
| **T2** mention walkers | **One Important, fixed.** `extractMentionedUserIds(null)` was unpinned — `typeof null === 'object'`, so deleting `\|\| node === null` from the guard survived all four tests while flipping null's behaviour from `[]` to a thrown TypeError. The task's own text names `null` as a case to cover, so this was a gap against the contract, not a reviewer's preference. Took the skip branch on `docToPlainText` correctly. |
| **T3** notification vocabulary | **THIRTEEN SURVIVING MUTATIONS behind a "ship" verdict.** The reviewer graded `ship` while listing three Importants and thirteen survivors; **I treated the findings, not the verdict.** All thirteen were MISSING TESTS, not broken schemas — the production code was right throughout and was not touched. Now closed and re-measured in both directions; **no survivors remain.** |

**The T3 fix agent corrected my own dispatch, which is the behaviour to keep.** I handed it thirteen
survivors transcribed from the review. It re-measured the baseline itself instead of trusting me and
found **M12 was never a survivor** — it already reddened. It also ran two mutations *wider* than the
review had (`nonEmpty` spelled a second way; `serverTime` optional at all four sites, not one).

**What the thirteen actually were, because the shape recurs:** almost all were `.strict()` guarantees
that existed in the schema and were asserted nowhere — pinned on 2 of 5 payload schemas, absent on the
nested `claim` object the commit called "carried verbatim", absent on `notificationBaseSchema`. Plus a
day-shape regex with **no test at all** (every input used the one valid value `2026-08-30`). The test
named for the planted defect probed only the TOP level, so invented urgency could live one level down.

**One pin is a TYPECHECK pin, not a vitest pin, and `vitest run` says nothing about it.** The
`NotificationPayload` exhaustiveness check is a type-level identity between the schema map's inferred
outputs and the union. A 6th kind with schema and map entry but a stale union used to typecheck
**clean**; it now fails `tsc` with TS2344. **Anyone verifying with the test suite alone will not see
it** — this is why the gate runs `typecheck`, and why a "tests pass" report is not a gate report.

**RECORDED, NOT FIXED — carried forward with owners:**
- **The `as NotificationPayload` cast in `parseNotification` remains.** It cannot be removed from
  inside a test file, and the plan's Interfaces block fixes the non-discriminated `{ kind, payload }`
  shape, so the fix agent had no licence. The drift it hides is now caught at compile time; the
  residual risk is that deleting one type alias in the test file silently removes the only check.
  **Owner: whoever revisits Task 3's source.**
- **Batch A added ~131 tests with no `test-cases/` entry.** **Owner: Plan 9 Task 15**, which opens
  §11 and reserves ids 11.1-11.47 — it must back-fill these or they never get catalogued.
- **`extractMentionedUserIds(42)` / `(true)` / `({content:'x'})` are unpinned.** Structurally safe
  (traced), and the task contract does not name them, so not built. **Owner: next owner of
  `doc-mentions.ts`**, if parity with `docToPlainText`'s malformed-input list is ever wanted.

## STOP — PLAN 9 NAMES TEST PATHS THAT VITEST NEVER COLLECTS. 25 SITES. READ BEFORE ANY TASK.

**Every test path the plan spells `packages/<pkg>/src/<name>.test.ts` is a suite that CANNOT FAIL.**
All four packages Plan 9 touches restrict collection to `test/`:

| Package | `vitest.config.ts` include |
|---|---|
| `packages/domain` | `['test/**/*.test.ts']` |
| `packages/rule-engine` | `['test/**/*.test.ts']` |
| `packages/app-core` | `['test/**/*.test.{ts,tsx}']` |
| `apps/server` | `['test/**/*.test.ts']` |

**PROVED BY CANARY, not reasoned.** A deliberately failing test (`expect(1).toBe(2)`) planted at
`packages/domain/src/zz-canary.test.ts` left the full suite reporting **"350 passed"**. An explicit
`vitest run src/zz-canary.test.ts` printed `include: test/**/*.test.ts` and collected nothing.

**The plan names `src/*.test.ts` in 25 places** — File Structure blocks, Step instructions, the
`vitest run` command lines at plan lines 163/248/356/364/369, and even a `git add` at line 380.
**Task 2 and Task 3's implementers each caught it independently and deviated correctly**, but that is
two coin flips that happened to land right, not a control. **The next implementer who follows the plan
faithfully ships an invisible suite, and every downstream reviewer sees a green run.**

**THE RULE FOR EVERY REMAINING PLAN 9 TASK, and it goes in every dispatch:** tests live under
`packages/<pkg>/test/` (or `apps/server/test/`), importing the subject as `../src/<name>.js` —
**never by package name**, which resolves through a stale `dist` and tests the wrong build.

This is exactly the shape the brief warns about — *a check passing for a reason unrelated to the
property it names* — with the failure moved one level out: not a test that cannot fail, but a test
that was never run at all, reporting as part of a passing suite.

## CLOCK SENSITIVITY — the brief's named known-gap, enumerated for this plan

**Only TWO places in Plan 9 read a clock, and only one of them is in production code.**

- **T6 (the sweep)** injects `now: () => Date` everywhere it is tested, which is already the right
  design. The risk is a future test falling back to the `deps.now ?? (() => new Date())` default and
  passing because **both machines are Asia/Kolkata**. Every dedupe-key/boundary assertion in
  `sweep.test.ts` must run at least once under a forced non-IST `TZ`.
- **T14** is the one unmocked `new Date()` -> `istToday()` in production. `apps/web/src/ist-today.ts`
  **already exists** (Plan 6) **and already carries the TZ discipline** — a documented
  Asia/Kolkata / Pacific/Kiritimati / Pacific/Niue loop. **Reuse it; do not reinvent a day computation
  inline.**
- **T8, T9, T10, T11 are clock-FREE by construction** — `today`, `month` and `anchor` are injected
  strings. The obligation there is architectural: keep them that way. A `new Date()` appearing inside
  `calendar-model.ts` or `timeline-model.ts` reintroduces exactly the conflation this plan avoids.

> ### THE TZ LOOP IS INERT IF THE DAY ARITHMETIC HAPPENS IN POSTGRES — check this BEFORE believing T6
>
> **`TZ` on the node process does not change `CURRENT_DATE`, `now()` or `date_trunc` server-side.**
> `apps/server` tests hit a real database on 54329. So a sweep written as
> `WHERE due_date <= CURRENT_DATE + interval '3 days'` returns **identical results under every zone**,
> and a reviewer running Asia/Kolkata / Pacific/Kiritimati / Pacific/Niue would report three-zone
> agreement **as evidence the TZ discipline works, when in fact nothing varied.** That is a check
> passing for a reason unrelated to the property it names — the exact shape this series keeps finding,
> wearing a new costume.
>
> **So the discriminating question comes BEFORE the TZ loop: where is the day boundary computed?**
> When T6's review lands, establish that first. If "today", the approaching horizon, or the staleness
> cut-off is computed in SQL, three-zone agreement proves nothing and the real check is varying the
> **session** timezone (`SET TIME ZONE`) or proving the arithmetic is JS-side end to end. T6's
> dispatch pushes toward JS by telling the implementer to copy `ist-today.ts`, so this may well come
> out fine — **but "came out fine" and "was checked" are the distinction this branch is built on.**

## BATCHES for step 14, from the pre-flight and adjusted for shared files

**A: T1, T2, T3** (domain) · **B: T4** (table+store) · **C: T5 then T6, SERIAL** (T6 consumes T5) ·
**D: T7** (API) · **E: T8, T10, T12** (disjoint app-core dirs) · **F: T9, T11** (components over E's
models) · **G: T13** · **H: T14** · **I: T15** (closeout, last).

**T2 and T3 both modify `packages/domain/src/index.ts`** — additive export lines, but run them so the
writes do not interleave.

**BATCH E RUNS SERIAL TOO. Decided now, in the quiet, rather than under pressure with three agents
queued.** T8, T10 and T12 are genuinely independent by directory, so E is the one place the serial
pattern could be broken — but **T8 writes `packages/ui/src/tokens.ts`, which T10 and T12 may READ
while it is half-written**, and the pre-flight called that "a light shared-file coordination point"
rather than no point at all. Against that: nine commits of a working serial pattern with **zero
transient-state incidents**, a cost ruling that explicitly wants thinner machinery, and step 13's
recorded episode where thirteen agents on one shared tree produced states another reviewer read as
tampering and nearly filed as a security finding. **Worktree-per-agent is the alternative the brief
allows; it is not worth its merge overhead for three tasks.** Serial.

**NOT YET VERIFIED, and it is T15's to check LIVE before it writes anything:** the pre-flight took
`Features.md` §11 and `test-cases/11-calendar-notifications.md` as free from the coordination doc's
line ~6546, and said so — *"not verified in this recon pass … worth a live grep before executing."*
**Plans 6, 7 and 8 may have claimed adjacent numbers since that line was written.** The numbering
convention is plan N → §N+2, which puts Plan 9 at §11, but confirm on disk rather than by convention:
this repo has already produced one controller note refusing a section number an executor assumed. **T6 is the floor-list task and carries a hard MUST from the coordination
doc: no stub.** If Plan 5's `getWorkspaceSettings` surface were missing it must STOP and escalate, never
substitute a local constant. It is not missing — `apps/server/src/projections/workspace-settings.ts`
and migration `1788272876259_proj-workspace-settings.sql` are both present.

## COORDINATION OBLIGATIONS BINDING PLAN 9 (verified present in the doc)

- **Notification rows stay UNREDACTED after a user's visibility is revoked** — *"a message you were
  sent is yours; revocation removes future sight, not letters delivered."* T4/T7 must not scrub history.
- **The mention gate stays SILENT server-side** — a mention notification must never become a probe for
  who can see a ticket. Apply `canSee` before delivering. Editor-side "unreachable mention" warnings are
  *permissible polish, not queued scope*.
- **Preferences are whole-document** `GET/PUT /v1/me/preferences?workspaceId=`, not the per-key
  `PUT /:key` Plan 9 assumed. T13's gateway does read-modify-write, inheriting last-write-wins. **Do not
  "fix" it back toward the plan's text.**

# ============================================================================
# EVERYTHING BELOW THIS LINE IS STEP 13 (PLAN 8) HISTORY. Step 13 is MERGED.
#
# It is kept because its LESSONS are live and several were expensive to learn.
# It is NOT a position, and nothing below it tells you what to do next --
# the sections above do. Read below for method, never for state: its "next
# work", "in flight", "remaining" and "no PR is open" phrasings are all spent.
# This banner exists because the previous version of this file was refreshed
# at its top and stale twenty lines down, and merged to main that way.
# ============================================================================

## THE SEQUENCE, and where step 13 sat

Spine: `1,2 → 3,4 → 5 → {6,7,8,9,10} → 11`. **Steps 1–12 are closed.**

Remaining: **13. Plan 8** (here) · 14. Plan 9 *(T6 floor-list)*, T14 after `apps/web` · 15. Plan 10
remainder *(T7, T9, T14/T15 floor-list)* · 16. Plan 11 *(T8/T9, T12 floor-list)* — last by
construction.

## PLAN 8's FLOOR-LIST ENTRY IS ALREADY DISCHARGED — and that licenses less than it looks like

The coordination doc's floor list names exactly one Plan 8 item: **"Plan 8's F5 amendment (the
'cover' semantics are a design call)"**. Coordination line 546 records that the amendment was
**pulled forward as its own PR** because no task in any plan absorbed it — *"Plan 8 only consumes
`adviseWorkflowDef`, never modifies it."* **Verified on disk at this base:**
`packages/domain/src/advise-workflow.ts` ships both advisory sweeps (`rdu-bypassable`,
`rule-bypassable`), and the COVER design call is made *and argued* in its docblock —
same-kind-present, parameters never compared, stated explicitly as "a floor, not a proof of equal
strictness". `packages/domain/test/advise-workflow.test.ts` and the rule-engine fixtures exist.

**So Plan 8 carries no floor-list task. It does NOT follow that Plan 8 is a sonnet plan.** The
MODEL & EFFORT class rows are independent of the floor list, and two of them — *honesty-carrying
view-models* and *fixture authoring and planted-defect design* — are opus-high wherever they appear.
**Priced as opus BEFORE the batch starts, not discovered mid-batch:**

| Task | Why opus |
|---|---|
| **T8** live validation | Eleven issue codes, each owed a planted-defect test, **plus the advisory code whose test proves the OPPOSITE property** — that publish stays *enabled* while a warning is on screen. That inversion is exactly where a check that cannot fail hides. |
| **T9** publish flow | Server refusals rendered verbatim + the stranded-state mapping dialog, where occupancy is **"a builder courtesy, never an engine input"**. A refusal that depends on a count would make the two engines disagree by construction. |
| **T11** ticket-type management | The plan's own title names it: *"the divergence a re-binding leaves behind"*. |
| **T12** admin gating end-to-end | A read-enforcement surface. This series has produced rulings P19, P22 and P23 on exactly that shape, **every one a disclosure no test caught**. |

Escalation runs upward; the cost ruling lowered floors, it did not forbid this. **Plan 7's T10 was
not on any floor list and its escalated reviewer found the step's most dangerous unfalsifiable
check.**

## FIVE THINGS THAT WILL COST A ROUND EACH IN STEP 13

**1. The catalogue home is §10, NOT §8 — and the §8 refusal on record does not apply here.**
`Features.md` runs §7 → §9 → §12 and `test-cases/` holds `03,04,05,06,07,09,12`. The numbering is
**plan N → §N+2** (§1 Reference base and §2 Product design sit ahead of the plans): Plan 1→§3,
Plan 3→§5, Plan 5→§7, Plan 7→§9, Plan 10→§12. **Plan 8→§10.** Ledger row `06/16` carries a
controller note refusing §8 — **that refusal is about PLAN 6's web client**, whose catalogue landed
in §3 because migrating 112+ live cross-referenced ids breaks the never-renumber rule. It says
nothing about Plan 8. Plan 8's own Task 15 pins **§10 / `10-workflow-builder` / cases `10.x`** and
instructs: *"If the numbers on disk disagree at execution time, stop and flag it to the
orchestrator; do not take another number."* **They do not disagree — §10 and
`test-cases/10-workflow-builder.md` are both free.** T15 therefore **opens** a section rather than
extending one, which is the opposite of Plan 7 T16's situation. New cases start at **10.1**.

**2. `@xyflow/react` is NOT installed anywhere in the monorepo** — swept across the root and every
`packages/*` and `apps/*` `package.json`. Task 5 adds it. **The jsdom hazard is the real cost:**
React Flow measures its container, and in jsdom with no `ResizeObserver` and no explicit
width/height **it renders no nodes**. That fails two ways and the second is worse — confusing red,
or **a green suite asserting over an empty canvas**. The discriminating check is a planted defect
that *removes a node* and must redden. If it does not, the harness is not rendering and every
canvas assertion in the plan is vacuous.

**3. T4's gateway — MEASURED, and the answer is the opposite of the feared one. ALL SEVEN
OPERATIONS ARE ALREADY SERVED BY A REGISTERED ROUTE.**

`apps/server/src/routes/builder-reads.ts` exists, and `registerBuilderReadRoutes` is **called** at
`apps/server/src/app.ts:253` — not merely defined. It registers exactly Plan 8's gateway surface:

| Gateway operation | Route | builder-reads.ts |
|---|---|---|
| `listWorkflows` | `/v1/workspaces/:workspaceId/workflows` | 482 |
| `getWorkflow` | `/v1/workspaces/:workspaceId/workflows/:workflowId` | 500 |
| `listTicketTypes` | `/v1/workspaces/:workspaceId/ticket-types` | 531 |
| `listMembers` | `/v1/workspaces/:workspaceId/members` | 547 |
| `getStateOccupancy` | `/v1/workspaces/:workspaceId/workflows/:workflowId/state-occupancy` | 580 |
| `getTypeWorkflowPopulation` | `/v1/workspaces/:workspaceId/ticket-types/:typeId/population` | 602 |
| `migrateTypeToWorkflow` | `/v1/workspaces/:workspaceId/ticket-types/:typeId/migrate` | 693 |

`submit` rides `registerEventRoutes`, called at `app.ts:204`. **So Plan 8's gateway is NOT a mocked
contract excusing a server that does not exist** — the read surface landed ahead of it.

**Two consequences, and the second is a live correction to the plan.**

- **The plan's own assumption 3 is now stale.** It calls the migrate endpoint *"unowned server
  work — see Open question 13"* and assumes the path
  `POST /v1/workspaces/:workspaceId/ticket-types/:typeId/migrate-workflow`. **The real path is
  `…/:typeId/migrate`** and the endpoint is built. T4 and T13 must consume the real path; an
  implementer transcribing the plan's assumed path would write an adapter that 404s, and no
  app-core test would notice because the fake answers instead.
- The fake stays justified for tasks 5–12 — but T13's adapter is now checkable against a real route
  rather than a promise, and **T4's docblocks must not claim any of these is unserved.**

**The sweep that found this failed its own control first, and the correction is the transferable
part.** The pattern `export function register[A-Za-z]*Routes` returned 12 registrars and **omitted
`registerAttachmentRoutes`, which is known to exist** — because that one is declared
`export **async** function`. Twelve results looked like a complete enumeration. Re-run as
`export (async )?function …` it returns **13**, and the one registrar with no call site is
`registerAttachmentRoutes` — which independently re-confirms step 12's finding. **An over-specific
sweep returns a well-formed wrong answer, and the only thing that exposed it was knowing one row
that had to be in the output.**

**The original hazard, kept because it still binds the shape of T4:** T4
defines `WorkflowAuthoringGateway` and its in-memory fake, and **twelve tasks then build against
that fake** before T13 ever touches a real `DataSource`. The wave-boundary integration checkpoint no
longer fires and step 10's replacement is spent. **Do a server-read inventory BEFORE T4**, not at
T13: enumerate every read and write the gateway needs (workflow list, def fetch, `getStateOccupancy`,
ticket-type reads, publish submit) and check which the shipped server actually serves. The publish
path is wired — `registerEventRoutes` resolves to `app.ts:204`. The **reads** are the open question.
Where a read does not exist, the honest shape is for T4's interface to make the gap visible so T13
surfaces `ServingGapError` — **never to weaken one to make a view light up**, which main's handoff
explicitly forbids. Step 12's final review found `registerAttachmentRoutes` is defined and **never
called**, so "the module exists" is not evidence the route serves.

**3b. PLAN 8 COVERS ONE OF THE TWO ADVISORY CODES THAT SHIP, AND ITS OWN CATALOGUE TEXT SAYS SO.**

Measured with a positive control in the same run: **`rule-bypassable` appears 0 times in Plan 8**,
while **`rdu-bypassable` appears 17 times in the same file**, and
`packages/domain/src/advise-workflow.ts` demonstrably emits **both** codes. Plan 8's text predates
the F5 amendment commit `c7fef4b` (*"Every guard now says when an arrow goes around it, and the
arrow that carries its own guard says nothing"*), which is the commit that added `rule-bypassable`.
The amendment was pulled forward as its own PR precisely because no task absorbed it — and the
consequence nobody wrote down is that **the plan that consumes the advisory tier still describes the
one-code version of it.**

The code half is harmless: the advisory section is fed by `adviseWorkflowDef` and anchored through
the same widened `anchorIssues`, so a `rule-bypassable` advisory **renders correctly today with no
change**. Two things are not harmless:

- **Task 8's advisory coverage table has one row (A1, `rdu-bypassable`).** Nothing exercises the
  second code, so the claim "the advisory tier is covered" would hold for half the tier. Given the
  plan's own standard — *"Without the pair, 'advisories do not gate publish' is a convention rather
  than a guarantee"* — the same argument applies to the second code.
- **Task 15's `Features.md` text is dictated verbatim by the plan and says the advisory section
  "carries `rdu-bypassable`"**, naming one code where two ship. Transcribed faithfully, that ships a
  false catalogue claim, in the document whose whole purpose is describing reality.

**Conservative default taken, per the coordination doc's ruling protocol** (take the conservative
option, record it in the same change set, notify, continue — never block): **cover both codes and
correct the one catalogue sentence.** This widens Task 8 by one test and edits one dictated
sentence in Task 15; it does not touch `packages/domain`, whose COVER semantics are settled and must
not be reopened. Recorded here rather than fixed on the spot because the tasks that own it have not
run yet — **this is a note to T8 and T15, not a licence for any other task to touch the tier.**

**4. The `apps/web` TS6053 hazard returns at T13, which adds six pages.** `apps/web/tsconfig.json`
excludes `.next` because Next's default `include` globs a directory `next build` deletes while turbo
runs typecheck concurrently — measured **2 red of 3** without the exclude. It cannot be a narrower
include: `next build` rewrites that file's `include` every run and never touches its `exclude`.
**If the gate reddens on `@gisik-nokma/web:typecheck` with TS6053, this is why — and run it three
times before believing either answer.**

**5. Verify BEFORE T14 whether Playwright is installed and whether CI actually runs it.** T15's own
verification step accepts `pnpm --filter web e2e` **SKIPping loudly when the env gate is unset** as a
pass. A smoke test that is outside the gate and skips by default is a check that cannot fail. State
plainly in T14's commit which of the two it is.

## THE THREE THINGS FROM EARLIER STEPS A SUCCESSOR MUST NOT UNDO

1. **`Chosen<T>`'s default arm carries no `value`, deliberately**
   (`packages/app-core/src/views/view-types.ts`). A pair would let a consumer read `.value` and
   ignore `.origin`, which is how ruling P24 was being violated. The obvious tidy-up restores the
   defect.
2. **`packages/app-core/src/views/transition-dialog.tsx` resolves wildcard-vs-exact by
   `find(exact) ?? find('*')`**, matching the engine and `precheck.ts`. That is **Ruling P27**,
   applied in step 12, pinned by cases 3.149–3.151. Restoring first-declaration-order kills exactly
   one test (3.149). Plan 8 authors workflow defs constantly and will meet this resolution; do not
   "simplify" it back.
3. **The six `ServingGapError` refusals in `packages/app-core/src/online/` are the point, not a
   shortfall.** Each is cross-checked in `apps/server/test/integration/client-contract.test.ts` and
   goes RED the day its route serves the field. **Do not weaken one to make a Plan 8 view light up.**

## RECORDED, NOT FIXED — carried into step 13 with owners, from step 12

- **`registerAttachmentRoutes` is never called** (`routes/attachments.ts:211` is its only appearance
  in `src/`), so the `attachments` table can never gain a row and `image-embed-gate` refuses every
  embedded image: correct about the rule, useless as a product. **Owner: Plan 11's deployment work**,
  which owns the boot path, the `start` script and the deployment target.
- **`.env.example` carries a stale `S3_*` placeholder block** predating T8's `OBJECT_STORE_*`
  variables. **Owner: Plan 11's deployment hardening.**
- **`comparableHeaders` is defined locally in ELEVEN server test files**, all byte-identical.
  **Owner: a later test-helper consolidation.**
- **`schema.test.ts` carries two "CURRENT BEHAVIOUR pending Task 5" cases about paste-rule
  autoformatting that Plan 7 Task 5's text never covers.** **Owner: plan author.**
- *(raised in step 13, not carried from step 12.)* **`packages/app-core/test/helpers/fake-data-source.ts`
  validates nothing.** Its `ingest` pushes to
  an array and runs no schema check, so it is the seam through which the `toStateId` payload drift
  and the non-ULID seed `actorId`s pass silently (coordination doc §"The validating fake", 2802–2825).
  It is the sibling of the seam Plan 8 T4 hardened (`createFakeGateway`), and T4 does not touch it.
  **The doc's own assignment — "Owner: Lane 4" at line 2825 — names an owner that no longer exists.**
  (The review that raised this cited 2826; that line is blank. Measured: 2825, and it is the only
  `Owner: Lane 4` in the file — the other `Owner: Lane` is Lane 2 / Plan 4 at 2590.)
  Lane 4's own file opens *"execution state at fold-back to serial … written 2026-08-31 when Wave 1
  folded back into serial execution"*, and the last mention of the lane anywhere in the coordination
  doc is line 4001 of 6169 — a back-reference to a dependency version it shipped, inside a 2026-08-31
  section — with roughly 2,100 lines of later material naming it nowhere. Two sweeps found no
  successor: succession vocabulary (`successor`, `inherits`, `picks up`, `passes to`, `reassign`,
  `carried into`, `hands off`) and the item's own vocabulary (`fake-data-source`, `validating fake`,
  `app-core/test/helpers`), each run through `rtk proxy` with a positive control from the same run.
  Lane 4's `lane4-periphery-state.md` §6 "Open claims on other plans" does not carry this item either
  — it carries only the `seed.ts` non-ULID half, **and that bullet names no owner at all**, so it is
  orphaned by the same fold-back and needs one too. **Owner: the serial executor chain**, recorded
  here because this file is the surface a task boundary actually reads. **Do not re-assign to Plan 6**,
  which created the file and has closed: measured in `task-ledger.tsv`, all eighteen `06` rows read
  `done` with a merge sha, against a positive control of fifteen `08` rows reading `todo` in the same
  run. (`executor-state.md`'s own lesson list says step 12 twice mis-assigned work to Plan 6 after it
  closed; that aside is what prompted the check, not what settles it.)

## BATCH A — T1, T2, T3, T4. All committed. Gate green at HEAD.

| Task | Result |
|---|---|
| **T1** draft store + layered auto-layout | **DONE.** One Important: **the copy-on-write immutability the plan's own header names was pinned by NOTHING** — mutating `renameState` to assign in place left all 497 app-core tests green and `tsc` silent. The implementer's own commit title records the sequel: *"the test I wrote to pin it passed on mutating code twice before it worked."* The reviewer also reported a genuine **survivor** (dropping the dangling-marker guard in `layoutDraft` kills nothing) and — this is the part that matters — **stated in the same breath that the mutation demonstrably ran**, which is the distinction between an unconstrained path and a mutation that never executed. Only the second condemns a check that is fine. |
| **T2** summaries, field choices, per-code anchoring | **DONE.** Two Important: `BUILTIN_FIELD_CHOICES` was missing `startDate` against domain's own `BUILTIN_FIELD_IDS`, and a `duplicate-transition` anchor queue whose fixture could not distinguish one-anchor-per-repeat from the correct grouping — **the reviewer reported that mutation as a non-site-identifying survivor rather than a pass**, and the fix round replaced the fixture. Anchoring was separately verified order-independent by reversing `validateWorkflowDef`'s output and re-running. |
| **T3** template gallery | **DONE, and it did not fall into the trap.** It imported `SIMPLE_KANBAN_TEMPLATE` from `packages/domain/src/simple-kanban.ts` and created only the genuinely-absent `errand-with-waits.ts`. **It also found a real conflict nobody had ruled** — see below. One **Critical**, and it was against T3's own ruling-request prose. |
| **T4** gateway, validating fake, event builders | **DONE.** Nine mutations run, **every one site-identifying**. One Important, again against prose: the commit's owner-verification claim for a recorded item was false in both its parts. |

**The through-line of Batch A: eight of the ten findings were against PROSE, not code** — false owner
verifications, a present-tense claim the same commit falsified, an incomplete absence enumeration, and
arithmetic that did not close. **The tests, where mutation-proved, held.** That is the same
distribution steps 11 and 12 produced, and it is the argument for keeping the reviewer stage at the
lowered floors: the gate does not run prose.

### T3 found a conflict that no plan had ruled, and correctly refused to resolve it

`ERRAND_WITH_WAITS_TEMPLATE` is pinned by Plan 11's `checkErrandTemplate` oracle and its own docblock
(*"Edit this only with that check green"*). It trips **`rule-bypassable` twice**: `require-comment`
guards `in-progress → waiting`, while `later → waiting` and `next → waiting` enter the same state
carrying no such rule — and `later → waiting` **must stay rule-free**, because it is one of the seed's
pinned one-hop paths. Task 3's own prose asserts the opposite invariant twice: *"a shipped template
that greets the author with a warning is a shipped template that is wrong."* **Both cannot hold.**

T3 took the conservative path: it recorded the **actual** advisory output in `templates.test.ts`
rather than asserting the stale "warns about nothing" claim for that one template (the other two
still assert clean), touched neither the template nor the check, and filed a ruling request.
**Recorded as an open ruling — do not let a later task resolve it by fixing the template or
weakening the check.**

### The Critical was an overclaim inside the ruling request itself, and the fix needed two commits

T3's ruling request titled itself *"unowned by any open plan"* and asserted it had **verified** Plan 2
does not claim the check. Its reviewer refuted this: the **F5 ruling at coordination lines 512 and 521
designed `rule-bypassable` into existence** (*"adviseWorkflowDef emits a `rule-bypassable`-style
advisory for any guarded target also reachable by a lower-guard edge, for every rule kind"*). The
heading now reads *"Plan 2's own ruling designed the check but did not settle this shape"*, which is
the honest narrowing.

**The fix round then needed a SECOND commit (`bdcb5a6`) to withdraw the claim properly** — the first
correction was itself incomplete. That is this series' most reliably recurring pattern, now observed
again on this branch, and it is the whole argument for reviewing a fix round rather than trusting it.

### T4's reviewer compared the fake against the REAL door, and the fake's absence list was short

The coordination doc's Lane 3 ruling (*"the validating fake"*, ~lines 2806-2825) is **not in Plan 8's
own Task 4 text**; it was injected into the dispatch and implemented — `createFakeGateway` now runs
every submitted event through the shipped `submittedEventSchema`, proven by two mutations (disabling
validation, and recording an invalid envelope as submitted) that each redden exactly one test.

But the fake's docblock enumerated its divergences from the real door **incompletely**. A probe that
ran the same events through both found two more: **entity-kind mismatch** (`parseEvent` refuses a
`workflow.defined` filed against a ticket; the fake commits it) and **duplicate event id** (the real
door answers `{status:'invalid', code:'duplicate-event-id'}`; the fake commits it twice, returning
the same `eventId` with `seq` 1 then 2). **An absence enumeration that is short is exactly as
misleading as a partiality marker**, which is why the rule says enumerate rather than say "partial".

### The test-delta arithmetic did not close, and the shape of the error is worth keeping

T4's commit claimed app-core `474 → 543` with *"Tasks 1-3 already added 69 before this one"* and
*"this task added 11"*. **474 + 69 = 543 leaves nothing for the 11.** The 69 was the whole-workspace
delta (2301 − 2232) re-used as the Tasks 1-3 figure, double-counting T4's own contribution.
Re-measured by excluding the task's own test file: **Tasks 1-3 added 58, T4 added 11, 58 + 11 = 69.**
A decomposition that reconciles at the total and not at the parts reads as verified — the total was
right, which is what made it persuasive.

## BATCH B — T5, T6, T7, T8. All committed. Gate green at HEAD.

| Task | Result |
|---|---|
| **T5** React Flow canvas | **DONE**, and it settled the harness question first, as instructed. Two Important, both **false claims in prose**, and its fix round **died mid-write on the expired login** — recovered and committed as `87ab662` after independent verification. See the harness findings below. |
| **T6** select-to-edit inspectors | **DONE.** One Important: **the coordination doc's own test-count arithmetic was self-refuting** (`573 → 578` with a claim no pre-existing test changed status). T6 was told to measure the connect gesture and **did** — result below. |
| **T7** rule editors | **DONE.** One Important, and it is a **finding class worth naming: every conditional affordance was asserted present-when-expected and never absent-when-not**, so none could detect OVER-firing. Load-bearing for the require-field unknown-field warning, which is the only enforcement of design decision 3 anywhere in the product. The reviewer proved it by running both directions of each mutation: `isEmpty = false` (helper never shown) reddens; **`isEmpty = true` (helper ALWAYS shown) does not.** |
| **T8** live validation *(opus/opus)* | **DONE, verdict SHIP — 27 executed mutations, the most thorough review on this branch.** All eleven issue codes reddened individually and by name; **both** advisory codes anchored; merging the two tiers reddens five tests; truncating the advisory list reddens one. It also mutated `packages/domain/src/validate-workflow.ts` itself to confirm the app-core tests genuinely reach the real validator, and mutated `packages/ui/src/ui.css` to confirm the token-discipline check catches a raw hex. |

### The jsdom harness, now measured in three parts rather than assumed

1. **Rendering is real.** Mutating `state-node.tsx`'s `{data.name}` to a literal reddens canvas tests
   by name. The canvas assertions in Tasks 5-10 are not theatre.
2. **`setup.ts`'s `Object.defineProperty` wrapper is load-bearing for GESTURES, not clicks.** Without
   it d3-drag's `nodrag(event.view)` throws on user-event's `view: null`, **jsdom's own dispatch
   SWALLOWS the TypeError**, and the gesture silently no-ops while 561 tests stay green. The drag test
   added in T5's fix round is the only assertion in app-core that reddens when the wrapper goes —
   **verified independently by me: exactly 1 of 11 canvas tests fails, and it is the drag test.**
3. **A connect gesture CANNOT be driven to completion in jsdom, and T6 measured it rather than
   assuming.** The test is named for what it establishes, and its planted defect
   (`onConnectStart` firing `addTransition`) reddens it. **The mapping layer
   (`connectionToTransition`) carries the property instead.** Recorded in the coordination doc under
   `## Plan 8 execution consequences (2026-09-03) — the connect gesture, measured and closed`
   (~line 6171) so Tasks 9-10 read it rather than re-deriving it.
4. **jsdom has no layout engine**: every `getBoundingClientRect` is 0x0 and a drag lands a **zero
   delta**. A gesture test must assert the action firing, **never a coordinate**.

### A stale citation I wrote into two dispatch briefs, caught by T8's reviewer

My Batch B and C briefs cited the errand-template ruling request as *"the coordination doc's Plan 8
execution consequences, entry 5"*. **That was true when T3 filed it and false by the time I wrote
it**: T3's own fix round (`48c3655`) moved the entry to its **own top-level heading**,
`## RULING REQUEST — Plan 8 Task 3's frozen errand template trips rule-bypassable` (~line 6126). Worse,
`## Plan 8 execution consequences` (~line 6171) now exists as a **different** section — T6's
connect-gesture record — so the stale pointer resolves to a real heading that is not the subject.
**A pointer that lands on the wrong real section is worse than one that lands nowhere**, because
nothing about it looks broken. Corrected in the Batch C brief; `batch-d` never carried it.

## BATCH C — T9, T10, T11, T12. All committed.

| Task | Result |
|---|---|
| **T9** publish flow *(opus/opus)* | **DONE.** Two Important, and **both were tests named for properties their own fixtures could not decide.** (1) `bumps from the PUBLISHED base` could not tell the base from the draft: `draftFromPublished` copies `published.version` into **both** `def.version` and `base.version`, so for every draft that file can build, `base.version + 1` and `def.version + 1` are the same number. It ruled out a hard-coded 1 and nothing else. (2) The occupancy-failure test asserted only the **first** half of its named property — it stopped at `toBeDisabled()` and never picked a target, never re-enabled, never published. **The mutation "make a failed count block publishing" SURVIVED**, which is exactly the missing half. |
| **T10** the three screens | **DONE.** Two Important, both about error handling the plan never specified: `Promise.all([...]).catch()` collapsed a **documented-normal** guest roster refusal into a full-screen fatal error — making the empty-roster degradation path unreachable through the screen and throwing away a successfully-loaded `ticketTypes` — and `WorkflowListScreen` had **no `.catch()` at all**, so a rejection left it on "Loading workflows…" forever. |
| **T11** ticket types *(opus/opus)* | **DONE — one CRITICAL, and it is the sharpest finding of the step.** See below. It also corrected the coordination doc's false "Done", and **corrected an absence claim of mine in the process.** |
| **T12** admin gating *(opus/opus)* | **DONE, verdict ship on 16 mutations — but its Important is a lesson about enumeration.** The gate enumeration the commit was built on **stopped at the builder screen**. The ticket-type editor — the other half of the gate, and the half that owns field-schema and rank authoring — got no control enumeration and no button sweep, so **three of its five non-author gates were pinned by nothing and all three mutations survived the full 211-test suite.** Fixed in `c5f7c60`. |

### T11's Critical: the move gate asked the wrong question, and the wrong question is answerable

`ticket-type-editor-screen.tsx:249` gated an irreversible bulk migration on
**`save.phase !== 'saved'`** — *"has this form ever been saved?"* — rather than on whether the
**selected binding matches the saved one**. Both questions return "yes, allowed" in the common case,
which is why it read as correct. **After saving a re-bind, an admin can re-point the combobox again
and fire the migration at a workflow the tickets were never bound to** — an irreversible bulk
operation aimed by a stale answer to a question nobody meant to ask. Fixed in `7d993f2`.

A second Important on the same screen shares the shape: the completed-move sentence **re-read the
live combobox** instead of the workflow the migration actually targeted, so changing the binding
afterwards silently rewrote a statement about a past action into a false one. The `migrated` payload
carried the count but not the destination.

**The transferable form: a gate that asks a question whose usual answer coincides with the right
one.** It is not detectable by reading the gate — only by asking what it would do when the two
answers diverge.

### T11 corrected an absence claim I wrote, and the correction is the "nobody holds the moment" rule

My Batch C brief told T11 that a repo-wide sweep returned **zero files** for six names, including
`migrateTypeToWorkflow`. **That was measured before Task 4 ran and carried forward unchanged after
it.** At the sha T11 measured, `migrateTypeToWorkflow` returned **three** files — `gateway.ts`,
`fake-gateway.ts` and `events.test.ts` — because **Task 4 had already landed the gateway method and
its fake.** Re-verified by me at HEAD: **five** files now, against a control of 34 for
`adviseWorkflowDef`.

**The enumeration was true when I made it and false when I used it, and nothing about its form said
so.** What was actually missing was every *consumer* of that method, not the method. T11 put the
correction in the coordination doc rather than quietly dropping the row, which is the right call:
the corrected line now names its own controls and states which row was stale.

**Rule, restated because I broke it while quoting it: an absence sweep is a fact about a moment, and
a brief that carries one across a task boundary must re-measure it or date it.**

## TWO FINDINGS FROM THE ADAPTATION MAP THAT REACH BEYOND ONE TASK

### A. RULING REQUESTED — T13's adapter cannot be written as scoped. Four operations have a live
### route and no seam to reach it through.

Plan 8 amendment 10 says the builder consumes `WorkflowAuthoringGateway` and **`apps/web` implements
it over Plan 6's `DataSource`**. Measured against `packages/app-core/src/data-source.ts:125-139`:

| Gateway operation | `DataSourceQuery` member | Server route |
|---|---|---|
| `getWorkflow` | `getWorkflowDef(workspaceId, workflowId, version?)` | served |
| `listTicketTypes` | `getTicketTypes(workspaceId)` | served |
| `listMembers` | `getMembers(workspaceId)` — **returns `Actor[]`, not `WorkspaceMember[]`** | served |
| `submit` | `ingest(events)` | served |
| **`listWorkflows`** | **absent** | `/v1/workspaces/:workspaceId/workflows` — LIVE |
| **`getStateOccupancy`** | **absent** | `…/workflows/:workflowId/state-occupancy` — LIVE |
| **`getTypeWorkflowPopulation`** | **absent** | `…/ticket-types/:typeId/population` — LIVE |
| **`migrateTypeToWorkflow`** | **absent** | `…/ticket-types/:typeId/migrate` — LIVE |

**Four of eight operations have a real, registered, working HTTP route and no `DataSource` member to
reach them through.** This is not the usual shape of this series' failure — the server is *ahead*,
not behind. T13 as scoped ("an adapter over `DataSource`") is therefore **not writable** without one
of:

- **(a)** extend `packages/app-core/src/data-source.ts` with the four members — a **cross-plan touch**
  of Plan 6's file, and it widens an interface every existing `DataSource` implementation must then
  satisfy (the online one, the fake, and Plan 10's replica);
- **(b)** have the `apps/web` adapter call the four routes through the existing `online/http` client
  directly, leaving `DataSource` untouched. Amendment 10's rule is that **views** never speak HTTP;
  the adapter is not a view, and the view still sees only the gateway. Narrower, and it does not
  force Plan 10's replica to grow four members it has no offline answer for;
- **(c)** defer the four to a later plan and have T4's interface carry an honest refusal for them —
  but three of the four are load-bearing for Tasks 9 and 11, which are *in this plan*.

**Conservative default if no ruling arrives before Batch D: (b)** — it is the narrowest change, it
touches no other plan's file, and it cannot break an existing `DataSource` implementor. Recorded
here so the choice is visible rather than made silently inside T13. **`getMembers` returning `Actor[]`
where the gateway wants `WorkspaceMember[]` is a second, smaller reconciliation T13 owes regardless
of which option wins.**

### B. THE COORDINATION DOC CARRIES A FALSE "Done" ABOUT THIS VERY PLAN, AND IT IS THE DANGEROUS KIND

Coordination doc **line 216** reads: *"~~Plan 8 — the divergence-notice component.~~ **Done** — it
was already complete when this line was written; the agent that appeared to stall mid-insert had
finished. **Verified against the code rather than the note**: the copy table, the population read
with its honest-degradation states, the helper functions, the JSX, and the tests are all present,
including 'Leave them on …' as an affirmative button beside 'Move them to …'."*

**It is false.** Measured two ways, with positive controls in the same run:

- `git log --all --oneline -- packages/app-core/src/workflow-builder` is **empty** — no commit on any
  branch has ever touched that directory. Control: the same command against
  `packages/app-core/src/views` returns commits.
- A repo-wide sweep of the artefacts that line enumerates returns **zero files** for `Leave them on`,
  `Move them to`, `WorkflowRebindDialog`, `rankImplications`, `migrateTypeToWorkflow` and
  `TicketTypeEditorScreen`. Controls in the same run: `transitionOptions` → 6 files,
  `adviseWorkflowDef` → 6 files.

**What makes it dangerous is not that it is wrong but how it is wrong.** It does not merely assert
completion — it asserts completion *and claims to have verified against the code rather than the
note*, then enumerates five specific artefacts. That is the exact rhetorical shape a reader uses to
decide a claim is trustworthy, which is why a reader who hits it would skip Task 11's divergence
work entirely. **This is the "a pointer from a correct document to a stale one reverses" lesson in
its most persuasive costume: a stale claim wearing the vocabulary of verification.**

**Action: Task 11 is built in full, as if the line did not exist, and the line is corrected in the
same change set as Task 11.** Not corrected earlier, because the honest correction is *"absent, and
here is the commit that supplies it"*, which cannot be written until the commit exists.

## THE POST-MERGE GATE WENT RED ON NODE DRIFT, AND `which pnpm` DOES NOT TELL YOU THE RUNTIME

Recorded because the recorded rule (*a gate result is not evidence unless it names its Node*) is
right about the symptom and does not explain the mechanism, and the mechanism is what makes the trap
survivable.

I ran one gate without `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"`. It went **RED**:
`13 successful, 21 total`, with **4 failures in `packages/sync-client`'s `better-sqlite3` conformance
tests** and this in the log —
`/Users/kiro/.nvm/versions/node/**v24.11.1**/bin/pnpm run test exited (1)`. A native binding built
for v22's ABI, loaded under v24. **Nothing about the failure text points at Node**; it reads as a
storage regression, and it appeared in the same command as a merge, which is exactly the moment a
red is most likely to be blamed on the merge. *Run the gate BEFORE a merge so a post-merge red is
attributable* is why this was catchable at all.

**The part worth keeping, because it defeats the obvious check:** with the export applied,
`node --version` prints **v22.22.2** while `which pnpm` prints
**`/Users/kiro/.nvm/versions/node/v24.11.1/bin/pnpm`** — in the same shell, at the same moment. Both
are true and they are not in conflict. `pnpm` is installed only under v24's bin, but it is a
`#!/usr/bin/env node` script, so **the `node` first on PATH decides the runtime regardless of which
directory the pnpm script lives in.** A successor who "verifies the toolchain" with `which pnpm` will
see v24 and conclude the gate is compromised when it is fine; one who checks `node --version` alone
sees v22 and is right, but for a reason they cannot articulate and therefore cannot defend.

**The check that actually discriminates is the one already in the repo:**
`apps/server/test/node-version.test.ts` **self-asserts the Node the suite is running under**, inside
the gate. Confirmed present in the green run. **Trust that, not `which`.**

Re-run with the export: **exit 0 · 24/24 · 0 cached · 2463 tests**, identical composition to the
pre-merge run. **The merge was never implicated.**

## THE GATE IS TWO COMMANDS AND I WAS ONLY RUNNING ONE — read this before reporting any gate result

**`pnpm turbo run build test typecheck` IS NOT THE CI GATE. It is half of it.**
`.github/workflows/ci.yml` runs **`pnpm check:env` FIRST**, then the turbo gate. When `check:env`
exits 1 the turbo step **never runs and shows as skipped**, so a CI failure here does not look like a
test failure at all.

**This blocked PR #85 and my own report said the branch was green.** Task 14's Playwright spec
introduced four `process.env` reads — `E2E_BASE_URL`, `E2E_WORKSPACE_ID`, `E2E_ADMIN_STORAGE_STATE`,
`E2E_MEMBER_STORAGE_STATE` — and none was in `.env.example`. The controller's independent CI run
caught it; fourteen of my own gate runs did not, because none of them asked the question.

**The mechanism is the branch's own recurring defect, and this time it was mine.** The Live-anchors
table has said **`check:env` exit 0** since branch creation. That was measured once, at the base, and
**carried forward through fifteen tasks without re-measurement — including past the task that added
four new environment reads.** The turbo composition was recounted at every batch boundary; the
`check:env` half was inherited every time. **The number nobody re-measures is the number that goes
stale, and a gate report is exactly as current as its least-recently-measured half.**

**RULE, for every remaining step: a gate claim requires BOTH commands, run at the sha being
reported.** The handoff's anchors are not evidence for either half.

Fixed and verified: the four are documented in `.env.example` in the house style (with
`E2E_MEMBER_STORAGE_STATE` marked genuinely **optional** — the spec's `configured` predicate requires
only the first three, a distinction invisible from the names, and the entry records that nothing in
CI sets any of them and `turbo.json` defines no e2e task). `check:env` exit 0 at **45 documented / 23
referenced**; commenting `E2E_WORKSPACE_ID` back out reddens the check **naming exactly that
variable**, restored and confirmed with `git diff`. Full CI-equivalent at `9017ebc`:
**`check:env` exit 0 AND turbo 24/24, 0 cached, 2463 tests.**

## IN FLIGHT

**PR #85** — https://github.com/bkirosangma/gisik-nokma/pull/85 — all fifteen tasks, 54 commits,
81 files, gate green at 2463. Awaiting the controller's merge. Nothing else is outstanding.

## FINAL WHOLE-BRANCH REVIEW — verdict `fix`, no Critical, and ALL FOUR findings were PROSE

One opus reviewer, per the cost ruling. **Four findings, zero code defects.** All four verified
independently before correcting, all four closed, gate unchanged at 2463 — which is what a
prose-only fix round should look like.

**The first finding explains why the other three survived fifteen task reviews, and it is the
strongest argument on this branch for keeping the whole-branch pass.** `builder-wiring.tsx` claimed
`WorkflowBuilderScreen` *"catches a refused roster by name"* — not merely false but **structurally
impossible**: the narrowing needs `AuthoringReadRefused`, declared under `apps/web`, and
`packages/app-core` depends on nothing there. **Its sibling one directory away already said so,
correctly and at length.** Two files in the same directory contradicted each other about the same
screen, and it shipped because **each was reviewed alone**. That is the seam a per-task stage cannot
see by construction.

**And the coordination doc asserted the correction had already landed.** The earlier fix round
corrected the sentence in `data-source-gateway.ts` and **left the identical claim standing one file
away**; `git log` on `builder-wiring.tsx` returns exactly ONE commit — Task 13's own — and never a fix
round. **A correction that names one site does not cover a claim that lives at two, and a doc entry
asserting the fix landed is precisely what stops anyone re-checking.** Both sites and the doc entry
are corrected.

The other three: the catalogue said the errand template blocked-flags "two waiting states" (**it has
one**, and the test it cites asserts `toEqual(['waiting'])`, a one-element array that would have
reddened on the claim written beside it); `Features.md` said the fake *"cannot reject at all"* (**it
can**, on two seeded flags — the absolute belongs to `listMembers` alone, and the coordination doc
had it scoped correctly while `Features.md` dropped the scoping); and a docblock said app-core
depends on three packages *"alone"* (**there is a fourth**, `@xyflow/react`).

**One claim was deliberately NOT "fixed":** that the template trips `rule-bypassable` **twice on two
pinned rule-free one-hop paths**. That is correct — **two paths into one state**. The plural was
wrong about states and right about paths, and a sweep that corrected both numbers would have broken
a true claim. **When correcting a plural, check which noun it counts.**

**Where the reviewer did NOT look, in its own words** — a re-reviewer starts here rather than
repeating covered ground: the workflow-builder UI component internals beyond the named seams, the
rule-editor suites, and the Playwright spec.

## RULINGS — ALL CLOSED. P28 and P29 taken, line 216 closed by T11. Nothing is open.

1. ~~**The T13 `DataSource` seam**~~ — **RULED. P28 (owner-approved, 2026-09-03), and it took the
   executor's recommended option (b).** The `apps/web` `WorkflowAuthoringGateway` adapter calls
   `listWorkflows`, `getStateOccupancy`, `getTypeWorkflowPopulation` and `migrateTypeToWorkflow`
   **directly over HTTP, bypassing `DataSource`**. The ruling's reasoning, recorded because it
   settles a rule that will be read again: **amendment 10's "no HTTP in views" binds VIEWS, not the
   gateway adapter** — the view still only ever sees the gateway interface, unchanged. `DataSource`
   stays untouched, so **Plan 10's offline replica is not forced to answer an offline-migration or
   offline-occupancy question before that plan exists.** The `getMembers` `Actor[]` →
   `WorkspaceMember[]` reconciliation is part of the same T13 work. Full text in
   `docs/lanes/controller-state.md` as P28 — **cite that, not the message that carried it.**
2. ~~**The frozen errand template trips `rule-bypassable` twice**~~ — **RULED AND CLOSED. P29
   (owner-approved, 2026-09-03): accept both trips as known and expected; touch NEITHER
   `checkErrandTemplate` NOR `adviseWorkflowDef`.** The advisory never blocks publishing, and the
   template digitizes a real shop's workflow warts included — sanitizing it would invent a cleaner
   reality than the one being recorded, which is what importing by identity exists to prevent.
   **Scoped to this one frozen template, NOT a carve-out for `rule-bypassable` elsewhere.**
   Rationale written at the declaration, echoed in `Features.md` §10 and case 10.61, and the
   coordination-doc entry now opens with the ruling rather than the request.
   **Verified with it: an admin is NOT stuck with the warning, and the guarantee is structural.**
   The constant is `Omit<WorkflowDef, 'id' | 'version'>` — it lacks exactly the two fields a real
   definition needs, so nothing can publish the object itself. Every live def is a copy with its own
   id and version (`cloneTemplate`; Plan 11's seed via `workflow.defined`), editable in the builder
   without touching the constant or the oracle.
3. ~~**Coordination doc line 216's false "Done" on Task 11**~~ — **CLOSED by T11's own commit
   (`9bf4cbe`)**, which supplies the component the line falsely claimed existed and rewrites the line
   to say so. The corrected line names its controls **before** the run and states which row of the
   inherited absence claim was stale. Nothing further is owed.

P25 taken (capped at `getBoard`). **P27 taken and applied** in step 12.

**P26 IS NOT "a number with no text" — that claim was already stale when written here, and it is
load-bearing for step 14.** P26 was written on 2026-09-02 into `controller-state.md`: **`SavedFilter`'s
field is `filterSpec`, and Plan 9 Task 13's `spec` is SUPERSEDED before it is written.** Step 14's
Task 13 adopts `filterSpec` and needs no ruling. The coordination doc carried the same stale claim in
two places and both are now corrected there — which is the fix that matters, because that document is
the one dispatched subagents read and this one is not.

## THE FIX-ROUND PATTERN IS NOT OCCASIONAL ON THIS BRANCH, IT IS THE NORM

**Three of Batch A's four fix rounds needed a SECOND commit to correct an error the fix itself
introduced**, and the titles say so in the authors' own words:

- `9154e67` — *"I fixed the false-present-tense comment I happened to be reading, then found the same
  defect in the file I had not opened — and my first correction to it was itself false"*
- `bdcb5a6` — *"withdraw the false 'unowned/unverified' claim on rule-bypassable"*, after `48c3655`
  had already tried to soften the same overclaim
- `460ebdc` — *"Second commit of the same fix round: the fragment my own edit left, and the one fact
  in it I had not measured"*, after `340192a`

Step 12 recorded six instances; this is three more in four tasks. **It is the argument for reviewing
a fix round rather than trusting it, and for never citing a fix round's own summary as evidence.**

## METHOD FOR THIS STEP — the cost ruling, applied

- **One fan-out for the plan**: the adaptation map, **one sonnet agent** (pre-flight is retired).
- **Per task: implementer → reviewer.** Fix round only on an Important or worse; scoped re-review
  only if the fix over-reached its scope. **HARD CAP 6 subagents per task.**
- **Final whole-branch review: ONE opus reviewer.** No lens bank, no refuters, no triage stage.
- **Fable is not dispatched, with no exception clause.** Sonnet is the default, opus the exception —
  except the four tasks priced opus above.
- **Batch on the plan's own seams**, with a handoff refresh at each boundary:
  **A: T1–T4** (pure core + gateway) · **B: T5–T8** (canvas → validation) ·
  **C: T9–T12** (publish → admin) · **D: T13–T15** (web wiring, smoke, catalogue).
- Expect escapes at the last gate that the removed machinery used to catch. **Record each instance
  in the coordination doc** for when the trade is next reviewed; do not re-open the trade.

## VERIFICATION RULES THAT BIND EVERY CLAIM IN THIS STEP

- **`grep` through this shell returns SILENT WRONG ANSWERS.** Measured at this base: `grep -c '^#'`
  on a markdown file that opens with `# Workflow Builder` returned **empty**, and
  `grep -n '^### Task'` on a file with fifteen such headings returned **nothing**. The same queries
  through `rtk proxy grep` returned 35 and all fifteen headings. **Every absence-shaped claim in
  this step must run through `rtk proxy` and print a positive control from the same run.**
- **The gate's per-package test counts are COLLAPSED by the proxy.** `pnpm turbo run build test
  typecheck` printed exactly one `Tests N passed` line (server) for a run reporting 24/24 successful.
  The exit code and task count survive; **the composition does not.** Use `rtk proxy pnpm turbo run
  …` when the per-package delta is the thing being claimed.
- **A cross-package mutation under bare `vitest` tests the stale `dist`.** The resolving property is
  **import style**: `../src/*.js` catches its mutation; `@gisik-nokma/domain` by package name
  resolves through `./dist`. Use `pnpm turbo run test` or rebuild explicitly — **and rebuild again
  after restoring**, or you leave a mutated dist for the next agent. Plan 8 imports
  `validateWorkflowDef` and `adviseWorkflowDef` from `@gisik-nokma/domain` **by package name in
  every task**, so this will come up constantly.
- **Every mutation kept should fail specifically enough to identify its own site.** A survivor with
  no explanation is either an unconstrained path or a mutation that never ran, and the second is the
  damaging one: it condemns a check that is fine.
- **"X appears nowhere" needs file-by-file enumeration or a second sweep, and every null prints a
  positive control from the same run.**
- **A TZ loop around a TZ-invariant function is a check that cannot fail wearing the costume of the
  rule that forbids them.** Before wrapping a TZ loop around anything, name the local-time accessor
  (`getDate`, `getHours`, `toLocaleString`, …) whose behaviour the loop is supposed to expose; if
  there isn't one, the loop proves nothing.
- **A partial-implementation marker enumerates the absences, not the partiality.**
- **The instinct to fix what you find is the one that hides compounds.** Anything outside a task's
  scope gets **recorded with a named owner**, not fixed — **and check the recorded owner still
  exists.** Step 12 twice assigned an owner to "Plan 6 Open question 13" after Plan 6 had closed.
- **Prose is not exempt from the falsifiability law, and it is the part no gate runs.** Across steps
  11 and 12, the large majority of review findings were against documents, not code.
- **Never run a state-changing git command in a shell whose cwd was set for a read.** Use `git -C`.
- Verify any file restoration with `git diff` or by reading the file — **never a shell `diff`**,
  which has returned a false "identical" on this machine, on this repo's own ledger.

## TASK 10 (timeline view-model) — RECORDED, NOT FIXED

**1. ~~`dates.ts`' docblock is false about one of the two days it names.~~ CLOSED by the Task 10
fix round — the PROSE was corrected, not the code. The entry stands unedited below because the
measurement in it is the evidence; the resolution is at the end of this item.** The block above `dateMs` says the round-trip
"refuses the two days `Date.UTC` invents instead of rejecting: `2026-02-30` (rolled into March) and
`0099-01-01` (read as 1999)", and closes with "`istDayBounds` in the domain refuses the same pair the
same way — one rule, stated once, applied twice". **Measured on this branch:
`dateMs('0099-01-01')` SUCCEEDS.** `dateMs` uses `setUTCFullYear(99, 0, 1)` — which is precisely the
constructor that does NOT fold two-digit years into 1900+, unlike `Date.UTC` — and `isoDate` pads the
year back to `0099`, so the round-trip agrees and nothing is refused. `istDayBounds` still refuses it
(`provenance.ts` wraps that call in a `try/catch` for exactly this reason). So the pair does NOT
"refuse the same pair the same way": they agree on `2026-02-30` and disagree on `0099-01-01`.
Discovered because a Task 10 fixture used `0099-01-01` as an unplaceable day and the test went red
against the docblock's claim; the fixture now uses `2026-02-30` and `2027-04-31`, both genuinely
refused. **Not fixed here**: the honest correction is either to make `dateMs` refuse pre-1000 years
or to strike the sentence, and both are decisions about Task 8's contract.

**2. `TimelineSideReason` has a FIFTH arm the plan does not list, and Task 11 must render it.
OWNER: TASK 11.** `'unplaceable-day'`. The plan's four reasons are each a statement the model would
otherwise have made falsely: a stored `{date: '2026-02-30'}` passes `IST_DAY_REGEX` (and
`dueDateValueSchema` checks nothing stronger), reaches `weekIndexOf`, and `dateMs` THROWS — one such
claim anywhere in the workspace blanks the whole timeline for every other ticket. Calling it
`'due-only'` would deny a start claim the ticket carries; calling it `'start-after-due'` would assert
an ordering against a day that does not exist. `provenance.ts` already ruled on the underlying
question ("a blank screen is a worse answer than an invented date"); this applies it one surface
along. A `TimelineView` that `switch`es on four reasons will fall through on the fifth.

**3. `TimelineModelOptions` takes `isEpicType`, which the plan's Task 10 signature omits.
OWNER: TASK 11 (thread it through `TimelineView`).** The plan hardcoded `typeId === 'epic'` at the
undated-epic skip while routing grouping through `epicAncestorOf`'s injectable predicate — so a
workspace whose rank-1 type is "Initiative" would have its undated initiative land in the side list
as MISSING WORK while the same model grouped tickets under it. It is now one predicate at all three
sites (skip, lane filter, grouping), defaulting to `isBuiltinEpicType`, matching what Task 8 landed
in `CalendarModelOptions`.

**4. The side-list heading was false at one of its own doors, and is now chosen.** `Task 8`'s
`TIMELINE_SIDE_LIST_COPY` states a LEAVING condition — work stays here "until it carries both a
claimed start and a claimed needed-by" — that a `start-after-due` entry already satisfies while
sitting in the list. Added `TIMELINE_SIDE_LIST_UNDRAWABLE_COPY` and a precedence rule, the same shape
as `emptyCopy`'s three sentences. **Task 11 must render `model.sideListCopy`, never the constant**:
hardcoding `TIMELINE_SIDE_LIST_COPY` in the component puts the lie back with the model still right.
The fixture that catches this class is a side list holding TWO DIFFERENT reasons at once; every
side-list case in the plan text holds one, so none of them can see it.

**5. Nine new test-case ids are Task 15's to carry, 11.52-11.60. OWNER: TASK 15.** Added to the four
already recorded above (11.48-11.51): **11.52** (bars require both claims; equal start/due is a one-day
period, not a contradiction), **11.53** (the side-list heading is true of every entry under it),
**11.54** (a claimed day that is not a day is named verbatim and blanks nothing else),
**11.55** (the window at both ends and one day either side — clipping, membership, the
Sunday|Monday seam, `weeksCount`, and the zero-column refusal), **11.56** (exact week indices and
two-author provenance), **11.57** (epic grouping, the untitled-epic lane, and the injected epic
predicate at skip / lane / grouping), **11.58** (custom date claims ride along and change no
geometry), **11.59** (filters narrow rows and the side list alike, and a filtered-out epic still
names the lane of the child that survived), **11.60** (the timeline view-model reads no
clock — the only surface that turns a claimed day into a NUMBER, so the only one where a device
getter would file a claim under a different week from the calendar's own answer).

**6. Four comparator arms had no fixture, and the mutations that named them survived until they did.**
Recorded because the shape recurs: ordering code written BEYOND the plan text (the group title
comparison, the `epicId` tie-break, the row `ticketId` tie-break) is exactly the code no plan-derived
fixture exercises. Every grouping fixture in the plan holds ONE non-null epic — where the null-last
arm decides everything and reversing the title comparison changes nothing — and the row-order fixture
uses two different claimed starts, so the id tie-break never runs. Two epics with non-trivially
ordered titles, two epics sharing a title, and two rows sharing a start close all three; a fourth
(`customClaims` dropped from an `unplaceable-day` entry) needed the case where the OTHER end is
missing. Thirty-three mutations now, all killed.

**7. `Features.md` §11 is still absent, and Task 10 did not open it. OWNER: TASK 15.** Same
precedent as Task 8, which landed nine source files and touched neither `Features.md` nor
`test-cases/`. Opening §11 for one task forks what Task 15's plan text dictates verbatim.

## TASK 10 FIX ROUND — two Important, three Minor, and the docblock the executor shipped

Commit under review: `5d00e98`. What the review kept: bars-only-when-both-claims-exist, every window
and clip boundary pinned at BOTH ends, and the four defects the draft carried. What follows is only
what changed.

**I1 — `emptyCopy` now exists on `TimelineModel`, and the four empties are three distinct models.**
Measured before the fix, anchor `2026-08-23`: `model([])`, a filter matching nobody, an unmatched
`laneEpicId`, and work fully dated but wholly outside the window all `JSON.stringify`d to the SAME
bytes — **distinct count 1**, while the sibling `CalendarModel` in the same package had `emptyCopy`
and three sentences for exactly this failure. Three constants added in `claim-labels.ts`
(`TIMELINE_EMPTY_COPY`, `TIMELINE_NARROWED_COPY`, `TIMELINE_OUT_OF_WINDOW_COPY`) and the loop body
extracted into one `classify(input): TimelinePlacement` called twice — once over `visible`, once over
what a narrowing removed — which is `collectItems`' construction, for `collectItems`' stated reason:
the second question must be answered by running the SAME classification, not a cheaper restatement of
it. The filter and the lane are deliberately ONE sentence (they are one fact said two ways), so the
pinned distinct count is **3**, with `serialised[1] === serialised[2]` asserted so a future third
sentence has to change the number rather than slip in unnoticed.

**NARROWINGS STACK, and the precedence is a truth condition.** `TIMELINE_NARROWED_COPY` outranks the
window sentence because a filter that removed work which WOULD have shown here describes a screen a
wider filter would fill — saying "it is outside these weeks" sends the viewer to the wrong control.
And `TIMELINE_OUT_OF_WINDOW_COPY` is deliberately **NOT exhaustive** ("Dated work here sits outside
the weeks in view", never "every piece of"): a filter can remove work that would ALSO have missed the
window, which leaves `narrowedAway` false and that arm reached with a second narrowing live. An
exhaustive quantifier there is `CALENDAR_ALL_HIDDEN_COPY`'s failure in timeline clothes. Both stacked
cases are fixtures, and each kills a mutation the other cannot.

**I2 — the undated-epic skip is decided, and the decision is KEEP CURRENT BEHAVIOUR.** The guard was
witnessed on its true branch only: `&& … && …` → `&& (… || …)` survived, and dropping the date
condition survived. **Chosen: the guard fires only when the epic has nothing to say.** A HALF-dated
epic goes to the side list like any other half-dated ticket and still heads its lane; a FULLY dated
epic gets a bar in its own lane (`epicAncestorOf` returns self). The reasoning is the file's own rule:
this is the only statement that removes a ticket from BOTH outputs on the grounds of what it IS, so
it stays as narrow as its justification — an epic that made a claim has made a claim, and suppressing
it would hide a claim on the grounds of a type. New describe **11.62**.

**Minor (a)** — `TIMELINE_SIDE_LIST_UNDRAWABLE_COPY` carried the OTHER constant's docblock, inverted;
a maintainer following it literally would swap the two and reinstate the removed lie. Both docblocks
rewritten so each sits over the constant it describes. Prose only; behaviour was already right.

**Minor (b)** — `unplaceableDayCopy` named the same bad day twice when start and due carried the same
unplaceable value. Deduped, on the RENDERED string, so the count that picks "is not a day" / "are not
days" is the count of things printed. Note at the site that for days which actually reach this
function the raw and rendered sets coincide — it is a discipline, not an observed difference, and
saying so is better than implying a case that was not measured. New case under **11.54**.

**ALSO CLOSED: `dates.ts`' false docblock (item 1 above), by fixing the PROSE.** Measured this
session: `dateMs('0099-01-01')` succeeds (`setUTCFullYear` does not fold two-digit years, `isoDate`
pads back to `0099`); `istDayBounds('0099-01-01')` throws on its round-trip (`Date.UTC(99,0,1)` →
1999-01-01). **Two rules, not one.** The prose was chosen over the code because making `dateMs` refuse
pre-1000 years would invent a validity rule at a RENDERING surface that the write path does not have
— `IST_DAY_REGEX` admits it and `dueDateValueSchema` checks nothing stronger — so the product would
store a claim it then refuses to place, with no migration and nobody's decision behind it. The code
side is not merely defensible, it is already PINNED: `test/claims/dates.test.ts` asserts
`isoDate(dateMs('0099-01-01')) === '0099-01-01'` under a title saying Date.UTC would read it as 1999.
Corrected at all three source sites — `dateMs`, `isCalendarDay`, and `unplaceableDayCopy`, which
carried the same false pair. `provenance.ts`' block was CHECKED and left: it is about `istDayBounds`,
and it is true.

**RECORDED, NOT FIXED — carried forward with owners:**

- **The clock scanner catches a literal `new Date()` and misses an ALIASED one.
  OWNER: TASK 8's `test/helpers/clock-scan.ts`.** `const CLOCK = Date; new CLOCK().valueOf()`
  survives BOTH halves of the harness: the source scan anchors on `/\bnew\s+Date\s*\(\s*\)/`, and the
  four-zone identity half structurally cannot see an INSTANT read, since `Date.now()` returns the
  same number in every zone. **Not closed, and not because it was forgotten.** Every pattern that
  would catch the alias (`/=\s*Date\b/`, bare `Date` as a value) has false positives against this
  package's own docblocks, which name `Date`, `Date.UTC` and `new Date()` constantly and deliberately
  in order to forbid them — `timeline-model.ts`' `anchor` block already refuses to spell the
  constructor for exactly this reason. A scanner that goes red on prose is worse than the gap it
  closes, and choosing the pattern is a decision about that harness's contract.
- **`test/workflow-builder/access.test.tsx` failed once and passed on re-run, on an unchanged tree.
  OWNER: whoever next opens that file.** In the first full gate of this fix round it failed at
  `user.click(screen.getByTestId('transition-label-8'))`; the file passed in isolation immediately
  after, and passed again (23 tests) in a FORCED, 0-cached app-core run — `rtk proxy pnpm turbo run
  test typecheck --force --filter=@gisik-nokma/app-core`, 5/5, 846/846. Nothing in this fix round
  touches the workflow builder. Recorded because a once-in-three-runs red in a suite this branch
  relies on as its gate is worth a name, not because it was diagnosed — **it was not.**
- **`Features.md` §11 and `test-cases/11-calendar-notifications.md` still do not exist.
  OWNER: TASK 15** (unchanged from the entry above; verified this session — `Features.md`'s ten `##`
  sections are 1-7, 9, 10 and 12, and there is no §11).

**New test ids this round: 11.61 (four empty timelines) and 11.62 (the undated-epic skip's false
branch), joining 11.52–11.60. 11.60 is TAKEN by `clock-free.test.ts`, not by the timeline file.**
Task 15 carries 11.52–11.62 into `test-cases/11-calendar-notifications.md`.

**Nine mutations, nine kills, each naming its own site.** app-core **833 → 846** tests, both ends
MEASURED (the 833 by stashing this round's four files and running the package suite, not by
subtracting 13 from 846).

**The gate, named honestly.** `pnpm turbo run build test typecheck` ran **24/24, exit 0, Node
v22.22.2**, with `apps/server/test/node-version.test.ts` — the self-asserting check this document
already names as the trustworthy one — passing inside it. That run happened BEFORE commit `643644b`
landed on this branch mid-session; the re-run after it was **fully cached (24 cached, 24 total)** and
is therefore a replay, not a measurement, so it is not cited as one. What was re-measured afterwards
is the only task whose inputs this round touches: a forced, **0-cached** app-core `test typecheck`,
5/5, 846/846.

**A concurrent commit landed on this branch during the round** (`643644b`, Task 8's fix round on the
plan's colour tokens). It touched `docs/lanes/executor-state.md` and nothing else; this round's four
code files were stashed by path across it and popped onto the new HEAD, and both sets of edits were
confirmed present in the merged file afterwards rather than assumed.

## TASK 14 FIX ROUND (web wiring) — THE HANDOFF RANGE, CORRECTED, AND THREE THINGS RECORDED

**THE HANDOFF RANGE TASK 15 MUST CARRY IS `11.130–11.177`, NOT the `11.130–11.168` commit `fe320fc`
says.** That message was written before `b300f43` added **11.169**, and this fix round adds
**11.170–11.177**. Worse than the off-by-one: the range lived ONLY in a commit body and in no `.md`
in the repo, so the one place Task 15 reads had nothing to correct. It is written here now.

**Re-measured rather than incremented**, by listing every `it(`/`describe(` id definition in the repo
and sorting. In use: **11.1–11.8, 11.18, 11.36–11.39, 11.48–11.122 with NO gaps, and 11.130–11.177**
— **136 ids**. 11.123–11.129 are permanently unused (the gap Task 14's renumber left), as are
11.9–11.17, 11.19–11.35 and 11.40–11.47 (Plan 9's own nominal one-id-per-area block, superseded on
this branch by one-id-per-test from 11.48). Per `test-cases/README.md`'s rule all of them stay unused
rather than being backfilled. **New cases continue from 11.178.**

> **CORRECTION, 2026-09-04, made by the session that inherited this file: the "gaps at 11.97 and
> 11.106" this paragraph used to assert DO NOT EXIST.** Both are live `it(` titles in
> `packages/app-core/test/preferences/saved-filters.test.ts` (`:67` and `:266`). The sharp part is
> the sentence that stood beside the error: this paragraph *claimed* its sweep "catches
> 11.158/11.159's double-quoted titles that a single-quote-only sweep misses" — and 11.97 and 11.106
> are double-quoted too, so the very hazard it named by name is the one it then reported wrongly.
> **Naming a failure mode is not the same as having avoided it**, which is this branch's third
> instance of a sweep-shape claim outrunning its own result. The re-measure that caught it separated
> ids appearing in *test titles* from ids appearing anywhere (a `grep -rhoE` for a quoted id also
> matches backtick-quoted prose in docblocks), and printed a positive control for each null.

The eight this round adds: **11.170** (the nav hangs the `/inbox` link, name AND href), **11.171**
(Workspaces always, My Work only inside a workspace), **11.172** (a failed "Load more" keeps the rows,
names the failure, keeps the control, shows no refusal panel, and the retry clears it), **11.173** (a
successful open clears the "cannot be opened" notice), **11.174** (no badge before the first answer),
**11.175**/**11.176** (a 200 of the wrong shape is named on each read instead of throwing an unnamed
`TypeError`), **11.177** (a reload drops the paging complaint about rows it replaced).

**`Features.md` §11 and `test-cases/11-calendar-notifications.md` STILL do not exist, and this round
deliberately did not open them. OWNER: TASK 15** — unchanged, and for the reason recorded twice
already: Task 15's plan text dictates §11 verbatim and pins that file as its own creation, so a
partial section written here forks its Files block. The debt is now stated with a correct range
instead of a wrong one.

**RECORDED, NOT FIXED — carried forward with owners:**

- **The shell's `isEpicType` forward to `CalendarView` is INERT, and it is kept anyway.
  OWNER: whoever wires a calendar lane filter.** The review reported it as half-covered; measured, it
  is stronger than that. `CalendarView` hands `isEpicType` to `buildCalendarModel`, which reads it at
  exactly one site — the `laneEpicId` lane filter (`calendar-model.ts:275`, inside `laneEpicId !==
  undefined && !== null`). **`laneEpicId` has zero occurrences anywhere in `apps/web`**, and app-core's
  own 11.158 says the lane fixture "is the ONLY shape that can witness the forward". So no case
  reachable from the project page can distinguish that spread's presence: **deleting it survives
  133/133**, and deleting the TIMELINE spread beside it reddens 11.165 by name — the asymmetry
  measured both ways in the same session. It is a survivor left standing ON PURPOSE, with the site
  commented, rather than covered by a prop-capture test that would watch the line instead of its
  consequence. It stays because `calendar-view.tsx`'s docblock forbids exactly the state deleting it
  would create: the calendar and the timeline answering differently about one ticket's epic on two
  tabs of one page, surfacing silently the day a lane filter is wired.
- **`today` is computed once per render and never re-derived. OWNER: whoever next opens the project
  page's date wiring.** A tab left open across IST midnight keeps yesterday's ring until something
  else re-renders. The day COMPUTATION is right (11.164 pins it at the instant the UTC and IST
  spellings disagree); this is only about when it is recomputed. Not fixed because the fix is a timer,
  and a timer is a re-render mechanism that needs its own case, its own cleanup, and its own argument
  about cadence — none of which is Task 14's subject. Noted at the site.
- **The nav's mount was invisible to a 125-test suite, and only the inbox half is now watched.**
  `app-nav.test.tsx` exists because deleting one line orphaned a whole feature with build, test and
  typecheck green — Task 7's `buildApp` finding in its reachable-page-with-no-door form. **Every other
  page in this shell mounts `AppNav` and no page asserts its own mount either.** This round watched
  the nav's three links; nothing yet watches that a PAGE renders the nav. OWNER: unassigned, and worth
  a sweep, because the failure mode is a suite that covers everything the wiring connects.

## TASK 15 (Plan 9's last) — IN FLIGHT 2026-09-04, written by the post-crash session

**Position: Step 14 = Plan 9. T1–T14 committed (T14's fix round is `aee7cc7`, pushed). T15 is the
last task in the plan.** After it: rebase onto `main`, ONE opus whole-branch review, PR. The
controller merges; I do not.

**The crash recovery, for the record.** The machine was force-restarted 05:31:56 on 2026-09-04 with
T14's fix round STAGED AND UNCOMMITTED — eight files whose only record was `git diff --cached`. They
are now commit `aee7cc7`. Nothing was lost, but nothing was safe either: `git status` was the only
thing standing between that work and the bin.

**Two measurement errors this session found in what it inherited, both of which had passed review:**

1. **The gate that was a replay.** `pnpm turbo run build test typecheck` returned 24/24 green — and
   `Cached: 24 cached, 24 total, FULL TURBO`. Its stored server log said `Start at 04:48:03`, which
   is BEFORE the ~05:10 red run the crash override reported. A cache hit is a fact about a hash, not
   about a tree. Forced, it went RED on 69 server files.
2. **The database was not running.** This worktree's `docker-compose.yml` maps `54329:5432`; the only
   postgres on the machine was an unrelated container on 5432. `docker compose up -d` from THIS
   directory fixed it. **If a fresh session sees mass server-test failure, check the port before
   reading a single stack trace.**

**The gate, honestly named.** After starting the database: **24/24, `0 cached`, 46.8s**, Node
confirmed FROM INSIDE the run by `apps/server/test/node-version.test.ts` — not by the absent
`Unsupported engine` warning, which that test's own docblock explains is inert for per-package
scripts. Composition recounted at this tree: **3,063 tests over 224 files** — app-core 1021/62,
server 940/85, web 133/17 (134/17 after 11.185), domain 464/27, rule-engine 282/12, editor 178/15,
ui 37/4, sync-client 8/2. **The handoff's earlier app-core figure of 846 is stale; the baseline is
1021.**

**A red herring, resolved so nobody re-chases it.** Turbo names
`/Users/kiro/.nvm/versions/node/v24.11.1/bin/pnpm` in its error lines because the pinned
`v22.22.2/bin` contains **no pnpm** — but pnpm is a `#!/usr/bin/env node` script, so the workers run
whatever `node` resolves to, which is v22. `node-version.test.ts` passing inside the gate is the
evidence; the path in the error line is not.

**The override's unverified 23:40 lead is closed:** `apps/server/test/routes/attachments-upload.test.ts`
passes, 16 tests, 8.5s. Its `:364` neighbourhood allocates 25 MiB, which is why it was the first
thing to die under 22.4 GB of orphaned workers. It was a symptom of the crash, not a defect.

**What Task 15 produced, and where it deviates from its plan text — deliberately, each measured:**

- `packages/app-core/test/reporting-scope-guard.test.ts`, cases **11.178–11.184**. Three deviations
  from the plan's literal code, none cosmetic:
  - **`SCANNED_ROOTS` gains `apps/web/src` and `apps/web/app`** (seven roots, 274 non-test source
    files). The plan's own argument for including `rule-engine` — "a root list that omits it is a
    guard that states an invariant it does not enforce" — is the argument for these, since Task 14
    wired day rendering into `apps/web`. Both were measured CLEAN before being added, and both were
    then proven to BITE: a `forecast` probe in `apps/web/src/notifications-gateway.ts` and a zone
    literal in `apps/web/app/inbox/page.tsx` each reddened the right case naming its own `file:line`.
  - **`REPO_ROOT` is found, not counted to.** The plan's
    `resolve(new URL('.', import.meta.url).pathname, '../../..')` resolves to `/` under vitest's
    transform — measured, it scanned `/packages/app-core/src` and threw ENOENT. It now walks up to
    `pnpm-workspace.yaml` and THROWS if it cannot find it, because the alternative failure is a clean
    pass over nothing.
  - **The missing-root `try/catch { continue }` is GONE, and two CONTROLS were added.** Every
    assertion in that file is `expect(offenders).toEqual([])` — a shape that passes just as happily
    when the walker reached no files or the needle stopped matching. **Demonstrated, not argued:**
    with `ZONE_LITERAL` made stale, the zone scan 11.182 **stayed GREEN** and only the control went
    red. That is the whole reason the controls exist.
- `Features.md` §11 and `test-cases/11-calendar-notifications.md` — **the plan's catalogue text is
  STALE and was not copied.** It reserves 11.1–11.47 one-id-per-AREA; the branch shipped
  one-id-per-TEST. **Live: 147 ids** (11.1–11.8, 11.18, 11.36–11.39, 11.48–11.122, 11.130–11.188) after the final review's fix round.
  **Permanently unused for TWO different reasons**: 11.9–11.17, 11.19–11.35, 11.40–11.47 (the
  superseded nominal block — the `§9`/9.1–9.34 precedent in `test-cases/README.md` is the template)
  and 11.123–11.129 (Task 14's renumber gap). **New cases continue from 11.186.**
- **Three paths in the plan's `Features.md` block do not resolve** and were corrected against disk:
  `packages/app-core/src/filters/` → `src/preferences/`; `calendar/CalendarView.tsx` →
  `calendar/calendar-view.tsx`; `packages/domain/src/ticket-types.test.ts` → `domain/test/`.
- `test-cases/README.md` — its §11 passage asserted the bucket did not exist. Task 15 falsifies it.
- `docs/superpowers/plans/2026-08-20-00-series-coordination.md` — **same problem, one level up.** At
  its line ~6572 the doc uses "`Features.md` carries no §11 heading" as its EVIDENCE that Task 15 has
  not run. Amended rather than deleted, because the method (artefacts, not checkboxes) is right and
  only its reading changed.

**A claim I wrote and then had to retract, recorded because the retraction is the lesson.** I first
wrote that case **11.171** would tell whoever wires a Settings link into `AppNav` that the nav
changed. **It would not, and cannot** — it asserts three links are PRESENT, and a presence assertion
is blind to a fourth. Measured by wiring `settings/workflows` into `AppNav`: **11.170 and 11.171 both
stayed GREEN; only the new closed-set case died.** So **11.185** was written to assert the hrefs are
EXACTLY `/workspaces`, `/w/<id>/my-work`, `/inbox`. This is the same blindness, one level up, that
let a deleted `<InboxNavLink />` leave 125 tests green — and it very nearly shipped as a sentence in
the interface authority saying a tripwire existed where none did.

**STILL OPEN AT THIS LINE:** the catalogue's both-directions reconciliation (every id in the `.md`
exists in the repo AND every repo id appears in the `.md`) has NOT yet been run by me — a subagent
was asked to check it, and a subagent's clean report is not a measurement I have made. **11.185 post-
dates the inventory the catalogue was written from, so the catalogue is KNOWN to be missing it and
its "continue from" line is KNOWN to say 11.185 instead of 11.186.** Fix both, then re-run the full
gate, then rebase onto `main` (`421db9f`; the ONLY colliding file is this one), then the single opus
whole-branch review, then the PR.

## PLAN 9 COMPLETE — MERGED `main`, GATE GREEN, FINAL REVIEW IN FLIGHT (2026-09-04 ~07:00)

**ANCHORS, verified reachable with `git branch --contains` (not `cat-file`):**

| what | value |
|---|---|
| branch | `exec/14-plan9-calendar` |
| HEAD | **`b897404`** — pushed, `origin` identical |
| base | `origin/main` `421db9f`, **MERGED IN** — 0 behind, 51 ahead |
| tree | clean |
| gate | at `6ff2591`: **24/24, `0 cached`, 43.7s, 3,071 tests / 225 files** |

**Task 15 is committed (`1046fce`). Plan 9's T1–T15 are ALL DONE.** Commits since: the `main` merge
(`6ff2591`) and one comment fix (`b897404`).

**Why this is a MERGE and not a rebase.** 21 of 48 commits touched this file and #92 inserted its
block near its top, so `git rebase origin/main` conflicted on commit **1 of 48** and would have asked
for the same resolution up to twenty more times. Twenty-one hand resolutions of the restart surface
is how a handoff loses content. Merged instead, resolved once, and verified afterwards that #92's
rule block, this file's Task 15 section, and its "gaps at 11.97/11.106" correction all survived.

**What remains before the PR:** the single opus whole-branch review is IN FLIGHT (workflow
`wf_5f7ac57a-24f`). A fix round only if it returns Important or worse. Then the PR — body drafted at
`scratchpad/pr-body.md`. **The controller merges; I do not.** Ledger rows are NOT promoted here,
deliberately: Plan 8's were promoted by the controller in #87 and a duplicate written from this side
had to be dropped.

**TWO FIGURES IN THE DISPATCH BRIEF ARE NOW STALE — measured, not assumed:**

- **"Zero of 48 test files vary `TZ`" is no longer true of `main`.** Twelve TZ-varying test files are
  already on `origin/main`; this branch adds two more (`apps/server/test/notifications/sweep.test.ts`
  and `packages/app-core/test/calendar/clock-free.test.ts`). The GAP the brief names is real history,
  but quoting its number today would misdescribe the tree.
- **The brief's "~109 of 177 tasks remain" predates this step.** Recount from the ledger; do not
  carry it.

**A third self-falsifying claim, and the pattern is now worth naming as a class.** Three times on
this branch a *claim about a check* outran the check itself:
1. "gaps at 11.97 and 11.106" — asserted in the same paragraph that named double-quoted titles as
   the hazard, and 11.97/11.106 are double-quoted.
2. "11.171 will tell you if the nav changes" — measured false; a presence assertion is blind to a
   fourth link. 11.185 was written because of it.
3. "grep returns zero hits" for `laneEpicId` in `apps/web` — true when measured, false the instant it
   was written into a comment containing the word.
**All three were caught by re-running the stated check rather than by reading the claim.** None was
caught by review. That is the cheap habit worth carrying to Plan 10: *before repeating a measurement
someone else recorded, run it.*

## FINAL WHOLE-BRANCH REVIEW — RESULT AND FIX ROUND (2026-09-04)

One opus reviewer, ~45 mutations across app-core, server and the web shell. **No Critical.** Two
Important, three Minor. It reviewed at `9c44200` rather than the assigned `6ff2591` because the
branch moved under it; the intervening diff is one code comment and this file, so its measurements
hold for both.

**Both Important findings were re-measured by me before being acted on** — an agent's finding is not
a measurement I have made.

**IMPORTANT 1 — FIXED. The loading arm of the Calendar and Timeline tabs had no witness.**
`) : list.rows !== null ? (` → `) : true ? (` on the calendar arm leaves **134/134 web tests green**,
and the same on the timeline arm also leaves 134/134 green. Confirmed by my own mutation. The product
code was CORRECT; the guard was simply unconstrained. What the mutant renders is the exact sentence
this product exists not to say — *"No claimed dates fall in this month. Undated work is absent, not
estimated"* — asserted from a read that has not answered. 11.161/11.162 pin the REFUSAL half, which
is why the pair looked covered. **11.186 and 11.187** now pin the loading half, one per arm, and each
mutation is killed only by its own case — proven both ways.

**IMPORTANT 2 — FIXED. `Features.md` §11 marked three things `✅` that no user can reach.**
Verified by grep: nothing mounts `SavedFiltersMenu`, no `PreferencesGateway` implementation exists
outside the test fake (`saved-filters.ts:175` already conceded it), and no filter or lane prop is
passed anywhere in `apps/web`. Both bullets are now **⚙️** with the gap named and an owner.
**One thing the review got wrong and I did not adopt:** it listed `data-pending` as unreachable
alongside the others. It is not a gap — `toTicketDatesInput` hard-codes `pendingFieldIds: []` because
this shell is *online-only*, so nothing is ever in transit when a list read lands; Plan 10's replica
is where that array stops being empty. The file's own docblock says so. §11 now records that
distinction rather than flattening it.

**MINOR 4 — FIXED, and it was my own overclaim.** The guard's describe is titled *"THE CONTROL FOR
EVERY NULL ABOVE"*; 11.178 controlled the zone and day needles and **nothing controlled the
estimation needle**. Writing that control exposed a second, larger thing: the plan's
`/\b(velocity|burndown|forecast)\b/i` **cannot match `velocityChart`**, because `C` is a word
character. A file could declare `const velocityChart` and the guard whose stated property is "no
source speaks the estimation vocabulary" would return clean. Measured before widening: a substring
scan over all seven roots is **also clean today**, so the needle is now `/(velocity|burndown|forecast)/i`
at no cost and with no allow-list. **11.188** witnesses both halves, and three mutations prove it:
reverting to `\b` kills it naming the compound regression, rotting the words kills it naming
"velocity", and planting `velocityChart` in `inbox/gateway.ts` kills **11.180** end-to-end.

**RECORDED, NOT FIXED — with owners, per the Minor policy:**

- **MINOR 3 — the stale gate's exclusive end is untested.** `apps/server/src/notifications/sweep.ts:256`
  (`AND entered.server_time < $2`): `<` → `<=` survives 37/37. The docblock states the half-open
  contract explicitly, but the two boundary cases sit 9.5 hours either side of the cut-off, so
  nothing exercises `server_time === endUtc`. Breaking input the reviewer names: with `staleDays = 14`
  and today `2026-08-24` IST, a ticket entering its state at exactly `2026-08-10T18:30:00.000Z` is
  flagged stale a day early. The OTHER end is well pinned (`.endUtc`→`.startUtc` reddens 4;
  `<= $2` on the due horizon reddens 9). **OWNER: whoever next opens the sweep's windows** — this is
  Plan 9 Task 6's surface, and the fix is one boundary fixture, not a code change.
- **MINOR 5 — the notification kind vocabulary has a THIRD statement nothing holds to the other two.**
  `apps/server/migrations/1788437881385_notifications.sql:12`'s `notifications_kind_check` versus
  `NOTIFICATION_KINDS`. 11.181 ties the payload schema map to the domain list; nothing ties the SQL
  `CHECK` to either. The consequence is quiet rather than loud: `deliverToAll` catches per transport,
  so a sixth kind added to the domain without a migration **silently drops every notification of that
  kind**, leaving only a log line. **Not measured** — `apps/server` imports the domain by package
  name, which resolves through `./dist`, so the reviewer could not mutate it and neither claim is
  test-backed. **OWNER: whoever adds a sixth notification kind**; the cheap closure is one test
  iterating `NOTIFICATION_KINDS` and inserting each against the real table.

**A MISTAKE I MADE MID-FIX, recorded because the recovery is the lesson.** After mutating the guard I
restored it with `git checkout -- <file>` — which restores from the INDEX, and my widening and 11.188
were not yet committed. The checkout silently discarded them, and the two mutations I ran next were
therefore measured against the OLD guard and came back green, which I nearly read as "the control
does not work". **Caught only because a green result where I predicted red is itself a finding.**
Redone, backed up to a file first, and re-mutated with `cp` restores. The general rule: `git checkout`
is not an undo for work that has never been committed.

## PR #93 IS OPEN — STEP 14 IS DONE FROM THIS SIDE (2026-09-04 ~07:20)

**https://github.com/bkirosangma/gisik-nokma/pull/93** — `exec/14-plan9-calendar` → `main`,
**MERGEABLE**, CI `gate` pending at the time of writing.

| anchor | value |
|---|---|
| HEAD | **`59f834b`** — pushed, reachable (`git branch --contains` names the branch) |
| behind `main` | **0** — `origin/main` `421db9f` is merged in, not rebased over |
| tree | clean |
| commits | 52 · 87 files · +19,578/−104 |
| gate | **24/24, `0 cached`, 43.5s, 3,074 tests / 225 files**, Node named from inside the run |

**Plan 9 is complete: Tasks 1–15, plus the final review's fix round.** The next executor step in the
serial sequence is **step 15 — Plan 10 remainder** *(T7, T9, T14, T15 floor-list)*. **Note the owner's
stop point recorded at the top of `controller-state.md`: ask before dispatching Plan 10 T14.**

**The controller merges. Ledger rows are NOT promoted from this side** — Plan 8's were promoted by
the controller in #87 and a duplicate written from here had to be dropped, so Plan 9's fifteen rows
are the controller's to write.

**If you are a fresh executor reading this after a restart:** the position above is the merged,
pushed truth. Verify it rather than adopting it — `git rev-parse HEAD`, `git branch --contains HEAD`,
`gh pr view 93`. If #93 has merged, `main` has moved and this file's anchors are history.

---

# STEP 15 IS OPEN — PLAN 10, TASKS 5–13 (2026-09-04 ~07:45)

**Everything above this line is HISTORY.** PR #93 merged as `e09666c`; the "PR #93 IS OPEN" section
immediately above is a fact about 07:20 and its anchors (`59f834b`, `exec/14-plan9-calendar`) are now
history. `origin/exec/14-plan9-calendar` still points at `5d0be1d`, but its content lives on `main`.

## WHERE I AM

**Step 15 — Plan 10 remainder. Branch `exec/15-plan10-sync`, cut from `origin/main` `e09666c`.**

| anchor | value |
|---|---|
| branch | `exec/15-plan10-sync` |
| cut from | `origin/main` **`e09666c`** ("Plan 9: the calendar, the timeline and the notification engine…") |
| HEAD at write time | `e09666c` — zero own commits yet beyond this handoff |
| tree | clean apart from this commit |
| ledger | Plan 10: T1, T2, T3, T4, T8 **done**; T5, T6, T7, T9–T18 **todo** — read from `task-ledger.tsv`, not inferred |

## ⛔ THE STOP POINT IS REAL AND IT IS EIGHT TASKS AWAY

`controller-state.md:15-21` — owner-set, 2026-09-04. **Permitted without asking: T5, T6, T7, T9, T10,
T11, T12, T13.** **STOP AFTER T13. ASK before dispatching T14.** T14/T15 (dual-client harness and
scenarios) and T16/T17 (Tauri, Expo) are all behind the ask. The standing auto-merge authorization does
**not** cover this boundary. The reason is quota, not tidiness, and the controller's own note says to
**re-derive rather than obey mechanically** if the weekly window turns out to roll.

## PRE-FLIGHT IS DONE AND IT IS NOW TRACKED

`docs/lanes/plan10-adaptation-map.md` — 440 lines, one sonnet agent plus an executor addendum that
closed the map's own "not verified" entries. **It was untracked until this commit; it is committed
now**, because the condition its header set ("untracked on purpose until step 15's branch is cut off
the merged `main`") is discharged.

**Read its header before using any citation in it.** Its substance is good and its *directory paths are
not*: three spot-checked high-value claims were all substantively correct and two cited a path that does
not exist. Re-locate every file yourself.

The three findings from it that will cost a round each if missed:

1. **T7: `ingestBatch` vs `ingestClientBatch`.** The plan's own snippet calls the internal, UNGATED door
   for the client-submitted offline event. `ingest-service.ts`'s docblock names this exact case by name.
   ~~`sync-service.ts` legitimately needs BOTH doors, so its deps type **cannot** be narrowed to
   `ClientIngest` and the compiler will **not** catch a wrong call.~~ **THAT SENTENCE WAS FALSE AND IS
   CORRECTED BELOW — see "THE CORRECTION THAT MATTERS MOST" in the Batch A section.** The compiler DOES
   catch it: take `ClientIngest` plus `ServerAppend` as two named parameters, not `IngestService` as one
   wide object.
2. **T12: the plan's `ReplicaQuery`/`LocalIngestResult` are not the shipped `DataSource`.** The real
   `DataSourceQuery` has 13 methods under different names; the plan's has 6. `LocalIngestResult`'s 4th
   `'pending'` status is not assignable where `DataSource.ingest`'s 3-status `IngestResult[]` is
   expected. Build against the real types.
3. **T6/T7: `EffectiveRole` is brand-protected** (non-exported `unique symbol`, Ruling P22). Do not
   hand-build one to make a test pass — every safety property of `canSeeResolved` rests on the value
   having come from `resolveEffectiveRole`.

## TWO SWEEPS RUN AT THIS SHA, BOTH WITH POSITIVE CONTROLS ON THE SAME FILE

Run against `docs/superpowers/plans/2026-08-20-10-offline-sync-apps.md` (7,629 lines). The controls
matter because five of the six silent-empty modes this repo has recorded produce a well-formed zero:

```
DataSource   45 lines   } controls — non-zero, so the path and the tool both work
istDayOf     22 lines   }
clockSkewMs  14 lines   }
useLiveQuery  0 lines   <- genuine absence
TZ            0 lines   <- genuine absence
```

**1. The adaptation map's own "least-sure claim" is CLOSED, and the answer is the reassuring one.**
The map could not determine whether Plan 10's T9/T11–T13 text carries a stale 3- or 4-argument
`useLiveQuery` call needing the Ruling P17 5-arg form. It does not: **Plan 10's text contains zero
`useLiveQuery` calls at all.** So there is no transcription trap. P17 still binds any view T13 *writes*
(5-arg form; the key must name every input `load` closes over) — but no plan snippet needs correcting,
and the map's closing paragraph can be read as resolved.

**2. The brief's known gap #2 is live in this plan and now quantified.** Plan 10's text is
clock-sensitive on **36 lines** — `istDayOf` on 22, `clockSkewMs` on 14 — and sets `TZ` on **zero**.
**[CORRECTED LATER — see "THE TZ PREMISE WAS STALE" below. The claim about Plan 10's own text stands;
the claim about `main` having no TZ-varying tests did not, and it caused a false claim downstream.]**
That is the `ist-day.test.ts` failure exactly: a test that cannot distinguish *the code computes IST
correctly* from *the machine is already in IST*. **T9, T10 and T13 dispatches must carry an explicit
`TZ` instruction**, because the map does not mention `TZ` across its 440 lines either and the map is
what the implementers read.

## PLAN OF ATTACK — three batches on clean dependency seams

Sequential within a batch. **No `pipeline()`/`parallel()` across tasks in a batch**: they mutate one
tree, and T6/T7 both write `sync-routes.ts`. The shared-tree hazard is the recorded one.

| batch | tasks | seam |
|---|---|---|
| **A** | T5 → T6 → T7 | server sync surface; T6/T7 share `sync-routes.ts`, T6 reads T5's snapshots |
| **B** | T9 → T10 | replica core; T10's outbox sits on T9's replica |
| **C** | T11 → T12 → T13 | sync engine → replica `DataSource` → app-core UX |

Per-task: implementer → reviewer. Fix round only on Important or worse. HARD CAP 6 subagents/task.

**Model assignment** (brief's table; sonnet is the default, opus the exception):
T5 opus/high impl (it is a fold) + sonnet/med review · T6 sonnet/med both · **T7 FLOOR-LIST: opus/high
both** · **T9 FLOOR-LIST: opus/high both** · T10 opus/high impl (a pre-check that can disagree with the
server is worse than none) + sonnet/med review · T11 opus/high impl (stream/sync) + sonnet/med review ·
**T12 opus/high both — an ESCALATION I am taking deliberately**, not a floor-list entry: the map names
it "the riskiest by a wide margin" and its failure mode is invisible until T13 or a later app shell ·
T13 opus/high impl (honesty-carrying view-models) + sonnet/med review.

## THE ONE DECISION I HAVE NOT TAKEN YET — PR granularity

Precedent is one PR per step (#93 carried 15 tasks). Against that: the controller's arithmetic said
**8–9 of Plan 10's 13 tasks fit this week, not 13**, measured at 01:15 before Plan 9's remainder was
spent. If the pool is thinner than that estimate, **one 8-task branch that dies at T11 leaves five tasks
unmerged — "full price, no gate", the worst available outcome by the brief's own naming.** The three
batches sit on clean seams, so a PR at the Batch A seam costs one controller round-trip and makes three
tasks durable. **Recorded here as an open call, to be taken at the Batch A boundary on a re-measurement,
not by default.**

## IF YOU ARE A FRESH EXECUTOR READING THIS

The anchors above were verified with `git branch --contains`, not `git cat-file`. Re-verify anyway.
Nothing is in flight as of this commit: no subagent is running, no PR is open from this branch.

---

# BATCH A IS COMPLETE — PLAN 10 T5, T6, T7 (2026-09-04 ~09:40)

**Everything above this line about "PLAN OF ATTACK" still holds; the position has moved.** Batch A
(server sync surface) is committed and pushed. Batch B (T9 → T10) is next and has not started.

| anchor | value |
|---|---|
| branch | `exec/15-plan10-sync`, pushed |
| merge-base with `main` | `e09666c` |
| behind `main` | **0** — `origin/main` merged in, not rebased over (it gained the controller's Plan 9 ledger promotion, 148/177, while Batch A ran) |
| my changes vs merge-base | **16 files, +3701/−19** — recounted at this sha, not carried forward |
| tree | clean |
| ledger | Plan 10 T5/T6/T7 still read `todo` — **correct**, the controller promotes after merge. Do NOT promote from this side. |

**Recount before relying on any number above.** The first count taken here said "18 files" and "21
files" from two commands run seconds apart; both were `origin/main..HEAD` **endpoint** diffs taken while
`main` had moved four commits ahead, so each was measuring my work plus main's in one direction or the
other. The merge-base number is the only one that answers "what did I change".

## THE CORRECTION THAT MATTERS MOST — the compiler CAN catch the ungated door

**The pre-flight map's headline finding is half wrong, and the wrong half was written into this file,
into Task 7's dispatch prompt, and into a status report before anyone tested it.**

The map said: `sync-service.ts` needs both ingest doors, so its deps type cannot be narrowed to
`ClientIngest`, so `deps.ingest.ingestBatch(...)` for a client event cannot be a compile error and
"discipline falls back to review." **It does not.** Measured at `ba6bfe6`, BEFORE Task 7 existed:

- `apps/server/src/app.ts:88` already declared `serverAppend: ServerAppend` on `AppDeps`.
- `apps/server/src/routes/invites.ts:45` already took it as its own parameter, calling it at `:497`.

Two doors as **two named parameters**, not one wide interface. `sync-service.ts:97-100` now takes
`ingest: ClientIngest` (which has no `ingestBatch` at all) plus `serverAppend: ServerAppend`, and the
reflex call is `Property 'ingestBatch' does not exist on type 'ClientIngest'`.

**The reusable lesson: an option priced as unacceptable is sometimes an option scoped too widely.** The
map reasoned "needs both doors → needs the type with both doors" and never asked whether the repo had
already split them. It had, one file away, in a route doing the same job.

The map now carries this correction as a banner above its own headline section. **A wrong claim about
where a guard is impossible is worse than no claim, because it stops the search.**

## THREE INSTANCES OF ONE FAILURE IN A SINGLE TASK — this is a class, not three accidents

Task 7 produced the same move three times, each caught by the next party:

1. Its implementation scoped case 12.83's residual to *"`isUniqueViolation` matches only `events_pkey`,
   so it stays live for every other `ingestBatch` caller — closed for this door, not as a class."*
   **Wrong.** A second batch-killing throw sat in `contest()` itself, in Task 7's own new code,
   reachable with no duplicate and no unique violation anywhere on the path.
2. The fix for that then argued the degrade was safe because *"four existing cases assert a ticket
   refusal DOES become recorded history."* **Reasoned, not measured.** Forcing the degrade arm to take
   every contest-append reddens **eight**: 12.101, 12.102, 12.103, 12.105, 12.106, 12.110, 12.113 and
   12.114's second control.
3. I relayed instance 1 approvingly in a status report before instance 2 refuted it.

**The shape each time: a confident sentence about coverage standing in for the argument that a change is
safe.** It is cheap to write, reads as diligence, and is only falsifiable by running something. The
counter-move is the one already in the brief — print the rows, not the count — and it now has three
same-day instances behind it.

## THE DEFECT BATCH A ACTUALLY FOUND — a permanent sync wedge

`commitOne` refuses a ticket bound to another workspace. `processOne` sends any ticket refusal to
`contest()`. `buildContestedClaim` copies the refused claim's workspace and entity **verbatim** — the
property that makes contests coherent by construction — so the contest is the same mis-filing, meets the
same guard, and comes back refused. `contest()` threw, and the throw left `processBatch` entirely.

Measured on `[legal1, bad, legal2]`: `legal1` committed **but its answer was lost**, `legal2` was never
processed, and both the retry and the solo claim 500'd again. **An outbox holding that item never
drains, and nothing queued behind it ever syncs** — out of a route whose whole contract is that every
per-event answer rides inside `results`.

Fixed by **degrading** a refused contest-append to the claim's own refusal, reporting the original rule
and reason — character-for-character what `POST /v1/events` answers for the identical claim. Degrading
rather than enumerating uncontestable rules is deliberate: it closes the class, so no future refusal can
take a batch down because someone forgot to add it to a list.

## RECORDED, NOT FIXED — with named owners

1. **`isUniqueViolation` matches only `events_pkey`.** Closed for `POST /v1/sync`; open for every other
   `ingestBatch` caller. OWNER: unassigned — surface at the T14 stop point.
2. **There is no server identity.** Three docblocks say a contest should be attributed to one; `actorId`
   is a ULID and every ULID in that position is a real person. T7 followed `bootstrapWorkspace`'s
   precedent and attributed to the claimant, so `claimant_id` equals the contest's own `actorId` —
   making fan-out mis-routing invisible against production data and detectable only via its own
   fixture. Minting a system user is a PRODUCT decision no plan has taken. OWNER: **the owner**, at the
   T14 stop point.
3. **`StreamItem` should be REPLACED by `ServerStreamFrame`, not re-synchronised with it.**
   `packages/app-core/src/data-source.ts:60-63` names **Plan 10** as owner and **no task in T5–T13 names
   it**. OWNER: Plan 10, unassigned task. Surface at the T14 stop point.
4. **Snapshot retention is unowned** — one row per snapshot per entity, nothing deletes superseded ones.
   Correctness unaffected (`readLatestSnapshot` is `ORDER BY seq DESC LIMIT 1`); cost is unbounded
   storage. OWNER: the first plan that runs this against a real ledger.
5. **`startSnapshotWriter` is not re-entrant** — `setInterval` overlap collides on the snapshots primary
   key; caught and logged, ledger untouched. Unguarded on purpose: nothing yet establishes what a
   realistic pass costs, and a guard sized by guesswork is a second thing to be wrong about.
   OWNER: Plan 11 (boot path).
6. **`previous.state` is cast, not parsed** — no `ticketStateSchema` exists to validate a `jsonb`
   snapshot against (swept, with `ticketTypeDefSchema` as the control). A row corrupted out of band is
   folded onto rather than refused. OWNER: whoever adds `ticketStateSchema`.

## PROCESS DEVIATIONS — recorded, deliberately NOT corrected

- **Two fix rounds used `commit --amend`** rather than a new commit, so those fixes are not separately
  auditable in the PR, and two shas quoted in live status reports (`87a9e72`, `0c0ef35`) are now
  **orphaned** — `git branch --contains` empty, `git cat-file` still passing on both. Content intact and
  reachable at `658239c` and `09765d0`. **Not rewritten: rewriting history to fix history is the wrong
  direction.**
- **Two subjects carry conventional-commit prefixes** (`feat(server):`, `fix(test-cases):`) against this
  repo's prose convention. Both bodies are house-style and thorough. **Deliberately not amended** —
  rewriting two commits to fix a subject *prefix* would orphan shas for cosmetics, which is the exact
  hazard this file spends its length warning about.
- **One fix round verified a mutation restore with shell `diff`**, a method recorded on this machine as
  having returned a false "identical" for differing files. Independently re-verified with `git diff`
  plus a positive control: production untouched across both T6 fix commits, and both mutation targets
  present in the shipped file (`sync-routes.ts:109` REPEATABLE READ, `:119` `workspace_id = $1`).
- **Reviewers were told "do NOT fix anything" and at least one fixed anyway** (T5's amend). Outcome was
  good; the instruction was still not followed, which matters for reading any review's findings list as
  a complete account of what it changed.

## NEXT — in order

1. **One opus whole-branch review** of Batch A, then its fix round if it finds Critical/Important.
2. **Gate with `0 cached`** — every per-task gate this batch ran with 21 of 24 tasks served from turbo's
   cache. That is fine per task and NOT fine as the branch's final evidence.
3. **PR** for Batch A. The controller merges. **Step 15 ships as three PRs, one per batch seam** — the
   reasoning is in the section above; the short version is that the quota number the one-PR plan depends
   on is unmeasurable from this session, so the robust option wins over the optimal one.
4. **Batch B (T9 → T10)** branches from Batch A's head and rebases when A merges. **Capture Batch A's
   head sha in writing BEFORE the merge** — it is orphaned by the very event that triggers the rebase.

## WHOLE-BRANCH REVIEW DONE — one opus reviewer, and it found the seam no per-task reviewer could

Fix landed as `d400bf5`. **This is the entry that justifies the whole-branch stage existing.**

**The defect: `visibility.set` was in neither list.** The domain registry binds **13** event types to
`entityKind: 'ticket'`. T5's `TICKET_EVENT_TYPES` folds **10**; T6's `BOOTSTRAP_BACKFILL_TYPES` carried
**4**, two overlapping. Union: 12. The residue was `visibility.set` — and it was dropped from a
replica's payload **only when it sat at or below the ticket's snapshot seq**, because the writer skips
it while still advancing `seq` past it. One seq higher and the identical event travelled in full.

**That asymmetry is the defect. Not an exclusion — an accident of timing.** Whether a replica received
a visibility change depended on when a background maintenance pass last ran.

**Verified independently by the executor at `d400bf5`, by enumeration rather than by count** (this
branch has produced four wrong counts, so a bare number is not evidence here):

```
entityKind 'ticket'          13   control: 26 registrations parsed across 7 entity kinds
TICKET_EVENT_TYPES           10
BOOTSTRAP_BACKFILL_TYPES      5   (was 4; visibility.set added)
RESIDUE                       0   <- empty, and meaningful because the three sets above are populated
```

**Why it was invisible: no fixture could produce it.** `applyAll` + `setVisibilityEnv` run the
PROJECTIONS only and write no `events` row, so the entire bootstrap file held **zero** `visibility.set`
ledger rows. A gap that no fixture can express is not found by adding assertions to that fixture.

**And the root cause of why T6's author could not see it was off-branch and pre-existing:**
`packages/domain/src/ticket-state.ts` said *"the ten registered against `entityKind: 'ticket'`"* when
thirteen are. One stale docblock invited every reader to treat `TICKET_EVENT_TYPES` as the complete
ticket-entity set. Corrected in `d400bf5`.

### Three more seams that nothing was holding

1. **The contest backfill was unconstrained.** Deleting BOTH contest types from
   `BOOTSTRAP_BACKFILL_TYPES` — which silently omits every contest predating a ticket's snapshot, the
   exact failure the design note exists to prevent — left **all 971 server tests green**. T5's half of
   that cross-task property was pinned, T7's was pinned, **T6's was pinned by nothing.** Now 12.116.
2. **The route ordered `definitions` by `(entity_kind, entity_id, seq)`** — the ordering this branch's
   own case **12.92 exists to prove picks the LOSER**, because a ticket type's key lives in its payload
   and successive definitions of one key arrive on different entity streams. Now `workspace_seq`,
   matching `buildLedgerDeps`. 12.117.
3. **"The cursor is read FIRST" was asserted in three places and pinned in none.** 12.98 checked the
   isolation level by MEMBERSHIP, and membership cannot see position — moving `readStreamSeq` to just
   before `COMMIT` left all six bootstrap cases green. 12.118.

### FOUR SELF-FALSIFYING COUNTS ON ONE BRANCH — the class, with its worst instance

The review corrected five prose claims. The worst: **12.93 said dropping the workspace filter reddens
"seven cases". Measured: exactly ONE** — 12.93 itself, with 974 of 975 green across all 88 server test
files. Seven claimed against one actual.

Together with T7's three (residual scoped to `events_pkey`; "four cases" that measured as eight; my own
approving relay), that is **four wrong counts on a single branch, every one of them stated confidently
and none of them measured when written.** Two came from a round that updated a HIGHEST-ID header and
not the two sentences quoting the old maximum.

**The counter-move is already in the brief and now has four same-day instances behind it: print the
rows, not the count.** A count is a claim; an enumeration is evidence. Where a count must be stated,
state the command that produces it beside it.

## GATE — the branch's own evidence, `0 cached`

Run by the executor, not reported by an agent:

```
pnpm turbo run build test typecheck --force
Tasks:    24 successful, 24 total
Cached:   0 cached, 24 total
Time:     41.389s          exit 0
3,109 tests across 228 files, 8 packages
Node v22.22.2 — `pnpm exec node --version`, i.e. as the toolchain resolves it, not merely my shell PATH
```

**`0 cached` is the point.** Every per-task gate this batch ran with 21 of 24 tasks served from turbo's
cache. That is fine per task and is NOT acceptable as a branch's final evidence, because a cached task
is a claim about a previous tree.

---

# BATCH B IS OPEN — PLAN 10 T9, T10 (2026-09-04 ~10:45)

**PR #98 is open for Batch A and is NOT mine to merge.** https://github.com/bkirosangma/gisik-nokma/pull/98

| anchor | value |
|---|---|
| branch | **`exec/16-plan10-replica`**, cut from Batch A's head |
| **REBASE BASE — write it down, it gets orphaned** | **`32393beffaab6357aea5b2b30c1b825a8dfd7b96`** |
| Batch A branch | `exec/15-plan10-sync`, head `32393be`, pushed, PR #98 open |
| tasks | T9 (replica) → T10 (outbox + local pre-check). Sequential. |

## THE REBASE, WRITTEN BEFORE IT IS NEEDED

When PR #98 merges, `main` moves and **`32393be` is orphaned by that exact event** — `git cat-file`
will still pass on it and hand back pre-merge content. That is the trap that cost step 13→14 a round.

```
git rebase --onto origin/main 32393beffaab6357aea5b2b30c1b825a8dfd7b96   # correct
```

Do it in a scratch worktree (`git worktree add --detach`), never in the working one. **Verify with a
POSITIVE CONTROL, because an empty diff is also what a broken diff invocation prints:**
`git diff --stat <old-head> HEAD` empty **AND** `git diff --stat origin/main HEAD` non-empty and
matching expectation.

## WHAT BATCH A HANDS BATCH B — a live consequence, not background

`GET /v1/sync/bootstrap` now serves **five** backfilled ticket-entity types, not four:
`comment.added`, `attachment.added`, `claim.contested`, `claim.contested_resolved`, **`visibility.set`**
— that last one added by Batch A's whole-branch review, which found it belonged to neither the folded
set nor the backfilled set and therefore travelled or didn't depending on when a snapshot pass ran.

**So the replica receives ticket-entity events that `applyTicketEvent` does NOT fold.** Thirteen types
bind to `entityKind: 'ticket'`; only ten are foldable. **T9 must filter before folding or it throws on
the first contest** — and `claim.contested` is always backfilled, so this is not a rare path, it is the
common one. Enumerated at `32393be`, with 26 registrations across 7 entity kinds as the control:

```
entityKind 'ticket'        13
TICKET_EVENT_TYPES         10   <- what applyTicketEvent accepts
BOOTSTRAP_BACKFILL_TYPES    5
residue                     0
```

## OPEN — awaiting the controller, not blocking

Asked the controller for a quota re-measurement. **If it comes back with headroom, Batches B and C
collapse into one PR**; the branch topology is identical up to the moment a PR opens. Absent an answer,
three PRs stands.

---

# BATCH B IS COMPLETE — PLAN 10 T9, T10 (2026-09-04 ~13:15)

Branch `exec/16-plan10-replica`, **rebased onto `origin/main` after PR #98 merged as `999d486`**.
Rebase verified in BOTH directions with positive controls, because an empty diff is also what a broken
diff invocation prints: pre- vs post-rebase differs by exactly `controller-state.md` + `task-ledger.tsv`
(main's own content, the controller's Plan 9 promotion), and `main..HEAD` is non-empty at 14 files,
+3877/−25, all `packages/sync-client` plus three docs. Batch A's twelve commits are gone from the
history. A `backup/batch-b-pre-rebase` ref was taken first and still exists.

## THE CRITICAL FINDING, AND WHY THE SUGGESTED FIX WAS REFUSED

**The baseline-lowering hazard is LIVE, and the sentence excusing it was refuted by a test in the same
PR.** `replica.ts` and `test-cases/12` both said *"unreachable today, because nothing calls
`loadBootstrap` a second time."* Case **12.149**, 94 lines later in the same catalogue and the same
change set, calls `loadBootstrap` a second time on an already-bootstrapped replica and calls that
sequence *"a live sequence, not a contrivance."*

Measured: bootstrap ships a snapshot at seq 5; a `ticket.transitioned` to `doing` arrives at seq 6 over
the stream; a `workflow.defined` v2 that DROPS `doing` arrives and the stream door folds the ticket to
`todo`, raising the baseline to 6. A re-bootstrap serving the server's still-stale seq-5 snapshot lowers
the baseline to 5, replays event 6 against v2's vocabulary, and throws out of `loadBootstrap` with the
whole response rolled back. **The device can never re-bootstrap again.**

**The reviewer's suggested `Math.max(...)` guard was applied, measured, and REJECTED.** It removes the
throw and leaves every case green — while writing the server's seq-5 state under the local seq-6
baseline, so `refoldTicket` replays nothing above 6 and **the seq-6 transition vanishes from the
transition log while its row still stands in `events`.** Measured under the guard: `transitions` came
back with the seq-5 entry alone where the stream fold had left both. **A loud throw traded for a quiet
divergence in the very log `require-different-user` sorts on, caught by nothing.**

So the RECORD route was taken instead, with the hazard pinned by an executable case (12.154) rather than
by prose. *Prefer the check whose failure is loud, even when it is slower* — applied against a
reviewer's own suggestion, with the measurement to back it.

## THE ONE-DOOR CLASS HAS NOW APPEARED THREE TIMES

1. **Batch A:** the contest backfill was pinned on T5's side and T7's side and by nothing on T6's.
2. **Batch B, T9's fix round:** `foldTicketsOntoVersion` was called from `applyServerItem` and not from
   `loadBootstrap`, so the two doors answered differently on identical input.
3. **Batch B, whole-branch:** T10's `buildPendingOverlay` wraps `applyTicketEvent` in try/catch and its
   docblock explains why — `revokeScope` empties `workflows`/`ticket_types` while outbox rows stay.
   **T9's `refoldTicket` folds the same reducer against the same deps object with no catch.** Neither
   task's own reviewer could see it: T9's tests never deliver an event after `revokeScope`, and T10 does
   not own `applyServerItem`.

**This is now a named class, and it is the highest-yield thing a whole-branch reviewer can look for in
this codebase: a behaviour implemented on one door of a pair.** Put it first in Batch C's review brief.

## TEN SELF-FALSIFYING CLAIMS, AND THE TWO REMEDIES THAT DO NOT WORK

Running list on this line of work: the `events_pkey` residual · "four cases" that measured eight ·
"red in seven cases" that measured one · "FIRST TEST IN THIS REPO TO VARY TZ" (it was the fifteenth) ·
four "red here alone" notes · 12.149's description contradicting its own run in the same commit · two
scope banners naming absent the code beneath them · the banner rewritten to fix that, still claiming two
present sections absent · "unreachable because nothing calls `loadBootstrap` twice" · and the "15 files"
TZ count, **stale by one in three places, falsified by T10's own commit inside the same PR.**

**Two standing remedies were measured NOT to work here:**

- **A positive control does not catch a pattern blind to an equivalent spelling.**
  `grep -rl "process\.env\.TZ *="` returns 6 where the truth is 16, because strict
  `noPropertyAccessFromIndexSignature` pushes call sites to `process.env['TZ']` — and a control written
  with the same regex agrees with the wrong answer. **Only two independent readings caught it.**
- **Stating a count WITH the command that produced it is not enough either.** `replica.test.ts:642` did
  exactly that — the right discipline — and the count still went stale, because the same PR added the
  sixteenth file after the sentence was written. **A count is only true of a tree, and a PR is not a
  tree until it stops moving.** Re-measure every quoted count in the FINAL pre-PR pass, not when written.

## RECORDED, NOT FIXED — Batch B's additions, with owners

1. **The baseline-lowering hazard on the bootstrap door.** OWNER: **Plan 10 Task 11** (the sync engine),
   the first production caller that re-bootstraps a live replica. Pinned by case 12.154.
2. **The `refoldTicket` / `buildPendingOverlay` door asymmetry.** Kept as a throw deliberately
   (per-arrival rollback, contract 12.125) and now stated on BOTH doors. OWNER: **Plan 10 Task 11**,
   the first caller of `applyServerItem` with a cursor to advance — a throwing item leaves the cursor
   unadvanced, so the same item is redelivered and throws again: **a wedged stream, offline, after a
   revocation.** Pinned by case 12.155.
3. **`buildLocalDeps`' `ticket_types` lookup is an unconstrained path** — rewriting it to replay the
   event log leaves the whole suite green, while the `workflows` half is pinned by 12.143. Minor: the
   workflows lookup throws first in every sequence that could expose it. OWNER: Plan 10 Task 11.

### AND TWO DEFECTS IN ALREADY-MERGED CODE — these are Batch A's, found by Batch B

4. **Publishing a workflow version invalidates no snapshot.** `snapshot-writer.ts` has **0**
   `workflowVersion` hits (control: 25 `snapshot` hits in the same file) and there is no snapshot
   DELETE, so a bootstrap tail can carry a `ticket.transitioned` into a state the new version dropped
   and throw on replay. OWNER: needs one — it is in `main` as of `999d486`.
5. The re-bootstrap hazard above is partly Batch A's too, since the stale snapshot the server serves is
   what does the lowering.

## A STRUCTURAL FIX WORTH SOMEONE'S TIME — recorded, not built

Scope banners in `Features.md` and `test-cases/` assert "X is absent" and go stale **in the same change
set that lands X**, twice on this branch. **A test that extracts absence claims from those files and
fails when the named symbol is present would be a check that CAN fail** — which is exactly what those
banners currently are not. First proposal in this project for that class that does not rely on someone
remembering. OWNER: unassigned; suggest raising with the owner alongside the T14 items.

## NEXT — AND I AM STOPPING HERE FOR A QUOTA READING

PR for Batch B, then **STOP**. The controller measured weekly **87–89%** used (up from the 76% the stop
point was derived against), leaving ~11–13 points, and re-derived that **4–6 of Plan 10's remaining
tasks fit, not 8–9.** Batch B lands at 5 of 8. **Batch C (T11 → T12 → T13) is NOT auto-dispatched** —
starting a three-task batch that cannot be gated is the "full price, no gate" outcome one level down.
If the pool supports only part of it, **T11 alone is a coherent unit** (the sync engine) and it now
carries three inherited obligations: the two hazards above, plus the `StreamItem` constraint below.

**Ruling on `StreamItem` → `ServerStreamFrame` (executor, conservative default):** DEFERRED, because it
touches `data-source.ts`, the online source and every subscriber — larger than T11 or T12, and the same
class as the P24/P25 rulings. **Owner: Plan 10 owns a decision it never allocated a task for**; surface
to the owner. **The deferral is protected by two constraints binding Batch C**: T11 must reuse
`online/stream.ts`'s `WebSocketLike`-injection and lenient-parsing pattern rather than inventing a
second WS abstraction, and neither T11 nor T12 may declare a parallel or truncated frame union locally.
Under those, the replacement stays one type / N consumers / one seam and does not get more expensive by
waiting.

## GATE — Batch B's own evidence, `0 cached`, run by the executor

```
pnpm turbo run build test typecheck --force
Tasks:    24 successful, 24 total
Cached:   0 cached, 24 total
Time:     40.888s        exit 0
3,148 tests across 232 files, 8 packages
Node v22.22.2 — as `pnpm exec` resolves it
```

**Every quoted count re-measured at THIS sha before the PR, which is the remedy this batch learned.**
TZ-varying test files: **16**, by two independent methods that agree (alternation regex; and name-match
then filter, a different method rather than the same regex twice). Dotted-only returns **6** — the blind
pattern, kept as the comparison. No orphaned vitest at ppid=1.
