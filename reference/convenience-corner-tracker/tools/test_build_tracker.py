#!/usr/bin/env python3
"""Tests for the tracker generator.

Two postures, both deliberate. Most tests run against planted fixtures, because a
refusal is only proven by watching it fire. The last group runs against the live
repository files — the posture `test_status.py` and `test_run_gates.py` already
take — because a parser that only ever sees fixtures is a parser that agrees with
its own assumptions.
"""

import json
import shutil
import tempfile
import unittest
from datetime import date
from pathlib import Path

import build_tracker as bt

REPO = Path(__file__).resolve().parents[2]


class TestSlugify(unittest.TestCase):
    def test_lowercases_and_hyphenates(self):
        self.assertEqual(bt.slugify("Scaffold the monorepo"), "scaffold-the-monorepo")

    def test_strips_punctuation_and_markup(self):
        self.assertEqual(bt.slugify("**Branch protection** on `main` — blocked!"),
                         "branch-protection-on-main-blocked")

    def test_caps_word_count_so_ids_stay_readable(self):
        long = "one two three four five six seven eight nine"
        self.assertEqual(bt.slugify(long, words=4), "one-two-three-four")

    def test_empty_input_is_refused_rather_than_returning_empty_id(self):
        with self.assertRaises(SystemExit):
            bt.slugify("***")


ROADMAP = """\
## Roadmap to production

Some prose that is not a bullet.

### Phase 0 — Foundation
- [x] ~~Scaffold the monorepo~~ — pnpm workspaces + Turborepo **[2.1-2.4]**
- [ ] **Start the D-U-N-S application** — it gates both store accounts
- [ ] Choose hosting, managed Postgres, object storage and CDN

### Phase 1 — Domain and the stock ledger (the spine)
- [ ] Append-only movement ledger; on-hand as a running balance **[1.32]**
  - [ ] an indented bullet that is detail, not a task
- [ ] Append-only movement ledger; a second bullet that slugs the same

## Reading order for someone new
- [ ] not a roadmap bullet, different section
"""


class TestRoadmapParsing(unittest.TestCase):
    def setUp(self):
        self.items = bt.parse_roadmap(ROADMAP, aliases={})
        self.by_id = {i["id"]: i for i in self.items}

    def test_reads_only_roadmap_phase_bullets(self):
        self.assertEqual(len(self.items), 5)
        self.assertNotIn("roadmap:not-a-roadmap-bullet-different-section", self.by_id)

    def test_indented_bullets_are_detail_not_tasks(self):
        for item in self.items:
            self.assertNotIn("indented", item["id"])

    def test_checkbox_is_the_origin_of_done(self):
        done = self.by_id["roadmap:p0-scaffold-the-monorepo"]
        self.assertTrue(done["done"])
        self.assertFalse(self.by_id["roadmap:p0-start-the-d-u-n-s-application"]["done"])

    def test_strikethrough_is_stripped_from_a_finished_title(self):
        self.assertEqual(self.by_id["roadmap:p0-scaffold-the-monorepo"]["title"],
                         "Scaffold the monorepo")

    def test_title_splits_at_the_em_dash_and_body_keeps_the_rest(self):
        item = self.by_id["roadmap:p0-start-the-d-u-n-s-application"]
        self.assertEqual(item["title"], "Start the D-U-N-S application")
        self.assertIn("gates both store accounts", item["body"])

    def test_bracketed_test_case_refs_are_carried_as_a_display_string(self):
        self.assertEqual(self.by_id["roadmap:p0-scaffold-the-monorepo"]["meta"]["closes"],
                         "2.1-2.4")

    def test_epic_comes_from_the_phase_heading(self):
        item = self.by_id["roadmap:p0-scaffold-the-monorepo"]
        self.assertEqual(item["epic"], "phase-0")
        self.assertEqual(item["epic_label"], "Phase 0 — Foundation")

    def test_colliding_slugs_get_a_stable_suffix_rather_than_overwriting(self):
        self.assertIn("roadmap:p1-append-only-movement-ledger", self.by_id)
        self.assertIn("roadmap:p1-append-only-movement-ledger-2", self.by_id)

    def test_lane_is_claude_for_roadmap_work(self):
        self.assertTrue(all(i["lane"] == "claude" for i in self.items))

    def test_an_alias_folds_the_bullet_into_its_operations_record(self):
        items = bt.parse_roadmap(ROADMAP, aliases={"Start the D-U-N-S application": "ops:duns"})
        ids = {i["id"] for i in items}
        self.assertNotIn("roadmap:p0-start-the-d-u-n-s-application", ids)
        self.assertEqual(len(items), 4)

    def test_an_alias_that_matches_nothing_is_refused(self):
        with self.assertRaises(SystemExit) as caught:
            bt.parse_roadmap(ROADMAP, aliases={"A bullet that is not there": "ops:nope"})
        self.assertIn("A bullet that is not there", str(caught.exception))


