import { describe, expect, it } from 'vitest';
import { newUlid, parseEvent, type TicketTypeDef } from '@gisik-nokma/domain';
import { createDraftStore, draftFromPublished, newDraft } from '../../src/workflow-builder/draft-store.js';
import {
  buildPublishPayload,
  buildTicketTypeDefinedEvent,
  buildWorkflowDefinedEvent,
  droppedStates,
} from '../../src/workflow-builder/events.js';
import { createFakeGateway } from '../../src/workflow-builder/fake-gateway.js';

const WORKSPACE = newUlid();
const ACTOR = newUlid();

function publishedKanban() {
  return {
    id: newUlid(),
    version: 2,
    name: 'Kanban',
    initialStateId: 'todo',
    states: [
      { id: 'todo', name: 'To do', category: 'open' as const },
      { id: 'review', name: 'Review', category: 'active' as const },
      { id: 'done', name: 'Done', category: 'terminal' as const },
    ],
    transitions: [
      { from: 'todo', to: 'review', rules: [] },
      { from: 'review', to: 'done', rules: [] },
    ],
  };
}

describe('droppedStates and buildPublishPayload', () => {
  it('a brand-new draft has no dropped states and publishes as version 1', () => {
    const draft = newDraft('Fresh');
    expect(droppedStates(draft)).toEqual([]);
    expect(buildPublishPayload(draft).version).toBe(1);
  });

  it('removing a state from a published base reports it dropped, with its display name', () => {
    const draft = draftFromPublished(publishedKanban());
    draft.def = {
      ...draft.def,
      states: draft.def.states.filter((state) => state.id !== 'review'),
      transitions: draft.def.transitions.filter(
        (transition) => transition.from !== 'review' && transition.to !== 'review',
      ),
    };
    expect(droppedStates(draft)).toEqual([{ id: 'review', name: 'Review' }]);
  });

  it('bumps the version from the base and attaches the mapping only when given and non-empty', () => {
    const draft = draftFromPublished(publishedKanban());
    expect(buildPublishPayload(draft).version).toBe(3);
    expect('stateMapping' in buildPublishPayload(draft)).toBe(false);
    expect('stateMapping' in buildPublishPayload(draft, {})).toBe(false);
    expect(buildPublishPayload(draft, { review: 'todo' }).stateMapping).toEqual({ review: 'todo' });
  });

  /**
   * 10.139 — starting-status design (2026-09-23): a state's `creatable: false`, set through the draft store, survives into the publish payload — buildPublishPayload spreads draft.def whole, and workflowStateSchema (packages/domain/src/workflow.ts) is what keeps a non-strict parse from stripping the key at publish.
   */
  it('a state with creatable: false, set through the store, carries the flag into the publish payload', () => {
    const store = createDraftStore(draftFromPublished(publishedKanban()));
    store.actions.setStateCreatable('review', false);
    const payload = buildPublishPayload(store.getState());
    expect(payload.states.find((state) => state.id === 'review')?.creatable).toBe(false);
    // Every other state is untouched — the key is written for ONE state, not
    // smeared across the payload.
    expect(payload.states.find((state) => state.id === 'todo')?.creatable).toBeUndefined();
    expect(payload.states.find((state) => state.id === 'done')?.creatable).toBeUndefined();
  });
});

describe('event builders', () => {
  it('workflow.defined points its entity at the payload workflow id and passes parseEvent whole', () => {
    const draft = newDraft('Fresh');
    const payload = buildPublishPayload(draft);
    // the zod payload schema checks structure, not workflow soundness — a fresh
    // one-state draft parses fine here; the ENGINE would refuse publishing it
    const event = buildWorkflowDefinedEvent({ workspaceId: WORKSPACE, actorId: ACTOR, origin: 'web', payload });
    expect(event.type).toBe('workflow.defined');
    expect(event.version).toBe(1);
    expect(event.entity).toEqual({ kind: 'workflow', id: payload.id });
    expect(event.workspaceId).toBe(WORKSPACE);
    expect(event.actorId).toBe(ACTOR);
    expect(event.origin).toBe('web');
    expect(Number.isNaN(Date.parse(event.clientTime))).toBe(false);
    const parsed = parseEvent(event);
    expect(parsed.ok).toBe(true);
  });

  /**
   * 10.42 — the create flow emits ticket-type.defined with a fresh entity ulid.
   */
  it('ticket-type.defined mints a fresh entity ulid and carries the def as payload', () => {
    const def: TicketTypeDef = {
      id: newUlid(),
      name: 'Invoice',
      icon: 'receipt',
      rank: 3,
      workflowId: newUlid(),
      fields: [{ id: newUlid(), name: 'Amount', type: 'number' }],
    };
    const first = buildTicketTypeDefinedEvent({ workspaceId: WORKSPACE, actorId: ACTOR, origin: 'web', def });
    const second = buildTicketTypeDefinedEvent({ workspaceId: WORKSPACE, actorId: ACTOR, origin: 'web', def });
    expect(first.type).toBe('ticket-type.defined');
    expect(first.entity.kind).toBe('ticket-type');
    expect(first.entity.id).not.toBe(second.entity.id); // fresh entity ULID per submission (decision 6)
    expect(first.payload).toEqual(def);
    expect(parseEvent(first).ok).toBe(true);
  });
});

