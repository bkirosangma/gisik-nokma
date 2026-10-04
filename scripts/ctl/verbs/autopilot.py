#!/usr/bin/env python3
"""ctl autopilot — the matchmaking the controller did by hand (planner MSG-orch-bottleneck-1, 2026-10-04: the hand-off is the
bottleneck). Called by verbs/autopilot.sh.

  autopilot.py once [--shadow] [--no-fetch]        one pass: read the world, decide, act (or, --shadow, log what it WOULD do)
  autopilot.py run  [--shadow] [--interval 60]     a pass every <interval> s, forever, under a singleton lock

A pass, in this order (each seat gets at most one action, each queue item and each task row at most one seat):
  (p) a reviewer that wrote roles/PULL-<X>.boot and is idle, box empty, 0 shells is restarted on that boot (the protocol of the
      controller's 30 s pull-restarter, which this replaces; a missing boot file is dropped).
  (b) a FREE LANE (idle, box empty, 0 shells, unpushed 0, dirty 0, its last line a DONE whose REVIEW line is in QUEUE-review.md, or a
      finished review) takes, by fluid rule A.3: an open FIX line of roles/QUEUE-autopilot.md for its pool (the controller writes
      the FIX PTR: FIX briefs stay judgement work); else waits while a reviewer FIX verdict of its pool is younger than the grace and
      has no such line (FIX-WAIT); else the first row of its pool's order file whose Needs are all on the release tip; else the
      first row it can STACK on (at most 2 unlanded levels, ONE unlanded branch). The PTR comes from scripts/ctl/make-lane-ptr.py.
  (a) a FREE REVIEWER (idle, box empty, 0 shells, holding no open TOOK) takes the open REVIEW item the pull rule ranks first:
      FIX re-checks, the critical path, the oldest; A/B their own pool first, C either (KG wins a tie).
  (c) a free lane with nothing startable becomes a reviewer (fluid rule B) for an item that passes the independence rules.
Every pass also logs `WARN hold >10 min with waiters` when a `ctl run-tests` slot is held past 10 min while another run waits
(slot_watch; read-only), and, live only, runs `ctl prune-gate-locks --apply` once an hour.
Every item skips: needs-tip, an item addressed to another reviewer, a stale sha (origin/<branch> moved: a preflight or a tipmerge is
in flight), a lane busy/dirty/unpushed on that branch (preflight in flight), and for a lane-reviewer its own work, a branch stacked on
its own work and a branch its own work stacks on.

The DOOR (class Door) is the ONLY code that writes a file, appends a queue line, runs make-reviewer-boot.py / make-lane-ptr.py
without --dry-run, or calls `ctl restart`; under --shadow it logs `WOULD …` and returns before any of that (13.2117).
Seams (tests): CTL_LANES_DIR, CTL_LOG_DIR, CTL_AUTOPILOT_REPO, CTL_AUTOPILOT_SEATS_CMD, CTL_AUTOPILOT_CTL, CTL_AUTOPILOT_REVIEWER_BOOT,
CTL_AUTOPILOT_NOW (epoch), CTL_AUTOPILOT_LANES ("1:WG,2:WG,3:KG,4:KG"), CTL_AUTOPILOT_REVIEWERS ("A:7:KG,B:9:WG,C:10:*"),
CTL_AUTOPILOT_WT_ROOT (/Users/kiro/my_projects), CTL_AUTOPILOT_PS_CMD and CTL_SEM_DIR (the slot watch).
"""
import argparse, fnmatch, json, os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
CTL_DIR = os.path.dirname(HERE)
LADDER = ["L", "M", "H", "H+", "H++"]
LAUNCH = {"L": ("sonnet", "medium"), "M": ("sonnet", "high"), "H": ("opus", "high"), "H+": ("opus", "xhigh"), "H++": ("opus", "max")}
RELEASE = {"KG": "release/knowledge-graph", "WG": "release/workflow-graph"}
ORDER = {"KG": "QUEUE-kg-order.md", "WG": "QUEUE-wg-order.md"}
COOLDOWN_S = 180          # no second action on a window this soon after the last (a restarted seat takes ~30 s to show busy)
FIX_GRACE_MIN = 15        # a fresh FIX verdict holds its pool's free lane this long for the controller's FIX PTR
MAX_STACK = 2             # fluid rule A.3: at most 2 unreviewed levels
PTR_RECENT_S = 24 * 3600  # a hand-written PTR naming a branch this recently = the controller started that task
PRUNE_EVERY_S = 3600
DIRECTED_GRACE_MIN = 20     # an item ending `(… reviewer X)` waits this long for X (live 09:42: C took B's item after 28 min)
SLOT_HOLD_WARN_S = 600     # a test-slot hold past 10 min while others wait is warned (orchestrator 11:10, planner finding P10)
ITEM_MAX_AGE_MIN = 12 * 60   # an item waiting longer is the controller's call (the queue keeps yesterday's never-closed lines)
HHMM = re.compile(r"^(\d{1,2}:\d{2}) (\S+)\s*(.*)$")
SHA40 = re.compile(r"\b[0-9a-f]{40}\b")


# ---------------------------------------------------------------- config
def env_now():
    return int(os.environ.get("CTL_AUTOPILOT_NOW") or time.time())


def lanes_cfg():
    out = {}
    for part in (os.environ.get("CTL_AUTOPILOT_LANES") or "1:WG,2:WG,3:KG,4:KG").split(","):
        w, _, pool = part.partition(":"); out[int(w)] = pool
    return out


def reviewers_cfg():
    root = wt_root(); out = {}
    for part in (os.environ.get("CTL_AUTOPILOT_REVIEWERS") or "A:7:KG,B:9:WG,C:10:*").split(","):
        x, w, pool = part.split(":")
        out[x] = {"window": int(w), "pool": None if pool == "*" else pool,
                  "wt": os.path.join(root, {"A": "gisik-nokma-review", "B": "gisik-nokma-review2", "C": "gisik-nokma-review3"}.get(x, f"gisik-nokma-review-{x}"))}
    return out


def wt_root():
    return os.environ.get("CTL_AUTOPILOT_WT_ROOT") or "/Users/kiro/my_projects"


