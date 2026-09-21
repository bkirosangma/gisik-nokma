# Refutations — executor 3 (functionality lane), round 2 phase 2

**Lane relaunched on Opus 5 at the phase-1 boundary, 2026-09-21 15:05:23 IST** (the owner closed phase 1 early; the
DeepSeek backend that wrote rounds 1 and 2 is exhausted). **Phase 2 for this lane closes 17:05:23 IST; the opponent's
file states its own phase 2 closes 18:41:50 IST** (`review-refutations-exec6.md`, first paragraph) and that its
refutations section *"is finalised then"*. **So a refutation of this lane pushed after 17:05:23 is unanswered because
the clock closed, not because it stands** — the defences below were written pre-emptively against the attacks the
opponent had published by 15:40, and the judge is asked to read a late refutation against them. The report
`docs/lanes/review-functionality-exec3.md` is frozen at `f8b5e929` (14:57:35 IST) as the phase-1 submission; its findings are not edited — defences are appended under them as dated paragraphs, per
the brief — and the four findings filed in phase 2 (`E3-30`–`E3-33`, half points) live in the report's §65–§69 and are
only indexed here.

Refutation ids are `R3-<n> → E<lane>-<m>`. Each names the target and the falsifying measurement with the line
opened. A rejected refutation costs this lane the finding's points, so nothing is filed on suspicion.

**Correction to the frozen report, dated 15:15 IST:** `review-functionality-exec3.md` §58.4 says *"… which is why
`docs/lanes/review-refutations-exec3.md` does not exist."* This file's existence falsifies that sentence; the reason
it gave (ten attacks, none falsifiable) is unchanged and is the reason §"Reconnaissance" below is a table and not a
list of filings.

## Branches read at 15:12 IST

`origin/exec6/review-functionality` at `a647510b` (15:11) — report `review-functionality-exec6.md` (6,290 lines,
headings and E6-10, E6-16, E6-17, E6-19, E6-20, E6-21, E6-24 read in full) and `review-refutations-exec6.md`
(read in full: its "candidates examined and NOT refuted" table names E3-14, E3-18, E3-19, E3-20/21, E3-25, E3-26,
E3-27; its filed refutations as of `a647510b` are R6-1 → E5-21 and R6-2 → E2-42, neither against this lane) ·
`origin/exec4/review-ui` at `674decb2` (15:07) · `origin/exec5/review-ux` at `78eff09c` (15:08) ·
`origin/exec1/review-ui-r2` at `a07a7fc2` (15:07) · `origin/exec2/review-ux-r2` at `778a6439` (14:57).

## Refutations filed

**None.** Fourteen attacks across two sessions (ten in phase 1, four here: E6-16, E6-21, E6-17, E6-14) and three
more findings examined without an attack (E6-15, E6-10, E6-24) produced no falsifying measurement; the
closest — E6-14's headline interval — is measured against the domain's clock rather than the wire's, and the
finding's second clause holds regardless. A rejected refutation costs the target's points, and no target below is
worth that on the evidence in hand. The table is the work.

## Reconnaissance — findings attacked and NOT refuted, with the measurement, so the judge can see the work

Ten attacks were made in phase 1 and recorded in the report (§23: E6-1, E6-2, E6-5, E4-1/E5-3; §36 E6-8; §38 E6-9;
§39 E6-11; §40 E6-3; §41 E5-6; §14.4 E6-6 — which corrected a false claim of mine). Five more this session:

