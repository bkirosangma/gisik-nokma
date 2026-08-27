-- Up Migration

CREATE TABLE events (
  id           text PRIMARY KEY,
  workspace_id text NOT NULL,
  entity_kind  text NOT NULL,
  entity_id    text NOT NULL,
  type         text NOT NULL,
  version      integer NOT NULL,
  payload      jsonb NOT NULL,
  actor_id     text NOT NULL,
  origin       text NOT NULL,
  client_time  timestamptz NOT NULL,
  server_time  timestamptz NOT NULL,
  seq          bigint NOT NULL,
  workspace_seq bigint NOT NULL,
  CONSTRAINT events_entity_seq_unique UNIQUE (entity_kind, entity_id, seq),
  CONSTRAINT events_workspace_seq_unique UNIQUE (workspace_id, workspace_seq)
);

COMMENT ON TABLE events IS 'Append-only ledger: every row is an immutable, attributed claim.';
COMMENT ON COLUMN events.client_time IS 'The claimed instant: when the actor says it happened. Absolute (timestamptz), so it sorts and compares without a cast; the device''s stated offset was a label on this instant, not a separate fact.';
COMMENT ON COLUMN events.server_time IS 'The received instant: when the system got it. Assigned at ingest. Separate from client_time on purpose — the two disagreeing is the skew the product reports, never hides.';
COMMENT ON COLUMN events.seq IS 'Per-entity sequence: entity history, replay, snapshots.';
COMMENT ON COLUMN events.workspace_seq IS 'Per-workspace stream cursor (coordination §18): the only order a workspace stream may resume by. Its unique index doubles as the (workspace_id, workspace_seq) range index those resumes scan.';

CREATE INDEX events_workspace_server_time_idx ON events (workspace_id, server_time);

CREATE FUNCTION events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'events is append-only: % refused', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER events_no_update_no_delete
  BEFORE UPDATE OR DELETE ON events
  FOR EACH ROW EXECUTE FUNCTION events_append_only();

CREATE TRIGGER events_no_truncate
  BEFORE TRUNCATE ON events
  FOR EACH STATEMENT EXECUTE FUNCTION events_append_only();

CREATE TABLE snapshots (
  entity_kind text NOT NULL,
  entity_id   text NOT NULL,
  seq         bigint NOT NULL,
  state       jsonb NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_kind, entity_id, seq)
);

COMMENT ON TABLE snapshots IS 'Bounds per-entity replay: state as of seq. Written by a later plan; created here so the ledger schema is complete.';

-- Down Migration

DROP TABLE snapshots;
DROP TRIGGER events_no_truncate ON events;
DROP TRIGGER events_no_update_no_delete ON events;
DROP FUNCTION events_append_only();
DROP TABLE events;
