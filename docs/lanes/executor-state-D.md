# Lane D — executor state

**This file is Lane D's restart surface.** Rewritten for THIS work (the four entity-keyed
`data-testid` hooks for Plan 11 T13's E2E: `workspace-card-${workspaceId}`,
`project-card-${projectId}`, `board-column-${stateId}`, `ticket-card-${ticketId}`) on branch
`exec/36-e2e-testids`, cut from `origin/main` at `2d90a03` on 2026-09-06, per the controller's
relaunch at the fixed point after PR #167 (this lane's own retention sweeps, `5ca3be1`) merged.
**Do not re-implement T7/T8/T9/T10/T17 or the two retention sweeps — all merged, all promoted.**

> Shas below are facts about when this file was written. Verify with `git branch --contains` —
> empty means orphaned. `git cat-file`/`git show` pass on orphaned shas and will lie.

## 1. Where things stand right now

- **PR #173 IS OPEN**: https://github.com/bkirosangma/gisik-nokma/pull/173. Pushed, not merged.
  Branch `exec/36-e2e-testids`, head `d8b3a3b`, rebased onto `origin/main` at `aa0318a` (a clean
  rebase — the two intervening `main` commits touched only `docs/lanes/controller-state.md`).
  Commits: `f9157e7` (the four source hooks), `0180c22` (the four render tests, cases 3.153–3.156,
  mutation-verified by hand — see §3), `fd6bddd` (`Features.md` line + catalogue entries, header
  recounted 3.152→3.156), `d8b3a3b` (this handoff).
- **Full gate GREEN**, background task `bk2tnuzpe`, log at `/tmp/laneD-gate.log`, under Lane E's
  v3.2 gate-lock reference (copied from `origin/exec/23-plan11:docs/lanes/gate-lock/` — that path
  does NOT exist on `main`), adapted only for `REPO=.../lane4-periphery`: **`GATE_EXIT=0`,
  `Tasks: 30 successful, 30 total`, `Cached: 0 cached, 30 total`, `1m35.089s`, node v22.22.2, 0
  "Unsupported engine", `CHECK_ENV_EXIT=0`, no orphaned vitest workers.** Per-package totals: ui
  37/4, domain 464/27, rule-engine 282/12, editor 178/15, sync-client 67/7, app-core 1097/68, web
  138/18, mobile 20/3, server 1099/108, desktop 5/2 — **3387 tests / 264 files**, zero failures.
  This ran BEFORE the rebase onto `aa0318a`; the rebase only moved a docs file neither this task
  nor the gate touches, so re-running was not needed and was not done — named rather than assumed.
- **Session-limit context**: the controller reported the account-wide meter at 87% at 09:40 IST,
  forecasting a halt around 10:05 until the 12:20 reset. Per its explicit instruction this task
  was done as small direct commits rather than a Workflow fan-out, so a halt at any point loses
  nothing already pushed.

## 2. What was built, and where

Four `data-testid` hooks, house style `field-${fieldId}` / `mapping-row-${state.id}` /
`state-node-${data.stateId}` (id on the entity's own row/container; interaction still goes through
role/accessible-name — the testid is disambiguation only, never a second click surface):

- **`workspace-card-${workspaceId}`** and **`project-card-${projectId}`** — both on
  `apps/web/app/workspaces/page.tsx`, on the `<li>` wrapping each workspace's `<Card>` and the
  `<li>` wrapping each project `<Link>` inside it, respectively.
- **`board-column-${stateId}`** — `packages/app-core/src/views/board.tsx`, on the column
  `<section role="region" aria-label={column.name}>`.
- **`ticket-card-${ticketId}`** — on BOTH surfaces that render a ticket: `board.tsx`'s
  `<li className="gn-board__card-slot">` (the card slot wrapping `BoardCardView`), and
  `ticket-list.tsx`'s `<span className="gn-list__title-cell">` inside `ListTable`'s title-column
  `cell` (kept in `ticket-list.tsx`, not the generic `@gisik-nokma/ui` `Table` component, to avoid
  widening a shared component none of the four ids needed).

