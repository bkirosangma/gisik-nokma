#!/usr/bin/env python3
"""ctl archive — move stale working files out of the lanes directory and roll the planner notes (owner plan B13, 2026-10-03).

Called by verbs/archive.sh (which has already refused a landing in flight). MOVE, never delete; DRY-RUN unless --apply.
Env: CTL_LANES_DIR (the lanes root), CTL_ARCHIVE_NOW (epoch, a test seam), CTL_ARCHIVE_LOG (full plan goes here),
CTL_ARCHIVE_INFLIGHT (non-empty: why a landing is in flight; --apply was already refused by the wrapper).
"""
import datetime
import os
import re
import sys
import time

MIN_AGE_DAYS = 7
NOTES = "CTL-TO-PLANNER-notes.md"
CARRY_LINES = 40
EXTS = (".md", ".txt", ".log", ".tsv", ".json", ".patch")
# The working-file families, anchored at the start of the name. EXEC- and EXEC<n>- are both exec-lane files; lowercase
# dispatch-*/msg-* (the controller's serial docs) and every CTL-* file (the notes, CTL-NOTE-*) are NOT swept.
FAMILIES = (r"BRIEF-", r"PTR-", r"MSG-", r"NOTE-", r"HANDOFF-", r"EXEC-", r"EXEC[0-9]+-", r"pr-", r"DISPATCH-", r"gate-")
FAMILY_RE = re.compile("^(?:" + "|".join(FAMILIES) + ")")
# Pointer families: a kept one is a live pointer, so the files it names are kept too.
POINTER_RE = re.compile(r"^(?:PTR-|BRIEF-|HANDOFF-|MSG-)")
# The cards and the common-rules file are never moved, whatever their name looks like. A substring of the NAME (case-sensitive),
# tested on every top-level file before the family check, so a family-shaped name that carries one of them stays too.
PROTECTED_SUBSTRINGS = ("STEPS-common", "CARD", "ROLES", "BOOT")
PROTECTED_NAMES = (NOTES,)


def fail(msg):
    print("FAIL archive " + msg)
    sys.exit(1)


def ok(msg):
    print("OK archive " + msg)
    sys.exit(0)


def stem(name):
    return os.path.splitext(name)[0]


def read_text(path):
    with open(path, "rb") as fh:
        return fh.read().decode("utf-8", "replace")


def human(n):
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return "%d %s" % (n, unit) if unit == "B" else "%.1f %s" % (n, unit)
        n /= 1024.0


