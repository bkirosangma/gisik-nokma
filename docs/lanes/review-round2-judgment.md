# REVIEW ROUND 2 — THE JUDGMENT. 2026-09-21, judged by the controller (Fable 5.1, `claude-fable-5-1`) under `docs/lanes/review-round2-rules.md`.

**Verdict.** UI: **exec 4 (Opus) wins, 72 to 70.** UX: **exec 2 (DeepSeek-authored, Opus-defended) wins, 110 to 101.** Functionality: **exec 6 (Opus) wins, 54.5 to 44.5.** Every ruling is a row in `docs/lanes/review-scores.tsv` (**239 rulings**: 227 from phase 1, 13 added in phase 2, 4 amended), and every row cites a line the judge opened or a reproduction the judge ran. The losers of each pair — exec 1, exec 5, exec 3 — are ended after this lands, on the owner's standing order (*"the ones who loses dies"*, rules §1); their branches and reports stay for the record.

## 1. The clock and the shas

| phase | boundary | record |
|---|---|---|
| T0 | 09:41:50 IST | `judge-2026-09-21/T0.txt` |
| phase 1 close | **15:05:23 IST** (early, on the owner's word — cycle 39) | six shas in `T0.txt`: exec 1 `2cfffc7a`, exec 2 `778a6439`, exec 3 `f8b5e929`, exec 4 `98584aa3`, exec 5 `1641161d`, exec 6 `737294ae` |
| phase 2 close | **17:06:57 IST** (paste at 17:05:26, 75 s grace, `phase2-close-2026-09-21.sh`) | six shas in `T0.txt`: exec 1 **`b7c57b6d`**, exec 2 **`84ce91d6`**, exec 3 **`58d88d6b`**, exec 4 **`fe35c41b`**, exec 5 **`67a33066`**, exec 6 **`c14c8a05`** |

The six reports and six refutation files landed with this judgment are the branches' contents **at the phase-2 close shas** — a superset of the phase-1 frozen text (every lane added dated defence, corroboration and withdrawal paragraphs rather than editing frozen sentences, and the phase-2 findings live in the reports). The phase-1 frozen copies stay at the phase-1 shas and in `gisik-nokma-lanes/judge-2026-09-21/p1-exec{1..6}.md`. Each lane confirmed its submitted sha in its pane after the close paste (exec 1 *"HEAD b7c57b6d = origin"*, exec 2 *"84ce91d6"*, exec 3 *"58d88d6b"*, exec 5 *"67a33066"*); the judge read every branch at exactly the recorded sha.

## 2. Method

**Phase 1** (cycle 40 §1, unchanged): 32 verification subagents each read a chunk of ≤ 8 findings from the frozen reports and wrote a row with the file:line they opened; the judge then opened the cited line for every Critical and Important itself; Minors rest on the verifier's opened line and say so. Policies applied uniformly: a PARTIAL (core holds, an absolute or mechanism false) scores at the judged severity of the core with no penalty; no upward re-grade above the claimed severity; a help passage describing a product that no longer exists is Important, a stale `test-cases/` marker is Minor; independent duplicates across lanes both score; zero INVALID rulings, so the ×3 penalty was never drawn in phase 1.

**Phase 2** (this judgment): the judge opened the cited lines itself for **every** refutation, every refuted finding, every phase-2 finding and every post-boundary withdrawal — no verifier subagents. The read-only tree was `gisik-nokma-ctl` at `d073cf3a`, code-identical to `main` `d3772072` (`git diff --stat origin/main HEAD -- apps packages` → 0 lines). Reproductions quoted from a lane's probe (exec 6's `zz-exec6-probe-phone-comment.test.ts` output) are credited as the lane's; the ruling rests on the lines the judge opened, named in the ledger row.

