#!/usr/bin/env bash
# scripts/ctl/test/autopilot.test.sh — cases 13.2106-13.2131 for `ctl autopilot` and scripts/ctl/make-lane-ptr.py; run by `ctl selftest`.
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
check() { if eval "$2"; then echo "  ok   $1"; else echo "  FAIL $1"; fails=$((fails+1)); [ -z "${AP_DEBUG:-}" ] || printf '%s\n' "${out:-}" | sed 's/^/    | /'; fi; }
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
# /usr/bin/grep, never the PATH `grep` (ugrep on this machine: its -E did not match a literal "(on origin/…)" group, 2026-10-04)
would() { printf '%s\n' "$out" | /usr/bin/grep -E "WOULD $1" >/dev/null; }
said() { printf '%s\n' "$out" | /usr/bin/grep -F -- "$1" >/dev/null; }
nowould() { ! printf '%s\n' "$out" | grep -q "WOULD"; }
# a REVIEW item for task/rev1 at its origin head (lane 1 = WG pool by default seat config? no: lane= decides the pool; 3 = KG)
item1() { rq "09:10 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-rev1.md lane=${1:-1} handoff=HANDOFF-rev1.md (rev one)"; }

# ================================================================ 13.2106 the REAL queue's shapes
world
cat > "$R/QUEUE-review.md" <<EOF
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
check "13.2106 the real queue's shapes parse: three REVIEW lines sharing 08:17 stay three items, a TOOK closes only the one whose branch+sha8 it names, the 08:30 line SUPERSEDES the older sha of the same branch, a DONE that names no branch (\`DONE 08:56 needs-tip …\`) closes nothing on its own, a NOTE preflight line is not an item; the TOOK of reviewer C (no DONE) is still HELD, reviewer A's TOOK is released by its DONE citing 08:56; CONTROL in the same check: deleting the 08:18 TOOK reopens task/kv2" \
  '[ "$(printf "%s\n" "$P" | grep ^OPEN)" = "OPEN 08:17:task/rev1:${REV1:0:8} 08:30:task/rev2:${REV2:0:8}" ] && [ "$(printf "%s\n" "$P" | grep ^HELD)" = "HELD reviewer C:08:17:task/kv2" ] && sed -i "" "/08:18 TOOK/d" "$R/QUEUE-review.md" && parsed | grep ^OPEN | grep -q "08:17:task/kv2:${KV2:0:8}"'
cp "$HERE/test/fixtures/autopilot/QUEUE-review-2026-10-04.md" "$R/QUEUE-review.md" 2>/dev/null
check "13.2106 the frozen live QUEUE-review.md (2026-10-04 09:20, fixtures/autopilot/) yields exactly the hand-checked open set: nothing but task/kg-tl2-projection a6330eb3 (09:14, FIX 1 delta addressed to reviewer B) and task/ctl-postman-followup 6ff89c41 is TAKEN (09:08 TOOK by reviewer A); held TOOKs = reviewer A 09:04 postman, reviewer C 09:19 kg-home-t2-brand" \
  '[ "$(parsed | grep ^OPEN)" = "OPEN 09:14:task/kg-tl2-projection:a6330eb3" ] && parsed | grep ^HELD | grep -q "reviewer A:09:04:task/ctl-postman-followup" && parsed | grep ^HELD | grep -q "reviewer C:09:19:task/kg-home-t2-brand"'

# ================================================================ guards on reviewers
world; item1; freerev 7; seat 7 state=busy; ap; a=$out; world; item1; freerev 7; ap
check "13.2107 a BUSY reviewer seat is not restarted: reviewer A busy with an open item waiting -> no WOULD for it (SKIP reviewer A: state busy); CONTROL in the same check: the same world with A idle -> WOULD review: A takes task/rev1" \
  'printf "%s" "$a" | grep -q "SKIP reviewer A: state busy" && ! printf "%s" "$a" | grep -q "WOULD review: A" && would "review: A gisik:7 takes 09:10 task/rev1"'
world; item1; freerev 7 shells=1; ap; a=$out; world; item1; freerev 7 box=text; ap; b=$out; world; item1; freerev 7 copy_mode=true; ap; c2=$out
check "13.2107 an idle reviewer with a background shell, text in its box, or in copy mode is not restarted either (three worlds); CONTROL: the clean idle world above took the item" \
  'printf "%s" "$a" | grep -q "SKIP reviewer A: 1 shells running" && printf "%s" "$b" | grep -q "SKIP reviewer A: box holds text" && printf "%s" "$c2" | grep -q "SKIP reviewer A: copy-mode" && ! printf "%s%s%s" "$a" "$b" "$c2" | grep -q "WOULD review: A"'
