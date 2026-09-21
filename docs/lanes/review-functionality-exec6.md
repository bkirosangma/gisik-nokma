# Review — FUNCTIONALITY (executor 6, round 2): the engine and the wire

**Lane:** executor 6 (Opus 5) · **branch:** `exec6/review-functionality` · **base:** `origin/main`
**Started:** 2026-09-21 09:42:10 IST (T0 recorded by the controller: 09:41:50 IST; phase 1 closes 15:41:50 IST, phase 2 closes 18:41:50 IST)
**Every measurement in this report was taken at `a7b6292b78c50208e8055c9f8639b1e8dcf4caa0`**
(`Merge pull request #630 from bkirosangma/ctl/cycle36-rotation`) in
`/Users/kiro/my_projects/gisik-nokma-exec6`, with `node v22.22.2` in `PATH`, unless a finding says otherwise.

**This is review only.** No fix branch, no fix commit, no PR. Every mutation below was applied to a worktree file
and restored; the restore was verified by `cmp` against a pre-mutation copy, and the run count of every suite
verdict is stated next to its pass/fail count (a mutation that cannot parse runs zero tests and prints as a
survivor).

**Round-1 position.** `docs/lanes/review-functionality-exec3.md` (DeepSeek lane) is the landed round-1 report;
`docs/lanes/review-compiled-controller.md` ruled on it (7 accepted, 1 accepted-deferred, 0 rejected). Its own §2
names what it did not reach: *no line-by-line correctness review of `packages/rule-engine`, `packages/mcp-server`,
`packages/sync-client`, or `packages/domain`*; `mappers.ts` scanned, not read; the prototype comparison confined
to the `Visibility` roster. **Those are this report's targets.** Nothing in exec 3's §4–§6 is re-filed here unless
a measurement it lacks is added, and where that happens the finding says so.

---

## 0. THE ONE-LINE ANSWER

**No Critical claimed.** Sixteen findings, twelve Important, every one measured through a door the product ships. The recurring
shape is **a door that accepts what every read surface says cannot be happening**: writes on a soft-deleted ticket
(E6-2), a deleted open child blocking its parent while the board shows zero (E6-4), a type re-rank and a workflow
republish that leave hierarchies the engine then refuses to reproduce (E6-3, E6-8), a bulk migration refused
part-way while the client is told nothing moved (E6-10), an offline edit turned into a false contest against the
user's own ticket (E6-5), and an invite form whose channels the door refuses (E6-9). The second shape is **a record
that describes a world the product has left**: the in-app help denying `Delete` (E6-1), three ❌ cases declaring
guest admissions closed weeks ago (E6-12), and a "named, not decided" residual whose own commit decided it
(E6-11), and a release-gate instrument that reports drift on a correct database after an ordinary admin act, recorded as an unassigned open question since before its trigger shipped (E6-13). The third shape has one member and it is the one I would put first: **the cross-site defence covers writes and not the socket** — a cookie plus a foreign Origin is refused on `POST /v1/events` and served the victim's whole visible ledger on `/v1/stream` (E6-15) — and beside it, an MCP token that can approve its own successor, so revoking it does not revoke it (E6-16). The round-1 lane's coverage boundary was the map: all twelve Important findings are in the packages or the
paths it said it did not reach.

---

## 1. ENUMERATION — my universe, measured before any finding

| area | what is in it | measured count |
|---|---|---|
| `apps/server/src/routes/` | the route modules the brief calls "19" | **19 files** |
| `apps/server/src/` (all) | projections (19 incl. registry/rebuild/index), reads (18), visibility (4), permissions (2), sync (8), stream (2), notifications (4), auto-close, ingest, ledger (2), attachments (9), auth (10), gates (4), http (4), ops (6), seed (12), tools (6), alerts, workspaces (2), db (2) | **144 non-test `.ts` files, 30,588 lines** |
| `apps/server/migrations/` | every migration | **32 files**, prefixes `1787841717635` → `1790000000000`, strictly ascending |
| `packages/domain/src/` | event vocabulary, state model, invariants | **41 files, 5,965 lines** |
| `packages/rule-engine/src/` | checks (11), rules (7), engine/evaluate/transition/contests/version-map | **28 files, 3,382 lines** |
| `packages/sync-client/src/` | engine, outbox, precheck, replica (3), storage (4), transport | **13 files, 3,944 lines** |
| `packages/mcp-server/src/` | the MCP surface: tools (3), session, device-login, token-cache, http-client | **12 files, 788 lines** |
| `packages/app-core/src/online/` | wire mappers + HTTP data source | **11 files, 4,399 lines** |
| `packages/app-core/src/replica/` | the offline data source | **1 file, 1,500 lines** |
| `scripts/` | the checkers | **9** `check-*.mjs` (+ `help-content.mjs`, `mint-apple-client-secret.mjs`, `restore.sh`) |
| `test-cases/` | every case id | **2,606 ids across 25 files** (the brief says 2,601; `node scripts/check-case-ids.mjs` → `2606 unique ids, highest 17.006`) |

**Route modules beyond `routes/`** (the brief's "19" is the directory, not the door set): `auth/routes.ts`,
`stream/routes.ts`, `sync/sync-routes.ts`, `sync/contests-route.ts`, `sync/reconcile-route.ts`, and `app.ts`
(`/healthz`). exec 3 §1 measured 54 registrations after widening; I inherit that number as *theirs* and re-measure
only where a finding needs it.

**Case ids in this concern**, per file, by the checker's own two regexes (`ID_LINE`, `ID_LINE_BT` from
`scripts/check-case-ids.mjs`), with the status split each file carries:

| file | ids | ✅ | ❌ | 🟡 | 🧪 | 🚫 | no marker |
|---|---|---|---|---|---|---|---|
| `03-foundation-ledger.md` | 130 | 126 | 0 | 0 | 2 | 2 | 0 |
| `04-workflow-engine.md` | 53 | 52 | 0 | 0 | 0 | 1 | 0 |
| `05-tickets-hierarchy.md` | 75 | 73 | 0 | 0 | 0 | 1 | 1 |
| `06-auth-visibility.md` | 144 | 111 | 20 | 2 | 0 | 11 | 0 |
| `07-api-realtime-search.md` | 263 | 241 | 11 | 2 | 0 | 2 | 7 |
| `12-offline-sync-apps.md` | 347 | 333 | 2 | 6 | 2 | 4 | 0 |
| `14-mcp-server.md` | 88 | 87 | 0 | 0 | 1 | 0 | 0 |
| `16-remaining-doors.md` | 99 | 97 | 0 | 1 | 0 | 1 | 0 |
| **core of this concern** | **1,199** | | | | | | |
| `11-calendar-notifications.md` (notifications half) | 174 | 170 | 1 | 0 | 0 | 0 | 3 |
| `13-plan11-seams-and-scheduler.md` | 95 | 71 | 10 | 4 | 8 | 2 | 0 |
| `13-deploy-and-ops.md` | 104 | 87 | 5 | 0 | 11 | 1 | 0 |

**1,199 core ids is not a number I can walk one by one in a six-hour phase.** §2 states the sample I took and how it
was chosen.

---

## 2. COVERAGE — what I reached, what I did not, and how the graph was used

_(written last; every subsection below is filled in as the work lands)_

### 2.1 Graph and semantic-search usage — the honest result

**What I ran, in order, before opening any source file:**

1. `graphify-out/GRAPH_REPORT.md` — header (`10970 nodes · 19700 edges · 705 communities`, built from `e2769d60`;
   HEAD `a7b6292b` differs by two doc-only merges), the **God Nodes** list and **Surprising Connections**. Result:
   the god nodes are test scaffolding (`createTestDatabase()`, `TestDatabase`, `testEnvelope()`, `stubServices()`)
   and two coordination documents; the one production symbol in the top ten is `buildProjectionRegistry()`. The
   five "surprising connections" are all `main() → evaluateEvent()` INFERRED edges, which is the ingest pipeline
   and not a surprise.
2. The **Community Hubs** index (lines 17–690), filtered to my universe with
   `grep -nE 'apps/server/src|packages/(domain|rule-engine|sync-client|mcp-server)/src|app-core/src/(online|replica)|scripts/check'`
   → **one line**, a superseded coordination note about `check-migration-order.mjs`. The hub list is a flat list
   of basenames (`event-store.ts`, `check-permission.ts`, `routes/tickets.ts`, `canSee`, `evaluateEvent`,
   `replica-data-source.ts`, `workflow.ts`, `vocabulary.ts` …) with no path and no edge counts, so it names the
   load-bearing symbols but cannot tell me which file to open for a *behavioural* question.
3. **So I enumerated from the filesystem** (`find`, `ls`, `wc -l`) — §1 — and used the graph's hub names as a
   checklist of symbols to reach (`canSee`, `evaluateEvent`, `check-permission.ts`, `event-store.ts`,
   `replica-data-source.ts`, `workflow.ts`, `vocabulary.ts` — all reached; `sweep-orphans.ts`, `timeline-model.ts`,
   `my-work.ts` — not reached, listed in §2.3).
4. `mcp__semble__search` against the worktree root, three queries:
   - *"evaluate an event against workflow transitions and refuse with a reason"* → pointed at
     `rule-engine/src/checks/workflow-rebind.ts:93`, `workflow-defined.ts:8`, `transition.ts:1`,
     `memory-context.ts:49`, `app-core/src/views/ticket-sheet.tsx:658` — the first three are where E6-2/E6-8
     were measured.
   - *"invite mint refuses owner role and guest with projectIds"* → `invites/acceptance.ts:182`,
     `routes/invites.ts:324`, `online/invites-admin.ts:30`, `domain/src/events/invites.ts:111`,
     `web/…/members/page.tsx:720` — the last of which is where E6-9 was found (the channel select sits 120 lines
     below the hit).
   - (§7) the prototype comparison used plain `grep` over the export, since semble indexes the repo, not the
     staged export.

**Tokens saved:** the graph did not save me reading — it saved me *guessing*. The report's hub names and the two
semble hits are what put E6-2, E6-8 and E6-9 in files I would otherwise have reached only by walking 144 server
files. What it could not do is answer a behavioural question ("does X refuse Y"); every one of those was
answered by a probe (Appendices A–H).

### 2.2 Reached — named, with the method

**Read line-by-line (code lines, comments skimmed):** `packages/rule-engine/src/` — `evaluate.ts`, `engine.ts`,
`transition.ts`, `version-map.ts`, `workflow-defined.ts`, `checks/{hierarchy,membership,ticket-type,close,
deletion,context-helpers}.ts`, `rules/{require-different-user,restrict-to,require-evidence,require-comment,
require-field}.ts` (14 of 28 files). `packages/domain/src/` — `vocabulary.ts` (registrations), `validate-workflow.ts`,
`workflow.ts:151-191`, `rank.ts`, `clock-skew.ts`, `events/{invites,workspace-settings,visibility,ticket-events}.ts`
(schemas), `filter-spec.ts:115-170`, `ticket-types.ts:98-160` (10 of 41). `packages/sync-client/src/` —
`outbox/outbox.ts` (whole), `engine/sync-engine.ts:844-972` (flush), `precheck/local-context.ts:120-160`,
`net/http-transport.ts` (skimmed), `storage/*` (not opened) — 3 of 13. `packages/mcp-server/src/` —
`tools/{write-tools,read-tools}.ts`, `token-cache.ts`, `http-client.ts`/`session.ts` (grep only) — 4 of 12.
`packages/app-core/src/online/` — `mappers.ts:903-1001` (ingest results, filter spec), `online-data-source.ts:480-496`,
`invites-admin.ts:30-41`; `replica/replica-data-source.ts:1388-1408` (ingest/flush) — the rest of the 1,500 lines
not opened. `apps/server/src/` — `ingest/ingest-service.ts` (whole), `permissions/check-permission.ts` (the gate
functions and the membership branches; ~400 of 1,342 lines), `visibility/can-see.ts` (whole), `projections/
{tickets,proj-memberships,ticket-types}.ts` (the readers and `apply`), `routes/{list,builder-reads,invites,
attachments,tickets,notifications,mcp-device}.ts` (the routes named in findings; not every handler),
`read/{visible-where,restricted-parents}.ts`, `notifications/{fanout,sweep,store}.ts` (grep + the cited blocks),
`auto-close/sweep.ts:176-206`, `sync/{sync-service,reconcile-route}.ts`, `stream/hub.ts:213-420`, `gates/
evidence-gate.ts`, `auth/auth.ts:150-360` and `app.ts:477-612` (rate limits), `mcp/token-store.ts:1-80`,
`tools/sweep-orphans.ts:100-125`, `tools/verify-projections.ts` (whole), `attachments/sniff.ts:36-50`,
`sync/contest-coherence.ts` (whole), `read/ancestry.ts` (whole), `http/http-origin.ts:128-172`, `:255-265`
(the set, its exclusions and the predicate), `stream/routes.ts:262-267`, `test/helpers/stream.ts` (used),
`deploy/do/app.yaml:1-10`, `:119`, `routes/tickets.ts:396-446`, `:548-560`,
`:617-670`, `routes/mcp-tokens.ts:72-80`, `auth/synthetic-address.ts` (whole), `ledger/event-store.ts:135-156`.
`packages/rule-engine/src/contests.ts:1-45`; `packages/domain/src/ticket-state.ts:99-200` (the reducer's cases);
`packages/sync-client/src/replica/replica.ts` (grep for `workflow.defined` / `foldTicketToWorkflowVersion`
only — it refreshes on publish at `:285`, `:420`). `scripts/` — `check-case-ids.mjs` (header + regexes),
`check-no-silent-skips.mjs` (whole), `check-skipif-coverage.mjs` (whole), `check-db-timezone.mjs` (whole),
`check-migration-order.mjs:1-60`, `check-case-citations.mjs:1-40` — **6 of 9 read; `check-env-example`,
`check-runbook-commands`, `check-task-ledger` run only** (all 9 were run green by exec 3; I re-ran `case-ids`,
`case-citations`, `no-silent-skips` (with mutations), `db-timezone` against both live DBs).

**Measured by probe** (Appendices A–K, 11 runs, every one 1 file / 1 test passed with its `console.log` lines
in the log): writes on a deleted ticket; type re-rank; deleted children/parents; outbox overtake; ghost ticket
on both doors; invite channels; bulk rebind under an admin not on a project; deleted epic header; guest doors.

**Case ids:** every ✅ id in the eight core files is cited by name in a test (`check-case-citations` ratchet:
0 uncited in each). By §1's counter (the status marker that follows the id — the first marker on the line), the
eight files hold **1,120 ✅ · 33 ❌ · 11 🟡 · 5 🧪 · 22 🚫 · 8 unmarked = 1,199**. I listed every ❌/🟡/🧪 line
with a second script whose regex matched a marker *anywhere* on the line; it printed 55 lines, of which 6 are ✅
cases whose prose says "Was ❌" or carries a 🟡 mid-sentence (7.14, 7.241, 12.13, 12.16, 12.327, 12.328) — so
the instruments disagree by exactly those six, and §1's is the one this paragraph counts by. **I read all 49
❌/🟡/🧪 headlines** and measured **7** of them against the product: 6.51, 6.77, 6.123 (E6-12 — stale), 6.58 and
6.84 (still true of the projection's own robustness; the door refuses both inputs, so not filed), and — from
the ✅ set — 7.45 and 12.144 (sentences a new input falsifies: E6-10, E6-5) and 4.23 (bypassed: E6-8). Sample
size: 5 of 49 gap ids, 3 of 1,120 ✅ ids; **I did not walk the other 1,117 ✅ ids one by one.**

### 2.3 Not reached — named rather than implied

- `packages/rule-engine`: `memory-context.ts` (used, not reviewed), `refusal-rules.ts`, `checks/{rank,
  workflow-rebind,refusals,test-support}.ts` (`fields.ts` read at `:116-130` only), `fixtures/harness.ts`,
  `rules/{index,types}.ts`; `contests.ts` beyond `:45`.
- `packages/domain`: 30 of 41 files, including `entity-state.ts`, `ticket-state.ts` outside the reducer's event
  cases (`:1-98`, `:200-496` — `foldTicketToWorkflowVersion` in particular, used by the probes and not read), `submit.ts`, `parse-event.ts`, `envelope.ts`, `ids.ts`, `prefix.ts`, `ist-day.ts`,
  `doc-*.ts`, `simple-kanban.ts`, `stream-frames.ts`, `read-models.ts`, `notification*.ts`, `preferences.ts`.
- `packages/sync-client`: `replica/replica.ts` (1,312 lines; two lines grepped), `storage/*`, `engine/sync-engine.ts` outside the
  flush loop (bootstrap, subscribe, reconcile, `stall`).
- `packages/mcp-server`: `device-login.ts`, `lazy-session.ts`, `login-prompt.ts`, `main.ts`, `config.ts`.
- `packages/app-core/src/online/`: `mappers.ts` outside `:903-1001` (≈2,350 lines), `stream.ts`, `http.ts`
  (grep only), `founding.ts`, `invites.ts`, `my-invitations.ts`, `notification-preferences.ts`,
  `notifications.ts`; `replica/replica-data-source.ts` outside `:1388-1408`.
- `apps/server/src`: 12 of 19 route modules not opened beyond a grep (`attention`, `auth-methods`, `board`,
  `events`, `mcp-tokens`, `my-invitations`, `my-work`, `notification-preferences`, `preferences`, `search`,
  `ticket-history`, `workspaces`); projections other than the three named; `read/` other than the two named;
  `sync/{contests-route,snapshot-*,stream-seq,sync-routes,ledger-deps}.ts`; `ledger/event-store.ts` beyond
  `readLedger`, `ledger/snapshot-store.ts`;
  `ops/*`; `seed/*`; `http/{security-headers,hsts,rate-limit}.ts` beyond a grep; `auth/*` other than `auth.ts` and `synthetic-address.ts` (whose guard hides a synthetic
  address in rosters and is not consulted by the magic-link door — safe only because `.invalid` never resolves;
  noted, not filed); `tools/{sweep-invite-tokens,sweep-notifications,
  sweep-user-preferences}.ts`; `visibility/{grant-backfill,rollup,visible-events-for,
  visible-tickets}.ts` (rollup opened at `:258-266` only); `alerts/`, `workspaces/`.
- **No browser, no pixel, no `apps/web` beyond `members/page.tsx:720-856`, no `apps/mobile`, no
  `apps/desktop`.**
- **No full server suite run**, deliberately (rules §4); every measurement is a single probe file, so
  "the suite stays green with X mutated" is a sentence this report never says — exec 3 owns those.
- **Migrations:** numbering and the dev DB's applied set (E6-7, Appendix E) only; no migration's SQL was read for
  correctness, no `down` was run.
- **The 18-site soft-delete sweep** — exec 3 §7.1 stands; I did not re-run it. I found predicate-**absent** view
  statements instead (E6-11's walk), which that sweep cannot see by construction.
- **Concurrency under real interleaving** (two clients racing the same entity) — reasoned from the lock order,
  not exercised.
- Time: this report was written between 09:42 and the phase-1 boundary; the reaching stopped where the clock
  did, not where the universe ended.


---

## 3. THE FIVE PARTS, DECLARED ONCE

Every finding below gives **WHAT** · **WHY** · **WHAT WOULD HAVE BEEN BETTER** · **THE MEASUREMENT** (command +
the line I opened) · **SEVERITY** (Critical / Important / Minor). Where I could not measure, the finding says
**unverified** and why. Finding ids are `E6-<n>`.

---

## 4. FINDINGS

### E6-1 — IMPORTANT — The in-app help tells the user a job cannot be deleted; the product ships `Delete`

**WHAT.** The shipped help content — `packages/app-core/src/help/content.generated.ts`, generated by
`scripts/help-content.mjs` from `docs/manual.md` and `docs/faq.md` (`help-content.mjs:54-55`) and rendered by
`help-browser.tsx` — carries three sentences that deny a shipped feature:

- `content.generated.ts:1927` ← `docs/manual.md:372`: **"You cannot delete a job."** *(followed by "If your stages
  include a 'won't do' or 'cancelled' stage, moving it there is the nearest thing available.")*
- `content.generated.ts:7681` ← `docs/faq.md:220-221`: **"Can I delete a job I created by mistake?** No delete
  button or delete action was found anywhere. … Otherwise, assume it stays."
- `content.generated.ts:10693` ← `docs/faq.md:982`: listed under things unknown — **"Whether a job can be deleted.**
  No delete control was found."

Meanwhile the product has had a `Delete` control on the ticket sheet since `18d7e391` (2026-09-20 13:17 IST,
*"The ticket sheet's Delete is a history-retaining removal, and its navigation is gone"*):
`packages/app-core/src/views/ticket-sheet.tsx:1203` `submitTicketEvent('ticket.deleted', …)`, recorded as an owner
ruling in `Features.md:73` (*"The ticket sheet's `Delete` — a HISTORY-RETAINING removal with an undo (owner ruling,
2026-09-20)"*), with `ticket.restored` as its undo (`packages/domain/src/vocabulary.ts:201-204`).

**WHY it is wrong.** The help is a product surface (test-cases §15 owns it). A user who opens "Can I delete a job I
created by mistake?" is told to move it to a "won't do" stage and *"assume it stays"* — while the sheet in front of
them has a `Delete` button whose semantics (history retained, undo exists, hidden from every view, project-admin
only) are exactly the questions a FAQ entry exists to answer. The manual's bullet is a flat false statement. And
the timing rules out "not yet updated": `docs/faq.md` was last edited at `d89db1df` (2026-09-20 22:20 IST) and
`docs/manual.md` at `09d4bc93` (22:37 IST) — **both after Delete shipped (13:17 IST)** — and neither edit touched
these sentences. `check:help` cannot catch this: it proves `content.generated.ts` matches the markdown, not that
the markdown matches the product.

**WHAT WOULD HAVE BEEN BETTER.** The Delete PR's change set should have included the help — the workspace rule
that `Features.md` moves in the same change set applies with more force to the user-facing manual, since
`Features.md:73` *was* updated in that PR. Concretely: replace `manual.md:372` with the three facts a user needs
(who may delete — project admin; what happens — hidden from views, history kept; how to undo — the 15 s `Undo` on
the toast, after which the Delete PR's own list says *"there is no UI that emits `ticket.restored`, so a soft delete
becomes permanent in practice"*, `executor-state-history.md:687-691` — a sentence a user needs more than any other
on this page), rewrite
`faq.md:220-222` to answer *yes* and point at the undo, and drop the `faq.md:982` "unknown" bullet. The
prototype's own `faq-delete` entry (export `Gisik Nokma - Desktop.dc.html`, sha `3d142d46`) is the model:
*"The ticket stops appearing in views. Its history is retained, because other events cite it."*

**MEASUREMENT.**
```
grep -nE 'No delete button|You cannot delete a job|Whether a job can be deleted' packages/app-core/src/help/content.generated.ts
  → 1927, 7681, 10693 (all three present)
sed -n '220,222p' docs/faq.md ; sed -n '372,373p' docs/manual.md          (opened, quoted above)
git log -1 --format='%h %ci' -- docs/faq.md    → d89db1df 2026-09-20 22:20:51 +0530
git log -1 --format='%h %ci' -- docs/manual.md → 09d4bc93 2026-09-20 22:37:41 +0530
git log --format='%h %ci' -S"submitTicketEvent('ticket.deleted'" -- packages/app-core/src/views/ticket-sheet.tsx | tail -1
  → 18d7e391 2026-09-20 13:17:51 +0530
grep -nE 'cannot delete a job|No delete button' docs/lanes/review-*.md test-cases/*.md → no matches (not previously found)
```
**Related, Minor, folded in rather than filed separately:** `apps/server/src/permissions/check-permission.ts:1072-1073`
attributes the sentence *"The ticket stops appearing in views"* to *"the FAQ's own sentence"*. `grep -rn 'stops
appearing' docs/faq.md docs/manual.md` → **no match**; the sentence is the **prototype's** `faq-delete` entry (as
`vocabulary.ts:203` correctly says). A docblock that cites "the FAQ" for a sentence the FAQ never carried is the
class the round-1 rulings named (*"cited a sentence from a file that never contained it"*).

**SEVERITY: Important.** A shipped help surface contradicting a shipped control, on the one action whose
consequences (disappearance from every board) a user most needs explained, and on a path where the undo is
otherwise undiscoverable from the help.

### E6-2 — IMPORTANT — The ingest door accepts every ordinary write against an already soft-deleted ticket, and `ticket.assigned` on one manufactures an inbox notification that points at a 404

**WHAT.** Through the product's own door (`POST /v1/events`, session-authenticated, owner actor), against a ticket
whose detail door already answers **404** and whose comments door answers **404**, the server **commits**
`ticket.assigned`, `comment.added`, `ticket.transitioned`, `ticket.field_set` (title), `ticket.collaborator_added`
and `visibility.set` — **byte-identical answers to the same eight-event battery run against a live ticket in the
same run** (the two refusals, `ticket.closed` → `close-requires-terminal` and `ticket.ranked` →
`rank-requires-backlog`, are state-of-workflow refusals and fire identically on the live control). Afterwards
`proj_tickets` for the deleted ticket reads `{state_id: "doing", deleted_at: <set>, assignee_id: <peer>}`. And the
`ticket.assigned` fanout inserted an `assignment` row for the peer, which `GET /v1/me/notifications` **serves** to
the peer (200, `"ticketTitle":"to be deleted"`), while the peer's own `GET /v1/workspaces/:ws/tickets/:id` for that
ticket answers **404**.

**WHY it is wrong.** Three reasons, each measurable:

1. **The product's own stated rule is broken.** `apps/server/src/notifications/sweep.ts:175-177`: *"A notification
   is a VIEW — it appears in a person's list — so a soft-deleted ticket must not arrive there."* The due-soon sweep
   honours it (`AND ${LIVE_TICKET_WHERE}` at `:187`, `:265`); the assignment fanout does not, and the inbox read
   (`notifications/store.ts:128-130`, `SELECT … FROM notifications WHERE …`) joins nothing and filters nothing.
2. **The fanout's docblock rests on a false premise.** `notifications/fanout.ts:101-107` says the fanout *"runs on
   a claim that has just COMMITTED, about a ticket the actor could see at the time … A ticket deleted in the same
   instant is a race … the soft-delete predicate belongs to the READS that render notifications
   (`notifications/sweep.ts` filters at the source)"*. Measured: there is no race — the delete committed *before*
   the assignment and the door still committed it; `canSee` is not "live" (the repo says so itself:
   `visible-where.ts:137-138` *"A deleted ticket is still VISIBLE in the `canSee` sense"*); and `sweep.ts` is not
   the read that renders notifications — it is the due-soon/stale *producer*; the read is `store.ts:128` and it
   filters nothing.
3. **The engine asks about `deleted` in exactly one file.** `grep -rn deleted packages/rule-engine/src` (code
   lines only) → `checks/deletion.ts:64` (`already-deleted`) and `:85` (`not-deleted`); no other check reads the
   flag. Of the 34 registered event types, **18 are not dispatched by `evaluateEvent` at all** (set difference of
   `vocabulary.ts` registrations against `evaluate.ts` cases: `attachment.added comment.added invite.*
   project.* ticket.assigned ticket.collaborator_* visibility.set workspace.*`), and for the ticket-scoped ones
   the only gate is `checkVisibilityPermission`'s `canSee` (`check-permission.ts:1048`). So a state change on a
   ticket that *"stops appearing in views"* is applied where nobody can review it, its comment lands in a thread
   the comments door refuses to serve (case 16.72), and a `Restore` brings the ticket back in a state and with an
   assignee nobody saw set.

**This is not a ruled divergence.** The nearest ruling is the Delete PR's own list (`executor-state-history.md:674-678`,
"NAMED, NOT COVERED" item 1): *"a delivered notification stays exactly as delivered even after the underlying
ticket's visibility narrows … 'a message you were sent is yours; revocation removes future sight, not letters
delivered'"* — a ruling about letters delivered **before** the ticket went away. E6-2's letter is composed **after**
the delete, about a ticket already gone; the ruling does not reach it, and the fanout's own sentence (*"a ticket the
actor could see at the time"*) shows it was not meant to. Beyond that: `visible-where.ts:173-178` explains why the *engine
context* must serve deleted rows — *"an engine that cannot see a deleted ticket refuses its own undo
(`ticket.restored`) with `unknown-ticket`"* — which is a reason for the context's reader, not a ruling that other
writes are accepted. Case `16.90` records *"`canSee` does not mean 'not deleted'"* as the reason the attachment
doors leaked, and the owner's ruling on that (*"attachments leak: do as you recommend"*, `16-remaining-doors.md:933`)
closed the **upload** door with `ticketIsLive` (`routes/attachments.ts:388`, cases `16.97`–`16.99`). So the
product's precedent is that a write door **refuses** a deleted ticket — and the six event types above are the
doors that were not walked.

**Doors this reaches in the product, not only in a probe.** (a) `packages/mcp-server/src/tools/write-tools.ts:144`,
`:163`, `:185` — `transition_ticket`, `add_comment`, `assign_ticket` submit with no read-before-write, so an agent
holding an id from an earlier `list` gets `committed` from the same product whose `get_ticket` answers not-found;
(b) `POST /v1/sync` wraps the same ingest (`ingest-service.ts:221-223`), so an offline replica that still holds
the ticket pushes its edits and gets no refusal and no contest; (c) any second user with the sheet open when the
delete lands — `ticket-sheet.tsx` closes only for the actor who pressed `Delete`.

**WHAT WOULD HAVE BEEN BETTER.** One rule, in the engine where the deleted flag is already read: a ticket-scoped
event other than `ticket.restored` (and `ticket.deleted` itself, which already refuses) is refused with a
`ticket.deleted`-family rule (*"This ticket is deleted; restore it first"*) — `checks/deletion.ts` already has the
lookup and the refusal vocabulary (`REFUSAL_RULES.alreadyDeleted`). That closes all six types on all three doors
at once, and it makes the fanout's premise true rather than asserted. The pass-through types (`comment.added`,
`ticket.assigned`, `collaborator_*`, `visibility.set`, `attachment.added`) need a dispatch arm; today they have
none. Then rewrite `fanout.ts:101-107` to say what is true.

**MEASUREMENT.** Probe file (verbatim in Appendix A), run once, 1 file / 1 test passed, raw output through
`rtk proxy` (rtk's filter had swallowed the console lines on the first run):
```
cd apps/server && pnpm exec vitest run test/zz-exec6-probe-deleted-writes.test.ts --no-file-parallelism
PROBE detail(deleted)=404 detail(live)=200
PROBE answers:                       (deleted ticket)      PROBE LIVE control answers:
  ticket.assigned            -> committed                  committed
  comment.added              -> committed                  committed
  ticket.transitioned        -> committed                  committed
  ticket.field_set           -> committed                  committed
  ticket.collaborator_added  -> committed                  committed
  ticket.closed              -> refused (close-requires-terminal …)   refused (same)
  ticket.ranked              -> refused (rank-requires-backlog …)     refused (same)
  visibility.set             -> committed                  committed
PROBE second ticket.deleted -> refused (already-deleted)          ← the flag IS read, by one check
PROBE comments read(deleted)=404
PROBE notifications rows for peer: 2   (assignment "to be deleted", assignment "live")
PROBE inbox(peer)=200 body={"notifications":[… "kind":"assignment","payload":{"ticketId":"<DELETED>","ticketTitle":"to be deleted" …
PROBE peer detail(deleted)=404
PROBE proj_tickets row after writes: {"state_id":"doing","deleted_at":"2026-09-21T04:29:34.673Z","assignee_id":"<peer>"}
 Test Files  1 passed (1)   Tests  1 passed (1)
```
Lines opened: `evaluate.ts:26-69` (dispatch, `:67-68` `default: return { refused: false }`), `check-permission.ts:1048`
(`canSee` gate), `can-see.ts:227-234` (reads `proj_visibility` only), `fanout.ts:101-107`, `:122`,
`sweep.ts:175-177`, `store.ts:128-130`, `deletion.ts:64`/`:85`, `write-tools.ts:144`/`:163`/`:185`.
Set difference: `grep -oE "^\s*type: '[^']+'" packages/domain/src/vocabulary.ts` (34) vs
`grep -oE "case '[^']+'" packages/rule-engine/src/evaluate.ts` (16) → 18 pass-through.

**SEVERITY: Important.** Not Critical: the actor could see the ticket, so nothing leaks and nothing is lost —
the ledger keeps it all. But the server accepts writes the product's every read surface says cannot be happening,
one of them produces a user-visible notification into a dead link, and the docblock guarding the path asserts a
premise the door does not enforce. It is the *"client believes what the server declined"* shape run backwards:
the server believes what its own reads decline.

### E6-3 — IMPORTANT — Re-ranking a custom ticket type is accepted with tickets already placed where the new rank forbids, so the ledger holds hierarchies the engine itself then refuses to produce

**WHAT.** `packages/rule-engine/src/checks/ticket-type.ts:50-64` is the whole of the `ticket-type.defined` check
beyond payload shape: it refuses a **built-in** type whose rank differs from its seed (`type.builtin-rank`) and
accepts everything else. Nothing asks whether tickets of a custom type already exist, nor where they sit. The
editor exposes the door: `ticket-type-editor-screen.tsx:336-345` is a bare `<input type="number" min={1}>` for
"Hierarchy rank", disabled only for built-ins. Measured with the engine's own memory context (probe in Appendix B;
1 file / 1 test passed):

```
re-rank feature 2→3 while a task sits under a feature      -> ACCEPTED
re-rank feature 2→4 (deepest) while a root feature exists  -> ACCEPTED
after 2→3: reparent task T under feature F (its CURRENT parent)   -> REFUSED hierarchy.rank: "Task" cannot go under "Feature" …
after 2→3: create a new task under F                       -> REFUSED hierarchy.rank …
after 2→4: reparent root feature F to null (its CURRENT position) -> REFUSED hierarchy.deepest-rank-parent-required: "Feature" … always belongs to a parent ticket …
after 2→4: create a new root feature                       -> REFUSED hierarchy.deepest-rank-parent-required …
```

**WHY it is wrong.** `child.rank > parent.rank` and `rank ≥ DEEPEST_RANK ⇒ has a parent` are invariants the
engine enforces at **six** write sites (`hierarchy.ts` create ×2, reparent ×2 — read at the lines — and the
refusal copy in `refusals.ts` says *"always belongs to a parent ticket"*, present tense, a claim about every
ticket of the type). The type-definition door walks around all six: after a re-rank, the product holds a task
under a feature it says a task cannot go under, and a root feature it says always has a parent. The user-facing
dead end is concrete: drag `T` out of `F` and try to put it back — refused with a sentence that describes the
placement it just came from. The editor's own copy (`rank.ts:38`, rendered at `ticket-type-editor-screen.tsx:594` as
`data-testid="rank-implications"`) makes the promise in the present tense as the admin types the new rank —
*"tickets of this type always belong to something bigger"* — and nothing makes it true for the tickets that exist.

