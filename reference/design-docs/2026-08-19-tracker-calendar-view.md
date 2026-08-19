# Tracker Calendar View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A month-grid Calendar tab in `tracker/tracker.html` that renders only truthful dates — authored `start`/`due` plans, real record spans, open waits, and needed-by markers — plus the owner's drafted schedule in `board.json`.

**Architecture:** Two halves, same as every tracker change. The generator (`build_tracker.py`) learns two authored keys (`start`, `due`) with refusals, and emits two new fact fields (`started`, `ended`) from ops-record dates; it stays deterministic — nothing today-relative is generated. The page grows a fourth view that computes all today-relative rendering client-side at read time.

**Tech Stack:** Python 3 stdlib + unittest (generator), hand-rolled ES5-ish JS in a single static HTML file (page). No dependencies, no build step — the page must keep working from a `file:` URL.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-19-tracker-calendar-design.md` — dated items only; no invented dates; markers say "needed W*n*", never "due".
- `board.json` holds attention only; `done` remains illegal there; the page never writes.
- Generator determinism: `board.data.js` must be byte-stable given the same inputs (`--check` is gate 7).
- No literal hex colours in `tracker.html` — only the existing `var(--p-*)` / `var(--r-*)` tokens.
- Week 1 anchor is `DATA.week1` = `2026-08-18` (from the README; already emitted). Week *n* = `[week1 + 7(n−1) days, week1 + 7n days)`; its last day is `week1 + (7n − 1) days`.
- All commits on branch `tracker-calendar-view`; gates before push; one PR; no merge without approval.
- Run generator tests from `tracker/tools/`: `python3 -m unittest test_build_tracker -v`.

---

### Task 1: Generator — authored `start`/`due` with refusals

**Files:**
- Modify: `tracker/tools/build_tracker.py` (ITEM_KEYS at line ~47; board application loop at ~318–355)
- Test: `tracker/tools/test_build_tracker.py` (class `TestBoardApplication` or nearest equivalent — add a new class)

**Interfaces:**
- Consumes: existing `_reject`, `ITEM_KEYS`, the board application loop, `items[*]["meta"]["needed_week"]`, module-level week-1 anchor (the `WEEK_ONE` regex result, threaded to the application step — see Step 3).
- Produces: items may carry `"start"` and `"due"` (ISO `YYYY-MM-DD` strings), emitted verbatim into `board.data.js`. Later tasks rely on those exact key names.

- [ ] **Step 1: Write the failing tests**

Find how the existing board-application tests build a board dict + items (grep `superseded` or `matches no origin` in the test file and mirror that fixture style). Add:

```python
class TestSchedule(unittest.TestCase):
    """start/due are authored attention — same gate class as state flags."""

    def apply(self, fields, done=False, needed_week=None, week1="2026-08-18"):
        # Mirror the file's existing helper for applying a board to one item;
        # if none exists, build the minimal items dict the application step takes.
        item = {"id": "ops:duns", "origin_file": "operations/registrations/duns.md",
                "done": done, "state": "later", "origin_state": "later",
                "meta": ({"needed_week": needed_week} if needed_week else {})}
        board = {"items": {"ops:duns": fields}}
        return bt.apply_board(board, {"ops:duns": item}, week1=week1), item

    def test_a_valid_start_and_due_are_accepted_and_kept(self):
        _, item = self.apply({"start": "2026-08-20", "due": "2026-08-21"})
        self.assertEqual(item["start"], "2026-08-20")
        self.assertEqual(item["due"], "2026-08-21")

    def test_a_malformed_date_is_refused(self):
        for bad in ("21-08-2026", "2026-8-21", "tomorrow", "2026-08-32"):
            with self.assertRaises(SystemExit):
                self.apply({"start": bad})

    def test_due_before_start_is_refused(self):
        with self.assertRaises(SystemExit):
            self.apply({"start": "2026-08-22", "due": "2026-08-21"})

    def test_dates_on_a_done_item_are_refused(self):
        # Scheduling finished work is the flag-on-done defect wearing a date.
        with self.assertRaises(SystemExit):
            self.apply({"start": "2026-08-20"}, done=True)

    def test_due_past_the_needed_week_is_refused(self):
        # needed_week 3 ends week1 + 20 days = 2026-09-07. A due after the
        # record's own claim is a contradiction between two authored facts.
        with self.assertRaises(SystemExit):
            self.apply({"start": "2026-09-01", "due": "2026-09-08"}, needed_week="3")
        self.apply({"start": "2026-09-01", "due": "2026-09-07"}, needed_week="3")  # boundary OK
