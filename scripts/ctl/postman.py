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


def pane_on(): return os.environ.get("CTL_POSTMAN_PANE", "1") != "0"      # off = the shadow run: inbox + bridge + audit only


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


# ───────────────────────────── messages ─────────────────────────────
def norm_seat(s):
    s = ALIASES.get(s, s)
    return s if SEAT_RE.match(s or "") else None


def append_message(frm, to, kind, body=None, text=None, reply_to=None, src=None, ref=None):
    """Allocate the id under the lock and append ONE ledger line. Returns the message dict."""
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


def page(m, reason):
    if m["kind"] in NO_PAGE: return
    st = read_state(m["id"])
    if st.get("paged"): return
    st["paged"] = now(); write_state(m["id"], st)
    text = "#%d %s → %s unacked: %s. See: ctl postman status" % (m["id"], m["kind"], m["to"], reason)
    if m["to"] not in ("main", "planner"): append_message("postman", "main", "page", text=text)
    elif m["to"] == "main": append_message("postman", "planner", "page", text=text); notes_line(text)
    else: notes_line(text)


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
    known = {m["src"] for m in load_ledger() if m.get("src")}
    pos = off
    for raw in chunk.splitlines(keepends=True):
        if not raw.endswith(b"\n"): break
        pos += len(raw); line = raw.decode("utf-8", "replace").rstrip("\n")
        mt = re.match(r"^(\d\d:\d\d) (NEXT|FIX|MERGETIP|CLOSE)(?: (.*))?$", line)
        if mt:
            src = "queue-dispatch:" + hashlib.sha1(line.encode()).hexdigest()
            if src not in known:
                known.add(src); handle_queue_line(line, mt.group(1), mt.group(2), (mt.group(3) or "").split(), src, stats)
        open(cur, "w").write(str(pos))


def handle_queue_line(line, lt, verb, toks, src, stats):
    def refuse(why):
        m = append_message("postman", "main", "note", text="bridge could not route QUEUE-dispatch line (%s): %s" % (why, line), src=src)
        queue_done(lt, "postman refused #%d: %s" % (m["id"], why)); stats["refused"] += 1
    win = toks[0] if toks else ""
    mm = re.fullmatch(r"(?:lane)?([1-5])", win)
    if verb == "CLOSE" and mm:
        m = append_message("postman", "main", "note", text="CLOSE %s needs `ctl close %s` (a lane cannot close itself)" % (win, mm.group(1)), src=src)
        return queue_done(lt, "postman #%d (note to main)" % m["id"])
    if not mm: return refuse("target '%s' is not 1-5 or laneN" % win)
    name = next((n for _, n, ix in windows() if ix == mm.group(1)), None)
    if not name or not name.startswith("exec"): return refuse("window %s is %s, not an exec lane" % (mm.group(1), name or "absent"))
    if verb in ("NEXT", "FIX"):
        brief = resolve_brief(toks[1]) if len(toks) > 1 else None
        if not brief: return refuse("brief file '%s' not found" % (toks[1] if len(toks) > 1 else ""))
        rm = BRANCH_RE.search(" ".join(toks[2:])) or BRANCH_RE.search(open(brief, errors="replace").read(4096))
        ref = rm.group(0) if rm else None
        m = append_message("queue", name, verb.lower(), body=brief, src=src, ref=ref)
    else:
        br = toks[1] if len(toks) > 1 else ""
        bm = next((re.fullmatch(r"base=(release/[A-Za-z0-9._/-]+)", t) for t in toks[2:] if re.fullmatch(r"base=release/[A-Za-z0-9._/-]+", t)), None)
        if not re.fullmatch(r"task/[A-Za-z0-9._/-]+", br) or not bm: return refuse("MERGETIP needs task/<branch> and base=release/<name>")
        m = append_message("queue", name, "mergetip", text="Read the WHOLE file %s/BRIEF-merge-tip.md and do it for branch %s, base %s." % (ROOT, br, bm.group(1)), src=src, ref=br)
    queue_done(lt, "postman #%d" % m["id"]); stats["bridged"] += 1


def queue_done(lt, result):
    if not pane_on(): return          # shadow run: a DONE line CLOSES the dispatcher's open line — the dispatcher must still deliver it
    with open(os.path.join(ROOT, "QUEUE-dispatch.md"), "a") as f: f.write("%s DONE %s %s\n" % (hhmm(now()), lt, result))


AUDIT_RE = re.compile(r"^\d\d:\d\d DONE \d\d:\d\d (FIX|needs-tip) (task/\S+) ([0-9a-f]{7,40})")


AUDIT_LEAD = 600     # a message may predate the verdict line's first sighting by this much (a scan that lagged), never more: an EARLIER round's message must not satisfy this verdict


def audit_matched(kind, branch, since, until=None):
    for m in load_ledger():
        if m["kind"] == kind and m.get("ref") == branch and epoch(m["ts"]) >= since and (until is None or epoch(m["ts"]) < until): return True
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


def cmd_audit():
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
    stats = dict(inboxed=0, pasted=0, deferred=0, bounced=0, bridged=0, refused=0, cancelled=0, audited=0)
    bridge(stats); audit_scan(stats); restarts(stats); deliver(stats)
    return stats


def summary(stats): return ", ".join("%d %s" % (v, k) for k, v in stats.items() if v) or "nothing to do"


def cmd_postman(args):
    if not args: fail("postman", "usage: ctl postman run|once|status|audit|restarted <seat>")
    sub, rest = args[0], args[1:]
    dry = "--dry-run" in rest
    if sub == "restarted":
        seat = norm_seat(next((a for a in rest if not a.startswith("--")), ""))
        if not seat: fail("postman", "restarted needs a seat name")
        if dry: print("DRY: mark %s restarted" % seat); ok("postman", "dry-run")
        os.makedirs(p("restarts"), exist_ok=True); open(p("restarts", seat), "w").write(str(int(now()) + 2))   # +2 s: a message posted in the second before the restart is the old session's
        ok("postman", "restart of %s recorded (its older open messages are cancelled on the next pass)" % seat)
    if sub == "audit": return cmd_audit()
    if sub == "status": return status()
    if sub not in ("once", "run"): fail("postman", "unknown subcommand %s" % sub)
    guard()
    os.environ.setdefault("CTL_PROOF_TRIES", "8")
    if dry: print("DRY: one %s pass over %s (session %s)" % (sub, ROOT, SESSION)); ok("postman", "dry-run")
    if sub == "once": ok("postman", "once: " + summary(once()))
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
