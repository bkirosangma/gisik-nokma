-- Up Migration

-- Knowledge Graph spec D §4.1 (KG-D Task 5): the suggestion CACHE (written only by src/semantic/suggestion-job.ts,
-- never a projection), the rejection projection, and the job's nightly bookkeeping.

CREATE TABLE sem_suggestions (
  id            text PRIMARY KEY,
  workspace_id  text NOT NULL,
  signature     text NOT NULL,
  partition_key text NOT NULL,
  item_kind     text[] NOT NULL,
  item_id       text[] NOT NULL,
  item_hashes   text[] NOT NULL,
  terms         text[] NOT NULL,
  label         text NOT NULL,
  score         real NOT NULL,
  computed_at   timestamptz NOT NULL,
  UNIQUE (workspace_id, signature)
);
CREATE INDEX sem_suggestions_items_idx ON sem_suggestions USING gin (item_id);

CREATE TABLE proj_concept_rejections (
  workspace_id text NOT NULL,
  signature    text NOT NULL,
  item_hashes  text[] NOT NULL,
  rejected_by  text NOT NULL,
  rejected_at  timestamptz NOT NULL,
  origin       text NOT NULL,
  PRIMARY KEY (workspace_id, signature)
);

CREATE TABLE sem_job_state (
  workspace_id          text PRIMARY KEY,
  last_nightly_ist_date date
);

COMMENT ON TABLE sem_suggestions IS 'CACHE, not a projection (spec D §4.1): the latest suggestion job''s output per workspace, upserted by (workspace_id, signature) so ids are stable across runs. D4 is NOT stored: every read re-checks hiddenItems per reader.';

-- Down Migration

DROP TABLE sem_job_state;
DROP TABLE proj_concept_rejections;
DROP TABLE sem_suggestions;