**Not a ruled divergence.** Case `5.36` records *"custom types stay re-rankable"* — a decision that the **act** is
allowed, which this finding does not contest. It says nothing about tickets already placed under the old rank, and
case `5.9` shows the project knows a re-rank changes the legality of existing placements (*"reparenting under a
descendant after a rank re-definition made the loop rank-legal"*) — it guarded the cycle that a re-rank could
newly permit and not the placements a re-rank newly forbids. No case in `05-tickets-hierarchy.md` and no docblock
in `ticket-type.ts` or `hierarchy.ts` mentions existing tickets at re-rank time (`grep -nEi 'existing|re-?rank'`
over both → the two cases above only).

**WHAT WOULD HAVE BEEN BETTER.** The check has the context it needs: `ctx.getChildrenStates` and
`ctx.getEntityState` already serve the hierarchy checks. Refuse a custom re-rank when any ticket of the type is
in a position the new rank forbids — a child whose parent's rank is now `≥` the new rank, a parent whose child's
rank is now `≤` it, or a root ticket when the new rank is `≥ DEEPEST_RANK` — with the count in the refusal
(*"12 features would need a parent first"*). That keeps `5.36` (re-rankable when nothing is placed against it)
and makes the six write-site invariants true of the ledger rather than of the door. A cheaper honest alternative
is to record the decision that they are write-time-only and say so in the editor copy.

**MEASUREMENT.** Appendix B, run from `packages/rule-engine` with `pnpm exec vitest run
test/zz-exec6-probe-rerank.test.ts --no-file-parallelism` (imports `../src/*.js` relatively — no `dist` in the
path). Lines opened: `ticket-type.ts:50-64`; `hierarchy.ts:108`/`:228` (`type.rank >= DEEPEST_RANK`),
`:133`/`:281` (`type.rank <= parentType.rank`); `ticket-type-editor-screen.tsx:336-345`; `rank.ts:38`; `refusals.ts:86`;
`domain/src/ticket-types.ts:98` (`rank: z.number().int().min(1)` — no upper bound either) and `:136`
(`DEEPEST_RANK = 4`); `test-cases/05-tickets-hierarchy.md:25` (5.9), `:52` (5.36).

**SEVERITY: Important.** An invariant the product enforces loudly and in six places, with an admin-facing door
around all of them and a user-facing refusal that describes the state it is refusing to restore. Filed at
Important rather than Critical because it needs an admin act and nothing is lost.

### E6-4 — IMPORTANT — A soft-deleted open child blocks its parent's close with a refusal about a child no view can show; and new children can be created under, or moved to, a soft-deleted parent

**WHAT.** Measured through `POST /v1/events` (probe in Appendix C; 1 file / 1 test passed, with controls):

```
create P (story, root) / create C (task) under P / P: todo -> doing      -> committed ×3
delete C                                                                  -> committed
proj_tickets live open children of P (what a view counts):               0
P: doing -> done  (C deleted, C was open)  -> REFUSED parent-terminal-with-open-children:
                     "This ticket cannot enter "Done" while 1 of its child tickets is still open."
control: P2 -> done with a LIVE open child  -> the same refusal        (so the sentence is the ordinary one)
control: P2 -> done after its child is done -> committed               (so the door can accept)
create DP (story, root) / delete DP                                       -> committed
create LC (task) under DELETED DP                                         -> committed
reparent live C2 under DELETED DP                                         -> committed
GET list  -> 200: LC is a card, DP is not; GET board -> 200: LC present
```

**WHY it is wrong.** Two doors, one cause. `packages/rule-engine/src/transition.ts:134` counts
`children.filter((child) => child.stateCategory !== 'terminal')` over `ctx.getChildrenStates`, and the server's
reader behind it — `apps/server/src/projections/tickets.ts:263`, `SELECT * FROM proj_tickets WHERE … parent_id =
$2` — serves deleted rows **by documented design**: its docblock (`:214-235`) explains why the engine's by-id read
must not filter (the undo would refuse its own ticket) and then says, at `:232-234`: *"If a caller needs 'live
tickets only', that is the caller's predicate to add (`read/visible-where.ts`'s `LIVE_TICKET_WHERE`), never this
function's."* **The caller never added it.** The row it receives carries the flag — `tickets.ts` maps
`deleted: row.deleted_at === null … ? null : { actorId, at }` into `TicketState` — so one more conjunct in the
filter at `transition.ts:134` is the whole fix; instead the engine refuses with a count (*"1 of its child
tickets"*) that every view — the rollup (`visibility/rollup.ts:263`, `t.deleted_at IS NULL`), the board, the list
— reports as **0**. The user's only way out is to know that a deleted child exists, find it (no view lists it) and
restore it, close it, and delete it again — and the Delete PR's own list records that after the 15 s undo toast
**"there is no UI that emits `ticket.restored`, so a soft delete becomes permanent in practice"**
(`executor-state-history.md:687-691`, item 6), so from the product's UI the parent can never be finished.

The same reader is what `hierarchy.ts:123` (`getTicketState(ctx, p.parentId)`) and `:249` (`newParentId`) resolve
a parent through, so a **live** child is placed under a parent that *"stops appearing in views"*. The read side
already had to invent an answer for this (`routes/tickets.ts:419-431`: a deleted parent answers `restricted`,
*"there is a parent here whose name you do not get"*), which is an honest answer for a child that was orphaned by
its parent's deletion and a strange one for a child the actor just created there.

**Not a ruled divergence.** The Delete PR's item 7 (`executor-state-history.md:692-696`) names *"whether deleting a
parent should cascade, refuse, or orphan"* as open — that is the fate of **existing** children when their parent is
deleted; this finding is the two other directions (a deleted **child** blocking its live parent, and **new** children
placed under an already-deleted parent), which item 7 does not name. The recorded reason for the unfiltered reader is `ticket.restored`
(`projections/tickets.ts:216-222`), and that reason does not reach `getChildrenStates` — the restore check never
reads children. The docblock's hand-off sentence is the closest thing to a ruling and it rules the *opposite*
way: the predicate is the caller's to add. Cases `5.x` on the parent-terminal invariant (`05-tickets-hierarchy.md`)
do not mention soft deletion (`grep -n -i delet test-cases/05-tickets-hierarchy.md` → 6 lines, every one a SQL `DELETE` of a row or the deletion of a code line in a mutation, none a `ticket.deleted`), and the
soft-delete suites (`test/read/soft-delete*.test.ts`) never transition a parent.

**WHAT WOULD HAVE BEEN BETTER.** In `transition.ts:134`, `child.stateCategory !== 'terminal' &&
(child.deleted ?? null) === null` — a deleted child is not open work, which is the sentence the refusal is
about. In `hierarchy.ts:123`/`:249`, refuse a deleted parent with a rule of its own (*"That ticket is deleted;
restore it or pick another parent"*) — the check already refuses an unknown one. Both are one-line and both
are covered by fixtures the harness can express (Appendix B shows the shape).

**MEASUREMENT.** Appendix C; run from `apps/server` (`pnpm exec vitest run
test/zz-exec6-probe-children.test.ts --no-file-parallelism`, `rtk proxy` for raw output). Lines opened:
`transition.ts:134`; `projections/tickets.ts:214-235`, `:263`; `hierarchy.ts:123`, `:249`;
`routes/tickets.ts:419-431`; `visibility/rollup.ts:258-266`.

**SEVERITY: Important.** A user-facing dead end (a refusal citing a count the product shows as zero, with no
listed way to find the blocker), reachable from the ordinary path: delete a child, then finish the parent. Not
Critical: no data lost, workaround exists for someone who knows the cause.

### E6-5 — IMPORTANT — After a transient sync failure, a later claim overtakes the backing-off claim it depends on; the sync door turns it into a false, unresolved contest on the user's own ticket, and the edit is dropped

**WHAT.** `packages/sync-client/src/outbox/outbox.ts:333` selects the next batch as
`WHERE status = 'queued' AND next_attempt_at <= ? ORDER BY position LIMIT ?`. `recordFailure` (transient — a
transport throw, a short answer, a misaligned answer; `sync-engine.ts:870`, `:897`, `:907`) pushes `next_attempt_at`
of the **failed batch** out by `backoffMs(attempts)` (2 s on the first failure). A claim enqueued *after* the
failure carries the schema's epoch default and is due immediately. So the next flush — and the product flushes on
every enqueue, `replica-data-source.ts:1405` `void engine.flush()` — offers the newer claim **alone**, ahead of the
older claims it depends on. Measured on the outbox with its own fixtures (Appendix D; 1 file / 1 test passed):

```
PROBE batch1 (t0)        = [CREATE, RENAME-1]        ← transient failure recorded on this batch
PROBE batch2 (t0+500ms)  = [RENAME-2]                ← offered to the server BEFORE the ticket.created it depends on
PROBE batch3 (t0+2.5s)   = [CREATE, RENAME-1, RENAME-2]
```

**And what the server then does with it — measured through the real doors, not read** (Appendix G; 1 file /
1 test passed):

```
/v1/events field_set on never-created ticket -> refused (permission.visibility: This ticket is not visible to you.)
/v1/sync   field_set alone                   -> HTTP 200 {"status":"contested","rule":"permission.visibility",
                                                "reason":"This ticket is not visible to you.","contestEventId":…}
/v1/sync   create + rename-1 (2 s later)     -> committed, committed
proj_contested rows for the ticket: 1  {"rule":"permission.visibility","reason":"This ticket is not visible to you.","resolved":false}
ticket title now: "first rename"                                       ← the second rename is gone
GET /v1/me/work -> 200 … "contested":[{"ticketId":<the ticket>,"title":"first rename",
                                       "rule":"permission.visibility","reason":"This ticket is not visible to you." …
```

The gate refuses the unknown ticket as *invisible* (`check-permission.ts:1048` runs before the engine, and
`can-see.ts` answers unknown and invisible identically by design); `sync-service.ts:416-417` turns **every**
refusal of a ticket-entity event on the sync door into a `claim.contested`; the outbox records the contest and
clears the row (case 12.146). Net effect on the user's own screen: their second rename reverts, and **My Work shows
an unresolved contest on their own ticket saying it is not visible to them**, filed two seconds before the ticket
existed and false from the moment it did.

**WHY it is wrong.** The product states the ordering property and breaks it at the one boundary that matters.
Case 12.144 (`12-offline-sync-apps.md:905-907`): *"enqueue order is preserved … because a batch that lost the
order would send a `field_set` for a ticket the server has not been told about."* `sync-engine.ts:845`: *"one
drain at a time, so order holds."* `replica-data-source.ts:1404`: *"the outbox already owns ordering and retry."*
All three are true **within one due set** and false across a backoff boundary — 12.144 tests only a fully-due
queue, 12.148 (`outbox.test.ts:226`) tests only that the failed batch is held, and no case enqueues **after** a
failure. The realistic path is ordinary: work offline, connectivity returns flaky, the first push throws, the user
keeps editing the ticket they can see, the next push carries only the new edit. And the contest it manufactures is
the worst kind of record: a permanent, unresolved `claim.contested` whose reason is false and whose subject is the
claimant's own work.

**WHAT WOULD HAVE BEEN BETTER.** Head-of-line blocking is what "a queue preserves order" means for a dependent
stream: `nextBatch` should return nothing while the earliest queued row is not yet due — `ORDER BY position` first,
then compare the head's `next_attempt_at` (or `MIN(next_attempt_at)` over queued rows) against `now`. Independently,
the sync door should not contest a claim whose target ticket **does not exist** — `contest()` files a contest on a
ticket id the ledger has never seen, which is the *"existence claim with no evidence"* shape the brief names. Nothing
on the contest's own path asks: `contest-coherence.ts:18-35` binds the embedded claim's workspace, kind and id to
the envelope and nothing else; `rule-engine/src/contests.ts:14-24` (`evaluateClaimContested`) checks only
`origin === 'server'`; the entity↔workspace guard passes a head that does not exist. A plain `refused` there
(or a `contest()` that first asks `getTicketStateFromDb`) would let the outbox keep the row `failed` and visible
instead of minting a false contest.
And 12.144 should enqueue after a `recordFailure` and assert the batch is empty until the head is due.

**MEASUREMENT.** Appendix D (outbox, `packages/sync-client`, relative imports) and Appendix G (server doors,
`apps/server`, shared test Postgres). Lines opened: `outbox.ts:333`, `:412`; `sync-engine.ts:845`, `:870`, `:897`,
`:907`; `replica-data-source.ts:1404-1405`; `local-context.ts:126`; `check-permission.ts:1048`;
`sync-service.ts:416-417`; `outbox.test.ts:119`, `:167`, `:201`, `:226`; `12-offline-sync-apps.md:905-907`.

**SEVERITY: Important.** A user's edit reverts on their own screen and a false, unresolved contest appears against
their own ticket, after a transient network error, on the headline offline path. Filed at Important rather than
Critical only because the dropped claim is retained verbatim inside the contest row (`original_event`) and nothing
is lost from the ledger.

### E6-6 — MINOR — `check-no-silent-skips.mjs` prints `ok` on an empty report: an instrument with no positive control on its own universe

**WHAT.** `scripts/check-no-silent-skips.mjs:28` iterates `report.testResults ?? []` and `:77` prints
`ok (N skipIf-guarded file(s) checked, none fully skipped)` whatever `N` is. Measured:

```
echo '{}' > empty.json;               node scripts/check-no-silent-skips.mjs empty.json
  → check-no-silent-skips: ok (0 skipIf-guarded file(s) checked, none fully skipped)   EXIT=0
echo '{"testResults":[]}' > zero.json; node scripts/check-no-silent-skips.mjs zero.json
  → check-no-silent-skips: ok (0 skipIf-guarded file(s) checked, none fully skipped)   EXIT=0
```

**WHY it is wrong.** The check exists so that *"a guard that eats an entire suite"* cannot go green. A report
that names no files is the largest possible silent skip, and the checker greets it with `ok`. Its own sibling
knows the shape: `check-skipif-coverage.mjs:29` refuses with *"git ls-files returned zero test files -- the
detector is broken"* when its universe is empty. This one has no such control, so a shard whose filter matched
nothing, or a JSON reporter whose output shape changed (`testResults` renamed), reads as a pass at
`ci.yml:449`. The repo's own `check-case-ids.mjs` header says why this matters (*"A matcher that returns zero
results on every real file looks IDENTICAL, from the outside, to a matcher that never fires at all"*), and this
checker is the one of the nine that did not adopt it. **Latent, not live:** today the two `.skipIf(` files
(`apps/server/test/ops/pg-dump.test.ts`, `restore-drill.test.ts`) are under the covered prefix and no other
guard spelling (`.runIf(`, `describe.skip(`, `it.skip(`) is in use — measured with `git ls-files | xargs grep -lF`
— and CI has not executed the step since 2026-09-06 (every job `steps: 0`, `runner_name: ""`, already recorded by
the controller).

**WHAT WOULD HAVE BEEN BETTER.** Two lines: count the tracked `.skipIf(` files under the covered prefix (the
sibling already does this walk) and refuse when the report mentions fewer of them than exist — *"expected 2
skipIf-guarded files in this report, saw 0"* — so an empty or mis-shaped report is loud. Also `:49` should
recognise `.runIf(` (the same guard, inverted), or the sibling should refuse that spelling outright.

**MEASUREMENT.** The two commands above, run at `a7b6292b` with node v22.22.2. Lines opened:
`check-no-silent-skips.mjs:28`, `:49`, `:77`; `check-skipif-coverage.mjs:29`; `ci.yml:445-449`.

**SEVERITY: Minor.** The instrument's blind spot is real and demonstrated, but nothing in the tree currently
falls into it and the CI wire it sits on is dead for an unrelated reason.

### E6-7 — MINOR — Migration prefixes are hand-rounded and future-dated with no recorded convention, so the plans' own `node-pg-migrate create` produces a prefix below an already-applied migration for ~a day after each merge

**WHAT.** The last 13 migrations carry prefixes rounded to `…00000000` and spaced `1e11` ms (≈27.8 h) apart —
`1788600000000` … `1790000000000` — and each was **committed before the instant its prefix names**: e.g.
`1790000000000_proj-ticket-comments.sql` (prefix = `2026-09-21T14:13:20Z`) was committed `2026-09-20T22:20:51+05:30`
= `16:50Z`, 21 h early; `1789800000000_proj-tickets-deleted.sql` (prefix `09-19T06:40Z`) was committed `09-20T13:17
IST`, so its prefix was already in the past — the spacing is a counter, not a clock. The only recorded way to
create a migration is the plans' `pnpm --filter @gisik-nokma/server exec node-pg-migrate create <name>`
(`docs/superpowers/plans/2026-08-20-01-foundation-ledger.md:1902`, `:3116`; `…-07-editor-attachments.md:1918`),
which stamps the wall clock. Measured at review time:

```
node -e 'console.log(Date.now() < 1790000000000)'   → true   (now = 2026-09-21T04:46:45Z; the window closes 14:13:20Z = 19:43 IST)
dev DB (54330, read-only): pgmigrations rows 32; last = 1790000000000_proj-ticket-comments @ 2026-09-21T02:50:18Z
```

So until 19:43 IST today a migration created the documented way is numbered **below one already applied on the dev
database** — the exact shape `check-migration-order.mjs:1-45` was written after (*"could never run on any
database that had the higher one — and NOTHING failed"*).

**WHY it is wrong.** The checker mitigates but does not remove it: it refuses the new file against the base ref's
maximum — correctly — but only when it runs, and CI has run nothing since 2026-09-06; the other guard is the hot
stack's entrypoint aborting on `checkOrder`. Neither tells a developer *why* the tool's own output is refused, and
nothing in `apps/server/`, `docs/` or the migrations directory says "hand-number above the last prefix" — `grep
-rnEi 'round|prefix|migrate create' apps/server/README.md docs/*.md scripts/check-migration-order.mjs` → the
checker's own docblock only. Every merge of a rounded prefix opens a fresh window (the spacing exceeds a day), so
this recurs rather than resolves.

**WHAT WOULD HAVE BEEN BETTER.** Either use the clock (the tool's default) and let `check:migrations` do its
job, or record the convention in one place the plans point at (*"prefix = previous + 1e11; never below
`Date.now()`"*) — and make the checker say which of the two the file violated. Cheapest of all: refuse a prefix
in the future in `check-migration-order.mjs`, which turns the convention into a rule.

**MEASUREMENT — primary, permanent.** For each rounded-prefix file, prefix instant vs first commit instant
(`node -e 'console.log(new Date(<prefix>).toISOString())'` and `git log --diff-filter=A --format=%cI -- <file>`):

| file | prefix names | first committed | prefix was |
|---|---|---|---|
| `1788600000000_mcp-device-auth` | 2026-09-05T09:20Z | 2026-09-08T01:44+05:30 | past |
| `1788700000000_proj-projects-archived` | 09-06T13:06Z | 09-09T12:11+05:30 | past |
| `1788800000000_proj-invites-declined` | 09-07T16:53Z | 09-09T13:21+05:30 | past |
| `1788900000000_user-notification-preferences` | 09-08T20:40Z | 09-15T07:24+05:30 | past |
| `1789100000000_proj-tickets-closed` | 09-11T04:13Z | 09-17T11:25+05:30 | past |
| `1789200000000_proj-tickets-rank` | 09-12T08:00Z | 09-18T09:58+05:30 | past |
| `1789400000000_workspace-settings-auto-close` | 09-14T15:33Z | 09-18T13:12+05:30 | past |
| `1789500000000_proj-tickets-reopened-at` | 09-15T19:20Z | 09-18T14:31+05:30 | past |
| `1789600000000_proj-projects-description` | 09-16T23:06Z | 09-19T17:17+05:30 | past |
| `1789700000000_mcp-tokens-name` | 09-18T02:53Z | 09-19T18:40+05:30 | past |
| `1789800000000_proj-tickets-deleted` | 09-19T06:40Z | 09-20T13:17+05:30 | past |
| `1789900000000_proj-projects-prefix` | 09-20T10:26Z | (added under another name; `--diff-filter=A` empty) | — |
| **`1790000000000_proj-ticket-comments`** | **09-21T14:13:20Z** | **09-20T22:20:51+05:30 = 16:50Z** | **21 h in the future** |

So the prefixes are a counter stepping `1e11` per migration, not a clock — most are in the past by commit time
and the latest is in the future by nearly a day. Whether the *next* one is above `Date.now()` at the moment a
developer runs `node-pg-migrate create` depends only on how fast migrations land.

**Measurement — dated illustration (expires 14:13:20Z on 2026-09-21):** `node -e 'console.log(Date.now() <
1790000000000)'` → `true` at 04:46:45Z; the dev DB (Appendix E) had `1790000000000` applied at 02:50:18Z. Between
those instants a clock-stamped migration is numbered below one already applied. Lines opened:
`check-migration-order.mjs:1-45`; `apps/server/package.json:11`; the three plan lines.

**SEVERITY: Minor.** Loud when it fails (refusal or boot abort), but a recurring, undocumented trap on the path
the plans themselves document.

### E6-8 — IMPORTANT — A workflow republish can put a parent with open children into a terminal state, and `ticket.closed` (and the auto-close sweep) then accept it — the state the transition path refuses

**WHAT.** Case 4.23 (`04-workflow-engine.md:41`): *"A parent cannot enter a terminal state while any child is
non-terminal."* `transition.ts:132-142` enforces it. Two republish doors walk around it, measured in the engine's
memory context (Appendix F; 1 file / 1 test passed):

```
control: P (child C open) doing -> done by transition               -> REFUSED parent-terminal-with-open-children …
publish v2a: "doing" KEPT, category active -> terminal (P in it, C open) -> ACCEPTED
  after v2a: P.stateId=doing stateCategory=terminal; C open: open
after v2a: ticket.closed on P (terminal, child C still open)        -> ACCEPTED
publish v2b: "doing" DROPPED, stateMapping doing -> "done" (P in it, C open) -> ACCEPTED
  after v2b: P.stateId=done stateCategory=terminal
after v2b: ticket.closed on P (terminal, child C still open)        -> ACCEPTED
```

**WHY it is wrong.** `workflow-defined.ts:162-172` (Ruling 56(a), case 13.611) refuses the *demotion* of a kept
terminal state because *closed ⇒ terminal* must hold; it does not look at *promotion* (`active`/`open` →
`terminal`), and the mapping loop (`:79-161`) refuses a dropped **terminal** state mapped to non-terminal but
accepts a dropped **open** state mapped to terminal. Both leave a parent whose children are open sitting in a
terminal category — a state no `ticket.transitioned` can produce — and `checks/close.ts:39` asks only
`stateCategory !== 'terminal'`, never about children, so the parent can be closed over its open work. The
server's auto-close sweep does exactly that unattended: `auto-close/sweep.ts:186-199` selects
`state_category = 'terminal'` rows older than the workspace's threshold and appends `ticket.closed` — no
children check there either. The result is a *closed* parent with *open* children, which the product's own
create path treats as impossible (`hierarchy.ts` refuses adding work to a terminal parent, and the
`reopened-for-child` cause exists precisely so a terminal parent that gains live work is reopened).

**Not a ruled divergence.** Ruling 56(a) is quoted in full at `13-owner-requests-and-backlog.md:1428-1450`; its
subject is the `closed_at IS NOT NULL` beside a non-terminal category. Promotion is the mirror and is not
mentioned. `grep -nEi 'promot|non-terminal.*terminal|re-?categor' test-cases/04-workflow-engine.md
test-cases/10-workflow-builder.md test-cases/03-foundation-ledger.md` finds only 4.23 and the builder's category
picker (10.2, 10.84).

**WHAT WOULD HAVE BEEN BETTER.** Same shape as 56(a)'s fix: in `workflow-defined.ts`, when a kept state is
promoted to `terminal` or a dropped state is mapped onto a terminal one, refuse if any ticket currently in that
state has a non-terminal child (the context has `getChildrenStates`; the memory context already folds tickets on
publish, so the count is available) — or, cheaper, have `checks/close.ts` and the sweep refuse a parent with
open children, which closes the last door regardless of how the state was reached.

**MEASUREMENT.** Appendix F, run from `packages/rule-engine` (`pnpm exec vitest run
test/zz-exec6-probe-promote.test.ts --no-file-parallelism`, relative imports). Lines opened:
`transition.ts:132-142`; `workflow-defined.ts:79-172`; `close.ts:39`; `auto-close/sweep.ts:186-199`;
`04-workflow-engine.md:41`; `13-owner-requests-and-backlog.md:1428-1450`.

**SEVERITY: Important.** An invariant with a dedicated refusal and a dedicated case, bypassed by an admin act
and then compounded by an unattended job.

### E6-9 — IMPORTANT — The members page's invite form offers three channels; the door refuses two of them, and the one it accepts is not offered

**WHAT.** `apps/web/app/w/[workspaceId]/members/page.tsx:847-856` renders the mint form's Channel select with
exactly `email`, `sms`, `whatsapp`. The domain schema the mint door parses the claim with —
`packages/domain/src/events/invites.ts:70` `INVITE_CHANNELS = ['email', 'phone']`, `:73-75` *"requires channel
'email' or 'phone'"* — refuses two of the three. Measured through the real mint door (Appendix H; 1 file / 1 test
passed):

```
POST /v1/workspaces/:ws/invites  channel=email    -> 201 {"inviteId":…,"url":"http://localhost:3001/invite/…","expiresAt":…}
                                 channel=sms      -> 422 {"status":"invalid","code":"invalid-payload","message":"payload for 'invite.sent' v1 is invalid at channel: requires channel 'email' or 'phone'"}
                                 channel=whatsapp -> 422 (same)
                                 channel=phone    -> 201            ← accepted, and absent from the form
```

**WHY it is wrong.** An admin who picks `sms` or `whatsapp` — the two options that describe a phone number —
gets a 422 whose message names a value the form does not offer, so a phone invitation cannot be minted from the
shipped page at all. The same file states the rule it breaks, three hundred lines up, about the *role* select:
`page.tsx:728-729` *"offering a choice the door will reject is a form that lies about what it can do."* It has
been this way since the options first shipped — `7b45099e` (2026-09-02) added `whatsapp` to the page while
`INVITE_CHANNELS` was already `['email', 'phone']` at that commit (`git show 7b45099e:packages/domain/src/events/invites.ts:70`)
— and `452335ed` (2026-09-14, *"Migrate members page's Channel and Role selects to the shared Select"*) carried the
three values across. Nineteen days, because `apps/web/test/members-page.test.tsx` only ever posts
`channel: 'email'` (`:66`, `:263`) and asserts the body's *keys* (`:244`), never a non-email value.

**The prototype is not a defence.** The export's Invite screen offers the same three
(`Gisik Nokma - Desktop.dc.html`, sha `3d142d46`, `:754` `<option value="email">email</option><option
value="sms">sms</option><option value="whatsapp">whatsapp</option>`; Mobile `:1524`), and its `github.md:12`
says the invite model was *"corrected … to the door's own rules"* and lists *"`channel` (email/sms/whatsapp)"* —
but the door's rule is `email|phone`, so the prototype copied the **form**, not the door. Classified as the
common brief's category 3 for the door (no ruling found: `grep -rn whatsapp test-cases/*.md Features.md
docs/lanes/review-*.md` → nothing), and the product's own form/door disagreement is the defect underneath it.

**WHAT WOULD HAVE BEEN BETTER.** One source: the select's options built from `INVITE_CHANNELS` (exported from
the domain, already imported by the page's neighbours), with `phone` labelled for people (*"Phone (SMS)"*). And
a page test that submits each offered option and asserts the door's answer — the assertion the role select
already has.

**MEASUREMENT.** Appendix H, run from `apps/server`. Lines opened: `members/page.tsx:728-729`, `:847-856`;
`invites.ts:70`, `:73-75`; `routes/invites.ts:296-352` (the mint route: body schema `channel: { type: 'string' }`
at `:312`, the 422 at `:352`); `members-page.test.tsx:66`, `:244`, `:263`; export `:754`, mobile `:1524`,
`github.md:12`.

**SEVERITY: Important.** A shipped admin action is unreachable for phone-only invitees from the page built to do
it, with a refusal message that cannot be acted on, for nineteen days.

### E6-10 — IMPORTANT — The bulk rebind route can be refused part-way by the permission gate, leaving the type's tickets split across two workflows while the client is told "refused"; its docblock says that window is unreachable, and case 7.45 asserts "appends nothing"

**WHAT.** `POST /v1/workspaces/:ws/ticket-types/:typeId/migrate` (`routes/builder-reads.ts:851-1049`) is
`admins-only` (`:856`). Its pre-flight (`:870-955`) asks every *migration* question — unknown target state,
unmapped occupied state, same workflow, closed → non-terminal, `backlog` as a key — and then submits one
`ticket.workflow_rebound` per ticket through `ingestClientBatch` (`:1040`), which commits **one transaction per
event**. The pre-flight never asks the question the permission gate asks per ticket: `checkVisibilityPermission`
→ `canSee` (`check-permission.ts:1048`), and `canSeeResolved` (`can-see.ts:105-112`) answers **false for an
`admin` on a project-mode ticket whose project they are not on** — a designed state (`check-permission.ts:975`,
*"There is deliberately NO admin shortcut: an admin who wants to create work in a project joins it first"*).
Measured through the real doors (Appendix I; 1 file / 1 test passed):

```
admin peer GET T0 (in Q, admin on Q) -> 200;  GET T1 (in P, admin NOT on P) -> 404
before: T1=WF1 T0=WF1 T2=WF1
POST migrate as admin -> HTTP 422 {"status":"refused","rule":"permission.visibility","reason":"This ticket is not visible to you."}
after:  T1=WF1 T0=WF2 T2=WF1                     ← one ticket moved; the client was told "refused"
ticket.workflow_rebound events appended: 1
control: POST migrate as owner -> HTTP 200 {"status":"migrated","count":2}
```

**WHY it is wrong.** Three sentences in the record say this cannot happen, and one measurement says it does:

- `builder-reads.ts:842-846`: *"if ingest refuses or fails PART WAY through a batch it accepted the pre-flight of,
  earlier tickets stay moved. **Nothing this route can construct reaches that window — the pre-flight covers every
  refusal `checkTicketWorkflowRebound` can produce**"*. True of the engine's refusals; false of the gate's, which
  runs first (`ingest-service.ts:235-252`, the gate call at `:235-245` and its refusal at `:246-252`) and which the pre-flight never consults.
- Case 7.45 (`07-api-realtime-search.md:68`): *"The bulk rebind refuses up front and appends nothing"* — with a
  ledger-row-count control. The case's three refusals are the pre-flight's; the gate's refusal appends `n − k`
  rows and then says `refused`.
- The route's own answer is the *"client believes what the server declined"* shape run backwards: the client is
  told nothing moved (`MigrationOutcome` `refused` carries no count) while the server has moved every ticket the
  admin could see. The type-editor then displays a refusal and the type's tickets stay **split across two
  workflows** — the state the migration exists to end (`ticket-type-editor-screen.tsx:462-474` talks of "the
  divergence is OVER for these tickets") — and the admin cannot finish: re-running refuses on the same invisible
  tickets. Only an owner, or an admin who first joins every project the type has tickets in, can complete it.

**WHAT WOULD HAVE BEEN BETTER.** Ask the gate's question in the pre-flight: `canSee` over the selected ticket
set (or the cheaper `visibleTicketsWhere` join), and refuse **up front** with a count — *"3 tickets of this type
are not visible to you; ask an owner, or join their projects"* — so 7.45's sentence becomes true of this door
too. Alternatively, an owner-only door for migration; or the batch-scoped ingest transaction the docblock already
names as the real fix. And 7.45 should carry a fourth arm: an admin not on one project, asserting zero appends.

**MEASUREMENT.** Appendix I, run from `apps/server`. Lines opened: `builder-reads.ts:842-846`, `:856`,
`:938` (`ORDER BY ticket_id`), `:1040`, `:1041`; `check-permission.ts:975`, `:1048`; `can-see.ts:105-112`;
`ingest-service.ts:235-252`; `07-api-realtime-search.md:68`.

**SEVERITY: Important.** A documented "cannot happen" that happens for an ordinary admin, producing a
half-migrated type, a false refusal, and no way forward from the page.

### E6-11 — MINOR — The list serves a soft-deleted epic's title as a group header; the detail door withholds the same title as "the deleted ticket's content" — both decisions landed in the same commit, one as a ruling and one as a deferral

**WHAT.** `GET /v1/projects/:id/tickets?groupBy=epic` labels each group with the epic's title
(`routes/list.ts:274-278`, `titleOfEpic`), resolved by `epicAncestors` (`:384-452`): a recursive walk up
`proj_tickets` joined to `proj_visibility`, filtered by `${visible}` at every hop and by **nothing about
`deleted_at`**. Measured through the real doors (Appendix J; 1 file / 1 test passed):

```
before delete: list groups = [{"label":"SECRET EPIC TITLE","cards":2}]
delete the epic                                            -> committed
after delete: GET epic detail                              -> 404
after delete: GET task detail -> 200; parent={"kind":"restricted",…}; epic={"kind":"restricted",…}
after delete: list groups = [{"label":"SECRET EPIC TITLE","cards":1}]      ← the deleted epic's title, as a header
after delete: search "SECRET"                              -> 200; contains title: false
```

**This is recorded, and the record is what the finding is about.** `list.ts:402-411` says, in the code: *"NO
soft-delete predicate on either arm of the walk below, and this is the dispatch's own recorded open question
rather than an oversight … Filtering the walk means a deleted epic's children silently lose their epic chip — a
visible regression … against a title the reader could see before the delete. The scope decides it when the
cascade question is ruled; the residual is named here … a deleted epic's TITLE still travels on its live
children's cards."* — pointing at `executor-state-history.md:692-696`, item 7 *"Named, not decided."*

**WHY the deferral does not stand.** The question it defers — *is a deleted ancestor's title content the reader
may still be shown?* — was **decided in the same commit at the neighbouring door**. `git log -S` puts both
paragraphs in `18d7e391` (2026-09-20 13:17 IST, the Delete PR): `routes/tickets.ts:419-431` answers `restricted`
for a deleted parent *because "the parent's TITLE is the deleted ticket's content, and the FAQ's 'stops appearing
in views' is exactly a statement about content"*, explicitly rejecting the "reader could see it before" reasoning
that `list.ts:407-408` relies on. Search (`proj_search`) withholds it too. So after `18d7e391` the product holds
one answer at three doors and its opposite at the fourth, and the list's note describes itself as undecided when
its own change set decided it. The residual is also mis-stated: it says the title travels on the children's
*cards*; the card carries only `epicId` (`list-cards.ts:125`) — the title travels in the group **header**
(`:277`), which is the more visible of the two.

**WHAT WOULD HAVE BEEN BETTER.** Apply the crumb's decision: `AND ${LIVE_TICKET_WHERE}` on the recursive member
of `epicAncestors` (alias `t` is already the `proj_tickets` join) so a deleted ancestor ends the walk as an
invisible one does, and label the group the way the crumb labels the parent (`restricted` / "An epic you cannot
open") rather than "No epic" — which keeps the chip the note wanted to keep and drops the content the crumb
already drops. Then retire the "named, not decided" paragraph, since it is decided.

**MEASUREMENT.** Appendix J, run from `apps/server`. Lines opened: `list.ts:274-278`, `:384-452` (`:402-411`
the residual note, `:416` `WITH RECURSIVE`, `:423`/`:433` the two `${visible}` hops); `list-cards.ts:125`;
`routes/tickets.ts:419-431`; `executor-state-history.md:692-696`; `git log --format=%h -S"TITLE still travels"
-- apps/server/src/routes/list.ts` and `-S"TITLE is the deleted ticket" -- apps/server/src/routes/tickets.ts`
→ both `18d7e391`.

**SEVERITY: Minor.** The gap is recorded at the line and the reader could see the title before the delete; the
defect is that the record calls undecided what its own commit decided, and the list is now the one door out of
four that shows the content.

### E6-12 — IMPORTANT — Two ❌ cases in `06-auth-visibility.md` declare guest admissions the product closed weeks ago, one of them security-relevant and with a named owner; a third declares "nothing rate-limits issuance" after the limiter shipped

**WHAT.** Three open-gap declarations, each measured against the product today (Appendix K for the guest doors;
1 file / 1 test passed):

| case | what it declares (written) | the product today | since |
|---|---|---|---|
| **6.77** ❌ (`06-auth-visibility.md:107`) | *"A workspace GUEST is still ADMITTED for `workspace.renamed`, measured and deliberately not closed … nothing anywhere asks who may rename a workspace"* | guest `workspace.renamed` → **refused** `permission.role: Only a workspace owner or admin can rename a workspace.` (`check-permission.ts:730`) | `37292c1e`, 2026-09-19 (*"The rename ruling"*); the server test `check-visibility-permission.test.ts:330-340` says *"THIS CASE USED TO ASSERT THE OPPOSITE, AND ITS INVERSION IS THE RULING … the entry it cites is still in `check-permission.ts` — struck through, with the closure recorded"* and `:378-389` asserts the guest refusal |
| **6.51** ❌ (`:93`) | *"A workspace guest is admitted today for `ticket.created`, `visibility.set`, `workspace.renamed` and `comment.added` … `visibility.set` matters most: … a guest could permanently retarget any ticket they can see to workspace-wide. Owner: Plan 4 Task 9."* | `ticket.created` → **refused** (`Guests cannot create tickets.`, `:704`); `visibility.set` → **refused** (`Only a project admin or the ticket's creator can change who sees this ticket.`); `workspace.renamed` → **refused**; `comment.added` → committed (a guest named on the ticket, which is the admission a guest role exists for) | `dd7bfcfd`, 2026-09-01 (guest create, visibility authority) and `37292c1e` |
| **6.123** ❌ (`:201`) | *"Nothing rate-limits issuance, and nothing bounds how many live credentials one workspace holds."* | `POST /v1/workspaces/:workspaceId/invites` is behind `inviteLimiter` (`app.ts:485`, `:588-595`, `RATE_LIMIT_INVITE_MAX`) — the first half is closed; the second (no bound on live credentials) I did not measure and do not claim | `935f5d66`, 2026-09-06 |

**WHY it is wrong.** The common brief's §5: *"a case that asserts a property the product has quietly stopped
having is worse than no case."* These assert the opposite — gaps the product has quietly *closed* — and the
round-1 ruling already priced that class: `exec3-F1` (ACCEPTED, Important) for *"an open-gap section still
declares a closed security-relevant leak … a named owner pointing at finished work"*, because *"a stale reading is
pre-authorised work"*. 6.51 names an owner (Plan 4 Task 9) for a door that has been closed for twenty days, and
calls `visibility.set` the one that "matters most" — the reader who picks it up will build a refusal that exists.
6.77's whole sentence, including *"deliberately not closed"* and *"a product decision no plan in this series has
taken"*, is contradicted by a ruling whose closure the code and its test both record (`check-visibility-permission.test.ts:330-340`; the struck-through entry at `check-permission.ts:434-438`, *"~~…nothing anywhere asks who may rename a workspace.~~ **The owner ruled on…**"*), while the catalogue line was left standing — the catalogue is the one artifact of the three that was not moved. And the catalogue's own checker cannot
see any of this: `check-case-citations.mjs` walks ✅ ids only (its docblock: *"a checked ('checkmark') case id
must appear literally"*), so a ❌ line is never asked whether it is still open.

**WHAT WOULD HAVE BEEN BETTER.** The supersession marker the catalogue already uses (`16-remaining-doors.md:923`,
*"STATUS CHANGED 2026-09-20: (a) is FIXED — cases …"*) on 6.51, 6.77 and 6.123, pointing at the permission test's guest arm and the
`ADMIN_ONLY_TYPES`/guest lines — one line each, in the PR that closed the door. And the cheap general detector
the round-1 ruling proposed for F1: *"a 'known gap' paragraph should be greppable by the number it is built on"*
— here, the rule constant it says is absent.

**MEASUREMENT.** Appendix K (guest actor through `POST /v1/events`, with a positive control that the guest can
read the ticket they are refused on). Lines opened: `06-auth-visibility.md:93`, `:107`, `:201`;
`check-permission.ts:704`, `:730`; `app.ts:485`, `:588-595`; `check-visibility-permission.test.ts:330-340`, `:378-389`; `git log -S` dates above;
`check-case-citations.mjs:13`.

**SEVERITY: Important.** By the precedent the judge set for exec3-F1: a closed security-relevant gap still
declared open with a named owner. Filed as one finding for three lines because the mechanism is one.

### E6-13 — IMPORTANT — `verify:projections` reports DRIFT on a correct database after an ordinary type re-bind, so the restore drill it gates fails for a false reason and a real drift becomes indistinguishable from the known one

**WHAT.** Through the door, with the verifier run in-process (Appendix L; 1 file / 1 test passed):

```
before re-bind: verify-projections: clean — every projection matches its rebuild from the ledger
re-bind custom type "feature" from WF1 to WF2 (ticket-type.defined through POST /v1/events; touches no ticket)
live proj_tickets.workflow_id for T after re-bind: WF1 (unchanged — "a re-binding affects new tickets only")
after re-bind: verify-projections: DRIFT DETECTED
  proj_tickets: 1 row(s) missing from live, 1 extra in live
  missing from live: {"ticket_id":<T>, … "type_id":"feature", "workflow_id":<WF2>, …}     ← the rebuild's answer
```

The live table is right by the owner's rule (`projections/tickets.ts:46-47`: *"the owner's own 'a re-binding
affects new tickets only' (2026-08-26)"*); the verifier's shadow rebuild resolves the ticket's type **as of now**
(`getTicketTypeLadderFromDb` takes no sequence number; `tickets.ts:37-40`) and so puts the old ticket on the new
workflow, then reports the correct live row as drift.

**This is recorded — as an unassigned open question, not a ruling.** `projections/tickets.ts:37-53` and
`docs/plan-3-chain-b-handoff.md:213-222` (*"Open question 11. Owner: UNASSIGNED, deliberately … the class that
has bitten three projections in this series"*). The record dates from 2026-09-02 (`ac187e88`); the trigger became
a shipped, ordinary admin act the next day — `ticket-type-editor-screen.tsx` and `workflow-rebind-dialog.tsx`
were added in `9b70ab99` (2026-09-03) and the editor's Workflow `<Select>` (`:354-361`) submits exactly this
event. Nothing has re-examined the question since.

**WHY it matters now.** The verifier is not a curiosity; it is the restore drill's pass condition.
`docs/runbook.md:149-150`: *"`pnpm … run verify:projections` — the drill passes only on the clean line and exit
0."* After the first type re-bind in a workspace, **every** backup fails the drill with `DRIFT DETECTED` on
`proj_tickets`, and the operator has two choices: stop trusting the drill, or learn to read past a known false
row — at which point a real drift on the same table (the class the docblock says has "bitten three projections")
hides behind it. Case 13.87 (`seed-cc.test.ts:429-432`, *"verifyProjections is clean over the whole seeded
world"*) stays green because the seed never re-binds a type, and 3.23 🧪 (*"verify clean … per release"*) is
manual. So the instrument's one release-facing job is the input it cannot judge.

**WHAT WOULD HAVE BEEN BETTER.** The handoff already names the fix and its cost (a history-bearing
`proj_ticket_types`, i.e. an as-of lookup like the workflow one). Short of that, two honest options: (a) have the
verifier **know** this class — when a ticket's live `workflow_id` disagrees with the rebuild only because the
type's binding changed after the ticket was created (the ledger says which), report it as *"binding drift,
expected"* rather than `DRIFT DETECTED`, so the clean line means what the runbook says; or (b) record in
`runbook.md` that the drill is not clean after a re-bind and what the expected row looks like. Either is one
afternoon; leaving it UNASSIGNED with the trigger shipped is the choice this finding argues against.

**MEASUREMENT.** Appendix L, run from `apps/server` (imports `../src/tools/verify-projections.js` and
`../src/projections/index.js` relatively). Lines opened: `verify-projections.ts:34-68` (projection-outer
rebuild, `EXCEPT` both ways); `ledger/event-store.ts:146-156` (replay order, documented); `projections/tickets.ts:37-53`;
`docs/plan-3-chain-b-handoff.md:213-222`; `docs/runbook.md:149-150`, `:174-175`; `seed-cc.test.ts:429-432`;
`ticket-type-editor-screen.tsx:354-361`; `git log --diff-filter=A` for the two editor files → `9b70ab99`.

**SEVERITY: Important.** A release-facing instrument that reports a failure on a correct database after an
ordinary admin act, recorded without an owner while its trigger shipped.

### E6-14 — MINOR — The delete toast's recorded reason for departing from the prototype ("this product has no ticket key") stopped being true thirteen minutes before it was written; the same file now reads the key for its own breadcrumb

**WHAT.** `packages/app-core/src/views/ticket-sheet.tsx:296-306`, on `onDeleted`: *"The prototype toast says
`"GN-1183 deleted · …"` — a ticket KEY. **This product has no ticket key**; its ids are ULIDs … The title is the
only human name a ticket has here … a key is a migration"* — and the host renders `${title} deleted · its history
is retained` (`p/[projectId]/page.tsx:2879-2890`, same reasoning repeated). Measured today: the detail door serves
`key` (`routes/tickets.ts:548-555`, `ticketKey(identity.prefix, projectPrefix, number)`; my Appendix C run's
detail body carries a `key` field), and **the same sheet uses it**: `ticket-sheet.tsx:1588` `const lastCrumb =
ticketRead.key ?? ticketRead.title;`, with `:1794` noting *"#595 shipped the composition"*.

**WHY it is wrong.** The departure from the prototype is recorded with a reason, and the reason is false —
`ac18f2bc` (*"Ticket keys, the ledger half"*, 2026-09-20 13:04 IST) landed thirteen minutes before `18d7e391`
(the Delete PR, 13:17 IST) wrote *"has no ticket key"*, and the crumb's key composition shipped in `#595` after
that. So the product now has two human names for a ticket in one component and uses the prototype's one for the
crumb and the other for the toast, while the docblock says the first does not exist. The prototype's toast
(export `Gisik Nokma - Desktop.dc.html`, sha `3d142d46`, `:3798`: `self.toast(sheet.id + " deleted \u00b7 its history is
retained", …)`, where `sheet.id` is the seeded key — `id: "GN-1100"`, `"GN-1101"`, … in the same file) names the key. Category 2 with a reason that no longer
holds; the docblock itself says *"Reversing this is one string in the host."*

**WHAT WOULD HAVE BEEN BETTER.** Hand `onDeleted` the `key ?? title` the crumb already computes, and replace the
docblock's paragraph with the one sentence that is true: a key exists when the workspace has a prefix, and the
toast falls back to the title when it does not.

**MEASUREMENT.** `sed -n '296,306p;1588p;1794p' packages/app-core/src/views/ticket-sheet.tsx`; `sed -n
'548,555p' apps/server/src/routes/tickets.ts`; `git log -1 --format='%h %ci' ac18f2bc` / `18d7e391`; Appendix C's
`GET ticket LC` line (`keys: …,key,epic`).

**SEVERITY: Minor.** Copy and a stale docblock; the wrong sentence is the one that explains a prototype
departure, which is the class the common brief asks this lane to read closely.

### E6-15 — IMPORTANT — Cross-site WebSocket hijacking: a cookie-authenticated `/v1/stream` handshake from a foreign Origin is accepted and serves the victim's ledger, while the same cookie and Origin are refused on `POST /v1/events`

**WHAT.** Measured at the assembled app **with the security surface on** (`security: { webOrigin:
'http://localhost:3001', rateLimit: null }` — the same build `security-middleware.test.ts` uses), on this lane's
port `:3061`, with a real web session obtained by replaying the OTP flow and keeping `set-cookie`
(Appendix M; 1 file / 1 test passed):

```
set-cookie names: better-auth.session_token; using: better-auth.session_token=<redacted>
control GET /v1/me/workspaces with cookie only        -> 200          ← the cookie alone is a live web session
Origin=https://evil.artsourced.in -> handshake ACCEPTED; first frame type=event; frames=13; victim title present in stream: true
Origin=https://evil.example       -> handshake ACCEPTED; … frames=13; victim title present in stream: true
Origin=(absent)                   -> handshake ACCEPTED; … frames=13; victim title present in stream: true
control POST /v1/events with cookie + foreign Origin  -> 403 {"error":"forbidden_origin"}   ← the HTTP-Origin hook fires
```

So the product's cross-site defence refuses a forged **write** and admits a forged **subscription** — and the
subscription is the whole visible ledger of the victim (`visibleEventsFor`), title and all.

**WHY it is wrong.** Three facts the code states and one it does not:

1. `http/http-origin.ts:259` — `if (!MUTATING_METHODS.has(input.method)) return false;` — the Origin check is
   for `POST/PUT/PATCH/DELETE` only; a WebSocket upgrade is a `GET`. The docblock explains why reads are absent
   (*"CSRF is about causing a state change … this server's reads change none"*, `:146-149`) — true of `GET`
   responses a browser cannot read cross-origin, **and not of a WebSocket**, which CORS does not govern at all:
   the page that opened it reads every frame.
2. `stream/routes.ts:267` — `{ websocket: true, preHandler: [requireSession, requireConnectionBudget] }` —
   nothing inspects `Origin` on the upgrade; `@fastify/websocket` is registered with `maxPayload` only (`:262`).
3. The product's own reasoning already rejects `SameSite=Lax` as the defence: `http-origin.ts:180-182` (the
   mcp-tokens entry) — *"`SameSite=Lax` does not close it, because the product and the API are same-site siblings
   of one registrable domain"* — and `deploy/do/app.yaml:5` deploys exactly that: `pm.artsourced.in` and
   `pm-api.artsourced.in`. `auth.ts:271` ships `sameSite: 'lax'`. So the precondition the product itself
   built the HTTP-Origin check for — an attacker page on any sibling of `artsourced.in` — is enough to open the
   socket with the victim's cookie, subscribe to any workspace id the attacker knows (a fellow member knows them
   all), and read what the *victim* can see: the visibility model's explicit lists, guest scopes and
   project-mode fences are bypassed from the read side for as long as the socket stays open.

**WHAT WOULD HAVE BEEN BETTER.** The same predicate, one more door: in `httpOriginRefused`, treat the stream
route as protected regardless of method (a cookie-bearing upgrade whose `Origin` is not `WEB_ORIGIN` is refused
before `requireSession`), or check `Origin` in the stream's own `preHandler`. And the durable half exec 3's
E3-14 also asks for — a test that walks the assembled route table and injects a cookie + forged `Origin` at every
route, **including the upgrade**, so the next door added is refused by the suite rather than by a reviewer.

**Relation to exec 3's round-2 E3-14.** That finding is five *mutating* routes outside
`HTTP_ORIGIN_PROTECTED_ROUTES` — the write side of the same defence, under the same same-site precondition. This
is the **read** side, on a route the set could never hold (it is not a mutating method), found independently by
asking what the set cannot cover by construction; the two are complements, not duplicates, and neither
measurement is reused.

**MEASUREMENT.** Appendix M, run from `apps/server` (`app.listen` on `127.0.0.1:3061` — this lane's port — for
the real socket; `ws` via `test/helpers/stream.ts`'s `openStream`). Lines opened: `http-origin.ts:146-149`,
`:180-182`, `:259`; `stream/routes.ts:262`, `:267`; `auth.ts:271`; `deploy/do/app.yaml:5`, `:119`; `app.ts`'s
origin hook (`httpOriginRefused({ method: request.method, routeUrl: request.routeOptions.url, … })`).

**SEVERITY: Important.** A measured bypass of the visibility model from the read side, gated on a precondition
the product's own security notes treat as real. Filed at Important rather than Critical because a same-site
attacker page is required and the socket reads only what the victim may read; the judge may weigh it with E3-14.

### E6-16 — IMPORTANT — An MCP token can approve a new device code, so one token mints a successor that survives its own revocation; the consent page's "It lasts until you revoke it" is false, and the same token mints admin invitations

**WHAT.** `auth/require-session.ts:60-80`: every `requireSession` route accepts `Authorization: Bearer <mcp
token>` as the user (`:95`, the fallback to `resolveMcpToken`). `POST /v1/mcp/device/approve` is a
`requireSession` route (`routes/mcp-device.ts:83-105`). Measured through the doors (Appendix N; 1 file / 1 test
passed):

```
T1 minted by the owner's session; GET /v1/me/workspaces with Bearer T1 -> 200
T2 minted with the APPROVE step authenticated by Bearer T1 (an MCP token) -> issued
Bearer T1: POST mint ADMIN invite                     -> 201
Bearer T1: GET /v1/me/mcp-tokens                      -> 200, 2 token(s) listed
owner revokes the first-listed token                  -> 204
after revocation: Bearer T1 -> 401; Bearer T2 (the successor) -> 200
owner's token list now: 1 token(s)                    ← T2, which no person approved
```

**WHY it is wrong.** The consent page states the contract in two sentences, and the second is false:
`apps/web/app/mcp/authorize/page.tsx:181-183` — *"An assistant that acts as you, with exactly your permissions.
It can see and change whatever you can … **It lasts until you revoke it.**"* Revoking the token the person
approved does not end the assistant's access if the assistant has approved a successor first — and it can,
because "exactly your permissions" includes the permission to approve device codes. The migration's own
comment names the invariant this breaks: `1788600000000_mcp-device-auth.sql:31` — `approved_user_id` is *"NULL
until a **signed-in person** approves"* — and a bearer MCP token is not a signed-in person. Nothing in the
`mcp_device_codes` row records *how* the approval was authenticated, so the person's token list cannot tell a
token they approved from one their assistant approved for itself. The same width lets the token mint an
**admin invitation** (201 above) — a second credential of a different kind.

**The width is the product's decision; the durability claim is not honoured by it.** The prototype's consent is
narrower (`design-system/prototypes/McpAuthorize.dc.html:70-76`: *"Read tickets, boards and comments · Only in
workspaces you belong to · Create tickets and move them between states"*; the export's own copy at
`Gisik Nokma - Desktop.dc.html:962`: *"Tokens let an assistant read and write tickets as you. They carry your
permissions, not more."*) and the product's page deliberately says "exactly your permissions" instead — a
category-2 divergence I do not contest. What I contest is that a credential which can mint credentials cannot
also promise *"lasts until you revoke it"*, and the page promises both.

**WHAT WOULD HAVE BEEN BETTER.** Two lines in `mcp-device.ts`'s approve (and deny) handlers: refuse when the
session was resolved through the MCP fallback rather than a better-auth session — `requireSession` knows which
branch answered and can stamp `request.authKind`. The same fence belongs on `DELETE /v1/me/mcp-tokens/:id`
(a token revoking its siblings) and, arguably, on the invite mint. Then record `approved_via` on the device-code
row so the token list can say *"approved by you, in the browser"* against *"approved by an assistant"*.

**MEASUREMENT.** Appendix N, run from `apps/server`. Lines opened: `require-session.ts:57-80`, `:94-99`;
`mcp-device.ts:83-105`, `:160-181`; `mcp/token-store.ts:60-80`; `mcp/authorize/page.tsx:148-156`, `:178-183`;
`1788600000000_mcp-device-auth.sql:21`, `:31`; `McpAuthorize.dc.html:70-76`; export `:962`.

**SEVERITY: Important.** A revocation that does not revoke, on the one credential the product hands to software,
with the contradiction printed on the consent page. Not Critical: it needs a token that is already abused, and
the successor is visible in the list to a person who looks.

---

## 5. POSITIVE FINDINGS — claims I tried to falsify and could not

Each of these was a hypothesis I opened a file or ran a command to break. They are recorded so the judge can see
what was looked at and found sound, not only what was found wrong.

- **The ingest pipeline's order is what the docblocks say.** `ingest-service.ts:164-360`: workspace lock →
  entity lock → entity↔workspace guard → permission gate (through the transaction's `client`, `:235-245`) →
  contest coherence → engine → server gates → append → refresh-on-publish → projections → COMMIT. Read at the
  line; every refusal path `ROLLBACK`s before append.
- **The last-owner guard holds.** `checks/membership.ts` refuses demoting or revoking the sole owner
  (`countWorkspaceOwners` excluding the subject), and `check-permission.ts:1190-1231` (`checkMembershipOwnerAuthority`) refuses a non-owner touching
  an owner. Read; not mutated. *Observation, not a finding:* membership events do not bind `entity.id` to
  `membershipId(env.workspaceId, payload.userId)` the way `visibility.set` binds `payload.ticketId` to `entity.id`
  (`check-permission.ts:1041-1044`); the projection keys on the payload (`proj-memberships.ts:92-116`), so a
  mismatched entity id pollutes only `proj_entity_heads` and the per-entity `seq`, and no read serves a
  membership entity's stream. No user-visible consequence found, so not filed.
- **`rankBetween` is correct.** 59,910 fuzzed cases (`before < result < after`, `isRankKey(result)`), 0 bad; 200
  head-inserts between `a`..`b` grow the key to 35 characters (no cap — noted, not filed).
- **The stream cannot miss events between bootstrap and subscribe.** `stream/hub.ts:213-284` drains
  `visibleEventsFor(pool, user, ws, cursor)` — a fresh `workspace_seq > cursor` read of the ledger on every
  drain, not an in-memory queue — so a client that subscribes at its bootstrap `streamSeq` is caught up from
  the ledger. Read at the line.
- **The mappers refuse to default** (confirming exec 3 §7.5 with a different check): the server's
  `filterSpecSchema` keys (`assigneeId blocked closed collaboratorId due fields stateCategory stateId text
  typeId`) and the keys `toClientFilterSpec` reads (`mappers.ts:942-1001`) are the same set; `blocked` and a
  non-`eq` field op throw `ServingGapError` rather than being dropped.
- **Invites match the export's `github.md` on role and project scope.** `inviteRoleSchema` refuses `owner`
  (`invites.ts:64-67`), `inviteSentPayload` refuses `projectIds` on a guest (`:120-127`), and acceptance grants no
  project rows to a guest (`acceptance.ts:189-191`). *Channel* does not match — E6-9.
- **The evidence gate binds the attachment to the ticket** (`gates/evidence-gate.ts`, `SELECT 1 FROM attachments
  WHERE id = $1 AND ticket_id = $2`) and refuses a drive reference as evidence by rule.
- **OTP and device-code doors are bounded.** better-auth's phone plugin caps verification at 3 attempts per code
  (`routes.mjs:505-514` in the installed 1.7.2), the sign-in path is IP-limited (`app.ts:519-520`), the MCP
  user code is 8 symbols over a 28-symbol alphabet (`token-store.ts:18`, `:33-40`, ≈3.8×10¹¹), approve and deny
  are session-gated and single-shot (`UPDATE … WHERE approved_user_id IS NULL`).
- **The orphan sweep cannot delete a soft-deleted ticket's files.** `sweep-orphans.ts:100-109` keeps anything
  with an `attachments` row or an `attachment.added` event, independent of the ticket's flag.
- **Reconcile is only the audience question** (`reconcile-route.ts`); a deleted ticket is not "restricted", and
  the replica learns deletion from the `ticket.deleted` frame instead — consistent with the TypeScript gate exec 3
  measured (F5).
- **The dev database is current.** All 32 migrations applied (`1790000000000` at 02:50Z today), on a database
  holding 169 events — which is the "migration applied to a database that already holds data" property exec 3
  §7.6 called unwitnessed in tests, witnessed on the owner's stack (Appendix E).
- **`check:db-tz` passes on both live databases** (`Asia/Kolkata` on 54329 and 54330).
- **Rate limits cover the credential and write doors** (`/api/auth/*`, `/v1/events`, `/v1/sync`,
  `/v1/sync/bootstrap`, `/v1/attachments`, the invite mint, the three MCP device doors — `app.ts:505-600`).
  *Observation, not filed:* `POST /v1/workspaces` (founding), `/v1/sync/reconcile`, `…/migrate` and the
  notification-read doors are outside the limited set; founding runs the whole bootstrap sequence per call. I did
  not measure the per-call cost, so this is an absence read at the line, in the class of 6.123.
- **Workspace settings are bounded** (`staleDays` 1–365, `dueSoonDays` 0–365, `autoCloseAfterDays` 1–365 or
  null, `workspace-settings.ts`).

---

## 6. THE NINE EDGE CLASSES — walked per surface

Surfaces are the ones this report opened. A cell says what the product does, with the finding or the line it
rests on; **unverified** means I did not measure it and say why.

| surface | EMPTY | ERROR | PERMISSION-REFUSED | OFFLINE / REPLICA-DEGRADED | SOFT-DELETED | CONCURRENT / INTERLEAVED | NARROW VIEWPORT | FIRST-RUN | SERVER REFUSES, CLIENT BELIEVES |
|---|---|---|---|---|---|---|---|---|---|
| **ingest door** (`/v1/events`) | empty batch → `[]` (`online-data-source.ts:481`) | refusal = ROLLBACK, standard shape (`ingest-service.ts:291-297`) | gate before engine, per ticket via `canSee` (`check-permission.ts:1048`) | n/a | **accepts 6/8 write types on a deleted ticket — E6-2** | workspace lock then entity lock, one global order (`:171-173`) | n/a | founding sequence bootstraps owner with `door = null` (`:425-447`) | n/a (it is the server) |
| **sync door** (`/v1/sync`) | — | every ticket refusal becomes a contest (`sync-service.ts:416-417`) | permission refusal → contest | **overtake after backoff → false contest — E6-5** | same as ingest | per-event transactions; a mid-batch refusal keeps neighbours (`ingest-service.ts:311-320`) | n/a | bootstrap route | **the false contest is the client believing a refusal about its own ticket — E6-5** |
| **bulk rebind** (`…/migrate`) | zero tickets → `migrated, count 0` (read at `:1041`, `:1054`) | pre-flight refusals append nothing (7.45) | **gate refusal mid-batch, client told "refused", server moved k — E6-10** | n/a | selection includes deleted rows (`:935-940`, no predicate) — noted, not filed: they must move with the type for restore to work | pre-flight reads without a lock; a ticket transitioned between pre-flight and its event is rebound to the state its *old* state mapped to — **unverified**, read at `:976-978` (`toStateIdFor` reads the pre-flight row's `state_id`), not measured | n/a | — | E6-10 |
| **rule engine** | unknown ticket → `ticket.unknown`; unknown workflow → `unknownWorkflow` | malformed payload → `malformedPayload` with the zod detail | authority is not the engine's (by design, `evaluate.ts:52-55`, the comment on the delete pair) | the replica runs the same `evaluateEvent` (`outbox.ts:311-315`) | **reads `deleted` in one file only — E6-2, E6-4** | n/a (pure) | n/a | first `workflow.defined` must be v1 (`workflow-defined.ts:53-59`) | **type re-rank / republish promotion leave states the engine then refuses — E6-3, E6-8** |
| **notifications** | inbox `[]`, `nextCursor: null` | — | fanout suppresses a letter the assignee cannot see (`fanout.ts:122`) | — | **assignment on a deleted ticket manufactures a letter into a 404 — E6-2**; delivered letters stay by ruling (item 1) | dedupe key per event (`assignment:<eventId>`) | n/a | — | — |
| **list / board / search / detail** | `groups: []` | 404 for unknown-or-invisible (one answer, `can-see.ts:220-226` docblock, `:227-234` body) | `restricted` parent/epic (`tickets.ts:419-441`) | replica gates in TS (exec 3 F5) | detail/search/crumb withhold; **list header shows a deleted epic's title — E6-11** | — | UI lane | — | — |
| **invites** | — | `422` with the domain's message | `admins-only` mint; `owner` not invitable | — | — | 6.130 (revoke during accept) recorded ❌, **unverified** here | UI lane | founding | **form offers `sms`/`whatsapp`, door refuses both — E6-9** |
| **outbox / sync engine** | `nextBatch` → `[]` | transient → backoff (12.148); terminal → `failed` (12.147) | refusal → `failed`, dropped from overlay (`local-context.ts:126`) | **head-of-line not blocked — E6-5** | replica TS gate (exec 3 F5) | one drain at a time (`sync-engine.ts:845`) | n/a | bootstrap once (12.156) | E6-5 |
| **MCP tools** | `list_tickets` pages; `search` capped at 50, stated in the tool text | refused/invalid → thrown with rule and reason (`write-tools.ts:28-36`) | server's answer relayed verbatim | n/a | **`assign_ticket` on a deleted id → `committed` while `get_ticket` → not found — E6-2** | no read-before-write | n/a | device-code login (`device-login.ts`) | E6-2 |
| **online client (`POST /v1/events` from the web)** | — | HTTP error surfaces as `ShellRefusal`/error copy (UX lane) | mapper refuses to default (§5) | **no retry and no idempotent resubmit on a lost response** (`online/http.ts`, `online-data-source.ts:480-488` — `grep` for `retry` and for `duplicate-event-id` → nothing): a user's manual retry mints a new id, so a comment can land twice — **unverified** end-to-end, read only | — | — | UI lane | — | mapper throws `MappingError` on a non-index-aligned answer (`mappers.ts:906-911`) |
| **checkers** | **`check-no-silent-skips` prints `ok` on an empty report — E6-6** | `check-migration-order` refuses below-base | n/a | n/a | n/a | n/a | n/a | **`check:migrations` vs. a future-dated prefix — E6-7** | CI has run nothing since 2026-09-06, so every "CI-wired" claim describes a dead wire (recorded by the controller) |
| **in-app help** | — | — | — | — | **denies Delete — E6-1** | — | UI lane | — | — |

---

## 7. THE PROTOTYPE, CLASSIFIED

The export at `/Users/kiro/my_projects/gisik-nokma-lanes/prototype-2026-09-20/` (shas as the common brief lists
them; I re-hashed all eight files and they match). This lane's meeting points with it are functional claims,
not pixels — the three `.md` spec documents and the Invite screen's data model.

| claim in the export | product | class | where |
|---|---|---|---|
| `github.md:12` — *"`owner` is NOT an invitable role (the mint refuses it)"* | `inviteRoleSchema` refuses `owner` (`invites.ts:64-67`) | **1 MATCHES** | §5 |
| `github.md:12` — *"a guest gets no project association … 'cannot put a guest on a project; share tickets with visibility.set instead'"* | `inviteSentPayload` superRefine (`invites.ts:120-127`); `acceptance.ts:189-191` | **1 MATCHES** | §5 |
| `github.md:12` — *"an invite carries `address`, `channel` (email/sms/whatsapp), `role`, optional `projectIds`"*; Desktop `:754` offers `email/sms/whatsapp` | door: `email` or `phone` only (`invites.ts:70`); web form: `email/sms/whatsapp` | **3 DIVERGES, NO RULING FOUND** — search: `grep -rn whatsapp test-cases/*.md Features.md docs/lanes/review-*.md` → nothing | **E6-9** |
| `github.md:4` — epics are the rank-1 type, children carry `epicId`, list groups by epic | `EPIC_RANK`, `epicAncestors`, `groupBy=epic` (`list.ts`) | 1 MATCHES on the mechanism; the deleted-epic header is **E6-11** (recorded residual) | E6-11 |
| `github.md:2-3` (faq-delete) — *"The ticket stops appearing in views. Its history is retained, because other events cite it"* | reads: yes (16.96); writes: **not refused — E6-2**; help: **denied — E6-1** | the prototype's own FAQ entry is the model the product's help should have followed | E6-1, E6-2 |
| `github.md:8` — *"a global Account screen (profile, notification prefs, workspaces, devices)"*; `workspaces-gap.md:16` item 6 | server has `/v1/me/*` reads (preferences, notification-preferences, workspaces, mcp tokens) | not this lane's surface to classify (UX/UI) — the **routes exist**, noted so the UX lane's finding can cite them | — |
| `workspaces-gap.md:9-14` — member counts, ticket chips, per-project counts on the workspace card | `read/workspace-counts.ts` serves `visibleProjectCounts` with `LIVE_TICKET_WHERE`; membership roster read exists | data exists server-side for items 1, 3, 7; whether the page consumes it is the UX lane's | — |
| `help-topics-pane.md` | entirely `help-browser.tsx` / CSS | UI lane | — |

**What I did not compare:** every screen. The prototype draws no engine; the round-1 lane said the same and I
found no reason to disagree. Where the prototype makes a *data-model* claim (invites, epics, delete), it is in
the table.

---

## 8. COUNT OF FINDINGS BY SEVERITY — members named

| severity | count | members |
|---|---|---|
| Critical | **0** | — |
| Important | **12** | E6-1, E6-2, E6-3, E6-4, E6-5, E6-8, E6-9, E6-10, E6-12, E6-13, E6-15, E6-16 |
| Minor | **4** | E6-6, E6-7, E6-11, E6-14 |
| **total** | **16** | E6-1 … E6-16, no gaps in the numbering |
| unverified (0-point) items | 3 | the migrate route's stale pre-flight read under concurrency (§6), the online path's non-idempotent manual retry (§6), 6.123's "no bound on live credentials" half (E6-12) — each marked *unverified* where it appears and not counted above |

Every Important finding above rests on a probe in Appendices A–K or on a printed line; the three Minors rest on
commands the judge can re-run in under a minute each.

---

## 9. NOTES FOR PHASE 2 (refutation candidates, not filed here)

Staged in `docs/lanes/review-refutations-exec6.md` (skeleton pushed with this report). Candidates I can already
see, each with the measurement I would run — **none is filed here**, per rules §2:

- **exec3 §7.3, "54 registrations, 49 guarded, 5 public by design"** at `e4baa425` — re-run the widened sweep at
  `a7b6292b` and read every registration's options; `mcp-device.ts` now has `deny` (session-gated) and the count
  may have moved.
- **exec3 §2, "every finding transfers to current `main` unchanged"** — true at `33f14386`; `main` has since gained
  #625–#630. `git diff --name-only 33f14386 a7b6292b` against the files its findings cite.
- **exec3 §7.5, "the mappers refuse to default"** — confirmed by me for `FilterSpec` (§5); a refutation would need
  a `??` that substitutes, and I found none in `:903-1001`. Likely a defence, not a refutation.
- **exec3's round-2 `E3-14` (claimed Critical: five cookie-authenticated mutating routes outside
  `HTTP_ORIGIN_PROTECTED_ROUTES`).** Read at 11:0x from `origin/exec3/review-functionality-r2`. I opened the file:
  two of its five routes (`POST /v1/invites/:token/accept`, `PUT /v1/me/preferences`) are **recorded exclusions
  with reasons and owners** in the same docblock (`http-origin.ts:128-146`, *"excluded here rather than silently
  omitted"*), and the reasoning there (*"a workspace they can leave"*) prices the invitation-accept variant the
  finding's Critical rests on. The other three are genuinely unmentioned. **Not a refutation** — the finding is
  valid for three routes and the judge sets severity — but the recorded half is what a refuter would cite, and my
  E6-15 is the read-side complement measured independently (its §"Relation" paragraph says so).
- **Where I would defend:** E6-2's weakest joint is *"committed is not a defect; the FAQ promises only views"* —
  the answer is `notifications/sweep.ts:175-177` (the product's own rule that a notification is a view) plus the
  measured letter, and the attachment-upload precedent (`ticketIsLive` at the upload door). E6-11's weakest joint
  is that it is recorded — the answer is the same-commit contradiction, which is why it is filed at Minor.

---

## 10. APPENDICES — the probes, verbatim

**None of these files is committed.** Each was written into the worktree, run once (the run count is stated in the finding), copied here, and deleted; `git status --porcelain` on this branch shows only this report. They are evidence embedded in the report so the judge can reproduce the measurement, not tests added to the product.

### Appendix A — probe for E6-2 — writes against an already soft-deleted ticket

Place the file at `zz-exec6-probe-deleted-writes.test.ts` (path shown relative to the repo root below), run from
`apps/server`:

```
rtk proxy pnpm exec vitest run test/zz-exec6-probe-deleted-writes.test.ts --no-file-parallelism
```
File path in the tree: `apps/server/test/zz-exec6-probe-deleted-writes.test.ts`. Needs the shared test Postgres on `54329` and the server's dependency closure built (`pnpm --filter '@gisik-nokma/server^...' run build`). `rtk proxy` only because rtk's output filter swallowed the `console.log` lines on the first run; plain `pnpm exec vitest run …` produces the same run.

```ts
// EXEC6 REVIEW PROBE — NOT A PRODUCT TEST. Deleted after the run; never committed.
// Question: what does the ingest door answer for write claims aimed at a ticket
// that is ALREADY soft-deleted, and what lands in `notifications`?
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { membershipId, newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers/app.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { signInWithPhone } from './helpers/session.js';

let db: TestDatabase;
let app: FastifyInstance;
let ownerToken = '';
let ownerId = '';
let peerToken = '';
let peerId = '';
let WS = '';
let PRJ = '';
let LIVE = '';
let DELETED = '';

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function post(
  workspaceId: string,
  entity: { kind: string; id: string },
  type: string,
  payload: unknown,
  actorId: string,
  token: string,
): Promise<{ status: string; rule?: string; reason?: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: auth(token),
    payload: {
      events: [
        {
          id: newUlid(),
          workspaceId,
          entity,
          type,
          version: 1,
          payload,
          actorId,
          origin: 'web',
          clientTime: new Date().toISOString(),
        },
      ],
    },
  });
  const results = res.json<{ results: Array<{ status: string; rule?: string; reason?: string }> }>().results;
  return results[0]!;
}

function doc(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  await app.ready();
  const owner = await signInWithPhone(app, built.otp, '+919000000601');
  ownerToken = owner.token;
  ownerId = owner.userId;
  const peer = await signInWithPhone(app, built.otp, '+919000000602');
  peerToken = peer.token;
  peerId = peer.userId;

  const res = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: auth(ownerToken),
    payload: { name: 'Exec6 probe' },
  });
  expect(res.statusCode, res.body).toBe(201);
  WS = res.json<{ workspaceId: string }>().workspaceId;

  // The peer joins as a member through the door.
  const grant = await post(WS, { kind: 'membership', id: membershipId(WS, peerId) }, 'membership.granted', { userId: peerId, role: 'member' }, ownerId, ownerToken);
  expect(grant.status, JSON.stringify(grant)).toBe('committed');

  PRJ = newUlid();
  expect((await post(WS, { kind: 'project', id: PRJ }, 'project.created', { name: 'P' }, ownerId, ownerToken)).status).toBe('committed');
  for (const uid of [ownerId, peerId]) {
    expect((await post(WS, { kind: 'project', id: PRJ }, 'project.member_added', { userId: uid, projectAdmin: uid === ownerId }, ownerId, ownerToken)).status).toBe('committed');
  }
  LIVE = newUlid();
  DELETED = newUlid();
  for (const [id, title] of [[LIVE, 'live'], [DELETED, 'to be deleted']] as const) {
    expect((await post(WS, { kind: 'ticket', id }, 'ticket.created', { typeId: 'task', projectId: PRJ, parentId: null, title }, ownerId, ownerToken)).status).toBe('committed');
  }
  expect((await post(WS, { kind: 'ticket', id: DELETED }, 'ticket.deleted', {}, ownerId, ownerToken)).status).toBe('committed');
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('exec6 probe: writes aimed at an already soft-deleted ticket', () => {
  it('records what the door answers, per event type', async () => {
    // Control: the ticket is gone from the detail door.
    const detail = await app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${DELETED}`, headers: auth(ownerToken) });
    const liveDetail = await app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${LIVE}`, headers: auth(ownerToken) });
    console.log(`PROBE detail(deleted)=${detail.statusCode} detail(live)=${liveDetail.statusCode}`);

    const answers: Record<string, string> = {};
    const attempts: Array<[string, unknown]> = [
      ['ticket.assigned', { assigneeId: peerId }],
      ['comment.added', { body: doc('a comment on a deleted ticket') }],
      ['ticket.transitioned', { to: 'doing' }],
      ['ticket.field_set', { fieldId: 'title', value: 'renamed while deleted' }],
      ['ticket.collaborator_added', { userId: peerId }],
      ['ticket.closed', {}],
      ['ticket.ranked', { rank: 'a1' }],
      ['visibility.set', { ticketId: DELETED, mode: 'explicit', userIds: [peerId] }],
    ];
    for (const [type, payload] of attempts) {
      const r = await post(WS, { kind: 'ticket', id: DELETED }, type, payload, ownerId, ownerToken);
      answers[type] = `${r.status}${r.rule ? ` (${r.rule}: ${r.reason})` : ''}`;
    }
    console.log('PROBE answers:\n' + Object.entries(answers).map(([k, v]) => `  ${k.padEnd(28)} -> ${v}`).join('\n'));
    const live: Record<string, string> = {};
    for (const [type, payload] of attempts) {
      const pl = type === 'visibility.set' ? { ...(payload as object), ticketId: LIVE } : payload;
      const r = await post(WS, { kind: 'ticket', id: LIVE }, type, pl, ownerId, ownerToken);
      live[type] = `${r.status}${r.rule ? ` (${r.rule}: ${r.reason})` : ''}`;
    }
    console.log('PROBE LIVE control answers:\n' + Object.entries(live).map(([k, v]) => `  ${k.padEnd(28)} -> ${v}`).join('\n'));
    // Positive control for the deleted flag itself: a second delete must be refused.
    const again = await post(WS, { kind: 'ticket', id: DELETED }, 'ticket.deleted', {}, ownerId, ownerToken);
    console.log(`PROBE second ticket.deleted -> ${again.status} (${again.rule ?? ''})`);
    // The thread door for the deleted ticket (case 16.72 says it refuses):
    const thread = await app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${DELETED}/comments`, headers: auth(ownerToken) });
    console.log(`PROBE comments read(deleted)=${thread.statusCode}`);

    const notif = await db.pool.query<{ kind: string; user_id: string; payload: unknown }>(
      'SELECT kind, user_id, payload FROM notifications WHERE workspace_id = $1 ORDER BY created_at',
      [WS],
    );
    console.log(`PROBE notifications rows for peer: ${notif.rows.filter((r) => r.user_id === peerId).length}`);
    for (const row of notif.rows) console.log(`PROBE   ${row.kind} -> ${row.user_id === peerId ? 'peer' : 'owner'} ${JSON.stringify(row.payload)}`);

    // What does the peer's inbox door serve?
    const inbox = await app.inject({ method: 'GET', url: `/v1/me/notifications?workspaceId=${WS}`, headers: auth(peerToken) });
    console.log(`PROBE inbox(peer)=${inbox.statusCode} body=${inbox.body.slice(0, 600)}`);

    // And the peer's detail read of the ticket the notification points at:
    const peerDetail = await app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${DELETED}`, headers: auth(peerToken) });
    console.log(`PROBE peer detail(deleted)=${peerDetail.statusCode}`);

    const head = await db.pool.query<{ state_id: string; deleted_at: string | null; assignee_id: string | null }>(
      'SELECT state_id, deleted_at, assignee_id FROM proj_tickets WHERE ticket_id = $1',
      [DELETED],
    );
    console.log(`PROBE proj_tickets row after writes: ${JSON.stringify(head.rows[0])}`);
    expect(true).toBe(true);
  });
});
```

### Appendix B — probe for E6-3 — custom-type re-rank versus existing tickets

Place the file at `zz-exec6-probe-rerank.test.ts` (path shown relative to the repo root below), run from
`packages/rule-engine`:

```
rtk proxy pnpm exec vitest run test/zz-exec6-probe-rerank.test.ts --no-file-parallelism
```
File path in the tree: `packages/rule-engine/test/zz-exec6-probe-rerank.test.ts`. Pure in-memory; imports `../src/*.js` relatively.

```ts
// EXEC6 REVIEW PROBE — NOT A PRODUCT TEST. Deleted after the run; never committed.
// Question: after a custom type is re-ranked, does the ledger hold a hierarchy the
// engine itself refuses to produce?
import { describe, expect, it } from 'vitest';
import type { EventEnvelope, TicketTypeDef } from '@gisik-nokma/domain';
import { makeEnvelope } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../src/memory-context.js';
import { evaluateEvent } from '../src/evaluate.js';
import { EPIC, PROJECT, TASK, WF, WS, created, typeDefined } from '../src/checks/test-support.js';

const FEATURE2: TicketTypeDef = { id: 'feature', name: 'Feature', icon: 'flag', rank: 2, workflowId: 'wf-basic', fields: [] };
const FEATURE3: TicketTypeDef = { ...FEATURE2, rank: 3 };
const FEATURE4: TicketTypeDef = { ...FEATURE2, rank: 4 };
const F = '01J9GTKF000000000000000000';
const T = '01J9GTKT000000000000000000';

function reparent(ticketId: string, newParentId: string | null): EventEnvelope {
  return makeEnvelope({ type: 'ticket.reparented', entity: { kind: 'ticket', id: ticketId }, workspaceId: WS, payload: { newParentId } });
}

describe('exec6 probe: custom-type re-rank versus existing tickets', () => {
  it('records the engine answers', async () => {
    const history = [typeDefined(EPIC), typeDefined(FEATURE2), typeDefined(TASK), created(F, 'feature', null), created(T, 'task', F)];
    const out: string[] = [];
    const say = (k: string, v: { refused: boolean; rule?: string; reason?: string }) =>
      out.push(`${k.padEnd(58)} -> ${v.refused ? `REFUSED ${v.rule}: ${v.reason}` : 'ACCEPTED'}`);

    // 1. The re-rank itself, with a feature (rank 2) already a parent of a task (rank 3).
    say('re-rank feature 2→3 while a task sits under a feature', await evaluateEvent(typeDefined(FEATURE3), buildMemoryContext([WF], history)));
    say('re-rank feature 2→4 (deepest) while a root feature exists', await evaluateEvent(typeDefined(FEATURE4), buildMemoryContext([WF], history)));

    // 2. After the re-rank to 3 lands: does the engine still allow the placement it now holds?
    const after3 = [...history, typeDefined(FEATURE3)];
    say('after 2→3: reparent task T under feature F (its current parent)', await evaluateEvent(reparent(T, F), buildMemoryContext([WF], after3)));
    say('after 2→3: create a new task under F', await evaluateEvent(created('01J9GTKN000000000000000000', 'task', F), buildMemoryContext([WF], after3)));

    // 3. After the re-rank to 4: the root feature F must "sit under a parent" per the editor copy.
    const after4 = [...history, typeDefined(FEATURE4)];
    say('after 2→4: reparent root feature F to null (its current position)', await evaluateEvent(reparent(F, null), buildMemoryContext([WF], after4)));
    say('after 2→4: create a new root feature', await evaluateEvent(created('01J9GTKM000000000000000000', 'feature', null, PROJECT), buildMemoryContext([WF], after4)));

    console.log('PROBE\n' + out.map((l) => '  ' + l).join('\n'));
    expect(true).toBe(true);
  });
});
```

### Appendix C — probe for E6-4 — deleted children and deleted parents

Place the file at `zz-exec6-probe-children.test.ts` (path shown relative to the repo root below), run from
`apps/server`:

```
rtk proxy pnpm exec vitest run test/zz-exec6-probe-children.test.ts --no-file-parallelism
```
File path in the tree: `apps/server/test/zz-exec6-probe-children.test.ts`. Same prerequisites as Appendix A.

```ts
// EXEC6 REVIEW PROBE — NOT A PRODUCT TEST. Deleted after the run; never committed.
// Question: does a soft-deleted open child block its parent's close, and can a live
// child be created under a soft-deleted parent?
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { membershipId, newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers/app.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { signInWithPhone } from './helpers/session.js';

let db: TestDatabase;
let app: FastifyInstance;
let ownerToken = '';
let ownerId = '';
let peerToken = '';
let peerId = '';
let WS = '';
let PRJ = '';
let LIVE = '';
let DELETED = '';

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function post(
  workspaceId: string,
  entity: { kind: string; id: string },
  type: string,
  payload: unknown,
  actorId: string,
  token: string,
): Promise<{ status: string; rule?: string; reason?: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: auth(token),
    payload: {
      events: [
        {
          id: newUlid(),
          workspaceId,
          entity,
          type,
          version: 1,
          payload,
          actorId,
          origin: 'web',
          clientTime: new Date().toISOString(),
        },
      ],
    },
  });
  const results = res.json<{ results: Array<{ status: string; rule?: string; reason?: string }> }>().results;
  return results[0]!;
}

function doc(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  await app.ready();
  const owner = await signInWithPhone(app, built.otp, '+919000000601');
  ownerToken = owner.token;
  ownerId = owner.userId;
  const peer = await signInWithPhone(app, built.otp, '+919000000602');
  peerToken = peer.token;
  peerId = peer.userId;

  const res = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: auth(ownerToken),
    payload: { name: 'Exec6 probe' },
  });
  expect(res.statusCode, res.body).toBe(201);
  WS = res.json<{ workspaceId: string }>().workspaceId;

  // The peer joins as a member through the door.
  const grant = await post(WS, { kind: 'membership', id: membershipId(WS, peerId) }, 'membership.granted', { userId: peerId, role: 'member' }, ownerId, ownerToken);
  expect(grant.status, JSON.stringify(grant)).toBe('committed');

  PRJ = newUlid();
  expect((await post(WS, { kind: 'project', id: PRJ }, 'project.created', { name: 'P' }, ownerId, ownerToken)).status).toBe('committed');
  for (const uid of [ownerId, peerId]) {
    expect((await post(WS, { kind: 'project', id: PRJ }, 'project.member_added', { userId: uid, projectAdmin: uid === ownerId }, ownerId, ownerToken)).status).toBe('committed');
  }
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('exec6 probe: deleted children and deleted parents', () => {
  it('records the door answers', async () => {
    const out: string[] = [];
    const say = (k: string, r: { status: string; rule?: string; reason?: string }) =>
      out.push(`${k.padEnd(62)} -> ${r.status}${r.rule ? ` (${r.rule}: ${r.reason})` : ''}`);
    const mk = (id: string, typeId: string, parentId: string | null, title: string) =>
      post(WS, { kind: 'ticket', id }, 'ticket.created', { typeId, projectId: PRJ, parentId, title }, ownerId, ownerToken);
    const mv = (id: string, to: string) => post(WS, { kind: 'ticket', id }, 'ticket.transitioned', { to }, ownerId, ownerToken);

    // A. Parent P (story) with one child C (task). Delete C, then try to close P.
    const P = newUlid(); const C = newUlid();
    say('create P (story, root)', await mk(P, 'story', null, 'P'));
    say('create C (task) under P', await mk(C, 'task', P, 'C'));
    say('P: todo -> doing', await mv(P, 'doing'));
    say('delete C', await post(WS, { kind: 'ticket', id: C }, 'ticket.deleted', {}, ownerId, ownerToken));
    const cnt = await db.pool.query<{ open: string }>(
      `SELECT count(*)::text AS open FROM proj_tickets WHERE parent_id = $1 AND deleted_at IS NULL AND state_category <> 'terminal'`, [P]);
    out.push(`  proj_tickets live open children of P (what a view counts): ${cnt.rows[0]!.open}`);
    say('P: doing -> done  (C deleted, C was open)', await mv(P, 'done'));
    // Control: a live open child blocks too (so the refusal wording is the same one)
    const P2 = newUlid(); const C2 = newUlid();
    say('control: create P2, C2 under P2, P2 -> doing', await mk(P2, 'story', null, 'P2'));
    await mk(C2, 'task', P2, 'C2'); await mv(P2, 'doing');
    say('control: P2 doing -> done with LIVE open child', await mv(P2, 'done'));
    // Control 2: after the child is DONE, the parent closes
    say('control: C2 -> doing', await mv(C2, 'doing'));
    say('control: C2 -> done', await mv(C2, 'done'));
    say('control: P2 doing -> done with child done', await mv(P2, 'done'));

    // What does the board/detail door tell the owner about P's children?
    const detail = await app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${P}`, headers: auth(ownerToken) });
    const d = detail.json<Record<string, unknown>>();
    out.push(`  GET ticket P -> ${detail.statusCode}; keys mentioning child/rollup: ${Object.keys(d).filter((k) => /child|rollup|open/i.test(k)).join(',') || '(none)'}; body excerpt: ${detail.body.slice(0, 300)}`);

    // B. Delete a parent, then create a live child under it.
    const DP = newUlid(); const LC = newUlid();
    say('create DP (story, root)', await mk(DP, 'story', null, 'DP'));
    say('delete DP', await post(WS, { kind: 'ticket', id: DP }, 'ticket.deleted', {}, ownerId, ownerToken));
    say('create LC (task) under DELETED DP', await mk(LC, 'task', DP, 'LC'));
    say('reparent live C2 under DELETED DP', await post(WS, { kind: 'ticket', id: C2 }, 'ticket.reparented', { newParentId: DP }, ownerId, ownerToken));
    const lcDetail = await app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${LC}`, headers: auth(ownerToken) });
    out.push(`  GET ticket LC (live child of deleted parent) -> ${lcDetail.statusCode}; body excerpt: ${lcDetail.body.slice(0, 500)}`);
    const list = await app.inject({ method: 'GET', url: `/v1/projects/${PRJ}/tickets`, headers: auth(ownerToken) });
    out.push(`  GET list -> ${list.statusCode}; LC present: ${list.body.includes(LC)}; DP present: ${list.body.includes(DP)}`);
    const lb = list.json<Record<string, unknown>>();
    out.push(`  list keys: ${Object.keys(lb).join(',')}`);
    const cards = (lb['cards'] ?? lb['tickets'] ?? lb['items'] ?? []) as Array<Record<string, unknown>>;
    out.push(`  list cards: ${cards.length}; card ids: ${cards.map((c) => c['ticketId'] ?? c['id']).join(',')}`);
    out.push(`  DP is a card: ${cards.some((c) => (c['ticketId'] ?? c['id']) === DP)}; C (deleted child) is a card: ${cards.some((c) => (c['ticketId'] ?? c['id']) === C)}`);
    for (const m of list.body.matchAll(new RegExp(`.{0,80}${DP}.{0,40}`, 'g'))) out.push(`  DP context: ${m[0]}`);
    const pd = detail.json<Record<string, unknown>>();
    out.push(`  P rollup: ${JSON.stringify(pd['rollup'])}`);
    const lcd = lcDetail.json<Record<string, unknown>>();
    out.push(`  LC keys: ${Object.keys(lcd).join(',')}; parents/crumb: ${JSON.stringify(lcd['parents'] ?? lcd['ancestry'] ?? lcd['crumb'] ?? null)?.slice(0, 300)}`);
    const board = await app.inject({ method: 'GET', url: `/v1/projects/${PRJ}/board`, headers: auth(ownerToken) });
    out.push(`  GET board -> ${board.statusCode}; LC present: ${board.body.includes(LC)}; DP present: ${board.body.includes(DP)}`);

    console.log('PROBE\n' + out.map((l) => '  ' + l).join('\n'));
    expect(true).toBe(true);
  });
});
```

### Appendix D — probe for E6-5 — outbox overtake after a transient failure

Place the file at `zz-exec6-probe-overtake.test.ts` (path shown relative to the repo root below), run from
`packages/sync-client`:

```
rtk proxy pnpm exec vitest run test/zz-exec6-probe-overtake.test.ts --no-file-parallelism
```
File path in the tree: `packages/sync-client/test/zz-exec6-probe-overtake.test.ts`. The header (fixtures, helpers) is copied verbatim from `test/outbox.test.ts`; only the final `describe` is new. Uses the in-memory better-sqlite3 storage.

```ts
import { afterEach, describe, expect, it } from 'vitest';
import {
  newSubmittedEvent,
  newUlid,
  type EventEnvelope,
  type LedgerEvent,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import type { SyncStorage } from '../src/storage/storage.js';
import { createReplica, type BootstrapResponse, type Replica } from '../src/replica/replica.js';
import { backoffMs, createOutbox, type Outbox } from '../src/outbox/outbox.js';

/**
 * Plan 10 Task 10 — the outbox. Cases 12.144–12.153.
 *
 * The range is a fact about the moment it was written. `grep -cE
 * "^[[:space:]]*it\(" test/outbox.test.ts` prints the number of `it`
 * declarations here; one sits inside a two-zone loop (12.152) and therefore
 * runs twice, so the runner's own count is one higher than the id count.
 *
 * ## The property the whole file is built around
 *
 * **A queued claim is never settled fact.** Nothing in `outbox.ts` writes to
 * `tickets`, `snapshots` or `events`; a claim in transit moves `pendingFor` and
 * `pendingCreatedTickets` and nothing else. 12.150 is the case that fails if
 * that ever stops being true.
 */

const WS = newUlid();
const OTHER_WS = newUlid();
const PROJECT = newUlid();
const USER_A = newUlid();
const WF = newUlid();
const TYPE_TASK = newUlid();

const SERVER_TIME = '2026-08-20T00:00:00.000Z';
const CLIENT_TIME = '2026-08-19T23:59:00.000Z';

const wf = {
  id: WF,
  version: 1,
  name: 'W',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'done', rules: [] },
    { from: '*', to: 'todo', rules: [] },
  ],
};

const taskType = { id: TYPE_TASK, name: 'Task', icon: 'check', rank: 3, workflowId: WF, fields: [] };

let seqCounter = 0;
let streamCounter = 0;

function committed(entity: EventEnvelope['entity'], type: string, payload: unknown, seq?: number): LedgerEvent {
  seqCounter += 1;
  streamCounter += 1;
  return {
    ...newSubmittedEvent({
      workspaceId: WS,
      entity,
      type,
      payload,
      actorId: USER_A,
      origin: 'server',
      now: () => new Date(CLIENT_TIME),
    }),
    serverTime: SERVER_TIME,
    seq: seq ?? seqCounter,
    workspaceSeq: streamCounter,
  };
}

function bootstrapOf(): BootstrapResponse {
  return {
    workspaceId: WS,
    me: { userId: USER_A, workspaceRole: 'member', projectIds: [PROJECT] },
    streamSeq: 0,
    definitions: [
      committed({ kind: 'workflow', id: WF }, 'workflow.defined', wf, 1),
      committed({ kind: 'ticket-type', id: TYPE_TASK }, 'ticket-type.defined', taskType, 1),
    ],
    tickets: [],
  };
}

type Fixture = { storage: SyncStorage; replica: Replica; outbox: Outbox };

async function fixture(): Promise<Fixture> {
  seqCounter = 0;
  streamCounter = 0;
  const storage = createBetterSqliteStorage();
  const replica = await createReplica({ storage });
  await replica.loadBootstrap(bootstrapOf());
  return { storage, replica, outbox: createOutbox({ storage, replica }) };
}

/** A brand-new root ticket, born offline. PAYLOAD spells the parent `parentId` and the type `typeId`. */
function createTicket(ticketId = newUlid(), title = 'Offline born'): SubmittedEvent {
  return newSubmittedEvent({
    workspaceId: WS,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.created',
    payload: { typeId: TYPE_TASK, projectId: PROJECT, parentId: null, title },
    actorId: USER_A,
    origin: 'mobile',
  });
}

/**
 * 12.21 — order preservation is asserted at 12.144 (outbox.test.ts:116), the committed/contested/failed result-application clauses at 12.145 (:138), 12.146 (:164) and 12.147 (:198) respectively, and the exponential backoff (doubling from 1s, capped at 60s) at 12.153 (:438) — no single test proves this row; each clause lives in its own named case.
 */
describe('exec6 probe: can a later claim overtake a backing-off earlier one?', () => {
  it('records what nextBatch offers after a transient failure', async () => {
    const { storage, outbox } = await fixture();
    const create = createTicket();
    const rename = newSubmittedEvent({ workspaceId: WS, entity: create.entity, type: 'ticket.field_set', payload: { fieldId: 'title', value: 'first rename' }, actorId: USER_A, origin: 'mobile' });
    expect(await outbox.enqueue(create)).toEqual({ queued: true, eventId: create.id });
    expect(await outbox.enqueue(rename)).toEqual({ queued: true, eventId: rename.id });
    const t0 = new Date('2026-09-21T10:00:00.000Z');
    const batch1 = (await outbox.nextBatch(50, () => t0)).map((i) => i.eventId);
    // Transient failure on that batch (e.g. the transport threw): both back off.
    await outbox.recordFailure(batch1, 'network', () => t0);
    // The user keeps working: a second rename on the SAME ticket is enqueued after the failure.
    const rename2 = newSubmittedEvent({ workspaceId: WS, entity: create.entity, type: 'ticket.field_set', payload: { fieldId: 'title', value: 'second rename' }, actorId: USER_A, origin: 'mobile' });
    expect(await outbox.enqueue(rename2)).toEqual({ queued: true, eventId: rename2.id });
    // A flush 500 ms later (before backoffMs(1) = 2 s has elapsed):
    const t1 = new Date(t0.getTime() + 500);
    const batch2 = (await outbox.nextBatch(50, () => t1)).map((i) => i.eventId);
    const name = (id: string) => (id === create.id ? 'CREATE' : id === rename.id ? 'RENAME-1' : id === rename2.id ? 'RENAME-2' : id);
    console.log(`PROBE batch1 (t0)        = [${batch1.map(name).join(', ')}]`);
    console.log(`PROBE batch2 (t0+500ms)  = [${batch2.map(name).join(', ')}]   <- offered to the server BEFORE the ticket.created it depends on`);
    const t2 = new Date(t0.getTime() + 2500);
    const batch3 = (await outbox.nextBatch(50, () => t2)).map((i) => i.eventId);
    console.log(`PROBE batch3 (t0+2.5s)   = [${batch3.map(name).join(', ')}]`);
    await storage.close();
    expect(true).toBe(true);
  });
});
```

### Appendix E — dev-database read for E6-7 (read-only transaction)

Place the file at `/private/tmp/claude-501/-Users-kiro-my-projects-gisik-nokma-exec6/babb00bd-cec9-4b69-82e3-2463a1a044c1/scratchpad/devdb.mjs` (path shown relative to the repo root below), run from
`apps/server`:

```
cp <this file> apps/server/zz-devdb.mjs && cd apps/server && node zz-devdb.mjs && rm zz-devdb.mjs
```
Reads the OWNER's dev database on `54330` inside `BEGIN READ ONLY … ROLLBACK`; writes nothing. Output at 10:1x IST 2026-09-21: `pgmigrations rows: 32`; `last 3: 1790000000000_proj-ticket-comments @ 2026-09-21T02:50:18.602Z | 1789900000000_proj-projects-prefix @ 2026-09-20T10:10:31.511Z | 1789800000000_proj-tickets-deleted @ 2026-09-20T10:10:31.511Z`; `events: { n: 169, latest: 2026-09-21T03:30:06.282Z }`.

```ts
import pg from 'pg';
const c = new pg.Client({ connectionString: 'postgres://gisik:gisik@localhost:54330/gisik_nokma' });
await c.connect();
await c.query('BEGIN READ ONLY');
const n = await c.query('SELECT count(*)::int AS n FROM pgmigrations');
const last = await c.query('SELECT name, run_on FROM pgmigrations ORDER BY id DESC LIMIT 3');
const tables = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name LIKE 'proj_%' ORDER BY 1");
const ev = await c.query('SELECT count(*)::int AS n, max(server_time) AS latest FROM events');
console.log('pgmigrations rows:', n.rows[0].n);
console.log('last 3:', last.rows.map(r => `${r.name} @ ${new Date(r.run_on).toISOString()}`).join(' | '));
console.log('proj_ tables:', tables.rows.map(r => r.table_name).join(','));
console.log('events:', ev.rows[0]);
await c.query('ROLLBACK');
await c.end();
```

### Appendix F — probe for E6-8 — republish promotion versus the parent-terminal invariant

Place the file at `zz-exec6-probe-promote.test.ts` (path shown relative to the repo root below), run from
`packages/rule-engine`:

```
rtk proxy pnpm exec vitest run test/zz-exec6-probe-promote.test.ts --no-file-parallelism
```
File path in the tree: `packages/rule-engine/test/zz-exec6-probe-promote.test.ts`. Pure in-memory; relative imports.

```ts
// EXEC6 REVIEW PROBE — NOT A PRODUCT TEST. Deleted after the run; never committed.
// Question: can a republish put a parent with open children into a terminal state,
// and does `ticket.closed` then accept that parent?
import { describe, expect, it } from 'vitest';
import type { EventEnvelope, PublishedWorkflowDef } from '@gisik-nokma/domain';
import { makeEnvelope } from '@gisik-nokma/domain';
import { buildMemoryContext } from '../src/memory-context.js';
import { evaluateEvent } from '../src/evaluate.js';
import { EPIC, STORY, TASK, WF, WS, created, typeDefined } from '../src/checks/test-support.js';

const P = '01J9GTKP000000000000000000';
const C = '01J9GTKC000000000000000000';

function ev(type: string, entity: EventEnvelope['entity'], payload: unknown): EventEnvelope {
  return makeEnvelope({ type, entity, workspaceId: WS, payload });
}
const move = (id: string, to: string) => ev('ticket.transitioned', { kind: 'ticket', id }, { to });
const publish = (def: PublishedWorkflowDef) => ev('workflow.defined', { kind: 'workflow', id: def.id }, def);

// v2a: 'doing' KEPT but promoted active -> terminal.
const V2_PROMOTED: PublishedWorkflowDef = {
  ...WF,
  version: 2,
  states: WF.states.map((s) => (s.id === 'doing' ? { ...s, category: 'terminal' as const } : s)),
};
// v2b: 'doing' DROPPED and mapped onto terminal 'done'.
const V2_MAPPED: PublishedWorkflowDef = {
  ...WF,
  version: 2,
  states: WF.states.filter((s) => s.id !== 'doing'),
  transitions: WF.transitions.filter((t) => t.from !== 'doing' && t.to !== 'doing'),
  stateMapping: { doing: 'done' },
};

describe('exec6 probe: republish promotion versus the parent-terminal invariant (case 4.23)', () => {
  it('records the engine answers', async () => {
    const out: string[] = [];
    const say = (k: string, v: { refused: boolean; rule?: string; reason?: string }) =>
      out.push(`${k.padEnd(66)} -> ${v.refused ? `REFUSED ${v.rule}: ${v.reason}` : 'ACCEPTED'}`);
    const base = [typeDefined(EPIC), typeDefined(STORY), typeDefined(TASK), created(P, 'story', null), created(C, 'task', P), move(P, 'doing')];

    // Control: the invariant holds on the transition path.
    say('control: P (child C open) doing -> done by transition', await evaluateEvent(move(P, 'done'), buildMemoryContext([WF], base)));

    // Door 1: kept state promoted to terminal.
    say('publish v2a: "doing" kept, active -> terminal (P sits in it, C open)', await evaluateEvent(publish(V2_PROMOTED), buildMemoryContext([WF], base)));
    const afterPromote = [...base, publish(V2_PROMOTED)];
    const ctxA = buildMemoryContext([WF], afterPromote);
    const pA = await ctxA.getEntityState('ticket', P);
    out.push(`  after v2a: P.stateId=${pA?.kind === 'ticket' ? pA.stateId : '?'} stateCategory=${pA?.kind === 'ticket' ? pA.stateCategory : '?'}; C open: ${(await ctxA.getChildrenStates(P)).map((c) => c.stateCategory).join(',')}`);
    say('after v2a: ticket.closed on P (terminal, child C still open)', await evaluateEvent(ev('ticket.closed', { kind: 'ticket', id: P }, {}), ctxA));

    // Door 2: dropped state mapped onto a terminal one.
    say('publish v2b: "doing" dropped, mapped -> "done" (P sits in it, C open)', await evaluateEvent(publish(V2_MAPPED), buildMemoryContext([WF], base)));
    const ctxB = buildMemoryContext([WF], [...base, publish(V2_MAPPED)]);
    const pB = await ctxB.getEntityState('ticket', P);
    out.push(`  after v2b: P.stateId=${pB?.kind === 'ticket' ? pB.stateId : '?'} stateCategory=${pB?.kind === 'ticket' ? pB.stateCategory : '?'}`);
    say('after v2b: ticket.closed on P (terminal, child C still open)', await evaluateEvent(ev('ticket.closed', { kind: 'ticket', id: P }, {}), ctxB));

    console.log('PROBE\n' + out.map((l) => '  ' + l).join('\n'));
    expect(true).toBe(true);
  });
});
```

### Appendix G — probe for E6-5 (server half) — the overtaken rename on `/v1/events` and `/v1/sync`

File path in the tree: `apps/server/test/zz-exec6-probe-ghost.test.ts`; run from `apps/server`:

```
rtk proxy pnpm exec vitest run test/zz-exec6-probe-ghost.test.ts --no-file-parallelism
```
Same prerequisites as Appendix A.

```ts
// EXEC6 REVIEW PROBE — NOT A PRODUCT TEST. Deleted after the run; never committed.
// Question (E6-5's server half): what does the door answer to a ticket.field_set on a ticket it has never been told about?
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { membershipId, newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers/app.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { signInWithPhone } from './helpers/session.js';

let db: TestDatabase;
let app: FastifyInstance;
let ownerToken = '';
let ownerId = '';
let peerToken = '';
let peerId = '';
let WS = '';
let PRJ = '';
let LIVE = '';
let DELETED = '';

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function post(
  workspaceId: string,
  entity: { kind: string; id: string },
  type: string,
  payload: unknown,
  actorId: string,
  token: string,
): Promise<{ status: string; rule?: string; reason?: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: auth(token),
    payload: {
      events: [
        {
          id: newUlid(),
          workspaceId,
          entity,
          type,
          version: 1,
          payload,
          actorId,
          origin: 'web',
          clientTime: new Date().toISOString(),
        },
      ],
    },
  });
  const results = res.json<{ results: Array<{ status: string; rule?: string; reason?: string }> }>().results;
  return results[0]!;
}

function doc(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  await app.ready();
  const owner = await signInWithPhone(app, built.otp, '+919000000601');
  ownerToken = owner.token;
  ownerId = owner.userId;
  const peer = await signInWithPhone(app, built.otp, '+919000000602');
  peerToken = peer.token;
  peerId = peer.userId;

  const res = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: auth(ownerToken),
    payload: { name: 'Exec6 probe' },
  });
  expect(res.statusCode, res.body).toBe(201);
  WS = res.json<{ workspaceId: string }>().workspaceId;

  // The peer joins as a member through the door.
  const grant = await post(WS, { kind: 'membership', id: membershipId(WS, peerId) }, 'membership.granted', { userId: peerId, role: 'member' }, ownerId, ownerToken);
  expect(grant.status, JSON.stringify(grant)).toBe('committed');

  PRJ = newUlid();
  expect((await post(WS, { kind: 'project', id: PRJ }, 'project.created', { name: 'P' }, ownerId, ownerToken)).status).toBe('committed');
  for (const uid of [ownerId, peerId]) {
    expect((await post(WS, { kind: 'project', id: PRJ }, 'project.member_added', { userId: uid, projectAdmin: uid === ownerId }, ownerId, ownerToken)).status).toBe('committed');
  }
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

async function sync(events: unknown[], token: string) {
  const res = await app.inject({ method: 'POST', url: '/v1/sync', headers: auth(token), payload: { events } });
  return { status: res.statusCode, body: res.json<{ results: Array<Record<string, unknown>> }>() };
}
function raw(entity: { kind: string; id: string }, type: string, payload: unknown, actorId: string) {
  return { id: newUlid(), workspaceId: WS, entity, type, version: 1, payload, actorId, origin: 'mobile', clientTime: new Date().toISOString() };
}

describe('exec6 probe: the overtaken rename, end to end on /v1/sync', () => {
  it('records what the sync door does with it, then what lands', async () => {
    const ghost = newUlid();
    // 1. /v1/events control: the gate's answer for an unknown ticket.
    const r = await post(WS, { kind: 'ticket', id: ghost }, 'ticket.field_set', { fieldId: 'title', value: 'second rename' }, ownerId, ownerToken);
    console.log(`PROBE /v1/events field_set on never-created ticket -> ${r.status} (${r.rule ?? ''}: ${r.reason ?? ''})`);
    // 2. /v1/sync: the overtaken RENAME-2 arrives alone.
    const s1 = await sync([raw({ kind: 'ticket', id: ghost }, 'ticket.field_set', { fieldId: 'title', value: 'second rename' }, ownerId)], ownerToken);
    console.log(`PROBE /v1/sync field_set alone -> HTTP ${s1.status} ${JSON.stringify(s1.body.results[0])}`);
    // 3. Two seconds later the CREATE and RENAME-1 arrive.
    const s2 = await sync([
      raw({ kind: 'ticket', id: ghost }, 'ticket.created', { typeId: 'task', projectId: PRJ, parentId: null, title: 'born offline' }, ownerId),
      raw({ kind: 'ticket', id: ghost }, 'ticket.field_set', { fieldId: 'title', value: 'first rename' }, ownerId),
    ], ownerToken);
    console.log(`PROBE /v1/sync create+rename1 -> HTTP ${s2.status} ${s2.body.results.map((x) => x['status']).join(',')}`);
    // 4. What does the ledger / projections hold about the contest?
    const contests = await db.pool.query<{ rule: string; reason: string; resolved: boolean | null; ticket_id: string }>(
      'SELECT rule, reason, resolved, ticket_id FROM proj_contested WHERE ticket_id = $1', [ghost]);
    console.log(`PROBE proj_contested rows for the ticket: ${contests.rows.length} ${JSON.stringify(contests.rows)}`);
    const title = await db.pool.query<{ title: string | null }>("SELECT fields->'title'->>'value' AS title FROM proj_tickets WHERE ticket_id = $1", [ghost]);
    console.log(`PROBE ticket title now: ${JSON.stringify(title.rows[0])}`);
    // 5. Does the contest show on the owner's surfaces?
    const mine = await app.inject({ method: 'GET', url: `/v1/me/work?workspaceId=${WS}`, headers: auth(ownerToken) });
    console.log(`PROBE my-work -> ${mine.statusCode}; mentions contested: ${mine.body.includes('contested')}; excerpt: ${mine.body.slice(0, 400)}`);
    const att = await app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/attention`, headers: auth(ownerToken) });
    console.log(`PROBE attention -> ${att.statusCode}; mentions ghost: ${att.body.includes(ghost)}; excerpt: ${att.body.slice(0, 400)}`);
    expect(true).toBe(true);
  });
});
```

### Appendix H — probe for E6-9 — the three form channels at the mint door

File path in the tree: `apps/server/test/zz-exec6-probe-channels.test.ts`; run from `apps/server`:

```
rtk proxy pnpm exec vitest run test/zz-exec6-probe-channels.test.ts --no-file-parallelism
```
Same prerequisites as Appendix A.

```ts
// EXEC6 REVIEW PROBE — NOT A PRODUCT TEST. Deleted after the run; never committed.
// Question: what does the mint door answer for each channel the members page offers?
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { membershipId, newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers/app.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { signInWithPhone } from './helpers/session.js';

let db: TestDatabase;
let app: FastifyInstance;
let ownerToken = '';
let ownerId = '';
let peerToken = '';
let peerId = '';
let WS = '';
let PRJ = '';
let LIVE = '';
let DELETED = '';

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function post(
  workspaceId: string,
  entity: { kind: string; id: string },
  type: string,
  payload: unknown,
  actorId: string,
  token: string,
): Promise<{ status: string; rule?: string; reason?: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: auth(token),
    payload: {
      events: [
        {
          id: newUlid(),
          workspaceId,
          entity,
          type,
          version: 1,
          payload,
          actorId,
          origin: 'web',
          clientTime: new Date().toISOString(),
        },
      ],
    },
  });
  const results = res.json<{ results: Array<{ status: string; rule?: string; reason?: string }> }>().results;
  return results[0]!;
}

