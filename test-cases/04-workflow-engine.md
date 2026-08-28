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

## The rule vocabulary

- **4.24** ✅ require-comment refuses bare and whitespace-only comments; a real comment passes. — `rule-require-comment-*`
- **4.25** ✅ require-evidence refuses without an attachment id; with one it passes. — `rule-require-evidence-*`
- **4.26** ✅ require-field wants the field set before the move, not with it. — `rule-require-field-*`
- **4.27** ✅ restrict-to: assignee, roles (via membership), and named people OR-combine; missing membership refuses; a planted empty restriction refuses everyone. — `rule-restrict-to-*` (10 fixtures)
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

## Cross-plan binding doors (controller rulings G1–G3)

- **4.40** ✅ `workflow.defined` events are bound to entity kind `workflow` at the door: an envelope naming this type against any other entity kind is refused `entity-kind-mismatch`, the general type↔kind binding every entity-kind-declaring registration gets. Layered with the engine's own kind checks by design — fixtures and Plan 10's offline replica reach `evaluateEvent` directly, bypassing `parseEvent`. — `packages/domain/test/parse-event.test.ts`
- **4.41** ✅ An entity already bound to one workspace cannot be re-filed under another: ingest refuses `entity-workspace-mismatch` before the engine ever runs. A server-side door, deliberately not a shared-engine rule — a workspace-scoped client replica cannot see the binding, so Plan 10's offline replica must mirror this knowingly rather than find it in the fixtures. No fixture; proven by integration test. — `apps/server/test/ingest.test.ts`
- **4.42** ✅ Projection registration order is pinned, DB-free: `proj_entity_heads` before `proj_workflows`, so a later projection reading an earlier one's table in the same ingest transaction (coordination doc §8) never silently breaks on a re-ordering. — `apps/server/test/projection-order.test.ts`
