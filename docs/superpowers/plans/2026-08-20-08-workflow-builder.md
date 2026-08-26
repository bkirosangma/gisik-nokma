# Workflow Builder UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Jira-style visual workflow builder and the ticket-type management UI — states as draggable nodes, transitions as drawn edges, the five-rule vocabulary behind proper pickers, live `validateWorkflowDef` validation beside a separate `adviseWorkflowDef` advisory tier that warns without blocking, a publish flow that surfaces the server's stranded-state refusal as a state-mapping dialog, a three-template gallery, and admin gating end-to-end.

**Architecture:** All builder logic and every React component live in `packages/app-core` (amendment 10 — shared views), split into a framework-free core (draft store, layout, rule summaries, issue anchoring, templates, event builders — plain TypeScript, unit-tested) and React components over it (React Flow canvas, inspectors, rule editors, panels, screens — component-tested in jsdom). `apps/web` contributes only thin Next.js pages and a `WorkflowAuthoringGateway` adapter over Plan 6's `DataSource`. The builder authors a `WorkflowDef` draft; `validateWorkflowDef` (the same pure function the server's ingest calls) runs on every change; publishing submits a `workflow.defined` event and renders every server refusal verbatim.

**Tech Stack:** TypeScript, React 19, `@xyflow/react` v12 (React Flow), Next.js 15 App Router (pages only), Vitest + @testing-library/react (jsdom) for component tests, Playwright for smoke, zod schemas consumed from `@gisik-nokma/domain`.

**Spec:** `docs/superpowers/specs/2026-08-20-gisik-nokma-product-design.md` — §4 is the contract for this plan (builder half: canvas, closed rule vocabulary, live validation, publish + state mapping, templates as ordinary workflows, **no AI drafting**). Read alongside `docs/superpowers/plans/2026-08-20-00-series-coordination.md` — the single authority for cross-plan interfaces; where any earlier plan's text disagrees with it, the coordination document wins.

## Global Constraints

- Package scope is `@gisik-nokma/*` (coordination decision 1). Monorepo: pnpm + turbo, workspace globs `packages/*` and `apps/*` (Plan 1).
- `WorkflowDef` carries explicit `initialStateId: string` (coordination decision 3) and states carry optional `blocked?: boolean` (amendment 9). **Every `WorkflowDef` literal in this plan carries `initialStateId`** — a literal without it is a bug.
- **No AI drafting of workflows** (spec §4, out-of-scope list). The builder and the template gallery are the entire authoring story. Nothing in this plan calls a model, suggests states, or autocompletes rules.
- The rule vocabulary is closed: exactly the five kinds from `@gisik-nokma/domain`'s `Rule` union. The builder offers no sixth thing.
- `packages/ui/src/tokens.ts` is the one colour origin (amendment 11) — no colour literal anywhere else in any client; this plan's only hex values are the token additions it makes to that file.
- Shared React views live in `packages/app-core`; views never speak HTTP directly (amendment 10) — the builder consumes a `WorkflowAuthoringGateway` interface; `apps/web` implements it over `DataSource`.
- `apps/web` is Next.js 15 App Router with the online `DataSource` (amendment 17).
- Every refusal surfaced in the UI is proven against a planted defect before it is trusted (spec, honesty contract §6); every one of the eleven `validateWorkflowDef` issue codes gets a planted-defect test, and so does the one `adviseWorkflowDef` advisory code — whose test proves the opposite property, that publish stays *enabled* (coverage table below).
- CODING_STANDARDS (`/Users/kiro/my_projects/CODING_STANDARDS.md`): BEM class names, intent-revealing identifiers, DIP (the gateway interface lives with its consumer), testing pyramid, validate at every boundary.
- `reference/` is frozen — never edit anything under it. `Features.md` and `test-cases/` move in the same change set as the work (Task 15 + per-task commits). One PR per change, branched off `main`, merged only with explicit approval. Commits are prose that says what was found and why it matters.
- ESM style per Plan 1: NodeNext resolution, explicit `.js` suffix on relative imports of `.ts` modules. `.tsx` modules are imported with their real `.tsx` extension, enabled by `allowImportingTsExtensions` — valid because these packages are never tsc-emitted (Next `transpilePackages` and vitest consume the sources directly).

---

## Binding contract (consumed verbatim from Plans 1–4, as amended by the coordination doc)

These names and shapes are the contract. Do not redefine them — import them.

From `@gisik-nokma/domain` (Plans 1–3, amended):

```ts
type StateCategory = 'open' | 'active' | 'terminal';
type WorkflowDef = {
  id: string; version: number; name: string;
  initialStateId: string;                                     // coordination decision 3
  states: { id: string; name: string; category: StateCategory; blocked?: boolean }[];  // amendment 9
  transitions: { from: string | '*'; to: string; rules: Rule[] }[];
};
type Rule =
  | { kind: 'restrict-to'; assignee?: boolean; roles?: string[]; userIds?: string[] }
  | { kind: 'require-comment' }
  | { kind: 'require-evidence' }
  | { kind: 'require-field'; field: string }
  | { kind: 'require-different-user'; thanActorOf: { to: string } };
type Issue = { code: string; message: string };
declare function validateWorkflowDef(def: WorkflowDef): Issue[];
// Issue codes (Plan 2 Task 3, amended by coordination decision 3 and the
// 2026-08-26 owner decisions) — eleven, every one of which BLOCKS publish:
//   no-states, duplicate-state-id, no-terminal-state, unknown-transition-state,
//   duplicate-transition, unreachable-state, terminal-no-inbound,
//   unknown-initial-state, empty-restrict-to, rdu-unknown-state,
//   rdu-unenterable-state
// Issues are ALL collected (the builder shows them all); order within each code follows definition order.

// A SECOND, separate function — authoring warnings, NOT publish gates.
type Advisory = { code: string; message: string };
declare function adviseWorkflowDef(def: WorkflowDef): Advisory[];
// Advisory codes: rdu-bypassable (suppressed when rdu-unenterable-state already
// fired for the same rule).
//
// Advisories never enter validateWorkflowDef's array and never reach the rule
// engine. This plan gates publish on validateWorkflowDef emptiness alone
// (selectCanPublish, Task 1) and every template asserts it validates clean, so
// a warning placed in that array would silently become a publish blocker.
// Keeping the two arrays apart is the whole point of the second function.
type WorkflowDefinedPayload = WorkflowDef & { stateMapping?: Record<string, string> };
type PublishedWorkflowDef = WorkflowDefinedPayload;

type CustomFieldDef = { id: string; name: string; type: 'text'|'number'|'date'|'select'|'person'; options?: string[] };
type TicketTypeDef = { id: string; name: string; icon: string; rank: number; workflowId: string; fields: CustomFieldDef[] };
// ticketTypeDefSchema / customFieldDefSchema (zod) — Plan 3 Task 1; BUILTIN_FIELD_IDS = ['title','description','dueDate'];
// BUILTIN_TICKET_TYPE_SEEDS: epic(1)/story(2)/task(3)/sub-task(4); SUB_TASK_TYPE_ID = 'sub-task';
// DEEPEST_RANK = 4 — the rank at or below which a type's tickets require a parent (Plan 3 design decision 9).

type EventEnvelope = { id, workspaceId, entity: { kind: EntityKind; id }, type, version, payload, actorId, origin, clientTime, serverTime, seq };
type SubmittedEvent = Omit<EventEnvelope, 'serverTime' | 'seq'>;   // Plan 1; id/workspaceId/entity.id/actorId are ULIDs
type Origin = 'web' | 'mobile' | 'desktop' | 'server';
type WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest';        // Plan 4
declare function newUlid(): string;
declare function parseEvent(raw: unknown): { ok: true; event: SubmittedEvent } | { ok: false; /* code, message */ };
```

Server behaviour this UI surfaces (never re-implements):

