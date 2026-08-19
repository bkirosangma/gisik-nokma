#!/usr/bin/env python3
"""Join the repository's task origins into one board, and refuse to let it lie.

Four files already hold task state: the README's roadmap checkboxes, the README's
Schedule, the status markers in `test-cases/`, and the frontmatter under
`operations/`. None of them can say *in progress*, *blocked* or *look at this one
first*, which is the whole reason this tracker exists — and the only gap it may fill.

So the split is strict:

    the origins own truth        existence, title, and **done**
    the tracker owns attention   in-progress / blocked / next, notes, focus

`tracker/board.json` is authored and holds attention only. Everything else is read
from the origin files at generate time. `done` is not a legal value in board.json,
so this tracker structurally cannot claim a task is finished that the README's own
checkbox says is not. That is the 1.46 defect closed by construction rather than by
discipline, the same way `STATUS.md` and `tokens.ts` are closed.

Usage:
    python3 tracker/tools/build_tracker.py            # rewrite board.data.js
    python3 tracker/tools/build_tracker.py --check    # exit 1 if it is stale
    python3 tracker/tools/build_tracker.py --ids      # every ID the origins offer

Paths resolve against this file's own location, not the working directory —
`run_gates` had exactly that bug once and it is cheaper to not have it than to find it.
"""

from __future__ import annotations

import argparse
import difflib
import json
import re
from datetime import date, timedelta
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]

# One frontmatter parser for the repository, imported rather than copied. A second
# parser for the same records is a second thing to drift, which is the defect this
# whole file exists to avoid — it would be odd to open by committing it.
sys.path.insert(0, str(REPO / "operations" / "tools"))
from status import parse_frontmatter  # noqa: E402

STATES = ["later", "next", "in-progress", "blocked"]
ITEM_KEYS = {"state", "note", "since", "blocked_by", "lane", "start", "due"}
TASK_KEYS = ITEM_KEYS | {"title", "body", "epic"}
# `_` is the file's own explanation, kept beside the data it explains rather than
# in a README nobody opens while editing it.
BOARD_KEYS = {"updated", "_", "attention", "items", "tasks"}

# A record's own status already implies where it sits on a board. Deriving the default
# means the operations lane is populated without a single line of authored state.
OPS_STATE = {
    "not-started": "later",
    "not-asked": "later",
    "submitted": "in-progress",
    "in-review": "in-progress",
    "asked": "in-progress",
    "chased": "in-progress",
    "action-needed": "next",
    "blocked": "blocked",
    "granted": "done",
    "answered": "done",
}
OPS_DONE = {"granted", "answered"}

CASE_DONE = {"✅", "🚫"}

DEFAULT_ATTENTION = {"slack_weeks": 6, "stale_days": 14}

PHASE_HEADING = re.compile(r"^### Phase (\d+) — (.+)$")
ANY_HEADING = re.compile(r"^#{2,3} ")
CHECKBOX = re.compile(r"^- \[([ x])\] (.+)$")
CASE_BULLET = re.compile(r"^- \*\*(\d+\.\d+)\*\* ([❌✅🟡🧪🚫]) (.+)$")
CASE_HEADING = re.compile(r"^# (\d+)\. (.+?) — Test Cases$", re.M)
CLOSES = re.compile(r"\s*\*\*\[([^\]]+)\]\*\*")
WEEK_ONE = re.compile(r"Week 1 is the week of \*\*(\d{4}-\d{2}-\d{2})\*\*")
MARKUP = re.compile(r"~~|\*\*|`")


def slugify(text: str, words: int = 6) -> str:
    """A readable, stable ID fragment. Hyphens inside a word survive, so
    `D-U-N-S` stays one word rather than becoming four."""
    cleaned = MARKUP.sub("", text).lower()
    cleaned = re.sub(r"[^a-z0-9-]+", " ", cleaned)
    parts = [w.strip("-") for w in cleaned.split() if w.strip("-")]
    slug = re.sub(r"-+", "-", "-".join(parts[:words])).strip("-")
    if not slug:
        raise SystemExit(f"build_tracker: cannot derive an ID from {text!r}")
    return slug