world; item1; rq "09:12 TOOK 09:00 task/zzz 12345678 (reviewer A, pull, FULL)"; freerev 7; ap; a=$out
rq "09:20 DONE 09:00 READY task/zzz 12345678 (reviewer A; REVIEW-zzz.md)"; ap
check "13.2116 an IDLE reviewer that holds an open TOOK (its verdict not yet DONE: it may be waiting on a Monitor mid-review) is not restarted; CONTROL in the same check: once its DONE citing that REVIEW time lands, it takes the next item" \
  'printf "%s" "$a" | grep -q "SKIP reviewer A: holds an open TOOK (09:00 task/zzz)" && ! printf "%s" "$a" | grep -q "WOULD review: A" && would "review: A gisik:7 takes 09:10 task/rev1"'

# ================================================================ guards on lanes
world; freelane 3; seat 3 dirty=2; ap; a=$out; world; freelane 3; ap
check "13.2108 a DIRTY lane is not restarted: lane 3 idle with its DONE queued but dirty 2 -> SKIP lane 3: dirty 2, no WOULD start; CONTROL in the same check: the same lane clean -> WOULD start: lane 3 takes KG KV4" \
  'printf "%s" "$a" | grep -q "SKIP lane 3: dirty 2" && ! printf "%s" "$a" | grep -q "WOULD start: lane 3" && would "start: lane 3 takes KG KV4 task/kv4 .plan task 2, RUNG H = table M \\+ 1."'
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
world; rq "23:00 REVIEW task/rev1 $REV1 base=origin/release/knowledge-graph brief=PTR-rev1.md lane=1 (yesterday, later)" "08:00 NOTE the next day"; freerev 7; ap
check "13.2129 an item OLDER than 12 h is the controller's call, never a pull: a 21:00 line followed by the next day's 08:00 line is 13 h old at 10:00 (the queue has no dates: a time > 6 h below the previous line's is the next day) -> skipped; CONTROL in the same check: a 23:00 line (11 h old) is taken" \
  'printf "%s" "$a" | grep -q "SKIP reviewer A x task/rev1 ${REV1:0:8}: older than 12 h (13 h)" && ! printf "%s" "$a" | grep -q WOULD && printf "%s" "$c7" | grep -q "older than 12 h (12 h)" && printf "%s" "$b" | grep -q "WOULD review: A gisik:7 takes 22:00 task/rev1" && would "review: A gisik:7 takes 23:00 task/rev1"'

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

# ================================================================ budget, one-per-pass, no block
world; freelane 3; seat 10 weekly=96; ap; a=$out; world; freelane 3; order 'KV4 H+ docs/plan.md 2 task/kv4 path:packages/kg'; seat 10 weekly=86; ap; b=$out
world; freelane 3; order 'KV4 H+ docs/plan.md 2 task/kv4 path:packages/kg'; seat 10 weekly=null; ap; c6=$out
world; freelane 3; seat 10 weekly=95; ap; d=$out; world; freelane 3; order 'KV4 H+ docs/plan.md 2 task/kv4 path:packages/kg'; seat 10 weekly=85; ap; e=$out
world; freelane 3; seat 10 weekly=94; ap; f=$out
world; freelane 3; order 'KV4 H+ docs/plan.md 2 task/kv4 path:packages/kg'; seat 10 weekly=84; ap
check "13.2120 BUDGET: weekly 96% -> no lane launch at all; weekly 86% -> no H++ launch (table H+ + 1), and weekly unknown -> no H++ either; CONTROL in the same check: weekly 84% launches the H++ task with opus/max" \
  'printf "%s" "$a" | grep -q "budget: weekly 96% >= 95" && printf "%s" "$b" | grep -q "budget: H++ needs weekly < 85% (is 86)" && printf "%s" "$c6" | grep -q "budget: H++ needs weekly < 85% (is unknown)" && printf "%s" "$d" | grep -q "budget: weekly 95% >= 95" && printf "%s" "$e" | grep -q "is 85)" && ! printf "%s%s%s%s%s" "$a" "$b" "$c6" "$d" "$e" | grep -q "WOULD start" && printf "%s" "$f" | grep -q "WOULD start: lane 3 takes KG KV4" && would "start: lane 3 takes KG KV4 task/kv4 .plan task 2, RUNG H\\+\\+ = table H\\+ \\+ 1.: make-lane-ptr \\+ restart --model opus --effort max"'
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
world; freelane 3; order 'KV4 M docs/plan.md 2 task/kv4 path:packages/kg'; printf 'Branch `task/kv4` cut from origin/release/knowledge-graph\n' > "$L/PTR-kv4-by-hand.md"; ap; b=$out
world; freelane 3; order 'KV4 M docs/plan.md 2 task/kv4 path:packages/kg'; rq "09:05 REVIEW task/kv4 $REV1 base=origin/release/knowledge-graph brief=PTR-k.md lane=4 (deleted branch, line left)"; ap; c9=$out
world; freelane 3; order 'KV4 M docs/plan.md 2 task/kv4 path:packages/kg'; seat 4 branch=task/kv4; ap; d=$out
world; freelane 3; order 'KV4 M docs/plan.md 2 task/kv4 path:packages/kg'; printf '%s\t09:00\t4\tSTART\ttask/kv4\tKV4\n' $((NOW - 3600)) > "$R/AUTOPILOT-ledger.tsv"; ap; e=$out
check "13.2126 a row already TAKEN is not started, each leg alone: its branch is on origin; a hand-written PTR from the last 24 h names it (the controller started it by hand); it has a REVIEW line; a seat is on it; the ledger shows the autopilot started it; CONTROL: the plain world starts it (13.2108)" \
  '( for o in "$a" "$b" "$c9" "$d" "$e"; do printf "%s" "$o" | grep -q "WOULD start" && exit 1; done; exit 0 )'

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

