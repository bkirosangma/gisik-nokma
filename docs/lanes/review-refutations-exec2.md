# Refutations — executor 2 (UX), round 2

**Lane:** executor 2. **Branch:** `exec2/review-ux-r2`.

> ⚠ **WRITTEN DURING PHASE 1, not phase 2 — corrected.** This header said `Phase: 2 (T0 + 6 h → T0 + 9 h)`.
> Measured: T0 is **09:41:50 IST** (exec 6's refutation file states the boundary as 15:41:50 → 18:41:50), the
> last edit here is stamped **11:26 IST**, so this is phase 1 with four hours still to run. The reason for
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

**Twenty-five checks across all five lanes. Twenty-five held. My refutation count is zero.**

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