```

Adjust `apply()` to whatever the application function is actually called / signed as (it may be inline in `build()`; if so, extract `apply_board(board, items, week1)` as part of Step 3 and write the test against that name).

- [ ] **Step 2: Run to verify failure**

Run: `cd tracker/tools && python3 -m unittest test_build_tracker.TestSchedule -v`
Expected: FAIL/ERROR (unknown keys `start`, `due`, or missing `apply_board`).

- [ ] **Step 3: Implement**

In `build_tracker.py`:

```python
ITEM_KEYS = {"state", "note", "since", "blocked_by", "lane", "start", "due"}

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

def _parse_iso(item_id: str, key: str, value: str) -> date:
    if not ISO_DATE.match(value):
        _reject(f"{item_id!r} has {key} {value!r} — dates are ISO YYYY-MM-DD.")
    try:
        return date.fromisoformat(value)
    except ValueError:
        _reject(f"{item_id!r} has {key} {value!r}, which is not a real date.")
```

Inside the board application loop, after the `state` handling and before the generic key copy (keep `start`/`due` out of the generic copy loop, or validate before it):

```python
        start_s, due_s = fields.get("start"), fields.get("due")
        if start_s or due_s:
            if item["done"]:
                _reject(f"{item_id!r} carries a schedule but {item['origin_file']} already "
                        "records it as finished. A date on done work is the state-flag "
                        "defect wearing a calendar.")
            start_d = _parse_iso(item_id, "start", start_s) if start_s else None
            due_d = _parse_iso(item_id, "due", due_s) if due_s else None
            if start_d and due_d and due_d < start_d:
                _reject(f"{item_id!r} is due {due_s}, before its start {start_s}.")
            nw = item.get("meta", {}).get("needed_week")
            if due_d and nw and str(nw).isdigit() and week1 is not None:
                week_end = week1 + timedelta(days=7 * int(nw) - 1)
                if due_d > week_end:
                    _reject(f"{item_id!r} is due {due_s}, after its own needed-by week "
                            f"W{nw} ends ({week_end.isoformat()}). The record's claim and "
                            "the schedule disagree; fix one of them.")
            if start_s: item["start"] = start_s
            if due_s: item["due"] = due_s
```

`week1` is already parsed in `build()` (the `WEEK_ONE` regex); thread it into the application step as a `date`. Import `date`, `timedelta` from `datetime`. If the application code is inline in `build()`, extract it as `apply_board(board, items, week1)` returning the existing `superseded` list, so the tests have a seam — keep the extraction mechanical, no behaviour change.

- [ ] **Step 4: Run tests**

Run: `cd tracker/tools && python3 -m unittest test_build_tracker -v`
Expected: new tests PASS; `test_the_generated_file_is_current` may fail until regeneration — run `python3 tracker/tools/build_tracker.py` from the repo root, then re-run; ALL PASS.

- [ ] **Step 5: Commit**

```bash
git add tracker/tools/build_tracker.py tracker/tools/test_build_tracker.py tracker/board.data.js
git commit -m "board.json learns start/due, with the refusals that keep them honest"
```

### Task 2: Generator — emit `started`/`ended` facts from ops records

**Files:**
- Modify: `tracker/tools/build_tracker.py` (`parse_operations`, the `since` block at ~265)
- Test: `tracker/tools/test_build_tracker.py` (`TestOperationsParsing`)

**Interfaces:**
- Consumes: ops frontmatter `asked_on`/`submitted_on`/`answered_on`/`granted_on`.
- Produces: `item["started"]` (asked_on or submitted_on, whenever present, any state) and `item["ended"]` (answered_on or granted_on, whenever present). `since` keeps its existing attention-only semantics untouched.

- [ ] **Step 1: Write the failing tests**

```python
    def test_real_dates_are_emitted_as_started_and_ended(self):
        items = self.build(status="granted",
                           extra="")  # use the fixture's frontmatter fields:
        # set submitted_on/granted_on in the REGISTRATION fixture for this test —
        # copy the fixture string locally and .replace("submitted_on:", "submitted_on: 2026-08-20")
        # .replace("granted_on:", "granted_on: 2026-09-04")
        reg = [i for i in items if i["id"] == "ops:duns"][0]
        self.assertEqual(reg["started"], "2026-08-20")
        self.assertEqual(reg["ended"], "2026-09-04")

    def test_an_unstarted_record_emits_neither(self):
        items = self.build(status="not-started")
        reg = [i for i in items if i["id"] == "ops:duns"][0]
        self.assertNotIn("started", reg)
        self.assertNotIn("ended", reg)