| target | what I measured this session | outcome |
|---|---|---|
| **E6-16** (Important — an MCP token can approve a device code) | `auth/require-session.ts:82-101` opened: better-auth first, then `resolveMcpToken` on any `Bearer` — one `requireSession` for both credentials; `routes/mcp-device.ts:82-85` opened: `POST /v1/mcp/device/approve` registers `preHandler: requireSession` and nothing narrower | **holds** — the approve door cannot tell a token from a person |
| **E6-21** (Important — a member or guest cannot leave) | `permissions/check-permission.ts:641-643` opened: `membership.revoked` refuses `!isWorkspaceAdmin`, no self arm; sweep `grep -rniE 'leav(e|ing) (a|the|this|their|any) workspace|self-revok|revoke (their|your) own|leave workspace|un-member'` over `docs Features.md test-cases packages apps/server` → 21 lines / 12 files, every one a "leave the workspace <in some state>" sentence, the navigation sense, or an "un-membered acceptor" — no leave door, no ruling deferring one | **holds** — and it is the measurement my own E3-14 defence rests on, so I could not refute it without refuting myself |
| **E6-17** (Minor — any string is an assignee) | ruling search: `assign(ee|ed|ment)` within 80 chars of `non-member|not a member|outside the workspace|any string|stranger` over `docs Features.md test-cases packages/domain packages/rule-engine apps/server` → 0; the wider `assignee` × `member|roster|exist|valid|person` sweep over plans and docs → nothing about admitting a non-member | **holds as category 3** — no ruling to set against it |
| **E6-15** (Important — cross-site WebSocket hijacking on `/v1/stream`) | `auth/auth.ts:271` `sameSite: 'lax'`; `http-origin.ts:180-181` and `routes/events.ts:53-67`: the product's own record that Lax does not separate same-site siblings of one registrable domain | **not attacked** — the only line of attack ("Lax closes it") is the one the product's record refutes and the one my E3-14 also stands on; E6-15 is its read-side complement, as exec 6 says |
| **E6-10**, **E6-24** (Important — half-migrated type; replica reads serve a deleted ticket) | read in full; both rest on appendix probes with printed before/after rows and positive controls; E6-24's premise (only `getTickets`/`getBoard` filter) is what my own F5/E3-5 measured at `:996`/`:1029` | **not attacked** — no cheaper falsification than re-running their probes, and my F5 is their premise |
| **E6-14** (Minor — the delete toast's "no ticket key" reason *"stopped being true thirteen minutes before it was written"*) | `git log -1 --format=%ci ac18f2bc` → `2026-09-20 13:04:40`; `18d7e391` → `13:17:51` (13 min 11 s — the headline's interval reproduces). But what `ac18f2bc` shipped is the **composition function and its test** (`git show --stat`: `packages/domain/src/prefix.ts` with `export function ticketKey(…)` at `:177` of that revision (`:248` today), `apps/server/src/read/ticket-numbers.ts`, `apps/server/test/read/ticket-key.test.ts`; **no route**); the served `key` field on the detail read arrived with `git log -S'ticketKey(' -- apps/server/src/routes/tickets.ts` → **`277b5d22`, 2026-09-20 23:07:56** — ten hours **after** the docblock, not thirteen minutes before it. So at 13:17 the sheet had no key on any wire; the domain had a function. | **not filed.** The finding's second clause — *"the same file now reads the key"*, `ticket-sheet.tsx:1588` `ticketRead.key ?? ticketRead.title`, opened — is true today and carries the Minor on its own; a refutation of the headline's timing alone would be rejected on that clause and cost the point. Recorded so the judge can price the headline's interval at what it is: the domain's clock, not the wire's. |

**Fourteen attacks and three examinations, seventeen findings standing.** Two of them changed my report (E6-6, E6-11), one (E6-21)
became the load-bearing measurement of my own Critical's defence, and one (E6-14) has a headline interval measured
against the wrong artifact and a second clause that holds regardless.

## Coverage extended in phase 2 — a named gap from §58.4 reached (15:33 IST)

§58.4 named *"the ❌ set outside my concern's own file"* as unreached. Reached this session with one instrument,
stated with its sample size: **26 files under `test-cases/` carry 111 lines containing ❌, of which 56 are
first-marker ❌ case lines** (`- **N.M** ❌` / `- N.M ❌`; a table-row spelling → 0, a heading spelling → 1 narrative
line). For each of the 56, `grep -rlE 'case <id>\b|\b<id>\b'` over the server, rule-engine, domain, app-core,
sync-client and mcp-server `test/` and `src/` trees — the `E3-23` detector: a ❌ whose number a test or source file
speaks. **15 hit**, 13 of them in file 06 (all twenty of whose ❌ lines were read in §30.1/§64 — the two that were
not, `6.57` and `6.83`, are `E3-31` and `E3-30`) and **2 outside it**, both read in full and both honestly ❌:
`7.244` (`07-api-realtime-search.md:500`, *"the round trip structurally unreachable"* — the line explains its own
unwitnessability) and `7.252` (`:526`, *"a STRUCTURAL exposure and not a live defect … Owner: whoever next touches"*).
`6.53` (`:95`), named by two workspace tests, was read too: `workspace-bootstrap-failure.test.ts:209` *"the reason
6.53 stays open: the residue is still there afterwards"* — live. **So the instrument's positive rate outside file 06
is 0 of 2**, and the 41 first-marker ❌ lines that no test or source names remain unread; they are the honest
boundary of this pass, not a claim of cleanliness.

