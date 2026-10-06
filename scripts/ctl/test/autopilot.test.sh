#!/usr/bin/env bash
# scripts/ctl/test/autopilot.test.sh — cases 13.2106-13.2149 and 13.2370 for `ctl autopilot` and scripts/ctl/make-lane-ptr.py; run by `ctl selftest`.
# Nothing here reads or writes the live pipeline: a SCRATCH lanes root (CTL_LANES_DIR), a scratch origin + repo (CTL_AUTOPILOT_REPO),
# a seats fixture (CTL_AUTOPILOT_SEATS_CMD), a stub `ctl` that logs its argv (CTL_AUTOPILOT_CTL), a stub make-reviewer-boot.py, a fixed
# clock, and a PATH-front `tmux` shim that logs every call. A guard case has its CONTROL in the same check: the same world with the one
# guarded fact flipped takes the action. CTL_AUTOPILOT_PY runs a mutant copy through the same harness (13.2117, the mutation pass).
set -u
HERE="$(cd "$(dirname "$0")/.." && pwd)"
CTL="$HERE/ctl"
AP="${CTL_AUTOPILOT_PY:-$HERE/verbs/autopilot.py}"
fails=0
grep() { /usr/bin/grep "$@"; }   # never the PATH grep (ugrep here: different -E / BRE semantics; a negated check must not pass on its error)
. "$HERE/test/harness.sh"   # check NAME CODE, and the CTL_TEST_ONLY case filter
T="$(cd "$(mktemp -d)" && pwd -P)"; trap 'rm -rf "$T"' EXIT
G() { /usr/bin/git -C "$T/repo" "$@"; }
export TZ=UTC
NOW=$(python3 -c 'import calendar;print(calendar.timegm((2026,10,4,10,0,0)))')   # 10:00
# ---------------------------------------------------------------- the scratch origin and repo (built once)
/usr/bin/git init -q --bare "$T/origin.git"; /usr/bin/git init -q "$T/repo"; G symbolic-ref HEAD refs/heads/main
G config user.email t@t; G config user.name t; G remote add origin "$T/origin.git"
c() { echo "$1" > "$T/repo/$2"; G add -A; G commit -q -m "$1"; }
c base README; G push -q origin main
G checkout -q -b release/knowledge-graph; mkdir -p "$T/repo/docs" "$T/repo/packages/kg"
printf '# Plan\n\n## Global Constraints\nx\n\n## Review Focus\ny\n\n### Task 1: One thing (cases 99.001–99.002)\nstep\n\n### Task 2: Two things (cases 99.003–99.009)\nstep\n\n### Task 3: Three\nstep\n\n## Planner rulings (2026-10-03)\nz\n' > "$T/repo/docs/plan.md"
printf '# Dup\n\n### Task 1: a\nx\n\n### Task 1: b\ny\n' > "$T/repo/docs/dup.md"
c kg packages/kg/a.txt; G push -q origin release/knowledge-graph
G checkout -q -b task/kv1; c kv1 kv1.txt; G push -q origin task/kv1; G checkout -q release/knowledge-graph
G merge -q --no-ff -m "Merge pull request #1 from o/task/kv1-gated" task/kv1; G push -q origin release/knowledge-graph; G push -q origin --delete task/kv1
KG=$(G rev-parse release/knowledge-graph)
G checkout -q -b task/kv2 "$KG"; c kv2 kv2.txt; G push -q origin task/kv2; KV2=$(G rev-parse HEAD)
G checkout -q -b task/kv3 "$KV2"; c kv3 kv3.txt; G push -q origin task/kv3; KV3=$(G rev-parse HEAD)
G checkout -q -b task/rev1 "$KG"; c rev1 rev1.txt; G push -q origin task/rev1; REV1=$(G rev-parse HEAD)
G checkout -q -b task/rev2 "$KG"; c rev2 rev2.txt; G push -q origin task/rev2; REV2=$(G rev-parse HEAD)
G checkout -q -b task/own "$KG"; c own own.txt; G push -q origin task/own; OWN=$(G rev-parse HEAD)
G checkout -q -b task/onown "$OWN"; c onown onown.txt; G push -q origin task/onown; ONOWN=$(G rev-parse HEAD)
G checkout -q -b release/workflow-graph main; c wg wg.txt; G push -q origin release/workflow-graph
G checkout -q -b task/wg1 release/workflow-graph; c wg1 wg1.txt; G push -q origin task/wg1; WG1=$(G rev-parse HEAD)
G checkout -q main; G fetch -q origin; G remote prune origin >/dev/null 2>&1
OLD=0000000000000000000000000000000000000000
# ---------------------------------------------------------------- stubs
mkdir -p "$T/shim" "$T/wts"
real_tmux="$(command -v tmux || echo /usr/bin/false)"
printf '#!/bin/bash\necho "$*" >> "%s/tmux.log"\nexit 1\n' "$T" > "$T/shim/tmux"; chmod +x "$T/shim/tmux"
printf '#!/bin/bash\nprintf "%%s\\n" "$*" >> "%s/ctl.log"\necho "OK $1 stub"\n' "$T" > "$T/ctl"; chmod +x "$T/ctl"
export CTL_AUTOPILOT_CTL="$T/ctl" CTL_AUTOPILOT_REPO="$T/repo" CTL_AUTOPILOT_NOW="$NOW" CTL_AUTOPILOT_WT_ROOT="$T/wts"
# ---------------------------------------------------------------- the world (reset per case)
L="$T/lanes"; R="$L/roles"; SEATS="$T/seats.jsonl"
export CTL_LANES_DIR="$L" CTL_LOG_DIR="$T/logs" CTL_AUTOPILOT_SEATS_CMD="cat $SEATS" CTL_AUTOPILOT_REVIEWER_BOOT="$R/make-reviewer-boot.py"
world() {
  rm -rf "$L" "$T/logs" "$T/ctl.log" "$T/tmux.log"; mkdir -p "$R" "$T/logs"
  printf '# review queue\n' > "$R/QUEUE-review.md"
  printf '%s\n' '#!/usr/bin/env python3' 'import sys, os' 'p = os.path.join(os.path.dirname(os.path.abspath(__file__)), f"BOOT-reviewer-{sys.argv[1]}-cur-test.md")' \
    'open(p, "w").write("BOOT " + sys.argv[1] + "\n" + open(sys.argv[2]).read())' 'print(p, 10, "bytes")' > "$R/make-reviewer-boot.py"
  order 'KV4 M docs/plan.md 2 task/kv4 path:packages/kg'
  : > "$SEATS"
  for w in 1 2 3 4; do seat $w name=exec$w role=lane state=busy; done
  seat 7 name=reviewerA role=reviewer state=busy; seat 9 name=reviewerB role=reviewer state=busy; seat 10 name=reviewerC role=reviewer state=busy weekly=10
}
# order ROW... — QUEUE-kg-order.md with the machine block (critical: task/kv*)
order() { { printf '# KG order\n\n| # | Task |\n|---|---|\n| 1 | prose only |\n\n```autopilot\n# id rung plan task branch needs\ncritical task/kv* task/crit*\n'; printf '%s\n' "$@"; printf '```\n'; } > "$L/QUEUE-kg-order.md"; }
# seat WINDOW k=v ... — create or update one seat of the fixture (defaults: idle-ready shapes are set explicitly by `free*`)
seat() { python3 - "$SEATS" "$@" <<'PY'
import json, sys
path, win, kv = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
seats = [json.loads(l) for l in open(path) if l.startswith("{")]
s = next((x for x in seats if x["window"] == win), None)
if s is None:
    s = {"window": win, "name": f"w{win}", "role": "other", "state": "busy", "copy_mode": False, "box": "empty", "shells": 0, "monitors": 0,
         "unpushed": 0, "dirty": 0, "branch": None, "last": None, "weekly": None}
    seats.append(s)
for item in kv:
    k, _, v = item.partition("=")
    if k == "last":
        kind, _, text = v.partition(":"); s["last"] = {"kind": kind, "text": text, "age_s": 60}
    else:
        s[k] = None if v == "null" else (int(v) if v.lstrip("-").isdigit() else v)
open(path, "w").write("".join(json.dumps(x) + "\n" for x in sorted(seats, key=lambda x: x["window"])))
PY
}
rq() { printf '%s\n' "$@" >> "$R/QUEUE-review.md"; }
# a lane that finished task/old<w> (its DONE queued) and is clean: the shape (b) and (c) act on
freelane() { local w="$1"; shift; seat "$w" state=idle shells=0 box=empty unpushed=0 dirty=0 branch=task/old$w "last=DONE:DONE task/old$w ab12cd34ef RUNG: M" "$@"
  grep -q " REVIEW task/old$w ab12cd34ef" "$R/QUEUE-review.md" || rq "09:00 REVIEW task/old$w ab12cd34ef0000000000000000000000000000ab base=origin/release/knowledge-graph brief=PTR-old.md lane=$w"; }
freerev() { seat "$1" state=idle shells=0 box=empty "${@:2}"; }
ap() { out=$(PATH="$T/shim:$PATH" python3 "$AP" once --shadow --no-fetch 2>&1); rc=$?; }
aplive() { out=$(PATH="$T/shim:$PATH" python3 "$AP" once --no-fetch 2>&1); rc=$?; }
# apat EPOCH — one shadow pass at another clock: CTL_AUTOPILOT_NOW is set on that python3 call only (every other check stays at 10:00);
# only its HH:MM reaches the ages (time.localtime under TZ=UTC), so the epoch's date is cosmetic
apat() { out=$(CTL_AUTOPILOT_NOW="$1" PATH="$T/shim:$PATH" python3 "$AP" once --shadow --no-fetch 2>&1); rc=$?; }
# /usr/bin/grep, never the PATH `grep` (ugrep on this machine: its -E did not match a literal "(on origin/…)" group, 2026-10-04)
would() { printf '%s\n' "$out" | /usr/bin/grep -E "WOULD $1" >/dev/null; }
said() { printf '%s\n' "$out" | /usr/bin/grep -F -- "$1" >/dev/null; }
nowould() { ! printf '%s\n' "$out" | grep -q "WOULD"; }
# a REVIEW item for task/rev1 at its origin head (lane 1 = WG pool by default seat config? no: lane= decides the pool; 3 = KG)
item1() { rq "09:10 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-rev1.md lane=${1:-1} handoff=HANDOFF-rev1.md (rev one)"; }
# mt FILE EPOCH — set a file's mtime from the fixed clock (never the wall clock: an age guard's legs must not depend on the run date)
mt() { python3 -c 'import os, sys; t = int(sys.argv[2]); os.utime(sys.argv[1], (t, t))' "$1" "$2"; }

