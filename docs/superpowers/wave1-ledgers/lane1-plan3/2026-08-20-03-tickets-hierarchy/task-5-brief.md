### Task 5: Hierarchy checks for ticket.created — rank, the deepest-rank parent rule, cross-project, and the forced preconditions

**Files:**
- Create: `packages/rule-engine/src/checks/refusals.ts`
- Create: `packages/rule-engine/src/checks/context-helpers.ts`
- Create: `packages/rule-engine/src/checks/test-support.ts`
- Create: `packages/rule-engine/src/checks/hierarchy.ts`
- Test: `packages/rule-engine/src/checks/hierarchy.test.ts`
- Modify: `packages/rule-engine/src/evaluate.ts` (add the `ticket.created` case to the dispatch)

**Interfaces:**
- Consumes: `EngineContext`, `EngineVerdict`, `evaluateEvent` dispatch (Plan 2); `buildMemoryContext` (Task 4); `ticketCreatedPayload`, `TicketState`, `TicketTypeDef`, `SUB_TASK_TYPE_ID`, `DEEPEST_RANK`, `makeEnvelope` (`@gisik-nokma/domain`).
- Produces:
  - `checkTicketCreated(env: EventEnvelope, ctx: EngineContext): Promise<EngineVerdict>`
  - `REFUSALS` (const map of the fixed reason strings), `rankRefusal(childTypeName, parentTypeName): string`, `deepestRankParentRefusal(typeName): string`, `parentTerminalRefusal(parentTitle, stateName, move: 'add' | 'move'): string`, `fieldKindRefusal(fieldName, needsPhrase): string`, `refuse(rule, reason): EngineVerdict`, `ACCEPT: EngineVerdict`
  - `getTicketState(ctx, id): Promise<TicketState | null>`, `getTicketTypeDef(ctx, id): Promise<TicketTypeDef | null>` (typed wrappers over `ctx.getEntityState`)
  - test-support builders shared by Tasks 6–7: `WS`, `PROJECT`, `PROJECT_B`, `WF`, `EPIC`, `STORY`, `TASK`, `SUBTASK`, `typeDefined(def)`, `created(id, typeId, parentId, projectId?)`

- [ ] **Step 1: Write the shared test-support module** (infrastructure the failing tests import; no behavior of its own)

```ts
// packages/rule-engine/src/checks/test-support.ts
import type { EventEnvelope, TicketTypeDef, WorkflowDef } from '@gisik-nokma/domain';
import { makeEnvelope } from '@gisik-nokma/domain';

export const WS = '01J9GWS0000000000000000000';
export const PROJECT = '01J9GPRJ000000000000000000';
export const PROJECT_B = '01J9GPRB000000000000000000';

export const WF: WorkflowDef = {
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

export const EPIC: TicketTypeDef = { id: 'epic', name: 'Epic', icon: 'flag', rank: 1, workflowId: 'wf-basic', fields: [] };
export const STORY: TicketTypeDef = { id: 'story', name: 'Story', icon: 'book', rank: 2, workflowId: 'wf-basic', fields: [] };
export const TASK: TicketTypeDef = { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-basic', fields: [] };
export const SUBTASK: TicketTypeDef = { id: 'sub-task', name: 'Sub-task', icon: 'list', rank: 4, workflowId: 'wf-basic', fields: [] };

export function typeDefined(def: TicketTypeDef): EventEnvelope {
  return makeEnvelope({ type: 'ticket-type.defined', entity: { kind: 'ticket-type', id: def.id }, payload: def, workspaceId: WS });
}

export function created(id: string, typeId: string, parentId: string | null, projectId: string = PROJECT): EventEnvelope {
  return makeEnvelope({
    type: 'ticket.created', entity: { kind: 'ticket', id }, workspaceId: WS,
    payload: { typeId, projectId, parentId, title: `ticket ${id.slice(4, 8)}` },
  });
}
```

- [ ] **Step 2: Write the failing tests — every refusal is a planted defect with an exact literal reason**

