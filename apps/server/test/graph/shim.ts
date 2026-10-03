import type { Pool } from 'pg';

/**
 * TEST-ONLY stand-in for plan A's and plan B's migrations (Knowledge Graph spec A §2.5; spec B §2.1 as plan B Task 1 amended it:
 * `source_parent_kind` + `source_parent_id` replace the spec's `source_ticket`, because a comment may be filed against a note).
 * The DDL is copied from those migrations with `IF NOT EXISTS` added, so it is a no-op once they are on the release branch.
 * Task 6 deletes this file.
 */
export async function ensureLinkAndReferenceTables(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS proj_ticket_links (
      workspace_id text NOT NULL,
      source_id    text NOT NULL,
      target_id    text NOT NULL,
      kind         text NOT NULL CHECK (kind IN ('blocks','relates','duplicates')),
      created_by   text NOT NULL,
      created_at   timestamptz NOT NULL,
      origin       text NOT NULL,
      seq          bigint NOT NULL,
      PRIMARY KEY (source_id, target_id, kind)
    );
    CREATE INDEX IF NOT EXISTS proj_ticket_links_target_idx ON proj_ticket_links (target_id);
    CREATE INDEX IF NOT EXISTS proj_ticket_links_ws_idx ON proj_ticket_links (workspace_id);
    CREATE TABLE IF NOT EXISTS proj_references (
      workspace_id        text NOT NULL,
      source_kind         text NOT NULL CHECK (source_kind IN ('ticket', 'comment', 'note')),
      source_id           text NOT NULL,
      source_parent_kind  text NOT NULL CHECK (source_parent_kind IN ('ticket', 'note')),
      source_parent_id    text NOT NULL,
      target_kind         text NOT NULL CHECK (target_kind IN ('ticket', 'note', 'person')),
      target_id           text NOT NULL,
      ordinal             int  NOT NULL,
      snippet             text NOT NULL,
      updated_by          text NOT NULL,
      updated_at          timestamptz NOT NULL,
      seq                 bigint NOT NULL,
      PRIMARY KEY (source_kind, source_id, ordinal)
    );
    CREATE INDEX IF NOT EXISTS proj_references_target_idx ON proj_references (target_kind, target_id);
    CREATE INDEX IF NOT EXISTS proj_references_parent_idx ON proj_references (source_parent_kind, source_parent_id);
    CREATE INDEX IF NOT EXISTS proj_references_ws_idx ON proj_references (workspace_id);
  `);
}
