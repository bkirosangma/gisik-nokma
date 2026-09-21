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
ticket id the ledger has never seen, which is the *"existence claim with no evidence"* shape the brief names — a
plain `refused` there would let the outbox keep the row `failed` and visible instead of minting a false contest.
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

**MEASUREMENT.** `ls apps/server/migrations`; `git log --diff-filter=A --format=%cI -- <file>` per file; the
`Date.now()` comparison above (time-bound — it reads `false` after 14:13:20Z on 2026-09-21); the dev-DB read in
Appendix E. Lines opened: `check-migration-order.mjs:1-45`; `apps/server/package.json:11`; the three plan lines.

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