def lane_wt(n):
    return os.path.join(wt_root(), f"gisik-nokma-exec{n}")


def bump(rung, by=1):
    """table rung + by on the ladder; None past H++ (a flag for the planner, never a launch)."""
    if rung not in LADDER: return None
    i = LADDER.index(rung) + by
    return LADDER[i] if i < len(LADDER) else None


def minutes(hhmm):
    h, m = hhmm.split(":"); return int(h) * 60 + int(m)


def age_min(now_hhmm, then_hhmm):
    return (minutes(now_hhmm) - minutes(then_hhmm)) % 1440


# ---------------------------------------------------------------- parsers (pure)
def parse_review_queue(text):
    """roles/QUEUE-review.md → (items, takes, dones, fix_verdicts, fix_takes), each with its line position. TOOK/DONE lines cite the
    REVIEW line's TIME (several REVIEW lines can share one), so closing an item needs its branch AND (its sha8 or its time)."""
    items, takes, dones, fixes, fix_takes = [], [], [], [], []
    day, prev = 0, None   # the lines carry HH:MM and no date: a time more than 6 h BELOW the previous line's is the next day
    for pos, line in enumerate(text.split("\n")):
        m = HHMM.match(line.strip())
        if not m: continue
        t, kind, rest = m.groups()
        if prev is not None and minutes(t) < prev - 360: day += 1
        prev = minutes(t)
        if kind == "REVIEW":
            r = re.match(r"(task/\S+) ([0-9a-f]{40})\b(.*)$", rest)
            if not r: continue
            f = dict(re.findall(r"\b(base|brief|lane|handoff)=(\S+)", r.group(3)))
            d = re.search(r"\breviewer ([A-Z])\)\s*$", line)
            items.append({"pos": pos, "time": t, "branch": r.group(1), "sha": r.group(2), "base": f.get("base", ""), "brief": f.get("brief", ""),
                          "lane": int(f["lane"]) if f.get("lane", "").isdigit() else None, "handoff": f.get("handoff"), "line": line.strip(),
                          "rest": r.group(3), "directed": d.group(1) if d else None, "day": day})
        elif kind in ("TOOK", "DONE"):
            ref = rest.split(" ", 1)[0] if re.match(r"\d{1,2}:\d{2}\b", rest) else None
            br = re.search(r"\b(task/\S+?)[,;)]?(?:\s|$)", rest)
            rec = {"pos": pos, "time": t, "ref": ref, "branch": br.group(1) if br else None, "text": rest}
            h = re.search(r"\((?:[^)]*?[ ,;:])?(reviewer [A-Z]|lane \d+ as reviewer)\b", rest)
            rec["holder"] = h.group(1) if h else None
            (takes if kind == "TOOK" else dones).append(rec)
            if kind == "TOOK" and re.search(r"\bFIX\b", rest) and br: fix_takes.append(rec)
            if kind == "DONE" and re.search(r"\bFIX\b", rest) and br:
                b = re.search(r"\b(BRIEF-\S+?\.md)\b", rest)
                fixes.append({"pos": pos, "time": t, "branch": br.group(1), "brief": b.group(1) if b else None})
    return items, takes, dones, fixes, fix_takes


def item_age_min(items_text_last, it, now_hhmm):
    """Minutes since the item's REVIEW line: its day index against the queue's last day (one more if now's clock is > 6 h below the
    last line's, i.e. midnight passed since)."""
    last_day, last_t = items_text_last
    cur = last_day + (1 if last_t is not None and minutes(now_hhmm) < last_t - 360 else 0)
    return (cur - it["day"]) * 1440 + minutes(now_hhmm) - minutes(it["time"])


def last_stamp(text):
    day, prev = 0, None
    for line in text.split("\n"):
        m = HHMM.match(line.strip())
        if not m: continue
        if prev is not None and minutes(m.group(1)) < prev - 360: day += 1
        prev = minutes(m.group(1))
    return day, prev


def open_items(items, takes, dones):
    """The latest REVIEW line per branch (a newer sha supersedes), unless a LATER TOOK/DONE names the branch and its sha8 or time."""
    latest = {}
    for it in items: latest[it["branch"]] = it
    out = []
    for it in sorted(latest.values(), key=lambda i: i["pos"]):
        closed = any(r["pos"] > it["pos"] and r["branch"] == it["branch"] and (it["sha"][:8] in r["text"] or r["ref"] == it["time"])
                     for r in takes + dones)
        if not closed: out.append(it)
    return out


def open_takes(takes, dones):
    """TOOK lines whose holder (`reviewer X` / `lane N as reviewer`) has not yet written a DONE citing the same REVIEW time. A seat
    reviews ONE item at a time, so a LATER TOOK by the same holder releases the earlier one (the live queue holds TOOKs from earlier
    days whose DONE never named its holder; read live 2026-10-04 09:47: reviewer B 'held' 11:33 and 01:35 for ever)."""
    return [t for t in takes if t["holder"] and t["ref"] and not any(
        d["pos"] > t["pos"] and d["ref"] == t["ref"] and d["holder"] == t["holder"] for d in dones)
        and not any(u["pos"] > t["pos"] and u["holder"] == t["holder"] for u in takes)]


def parse_order(text):
    """The ```autopilot block of an order file → (rows, critical globs, errors). A row: id rung plan task branch needs."""
    rows, crit, errs, inside = [], [], [], False
    for n, line in enumerate(text.split("\n"), 1):
        s = line.strip()
        if s.startswith("```"):
            if inside: inside = False
            elif s[3:].strip() == "autopilot": inside = True
            continue
        if not inside or not s or s.startswith("#"): continue
        f = s.split()
        if f[0] == "critical": crit += f[1:]; continue
        if len(f) != 6 or f[1] not in LADDER or not f[4].startswith("task/"):
            errs.append(f"line {n}: {s[:80]}"); continue
        rows.append({"id": f[0], "rung": f[1], "plan": f[2], "task": f[3], "branch": f[4], "needs": [] if f[5] == "-" else f[5].split(",")})
    return rows, crit, errs


