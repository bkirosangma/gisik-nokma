/**
 * The D2 audit's manifest (Knowledge Graph spec D §6 D2, §7 case 8; KG-D Task 7): every MCP tool is classified
 * here exactly once, as a write tool with its audit row or as a read-only tool. A write must be VISIBLE (History
 * renders each event it posts, and an app surface shows the result), ATTRIBUTED (History's actor line reads
 * "Assistant, for <name>" for an `origin: 'mcp'` event, `attributionLabel` in app-core) and REMOVABLE (a member has an
 * event to undo it).
 *
 * Checked by `packages/mcp-server/test/d2-audit.test.ts` (27.515–27.516: classification; under the 14.88 sweep a
 * read-only tool writes nothing and a write tool posts only its declared events; each tool's source block quotes
 * exactly its `events`; 27.670: each row's events partition into its primary act and its `paths`) and
 * `apps/server/test/mcp/d2-audit.test.ts` (27.517–27.518, 27.671–27.672: history, surface and remove for every tool
 * and every path against the frozen ratchet `KNOWN_D2_GAPS`; every declared event type, and every `remove` of a row
 * or a path, is registered).
 *
 * A plan that adds an MCP tool, or a new event path to one, adds or edits its row (and its `paths`) here in the same PR.
 */

export type D2Leg = 'history' | 'surface' | 'remove';

/** One act the audit judges: a tool's row, or one of its `paths`. */
export type D2Act = {
  /** Every event type the act can submit (read from its module: each envelopeFor/ev call). */
  events: readonly string[];
  /** Where a member sees the result in the app: a repo-relative file and a literal that file must contain. */
  surface: { file: string; marker: string } | null;
  /** The event type a MEMBER submits to undo it, or null. */
  remove: string | null;
};

export type WriteAudit = D2Act & {
  /** With `paths`: the event types the PRIMARY act posts. Without them the row is one act and every event is primary. */
  primary?: readonly string[];
  /**
   * Each other branch of the tool (bar an act pair that undoes itself: see MCP_WRITE_AUDIT), keyed by a short path
   * name, judged by its own `surface` and `remove`. Its `events` are a subset of the row's; each row type belongs to
   * `primary` or to exactly one path (27.670).
   */
  paths?: Readonly<Record<string, D2Act>>;
};

const SHEET = 'packages/app-core/src/views/ticket-sheet.tsx';
const LIST = 'packages/app-core/src/views/ticket-list.tsx';
const COMMENTS = 'packages/app-core/src/views/comments-thread.tsx';
const DELETED = 'packages/app-core/src/account/deleted-items-section.tsx';
const WORKSPACES = 'apps/web/app/workspaces/page.tsx';
const WORKSPACE = 'apps/web/app/w/[workspaceId]/page.tsx';
const NOTE_ROW = 'apps/web/src/notes/note-row.tsx';
const KG = 'packages/app-core/src/views/concept-inspector.tsx'; // Task 8 created it; the KG view mounts it through renderConceptPanel
const ROW = 'packages/app-core/src/views/concepts-row.tsx';
const NOTE_DOC = 'apps/web/src/notes/note-document.tsx';
const MEMBERS = 'apps/web/app/w/[workspaceId]/members/page.tsx';
const GROUPS = 'apps/web/src/settings/groups-tree.tsx';
const WORKFLOWS = 'packages/app-core/src/workflow-builder/ui/workflow-list-screen.tsx';
const TICKET_TYPES = 'packages/app-core/src/workflow-builder/ticket-types/ticket-type-list-screen.tsx';

