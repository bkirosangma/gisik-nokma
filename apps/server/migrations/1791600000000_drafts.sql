-- Up Migration
-- Drafts T2 (spec docs/superpowers/specs/2026-10-03-drafts-design.md §4.1, §6.3, R19, R28).
--
-- 1. The draft flag, projected from TicketState.draft. NULL for every ticket that is not a draft
--    (every existing row). `draft_author_id` is the audience mirror on proj_visibility (every
--    v-joined read already has it) and the head state on proj_tickets (the engine and the t-joined
--    reads have it). `draft_at` and `draft_discarded` exist so rowToTicketState can rebuild
--    TicketState.draft exactly (the dual-client rig compares whole states with toEqual).
ALTER TABLE proj_tickets
  ADD COLUMN draft_author_id text NULL,
  ADD COLUMN draft_at timestamptz NULL,
  ADD COLUMN draft_discarded boolean NULL;
ALTER TABLE proj_visibility
  ADD COLUMN draft_author_id text NULL;

-- Partial: drafts are the rare rows. The hot path is `draft_author_id IS NULL` (every view ANDs it), which
-- an index on the non-null rows cannot serve; these indexes serve the author's own list and the sweep.
CREATE INDEX proj_tickets_drafts_idx ON proj_tickets (workspace_id, draft_author_id) WHERE draft_author_id IS NOT NULL;
CREATE INDEX proj_visibility_drafts_idx ON proj_visibility (workspace_id, draft_author_id) WHERE draft_author_id IS NOT NULL;

COMMENT ON COLUMN proj_tickets.draft_author_id IS 'The author of a DRAFT ticket, or NULL. A draft is private to this user alone (owner, admins and the assignee included), has no key, and is on no board or list. Cleared by ticket.published. Drafts spec R17-R19.';
COMMENT ON COLUMN proj_tickets.draft_at IS 'The serverTime of the ticket.created {draft:true} that made this a draft, or NULL.';
COMMENT ON COLUMN proj_tickets.draft_discarded IS 'TRUE once the author has submitted ticket.discarded and the erasure has not yet landed (it is a crash window; the sweep finishes it). NULL for a draft not discarded and for every non-draft.';
COMMENT ON COLUMN proj_visibility.draft_author_id IS 'Mirror of proj_tickets.draft_author_id, so the shared visibility predicates can close a draft without joining proj_tickets. NULL for every non-draft.';

-- 2. purge_ledger keeps the NUMBERING ROWS (spec §6.3). A ticket's key is its position among its project's
--    non-draft ticket.created rows plus its ticket.published rows. A purge redacts ticket.created to
--    {projectId, purged: true}, plus draft: true when the original said so, so a purged unpublished draft
--    is still NOT counted — and redacts ticket.published to {projectId, purged: true} instead of deleting
--    it, so a purged published draft keeps its slot. Every other event of the set is deleted as before.
CREATE OR REPLACE FUNCTION purge_ledger(p_kind text, p_id text)
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
       SET payload = CASE
             WHEN e.type = 'ticket.created' AND e.payload->>'draft' = 'true'
               THEN jsonb_build_object('projectId', e.payload->>'projectId', 'purged', true, 'draft', true)
             ELSE jsonb_build_object('projectId', e.payload->>'projectId', 'purged', true)
           END
      FROM pg_temp.purge_set s
     WHERE e.entity_kind = s.set_kind AND e.entity_id = s.set_id
       AND e.type IN ('ticket.created', 'ticket.published');
    DELETE FROM events e
     USING pg_temp.purge_set s
     WHERE e.entity_kind = s.set_kind AND e.entity_id = s.set_id
       AND e.type NOT IN ('ticket.created', 'ticket.published');
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
REVOKE EXECUTE ON FUNCTION purge_ledger(text, text) FROM PUBLIC;

-- 3. The append-only trigger admits exactly the three redactions and nothing else. The column-equality
--    guard is the original's; only the payload test grew.
CREATE OR REPLACE FUNCTION events_append_only() RETURNS trigger AS $$
DECLARE
  v_key text;
  v_sanctioned boolean := false;
  v_redacted jsonb;
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
  -- The one redaction this row may take, computed before the test: PL/pgSQL ends an IF condition at the
  -- first THEN, so a CASE inside the condition cannot be written there.
  IF OLD.type = 'ticket.created' AND OLD.payload->>'draft' = 'true' THEN
    v_redacted := jsonb_build_object('projectId', OLD.payload->>'projectId', 'purged', true, 'draft', true);
  ELSE
    v_redacted := jsonb_build_object('projectId', OLD.payload->>'projectId', 'purged', true);
  END IF;
  IF OLD.type IN ('ticket.created', 'ticket.published')
     AND NEW.payload = v_redacted
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

-- The bodies of 1790600000000_purge-engine.sql, verbatim.
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

CREATE OR REPLACE FUNCTION purge_ledger(p_kind text, p_id text)
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
REVOKE EXECUTE ON FUNCTION purge_ledger(text, text) FROM PUBLIC;

DROP INDEX proj_visibility_drafts_idx;
DROP INDEX proj_tickets_drafts_idx;
ALTER TABLE proj_visibility DROP COLUMN draft_author_id;
ALTER TABLE proj_tickets DROP COLUMN draft_discarded, DROP COLUMN draft_at, DROP COLUMN draft_author_id;