function doc(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  await app.ready();
  const owner = await signInWithPhone(app, built.otp, '+919000000601');
  ownerToken = owner.token;
  ownerId = owner.userId;
  const peer = await signInWithPhone(app, built.otp, '+919000000602');
  peerToken = peer.token;
  peerId = peer.userId;

  const res = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: auth(ownerToken),
    payload: { name: 'Exec6 probe' },
  });
  expect(res.statusCode, res.body).toBe(201);
  WS = res.json<{ workspaceId: string }>().workspaceId;

  // The peer joins as a member through the door.
  const grant = await post(WS, { kind: 'membership', id: membershipId(WS, peerId) }, 'membership.granted', { userId: peerId, role: 'member' }, ownerId, ownerToken);
  expect(grant.status, JSON.stringify(grant)).toBe('committed');

  PRJ = newUlid();
  expect((await post(WS, { kind: 'project', id: PRJ }, 'project.created', { name: 'P' }, ownerId, ownerToken)).status).toBe('committed');
  for (const uid of [ownerId, peerId]) {
    expect((await post(WS, { kind: 'project', id: PRJ }, 'project.member_added', { userId: uid, projectAdmin: uid === ownerId }, ownerId, ownerToken)).status).toBe('committed');
  }
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('exec6 probe: the three channels the mint form offers, at the mint door', () => {
  it('records the door answer per channel', async () => {
    for (const channel of ['email', 'sms', 'whatsapp', 'phone']) {
      const address = channel === 'email' ? `probe-${channel}@example.com` : '+919000000777';
      const res = await app.inject({
        method: 'POST',
        url: `/v1/workspaces/${WS}/invites`,
        headers: auth(ownerToken),
        payload: { address, channel, role: 'member' },
      });
      console.log(`PROBE mint channel=${channel.padEnd(8)} -> HTTP ${res.statusCode} ${res.body.slice(0, 220)}`);
    }
    expect(true).toBe(true);
  });
});
```

### Appendix I — probe for E6-10 — the bulk rebind refused part-way by the permission gate

File path in the tree: `apps/server/test/zz-exec6-probe-migrate.test.ts`; run from `apps/server`:

```
rtk proxy pnpm exec vitest run test/zz-exec6-probe-migrate.test.ts --no-file-parallelism
```
Same prerequisites as Appendix A. (`ORDER BY ticket_id` put T1 before T0 in this run — ULIDs minted in the same
millisecond do not sort by call order — which is why T0 is the one that moved; the property does not depend on
the order, only on there being at least one visible and one invisible ticket.)

```ts
// EXEC6 REVIEW PROBE — NOT A PRODUCT TEST. Deleted after the run; never committed.
// Question: can the bulk rebind route be refused PART WAY through by the permission gate, leaving earlier tickets moved?
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { membershipId, newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers/app.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { signInWithPhone } from './helpers/session.js';

let db: TestDatabase;
let app: FastifyInstance;
let ownerToken = '';
let ownerId = '';
let peerToken = '';
let peerId = '';
let WS = '';
let PRJ = '';
let LIVE = '';
let DELETED = '';

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function post(
  workspaceId: string,
  entity: { kind: string; id: string },
  type: string,
  payload: unknown,
  actorId: string,
  token: string,
): Promise<{ status: string; rule?: string; reason?: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: auth(token),
    payload: {
      events: [
        {
          id: newUlid(),
          workspaceId,
          entity,
          type,
          version: 1,
          payload,
          actorId,
          origin: 'web',
          clientTime: new Date().toISOString(),
        },
      ],
    },
  });
  const results = res.json<{ results: Array<{ status: string; rule?: string; reason?: string }> }>().results;
  return results[0]!;
}

