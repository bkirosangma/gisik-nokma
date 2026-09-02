-- Up Migration

-- Projection: full text over every ticket's title, description and comments
-- (spec §7, Plan 5 Task 6). Rebuildable from `ticket.created`,
-- `ticket.field_set` (title, description) and `comment.added`; never authored.
--
-- One row per ticket, holding the three TEXT sources separately and one
-- GENERATED `tsvector` over them. The text columns are kept rather than thrown
-- away after indexing because the search route has to produce a SNIPPET, and
-- because a stored `tsv` is not readable back into the words it came from.
--
-- ## Visibility is NOT here
--
-- This table holds every ticket's text, exactly as proj_tickets holds every
-- ticket's state. Who may see a row is decided at READ time, by
-- `visibleTicketsWhere` joined against proj_visibility. Filtering at index time
-- would put a permission decision inside a rebuildable projection, where it
-- would go stale the moment an audience changed without a new ticket event.
--
-- ## The weights, and the configuration
--
-- `setweight(..., 'A'/'B'/'C')` over title/description/comments so ranking can
-- prefer a title hit; `ts_rank` reads those labels, `@@` does not, so nothing
-- that merely MATCHES can observe them (test/projections/search.test.ts asserts
-- them against `tsv::text`, the only place they are visible).
--
-- The configuration is `'simple'` and NOT `'english'`: this product's audience
-- writes in more than one language, and an English stemmer applied to Garo,
-- Hindi or Bengali text does not merely fail to help — it conflates words that
-- share an English-looking suffix. The cost is honest and is accepted: `return`
-- does not match `returns`. Flagged in the plan's Open questions; the day it is
-- revisited, the query side (`compileFilterSpec`'s text clause and the search
-- route) names the same configuration and both must move together.
--
-- The two-argument `to_tsvector('simple', …)` is required, not stylistic: the
-- single-argument form reads `default_text_search_config` and is merely STABLE,
-- so a generated column over it is rejected outright.
--
-- ## Every column type has an equality operator, `tsvector` included
--
-- tools/verify-projections.ts diffs the shadow rebuild against live with
-- `EXCEPT`, which needs an equality operator on EVERY column — the reason
-- `json` is banned as a projection column type in this repo. `tsvector` is a
-- NEW column-type class here, so it was PROVEN by execution rather than argued
-- from the type name: an executed `EXCEPT` over a populated shadow copy of this
-- table returns a row count, and a planted live corruption is reported in both
-- directions with the tsvector differing along with the text it is generated
-- from. `test/projections/search.test.ts` is that proof, and it asserts the
-- table is non-empty first, since a clean verdict over an empty table proves
-- nothing.
--
-- `CREATE TABLE … (LIKE … INCLUDING ALL)` — how the verifier makes its shadow
-- copy — carries GENERATED columns and the indexes below, so the shadow copy
-- regenerates `tsv` from the text the replay inserts.

CREATE TABLE proj_search (
  ticket_id    text PRIMARY KEY,
  workspace_id text NOT NULL,
  project_id   text NOT NULL,
  title        text NOT NULL DEFAULT '',
  description  text NOT NULL DEFAULT '',
  comments     text NOT NULL DEFAULT '',
  tsv          tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(comments, '')), 'C')
  ) STORED
);

CREATE INDEX proj_search_tsv_idx ON proj_search USING gin (tsv);
CREATE INDEX proj_search_workspace_idx ON proj_search (workspace_id);

COMMENT ON TABLE proj_search IS 'Projection: every ticket''s searchable text (title, description, comments) and the weighted tsvector over it. Rebuildable from ticket.created, ticket.field_set and comment.added; never authored. Holds EVERY ticket — visibility is applied at read time, not at index time.';

COMMENT ON COLUMN proj_search.title IS 'The ticket''s current title, from ticket.created and any later ticket.field_set on fieldId title. Weight A.';
COMMENT ON COLUMN proj_search.description IS 'The current description rendered to plain text by docToPlainText — never the document JSON, which would make every structural key ("paragraph", "doc") a searchable word. Weight B.';
COMMENT ON COLUMN proj_search.comments IS 'Every comment ever added to this ticket, newline-separated in ledger order, each rendered by docToPlainText so a mention indexes as @label. Append-only: a comment is a claim on the ticket''s history and is never replaced by the next one. Weight C.';
COMMENT ON COLUMN proj_search.tsv IS 'GENERATED ALWAYS from the three text columns with the ''simple'' configuration (no stemming — the audience writes in more than one language). Never written by the projection; it follows the text.';

-- Down Migration

DROP TABLE proj_search;