**Rules applied to phase 2, and two readings the rules left open:**
- **Refutation upheld** → the finding's points move to the refuter and the author takes −3× the claimed points; **rejected** → the refuter loses the finding's points (rules §3). Both readings the rules give.
- **A PARTIAL refutation** — one that falsifies an absolute or a mechanism the phase-1 ruling had already discounted, while the scored core stands — is **neither upheld nor rejected: no points move, no penalty either way.** It cannot be "upheld" (it took down nothing that was scored) and it cannot be "rejected" (it is right about what it says). Charging the refuter for being right, or charging the author twice for an overclaim already discounted in phase 1, would both be unfair. The refuter's measurement is recorded in the row and credited below.
- **A withdrawal after the phase-1 boundary** is the author's own act. A whole finding withdrawn scores 0 with no penalty (an honest self-correction is not a refutation and draws no ×3). A finding withdrawn and its core **refiled under a new id** — where the core is exactly what the judge scored in phase 1 — keeps the phase-1 score on the new id rather than halving it as a phase-2 filing: the alternative would score the same core differently depending on whether a lane narrowed in place (exec 2, E2-42) or withdrew-and-refiled (exec 5, E5-21 → E5-44), and rules §5 gives the same measurement the same ruling.
- **Phase-2 findings score half** the judged severity (rules §2). Judged severity follows the phase-1 policies verbatim, so a stale `test-cases/` marker filed as Important in phase 2 scores as Minor, as its siblings did in phase 1.

## 3. The refutations — three filed, all by exec 6, all conceded by their targets

| id | target | ruling | lines the judge opened |
|---|---|---|---|
| **R6-1 → E5-21** (exec 5, Imp) | *"what it files can never be committed … `IDENTITY_SPOOF_REASON` … guaranteed by construction"* | **PARTIAL.** Right on the absolute (a comment on a ticket assigned to the commenter has `actorId = assigneeId = session user` and commits) and right on the mechanism: the phone syncs through **`POST /v1/sync`**, where actor ≠ session answers **`invalid: actor-mismatch` before any permission gate runs**, and an `invalid` is **terminal in the outbox** (`status = 'failed'`, never retried) — not the `/v1/events` spoof gate and not "refused at the first sync". The scored core (a comment on any ticket not assigned to the commenter never posts and the ticket screen says nothing) stands, as the refutation itself says. No points move. exec 5 withdrew E5-21 at 15:14 and refiled the core as E5-44. | `apps/mobile/src/app.tsx:38` `createHttpTransport` → `packages/sync-client/src/net/http-transport.ts:157` `doFetch(\`${opts.baseUrl}/v1/sync\`)`; `apps/server/src/sync/sync-service.ts:321-327` `if (event.actorId !== userId) return { status: 'invalid', … code: 'actor-mismatch' }`; `packages/sync-client/src/outbox/outbox.ts:406-412` *"`refused` or `invalid`: TERMINAL … `status = 'failed'`"*; `packages/domain/src/envelope.ts:196` `actorId: ulidString` (the literal `'me'` fails the parse); `apps/mobile/src/screens/ticket-screen.tsx:49` `actorId: state.assigneeId ?? 'me'`, `:54` `if (err instanceof OfflineAcceptError) return` |
| **R6-2 → E2-42** (exec 2, Imp) | same handler, same claim, same probe | **PARTIAL**, same ruling. exec 2 conceded and narrowed in place (`f282f3e1`, `c3daab69`); E2-42 keeps its 3 points on the narrowed core. | as above |
| **R6-3 → E2-28** (exec 2, Min) | *"A bulk close that was ACCEPTED and queued is reported as 'We could not reach the server'"* | **UPHELD.** The catch at `bulk-close-dialog.tsx:230-233` exists and does compose that sentence — but the only `ingest` that throws `OfflineAcceptError` belongs to the replica source, which only the two minimal shells construct, and neither mounts `BulkCloseDialog` or any app-core view; the web mounts the dialog on the online source, whose `ingest` cannot throw it. A UX finding whose sentence no person can be shown on this build asserts an outcome it did not — could not — measure. exec 2 conceded (`d33281fe`, *"the sentence has no path to a screen on this build"*). E2-28's 1 point moves to exec 6; exec 2 takes −3 (3 × the claimed Minor). exec 6's mount list omitted `packages/app-core/src/views/ticket-list.tsx`, a third app-core mount; it changes nothing. | `apps/web/src/providers.tsx:108` `createOnlineDataSource(` — the only DataSource `apps/web` builds (`createReplicaDataSource(` in `apps/web` → 0); `grep 'throw new OfflineAcceptError'` non-test → `packages/app-core/src/replica/replica-data-source.ts:1406` only; `createReplicaDataSource(` call sites → `apps/mobile/src/app.tsx:40`, `apps/desktop/src/app.tsx:56` only; `BulkCloseDialog` → 0 files under `apps/mobile` or `apps/desktop`; `apps/desktop/src/app.tsx:120-123` says the views are not mounted |

