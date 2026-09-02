-- Up Migration

CREATE TABLE attachments (
  id text PRIMARY KEY,
  workspace_id text NOT NULL,
  ticket_id text NOT NULL,
  uploader_id text NOT NULL,
  filename text NOT NULL,
  mime text NOT NULL,
  size bigint NOT NULL CHECK (size >= 0),
  object_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX attachments_ticket_idx ON attachments (ticket_id);
CREATE INDEX attachments_workspace_idx ON attachments (workspace_id);

COMMENT ON TABLE attachments IS 'Server-owned metadata about bytes the object store holds — not a projection (no proj_ prefix, not registered in the projection registry). The claim that a file belongs to a ticket is the attachment.added ledger event that references this row''s id; this table only records the storage system''s own facts.';

-- Down Migration

DROP TABLE attachments;
