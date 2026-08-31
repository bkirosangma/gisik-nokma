# Cross-lane controller — live state

**This file is the controller's restart surface.** A controller relaunched from
`gisik-nokma-lanes/dispatch-main-controller.md` recovers only what is written here. Refreshed at every
decision boundary.

> **Shas in narrative prose below are facts about when they were written.** Verify anchors with
> `git branch --contains` — empty output means orphaned. `git cat-file` passes on reflog-only commits and
> will lie. This file lives on `main` deliberately: an earlier handoff was tracked, pushed, and stranded on
> a branch that had already merged, so a restart read a copy 70 lines out of date. **Once the branch
> carrying a handoff merges, the next update branches off `main`.**

## Anchors — verified 2026-08-31, at `c93c910`

| what | value |
|---|---|
| `main` | `a3746fb` **as of 19:05 IST — this row goes stale by design.** #43 → #45 → #46 → #44 → #47 |
| last forced gate | **`a3746fb`** — 21/21, 0 cached, **936 tests**, `TURBO_EXIT=0`, node **v22.22.2**.
  Re-established here because #47 is the first **code-bearing** merge since `c93c910`; the 853 anchor is
  retired, not carried |
| gate composition | domain **274** · rule-engine 278 · server 143 · app-core 130 · **editor 72** · ui 31 · sync-client 8 |
| **gate ran under** | **node v22.22.2** — see the Node section below before you trust any gate |
| collision surfaces | fixtures **84** · projections **2** (`proj_entity_heads`, `proj_workflows`) · packages **6** (`editor` new) |
| open PRs | none at time of writing — **re-measure** |

**Re-measure everything above on resume.** Recount at the sha you report; do not carry a composition
forward — five of six package counts staying right is what makes the sixth invisible. `app-core` went
92 → 130 at this merge, which is the kind of move a carried-forward composition hides.

## THE ENVIRONMENT IS NOT THE DECLARED ONE — read before running a gate

Found 2026-08-31 by a post-merge gate that came back RED and was **not** a code defect.

- `package.json` declares `"engines": { "node": ">=22.0.0 <23" }`. CI (`.github/workflows/ci.yml:62`)
  uses `node-version: 22`. **This machine's default `node` is v24.11.1** — outside the declared range.
- There is **no `.nvmrc`, no `.node-version`, no `.tool-versions` — and no `.npmrc`.** The last one is
  the load-bearing absence: without `engine-strict=true`, **`engines` enforces nothing.** Verified under
  v24.11.1: `pnpm exec node -v` and `pnpm run` both succeed with **no refusal and not a single warning**,
  with the same commands under 22 as the control so the silence is not a broken probe. The declared
  engine is decorative. *(Pending item below; the controller does not implement.)*
- **So there are two failure modes, and the quiet one is worse.** The false RED is what this section was
  written from — loud, and it names itself in the error text. The false GREEN is a gate that passes on an
  unsupported Node and says nothing at all. Nobody catches that one.
- `better-sqlite3@11.10.0` is a **native** module. Its binding matches whichever Node last rebuilt it —
  ABI **127** = Node 22, ABI **137** = Node 24. Under the wrong one, `@gisik-nokma/sync-client#test`
  fails 4/8 with `NODE_MODULE_VERSION` and **looks exactly like main being red.** It is not.
- Fix: `nvm use 22 && pnpm rebuild better-sqlite3`, then gate. **The main worktree's binding is currently
  built for ABI 127 (Node 22)** — correct, and it means a gate run there under Node 24 will now false-red.
- Each worktree has its own `node_modules`, so lanes are isolated — which is the hazard: **two sessions
  can certify the same code under different Node majors and both report green.** A gate result is not
  evidence unless it names its Node.

This is the same class as the TZ finding one level up. The coordination doc says *"the environment is a
fixture, and no test on `main` varies it."* It is worse than that: the environment is not even the
**declared** fixture, and nothing in the repo makes it be.

## Role and authority