- **Publishing** is a `workflow.defined` event, entity `{ kind: 'workflow', id: payload.id }`, admin-only (Plan 4 `checkRolePermission`: rule `permission.role`, reason `Only a workspace owner or admin can do this. Your role is ${role}.`).
- **Version rule** (Plan 2, rule `workflow-version`): first publish must be version 1; the next must be latest+1.
- **Stranding rule** (Plan 2, rule `workflow-state-mapping`): version N+1 that drops states present in version N is refused unless `stateMapping` covers **every** dropped state — whether or not a ticket sits in it. This is permanent semantics, settled by the owner on 2026-08-26 (coordination doc, *Owner decisions: the workflow engine's two open questions*); it is **not** a stopgap awaiting relaxation. The reason: the rule engine runs identically on client and server, proven by one shared fixture suite, and client replicas are visibility-scoped — a user who cannot see three tickets sitting in the dropped state computes occupancy 0 while the server computes 3. Making publish legality depend on occupancy would make the two engines disagree by construction, which is precisely what the shared-fixture promise exists to prevent. So occupancy is a **builder courtesy, never an engine input**: `getStateOccupancy` prefills the mapping dialog's counts and the dialog degrades honestly when that read fails, but no refusal anywhere depends on it. The copy follows: neither the refusal nor the dialog asserts in-flight tickets nobody counted (Pinned UI copy).
- **Structural refusal** (Plan 2, rule `workflow-structure`): reason is `This workflow definition cannot be published: ${issue messages joined with ' '}` — the same messages this builder shows live. Because the engine joins **every** `validateWorkflowDef` message into this one refusal, an advisory placed in that array would become a refusal; that is the mechanical reason `adviseWorkflowDef` is a separate function.
- **`rdu-unenterable-state`** (the eleventh issue code, owner-settled 2026-08-26): a `require-different-user` rule naming a state that no transition in this version enters. Message shape, for reference only — `A require-different-user rule on the transition from ${label(from)} to ${label(to)} refers to a move to "${targetName}", but nothing in this version enters that state, so the rule can never require a second person.`
- **`rdu-bypassable`** (the one advisory code, from `adviseWorkflowDef` — a warning, never a gate): the guarded transition is reachable from `initialStateId` without ever entering the watched state, so on that path the rule finds no earlier performer. Message shape, for reference only — `A require-different-user rule on the transition from ${label(from)} to ${label(to)} watches the move to "${targetName}", but this move can be reached without ever entering "${targetName}"; on that path one person can make it alone.`
- **Plan 2 owns both copies.** No test in this plan hardcodes either message: the issues panel and the advisory section are asserted against `validateWorkflowDef`'s and `adviseWorkflowDef`'s own output, exactly as Open question 9 already requires for `unknown-initial-state`. Only *this plan's own* copy — headings, footers, banners — is asserted character for character.
- `ticket-type.defined` (Plan 3): payload is a `TicketTypeDef`, entity kind `ticket-type`, admin-only; the projection folds by **payload** id (last definition wins), so built-ins (`epic`, `story`, …) are edited by submitting a new definition with the same payload id under a fresh ULID entity id (the convention Plan 3's own tests use).

`IngestResult` (Plan 1, served to clients through `DataSource.ingest`, amendment 10):

```ts
type IngestResult =
  | { status: 'committed'; eventId: string; seq: number; serverTime: string }
  | { status: 'invalid'; eventId: string | null; code: string; message: string }
  | { status: 'refused'; eventId: string; rule: string; reason: string };
```

## Cross-plan coordination assumptions (Plans 5 and 6 are written in parallel)

This plan executes in parallel with Plans 6/7/9 (after 1–5). Where Plan 5/6 surfaces are not pinned by the coordination doc, this plan assumes the following; the executor adapts **only the named surface**, never the behaviour, if those plans chose differently. Each is also listed under Open questions.

1. **`packages/app-core` scaffold** — Plan 6 owns it. Every task that touches it starts with a guard step: if the package (or its vitest setup) already exists, skip the scaffold and only add files. Same for `packages/ui`.
2. **`DataSource`** (amendment 10) — assumed importable from `@gisik-nokma/app-core` as `{ ingest(events: SubmittedEvent[]): Promise<IngestResult[]>; query: ...; subscribe(...) }`. The builder never touches it directly except in the one web adapter file (Task 13); everything else consumes `WorkflowAuthoringGateway` (defined in Task 4).
3. **Read APIs this plan needs** (flagged for Plan 5 to serve and Plan 6 to expose on `DataSource.query`):
   - `GET /v1/workspaces/:workspaceId/workflows` → latest `PublishedWorkflowDef` per workflow (from `proj_workflows`)
   - `GET /v1/workspaces/:workspaceId/workflows/:workflowId` → latest `PublishedWorkflowDef | null`
   - `GET /v1/workspaces/:workspaceId/ticket-types` → `TicketTypeDef[]` (from `proj_ticket_types`)
   - `GET /v1/workspaces/:workspaceId/members` → `{ userId, displayName, role }[]` (`proj_memberships` joined with the auth user table for display names)
   - `GET /v1/workspaces/:workspaceId/workflows/:workflowId/state-occupancy` → `{ counts: Record<stateId, number> }` — count of tickets **currently sitting in each state** of that workflow (`proj_tickets` grouped by `state_id`), powering the mapping dialog's in-flight counts.
   - `GET /v1/workspaces/:workspaceId/ticket-types/:typeId/population?workflowId=…` → `{ count: number }` — how many tickets of that type are **pinned to that workflow** (`proj_tickets` filtered on `type_id` and `workflow_id`; a ticket pins its workflow at creation, owner decision 2026-08-26). Powers the type editor's divergence notice (Task 11). Admin-only on the same terms as state-occupancy.
   - `POST /v1/workspaces/:workspaceId/ticket-types/:typeId/migrate-workflow`, body `{ fromWorkflowId, toWorkflowId, stateMap: Record<stateId, stateId> }` → `{ migrated: number }` — the **bulk affordance** the owner decision requires: the admin authors one cross-workflow state map and the server expands it into one `ticket.workflow_rebound { toWorkflowId, toStateId }` per ticket. Plan 3 owns the event, its payload and its refusals; this plan owns only the authoring UI and consumes the outcome. **The endpoint itself is unowned server work** — see Open question 13.
4. **Session** — Plan 6 owns sign-in state in `apps/web`. Assumed: a hook or loader yielding `{ userId: string; workspaceRole: WorkspaceRole }` for the current workspace. Only the page files (Task 13) touch it; all components take a `BuilderSession` prop.
5. **Workspace route segment** — assumed `apps/web/app/w/[workspaceId]/…`; the builder claims `…/settings/workflows` and `…/settings/ticket-types` beneath it. If Plan 6 chose a different segment, move the page files; component code is unaffected.
6. **`packages/ui` tokens export** — assumed `export const tokens = { … }` from `packages/ui/src/tokens.ts`, re-exported by the package index. Task 5 adds the workflow-builder colour roles there if absent; if Plan 6 already defined equivalent roles, use Plan 6's keys and add nothing.
7. **React/Next versions** — React 19, Next 15 (amendment 17). Vitest/jsdom versions: match whatever the workspace already pins; the exact numbers below are fallbacks for a not-yet-scaffolded package.

## Design decisions (named here so nobody "fixes" them mid-execution)

1. **`removeState` cascades the state's transitions but leaves `initialStateId` and `require-different-user` references dangling.** A dangling edge cannot render on a canvas, so edges from/to a deleted state go with it (standard canvas behaviour, matching React Flow's own node-deletion semantics). But the initial-state marker and a four-eyes rule's named move are things the author *wrote*; silently rewriting them would be its own small lie. They stay, dangle, and surface as `unknown-initial-state` / `rdu-unknown-state` issues the author resolves deliberately.
2. **Issue anchoring pairs by code, not by global order.** `Issue` carries no structural pointer (`{ code, message }` only). `anchorIssues` recomputes each code's offender list from the def in definition order and zips it with that code's issues in order. Pairing per code makes anchoring robust to the reconciliation inserting `unknown-initial-state` anywhere in `validateWorkflowDef`'s global issue order. **The same robustness covers the eleventh code**: Plan 2 slots `rdu-unenterable-state` immediately after `rdu-unknown-state` in the validator's global order, and because anchoring never reads global position, that insertion needs **no anchoring change at all** — only a new offender computation keyed by the new code. If a queue runs dry (copy drift), the issue degrades to a canvas-level anchor — never a crash. An additive `ref?` field on `Issue` is proposed upstream (Open question 7).
   `Advisory` is structurally identical to `Issue` (`{ code, message }`), so advisories go through **the same** `anchorIssues` — its signature is widened to a generic over `Issue | Advisory` rather than cloned into a sibling `anchorAdvisories`, because a sibling would duplicate the queue-and-zip logic that is the only interesting thing in the module.
3. **The `require-field` picker is picker-only — no free text.** A typo'd field id would author a transition that can never legally fire: a rule that looks enforced and isn't, which is exactly the lie this product exists to kill. Choices are the three built-ins (`title`, `description`, `dueDate`) plus the union of custom fields on every ticket type currently bound to this workflow. A rule whose field is no longer among the choices renders with an inline warning, not silent acceptance.
4. **Requires-parent follows the RANK, not the built-in id** — settled by the owner on 2026-08-20 (coordination doc sign-off table), overruling this plan's earlier reading. Any type defined at **or below** the deepest rank requires a parent: the built-in `sub-task` (rank 4), a workspace's own `Checklist item` at rank 4, and a `Micro step` at rank 7 — smaller work still, and so covered a fortiori. Epic/story/task-rank types are unaffected — an epic-rank custom type still sits at project root. The builder computes the flag as `rank >= DEEPEST_RANK`, importing the **same constant the engine refuses on** (Plan 3 design decision 9); it must never derive its own maximum from the loaded types, because in a workspace that has defined nothing below Task a computed max would make the builder promise that Task requires a parent while the server happily accepted one at project root — a UI describing a rule that isn't there is the exact failure this product exists to refuse. The rank-implications copy states the requirement plainly (see Pinned UI copy). Open question 6 records the settlement.
5. **Canvas layout is presentation, not truth, and is not published.** Node positions live only in the draft (auto-layout on load via a dependency-free layered BFS from `initialStateId`; drags persist for the session). The `workflow.defined` payload carries no coordinates. Persisting layout later belongs in `/v1/me/preferences` (amendment 14) — Open question 3.
6. **Ticket-type events mint a fresh entity ULID per submission; the payload id is the stable type key.** Matches Plan 3's own test convention (`entity.id` a ULID, `payload.id` = `'epic'`/`'invoice'`) and the envelope schema's ULID requirement on `entity.id`. Custom types get a ULID payload id at creation; built-ins keep their seed ids. Open question 5 flags the entity-stream consequence.
7. **Built-in ticket types: name, icon, and workflow binding are editable; id and rank are locked in the UI.** The rank ladder epic(1)/story(2)/task(3)/sub-task(4) is what Plan 3's hierarchy checks lean on; re-ranking built-ins from a settings screen is a foot-gun with no user story. The server does not enforce this lock (last-definition-wins) — UI-only, flagged in Open questions.
8. **The workflow builder ships on web (and desktop via app-core) only.** React Flow is a DOM library; RN gets no authoring canvas. Workflow authoring is admin work at a desk; the spec's mobile story (§5) is about working tickets, not authoring workflows.
9. **Advisories are a second tier and must never gate publish** (owner decision, 2026-08-26). `adviseWorkflowDef` is a separate function from `validateWorkflowDef`, and this plan keeps the separation load-bearing at exactly one place: **`selectCanPublish` is `validateWorkflowDef` emptiness and nothing else** (Task 1). It does not call `adviseWorkflowDef`, does not union the two arrays, and does not "unify" them into one `selectProblems` — an executor who does that turns every advisory into a publish blocker and breaks the template tests, which is the failure this tier exists to make impossible. A distinct type name proves nothing under structural typing, so the guarantee is proven by a planted defect instead: a draft that trips `rdu-bypassable` and nothing else renders the advisory (Task 8) **while the Publish button stays enabled and the publish succeeds** (Task 9, where `PublishControls` exists). The advisory section is visually distinct from the issues list, carries its own BEM block, and says in its own heading that it blocks nothing.
10. **Re-pointing a type's workflow leaves existing tickets where they are, and the editor says so** (owner decision, 2026-08-26 — coordination doc, *"a ticket's workflow is pinned at creation, and moved only deliberately"*). A ticket pins the workflow it was created under; changing a type's binding changes only what **new** tickets get. This is mostly ratification of what the code already does — `proj_tickets` carries its own `workflow_id`, set from `type.workflowId` in the `ticket.created` branch and never touched again, and every read path resolves per ticket — and it is safe because Plan 5 already specifies board columns as *one column per (workflow in use, state of its latest def)*, so a board holding two workflows side by side is a case the design was built for. What this plan owes it is **visibility**: an admin who re-points a type and is never told that two populations now exist is exactly the board knowing something the user does not. So the editor states the divergence with a real count (Task 11), and offers the migration.
    **The migration is not `stateMapping` and must not reuse it.** `stateMapping` is keyed *inside one workflow's version chain* — it answers "version N had this state, version N+1 does not, where do those tickets go". Across two unrelated workflows there is no chain and no shared history, so the cross-workflow map is a different object with a different lifetime: authored once, applied once, never stored on a def. It rides its own event, `ticket.workflow_rebound { toWorkflowId, toStateId }`, **owned by Plan 3** along with its refusals (chiefly: `toStateId` must be a state of the target workflow). This plan builds the authoring surface and consumes the outcome; it defines neither the event nor the rule.
    **Migration is optional and the UI must not imply otherwise.** Leaving old tickets on the outgoing workflow is a legitimate choice, not a deferred chore, so "leave them" is an affirmative button beside "move them" — never merely the absence of a click.

## Planted-defect coverage table (every `validateWorkflowDef` code)

Every code gets a component test that authors the broken def **through the canvas's own model** (the draft store the UI drives) and asserts the named issue renders in the issues panel. Two codes are unauthorable by pointer gestures because the store mints unique ids and cascades edges; they are planted through `loadDraft` — the same store entry point that cloned or previously-saved defs arrive through, so the defect is authored in the canvas's model, not injected around it.

Eleven codes, every one of which blocks publish. The one **advisory** code sits below the table, in its own row set, because it is deliberately not one of these.

| # | Issue code | Authoring route (store actions) | Test (Task 8, `validation.test.tsx`) |
|---|---|---|---|
| 1 | `no-states` | `removeState` every state | `plants no-states by deleting every state` |
| 2 | `duplicate-state-id` | `loadDraft` of a def carrying two states with one id (the store mints ULIDs, so only a loaded def can carry a duplicate) | `plants duplicate-state-id via a loaded def` |
| 3 | `no-terminal-state` | `setStateCategory('done', 'active')` | `plants no-terminal-state by recategorising the only terminal state` |
| 4 | `unknown-transition-state` | `loadDraft` of a def with a transition naming a missing state (`removeState` cascades edges, so only a loaded def can carry a dangling one) | `plants unknown-transition-state via a loaded def` |
| 5 | `duplicate-transition` | `addTransition('todo','doing')` on a def that already has that edge | `plants duplicate-transition by drawing the same edge twice` |
| 6 | `unreachable-state` | `addState()` — a fresh node with no inbound edge | `plants unreachable-state by adding an unconnected state` |
| 7 | `terminal-no-inbound` | `setStateCategory(initialStateId, 'terminal')` on a two-state def whose start has no inbound — reachable (it is the start) yet unenterable-terminal | `plants terminal-no-inbound by making the start state terminal` |
| 8 | `unknown-initial-state` | `removeState(initialStateId)` — decision 1 leaves the marker dangling | `plants unknown-initial-state by deleting the start state` |
| 9 | `empty-restrict-to` | `addRule` then `updateRule` to `{ kind: 'restrict-to' }` with everything unpicked | `plants empty-restrict-to by unpicking everyone` |
| 10 | `rdu-unknown-state` | `addRule` targeting state X, then `removeState(X)` | `plants rdu-unknown-state by deleting the watched state` |
| 11 | `rdu-unenterable-state` | `removeTransition(1)` on the kanban draft (drops `doing → todo`, so nothing enters the start state any more), then `addRule(1, { kind: 'require-different-user', thanActorOf: { to: 'todo' } })` — a four-eyes rule watching a move nothing in this version makes | `plants rdu-unenterable-state by watching a state nothing enters` |

**Advisory coverage (`adviseWorkflowDef`) — deliberately NOT in the table above, because it does not block publish:**

| # | Advisory code | Authoring route (store actions) | Tests |
|---|---|---|---|
| A1 | `rdu-bypassable` | `addTransition('todo', 'done')` on the kanban draft (a fast track that skips Doing), then `addRule(4, { kind: 'require-different-user', thanActorOf: { to: 'doing' } })` — the guarded move is reachable without ever entering the watched state | Task 8, `validation.test.tsx`: `warns about a bypassable four-eyes rule without calling it an issue` · Task 9, `publish.test.tsx`: `an advisory does not gate publish — the button stays enabled and the publish commits` |

That draft validates **clean** (`validateWorkflowDef` returns `[]`), which is the point. The Task 8 test asserts the advisory renders while the issues list still shows the all-clear; the Task 9 test mounts `IssuesPanel` beside `PublishControls` and asserts the advisory is on screen, the Publish button is enabled, and the submission commits. Without the pair, "advisories do not gate publish" is a convention rather than a guarantee.

Server-refusal planted defects (surfaced verbatim, tested in Tasks 9 and 12): `workflow-state-mapping` (stranded state), `workflow-version` (stale publish), `permission.role` (non-admin publish), plus `invalid` envelope results.

## Pinned UI copy

All user-facing strings in one place; components and tests use these character-for-character. Refusal reasons from the server are **never rephrased** — banners render `reason` verbatim.

| Where | Copy |
|---|---|
| Issues panel, clean | `No issues — this workflow can be published.` |
| Advisories section heading | `Worth a look — none of these block publishing` |
| Advisories section footer | `Advisories describe a workflow that is legal but may not do what you meant.` |
| Publish button disabled title | `Fix the issues below first.` |
| System rules panel heading | `System rules — in every workflow` |
| System rules item 1 | `Provenance on everything: every move records who made it and when. "Done" always unfolds to "marked done by X on a date".` |
| System rules item 2 | `Parents cannot outrun children: no ticket can enter a terminal state while any of its children is still open.` |
| System rules footer | `These two sit above all workflows and cannot be authored away (product design, §4).` |
| Mapping dialog heading | `Every dropped state needs a destination` |
| Mapping dialog body | `Version ${next} removes states that version ${prev} has. Publishing cannot see which tickets sit in which state, so every removed state needs a destination — occupied or not.` |
| Mapping row count | `${n} tickets sit here today` (`1 ticket sits here today`; `counting tickets…` while loading; `ticket count unavailable` when the read fails) |
| Mapping row picker label | `Send them to` |
| Mapping confirm button | `Publish with this mapping` |
| Refused banner heading | `The server refused this publish.` (ticket types: `The server refused this ticket type.`) then the `reason` verbatim, then `rule: ${rule}` |
| Invalid banner heading | `The server could not read this claim.` then `message` verbatim |
| Publish success | `Version ${version} published.` |
| Read-only banner | `You can look, not touch — only a workspace owner or admin can change workflows and ticket types.` |
| Any-state node | `Any state` + `drag from here for a from-anywhere move` |
| Empty restrict-to helper | `Pick at least one — a restriction that names nobody can never be satisfied.` |
| Unknown require-field warning | `This field is not on any ticket type bound to this workflow.` |
| rdu start-state note | `A ticket born in the start state has nobody to differ from — this rule only bites once the move to "${stateName}" has actually been performed.` |
| Rank implications | `Can sit under: ${type names, comma-joined} · or at the project root.` / no possible parents: `Top of the hierarchy — sits at the project root.` / any type at or below the deepest rank, built-in or custom: `Must sit under a parent — this is the smallest kind of work, so tickets of this type always belong to something bigger. Can sit under: ${type names}.` |
| Template gallery heading | `Start from a template` (cards carry `Use this template`; the blank card carries `Start blank`) |
| Builder screen loading / failure | `Loading workspace people and types…` / `Could not load workspace people and types — reload to try again.` |
| List screens | `Workflows` / `New workflow` / `No workflows published yet.` / `Loading workflows…` · `Ticket types` / `New ticket type` / `Loading ticket types…` · row buttons `Open` (aria `Open ${name}`) |
| Ticket-type editor | save button `Save ticket type` · success `Ticket type saved.` · built-in rank note `Built-in type — its place in the hierarchy is fixed.` |
| Workflow divergence notice (type editor, after the binding is changed) | heading `Existing tickets stay where they are` · body `${n} existing tickets of this type stay on "${outgoing}". New ones will use "${incoming}".` (`1 existing ticket of this type stays on "${outgoing}". New ones will use "${incoming}".`; `counting tickets…` while loading; `ticket count unavailable` when the read fails, and then the body reads `Existing tickets of this type stay on "${outgoing}" — we could not count how many. New ones will use "${incoming}".`) · when the count is zero: `No tickets of this type are on "${outgoing}" — nothing stays behind.` |
| Divergence notice actions | `Move them to "${incoming}"…` and `Leave them on "${outgoing}"` — two buttons, because leaving them is a choice and not the absence of one · after Leave: `Left on "${outgoing}". They keep their own board columns.` · before the type is saved: `Save the ticket type first — until it is saved, new tickets would still go to "${outgoing}".` |
| Rebind dialog heading | `Move existing tickets to "${incoming}"` |
| Rebind dialog body | `These two workflows share no history, so nothing carries across on its own: every state of "${outgoing}" needs a destination in "${incoming}". Each ticket gets its own recorded move.` |
| Rebind dialog row picker label | `Send them to` (aria `Send them to — ${state name}`) |
| Rebind dialog footer | `Leaving them is a real choice — a type can have tickets on two workflows, and the board shows each ticket under its own workflow's states.` |
| Rebind confirm / cancel | `Move these tickets` / `Leave them where they are` |
| Rebind success | `${n} tickets moved to "${incoming}".` (`1 ticket moved to "${incoming}".`) |
| Rebind refused banner | `The server refused this move.` then the `reason` verbatim, then `rule: ${rule}` |

Rule summaries (Task 2, rendered on edges and in the transition inspector):

| Rule | Summary |
|---|---|
| restrict-to | `Only ${parts joined with ', or '} may make this move.` — parts: `the assignee` / `anyone with the role ${roles joined with ' or '}` / member display names comma-joined. Empty: `Restricted to nobody — nobody may make this move.` |
| require-comment | `Must carry a comment explaining it.` |
| require-evidence | `Must carry an attachment as evidence.` |
| require-field | `Needs "${field display name}" set first.` |
| require-different-user | `Needs a second person — someone other than whoever moved this to "${state name}".` |

## File Structure

```
packages/app-core/                       # Plan 6 owns the scaffold; guard steps create it only if absent
  src/workflow-builder/
    draft-store.ts        # WorkflowDraft, DraftStore, createDraftStore, newDraft, draftFromPublished, selectors
    layout.ts             # layoutDraft (layered BFS from initialStateId), nextFreePosition, ANY_STATE_NODE_ID
    summaries.ts          # summarizeRule/summarizeRules + SummaryContext + summaryContextFor
    fields.ts             # FieldChoice, BUILTIN_FIELD_CHOICES, fieldChoicesFor (require-field picker source)
    anchor-issues.ts      # IssueAnchor, AnchoredIssue, AnchoredAdvisory, anchorIssues (per-code pairing; issues and advisories alike)
    templates.ts          # WORKFLOW_TEMPLATES (3 full payloads), cloneTemplate, draftFromTemplate
    gateway.ts            # WorkflowAuthoringGateway, WorkspaceMember, IngestResult (client-side mirror)
    fake-gateway.ts       # createFakeGateway — the in-memory test double every component test uses
    events.ts             # droppedStates, buildPublishPayload, buildWorkflowDefinedEvent, buildTicketTypeDefinedEvent
    index.ts              # barrel
    ui/
      builder-context.tsx # BuilderSession/BuilderEnvironment contexts, BuilderProvider, useDraft/useBuilderStore/useSummaryCtx
      flow-graph.ts       # toFlowGraph, connectionToTransition, node/edge id scheme
      state-node.tsx      # StateNode — name, category picker, blocked checkbox, initial marker
      any-state-node.tsx  # AnyStateNode — the distinguished '*' source
      transition-edge.tsx # TransitionEdge — plain-language rule summaries on the edge
      workflow-canvas.tsx # WorkflowCanvas — the React Flow instance
      state-inspector.tsx      # rename, set-as-start, delete
      transition-inspector.tsx # rules list + AddRuleMenu + delete transition
      rule-editors/
        rule-editor.tsx               # dispatcher by rule.kind
        add-rule-menu.tsx             # the five kinds, defaults on add
        restrict-to-editor.tsx        # assignee checkbox, role checkboxes, member picker
        require-field-editor.tsx      # field picker (built-ins + bound types), picker-only
        require-different-user-editor.tsx # inbound-target state picker + start-state note
      issues-panel.tsx    # live validateWorkflowDef issues, anchored, click-to-select + the non-blocking adviseWorkflowDef section
      system-rules-panel.tsx # the two unauthorable invariants, static (spec §4)
      publish-controls.tsx   # publish button, gating, result banners
      state-mapping-dialog.tsx # stranded states, occupancy counts, target pickers
      workflow-builder-screen.tsx # loads members/types, wires store + panels
      workflow-list-screen.tsx    # published workflows list
      template-gallery.tsx        # the 3 templates + Start blank
    ticket-types/
      rank.ts             # rankImplications
      icons.tsx           # TYPE_ICONS, TypeIcon (lucide-react map, safe fallback)
      ticket-type-list-screen.tsx
      ticket-type-editor-screen.tsx  # name/icon/rank/workflow binding + save flow + divergence notice
      workflow-rebind-dialog.tsx     # cross-workflow state map — NOT stateMapping (decision 10)
      fields-editor.tsx              # the five field kinds, select-options editor
      icon-picker.tsx
  test/
    setup.ts                          # jsdom shims React Flow needs (official recipe)
    workflow-builder/
      draft-store.test.ts, layout.test.ts, summaries.test.ts, anchor-issues.test.ts,
      templates.test.ts, events.test.ts, flow-graph.test.ts,
      canvas.test.tsx, inspectors.test.tsx, rule-editors.test.tsx,
      validation.test.tsx             # the planted-defect table lives here
      publish.test.tsx, screens.test.tsx, access.test.tsx
    ticket-types/
      rank.test.ts, ticket-types.test.tsx

packages/ui/
  src/tokens.ts           # MODIFY (or create if Plan 6 has not landed): workflow-builder colour roles

apps/web/                 # requires Plan 6's scaffold; Tasks 13–14 run after Plan 6 lands
  src/authoring/data-source-gateway.ts  # WorkflowAuthoringGateway over DataSource — the ONLY http-adjacent file
  app/w/[workspaceId]/settings/workflows/page.tsx
  app/w/[workspaceId]/settings/workflows/new/page.tsx
  app/w/[workspaceId]/settings/workflows/[workflowId]/page.tsx
  app/w/[workspaceId]/settings/ticket-types/page.tsx
  app/w/[workspaceId]/settings/ticket-types/new/page.tsx
  app/w/[workspaceId]/settings/ticket-types/[typeId]/page.tsx
  e2e/workflow-builder.spec.ts

Features.md                        # MODIFY — §10 (Task 15, same change set)
test-cases/10-workflow-builder.md  # NEW — cases 10.x (Task 15)
```

---

### Task 1: Draft store and auto-layout (framework-free core)

The canvas's single source of truth: an immutable `WorkflowDraft` behind a dependency-free store (subscribable, `useSyncExternalStore`-compatible), plus the layered auto-layout that turns a def with no coordinates into node positions. Everything here is pure TypeScript — no React, no React Flow.

**Files:**
- Create: `packages/app-core/src/workflow-builder/draft-store.ts`
- Create: `packages/app-core/src/workflow-builder/layout.ts`
- Create: `packages/app-core/src/workflow-builder/index.ts`
- Modify: `packages/app-core/src/index.ts` (re-export; create if scaffolding)
- Test: `packages/app-core/test/workflow-builder/draft-store.test.ts`
- Test: `packages/app-core/test/workflow-builder/layout.test.ts`

**Interfaces:**
- Consumes: `WorkflowDef`, `StateCategory`, `Rule`, `Issue`, `PublishedWorkflowDef`, `validateWorkflowDef`, `newUlid` from `@gisik-nokma/domain`.
- Produces (every later task builds on these exact names):
  - `type StatePosition = { x: number; y: number }`
  - `type BuilderSelection = { kind: 'none' } | { kind: 'state'; stateId: string } | { kind: 'transition'; index: number }`
  - `type WorkflowDraft = { def: WorkflowDef; positions: Record<string, StatePosition>; base: { version: number; states: { id: string; name: string }[] } | null; selection: BuilderSelection }`
  - `type DraftStore = { getState(): WorkflowDraft; subscribe(listener: () => void): () => void; actions: DraftActions }`
  - `DraftActions`: `setWorkflowName`, `addState` (returns the new id), `renameState`, `setStateCategory`, `setStateBlocked`, `setInitialState`, `removeState`, `moveState`, `addTransition`, `removeTransition`, `addRule`, `updateRule`, `removeRule`, `select`, `loadDraft`
  - `createDraftStore(initial: WorkflowDraft): DraftStore`
  - Constructors: `newDraft(name: string): WorkflowDraft` (seeds one open state named `New`, marked initial), `draftFromPublished(published: PublishedWorkflowDef): WorkflowDraft` (strips `stateMapping`, records `base`)
  - Selectors: `selectIssues(draft): Issue[]`, `selectCanPublish(draft): boolean` — **`validateWorkflowDef` emptiness and nothing else; advisories are excluded by design (decision 9)** — `selectInboundTargetIds(def): string[]`
  - From `layout.ts`: `ANY_STATE_NODE_ID = 'any-state'`, `layoutDraft(def: WorkflowDef): Record<string, StatePosition>`, `nextFreePosition(positions): StatePosition`, `COLUMN_WIDTH = 260`, `ROW_HEIGHT = 140`

- [ ] **Step 1: Guard — ensure `packages/app-core` exists and can run Vitest in jsdom**

Check whether `packages/app-core/package.json` exists (Plan 6 owns the scaffold and may have landed it). If it exists, only ensure the devDependencies and vitest pieces below are present (add what is missing, keep Plan 6's versions). If it does not exist, create:

`packages/app-core/package.json`:

```json
{
  "name": "@gisik-nokma/app-core",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@gisik-nokma/domain": "workspace:*",
    "@gisik-nokma/ui": "workspace:*",
    "@xyflow/react": "^12.8.2",
    "lucide-react": "^0.542.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.6.0",
    "@testing-library/react": "^16.3.0",
    "@testing-library/user-event": "^14.6.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^4.5.0",
    "jsdom": "^26.1.0",
    "typescript": "workspace-consistent",
    "vitest": "workspace-consistent"
  }
}
```

(`workspace-consistent` is not literal — copy the exact `typescript` and `vitest` versions from `packages/domain/package.json` so the workspace stays on one version.)

`packages/app-core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "allowImportingTsExtensions": true,
    "noEmit": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src", "test"]
}
```

`packages/app-core/vitest.config.ts`:

```ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['test/setup.ts'],
    include: ['test/**/*.test.ts', 'test/**/*.test.tsx'],
  },
});
```

`packages/app-core/test/setup.ts` (the React Flow jsdom shims — the official recipe from reactflow.dev/learn/advanced-use/testing, adapted; harmless for non-canvas tests):

```ts
import '@testing-library/jest-dom/vitest';

class ResizeObserverShim {
  private readonly callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
  }
  observe(target: Element): void {
    this.callback([{ target } as ResizeObserverEntry], this as unknown as ResizeObserver);
  }
  unobserve(): void {}
  disconnect(): void {}
}

class DOMMatrixReadOnlyShim {
  readonly m22: number;
  constructor(transform?: string) {
    const scale = transform?.match(/scale\(([\d.]+)\)/)?.[1];
    this.m22 = scale === undefined ? 1 : Number.parseFloat(scale);
  }
}

globalThis.ResizeObserver = ResizeObserverShim as unknown as typeof ResizeObserver;
(globalThis as Record<string, unknown>).DOMMatrixReadOnly = DOMMatrixReadOnlyShim;

Object.defineProperties(HTMLElement.prototype, {
  offsetHeight: {
    get(this: HTMLElement) {
      return Number.parseFloat(this.style.height) || 40;
    },
  },
  offsetWidth: {
    get(this: HTMLElement) {
      return Number.parseFloat(this.style.width) || 180;
    },
  },
});

(SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () =>
  ({ x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0, toJSON: () => ({}) }) as DOMRect;
```

If `packages/ui` does not exist yet either, create the minimal stand-in so the dependency resolves (Plan 6's real package replaces it wholesale): `packages/ui/package.json` with `{ "name": "@gisik-nokma/ui", "version": "0.0.0", "private": true, "type": "module", "exports": { ".": "./src/index.ts" } }`, `packages/ui/src/index.ts` containing `export { tokens } from './tokens.js';`, and an empty-object `packages/ui/src/tokens.ts` (`export const tokens = {} as const;` — Task 5 fills it).

Run `pnpm install`.

- [ ] **Step 2: Write the failing layout test**

Create `packages/app-core/test/workflow-builder/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { WorkflowDef } from '@gisik-nokma/domain';
import {
  ANY_STATE_NODE_ID,
  COLUMN_WIDTH,
  ROW_HEIGHT,
  layoutDraft,
  nextFreePosition,
} from '../../src/workflow-builder/layout.js';

const def: WorkflowDef = {
  id: '01J9Z0000000000000000000WF',
  version: 1,
  name: 'Layout fixture',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
    { id: 'orphan', name: 'Orphan', category: 'open' },
  ],
  transitions: [
    { from: 'todo', to: 'doing', rules: [] },
    { from: 'doing', to: 'done', rules: [] },
  ],
};

describe('layoutDraft', () => {
  it('layers states by distance from the initial state', () => {
    const positions = layoutDraft(def);
    expect(positions['todo']).toEqual({ x: COLUMN_WIDTH, y: 80 });
    expect(positions['doing']).toEqual({ x: COLUMN_WIDTH * 2, y: 80 });
    expect(positions['done']).toEqual({ x: COLUMN_WIDTH * 3, y: 80 });
  });

  it('parks states unreachable from the initial state in a final column', () => {
    const positions = layoutDraft(def);
    expect(positions['orphan']).toEqual({ x: COLUMN_WIDTH * 4, y: 80 });
  });

  it('stacks states sharing a layer vertically', () => {
    const branching: WorkflowDef = {
      ...def,
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'a', name: 'A', category: 'active' },
        { id: 'b', name: 'B', category: 'terminal' },
      ],
      transitions: [
        { from: 'todo', to: 'a', rules: [] },
        { from: 'todo', to: 'b', rules: [] },
      ],
    };
    const positions = layoutDraft(branching);
    expect(positions['a']).toEqual({ x: COLUMN_WIDTH * 2, y: 80 });
    expect(positions['b']).toEqual({ x: COLUMN_WIDTH * 2, y: 80 + ROW_HEIGHT });
  });

  it('places the any-state node to the left of everything', () => {
    expect(layoutDraft(def)[ANY_STATE_NODE_ID]).toEqual({ x: 0, y: 80 });
  });

  it('survives a def whose initialStateId names no state (dangling marker)', () => {
    const dangling = { ...def, initialStateId: 'gone' };
    const positions = layoutDraft(dangling);
    // every state still gets a position — the issues panel reports the dangling marker, layout must not crash
    for (const state of dangling.states) {
      expect(positions[state.id]).toBeDefined();
    }
  });

  it('a "*" transition does not flatten the layering', () => {
    const withStar: WorkflowDef = {
      ...def,
      transitions: [...def.transitions, { from: '*', to: 'done', rules: [] }],
    };
    expect(layoutDraft(withStar)['done']).toEqual({ x: COLUMN_WIDTH * 3, y: 80 });
  });
});

describe('nextFreePosition', () => {
  it('starts at the first column when the canvas is empty', () => {
    expect(nextFreePosition({})).toEqual({ x: COLUMN_WIDTH, y: 80 });
  });

  it('drops below the lowest existing node', () => {
    expect(nextFreePosition({ a: { x: 260, y: 80 }, b: { x: 520, y: 220 } })).toEqual({
      x: COLUMN_WIDTH,
      y: 220 + ROW_HEIGHT,
    });
  });
});
```

- [ ] **Step 3: Run the layout test to verify it fails**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/layout.test.ts`
Expected: FAIL — cannot resolve `../../src/workflow-builder/layout.js`.

- [ ] **Step 4: Implement `layout.ts`**

Create `packages/app-core/src/workflow-builder/layout.ts`:

```ts
import type { WorkflowDef } from '@gisik-nokma/domain';

export type StatePosition = { x: number; y: number };

/** The distinguished node every from-any ('*') transition draws from. */
export const ANY_STATE_NODE_ID = 'any-state';

export const COLUMN_WIDTH = 260;
export const ROW_HEIGHT = 140;
const TOP_MARGIN = 80;

/**
 * Deterministic layered layout: BFS distance from initialStateId decides the
 * column, arrival order decides the row. States the BFS never reaches (and
 * every state when the initial marker dangles) go to one final column — the
 * issues panel names the problem; layout only has to keep drawing.
 * '*' transitions are ignored for layering: they point at everything and
 * would flatten the picture into one column.
 */
export function layoutDraft(def: WorkflowDef): Record<string, StatePosition> {
  const stateIds = new Set(def.states.map((state) => state.id));
  const layerByState = new Map<string, number>();
  const queue: string[] = [];
  if (stateIds.has(def.initialStateId)) {
    layerByState.set(def.initialStateId, 0);
    queue.push(def.initialStateId);
  }
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const currentLayer = layerByState.get(current) as number;
    for (const transition of def.transitions) {
      if (transition.from !== current) continue;
      if (!stateIds.has(transition.to) || layerByState.has(transition.to)) continue;
      layerByState.set(transition.to, currentLayer + 1);
      queue.push(transition.to);
    }
  }
  const reachedLayers = [...layerByState.values()];
  const orphanLayer = reachedLayers.length === 0 ? 0 : Math.max(...reachedLayers) + 1;

  const positions: Record<string, StatePosition> = {};
  const rowsUsed = new Map<number, number>();
  for (const state of def.states) {
    const layer = layerByState.get(state.id) ?? orphanLayer;
    const row = rowsUsed.get(layer) ?? 0;
    rowsUsed.set(layer, row + 1);
    positions[state.id] = { x: (layer + 1) * COLUMN_WIDTH, y: TOP_MARGIN + row * ROW_HEIGHT };
  }
  positions[ANY_STATE_NODE_ID] = { x: 0, y: TOP_MARGIN };
  return positions;
}

/** Where a newly added state lands: first column, below everything already placed. */
export function nextFreePosition(positions: Record<string, StatePosition>): StatePosition {
  const ys = Object.values(positions).map((position) => position.y);
  return { x: COLUMN_WIDTH, y: ys.length === 0 ? TOP_MARGIN : Math.max(...ys) + ROW_HEIGHT };
}
```

- [ ] **Step 5: Run the layout test to verify it passes**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/layout.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 6: Write the failing draft-store test**

Create `packages/app-core/test/workflow-builder/draft-store.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { adviseWorkflowDef, validateWorkflowDef, type WorkflowDef } from '@gisik-nokma/domain';
import {
  createDraftStore,
  draftFromPublished,
  newDraft,
  selectCanPublish,
  selectInboundTargetIds,
  selectIssues,
} from '../../src/workflow-builder/draft-store.js';

/** A small valid def used across tests — carries initialStateId, as every def must. */
function kanbanDef(): WorkflowDef {
  return {
    id: '01J9Z0000000000000000000WF',
    version: 1,
    name: 'Kanban',
    initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'doing', name: 'Doing', category: 'active' },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: [
      { from: 'todo', to: 'doing', rules: [] },
      { from: 'doing', to: 'done', rules: [] },
    ],
  };
}

function storeWith(def: WorkflowDef) {
  const draft = draftFromPublished({ ...def });
  return createDraftStore(draft);
}

describe('newDraft', () => {
  it('seeds one open state, marked initial, and validates clean except for the missing terminal', () => {
    const draft = newDraft('My workflow');
    expect(draft.def.name).toBe('My workflow');
    expect(draft.def.version).toBe(1);
    expect(draft.def.states).toHaveLength(1);
    expect(draft.def.states[0]?.category).toBe('open');
    expect(draft.def.initialStateId).toBe(draft.def.states[0]?.id);
    expect(draft.base).toBeNull();
    expect(selectIssues(draft).map((issue) => issue.code)).toEqual(['no-terminal-state']);
  });
});

describe('draftFromPublished', () => {
  it('records the base version and states, and never carries stateMapping forward', () => {
    const draft = draftFromPublished({ ...kanbanDef(), version: 3, stateMapping: { old: 'todo' } });
    expect(draft.base).toEqual({
      version: 3,
      states: [
        { id: 'todo', name: 'To do' },
        { id: 'doing', name: 'Doing' },
        { id: 'done', name: 'Done' },
      ],
    });
    expect('stateMapping' in draft.def).toBe(false);
    expect(draft.positions['todo']).toBeDefined();
  });
});

describe('state actions', () => {
  it('addState mints a unique id, positions the node, selects it, and returns the id', () => {
    const store = storeWith(kanbanDef());
    const id = store.actions.addState({ name: 'Review', category: 'active' });
    const draft = store.getState();
    expect(draft.def.states.map((state) => state.name)).toContain('Review');
    expect(draft.positions[id]).toBeDefined();
    expect(draft.selection).toEqual({ kind: 'state', stateId: id });
  });

  it('the first state added to an empty def becomes the initial state', () => {
    const store = createDraftStore(newDraft('Empty me'));
    const only = store.getState().def.states[0]?.id as string;
    store.actions.removeState(only);
    expect(store.getState().def.states).toHaveLength(0);
    const id = store.actions.addState();
    expect(store.getState().def.initialStateId).toBe(id);
  });

  it('rename, category, blocked, and initial-state edits land in the def', () => {
    const store = storeWith(kanbanDef());
    store.actions.renameState('doing', 'In progress');
    store.actions.setStateCategory('doing', 'open');
    store.actions.setStateBlocked('doing', true);
    store.actions.setInitialState('doing');
    const def = store.getState().def;
    const doing = def.states.find((state) => state.id === 'doing');
    expect(doing).toEqual({ id: 'doing', name: 'In progress', category: 'open', blocked: true });
    expect(def.initialStateId).toBe('doing');
  });

  it('unchecking blocked removes the flag rather than storing blocked: false', () => {
    const store = storeWith(kanbanDef());
    store.actions.setStateBlocked('doing', true);
    store.actions.setStateBlocked('doing', false);
    expect('blocked' in (store.getState().def.states.find((s) => s.id === 'doing') ?? {})).toBe(false);
  });

  it('removeState cascades transitions touching the state but leaves the initial marker dangling', () => {
    const store = storeWith(kanbanDef());
    store.actions.removeState('todo');
    const def = store.getState().def;
    expect(def.states.map((state) => state.id)).toEqual(['doing', 'done']);
    expect(def.transitions).toEqual([{ from: 'doing', to: 'done', rules: [] }]);
    expect(def.initialStateId).toBe('todo'); // dangles deliberately — surfaced as unknown-initial-state
    expect(selectIssues(store.getState()).map((issue) => issue.code)).toContain('unknown-initial-state');
  });

  it('removeState leaves require-different-user references untouched', () => {
    const store = storeWith(kanbanDef());
    store.actions.addRule(1, { kind: 'require-different-user', thanActorOf: { to: 'doing' } });
    store.actions.removeState('doing');
    // both transitions cascaded away with 'doing'; re-add one carrying the rule via loadDraft instead
    const def = kanbanDef();
    def.transitions[1] = {
      from: 'doing',
      to: 'done',
      rules: [{ kind: 'require-different-user', thanActorOf: { to: 'review' } }],
    };
    const store2 = storeWith(def);
    expect(selectIssues(store2.getState()).map((issue) => issue.code)).toContain('rdu-unknown-state');
  });
});

describe('transition and rule actions', () => {
  it('addTransition appends with empty rules, including from "*"', () => {
    const store = storeWith(kanbanDef());
    store.actions.addTransition('done', 'todo');
    store.actions.addTransition('*', 'done');
    const transitions = store.getState().def.transitions;
    expect(transitions[2]).toEqual({ from: 'done', to: 'todo', rules: [] });
    expect(transitions[3]).toEqual({ from: '*', to: 'done', rules: [] });
  });

  it('addRule/updateRule/removeRule edit exactly the addressed rule', () => {
    const store = storeWith(kanbanDef());
    store.actions.addRule(0, { kind: 'require-comment' });
    store.actions.addRule(0, { kind: 'require-field', field: 'dueDate' });
    store.actions.updateRule(0, 1, { kind: 'require-field', field: 'title' });
    store.actions.removeRule(0, 0);
    expect(store.getState().def.transitions[0]?.rules).toEqual([{ kind: 'require-field', field: 'title' }]);
  });

  it('removeTransition drops the transition and clears a selection pointing at it', () => {
    const store = storeWith(kanbanDef());
    store.actions.select({ kind: 'transition', index: 1 });
    store.actions.removeTransition(1);
    expect(store.getState().def.transitions).toHaveLength(1);
    expect(store.getState().selection).toEqual({ kind: 'none' });
  });
});

describe('subscribe and selectors', () => {
  it('notifies subscribers once per action and stops after unsubscribe', () => {
    const store = storeWith(kanbanDef());
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    store.actions.renameState('todo', 'Backlog');
    unsubscribe();
    store.actions.renameState('todo', 'To do');
    expect(calls).toBe(1);
  });

  it('selectCanPublish is validateWorkflowDef emptiness', () => {
    const clean = storeWith(kanbanDef());
    expect(selectCanPublish(clean.getState())).toBe(true);
    clean.actions.setStateCategory('done', 'active');
    expect(selectCanPublish(clean.getState())).toBe(false);
  });

  it('an advisory does not gate publish — selectCanPublish ignores adviseWorkflowDef', () => {
    // a fast track that skips Doing, carrying a four-eyes rule that watches the
    // move into Doing: legal, structurally clean, and bypassable on this path
    const store = storeWith(kanbanDef());
    store.actions.addTransition('todo', 'done');
    store.actions.addRule(2, { kind: 'require-different-user', thanActorOf: { to: 'doing' } });
    const draft = store.getState();
    expect(validateWorkflowDef(draft.def)).toEqual([]);
    expect(adviseWorkflowDef(draft.def).map((advisory) => advisory.code)).toEqual(['rdu-bypassable']);
    expect(selectCanPublish(draft)).toBe(true);
  });

  it('selectInboundTargetIds lists distinct transition targets in definition order', () => {
    const store = storeWith(kanbanDef());
    store.actions.addTransition('done', 'doing');
    expect(selectInboundTargetIds(store.getState().def)).toEqual(['doing', 'done']);
  });
});
```

- [ ] **Step 7: Run the draft-store test to verify it fails**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/draft-store.test.ts`
Expected: FAIL — cannot resolve `../../src/workflow-builder/draft-store.js`.

- [ ] **Step 8: Implement `draft-store.ts`**

Create `packages/app-core/src/workflow-builder/draft-store.ts`:

```ts
import {
  newUlid,
  validateWorkflowDef,
  type Issue,
  type PublishedWorkflowDef,
  type Rule,
  type StateCategory,
  type WorkflowDef,
} from '@gisik-nokma/domain';
import { layoutDraft, nextFreePosition, type StatePosition } from './layout.js';

export type BuilderSelection =
  | { kind: 'none' }
  | { kind: 'state'; stateId: string }
  | { kind: 'transition'; index: number };

export type WorkflowDraft = {
  def: WorkflowDef;
  positions: Record<string, StatePosition>;
  /** The published version this draft edits — null for a brand-new workflow. */
  base: { version: number; states: { id: string; name: string }[] } | null;
  selection: BuilderSelection;
};

export type DraftActions = {
  setWorkflowName(name: string): void;
  addState(input?: { name?: string; category?: StateCategory }): string;
  renameState(stateId: string, name: string): void;
  setStateCategory(stateId: string, category: StateCategory): void;
  setStateBlocked(stateId: string, blocked: boolean): void;
  setInitialState(stateId: string): void;
  removeState(stateId: string): void;
  moveState(nodeId: string, position: StatePosition): void;
  addTransition(from: string, to: string): void;
  removeTransition(index: number): void;
  addRule(transitionIndex: number, rule: Rule): void;
  updateRule(transitionIndex: number, ruleIndex: number, rule: Rule): void;
  removeRule(transitionIndex: number, ruleIndex: number): void;
  select(selection: BuilderSelection): void;
  loadDraft(draft: WorkflowDraft): void;
};

export type DraftStore = {
  getState(): WorkflowDraft;
  subscribe(listener: () => void): () => void;
  actions: DraftActions;
};

export function newDraft(name: string): WorkflowDraft {
  const stateId = newUlid();
  const def: WorkflowDef = {
    id: newUlid(),
    version: 1,
    name,
    initialStateId: stateId,
    states: [{ id: stateId, name: 'New', category: 'open' }],
    transitions: [],
  };
  return { def, positions: layoutDraft(def), base: null, selection: { kind: 'none' } };
}

export function draftFromPublished(published: PublishedWorkflowDef): WorkflowDraft {
  const { stateMapping: _pastMapping, ...def } = published as PublishedWorkflowDef & {
    stateMapping?: Record<string, string>;
  };
  return {
    def,
    positions: layoutDraft(def),
    base: {
      version: published.version,
      states: published.states.map((state) => ({ id: state.id, name: state.name })),
    },
    selection: { kind: 'none' },
  };
}

export function selectIssues(draft: WorkflowDraft): Issue[] {
  return validateWorkflowDef(draft.def);
}

/**
 * Publish legality is validateWorkflowDef emptiness — advisories excluded.
 * adviseWorkflowDef is NOT called here and its Advisory[] is never unioned in:
 * an advisory is an authoring warning, and folding one into this predicate
 * would turn every warning into a publish blocker (design decision 9). The
 * issues panel renders advisories in their own section; this selector ignores
 * them, and a planted defect in validation.test.tsx keeps it honest.
 */
export function selectCanPublish(draft: WorkflowDraft): boolean {
  return selectIssues(draft).length === 0;
}

/** Distinct state ids that some transition points at — the require-different-user picker's choices. */
export function selectInboundTargetIds(def: WorkflowDef): string[] {
  const targets: string[] = [];
  for (const transition of def.transitions) {
    if (!targets.includes(transition.to)) targets.push(transition.to);
  }
  return targets;
}

export function createDraftStore(initial: WorkflowDraft): DraftStore {
  let state = initial;
  const listeners = new Set<() => void>();

  function set(next: WorkflowDraft): void {
    state = next;
    for (const listener of listeners) listener();
  }

  function setDef(def: WorkflowDef): void {
    set({ ...state, def });
  }

  function mapState(
    stateId: string,
    change: (found: WorkflowDef['states'][number]) => WorkflowDef['states'][number],
  ): void {
    setDef({
      ...state.def,
      states: state.def.states.map((candidate) => (candidate.id === stateId ? change(candidate) : candidate)),
    });
  }

  function mapTransition(
    index: number,
    change: (found: WorkflowDef['transitions'][number]) => WorkflowDef['transitions'][number],
  ): void {
    setDef({
      ...state.def,
      transitions: state.def.transitions.map((candidate, at) => (at === index ? change(candidate) : candidate)),
    });
  }

  const actions: DraftActions = {
    setWorkflowName(name) {
      setDef({ ...state.def, name });
    },
    addState(input = {}) {
      const id = newUlid();
      const def: WorkflowDef = {
        ...state.def,
        states: [
          ...state.def.states,
          { id, name: input.name ?? 'New state', category: input.category ?? 'open' },
        ],
        initialStateId: state.def.states.length === 0 ? id : state.def.initialStateId,
      };
      set({
        ...state,
        def,
        positions: { ...state.positions, [id]: nextFreePosition(state.positions) },
        selection: { kind: 'state', stateId: id },
      });
      return id;
    },
    renameState(stateId, name) {
      mapState(stateId, (found) => ({ ...found, name }));
    },
    setStateCategory(stateId, category) {
      mapState(stateId, (found) => ({ ...found, category }));
    },
    setStateBlocked(stateId, blocked) {
      mapState(stateId, (found) => {
        if (blocked) return { ...found, blocked: true };
        const { blocked: _cleared, ...rest } = found;
        return rest;
      });
    },
    setInitialState(stateId) {
      setDef({ ...state.def, initialStateId: stateId });
    },
    removeState(stateId) {
      // Cascades edges (a dangling edge cannot render) but never rewrites what the
      // author wrote elsewhere: initialStateId and require-different-user references
      // stay put and surface as unknown-initial-state / rdu-unknown-state issues.
      const { [stateId]: _gone, ...positions } = state.positions;
      set({
        ...state,
        def: {
          ...state.def,
          states: state.def.states.filter((candidate) => candidate.id !== stateId),
          transitions: state.def.transitions.filter(
            (transition) => transition.from !== stateId && transition.to !== stateId,
          ),
        },
        positions,
        selection: { kind: 'none' },
      });
    },
    moveState(nodeId, position) {
      set({ ...state, positions: { ...state.positions, [nodeId]: position } });
    },
    addTransition(from, to) {
      setDef({ ...state.def, transitions: [...state.def.transitions, { from, to, rules: [] }] });
    },
    removeTransition(index) {
      const keepSelection =
        state.selection.kind === 'transition' && state.selection.index === index
          ? ({ kind: 'none' } as const)
          : state.selection;
      set({
        ...state,
        def: { ...state.def, transitions: state.def.transitions.filter((_transition, at) => at !== index) },
        selection: keepSelection,
      });
    },
    addRule(transitionIndex, rule) {
      mapTransition(transitionIndex, (found) => ({ ...found, rules: [...found.rules, rule] }));
    },
    updateRule(transitionIndex, ruleIndex, rule) {
      mapTransition(transitionIndex, (found) => ({
        ...found,
        rules: found.rules.map((candidate, at) => (at === ruleIndex ? rule : candidate)),
      }));
    },
    removeRule(transitionIndex, ruleIndex) {
      mapTransition(transitionIndex, (found) => ({
        ...found,
        rules: found.rules.filter((_candidate, at) => at !== ruleIndex),
      }));
    },
    select(selection) {
      set({ ...state, selection });
    },
    loadDraft(draft) {
      set(draft);
    },
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    actions,
  };
}
```

- [ ] **Step 9: Create the barrels**

Create `packages/app-core/src/workflow-builder/index.ts`:

```ts
export * from './draft-store.js';
export * from './layout.js';
```

Create (or extend, if Plan 6's exists) `packages/app-core/src/index.ts`:

```ts
export * from './workflow-builder/index.js';
```

- [ ] **Step 10: Run both tests to verify they pass**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/layout.test.ts test/workflow-builder/draft-store.test.ts`
Expected: PASS (23 tests).

- [ ] **Step 11: Commit**

```bash
git add packages/app-core packages/ui pnpm-lock.yaml
git commit -m "Workflow builder core: immutable draft store and layered auto-layout; removeState cascades edges but leaves authored references dangling so validation can name them"
```

---

### Task 2: Rule summaries, field choices, and issue anchoring (pure)

The three pure translation layers between the domain contract and the canvas: rules to plain language (edge labels), ticket-type fields to picker choices, and `Issue`s to canvas anchors. Anchoring pairs per code — robust to the reconciled validator's global issue order (design decision 2).

**Files:**
- Create: `packages/app-core/src/workflow-builder/summaries.ts`
- Create: `packages/app-core/src/workflow-builder/fields.ts`
- Create: `packages/app-core/src/workflow-builder/anchor-issues.ts`
- Modify: `packages/app-core/src/workflow-builder/index.ts`
- Test: `packages/app-core/test/workflow-builder/summaries.test.ts`
- Test: `packages/app-core/test/workflow-builder/anchor-issues.test.ts`

**Interfaces:**
- Consumes: `Rule`, `WorkflowDef`, `Issue`, `Advisory`, `TicketTypeDef` from `@gisik-nokma/domain`.
- Produces:
  - `type SummaryContext = { stateName(stateId: string): string; memberName(userId: string): string; fieldName(fieldId: string): string }` (each falls back to the raw id when unknown)
  - `summarizeRule(rule: Rule, ctx: SummaryContext): string`, `summarizeRules(rules: Rule[], ctx: SummaryContext): string[]`
  - `summaryContextFor(def: WorkflowDef, options: { memberNames?: ReadonlyMap<string, string>; fields?: readonly { id: string; name: string }[] }): SummaryContext`
  - `type FieldChoice = { id: string; name: string; source: string }`, `BUILTIN_FIELD_CHOICES` (title/description/dueDate, source `Built-in`), `fieldChoicesFor(boundTypes: readonly TicketTypeDef[]): FieldChoice[]`
  - `type IssueAnchor = { kind: 'workflow' } | { kind: 'state'; stateId: string } | { kind: 'transition'; index: number }`
  - `type AnchoredIssue = Issue & { anchor: IssueAnchor }`, `type AnchoredAdvisory = Advisory & { anchor: IssueAnchor }`
  - `anchorIssues<T extends Issue | Advisory>(def: WorkflowDef, issues: readonly T[]): (T & { anchor: IssueAnchor })[]` — **one machinery for both tiers.** `Advisory` is structurally identical to `Issue`, so a sibling `anchorAdvisories` would clone the queue-and-zip logic for no gain; the parameter is widened to a generic instead (decision 2). The offender queues cover eleven issue codes plus the one advisory code; a code the map does not know degrades to a canvas anchor, so the module never crashes on a code it has not heard of.

- [ ] **Step 1: Write the failing summaries test**

Create `packages/app-core/test/workflow-builder/summaries.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { TicketTypeDef, WorkflowDef } from '@gisik-nokma/domain';
import { BUILTIN_FIELD_CHOICES, fieldChoicesFor } from '../../src/workflow-builder/fields.js';
import { summarizeRule, summaryContextFor } from '../../src/workflow-builder/summaries.js';

const def: WorkflowDef = {
  id: '01J9Z0000000000000000000WF',
  version: 1,
  name: 'Fixture',
  initialStateId: 'draft',
  states: [
    { id: 'draft', name: 'Draft', category: 'open' },
    { id: 'submitted', name: 'Submitted', category: 'active' },
    { id: 'approved', name: 'Approved', category: 'terminal' },
  ],
  transitions: [
    { from: 'draft', to: 'submitted', rules: [] },
    { from: 'submitted', to: 'approved', rules: [] },
  ],
};

const ctx = summaryContextFor(def, {
  memberNames: new Map([
    ['01J9ZMEMBER00000000000000A', 'Asha'],
    ['01J9ZMEMBER00000000000000B', 'Bikram'],
  ]),
  fields: [{ id: 'dueDate', name: 'Due date' }],
});

describe('summarizeRule', () => {
  it('restrict-to joins assignee, roles, and named people', () => {
    expect(
      summarizeRule(
        {
          kind: 'restrict-to',
          assignee: true,
          roles: ['admin', 'owner'],
          userIds: ['01J9ZMEMBER00000000000000A', '01J9ZMEMBER00000000000000B'],
        },
        ctx,
      ),
    ).toBe('Only the assignee, or anyone with the role admin or owner, or Asha, Bikram may make this move.');
  });

  it('an empty restrict-to says so honestly', () => {
    expect(summarizeRule({ kind: 'restrict-to' }, ctx)).toBe(
      'Restricted to nobody — nobody may make this move.',
    );
  });

  it('require-comment and require-evidence are fixed copy', () => {
    expect(summarizeRule({ kind: 'require-comment' }, ctx)).toBe('Must carry a comment explaining it.');
    expect(summarizeRule({ kind: 'require-evidence' }, ctx)).toBe('Must carry an attachment as evidence.');
  });

  it('require-field uses the field display name', () => {
    expect(summarizeRule({ kind: 'require-field', field: 'dueDate' }, ctx)).toBe('Needs "Due date" set first.');
  });

  it('require-different-user names the watched state', () => {
    expect(
      summarizeRule({ kind: 'require-different-user', thanActorOf: { to: 'submitted' } }, ctx),
    ).toBe('Needs a second person — someone other than whoever moved this to "Submitted".');
  });

  it('unknown ids fall back to the raw id rather than crashing', () => {
    expect(summarizeRule({ kind: 'require-field', field: 'ghost' }, ctx)).toBe('Needs "ghost" set first.');
    expect(
      summarizeRule({ kind: 'require-different-user', thanActorOf: { to: 'gone' } }, ctx),
    ).toBe('Needs a second person — someone other than whoever moved this to "gone".');
  });
});

describe('fieldChoicesFor', () => {
  it('starts from the built-ins', () => {
    expect(fieldChoicesFor([])).toEqual(BUILTIN_FIELD_CHOICES.map((choice) => ({ ...choice })));
  });

  it('appends the bound types custom fields, first definition winning duplicates', () => {
    const invoice: TicketTypeDef = {
      id: '01J9ZTYPE000000000000000IN',
      name: 'Invoice',
      icon: 'receipt',
      rank: 3,
      workflowId: '01J9Z0000000000000000000WF',
      fields: [{ id: 'amount', name: 'Invoice amount', type: 'number' }],
    };
    const filing: TicketTypeDef = {
      ...invoice,
      id: '01J9ZTYPE000000000000000FL',
      name: 'Filing',
      fields: [
        { id: 'amount', name: 'Late fee', type: 'number' },
        { id: 'authority', name: 'Authority', type: 'text' },
      ],
    };
    const choices = fieldChoicesFor([invoice, filing]);
    expect(choices.filter((choice) => choice.id === 'amount')).toEqual([
      { id: 'amount', name: 'Invoice amount', source: 'Invoice' },
    ]);
    expect(choices.find((choice) => choice.id === 'authority')).toEqual({
      id: 'authority',
      name: 'Authority',
      source: 'Filing',
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/summaries.test.ts`
Expected: FAIL — cannot resolve `../../src/workflow-builder/fields.js`.

- [ ] **Step 3: Implement `fields.ts` and `summaries.ts`**

Create `packages/app-core/src/workflow-builder/fields.ts`:

```ts
import type { TicketTypeDef } from '@gisik-nokma/domain';

export type FieldChoice = { id: string; name: string; source: string };

/** Display names for Plan 3's BUILTIN_FIELD_IDS — every ticket carries these. */
export const BUILTIN_FIELD_CHOICES: readonly FieldChoice[] = [
  { id: 'title', name: 'Title', source: 'Built-in' },
  { id: 'description', name: 'Description', source: 'Built-in' },
  { id: 'dueDate', name: 'Due date', source: 'Built-in' },
];

/**
 * The require-field picker's universe: built-ins plus the union of custom
 * fields on every ticket type bound to this workflow. Picker-only by design —
 * a free-typed field id would author a rule that can never legally fire.
 */
export function fieldChoicesFor(boundTypes: readonly TicketTypeDef[]): FieldChoice[] {
  const choices: FieldChoice[] = BUILTIN_FIELD_CHOICES.map((choice) => ({ ...choice }));
  const seen = new Set(choices.map((choice) => choice.id));
  for (const type of boundTypes) {
    for (const field of type.fields) {
      if (seen.has(field.id)) continue;
      seen.add(field.id);
      choices.push({ id: field.id, name: field.name, source: type.name });
    }
  }
  return choices;
}
```

Create `packages/app-core/src/workflow-builder/summaries.ts`:

```ts
import type { Rule, WorkflowDef } from '@gisik-nokma/domain';

export type SummaryContext = {
  stateName(stateId: string): string;
  memberName(userId: string): string;
  fieldName(fieldId: string): string;
};

export function summaryContextFor(
  def: WorkflowDef,
  options: {
    memberNames?: ReadonlyMap<string, string>;
    fields?: readonly { id: string; name: string }[];
  } = {},
): SummaryContext {
  const stateNames = new Map(def.states.map((state) => [state.id, state.name]));
  const fieldNames = new Map((options.fields ?? []).map((field) => [field.id, field.name]));
  return {
    stateName: (stateId) => stateNames.get(stateId) ?? stateId,
    memberName: (userId) => options.memberNames?.get(userId) ?? userId,
    fieldName: (fieldId) => fieldNames.get(fieldId) ?? fieldId,
  };
}

/** Plain-language rule summaries — rendered on edges and in the transition inspector. */
export function summarizeRule(rule: Rule, ctx: SummaryContext): string {
  switch (rule.kind) {
    case 'restrict-to': {
      const parts: string[] = [];
      if (rule.assignee === true) parts.push('the assignee');
      if (rule.roles !== undefined && rule.roles.length > 0) {
        parts.push(`anyone with the role ${rule.roles.join(' or ')}`);
      }
      if (rule.userIds !== undefined && rule.userIds.length > 0) {
        parts.push(rule.userIds.map((userId) => ctx.memberName(userId)).join(', '));
      }
      if (parts.length === 0) return 'Restricted to nobody — nobody may make this move.';
      return `Only ${parts.join(', or ')} may make this move.`;
    }
    case 'require-comment':
      return 'Must carry a comment explaining it.';
    case 'require-evidence':
      return 'Must carry an attachment as evidence.';
    case 'require-field':
      return `Needs "${ctx.fieldName(rule.field)}" set first.`;
    case 'require-different-user':
      return `Needs a second person — someone other than whoever moved this to "${ctx.stateName(rule.thanActorOf.to)}".`;
  }
}

export function summarizeRules(rules: Rule[], ctx: SummaryContext): string[] {
  return rules.map((rule) => summarizeRule(rule, ctx));
}
```

- [ ] **Step 4: Run the summaries test to verify it passes**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/summaries.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Write the failing anchoring test**

Create `packages/app-core/test/workflow-builder/anchor-issues.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { adviseWorkflowDef, validateWorkflowDef, type WorkflowDef } from '@gisik-nokma/domain';
import { anchorIssues } from '../../src/workflow-builder/anchor-issues.js';

function base(): WorkflowDef {
  return {
    id: '01J9Z0000000000000000000WF',
    version: 1,
    name: 'Anchor fixture',
    initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'doing', name: 'Doing', category: 'active' },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: [
      { from: 'todo', to: 'doing', rules: [] },
      { from: 'doing', to: 'done', rules: [] },
    ],
  };
}

/** Validate then anchor — the panel's exact pipeline. */
function anchored(def: WorkflowDef) {
  return anchorIssues(def, validateWorkflowDef(def));
}

function anchorOf(def: WorkflowDef, code: string) {
  return anchored(def).find((issue) => issue.code === code)?.anchor;
}

/** Advise then anchor — the panel's other pipeline, through the same function. */
function advisoryAnchorOf(def: WorkflowDef, code: string) {
  return anchorIssues(def, adviseWorkflowDef(def)).find((advisory) => advisory.code === code)?.anchor;
}

describe('anchorIssues', () => {
  it('whole-workflow codes anchor to the canvas', () => {
    expect(anchorOf({ ...base(), states: [], transitions: [] }, 'no-states')).toEqual({ kind: 'workflow' });
    const noTerminal = base();
    noTerminal.states[2] = { id: 'done', name: 'Done', category: 'active' };
    expect(anchorOf(noTerminal, 'no-terminal-state')).toEqual({ kind: 'workflow' });
    expect(anchorOf({ ...base(), initialStateId: 'gone' }, 'unknown-initial-state')).toEqual({
      kind: 'workflow',
    });
  });

  it('duplicate-state-id anchors to the first occurrence of the duplicated id', () => {
    const def = base();
    def.states = [...def.states, { id: 'doing', name: 'Doing again', category: 'active' }];
    expect(anchorOf(def, 'duplicate-state-id')).toEqual({ kind: 'state', stateId: 'doing' });
  });

  it('unknown-transition-state anchors to the offending transition', () => {
    const def = base();
    def.transitions = [...def.transitions, { from: 'doing', to: 'ghost', rules: [] }];
    expect(anchorOf(def, 'unknown-transition-state')).toEqual({ kind: 'transition', index: 2 });
  });

  it('duplicate-transition anchors to the second copy of the edge', () => {
    const def = base();
    def.transitions = [...def.transitions, { from: 'todo', to: 'doing', rules: [] }];
    expect(anchorOf(def, 'duplicate-transition')).toEqual({ kind: 'transition', index: 2 });
  });

  it('unreachable-state and terminal-no-inbound anchor to the state', () => {
    const def = base();
    def.states = [...def.states, { id: 'island', name: 'Island', category: 'open' }];
    expect(anchorOf(def, 'unreachable-state')).toEqual({ kind: 'state', stateId: 'island' });

    const startTerminal: WorkflowDef = {
      ...base(),
      states: [
        { id: 'todo', name: 'To do', category: 'terminal' },
        { id: 'doing', name: 'Doing', category: 'active' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
    };
    expect(anchorOf(startTerminal, 'terminal-no-inbound')).toEqual({ kind: 'state', stateId: 'todo' });
  });

  it('rule-level codes anchor to their transition', () => {
    const def = base();
    def.transitions[0] = { from: 'todo', to: 'doing', rules: [{ kind: 'restrict-to' }] };
    expect(anchorOf(def, 'empty-restrict-to')).toEqual({ kind: 'transition', index: 0 });

    const rdu = base();
    rdu.transitions[1] = {
      from: 'doing',
      to: 'done',
      rules: [{ kind: 'require-different-user', thanActorOf: { to: 'ghost' } }],
    };
    expect(anchorOf(rdu, 'rdu-unknown-state')).toEqual({ kind: 'transition', index: 1 });

    // nothing in this def enters 'todo' (it is only the start), so a rule
    // watching the move into it can never fire — the eleventh code
    const unenterable = base();
    unenterable.transitions[1] = {
      from: 'doing',
      to: 'done',
      rules: [{ kind: 'require-different-user', thanActorOf: { to: 'todo' } }],
    };
    expect(anchorOf(unenterable, 'rdu-unenterable-state')).toEqual({ kind: 'transition', index: 1 });
  });

  it('the rdu-bypassable advisory anchors to the transition carrying the rule', () => {
    const fastTrack = base();
    fastTrack.transitions = [
      ...fastTrack.transitions,
      {
        from: 'todo',
        to: 'done',
        rules: [{ kind: 'require-different-user', thanActorOf: { to: 'doing' } }],
      },
    ];
    // the fast track is clean by validateWorkflowDef's lights — the warning
    // lives in the other tier, and anchors through the same machinery
    expect(validateWorkflowDef(fastTrack)).toEqual([]);
    expect(advisoryAnchorOf(fastTrack, 'rdu-bypassable')).toEqual({ kind: 'transition', index: 2 });
  });

  it('two issues of one code pair with offenders in definition order', () => {
    const def = base();
    def.states = [
      ...def.states,
      { id: 'islandA', name: 'Island A', category: 'open' },
      { id: 'islandB', name: 'Island B', category: 'open' },
    ];
    const anchors = anchored(def)
      .filter((issue) => issue.code === 'unreachable-state')
      .map((issue) => issue.anchor);
    expect(anchors).toEqual([
      { kind: 'state', stateId: 'islandA' },
      { kind: 'state', stateId: 'islandB' },
    ]);
  });

  it('an issue whose offender cannot be recomputed degrades to the canvas, never crashes', () => {
    const anchoredIssues = anchorIssues(base(), [{ code: 'unreachable-state', message: 'drifted copy' }]);
    expect(anchoredIssues).toEqual([
      { code: 'unreachable-state', message: 'drifted copy', anchor: { kind: 'workflow' } },
    ]);
  });

  it('every issue from a many-defect def gets some anchor', () => {
    const def = base();
    def.initialStateId = 'gone';
    def.states = [...def.states, { id: 'doing', name: 'Doing twice', category: 'active' }];
    def.transitions = [...def.transitions, { from: 'ghost', to: 'done', rules: [] }];
    const all = anchored(def);
    expect(all.length).toBe(validateWorkflowDef(def).length);
    for (const issue of all) {
      expect(issue.anchor).toBeDefined();
    }
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/anchor-issues.test.ts`
Expected: FAIL — cannot resolve `../../src/workflow-builder/anchor-issues.js`.

- [ ] **Step 7: Implement `anchor-issues.ts`**

Create `packages/app-core/src/workflow-builder/anchor-issues.ts`:

```ts
import type { Advisory, Issue, WorkflowDef } from '@gisik-nokma/domain';

export type IssueAnchor =
  | { kind: 'workflow' }
  | { kind: 'state'; stateId: string }
  | { kind: 'transition'; index: number };

export type AnchoredIssue = Issue & { anchor: IssueAnchor };
export type AnchoredAdvisory = Advisory & { anchor: IssueAnchor };

const CANVAS_ANCHOR: IssueAnchor = { kind: 'workflow' };

/**
 * Issue carries no structural pointer, so anchors are recomputed here and
 * paired per code: for each code we rebuild the offender list in definition
 * order (mirroring validateWorkflowDef's documented per-code order) and zip
 * it against that code's issues in order. Pairing per code — never by global
 * position — keeps anchoring correct wherever the reconciled validator slots
 * a code in its overall ordering; that is why Plan 2 inserting
 * rdu-unenterable-state after rdu-unknown-state costs nothing here beyond one
 * more offender computation. A dry queue degrades to a canvas anchor.
 *
 * Advisory is structurally identical to Issue, so both tiers come through this
 * one function; the generic keeps the caller's element type on the way out
 * instead of flattening an Advisory into an AnchoredIssue.
 */
export function anchorIssues<T extends Issue | Advisory>(
  def: WorkflowDef,
  issues: readonly T[],
): (T & { anchor: IssueAnchor })[] {
  const queues = new Map<string, IssueAnchor[]>([
    ['duplicate-state-id', duplicateStateAnchors(def)],
    ['unknown-transition-state', unknownTransitionStateAnchors(def)],
    ['duplicate-transition', duplicateTransitionAnchors(def)],
    ['unreachable-state', unreachableStateAnchors(def)],
    ['terminal-no-inbound', terminalNoInboundAnchors(def)],
    ['empty-restrict-to', ruleAnchors(def, isEmptyRestrictTo)],
    ['rdu-unknown-state', ruleAnchors(def, (rule) => isRduUnknown(def, rule))],
    ['rdu-unenterable-state', ruleAnchors(def, (rule) => isRduUnenterable(def, rule))],
    // the advisory tier — same offender shape (the transition carrying the rule)
    ['rdu-bypassable', ruleAnchors(def, (rule, transition) => isRduBypassable(def, rule, transition))],
  ]);
  const consumed = new Map<string, number>();
  return issues.map((issue) => {
    const queue = queues.get(issue.code);
    if (queue === undefined) return { ...issue, anchor: CANVAS_ANCHOR };
    const at = consumed.get(issue.code) ?? 0;
    consumed.set(issue.code, at + 1);
    return { ...issue, anchor: queue[at] ?? CANVAS_ANCHOR };
  });
}

function duplicateStateAnchors(def: WorkflowDef): IssueAnchor[] {
  const counts = new Map<string, number>();
  for (const state of def.states) counts.set(state.id, (counts.get(state.id) ?? 0) + 1);
  const anchors: IssueAnchor[] = [];
  const reported = new Set<string>();
  for (const state of def.states) {
    if ((counts.get(state.id) ?? 0) > 1 && !reported.has(state.id)) {
      reported.add(state.id);
      anchors.push({ kind: 'state', stateId: state.id });
    }
  }
  return anchors;
}

function unknownTransitionStateAnchors(def: WorkflowDef): IssueAnchor[] {
  const stateIds = new Set(def.states.map((state) => state.id));
  const anchors: IssueAnchor[] = [];
  def.transitions.forEach((transition, index) => {
    if (transition.from !== '*' && !stateIds.has(transition.from)) anchors.push({ kind: 'transition', index });
    if (!stateIds.has(transition.to)) anchors.push({ kind: 'transition', index });
  });
  return anchors;
}

function duplicateTransitionAnchors(def: WorkflowDef): IssueAnchor[] {
  const seen = new Set<string>();
  const anchors: IssueAnchor[] = [];
  def.transitions.forEach((transition, index) => {
    const key = `${transition.from} ${transition.to}`;
    if (seen.has(key)) anchors.push({ kind: 'transition', index });
    seen.add(key);
  });
  return anchors;
}

/**
 * States reachable from initialStateId. `avoiding` closes one state off — the
 * rdu-bypassable question is "can the guarded move be reached without ever
 * entering the watched state?", which is this walk with that state removed.
 */
function reachableStateIds(def: WorkflowDef, avoiding?: string): Set<string> {
  const stateIds = new Set(def.states.map((state) => state.id));
  const reachable = new Set<string>();
  if (stateIds.has(def.initialStateId)) reachable.add(def.initialStateId);
  let grew = true;
  while (grew) {
    grew = false;
    for (const transition of def.transitions) {
      if (transition.to === avoiding) continue;
      if (!stateIds.has(transition.to) || reachable.has(transition.to)) continue;
      const fromReachable =
        transition.from === '*' ? reachable.size > 0 : reachable.has(transition.from);
      if (fromReachable) {
        reachable.add(transition.to);
        grew = true;
      }
    }
  }
  return reachable;
}

function unreachableStateAnchors(def: WorkflowDef): IssueAnchor[] {
  const reachable = reachableStateIds(def);
  return def.states
    .filter((state) => !reachable.has(state.id))
    .map((state) => ({ kind: 'state', stateId: state.id }) as IssueAnchor);
}

function terminalNoInboundAnchors(def: WorkflowDef): IssueAnchor[] {
  return def.states
    .filter((state) => state.category === 'terminal')
    .filter((state) => {
      const hasInbound = def.transitions.some((transition) => {
        if (transition.to !== state.id) return false;
        if (transition.from === state.id) return false; // a self-loop is not a way in
        if (transition.from === '*') return def.states.length > 1; // '*' counts only with company
        return true;
      });
      return !hasInbound;
    })
    .map((state) => ({ kind: 'state', stateId: state.id }) as IssueAnchor);
}

type DefRule = WorkflowDef['transitions'][number]['rules'][number];
type DefTransition = WorkflowDef['transitions'][number];

function ruleAnchors(
  def: WorkflowDef,
  offending: (rule: DefRule, transition: DefTransition) => boolean,
): IssueAnchor[] {
  const anchors: IssueAnchor[] = [];
  def.transitions.forEach((transition, index) => {
    for (const rule of transition.rules) {
      if (offending(rule, transition)) anchors.push({ kind: 'transition', index });
    }
  });
  return anchors;
}

function isEmptyRestrictTo(rule: DefRule): boolean {
  return (
    rule.kind === 'restrict-to' &&
    rule.assignee !== true &&
    (rule.roles === undefined || rule.roles.length === 0) &&
    (rule.userIds === undefined || rule.userIds.length === 0)
  );
}

function isRduUnknown(def: WorkflowDef, rule: DefRule): boolean {
  return (
    rule.kind === 'require-different-user' &&
    !def.states.some((state) => state.id === rule.thanActorOf.to)
  );
}

function someTransitionEnters(def: WorkflowDef, stateId: string): boolean {
  return def.transitions.some((transition) => transition.to === stateId);
}

/** The watched state exists but nothing moves into it — the rule can never fire. */
function isRduUnenterable(def: WorkflowDef, rule: DefRule): boolean {
  return (
    rule.kind === 'require-different-user' &&
    def.states.some((state) => state.id === rule.thanActorOf.to) &&
    !someTransitionEnters(def, rule.thanActorOf.to)
  );
}

/**
 * The advisory offender rule (Plan 2 owns the authoritative algorithm; this is
 * the recomputation anchoring needs, per decision 2). The guarded transition is
 * reachable from initialStateId without ever entering the watched state, so on
 * that path there is no earlier performer to differ from. Suppressed when the
 * watched state is unknown or unenterable — an error already fired for the
 * same rule, and the builder does not stack a warning on top of it.
 */
function isRduBypassable(def: WorkflowDef, rule: DefRule, transition: DefTransition): boolean {
  if (rule.kind !== 'require-different-user') return false;
  const watched = rule.thanActorOf.to;
  if (!def.states.some((state) => state.id === watched)) return false;
  if (!someTransitionEnters(def, watched)) return false;
  if (transition.from === '*') return true; // a from-anywhere move is reachable by definition
  return reachableStateIds(def, watched).has(transition.from);
}
```

- [ ] **Step 8: Run to verify it passes, then update the barrel**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/anchor-issues.test.ts`
Expected: PASS (10 tests).

Add to `packages/app-core/src/workflow-builder/index.ts`:

```ts
export * from './summaries.js';
export * from './fields.js';
export * from './anchor-issues.js';
```

- [ ] **Step 9: Commit**

```bash
git add packages/app-core/src/workflow-builder packages/app-core/test/workflow-builder
git commit -m "Plain-language rule summaries, field-picker choices, and per-code issue anchoring — anchors pair by code so the validator's global order can shift without mislabelling the canvas, and advisories ride the same machinery without joining the issue list"
```

---

### Task 3: The template gallery's three workflows (full payloads)

Templates are ordinary pre-authored workflows, cloned and edited like any other (spec §4 — nothing special about them). The three defs below are the complete payloads; the gallery clones one into the canvas with a fresh workflow id. `errand-with-waits` models waiting-on-counterparty as **blocked-flagged active states** (amendment 9 — the attention strip's blocked bucket reads the flag); `approval-chain` carries the four-eyes `require-different-user` rule.

**Simple kanban is not declared here — it is imported.** Its canonical definition lives in `@gisik-nokma/domain` as `SIMPLE_KANBAN_TEMPLATE`, created by Plan 4 (owner decision 2026-08-26, coordination doc: "A new workspace can hold a ticket the moment it exists"). Every workspace is *founded* on a clone of it, so the server needs it before this plan exists at all, and Plan 4 executes first. The gallery's Kanban card carries that same object as its `def` — not a copy that resembles it — and a test asserts the identity. **Only Kanban moved**, and only because the server also needs it: `errand-with-waits` and `approval-chain` are gallery-only, nothing outside this package consumes them, and hoisting them into the domain package to keep the three tidy would push client authoring content into the package the rule engine depends on for no reader's benefit. Two copies of one workflow is the drift this series keeps finding; three homes for one concept is the opposite mistake.

**Files:**
- Create: `packages/app-core/src/workflow-builder/templates.ts`
- Modify: `packages/app-core/src/workflow-builder/index.ts`
- Test: `packages/app-core/test/workflow-builder/templates.test.ts`

**Interfaces:**
- Consumes: `WorkflowDef`, `newUlid`, `validateWorkflowDef`, `adviseWorkflowDef`, **`SIMPLE_KANBAN_TEMPLATE`** (Plan 4) from `@gisik-nokma/domain`; `layoutDraft`, `WorkflowDraft` from Task 1.
- Produces: `type WorkflowTemplate = { id: 'simple-kanban' | 'errand-with-waits' | 'approval-chain'; name: string; tagline: string; def: Omit<WorkflowDef, 'id' | 'version'> }`; `WORKFLOW_TEMPLATES: readonly WorkflowTemplate[]` (in that order); `cloneTemplate(template: WorkflowTemplate): WorkflowDef` (fresh ULID id, version 1); `draftFromTemplate(template: WorkflowTemplate): WorkflowDraft`.
- **Guard step:** if `SIMPLE_KANBAN_TEMPLATE` is not yet exported from `@gisik-nokma/domain` (Plan 4 not landed), create `packages/domain/src/workflows/simple-kanban.ts` exactly as Plan 4 Task 5 Step 6 specifies and export it from the barrel — do NOT declare a local Kanban payload here and "reconcile later", which is the drift this arrangement exists to prevent.

- [ ] **Step 1: Write the failing template test**

Create `packages/app-core/test/workflow-builder/templates.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  SIMPLE_KANBAN_TEMPLATE,
  adviseWorkflowDef,
  simpleKanbanWorkflowDef,
  validateWorkflowDef,
} from '@gisik-nokma/domain';
import {
  WORKFLOW_TEMPLATES,
  cloneTemplate,
  draftFromTemplate,
} from '../../src/workflow-builder/templates.js';

describe('WORKFLOW_TEMPLATES', () => {
  it('the gallery Kanban IS the workspace-bootstrap default — one home, not two copies', () => {
    const kanban = WORKFLOW_TEMPLATES.find((template) => template.id === 'simple-kanban')!;
    // Identity, not equality: a structural check would pass on a second copy
    // that had drifted into agreement, and go on passing until it drifted out.
    expect(kanban.def).toBe(SIMPLE_KANBAN_TEMPLATE);
    // …and what Plan 4 founds every workspace with is that object plus an id
    // and version 1, so the card an admin picks in the gallery and the workflow
    // their workspace already had are the same workflow.
    const { id: _id, version, ...founded } = simpleKanbanWorkflowDef('01JBOOTSTRAPWORKFLOW000001');
    expect(version).toBe(1);
    expect(founded).toEqual(kanban.def);
  });

  it('offers exactly simple-kanban, errand-with-waits, approval-chain', () => {
    expect(WORKFLOW_TEMPLATES.map((template) => template.id)).toEqual([
      'simple-kanban',
      'errand-with-waits',
      'approval-chain',
    ]);
  });

  it('every template clones into a def that validates clean AND warns about nothing', () => {
    for (const template of WORKFLOW_TEMPLATES) {
      const def = cloneTemplate(template);
      expect(validateWorkflowDef(def), `template ${template.id}`).toEqual([]);
      // a shipped template that greets the author with a warning is a shipped
      // template that is wrong; caught here, at build time, not in the gallery
      expect(adviseWorkflowDef(def), `template ${template.id} advisories`).toEqual([]);
      expect(def.version).toBe(1);
      expect(def.states.some((state) => state.category === 'terminal')).toBe(true);
    }
  });

  it('cloning twice mints two distinct workflow ids and never shares state arrays', () => {
    const template = WORKFLOW_TEMPLATES[0]!;
    const first = cloneTemplate(template);
    const second = cloneTemplate(template);
    expect(first.id).not.toBe(second.id);
    first.states[0]!.name = 'Mutated';
    expect(second.states[0]!.name).not.toBe('Mutated');
    expect(template.def.states[0]!.name).not.toBe('Mutated');
  });

  it('errand-with-waits flags exactly its two waiting states as blocked', () => {
    const errand = WORKFLOW_TEMPLATES.find((template) => template.id === 'errand-with-waits')!;
    const blockedIds = errand.def.states.filter((state) => state.blocked === true).map((state) => state.id);
    expect(blockedIds).toEqual(['waiting-counterparty', 'waiting-documents']);
    for (const state of errand.def.states.filter((candidate) => candidate.blocked === true)) {
      expect(state.category).toBe('active');
    }
  });

  it('approval-chain requires a second person on the approve move', () => {
    const approval = WORKFLOW_TEMPLATES.find((template) => template.id === 'approval-chain')!;
    const approve = approval.def.transitions.find((transition) => transition.to === 'approved')!;
    expect(approve.rules).toEqual([{ kind: 'require-different-user', thanActorOf: { to: 'submitted' } }]);
  });

  it('draftFromTemplate produces a positioned, unselected, baseless draft', () => {
    const draft = draftFromTemplate(WORKFLOW_TEMPLATES[1]!);
    expect(draft.base).toBeNull();
    expect(draft.selection).toEqual({ kind: 'none' });
    for (const state of draft.def.states) {
      expect(draft.positions[state.id]).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/templates.test.ts`
Expected: FAIL — cannot resolve `../../src/workflow-builder/templates.js`.

- [ ] **Step 3: Implement `templates.ts` — the three full payloads**

Create `packages/app-core/src/workflow-builder/templates.ts`:

```ts
import { SIMPLE_KANBAN_TEMPLATE, newUlid, type WorkflowDef } from '@gisik-nokma/domain';
import { layoutDraft } from './layout.js';
import type { WorkflowDraft } from './draft-store.js';

export type WorkflowTemplate = {
  id: 'simple-kanban' | 'errand-with-waits' | 'approval-chain';
  name: string;
  tagline: string;
  def: Omit<WorkflowDef, 'id' | 'version'>;
};

/**
 * Pre-authored, ordinary workflows (spec §4). Cloned — never referenced —
 * so an edited copy can never bleed back into the gallery.
 *
 * The Kanban card's `def` is `SIMPLE_KANBAN_TEMPLATE` itself, imported from
 * `@gisik-nokma/domain`: the server founds every workspace on that same object
 * (Plan 4), and a gallery copy that merely resembled it would diverge the first
 * time either side was edited, silently. The other two are gallery-only —
 * nothing outside this package consumes them.
 */
export const WORKFLOW_TEMPLATES: readonly WorkflowTemplate[] = [
  {
    id: 'simple-kanban',
    name: 'Simple kanban',
    tagline: 'To do, doing, done. No rules — anything moves along the arrows.',
    def: SIMPLE_KANBAN_TEMPLATE,
  },
  {
    id: 'errand-with-waits',
    name: 'Errand with waits',
    tagline:
      'Real-world errands that stall on other people. Waiting states are blocked-flagged so the attention strip sees them; finishing takes evidence.',
    def: {
      name: 'Errand with waits',
      initialStateId: 'not-started',
      states: [
        { id: 'not-started', name: 'Not started', category: 'open' },
        { id: 'in-progress', name: 'In progress', category: 'active' },
        { id: 'waiting-counterparty', name: 'Waiting on counterparty', category: 'active', blocked: true },
        { id: 'waiting-documents', name: 'Waiting on documents', category: 'active', blocked: true },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [
        { from: 'not-started', to: 'in-progress', rules: [] },
        { from: 'in-progress', to: 'waiting-counterparty', rules: [{ kind: 'require-comment' }] },
        { from: 'in-progress', to: 'waiting-documents', rules: [{ kind: 'require-comment' }] },
        { from: 'waiting-counterparty', to: 'in-progress', rules: [] },
        { from: 'waiting-documents', to: 'in-progress', rules: [] },
        { from: 'in-progress', to: 'done', rules: [{ kind: 'require-evidence' }] },
        { from: 'done', to: 'in-progress', rules: [] },
      ],
    },
  },
  {
    id: 'approval-chain',
    name: 'Approval chain',
    tagline:
      'Draft, submit, approve — with four eyes: whoever submitted cannot be the one who approves.',
    def: {
      name: 'Approval chain',
      initialStateId: 'draft',
      states: [
        { id: 'draft', name: 'Draft', category: 'open' },
        { id: 'submitted', name: 'Submitted', category: 'active' },
        { id: 'approved', name: 'Approved', category: 'terminal' },
      ],
      transitions: [
        { from: 'draft', to: 'submitted', rules: [{ kind: 'restrict-to', assignee: true }] },
        { from: 'submitted', to: 'draft', rules: [{ kind: 'require-comment' }] },
        {
          // Four eyes, and no way round them: Approved is reachable only through
          // Submitted, so the rule always finds an earlier performer to differ
          // from. Adding a draft -> approved fast track would keep this def
          // valid but trip the rdu-bypassable advisory — don't.
          from: 'submitted',
          to: 'approved',
          rules: [{ kind: 'require-different-user', thanActorOf: { to: 'submitted' } }],
        },
        { from: 'approved', to: 'draft', rules: [{ kind: 'require-comment' }] },
      ],
    },
  },
];

export function cloneTemplate(template: WorkflowTemplate): WorkflowDef {
  return { ...structuredClone(template.def), id: newUlid(), version: 1 };
}

export function draftFromTemplate(template: WorkflowTemplate): WorkflowDraft {
  const def = cloneTemplate(template);
  return { def, positions: layoutDraft(def), base: null, selection: { kind: 'none' } };
}
```

- [ ] **Step 4: Run to verify it passes, update the barrel**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/templates.test.ts`
Expected: PASS (7 tests).

Add to `packages/app-core/src/workflow-builder/index.ts`:

```ts
export * from './templates.js';
```

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/workflow-builder/templates.ts packages/app-core/src/workflow-builder/index.ts packages/app-core/test/workflow-builder/templates.test.ts
git commit -m "Template gallery payloads: errand-with-waits (blocked-flagged waiting states) and approval-chain (four-eyes approve), with the Kanban card carrying the domain package's own bootstrap default rather than a second copy of it — ordinary workflows, cloned never referenced"
```

---

### Task 4: The authoring gateway, its in-memory fake, and the event builders

The builder's entire outside world behind one interface (DIP — the consumer defines it; `apps/web` adapts `DataSource` to it in Task 13). Plus the pure builders that turn a draft into the `workflow.defined` / `ticket-type.defined` submissions, with the version-bump and state-mapping mechanics the server will hold us to. Two of the gateway's reads are **counts the builder shows but never reasons from** — `getStateOccupancy` and `getTypeWorkflowPopulation` — and both may fail; each caller says so plainly rather than substituting a zero.

**Files:**
- Create: `packages/app-core/src/workflow-builder/gateway.ts`
- Create: `packages/app-core/src/workflow-builder/fake-gateway.ts`
- Create: `packages/app-core/src/workflow-builder/events.ts`
- Modify: `packages/app-core/src/workflow-builder/index.ts`
- Test: `packages/app-core/test/workflow-builder/events.test.ts`

**Interfaces:**
- Consumes: `SubmittedEvent`, `Origin`, `newUlid`, `parseEvent`, `PublishedWorkflowDef`, `TicketTypeDef`, `WorkspaceRole` from `@gisik-nokma/domain`; `WorkflowDraft` from Task 1.
- Produces:
  - `type WorkspaceMember = { userId: string; displayName: string; role: WorkspaceRole }`
  - `type IngestResult = { status: 'committed'; eventId: string; seq: number; serverTime: string } | { status: 'invalid'; eventId: string | null; code: string; message: string } | { status: 'refused'; eventId: string; rule: string; reason: string }` — the client-side mirror of Plan 1's type; **if Plan 6's data-source module already exports `IngestResult`, import and re-export it here instead of declaring it**
  - `interface WorkflowAuthoringGateway { listWorkflows(workspaceId): Promise<PublishedWorkflowDef[]>; getWorkflow(workspaceId, workflowId): Promise<PublishedWorkflowDef | null>; listTicketTypes(workspaceId): Promise<TicketTypeDef[]>; listMembers(workspaceId): Promise<WorkspaceMember[]>; getStateOccupancy(workspaceId, workflowId): Promise<Record<string, number>>; getTypeWorkflowPopulation(workspaceId, typeId, workflowId): Promise<number>; migrateTypeToWorkflow(input: MigrationRequest): Promise<MigrationOutcome>; submit(events: SubmittedEvent[]): Promise<IngestResult[]> }`
  - `type MigrationRequest = { workspaceId: string; typeId: string; fromWorkflowId: string; toWorkflowId: string; stateMap: Record<string, string> }` and `type MigrationOutcome = { status: 'migrated'; count: number } | { status: 'refused'; rule: string; reason: string }` — the bulk re-bind (decision 10). The map is authored **across two workflows** and is deliberately not a `stateMapping`: that field is keyed inside one workflow's version chain and is stored on a def; this one is applied once and stored nowhere.
  - `createFakeGateway(seed?: FakeGatewaySeed): WorkflowAuthoringGateway & { submitted: SubmittedEvent[]; migrations: MigrationRequest[] }` — commits everything by default; `submitResults` queue overrides, `occupancyError: true` makes `getStateOccupancy` reject (the mapping dialog's "unavailable" path), `typePopulationError: true` makes `getTypeWorkflowPopulation` reject (the divergence notice's "unavailable" path), `migrationResults` queue overrides the migration outcome
  - `droppedStates(draft: WorkflowDraft): { id: string; name: string }[]`
  - `buildPublishPayload(draft: WorkflowDraft, stateMapping?: Record<string, string>): PublishedWorkflowDef` — version `(base?.version ?? 0) + 1`
  - `buildWorkflowDefinedEvent(input: { workspaceId: string; actorId: string; origin: Origin; payload: PublishedWorkflowDef }): SubmittedEvent`
  - `buildTicketTypeDefinedEvent(input: { workspaceId: string; actorId: string; origin: Origin; def: TicketTypeDef }): SubmittedEvent` — fresh ULID entity id per submission (design decision 6)

- [ ] **Step 1: Write the failing events test**

Create `packages/app-core/test/workflow-builder/events.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newUlid, parseEvent, type TicketTypeDef } from '@gisik-nokma/domain';
import { draftFromPublished, newDraft } from '../../src/workflow-builder/draft-store.js';
import {
  buildPublishPayload,
  buildTicketTypeDefinedEvent,
  buildWorkflowDefinedEvent,
  droppedStates,
} from '../../src/workflow-builder/events.js';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';

const WORKSPACE = newUlid();
const ACTOR = newUlid();

function publishedKanban() {
  return {
    id: newUlid(),
    version: 2,
    name: 'Kanban',
    initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' as const },
      { id: 'review', name: 'Review', category: 'active' as const },
      { id: 'done', name: 'Done', category: 'terminal' as const },
    ],
    transitions: [
      { from: 'todo', to: 'review', rules: [] },
      { from: 'review', to: 'done', rules: [] },
    ],
  };
}

describe('droppedStates and buildPublishPayload', () => {
  it('a brand-new draft has no dropped states and publishes as version 1', () => {
    const draft = newDraft('Fresh');
    expect(droppedStates(draft)).toEqual([]);
    expect(buildPublishPayload(draft).version).toBe(1);
  });

  it('removing a state from a published base reports it dropped, with its display name', () => {
    const draft = draftFromPublished(publishedKanban());
    draft.def = {
      ...draft.def,
      states: draft.def.states.filter((state) => state.id !== 'review'),
      transitions: draft.def.transitions.filter(
        (transition) => transition.from !== 'review' && transition.to !== 'review',
      ),
    };
    expect(droppedStates(draft)).toEqual([{ id: 'review', name: 'Review' }]);
  });

  it('bumps the version from the base and attaches the mapping only when given and non-empty', () => {
    const draft = draftFromPublished(publishedKanban());
    expect(buildPublishPayload(draft).version).toBe(3);
    expect('stateMapping' in buildPublishPayload(draft)).toBe(false);
    expect('stateMapping' in buildPublishPayload(draft, {})).toBe(false);
    expect(buildPublishPayload(draft, { review: 'todo' }).stateMapping).toEqual({ review: 'todo' });
  });
});

describe('event builders', () => {
  it('workflow.defined points its entity at the payload workflow id and passes parseEvent whole', () => {
    const draft = newDraft('Fresh');
    const payload = buildPublishPayload(draft);
    // the zod payload schema checks structure, not workflow soundness — a fresh
    // one-state draft parses fine here; the ENGINE would refuse publishing it
    const event = buildWorkflowDefinedEvent({ workspaceId: WORKSPACE, actorId: ACTOR, origin: 'web', payload });
    expect(event.type).toBe('workflow.defined');
    expect(event.version).toBe(1);
    expect(event.entity).toEqual({ kind: 'workflow', id: payload.id });
    expect(event.workspaceId).toBe(WORKSPACE);
    expect(event.actorId).toBe(ACTOR);
    expect(event.origin).toBe('web');
    expect(Number.isNaN(Date.parse(event.clientTime))).toBe(false);
    const parsed = parseEvent(event);
    expect(parsed.ok).toBe(true);
  });

  it('ticket-type.defined mints a fresh entity ulid and carries the def as payload', () => {
    const def: TicketTypeDef = {
      id: newUlid(),
      name: 'Invoice',
      icon: 'receipt',
      rank: 3,
      workflowId: newUlid(),
      fields: [{ id: newUlid(), name: 'Amount', type: 'number' }],
    };
    const first = buildTicketTypeDefinedEvent({ workspaceId: WORKSPACE, actorId: ACTOR, origin: 'web', def });
    const second = buildTicketTypeDefinedEvent({ workspaceId: WORKSPACE, actorId: ACTOR, origin: 'web', def });
    expect(first.type).toBe('ticket-type.defined');
    expect(first.entity.kind).toBe('ticket-type');
    expect(first.entity.id).not.toBe(second.entity.id); // fresh entity ULID per submission (decision 6)
    expect(first.payload).toEqual(def);
    expect(parseEvent(first).ok).toBe(true);
  });
});

describe('createFakeGateway', () => {
  it('serves its seed and records submissions, committing by default', async () => {
    const workflows = [publishedKanban()];
    const gateway = createFakeGateway({ workflows, occupancy: { [workflows[0]!.id]: { review: 4 } } });
    expect(await gateway.listWorkflows(WORKSPACE)).toEqual(workflows);
    expect(await gateway.getWorkflow(WORKSPACE, workflows[0]!.id)).toEqual(workflows[0]);
    expect(await gateway.getWorkflow(WORKSPACE, newUlid())).toBeNull();
    expect(await gateway.getStateOccupancy(WORKSPACE, workflows[0]!.id)).toEqual({ review: 4 });

    const event = buildWorkflowDefinedEvent({
      workspaceId: WORKSPACE,
      actorId: ACTOR,
      origin: 'web',
      payload: buildPublishPayload(newDraft('Fresh')),
    });
    const results = await gateway.submit([event]);
    expect(results).toEqual([
      { status: 'committed', eventId: event.id, seq: 1, serverTime: expect.any(String) },
    ]);
    expect(gateway.submitted).toEqual([event]);
  });

  it('drains queued results and rejects occupancy reads when told to', async () => {
    const gateway = createFakeGateway({
      submitResults: [{ status: 'refused', eventId: 'e', rule: 'permission.role', reason: 'no' }],
      occupancyError: true,
    });
    const event = buildWorkflowDefinedEvent({
      workspaceId: WORKSPACE,
      actorId: ACTOR,
      origin: 'web',
      payload: buildPublishPayload(newDraft('Fresh')),
    });
    expect(await gateway.submit([event])).toEqual([
      { status: 'refused', eventId: 'e', rule: 'permission.role', reason: 'no' },
    ]);
    await expect(gateway.getStateOccupancy(WORKSPACE, 'wf')).rejects.toThrow();
  });

  it('serves the pinned population per (type, workflow) and records the migration it is asked for', async () => {
    const gateway = createFakeGateway({ typePopulation: { task: { 'wf-old': 12, 'wf-new': 3 } } });
    // A ticket pins the workflow it was created under, so one type can have a
    // population on each of two workflows at once (decision 10).
    expect(await gateway.getTypeWorkflowPopulation(WORKSPACE, 'task', 'wf-old')).toBe(12);
    expect(await gateway.getTypeWorkflowPopulation(WORKSPACE, 'task', 'wf-new')).toBe(3);
    expect(await gateway.getTypeWorkflowPopulation(WORKSPACE, 'task', 'wf-never-used')).toBe(0);

    const request = {
      workspaceId: WORKSPACE,
      typeId: 'task',
      fromWorkflowId: 'wf-old',
      toWorkflowId: 'wf-new',
      stateMap: { todo: 'backlog', doing: 'in-flight', done: 'closed' },
    };
    expect(await gateway.migrateTypeToWorkflow(request)).toEqual({ status: 'migrated', count: 12 });
    expect(gateway.migrations).toEqual([request]);
  });

  it('rejects population reads and refuses migrations when told to', async () => {
    const gateway = createFakeGateway({
      typePopulationError: true,
      migrationResults: [
        { status: 'refused', rule: 'ticket.unknown-state', reason: '"closed" is not a state of this workflow.' },
      ],
    });
    await expect(gateway.getTypeWorkflowPopulation(WORKSPACE, 'task', 'wf-old')).rejects.toThrow();
    expect(
      await gateway.migrateTypeToWorkflow({
        workspaceId: WORKSPACE,
        typeId: 'task',
        fromWorkflowId: 'wf-old',
        toWorkflowId: 'wf-new',
        stateMap: { todo: 'closed' },
      }),
    ).toEqual({ status: 'refused', rule: 'ticket.unknown-state', reason: '"closed" is not a state of this workflow.' });
  });
});
```

(The refusal rule id above is illustrative only — Plan 3 owns `ticket.workflow_rebound` and names its refusals; this plan renders whatever `reason` and `rule` come back, verbatim, and asserts on the shape rather than on Plan 3's wording.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/events.test.ts`
Expected: FAIL — cannot resolve `../../src/workflow-builder/events.js`.

- [ ] **Step 3: Implement `gateway.ts`, `events.ts`, `fake-gateway.ts`**

Create `packages/app-core/src/workflow-builder/gateway.ts`:

```ts
import type { PublishedWorkflowDef, SubmittedEvent, TicketTypeDef, WorkspaceRole } from '@gisik-nokma/domain';

export type WorkspaceMember = { userId: string; displayName: string; role: WorkspaceRole };

/**
 * Client-side mirror of Plan 1's IngestResult, served through DataSource.ingest
 * (amendment 10). If the app-core data-source module already exports this type
 * (Plan 6), delete this declaration and re-export theirs.
 */
export type IngestResult =
  | { status: 'committed'; eventId: string; seq: number; serverTime: string }
  | { status: 'invalid'; eventId: string | null; code: string; message: string }
  | { status: 'refused'; eventId: string; rule: string; reason: string };

/**
 * Everything the builder needs from the outside world. Views never speak HTTP
 * (amendment 10): apps/web adapts DataSource to this in one file; tests use
 * the in-memory fake. Read shapes flagged for Plan 5 in the plan's Open questions.
 */
export type MigrationRequest = {
  workspaceId: string;
  typeId: string;
  fromWorkflowId: string;
  toWorkflowId: string;
  /** Every state of the outgoing workflow → a state of the incoming one. */
  stateMap: Record<string, string>;
};

export type MigrationOutcome =
  | { status: 'migrated'; count: number }
  | { status: 'refused'; rule: string; reason: string };

export interface WorkflowAuthoringGateway {
  listWorkflows(workspaceId: string): Promise<PublishedWorkflowDef[]>;
  getWorkflow(workspaceId: string, workflowId: string): Promise<PublishedWorkflowDef | null>;
  listTicketTypes(workspaceId: string): Promise<TicketTypeDef[]>;
  listMembers(workspaceId: string): Promise<WorkspaceMember[]>;
  /** Tickets currently sitting in each state of the workflow — the mapping dialog's in-flight counts. */
  getStateOccupancy(workspaceId: string, workflowId: string): Promise<Record<string, number>>;
  /**
   * Tickets of this type PINNED to this workflow. A ticket pins the workflow it
   * was created under (owner decision 2026-08-26), so re-pointing a type leaves
   * a population behind — this is the count the editor names rather than
   * letting the admin discover it on the board. Same shape and same honest
   * degradation as `getStateOccupancy`: it may reject, and the caller says
   * "unavailable" rather than guessing a number.
   */
  getTypeWorkflowPopulation(workspaceId: string, typeId: string, workflowId: string): Promise<number>;
  /**
   * The bulk affordance: one cross-workflow state map in, one
   * `ticket.workflow_rebound` per ticket out (emitted server-side — Plan 3 owns
   * the event and its refusals). Never a `stateMapping`: that is keyed inside
   * one workflow's version chain, and across workflows there is no chain.
   */
  migrateTypeToWorkflow(input: MigrationRequest): Promise<MigrationOutcome>;
  submit(events: SubmittedEvent[]): Promise<IngestResult[]>;
}
```

Create `packages/app-core/src/workflow-builder/events.ts`:

```ts
import {
  newUlid,
  type Origin,
  type PublishedWorkflowDef,
  type SubmittedEvent,
  type TicketTypeDef,
} from '@gisik-nokma/domain';
import type { WorkflowDraft } from './draft-store.js';

/** States the base version has that the draft no longer does — each needs a mapping entry or the server refuses. */
export function droppedStates(draft: WorkflowDraft): { id: string; name: string }[] {
  if (draft.base === null) return [];
  const keptIds = new Set(draft.def.states.map((state) => state.id));
  return draft.base.states.filter((state) => !keptIds.has(state.id));
}

export function buildPublishPayload(
  draft: WorkflowDraft,
  stateMapping?: Record<string, string>,
): PublishedWorkflowDef {
  const payload: PublishedWorkflowDef = {
    ...draft.def,
    version: (draft.base?.version ?? 0) + 1,
  };
  if (stateMapping !== undefined && Object.keys(stateMapping).length > 0) {
    return { ...payload, stateMapping };
  }
  return payload;
}

export function buildWorkflowDefinedEvent(input: {
  workspaceId: string;
  actorId: string;
  origin: Origin;
  payload: PublishedWorkflowDef;
}): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId: input.workspaceId,
    entity: { kind: 'workflow', id: input.payload.id },
    type: 'workflow.defined',
    version: 1,
    payload: input.payload,
    actorId: input.actorId,
    origin: input.origin,
    clientTime: new Date().toISOString(),
  };
}

export function buildTicketTypeDefinedEvent(input: {
  workspaceId: string;
  actorId: string;
  origin: Origin;
  def: TicketTypeDef;
}): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId: input.workspaceId,
    // Fresh entity ULID per submission; the projection folds by payload id
    // (Plan 3's convention — design decision 6).
    entity: { kind: 'ticket-type', id: newUlid() },
    type: 'ticket-type.defined',
    version: 1,
    payload: input.def,
    actorId: input.actorId,
    origin: input.origin,
    clientTime: new Date().toISOString(),
  };
}
```

Create `packages/app-core/src/workflow-builder/fake-gateway.ts`:

```ts
import type { PublishedWorkflowDef, SubmittedEvent, TicketTypeDef } from '@gisik-nokma/domain';
import type {
  IngestResult,
  MigrationOutcome,
  MigrationRequest,
  WorkflowAuthoringGateway,
  WorkspaceMember,
} from './gateway.js';

export type FakeGatewaySeed = {
  workflows?: PublishedWorkflowDef[];
  ticketTypes?: TicketTypeDef[];
  members?: WorkspaceMember[];
  /** workflowId → stateId → ticket count */
  occupancy?: Record<string, Record<string, number>>;
  /** typeId → workflowId → count of tickets PINNED to that workflow (decision 10) */
  typePopulation?: Record<string, Record<string, number>>;
  /** Drained in order; when empty, submissions commit. */
  submitResults?: IngestResult[];
  /** Drained in order; when empty, a migration moves the whole seeded population. */
  migrationResults?: MigrationOutcome[];
  /** Simulate the occupancy read failing — the dialog's "ticket count unavailable" path. */
  occupancyError?: boolean;
  /** Simulate the population read failing — the divergence notice's "unavailable" path. */
  typePopulationError?: boolean;
};

export function createFakeGateway(
  seed: FakeGatewaySeed = {},
): WorkflowAuthoringGateway & { submitted: SubmittedEvent[]; migrations: MigrationRequest[] } {
  const pendingResults = [...(seed.submitResults ?? [])];
  const pendingMigrations = [...(seed.migrationResults ?? [])];
  const submitted: SubmittedEvent[] = [];
  const migrations: MigrationRequest[] = [];
  let committedSeq = 0;
  return {
    submitted,
    migrations,
    listWorkflows: async () => seed.workflows ?? [],
    getWorkflow: async (_workspaceId, workflowId) =>
      (seed.workflows ?? []).find((workflow) => workflow.id === workflowId) ?? null,
    listTicketTypes: async () => seed.ticketTypes ?? [],
    listMembers: async () => seed.members ?? [],
    getStateOccupancy: async (_workspaceId, workflowId) => {
      if (seed.occupancyError === true) throw new Error('occupancy read failed (seeded)');
      return seed.occupancy?.[workflowId] ?? {};
    },
    getTypeWorkflowPopulation: async (_workspaceId, typeId, workflowId) => {
      if (seed.typePopulationError === true) throw new Error('type population read failed (seeded)');
      return seed.typePopulation?.[typeId]?.[workflowId] ?? 0;
    },
    migrateTypeToWorkflow: async (input) => {
      migrations.push(input);
      const queued = pendingMigrations.shift();
      if (queued !== undefined) return queued;
      return { status: 'migrated', count: seed.typePopulation?.[input.typeId]?.[input.fromWorkflowId] ?? 0 };
    },
    submit: async (events) => {
      submitted.push(...events);
      return events.map((event) => {
        const queued = pendingResults.shift();
        if (queued !== undefined) return queued;
        committedSeq += 1;
        return {
          status: 'committed',
          eventId: event.id,
          seq: committedSeq,
          serverTime: new Date().toISOString(),
        };
      });
    },
  };
}
```

- [ ] **Step 4: Run to verify it passes, update the barrel**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/events.test.ts`
Expected: PASS (9 tests).

Add to `packages/app-core/src/workflow-builder/index.ts`:

```ts
export * from './gateway.js';
export * from './fake-gateway.js';
export * from './events.js';
```

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/workflow-builder packages/app-core/test/workflow-builder/events.test.ts
git commit -m "Authoring gateway interface with in-memory fake, and the event builders: version bump from the published base, stateMapping only when real, fresh entity ulid per ticket-type definition — plus the two counts the builder shows without reasoning from them, including how many tickets of a type stay pinned to the workflow it is being moved off"
```

---

### Task 5: The canvas — React Flow nodes, edges, and rendering

States as nodes (name, category picker, blocked checkbox, initial-state marker), transitions as edges carrying plain-language rule summaries, and the distinguished `Any state` source node for `'*'` transitions. This task renders and binds pickers on nodes; connecting and inspectors are Task 6.

**Files:**
- Modify: `packages/ui/src/tokens.ts` (add the workflow-builder colour roles — the one colour origin, amendment 11)
- Create: `packages/app-core/src/workflow-builder/ui/builder-context.tsx`
- Create: `packages/app-core/src/workflow-builder/ui/flow-graph.ts`
- Create: `packages/app-core/src/workflow-builder/ui/state-node.tsx`
- Create: `packages/app-core/src/workflow-builder/ui/any-state-node.tsx`
- Create: `packages/app-core/src/workflow-builder/ui/transition-edge.tsx`
- Create: `packages/app-core/src/workflow-builder/ui/workflow-canvas.tsx`
- Modify: `packages/app-core/src/workflow-builder/index.ts`
- Test: `packages/app-core/test/workflow-builder/flow-graph.test.ts`
- Test: `packages/app-core/test/workflow-builder/canvas.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–4 exports; `@xyflow/react` (`ReactFlow`, `Handle`, `Position`, `BaseEdge`, `EdgeLabelRenderer`, `getBezierPath`, types `Node`, `Edge`, `NodeProps`, `EdgeProps`, `Connection`); `tokens` from `@gisik-nokma/ui`.
- Produces:
  - `type BuilderSession = { userId: string; role: WorkspaceRole }`, `type BuilderEnvironment = { workspaceId: string; session: BuilderSession; gateway: WorkflowAuthoringGateway; members: WorkspaceMember[]; ticketTypes: TicketTypeDef[]; canAuthor: boolean }`
  - `BuilderProvider({ store, env, children })`, hooks `useBuilderStore()`, `useBuilderEnv()`, `useDraft()`, `useSummaryCtx()`; `canAuthorRole(role: WorkspaceRole): boolean` (owner or admin)
  - `toFlowGraph(draft: WorkflowDraft, ctx: SummaryContext): { nodes: Node[]; edges: Edge[] }` — node ids `s:${stateId}` plus `any-state`; edge ids `t:${index}`
  - `connectionToTransition(connection: { source: string | null; target: string | null }): { from: string; to: string } | null`
  - Components `StateNode`, `AnyStateNode`, `TransitionEdge`, `WorkflowCanvas` (no props — reads contexts)
- Not for RN: React Flow is DOM-only; the builder ships on web/desktop (design decision 8).

- [ ] **Step 1: Add the workflow-builder colour roles to `packages/ui/src/tokens.ts`**

Add a `workflowBuilder` group to the `tokens` object (create the object if the stand-in from Task 1 Step 1 is still empty). **If Plan 6's tokens already define equivalent roles (state-category or status colours), use Plan 6's keys and values instead and skip this step** — one origin means one set of roles, not two:

```ts
export const tokens = {
  // ...whatever Plan 6 defined stays untouched above...
  workflowBuilder: {
    stateOpen: '#64748b',
    stateActive: '#2563eb',
    stateTerminal: '#16a34a',
    blockedRing: '#dc2626',
    edge: '#94a3b8',
    edgeSelected: '#2563eb',
    issueAccent: '#b45309',
    advisoryAccent: '#0369a1',
    panelBorder: '#e2e8f0',
    surface: '#ffffff',
    textPrimary: '#0f172a',
    textMuted: '#475569',
  },
} as const;
```

These hex values are this plan's only colour literals, and they live in the one permitted file. `advisoryAccent` is deliberately a different hue from `issueAccent` — a warning that blocks nothing must not wear the colour of a thing that blocks publishing.

- [ ] **Step 2: Write the failing flow-graph test**

Create `packages/app-core/test/workflow-builder/flow-graph.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import { summaryContextFor } from '../../src/workflow-builder/summaries.js';
import { ANY_STATE_NODE_ID } from '../../src/workflow-builder/layout.js';
import { connectionToTransition, toFlowGraph } from '../../src/workflow-builder/ui/flow-graph.js';

const errand = WORKFLOW_TEMPLATES.find((template) => template.id === 'errand-with-waits')!;

function graph() {
  const draft = draftFromTemplate(errand);
  return { draft, ...toFlowGraph(draft, summaryContextFor(draft.def)) };
}

describe('toFlowGraph', () => {
  it('maps every state to an s:-prefixed node plus the any-state node', () => {
    const { draft, nodes } = graph();
    expect(nodes.map((node) => node.id)).toEqual([
      ...draft.def.states.map((state) => `s:${state.id}`),
      ANY_STATE_NODE_ID,
    ]);
    expect(nodes.every((node) => node.id === ANY_STATE_NODE_ID || node.type === 'state')).toBe(true);
  });

  it('carries name, category, blocked, and the initial marker in node data', () => {
    const { nodes } = graph();
    const waiting = nodes.find((node) => node.id === 's:waiting-counterparty')!;
    expect(waiting.data).toEqual({
      stateId: 'waiting-counterparty',
      name: 'Waiting on counterparty',
      category: 'active',
      blocked: true,
      isInitial: false,
    });
    const start = nodes.find((node) => node.id === 's:not-started')!;
    expect(start.data).toMatchObject({ blocked: false, isInitial: true });
  });

  it('maps transitions to t:index edges with summaries, routing "*" from the any-state node', () => {
    const draft = draftFromTemplate(errand);
    draft.def = { ...draft.def, transitions: [...draft.def.transitions, { from: '*', to: 'done', rules: [] }] };
    const { edges } = toFlowGraph(draft, summaryContextFor(draft.def));
    expect(edges[1]).toMatchObject({
      id: 't:1',
      source: 's:in-progress',
      target: 's:waiting-counterparty',
      data: { index: 1, summaries: ['Must carry a comment explaining it.'] },
    });
    expect(edges[edges.length - 1]).toMatchObject({ source: ANY_STATE_NODE_ID, target: 's:done' });
  });

  it('drops edges whose endpoint state is missing — the issues panel names them instead', () => {
    const draft = draftFromTemplate(errand);
    draft.def = { ...draft.def, transitions: [...draft.def.transitions, { from: 'ghost', to: 'done', rules: [] }] };
    const { edges } = toFlowGraph(draft, summaryContextFor(draft.def));
    expect(edges.some((edge) => edge.source === 's:ghost')).toBe(false);
  });

  it('marks selection on the selected node or edge', () => {
    const draft = draftFromTemplate(errand);
    draft.selection = { kind: 'transition', index: 0 };
    const { edges } = toFlowGraph(draft, summaryContextFor(draft.def));
    expect(edges[0]?.selected).toBe(true);
    expect(edges[1]?.selected).toBe(false);
  });
});

describe('connectionToTransition', () => {
  it('strips prefixes and turns the any-state node into "*"', () => {
    expect(connectionToTransition({ source: 's:todo', target: 's:doing' })).toEqual({ from: 'todo', to: 'doing' });
    expect(connectionToTransition({ source: ANY_STATE_NODE_ID, target: 's:done' })).toEqual({ from: '*', to: 'done' });
  });

  it('refuses connections into the any-state node or with missing ends', () => {
    expect(connectionToTransition({ source: 's:todo', target: ANY_STATE_NODE_ID })).toBeNull();
    expect(connectionToTransition({ source: null, target: 's:done' })).toBeNull();
    expect(connectionToTransition({ source: 's:todo', target: null })).toBeNull();
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/flow-graph.test.ts`
Expected: FAIL — cannot resolve `../../src/workflow-builder/ui/flow-graph.js`.

- [ ] **Step 4: Implement `builder-context.tsx` and `flow-graph.ts`**

Create `packages/app-core/src/workflow-builder/ui/builder-context.tsx`:

```tsx
import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from 'react';
import type { TicketTypeDef, WorkspaceRole } from '@gisik-nokma/domain';
import type { DraftStore, WorkflowDraft } from '../draft-store.js';
import { fieldChoicesFor } from '../fields.js';
import type { WorkflowAuthoringGateway, WorkspaceMember } from '../gateway.js';
import { summaryContextFor, type SummaryContext } from '../summaries.js';

export type BuilderSession = { userId: string; role: WorkspaceRole };

export type BuilderEnvironment = {
  workspaceId: string;
  session: BuilderSession;
  gateway: WorkflowAuthoringGateway;
  members: WorkspaceMember[];
  ticketTypes: TicketTypeDef[];
  canAuthor: boolean;
};

export function canAuthorRole(role: WorkspaceRole): boolean {
  return role === 'owner' || role === 'admin';
}

const StoreContext = createContext<DraftStore | null>(null);
const EnvContext = createContext<BuilderEnvironment | null>(null);

export function BuilderProvider(props: {
  store: DraftStore;
  env: BuilderEnvironment;
  children: ReactNode;
}) {
  return (
    <StoreContext.Provider value={props.store}>
      <EnvContext.Provider value={props.env}>{props.children}</EnvContext.Provider>
    </StoreContext.Provider>
  );
}

export function useBuilderStore(): DraftStore {
  const store = useContext(StoreContext);
  if (store === null) throw new Error('useBuilderStore requires a BuilderProvider');
  return store;
}

export function useBuilderEnv(): BuilderEnvironment {
  const env = useContext(EnvContext);
  if (env === null) throw new Error('useBuilderEnv requires a BuilderProvider');
  return env;
}

export function useDraft(): WorkflowDraft {
  const store = useBuilderStore();
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}

/** Names for rule summaries: workspace members, plus fields of the types bound to this workflow. */
export function useSummaryCtx(): SummaryContext {
  const env = useBuilderEnv();
  const draft = useDraft();
  return useMemo(() => {
    const boundTypes = env.ticketTypes.filter((type) => type.workflowId === draft.def.id);
    return summaryContextFor(draft.def, {
      memberNames: new Map(env.members.map((member) => [member.userId, member.displayName])),
      fields: fieldChoicesFor(boundTypes),
    });
  }, [env.ticketTypes, env.members, draft.def]);
}
```

Create `packages/app-core/src/workflow-builder/ui/flow-graph.ts`:

```ts
import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { WorkflowDraft } from '../draft-store.js';
import { ANY_STATE_NODE_ID } from '../layout.js';
import { summarizeRules, type SummaryContext } from '../summaries.js';

export type StateNodeData = {
  stateId: string;
  name: string;
  category: 'open' | 'active' | 'terminal';
  blocked: boolean;
  isInitial: boolean;
};

export type TransitionEdgeData = { index: number; summaries: string[] };

const STATE_PREFIX = 's:';

export function toFlowGraph(
  draft: WorkflowDraft,
  ctx: SummaryContext,
): { nodes: Node[]; edges: Edge[] } {
  const stateIds = new Set(draft.def.states.map((state) => state.id));
  const nodes: Node[] = draft.def.states.map((state) => ({
    id: `${STATE_PREFIX}${state.id}`,
    type: 'state',
    position: draft.positions[state.id] ?? { x: 0, y: 0 },
    data: {
      stateId: state.id,
      name: state.name,
      category: state.category,
      blocked: state.blocked === true,
      isInitial: state.id === draft.def.initialStateId,
    } satisfies StateNodeData,
    selected: draft.selection.kind === 'state' && draft.selection.stateId === state.id,
  }));
  nodes.push({
    id: ANY_STATE_NODE_ID,
    type: 'anyState',
    position: draft.positions[ANY_STATE_NODE_ID] ?? { x: 0, y: 80 },
    data: {},
  });

  const edges: Edge[] = [];
  draft.def.transitions.forEach((transition, index) => {
    if (transition.from !== '*' && !stateIds.has(transition.from)) return; // dangling — issues panel names it
    if (!stateIds.has(transition.to)) return;
    edges.push({
      id: `t:${index}`,
      source: transition.from === '*' ? ANY_STATE_NODE_ID : `${STATE_PREFIX}${transition.from}`,
      target: `${STATE_PREFIX}${transition.to}`,
      type: 'transition',
      markerEnd: { type: MarkerType.ArrowClosed }, // transitions are drawn ARROWS (spec §4)
      data: { index, summaries: summarizeRules(transition.rules, ctx) } satisfies TransitionEdgeData,
      selected: draft.selection.kind === 'transition' && draft.selection.index === index,
    });
  });
  return { nodes, edges };
}

/** Turns a React Flow connection into a transition, or null when it is not one we allow. */
export function connectionToTransition(connection: {
  source: string | null;
  target: string | null;
}): { from: string; to: string } | null {
  if (connection.source === null || connection.target === null) return null;
  if (connection.target === ANY_STATE_NODE_ID) return null; // '*' is a source, never a destination
  const from =
    connection.source === ANY_STATE_NODE_ID ? '*' : connection.source.slice(STATE_PREFIX.length);
  const to = connection.target.slice(STATE_PREFIX.length);
  return { from, to };
}
```

- [ ] **Step 5: Run the flow-graph test to verify it passes**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/flow-graph.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Write the failing canvas component test**

Create `packages/app-core/test/workflow-builder/canvas.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createDraftStore, type DraftStore } from '../../src/workflow-builder/draft-store.js';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import { BuilderProvider, type BuilderEnvironment } from '../../src/workflow-builder/ui/builder-context.tsx';
import { WorkflowCanvas } from '../../src/workflow-builder/ui/workflow-canvas.tsx';

const errand = WORKFLOW_TEMPLATES.find((template) => template.id === 'errand-with-waits')!;

export function testEnv(overrides: Partial<BuilderEnvironment> = {}): BuilderEnvironment {
  return {
    workspaceId: newUlid(),
    session: { userId: newUlid(), role: 'admin' },
    gateway: createFakeGateway(),
    members: [],
    ticketTypes: [],
    canAuthor: true,
    ...overrides,
  };
}

function renderCanvas(store: DraftStore, env = testEnv()) {
  return render(
    <BuilderProvider store={store} env={env}>
      <WorkflowCanvas />
    </BuilderProvider>,
  );
}

describe('WorkflowCanvas', () => {
  it('renders every state as a node with its name', () => {
    renderCanvas(createDraftStore(draftFromTemplate(errand)));
    for (const name of ['Not started', 'In progress', 'Waiting on counterparty', 'Waiting on documents', 'Done']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it('shows the initial-state marker on the start state only', () => {
    renderCanvas(createDraftStore(draftFromTemplate(errand)));
    const start = screen.getByTestId('state-node-not-started');
    expect(within(start).getByText('Start')).toBeInTheDocument();
    expect(within(screen.getByTestId('state-node-done')).queryByText('Start')).not.toBeInTheDocument();
  });

  it('checks the blocked checkbox exactly on blocked-flagged states', () => {
    renderCanvas(createDraftStore(draftFromTemplate(errand)));
    expect(
      within(screen.getByTestId('state-node-waiting-counterparty')).getByRole('checkbox', { name: 'Blocked' }),
    ).toBeChecked();
    expect(
      within(screen.getByTestId('state-node-in-progress')).getByRole('checkbox', { name: 'Blocked' }),
    ).not.toBeChecked();
  });

  it('changes a state category through the node picker', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(errand));
    renderCanvas(store);
    const picker = within(screen.getByTestId('state-node-done')).getByRole('combobox', { name: 'Category' });
    await user.selectOptions(picker, 'active');
    expect(store.getState().def.states.find((state) => state.id === 'done')?.category).toBe('active');
  });

  it('toggles the blocked flag through the node checkbox', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(errand));
    renderCanvas(store);
    await user.click(
      within(screen.getByTestId('state-node-in-progress')).getByRole('checkbox', { name: 'Blocked' }),
    );
    expect(store.getState().def.states.find((state) => state.id === 'in-progress')?.blocked).toBe(true);
  });

  it('selects a state on click', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(errand));
    renderCanvas(store);
    await user.click(within(screen.getByTestId('state-node-done')).getByText('Done'));
    expect(store.getState().selection).toEqual({ kind: 'state', stateId: 'done' });
  });

  it('renders rule summaries on edges and selects the transition when the label is clicked', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(errand));
    renderCanvas(store);
    expect(screen.getAllByText('Must carry a comment explaining it.')).toHaveLength(2);
    expect(screen.getByText('Must carry an attachment as evidence.')).toBeInTheDocument();
    await user.click(screen.getByText('Must carry an attachment as evidence.'));
    expect(store.getState().selection).toEqual({ kind: 'transition', index: 5 });
  });

  it('renders the distinguished any-state source node', () => {
    renderCanvas(createDraftStore(draftFromTemplate(errand)));
    expect(screen.getByText('Any state')).toBeInTheDocument();
    expect(screen.getByText('drag from here for a from-anywhere move')).toBeInTheDocument();
  });

  it('disables editing controls when the viewer cannot author', () => {
    const store = createDraftStore(draftFromTemplate(errand));
    renderCanvas(store, testEnv({ session: { userId: newUlid(), role: 'member' }, canAuthor: false }));
    expect(
      within(screen.getByTestId('state-node-done')).getByRole('combobox', { name: 'Category' }),
    ).toBeDisabled();
    expect(
      within(screen.getByTestId('state-node-done')).getByRole('checkbox', { name: 'Blocked' }),
    ).toBeDisabled();
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/canvas.test.tsx`
Expected: FAIL — cannot resolve `../../src/workflow-builder/ui/workflow-canvas.tsx`.

- [ ] **Step 8: Implement the node and edge components**

Create `packages/app-core/src/workflow-builder/ui/state-node.tsx`:

```tsx
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { tokens } from '@gisik-nokma/ui';
import type { StateCategory } from '@gisik-nokma/domain';
import { useBuilderEnv, useBuilderStore } from './builder-context.tsx';
import type { StateNodeData } from './flow-graph.js';

const CATEGORY_COLOURS: Record<StateCategory, string> = {
  open: tokens.workflowBuilder.stateOpen,
  active: tokens.workflowBuilder.stateActive,
  terminal: tokens.workflowBuilder.stateTerminal,
};

export function StateNode(props: NodeProps) {
  const data = props.data as StateNodeData;
  const store = useBuilderStore();
  const { canAuthor } = useBuilderEnv();
  const accent = CATEGORY_COLOURS[data.category];
  return (
    <div
      className={`state-node state-node--${data.category}${data.blocked ? ' state-node--blocked' : ''}`}
      data-testid={`state-node-${data.stateId}`}
      onClick={() => store.actions.select({ kind: 'state', stateId: data.stateId })}
      style={{
        background: tokens.workflowBuilder.surface,
        color: tokens.workflowBuilder.textPrimary,
        border: `2px solid ${props.selected ? accent : tokens.workflowBuilder.panelBorder}`,
        borderLeft: `6px solid ${accent}`,
        outline: data.blocked ? `2px dashed ${tokens.workflowBuilder.blockedRing}` : 'none',
        borderRadius: 8,
        padding: '8px 12px',
        minWidth: 170,
      }}
    >
      <Handle type="target" position={Position.Left} />
      <div className="state-node__header">
        <span className="state-node__name">{data.name}</span>
        {data.isInitial ? (
          <span className="state-node__initial-badge" style={{ color: accent }}>
            Start
          </span>
        ) : null}
      </div>
      <label className="state-node__category">
        <span className="state-node__category-label">Category</span>
        <select
          aria-label="Category"
          className="nodrag state-node__category-picker"
          disabled={!canAuthor}
          value={data.category}
          onClick={(mouseEvent) => mouseEvent.stopPropagation()}
          onChange={(changeEvent) =>
            store.actions.setStateCategory(data.stateId, changeEvent.target.value as StateCategory)
          }
        >
          <option value="open">open</option>
          <option value="active">active</option>
          <option value="terminal">terminal</option>
        </select>
      </label>
      <label className="state-node__blocked">
        <input
          type="checkbox"
          aria-label="Blocked"
          className="nodrag"
          disabled={!canAuthor}
          checked={data.blocked}
          onClick={(mouseEvent) => mouseEvent.stopPropagation()}
          onChange={(changeEvent) => store.actions.setStateBlocked(data.stateId, changeEvent.target.checked)}
        />
        <span>Blocked</span>
      </label>
      <Handle type="source" position={Position.Right} isConnectable={canAuthor} />
    </div>
  );
}
```

Create `packages/app-core/src/workflow-builder/ui/any-state-node.tsx`:

```tsx
import { Handle, Position } from '@xyflow/react';
import { tokens } from '@gisik-nokma/ui';
import { useBuilderEnv } from './builder-context.tsx';

/** The distinguished source for from-any ('*') transitions — a real node so authors can draw from it. */
export function AnyStateNode() {
  const { canAuthor } = useBuilderEnv();
  return (
    <div
      className="any-state-node"
      style={{
        background: tokens.workflowBuilder.surface,
        color: tokens.workflowBuilder.textMuted,
        border: `2px dashed ${tokens.workflowBuilder.panelBorder}`,
        borderRadius: 8,
        padding: '8px 12px',
      }}
    >
      <div className="any-state-node__title">Any state</div>
      <div className="any-state-node__hint">drag from here for a from-anywhere move</div>
      <Handle type="source" position={Position.Right} isConnectable={canAuthor} />
    </div>
  );
}
```

Create `packages/app-core/src/workflow-builder/ui/transition-edge.tsx`:

```tsx
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';
import { tokens } from '@gisik-nokma/ui';
import { useBuilderStore } from './builder-context.tsx';
import type { TransitionEdgeData } from './flow-graph.js';

export function TransitionEdge(props: EdgeProps) {
  const data = props.data as TransitionEdgeData;
  const store = useBuilderStore();
  const [path, labelX, labelY] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: props.targetX,
    targetY: props.targetY,
    targetPosition: props.targetPosition,
  });
  const stroke = props.selected ? tokens.workflowBuilder.edgeSelected : tokens.workflowBuilder.edge;
  return (
    <>
      <BaseEdge id={props.id} path={path} markerEnd={props.markerEnd} style={{ stroke, strokeWidth: 2 }} />
      <EdgeLabelRenderer>
        <div
          className={`transition-edge__label${props.selected ? ' transition-edge__label--selected' : ''}`}
          data-testid={`transition-label-${data.index}`}
          onClick={() => store.actions.select({ kind: 'transition', index: data.index })}
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
            background: tokens.workflowBuilder.surface,
            color: tokens.workflowBuilder.textMuted,
            border: `1px solid ${stroke}`,
            borderRadius: 6,
            padding: data.summaries.length > 0 ? '2px 8px' : 0,
            fontSize: 11,
            maxWidth: 220,
          }}
        >
          {data.summaries.map((summary, at) => (
            <div className="transition-edge__rule" key={at}>
              {summary}
            </div>
          ))}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
```

- [ ] **Step 9: Implement `workflow-canvas.tsx`**

Create `packages/app-core/src/workflow-builder/ui/workflow-canvas.tsx`:

```tsx
import { useCallback, useMemo } from 'react';
import {
  Background,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ANY_STATE_NODE_ID } from '../layout.js';
import { AnyStateNode } from './any-state-node.tsx';
import { useBuilderEnv, useBuilderStore, useDraft, useSummaryCtx } from './builder-context.tsx';
import { connectionToTransition, toFlowGraph } from './flow-graph.js';
import { StateNode } from './state-node.tsx';
import { TransitionEdge } from './transition-edge.tsx';

const NODE_TYPES = { state: StateNode, anyState: AnyStateNode };
const EDGE_TYPES = { transition: TransitionEdge };

function CanvasInner() {
  const store = useBuilderStore();
  const { canAuthor } = useBuilderEnv();
  const draft = useDraft();
  const summaryCtx = useSummaryCtx();
  const { nodes, edges } = useMemo(() => toFlowGraph(draft, summaryCtx), [draft, summaryCtx]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const transition = connectionToTransition(connection);
      if (transition !== null) store.actions.addTransition(transition.from, transition.to);
    },
    [store],
  );

  const onNodeDragStop = useCallback(
    (_mouseEvent: unknown, node: Node) => {
      const key = node.id === ANY_STATE_NODE_ID ? node.id : node.id.slice('s:'.length);
      store.actions.moveState(key, node.position);
    },
    [store],
  );

  return (
    <div className="workflow-canvas" style={{ width: '100%', height: '100%', minHeight: 480 }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={() => store.actions.select({ kind: 'none' })}
        nodesConnectable={canAuthor}
        nodesDraggable
        elementsSelectable
        fitView
        defaultEdgeOptions={{ type: 'transition', markerEnd: { type: MarkerType.ArrowClosed } }}
      >
        <Background />
      </ReactFlow>
    </div>
  );
}

export function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
```

- [ ] **Step 10: Run the canvas test to verify it passes, update the barrel**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/canvas.test.tsx`
Expected: PASS (9 tests). If node contents do not appear, the jsdom shims from Task 1 Step 1 are missing — fix the setup file, not the components.

Add to `packages/app-core/src/workflow-builder/index.ts`:

```ts
export * from './ui/builder-context.tsx';
export * from './ui/flow-graph.js';
export * from './ui/workflow-canvas.tsx';
```

- [ ] **Step 11: Commit**

```bash
git add packages/ui/src/tokens.ts packages/app-core/src/workflow-builder packages/app-core/test/workflow-builder
git commit -m "React Flow canvas: state nodes carry name, category picker, blocked checkbox and start marker; edges carry plain-language rule summaries; any-state is a real drawable source"
```

---

### Task 6: Select-to-edit — the state and transition inspectors

Clicking a node or an edge selects it (Task 5); this task gives the selection an inspector: rename/set-as-start/delete for states, and for transitions a header, the rules list with remove, the add-rule menu (five kinds, sensible defaults), and delete-transition. Per-kind rule *editing* arrives in Task 7 — here a rule row shows its summary and a remove button.

**Files:**
- Create: `packages/app-core/src/workflow-builder/ui/state-inspector.tsx`
- Create: `packages/app-core/src/workflow-builder/ui/inspector-panel.tsx`
- Create: `packages/app-core/src/workflow-builder/ui/transition-inspector.tsx`
- Create: `packages/app-core/src/workflow-builder/ui/rule-editors/add-rule-menu.tsx`
- Modify: `packages/app-core/src/workflow-builder/index.ts`
- Test: `packages/app-core/test/workflow-builder/inspectors.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–5 exports (`useBuilderStore`, `useBuilderEnv`, `useDraft`, `useSummaryCtx`, `selectInboundTargetIds`, `summarizeRule`).
- Produces: `InspectorPanel` (renders `StateInspector` or `TransitionInspector` from the selection, or the idle hint `Select a state or a transition to edit it.`), `StateInspector`, `TransitionInspector`, `AddRuleMenu({ transitionIndex })` with `defaultRuleFor(kind, def): Rule`.

- [ ] **Step 1: Write the failing inspectors test**

Create `packages/app-core/test/workflow-builder/inspectors.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createDraftStore, type DraftStore } from '../../src/workflow-builder/draft-store.js';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import { BuilderProvider, type BuilderEnvironment } from '../../src/workflow-builder/ui/builder-context.tsx';
import { InspectorPanel } from '../../src/workflow-builder/ui/inspector-panel.tsx';

const kanban = WORKFLOW_TEMPLATES.find((template) => template.id === 'simple-kanban')!;

function env(overrides: Partial<BuilderEnvironment> = {}): BuilderEnvironment {
  return {
    workspaceId: newUlid(),
    session: { userId: newUlid(), role: 'admin' },
    gateway: createFakeGateway(),
    members: [],
    ticketTypes: [],
    canAuthor: true,
    ...overrides,
  };
}

function renderPanel(store: DraftStore, environment = env()) {
  return render(
    <BuilderProvider store={store} env={environment}>
      <InspectorPanel />
    </BuilderProvider>,
  );
}

describe('InspectorPanel', () => {
  it('hints when nothing is selected', () => {
    renderPanel(createDraftStore(draftFromTemplate(kanban)));
    expect(screen.getByText('Select a state or a transition to edit it.')).toBeInTheDocument();
  });
});

describe('StateInspector', () => {
  it('renames the selected state', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.select({ kind: 'state', stateId: 'doing' });
    renderPanel(store);
    const nameInput = screen.getByRole('textbox', { name: 'State name' });
    await user.clear(nameInput);
    await user.type(nameInput, 'In review');
    expect(store.getState().def.states.find((state) => state.id === 'doing')?.name).toBe('In review');
  });

  it('sets the selected state as the start state', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.select({ kind: 'state', stateId: 'doing' });
    renderPanel(store);
    await user.click(screen.getByRole('button', { name: 'Set as start' }));
    expect(store.getState().def.initialStateId).toBe('doing');
  });

  it('the start state itself shows a disabled Set as start', () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.select({ kind: 'state', stateId: 'todo' });
    renderPanel(store);
    expect(screen.getByRole('button', { name: 'Set as start' })).toBeDisabled();
  });

  it('deletes the selected state', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.select({ kind: 'state', stateId: 'doing' });
    renderPanel(store);
    await user.click(screen.getByRole('button', { name: 'Delete state' }));
    expect(store.getState().def.states.map((state) => state.id)).toEqual(['todo', 'done']);
    expect(store.getState().selection).toEqual({ kind: 'none' });
  });

  it('renders read-only when the viewer cannot author', () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.select({ kind: 'state', stateId: 'doing' });
    renderPanel(store, env({ canAuthor: false }));
    expect(screen.getByRole('textbox', { name: 'State name' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Delete state' })).not.toBeInTheDocument();
  });
});

describe('TransitionInspector', () => {
  it('names both ends of the transition, including the any-state source', () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.addTransition('*', 'done');
    store.actions.select({ kind: 'transition', index: 4 });
    renderPanel(store);
    expect(screen.getByText('From Any state to Done')).toBeInTheDocument();
  });

  it('adds a rule of each kind with honest defaults', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.select({ kind: 'transition', index: 2 }); // doing -> done
    renderPanel(store);
    await user.click(screen.getByRole('button', { name: 'Add rule' }));
    await user.click(screen.getByRole('menuitem', { name: 'Require a comment' }));
    expect(store.getState().def.transitions[2]?.rules).toEqual([{ kind: 'require-comment' }]);
  });

  it('defaults require-different-user to the first transition target', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.select({ kind: 'transition', index: 2 });
    renderPanel(store);
    await user.click(screen.getByRole('button', { name: 'Add rule' }));
    await user.click(screen.getByRole('menuitem', { name: 'Require a different user (four eyes)' }));
    expect(store.getState().def.transitions[2]?.rules).toEqual([
      { kind: 'require-different-user', thanActorOf: { to: 'doing' } },
    ]);
  });

  it('removes a rule and deletes the transition', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.addRule(2, { kind: 'require-evidence' });
    store.actions.select({ kind: 'transition', index: 2 });
    renderPanel(store);
    await user.click(screen.getByRole('button', { name: 'Remove rule' }));
    expect(store.getState().def.transitions[2]?.rules).toEqual([]);
    await user.click(screen.getByRole('button', { name: 'Delete transition' }));
    expect(store.getState().def.transitions).toHaveLength(3);
  });

  it('hides authoring controls from non-authors but still shows the rules', () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.addRule(2, { kind: 'require-evidence' });
    store.actions.select({ kind: 'transition', index: 2 });
    renderPanel(store, env({ canAuthor: false }));
    expect(screen.getByText('Must carry an attachment as evidence.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add rule' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete transition' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/inspectors.test.tsx`
Expected: FAIL — cannot resolve `../../src/workflow-builder/ui/inspector-panel.tsx`.

- [ ] **Step 3: Implement the add-rule menu**

Create `packages/app-core/src/workflow-builder/ui/rule-editors/add-rule-menu.tsx`:

```tsx
import { useState } from 'react';
import type { Rule, WorkflowDef } from '@gisik-nokma/domain';
import { selectInboundTargetIds } from '../../draft-store.js';
import { useBuilderStore, useDraft } from '../builder-context.tsx';

const RULE_MENU: { kind: Rule['kind']; label: string }[] = [
  { kind: 'restrict-to', label: 'Restrict who may move it' },
  { kind: 'require-comment', label: 'Require a comment' },
  { kind: 'require-evidence', label: 'Require evidence (attachment)' },
  { kind: 'require-field', label: 'Require a field to be set' },
  { kind: 'require-different-user', label: 'Require a different user (four eyes)' },
];

/** Honest defaults: never an empty restrict-to, never a dangling reference where one exists to point at. */
export function defaultRuleFor(kind: Rule['kind'], def: WorkflowDef): Rule {
  switch (kind) {
    case 'restrict-to':
      return { kind: 'restrict-to', assignee: true };
    case 'require-comment':
      return { kind: 'require-comment' };
    case 'require-evidence':
      return { kind: 'require-evidence' };
    case 'require-field':
      return { kind: 'require-field', field: 'dueDate' };
    case 'require-different-user': {
      const firstTarget = selectInboundTargetIds(def)[0] ?? def.initialStateId;
      return { kind: 'require-different-user', thanActorOf: { to: firstTarget } };
    }
  }
}

export function AddRuleMenu(props: { transitionIndex: number }) {
  const store = useBuilderStore();
  const draft = useDraft();
  const [open, setOpen] = useState(false);
  return (
    <div className="add-rule-menu">
      <button
        type="button"
        className="add-rule-menu__trigger"
        aria-expanded={open}
        onClick={() => setOpen((wasOpen) => !wasOpen)}
      >
        Add rule
      </button>
      {open ? (
        <ul className="add-rule-menu__list" role="menu">
          {RULE_MENU.map((entry) => (
            <li key={entry.kind}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  store.actions.addRule(props.transitionIndex, defaultRuleFor(entry.kind, draft.def));
                  setOpen(false);
                }}
              >
                {entry.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 4: Implement the inspectors**

Create `packages/app-core/src/workflow-builder/ui/state-inspector.tsx`:

```tsx
import { useBuilderEnv, useBuilderStore, useDraft } from './builder-context.tsx';

export function StateInspector(props: { stateId: string }) {
  const store = useBuilderStore();
  const { canAuthor } = useBuilderEnv();
  const draft = useDraft();
  const state = draft.def.states.find((candidate) => candidate.id === props.stateId);
  if (state === undefined) return null;
  return (
    <section className="state-inspector">
      <h3 className="state-inspector__title">State</h3>
      <label className="state-inspector__field">
        <span>State name</span>
        <input
          type="text"
          aria-label="State name"
          disabled={!canAuthor}
          value={state.name}
          onChange={(changeEvent) => store.actions.renameState(state.id, changeEvent.target.value)}
        />
      </label>
      {canAuthor ? (
        <div className="state-inspector__actions">
          <button
            type="button"
            disabled={draft.def.initialStateId === state.id}
            onClick={() => store.actions.setInitialState(state.id)}
          >
            Set as start
          </button>
          <button type="button" onClick={() => store.actions.removeState(state.id)}>
            Delete state
          </button>
        </div>
      ) : null}
    </section>
  );
}
```

Create `packages/app-core/src/workflow-builder/ui/transition-inspector.tsx`:

```tsx
import { useBuilderEnv, useBuilderStore, useDraft, useSummaryCtx } from './builder-context.tsx';
import { summarizeRule } from '../summaries.js';
import { AddRuleMenu } from './rule-editors/add-rule-menu.tsx';

export function TransitionInspector(props: { index: number }) {
  const store = useBuilderStore();
  const { canAuthor } = useBuilderEnv();
  const draft = useDraft();
  const summaryCtx = useSummaryCtx();
  const transition = draft.def.transitions[props.index];
  if (transition === undefined) return null;
  const fromName = transition.from === '*' ? 'Any state' : summaryCtx.stateName(transition.from);
  const toName = summaryCtx.stateName(transition.to);
  return (
    <section className="transition-inspector">
      <h3 className="transition-inspector__title">{`From ${fromName} to ${toName}`}</h3>
      <ul className="transition-inspector__rules">
        {transition.rules.map((rule, ruleIndex) => (
          <li className="transition-inspector__rule" key={ruleIndex}>
            <span className="transition-inspector__rule-summary">{summarizeRule(rule, summaryCtx)}</span>
            {canAuthor ? (
              <button
                type="button"
                aria-label="Remove rule"
                onClick={() => store.actions.removeRule(props.index, ruleIndex)}
              >
                Remove rule
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      {canAuthor ? (
        <div className="transition-inspector__actions">
          <AddRuleMenu transitionIndex={props.index} />
          <button type="button" onClick={() => store.actions.removeTransition(props.index)}>
            Delete transition
          </button>
        </div>
      ) : null}
    </section>
  );
}
```

Create `packages/app-core/src/workflow-builder/ui/inspector-panel.tsx`:

```tsx
import { useDraft } from './builder-context.tsx';
import { StateInspector } from './state-inspector.tsx';
import { TransitionInspector } from './transition-inspector.tsx';

export function InspectorPanel() {
  const draft = useDraft();
  if (draft.selection.kind === 'state') return <StateInspector stateId={draft.selection.stateId} />;
  if (draft.selection.kind === 'transition') return <TransitionInspector index={draft.selection.index} />;
  return <p className="inspector-panel__hint">Select a state or a transition to edit it.</p>;
}
```

- [ ] **Step 5: Run to verify it passes, update the barrel**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/inspectors.test.tsx`
Expected: PASS (11 tests).

Add to `packages/app-core/src/workflow-builder/index.ts`:

```ts
export * from './ui/inspector-panel.tsx';
export * from './ui/state-inspector.tsx';
export * from './ui/transition-inspector.tsx';
export * from './ui/rule-editors/add-rule-menu.tsx';
```

- [ ] **Step 6: Commit**

```bash
git add packages/app-core/src/workflow-builder packages/app-core/test/workflow-builder/inspectors.test.tsx
git commit -m "Select-to-edit inspectors: rename, set-as-start and delete for states; rules list, five-kind add menu with honest defaults, and delete for transitions; read-only for non-authors"
```

---

### Task 7: Rule editors — the five kinds behind proper pickers

Each rule on a selected transition becomes editable: people/role pickers for restrict-to (workspace members from the gateway), a picker-only field chooser for require-field (built-ins plus the bound types' fields — design decision 3), and a transition-target picker for require-different-user with the start-state honesty note (Plan 2 Open question 10, made visible).

**Files:**
- Create: `packages/app-core/src/workflow-builder/ui/rule-editors/rule-editor.tsx`
- Create: `packages/app-core/src/workflow-builder/ui/rule-editors/restrict-to-editor.tsx`
- Create: `packages/app-core/src/workflow-builder/ui/rule-editors/require-field-editor.tsx`
- Create: `packages/app-core/src/workflow-builder/ui/rule-editors/require-different-user-editor.tsx`
- Modify: `packages/app-core/src/workflow-builder/ui/transition-inspector.tsx` (render `RuleEditor` beneath each rule row when authoring)
- Modify: `packages/app-core/src/workflow-builder/index.ts`
- Test: `packages/app-core/test/workflow-builder/rule-editors.test.tsx`

**Interfaces:**
- Consumes: `WORKSPACE_ROLES`-equivalent (the four `WorkspaceRole` literals — hardcode the array `['owner', 'admin', 'member', 'guest']` here if domain exports no tuple), `fieldChoicesFor`, `selectInboundTargetIds`, contexts from Task 5.
- Produces: `RuleEditor({ transitionIndex, ruleIndex, rule })` dispatching to `RestrictToEditor` / `RequireFieldEditor` / `RequireDifferentUserEditor` (require-comment and require-evidence have nothing to configure — the dispatcher renders nothing for them).

- [ ] **Step 1: Write the failing rule-editors test**

Create `packages/app-core/test/workflow-builder/rule-editors.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { newUlid, type TicketTypeDef } from '@gisik-nokma/domain';
import { createDraftStore, type DraftStore } from '../../src/workflow-builder/draft-store.js';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import { BuilderProvider, type BuilderEnvironment } from '../../src/workflow-builder/ui/builder-context.tsx';
import { InspectorPanel } from '../../src/workflow-builder/ui/inspector-panel.tsx';

const kanban = WORKFLOW_TEMPLATES.find((template) => template.id === 'simple-kanban')!;
const ASHA = newUlid();
const BIKRAM = newUlid();

function boundType(workflowId: string): TicketTypeDef {
  return {
    id: newUlid(),
    name: 'Errand',
    icon: 'wrench',
    rank: 3,
    workflowId,
    fields: [{ id: 'counterparty', name: 'Counterparty', type: 'text' }],
  };
}

function renderInspector(store: DraftStore, envOverrides: Partial<BuilderEnvironment> = {}) {
  const environment: BuilderEnvironment = {
    workspaceId: newUlid(),
    session: { userId: newUlid(), role: 'admin' },
    gateway: createFakeGateway(),
    members: [
      { userId: ASHA, displayName: 'Asha', role: 'member' },
      { userId: BIKRAM, displayName: 'Bikram', role: 'admin' },
    ],
    ticketTypes: [boundType(store.getState().def.id)],
    canAuthor: true,
    ...envOverrides,
  };
  return render(
    <BuilderProvider store={store} env={environment}>
      <InspectorPanel />
    </BuilderProvider>,
  );
}

describe('RestrictToEditor', () => {
  it('toggles assignee, roles, and named members into the rule', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.addRule(0, { kind: 'restrict-to', assignee: true });
    store.actions.select({ kind: 'transition', index: 0 });
    renderInspector(store);
    const editor = screen.getByTestId('restrict-to-editor');
    await user.click(within(editor).getByRole('checkbox', { name: 'The assignee' }));
    await user.click(within(editor).getByRole('checkbox', { name: 'Role: admin' }));
    await user.click(within(editor).getByRole('checkbox', { name: 'Asha' }));
    expect(store.getState().def.transitions[0]?.rules[0]).toEqual({
      kind: 'restrict-to',
      roles: ['admin'],
      userIds: [ASHA],
    });
  });

  it('shows the emptiness helper when nobody is picked', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.addRule(0, { kind: 'restrict-to', assignee: true });
    store.actions.select({ kind: 'transition', index: 0 });
    renderInspector(store);
    await user.click(screen.getByRole('checkbox', { name: 'The assignee' }));
    expect(
      screen.getByText('Pick at least one — a restriction that names nobody can never be satisfied.'),
    ).toBeInTheDocument();
  });
});

describe('RequireFieldEditor', () => {
  it('offers built-ins plus the bound types fields, and picks into the rule', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.addRule(0, { kind: 'require-field', field: 'dueDate' });
    store.actions.select({ kind: 'transition', index: 0 });
    renderInspector(store);
    const picker = screen.getByRole('combobox', { name: 'Field' });
    const optionLabels = within(picker)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(optionLabels).toEqual(['Title', 'Description', 'Due date', 'Counterparty (Errand)']);
    await user.selectOptions(picker, 'counterparty');
    expect(store.getState().def.transitions[0]?.rules[0]).toEqual({
      kind: 'require-field',
      field: 'counterparty',
    });
  });

  it('warns when the rule names a field no bound type carries', () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.addRule(0, { kind: 'require-field', field: 'ghost-field' });
    store.actions.select({ kind: 'transition', index: 0 });
    renderInspector(store);
    expect(
      screen.getByText('This field is not on any ticket type bound to this workflow.'),
    ).toBeInTheDocument();
  });
});

describe('RequireDifferentUserEditor', () => {
  it('offers only states some transition points at, naming the move', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.addRule(2, { kind: 'require-different-user', thanActorOf: { to: 'doing' } });
    store.actions.select({ kind: 'transition', index: 2 });
    renderInspector(store);
    const picker = screen.getByRole('combobox', { name: 'Earlier move' });
    const optionLabels = within(picker)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(optionLabels).toEqual(['the move to "Doing"', 'the move to "To do"', 'the move to "Done"']);
    await user.selectOptions(picker, 'done');
    expect(store.getState().def.transitions[2]?.rules[0]).toEqual({
      kind: 'require-different-user',
      thanActorOf: { to: 'done' },
    });
  });

  it('notes the vacuous case when the rule watches the start state', () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    // 'todo' is already a transition target (doing -> todo) AND the initial state — the vacuous case
    store.actions.addRule(2, { kind: 'require-different-user', thanActorOf: { to: 'todo' } });
    store.actions.select({ kind: 'transition', index: 2 });
    renderInspector(store);
    expect(
      screen.getByText(
        'A ticket born in the start state has nobody to differ from — this rule only bites once the move to "To do" has actually been performed.',
      ),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/rule-editors.test.tsx`
Expected: FAIL — `restrict-to-editor` test id not found (the editors do not exist yet).

- [ ] **Step 3: Implement the three configurable editors and the dispatcher**

Create `packages/app-core/src/workflow-builder/ui/rule-editors/restrict-to-editor.tsx`:

```tsx
import type { Rule, WorkspaceRole } from '@gisik-nokma/domain';
import { useBuilderEnv, useBuilderStore } from '../builder-context.tsx';

const ALL_ROLES: readonly WorkspaceRole[] = ['owner', 'admin', 'member', 'guest'];

type RestrictTo = Extract<Rule, { kind: 'restrict-to' }>;

/** Normalise: empty arrays and false flags are omitted, so the def never carries dead keys. */
function normalised(rule: RestrictTo): RestrictTo {
  const next: RestrictTo = { kind: 'restrict-to' };
  if (rule.assignee === true) next.assignee = true;
  if (rule.roles !== undefined && rule.roles.length > 0) next.roles = rule.roles;
  if (rule.userIds !== undefined && rule.userIds.length > 0) next.userIds = rule.userIds;
  return next;
}

export function RestrictToEditor(props: { transitionIndex: number; ruleIndex: number; rule: RestrictTo }) {
  const store = useBuilderStore();
  const { members } = useBuilderEnv();
  const { rule } = props;
  const isEmpty =
    rule.assignee !== true &&
    (rule.roles === undefined || rule.roles.length === 0) &&
    (rule.userIds === undefined || rule.userIds.length === 0);

  function update(change: Partial<RestrictTo>): void {
    store.actions.updateRule(props.transitionIndex, props.ruleIndex, normalised({ ...rule, ...change }));
  }

  return (
    <div className="restrict-to-editor" data-testid="restrict-to-editor">
      <label className="restrict-to-editor__option">
        <input
          type="checkbox"
          aria-label="The assignee"
          checked={rule.assignee === true}
          onChange={(changeEvent) => update({ assignee: changeEvent.target.checked })}
        />
        <span>The assignee</span>
      </label>
      <fieldset className="restrict-to-editor__roles">
        <legend>Roles</legend>
        {ALL_ROLES.map((role) => (
          <label key={role}>
            <input
              type="checkbox"
              aria-label={`Role: ${role}`}
              checked={rule.roles?.includes(role) ?? false}
              onChange={(changeEvent) => {
                const current = rule.roles ?? [];
                update({
                  roles: changeEvent.target.checked
                    ? [...current, role]
                    : current.filter((candidate) => candidate !== role),
                });
              }}
            />
            <span>{role}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="restrict-to-editor__people">
        <legend>Named people</legend>
        {members.map((member) => (
          <label key={member.userId}>
            <input
              type="checkbox"
              aria-label={member.displayName}
              checked={rule.userIds?.includes(member.userId) ?? false}
              onChange={(changeEvent) => {
                const current = rule.userIds ?? [];
                update({
                  userIds: changeEvent.target.checked
                    ? [...current, member.userId]
                    : current.filter((candidate) => candidate !== member.userId),
                });
              }}
            />
            <span>{member.displayName}</span>
          </label>
        ))}
      </fieldset>
      {isEmpty ? (
        <p className="restrict-to-editor__empty-warning">
          Pick at least one — a restriction that names nobody can never be satisfied.
        </p>
      ) : null}
    </div>
  );
}
```

Create `packages/app-core/src/workflow-builder/ui/rule-editors/require-field-editor.tsx`:

```tsx
import type { Rule } from '@gisik-nokma/domain';
import { fieldChoicesFor } from '../../fields.js';
import { useBuilderEnv, useBuilderStore, useDraft } from '../builder-context.tsx';

type RequireField = Extract<Rule, { kind: 'require-field' }>;

/**
 * Picker-only by design: a free-typed field id would author a rule that can
 * never legally fire — a lie factory (design decision 3).
 */
export function RequireFieldEditor(props: { transitionIndex: number; ruleIndex: number; rule: RequireField }) {
  const store = useBuilderStore();
  const { ticketTypes } = useBuilderEnv();
  const draft = useDraft();
  const boundTypes = ticketTypes.filter((type) => type.workflowId === draft.def.id);
  const choices = fieldChoicesFor(boundTypes);
  const known = choices.some((choice) => choice.id === props.rule.field);
  return (
    <div className="require-field-editor">
      <label>
        <span>Field</span>
        <select
          aria-label="Field"
          value={known ? props.rule.field : ''}
          onChange={(changeEvent) =>
            store.actions.updateRule(props.transitionIndex, props.ruleIndex, {
              kind: 'require-field',
              field: changeEvent.target.value,
            })
          }
        >
          {known ? null : <option value="" disabled hidden></option>}
          {choices.map((choice) => (
            <option key={choice.id} value={choice.id}>
              {choice.source === 'Built-in' ? choice.name : `${choice.name} (${choice.source})`}
            </option>
          ))}
        </select>
      </label>
      {known ? null : (
        <p className="require-field-editor__unknown-warning">
          This field is not on any ticket type bound to this workflow.
        </p>
      )}
    </div>
  );
}
```

Create `packages/app-core/src/workflow-builder/ui/rule-editors/require-different-user-editor.tsx`:

```tsx
import type { Rule } from '@gisik-nokma/domain';
import { selectInboundTargetIds } from '../../draft-store.js';
import { useBuilderStore, useDraft, useSummaryCtx } from '../builder-context.tsx';

type RequireDifferentUser = Extract<Rule, { kind: 'require-different-user' }>;

export function RequireDifferentUserEditor(props: {
  transitionIndex: number;
  ruleIndex: number;
  rule: RequireDifferentUser;
}) {
  const store = useBuilderStore();
  const draft = useDraft();
  const summaryCtx = useSummaryCtx();
  const target = props.rule.thanActorOf.to;
  const targetIds = selectInboundTargetIds(draft.def);
  const known = targetIds.includes(target);
  return (
    <div className="require-different-user-editor">
      <label>
        <span>Earlier move</span>
        <select
          aria-label="Earlier move"
          value={known ? target : ''}
          onChange={(changeEvent) =>
            store.actions.updateRule(props.transitionIndex, props.ruleIndex, {
              kind: 'require-different-user',
              thanActorOf: { to: changeEvent.target.value },
            })
          }
        >
          {known ? null : <option value="" disabled hidden></option>}
          {targetIds.map((stateId) => (
            <option key={stateId} value={stateId}>
              {`the move to "${summaryCtx.stateName(stateId)}"`}
            </option>
          ))}
        </select>
      </label>
      {target === draft.def.initialStateId ? (
        <p className="require-different-user-editor__start-note">
          {`A ticket born in the start state has nobody to differ from — this rule only bites once the move to "${summaryCtx.stateName(target)}" has actually been performed.`}
        </p>
      ) : null}
    </div>
  );
}
```

Create `packages/app-core/src/workflow-builder/ui/rule-editors/rule-editor.tsx`:

```tsx
import type { Rule } from '@gisik-nokma/domain';
import { RestrictToEditor } from './restrict-to-editor.tsx';
import { RequireFieldEditor } from './require-field-editor.tsx';
import { RequireDifferentUserEditor } from './require-different-user-editor.tsx';

/** require-comment and require-evidence have nothing to configure — their summary row is the whole story. */
export function RuleEditor(props: { transitionIndex: number; ruleIndex: number; rule: Rule }) {
  switch (props.rule.kind) {
    case 'restrict-to':
      return <RestrictToEditor transitionIndex={props.transitionIndex} ruleIndex={props.ruleIndex} rule={props.rule} />;
    case 'require-field':
      return <RequireFieldEditor transitionIndex={props.transitionIndex} ruleIndex={props.ruleIndex} rule={props.rule} />;
    case 'require-different-user':
      return (
        <RequireDifferentUserEditor transitionIndex={props.transitionIndex} ruleIndex={props.ruleIndex} rule={props.rule} />
      );
    case 'require-comment':
    case 'require-evidence':
      return null;
  }
}
```

- [ ] **Step 4: Render the editors from the transition inspector**

In `packages/app-core/src/workflow-builder/ui/transition-inspector.tsx`, add the import:

```tsx
import { RuleEditor } from './rule-editors/rule-editor.tsx';
```

and inside the rules `<li>` (after the remove button, still within the `key={ruleIndex}` item), render the editor for authors:

```tsx
            {canAuthor ? (
              <RuleEditor transitionIndex={props.index} ruleIndex={ruleIndex} rule={rule} />
            ) : null}
```

- [ ] **Step 5: Run to verify it passes, update the barrel**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/rule-editors.test.tsx test/workflow-builder/inspectors.test.tsx`
Expected: PASS (17 tests — the inspectors suite must stay green with the editors mounted).

Add to `packages/app-core/src/workflow-builder/index.ts`:

```ts
export * from './ui/rule-editors/rule-editor.tsx';
```

- [ ] **Step 6: Commit**

```bash
git add packages/app-core/src/workflow-builder packages/app-core/test/workflow-builder/rule-editors.test.tsx
git commit -m "Rule editors: member and role pickers for restrict-to, picker-only field chooser for require-field (a typo'd field id is a rule that can never fire), and a named-move picker with the start-state honesty note for four-eyes"
```

---

### Task 8: Live validation — the issues panel, anchored, plus the advisory section and the system-rules panel

`validateWorkflowDef` runs on every store change (it is the `useDraft()` render pass — no debounce, the function is pure and cheap); the issues panel lists every issue in the validator's own plain language, anchored to the offending node or edge, click-to-select. Below the issues, a visually distinct **advisory section** renders `adviseWorkflowDef`'s output the same way — same anchoring, same click-to-select, the advisory's own plain language — and says outright in its heading that nothing in it blocks publishing. Beside both, the static system-rules panel names the two invariants no workflow can author away (spec §4) — the builder's honesty about its own limits. This task carries the **full planted-defect table**: all eleven issue codes plus the one advisory code, authored through the canvas's model.

The two tiers never merge. `selectCanPublish` (Task 1) stays `validateWorkflowDef` emptiness; the advisory section is rendered from a second call and gates nothing. This task proves the panel half — a draft that trips `rdu-bypassable` and nothing else renders the advisory *while the issues list still says the workflow can be published*, so the advisory demonstrably never entered the issue array. The other half — Publish stays **enabled** and the submission commits — needs `PublishControls`, which Task 9 builds; that test lives in `publish.test.tsx` and mounts `IssuesPanel` beside `PublishControls` so both facts are asserted in one render. Neither half is optional: together they are the guarantee, and without them the tier is only a convention.

**Files:**
- Create: `packages/app-core/src/workflow-builder/ui/issues-panel.tsx`
- Create: `packages/app-core/src/workflow-builder/ui/system-rules-panel.tsx`
- Modify: `packages/app-core/src/workflow-builder/index.ts`
- Test: `packages/app-core/test/workflow-builder/validation.test.tsx`

**Interfaces:**
- Consumes: `validateWorkflowDef` and `adviseWorkflowDef` (domain), `anchorIssues` (Task 2), contexts (Task 5), `layoutDraft` (Task 1).
- Produces: `IssuesPanel` (no props — renders the issues block and, when there are any, the advisory block), `SystemRulesPanel` (no props).
- BEM blocks: `issues-panel` (existing) and `advisories-panel` (new — `__title`, `__list`, `__item`, `__jump`, `__footer`), mirroring each other so the two tiers read as siblings rather than as one list with two moods.

- [ ] **Step 1: Write the failing planted-defect test suite**

Create `packages/app-core/test/workflow-builder/validation.test.tsx`. The assertion helper compares the panel against `validateWorkflowDef`'s own output, so the tests stay correct however the reconciled validator words or orders its messages — and the advisory assertions go through `adviseWorkflowDef`'s output for the same reason. Only this plan's own copy (the all-clear line, the advisory heading and footer) is asserted character for character:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { adviseWorkflowDef, newUlid, validateWorkflowDef, type WorkflowDef } from '@gisik-nokma/domain';
import { createDraftStore, type DraftStore } from '../../src/workflow-builder/draft-store.js';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { layoutDraft } from '../../src/workflow-builder/layout.js';
import { draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import { BuilderProvider, type BuilderEnvironment } from '../../src/workflow-builder/ui/builder-context.tsx';
import { IssuesPanel } from '../../src/workflow-builder/ui/issues-panel.tsx';
import { SystemRulesPanel } from '../../src/workflow-builder/ui/system-rules-panel.tsx';

const kanban = WORKFLOW_TEMPLATES.find((template) => template.id === 'simple-kanban')!;

function kanbanStore(): DraftStore {
  return createDraftStore(draftFromTemplate(kanban));
}

function renderIssues(store: DraftStore) {
  const environment: BuilderEnvironment = {
    workspaceId: newUlid(),
    session: { userId: newUlid(), role: 'admin' },
    gateway: createFakeGateway(),
    members: [],
    ticketTypes: [],
    canAuthor: true,
  };
  return render(
    <BuilderProvider store={store} env={environment}>
      <IssuesPanel />
    </BuilderProvider>,
  );
}

/** Assert the panel shows exactly the validator's issues, then hand back the codes. */
function expectPanelMatchesValidator(store: DraftStore): string[] {
  const issues = validateWorkflowDef(store.getState().def);
  expect(issues.length).toBeGreaterThan(0);
  for (const issue of issues) {
    expect(screen.getAllByText(issue.message).length).toBeGreaterThan(0);
  }
  return issues.map((issue) => issue.code);
}

function loadDef(store: DraftStore, def: WorkflowDef): void {
  store.actions.loadDraft({ def, positions: layoutDraft(def), base: null, selection: { kind: 'none' } });
}

describe('IssuesPanel planted defects — every validateWorkflowDef code', () => {
  it('shows the all-clear on a clean def', () => {
    renderIssues(kanbanStore());
    expect(screen.getByText('No issues — this workflow can be published.')).toBeInTheDocument();
  });

  it('plants no-states by deleting every state', () => {
    const store = kanbanStore();
    for (const stateId of ['todo', 'doing', 'done']) store.actions.removeState(stateId);
    renderIssues(store);
    expect(expectPanelMatchesValidator(store)).toContain('no-states');
  });

  it('plants duplicate-state-id via a loaded def', () => {
    // the store mints ULID state ids, so a duplicate can only arrive inside a
    // loaded def (a clone or an externally saved draft) — still the canvas's model
    const store = kanbanStore();
    const def = store.getState().def;
    loadDef(store, { ...def, states: [...def.states, { id: 'done', name: 'Done twice', category: 'terminal' }] });
    renderIssues(store);
    expect(expectPanelMatchesValidator(store)).toContain('duplicate-state-id');
  });

  it('plants no-terminal-state by recategorising the only terminal state', () => {
    const store = kanbanStore();
    store.actions.setStateCategory('done', 'active');
    renderIssues(store);
    expect(expectPanelMatchesValidator(store)).toContain('no-terminal-state');
  });

  it('plants unknown-transition-state via a loaded def', () => {
    // removeState cascades a state's edges, so a dangling edge too can only
    // arrive inside a loaded def
    const store = kanbanStore();
    const def = store.getState().def;
    loadDef(store, { ...def, transitions: [...def.transitions, { from: 'doing', to: 'ghost', rules: [] }] });
    renderIssues(store);
    expect(expectPanelMatchesValidator(store)).toContain('unknown-transition-state');
  });

  it('plants duplicate-transition by drawing the same edge twice', () => {
    const store = kanbanStore();
    store.actions.addTransition('todo', 'doing');
    renderIssues(store);
    expect(expectPanelMatchesValidator(store)).toContain('duplicate-transition');
  });

  it('plants unreachable-state by adding an unconnected state', () => {
    const store = kanbanStore();
    store.actions.addState({ name: 'Island' });
    renderIssues(store);
    expect(expectPanelMatchesValidator(store)).toContain('unreachable-state');
  });

  it('plants terminal-no-inbound by making the start state terminal', () => {
    const store = kanbanStore();
    // a two-state def whose start has no inbound edge, authored entirely by gestures
    for (const stateId of ['todo', 'doing', 'done']) store.actions.removeState(stateId);
    const start = store.actions.addState({ name: 'Intake' });
    const finish = store.actions.addState({ name: 'Filed', category: 'terminal' });
    store.actions.addTransition(start, finish);
    expect(validateWorkflowDef(store.getState().def)).toEqual([]);
    store.actions.setStateCategory(start, 'terminal');
    renderIssues(store);
    expect(expectPanelMatchesValidator(store)).toContain('terminal-no-inbound');
  });

  it('plants unknown-initial-state by deleting the start state', () => {
    const store = kanbanStore();
    store.actions.removeState('todo');
    renderIssues(store);
    expect(expectPanelMatchesValidator(store)).toContain('unknown-initial-state');
  });

  it('plants empty-restrict-to by unpicking everyone', () => {
    const store = kanbanStore();
    store.actions.addRule(0, { kind: 'restrict-to', assignee: true });
    store.actions.updateRule(0, 0, { kind: 'restrict-to' });
    renderIssues(store);
    expect(expectPanelMatchesValidator(store)).toContain('empty-restrict-to');
  });

  it('plants rdu-unknown-state by deleting the watched state', () => {
    const store = kanbanStore();
    // rule sits on todo -> doing and watches 'done'; deleting 'done' leaves the
    // rule's reference dangling (decision 1: rules are never silently rewritten)
    store.actions.addRule(0, { kind: 'require-different-user', thanActorOf: { to: 'done' } });
    store.actions.removeState('done');
    renderIssues(store);
    expect(expectPanelMatchesValidator(store)).toContain('rdu-unknown-state');
  });

  it('plants rdu-unenterable-state by watching a state nothing enters', () => {
    const store = kanbanStore();
    // drop the only way back into the start state, then ask for a second person
    // on a move into it: the state exists, but no move in this version reaches
    // it, so the rule can never require anybody
    store.actions.removeTransition(1); // doing -> todo
    store.actions.addRule(1, { kind: 'require-different-user', thanActorOf: { to: 'todo' } });
    renderIssues(store);
    expect(expectPanelMatchesValidator(store)).toContain('rdu-unenterable-state');
  });
});

describe('IssuesPanel advisories — a second tier that blocks nothing', () => {
  /** The kanban draft plus a fast track that skips Doing, guarded by a rule watching Doing. */
  function bypassableStore(): DraftStore {
    const store = kanbanStore();
    store.actions.addTransition('todo', 'done');
    store.actions.addRule(4, { kind: 'require-different-user', thanActorOf: { to: 'doing' } });
    return store;
  }

  it('warns about a bypassable four-eyes rule without calling it an issue', () => {
    const store = bypassableStore();
    const def = store.getState().def;
    // the def is clean by the validator's lights — that is the whole point
    expect(validateWorkflowDef(def)).toEqual([]);
    const advisories = adviseWorkflowDef(def);
    expect(advisories.map((advisory) => advisory.code)).toEqual(['rdu-bypassable']);

    renderIssues(store);
    expect(screen.getByText('Worth a look — none of these block publishing')).toBeInTheDocument();
    expect(
      screen.getByText('Advisories describe a workflow that is legal but may not do what you meant.'),
    ).toBeInTheDocument();
    for (const advisory of advisories) {
      expect(screen.getAllByText(advisory.message).length).toBeGreaterThan(0);
    }
    // and the issues half still says the workflow can go out: the advisory
    // never entered validateWorkflowDef's array
    expect(screen.getByText('No issues — this workflow can be published.')).toBeInTheDocument();
  });

  it('anchors an advisory to its transition, click-to-select, like any issue', async () => {
    const user = userEvent.setup();
    const store = bypassableStore();
    store.actions.select({ kind: 'none' });
    renderIssues(store);
    const [advisory] = adviseWorkflowDef(store.getState().def);
    await user.click(screen.getByRole('button', { name: advisory!.message }));
    expect(store.getState().selection).toEqual({ kind: 'transition', index: 4 });
  });

  it('renders no advisory section at all when there is nothing to say', () => {
    const store = kanbanStore();
    expect(adviseWorkflowDef(store.getState().def)).toEqual([]);
    renderIssues(store);
    expect(
      screen.queryByText('Worth a look — none of these block publishing'),
    ).not.toBeInTheDocument();
  });
});

describe('IssuesPanel anchoring', () => {
  it('clicking a state-anchored issue selects the state', async () => {
    const user = userEvent.setup();
    const store = kanbanStore();
    const islandId = store.actions.addState({ name: 'Island' });
    store.actions.select({ kind: 'none' });
    renderIssues(store);
    const [message] = validateWorkflowDef(store.getState().def).map((issue) => issue.message);
    await user.click(screen.getByRole('button', { name: message }));
    expect(store.getState().selection).toEqual({ kind: 'state', stateId: islandId });
  });

  it('clicking a transition-anchored issue selects the transition', async () => {
    const user = userEvent.setup();
    const store = kanbanStore();
    store.actions.addRule(1, { kind: 'restrict-to' });
    renderIssues(store);
    const [message] = validateWorkflowDef(store.getState().def).map((issue) => issue.message);
    await user.click(screen.getByRole('button', { name: message }));
    expect(store.getState().selection).toEqual({ kind: 'transition', index: 1 });
  });
});

describe('SystemRulesPanel', () => {
  it('names the two invariants no workflow can author away, citing the spec', () => {
    render(<SystemRulesPanel />);
    expect(screen.getByText('System rules — in every workflow')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Provenance on everything: every move records who made it and when. "Done" always unfolds to "marked done by X on a date".',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Parents cannot outrun children: no ticket can enter a terminal state while any of its children is still open.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText('These two sit above all workflows and cannot be authored away (product design, §4).'),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/validation.test.tsx`
Expected: FAIL — cannot resolve `../../src/workflow-builder/ui/issues-panel.tsx`.

- [ ] **Step 3: Implement the issues panel**

Create `packages/app-core/src/workflow-builder/ui/issues-panel.tsx`:

```tsx
import { adviseWorkflowDef, validateWorkflowDef } from '@gisik-nokma/domain';
import { tokens } from '@gisik-nokma/ui';
import { anchorIssues, type IssueAnchor } from '../anchor-issues.js';
import type { BuilderSelection } from '../draft-store.js';
import { useBuilderStore, useDraft } from './builder-context.tsx';

function selectionFor(anchor: IssueAnchor): BuilderSelection {
  switch (anchor.kind) {
    case 'state':
      return { kind: 'state', stateId: anchor.stateId };
    case 'transition':
      return { kind: 'transition', index: anchor.index };
    case 'workflow':
      return { kind: 'none' };
  }
}

/**
 * Live validation: this render IS the validation run — validateWorkflowDef is
 * pure and cheap, and useDraft() re-renders on every store change. The panel
 * speaks the validator's own plain language; it never rephrases an issue.
 *
 * Two tiers, two calls, never merged. adviseWorkflowDef's output is rendered
 * in its own section below the issues and gates nothing: selectCanPublish is
 * validateWorkflowDef emptiness alone (design decision 9). Note the advisory
 * section renders even when there are no issues — a clean workflow with a
 * bypassable four-eyes rule is exactly the case worth showing, and an early
 * return on the all-clear would hide it.
 */
export function IssuesPanel() {
  const store = useBuilderStore();
  const draft = useDraft();
  const anchoredIssues = anchorIssues(draft.def, validateWorkflowDef(draft.def));
  const anchoredAdvisories = anchorIssues(draft.def, adviseWorkflowDef(draft.def));
  return (
    <>
      {anchoredIssues.length === 0 ? (
        <section className="issues-panel issues-panel--clean">
          <p className="issues-panel__all-clear">No issues — this workflow can be published.</p>
        </section>
      ) : (
        <section
          className="issues-panel"
          style={{ borderLeft: `3px solid ${tokens.workflowBuilder.issueAccent}` }}
        >
          <h3 className="issues-panel__title">Issues</h3>
          <ul className="issues-panel__list">
            {anchoredIssues.map((issue, at) => (
              <li className="issues-panel__item" key={`${issue.code}:${at}`}>
                <button
                  type="button"
                  className="issues-panel__jump"
                  onClick={() => store.actions.select(selectionFor(issue.anchor))}
                >
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {anchoredAdvisories.length > 0 ? (
        <section
          className="advisories-panel"
          style={{ borderLeft: `3px solid ${tokens.workflowBuilder.advisoryAccent}` }}
        >
          <h3 className="advisories-panel__title">Worth a look — none of these block publishing</h3>
          <ul className="advisories-panel__list">
            {anchoredAdvisories.map((advisory, at) => (
              <li className="advisories-panel__item" key={`${advisory.code}:${at}`}>
                <button
                  type="button"
                  className="advisories-panel__jump"
                  onClick={() => store.actions.select(selectionFor(advisory.anchor))}
                >
                  {advisory.message}
                </button>
              </li>
            ))}
          </ul>
          <p className="advisories-panel__footer">
            Advisories describe a workflow that is legal but may not do what you meant.
          </p>
        </section>
      ) : null}
    </>
  );
}
```

- [ ] **Step 4: Implement the system-rules panel**

Create `packages/app-core/src/workflow-builder/ui/system-rules-panel.tsx`:

```tsx
import { tokens } from '@gisik-nokma/ui';

/**
 * The builder's honesty about its own limits (spec §4): two invariants sit
 * above all workflows and cannot be authored away. Static by design — there
 * is nothing to configure, which is the whole point.
 */
export function SystemRulesPanel() {
  return (
    <aside
      className="system-rules-panel"
      style={{
        border: `1px solid ${tokens.workflowBuilder.panelBorder}`,
        color: tokens.workflowBuilder.textMuted,
        borderRadius: 8,
        padding: '8px 12px',
      }}
    >
      <h3 className="system-rules-panel__title">System rules — in every workflow</h3>
      <ul className="system-rules-panel__list">
        <li className="system-rules-panel__rule">
          Provenance on everything: every move records who made it and when. "Done" always unfolds to
          "marked done by X on a date".
        </li>
        <li className="system-rules-panel__rule">
          Parents cannot outrun children: no ticket can enter a terminal state while any of its children
          is still open.
        </li>
      </ul>
      <p className="system-rules-panel__footer">
        These two sit above all workflows and cannot be authored away (product design, §4).
      </p>
    </aside>
  );
}
```

- [ ] **Step 5: Run to verify it passes, update the barrel**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/validation.test.tsx`
Expected: PASS (18 tests — 1 all-clear, 11 planted defects, 2 anchoring, 3 advisory tier, 1 system rules). Cross-check against the coverage table: every one of the eleven issue codes appears in a test name, and the one advisory code appears in the advisory describe block. The advisory half of the guarantee — Publish stays enabled and the submission commits — lands in Task 9's `publish.test.tsx`; do not mark this task done believing it has been proven here.

Add to `packages/app-core/src/workflow-builder/index.ts`:

```ts
export * from './ui/issues-panel.tsx';
export * from './ui/system-rules-panel.tsx';
```

- [ ] **Step 6: Commit**

```bash
git add packages/app-core/src/workflow-builder packages/app-core/test/workflow-builder/validation.test.tsx
git commit -m "Live validation: issues panel speaks the validator's own language, anchored per code and click-to-select; a separate advisory section that says in its own heading that it blocks nothing; system-rules panel names the two unauthorable invariants; all eleven issue codes and the one advisory code proven against planted defects"
```

---

### Task 9: The publish flow — version bump, state-mapping dialog, refusals verbatim

Publishing emits `workflow.defined` through the gateway. The button is disabled while the draft is invalid — and only while it is invalid: an advisory never disables it. When the new version drops states the base has, the state-mapping dialog lists every dropped state with its ticket count and a target picker, and requires a destination for each **whether or not anything sits there** — the server's stranded-state refusal surfaced as UI before it ever fires. The count is a courtesy that degrades honestly; the mapping is the contract. Every server result renders honestly: committed, refused (reason verbatim), invalid (message verbatim).

**Files:**
- Create: `packages/app-core/src/workflow-builder/ui/state-mapping-dialog.tsx`
- Create: `packages/app-core/src/workflow-builder/ui/publish-controls.tsx`
- Modify: `packages/app-core/src/workflow-builder/index.ts`
- Test: `packages/app-core/test/workflow-builder/publish.test.tsx`

**Interfaces:**
- Consumes: `droppedStates`, `buildPublishPayload`, `buildWorkflowDefinedEvent` (Task 4), `selectIssues` (Task 1), contexts (Task 5); `IssuesPanel` (Task 8) in the advisory test only.
- **Gating is `selectIssues(draft).length === 0` — `validateWorkflowDef` emptiness, advisories excluded (design decision 9).** `PublishControls` does not call `adviseWorkflowDef` at all; the advisory section belongs to the issues panel and has no say here. The test below is what stops a later "unification" from quietly turning warnings into blockers.
- Produces:
  - `StateMappingDialog(props: { dropped: { id: string; name: string }[]; occupancy: Record<string, number> | null; occupancyFailed: boolean; targetStates: { id: string; name: string }[]; fromVersion: number; toVersion: number; onCancel(): void; onConfirm(mapping: Record<string, string>): void })`
  - `PublishControls(props: { onPublished?: (payload: PublishedWorkflowDef) => void })` — renders nothing when `env.canAuthor` is false (the server would refuse anyway; Task 12 proves the refusal path too)

- [ ] **Step 1: Write the failing publish tests**

Create `packages/app-core/test/workflow-builder/publish.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { adviseWorkflowDef, newUlid, validateWorkflowDef, type PublishedWorkflowDef } from '@gisik-nokma/domain';
import { createDraftStore, draftFromPublished, type DraftStore } from '../../src/workflow-builder/draft-store.js';
import { createFakeGateway, type FakeGatewaySeed } from '../../src/workflow-builder/fake-gateway.js';
import { draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import { BuilderProvider, type BuilderEnvironment } from '../../src/workflow-builder/ui/builder-context.tsx';
import { IssuesPanel } from '../../src/workflow-builder/ui/issues-panel.tsx';
import { PublishControls } from '../../src/workflow-builder/ui/publish-controls.tsx';

const kanban = WORKFLOW_TEMPLATES.find((template) => template.id === 'simple-kanban')!;

function publishedKanban(id: string): PublishedWorkflowDef {
  return {
    id,
    version: 2,
    name: 'Kanban',
    initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' },
      { id: 'review', name: 'Review', category: 'active' },
      { id: 'done', name: 'Done', category: 'terminal' },
    ],
    transitions: [
      { from: 'todo', to: 'review', rules: [] },
      { from: 'review', to: 'done', rules: [] },
      { from: 'done', to: 'todo', rules: [] },
    ],
  };
}

function setup(store: DraftStore, seed: FakeGatewaySeed = {}, withPanel = false) {
  const gateway = createFakeGateway(seed);
  const environment: BuilderEnvironment = {
    workspaceId: newUlid(),
    session: { userId: newUlid(), role: 'admin' },
    gateway,
    members: [],
    ticketTypes: [],
    canAuthor: true,
  };
  render(
    <BuilderProvider store={store} env={environment}>
      {withPanel ? <IssuesPanel /> : null}
      <PublishControls />
    </BuilderProvider>,
  );
  return gateway;
}

/** A draft edited down from published version 2: the Review state removed. */
function draftDroppingReview(workflowId: string): DraftStore {
  const store = createDraftStore(draftFromPublished(publishedKanban(workflowId)));
  store.actions.addTransition('todo', 'done'); // keep the graph sound without Review
  store.actions.removeState('review');
  return store;
}

describe('PublishControls gating', () => {
  it('disables publish while the draft is invalid, naming why', async () => {
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.setStateCategory('done', 'active');
    setup(store);
    const button = screen.getByRole('button', { name: 'Publish' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', 'Fix the issues below first.');
  });

  // The planted defect that makes the advisory tier a guarantee rather than a
  // convention (design decision 9). If anyone ever folds adviseWorkflowDef into
  // selectCanPublish, this is the test that goes red.
  it('an advisory does not gate publish — the button stays enabled and the publish commits', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    store.actions.addTransition('todo', 'done'); // a fast track that skips Doing
    store.actions.addRule(4, { kind: 'require-different-user', thanActorOf: { to: 'doing' } });

    const def = store.getState().def;
    expect(validateWorkflowDef(def)).toEqual([]);
    const advisories = adviseWorkflowDef(def);
    expect(advisories.map((advisory) => advisory.code)).toEqual(['rdu-bypassable']);

    const gateway = setup(store, {}, true);
    expect(screen.getByText('Worth a look — none of these block publishing')).toBeInTheDocument();
    expect(screen.getAllByText(advisories[0]!.message).length).toBeGreaterThan(0);

    const button = screen.getByRole('button', { name: 'Publish' });
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('title');

    await user.click(button);
    expect(await screen.findByText('Version 1 published.')).toBeInTheDocument();
    expect(gateway.submitted).toHaveLength(1);
    // and the advisory is still on screen after a successful publish — it was
    // never a thing to be cleared, only a thing to be told
    expect(screen.getByText('Worth a look — none of these block publishing')).toBeInTheDocument();
  });
});

describe('PublishControls — clean publish', () => {
  it('submits workflow.defined version 1 for a fresh draft and reports success', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    const gateway = setup(store);
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Version 1 published.')).toBeInTheDocument();
    expect(gateway.submitted).toHaveLength(1);
    const event = gateway.submitted[0]!;
    expect(event.type).toBe('workflow.defined');
    expect(event.entity).toEqual({ kind: 'workflow', id: store.getState().def.id });
    const payload = event.payload as PublishedWorkflowDef;
    expect(payload.version).toBe(1);
    expect('stateMapping' in payload).toBe(false);
  });
});

describe('PublishControls — the state-mapping dialog', () => {
  it('lists every stranded state with its in-flight count and requires a target for each', async () => {
    const user = userEvent.setup();
    const workflowId = newUlid();
    const store = draftDroppingReview(workflowId);
    const gateway = setup(store, { occupancy: { [workflowId]: { review: 4 } } });

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('Every dropped state needs a destination')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Version 3 removes states that version 2 has. Publishing cannot see which tickets sit in which state, so every removed state needs a destination — occupied or not.',
      ),
    ).toBeInTheDocument();

    const row = await screen.findByTestId('mapping-row-review');
    expect(within(row).getByText('Review')).toBeInTheDocument();
    expect(await within(row).findByText('4 tickets sit here today')).toBeInTheDocument();

    const confirm = screen.getByRole('button', { name: 'Publish with this mapping' });
    expect(confirm).toBeDisabled();
    await user.selectOptions(within(row).getByRole('combobox', { name: 'Send them to — Review' }), 'todo');
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(await screen.findByText('Version 3 published.')).toBeInTheDocument();
    const payload = gateway.submitted[0]!.payload as PublishedWorkflowDef;
    expect(payload.version).toBe(3);
    expect(payload.stateMapping).toEqual({ review: 'todo' });
  });

  it('says so when the count read fails, and still demands the mapping', async () => {
    const user = userEvent.setup();
    const store = draftDroppingReview(newUlid());
    setup(store, { occupancyError: true });
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    const row = await screen.findByTestId('mapping-row-review');
    expect(await within(row).findByText('ticket count unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish with this mapping' })).toBeDisabled();
  });

  it('cancel closes the dialog without submitting anything', async () => {
    const user = userEvent.setup();
    const store = draftDroppingReview(newUlid());
    const gateway = setup(store);
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Every dropped state needs a destination')).not.toBeInTheDocument();
    expect(gateway.submitted).toHaveLength(0);
  });
});

describe('PublishControls — server results rendered honestly', () => {
  it('renders a stranded-state refusal verbatim (planted defect: mapping-less publish)', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    const reason =
      'Version 3 drops state(s) "review" that version 2 has; publishing cannot see which tickets sit in which state, so every dropped state needs a stateMapping entry.';
    setup(store, {
      submitResults: [{ status: 'refused', eventId: 'evt', rule: 'workflow-state-mapping', reason }],
    });
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('The server refused this publish.')).toBeInTheDocument();
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.getByText('rule: workflow-state-mapping')).toBeInTheDocument();
  });

  it('renders a stale-version refusal verbatim (someone published while we edited)', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    const reason = 'Workflow "Kanban" is at version 3; the next published version must be 4, not 3.';
    setup(store, {
      submitResults: [{ status: 'refused', eventId: 'evt', rule: 'workflow-version', reason }],
    });
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('The server refused this publish.')).toBeInTheDocument();
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.getByText('rule: workflow-version')).toBeInTheDocument();
  });

  it('renders an invalid-envelope result verbatim', async () => {
    const user = userEvent.setup();
    const store = createDraftStore(draftFromTemplate(kanban));
    setup(store, {
      submitResults: [
        { status: 'invalid', eventId: null, code: 'unknown-event-type', message: 'The event type workflow.defined is not registered.' },
      ],
    });
    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('The server could not read this claim.')).toBeInTheDocument();
    expect(screen.getByText('The event type workflow.defined is not registered.')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/publish.test.tsx`
Expected: FAIL — cannot resolve `../../src/workflow-builder/ui/publish-controls.tsx`.

- [ ] **Step 3: Implement the state-mapping dialog**

Create `packages/app-core/src/workflow-builder/ui/state-mapping-dialog.tsx`:

```tsx
import { useState } from 'react';
import { tokens } from '@gisik-nokma/ui';

function countLine(count: number | undefined, failed: boolean, loading: boolean): string {
  if (failed) return 'ticket count unavailable';
  if (loading) return 'counting tickets…';
  const n = count ?? 0;
  return n === 1 ? '1 ticket sits here today' : `${n} tickets sit here today`;
}

/** The server's stranded-state refusal, surfaced before it fires: every dropped state must be sent somewhere real. */
export function StateMappingDialog(props: {
  dropped: { id: string; name: string }[];
  occupancy: Record<string, number> | null;
  occupancyFailed: boolean;
  targetStates: { id: string; name: string }[];
  fromVersion: number;
  toVersion: number;
  onCancel(): void;
  onConfirm(mapping: Record<string, string>): void;
}) {
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const complete = props.dropped.every((state) => mapping[state.id] !== undefined);
  const loading = props.occupancy === null && !props.occupancyFailed;
  return (
    <div
      className="state-mapping-dialog"
      role="dialog"
      aria-label="Every dropped state needs a destination"
      style={{
        background: tokens.workflowBuilder.surface,
        color: tokens.workflowBuilder.textPrimary,
        border: `1px solid ${tokens.workflowBuilder.panelBorder}`,
        borderRadius: 8,
        padding: 16,
      }}
    >
      <h3 className="state-mapping-dialog__title">Every dropped state needs a destination</h3>
      <p className="state-mapping-dialog__body">
        {`Version ${props.toVersion} removes states that version ${props.fromVersion} has. Publishing cannot see which tickets sit in which state, so every removed state needs a destination — occupied or not.`}
      </p>
      <ul className="state-mapping-dialog__rows">
        {props.dropped.map((state) => (
          <li className="state-mapping-dialog__row" data-testid={`mapping-row-${state.id}`} key={state.id}>
            <span className="state-mapping-dialog__state-name">{state.name}</span>
            <span className="state-mapping-dialog__count">
              {countLine(props.occupancy?.[state.id], props.occupancyFailed, loading)}
            </span>
            <label className="state-mapping-dialog__target">
              <span>Send them to</span>
              <select
                aria-label={`Send them to — ${state.name}`}
                value={mapping[state.id] ?? ''}
                onChange={(changeEvent) =>
                  setMapping((current) => ({ ...current, [state.id]: changeEvent.target.value }))
                }
              >
                <option value="" disabled hidden></option>
                {props.targetStates.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>
      <div className="state-mapping-dialog__actions">
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
        <button type="button" disabled={!complete} onClick={() => props.onConfirm(mapping)}>
          Publish with this mapping
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Implement the publish controls**

Create `packages/app-core/src/workflow-builder/ui/publish-controls.tsx`:

```tsx
import { useState } from 'react';
import type { PublishedWorkflowDef } from '@gisik-nokma/domain';
import { tokens } from '@gisik-nokma/ui';
import { selectIssues } from '../draft-store.js';
import { buildPublishPayload, buildWorkflowDefinedEvent, droppedStates } from '../events.js';
import { useBuilderEnv, useDraft } from './builder-context.tsx';
import { StateMappingDialog } from './state-mapping-dialog.tsx';

type PublishPhase =
  | { phase: 'idle' }
  | { phase: 'mapping'; occupancy: Record<string, number> | null; occupancyFailed: boolean }
  | { phase: 'submitting' }
  | { phase: 'published'; version: number }
  | { phase: 'refused'; rule: string; reason: string }
  | { phase: 'invalid'; message: string };

export function PublishControls(props: { onPublished?: (payload: PublishedWorkflowDef) => void }) {
  const env = useBuilderEnv();
  const draft = useDraft();
  const [state, setState] = useState<PublishPhase>({ phase: 'idle' });
  if (!env.canAuthor) return null;

  const issues = selectIssues(draft);
  const dropped = droppedStates(draft);

  async function submitPayload(stateMapping?: Record<string, string>): Promise<void> {
    setState({ phase: 'submitting' });
    const payload = buildPublishPayload(draft, stateMapping);
    const event = buildWorkflowDefinedEvent({
      workspaceId: env.workspaceId,
      actorId: env.session.userId,
      origin: 'web',
      payload,
    });
    const [result] = await env.gateway.submit([event]);
    if (result === undefined) throw new Error('gateway.submit returned no result for the event');
    switch (result.status) {
      case 'committed':
        setState({ phase: 'published', version: payload.version });
        props.onPublished?.(payload);
        return;
      case 'refused':
        setState({ phase: 'refused', rule: result.rule, reason: result.reason });
        return;
      case 'invalid':
        setState({ phase: 'invalid', message: result.message });
        return;
    }
  }

  async function onPublishClick(): Promise<void> {
    if (dropped.length === 0) {
      await submitPayload();
      return;
    }
    setState({ phase: 'mapping', occupancy: null, occupancyFailed: false });
    try {
      const occupancy = await env.gateway.getStateOccupancy(env.workspaceId, draft.def.id);
      setState((current) => (current.phase === 'mapping' ? { ...current, occupancy } : current));
    } catch {
      // the count is a courtesy; the mapping is the contract — the dialog says the count is unavailable
      setState((current) => (current.phase === 'mapping' ? { ...current, occupancyFailed: true } : current));
    }
  }

  return (
    <div className="publish-controls">
      <button
        type="button"
        className="publish-controls__publish"
        disabled={issues.length > 0 || state.phase === 'submitting'}
        title={issues.length > 0 ? 'Fix the issues below first.' : undefined}
        onClick={() => void onPublishClick()}
      >
        Publish
      </button>
      {state.phase === 'mapping' ? (
        <StateMappingDialog
          dropped={dropped}
          occupancy={state.occupancy}
          occupancyFailed={state.occupancyFailed}
          targetStates={draft.def.states.map((candidate) => ({ id: candidate.id, name: candidate.name }))}
          fromVersion={draft.base?.version ?? 0}
          toVersion={(draft.base?.version ?? 0) + 1}
          onCancel={() => setState({ phase: 'idle' })}
          onConfirm={(mapping) => void submitPayload(mapping)}
        />
      ) : null}
      {state.phase === 'published' ? (
        <p className="publish-controls__banner publish-controls__banner--success">
          {`Version ${state.version} published.`}
        </p>
      ) : null}
      {state.phase === 'refused' ? (
        <div
          className="publish-controls__banner publish-controls__banner--refused"
          style={{ borderLeft: `3px solid ${tokens.workflowBuilder.issueAccent}` }}
        >
          <p className="publish-controls__banner-title">The server refused this publish.</p>
          <p className="publish-controls__banner-reason">{state.reason}</p>
          <p className="publish-controls__banner-rule">{`rule: ${state.rule}`}</p>
        </div>
      ) : null}
      {state.phase === 'invalid' ? (
        <div className="publish-controls__banner publish-controls__banner--invalid">
          <p className="publish-controls__banner-title">The server could not read this claim.</p>
          <p className="publish-controls__banner-reason">{state.message}</p>
        </div>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 5: Run to verify it passes, update the barrel**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/publish.test.tsx`
Expected: PASS (9 tests). The ninth is the advisory-does-not-gate-publish defect; if it fails, do not "fix" it by adding the advisory to the issues list — the failure means publish gating grew a dependency on `adviseWorkflowDef` and that dependency is the bug.

Add to `packages/app-core/src/workflow-builder/index.ts`:

```ts
export * from './ui/publish-controls.tsx';
export * from './ui/state-mapping-dialog.tsx';
```

- [ ] **Step 6: Commit**

```bash
git add packages/app-core/src/workflow-builder packages/app-core/test/workflow-builder/publish.test.tsx
git commit -m "Publish flow: version bump from the base, mapping dialog for every stranded state with in-flight counts (count is courtesy, mapping is contract), an advisory that provably does not gate publish, and every server result — committed, refused, invalid — rendered verbatim"
```

---

### Task 10: The screens — builder screen, workflow list, template gallery

Composition: `WorkflowBuilderScreen` loads workspace members and ticket types through the gateway, owns the store, and lays out header (name field + publish), system-rules panel, canvas, inspector, and issues panel. `WorkflowListScreen` lists published workflows. `TemplateGallery` offers the three templates plus Start blank. Navigation is callback props — the screens know nothing about routing (pages wire them in Task 13).

**Files:**
- Create: `packages/app-core/src/workflow-builder/ui/workflow-builder-screen.tsx`
- Create: `packages/app-core/src/workflow-builder/ui/workflow-list-screen.tsx`
- Create: `packages/app-core/src/workflow-builder/ui/template-gallery.tsx`
- Modify: `packages/app-core/src/workflow-builder/index.ts`
- Test: `packages/app-core/test/workflow-builder/screens.test.tsx`

**Interfaces:**
- Consumes: everything from Tasks 1–9.
- Produces:
  - `WorkflowBuilderScreen(props: { workspaceId: string; session: BuilderSession; gateway: WorkflowAuthoringGateway; initialDraft: WorkflowDraft; onPublished?: (payload: PublishedWorkflowDef) => void })`
  - `WorkflowListScreen(props: { workspaceId: string; session: BuilderSession; gateway: WorkflowAuthoringGateway; onOpen(workflowId: string): void; onNew(): void })`
  - `TemplateGallery(props: { onPick(template: WorkflowTemplate | null): void })` — `null` means Start blank

- [ ] **Step 1: Write the failing screens test**

Create `packages/app-core/test/workflow-builder/screens.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { cloneTemplate, draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import type { BuilderSession } from '../../src/workflow-builder/ui/builder-context.tsx';
import { TemplateGallery } from '../../src/workflow-builder/ui/template-gallery.tsx';
import { WorkflowBuilderScreen } from '../../src/workflow-builder/ui/workflow-builder-screen.tsx';
import { WorkflowListScreen } from '../../src/workflow-builder/ui/workflow-list-screen.tsx';

const kanban = WORKFLOW_TEMPLATES.find((template) => template.id === 'simple-kanban')!;
const adminSession: BuilderSession = { userId: newUlid(), role: 'admin' };

describe('WorkflowBuilderScreen', () => {
  it('loads workspace data, then shows canvas, panels, name field and publish', async () => {
    render(
      <WorkflowBuilderScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway()}
        initialDraft={draftFromTemplate(kanban)}
      />,
    );
    expect(screen.getByText('Loading workspace people and types…')).toBeInTheDocument();
    expect(await screen.findByRole('textbox', { name: 'Workflow name' })).toHaveValue('Simple kanban');
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(screen.getByText('System rules — in every workflow')).toBeInTheDocument();
    expect(screen.getByText('No issues — this workflow can be published.')).toBeInTheDocument();
    expect(screen.getByText('To do')).toBeInTheDocument(); // a canvas node
    expect(screen.getByText('Select a state or a transition to edit it.')).toBeInTheDocument();
  });

  it('edits the workflow name into the def', async () => {
    const user = userEvent.setup();
    const draft = draftFromTemplate(kanban);
    render(
      <WorkflowBuilderScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway()}
        initialDraft={draft}
      />,
    );
    const nameField = await screen.findByRole('textbox', { name: 'Workflow name' });
    await user.clear(nameField);
    await user.type(nameField, 'Shop errands');
    expect(nameField).toHaveValue('Shop errands');
  });

  it('adds a state from the header button', async () => {
    const user = userEvent.setup();
    render(
      <WorkflowBuilderScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway()}
        initialDraft={draftFromTemplate(kanban)}
      />,
    );
    await screen.findByRole('textbox', { name: 'Workflow name' });
    await user.click(screen.getByRole('button', { name: 'Add state' }));
    expect(screen.getByText('New state')).toBeInTheDocument();
  });

  it('says so when workspace data cannot load', async () => {
    const gateway = createFakeGateway();
    gateway.listMembers = async () => {
      throw new Error('boom');
    };
    render(
      <WorkflowBuilderScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={gateway}
        initialDraft={draftFromTemplate(kanban)}
      />,
    );
    expect(
      await screen.findByText('Could not load workspace people and types — reload to try again.'),
    ).toBeInTheDocument();
  });
});

describe('WorkflowListScreen', () => {
  it('lists published workflows with version and state count, and opens one', async () => {
    const user = userEvent.setup();
    const first = cloneTemplate(kanban);
    const workflows = [{ ...first, version: 3 }];
    const onOpen = vi.fn();
    render(
      <WorkflowListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway({ workflows })}
        onOpen={onOpen}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText('Simple kanban')).toBeInTheDocument();
    expect(screen.getByText('v3')).toBeInTheDocument();
    expect(screen.getByText('3 states')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Open Simple kanban' }));
    expect(onOpen).toHaveBeenCalledWith(first.id);
  });

  it('offers New workflow to authors and says when the list is empty', async () => {
    const user = userEvent.setup();
    const onNew = vi.fn();
    render(
      <WorkflowListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway()}
        onOpen={() => {}}
        onNew={onNew}
      />,
    );
    expect(await screen.findByText('No workflows published yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'New workflow' }));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it('hides New workflow from non-authors', async () => {
    render(
      <WorkflowListScreen
        workspaceId={newUlid()}
        session={{ userId: newUlid(), role: 'member' }}
        gateway={createFakeGateway()}
        onOpen={() => {}}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText('No workflows published yet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New workflow' })).not.toBeInTheDocument();
  });
});

describe('TemplateGallery', () => {
  it('offers the three templates and Start blank', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(<TemplateGallery onPick={onPick} />);
    expect(screen.getByText('Start from a template')).toBeInTheDocument();
    for (const template of WORKFLOW_TEMPLATES) {
      expect(screen.getByText(template.name)).toBeInTheDocument();
      expect(screen.getByText(template.tagline)).toBeInTheDocument();
    }
    await user.click(screen.getByRole('button', { name: 'Use this template — Errand with waits' }));
    expect(onPick).toHaveBeenCalledWith(WORKFLOW_TEMPLATES[1]);
    await user.click(screen.getByRole('button', { name: 'Start blank' }));
    expect(onPick).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/screens.test.tsx`
Expected: FAIL — cannot resolve `../../src/workflow-builder/ui/workflow-builder-screen.tsx`.

- [ ] **Step 3: Implement the builder screen**

Create `packages/app-core/src/workflow-builder/ui/workflow-builder-screen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { PublishedWorkflowDef, TicketTypeDef } from '@gisik-nokma/domain';
import { createDraftStore, type WorkflowDraft } from '../draft-store.js';
import type { WorkflowAuthoringGateway, WorkspaceMember } from '../gateway.js';
import {
  BuilderProvider,
  canAuthorRole,
  useBuilderEnv,
  useBuilderStore,
  useDraft,
  type BuilderEnvironment,
  type BuilderSession,
} from './builder-context.tsx';
import { InspectorPanel } from './inspector-panel.tsx';
import { IssuesPanel } from './issues-panel.tsx';
import { PublishControls } from './publish-controls.tsx';
import { SystemRulesPanel } from './system-rules-panel.tsx';
import { WorkflowCanvas } from './workflow-canvas.tsx';

function WorkflowNameField() {
  const store = useBuilderStore();
  const { canAuthor } = useBuilderEnv();
  const draft = useDraft();
  return (
    <input
      type="text"
      className="workflow-builder-screen__name"
      aria-label="Workflow name"
      disabled={!canAuthor}
      value={draft.def.name}
      onChange={(changeEvent) => store.actions.setWorkflowName(changeEvent.target.value)}
    />
  );
}

function AddStateButton() {
  const store = useBuilderStore();
  const { canAuthor } = useBuilderEnv();
  if (!canAuthor) return null;
  return (
    <button
      type="button"
      className="workflow-builder-screen__add-state"
      onClick={() => store.actions.addState()}
    >
      Add state
    </button>
  );
}

export function WorkflowBuilderScreen(props: {
  workspaceId: string;
  session: BuilderSession;
  gateway: WorkflowAuthoringGateway;
  initialDraft: WorkflowDraft;
  onPublished?: (payload: PublishedWorkflowDef) => void;
}) {
  const [store] = useState(() => createDraftStore(props.initialDraft));
  const [data, setData] = useState<{ members: WorkspaceMember[]; ticketTypes: TicketTypeDef[] } | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      props.gateway.listMembers(props.workspaceId),
      props.gateway.listTicketTypes(props.workspaceId),
    ])
      .then(([members, ticketTypes]) => {
        if (!cancelled) setData({ members, ticketTypes });
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [props.gateway, props.workspaceId]);

  if (loadFailed) {
    return (
      <p className="workflow-builder-screen__load-error">
        Could not load workspace people and types — reload to try again.
      </p>
    );
  }
  if (data === null) {
    return <p className="workflow-builder-screen__loading">Loading workspace people and types…</p>;
  }

  const env: BuilderEnvironment = {
    workspaceId: props.workspaceId,
    session: props.session,
    gateway: props.gateway,
    members: data.members,
    ticketTypes: data.ticketTypes,
    canAuthor: canAuthorRole(props.session.role),
  };

  return (
    <BuilderProvider store={store} env={env}>
      <div className="workflow-builder-screen">
        <header className="workflow-builder-screen__header">
          <WorkflowNameField />
          <AddStateButton />
          <PublishControls onPublished={props.onPublished} />
        </header>
        <div className="workflow-builder-screen__layout">
          <aside className="workflow-builder-screen__left">
            <SystemRulesPanel />
            <IssuesPanel />
          </aside>
          <main className="workflow-builder-screen__canvas">
            <WorkflowCanvas />
          </main>
          <aside className="workflow-builder-screen__right">
            <InspectorPanel />
          </aside>
        </div>
      </div>
    </BuilderProvider>
  );
}
```

- [ ] **Step 4: Implement the list screen and the gallery**

Create `packages/app-core/src/workflow-builder/ui/workflow-list-screen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { PublishedWorkflowDef } from '@gisik-nokma/domain';
import type { WorkflowAuthoringGateway } from '../gateway.js';
import { canAuthorRole, type BuilderSession } from './builder-context.tsx';

export function WorkflowListScreen(props: {
  workspaceId: string;
  session: BuilderSession;
  gateway: WorkflowAuthoringGateway;
  onOpen(workflowId: string): void;
  onNew(): void;
}) {
  const [workflows, setWorkflows] = useState<PublishedWorkflowDef[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void props.gateway.listWorkflows(props.workspaceId).then((loaded) => {
      if (!cancelled) setWorkflows(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [props.gateway, props.workspaceId]);

  if (workflows === null) return <p className="workflow-list__loading">Loading workflows…</p>;
  const canAuthor = canAuthorRole(props.session.role);
  return (
    <section className="workflow-list">
      <header className="workflow-list__header">
        <h2 className="workflow-list__title">Workflows</h2>
        {canAuthor ? (
          <button type="button" className="workflow-list__new" onClick={props.onNew}>
            New workflow
          </button>
        ) : null}
      </header>
      {workflows.length === 0 ? (
        <p className="workflow-list__empty">No workflows published yet.</p>
      ) : (
        <ul className="workflow-list__rows">
          {workflows.map((workflow) => (
            <li className="workflow-list__row" key={workflow.id}>
              <span className="workflow-list__name">{workflow.name}</span>
              <span className="workflow-list__version">{`v${workflow.version}`}</span>
              <span className="workflow-list__states">{`${workflow.states.length} states`}</span>
              <button
                type="button"
                aria-label={`Open ${workflow.name}`}
                onClick={() => props.onOpen(workflow.id)}
              >
                Open
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
```

Create `packages/app-core/src/workflow-builder/ui/template-gallery.tsx`:

```tsx
import { WORKFLOW_TEMPLATES, type WorkflowTemplate } from '../templates.js';

/** Cloning is the caller's job (draftFromTemplate / newDraft) — the gallery only picks. */
export function TemplateGallery(props: { onPick(template: WorkflowTemplate | null): void }) {
  return (
    <section className="template-gallery">
      <h2 className="template-gallery__title">Start from a template</h2>
      <ul className="template-gallery__cards">
        {WORKFLOW_TEMPLATES.map((template) => (
          <li className="template-gallery__card" key={template.id}>
            <h3 className="template-gallery__name">{template.name}</h3>
            <p className="template-gallery__tagline">{template.tagline}</p>
            <button
              type="button"
              aria-label={`Use this template — ${template.name}`}
              onClick={() => props.onPick(template)}
            >
              Use this template
            </button>
          </li>
        ))}
        <li className="template-gallery__card template-gallery__card--blank">
          <button type="button" onClick={() => props.onPick(null)}>
            Start blank
          </button>
        </li>
      </ul>
    </section>
  );
}
```

- [ ] **Step 5: Run to verify it passes, update the barrel**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/screens.test.tsx`
Expected: PASS (8 tests).

Add to `packages/app-core/src/workflow-builder/index.ts`:

```ts
export * from './ui/workflow-builder-screen.tsx';
export * from './ui/workflow-list-screen.tsx';
export * from './ui/template-gallery.tsx';
```

- [ ] **Step 6: Commit**

```bash
git add packages/app-core/src/workflow-builder packages/app-core/test/workflow-builder/screens.test.tsx
git commit -m "Builder, list and gallery screens: gateway-loaded workspace data, callback navigation so app-core stays router-free, gallery picks and the caller clones"
```

---

### Task 11: Ticket-type management — list, editor, fields, rank implications, and the divergence a re-binding leaves behind

Custom reusable ticket types (spec §2): name, icon, hierarchy rank, workflow binding (published workflows only), and typed custom fields with a select-options editor. Saving emits `ticket-type.defined`. Rank implications render live (`Can sit under: …` — derived from ranks; design decision 4: a type defined at or below the deepest rank requires a parent, whether it is the built-in `sub-task` or one the workspace invented). Built-in types edit name/icon/workflow but their rank is locked in the UI (design decision 7).

**And the workflow combobox is where this plan meets the owner decision of 2026-08-26** (design decision 10). A ticket pins the workflow it was created under, so re-pointing a type moves nothing that already exists — it changes only what new tickets get. That is the right semantics and the board was built for it (Plan 5 renders one column per *(workflow in use, state)*, so two populations sit side by side), but an admin who changes the binding and is never told two populations now exist is precisely the board knowing something the user does not. So the editor:

- **States the divergence** as soon as the binding changes, with a real count from `getTypeWorkflowPopulation` — naming the outgoing workflow, and degrading honestly (`counting tickets…`, `ticket count unavailable`) rather than guessing a zero.
- **Offers the migration**: one cross-workflow state map, expanded server-side into one `ticket.workflow_rebound { toWorkflowId, toStateId }` per ticket. **Plan 3 owns that event, its payload and its refusals**; this task owns the authoring surface and renders whatever refusal comes back, verbatim. The map is emphatically **not** a `stateMapping` — that field is keyed inside a single workflow's version chain and is stored on a def, and across two unrelated workflows there is no chain to key on.
- **Treats staying as a choice.** `Leave them on "${outgoing}"` is a button, not the absence of a click. A type with tickets on two workflows is a legal, renderable state of the product.
- **Will not migrate before the type is saved.** Moving existing tickets to a workflow the type is not yet bound to would leave new tickets going to the *old* workflow while the old tickets went to the new one — the exact inversion of what the admin asked for. Until `Save ticket type` commits, the move button is disabled and says why.

**Files:**
- Create: `packages/app-core/src/workflow-builder/ticket-types/rank.ts`
- Create: `packages/app-core/src/workflow-builder/ticket-types/icons.tsx`
- Create: `packages/app-core/src/workflow-builder/ticket-types/icon-picker.tsx`
- Create: `packages/app-core/src/workflow-builder/ticket-types/fields-editor.tsx`
- Create: `packages/app-core/src/workflow-builder/ticket-types/workflow-rebind-dialog.tsx`
- Create: `packages/app-core/src/workflow-builder/ticket-types/ticket-type-editor-screen.tsx`
- Create: `packages/app-core/src/workflow-builder/ticket-types/ticket-type-list-screen.tsx`
- Modify: `packages/app-core/src/workflow-builder/index.ts`
- Test: `packages/app-core/test/ticket-types/rank.test.ts`
- Test: `packages/app-core/test/ticket-types/ticket-types.test.tsx`

**Interfaces:**
- Consumes: `TicketTypeDef`, `CustomFieldDef`, `ticketTypeDefSchema`, `BUILTIN_TICKET_TYPE_SEEDS`, `DEEPEST_RANK`, `newUlid` (domain); `buildTicketTypeDefinedEvent`, gateway types incl. `MigrationRequest`/`MigrationOutcome` (Task 4); `canAuthorRole`, `BuilderSession` (Task 5).
- Produces:
  - `rankImplications(typeId: string, rank: number, allTypes: readonly TicketTypeDef[]): { parents: TicketTypeDef[]; mustHaveParent: boolean }` and `rankImplicationsCopy(implications): string`
  - `TYPE_ICONS`, `TYPE_ICON_NAMES`, `TypeIcon({ name, size? })` (unknown names fall back to a folder — data never crashes the UI)
  - `IconPicker({ value, onChange, disabled? })`, `FieldsEditor({ fields, onChange, disabled? })`
  - `WorkflowRebindDialog({ population, fromWorkflow, toWorkflow, onCancel, onConfirm(stateMap) })`
  - `TicketTypeEditorScreen({ workspaceId, session, gateway, initialDef: TicketTypeDef | null, onSaved? })`
  - `TicketTypeListScreen({ workspaceId, session, gateway, onOpen(typeId), onNew() })`

- [ ] **Step 1: Write the failing rank test**

Create `packages/app-core/test/ticket-types/rank.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { TicketTypeDef } from '@gisik-nokma/domain';
import { rankImplications, rankImplicationsCopy } from '../../src/workflow-builder/ticket-types/rank.js';

function type(id: string, name: string, rank: number): TicketTypeDef {
  return { id, name, icon: 'flag', rank, workflowId: 'wf', fields: [] };
}

const BUILTINS = [type('epic', 'Epic', 1), type('story', 'Story', 2), type('task', 'Task', 3), type('sub-task', 'Sub-task', 4)];

describe('rankImplications', () => {
  it('parents are all types of strictly lower rank, ordered by rank, excluding itself', () => {
    const { parents } = rankImplications('invoice', 3, [...BUILTINS, type('invoice', 'Invoice', 3)]);
    expect(parents.map((parent) => parent.name)).toEqual(['Epic', 'Story']);
  });

  it('the deepest rank requires a parent — built-in or workspace-invented alike (owner decision 2026-08-20)', () => {
    expect(rankImplications('sub-task', 4, BUILTINS).mustHaveParent).toBe(true);
    expect(rankImplications('invoice', 4, BUILTINS).mustHaveParent).toBe(true);
    // …and nothing slips underneath the floor: rank 5 is smaller work than a
    // sub-task, so it needs a parent all the more. This is the standing guard
    // for `>=` over `===` (design decision 4).
    expect(rankImplications('micro-step', 5, BUILTINS).mustHaveParent).toBe(true);
    // …while shallower ranks sit at the project root freely — no over-applying.
    expect(rankImplications('invoice', 3, BUILTINS).mustHaveParent).toBe(false);
    expect(rankImplications('epic', 1, BUILTINS).mustHaveParent).toBe(false);
  });
});

describe('rankImplicationsCopy', () => {
  it('names the possible parents and the root option', () => {
    expect(rankImplicationsCopy(rankImplications('invoice', 3, BUILTINS))).toBe(
      'Can sit under: Epic, Story · or at the project root.',
    );
  });

  it('a rank with no possible parents is the top of the hierarchy', () => {
    expect(rankImplicationsCopy(rankImplications('epic', 1, BUILTINS))).toBe(
      'Top of the hierarchy — sits at the project root.',
    );
  });

  it('the deepest rank names its parent requirement, and says the same thing to a custom type there', () => {
    expect(rankImplicationsCopy(rankImplications('sub-task', 4, BUILTINS))).toBe(
      'Must sit under a parent — this is the smallest kind of work, so tickets of this type always belong to something bigger. Can sit under: Epic, Story, Task.',
    );
    expect(rankImplicationsCopy(rankImplications('invoice', 4, BUILTINS))).toBe(
      'Must sit under a parent — this is the smallest kind of work, so tickets of this type always belong to something bigger. Can sit under: Epic, Story, Task.',
    );
  });
});
```

- [ ] **Step 2: Run it, implement `rank.ts`, run again**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/ticket-types/rank.test.ts` — expected FAIL (module missing). Then create `packages/app-core/src/workflow-builder/ticket-types/rank.ts`:

```ts
import { DEEPEST_RANK, type TicketTypeDef } from '@gisik-nokma/domain';

export type RankImplications = { parents: TicketTypeDef[]; mustHaveParent: boolean };

/**
 * A child's type must rank strictly below its parent's (Plan 3). Requires-parent
 * follows the RANK, not the built-in id (owner decision 2026-08-20): a type at
 * DEEPEST_RANK or below it always needs a parent — the built-in sub-task, an
 * Invoice this workspace invented beside it, and anything deeper still.
 *
 * `>=` rather than `===`: a type deeper than sub-task is smaller work again, so
 * exempting it would invert the rule's own justification and leave an escape
 * hatch at rank 5.
 *
 * DEEPEST_RANK is imported from domain — the same constant Plan 3's engine
 * refuses on — and is deliberately NOT a maximum computed over `allTypes`. In a
 * workspace that has defined nothing below Task, a locally computed max would
 * make this screen promise that Task needs a parent while the server accepted
 * one at project root: the builder would be describing a rule that does not
 * exist (design decision 4).
 */
export function rankImplications(
  typeId: string,
  rank: number,
  allTypes: readonly TicketTypeDef[],
): RankImplications {
  const parents = allTypes
    .filter((candidate) => candidate.rank < rank && candidate.id !== typeId)
    .sort((a, b) => a.rank - b.rank);
  return { parents, mustHaveParent: rank >= DEEPEST_RANK };
}

export function rankImplicationsCopy(implications: RankImplications): string {
  const names = implications.parents.map((parent) => parent.name).join(', ');
  if (implications.mustHaveParent) {
    return `Must sit under a parent — this is the smallest kind of work, so tickets of this type always belong to something bigger. Can sit under: ${names}.`;
  }
  if (implications.parents.length === 0) return 'Top of the hierarchy — sits at the project root.';
  return `Can sit under: ${names} · or at the project root.`;
}
```

Re-run: PASS (5 tests).

- [ ] **Step 3: Implement icons, icon picker, and fields editor**

Create `packages/app-core/src/workflow-builder/ticket-types/icons.tsx`:

```tsx
import {
  Banknote, Book, Calendar, Check, FileText, Flag, Folder, List, Mail, Phone,
  Receipt, Shield, Star, Truck, Users, Wrench,
} from 'lucide-react';

export const TYPE_ICONS = {
  flag: Flag,
  book: Book,
  check: Check,
  list: List,
  receipt: Receipt,
  'file-text': FileText,
  wrench: Wrench,
  truck: Truck,
  phone: Phone,
  mail: Mail,
  shield: Shield,
  calendar: Calendar,
  star: Star,
  folder: Folder,
  users: Users,
  banknote: Banknote,
} as const;

export type TypeIconName = keyof typeof TYPE_ICONS;
export const TYPE_ICON_NAMES = Object.keys(TYPE_ICONS) as TypeIconName[];

/** Unknown icon names render the folder — icon strings are data and data never crashes the UI. */
export function TypeIcon(props: { name: string; size?: number }) {
  const Icon = TYPE_ICONS[props.name as TypeIconName] ?? Folder;
  return <Icon size={props.size ?? 16} aria-hidden focusable={false} />;
}
```

Create `packages/app-core/src/workflow-builder/ticket-types/icon-picker.tsx`:

```tsx
import { TYPE_ICON_NAMES, TypeIcon } from './icons.tsx';

export function IconPicker(props: { value: string; onChange(name: string): void; disabled?: boolean }) {
  return (
    <div className="icon-picker" role="group" aria-label="Icon">
      {TYPE_ICON_NAMES.map((name) => (
        <button
          key={name}
          type="button"
          className={`icon-picker__choice${props.value === name ? ' icon-picker__choice--selected' : ''}`}
          aria-label={`Icon: ${name}`}
          aria-pressed={props.value === name}
          disabled={props.disabled === true}
          onClick={() => props.onChange(name)}
        >
          <TypeIcon name={name} />
        </button>
      ))}
    </div>
  );
}
```

Create `packages/app-core/src/workflow-builder/ticket-types/fields-editor.tsx`:

```tsx
import { newUlid, type CustomFieldDef } from '@gisik-nokma/domain';

const FIELD_TYPES: readonly CustomFieldDef['type'][] = ['text', 'number', 'date', 'select', 'person'];

function parseOptions(raw: string): string[] | undefined {
  const lines = raw
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length === 0 ? undefined : lines;
}

/** The five field kinds; only select carries options (one per line). Field ids are minted ULIDs — display names are the human layer. */
export function FieldsEditor(props: {
  fields: CustomFieldDef[];
  onChange(fields: CustomFieldDef[]): void;
  disabled?: boolean;
}) {
  function updateField(index: number, change: Partial<CustomFieldDef>): void {
    props.onChange(
      props.fields.map((field, at) => {
        if (at !== index) return field;
        const next = { ...field, ...change };
        if (next.type !== 'select') delete next.options; // only select fields take options (Plan 3 schema)
        return next;
      }),
    );
  }
  return (
    <div className="fields-editor">
      <ul className="fields-editor__rows">
        {props.fields.map((field, index) => (
          <li className="fields-editor__row" data-testid={`field-row-${index}`} key={field.id}>
            <input
              type="text"
              aria-label="Field name"
              disabled={props.disabled === true}
              value={field.name}
              onChange={(changeEvent) => updateField(index, { name: changeEvent.target.value })}
            />
            <select
              aria-label="Field type"
              disabled={props.disabled === true}
              value={field.type}
              onChange={(changeEvent) =>
                updateField(index, { type: changeEvent.target.value as CustomFieldDef['type'] })
              }
            >
              {FIELD_TYPES.map((fieldType) => (
                <option key={fieldType} value={fieldType}>
                  {fieldType}
                </option>
              ))}
            </select>
            {field.type === 'select' ? (
              <textarea
                aria-label="Select options"
                placeholder="one option per line"
                disabled={props.disabled === true}
                defaultValue={field.options?.join('\n') ?? ''}
                onChange={(changeEvent) => updateField(index, { options: parseOptions(changeEvent.target.value) })}
              />
            ) : null}
            {props.disabled === true ? null : (
              <button
                type="button"
                aria-label="Remove field"
                onClick={() => props.onChange(props.fields.filter((_field, at) => at !== index))}
              >
                Remove field
              </button>
            )}
          </li>
        ))}
      </ul>
      {props.disabled === true ? null : (
        <button
          type="button"
          className="fields-editor__add"
          onClick={() =>
            props.onChange([...props.fields, { id: newUlid(), name: 'New field', type: 'text' }])
          }
        >
          Add field
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Write the failing ticket-types component test**

Create `packages/app-core/test/ticket-types/ticket-types.test.tsx`:

```tsx
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  builtinTicketTypeDefs,
  newUlid,
  ticketTypeDefSchema,
  type TicketTypeDef,
} from '@gisik-nokma/domain';
import { createFakeGateway, type FakeGatewaySeed } from '../../src/workflow-builder/fake-gateway.js';
import { cloneTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import type { BuilderSession } from '../../src/workflow-builder/ui/builder-context.tsx';
import { TicketTypeEditorScreen } from '../../src/workflow-builder/ticket-types/ticket-type-editor-screen.tsx';
import { TicketTypeListScreen } from '../../src/workflow-builder/ticket-types/ticket-type-list-screen.tsx';

const adminSession: BuilderSession = { userId: newUlid(), role: 'admin' };
const kanbanPublished = cloneTemplate(WORKFLOW_TEMPLATES[0]!);
// A second published workflow, so the binding combobox has somewhere to move to.
const errandPublished = cloneTemplate(WORKFLOW_TEMPLATES[1]!);
const builtins = builtinTicketTypeDefs(kanbanPublished.id);

function renderEditor(
  initialDef: TicketTypeDef | null,
  seed: FakeGatewaySeed = {},
  session: BuilderSession = adminSession,
) {
  const gateway = createFakeGateway({ workflows: [kanbanPublished], ticketTypes: builtins, ...seed });
  const onSaved = vi.fn();
  render(
    <TicketTypeEditorScreen
      workspaceId={newUlid()}
      session={session}
      gateway={gateway}
      initialDef={initialDef}
      onSaved={onSaved}
    />,
  );
  return { gateway, onSaved };
}

describe('TicketTypeListScreen', () => {
  it('lists types with rank, field count and a Built-in badge on the seeds', async () => {
    const user = userEvent.setup();
    const custom: TicketTypeDef = {
      id: newUlid(),
      name: 'Invoice',
      icon: 'receipt',
      rank: 3,
      workflowId: kanbanPublished.id,
      fields: [{ id: newUlid(), name: 'Amount', type: 'number' }],
    };
    const onOpen = vi.fn();
    render(
      <TicketTypeListScreen
        workspaceId={newUlid()}
        session={adminSession}
        gateway={createFakeGateway({ ticketTypes: [...builtins, custom] })}
        onOpen={onOpen}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText('Invoice')).toBeInTheDocument();
    const epicRow = screen.getByText('Epic').closest('li')!;
    expect(within(epicRow).getByText('Built-in')).toBeInTheDocument();
    const invoiceRow = screen.getByText('Invoice').closest('li')!;
    expect(within(invoiceRow).queryByText('Built-in')).not.toBeInTheDocument();
    expect(within(invoiceRow).getByText('rank 3')).toBeInTheDocument();
    expect(within(invoiceRow).getByText('1 field')).toBeInTheDocument();
    await user.click(within(invoiceRow).getByRole('button', { name: 'Open Invoice' }));
    expect(onOpen).toHaveBeenCalledWith(custom.id);
  });

  it('hides New ticket type from non-authors', async () => {
    render(
      <TicketTypeListScreen
        workspaceId={newUlid()}
        session={{ userId: newUlid(), role: 'member' }}
        gateway={createFakeGateway({ ticketTypes: builtins })}
        onOpen={() => {}}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText('Epic')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'New ticket type' })).not.toBeInTheDocument();
  });
});

describe('TicketTypeEditorScreen — creating a custom type', () => {
  it('builds and submits ticket-type.defined from the filled form', async () => {
    const user = userEvent.setup();
    const { gateway, onSaved } = renderEditor(null);
    const nameField = await screen.findByRole('textbox', { name: 'Type name' });
    await user.type(nameField, 'Invoice');
    await user.click(screen.getByRole('button', { name: 'Icon: receipt' }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Workflow' }), kanbanPublished.id);
    await user.click(screen.getByRole('button', { name: 'Add field' }));
    const row = screen.getByTestId('field-row-0');
    const fieldName = within(row).getByRole('textbox', { name: 'Field name' });
    await user.clear(fieldName);
    await user.type(fieldName, 'Amount');
    await user.selectOptions(within(row).getByRole('combobox', { name: 'Field type' }), 'number');
    await user.click(screen.getByRole('button', { name: 'Save ticket type' }));

    expect(await screen.findByText('Ticket type saved.')).toBeInTheDocument();
    expect(gateway.submitted).toHaveLength(1);
    const event = gateway.submitted[0]!;
    expect(event.type).toBe('ticket-type.defined');
    expect(event.entity.kind).toBe('ticket-type');
    const payload = event.payload as TicketTypeDef;
    expect(payload).toMatchObject({ name: 'Invoice', icon: 'receipt', rank: 3, workflowId: kanbanPublished.id });
    expect(payload.fields).toHaveLength(1);
    expect(payload.fields[0]).toMatchObject({ name: 'Amount', type: 'number' });
    expect(onSaved).toHaveBeenCalledWith(payload);
  });

  it('shows rank implications derived from the workspace types', async () => {
    renderEditor(null);
    expect(await screen.findByTestId('rank-implications')).toHaveTextContent(
      'Can sit under: Epic, Story · or at the project root.',
    );
  });

  it('surfaces the schema refusal for a select field without options and blocks saving', async () => {
    const user = userEvent.setup();
    renderEditor(null);
    await user.type(await screen.findByRole('textbox', { name: 'Type name' }), 'Priority thing');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Workflow' }), kanbanPublished.id);
    await user.click(screen.getByRole('button', { name: 'Add field' }));
    const row = screen.getByTestId('field-row-0');
    await user.selectOptions(within(row).getByRole('combobox', { name: 'Field type' }), 'select');

    // assert against the schema's own words — the editor never rephrases zod
    const draftDef: TicketTypeDef = {
      id: newUlid(),
      name: 'Priority thing',
      icon: 'flag',
      rank: 3,
      workflowId: kanbanPublished.id,
      fields: [{ id: newUlid(), name: 'New field', type: 'select' }],
    };
    const parsed = ticketTypeDefSchema.safeParse(draftDef);
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        expect(screen.getAllByText(issue.message).length).toBeGreaterThan(0);
      }
    }
    expect(screen.getByRole('button', { name: 'Save ticket type' })).toBeDisabled();
  });
});

describe('TicketTypeEditorScreen — built-ins and refusals', () => {
  it('locks the rank of a built-in type and says why', async () => {
    renderEditor(builtins.find((builtin) => builtin.id === 'epic')!);
    const rankField = await screen.findByRole('spinbutton', { name: 'Hierarchy rank' });
    expect(rankField).toBeDisabled();
    expect(screen.getByText('Built-in type — its place in the hierarchy is fixed.')).toBeInTheDocument();
  });

  it('renders a server refusal verbatim (planted defect: non-admin ingest)', async () => {
    const user = userEvent.setup();
    const reason = 'Only a workspace owner or admin can do this. Your role is member.';
    renderEditor(builtins.find((builtin) => builtin.id === 'task')!, {
      submitResults: [{ status: 'refused', eventId: 'evt', rule: 'permission.role', reason }],
    });
    await user.click(await screen.findByRole('button', { name: 'Save ticket type' }));
    expect(await screen.findByText('The server refused this ticket type.')).toBeInTheDocument();
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.getByText('rule: permission.role')).toBeInTheDocument();
  });

  it('hides Save and disables inputs for non-authors', async () => {
    renderEditor(builtins.find((builtin) => builtin.id === 'task')!, {}, { userId: newUlid(), role: 'member' });
    expect(await screen.findByRole('textbox', { name: 'Type name' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Save ticket type' })).not.toBeInTheDocument();
  });
});

describe('TicketTypeEditorScreen — re-binding a type to a different workflow (owner decision 2026-08-26)', () => {
  const task = builtins.find((builtin) => builtin.id === 'task')!;
  const bothWorkflows = { workflows: [kanbanPublished, errandPublished] };

  async function rebind(seed: FakeGatewaySeed = {}) {
    const user = userEvent.setup();
    const rendered = renderEditor(task, { ...bothWorkflows, ...seed });
    await user.selectOptions(
      await screen.findByRole('combobox', { name: 'Workflow' }),
      errandPublished.id,
    );
    return { user, ...rendered };
  }

  it('says how many tickets stay behind, and names the workflow they stay on', async () => {
    await rebind({ typePopulation: { task: { [kanbanPublished.id]: 14 } } });
    const notice = await screen.findByTestId('workflow-divergence');
    expect(within(notice).getByText('Existing tickets stay where they are')).toBeInTheDocument();
    expect(
      await within(notice).findByText(
        `14 existing tickets of this type stay on "${kanbanPublished.name}". New ones will use "${errandPublished.name}".`,
      ),
    ).toBeInTheDocument();
  });

  it('says nothing stays behind when nothing does — no invented population', async () => {
    await rebind({ typePopulation: { task: { [kanbanPublished.id]: 0 } } });
    expect(
      await screen.findByText(`No tickets of this type are on "${kanbanPublished.name}" — nothing stays behind.`),
    ).toBeInTheDocument();
  });

  it('planted defect: when the count read fails it says so rather than showing zero', async () => {
    await rebind({ typePopulationError: true });
    const notice = await screen.findByTestId('workflow-divergence');
    expect(await within(notice).findByText('ticket count unavailable')).toBeInTheDocument();
    expect(
      within(notice).getByText(
        `Existing tickets of this type stay on "${kanbanPublished.name}" — we could not count how many. New ones will use "${errandPublished.name}".`,
      ),
    ).toBeInTheDocument();
    // The honesty that matters: it never claims a number it does not have.
    expect(within(notice).queryByText(/^0 /)).not.toBeInTheDocument();
  });

  it('the notice appears only when the binding actually changed', async () => {
    const user = userEvent.setup();
    renderEditor(task, { ...bothWorkflows, typePopulation: { task: { [kanbanPublished.id]: 14 } } });
    await screen.findByRole('combobox', { name: 'Workflow' });
    expect(screen.queryByTestId('workflow-divergence')).not.toBeInTheDocument();
    // …and it goes away again when the admin changes their mind back.
    await user.selectOptions(screen.getByRole('combobox', { name: 'Workflow' }), errandPublished.id);
    expect(await screen.findByTestId('workflow-divergence')).toBeInTheDocument();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Workflow' }), kanbanPublished.id);
    expect(screen.queryByTestId('workflow-divergence')).not.toBeInTheDocument();
  });

  it('will not offer the move until the type is saved — otherwise new and old tickets swap places', async () => {
    const { user } = await rebind({ typePopulation: { task: { [kanbanPublished.id]: 14 } } });
    const move = await screen.findByRole('button', { name: `Move them to "${errandPublished.name}"…` });
    expect(move).toBeDisabled();
    expect(
      screen.getByText(
        `Save the ticket type first — until it is saved, new tickets would still go to "${kanbanPublished.name}".`,
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save ticket type' }));
    expect(await screen.findByText('Ticket type saved.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: `Move them to "${errandPublished.name}"…` })).toBeEnabled();
  });

  it('leaving them is an affirmative choice, not an unclicked button', async () => {
    const { user, gateway } = await rebind({ typePopulation: { task: { [kanbanPublished.id]: 14 } } });
    await user.click(await screen.findByRole('button', { name: `Leave them on "${kanbanPublished.name}"` }));
    expect(
      await screen.findByText(`Left on "${kanbanPublished.name}". They keep their own board columns.`),
    ).toBeInTheDocument();
    expect(gateway.migrations).toEqual([]);
    // Not an error state, not a warning that lingers — a settled decision.
    expect(screen.queryByRole('button', { name: `Move them to "${errandPublished.name}"…` })).not.toBeInTheDocument();
  });

  it('authors one cross-workflow map and hands the server one migration — never a stateMapping', async () => {
    const { user, gateway } = await rebind({ typePopulation: { task: { [kanbanPublished.id]: 14 } } });
    await user.click(screen.getByRole('button', { name: 'Save ticket type' }));
    await screen.findByText('Ticket type saved.');
    await user.click(screen.getByRole('button', { name: `Move them to "${errandPublished.name}"…` }));

    const dialog = await screen.findByRole('dialog', { name: `Move existing tickets to "${errandPublished.name}"` });
    expect(
      within(dialog).getByText(
        `These two workflows share no history, so nothing carries across on its own: every state of "${kanbanPublished.name}" needs a destination in "${errandPublished.name}". Each ticket gets its own recorded move.`,
      ),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByText(
        "Leaving them is a real choice — a type can have tickets on two workflows, and the board shows each ticket under its own workflow's states.",
      ),
    ).toBeInTheDocument();

    // Every state of the OUTGOING workflow needs a destination — an unmapped
    // state would leave its tickets nowhere to go.
    const confirm = within(dialog).getByRole('button', { name: 'Move these tickets' });
    expect(confirm).toBeDisabled();
    for (const state of kanbanPublished.states) {
      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: `Send them to — ${state.name}` }),
        'in-progress',
      );
    }
    expect(confirm).toBeEnabled();
    await user.click(confirm);

    expect(gateway.migrations).toEqual([
      {
        workspaceId: expect.any(String),
        typeId: 'task',
        fromWorkflowId: kanbanPublished.id,
        toWorkflowId: errandPublished.id,
        stateMap: { todo: 'in-progress', doing: 'in-progress', done: 'in-progress' },
      },
    ]);
    // The map rode its own request. It is NOT a stateMapping: nothing about it
    // reached a workflow.defined payload, because across two workflows there is
    // no version chain to key one on (design decision 10).
    expect(gateway.submitted.some((event) => 'stateMapping' in (event.payload as object))).toBe(false);
    expect(await screen.findByText(`14 tickets moved to "${errandPublished.name}".`)).toBeInTheDocument();
  });

  it('renders the server refusal verbatim (planted defect: a state the target workflow does not have)', async () => {
    const reason = 'That is not a state of the workflow these tickets are moving to.';
    const { user } = await rebind({
      typePopulation: { task: { [kanbanPublished.id]: 14 } },
      migrationResults: [{ status: 'refused', rule: 'ticket.workflow-rebound-unknown-state', reason }],
    });
    await user.click(screen.getByRole('button', { name: 'Save ticket type' }));
    await screen.findByText('Ticket type saved.');
    await user.click(screen.getByRole('button', { name: `Move them to "${errandPublished.name}"…` }));
    const dialog = await screen.findByRole('dialog');
    for (const state of kanbanPublished.states) {
      await user.selectOptions(
        within(dialog).getByRole('combobox', { name: `Send them to — ${state.name}` }),
        'in-progress',
      );
    }
    await user.click(within(dialog).getByRole('button', { name: 'Move these tickets' }));

    expect(await screen.findByText('The server refused this move.')).toBeInTheDocument();
    expect(screen.getByText(reason)).toBeInTheDocument();
    // Plan 3 owns the rule id and the wording; this screen owns neither and
    // rephrases neither — it asserts on what came back, not on a literal it chose.
    expect(screen.getByText('rule: ticket.workflow-rebound-unknown-state')).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/ticket-types/ticket-types.test.tsx`
Expected: FAIL — cannot resolve `../../src/workflow-builder/ticket-types/ticket-type-editor-screen.tsx`.

- [ ] **Step 6: Implement the rebind dialog, then the editor screen**

Create `packages/app-core/src/workflow-builder/ticket-types/workflow-rebind-dialog.tsx`. It is close in spirit to `StateMappingDialog` — a list of source states, each with a destination picker, confirm disabled until every row is answered — and it is deliberately a **separate component with a separate payload**: that dialog authors a `stateMapping` inside one workflow's version chain, which is stored on the published def; this one authors a one-shot map **between two unrelated workflows**, which is stored nowhere and rides its own request (design decision 10). Sharing the component would eventually mean sharing the payload, which is the mistake.

```tsx
import { useState } from 'react';
import type { PublishedWorkflowDef } from '@gisik-nokma/domain';
import { tokens } from '@gisik-nokma/ui';

/**
 * The bulk affordance for the owner's versioned-bindings decision: one map from
 * the outgoing workflow's states to the incoming one's, which the server
 * expands into one `ticket.workflow_rebound` per ticket (Plan 3 owns that
 * event). Every outgoing state needs a destination — an unmapped state would
 * leave its tickets nowhere to land.
 */
export function WorkflowRebindDialog(props: {
  fromWorkflow: PublishedWorkflowDef;
  toWorkflow: PublishedWorkflowDef;
  onCancel(): void;
  onConfirm(stateMap: Record<string, string>): void;
}) {
  const [stateMap, setStateMap] = useState<Record<string, string>>({});
  const complete = props.fromWorkflow.states.every((state) => stateMap[state.id] !== undefined);
  const heading = `Move existing tickets to "${props.toWorkflow.name}"`;
  return (
    <div
      className="workflow-rebind-dialog"
      role="dialog"
      aria-label={heading}
      style={{
        background: tokens.workflowBuilder.surface,
        color: tokens.workflowBuilder.textPrimary,
        border: `1px solid ${tokens.workflowBuilder.panelBorder}`,
        borderRadius: 8,
        padding: 16,
      }}
    >
      <h3 className="workflow-rebind-dialog__title">{heading}</h3>
      <p className="workflow-rebind-dialog__body">
        {`These two workflows share no history, so nothing carries across on its own: every state of "${props.fromWorkflow.name}" needs a destination in "${props.toWorkflow.name}". Each ticket gets its own recorded move.`}
      </p>
      <ul className="workflow-rebind-dialog__rows">
        {props.fromWorkflow.states.map((state) => (
          <li className="workflow-rebind-dialog__row" data-testid={`rebind-row-${state.id}`} key={state.id}>
            <span className="workflow-rebind-dialog__state-name">{state.name}</span>
            <label className="workflow-rebind-dialog__target">
              <span>Send them to</span>
              <select
                aria-label={`Send them to — ${state.name}`}
                value={stateMap[state.id] ?? ''}
                onChange={(changeEvent) =>
                  setStateMap((current) => ({ ...current, [state.id]: changeEvent.target.value }))
                }
              >
                <option value="" disabled hidden></option>
                {props.toWorkflow.states.map((target) => (
                  <option key={target.id} value={target.id}>
                    {target.name}
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>
      <p className="workflow-rebind-dialog__footer">
        Leaving them is a real choice — a type can have tickets on two workflows, and the board shows each ticket under
        its own workflow&apos;s states.
      </p>
      <div className="workflow-rebind-dialog__actions">
        <button type="button" onClick={props.onCancel}>
          Leave them where they are
        </button>
        <button type="button" disabled={!complete} onClick={() => props.onConfirm(stateMap)}>
          Move these tickets
        </button>
      </div>
    </div>
  );
}
```

Create `packages/app-core/src/workflow-builder/ticket-types/ticket-type-editor-screen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import {
  BUILTIN_TICKET_TYPE_SEEDS,
  newUlid,
  ticketTypeDefSchema,
  type PublishedWorkflowDef,
  type TicketTypeDef,
} from '@gisik-nokma/domain';
import { buildTicketTypeDefinedEvent } from '../events.js';
import type { WorkflowAuthoringGateway } from '../gateway.js';
import { canAuthorRole, type BuilderSession } from '../ui/builder-context.tsx';
import { FieldsEditor } from './fields-editor.tsx';
import { IconPicker } from './icon-picker.tsx';
import { rankImplications, rankImplicationsCopy } from './rank.js';
import { WorkflowRebindDialog } from './workflow-rebind-dialog.tsx';

type SavePhase =
  | { phase: 'idle' }
  | { phase: 'saving' }
  | { phase: 'saved' }
  | { phase: 'refused'; rule: string; reason: string }
  | { phase: 'invalid'; message: string };

/** What the admin decided about the tickets the re-binding leaves behind. */
type RebindPhase =
  | { phase: 'undecided' }
  | { phase: 'left' }
  | { phase: 'mapping' }
  | { phase: 'migrating' }
  | { phase: 'migrated'; count: number }
  | { phase: 'refused'; rule: string; reason: string };

/** `null` = still counting; `'failed'` = the read failed and we say so. */
type Population = { count: number } | 'failed' | null;

function freshDef(): TicketTypeDef {
  return { id: newUlid(), name: '', icon: 'flag', rank: 3, workflowId: '', fields: [] };
}

function divergenceCountLine(population: Population): string | null {
  if (population === 'failed') return 'ticket count unavailable';
  if (population === null) return 'counting tickets…';
  return null; // the body sentence carries the number
}

/**
 * The divergence, said plainly. Never substitutes a zero for a count it does
 * not have — an admin told "0 tickets stay behind" when the read failed would
 * make a decision on a number nobody checked.
 */
function divergenceBody(population: Population, outgoing: string, incoming: string): string | null {
  if (population === null) return null;
  if (population === 'failed') {
    return `Existing tickets of this type stay on "${outgoing}" — we could not count how many. New ones will use "${incoming}".`;
  }
  if (population.count === 0) return `No tickets of this type are on "${outgoing}" — nothing stays behind.`;
  if (population.count === 1) {
    return `1 existing ticket of this type stays on "${outgoing}". New ones will use "${incoming}".`;
  }
  return `${population.count} existing tickets of this type stay on "${outgoing}". New ones will use "${incoming}".`;
}

export function TicketTypeEditorScreen(props: {
  workspaceId: string;
  session: BuilderSession;
  gateway: WorkflowAuthoringGateway;
  initialDef: TicketTypeDef | null;
  onSaved?: (def: TicketTypeDef) => void;
}) {
  const canAuthor = canAuthorRole(props.session.role);
  const [def, setDef] = useState<TicketTypeDef>(() => props.initialDef ?? freshDef());
  const [context, setContext] = useState<{ workflows: PublishedWorkflowDef[]; types: TicketTypeDef[] } | null>(null);
  const [save, setSave] = useState<SavePhase>({ phase: 'idle' });
  const [population, setPopulation] = useState<Population>(null);
  const [rebind, setRebind] = useState<RebindPhase>({ phase: 'undecided' });

  // The workflow this type was bound to when the screen opened. A ticket pins
  // the workflow it was created under (owner decision 2026-08-26), so THIS is
  // the workflow the existing population stays on — not whatever the combobox
  // currently reads.
  const outgoingWorkflowId = props.initialDef?.workflowId ?? null;
  const diverged = outgoingWorkflowId !== null && outgoingWorkflowId !== '' && def.workflowId !== outgoingWorkflowId;

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      props.gateway.listWorkflows(props.workspaceId),
      props.gateway.listTicketTypes(props.workspaceId),
    ]).then(([workflows, types]) => {
      if (!cancelled) setContext({ workflows, types });
    });
    return () => {
      cancelled = true;
    };
  }, [props.gateway, props.workspaceId]);

  useEffect(() => {
    if (!diverged || outgoingWorkflowId === null) {
      setPopulation(null);
      setRebind({ phase: 'undecided' });
      return;
    }
    let cancelled = false;
    setPopulation(null);
    props.gateway
      .getTypeWorkflowPopulation(props.workspaceId, def.id, outgoingWorkflowId)
      .then((count) => {
        if (!cancelled) setPopulation({ count });
      })
      .catch(() => {
        // Honest degradation, the same shape the mapping dialog uses: the read
        // failing is not the same as there being nothing there.
        if (!cancelled) setPopulation('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [diverged, outgoingWorkflowId, def.id, props.gateway, props.workspaceId]);

  if (context === null) return <p className="ticket-type-editor__loading">Loading ticket types…</p>;

  const isBuiltin = BUILTIN_TICKET_TYPE_SEEDS.some((seed) => seed.id === def.id);
  const parsed = ticketTypeDefSchema.safeParse(def);
  const schemaMessages = parsed.success ? [] : parsed.error.issues.map((issue) => issue.message);
  const implications = rankImplications(def.id, def.rank, context.types);
  const outgoingWorkflow = context.workflows.find((workflow) => workflow.id === outgoingWorkflowId) ?? null;
  const incomingWorkflow = context.workflows.find((workflow) => workflow.id === def.workflowId) ?? null;
  const showDivergence = diverged && outgoingWorkflow !== null && incomingWorkflow !== null;
  // Nothing to move and nothing to leave — the notice states the fact and stops.
  const nothingStaysBehind = population !== null && population !== 'failed' && population.count === 0;

  async function onMigrate(stateMap: Record<string, string>): Promise<void> {
    if (outgoingWorkflow === null || incomingWorkflow === null) return;
    setRebind({ phase: 'migrating' });
    const outcome = await props.gateway.migrateTypeToWorkflow({
      workspaceId: props.workspaceId,
      typeId: def.id,
      fromWorkflowId: outgoingWorkflow.id,
      toWorkflowId: incomingWorkflow.id,
      stateMap,
    });
    setRebind(
      outcome.status === 'migrated'
        ? { phase: 'migrated', count: outcome.count }
        : { phase: 'refused', rule: outcome.rule, reason: outcome.reason },
    );
  }

  async function onSave(): Promise<void> {
    setSave({ phase: 'saving' });
    const event = buildTicketTypeDefinedEvent({
      workspaceId: props.workspaceId,
      actorId: props.session.userId,
      origin: 'web',
      def,
    });
    const [result] = await props.gateway.submit([event]);
    if (result === undefined) throw new Error('gateway.submit returned no result for the event');
    switch (result.status) {
      case 'committed':
        setSave({ phase: 'saved' });
        props.onSaved?.(def);
        return;
      case 'refused':
        setSave({ phase: 'refused', rule: result.rule, reason: result.reason });
        return;
      case 'invalid':
        setSave({ phase: 'invalid', message: result.message });
        return;
    }
  }

  return (
    <section className="ticket-type-editor">
      <label className="ticket-type-editor__name">
        <span>Type name</span>
        <input
          type="text"
          aria-label="Type name"
          disabled={!canAuthor}
          value={def.name}
          onChange={(changeEvent) => setDef((current) => ({ ...current, name: changeEvent.target.value }))}
        />
      </label>
      <IconPicker
        value={def.icon}
        disabled={!canAuthor}
        onChange={(icon) => setDef((current) => ({ ...current, icon }))}
      />
      <label className="ticket-type-editor__rank">
        <span>Hierarchy rank</span>
        <input
          type="number"
          aria-label="Hierarchy rank"
          min={1}
          disabled={!canAuthor || isBuiltin}
          value={def.rank}
          onChange={(changeEvent) =>
            setDef((current) => ({ ...current, rank: Number.parseInt(changeEvent.target.value, 10) || 1 }))
          }
        />
      </label>
      {isBuiltin ? (
        <p className="ticket-type-editor__builtin-note">Built-in type — its place in the hierarchy is fixed.</p>
      ) : null}
      <p className="ticket-type-editor__implications" data-testid="rank-implications">
        {rankImplicationsCopy(implications)}
      </p>
      <label className="ticket-type-editor__workflow">
        <span>Workflow</span>
        <select
          aria-label="Workflow"
          disabled={!canAuthor}
          value={def.workflowId}
          onChange={(changeEvent) => setDef((current) => ({ ...current, workflowId: changeEvent.target.value }))}
        >
          <option value="" disabled hidden></option>
          {context.workflows.map((workflow) => (
            <option key={workflow.id} value={workflow.id}>
              {workflow.name}
            </option>
          ))}
        </select>
      </label>
      {showDivergence ? (
        <section className="ticket-type-editor__divergence" data-testid="workflow-divergence">
          <h3 className="ticket-type-editor__divergence-title">Existing tickets stay where they are</h3>
          {divergenceCountLine(population) !== null ? (
            <p className="ticket-type-editor__divergence-count">{divergenceCountLine(population)}</p>
          ) : null}
          {divergenceBody(population, outgoingWorkflow.name, incomingWorkflow.name) !== null ? (
            <p className="ticket-type-editor__divergence-body">
              {divergenceBody(population, outgoingWorkflow.name, incomingWorkflow.name)}
            </p>
          ) : null}
          {nothingStaysBehind || rebind.phase === 'migrated' ? null : rebind.phase === 'left' ? (
            <p className="ticket-type-editor__divergence-left">
              {`Left on "${outgoingWorkflow.name}". They keep their own board columns.`}
            </p>
          ) : (
            <div className="ticket-type-editor__divergence-actions">
              <button
                type="button"
                disabled={!canAuthor || save.phase !== 'saved' || rebind.phase === 'migrating'}
                onClick={() => setRebind({ phase: 'mapping' })}
              >
                {`Move them to "${incomingWorkflow.name}"…`}
              </button>
              {/* Staying put is a decision, not the absence of one. */}
              <button type="button" disabled={!canAuthor} onClick={() => setRebind({ phase: 'left' })}>
                {`Leave them on "${outgoingWorkflow.name}"`}
              </button>
              {save.phase === 'saved' ? null : (
                <p className="ticket-type-editor__divergence-hint">
                  {`Save the ticket type first — until it is saved, new tickets would still go to "${outgoingWorkflow.name}".`}
                </p>
              )}
            </div>
          )}
          {rebind.phase === 'mapping' ? (
            <WorkflowRebindDialog
              fromWorkflow={outgoingWorkflow}
              toWorkflow={incomingWorkflow}
              onCancel={() => setRebind({ phase: 'left' })}
              onConfirm={(stateMap) => void onMigrate(stateMap)}
            />
          ) : null}
          {rebind.phase === 'migrated' ? (
            <p className="ticket-type-editor__divergence-migrated">
              {rebind.count === 1
                ? `1 ticket moved to "${incomingWorkflow.name}".`
                : `${rebind.count} tickets moved to "${incomingWorkflow.name}".`}
            </p>
          ) : null}
          {rebind.phase === 'refused' ? (
            <div className="ticket-type-editor__divergence-refused">
              <p>The server refused this move.</p>
              <p>{rebind.reason}</p>
              <p>{`rule: ${rebind.rule}`}</p>
            </div>
          ) : null}
        </section>
      ) : null}
      <FieldsEditor
        fields={def.fields}
        disabled={!canAuthor}
        onChange={(fields) => setDef((current) => ({ ...current, fields }))}
      />
      {schemaMessages.length > 0 ? (
        <ul className="ticket-type-editor__issues">
          {schemaMessages.map((message, at) => (
            <li key={at}>{message}</li>
          ))}
        </ul>
      ) : null}
      {canAuthor ? (
        <button
          type="button"
          className="ticket-type-editor__save"
          disabled={!parsed.success || save.phase === 'saving'}
          onClick={() => void onSave()}
        >
          Save ticket type
        </button>
      ) : null}
      {save.phase === 'saved' ? <p className="ticket-type-editor__saved">Ticket type saved.</p> : null}
      {save.phase === 'refused' ? (
        <div className="ticket-type-editor__refused">
          <p>The server refused this ticket type.</p>
          <p>{save.reason}</p>
          <p>{`rule: ${save.rule}`}</p>
        </div>
      ) : null}
      {save.phase === 'invalid' ? (
        <div className="ticket-type-editor__invalid">
          <p>The server could not read this claim.</p>
          <p>{save.message}</p>
        </div>
      ) : null}
    </section>
  );
}
```

- [ ] **Step 7: Implement the list screen**

Create `packages/app-core/src/workflow-builder/ticket-types/ticket-type-list-screen.tsx`:

```tsx
import { useEffect, useState } from 'react';
import { BUILTIN_TICKET_TYPE_SEEDS, type TicketTypeDef } from '@gisik-nokma/domain';
import type { WorkflowAuthoringGateway } from '../gateway.js';
import { canAuthorRole, type BuilderSession } from '../ui/builder-context.tsx';
import { TypeIcon } from './icons.tsx';

export function TicketTypeListScreen(props: {
  workspaceId: string;
  session: BuilderSession;
  gateway: WorkflowAuthoringGateway;
  onOpen(typeId: string): void;
  onNew(): void;
}) {
  const [types, setTypes] = useState<TicketTypeDef[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    void props.gateway.listTicketTypes(props.workspaceId).then((loaded) => {
      if (!cancelled) setTypes(loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [props.gateway, props.workspaceId]);

  if (types === null) return <p className="ticket-type-list__loading">Loading ticket types…</p>;
  const canAuthor = canAuthorRole(props.session.role);
  const builtinIds = new Set(BUILTIN_TICKET_TYPE_SEEDS.map((seed) => seed.id));
  return (
    <section className="ticket-type-list">
      <header className="ticket-type-list__header">
        <h2 className="ticket-type-list__title">Ticket types</h2>
        {canAuthor ? (
          <button type="button" className="ticket-type-list__new" onClick={props.onNew}>
            New ticket type
          </button>
        ) : null}
      </header>
      <ul className="ticket-type-list__rows">
        {types.map((type) => (
          <li className="ticket-type-list__row" key={type.id}>
            <TypeIcon name={type.icon} />
            <span className="ticket-type-list__name">{type.name}</span>
            {builtinIds.has(type.id) ? <span className="ticket-type-list__badge">Built-in</span> : null}
            <span className="ticket-type-list__rank">{`rank ${type.rank}`}</span>
            <span className="ticket-type-list__fields">
              {type.fields.length === 1 ? '1 field' : `${type.fields.length} fields`}
            </span>
            <button type="button" aria-label={`Open ${type.name}`} onClick={() => props.onOpen(type.id)}>
              Open
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

- [ ] **Step 8: Run to verify it passes, update the barrel**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/ticket-types/ticket-types.test.tsx test/ticket-types/rank.test.ts`
Expected: PASS (13 tests).

Add to `packages/app-core/src/workflow-builder/index.ts`:

```ts
export * from './ticket-types/rank.js';
export * from './ticket-types/icons.tsx';
export * from './ticket-types/icon-picker.tsx';
export * from './ticket-types/fields-editor.tsx';
export * from './ticket-types/ticket-type-editor-screen.tsx';
export * from './ticket-types/ticket-type-list-screen.tsx';
```

- [ ] **Step 9: Commit**

```bash
git add packages/app-core/src/workflow-builder/ticket-types packages/app-core/test/ticket-types packages/app-core/src/workflow-builder/index.ts
git commit -m "Ticket-type management: five field kinds with a select-options editor, workflow binding from published workflows, live rank implications that say plainly when a type sits at or below the deepest rank and will therefore always need a parent — the owner's rule follows the rank, so a workspace's own type there hears the same thing the built-in sub-task does — built-in ranks locked in the UI, schema and server refusals verbatim"
```

---

### Task 12: Admin gating end-to-end

Non-admins get read-only workflow and type views: a banner that says so, disabled pickers, no publish/save, no add/remove — while everything stays visible (visibility of truth is not gated; changing it is). And because the UI is convenience, not enforcement, the server's `permission.role` refusal is surfaced verbatim and proven against a planted defect: a gateway that refuses the publish exactly as Plan 4's `checkRolePermission` would.

**Files:**
- Create: `packages/app-core/src/workflow-builder/ui/read-only-banner.tsx`
- Modify: `packages/app-core/src/workflow-builder/ui/workflow-builder-screen.tsx` (banner when not authoring)
- Modify: `packages/app-core/src/workflow-builder/ui/workflow-list-screen.tsx` (same)
- Modify: `packages/app-core/src/workflow-builder/ticket-types/ticket-type-list-screen.tsx` (same)
- Modify: `packages/app-core/src/workflow-builder/ticket-types/ticket-type-editor-screen.tsx` (same)
- Modify: `packages/app-core/src/workflow-builder/index.ts`
- Test: `packages/app-core/test/workflow-builder/access.test.tsx`

**Interfaces:**
- Consumes: everything above.
- Produces: `ReadOnlyBanner` (no props).

- [ ] **Step 1: Write the failing access tests**

Create `packages/app-core/test/workflow-builder/access.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';
import { draftFromTemplate, WORKFLOW_TEMPLATES } from '../../src/workflow-builder/templates.js';
import type { BuilderSession } from '../../src/workflow-builder/ui/builder-context.tsx';
import { WorkflowBuilderScreen } from '../../src/workflow-builder/ui/workflow-builder-screen.tsx';
import { WorkflowListScreen } from '../../src/workflow-builder/ui/workflow-list-screen.tsx';

const errand = WORKFLOW_TEMPLATES.find((template) => template.id === 'errand-with-waits')!;
const BANNER = 'You can look, not touch — only a workspace owner or admin can change workflows and ticket types.';
const memberSession: BuilderSession = { userId: newUlid(), role: 'member' };
const adminSession: BuilderSession = { userId: newUlid(), role: 'admin' };

describe('read-only workflow views for non-admins', () => {
  it('the builder screen shows the banner, disables the name field, and offers no publish', async () => {
    render(
      <WorkflowBuilderScreen
        workspaceId={newUlid()}
        session={memberSession}
        gateway={createFakeGateway()}
        initialDraft={draftFromTemplate(errand)}
      />,
    );
    expect(await screen.findByText(BANNER)).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Workflow name' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add state' })).not.toBeInTheDocument();
  });

  it('a member can inspect a transition but cannot edit its rules', async () => {
    const user = userEvent.setup();
    render(
      <WorkflowBuilderScreen
        workspaceId={newUlid()}
        session={memberSession}
        gateway={createFakeGateway()}
        initialDraft={draftFromTemplate(errand)}
      />,
    );
    await screen.findByRole('textbox', { name: 'Workflow name' });
    await user.click(screen.getByText('Must carry an attachment as evidence.'));
    // the inspector opens with the rule visible…
    expect(screen.getByText('From In progress to Done')).toBeInTheDocument();
    // …but nothing is editable
    expect(screen.queryByRole('button', { name: 'Add rule' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Remove rule' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete transition' })).not.toBeInTheDocument();
  });

  it('the workflow list shows the banner to members', async () => {
    render(
      <WorkflowListScreen
        workspaceId={newUlid()}
        session={memberSession}
        gateway={createFakeGateway()}
        onOpen={() => {}}
        onNew={() => {}}
      />,
    );
    expect(await screen.findByText(BANNER)).toBeInTheDocument();
  });
});

describe('the server, not the UI, is the enforcer', () => {
  it('renders a permission.role refusal verbatim (planted defect: the gate is down but the server still refuses)', async () => {
    const user = userEvent.setup();
    const reason = 'Only a workspace owner or admin can do this. Your role is member.';
    render(
      <WorkflowBuilderScreen
        workspaceId={newUlid()}
        session={adminSession} // the UI believes this user may publish…
        gateway={createFakeGateway({
          submitResults: [{ status: 'refused', eventId: 'evt', rule: 'permission.role', reason }],
        })}
        initialDraft={draftFromTemplate(errand)}
      />,
    );
    await user.click(await screen.findByRole('button', { name: 'Publish' }));
    // …and the server's refusal reaches the screen character for character
    expect(await screen.findByText('The server refused this publish.')).toBeInTheDocument();
    expect(screen.getByText(reason)).toBeInTheDocument();
    expect(screen.getByText('rule: permission.role')).toBeInTheDocument();
  });
});
```

(The ticket-type side of read-only and its verbatim refusal are already proven in Task 11's suite; this file completes the workflow side so both areas are covered end-to-end.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/access.test.tsx`
Expected: FAIL — the banner text is nowhere in the tree.

- [ ] **Step 3: Implement the banner and wire it into the four screens**

Create `packages/app-core/src/workflow-builder/ui/read-only-banner.tsx`:

```tsx
import { tokens } from '@gisik-nokma/ui';

export function ReadOnlyBanner() {
  return (
    <p
      className="read-only-banner"
      role="status"
      style={{
        border: `1px solid ${tokens.workflowBuilder.panelBorder}`,
        color: tokens.workflowBuilder.textMuted,
        borderRadius: 8,
        padding: '6px 10px',
      }}
    >
      You can look, not touch — only a workspace owner or admin can change workflows and ticket types.
    </p>
  );
}
```

In `workflow-builder-screen.tsx`, import it and render it first inside the `<header>` when not authoring:

```tsx
import { ReadOnlyBanner } from './read-only-banner.tsx';
```

```tsx
        <header className="workflow-builder-screen__header">
          {env.canAuthor ? null : <ReadOnlyBanner />}
          <WorkflowNameField />
          <AddStateButton />
          <PublishControls onPublished={props.onPublished} />
        </header>
```

In `workflow-list-screen.tsx` and `ticket-type-list-screen.tsx`, render `{canAuthor ? null : <ReadOnlyBanner />}` immediately after the `<header>` element; in `ticket-type-editor-screen.tsx`, render the same as the first child of the `<section>` (import path from there is `../ui/read-only-banner.tsx`).

- [ ] **Step 4: Run to verify it passes, update the barrel**

Run: `pnpm --filter @gisik-nokma/app-core exec vitest run test/workflow-builder/access.test.tsx test/workflow-builder/screens.test.tsx test/ticket-types/ticket-types.test.tsx`
Expected: PASS (20 tests — the earlier suites must stay green with the banner mounted).

Add to `packages/app-core/src/workflow-builder/index.ts`:

```ts
export * from './ui/read-only-banner.tsx';
```

- [ ] **Step 5: Commit**

```bash
git add packages/app-core/src/workflow-builder packages/app-core/test/workflow-builder/access.test.tsx
git commit -m "Admin gating end-to-end: read-only views with the look-not-touch banner for non-admins, and the server's permission.role refusal rendered character for character — the UI is convenience, the server is the enforcer"
```

---

### Task 13: `apps/web` wiring — gateway adapter and the six pages

The only HTTP-adjacent code in the whole plan: one adapter from Plan 6's `DataSource` to `WorkflowAuthoringGateway`, one wiring hook, six thin pages. **This task requires Plan 6's `apps/web` scaffold — if executing this plan in parallel with Plan 6, do Tasks 13–14 after Plan 6 lands.** Where Plan 6's names differ from the assumptions (marked below), adapt the imports only.

**Files:**
- Create: `apps/web/src/authoring/data-source-gateway.ts`
- Create: `apps/web/src/authoring/builder-wiring.tsx`
- Create: `apps/web/app/w/[workspaceId]/settings/workflows/page.tsx`
- Create: `apps/web/app/w/[workspaceId]/settings/workflows/new/page.tsx`
- Create: `apps/web/app/w/[workspaceId]/settings/workflows/[workflowId]/page.tsx`
- Create: `apps/web/app/w/[workspaceId]/settings/ticket-types/page.tsx`
- Create: `apps/web/app/w/[workspaceId]/settings/ticket-types/new/page.tsx`
- Create: `apps/web/app/w/[workspaceId]/settings/ticket-types/[typeId]/page.tsx`
- Modify: `apps/web/next.config.ts` — ensure `transpilePackages` includes `'@gisik-nokma/app-core'` and `'@gisik-nokma/ui'` (skip if Plan 6 already lists them); ensure `apps/web/tsconfig.json` compilerOptions carry `"allowImportingTsExtensions": true` (Next's default already sets `noEmit: true`), so app-core's `.tsx`-suffixed imports typecheck
- Test: `apps/web/test/data-source-gateway.test.ts`

**Interfaces:**
- Consumes: `DataSource` (amendment 10, Plan 6's online implementation) — **assumed** `query` surface: `listWorkflows(workspaceId)`, `getWorkflow(workspaceId, workflowId)`, `listTicketTypes(workspaceId)`, `listMembers(workspaceId)`, `getWorkflowStateOccupancy(workspaceId, workflowId)`; plus `ingest(events)`. Plan 6 session — **assumed** hooks `useDataSource()` and `useSession(): { userId: string; workspaceRole: WorkspaceRole } | null` importable from `@/src/data` and `@/src/session`. Every assumption is confined to `builder-wiring.tsx` and the adapter.
- Produces: `createDataSourceAuthoringGateway(dataSource): WorkflowAuthoringGateway`; `useBuilderWiring(workspaceId): { gateway, session } | null` (null while the session loads); the six routes under `/w/[workspaceId]/settings/…`.

- [ ] **Step 1: Write the failing adapter test**

Create `apps/web/test/data-source-gateway.test.ts` (if `apps/web` lacks a vitest setup, add the same `vitest.config.ts` shape as Task 1 Step 1, minus jsdom — this test is pure):

```ts
import { describe, expect, it, vi } from 'vitest';
import { createDataSourceAuthoringGateway } from '../src/authoring/data-source-gateway';

describe('createDataSourceAuthoringGateway', () => {
  it('delegates every gateway call to the DataSource, 1:1', async () => {
    const dataSource = {
      ingest: vi.fn(async () => [{ status: 'committed', eventId: 'e', seq: 1, serverTime: 't' }]),
      query: {
        listWorkflows: vi.fn(async () => []),
        getWorkflow: vi.fn(async () => null),
        listTicketTypes: vi.fn(async () => []),
        listMembers: vi.fn(async () => []),
        getWorkflowStateOccupancy: vi.fn(async () => ({ counts: { todo: 2 } })),
      },
      subscribe: vi.fn(),
    };
    const gateway = createDataSourceAuthoringGateway(dataSource as never);

    await gateway.listWorkflows('ws');
    expect(dataSource.query.listWorkflows).toHaveBeenCalledWith('ws');
    await gateway.getWorkflow('ws', 'wf');
    expect(dataSource.query.getWorkflow).toHaveBeenCalledWith('ws', 'wf');
    await gateway.listTicketTypes('ws');
    expect(dataSource.query.listTicketTypes).toHaveBeenCalledWith('ws');
    await gateway.listMembers('ws');
    expect(dataSource.query.listMembers).toHaveBeenCalledWith('ws');
    expect(await gateway.getStateOccupancy('ws', 'wf')).toEqual({ todo: 2 });
    const events = [{ id: 'evt' }] as never;
    expect(await gateway.submit(events)).toEqual([
      { status: 'committed', eventId: 'e', seq: 1, serverTime: 't' },
    ]);
    expect(dataSource.ingest).toHaveBeenCalledWith(events);
  });
});
```

- [ ] **Step 2: Run it, implement the adapter, run again**

Run: `pnpm --filter web exec vitest run test/data-source-gateway.test.ts` (adapt the filter to `apps/web`'s package name) — expected FAIL. Then create `apps/web/src/authoring/data-source-gateway.ts`:

```ts
import type { WorkflowAuthoringGateway } from '@gisik-nokma/app-core';

/**
 * Plan 6's DataSource, narrowed to what the builder needs. If Plan 6's query
 * names differ, THIS type and the five call sites below are the only place to
 * adapt — nothing inside app-core changes.
 */
type AuthoringDataSource = {
  ingest: WorkflowAuthoringGateway['submit'];
  query: {
    listWorkflows: WorkflowAuthoringGateway['listWorkflows'];
    getWorkflow: WorkflowAuthoringGateway['getWorkflow'];
    listTicketTypes: WorkflowAuthoringGateway['listTicketTypes'];
    listMembers: WorkflowAuthoringGateway['listMembers'];
    getWorkflowStateOccupancy(workspaceId: string, workflowId: string): Promise<{ counts: Record<string, number> }>;
  };
};

export function createDataSourceAuthoringGateway(dataSource: AuthoringDataSource): WorkflowAuthoringGateway {
  return {
    listWorkflows: (workspaceId) => dataSource.query.listWorkflows(workspaceId),
    getWorkflow: (workspaceId, workflowId) => dataSource.query.getWorkflow(workspaceId, workflowId),
    listTicketTypes: (workspaceId) => dataSource.query.listTicketTypes(workspaceId),
    listMembers: (workspaceId) => dataSource.query.listMembers(workspaceId),
    getStateOccupancy: async (workspaceId, workflowId) =>
      (await dataSource.query.getWorkflowStateOccupancy(workspaceId, workflowId)).counts,
    submit: (events) => dataSource.ingest(events),
  };
}
```

Re-run: PASS (1 test).

- [ ] **Step 3: Implement the wiring hook**

Create `apps/web/src/authoring/builder-wiring.tsx`:

```tsx
'use client';

import { useMemo } from 'react';
import type { BuilderSession, WorkflowAuthoringGateway } from '@gisik-nokma/app-core';
// ADAPT HERE if Plan 6 chose different module paths or hook names — imports only:
import { useDataSource } from '@/src/data';
import { useSession } from '@/src/session';
import { createDataSourceAuthoringGateway } from './data-source-gateway';

export function useBuilderWiring(
  _workspaceId: string,
): { gateway: WorkflowAuthoringGateway; session: BuilderSession } | null {
  const dataSource = useDataSource();
  const session = useSession();
  const gateway = useMemo(() => createDataSourceAuthoringGateway(dataSource), [dataSource]);
  if (session === null) return null;
  return { gateway, session: { userId: session.userId, role: session.workspaceRole } };
}
```

- [ ] **Step 4: Implement the six pages**

`apps/web/app/w/[workspaceId]/settings/workflows/page.tsx`:

```tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { WorkflowListScreen } from '@gisik-nokma/app-core';
import { useBuilderWiring } from '@/src/authoring/builder-wiring';

export default function WorkflowsPage() {
  const params = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const wiring = useBuilderWiring(params.workspaceId);
  if (wiring === null) return null;
  const base = `/w/${params.workspaceId}/settings/workflows`;
  return (
    <WorkflowListScreen
      workspaceId={params.workspaceId}
      session={wiring.session}
      gateway={wiring.gateway}
      onOpen={(workflowId) => router.push(`${base}/${workflowId}`)}
      onNew={() => router.push(`${base}/new`)}
    />
  );
}
```

`apps/web/app/w/[workspaceId]/settings/workflows/new/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  draftFromTemplate,
  newDraft,
  TemplateGallery,
  WorkflowBuilderScreen,
  type WorkflowDraft,
} from '@gisik-nokma/app-core';
import { useBuilderWiring } from '@/src/authoring/builder-wiring';

export default function NewWorkflowPage() {
  const params = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const wiring = useBuilderWiring(params.workspaceId);
  const [draft, setDraft] = useState<WorkflowDraft | null>(null);
  if (wiring === null) return null;
  if (draft === null) {
    return (
      <TemplateGallery
        onPick={(template) => setDraft(template === null ? newDraft('New workflow') : draftFromTemplate(template))}
      />
    );
  }
  return (
    <WorkflowBuilderScreen
      workspaceId={params.workspaceId}
      session={wiring.session}
      gateway={wiring.gateway}
      initialDraft={draft}
      onPublished={() => router.push(`/w/${params.workspaceId}/settings/workflows`)}
    />
  );
}
```

`apps/web/app/w/[workspaceId]/settings/workflows/[workflowId]/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  draftFromPublished,
  WorkflowBuilderScreen,
  type WorkflowDraft,
} from '@gisik-nokma/app-core';
import { useBuilderWiring } from '@/src/authoring/builder-wiring';

export default function EditWorkflowPage() {
  const params = useParams<{ workspaceId: string; workflowId: string }>();
  const router = useRouter();
  const wiring = useBuilderWiring(params.workspaceId);
  const [draft, setDraft] = useState<WorkflowDraft | null | 'missing'>(null);
  const gateway = wiring?.gateway;

  useEffect(() => {
    if (gateway === undefined) return;
    let cancelled = false;
    void gateway.getWorkflow(params.workspaceId, params.workflowId).then((published) => {
      if (cancelled) return;
      setDraft(published === null ? 'missing' : draftFromPublished(published));
    });
    return () => {
      cancelled = true;
    };
  }, [gateway, params.workspaceId, params.workflowId]);

  if (wiring === null || draft === null) return null;
  if (draft === 'missing') return <p>No published workflow has this id.</p>;
  return (
    <WorkflowBuilderScreen
      workspaceId={params.workspaceId}
      session={wiring.session}
      gateway={wiring.gateway}
      initialDraft={draft}
      onPublished={() => router.push(`/w/${params.workspaceId}/settings/workflows`)}
    />
  );
}
```

`apps/web/app/w/[workspaceId]/settings/ticket-types/page.tsx`:

```tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { TicketTypeListScreen } from '@gisik-nokma/app-core';
import { useBuilderWiring } from '@/src/authoring/builder-wiring';

export default function TicketTypesPage() {
  const params = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const wiring = useBuilderWiring(params.workspaceId);
  if (wiring === null) return null;
  const base = `/w/${params.workspaceId}/settings/ticket-types`;
  return (
    <TicketTypeListScreen
      workspaceId={params.workspaceId}
      session={wiring.session}
      gateway={wiring.gateway}
      onOpen={(typeId) => router.push(`${base}/${typeId}`)}
      onNew={() => router.push(`${base}/new`)}
    />
  );
}
```

`apps/web/app/w/[workspaceId]/settings/ticket-types/new/page.tsx`:

```tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { TicketTypeEditorScreen } from '@gisik-nokma/app-core';
import { useBuilderWiring } from '@/src/authoring/builder-wiring';

export default function NewTicketTypePage() {
  const params = useParams<{ workspaceId: string }>();
  const router = useRouter();
  const wiring = useBuilderWiring(params.workspaceId);
  if (wiring === null) return null;
  return (
    <TicketTypeEditorScreen
      workspaceId={params.workspaceId}
      session={wiring.session}
      gateway={wiring.gateway}
      initialDef={null}
      onSaved={() => router.push(`/w/${params.workspaceId}/settings/ticket-types`)}
    />
  );
}
```

`apps/web/app/w/[workspaceId]/settings/ticket-types/[typeId]/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { TicketTypeDef } from '@gisik-nokma/domain';
import { TicketTypeEditorScreen } from '@gisik-nokma/app-core';
import { useBuilderWiring } from '@/src/authoring/builder-wiring';

export default function EditTicketTypePage() {
  const params = useParams<{ workspaceId: string; typeId: string }>();
  const router = useRouter();
  const wiring = useBuilderWiring(params.workspaceId);
  const [def, setDef] = useState<TicketTypeDef | null | 'missing'>(null);
  const gateway = wiring?.gateway;

  useEffect(() => {
    if (gateway === undefined) return;
    let cancelled = false;
    void gateway.listTicketTypes(params.workspaceId).then((types) => {
      if (cancelled) return;
      const found = types.find((type) => type.id === params.typeId);
      setDef(found === undefined ? 'missing' : found);
    });
    return () => {
      cancelled = true;
    };
  }, [gateway, params.workspaceId, params.typeId]);

  if (wiring === null || def === null) return null;
  if (def === 'missing') return <p>No ticket type has this id.</p>;
  return (
    <TicketTypeEditorScreen
      workspaceId={params.workspaceId}
      session={wiring.session}
      gateway={wiring.gateway}
      initialDef={def}
      onSaved={() => router.push(`/w/${params.workspaceId}/settings/ticket-types`)}
    />
  );
}
```

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter web exec tsc --noEmit` (adapt the filter). Expected: silent — except unresolved `@/src/data` / `@/src/session` if Plan 6 chose other names; adapt those two imports in `builder-wiring.tsx` and re-run until silent.

```bash
git add apps/web/src/authoring apps/web/app/w apps/web/test/data-source-gateway.test.ts apps/web/next.config.ts
git commit -m "Web wiring: DataSource-to-gateway adapter (the plan's only http-adjacent file) and six thin pages under /w/:workspaceId/settings — all Plan 6 assumptions confined to two files"
```

---

### Task 14: Playwright smoke — the real canvas, dragged for real

Component tests cannot exercise React Flow's actual drag-to-connect; the smoke flows do. Gated on environment variables (the workspace convention for integration gates): unset, the suite skips loudly. **Requires Plan 6's `apps/web` running against a seeded server** (Plans 1–5 executed): `E2E_BASE_URL`, `E2E_WORKSPACE_ID` (a workspace whose seeds exist), `E2E_ADMIN_STORAGE_STATE` and optionally `E2E_MEMBER_STORAGE_STATE` (Playwright storage-state files with signed-in sessions — produce them with Plan 6's E2E auth helper; if Plan 6 ships none, sign in once via the UI with `npx playwright codegen --save-storage` and keep the files out of git).

**Files:**
- Create: `apps/web/e2e/workflow-builder.spec.ts`
- Create: `apps/web/playwright.config.ts` (skip if Plan 6 already added one)
- Modify: `apps/web/package.json` (script `"e2e": "playwright test"`, devDependency `@playwright/test` — skip what exists)

**Interfaces:**
- Consumes: the pages from Task 13; the running app.
- Produces: the smoke suite later plans keep green.

- [ ] **Step 1: Ensure a Playwright config exists**

If `apps/web/playwright.config.ts` is missing, create:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: process.env.E2E_BASE_URL,
  },
});
```

Run `pnpm install` after adding `@playwright/test` if it was missing, then `pnpm --filter web exec playwright install chromium`.

- [ ] **Step 2: Write the smoke spec**

Create `apps/web/e2e/workflow-builder.spec.ts`:

```ts
import { expect, test, type Page } from '@playwright/test';

const workspaceId = process.env.E2E_WORKSPACE_ID;
const adminState = process.env.E2E_ADMIN_STORAGE_STATE;
const memberState = process.env.E2E_MEMBER_STORAGE_STATE;

const configured =
  process.env.E2E_BASE_URL !== undefined && workspaceId !== undefined && adminState !== undefined;
if (!configured) {
  console.warn(
    'workflow-builder smoke skipped — set E2E_BASE_URL, E2E_WORKSPACE_ID, E2E_ADMIN_STORAGE_STATE (and optionally E2E_MEMBER_STORAGE_STATE)',
  );
}

/** Drag from one node's source handle to another node's target handle. Exact-text match — "New" must not also match "New state". */
async function connectNodes(page: Page, fromText: string, toText: string): Promise<void> {
  const node = (text: string) =>
    page.locator('.react-flow__node').filter({ has: page.getByText(text, { exact: true }) });
  const fromHandle = node(fromText).locator('.react-flow__handle').last();
  const toHandle = node(toText).locator('.react-flow__handle').first();
  const fromBox = await fromHandle.boundingBox();
  const toBox = await toHandle.boundingBox();
  if (fromBox === null || toBox === null) throw new Error('handles not visible for drag');
  await page.mouse.move(fromBox.x + fromBox.width / 2, fromBox.y + fromBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(toBox.x + toBox.width / 2, toBox.y + toBox.height / 2, { steps: 12 });
  await page.mouse.up();
}

test.describe('workflow builder smoke — admin', () => {
  test.skip(!configured, 'E2E environment not configured');
  test.use({ storageState: adminState });

  test('clone errand-with-waits, publish, and find it in the list', async ({ page }) => {
    await page.goto(`/w/${workspaceId}/settings/workflows/new`);
    await page.getByRole('button', { name: 'Use this template — Errand with waits' }).click();
    await expect(page.getByText('No issues — this workflow can be published.')).toBeVisible();
    await expect(page.getByText('Waiting on counterparty')).toBeVisible();
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page).toHaveURL(/\/settings\/workflows$/);
    await expect(page.getByText('Errand with waits').first()).toBeVisible();
  });

  test('author from blank: add a state, drag a connection, publish', async ({ page }) => {
    await page.goto(`/w/${workspaceId}/settings/workflows/new`);
    await page.getByRole('button', { name: 'Start blank' }).click();
    // the blank draft seeds one open start state named "New"
    await page.getByRole('button', { name: 'Add state' }).click();
    await page
      .locator('.react-flow__node')
      .filter({ has: page.getByText('New state', { exact: true }) })
      .getByRole('combobox', { name: 'Category' })
      .selectOption('terminal');
    await connectNodes(page, 'New', 'New state');
    await expect(page.getByText('No issues — this workflow can be published.')).toBeVisible();
    await page.getByRole('button', { name: 'Publish' }).click();
    await expect(page).toHaveURL(/\/settings\/workflows$/);
  });
});

test.describe('workflow builder smoke — member is read-only', () => {
  test.skip(!configured || memberState === undefined, 'member storage state not configured');
  test.use({ storageState: memberState });

  test('a member sees the banner and no publish', async ({ page }) => {
    await page.goto(`/w/${workspaceId}/settings/workflows`);
    await expect(
      page.getByText(
        'You can look, not touch — only a workspace owner or admin can change workflows and ticket types.',
      ),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'New workflow' })).toHaveCount(0);
  });
});
```

- [ ] **Step 3: Run the suite (both modes)**

Run without the env vars: `pnpm --filter web e2e` — expected: all tests SKIP with the loud console warning.
Run with the environment configured against a running dev stack: `E2E_BASE_URL=http://localhost:3000 E2E_WORKSPACE_ID=<ulid> E2E_ADMIN_STORAGE_STATE=.auth/admin.json pnpm --filter web e2e` — expected: PASS (2 tests, 1 skipped without member state).

- [ ] **Step 4: Commit**

```bash
git add apps/web/e2e apps/web/playwright.config.ts apps/web/package.json
git commit -m "Playwright smoke: template-to-published and blank-with-real-drag flows plus the member read-only wall, env-gated like every integration suite in this workspace"
```

---

### Task 15: `Features.md`, `test-cases/`, and final verification

The workspace convention: the catalogue moves in the same change set as the work — this plan is one branch and one PR, and this task closes it with the catalogue and a full verification pass.

**Numbering note:** §10 / `10-workflow-builder` / cases `10.x` are pinned to this plan by the coordination doc — this plan claims no other numbers. If the numbers on disk disagree at execution time, stop and flag it to the orchestrator; do not take another number.

**Files:**
- Modify: `Features.md` (append the section)
- Create: `test-cases/10-workflow-builder.md`

**Interfaces:**
- Consumes: everything Tasks 1–14 delivered.
- Produces: the §10 catalogue entries Plans 9–11 cross-reference.

- [ ] **Step 1: Run the full verification pass**

```bash
pnpm --filter @gisik-nokma/app-core test
pnpm --filter @gisik-nokma/app-core exec tsc --noEmit
pnpm --filter web exec vitest run test/data-source-gateway.test.ts
pnpm --filter web exec tsc --noEmit
pnpm --filter web e2e
grep -rn "TODO\|TBD\|not implemented" packages/app-core/src/workflow-builder || echo "clean"
```

Expected: every suite passes (e2e may SKIP loudly when the env gate is unset — that is a pass for this step); the grep prints `clean`; both `tsc` runs are silent. Do not proceed while any of these fails.

- [ ] **Step 2: Append the `Features.md` section**

```markdown
## 10. Workflow builder & ticket types

The authoring half of spec §4: a Jira-style visual builder plus a template gallery — no AI drafting. All views live in `packages/app-core` (shared with desktop); `apps/web` contributes pages and the DataSource adapter.

- ✅ **Workflow canvas** — React Flow: states as nodes (name, category picker, blocked checkbox, start marker), transitions drawn as edges, a distinguished from-any source node, select-to-edit inspectors, header Add state. `packages/app-core/src/workflow-builder/ui/`
- ✅ **Rule editors** — the closed five-kind vocabulary behind pickers: member/role pickers for restrict-to, a picker-only field chooser (built-ins + bound types' fields), a named-move picker for require-different-user with the start-state honesty note; plain-language summaries on every edge. `packages/app-core/src/workflow-builder/ui/rule-editors/`
- ✅ **Live validation** — `validateWorkflowDef` on every change; issues panel in the validator's own words, anchored per code to the offending node/edge, click-to-select; publish disabled while any of the eleven issue codes stands. `packages/app-core/src/workflow-builder/ui/issues-panel.tsx`
- ✅ **Advisories — warnings that do not block** — a second, visually distinct section below the issues, fed by `adviseWorkflowDef` and anchored the same way, headed `Worth a look — none of these block publishing`. It carries `rdu-bypassable`: a four-eyes rule whose guarded move can be reached without ever entering the watched state. Publish gating is `validateWorkflowDef` emptiness alone, proven by a planted defect that publishes successfully while the advisory is on screen. `packages/app-core/src/workflow-builder/ui/issues-panel.tsx`
- ✅ **Publish flow** — `workflow.defined` with version bump from the published base; a state-mapping dialog listing every dropped state with its ticket count and a target picker, and requiring a destination for each whether or not anything sits there (the count is a courtesy that degrades honestly; the mapping is the contract); committed/refused/invalid results rendered verbatim. `packages/app-core/src/workflow-builder/ui/publish-controls.tsx`
- ✅ **Template gallery** — simple-kanban, errand-with-waits (waiting states blocked-flagged for the attention strip), approval-chain (four-eyes approve); ordinary workflows, cloned into the canvas. `packages/app-core/src/workflow-builder/templates.ts`
- ✅ **Ticket-type management** — list/create/edit custom types: name, icon picker, hierarchy rank with live "can sit under" implications — a type placed at or below the deepest rank is told outright that its tickets will always require a parent, the same rule the engine refuses on — workflow binding from published workflows, five typed custom fields with a select-options editor; emits `ticket-type.defined`. Built-in ranks are locked in the UI. `packages/app-core/src/workflow-builder/ticket-types/`
- ✅ **Admin gating** — non-admins get read-only views with the look-not-touch banner; server `permission.role` refusals render character for character. `packages/app-core/src/workflow-builder/ui/read-only-banner.tsx`
- ✅ **System-rules panel** — the two unauthorable invariants (provenance; parent-terminal refusal) named as fixed system rules in the canvas UI (spec §4). `packages/app-core/src/workflow-builder/ui/system-rules-panel.tsx`
- ⚙️ **Draft store & auto-layout** — immutable `WorkflowDraft` store (cascade-edges-on-delete, never rewrite authored references); deterministic layered layout from `initialStateId`; layout is presentation and never published. `packages/app-core/src/workflow-builder/draft-store.ts`
- ⚙️ **Authoring gateway** — the builder's one seam to the world (`WorkflowAuthoringGateway`), with an in-memory fake for tests and a `DataSource` adapter in the web app. `packages/app-core/src/workflow-builder/gateway.ts`, `apps/web/src/authoring/data-source-gateway.ts`
```

- [ ] **Step 3: Create the test-cases bucket**

Create `test-cases/10-workflow-builder.md`:

```markdown
# 10 — Workflow builder & ticket types

Mirrors `Features.md` §10. Status: `❌` not covered · `✅` covered · `🟡` partial · `🧪` covered by E2E only · `🚫` consciously out of scope. Test names cross-reference the covering test.

## Canvas authoring
- 10.1 ✅ States render as nodes with name, category, blocked flag, start marker — `canvas.test.tsx` renders every state / initial-state marker / blocked checkbox
- 10.2 ✅ Category picker on the node edits the def — `canvas.test.tsx` changes a state category
- 10.3 ✅ Blocked checkbox toggles the amendment-9 flag (unchecking removes the key) — `canvas.test.tsx` toggles the blocked flag; `draft-store.test.ts` unchecking blocked
- 10.4 ✅ Start marker settable from the inspector; disabled on the current start — `inspectors.test.tsx` sets the selected state as start
- 10.5 ✅ Connect gesture becomes a transition; any-state maps to `'*'`; the any-state node accepts no inbound — `flow-graph.test.ts` connectionToTransition
- 10.6 ✅ The distinguished any-state source renders with its hint — `canvas.test.tsx` any-state node
- 10.7 ✅ Deleting a state cascades its edges but leaves the start marker and rdu references dangling for validation to name — `draft-store.test.ts` removeState cascade
- 10.8 ✅ Click node/edge to select; inspectors follow the selection — `canvas.test.tsx`, `inspectors.test.tsx`
- 10.9 ✅ Auto-layout layers by distance from the start state; orphans parked; never crashes on a dangling start — `layout.test.ts`
- 10.10 ✅ Add state from the header — `screens.test.tsx` adds a state from the header button

## Rules
- 10.11 ✅ restrict-to: assignee/role/member pickers write the rule; dead keys omitted — `rule-editors.test.tsx`
- 10.12 ✅ restrict-to emptiness helper appears when nobody is picked — `rule-editors.test.tsx`
- 10.13 ✅ require-field is picker-only: built-ins plus bound types' fields — `rule-editors.test.tsx`, `summaries.test.ts` fieldChoicesFor
- 10.14 ✅ require-field warns on a field no bound type carries — `rule-editors.test.tsx`
- 10.15 ✅ require-different-user picks among transition targets, naming the move — `rule-editors.test.tsx`
- 10.16 ✅ rdu start-state vacuous case carries its honesty note — `rule-editors.test.tsx`
- 10.17 ✅ Plain-language summaries on edges and in the inspector — `summaries.test.ts`, `canvas.test.tsx`
- 10.18 ✅ Add-rule menu offers exactly the five kinds with honest defaults — `inspectors.test.tsx`

## Live validation (planted defects — every issue code, plus the advisory tier)
- 10.19 ✅ no-states — `validation.test.tsx` plants no-states
- 10.20 ✅ duplicate-state-id (via loaded def — the store mints unique ids) — `validation.test.tsx`
- 10.21 ✅ no-terminal-state — `validation.test.tsx`
- 10.22 ✅ unknown-transition-state (via loaded def — removeState cascades edges) — `validation.test.tsx`
- 10.23 ✅ duplicate-transition — `validation.test.tsx`
- 10.24 ✅ unreachable-state — `validation.test.tsx`
- 10.25 ✅ terminal-no-inbound — `validation.test.tsx`
- 10.26 ✅ unknown-initial-state — `validation.test.tsx`
- 10.27 ✅ empty-restrict-to — `validation.test.tsx`
- 10.28 ✅ rdu-unknown-state — `validation.test.tsx`
- 10.29 ✅ Issues anchor per code and click-to-select the offender; dry queues degrade to canvas — `anchor-issues.test.ts`, `validation.test.tsx`
- 10.54 ✅ rdu-unenterable-state — a four-eyes rule watching a state no transition enters — `validation.test.tsx` plants rdu-unenterable-state
- 10.55 ✅ rdu-bypassable advisory: rendered in its own non-blocking section, anchored and click-to-select, and absent when there is nothing to say — `validation.test.tsx`, `anchor-issues.test.ts`
- 10.56 ✅ An advisory does not gate publish — the button stays enabled, the publish commits, and `selectCanPublish` stays `validateWorkflowDef` emptiness — `publish.test.tsx`, `draft-store.test.ts`

## Publish
- 10.30 ✅ Publish disabled while any issue stands, naming why — `publish.test.tsx`
- 10.31 ✅ Version bumps from the published base; fresh drafts publish v1 — `events.test.ts`, `publish.test.tsx`
- 10.32 ✅ Mapping dialog lists every stranded state with in-flight counts; confirm gated on full mapping — `publish.test.tsx`
- 10.33 ✅ Count-read failure says "unavailable" and still demands the mapping — `publish.test.tsx`
- 10.34 ✅ workflow-state-mapping refusal rendered verbatim — `publish.test.tsx`
- 10.35 ✅ workflow-version (stale publish) refusal rendered verbatim — `publish.test.tsx`
- 10.36 ✅ invalid envelope result rendered verbatim — `publish.test.tsx`

## Templates
- 10.37 ✅ The three templates validate clean and clone with fresh ids, never sharing structure — `templates.test.ts`
- 10.57 ✅ The three templates also produce no advisories — a shipped template never greets its author with a warning — `templates.test.ts`
- 10.38 ✅ errand-with-waits blocked-flags exactly its two waiting states — `templates.test.ts`
- 10.39 ✅ approval-chain requires a second person on approve — `templates.test.ts`
- 10.40 ✅ Gallery offers the three plus Start blank — `screens.test.tsx`

## Ticket types
- 10.41 ✅ List with rank, field count, Built-in badges — `ticket-types.test.tsx`
- 10.42 ✅ Create flow emits ticket-type.defined with a fresh entity ulid — `ticket-types.test.tsx`, `events.test.ts`
- 10.43 ✅ Select field without options: schema refusal in zod's own words; save blocked — `ticket-types.test.tsx`
- 10.44 ✅ Rank implications derived live; a type at or below the deepest rank — built-in or workspace-invented, rank 4 or deeper — says plainly that its tickets will need a parent, while shallower ranks say nothing of the sort — `rank.test.ts`, `ticket-types.test.tsx`
- 10.45 ✅ Built-in ranks locked in the UI with the reason named — `ticket-types.test.tsx`
- 10.46 ✅ Server refusal on save rendered verbatim — `ticket-types.test.tsx`

## Admin gating & honesty
- 10.47 ✅ Non-admins: banner, disabled fields, no publish/save/add anywhere — `access.test.tsx`, `ticket-types.test.tsx`, `screens.test.tsx`
- 10.48 ✅ permission.role refusal rendered character for character (planted defect) — `access.test.tsx`, `ticket-types.test.tsx`
- 10.49 ✅ System-rules panel names provenance and the parent-terminal refusal, citing spec §4 — `validation.test.tsx`

## Smoke (Playwright, env-gated)
- 10.50 🧪 Template to published to listed — `workflow-builder.spec.ts`
- 10.51 🧪 Blank author with a real drag-to-connect, published — `workflow-builder.spec.ts`
- 10.52 🧪 Member hits the read-only wall — `workflow-builder.spec.ts`
- 10.53 🚫 Drag-reorder persistence across sessions — layout is session-only in v1 (Open question 3)
```

- [ ] **Step 4: Commit**

```bash
git add Features.md test-cases/10-workflow-builder.md
git commit -m "Catalogue the workflow builder in Features.md §10 and test-cases/10 — every issue code, refusal surface and template flow cross-referenced to its covering test"
```

---

## Interfaces this plan produces (for the series coordination doc)

All exported from `@gisik-nokma/app-core` unless noted:

- **Core:** `WorkflowDraft`, `BuilderSelection`, `DraftStore`/`DraftActions`, `createDraftStore`, `newDraft`, `draftFromPublished`, `selectIssues`, `selectCanPublish`, `selectInboundTargetIds`; `layoutDraft`, `nextFreePosition`, `ANY_STATE_NODE_ID`, `COLUMN_WIDTH`, `ROW_HEIGHT`
- **Language:** `SummaryContext`, `summarizeRule`, `summarizeRules`, `summaryContextFor`; `FieldChoice`, `BUILTIN_FIELD_CHOICES`, `fieldChoicesFor`; `IssueAnchor`, `AnchoredIssue`, `AnchoredAdvisory`, `anchorIssues` (generic over `Issue | Advisory` — one machinery for both tiers)
- **Templates:** `WorkflowTemplate`, `WORKFLOW_TEMPLATES` (`simple-kanban`, `errand-with-waits`, `approval-chain` — full payloads in Task 3), `cloneTemplate`, `draftFromTemplate`
- **Gateway & events:** `WorkflowAuthoringGateway`, `WorkspaceMember`, `IngestResult` (client mirror), `createFakeGateway`/`FakeGatewaySeed`; `droppedStates`, `buildPublishPayload`, `buildWorkflowDefinedEvent`, `buildTicketTypeDefinedEvent`
- **Components:** `BuilderProvider`/`BuilderSession`/`BuilderEnvironment`, `canAuthorRole`, `useBuilderStore`/`useBuilderEnv`/`useDraft`/`useSummaryCtx`; `WorkflowCanvas`, `StateNode`, `AnyStateNode`, `TransitionEdge`, `toFlowGraph`, `connectionToTransition`; `InspectorPanel`, `StateInspector`, `TransitionInspector`, `AddRuleMenu`/`defaultRuleFor`, `RuleEditor` (+ the three kind editors); `IssuesPanel`, `SystemRulesPanel`, `ReadOnlyBanner`; `PublishControls`, `StateMappingDialog`; `WorkflowBuilderScreen`, `WorkflowListScreen`, `TemplateGallery`; `rankImplications`/`rankImplicationsCopy`, `TYPE_ICONS`/`TypeIcon`, `IconPicker`, `FieldsEditor`, `TicketTypeEditorScreen`, `TicketTypeListScreen`
- **apps/web:** `createDataSourceAuthoringGateway`, `useBuilderWiring`, routes `/w/[workspaceId]/settings/workflows` (+ `/new`, `/[workflowId]`) and `/w/[workspaceId]/settings/ticket-types` (+ `/new`, `/[typeId]`)
- **packages/ui:** `tokens.workflowBuilder.*` colour roles (Task 5 Step 1 — yields to Plan 6's equivalents if they exist)

**Consumed from `@gisik-nokma/domain` and load-bearing here:** `validateWorkflowDef` (eleven issue codes, publish-gating) and `adviseWorkflowDef` / `Advisory` (one advisory code, gating nothing). The two are separate functions and this plan keeps them separate — see design decision 9.

**New read APIs this plan needs (→ Plan 5 endpoints, → Plan 6 `DataSource.query`):** `listWorkflows` (latest per workflow), `getWorkflow`, `listTicketTypes`, `listMembers` (with display names), `getWorkflowStateOccupancy` (tickets per state — `proj_tickets` grouped by `state_id`). Exact route shapes proposed under Cross-plan coordination assumptions, item 3.

## Open questions

Flagged, never silently resolved. None blocks execution — each names the decision taken and why.

1. **Plans 5/6 parallelism.** Tasks 1–12 are self-contained in `packages/app-core` behind guard steps; Tasks 13–14 require Plan 6's `apps/web` and must run after it lands. The `IngestResult` mirror in `gateway.ts` merges with Plan 6's data-source declaration when both exist (Task 4 notes the merge direction).
2. **The five read APIs are assumed, not yet served.** Plan 5 must expose them over HTTP and Plan 6 must surface them on `DataSource.query` (names in Task 13's adapter are the proposal). Until then the builder runs only against the fake gateway — which is also how every component test runs it, so nothing in this plan idles.
3. **Canvas layout is session-only.** Auto-layout on load, drags kept in memory, nothing published (layout is presentation, not truth). If persisted layout is wanted, it belongs in `/v1/me/preferences` (amendment 14) under a `workflow-layout:{workflowId}` key — a later, additive change.
4. **`removeState` semantics** (decision 1): edges cascade; `initialStateId` and rdu references dangle into named issues. Consequence: `duplicate-state-id` and `unknown-transition-state` are unauthorable by pointer gestures and are planted via `loadDraft` — argued in the coverage table, flagged here for reviewer sign-off.
5. **Ticket-type entity streams.** Each `ticket-type.defined` mints a fresh entity ULID (Plan 3's own test convention; the projection folds by payload id). If a later plan keys per-entity sequence for type history, the gateway should return each type's entity id and the builder will reuse it — an additive change confined to `events.ts` and `gateway.ts`.
6. **Requires-parent follows the rank — SETTLED by the owner, 2026-08-20.** The coordination doc deferred this here; the owner answered it in the sign-off table and **overruled this plan's earlier call**. The rule: any ticket whose type sits at **or below the deepest rank** requires a parent — the built-in `sub-task` (rank 4), any custom type defined at rank 4, and anything deeper. Types at epic/story/task ranks are unaffected; an epic-rank custom type may still sit at project root. Applied here as `rank >= DEEPEST_RANK` in `rank.ts` (decision 4) with the rank-implications copy stating the requirement plainly, and in Plan 3 as the `hierarchy.deepest-rank-parent-required` refusal keyed on the same imported constant. Two things pinned so a later reader does not "improve" them: the constant is never replaced by a max computed over the loaded types (the builder would then describe a rule the server does not enforce), and the comparison is `>=` rather than `===` (a rank-5 type is smaller work than a sub-task, so exempting it would invert the rule's own justification and leave an escape hatch). **Still open** (the unrelated half of the original question): the built-in rank lock (decision 7) is UI-only — the server's last-definition-wins would accept a re-rank; if the owner wants that refused, it is a Plan 3 rule addition, not a builder change.
7. **`Issue` carries no structural ref — and neither does `Advisory`.** Anchoring recomputes offenders per code (robust to the reconciled validator's ordering, degrades to canvas-level, never crashes). Proposed contract amendment: additive `ref?: { stateId: string } | { transition: { from: string; to: string } }` on **both** shapes, which would delete `anchor-issues.ts`'s recomputation wholesale — including the `rdu-bypassable` reachability walk, which is the one recomputation here that duplicates real algorithmic content rather than a trivial scan.
8. **rdu start-state warning — SETTLED by the owner, 2026-08-26.** Plan 2's Open question 10 proposed a builder-side warning for `thanActorOf.to === ` the initial state, and this plan implemented it as an inline note in the editor. The owner split the question in two and answered both: the **dead** case (nothing in this version enters the watched state) is now the blocking issue code `rdu-unenterable-state`, and the **reachable-but-vacuous** case is the advisory `rdu-bypassable`, in a tier that does not gate publish. Both arrive through `@gisik-nokma/domain` and both land in the panel, so the plan no longer relies on a local warning to carry the honesty. The inline editor note stays — it speaks at the moment of authoring, before the panel has anything to say — but it is now the least of three, not the only one. Scope note the plan must not overclaim: the advisory characterises reachable vacuous acceptance **within a single workflow version** only; across versions, four-eyes is protected by the transition log carrying its `workflowVersion` (coordination doc, owner decisions part 3), which is Plan 2's business, not the builder's.
9. **`unknown-initial-state` message copy** is owned by the amended Plan 2; every test here asserts through `validateWorkflowDef`'s own output, so whatever copy ships needs no edit in this plan.
10. **Drafts are session-only; concurrent publishes are refused, not merged.** Two admins editing the same workflow race to publish; the loser gets the `workflow-version` refusal verbatim (tested, case 10.35) and re-applies their edit on a fresh load. Draft persistence/locking was considered and deferred — the ledger's refusal is the honest floor.
11. **E2E auth setup** depends on Plan 6's helper; Task 14 documents the `codegen --save-storage` fallback and the suite skips loudly when unconfigured.
12. **Colour roles and icons.** `tokens.workflowBuilder.*` values are proposals that yield to Plan 6's palette if one lands first (single-origin rule); the 16-name lucide icon vocabulary covers the four built-in seeds and is intentionally small — growing it is one line in `icons.tsx`.










