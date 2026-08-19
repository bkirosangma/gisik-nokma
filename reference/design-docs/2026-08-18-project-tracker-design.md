# Project tracker — design

**Date:** 2026-08-18
**Status:** approved

A Jira-style tracker that lives in the repository, is read by the owner and updated by
Claude Code, and cannot become a second copy of the work queue.

## The problem

Four places in this repository already hold task state:

| Origin | Items | State it carries |
|---|---|---|
| README *Roadmap to production*, Phases 0–9 | ~60 bullets | `- [ ]` / `- [x]` |
| README *Week 1 checklist* | 10 bullets | `- [ ]` / `- [x]` |
| `test-cases/*.md` | 69 cases | `❌ ✅ 🟡 🧪 🚫` |
| `operations/{registrations,people}/` | 19 records | frontmatter `status`, week numbers |

None of them can say **in progress**, **blocked**, or **look at this one first**. That is the
gap the tracker fills, and it is the *only* gap it may fill. A tracker that restated the
titles, the ordering and the completion state of those four origins would be a fifth copy of
the work queue — the defect class test case 1.46 spent this project's effort removing, and
the one `STATUS.md`, `tokens.ts` and the §9 gate list are each generated to avoid.

## The rule that shapes everything below

> **The origins own truth. The tracker owns attention.**

Existence, title and *done* come from the origin file. Whether something is in flight,
stuck, or worth looking at today comes from the tracker. `done` is **not a legal value** in
the tracker's authored state, so the tracker cannot claim a task is finished that the README
checkbox says is not.

## Layout

```
tracker/
  README.md                  what it is, how to update it, what the gate checks
  tracker.html               the viewer — no data inside, no dependencies
  board.json                 AUTHORED. Attention state only.
  board.data.js              GENERATED. `window.CC_TRACKER = {…}`. Never edited.
  tools/build_tracker.py     the join + generator + `--check`
  tools/test_build_tracker.py
```

### Why the generated file is `.js` and the authored one is `.json`

Chrome blocks both `fetch()` and ES `import` on `file://` — the origin is `null` and every
such request fails CORS. A tracker that fetched its own JSON would open blank when
double-clicked, which is the only way this file is ever going to be opened. A classic
`<script src="./board.data.js">` has no such restriction.

So the authored file stays `.json` — diffable, and readable by a Python tool without an
eval — and the browser is handed a generated `.js` wrapper around the joined result. The
`.js` is derived, so the split costs nothing and buys a viewer that works from the
filesystem with no server and no build step.

## The ID grammar

Every tracker item is keyed by an ID that names its origin.

| ID form | Origin | Stability |
|---|---|---|
| `case:1.12` | `test-cases/0N-*.md` | The repo already forbids renumbering. Stable. |
| `ops:duns` | `operations/{registrations,people}/duns.md` | Filename stem. Stable. |
| `roadmap:p1-append-only-ledger` | a README roadmap bullet | Slug of the bullet text. Breaks **loudly** when the prose is edited. |
| `task:<slug>` | none — tracker-native | Carries its own title in `board.json`. |

**Roadmap IDs are slugs, not positions.** With positional IDs (`roadmap:1.3` = the third
bullet of Phase 1) inserting a single bullet silently re-points every flag below it onto a
different task — a wrong answer that nothing announces. A slug that no longer matches any
bullet is a gate failure naming the missing ID and suggesting the closest current one. A
loud break beats a silent wrong.

`build_tracker.py --ids` prints every ID the origins currently offer, so an ID is copied
rather than guessed.

## `board.json` — the authored file

```json
{
  "updated": "2026-08-18",
  "attention": { "slack_weeks": 6, "stale_days": 14 },
  "items": {
    "ops:accountant-hsn-digits": { "state": "next", "note": "6w slack — tightest in the plan" },
    "roadmap:p1-append-only-ledger": { "state": "in-progress", "since": "2026-08-18" },
    "case:1.12": { "state": "blocked", "blocked_by": "roadmap:p1-append-only-ledger" }
  },
  "tasks": {
    "task:hosting-region": { "lane": "kiro", "title": "Pick Mumbai host + managed Postgres" }
  }
}
```

**Allowed keys per item:** `state`, `note`, `since`, `blocked_by`, `lane`.
For `tasks` only, additionally: `title` (required), `body`, `epic`.

**`state` ∈ `later` · `next` · `in-progress` · `blocked`.** There is no `done`.

An item absent from `board.json` defaults to `later` when its origin is open and `done` when
its origin is closed. That default is what keeps the authored file small: it lists only what
is actively flagged, not all 158 items.