## Defences

Defences are written in `review-functionality-exec3.md` — a dated *DEFENCE* paragraph under `E3-14` (§14.7.1,
15:14 IST) and §67 (15:20 IST) for the rest — and indexed here:

| finding(s) | the attack answered | where |
|---|---|---|
| `E3-14` (Critical claimed) | two of five routes are recorded exclusions (`http-origin.ts:128-146`) — exec 6's row | §14.7.1 *DEFENCE*: the exclusion engaged; its warrant *"a workspace they can leave"* measured false at `check-permission.ts:641-643` + the 21-line sweep; the Critical rests on the unrecorded `/v1/me/invitations/…` pair (`grep -c invitations http-origin.ts` → 0; added 2026-09-09, three days after the docblock); the frozen text's silence on the docblock recorded as a correction |
| `E3-1`, `E3-9`–`E3-13`, `E3-16`, `E3-17`, `E3-20`–`E3-31` | "a stale sentence is not a defect" | §67.2: owner's brief §5 and role brief; workspace rule; `exec3-F1 · ACCEPTED` at `review-compiled-controller.md:548`; exec 6 files the class (E6-7/12/14/25) and reproduced E3-20/21/25/26/27 |
| `E3-15` (Important claimed) | "its docblock records the guard's shape — category 2" | §14.7.2 *DEFENCE*: the docblock promises independence (*"only comparing it against something independent can. So the comparison is here, in code"*) and 13.116 ✅ promises the property; `:256-259` compares the set against the suite's own table; a promise is not a ruling |
| `E3-18` | the remedy sub-claim is doubtful | §67.3: already Minor (§34); the remedy is not the finding; both lines re-opened |
| `E3-8` | weakest by its own account | §67.4: Low, measurement reproduces, not withdrawn |
| §7.3 / §2 / §7.5 (not findings) | exec 6 §9 candidates | §67.5 |

## Phase-2 findings (half points, rules §2)

| id | claimed | what | where |
|---|---|---|---|
| `E3-30` | Important | case 6.83 ❌ asks for a measurement that has existed since 2026-09-02 under its own number (`ticket-cards.test.ts:507` *"MEASURES case 6.83"*, case 7.78 ✅, `rollup.ts:82-85`) | report §65 |
| `E3-31` | Minor | case 6.57 ❌ conditions on a cross-project reparent that `hierarchy.ts:274` refused on 2026-08-31, and no `ticket.*` payload but `created` carries a `projectId`; the same premise stands in a test comment and a docblock (addendum) | report §66 |
| `E3-32` | Important | `check-permission.ts:531-533`, the envelope-origin forgery gate's status list: `POST /v1/sync` *"does not exist yet"*, *"NOT CLOSED"* — it exists since `999d4860` (2026-09-04), calls `ingestClientBatch` (`sync-service.ts:370`), and `sync-route.test.ts:346-361` witnesses the gate firing on it; 13 commits to the file after that day, the list unmoved | report §68 |
| `E3-33` | Minor | `proj-projects.ts:29`: *"`proj_ticket_types` does not exist yet"*, position *"immediately after `proj_workflows`"* — `index.ts:73-75` registers ticket-types between them, from 21 minutes after the sentence landed | report §69 |
| `E3-34` | Minor | `projections/tickets.ts:480-499`: *"nothing refuses a `ticket.assigned` … for a ticket that does not exist"*, citing `check-role-permission.test.ts` as committing two such ingests — `canSee` is false for a missing row (`can-see.ts:140-142`, `:227-234`), the gate refuses (`check-permission.ts:1048-1050`), and the cited test's own comment (`:942-948`) says it was rewritten for that reason — 21 minutes before the docblock reached `main` | report §72 |

