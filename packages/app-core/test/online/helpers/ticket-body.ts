/**
 * The smallest `GET /v1/workspaces/:w/tickets/:id` body `mapTicketRead` accepts (drafts T8, case 28.151). The shape is
 * `mappers.test.ts`'s `ticketReadBody` (whose positional signature its many call sites rely on, so it stays where it
 * is); this one takes overrides by name and deep-merges `ticketState`.
 */
export function ticketBody(overrides: { key?: unknown; ticketState?: Record<string, unknown> } = {}): Record<string, unknown> {
  return {
    ticket: { ticket_id: '01J9GTKA000000000000000000', own_mode: 'inherit', resolved_mode: 'project', seq: 4 },
    ticketState: {
      kind: 'ticket',
      id: '01J9GTKA000000000000000000',
      workspaceId: '01J9GWS0000000000000000000',
      projectId: '01J9GPRJ000000000000000000',
      typeId: 'task',
      parentId: null,
      workflowId: 'wf-errand',
      workflowVersion: 2,
      stateId: 'backlog',
      stateCategory: 'open',
      assigneeId: null,
      collaboratorIds: [],
      fields: {},
      transitions: [],
      closed: null,
      rank: null,
      reopenedAt: null,
      deleted: null,
      ...overrides.ticketState,
    },
    title: 'Pave the lane',
    stateProvenance: { actorId: 'u1', clientTime: '2026-10-03T08:00:00.000Z', serverTime: '2026-10-03T08:00:00.000Z', cause: null },
    assignedProvenance: null,
    parent: null,
    rollup: null,
    key: overrides.key === undefined ? null : overrides.key,
    epic: null,
  };
}