describe('createFakeGateway', () => {
  it('serves its seed and records submissions, committing by default', async () => {
    const workflows = [publishedKanban()];
    const gateway = createFakeGateway({ workflows, occupancy: { [workflows[0]!.id]: { review: 4 } } });
    expect(await gateway.listWorkflows(WORKSPACE)).toEqual(workflows);
    expect(await gateway.getWorkflow(WORKSPACE, workflows[0]!.id)).toEqual(workflows[0]);
    expect(await gateway.getWorkflow(WORKSPACE, newUlid())).toBeNull();
    expect(await gateway.getStateOccupancy(WORKSPACE, workflows[0]!.id)).toEqual({ review: 4 });

    const event = buildWorkflowDefinedEvent({
      workspaceId: WORKSPACE,
      actorId: ACTOR,
      origin: 'web',
      payload: buildPublishPayload(newDraft('Fresh')),
    });
    const results = await gateway.submit([event]);
    expect(results).toEqual([
      { status: 'committed', eventId: event.id, seq: 1, serverTime: expect.any(String) },
    ]);
    expect(gateway.submitted).toEqual([event]);
  });

  it('drains queued results and rejects occupancy reads when told to', async () => {
    const gateway = createFakeGateway({
      submitResults: [{ status: 'refused', eventId: 'e', rule: 'permission.role', reason: 'no' }],
      occupancyError: true,
    });
    const event = buildWorkflowDefinedEvent({
      workspaceId: WORKSPACE,
      actorId: ACTOR,
      origin: 'web',
      payload: buildPublishPayload(newDraft('Fresh')),
    });
    expect(await gateway.submit([event])).toEqual([
      { status: 'refused', eventId: 'e', rule: 'permission.role', reason: 'no' },
    ]);
    await expect(gateway.getStateOccupancy(WORKSPACE, 'wf')).rejects.toThrow();
  });

  it('serves the pinned population per (type, workflow) and records the migration it is asked for', async () => {
    const gateway = createFakeGateway({ typePopulation: { task: { 'wf-old': 12, 'wf-new': 3 } } });
    // A ticket pins the workflow it was created under, so one type can have a
    // population on each of two workflows at once (decision 10).
    expect(await gateway.getTypeWorkflowPopulation(WORKSPACE, 'task', 'wf-old')).toBe(12);
    expect(await gateway.getTypeWorkflowPopulation(WORKSPACE, 'task', 'wf-new')).toBe(3);
    expect(await gateway.getTypeWorkflowPopulation(WORKSPACE, 'task', 'wf-never-used')).toBe(0);

    const request = {
      workspaceId: WORKSPACE,
      typeId: 'task',
      fromWorkflowId: 'wf-old',
      toWorkflowId: 'wf-new',
      stateMap: { todo: 'backlog', doing: 'in-flight', done: 'closed' },
    };
    expect(await gateway.migrateTypeToWorkflow(request)).toEqual({ status: 'migrated', count: 12 });
    expect(gateway.migrations).toEqual([request]);
  });

  it('rejects population reads and refuses migrations when told to', async () => {
    const gateway = createFakeGateway({
      typePopulationError: true,
      migrationResults: [
        { status: 'refused', rule: 'ticket.unknown-state', reason: '"closed" is not a state of this workflow.' },
      ],
    });
    await expect(gateway.getTypeWorkflowPopulation(WORKSPACE, 'task', 'wf-old')).rejects.toThrow();
    expect(
      await gateway.migrateTypeToWorkflow({
        workspaceId: WORKSPACE,
        typeId: 'task',
        fromWorkflowId: 'wf-old',
        toWorkflowId: 'wf-new',
        stateMap: { todo: 'closed' },
      }),
    ).toEqual({ status: 'refused', rule: 'ticket.unknown-state', reason: '"closed" is not a state of this workflow.' });
  });

  // Lane 3 ruling, coordination doc 2026-08-28 ("the validating fake"):
  // createFakeGateway must run every submitted event through the shipped
  // submittedEventSchema before accepting it, so this fake cannot become the
  // thing that excuses the server from existing by accepting a shape the real
  // door would refuse. Not in the plan's own Step 1 text — added here because
  // twelve later tasks build on this fake before Task 13 ever reaches a real
  // server.
  it('refuses a malformed envelope the same way the real door would, and does not record it as submitted', async () => {
    const gateway = createFakeGateway();
    const malformed = {
      ...buildWorkflowDefinedEvent({
        workspaceId: WORKSPACE,
        actorId: ACTOR,
        origin: 'web',
        payload: buildPublishPayload(newDraft('Fresh')),
      }),
      actorId: 'not-a-ulid',
    };
    const [result] = await gateway.submit([malformed]);
    expect(result).toMatchObject({ status: 'invalid', eventId: malformed.id });
    if (result?.status === 'invalid') {
      expect(result.message.length).toBeGreaterThan(0);
    }
    expect(gateway.submitted).toEqual([]);
  });

  // The other half of the same ruling (coordination doc, "an over-strict
  // remedy is harder to catch than an under-strict check"): the validating
  // fake must not refuse a well-formed event it should accept. A publish
  // carrying a real stateMapping is exactly the path Task 9/10's mapping
  // dialog drives, so it is the one worth proving rather than assuming.
  it('does not over-refuse a well-formed workflow.defined event that carries a real stateMapping', async () => {
    const gateway = createFakeGateway();
    const draft = draftFromPublished(publishedKanban());
    const payload = buildPublishPayload(draft, { review: 'todo' });
    const event = buildWorkflowDefinedEvent({ workspaceId: WORKSPACE, actorId: ACTOR, origin: 'web', payload });
    const [result] = await gateway.submit([event]);
    expect(result).toMatchObject({ status: 'committed', eventId: event.id });
    expect(gateway.submitted).toEqual([event]);
  });
});
