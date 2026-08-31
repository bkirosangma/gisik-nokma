### Task 4: The in-memory EngineContext — fixtures and unit tests see tickets the way the server does

**Files:**
- Create: `packages/rule-engine/src/memory-context.ts`
- Test: `packages/rule-engine/src/memory-context.test.ts`
- Modify: `packages/rule-engine/src/index.ts` (export `buildMemoryContext`)

**Interfaces:**
- Consumes: `applyTicketEvent`, `TicketState`, `TicketStateDeps`, `TICKET_EVENT_TYPES`, `TicketTypeDef`, `ticketTypeDefSchema`, `makeEnvelope` (Tasks 1–3, `@gisik-nokma/domain`); `WorkflowDef` (Plan 2); `EngineContext` (Plan 2, `@gisik-nokma/rule-engine`).
- Produces:

```ts
export type MemoryContext = EngineContext & {
  tickets: Map<string, TicketState>;
  ticketTypes: Map<string, TicketTypeDef>;
  workflows: Map<string, WorkflowDef>;            // latest version per workflow id
  workflowVersions: Map<string, WorkflowDef[]>;   // every version seen, ascending — the fold walks this
};
export function buildMemoryContext(seedWorkflows: WorkflowDef[], events: EventEnvelope[]): MemoryContext;
```

**Semantics (load-bearing):** events passed in are folded **without evaluation** — they are the already-accepted past. Only a candidate event goes through `evaluateEvent`, against the context this builder returns. `getChildrenStates` returns **direct** children only. `ticket-type.defined` folds last-definition-wins (types are events; a later definition replaces the earlier one — this is what makes rank re-definition, and therefore the cycle defect, reachable).

**And `workflow.defined` re-folds the tickets already on that workflow** (design decision 10). The server's `proj_tickets` refreshes on publish; if this context did not, a fixture that publishes a re-categorising v2 after some transitions would get one verdict from the shared suite and a different one from the server — `getChildrenStates` would hand the parent-terminal invariant stale categories in one and folded ones in the other. That is precisely the disagreement the shared fixture suite exists to make impossible, so the fold happens here too, through the same domain function. `getWorkflowDef` also honours its `version` argument now that the versions are retained: the engine's forward walk asks for intermediates by exact version, and answering "latest" to every such question is a silent wrong answer.

- [ ] **Step 1: Write the failing test**