```

(Adapt fixture plumbing to the file's existing `build()` helper — the point is: dates in → fields out; no dates in → fields absent, so the emitted file stays free of empty keys.)

- [ ] **Step 2: Run to verify failure** — `KeyError: 'started'`.

- [ ] **Step 3: Implement** — beside the existing `since` block in `parse_operations`:

```python
            started = fm.get("asked_on") or fm.get("submitted_on")
            ended = fm.get("answered_on") or fm.get("granted_on")
            if started:
                item["started"] = started
            if ended:
                item["ended"] = ended
```

- [ ] **Step 4: Run tests; regenerate; all pass.**

- [ ] **Step 5: Commit** — `"ops records emit their real dates: started and ended are facts, not attention"`

### Task 3: The Calendar view

**Files:**
- Modify: `tracker/tracker.html` — CSS block (after the `.body table.md` rules), the state vars (`view` init region), `render()` (tab list + dispatch + toolbar), click handler (nav + expand), new `renderCalendar()` above `renderBacklog`.

**Interfaces:**
- Consumes: `visible()` (already lane+query filtered), `DATA.week1`/`week1` Date, `BY_ID`, `chip()`, `esc()`, item fields `start`, `due`, `started`, `ended`, `done`, `state`, `meta.needed_week`, `meta.clears_week`.
- Produces: view value `"calendar"`; state `calMonth` (a `Date` pinned to the 1st); `data-cal-nav` (`prev|today|next`) and `data-cal-expand` (week index) click contracts.

- [ ] **Step 1: State + tabs + dispatch**

```js
  var calMonth = new Date(); calMonth = new Date(calMonth.getFullYear(), calMonth.getMonth(), 1);
  var calExpanded = {};   // weekKey -> true, reset on month nav
```

In `render()`: `["focus", "board", "backlog", "calendar"]` in the tab list; dispatch `view === "calendar" ? renderCalendar(items) : …`. In the click handler, before the generic handlers:

```js
    var nav = event.target.closest("[data-cal-nav]");
    if (nav) {
      var dir = nav.getAttribute("data-cal-nav");
      calExpanded = {};
      calMonth = dir === "today" ? new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        : new Date(calMonth.getFullYear(), calMonth.getMonth() + (dir === "next" ? 1 : -1), 1);
      return render();
    }
    var expand = event.target.closest("[data-cal-expand]");
    if (expand) { calExpanded[expand.getAttribute("data-cal-expand")] = true; return render(); }
```

- [ ] **Step 2: Span assembly — the honest-sources table as code**

```js
  /* ---- calendar: only what is true gets a bar (spec 2026-08-19) ----
     Sources: authored start/due; real started/ended; an open wait runs from its
     real start to the record's clears-week expectation (or today, whichever is
     later, so a late wait visibly overruns); needed_week becomes a ◆ on the last
     day of that week. Undated items simply do not appear. */
  function weekEnd(n) { return new Date(week1.getTime() + (7 * n - 1) * DAY); }
  function isoDate(s) { return new Date(s + "T00:00:00"); }

  function calendarSpans(items) {
    var spans = [], markers = [];
    items.forEach(function (item) {
      if (item.start || item.due) {
        var s = isoDate(item.start || item.due), e = isoDate(item.due || item.start);
        spans.push({ item: item, from: s, to: e, kind: "plan" });
      }
      if (item.started) {
        var from = isoDate(item.started);
        if (item.ended) {
          spans.push({ item: item, from: from, to: isoDate(item.ended), kind: "real" });
        } else {
          var cw = item.meta && item.meta.clears_week;
          var expect = cw && /^\d+$/.test(String(cw)) ? weekEnd(+cw) : new Date();
          var today = new Date(); today.setHours(0, 0, 0, 0);
          spans.push({ item: item, from: from,
                       to: new Date(Math.max(expect.getTime(), today.getTime())),
                       kind: "wait" });
        }
      }
      var nw = item.meta && item.meta.needed_week;
      if (nw && /^\d+$/.test(String(nw)) && !item.done) {
        markers.push({ item: item, on: weekEnd(+nw) });
      }
    });
    return { spans: spans, markers: markers };
  }
