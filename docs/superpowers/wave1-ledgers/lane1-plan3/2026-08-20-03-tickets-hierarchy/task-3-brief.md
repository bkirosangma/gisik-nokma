### Task 3: TicketState and the pure reducer — one fold, shared by server and fixtures

**Files:**
- Create: `packages/domain/src/workflow-helpers.ts`
- Create: `packages/domain/src/ticket-state.ts`
- Test: `packages/domain/src/ticket-state.test.ts`
- Modify: `packages/domain/src/index.ts` (add exports)

**Interfaces:**
- Consumes: `TicketTypeDef` (Task 1); payload schemas (Task 2); `WorkflowDef`, `StateCategory` from Plan 2 (packages/domain); `makeEnvelope` (Task 2).
- Produces (echoed verbatim where consumed — Tasks 4, 10, 12):

```ts
// FieldClaim and TicketState are DEFINED by Plan 2's Task 2 in
// packages/domain/src/entity-state.ts (coordination doc §4) and imported
// here — this plan's reducer produces the type, never redefines it.
// The merged shape, echoed for reference:
type FieldClaim = { value: unknown; actorId: string; clientTime: string; serverTime: string };

type TicketState = {
  kind: 'ticket';
  id: string;
  workspaceId: string;
  projectId: string;
  typeId: string;
  parentId: string | null;
  workflowId: string;
  workflowVersion: number;
  stateId: string;
  stateCategory: StateCategory;
  assigneeId: string | null;
  collaboratorIds: string[];
  fields: Record<string, FieldClaim>;
  transitions: { toStateId: string; actorId: string; seq: number; workflowVersion: number }[];
};

export type TicketStateDeps = {
  getTicketType(typeId: string): TicketTypeDef | undefined;
  getWorkflow(workflowId: string): WorkflowDef | undefined;
};

export const TICKET_EVENT_TYPES: readonly string[];
export function applyTicketEvent(state: TicketState | undefined, env: EventEnvelope, deps: TicketStateDeps): TicketState;
export function stateCategoryOf(def: WorkflowDef, stateId: string): StateCategory | undefined;

/**
 * Refresh-on-publish (design decision 10, owner decision 2026-08-26). ONE
 * implementation, in domain, because three callers need it and must not
 * disagree: the proj_tickets projection (Task 10), the in-memory context the
 * fixture suite runs on (Task 4), and Plan 10's offline replica, whose read
 * model is built from domain reducers and never from the server's pg tables.
 * `getVersion` resolves an exact intermediate version of the SAME workflow.
 */
export function foldTicketToWorkflowVersion(
  state: TicketState,
  target: WorkflowDef,
  getVersion: (version: number) => WorkflowDef | undefined,
): TicketState;
```

**Design note:** the reducer folds only *accepted* events (projections consume the ledger; fixtures fold `priorEvents`). It therefore **throws** — fails loudly, per the workspace error-handling standard — on states the engine is contracted to refuse at the door (event for a never-created ticket, unknown type, unresolvable workflow): reaching them in replay means ledger integrity is broken, and degrading silently would be a lie. If Plan 2 already ships an equivalent of `stateCategoryOf`, re-export theirs from `workflow-helpers.ts` instead of duplicating.

- [ ] **Step 1: Write the failing test**