# ================================================================ 13.2106 the REAL queue's shapes
world
cat > "$R/QUEUE-review.md" <<EOF
07:00 TOOK 06:50 task/gone 1234abcd (reviewer C, pull, FULL)
08:10 REVIEW task/own $OWN base=origin/release/knowledge-graph brief=PTR-o.md lane=3 (closed by the sha8 leg alone)
08:11 TOOK 05:28 task/own ${OWN:0:8} (orchestrator: re-queued head)
08:12 REVIEW task/onown $ONOWN base=origin/release/knowledge-graph brief=PTR-n.md lane=3 (closed by the time leg alone)
08:13 TOOK 08:12 task/onown (orchestrator)
08:17 REVIEW task/rev2 $OLD base=origin/release/knowledge-graph brief=PTR-a.md lane=2 (first)
08:17 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-b.md lane=1 (shares 08:17)
08:17 REVIEW task/kv2 $KV2 base=origin/release/knowledge-graph brief=PTR-c.md lane=3 (shares 08:17 too)
08:18 TOOK 08:17 task/kv2 ${KV2:0:8} (reviewer C, pull, FULL)
08:30 REVIEW task/rev2 $REV2 base=origin/release/knowledge-graph brief=PTR-a.md lane=2 (supersedes the 08:17 line: a newer sha)
08:56 REVIEW task/kv3 $KV3 base=origin/task/kv2@${KV2:0:8} brief=PTR-d.md lane=4 handoff=HANDOFF-d.md (stacked)
08:56 TOOK 08:56 task/kv3 ${KV3:0:8} (reviewer A, pull, FULL)
09:08 DONE 08:56 needs-tip (content READY; MERGETIP posted) (reviewer A)
09:13 NOTE preflight task/rev1 $REV1 (lane 1: typecheck ok)
EOF
parsed() { python3 - "$AP" "$R/QUEUE-review.md" <<'PY'
import importlib.util, sys
spec = importlib.util.spec_from_file_location("ap", sys.argv[1]); ap = importlib.util.module_from_spec(spec); spec.loader.exec_module(ap)
items, takes, dones, fixes, ftakes = ap.parse_review_queue(open(sys.argv[2]).read())
op = ap.open_items(items, takes, dones); held = ap.open_takes(takes, dones)
print("OPEN " + " ".join(f"{i['time']}:{i['branch']}:{i['sha'][:8]}" for i in op))
print("HELD " + " ".join(f"{t['holder']}:{t['ref']}:{t['branch']}" for t in held))
PY
}
P=$(parsed)
check "13.2106 the real queue's shapes parse: three REVIEW lines sharing 08:17 stay three items, a TOOK closes only the one whose branch+sha8 it names, the 08:30 line SUPERSEDES the older sha of the same branch, a DONE that names no branch (\`DONE 08:56 needs-tip …\`) closes nothing on its own, a NOTE preflight line is not an item; a TOOK citing only the sha8 (another time) and one citing only the time (no sha) each close their item; the TOOK of reviewer C (no DONE) is still HELD while its 07:00 TOOK is released by that later one, reviewer A's TOOK is released by its DONE citing 08:56; CONTROL in the same check: deleting the 08:18 TOOK reopens task/kv2" \
  '[ "$(printf "%s\n" "$P" | grep ^OPEN)" = "OPEN 08:17:task/rev1:${REV1:0:8} 08:30:task/rev2:${REV2:0:8}" ] && [ "$(printf "%s\n" "$P" | grep ^HELD)" = "HELD reviewer C:08:17:task/kv2" ] && sed -i "" "/08:18 TOOK/d" "$R/QUEUE-review.md" && parsed | grep ^OPEN | grep -q "08:17:task/kv2:${KV2:0:8}"'
cp "$HERE/test/fixtures/autopilot/QUEUE-review-2026-10-04.md" "$R/QUEUE-review.md" 2>/dev/null
check "13.2106 the frozen live QUEUE-review.md (2026-10-04 09:20, fixtures/autopilot/) yields exactly the hand-checked open set: nothing but task/kg-tl2-projection a6330eb3 (09:14, FIX 1 delta addressed to reviewer B) and task/ctl-postman-followup 6ff89c41 is TAKEN (09:08 TOOK by reviewer A); held TOOKs = reviewer A 09:04 postman, reviewer C 09:19 kg-home-t2-brand" \
  '[ "$(parsed | grep ^OPEN)" = "OPEN 09:14:task/kg-tl2-projection:a6330eb3" ] && parsed | grep ^HELD | grep -q "reviewer A:09:04:task/ctl-postman-followup" && parsed | grep ^HELD | grep -q "reviewer C:09:19:task/kg-home-t2-brand"'

# ================================================================ guards on reviewers
world; item1; freerev 7; seat 7 state=busy; ap; a=$out; world; item1; freerev 7; ap
check "13.2107 a BUSY reviewer seat is not restarted: reviewer A busy with an open item waiting -> no WOULD for it (SKIP reviewer A: state busy); CONTROL in the same check: the same world with A idle -> WOULD review: A takes task/rev1" \
  'printf "%s" "$a" | grep -q "SKIP reviewer A: state busy" && ! printf "%s" "$a" | grep -q "WOULD review: A" && would "review: A gisik:7 takes 09:10 task/rev1"'
world; item1; freerev 7 box=text; ap; b=$out; world; item1; freerev 7 copy_mode=true; ap; c2=$out
check "13.2107 an idle reviewer with text in its box, or in copy mode, is not restarted either (two worlds; a background shell is no reason, 13.2144); CONTROL: the clean idle world above took the item" \
  'printf "%s" "$b" | grep -q "SKIP reviewer A: box holds text" && printf "%s" "$c2" | grep -q "SKIP reviewer A: copy-mode" && ! printf "%s%s" "$b" "$c2" | grep -q "WOULD review: A"'
world; item1; rq "09:12 TOOK 09:00 task/zzz 12345678 (reviewer A, pull, FULL)"; freerev 7; ap; a=$out
rq "09:20 DONE 09:00 READY task/zzz 12345678 (reviewer A; REVIEW-zzz.md)"; ap
check "13.2116 an IDLE reviewer that holds an open TOOK (its verdict not yet DONE: it may be waiting on a Monitor mid-review) is not restarted; CONTROL in the same check: once its DONE citing that REVIEW time lands, it takes the next item" \
  'printf "%s" "$a" | grep -q "SKIP reviewer A: holds an open TOOK (09:00 task/zzz)" && ! printf "%s" "$a" | grep -q "WOULD review: A" && would "review: A gisik:7 takes 09:10 task/rev1"'

# ================================================================ guards on lanes
world; freelane 3; seat 3 dirty=2; ap; a=$out; world; freelane 3; ap
check "13.2108 a DIRTY lane is not restarted: lane 3 idle with its DONE queued but dirty 2 -> SKIP lane 3: dirty 2, no WOULD start; CONTROL in the same check: the same lane clean -> WOULD start: lane 3 takes KG KV4 at the row's own rung M (sonnet/high)" \
  'printf "%s" "$a" | grep -q "SKIP lane 3: dirty 2" && ! printf "%s" "$a" | grep -q "WOULD start: lane 3" && would "start: lane 3 takes KG KV4 task/kv4 .plan task 2, RUNG M = the row.s launch rung.: make-lane-ptr \\+ restart --model sonnet --effort high"'
world; freelane 3; seat 3 unpushed=1; ap; a=$out; world; freelane 3; seat 3 unpushed=null; ap; b=$out
check "13.2109 a lane with UNPUSHED commits is not restarted (unpushed 1, and unpushed unknown); CONTROL: the clean lane of 13.2108 started" \
  'printf "%s" "$a" | grep -q "SKIP lane 3: unpushed 1" && printf "%s" "$b" | grep -q "SKIP lane 3: unpushed None" && ! printf "%s%s" "$a" "$b" | grep -q "WOULD"'
world; freelane 3; seat 3 state=busy; ap; a=$out; world; freelane 3 "last=CHECKPOINT:CHECKPOINT task/old3 ab12cd34ef step 2/5"; ap; b=$out
check "13.2107 a BUSY lane is not restarted, nor one whose last line is a step CHECKPOINT (mid-task); CONTROL: the DONE lane of 13.2108 started" \
  'printf "%s" "$a" | grep -q "SKIP lane 3: state busy" && printf "%s" "$b" | grep -q "SKIP lane 3: last line is CHECKPOINT, not a DONE" && ! printf "%s%s" "$a" "$b" | grep -q "WOULD"'
world; seat 3 state=idle shells=0 box=empty unpushed=0 dirty=0 branch=task/old3 "last=DONE:DONE task/old3 ab12cd34ef RUNG: M"; ap; a=$out; world; freelane 3; ap
check "13.2121 a lane whose DONE has NO REVIEW line in QUEUE-review.md yet (it printed DONE but did not queue it) is not restarted; CONTROL in the same check: with the REVIEW line it starts" \
  'printf "%s" "$a" | grep -q "SKIP lane 3: DONE task/old3 ab12cd34 has no REVIEW line yet" && ! printf "%s" "$a" | grep -q WOULD && would "start: lane 3"'
world; freelane 3; printf '%s\t10:00\t3\tSTART\ttask/x\tx\n' $((NOW - 60)) > "$R/AUTOPILOT-ledger.tsv"; ap; a=$out
world; freelane 3; printf '%s\t10:00\t3\tSTART\ttask/x\tx\n' $((NOW - 179)) > "$R/AUTOPILOT-ledger.tsv"; ap; b=$out
world; freelane 3; printf '%s\t10:00\t3\tSTART\ttask/x\tx\n' $((NOW - 180)) > "$R/AUTOPILOT-ledger.tsv"; ap
check "13.2122 COOLDOWN: a window the autopilot acted on 60 s ago, or 179 s ago, is left alone (a restarted seat takes ~30 s to show busy); CONTROL in the same check: 180 s ago (the line) it acts" \
  'printf "%s" "$a" | grep -q "SKIP lane 3: cooldown (60s" && printf "%s" "$b" | grep -q "SKIP lane 3: cooldown (179s" && ! printf "%s%s" "$a" "$b" | grep -q WOULD && would "start: lane 3"'

# ================================================================ independence (fluid rule B)
world; order; freelane 3; item1 3; ap; a=$out; world; order; freelane 3; item1 1; ap
check "13.2110 a SELF-REVIEW is refused: lane 3 has nothing startable and the only open item is lane 3's own (lane=3) -> SKIP self-review, IDLE lane 3; CONTROL in the same check: the same item from lane 1 -> WOULD review: lane 3 takes it" \
  'printf "%s" "$a" | grep -q "SKIP lane 3 x task/rev1 ${REV1:0:8}: self-review (own work)" && ! printf "%s" "$a" | grep -q "WOULD review" && would "review: lane 3 gisik:3 takes 09:10 task/rev1"'
