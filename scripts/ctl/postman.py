#!/usr/bin/env python3
"""scripts/ctl/postman.py — the postman behind `ctl post | inbox | ack | postman` (design: docs/superpowers/specs/2026-10-03-ctl-postman-design.md).

LEDGER.jsonl is the source of truth (append-only, one object per message). Everything else is derived or private state:
postman/inbox/<seat>.jsonl (delivered lines), postman/acks/<id> (one file per ack, created exclusively), postman/state/<id>.json.
Contract (scripts/ctl/lib.sh): one summary line last, `OK <verb> …` / `FAIL <verb> …`, exit 0 only when every condition held.
"""
import calendar, datetime, hashlib, json, os, re, signal, subprocess, sys, tempfile, time

DEFAULT_ROOT = "/Users/kiro/my_projects/gisik-nokma-lanes/roles"
ROOT = os.environ.get("CTL_POSTMAN_ROOT") or DEFAULT_ROOT
PM = os.path.join(ROOT, "postman")
SESSION = os.environ.get("CTL_TMUX_SESSION") or "gisik"
LOGDIR = os.environ.get("CTL_LOG_DIR") or os.path.expanduser("~/.cache/gisik-ctl")
NOTES = os.environ.get("CTL_POSTMAN_NOTES") or os.path.join(os.path.dirname(ROOT.rstrip("/")), "CTL-TO-PLANNER-notes.md")
HERE = os.path.dirname(os.path.abspath(__file__))
CTL = os.path.join(HERE, "ctl")
LIB = os.path.join(HERE, "lib.sh")

KINDS = ("next", "fix", "mergetip", "question", "note", "page", "bounce")
GATED = ("next", "fix", "mergetip", "question", "page", "bounce")   # one open message per seat, pane tier
NO_PAGE = ("page", "bounce")                                         # these ARE the paging; they never page
SEAT_RE = re.compile(r"^(main|planner|dispatcher|exec[0-9]+|reviewer[A-Z]|postman|queue)$")
ALIASES = {"orch": "main", "orchestrator": "main"}
INLINE_MAX = 280
GRACE_WATCHED = 120          # watched + idle seat: wait this long for the watcher's ack before a pane paste
HB_FRESH = 10                # heartbeat younger than this = a watcher is live
PROVEN_WAIT = int(os.environ.get("CTL_POSTMAN_PROVEN_WAIT", "900"))
BACKOFF = [int(x) for x in os.environ.get("CTL_POSTMAN_BACKOFF", "180,600,1200").split(",")]
PAGE_TRIES = int(os.environ.get("CTL_POSTMAN_PAGE_TRIES", "4"))
PAGE_AGE = int(os.environ.get("CTL_POSTMAN_PAGE_AGE", "1800"))
CM_CANCEL = int(os.environ.get("CTL_POSTMAN_CM_CANCEL", "180"))
AUDIT_GRACE = int(os.environ.get("CTL_POSTMAN_AUDIT_GRACE", "600"))
UNREACH = {"no-window": 120, "not-claude": 120, "menu": 300, "text": 300, "copy-mode": 300}


SHADOW = False        # `ctl postman run|once --shadow`: compute every delivery, write ONLY the shadow log (+ the private cursors/state); see shadow_* below


def pane_on(): return not SHADOW and os.environ.get("CTL_POSTMAN_PANE", "1") != "0"      # CTL_POSTMAN_PANE=0: inbox + bridge + audit only (the older partial shadow)


def now():
    v = os.environ.get("CTL_POSTMAN_NOW")
    return float(v) if v else time.time()


def iso(t): return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))
def epoch(s): return calendar.timegm(time.strptime(s, "%Y-%m-%dT%H:%M:%SZ"))
def hhmm(t): return time.strftime("%H:%M", time.localtime(t))


def ok(verb, msg): print("OK %s %s" % (verb, msg)); sys.exit(0)
def fail(verb, msg): print("FAIL %s %s" % (verb, msg)); sys.exit(1)


def sh(cmd, *args, timeout=90):
    p = subprocess.run(["bash", "-c", '. "%s"; %s "$@"' % (LIB, cmd), "_", *args], capture_output=True, text=True, timeout=timeout)
    return p.stdout.strip()


def tmux(*args):
    p = subprocess.run(["tmux", *args], capture_output=True, text=True)
    return p.returncode, p.stdout


def windows():
    rc, out = tmux("list-windows", "-t", SESSION, "-F", "#{window_id}\t#{window_name}\t#{window_index}")
    if rc != 0: return []
    return [tuple(l.split("\t")) for l in out.splitlines() if l.count("\t") == 2]


def window_id(seat):                      # EXACT name match: tmux's own -t resolution matches prefixes (exec1 → exec11)
    for wid, name, _ in windows():
        if name == seat: return wid
    return None


def my_seat():
    pane = os.environ.get("TMUX_PANE")
    if not pane: return None
    rc, out = tmux("display-message", "-p", "-t", pane, "#{window_name}")
    return out.strip() or None if rc == 0 else None


# ───────────────────────────── files ─────────────────────────────
def p(*parts): return os.path.join(PM, *parts)
def ledger_path(): return os.path.join(ROOT, "LEDGER.jsonl")


def load_ledger():
    out = []
    try:
        with open(ledger_path()) as f:
            for line in f:
                line = line.strip()
                if line:
                    try: out.append(json.loads(line))
                    except ValueError: pass
    except FileNotFoundError: pass
    return out


def acked_ids():
    try: return {int(x) for x in os.listdir(p("acks")) if x.isdigit()}
    except FileNotFoundError: return set()


def read_state(i):
    try:
        with open(p("state", "%d.json" % i)) as f: return json.load(f)
    except (FileNotFoundError, ValueError): return {}


def write_state(i, st):
    os.makedirs(p("state"), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=p("state"), prefix=".%d." % i)
    with os.fdopen(fd, "w") as f: json.dump(st, f)
    os.replace(tmp, p("state", "%d.json" % i))


def lock_acquire():
    os.makedirs(PM, exist_ok=True)
    d = p("lock")
    for _ in range(200):
        try:
            os.mkdir(d); open(os.path.join(d, "pid"), "w").write(str(os.getpid())); return d
        except FileExistsError:
            try:
                pid = int(open(os.path.join(d, "pid")).read().strip() or 0)
                if pid and not alive(pid): os.remove(os.path.join(d, "pid")); os.rmdir(d); continue
            except (FileNotFoundError, ValueError):
                # the holder has made the directory but not yet written its pid: only a lock dir that stays pid-less is stale
                try:
                    if time.time() - os.path.getmtime(d) > 5: os.rmdir(d)
                except OSError: pass
            time.sleep(0.05)
    raise RuntimeError("could not take the ledger lock")


def lock_release(d):
    try: os.remove(os.path.join(d, "pid")); os.rmdir(d)
    except OSError: pass


def alive(pid):
    try: os.kill(pid, 0); return True
    except ProcessLookupError: return False
    except PermissionError: return True


# ───────────────────────────── the shadow log ─────────────────────────────
# `--shadow` writes NOTHING a seat can see: no ledger line, no inbox line, no notes line, no pane paste, no DONE write-back, no page. It appends
# one JSON object per computed delivery to postman/shadow.jsonl and `ctl postman audit --since|--window|--parity` compares that with
# DISPATCH-log.md and the ledger. Records: origin "queue" (a QUEUE-dispatch line: verb, win, line_time, src, refused, ref = its branch, brief = a
# NEXT/FIX line's brief token as written — the two names a BY-ORCH log line can agree with), "ledger" (a message a seat
# posted with ctl post: id, channel flag|inbox|pane, would), "msg" (a message the run would have appended: notes, audit notes), "baseline".
def shadow_path(): return p("shadow.jsonl")


def load_shadow():
    out = []
    try:
        with open(shadow_path()) as f:
            for line in f:
                try: out.append(json.loads(line))
                except ValueError: pass
    except FileNotFoundError: pass
    return out


def shadow_add(rec):
    os.makedirs(PM, exist_ok=True)
    rec = dict(rec, ts=iso(now()), epoch=now())
    fd = os.open(shadow_path(), os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o644)
    try: os.write(fd, (json.dumps(rec, ensure_ascii=False) + "\n").encode())
    finally: os.close(fd)


# ───────────────────────────── messages ─────────────────────────────
def norm_seat(s):
    s = ALIASES.get(s, s)
    return s if SEAT_RE.match(s or "") else None


