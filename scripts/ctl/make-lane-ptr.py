#!/usr/bin/env python3
"""make-lane-ptr.py <plan> <task> <rung> --lane N --branch B --base release/<x> [options] — write a lane's PTR brief for one plan
task, in the shape of the orchestrator's hand-written ones (PTR-kg-kv2-lane3.md, 2026-10-04), for `ctl autopilot` (and by hand).

  <plan>   the plan file, repo-relative (read AT origin/<base> with `git show`, never from a worktree)
  <task>   the plan's task number as its heading has it: `### Task <task>:` (2, 5b, ...)
  <rung>   the TABLE rung (QUEUE-*-order.md / TIERS-model-effort.md): L M H H+. The PTR runs at the EFFECTIVE rung = table + 1
           (owner order 2026-10-04 06:5x); H++ has no rung above it and is refused (a flag for the planner, never a launch).
  --lane N --branch B --base release/<x>   the seat, the task branch to cut, the release it is cut from
  --id ID --queue FILE --needs TEXT       the order-file row this came from (shown in the brief)
  --stacked-on BRANCH@SHA                 cut from that unlanded branch instead (fluid rule A.3, at most 2 levels; header `STACKED on`)
  --pool KG|WG  --worktree DIR  --repo R  --lanes-dir L  --out FILE
  --dry-run   write nothing: print the path it would write and the rung line
  --print     write nothing: print the whole brief

Prints `<path> <bytes> bytes RUNG: <eff> <model> <effort>` on success; `FAIL make-lane-ptr <why>` and exit 1 when the plan, the task
heading or the rung cannot be resolved (a missing heading must never become a vague brief).
"""
import argparse, os, re, subprocess, sys, time

LADDER = ["L", "M", "H", "H+", "H++"]
LAUNCH = {"L": ("sonnet", "medium"), "M": ("sonnet", "high"), "H": ("opus", "high"), "H+": ("opus", "xhigh"), "H++": ("opus", "max")}
SECTIONS = ("Global Constraints", "Review Focus", "File structure", "Planner rulings")


def effective(table):
    """The rung a task launches at: one above its table rung. None for H++ (and for anything not on the ladder)."""
    if table not in LADDER or table == LADDER[-1]: return None
    return LADDER[LADDER.index(table) + 1]


def fail(why):
    print(f"FAIL make-lane-ptr {why}"); sys.exit(1)


def plan_lines(repo, base, plan):
    out = subprocess.run(["/usr/bin/git", "-C", repo, "show", f"origin/{base}:{plan}"], capture_output=True, text=True,
                         env=dict(os.environ, GIT_OPTIONAL_LOCKS="0"))
    if out.returncode != 0: fail(f"{plan} is not on origin/{base} ({out.stderr.strip()[:120]})")
    return out.stdout.split("\n")


def locate(lines, task):
    """(start, end, title, cases) of `### Task <task>:` — 1-based, end = the line before the next ### Task / ## heading."""
    head = re.compile(r"^### Task " + re.escape(task) + r"(?::|\s|$)")
    starts = [i for i, l in enumerate(lines) if head.match(l)]
    if len(starts) != 1: fail(f"`### Task {task}` found {len(starts)} times in the plan (need exactly one)")
    s = starts[0]
    e = next((i for i in range(s + 1, len(lines)) if lines[i].startswith("### Task ") or lines[i].startswith("## ")), len(lines))
    title = re.sub(r"^### Task " + re.escape(task) + r":?\s*", "", lines[s]).strip()
    m = re.search(r"\(cases? ([0-9]+\.[0-9]+)\s*[–-]\s*([0-9]+\.[0-9]+)\)", title)
    return s + 1, e, title, (f"{m.group(1)}-{m.group(2)}" if m else None)


def sections(lines):
    found = []
    for i, l in enumerate(lines):
        if l.startswith("## ") and any(l[3:].strip().lower().startswith(k.lower()) for k in SECTIONS):
            found.append(f'"{l.strip()}" (line {i + 1})')
    return found


