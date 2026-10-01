# Editable prefixes, project groups and the Create buttons: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. In this repo, execution is by the orchestrator's lanes (controller → dispatcher → lanes → reviewer → gate). **HELD: do not dispatch until the owner says so** (owner, 2026-10-01: *"write the plan, but do not dispatch yet"*).

> **COMBINED RELEASE (owner, 2026-10-02 ~01:30: *"we can do combined release"*):** this plan and its sibling (`2026-10-01-prefixes-groups-create-buttons.md` / `2026-10-02-ux-fixes.md`) ship together on ONE branch, **`release/prefix-groups-ux`**, cut from `main` `9895e404` (the mobile release, #880, which carries `founding_name`). Every "release branch" named below means that branch. The lane order and the overlap rules between the two plans are in `gisik-nokma-lanes/CONTROLLER-CARD-2026-10-02-prefix-groups-ux.md`. The preconditions about earlier releases are met. **DISPATCH AUTHORIZED** for overnight autonomous execution; the merge to `main` is NOT authorized.

**Goal:** Workspace and project prefixes can change (every key re-reads; former keys stay findable and reserved). Projects can be filed into a four-level group tree, managed on Settings → Groups and assignable inline. The workspace home is reordered with a grouped view. Create workspace / Create project / Create ticket become consistent primary icon buttons.

**Architecture:** Everything is a ledger event, with projections as pure functions of the ledger. Prefix history lives in a new projection table, and so does the group tree. Key-to-ticket lookup is NEW (FD1): search recognises a key-shaped query and resolves it through current and former prefixes. The UI reuses the existing Dialog, Button, Select and preference-store patterns.

**Tech stack:** TypeScript monorepo (pnpm + turbo). `packages/domain` (zod event schemas, `prefix.ts`), `apps/server` (Fastify, Postgres, projections, permission door), `packages/app-core` / `packages/ui` / `apps/web` (React, Next 15), vitest, Node 22.

**Spec:** `docs/superpowers/specs/2026-10-01-prefixes-groups-create-buttons-design.md` (owner-approved; R1–R7). The FD corrections below override the spec where they differ.

## Preconditions (before Task 1 starts)
- **P1: cut the release branch from `main` AFTER the mobile release has merged to `main`.** The mobile release carries the derived-prefix fix (`founding_name`, migration `1791000000000`, `BRIEF-mobile-merge-main-and-prefix-fix-2026-10-01.md`). This plan builds on it: derivation reads `proj_projects.founding_name`. Branch name: `release/prefix-groups`. Migrations here start at `1791100000000`.
- **P2: this spec and plan land into `release/prefix-groups` as its first PR.**

## Global constraints
- **Release:** a separate release branch `release/prefix-groups`. Every task branch is cut from it, and PRs use `--base release/prefix-groups`. Never `main`, never `release/mobile`.
- **Events only:** no out-of-ledger state. Every new `proj_` table is listed in its projection's `tables`, registered in `apps/server/src/projections/index.ts`, and emptied by `reset`, so `apps/server/src/tools/verify-projections.ts` checks it.
- **Prefix format:** unchanged, `prefixSchema` (`/^[A-Z]{1,3}$/`, `packages/domain/src/prefix.ts:64`).
- **Group levels:** 1–4; `level = parent.level + 1`; L1 has `parentId: null`; a group's level and parent never change.
- **Group names:** `displayName` rules (as project names); unique among siblings, ignoring case.
- **Level colours:** four design tokens, one per level, the same for every group at that level (R5, owner: *"it only indicates the levels of the group"*). Contrast: the strip ≥ 3:1 against its surface in all 3 styles × 2 themes. Colour is never alone: every group shows its name, and an accessible "Level N group" label.
- **Buttons:** verb + object, one icon (10px from the label), 48px primary, ≥ 44px targets, one primary per screen. The labels are exactly **"Create workspace"**, **"Create project"**, **"Create ticket"**.
- **Permissions:** every prefix and group event is **workspace owner or admin**; `project.updated` is already in `ADMIN_ONLY_TYPES` (FD4).
- **Tests:** RED first; a control in the same `it`; a named mutation per case; case ids in test names; `Features.md` (new **`## 19. Prefixes, project groups and Create buttons`**) and `test-cases/22-prefixes-and-groups.md` (new) in the same commit as the code.
- **Runs:** Node 22 (`PATH=$HOME/.nvm/versions/node/v22.22.2/bin:$PATH`). Build before suites. Never pipe a test or build run into `head`. Lanes run only their affected test files + typecheck + catalogue checks; whole suites are the gate's job.
- **UI work:** invoke `ui-ux-pro-max` (and `frontend-design`, if the session has it) before touching CSS.

## Corrections to the spec (FD, read on `main` `e0dd68d1`)
- **FD1: nothing turns a key back into a ticket today.** Search does not index keys (`apps/server/src/routes/search.ts` `readSearch` matches `proj_search.tsv` over title/description/comments). Links use `ticketId` (`apps/web/src/ticket-location.ts:67`). So R1's "old keys keep resolving" is delivered by a NEW key lookup in search (Task 4): a key-shaped query resolves through current AND former prefixes, and MCP `search_tickets` inherits it.
- **FD2: note chips keep their inserted key text, by design** (`packages/editor/src/extensions/ticket-ref.ts:51-55`). After a prefix change, old chips show the old key, still link by `ticketId` to the right ticket, and the old key still finds it in search (FD1). The spec's "the chip shows the CURRENT key" is withdrawn: the snapshot design stays, and offline has no live key anyway (`replica-data-source.ts` answers `key: null`).
- **FD3: an ingest batch is not atomic.** Each event commits on its own (`apps/server/src/ingest/ingest-service.ts:54-58`). Inline group creation (R6) therefore sends `[group.created, project.updated]`, with the client pre-checking the name against the loaded tree and the door re-checking. A `project.updated` refused after its `group.created` committed leaves an unused group, which is visible and deletable on Settings → Groups. That's accepted, and Task 9 names it.
- **FD4: `project.updated` is owner/admin only** (`apps/server/src/permissions/check-permission.ts:384`, `ADMIN_ONLY_TYPES`). Every row of the spec's §5 table therefore reads "workspace owner or admin".
- **FD5: `projectUpdatedPayload`'s `.refine` must widen** (`packages/domain/src/events/membership.ts:250-256`): a prefix-only or group-only update is valid.
- **FD6: the workspace prefix has no projection.** It's read from the ledger by `workspaceIdentityFromLedger` (`apps/server/src/workspaces/workspace-name.ts:98-150`). `workspace.prefix_changed` is read there too, and the function returns the former prefixes as well.
- **FD7: `proj_note_search.ticket_text` bakes key text** (`apps/server/src/projections/note-search.ts:180-212`) and re-indexes only on note and ticket-title events. Task 5 re-indexes the affected notes on `workspace.prefix_changed` and on `project.updated` with a prefix, or verify-projections drifts.
- **FD8: no Plus icon exists.** Icons are hand-written SVG components in `packages/ui` (`select-icons.tsx`, exported one by one from `packages/ui/src/index.ts`). Task 8 adds `PlusIcon` in that style. There's no icon dependency.
- **FD9: "New ticket" is pinned** by tests that press it by name, by the dialog title (`packages/app-core/src/views/new-ticket-dialog.tsx:911`, `title="New ticket"`) and by the help corpus. That's why D10 kept it. Task 8 renames all three, and amends `pnpm check:help`'s quoted strings and the manual.
- **FD10: the Settings shell is `apps/web/app/settings/page.tsx`** (tabs `ticket-types | workflows | workspace`, l.14-18, sidebar l.182). Groups is a fourth tab there, not a new `/w/[id]/settings/groups` route.
- **FD11: `Select` has no "create new" path** (`packages/ui/src/select/select.tsx`). The group picker (Task 9) is a new `GroupPicker` built on the same `@react-aria/combobox` hooks.


## Audit items absorbed (owner, 2026-10-02: "your recommendation for the rest")
The UI/UX audit (`gisik-nokma-lanes/audit-2026-10-01/AUDIT-REPORT.md`) found three defects on screens this plan rebuilds anyway, so they're fixed here, not in the later UX-fixes release:
- **WS-03 → Task 7.** A project card shows only Archive and Delete…, with no cue that the card opens the project. Add a visible "Open" affordance (a chevron on the card's title row, with the whole card the link target as today), and move Archive and Delete… into a ⋯ overflow menu on the card. Case **22.147**: the card exposes one link named "Open <project>" and an overflow button named "More actions for <project>". Control: Archive and Delete are reachable in the menu. Mutation: actions left inline.
- **BRD-19 → Task 8.** One action, five names (New ticket / Add a ticket / Create a ticket / Create). Every create-ticket entry point and the dialog's submit say **"Create ticket"**; the empty-column affordance says "Create ticket" too. Case **22.155**: a grep-style test over the app-core and web sources finds no "Add a ticket" / "New ticket" / bare "Create" submit in the create-ticket flow. Control: "Create ticket" is present at each entry point.
- **Phone page header on the workspace home → Task 7.** At ≤40rem the title takes one line; the Grouped/Plain toggle and Create project sit in one row under it; the nav cards (moved to the top) are a horizontally scrollable row of compact chips, not four stacked cards, so projects stay on the first screen. The audit's WS notes found four stacked cards push projects off the first screen at 360. Case **22.148**: at ≤40rem the section links are one scrollable row (`overflow-x: auto`, `flex-wrap: nowrap`). Control: above 40rem they are the card grid.

## Review focus
1. **A reserved prefix entered by the project that held it** must be ALLOWED: a project going `SO` → `SH` → `SO` is legal (R2). Task 3, case 22.044.
2. **A key typed in lower case or with stray spaces** (`ccso-12`, ` CCSO-12 `) must still find the ticket. Task 4, case 22.064.
3. **Deleting a group that a project uses** must be refused with a reason, and so must deleting a group with children; deleting a leaf nobody uses succeeds. Task 6, cases 22.096–22.098.
4. **Two people inline-creating the same group name under one parent** at once: the second gets the existing group (the door refuses a sibling duplicate; the client re-reads and selects). Task 9 (case 22.165) and Task 6 (case 22.094).
5. **A grouped view with a group that has no projects** shows no empty section. "Ungrouped" appears only when ungrouped projects exist. Task 7, case 22.146.

## File structure
| Path | Responsibility | Task |
|---|---|---|
| `packages/domain/src/events/membership.ts` | `workspacePrefixChangedPayload`; `projectUpdatedPayload` + `prefix`, `groupId`; amended docblocks | 1 |
| `packages/domain/src/events/groups.ts` (new) | `groupCreated/Renamed/Reordered/DeletedPayload` | 6 |
| `packages/domain/src/vocabulary.ts` | registrations | 1, 6 |
| `packages/domain/src/prefix.ts` | `resolveProjectPrefixes(claims, reserved?)` skips reserved; `parseTicketKey` | 2, 4 |
| `apps/server/migrations/1791100000000_prefix-history.sql` | `proj_project_prefixes` | 2 |
| `apps/server/migrations/1791200000000_groups.sql` | `proj_groups`; `proj_projects.group_id` | 6 |
| `apps/server/src/projections/proj-projects.ts` | prefix history + `group_id` on `project.updated` | 2, 6 |
| `apps/server/src/projections/proj-groups.ts` (new) | the group tree | 6 |
| `apps/server/src/workspaces/workspace-name.ts` | prefix from `workspace.prefix_changed`; `formerPrefixes` | 2 |
| `apps/server/src/read/visible-projects.ts` | derivation skips reserved | 2 |
| `apps/server/src/permissions/check-permission.ts` | reservation door; group door | 3, 6 |
| `apps/server/src/routes/search.ts` | key lookup | 4 |
| `apps/server/src/projections/note-search.ts` | re-index on prefix change | 5 |
| `apps/server/src/routes/groups.ts` (new) | `GET /v1/workspaces/:id/groups` | 6 |
| `packages/ui/src/icons/plus-icon.tsx` (new) | `PlusIcon` | 8 |
| `packages/app-core/src/views/create-ticket-flow.tsx`, `new-ticket-dialog.tsx` | Create ticket | 8 |
| `apps/web/app/workspaces/page.tsx` | Create workspace button + dialog | 8 |
| `apps/web/app/w/[workspaceId]/page.tsx` | reorder; Projects heading; Create project dialog; grouped view | 7, 8 |
| `packages/app-core/src/preferences/project-grouping.ts` (new) | Grouped/Plain per user per device | 7 |
| `apps/web/src/group-picker.tsx` (new) | four-level type-ahead with inline create | 9 |
| `apps/web/src/project-edit-form.tsx`, `project-update-seeds.ts` | prefix + group | 10 |
| `apps/web/src/workspace-prefix-edit.tsx` (new) | workspace prefix + confirm | 10 |
| `apps/web/app/settings/page.tsx`, `apps/web/src/settings/groups-tree.tsx` (new) | Settings → Groups | 11 |
| `docs/manual.md`, help generated | the manual | 12 |

**Case blocks** (`test-cases/22-prefixes-and-groups.md`, 3-digit padded):
- T1 22.001–019
- T2 22.020–039
- T3 22.040–059
- T4 22.060–079
- T5 22.080–089
- T6 22.090–119
- T7 22.120–139 and 22.140–149 (grouped view)
- T8 22.150–159
- T9 22.160–179
- T10 22.180–199
- T11 22.200–219
- T12 22.220–239

---

### Task 1: The prefix and group-assignment fields on the events

**Files:**
- Modify: `packages/domain/src/events/membership.ts` (docblocks `:55-60`, `:116-119`, `:242-249`; `projectUpdatedPayload` `:250-256`)
- Modify: `packages/domain/src/vocabulary.ts` (register beside `workspace.renamed`, `:90-95`)
- Create: `test-cases/22-prefixes-and-groups.md`
- Modify: `test-cases/README.md` (bucket line), `scripts/fixtures/check-case-citations-baseline.json` (`"22-prefixes-and-groups.md": 0`), `Features.md` (new `## 19`)
- Test: `packages/domain/test/prefix-events.test.ts` (new)

**Interfaces, produces:**
- `workspacePrefixChangedPayload = z.object({ prefix: prefixSchema }).strict()`, `type WorkspacePrefixChangedPayload`
- `projectUpdatedPayload`: `{ name?: displayName; description?: descriptionText | null; prefix?: Prefix; groupId?: string | null }`, refined so that at least one key is present

- [ ] **Step 1: Write the failing tests** (`prefix-events.test.ts`):
```ts
import { describe, it, expect } from 'vitest';
import { parseEvent, domainRegistry } from '../src/index.js';
const base = { id: '01J0000000000000000000000A', workspaceId: 'W1', actorId: 'U1', origin: 'web', clientTime: '2026-10-02T00:00:00.000Z', version: 1 };
describe('22.001 — workspace.prefix_changed carries one valid prefix', () => {
  it('22.001 — accepts {prefix:"SH"}; control: refuses "sh" and "ABCD"', () => {
    const ok = parseEvent(domainRegistry, { ...base, type: 'workspace.prefix_changed', entity: { kind: 'workspace', id: 'W1' }, payload: { prefix: 'SH' } });
    expect(ok.ok).toBe(true);
    for (const bad of ['sh', 'ABCD', '']) {
      expect(parseEvent(domainRegistry, { ...base, type: 'workspace.prefix_changed', entity: { kind: 'workspace', id: 'W1' }, payload: { prefix: bad } }).ok).toBe(false);
    }
  });
});
describe('22.002 — project.updated may carry only a prefix, or only a group', () => {
  it('22.002 — {prefix} alone and {groupId} alone parse; control: {} is refused', () => {
    const ev = (payload: object) => parseEvent(domainRegistry, { ...base, type: 'project.updated', entity: { kind: 'project', id: 'P1' }, payload });
    expect(ev({ prefix: 'SH' }).ok).toBe(true);
    expect(ev({ groupId: 'G1' }).ok).toBe(true);
    expect(ev({ groupId: null }).ok).toBe(true);
    expect(ev({}).ok).toBe(false);
  });
});
```
(Use the real `parseEvent` signature and envelope shape from `packages/domain/src/registry.ts`; copy the envelope builder from an existing `packages/domain/test/*events*.test.ts` file rather than this sketch if they differ.)
- [ ] **Step 2: Run, see RED:** `cd packages/domain && pnpm exec vitest run test/prefix-events.test.ts > /tmp/t1.log 2>&1; tail -20 /tmp/t1.log`. Expected: `workspace.prefix_changed` unknown; `{prefix}` refused by the refine.
- [ ] **Step 3: Implement.** In `membership.ts`:
```ts
export const workspacePrefixChangedPayload = z.object({ prefix: prefixSchema }).strict();
export type WorkspacePrefixChangedPayload = z.infer<typeof workspacePrefixChangedPayload>;

export const projectUpdatedPayload = z
  .object({
    name: displayName.optional(),
    description: descriptionText.nullable().optional(),
    prefix: prefixSchema.optional(),
    groupId: z.string().min(1).nullable().optional(),
  })
  .strict()
  .refine(
    (p) => p.name !== undefined || p.description !== undefined || p.prefix !== undefined || p.groupId !== undefined,
    'a project update names a new name, description, prefix or group',
  );
```
Rewrite the three docblocks:
- `:55-60` (workspace): the prefix CAN change via `workspace.prefix_changed` (2026-10-01 spec R1/R2); every key re-reads; former prefixes stay reserved and resolvable.
- `:116-119` (project): the same, for `project.updated.prefix`.
- `:242-249`: replace "The PREFIX is not here and never will be" with the new rule and a pointer to the spec.

Register in `vocabulary.ts`: `domainRegistry.register({ type: 'workspace.prefix_changed', version: 1, entityKind: 'workspace', payloadSchema: workspacePrefixChangedPayload });`. Export the new schema from the package index wherever `workspaceRenamedPayload` is exported.

Add a dated note at the top of `docs/superpowers/specs/2026-10-01-mcp-workspace-project-crud-design.md` §FD3 (and plan FD3): *"Superseded 2026-10-01 by `2026-10-01-prefixes-groups-create-buttons-design.md` R1/R2: prefixes are now editable."*
- [ ] **Step 4: GREEN:** the same command; then `pnpm --filter @gisik-nokma/domain typecheck`.
- [ ] **Step 5: Catalogue.** Create `test-cases/22-prefixes-and-groups.md` with `## 22.1 Events` holding 22.001–22.002 as ✅, and a header table of the blocks above. Add the README bucket line, the baseline key, and Features `## 19` with one ⚙️ bullet: *"workspace.prefix_changed; project.updated carries prefix and groupId (`packages/domain/src/events/membership.ts`)"*.
- [ ] **Step 6: Mutation:** drop `prefix` from the refine → 22.002 red. Then commit: `Prefixes/groups T1: workspace.prefix_changed; project.updated carries prefix and groupId (22.001-22.002)`.

---

### Task 2: Prefix history on the read side, and derivation that skips reserved prefixes

**Files:**
- Create: `apps/server/migrations/1791100000000_prefix-history.sql`
- Modify:
  - `apps/server/src/projections/proj-projects.ts` (`project.updated` branch `:104-121`; `tables`; `reset`)
  - `apps/server/src/workspaces/workspace-name.ts:98-150`
  - `apps/server/src/read/visible-projects.ts:112-147`
  - `packages/domain/src/prefix.ts:140-178`
- Test: `apps/server/test/read/prefix-history.test.ts` (new), `packages/domain/test/prefix.test.ts` (extend)

**Interfaces:**
- Consumes: Task 1's payloads; `proj_projects.founding_name` (precondition P1).
- Produces:
  - `resolveProjectPrefixes(claims: readonly PrefixClaim[], reserved?: ReadonlySet<string>): string[]`: pass 2 skips `reserved` as if taken; pass 1 is unchanged (entered prefixes were checked at the door).
  - `projectPrefixHistory(db, workspaceId): Promise<Map<string /*projectId*/, { current: string; former: Array<{ prefix: string; until: string }> }>>`
  - `workspaceIdentityFromLedger(...)` returns `{ name, prefix, formerPrefixes: Array<{ prefix: string; until: string }> }`.

- [ ] **Step 1: Migration** (`-- Up Migration`):
```sql
CREATE TABLE proj_project_prefixes (
  project_id   text NOT NULL,
  workspace_id text NOT NULL,
  prefix       text NOT NULL,
  until_time   timestamptz NOT NULL,
  PRIMARY KEY (project_id, prefix)
);
CREATE INDEX proj_project_prefixes_ws ON proj_project_prefixes (workspace_id, prefix);
-- Down Migration
DROP TABLE proj_project_prefixes;
```
A project's FORMER prefixes. The current one stays in `proj_projects.prefix` (entered) or is derived from `founding_name`.
- [ ] **Step 2: Failing tests:**
  - **22.020:** after `project.updated {prefix:'SH'}` on a project founded with `SO`, the history reads current `SH`, former `[SO]`, and its tickets' keys read `CCSH-n`. Control: before the update, the keys read `CCSO-n`.
  - **22.021:** a project founded with NO entered prefix (derived `SO`) that changes to `SH` records the DERIVED `SO` as former.
  - **22.022:** back to `SO`: current `SO`; former `[SH]`, with `SO` no longer listed as former.
  - **22.023:** `workspace.prefix_changed {prefix:'CD'}` makes keys read `CDSO-n`; the former workspace prefixes are `[CC]`.
  - **22.024:** `resolveProjectPrefixes([{name:'Shop ops'}], new Set(['SO']))` yields `SO2`, the next candidate (domain unit). Control: without `reserved` it yields `SO`.
  - **22.025:** `verify-projections` stays green after the updates in 22.020–22.023 (use the harness in `apps/server/test/verify-projections.test.ts`).
- [ ] **Step 3: RED:** `cd apps/server && pnpm exec vitest run test/read/prefix-history.test.ts > /tmp/t2.log 2>&1; tail -30 /tmp/t2.log`.
- [ ] **Step 4: Implement.**
  - **Projection `project.updated`:** when `payload.prefix` is present and differs from the current resolved prefix:
    - INSERT the old current into `proj_project_prefixes` (`until_time = event.serverTime`; ON CONFLICT (project_id, prefix) DO UPDATE SET until_time);
    - DELETE the row for the new prefix, if it was a former one;
    - SET `proj_projects.prefix = payload.prefix`.

    The "old current" for a derived project is the derivation at that moment. Compute it with `projectPrefixesInWorkspace` inside the projection transaction, which is replay-safe because it reads only projection state built from earlier events.
  - Add `'proj_project_prefixes'` to `tables`, and `DELETE FROM proj_project_prefixes` to `reset`.
  - **`workspace-name.ts`:** include `workspace.prefix_changed` in the `type IN (...)` read. The current prefix is the last `prefix_changed`, else the founding prefix or derivation. The formers are every earlier value with the `serverTime` at which it stopped, minus any value that is current again.
  - **`visible-projects.ts`:** `projectPrefixesInWorkspace` loads the workspace's reserved set (`SELECT prefix FROM proj_project_prefixes WHERE workspace_id=$1`) and passes it to `resolveProjectPrefixes`.
  - **`prefix.ts`:** add the `reserved` parameter and treat it as pre-taken in pass 2 only.
- [ ] **Step 5: GREEN + mutations:**
  - 22.020: keep `proj_projects.prefix` unchanged on update → red.
  - 22.021: record nothing for derived projects → red.
  - 22.024: ignore `reserved` → red.
  - 22.025: omit the new table from `tables` → the verify harness reports no shadow table. Record that, and say why it's still caught; otherwise mark it as an equivalent mutation, with the reason.

  Then commit `Prefixes/groups T2: prefix history, re-keyed reads, derivation skips reserved (22.020-22.025)`.

---

### Task 3: The door. Reserved prefixes are refused, and the holder may take one back

**Files:**
- Modify: `apps/server/src/permissions/check-permission.ts` (`checkProjectPrefixUnique` `:1055-1096` → `checkPrefixReservation`; the role gate for `workspace.prefix_changed` beside `:833-835`; add the type to `ADMIN_ONLY_TYPES` `:350`)
- Test: `apps/server/test/permissions/prefix-reservation.test.ts` (new)

**Interfaces:**
- Consumes: `projectPrefixHistory`, `workspaceIdentityFromLedger`.
- Produces: rule ids `project.prefix-taken` (existing, reused) and `project.prefix-reserved` (new); `workspace.prefix_changed` refused for non-admins with rule `permission.role`.

- [ ] **Step 1: Failing tests:**
  - **22.040:** `project.updated {prefix:'SO'}` on project B, where project A held `SO` until today, is refused `project.prefix-reserved` with the reason *"SO was Shop operations' prefix until 1 Oct. Its old ticket keys still point there, so it can't be reused."* (format the date `d MMM`; the name is A's CURRENT name). Control in the same `it`: `{prefix:'SX'}` is accepted.
  - **22.041:** `project.created {prefix:'SO'}` (a new project) is refused the same way.
  - **22.042:** a CURRENT prefix of another project is refused with the existing `project.prefix-taken` text (unchanged).
  - **22.043:** `workspace.prefix_changed` by a member is refused `permission.role`; by an admin it's accepted.
  - **22.044:** project A going `SO` → `SH` → `SO` is ACCEPTED at every step (Review Focus 1).
  - **22.045:** a retry of the same `project.updated` event id returns `duplicate-event-id`, not a prefix refusal (the existing retry lesson at `:1067-1077`).
- [ ] **Step 2: RED** (`pnpm exec vitest run test/permissions/prefix-reservation.test.ts`).
- [ ] **Step 3: Implement** `checkPrefixReservation(db, env)`:
  - applies to `project.created` with `prefix`, and to `project.updated` with `prefix`;
  - `taken` = every OTHER project's current prefix (existing logic);
  - `reserved` = every OTHER project's former prefixes, from `projectPrefixHistory`;
  - refuse `taken` first, then `reserved`, using A's current name and `until`.

  Keep the existing call site at `:1735`, renamed. Add `workspace.prefix_changed` to `ADMIN_ONLY_TYPES`. A workspace may reuse its own former prefix (spec §3.1), so there's no reservation check for workspaces.
- [ ] **Step 4: GREEN + mutations:**
  - drop the reserved branch → 22.040/22.041 red;
  - don't exclude self → 22.044 red;
  - check `reserved` before dedupe → 22.045 red.

  Commit `Prefixes/groups T3: the door reserves retired prefixes; the holder may take its own back (22.040-22.045)`.

---

### Task 4: Find a ticket by its key, current or former (FD1)

**Files:**
- Modify: `packages/domain/src/prefix.ts` (add `parseTicketKey`)
- Modify: `apps/server/src/routes/search.ts` (`readSearch` `:176`, before the lexical branch)
- Test: `packages/domain/test/prefix.test.ts`, `apps/server/test/routes/search-by-key.test.ts` (new)

**Interfaces, produces:**
- `parseTicketKey(text: string): { letters: string; number: number } | null`: trims, upper-cases, matches `/^([A-Z]{2,6})-(\d{1,7})$/`.
- `readSearch` puts an EXACT key match first among the ticket hits when the query is key-shaped.

- [ ] **Step 1: Failing tests:**
  - **22.060:** `parseTicketKey(' ccso-12 ')` → `{letters:'CCSO', number:12}`; control: `'CCSO12'`, `'C-1'` and `'hello'` → null.
  - **22.061:** searching `CCSO-12` returns that ticket first.
  - **22.062:** after the project changes `SO` → `SH`, `CCSO-12` STILL returns it, and its card shows `CCSH-12`.
  - **22.063:** after `workspace.prefix_changed` `CC` → `CD`, `CCSO-12` and `CDSO-12` both find it.
  - **22.064:** lower case and spaces work (Review Focus 2).
  - **22.065:** a key in a workspace the caller can't see finds nothing; a key whose ticket is in a project the caller can't see finds nothing. Control: the visible one does.
  - **22.066:** MCP `search_tickets` with a key returns it (one hosted-door case, reusing `apps/server/test/mcp/in-process-fetch.test.ts`'s harness).
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement.** In `readSearch`, when `parseTicketKey(query)` is non-null:
  - build the candidate splits: the workspace's current and former prefixes × each project's current and former prefixes (from Task 2), where `ws + proj === letters`;
  - for each matching project, take the ticket whose number (`ticketNumbers`, `apps/server/src/read/ticket-numbers.ts:93`) equals `number`;
  - pass that ticket id through the SAME visibility filter the lexical branch uses (reuse its visible-project set; never a second visibility rule);
  - prepend it as a ticket hit and de-duplicate it from the lexical hits.

  R2 makes the split unambiguous within a workspace.
- [ ] **Step 4: GREEN + mutations:**
  - current prefixes only → 22.062 red;
  - skip the visibility filter → 22.065 red;
  - no `toUpperCase` → 22.064 red.

  Commit `Prefixes/groups T4: search finds a ticket by its key, current or former (22.060-22.066)`.

---

### Task 5: The note-search index follows a prefix change (FD7)

**Files:**
- Modify: `apps/server/src/projections/note-search.ts` (`apply` `:95-119`, `ticket_text` builder `:180-212`)
- Test: `apps/server/test/projections/note-search-prefix.test.ts` (new)

- [ ] **Step 1: Failing tests:**
  - **22.080:** a note attached to ticket `CCSO-3`. After `project.updated {prefix:'SH'}`, its `ticket_text` contains `CCSH-3`, and a note search for `CCSH-3` finds the note. Control: before the change, `CCSO-3` finds it.
  - **22.081:** the same for `workspace.prefix_changed`.
  - **22.082:** `verify-projections` stays green.
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement.** In `apply`:
  - on `project.updated` with `prefix`, re-derive `ticket_text` (and its lexemes) for every note with an attached ticket in that project;
  - on `workspace.prefix_changed`, do the same for every note in the workspace with an attached ticket.

  Reuse the existing per-note rebuild function the ticket-title path calls. (The old key stays findable through FD1's key search, which covers tickets; for notes, the new key is what's indexed. Say so in the docblock.)
- [ ] **Step 4: GREEN + mutation** (ignore `project.updated` → 22.080 red; verify drift caught by 22.082). Commit `Prefixes/groups T5: note search re-indexes on a prefix change (22.080-22.082)`.

---

### Task 6: Groups. Events, the tree projection, the door and the read route

**Files:**
- Create:
  - `packages/domain/src/events/groups.ts`
  - `apps/server/migrations/1791200000000_groups.sql`
  - `apps/server/src/projections/proj-groups.ts`
  - `apps/server/src/routes/groups.ts`
- Modify:
  - `packages/domain/src/vocabulary.ts`
  - `apps/server/src/projections/index.ts` (register after `projProjects`)
  - `apps/server/src/projections/proj-projects.ts` (`group_id`)
  - `apps/server/src/permissions/check-permission.ts` (`ADMIN_ONLY_TYPES` + `checkGroupRules`)
  - `apps/server/src/app.ts` (register the route)
  - `packages/domain/src/read-models.ts` (`GroupRow`, `ProjectRef.groupId`)
- Test: `packages/domain/test/group-events.test.ts`, `apps/server/test/groups/*.test.ts`

**Interfaces, produces:**
```ts
// packages/domain/src/events/groups.ts
export const GROUP_MAX_LEVEL = 4;
export const groupCreatedPayload = z.object({
  parentId: z.string().min(1).nullable(),
  level: z.number().int().min(1).max(GROUP_MAX_LEVEL),
  name: displayName,
  rank: z.string().regex(RANK_KEY_REGEX).refine(isRankKey),
}).strict().refine((p) => (p.level === 1) === (p.parentId === null), 'an L1 group has no parent; every other level has one');
export const groupRenamedPayload = z.object({ name: displayName }).strict();
export const groupReorderedPayload = z.object({ rank: z.string().regex(RANK_KEY_REGEX).refine(isRankKey) }).strict();
export const groupDeletedPayload = z.object({}).strict();
// entityKind 'group' for all four; register type 'group.created' | 'group.renamed' | 'group.reordered' | 'group.deleted', version 1.
// read model:
export type GroupRow = { id: string; parentId: string | null; level: 1 | 2 | 3 | 4; name: string; rank: string; projectCount: number; childCount: number };
// ProjectRef gains: groupId: string | null
// GET /v1/workspaces/:workspaceId/groups → { groups: GroupRow[] }  (members may read; see the permissions below)
```
Migration:
```sql
CREATE TABLE proj_groups (
  group_id text PRIMARY KEY, workspace_id text NOT NULL, parent_id text NULL,
  level smallint NOT NULL CHECK (level BETWEEN 1 AND 4), name text NOT NULL, rank text NOT NULL,
  created_by text NOT NULL, created_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX proj_groups_sibling_name ON proj_groups (workspace_id, COALESCE(parent_id, ''), lower(name));
ALTER TABLE proj_projects ADD COLUMN group_id text NULL;
```
(Down: drop the column and the table. The entity kind `group` must be added wherever `entity.kind` is enumerated: grep `'project' | 'workspace'` in `packages/domain/src`.)

- [ ] **Step 1: Failing tests:**
  - **22.090:** the payload refine: L1 with a parent is refused; L2 without one is refused; L5 is refused.
  - **22.091:** `group.created` L1 "Retail", then L2 "North" under it: the route returns both, with levels and parents.
  - **22.092:** an L2 whose parent is an L2 is refused `group.level-mismatch` ("A level 2 group goes under a level 1 group.").
  - **22.093:** a parent from another workspace is refused (not found).
  - **22.094:** a sibling name equal ignoring case ("retail" beside "Retail") is refused `group.name-taken` ("There is already a group called Retail here."). Control: the same name under a DIFFERENT parent is accepted (R4).
  - **22.095:** rename follows the same sibling rule.
  - **22.096:** delete is refused `group.in-use` while a project points at it ("Shop operations is in this group. Move it out first.").
  - **22.097:** delete is refused `group.has-children` while children exist ("This group has groups under it. Delete those first.").
  - **22.098:** deleting an unused leaf is accepted, and the route no longer lists it.
  - **22.099:** `project.updated {groupId}` with a group from another workspace, or a deleted one, is refused `project.group-unknown`.
  - **22.100:** every group event by a member is refused `permission.role`; by an admin it's accepted. A member CAN read `GET /groups`; a guest gets the same 404 the project list gives an outsider.
  - **22.101:** `verify-projections` is green after create, rename, reorder, delete and assign.
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement.**
  - **Projection:** `apply` handles the four events (INSERT, UPDATE name, UPDATE rank, DELETE) and `project.updated.groupId` (`UPDATE proj_projects SET group_id`). Add the tables and `reset`.
  - **Door, `checkGroupRules(db, env)`:**
    - `created`: the parent exists in this workspace and `level = parent.level + 1`; the sibling name is free, ignoring case.
    - `renamed`: the sibling name is free.
    - `deleted`: no project with `group_id` and no child.
    - `project.updated.groupId`: the group exists in this workspace.

    Each refusal uses `refuseWith(rule, reason)` with the texts above. All four group types go in `ADMIN_ONLY_TYPES`.
  - **Route:** `GET /v1/workspaces/:workspaceId/groups` returns the groups with counts, behind the same membership gate as the workspace project list.
  - `ProjectRef.groupId` is filled where `getMyWorkspaces` builds projects (`apps/server/src/routes/workspaces.ts` ~`:226-290`).
- [ ] **Step 4: GREEN + mutations:**
  - case-sensitive uniqueness → 22.094 red;
  - skip the in-use check → 22.096 red;
  - allow any level → 22.092 red;
  - members allowed → 22.100 red.

  Commit `Prefixes/groups T6: the group tree (events, projection, door, read route) (22.090-22.101)`.

---

### Task 7: Workspace home. The nav row on top, the Projects heading row, and the grouped view

**Files:**
- Modify:
  - `apps/web/app/w/[workspaceId]/page.tsx` (`WorkspaceHome` `:777`; move `<WorkspaceLinks>` from `:1166` to directly after the header `:1025`; the Projects heading row `:1032`; the grid `:1086`)
  - `apps/web/app/globals.css` (`.gn-workspace-home__links` and the heading-row rules; level tokens)
  - `packages/ui/src/tokens.ts` (four level colours, per style × theme)
- Create:
  - `packages/app-core/src/preferences/project-grouping.ts`
  - `apps/web/src/grouped-projects.tsx`
- Test: `apps/web/test/workspace-home.test.tsx` (amend 13.673 section-links order), `apps/web/test/workspace-home-grouped.test.tsx` (new), `packages/app-core/test/preferences/project-grouping.test.ts` (new), `packages/ui/test/level-colours.test.ts` (new)

**Interfaces, produces:**
- `readProjectGrouping(userId: string, workspaceId: string): 'grouped' | 'plain'` (default `'plain'`)
- `rememberProjectGrouping(userId, workspaceId, choice)`: the `new-ticket-start.ts` shape, every storage access wrapped
- `<GroupedProjects groups={GroupRow[]} projects={ProjectRef[]} renderCard={(p) => ReactNode} />`
- Tokens `level1`…`level4` in `packages/ui/src/tokens.ts`, exposed as CSS vars `--gn-level-1`…`--gn-level-4`

- [ ] **Step 1: Failing tests:**
  - **22.120:** the section links render BEFORE the Projects heading in DOM order (amend 13.673's case line to say so). Control: all four links keep their names and hrefs.
  - **22.121:** the Projects heading row holds, in order, `<h2>Projects</h2>`, the archived toggle (if any), a `SegmentedControl` "Grouped / Plain" (aria-label "Show projects"), and the Create project button (Task 8 fills it; here, assert the slot `data-slot="create-project"`).
  - **22.122:** choosing Grouped persists via `rememberProjectGrouping` and survives a remount. Another user on the same device gets the default (plain).
  - **22.140:** the grouped view nests L1 → L4 sections in tree order (rank), each section headed by its name and a strip `data-level="N"`, with `aria-label="Level N group: <name>"`. A project sits in its own group's section.
  - **22.141:** projects with no group are listed under "Ungrouped", LAST.
  - **22.142:** the plain view is unchanged from today (13.384's assertions still pass).
  - **22.143:** the level tokens differ per level and clear 3:1 against the card surface in neo/hig/minimal × light/dark (a contrast test over `tokens.ts`, the technique of the existing contrast-pair tests).
  - **22.146:** a group with no projects in it AND no descendants with projects renders no section; "Ungrouped" is absent when every project has a group (Review Focus 5).
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement.**
  - The reorder.
  - The heading row (a flex row: the title on the left, the controls on the right, wrapping under 40rem).
  - The preference store.
  - `GroupedProjects`: build the tree from `groups`, bucket `projects` by `groupId`, and render the sections recursively with `<section aria-labelledby>`. Each section gets `<h3>` for L1, `<h4>` for L2, and so on to `<h6>` max, with the strip as a 4px left border in `var(--gn-level-N)`. The section body is the existing card grid.
  - The home fetches `GET /groups` alongside `getMyWorkspaces` (add `getGroups(workspaceId)` to the data source and a stub in `apps/web/test/helpers/stub-services.ts`).
- [ ] **Step 4: GREEN + mutations:**
  - render "Ungrouped" first → 22.141 red;
  - one shared level colour → 22.143 red;
  - don't persist → 22.122 red.

  Commit `Prefixes/groups T7: nav row on top, Projects heading row, grouped view (22.120-22.146)`.

---

### Task 8: Create workspace, Create project and Create ticket as primary icon buttons that open their forms

**Files:**
- Create: `packages/ui/src/icons/plus-icon.tsx` (export from `packages/ui/src/index.ts`)
- Modify:
  - `packages/app-core/src/views/create-ticket-flow.tsx:498`
  - `packages/app-core/src/views/new-ticket-dialog.tsx:911`
  - `apps/web/app/workspaces/page.tsx` (`FoundingForm` `:782`, placement `:269`, header `:111`)
  - `apps/web/app/w/[workspaceId]/page.tsx` (`NewProjectForm` `:1184`, its placement `:1153-1159`, empty-state copy `:1076`)
  - `apps/web/app/globals.css` (`.gn-workspace-founding*` `:1445-1470`, `.gn-project-founding` `:1472`)
  - `docs/manual.md` + regenerate help
- Test: every test that presses "New ticket" by name (`grep -rln "New ticket" apps packages --include=*.test.*`), `apps/web/test/founding.test.tsx`, `apps/web/test/create-buttons.test.tsx` (new)

**Interfaces, produces:**
- `PlusIcon({ size = 16 }: { size?: number })`: an inline SVG, `aria-hidden="true"`, `stroke="currentColor"`, the `select-icons.tsx` style
- `<Button variant="primary"><PlusIcon />Create ticket</Button>` (the `.gn-button` gap already spaces the icon)

- [ ] **Step 1: Failing tests:**
  - **22.150:** the project page's create button is named exactly "Create ticket", contains one `svg[aria-hidden]`, and is the ONLY `.gn-button--primary` in the page header. The dialog's title is "Create ticket". Control: clicking it opens the dialog (the existing flow test).
  - **22.151:** `/workspaces` shows "Create workspace" (primary, one icon) in the header row (`.gn-workspaces__head`), and NO always-visible founding form. Clicking it opens a Dialog titled "Create workspace" with name + prefix. Submitting founds the workspace and navigates (3.124/3.126/3.128 move into the dialog; amend their lines).
  - **22.152:** the workspace home shows "Create project" (primary, one icon) in the Projects heading row, and no always-visible "New project" row. It opens a Dialog titled "Create project" with name, description, prefix and the group picker (the Task 9 component; until then, assert the `data-slot="group-picker"`). A non-admin sees no button, and keeps the existing refusal line, reworded: "Only an owner or admin can create a project."
  - **22.153:** the empty state reads "No projects yet. Create the first one." and contains no "below".
  - **22.154:** `pnpm check:help` passes with the manual's "New ticket" → "Create ticket" (and the founding text) updated.
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement.**
  - **`PlusIcon`:** two 2px strokes in a 24 viewBox, sized 16.
  - **Create ticket:** rename the button and the dialog title; put the icon in the button.
  - **`/workspaces`:** move `FoundingForm`'s fields into `<Dialog title="Create workspace">` (the `Dialog` from `packages/ui`, as in `NewTicketDialog`) opened from the header button. The form's own submit stays labelled "Create workspace".
  - **Workspace home:** the same for `NewProjectForm` → `<Dialog title="Create project">`.
  - Delete the founding-block CSS that no longer has an element.
  - Update every test that presses "New ticket", and the manual; regenerate help.
- [ ] **Step 4: GREEN + mutations:**
  - two primaries in the header → 22.150 red;
  - the founding form left visible → 22.151 red.

  Commit `Prefixes/groups T8: Create workspace/project/ticket are primary icon buttons opening dialogs (22.150-22.154)`.

---

### Task 9: The group picker. Four type-ahead levels, with inline create (R6, FD3, FD11)

**Files:**
- Create: `apps/web/src/group-picker.tsx`, `apps/web/src/group-picker-seeds.ts`
- Test: `apps/web/test/group-picker.test.tsx` (new)

**Interfaces:**
- Consumes: `GroupRow[]` (Task 6); `rankBetween` (`packages/domain/src/rank.ts:54`).
- Produces:
```ts
export type GroupChoice = { groupId: string | null; pendingNames: string[] /* new groups to create, top-down, under the deepest existing pick */ };
export function GroupPicker(props: { groups: GroupRow[]; value: GroupChoice; onChange: (c: GroupChoice) => void; disabled?: boolean; idPrefix: string }): JSX.Element;
export function groupSeeds(workspaceId: string, groups: GroupRow[], choice: GroupChoice, newId: () => string): { seeds: EnvelopeSeed[]; groupId: string | null };
// groupSeeds: one group.created per pending name (parent = the previous one; rank = after the last sibling), returns the deepest id for project.updated/created to use.
```
- [ ] **Step 1: Failing tests:**
  - **22.160:** four comboboxes labelled "Level 1 group" … "Level 4 group". Level N+1 is disabled until level N has a value.
  - **22.161:** typing in level 2 lists ONLY children of the level-1 pick whose names contain the text, ignoring case. Control: a same-named group under another L1 is not listed (R4).
  - **22.162:** an exact case-insensitive match is selected automatically on blur or Enter (R6).
  - **22.163:** no match, then leaving the field → the field shows the typed name with a "New" tag, and `value.pendingNames` holds it. `groupSeeds` emits `group.created` with the right parent, level and rank, and returns its id.
  - **22.164:** clearing level 2 clears levels 3–4.
  - **22.165:** a door refusal `group.name-taken` on the inline create (someone created it first) → the picker re-reads the groups, selects the existing one, and shows "Using the existing Retail." (Review Focus 4).
  - **22.166:** every combobox has a ≥ 44px target and a visible label; a keyboard-only walk sets all four levels.
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement** with `@react-aria/combobox` / `@react-stately/combobox`, as `packages/ui/src/select/select.tsx:149` does. Put a "Create “<text>”" option LAST when there's no exact match (WAI-ARIA combobox listbox pattern). Strings use sentence case.
- [ ] **Step 4: GREEN + mutations** (case-sensitive match → 22.162 red; the parent filter removed → 22.161 red). Commit `Prefixes/groups T9: the four-level group picker with inline create (22.160-22.166)`.

---

### Task 10: Project edit gains prefix and group; workspace prefix edit; prefix-change confirmation

**Files:**
- Modify:
  - `apps/web/src/project-edit-form.tsx:34` (`ProjectEditValues` `:6`)
  - `apps/web/src/project-update-seeds.ts:24`
  - `apps/web/app/w/[workspaceId]/page.tsx` (`edit` `:821-832`; the header rename `:943-982`)
  - `apps/web/src/project-title.tsx:81-129`
- Create: `apps/web/src/workspace-prefix-edit.tsx`, `apps/web/src/prefix-change-confirm.tsx`
- Test: `apps/web/test/workspace-home-project-edit.test.tsx` (extend), `apps/web/test/project-header-edit.test.tsx` (extend), `apps/web/test/workspace-prefix-edit.test.tsx` (new)

**Interfaces, produces:**
- `ProjectEditValues = { name: string; description: string; prefix: string; group: GroupChoice }`
- `updateSeeds(workspaceId, projectId, before: { name; description; prefix; groupId }, after: ProjectEditValues, groups, newId)`: emits group seeds (Task 9) first, then ONE `project.updated` carrying only the changed keys (`prefix` upper-cased; `groupId`).
- `<PrefixChangeConfirm from="CCSO" to="CCSH" onConfirm onCancel />`: a Dialog. Its body is *"Tickets will be renumbered CCSH-… Old CCSO- keys still work."*; the buttons are "Change prefix" (primary) and "Keep CCSO".

- [ ] **Step 1: Failing tests:**
  - **22.180:** editing a project's prefix asks for confirmation with the exact text. Confirm sends `project.updated {prefix}`; cancel sends nothing.
  - **22.181:** a door refusal (`project.prefix-reserved`) shows the server's reason verbatim under the field, and the form stays open.
  - **22.182:** changing only the group sends `project.updated {groupId}` and no prefix confirmation.
  - **22.183:** an inline-created group sends `[group.created, project.updated]` in that order, in one ingest call.
  - **22.184:** the header Edit (`project-title.tsx`) offers the same fields.
  - **22.185:** the workspace header gains "Edit prefix" (admins only). It confirms with the workspace-level text and sends `workspace.prefix_changed`; a member doesn't see it.
  - **22.186:** an unchanged form sends nothing (the existing `[]` rule).
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement.** Extend `ProjectEditForm` with a prefix field (upper-cases as typed, as `#gn-founding-prefix` does) and `GroupPicker`. Before submit, if the prefix changed, open `PrefixChangeConfirm`, computing `from`/`to` from the workspace prefix + the old and new project prefix. `WorkspacePrefixEdit` sits beside the rename trigger in the workspace header.
- [ ] **Step 4: GREEN + mutations:**
  - skip the confirmation → 22.180 red;
  - send `group.created` after `project.updated` → 22.183 red.

  Commit `Prefixes/groups T10: project edit gains prefix and group; workspace prefix edit; confirm before re-keying (22.180-22.186)`.

---

### Task 11: Settings → Groups, the tree page

**Files:**
- Modify: `apps/web/app/settings/page.tsx` (`SettingsTab` `:14`, `isSettingsTab` `:16-18`, the sidebar `:182-216`, the content switch `:224-237`)
- Create: `apps/web/src/settings/groups-tree.tsx`, `apps/web/src/settings/groups-tree.css` (or rules in `globals.css`, beside `.gn-settings`)
- Test: `apps/web/test/settings-groups.test.tsx` (new), `apps/web/test/settings-page.test.tsx` (amend the tab list)

**Interfaces:**
- Consumes: `GET /groups`; the seeds for `group.created/renamed/reordered/deleted`; `rankBetween`.
- Produces: `<GroupsTree workspaceId canEdit groups onSubmit />`.

- [ ] **Step 1: Failing tests:**
  - **22.200:** the sidebar lists Ticket types, Workflows, Groups, Workspace; `?tab=groups` renders the tree.
  - **22.201:** the tree is laid out left to right, one column per level. Each box shows the name and its level strip (`data-level`, `aria-label "Level N group: <name>"`), and is joined to its children by a connector. The DOM is a nested `role="tree"` / `treeitem` with `aria-level`, so assistive technology reads the hierarchy.
  - **22.202:** "Add group" (primary, with PlusIcon) creates an L1, named through an inline field.
  - **22.203:** each box's ⊕ (aria-label "Add a group under <name>") adds a child at the next level; L4 boxes have no ⊕.
  - **22.204:** clicking a name turns it into a rename field. Enter saves `group.renamed`; Escape cancels. A sibling-name refusal shows the server's reason.
  - **22.205:** dragging a box among its siblings sends `group.reordered` with `rankBetween` of its new neighbours. Keyboard: Alt+↑/↓ moves it (drag must have a non-pointer path).
  - **22.206:** "Delete" shows only on a group with `projectCount === 0 && childCount === 0`, and confirms before `group.deleted`.
  - **22.207:** non-admins see the tree read-only (no ⊕, no Add, no rename, no drag, no delete).
  - **22.208:** at ≤ 40rem the tree renders as an indented list (each level indented 16px, with the strip still shown). Control: above 40rem it's columns (the CSS rule test technique: `readGlobalsCss` + `ruleExactly`).
  - **22.209:** an empty workspace shows "No groups yet. Add the first one to sort your projects." with the Add button.
- [ ] **Step 2: RED.**
- [ ] **Step 3: Implement.**
  - **Layout:** CSS grid, four columns, one per level. Each box is placed in its level's column with `grid-row` spanning its descendants' rows (compute the row spans from the tree). Connectors are a CSS border on a pseudo-element: a horizontal line from the parent's ⊕ to the child, and a vertical spine down the children column (as in the owner's sketch).
  - **Boxes:** the card style of the current theme. The strip is a 6px left border in `var(--gn-level-N)`. The ⊕ is a 44px round button with `PlusIcon`, sitting on the box's right edge.
  - **Drag:** the existing drag primitive, if the board's can be reused for a vertical list; otherwise native HTML5 DnD within one sibling list. Name which in the DONE line.
- [ ] **Step 4: GREEN + mutations:**
  - ⊕ shown on L4 → 22.203 red;
  - delete shown on a used group → 22.206 red;
  - no `aria-level` → 22.201 red.

  Commit `Prefixes/groups T11: Settings → Groups tree page (22.200-22.209)`.

---

### Task 12: Help, catalogue close-out and the browser pass

**Files:** `docs/manual.md` (sections on prefixes, groups and the Create buttons) + regenerate help; `Features.md` §19; `test-cases/22-prefixes-and-groups.md` §22.12 (🧪).

- [ ] **Step 1: The manual** (plain words):
  - **"Change a prefix":** what changes, that old keys still find tickets, that a retired prefix can't be taken by another project, and that note chips keep the key they were written with.
  - **"Group your projects":** levels, the tree page, assigning in the project form, the Grouped view.
  - **"Create buttons."**

  `pnpm check:help` must pass; add help tests per `packages/app-core/test/help/` precedent.
- [ ] **Step 2: Cases 22.220–22.226 (🧪, the controller's browser pass on the dev stack built from the release tip):**
  - 22.220: prefix change end to end (confirm, keys re-read, old key search);
  - 22.221: groups tree create, rename, reorder and delete in neo/hig/minimal × light/dark;
  - 22.222: inline group create from Create project;
  - 22.223: Grouped/Plain at 360/768/1440;
  - 22.224: the three Create buttons at 360/768/1440;
  - 22.225: the tree page at 360 (indented list) and 1440;
  - 22.226: keyboard-only tree operations.
- [ ] **Step 3: Commit** `Prefixes/groups T12: manual, catalogue close-out, browser-pass cases (22.220-22.226)`.

---

## Dependencies and parallel lanes
- T1 → T2 → T3, T4, T5 (T3, T4 and T5 can run in parallel after T2).
- T1 → T6 (in parallel with T2).
- T6 → T7, T9, T11 (in parallel).
- T8 runs in parallel from the start: buttons only. The Create project dialog's group slot is filled when T9 lands.
- T9 → T10.
- T12 runs last.
- **Three lanes:**
  - Lane A: T1 → T2 → T3 → T4 → T5.
  - Lane B: T6 → T9 → T10.
  - Lane C: T8 → T7 → T11.
  - T12: the controller, after all three.

## Self-review
- **Spec coverage:**
  - R1 → T2, T4 (+FD1, FD2).
  - R2 → T2, T3.
  - R3/R4 → T6, T9.
  - R5 → T7 (tokens), T11.
  - R6 → T9 (+FD3).
  - R7 → T6, T7.
  - §4 screens → T7, T8, T10, T11.
  - §5 permissions → T3, T6 (+FD4).
  - §6 testing → every task + T12.
  - §7 out of scope respected: no MCP tools, no "free a prefix", no group filters, no group moves.
- **Placeholders:** none. Where a harness is reused, the step names the file.
- **Type consistency:**
  - `GroupRow`, `GroupChoice`, `groupSeeds`;
  - `resolveProjectPrefixes(claims, reserved?)`, `projectPrefixHistory`, `parseTicketKey`;
  - `readProjectGrouping` / `rememberProjectGrouping`;
  - `PlusIcon`.

  These are used identically across T2–T11.
- **Review Focus:** each line has its pinning case: 22.044, 22.064, 22.096–098, 22.165/22.094, 22.146.