def append_message(frm, to, kind, body=None, text=None, reply_to=None, src=None, ref=None):
    """Allocate the id under the lock and append ONE ledger line. Returns the message dict. Under --shadow nothing is appended: the message
    is logged to the shadow log (origin msg, a shadow id `sid` in its own numbering) and returned with that id."""
    if SHADOW:
        sid = len(load_shadow()) + 1
        txt = text if text is not None else "see %s" % body
        m = {"id": sid, "ts": iso(now()), "from": frm, "to": to, "kind": kind, "body": None, "text": txt, "reply_to": reply_to, "src": src, "ref": ref}
        shadow_add({"origin": "msg", "sid": sid, "from": frm, "to": to, "kind": kind, "src": src, "ref": ref, "text": txt[:300]})
        return m
    lk = lock_acquire()
    try:
        last = max([m["id"] for m in load_ledger()] or [0])
        i = last + 1
        if text is not None:
            os.makedirs(p("spool"), exist_ok=True)
            body = p("spool", "%d.txt" % i)
            with open(body, "w") as f: f.write(text)
        data = open(body, "rb").read()
        m = {"id": i, "ts": iso(now()), "from": frm, "to": to, "kind": kind, "body": body,
             "body_sha": hashlib.sha256(data).hexdigest(), "body_bytes": len(data),
             "reply_to": reply_to, "src": src, "ref": ref}
        fd = os.open(ledger_path(), os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o644)
        try: os.write(fd, (json.dumps(m, ensure_ascii=False) + "\n").encode())
        finally: os.close(fd)
        return m
    finally:
        lock_release(lk)


def pointer(m):
    ctl_ack = "bash %s ack %d" % (CTL, m["id"])
    pre = "[postman #%d %s ← %s] " % (m["id"], m["kind"], m["from"])
    inline = None
    if m["body"].startswith(p("spool") + os.sep):
        try:
            t = open(m["body"]).read().strip()
            if "\n" not in t and len(t) <= INLINE_MAX: inline = t
        except FileNotFoundError: pass
    if inline is not None:
        return "%s%s In the SAME tool-call block as your first action run: %s" % (pre, inline, ctl_ack)
    changed = ""
    try:
        if hashlib.sha256(open(m["body"], "rb").read()).hexdigest() != m["body_sha"]: changed = " (body changed since post)"
    except FileNotFoundError: pass
    return "%sRead the WHOLE file %s with the Read tool and execute it.%s In the SAME tool-call block as your first Read run: %s" % (pre, m["body"], changed, ctl_ack)


# ───────────────────────────── verbs: post / ack / inbox ─────────────────────────────
def parse_flags(args, valued, bools):
    pos, opts, i = [], {}, 0
    while i < len(args):
        a = args[i]
        if a in valued:
            if i + 1 >= len(args): raise ValueError("%s needs a value" % a)
            opts[a] = args[i + 1]; i += 2
        elif a in bools: opts[a] = True; i += 1
        elif a.startswith("--"): raise ValueError("unknown flag %s" % a)
        else: pos.append(a); i += 1
    return pos, opts


def cmd_post(args):
    try: pos, o = parse_flags(args, ("--kind", "--body", "--text", "--from", "--reply-to", "--ref", "--repo"), ("--dry-run",))
    except ValueError as e: fail("post", str(e))
    if len(pos) != 1: fail("post", "usage: ctl post <to> --kind K (--body FILE | --text STR) [--from SEAT] [--reply-to ID] [--ref R] [--dry-run]")
    to = pos[0]
    if re.fullmatch(r"[0-9]+", to):
        names = [n for _, n, ix in windows() if ix == to]
        if not names: fail("post", "no window %s in session %s" % (to, SESSION))
        to = names[0]
    to = norm_seat(to)
    if not to or to in ("postman", "queue"): fail("post", "bad seat name '%s' (main|planner|dispatcher|exec<N>|reviewer<X>)" % pos[0])
    kind = o.get("--kind")
    if kind not in KINDS: fail("post", "--kind must be one of %s" % " ".join(KINDS))
    frm = norm_seat(o["--from"]) if "--from" in o else norm_seat(my_seat() or "")
    if not frm: fail("post", "no valid sender: pass --from SEAT (not in a tmux pane, or the window name is not a seat)")
    if ("--body" in o) == ("--text" in o): fail("post", "give exactly one of --body FILE or --text STR")
    body = text = None
    if "--body" in o:
        body = os.path.abspath(o["--body"])
        if not os.path.isfile(body): fail("post", "body file %s does not exist" % body)
    else:
        text = o["--text"]
        if not text.strip(): fail("post", "--text is empty")
    reply_to = None
    if "--reply-to" in o:
        if not o["--reply-to"].isdigit() or not any(m["id"] == int(o["--reply-to"]) for m in load_ledger()): fail("post", "--reply-to %s is not a ledger id" % o["--reply-to"])
        reply_to = int(o["--reply-to"])
    if "--dry-run" in o:
        print("DRY: append %s → %s (%s) body=%s" % (frm, to, kind, body or "spool"))
        ok("post", "dry-run")
    m = append_message(frm, to, kind, body=body, text=text, reply_to=reply_to, ref=o.get("--ref"))
    if reply_to is not None:
        orig = next((x for x in load_ledger() if x["id"] == reply_to), None)
        if orig and orig["to"] == frm: ack_create(reply_to, frm, "replied with #%d" % m["id"])
    no_win = "" if window_id(to) else " (no window now)"
    ok("post", "#%d → %s (%s)%s" % (m["id"], to, kind, no_win))


