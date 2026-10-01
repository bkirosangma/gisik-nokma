# MCP: workspace and project CRUD, people lookup, richer ticket listing — design

**Status:** spec for owner review. Written 2026-10-01 by the planner; design approved in chat (*"looks right"*, *"yes, include them as recommended. also project-wide tickets. tickets of just a single project."*).
**Base:** `origin/main` at `afe0507e` (= `release/2026-10-01` at cut). Citations read on that tree; the plan re-reads each.
**Target branch:** `release/2026-10-01`.
**Builds on:** the hosted MCP server (shipped 2026-10-01) — every tool here exists in BOTH doors (hosted `/mcp` and the local stdio server) through the shared tool module.

## 1. The request

Owner, 2026-10-01: *"need to enhance the mcp. need CRUD for workspaces and projects."* On the ticket filter gaps the planner found: *"yes, include them as recommended. also project-wide tickets. tickets of just a single project."*

**Today (read):** the MCP's 9 tools — reads `list_workspaces`, `list_projects`, `search_tickets`, `list_tickets`, `get_ticket`; writes `create_ticket`, `transition_ticket`, `add_comment`, `assign_ticket` (`packages/mcp-server/src/tools/read-tools.ts`, `write-tools.ts`). The domain already has `workspace.created|renamed|settings_set|archived|restored|deleted|undeleted` and `project.created|archived|restored|deleted|undeleted|member_added|member_removed` (`packages/domain/src/vocabulary.ts`). **There is no project rename/description edit** anywhere; `project.created` carries `name` + optional `description` (`packages/domain/src/events/membership.ts:89-91`). `list_tickets` takes `filterSpecSchema` (`packages/domain/src/filter-spec.ts:120-175`: assignee, collaborator, type, state, state category, priority, blocked, closed, text, due before/after, ≤10 field clauses — **one value each**), one project per call; no tool lists people and there is no "me" shortcut.

## 2. Decisions (owner rulings, 2026-10-01)

| # | Decision |
|---|---|
| M1 | **Project rename + description edit is added to the PRODUCT** (a new `project.updated` event: name and/or description; same permission as archiving a project; an Edit control on the workspace home's project card and the project page header; recorded in history) and exposed through the MCP. *"A, as recommended"* |
| M2 | **Deletes are soft only, with a name check.** `delete_*` moves the item to Deleted items (restorable for the product's 15-day window, never marked for permanent deletion — no tool can mark a purge); `delete_*` and `archive_*` refuse unless `confirm_name` equals the item's current name exactly, and the refusal states the expected name. `undelete_*` / `restore_*` bring items back. *"A, as recommended"* |
| M3 | **New tools** (writes carry `origin: 'mcp'`; every rule the screen enforces applies; each answers with the product's own refusal reason): |
|   | Workspaces — `get_workspace`; `create_workspace` (name, optional prefix; the caller becomes owner); `rename_workspace`; `archive_workspace` / `restore_workspace`; `delete_workspace` / `undelete_workspace`; `list_workspaces` gains `include: 'archived' \| 'deleted'`. |
|   | Projects — `get_project`; `create_project` (workspace, name, optional description, optional prefix); `update_project` (name and/or description, M1); `archive_project` / `restore_project`; `delete_project` / `undelete_project`; `list_projects` gains `include`. |
| M4 | **`list_members`** — the people in a workspace (name, email where the caller's normal visibility allows, role), so an assistant can resolve "Asha" to an id. It honours the access rulings already shipped: a GUEST caller sees only the people on tickets they can see (N3), never the full roster. |
| M5 | **`"me"` shortcut** — `assigneeId`/`collaboratorId` accept `"me"`, resolved to the caller server-side. |
| M6 | **Multi-value filters** — assignee, collaborator, type, state, state category and priority accept a list ("assigned to Asha or Ravi", "To do or Doing"); a single value keeps working. This is a filter-spec change shared by the product's list filters' server compiler (`apps/server/src/read/compile-filter.ts`); the product UI need not adopt it now. |
| M7 | **Two ticket-listing scopes** — `list_tickets` takes EITHER `projectId` (tickets of a single project, as today) OR `workspaceId` (every project the caller can see in that workspace, paged, same filters/grouping), never both. "My open tickets everywhere" = `workspaceId` + `assigneeId: "me"` + `closed: false`. |

## 3. Behaviour details

- **`confirm_name`** is compared exactly (case and whitespace), against the CURRENT name read at call time; a mismatch is refused with `confirm_name must be "<current name>"`. Restore/undelete tools need no confirmation.
- **Deleted/archived items** are listed only with `include`; `get_*` on a deleted item says so (and how to undelete).
- **Prefix:** optional at create; the product's existing prefix rules (format, uniqueness) apply; not editable afterwards unless the product already allows it (the plan checks).
- **Pagination** for the workspace scope reuses the project scope's cursor shape; a page never mixes in projects the caller cannot see.
- **Tool descriptions** are written for an assistant serving a non-technical person: what each does, that deletes are recoverable, and that `confirm_name` must be the exact current name.
- **Help §16** gains "What your assistant can do".

## 4. Security
Every new tool goes through the same REST routes/events and permission checks as the UI (the hosted door's in-process transport, FD-6/7 of the remote-MCP plan) — the MCP gains no authority the screen lacks. `list_members` uses the visibility rules of the shipped access follow-ups (R2/R3/N3). Each refusal path gets a case with a named mutation (delete without/wrong `confirm_name`; a member deleting a workspace they do not own; a guest calling `list_members`; `workspaceId`+`projectId` together).

## 5. Testing
Per tool: success, refusal reasons, and that the same call through the hosted door and the stdio door yields the same result (one code path). `project.updated`: domain + permission + projection + history line + the Edit UI (unit + browser 🧪). Filter-spec: single values unchanged (regression), lists compile to `IN (…)`, `"me"` resolves to the caller, workspace scope excludes invisible projects. A round trip on the dev stack through `/mcp` (create a workspace → project → rename → archive → restore → delete → undelete) with the test data removed after.

## 6. Out of scope
Permanent deletion; workspace/project member management through the MCP (beyond `list_members`); settings beyond the name (`workspace.settings_set`) unless trivially covered; adopting multi-value filters in the product UI.
