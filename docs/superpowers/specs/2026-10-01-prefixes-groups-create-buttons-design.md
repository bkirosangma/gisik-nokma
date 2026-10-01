# Editable prefixes, project groups, and the Create buttons — design

**Status:** owner-approved design (brainstorm 2026-10-01 evening). Ships as **its own release**, on a release branch cut from `main` (owner: *"this current changes will not go in the mobile release. itll go as its own release."*). Base: `main` `e0dd68d1`, which already carries MCP CRUD (`project.updated`, the project Edit control).

## 1. What the owner asked for

1. Workspace and project **prefixes can be changed**.
2. **Project groups**, four levels deep, with the workspace home able to separate projects into those groups (a toggle).
3. The workspace home's **My Work / Members / Ticket types / Workflows row moves to the top**.
4. **Create workspace / Create project / Create ticket** are buttons, top right, that open their forms like ticket creation does. Each follows the button rule: **verb + object, one icon, one primary per screen** (owner: *"this applies to workspace, project and ticket creation. all 3."*). "New ticket" becomes **"Create ticket"**. This supersedes the 2026-09-29 ruling D10 ("keep new ticket").

## 2. Rulings (owner, 2026-10-01)

| # | Ruling |
|---|---|
| R1 | **A prefix change re-keys every ticket, and the old keys keep resolving** (option A): `CCSO-12` → `CCSH-12`, and `CCSO-12` still finds the ticket in search, links and ticket references. |
| R2 | **A retired prefix stays reserved to the project (or workspace) that used it.** Another project, new or changing, is refused it, with a plain reason naming its holder and the date. The original holder may take it back. Derived (automatic) prefixes also skip reserved ones. There is no "free this prefix" action. |
| R3 | **Four group levels, L1 (top) to L4.** A group belongs to one level for good: an L1 is only ever an L1. |
| R4 | **A lower group belongs to exactly one parent** (an L2 "North" under "Retail" and another under "Wholesale" are two groups). |
| R5 | **The workspace has a Groups settings page that shows the groups as a tree**, laid out left to right as in the owner's sketch: L1 boxes on the left, children to the right, joined by connector lines. Each box has a **colour tag** (the strip on its left edge) that shows the group's LEVEL: one colour per level, L1 to L4, the same for every group at that level (owner, 2026-10-01: *"it only indicates the levels of the group. not different colour for different groups."*) and a **⊕** that adds a child at the next level (none on L4). |
| R6 | **Groups can also be created while assigning them** (option A): the project form's group fields are type-aheads. Typing shows matching groups at that level **under the parent picked above**. An exact case-insensitive match auto-selects. With no match selected, saving creates the group under that parent. |
| R7 | **Defaults accepted:** groups belong to one workspace; levels fill from the top, with no skipping (a project picks one group and its chain follows); projects with no group appear last under **Ungrouped** in grouped view; the grouped/plain toggle is remembered per person on each device. |

## 3. How it's stored