CASES = """\
# 1. Design System — Test Cases

Mirrors Features.md section 1. Status legend: ✅ automated · ❌ not covered

- **1.1** ✅ Every declared token contrast pair meets its minimum. Covered by a tool.
- **1.4** ❌ Dark-theme role values defined and contrast-validated. Deferred.
- **1.9** 🟡 Partially covered, which is not done.
- **1.11** 🚫 Out of scope, with a reason.
- **1.13** 🧪 Verified by hand, which is not automated and not done either.
"""


class TestTestCaseParsing(unittest.TestCase):
    def setUp(self):
        self.items = bt.parse_test_cases(CASES, "01-design-system.md")
        self.by_id = {i["id"]: i for i in self.items}

    def test_every_case_bullet_is_read(self):
        self.assertEqual(len(self.items), 5)

    def test_ids_are_the_case_numbers_the_repo_already_forbids_renumbering(self):
        self.assertIn("case:1.1", self.by_id)
        self.assertIn("case:1.13", self.by_id)

    def test_covered_and_out_of_scope_are_done_everything_else_is_open(self):
        self.assertTrue(self.by_id["case:1.1"]["done"])
        self.assertTrue(self.by_id["case:1.11"]["done"])
        for open_case in ("case:1.4", "case:1.9", "case:1.13"):
            self.assertFalse(self.by_id[open_case]["done"], open_case)

    def test_marker_is_kept_so_the_viewer_can_tell_partial_from_manual(self):
        self.assertEqual(self.by_id["case:1.9"]["origin_status"], "🟡")
        self.assertEqual(self.by_id["case:1.13"]["origin_status"], "🧪")

    def test_title_is_the_first_sentence_and_the_body_keeps_the_rest(self):
        item = self.by_id["case:1.1"]
        self.assertEqual(item["title"], "Every declared token contrast pair meets its minimum.")
        self.assertIn("Covered by a tool.", item["body"])

    def test_epic_comes_from_the_file_heading(self):
        self.assertEqual(self.by_id["case:1.1"]["epic"], "cases-1")
        self.assertEqual(self.by_id["case:1.1"]["epic_label"], "1. Design System")


REGISTRATION = """\
---
kind: registration
id: duns
name: D-U-N-S number
counterparty: Dun & Bradstreet
status: {status}
cost: free
lead_time: 1-5 business days
clears_week: 5
needed_week: 28
submitted_on:
reference:
granted_on:
---

# D-U-N-S number

**Gates:** both store accounts

Body prose.
"""

QUESTION = """\
---
kind: question
id: accountant-hsn-digits
ask: HSN digit count
who: Accountant
status: not-asked
asked_on:
answered_on:
answer:
needed_week: 7
---

# HSN digit count

Body prose.

## Send this

> Hello — quick one about HSN codes.
>
> How many digits do we need to print? Thank you.
"""

# Same record with the askable line removed, for the refusal test. A question
# nobody can send is not tracked, it is only recorded.
QUESTION_NO_ASK = QUESTION.split("## Send this")[0].rstrip() + "\n"


