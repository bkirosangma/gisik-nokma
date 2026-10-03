# Home (Knowledge Graph spec E) — design

**Date:** 2026-10-03.

**Base:** `release/smoothness` @ `dce9ca61`.

**Target branch:** the next release branch (not cut yet).

**Status:** the owner approved the design in conversation on 2026-10-03 ("write the specs A to E"). This file is the written spec for review. The series table is in spec A.

**Mockup:** SVG mockup v4, section "Home: the new first page" (https://claude.ai/artifact/SN3vBiYHo833KNyDLHgKhB), and the same in the Sigma port.

**Owner's words:**
- "home page … accessible by clicking the Logo/Gisik Nokma on the nav bar … numbers (tickets, members, open tickets, tickets past due date, etc)".
- "yes to the logo link" (2026-10-03).

**Rulings:**
- **The brand becomes a link to `/`.** This REVERSES rule 13.1475 ("the brand is decorative"), and `/` stops redirecting to `/workspaces`.
- **The counts follow the graph's visibility filter.**
- **A number lights its items on the graph.**

**Assumptions** (correct them at review):
- "Members" counts the people of the workspace that the viewer can see in Members, guests included for owners and admins. A guest sees only the count their Members view shows.
- The workspace shown is the current one (the switcher's).

## 1. What exists today

- **Root page.** `apps/web/app/page.tsx` is `redirect('/workspaces')`.
- **Brand.** `apps/web/src/nav-brand.tsx:21`: the brand tile is `aria-hidden`, with "no link, no button, no tabindex (13.1475's standing rule, unchanged)".
- **Nav.** `apps/web/src/app-nav.tsx:201` lists Workspaces, the switcher, My work, Members, Settings, Notes, Inbox, Help and Account.
- **Due rules.** `apps/server/src/routes/attention.ts` `classifyDue` (:321): *overdue* means the due day is before today in IST (today itself is not overdue); *due soon* means today through today + `dueSoonDays`; both apply to open tickets only. `dueSoonDays` is a workspace setting (`packages/domain/src/events/workspace-settings.ts`, default 7).
- **Per-project counts.** `read/workspace-counts.ts:68` `visibleProjectCounts` gives these, and returns null for guests.

## 2. The page

### 2.1 Route and brand

**`/` renders Home:**
- signed out → the existing sign-in redirect;
- no workspace yet → an empty state, "Create or join a workspace", linking to `/workspaces`.

**The brand** is a real link to `/`, labelled "Gisik Nokma, Home", with focus ring and keyboard support.
- **Case 13.1475** is marked 🚫 with the reason "reversed by the owner 2026-10-03 (Knowledge Graph spec E)". It is not renumbered. A new case pins the link.
- **`/workspaces`** stays the list of workspaces, and the nav keeps "Workspaces".

### 2.2 Layout

**Header:** the workspace name, and **"Start from: This workspace | Me"**:
- **This workspace:** the graph is centred on the workspace node.
- **Me:** the graph is centred on the viewer's own person node (their assigned and mentioned items).

**Six numbers** (buttons, `aria-pressed`) in one row on desktop, or a 3×2 grid on a phone:

| Number | Counts (visible to the viewer, in this workspace, not in the trash) |
|---|---|
| Tickets | all tickets |
| Open | tickets whose state is not in the done category |
| Past due | open tickets overdue by `classifyDue` |
| Due in N days | open tickets due soon by `classifyDue` (N = `dueSoonDays`; the label reads "Due in 3 days", or "Due today" when N = 0) |
| Members | people in the workspace, by the assumption above |
| Notes | notes |

- "Past due" uses the warning style when it is above 0.

**The Knowledge Graph** (spec C's component, Home configuration):
- the workspace → projects → items, with 2 clear hops on desktop and 1 on a phone;
- scope pickers as in C;
- the semantic-layer switch as in C §6.4.

### 2.3 A number lights its items

- **Clicking a number** highlights its items on the graph. Everything else dims to 25%, and edges to 12%. A note under the numbers says "3 past due, lit up on the graph".
- **Items in the fog** are not lit. The note adds "N more are further out" with a control that raises the hop.
- **Clicking the same number again** clears the highlight. Clicking another switches to it. Esc clears.
- **Members** lights people nodes. **Notes** lights note nodes.

### 2.4 Endpoint

`GET /v1/workspaces/:id/home` returns `{ counts:{tickets,open,pastDue,dueSoon,members,notes}, dueSoonDays, ids:{…} }`:
- the counts and the ids come from the same query, using the graph's filters (`visibleTicketsWhere`, `visibleNotesWhere`, the Members rule);
- ids are capped at 2,000 per number, and past that the note says how many are not on the graph;
- budget: p95 ≤ 120 ms on a prod-sized copy, measured in the plan's first task.

The same counts are offered to MCP as `get_workspace` → `home` (read only).

## 3. States

- **Loading:** number skeletons, plus spec C's ring skeleton, with no layout shift.
- **Errors:** a failed count shows "–" with a Retry. The graph loads on its own.
- **Zero:** shows "0", and its button is disabled with nothing to light.

## 4. Testing and proof

**Case block:** 27.600–27.659.

1. **Each count's definition,** on a fixture that crosses every edge:
   - overdue today vs yesterday in IST (today is not overdue);
   - due-soon at N and N+1 days;
   - a done ticket excluded;
   - a trashed ticket excluded.
2. **Visibility.** A hidden ticket is absent from both the counts and the ids. The control is a viewer with access.
3. **Brand.** The link, its focus, and its keyboard behaviour. 13.1475 is 🚫 with its reason.
4. **`/` signed in, signed out, and with no workspace.**
5. **Lighting.** Light, clear, switch and Esc. Fog items are counted in "further out".
6. **Phone:** the 3×2 grid at 390 px wide, and one clear hop.

## 5. Files (expected)

- `apps/web/app/page.tsx` (Home), `apps/web/src/nav-brand.tsx`, `apps/web/src/home/*` (new).
- `apps/server/src/routes/home.ts` (new).
- `packages/mcp-server/src/tools/*` (`get_workspace` gains `home`).
- `test-cases/13-*.md` (13.1475 🚫), `Features.md` §24, `test-cases/27-knowledge-graph.md`.

## 6. Out of scope

- Charts and trends.
- Counts across all workspaces.
- Customising which numbers show.
