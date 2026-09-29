# Board: soft WIP limits and swimlanes — design (short)

**Status:** draft spec for owner review. Written 2026-09-29 by the planner.
**Base:** `origin/main` at `bd7440bc`. Citations are lines read on that tree; the plan re-reads each before building on it.
**Target branch:** `release/2026-09-29`, after the styling refresh (Plan A Tasks 5–5B own the board's column markup, so this builds on top of it).

## 1. The request

The owner, reviewing a kanban-UX video on 2026-09-29, picked five ideas. Three went into the styling plan (hover shadow, drag lift + placeholder, collapsible columns). The other two are here:

- **(3) soft WIP limits** — a limit per column, shown as `4/4`, the header tinted when a column is over, **warn, never refuse**;
- **(5) swimlanes** by epic or by assignee.

Owner ruling, 2026-09-29 evening: *"rest as recommended"* on "Both, as short specs: WIP limits warn rather than refuse; swimlanes come after them."

## 2. Soft WIP limits

### Decisions

| # | Decision | Why |
|---|---|---|
| L1 | **The limit lives on the workflow STATE**, as an optional `wipLimit` (a positive integer), beside `blocked` and `creatable` (`packages/domain/src/workflow.ts:7-30`). Absent means no limit. | Exact precedent: `blocked` and `creatable` are additive optional state flags set in the workflow builder and carried through publish. A state IS a board column (`workflow.ts:9`, "A state's name is a board column's header"). |
| L2 | **Set in the workflow builder**, one number field per state, by whoever may edit workflows today. Publishing a new version carries it. | No new permission, no new event type, no new screen. |
| L3 | **Soft.** A move into a full column is never refused, not by the engine, the board, the sheet or a drag. | Owner: "warn, not refuse". |
| L4 | **What counts:** the cards the column holds on the board for everyone — the column's own count, before the viewer's filters. A filtered view still shows the true `n/limit`. | A limit is a team fact; a filter must not make an over-full column look fine. **Plan must confirm** the board has the unfiltered count available; if it does not, count what the board holds and say so on the header ("filtered"). |
| L5 | **What shows:** the header count becomes `n/limit` (e.g. `4/4`) when a limit exists. At the limit it reads in the text tier; **over** the limit the track takes a warning tint (the house `warning` family, text ≥ 4.5:1 on it) and the count gains an icon, so colour is never the only signal. The collapsed strip (styling Task 5B) shows the same `n/limit` and tint. | Rule: colour never the sole carrier. |
| L6 | **The warning at the moment of the move:** a drop or arrow move that takes a column over its limit shows a non-blocking notice — "Doing is over its limit (5/4)" — in the board's existing live region. The move has already happened. | Warn, not refuse; screen readers hear it. |
| L7 | **Backlog has no limit** (it is not a board column, spec §1.1). Terminal columns may have one, but the builder hints it is unusual. | |

### Out of scope
Hard limits; per-person limits; limits per project that differ from the workflow's (one workflow shared by two projects shares its limits — a per-project override is a follow-up if it bites).

## 3. Swimlanes

### Decisions

| # | Decision | Why |
|---|---|---|
| S1 | **A per-viewer view choice**, `Lanes: None · Epic · Assignee`, in the board toolbar beside the "Only tickets in progress" switch. Remembered per user and project in local storage, copying `preferences/workflow-collapse.ts`'s shape (user+project scope, wrapped storage access). Default **None** — nobody's board changes until they choose. | The owner's own precedent for board UI state: local, per user, not the server (`workflow-collapse.ts` docblock). |
| S2 | **Lanes sit inside each workflow group.** A lane is a row spanning that group's columns; its header shows the lane's name and card count and collapses like a workflow group. | Groups already split the board by workflow; lanes subdivide one group. |
| S3 | **Epic lanes** use the card's `epic` (`board.tsx:1590`); a card with no epic goes to a last lane, "No epic". Lanes are ordered by epic key. | |
| S4 | **Assignee lanes** use `card.assignee` (`board.tsx:1607`); "Unassigned" is the last lane. The viewer's own lane comes first. People are named as everywhere else (the evening ruling: a blank-name user shows their email). | |
| S5 | **Drag stays within a lane in v1.** Other lanes are not drop targets while dragging; dropping changes state only. | Dropping into another lane would silently change the epic or the assignee — a second write hidden in a drag. A cross-lane drop that reassigns is a follow-up if the owner wants it. |
| S6 | **Every column's collapse (styling Task 5B) applies across all lanes** of the group: collapsing Done collapses it in every lane. WIP counts (L4) stay per column, across lanes. | One column, one limit, one collapse. |
| S7 | **Empty lanes are not drawn**; a lane appears when it holds a card. | |

### Out of scope
Lanes by priority or type; lanes on the List view; saving lanes to the server.

## 4. Order and size

WIP limits first (a small domain field, a builder field, a header change and a notice); swimlanes second (a layout change inside the board group). Each is one plan of roughly 4–6 tasks, built on the release branch after the styling refresh's board tasks. Cases go in the board's test-case section with fresh ids allocated at plan time.

## 5. Open points for the owner (answered by recommendation unless the owner says otherwise)

1. **Where the limit is set** — workflow builder, shared by every project on that workflow (recommended, L1), or per project.
2. **Cross-lane drag** — v1 refuses it (S5, recommended), or a drop into another lane also reassigns / re-epics.