def parse_fix_queue(text):
    """roles/QUEUE-autopilot.md: the controller's `HH:MM FIX <KG|WG|lane N|N> <PTR-file> <task/branch>` lines and the autopilot's
    `HH:MM TOOK <line-time> <branch> (autopilot: lane N)`; open = no later TOOK citing that time and branch."""
    fixes, takes = [], []
    for pos, line in enumerate(text.split("\n")):
        m = HHMM.match(line.strip())
        if not m: continue
        t, kind, rest = m.groups()
        if kind == "FIX":
            f = re.match(r"(KG|WG|lane \d+|\d+) (\S+\.md) (task/\S+)", rest)
            if f: fixes.append({"pos": pos, "time": t, "target": f.group(1), "ptr": f.group(2), "branch": f.group(3), "line": line.strip()})
        elif kind == "TOOK":
            f = re.match(r"(\d{1,2}:\d{2}) (task/\S+)", rest)
            if f: takes.append({"pos": pos, "ref": f.group(1), "branch": f.group(2)})
    return [x for x in fixes if not any(k["pos"] > x["pos"] and k["ref"] == x["time"] and k["branch"] == x["branch"] for k in takes)]


def parse_ledger(text):
    """roles/AUTOPILOT-ledger.tsv: `<epoch>\t<HH:MM>\t<window>\t<kind>\t<branch|->\t<detail>`, one line per live action."""
    rows = []
    for line in text.split("\n"):
        f = line.split("\t")
        if len(f) >= 5 and f[0].isdigit(): rows.append({"t": int(f[0]), "window": f[2], "kind": f[3], "branch": f[4]})
    return rows


def ptr_rung(text):
    m = re.match(r"\s*RUNG: (H\+\+|H\+|H|M|L)(?![\w+])", text)   # not \b: `H+ (` has no word boundary after the +
    return m.group(1) if m else None


# ---------------------------------------------------------------- git (read-only)
class Git:
    def __init__(self, repo):
        self.repo = repo; self._head = {}; self._anc = {}; self._merges = {}; self._paths = {}

    def run(self, *args):
        p = subprocess.run(["/usr/bin/git", "-C", self.repo, *args], capture_output=True, text=True, env=dict(os.environ, GIT_OPTIONAL_LOCKS="0"))
        return p.returncode, p.stdout.strip()

    def head(self, branch):
        if branch not in self._head:
            rc, out = self.run("rev-parse", "--verify", "-q", f"refs/remotes/origin/{branch}")
            self._head[branch] = out if rc == 0 and out else None
        return self._head[branch]

    def is_ancestor(self, a, b):
        k = (a, b)
        if k not in self._anc: self._anc[k] = self.run("merge-base", "--is-ancestor", a, b)[0] == 0
        return self._anc[k]

    def has_path(self, release, path):
        k = (release, path)
        if k not in self._paths:
            rc, out = self.run("ls-tree", f"origin/{release}", "--", path.rstrip("/"))
            self._paths[k] = rc == 0 and bool(out)
        return self._paths[k]

    def landed(self, branch, release):
        """On the tip: origin/<branch> is an ancestor of origin/<release>, or the tip carries the PR merge of <branch> or <branch>-gated
        (a landed branch is often deleted afterwards)."""
        tip = self.head(release)
        if not tip: return False
        h = self.head(branch)
        if h and self.is_ancestor(h, tip): return True
        if release not in self._merges:
            self._merges[release] = self.run("log", "--merges", "--format=%s", f"origin/{release}", "-n", "3000")[1].split("\n")
        pat = re.compile(r"from \S+?/" + re.escape(branch) + r"(-gated)?$")
        return any(pat.search(s) for s in self._merges[release])


# ---------------------------------------------------------------- the world
class World:
    """Everything a pass reads, gathered once. Tests build it from a scratch lanes root, a scratch repo and a seats fixture."""

    def __init__(self, lanes_dir, repo, seats, now):
        self.L = lanes_dir; self.R = os.path.join(lanes_dir, "roles"); self.git = Git(repo); self.now = now
        self.hhmm = time.strftime("%H:%M", time.localtime(now))
        self.seats = {s["window"]: s for s in seats}
        rq = read(os.path.join(self.R, "QUEUE-review.md"))
        self.items, self.takes, self.dones, self.fix_verdicts, self.fix_takes = parse_review_queue(rq)
        self.last = last_stamp(rq)
        self.open = open_items(self.items, self.takes, self.dones)
        self.held = open_takes(self.takes, self.dones)
        self.fixq = parse_fix_queue(read(os.path.join(self.R, "QUEUE-autopilot.md")))
        self.ledger = parse_ledger(read(os.path.join(self.R, "AUTOPILOT-ledger.tsv")))
        self.orders = {}
        for pool, f in ORDER.items():
            p = os.path.join(lanes_dir, f)
            self.orders[pool] = parse_order(read(p)) + (os.path.exists(p),)
        ws = [s.get("weekly") for s in seats if s.get("weekly") is not None]
        self.weekly = max(ws) if ws else None
        self.recent_ptrs = None

    def ptr_texts(self):
        if self.recent_ptrs is None:
            self.recent_ptrs = []
            try:
                for e in os.scandir(self.L):
                    if e.name.startswith("PTR-") and e.name.endswith(".md") and self.now - e.stat().st_mtime <= PTR_RECENT_S:
                        self.recent_ptrs.append((e.name, read(e.path)))
            except OSError:
                pass
        return self.recent_ptrs


def read(p):
    try:
        with open(p, encoding="utf-8", errors="replace") as f: return f.read()
    except OSError:
        return ""


# ---------------------------------------------------------------- seat predicates (each returns None = free, else the reason)
def seat_free(s):
    if s is None: return "no seat"
    if s.get("state") != "idle": return f"state {s.get('state')}"
    if s.get("copy_mode"): return "copy-mode"
    if s.get("box") != "empty": return "box holds text"
    if s.get("shells"): return f"{s['shells']} shells running"
    return None


def reviewer_free(s):
    """seat_free + a clean worktree: `ctl restart` refuses a dirty one, and a TOOK written for a seat that never restarts sticks."""
    why = seat_free(s)
    if why: return why
    if s.get("dirty"): return f"dirty {s['dirty']} (ctl restart would refuse it)"
    return None


