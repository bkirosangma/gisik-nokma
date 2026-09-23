# 4. Workflow engine & rule vocabulary

Status markers: `❌` not covered · `✅` covered · `🟡` partial · `🧪` manual · `🚫` consciously out of scope (with reason)

Fixture names refer to `packages/rule-engine/fixtures/`; unit tests to `packages/domain/test/` and `apps/server/test/`.

## Structural validation

- **4.1** ✅ A definition with no states reports exactly `no-states`. — `packages/domain/test/validate-workflow.test.ts`
- **4.2** ✅ Duplicate state ids are refused at publish. — `workflow-defined-refuses-duplicate-state-ids`
- **4.3** ✅ A workflow with no terminal state is refused at publish. — `workflow-defined-refuses-no-terminal-state`
- **4.4** ✅ A transition referencing an unknown state is refused at publish. — `workflow-defined-refuses-unknown-transition-state`
- **4.5** ✅ Two transitions over the same edge are refused; an exact edge plus a from-any edge to the same target is not a duplicate. — `workflow-defined-refuses-duplicate-transition`, `packages/domain/test/validate-workflow.test.ts`
- **4.6** ✅ An unreachable state is refused at publish; from-any targets count as reachable. — `workflow-defined-refuses-unreachable-state`, `packages/domain/test/validate-workflow.test.ts`
- **4.7** ✅ A terminal state with no way in is refused; a self-loop is not a way in. — `workflow-defined-refuses-unenterable-terminal-state`, `packages/domain/test/validate-workflow.test.ts`
- **4.8** ✅ A restrict-to naming nobody is refused at publish. — `workflow-defined-refuses-empty-restrict-to`
- **4.9** ✅ A require-different-user watching a nonexistent transition is refused at publish. — `workflow-defined-refuses-rdu-unknown-state`
- **4.43** ✅ An `initialStateId` naming no declared state is refused at publish as `unknown-initial-state`; the reachability walk never runs, so this is a separate refusal from 4.6. — `packages/domain/test/validate-workflow.test.ts`

## Versioning and stranding

- **4.10** ✅ A brand-new workflow must publish as version 1. — `workflow-defined-refuses-a-first-version-other-than-1`
- **4.11** ✅ Versions are consecutive; jumps are refused. — `workflow-defined-refuses-a-version-jump`
- **4.12** ✅ Dropping a state without a stateMapping entry is refused. — `workflow-defined-refuses-dropped-state-without-mapping`
- **4.13** ✅ A stateMapping target must exist in the new version. — `workflow-defined-refuses-mapping-to-unknown-state`
- **4.14** ✅ Only dropped states may be remapped. — `workflow-defined-refuses-mapping-for-surviving-state`
- **4.15** ✅ A complete mapping publishes; a display-name-only rename needs no mapping. — `workflow-defined-accepts-v2-with-complete-mapping`, `workflow-defined-accepts-a-rename-only-v2`
- **4.16** ✅ Envelope hygiene: wrong entity kind, entity/payload id mismatch, and unparseable payloads refuse. — `workflow-defined-refuses-wrong-entity-kind`, `workflow-defined-refuses-entity-id-mismatch`, `workflow-defined-refuses-malformed-payload`

## Transitions

- **4.17** ✅ A move on an unknown ticket, an unpublished workflow, or to an unknown state refuses with the missing thing named. — `transition-refuses-unknown-ticket`, `transition-refuses-unknown-workflow`, `transition-refuses-unknown-target-state`
- **4.18** ✅ A move along an edge the workflow lacks refuses naming both states; declared edges accept. — `transition-refuses-an-edge-the-workflow-lacks`, `transition-accepts-a-declared-edge`
- **4.19** ✅ A from-any edge is usable from every state. — `transition-accepts-a-from-any-edge`
- **4.20** ✅ A ticket from an older version follows stateMappings forward; with no covering mapping it refuses as stranded rather than guessing. — `transition-accepts-across-versions-via-mapping`, `transition-refuses-a-stranded-ticket`
- **4.21** ✅ Transition envelope hygiene: wrong entity kind and unparseable payloads refuse. — `transition-refuses-wrong-entity-kind`, `transition-refuses-malformed-payload`
- **4.22** ✅ Event types the engine does not handle pass through untouched. — `pass-through-accepts-unhandled-event-types`

## The invariant above all workflows

