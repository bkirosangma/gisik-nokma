import { describe, expect, it, vi } from 'vitest';
import type { TicketState, WorkflowDef } from '@gisik-nokma/domain';
import { resolveCurrentStateId, resolveStateIdForward } from '../src/version-map.js';
import type { EngineContext } from '../src/engine.js';

/**
 * A three-version chain — and three is the point. The fixture suite tops out
 * at two versions, where `latest` answers for the only version the walk
 * visits and the intermediate fetch below never executes: every mutant of
 * that loop survives the whole suite. A ticket two versions behind is the
 * smallest case that makes the fetch load-bearing, and it is not exotic —
 * it is a ticket nobody touched across two publishes.
 *
 * `a` is dropped by v2 and mapped to `b`; `b` is dropped by v3 and mapped to
 * `c`. Only by fetching v2 can the walk learn that `a` became `b`, and only
 * then does v3's mapping have anything to match.
 */
const v1: WorkflowDef = {
  id: 'wf',
  version: 1,
  name: 'Chain',
  initialStateId: 'a',
  states: [{ id: 'a', name: 'A', category: 'open' }],
  transitions: [],
};

const v2: WorkflowDef & { stateMapping: Record<string, string> } = {
  id: 'wf',
  version: 2,
  name: 'Chain',
  initialStateId: 'b',
  states: [{ id: 'b', name: 'B', category: 'open' }],
  transitions: [],
  stateMapping: { a: 'b' },
};

const v3: WorkflowDef & { stateMapping: Record<string, string> } = {
  id: 'wf',
  version: 3,
  name: 'Chain',
  initialStateId: 'c',
  states: [{ id: 'c', name: 'C', category: 'open' }],
  transitions: [],
  stateMapping: { b: 'c' },
};

/** A context that serves the given versions by number and nothing else. */
function chainContext(byVersion: Map<number, WorkflowDef>): {
  ctx: EngineContext;
  versionsAsked: () => (number | undefined)[];
  workflowIdsAsked: () => string[];
} {
  const getWorkflowDef = vi.fn(async (_workflowId: string, version?: number) =>
    version === undefined ? (byVersion.get(3) ?? null) : (byVersion.get(version) ?? null),
  );
  return {
    ctx: {
      getEntityState: vi.fn(async () => null),
      getChildrenStates: vi.fn(async () => []),
      getWorkflowDef,
    },
    versionsAsked: () => getWorkflowDef.mock.calls.map((call) => call[1]),
    workflowIdsAsked: () => getWorkflowDef.mock.calls.map((call) => call[0]),
  };
}

function ticketAt(stateId: string, workflowVersion: number): TicketState {
  return {
    kind: 'ticket',
    id: 't1',
    workspaceId: 'ws_1',
    projectId: 'prj_1',
    typeId: 'task',
    parentId: null,
    workflowId: 'wf',
    workflowVersion,
    stateId,
    stateCategory: 'open',
    assigneeId: null,
    collaboratorIds: [],
    fields: {},
    transitions: [],
  };
}

describe('resolveStateIdForward — the intermediate fetch the fixtures cannot reach', () => {
  it('walks a state through an intermediate version the caller never held', async () => {
    const { ctx, versionsAsked, workflowIdsAsked } = chainContext(
      new Map([
        [1, v1],
        [2, v2],
        [3, v3],
      ]),
    );

    const resolved = await resolveStateIdForward('wf', 'a', 1, v3, ctx);

    expect(resolved).toEqual({ ok: true, stateId: 'c' });
    // The chain is only walkable because v2 was fetched: v3's mapping is
    // keyed on `b`, and nothing but v2 turns `a` into `b`.
    expect(versionsAsked()).toEqual([2]);
    expect(workflowIdsAsked()).toEqual(['wf']);
  });

  it('refuses at the version it could not fetch, naming the id the chain broke on', async () => {
    // v2 is missing from the store — the corrupted-store path. The walk stops
    // where it lost the thread and reports `a`, the id it was holding at that
    // point, not the id it would have reached had the mapping been there.
    const { ctx } = chainContext(
      new Map([
        [1, v1],
        [3, v3],
      ]),
    );

    const resolved = await resolveStateIdForward('wf', 'a', 1, v3, ctx);

    expect(resolved).toEqual({ ok: false, unmappedStateId: 'a' });
  });

  it('asks only for versions strictly between the origin and the latest', async () => {
    const { ctx, versionsAsked } = chainContext(
      new Map([
        [1, v1],
        [2, v2],
        [3, v3],
      ]),
    );

    await resolveStateIdForward('wf', 'b', 2, v3, ctx);

    // Neither the origin version nor the latest is fetched: the caller
    // already holds `latest`, and the origin's vocabulary is the input.
    expect(versionsAsked()).toEqual([]);
  });
});

describe('resolveCurrentStateId', () => {
  it("threads the ticket's own workflow, state and version into the walk", async () => {
    const { ctx, versionsAsked, workflowIdsAsked } = chainContext(
      new Map([
        [1, v1],
        [2, v2],
        [3, v3],
      ]),
    );

    const resolved = await resolveCurrentStateId(ticketAt('a', 1), v3, ctx);

    expect(resolved).toEqual({ ok: true, stateId: 'c' });
    expect(versionsAsked()).toEqual([2]);
    expect(workflowIdsAsked()).toEqual(['wf']);
  });
});