def done_of(seat):
    """(branch, sha) of a lane's last DONE line: `DONE task/<b> <sha>` or `CHECKPOINT task/<b> <sha> DONE`."""
    last = seat.get("last") or {}
    if last.get("kind") != "DONE": return None
    m = re.search(r"(task/\S+) ([0-9a-f]{7,40})\b", last.get("text", ""))
    return (m.group(1), m.group(2)) if m else None


def lane_free(w, n):
    s = w.seats.get(n)
    why = seat_free(s)
    if why: return why
    if s.get("unpushed") != 0: return f"unpushed {s.get('unpushed')}"
    if s.get("dirty") != 0: return f"dirty {s.get('dirty')}"
    last = s.get("last") or {}
    if last.get("text", "").startswith("CHECKPOINT reviewer idle after"):
        mine = f"lane {n} as reviewer"
        if any(t["holder"] == mine for t in w.held): return "holds an open review TOOK"
        return None
    d = done_of(s)
    if not d: return f"last line is {last.get('kind') or 'none'}, not a DONE"
    if not any(it["branch"] == d[0] and it["sha"].startswith(d[1]) for it in w.items): return f"DONE {d[0]} {d[1][:8]} has no REVIEW line yet"
    return None


def cooldown(w, window):
    t = max((r["t"] for r in w.ledger if r["window"] == str(window)), default=None)
    return f"cooldown ({w.now - t}s since the last action)" if t is not None and w.now - t < COOLDOWN_S else None


# ---------------------------------------------------------------- tasks (rule A.3)
def pool_of_lane(n):
    return lanes_cfg().get(n)


def item_pool(it):
    if it["lane"] is not None and pool_of_lane(it["lane"]): return pool_of_lane(it["lane"])
    return "KG" if "knowledge-graph" in it["base"] else ("WG" if "workflow-graph" in it["base"] else None)


def taken(w, branch):
    """A row is not startable when its branch exists on origin, has a REVIEW line, is any seat's branch, was started by this
    autopilot (the ledger), or a hand-written PTR from the last 24 h names it (the controller started it by hand)."""
    if w.git.head(branch): return "on origin"
    if any(it["branch"] == branch for it in w.items): return "has a REVIEW line"
    if any(s.get("branch") == branch for s in w.seats.values()): return "a seat is on it"
    if any(r["branch"] == branch for r in w.ledger): return "started by the autopilot"
    pat = re.compile(re.escape(branch) + r"(?![A-Za-z0-9._/-])")
    hit = next((n for n, t in w.ptr_texts() if pat.search(t)), None)
    return f"named by {hit}" if hit else None


def need_state(w, tok, pool, rows_by_id, seen=()):
    """(state, branch, depth): landed (depth 0) | pushed (unlanded on origin; depth = its own stack depth + 1) | absent | unknown."""
    rel = RELEASE[pool]
    if tok.startswith("path:"):
        return ("landed", None, 0) if w.git.has_path(rel, tok[5:]) else ("absent", None, None)
    row = None
    if tok.startswith("branch:"): b = tok[7:]
    else:
        row = rows_by_id.get(tok)
        if row is None: return ("unknown", None, None)
        b = row["branch"]
    if w.git.landed(b, rel): return ("landed", b, 0)
    if not w.git.head(b): return ("absent", b, None)
    if row is None: return ("pushed", b, 1)
    if row["id"] in seen: return ("unknown", b, None)
    sub = [need_state(w, t, pool, rows_by_id, seen + (row["id"],)) for t in row["needs"]]
    if any(s[0] in ("absent", "unknown") for s in sub): return ("pushed", b, None)
    return ("pushed", b, 1 + max([s[2] for s in sub] or [0]))


def candidates(w, pool, log):
    """The pool's startable rows in order: (row, None) for Needs on the tip, (row, (branch, sha)) for a stack. Logs every skip once."""
    rows, crit, errs, exists = w.orders[pool]
    if not exists: log(f"SKIP pool {pool}: no order file {ORDER[pool]} (no rows)"); return []
    for e in errs: log(f"SKIP pool {pool} order row unparsed ({e}): needs-unparsed, never a launch")
    if not rows: log(f"SKIP pool {pool}: {ORDER[pool]} has no ```autopilot block rows")
    by_id = {r["id"]: r for p in w.orders.values() for r in p[0]}
    ready, stacks = [], []
    for r in rows:
        why = taken(w, r["branch"])
        if why: continue
        st = [(t,) + need_state(w, t, pool, by_id) for t in r["needs"]]
        bad = [f"{t} {s}" for t, s, b, d in st if s in ("absent", "unknown")]
        if bad: log(f"NEEDS {pool} {r['id']} {r['branch']}: {', '.join(bad)} — a NEEDS skip, not a launch"); continue
        up = [(t, b, d) for t, s, b, d in st if s == "pushed"]
        if not up: ready.append((r, None)); continue
        if any(d is None for _, _, d in up): log(f"NEEDS {pool} {r['id']}: an unlanded need sits on a missing one"); continue
        depth = max(d for _, _, d in up)
        bases = sorted({b for _, b, _ in up})
        if depth > MAX_STACK: log(f"SKIP {pool} {r['id']}: stack {depth} levels deep (max {MAX_STACK})"); continue
        if len(bases) > 1: log(f"SKIP {pool} {r['id']}: needs {len(bases)} unlanded branches ({', '.join(bases)}); one stack base only"); continue
        b = bases[0]; head = w.git.head(b)
        last = [it for it in w.items if it["branch"] == b]
        if not last or last[-1]["sha"] != head: log(f"SKIP {pool} {r['id']}: stack base {b} has no REVIEW line at its origin head {head[:8]} (still moving)"); continue
        stacks.append((r, (b, head)))
    return ready + stacks


def fix_waiting(w, pool):
    """A reviewer FIX verdict of this pool younger than the grace, not yet taken and with no QUEUE-autopilot FIX line: the lane waits."""
    for f in w.fix_verdicts:
        its = [it for it in w.items if it["branch"] == f["branch"]]
        if not its or item_pool(its[-1]) != pool: continue
        if any(t["pos"] > f["pos"] and t["branch"] == f["branch"] for t in w.fix_takes): continue
        if any(it["pos"] > f["pos"] for it in its): continue
        if any(x["branch"] == f["branch"] for x in w.fixq): continue
        if age_min(w.hhmm, f["time"]) < FIX_GRACE_MIN: return f
    return None