- **4.23** ✅ A parent cannot enter a terminal state while any child is non-terminal — open or active alike; it may once every child is terminal. — `invariant-refuses-terminal-parent-with-open-child`, `invariant-refuses-terminal-parent-with-active-child`, `invariant-accepts-terminal-parent-when-children-are-terminal`
- **4.54** ✅ The same invariant from the child's side (E3-19, B12): a child in a terminal state cannot move to a non-terminal one while its parent is terminal — a closed parent included — refused `child-open-under-terminal-parent` with the parent's title and state named; the identical move is accepted under a non-terminal parent, for a root ticket, and terminal → terminal under a terminal parent; a child already open under a terminal parent keeps its ordinary moves (only the move that creates the relation is refused); the parent is read exactly once on the guarded move and not at all otherwise. The client pre-check defers (gate 5) rather than passing the move when the parent is not cached, and previews the engine's refusal when it is. — `packages/rule-engine/test/parent-terminal-symmetric.test.ts`, `packages/app-core/test/precheck.test.ts` ("gate 5")
- **4.55** ✅ The invariant's LAST door (E6-8, B12): `ticket.closed` refuses `parent-terminal-with-open-children` — `This ticket cannot be closed while N of its child tickets is/are still open.` — for a parent whose terminal state was reached by a workflow republish rather than a transition: a kept state promoted `active → terminal` (door 1) and a dropped open state mapped onto a terminal one (door 2) are BOTH accepted at publish (not gated on occupancy, by the owner's 2026-08-26 doctrine — pinned here as the accepted half), and the close over the open child is refused after each; the plural renders at two open children; the close is accepted once every child is terminal, a childless terminal ticket closes as before, and a non-terminal one is still refused `close-requires-terminal` first. Measured AFTER 4.54's guard landed, because neither door here is a transition: RED `Tests 3 failed | 3 passed (6)`, the three closes `{ refused: false }`. The client pre-check mirrors it with gate 3's discipline (a vouched open child refuses, an unvouched set defers, a vouched terminal-only set passes); the auto-close sweep's SELECT mirrors it too (13.1167). — `packages/rule-engine/test/close-with-open-children.test.ts`, `packages/app-core/test/precheck.test.ts` (13.583 block, three E6-8 cases), `apps/server/test/auto-close/sweep.test.ts` (13.1167)

## The rule vocabulary

- **4.24** ✅ require-comment refuses bare and whitespace-only comments; a real comment passes. — `rule-require-comment-*`
- **4.25** ✅ require-evidence refuses without an attachment id; with one it passes. — `rule-require-evidence-*`
- **4.26** ✅ require-field wants the field set before the move, not with it. — `rule-require-field-*`
- **4.27** ✅ restrict-to: assignee, roles (via membership), and named people OR-combine; missing membership refuses; a planted empty restriction refuses everyone. — `rule-restrict-to-*` (11 fixtures; the eleventh belongs to case 4.50)
- **4.28** ✅ require-different-user: the last performer of the named move cannot act; a second person can; vacuous acceptance when nobody performed it; only the latest performer counts. — `rule-rdu-*` (6 fixtures)
- **4.29** ✅ Rules run in authored order and the first refusal wins — proven with the same violated pair in both orders. — `rules-first-refusal-wins`, `rules-order-comes-from-the-definition`

## Workflow projection

- **4.30** ✅ proj_workflows serves the latest version by default and historical versions on request; ignores foreign events; replay is idempotent; reset-and-reapply reproduces identical rows. — `apps/server/test/proj-workflows.test.ts` (integration, live Postgres)

## Four-eyes across versions, and the advisory tier