world; order; freelane 3 branch=task/own; rq "09:15 REVIEW task/rev2 $REV2 base=origin/task/own@${OWN:0:8} brief=PTR-x.md lane=1 (stacked on own by its base line; its head does not contain own)"; ap; a=$out
world; order; freelane 3 branch=task/own; rq "09:15 REVIEW task/onown $ONOWN base=origin/release/knowledge-graph brief=PTR-x.md lane=1 (base line says release)"; ap; b=$out
world; order; freelane 3; rq "09:15 REVIEW task/onown $ONOWN base=origin/release/knowledge-graph brief=PTR-x.md lane=1 (x)"; ap
check "13.2111 a branch STACKED on the reviewer's own task is refused: lane 3 (on task/own) and an item whose base= is origin/task/own@… -> stacked on own; the same item whose base line says release but whose head CONTAINS own's unlanded head -> refused by ancestry; CONTROL in the same check: a lane that does not own task/own takes that item" \
  'printf "%s" "$a" | grep -q "SKIP lane 3 x task/rev2 ${REV2:0:8}: stacked on own task/own$" && printf "%s" "$b" | grep -q "stacked on own task/own (contains its unlanded head)" && ! printf "%s%s" "$a" "$b" | grep -q "WOULD review" && would "review: lane 3 gisik:3 takes 09:15 task/onown"'
world; order; freelane 3 branch=task/onown; rq "09:15 REVIEW task/own $OWN base=origin/release/knowledge-graph brief=PTR-x.md lane=1 (x)" "09:16 REVIEW task/onown $ONOWN base=origin/task/own@${OWN:0:8} brief=PTR-y.md lane=3 (mine)"; ap; a=$out
check "13.2111 the reverse: a branch the reviewer's OWN task stacks on is refused (own task/onown's REVIEW base cites task/own); CONTROL: the 13.2111 world above took an unrelated item" \
  'printf "%s" "$a" | grep -q "SKIP lane 3 x task/own ${OWN:0:8}: own task/onown stacks on it" && ! printf "%s" "$a" | grep -q "WOULD review: lane 3 gisik:3 takes 09:15 task/own"'

# ================================================================ preflight / stale / directed / needs-tip
world; item1 1; freerev 7; seat 1 state=busy branch=task/rev1; ap; a=$out; world; item1 1; freerev 7; seat 1 state=idle branch=task/rev1 dirty=1; ap; b=$out
world; item1 1; freerev 7; seat 1 state=idle branch=task/rev1; ap
check "13.2112 an item whose LANE HAS A PREFLIGHT IN FLIGHT is skipped: lane 1 busy on task/rev1 -> SKIP preflight in flight, and lane 1 idle but dirty on it -> skipped too; CONTROL in the same check: lane 1 idle and clean on it -> reviewer A takes it" \
  'printf "%s" "$a" | grep -q "SKIP reviewer A x task/rev1 ${REV1:0:8}: preflight in flight: lane 1 is busy" && printf "%s" "$b" | grep -q "preflight in flight: lane 1 is idle dirty 1" && ! printf "%s%s" "$a" "$b" | grep -q "WOULD review" && would "review: A gisik:7 takes 09:10 task/rev1"'
world; rq "09:10 REVIEW task/rev1 $REV2 base=origin/release/knowledge-graph brief=PTR-rev1.md lane=1 (sha not at origin)"; freerev 7; ap; a=$out
check "13.2112 a STALE sha (origin/task/rev1 is not the REVIEW line's sha: the lane re-pushed in its preflight, or a tipmerge moved it) is skipped; CONTROL: the 13.2107 world (sha at origin) was taken" \
  'printf "%s" "$a" | grep -q "SKIP reviewer A x task/rev1 ${REV2:0:8}: stale: origin/task/rev1 is ${REV1:0:8}" && ! printf "%s" "$a" | grep -q WOULD'
world; item1 1; freerev 7; seat 1 state=idle branch=task/rev1 unpushed=1; ap; a=$out; world; item1 1; freerev 7; seat 1 state=idle branch=task/rev1 box=text; ap; b=$out
world; item1 1; freerev 7; seat 1 state=idle branch=task/rev1; ap
check "13.2141 the preflight guard's two other legs, each alone: lane 1 idle, clean, box empty but UNPUSHED 1 on task/rev1 -> SKIP preflight in flight; lane 1 idle, clean, pushed but TEXT in its box on it -> skipped too; CONTROL in the same check: lane 1 idle, clean, pushed, box empty on it -> reviewer A takes it" \
  'printf "%s" "$a" | grep -q "SKIP reviewer A x task/rev1 ${REV1:0:8}: preflight in flight: lane 1 is idle dirty 0 unpushed 1 box empty on it" && printf "%s" "$b" | grep -q "SKIP reviewer A x task/rev1 ${REV1:0:8}: preflight in flight: lane 1 is idle dirty 0 unpushed 0 box text on it" && ! printf "%s%s" "$a" "$b" | grep -q "WOULD review" && would "review: A gisik:7 takes 09:10 task/rev1"'
world; rq "09:50 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-rev1.md lane=1 (FIX 1 delta; reviewer C)"; freerev 7; freerev 10; ap; a=$out
world; rq "09:30 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-rev1.md lane=1 (FIX 1 delta; reviewer C)"; freerev 7; seat 10 state=busy; ap; d=$out
world; rq "09:40 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-rev1.md lane=1 (FIX 1 delta; reviewer C)"; freerev 7; seat 10 state=busy; ap; e=$out
world; rq "09:39 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-rev1.md lane=1 (FIX 1 delta; reviewer C)"; freerev 7; seat 10 state=busy; ap; f=$out
world; rq "09:10 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-rev1.md lane=1 needs-tip (x)"; freerev 7; ap; b=$out
check "13.2119 an item ADDRESSED to reviewer C (\`… reviewer C)\` at the end) is skipped by A for its first 20 min (10 min old) and taken by C; a needs-tip item is skipped; CONTROL in the same check: C takes the addressed one, and at 30 min old (C busy) A takes it (live 09:42: C took B's item after 28 min)" \
  'printf "%s" "$a" | grep -q "SKIP reviewer A x task/rev1 ${REV1:0:8}: addressed to reviewer C (10 min" && printf "%s" "$a" | grep -q "WOULD review: C gisik:10 takes 09:50 task/rev1" && printf "%s" "$b" | grep -q "needs-tip" && ! printf "%s" "$b" | grep -q WOULD && printf "%s" "$d" | grep -q "WOULD review: A gisik:7 takes 09:30 task/rev1" && printf "%s" "$e" | grep -q "addressed to reviewer C (20 min" && ! printf "%s" "$e" | grep -q WOULD && printf "%s" "$f" | grep -q "WOULD review: A gisik:7 takes 09:39 task/rev1"'

G push -q origin "$KG:refs/heads/task/landed" 2>/dev/null; G fetch -q origin
world; rq "09:10 REVIEW task/landed $KG base=origin/release/knowledge-graph brief=PTR-l.md lane=3 (its sha is on the KG tip)"; item1 1; freerev 7; ap
check "13.2128 an item whose sha is ALREADY on a release tip or main (landed, its REVIEW line never closed) is skipped; CONTROL in the same check: the unlanded task/rev1 item behind it is taken" \
  'said "SKIP reviewer A x task/landed ${KG:0:8}: already landed (on origin/release/knowledge-graph)" && would "review: A gisik:7 takes 09:10 task/rev1" && ! said "WOULD review: A gisik:7 takes 09:10 task/landed"'
world; rq "21:00 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-rev1.md lane=1 (yesterday)" "08:00 NOTE the next day"; freerev 7; ap; a=$out
world; rq "23:00 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-rev1.md lane=1 (yesterday, later)" "08:00 NOTE the next day"; freerev 7; ap
world; rq "22:00 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-rev1.md lane=1 (exactly 12 h)" "08:00 NOTE the next day"; freerev 7; ap; b=$out
world; rq "21:59 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-rev1.md lane=1 (12 h 1 min)" "08:00 NOTE the next day"; freerev 7; ap; c7=$out
world; rq "20:00 NOTE yesterday" "02:00 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-rev1.md lane=1 (after midnight)" "09:00 NOTE today"; freerev 7; ap; g=$out
world; rq "23:00 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-rev1.md lane=1 (yesterday, later)" "08:00 NOTE the next day"; freerev 7; ap
check "13.2129 an item OLDER than 12 h is the controller's call, never a pull: a 21:00 line followed by the next day's 08:00 line is 13 h old at 10:00 (the queue has no dates: a time > 6 h below the previous line's is the next day) -> skipped; CONTROL in the same check: a 23:00 line (11 h old) is taken" \
  'printf "%s" "$a" | grep -q "SKIP reviewer A x task/rev1 ${REV1:0:8}: older than 12 h (13 h)" && ! printf "%s" "$a" | grep -q WOULD && printf "%s" "$c7" | grep -q "older than 12 h (12 h)" && printf "%s" "$b" | grep -q "WOULD review: A gisik:7 takes 22:00 task/rev1" && printf "%s" "$g" | grep -q "WOULD review: A gisik:7 takes 02:00 task/rev1" && would "review: A gisik:7 takes 23:00 task/rev1"'

# ================================================================ the pull order
world; seat 7 state=busy; seat 9 state=busy; freerev 10
rq "09:01 REVIEW task/wg1 $WG1 base=origin/release/workflow-graph brief=PTR-w.md lane=1 (oldest)" "09:02 REVIEW task/rev2 $REV2 base=origin/release/knowledge-graph brief=PTR-r2.md lane=3 (KG)" "09:03 REVIEW task/kv2 $KV2 base=origin/release/knowledge-graph brief=PTR-k.md lane=4 (critical: task/kv*)" "09:04 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=BRIEF-rev1-fix-1.md lane=3 (FIX 1 delta)"
ap; a=$out; sed -i '' '/09:04 REVIEW/d' "$R/QUEUE-review.md"; ap; b=$out; sed -i '' '/09:03 REVIEW/d' "$R/QUEUE-review.md"; ap; c3=$out
check "13.2119 the pull ORDER for reviewer C: a FIX re-check first (09:04, the newest), then the critical path (09:03 task/kv2 by the order file's \`critical task/kv*\`), then the OLDEST (09:01 WG before 09:02 KG); CONTROL in the same check: each step removes the winner and the next rule decides" \
  'printf "%s" "$a" | grep -q "WOULD review: C gisik:10 takes 09:04 task/rev1" && printf "%s" "$b" | grep -q "WOULD review: C gisik:10 takes 09:03 task/kv2" && printf "%s" "$c3" | grep -q "WOULD review: C gisik:10 takes 09:01 task/wg1"'
world; freerev 7; freerev 9; seat 10 state=busy
rq "09:01 REVIEW task/wg1 $WG1 base=origin/release/workflow-graph brief=PTR-w.md lane=1 (WG, oldest)" "09:02 REVIEW task/rev2 $REV2 base=origin/release/knowledge-graph brief=PTR-r2.md lane=3 (KG)"; ap; a=$out
world; seat 7 state=busy; seat 9 state=busy; freerev 10
rq "09:01 REVIEW task/wg1 $WG1 base=origin/release/workflow-graph brief=PTR-w.md lane=1 (WG)" "09:01 REVIEW task/rev2 $REV2 base=origin/release/knowledge-graph brief=PTR-r2.md lane=3 (KG, same minute)"; ap
check "13.2119 POOLS: A takes its own KG item and B its own WG item although the WG one is older; C, on a tie of the same minute, takes KG; each item goes to ONE seat per pass; CONTROL in the same check: C with a strictly older WG item took the WG one (previous check)" \
  'printf "%s" "$a" | grep -q "WOULD review: A gisik:7 takes 09:02 task/rev2" && printf "%s" "$a" | grep -q "WOULD review: B gisik:9 takes 09:01 task/wg1" && would "review: C gisik:10 takes 09:01 task/rev2" && [ "$(printf "%s\n" "$out" | grep -c "WOULD review")" = 1 ]'