# ---------------------------------------------------------------- review items (the pull rule)
def critical(w, it):
    pool = item_pool(it)
    globs = w.orders.get(pool, ([], [], [], False))[1] if pool else []
    return any(fnmatch.fnmatch(it["branch"], g) for g in globs)


def rank(w, it, own_pool, times):
    cls = 0 if (re.search(r"\bFIX\b", it["rest"]) or "fix" in it["brief"].lower()) else (1 if critical(w, it) else 2)
    pool = item_pool(it)
    other = 0 if own_pool is None else (0 if pool == own_pool else 1)
    return (other, cls, times.index(it["time"]), 0 if pool == "KG" else 1, it["pos"])


def own_branches(w, lane):
    own = {it["branch"] for it in w.items if it["lane"] == lane}
    s = w.seats.get(lane) or {}
    if s.get("branch") and s["branch"].startswith("task/"): own.add(s["branch"])
    own |= {r["branch"] for r in w.ledger if r["window"] == str(lane) and r["branch"].startswith("task/")}
    return own


def item_skip(w, it, who, lane=None):
    """None = this seat may take the item; else why not."""
    if "needs-tip" in it["line"]: return "needs-tip"
    age = item_age_min(w.last, it, w.hhmm)
    if age > ITEM_MAX_AGE_MIN: return f"older than {ITEM_MAX_AGE_MIN // 60} h ({age // 60} h): the controller's call, never a pull"
    if it["directed"] and (lane is not None or it["directed"] != who) and age <= DIRECTED_GRACE_MIN:
        return f"addressed to reviewer {it['directed']} ({age} min; open to all after {DIRECTED_GRACE_MIN})"
    head = w.git.head(it["branch"])
    if head != it["sha"]: return f"stale: origin/{it['branch']} is {head[:8] if head else 'gone'}, the line says {it['sha'][:8]}"
    on = next((r for r in list(RELEASE.values()) + ["main"] if w.git.head(r) and w.git.is_ancestor(it["sha"], w.git.head(r))), None)
    if on: return f"already landed (on origin/{on})"
    for n, s in w.seats.items():
        if s.get("role") == "lane" and s.get("branch") == it["branch"] and (s.get("state") != "idle" or s.get("dirty") or s.get("unpushed") or s.get("box") != "empty"):
            return f"preflight in flight: lane {n} is {s.get('state')} dirty {s.get('dirty')} unpushed {s.get('unpushed')} on it"
    if lane is not None:
        own = own_branches(w, lane)
        if it["lane"] == lane or it["branch"] in own: return "self-review (own work)"
        m = re.match(r"origin/(task/[^@\s]+)@", it["base"])
        if m and m.group(1) in own: return f"stacked on own {m.group(1)}"
        for b in own:
            mine = [x for x in w.items if x["branch"] == b]
            if mine and re.match(r"origin/" + re.escape(it["branch"]) + r"@", mine[-1]["base"]): return f"own {b} stacks on it"
            h = w.git.head(b)
            if h and h != it["sha"] and not any(w.git.landed(b, r) for r in RELEASE.values()) and w.git.is_ancestor(h, it["sha"]):
                return f"stacked on own {b} (contains its unlanded head)"
    return None


def pick_item(w, who, own_pool, used, log, lane=None):
    times = []
    for it in w.items:
        if it["time"] not in times: times.append(it["time"])
    best = None
    for it in sorted(w.open, key=lambda i: rank(w, i, own_pool, times)):
        if it["branch"] in used: continue
        why = item_skip(w, it, who, lane)
        if why: log(f"SKIP {'lane ' + str(lane) if lane else 'reviewer ' + who} x {it['branch']} {it['sha'][:8]}: {why}"); continue
        best = it; break
    return best