```

- [ ] **Step 3: The month grid**

```js
  function renderCalendar(items) {
    var data = calendarSpans(items);
    var first = calMonth, month = first.getMonth();
    var gridStart = new Date(first.getTime());
    gridStart.setDate(1 - ((first.getDay() + 6) % 7));           // back to Monday
    var last = new Date(first.getFullYear(), month + 1, 0);
    var weeks = Math.ceil(((last - gridStart) / DAY + 1) / 7);
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var monthName = first.toLocaleDateString("en-GB", { month: "long", year: "numeric" });

    var head = '<div class="cal-top"><h3>' + esc(monthName) + "</h3>" +
      '<div class="tabs"><button data-cal-nav="prev">‹</button>' +
      '<button data-cal-nav="today">Today</button>' +
      '<button data-cal-nav="next">›</button></div></div>' +
      '<div class="cal-dows">' + ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"]
        .map(function (d) { return "<span>" + d + "</span>"; }).join("") + "</div>";

    var rows = [];
    for (var w = 0; w < weeks; w++) {
      var weekStart = new Date(gridStart.getTime() + w * 7 * DAY);
      var weekStop = new Date(weekStart.getTime() + 6 * DAY);
      var cells = "";
      for (var d = 0; d < 7; d++) {
        var day = new Date(weekStart.getTime() + d * DAY);
        cells += '<div class="cal-day' + (day.getMonth() !== month ? " dim" : "") +
          (day.getTime() === today.getTime() ? " today" : "") + '">' + day.getDate() + "</div>";
      }
      // spans overlapping this week -> lanes (greedy, order: plan, real, wait by from-date)
      var lanes = [];
      data.spans.filter(function (s) { return s.from <= weekStop && s.to >= weekStart; })
        .sort(function (a, b) { return a.from - b.from; })
        .forEach(function (s) {
          var lane = 0;
          while (lanes[lane] && lanes[lane].some(function (o) {
            return s.from <= o.to && s.to >= o.from; })) lane++;
          (lanes[lane] = lanes[lane] || []).push(s);
        });
      var weekKey = "w" + w, shown = calExpanded[weekKey] ? lanes.length : Math.min(lanes.length, 3);
      var bars = "";
      for (var L = 0; L < shown; L++) {
        bars += lanes[L].map(function (s) {
          var c1 = Math.max(0, Math.round((s.from - weekStart) / DAY));
          var c2 = Math.min(6, Math.round((s.to - weekStart) / DAY));
          var tone = s.kind === "wait" ? "wait"
            : s.item.done ? "go"
            : s.item.state === "blocked" ? "hot"
            : s.item.state === "in-progress" ? "brand"
            : s.item.state === "next" ? "warn" : "";
          var label = (s.kind === "wait" ? "waiting · " : "") + s.item.title;
          return '<div class="cal-bar ' + tone + '" data-id="' + esc(s.item.id) +
            '" style="grid-column:' + (c1 + 1) + "/" + (c2 + 2) + ';grid-row:' + (L + 1) + '">' +
            esc(label) + "</div>";
        }).join("");
      }
      var hidden = lanes.length - shown;
      var marks = data.markers
        .filter(function (m) { return m.on >= weekStart && m.on <= weekStop; })
        .map(function (m) {
          var col = Math.round((m.on - weekStart) / DAY);
          return '<div class="cal-mark" data-id="' + esc(m.item.id) +
            '" style="grid-column:' + (col + 1) + "/" + (col + 2) + '">◆ needed W' +
            esc(m.item.meta.needed_week) + " · " + esc(m.item.title) + "</div>";
        }).join("");
      rows.push('<div class="cal-week"><div class="cal-days">' + cells + "</div>" +
        '<div class="cal-lanes" style="grid-template-rows:repeat(' + Math.max(shown, 1) +
        ',minmax(20px,auto))">' + bars + "</div>" +
        (hidden > 0 ? '<button class="cal-more" data-cal-expand="' + weekKey + '">+' +
          hidden + " more</button>" : "") +
        '<div class="cal-marks">' + marks + "</div></div>");
    }
    var dated = data.spans.length + data.markers.length;
    return '<section class="cal">' + head + rows.join("") +
      '<p class="muted cal-note">' + dated + " dated element(s) this view. Items with no " +
      "dates in any origin are not shown — a calendar that invented them would be lying. " +
      "Schedule an item by giving it start/due in tracker/board.json.</p></section>";
  }