class TestOperationsParsing(unittest.TestCase):
    def build(self, status="not-started", extra=""):
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp)
        (tmp / "registrations").mkdir()
        (tmp / "people").mkdir()
        (tmp / "registrations" / "duns.md").write_text(
            REGISTRATION.format(status=status).replace("# D-U-N-S number", extra + "# D-U-N-S number")
        )
        (tmp / "people" / "accountant-hsn-digits.md").write_text(QUESTION)
        return bt.parse_operations(tmp)

    def test_real_dates_are_emitted_as_started_and_ended(self):
        """The calendar's real spans read facts, not attention: started/ended
        come straight from the record's own dates, whatever the state."""
        import tempfile, shutil
        from pathlib import Path
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp)
        (tmp / "registrations").mkdir()
        (tmp / "people").mkdir()
        filed = (REGISTRATION.format(status="granted")
                 .replace("submitted_on:", "submitted_on: 2026-08-20")
                 .replace("granted_on:", "granted_on: 2026-09-04"))
        (tmp / "registrations" / "duns.md").write_text(filed)
        reg = bt.parse_operations(tmp)[0]
        self.assertEqual(reg["started"], "2026-08-20")
        self.assertEqual(reg["ended"], "2026-09-04")

    def test_an_unstarted_record_emits_neither_date_field(self):
        # Absent, not empty — the emitted file carries no hollow keys.
        items = self.build(status="not-started")
        reg = [i for i in items if i["id"] == "ops:duns"][0]
        self.assertNotIn("started", reg)
        self.assertNotIn("ended", reg)

    def test_the_send_this_section_is_not_left_in_the_body(self):
        """The sheet renders ask_text in its own styled box with a copy button.
        A body still carrying the section shows the same blockquote twice —
        once raw — so the parser removes what it extracted. The ask box owns it."""
        items = self.build_question(QUESTION)
        q = items[0]
        self.assertIn("Hello — quick one", q["ask_text"])
        self.assertNotIn("Send this", q["body"])
        self.assertNotIn("Hello — quick one", q["body"])
        # What surrounds the removed section survives untouched.
        self.assertIn("Body prose", q["body"])

    def build_question(self, text):
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp)
        (tmp / "registrations").mkdir()
        (tmp / "people").mkdir()
        (tmp / "people" / "accountant-hsn-digits.md").write_text(text)
        return bt.parse_operations(tmp)

    def test_the_askable_line_is_extracted_without_its_quote_markers(self):
        """The owner copies this straight into WhatsApp. A stray `>` would go with it."""
        item = self.build_question(QUESTION)[0]
        self.assertTrue(item["ask_text"].startswith("Hello — quick one about HSN codes."))
        self.assertNotIn(">", item["ask_text"])

    def test_blank_lines_inside_the_ask_survive(self):
        """A wall of text is not sendable. The paragraph breaks are the point."""
        self.assertIn("\n\n", self.build_question(QUESTION)[0]["ask_text"])

    def test_a_question_with_no_askable_line_is_refused(self):
        with self.assertRaises(SystemExit) as cm:
            self.build_question(QUESTION_NO_ASK)
        self.assertIn("Send this", str(cm.exception))

    def test_a_registration_needs_no_askable_line(self):
        """Registrations are filed, not asked. Requiring one would be noise."""
        items = self.build()
        reg = next(i for i in items if i["id"] == "ops:duns")
        self.assertEqual(reg.get("ask_text", ""), "")

    def test_every_live_question_record_carries_one(self):
        """Asserted against the real records, not fixtures — the same posture
        test_run_gates takes against the live MASTER.md."""
        items = bt.parse_operations(bt.REPO / "operations")
        questions = [i for i in items if i["epic"] == "questions"]
        self.assertGreaterEqual(len(questions), 9)
        for q in questions:
            self.assertTrue(q["ask_text"].strip(), f"{q['id']} has an empty ask")
            self.assertNotIn(">", q["ask_text"], f"{q['id']} kept its quote markers")

    def test_ids_are_the_record_filenames(self):
        by_id = {i["id"]: i for i in self.build()}
        self.assertIn("ops:duns", by_id)
        self.assertIn("ops:accountant-hsn-digits", by_id)

    def test_lane_is_the_owner_for_everything_in_operations(self):
        self.assertTrue(all(i["lane"] == "kiro" for i in self.build()))

    def test_slack_is_derived_not_authored(self):
        by_id = {i["id"]: i for i in self.build()}
        self.assertEqual(by_id["ops:duns"]["meta"]["slack"], 23)

    def test_default_state_comes_from_the_record_status(self):
        for status, expected in [
            ("not-started", "later"),
            ("submitted", "in-progress"),
            ("in-review", "in-progress"),
            ("action-needed", "next"),
            ("blocked", "blocked"),
        ]:
            by_id = {i["id"]: i for i in self.build(status=status)}
            self.assertEqual(by_id["ops:duns"]["state"], expected, status)

    def test_granted_is_done_and_answered_is_done(self):
        by_id = {i["id"]: i for i in self.build(status="granted")}
        self.assertTrue(by_id["ops:duns"]["done"])
        self.assertFalse(by_id["ops:accountant-hsn-digits"]["done"])

    def test_roadmap_alias_is_collected_for_the_dedup_pass(self):
        tmp = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, tmp)
        (tmp / "registrations").mkdir()
        (tmp / "people").mkdir()
        (tmp / "registrations" / "duns.md").write_text(
            REGISTRATION.format(status="not-started").replace(
                "needed_week: 28", "needed_week: 28\nroadmap_alias: Start the D-U-N-S application"
            )
        )
        items = bt.parse_operations(tmp)
        self.assertEqual(bt.aliases_from(items), {"Start the D-U-N-S application": "ops:duns"})


