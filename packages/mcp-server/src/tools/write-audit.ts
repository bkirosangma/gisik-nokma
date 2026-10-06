/**
 * The D2 audit's manifest (Knowledge Graph spec D §6 D2, §7 case 8; KG-D Task 7): every MCP tool is classified
 * here exactly once, as a write tool with its audit row or as a read-only tool. A write must be VISIBLE (History
 * renders each event it posts, and an app surface shows the result), ATTRIBUTED (History's actor line reads
 * "Assistant, for <name>" for an `origin: 'mcp'` event, `attributionLabel` in app-core) and REMOVABLE (a member has an
 * event to undo it).
 *
 * Checked by `packages/mcp-server/test/d2-audit.test.ts` (27.515–27.516: classification; under the 14.88 sweep a
 * read-only tool writes nothing and a write tool posts only its declared events; each tool's source block quotes
 * exactly its `events`) and `apps/server/test/mcp/d2-audit.test.ts` (27.517–27.518: history, surface and remove
 * against the frozen ratchet `KNOWN_D2_GAPS`; every declared type is registered).
 *
 * A plan that adds an MCP tool, or a new event path to one, adds or edits its row here in the same PR.
 */

export type D2Leg = 'history' | 'surface' | 'remove';

export type WriteAudit = {
  /** Every event type the tool can submit (read from its module: each envelopeFor/ev call). */
  events: readonly string[];
  /** Where a member sees the result in the app: a repo-relative file and a literal that file must contain. */
  surface: { file: string; marker: string } | null;
  /** The event type a MEMBER submits to undo it, or null. */
  remove: string | null;
};

const SHEET = 'packages/app-core/src/views/ticket-sheet.tsx';
const LIST = 'packages/app-core/src/views/ticket-list.tsx';
const COMMENTS = 'packages/app-core/src/views/comments-thread.tsx';
const DELETED = 'packages/app-core/src/account/deleted-items-section.tsx';
const WORKSPACES = 'apps/web/app/workspaces/page.tsx';
const WORKSPACE = 'apps/web/app/w/[workspaceId]/page.tsx';
const NOTE_ROW = 'apps/web/src/notes/note-row.tsx';
const KG = 'packages/app-core/src/views/concept-inspector.tsx'; // Task 8 creates it; the KG view mounts it through renderConceptPanel
const ROW = 'packages/app-core/src/views/concepts-row.tsx';

/**
 * One row per write tool, in `allTools` order. `events` lists EVERY type the tool can post, on every path (27.516
 * holds it to the module's source), so History is judged on all of them. `surface` and `remove` judge the tool's
 * PRIMARY act (the one its name says; the create for a `manage_*` tool), as the plan's D rows do: a path with no
 * surface or no member undo of its own is named in a comment on its row, not in the ratchet. A route-only tool
 * (`events: []`: the server writes the event, not the tool) passes `history` by having nothing to judge.
 * Each marker is a className or JSX literal in rendered code, never a comment.
 */