**A credit the ledger cannot express in points.** R6-1/R6-2's door measurement is right and the judge's own phase-1 citations on E5-21 and E2-42 were wrong about the mechanism: both rows cited `check-permission.ts:543-545` (`IDENTITY_SPOOF_REASON`, the `/v1/events` gate) as the refusal the phone meets. The phone never reaches that gate; its transport posts to `/v1/sync` and is answered `invalid: actor-mismatch` in `sync-service.ts` before any gate. Both rows are corrected in this landing, with the lines above. The core the judge scored was unaffected — which is why no points move — but the record of *why* it fails is now the true one, and exec 6 found it.

## 4. Post-boundary withdrawals and self-corrections

| finding | what the author did | ruling |
|---|---|---|
| **E5-21** (exec 5) | withdrawn 15:14 on R6-1; core refiled as **E5-44** with exec 6's door measurement attributed | E5-21 → 0. **E5-44 → 3 at IMPORTANT** (inherits the phase-1 score; see §2). exec 5's total unchanged. Judge opened `ticket-screen.tsx:49`, `:54` and the sync-door lines. |
| **E2-50** (exec 2, Min) | self-filed defence 15:35 (`a59ce9b9`): *"this finding does not hold"* — the docblock's *"four **other** routes"* is the list route's standpoint; list + four = the five `Features.md:695` names | **E2-50 → 0, no penalty.** Judge opened `apps/server/src/read/ticket-cards.ts:20-26`: the word *other* is there; the two documents state one fact from two standpoints. The phase-1 row (verifier-opened) had read "four" against "five" without the word. |
| E2-42 (exec 2) | conceded R6-2, narrowed in place | keeps 3 (§3) |
| E2-28 (exec 2) | conceded R6-3 | refuted (§3) |
| E2-52, E2-45, E2-33, E2-36, E2-47 (exec 2) | one sentence or one arm withdrawn under each; mechanism and core unchanged | **no change** — in every case the phase-1 ruling had already scored the core and noted the arm now withdrawn (E2-45's 5xx inversion, E2-33's ordinary-path arm which is why it sits at Minor, E2-36's socket-down bound, E2-47's zero-caller measurement, E2-52's screen-reader-only status). |
| exec 1: boundary 1 of its coverage narrowed (signed-in routes painted on `:3041` in phase 2); P-findings' WHY clauses narrowed; one row over-count corrected | narrowings of coverage and of defence paragraphs | no score effect; the narrowed coverage is wider and more honest, which is what the tiebreaker would weigh had the UI pair tied |
| exec 4: two counts in a WHAT-WOULD-HAVE-BEEN-BETTER paragraph corrected; one attribution slip corrected | corrections | no score effect |
| exec 6: E6-14's headline interval narrowed on exec 3's measurement, by a dated paragraph | correction | no score effect (E6-14 stays a valid Minor; its second clause holds) |

## 5. Phase-2 findings — nine filed, nine valid, scored at half

| id | lane | claimed | judged | pts | what the judge opened |
|---|---|---|---|---|---|
| **E6-26** | exec 6 | Minor | Minor | 0.5 | `proj_rollups` has 0 SQL readers outside its projection (every hit outside `projections/rollups.ts` is a comment; control `FROM proj_tickets` → 15 files); `getRollup(` has 0 callers beyond its definition at `rollups.ts:133`; `Features.md:408` *"Nothing reads it yet"*; `visibility/rollup.ts:79-96` chose the enumeration over the table |
| **E3-30** | exec 3 | Important | **Minor** | 0.5 | `test-cases/06-auth-visibility.md:116` 6.83 ❌; `test/read/ticket-cards.test.ts:507` `it('MEASURES case 6.83 …')`; `test-cases/07-api-realtime-search.md:101` 7.78 ✅; `visibility/rollup.ts:82-85`. Judged Minor: a stale `test-cases/` marker was Minor in phase 1 (E3-20…24, E6-12) and the same class cannot score Important on the same day |
| **E3-31** | exec 3 | Minor | Minor | 0.5 | `test-cases/06:97` 6.57 ❌ conditions on a cross-project reparent; `packages/rule-engine/src/checks/hierarchy.ts:125` and `:274` `refuse('hierarchy.cross-project')`; `projectId` in `ticket-events.ts` → `:43` only |
| **E3-32** | exec 3 | Important | Important | 1.5 | `check-permission.ts:531-533` *"NOT CLOSED, because it does not exist yet: `POST /v1/sync`"*; `sync-routes.ts:490-491` `app.post('/v1/sync'`; `sync-service.ts:370` `ingestClientBatch`; `sync-route.test.ts:14` imports `SERVER_ORIGIN_REASON`. The class of E3-1 (Important in round 1): a security gate's own record declares a built, gated, tested door open and unbuilt |
| **E3-33** | exec 3 | Minor | Minor | 0.5 | `proj-projects.ts:29-30` *"`proj_ticket_types` does not exist yet … immediately after `proj_workflows`"*; `projections/index.ts:65-75` registers workflows → ticket-types → projects |
| **E3-34** | exec 3 | Minor | Minor | 0.5 | `projections/tickets.ts:483-484`, `:496` assert the gap; `can-see.ts:140-142`, `:227-234` (no row → `null` → `false`); `check-permission.ts:1048-1050` refuses; `check-role-permission.test.ts:942-948` *"which the visibility check now refuses"* |
| **P35** | exec 1 | Minor | Minor | 0.5 | `packages/ui/src/ui.css:3427-3434` `.gn-timeline__nav` declares no `border`; `:3532`, `:3585` the siblings' `border: none`; `globals.css:84` `button { font: inherit; }` the only top-level button rule; `timeline-view.tsx:236,:248,:255` |
| **P36** | exec 1 | Minor | Minor | 0.5 | `settings/workflows/page.tsx:25` `<h1>Workflows</h1>` over `workflow-list-screen.tsx:206` `<h2>Workflows</h2>`; `settings/ticket-types/page.tsx:20` over `ticket-type-list-screen.tsx:334` |
| **E5-44** | exec 5 | Important | Important | **3** (not half — §2, §4) | the refiled core of E5-21 |

Each phase-2 id was confirmed **absent** from its branch at the phase-1 sha and present at the close sha (`git grep -c <id> <sha> -- docs/lanes/<report>`, with the close sha as the positive control), so none was in the phase-1 count.

## 6. Standings

| pair | lane | phase 1 | phase-2 movement | **final** |
|---|---|---|---|---|
| UI | exec 1 · DeepSeek-authored, Opus-defended | 69 | +0.5 P35, +0.5 P36 | **70** |
| UI | **exec 4 · Opus** | 72 | — | **72** ✔ |
| UX | **exec 2 · DeepSeek-authored, Opus-defended** | 115 | −1 E2-28 moved, −3 penalty, −1 E2-50 withdrawn | **110** ✔ |
| UX | exec 5 · Opus | 101 | −3 E5-21 withdrawn, +3 E5-44 | **101** |
| FUNC | exec 3 · DeepSeek-authored, Opus-defended | 41 | +3.5 (E3-30…34) | **44.5** |
| FUNC | **exec 6 · Opus** | 53 | +1 R6-3, +0.5 E6-26 | **54.5** ✔ |

Per-lane totals are `sum(points) + sum(penalty)` over the ledger rows of that lane; the ledger is the computation (`awk -F'\t' 'NR>1{t[$2]+=$5+$7} END{for(l in t) print l, t[l]}' docs/lanes/review-scores.tsv`). Rulings per lane: exec 1 39 · exec 2 57 · exec 3 34 · exec 4 36 · exec 5 44 · exec 6 29 = 239.

**No pair tied, so the coverage tiebreaker was not drawn.** For the record: the UI pair is decided by two points. exec 1's stated coverage widened in phase 2 (its boundary 1 narrowed: signed-in routes painted on exec 4's `next dev` at `:3041`, the instrument its phase-2 paragraphs name); exec 4's measurements are painted on that same server of its own. Had the pair tied, the judge would have had to weigh the two reports' coverage sections against each other; it did not come to that.

