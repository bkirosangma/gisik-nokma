import { describe, expect, it } from 'vitest';
import { BUILTIN_TICKET_TYPE_SEEDS, type TicketState } from '@gisik-nokma/domain';
import {
  BUILTIN_EPIC_TYPE_ID,
  EPIC_RANK,
  epicAncestorOf,
  isBuiltinEpicType,
} from '../../src/hierarchy/epic-ancestor.js';

function node(id: string, typeId: string, parentId: string | null): TicketState {
  return {
    kind: 'ticket',
    id,
    workspaceId: 'ws_1',
    projectId: 'p1',
    typeId,
    parentId,
    workflowId: 'wf_basic',
    workflowVersion: 1,
    stateId: 'doing',
    stateCategory: 'active',
    assigneeId: null,
    collaboratorIds: [],
    fields: {},
    transitions: [],
  };
}

function index(...states: TicketState[]): Map<string, TicketState> {
  return new Map(states.map((state) => [state.id, state]));
}

describe('11.18 (support) the epic ancestor — arrangement, never a guess', () => {
  it('the built-in epic id is DERIVED from the domain seed table, not spelled again', () => {
    expect(BUILTIN_EPIC_TYPE_ID).toBe('epic');
    expect(BUILTIN_TICKET_TYPE_SEEDS.find((seed) => seed.id === BUILTIN_EPIC_TYPE_ID)?.rank).toBe(
      EPIC_RANK,
    );
    expect(isBuiltinEpicType('epic')).toBe(true);
    expect(isBuiltinEpicType('story')).toBe(false);
  });

  it('finds the NEAREST epic, walking up through non-epics', () => {
    const byId = index(
      node('e1', 'epic', null),
      node('s1', 'story', 'e1'),
      node('t1', 'task', 's1'),
    );
    expect(epicAncestorOf(byId, 't1')).toBe('e1');
  });

  it('an epic is its own ancestor', () => {
    const byId = index(node('e1', 'epic', null));
    expect(epicAncestorOf(byId, 'e1')).toBe('e1');
  });

  it('nests: the NEAREST epic wins, not the root one', () => {
    const byId = index(
      node('e_outer', 'epic', null),
      node('e_inner', 'epic', 'e_outer'),
      node('t1', 'task', 'e_inner'),
    );
    expect(epicAncestorOf(byId, 't1')).toBe('e_inner');
  });

  it('no epic overhead is null — the "No epic" lane, never a substitute', () => {
    const byId = index(node('s1', 'story', null), node('t1', 'task', 's1'));
    expect(epicAncestorOf(byId, 't1')).toBeNull();
  });

  it('an ancestor the caller did not load is null, not a half-walk reported as whole', () => {
    const byId = index(node('t1', 'task', 'e_absent'));
    expect(epicAncestorOf(byId, 't1')).toBeNull();
  });

  it('an unknown ticket id is null rather than a throw', () => {
    expect(epicAncestorOf(index(), 'nobody')).toBeNull();
  });

  it('a parent cycle terminates — a replica can lag a reparent refusal', () => {
    const byId = index(node('a', 'task', 'b'), node('b', 'task', 'a'));
    expect(epicAncestorOf(byId, 'a')).toBeNull();
  });

  it("a workspace's OWN rank-1 type is an epic when the shell says so", () => {
    const byId = index(node('i1', 'initiative', null), node('t1', 'task', 'i1'));
    expect(epicAncestorOf(byId, 't1')).toBeNull(); // narrower than the truth by default
    expect(epicAncestorOf(byId, 't1', (typeId) => typeId === 'initiative')).toBe('i1');
  });
});