```ts
// packages/domain/src/ticket-state.test.ts
import { describe, expect, it } from 'vitest';
import type { WorkflowDef } from './index';
import type { TicketState } from './entity-state';
import { applyTicketEvent, foldTicketToWorkflowVersion, stateCategoryOf, type TicketStateDeps } from './ticket-state';
import type { TicketTypeDef } from './ticket-types';
import { makeEnvelope } from './testing';

const PROJECT = '01J9GPRJ000000000000000000';
const TICKET = '01J9GTKA000000000000000000';
const PARENT = '01J9GPAR000000000000000000';

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

const TASK_TYPE: TicketTypeDef = { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-basic', fields: [] };

const deps: TicketStateDeps = {
  getTicketType: (id) => (id === 'task' ? TASK_TYPE : undefined),
  getWorkflow: (id) => (id === 'wf-basic' ? WF : undefined),
};

function createdState(): TicketState {
  return applyTicketEvent(
    undefined,
    makeEnvelope({
      type: 'ticket.created',
      entity: { kind: 'ticket', id: TICKET },
      payload: { typeId: 'task', projectId: PROJECT, parentId: PARENT, title: 'File the GST return' },
      actorId: 'user-kiro',
      clientTime: '2026-08-20T09:00:00.000Z',
      serverTime: '2026-08-20T09:00:00.100Z',
    }),
    deps,
  );
}

describe('applyTicketEvent', () => {
  it('creation enters the workflow initial state and records the title as an attributed claim', () => {
    const state = createdState();
    expect(state).toEqual({
      kind: 'ticket',
      id: TICKET, workspaceId: '01J9GWS0000000000000000000', projectId: PROJECT,
      typeId: 'task', parentId: PARENT, workflowId: 'wf-basic', workflowVersion: 1,
      stateId: 'todo', stateCategory: 'open',
      assigneeId: null, collaboratorIds: [],
      transitions: [],
      fields: {
        title: { value: 'File the GST return', actorId: 'user-kiro',
          clientTime: '2026-08-20T09:00:00.000Z', serverTime: '2026-08-20T09:00:00.100Z' },
      },
    });
  });

  it('transition moves state and re-derives the category from the workflow', () => {
    const state = applyTicketEvent(
      createdState(),
      makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: TICKET }, payload: { toStateId: 'done' } }),
      deps,
    );
    expect(state.stateId).toBe('done');
    expect(state.stateCategory).toBe('terminal');
    expect(state.transitions).toEqual([{ toStateId: 'done', actorId: 'user-kiro', seq: 1, workflowVersion: 1 }]);
  });

  it('field_set preserves provenance per field — who claimed it, and both times', () => {
    const state = applyTicketEvent(
      createdState(),
      makeEnvelope({
        type: 'ticket.field_set', entity: { kind: 'ticket', id: TICKET },
        payload: { fieldId: 'dueDate', value: { date: '2026-08-30', note: 'GST' } },
        actorId: 'user-anselma', clientTime: '2026-08-21T08:00:00.000Z', serverTime: '2026-08-21T08:00:00.900Z',
      }),
      deps,
    );
    expect(state.fields.dueDate).toEqual({
      value: { date: '2026-08-30', note: 'GST' },
      actorId: 'user-anselma',
      clientTime: '2026-08-21T08:00:00.000Z',
      serverTime: '2026-08-21T08:00:00.900Z',
    });
    expect(state.fields.title.value).toBe('File the GST return');
  });

  it('clearing a field with null keeps the provenance of the clearing claim', () => {
    let state = createdState();
    state = applyTicketEvent(
      state,
      makeEnvelope({ type: 'ticket.field_set', entity: { kind: 'ticket', id: TICKET },
        payload: { fieldId: 'dueDate', value: { date: '2026-08-30' } } }),
      deps,
    );
    state = applyTicketEvent(
      state,
      makeEnvelope({ type: 'ticket.field_set', entity: { kind: 'ticket', id: TICKET },
        payload: { fieldId: 'dueDate', value: null }, actorId: 'user-anselma' }),
      deps,
    );
    expect(state.fields.dueDate.value).toBeNull();
    expect(state.fields.dueDate.actorId).toBe('user-anselma');
  });

  it('assignment and unassignment', () => {
    let state = createdState();
    state = applyTicketEvent(state, makeEnvelope({ type: 'ticket.assigned', entity: { kind: 'ticket', id: TICKET }, payload: { assigneeId: 'user-anselma' } }), deps);
    expect(state.assigneeId).toBe('user-anselma');
    state = applyTicketEvent(state, makeEnvelope({ type: 'ticket.assigned', entity: { kind: 'ticket', id: TICKET }, payload: { assigneeId: null } }), deps);
    expect(state.assigneeId).toBeNull();
  });

  it('collaborators deduplicate on add and no-op on removing a non-member', () => {
    let state = createdState();
    const add = () => makeEnvelope({ type: 'ticket.collaborator_added', entity: { kind: 'ticket', id: TICKET }, payload: { userId: 'user-anselma' } });
    state = applyTicketEvent(state, add(), deps);
    state = applyTicketEvent(state, add(), deps);
    expect(state.collaboratorIds).toEqual(['user-anselma']);
    state = applyTicketEvent(
      state,
      makeEnvelope({ type: 'ticket.collaborator_removed', entity: { kind: 'ticket', id: TICKET }, payload: { userId: 'user-nobody' } }),
      deps,
    );
    expect(state.collaboratorIds).toEqual(['user-anselma']);
  });

  it('reparent moves the pointer; comments and attachments leave head state untouched', () => {
    let state = createdState();
    state = applyTicketEvent(state, makeEnvelope({ type: 'ticket.reparented', entity: { kind: 'ticket', id: TICKET }, payload: { newParentId: null } }), deps);
    expect(state.parentId).toBeNull();
    const before = state;
    state = applyTicketEvent(state, makeEnvelope({ type: 'comment.added', entity: { kind: 'ticket', id: TICKET }, payload: { body: { type: 'doc', content: [] } } }), deps);
    expect(state).toEqual(before);
  });

  it('throws loudly on replay-integrity breaks the engine is contracted to refuse', () => {
    expect(() =>
      applyTicketEvent(undefined, makeEnvelope({ type: 'ticket.assigned', entity: { kind: 'ticket', id: TICKET }, payload: { assigneeId: null } }), deps),
    ).toThrow(/never created/);
    expect(() =>
      applyTicketEvent(undefined, makeEnvelope({ type: 'ticket.created', entity: { kind: 'ticket', id: TICKET },
        payload: { typeId: 'ghost', projectId: PROJECT, parentId: null, title: 'x' } }), deps),
    ).toThrow(/unknown ticket type/);
  });
});

describe('stateCategoryOf', () => {
  it('maps a state id to its category, undefined when absent', () => {
    expect(stateCategoryOf(WF, 'doing')).toBe('active');
    expect(stateCategoryOf(WF, 'ghost')).toBeUndefined();
  });
});

// Refresh-on-publish: the fold a new workflow version applies to tickets
// already sitting in its states (design decision 10).
const WF2_RECATEGORISED: WorkflowDef = {
  ...WF,
  version: 2,
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'terminal' }, // was 'active' in v1
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
};

const WF2_DROPS_DOING = {
  ...WF,
  version: 2,
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'todo', rules: [] },
    { from: '*', to: 'done', rules: [] },
  ],
  stateMapping: { doing: 'todo' },
} as unknown as WorkflowDef;

function inDoing(): TicketState {
  return applyTicketEvent(
    createdState(),
    makeEnvelope({ type: 'ticket.transitioned', entity: { kind: 'ticket', id: TICKET }, payload: { toStateId: 'doing' } }),
    deps,
  );
}

describe('foldTicketToWorkflowVersion', () => {
  const noIntermediates = () => undefined;

  it('re-categorises a surviving state and stamps the new version', () => {
    const folded = foldTicketToWorkflowVersion(inDoing(), WF2_RECATEGORISED, noIntermediates);
    expect(folded).toMatchObject({ stateId: 'doing', stateCategory: 'terminal', workflowVersion: 2 });
  });

  it('walks a dropped state through the stateMapping instead of throwing', () => {
    const folded = foldTicketToWorkflowVersion(inDoing(), WF2_DROPS_DOING, noIntermediates);
    expect(folded).toMatchObject({ stateId: 'todo', stateCategory: 'open', workflowVersion: 2 });
  });

  it('leaves the transition log alone — each entry keeps the version its toStateId is written in', () => {
    const before = inDoing();
    const folded = foldTicketToWorkflowVersion(before, WF2_DROPS_DOING, noIntermediates);
    // The head state moved to 'todo'; the log still says the actor moved to
    // 'doing' under version 1, because that is what happened. RDU walks log
    // entries forward itself (Plan 2 Task 11); rewriting them here would
    // destroy the very evidence four-eyes compares against.
    expect(folded.transitions).toEqual(before.transitions);
    expect(folded.transitions.at(-1)).toMatchObject({ toStateId: 'doing', workflowVersion: 1 });
  });

  it('is a no-op for a ticket already at or past the target version — the guard that makes replay order-insensitive', () => {
    const already = { ...inDoing(), workflowVersion: 2, stateCategory: 'terminal' as const };
    expect(foldTicketToWorkflowVersion(already, WF, noIntermediates)).toBe(already);
    expect(foldTicketToWorkflowVersion(already, WF2_RECATEGORISED, noIntermediates)).toBe(already);
  });

  it('planted defect: a chain that cannot be walked throws rather than guessing a state', () => {
    const stranding = { ...WF2_DROPS_DOING, stateMapping: {} } as unknown as WorkflowDef;
    expect(() => foldTicketToWorkflowVersion(inDoing(), stranding, noIntermediates)).toThrowError(
      /cannot be folded forward/,
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run src/ticket-state.test.ts`
Expected: FAIL — cannot find module `./ticket-state`.

