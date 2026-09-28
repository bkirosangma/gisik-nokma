-- Up Migration
-- Trash series, Plan 2 (spec docs/superpowers/specs/2026-09-23-trash-and-purge-design.md §5.2).
--
-- purged_entities: every erased (kind, id), content-free (deviation D2). Rebuild replays by
-- entity, not by time, so a projection folding a SURVIVING event that names a purged id
-- consults this registry, live and on rebuild alike. It is NOT a projection: never reset.
CREATE TABLE purged_entities (
  entity_kind  text        NOT NULL,
  entity_id    text        NOT NULL,
  workspace_id text        NOT NULL,
  purged_at    timestamptz NOT NULL,
  PRIMARY KEY (entity_kind, entity_id)
);
CREATE INDEX purged_entities_workspace_idx ON purged_entities (workspace_id, entity_kind);
COMMENT ON TABLE purged_entities IS 'Every entity a permanent purge erased: kind, id, workspace, instant. Content-free. Read by the ingest door (refuse), by projections folding surviving references, and by Plan 3''s replica. Never reset, never rebuilt.';

-- purge_pending_objects: attachment object keys whose rows the purge deleted; the objects
-- are deleted AFTER commit and a failure stays queued for the next sweep (spec §5.2).
CREATE TABLE purge_pending_objects (
  object_key text        PRIMARY KEY,
  queued_at  timestamptz NOT NULL,
  attempts   integer     NOT NULL DEFAULT 0,
  last_error text        NULL
);
COMMENT ON TABLE purge_pending_objects IS 'Attachment object keys a purge has orphaned, awaiting deletion from the object store. A row leaves only when its delete succeeded.';