def _items():
    """A small, closed world for the board-application tests."""
    return {
        "roadmap:p1-ledger": {"id": "roadmap:p1-ledger", "lane": "claude", "epic": "phase-1",
                              "epic_label": "Phase 1", "title": "Ledger", "body": "",
                              "origin_file": "README.md", "origin_status": "open",
                              "done": False, "state": "later", "origin_state": "later",
                              "meta": {}},
        "roadmap:p0-done": {"id": "roadmap:p0-done", "lane": "claude", "epic": "phase-0",
                            "epic_label": "Phase 0", "title": "Already finished", "body": "",
                            "origin_file": "README.md", "origin_status": "done",
                            "done": True, "state": "done", "origin_state": "done",
                            "meta": {}},
    }


class TestBoardApplication(unittest.TestCase):
    def apply(self, board):
        items = _items()
        bt.apply_board(items, board)
        return items

    def test_a_flagged_item_takes_the_boards_state(self):
        items = self.apply({"items": {"roadmap:p1-ledger": {"state": "in-progress"}}})
        self.assertEqual(items["roadmap:p1-ledger"]["state"], "in-progress")

    def test_an_unflagged_open_item_defaults_to_later(self):
        self.assertEqual(self.apply({})["roadmap:p1-ledger"]["state"], "later")

    def test_note_since_and_blocked_by_are_carried_through(self):
        items = self.apply({"items": {"roadmap:p1-ledger": {
            "state": "blocked", "note": "waiting", "since": "2026-08-18",
            "blocked_by": "roadmap:p0-done"}}})
        item = items["roadmap:p1-ledger"]
        self.assertEqual(item["note"], "waiting")
        self.assertEqual(item["since"], "2026-08-18")
        self.assertEqual(item["blocked_by"], "roadmap:p0-done")

    def test_lane_can_be_overridden(self):
        items = self.apply({"items": {"roadmap:p1-ledger": {"lane": "kiro"}}})
        self.assertEqual(items["roadmap:p1-ledger"]["lane"], "kiro")

    # --- the refusals ----------------------------------------------------

    def test_an_unknown_id_is_refused_with_the_nearest_real_one_suggested(self):
        with self.assertRaises(SystemExit) as caught:
            self.apply({"items": {"roadmap:p1-ledgerr": {"state": "next"}}})
        message = str(caught.exception)
        self.assertIn("roadmap:p1-ledgerr", message)
        self.assertIn("roadmap:p1-ledger", message)

    def test_done_is_not_a_state_the_tracker_may_author(self):
        with self.assertRaises(SystemExit) as caught:
            self.apply({"items": {"roadmap:p1-ledger": {"state": "done"}}})
        self.assertIn("origin", str(caught.exception).lower())

    def test_an_unknown_state_is_refused_and_the_legal_ones_are_printed(self):
        with self.assertRaises(SystemExit) as caught:
            self.apply({"items": {"roadmap:p1-ledger": {"state": "probably-fine"}}})
        self.assertIn("in-progress", str(caught.exception))

    def test_a_key_outside_the_allowlist_is_refused(self):
        with self.assertRaises(SystemExit) as caught:
            self.apply({"items": {"roadmap:p1-ledger": {"assignee": "someone"}}})
        self.assertIn("assignee", str(caught.exception))

    def test_blocked_by_must_resolve(self):
        with self.assertRaises(SystemExit) as caught:
            self.apply({"items": {"roadmap:p1-ledger": {"state": "blocked",
                                                        "blocked_by": "roadmap:nothing"}}})
        self.assertIn("roadmap:nothing", str(caught.exception))

    def test_the_tracker_may_not_contradict_an_origin_that_says_done(self):
        with self.assertRaises(SystemExit) as caught:
            self.apply({"items": {"roadmap:p0-done": {"state": "in-progress"}}})
        message = str(caught.exception)
        self.assertIn("roadmap:p0-done", message)
        self.assertIn("README.md", message)

    def test_a_note_on_a_finished_item_is_fine_only_the_state_contradicts(self):
        items = self.apply({"items": {"roadmap:p0-done": {"note": "worth remembering"}}})
        self.assertEqual(items["roadmap:p0-done"]["state"], "done")
        self.assertEqual(items["roadmap:p0-done"]["note"], "worth remembering")

    # --- tracker-native tasks --------------------------------------------

    def test_a_native_task_is_added_and_carries_its_own_title(self):
        items = self.apply({"tasks": {"task:hosting": {"title": "Pick a host", "lane": "kiro"}}})
        self.assertEqual(items["task:hosting"]["title"], "Pick a host")
        self.assertEqual(items["task:hosting"]["lane"], "kiro")
        self.assertFalse(items["task:hosting"]["done"])

    def test_a_native_task_without_a_title_is_refused(self):
        with self.assertRaises(SystemExit) as caught:
            self.apply({"tasks": {"task:hosting": {"lane": "kiro"}}})
        self.assertIn("title", str(caught.exception))

    def test_a_native_task_id_must_carry_the_task_prefix(self):
        with self.assertRaises(SystemExit) as caught:
            self.apply({"tasks": {"hosting": {"title": "Pick a host"}}})
        self.assertIn("task:", str(caught.exception))

    def test_a_native_task_may_not_shadow_an_origin_backed_id(self):
        with self.assertRaises(SystemExit) as caught:
            self.apply({"tasks": {"roadmap:p1-ledger": {"title": "Something else"}}})
        self.assertIn("roadmap:p1-ledger", str(caught.exception))


