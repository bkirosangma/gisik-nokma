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

**Fifteen checks across all three lanes. Fifteen held. My refutation count is zero.**

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
