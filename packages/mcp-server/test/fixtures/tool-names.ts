/**
 * THE literal pin of every MCP tool, in `allTools` order (MCP-everything T3). One block per module; a
 * lane edits ONLY the lines between its own `begin`/`end` comments, so parallel lanes never touch the same
 * hunk. `register.test.ts` (14.80/14.81) and `exports.test.ts` read `TOOL_NAMES`; the hosted tests compare
 * against `allTools`, which this pin already holds to the literal.
 */
export const TOOL_NAMES_BY_MODULE = {
  read: [
    // read begin
    'search', 'search_tickets', 'list_tickets', 'get_ticket', 'list_members',
    // read end
  ],
  write: ['create_ticket', 'transition_ticket', 'add_comment', 'assign_ticket'],
  workspace: ['list_workspaces', 'get_workspace', 'create_workspace', 'rename_workspace', 'archive_workspace', 'restore_workspace', 'delete_workspace', 'undelete_workspace'],
  project: ['list_projects', 'get_project', 'create_project', 'update_project', 'archive_project', 'restore_project', 'delete_project', 'undelete_project'],
  comment: [
    // comment begin (T6)
    'list_comments', 'edit_comment', 'delete_comment',
    // comment end
  ],
  note: [
    // note begin (T7)
    'list_notes', 'get_note', 'create_note', 'update_note', 'link_note', 'delete_note', 'restore_note', 'restore_note_version', 'get_note_history',
    // note end
  ],
  attachment: [
    // attachment begin (T8)
    'list_attachments', 'get_attachment', 'add_attachment',
    // attachment end
  ],
  ticket: [
    // ticket begin (T9)
    'update_ticket', 'close_ticket', 'reopen_ticket', 'close_tickets', 'delete_ticket', 'restore_ticket', 'get_ticket_history', 'rank_ticket', 'link_tickets',
    // ticket end
  ],
  discovery: [
    // discovery begin (T10)
    'list_ticket_types', 'list_workflows', 'my_work', 'get_attention',
    'list_notifications', 'mark_notifications_read', 'get_notification_preferences', 'set_notification_preferences', 'list_saved_filters', 'list_my_invitations', 'respond_to_invitation',
    // discovery end
  ],
  memberAdmin: [
    // member-admin begin (T11)
    'manage_members', 'change_prefix', 'manage_groups',
    // member-admin end
  ],
  definitionAdmin: [
    // definition-admin begin (T12)
    'define_workflow',
    'define_ticket_type',
    'migrate_ticket_type',
    'set_visibility',
    'update_workspace_settings',
    // definition-admin end
  ],
  trash: [
    // trash begin (T13)
    'list_deleted',
    // trash end
  ],
  draft: [
    // draft begin (drafts T7)
    'list_my_drafts', 'publish_draft', 'discard_draft',
    // draft end
  ],
  flow: [
    // flow begin (wtg-part5 T1 to T5)
    'set_wait_for_all',
    'get_flow',
    // flow end
  ],
} satisfies Record<string, string[]>;

export const TOOL_NAMES: string[] = Object.values(TOOL_NAMES_BY_MODULE).flat();