class TestSchedule(unittest.TestCase):
    """start/due are authored attention — the same gate class as state flags."""

    def apply(self, fields, done=False, needed_week=None):
        items = _items()
        target = "roadmap:p0-done" if done else "roadmap:p1-ledger"
        if needed_week:
            items[target]["meta"]["needed_week"] = needed_week
        board = {"items": {target: fields}}
        bt.apply_board(items, board, week1=date(2026, 8, 18))
        return items[target]

    def test_a_valid_start_and_due_are_accepted_and_kept(self):
        item = self.apply({"start": "2026-08-20", "due": "2026-08-21"})
        self.assertEqual(item["start"], "2026-08-20")
        self.assertEqual(item["due"], "2026-08-21")

    def test_a_malformed_date_is_refused(self):
        for bad in ("21-08-2026", "2026-8-21", "tomorrow", "2026-08-32"):
            with self.assertRaises(SystemExit, msg=bad):
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
        # The boundary itself is legal: due on the last day of the needed week.
        item = self.apply({"start": "2026-09-01", "due": "2026-09-07"}, needed_week="3")
        self.assertEqual(item["due"], "2026-09-07")


class TestOriginSupersedesTheFlag(unittest.TestCase):
    """A flag says what to look at while the origin has nothing to say. The moment the
    origin moves past `later` it knows more than the flag, and it wins — found by using
    the board: `ops:accountant-hsn-digits` went to `asked` and stayed in Next, because a
    `state: next` written days earlier was still overriding the record."""

    def moved(self, origin_state):
        items = _items()
        items["ops:thing"] = {"id": "ops:thing", "lane": "kiro", "epic": "questions",
                              "epic_label": "Open questions", "title": "A question",
                              "body": "", "origin_file": "operations/people/thing.md",
                              "origin_status": "asked", "done": False,
                              "state": origin_state, "origin_state": origin_state, "meta": {}}
        superseded = bt.apply_board(items, {"items": {"ops:thing": {"state": "next",
                                                                   "note": "ask in week 1"}}})
        return items["ops:thing"], superseded

    def test_a_record_that_has_moved_beats_the_flag(self):
        item, _ = self.moved("in-progress")
        self.assertEqual(item["state"], "in-progress")

    def test_the_note_survives_even_though_the_state_did_not(self):
        item, _ = self.moved("in-progress")
        self.assertEqual(item["note"], "ask in week 1")

    def test_a_record_still_at_later_leaves_the_flag_in_charge(self):
        item, superseded = self.moved("later")
        self.assertEqual(item["state"], "next")
        self.assertEqual(superseded, [])

    def test_the_override_is_reported_rather_than_silent(self):
        _, superseded = self.moved("blocked")
        self.assertEqual(superseded,
                         [("ops:thing", "next", "blocked", "operations/people/thing.md")])