function doc(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  await app.ready();
  const owner = await signInWithPhone(app, built.otp, '+919000000601');
  ownerToken = owner.token;
  ownerId = owner.userId;
  const peer = await signInWithPhone(app, built.otp, '+919000000602');
  peerToken = peer.token;
  peerId = peer.userId;

  const res = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: auth(ownerToken),
    payload: { name: 'Exec6 probe' },
  });
  expect(res.statusCode, res.body).toBe(201);
  WS = res.json<{ workspaceId: string }>().workspaceId;

  // The peer joins as a member through the door.
  const grant = await post(WS, { kind: 'membership', id: membershipId(WS, peerId) }, 'membership.granted', { userId: peerId, role: 'admin' }, ownerId, ownerToken);
  expect(grant.status, JSON.stringify(grant)).toBe('committed');

  PRJ = newUlid();
  expect((await post(WS, { kind: 'project', id: PRJ }, 'project.created', { name: 'P' }, ownerId, ownerToken)).status).toBe('committed');
  expect((await post(WS, { kind: 'project', id: PRJ }, 'project.member_added', { userId: ownerId, projectAdmin: true }, ownerId, ownerToken)).status).toBe('committed');
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('exec6 probe: bulk rebind, partial refusal by the permission gate', () => {
  it('records what moved and what the route answered', async () => {
    const out: string[] = [];
    // A second project the ADMIN peer IS on.
    const Q = newUlid();
    expect((await post(WS, { kind: 'project', id: Q }, 'project.created', { name: 'Q' }, ownerId, ownerToken)).status).toBe('committed');
    for (const uid of [ownerId, peerId]) expect((await post(WS, { kind: 'project', id: Q }, 'project.member_added', { userId: uid, projectAdmin: false }, ownerId, ownerToken)).status).toBe('committed');
    // The founding workflow and the task type's binding.
    const wf = await db.pool.query<{ workflow_id: string }>("SELECT workflow_id FROM proj_ticket_types WHERE workspace_id = $1 AND type_id = 'task'", [WS]);
    const WF1 = wf.rows[0]!.workflow_id;
    // A second workflow with the same state ids, published through the door.
    const WF2 = newUlid();
    const def = { id: WF2, version: 1, name: 'Second', initialStateId: 'todo',
      states: [{ id: 'todo', name: 'To do', category: 'open' }, { id: 'doing', name: 'Doing', category: 'active' }, { id: 'done', name: 'Done', category: 'terminal' }],
      transitions: [{ from: '*', to: 'todo', rules: [] }, { from: '*', to: 'doing', rules: [] }, { from: '*', to: 'done', rules: [] }] };
    expect((await post(WS, { kind: 'workflow', id: WF2 }, 'workflow.defined', def, ownerId, ownerToken)).status).toBe('committed');
    // Tickets: T0 in Q (visible to the admin), then T1 and T2 in PRJ (project-mode, admin NOT on PRJ). ULIDs order by creation.
    const T0 = newUlid(); const T1 = newUlid(); const T2 = newUlid();
    for (const [id, prj, title] of [[T0, Q, 'in Q'], [T1, PRJ, 'in P #1'], [T2, PRJ, 'in P #2']] as const) {
      expect((await post(WS, { kind: 'ticket', id }, 'ticket.created', { typeId: 'task', projectId: prj, parentId: null, title }, ownerId, ownerToken)).status).toBe('committed');
    }
    const seeT1 = await app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${T1}`, headers: auth(peerToken) });
    const seeT0 = await app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${T0}`, headers: auth(peerToken) });
    out.push(`admin peer GET T0 (in Q) -> ${seeT0.statusCode}; GET T1 (in P) -> ${seeT1.statusCode}`);
    const before = await db.pool.query<{ ticket_id: string; workflow_id: string }>('SELECT ticket_id, workflow_id FROM proj_tickets WHERE ticket_id = ANY($1) ORDER BY ticket_id', [[T0, T1, T2]]);
    out.push(`before: ${before.rows.map((r) => `${r.ticket_id === T0 ? 'T0' : r.ticket_id === T1 ? 'T1' : 'T2'}=${r.workflow_id === WF1 ? 'WF1' : r.workflow_id === WF2 ? 'WF2' : '?'}`).join(' ')}`);
    // The admin runs the migration.
    const res = await app.inject({ method: 'POST', url: `/v1/workspaces/${WS}/ticket-types/task/migrate`, headers: auth(peerToken),
      payload: { fromWorkflowId: WF1, toWorkflowId: WF2, stateMap: { todo: 'todo', doing: 'doing', done: 'done' } } });
    out.push(`POST migrate as admin -> HTTP ${res.statusCode} ${res.body}`);
    const after = await db.pool.query<{ ticket_id: string; workflow_id: string }>('SELECT ticket_id, workflow_id FROM proj_tickets WHERE ticket_id = ANY($1) ORDER BY ticket_id', [[T0, T1, T2]]);
    out.push(`after:  ${after.rows.map((r) => `${r.ticket_id === T0 ? 'T0' : r.ticket_id === T1 ? 'T1' : 'T2'}=${r.workflow_id === WF1 ? 'WF1' : r.workflow_id === WF2 ? 'WF2' : '?'}`).join(' ')}`);
    const appended = await db.pool.query<{ n: string }>("SELECT count(*)::text AS n FROM events WHERE type = 'ticket.workflow_rebound' AND workspace_id = $1", [WS]);
    out.push(`ticket.workflow_rebound events appended: ${appended.rows[0]!.n}`);
    // Control: the OWNER (sees everything) runs the same migration on what is left.
    const res2 = await app.inject({ method: 'POST', url: `/v1/workspaces/${WS}/ticket-types/task/migrate`, headers: auth(ownerToken),
      payload: { fromWorkflowId: WF1, toWorkflowId: WF2, stateMap: { todo: 'todo', doing: 'doing', done: 'done' } } });
    out.push(`control: POST migrate as owner -> HTTP ${res2.statusCode} ${res2.body}`);
    console.log('PROBE\n' + out.map((l) => '  ' + l).join('\n'));
    expect(true).toBe(true);
  });
});
```

### Appendix J — probe for E6-11 — a deleted epic as a list group header

File path in the tree: `apps/server/test/zz-exec6-probe-epic.test.ts`; run from `apps/server`:

```
rtk proxy pnpm exec vitest run test/zz-exec6-probe-epic.test.ts --no-file-parallelism
```
Same prerequisites as Appendix A.

```ts
// EXEC6 REVIEW PROBE — NOT A PRODUCT TEST. Deleted after the run; never committed.
// Question: does the list's epic grouping serve a soft-deleted epic's title as a group header?
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { membershipId, newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers/app.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { signInWithPhone } from './helpers/session.js';

let db: TestDatabase;
let app: FastifyInstance;
let ownerToken = '';
let ownerId = '';
let peerToken = '';
let peerId = '';
let WS = '';
let PRJ = '';
let LIVE = '';
let DELETED = '';

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function post(
  workspaceId: string,
  entity: { kind: string; id: string },
  type: string,
  payload: unknown,
  actorId: string,
  token: string,
): Promise<{ status: string; rule?: string; reason?: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: auth(token),
    payload: {
      events: [
        {
          id: newUlid(),
          workspaceId,
          entity,
          type,
          version: 1,
          payload,
          actorId,
          origin: 'web',
          clientTime: new Date().toISOString(),
        },
      ],
    },
  });
  const results = res.json<{ results: Array<{ status: string; rule?: string; reason?: string }> }>().results;
  return results[0]!;
}

