# Tracker calendar view — design

**Date:** 2026-08-19
**Status:** approved (design agreed in session; this document records it)
**Adds to:** `tracker/tracker.html`, `tracker/tools/build_tracker.py`, `tracker/board.json`

A fourth view for the board: an Asana-style month calendar showing when work starts and ends. The constraint that shapes everything: **most tickets have no dates in any origin**, and this tracker's own comments refuse invented deadlines. So the calendar renders only what is true.

## Decisions

Three were asked and answered rather than assumed.

### 1. Dated items only

Roadmap bullets and test cases carry no dates; putting them on a calendar means fabricating a start and an end for each. **Ruled: the calendar shows only items with real time semantics.** The owner lane's registrations and questions (needed-by weeks, lead-time waits, real filing and asking dates) plus any item the owner schedules. An undated item is absent, not estimated — the same posture as the dashboard's comparison honesty rule, applied to time a second way (the first was the "no countdown" rule already in the page).

### 2. Scheduling is authored in board.json; the page only renders

The tracker is a static `file:` page — it can never write. **Ruled: `board.json` gains two optional keys, `start` and `due`** (ISO dates), drafted by the assistant from each record's needed-by week and adjusted by the owner, by editing the file or asking. A separate `schedule.json` was rejected: a second authored file about the same items is the two-copies-drift shape this repo exists to kill. Scheduling is attention, and `board.json` is the attention file.

Drag-to-reschedule is out of scope permanently — not deferred. The page renders; the file authors. That split is what keeps the tracker gate meaningful.

### 3. Month grid

Asana's Calendar shape, which is what was asked for by name: a month of day cells, Monday-start weeks, ‹ today › navigation, a ring on today. A week-row timeline (Gantt) was offered and declined; "both" was declined as double the build for one PR.

## What renders, from which truth

| Element | Source | Rendering |
|---|---|---|
| Planned task | authored `start` → `due` in board.json | Solid bar, toned by state, spanning the days; wraps per week row |
| Real span | `submitted_on`/`asked_on` → `granted_on`/`answered_on` | Solid bar between real dates — history, kept after done |
| Open wait | `submitted_on`/`asked_on` with no end yet | Hatched bar (░) from the real start to the record's `clears_week` expectation, labelled as waiting — the D-U-N-S's ~30 days renders this way, never authored |
| Needed-by marker | `needed_week` × the README's week-1 anchor (`2026-08-18`, already in the data) | ◆ on the last day of that week (the claim is "by the end of W*n*"), labelled "needed W*n*" — the record's own claim, never the word "due" |

Everything today-relative (current week, open-wait extents, the today ring) is computed **client-side at read time**, preserving the page's documented discipline: the generator emits facts only, or `--check` would fail daily.

## Data model

- `ITEM_KEYS` grows `start` and `due`. The generator refuses: a malformed date, `due` before `start`, either key on an item whose origin records it done (the same class of refusal that already guards `state` flags), and `start`/`due` on an id no origin offers (existing rule, inherited).
- Emitted per item as plain fields. No derived dates are ever written into `board.data.js`.

## The view

A **Calendar** tab beside Focus / Board / Backlog. Month grid; bars and markers as above; clicking any bar or ◆ opens the existing detail sheet; the lane filter and free-text filter apply exactly as in the other views. Styles speak the page's existing token vocabulary; no new colours (the override scan reads this file). Overflow beyond a week row's visible bars collapses to a "+n" chip; clicking it expands that week row to show every bar — at current volume this is expected to be rare.

## The draft schedule

Authored into `board.json` in the implementation PR, presented there as a table for adjustment. The rule: **`due` never exceeds the record's own needed-by week; `start` is a sensible slot before it; nothing is scheduled that is not flagged for attention.** Initial draft covers the flagged-`next` owner errands: the two accountant sends and the store-entity send this week (W1), the D-U-N-S lookup and filing this week, the catalogue-export ask this week, the bank account and DO provisioning in W2, and the small asks (delivery hours, font licence, GitHub plan) spread across W2. Registrations that wait on those (DLT, Meta) are not drafted — they follow the bank account and the entity answer, and scheduling them now would guess at both.

## Testing

- **Generator half**: unit tests written first — accepts a valid `start`/`due`, refuses each invalid shape, and the staleness ratchet covers regeneration. `test_build_tracker` grows accordingly.
- **Renderer half**: the page has no JS harness (recorded at 4.20); verified the same way — `esc()`/`markdown()`-style extraction of the new date arithmetic into node against the real `board.data.js`, plus an eyeball of the rendered month. Recorded as test case **4.21** on the same manual footing as 4.12/4.19/4.20.
- Features.md board bullet and the bucket-4 count update in the same change set.

## Out of scope

Drag-and-drop editing, per-day time-of-day, recurring tasks, a timeline/Gantt view, notifications of approaching needed-by weeks (the Focus view's attention strip already owns "what needs me now").
