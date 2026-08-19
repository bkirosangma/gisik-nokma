# tracker

A board for what is actually happening. Open [`tracker.html`](tracker.html) in a browser —
double-clicking the file works, there is no server and no build step.

## What it is, and what it deliberately is not

Four files in this repository already hold task state:

| Origin | What it owns |
|---|---|
| README [Roadmap](../README.md#roadmap-to-production) | every phase bullet, and whether it is ticked |
| [`test-cases/`](../test-cases/) | every case, and its `❌ ✅ 🟡 🧪 🚫` marker |
| [`operations/`](../operations/) | every registration and question, and its `status` |
| [`design-system/tokens.json`](../design-system/tokens.json) | every colour this page draws with |

**None of them can say *in progress*, *blocked*, or *look at this one first*.** That is the
gap the tracker fills, and it is the only gap it may fill.

> The origins own truth. The tracker owns attention.

So `board.json` carries flags and notes, and nothing else. **`done` is not a legal value in
it** — the generator refuses one, with the origin file named. Tick the README checkbox,
flip the test-case marker, or move the record's `status`; the board follows. A tracker that
could mark its own work finished would be a fifth copy of the work queue, which is the
defect [test case 1.46](../test-cases/01-design-system.md) spent this project's effort
removing and `STATUS.md` and `tokens.ts` are each generated to avoid.

## Files

| | |
|---|---|
| [`tracker.html`](tracker.html) | The viewer. Holds no data and no colour of its own. |
| `board.json` | **Authored.** Attention only — the one file you or Claude Code edits. |
| `board.data.js` | **Generated.** Do not edit; `--check` is a gate. |
| [`tools/build_tracker.py`](tools/build_tracker.py) | The join, the refusals, and the generator. |

`board.data.js` is a classic script rather than JSON because Chrome blocks both `fetch` and
module loading on `file:` URLs — and `file:` is the only way this page gets opened.

## Updating it

```sh
python3 tracker/tools/build_tracker.py --ids     # every id the origins currently offer
$EDITOR tracker/board.json                        # flag, note, unflag
python3 tracker/tools/build_tracker.py            # rewrite board.data.js
```

Ids are copied from `--ids`, never guessed. Roadmap ids are slugs of the bullet text, so
editing that prose breaks the flag **loudly** — a gate failure naming the id and suggesting
the closest current one. That is deliberate: with positional ids, inserting one bullet would
silently re-point every flag below it onto a different task.

**Per item:** `state` (`later` · `next` · `in-progress` · `blocked`), `note`, `since`,
`blocked_by`, `lane`. Anything not listed in `board.json` defaults to `later`, or to `done`
if its origin is closed — which is why the authored file stays short.

**Tracker-native work** with no origin at all goes under `tasks` with its own `title`.

## What the three views are for

**Focus** — the default. Two lanes, *Claude Code* (roadmap and test cases) and *Yours*
(paperwork and people, none of which needs code), each showing what is in flight and what is
next. Above them a **Needs attention** strip that is computed rather than authored: anything
blocked, anything in flight, anything whose first-needed week is closing in, and anything
that should have cleared by now and has not.

**Board** — the five columns, filterable by lane.

**Backlog** — everything, grouped by epic. Click a row for the detail and a link to the file
that owns it.

## Two things the tool cannot see

**`operations/` sometimes records one thing twice.** `ops:bank-account` (the registration)
and `ops:owner-bank-account` (the question to the owner) are the same errand from two angles.
The tracker shows both because both records exist; that is a question for `operations/`, not
for this folder.

**Roadmap bullets that restate a registration are folded in by hand.** The ops record carries
a `roadmap_alias:` naming the bullet, and the generator drops the bullet in favour of the
record. Five records carry one today. A compound bullet covering *several* registrations —
Phase 6's DLT and Meta lines — is left alone, because folding it into one record would hide
the other two.