### What the tool refuses

1. An ID no origin offers — with the nearest current ID suggested.
2. A key outside the allowlist, or a `state` outside the four.
3. `blocked_by` naming an ID that does not resolve.
4. `state: "in-progress"` (or `next`, or `blocked`) on an item whose origin is already
   closed — a contradiction between the tracker and the file that owns the truth.
5. `"done"` anywhere in `state`, with the reason given rather than a bare rejection.
6. A stale `board.data.js`.

Rules 4 and 5 are the ones that matter: they are what make "the origins own done"
enforceable rather than merely stated.

## Lanes, and not counting anything twice

Lane is derived from the ID — `ops:*` → **Yours**, `roadmap:*` and `case:*` → **Claude
Code** — and overridable per item with `lane`.

Two dedup rules keep one task from appearing in both lanes:

- **The README Week-1 checklist is not read at all.** All ten of its items are registrations
  or questions that `operations/` already owns, and `STATUS.md` already reports.
- **Roadmap bullets that restate a registration fold into that registration.** The ops
  record carries a `roadmap_alias:` line in its frontmatter naming the bullet text; the
  generator drops the bullet and keeps the record. The fact lives once, in the record.
  `status.py` ignores frontmatter keys it does not know, so nothing there changes.

## Views

Three, all read-only.

**Focus** — the default. Two columns, *Claude Code* and *Yours*, each showing Now then Next.
Above them a **Needs attention** strip, computed rather than authored:

- everything `blocked`
- everything `in-progress`
- any `ops:` item whose slack has fallen to `attention.slack_weeks` or below
- any `ops:` item past its `clears_week` while still `not-started` / `not-asked`
- anything `in-progress` for longer than `attention.stale_days`

**Board** — Jira columns Later · Next · In progress · Blocked · Done, with a lane filter.

**Backlog** — grouped by epic (Phase 0–9, each test-case section, Registrations, Questions).
One row per item with a status chip; clicking opens a detail overlay carrying the
description, dependencies, week and slack, blocked-by, and a link to the origin file. `Esc`
closes.

## Colour

The generator emits CSS custom properties from `design-system/tokens.json` into
`board.data.js`. No hex is authored in `tracker.html`, making the tracker a third consumer
of the one colour origin after `MASTER.md` and `packages/config/src/tokens.ts`.

This is deliberate rather than decorative. `validate_contrast.py` globs
`design-system/pages/` and `design-system/prototypes/` relative to the document it is given;
`tracker/` is outside its reach entirely, so an invented hex there would pass every gate in
the repository. The file is safe because it is **derived**, not because it is scanned —
exactly the argument §9 already makes for `tokens.ts`.

Typography is a system stack. Brother 1816's embedding licence is an open question in
`operations/people/owner-font-licence.md`, and this is an internal tool.

## The gate

```sh
python3 tracker/tools/build_tracker.py --check
```

A gate, recorded in `MASTER.md` §9 in the same change set as the tool, per §9's own rule.
`run_gates.py` reads the command from §9, so no second copy is created.

## Change set

| File | Change |
|---|---|
| `tracker/` | six new files |
| `design-system/MASTER.md` §9 | gate 8, its expected-counts line, and why the tracker is derived; "All seven" → eight |
| `design-system/tools/test_run_gates.py` | fixture asserting the exact §9 command list |
| `CLAUDE.md` | "Seven commands today" → eight |
| `README.md` | link near the top; `tracker/` in the repository-layout block |
| `Features.md` §4 + `test-cases/04-tracker.md` | same change set, per the workspace rule |
| `operations/registrations/duns.md` and any other aliased record | `roadmap_alias:` frontmatter |
| spec project `978e4560-806d-4e79-87d4-690731b736df` | push `MASTER.md` and **byte-verify**, in this commit — §9 changed, and that push has silently failed three times |

## Out of scope for v1

Read-only. No drag-and-drop, no in-browser editing, no `localStorage`. The owner reads;
Claude Code edits `board.json` and re-runs the generator. Editing is straightforward to add
later and costs nothing to defer.

The tracker is a **repository tool, not a product surface**. It is not built in Claude
Design and not vendored into `design-system/prototypes/`; the standing rule that prototypes
are authored in Claude Design does not reach it.

## Testing

`tracker/tools/test_build_tracker.py`, Python standard library only like every other tool
here, so the gates still run on a bare checkout with nothing installed. It covers each
refusal above against planted fixtures, determinism of the generated output, the lane
derivation, the dedup rules, and the live repository files — the posture `test_status.py`
and `test_run_gates.py` already take.
