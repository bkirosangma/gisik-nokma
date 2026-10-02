import { HttpError } from '../../src/http-client.js';
import type { Session } from '../../src/session.js';

// definition-admin helpers (T12): one `get` that answers every route the five tools read.
const SWEEP_WORKFLOW = {
  id: '01J0WF000000000000000000AA',
  version: 1,
  name: 'Flow',
  initialStateId: 'open',
  states: [{ id: 'open', name: 'Open', category: 'open' }],
  transitions: [],
};
const SWEEP_TYPE = { id: 'ty2', name: 'Type two', icon: 'tag', rank: 2, workflowId: 'wf', fields: [] };
const definitionsGet: Session['get'] = async (path) => {
  if (path === '/v1/me/workspaces') {
    return { workspaces: [{ workspaceId: 'w', name: 'W', prefix: 'W', role: 'owner', archived: false, projects: [] }] };
  }
  if (path.includes('/workflows/')) throw new HttpError(404, {});
  return { ticketTypes: [{ id: 'ty', name: 'Type', icon: 'tag', rank: 1, workflowId: 'a', fields: [] }], counts: {}, count: 0, key: 'K-1', ticket: { resolved_mode: 'workspace' } };
};

/** One entry per tool: valid arguments for the 14.88 sweep, and optionally a session override for that tool. */
export type SweepEntry = { args: Record<string, unknown>; session?: Partial<Session> };

/**
 * Every tool's arguments, valid, so a sweep can drive every handler. Same module blocks, same order, as
 * `tool-names.ts`; a lane edits ONLY between its own `begin`/`end` comments (MCP-everything T3).
 */
/** The ticket-detail answer the T9 sweep entries read (`key`, `title`, a rank, a workflow). */
const TICKET_DETAIL = { key: 'W-1', title: 'A ticket', ticketState: { fields: {}, rank: 'm', workflowId: 'wf' }, rollup: null };

export const SWEEP: Record<string, SweepEntry> = {
  // read begin
  search: { args: { workspaceId: 'w', query: 'q' } },
  search_tickets: { args: { workspaceId: 'w', query: 'q' } },
  list_tickets: { args: { projectId: 'p' } },
  get_ticket: { args: { workspaceId: 'w', ticketId: 't' } },
  list_members: { args: { workspaceId: 'w' } },
  // read end
  create_ticket: { args: { workspaceId: 'w', projectId: 'p', typeId: 'ty', title: 'A ticket' } },
  transition_ticket: { args: { workspaceId: 'w', ticketId: 't', to: 'done' } },
  add_comment: { args: { workspaceId: 'w', ticketId: 't', text: 'hello' } },
  assign_ticket: { args: { workspaceId: 'w', ticketId: 't', assigneeId: null } },
  list_workspaces: { args: {} },
  get_workspace: { args: { workspaceId: 'w' } },
  create_workspace: { args: { name: 'X' } },
  rename_workspace: { args: { workspaceId: 'w', name: 'Y' } },
  archive_workspace: { args: { workspaceId: 'w', confirm_name: 'W' } },
  restore_workspace: { args: { workspaceId: 'w' } },
  delete_workspace: { args: { workspaceId: 'w', confirm_name: 'W' } },
  undelete_workspace: { args: { workspaceId: 'w' } },
  list_projects: { args: { workspaceId: 'w' } },
  get_project: { args: { projectId: 'p' } },
  create_project: { args: { workspaceId: 'w', name: 'X' } },
  update_project: { args: { projectId: 'p', name: 'Y' } },
  archive_project: { args: { projectId: 'p', confirm_name: 'P' } },
  restore_project: { args: { projectId: 'p' } },
  delete_project: { args: { projectId: 'p', confirm_name: 'P' } },
  undelete_project: { args: { projectId: 'p' } },
  // comment begin (T6)
  list_comments: { args: { workspaceId: 'w', ticketId: 't' }, session: { get: async () => ({ comments: [] }) } },
  edit_comment: { args: { workspaceId: 'w', ticketId: 't', commentId: 'c', markdown: 'x' } },
  delete_comment: { args: { workspaceId: 'w', ticketId: 't', commentId: 'c' } },
  // comment end
  // note begin (T7)
  // note end
  // attachment begin (T8)
  // attachment end
  // ticket begin (T9)
  update_ticket: { args: { workspaceId: 'w', ticketId: 't', title: 'Renamed' } },
  close_ticket: { args: { workspaceId: 'w', ticketId: 't' } },
  reopen_ticket: { args: { workspaceId: 'w', ticketId: 't' } },
  delete_ticket: { args: { workspaceId: 'w', ticketId: 't', confirm_name: 'W-1' }, session: { get: async () => TICKET_DETAIL } },
  restore_ticket: { args: { workspaceId: 'w', ticketId: 't' } },
  get_ticket_history: { args: { ticketId: 't' }, session: { get: async () => ({ ticketId: 't', events: [] }) } },
  rank_ticket: { args: { workspaceId: 'w', ticketId: 't', after: 'n' }, session: { get: async () => TICKET_DETAIL } },
  // ticket end
  // discovery begin (T10)
  list_ticket_types: { args: { workspaceId: 'w' }, session: { get: async () => ({ ticketTypes: [] }) } },
  list_workflows: { args: { workspaceId: 'w' }, session: { get: async () => ({ workflows: [] }) } },
  my_work: { args: { workspaceId: 'w' } },
  get_attention: { args: { workspaceId: 'w' } },
  list_notifications: { args: {}, session: { get: async () => ({ notifications: [], nextCursor: null }) } },
  mark_notifications_read: { args: { all: true }, session: { get: async () => ({ notifications: [], nextCursor: null }) } },
  list_my_invitations: { args: {}, session: { get: async () => ({ invitations: [] }) } },
  respond_to_invitation: { args: { inviteId: 'i', answer: 'accept' } },
  // discovery end
  // member-admin begin (T11)
  // No `confirm_name`: each answers its preview, which is all the stdout sweep needs from a write.
  manage_members: { args: { workspaceId: 'w', action: 'change_role', userId: 'u', role: 'admin' }, session: { get: async (path) => (path.endsWith('/members') ? { members: [{ userId: 'u', displayName: 'U', role: 'member' }] } : { workspaces: [{ workspaceId: 'w', name: 'W', prefix: 'W', role: 'owner', archived: false, projects: [] }] }) } },
  change_prefix: { args: { workspaceId: 'w', prefix: 'ZZ' } },
  manage_groups: { args: { workspaceId: 'w', action: 'list' }, session: { get: async () => ({ groups: [] }) } },
  // member-admin end
  // definition-admin begin (T12)
  define_workflow: { args: { workspaceId: 'w', definition: SWEEP_WORKFLOW, confirm_name: 'W' }, session: { get: definitionsGet } },
  define_ticket_type: { args: { workspaceId: 'w', definition: SWEEP_TYPE, confirm_name: 'W' }, session: { get: definitionsGet } },
  migrate_ticket_type: {
    args: { workspaceId: 'w', typeId: 'ty', fromWorkflowId: 'a', toWorkflowId: 'b', stateMap: { open: 'open' }, confirm_name: 'Type' },
    session: { get: definitionsGet },
  },
  set_visibility: { args: { workspaceId: 'w', ticketId: 't', mode: 'project', confirm_name: 'K-1' }, session: { get: definitionsGet } },
  update_workspace_settings: { args: { workspaceId: 'w', staleDays: 9, confirm_name: 'W' }, session: { get: definitionsGet } },
  // definition-admin end
  // trash begin (T13)
  list_deleted: { args: {} },
  // trash end
};
