/**
 * Every table in the database, and what a permanent purge does to it (trash
 * series Plan 2; spec `docs/superpowers/specs/2026-09-23-trash-and-purge-design.md`
 * §5.5). The guard in `test/purge/table-rules.test.ts` reads
 * `information_schema` and fails when a table carrying any of
 * `ENTITY_COLUMN_NAMES` — or any base table at all — has no entry here, so a
 * table added later cannot silently keep purged data.
 *
 * The four rules:
 * - `erase` — the erasure set's rows are deleted.
 * - `rederive` — the erasure set's rows are deleted AND surviving rows the
 *   erasure touched are re-derived, by replaying their surviving events through
 *   the owning projection's own `apply` (never by hand-written SQL, which would
 *   drift from what a rebuild produces).
 * - `not-entity-bearing` — the table holds nothing a workspace owns.
 * - `purge-registry` — the purge's own bookkeeping (Task 4), kept on purpose.
 *
 * `by` names the columns that carry an entity id. It is documentation the guard
 * checks (every `by` column must exist), and `workspaceScopedTables()` reads it
 * to find what a workspace purge deletes by `workspace_id`.
 */
export type PurgeRule = 'erase' | 'rederive' | 'not-entity-bearing' | 'purge-registry';

export type PurgeTableRule = {
  rule: PurgeRule;
  by?: readonly string[];
  why: string;
};

/**
 * Spec §5.5 names five columns; the parent columns and the note's home are
 * added because each names an entity a purge can erase (deviation D12).
 */
export const ENTITY_COLUMN_NAMES: readonly string[] = [
  'workspace_id',
  'project_id',
  'ticket_id',
  'note_id',
  'entity_id',
  'parent_id',
  'home_project_id',
  'parent_ticket_id',
];

const AUTH = 'An auth table: a person, not a workspace’s content. Erasing a user is out of scope (spec §9).';