def main(argv):
    apply = "--apply" in argv
    listing = "--list" in argv
    root = os.environ.get("CTL_LANES_DIR", "/Users/kiro/my_projects/gisik-nokma-lanes")
    now = int(os.environ.get("CTL_ARCHIVE_NOW") or time.time())
    today = datetime.date.fromtimestamp(now).isoformat()
    stamp = datetime.datetime.fromtimestamp(now).astimezone().strftime("%Y-%m-%dT%H:%M:%S%z")
    inflight = os.environ.get("CTL_ARCHIVE_INFLIGHT", "")
    log_path = os.environ.get("CTL_ARCHIVE_LOG", "")
    arch = os.path.join(root, "archive", today)

    # --- the reference haystacks; fail closed when they cannot be read -------------------------------------------------
    roles = os.path.join(root, "roles")
    try:
        lanes_text = read_text(os.path.join(roles, "LANES.md"))
        queue_files = sorted(f for f in os.listdir(roles) if re.match(r"^QUEUE-.*\.md$", f))
        if not queue_files:
            raise OSError("no roles/QUEUE-*.md")
        # The queue lines carry HH:MM and no date, so "the last 3 days" cannot be read per line: every name anywhere in a
        # queue counts as referenced. The queues began 2026-10-01, so today that IS the last three days; later it only over-protects.
        queue_text = "\n".join(read_text(os.path.join(roles, f)) for f in queue_files)
    except OSError as e:
        fail("cannot read roles/LANES.md and roles/QUEUE-*.md (%s) — refusing, nothing changed" % e)

    # --- classify every top-level regular file --------------------------------------------------------------------------
    entries = []  # (name, path, mtime, size)
    scripts_text = ""
    for e in sorted(os.scandir(root), key=lambda x: x.name):
        if e.is_symlink() or not e.is_file(follow_symlinks=False):
            continue
        st = e.stat(follow_symlinks=False)
        entries.append((e.name, e.path, int(st.st_mtime), st.st_size))
        if e.name.endswith(".sh"):
            scripts_text += read_text(e.path) + "\n"

    verdict = {}   # name -> "MOVE" | "KEEP:<reason>"
    info = {}      # name -> (path, mtime, size)
    others = 0
    for name, path, mtime, size in entries:
        protected = name in PROTECTED_NAMES or any(s in name for s in PROTECTED_SUBSTRINGS)
        if not protected and not (FAMILY_RE.match(name) and name.endswith(EXTS)):
            others += 1
            continue
        info[name] = (path, mtime, size)
        s = stem(name)
        if protected:
            verdict[name] = "KEEP:protected"
        elif now - mtime <= MIN_AGE_DAYS * 86400:
            verdict[name] = "KEEP:recent"
        elif s in lanes_text:
            verdict[name] = "KEEP:lanes"
        elif s in queue_text:
            verdict[name] = "KEEP:queue-ref"
        elif s in scripts_text:
            verdict[name] = "KEEP:script-ref"
        elif os.path.exists(os.path.join(arch, name)):
            verdict[name] = "KEEP:collision"
        else:
            verdict[name] = "MOVE"

    # --- the second hop: a kept pointer names more files, and those stay too (to a fixed point) --------------------------
    seeds = [n for n, v in verdict.items() if v in ("KEEP:recent", "KEEP:lanes", "KEEP:queue-ref", "KEEP:script-ref", "KEEP:live-ptr") and POINTER_RE.match(n)]
    seen = set()
    while seeds:
        n = seeds.pop()
        if n in seen:
            continue
        seen.add(n)
        text = read_text(info[n][0])
        for m, v in list(verdict.items()):
            if v == "MOVE" and stem(m) in text:
                verdict[m] = "KEEP:live-ptr"
                if POINTER_RE.match(m):
                    seeds.append(m)

    moves = sorted(n for n, v in verdict.items() if v == "MOVE")
    move_bytes = sum(info[n][2] for n in moves)
    counts = {}
    for v in verdict.values():
        counts[v] = counts.get(v, 0) + 1

    def iso(mt):
        return datetime.datetime.fromtimestamp(mt).strftime("%Y-%m-%dT%H:%M:%S")

    plan = []
    for n in sorted(verdict):
        v = verdict[n]
        plan.append("%s\t%s\t%s\t%d" % (v, n, iso(info[n][1]), info[n][2]) if v == "MOVE" else "%s\t%s" % (v, n))
    if log_path:
        with open(log_path, "w") as fh:
            fh.write("# ctl archive plan %s root=%s apply=%s\n" % (stamp, root, apply))
            fh.write("\n".join(plan) + "\n")

    lines = ["archive plan for %s (%s): MOVE %d (%s)%s; %d files outside the working-file families" % (
        root, today, len(moves), human(move_bytes), "".join("; %s %d" % (k, counts[k]) for k in sorted(counts) if k != "MOVE"), others)]
    if listing:
        lines += plan

    # --- the notes roll -------------------------------------------------------------------------------------------------
    notes = os.path.join(root, NOTES)
    notes_dest = os.path.join(arch, "CTL-TO-PLANNER-notes.%s.md" % today)
    notes_action = None   # None: nothing to do; else the text to roll
    if not os.path.isfile(notes):
        lines.append("notes: no %s — nothing to roll" % NOTES)
    elif os.path.exists(notes_dest):
        lines.append("notes: already rolled today (%s exists) — not rolling again" % os.path.relpath(notes_dest, root))
    else:
        with open(notes, "rb") as fh:
            data = fh.read()
        notes_action = data
        lines.append("notes: would roll %d lines into %s, carrying the last %d" % (data.count(b"\n"), os.path.relpath(notes_dest, root), CARRY_LINES))
    if inflight:
        lines.append("notes + files: a landing is in flight (%s) — --apply would refuse" % inflight)

    if not apply:
        print("\n".join(lines))
        ok("dry-run: would move %d files (%s) to archive/%s/%s — nothing changed; plan log %s; re-run with --apply" % (
            len(moves), human(move_bytes), today, " and roll the notes" if notes_action is not None else "", log_path or "(none)"))

    # --- apply ------------------------------------------------------------------------------------------------------------
    os.makedirs(arch, exist_ok=True)
    index = os.path.join(arch, "INDEX.tsv")
    new_index = not os.path.exists(index)
    idx = open(index, "a")
    if new_index:
        idx.write("file\tmtime\tsize\toriginal_path\n")
    rolled = ""
    if notes_action is not None:
        data = notes_action
        ino0 = os.stat(notes).st_ino
        header = "# rolled %s from %s — last %d lines carried over below\n" % (stamp, os.path.relpath(notes_dest, root), CARRY_LINES)
        tail = b"".join(data.splitlines(keepends=True)[-CARRY_LINES:])
        if tail and not tail.endswith(b"\n"):
            tail += b"\n"
        tmp = os.path.join(root, ".%s.rolling-%d" % (NOTES, os.getpid()))
        with open(tmp, "wb") as fh:
            fh.write(header.encode() + tail)
        os.chmod(tmp, os.stat(notes).st_mode & 0o7777)
        # Never a moment with no file at the path, never a truncation: hard-link the live inode to its archive name (it is then
        # the archived file; a writer's open descriptor keeps appending to it), then rename the new file over the path.
        try:
            os.link(notes, notes_dest)
        except OSError as e:
            os.unlink(tmp)
            fail("cannot archive %s (%s) — nothing moved" % (NOTES, e))
        os.replace(tmp, notes)
        if os.stat(notes_dest).st_ino != ino0 or os.stat(notes).st_ino == ino0:
            fail("notes roll left the wrong inodes at %s / %s" % (notes, notes_dest))
        late = os.stat(notes_dest).st_size - len(data)
        idx.write("%s\t%s\t%d\t%s\n" % (os.path.basename(notes_dest), iso(int(os.stat(notes_dest).st_mtime)), os.stat(notes_dest).st_size, notes))
        rolled = "; notes rolled (%d lines carried)%s" % (len(tail.splitlines()), "; WARNING: %d bytes were appended while rolling and are only in the archive copy" % late if late else "")
        idx.flush()

    moved = 0
    skipped = []
    for n in moves:
        src, mtime, size = info[n]
        dst = os.path.join(arch, n)
        try:
            os.link(src, dst)     # atomic, and refuses an existing destination
        except FileExistsError:
            skipped.append(n)
            continue
        idx.write("%s\t%s\t%d\t%s\n" % (n, iso(mtime), size, src))
        idx.flush()
        os.unlink(src)
        if os.path.exists(src) or not os.path.exists(dst):
            fail("moving %s did not take (source %s, destination %s)" % (n, "still there" if os.path.exists(src) else "gone", "missing" if not os.path.exists(dst) else "present"))
        moved += 1
    idx.close()
    print("\n".join(lines))
    if skipped:
        fail("moved %d, but %d name(s) already existed in archive/%s/ and were left: %s" % (moved, len(skipped), today, " ".join(skipped)))
    ok("moved %d files (%s) to archive/%s/ (INDEX.tsv written)%s; plan log %s" % (moved, human(move_bytes), today, rolled, log_path or "(none)"))


if __name__ == "__main__":
    main(sys.argv[1:])
