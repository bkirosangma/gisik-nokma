# Gisik Nokma

Project management software. *Gisik* — mind, memory; *nokma* — the village custodian who holds the community's affairs in trust. **The keeper of memory**: a tool whose board structurally cannot lie about the work.

**Status: pre-brainstorm.** Nothing about the product is designed yet — not the audience, not the data model, not the stack. The design session starts from `docs/brainstorm-kickoff.md`. What exists here is the base it will start from.

## The base

`reference/convenience-corner-tracker/` is a verbatim snapshot of the project tracker built inside the [convenience-corner](https://github.com/bkirosangma/convenience-corner) repository (snapshot at commit `24e2240`, 2026-08-19). Open `reference/convenience-corner-tracker/tracker.html` in a browser — it runs standalone from a `file:` URL with its snapshot data, four views included (Focus, Board, Backlog, Calendar).

The generator (`tools/build_tracker.py`, 73 tests) is included as reference; it reads that repository's origin files (README roadmap, `test-cases/`, `operations/`, `tokens.json`) and will not run here. That is expected — the snapshot is provenance, not a dev environment.

`reference/design-docs/` holds the three documents that designed the base: the tracker itself, the calendar view, and the calendar's implementation plan.

## What the base proved (the ideas worth generalising)

1. **Origins own facts; the board owns attention.** Task state lives in the files that own the work; the board may only say *later / next / in-progress / blocked* about them. `done` is not a legal value on the board — completion is recorded at the origin, so the board cannot claim finished work that isn't.
2. **The view is generated; attention is authored.** A deterministic generator joins the origins with one small authored file, and a freshness gate (`--check`) refuses a stale view.
3. **Refusals over good intentions.** The generator rejects unknown ids, flags on done items, contradictions between authored claims (a due date past the record's own needed-by week), and half-recorded facts.
4. **No invented data, anywhere.** The calendar renders only real dates — authored plans, actual record spans, derived waits — and an undated item is absent, not estimated. Deadline markers are labelled as the record's *claim*, never as "due".
5. **Checks are proven against planted defects** before they are trusted.

## What the base cannot answer (the brainstorm's job)

The base is one static HTML file over one repository's files, for one user who edits JSON by hand. A *product* must decide: who it is for, how "origins" generalise beyond a monorepo, whether data is hosted or local, how editing works when users won't hand-edit files, collaboration, and what stack any of that implies. None of that is inherited — it is all open.

## Rules

- `reference/` is **frozen**. It is never edited here — corrections happen upstream and get re-snapshotted with a new commit reference.
- `Features.md` and `test-cases/` follow the workspace conventions from day one.
