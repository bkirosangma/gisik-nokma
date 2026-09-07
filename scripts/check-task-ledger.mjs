#!/usr/bin/env node
// The task ledger gate: every task in every plan has exactly one ledger row,
// and every row claiming to be finished names a merge commit that is actually
// reachable from origin/main. Fails naming the drifting rows and where they live.
//
// WHY THIS EXISTS
// ---------------
// Until now nothing in this repo tracked task-level completion. Step counts
// were tracked (docs/lanes/executor-state.md), but a step is a batch of tasks,
// so "43% through 177 tasks" was reconstructed by hand every session from
// whatever prose was nearest. Two failures follow from that and both happened:
//   * the denominator itself was uncertain -- 167 and 177 were both recorded as
//     "the total", and neither was derived by a checked instrument;
//   * completion was inferred from commit and PR titles, which this repo has
//     already established are unreliable (four different formats in the merged
//     set: "Plan 4 Tasks 6-7", "Plan 3 Chain A (T3-T8)", "Plan 6 T6", "Plan 2:").
//
// So the split here is deliberate: the DENOMINATOR is derived mechanically from
// the plan files on every run and can never be hand-typed, while the NUMERATOR
// is hand-asserted in the ledger and machine-validated against git. Status is
// never inferred from a commit message.
//
// WHY THE DENOMINATOR NEEDS A POSITIVE CONTROL
// --------------------------------------------
// The reader below is awk-free JS, but the instrument that first counted these
// tasks was `grep -cE '^#+ *Task '` and it returned BLANK -- not 0 -- for
// plans 08 and 11, both of which contain "very long lines". A silent blank from
// a search tool is this repo's most-repeated failure, and a tracker whose
// denominator can quietly become 0 reports 0/0 = clean forever. So PLANS_WITH_TASKS
// asserts that every numbered plan yields at least one task, and CONTROL_PLANS
// names the two that actually failed before. A reader that stops matching fails
// loudly here instead of reporting an empty backlog.
//
// The coordination doc is listed separately and asserted to yield EXACTLY zero.
// 0-by-design and 0-because-the-reader-broke must be distinguishable on the face
// of the report, so it prints as an explicit `0` row and never as a blank line.
//
// WHY `done` IS VALIDATED AGAINST A COMMIT REACHABLE FROM origin/main
// -------------------------------------------------------------------
// The check is `git merge-base --is-ancestor <sha> origin/main`, and the sha is
// whichever commit put this task's work on main. That is deliberately looser
// than "the PR's merge commit", and the reason is a correction:
//
// CORRECTED 2026-09-02. This header used to say "This repo squash-merges" and
// justified recording the PR's merge commit on that basis. That is true from
// #51 onward and FALSE of #3, #4 and #13 -- the PRs behind 30 of the ledger's
// rows -- which were REBASE-merged. Two consequences the old text got wrong:
//
//   1. Under a rebase-merge, GitHub sets the PR's mergeCommit to the LAST
//      commit of the replayed chain. For #3 that commit touches 3 files and for
//      #4 exactly 1, both documentation. Recording it satisfies the ancestry
//      check while pointing at a commit that contains none of the work, so an
//      auditor who opens the sha's diff concludes the row was fabricated.
//   2. Do NOT infer merge style from "how many branch commits are ancestors of
//      main". A rebase that replays commits rewrites their shas and reports 0/N,
//      exactly like a squash. #3 and #4 report 28/28 and 22/22 only because
//      those rebases were fast-forwards. The instrument that answers reliably is
//      `gh api repos/<o>/<r>/commits/<sha>/pulls`, which names the owning PR
//      regardless of merge style.
//
// So the rule, stated once and covering both merge styles: record THE COMMIT
// THAT INTRODUCED THIS TASK'S DECLARED ARTEFACT TO main, confirmed to belong to
// this task's PR. Under a squash that is the merge sha; under a rebase it is a
// distinct commit inside the chain. Recording a raw implementing sha from an
// unmerged branch still false-REDs, and the ancestry check still catches it.
//
// WHAT COUNTS AS EVIDENCE (widened by owner ruling, 2026-09-02)
// -------------------------------------------------------------
// `done` originally required "a PR NAMING that exact plan+task". Measured: the
// bodies of #3 and #4 name none of their own 28 tasks -- every task-shaped
// string in them refers to another plan -- so that definition promoted zero
// rows whose work had demonstrably shipped. The owner widened it to artefact
// evidence: the commit above, identified from the task's own `Files:` block.
// One row (02/T7) declares no artefact and is evidenced by subject plus
// position; its note says so, because a weaker basis must not read as a
// stronger one.
//
// origin/main, not main, and not `git cat-file`: worktrees share one object
// store, so an unpushed commit from a sibling worktree resolves fine with
// cat-file and reads as landed. Reachability from the REMOTE ref is the only
// form of the question that a local-only commit fails.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLANS_DIR = join(REPO_ROOT, 'docs/superpowers/plans');
const LEDGER = join(REPO_ROOT, 'docs/lanes/task-ledger.tsv');