```ts
// packages/rule-engine/src/checks/hierarchy.test.ts
import { describe, expect, it } from 'vitest';
import { buildMemoryContext } from '../memory-context';
import { checkTicketCreated } from './hierarchy';
import { EPIC, PROJECT, PROJECT_B, STORY, SUBTASK, TASK, WF, created, typeDefined } from './test-support';

const PARENT = '01J9GPAR000000000000000000';
const NEW = '01J9GNEW000000000000000000';
const GHOST = '01J9GGHT000000000000000000';

const baseCtx = () =>
  buildMemoryContext([WF], [
    typeDefined(EPIC), typeDefined(STORY), typeDefined(TASK), typeDefined(SUBTASK),
    created(PARENT, 'story', null),
  ]);

describe('checkTicketCreated', () => {
  it('accepts a task under a story, and a task at project root', async () => {
    expect(await checkTicketCreated(created(NEW, 'task', PARENT), baseCtx())).toEqual({ refused: false });
    expect(await checkTicketCreated(created(NEW, 'task', null), baseCtx())).toEqual({ refused: false });
  });

  it('planted defect: an epic under a story — rank must exceed the parent rank', async () => {
    expect(await checkTicketCreated(created(NEW, 'epic', PARENT), baseCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.rank',
      reason: '"Epic" cannot go under "Story": a ticket\'s parent must be a bigger kind of work.',
    });
  });

  it('planted defect: equal rank cannot nest either', async () => {
    const ctx = buildMemoryContext([WF], [typeDefined(STORY), created(PARENT, 'story', null)]);
    expect(await checkTicketCreated(created(NEW, 'story', PARENT), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.rank',
      reason: '"Story" cannot go under "Story": a ticket\'s parent must be a bigger kind of work.',
    });
  });

  it('planted defect: a sub-task without a parent — the deepest rank always belongs to something', async () => {
    expect(await checkTicketCreated(created(NEW, 'sub-task', null), baseCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.deepest-rank-parent-required',
      reason: '"Sub-task" is the smallest kind of work, so it always belongs to a parent ticket. Pick the ticket this one is part of.',
    });
  });

  it('planted defect: a parent from another project', async () => {
    const ctx = buildMemoryContext([WF], [
      typeDefined(STORY), typeDefined(TASK),
      created(PARENT, 'story', null, PROJECT_B),
    ]);
    expect(await checkTicketCreated(created(NEW, 'task', PARENT, PROJECT), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.cross-project',
      reason: 'The parent is in a different project. Pick a parent from the same project.',
    });
  });

  it('planted defect: a parent that does not exist', async () => {
    expect(await checkTicketCreated(created(NEW, 'task', GHOST), baseCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.unknown-parent',
      reason: 'The chosen parent ticket does not exist in this workspace.',
    });
  });

  it('planted defect: a type nobody defined', async () => {
    expect(await checkTicketCreated(created(NEW, 'ghost-type', PARENT), baseCtx())).toEqual({
      refused: true,
      rule: 'ticket.unknown-type',
      reason: "This ticket's type is not defined in this workspace.",
    });
  });

  it('planted defect: a type whose workflow is not defined — the ledger accepts only what it can replay', async () => {
    const ctx = buildMemoryContext([], [typeDefined(TASK)]); // no workflow seeded
    expect(await checkTicketCreated(created(NEW, 'task', null), ctx)).toEqual({
      refused: true,
      rule: 'ticket.workflow-undefined',
      reason: "This ticket type's workflow has not been defined yet, so the ticket would have no status.",
    });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/hierarchy.test.ts`
Expected: FAIL — cannot find module `./hierarchy`.

- [ ] **Step 4: Implement the refusal vocabulary and context helpers**

```ts
// packages/rule-engine/src/checks/refusals.ts
import type { EngineVerdict } from '../evaluate';

/**
 * The exact plain-language refusal reasons — a deliverable of Plan 3.
 * Tests and fixtures assert the LITERAL strings, never these constants,
 * so a typo here cannot certify itself.
 */
export const REFUSALS = {
  'ticket.unknown-type': "This ticket's type is not defined in this workspace.",
  'ticket.unknown': 'This ticket does not exist in this workspace.',
  'ticket.workflow-undefined':
    "This ticket type's workflow has not been defined yet, so the ticket would have no status.",
  'hierarchy.unknown-parent': 'The chosen parent ticket does not exist in this workspace.',
  'hierarchy.cross-project': 'The parent is in a different project. Pick a parent from the same project.',
  'hierarchy.cycle':
    'This move would put the ticket inside one of its own sub-items, making a loop. A ticket cannot contain itself.',
  'field.unknown': "This ticket's type has no such field. Add the field to the ticket type first.",
  'field.title-required': 'A ticket always has a title. Change the title instead of clearing it.',
} as const;

export function rankRefusal(childTypeName: string, parentTypeName: string): string {
  return `"${childTypeName}" cannot go under "${parentTypeName}": a ticket's parent must be a bigger kind of work.`;
}

