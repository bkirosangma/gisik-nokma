# Provenance

Verbatim snapshot of `tracker/` from the private repository
`github.com/bkirosangma/convenience-corner`, taken 2026-08-19 at commit
`24e2240cbe742cf4b72189bcb444cfcfc6ff6031` ("The tracker learns a calendar,
and only what is true gets a bar", PR #80).

Files: `tracker.html`, `README.md`, `board.json` (authored attention),
`board.data.js` (generated view — a data snapshot, current as of the commit
above), `tools/build_tracker.py`, `tools/test_build_tracker.py`.

**This directory is frozen.** Nothing here is edited in this repository —
the base evolves upstream, and an updated snapshot replaces this directory
wholesale, with the new commit hash recorded here.

What runs standalone: `tracker.html` (open it from a checkout; `file:` URLs
are a supported, tested path — upstream test case 4.12). What does not: the
generator, whose origins (README roadmap checkboxes, `test-cases/`,
`operations/` records, `design-system/tokens.json`) live in the upstream
repository. Its 73 unit tests document the behaviour the product will
generalise.