/**
 * One row per write tool, in `allTools` order. `events` lists EVERY type the tool can post, on every path (27.516
 * holds it to the module's source), so the row's History leg is judged on all of them. The row's `surface` and
 * `remove` judge the tool's primary act (the one its name says; the create for a `manage_*` tool), as the plan's D
 * rows do. Every other branch is a `paths` entry with its own three legs, except an act pair whose two events undo
 * each other (link_note attach/detach, link_tickets add/remove), which the row judges as one act. So a branch's gap is
 * a `<tool>#<path>` key of the ratchet, never a comment. A route-only act (`events: []`: the server writes the event,
 * not the tool) passes `history` by having nothing to judge. Each marker is a className or JSX literal in rendered
 * code, never a comment.
 * The concept rows (KG-D's D rows) keep one act each: Tasks 8–9 own their surfaces.
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
  // One act, two events: project.deleted undoes both halves.
  create_project: { events: ['project.created', 'project.member_added'], surface: { file: WORKSPACE, marker: 'gn-project-card__name' }, remove: 'project.deleted' },
  update_project: { events: ['project.updated'], surface: { file: WORKSPACE, marker: 'gn-project-card__name' }, remove: 'project.updated' },
  archive_project: { events: ['project.archived'], surface: { file: WORKSPACE, marker: 'gn-project-card--archived' }, remove: 'project.restored' },
  restore_project: { events: ['project.restored'], surface: { file: WORKSPACE, marker: 'gn-project-card__name' }, remove: 'project.archived' },
  delete_project: { events: ['project.deleted'], surface: { file: DELETED, marker: 'gn-deleted-items__row' }, remove: 'project.undeleted' },
  undelete_project: { events: ['project.undeleted'], surface: { file: WORKSPACE, marker: 'gn-project-card__name' }, remove: 'project.deleted' },
  edit_comment: { events: ['comment.edited'], surface: { file: COMMENTS, marker: 'gn-comment__edited' }, remove: 'comment.edited' },
  delete_comment: { events: ['comment.deleted'], surface: { file: COMMENTS, marker: 'gn-comment__deleted' }, remove: null },
  create_note: { events: ['note.created'], surface: { file: NOTE_ROW, marker: 'gn-notes__row-title' }, remove: 'note.deleted' },
  // Primary: the body. The `projectId` path moves the note under another project's heading.
  update_note: {
    events: ['note.renamed', 'note.body_set', 'note.scope_set', 'note.moved'],
    surface: { file: NOTE_DOC, marker: 'gn-notes__editor' },
    remove: 'note.body_set',
    primary: ['note.body_set'],
    paths: {
      title: { events: ['note.renamed'], surface: { file: NOTE_ROW, marker: 'gn-notes__row-title' }, remove: 'note.renamed' },
      scope: { events: ['note.scope_set'], surface: { file: 'apps/web/src/notes/scope-editor.tsx', marker: 'gn-notes__scope' }, remove: 'note.scope_set' },
      moved: { events: ['note.moved'], surface: { file: 'apps/web/src/notes/workspace-notes-section.tsx', marker: 'gn-notes__group' }, remove: null },
    },
  },
  link_note: { events: ['note.attached', 'note.detached'], surface: { file: 'packages/app-core/src/views/ticket-notes-section.tsx', marker: 'gn-ticket-sheet__note-badges' }, remove: 'note.detached' },
  delete_note: { events: ['note.deleted'], surface: { file: 'apps/web/src/notes/workspace-notes-section.tsx', marker: 'gn-notes__deleted' }, remove: 'note.restored' },
  restore_note: { events: ['note.restored'], surface: { file: NOTE_ROW, marker: 'gn-notes__row-title' }, remove: 'note.deleted' },
  // Primary: a ticket upload. A note image is spliced into the note's body.
  add_attachment: {
    events: ['attachment.added', 'note.body_set'],
    surface: { file: 'packages/app-core/src/views/attachment-list.tsx', marker: 'gn-attachment--upload' },
    remove: null,
    primary: ['attachment.added'],
    paths: { note: { events: ['note.body_set'], surface: { file: NOTE_DOC, marker: 'gn-notes__editor' }, remove: 'note.body_set' } },
  },
  // Primary: the fields. The other paths are parentId, add/removeCollaborators and workflow (the sheet's state).
  update_ticket: {
    events: ['ticket.field_set', 'ticket.reparented', 'ticket.collaborator_added', 'ticket.collaborator_removed', 'ticket.workflow_rebound'],
    surface: { file: SHEET, marker: 'gn-ticket-sheet__claim' },
    remove: 'ticket.field_set',
    primary: ['ticket.field_set'],
    paths: {
      reparent: { events: ['ticket.reparented'], surface: { file: SHEET, marker: 'gn-ticket-sheet__parent-chip' }, remove: null },
      collaborators: { events: ['ticket.collaborator_added', 'ticket.collaborator_removed'], surface: null, remove: null },
      workflow: { events: ['ticket.workflow_rebound'], surface: { file: SHEET, marker: 'gn-ticket-sheet__state' }, remove: null },
    },
  },
  // The optional comment is a comment.added like add_comment's.
  close_ticket: {
    events: ['comment.added', 'ticket.closed'],
    surface: { file: SHEET, marker: 'gn-sheet__closed-note' },
    remove: 'ticket.reopened',
    primary: ['ticket.closed'],
    paths: { comment: { events: ['comment.added'], surface: { file: COMMENTS, marker: 'gn-comment__body' }, remove: 'comment.deleted' } },
  },
  reopen_ticket: {
    events: ['comment.added', 'ticket.reopened'],
    surface: { file: SHEET, marker: 'gn-ticket-sheet__state' },
    remove: 'ticket.closed',
    primary: ['ticket.reopened'],
    paths: { comment: { events: ['comment.added'], surface: { file: COMMENTS, marker: 'gn-comment__body' }, remove: 'comment.deleted' } },
  },
  delete_ticket: { events: ['ticket.deleted'], surface: { file: DELETED, marker: 'gn-deleted-items__row' }, remove: 'ticket.restored' },
  restore_ticket: { events: ['ticket.restored'], surface: { file: LIST, marker: 'gn-list__key' }, remove: 'ticket.deleted' },
  rank_ticket: { events: ['ticket.ranked'], surface: { file: 'apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx', marker: 'rows={backlogRows}' }, remove: 'ticket.ranked' }, // the Backlog list's order
  link_tickets: { events: ['ticket.link_added', 'ticket.link_removed'], surface: { file: 'packages/app-core/src/views/ticket-links-section.tsx', marker: 'gn-ticket-sheet__link-row' }, remove: 'ticket.link_removed' },
  // Route-only (POST /v1/me/notifications/read).
  mark_notifications_read: { events: [], surface: { file: 'packages/app-core/src/inbox/inbox-view.tsx', marker: 'gn-inbox__dot' }, remove: null },
  // Route-only (POST /v1/me/invitations/:id/accept|decline).
  respond_to_invitation: { events: [], surface: { file: WORKSPACES, marker: 'gn-workspace-card__door' }, remove: null },
  // Primary: invite (a route; the server writes invite.sent). remove_member is a route too; project is add_to_project
  // and remove_from_project (a member sees the project on their workspace page).
  manage_members: {
    events: ['invite.revoked', 'membership.granted', 'project.member_added', 'project.member_removed'],
    surface: { file: MEMBERS, marker: 'gn-invite-pending__row' },
    remove: 'invite.revoked',
    primary: [],
    paths: {
      change_role: { events: ['membership.granted'], surface: { file: MEMBERS, marker: 'gn-members__role' }, remove: 'membership.granted' },
      remove_member: { events: [], surface: { file: MEMBERS, marker: 'gn-members__row' }, remove: null },
      revoke_invite: { events: ['invite.revoked'], surface: { file: MEMBERS, marker: 'gn-invite-pending__row' }, remove: null },
      project: { events: ['project.member_added', 'project.member_removed'], surface: { file: WORKSPACE, marker: 'gn-project-card__name' }, remove: null },
    },
  },
  // The project path is project.updated { prefix }. Every ticket key carries the prefix.
  change_prefix: {
    events: ['workspace.prefix_changed', 'project.updated'],
    surface: { file: LIST, marker: 'gn-list__key' },
    remove: 'workspace.prefix_changed',
    primary: ['workspace.prefix_changed'],
    paths: { project: { events: ['project.updated'], surface: { file: LIST, marker: 'gn-list__key' }, remove: 'project.updated' } },
  },
  // Primary: create. file_project is project.updated { groupId }, shown as the project's group section.
  manage_groups: {
    events: ['group.created', 'project.updated', 'group.renamed', 'group.deleted', 'group.reordered'],
    surface: { file: GROUPS, marker: 'gn-groups__node' },
    remove: 'group.deleted',
    primary: ['group.created'],
    paths: {
      rename: { events: ['group.renamed'], surface: { file: GROUPS, marker: 'gn-groups__name' }, remove: 'group.renamed' },
      reorder: { events: ['group.reordered'], surface: { file: GROUPS, marker: 'gn-groups__node' }, remove: 'group.reordered' },
      file_project: { events: ['project.updated'], surface: { file: 'apps/web/src/grouped-projects.tsx', marker: 'gn-group-section__body' }, remove: 'project.updated' },
      delete: { events: ['group.deleted'], surface: { file: GROUPS, marker: 'gn-groups__node' }, remove: null },
    },
  },
  // Primary: a new version, undone by publishing the previous one. The create path posts the same type, so the
  // primary owns it and `create` is judged on its surface and remove alone.
  define_workflow: {
    events: ['workflow.defined'],
    surface: { file: WORKFLOWS, marker: 'workflow-list__card' },
    remove: 'workflow.defined',
    primary: ['workflow.defined'],
    paths: { create: { events: [], surface: { file: WORKFLOWS, marker: 'workflow-list__card' }, remove: null } },
  },
  define_ticket_type: {
    events: ['ticket-type.defined'],
    surface: { file: TICKET_TYPES, marker: 'ticket-type-list__row' },
    remove: 'ticket-type.defined',
    primary: ['ticket-type.defined'],
    paths: { create: { events: [], surface: { file: TICKET_TYPES, marker: 'ticket-type-list__row' }, remove: null } },
  },
  // Route-only (POST …/ticket-types/:id/migrate).
  migrate_ticket_type: { events: [], surface: { file: TICKET_TYPES, marker: 'ticket-type-list__workflow' }, remove: null },
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
 * not own. Each entry is a tool (its row) or a `<tool>#<path>` (that path's own legs) and the legs it fails, exactly
 * as 27.517 computes them. A new failure reds the test, and so does a fixed gap still listed here: remove it. This
 * list only shrinks, and it is the only statement of a gap: no comment on a row names one.
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
  'update_note#title': { missing: ['history'], why: 'Note events have no History renderer: the note history panel lists body versions only (apps/web/src/notes/history-panel.tsx).' },
  'update_note#scope': { missing: ['history'], why: 'Note events have no History renderer: the note history panel lists body versions only (apps/web/src/notes/history-panel.tsx).' },
  'update_note#moved': { missing: ['history', 'remove'], why: 'Note events have no History renderer; the move has no undo: the app never submits note.moved.' },
  'add_attachment#note': { missing: ['history'], why: 'A note image is a note.body_set, which History does not render.' },
  'update_ticket#reparent': { missing: ['remove'], why: 'No member undo: the app never submits ticket.reparented.' },
  'update_ticket#collaborators': { missing: ['surface', 'remove'], why: 'Collaborators show only in History, and the app never submits ticket.collaborator_added or ticket.collaborator_removed.' },
  'update_ticket#workflow': { missing: ['remove'], why: 'No member undo: the app never submits ticket.workflow_rebound.' },
  'manage_members#change_role': { missing: ['history'], why: 'Membership events have no History renderer (describeEvent renders ticket history only).' },
  'manage_members#remove_member': { missing: ['remove'], why: 'Route-only: a removed member has no event to undo it; only a new invite brings them back.' },
  'manage_members#revoke_invite': { missing: ['history', 'remove'], why: 'Invite events have no History renderer, and a revoked invite has no member event to undo it.' },
  'manage_members#project': { missing: ['history', 'remove'], why: 'Project-member events have no History renderer, and no member event undoes a project membership: the app submits project.member_added only when it founds a project, and never project.member_removed.' },
  'change_prefix#project': { missing: ['history'], why: 'Project events have no History renderer: describeEvent renders ticket history only (history-copy.ts).' },
  'manage_groups#rename': { missing: ['history'], why: 'Group events have no History renderer (describeEvent renders ticket history only).' },
  'manage_groups#reorder': { missing: ['history'], why: 'Group events have no History renderer (describeEvent renders ticket history only).' },
  'manage_groups#file_project': { missing: ['history'], why: 'project.updated has no History renderer (describeEvent renders ticket history only).' },
  'manage_groups#delete': { missing: ['history', 'remove'], why: 'Group events have no History renderer, and a deleted group cannot be undone.' },
  'define_workflow#create': { missing: ['remove'], why: 'A new workflow cannot be deleted or archived.' },
  'define_ticket_type#create': { missing: ['remove'], why: 'A new ticket type cannot be deleted or archived.' },
  tag_items: { missing: ['surface'], why: 'No app surface until KG-D Task 9 creates the Concepts row (concepts-row.tsx).' },
};