The first two were produced by **correction 8** (report §64): §30.1's "fully enumerated" table classified 18 of its twenty
lines and said 6 where it listed 7; the two never-read lines are these. The last three came from a source-comment
sweep for forward-looking sentences (report §70), which also found the 6.57/6.58/6.84 premises standing in ten source
comments — recorded as the trio's width, not filed.

**Stamp:** 15:46 IST — submitted state. Every lane's refutations file re-read at 15:46 (`exec6` `e60ede40` 15:45, `exec5` `d3234320`, `exec4` `872758a3`, `exec1` `39924834`, `exec2` `25d5ce81`): no refutation names an E3 finding; exec 6 adopted this lane's E6-14 interval measurement as a correction to its own headline (`a53a6929`). A watcher polls the five files until 16:50; anything that lands after 17:05:23 is answered by §67 or not at all (see the header).
**Heartbeat 16:04 IST:** all five lanes' refutations files re-scanned (`exec6` `b5f31b26` 15:54 "nothing against this lane", `exec5` `bb71b215`, `exec4` `0fdd9382`, `exec1` `b11a212b`, `exec2` `dad35a8b`) — no refutation names an E3 finding. `E3-28` re-measured at HEAD (`Features.md:2054` → `getTickets` ×2, `getTicket` 0; `replica-data-source.ts:574-576` three doors incl. `getTicket`) — holds.
**Heartbeat 16:13 IST:** five lanes re-scanned (`exec6` `0ba581d4` 16:05, `exec5` `9be964e9`, `exec4` `0fdd9382`, `exec1` `076155ab`, `exec2` `138990fc`) — no refutation names an E3 finding.
**Heartbeat 16:22 IST:** five lanes re-scanned (`exec6` `e0cac297` 16:20, `exec5` `fee03f0e`, `exec4` `0fdd9382`, `exec1` `b128286d`, `exec2` `ce513982`) — no refutation names an E3 finding.
**Heartbeat 16:31 IST:** five lanes re-scanned (`exec6` `e0cac297` 16:20, `exec5` `fee03f0e`, `exec4` `0fdd9382`, `exec1` `b128286d`, `exec2` `4f2793d3`) — no refutation names an E3 finding.
**Heartbeat 16:40 IST:** five lanes re-scanned (`exec6` `b32c796e` 16:36, `exec5` `2daa4007`, `exec4` `0fdd9382`, `exec1` `082734fa`, `exec2` `a189be67`) — no refutation names an E3 finding.
**Heartbeat 16:48 IST:** five lanes re-scanned (`exec6` `b32c796e` 16:36, `exec5` `81cc041c`, `exec4` `fe35c41b`, `exec1` `082734fa`, `exec2` `471a657c`) — no refutation names an E3 finding.

## CLOSING STATE — 16:57 IST, ahead of this lane's 17:05:23 boundary

| | |
|---|---|
| report | `docs/lanes/review-functionality-exec3.md` — phase-1 text frozen at `f8b5e929`; phase-2 insertions: *DEFENCE* under `E3-14` (§14.7.1) and `E3-15` (§14.7.2); §64–§72 appended |
| findings | round 1 `E3-1`–`E3-8` (8, none withdrawn) · round 2 `E3-9`–`E3-29` (21) · phase 2 `E3-30`–`E3-34` (5, half points: 2 Important, 3 Minor) — ids contiguous, no gaps |
| refutations filed | **0** — fourteen attacks and three examinations, all recorded above with the line opened; exec 6 adopted the E6-14 interval measurement as a correction (`a53a6929`) |
| refutations received | **0** — final scan 16:57 of every lane's `review-refutations-exec*.md` (`exec6` `c14c8a05` 16:52 *"nothing against this lane"*, `exec5` `81cc041c`, `exec4` `fe35c41b`, `exec1` `0d8217c1`, `exec2` `84ce91d6`): zero `→ E3-` headings |
| corrections to this report in phase 2 | 2 (§64; the `E3-14` defence's own admission) |
| what a late refutation meets | §14.7.1, §14.7.2, §67 — written pre-emptively; the opponent's file states its phase 2 runs to 18:41:50, so anything pushed after 17:05:23 is unanswered by the clock, not conceded |

Everything on this branch was pushed at or before this stamp; nothing is held in the worktree.
