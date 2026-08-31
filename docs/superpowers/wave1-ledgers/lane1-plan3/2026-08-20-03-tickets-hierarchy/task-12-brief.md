### Task 12: The server EngineContext — ctx.getChildrenStates becomes real

**Files:**
- Create: `apps/server/src/engine-context.ts` (if Plan 1/2 already created this file with `getWorkflowDef` wiring, merge the ticket lookups into it rather than adding a second factory)
- Test: `apps/server/test/engine-context.test.ts`
- Modify: `apps/server/src/ingest.ts` (only if ingest still constructs a stub context — point it at `createEngineContext`)

**Interfaces:**
- Consumes: `getTicketStateFromDb`, `getChildrenStatesFromDb` (Task 10); `getTicketTypeFromDb` (Task 9); `getWorkflowDef` (Plan 2); `EngineContext` (Plan 2). `TicketState` — exactly the merged cross-plan shape (Plan 2's definition, coordination doc §4):

```ts
type TicketState = {
  kind: 'ticket';
  id: string; workspaceId: string; projectId: string; typeId: string;
  parentId: string | null; workflowId: string; workflowVersion: number;
  stateId: string; stateCategory: StateCategory;
  assigneeId: string | null; collaboratorIds: string[];
  fields: Record<string, FieldClaim>;
  transitions: { toStateId: string; actorId: string; seq: number; workflowVersion: number }[];
};
```

- Produces: `createEngineContext(db: Pool, workspaceId: string): EngineContext` — the context ingest passes to `evaluateEvent`; `getEntityState('ticket', id)` returns a `TicketState`, `getEntityState('ticket-type', id)` returns a `TicketTypeDef`, `getChildrenStates` returns DIRECT children.

- [ ] **Step 1: Write the failing test — the parent-terminal invariant now works against Postgres, end to end**

```ts
// apps/server/test/engine-context.test.ts
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { makeEnvelope } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createEngineContext } from '../src/engine-context';
import { applyEvent } from '../src/projections/index';
import { testPool, wipe } from './helpers/db';

const WS = '01J9GWS0000000000000000000';
const PROJECT = '01J9GPRJ000000000000000000';
const PARENT = '01J9GPAR000000000000000000';
const C1 = '01J9GCHA000000000000000000';
const C2 = '01J9GCHB000000000000000000';

const WF_DEFINED = makeEnvelope({
  type: 'workflow.defined', entity: { kind: 'workflow', id: 'wf-basic' }, workspaceId: WS,
  payload: {
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
  },
});

function typeDefined(id: string, rank: number) {
  return makeEnvelope({ type: 'ticket-type.defined', entity: { kind: 'ticket-type', id }, workspaceId: WS,
    payload: { id, name: id[0].toUpperCase() + id.slice(1), icon: 'check', rank, workflowId: 'wf-basic', fields: [] } });
}
function created(id: string, typeId: string, parentId: string | null, title: string) {
  return makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id }, workspaceId: WS,
    payload: { typeId, projectId: PROJECT, parentId, title } });
}
function transitioned(id: string, toStateId: string) {
  return makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id }, workspaceId: WS, payload: { toStateId } });
}

const db: Pool = await testPool();
beforeEach(async () => wipe(db));
afterAll(async () => db.end());

async function seedFamily(): Promise<void> {
  for (const env of [
    WF_DEFINED, typeDefined('story', 2), typeDefined('task', 3),
    created(PARENT, 'story', null, 'Quarterly filings'),
    created(C1, 'task', PARENT, 'File GST'),
    created(C2, 'task', PARENT, 'File TDS'),
    transitioned(C1, 'done'),
  ]) await applyEvent(db, env);
}

describe('createEngineContext', () => {
  it('serves ticket state, type defs, and DIRECT children from the projections', async () => {
    await seedFamily();
    const ctx = createEngineContext(db, WS);
    const parent = (await ctx.getEntityState('ticket', PARENT)) as { stateCategory: string };
    expect(parent.stateCategory).toBe('open');
    const type = (await ctx.getEntityState('ticket-type', 'task')) as { rank: number };
    expect(type.rank).toBe(3);
    const children = await ctx.getChildrenStates(PARENT);
    expect(children.map((c) => [c.id, c.stateCategory]).sort()).toEqual([[C1, 'terminal'], [C2, 'open']]);
    expect(await ctx.getWorkflowDef('wf-basic')).toMatchObject({ id: 'wf-basic', initialStateId: 'todo' });
  });

  it('invariant 3 end to end against Postgres: parent terminal with an open child is refused, accepted once all are done', async () => {
    await seedFamily();
    const ctx = createEngineContext(db, WS);
    const candidate = transitioned(PARENT, 'done');
    const verdict = await evaluateEvent(candidate, ctx);
    expect(verdict).toMatchObject({ refused: true, rule: 'parent-terminal-with-open-children' });
    await applyEvent(db, transitioned(C2, 'done'));
    expect(await evaluateEvent(candidate, ctx)).toEqual({ refused: false });
  });

  it('hierarchy refusals run against Postgres state too', async () => {
    await seedFamily();
    const ctx = createEngineContext(db, WS);
    const epicUnderStory = makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id: '01J9GNEW000000000000000000' }, workspaceId: WS,
      payload: { typeId: 'epic', projectId: PROJECT, parentId: PARENT, title: 'x' } });
    expect(await evaluateEvent(epicUnderStory, ctx)).toMatchObject({ rule: 'ticket.unknown-type' });
    await applyEvent(db, typeDefined('epic', 1));
    expect(await evaluateEvent(epicUnderStory, ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.rank',
      reason: '"Epic" cannot go under "Story": a ticket\'s parent must be a bigger kind of work.',
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter server exec vitest run test/engine-context.test.ts`
Expected: FAIL — cannot find module `../src/engine-context`.

- [ ] **Step 3: Implement the context factory**

```ts
// apps/server/src/engine-context.ts
import type { Pool } from 'pg';
import type { EngineContext } from '@gisik-nokma/rule-engine';
import { getTicketTypeFromDb } from './projections/ticket-types';
import { getChildrenStatesFromDb, getTicketStateFromDb } from './projections/tickets';
import { getWorkflowDef } from './projections/workflows';

/**
 * The server's real EngineContext, bound to one workspace. Ingest builds one
 * per incoming event and hands it to evaluateEvent — the same reads the
 * fixture suite's in-memory context implements, now backed by projections.
 * Entity kinds owned by later plans (workspace, project, membership) resolve
 * to null until those plans land.
 */
export function createEngineContext(db: Pool, workspaceId: string): EngineContext {
  return {
    async getEntityState(kind, id) {
      if (kind === 'ticket') return getTicketStateFromDb(db, workspaceId, id);
      if (kind === 'ticket-type') return getTicketTypeFromDb(db, workspaceId, id);
      return null;
    },
    async getChildrenStates(ticketId) {
      return getChildrenStatesFromDb(db, workspaceId, ticketId);
    },
    async getWorkflowDef(workflowId, version) {
      return getWorkflowDef(db, workspaceId, workflowId, version);
    },
  };
}
```

If `apps/server/src/ingest.ts` still builds a stub context (Plan 1 scaffolding), replace that construction with `createEngineContext(db, env.workspaceId)` so every ingested event is evaluated against real state.

- [ ] **Step 4: Run the test to verify it passes, then the full server suite**

Run: `pnpm --filter server exec vitest run test/engine-context.test.ts`
Expected: PASS (3 tests).
Run: `pnpm --filter server exec vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/engine-context.ts apps/server/test/engine-context.test.ts
git commit -m "The engine's context is now backed by the projections: getChildrenStates is real, and the parent-terminal refusal holds against Postgres exactly as it does in the fixture suite"
```