def main(argv):
    ap = argparse.ArgumentParser()
    ap.add_argument("plan"); ap.add_argument("task"); ap.add_argument("rung")
    ap.add_argument("--lane", required=True, type=int); ap.add_argument("--branch", required=True); ap.add_argument("--base", required=True)
    ap.add_argument("--id", default=None); ap.add_argument("--queue", default=None); ap.add_argument("--needs", default=None)
    ap.add_argument("--stacked-on", default=None); ap.add_argument("--pool", default=None)
    ap.add_argument("--worktree", default=None); ap.add_argument("--repo", default=os.getcwd())
    ap.add_argument("--lanes-dir", default=os.environ.get("CTL_LANES_DIR") or "/Users/kiro/my_projects/gisik-nokma-lanes")
    ap.add_argument("--out", default=None); ap.add_argument("--dry-run", action="store_true"); ap.add_argument("--print", action="store_true")
    a = ap.parse_args(argv)
    if not re.fullmatch(r"release/[A-Za-z0-9._-]+", a.base): fail(f"--base {a.base} is not release/<name>")
    if not re.fullmatch(r"task/[A-Za-z0-9._/-]+", a.branch): fail(f"--branch {a.branch} is not task/<name>")
    eff = effective(a.rung)
    if eff is None: fail(f"table rung {a.rung!r} has no rung above it on {' '.join(LADDER)} (H++ goes to the planner as a flag)")
    model, effort = LAUNCH[eff]
    stack = None
    if a.stacked_on:
        m = re.fullmatch(r"(task/[A-Za-z0-9._/-]+)@([0-9a-f]{7,40})", a.stacked_on)
        if not m: fail(f"--stacked-on {a.stacked_on} is not task/<branch>@<sha>")
        stack = (m.group(1), m.group(2))
    lines = plan_lines(a.repo, a.base, a.plan)
    s, e, title, cases = locate(lines, a.task)
    L = a.lanes_dir.rstrip("/")
    name = a.branch[len("task/"):].replace("/", "-")
    wt = a.worktree or f"/Users/kiro/my_projects/gisik-nokma-exec{a.lane}"
    out = a.out or os.path.join(L, f"PTR-{name}-lane{a.lane}.md")
    if not a.out:
        n = 2
        while os.path.exists(out): out = os.path.join(L, f"PTR-{name}-lane{a.lane}-{n}.md"); n += 1
    ptr = os.path.basename(out)
    short = re.sub(r"\s*\(cases?[^)]*\)\s*$", "", title)
    row = f"{a.queue} row {a.id}" if a.queue and a.id else (f"row {a.id}" if a.id else "no order row")
    if stack:
        cut = (f"STACKED on {stack[0]}@{stack[1]} (its Needs are on that unlanded branch; fluid rule A.3, at most 2 unreviewed levels). "
               f"Branch `{a.branch}` cut from it: `git fetch && git switch -c {a.branch} {stack[1]}`, push -u. After the base lands, the "
               f"release tip is tip-merged into this branch before its own review.")
        review_base = f"origin/{stack[0]}@{stack[1][:8]}"
    else:
        cut = f"Branch `{a.branch}` cut from origin/{a.base} (`git fetch && git switch -c {a.branch} origin/{a.base}`, push -u). NOT stacked."
        review_base = f"origin/{a.base}"
    needs = (f"Needs ({a.needs}) were checked by ctl autopilot on the tips at {time.strftime('%H:%M')}. Step 0: re-check them yourself "
             f"(`git ls-tree origin/{a.base} <path>` / `git merge-base --is-ancestor`); a missing one is a `NEEDS:` STOP, which does not raise the rung.") \
        if a.needs else "Step 0: check the task's own Needs line against the tip; a missing dependency is a `NEEDS:` STOP (no rung raise)."
    pool = f" ({a.pool} pool)" if a.pool else ""
    first = sections(lines)
    reads = ", ".join([f"the header (lines 1-{min(s - 1, 22)})"] + first + [f'"### Task {a.task}" lines {s}-{e} (NOT the whole file)'])
    case_line = (f"Re-grep case ids {cases} on EVERY live origin tip (release/*, task/*) and say what it printed; " if cases else
                 "The heading names no case range: take the plan's ids, re-grepped on EVERY live origin tip (release/*, task/*); ")
    txt = f"""RUNG: {eff} ({model.capitalize()}/{effort}) = table {a.rung} + 1 (owner order 07:00). Launched with `ctl restart --model {model} --effort {effort}` by ctl autopilot. You are exec lane {a.lane} (window {a.lane}, worktree {wt}) on gisik-nokma, in a FRESH session{pool}. Task: {a.id or name} = {a.plan}, TASK {a.task} - "{title}", from {row}. {cut}
{needs}
Read in FULL first: {L}/STEPS-common-2026-10-03.md (PRE-REVIEW BATTERY, HANDOFF FILE, LIGHT TESTS PER TASK){', ' + L + '/' + a.queue if a.queue else ''}, and from {a.plan} AT origin/{a.base}: {reads}, plus the spec the plan cites. Do the steps exactly as written.
{case_line}catalogue lines go below your own task anchors only; Features.md + test-cases in the SAME change set; new cases start at ❌ and flip in the covering commit.
RULES: no AskUserQuestion (questions go to CTL-TO-PLANNER-notes.md as `⚑ QUESTION`); NO pkill/killall; EVERY test/build/typecheck only via {L}/slot-run.sh <label> -- <cmd> (Node 22; waiting for a slot is normal); never `| head`; HARD RULE #23: no Docker stack; no raw tmux send-keys. Each step ends with a pushed commit and `CHECKPOINT {a.branch} <sha40> step n/N`.
LIGHT TESTS per task (STEPS-common): the affected test files + the case ids above + census/catalogue checks; NO whole-package or whole-repo run.
PRE-REVIEW BATTERY before DONE (STEPS-common), quoting every result: typecheck on EVERY tsconfig incl. e2e; the affected suites + check:tasks + check:citations + every check:* the diff touches; your SELF-MUTATION pass item by item against {L}/roles/CARD-reviewer-current.md sections 8 and Q (delete the guard, invert, +-1; a multi-leg test: one leg at a time), red/green list; the PROSE SWEEP; `bash scripts/ctl/ctl check-base {a.branch} {a.base}` must print `OK check-base`.
HANDOFF: then write {L}/HANDOFF-{name}.md (10-25 lines: branch, sha, base{', STACKED on ' + stack[0] + '@' + stack[1][:8] if stack else ''}; what changed by file; the battery QUOTED; the mutants and their kills; the case ids; risks). The reviewer reads it first.
DONE: print `DONE {a.branch} <sha40> RUNG: {eff}` and APPEND ONE line to {L}/roles/QUEUE-review.md (`HH:MM REVIEW {a.branch} <sha40> base={review_base} brief={ptr} lane={a.lane} handoff=HANDOFF-{name}.md ({a.id + ': ' if a.id else ''}{short[:60]})`); printing it is not enough. Then STOP.
"""
    if a.print:
        sys.stdout.write(txt); return 0
    if not a.dry_run:
        with open(out, "x", encoding="utf-8") as f: f.write(txt)
    print(f"{out} {len(txt.encode())} bytes RUNG: {eff} {model} {effort}{' (dry-run: nothing written)' if a.dry_run else ''}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