```ts
// packages/rule-engine/src/memory-context.test.ts
import { describe, expect, it } from 'vitest';
import type { TicketTypeDef, WorkflowDef } from '@gisik-nokma/domain';
import { makeEnvelope } from '@gisik-nokma/domain';
import { buildMemoryContext } from './memory-context';

const PROJECT = '01J9GPRJ000000000000000000';
const PARENT = '01J9GPAR000000000000000000';
const CHILD = '01J9GCHA000000000000000000';
const GRANDCHILD = '01J9GCHB000000000000000000';

const WF: WorkflowDef = {
  id: 'wf-basic', version: 1, name: 'Basic', initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'todo', rules: [] },
    { from: '*', to: 'doing', rules: [] },
    { from: '*', to: 'done', rules: [] },
  ],
};

function typeDefined(def: TicketTypeDef) {
  return makeEnvelope({ type: 'ticket-type.defined', entity: { kind: 'ticket-type', id: def.id }, payload: def });
}
function created(id: string, typeId: string, parentId: string | null) {
  return makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id },
    payload: { typeId, projectId: PROJECT, parentId, title: `t-${id.slice(0, 8)}` } });
}

const EPIC: TicketTypeDef = { id: 'epic', name: 'Epic', icon: 'flag', rank: 1, workflowId: 'wf-basic', fields: [] };
const STORY: TicketTypeDef = { id: 'story', name: 'Story', icon: 'book', rank: 2, workflowId: 'wf-basic', fields: [] };
const TASK: TicketTypeDef = { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-basic', fields: [] };

describe('buildMemoryContext', () => {
  it('folds prior events into ticket states reachable via getEntityState', async () => {
    const ctx = buildMemoryContext([WF], [
      typeDefined(TASK),
      created(CHILD, 'task', null),
      makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: CHILD }, payload: { toStateId: 'doing' } }),
    ]);
    const state = (await ctx.getEntityState('ticket', CHILD)) as { stateId: string; stateCategory: string };
    expect(state.stateId).toBe('doing');
    expect(state.stateCategory).toBe('active');
  });

  it('getChildrenStates returns DIRECT children only — a grandchild is not a child', async () => {
    const ctx = buildMemoryContext([WF], [
      typeDefined(EPIC), typeDefined(STORY), typeDefined(TASK),
      created(PARENT, 'epic', null),
      created(CHILD, 'story', PARENT),
      created(GRANDCHILD, 'task', CHILD),
    ]);
    const children = await ctx.getChildrenStates(PARENT);
    expect(children.map((c) => c.id)).toEqual([CHILD]);
  });

  it('resolves ticket types and workflows, last definition wins', async () => {
    const ctx = buildMemoryContext([WF], [
      typeDefined({ ...TASK, rank: 3 }),
      typeDefined({ ...TASK, rank: 5 }),
    ]);
    const def = (await ctx.getEntityState('ticket-type', 'task')) as { rank: number };
    expect(def.rank).toBe(5);
    expect(await ctx.getWorkflowDef('wf-basic')).toEqual(WF);
    expect(await ctx.getWorkflowDef('wf-ghost')).toBeNull();
  });

  it('folds workflow.defined events from priorEvents alongside seeds', async () => {
    const wf2: WorkflowDef = { ...WF, id: 'wf-two' };
    const ctx = buildMemoryContext([WF], [
      makeEnvelope({ type: 'workflow.defined', entity: { kind: 'workflow', id: 'wf-two' }, payload: wf2 }),
    ]);
    expect(await ctx.getWorkflowDef('wf-two')).toEqual(wf2);
  });

  it('a re-categorising v2 refreshes the tickets already sitting in that state — the fixture suite sees what the server sees', async () => {
    const wfV2: WorkflowDef = {
      ...WF,
      version: 2,
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'doing', name: 'Doing', category: 'terminal' }, // was 'active'
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
    };
    const ctx = buildMemoryContext([WF], [
      typeDefined(TASK),
      created(CHILD, 'task', null),
      makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: CHILD }, payload: { toStateId: 'doing' } }),
      makeEnvelope({ type: 'workflow.defined', entity: { kind: 'workflow', id: 'wf-basic' }, payload: wfV2 }),
    ]);
    const state = (await ctx.getEntityState('ticket', CHILD)) as {
      stateId: string; stateCategory: string; workflowVersion: number;
    };
    expect(state).toMatchObject({ stateId: 'doing', stateCategory: 'terminal', workflowVersion: 2 });
  });

  it('getWorkflowDef answers an explicit version with that version, not the latest', async () => {
    const wfV2: WorkflowDef = { ...WF, version: 2, name: 'Basic v2' };
    const ctx = buildMemoryContext([WF], [
      makeEnvelope({ type: 'workflow.defined', entity: { kind: 'workflow', id: 'wf-basic' }, payload: wfV2 }),
    ]);
    expect((await ctx.getWorkflowDef('wf-basic'))?.version).toBe(2);
    expect((await ctx.getWorkflowDef('wf-basic', 1))?.name).toBe('Basic');
    expect(await ctx.getWorkflowDef('wf-basic', 7)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/memory-context.test.ts`
Expected: FAIL — cannot find module `./memory-context`.

- [ ] **Step 3: Implement the builder**