def _split(text: str, seps: tuple[str, ...], keep: bool = False) -> tuple[str, str]:
    """Title, then the rest. The first separator that appears wins."""
    hits = [(text.find(s), s) for s in seps if text.find(s) != -1]
    if not hits:
        return text.strip(), ""
    at, sep = min(hits)
    cut = at + (len(sep) if keep else 0)
    return text[:cut].strip(), text[at + len(sep):].strip()


def _plain(text: str) -> str:
    return MARKUP.sub("", text).strip()


def parse_roadmap(readme: str, aliases: dict[str, str]) -> list[dict]:
    """Every unindented checkbox under a `### Phase N` heading.

    The README's Week-1 checklist is deliberately not read: all ten of its items are
    registrations or questions that `operations/` already owns and `STATUS.md` already
    reports, so reading both would count each of them twice, once per lane.
    """
    items: list[dict] = []
    seen: dict[str, int] = {}
    used_aliases: set[str] = set()
    phase: tuple[str, str] | None = None

    for line in readme.splitlines():
        heading = PHASE_HEADING.match(line)
        if heading:
            phase = (heading.group(1), f"Phase {heading.group(1)} — {heading.group(2)}")
            continue
        if ANY_HEADING.match(line):
            phase = None
            continue
        box = CHECKBOX.match(line)
        if not phase or not box:
            continue

        number, label = phase
        raw = box.group(2)
        closes = CLOSES.search(raw)
        raw = CLOSES.sub("", raw).strip()
        title, body = _split(_plain(raw), (" — ", "; "))

        if title in aliases:
            used_aliases.add(title)
            continue

        slug = f"p{number}-{slugify(title, words=4)}"
        seen[slug] = seen.get(slug, 0) + 1
        if seen[slug] > 1:
            slug = f"{slug}-{seen[slug]}"

        items.append({
            "id": f"roadmap:{slug}",
            "lane": "claude",
            "epic": f"phase-{number}",
            "epic_label": label,
            "title": title,
            "body": body,
            "origin_file": "README.md",
            "origin_status": "done" if box.group(1) == "x" else "open",
            "done": box.group(1) == "x",
            "state": "done" if box.group(1) == "x" else "later",
            "origin_state": "done" if box.group(1) == "x" else "later",
            "meta": {"closes": closes.group(1)} if closes else {},
        })

    missing = set(aliases) - used_aliases
    if missing:
        raise SystemExit(
            "build_tracker: roadmap_alias matches no README bullet: "
            + ", ".join(sorted(repr(m) for m in missing))
            + ". The alias exists to fold one bullet into its operations record; an "
              "alias that matches nothing is silently folding nothing."
        )
    return items


def parse_test_cases(text: str, filename: str) -> list[dict]:
    heading = CASE_HEADING.search(text)
    if not heading:
        raise SystemExit(f"build_tracker: {filename} has no `# N. Title — Test Cases` heading")
    number, name = heading.group(1), heading.group(2)

    items = []
    for line in text.splitlines():
        bullet = CASE_BULLET.match(line)
        if not bullet:
            continue
        case_id, marker, rest = bullet.groups()
        title, body = _split(rest, (". ",), keep=True)
        items.append({
            "id": f"case:{case_id}",
            "lane": "claude",
            "epic": f"cases-{number}",
            "epic_label": f"{number}. {name}",
            "title": _plain(title),
            "body": body,
            "origin_file": f"test-cases/{filename}",
            "origin_status": marker,
            "done": marker in CASE_DONE,
            "state": "done" if marker in CASE_DONE else "later",
            "origin_state": "done" if marker in CASE_DONE else "later",
            "meta": {},
        })
    return items