two_days() { world; seat 7 state=busy; seat 9 state=busy; freerev 10; rq "$@" "08:00 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-r1.md lane=3 (today, the oldest open)" "09:00 REVIEW task/rev2 $REV2 base=origin/release/knowledge-graph brief=PTR-r2.md lane=3 (today, newer)"; ap; }
two_days "09:00 REVIEW task/z $OLD base=origin/release/knowledge-graph brief=PTR-z.md lane=3 (yesterday: skipped as older than 12 h, but its 09:00 comes first in the file)" "20:00 NOTE yesterday evening"; a=$out
world; seat 7 state=busy; seat 9 state=busy; freerev 10; rq "23:00 REVIEW task/rev2 $REV2 base=origin/release/knowledge-graph brief=PTR-r2.md lane=3 (yesterday evening, 11 h old)" "08:00 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-r1.md lane=3 (today)"; ap; b=$out; two_days
check "13.2137 the OLDEST is by (day, clock) across days: yesterday's 09:00 line (itself skipped, 25 h old) does not make today's 09:00 item older than today's 08:00 one -> C takes 08:00 task/rev1, not 09:00 task/rev2; and yesterday evening's 23:00 item (11 h old) IS older than today's 08:00 one (the clock alone says 08:00 < 23:00) -> C takes 23:00 task/rev2; CONTROL in the same check: the single-day queue (08:00 rev1, 09:00 rev2 alone) takes 08:00 task/rev1" \
  'printf "%s" "$a" | grep -q "SKIP reviewer C x task/z ${OLD:0:8}: older than 12 h (25 h)" && printf "%s" "$a" | grep -q "WOULD review: C gisik:10 takes 08:00 task/rev1" && ! printf "%s" "$a" | grep -q "WOULD review: C gisik:10 takes 09:00" && printf "%s" "$b" | grep -q "WOULD review: C gisik:10 takes 23:00 task/rev2" && ! printf "%s" "$b" | grep -q "WOULD review: C gisik:10 takes 08:00" && would "review: C gisik:10 takes 08:00 task/rev1"'

# ================================================================ tasks: needs, stacks, FIX
world; freelane 3; order 'KV9 M docs/plan.md 2 task/kv9 path:packages/missing'; ap; a=$out
world; freelane 3; order 'KV9 M docs/plan.md 2 task/kv9 NOPE'; ap; b=$out
world; freelane 3; order 'KV9 M docs/plan.md 2 task/kv9 branch:task/never'; ap; c4=$out
world; freelane 3; order 'KV9 M docs/plan.md 2 task/kv9 path:packages/kg,KV1' 'KV1 M docs/plan.md 1 task/kv1 -'; ap
check "13.2113 a MISSING Need is a NEEDS skip, not a launch: a path not on the KG tip, an id with no row, a branch never pushed -> each logs NEEDS … a NEEDS skip and no WOULD start; CONTROL in the same check: Needs = a path on the tip + KV1 (deleted after landing; found by its \`Merge pull request … from o/task/kv1-gated\` on the tip) -> WOULD start KV9" \
  'printf "%s" "$a" | grep -q "NEEDS KG KV9 task/kv9: path:packages/missing absent" && printf "%s" "$b" | grep -q "NEEDS KG KV9 task/kv9: NOPE unknown" && printf "%s" "$c4" | grep -q "NEEDS KG KV9 task/kv9: branch:task/never absent" && ! printf "%s%s%s" "$a" "$b" "$c4" | grep -q "WOULD start" && would "start: lane 3 takes KG KV9 task/kv9"'
world; freelane 3; order 'KV9 M docs/plan.md 2 task/kv9 KV3' 'KV2 M docs/plan.md 1 task/kv2 path:packages/kg' 'KV3 M docs/plan.md 1 task/kv3 KV2'
rq "09:05 REVIEW task/kv2 $KV2 base=origin/release/knowledge-graph brief=PTR-k2.md lane=4 (x)" "09:06 REVIEW task/kv3 $KV3 base=origin/task/kv2@${KV2:0:8} brief=PTR-k3.md lane=4 (x)"; ap; a=$out
order 'KV9 M docs/plan.md 2 task/kv9 KV3' 'KV2 M docs/plan.md 1 task/kv2 KV0' 'KV0 M docs/plan.md 1 task/kv2 path:packages/kg' 'KV3 M docs/plan.md 1 task/kv3 KV2'; ap; b=$out
order 'KV9 M docs/plan.md 2 task/kv9 KV2,KV3' 'KV2 M docs/plan.md 1 task/kv2 path:packages/kg' 'KV3 M docs/plan.md 1 task/kv3 path:packages/kg'; ap; c5=$out
order 'KV9 M docs/plan.md 2 task/kv9 KV2' 'KV2 M docs/plan.md 1 task/kv2 path:packages/kg'; ap
check "13.2114 STACKS: KV9 needs KV3, which stacks on KV2 (both pushed, unlanded) = 2 levels -> WOULD start STACKED on task/kv3@<head>; a third level is refused (stack 3 levels deep); two unlanded bases are refused (one stack base only); CONTROL in the same check: one level on KV2 starts STACKED on task/kv2" \
  'printf "%s" "$a" | grep -q "WOULD start: lane 3 takes KG KV9 task/kv9 .* STACKED on task/kv3@${KV3:0:8}" && printf "%s" "$b" | grep -q "SKIP KG KV9: stack 3 levels deep (max 2)" && printf "%s" "$c5" | grep -q "SKIP KG KV9: needs 2 unlanded branches" && would "start: lane 3 takes KG KV9 task/kv9 .* STACKED on task/kv2@${KV2:0:8}"'
world; freelane 3; order 'KV9 M docs/plan.md 2 task/kv9 KV2' 'KV2 M docs/plan.md 1 task/kv2 path:packages/kg'; rq "09:05 REVIEW task/kv2 $REV1 base=origin/release/knowledge-graph brief=PTR-k2.md lane=4 (old sha)"; ap
check "13.2114 a stack base whose latest REVIEW line is not at its origin head (still moving) is not stacked on; CONTROL: the previous check's base at its head was" \
  'said "SKIP KG KV9: stack base task/kv2 has no REVIEW line at its origin head ${KV2:0:8}" && ! said "WOULD start"'
world; freelane 3; order 'KV4 M docs/plan.md 2 task/kv4 path:packages/kg'; printf 'RUNG: H+ (Opus/xhigh)\nfix it\n' > "$L/PTR-rev1-fix-1-lane3.md"
printf '09:30 FIX KG PTR-rev1-fix-1-lane3.md task/rev1\n' > "$R/QUEUE-autopilot.md"; ap; a=$out
printf '09:31 TOOK 09:30 task/rev1 (autopilot: lane 3)\n' >> "$R/QUEUE-autopilot.md"; ap
check "13.2115 a FIX goes FIRST: an open \`FIX KG <PTR> task/rev1\` line in roles/QUEUE-autopilot.md (the controller wrote the PTR) -> lane 3 WOULD fix with the PTR's own RUNG H+ (opus/xhigh) ahead of the startable KV4; CONTROL in the same check: once TOOK, the lane takes KV4" \
  'printf "%s" "$a" | grep -q "WOULD fix: lane 3 takes FIX 09:30 task/rev1 (PTR-rev1-fix-1-lane3.md, RUNG H+): TOOK + restart --model opus --effort xhigh" && ! printf "%s" "$a" | grep -q "WOULD start" && would "start: lane 3 takes KG KV4"'
world; freelane 3; rq "09:40 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-r.md lane=4 (x)" "09:50 DONE 09:40 FIX task/rev1 ${REV1:0:8} → BRIEF-rev1-fix-1.md (reviewer A)"; ap; a=$out
world; freelane 3; rq "09:30 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-r.md lane=4 (x)" "09:40 DONE 09:30 FIX task/rev1 ${REV1:0:8} → BRIEF-rev1-fix-1.md (reviewer A)"; ap
b=$out; world; freelane 3; rq "09:44 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-r.md lane=4 (x)" "09:46 DONE 09:44 FIX task/rev1 ${REV1:0:8} → BRIEF-rev1-fix-1.md (reviewer A)"; ap; c8=$out
world; freelane 3; rq "09:44 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-r.md lane=4 (x)" "09:45 DONE 09:44 FIX task/rev1 ${REV1:0:8} → BRIEF-rev1-fix-1.md (reviewer A)"; ap; out=$b
check "13.2115 FIX-WAIT: a reviewer FIX verdict of the lane's pool 10 min old with no QUEUE-autopilot FIX line holds the free lane (WAIT lane 3, no start); CONTROL in the same check: 20 min old (past the 15-min grace) -> the lane takes new work" \
  'printf "%s" "$a" | grep -q "WAIT lane 3: FIX verdict 09:50 task/rev1 (10 min old)" && ! printf "%s" "$a" | grep -q WOULD && printf "%s" "$c8" | grep -q "WAIT lane 3: FIX verdict 09:46 task/rev1 (14 min old)" && would "start: lane 3 takes KG KV4" && ap && would "start: lane 3 takes KG KV4"'

fv() { world; freelane 3; rq "09:50 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-r.md lane=4 (x)" "09:55 DONE 09:50 FIX task/rev1 ${REV1:0:8} → BRIEF-rev1-fix-1.md (reviewer A)"; }
fv; rq "09:56 TOOK 09:50 FIX task/rev1 ${REV1:0:8} (orchestrator: lane 1, PTR-x.md)"; ap; a=$out
fv; rq "09:58 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=BRIEF-rev1-fix-1.md lane=4 (FIX 1 delta, same KG pool)"; ap; b=$out
fv; printf 'RUNG: H+ (Opus/xhigh)\n' > "$L/PTR-f.md"; printf '09:57 FIX lane 4 PTR-f.md task/rev1\n' > "$R/QUEUE-autopilot.md"; ap; c=$out
fv; ap
check "13.2132 FIX-WAIT ends, each leg alone, when the verdict is already handled: the controller's \`TOOK … FIX task/rev1 (orchestrator: lane 1 …)\`, a newer REVIEW line for the branch (the FIX is done), or a QUEUE-autopilot FIX line for it (here addressed to lane 4) -> lane 3 takes KV4; CONTROL in the same check: the bare 5-min-old verdict holds lane 3 (WAIT)" \
  '( for o in "$a" "$b" "$c"; do printf "%s" "$o" | grep -q "WOULD start: lane 3 takes KG KV4" || exit 1; done ) && said "WAIT lane 3: FIX verdict 09:55 task/rev1 (5 min old)" && ! said "WOULD"'