// Every numbered plan must yield at least one task. A plan that reads as empty
// means the heading reader drifted, not that the plan has no work in it.
const PLANS_WITH_TASKS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11',
  // Keyed by slug, not by a number, because it is not part of the retired series.
  // Listed here so an empty read of it FAILS rather than reporting no backlog --
  // which is exactly what this gate did until 2026-09-08.
  'mcp-server'];
// The two plans a grep-based reader silently returned nothing for. Named
// explicitly so the control is on the fact that actually broke, not on a
// neighbouring one that happens to be in the same directory.
const CONTROL_PLANS = ['08', '11'];
// Carries no tasks of its own by design. Asserted to be exactly 0 so that a
// reader returning nothing everywhere cannot pass by looking like this row.
const PLAN_WITHOUT_TASKS = '00';

const STATUSES = new Set(['done', 'claimed', 'in-flight', 'todo']);
// `done` is the only status that asserts the work is on main, so it is the only
// one that must name evidence. `claimed` may carry evidence -- and it is
// validated the same way when present -- but its point is that the task-level
// mapping was never audited, so it must NOT be counted as finished.
//
// `claimed` is EMPTY as of 2026-09-02, and keeping the status is deliberate:
// all 33 rows were audited, 32 promoted on artefact evidence and one (11/T6)
// DEMOTED to `todo` because its artefact (docker-compose.dev.yml) was never
// added to main at all. That one row is the whole justification for the split
// existing -- a `claimed` row concealing work that had not shipped, which no
// count of merged PRs would ever have surfaced. Do not remove the status
// because it currently reads zero; it is the landing place for the next
// plan-granularity assertion, and zero is the value it is supposed to hold.
const REQUIRES_EVIDENCE = new Set(['done']);

const fail = [];
const note = (section, rows) => fail.push({ section, rows });

// ---------------------------------------------------------------- denominator
// One entry per `### Task N:` heading, keyed `<plan>/<task>`. Task ids carry an
// optional letter (4a, 12c) -- ten of the 177 do -- so the id is kept as text
// and never coerced to a number.
//
// DO NOT ADD FENCED-CODE-BLOCK STRIPPING HERE. It is the obvious next thought --
// these plans are mostly code, so a quoted `### Task N:` inside an example would
// inflate the count -- and it was tried and measured. Toggling `inFence` on
// /^\s*```/ drops the total from 177 to 166. The eleven it removes are not quoted
// examples: they are the real tail-end headings of plans 06 and 07 (Tasks 13, 14,
// 15, 15b, 16 and 12c, 13, 13a, 14, 15, 16). Both files carry an ODD number of
// ``` markers -- 305 and 287 -- so parity flips at some unmatched fence and every
// heading after it reads as quoted.
//
// Note which way that fails: it removes tasks, so the ledger looks MORE complete
// and every per-plan count stays non-zero, which means the positive control below
// cannot see it. An instrument that errs toward "clean" while its own control
// stays green is exactly the failure this gate was built to stop. Zero headings
// currently sit inside a balanced fence, so the naive reader is also the correct
// one; if that ever changes, fix the unbalanced fences in the plans first.
const tasks = new Map();
const perPlan = new Map();