class TestRender(unittest.TestCase):
    def payload(self):
        return {"week1": "2026-08-18", "items": list(_items().values()), "epics": [],
                "tokens": {}, "attention": {}}

    def test_output_is_a_classic_script_because_file_urls_cannot_fetch(self):
        text = bt.render(self.payload())
        self.assertIn("window.CC_TRACKER", text)
        self.assertNotIn("export ", text)
        self.assertNotIn("import ", text)

    def test_output_says_it_is_generated(self):
        self.assertIn("GENERATED", bt.render(self.payload()))

    def test_output_is_byte_stable_for_the_same_input(self):
        self.assertEqual(bt.render(self.payload()), bt.render(self.payload()))

    def test_output_is_byte_stable_when_key_order_differs(self):
        a = self.payload()
        b = {k: a[k] for k in reversed(list(a))}
        self.assertEqual(bt.render(a), bt.render(b))

    def test_the_payload_parses_back_as_json(self):
        text = bt.render(self.payload())
        body = text[text.index("=") + 1:].rstrip().rstrip(";")
        self.assertEqual(json.loads(body)["week1"], "2026-08-18")


class TestLiveRepository(unittest.TestCase):
    """Against the real files. A parser that only ever sees fixtures agrees with itself."""

    @classmethod
    def setUpClass(cls):
        cls.payload = bt.collect(REPO)

    def test_the_repository_parses(self):
        self.assertGreater(len(self.payload["items"]), 100)

    def test_every_id_is_unique(self):
        ids = [i["id"] for i in self.payload["items"]]
        self.assertEqual(len(ids), len(set(ids)))

    def test_both_lanes_have_work_in_them(self):
        lanes = {i["lane"] for i in self.payload["items"]}
        self.assertEqual(lanes, {"claude", "kiro"})

    def test_every_operations_record_becomes_exactly_one_item(self):
        """Counted against the files rather than against a number typed here. A
        hardcoded total is a second copy of something that changes — a record was
        added to main mid-build and caught this test doing exactly that."""
        records = sorted(
            f"ops:{p.stem}"
            for folder in ("registrations", "people")
            for p in (REPO / "operations" / folder).glob("*.md")
        )
        found = sorted(i["id"] for i in self.payload["items"] if i["id"].startswith("ops:"))
        self.assertEqual(found, records)

    def test_week_one_is_read_from_the_readme_rather_than_hardcoded(self):
        self.assertEqual(self.payload["week1"], "2026-08-18")

    def test_the_week_one_checklist_is_not_read_because_operations_owns_it(self):
        titles = {i["title"] for i in self.payload["items"]}
        self.assertNotIn("Apply for the **D-U-N-S number**", titles)

    def test_colours_are_derived_from_tokens_json_not_authored(self):
        tokens = json.loads((REPO / "design-system" / "tokens.json").read_text())
        for role, primitive in tokens["roles"].items():
            self.assertEqual(self.payload["tokens"]["roles"][role], tokens["primitives"][primitive])

    def test_the_viewer_authors_no_colour_of_its_own(self):
        """The contrast scan globs design-system/ only, so tracker/ is outside every gate.
        This file is safe because it is derived — the same argument §9 makes for tokens.ts."""
        html = (REPO / "tracker" / "tracker.html").read_text()
        stray = [line for line in html.splitlines() if "#" in line and _has_hex(line)]
        self.assertEqual(stray, [])

    def test_the_generated_file_is_current(self):
        current = (REPO / "tracker" / "board.data.js").read_text()
        self.assertEqual(current, bt.build(REPO),
                         "board.data.js is stale — re-run build_tracker.py")


def _has_hex(line: str) -> bool:
    import re
    return bool(re.search(r"#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{3})?\b", line))


if __name__ == "__main__":
    unittest.main()
