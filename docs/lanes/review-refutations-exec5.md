# Refutations — executor 5 (UX, Opus), round 2 phase 2

**Opened:** 2026-09-21 15:06 IST (phase 1 closed 15:05:23; my report frozen at `1641161d`). **Branch:** `exec5/review-ux`.
**Rule I hold myself to (rules §3):** a refutation names the target id and the FALSIFYING MEASUREMENT — a line I opened
or a reproduction I ran — and nothing else counts. A refutation I cannot back costs me the target's points; a check
that finds the target holding costs nothing and is worth recording.

## Branch heads read at opening

| lane | branch | head |
|---|---|---|
| exec 1 (UI, r2) | `exec1/review-ui-r2` | `2cfffc7a` |
| exec 2 (UX, r2) | `exec2/review-ux-r2` | `778a6439` |
| exec 3 (functionality, r2) | `exec3/review-functionality-r2` | `f8b5e929` |
| exec 4 (UI) | `exec4/review-ui` | `ccd60196` |
| exec 6 (functionality) | `exec6/review-functionality` | `737294ae` |

## Refutations filed

**None at opening.** Every candidate below was opened against source (and, where the browser allowed, painted) and
every one held. This section is revisited against each lane's later pushes until 17:05 IST; a refutation without a
falsifying line will not be added.

## Candidates examined during phase 1 and NOT refuted — with the line opened

| target | what I checked | line(s) opened | verdict |
|---|---|---|---|
| `exec2-V1` (empty board invites a create; no web caller wires `onCreateTicket`) | whether the project page passes `onCreateTicket` | `grep -c onCreateTicket apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` → 0 at `a7b6292b`; my painted empty columns showed the `+` glyph, *"No tickets in this column."*, no button | **holds** |
| `exec2-V8` (opening any parent raises a false "not shown rather than shown short" alert) | whether a `subtasks.data !== null` gate exists | `ticket-sheet.tsx:1278` `subtaskRows = subtasks.data ?? []`, `:1283` no gate, `:591` re-key on `projectId`, `use-live-query.ts:91-96` `setData(null)` on key change | **holds** |
| `exec2-F9` (comment box offered where the post can only be refused) | the reachability it names (a stale link to a deleted ticket) | `online-data-source.ts:271-274` (`getTicket` → `null` on 404), `ticket-sheet.tsx:626-631` (`Loading…` before the composer mounts); comments route `routes/tickets.ts:913-925` behind the same `canSee` + soft-delete gate as `:353-378` | **premise holds; the named path does not reach it** — the arm is reachable only in the delete-between-reads window (CONCURRENT). Not a refutation: F9 marked its reachability "reasoned, not measured", and the code comment it rests on is real. Recorded in my report §6.6. |
| `exec2-E2-24` (refused save + failed revert leaves the flip standing) | the revert arm | `account/page.tsx:223-229` | **holds** — and I painted its signed-out form (my E5-13, second reproduction) |
| `exec2-E2-27` (unknown sync status reads "Live") | the label's final branch | `sync/sync-status-bar.tsx` `syncStatusLabel(status: string, …)` — last `return` | **holds** |
| `exec2-E2-32` (a committed move keeps its comment) | any `setComment('')` | `transition-dialog.tsx:352-358` resets evidence only; `grep -c "setComment('')"` → 0 | **holds** |
| `exec2-E2-35` (delete asks nothing) | the control | `ticket-sheet.tsx:2612-2621` | **holds** (and my E5-9 is the refusal's geometry, which they folded with attribution) |
| `exec2-E2-37` (the New-ticket draft survives its close) | any reset | `new-ticket-dialog.tsx`: zero `useEffect`, no `setTitle('')`, no remount key | **holds** |
| `exec2-E2-38` (an archived project's board does not say so) | the page | `grep -ci archived apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx` → 0 | **holds** — and my E5-34 is what the bar does on that page |
| `exec2-E2-39` (failed roster read becomes "nobody is in this workspace") | the catch | `workflow-builder-screen.tsx:72` `listMembers().catch(() => [])` | **holds** |
| `exec2-E2-40` (`require-field` preview stuck) | the rule's read site | `rule-engine/src/rules/require-field.ts:9` reads `input.ticket.fields[rule.field]`, never the payload | **holds** — a genuine sibling of my E5-7, different rule and path |
| `exec2-E2-55` (the 200-entry notice is not "at the top") | the placement | `ticket-sheet.tsx:2727-2731`: `<HistoryList/>` then the notice | **holds — and it corrected MY §6.4a**, which had passed `docs/manual.md:418` as still true; corrected in my report before the freeze |
| `exec4-E4-23` (a 404 ticket opens a sheet stuck on "Loading…") | the arm | `online-data-source.ts:271-274`, `ticket-sheet.tsx:626-631` | **holds**; in my edge classes; learned from their report, not filed |
| `exec4-E4-34` (a guest's type rows keep the name `Edit <type>`) | the label | `ticket-type-list-screen.tsx:390` | **holds**; learned from their report, not filed |
| `exec6-E6-9` (the invite door refuses `sms`/`whatsapp`) | their door measurement against my "matches the export" note | `domain/events/invites.ts:70` `INVITE_CHANNELS = ['email','phone']` (per their Appendix H; I opened `routes/invites.ts:312` `channel: { type: 'string' }`) | **holds**, and it corrects my §3 row 15: a drawing-match is not a defence when the door disagrees |

## Where this lane would DEFEND (mirrors my report §6.7)

The expected attack on each exposed finding of mine, answered in advance: category-3 records are not rulings
(E5-2, 6, 8, 11, 16, 35); E5-9's number is one ticket's and the claim is structural; E5-13 is reached with no
injection at all (signed-out `/account`); E5-20's mechanism is two `document` listeners with one guard the sibling
never satisfies; E5-25's class is the product's own (`expired-session.tsx`); E5-37 rests on two independent docblocks
and is now painted by `exec4-E4-33`; E5-41's two absences were re-measured by exec 2 and hold; E5-42's fold is the one
in the shell. Defence paragraphs, dated, go under the finding in `review-ux-exec5.md` if a refutation lands.

## Log

- 15:08 IST — exec 4's `review-refutations-exec4.md` (head `ccd60196`) read: no refutation of mine; it PAINTS `E5-20`'s outcome
  (both dialogs gone on one Escape, `?ticket=` dropped) and `E5-4`'s picker, and narrows E5-4's mention clause (excluded,
  not blank). Dated Defence/corroboration paragraphs added under both findings in my report.
- 15:06 IST — file opened; no refutation; checks above are phase-1 work carried here so the judge can see the method.