# ================================================================ PULL protocol
world; freerev 9; echo "$R/BOOT-x.md" > "$R/PULL-B.boot"; echo boot > "$R/BOOT-x.md"; ap; a=$out; seat 9 shells=1; ap; b=$out
world; freerev 9; echo "$R/BOOT-gone.md" > "$R/PULL-B.boot"; ap
check "13.2118 the PULL-<X>.boot protocol of the pull-restarter is kept: reviewer B idle, box empty, 0 shells with PULL-B.boot -> WOULD pull: restart on that boot (opus/high), remove the file; a missing boot file -> drop it; CONTROL in the same check: B with a shell running -> WAIT, no pull" \
  'printf "%s" "$a" | grep -q "WOULD pull: restart reviewer B gisik:9 on BOOT-x.md (opus/high), remove PULL-B.boot" && printf "%s" "$b" | grep -q "WAIT reviewer B PULL BOOT-x.md: 1 shells running" && ! printf "%s" "$b" | grep -q "WOULD pull" && would "drop PULL-B.boot: boot .*BOOT-gone.md missing"'

# ================================================================ 13.2117 SHADOW writes nothing, sends nothing
busy_world() { world; freelane 3; freelane 4; order 'KV4 M docs/plan.md 2 task/kv4 path:packages/kg'; item1 1; freerev 7; freerev 9
  echo "$R/BOOT-x.md" > "$R/PULL-B.boot"; echo boot > "$R/BOOT-x.md"; rq "09:11 REVIEW task/wg1 $WG1 base=origin/release/workflow-graph brief=PTR-w.md lane=1 (wg)"; }
snap() { ( cd "$L" && find . -type f | sort | while read -r p; do echo "$p $(shasum < "$p")"; done; G for-each-ref; G status --porcelain ) | shasum; }
shadow_clean() { busy_world; local a; a=$(snap); ap; [ "$(printf "%s\n" "$out" | grep -c WOULD)" -ge 4 ] && [ "$a" = "$(snap)" ] && [ ! -e "$T/ctl.log" ] && [ ! -e "$T/tmux.log" ] && [ -f "$R/PULL-B.boot" ]; }
live_acts() { busy_world; aplive; grep -q "^restart 3 $T/wts/gisik-nokma-exec3 $L/PTR-kv4-lane3.md --model opus --effort high" "$T/ctl.log" && grep -q "^restart 9 .*BOOT-x.md --model opus --effort high" "$T/ctl.log" \
  && grep -q "TOOK 09:10 task/rev1 ${REV1:0:8} (reviewer A, autopilot, FULL)" "$R/QUEUE-review.md" && [ ! -e "$R/PULL-B.boot" ] && grep -q "START	task/kv4" "$R/AUTOPILOT-ledger.tsv" && grep -q "^RUNG: H (Opus/high)" "$L/PTR-kv4-lane3.md" && [ ! -e "$T/tmux.log" ]; }
check "13.2117 --shadow WRITES NOTHING AND SENDS NOTHING: a world with four actions due (a PULL, a review, a lane start, a second lane) logs ≥ 4 WOULD lines while the lanes root (every file, hashed), the repo's refs and status are unchanged, the stub ctl was never called, the tmux shim never called, and PULL-B.boot is still there; CONTROL in the same check: the SAME world live calls ctl restart for lane 3 (PTR from make-lane-ptr, opus/high) and reviewer B (its boot), appends reviewer A's TOOK, removes PULL-B.boot and writes the ledger — still with no raw tmux call" \
  'shadow_clean && live_acts'