- **4.31** ✅ A require-different-user rule watching a state that exists but that nothing in this version enters is refused at publish. — `packages/domain/test/validate-workflow.test.ts` (`rdu-unenterable-state`)
- **4.32** ✅ An unknown watched state reports only `rdu-unknown-state`; the two four-eyes codes never both fire for one rule. — `packages/domain/test/validate-workflow.test.ts`
- **4.33** ✅ `adviseWorkflowDef` is silent on canonical four-eyes and warns (`rdu-bypassable`) when the guarded move is reachable without entering the watched state, on a from-any transition, and when the guarded edge is itself the entry into the watched state. — `packages/domain/test/advise-workflow.test.ts`
- **4.34** ✅ Advisories never gate publish: a definition that trips only `rdu-bypassable` is accepted by the engine. — `workflow-defined-accepts-a-def-the-advisory-warns-about`, `packages/domain/test/advise-workflow.test.ts`
- **4.35** ✅ Four-eyes survives a state being dropped and remapped in a later version: a log entry written under the old vocabulary is resolved forward before comparison, so the same person cannot make both moves. — `rule-rdu-refuses-across-a-remap`
- **4.36** 🚫 Vacuous acceptance across versions is not characterised by the advisory — it is closed by the per-entry `workflowVersion` instead (case 4.35). The advisory deliberately scopes to a single workflow version.
- **4.37** ✅ A transition-log entry recorded under a workflow the ticket has since been migrated off is ignored, even when both workflows spell the watched state the same way — four-eyes answers only for the workflow the ticket is on. — `rule-rdu-ignores-an-entry-from-a-workflow-the-ticket-has-left`
- **4.38** ✅ The version walk lives once, in `@gisik-nokma/domain`: it follows mappings through every intermediate version, reports the id at the point the chain broke, and refuses a state the latest definition no longer has. — `packages/domain/test/workflow-schema.test.ts` (`foldStateIdForward`)
- **4.39** ✅ `getWorkflowDefFromProjection` answers as of a ledger position: the version in force at that `workspace_seq`, not the newest one — v1 before v2 was published, v2 after. — `apps/server/test/proj-workflows.test.ts` (integration, live Postgres)
- **4.52** ✅ Four-eyes fails CLOSED on a history it cannot read: a log entry that will not resolve forward refuses the move, naming the watched state and telling the person to ask an admin about the workflow's version history — it is not skipped, and the FIRST unreadable entry refuses even when a later one resolves and matches, so a readable entry cannot paper over an unreadable earlier one. The ticket's own state resolves cleanly in both witnesses, so the refusal is four-eyes' own and not `stranded-state` arriving first. Guard 1 still comes first: an entry from a workflow the ticket has left is skipped before any resolution is attempted and does not trip this refusal, even when walking it would strand. (Plan 2 consequences §3.) — `rule-rdu-refuses-a-history-it-cannot-read`, `packages/rule-engine/test/require-different-user.test.ts`
- **4.53** ✅ Four-eyes reads the log in ascending `seq`, not in array order: with two entries matching the watched state whose array order contradicts their `seq`, the actor compared is the greater-`seq` one — array order would leave the wrong person standing and let a self-approval through. It sorts a COPY, so the transitions array the engine handed it comes back in the order it arrived. (Plan 2 consequences §4; `seq` had been carried on every entry since Plan 2 and read by nothing.) — `packages/rule-engine/test/require-different-user.test.ts`

## The generalised advisory: a lower-guard edge voids a guard (owner ruling, coordination §8)

- **4.44** ✅ `rule-bypassable` warns for every kind in the closed vocabulary — restrict-to, require-comment, require-evidence, require-field, require-different-user — when another edge enters the guarded state carrying no rule of that kind; a plain fast-track edge trips it exactly as a from-any edge does, so nothing in the code is special about the wildcard. — `packages/domain/test/advise-workflow.test.ts`
- **4.45** ✅ The silencing codicil, witnessed in both directions: an uncovered from-any edge warns, and one carrying a rule of the same kind does not. Cover is same-kind-present, so the covering case's parameters deliberately disagree (assignee-only beside named-people) and still cover; it cuts both ways, so two edges guarded by different kinds each void the other. — `packages/domain/test/advise-workflow.test.ts`
- **4.46** ✅ `rdu-bypassable` and `rule-bypassable` answer different questions: each fires alone where the other is silent, and both fire on one rule whose geometry is wrong in both ways. This is the evidence for keeping the four-eyes code distinct rather than subsuming it. — `packages/domain/test/advise-workflow.test.ts`
- **4.47** ✅ Advisory sweep hygiene: two rules of one kind on an edge yield one advisory, not two; a self-loop is not a way in and so cannot be the path that voids a guard; a transition whose target is not a declared state (the inert `to: '*'` the coordination rider names) is skipped rather than described. — `packages/domain/test/advise-workflow.test.ts`
- **4.48** ✅ No cross-tier suppression: `empty-restrict-to` and `rule-bypassable` both speak about the same definition, because a guard that names nobody and a path around the guard are two separate things to fix — unlike the two four-eyes suppressions, which stop one broken watch target being described twice. — `packages/domain/test/advise-workflow.test.ts`
- **4.49** ✅ Advisories still never gate publish under the generalised code: a definition that trips only `rule-bypassable` is accepted by the engine. — `workflow-defined-accepts-a-def-the-guard-advisory-warns-about`
- **4.50** ✅ Rules on a from-any edge are enforced, not merely legal: with no exact edge to the target the wildcard edge is the one that resolves, and its own restrict-to refuses the move. The suite's first witness of wildcard-edge rule enforcement. — `rule-restrict-to-refuses-through-a-from-any-edge`
- **4.51** ✅ A fixture may carry a `notes` string — the only comment JSON allows — which survives the strict parse, while a misspelled `note` still refuses at load. It is where the `wf_rules` "Guarded" definition records that its uncovered wildcard edge is the deliberately-warned example. — `packages/rule-engine/test/harness.test.ts`