Everything is a ledger event (the product's one source of truth; projections are pure functions of the ledger, which `tools/verify-projections.ts` checks). No out-of-ledger table.

### 3.1 Prefixes
- **Workspace:** a new event `workspace.prefix_changed { prefix }`. `workspace.renamed` stays name-only.
- **Project:** `project.updated` gains an optional `prefix`.
- **Amend both "IMMUTABLE after creation" docblocks** (`packages/domain/src/events/membership.ts:55` for the workspace, `:116` for the project): a prefix can now change, every key re-reads, and the old prefixes stay reserved and resolvable (R1, R2). This reverses MCP CRUD's FD3 deliberately; its spec and plan get a dated note pointing here.
- **History:** the read side keeps, per workspace and per project, the current prefix plus every former one, with the date it stopped.
- **Reservation (R2), enforced at the door (the write route):**
  - A project prefix is refused if any OTHER project in the workspace holds it, now or formerly. It's allowed if this project held it before.
  - A workspace prefix only needs to differ from that workspace's own history to stay unambiguous (keys are always resolved inside one workspace); reusing a former one of its own is allowed.
  - The refusal text names the holder and the date, e.g. *"SO was Shop operations' prefix until 1 Oct. Its old ticket keys still point there, so it can't be reused."*
- **Derived prefixes** (`packages/domain/src/prefix.ts`: pass 2 and `collisionCandidates`, `:126`) also skip every reserved prefix, so an automatic prefix can never land on a retired one.
- **Old keys resolve (R1):** wherever a key is turned back into a ticket (search, ticket links/URLs, ticket-reference lookup), try the current prefixes first, then the former ones. Within a workspace, R2 makes this unambiguous.
- **Baked key text refreshes:** any projection that stores a key's TEXT (e.g. the note-search index, `apps/server/src/projections/note-search.ts`) re-derives it when a prefix changes. A note's ticket chip stores `ticketId` plus a key/title snapshot (`packages/editor/src/extensions/ticket-ref.ts:41`): the chip shows the CURRENT key, not the snapshot. The plan pins exactly which readers bake key text.

### 3.2 Groups
- **Events:**
  - `group.created { groupId, parentId | null, level 1–4, name }`
  - `group.renamed { name }`
  - `group.reordered` (a rank among siblings, the same rank scheme the product already uses)
  - `group.deleted`
- **Rules:**
  - `level` equals the parent's level + 1 (L1 has no parent), and it never changes (R3, R4).
  - Names are unique among siblings, ignoring case.
  - A group can be deleted only when no project and no child group uses it; otherwise the request is refused with a plain reason.
- **Colour = level, not group (R5):** four fixed level colours (L1–L4) as design tokens, each with contrast checked in both themes and all three styles. No colour is stored on a group, there is no colour picker, and there is no recolour event. Colour is never the only signal: the level is also stated in words (an accessible label such as "Level 2 group"), and the name is always shown.
- **A project's group:** `project.updated` gains an optional `groupId` (null clears it). A project points at ONE group at any level; its L1…Ln chain is read from the tree (R7, no skipped levels).
- **Inline creation (R6)** sends `group.created` and `project.updated` together as one batch, so a failed save creates no orphan group.

## 4. Screens

- **Workspace home**, top to bottom:
  - The header.
  - **The My Work / Members / Ticket types / Workflows row**, moved to the top.
  - **Projects**, with a **Grouped / Plain** toggle and **Create project** (the one primary, with icon) at the top right.
  - In grouped view, nested L1 → L4 sections, each headed by its level's colour strip and its name; **Ungrouped** comes last. The toggle is remembered per person on each device (wrapped storage, like the board's collapsed columns).
- **Create project** opens a panel the same way Create ticket does: name, description, prefix, and the **group picker**, four type-ahead fields left to right (R6). A lower field is disabled until the one above it has a group.
- **Project Edit** (on the card and in the header, from MCP CRUD) gains **prefix** and **group**. **Workspace edit** gains **prefix**.
- **A prefix change is confirmed in plain words** before saving, for example: *"Tickets will be renumbered CCSH-… Old CCSO- keys still work."*
- **`/workspaces`:** **Create workspace** (the one primary, with icon) at the top right opens the form. The always-visible "New workspace" block goes.
- **Project page:** **Create ticket**, with an icon, replaces "New ticket". It stays the one primary.
- **Settings → Groups** (new page beside Ticket types and Workflows):
  - The left-to-right tree from the sketch: each box has its level's colour strip and its name, and a ⊕ adds a child (none on L4).
  - **Add group** creates an L1.
  - Click a name to rename it; drag to reorder siblings.
  - **Delete** shows only on a group nothing uses.
  - Owner and admin can change it; everyone else can only view it.
  - At phone width (≤ 40 rem), the tree renders as an indented list.
- **The button rule** applies to every new button: verb + object, one icon, ≥ 44 px targets, one primary per screen.

## 5. Who can do what

| Action | Who |
|---|---|
| Change a workspace's prefix | Workspace owner or admin |
| Change a project's prefix or group | Whoever can already edit that project (the MCP CRUD Edit rule) |
| Create a group while editing a project | The same person, under the chosen parent |
| Manage groups on Settings → Groups | Workspace owner or admin |

## 6. Testing
- Events and the door: RED first, a control in the same `it`, a named mutation per case (the project's standing bar).
- Reservation, from both directions:
  - a refused reuse names its holder;
  - the original holder may take its prefix back;
  - a derived prefix skips a reserved one.
- Old-key resolution: search, link and ticket-ref each find a ticket by a former key, and the ticket's current key is shown.
- Group tree invariants: level = parent + 1; siblings unique ignoring case; delete refused while used; inline create is atomic.
- Projections: `verify-projections` stays green after prefix and group events.
- UI cases for each screen in all three styles. A browser pass covers the tree page, the grouped home and the three Create buttons.
- `Features.md` and `test-cases/` are updated in the same change sets.

## 7. Out of scope (this release)
- MCP tools for prefixes and groups (they can follow later).
- Freeing a reserved prefix.
- Filtering or grouping boards and lists by group.
- Moving a group to another parent or level (R3/R4 fix a group's level; a move would be a new feature).
