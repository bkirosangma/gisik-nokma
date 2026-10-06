# My work, global and filtered: design

**Status:** draft for owner review, 2026-10-05.
**Release:** `release/my-work-global`, cut from `main` at `66c46fdd`. It is a quick release, and the owner has put it first.

## What the owner asked (2026-10-05, in chat)

1. **"Needs your attention" shows only my tasks:** the tickets I created plus the tickets assigned to me.
2. **A filter with these options:**
   - Created by me;
   - Assigned to me;
   - **All**, which means created by me OR assigned to me (option (a); the owner chose it).
3. **Owners and admins can widen it.** A user who owns or administers a workspace, or administers a project, can also include those tickets. The filter is a **multiselect**: one option per role (option (i); the owner chose it).
4. **My work is global:** one page across every workspace the user belongs to, not scoped to one workspace or project.
5. **Grouping:** tickets are grouped by workspace, then project. Grouping is **optional**; the page can also be flat.

## What happens today (read on `main`)

- **The attention strip is wide.** `GET /v1/workspaces/:ws/attention` (`apps/server/src/routes/attention.ts`) puts EVERY ticket the viewer can see into its blocked, stale and overdue/due-soon buckets: `visibleTicketsWhere` plus `t.closed_at IS NULL`. Creator and assignee play no part. For an owner, `visibleTicketsWhere` compiles to `TRUE`, so the strip covers the whole workspace.
- **My work is workspace-scoped.** The page is `apps/web/app/w/[workspaceId]/my-work/page.tsx`. Its list comes from `GET /v1/me/work?workspaceId=` (`routes/my-work.ts`; an absent `workspaceId` is a 400, case 7.112), and its strip from the attention route.
- **Tickets do not record who created them.** `proj_tickets` has no creator column. The creator is the `actor_id` of the ticket's `ticket.created` event in `events`.
- **The strip is online-only.** The replica answers `getAttention` with a `ReplicaGapError`.
- **Mobile has no My work screen.** The MCP server exposes `my_work` and `get_attention` (`packages/mcp-server/src/tools/discovery-tools.ts`).

## Design

### D1. The ticket creator becomes a projected column

- **Migration `1791400000000_proj-tickets-created-by.sql`:**
  - `ALTER TABLE proj_tickets ADD COLUMN created_by text NULL`;
  - a backfill from `events` (`type = 'ticket.created'`, `entity_id = ticket_id`, `actor_id`);
  - an index on `(workspace_id, created_by)`.
- **The projection** writes `created_by` on `ticket.created`. A projection rebuild reproduces it.
- **The prefix is pinned.** It is above `main`'s newest (`1791300000000`) and below every migration still pending on `release/knowledge-graph` and `release/workflow-graph` (the lowest is `1791500000000`), so those releases still deploy in order after this one.
- A ticket created by MCP or by a seed counts for whoever is that event's actor.

### D2. One "show" filter, server-side

- `show` is a set drawn from `created`, `assigned`, `ws-admin` and `project-admin`. A ticket qualifies if it matches ANY selected member:
  - `created` → `t.created_by = viewer`;
  - `assigned` → `t.assignee_id = viewer`;
  - `ws-admin` → the ticket's workspace is one where the viewer's role is `owner` or `admin`;
  - `project-admin` → the ticket's project is one where the viewer has `projectAdmin`.
