-- Up Migration

-- leads_to (workflow-timeline-graphs LK-5): widen the kind CHECK, add the label. The primary key stays
-- (source_id, target_id, kind), so at most one leads_to per ordered pair. The inline CHECK of
-- 1791700000000_proj-ticket-links.sql got Postgres' automatic name `<table>_<column>_check`; the DROP has no
-- IF EXISTS, so a wrong name fails loudly.
ALTER TABLE proj_ticket_links DROP CONSTRAINT proj_ticket_links_kind_check;
ALTER TABLE proj_ticket_links ADD CONSTRAINT proj_ticket_links_kind_check CHECK (kind IN ('blocks','relates','duplicates','leads_to'));
ALTER TABLE proj_ticket_links ADD COLUMN label text NULL;
ALTER TABLE proj_ticket_links ADD CONSTRAINT proj_ticket_links_label_check CHECK (label IS NULL OR kind = 'leads_to');
COMMENT ON COLUMN proj_ticket_links.label IS 'A leads_to branch label (the outcome name of a Decision), NULL when none and always NULL on other kinds.';

-- Down Migration

DELETE FROM proj_ticket_links WHERE kind = 'leads_to';
ALTER TABLE proj_ticket_links DROP CONSTRAINT proj_ticket_links_label_check;
ALTER TABLE proj_ticket_links DROP COLUMN label;
ALTER TABLE proj_ticket_links DROP CONSTRAINT proj_ticket_links_kind_check;
ALTER TABLE proj_ticket_links ADD CONSTRAINT proj_ticket_links_kind_check CHECK (kind IN ('blocks','relates','duplicates'));