# ---------------------------------------------------------------- the decision
def decide(w, log):
    """→ a list of actions (dicts with 'do'); every skip is logged with its reason. Reads only."""
    acts, used_items, used_rows = [], set(), set()
    if w.weekly is None: log("BUDGET weekly % unknown (no seat shows it): no H++ launch this pass")
    elif w.weekly >= 85: log(f"BUDGET weekly {w.weekly}%: no H++ launch" + ("; no lane launch at all (>= 95%)" if w.weekly >= 95 else ""))
    revs = reviewers_cfg()
    busy_windows = set()
    # (p) PULL files first: the reviewer chose its own item and wrote the TOOK.
    for x, r in revs.items():
        f = os.path.join(w.R, f"PULL-{x}.boot")
        if not os.path.exists(f): continue
        boot = read(f).strip().split("\n")[0].strip()
        if not os.path.isfile(boot): acts.append({"do": "drop-pull", "who": x, "pullfile": f, "why": f"boot {boot} missing"}); continue
        why = reviewer_free(w.seats.get(r["window"])) or cooldown(w, r["window"])
        if why: log(f"WAIT reviewer {x} PULL {os.path.basename(boot)}: {why}"); busy_windows.add(r["window"]); continue
        acts.append({"do": "pull", "who": x, "window": r["window"], "wt": r["wt"], "boot": boot, "pullfile": f}); busy_windows.add(r["window"])
    # (b) free lanes: FIX, then tip-ready, then stack
    free_lanes, cands = [], {}
    for n, pool in sorted(lanes_cfg().items()):
        why = lane_free(w, n) or cooldown(w, n)
        if why: log(f"SKIP lane {n}: {why}"); continue
        if pool not in cands: cands[pool] = candidates(w, pool, log)
        fx = next((x for x in w.fixq if x["target"] in (pool, f"lane {n}", str(n)) and x["branch"] not in used_rows), None)
        if fx:
            held = next((m for m, s in w.seats.items() if m != n and s.get("branch") == fx["branch"]), None)
            text = read(os.path.join(w.L, fx["ptr"])); rung = ptr_rung(text)
            if held is not None: log(f"SKIP lane {n} FIX {fx['branch']}: checked out in window {held}")
            elif not text: log(f"SKIP lane {n} FIX {fx['branch']}: no PTR {fx['ptr']}")
            elif not rung: log(f"SKIP lane {n} FIX {fx['branch']}: {fx['ptr']} has no `RUNG:` first line")
            elif budget_refuses(w, rung): log(f"SKIP lane {n} FIX {fx['branch']}: {budget_refuses(w, rung)}")
            else:
                acts.append({"do": "fix", "lane": n, "wt": lane_wt(n), "fix": fx, "rung": rung}); used_rows.add(fx["branch"]); continue
        fw = fix_waiting(w, pool)
        if fw: log(f"WAIT lane {n}: FIX verdict {fw['time']} {fw['branch']} ({age_min(w.hhmm, fw['time'])} min old) has no QUEUE-autopilot FIX line yet"); continue
        pick = None
        for row, stack in cands[pool]:
            if row["branch"] in used_rows: continue
            eff = bump(row["rung"])
            if eff is None: log(f"FLAG {pool} {row['id']}: table rung {row['rung']} + 1 is past H++ (planner)"); continue
            why = budget_refuses(w, eff)
            if why: log(f"SKIP lane {n} x {row['id']}: {why}"); continue
            pick = (row, stack, eff); break
        if pick:
            row, stack, eff = pick
            acts.append({"do": "start", "lane": n, "pool": pool, "wt": lane_wt(n), "row": row, "stack": stack, "rung": eff}); used_rows.add(row["branch"])
        else:
            free_lanes.append(n)
    # (a) free reviewers
    for x, r in revs.items():
        if r["window"] in busy_windows: continue
        why = reviewer_free(w.seats.get(r["window"])) or cooldown(w, r["window"])
        if not why and any(t["holder"] == f"reviewer {x}" for t in w.held):
            why = "holds an open TOOK (" + ", ".join(f"{t['ref']} {t['branch']}" for t in w.held if t["holder"] == f"reviewer {x}") + ")"
        if why: log(f"SKIP reviewer {x}: {why}"); continue
        it = pick_item(w, x, r["pool"], used_items, log)
        if it: acts.append({"do": "review", "who": x, "window": r["window"], "wt": r["wt"], "item": it}); used_items.add(it["branch"])
        else: log(f"IDLE reviewer {x}: nothing eligible")
    # (c) a lane with nothing startable becomes a reviewer
    for n in free_lanes:
        it = pick_item(w, "C", None, used_items, log, lane=n)
        if it: acts.append({"do": "review", "who": f"lane {n}", "lane": n, "window": n, "wt": lane_wt(n), "item": it}); used_items.add(it["branch"])
        else: log(f"IDLE lane {n}: no startable task and no review it may take")
    return acts


def budget_refuses(w, rung):
    if w.weekly is not None and w.weekly >= 95: return f"budget: weekly {w.weekly}% >= 95, no lane launch"
    if rung == "H++" and (w.weekly is None or w.weekly >= 85): return f"budget: H++ needs weekly < 85% (is {w.weekly if w.weekly is not None else 'unknown'})"
    return None


