### Task 6: Hierarchy checks for ticket.reparented — cycles named as loops, plus rank and project again

**Files:**
- Modify: `packages/rule-engine/src/checks/hierarchy.ts` (add `checkTicketReparented`)
- Test: `packages/rule-engine/src/checks/reparent.test.ts`
- Modify: `packages/rule-engine/src/evaluate.ts` (add the `ticket.reparented` case)

**Interfaces:**
- Consumes: everything Task 5 produced; `ticketReparentedPayload` (`@gisik-nokma/domain`).
- Produces: `checkTicketReparented(env: EventEnvelope, ctx: EngineContext): Promise<EngineVerdict>`.

**Why the cycle check is load-bearing:** with strict rank ordering a cycle looks unreachable — but `ticket-type.defined` can re-define a type's rank (last definition wins), after which a rank-legal reparent can close a loop. The planted defect below constructs exactly that. Check order: unknown ticket → unknown type → (to root: deepest-rank rule) → self/cycle → cross-project → rank → parent-terminal (Step 5c) — a loop is named as a loop even when rank is also violated.

**On the deepest-rank rule here:** Task 5 Step 7e already generalised it from the built-in id to `type.rank >= DEEPEST_RANK`, so this task's check ships rank-based from the start — a sub-task, a workspace's own rank-4 type, and anything it defines deeper are all refused when cast loose to project root, each named in its own reason.

- [ ] **Step 1: Write the failing tests**

```ts
// packages/rule-engine/src/checks/reparent.test.ts
import { describe, expect, it } from 'vitest';
import { makeEnvelope } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../memory-context';
import { checkTicketReparented } from './hierarchy';
import { EPIC, PROJECT_B, STORY, SUBTASK, TASK, WF, WS, created, typeDefined } from './test-support';

const A = '01J9GTKA000000000000000000';
const B = '01J9GTKB000000000000000000';
const C = '01J9GTKC000000000000000000';
const OTHER = '01J9GPAR000000000000000000';
const GHOST = '01J9GGHT000000000000000000';

function reparent(ticketId: string, newParentId: string | null) {
  return makeEnvelope({ type: 'ticket.reparented', entity: { kind: 'ticket', id: ticketId }, workspaceId: WS, payload: { newParentId } });
}

const chainCtx = () =>
  buildMemoryContext([WF], [
    typeDefined(EPIC), typeDefined(STORY), typeDefined(TASK), typeDefined(SUBTASK),
    created(A, 'epic', null),
    created(B, 'story', A),
    created(C, 'task', B),
  ]);

describe('checkTicketReparented', () => {
  it('accepts pulling a grandchild up to its grandparent', async () => {
    expect(await checkTicketReparented(reparent(C, A), chainCtx())).toEqual({ refused: false });
  });

  it('accepts moving a ticket above the deepest rank to project root', async () => {
    expect(await checkTicketReparented(reparent(C, null), chainCtx())).toEqual({ refused: false });
  });

  it('planted defect: a ticket as its own parent', async () => {
    expect(await checkTicketReparented(reparent(A, A), chainCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.cycle',
      reason: 'This move would put the ticket inside one of its own sub-items, making a loop. A ticket cannot contain itself.',
    });
  });

  it('planted defect: reparenting under a descendant after a rank re-definition made it rank-legal', async () => {
    const phase = { id: 'phase', name: 'Phase', icon: 'flag', rank: 1, workflowId: 'wf-basic', fields: [] };
    const step = { id: 'step', name: 'Step', icon: 'check', rank: 2, workflowId: 'wf-basic', fields: [] };
    const ctx = buildMemoryContext([WF], [
      typeDefined(phase), typeDefined(step),
      created(A, 'phase', null),
      created(B, 'step', A),
      typeDefined({ ...phase, rank: 3 }), // ranks moved under us — rank alone now allows A under B
    ]);
    expect(await checkTicketReparented(reparent(A, B), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.cycle',
      reason: 'This move would put the ticket inside one of its own sub-items, making a loop. A ticket cannot contain itself.',
    });
  });

  it('planted defect: reparenting into another project', async () => {
    const ctx = buildMemoryContext([WF], [
      typeDefined(STORY), typeDefined(TASK),
      created(OTHER, 'story', null, PROJECT_B),
      created(C, 'task', null),
    ]);
    expect(await checkTicketReparented(reparent(C, OTHER), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.cross-project',
      reason: 'The parent is in a different project. Pick a parent from the same project.',
    });
  });

  it('planted defect: a story moved under a task — rank violated on reparent too', async () => {
    expect(await checkTicketReparented(reparent(B, C), chainCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.rank',
      reason: '"Story" cannot go under "Task": a ticket\'s parent must be a bigger kind of work.',
    });
  });

  it('planted defect: a sub-task cast loose to project root', async () => {
    const ctx = buildMemoryContext([WF], [
      typeDefined(TASK), typeDefined(SUBTASK),
      created(A, 'task', null),
      created(B, 'sub-task', A),
    ]);
    expect(await checkTicketReparented(reparent(B, null), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.deepest-rank-parent-required',
      reason: '"Sub-task" is the smallest kind of work, so it always belongs to a parent ticket. Pick the ticket this one is part of.',
    });
  });

  it('planted defect: reparenting a ticket that does not exist / onto a parent that does not exist', async () => {
    expect(await checkTicketReparented(reparent(GHOST, A), chainCtx())).toEqual({
      refused: true,
      rule: 'ticket.unknown',
      reason: 'This ticket does not exist in this workspace.',
    });
    expect(await checkTicketReparented(reparent(C, GHOST), chainCtx())).toEqual({
      refused: true,
      rule: 'hierarchy.unknown-parent',
      reason: 'The chosen parent ticket does not exist in this workspace.',
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/reparent.test.ts`
Expected: FAIL — `checkTicketReparented` is not exported.