/**
 * Owner decision (2026-08-20, coordination doc sign-off table): a ticket whose
 * type sits at the deepest rank always belongs to a parent. The reason names
 * the TYPE rather than saying "sub-task", because the built-in sub-task is only
 * the most common type this bites — any custom type at the same rank raises it.
 */
export function deepestRankParentRefusal(typeName: string): string {
  return `"${typeName}" is the smallest kind of work, so it always belongs to a parent ticket. Pick the ticket this one is part of.`;
}

export function fieldKindRefusal(fieldName: string, needsPhrase: string): string {
  return `"${fieldName}" needs ${needsPhrase}.`;
}

export function refuse(rule: keyof typeof REFUSALS): EngineVerdict;
export function refuse(rule: string, reason: string): EngineVerdict;
export function refuse(rule: string, reason?: string): EngineVerdict {
  return { refused: true, rule, reason: reason ?? REFUSALS[rule as keyof typeof REFUSALS] };
}

export const ACCEPT: EngineVerdict = { refused: false };
```

```ts
// packages/rule-engine/src/checks/context-helpers.ts
import type { TicketState, TicketTypeDef } from '@gisik-nokma/domain';
import type { EngineContext } from '../engine-context';

export async function getTicketState(ctx: EngineContext, id: string): Promise<TicketState | null> {
  return (await ctx.getEntityState('ticket', id)) as TicketState | null;
}

export async function getTicketTypeDef(ctx: EngineContext, id: string): Promise<TicketTypeDef | null> {
  return (await ctx.getEntityState('ticket-type', id)) as TicketTypeDef | null;
}
```

- [ ] **Step 5: Implement checkTicketCreated**

```ts
// packages/rule-engine/src/checks/hierarchy.ts
import type { EventEnvelope } from '@gisik-nokma/domain';
import { SUB_TASK_TYPE_ID, ticketCreatedPayload } from '@gisik-nokma/domain';
import type { EngineContext } from '../engine-context';
import type { EngineVerdict } from '../evaluate';
import { getTicketState, getTicketTypeDef } from './context-helpers';
import { ACCEPT, deepestRankParentRefusal, rankRefusal, refuse } from './refusals';

/**
 * Hierarchy sanity for ticket.created. Check order is deliberate — the most
 * fundamental truth names the refusal: unknown type → workflow undefined →
 * (root: deepest-rank rule) → unknown parent → cross-project → rank →
 * parent-terminal (Step 7c — the remediable contradiction comes last).
 */
export async function checkTicketCreated(env: EventEnvelope, ctx: EngineContext): Promise<EngineVerdict> {
  const p = ticketCreatedPayload.parse(env.payload);

  const type = await getTicketTypeDef(ctx, p.typeId);
  if (!type) return refuse('ticket.unknown-type');

  const workflow = await ctx.getWorkflowDef(type.workflowId);
  if (!workflow) return refuse('ticket.workflow-undefined');

  if (p.parentId === null) {
    // First pass keys off the built-in seed id; Step 7e generalises it to the
    // rank (owner decision 2026-08-20). The rule id and the reason are already
    // the final ones, so no test written here has to churn twice.
    if (type.id === SUB_TASK_TYPE_ID) {
      return refuse('hierarchy.deepest-rank-parent-required', deepestRankParentRefusal(type.name));
    }
    return ACCEPT;
  }

  const parent = await getTicketState(ctx, p.parentId);
  if (!parent) return refuse('hierarchy.unknown-parent');
  if (parent.projectId !== p.projectId) return refuse('hierarchy.cross-project');

  const parentType = await getTicketTypeDef(ctx, parent.typeId);
  if (!parentType) return refuse('ticket.unknown-type');
  if (type.rank <= parentType.rank) {
    return refuse('hierarchy.rank', rankRefusal(type.name, parentType.name));
  }

  return ACCEPT;
}
```

- [ ] **Step 6: Wire the check into the engine dispatch**

In `packages/rule-engine/src/evaluate.ts`, add to the imports and the `switch (env.type)` Plan 2 established:

```ts
import { checkTicketCreated } from './checks/hierarchy';

    case 'ticket.created':
      return checkTicketCreated(env, ctx);
