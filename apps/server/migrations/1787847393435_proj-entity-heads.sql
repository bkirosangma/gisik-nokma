-- Up Migration

CREATE TABLE proj_entity_heads (
  entity_kind      text NOT NULL,
  entity_id        text NOT NULL,
  workspace_id     text NOT NULL,
  head_seq         bigint NOT NULL,
  head_event_id    text NOT NULL,
  head_event_type  text NOT NULL,
  head_server_time timestamptz NOT NULL,
  PRIMARY KEY (entity_kind, entity_id)
);

COMMENT ON TABLE proj_entity_heads IS 'Projection: newest committed event (the head) per entity. Rebuildable from the ledger; never authored.';

-- Down Migration

DROP TABLE proj_entity_heads;
