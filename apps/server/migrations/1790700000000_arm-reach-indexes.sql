-- Up Migration
-- Access follow-ups R1 (2026-09-29): the assignee arm now walks DOWN from every
-- ticket assigned to the viewer through inheriting children. The walk starts from
-- proj_tickets.assignee_id, which had no index (measured: no migration indexes it);
-- the recursive step uses the existing proj_visibility_children (parent_id).
--
-- Additive and safe for the OLD code while it applies: one plain CREATE INDEX IF NOT
-- EXISTS, no column change, no rewrite. It runs inside the migration's transaction, so it
-- cannot be CONCURRENTLY: it holds a SHARE lock on proj_tickets for the build, which
-- blocks writes (never reads) for as long as the build takes.
CREATE INDEX IF NOT EXISTS proj_tickets_assignee_idx ON proj_tickets (assignee_id);

-- Down Migration
DROP INDEX IF EXISTS proj_tickets_assignee_idx;