```

- [ ] **Step 7: Run the tests to verify they pass, then the whole rule-engine suite**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/hierarchy.test.ts`
Expected: PASS (8 tests).
Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run`
Expected: PASS — Plan 2's fixtures and tests stay green (its fixtures contain no `ticket.created` candidates; if one now fails, the fixture was relying on unrouted-type acceptance and must gain legal type/parent prior events, which is this check working as designed).

- [ ] **Step 7b: Write the failing terminal-parent test (owner decision 2026-08-20)**

Extend the imports in `packages/rule-engine/src/checks/hierarchy.test.ts` with:

```ts
import { makeEnvelope } from '@gisik-nokma/domain';
```

and append inside the `checkTicketCreated` describe block:

```ts
  it('planted defect: creating live work under a finished parent — the remedy named is the reopen', async () => {
    const ctx = buildMemoryContext([WF], [
      typeDefined(STORY), typeDefined(TASK),
      makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id: PARENT },
        payload: { typeId: 'story', projectId: PROJECT, parentId: null, title: 'Quarterly filings' } }),
      makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: PARENT },
        payload: { toStateId: 'done' } }),
    ]);
    expect(await checkTicketCreated(created(NEW, 'task', PARENT), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.parent-terminal',
      reason: '"Quarterly filings" is finished (Done). Adding live work reopens it — choose a state to reopen it to, then add this ticket.',
    });
  });
```

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/hierarchy.test.ts`
Expected: FAIL — the created ticket is accepted (`{ refused: false }`) because the check does not exist yet.

- [ ] **Step 7c: Implement the terminal-parent refusal**

Append to `packages/rule-engine/src/checks/refusals.ts`:

```ts
/**
 * Owner decision (2026-08-20, coordination doc): live work arriving under a
 * finished parent refuses toward the offered reopen — the remedy is in the
 * reason. `move` picks the verb pair: 'add' for ticket.created, 'move' for
 * ticket.reparented.
 */
export function parentTerminalRefusal(parentTitle: string, stateName: string, move: 'add' | 'move'): string {
  const remedy =
    move === 'add'
      ? 'Adding live work reopens it — choose a state to reopen it to, then add this ticket.'
      : 'Moving live work under it reopens it — choose a state to reopen it to, then move this ticket.';
  return `"${parentTitle}" is finished (${stateName}). ${remedy}`;
}
```

In `packages/rule-engine/src/checks/hierarchy.ts`, extend the `./refusals` import with `parentTerminalRefusal`, and insert into `checkTicketCreated`, after the rank check and immediately before the final `return ACCEPT;`:

```ts
  // Owner decision (2026-08-20): a finished parent refuses new live work; the
  // decision keys off the denormalized stateCategory — the def lookup below
  // only names the state for the reason, so it falls back to raw ids rather
  // than blocking the refusal on a missing definition.
  if (parent.stateCategory === 'terminal') {
    const parentDef = await ctx.getWorkflowDef(parent.workflowId, parent.workflowVersion);
    const stateName = parentDef?.states.find((s) => s.id === parent.stateId)?.name ?? parent.stateId;
    const titleClaim = parent.fields['title']?.value;
    const parentTitle = typeof titleClaim === 'string' ? titleClaim : parent.id;
    return refuse('hierarchy.parent-terminal', parentTerminalRefusal(parentTitle, stateName, 'add'));
  }
```

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/hierarchy.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 7d: Write the failing tests — a CUSTOM type at the deepest rank (owner decision 2026-08-20)**

The owner overruled the "built-in `sub-task` only" reading: the parent requirement follows the **rank**, so a workspace that invents a `Checklist item` at rank 4 gets the same refusal, with its own name in the reason — and so does a `Micro step` at rank 7, which is smaller work still and cannot coherently be exempt. The refusals come first, the accepting twin right after — the twin is what stops Step 7e from over-refusing the whole type into uselessness.