def parse_operations(ops: Path) -> list[dict]:
    items = []
    for folder, kind in (("registrations", "registration"), ("people", "question")):
        directory = ops / folder
        if not directory.is_dir():
            continue
        for path in sorted(directory.glob("*.md")):
            fm = parse_frontmatter(path)
            status = fm.get("status", "")
            if status not in OPS_STATE:
                raise SystemExit(f"build_tracker: {path.name}: unknown status {status!r}")

            body = path.read_text().split("\n---\n", 1)[1]
            body = re.sub(r"^\s*#\s.+\n", "", body.lstrip(), count=1).strip()

            # A question the owner cannot simply send is half-built. Every question
            # record carries a "## Send this" blockquote written to be copied into
            # WhatsApp or email as-is -- so the wording lives with the question it
            # asks rather than being reinvented at the moment of asking.
            ask_text = ""
            if kind == "question":
                block = re.search(r"^##\s+Send this\s*\n+((?:^>.*\n?|^\s*\n(?=^>))+)",
                                  body, re.M)
                if not block:
                    _reject(f"operations/{folder}/{path.name} is a question with no "
                            "`## Send this` blockquote. Write the line someone can copy "
                            "and send -- a question nobody can ask is not tracked, it is "
                            "just recorded.")
                ask_text = "\n".join(
                    ln.lstrip("> ").rstrip() if ln.strip() != ">" else ""
                    for ln in block.group(1).strip().splitlines()
                ).strip()
                # Remove what was extracted: the sheet renders ask_text in its own
                # styled box with a copy button, so a body still carrying the
                # section would show the same blockquote twice, once raw.
                heading = body.rfind("## Send this", 0, block.start(1))
                body = (body[:heading].rstrip() + "\n\n" + body[block.end(1):].lstrip()).strip()

            meta = {k: v for k, v in fm.items()
                    if k in {"clears_week", "needed_week", "cost", "lead_time",
                             "counterparty", "who", "reference", "answer"} and v}
            clears, needed = fm.get("clears_week"), fm.get("needed_week")
            if clears and needed and needed.isdigit() and clears.isdigit():
                meta["slack"] = int(needed) - int(clears)

            item = {
                "id": f"ops:{path.stem}",
                "lane": "kiro",
                "epic": "registrations" if kind == "registration" else "questions",
                "epic_label": "Registrations" if kind == "registration" else "Open questions",
                "title": fm.get("name") or fm.get("ask") or path.stem,
                "body": body,
                "origin_file": f"operations/{folder}/{path.name}",
                "origin_status": status,
                "done": status in OPS_DONE,
                "state": OPS_STATE[status],
                "origin_state": OPS_STATE[status],
                "meta": meta,
                "alias": fm.get("roadmap_alias", ""),
                "ask_text": ask_text,
            }
            since = fm.get("asked_on") or fm.get("submitted_on")
            if since and item["state"] == "in-progress":
                item["since"] = since
            # Facts for the calendar, whatever the state: when the record actually
            # started and ended. `since` above stays attention-only; these two are
            # history, kept after done so a granted registration keeps its span.
            started = fm.get("asked_on") or fm.get("submitted_on")
            ended = fm.get("answered_on") or fm.get("granted_on")
            if started:
                item["started"] = started
            if ended:
                item["ended"] = ended
            items.append(item)
    return items


def aliases_from(items: list[dict]) -> dict[str, str]:
    return {i["alias"]: i["id"] for i in items if i.get("alias")}


ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _parse_iso(item_id: str, key: str, value: str) -> "date":
    if not isinstance(value, str) or not ISO_DATE.match(value):
        _reject(f"{item_id!r} has {key} {value!r} — dates are ISO YYYY-MM-DD.")
    try:
        return date.fromisoformat(value)
    except ValueError:
        _reject(f"{item_id!r} has {key} {value!r}, which is not a real date.")


def _reject(message: str) -> None:
    raise SystemExit(f"build_tracker: {message}")