export const MCP_WRITE_AUDIT: Readonly<Record<string, WriteAudit>> = {
  create_ticket: { events: ['ticket.created'], surface: { file: LIST, marker: 'gn-list__key' }, remove: 'ticket.deleted' }, // the Backlog list (the default); a started ticket is a board card
  transition_ticket: { events: ['ticket.transitioned'], surface: { file: SHEET, marker: 'gn-ticket-sheet__state' }, remove: 'ticket.transitioned' },
  add_comment: { events: ['comment.added'], surface: { file: COMMENTS, marker: 'gn-comment__body' }, remove: 'comment.deleted' },
  assign_ticket: { events: ['ticket.assigned'], surface: { file: SHEET, marker: 'data-testid="field-assignee"' }, remove: 'ticket.assigned' },
  // Route-only (POST /v1/workspaces): the server writes workspace.created, which History does not render.
  create_workspace: { events: [], surface: { file: WORKSPACES, marker: 'gn-workspace-card__door' }, remove: 'workspace.deleted' },
  rename_workspace: { events: ['workspace.renamed'], surface: { file: WORKSPACE, marker: 'gn-workspace-home__title-row' }, remove: 'workspace.renamed' },
  archive_workspace: { events: ['workspace.archived'], surface: { file: WORKSPACES, marker: 'gn-workspace-list--archived' }, remove: 'workspace.restored' },
  restore_workspace: { events: ['workspace.restored'], surface: { file: WORKSPACES, marker: '<ul className="gn-workspace-list">' }, remove: 'workspace.archived' }, // the live list, not the archived one
  delete_workspace: { events: ['workspace.deleted'], surface: { file: DELETED, marker: 'gn-deleted-items__row' }, remove: 'workspace.undeleted' },
  undelete_workspace: { events: ['workspace.undeleted'], surface: { file: WORKSPACES, marker: 'gn-workspace-card__door' }, remove: 'workspace.deleted' },
  // project.deleted undoes both halves; the app never submits project.member_removed.
  create_project: { events: ['project.created', 'project.member_added'], surface: { file: WORKSPACE, marker: 'gn-project-card__name' }, remove: 'project.deleted' },
  update_project: { events: ['project.updated'], surface: { file: WORKSPACE, marker: 'gn-project-card__name' }, remove: 'project.updated' },
  archive_project: { events: ['project.archived'], surface: { file: WORKSPACE, marker: 'gn-project-card--archived' }, remove: 'project.restored' },
  restore_project: { events: ['project.restored'], surface: { file: WORKSPACE, marker: 'gn-project-card__name' }, remove: 'project.archived' },
  delete_project: { events: ['project.deleted'], surface: { file: DELETED, marker: 'gn-deleted-items__row' }, remove: 'project.undeleted' },
  undelete_project: { events: ['project.undeleted'], surface: { file: WORKSPACE, marker: 'gn-project-card__name' }, remove: 'project.deleted' },
  edit_comment: { events: ['comment.edited'], surface: { file: COMMENTS, marker: 'gn-comment__edited' }, remove: 'comment.edited' },
  // No comment.restored: "Comment deleted" is permanent.
  delete_comment: { events: ['comment.deleted'], surface: { file: COMMENTS, marker: 'gn-comment__deleted' }, remove: null },
  create_note: { events: ['note.created'], surface: { file: NOTE_ROW, marker: 'gn-notes__row-title' }, remove: 'note.deleted' },
  // Primary: the body (title: note.renamed; scope: note.scope_set, each its own undo). The `projectId` path (note.moved) has no undo: the app never submits note.moved.
  update_note: { events: ['note.renamed', 'note.body_set', 'note.scope_set', 'note.moved'], surface: { file: 'apps/web/src/notes/note-document.tsx', marker: 'gn-notes__editor' }, remove: 'note.body_set' },
  link_note: { events: ['note.attached', 'note.detached'], surface: { file: 'packages/app-core/src/views/ticket-notes-section.tsx', marker: 'gn-ticket-sheet__note-badges' }, remove: 'note.detached' },
  delete_note: { events: ['note.deleted'], surface: { file: 'apps/web/src/notes/workspace-notes-section.tsx', marker: 'gn-notes__deleted' }, remove: 'note.restored' },
  restore_note: { events: ['note.restored'], surface: { file: NOTE_ROW, marker: 'gn-notes__row-title' }, remove: 'note.deleted' },
  // A ticket upload (attachment.added) has no removal event; a note image is a note.body_set, which History does not render.
  add_attachment: { events: ['attachment.added', 'note.body_set'], surface: { file: 'packages/app-core/src/views/attachment-list.tsx', marker: 'gn-attachment--upload' }, remove: null },
  // Primary: the fields. The parentId, add/removeCollaborators and workflow paths have no member undo (the app never
  // submits ticket.reparented, ticket.collaborator_* or ticket.workflow_rebound), and collaborators show only in History.
  update_ticket: {
    events: ['ticket.field_set', 'ticket.reparented', 'ticket.collaborator_added', 'ticket.collaborator_removed', 'ticket.workflow_rebound'],
    surface: { file: SHEET, marker: 'gn-ticket-sheet__claim' },
    remove: 'ticket.field_set',
  },
  // The optional comment is a comment.added like add_comment's (undo: comment.deleted).
  close_ticket: { events: ['comment.added', 'ticket.closed'], surface: { file: SHEET, marker: 'gn-sheet__closed-note' }, remove: 'ticket.reopened' },
  reopen_ticket: { events: ['comment.added', 'ticket.reopened'], surface: { file: SHEET, marker: 'gn-ticket-sheet__state' }, remove: 'ticket.closed' },
  delete_ticket: { events: ['ticket.deleted'], surface: { file: DELETED, marker: 'gn-deleted-items__row' }, remove: 'ticket.restored' },
  restore_ticket: { events: ['ticket.restored'], surface: { file: LIST, marker: 'gn-list__key' }, remove: 'ticket.deleted' },
  rank_ticket: { events: ['ticket.ranked'], surface: { file: 'apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx', marker: 'rows={backlogRows}' }, remove: 'ticket.ranked' }, // the Backlog list's order
  link_tickets: { events: ['ticket.link_added', 'ticket.link_removed'], surface: { file: 'packages/app-core/src/views/ticket-links-section.tsx', marker: 'gn-ticket-sheet__link-row' }, remove: 'ticket.link_removed' },
  // Route-only (POST /v1/me/notifications/read). Marking unread again is the same route with read:false, no event.
  mark_notifications_read: { events: [], surface: { file: 'packages/app-core/src/inbox/inbox-view.tsx', marker: 'gn-inbox__dot' }, remove: null },
  // Route-only (POST /v1/me/invitations/:id/accept|decline). A member cannot leave a workspace; only an admin removes them, through a route.
  respond_to_invitation: { events: [], surface: { file: WORKSPACES, marker: 'gn-workspace-card__door' }, remove: null },
  // Primary: invite (a route; the server writes invite.sent, which History does not render). change_role undoes with
  // membership.granted; remove (a route), revoke_invite and the project paths have no member event to undo them.
  manage_members: {
    events: ['invite.revoked', 'membership.granted', 'project.member_added', 'project.member_removed'],
    surface: { file: 'apps/web/app/w/[workspaceId]/members/page.tsx', marker: 'gn-invite-pending__row' },
    remove: 'invite.revoked',
  },
  // The project path is project.updated { prefix } (undo: the same). Every ticket key carries the prefix.
  change_prefix: { events: ['workspace.prefix_changed', 'project.updated'], surface: { file: LIST, marker: 'gn-list__key' }, remove: 'workspace.prefix_changed' },
  // Primary: create. rename / reorder / file_project undo with their own events; a delete cannot be undone.
  manage_groups: {
    events: ['group.created', 'project.updated', 'group.renamed', 'group.deleted', 'group.reordered'],
    surface: { file: 'apps/web/src/settings/groups-tree.tsx', marker: 'gn-groups__node' },
    remove: 'group.deleted',
  },
  // Undone by publishing the previous version; a new workflow or type cannot be deleted or archived.
  define_workflow: { events: ['workflow.defined'], surface: { file: 'packages/app-core/src/workflow-builder/ui/workflow-list-screen.tsx', marker: 'workflow-list__card' }, remove: 'workflow.defined' },
  define_ticket_type: { events: ['ticket-type.defined'], surface: { file: 'packages/app-core/src/workflow-builder/ticket-types/ticket-type-list-screen.tsx', marker: 'ticket-type-list__row' }, remove: 'ticket-type.defined' },
  // Route-only (POST …/ticket-types/:id/migrate); migrating back is the same route.
  migrate_ticket_type: { events: [], surface: { file: 'packages/app-core/src/workflow-builder/ticket-types/ticket-type-list-screen.tsx', marker: 'ticket-type-list__workflow' }, remove: null },
  set_visibility: { events: ['visibility.set'], surface: { file: 'packages/app-core/src/views/visibility-editor.tsx', marker: 'gn-visibility__standing-claim' }, remove: 'visibility.set' },
  update_workspace_settings: { events: ['workspace.settings_set'], surface: { file: 'apps/web/src/workspace-settings-form.tsx', marker: 'gn-workspace-settings__fields' }, remove: 'workspace.settings_set' },
  // KG-D: the plan's D rows. manage_concept's merge also tags the items into `intoId` (concept.item_tagged).
  manage_concept: {
    events: ['concept.created', 'concept.renamed', 'concept.described', 'concept.item_tagged', 'concept.merged', 'concept.deleted'],
    surface: { file: KG, marker: 'gn-kg-concept-inspector' },
    remove: 'concept.deleted',
  },
  tag_items: { events: ['concept.item_tagged', 'concept.item_untagged'], surface: { file: ROW, marker: 'Remove from concept' }, remove: 'concept.item_untagged' },
  link_concepts: { events: ['concept.linked', 'concept.unlinked'], surface: { file: KG, marker: 'gn-kg-concept-links' }, remove: 'concept.unlinked' },
  resolve_suggestion: {
    events: ['concept.created', 'concept.item_tagged', 'workspace.concept_suggestion_rejected'],
    surface: { file: KG, marker: 'gn-kg-concept-inspector' },
    remove: 'concept.deleted',
  },
};