Append inside the `checkTicketCreated` describe block in `packages/rule-engine/src/checks/hierarchy.test.ts` (both defs are local to this pair — test-support's shared builders stay the built-in ladder):

```ts
  // Workspace-invented types at and below sub-task's depth. Local to this pair
  // on purpose: the shared builders describe the built-in ladder.
  const CHECKLIST: TicketTypeDef = {
    id: 'checklist-item', name: 'Checklist item', icon: 'list', rank: 4, workflowId: 'wf-basic', fields: [],
  };
  const MICRO_STEP: TicketTypeDef = {
    id: 'micro-step', name: 'Micro step', icon: 'list', rank: 7, workflowId: 'wf-basic', fields: [],
  };
  const checklistCtx = () =>
    buildMemoryContext([WF], [
      typeDefined(STORY), typeDefined(CHECKLIST), typeDefined(MICRO_STEP), created(PARENT, 'story', null),
    ]);

  it('planted defect: a CUSTOM type at the deepest rank, cast at project root — the rule follows the rank, not the id', async () => {
    expect(await checkTicketCreated(created(NEW, 'checklist-item', null), checklistCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.deepest-rank-parent-required',
      reason: '"Checklist item" is the smallest kind of work, so it always belongs to a parent ticket. Pick the ticket this one is part of.',
    });

    // …and nothing slips underneath the floor: rank 7 is smaller work than a
    // sub-task, so exempting it would invert the rule's own justification.
    // This assertion is the standing guard for the `>=` in Step 7e.
    expect(await checkTicketCreated(created(NEW, 'micro-step', null), checklistCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.deepest-rank-parent-required',
      reason: '"Micro step" is the smallest kind of work, so it always belongs to a parent ticket. Pick the ticket this one is part of.',
    });
  });

  it('accepts the same custom deepest-rank type once it names a parent', async () => {
    expect(await checkTicketCreated(created(NEW, 'checklist-item', PARENT), checklistCtx())).toEqual({ refused: false });
  });
```

Extend that file's imports with `import type { TicketTypeDef } from '@gisik-nokma/domain';`.

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/hierarchy.test.ts`
Expected: FAIL on the refusal test — both custom types are accepted at project root (`{ refused: false }`) because Step 5's check still asks whether the id is `sub-task`. The accepting twin already passes; it stands guard against over-refusal once Step 7e lands.

- [ ] **Step 7e: Generalise the check from the built-in id to the rank**

In `packages/rule-engine/src/checks/hierarchy.ts`, replace `SUB_TASK_TYPE_ID` in the `@gisik-nokma/domain` import with `DEEPEST_RANK`, and replace the id test inside `checkTicketCreated`'s `p.parentId === null` branch with:

```ts
    // Owner decision (2026-08-20): the parent requirement follows the RANK, not
    // the built-in id — the built-in sub-task and any custom type an admin
    // defines at that rank or below it all carry it.
    //
    // `>=` rather than `===`: the rule's justification is that the smallest
    // kind of work always belongs to something bigger, so a type DEEPER than
    // sub-task is smaller still and cannot coherently be exempt — `===` would
    // leave an escape hatch where defining rank 5 floats your tickets free.
    //
    // DEEPEST_RANK stays a fixed constant rather than a max computed over the
    // workspace's defined types: a computed max would silently change this
    // refusal's meaning as the type inventory changed, and a refusal that
    // shifts underfoot is exactly what this product refuses to ship. Fixed
    // floor plus `>=` gives both — the meaning never moves, and nothing slips
    // underneath it.
    if (type.rank >= DEEPEST_RANK) {
      return refuse('hierarchy.deepest-rank-parent-required', deepestRankParentRefusal(type.name));
    }
```

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/hierarchy.test.ts`
Expected: PASS (11 tests) — the built-in sub-task case still refuses (it is at rank 4), and both custom-type cases now behave.
Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/rule-engine/src/checks/refusals.ts packages/rule-engine/src/checks/context-helpers.ts packages/rule-engine/src/checks/test-support.ts packages/rule-engine/src/checks/hierarchy.ts packages/rule-engine/src/checks/hierarchy.test.ts packages/rule-engine/src/evaluate.ts
git commit -m "Creation now answers for the hierarchy: rank order, the deepest rank always belongs to a parent — the built-in sub-task and any custom type an admin puts beside it alike — no cross-project grafts, and a finished parent refuses new live work until it reopens, every precondition the checks force refusing in the user's language"
```

