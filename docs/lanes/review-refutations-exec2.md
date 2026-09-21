# Refutations — executor 2 (UX), round 2

**Lane:** executor 2. **Branch:** `exec2/review-ux-r2`.

> ⚠ **WRITTEN DURING PHASE 1, not phase 2 — corrected.** This header said `Phase: 2 (T0 + 6 h → T0 + 9 h)`.
> Measured: T0 is **09:41:50 IST** (exec 6's refutation file states the boundary as 15:41:50 → 18:41:50), the
> last edit here was stamped **11:26 IST** when this note was written, and **13:48 IST** at the latest** —
> both well inside phase 1, which runs to 15:41:50. ⚠ **The parenthetical that stood here said "four hours
> still to run", measured at 11:26; the clock at the final edit says nearer two.** It is corrected rather
> than left, because a remaining-time figure is exactly the kind of reading that expires — and because I
> drifted from the clock twice today by estimating elapsed time from my own turn count. The reason for
> writing it early is exec 6's own, and it applies to me: **push is durability, and a lane has no guarantee
> of a turn at the boundary** — a refutation file that exists only in a worktree at 15:41:50 was never
> submitted. I had also inferred the phase from my turn count rather than reading the clock; that inference
> is what this note corrects.

## THIS FILE CONTAINS NO REFUTATION, AND THAT IS ITS CONTENT

**I claim nothing here.** The rules ask a refutation to name the finding id and the falsifying measurement;
I have none to name. Every candidate I tested reproduced. This file exists so the null is legible at the
path the judge will look for it, rather than being inferable only from the absence of a file.

**What I did instead of filing a weak one.** Round-2 §3 prices a refutation in both directions: upheld, the
finding's points move to the refuter and its author takes a ×3 penalty; **rejected, the refuter loses the
finding's points.** Filing a refutation I could not measure would have moved the ledger without moving the
truth of anything, so I read all three concurrent reports and tested every claim I could falsify by reading.

## PATHS — the table uses bare filenames, so here they are in full

`view-types.ts` = `packages/app-core/src/view-types.ts` · `board.tsx` = `packages/app-core/src/views/board.tsx` ·
`ticket-sheet.tsx` = `packages/app-core/src/views/ticket-sheet.tsx` · `transition-dialog.tsx` =
`packages/app-core/src/views/transition-dialog.tsx` · `create-ticket-flow.tsx` =
`packages/app-core/src/views/create-ticket-flow.tsx` · `account/page.tsx` = `apps/web/app/account/page.tsx` ·
`w/[workspaceId]/page.tsx` = `apps/web/app/w/[workspaceId]/page.tsx` · `ui.css` = `packages/ui/src/ui.css` ·
`TicketEditor.tsx` = `packages/editor/src/components/TicketEditor.tsx` · `sweep.ts` =
`apps/server/src/notifications/sweep.ts` · `fanout.ts` = `apps/server/src/notifications/fanout.ts` ·
`store.ts` = `apps/server/src/notifications/store.ts` · `notification-preferences-gateway.ts` =
`packages/app-core/src/account/notification-preferences-gateway.ts` · `ticket-dates-input.ts` =
`apps/web/src/ticket-dates-input.ts`.

## THE CHECKS, WITH THE LINE I OPENED

| target | the clause I tried to falsify | what I opened | outcome |
|---|---|---|---|
| `E5-1` | that my own `E2-1` rows already cover the Board passage | `E2-1`'s own rows (a)–(h) — nav, sign-out, theme toggle, workspace card, comments, attachments, settings ×2 | **not a re-find** — the Board/dragging passage is a seventh, none of mine touch it |
| `E5-2` | that the board card carries a key or a due field | `view-types.ts:204-214` `BoardCard` = `{ticketId, title, typeId, assignee, stateProvenance, cause, rollup, pending}`; `board.tsx:1035-1062` | **holds** |
| `E5-3` / `E4-1` | that a guard prevents two identical ancestor crumbs | `view-types.ts:529` *"The walk starts at `parentId`"*; `ticket-sheet.tsx:1772-1787` — no `epic.id !== parent.id` | **holds** (both lanes found it independently) |
| `E5-4` | that a nameless member is labelled rather than blank | `ticket-sheet.tsx:1672` `label: member.name`, raw, against `nameOf`/`actorLabel` 40 lines away | **holds** |
| `E5-6` | that a date input exists somewhere in product code | my own `type="date"` sweep → **2 hits, both prose**; `ticket-dates-input.ts` is a data adapter, not an input | **holds** |
| `E5-7` | that the Move preview receives the comment | `ticket-sheet.tsx:681-684` `payload = { to }` + evidence; `transition-dialog.tsx:281-294` deps `[toStateId, evidenceAttachmentId]` | **holds** |
| `E5-13` | that the collapsed preferences literal asserts nothing to the server | `account/page.tsx:215-232` — `toggleKind` builds from `prefs.mutedKinds` and `save(next)` PUTs the whole document (`notification-preferences-gateway.ts:18-22`) | **holds** |
| `E5-17` | that "nothing links to it" is false because `/account` mounts the screen | `account/page.tsx:16`, `:305` **do** mount it — **but the finding is scoped to the route's chrome and names `/account` as the shelled sibling**, so my measurement addressed a claim it never made | **holds; my intended refutation was aimed at the title, not the finding** |
| `E6-2` | that the assignment fanout filters soft-deleted tickets | `sweep.ts:176-177` the rule, `:187` `AND ${LIVE_TICKET_WHERE}`; `fanout.ts:102-104` mentions `deleted_at` **only in a comment**; `store.ts:127-132` filters nothing | **holds** |
| `E4-2` | that `ui.css` gives the Close glyph a size | `ui.css:719-728` — font, size, line-height, border, background, colour, cursor; **no** `min-height`/`min-width`/`padding`/`display` | **holds** |
| `E4-3` | that `ui.css` gives the `who · when` toggle a size | `ui.css:990-998` — font, size, border, background, colour, cursor, padding, text-align; **no min size** | **holds** |
| `E4-4` | that the editor has an accessible name | `TicketEditor.tsx:119` `<EditorContent …/>` with no `aria-label`/`role`; `ticket-sheet.tsx:2404-2435` `<dt>description</dt><dd><EditorSlot …/></dd>` | **holds** |
| `E4-5` | that the `<h1>` is not a button | `w/[workspaceId]/page.tsx:797-810` — the `<h1>` contains `<button aria-label={\`Rename ${workspace.name}\`}>` | **holds** |

| `E5-21` | that a phone comment is filed under the assignee id and lands in the ledger | `check-permission.ts:542-545` `if (env.actorId !== ctx.sessionUserId) return refuse(IDENTITY_SPOOF_REASON)` — the reason at `:71` is *"You cannot submit a claim as another person."* So the claim is **refused, never committed**, and the phone swallows the queue (`ticket-screen.tsx:53`) | **holds — and it CORRECTED MY OWN `E2-42`**, which had said the comment *is* written to the ledger. It is not. The correction is recorded in the finding rather than quietly rewritten. |

| `E4-12` | that the signed-in tap-target instrument runs on more than one route or width | `measureTapTargets` has **one** call site in `e2e-stack/viewport.spec.ts` (`:170`); the log prefix at `:173` reads `[stack-phone-390] /my-work`; and the baseline key at `:194` is the single string `stack-phone-390|/my-work` — **one key means one population**, which is the strongest form the claim could take | **holds** |

| `E5-12` | that two screens report different project counts for the same workspace | **both sides opened.** `/account`: `apps/web/src/account/workspaces-section.tsx:75-77` renders `{workspace.projects.length}` — the **raw** array, **archived included**. `/workspaces`: `apps/web/app/workspaces/page.tsx:259-264` computes `const live = workspace.projects.filter((project) => !project.archived)` and renders `projectCountLine(live.length)` — **archived excluded** | **holds** |

| `E4-9` | that the workflow builder really renders a second `<main>` | `workflow-builder-screen.tsx:131` is `<main className="workflow-builder-screen__canvas">`, nested inside the route's own `<main className="gn-shell">` — **two landmarks** | **holds** |
| `E4-14` | that the filter chip's remove control is outside `DENSE_IN_LIST` | `e2e-viewport/tap-targets.ts:140-177` lists four entries — `.gn-attention__title`, `.gn-help__nav-link`, `.gn-help__group-toggle`, `.gn-help__pager-link` — and **no** `.gn-project__filter-chip-remove`, so by the product's own rule the control is judged at 44 while painting at 8×13 | **holds** |

| `E4-11` | that `.gn-nav__links` has no narrow-width variant, so the bar grows at 390 px | `globals.css:1801` is exactly the quoted rule (`display: flex; flex-wrap: wrap; …`), and the only nearby media query (`:1798` `@media (max-width: 60rem)`) targets `.gn-nav__inner` padding, **not** `.gn-nav__links`; no media query anywhere in the file redeclares it | **holds** — with the honest note below |

### Then the two lanes I had not read at all — exec 1 (UI) and exec 3 (functionality)

**The check had covered three lanes; these are the other two, so the null now spans all five.**

| target | the clause I tried to falsify | what I opened | outcome |
|---|---|---|---|
| `P19` (exec 1) | that the project page's view switcher is a `tablist` with no accessible name — and **my first hypothesis was that it must have one**, since `SegmentedControl` requires the prop | `page.tsx:2058` is `<div className="gn-segmented" role="tablist">` — **page-local markup wearing the component's CLASSES** — and `aria-label`/`aria-labelledby` occur **0** times anywhere in `:2030-2090`. `segmented-control.tsx:9,25` shows the component requires and renders the name; the page never adopted it | **holds** — and the finding anticipates my exact hypothesis: *"It adopted the shared CLASSES and kept its own markup"* |
| `P22` (exec 1) | that two `role="menu"` elements carry no accessible name | `apps/web/src/account-menu.tsx:148` is `<div ref={menuRef} id={menuId} role="menu" className="gn-nav__menu">` — **no `aria-label`, no `aria-labelledby`** | **holds** |
| `P23` (exec 1) | that the searchable Select removes focus and supplies no ring — the one its own text calls *"the finding I would most expect to be wrong"* | `ui.css:2474` is `.gn-select__trigger--searchable input:focus { outline: none; }` **verbatim**; it is the **only** `outline: none` in the whole file (grep count **1**); and `.gn-select[a-z_-]*:(focus\|focus-within\|focus-visible)` over `ui.css` returns **0** matches, so nothing replaces it | **holds** |


### And the strongest form of check — I ran their command and got their number

**`F6` (exec 3, LOW) — reproduced independently.** It claims two places state a figure that the command
printed beside them does not produce: the file says **13 executable uses across 9 files**, exec 3 says
**14 across 10**. I ran the published command myself and classified all 41 rows by hand:

| | the file claims | exec 3 claims | **I measured** |
|---|---|---|---|
| `${LIVE_TICKET_WHERE}` splices, executable | 8 | 9 | **9** |
| `LIVE_TICKET_WHERE,` array members | 5 | 5 | **5** (11 raw, minus the **6 import statements** that also carry a comma) |
| executable uses | 13 | 14 | **14** |
| files carrying an executable use | 9 | 10 | **10** |

**exec 3 is right on every line and the file is wrong on three.** And the surplus site is exactly the one
they name — `read/live-ticket.ts:58`, whose `ticketIsLive` holds `${LIVE_TICKET_WHERE}` inside a real
`SELECT 1 … WHERE`, which the project classifies as *"asked at a route … NOT a predicate inside the read's
SELECT"* while the sentence counting *"executable uses of the constant"* does not say so. **Reproducing a
count independently, by running the author's own command and classifying every row, is the check I would
most want run against my own findings** — and it is the one form of verification this file contains that
does not rest on reading a line.

| `F6` (exec 3) | that a published count does not reproduce from the command printed beside it | **I ran their command**: `git grep -n LIVE_TICKET_WHERE -- apps/server/src` → 41 rows, classified by hand. Executable splices **9** (file says 8), array members **5** (after removing 6 import statements), uses **14** (file says 13), files **10** (file says 9) | **holds — reproduced, not just read** (full table above) |


### Continuing into exec 1's remaining findings — two more, one of them the class I care about most

| target | the clause I tried to falsify | what I opened | outcome |
|---|---|---|---|
| `P16` (exec 1, IMPORTANT) | that a styling case asserts the absence of a declaration through a scanner that **cannot fail** | `neo-card-radius.test.ts:34-36` is exactly the quoted scanner — `css.split('\n').find((line) => selectorPattern.test(line) && line.includes('{'))` — so it returns **the single line** where the selector and `{` appear; and the third case (`:51-57`) does `expect(rule).toBeDefined()` then `expect(rule?.includes('border-radius')).toBe(false)`. With the selector on its own line the string is `".gn-sign-in {"`, which **never** contains `border-radius`, whatever the rule declares | **holds** |
| `P20` (exec 1, MINOR) | that the calendar's month grid carries no table or grid semantics | `calendar-view.tsx` contains **0** occurrences each of `role="grid"`, `role="table"`, `role="row"`, `role="gridcell"`, `role="columnheader"`; the weekday head at `:396-398` is `<div>` + seven `<span>`s | **holds** |


### Two more from exec 1, one of them in my own strongest vein

| target | the clause I tried to falsify | what I opened | outcome |
|---|---|---|---|
| `P2` (exec 1, IMPORTANT) | that the board's whole-board empty state has **no styling at all** | In all of `ui.css` the only two lines naming `gn-board__empty` / `gn-board--empty` are **comments** — `:835` (*"a different granularity from `.gn-board__empty-*` above"*) and `:4980` (*"`.gn-board__empty-create`, 37 more"*). **Zero selector blocks.** I took care to separate comment hits from rule hits, because a grep that cannot tell them apart is the silent-empty failure | **holds** |
| `I3` (exec 1, IMPORTANT) | that `DENSE_IN_LIST`'s stated reason for excluding `.gn-my-work__title` is falsified **by its own docblock** | `tap-targets.ts:71-76` states the rule — clause **(a)** the CSS makes the 24px call, AND clause **(b)** *"a sweep actually visits the route it renders on"*. `:82` lists `.gn-my-work__title` among the deliberately excluded and says its rule is *"byte-similar to `.gn-attention__title`"*, which **is** a member (`:142`) — so (a) holds. And **(b) holds on a measurement I had already taken independently**: `e2e-stack/viewport.spec.ts:170` measures tap targets on `/my-work` | **holds** — the exclusion rests on a clause that is satisfied |


### And into exec 3, the lane I had checked least — including the class my own rules call critical

| target | the clause I tried to falsify | what I opened | outcome |
|---|---|---|---|
| `F1` (exec 3, IMPORTANT) | that an open-gap section still declares a leak whose two supporting numbers are stale | The section at `soft-delete-background-paths.test.ts:142-144` asserts *"`routes/attachments.ts` contains the word `deleted` **ZERO** times, while the same grep finds it **6** times in `routes/tickets.ts`"*. I measured **6 occurrences across 5 lines** in `attachments.ts` and **13** in `tickets.ts` | **holds** |
| `F2` (exec 3, IMPORTANT) | that a recorded survivor measurement's stated warrant is false — the second witness read a stale `dist` | The docblock claims *"that test imports `../../src/replica/replica-data-source.js`, not the package name, so nothing resolved through a stale `dist`"*. I opened both halves: `packages/app-core/test/replica/replica-data-source.test.ts:30` **does** import the relative path — and `apps/server/test/dual-client/rig.ts:32` imports **`'@gisik-nokma/app-core'`**, the **package name**, in the half the same sentence cites as *"21 passed"* | **holds** |


| `F8` (exec 3, LOW) | that `check:db-tz` is the only one of the nine checkers with no automated invocation | `check:db-tz` occurs **once in the whole repo** — its own definition at `package.json:14` — and **is absent from `ci.yml`**, while all eight others (`check-env`, `check-runbook`, `check-citations`, `check-help`, `check-tasks`, `check-migrations`, `check-case-ids`, `check-no-silent-skips`) appear in the workflow | **holds** |
| `F3` (exec 3, IMPORTANT) | that their own lane's §17 group cites an artefact the owner has ruled is not the prototype | `test-cases/17-open-work.md:58` cites `` `design-system/interactive/desktop.dc.html` ``, and I re-verified that file is the **camelCased copy** — `viewBox` occurs **0** times in it and `sc-camel-view-box` **24** — while the owner's ruling is that the prototype is the exported zip | **holds** |


| `P18` (exec 1, IMPORTANT) | that a client-side navigation announces nothing in the shell | `layout.tsx`, `providers.tsx` and `app-nav.tsx` each contain **0** occurrences of `aria-live`, `role="status"` or `role="alert"` — exactly the correction exec 1 made to its own first pass | **holds** |
| `P24` (exec 1, IMPORTANT) | that a text colour is undeclared, so the contrast gate cannot see it | `ui.css:2736-2743` is the quoted rule **verbatim** (`background: var(--gn-surface-sunken); font-size: 0.8rem; color: var(--gn-danger);`), and `tokens.ts` contains **exactly one** row matching a `danger` foreground/background pair — `:1225` `{ fg: 'dangerText', bg: 'danger', minimum: 4.5 }`. So `dangerText on danger` is declared and `danger on surfaceSunken` is not | **holds** |
| `P11` (exec 1, IMPORTANT) | that the open Select panel's rows match no arm of the tap-target selector | `tap-targets.ts:267-280` is `a[href], button, input:not([type="hidden"]), select, textarea, summary, [role="button"], [role="link"], [role="tab"], [role="checkbox"], [role="switch"], [tabindex]:not([tabindex="-1"])` — **no `[role="option"]`, no `[role="listbox"]`** | **holds** |


| `I1` (exec 1, **CRITICAL**) | that no browser-based UI instrument has executed anywhere since 2026-09-06 | `gh api …/actions/runs?per_page=15` → **15 of the 15 most recent runs are `failure`**, every `main` run among them. And the job breakdown of the latest `main` run (`35560484912`) is the sharper fact: **`scope` fails first, so `build`, `typecheck`, `server-tests`, `e2e` and `viewport` are all `skipped`** — the instruments do not fail, they never start | **holds, with a mechanism worth adding** |


### What the red gate actually means — measured, and it cuts both ways

`I1`'s mechanism led somewhere more useful than the check itself. The latest `main` run has `scope` failing
first and five jobs **skipped**, and **four `check-*` jobs failing independently**. So I ran every one of the
seven checkers **locally, on this tree**:

| checker | CI | **on this tree** |
|---|---|---|
| `check:help` | **failure** | **PASS** |
| `check:runbook` | **failure** | **PASS** |
| `check:citations` | **failure** | **PASS** |
| `check:migrations` | **failure** | **PASS** |
| `check:tasks` | skipped | **PASS** |
| `check:env` | skipped | **PASS** |
| `check:db-tz` | not in CI at all (`F8`) | FAIL — `DATABASE_URL is required`, i.e. an unset variable |

**Six of six runnable checks pass on the tree this exercise reviewed.** So the red gate is **not a content
failure**: whatever is failing in CI is failing for a reason that does not reproduce here — which is exactly
the shape this repository has recorded before, where a gate result is not evidence unless it names its
environment.

**And the correction cuts both ways, which is why it is worth the judge's attention:**

- **Reading "all CI red since 2026-09-06" as *"the product is broken"* is wrong.** Six checks that run and
  fail in CI pass here, on the reviewed tree.
- **Reading the green local runs as *"the gate passes"* is equally wrong.** `scope`'s failure **skips**
  `build`, `typecheck`, `server-tests`, `e2e` and `viewport` — so the suites that would exercise the browser
  have not run in two weeks, whatever the checkers say. `I1` is right and its consequence is worse than "a
  test fails": **a green local run and a red CI run can both be true of the same tree, and neither of them
  has exercised the product in a browser.**

⚠ **Boundary:** I ran the checkers here and read the job conclusions; I did **not** establish *why* CI fails,
and I do not speculate. `check:db-tz`'s local failure is an unset variable rather than a defect — and it is
the one checker `F8` found has no automated invocation anywhere, so nothing would have caught it either way.


### Two more, one of them the class my own brief names

| target | the clause I tried to falsify | what I opened | outcome |
|---|---|---|---|
| `E6-9` (exec 6, IMPORTANT) | that the invite form offers three channels while the door refuses two | **Both sides opened.** The form: `members/page.tsx:847-856` `<Select options={[{ value: 'email' }, { value: 'sms' }, { value: 'whatsapp' }]} aria-label="Channel" />`. The door: `packages/domain/src/events/invites.ts:70` `INVITE_CHANNELS = ['email', 'phone']`, `:73-74` the error map *"requires channel 'email' or 'phone'"*, `:115` `channel: inviteChannelSchema` | **holds** |
| `E4-18` (exec 4, IMPORTANT) | that the Assignee picker renders a blank option for a member with no display name | `ticket-sheet.tsx:1672` `...people.map((member) => ({ value: member.id, label: member.name }))` — `member.name` **raw**, no `actorLabel`. ⚠ **I had already opened this exact line for `E5-4`**, so this is a second lane reaching the same site from a different direction | **holds** |


| `I2` (exec 1, IMPORTANT) | that a committed artefact records a defect that was fixed later, with nothing saying which run produced it | The artefact: `e2e-stack/non-text-contrast-roster.json` records `"belowCount": 1` with `button.ticket-type-list__move` at **1.41** on `/settings/ticket-types`. The fix: that class now has **three selector blocks** — `ui.css:5836` (the rule), `:5851` (`:focus-visible`), `:5855` (`:disabled`) — against a comment at `:5677` recording that it *"had NO RULE OF ITS OWN — 0 hits for the class"* | **holds** — the artefact has not been regenerated |
| `P15` (exec 1, MINOR) | that the repo's generated prototype copy is **one line offset** from the owner's export | **Measured at a shared landmark.** Repo copy `design-system/interactive/desktop.dc.html`: **4051 lines**, `const navDef` at **2437**. Owner's export `Gisik Nokma - Desktop.dc.html`: **4050 lines**, `const navDef` at **2436**. **Exactly one line, at the same construct** | **holds** |


| `I4` (exec 1, MINOR) | that a citation **resolves** and still misleads | `tap-targets.ts:43-45` quotes *"Dense in-list controls get 24, standalone controls get 44 — the same call `/help`'s table-of-contents links got"* and cites **`ui.css:1606-1616`**. Those sixteen lines are a **`border-left` marker ruling** — `"WHAT LEFT, AND WHY IT IS NOT A REVERSAL"` — and say nothing about 24 or 44. The sentence actually lives at **`ui.css:1662`** | **holds** |
| `P17` (exec 1, MINOR) | that `/my-work`'s heading outline skips level 2 | `my-work/page.tsx:51` renders `<h1 className="gn-page-title">My Work</h1>` and `my-work.tsx` renders its four section headings (`:75`, `:86`, `:97`, `:116`) as `<h3 className="gn-my-work__heading">` — **h1 straight to h3** | **holds** |

**Forty-one checks across all five lanes. Forty-one held. My refutation count is zero.**

> **`I4` is the finding I would most have wanted to write myself, and it is one I did not.** Its class is
> *"a citation that resolves is not a citation that is right"* — a rule this repository has recorded, and one
> my own report files against other documents three times. exec 1 found an instance in a **docblock that
> justifies the product's own tap-target rule**: the range it cites is real, non-empty, and about something
> else entirely. **It is the cheapest possible defect to miss and the most expensive to act on**, because a
> reader who follows the citation lands on a passage that appears to be about rulings and concludes the
> threshold was ruled there. My own sweep for exactly that shape — the citation sweep over my round-2 half —
> checks that paths exist and line numbers are in range, and **would not have caught this**, because both are
> true here. That is a real limit in my instrument and I am recording it rather than leaving it implied.

> **`P15` is worth a note for the shape of its own history, not only its measurement.** exec 1 filed it at
> **IMPORTANT**, then read `design-system/interactive/support.js` and found that `sc-camel-*` is that runtime's
> **own reversible encoding** (`:366-370` encodes, `:422-423` decodes) rather than a broken transform — so the
> icons *do* draw, and they corrected their own finding **downward in the same round**, with the correction
> now most of the finding's text. **A lane that downgrades its own claim after reading the mechanism is the
> single most credible thing in any of these reports**, and it is why I checked the surviving claim rather
> than the withdrawn one: the offset is real, exactly one line, at the landmark they would cite.

> **`E6-9` is the brief's own named class, and the sharpest instance of it I have seen today:** *"A REFUSAL
> THAT ARRIVES AFTER THE PRESS IS A DEFECT."* An admin picks `sms` or `whatsapp` — the two options that
> describe a phone number — and gets a 422 naming `'phone'`, **a value the form does not offer**, so a phone
> invitation cannot be minted from the shipped page at all while the value that would work is unreachable.
> My own report has a finding of this shape (`E2-35`, the Delete with no confirmation, argued from the
> product's contrary practice) and **`E6-9` is better evidence for the rule than mine is**: mine argues from
> the absence of a decision point, theirs shows a *value* offered that the validator rejects by name.
>
> **And `E4-18` is the second time a peer has reached a line I had already opened.** `ticket-sheet.tsx:1672`
> is the blank-label site from `E5-4`; here it is reached from the picker's rendering rather than from the
> roster. **Two lanes converging on one line from different directions is the strongest form of confirmation
> available in a review of this shape** — it is what makes me confident the finding is about the product
> rather than about one reader's path.

> **What I can add to `I1`, offered to the judge rather than filed as my own finding.** Its claim is that
> no browser-based instrument has *executed*; the job table says why. The failure is in `scope`, the first
> job, and every job that `needs:` it is **skipped** — so the red pipeline is not nine broken suites, it is
> **one failing gate and eight jobs that never begin.** That distinction matters for anyone deciding what to
> fix: repairing `scope` would un-skip `build`, `typecheck`, `server-tests`, `e2e` and `viewport` in one
> change, and *then* whatever is genuinely broken in them would become visible for the first time since
> 2026-09-06. **I also observed four jobs failing independently** — `check-migrations`, `check-help`,
> `check-runbook` and `check-citations` — which the `scope` cascade does not explain, so it is not one cause.
>
> ⚠ **The boundary on this:** I read the run list and the job conclusions through `gh api`; I did **not** read
> the failing steps, because the steps call returned empty and running the logs is not this lane's work. So I
> state what the conclusions say and do not speculate about the cause inside `scope`.

> **`P11` is the one that names my own blind spot, and it does so in the brief's words:** *"a sweep that
> cannot see a class is a sweep that reports zero offenders."* I ran seven sweeps today — the catch sites,
> the `.then` calls, the collapse-to-empty handlers, the `disabled=` expressions, the copy absolutes, the
> case-catalogue quotations, the rendered counts — and **every one of them is a selector like this one:
> anchored to a syntax I chose.** The eight peer findings I could not falsify are disproportionately the
> ones whose evidence is a *painted* measurement, which is to say the ones no selector of mine reaches.
> exec 1 found the shape of that and filed it; I spent the day inside it.

> **`F3` is a lane auditing its own output, and it is worth naming as such.** exec 3 reports that a block
> **its own lane wrote** cites the wrong artefact — *"every citation in it is off[set]"* — against an owner
> ruling that landed after the block was written. **Reviewing your own shipped work is the part of this
> exercise a lane is best placed to do and least inclined to**, and it is the one I did least of: I found six
> errors in my own report, but all six were mechanical (a wrong outcome stated, a lost line, a claim about a
> browser, a broken pattern, an unpinned unit, two stale counts) — **not one was a finding of mine that
> should not have been filed.** exec 1 withdrew a seventh-panel claim when an ancestor rule refuted it;
> exec 3 filed against its own §17 group; I have nothing of that kind to show, and that is a gap in my
> work rather than a virtue in it.

> **Two notes on my own measurement of `F1`, because the unit is the whole story.** The judge's round-1
> verification of the same sentence recorded `grep -c deleted` → **5** for `attachments.ts`; I measured **6**
> occurrences. **Both are right and they are different units**: `grep -c` counts matching LINES, and I
> counted occurrences, so six on five lines reconciles exactly. I state my unit rather than the number
> alone, because *"a count is evidence only once its unit is pinned"* is a rule I have already broken twice
> today in my own report.
>
> **And `F2` is the class my own brief calls critical** — a cross-package mutation under a bare runner
> testing the stale `dist`, where *"a mutation that never ran is indistinguishable from a killed one"*.
> exec 3 found it by reading the **import style** of both halves rather than trusting the docblock that
> asserts both are safe, which is the only way that shape is ever caught. It holds, and it is the strongest
> single finding I have checked in any of the five lanes.

> ⚠ **`I3` is the one where I had independent evidence and did not have to take their word.** My own
> reachability work had already opened `e2e-stack/viewport.spec.ts:170` and established that the signed-in
> tap-target instrument measures on `/my-work` — which is clause (b) of exec 1's argument. **Arriving at a
> peer's finding from a measurement taken for a different purpose is the strongest position a referee can
> be in**, and it is the one place in this file where I did not have to trust their citation to agree with
> their conclusion.

> **`P16` deserves the sentence, because it is the failure class this whole report is organised around.**
> The case *reads* as a guard — it asserts the absence of a declaration and prints the rule in its failure
> message — and it **cannot fail** when the thing it guards returns, because the value it inspects is one
> line of a rule whose declarations live on the next. **A mutation that sets `border-radius` in
> `.gn-sign-in` leaves it green.** exec 1 found it by reproducing the scanner and running it on a rule that
> sets the very thing the case forbids, which is the only way to catch this shape — and it is the one class
> of defect I would most want the other lanes to be good at, since my own report is built on the same
> assumption (that a green check means the property holds). I checked it rather than trusting it because
> getting it wrong in *their* favour costs me nothing and getting it right in mine is worth three points;
> it holds.

> **`P23` is worth a sentence to the judge, because it is the one I tried hardest to break.** Its author
> flagged it as the finding they would most expect to be wrong, opened every step, and checked that the
> removal is unique in its stylesheet. I re-ran all three of those checks independently and got the same
> three answers. **A finding that pre-empts its own refutation is the hardest kind to attack, and it is
> the shape the other lanes' strongest findings share** — `P19` answering the `SegmentedControl` hypothesis
> before I could raise it, `E5-17` scoping itself to the route's chrome rather than the surface's
> reachability. Whatever else this round produced, the peer lanes did not leave obvious openings.

> **On `E4-11`, the honest note that cuts the other way and is NOT a refutation:** the same stylesheet
> **documents** the growth at `:1766` — *"`.gn-nav__links` wraps, so the bar grows on narrow viewports —
> measured at …"*. So the behaviour their finding reports is known in the file, with a measurement of its own.
> That is a reason a judge might weigh the finding differently, **but it is not invalidity**: §3 invalidates a
> finding that contradicts *a ruling*, and a comment recording a measurement is not a ruling — it is the
> same distinction the common brief draws when it says *"the reason a thing was built is not a ruling"*. I
> record it because a judge ruling on `E4-11` should have it, and because I am the lane that has filed that
> distinction six times against other documents and would be inconsistent not to apply it here.

> **`E5-12` additionally has a CAUSE, which I measured and which its text does not state — offered to the
> judge as an explanation, not as a finding of mine.** The two screens count **different units**: `/account`
> counts every project in the array, `/workspaces` counts the live ones, and **neither screen says which**.
> That is why the same workspace reads *"1 project"* on one and *"2 projects"* on the other with nothing on
> either screen to reconcile them — an unlabelled unit rather than a wrong number, which is the shape my own
> `E2-2` files one card over. I am **not** filing it: `E5-12` is the finding, I found its cause by reading
> their report, and a cause is an addition to their claim rather than a separate one. Recorded here because a
> judge ruling on `E5-12` will otherwise have to chase the discrepancy themselves.

## TWO THINGS I WOULD WANT THE JUDGE TO READ IN THIS FILE

1. **`E5-17` is the one where I nearly filed, and the reason I did not is the useful part.** Its *title*
   promised that the revoke surface was unreachable, and I had a clean falsifying measurement:
   `McpTokensScreen` is mounted on `/account` (`account/page.tsx:16`, `:305`), which the account menu links
   to. **Then I read the finding, and it makes no such claim** — it is scoped to the `/mcp/tokens` route's
   chrome, and it names `/account` as the shelled sibling that route lacks. My measurement answered a
   question it did not ask. Filing it would have earned nothing and cost the finding's points. **A
   refutation must be aimed at the claim, not at the title.**
2. **Both lanes that found the duplicate-hop crumb did so independently** — lane 4's `E4-1` and lane 5's
   `E5-3` are the same defect from the same two lines. I am recording that because §3 says independent
   duplicates both score in full, and a reader seeing two identical findings might otherwise reach for the
   first-commit rule that §3 explicitly does not have.

## WHAT THIS NULL DOES NOT COVER

Their **painted** measurements — `[BROWSER]` sizes, contrast ratios, the ESC-with-two-dialogs-open
sequence — I cannot reproduce without a browser, and I do not claim to have. What I tested is the **source**
clause each finding rests on, which is the part readable from here. A painted value could still be wrong;
if the judge wants one checked, it needs a browser, not a second reading.
