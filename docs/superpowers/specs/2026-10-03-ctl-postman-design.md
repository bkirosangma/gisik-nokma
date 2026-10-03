# ctl postman — design (efficiency plan #1 + #2 + B2 + B6)

Status: **APPROVED by the planner 2026-10-03 06:37 with amendments A–C and BUILT** (lane 1, task/ctl-postman); §11 lists what changed between this design and the build. Plan: `gisik-nokma-lanes/PLAN-efficiency-robustness-2026-10-03.md` (moves 1–2, rows 1–2, B2, B6). Brief: `MSG-planner-lean-build-2026-10-03.md` item 4.

## 0. Basis (measured 2026-10-03 06:30 IST, read from the files)

- `roles/QUEUE-dispatch.md` since 10-01 19:50 (~34 h): 124 FIX + 141 MERGETIP + 23 NEXT + 1 CLOSE = **289 deliveries to lanes (~8.5/h)**; 489 TOOK / 82 DONE / 154 NOTE / 16 HOLD lines are bookkeeping, not deliveries. MERGETIP is the largest class and ctl tipmerge (#20, `task/ctl-auto-tipmerge`) is removing most of it.
- Live seats are tmux windows of session `gisik`, **named**: `main`(0) `exec1..5` `planner`(6) `reviewerA`(7) `dispatcher`(8) `reviewerB`(9) `exec10`(10) `exec11`(11) `reviewerC`(12). A live seat's `pane_current_command` is the claude version string (`2.1.288`), a dead one is `zsh`/`bash`.
- The dispatcher today (CARD-dispatcher + addendum): (1) delivers NEXT/FIX/MERGETIP/CLOSE lines of QUEUE-dispatch.md by `ctl dispatch` and proves delivery by reading the pane for `saw:`; (2) sweeps QUEUE-review.md for `DONE … FIX` with no FIX line (mechanism g) and delivers it; (3) watches lane panes for DONE/BLOCKED and relays BLOCKED to the notes; (4) sends the next LANES.md task to an idle lane; (5) holds a NEXT whose blocker has not landed; (6) writes `DISPATCH-log.md`. Since the STEPS rules, lanes append their own REVIEW line, so the "verify DONE by ls-remote → REVIEW" duty already moved to the lane.
- Existing reusable pane code (lib.sh): `ctl_box_text` (real vs dim input), `ctl_press_enter` (leaves copy mode), `ctl_submit`, `ctl_delivered` (echo + new spinner, or the queued hint), `ctl dispatch --submit-pending`. Existing cursor watcher: `gisik-nokma-lanes/watch-cursor.py` (planner's; starts at EOF when no cursor — fine for a log, wrong for an inbox, see §5).

## 1. Shape in one paragraph

Four verbs. **`ctl post`** appends a message to `roles/LEDGER.jsonl` (id, from, to, kind, body pointer). **`ctl postman run`** is the one daemon (a tmux window `postman`, restart-safe, all state in files): it moves each message through posted → delivered → acked, first by appending to the addressee's inbox file (which that seat's ONE inbox watcher turns into a context line), then, if no ack comes, by pasting a ONE-LINE pointer into the pane after checking the pane is safe. **`ctl inbox`** lists my unacked messages and, with `--watch`, is the cursor watcher. **`ctl ack <id>`** is the seat's receipt; it stops redelivery. It also bridges the four existing `QUEUE-dispatch.md` line grammars, so the dispatcher can retire before any sender learns a new verb.

## 2. Files and the ledger schema

Root `$CTL_POSTMAN_ROOT` (default `/Users/kiro/my_projects/gisik-nokma-lanes/roles`; tests use a temp dir). Tmux session `$CTL_TMUX_SESSION` (default `gisik`).

```
roles/LEDGER.jsonl                 append-only, ONE object per message, never edited. The source of truth.
roles/postman/spool/<id>.txt       body of a `--text` message (a `--body FILE` message points at its file, no copy)
roles/postman/inbox/<seat>.jsonl   append-only, one line per message DELIVERED to that seat (a derived index: rebuildable from the ledger)
roles/postman/acks/<id>            one file per ack, created exclusively: first line "<utc-ts> <seat> [note]"
roles/postman/state/<id>.json      the postman's private delivery state, replaced atomically (tmp + rename)
roles/postman/daemon.pid  daemon.log  cursor-queue-dispatch
~/.cache/gisik-ctl/cursor-<seat>-inbox   the watcher's byte offset (plan #2's naming)
~/.cache/gisik-ctl/inbox-watch-<seat>.pid / .hb   the watcher's pid and a heartbeat touched each poll
```

Ledger line (all fields always present):

```json
{"id":42,"ts":"2026-10-03T01:02:03Z","from":"main","to":"exec3","kind":"fix",
 "body":"/Users/kiro/my_projects/gisik-nokma-lanes/BRIEF-x-fix-1.md","body_sha":"<sha256>","body_bytes":4120,
 "reply_to":null,"src":null,"ref":"task/x"}
```

- `id`: integer, allocated under an `mkdir` lock as `last id + 1` (read from the last ledger line), so concurrent posters never collide and ids follow ledger order. Seats type `ack 42`.
- `from`/`to`: tmux window names. `to` may be given as a bare number (`ctl post 2 …`) and is stored as the window's current NAME. Allowed names: `main|planner|dispatcher|exec<N>|reviewer<X>` (alias `orch` → `main`). A name with no window now is accepted with a warning (the seat may be mid-restart); it stays posted.
- `kind` ∈ `next fix mergetip question note page bounce` (READY/RULING stay QUEUE-gate lines, §8, so they are not kinds; `question` is a seat asking the orchestrator or planner, e.g. a lane's BLOCKED). `ack` is false only for `note` (delivered to the inbox, then closed; never pasted).
- `body`: absolute path. `--body FILE` stores that path (+ sha256, bytes, taken at post time); `--text "…"` writes `spool/<id>.txt` and stores that. Long documents are always referenced by path; a body is a short instruction or a brief.
- `reply_to`: an id; `ctl post … --reply-to 7` also acks 7 for the poster (replying is receiving).
- `src`: set only by the bridge (`queue-dispatch:<sha1 of the line>`); the bridge refuses a `src` already in the ledger, so a reset cursor cannot repost history.

## 3. The pointer line (what a pane or a watcher shows)

One line, ≤ 240 chars, no newline, starts with `[` (never `/` or `!`, which are Claude Code's slash and bash modes):

```
[postman #42 fix ← reviewerC] Read the WHOLE file /…/BRIEF-x-fix-1.md with the Read tool and execute it. In the SAME tool-call block as your first Read run: bash /…/scripts/ctl/ctl ack 42
```

A single-line `--text` body of ≤ 300 chars is inlined instead of "Read the WHOLE file …" (its file still exists in the spool). The ack path is the postman's own checkout, so it works from any seat's cwd. The same text is the watcher's emitted line, so a seat sees one format on either channel.

## 4. The state machine (one message)

```
posted ──(head of its seat's queue, body present)──▶ delivered(inbox) ──▶ [pane pointer attempts] ──▶ acked
   │                                                        │
   └─(body missing at delivery)──▶ bounced                  └─(unacked 4 tries or 30 min, or seat unreachable)──▶ paged (still open)
```

- **Order: one open message per seat.** The head is the lowest-id unacked, un-bounced, ack-required message to that seat; later ones stay `posted` ("queued") and do not appear in the inbox file until the head is acked. This is the cure for crossed dispatches (e): a lane never holds a NEXT and a FIX at once. `ctl inbox` still lists the queued ones.
- **`delivered(inbox)`**: append the ledger line to `inbox/<seat>.jsonl`; record `inboxed_ts`. A seat with a live watcher (heartbeat < 10 s old) sees it within one poll.
- **Pane tier.** A WATCHED seat (heartbeat < 10 s old) gets the pane tier only when it is idle (`pane_state` = `ok`) and 120 s have passed without an ack; while it is `busy` the pane tier is skipped altogether (its Monitor event is already queued in its session, and a pasted pointer on top would be a second delivery of the same text), up to the 30-min page. An UNWATCHED seat gets the pane tier at once (every lane; any seat whose 30-min Monitor expired — self-healing, no config). Then attempt a pane pointer when due: attempts at 0, +3 min, +10 min, +20 min (`CTL_POSTMAN_BACKOFF`); after a PROVEN delivery (echoed above the prompt with a new spinner, or the queued-messages hint) the next attempt waits 15 min, because the seat has the text and is just busy. Each attempt first runs `pane_state` (§6).
- **Ack**: `ctl ack <id>` creates `acks/<id>` exclusively. Presence is checked at the top of every pass and again just before a paste. Terminal.
- **Page**: once per message (`state.paged`), when tries ≥ 4, or open > 30 min, or the seat has been unreachable (dead/menu/box-text/copy-mode) > 5 min (dead window: 2 min). A page is a `kind=page` message from `postman` to `main` ("#42 → exec3 unacked after 4 tries, last: box-text"). If the target IS `main`, page `planner`; if the target is `planner`, append a `⚑` line to `CTL-TO-PLANNER-notes.md` (owner-visible). A page never blocks the original message; it stays open and keeps its slow retry.
- **Crash safety (at-least-once).** `state/<id>.json` is written with the attempt BEFORE the paste (`attempt n, ts`), and the outcome after. A kill between the two repeats the paste after the backoff, never loses it; the id in the text and the idempotent ack make a repeat harmless. A restarted daemon recomputes everything from ledger + acks + state.
- **Done.** The plan's fourth state (`done`) is dropped: completion is already the `DONE`/`TOOK` lines of the QUEUE files and the lane's DONE+REVIEW. `acked` is terminal for delivery.
- **Restart supersedes.** Under one-task-one-session a fresh session is started by `ctl restart` with its task as the launch prompt, so a message still open for that seat was addressed to a session that no longer exists and would otherwise jam the head of the queue (the postman re-pointing #42 at a session that never saw it, which is already working something else). Rule: **`ctl restart` supersedes every open message to that seat posted before the restart**: it writes `postman/restarts/<seat>` (epoch) and the daemon, on its next pass, writes `acks/<id>` = `cancelled-by-restart` for each such message and posts ONE `note` to `main` listing the ids and kinds, so the orchestrator reposts what is still wanted. A message posted AFTER the restart is untouched. Consequence for senders: **restart first, then post** (a `post` followed by a `restart` is cancelled). Follow-up, not MVP: the daemon also notices a changed `pane_pid` for a seat (a restart done by hand) and applies the same rule.
- **Operator escape**: `ctl ack <id> --cancel [--note T]` closes a message nobody should receive any more (writes the ack with `cancelled`).

## 5. The verbs

| Verb | What it does |
|---|---|
| `ctl post <to> --kind K (--body FILE \| --text STR) [--from SEAT] [--reply-to ID] [--dry-run]` | validate, allocate id under lock, append the ledger line, print `OK post #42 → exec3 (fix)`. `--from` defaults to the calling pane's window name (`tmux display -p -t $TMUX_PANE '#{window_name}'`). |
| `ctl inbox [--seat S] [--all]` | my unacked messages, oldest first (derived from ledger − acks, so a lost or replayed inbox file is harmless); `--all` includes acked. |
| `ctl inbox --watch [--seat S]` | the ONE inbox watcher (below). |
| `ctl ack <id> [--seat S] [--cancel] [--note T]` | idempotent; a second ack prints `OK ack #42 already acked <ts> by <seat>` and exits 0; the acking seat must equal `to` (refused otherwise; `--seat` overrides for the operator); an unknown id exits 1. |
| `ctl postman run` | the daemon loop (2 s poll; takes the lock `daemon.pid`; refuses a second instance; logs to `daemon.log`; never exits on an error). |
| `ctl postman once` | one pass (what the tests drive, with `CTL_POSTMAN_NOW`). |
| `ctl postman status` | one line per seat with open messages (head id, tries, last result) + daemon pid/alive. |
| `ctl postman audit` | the mechanism-(g) sweep: `DONE … FIX`/`needs-tip` lines in QUEUE-review.md whose branch has no ledger message in THIS verdict's window (the live scan: first seen − 10 min, NO upper bound; on demand: the line's own time − 10 min … the next verdict of the same branch); prints them (the daemon posts one `note` to `main` per finding, once). |
| `ctl postman rebuild-inbox` | **follow-up, not built** (§11): regenerate `inbox/*.jsonl` from the ledger and acks. |

**The inbox watcher** (`ctl inbox --watch`; B6: ONE per seat; Monitor timeout 30 min, re-armed on expiry): reads `inbox/<seat>.jsonl` from the byte offset in `cursor-<seat>-inbox` and prints, for each line whose id has no ack yet, the pointer line; flushes; THEN advances the cursor (a kill between read and emit replays the line). A MISSING cursor starts at 0, not EOF (unlike `watch-cursor.py`): replaying an inbox is safe because acked ids are skipped, and a lost cursor must never lose a message. A file that shrinks restarts at 0. Dedupe: acked ids skipped, plus an in-process set so one run never prints an id twice. **Single instance:** on start it reads `inbox-watch-<seat>.pid`; if that pid is alive and `ps -o args= -p <pid>` contains `inbox --watch` for the same seat, it SIGTERMs that exact pid (never `pkill`) and takes over, so a stray watcher that survived `/clear` (mechanism d) dies at the next arm. It touches `.hb` every poll (the daemon's "watched" signal). No regex filter exists, so a differently worded line cannot be dropped (mechanism f).

**Queue bridge** (the dispatcher's retirement path; `postman run` only): tails `QUEUE-dispatch.md` from `cursor-queue-dispatch` (first run: EOF; the 312 KB of history is never reposted) and parses exactly these grammars, nothing fuzzy. **What `<win>` means (measured in the file, 289 lines):** it is NOT reliably a window index. Of the 124 FIX + 141 MERGETIP + 23 NEXT + 1 CLOSE lines, the target token is `1`–`5` in 252, but also `lane1`/`lane3`/`lane4`/`lane5` (35), `7` (3 FIX lines, 03:20–04:56 today, a lane at a time when window 7 is `reviewerA` now), `orchestrator`, `planner`, and sometimes a BRANCH name or a path. **Resolution rule:** the target token must be `N` or `laneN` with N in 1–5; it is resolved to a window NAME through `tmux list-windows` (`exec<N>`), and the resolved name must match `exec*`. Anything else (`7`, `orchestrator`, `planner`, a branch, a window whose name is not `exec*`, a number with no window) is NEVER delivered: one `note` to `main` quoting the line. A mis-numbered FIX can therefore only be refused, never routed to a reviewer or the planner.

| Line | Message |
|---|---|
| `HH:MM NEXT <win> <brief-file> …` | kind `next`, to `exec<win>`'s window name, body = the brief path |
| `HH:MM FIX <win> <brief-file> …` | kind `fix`, same |
| `HH:MM MERGETIP <win> <branch> base=<B>` | kind `mergetip`, `--text` "Read the WHOLE file …/BRIEF-merge-tip.md and do it for branch <branch>, base <B>." |
| `HH:MM CLOSE <win>` | no lane message (a lane cannot close itself): `close` stays the manual `ctl close <win>`; the bridge posts a `note` to `main` ("CLOSE <win> needs `ctl close <win>`") |

`TOOK`/`DONE`/`NOTE`/`HOLD` lines are ignored by name. A line that STARTS with `HH:MM NEXT|FIX|MERGETIP|CLOSE` but does not parse (missing file, bad window) is never dropped: one `note` to `main` quoting it. With the pane tier ON the bridge writes a `DONE` line back into QUEUE-dispatch.md for the line it handled (`DONE <time> postman #42`), so the existing audit trail and any reader of that file stay valid. **In the shadow run (`CTL_POSTMAN_PANE=0`) it writes NOTHING back:** a `DONE` line closes the dispatcher's open line (the dispatcher works the oldest line without one), so a shadow write-back would make the postman, not the dispatcher, the one that skips the delivery (review FIX 1, F1).

## 6. `pane_state` — the checks before any paste (new in lib.sh, used by the daemon, optionally by `ctl dispatch`)

Returns exactly one token for `session:window-name` (an allowlist for "safe to type", everything else is refused):

| Token | Test | Daemon action |
|---|---|---|
| `no-window` | no window of that name | defer; page after 2 min |
| `not-claude` | `pane_current_command` does NOT match the claude signature `^[0-9]+\.[0-9]+\.[0-9]+$` (the measured form, `2.1.288`) or `claude`/`node` — an ALLOWLIST: a shell, `less`, `vim`, `python3`, `ssh` all fail it | **never type**; page after 2 min (a pointer line pasted into a shell would be EXECUTED) |
| `copy-mode` | `pane_in_mode`=1 | defer; after `CTL_POSTMAN_CM_CANCEL` (180 s) of unbroken copy-mode send `-X cancel` once, then proceed (an abandoned copy-mode is the failure; a user scrolling is given 3 min) |
| `menu` | the last `❯` line is `❯ <digit>.` (a permission/option menu; "a pasted Enter picks option 1") or no `❯` is on screen | defer; page after 5 min |
| `ours` | box holds real text beginning `[postman #<id>` (our own unsubmitted paste, mechanism c) | submit-pending: Enter presses only (`ctl_submit`), never a second paste |
| `text` | box holds any other real text (the owner or the seat typing) | defer, never clear; page after 5 min |
| `busy` | box empty, running spinner or queued hint | paste (Claude Code queues it); proof = queued hint |
| `ok` | box empty, idle prompt | paste; proof = echoed above the prompt with a new spinner |

Proof waits are capped at 8 s inside the daemon (`CTL_PROOF_TRIES=8`) so one slow pane cannot stall the others; an unproven paste is recorded `unproven` and the ack decides.

## 7. Failure table

| Situation | Detection | Result |
|---|---|---|
| Pane in copy mode | `pane_in_mode` | defer ≤ 180 s, then cancel once and send; counted as `defers`, not `tries` |
| Seat busy (long turn) | spinner / queued hint | pasted once (queued); next attempt only after 15 min; ack closes it; paged at 30 min open |
| Input box holds our own earlier paste | text starts `[postman #id` | submit-pending only, no second paste |
| Input box holds someone's text | any other real text | never cleared; defer; page at 5 min |
| Permission/option menu on screen | `❯ <n>.` / no prompt | defer; page at 5 min (never a blind Enter) |
| Dead seat (window gone, or claude not running) | `no-window` / `not-claude` | nothing typed; message stays posted/delivered; page at 2 min; delivered automatically when the window returns and is `ok` |
| Seat restarted with a message open | `postman/restarts/<seat>` newer than the message | `cancelled-by-restart` ack + ONE note to `main` listing the ids; a message posted after the restart is kept |
| Watched seat mid-turn | heartbeat fresh + `busy` | no pane paste (its Monitor line is queued); paged at 30 min |
| `$TMUX_PANE` unset (seat identity) | env empty | `--from` / `--seat` is required, else the verb fails (verified: this lane's Bash tool carries `TMUX_PANE`; a pane has its window name) |
| Seat acks twice / ack replayed | `acks/<id>` exists | second `ctl ack` is `OK … already acked`, no new file, no event |
| Ack from the wrong seat | `to` ≠ caller | refused (exit 1); `--seat` is the operator override |
| Ack for an unknown id | not in the ledger | exit 1 |
| Ack arrives while a paste is queued | ack file read before every paste | no paste; if it lands between check and paste: one harmless duplicate pointer, the seat's `ctl inbox` shows nothing open |
| Body file lost | `body` missing at delivery | `bounced`: a `bounce` message back to the sender and a page; never delivered |
| Body edited after post | `body_sha` ≠ file sha | delivered with ` (body changed since post)` appended; sender's responsibility |
| Inbox file lost / truncated | ledger is the source | `ctl inbox` unaffected; `postman rebuild-inbox`; a shrunk file makes the watcher restart at 0 (acked ids skipped) |
| Cursor file lost | `cursor-<seat>-inbox` absent | watcher starts at 0 and prints only still-unacked ids |
| Ledger lost | — | the one unrecoverable case; `roles/` is outside git. Plan B13's daily roll takes a dated copy (`LEDGER-<date>.jsonl.bak`) — flagged to the planner, not built here |
| Watcher expired (30-min Monitor) | `.hb` older than 10 s | seat counts as unwatched: the pane tier engages at once; on re-arm the watcher replays from its cursor |
| Stray duplicate watcher after `/clear` | pidfile with a live matching pid | the new watcher SIGTERMs exactly that pid and takes over |
| Two daemons | `daemon.pid` alive | second refuses (exit 1) |
| Daemon crash between state write and paste | `state` has `attempt n` with no outcome | the attempt repeats after the backoff (at-least-once) |
| Concurrent posters | `mkdir` lock on id allocation | unique ids, one valid JSON line each (tested with 20 parallel posts) |
| Scratch run aimed at live panes (or the reverse) | `CTL_TMUX_SESSION=gisik` with a non-default root, or the default root with another session | the daemon and `once` refuse: a test can never deliver to a live seat |
| Unparsable QUEUE-dispatch line | verb prefix without a valid grammar | a `note` to `main` quoting it, never dropped |
| Target is `main` / `planner` and unreachable | page chain | `main` → page `planner`; `planner` → `⚑` line in the notes file |

## 8. Migration plan (what stays manual)

1. **Build** (steps 2–3 after the go): verbs + daemon + tests on a scratch tmux session and ledger. No live seat touched.
2. **Shadow run** (follow-up flag; until it exists, run the daemon with the pane tier disabled by `CTL_POSTMAN_PANE=0`): `ctl postman run --shadow` in a tmux window `postman` on the LIVE ledger: the bridge posts messages and logs "would deliver", the pane tier is off. The dispatcher keeps delivering. The shadow bridge writes nothing into QUEUE-dispatch.md (§5), so the dispatcher's open lines stay open. The orchestrator compares ledger vs the dispatcher's actual deliveries (`DISPATCH-log.md`) for one gate cycle; any miss is a bridge bug. **Before the first live start the orchestrator deletes `roles/postman/`** (stale cursors written 07:57 by a guard-removal mutation: they would replay every QUEUE-dispatch/QUEUE-review line since).
3. **Cutover, lanes first** (pane tier only, lowest risk): the daemon runs unshadowed; the dispatcher stops delivering NEXT/FIX/MERGETIP and only watches. Then each of the orchestrator, the reviewers and the dispatcher's replacement duties arm ONE `ctl inbox --watch` Monitor and drop their regex monitors on QUEUE-gate/QUEUE-dispatch (the cards change in B12; each restart card's first step is `TaskStop` of every monitor, then arm).
4. **Retire the dispatcher** once the shadow log shows parity and one full release of lane traffic ran unshadowed.

What moves into the postman: delivery of NEXT/FIX/MERGETIP, proof of delivery (ack), the undelivered-FIX sweep (`audit`), the delivery half of `DISPATCH-log.md` (the ledger). **What stays manual (the orchestrator, per `ctl seats`/`LANES.md`):** deciding a lane's next task and writing a brief; the HOLD/overlap rules; reading a BLOCKED and answering it; `ctl close`; `QUEUE-review.md` as the shared claim-by-`TOOK` work queue (reviewers pull; a REVIEW line is not addressed to one seat); `QUEUE-gate.md` READY/RULING lines (the orchestrator's cursor watcher already covers them, and they stay the audit trail); every landing and every release.

Small changes to `ctl restart` in this task: it keeps the window's existing NAME (it used to rename the window to `exec<N>` at every restart, which orphaned a message addressed to the old name; window 10 reads `exec10` for that reason), and it writes the supersede marker of §4.

## 8b. MVP cut line (owner's speed ruling)

**MVP (one pass, the dispatcher can retire on this):** `post`, `ack`, `inbox` (+ `--watch`), `postman once/run` with the inbox + pane tiers, `pane_state`, the QUEUE-dispatch bridge, restart-supersede, `postman status`. **Follow-up, a second small task:** `audit`, `rebuild-inbox`, `--shadow`, the page chain into the notes file (MVP pages only `main`, and `planner` when the target is `main`), the pane-pid restart detector, the daily ledger copy.

## 9. Test plan (`scripts/ctl/test/postman.test.sh`, wired into `ctl selftest`; every case id carried in the test name)

Everything runs against a temp `CTL_POSTMAN_ROOT`, a scratch tmux session `ctlpm-$$` whose windows run `scripts/ctl/test/fakeseat.sh` (a bash script that draws `❯ <input>`, echoes a submitted line above the prompt with a spinner for ~3 s, shows the queued hint while busy), and `CTL_POSTMAN_NOW` as the clock. RED first.

- **Ledger/post**: schema exact; unique ids under 20 parallel posts; `--text` spools; missing body refused; bad seat name refused; bare number resolves to the window name; `--reply-to` acks.
- **Ack/inbox**: idempotent; wrong seat refused; unknown id refused; `--cancel`; inbox shows unacked only; a replayed inbox prints no acked id.
- **Watcher**: cursor advances only after emit (a `CTL_TEST_DIE_AFTER_READ` kill replays the line); missing cursor replays unacked from 0; duplicate watcher replaces the old pid; a shrunk file restarts at 0; heartbeat touched.
- **Bridge**: each grammar → the right message; first run starts at EOF; the same line twice → one message (`src`); an unparsable line → a `note` to `main`; TOOK/DONE/NOTE/HOLD ignored; `CLOSE` → a note.
- **State machine** (fake clock): inbox first, pane after the grace; watched vs unwatched grace; backoff ladder; proven delivery waits 15 min; ack stops redelivery; one open message per seat, in id order; page after 4 tries, exactly once, and the page chain (`main` → planner → notes); bounce on a lost body; crash between state write and paste repeats the paste; second daemon refused; live/scratch guard.
- **Pane safety** (real scratch panes): `ok` → pasted and echoed; `copy-mode` → nothing typed, then cancelled after 180 s; `not-claude` (a bash pane, and a `less` pane) → the pointer text NEVER appears in the pane; `menu` → untouched; `ours` → exactly one copy of the pointer and the box submitted; `text` → box unchanged; `busy` → pasted once, not again before 15 min; `no-window` → stays posted.
- Own mutation pass (≥ 1 mutation per case) before DONE: e.g. remove the shell refusal, advance the cursor before emitting, drop the exclusive create on acks, drop the lock, skip the ack re-check, page twice.

## 10. Open questions for the planner (recommendation first)

1. **Daemon host.** Recommend a tmux window `postman` (visible, restart-safe, matches every other seat) with `ctl postman status` read by the orchestrator's watch; launchd KeepAlive is the survivor of a tmux kill (the 02:03 mass exit) but then holds no terminal. Either works with the same verb. Note `ctl lanes` lists every window; the window name `postman` would appear there.
2. **Planner pane.** Recommend: NO pane tier for `planner` (the owner types there); inbox watcher plus the `⚑` page to the notes only. The `ok`/`text` checks already refuse to paste over typing, but an owner-facing pane should not be pasted into by a daemon.
3. **Ack discipline.** The pointer asks for `ctl ack <id>` in the same tool-call block as the first Read, so it costs one extra tool call, not a turn. A seat that forgets gets re-pointed (4 tries, then a page). Recommend accepting this; the alternative (auto-ack on echo-proof) acks a paste, not a reading.
4. **Cost.** The dispatcher is $89/week (one session + MCP stack, ~0.4 GB). The postman adds one daemon process (bash, no model) and ~one batched tool call per message; the 141 MERGETIPs are being removed by ctl tipmerge anyway.
5. **Shadow run** before cutover (§8.2): recommend one gate cycle, not a week, given the owner's speed ruling.
6. **Not in scope:** pushing REVIEW lines to a named reviewer (they stay a pulled queue); a launchd plist (§10.1).

## 11. As built — amendments and deviations (step 2–3, 2026-10-03)

Planner amendments (06:37): **A** the shadow run lasts until ≥ 20 deliveries AND one full gate cycle with zero misses or duplicates against the dispatcher's log; **B** `postman audit` and the planner-target page → `⚑` notes line moved from the follow-up into the MVP (both built: `audit` runs every pass and on demand, the page chain is `page` → `main`, `main` → `planner` + `⚑ POSTMAN` line, `planner` → `⚑ POSTMAN` line); **C** `pane_state` refuses a permission/option menu, copy mode and non-empty box text, one test per state with the idle-pane control in the same check (13.1960–13.1962; 13.1963/13.1964 do the same for the not-claude allowlist).

Deviations: (1) the ledger line has no `ack` field and gained `ref` (the branch a FIX/MERGETIP is about, from the queue line or the brief, or `--ref`; `audit` matches on it): a `note`, and every message to `planner`, is inbox-only and still ackable; (2) the pointer inlines a single-line `--text` of ≤ 280 chars and the whole line stays < 450 chars (the §3 "≤ 240" did not fit a MERGETIP); (3) `page` and `bounce` messages never page (they are the paging); (4) the restart marker is `now + 2 s`, so a message posted in the second before the restart counts as the old session's; (5) with the pane tier ON the bridge writes `DONE <line-time> postman #<id>` back into QUEUE-dispatch.md (a refused line gets `postman refused #<id>: <why>`); with it off (the shadow run) nothing is written back, since a DONE closes the dispatcher's open line (FIX 1, F1); (6) `audit` first sees a verdict at its first scan, waits 10 min (`CTL_POSTMAN_AUDIT_GRACE`) for a fix message with that `ref` posted no earlier than 10 min before that first scan (`AUDIT_LEAD`; the first build looked back an hour, so FIX 1's message satisfied an undelivered FIX 2 verdict 35 min later — FIX 1, F2), then posts ONE note to `main`; on demand, `postman audit` gives each of the last 300 verdict lines the window [its own time − 10 min, the next verdict of the same branch), the date rebuilt backwards from now (a line more than 12 h later than the next one is the previous day). One message can still satisfy two verdicts of the same branch inside one 10-min lead (no sha is carried); (7) `--shadow` is not built: `CTL_POSTMAN_PANE=0` runs the daemon with the pane tier off (inbox + bridge + audit only), which is the shadow run; (8) a cursor that is not on a line boundary restarts the watcher at 0 (an inbox file rewritten shorter than the cursor but longer than its old self); (9) the suite uses `CTL_POSTMAN_CMD_RE` to let bash-hosted fake panes through the allowlist, and 13.1963 runs the DEFAULT allowlist against a bash pane.

Still follow-up: `rebuild-inbox`, the pane-pid restart detector, the daily ledger copy, the launchd plist.
