#!/usr/bin/env python3
"""ctl prune-gate-locks — the plan and the apply for verbs/prune-gate-locks.sh (planner 2026-10-04 08:10: ~400 stale per-run
`gate-lock-<stamp>-<pid>` dirs back to 09-22 in ~/.cache/gisik-ctl).

  prune-gate-locks.py --dir D [--apply] [--list]

The log dir D holds, per `ctl gate` run, `gate-<stamp>-<pid>.log`, `gate-<stamp>-<pid>.log.console` and the per-run copy of the
gate scripts `gate-lock-<stamp>-<pid>/` (verbs/gate.sh: the copy is left in place as the evidence of what ran). Rules, in order:
  a gate-lock dir is KEPT when it is the NEWEST gate-lock dir (`newest`), its run's pid (the name's suffix) is a live process
  (`live-pid`), any process's command line names the dir (`in-ps`: `bash <dir>/gate.sh` is how gate.sh runs it), or it is
  24 h old or younger by mtime (`recent`); otherwise REMOVE.
  a gate log (`gate-<stamp>-<pid>.log` / `.log.console`) is KEPT under the same live tests (`live-pid`, `in-ps`) or when it is
  7 days old or younger (`recent`); otherwise REMOVE. No other verb's log is touched.
Only names matching those two patterns, directly in D, and never a symlink, are considered. A dry-run (the default) prints the plan
and changes nothing. CTL_PRUNE_NOW (epoch) pins now; CTL_PRUNE_PS_CMD replaces `ps -axo pid=,command=` (test seams).
"""
import argparse, os, re, shutil, subprocess, sys, time

LOCK = re.compile(r"^gate-lock-(\d{8}T\d{6})-(\d+)$")
LOG = re.compile(r"^gate-(\d{8}T\d{6})-(\d+)\.log(?:\.console)?$")
DIR_AGE = 24 * 3600
LOG_AGE = 7 * 24 * 3600


def processes():
    cmd = os.environ.get("CTL_PRUNE_PS_CMD") or "ps -axo pid=,command="
    out = subprocess.run(["sh", "-c", cmd], capture_output=True, text=True).stdout
    procs = []
    for line in out.splitlines():
        pid, _, args = line.strip().partition(" ")
        if pid.isdigit(): procs.append((int(pid), args))
    return procs


def plan(d, now, procs):
    pids = {p for p, _ in procs}
    names = sorted(os.listdir(d))
    locks = [n for n in names if LOCK.match(n) and os.path.isdir(os.path.join(d, n)) and not os.path.islink(os.path.join(d, n))]
    newest = max(locks, key=lambda n: (os.path.getmtime(os.path.join(d, n)), n)) if locks else None
    rows = []
    for n in names:
        p = os.path.join(d, n)
        m = LOCK.match(n) if n in locks else (LOG.match(n) if os.path.isfile(p) and not os.path.islink(p) else None)
        if not m: continue
        is_dir = n in locks
        age = now - os.path.getmtime(p)
        if is_dir and n == newest: why = "newest"
        elif int(m.group(2)) in pids: why = "live-pid"
        elif any(re.search(re.escape(p) + r"(/|\s|$)", args) for _, args in procs): why = "in-ps"   # -1 must not match -12
        elif age <= (DIR_AGE if is_dir else LOG_AGE): why = "recent"
        else: why = None
        rows.append((n, is_dir, why))
    return rows


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("--dir", required=True); ap.add_argument("--apply", action="store_true"); ap.add_argument("--list", action="store_true")
    a = ap.parse_args(argv)
    d = os.path.realpath(a.dir)
    if not os.path.isdir(d):
        print(f"FAIL prune-gate-locks no log dir {d}"); return 1
    now = int(os.environ.get("CTL_PRUNE_NOW") or time.time())
    rows = plan(d, now, processes())
    gone = [r for r in rows if r[2] is None]
    if a.list:
        for n, is_dir, why in rows: print(f"{'REMOVE' if why is None else 'KEEP:' + why}\t{n}{'/' if is_dir else ''}")
    if a.apply:
        for n, is_dir, _ in gone:
            p = os.path.join(d, n)
            shutil.rmtree(p) if is_dir else os.remove(p)
    dirs = sum(1 for r in gone if r[1]); logs = len(gone) - dirs
    kept = len(rows) - len(gone)
    verb = "removed" if a.apply else "would remove (dry-run; --apply to remove)"
    print(f"OK prune-gate-locks {verb} {dirs} gate-lock dirs + {logs} gate logs, kept {kept} ({d})")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
