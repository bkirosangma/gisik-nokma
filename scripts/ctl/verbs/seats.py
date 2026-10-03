#!/usr/bin/env python3
"""ctl seats — parse a directory of captured panes into one line per seat. Called by verbs/seats.sh.

Input directory D holds, per tmux window N: N.pane (`tmux capture-pane -e -p`, escape codes kept, because a dim span is
what tells a ghost suggestion from typed input) and N.meta (key=value: name, mode = pane_in_mode, wt = the pane's directory,
and the git facts branch/head/unpushed/dirty that seats.sh gathered). Nothing here talks to tmux; the tests drive it with
fixtures. CTL_SEATS_NOW (epoch) pins "now" for them.

  seats.py --dir D [--json] [--flag]
    text  one line per window, flagged seats end in `| FLAG a,b`; last line `OK seats N windows`
    flag  only the flagged seats; last line `OK seats F flagged of N`
    json  one object per line; the summary line goes to stderr so stdout stays a stream of objects
"""
import argparse, datetime, glob, json, os, re, subprocess, sys, time

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))
from boxtext import ANSI, box_index, box_text, plain_of, status_index   # the box reading shared with lib.sh ctl_box_text (13.1820)

SPINNER = re.compile(r"^[^\s\w⏺⎿❯|─-]\s+\S+…\s+\((?:(\d+h) )?(?:(\d+m) )?(\d+s)")   # "✢ Misting… (1m 26s · ↓ 8.0k tokens)", at column 0
DONE_STAMP = re.compile(r"done (\d{1,2}):(\d{2})(?: ?([AaPp])[Mm])?")                  # "✻ Sautéed for 1s · done 1:53 AM · …"
CTX = re.compile(r"Ctx (\d+)%")
SHELLS = re.compile(r"(\d+) shells?\b")
MONITORS = re.compile(r"(\d+) monitors?\b")
PREFIX = r"^[\s⏺⎿·•-]*"
SIGNAL = re.compile(PREFIX + r"((?:DONE|CHECKPOINT) task/\S+ ([0-9a-f]{7,40})\b.*)$")   # a template (`task/<branch> <sha40>`) has no hex sha
REVIEWER_IDLE = re.compile(PREFIX + r"(CHECKPOINT reviewer idle after \S+ ([0-9a-f]{7,40})\b.*)$")   # the reviewer's quiet-point line; its template has `<sha8>`
FINAL = re.compile(r"CHECKPOINT task/\S+ [0-9a-f]{7,40}\s+DONE\b")                                    # a lane's last checkpoint IS its DONE
FRESH = re.compile(PREFIX + r"[\"'`]?(needs fresh session at step (\d+))\b")
FRESH_FIX = re.compile(PREFIX + r"needs fresh FIX session\b")                                         # no placeholder to tell a quote from the line, so no quote prefix
BOUNDARY_CTX = int(os.environ.get("GISIK_SEATS_BOUNDARY_CTX", "20"))
MIDSTEP_CTX = int(os.environ.get("GISIK_SEATS_MIDSTEP_CTX", "30"))     # plan #18: 300k of a 1M window


def role_of(name):
    if name == "main": return "controller"
    for prefix, role in (("exec", "lane"), ("reviewer", "reviewer")):
        if name.startswith(prefix): return role
    return name if name in ("planner", "dispatcher") else "other"


def read_meta(path):
    meta = {}
    try:
        for line in open(path, encoding="utf-8"):
            k, _, v = line.rstrip("\n").partition("=")
            meta[k] = v
    except OSError:
        pass
    return meta


def stamp_epoch(m, now):
    """Today's `done H:MM [AM|PM]` as an epoch; a stamp later than now belongs to yesterday."""
    h, mi, ap = int(m.group(1)), int(m.group(2)), m.group(3)
    if ap:
        h = h % 12 + (12 if ap.lower() == "p" else 0)
    t = datetime.datetime.fromtimestamp(now).replace(hour=h % 24, minute=mi, second=0, microsecond=0)
    e = t.timestamp()
    return e - 86400 if e > now else e


