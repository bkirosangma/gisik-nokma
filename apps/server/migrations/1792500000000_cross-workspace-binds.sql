-- Up Migration

-- task/notes-cross-workspace-followup (18.523, 18.524).
--
-- 1. A project purge takes the notes homed in that project OF ITS OWN WORKSPACE. Before 18.520, a note.moved could
--    file a note of one workspace under a project of another, and `purge_erasure_set` took notes by
--    `home_project_id` alone, so purging that project erased the other workspace's note: its rows AND its ledger.
--    Now that note survives, homed in an id no read shows (`NOTE_HOME_SQL`), and the project-delete preview
--    (`read/deleted-items.ts`) counts what this set takes. The body is 1790600000000's, the note arm aside;
--    CREATE OR REPLACE keeps the function's owner and its REVOKE.
CREATE OR REPLACE FUNCTION purge_erasure_set(p_kind text, p_id text)
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
     AND n.workspace_id = (SELECT p.workspace_id FROM proj_projects p WHERE p.project_id = p_id)
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

-- 2. The reopens that name a child (`cause.childTicketId`), for the door's question at a ticket's birth: does a reopen
--    in ANOTHER workspace already name this id (`check-permission.ts`, `namedAsChildElsewhere`)? Partial, so it holds
--    only transitions, and a transition with no cause indexes a NULL.
CREATE INDEX events_reopen_child_idx ON events ((payload #>> '{cause,childTicketId}')) WHERE type = 'ticket.transitioned';

-- Down Migration

DROP INDEX events_reopen_child_idx;

CREATE OR REPLACE FUNCTION purge_erasure_set(p_kind text, p_id text)
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
