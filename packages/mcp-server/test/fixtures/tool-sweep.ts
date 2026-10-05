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
/** The references route's empty page (KG-B T4: get_ticket and get_note read it). */
const NO_REFERENCES = { total: 0, items: [], nextCursor: null };
/** A minimal `SuggestionView` (KG-D T5: `resolve_suggestion` finds it by id). */
const SWEEP_SUGGESTION = {
  id: 's',
  label: 'a · b',
  terms: ['a', 'b'],
  score: 1,
  computedAt: '2026-10-05T10:00:00.000Z',
  signature: 'a'.repeat(64),
  itemHashes: ['b'.repeat(32), 'c'.repeat(32), 'd'.repeat(32)],
  items: [{ kind: 'ticket', id: 't', label: 'T' }],
};
/** A minimal `ConceptView` (KG-D T4: every concept tool but the list reads one). */
const SWEEP_CONCEPT = { id: 'c', name: 'C', summary: '', itemCount: 0, createdBy: 'u', origin: 'web', workspaceId: 'w', createdAt: '2026-10-05T10:00:00.000Z', fromSuggestion: null, items: [], links: [] };

export const SWEEP: Record<string, SweepEntry> = {
  // read begin
  search: { args: { workspaceId: 'w', query: 'q' } },
  search_tickets: { args: { workspaceId: 'w', query: 'q' } },
  list_tickets: { args: { projectId: 'p' } },
  // Typed links T4: get_ticket also reads the links route, which answers `{ links }`; KG-B T4: and the references route, a `LinkedFromPage`.
  get_ticket: {
    args: { workspaceId: 'w', ticketId: 't' },
    session: { get: async (path) => (path.endsWith('/links') ? { links: [] } : path.includes('/references?') ? NO_REFERENCES : TICKET_DETAIL) },
  },
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
  list_notes: { args: { workspaceId: 'w' }, session: { get: async () => ({ note: { noteId: 'n', workspaceId: 'w', homeProjectId: '', authorId: 'u', title: 'N', scope: { mode: 'private' }, attachedTickets: [], deleted: false, createdAt: '2026-10-02T10:00:00.000Z', updatedAt: '2026-10-02T10:00:00.000Z', body: null }, notes: [], versions: [], body: null }) } },
  // KG-B T4: get_note also reads the references route of the note's workspace.
  get_note: { args: { noteId: 'n' }, session: { get: async (path) => path.includes('/references?') ? NO_REFERENCES : ({ note: { noteId: 'n', workspaceId: 'w', homeProjectId: '', authorId: 'u', title: 'N', scope: { mode: 'private' }, attachedTickets: [], deleted: false, createdAt: '2026-10-02T10:00:00.000Z', updatedAt: '2026-10-02T10:00:00.000Z', body: null }, notes: [], versions: [], body: null }) } },
  create_note: { args: { workspaceId: 'w', title: 'T' }, session: { get: async () => ({ note: { noteId: 'n', workspaceId: 'w', homeProjectId: '', authorId: 'u', title: 'N', scope: { mode: 'private' }, attachedTickets: [], deleted: false, createdAt: '2026-10-02T10:00:00.000Z', updatedAt: '2026-10-02T10:00:00.000Z', body: null }, notes: [], versions: [], body: null }) } },
  update_note: { args: { noteId: 'n', title: 'T2' }, session: { get: async () => ({ note: { noteId: 'n', workspaceId: 'w', homeProjectId: '', authorId: 'u', title: 'N', scope: { mode: 'private' }, attachedTickets: [], deleted: false, createdAt: '2026-10-02T10:00:00.000Z', updatedAt: '2026-10-02T10:00:00.000Z', body: null }, notes: [], versions: [], body: null }) } },
  link_note: { args: { noteId: 'n', ticketId: 't', action: 'attach' }, session: { get: async () => ({ note: { noteId: 'n', workspaceId: 'w', homeProjectId: '', authorId: 'u', title: 'N', scope: { mode: 'private' }, attachedTickets: [], deleted: false, createdAt: '2026-10-02T10:00:00.000Z', updatedAt: '2026-10-02T10:00:00.000Z', body: null }, notes: [], versions: [], body: null }) } },
  delete_note: { args: { noteId: 'n', confirm_name: 'N' }, session: { get: async () => ({ note: { noteId: 'n', workspaceId: 'w', homeProjectId: '', authorId: 'u', title: 'N', scope: { mode: 'private' }, attachedTickets: [], deleted: false, createdAt: '2026-10-02T10:00:00.000Z', updatedAt: '2026-10-02T10:00:00.000Z', body: null }, notes: [], versions: [], body: null }) } },
  restore_note: { args: { noteId: 'n' }, session: { get: async () => ({ note: { noteId: 'n', workspaceId: 'w', homeProjectId: '', authorId: 'u', title: 'N', scope: { mode: 'private' }, attachedTickets: [], deleted: false, createdAt: '2026-10-02T10:00:00.000Z', updatedAt: '2026-10-02T10:00:00.000Z', body: null }, notes: [], versions: [], body: null }) } },
  get_note_history: { args: { noteId: 'n' }, session: { get: async () => ({ note: { noteId: 'n', workspaceId: 'w', homeProjectId: '', authorId: 'u', title: 'N', scope: { mode: 'private' }, attachedTickets: [], deleted: false, createdAt: '2026-10-02T10:00:00.000Z', updatedAt: '2026-10-02T10:00:00.000Z', body: null }, notes: [], versions: [], body: null }) } },
  // note end
  // attachment begin (T8)
  list_attachments: { args: { workspaceId: 'w', ticketId: 't' }, session: { get: async () => ({ attachments: [] }) } },
  get_attachment: { args: { attachmentId: 'a' }, session: { getBytes: async () => ({ bytes: new TextEncoder().encode('hi'), contentType: 'text/plain', filename: 'a.txt' }) } },
  add_attachment: {
    args: { workspaceId: 'w', ticketId: 't', file: { name: 'a.txt', base64: 'aGk=' } },
    session: { postMultipart: async () => ({ attachmentId: 'a', url: '/v1/attachments/a', mime: 'text/plain', filename: 'a.txt', size: 2, sha256: 'a'.repeat(64) }) },
  },
  // attachment end
  // ticket begin (T9)
  update_ticket: { args: { workspaceId: 'w', ticketId: 't', title: 'Renamed' } },
  close_ticket: { args: { workspaceId: 'w', ticketId: 't' } },
  reopen_ticket: { args: { workspaceId: 'w', ticketId: 't' } },
  delete_ticket: { args: { workspaceId: 'w', ticketId: 't', confirm_name: 'W-1' }, session: { get: async () => TICKET_DETAIL } },
  restore_ticket: { args: { workspaceId: 'w', ticketId: 't' } },
  get_ticket_history: { args: { ticketId: 't' }, session: { get: async () => ({ ticketId: 't', events: [] }) } },
  rank_ticket: { args: { workspaceId: 'w', ticketId: 't', after: 'n' }, session: { get: async () => TICKET_DETAIL } },
  link_tickets: {
    args: { workspaceId: 'w', ticketId: 't', targetId: 'n', kind: 'blocks', action: 'remove' },
    session: { get: async () => ({ links: [{ kind: 'blocks', direction: 'out', ticket: { id: 'n' } }] }) },
  },
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
  // graph begin (KG-D T2, T6)
  similar: { args: { workspaceId: 'w', item: { kind: 'ticket', id: 't' } }, session: { get: async () => ({ workspaceId: 'w', item: { kind: 'ticket', id: 't' }, hits: [] }) } },
  // graph end
  // concept begin (KG-D T4, T5)
  list_concepts: { args: { workspaceId: 'w' }, session: { get: async () => ({ workspaceId: 'w', concepts: [] }) } },
  get_concept: { args: { conceptId: 'c' }, session: { get: async () => SWEEP_CONCEPT } },
  // No `confirm_name`: the delete answers its preview.
  manage_concept: { args: { action: 'delete', conceptId: 'c' }, session: { get: async () => SWEEP_CONCEPT } },
  tag_items: {
    args: { conceptId: 'c', action: 'add', items: [{ kind: 'ticket', id: 't' }] },
    session: { get: async (path) => (path.includes('/audience') ? { conceptId: 'c', members: 2, before: 2, after: 1 } : SWEEP_CONCEPT) },
  },
  link_concepts: { args: { conceptId: 'c', otherId: 'd', relation: 'related', action: 'add' }, session: { get: async () => SWEEP_CONCEPT } },
  review_suggestions: { args: { workspaceId: 'w' }, session: { get: async () => ({ workspaceId: 'w', suggestions: [] }) } },
  resolve_suggestion: { args: { workspaceId: 'w', suggestionId: 's', action: 'reject' }, session: { get: async () => ({ workspaceId: 'w', suggestions: [SWEEP_SUGGESTION] }) } },
  // concept end
};