fl() { world; freelane 3; printf '09:30 FIX KG PTR-f.md task/rev1\n' > "$R/QUEUE-autopilot.md"; }
fl; printf 'RUNG: H+ (Opus/xhigh)\n' > "$L/PTR-f.md"; seat 4 branch=task/rev1; ap; a=$out
fl; printf 'no rung line\n' > "$L/PTR-f.md"; ap; b=$out
fl; ap; c=$out
fl; printf 'RUNG: H+ (Opus/xhigh)\n' > "$L/PTR-f.md"; ap
check "13.2133 a FIX line is NOT launched, each leg alone: its branch is checked out in another lane's worktree (window 4); its PTR has no \`RUNG:\` first line; its PTR file is missing — each logs the SKIP and the lane falls through to KV4; CONTROL in the same check: a PTR with RUNG H+ and the branch held nowhere -> WOULD fix at opus/xhigh" \
  'printf "%s" "$a" | grep -q "SKIP lane 3 FIX task/rev1: checked out in window 4" && printf "%s" "$b" | grep -q "has no \`RUNG:\` first line" && printf "%s" "$c" | grep -q "SKIP lane 3 FIX task/rev1: no PTR PTR-f.md" && ! printf "%s%s%s" "$a" "$b" "$c" | grep -q "WOULD fix" && would "fix: lane 3 takes FIX 09:30 task/rev1 .PTR-f.md, RUNG H\\+.: TOOK \\+ restart --model opus --effort xhigh"'
fv; rq "20:00 NOTE yesterday evening" "08:00 NOTE the next day"; ap; a=$out
world; freelane 3; rq "20:00 NOTE yesterday evening" "08:00 NOTE today" "09:50 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-r.md lane=4 (x)" "09:55 DONE 09:50 FIX task/rev1 ${REV1:0:8} → BRIEF-rev1-fix-1.md (reviewer A)"; ap
check "13.2138 FIX-WAIT ages the verdict ACROSS DAYS, like items: yesterday's unhandled 09:55 FIX verdict is a day old at 10:00 today (the clock alone reads 5 min) -> no WAIT, lane 3 takes KV4; CONTROL in the same check: the same verdict written TODAY 5 min ago, below yesterday's lines (its own day index, not day 0) -> WAIT lane 3 (5 min old)" \
  'printf "%s" "$a" | grep -q "WOULD start: lane 3 takes KG KV4" && ! printf "%s" "$a" | grep -q "WAIT lane 3" && said "WAIT lane 3: FIX verdict 09:55 task/rev1 (5 min old)" && ! said "WOULD"'
