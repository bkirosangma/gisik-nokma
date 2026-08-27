import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  membershipId,
  type EntityState,
  type MembershipState,
  type TicketState,
} from '../src/entity-state.js';

describe('membershipId', () => {
  it('is the workspace and user joined with a colon — the cross-plan convention', () => {
    expect(membershipId('ws_1', 'user_a')).toBe('ws_1:user_a');
  });
});

describe('entity state shapes', () => {
  it('a ticket state narrows from the union by its kind', () => {
    const ticket: TicketState = {
      kind: 'ticket',
      id: 't1',
      workspaceId: 'ws_1',
      projectId: 'prj_1',
      typeId: 'task',
      parentId: null,
      workflowId: 'wf_basic',
      workflowVersion: 1,
      stateId: 'todo',
      stateCategory: 'open',
      assigneeId: null,
      collaboratorIds: [],
      fields: {},
      transitions: [],
    };
    const entity: EntityState = ticket;
    if (entity.kind === 'ticket') {
      expectTypeOf(entity).toEqualTypeOf<TicketState>();
    }
    expect(entity.kind).toBe('ticket');
  });

  it('a membership carries the workspace role', () => {
    const membership: MembershipState = {
      kind: 'membership',
      id: 'ws_1:user_a',
      workspaceId: 'ws_1',
      userId: 'user_a',
      role: 'member',
    };
    expect(membership.role).toBe('member');
  });

  it('a transition log entry names the workflow and version its state id is written in', () => {
    // The two workflow members are what keep four-eyes armed across a version
    // bump and across a workflow migration; a log entry without them is an
    // entry the evaluator cannot place in any vocabulary.
    const entry: TicketState['transitions'][number] = {
      toStateId: 'review',
      actorId: 'user_a',
      seq: 4,
      workflowId: 'wf_basic',
      workflowVersion: 2,
    };
    // The annotation above is half the assertion — typecheck covers test/, so
    // an entry type that lost either workflow member would fail the build here
    // on the excess property. This is the other half, for a reader.
    expect(Object.keys(entry).sort()).toEqual([
      'actorId',
      'seq',
      'toStateId',
      'workflowId',
      'workflowVersion',
    ]);
  });
});