function doc(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  await app.ready();
  const owner = await signInWithPhone(app, built.otp, '+919000000601');
  ownerToken = owner.token;
  ownerId = owner.userId;
  const peer = await signInWithPhone(app, built.otp, '+919000000602');
  peerToken = peer.token;
  peerId = peer.userId;

  const res = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: auth(ownerToken),
    payload: { name: 'Exec6 probe' },
  });
  expect(res.statusCode, res.body).toBe(201);
  WS = res.json<{ workspaceId: string }>().workspaceId;

  // The peer joins as a member through the door.
  const grant = await post(WS, { kind: 'membership', id: membershipId(WS, peerId) }, 'membership.granted', { userId: peerId, role: 'member' }, ownerId, ownerToken);
  expect(grant.status, JSON.stringify(grant)).toBe('committed');

  PRJ = newUlid();
  expect((await post(WS, { kind: 'project', id: PRJ }, 'project.created', { name: 'P' }, ownerId, ownerToken)).status).toBe('committed');
  for (const uid of [ownerId, peerId]) {
    expect((await post(WS, { kind: 'project', id: PRJ }, 'project.member_added', { userId: uid, projectAdmin: uid === ownerId }, ownerId, ownerToken)).status).toBe('committed');
  }
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('exec6 probe: a deleted epic as a list group header', () => {
  it('records what the list and the detail door say about the deleted epic', async () => {
    const out: string[] = [];
    const E = newUlid(); const T = newUlid();
    const mk = (id: string, typeId: string, parentId: string | null, title: string) =>
      post(WS, { kind: 'ticket', id }, 'ticket.created', { typeId, projectId: PRJ, parentId, title }, ownerId, ownerToken);
    expect((await mk(E, 'epic', null, 'SECRET EPIC TITLE')).status).toBe('committed');
    expect((await mk(T, 'task', E, 'a task under the epic')).status).toBe('committed');
    const listBefore = await app.inject({ method: 'GET', url: `/v1/projects/${PRJ}/tickets?groupBy=epic`, headers: auth(ownerToken) });
    const groupsBefore = listBefore.json<{ groups: Array<{ key: string; label: string; cards: unknown[] }> }>().groups;
    out.push(`before delete: list groups = ${JSON.stringify(groupsBefore.map((g) => ({ label: g.label, cards: g.cards.length })))}`);
    expect((await post(WS, { kind: 'ticket', id: E }, 'ticket.deleted', {}, ownerId, ownerToken)).status).toBe('committed');
    const detail = await app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${E}`, headers: auth(ownerToken) });
    out.push(`after delete: GET epic detail -> ${detail.statusCode}`);
    const tDetail = await app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${T}`, headers: auth(ownerToken) });
    const td = tDetail.json<Record<string, unknown>>();
    out.push(`after delete: GET task detail -> ${tDetail.statusCode}; parent=${JSON.stringify(td['parent'])}; epic=${JSON.stringify(td['epic'])}`);
    const list = await app.inject({ method: 'GET', url: `/v1/projects/${PRJ}/tickets?groupBy=epic`, headers: auth(ownerToken) });
    const groups = list.json<{ groups: Array<{ key: string; label: string; cards: unknown[] }> }>().groups;
    out.push(`after delete: list groups = ${JSON.stringify(groups.map((g) => ({ label: g.label, cards: g.cards.length })))}`);
    out.push(`after delete: list body contains the deleted epic's title: ${list.body.includes('SECRET EPIC TITLE')}`);
    const search = await app.inject({ method: 'GET', url: `/v1/search?workspaceId=${WS}&q=SECRET`, headers: auth(ownerToken) });
    out.push(`after delete: search "SECRET" -> ${search.statusCode}; contains title: ${search.body.includes('SECRET EPIC TITLE')}`);
    console.log('PROBE\n' + out.map((l) => '  ' + l).join('\n'));
    expect(true).toBe(true);
  });
});
```

### Appendix K — probe for E6-12 — the four guest doors 6.51/6.77 declare admitted

File path in the tree: `apps/server/test/zz-exec6-probe-guest.test.ts`; run from `apps/server`:

```
rtk proxy pnpm exec vitest run test/zz-exec6-probe-guest.test.ts --no-file-parallelism
```
Same prerequisites as Appendix A.

```ts
// EXEC6 REVIEW PROBE — NOT A PRODUCT TEST. Deleted after the run; never committed.
// Question: are the four guest admissions case 6.51/6.77 record still admitted today?
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { membershipId, newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers/app.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { signInWithPhone } from './helpers/session.js';

let db: TestDatabase;
let app: FastifyInstance;
let ownerToken = '';
let ownerId = '';
let peerToken = '';
let peerId = '';
let WS = '';
let PRJ = '';
let LIVE = '';
let DELETED = '';

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function post(
  workspaceId: string,
  entity: { kind: string; id: string },
  type: string,
  payload: unknown,
  actorId: string,
  token: string,
): Promise<{ status: string; rule?: string; reason?: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: auth(token),
    payload: {
      events: [
        {
          id: newUlid(),
          workspaceId,
          entity,
          type,
          version: 1,
          payload,
          actorId,
          origin: 'web',
          clientTime: new Date().toISOString(),
        },
      ],
    },
  });
  const results = res.json<{ results: Array<{ status: string; rule?: string; reason?: string }> }>().results;
  return results[0]!;
}