- [ ] **Step 3: Implement checkTicketReparented**

Append to `packages/rule-engine/src/checks/hierarchy.ts` (extend the import from `@gisik-nokma/domain` with `ticketReparentedPayload` and `TicketState`):

```ts
/** Walking more ancestors than this means the ledger itself is broken. */
const MAX_ANCESTOR_HOPS = 1000;

export async function checkTicketReparented(env: EventEnvelope, ctx: EngineContext): Promise<EngineVerdict> {
  const p = ticketReparentedPayload.parse(env.payload);

  const ticket = await getTicketState(ctx, env.entity.id);
  if (!ticket) return refuse('ticket.unknown');

  const type = await getTicketTypeDef(ctx, ticket.typeId);
  if (!type) return refuse('ticket.unknown-type');

  if (p.newParentId === null) {
    // Same rank rule as creation (Task 5 Step 7e): the floor of the hierarchy
    // always belongs to a parent — whichever type sits at it, or beneath it.
    if (type.rank >= DEEPEST_RANK) {
      return refuse('hierarchy.deepest-rank-parent-required', deepestRankParentRefusal(type.name));
    }
    return ACCEPT;
  }

  if (p.newParentId === ticket.id) return refuse('hierarchy.cycle');

  const newParent = await getTicketState(ctx, p.newParentId);
  if (!newParent) return refuse('hierarchy.unknown-parent');

  // Cycle: is the ticket an ancestor of its proposed parent?
  let cursor: TicketState | null = newParent;
  let hops = 0;
  while (cursor !== null) {
    if (cursor.id === ticket.id) return refuse('hierarchy.cycle');
    if (++hops > MAX_ANCESTOR_HOPS) {
      throw new Error(`checkTicketReparented: ancestor chain of ${p.newParentId} exceeds ${MAX_ANCESTOR_HOPS} — ledger integrity is broken`);
    }
    cursor = cursor.parentId === null ? null : await getTicketState(ctx, cursor.parentId);
  }

  if (newParent.projectId !== ticket.projectId) return refuse('hierarchy.cross-project');

  const parentType = await getTicketTypeDef(ctx, newParent.typeId);
  if (!parentType) return refuse('ticket.unknown-type');
  if (type.rank <= parentType.rank) {
    return refuse('hierarchy.rank', rankRefusal(type.name, parentType.name));
  }

  return ACCEPT;
}
```

- [ ] **Step 4: Wire into the dispatch**

In `packages/rule-engine/src/evaluate.ts`, extend the hierarchy import and the switch:

```ts
import { checkTicketCreated, checkTicketReparented } from './checks/hierarchy';

    case 'ticket.reparented':
      return checkTicketReparented(env, ctx);
```

- [ ] **Step 4b: The migration check — `ticket.workflow_rebound`**

A ticket pins the workflow it was created under (owner decision 2026-08-26, coordination doc); re-pointing its *type* changes only what new tickets get, and this event is the deliberate, attributed act that moves an existing one. Its own file, because a workflow migration is not hierarchy.

