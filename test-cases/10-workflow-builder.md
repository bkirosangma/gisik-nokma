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
- 10.55 ✅ rdu-bypassable advisory: rendered in its own non-blocking section, anchored and click-to-select, and absent when there is nothing to say — `validation.test.tsx` ("warns about a bypassable four-eyes rule..."), `anchor-issues.test.ts` ("the rdu-bypassable advisory anchors to the transition carrying the rule")
- 10.56 ✅ An advisory does not gate publish — the button stays enabled, the publish commits, and `selectCanPublish` stays `validateWorkflowDef` emptiness — `publish.test.tsx`, `draft-store.test.ts`
- 10.58 ✅ rule-bypassable advisory: a guard sidestepped by a lower/no-guard edge into the same target, anchored to the GUARDED edge (not the one that sidesteps it), rendered in the same advisory section — `validation.test.tsx` ("warns about a guard another edge into the same state sidesteps...", "anchors a rule-bypassable advisory to the GUARDED edge..."), `anchor-issues.test.ts` ("the rule-bypassable advisory anchors to the guarded transition", "every advisory from adviseWorkflowDef gets some anchor, both known codes included")

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
- 10.57 ✅ simple-kanban and approval-chain produce no advisories — `templates.test.ts` ("simple-kanban and approval-chain warn about nothing")
- 10.38 ✅ errand-with-waits blocked-flags exactly its two waiting states — `templates.test.ts`
- 10.39 ✅ approval-chain requires a second person on approve — `templates.test.ts`
- 10.40 ✅ Gallery offers the three plus Start blank — `screens.test.tsx`
- 10.61 ✅ errand-with-waits does **not** produce no advisories — it trips `rule-bypassable` twice on its two pinned rule-free one-hop paths into `waiting`, asserted against `adviseWorkflowDef`'s own output rather than a hardcoded expectation — `templates.test.ts` ("errand-with-waits trips rule-bypassable — recorded, not adjudicated"). Fully covered, not a gap: it is a documented, deliberate exception to Task 3's "a shipped template warns about nothing" invariant, tracked by an open ruling request in the coordination doc ("Plan 8 Task 3's frozen errand template trips `rule-bypassable`"), owned jointly by Plan 11 (the frozen template shape) and Plan 2 (the advisory design) — neither this task nor Task 3 can resolve it.

## Ticket types
- 10.41 ✅ List with rank, field count, Built-in badges — `ticket-types.test.tsx`
- 10.42 ✅ Create flow emits ticket-type.defined with a fresh entity ulid — `ticket-types.test.tsx`, `events.test.ts`
- 10.43 ✅ Select field without options: schema refusal in zod's own words; save blocked — `ticket-types.test.tsx`
- 10.44 ✅ Rank implications derived live; a type at or below the deepest rank — built-in or workspace-invented, rank 4 or deeper — says plainly that its tickets will need a parent, while shallower ranks say nothing of the sort — `rank.test.ts`, `ticket-types.test.tsx`
- 10.45 ✅ Built-in ranks locked in the UI with the reason named — `ticket-types.test.tsx`
- 10.46 ✅ Server refusal on save rendered verbatim — `ticket-types.test.tsx`
- 10.60 ✅ Rebinding a type to a different workflow with live tickets: the move gate follows the SAVED binding (not merely whether anything was ever saved) and only opens when the binding actually changed; confirming authors one cross-workflow population map and hands the server one `migrateTypeToWorkflow` call — never a `stateMapping` — `ticket-types.test.tsx` ("the notice appears only when the binding actually changed", "authors one cross-workflow map and hands the server one migration — never a stateMapping", "the move gate follows the SAVED binding, not merely whether anything was ever saved"), mounted from `TicketTypeEditorScreen` via `WorkflowRebindDialog`

## Admin gating & honesty
- 10.47 ✅ Non-admins: banner, disabled fields, no publish/save/add anywhere — `access.test.tsx`, `ticket-types.test.tsx`, `screens.test.tsx`
- 10.48 ✅ permission.role refusal rendered character for character (planted defect) — `access.test.tsx`, `ticket-types.test.tsx`
- 10.49 ✅ System-rules panel names provenance and the parent-terminal refusal, citing spec §4 — `validation.test.tsx`

## Workflow list screen
- 10.62 ✅ Published workflows list with name, `v<version>` and a state count, and Open hands the route the id — `screens.test.tsx` ("lists published workflows with version and state count, and opens one")
- 10.63 ✅ An author is offered `New workflow`, and an empty list says so in its own words rather than rendering nothing — `screens.test.tsx` ("offers New workflow to authors and says when the list is empty")
- 10.64 ✅ A rejected list read gets its own sentence, never the empty-list one — `screens.test.tsx` ("says so when the workflow list cannot load"). The fourth `WorkflowListScreen` case, "hides New workflow from non-authors", is not a gap: it is covered by 10.47, which already cites `screens.test.tsx` for the non-author surface.