def apply_board(items: dict[str, dict], board: dict, week1: "date | None" = None) -> list[tuple[str, str, str, str]]:
    """Overlay the authored attention state, refusing anything that would let the
    tracker disagree with the file that owns the truth."""
    stray_top = set(board) - BOARD_KEYS
    if stray_top:
        _reject(f"board.json has unknown top-level key(s): {', '.join(sorted(stray_top))}. "
                f"Allowed: {', '.join(sorted(BOARD_KEYS))}. A misspelt section would "
                "otherwise be ignored in silence, which is the one failure a board of "
                "flags cannot afford.")

    for task_id, fields in sorted(board.get("tasks", {}).items()):
        if not task_id.startswith("task:"):
            _reject(f"{task_id!r} is in `tasks` but does not start with `task:`. "
                    "Origin-backed items belong in `items`.")
        if task_id in items:
            _reject(f"{task_id!r} already exists as an origin-backed item; a tracker-native "
                    "task may not shadow one.")
        if not fields.get("title"):
            _reject(f"{task_id!r} has no `title`. A tracker-native task has no origin to "
                    "borrow one from, so it must carry its own.")
        stray = set(fields) - TASK_KEYS
        if stray:
            _reject(f"{task_id!r} carries unknown key(s): {', '.join(sorted(stray))}")
        items[task_id] = {
            "id": task_id,
            "lane": fields.get("lane", "claude"),
            "epic": fields.get("epic", "tasks"),
            "epic_label": "Tracker tasks",
            "title": fields["title"],
            "body": fields.get("body", ""),
            "origin_file": "tracker/board.json",
            "origin_status": "open",
            "done": False,
            "state": "later",
            "meta": {},
        }

    superseded: list[tuple[str, str, str, str]] = []

    for item_id, fields in sorted(board.get("items", {}).items()):
        if item_id not in items:
            near = difflib.get_close_matches(item_id, items, n=1, cutoff=0.6)
            hint = f" Did you mean {near[0]!r}?" if near else ""
            _reject(f"{item_id!r} matches no origin.{hint} "
                    "Run --ids for the list the origins currently offer.")
        stray = set(fields) - ITEM_KEYS
        if stray:
            _reject(f"{item_id!r} carries unknown key(s): {', '.join(sorted(stray))}. "
                    f"Allowed: {', '.join(sorted(ITEM_KEYS))}")

        item = items[item_id]
        state = fields.get("state")
        if state is not None:
            if state == "done":
                _reject(f"{item_id!r} is marked `done` in board.json. The origin owns done — "
                        f"tick it in {item['origin_file']} instead. The tracker owns attention, "
                        "never completion.")
            if state not in STATES:
                _reject(f"{item_id!r} has state {state!r}, which is not one of "
                        f"{', '.join(STATES)}")
            if item["done"]:
                _reject(f"{item_id!r} is flagged {state!r} but {item['origin_file']} already "
                        "records it as finished. Clear the flag, or reopen it at the origin.")
            if item["origin_state"] == "later":
                item["state"] = state
            else:
                # The origin has moved on its own — a record at `asked` or `submitted` knows
                # something the flag was written before. Superseding rather than refusing,
                # because the flag was right when it was written and will simply age out.
                superseded.append((item_id, state, item["origin_state"], item["origin_file"]))

        start_s, due_s = fields.get("start"), fields.get("due")
        if start_s or due_s:
            # start/due are a schedule, and a schedule is attention. The same
            # rules that keep state flags honest apply: nothing is scheduled on
            # work the origin already records as finished, and the two authored
            # claims an item can carry — its schedule and its record's own
            # needed-by week — are refused the moment they contradict.
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
            if start_s:
                item["start"] = start_s
            if due_s:
                item["due"] = due_s

        for key in ("note", "since", "blocked_by", "lane"):
            if key in fields:
                item[key] = fields[key]

    for item in items.values():
        blocker = item.get("blocked_by")
        if blocker and blocker not in items:
            _reject(f"{item['id']!r} is blocked_by {blocker!r}, which matches no item.")

    return superseded


