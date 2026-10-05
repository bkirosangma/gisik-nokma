-- Up Migration

-- Knowledge Graph spec D §3.1: the concept projections. workspace_id is on every table (the spec's
-- proj_concept_items list omits it): purge's workspaceScopedTables() deletes by it, and every read filters by it.

CREATE TABLE proj_concepts (
  concept_id      text PRIMARY KEY,
  workspace_id    text NOT NULL,
  name            text NOT NULL,
  summary         text NOT NULL DEFAULT '',
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL,
  origin          text NOT NULL,
  from_suggestion text,
  merged_into     text,
  deleted         boolean NOT NULL DEFAULT FALSE
);
CREATE INDEX proj_concepts_ws_idx ON proj_concepts (workspace_id) WHERE deleted = FALSE;

CREATE TABLE proj_concept_items (
  concept_id   text NOT NULL,
  workspace_id text NOT NULL,
  item_kind    text NOT NULL CHECK (item_kind IN ('ticket', 'note')),
  item_id      text NOT NULL,
  tagged_by    text NOT NULL,
  tagged_at    timestamptz NOT NULL,
  origin       text NOT NULL,
  PRIMARY KEY (concept_id, item_kind, item_id)
);
CREATE INDEX proj_concept_items_item_idx ON proj_concept_items (item_kind, item_id);

CREATE TABLE proj_concept_links (
  workspace_id text NOT NULL,
  a            text NOT NULL,
  b            text NOT NULL,
  relation     text NOT NULL CHECK (relation IN ('broader', 'related')),
  linked_by    text NOT NULL,
  linked_at    timestamptz NOT NULL,
  origin       text NOT NULL,
  PRIMARY KEY (a, b, relation),
  CHECK (relation <> 'related' OR a < b)
);
CREATE INDEX proj_concept_links_b_idx ON proj_concept_links (b);

-- Down Migration

DROP TABLE proj_concept_links;
DROP TABLE proj_concept_items;
DROP TABLE proj_concepts;