-- The erasure set (spec §5.2), computed from projections. A project also takes every ticket
-- whose ticket.created names it — one purged individually earlier has no proj_tickets row
-- but still has its redacted creation and tombstone (deviation D11).
CREATE FUNCTION purge_erasure_set(p_kind text, p_id text)
RETURNS TABLE (set_kind text, set_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT e.entity_kind, e.entity_id FROM events e
   WHERE p_kind = 'workspace' AND e.workspace_id = p_id
  UNION
  SELECT 'project'::text, p_id WHERE p_kind = 'project'
  UNION
  SELECT 'ticket'::text, t.ticket_id FROM proj_tickets t
   WHERE p_kind = 'project' AND t.project_id = p_id
  UNION
  SELECT 'ticket'::text, e.entity_id FROM events e
   WHERE p_kind = 'project' AND e.entity_kind = 'ticket' AND e.type = 'ticket.created'
     AND e.payload->>'projectId' = p_id
  UNION
  SELECT 'note'::text, n.note_id FROM proj_notes n
   WHERE p_kind = 'project' AND n.home_project_id = p_id
  UNION
  SELECT 'ticket'::text, p_id WHERE p_kind = 'ticket'
  UNION
  SELECT 'ticket'::text, s.ticket_id FROM (
    WITH RECURSIVE subtree(ticket_id) AS (
      SELECT t.ticket_id FROM proj_tickets t WHERE p_kind = 'ticket' AND t.ticket_id = p_id
      UNION
      SELECT c.ticket_id FROM proj_tickets c JOIN subtree ON c.parent_id = subtree.ticket_id
    )
    SELECT ticket_id FROM subtree
  ) s
  UNION
  SELECT 'note'::text, p_id WHERE p_kind = 'note';
$$;

-- The ONE sanctioned ledger path (spec §5.2, deviation D1). Builds the transaction-scoped
-- set, sets the transaction-local sanction, then deletes — or, for a ticket purge, redacts
-- each ticket.created in place so later keys do not shift (spec §5.4).
CREATE FUNCTION purge_ledger(p_kind text, p_id text)
RETURNS TABLE (erased_kind text, erased_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_key text := p_kind || ':' || p_id;
BEGIN
  IF p_kind NOT IN ('workspace', 'project', 'ticket', 'note') THEN
    RAISE EXCEPTION 'purge_ledger: unknown kind %', p_kind;
  END IF;
  DROP TABLE IF EXISTS pg_temp.purge_set;
  CREATE TEMP TABLE purge_set (
    set_kind  text NOT NULL,
    set_id    text NOT NULL,
    purge_key text NOT NULL,
    PRIMARY KEY (set_kind, set_id)
  ) ON COMMIT DROP;
  INSERT INTO pg_temp.purge_set (set_kind, set_id, purge_key)
    SELECT s.set_kind, s.set_id, v_key FROM purge_erasure_set(p_kind, p_id) s;
  PERFORM set_config('gisik.purge', v_key, true);
  IF p_kind IN ('ticket', 'note') THEN
    UPDATE events e
       SET payload = jsonb_build_object('projectId', e.payload->>'projectId', 'purged', true)
      FROM pg_temp.purge_set s
     WHERE e.entity_kind = s.set_kind AND e.entity_id = s.set_id AND e.type = 'ticket.created';
    DELETE FROM events e
     USING pg_temp.purge_set s
     WHERE e.entity_kind = s.set_kind AND e.entity_id = s.set_id AND e.type <> 'ticket.created';
  ELSE
    DELETE FROM events e
     USING pg_temp.purge_set s
     WHERE e.entity_kind = s.set_kind AND e.entity_id = s.set_id;
  END IF;
  DELETE FROM snapshots sn
   USING pg_temp.purge_set s
   WHERE sn.entity_kind = s.set_kind AND sn.entity_id = s.set_id;
  RETURN QUERY SELECT s.set_kind, s.set_id FROM pg_temp.purge_set s ORDER BY s.set_kind, s.set_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION purge_erasure_set(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION purge_ledger(text, text) FROM PUBLIC;

-- The append-only trigger, replaced (spec §5.2). TRUNCATE first: the same function backs a
-- STATEMENT trigger, which has no OLD. DELETE is sanctioned only for a row whose
-- (entity_kind, entity_id) is in THIS transaction's purge_set under THIS transaction's key;
-- UPDATE only for that row's ticket.created, and only to the exact redaction. Every refusal
-- keeps the original message.
CREATE OR REPLACE FUNCTION events_append_only() RETURNS trigger AS $$
DECLARE
  v_key text;
  v_sanctioned boolean := false;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'events is append-only: % refused', TG_OP;
  END IF;
  v_key := current_setting('gisik.purge', true);
  IF v_key IS NOT NULL AND v_key <> '' AND to_regclass('pg_temp.purge_set') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM pg_temp.purge_set WHERE set_kind = $1 AND set_id = $2 AND purge_key = $3)'
      INTO v_sanctioned
      USING OLD.entity_kind, OLD.entity_id, v_key;
  END IF;
  IF NOT v_sanctioned THEN
    RAISE EXCEPTION 'events is append-only: % refused', TG_OP;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF OLD.type = 'ticket.created'
     AND NEW.payload = jsonb_build_object('projectId', OLD.payload->>'projectId', 'purged', true)
     AND (NEW.id, NEW.workspace_id, NEW.entity_kind, NEW.entity_id, NEW.type, NEW.version, NEW.actor_id,
          NEW.origin, NEW.client_time, NEW.server_time, NEW.seq, NEW.workspace_seq)
         IS NOT DISTINCT FROM
         (OLD.id, OLD.workspace_id, OLD.entity_kind, OLD.entity_id, OLD.type, OLD.version, OLD.actor_id,
          OLD.origin, OLD.client_time, OLD.server_time, OLD.seq, OLD.workspace_seq) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'events is append-only: % refused', TG_OP;
END;
$$ LANGUAGE plpgsql;

-- Down Migration

-- The original body, verbatim (1787841717635_events-and-snapshots.sql:29-33).
CREATE OR REPLACE FUNCTION events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'events is append-only: % refused', TG_OP;
END;
$$ LANGUAGE plpgsql;
DROP FUNCTION purge_ledger(text, text);
DROP FUNCTION purge_erasure_set(text, text);
DROP TABLE purge_pending_objects;
DROP TABLE purged_entities;