def ack_create(i, seat, note="", cancelled=False):
    os.makedirs(p("acks"), exist_ok=True)
    line = "%s %s%s%s\n" % (iso(now()), seat, " cancelled" if cancelled else "", (" " + note) if note else "")
    try:
        fd = os.open(p("acks", str(i)), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
    except FileExistsError:
        return False
    with os.fdopen(fd, "w") as f: f.write(line)
    return True


def cmd_ack(args):
    try: pos, o = parse_flags(args, ("--seat", "--note", "--repo"), ("--cancel", "--dry-run"))
    except ValueError as e: fail("ack", str(e))
    if len(pos) != 1 or not pos[0].lstrip("#").isdigit(): fail("ack", "usage: ctl ack <id> [--seat S] [--cancel] [--note T]")
    i = int(pos[0].lstrip("#"))
    m = next((x for x in load_ledger() if x["id"] == i), None)
    if not m: fail("ack", "#%d is not in the ledger" % i)
    seat = norm_seat(o["--seat"]) if "--seat" in o else norm_seat(my_seat() or "")
    cancel = "--cancel" in o
    if not cancel and seat != m["to"]:
        fail("ack", "#%d is addressed to %s, not %s (pass --seat %s to act as it)" % (i, m["to"], seat or "an unknown seat", m["to"]))
    if "--dry-run" in o: print("DRY: ack #%d as %s" % (i, seat)); ok("ack", "dry-run")
    if ack_create(i, seat or "unknown", o.get("--note", ""), cancelled=cancel): ok("ack", "#%d acked by %s%s" % (i, seat, " (cancelled)" if cancel else ""))
    first = open(p("acks", str(i))).readline().strip()
    ok("ack", "#%d already acked: %s" % (i, first))


def cmd_inbox(args):
    try: pos, o = parse_flags(args, ("--seat", "--repo"), ("--all", "--watch", "--dry-run"))
    except ValueError as e: fail("inbox", str(e))
    seat = norm_seat(o["--seat"]) if "--seat" in o else norm_seat(my_seat() or "")
    if not seat: fail("inbox", "no seat: pass --seat SEAT")
    if "--watch" in o: return watch(seat, "--seat" in o)
    acked = acked_ids(); n = 0
    for m in load_ledger():
        if m["to"] != seat: continue
        done = m["id"] in acked
        if done and "--all" not in o: continue
        n += 1
        print("#%d %s ← %s %s%s" % (m["id"], m["kind"], m["from"], m["body"], " [acked]" if done else ""))
    ok("inbox", "%d %s for %s" % (n, "messages" if "--all" in o else "open", seat))


def watch(seat, explicit):
    """The ONE inbox watcher per seat: at-least-once (cursor advances only AFTER the emit); a missing cursor starts at 0."""
    if not explicit:
        os.execv(sys.executable, [sys.executable, os.path.abspath(__file__), "inbox", "--watch", "--seat", seat])
    os.makedirs(LOGDIR, exist_ok=True)
    pidf, hbf = (os.path.join(LOGDIR, "inbox-watch-%s.%s" % (seat, e)) for e in ("pid", "hb"))
    cur = os.path.join(LOGDIR, "cursor-%s-inbox" % seat)
    try:
        old = int(open(pidf).read().strip())
        if old != os.getpid() and alive(old):
            args = subprocess.run(["ps", "-o", "args=", "-p", str(old)], capture_output=True, text=True).stdout
            if "inbox --watch" in args and ("--seat %s" % seat) in args:
                os.kill(old, signal.SIGTERM); time.sleep(0.2)
    except (FileNotFoundError, ValueError): pass
    open(pidf, "w").write(str(os.getpid()))
    inbox = p("inbox", "%s.jsonl" % seat)
    seen = set()
    once_only = bool(os.environ.get("CTL_WATCH_ONCE"))
    while True:
        open(hbf, "a").close(); os.utime(hbf, None)
        try: off = int(open(cur).read().strip() or 0)
        except (FileNotFoundError, ValueError): off = 0
        size = os.path.getsize(inbox) if os.path.exists(inbox) else 0
        if off > size: off = 0
        if off > 0:                                   # a cursor that is not on a line boundary points into a rewritten file
            with open(inbox, "rb") as f:
                f.seek(off - 1)
                if f.read(1) != b"\n": off = 0
        if size > off:
            with open(inbox, "rb") as f:
                f.seek(off); chunk = f.read()
            lines, pos = [], off
            for raw in chunk.splitlines(keepends=True):
                if not raw.endswith(b"\n"): break
                pos += len(raw); lines.append((raw, pos))
            if os.environ.get("CTL_TEST_DIE_AFTER_READ") and lines: os._exit(0)
            acked = acked_ids()
            for raw, end in lines:
                try: m = json.loads(raw)
                except ValueError: m = None
                if m and m["id"] not in acked and m["id"] not in seen:
                    print(pointer(m), flush=True); seen.add(m["id"])
                tmp = cur + ".tmp"; open(tmp, "w").write(str(end)); os.replace(tmp, cur)
        if once_only: break
        time.sleep(2)
    try:
        if open(pidf).read().strip() == str(os.getpid()): os.remove(pidf)
    except OSError: pass
    sys.exit(0)


# ───────────────────────────── the daemon pass ─────────────────────────────
def guard():
    live_session = SESSION == "gisik"
    live_root = os.path.realpath(ROOT) == os.path.realpath(DEFAULT_ROOT)
    if live_session != live_root:
        fail("postman", "refusing: tmux session '%s' with ledger root %s mixes live and scratch (a test must never deliver to a live seat)" % (SESSION, ROOT))


def notes_line(text):
    with open(NOTES, "a") as f: f.write("%s ⚑ POSTMAN → PLANNER: %s\n" % (hhmm(now()), text))


def flag_planner(m, st):
    """A message to the planner is never a pane paste (design choice 2): its delivery IS a ⚑ line in the owner-visible notes file.
    Once per message (state.flagged); the line is written BEFORE the state, so a crash between the two repeats the line, never loses it."""
    if st.get("flagged"): return
    notes_line(planner_text(m))
    st["flagged"] = now(); write_state(m["id"], st)


def planner_text(m):
    try: t = " ".join(open(m["body"]).read().split()) if m["body"].startswith(p("spool") + os.sep) else "see %s" % m["body"]
    except OSError: t = "see %s" % m["body"]
    return ("#%d %s ← %s: %s" % (m["id"], m["kind"], m["from"], t))[:340]


def page(m, reason):
    if m["kind"] in NO_PAGE: return
    st = read_state(m["id"])
    if st.get("paged"): return
    st["paged"] = now(); write_state(m["id"], st)
    text = "#%d %s → %s unacked: %s. See: ctl postman status" % (m["id"], m["kind"], m["to"], reason)
    if m["to"] not in ("main", "planner"): append_message("postman", "main", "page", text=text)
    elif m["to"] == "main": append_message("postman", "planner", "page", text=text)     # flagged into the notes by flag_planner when delivered
    else: notes_line(text)                                                               # a reminder: the message itself was flagged on delivery


def bounce(m, stats):
    st = read_state(m["id"]); st["bounced"] = now(); write_state(m["id"], st)
    target = m["from"] if m["from"] not in ("postman", "queue") and norm_seat(m["from"]) else "main"
    append_message("postman", target, "bounce", text="#%d to %s bounced: body file missing: %s" % (m["id"], m["to"], m["body"]))
    stats["bounced"] += 1


def to_inbox(m, st, stats):
    if not os.path.isfile(m["body"]): bounce(m, stats); return False
    os.makedirs(p("inbox"), exist_ok=True)
    fd = os.open(p("inbox", "%s.jsonl" % m["to"]), os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o644)
    try: os.write(fd, (json.dumps(m, ensure_ascii=False) + "\n").encode())
    finally: os.close(fd)
    st.update(inboxed_ts=now(), tries=0, defers=0); write_state(m["id"], st); stats["inboxed"] += 1
    return True


def watched(seat):
    try: return now() - os.path.getmtime(os.path.join(LOGDIR, "inbox-watch-%s.hb" % seat)) < HB_FRESH
    except OSError: return False


def due(st):
    if st.get("last_try") is None: return True
    wait = PROVEN_WAIT if st.get("proven") else BACKOFF[min(max(st.get("tries", 1), 1) - 1, len(BACKOFF) - 1)]
    return now() - st["last_try"] >= wait


def pane_tier(m, st, stats):
    seat, t = m["to"], now()
    wid = window_id(seat)
    def defer(reason):
        st["last"] = reason; st["defers"] = st.get("defers", 0) + 1
        st.setdefault("unreach_since", t); write_state(m["id"], st); stats["deferred"] += 1
        lim = UNREACH.get(reason)
        if lim and t - st["unreach_since"] >= lim: page(m, "unreachable (%s) for %d s" % (reason, t - st["unreach_since"]))
    if wid is None: return defer("no-window")
    state = sh("ctl_pane_state", wid)
    if os.environ.get("CTL_TEST_ACK_BEFORE_PASTE"): ack_create(m["id"], seat, "test hook: acked between pane_state and the paste")
    w = watched(seat)
    if w:
        if state == "busy": st["last"] = "busy-watched"; write_state(m["id"], st); return
        if state in ("ok", "ours") and t - st["inboxed_ts"] < GRACE_WATCHED: st["last"] = "grace"; write_state(m["id"], st); return
    if not due(st): return
    if state == "copy-mode":
        st.setdefault("cm_since", t)
        if t - st["cm_since"] < CM_CANCEL: return defer("copy-mode")
        tmux("send-keys", "-t", wid, "-X", "cancel"); st.pop("cm_since", None); state = sh("ctl_pane_state", wid)
    else: st.pop("cm_since", None)
    if state not in ("ok", "busy", "ours"): return defer(state or "no-window")
    if os.path.exists(p("acks", str(m["id"]))): return        # acked while pane_state ran (the seat's own ack, or a cancel): never type a second pointer
    st["tries"] = st.get("tries", 0) + 1; st["last_try"] = t; st["attempt_pending"] = t; write_state(m["id"], st)
    if os.environ.get("CTL_TEST_CRASH_AFTER_ATTEMPT"): os._exit(137)
    if state == "ours": res = sh("ctl_pane_submit_pending", wid) or "unsubmitted"
    else: res = sh("ctl_pane_deliver_line", wid, pointer(m)) or "failed"
    st.pop("attempt_pending", None); st.pop("unreach_since", None)
    st["last"] = "sent:" + res; st["proven"] = res in ("echoed", "queued"); write_state(m["id"], st); stats["pasted"] += 1


def deliver(stats):
    ledger, acked = load_ledger(), acked_ids()
    by_seat = {}
    for m in ledger:
        if m["id"] in acked or read_state(m["id"]).get("bounced"): continue
        by_seat.setdefault(m["to"], []).append(m)
    for seat, msgs in sorted(by_seat.items()):
        inbox_only = seat == "planner"
        gated = [] if inbox_only else [m for m in msgs if m["kind"] in GATED]
        for m in msgs:
            if m in gated: continue
            st = read_state(m["id"])
            if not st.get("inboxed_ts") and not to_inbox(m, st, stats): continue
            if inbox_only: flag_planner(m, st)
            if inbox_only and m["kind"] not in NO_PAGE and now() - st.get("inboxed_ts", now()) >= PAGE_AGE:
                page(m, "planner has not acked in %d min" % ((now() - st["inboxed_ts"]) // 60))
        for m in gated:                                    # head of the queue only
            st = read_state(m["id"])
            if not st.get("inboxed_ts") and not to_inbox(m, st, stats): continue   # bounced: the next one is the head
            if pane_on(): pane_tier(m, st, stats)
            st = read_state(m["id"])
            if st.get("tries", 0) >= PAGE_TRIES: page(m, "%d tries, last: %s" % (st["tries"], st.get("last")))
            elif now() - st.get("inboxed_ts", now()) >= PAGE_AGE: page(m, "open %d min, last: %s" % ((now() - st["inboxed_ts"]) // 60, st.get("last")))
            break


def deliver_shadow(stats):
    """--shadow: log, once per ledger message, what the real pass would do with it. Reads panes (pane_state is read-only), types nothing."""
    recs = load_shadow()
    base = next((r for r in recs if r.get("origin") == "baseline"), None)
    ledger = load_ledger()
    if base is None:
        base = {"origin": "baseline", "upto": max([m["id"] for m in ledger] or [0])}; shadow_add(base)     # history is never replayed
    seen = {r["id"] for r in recs if r.get("origin") == "ledger"}
    for m in ledger:
        if m["id"] <= base["upto"] or m["id"] in seen: continue
        if m["to"] == "planner": chan, would, state = "flag", "flag", None
        elif m["kind"] not in GATED: chan, would, state = "inbox", "inbox", None
        else:
            wid = window_id(m["to"]); state = sh("ctl_pane_state", wid) if wid else "no-window"
            chan, would = "pane", ("paste" if state in ("ok", "busy", "ours") else "defer:%s" % state)
        shadow_add({"origin": "ledger", "id": m["id"], "to": m["to"], "from": m["from"], "kind": m["kind"], "ref": m.get("ref"), "body": m["body"],
                    "channel": chan, "would": would, "pane_state": state, "text": pointer(m)[:340] if chan != "flag" else planner_text(m)})
        stats["shadowed"] += 1


def restarts(stats):
    d = p("restarts")
    if not os.path.isdir(d): return
    for seat in sorted(os.listdir(d)):
        try: marker = float(open(os.path.join(d, seat)).read().strip())
        except (OSError, ValueError): continue
        acked = acked_ids(); gone = []
        for m in load_ledger():
            if m["to"] == seat and m["id"] not in acked and epoch(m["ts"]) < marker and m["kind"] != "bounce":
                if ack_create(m["id"], "postman", "cancelled-by-restart", cancelled=True): gone.append("#%d %s" % (m["id"], m["kind"]))
        if gone:
            append_message("postman", "main", "note", text="%s restarted: cancelled its open messages %s — repost what is still wanted (restart first, then post)" % (seat, ", ".join(gone)))
            stats["cancelled"] += len(gone)
        os.remove(os.path.join(d, seat))


def resolve_brief(tok):
    for c in ([tok] if os.path.isabs(tok) else [os.path.join(os.path.dirname(ROOT.rstrip("/")), tok), os.path.join(ROOT, tok)]):
        if os.path.isfile(c): return c
    return None


BRANCH_RE = re.compile(r"task/[A-Za-z0-9._/-]+")


def queue_src(line):
    """A QUEUE-dispatch line's id: the bridge's dedupe key, its shadow record's `src`, and how the parity audit finds a record's OWN line."""
    return "queue-dispatch:" + hashlib.sha1(line.encode()).hexdigest()


def bridge(stats):
    q, cur = os.path.join(ROOT, "QUEUE-dispatch.md"), p("cursor-queue-dispatch")
    if not os.path.exists(q): return
    os.makedirs(PM, exist_ok=True)
    try: off = int(open(cur).read().strip())
    except (FileNotFoundError, ValueError):
        open(cur, "w").write(str(os.path.getsize(q))); return          # first run: the history is never reposted
    size = os.path.getsize(q)
    if off > size: off = 0
    with open(q, "rb") as f:
        f.seek(off); chunk = f.read()
    known = {m["src"] for m in load_ledger() if m.get("src")} | {r["src"] for r in load_shadow() if r.get("origin") == "queue" and r.get("src")}
    pos = off
    for raw in chunk.splitlines(keepends=True):
        if not raw.endswith(b"\n"): break
        pos += len(raw); line = raw.decode("utf-8", "replace").rstrip("\n")
        mt = re.match(r"^(\d\d:\d\d) (NEXT|FIX|MERGETIP|CLOSE)(?: (.*))?$", line)
        if mt:
            src = queue_src(line)
            if src not in known:
                known.add(src); handle_queue_line(line, mt.group(1), mt.group(2), (mt.group(3) or "").split(), src, stats)
        open(cur, "w").write(str(pos))


def handle_queue_line(line, lt, verb, toks, src, stats):
    """Planner ruling 2026-10-04 02:08: a new task, a FIX and a MERGETIP are the orchestrator's (`ctl restart` / `ctl tipmerge`), so the
    bridge pastes NOTHING into a lane: every queue line becomes ONE note to main (kind note, from queue; ref = the branch, so the audit can
    match a reviewer verdict to it). A line that does not parse is a note quoting it."""
    def refuse(why):
        m = append_message("postman", "main", "note", text="bridge could not route QUEUE-dispatch line (%s): %s" % (why, line), src=src)
        queue_done(lt, "postman refused #%d: %s" % (m["id"], why)); stats["refused"] += 1
        shadow_queue(lt, verb, toks, src, refused=why)
    win = toks[0] if toks else ""
    mm = re.fullmatch(r"(?:lane)?([0-9]{1,2})", win)
    if verb == "CLOSE" and mm:
        m = append_message("queue", "main", "note", text="CLOSE %s needs `ctl close %s` (a lane cannot close itself)" % (win, mm.group(1)), src=src)
        shadow_queue(lt, verb, toks, src, m=m)
        return queue_done(lt, "postman #%d (note to main)" % m["id"])
    if not mm: return refuse("target '%s' is not a lane number (N or laneN)" % win)
    if verb in ("NEXT", "FIX"):
        brief = resolve_brief(toks[1]) if len(toks) > 1 else None
        if not brief: return refuse("brief file '%s' not found" % (toks[1] if len(toks) > 1 else ""))
        rm = BRANCH_RE.search(" ".join(toks[2:])) or BRANCH_RE.search(open(brief, errors="replace").read(4096))
        ref = rm.group(0) if rm else None
        text = "%s %s %s needs ctl restart (a new task or a FIX is a fresh session; nothing was pasted into the lane)" % (verb, mm.group(1), brief)
    else:
        br = toks[1] if len(toks) > 1 else ""
        bm = next((re.fullmatch(r"base=(release/[A-Za-z0-9._/-]+)", t) for t in toks[2:] if re.fullmatch(r"base=release/[A-Za-z0-9._/-]+", t)), None)
        if not re.fullmatch(r"task/[A-Za-z0-9._/-]+", br) or not bm: return refuse("MERGETIP needs task/<branch> and base=release/<name>")
        ref = br
        text = "MERGETIP %s base=%s needs ctl tipmerge (lane %s; nothing was pasted into the lane)" % (br, bm.group(1), mm.group(1))
    m = append_message("queue", "main", "note", text=text, src=src, ref=ref)
    shadow_queue(lt, verb, toks, src, m=m)
    queue_done(lt, "postman #%d (note to main)" % m["id"]); stats["bridged"] += 1


def shadow_queue(lt, verb, toks, src, m=None, refused=None):
    """--shadow: the outcome of one QUEUE-dispatch line (what the dispatcher would have been compared against)."""
    if not SHADOW: return
    mm = re.fullmatch(r"(?:lane)?([0-9]{1,2})", toks[0]) if toks else None
    shadow_add({"origin": "queue", "verb": verb, "win": mm.group(1) if mm else (toks[0] if toks else ""), "line_time": lt, "src": src,
                "sid": m["id"] if m else None, "ref": m.get("ref") if m else None, "brief": toks[1] if verb in ("NEXT", "FIX") and len(toks) > 1 else None,
                "refused": refused, "to": "main"})


def queue_done(lt, result):
    if not pane_on(): return          # shadow run: a DONE line CLOSES the dispatcher's open line — the dispatcher must still deliver it
    with open(os.path.join(ROOT, "QUEUE-dispatch.md"), "a") as f: f.write("%s DONE %s %s\n" % (hhmm(now()), lt, result))


AUDIT_RE = re.compile(r"^\d\d:\d\d DONE \d\d:\d\d (FIX|needs-tip) (task/\S+) ([0-9a-f]{7,40})")


AUDIT_LEAD = 600     # a message may predate the verdict line's first sighting by this much (a scan that lagged), never more: an EARLIER round's message must not satisfy this verdict


def queue_note_verb(m):
    """The verb a bridged QUEUE-dispatch note carries (FIX / MERGETIP / NEXT / CLOSE → lower case), else None."""
    if m["from"] != "queue" or m["kind"] != "note": return None
    try: return open(m["body"]).read().split(" ", 1)[0].lower()
    except OSError: return None


def audit_matched(kind, branch, since, until=None):
    for m in load_ledger():
        if (m["kind"] == kind or queue_note_verb(m) == kind) and m.get("ref") == branch and epoch(m["ts"]) >= since and (until is None or epoch(m["ts"]) < until): return True
    return False


def verdict_times(lines):
    """Epoch of each QUEUE-review line (they carry HH:MM only). The date is rebuilt backwards from now: a line whose time is more
    than 12 h later than the following line's belongs to the previous day (a small out-of-order is not a midnight)."""
    out, day, prev = [None] * len(lines), datetime.date.fromtimestamp(now()), None
    for i in range(len(lines) - 1, -1, -1):
        mt = re.match(r"^(\d\d):(\d\d) ", lines[i])
        if not mt: continue
        h, mi = int(mt.group(1)), int(mt.group(2)); sod = h * 3600 + mi * 60
        at = lambda d: time.mktime(datetime.datetime(d.year, d.month, d.day, h, mi).timetuple())
        if (prev is None and at(day) > now()) or (prev is not None and sod - prev > 43200): day -= datetime.timedelta(days=1)
        out[i] = at(day); prev = sod
    return out


def verdict_key(line):
    mt = AUDIT_RE.match(line)
    return ("fix" if mt.group(1) == "FIX" else "mergetip", mt.group(2)) if mt else None


def audit_scan(stats):
    q, cur, d = os.path.join(ROOT, "QUEUE-review.md"), p("cursor-audit"), p("audit")
    os.makedirs(d, exist_ok=True)
    if os.path.exists(q):
        try: off = int(open(cur).read().strip())
        except (FileNotFoundError, ValueError): open(cur, "w").write(str(os.path.getsize(q))); off = None
        if off is not None:
            size = os.path.getsize(q)
            if off > size: off = 0
            with open(q, "rb") as f: f.seek(off); chunk = f.read()
            pos = off
            for raw in chunk.splitlines(keepends=True):
                if not raw.endswith(b"\n"): break
                pos += len(raw); line = raw.decode("utf-8", "replace").rstrip("\n"); mt = AUDIT_RE.match(line)
                if mt:
                    f_ = os.path.join(d, hashlib.sha1(line.encode()).hexdigest() + ".json")
                    if not os.path.exists(f_):
                        with open(f_, "w") as jf: json.dump({"kind": "fix" if mt.group(1) == "FIX" else "mergetip", "branch": mt.group(2), "sha": mt.group(3), "first_seen": now(), "line": line}, jf)
                open(cur, "w").write(str(pos))
    for fn in sorted(os.listdir(d)):
        f_ = os.path.join(d, fn)
        with open(f_) as jf: a = json.load(jf)
        if a.get("reported"): continue
        if audit_matched(a["kind"], a["branch"], a["first_seen"] - AUDIT_LEAD): os.remove(f_); continue
        if now() - a["first_seen"] >= AUDIT_GRACE:
            append_message("postman", "main", "note", text="audit: the verdict \"%s\" has no %s message for %s in the ledger after %d min (mechanism g) — post it: ctl post exec<N> --kind %s --body <brief> --ref %s" % (a["line"][:160], a["kind"], a["branch"], (now() - a["first_seen"]) // 60, a["kind"], a["branch"]))
            a["reported"] = now(); stats["audited"] += 1
            with open(f_, "w") as jf: json.dump(a, jf)


# ───────────────────────────── the shadow parity audit ─────────────────────────────
# `ctl postman audit --parity | --since T | --window N` compares the shadow log with the dispatcher's own record (DISPATCH-log.md, which also
# carries the orchestrator's acks), QUEUE-dispatch.md and the ledger. Buckets:
#   matched   (a) a delivery the dispatcher logged (verb, lane, ref words) paired one-to-one with a shadow queue record of that verb and lane
#             whose name its REF WORDS agree with — the same ref rule and the same ref_agrees as a BY-ORCH agreement (planner ruling 2026-10-04
#             17:54: REQUIRE, never prefer); among the agreeing records the earliest wins — or (b) a BY-ORCH AGREEMENT (below); either way the
#             record lies in the PAIRING WINDOW: no later than 2 min after the log line and no more than CTL_POSTMAN_AUDIT_TOL (45 min) before
#             it. Dispatcher pairs are made first; agreements take the records left over. Each MATCHED line prints its ref words and the name;
#   unpaired  a dispatcher delivery with a record of its verb + lane in the window but none it can pair, printed with ONE reason and the
#             candidates: `no-ref` when no ref word holds a letter (nothing can agree: `FIX 2 toolbar-brd08 delivered` names the task AFTER
#             the verb, and the exact `HH:MM DELIVERED <VERB> <lane>` form's only word before it is a stop word), else `ref-mismatch`. The
#             records stay unpaired (EXTRA, with their own reason). Every unpaired fails condition A (-> exit 2): a wrong pair whose leftover
#             has a reason would otherwise pass it quietly. NOREF_NOTE: dispatcher lines before 2026-10-03 name the task after the verb and
#             audit as no-ref; run condition A on windows from 10-03 on (planner ruling 18:57: one extraction rule, before the verb only);
#   missed    a dispatcher delivery with NO shadow record of its verb + lane in the window (named with the bridge's refusal reason when there
#             is one), or a ledger message since the shadow baseline with no shadow record;                     -> exit 1
#   duplicate a surplus shadow record: the same queue src twice, the same ledger id twice, or two ledger messages to one seat with the same kind
#             and body within CTL_POSTMAN_DUP_WINDOW (10 min);                                                     -> exit 1
#   extra     a shadow queue delivery nothing matched, printed with ONE reason word (EXTRA REASONS below);
#   by-orch   a DISPATCH-log line that says the orchestrator delivered it, each of its verbs marked agreed, or why not.
# CONDITION A (planner ruling 2026-10-04 09:03, "count MATCHED, never shadow deliveries"): PASS = matched (dispatcher pairs + BY-ORCH
# agreements) >= 20 AND missed = 0 AND duplicate = 0 AND unpaired = 0 AND every EXTRA has a reason. A miss or a duplicate exits 1; a clean parity whose
# condition A fails prints `CONDITION A FAIL: <each failing clause>` and exits 2; exit 0 only with `CONDITION A PASS`. The queue deliveries in
# the window and the ledger records (seats' own `ctl post` messages, which the dispatcher never carried) are printed beside it as information
# and count toward nothing. `--window N` = the last N queue deliveries. Condition B (one gate cycle, zero missed) is the choice of window.
# A DISPATCH-log line is free text. The exact form `HH:MM DELIVERED <VERB> <lane> ...` is always read as one delivery. Any other line is cut
# into clauses at ';' and at a sentence end ('. ' / '! ' / '? '); a clause counts only if it says delivered/sent and none of not delivered /
# nothing delivered / held / HOLD / skipped / refused / cancelled / withdrawn, and a clause that says delivered BY the orchestrator is not a
# dispatcher delivery (the orchestrator restarts a lane of its choosing, so its lane is no evidence for the queue line's): it is printed as
# BY-ORCH and can only AGREE (below). In a counted clause each NEXT / FIX / MERGETIP names its lane, first match wins:
#   1. `VERB lane N` / `VERB laneN`;  2. `to lane N` / `to lanes N,M` / `(lane N)` / `delivered|sent lane N` after the verb, before the next
#   queue verb (NEXT FIX MERGETIP NOTE CLOSE REVIEW HOLD); 3. `lane N` just before it (`lane 3 U-T11b FIX 1`, `sent lane 1 the P-T10 MERGETIP`);
#   4. only when no lane is named for it, the number right after the verb (`NEXT 4`, `MERGETIP 5`).
# So in `T9 FIX 1 pointer to lane3` the 1 is the fix ROUND and the lane is 3. A verb right after `into` (folded into another delivery) or
# followed by `already` (`FIX 1 already DONE`) is skipped; `to lanes 1-5` (a range) names no lane. A counted clause whose verb gets no lane is printed as UNPARSED.
# BY-ORCH AGREEMENT. Each NEXT / FIX / MERGETIP of a BY-ORCH clause is ground truth for ONE shadow queue record in its pairing window when all
# three agree:
#   verb  the same verb;
#   lane  a lane the clause NAMES by rules 1-3, equal to the record's. Rule 4 never applies: in `ACK batch-6 FIX 3 delivered by orchestrator`
#         the 3 is the fix ROUND, so that clause names no lane and agrees with nothing;
#   ref   the REF WORDS — the words right before the verb (back to the clause start or the previous queue verb), lower case, split on anything
#         but a letter or a digit, without `lane N` and without ack hold held dispatcher note delivered sent by the orchestrator to and — joined
#         with nothing between them, hold a letter and spell a CONTIGUOUS RUN of WHOLE words of the record's brief stem (`BRIEF-<stem>.md`) or
#         branch name (`task/<name>`), joined the same way: `T9` agrees with BRIEF-sm-t9-notes-fix-1.md, `G-9 T1` with BRIEF-g9-t1-live-drag-
#         fix-1.md, `ctl-run-tests` with BRIEF-ctl-run-tests-fix-1.md, `ctl seats` with ctl-seats-fix-1; `T1` never with t10-… (whole words) and
#         `ctl tipmerge` never with ctl-auto-tipmerge (contiguous); no ref words, or a record with no brief and no branch, agree with nothing.
# A BY-ORCH verb that agrees with nothing pairs nothing and is never a MISSED (the record stays EXTRA and needs a reason).
# EXTRA REASONS — the first that holds, over the QUEUE-dispatch.md and DISPATCH-log.md lines in the record's pairing window, EXCEPT the record's
# OWN queue line: the QUEUE-dispatch line it was made from (the line whose queue_src, the bridge's src rule, is the record's src) is the request,
# never the dispatcher's answer to it, so `FIX lane5 BRIEF-hk-1-….md (…; branch stays HELD)` holds nothing; any other queue line is evidence. A
# line NAMES the record when its words (after the line's HH:MM time) hold the record's WHOLE brief stem or branch name as a run, or its ref words
# before the record's verb agree (the ref rule). The phrase must stand OUTSIDE the chunks that name the record (name_cut: a whitespace-free chunk
# of the line holding two consecutive words of its brief stem or branch name), so a name that holds the word is never its own reason:
# `BRIEF-hk-6-held-work-shipped-fix-1.md`, `task/hk-6-held-work-shipped` and `docs/held-work.md` say no held for an hk-6 record, while a lone
# word still counts (`…; both HELD`, `HK-6 HELD`; a one-word name has no pair). A line that says the hold is closed (`…; hold closed`) still
# says HOLD: the dispatcher held it.
#   held        a line that says HOLD / held and names it (`HH:MM HOLD dispatcher: FIX 4 BRIEF-x-fix-2.md …`, `HOLD batch-6 FIX 3 (not delivered…)`);
#   no-deliver  a line that says deliver(ed) nothing / nothing delivered / nothing to deliver and names it (`ACK deliver nothing for <branch> …`);
#   superseded  a LATER queue record to the same lane in its pairing window, with no delivery to that lane logged between them (a dispatcher
#               pair or a BY-ORCH verb naming that lane, from the record's own log minute to the minute before the later record);
#   ?           none: printed `reason=?`, and condition A fails.
DELIVER_VERBS = ("NEXT", "FIX", "MERGETIP")
COND_A_MIN = 20          # planner condition A: matched >= 20
NOREF_NOTE = "dispatcher lines before 2026-10-03 name the task after the verb and audit as no-ref; run condition A on windows from 10-03 on"
AUDIT_TOL = int(os.environ.get("CTL_POSTMAN_AUDIT_TOL", "2700"))
DUP_WINDOW = int(os.environ.get("CTL_POSTMAN_DUP_WINDOW", "600"))
D_G0 = re.compile(r"^\d\d:\d\d DELIVERED (NEXT|FIX|MERGETIP) (?:lane\s*)?([0-9]{1,2})\b")
D_KEY = re.compile(r"\b(NEXT|FIX|MERGETIP|NOTE|CLOSE|REVIEW|HOLD)\b")
D_VLANE = re.compile(r"\s*lane\s*([0-9]{1,2})\b")
D_TO = re.compile(r"(?:\b(?:to|delivered|sent)\s+lanes?\s*|\(lane\s*)([0-9]{1,2}(?:\s*,\s*[0-9]{1,2})*)(?![-0-9])")
D_PRE = re.compile(r"\blane\s*([0-9]{1,2})\s+(?:[A-Za-z0-9._/-]+\s+){0,2}$")
D_VNUM = re.compile(r"\s+([0-9]{1,2})\b")
D_INTO = re.compile(r"\binto\s+$")
D_ALREADY = re.compile(r"^\s*(?:[0-9]{1,2}\s+)?already\b")
D_POS = re.compile(r"\b(?:delivered|sent)\b")
D_NEG = re.compile(r"not delivered|nothing delivered|nothing to deliver|deliver nothing|not sent|\bheld\b|\bHOLD\b|skipped|refused|cancelled|withdrawn", re.I)
D_ORCH = re.compile(r"\bby (?:the )?orchestrator\b", re.I)
D_HELD = re.compile(r"\b(?:HOLD|held)\b", re.I)
D_NODEL = re.compile(r"\bdeliver(?:ed)? nothing\b|\bnothing (?:delivered|to deliver)\b", re.I)
D_LANEW = re.compile(r"\blane\s*[0-9]{1,2}\b", re.I)
D_STOP = {"ack", "hold", "held", "dispatcher", "note", "delivered", "sent", "by", "the", "orchestrator", "to", "and"}


def words(s): return re.findall(r"[a-z0-9]+", s.lower())


def ref_words(pre):
    """The ref words of the text right before a verb (the ref rule above)."""
    return [w for w in words(D_LANEW.sub(" ", pre)) if w not in D_STOP]


def run_in(sub, seq): return bool(sub) and any(seq[i:i + len(sub)] == sub for i in range(len(seq) - len(sub) + 1))


def rec_names(r):
    """A shadow queue record's names, as word lists: its brief's stem and its branch's name."""
    out = [words(re.sub(r"(?i)^brief-|\.md$", "", os.path.basename(r["brief"])))] if r.get("brief") else []
    if r.get("ref"): out.append(words(re.sub(r"^task/", "", r["ref"])))
    return [n for n in out if n]


def ref_agrees(ws, r):
    """The ref rule: the ref words, joined with nothing between them, hold a letter and spell a contiguous run of a name's words joined the same way."""
    s = "".join(ws)
    return bool(re.search(r"[a-z]", s)) and any(s == "".join(n[i:j]) for n in rec_names(r) for i in range(len(n)) for j in range(i + 1, len(n) + 1))


def names(text, r):
    """True when a free-text line names the record (EXTRA REASONS above); the line's leading HH:MM time is no word of it."""
    text = re.sub(r"^[0-9]{1,2}:[0-9]{2}\s+", "", text)
    if any(run_in(n, words(text)) for n in rec_names(r)): return True
    keys = list(D_KEY.finditer(text))
    return any(k.group(1) == r["verb"] and ref_agrees(ref_words(text[keys[i - 1].end() if i else 0:k.start()]), r) for i, k in enumerate(keys))


def name_cut(text, r):
    """The line with every chunk that NAMES the record blanked (EXTRA REASONS above): a whitespace-free chunk holding two consecutive words of its
    brief stem or branch name (`BRIEF-hk-6-held-work-shipped-fix-1.md`, `task/hk-6-held-work-shipped`, `docs/held-work.md`, `HK-6`). The
    held / HOLD / deliver-nothing phrase is looked for in the other chunks, so a name that holds the word is no reason; a lone `HELD` counts."""
    pairs = [n[i:i + 2] for n in rec_names(r) for i in range(len(n) - 1)]
    return re.sub(r"\S+", lambda c: " " * len(c.group()) if any(run_in(p, words(c.group())) for p in pairs) else c.group(), text)


def clause_pairs(c, named=False):
    """-> [(verb, lane or None, ref words)] for one counted clause (rules 1-4 above; named=True, a BY-ORCH clause: rules 1-3 only)."""
    keys, out = list(D_KEY.finditer(c)), []
    for i, k in enumerate(keys):
        pre = c[keys[i - 1].end() if i else 0:k.start()]
        seg = c[k.end():keys[i + 1].start() if i + 1 < len(keys) else len(c)]
        if k.group(1) not in DELIVER_VERBS or D_INTO.search(pre) or D_ALREADY.match(seg): continue
        mv, mt, mp, mn = D_VLANE.match(seg), D_TO.search(seg), D_PRE.search(pre), None if named else D_VNUM.match(seg)
        lanes = [mv.group(1)] if mv else re.findall(r"[0-9]{1,2}", mt.group(1)) if mt else [mp.group(1)] if mp else [mn.group(1)] if mn else [None]
        out += [(k.group(1), n, ref_words(pre)) for n in lanes]
    return out


def parse_dispatch_line(line):
    """-> (pairs [(verb, lane, ref words)], unparsed bool, by_orchestrator bool, BY-ORCH verbs [(verb, lane or None, ref words)]) for one
    DISPATCH-log line. The exact form's only word before its verb is DELIVERED, a stop word, so its ref words are always empty (no-ref)."""
    m0 = D_G0.match(line)
    if m0: return [(m0.group(1), m0.group(2), ref_words(line[6:m0.start(1)]))], False, False, []
    pairs, cand, orch, opairs = [], False, False, []
    for clause in re.split(r";|(?<=[.!?])\s+", line[6:]):
        if not D_POS.search(clause) or D_NEG.search(clause): continue
        if D_ORCH.search(clause):
            orch = orch or bool(D_KEY.search(clause)); opairs += clause_pairs(clause, named=True); continue
        for verb, lane, ws in clause_pairs(clause):
            if lane is None: cand = True
            else: pairs.append((verb, lane, ws))
    return pairs, cand and not pairs, orch, opairs


def parse_when(v):
    if re.fullmatch(r"[0-9]{9,11}", v): return float(v)
    mt = re.fullmatch(r"([0-9]{1,2}):([0-9]{2})", v)
    if mt:
        d = datetime.date.fromtimestamp(now()); t = time.mktime(datetime.datetime(d.year, d.month, d.day, int(mt.group(1)), int(mt.group(2))).timetuple())
        return t if t <= now() else t - 86400
    try: return float(epoch(v))
    except ValueError: pass
    for fmt in ("%Y-%m-%d %H:%M", "%Y-%m-%dT%H:%M", "%Y-%m-%d %H:%M:%S"):
        try: return time.mktime(time.strptime(v, fmt))
        except ValueError: pass
    raise ValueError("cannot read '%s' as a time (HH:MM, 'YYYY-MM-DD HH:MM', ISO Z, or epoch seconds)" % v)


def audit_parity(o):
    if "--since" in o and "--window" in o: fail("postman", "audit: --since and --window are exclusive")
    recs = load_shadow()
    if not recs: fail("postman", "audit: no shadow log at %s — run `ctl postman run --shadow` first" % shadow_path())
    queue = [r for r in recs if r.get("origin") == "queue"]
    lrecs = [r for r in recs if r.get("origin") == "ledger"]
    base = next((r["upto"] for r in recs if r.get("origin") == "baseline"), 0)
    deliveries = sorted([r for r in queue if r["verb"] in DELIVER_VERBS and not r.get("refused")], key=lambda r: r["epoch"])     # what --window counts
    since, desc = 0.0, "all shadow records"
    try:
        if "--window" in o:
            n = int(o["--window"]); assert n > 0
            since = deliveries[-n]["epoch"] if len(deliveries) >= n else 0.0; desc = "last %d queue deliveries" % n
        elif "--since" in o: since = parse_when(o["--since"]); desc = "since %s" % o["--since"]
    except (ValueError, AssertionError) as e: fail("postman", "audit: %s" % (e if str(e) else "--window needs a positive number"))
    inw = lambda r: r["epoch"] >= since
    near = lambda r, t: r["epoch"] <= t + 120 and t - r["epoch"] <= AUDIT_TOL          # the pairing window
    missed, dups, extras, matched, unparsed, by_orch, unpaired = [], [], [], [], [], [], []
    # duplicates among shadow records
    seen = {}
    for r in queue:
        if inw(r) and r.get("src"):
            seen.setdefault(r["src"], []).append(r)
    pool = []
    for src, rs in seen.items():
        pool.append(rs[0])
        for _ in rs[1:]: dups.append("queue line %s %s %s recorded %d times (src %s)" % (rs[0]["line_time"], rs[0]["verb"], rs[0]["win"], len(rs), src[-12:]))
    lseen = {}
    for r in lrecs:
        if inw(r): lseen[r["id"]] = lseen.get(r["id"], 0) + 1
    for i, n in sorted(lseen.items()):
        if n > 1: dups.append("ledger #%d recorded %d times" % (i, n))
    ledger = [m for m in load_ledger() if m["id"] > base and epoch(m["ts"]) >= since]
    for m in ledger:
        if m["id"] not in lseen: missed.append("ledger #%d %s → %s has no shadow record" % (m["id"], m["kind"], m["to"]))
    grp = {}
    for m in ledger:
        grp.setdefault((m["to"], m["kind"], m["body"]), []).append(m)
    for (to, kind, body), ms in grp.items():
        ms.sort(key=lambda m: m["id"]); last = ms[0]
        for m in ms[1:]:
            if epoch(m["ts"]) - epoch(last["ts"]) < DUP_WINDOW: dups.append("ledger #%d repeats #%d (%s → %s, same body) within %d s" % (m["id"], last["id"], kind, to, DUP_WINDOW))
            last = m
    # the dispatcher's deliveries and the orchestrator's acks
    rd = lambda f: open(os.path.join(ROOT, f), encoding="utf-8", errors="replace").read().splitlines()[-1500:] if os.path.exists(os.path.join(ROOT, f)) else []
    lines, qlines = rd("DISPATCH-log.md"), rd("QUEUE-dispatch.md")
    ts = verdict_times(lines); dis = []
    for i, line in enumerate(lines):
        if ts[i] is None or ts[i] < since - 60: continue
        pairs, cand, orch, opairs = parse_dispatch_line(line)
        for verb, win, ws in pairs: dis.append((ts[i], verb, str(int(win)), line, ws))
        if cand: unparsed.append(line)
        if orch: by_orch.append((line, [(ts[i], verb, None if win is None else str(int(win)), ws) for verb, win, ws in opairs]))
    lane = lambda r: str(int(r["win"]))
    avail = sorted([r for r in pool if r["verb"] in DELIVER_VERBS and not r.get("refused")], key=lambda r: r["epoch"])
    refused = [r for r in pool if r.get("refused")]
    for t, verb, win, line, ws in sorted(dis):
        cands = [r for r in avail if r["verb"] == verb and lane(r) == win and near(r, t)] if win.isdigit() else []
        hit = next((r for r in cands if ref_agrees(ws, r)), None)          # REQUIRE the ref (the BY-ORCH rule's own function); the earliest agreeing wins
        if hit: avail.remove(hit); matched.append((hit, line, ws))
        elif cands: unpaired.append(("ref-mismatch" if re.search(r"[a-z]", "".join(ws)) else "no-ref", verb, win, ws, line, cands))
        else:
            why = next((" (the bridge refused it: %s)" % r["refused"] for r in refused if r["verb"] == verb and str(r["win"]).lstrip("0") == win.lstrip("0") and abs(t - r["epoch"]) <= AUDIT_TOL), "")
            missed.append("%s %s: the dispatcher delivered it, no shadow delivery to pair with%s — %s" % (verb, win, why, line[:160]))
    agreed, orch_out = 0, []
    for line, ops in by_orch:
        st = []
        for t, verb, win, ws in ops:
            hit = next((r for r in avail if r["verb"] == verb and lane(r) == win and ref_agrees(ws, r) and near(r, t)), None) if win else None
            if hit: avail.remove(hit); matched.append((hit, "BY-ORCH " + line, ws)); agreed += 1; st.append("%s lane %s agreed" % (verb, win))
            else: st.append("%s: names no lane" % verb if not win else "%s lane %s: no shadow record agrees on verb + lane + ref" % (verb, win))
        orch_out.append("%s [%s]" % (line[:200], "; ".join(st) or "no NEXT/FIX/MERGETIP"))
    # EXTRA REASONS (the docblock above)
    evid = [(t, x, None) for t, x in zip(ts, lines) if t is not None] + [(t, x, queue_src(x)) for t, x in zip(verdict_times(qlines), qlines) if t is not None]
    lane_dl = [(t, win) for t, _, win, _, _ in dis] + [(t, win) for _, ops in by_orch for t, _, win, _ in ops if win]
    said = lambda r, pat: any(near(r, t) and s != r["src"] and names(x, r) and pat.search(name_cut(x, r)) for t, x, s in evid)     # never its own queue line
    superseded = lambda r: any(q["epoch"] > r["epoch"] and lane(q) == lane(r) and near(r, q["epoch"])
                               and not any(w == lane(r) and r["epoch"] - 60 <= t < q["epoch"] - 60 for t, w in lane_dl) for q in pool if not q.get("refused"))
    extras = [(r, "held" if said(r, D_HELD) else "no-deliver" if said(r, D_NODEL) else "superseded" if superseded(r) else "?") for r in avail]
    noreason = sum(1 for _, w in extras if w == "?")
    n_in, n_led = sum(1 for r in deliveries if inw(r)), sum(1 for r in lrecs if inw(r))
    refs = lambda ws: "ref=%s" % ("-".join(ws) or "(none)")
    for r, line, ws in matched: print("MATCHED   %s %s (shadow %s) %s ~ %s = %s" % (r["verb"], r["win"], r["ts"], refs(ws), " ".join(v for v in (r.get("brief"), r.get("ref")) if v) or "(no name)", line[:110]))
    for x in missed: print("MISSED    " + x)
    for why, verb, win, ws, line, cands in unpaired:
        names_ = ["%s %s" % (r["line_time"], " ".join(v for v in (r.get("brief"), r.get("ref")) if v) or "(no name)") for r in cands]
        print("UNPAIRED  %s lane %s %s reason=%s; same verb + lane in the window, none agreeing: %s — %s" % (verb, win, refs(ws), why,
              ", ".join(names_[:5]) + (" +%d more" % (len(names_) - 5) if len(names_) > 5 else ""), line[:160]))
    for x in dups: print("DUPLICATE " + x)
    for r, w in extras: print("EXTRA     %s %s %s %s (no dispatcher delivery, no BY-ORCH agreement) reason=%s" % (r["line_time"], r["verb"], r["win"], " ".join(v for v in (r.get("brief"), r.get("ref")) if v), w))
    for x in unparsed: print("UNPARSED  " + x[:200])
    for x in orch_out: print("BY-ORCH   " + x)
    ureason = {k: sum(1 for u in unpaired if u[0] == k) for k in ("ref-mismatch", "no-ref")}
    print("PAIRING   matched %d; unpaired %d (ref-mismatch %d, no-ref %d); extra %d" % (len(matched), len(unpaired), ureason["ref-mismatch"], ureason["no-ref"], len(extras)))
    if ureason["no-ref"]: print("NOTE      " + NOREF_NOTE)
    print("window: %s; shadow queue deliveries in it: %d; ledger records beside them: %d (information only: condition A counts MATCHED)" % (desc, n_in, n_led))
    need = (["matched %d < %d" % (len(matched), COND_A_MIN)] if len(matched) < COND_A_MIN else []) + (["missed %d" % len(missed)] if missed else []) \
        + (["duplicate %d" % len(dups)] if dups else []) \
        + (["unpaired %d (%s)" % (len(unpaired), ", ".join("%s %d" % kv for kv in ureason.items() if kv[1]))] if unpaired else []) \
        + (["%d EXTRA without a reason" % noreason] if noreason else [])
    split = "matched %d = dispatcher pairs %d + BY-ORCH agreements %d" % (len(matched), len(matched) - agreed, agreed)
    if need: print("CONDITION A FAIL: %s (%s)" % ("; ".join(need), split))
    else:
        rs = ", ".join("%s %d" % (k, sum(1 for _, w in extras if w == k)) for k in ("held", "no-deliver", "superseded") if any(w == k for _, w in extras))
        print("CONDITION A PASS: matched %d >= %d, missed 0, duplicate 0, unpaired 0, every EXTRA has a reason (%s) (%s)" % (len(matched), COND_A_MIN, rs or "no EXTRA", split))
    print("POSTMAN AUDIT %s %d/%d/%d" % (desc, len(matched), len(missed), len(dups)))
    tail = "%s: matched=%d missed=%d duplicate=%d extra=%d unparsed=%d by_orchestrator=%d agreed=%d no_reason=%d unpaired=%d" % (desc, len(matched), len(missed), len(dups), len(extras), len(unparsed), len(by_orch), agreed, noreason, len(unpaired))
    if missed or dups: fail("postman", "audit parity %s" % tail)
    if need: print("FAIL postman audit parity %s; condition A not met" % tail); sys.exit(2)
    ok("postman", "audit parity %s" % tail)


def cmd_audit(o=None):
    if o and any(k in o for k in ("--since", "--window", "--parity")): return audit_parity(o)
    q = os.path.join(ROOT, "QUEUE-review.md")
    lines = open(q, errors="replace").read().splitlines()[-300:] if os.path.exists(q) else []
    ts, keys, bad = verdict_times(lines), [verdict_key(l) for l in lines], []
    for i, key in enumerate(keys):
        if not key: continue
        nxt = next((ts[j] for j in range(i + 1, len(lines)) if keys[j] == key and ts[j] is not None), None)
        if not audit_matched(key[0], key[1], ts[i] - AUDIT_LEAD, nxt): bad.append(lines[i])   # THIS verdict's window: [its time - lead, the next verdict of the same branch)
    for b in bad: print("UNMATCHED: " + b[:200])
    if bad: fail("postman", "audit: %d reviewer verdict(s) in the last 300 QUEUE-review lines have no delivered message (mechanism g)" % len(bad))
    ok("postman", "audit: every FIX / needs-tip verdict in the last 300 lines has a message")


def once():
    stats = dict(inboxed=0, pasted=0, deferred=0, bounced=0, bridged=0, refused=0, cancelled=0, audited=0, shadowed=0)
    bridge(stats); audit_scan(stats)
    if SHADOW: deliver_shadow(stats)           # no restarts (they ack real messages), no inbox, no pane, no pages
    else: restarts(stats); deliver(stats)
    return stats


def summary(stats): return ", ".join("%d %s" % (v, k) for k, v in stats.items() if v) or "nothing to do"


CMD_FLAGS = {   # subcommand → (valued flags, boolean flags); an unknown flag is refused, never ignored (a typo must not start a live run)
    "restarted": ((), ("--dry-run",)), "status": ((), ("--dry-run",)), "audit": (("--since", "--window"), ("--parity", "--dry-run")),
    "once": ((), ("--dry-run", "--shadow")), "run": ((), ("--dry-run", "--shadow")),
}


def cmd_postman(args):
    if not args: fail("postman", "usage: ctl postman run|once|status|audit|restarted <seat>")
    sub, rest = args[0], args[1:]
    if sub not in CMD_FLAGS: fail("postman", "unknown subcommand %s" % sub)
    valued, bools = CMD_FLAGS[sub]
    try: pos, o = parse_flags(rest, valued + ("--repo",), bools)
    except ValueError as e: fail("postman", "%s: %s" % (sub, e))
    dry = "--dry-run" in o
    if sub == "restarted":
        seat = norm_seat(pos[0] if pos else "")
        if not seat: fail("postman", "restarted needs a seat name")
        if dry: print("DRY: mark %s restarted" % seat); ok("postman", "dry-run")
        os.makedirs(p("restarts"), exist_ok=True); open(p("restarts", seat), "w").write(str(int(now()) + 2))   # +2 s: a message posted in the second before the restart is the old session's
        ok("postman", "restart of %s recorded (its older open messages are cancelled on the next pass)" % seat)
    if sub == "audit": return cmd_audit(o)
    if sub == "status": return status()
    global SHADOW
    SHADOW = "--shadow" in o
    guard()
    os.environ.setdefault("CTL_PROOF_TRIES", "8")
    if dry: print("DRY: one %s pass%s over %s (session %s)" % (sub, " (shadow)" if SHADOW else "", ROOT, SESSION)); ok("postman", "dry-run")
    if sub == "once": ok("postman", "once%s: " % (" --shadow" if SHADOW else "") + summary(once()))
    os.makedirs(PM, exist_ok=True); pidf = p("daemon.pid")
    try:
        other = int(open(pidf).read().strip())
        if other != os.getpid() and alive(other): fail("postman", "already running (pid %d, %s)" % (other, pidf))
    except (FileNotFoundError, ValueError): pass
    open(pidf, "w").write(str(os.getpid()))
    passes, mx = 0, int(os.environ.get("CTL_POSTMAN_MAX_PASSES", "0"))
    try:
        while True:
            try: once()
            except Exception as e:
                with open(p("daemon.log"), "a") as lf: lf.write("%s pass failed: %r\n" % (iso(now()), e))
            passes += 1
            if mx and passes >= mx: break
            time.sleep(2)
    finally:
        try:
            if open(pidf).read().strip() == str(os.getpid()): os.remove(pidf)
        except OSError: pass
    ok("postman", "run: %d pass(es)" % passes)


def status():
    try: pid = int(open(p("daemon.pid")).read().strip()); d = "daemon pid %d %s" % (pid, "alive" if alive(pid) else "NOT running (stale pidfile)")
    except (FileNotFoundError, ValueError): d = "daemon not running"
    print(d)
    sh_recs = load_shadow()
    if sh_recs: print("shadow log: %d record(s), last %s (%s)" % (len(sh_recs), sh_recs[-1]["ts"], shadow_path()))
    acked, by = acked_ids(), {}
    for m in load_ledger():
        if m["id"] not in acked and not read_state(m["id"]).get("bounced"): by.setdefault(m["to"], []).append(m)
    for seat, msgs in sorted(by.items()):
        h = msgs[0]; st = read_state(h["id"])
        print("%s head=#%d tries=%d defers=%d last=%s open=%d watched=%s" % (seat, h["id"], st.get("tries", 0), st.get("defers", 0), st.get("last", "-"), len(msgs), "yes" if watched(seat) else "no"))
    ok("postman", "status: %d seat(s) with open messages; %s" % (len(by), d))


def main():
    verb, args = (sys.argv[1] if len(sys.argv) > 1 else ""), sys.argv[2:]
    {"post": cmd_post, "ack": cmd_ack, "inbox": cmd_inbox, "postman": cmd_postman}.get(verb, lambda a: fail("postman", "unknown verb %s" % verb))(args)


if __name__ == "__main__":
    main()
