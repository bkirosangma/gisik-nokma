### Task 8: End-to-end planted-defect fixtures — the shared suite proves the refusals through the real engine

**Files:**
- Create: `packages/rule-engine/fixtures/parent-terminal-with-open-children.json`
- Create: `packages/rule-engine/fixtures/parent-terminal-all-children-done.json`
- Create: `packages/rule-engine/fixtures/created-rank-violation.json`
- Create: `packages/rule-engine/fixtures/created-rank-legal.json` (doubles as the accepting twin for the deepest-rank refusal — Step 4)
- Create: `packages/rule-engine/fixtures/created-deepest-rank-no-parent.json`
- Create: `packages/rule-engine/fixtures/reparent-cycle-after-rank-redefinition.json`
- Create: `packages/rule-engine/fixtures/reparent-legal-grandchild-up.json`
- Create: `packages/rule-engine/fixtures/field-set-unknown-field.json`
- Create: `packages/rule-engine/fixtures/field-set-kind-mismatch.json`
- Create: `packages/rule-engine/fixtures/field-set-legal.json`
- Create: `packages/rule-engine/fixtures/created-under-terminal-parent.json`
- Create: `packages/rule-engine/fixtures/reparent-live-under-terminal-parent.json`
- Create: `packages/rule-engine/fixtures/reparent-terminal-under-terminal-parent.json`
- Modify: `packages/rule-engine/src/fixtures.test.ts` (Plan 2's runner — context construction and comparison)

**Interfaces:**
- Consumes: Plan 2's fixture format `{name, workflowDefs: WorkflowDef[], memberships?, priorEvents, candidateEvent, expected}` and runner; `buildMemoryContext` (Task 4); `evaluateEvent` with the Task 5–7 routing.
- Produces: thirteen fixtures that run identically in every build that runs the shared suite (spec §7: "One shared fixture suite runs against the rule engine in client and server builds, so the two can never quietly disagree").

**Runner semantics (load-bearing, spell it in the runner's doc comment):** `priorEvents` are folded into the context WITHOUT evaluation — they are the accepted past. ONLY `candidateEvent` goes through `evaluateEvent`. This is why the rank re-definition event inside the cycle fixture is not itself refused, and why these fixtures compose with Plan 2's without re-litigating history.

**Comparison discipline:** the runner asserts `toMatchObject(fixture.expected)`. Every refusal fixture MUST name its `rule`; it also names the literal `reason` whenever this plan owns the string. The two parent-terminal fixtures name only the `rule` (`parent-terminal-with-open-children`, per Coordination) because Plan 2 owns that reason string and already asserts it exactly in its own suite. The `…-under-terminal-parent` trio (Step 6b) is a different rule — `hierarchy.parent-terminal`, whose reason THIS plan owns — so those fixtures name the literal reason too.

- [ ] **Step 1: Extend the fixture runner to build context from prior events**

In `packages/rule-engine/src/fixtures.test.ts`, replace the runner's context construction with `buildMemoryContext`, keeping anything Plan 2's runner layers on for its own rules (e.g. transition history for `require-different-user`) — merge, don't discard:

```ts
import { buildMemoryContext } from './memory-context';

// inside the per-fixture test body:
// priorEvents are the accepted past — folded, never evaluated.
// Only candidateEvent faces the engine.
const ctx = buildMemoryContext(fixture.workflowDefs, fixture.priorEvents);
const verdict = await evaluateEvent(fixture.candidateEvent, ctx);
expect(verdict).toMatchObject(fixture.expected);
```

If any Plan 2 fixture's `priorEvents` transition a ticket that was never created, add the `ticket-type.defined` + `ticket.created` prior events it now needs — after this plan, a ticket cannot transition before it exists anywhere in the system, and the fixtures must describe a world that can happen.

- [ ] **Step 2: Run the existing suite to prove the runner change alone breaks nothing**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/fixtures.test.ts`
Expected: PASS (Plan 2's fixtures only, possibly after the prior-event additions above).

- [ ] **Step 3: Write the two parent-terminal fixtures (invariant 3, end to end)**

`packages/rule-engine/fixtures/parent-terminal-with-open-children.json`:

```json
{
  "name": "parent terminal with an open child is refused",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "story" },
      "payload": { "id": "story", "name": "Story", "icon": "book", "rank": 2, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "task" },
      "payload": { "id": "task", "name": "Task", "icon": "check", "rank": 3, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 },
    { "id": "01J9GEV3000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
      "payload": { "typeId": "story", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Quarterly filings" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 1 },
    { "id": "01J9GEV4000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GCHA000000000000000000" },
      "payload": { "typeId": "task", "projectId": "01J9GPRJ000000000000000000", "parentId": "01J9GPAR000000000000000000", "title": "File GST" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:03.000Z", "serverTime": "2026-08-20T09:00:03.100Z", "seq": 1 },
    { "id": "01J9GEV5000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GCHB000000000000000000" },
      "payload": { "typeId": "task", "projectId": "01J9GPRJ000000000000000000", "parentId": "01J9GPAR000000000000000000", "title": "File TDS" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:04.000Z", "serverTime": "2026-08-20T09:00:04.100Z", "seq": 1 },
    { "id": "01J9GEV6000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.transitioned", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GCHA000000000000000000" },
      "payload": { "toStateId": "done" },
      "actorId": "user-anselma", "origin": "web", "clientTime": "2026-08-20T09:00:05.000Z", "serverTime": "2026-08-20T09:00:05.100Z", "seq": 2 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.transitioned", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
    "payload": { "toStateId": "done" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:06.000Z", "serverTime": "2026-08-20T09:00:06.100Z", "seq": 2
  },
  "expected": { "refused": true, "rule": "parent-terminal-with-open-children" }
}
```

`packages/rule-engine/fixtures/parent-terminal-all-children-done.json` — the accepting twin: identical `workflowDefs` and `priorEvents` as above PLUS one more prior event (the second child also finishes), and the same `candidateEvent`, now accepted:

```json
{
  "name": "parent terminal is accepted once every child is terminal",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "story" },
      "payload": { "id": "story", "name": "Story", "icon": "book", "rank": 2, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "task" },
      "payload": { "id": "task", "name": "Task", "icon": "check", "rank": 3, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 },
    { "id": "01J9GEV3000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
      "payload": { "typeId": "story", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Quarterly filings" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 1 },
    { "id": "01J9GEV4000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GCHA000000000000000000" },
      "payload": { "typeId": "task", "projectId": "01J9GPRJ000000000000000000", "parentId": "01J9GPAR000000000000000000", "title": "File GST" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:03.000Z", "serverTime": "2026-08-20T09:00:03.100Z", "seq": 1 },
    { "id": "01J9GEV5000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GCHB000000000000000000" },
      "payload": { "typeId": "task", "projectId": "01J9GPRJ000000000000000000", "parentId": "01J9GPAR000000000000000000", "title": "File TDS" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:04.000Z", "serverTime": "2026-08-20T09:00:04.100Z", "seq": 1 },
    { "id": "01J9GEV6000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.transitioned", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GCHA000000000000000000" },
      "payload": { "toStateId": "done" },
      "actorId": "user-anselma", "origin": "web", "clientTime": "2026-08-20T09:00:05.000Z", "serverTime": "2026-08-20T09:00:05.100Z", "seq": 2 },
    { "id": "01J9GEV7000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.transitioned", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GCHB000000000000000000" },
      "payload": { "toStateId": "done" },
      "actorId": "user-anselma", "origin": "web", "clientTime": "2026-08-20T09:00:06.000Z", "serverTime": "2026-08-20T09:00:06.100Z", "seq": 2 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.transitioned", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
    "payload": { "toStateId": "done" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:07.000Z", "serverTime": "2026-08-20T09:00:07.100Z", "seq": 2
  },
  "expected": { "refused": false }
}
```

- [ ] **Step 4: Write the rank pair — the violation, and a twin that guards two refusals at once**

`packages/rule-engine/fixtures/created-rank-violation.json`:

```json
{
  "name": "an epic created under a story is refused — rank must exceed the parent",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "epic" },
      "payload": { "id": "epic", "name": "Epic", "icon": "flag", "rank": 1, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "story" },
      "payload": { "id": "story", "name": "Story", "icon": "book", "rank": 2, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 },
    { "id": "01J9GEV3000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
      "payload": { "typeId": "story", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Shop compliance" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 1 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GNEW000000000000000000" },
    "payload": { "typeId": "epic", "projectId": "01J9GPRJ000000000000000000", "parentId": "01J9GPAR000000000000000000", "title": "Everything, under one story" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:03.000Z", "serverTime": "2026-08-20T09:00:03.100Z", "seq": 1
  },
  "expected": {
    "refused": true,
    "rule": "hierarchy.rank",
    "reason": "\"Epic\" cannot go under \"Story\": a ticket's parent must be a bigger kind of work."
  }
}
```

`packages/rule-engine/fixtures/created-rank-legal.json` — the accepting twin. It carries a workspace-invented `Checklist item` at rank 4 and creates one **under** the story, so one candidate guards two refusals from over-firing: `hierarchy.rank` (4 under 2 is legal) and `hierarchy.deepest-rank-parent-required` (the deepest rank is fine once it names a parent — Step 4a is its planted defect). One twin, two guards, no near-duplicate fixture:

```json
{
  "name": "a custom type at the deepest rank, created under a story, is accepted — rank-legal and its parent named",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "story" },
      "payload": { "id": "story", "name": "Story", "icon": "book", "rank": 2, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "task" },
      "payload": { "id": "task", "name": "Task", "icon": "check", "rank": 3, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 },
    { "id": "01J9GEV3000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "checklist-item" },
      "payload": { "id": "checklist-item", "name": "Checklist item", "icon": "list", "rank": 4, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 1 },
    { "id": "01J9GEV4000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
      "payload": { "typeId": "story", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Shop compliance" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:03.000Z", "serverTime": "2026-08-20T09:00:03.100Z", "seq": 1 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GNEW000000000000000000" },
    "payload": { "typeId": "checklist-item", "projectId": "01J9GPRJ000000000000000000", "parentId": "01J9GPAR000000000000000000", "title": "Photograph the renewed licence" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:04.000Z", "serverTime": "2026-08-20T09:00:04.100Z", "seq": 1
  },
  "expected": { "refused": false }
}
```

- [ ] **Step 4a: Write the deepest-rank planted defect (owner decision 2026-08-20 — the rank, not the id)**

Same world as the twin above, same custom type, one difference: nothing is named as its parent. The refusal has to name **`Checklist item`**, not "sub-task" — that is the whole point of the owner's overrule, and a fixture asserting the literal reason is what makes the copy provable outside the unit tests.

`packages/rule-engine/fixtures/created-deepest-rank-no-parent.json`:

```json
{
  "name": "a custom type at the deepest rank is refused at project root, named as itself",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "story" },
      "payload": { "id": "story", "name": "Story", "icon": "book", "rank": 2, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "task" },
      "payload": { "id": "task", "name": "Task", "icon": "check", "rank": 3, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 },
    { "id": "01J9GEV3000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "checklist-item" },
      "payload": { "id": "checklist-item", "name": "Checklist item", "icon": "list", "rank": 4, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 1 },
    { "id": "01J9GEV4000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
      "payload": { "typeId": "story", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Shop compliance" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:03.000Z", "serverTime": "2026-08-20T09:00:03.100Z", "seq": 1 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GNEW000000000000000000" },
    "payload": { "typeId": "checklist-item", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Photograph the renewed licence" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:04.000Z", "serverTime": "2026-08-20T09:00:04.100Z", "seq": 1
  },
  "expected": {
    "refused": true,
    "rule": "hierarchy.deepest-rank-parent-required",
    "reason": "\"Checklist item\" is the smallest kind of work, so it always belongs to a parent ticket. Pick the ticket this one is part of."
  }
}
```

- [ ] **Step 5: Write the cycle pair**

`packages/rule-engine/fixtures/reparent-cycle-after-rank-redefinition.json` — the rank re-definition (types are events, last definition wins) makes the loop rank-legal, so only the cycle check stands between the board and a lie:

```json
{
  "name": "reparenting under a descendant is refused as a loop even when a rank re-definition made it rank-legal",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "phase" },
      "payload": { "id": "phase", "name": "Phase", "icon": "flag", "rank": 1, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "step" },
      "payload": { "id": "step", "name": "Step", "icon": "check", "rank": 2, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 },
    { "id": "01J9GEV3000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
      "payload": { "typeId": "phase", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Opening the second counter" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 1 },
    { "id": "01J9GEV4000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GTKB000000000000000000" },
      "payload": { "typeId": "step", "projectId": "01J9GPRJ000000000000000000", "parentId": "01J9GTKA000000000000000000", "title": "Order the counter" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:03.000Z", "serverTime": "2026-08-20T09:00:03.100Z", "seq": 1 },
    { "id": "01J9GEV5000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "phase" },
      "payload": { "id": "phase", "name": "Phase", "icon": "flag", "rank": 3, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:04.000Z", "serverTime": "2026-08-20T09:00:04.100Z", "seq": 2 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.reparented", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
    "payload": { "newParentId": "01J9GTKB000000000000000000" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:05.000Z", "serverTime": "2026-08-20T09:00:05.100Z", "seq": 2
  },
  "expected": {
    "refused": true,
    "rule": "hierarchy.cycle",
    "reason": "This move would put the ticket inside one of its own sub-items, making a loop. A ticket cannot contain itself."
  }
}
```

`packages/rule-engine/fixtures/reparent-legal-grandchild-up.json` — the accepting twin (a real chain, a legal move):

```json
{
  "name": "pulling a grandchild up under its grandparent is accepted",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "epic" },
      "payload": { "id": "epic", "name": "Epic", "icon": "flag", "rank": 1, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "story" },
      "payload": { "id": "story", "name": "Story", "icon": "book", "rank": 2, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 },
    { "id": "01J9GEV3000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "task" },
      "payload": { "id": "task", "name": "Task", "icon": "check", "rank": 3, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 1 },
    { "id": "01J9GEV4000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
      "payload": { "typeId": "epic", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Opening the second counter" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:03.000Z", "serverTime": "2026-08-20T09:00:03.100Z", "seq": 1 },
    { "id": "01J9GEV5000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GTKB000000000000000000" },
      "payload": { "typeId": "story", "projectId": "01J9GPRJ000000000000000000", "parentId": "01J9GTKA000000000000000000", "title": "Fit out the space" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:04.000Z", "serverTime": "2026-08-20T09:00:04.100Z", "seq": 1 },
    { "id": "01J9GEV6000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GTKC000000000000000000" },
      "payload": { "typeId": "task", "projectId": "01J9GPRJ000000000000000000", "parentId": "01J9GTKB000000000000000000", "title": "Order the counter" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:05.000Z", "serverTime": "2026-08-20T09:00:05.100Z", "seq": 1 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.reparented", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GTKC000000000000000000" },
    "payload": { "newParentId": "01J9GTKA000000000000000000" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:06.000Z", "serverTime": "2026-08-20T09:00:06.100Z", "seq": 2
  },
  "expected": { "refused": false }
}
```

- [ ] **Step 6: Write the field trio**

`packages/rule-engine/fixtures/field-set-unknown-field.json`:

```json
{
  "name": "setting a field the type never declared is refused",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "task" },
      "payload": { "id": "task", "name": "Task", "icon": "check", "rank": 3, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
      "payload": { "typeId": "task", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Pay the supplier" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.field_set", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
    "payload": { "fieldId": "invoice-number", "value": "INV-7" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 2
  },
  "expected": {
    "refused": true,
    "rule": "field.unknown",
    "reason": "This ticket's type has no such field. Add the field to the ticket type first."
  }
}
```

`packages/rule-engine/fixtures/field-set-kind-mismatch.json`:

```json
{
  "name": "text where a number belongs is refused with the field named",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "invoice" },
      "payload": { "id": "invoice", "name": "Invoice", "icon": "receipt", "rank": 3, "workflowId": "wf-basic",
        "fields": [ { "id": "amount", "name": "Invoice amount", "type": "number" } ] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
      "payload": { "typeId": "invoice", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Supplier invoice, August" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.field_set", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
    "payload": { "fieldId": "amount", "value": "twelve" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 2
  },
  "expected": {
    "refused": true,
    "rule": "field.type-mismatch",
    "reason": "\"Invoice amount\" needs a number."
  }
}
```

`packages/rule-engine/fixtures/field-set-legal.json` — the accepting twin (same world, a fitting value):

```json
{
  "name": "a number where a number belongs is accepted",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "invoice" },
      "payload": { "id": "invoice", "name": "Invoice", "icon": "receipt", "rank": 3, "workflowId": "wf-basic",
        "fields": [ { "id": "amount", "name": "Invoice amount", "type": "number" } ] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
      "payload": { "typeId": "invoice", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Supplier invoice, August" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.field_set", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
    "payload": { "fieldId": "amount", "value": 1200 },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 2
  },
  "expected": { "refused": false }
}
```

- [ ] **Step 6b: Write the terminal-parent trio (owner decision 2026-08-20 — the engine half, end to end)**

`packages/rule-engine/fixtures/created-under-terminal-parent.json`:

```json
{
  "name": "creating live work under a finished parent is refused toward a reopen",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "story" },
      "payload": { "id": "story", "name": "Story", "icon": "book", "rank": 2, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "task" },
      "payload": { "id": "task", "name": "Task", "icon": "check", "rank": 3, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 },
    { "id": "01J9GEV3000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
      "payload": { "typeId": "story", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Quarterly filings" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 1 },
    { "id": "01J9GEV4000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.transitioned", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
      "payload": { "toStateId": "done" },
      "actorId": "user-anselma", "origin": "web", "clientTime": "2026-08-20T09:00:03.000Z", "serverTime": "2026-08-20T09:00:03.100Z", "seq": 2 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GNEW000000000000000000" },
    "payload": { "typeId": "task", "projectId": "01J9GPRJ000000000000000000", "parentId": "01J9GPAR000000000000000000", "title": "File CGST" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:04.000Z", "serverTime": "2026-08-20T09:00:04.100Z", "seq": 1
  },
  "expected": {
    "refused": true,
    "rule": "hierarchy.parent-terminal",
    "reason": "\"Quarterly filings\" is finished (Done). Adding live work reopens it — choose a state to reopen it to, then add this ticket."
  }
}
```

`packages/rule-engine/fixtures/reparent-live-under-terminal-parent.json` — same `workflowDefs`; the parent finishes, then a live task tries to move under it:

```json
{
  "name": "moving live work under a finished parent is refused toward a reopen",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "story" },
      "payload": { "id": "story", "name": "Story", "icon": "book", "rank": 2, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "task" },
      "payload": { "id": "task", "name": "Task", "icon": "check", "rank": 3, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 },
    { "id": "01J9GEV3000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
      "payload": { "typeId": "story", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Quarterly filings" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 1 },
    { "id": "01J9GEV4000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.transitioned", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
      "payload": { "toStateId": "done" },
      "actorId": "user-anselma", "origin": "web", "clientTime": "2026-08-20T09:00:03.000Z", "serverTime": "2026-08-20T09:00:03.100Z", "seq": 2 },
    { "id": "01J9GEV5000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
      "payload": { "typeId": "task", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Renew trade licence" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:04.000Z", "serverTime": "2026-08-20T09:00:04.100Z", "seq": 1 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.reparented", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
    "payload": { "newParentId": "01J9GPAR000000000000000000" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:05.000Z", "serverTime": "2026-08-20T09:00:05.100Z", "seq": 2
  },
  "expected": {
    "refused": true,
    "rule": "hierarchy.parent-terminal",
    "reason": "\"Quarterly filings\" is finished (Done). Moving live work under it reopens it — choose a state to reopen it to, then move this ticket."
  }
}
```

`packages/rule-engine/fixtures/reparent-terminal-under-terminal-parent.json` — the accepting twin: identical `workflowDefs` and `priorEvents` as above PLUS one more prior event (the task also finishes), and the same reparent, now accepted — a terminal child under a terminal parent contradicts nothing:

```json
{
  "name": "a terminal child moving under a terminal parent is accepted",
  "workflowDefs": [ {
    "id": "wf-basic", "version": 1, "name": "Basic", "initialStateId": "todo",
    "states": [
      { "id": "todo", "name": "To do", "category": "open" },
      { "id": "doing", "name": "Doing", "category": "active" },
      { "id": "done", "name": "Done", "category": "terminal" }
    ],
    "transitions": [
      { "from": "*", "to": "todo", "rules": [] },
      { "from": "*", "to": "doing", "rules": [] },
      { "from": "*", "to": "done", "rules": [] }
    ]
  } ],
  "priorEvents": [
    { "id": "01J9GEV1000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "story" },
      "payload": { "id": "story", "name": "Story", "icon": "book", "rank": 2, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:00.000Z", "serverTime": "2026-08-20T09:00:00.100Z", "seq": 1 },
    { "id": "01J9GEV2000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket-type.defined", "version": 1,
      "entity": { "kind": "ticket-type", "id": "task" },
      "payload": { "id": "task", "name": "Task", "icon": "check", "rank": 3, "workflowId": "wf-basic", "fields": [] },
      "actorId": "user-kiro", "origin": "server", "clientTime": "2026-08-20T09:00:01.000Z", "serverTime": "2026-08-20T09:00:01.100Z", "seq": 1 },
    { "id": "01J9GEV3000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
      "payload": { "typeId": "story", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Quarterly filings" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:02.000Z", "serverTime": "2026-08-20T09:00:02.100Z", "seq": 1 },
    { "id": "01J9GEV4000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.transitioned", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GPAR000000000000000000" },
      "payload": { "toStateId": "done" },
      "actorId": "user-anselma", "origin": "web", "clientTime": "2026-08-20T09:00:03.000Z", "serverTime": "2026-08-20T09:00:03.100Z", "seq": 2 },
    { "id": "01J9GEV5000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.created", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
      "payload": { "typeId": "task", "projectId": "01J9GPRJ000000000000000000", "parentId": null, "title": "Renew trade licence" },
      "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:04.000Z", "serverTime": "2026-08-20T09:00:04.100Z", "seq": 1 },
    { "id": "01J9GEV6000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.transitioned", "version": 1,
      "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
      "payload": { "toStateId": "done" },
      "actorId": "user-anselma", "origin": "web", "clientTime": "2026-08-20T09:00:05.000Z", "serverTime": "2026-08-20T09:00:05.100Z", "seq": 2 }
  ],
  "candidateEvent": {
    "id": "01J9GCND000000000000000000", "workspaceId": "01J9GWS0000000000000000000", "type": "ticket.reparented", "version": 1,
    "entity": { "kind": "ticket", "id": "01J9GTKA000000000000000000" },
    "payload": { "newParentId": "01J9GPAR000000000000000000" },
    "actorId": "user-kiro", "origin": "web", "clientTime": "2026-08-20T09:00:06.000Z", "serverTime": "2026-08-20T09:00:06.100Z", "seq": 3
  },
  "expected": { "refused": false }
}
```

- [ ] **Step 7: Run the fixture suite — all thirteen new fixtures plus Plan 2's must pass**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/fixtures.test.ts`
Expected: PASS. If `parent-terminal-with-open-children` fails on the rule name, align `expected.rule` with the id Plan 2 actually published for the parent-terminal invariant (Coordination table) — that is the ONLY permitted edit to `expected`.

- [ ] **Step 8: Commit**

```bash
git add packages/rule-engine/fixtures packages/rule-engine/src/fixtures.test.ts
git commit -m "Thirteen end-to-end fixtures: every hierarchy and field refusal proven against a planted defect through the real engine — including a workspace's own deepest-rank type refused at project root under its own name — with accepting twins so the suite cannot pass by refusing everything"
```