**The same-workflow refusal is the load-bearing one, and it is not a tidiness rule.** This event sets `stateId` directly. It performs no transition-legality check and evaluates no transition rules, because across two unrelated graphs there is no transition to check — the ticket is being placed, not moved. Permit that within a single workflow and it becomes a universal bypass: any actor who can emit it could reach any state without satisfying `restrict-to`, `require-comment`, `require-evidence`, `require-field` or `require-different-user`, and without the move ever appearing in the transition log that four-eyes reads. Moving inside one workflow already has a mechanism that honours all of those, so there is no case to weigh — refuse it.

Create `packages/rule-engine/src/checks/workflow-rebind.ts`:

```ts
import { ticketWorkflowReboundPayload } from '@gisik-nokma/domain';
import type { EngineContext, EngineVerdict } from '../types';
import { ACCEPT, getTicketState, refuse } from './shared';

export async function checkTicketWorkflowRebound(
  env: EventEnvelope,
  ctx: EngineContext,
): Promise<EngineVerdict> {
  const p = ticketWorkflowReboundPayload.parse(env.payload);

  const ticket = await getTicketState(ctx, env.entity.id);
  if (!ticket) return refuse('ticket.unknown');

  // Not a tidiness rule — see above. Within one workflow this event would be a
  // way to reach any state without satisfying any of the transition's rules,
  // and without leaving the log entry four-eyes reads.
  if (p.toWorkflowId === ticket.workflowId) {
    return refuse(
      'ticket.rebound-same-workflow',
      `Ticket ${ticket.id} is already on this workflow. Moving within a workflow is a transition, so that it can be checked against the workflow's own rules.`,
    );
  }

  const target = await ctx.getWorkflowDef(p.toWorkflowId);
  if (!target) return refuse('ticket.workflow-undefined');

  if (!target.states.some((state) => state.id === p.toStateId)) {
    return refuse(
      'ticket.rebound-unknown-state',
      `The workflow "${target.name}" has no state "${p.toStateId}", so ticket ${ticket.id} cannot be placed there.`,
    );
  }

  return ACCEPT;
}
```

and extend the dispatch:

```ts
import { checkTicketWorkflowRebound } from './checks/workflow-rebind';

    case 'ticket.workflow_rebound':
      return checkTicketWorkflowRebound(env, ctx);
```

**Who may emit it** is Plan 4's to enforce, alongside its other pre-engine permission gates: migration re-homes work that other people are doing, so it belongs with the admin-gated actions rather than with ordinary ticket edits. Recorded here so the ownership is explicit rather than assumed.

- [ ] **Step 4c: The built-in rank lock, enforced where locks are real — `ticket-type.defined`**

Added at Plan 8's walk (2026-08-27), closing the half of its Open question 6 that stayed open: the builder locks the built-in types' ranks **in the UI**, and the server's last-definition-wins accepted a re-rank anyway — a lock the server does not hold is a description of a rule, not a rule. The stakes are concrete: `DEEPEST_RANK` is the constant 4 *because* it is the built-in sub-task's rank; re-rank `sub-task` to 3 and every sub-task escapes the parent requirement while the builder still displays the lock. The board describing a rule the server does not enforce is the exact dishonesty class this product exists to remove.

Create `packages/rule-engine/src/checks/ticket-type.ts`:

```ts
import { BUILTIN_TICKET_TYPE_SEEDS, ticketTypeDefSchema } from '@gisik-nokma/domain';
import type { EngineContext, EngineVerdict } from '../types';
import { ACCEPT, refuse } from './shared';

