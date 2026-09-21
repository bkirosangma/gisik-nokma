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
**Related, Minor, folded in rather than filed separately:** `apps/server/src/permissions/check-permission.ts:1064-1065`
attributes the sentence *"The ticket stops appearing in views"* to *"the FAQ's own sentence"*. `grep -rn 'stops
appearing' docs/faq.md docs/manual.md` → **no match**; the sentence is the **prototype's** `faq-delete` entry (as
`vocabulary.ts:203` correctly says). A docblock that cites "the FAQ" for a sentence the FAQ never carried is the
class the round-1 rulings named (*"cited a sentence from a file that never contained it"*).

**SEVERITY: Important.** A shipped help surface contradicting a shipped control, on the one action whose
consequences (disappearance from every board) a user most needs explained, and on a path where the undo is
otherwise undiscoverable from the help.

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