Controller of a **two-session serial topology**: this session plus one executor. The wave schedule is
superseded (see the coordination doc's serial-execution section).

- **The controller merges the executor's work and NEVER its own.** Its own doc PRs go to the owner. This
  is the check the two-session split exists to provide.
- Auto-merge is re-granted: a PR that passed its machinery **and** an independent CI run green merges
  without a per-PR ask. `gh pr checks <n>` — **pending is not green.** Prefer
  `gh api repos/<o>/<r>/commits/<head-sha>/check-runs` — it names the conclusion at the exact sha.
- The controller does **not** implement plan tasks, and does not re-review the executor's work.
- **Restart the executor at task boundaries.** This is a kill-and-relaunch from its brief, NOT a `/clear`,
  which is user-typed and cannot be issued to another session.

## The executor

- Session `gisik-nokma-exec-*`, tmux `gisik:exec`, worktree `/Users/kiro/my_projects/gisik-nokma-exec`.
- Brief: `gisik-nokma-lanes/dispatch-executor-serial.md` — **self-sufficient by design**; policy lives
  there, position lives in `docs/lanes/executor-state.md`.
- Relaunch: `tmux kill-window -t gisik:exec` then `tmux new-window -t gisik -n exec -c <worktree>` and
  `claude --model opus --permission-mode bypassPermissions "$(cat <brief>)"`.
- **Before restarting: the executor's handoff must be current on `main` and its anchors reachable.**
  Restarting against a stale handoff destroys what the restart was meant to preserve.
- **A branch checked out in ANY worktree cannot be checked out or deleted from another.** Four failures in
  one session: three `--delete-branch`, plus `git -C <exec-worktree> checkout main`, which refuses because
  `main` is held by the primary worktree. **So the exec worktree can never sit on `main`** — leave it on
  whatever branch it holds and let the fresh session check out its own target. `exec/06a-client-core` is
  held by `gisik-nokma-lanes/lane4-periphery`; work such a branch in place.

## Position in the serial sequence

**PHASE 0 IS COMPLETE.** All three branches landed: step 1 Chain A (`6b2fc76`), step 2
`exec/06a-client-core` (`c93c910`), step 3 `exec/07-editor-client` (`a3746fb`). P17's stale plan text was
discharged in `f40a850`.

> **Reconciled, because it would otherwise fire deterministically:** the coordination doc's step-2 line
> *"at `8209397`, not at the branch tip"* is **SUPERSEDED** — T9 was reviewed and its fixes applied, and
> the branch merged at its tip.

**Step 4 is next: Plan 4 T4 → T5**, dispatched to the executor. It carries the CSRF ruling and **creates
`Features.md` §6 and `test-cases/06-auth-visibility.md`** — in the same change set, per the rule below.

### The catalogue rule, and how I got its number wrong

`Features.md` and `test-cases/` are stated in **two** CLAUDE.md files with the follow-up excluded both
times: *"same change set, never a follow-up"*, *"any PR that touches source files and leaves `Features.md`
untouched is incomplete."* **Nothing in this repo enforces it** — not the gate, not a scoped review. It is
the controller's job to read a PR against it, and #47 arrived with a 20-file package and an untouched
catalogue, recorded "with owner, not fixed", which IS the forbidden follow-up. Blocking it was right.

**But the section number I demanded was wrong, and would have collided within the hour.** I said "§6,
next-free". **Numbering is RESERVED, not sequential** — `test-cases/README.md`: *"claim from the table
rather than renumbering"*, and the coordination doc's reconciliation decision 2 assigns **§6 →
Plan 4** (the very next task) and **Plan 7 → §9 / `09-editor-attachments`**. I had applied the *case*
rule ("next free number in the matching section") one level up to *section* numbers, where it is false.
**§6–§8 are absent from `Features.md` by design, not missing.** Claim from the table. Always.

Case ids are reserved the same way: Plan 7 T16 pins 9.1–9.34 and has not run, so the new bucket starts
at **9.35**.

## Standing owner rulings currently in force

- **Fable is not dispatched, for any role.** Sonnet default, opus by exception, hard cap **6 subagents per
  task**, one fan-out per plan, judgment fan-outs withdrawn. Cost ledger of what this trade has already
  cost is in the ruling — **add to it, do not re-argue it.** Note fable was the **premium** tier the
  ruling replaced with opus as "the ceiling" — not the cheap one. A controller got this backwards once.
- **CSRF ruling**: Plan 4 T5 owes HTTP-Origin on cookie-authenticated routes, `sameSite` set explicitly,
  and a sentence naming that the cookie assertion forbids a `Domain` attribute.
- **Plan 10 T4 is lifted to Phase 1** — the §11 envelope-origin closer. `fc904f4` closed only the client
  door.
- **Ruling P17** (new, this merge): `useLiveQuery(source, workspaceId, queryKey, load, debounceMs)` is a
  **breaking** signature change binding Plan 6 T10–T13 and Plan 10. Its unstated invariant — *the key must
  name every input `load` closes over* — is enforced by nothing.
  **P17's own "eight call sites" was wrong — there are NINE**, corrected in place by PR #45. The
  controller's dispatch said four. Both counts were wrong and the five neither named (5514, 6390, 6391,
  6395, 6396) sit in Tasks 11–13 — the only tasks not yet written, i.e. the ones that will be transcribed
  from that text. **A count asserted in two places can be wrong in both; recount from the file.**