def collect(repo: Path) -> dict:
    readme = (repo / "README.md").read_text()
    ops_items = parse_operations(repo / "operations")

    parsed = list(ops_items)
    parsed += parse_roadmap(readme, aliases_from(ops_items))
    for path in sorted((repo / "test-cases").glob("0*.md")):
        parsed += parse_test_cases(path.read_text(), path.name)

    for item in parsed:
        item.pop("alias", None)

    items = {}
    for item in parsed:
        if item["id"] in items:
            _reject(f"duplicate id {item['id']!r} — two origins claim the same task")
        items[item["id"]] = item

    week1 = WEEK_ONE.search(readme)
    if not week1:
        _reject("README.md no longer states which week is week 1; the Schedule is its origin.")

    board_path = repo / "tracker" / "board.json"
    board = json.loads(board_path.read_text()) if board_path.exists() else {}
    superseded = apply_board(items, board, week1=date.fromisoformat(week1.group(1)))

    tokens = json.loads((repo / "design-system" / "tokens.json").read_text())

    order = {}
    for item in items.values():
        order.setdefault(item["epic"], item["epic_label"])
    epics = [{"id": e, "label": label} for e, label in order.items()]

    return {
        "superseded": [
            {"id": i, "flag": f, "origin": o, "origin_file": p} for i, f, o, p in superseded
        ],
        "week1": week1.group(1),
        "attention": {**DEFAULT_ATTENTION, **board.get("attention", {})},
        "epics": epics,
        "items": sorted(items.values(), key=lambda i: (i["epic"], i["id"])),
        "tokens": {
            "primitives": tokens["primitives"],
            "roles": {role: tokens["primitives"][name] for role, name in tokens["roles"].items()},
        },
    }


def render(payload: dict) -> str:
    header = (
        "// GENERATED by tracker/tools/build_tracker.py — do not edit by hand.\n"
        "// Every value below is read from README.md, test-cases/, operations/ and\n"
        "// design-system/tokens.json. To change one, change its origin and re-run\n"
        "// the generator; `--check` is a gate in MASTER.md §9.\n"
        "//\n"
        "// A classic script rather than JSON or a module, because Chrome blocks both\n"
        "// fetch and module loading on file: URLs — and file: is the only way this\n"
        "// tracker is ever opened.\n"
    )
    body = json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False)
    return f"{header}window.CC_TRACKER {chr(61)}\n{body};\n"


def build(repo: Path) -> str:
    return render(collect(repo))


def main() -> int:
    ap = argparse.ArgumentParser(description="Generate the tracker's data file.")
    ap.add_argument("--check", action="store_true", help="exit 1 if board.data.js is stale")
    ap.add_argument("--ids", action="store_true", help="print every ID the origins offer")
    args = ap.parse_args()

    payload = collect(REPO)
    out = REPO / "tracker" / "board.data.js"

    if args.ids:
        for item in payload["items"]:
            print(f"{item['id']:<52} {item['state']:<12} {item['title'][:70]}")
        return 0

    generated = render(payload)
    flagged = sum(1 for i in payload["items"] if i["state"] in {"next", "in-progress", "blocked"})
    open_items = sum(1 for i in payload["items"] if not i["done"])
    summary = (f"{len(payload['items'])} items across {len(payload['epics'])} epics, "
               f"{open_items} open, {flagged} flagged")

    if args.check:
        current = out.read_text() if out.exists() else ""
        if current != generated:
            print("tracker/board.data.js is stale — re-run: "
                  "python3 tracker/tools/build_tracker.py", file=sys.stderr)
            return 1
        print(f"tracker/board.data.js current: {summary}")
        return 0

    out.write_text(generated)
    print(f"wrote tracker/board.data.js: {summary}")
    for sup in payload["superseded"]:
        print(f"  note: {sup['id']} is flagged {sup['flag']!r} in board.json, but "
              f"{sup['origin_file']} now says {sup['origin']!r} — the origin wins. "
              "Drop the flag when convenient; the note is kept either way.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
