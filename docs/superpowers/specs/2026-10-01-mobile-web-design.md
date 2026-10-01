# The web app on phones — design

**Status:** spec for owner review. Written 2026-10-01 by the planner from a brainstorm with the owner (visual companion), all decisions approved in chat.
**Base:** `origin/release/mobile` = main `afe0507e`. Citations read on that tree; the plan re-reads each.
**Target branch:** `release/mobile` — a SECOND live release branch by the owner's word (*"not in the current release. create a new release/mobile branch"*); it ships on its own owner word.
**Scope note:** this is the WEB app at phone width. The React Native app (`apps/mobile`, the styling refresh's B-D1 deferral) is not in scope.

## 1. The request

The owner, 2026-10-01, with a screenshot of `/workspaces` on a Samsung Galaxy Z Flip 7: *"the Ui is very bad. Lets fix this next."*

**What the screenshot shows (~412px CSS width):** the top bar's hint "No workspace selected — pick one to reach its board, members and settings." squeezed into a narrow column eight lines tall under the nav; a dark blotch behind "Workspaces" (the raised current-page pill that does not fit); a three-line display title "Workspaces — Banchan Kiro A Sangma"; the actual content only after scrolling past all of it. The product has some narrow-width handling (a few cases at 390px; the nav collapses to "Menu" at tablet widths in `apps/web/src/app-nav.tsx`; ~24 `@media (max-width…)` rules across `apps/web/app/globals.css` and `packages/ui/src/ui.css`) but no phone pass has ever been done.

**Outcome:** every screen works and looks intentional at phone width — not a squeezed desktop page — for members on phones, including foldables.

## 2. Decisions (owner, 2026-10-01)

| # | Decision | Ruling |
|---|---|---|
| P1 | **Scope: the whole app at phone width**, shell first (fixes the screenshot on every page), then screen by screen. | "A, as recommended" |
| P2 | **Navigation: a bottom tab bar** with a slim top bar (logo, workspace/project switcher, avatar). | "A" (visual companion) |
| P3 | **The bottom bar is customizable:** four slots the person chooses + **More** (always last, so nothing is unreachable). Default Board · My work · Notes · Inbox · More. Edited from More → "Edit bottom bar": drag to reorder, remove, add from Board, My work, Notes, Inbox, List, Calendar, Timeline, Backlog, Members; "Reset to default". | "A, but with a customizable bottom bar" |
| P4 | **The bar choice is remembered per device** (like Appearance: local storage, keyed by user, never the server). | "A, as recommended" |
| P5 | **Board on a phone: one column at a time** — a segmented header with counts picks the column; swipe left/right between columns. | "A" |
| P6 | **Moving a card on a phone: one "Move" button** opening a sheet of EVERY legal destination for that card (a workflow can allow several — the owner: *"the workflow can allow a choice to move to 2 different states"*), each labelled with its column and category tone, gated moves marked ("needs a comment"); no direction-guessing arrows on phones. Browsers have no touch drag-and-drop, so this is THE phone move. Moves stay optimistic and animated (the shipped behaviour). | owner, in discussion |
| P7 | **Desktop also gets "Move to…"** — a small menu beside each card's ‹ › arrows listing every legal destination, so a branching workflow is never one-way on any screen; the arrows stay as the fast path (they reach only the nearest legal column per direction — `board.tsx` ~1968). | "add the desktop Move to… menu too" |
| P8 | **Widths checked:** Android **360**, **412** (Flip 7 main screen); iPhone **375** (SE / mini), **390**, **393** (14–16), **402** (16 Pro), **430** (Plus / Pro Max), **440** (16 Pro Max); plus the Flip 7 cover screen if usable. | "check for iphone widths as well" |

## 3. Design

### 3.1 Shell (≤ 600px wide)
- **Top bar:** logo, the workspace/project **switcher** (one control; with no workspace chosen it reads "Choose a workspace ▾" — the hint sentence is removed at this width), and the avatar (opens Account). No current-page pill in the top bar.
- **Bottom bar** (P2–P4): 4 chosen destinations + More; current destination marked by tone AND an indicator (never colour alone); each item ≥44px; sits above the safe-area inset (`env(safe-area-inset-bottom)`); hidden while the on-screen keyboard is up so it never covers a field.
- **More:** a sheet listing every destination not in the bar, plus Settings, Account, Help, and "Edit bottom bar".
- **Page titles:** one line, ordinary heading size (no display type) at phone width; long names truncate with the full text available to assistive tech.
- Above 600px the current desktop/tablet shell is unchanged.

### 3.2 Board (phone)
- P5 one-column view with the segmented column picker (counts; collapsed columns still listed; horizontal swipe between columns with a snap; the picker follows the swipe).
- Cards keep every field. P6 "Move" sheet replaces the arrows on phones; the destinations come from the same decision the arrows and drop use (`moveOutcome` / the legal transitions), never a second rule.
- P7 desktop "Move to…" menu beside the arrows (same destination list).
- The workflow-group header and its collapse stay; WIP/swimlanes do not exist yet (separate spec).

### 3.3 Ticket sheet and dialogs (phone)
- The ticket sheet opens **full screen** with a sticky header (back, title, Move); fields in one column; Comments / History / Attachments as tabs.
- Dialogs become **bottom sheets** (full width, actions within thumb reach); none clips at 360px.

### 3.4 Every other screen
One rule set applied per screen (List, Calendar, Timeline, Backlog, Notes, My work, Inbox, Members, Account, Settings, the workflow editor, sign-in/invite/MCP connect, Help, legal): single column; tables become stacked rows; toolbars wrap or move behind a "⋯" overflow; ≥44px targets; **no horizontal page scroll** except deliberately scrolling regions (the calendar grid, the timeline, the workflow canvas, code blocks); the workflow editor's canvas pans with its States/Transitions panels as a bottom sheet; the notes tree becomes a panel opened from the header (as it already is below 60rem).

## 4. Testing
- **Per screen, at every P8 width, in hig / minimal / neo × light / dark (browser 🧪):** no horizontal page overflow (`document.documentElement.scrollWidth <= innerWidth`), no clipped dialog, ≥44px targets, the bottom bar present and above the safe area.
- **Unit:** the bottom bar's add / remove / reorder / reset, the 4-slot limit, More always last, per-device + per-user storage with every access wrapped (like `workflow-collapse.ts`); the Move sheet lists exactly the legal destinations (a two-way branch shows both; a gated one is marked; none → disabled with the reason); the desktop Move-to menu uses the same list; the switcher's "Choose a workspace" state.
- A real-device check on the owner's Flip 7 and an iPhone if available (owner's call at release).

## 5. Out of scope
The React Native app (`apps/mobile`); touch drag-and-drop on the board (browsers do not support it; a pointer-events drag is a separate plan); a server-synced bottom bar (P4 = per device); new features beyond layout (WIP limits, swimlanes).