function doc(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  await app.ready();
  const owner = await signInWithPhone(app, built.otp, '+919000000601');
  ownerToken = owner.token;
  ownerId = owner.userId;
  const peer = await signInWithPhone(app, built.otp, '+919000000602');
  peerToken = peer.token;
  peerId = peer.userId;

  const res = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: auth(ownerToken),
    payload: { name: 'Exec6 probe' },
  });
  expect(res.statusCode, res.body).toBe(201);
  WS = res.json<{ workspaceId: string }>().workspaceId;

  // The peer joins as a member through the door.
  const grant = await post(WS, { kind: 'membership', id: membershipId(WS, peerId) }, 'membership.granted', { userId: peerId, role: 'guest' }, ownerId, ownerToken);
  expect(grant.status, JSON.stringify(grant)).toBe('committed');

  PRJ = newUlid();
  expect((await post(WS, { kind: 'project', id: PRJ }, 'project.created', { name: 'P' }, ownerId, ownerToken)).status).toBe('committed');
  expect((await post(WS, { kind: 'project', id: PRJ }, 'project.member_added', { userId: ownerId, projectAdmin: true }, ownerId, ownerToken)).status).toBe('committed');
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('exec6 probe: the guest admissions cases 6.51 / 6.77 assert', () => {
  it('records the door answer for a GUEST actor', async () => {
    const out: string[] = [];
    const say = (k: string, r: { status: string; rule?: string; reason?: string }) => out.push(`${k.padEnd(52)} -> ${r.status}${r.rule ? ` (${r.rule}: ${r.reason})` : ''}`);
    // A ticket the guest is explicitly named on, so canSee is true for them.
    const T = newUlid();
    expect((await post(WS, { kind: 'ticket', id: T }, 'ticket.created', { typeId: 'task', projectId: PRJ, parentId: null, title: 'shared with guest' }, ownerId, ownerToken)).status).toBe('committed');
    expect((await post(WS, { kind: 'ticket', id: T }, 'visibility.set', { ticketId: T, mode: 'explicit', userIds: [ownerId, peerId] }, ownerId, ownerToken)).status).toBe('committed');
    const see = await app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${T}`, headers: auth(peerToken) });
    out.push(`guest GET shared ticket -> ${see.statusCode}`);
    say('guest: workspace.renamed', await post(WS, { kind: 'workspace', id: WS }, 'workspace.renamed', { name: 'renamed by guest' }, peerId, peerToken));
    say('guest: ticket.created', await post(WS, { kind: 'ticket', id: newUlid() }, 'ticket.created', { typeId: 'task', projectId: PRJ, parentId: null, title: 'by guest' }, peerId, peerToken));
    say('guest: comment.added on the shared ticket', await post(WS, { kind: 'ticket', id: T }, 'comment.added', { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] } }, peerId, peerToken));
    say('guest: visibility.set on the shared ticket -> workspace', await post(WS, { kind: 'ticket', id: T }, 'visibility.set', { ticketId: T, mode: 'workspace' }, peerId, peerToken));
    console.log('PROBE\n' + out.map((l) => '  ' + l).join('\n'));
    expect(true).toBe(true);
  });
});
```

### Appendix L — probe for E6-13 — the verifier after a type re-bind

File path in the tree: `apps/server/test/zz-exec6-probe-verify.test.ts`; run from `apps/server`:

```
rtk proxy pnpm exec vitest run test/zz-exec6-probe-verify.test.ts --no-file-parallelism
```
Same prerequisites as Appendix A. (The first two runs of this file were refused `malformed-envelope … entity.id:
must be a ULID` because I had addressed the `ticket-type.defined` event to the slug; the builder mints a fresh ULID
per submission — `workflow-builder/events.ts:59-64` — and so does this file now.)

```ts
// EXEC6 REVIEW PROBE — NOT A PRODUCT TEST. Deleted after the run; never committed.
// Question: does verify-projections report DRIFT on a correct live table after a custom type is re-bound to another workflow through the door?
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { membershipId, newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers/app.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { signInWithPhone } from './helpers/session.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { verifyProjections, formatReport } from '../src/tools/verify-projections.js';

let db: TestDatabase;
let app: FastifyInstance;
let ownerToken = '';
let ownerId = '';
let peerToken = '';
let peerId = '';
let WS = '';
let PRJ = '';
let LIVE = '';
let DELETED = '';

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function post(
  workspaceId: string,
  entity: { kind: string; id: string },
  type: string,
  payload: unknown,
  actorId: string,
  token: string,
): Promise<{ status: string; rule?: string; reason?: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: auth(token),
    payload: {
      events: [
        {
          id: newUlid(),
          workspaceId,
          entity,
          type,
          version: 1,
          payload,
          actorId,
          origin: 'web',
          clientTime: new Date().toISOString(),
        },
      ],
    },
  });
  const results = res.json<{ results: Array<{ status: string; rule?: string; reason?: string }> }>().results;
  return results[0]!;
}

function doc(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  await app.ready();
  const owner = await signInWithPhone(app, built.otp, '+919000000601');
  ownerToken = owner.token;
  ownerId = owner.userId;
  const peer = await signInWithPhone(app, built.otp, '+919000000602');
  peerToken = peer.token;
  peerId = peer.userId;

  const res = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: auth(ownerToken),
    payload: { name: 'Exec6 probe' },
  });
  expect(res.statusCode, res.body).toBe(201);
  WS = res.json<{ workspaceId: string }>().workspaceId;

  // The peer joins as a member through the door.
  const grant = await post(WS, { kind: 'membership', id: membershipId(WS, peerId) }, 'membership.granted', { userId: peerId, role: 'member' }, ownerId, ownerToken);
  expect(grant.status, JSON.stringify(grant)).toBe('committed');

  PRJ = newUlid();
  expect((await post(WS, { kind: 'project', id: PRJ }, 'project.created', { name: 'P' }, ownerId, ownerToken)).status).toBe('committed');
  for (const uid of [ownerId, peerId]) {
    expect((await post(WS, { kind: 'project', id: PRJ }, 'project.member_added', { userId: uid, projectAdmin: uid === ownerId }, ownerId, ownerToken)).status).toBe('committed');
  }
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('exec6 probe: verify-projections after a type re-bind', () => {
  it('records the verifier verdict before and after', async () => {
    const out: string[] = [];
    const projections = buildProjectionRegistry();
    const wf = await db.pool.query<{ workflow_id: string }>("SELECT workflow_id FROM proj_ticket_types WHERE workspace_id = $1 AND type_id = 'task'", [WS]);
    const WF1 = wf.rows[0]!.workflow_id;
    const WF2 = newUlid();
    const def = { id: WF2, version: 1, name: 'Second', initialStateId: 'todo',
      states: [{ id: 'todo', name: 'To do', category: 'open' }, { id: 'done', name: 'Done', category: 'terminal' }],
      transitions: [{ from: '*', to: 'todo', rules: [] }, { from: '*', to: 'done', rules: [] }] };
    expect((await post(WS, { kind: 'workflow', id: WF2 }, 'workflow.defined', def, ownerId, ownerToken)).status).toBe('committed');
    // A custom type bound to WF1, one ticket of it.
    const FEAT = { id: 'feature', name: 'Feature', icon: 'flag', rank: 2, workflowId: WF1, fields: [] };
    const r0 = await post(WS, { kind: 'ticket-type', id: newUlid() }, 'ticket-type.defined', FEAT, ownerId, ownerToken);
    expect(r0.status, JSON.stringify(r0)).toBe('committed');
    const T = newUlid();
    expect((await post(WS, { kind: 'ticket', id: T }, 'ticket.created', { typeId: 'feature', projectId: PRJ, parentId: null, title: 'born on WF1' }, ownerId, ownerToken)).status).toBe('committed');
    const before = await verifyProjections({ pool: db.pool, projections });
    out.push(`before re-bind: ${formatReport(before).split('\n')[0]}`);
    // Re-bind the type to WF2 through the door (what the type editor's Workflow select submits), touching no ticket.
    expect((await post(WS, { kind: 'ticket-type', id: newUlid() }, 'ticket-type.defined', { ...FEAT, workflowId: WF2 }, ownerId, ownerToken)).status).toBe('committed');
    const live = await db.pool.query<{ workflow_id: string }>('SELECT workflow_id FROM proj_tickets WHERE ticket_id = $1', [T]);
    out.push(`live proj_tickets.workflow_id for T after re-bind: ${live.rows[0]!.workflow_id === WF1 ? 'WF1 (unchanged — "a re-binding affects new tickets only")' : 'WF2'}`);
    const after = await verifyProjections({ pool: db.pool, projections });
    out.push(`after re-bind: ${formatReport(after).replace(/\n/g, ' | ').slice(0, 700)}`);
    console.log('PROBE\n' + out.map((l) => '  ' + l).join('\n'));
    expect(true).toBe(true);
  });
});
```

### Appendix M — probe for E6-15 — cross-site WebSocket hijacking on `/v1/stream`

File path in the tree: `apps/server/test/zz-exec6-probe-cswsh.test.ts`; run from `apps/server`:

```
rtk proxy pnpm exec vitest run test/zz-exec6-probe-cswsh.test.ts --no-file-parallelism
```
Same prerequisites as Appendix A, plus a free `127.0.0.1:3061`. The first run of this file was made with
`buildTestApp(db)` — security hooks **off** — and its HTTP control answered `400` instead of `403`; that run is
not the measurement. The line below builds with `security: { webOrigin, rateLimit: null }` and the control
answers `403 forbidden_origin`.

```ts
// EXEC6 REVIEW PROBE — NOT A PRODUCT TEST. Deleted after the run; never committed.
// Question: does a COOKIE-authenticated WebSocket handshake with a foreign Origin get a subscribed stream? (cross-site WebSocket hijacking)
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { membershipId, newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers/app.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { signInWithPhone } from './helpers/session.js';
import { openStream } from './helpers/stream.js';

let db: TestDatabase;
let app: FastifyInstance;
let ownerToken = '';
let ownerId = '';
let peerToken = '';
let peerId = '';
let WS = '';
let PRJ = '';
let LIVE = '';
let DELETED = '';

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function post(
  workspaceId: string,
  entity: { kind: string; id: string },
  type: string,
  payload: unknown,
  actorId: string,
  token: string,
): Promise<{ status: string; rule?: string; reason?: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: auth(token),
    payload: {
      events: [
        {
          id: newUlid(),
          workspaceId,
          entity,
          type,
          version: 1,
          payload,
          actorId,
          origin: 'web',
          clientTime: new Date().toISOString(),
        },
      ],
    },
  });
  const results = res.json<{ results: Array<{ status: string; rule?: string; reason?: string }> }>().results;
  return results[0]!;
}

function doc(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db, { security: { webOrigin: 'http://localhost:3001', rateLimit: null } });
  app = built.app;
  (globalThis as unknown as { __builtOtp: unknown }).__builtOtp = built.otp;
  await app.ready();
  const owner = await signInWithPhone(app, built.otp, '+919000000601');
  ownerToken = owner.token;
  ownerId = owner.userId;
  const peer = await signInWithPhone(app, built.otp, '+919000000602');
  peerToken = peer.token;
  peerId = peer.userId;

  const res = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: auth(ownerToken),
    payload: { name: 'Exec6 probe' },
  });
  expect(res.statusCode, res.body).toBe(201);
  WS = res.json<{ workspaceId: string }>().workspaceId;

  // The peer joins as a member through the door.
  const grant = await post(WS, { kind: 'membership', id: membershipId(WS, peerId) }, 'membership.granted', { userId: peerId, role: 'member' }, ownerId, ownerToken);
  expect(grant.status, JSON.stringify(grant)).toBe('committed');

  PRJ = newUlid();
  expect((await post(WS, { kind: 'project', id: PRJ }, 'project.created', { name: 'P' }, ownerId, ownerToken)).status).toBe('committed');
  for (const uid of [ownerId, peerId]) {
    expect((await post(WS, { kind: 'project', id: PRJ }, 'project.member_added', { userId: uid, projectAdmin: uid === ownerId }, ownerId, ownerToken)).status).toBe('committed');
  }
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('exec6 probe: cross-site WebSocket hijacking on /v1/stream', () => {
  it('records whether a cookie + foreign Origin handshake is accepted and served', async () => {
    const out: string[] = [];
    // 1. A COOKIE session for the owner: replay the OTP flow and keep set-cookie.
    const builtOtp = (globalThis as unknown as { __builtOtp: { sent: Array<{ code: string }> } }).__builtOtp;
    const before = builtOtp.sent.length;
    const send = await app.inject({ method: 'POST', url: '/api/auth/phone-number/send-otp', payload: { phoneNumber: '+919000000601' } });
    expect(send.statusCode, send.body).toBeLessThan(300);
    const code = builtOtp.sent[before]!.code;
    const verify = await app.inject({ method: 'POST', url: '/api/auth/phone-number/verify', payload: { phoneNumber: '+919000000601', code } });
    expect(verify.statusCode, verify.body).toBeLessThan(300);
    const setCookie = ([] as string[]).concat(verify.headers['set-cookie'] as string | string[] | undefined ?? []);
    const cookie = setCookie.map((c) => c.split(';')[0]!).filter((c) => c.includes('session_token')).join('; ');
    out.push(`set-cookie names: ${setCookie.map((c) => c.split('=')[0]).join(', ')}; using: ${cookie.replace(/=.*/, '=<redacted>')}`);
    // 2. Control: the cookie alone (no bearer) authenticates an ordinary GET — i.e. it is a real web session.
    const me = await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: { cookie } });
    out.push(`control GET /v1/me/workspaces with cookie only -> ${me.statusCode}`);
    // 3. A ticket so the stream has something to say.
    const T = newUlid();
    expect((await post(WS, { kind: 'ticket', id: T }, 'ticket.created', { typeId: 'task', projectId: PRJ, parentId: null, title: 'VICTIM SECRET TITLE' }, ownerId, ownerToken)).status).toBe('committed');
    // 4. Listen on this lane's port and open the socket with the cookie and a FOREIGN Origin.
    await app.listen({ port: 3061, host: '127.0.0.1' });
    for (const origin of ['https://evil.artsourced.in', 'https://evil.example', undefined]) {
      const headers: Record<string, string> = { cookie };
      if (origin !== undefined) headers['origin'] = origin;
      try {
        const stream = await openStream(3061, headers);
        stream.subscribe(WS, 0);
        const frame = await stream.next((f) => JSON.stringify(f).includes(T) || (f as { type?: string }).type === 'caught-up', 5000);
        const leaked = stream.raw.some((r) => r.includes('VICTIM SECRET TITLE'));
        out.push(`Origin=${origin ?? '(absent)'} -> handshake ACCEPTED; first matching frame type=${(frame as { type?: string }).type}; frames=${stream.frames.length}; victim title present in stream: ${leaked}`);
        await stream.close();
      } catch (err) {
        out.push(`Origin=${origin ?? '(absent)'} -> ${String((err as Error).message).slice(0, 160)}`);
      }
    }
    // 5. Control for the HTTP-Origin hook: the same cookie + foreign Origin on POST /v1/events is refused.
    const forged = await app.inject({ method: 'POST', url: '/v1/events', headers: { cookie, origin: 'https://evil.artsourced.in' }, payload: { events: [] } });
    out.push(`control POST /v1/events with cookie + foreign Origin -> ${forged.statusCode} ${forged.body.slice(0, 80)}`);
    console.log('PROBE\n' + out.map((l) => '  ' + l).join('\n'));
    expect(true).toBe(true);
  });
});
```

### Appendix N — probe for E6-16 — an MCP token approving its successor

File path in the tree: `apps/server/test/zz-exec6-probe-mcp-succ.test.ts`; run from `apps/server`:

```
rtk proxy pnpm exec vitest run test/zz-exec6-probe-mcp-succ.test.ts --no-file-parallelism
```
Same prerequisites as Appendix A. (`ownerToken` here is the better-auth bearer token `signInWithPhone` returns —
a real session, the documented approval path; `t1.token` is the MCP token the device flow issued.)

```ts
// EXEC6 REVIEW PROBE — NOT A PRODUCT TEST. Deleted after the run; never committed.
// Question: can an MCP token approve a NEW device code (mint a successor token), and does the successor survive the original's revocation?
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { membershipId, newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import { buildTestApp } from './helpers/app.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { signInWithPhone } from './helpers/session.js';

let db: TestDatabase;
let app: FastifyInstance;
let ownerToken = '';
let ownerId = '';
let peerToken = '';
let peerId = '';
let WS = '';
let PRJ = '';
let LIVE = '';
let DELETED = '';

function auth(token: string) {
  return { authorization: `Bearer ${token}` };
}

async function post(
  workspaceId: string,
  entity: { kind: string; id: string },
  type: string,
  payload: unknown,
  actorId: string,
  token: string,
): Promise<{ status: string; rule?: string; reason?: string }> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: auth(token),
    payload: {
      events: [
        {
          id: newUlid(),
          workspaceId,
          entity,
          type,
          version: 1,
          payload,
          actorId,
          origin: 'web',
          clientTime: new Date().toISOString(),
        },
      ],
    },
  });
  const results = res.json<{ results: Array<{ status: string; rule?: string; reason?: string }> }>().results;
  return results[0]!;
}

function doc(text: string) {
  return { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] };
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  await app.ready();
  const owner = await signInWithPhone(app, built.otp, '+919000000601');
  ownerToken = owner.token;
  ownerId = owner.userId;
  const peer = await signInWithPhone(app, built.otp, '+919000000602');
  peerToken = peer.token;
  peerId = peer.userId;

  const res = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: auth(ownerToken),
    payload: { name: 'Exec6 probe' },
  });
  expect(res.statusCode, res.body).toBe(201);
  WS = res.json<{ workspaceId: string }>().workspaceId;

  // The peer joins as a member through the door.
  const grant = await post(WS, { kind: 'membership', id: membershipId(WS, peerId) }, 'membership.granted', { userId: peerId, role: 'member' }, ownerId, ownerToken);
  expect(grant.status, JSON.stringify(grant)).toBe('committed');

  PRJ = newUlid();
  expect((await post(WS, { kind: 'project', id: PRJ }, 'project.created', { name: 'P' }, ownerId, ownerToken)).status).toBe('committed');
  for (const uid of [ownerId, peerId]) {
    expect((await post(WS, { kind: 'project', id: PRJ }, 'project.member_added', { userId: uid, projectAdmin: uid === ownerId }, ownerId, ownerToken)).status).toBe('committed');
  }
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

async function mint(bearerForApprove: string): Promise<{ token: string; userCode: string }> {
  const code = await app.inject({ method: 'POST', url: '/v1/mcp/device/code', payload: {} });
  expect(code.statusCode, code.body).toBe(200);
  const { deviceCode, userCode } = code.json<{ deviceCode: string; userCode: string }>();
  const approve = await app.inject({ method: 'POST', url: '/v1/mcp/device/approve', headers: { authorization: `Bearer ${bearerForApprove}` }, payload: { userCode } });
  if (approve.statusCode !== 200) throw new Error(`approve -> ${approve.statusCode} ${approve.body}`);
  const poll = await app.inject({ method: 'POST', url: '/v1/mcp/device/token', payload: { deviceCode } });
  expect(poll.statusCode, poll.body).toBe(200);
  const body = poll.json<{ status: string; token?: string }>();
  if (body.status !== 'issued' || body.token === undefined) throw new Error(`token -> ${poll.body}`);
  return { token: body.token, userCode };
}

describe('exec6 probe: an MCP token approving a successor', () => {
  it('records whether the successor outlives the original', async () => {
    const out: string[] = [];
    // T1: approved by the owner's real session (the documented path).
    const t1 = await mint(ownerToken);
    out.push(`T1 minted by the owner's session; GET /v1/me/workspaces with Bearer T1 -> ${(await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: { authorization: `Bearer ${t1.token}` } })).statusCode}`);
    // T2: approved by T1 — an MCP token approving a new device code.
    let t2: { token: string } | null = null;
    try { t2 = await mint(t1.token); out.push(`T2 minted with the APPROVE step authenticated by Bearer T1 (an MCP token) -> issued`); }
    catch (e) { out.push(`T2 mint via Bearer T1 -> ${(e as Error).message}`); }
    // Also: what else can T1 do? mint an admin invite; list and revoke tokens.
    const inv = await app.inject({ method: 'POST', url: `/v1/workspaces/${WS}/invites`, headers: { authorization: `Bearer ${t1.token}` }, payload: { address: 'x@example.com', channel: 'email', role: 'admin' } });
    out.push(`Bearer T1: POST mint ADMIN invite -> ${inv.statusCode}`);
    const list = await app.inject({ method: 'GET', url: '/v1/me/mcp-tokens', headers: { authorization: `Bearer ${t1.token}` } });
    const tokens = list.json<{ tokens: Array<{ id: string; createdAt: string }> }>().tokens;
    out.push(`Bearer T1: GET /v1/me/mcp-tokens -> ${list.statusCode}, ${tokens.length} token(s) listed`);
    // Revoke T1 through the owner's session (the product's "revoke" path), then test both tokens.
    const t1Row = tokens.sort((a, b) => a.createdAt < b.createdAt ? -1 : 1)[0]!;
    const rev = await app.inject({ method: 'DELETE', url: `/v1/me/mcp-tokens/${t1Row.id}`, headers: auth(ownerToken) });
    out.push(`owner revokes the first-listed token (${t1Row.id.slice(0, 8)}…) -> ${rev.statusCode}`);
    const afterT1 = (await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: { authorization: `Bearer ${t1.token}` } })).statusCode;
    const afterT2 = t2 === null ? 'n/a' : (await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: { authorization: `Bearer ${t2.token}` } })).statusCode;
    out.push(`after revocation: Bearer T1 -> ${afterT1}; Bearer T2 (the successor) -> ${afterT2}`);
    const left = await app.inject({ method: 'GET', url: '/v1/me/mcp-tokens', headers: auth(ownerToken) });
    out.push(`owner's token list now: ${left.json<{ tokens: unknown[] }>().tokens.length} token(s)`);
    console.log('PROBE\n' + out.map((l) => '  ' + l).join('\n'));
    expect(true).toBe(true);
  });
});
```