def sha_epoch(wt, sha):
    if not wt or not os.path.isdir(wt): return None
    try:
        out = subprocess.run(["/usr/bin/git", "-C", wt, "show", "-s", "--format=%ct", sha], capture_output=True, text=True,
                             env=dict(os.environ, GIT_OPTIONAL_LOCKS="0"), timeout=5)
    except (OSError, subprocess.SubprocessError):
        return None
    return int(out.stdout.strip()) if out.returncode == 0 and out.stdout.strip().isdigit() else None


def last_signal(plain, wt, now):
    """The last DONE / CHECKPOINT (a lane's, or a reviewer's "reviewer idle after") / needs-fresh line in the scrollback, with its age when it can be known:
    the checkpointed commit's time, else the next turn-end stamp below it, else None."""
    found = None
    for i, l in enumerate(plain):
        m = SIGNAL.match(l) or REVIEWER_IDLE.match(l)
        if m:
            kind = "DONE" if FINAL.match(m.group(1)) else m.group(1).split(" ", 1)[0]
            found = (i, kind, m.group(1).strip(), m.group(2)); continue
        m = FRESH.match(l)
        if m: found = (i, "needs-fresh", f"needs fresh session at step {m.group(2)}", None); continue
        if FRESH_FIX.match(l): found = (i, "needs-fresh", "needs fresh FIX session", None)
    if not found: return None
    i, kind, text, sha = found
    ts = sha_epoch(wt, sha) if sha else None
    if ts is None:
        for l in plain[i + 1:]:
            m = DONE_STAMP.search(l)
            if m: ts = stamp_epoch(m, now); break
    return {"kind": kind, "text": text[:200], "age_s": None if ts is None else max(0, int(now - ts))}


def fmt_age(s):
    if s is None: return "?"
    if s < 60: return f"{s}s"
    if s < 3600: return f"{s // 60}m"
    if s < 86400: return f"{s // 3600}h{(s % 3600) // 60:02d}m"
    return f"{s // 86400}d"


def parse_seat(idx, pane, meta, now):
    lines = pane.split("\n")
    plain = [plain_of(l) for l in lines]
    name = meta.get("name", f"w{idx}")
    status = status_index(plain)
    ctx = model = None
    shells = monitors = 0
    if status is not None:
        ctx = int(CTX.search(plain[status]).group(1))
        for seg in (s.strip() for s in plain[status].split(" | ")):
            if re.fullmatch(r"(?:opus|sonnet|haiku|fable)[\w.-]*", seg): model = seg; break
        foot = " ".join(plain[status + 1:status + 4])
        m = SHELLS.search(foot); shells = int(m.group(1)) if m else 0
        m = MONITORS.search(foot); monitors = int(m.group(1)) if m else 0
    box = box_index(plain, status)   # the prompt box, not the agent panel's ❯ below the footer
    box_idx = len(plain) if box is None else box
    elapsed = None; busy = False
    for l in plain[max(0, box_idx - 16):box_idx]:
        m = SPINNER.match(l)
        if m: busy = True; elapsed = "".join(g for g in m.groups() if g)
    if not busy and any("esc to interrupt" in l for l in plain[max(0, box_idx - 6):]): busy = True
    stamps = [DONE_STAMP.search(l) for l in plain]
    stamps = [m for m in stamps if m]
    done_at = None
    if stamps:
        m = stamps[-1]; done_at = f"{m.group(1)}:{m.group(2)}" + (f" {m.group(3).upper()}M" if m.group(3) else "")
    copy_mode = meta.get("mode", "0") == "1"
    state = "unknown" if (copy_mode or status is None) else ("busy" if busy else "idle")
    text = box_text(lines, box)
    num = lambda k: int(meta[k]) if meta.get(k, "").lstrip("-").isdigit() else None
    seat = {"window": idx, "name": name, "role": role_of(name), "state": state,
            "elapsed": elapsed if state == "busy" else None, "done_at": done_at if state == "idle" else None,
            "shells": shells, "monitors": monitors, "box": "text" if text else "empty", "box_text": text[:120], "copy_mode": copy_mode,
            "ctx": ctx, "model": model, "worktree": meta.get("wt") or None, "branch": meta.get("branch") or None,
            "head": meta.get("head") or None, "unpushed": num("unpushed"), "dirty": num("dirty"),
            "last": last_signal(plain, meta.get("wt"), now)}
    seat["flags"] = flags_of(seat)
    return seat