## Routes (apps/web)
Six real, gate-covered tests over the route layer, in `apps/web/test/authoring-routes.test.tsx`, rendering the pages through the REAL `Providers` with stub services — so `useAppServices`, `useSessionStatus` and `useBuilderWiring` are all under test rather than replaced by the harness. Every case here comes in a PAIR: the thing that must be absent for a member and the SAME thing present for an admin in the same file, because a lone `not.toBeInTheDocument()` passes just as well against a page that never had the element.
- 10.65 ✅ A member who TYPES `/settings/workflows/new` gets the read-only sentence and neither half of the gallery — named in advance: no `Use this template…` card and no `Start blank` — plus a link back to the list — `authoring-routes.test.tsx` ("a MEMBER typing /settings/workflows/new gets the read-only sentence and no gallery")
- 10.66 ✅ CONTROL for 10.65: an admin gets exactly those buttons on the same page, the template names printed rather than counted, and no read-only sentence — `authoring-routes.test.tsx` ("CONTROL — an ADMIN gets exactly those buttons on the same page")
- 10.67 ✅ A member who types `/settings/ticket-types/new` gets the sentence, no editor form and a link back — the milder half of the same gate: `TicketTypeEditorScreen` does take a session, so what a member would otherwise get is a blank form they cannot fill — `authoring-routes.test.tsx` ("a MEMBER typing /settings/ticket-types/new gets the sentence and no editor form")
- 10.68 ✅ CONTROL for 10.67: an admin gets the editor form on the same page. Its two gateway reads are stubbed deliberately, so a REJECTION cannot produce the same blank screen the gate produces and let the pair pass for the wrong reason — `authoring-routes.test.tsx` ("CONTROL — an ADMIN gets the editor form on the same page")
- 10.69 ✅ A roster read that REJECTS renders the refusal's own words (`Your role in this workspace cannot be shown yet.` plus the cause) and mounts no screen — awaited on the refusal text rather than `role="status"`, because the loading arm is also a status and the case would otherwise assert against the spinner — `authoring-routes.test.tsx` ("a rejected roster read renders the cause’s own words and mounts no screen")
- 10.70 ✅ CONTROL for 10.69: the SAME rejection shape, but `AuthoringReadRefused` — what the adapter throws for the 404 the no-guests door really sends — is an ANSWER, so the page mounts read-only with no `New workflow` and no refusal panel — `authoring-routes.test.tsx` ("CONTROL — the SAME refusal shape, but the one the door really sends, is a GUEST and not a failure")

## Adapter seam (apps/web)
- 10.59 ✅ getWorkflow/listTicketTypes/submit route through Plan 6's `DataSource`; listWorkflows/getStateOccupancy/getTypeWorkflowPopulation/migrateTypeToWorkflow route over the online HTTP client (no `DataSourceQuery` member exists for them); listMembers never calls `DataSourceQuery.getMembers` (`Actor[]`, wrong shape) and instead reads members over HTTP into `WorkspaceMember[]` — `apps/web/test/data-source-gateway.test.ts`

## Smoke (Playwright, env-gated)
- 10.50 🧪 Template to published to listed — `workflow-builder.spec.ts`
- 10.51 🧪 Blank author with a real drag-to-connect, published — `workflow-builder.spec.ts`
- 10.52 🧪 Member hits the read-only wall — `workflow-builder.spec.ts`
- 10.53 🚫 Drag-reorder persistence across sessions — layout is session-only in v1 (Open question 3)

**What backstops 10.50–10.52 and what does not.** These three specs are real and exist (`apps/web/e2e/workflow-builder.spec.ts`), but they are outside every automated gate on this repo today: `turbo.json` defines only `build`, `test` and `typecheck` — there is no `e2e` task, so `pnpm turbo run build test typecheck` never reaches them — and `.github/workflows/ci.yml` runs only `pnpm check:env` and that turbo line; its only mentions of e2e are two comments, one of which explicitly defers it. Locally, `pnpm --filter @gisik-nokma/web test:e2e` runs them and they skip loudly (not silently) unless `E2E_BASE_URL`, `E2E_WORKSPACE_ID` and `E2E_ADMIN_STORAGE_STATE` (`E2E_MEMBER_STORAGE_STATE` optional) are set — verified this session: 3 skipped, 5 (the pre-existing `smoke.spec.ts` cases) passed. Wiring CI to run this suite against a real deployed stack is Plan 11's deployment work (it owns the boot path, start script and deployment target — verified present at `docs/superpowers/plans/2026-08-20-11-deployment-dogfooding.md`), not this task's to annex.