- [ ] **Step 3: Implement the workflow helper**

```ts
// packages/domain/src/workflow-helpers.ts
import type { StateCategory, WorkflowDef } from './workflow';

export function stateCategoryOf(def: WorkflowDef, stateId: string): StateCategory | undefined {
  return def.states.find((s) => s.id === stateId)?.category;
}
```

- [ ] **Step 4: Implement the reducer**

```ts
// packages/domain/src/ticket-state.ts
import type { EventEnvelope } from './envelope';
// FieldClaim and TicketState are defined by Plan 2's Task 2 in
// entity-state.ts (coordination doc §4): this reducer produces the type, it
// does not redefine it. Deliberately NOT re-exported from this module — the
// package index already exports entity-state, and a second star-export of
// the same names would collide.
import type { FieldClaim, TicketState } from './entity-state';
import {
  ticketAssignedPayload, ticketCollaboratorPayload, ticketCreatedPayload,
  ticketFieldSetPayload, ticketReparentedPayload, ticketTransitionedPayload,
} from './events/ticket-events';
import type { TicketTypeDef } from './ticket-types';
import type { WorkflowDef } from './workflow';
import { stateCategoryOf } from './workflow-helpers';
// The pure forward walk of a state id through a version chain's stateMappings.
// It moved out of packages/rule-engine/src/version-map.ts into this package by
// the owner decision of 2026-08-26, so the projection here and Plan 10's
// replica share the one walk. Plan 2 owns the module it lands in — if it chose
// a different filename, this is a one-line rename, not a re-implementation.
import { foldStateIdForward } from '@gisik-nokma/domain';

export type TicketStateDeps = {
  getTicketType(typeId: string): TicketTypeDef | undefined;
  getWorkflow(workflowId: string): WorkflowDef | undefined;
};

export const TICKET_EVENT_TYPES = [
  'ticket.created', 'ticket.transitioned', 'ticket.assigned',
  'ticket.collaborator_added', 'ticket.collaborator_removed',
  'ticket.field_set', 'ticket.reparented', 'ticket.workflow_rebound',
  'comment.added', 'attachment.added',
] as const;

function claim(value: unknown, env: EventEnvelope): FieldClaim {
  return { value, actorId: env.actorId, clientTime: env.clientTime, serverTime: env.serverTime };
}

/**
 * Pure fold of one ACCEPTED ticket event into head state. Both the
 * proj_tickets projection and the fixture suite's in-memory context use this
 * one function, so client and server cannot quietly disagree. Throws on
 * inputs the engine is contracted to refuse at the door — reaching them here
 * means ledger integrity is broken, and that must fail loudly.
 */
export function applyTicketEvent(
  state: TicketState | undefined,
  env: EventEnvelope,
  deps: TicketStateDeps,
): TicketState {
  if (env.type === 'ticket.created') {
    const p = ticketCreatedPayload.parse(env.payload);
    const type = deps.getTicketType(p.typeId);
    if (!type) {
      throw new Error(`applyTicketEvent: unknown ticket type "${p.typeId}" — the engine must refuse ticket.created before it reaches a projection`);
    }
    const wf = deps.getWorkflow(type.workflowId);
    if (!wf) {
      throw new Error(`applyTicketEvent: workflow "${type.workflowId}" is not defined — the engine must refuse ticket.created before it reaches a projection`);
    }
    const category = stateCategoryOf(wf, wf.initialStateId);
    if (!category) {
      throw new Error(`applyTicketEvent: workflow "${wf.id}" has no state "${wf.initialStateId}"`);
    }
    return {
      kind: 'ticket',
      id: env.entity.id,
      workspaceId: env.workspaceId,
      projectId: p.projectId,
      typeId: p.typeId,
      parentId: p.parentId,
      workflowId: type.workflowId,
      workflowVersion: wf.version,
      stateId: wf.initialStateId,
      stateCategory: category,
      assigneeId: null,
      collaboratorIds: [],
      fields: { title: claim(p.title, env) },
      transitions: [],
    };
  }

  if (!state) {
    throw new Error(`applyTicketEvent: ${env.type} for ticket ${env.entity.id} that was never created`);
  }

  switch (env.type) {
    case 'ticket.transitioned': {
      const p = ticketTransitionedPayload.parse(env.payload);
      const wf = deps.getWorkflow(state.workflowId);
      if (!wf) {
        throw new Error(`applyTicketEvent: workflow "${state.workflowId}" vanished — replay integrity is broken`);
      }
      const category = stateCategoryOf(wf, p.toStateId);
      if (!category) {
        throw new Error(`applyTicketEvent: workflow "${wf.id}" has no state "${p.toStateId}"`);
      }
      return {
        ...state,
        stateId: p.toStateId,
        stateCategory: category,
        workflowVersion: wf.version,
        // The entry's `workflowVersion` is the version in whose vocabulary its
        // `toStateId` is written — the ticket's own version at the moment the
        // event applied, AFTER the forward fold this reducer performs on the
        // line above. So it is `wf.version` (the def `p.toStateId` was just
        // resolved against), never the pre-spread `state.workflowVersion`,
        // which is the version the ticket sat at BEFORE this fold. RDU walks a
        // candidate entry's id forward from this version through `stateMapping`
        // before comparing, so a remapped state can no longer disarm four-eyes.
        transitions: [...state.transitions, { toStateId: p.toStateId, actorId: env.actorId, seq: env.seq, workflowVersion: wf.version }],
      };
    }
    case 'ticket.assigned': {
      const p = ticketAssignedPayload.parse(env.payload);
      return { ...state, assigneeId: p.assigneeId };
    }
    case 'ticket.collaborator_added': {
      const p = ticketCollaboratorPayload.parse(env.payload);
      return state.collaboratorIds.includes(p.userId)
        ? state
        : { ...state, collaboratorIds: [...state.collaboratorIds, p.userId] };
    }
    case 'ticket.collaborator_removed': {
      const p = ticketCollaboratorPayload.parse(env.payload);
      return { ...state, collaboratorIds: state.collaboratorIds.filter((id) => id !== p.userId) };
    }
    case 'ticket.field_set': {
      const p = ticketFieldSetPayload.parse(env.payload);
      return { ...state, fields: { ...state.fields, [p.fieldId]: claim(p.value ?? null, env) } };
    }
    case 'ticket.reparented': {
      const p = ticketReparentedPayload.parse(env.payload);
      return { ...state, parentId: p.newParentId };
    }
    case 'ticket.workflow_rebound': {
      const p = ticketWorkflowReboundPayload.parse(env.payload);
      const wf = deps.getWorkflow(p.toWorkflowId);
      if (!wf) {
        throw new Error(
          `applyTicketEvent: workflow "${p.toWorkflowId}" is not defined — the engine must refuse ticket.workflow_rebound before it reaches a projection`,
        );
      }
      const category = stateCategoryOf(wf, p.toStateId);
      if (!category) {
        throw new Error(`applyTicketEvent: workflow "${wf.id}" has no state "${p.toStateId}"`);
      }
      // The transition log is NOT appended to, and existing entries are NOT
      // rewritten. A migration is an attributed claim of its own, not a move
      // anybody performed, so four-eyes has nobody to differ from on the first
      // guarded move in the new workflow — and the entries left behind keep the
      // workflowId they were recorded under, so `require-different-user`
      // filters them out instead of walking them through a chain they were
      // never written in. Rewriting them into the new vocabulary would destroy
      // the very fact that filter reads.
      return {
        ...state,
        workflowId: p.toWorkflowId,
        workflowVersion: wf.version,
        stateId: p.toStateId,
        stateCategory: category,
      };
    }
    case 'comment.added':
    case 'attachment.added':
      // Neither adds to head state: comments and attachments are ledger
      // entries the history endpoint renders, not fields anything folds.
      // This is precisely why "a Drive reference cannot be evidence" is NOT a
      // rule-engine rule — `TicketState` never carries attachments, so no pure
      // rule has anywhere to read an attachment's kind from; the refusal lives
      // in Plan 7's evidence gate, inside the ingest transaction, where the
      // attachments table and the ledger are both in reach.
      return state;
    default:
      throw new Error(`applyTicketEvent: not a ticket event: ${env.type}`);
  }
}

/**
 * Fold ONE ticket's head state forward onto a newly published workflow
 * version (design decision 10, owner decision 2026-08-26). The ONE
 * implementation of refresh-on-publish: the proj_tickets projection, the
 * fixture suite's in-memory context, and Plan 10's offline replica all call
 * this. Two of the three would otherwise drift, and the replica — which never
 * sees the server's pg projections — would keep stale categories forever.
 *
 * `getVersion` resolves an exact intermediate version of the SAME workflow;
 * it is only consulted when the ticket is more than one version behind.
 *
 * The `>=` early return is NOT dead code on the live path's account. Plan 1's
 * canonical replay order is (entity_kind, entity_id, seq), so on a rebuild
 * every `ticket` event replays before every `workflow` event and rows arrive
 * here already at their as-of version; the older publishes then land last and
 * would drag them backwards. Skipping makes the fold monotone, so the last
 * `workflow.defined` puts every row at the same place whatever order the
 * ledger was replayed in. Do not remove it.
 */
export function foldTicketToWorkflowVersion(
  state: TicketState,
  target: WorkflowDef,
  getVersion: (version: number) => WorkflowDef | undefined,
): TicketState {
  if (state.workflowVersion >= target.version) return state;

  // Pre-check the chain so that a hole reports as a hole. `foldStateIdForward`
  // folds a missing definition into the same `ok: false` as an unmapped drop,
  // and those are different faults: one is a gap in the ledger, the other a
  // publish that should have been refused. Naming the wrong one sends whoever
  // reads the error hunting in the wrong place.
  for (let version = state.workflowVersion + 1; version < target.version; version += 1) {
    if (!getVersion(version)) {
      throw new Error(
        `foldTicketToWorkflowVersion: workflow "${state.workflowId}" version ${version} is missing — the version chain has a hole and ticket ${state.id} cannot be folded forward`,
      );
    }
  }

  const resolved = foldStateIdForward(
    state.stateId,
    state.workflowVersion,
    target,
    (version) => getVersion(version) ?? null,
  );
  if (!resolved.ok) {
    // Publishing refuses unmapped drops (Plan 2), so this is only reachable on
    // a corrupted or hand-planted store. The honest answer is a loud failure,
    // never a guessed state — a ticket whose status we invented is exactly
    // what invariant 4 forbids.
    throw new Error(
      `foldTicketToWorkflowVersion: ticket ${state.id} cannot be folded forward to workflow "${target.id}" version ${target.version} — state "${resolved.unmappedStateId}" is dropped with no stateMapping entry`,
    );
  }

  const category = stateCategoryOf(target, resolved.stateId);
  if (!category) {
    throw new Error(`foldTicketToWorkflowVersion: workflow "${target.id}" version ${target.version} has no state "${resolved.stateId}"`);
  }

  return {
    ...state,
    stateId: resolved.stateId,
    stateCategory: category,
    workflowVersion: target.version,
    // `transitions` is deliberately untouched. Each entry's `workflowVersion`
    // is the vocabulary its `toStateId` is written in; rewriting it would
    // destroy the evidence `require-different-user` walks forward to find an
    // earlier performer (Plan 2 Task 11, coordination doc 2026-08-26).
  };
}
```

- [ ] **Step 5: Export from the package index**

Add to `packages/domain/src/index.ts`:

```ts
export * from './ticket-state';
export * from './workflow-helpers';
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @gisik-nokma/domain exec vitest run src/ticket-state.test.ts`
Expected: PASS (14 tests) — the nine reducer/helper cases plus the five that pin refresh-on-publish.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/ticket-state.ts packages/domain/src/ticket-state.test.ts packages/domain/src/workflow-helpers.ts packages/domain/src/index.ts
git commit -m "One reducer for ticket head state, shared by projection and fixtures — every field carries its claimant and both clocks, and replay-integrity breaks throw instead of degrading into quiet fiction

The same file now owns the other half: when a workflow version is published, foldTicketToWorkflowVersion walks a ticket's state id forward through the mapping chain and recomputes its category, leaving the transition log untouched because each entry's version is the vocabulary its state id is written in. It skips a ticket already at or past the target version, which is what lets a projection-outer rebuild — where workflow events replay after ticket events — land on the same answer the live path did."
```