- `visibleTicketsWhere` and `t.closed_at IS NULL` still apply on top. The filter only narrows; it never shows a ticket the viewer cannot see.
- **Default:** `created,assigned` (the owner's "All").
- **Refused selections:** an empty set is a 400. So is a role member the viewer does not hold anywhere, because the UI never offers it.

### D3. Global endpoints

- **`GET /v1/me/attention?show=…`** (new). It works over every workspace the viewer belongs to, and reuses the per-workspace query with each workspace's OWN thresholds (`getWorkspaceSettings`: `staleDays`, `dueSoonDays`). Each item carries `workspaceId`, `workspaceName`, `projectId` and `projectName`, and the bucket order is unchanged. The per-workspace route stays as it is for any existing caller.
- **`GET /v1/me/work`:** `workspaceId` becomes OPTIONAL. If it is absent, the answer covers all of the viewer's workspaces, with the same per-item workspace and project fields. A repeated or empty `workspaceId` is still a 400. Case 7.112's absent-is-400 leg is re-pinned to absent-is-global.
- **`GET /v1/me/roles` (or a field on an existing me-read):** for each workspace, the viewer's role and whether they administer any project. The UI uses it to decide which filter options to show. The plan picks whichever existing read already carries this, before adding a route.

### D4. The global page

- **The route is `/my-work`,** global, beside `/inbox` and `/notes`.
  - `/w/:ws/my-work` redirects to `/my-work`, keeping `?ticket=`; the sheet needs the workspace, so a deep link becomes `/my-work?ticket=<id>&ws=<ws>`.
  - The links that point at the old route move: the app nav, the "Open My work" link in `inbox/page.tsx`, and the invite redirect.
- **"Show" control** above "Needs your attention": a multiselect chip group.
  - The options are "Created by me" and "Assigned to me", plus "Workspaces I own or run" and "Projects I run", each shown only when the viewer holds that role somewhere.
  - At least one option stays selected: the last chip cannot be cleared.
  - The filter applies to the attention section. The assigned list below it remains "assigned to me" by definition.
- **"Group" control:** "By workspace and project" (the default) or "Flat".
  - Grouped: a workspace heading, then a project heading, then that project's tickets. Inside each group, attention keeps its bucket order (overdue first). Groups are ordered by workspace name, then project name.
  - Flat: today's single list, with each card showing its workspace and project as a small label.
  - The grouping applies to both sections.
- **Remembered per user:** both choices are saved through the existing preferences read and write (`getPreferences` / `putPreferences`), so they follow the user across devices. The plan names the keys.
- **Empty state:** "Nothing needs your attention in <filter summary>", with the chip group still live.

### D5. MCP

- `get_attention` gains an optional `show` (same values and default as D2), and `workspaceId` becomes optional. Absent means global, the same as the page.
- `my_work` gains an optional `workspaceId`, which is also global when absent.
- **This is a behaviour change for agents:** the default narrows to created-or-assigned, as on the page. The tool descriptions say so.

### D6. Out of scope

- Mobile: it has no My work screen today.
- Offline attention: still online-only.
- A plain per-workspace filter on the global page: possible later.
- Notifications: unchanged.

## Testing (the plan pins case ids and Kills)

- **Server:**
  - each `show` member alone, and the default union;
  - `ws-admin` and `project-admin` against members without those roles (refused);
  - visibility still bounds every arm, including a `ws-admin` arm on a workspace whose role is not the viewer's;
  - per-workspace thresholds (two workspaces, different `staleDays`, one ticket each at the boundary);
  - the global `/v1/me/work`;
  - the migration backfill (a ticket created before the migration has `created_by`);
  - the projection on a new ticket.
- **Web:**
  - the chips (role-gated options, the last chip cannot be cleared, the choice persists);
  - grouped vs flat (headings, order, bucket order inside a group);
  - the redirect from the old route, including `?ticket=`;
  - the deep-link sheet opening with `ws`.
- **MCP:** `show` and global defaults, plus the description text.
- **Browser pass:** 360 / 768 / desktop, with the longest workspace and project names.

## Risks

- **Size of the global strip for an owner who selects "Workspaces I own or run".** It assembles cards for every visible ticket in those workspaces. That is the same cost as today's per-workspace strip, summed. The plan measures it on the largest seed, and on a gap caps per workspace with a "show more" link.
- **The redirect breaks bookmarks only if it is wrong.** The test above pins it.