## 7. Fairness — what the owner asked the judge to watch

*"be fair and dont side with opus coz you're from the same family."* Three things a reader can check:
1. **The phase-1 policy that cost Opus lanes the most was the no-upward-regrade rule.** Verifiers would have raised E4-32…36, E5-34, E6-15, E2-22, E2-34; the rule was applied to every lane alike, and it bound the DeepSeek-authored lanes too (E2-22, E2-34).
2. **The one refutation upheld cost a DeepSeek-authored lane 4 points and the losing Opus lane's refutation of another DeepSeek-authored finding was scored the same way** (PARTIAL, nothing moves) as its refutation of the Opus lane's twin. The judge's own phase-1 mechanism was corrected by an Opus lane (exec 6); the correction is recorded against the judge, not traded for points.
3. **The UX pair is won by the DeepSeek-authored report** (110 to 101) on the same rules that gave the other two pairs to Opus. Phase 2 was Opus on both sides of every pair (the DeepSeek sessions died at 14:57 on `402 Insufficient Balance`; the owner ordered lanes 1–3 onto Opus for phase 2 at 15:05:23), so the defences, withdrawals and phase-2 findings of exec 1/2/3 were written by Opus successors defending a DeepSeek-authored position. The *authorship* of the phase-1 findings — the bulk of every score — is the thing the competition measured, and that authorship is what the table above attributes.

