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

_(written last)_

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

### 2.1 Graph and semantic-search usage

### 2.2 Reached

### 2.3 Not reached — named rather than implied

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
(who may delete — project admin; what happens — hidden from views, history kept; how to undo — `Restore`), rewrite
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

**This is not a ruled divergence.** I searched for a ruling: `visible-where.ts:173-178` explains why the *engine
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
restore it, close it, and delete it again.

The same reader is what `hierarchy.ts:123` (`getTicketState(ctx, p.parentId)`) and `:249` (`newParentId`) resolve
a parent through, so a **live** child is placed under a parent that *"stops appearing in views"*. The read side
already had to invent an answer for this (`routes/tickets.ts:419-431`: a deleted parent answers `restricted`,
*"there is a parent here whose name you do not get"*), which is an honest answer for a child that was orphaned by
its parent's deletion and a strange one for a child the actor just created there.

**Not a ruled divergence.** The recorded reason for the unfiltered reader is `ticket.restored`
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

### E6-5 — IMPORTANT — After a transient sync failure, a later claim overtakes the backing-off claim it depends on; the server refuses it `ticket.unknown`, and that refusal is terminal — an offline edit is lost to a network blip

**WHAT.** `packages/sync-client/src/outbox/outbox.ts:333` selects the next batch as
`WHERE status = 'queued' AND next_attempt_at <= ? ORDER BY position LIMIT ?`. `recordFailure` (transient — a
transport throw, a short answer, a misaligned answer; `sync-engine.ts:870`, `:897`, `:907`) pushes `next_attempt_at` of the
**failed batch** out by `backoffMs(attempts)` (2 s on the first failure). A claim enqueued *after* the failure
carries the schema's epoch default and is due immediately. So the next flush — and the product flushes on every
enqueue, `replica-data-source.ts:1405` `void engine.flush()` — offers the newer claim **alone**, ahead of the
older claims it depends on. Measured on the outbox with its own fixtures (Appendix D; 1 file / 1 test passed):

```
PROBE batch1 (t0)        = [CREATE, RENAME-1]        ← transient failure recorded on this batch
PROBE batch2 (t0+500ms)  = [RENAME-2]                ← offered to the server BEFORE the ticket.created it depends on
PROBE batch3 (t0+2.5s)   = [CREATE, RENAME-1, RENAME-2]
```

The server answers a `ticket.field_set` on a ticket it has never been told about with `ticket.unknown`
(`rule-engine/src/checks/fields.ts:116`), and the outbox treats a refusal as **terminal**: `outbox.ts:412`
`UPDATE outbox SET status = 'failed'` — pinned as intended by case 12.147 (*"a refused answer is TERMINAL: the row
is visibly failed and no longer offered"*). The pending overlay folds only `queued` rows
(`precheck/local-context.ts:126`), so the user's second rename **disappears from their own screen**, marked
failed with a reason (*"no such ticket is known"*) about a ticket they are looking at, while the create and the
first rename land two seconds later.

**WHY it is wrong.** The product states the property and then breaks it at the one boundary that matters. Case
12.144 (`12-offline-sync-apps.md:905-907`): *"enqueue order is preserved … because a batch that lost the order
would send a `field_set` for a ticket the server has not been told about."* `sync-engine.ts:845`: *"one drain at
a time, so order holds."* `replica-data-source.ts:1404`: *"the outbox already owns ordering and retry."* All three
are true **within one due set** and false across a backoff boundary — 12.144 tests only a fully-due queue, 12.148
(`outbox.test.ts:226`, *"backs off, holds the batch"*) tests only that the failed batch is held, and no case
enqueues **after** a failure. The realistic path is ordinary: work offline, connectivity returns flaky, the
first push throws, the user keeps editing the ticket they can see, the next push carries only the new edit.

**WHAT WOULD HAVE BEEN BETTER.** Head-of-line blocking is what "a queue preserves order" means for a dependent
stream: `nextBatch` should return nothing while the earliest queued row is not yet due — i.e. `WHERE status =
'queued' ORDER BY position LIMIT ?` and then check the head's `next_attempt_at` (or `MIN(next_attempt_at)` over
queued rows) against `now`. Alternatively, treat `ticket.unknown` / `hierarchy.unknown-parent` on a claim whose
target is itself queued as transient rather than terminal. And 12.144 should enqueue after a `recordFailure` and
assert the batch is empty until the head is due.

**MEASUREMENT.** Appendix D, run from `packages/sync-client` (`pnpm exec vitest run
test/zz-exec6-probe-overtake.test.ts --no-file-parallelism`; imports `../src/*.js` relatively). Lines opened:
`outbox.ts:333`, `:412`; `sync-engine.ts:845`, `:870`, `:897`, `:907`; `replica-data-source.ts:1404-1405`;
`local-context.ts:126`; `fields.ts:116`; `outbox.test.ts:119`, `:201`, `:226`; `12-offline-sync-apps.md:905-907`.

**SEVERITY: Important.** A user's edit reverts on their own screen with a nonsensical reason after a transient
network error, on the headline offline path. Not filed as Critical because the claim is retained in
`failedItems` with its error and can be redone by a user who notices.

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

---

## 5. POSITIVE FINDINGS — claims I tried to falsify and could not

---

## 6. THE NINE EDGE CLASSES — walked per surface

---

## 7. THE PROTOTYPE, CLASSIFIED

---

## 8. COUNT OF FINDINGS BY SEVERITY — members named

---

## 9. NOTES FOR PHASE 2 (refutation candidates, not filed here)