# ---------------------------------------------------------------- the door (the ONLY side effects)
class Door:
    def __init__(self, w, shadow, log, repo):
        self.w = w; self.shadow = shadow; self.log = log; self.repo = repo
        self.ctl = os.environ.get("CTL_AUTOPILOT_CTL") or os.path.join(CTL_DIR, "ctl")
        self.boot = os.environ.get("CTL_AUTOPILOT_REVIEWER_BOOT") or os.path.join(w.R, "make-reviewer-boot.py")

    def act(self, a):
        desc = describe(a)
        if self.shadow:
            self.log(f"WOULD {desc}"); return
        self.log(f"ACT {desc}")
        getattr(self, "do_" + a["do"].replace("-", "_"))(a)

    # -- helpers, reached only through act()
    def sh(self, *argv, timeout=180):
        p = subprocess.run(list(argv), capture_output=True, text=True, timeout=timeout)
        out = (p.stdout + p.stderr).strip().split("\n")
        return p.returncode, out[-1] if out else ""

    def ledger(self, window, kind, branch, detail):
        with open(os.path.join(self.w.R, "AUTOPILOT-ledger.tsv"), "a", encoding="utf-8") as f:
            f.write(f"{self.w.now}\t{self.w.hhmm}\t{window}\t{kind}\t{branch or '-'}\t{detail}\n")

    def append_locked(self, path, line, still_open):
        """Append under the reviewers' mkdir lock (macOS has no flock), re-checking inside it that the item is still open."""
        lock = os.path.join(self.w.R, ".queue.lock.d")
        for _ in range(30):
            try: os.mkdir(lock); break
            except FileExistsError: time.sleep(1)
        else:
            return "the queue lock stayed held for 30 s"
        try:
            if not still_open(read(path)): return "taken by another seat while the lock was waited for"
            with open(path, "a", encoding="utf-8") as f: f.write(line + "\n")
            return None
        finally:
            os.rmdir(lock)

    def restart(self, window, wt, brief, model, effort, override=None):
        argv = [self.ctl, "restart", str(window), wt, brief] + (["--override", override] if override else []) + ["--model", model, "--effort", effort]
        rc, last = self.sh(*argv)
        ok = rc == 0 or "no backend line" in last   # restart.sh's known false negative (O7 "Landing and restarts")
        self.log(f"  restart gisik:{window}: rc={rc} {last[:160]}" + ("" if ok else " — FLAG restart failed: the controller clears it"))
        return ok

    def do_drop_pull(self, a):
        os.remove(a["pullfile"])

    def do_pull(self, a):
        if not self.restart(a["window"], a["wt"], a["boot"], "opus", "high"): return   # the PULL file stays: retried after the cooldown-free next pass
        os.remove(a["pullfile"]); self.ledger(a["window"], "PULL", "-", os.path.basename(a["boot"]))

    def do_review(self, a):
        it = a["item"]; who = a["who"]; d = os.path.join(self.w.R, "autopilot"); os.makedirs(d, exist_ok=True)
        stamp = time.strftime("%H%M", time.localtime(self.w.now)); tag = who.replace(" ", "")
        q = os.path.join(d, f"q-{tag}-{stamp}.txt")
        handoff = f"\nHANDOFF (read it first): {os.path.join(self.w.L, it['handoff'])}" if it.get("handoff") else ""
        with open(q, "w", encoding="utf-8") as f:
            f.write(f"{it['line']}\nBrief: {os.path.join(self.w.L, it['brief'])}{handoff}\n"
                    f"Pulled by ctl autopilot ({'FIX delta re-check' if rank_is_fix(it) else 'FULL review'}); the TOOK line is already written.\n")
        letter = "C" if who.startswith("lane") else who
        rc, last = self.sh(sys.executable, self.boot, letter, q, timeout=30)
        boot = last.split(" ")[0] if rc == 0 else ""
        if not os.path.isfile(boot): self.log(f"  FAIL make-reviewer-boot {letter}: rc={rc} {last[:120]}"); return
        override = None
        if who.startswith("lane"):
            n = a["lane"]; override = os.path.join(d, f"override-lane{n}-{stamp}.md")
            with open(override, "w", encoding="utf-8") as f:
                f.write(lane_reviewer_override(n, a["wt"], it))
        holder = f"reviewer {who}" if not who.startswith("lane") else f"{who} as reviewer"
        line = f"{self.w.hhmm} TOOK {it['time']} {it['branch']} {it['sha'][:8]} ({holder}, autopilot, {'delta' if rank_is_fix(it) else 'FULL'})"
        qp = os.path.join(self.w.R, "QUEUE-review.md")
        why = self.append_locked(qp, line, lambda text: any(x["branch"] == it["branch"] and x["sha"] == it["sha"] for x in open_items(*parse_review_queue(text)[:3])))
        if why: self.log(f"  NOT TAKEN {it['branch']}: {why}"); return
        self.restart(a["window"], a["wt"], boot, "opus", "high", override)
        self.ledger(a["window"], "REVIEW", it["branch"], f"{holder} {it['sha'][:8]} {os.path.basename(boot)}")

    def do_start(self, a):
        row = a["row"]; base = RELEASE[a["pool"]]
        argv = [sys.executable, os.path.join(CTL_DIR, "make-lane-ptr.py"), row["plan"], row["task"], row["rung"], "--lane", str(a["lane"]),
                "--branch", row["branch"], "--base", base, "--id", row["id"], "--queue", ORDER[a["pool"]], "--pool", a["pool"],
                "--needs", ",".join(row["needs"]) or "-", "--repo", self.repo, "--lanes-dir", self.w.L, "--worktree", a["wt"]]
        if a["stack"]: argv += ["--stacked-on", f"{a['stack'][0]}@{a['stack'][1]}"]
        rc, last = self.sh(*argv, timeout=30)
        ptr = last.split(" ")[0] if rc == 0 else ""
        if not os.path.isfile(ptr): self.log(f"  FAIL make-lane-ptr: rc={rc} {last[:160]}"); return
        model, effort = LAUNCH[a["rung"]]
        self.ledger(a["lane"], "START", row["branch"], f"{row['id']} RUNG {a['rung']} {os.path.basename(ptr)}")
        self.restart(a["lane"], a["wt"], ptr, model, effort)

    def do_fix(self, a):
        fx = a["fix"]; qp = os.path.join(self.w.R, "QUEUE-autopilot.md")
        line = f"{self.w.hhmm} TOOK {fx['time']} {fx['branch']} (autopilot: lane {a['lane']}, {fx['ptr']}, RUNG {a['rung']})"
        why = self.append_locked(qp, line, lambda text: any(x["time"] == fx["time"] and x["branch"] == fx["branch"] for x in parse_fix_queue(text)))
        if why: self.log(f"  NOT TAKEN FIX {fx['branch']}: {why}"); return
        model, effort = LAUNCH[a["rung"]]
        self.ledger(a["lane"], "FIX", fx["branch"], f"{fx['ptr']} RUNG {a['rung']}")
        self.restart(a["lane"], a["wt"], os.path.join(self.w.L, fx["ptr"]), model, effort)

    def do_prune(self, a):
        rc, last = self.sh(self.ctl, "prune-gate-locks", "--apply", timeout=120)
        self.log(f"  prune: rc={rc} {last[:160]}")


def rank_is_fix(it):
    return bool(re.search(r"\bFIX\b", it["rest"]) or "fix" in it["brief"].lower())


def lane_reviewer_override(n, wt, it):
    return (f"OVERRIDE (ctl autopilot, fluid rule B: your pool has no startable task): you are NOT reviewer C. You are exec lane {n} acting as a "
            f"REVIEWER for this one item (window {n}, Opus/high). Your worktree is {wt}, ONLY it: detach it at the reviewed sha first "
            f"(`git fetch && git switch --detach {it['sha']}`); never gisik-nokma-review3, gisik-nokma-ctl or the primary. Every 'reviewer C' in the "
            f"boot above reads 'lane {n} as reviewer': your DONE line in roles/QUEUE-review.md is `HH:MM DONE {it['time']} <verdict> {it['branch']} "
            f"{it['sha'][:8]} (lane {n} as reviewer; <review file>)`. Independence: never your own task, a branch stacked on it, or one it stacks on "
            f"(the autopilot checked; STOP and say so if you find otherwise). After the verdict print `CHECKPOINT reviewer idle after {it['branch']} "
            f"{it['sha'][:8]}` and STOP: do not pull another item and write no PULL file; ctl autopilot gives this lane its next task.\n")


def describe(a):
    d = a["do"]
    if d == "pull": return f"pull: restart reviewer {a['who']} gisik:{a['window']} on {os.path.basename(a['boot'])} (opus/high), remove PULL-{a['who']}.boot"
    if d == "drop-pull": return f"drop PULL-{a['who']}.boot: {a['why']}"
    if d == "review":
        it = a["item"]
        return f"review: {a['who']} gisik:{a['window']} takes {it['time']} {it['branch']} {it['sha'][:8]} ({'FIX re-check' if rank_is_fix(it) else 'FULL'}), TOOK + boot + restart opus/high"
    if d == "start":
        r = a["row"]; m, e = LAUNCH[a["rung"]]
        st = f" STACKED on {a['stack'][0]}@{a['stack'][1][:8]}" if a["stack"] else ""
        return f"start: lane {a['lane']} takes {a['pool']} {r['id']} {r['branch']} (plan task {r['task']}, RUNG {a['rung']} = table {r['rung']} + 1){st}: make-lane-ptr + restart --model {m} --effort {e}"
    if d == "fix":
        m, e = LAUNCH[a["rung"]]
        return f"fix: lane {a['lane']} takes FIX {a['fix']['time']} {a['fix']['branch']} ({a['fix']['ptr']}, RUNG {a['rung']}): TOOK + restart --model {m} --effort {e}"
    if d == "prune": return "prune: ctl prune-gate-locks --apply"
    return d