# the live queue's DONE / TOOK shapes (2026-10-04), through the parser alone
shapes() { printf '%s\n' \
  "11:56 DONE 11:41 READY task/kg-tl2-projection bd780364 (reviewer A; FIX 2 delta; roles/REVIEW-kg-tl2-projection-bd780364.md)" \
  "11:07 DONE 10:51 READY task/wtg1-scroll 105c44a6 (reviewer B, FIX 1 delta, fast path; roles/REVIEW-wtg1-scroll-105c44a6.md)" \
  "05:55 DONE 05:54 needs-tip task/smoothness-batch-6 1a0753d6 (FIX 3 verified: bundle == release blob) reviewer A" \
  "12:33 DONE 11:50 FIX task/ctl-autopilot f0aa617d → BRIEF-ctl-autopilot-fix-1.md (reviewer A, FULL; roles/REVIEW-ctl-autopilot-f0aa617d.md)" \
  "12:40 DONE 11:23 FIX task/wtg1-range 2751f122 (reviewer C) → BRIEF-wtg1-range-fix-1.md" \
  "08:57 TOOK 08:20 FIX task/kg-tl2-projection d74098f3 (orchestrator: lane 3, PTR-kg-tl2-fix-1.md)" \
  "11:53 TOOK 11:41 task/kg-tl2-projection bd780364 (reviewer A, assigned, FIX 2 delta fast path)" \
  "13:44 TOOK - task/wtg1-range 172c5be3 (reviewer A, FIX 1 re-check, delta, queued item 3)" | python3 -c '
import importlib.util, sys
spec = importlib.util.spec_from_file_location("ap", sys.argv[1]); ap = importlib.util.module_from_spec(spec); spec.loader.exec_module(ap)
items, takes, dones, fixes, ftakes = ap.parse_review_queue(sys.stdin.read())
print("FIXES " + " ".join("%s:%s:%s" % (f["time"], f["branch"], f["brief"]) for f in fixes))
print("TAKES " + " ".join("%s:%s" % (t["time"], t["branch"]) for t in ftakes))' "$AP"; }
world; freelane 3; rq "09:50 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=BRIEF-rev1-fix-1.md lane=4 (FIX 1 delta)" "09:55 DONE 09:50 READY task/rev1 ${REV1:0:8} (reviewer A; FIX 1 delta; roles/REVIEW-rev1.md)"; ap; a=$out; fv; ap
check "13.2139 a READY of a FIX-delta re-check is NOT a FIX verdict (the verdict is the word right after the cited time: \`DONE 09:50 READY task/rev1 … (reviewer A; FIX 1 delta; …)\`), so 5 min old it holds no lane: lane 3 takes KV4; over the live queue's DONE shapes the parser keeps exactly the two \`DONE <time> FIX task/…\` lines (not the two READYs of a FIX delta, not a needs-tip that mentions FIX 3); CONTROL in the same check: \`DONE 09:50 FIX task/rev1 … → BRIEF-…\` 5 min old -> WAIT" \
  'printf "%s" "$a" | grep -q "WOULD start: lane 3 takes KG KV4" && ! printf "%s" "$a" | grep -q "WAIT lane 3" && [ "$(shapes | grep ^FIXES)" = "FIXES 12:33:task/ctl-autopilot:BRIEF-ctl-autopilot-fix-1.md 12:40:task/wtg1-range:BRIEF-wtg1-range-fix-1.md" ] && said "WAIT lane 3: FIX verdict 09:55 task/rev1 (5 min old)" && ! said "WOULD"'
fv; rq "09:56 TOOK 09:50 task/rev1 ${REV1:0:8} (reviewer C, pull, FIX 1 delta)"; ap; a=$out; fv; rq "09:56 TOOK 09:50 FIX task/rev1 ${REV1:0:8} (orchestrator: lane 1, PTR-x.md)"; ap
check "13.2140 a REVIEW TOOK that mentions a FIX delta (\`TOOK 09:50 task/rev1 … (reviewer C, pull, FIX 1 delta)\`) is not the start of the FIX, so it does not end FIX-WAIT (WAIT lane 3); over the live queue's TOOK shapes the parser keeps only the controller's \`TOOK <time> FIX task/…\`; CONTROL in the same check: that controller TOOK (\`TOOK 09:50 FIX task/rev1 (orchestrator: lane 1 …)\`) ends it -> lane 3 takes KV4" \
  'printf "%s" "$a" | grep -q "WAIT lane 3: FIX verdict 09:55 task/rev1 (5 min old)" && ! printf "%s" "$a" | grep -q WOULD && [ "$(shapes | grep ^TAKES)" = "TAKES 08:57:task/kg-tl2-projection" ] && would "start: lane 3 takes KG KV4"'
world; freelane 3; rq "09:50 REVIEW task/wg1 $WG1 base=origin/release/workflow-graph brief=PTR-w.md lane=1 (WG)" "09:55 DONE 09:50 FIX task/wg1 ${WG1:0:8} → BRIEF-wg1-fix-1.md (reviewer B)"; ap; a=$out; fv; ap
check "13.2143 FIX-WAIT holds only the verdict's OWN pool: a fresh FIX verdict on a WG item (lane=1) does not hold KG lane 3 (it takes KV4); CONTROL in the same check: the same 5-min-old verdict on a KG item (lane=4) holds it" \
  'printf "%s" "$a" | grep -q "WOULD start: lane 3 takes KG KV4" && ! printf "%s" "$a" | grep -q "WAIT lane 3" && said "WAIT lane 3: FIX verdict 09:55 task/rev1 (5 min old)" && ! said "WOULD"'
# 13.2149: item_age_min's "midnight passed since the queue's last line" leg (now's clock > 6 h below the last line's). Its 6 h mirrors the
# parser's day-rollover rule (13.2129: a time more than 6 h BELOW the previous line's is the next day); the item legs sit 5.5 h and 7 h
# below the last line, not at the exact boundary. The clock moves through CTL_AUTOPILOT_NOW alone (apat); no line is written after the last.
MID=$((NOW + 14 * 3600))   # 2026-10-05 00:00, the midnight after NOW (10:00)
world; freelane 3; rq "23:40 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-r.md lane=4 (x)" "23:50 DONE 23:40 FIX task/rev1 ${REV1:0:8} → BRIEF-rev1-fix-1.md (reviewer A)"
apat $((MID + 5 * 60)); a=$out; apat $((MID + 4 * 60)); b=$out
world; freerev 7; rq "12:00 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-rev1.md lane=1 (the queue's last line)"
apat $((NOW - 210 * 60)); c=$out; apat $((MID + 5 * 3600)); d=$out
check "13.2149 the ages see MIDNIGHT with no line written since (FIX 2, F6): the queue's last line is yesterday's \`23:50 DONE 23:40 FIX task/rev1 … → BRIEF-…\` (a KG item) and the clock reads 00:05 -> the verdict is 15 min old, past the grace: no WAIT, lane 3 takes KV4; CONTROL in the same check: at 00:04 -> WAIT lane 3 (14 min old); and with a 12:00 REVIEW item as the last line, at 06:30 (5.5 h below it: the same day by the 6 h rule) reviewer A takes it, at 05:00 (7 h below: the next day, 17 h old) -> SKIP older than 12 h (17 h), no WOULD" \
  'printf "%s" "$a" | grep -q "WOULD start: lane 3 takes KG KV4" && ! printf "%s" "$a" | grep -q "WAIT lane 3" && printf "%s" "$b" | grep -qF "WAIT lane 3: FIX verdict 23:50 task/rev1 (14 min old)" && ! printf "%s" "$b" | grep -q WOULD && printf "%s" "$c" | grep -q "WOULD review: A gisik:7 takes 12:00 task/rev1" && printf "%s" "$d" | grep -qF "SKIP reviewer A x task/rev1 ${REV1:0:8}: older than 12 h (17 h)" && ! printf "%s" "$d" | grep -q WOULD'

# ================================================================ budget, one-per-pass, no block
world; freelane 3; seat 10 weekly=96; ap; a=$out; world; freelane 3; order 'KV4 H++ docs/plan.md 2 task/kv4 path:packages/kg'; seat 10 weekly=86; ap; b=$out
world; freelane 3; order 'KV4 H++ docs/plan.md 2 task/kv4 path:packages/kg'; seat 10 weekly=null; ap; c6=$out
world; freelane 3; seat 10 weekly=95; ap; d=$out; world; freelane 3; order 'KV4 H++ docs/plan.md 2 task/kv4 path:packages/kg'; seat 10 weekly=85; ap; e=$out
world; freelane 3; seat 10 weekly=94; ap; f=$out
world; freelane 3; order 'KV4 H++ docs/plan.md 2 task/kv4 path:packages/kg'; seat 10 weekly=84; ap
check "13.2120 BUDGET: weekly 96% -> no lane launch at all; weekly 86% -> no H++ launch (an H++ row), and weekly unknown -> no H++ either; CONTROL in the same check: weekly 84% launches the H++ task with opus/max" \
  'printf "%s" "$a" | grep -q "budget: weekly 96% >= 95" && printf "%s" "$b" | grep -q "budget: H++ needs weekly < 85% (is 86)" && printf "%s" "$c6" | grep -q "budget: H++ needs weekly < 85% (is unknown)" && printf "%s" "$d" | grep -q "budget: weekly 95% >= 95" && printf "%s" "$e" | grep -q "is 85)" && ! printf "%s%s%s%s%s" "$a" "$b" "$c6" "$d" "$e" | grep -q "WOULD start" && printf "%s" "$f" | grep -q "WOULD start: lane 3 takes KG KV4" && would "start: lane 3 takes KG KV4 task/kv4 .plan task 2, RUNG H\\+\\+ = the row.s launch rung.: make-lane-ptr \\+ restart --model opus --effort max"'
world; freelane 3; freelane 4; ap; a=$out; world; freelane 3; freelane 4; order 'KV4 M docs/plan.md 2 task/kv4 path:packages/kg' 'KV5 M docs/plan.md 2 task/kv5 path:packages/kg'; ap
keep=$out; world; freerev 7; freerev 10; item1 3; ap; one_item=$out; out=$keep   # the two-row world of the next check stays in $out
check "13.2126 ONE item per pass: reviewers A and C free and ONE KG item -> exactly one review (A, own pool first); CONTROL: 13.2119 POOLS gave two items to two seats" \
  '[ "$(printf "%s\n" "$one_item" | grep -c "WOULD review")" = 1 ] && printf "%s" "$one_item" | grep -q "WOULD review: A gisik:7 takes 09:10 task/rev1"'
check "13.2126 ONE row per lane per pass: two free KG lanes and one startable row -> one start (lane 3) and lane 4 is IDLE; CONTROL in the same check: with two rows each lane gets its own" \
  'printf "%s" "$a" | grep -q "WOULD start: lane 3 takes KG KV4" && [ "$(printf "%s\n" "$a" | grep -c "WOULD start")" = 1 ] && would "start: lane 3 takes KG KV4" && would "start: lane 4 takes KG KV5"'
world; freelane 3; printf '# KG order\n| 1 | TL2 projection | H | TL1 ✓ |\n' > "$L/QUEUE-kg-order.md"; ap; a=$out; world; freelane 3; ap
check "13.2127 an order file WITHOUT the \`\`\`autopilot block (today's prose table) starts nothing (SKIP … no \`\`\`autopilot block rows) and a malformed block row is needs-unparsed; CONTROL in the same check: the block world starts KV4" \
  'printf "%s" "$a" | grep -q "has no \`\`\`autopilot block rows" && ! printf "%s" "$a" | grep -q "WOULD start" && would "start: lane 3 takes KG KV4" && order "KV4 Q docs/plan.md 2 task/kv4 -" && ap && said "needs-unparsed" && ! said "WOULD start"'
world; freelane 3; order 'KV4 M docs/plan.md 2 task/rev1 path:packages/kg'; ap; a=$out
world; freelane 3; order 'KV4 M docs/plan.md 2 task/kv4 path:packages/kg'; printf 'Branch `task/kv4` cut from origin/release/knowledge-graph\n' > "$L/PTR-kv4-by-hand.md"; mt "$L/PTR-kv4-by-hand.md" $((NOW - 3600)); ap; b=$out
world; freelane 3; order 'KV4 M docs/plan.md 2 task/kv4 path:packages/kg'; rq "09:05 REVIEW task/kv4 $REV1 base=origin/release/knowledge-graph brief=PTR-k.md lane=4 (deleted branch, line left)"; ap; c9=$out
world; freelane 3; order 'KV4 M docs/plan.md 2 task/kv4 path:packages/kg'; seat 4 branch=task/kv4; ap; d=$out
world; freelane 3; order 'KV4 M docs/plan.md 2 task/kv4 path:packages/kg'; printf '%s\t09:00\t4\tSTART\ttask/kv4\tKV4\n' $((NOW - 3600)) > "$R/AUTOPILOT-ledger.tsv"; ap; e=$out
check "13.2126 a row already TAKEN is not started, each leg alone: its branch is on origin; a hand-written PTR from the last 24 h names it (the controller started it by hand); it has a REVIEW line; a seat is on it; the ledger shows the autopilot started it; CONTROL: the plain world starts it (13.2108)" \
  '( for o in "$a" "$b" "$c9" "$d" "$e"; do printf "%s" "$o" | grep -q "WOULD start" && exit 1; done; exit 0 )'
byhand() { world; freelane 3; order 'KV4 M docs/plan.md 2 task/kv4 path:packages/kg'; printf 'Branch `task/kv4` cut from origin/release/knowledge-graph\n' > "$L/PTR-kv4-by-hand.md"; mt "$L/PTR-kv4-by-hand.md" $((NOW - $1 * 3600)); ap; }
byhand 25; a=$out; byhand 23
check "13.2142 a hand-written PTR stops a row only while RECENT (24 h; both mtimes set from CTL_AUTOPILOT_NOW, never the wall clock): a PTR naming task/kv4 written 25 h before now -> lane 3 takes KV4; CONTROL in the same check: the same PTR 23 h old -> no start (the controller started it by hand)" \
  'printf "%s" "$a" | grep -q "WOULD start: lane 3 takes KG KV4" && ! said "WOULD start"'

world; order; seat 3 state=idle shells=0 box=empty unpushed=0 dirty=0 branch=null "last=CHECKPOINT:CHECKPOINT reviewer idle after task/zzz 12345678"; rq "09:20 TOOK 09:00 task/zzz 12345678 (lane 3 as reviewer, autopilot, FULL)"; item1 1; ap; a=$out
rq "09:40 DONE 09:00 READY task/zzz 12345678 (lane 3 as reviewer; REVIEW-zzz.md)"; ap
check "13.2130 a LANE serving as a reviewer (its last line \`CHECKPOINT reviewer idle after …\`) that still holds its open TOOK is not restarted; CONTROL in the same check: after its DONE (\`lane 3 as reviewer\`) it is free again and, with nothing startable, takes the next item" \
  'printf "%s" "$a" | grep -q "SKIP lane 3: holds an open review TOOK" && ! printf "%s" "$a" | grep -q WOULD && would "review: lane 3 gisik:3 takes 09:10 task/rev1"'
race() { world; item1 1; freerev 7; python3 - "$AP" "$1" <<'PY'
import importlib.util, os, sys
spec = importlib.util.spec_from_file_location("ap", sys.argv[1]); ap = importlib.util.module_from_spec(spec); spec.loader.exec_module(ap)
L = os.environ["CTL_LANES_DIR"]; w = ap.World(L, os.environ["CTL_AUTOPILOT_REPO"], ap.seats_now(), ap.env_now())
log = lambda m: print(m)
acts = [a for a in ap.decide(w, lambda m: None) if a["do"] == "review"]
assert len(acts) == 1, acts
if sys.argv[2] == "race":   # another seat writes its TOOK between the decision and the door
    open(os.path.join(L, "roles", "QUEUE-review.md"), "a").write("10:00 TOOK 09:10 task/rev1 %s (reviewer C, pull, FULL)\n" % acts[0]["item"]["sha"][:8])
ap.Door(w, False, log, os.environ["CTL_AUTOPILOT_REPO"]).act(acts[0])
PY
}
check "13.2131 the TOOK is written under the reviewers' mkdir lock with a RE-CHECK inside it: when another seat TOOK the item between the decision and the door, the autopilot appends nothing and restarts nobody (NOT TAKEN … taken by another seat); CONTROL in the same check: without the race it appends its TOOK and calls ctl restart; the lock dir is gone afterwards either way" \
  'o=$(race race) && printf "%s" "$o" | grep -q "NOT TAKEN task/rev1: taken by another seat" && [ ! -e "$T/ctl.log" ] && [ "$(grep -c " TOOK 09:10 task/rev1" "$R/QUEUE-review.md")" = 1 ] && [ ! -e "$R/.queue.lock.d" ] && o=$(race none) && grep -q "(reviewer A, autopilot, FULL)" "$R/QUEUE-review.md" && grep -q "^restart 7 " "$T/ctl.log" && [ ! -e "$R/.queue.lock.d" ]'

world; item1 1; freerev 7 dirty=1; echo "$R/BOOT-x.md" > "$R/PULL-B.boot"; echo boot > "$R/BOOT-x.md"; freerev 9 dirty=2; ap; a=$out
world; item1 1; freerev 7; echo "$R/BOOT-x.md" > "$R/PULL-B.boot"; echo boot > "$R/BOOT-x.md"; freerev 9; ap
check "13.2135 a reviewer whose worktree is DIRTY is not restarted (ctl restart would refuse it after the TOOK was written): A dirty 1 gets no review, B dirty 2 keeps its PULL file waiting; CONTROL in the same check: both clean -> A takes task/rev1 and B is pulled" \
  'printf "%s" "$a" | grep -q "SKIP reviewer A: dirty 1" && printf "%s" "$a" | grep -q "WAIT reviewer B PULL BOOT-x.md: dirty 2" && ! printf "%s" "$a" | grep -q WOULD && would "review: A gisik:7 takes 09:10 task/rev1" && would "pull: restart reviewer B"'
failpull() { world; freerev 9; echo "$R/BOOT-x.md" > "$R/PULL-B.boot"; echo boot > "$R/BOOT-x.md"
  printf '#!/bin/bash\nprintf "%%s\\n" "$*" >> "%s/ctl.log"\necho "FAIL restart worktree x is dirty"; exit 1\n' "$T" > "$T/ctl"; aplive
  printf '#!/bin/bash\nprintf "%%s\\n" "$*" >> "%s/ctl.log"\necho "OK $1 stub"\n' "$T" > "$T/ctl"; }
check "13.2136 a FAILED restart (not the known 'no backend line' false negative) keeps the PULL file, writes no ledger row and logs a FLAG; CONTROL in the same check: the same pull with a restart that succeeds removes the file" \
  'failpull && printf "%s" "$out" | grep -q "FLAG restart failed" && [ -f "$R/PULL-B.boot" ] && ! /usr/bin/grep -q "PULL" "$R/AUTOPILOT-ledger.tsv" 2>/dev/null && aplive && [ ! -e "$R/PULL-B.boot" ] && /usr/bin/grep -q "PULL" "$R/AUTOPILOT-ledger.tsv"'

# ================================================================ planner rulings R1 (shells) and R2 (launch rung), 14:07
world; item1; freerev 7 shells=1; ap; a=$out; world; item1; freerev 7 shells=1; rq "09:12 TOOK 09:00 task/zzz 12345678 (reviewer A, pull, FULL)"; ap; b=$out
world; freerev 9 shells=1; echo "$R/BOOT-x.md" > "$R/PULL-B.boot"; echo boot > "$R/BOOT-x.md"; ap; c=$out; world; item1; freerev 7; ap
check "13.2144 a REVIEWER's background shells keep it from nothing (planner R1, P13: a seat parked on its own queued run-tests, or with a finished monitor's shell, shows sh 1 while idle): reviewer A idle, box empty, clean, no open TOOK, 1 shell -> takes task/rev1; reviewer B with 1 shell and its PULL file -> pulled; A with 1 shell AND an open TOOK -> not picked (the held-TOOK check is what makes it safe); CONTROL in the same check: A with 0 shells takes the item" \
  'printf "%s" "$a" | grep -q "WOULD review: A gisik:7 takes 09:10 task/rev1" && printf "%s" "$c" | grep -q "WOULD pull: restart reviewer B gisik:9 on BOOT-x.md" && printf "%s" "$b" | grep -q "SKIP reviewer A: holds an open TOOK (09:00 task/zzz)" && ! printf "%s" "$b" | grep -q "WOULD review: A" && would "review: A gisik:7 takes 09:10 task/rev1"'
world; freelane 3 shells=1; ap; a=$out; world; freelane 3 shells=1 "last=CHECKPOINT:CHECKPOINT task/old3 ab12cd34ef step 2/5"; ap; b=$out
lrev() { world; order; seat 3 state=idle shells="$1" box=empty unpushed=0 dirty=0 branch=null "last=CHECKPOINT:CHECKPOINT reviewer idle after task/zzz 12345678"; item1 1; ap; }
lrev 1; c=$out; lrev 0
check "13.2145 a LANE's shells are ignored only when its task is over (planner R1): lane 3 idle, clean, its DONE's REVIEW line queued, with 1 shell -> starts KV4; a lane with 1 shell mid-task (last line a step CHECKPOINT) -> SKIP 1 shells running; a lane back from a review (\`CHECKPOINT reviewer idle after …\`) with 1 shell -> SKIP 1 shells running; CONTROL in the same check: that lane-reviewer with 0 shells takes the next item" \
  'printf "%s" "$a" | grep -q "WOULD start: lane 3 takes KG KV4" && printf "%s" "$b" | grep -q "SKIP lane 3: 1 shells running" && printf "%s" "$c" | grep -q "SKIP lane 3: 1 shells running" && ! printf "%s%s" "$b" "$c" | grep -q WOULD && would "review: lane 3 gisik:3 takes 09:10 task/rev1"'
# fixround SHELLS [queued] — a FIX round: lane 3 pushed its FIX head cd34ef56aa; the queue holds the first round's ab12cd34… REVIEW line (freelane)
fixround() { world; freelane 3 shells="$1" "last=DONE:DONE task/old3 cd34ef56aa RUNG: M"
  [ -z "${2:-}" ] || rq "09:30 REVIEW task/old3 cd34ef56aa$(printf '%030d' 0) base=origin/release/knowledge-graph brief=BRIEF-old3-fix-1.md lane=3 (FIX 1 delta)"; ap; }
fixround 0; a=$out; fixround 1; b=$out; fixround 0 queued; c=$out; fixround 1 queued
check "13.2148 a lane's DONE is matched to its REVIEW line by SHA, not by branch (FIX 2, F5): a FIX round, lane 3 idle, clean, pushed, its last line \`DONE task/old3 cd34ef56aa\` (the FIX head) while the queue holds only the first round's \`REVIEW task/old3 ab12cd34…\` -> SKIP lane 3: DONE task/old3 cd34ef56 has no REVIEW line yet; the same lane with 1 shell -> SKIP 1 shells running (R1's exception needs THAT sha queued); no WOULD in either; CONTROL in the same check: the REVIEW line of cd34ef56aa… appended -> the lane takes KV4, with 0 shells and with 1" \
  'printf "%s" "$a" | grep -q "SKIP lane 3: DONE task/old3 cd34ef56 has no REVIEW line yet" && printf "%s" "$b" | grep -q "SKIP lane 3: 1 shells running" && ! printf "%s%s" "$a" "$b" | grep -q WOULD && printf "%s" "$c" | grep -q "WOULD start: lane 3 takes KG KV4" && would "start: lane 3 takes KG KV4"'
rung_row() { world; freelane 3; order "KV4 $1 docs/plan.md 2 task/kv4 path:packages/kg"; seat 10 weekly="$2"; }
rung_row H+ 10; ap; a=$out; rung_row L 10; ap; b=$out; rung_row H++ 86; ap; c=$out; rung_row H++ 50; aplive
check "13.2146 the order row's rung is the LAUNCH rung, as given (planner R2: the order file owns rung policy): an H+ row launches at opus/xhigh (not max), an L row at sonnet/medium; an H++ row is refused at weekly 86% (the budget guard); CONTROL in the same check: at weekly 50% the H++ row launches LIVE: make-lane-ptr gets --weekly 50 and writes \`RUNG: H++ (Opus/max)\`, ctl restart gets --model opus --effort max" \
  'printf "%s" "$a" | grep -q "WOULD start: lane 3 takes KG KV4 task/kv4 (plan task 2, RUNG H+ = the row.s launch rung): make-lane-ptr + restart --model opus --effort xhigh" && printf "%s" "$b" | grep -q "RUNG L = the row.s launch rung): make-lane-ptr + restart --model sonnet --effort medium" && printf "%s" "$c" | grep -q "SKIP lane 3 x KV4: budget: H++ needs weekly < 85% (is 86)" && ! printf "%s" "$c" | grep -q "WOULD start" && grep -q "^RUNG: H++ (Opus/max) = the order row" "$L/PTR-kv4-lane3.md" && grep -q "^restart 3 $T/wts/gisik-nokma-exec3 $L/PTR-kv4-lane3.md --model opus --effort max$" "$T/ctl.log"'

# ================================================================ 13.2134 the slot-hold warning
sw() { world; rm -rf "$T/sem"; mkdir -p "$T/sem/slot-1"; printf '4001|Sun Oct 4 05:40:06 2026 |mut-driver|%s\n' $((NOW - $1)) > "$T/sem/slot-1/holder"; printf '%s\n' "${@:2}" > "$T/ps.txt"
  out=$(CTL_SEM_DIR="$T/sem" CTL_AUTOPILOT_PS_CMD="cat $T/ps.txt" PATH="$T/shim:$PATH" python3 "$AP" once --shadow --no-fetch 2>&1); }
H='4001 1 bash /x/scripts/ctl/verbs/run-tests.sh --label mut-driver -- python3 m.py'; SUB='4002 4001 bash /x/scripts/ctl/verbs/run-tests.sh --label mut-driver -- python3 m.py'; WT='5001 1 bash /x/scripts/ctl/verbs/run-tests.sh --label lane2 -- pnpm vitest'
sw 660 "$H" "$SUB" "$WT"; a=$out; sw 601 "$H" "$WT"; b=$out; sw 600 "$H" "$WT"; c=$out; sw 3060 "$H" "$SUB"; d=$out
check "13.2134 WARN hold >10 min with waiters: a slot held 11 min (and 601 s) while another run-tests waits logs the WARN naming the slot, the label and the hold; CONTROL in the same check: exactly 600 s with a waiter, and 51 min with NO waiter (the holder's own subshell, which keeps its argv, is no waiter) log nothing" \
  'printf "%s" "$a" | grep -q "WARN hold >10 min with waiters: slot-1 .mut-driver. (pid 4001) held 11 min while 1 run(s) wait" && printf "%s" "$b" | grep -q "WARN hold >10 min" && ! printf "%s%s" "$c" "$d" | grep -q "WARN hold"'
# 13.2370: the EXPRESS slot (P72) — sw's slot-1 plus express-1 held $2 s by pid 5001 (and the express-slots FILE beside it, as live)
swx() { world; rm -rf "$T/sem"; mkdir -p "$T/sem/slot-1" "$T/sem/express-1"; printf '4001|Sun Oct 4 05:40:06 2026 |mut-driver|%s\n' $((NOW - $1)) > "$T/sem/slot-1/holder"
  printf '5001|Sun Oct 4 05:50:06 2026 |one-mutant|%s\n' $((NOW - $2)) > "$T/sem/express-1/holder"; echo 1 > "$T/sem/express-slots"; printf '%s\n' "${@:3}" > "$T/ps.txt"
  out=$(CTL_SEM_DIR="$T/sem" CTL_AUTOPILOT_PS_CMD="cat $T/ps.txt" PATH="$T/shim:$PATH" python3 "$AP" once --shadow --no-fetch 2>&1); }
XH='5001 1 bash /x/scripts/ctl/verbs/run-tests.sh --short --label one-mutant -- pnpm vitest'; W2='5002 1 bash /x/scripts/ctl/verbs/run-tests.sh --label lane2 -- pnpm vitest'
swx 660 20 "$H" "$XH"; a=$out; swx 660 20 "$H" "$XH" "$W2"; b=$out; swx 20 660 "$H" "$XH" "$W2"; c=$out
check "13.2370 an EXPRESS slot's holder (express-<n>/holder) is a holder, not a waiter: slot-1 held 11 min while the only other run-tests holds express-1 logs NO WARN; its own hold warns as a slot's does: express-1 held 11 min while a run waits logs the WARN naming express-1 (and none for a slot-1 held 20 s); CONTROL in the same check: the first state plus a real waiter (pid 5002, no holder) warns for slot-1 with 1 run waiting, not 2" \
  '! printf "%s" "$a" | grep -q "WARN hold" && printf "%s" "$b" | grep -q "WARN hold >10 min with waiters: slot-1 .mut-driver. (pid 4001) held 11 min while 1 run(s) wait" && printf "%s" "$c" | grep -q "WARN hold >10 min with waiters: express-1 .one-mutant. (pid 5001) held 11 min while 1 run(s) wait" && ! printf "%s" "$c" | grep -q "WARN hold >10 min with waiters: slot-1"'

# ================================================================ PULL protocol
world; freerev 9; echo "$R/BOOT-x.md" > "$R/PULL-B.boot"; echo boot > "$R/BOOT-x.md"; ap; a=$out; seat 9 box=text; ap; b=$out
world; freerev 9; echo "$R/BOOT-gone.md" > "$R/PULL-B.boot"; ap
check "13.2118 the PULL-<X>.boot protocol of the pull-restarter is kept: reviewer B idle, box empty, clean with PULL-B.boot -> WOULD pull: restart on that boot (opus/high), remove the file; a missing boot file -> drop it; CONTROL in the same check: B with text in its box -> WAIT, no pull (a shell is no reason: 13.2144)" \
  'printf "%s" "$a" | grep -q "WOULD pull: restart reviewer B gisik:9 on BOOT-x.md (opus/high), remove PULL-B.boot" && printf "%s" "$b" | grep -q "WAIT reviewer B PULL BOOT-x.md: box holds text" && ! printf "%s" "$b" | grep -q "WOULD pull" && would "drop PULL-B.boot: boot .*BOOT-gone.md missing"'

# ================================================================ 13.2117 SHADOW writes nothing, sends nothing
busy_world() { world; freelane 3; freelane 4; order 'KV4 M docs/plan.md 2 task/kv4 path:packages/kg'; item1 1; freerev 7; freerev 9
  echo "$R/BOOT-x.md" > "$R/PULL-B.boot"; echo boot > "$R/BOOT-x.md"; rq "09:11 REVIEW task/wg1 $WG1 base=origin/release/workflow-graph brief=PTR-w.md lane=1 (wg)"; }
snap() { ( cd "$L" && find . -type f | sort | while read -r p; do echo "$p $(shasum < "$p")"; done; G for-each-ref; G status --porcelain ) | shasum; }
shadow_clean() { busy_world; local a; a=$(snap); ap; [ "$(printf "%s\n" "$out" | grep -c WOULD)" -ge 4 ] && [ "$a" = "$(snap)" ] && [ ! -e "$T/ctl.log" ] && [ ! -e "$T/tmux.log" ] && [ -f "$R/PULL-B.boot" ]; }
live_acts() { busy_world; aplive; grep -q "^restart 3 $T/wts/gisik-nokma-exec3 $L/PTR-kv4-lane3.md --model sonnet --effort high" "$T/ctl.log" && grep -q "^restart 9 .*BOOT-x.md --model opus --effort high" "$T/ctl.log" \
  && grep -q "TOOK 09:10 task/rev1 ${REV1:0:8} (reviewer A, autopilot, FULL)" "$R/QUEUE-review.md" && [ ! -e "$R/PULL-B.boot" ] && grep -q "START	task/kv4" "$R/AUTOPILOT-ledger.tsv" && grep -q "^RUNG: M (Sonnet/high) = the order row" "$L/PTR-kv4-lane3.md" && [ ! -e "$T/tmux.log" ]; }
check "13.2117 --shadow WRITES NOTHING AND SENDS NOTHING: a world with four actions due (a PULL, a review, a lane start, a second lane) logs ≥ 4 WOULD lines while the lanes root (every file, hashed), the repo's refs and status are unchanged, the stub ctl was never called, the tmux shim never called, and PULL-B.boot is still there; CONTROL in the same check: the SAME world live calls ctl restart for lane 3 (PTR from make-lane-ptr, the M row at sonnet/high) and reviewer B (its boot), appends reviewer A's TOOK, removes PULL-B.boot and writes the ledger — still with no raw tmux call" \
  'shadow_clean && live_acts'
mutant() { python3 -c 'import sys; s=open(sys.argv[1]).read(); assert s.count(sys.argv[2])==1, "anchor"; open(sys.argv[3],"w").write(s.replace(sys.argv[2],sys.argv[4]))' "$HERE/verbs/autopilot.py" "$1" "$T/mut.py" "$2"; }
check "13.2117 the shadow test can fail: a copy of autopilot.py whose door does not return under --shadow (\`if self.shadow:\` -> \`if False:\`) makes the shadow assertion go RED; CONTROL in the same check: the real file passes it through the same seam" \
  'mutant "        if self.shadow:" "        if False:" && ! AP="$T/mut.py" shadow_clean && AP="$HERE/verbs/autopilot.py" shadow_clean'

# ================================================================ make-lane-ptr
MLP="${CTL_MAKE_LANE_PTR:-$HERE/make-lane-ptr.py}"   # a mutant copy through the same checks (the mutation pass)
mlp() { python3 "$MLP" docs/plan.md "$@" --repo "$T/repo" --lanes-dir "$L" 2>&1; }
check "13.2123 make-lane-ptr: the RUNG header is the order row's LAUNCH rung as given, with its launch flags (L sonnet/medium, M sonnet/high, H+ opus/xhigh; planner R2: nothing is added), the plan task's heading, its line range at origin/<base>, its case range and the REVIEW line template; a rung not on the ladder is refused (FAIL, nothing written); CONTROL in the same check: the same call with M succeeds" \
  'world; o=$(mlp 2 M --lane 3 --branch task/kv4 --base release/knowledge-graph --print) && printf "%s" "$o" | head -1 | grep -q "^RUNG: M (Sonnet/high) = the order row.s launch rung (planner ruling R2, 14:07). Launched with .ctl restart --model sonnet --effort high." && printf "%s" "$o" | grep -q "TASK 2 - \"Two things (cases 99.003–99.009)\"" && printf "%s" "$o" | grep -q "\"### Task 2\" lines 12-14" && printf "%s" "$o" | grep -q "Re-grep case ids 99.003-99.009" && printf "%s" "$o" | grep -q "REVIEW task/kv4 <sha40> base=origin/release/knowledge-graph brief=PTR-kv4-lane3.md lane=3" && [ "$(mlp 2 L --lane 3 --branch task/a --base release/knowledge-graph --dry-run | grep -o "RUNG: .*")" = "RUNG: L sonnet medium (dry-run: nothing written)" ] && [ "$(mlp 2 H+ --lane 3 --branch task/a --base release/knowledge-graph --dry-run | grep -o "RUNG: .*")" = "RUNG: H+ opus xhigh (dry-run: nothing written)" ] && o=$(mlp 2 Q --lane 3 --branch task/a --base release/knowledge-graph); [ $? = 1 ] && printf "%s\n" "$o" | grep -qx "FAIL make-lane-ptr rung .Q. is not on L M H H+ H++" && [ -z "$(ls "$L" | grep PTR-)" ]'
check "13.2123 make-lane-ptr refuses what would make a vague brief: a task heading that is not in the plan or is there TWICE, a plan not on origin/<base>, a base that is not release/*; --dry-run writes nothing; a STACKED brief says so in its cut line and its REVIEW template's base; CONTROL in the same check: a real write lands one file and a second run never overwrites it (-2 suffix)" \
  'world; ! mlp 7 M --lane 3 --branch task/a --base release/knowledge-graph >/dev/null && mlp 7 M --lane 3 --branch task/a --base release/knowledge-graph | grep -q "found 0 times" && ! python3 "$MLP" docs/nope.md 2 M --lane 3 --branch task/a --base release/knowledge-graph --repo "$T/repo" --lanes-dir "$L" >/dev/null && ! mlp 2 M --lane 3 --branch task/a --base main >/dev/null && python3 "$MLP" docs/dup.md 1 M --lane 3 --branch task/a --base release/knowledge-graph --repo "$T/repo" --lanes-dir "$L" --print | grep -q "found 2 times" && mlp 2 M --lane 3 --branch task/a --base release/knowledge-graph --dry-run >/dev/null && [ -z "$(ls "$L" | grep PTR-)" ] && o=$(mlp 2 M --lane 3 --branch task/a --base release/knowledge-graph --stacked-on "task/kv2@$KV2" --print) && printf "%s" "$o" | grep -q "STACKED on task/kv2@$KV2" && printf "%s" "$o" | grep -q "base=origin/task/kv2@${KV2:0:8}" && mlp 2 M --lane 3 --branch task/a --base release/knowledge-graph >/dev/null && mlp 2 M --lane 3 --branch task/a --base release/knowledge-graph >/dev/null && [ -f "$L/PTR-a-lane3.md" ] && [ -f "$L/PTR-a-lane3-2.md" ]'
hpp() { o=$(mlp 2 "$1" --lane 3 --branch task/a --base release/knowledge-graph ${2:+--weekly $2} --dry-run); }
check "13.2147 make-lane-ptr writes H++ only under the budget guard (planner R2; ctl autopilot's own guard): H++ with no --weekly (unknown), --weekly 86 and --weekly 85 -> exactly \`FAIL make-lane-ptr rung H++ needs --weekly below 85 (is …): the budget guard\`, nothing written; CONTROL in the same check: --weekly 84 and 50 -> RUNG: H++ opus max, and H+ at --weekly 86 is written (the guard is H++ only)" \
  'world; ( for wk in "" 86 85; do hpp H++ "$wk"; [ $? = 1 ] && [ "$o" = "FAIL make-lane-ptr rung H++ needs --weekly below 85 (is ${wk:-unknown}): the budget guard" ] || exit 1; done ) && [ -z "$(ls "$L" | grep PTR-)" ] && hpp H++ 84 && printf "%s" "$o" | grep -q "RUNG: H++ opus max (dry-run: nothing written)$" && hpp H++ 50 && printf "%s" "$o" | grep -q "RUNG: H++ opus max (dry-run" && hpp H+ 86 && printf "%s" "$o" | grep -q "RUNG: H+ opus xhigh (dry-run"'

# ================================================================ wiring, loop lock
STEP='^step "autopilot suite '
check "13.2124 wiring: selftest runs this suite as a live step (CONTROL: the pattern rejects a commented-out step); \`ctl help\` lists autopilot and prune-gate-locks; \`ctl autopilot start --dry-run\` prints the tmux window line it would open and opens nothing" \
  '/usr/bin/grep -Eq "$STEP" "$HERE/verbs/selftest.sh" && ! printf "%s\n" "# step \"autopilot suite x\"" | /usr/bin/grep -Eq "$STEP" && "$CTL" help | grep -q "^  autopilot " && "$CTL" help | grep -q "^  prune-gate-locks " && o=$(PATH="$T/shim:$PATH" "$CTL" autopilot start --shadow --dry-run 2>&1) && printf "%s" "$o" | grep -q "DRY: tmux new-window -d -t gisik -n autopilot .*autopilot run --shadow" && [ ! -e "$T/tmux.log" ]'
loop_lock() { world; mkdir -p "$T/logs/autopilot.lock.d"; sleep 30 & local p=$!; echo $p > "$T/logs/autopilot.lock.d/pid"
  local o; o=$(python3 "$AP" run --shadow --no-fetch --interval 1 2>&1); local rc=$?; kill $p 2>/dev/null; wait $p 2>/dev/null
  [ "$rc" = 1 ] && printf "%s" "$o" | grep -q "FAIL autopilot another loop runs (pid $p" || return 1
  python3 "$AP" run --shadow --no-fetch --interval 1 > "$T/loop.out" 2>&1 & local lp=$!; sleep 3; kill $lp 2>/dev/null; wait $lp 2>/dev/null
  grep -q "WARN autopilot stale lock of dead pid $p taken over" "$T/loop.out" && grep -q "OK autopilot pass" "$T/loop.out"; }
check "13.2125 ONE loop at a time (mkdir lock + pid, no flock on macOS): \`run\` refuses while the lock's pid is alive; CONTROL in the same check: once that pid is dead the lock is taken over (WARN) and passes run" 'loop_lock'

ctl_test_only_end autopilot.test.sh
[ "$fails" -eq 0 ] && { echo "autopilot tests: all ok"; exit 0; } || { echo "autopilot tests: $fails FAILED"; exit 1; }
