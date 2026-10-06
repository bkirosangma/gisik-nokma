-- Up Migration

-- Who created each ticket (my-work-global T1, spec D1, owner 2026-10-05). The
-- attention route's `show=created` arm filters on this column.
--
-- The creator is the actor of the ticket's `ticket.created` event, which the
-- ledger has always recorded; until now no projection carried it, and
-- `check-permission.ts`'s `getTicketCreator` read it from `events` directly.
-- The projection writes it on `ticket.created` and on nothing else (it is
-- absent from `upsertTicket`'s ON CONFLICT update list, like `workspace_id`).
--
-- The backfill reads each ticket's FIRST `ticket.created` by `seq`, the claim a
-- rebuild replays first. The engine refuses a second `ticket.created` for an
-- existing ticket (`ticket.already-exists`, rule-engine `checks/hierarchy.ts`),
-- so a ticket has exactly one and the order picks the same row either way; it
-- is written as `seq` so the backfill and a rebuild cannot disagree if that
-- ever changes. Nullable: a `proj_tickets` row with no creation event in the
-- ledger cannot be produced by the projection, and a migration that failed a
-- live deploy over one would be worse than a NULL the read treats as "nobody".

ALTER TABLE proj_tickets ADD COLUMN created_by text NULL;

UPDATE proj_tickets t
   SET created_by = c.actor_id
  FROM (
    SELECT DISTINCT ON (entity_id) entity_id, actor_id
      FROM events
     WHERE entity_kind = 'ticket' AND type = 'ticket.created'
     ORDER BY entity_id, seq
  ) c
 WHERE c.entity_id = t.ticket_id;

CREATE INDEX proj_tickets_ws_created_by ON proj_tickets (workspace_id, created_by);

COMMENT ON COLUMN proj_tickets.created_by IS 'The actor of the ticket.created event (my-work-global T1). Written once on insert; never updated. Backfilled from each ticket''s first ticket.created; reproducible from the ledger, so verify-projections diffs it.';

-- Down Migration

DROP INDEX IF EXISTS proj_tickets_ws_created_by;
ALTER TABLE proj_tickets DROP COLUMN IF EXISTS created_by;