## Traps that cost a round each if rediscovered

1. **Two "origin checks".** HTTP `Origin` header (CSRF) vs the event-envelope `origin` provenance enum.
   They meet in Plan 4 T5. Always say **envelope-origin** or **HTTP-Origin**.
2. **`docs/plan-3-chain-b-handoff.md` is read BEFORE Plan 3 Task 12, not during** — two tenancy hazards
   converge there, one a total outage presenting as a data problem.
3. **Clock tests: varying `TZ` is necessary and NOT sufficient.** Under vitest's `threads` pool,
   `process.env.TZ = zone` **does not move the clock** — a worker thread gets no process-level
   reconfiguration. T9's three zone tests were 32/32 green while the zone never moved. **A test that
   varies an ambient setting must also assert that varying it does something.** Binds Plan 9's Calendar
   and Timeline. Recorded as a ruling in the coordination doc at this merge.
4. **The integration checkpoint no longer fires** — replacement trigger is the Phase 2/3 boundary.
5. **A pre-ruling covers *who*, not *what*.** Reading "a pre-ruling covers this" and skipping the thought
   is the trap.
6. **A native-module false red.** See the Node section above. `sync-client` failing 4/8 is an ABI
   mismatch, not a defect.

## Method rules this role keeps breaking

Every one below was violated by a controller that had just written it. **Assume you are the next.**

- Never run a state-changing git command in a shell whose cwd was set for a read — use `git -C`. Violated;
  it swapped a live lane's worktree for 26 seconds and contaminated a running review.
- **A gate's exit code is the LAST command's exit code.** The known form is the pipe (`| tail` reports
  `tail`'s status). It was re-hit 2026-08-31 in a new costume: a trailing `echo` made the harness report
  **"exit code 0"** for a gate whose summary said `Tasks: 11 successful, 18 total / Failed:
  sync-client#test`. **Read the `Tasks:` line. It is the only honest signal.** Write the exit code INTO
  the log (`echo "TURBO_EXIT=$?" >> log`), never after a pipe.
- A rule does not reliably fire on its author. **The executor caught three controller errors on its first
  day**, each in an artifact the controller had just written *and verified*.
- Over-caution has a price here. Blocking a restart on a documentation merge spends session carriage —
  66% of all spend — to protect against a risk already closed.
- **A pointer from a correct document to a stale one does not drift; it reverses, deterministically.**
- **A control must be on the fact you are claiming, not merely in the same file.** Blocked a restart on
  "main's handoff has zero matches for `21 behind`", with `editor-client` hitting 3 as the control. The
  control was sound and the conclusion was false: main said **20**, and carried the whole recon. **A
  working search for the wrong term is still the wrong test** — it proves the probe is alive, not that the
  fact is absent. Search for the fact (`packages/domain/src/index.ts`), never for your own number.
- **Delta counts are not facts, they are readings.** That branch went 20 → 21 → 23 behind inside one
  session. Write "N as of <when>, and still moving", never a bare digit. Note also that `**two**
  conflicts` will not match a search for `two conflicts` — bold markers sit inside the phrase.
- **A ✅ written from the implementation is not evidence; only one written from the test is.** The
  executor's own catalogue was wrong **four times** before it checked — claims drafted from source and
  commit messages, then corrected by reading actual test names: a wrong file cited, a property no test
  asserts, a round-trip described as a direct test, and a 🚫 that two tests document as current behaviour.
  **The drift the catalogue exists to prevent, arriving during its creation.** Honest limit, stated in the
  bucket rather than implied away: **no test in this repo cites a case id in either direction**, so a ✅ is
  checkable by reading the named file and not by grep (owner workspace/Plan 11).
- **A claim that a test CANNOT fail needs the same mutation evidence as a claim that it can.** A recorded
  ruling called T4's Escape defect vacuous because the library calls `dispatchExit` unconditionally —
  right about the library, wrong about the test: deleting `container?.remove()` reddens it. One of three
  assertions was dead, not the test. **"Vacuous" invites deletion**, so a too-wide verdict licenses
  removing a working check. The controller propagated this one in a dispatch while simultaneously
  demanding mutation proof for the positive claim.
- **Verify a count by enumerating and marking, with the marker string counted as a control** so a zero
  cannot come from a sweep that matched nothing. Method from the executor, after the controller and
  Ruling P17 asserted two different wrong counts for the same thing.
- An artifact's author is the worst-placed party to report its contents. *(Corollary earned this merge:
  verifying an author's claims is cheap and it worked — every claim in the PR #43 handoff held, including
  four shas my naive `--contains` sweep called orphaned that the file itself labelled "do not cite".
  **A sweep that cannot tell "cited as live" from "marked dead" produces false defects.**)*

