import type { SyncStorage } from './storage.js';

/**
 * Raised to 2 by Plan 2 of the notes series, which added `notes` and
 * `note_comments`.
 *
 * **The number is a version stamp; it is not an upgrade path.** `migrateLocal`
 * runs `CREATE TABLE IF NOT EXISTS` and nothing else, and this constant is
 * written into `meta` and never read back by anything — checked across
 * `sync-client`, `app-core` and both shells. So the bump records that the shape
 * changed and is not what makes a device converge: the two new TABLES are, and
 * they are safe on an existing device precisely because they are new. The day
 * this schema must ALTER rather than CREATE, the version needs a reader and a
 * migration step, and `snapshot_provenance`'s docblock below already records
 * that as unowned.
 * Raised to 3 by trash series Plan 3, which added `purged_ids`, `sync_notices`
 * and `deleted_items_cache` — three NEW tables, for the same reason the notes
 * tables were: `CREATE TABLE IF NOT EXISTS` is the only DDL this file runs.
 * Raised to 4 by MCP-everything T4, which added `comment_changes` — a NEW table, for the same reason.
 */
export const LOCAL_SCHEMA_VERSION = 4;

// ULID discipline: no column here carries a hand-written shape constraint.
// `events.id`, `outbox.event_id` and the entity ids are ULIDs, but the ONE
// definition of that format is `ULID_REGEX` in `@gisik-nokma/domain`, and a
// SQLite `CHECK (id GLOB '...')` would be a second definition of it in a
// second language — exactly the drift that was found and fixed in the domain
// package. Ids are validated where they are minted and where they are parsed
// (`newSubmittedEvent`, `parseEvent`); the replica's tables store what the
// ledger already vouched for. This task mints no ids at all.
const TABLES = [
  // the visibility-scoped local ledger — exactly what arrived, nothing invented
  // Mirrors the server's column set (coordination §18) — BOTH sequences are kept
  // because both are true in different senses: `seq` orders one entity's history
  // (what the reducer replays), `workspace_seq` orders the workspace's stream
  // (what a resume cursor means). Dropping either would force the replica to
  // invent an order it was never told.
  //
  // client_time / server_time hold ISO 8601 'Z' instant strings — EXACTLY what
  // the server's rowToEnvelope emits, never a device-offset label. SQLite has
  // no timestamp type, so these are TEXT; that is safe here and only here,
  // because every value is Z-normalised at millisecond precision by the server
  // before it is handed over. Two consequences worth naming: string comparison
  // IS instant comparison and lexicographic order IS chronological order (which
  // is why the outbox and the duplicate checks may compare them directly), and
  // a replica must never write a locally-formatted time into these columns —
  // '2026-08-21T00:00:00+05:30' and '2026-08-20T18:30:00.000Z' are one moment
  // and two strings, and the second one is the only one the server will ever
  // send. Owner decision 2026-08-20: both ledger clocks are timestamptz, so
  // the offset label the device attached is not a fact the server preserves.
  `CREATE TABLE IF NOT EXISTS events (
     id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL,
     type TEXT NOT NULL, version INTEGER NOT NULL, payload TEXT NOT NULL, actor_id TEXT NOT NULL,
     origin TEXT NOT NULL, client_time TEXT NOT NULL, server_time TEXT NOT NULL,
     seq INTEGER NOT NULL, workspace_seq INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS events_entity_idx ON events (entity_kind, entity_id, seq)`,
  `CREATE INDEX IF NOT EXISTS events_stream_idx ON events (workspace_id, workspace_seq)`,
  // reducer-state baseline from bootstrap (server snapshots, reducer-folded)
  `CREATE TABLE IF NOT EXISTS snapshots (
     entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL, seq INTEGER NOT NULL, state TEXT NOT NULL,
     PRIMARY KEY (entity_kind, entity_id)
   )`,
  /**
   * The snapshot's provenance block (ruling P36) — a SIBLING TABLE and not a
   * column on `snapshots`, and the reason is a property of this file rather
   * than a preference.
   *
   * `migrateLocal` runs `CREATE TABLE IF NOT EXISTS` and nothing else. There is
   * no `ALTER` path and **`LOCAL_SCHEMA_VERSION` is written into `meta` and
   * never read back by anything** — checked across `sync-client`, `app-core`
   * and both shells — so a version stamp exists and an upgrade mechanism does
   * not. Adding a column to `snapshots` would therefore work on a fresh device
   * and fail on an existing one with `no such column: provenance`, at the first
   * write, at runtime. A new table is created by the same idempotent DDL on
   * both, and an existing device simply has no rows in it until its next
   * bootstrap — which reads as "unknown", the same answer it gave before.
   *
   * *Recorded, not fixed: this schema has no migration path at all. The next
   * change that must ALTER rather than CREATE will need one. Owner: whoever
   * owns `sync-client`'s storage seam.*
   */
  `CREATE TABLE IF NOT EXISTS snapshot_provenance (
     entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL,
     state_claim TEXT NOT NULL, assigned_claim TEXT,
     PRIMARY KEY (entity_kind, entity_id)
   )`,
  // confirmed read model — folded by applyTicketEvent, NEVER downloaded projections
  `CREATE TABLE IF NOT EXISTS tickets (
     ticket_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, parent_id TEXT, state TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS tickets_parent_idx ON tickets (parent_id)`,
  /**
   * The local notes, folded by the SHARED reducer (notes series, Plan 2 of 6,
   * spec §5.3).
   *
   * ## Columns, and the three of them that are JSON
   *
   * `body`, `scope` and `scope_before_inherit` are the reducer's own objects
   * (`NoteState`), so they are stored as JSON text rather than flattened — a
   * flattening would be a second spelling of `NoteScope` that could disagree
   * with the domain type, and `scopeBeforeInherit` is `null` or a whole scope.
   * `attached_ticket_ids` is a JSON ARRAY, and it is a column rather than a
   * join table because the replica never reads it by ticket: `listNotesForTicket`
   * answers that question, and it must answer it the way the column is stored —
   * SQLite's `json_each` over this column is the one query, and it is written
   * where it is used.
   *
   * ## `seq` mirrors `proj_notes.seq`, deliberately
   *
   * The server's comments projection says it plainly: *"`seq` is the note
   * entity's own per-entity seq of the latest event folded, mirroring
   * proj_tickets. `workspace_seq` sits beside it and is the workspace's stream
   * cursor."* The replica keeps the same split for the same reason — `seq`
   * orders ONE note's history, and the workspace cursor is `meta`'s. A device
   * that conflated them would have a note's history order change every time an
   * unrelated commit landed.
   *
   * ## No `workspace_seq` column here, unlike `events`
   *
   * A note's head row has no resume position to keep: the cursor is the
   * workspace's, and the note's own history order is `seq`. This is the same
   * reason `tickets` carries only `state`.
   */
  `CREATE TABLE IF NOT EXISTS notes (
     note_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, home_project_id TEXT NOT NULL,
     author_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
     scope TEXT NOT NULL, scope_before_inherit TEXT, attached_ticket_ids TEXT NOT NULL,
     deleted INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
     last_body_event_id TEXT NOT NULL, seq INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS notes_home_idx ON notes (workspace_id, home_project_id)`,
  /**
   * Comments filed against a NOTE — the same event type tickets use, split by
   * entity kind exactly as the server's two comment projections are.
   *
   * `comment_id` IS the event id: the payload is `{ body }` and carries no
   * identity of its own (`proj_note_comments`' own comment says so). Ordering
   * is `workspace_seq`, matching `listNoteComments` on the server: a comment
   * thread reads as a conversation, so it is ordered by when the claim entered
   * the workspace rather than by per-entity numbering.
   *
   * `workspace_id` is carried although nothing reads it today, because the
   * server's table carries it and a local row that could not say which
   * workspace it belonged to would be the one row `revokeScope` cannot reach.
   */
  `CREATE TABLE IF NOT EXISTS note_comments (
     comment_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, note_id TEXT NOT NULL,
     author_id TEXT NOT NULL, body TEXT NOT NULL, recorded_at TEXT NOT NULL,
     workspace_seq INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS note_comments_note_idx ON note_comments (note_id, workspace_seq)`,
  /**
   * Comment edits and deletions (MCP-everything T4, spec §6) — a SIBLING table, not columns on
   * `note_comments`, because this schema can only CREATE (see `snapshot_provenance` above). One row per
   * changed comment, ticket or note; `entity_kind`/`entity_id` name the parent so a purge reaches it.
   */
  `CREATE TABLE IF NOT EXISTS comment_changes (
     comment_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL,
     edited_at TEXT, edited_by TEXT, deleted_at TEXT, deleted_by TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS comment_changes_entity_idx ON comment_changes (entity_kind, entity_id)`,
  `CREATE TABLE IF NOT EXISTS workflows (
     workflow_id TEXT NOT NULL, version INTEGER NOT NULL, def TEXT NOT NULL, PRIMARY KEY (workflow_id, version)
   )`,
  `CREATE TABLE IF NOT EXISTS ticket_types (type_id TEXT PRIMARY KEY, def TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS contests (
     contested_event_id TEXT PRIMARY KEY, original_event_id TEXT NOT NULL UNIQUE, workspace_id TEXT NOT NULL,
     ticket_id TEXT NOT NULL, claimant_id TEXT NOT NULL, rule TEXT NOT NULL, reason TEXT NOT NULL,
     original_event TEXT NOT NULL, contested_at TEXT NOT NULL, resolved INTEGER NOT NULL DEFAULT 0, resolution TEXT
   )`,
  // ordered, persisted claims in transit
  `CREATE TABLE IF NOT EXISTS outbox (
     position INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE, workspace_id TEXT NOT NULL,
     entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL, envelope TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
     next_attempt_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z', last_error TEXT
   )`,
  /**
   * What a permanent purge erased (trash series Plan 3, D2) — kind and id,
   * content-free. Written by `replica.eraseEntities`, read by `purgedAmong`
   * (the chips' predicate) and to keep an id out of the next lookup. Never
   * erased itself: it is the record of an erasure.
   */
  `CREATE TABLE IF NOT EXISTS purged_ids (
     entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL, recorded_at TEXT NOT NULL,
     PRIMARY KEY (entity_kind, entity_id)
   )`,
  /**
   * Claims this device REMOVED from its outbox and must tell the person about
   * (spec §5.7: "never silently"). CONTENT-FREE on purpose: the claim's
   * payload is content of an erased item, so only its event id (the notice's
   * key), its target and its type are kept.
   */
  `CREATE TABLE IF NOT EXISTS sync_notices (
     notice_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, kind TEXT NOT NULL,
     entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL, event_type TEXT NOT NULL, recorded_at TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS sync_notices_workspace_idx ON sync_notices (workspace_id, recorded_at)`,
  /**
   * The last ONLINE answer of `GET /v1/me/deleted-items` (spec §6.3's last
   * line; D9) — the body as served, keyed `'me'` because the read is the
   * signed-in person's, not a workspace's. An erase strips its rows.
   */
  `CREATE TABLE IF NOT EXISTS deleted_items_cache (
     cache_key TEXT PRIMARY KEY, payload TEXT NOT NULL, fetched_at TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];

/**
 * Every local table's rule when a permanent purge reaches this device (trash
 * series Plan 3, D2) — the device's mirror of Plan 2's `PURGE_TABLE_RULES`.
 * Case 19.172 compares these keys against `sqlite_master`, so a table added
 * next month without a rule reddens rather than silently keeping erased data.
 */
export const LOCAL_TABLE_RULES: Readonly<Record<string, { rule: 'erase' | 'registry'; why: string }>> = {
  events: { rule: 'erase', why: "an erased entity's events by (entity_kind, entity_id); a workspace's by workspace_id" },
  snapshots: { rule: 'erase', why: "an erased ticket's baseline; a workspace erase deletes its tickets' rows" },
  snapshot_provenance: { rule: 'erase', why: 'the sibling of snapshots, by the same key' },
  tickets: { rule: 'erase', why: 'the erased ticket and its LOCAL subtree (parent_id), or every ticket naming an erased project' },
  notes: { rule: 'erase', why: 'the erased note, or every note homed in an erased project' },
  note_comments: { rule: 'erase', why: "an erased note's comments" },
  comment_changes: { rule: 'erase', why: "an erased ticket's or note's comment edits, by (entity_kind, entity_id); a workspace's by workspace_id" },
  contests: {
    rule: 'erase',
    why: "EVERY contest on an erased ticket, the device's own included — unlike purgeEntity (lost access), a purge is an erasure and a stub embeds the claim whole",
  },
  outbox: { rule: 'erase', why: 'every queued claim about an erased entity — each one becomes a sync_notices row' },
  workflows: { rule: 'erase', why: 'a workspace erase only (the replica holds one workspace, as revokeScope assumes)' },
  ticket_types: { rule: 'erase', why: 'a workspace erase only, as workflows' },
  meta: { rule: 'erase', why: "a workspace erase deletes its cursor and both pending-pull keys; an entity erase strips it from the pending-pull lists" },
  deleted_items_cache: { rule: 'erase', why: 'the cached Deleted items body loses every row whose item or workspace was erased' },
  purged_ids: { rule: 'registry', why: 'the record of what was erased — content-free, never erased' },
  sync_notices: { rule: 'registry', why: 'the content-free record of removed claims; the person dismisses each one' },
};


export async function migrateLocal(storage: SyncStorage): Promise<void> {
  await storage.transaction(async (tx) => {
    for (const ddl of TABLES) await tx.run(ddl);
    await tx.run(
      `INSERT INTO meta (key, value) VALUES ('schema_version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [String(LOCAL_SCHEMA_VERSION)],
    );
  });
}
