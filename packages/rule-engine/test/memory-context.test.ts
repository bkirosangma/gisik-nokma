import { describe, expect, it } from 'vitest';
import type {
  EventEnvelope,
  PublishedWorkflowDef,
  TicketTypeDef,
  WorkflowDef,
} from '@gisik-nokma/domain';
import { makeEnvelope } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../src/memory-context.js';

/**
 * The tenancy every definition lookup is asked inside (controller ruling P14,
 * Task 12). This context READS it nowhere — it is built from one workspace's
 * events — so the value is inert here and the parameter exists only because one
 * signature across the four `EngineContext` implementations is what stops them
 * drifting. P14's fix is pinned where it can fail: `apps/server/test/engine-context.test.ts`.
 */
const SCOPE = { workspaceId: 'ws_1' } as const;


const PROJECT = '01J9GPRJ000000000000000000';
const PARENT = '01J9GPAR000000000000000000';
const PARENT2 = '01J9GPAT000000000000000000';
const CHILD = '01J9GCHA000000000000000000';
const GRANDCHILD = '01J9GCHB000000000000000000';
const OTHER = '01J9GTKA000000000000000000';

const WF: PublishedWorkflowDef = {
  id: 'wf-basic',
  version: 1,
  name: 'Basic',
  initialStateId: 'todo',
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

const EPIC: TicketTypeDef = { id: 'epic', name: 'Epic', icon: 'flag', rank: 1, workflowId: 'wf-basic', fields: [] };
const STORY: TicketTypeDef = { id: 'story', name: 'Story', icon: 'book', rank: 2, workflowId: 'wf-basic', fields: [] };
const TASK: TicketTypeDef = { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-basic', fields: [] };

function typeDefined(def: TicketTypeDef): EventEnvelope {
  return makeEnvelope({ type: 'ticket-type.defined', entity: { kind: 'ticket-type', id: def.id }, payload: def });
}

function created(id: string, typeId: string, parentId: string | null, seq = 1): EventEnvelope {
  return makeEnvelope({
    type: 'ticket.created',
    entity: { kind: 'ticket', id },
    seq,
    payload: { typeId, projectId: PROJECT, parentId, title: `t-${id.slice(0, 8)}` },
  });
}

/**
 * The destination field is `to`, NOT `toStateId` — and a comment is `{ text }`,
 * not a bare string (`packages/domain/src/workflow.ts:137-145`, pre-flight A10 +
 * addendum 1). The transition LOG ENTRY these events produce separately and
 * correctly spells `toStateId`; both spellings are real and neither is a typo
 * for the other.
 *
 * `seq` is varied deliberately. `makeEnvelope` defaults it to 1, so a context
 * that dropped the envelope on the floor and hardcoded 1 would pass every
 * assertion about the log — the defect Task 3's mutation M2 exists to catch.
 */
function transitioned(id: string, to: string, seq: number, actorId?: string): EventEnvelope {
  return makeEnvelope({
    type: 'ticket.transitioned',
    entity: { kind: 'ticket', id },
    seq,
    ...(actorId === undefined ? {} : { actorId }),
    payload: { to },
  });
}

function published(def: PublishedWorkflowDef): EventEnvelope {
  return makeEnvelope({ type: 'workflow.defined', entity: { kind: 'workflow', id: def.id }, payload: def });
}

/**
 * Vitest's `toThrow('…')` is a SUBSTRING match, so a truncated or reworded
 * message certifies itself. Capture and assert the whole message with `toBe`.
 */
function messageOf(run: () => unknown): string {
  try {
    run();
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error('expected the call to throw, and it returned instead');
}

describe('buildMemoryContext', () => {
  it('folds prior events into ticket states reachable via getEntityState', async () => {
    const ctx = buildMemoryContext([WF], [
      typeDefined(TASK),
      created(CHILD, 'task', null),
      transitioned(CHILD, 'doing', 7, '01J9GACT000000000000000001'),
    ]);
    const state = await ctx.getEntityState('ticket', CHILD);
    expect(state).toMatchObject({
      kind: 'ticket',
      id: CHILD,
      projectId: PROJECT,
      typeId: 'task',
      workflowId: 'wf-basic',
      workflowVersion: 1,
      stateId: 'doing',
      stateCategory: 'active',
    });
  });

  it('folds through the shipped reducer — the transition log carries the envelope, not defaults', async () => {
    const ctx = buildMemoryContext([WF], [
      typeDefined(TASK),
      created(CHILD, 'task', null),
      transitioned(CHILD, 'doing', 7, '01J9GACT000000000000000001'),
    ]);
    const state = ctx.tickets.get(CHILD);
    expect(state?.transitions).toEqual([
      {
        toStateId: 'doing',
        actorId: '01J9GACT000000000000000001',
        seq: 7,
        workflowId: 'wf-basic',
        workflowVersion: 1,
      },
    ]);
  });

  it('folds events WITHOUT evaluating them — these are the already-accepted past', async () => {
    // The transition into `doing` carries a require-comment rule and no comment.
    // The engine would refuse this event at the door; a context that evaluated
    // its prior events would drop it. Prior events are history, not candidates:
    // only the candidate goes through evaluateEvent, against what this returns.
    const guarded: PublishedWorkflowDef = {
      ...WF,
      transitions: [
        { from: '*', to: 'todo', rules: [] },
        { from: '*', to: 'doing', rules: [{ kind: 'require-comment' }] },
      ],
    };
    const ctx = buildMemoryContext([guarded], [
      typeDefined(TASK),
      created(CHILD, 'task', null),
      transitioned(CHILD, 'doing', 2),
    ]);
    expect((await ctx.getEntityState('ticket', CHILD)) as { stateId: string }).toMatchObject({
      stateId: 'doing',
    });
  });

  it('getChildrenStates returns DIRECT children only — a grandchild is not a child', async () => {
    const ctx = buildMemoryContext([WF], [
      typeDefined(EPIC),
      typeDefined(STORY),
      typeDefined(TASK),
      created(PARENT, 'epic', null),
      created(CHILD, 'story', PARENT),
      created(GRANDCHILD, 'task', CHILD),
    ]);
    const children = await ctx.getChildrenStates(PARENT);
    expect(children.map((child) => child.id)).toEqual([CHILD]);
  });

  it('getChildrenStates follows a reparent — the whole ticket vocabulary folds, not a subset', async () => {
    const ctx = buildMemoryContext([WF], [
      typeDefined(EPIC),
      typeDefined(STORY),
      created(PARENT, 'epic', null),
      created(PARENT2, 'epic', null),
      created(CHILD, 'story', PARENT),
      makeEnvelope({
        type: 'ticket.reparented',
        entity: { kind: 'ticket', id: CHILD },
        seq: 4,
        payload: { newParentId: PARENT2 },
      }),
    ]);
    expect((await ctx.getChildrenStates(PARENT)).map((child) => child.id)).toEqual([]);
    expect((await ctx.getChildrenStates(PARENT2)).map((child) => child.id)).toEqual([CHILD]);
  });

  it('getEntityState("ticket-type") answers identity ONLY — the definition comes from getTicketTypeDef', async () => {
    // `'ticket-type'` is an OtherEntityState in the domain union — `{ kind, id }`
    // and nothing else — and the server context returns exactly that. This
    // context must not quietly serve something richer through the same door, or
    // a rule that worked here would find `rank` undefined on the server
    // (controller ruling P3, pre-flight BA-4).
    const ctx = buildMemoryContext([WF], [typeDefined(TASK)]);
    expect(await ctx.getEntityState('ticket-type', 'task')).toEqual({ kind: 'ticket-type', id: 'task' });
    expect(await ctx.getEntityState('ticket-type', 'ghost')).toBeNull();
  });

  it('getTicketTypeDef resolves the definition, and the LAST definition wins', async () => {
    // Types are events: a later definition replaces the earlier one. This is
    // what makes rank re-definition — and therefore the hierarchy cycle Task 6
    // guards — reachable at all.
    const ctx = buildMemoryContext([WF], [
      typeDefined({ ...TASK, rank: 3 }),
      typeDefined({ ...TASK, rank: 5 }),
    ]);
    expect(await ctx.getTicketTypeDef(SCOPE, 'task')).toEqual({ ...TASK, rank: 5 });
    expect(await ctx.getTicketTypeDef(SCOPE, 'ghost')).toBeNull();
  });

  it('does not serve memberships — this context is a SECOND context, not a replacement', async () => {
    // The fixture harness keeps `buildInMemoryContext`, which is where
    // memberships live (61 fixtures depend on them). A membership answered null
    // here is the boundary, not an omission: a restrict-to fixture belongs to
    // the harness.
    const ctx = buildMemoryContext([WF], [typeDefined(TASK), created(CHILD, 'task', null)]);
    expect(await ctx.getEntityState('membership', 'ws_1:user-kiro')).toBeNull();
    expect(await ctx.getEntityState('workflow', 'wf-basic')).toBeNull();
  });

  it('resolves seeded workflows: latest by default, null for one never seen', async () => {
    const ctx = buildMemoryContext([WF], []);
    expect(await ctx.getWorkflowDef(SCOPE, 'wf-basic')).toEqual(WF);
    expect(await ctx.getWorkflowDef(SCOPE, 'wf-ghost')).toBeNull();
  });

  it('folds workflow.defined events from priorEvents alongside seeds', async () => {
    const wf2: PublishedWorkflowDef = { ...WF, id: 'wf-two' };
    const ctx = buildMemoryContext([WF], [published(wf2)]);
    expect(await ctx.getWorkflowDef(SCOPE, 'wf-two')).toEqual(wf2);
    expect(await ctx.getWorkflowDef(SCOPE, 'wf-basic')).toEqual(WF);
  });

  /**
   * 5.31 — buildMemoryContext's getWorkflowDef answers an explicit version with that version rather than the latest, so the shared in-memory context used by the fixture suite cannot disagree with the server about a ticket's category.
   */
  it('getWorkflowDef answers an explicit version with THAT version, not the latest', async () => {
    const wfV2: PublishedWorkflowDef = { ...WF, version: 2, name: 'Basic v2' };
    const ctx = buildMemoryContext([WF], [published(wfV2)]);
    expect((await ctx.getWorkflowDef(SCOPE, 'wf-basic'))?.version).toBe(2);
    expect((await ctx.getWorkflowDef(SCOPE, 'wf-basic', 1))?.name).toBe('Basic');
    expect((await ctx.getWorkflowDef(SCOPE, 'wf-basic', 2))?.name).toBe('Basic v2');
    expect(await ctx.getWorkflowDef(SCOPE, 'wf-basic', 7)).toBeNull();
  });

  it('"latest" is the highest version, not the last one published', async () => {
    // Mirrors the fixture harness's `latestOf` (harness.ts:161-167), which scans
    // for the maximum. A context that took "whatever was published last" would
    // answer a different question than the harness for the same inputs.
    const wfV2: PublishedWorkflowDef = { ...WF, version: 2, name: 'Basic v2' };
    const ctx = buildMemoryContext([WF], [published(wfV2), published(WF)]);
    expect((await ctx.getWorkflowDef(SCOPE, 'wf-basic'))?.version).toBe(2);
    expect(ctx.workflowVersions.get('wf-basic')?.map((def) => def.version)).toEqual([1, 2]);
  });

  it('a re-categorising v2 refreshes the tickets already sitting in that state', async () => {
    // Design decision 10. The server's proj_tickets refreshes on publish; if
    // this context did not, a fixture that publishes a re-categorising v2 after
    // some transitions would get one verdict here and another from the server —
    // the parent-terminal invariant would read stale categories in one and
    // folded ones in the other. Same domain function on both sides.
    const wfV2: PublishedWorkflowDef = {
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
      transitioned(CHILD, 'doing', 2),
      published(wfV2),
    ]);
    expect(await ctx.getEntityState('ticket', CHILD)).toMatchObject({
      stateId: 'doing',
      stateCategory: 'terminal',
      workflowVersion: 2,
    });
  });

  it('the refresh follows a stateMapping when the new version DROPS the state a ticket sits in', async () => {
    // The one test that catches parsing `workflow.defined` with
    // `workflowDefSchema` instead of `workflowDefinedPayloadSchema`: zod strips
    // undeclared keys, so the wrong schema silently deletes `stateMapping` and
    // every refold across a dropped state throws instead of following the map.
    const wfV2: PublishedWorkflowDef = {
      ...WF,
      version: 2,
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'in-progress', name: 'In progress', category: 'active' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      stateMapping: { doing: 'in-progress' },
    };
    const ctx = buildMemoryContext([WF], [
      typeDefined(TASK),
      created(CHILD, 'task', null),
      transitioned(CHILD, 'doing', 2),
      published(wfV2),
    ]);
    expect(await ctx.getEntityState('ticket', CHILD)).toMatchObject({
      stateId: 'in-progress',
      stateCategory: 'active',
      workflowVersion: 2,
    });
  });

  it('the refresh consults intermediate versions by exact number, and a hole is reported as a hole', async () => {
    // v2 is never published, so folding v1 → v3 asks for it and cannot have it.
    // A context that answered "latest" to that question would fold the ticket
    // through the wrong vocabulary and call the result an answer.
    const wfV3: PublishedWorkflowDef = { ...WF, version: 3 };
    const message = messageOf(() =>
      buildMemoryContext([WF], [
        typeDefined(TASK),
        created(CHILD, 'task', null),
        transitioned(CHILD, 'doing', 2),
        published(wfV3),
      ]),
    );
    expect(message).toBe(
      `foldTicketToWorkflowVersion: workflow "wf-basic" version 2 is missing — the version chain has a hole and ticket ${CHILD} cannot be walked forward`,
    );
  });

  it('a publish refreshes only the tickets on THAT workflow', async () => {
    const support: PublishedWorkflowDef = {
      id: 'wf-support',
      version: 1,
      name: 'Support',
      initialStateId: 'new',
      states: [
        { id: 'new', name: 'New', category: 'open' },
        { id: 'closed', name: 'Closed', category: 'terminal' },
      ],
      transitions: [{ from: '*', to: 'closed', rules: [] }],
    };
    const SUPPORT_TYPE: TicketTypeDef = { ...TASK, id: 'ticket', workflowId: 'wf-support' };
    const wfV2: PublishedWorkflowDef = {
      ...WF,
      version: 2,
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'doing', name: 'Doing', category: 'terminal' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
    };
    const ctx = buildMemoryContext([WF, support], [
      typeDefined(TASK),
      typeDefined(SUPPORT_TYPE),
      created(CHILD, 'task', null),
      transitioned(CHILD, 'doing', 2),
      created(OTHER, 'ticket', null, 3),
      published(wfV2),
    ]);
    expect(await ctx.getEntityState('ticket', OTHER)).toMatchObject({
      workflowId: 'wf-support',
      workflowVersion: 1,
      stateId: 'new',
      stateCategory: 'open',
    });
    expect(await ctx.getEntityState('ticket', CHILD)).toMatchObject({
      workflowVersion: 2,
      stateCategory: 'terminal',
    });
  });

  it('ignores event types that shape no ticket state', async () => {
    // Membership, visibility and the rest belong to other plans. They pass
    // through rather than throwing, so a fixture may carry them.
    const ctx = buildMemoryContext([WF], [
      typeDefined(TASK),
      created(CHILD, 'task', null),
      makeEnvelope({
        type: 'membership.granted',
        entity: { kind: 'membership', id: 'ws_1:user-kiro' },
        seq: 2,
        payload: { role: 'member' },
      }),
    ]);
    expect(ctx.tickets.size).toBe(1);
    expect([...ctx.tickets.keys()]).toEqual([CHILD]);
  });

  it('throws on a ticket event for a ticket that was never created — replay integrity, not a shrug', async () => {
    const message = messageOf(() => buildMemoryContext([WF], [transitioned(CHILD, 'doing', 2)]));
    expect(message).toBe(
      `applyTicketEvent: ticket.transitioned for ticket ${CHILD} that was never created`,
    );
  });

  it('exposes its maps for tests that need to plant or inspect state directly', async () => {
    const ctx = buildMemoryContext([WF], [typeDefined(TASK), created(CHILD, 'task', null)]);
    expect(ctx.ticketTypes.get('task')).toEqual(TASK);
    expect(ctx.workflows.get('wf-basic')).toEqual(WF);
    expect(ctx.tickets.get(CHILD)?.stateId).toBe('todo');
    // The seed is in the version list too, so an explicit-version lookup can
    // find it — seeds and published versions go through one accumulation.
    const versions: WorkflowDef[] = ctx.workflowVersions.get('wf-basic') ?? [];
    expect(versions.map((def) => def.version)).toEqual([1]);
  });
});