## The monitor's blind spot: it cannot see an idle session

**Measured 2026-08-31: the executor idled ~55 minutes on a full quota and nothing reported it.** It armed
a `sleep`-based wake-up for the 18:00 reset; the timer was **still alive at 59:11 for a 24-minute wait**,
output frozen at `waiting 1432s`, and it never fired. The owner noticed, not the controller and not the
monitor — the monitor watches `main`, open PRs and pane membership, and **has no signal for "a session is
idle when it should be working."**

**Do not close this with `#{window_activity}`.** I tested it before building on it: both windows returned
**identical** timestamps incrementing in exact lockstep with wall-clock (`…735 → …740 → …745`, +5 per
5-second sample). It tracks the clock, not activity, so a monitor built on it reports "active" forever —
**including for a dead session.** An idle detector structurally incapable of detecting idleness.
A workable signal is hashing `capture-pane` output (a working pane animates, an idle prompt does not);
unbuilt, because the threshold needs tuning against how long a legitimate fan-out stays quiet.

**Second blind spot, demonstrated by the monitor itself.** The controller killed the `exec` window and
relaunched a fresh session into a new window of the same name. The monitor reported **no** `LANE PANES
CHANGED` — it compares the sorted pane-NAME set, which was `exec,main` before and `exec,main` after. **It
cannot see a session being replaced, nor one dying if anything takes the name back.** Combined with the
idle gap: the monitor answers *"did the repo move"* well and *"is anyone home"* not at all.

**Until then the controller tracks boundaries itself.** If you approve a hold-until-time, you own the
clock; do not approve one and then stop watching, which is exactly what happened here.

## The watch monitor — do NOT re-arm it blindly

A persistent monitor runs on `origin/main`, the open-PR set, and tmux pane membership. **It survives
`/clear`** — it is a shell child of the session process, and `/clear` ends the context, not the session.
Confirmed by observation 2026-08-31: it fired the `60bc7ca` event into a freshly cleared context.

**Check before re-arming: `pgrep -fl prev_main`.** Re-arming a live monitor gives you two and duplicate
events on every merge. It emits only on change — long silence means nothing changed, not that it died.
Currently alive as **PID 78292**.

It costs **zero tokens** — a shell loop that wakes the session only on a real event. **If it is genuinely
gone**, re-arm change-triggered on a 180s poll against `git ls-remote origin main`, `gh pr list --state
open`, and `tmux list-panes -s -t gisik`.

Note its wording is one-directional: a pane being ADDED also reports "a lane may have exited."

## Pending owner decisions

1. ~~**The executor's advisor is running on Fable.**~~ **RESOLVED, no owner action needed** — its status
   line now reads `advisor: opus`. Recorded only so the question is not re-raised: `advisor:` is harness
   session config, not a dispatch, and the ruling's three named roles are all dispatch roles. Had it still
   been fable it would have been an owner scope call, not a controller one (trap #5).
2. **The declared Node engine is unenforced.** `engines` demands `>=22 <23`, the machine defaults to 24,
   and there is no `.nvmrc` *and no `.npmrc`* — so without `engine-strict=true` pnpm accepts the wrong
   Node silently. The fix is two lines (`.nvmrc` + `engine-strict=true`), but it turns an unsupported Node
   into a hard refusal and so needs a CI run to prove it does not break the pipeline. Recorded by the
   executor with owner **Plan 11**; surfaced here because it wants an owner decision, not a plan slot.
   The controller does not implement.

## Controller context discipline

Measured 2026-08-31: this role ran **655 requests at 404K average context, rising 165K → 609K per request
across the session** — worse than any session it was policing. **The controller is the most expensive
session in the topology and should restart itself at decision boundaries on the same terms it imposes on
the executor.** Its restart is owner-issued (`/clear`) or owner-relaunched; this file is what makes that
free rather than destructive.
