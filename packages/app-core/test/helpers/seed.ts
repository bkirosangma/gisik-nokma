import { newUlid, type SubmittedEvent, type TicketState, type WorkflowDef } from '@gisik-nokma/domain';
import type {
  BoardCard,
  ClaimProvenance,
  ContestedClaimProvenance,
  ListRow,
} from '../../src/view-types.js';

export const WS = '01J9GWS0000000000000000000';
export const PROJECT = '01J9GPRJ000000000000000000';
export const PARENT = '01J9GPAR000000000000000000';
export const TICKET = '01J9GTKA000000000000000000';

/** An errand workflow with a blocked active state (amendment 9's flag). */
export const WF_ERRAND: WorkflowDef = {
  id: 'wf-errand',
  version: 1,
  name: 'Errand',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'waiting', name: 'Waiting on counterparty', category: 'active', blocked: true },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'todo', rules: [] },
    { from: 'todo', to: 'doing', rules: [] },
    { from: 'doing', to: 'waiting', rules: [] },
    { from: 'waiting', to: 'doing', rules: [] },
    { from: 'doing', to: 'done', rules: [{ kind: 'require-comment' }] },
    { from: 'done', to: 'doing', rules: [] },
  ],
};

export function claim(overrides: Partial<ClaimProvenance> = {}): ClaimProvenance {
  return {
    actorId: 'user_anselma',
    actorName: 'Anselma Marak',
    clientTime: '2026-08-19T09:58:12.000Z',
    serverTime: '2026-08-19T10:00:00.000Z',
    ...overrides,
  };
}

/**
 * A REFUSED claim's provenance (ruling P39) — deliberately not `claim()`.
 *
 * `ContestedClaimProvenance` is not a `ClaimProvenance`: no `actorName`, because
 * nothing resolves a refused claim's actor through the roster, and no
 * `serverTime`, because the claim was refused at the door and never stamped.
 * `contestedAt` is the CONTEST event's instant, which is a different event's
 * clock and is named for that.
 *
 * A separate helper rather than an override of `claim()` on purpose: sharing one
 * would let a fixture hand a `serverTime` to a shape that must not have one, and
 * the whole point of the type is that the two are not interchangeable.
 */
export function contestedClaim(
  overrides: Partial<ContestedClaimProvenance> = {},
): ContestedClaimProvenance {
  return {
    actorId: 'user_anselma',
    clientTime: '2026-08-19T09:58:12.000Z',
    contestedAt: '2026-08-19T10:00:00.000Z',
    ...overrides,
  };
}

export function boardCardSeed(overrides: Partial<BoardCard> = {}): BoardCard {
  return {
    ticketId: TICKET,
    title: 'File the GST return',
    typeId: 'task',
    assignee: { id: 'user_anselma', name: 'Anselma Marak' },
    stateProvenance: claim(),
    cause: null,
    rollup: null,
    pending: false,
    ...overrides,
  };
}

export function listRowSeed(overrides: Partial<ListRow> = {}): ListRow {
  return {
    ticketId: newUlid(),
    title: 'File the GST return',
    typeId: 'task',
    typeRank: 3,
    parentId: null,
    epicId: null,
    stateId: 'todo',
    stateName: 'To do',
    stateCategory: 'open',
    stateProvenance: claim(),
    assignee: null,
    assignedProvenance: null,
    dueDate: null,
    fields: {},
    rollup: null,
    hasRestrictedParent: false,
    // Same default as `boardCardSeed` above and the same meaning: a seeded row
    // is settled fact unless a case says otherwise.
    pending: false,
    // REQUIRED since backlog/closed spec §1.2 (2026-09-17); `null` is the same
    // "never closed, or reopened" default `serverCard()` in mappers.test.ts uses.
    closed: null,
    ...overrides,
  };
}

export function ticketStateSeed(overrides: Partial<TicketState> = {}): TicketState {
  return {
    kind: 'ticket',
    id: TICKET,
    workspaceId: WS,
    projectId: PROJECT,
    typeId: 'task',
    parentId: null,
    workflowId: 'wf-errand',
    workflowVersion: 1,
    stateId: 'doing',
    stateCategory: 'active',
    assigneeId: 'user_anselma',
    collaboratorIds: [],
    fields: {
      title: { value: 'File the GST return', actorId: 'user_kiro', clientTime: '2026-08-18T08:00:00.000Z', serverTime: '2026-08-18T08:00:01.000Z' },
    },
    // `workflowId` per entry is required by the SHIPPED TicketState
    // (packages/domain/src/entity-state.ts): an entry's workflowId +
    // workflowVersion name the vocabulary its toStateId is written in, which
    // is what lets four-eyes skip entries from a different workflow. The plan
    // text predates that field.
    transitions: [
      { toStateId: 'doing', actorId: 'user_anselma', seq: 3, workflowId: 'wf-errand', workflowVersion: 1 },
    ],
    ...overrides,
  };
}

export function submittedTicketCreated(overrides: Partial<SubmittedEvent> = {}): SubmittedEvent {
  const ticketId = newUlid();
  return {
    id: newUlid(),
    workspaceId: WS,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.created',
    version: 1,
    payload: { typeId: 'task', projectId: PROJECT, parentId: null, title: 'New errand' },
    actorId: 'user_kiro',
    origin: 'web',
    clientTime: '2026-08-20T08:59:00.000Z',
    ...overrides,
  };
}