def flags_of(s):
    f = []
    lane = s["role"] == "lane"; idle = s["state"] == "idle"; busy = s["state"] == "busy"
    last = s["last"]["kind"] if s["last"] else None
    at_signal = last in ("DONE", "CHECKPOINT")
    if s["copy_mode"]: f.append("copy-mode")
    if s["ctx"] is None: f.append("no-claude")
    if s["box"] == "text": f.append("box-text")
    if last == "needs-fresh": f.append("needs-fresh-session")
    bg = s["shells"] + s["monitors"]
    if idle and lane and (bg == 0 or last == "DONE"): f.append("idle-no-task")
    if idle and not lane and bg == 0: f.append("idle-no-watch")
    if s["ctx"] is not None:
        boundary = idle and (not lane or at_signal)
        if boundary and s["ctx"] > BOUNDARY_CTX: f.append(f"ctx>{BOUNDARY_CTX}%-at-boundary")
        elif not boundary and (busy or (lane and idle)) and s["ctx"] > MIDSTEP_CTX: f.append(f"ctx>{MIDSTEP_CTX}%-mid-step")
    return f


def text_line(s):
    state = {"busy": f"busy {s['elapsed']}" if s["elapsed"] else "busy", "idle": f"idle (done {s['done_at']})" if s["done_at"] else "idle"}.get(s["state"], "unknown")
    if s["copy_mode"]: state += " copy-mode"
    box = f"box text: {s['box_text']}" if s["box"] == "text" else "box empty"
    ctx = f"Ctx {s['ctx']}% {s['model'] or '?'}" if s["ctx"] is not None else "Ctx ?"
    if s["branch"]:
        git = f"{s['branch']}@{s['head'] or '?'} unpushed {'?' if s['unpushed'] is None else s['unpushed']} dirty {'?' if s['dirty'] is None else s['dirty']}"
    else:
        git = "no-worktree"
    if s["last"]:
        l = s["last"]; shown = re.sub(r"\b([0-9a-f]{7})[0-9a-f]{33}\b", r"\1", l["text"])[:90]
        last = f"last: {shown if l['kind'] != 'needs-fresh' else shown.replace('needs fresh session ', 'needs-fresh ').replace('needs fresh FIX', 'needs-fresh FIX')} ({fmt_age(l['age_s'])} ago)"
    else:
        last = "last: none"
    line = f"gisik:{s['window']} {s['name']} {s['role']} | {state} | sh {s['shells']} mon {s['monitors']} | {box} | {ctx} | {git} | {last}"
    return line + (f" | FLAG {','.join(s['flags'])}" if s["flags"] else "")


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True); ap.add_argument("--json", action="store_true"); ap.add_argument("--flag", action="store_true")
    a = ap.parse_args(argv)
    now = int(os.environ.get("CTL_SEATS_NOW") or time.time())
    seats = []
    for p in sorted(glob.glob(os.path.join(a.dir, "*.pane")), key=lambda p: int(os.path.basename(p).split(".")[0])):
        idx = int(os.path.basename(p).split(".")[0])
        seats.append(parse_seat(idx, open(p, encoding="utf-8", errors="replace").read(), read_meta(p[:-5] + ".meta"), now))
    shown = [s for s in seats if s["flags"]] if a.flag else seats
    for s in shown:
        print(json.dumps(s, ensure_ascii=False) if a.json else text_line(s))
    summary = f"OK seats {len(shown)} flagged of {len(seats)}" if a.flag else f"OK seats {len(seats)} windows"
    print(summary, file=sys.stderr if a.json else sys.stdout)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
