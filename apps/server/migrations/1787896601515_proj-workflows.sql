-- Up Migration

CREATE TABLE proj_workflows (
  workspace_id            text NOT NULL,
  workflow_id             text NOT NULL,
  version                 integer NOT NULL,
  name                    text NOT NULL,
  definition              jsonb NOT NULL,
  defined_by              text NOT NULL,
  defined_at              timestamptz NOT NULL,
  published_workspace_seq bigint NOT NULL,
  PRIMARY KEY (workflow_id, version)
);

COMMENT ON TABLE proj_workflows IS 'Projection: every published version of every workflow definition, queryable individually. Rebuildable from the ledger; never authored.';
COMMENT ON COLUMN proj_workflows.definition IS 'The full workflow.defined payload, stateMapping included — the engine''s version walk needs each intermediate version''s mapping, not just its states.';
COMMENT ON COLUMN proj_workflows.published_workspace_seq IS 'The workspace stream position (coordination §18) of the workflow.defined event that published this version. It is what makes an as-of lookup possible, and with it a replaying projection resolves the definition in force at the event it is applying rather than the newest one.';

CREATE INDEX proj_workflows_workspace_idx ON proj_workflows (workspace_id);
-- The as-of lookup's access path: newest publish at or before a position.
CREATE INDEX proj_workflows_published_at_idx ON proj_workflows (workflow_id, published_workspace_seq);

-- Down Migration

DROP TABLE proj_workflows;