# ---------------------------------------------------------------- the test-slot watch (read-only)
def slot_watch(now, log):
    """WARN hold >10 min with waiters: a `ctl run-tests` slot held longer than SLOT_HOLD_WARN_S while at least one other run-tests
    waits (P10: one mutation driver held the only slot 51 min). Holders are CTL_SEM_DIR/slot-<n>/holder (`pid|lstart|label|epoch`);
    a waiter is a running verbs/run-tests.sh that is no holder and no subshell of one (a fork keeps its parent's argv). Logs only."""
    sem = os.environ.get("CTL_SEM_DIR") or os.path.expanduser("~/.cache/gisik-ctl/sem")
    holds = []
    try:
        for e in sorted(os.listdir(sem)):
            f = os.path.join(sem, e, "holder")
            if e.startswith("slot-") and os.path.isfile(f):
                pid, _, label, epoch = (read(f).strip().split("|") + ["", "", "", ""])[:4]
                if pid.isdigit() and epoch.isdigit(): holds.append((e, int(pid), label, now - int(epoch)))
    except OSError:
        return
    if not holds: return
    cmd = os.environ.get("CTL_AUTOPILOT_PS_CMD") or "ps -axo pid=,ppid=,command="
    procs = []
    for line in subprocess.run(["sh", "-c", cmd], capture_output=True, text=True).stdout.split("\n"):
        f = line.split(None, 2)
        if len(f) == 3 and f[0].isdigit() and f[1].isdigit() and "verbs/run-tests.sh" in f[2]: procs.append((int(f[0]), int(f[1])))
    runners = {p for p, _ in procs}; holders = {h[1] for h in holds}
    waiters = [p for p, pp in procs if p not in holders and pp not in runners]
    for slot, pid, label, held in holds:
        if held > SLOT_HOLD_WARN_S and waiters:
            log(f"WARN hold >10 min with waiters: {slot} '{label}' (pid {pid}) held {held // 60} min while {len(waiters)} run(s) wait — split it per run (STEPS-common: a mutation driver takes the slot PER MUTANT)")


# ---------------------------------------------------------------- the pass and the loop
def seats_now():
    cmd = os.environ.get("CTL_AUTOPILOT_SEATS_CMD") or f"bash {os.path.join(CTL_DIR, 'ctl')} seats --json"
    p = subprocess.run(["sh", "-c", cmd], capture_output=True, text=True, timeout=60)
    return [json.loads(l) for l in p.stdout.split("\n") if l.startswith("{")]


def one_pass(lanes_dir, repo, shadow, fetch, logf):
    now = env_now()
    stamp = time.strftime("%H:%M:%S", time.localtime(now))
    tag = "SHADOW " if shadow else ""
    def log(msg):
        line = f"{stamp} {tag}{msg}"; print(line, flush=True)
        if logf:
            with open(logf, "a", encoding="utf-8") as f: f.write(line + "\n")
    if fetch: subprocess.run(["/usr/bin/git", "-C", repo, "fetch", "-q", "origin"], capture_output=True, timeout=120)
    try:
        seats = seats_now()
    except (subprocess.SubprocessError, ValueError) as e:
        log(f"FAIL seats unreadable: {e}"); return 1
    if not seats: log("FAIL seats: no seat read (no gisik session?) — nothing decided"); return 1
    w = World(lanes_dir, repo, seats, now)
    slot_watch(now, log)
    acts = decide(w, log)
    last_prune = max((r["t"] for r in w.ledger if r["kind"] == "PRUNE"), default=0)
    door = Door(w, shadow, log, repo)
    for a in acts: door.act(a)
    if now - last_prune >= PRUNE_EVERY_S and not shadow:
        door.act({"do": "prune"}); door.ledger("-", "PRUNE", "-", "hourly")
    log(f"OK autopilot pass: {len(acts)} action(s){' (shadow: none taken)' if shadow else ''}")
    return 0


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("mode", choices=["once", "run"]); ap.add_argument("--shadow", action="store_true")
    ap.add_argument("--no-fetch", action="store_true"); ap.add_argument("--interval", type=int, default=60)
    a = ap.parse_args(argv)
    lanes_dir = os.environ.get("CTL_LANES_DIR") or "/Users/kiro/my_projects/gisik-nokma-lanes"
    repo = os.environ.get("CTL_AUTOPILOT_REPO") or os.environ.get("GISIK_PRIMARY") or "/Users/kiro/my_projects/gisik-nokma"
    logdir = os.environ.get("CTL_LOG_DIR") or os.path.expanduser("~/.cache/gisik-ctl"); os.makedirs(logdir, exist_ok=True)
    logf = os.path.join(logdir, f"autopilot-{'shadow' if a.shadow else 'live'}-{time.strftime('%Y%m%d')}.log")
    if a.mode == "once": return one_pass(lanes_dir, repo, a.shadow, not a.no_fetch, logf)
    lock = os.path.join(logdir, "autopilot.lock.d")
    try:
        os.mkdir(lock)
    except FileExistsError:
        pid = read(os.path.join(lock, "pid")).strip()
        if pid.isdigit() and subprocess.run(["kill", "-0", pid], capture_output=True).returncode == 0:
            print(f"FAIL autopilot another loop runs (pid {pid}, {lock})"); return 1
        print(f"WARN autopilot stale lock of dead pid {pid or '?'} taken over", flush=True)
    with open(os.path.join(lock, "pid"), "w") as f: f.write(str(os.getpid()))
    try:
        while True:
            try: one_pass(lanes_dir, repo, a.shadow, not a.no_fetch, logf)
            except Exception as e: print(f"FAIL autopilot pass raised {type(e).__name__}: {e}")
            time.sleep(a.interval)
    finally:
        try:
            os.remove(os.path.join(lock, "pid")); os.rmdir(lock)
        except OSError:
            pass


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
