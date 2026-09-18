import { describe, expect, it } from 'vitest';
import type { ListRow } from '@gisik-nokma/app-core';
import type { TicketTypeDef, WorkflowDef } from '@gisik-nokma/domain';
import { startTargetFor } from '../src/backlog-start.js';

/** A minimal `ListRow` — only the two fields `startTargetFor` reads vary per case. */
function row(overrides: Partial<ListRow> = {}): ListRow {
  return {
    ticketId: 't_1',
    title: 'Restock the cold shelf',
    typeId: 'task',
    typeRank: 3,
    parentId: null,
    epicId: null,
    stateId: 'backlog',
    stateName: 'Backlog',
    stateCategory: 'open',
    stateProvenance: {
      actorId: 'user_kiro',
      actorName: 'Kiro',
      clientTime: '2026-09-17T09:00:00.000Z',
      serverTime: '2026-09-17T09:00:01.000Z',
    },
    assignee: null,
    assignedProvenance: null,
    dueDate: null,
    fields: {},
    rollup: null,
    hasRestrictedParent: false,
    pending: false,
    closed: null,
    rank: null,
    ...overrides,
  };
}

function typeDef(overrides: Partial<TicketTypeDef> = {}): TicketTypeDef {
  return { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf_basic', fields: [], ...overrides };
}

function workflowDef(overrides: Partial<WorkflowDef> = {}): WorkflowDef {
  return {
    id: 'wf_basic',
    version: 1,
    name: 'Basic',
    initialStateId: 'todo',
    states: [{ id: 'todo', name: 'To do', category: 'open' }],
    transitions: [],
    ...overrides,
  };
}

/**
 * 13.595 (unit half, Ruling 42) — `startTargetFor` joins a `ListRow` to its
 * workflow's `initialStateId` through the workspace's own `TicketTypeDef[]`,
 * answering `null` for either gap rather than throwing. See
 * `backlog-start.ts`'s own docblock for why the ruling's one-line spelling
 * was split into two steps.
 */
describe('13.595 startTargetFor resolves a Backlog row\'s Start target', () => {
  it('known type + known def → the definition\'s initialStateId', () => {
    const defs = new Map([['wf_basic', workflowDef()]]);
    expect(startTargetFor(row({ typeId: 'task' }), [typeDef()], defs)).toBe('todo');
  });

  it('unknown type (absent from the workspace\'s own TicketTypeDef[]) → null', () => {
    const defs = new Map([['wf_basic', workflowDef()]]);
    expect(startTargetFor(row({ typeId: 'epic' }), [typeDef()], defs)).toBeNull();
  });

  it('known type, but its workflow\'s def has not (yet) arrived → null, not a throw', () => {
    const defs = new Map<string, WorkflowDef>();
    expect(startTargetFor(row({ typeId: 'task' }), [typeDef()], defs)).toBeNull();
  });
});
