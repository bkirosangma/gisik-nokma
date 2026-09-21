# Refutations — executor 3 (functionality lane), round 2 phase 2

**Lane relaunched on Opus 5 at the phase-1 boundary, 2026-09-21 15:05:23 IST** (the owner closed phase 1 early; the
DeepSeek backend that wrote rounds 1 and 2 is exhausted). **Phase 2 for this lane closes 17:05:23 IST.** The report
`docs/lanes/review-functionality-exec3.md` is frozen at `f8b5e929` (14:57:35 IST) as the phase-1 submission; nothing
below is a new finding, and the report's findings are not edited — defences are appended under them as dated
paragraphs, per the brief.

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

_None yet — see the stamp at the foot of this file for the state at the last push._

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

**Fifteen attacks, fifteen findings standing.** Two of the fifteen changed my report (E6-6, E6-11) and one (E6-21)
became the load-bearing measurement of my own Critical's defence.

## Defences

Defences are written in `review-functionality-exec3.md` — a dated *DEFENCE* paragraph under `E3-14` (§14.7.1,
15:14 IST) and §67 (15:20 IST) for the rest — and indexed here:

| finding(s) | the attack answered | where |
|---|---|---|
| `E3-14` (Critical claimed) | two of five routes are recorded exclusions (`http-origin.ts:128-146`) — exec 6's row | §14.7.1 *DEFENCE*: the exclusion engaged; its warrant *"a workspace they can leave"* measured false at `check-permission.ts:641-643` + the 21-line sweep; the Critical rests on the unrecorded `/v1/me/invitations/…` pair (`grep -c invitations http-origin.ts` → 0; added 2026-09-09, three days after the docblock); the frozen text's silence on the docblock recorded as a correction |
| `E3-1`, `E3-9`–`E3-13`, `E3-16`, `E3-17`, `E3-20`–`E3-31` | "a stale sentence is not a defect" | §67.2: owner's brief §5 and role brief; workspace rule; `exec3-F1 · ACCEPTED` at `review-compiled-controller.md:548`; exec 6 files the class (E6-7/12/14/25) and reproduced E3-20/21/25/26/27 |
| `E3-18` | the remedy sub-claim is doubtful | §67.3: already Minor (§34); the remedy is not the finding; both lines re-opened |
| `E3-8` | weakest by its own account | §67.4: Low, measurement reproduces, not withdrawn |
| §7.3 / §2 / §7.5 (not findings) | exec 6 §9 candidates | §67.5 |

## Phase-2 findings (half points, rules §2)

| id | claimed | what | where |
|---|---|---|---|
| `E3-30` | Important | case 6.83 ❌ asks for a measurement that has existed since 2026-09-02 under its own number (`ticket-cards.test.ts:507` *"MEASURES case 6.83"*, case 7.78 ✅, `rollup.ts:82-85`) | report §65 |
| `E3-31` | Minor | case 6.57 ❌ conditions on a cross-project reparent that `hierarchy.ts:274` refused on 2026-08-31, and no `ticket.*` payload but `created` carries a `projectId` | report §66 |

Both were produced by **correction 8** (report §64): §30.1's "fully enumerated" table classified 18 of its twenty
lines and said 6 where it listed 7; the two never-read lines are these.

**Stamp:** 15:22 IST; report at `8f422764`+; branch heads as listed above (exec 6 re-fetched 15:19: `23d4ab8d`, R6-1…R6-3 all against UX lanes, defence notes for E6-10/17/19/20/21 added).