export async function checkTicketTypeDefined(
  env: EventEnvelope,
  _ctx: EngineContext,
): Promise<EngineVerdict> {
  const def = ticketTypeDefSchema.parse(env.payload);
  const seed = BUILTIN_TICKET_TYPE_SEEDS.find((builtin) => builtin.id === def.id);
  // Name, icon and workflow binding of a built-in are an admin's to change
  // (Plan 8 decision 7); the RANK is the ladder itself. Custom types may
  // re-rank — the cycle check is load-bearing for exactly that case (design
  // decision 6) — but the four built-ins are the fixed points the ladder
  // hangs on, DEEPEST_RANK above all.
  if (seed !== undefined && def.rank !== seed.rank) {
    return refuse(
      'type.builtin-rank',
      `"${def.name}" is the built-in ${seed.id} type; its rank is ${seed.rank} and cannot be changed. Define a custom type for differently-ranked work.`,
    );
  }
  return ACCEPT;
}
```

and extend the dispatch: `case 'ticket-type.defined': return checkTicketTypeDefined(env, ctx);`

Fixture `type-defined-refuses-builtin-rerank.json` plants the sharp case: `sub-task` re-defined at rank 3 is refused `type.builtin-rank` — before this check, that event was accepted and every sub-task quietly escaped `hierarchy.deepest-rank-parent-required`. A companion case proves the lock is only the lock: the same `sub-task` re-defined with a new icon and workflow at rank 4 is accepted, and a *custom* type re-ranked is accepted (the cycle check's territory, not this refusal's).

- [ ] **Step 5: Run the tests to verify they pass, then the whole rule-engine suite**

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/reparent.test.ts`
Expected: PASS (8 tests).
Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run`
Expected: PASS.

- [ ] **Step 5b: Write the terminal-parent tests — the refusal and its accepting twin (owner decision 2026-08-20)**

Extend the imports in `packages/rule-engine/src/checks/reparent.test.ts` (`PROJECT` from `./test-support` joins the existing names), then append:

```ts
describe('checkTicketReparented under a terminal parent (owner decision 2026-08-20)', () => {
  const donePriors = [
    typeDefined(STORY), typeDefined(TASK),
    makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id: A }, workspaceId: WS,
      payload: { typeId: 'story', projectId: PROJECT, parentId: null, title: 'Quarterly filings' } }),
    makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: A }, workspaceId: WS,
      payload: { toStateId: 'done' } }),
    created(C, 'task', null),
  ];

  it('planted defect: moving live work under a finished parent — the remedy named is the reopen', async () => {
    const ctx = buildMemoryContext([WF], donePriors);
    expect(await checkTicketReparented(reparent(C, A), ctx)).toEqual({
      refused: true,
      rule: 'hierarchy.parent-terminal',
      reason: '"Quarterly filings" is finished (Done). Moving live work under it reopens it — choose a state to reopen it to, then move this ticket.',
    });
  });

  it('accepts a terminal child moving under a terminal parent — nothing contradicts, nothing reopens', async () => {
    const ctx = buildMemoryContext([WF], [
      ...donePriors,
      makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: C }, workspaceId: WS,
        payload: { toStateId: 'done' } }),
    ]);
    expect(await checkTicketReparented(reparent(C, A), ctx)).toEqual({ refused: false });
  });
});
```

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/reparent.test.ts`
Expected: FAIL on the refusal test (the move is accepted because the check does not exist yet); the accepting twin already passes — it stands guard against over-refusal once Step 5c lands.

- [ ] **Step 5c: Implement the reparent half of the refusal**

In `packages/rule-engine/src/checks/hierarchy.ts` (the `parentTerminalRefusal` helper and the import extension landed in Task 5 Step 7c), insert into `checkTicketReparented`, after the rank check and immediately before the final `return ACCEPT;`:

```ts
  // Owner decision (2026-08-20): only LIVE work under a finished parent
  // contradicts — a terminal child under a terminal parent is legal. Decision
  // keys off denormalized stateCategory; the def lookup only names the state.
  if (newParent.stateCategory === 'terminal' && ticket.stateCategory !== 'terminal') {
    const parentDef = await ctx.getWorkflowDef(newParent.workflowId, newParent.workflowVersion);
    const stateName = parentDef?.states.find((s) => s.id === newParent.stateId)?.name ?? newParent.stateId;
    const titleClaim = newParent.fields['title']?.value;
    const parentTitle = typeof titleClaim === 'string' ? titleClaim : newParent.id;
    return refuse('hierarchy.parent-terminal', parentTerminalRefusal(parentTitle, stateName, 'move'));
  }
```

Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run src/checks/reparent.test.ts`
Expected: PASS (10 tests).
Run: `pnpm --filter @gisik-nokma/rule-engine exec vitest run`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/rule-engine/src/checks/hierarchy.ts packages/rule-engine/src/checks/reparent.test.ts packages/rule-engine/src/evaluate.ts
git commit -m "Reparenting cannot make loops, cross projects, invert rank, cast the deepest rank loose to project root, or slip live work under a finished parent — and the cycle check earns its keep with a planted defect where a rank re-definition made the loop rank-legal"
```

