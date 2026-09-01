import { describe, expect, it, vi } from 'vitest';
import type { TicketState, WorkflowDef } from '@gisik-nokma/domain';
import { resolveCurrentStateId, resolveStateIdForward } from '../src/version-map.js';
import type { EngineContext, TenantScope } from '../src/engine.js';

/**
 * The tenancy every lookup below is asked inside (controller ruling P14, Task
 * 12). Deliberately NOT `ws_1`, which is `ticketAt`'s workspace: the walk takes
 * its scope from the EVENT under evaluation, and a fixture where the two
 * coincide cannot tell a scope threaded from the event apart from one read off
 * the ticket.
 */
const SCOPE: TenantScope = { workspaceId: 'ws_event' };

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
  scopesAsked: () => TenantScope[];
} {
  const getWorkflowDef = vi.fn(async (_scope: TenantScope, _workflowId: string, version?: number) =>
    version === undefined ? (byVersion.get(3) ?? null) : (byVersion.get(version) ?? null),
  );
  return {
    ctx: {
      getEntityState: vi.fn(async () => null),
      getChildrenStates: vi.fn(async () => []),
      getTicketTypeDef: vi.fn(async () => null),
      getWorkflowDef,
    },
    // THE ARGUMENT INDICES MOVED WITH THE SIGNATURE (Task 12). `scope` is the
    // first parameter now, so the workflow id is `call[1]` and the version
    // `call[2]`. Reading `call[0]`/`call[1]` here would still compile and would
    // still produce assertions that pass — `versionsAsked()` would report the
    // workflow id — which is why they are written out beside `scopesAsked`
    // rather than adjusted quietly.
    versionsAsked: () => getWorkflowDef.mock.calls.map((call) => call[2]),
    workflowIdsAsked: () => getWorkflowDef.mock.calls.map((call) => call[1]),
    scopesAsked: () => getWorkflowDef.mock.calls.map((call) => call[0]),
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
    const { ctx, versionsAsked, workflowIdsAsked, scopesAsked } = chainContext(
      new Map([
        [1, v1],
        [2, v2],
        [3, v3],
      ]),
    );

    const resolved = await resolveStateIdForward(SCOPE, 'wf', 'a', 1, v3, ctx);

    expect(resolved).toEqual({ ok: true, stateId: 'c' });
    // The chain is only walkable because v2 was fetched: v3's mapping is
    // keyed on `b`, and nothing but v2 turns `a` into `b`.
    expect(versionsAsked()).toEqual([2]);
    expect(workflowIdsAsked()).toEqual(['wf']);
    // The scope the CALLER passed reached the lookup unchanged (ruling P14).
    expect(scopesAsked()).toEqual([SCOPE]);
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

    const resolved = await resolveStateIdForward(SCOPE, 'wf', 'a', 1, v3, ctx);

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

    await resolveStateIdForward(SCOPE, 'wf', 'b', 2, v3, ctx);

    // Neither the origin version nor the latest is fetched: the caller
    // already holds `latest`, and the origin's vocabulary is the input.
    expect(versionsAsked()).toEqual([]);
  });
});

describe('resolveCurrentStateId', () => {
  it("threads the ticket's own workflow, state and version into the walk", async () => {
    const { ctx, versionsAsked, workflowIdsAsked, scopesAsked } = chainContext(
      new Map([
        [1, v1],
        [2, v2],
        [3, v3],
      ]),
    );

    const resolved = await resolveCurrentStateId(SCOPE, ticketAt('a', 1), v3, ctx);

    expect(resolved).toEqual({ ok: true, stateId: 'c' });
    expect(versionsAsked()).toEqual([2]);
    expect(workflowIdsAsked()).toEqual(['wf']);
  });

  it("asks inside the CALLER's workspace, not the ticket's — the scope is the event's (ruling P14)", async () => {
    // `ticketAt` sits in `ws_1`; `SCOPE` is `ws_event`. The two differ on
    // purpose. Reading the tenancy off the ticket — `resolveStateIdForward(ticket, …)`
    // type-checks, because a `TicketState` satisfies `TenantScope` structurally —
    // would send `ws_1` to the store and this assertion is the only thing that
    // would notice. A resolved state's workspace is the fact the checks VERIFY;
    // it is never the fact that authorises a definition read.
    const { ctx, scopesAsked } = chainContext(
      new Map([
        [1, v1],
        [2, v2],
        [3, v3],
      ]),
    );

    await resolveCurrentStateId(SCOPE, ticketAt('a', 1), v3, ctx);

    expect(scopesAsked()).toEqual([SCOPE]);
    expect(scopesAsked().map((scope) => scope.workspaceId)).not.toContain(ticketAt('a', 1).workspaceId);
  });
});