**Deliberately NOT added** (per the override brief, verified by Lane E and not re-checked here):
the seven ids that already work by accessible name (`auth-email-input`, `auth-magic-link-submit`,
`ticket-create-button`, `ticket-title-input`, `ticket-create-submit`, `transition-comment-input`,
`transition-confirm`), and the four tied to T13's own scenario design
(`transition-option-${stateId}`, `transition-refusal`, `transition-refusal-reason`, `not-found`).

## 3. Verification done, and what it found

- **Render tests, one per hook**, in `packages/app-core/test/views/board.test.tsx` (3.155, 3.156's
  board half), `packages/app-core/test/views/ticket-list.test.tsx` (3.156's list half), and the new
  `apps/web/test/workspaces-cards.test.tsx` (3.153, 3.154). Each asserts the id is present keyed by
  the real entity id AND that two siblings carry two different ids (the excluding half).
- **Mutation-verified BY HAND, not by a subagent** (task was small enough to do directly, per the
  controller's small-commits instruction): for each of the three touched source files, made a
  local copy (`sha256sum`), substituted a CONSTANT string for the interpolated testid, ran the
  narrow test file, confirmed it reddened EXACTLY the case(s) naming that file (board: 2/2 red —
  3.155 and 3.156 share the file; ticket-list: 1/1 red; workspaces page: 2/2 red — 3.153 and 3.154
  share the file), then restored from the saved copy and confirmed `sha256sum` matched before
  committing. No mutation was ever live in a file at commit time.
- **Caveat found and recorded rather than smoothed over** (test-cases 3.156, and in the commit
  message): a row in *Recently assigned* renders TWICE — once pinned, once in its section —
  carrying the SAME `ticket-card-${ticketId}` both times (this is `ticket-list.tsx`'s existing,
  correct pin-is-a-surface-not-a-filter behaviour, case 3.51 — not a defect introduced here). The
  list-half render test therefore fixtures on two rows neither of which is assigned to `'me'`
  (avoiding `ROWS`' own `t2`, which IS pinned). **T13's own Playwright scenario needs the same
  awareness**: `getByTestId('ticket-card-<id>')` is ambiguous for a ticket that is both pinned and
  in the list at the same time; scope the query to one `role="region"` section, or avoid picking a
  scenario ticket that would be pinned.
- **Full narrow suites green, unlocked** (per the override: app-core/web-only changes run
  unlocked with `--maxWorkers=2`): `pnpm --filter @gisik-nokma/app-core exec vitest run
  --maxWorkers=2` → 68 files / 1097 tests, 0 failures. `pnpm --filter @gisik-nokma/web exec vitest
  run --maxWorkers=2` → 18 files / 138 tests, 0 failures.
- **Typecheck clean via turbo** (never bare `tsc` — the stale-dist trap this lane's own prior
  session named): `pnpm turbo run typecheck --filter=@gisik-nokma/app-core
  --filter=@gisik-nokma/web` → 7/7 tasks, 3 cached, exit 0.
- **NOT YET DONE at the time this was written: the full cross-workspace gate** (server included).
  In flight as background task `bk2tnuzpe` — see §1. Its result must be read from
  `/tmp/laneD-gate.log` (Tasks/Cached/Time line, vitest totals, `Unsupported engine` count,
  `check:env` line) before the PR is opened or reported as green — never inferred from "it was
  launched."

## 4. Case-id catalogue

**§3, not §6 or a new bucket.** `test-cases/README.md` names `03-foundation-ledger.md` as the
**permanent home of all of Plan 6's web-client core** (the founding screen, the invite page, the
board, the list — cases 3.1–3.144 and onward), including the exact page and views this task
touches (`workspaces/page.tsx` already owns 3.124–3.128; `board.tsx`/`ticket-list.tsx` already own
3.112–3.114, 3.146, 3.152). A new §6 or §8 bucket for these four hooks would have been the wrong
home — §8 was considered and explicitly refused for this exact reason on 2026-09-02 (see
`Features.md`'s own note at its §3 web-client bullets).

Recounted with `node scripts/check-case-ids.mjs` before minting (max 3.152, matching the file's
own header) and after (1328 unique ids, up from 1324 by exactly 4, zero duplicates, highest
unaffected at 13.100). **Minted 3.153–3.156**, one per hook: 3.153 workspace-card, 3.154
project-card, 3.155 board-column, 3.156 ticket-card (both surfaces, one case — matching the
file's own convention of one id covering a property proven in more than one test file, e.g.
3.9, 3.116–3.117).

## 5. Left undone / open questions, named rather than glossed

- **No Playwright test consumes these four ids yet.** That is T13's job, not this task's — the
  override brief is explicit that this task is the hooks only. The pinned-row ambiguity (§3) is
  the one thing T13 needs handed to it explicitly.
- **`packages/ui`'s generic `Table` component was deliberately NOT touched** — the list's
  `ticket-card` id lives on a `<span>` inside the title cell rather than on the `<tr>` `Table`
  renders, to avoid widening a shared component (used well beyond ticket lists) for a need only
  one caller has. Named as a design choice in case a future task wants per-row testids on `Table`
  itself for a different reason.
- **No ledger row for this task** — the override brief states it explicitly ("a T13 pre-requisite,
  closed by name"), so `docs/lanes/task-ledger.tsv` is untouched, correctly.

## 6. The gate lock

Copied Lane E's v3.2 reference (`docs/lanes/gate-lock/README.md`, `gate.sh`, `locked-test.sh`,
`sweep-test-dbs.sh`) from `origin/exec/23-plan11` (NOT `main` — that path does not exist there) into
this session's scratchpad, renamed the wrapper `gateD.sh`, adapted only the `REPO=` line in both
`gateD.sh` and `locked-test.sh` to `/Users/kiro/my_projects/gisik-nokma-lanes/lane4-periphery`. Do
the same on a restart rather than hand-rolling the regex — pull the reference, adapt only `REPO=`.
This task's own changes (app-core, web) do not touch `apps/server`, so the narrow suites above ran
UNLOCKED with `--maxWorkers=2`, per the override's own instruction; only the final full gate
(§1/§3) takes the lock.

## 7. Reporting

Reporting to `gisik-nokma-0d` (tmux `gisik:0` fallback) in the same turn this file was finalised:
PR #173, head `d8b3a3b`, `Tasks: 30 successful, 30 total`, `Cached: 0 cached, 30 total`, 3387
tests / 264 files, node v22.22.2, `CHECK_ENV_EXIT=0` on its own line, zero orphaned vitest
workers, the four ids with their files (§2), every mutation's output verbatim (§3), and the
pinned-row caveat named explicitly for T13.

## 8. Remaining steps, in order

1. ~~Cut branch, build, locate components~~ — done.
2. ~~Add the four source hooks~~ — done, commit `f9157e7`, pushed.
3. ~~Write and mutation-verify one render test per hook~~ — done, commit `0180c22`, pushed.
4. ~~Catalogue: Features.md line, test-cases 3.153–3.156~~ — done, commit `fd6bddd`, pushed.
5. ~~Narrow suites (app-core, web) unlocked, typecheck via turbo~~ — done, both green.
6. ~~Full gate under the v3.2 lock~~ — done, `GATE_EXIT=0`, 30/30, 3387 tests / 264 files.
7. ~~Rebase onto `origin/main` (it moved by one docs-only commit), re-push, open the PR~~ — done,
   **PR #173**.
8. **Report the PR to the controller.** — this handoff's commit is that report's evidence trail.
9. **Never edit `docs/lanes/task-ledger.tsv`. Never merge own PR. Never commit to `main`.**