```

- [ ] **Step 4: CSS** (after the `.body table.md th` block, tokens only):

```css
  .cal-top { display: flex; align-items: center; justify-content: space-between; margin: 18px 0 10px; }
  .cal-dows { display: grid; grid-template-columns: repeat(7, 1fr); font-size: 11px;
              color: var(--r-text-muted); text-transform: uppercase; letter-spacing: .05em;
              padding-bottom: 4px; }
  .cal-week { border-top: 1px solid var(--p-gray-100); padding: 2px 0 8px; }
  .cal-days { display: grid; grid-template-columns: repeat(7, 1fr); }
  .cal-day { font-size: 12px; color: var(--r-text-secondary); padding: 4px 6px; }
  .cal-day.dim { color: var(--p-gray-300); }
  .cal-day.today { color: var(--r-text-action); font-weight: 700; }
  .cal-day.today::after { content: ""; display: inline-block; width: 6px; height: 6px;
              border-radius: 50%; background: var(--r-surface-brand); margin-left: 4px; }
  .cal-lanes { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
  .cal-bar { font-size: 11.5px; line-height: 1.4; padding: 2px 8px; border-radius: 5px;
             background: var(--p-gray-100); color: var(--r-text-primary); cursor: pointer;
             overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
  .cal-bar.brand { background: var(--r-surface-brand); color: var(--r-text-on-brand); }
  .cal-bar.warn { background: var(--r-surface-highlight); }
  .cal-bar.hot { background: var(--r-feedback-error); color: var(--r-text-on-brand); }
  .cal-bar.go { background: var(--r-feedback-success); color: var(--r-text-on-brand); }
  .cal-bar.wait { background: repeating-linear-gradient(45deg, var(--r-surface-warm),
             var(--r-surface-warm) 6px, var(--p-gray-100) 6px, var(--p-gray-100) 12px);
             border: 1px dashed var(--p-gray-300); }
  .cal-mark { font-size: 11px; color: var(--r-text-muted); padding: 1px 6px; cursor: pointer; }
  .cal-marks { display: grid; grid-template-columns: repeat(7, 1fr); }
  .cal-more { border: 0; background: none; color: var(--r-text-action); font: inherit;
              font-size: 11.5px; cursor: pointer; padding: 2px 6px; }
  .cal-note { font-size: 12px; margin-top: 14px; }
```

Check each `--r-*`/`--p-*` var name against the file's `:root` block before using; substitute the file's actual token names where these differ. No literal hexes.

- [ ] **Step 5: Verify by extraction** — run the calendar arithmetic in node against the real data (the 4.20 method):

```bash
node -e '
const fs=require("fs");const html=fs.readFileSync("tracker/tracker.html","utf8");
/* extract weekEnd/isoDate/calendarSpans + a DAY and week1 shim, eval, then: */
' # assemble in a scratch script: spans from real BOARD data must satisfy:
  # - every span/marker id exists in BY_ID and has start||due||started||needed_week
  # - no span for any item lacking all date fields (honesty: nothing invented)
  # - plan spans equal their authored dates exactly; wait spans start at `started`
  # - marker date === week1 + 7*needed_week - 1 days
```

Expected: all assertions hold across every item. Then `open tracker/tracker.html`, click Calendar: August 2026 shows the drafted bars (after Task 4), the D-U-N-S ◆, today ring on the right day; a bar click opens the sheet; lane/search filters narrow the view; ‹ › nav moves months.

- [ ] **Step 6: Commit** — `"the tracker learns a calendar, and only what is true gets a bar"`

### Task 4: The draft schedule, authored

**Files:**
- Modify: `tracker/board.json` (add `start`/`due` to the flagged-`next` owner errands)

**Interfaces:** Consumes Task 1's keys. Every date must survive Task 1's refusals (`--check` proves it).

- [ ] **Step 1: Author the draft** — add to the existing entries (keep each item's current state/note; add only the two keys). W1 = week of 2026-08-18; all dues within each record's needed week:

| id | start | due |
|---|---|---|
| `ops:accountant-gst-scheme` | 2026-08-19 | 2026-08-20 |
| `ops:accountant-cloud-gst` | 2026-08-19 | 2026-08-20 |
| `ops:owner-store-account-entity` | 2026-08-19 | 2026-08-21 |
| `ops:duns` | 2026-08-20 | 2026-08-21 |
| `ops:owner-catalogue-export` | 2026-08-20 | 2026-08-22 |
| `ops:owner-delivery-hours` | 2026-08-24 | 2026-08-25 |
| `ops:owner-bank-account` | 2026-08-24 | 2026-08-28 |
| `roadmap:p0-provision-dev-and-staging` | 2026-08-25 | 2026-08-27 |
| `ops:owner-font-licence` | 2026-08-26 | 2026-08-27 |
| `ops:owner-github-plan` | 2026-08-27 | 2026-08-28 |
| `ops:gcp-maps` | 2026-08-28 | 2026-08-28 |
| `ops:firebase` | 2026-08-28 | 2026-08-28 |

Items without board entries yet (`ops:accountant-gst-scheme` has one only if flagged — check; add minimal `{"state": "next", "start": …, "due": …}` entries where absent, with a one-line note). DLT/Meta deliberately not drafted (spec).

- [ ] **Step 2: Regenerate + check** — `python3 tracker/tools/build_tracker.py && python3 tracker/tools/build_tracker.py --check`. Every refusal from Task 1 is exercised for real here; a rejected date means the draft, not the gate, is wrong.

- [ ] **Step 3: Commit** — `"the owner's first fortnight, scheduled — every due inside its record's own needed week"`

### Task 5: Case 4.21, Features.md, counts, gates, PR

**Files:**
- Modify: `test-cases/04-tracker.md` (append 4.21), `test-cases/README.md` (20 → 21), `Features.md` (board bullet gains the Calendar view sentence)

- [ ] **Step 1: Write case 4.21** (🧪, manual footing like 4.12/4.19/4.20): the calendar renders only truthful dates — authored plans, real spans, open waits to clears-week, ◆ needed-by markers on the last day of their week; undated items absent; verified by node extraction of the span assembly against the real board.data.js plus an eyeball; the generator's five refusals unit-tested (Task 1).
- [ ] **Step 2: Update Features.md board bullet** — add: "**Calendar** is a month grid of only what is true: authored start/due bars, real record spans, hatched open waits, and ◆ needed-by markers computed from the week-1 anchor; undated items are absent, not estimated."
- [ ] **Step 3: Bucket count** — `04-tracker.md` (20 cases) → (21 cases) in `test-cases/README.md`.
- [ ] **Step 4: Regenerate; run all twelve gates** — `python3 design-system/tools/run_gates.py`; expected: all pass, tracker unittest count grown by Task 1+2's tests.
- [ ] **Step 5: Commit; push; open PR** titled "The tracker learns a calendar, and only what is true gets a bar" — body carries: the three decisions, the refusal list with the failing-test-first evidence, the node-extraction proof output, the draft-schedule table for adjustment, pasted gate output. Wait for approval; no DesignSync push (no spec file).

## Self-Review

- **Spec coverage**: dated-items-only (Task 3 Step 2 filters + honesty note), board.json authoring + refusals incl. needed-week ceiling (Task 1), month grid + nav + today ring + sheet + filters + "+n" expand (Task 3), draft schedule with the due≤needed rule (Task 4), started/ended facts (Task 2), 4.21 + Features.md + counts (Task 5), no drag (nothing writes), client-side today-arithmetic (Task 3 only). ✔
- **Placeholders**: Task 3 Step 5's node script is sketched rather than verbatim — acceptable as it mirrors the documented 4.20 method; the assertions to check are named exactly. Everything else carries real code. ✔
- **Type consistency**: `start`/`due`/`started`/`ended` names identical across Tasks 1–4; `data-cal-nav`/`data-cal-expand` used only in Task 3; `weekEnd(n)` defined before use. `apply_board` extraction is named in both Task 1 test and implementation. ✔