## Cross-plan binding doors (controller rulings G1–G3)

- **4.40** ✅ `workflow.defined` events are bound to entity kind `workflow` at the door: an envelope naming this type against any other entity kind is refused `entity-kind-mismatch`, the general type↔kind binding every entity-kind-declaring registration gets. Layered with the engine's own kind checks by design — fixtures and Plan 10's offline replica reach `evaluateEvent` directly, bypassing `parseEvent`. — `packages/domain/test/parse-event.test.ts`
- **4.41** ✅ An entity already bound to one workspace cannot be re-filed under another: ingest refuses `entity-workspace-mismatch` before the engine ever runs. A server-side door, deliberately not a shared-engine rule — a workspace-scoped client replica cannot see the binding, so Plan 10's offline replica must mirror this knowingly rather than find it in the fixtures. No fixture; proven by integration test. — `apps/server/test/ingest.test.ts`
- **4.42** ✅ Projection registration order is pinned, DB-free: `proj_entity_heads` before `proj_workflows`, so a later projection reading an earlier one's table in the same ingest transaction (coordination doc §8) never silently breaks on a re-ordering. — `apps/server/test/projection-order.test.ts`
- **4.56** ✅ E6-20, planted defect — `workflowDefSchema` refuses a workflow named `" "` and a state named `" "` or `"\t"` with ruling P15's sentence, *"must not be blank — a name of only spaces names nothing"*, from the one `displayName` schema (`packages/domain/src/display-name.ts`) the workspace, project, ticket-type, field and option names now share; `"  Basic  "` still parses, so it is a refusal and not a trim. Before the fix both fields were `z.string().min(1)`: through `POST /v1/events` a workflow named `" "` committed and `GET workflows` listed it, and a state named `" "` was a board column with no header, while the P15 controls (`project.created` name `" "`, `ticket.created` title `" "`) refused in the same run. RED: `workflow: expected true to be false`. Id by the controller's 22:0x rule — next free after the max over `origin/main` and every `origin/rel/*` head (`4.54`). — `packages/domain/test/workflow-schema.test.ts`

## Starting status at ticket creation (owner request 2026-09-23; block 4.57–4.66, tip 4.56)

- **4.57** ✅ `isCreatableState(def, stateId)` — THE ONE HELPER every layer that decides whether a new ticket may be born somewhere calls — is tested alone: accepts an ordinary open state whose `creatable` flag is absent; refuses the universal Backlog state, a terminal state, a state whose `creatable` flag is explicitly `false`, and a state id the workflow does not declare. The new `creatable` flag on `workflowStateSchema` (absent means true, mirroring `blocked`) carries through the parse instead of being stripped — the same proof the `blocked` flag already has — which is what makes it survive `workflowDefinedPayloadSchema`'s non-strict parse at publish. — `packages/domain/test/workflow-schema.test.ts`
- **4.58** ✅ `validateWorkflowDef` refuses a workflow whose start state has `creatable: false` with `start-state-not-creatable` — such a workflow could never receive a ticket at all. Control: the same definition with `creatable` absent, or explicitly `true`, raises no such issue. — `packages/domain/test/validate-workflow.test.ts`
- **4.59** ✅ `ticketCreatedPayload` gains an optional `stateId` (the ticket's starting status): round-trips when present, round-trips (control) when absent — the shape every pre-existing event has; a `.refine` refuses `stateId` paired with `start: 'backlog'` (the owner's ruling: a backlog ticket has no starting status), and accepts it (control) paired with `start: 'focus'`. — `packages/domain/test/ticket-events.test.ts`
- **4.60** ✅ The reducer's `bornIn` reads the payload's `stateId` when present, born there with ITS OWN category; control: with `stateId` absent it is born in the workflow's initial state, as before. — `packages/domain/test/ticket-state.test.ts`
- **4.61** ✅ A `stateId` that fails `isCreatableState` throws in the reducer's existing style, naming the state — proven for an unknown state, a terminal state, and a `creatable: false` state; the engine's own door (case 4.62) refuses each of these before the event is ever accepted, so reaching the throw here means ledger integrity is broken. — `packages/domain/test/ticket-state.test.ts`