for (const name of readdirSync(PLANS_DIR).sort()) {
  // The retired 11-plan series, keyed by its series number...
  const series = name.match(/^2026-08-20-(\d\d)-.*\.md$/);
  // ...and every plan written after it, keyed by its slug. Without this second
  // form a new plan is INVISIBLE here: no ledger rows are demanded for it, none
  // are validated, and the gate stays green while tracking nothing. That is the
  // 0/0 failure this script's header names, arriving through the door of a
  // filename convention rather than a broken reader. Measured before the change:
  // with `2026-09-07-mcp-server.md` present and carrying thirteen `### Task N:`
  // headings, this gate exited 0 and counted none of them.
  //
  // The negative lookahead is what keeps the two forms disjoint: `00-` through
  // `11-` after the date belong to the retired series and must keep their
  // two-digit keys, because PLANS_WITH_TASKS, CONTROL_PLANS, PLAN_WITHOUT_TASKS
  // and every existing ledger row are keyed on them.
  const dated = name.match(/^\d{4}-\d{2}-\d{2}-(?!\d\d-)(.+)\.md$/);
  const plan = series?.[1] ?? dated?.[1];
  if (plan === undefined) continue;
  perPlan.set(plan, perPlan.get(plan) ?? 0);
  for (const line of readFileSync(join(PLANS_DIR, name), 'utf8').split('\n')) {
    const heading = line.match(/^### Task (\d+[a-z]?):\s*(.*)$/);
    if (!heading) continue;
    const key = `${plan}/${heading[1]}`;
    if (tasks.has(key)) {
      note('DUPLICATE TASK HEADINGS in the plans themselves', [`${key}  ${heading[2]}`]);
    }
    tasks.set(key, { plan, task: heading[1], title: heading[2], file: name });
    perPlan.set(plan, perPlan.get(plan) + 1);
  }
}

// ------------------------------------------------------------ positive control
const deadPlans = PLANS_WITH_TASKS.filter((p) => (perPlan.get(p) ?? 0) === 0);
if (deadPlans.length > 0) {
  console.error('task ledger gate: the plan reader found NO tasks in plans that have them.');
  for (const plan of deadPlans) console.error(`  plan ${plan}: 0 tasks`);
  console.error('  Every numbered plan carries tasks, so a zero here means the heading');
  console.error('  reader has drifted off `### Task N:` -- not that the backlog is empty.');
  console.error('  A tracker whose denominator can silently reach 0 reports 0/0 = clean');
  console.error('  forever. Fix the reader in scripts/check-task-ledger.mjs before shipping.');
  process.exit(1);
}
for (const plan of CONTROL_PLANS) {
  if ((perPlan.get(plan) ?? 0) === 0) {
    console.error(`task ledger gate: control plan ${plan} yielded 0 tasks.`);
    process.exit(1);
  }
}
if ((perPlan.get(PLAN_WITHOUT_TASKS) ?? -1) !== 0) {
  console.error(`task ledger gate: plan ${PLAN_WITHOUT_TASKS} (coordination) yielded`);
  console.error(`  ${perPlan.get(PLAN_WITHOUT_TASKS)} tasks; it is expected to carry none of its own.`);
  console.error('  If the coordination doc has genuinely grown tasks, move it out of');
  console.error('  PLAN_WITHOUT_TASKS -- but check first that the reader has not started');
  console.error('  matching prose that merely mentions a task.');
  process.exit(1);
}

// -------------------------------------------------------------------- ledger
const ledgerRows = [];
const seen = new Map();
const ledgerText = readFileSync(LEDGER, 'utf8').split('\n');
for (const [index, raw] of ledgerText.entries()) {
  const line = raw.trimEnd();
  if (line === '' || line.startsWith('#')) continue;
  const [plan, task, status, pr, sha, ...rest] = line.split('\t');
  if (plan === 'plan' && task === 'task') continue; // header
  const at = `${LEDGER.replace(REPO_ROOT + '/', '')}:${index + 1}`;
  const key = `${plan}/${task}`;
  const row = { plan, task, status, pr, sha, note: rest.join(' ').trim(), at, key };
  ledgerRows.push(row);
  if (seen.has(key)) note('DUPLICATE LEDGER ROWS', [`${key}  ${at} and ${seen.get(key).at}`]);
  else seen.set(key, row);
}

// Rows for tasks that do not exist. Catches a renumbered or deleted plan task
// whose ledger row would otherwise sit there asserting progress forever.
const orphans = ledgerRows.filter((r) => !tasks.has(r.key));
if (orphans.length > 0) {
  note(
    'LEDGER ROWS NAMING A TASK NO PLAN CONTAINS',
    orphans.map((r) => `${r.key}  ${r.at}  (status ${r.status})`)
  );
}

// Tasks with no row. This is the direction that catches a plan growing a task
// nobody put on the board.
const untracked = [...tasks.values()].filter((t) => !seen.has(`${t.plan}/${t.task}`));
if (untracked.length > 0) {
  note(
    'PLAN TASKS WITH NO LEDGER ROW',
    untracked.map((t) => `${t.plan}/${t.task}  ${t.title.slice(0, 68)}`)
  );
}

const badStatus = ledgerRows.filter((r) => !STATUSES.has(r.status));
if (badStatus.length > 0) {
  note(
    'UNKNOWN STATUS VALUES',
    badStatus.map((r) => `${r.key}  "${r.status}"  ${r.at}  (allowed: ${[...STATUSES].join(', ')})`)
  );
}

// ----------------------------------------------------------- evidence in git
// origin/main must exist as a ref. Without it every ancestry check below would
// throw and the natural "fix" is to skip them, which turns the one falsifiable
// check in this gate into a no-op.
let originMain;
try {
  originMain = execFileSync('git', ['rev-parse', 'origin/main'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
  }).trim();
} catch {
  console.error('task ledger gate cannot resolve origin/main.');
  console.error('  Every `done` row is validated by reachability from the remote ref,');
  console.error('  so without it this gate cannot check the only thing it exists to');
  console.error('  check. Run `git fetch origin` and try again.');
  process.exit(1);
}

function isOnMain(sha) {
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', sha, 'origin/main'], {
      cwd: REPO_ROOT,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

const missingEvidence = [];
const unreachable = [];
for (const row of ledgerRows) {
  const hasEvidence = row.pr && row.sha && row.pr !== '-' && row.sha !== '-';
  if (REQUIRES_EVIDENCE.has(row.status) && !hasEvidence) {
    missingEvidence.push(`${row.key}  ${row.at}  (status ${row.status}, pr "${row.pr}", sha "${row.sha}")`);
    continue;
  }
  if (!hasEvidence) continue;
  if (!isOnMain(row.sha)) {
    unreachable.push(`${row.key}  ${row.at}  sha ${row.sha} (PR ${row.pr}) is NOT an ancestor of origin/main`);
  }
}
if (missingEvidence.length > 0) {
  note('ROWS CLAIMING done WITH NO EVIDENCE', missingEvidence);
}
if (unreachable.length > 0) {
  note('EVIDENCE THAT IS NOT ON origin/main', unreachable);
}

// ------------------------------------------------------------- reverse drift
// Merged PRs no ledger row cites. Not a failure -- documentation and ruling PRs
// legitimately close no task, and this repo has many -- but printed every run,
// because this is the direction that catches implementation work landing on
// main without ever reaching the board.
let unciteedPrs = [];
/** The merged-PR list, hoisted so the closed-citation guard below can tell a
 *  `gh` outage from a genuine answer rather than silently reporting clean. */
let mergedPrs = null;
try {
  const merged = JSON.parse(
    execFileSync('gh', ['pr', 'list', '--state', 'merged', '--limit', '200', '--json', 'number,title,mergeCommit'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    })
  );
  mergedPrs = merged;
  const cited = new Set(ledgerRows.map((r) => r.pr).filter(Boolean));
  unciteedPrs = merged
    .filter((pr) => !cited.has(String(pr.number)))
    .map((pr) => `#${pr.number}  ${(pr.mergeCommit?.oid ?? '').slice(0, 8)}  ${pr.title.slice(0, 66)}`);
} catch {
  unciteedPrs = null; // gh unavailable or offline; reported as unknown, never as clean
}

/**
 * The matcher, as a pure function of (rows, never-merged map), so the rule can
 * be exercised on known inputs before it is trusted on the real ledger. Its
 * siblings do the same for the same reason — `check-runbook-commands.mjs`,
 * `check-case-ids.mjs` and `check-case-citations.mjs` all refuse to certify
 * anything until their own instrument has fired on planted defects. A matcher
 * that silently matched nothing would report "no bad citations" on every run,
 * which is indistinguishable from success.
 */
function citationsOfNeverMergedPrs(rows, neverMerged) {
  return rows
    .filter((r) => r.pr && r.pr !== '-' && neverMerged.has(r.pr))
    .map(
      (r) =>
        `${r.key}  ${r.at}  (status ${r.status}) cites #${r.pr}, which was CLOSED WITHOUT MERGING: ` +
        `${(neverMerged.get(r.pr) ?? '').slice(0, 54)}`
    );
}

{
  // ── SELF-TEST: four inputs with known answers, run before the real sweep.
  const never = new Map([['324', 'MCP Task 12: the revoke surface']]);
  const row = (pr, status) => ({ pr, status, key: 'x/1', at: 'ledger:1' });
  const cases = [
    // The defect this guard was built for: a row still pointing at #324.
    [[row('324', 'in-flight')], 1, 'a row citing a never-merged PR'],
    // A MERGED pr must not fire whatever the status is — otherwise this is
    // "any non-done row fails", a different check wearing this one's name.
    [[row('329', 'in-flight')], 0, 'a row citing a merged PR, non-done status'],
    // `-` is how every todo/in-flight row without a PR is written.
    [[row('-', 'todo')], 0, 'a row with no PR at all'],
    // And it must find the offender among rows that are fine.
    [[row('329', 'done'), row('324', 'done'), row('-', 'todo')], 1, 'one offender among three rows'],
  ];
  const failures = [];
  for (const [rows, expected, what] of cases) {
    const got = citationsOfNeverMergedPrs(rows, never).length;
    if (got !== expected) failures.push(`${what}: expected ${expected}, got ${got}`);
  }
  if (failures.length > 0) {
    console.error('task ledger gate: SELF-TEST FAILED on the never-merged-PR matcher.');
    for (const f of failures) console.error(`  ${f}`);
    console.error('  A matcher that fires on nothing reports "no bad citations" on every run, which');
    console.error('  is indistinguishable from success. Refusing to certify the ledger.');
    process.exit(1);
  }
}

// ------------------------------------------- rows citing a PR that never merged
// A row whose `pr` names a CLOSED, UNMERGED pull request.
//
// This is not hypothetical and it is not cosmetic. On 2026-09-08 `mcp-server/12`
// read `in-flight  324  -` while the work had landed through **#329**: merging
// #323 deleted `exec/111`, which was #324's base, so GitHub auto-closed #324 as
// closed-not-merged. The row survived saying "in flight, see #324" — pointing
// whoever restarts from this file at a closed PR, for work that had shipped
// hours earlier. The same branch-deletion mechanic had already closed
// #313/#315/#317/#319 the same night.
//
// Nothing above could see it. `done` rows are validated by sha reachability,
// but a NON-done row requires no evidence by design (that is the whole point of
// the split), so a wrong status with a stale PR number is invisible to every
// other check here — and the ledger is the restart surface.
//
// A HARD failure rather than a printed note, unlike the reverse-drift list
// below: an unciteed merged PR is often a docs PR that legitimately closes no
// task, but a row citing a PR that never merged is always one of two real
// problems — the row is stale, or the work is not on main at all.
let closedCitations = [];
if (mergedPrs === null) {
  closedCitations = null; // gh unavailable; reported as unknown, never as clean
} else {
  try {
    const all = JSON.parse(
      execFileSync('gh', ['pr', 'list', '--state', 'closed', '--limit', '300', '--json', 'number,mergedAt,title'], {
        cwd: REPO_ROOT,
        encoding: 'utf8',
      })
    );
    // `--state closed` returns merged PRs too; `mergedAt === null` is the ones
    // that were closed WITHOUT merging, which is the set this cares about.
    const neverMerged = new Map(
      all.filter((pr) => pr.mergedAt === null).map((pr) => [String(pr.number), pr.title])
    );
    closedCitations = citationsOfNeverMergedPrs(ledgerRows, neverMerged);
  } catch {
    closedCitations = null;
  }
}
if (closedCitations !== null && closedCitations.length > 0) {
  note('LEDGER ROWS CITING A PR THAT NEVER MERGED', closedCitations);
}

// -------------------------------------------------------------------- report
const byStatus = { done: 0, claimed: 0, 'in-flight': 0, todo: 0 };
for (const row of ledgerRows) if (row.status in byStatus) byStatus[row.status] += 1;

console.log(`task ledger: ${tasks.size} tasks across ${perPlan.size} plan files, ${ledgerRows.length} ledger rows.`);
console.log('');
console.log('plan  tasks  done  claimed  in-flight  todo');
for (const plan of [...perPlan.keys()].sort()) {
  const rows = ledgerRows.filter((r) => r.plan === plan);
  const count = (s) => rows.filter((r) => r.status === s).length;
  console.log(
    `  ${plan}  ${String(perPlan.get(plan)).padStart(5)}  ${String(count('done')).padStart(4)}` +
      `  ${String(count('claimed')).padStart(7)}  ${String(count('in-flight')).padStart(9)}` +
      `  ${String(count('todo')).padStart(4)}`
  );
}
console.log('');
console.log(`  done (merge sha verified on origin/main) : ${byStatus.done}`);
console.log(`  claimed (asserted, task mapping unaudited): ${byStatus.claimed}`);
console.log(`  in-flight                                : ${byStatus['in-flight']}`);
console.log(`  todo                                     : ${byStatus.todo}`);
console.log(`  origin/main                              : ${originMain.slice(0, 8)}`);
console.log('');
// Stated as two numbers deliberately. A single "% complete" that folds `claimed`
// into `done` is exactly the reconstructed figure this ledger replaces.
const pct = (n) => ((n / tasks.size) * 100).toFixed(1);
console.log(`  VERIFIED COMPLETE: ${byStatus.done}/${tasks.size} (${pct(byStatus.done)}%)`);
console.log(`  claimed but never audited at task level: ${byStatus.claimed} (${pct(byStatus.claimed)}%)`);

if (unciteedPrs === null) {
  console.log('');
  console.log('  merged PRs cited by no ledger row: UNKNOWN (gh unavailable)');
} else if (unciteedPrs.length > 0) {
  console.log('');
  console.log(`  merged PRs cited by no ledger row (${unciteedPrs.length}) -- expected for docs/ruling PRs:`);
  for (const line of unciteedPrs) console.log(`    ${line}`);
}

if (fail.length > 0) {
  console.error('');
  for (const { section, rows } of fail) {
    console.error(`${section} (${rows.length}):`);
    for (const row of rows) console.error(`  ${row}`);
    console.error('');
  }
  process.exit(1);
}
