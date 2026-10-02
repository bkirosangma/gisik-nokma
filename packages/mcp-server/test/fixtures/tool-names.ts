/**
 * THE literal pin of every MCP tool, in `allTools` order (MCP-everything T3). One block per module; a
 * lane edits ONLY the lines between its own `begin`/`end` comments, so parallel lanes never touch the same
 * hunk. `register.test.ts` (14.80/14.81) and `exports.test.ts` read `TOOL_NAMES`; the hosted tests compare
 * against `allTools`, which this pin already holds to the literal.
 */
export const TOOL_NAMES_BY_MODULE = {
  read: [
    // read begin
    'search_tickets', 'list_tickets', 'get_ticket', 'list_members',
    // read end
  ],
  write: ['create_ticket', 'transition_ticket', 'add_comment', 'assign_ticket'],
  workspace: ['list_workspaces', 'get_workspace', 'create_workspace', 'rename_workspace', 'archive_workspace', 'restore_workspace', 'delete_workspace', 'undelete_workspace'],
  project: ['list_projects', 'get_project', 'create_project', 'update_project', 'archive_project', 'restore_project', 'delete_project', 'undelete_project'],
  comment: [
    // comment begin (T6)
    // comment end
  ],
  note: [
    // note begin (T7)
    // note end
  ],
  attachment: [
    // attachment begin (T8)
    // attachment end
  ],
  ticket: [
    // ticket begin (T9)
    // ticket end
  ],
  discovery: [
    // discovery begin (T10)
    // discovery end
  ],
  memberAdmin: [
    // member-admin begin (T11)
    // member-admin end
  ],
  definitionAdmin: [
    // definition-admin begin (T12)
    // definition-admin end
  ],
  trash: [
    // trash begin (T13)
    // trash end
  ],
} satisfies Record<string, string[]>;

export const TOOL_NAMES: string[] = Object.values(TOOL_NAMES_BY_MODULE).flat();