```ts
// packages/rule-engine/src/memory-context.ts
import type { EventEnvelope, TicketState, TicketStateDeps, TicketTypeDef, WorkflowDef } from '@gisik-nokma/domain';
import {
  TICKET_EVENT_TYPES, applyTicketEvent, foldTicketToWorkflowVersion, ticketTypeDefSchema,
} from '@gisik-nokma/domain';
import type { EngineContext } from './engine-context';

export type MemoryContext = EngineContext & {
  tickets: Map<string, TicketState>;
  ticketTypes: Map<string, TicketTypeDef>;
  workflows: Map<string, WorkflowDef>;
  workflowVersions: Map<string, WorkflowDef[]>;
};

/**
 * Folds already-accepted events into an in-memory EngineContext. No
 * evaluation happens here: these events are the past. Only a candidate event
 * is evaluated, by the caller, against the context this returns.
 */
export function buildMemoryContext(seedWorkflows: WorkflowDef[], events: EventEnvelope[]): MemoryContext {
  const workflows = new Map<string, WorkflowDef>(seedWorkflows.map((wf) => [wf.id, wf]));
  const workflowVersions = new Map<string, WorkflowDef[]>(seedWorkflows.map((wf) => [wf.id, [wf]]));
  const ticketTypes = new Map<string, TicketTypeDef>();
  const tickets = new Map<string, TicketState>();

  const deps: TicketStateDeps = {
    getTicketType: (id) => ticketTypes.get(id),
    getWorkflow: (id) => workflows.get(id),
  };

  function versionOf(workflowId: string, version: number): WorkflowDef | undefined {
    return workflowVersions.get(workflowId)?.find((def) => def.version === version);
  }

  for (const env of events) {
    if (env.type === 'workflow.defined') {
      const def = env.payload as WorkflowDef;
      workflows.set(def.id, def);
      const seen = workflowVersions.get(def.id) ?? [];
      workflowVersions.set(def.id, [...seen.filter((d) => d.version !== def.version), def]
        .sort((a, b) => a.version - b.version));
      // Refresh on publish (design decision 10): the server's proj_tickets
      // folds its rows here, so this context must too, or the shared fixture
      // suite and the server would disagree about a ticket's category the
      // moment a version re-categorises a state.
      for (const [id, ticket] of tickets) {
        if (ticket.workflowId !== def.id) continue;
        tickets.set(id, foldTicketToWorkflowVersion(ticket, def, (v) => versionOf(def.id, v)));
      }
    } else if (env.type === 'ticket-type.defined') {
      const def = ticketTypeDefSchema.parse(env.payload);
      ticketTypes.set(def.id, def); // last definition wins — types are events
    } else if ((TICKET_EVENT_TYPES as readonly string[]).includes(env.type)) {
      tickets.set(env.entity.id, applyTicketEvent(tickets.get(env.entity.id), env, deps));
    }
    // Other event kinds (membership, visibility, …) belong to other plans and
    // do not shape ticket state.
  }

  return {
    tickets,
    ticketTypes,
    workflows,
    workflowVersions,
    getEntityState: async (kind, id) => {
      if (kind === 'ticket') return tickets.get(id) ?? null;
      if (kind === 'ticket-type') return ticketTypes.get(id) ?? null;
      return null;
    },
    getChildrenStates: async (ticketId) =>
      [...tickets.values()].filter((t) => t.parentId === ticketId),
    // An explicit version is answered with THAT version. The engine's forward
    // walk fetches intermediates by exact version; answering "latest" to every
    // such question is a wrong answer that looks like an answer.
    getWorkflowDef: async (workflowId, version) =>
      (version === undefined ? workflows.get(workflowId) : versionOf(workflowId, version)) ?? null,
  };
}
```

Export it — add to `packages/rule-engine/src/index.ts`:

```ts
export { buildMemoryContext, type MemoryContext } from './memory-context';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/memory-context.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/rule-engine/src/memory-context.ts packages/rule-engine/src/memory-context.test.ts packages/rule-engine/src/index.ts
git commit -m "An in-memory EngineContext built by the same reducer the server uses — the fixture suite now sees tickets exactly as production does, direct children only, last type definition winning

It also keeps every workflow version rather than only the latest, so an explicit version argument gets that version instead of a confident wrong answer, and a published version re-folds the tickets standing in its states through the same domain function the server projection uses. Without that fold the shared suite and the server would answer getChildrenStates differently the first time a version re-categorised a state — the one disagreement this suite exists to make impossible."
```

