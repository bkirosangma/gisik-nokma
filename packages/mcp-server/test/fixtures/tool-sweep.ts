import type { Session } from '../../src/session.js';

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
  // No `confirm_name`: each answers its preview, which is all the stdout sweep needs from a write.
  manage_members: { args: { workspaceId: 'w', action: 'change_role', userId: 'u', role: 'admin' }, session: { get: async (path) => (path.endsWith('/members') ? { members: [{ userId: 'u', displayName: 'U', role: 'member' }] } : { workspaces: [{ workspaceId: 'w', name: 'W', prefix: 'W', role: 'owner', archived: false, projects: [] }] }) } },
  change_prefix: { args: { workspaceId: 'w', prefix: 'ZZ' } },
  manage_groups: { args: { workspaceId: 'w', action: 'list' }, session: { get: async () => ({ groups: [] }) } },
  // member-admin end
  // definition-admin begin (T12)
  // definition-admin end
  // trash begin (T13)
  // trash end
};
