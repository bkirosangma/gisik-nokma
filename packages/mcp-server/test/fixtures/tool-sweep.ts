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
export const SWEEP: Record<string, SweepEntry> = {
  // read begin
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
  // comment end
  // note begin (T7)
  // note end
  // attachment begin (T8)
  // attachment end
  // ticket begin (T9)
  // ticket end
  // discovery begin (T10)
  // discovery end
  // member-admin begin (T11)
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
  // trash end
};
