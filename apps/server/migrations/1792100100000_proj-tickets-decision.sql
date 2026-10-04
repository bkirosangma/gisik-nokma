-- Up Migration

-- Workflow and Timeline graphs T5 (DC-4, PS-2): a Decision's current outcome and its pass records, projected from
-- TicketState.outcome / TicketState.passes. Both are brand new members of a brand new event type, so every existing row is
-- correctly NULL / '[]' and no rebuild is needed.
ALTER TABLE proj_tickets
  ADD COLUMN outcome text NULL,
  ADD COLUMN passes jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN proj_tickets.outcome IS 'A Decision''s current outcome label, or NULL (never decided, cleared, or released by a loop reset). Folded from ticket.decided.';
COMMENT ON COLUMN proj_tickets.passes IS 'A Decision''s pass records, oldest first: [{pass, outcome, by, at, revisions:[{from,to,by,at}]}]. ''[]'' until the first choice.';

-- Down Migration

ALTER TABLE proj_tickets
  DROP COLUMN passes,
  DROP COLUMN outcome;
