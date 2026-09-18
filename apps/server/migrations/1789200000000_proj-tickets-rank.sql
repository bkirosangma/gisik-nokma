-- Up Migration

-- Backlog/closed second wave, spec §8.1 (2026-09-18): the backlog rank key,
-- projected from `TicketState.rank`. NULL for every ticket nobody has ranked —
-- which is every existing row, since nothing could have set one before this
-- migration. `NULL` is the wire's word for "never ranked" (`ListRow.rank` and
-- `TicketCard.rank` are REQUIRED `string | null`), not an absence to omit.
ALTER TABLE proj_tickets
  ADD COLUMN rank text NULL;

-- NO INDEX, and it is a decision rather than an omission. The list route keeps
-- `ORDER BY t.ticket_id` with its keyset cursor (plan ruling R1, `routes/
-- list.ts:143-153`): a `rank ASC NULLS LAST` order would break pagination, so
-- the server never sorts by this column. The Backlog tab sorts CLIENT-side
-- over the full list it already assembles by looping the cursor (ruling P41).
-- An index here would be infrastructure for a query no door makes, and a
-- covering index nobody reads is indistinguishable from a working one.

COMMENT ON COLUMN proj_tickets.rank IS 'The fractional order key of this ticket''s place in its project''s backlog (spec §8.1), or NULL when nobody has ranked it. Meaningful only within one project; the Backlog tab sorts ranked rows by this key and unranked rows after them by ticket_id. Inserting a ticket never renumbers another one — a reorder is a single ticket.ranked carrying the moved ticket''s new key.';

-- Down Migration

ALTER TABLE proj_tickets
  DROP COLUMN rank;