mutant() { python3 -c 'import sys; s=open(sys.argv[1]).read(); assert s.count(sys.argv[2])==1, "anchor"; open(sys.argv[3],"w").write(s.replace(sys.argv[2],sys.argv[4]))' "$HERE/verbs/autopilot.py" "$1" "$T/mut.py" "$2"; }
check "13.2117 the shadow test can fail: a copy of autopilot.py whose door does not return under --shadow (\`if self.shadow:\` -> \`if False:\`) makes the shadow assertion go RED; CONTROL in the same check: the real file passes it through the same seam" \
  'mutant "        if self.shadow:" "        if False:" && ! AP="$T/mut.py" shadow_clean && AP="$HERE/verbs/autopilot.py" shadow_clean'

# ================================================================ make-lane-ptr
MLP="$HERE/make-lane-ptr.py"
mlp() { python3 "$MLP" docs/plan.md "$@" --repo "$T/repo" --lanes-dir "$L" 2>&1; }
check "13.2123 make-lane-ptr: the RUNG header is the table rung + 1 with its launch flags (L->M sonnet/high, M->H opus/high, H->H+ opus/xhigh, H+->H++ opus/max), the plan task's heading, its line range at origin/<base>, its case range and the REVIEW line template; table H++ is refused (FAIL, nothing written); CONTROL in the same check: the same call with M succeeds" \
  'world; o=$(mlp 2 M --lane 3 --branch task/kv4 --base release/knowledge-graph --print) && printf "%s" "$o" | head -1 | grep -q "^RUNG: H (Opus/high) = table M + 1" && printf "%s" "$o" | grep -q "TASK 2 - \"Two things (cases 99.003–99.009)\"" && printf "%s" "$o" | grep -q "\"### Task 2\" lines 12-14" && printf "%s" "$o" | grep -q "Re-grep case ids 99.003-99.009" && printf "%s" "$o" | grep -q "REVIEW task/kv4 <sha40> base=origin/release/knowledge-graph brief=PTR-kv4-lane3.md lane=3" && [ "$(mlp 2 L --lane 3 --branch task/a --base release/knowledge-graph --dry-run | grep -o "RUNG: .*")" = "RUNG: M sonnet high (dry-run: nothing written)" ] && [ "$(mlp 2 H+ --lane 3 --branch task/a --base release/knowledge-graph --dry-run | grep -o "RUNG: .*")" = "RUNG: H++ opus max (dry-run: nothing written)" ] && o=$(mlp 2 H++ --lane 3 --branch task/a --base release/knowledge-graph); [ $? = 1 ] && printf "%s" "$o" | grep -q "^FAIL make-lane-ptr table rung" && [ -z "$(ls "$L" | grep PTR-)" ]'
check "13.2123 make-lane-ptr refuses what would make a vague brief: a task heading that is not in the plan, a plan not on origin/<base>, a base that is not release/*; --dry-run writes nothing; a STACKED brief says so in its cut line and its REVIEW template's base; CONTROL in the same check: a real write lands one file and a second run never overwrites it (-2 suffix)" \
  'world; ! mlp 7 M --lane 3 --branch task/a --base release/knowledge-graph >/dev/null && mlp 7 M --lane 3 --branch task/a --base release/knowledge-graph | grep -q "found 0 times" && ! python3 "$MLP" docs/nope.md 2 M --lane 3 --branch task/a --base release/knowledge-graph --repo "$T/repo" --lanes-dir "$L" >/dev/null && ! mlp 2 M --lane 3 --branch task/a --base main >/dev/null && mlp 2 M --lane 3 --branch task/a --base release/knowledge-graph --dry-run >/dev/null && [ -z "$(ls "$L" | grep PTR-)" ] && o=$(mlp 2 M --lane 3 --branch task/a --base release/knowledge-graph --stacked-on "task/kv2@$KV2" --print) && printf "%s" "$o" | grep -q "STACKED on task/kv2@$KV2" && printf "%s" "$o" | grep -q "base=origin/task/kv2@${KV2:0:8}" && mlp 2 M --lane 3 --branch task/a --base release/knowledge-graph >/dev/null && mlp 2 M --lane 3 --branch task/a --base release/knowledge-graph >/dev/null && [ -f "$L/PTR-a-lane3.md" ] && [ -f "$L/PTR-a-lane3-2.md" ]'

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

[ "$fails" -eq 0 ] && { echo "autopilot tests: all ok"; exit 0; } || { echo "autopilot tests: $fails FAILED"; exit 1; }