Zero INVALID phase-1 findings and one upheld refutation in phase 2 means the ×3 penalty was drawn exactly once in the round, against E2-28.

## 8. What happens now

- **The losers are ended** (rules §1; owner: *"the ones who loses dies"*): exec 1 (`gisik:1`, worktree `gisik-nokma-exec`), exec 5 (`gisik:5`, `gisik-nokma-exec5`), exec 3 (`gisik:3`, `gisik-nokma-exec3`). Sessions killed, worktrees retired, **branches kept** (`exec1/review-ui-r2`, `exec5/review-ux`, `exec3/review-functionality-r2`) — their reports are on `main` in this landing. The controller records the act in the next anchor after this PR merges, not before.
- **The winners stand** as the executor for their concern: exec 4 (UI), exec 2 (UX), exec 6 (functionality). **No lane has next work**: the round produced findings, not tasks, and which findings become work is the owner's call (cycle 35 §3 still binds).
- The **coverage gaps** the round-1 compilation named are narrower but not closed: exec 6's report cites `packages/rule-engine`, `packages/mcp-server`, `packages/sync-client` and `packages/domain` (15, 5, 12 and 11 mentions; its §1 enumerates its universe), where exec 3 had zero findings in round 1; `apps/mobile` and `apps/desktop` are cited at source by exec 2, 4, 5 and 6 — whether either shell was painted is stated in each report's coverage section, not here.

## 9. Where the evidence is

`docs/lanes/review-scores.tsv` (239 rows; `== gisik-nokma-lanes/judge-2026-09-21/ledger.tsv`); the six reports and six refutation files beside this file at the phase-2 close shas; `gisik-nokma-lanes/judge-2026-09-21/` — `T0.txt` (T0, both close records, twelve shas), `results/chunk01..32.tsv` (phase-1 verifier rows), `chunks/`, `index.tsv`, `manifest.json`, `p1-exec{1..6}.md` (the phase-1 frozen reports, sha256-verified in cycle 40), `gate/`. The phase-2 judging session's scratchpad: `/private/tmp/claude-501/-Users-kiro-my-projects-gisik-nokma/b4377ea6-e77d-45ab-a76d-064bf915783c/scratchpad/` (`ledger.py` — the exact amendment and the thirteen rows as applied; `close-at-1705.log`).