export const PURGE_TABLE_RULES: Readonly<Record<string, PurgeTableRule>> = {
  events: {
    rule: 'erase',
    by: ['workspace_id', 'entity_id'],
    why: 'The ledger. Erased ONLY by purge_ledger (Task 4); a ticket purge redacts each ticket.created in place (spec §5.4).',
  },
  snapshots: {
    rule: 'erase',
    by: ['entity_id'],
    why: 'Per-entity replay bounds; deleted by purge_ledger beside the ledger rows.',
  },
  proj_entity_heads: {
    rule: 'rederive',
    by: ['workspace_id', 'entity_id'],
    why: 'Deleted for the set, then re-derived from the rows that remain (redacted creations, the tombstone) — a rebuild writes a head for each.',
  },
  proj_workflows: { rule: 'erase', by: ['workspace_id'], why: 'Workspace-scoped definitions; go with their workspace.' },
  user: { rule: 'not-entity-bearing', why: AUTH },
  session: { rule: 'not-entity-bearing', why: AUTH },
  account: { rule: 'not-entity-bearing', why: AUTH },
  verification: { rule: 'not-entity-bearing', why: AUTH },
  passkey: { rule: 'not-entity-bearing', why: AUTH },
  proj_memberships: {
    rule: 'erase',
    by: ['workspace_id', 'project_id'],
    why: 'Workspace rows go with the workspace; project rows (project.member_added, filed on the project) go with the project.',
  },
  proj_visibility: {
    rule: 'erase',
    by: ['workspace_id', 'project_id', 'ticket_id', 'parent_id'],
    why: 'One row per ticket; a child is in its parent’s set, so no survivor inherits from an erased row.',
  },
  proj_contested: {
    rule: 'erase',
    by: ['workspace_id', 'ticket_id'],
    why: 'Contests are filed on the ticket; original_event may hold the claim’s content.',
  },
  proj_projects: { rule: 'erase', by: ['workspace_id', 'project_id'], why: 'The project row itself.' },
  proj_invites: {
    rule: 'rederive',
    by: ['workspace_id'],
    why: 'Erased with the workspace; a survivor’s project_ids array drops a purged project (Task 7).',
  },
  invite_tokens: {
    rule: 'erase',
    by: ['invite_id'],
    why: 'Names no entity column, but belongs to an invite that belongs to a workspace; erased with it (Task 6).',
  },
  proj_ticket_types: { rule: 'erase', by: ['workspace_id'], why: 'Workspace-scoped definitions.' },
  proj_tickets: {
    rule: 'erase',
    by: ['workspace_id', 'project_id', 'ticket_id', 'parent_id'],
    why: 'Ticket head state, fields and title claims included.',
  },
  proj_rollups: {
    rule: 'erase',
    by: ['workspace_id', 'project_id', 'parent_ticket_id'],
    why: 'Erased by parent_ticket_id only; a surviving parent’s row stays (Task 7, 19.136).',
  },
  proj_workspace_settings: { rule: 'erase', by: ['workspace_id'], why: 'One row per workspace.' },
  proj_search: {
    rule: 'rederive',
    by: ['workspace_id', 'project_id', 'ticket_id'],
    why: 'Erased for the set; a survivor whose documents chip an erased item is re-derived (Task 7).',
  },
  user_preferences: {
    rule: 'rederive',
    by: ['workspace_id'],
    why: 'Erased with the workspace; listColumns/grouping are keyed by project id and lose a purged project’s key (Task 6).',
  },
  attachments: {
    rule: 'erase',
    by: ['workspace_id', 'ticket_id', 'note_id'],
    why: 'Rows deleted in the transaction; their objects queued in purge_pending_objects (Task 5).',
  },
  notifications: {
    rule: 'erase',
    by: ['workspace_id'],
    why: 'payload->>ticketId and payload.ticketTitle name the ticket; deleted by that key or by workspace.',
  },
  mcp_device_codes: { rule: 'not-entity-bearing', why: 'A person’s device authorisation.' },
  mcp_tokens: { rule: 'not-entity-bearing', why: 'A person’s token.' },
  user_notification_preferences: { rule: 'not-entity-bearing', why: 'A person’s muted kinds.' },
  proj_ticket_comments: { rule: 'erase', by: ['workspace_id', 'ticket_id'], why: 'Comment bodies.' },
  proj_notes: {
    rule: 'rederive',
    by: ['workspace_id', 'note_id', 'home_project_id'],
    why: 'Erased for the set; a surviving note that attached a purged ticket is replayed (Task 7).',
  },
  proj_note_attachments: {
    rule: 'rederive',
    by: ['workspace_id', 'note_id', 'ticket_id'],
    why: 'A link to a purged ticket goes; the note is replayed so a rebuild agrees (Task 7, D8).',
  },
  proj_note_comments: { rule: 'erase', by: ['workspace_id', 'note_id'], why: 'Note comment bodies.' },
  proj_note_search: {
    rule: 'rederive',
    by: ['workspace_id', 'note_id', 'home_project_id'],
    why: 'Erased for the set; a surviving note is re-indexed (Task 7).',
  },
  proj_note_lexemes: {
    rule: 'rederive',
    by: ['workspace_id'],
    why: 'Has no note id: the whole workspace’s lexemes are re-derived from proj_note_search (D3).',
  },
  search_note_chunks: {
    rule: 'rederive',
    by: ['workspace_id', 'note_id'],
    why: 'Erased for the set; a surviving note’s chunks are deleted and the embed worker re-chunks it (Task 7).',
  },
  proj_workspaces: { rule: 'erase', by: ['workspace_id'], why: 'The workspace’s lifecycle row.' },
  purged_entities: {
    rule: 'purge-registry',
    by: ['workspace_id', 'entity_id'],
    why: 'The purge’s own registry of erased ids (D2): content-free, read by the door and by projections, never erased.',
  },
  purge_pending_objects: {
    rule: 'purge-registry',
    why: 'Object keys awaiting deletion after a purge; a row leaves when its delete succeeds (Task 5).',
  },
};

/**
 * The tables a WORKSPACE purge deletes by `workspace_id` (Task 6), derived from
 * the rules so a new workspace-scoped table with a rule is erased with no second
 * edit. `events` is excluded (purge_ledger owns it); a `purge-registry` table is
 * excluded by its rule.
 */
export function workspaceScopedTables(): string[] {
  return Object.entries(PURGE_TABLE_RULES)
    .filter(
      ([table, rule]) =>
        table !== 'events' &&
        (rule.rule === 'erase' || rule.rule === 'rederive') &&
        (rule.by ?? []).includes('workspace_id'),
    )
    .map(([table]) => table)
    .sort();
}