/** Every other tool, in `allTools` order: the reads, `similar`, the concept reads, `review_suggestions` and the three graph tools. */
export const MCP_READ_ONLY_TOOLS: readonly string[] = [
  'search', 'search_tickets', 'list_tickets', 'get_ticket', 'list_members',
  'list_workspaces', 'get_workspace',
  'list_projects', 'get_project',
  'list_comments',
  'list_notes', 'get_note', 'get_note_history',
  'list_attachments', 'get_attachment',
  'get_ticket_history',
  'list_ticket_types', 'list_workflows', 'my_work', 'get_attention', 'list_notifications', 'list_my_invitations',
  'list_deleted',
  'graph_neighbours', 'graph_path', 'graph_trace', 'similar',
  'list_concepts', 'get_concept', 'review_suggestions',
];

/**
 * THE FROZEN RATCHET (KG-D T7, decision G1): today's write tools do not all meet D2, for reasons this audit does
 * not own. Each entry is a tool and the legs it fails, exactly as 27.517 computes them. A new failure reds the test,
 * and so does a fixed gap still listed here: remove it. This list only shrinks.
 */
export const KNOWN_D2_GAPS: Readonly<Record<string, { missing: readonly D2Leg[]; why: string }>> = {
  rename_workspace: { missing: ['history'], why: 'Workspace events have no History renderer: describeEvent renders ticket history only (history-copy.ts).' },
  archive_workspace: { missing: ['history'], why: 'Workspace events have no History renderer: describeEvent renders ticket history only (history-copy.ts).' },
  restore_workspace: { missing: ['history'], why: 'Workspace events have no History renderer: describeEvent renders ticket history only (history-copy.ts).' },
  delete_workspace: { missing: ['history'], why: 'Workspace events have no History renderer: describeEvent renders ticket history only (history-copy.ts).' },
  undelete_workspace: { missing: ['history'], why: 'Workspace events have no History renderer: describeEvent renders ticket history only (history-copy.ts).' },
  create_project: { missing: ['history'], why: 'Project events have no History renderer: describeEvent renders ticket history only (history-copy.ts).' },
  update_project: { missing: ['history'], why: 'Project events have no History renderer: describeEvent renders ticket history only (history-copy.ts).' },
  archive_project: { missing: ['history'], why: 'Project events have no History renderer: describeEvent renders ticket history only (history-copy.ts).' },
  restore_project: { missing: ['history'], why: 'Project events have no History renderer: describeEvent renders ticket history only (history-copy.ts).' },
  delete_project: { missing: ['history'], why: 'Project events have no History renderer: describeEvent renders ticket history only (history-copy.ts).' },
  undelete_project: { missing: ['history'], why: 'Project events have no History renderer: describeEvent renders ticket history only (history-copy.ts).' },
  delete_comment: { missing: ['remove'], why: 'No comment.restored is registered: a deleted comment cannot be brought back.' },
  create_note: { missing: ['history'], why: 'Note events have no History renderer: the note history panel lists body versions only (apps/web/src/notes/history-panel.tsx).' },
  update_note: { missing: ['history'], why: 'Note events have no History renderer: the note history panel lists body versions only (apps/web/src/notes/history-panel.tsx).' },
  link_note: { missing: ['history'], why: 'Note events have no History renderer: the note history panel lists body versions only (apps/web/src/notes/history-panel.tsx).' },
  delete_note: { missing: ['history'], why: 'Note events have no History renderer: the note history panel lists body versions only (apps/web/src/notes/history-panel.tsx).' },
  restore_note: { missing: ['history'], why: 'Note events have no History renderer: the note history panel lists body versions only (apps/web/src/notes/history-panel.tsx).' },
  add_attachment: { missing: ['history', 'remove'], why: 'A note image is a note.body_set, which History does not render; a ticket upload has no removal event (only attachment.added is registered).' },
  mark_notifications_read: { missing: ['remove'], why: 'Route-only: marking unread again is the same route with read:false, which writes no event.' },
  respond_to_invitation: { missing: ['remove'], why: 'Route-only: a member cannot leave a workspace; only an admin removes them, through a route.' },
  manage_members: { missing: ['history'], why: 'Invite, membership and project-member events have no History renderer (describeEvent renders ticket history only).' },
  change_prefix: { missing: ['history'], why: 'Workspace events have no History renderer: describeEvent renders ticket history only (history-copy.ts).' },
  manage_groups: { missing: ['history'], why: 'Group events and project.updated have no History renderer (describeEvent renders ticket history only).' },
  define_workflow: { missing: ['history'], why: 'Definition events have no History renderer (describeEvent renders ticket history only).' },
  define_ticket_type: { missing: ['history'], why: 'Definition events have no History renderer (describeEvent renders ticket history only).' },
  migrate_ticket_type: { missing: ['remove'], why: 'Route-only: migrating back is the same route, which writes no event a member submits.' },
  update_workspace_settings: { missing: ['history'], why: 'Workspace events have no History renderer: describeEvent renders ticket history only (history-copy.ts).' },
  manage_concept: { missing: ['surface'], why: 'No app surface until KG-D Task 8 creates the concept inspector (concept-inspector.tsx).' },
  tag_items: { missing: ['surface'], why: 'No app surface until KG-D Task 9 creates the Concepts row (concepts-row.tsx).' },
  link_concepts: { missing: ['surface'], why: 'No app surface until KG-D Task 8 creates the concept inspector (concept-inspector.tsx).' },
  resolve_suggestion: { missing: ['surface'], why: 'No app surface until KG-D Task 8 creates the concept inspector (concept-inspector.tsx).' },
};
